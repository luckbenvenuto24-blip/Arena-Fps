import Peer, { DataConnection } from 'peerjs';
import { GameRoomCore } from '../shared/GameRoomCore';
import { ClientMessage, ServerMessage } from '../shared/types';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PEER_PREFIX = 'arena-strike-v2-room-';

function randomHex(len: number): string {
  let out = '';
  const chars = '0123456789abcdef';
  for (let i = 0; i < len; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
  ],
};

export class ArenaNetworkClient {
  private onMessage: (msg: ServerMessage) => void;
  private onStatusChange: (online: boolean, modeLabel: string) => void;

  private ws: WebSocket | null = null;
  private wsConnected = false;

  // Authoritative Host state (used when hosting via WebRTC / BroadcastChannel)
  private hostedRoom: GameRoomCore | null = null;
  private hostPeer: Peer | null = null;
  private hostBroadcastChannel: BroadcastChannel | null = null;
  private guestConnections: Map<string, DataConnection> = new Map();

  // Guest state (when joining a friend's room via WebRTC or BroadcastChannel)
  private guestPeer: Peer | null = null;
  private guestConn: DataConnection | null = null;
  private guestBroadcastChannel: BroadcastChannel | null = null;
  private activeTransport: 'ws' | 'host_p2p' | 'guest_p2p' | 'guest_bc' | 'none' = 'none';

  public clientId: string;
  public reconnectToken: string;
  private destroyed = false;

  constructor(
    onMessage: (msg: ServerMessage) => void,
    onStatusChange: (online: boolean, modeLabel: string) => void
  ) {
    this.onMessage = onMessage;
    this.onStatusChange = onStatusChange;

    this.clientId = 'op_' + randomHex(8);
    this.reconnectToken =
      sessionStorage.getItem('arena_strike_reconnect_token') || 'tok_' + randomHex(12);

    // Immediately welcome the local client so UI is ready with zero delay
    setTimeout(() => {
      if (this.destroyed) return;
      this.onMessage({
        type: 'welcome',
        clientId: this.clientId,
        reconnectToken: this.reconnectToken,
      });
      this.onStatusChange(true, 'MULTIPLAYER ONLINE PRONTO');
    }, 10);

    this.tryConnectDedicatedWs();
  }

  private tryConnectDedicatedWs(): void {
    if (this.destroyed || typeof window === 'undefined') return;

    const isLocal =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname.startsWith('192.168.') ||
      window.location.hostname.startsWith('10.');

    // On local dev (port 5173), connect directly to port 3001 to avoid Vite WS proxy ECONNABORTED
    const wsUrl =
      isLocal && window.location.port === '5173'
        ? `ws://${window.location.hostname}:3001/ws`
        : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

    try {
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.onopen = () => {
        if (this.destroyed) return;
        this.wsConnected = true;
        this.onStatusChange(true, 'SERVIDOR DEDICADO + P2P ONLINE');
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as ServerMessage;
          if (msg.type === 'welcome') {
            this.clientId = msg.clientId;
          }
          // If we are not currently in a P2P room, forward dedicated server messages
          if (
            this.activeTransport === 'ws' ||
            this.activeTransport === 'none' ||
            msg.type === 'room_list'
          ) {
            if (msg.type === 'room_joined') {
              this.activeTransport = 'ws';
            }
            this.onMessage(msg);
          }
        } catch {
          // Ignore malformed JSON
        }
      };

      ws.onclose = () => {
        this.wsConnected = false;
        if (!this.destroyed) {
          this.onStatusChange(true, 'MULTIPLAYER WEBRTC GLOBAL ATIVO');
        }
      };

      ws.onerror = () => {
        this.wsConnected = false;
      };
    } catch {
      this.wsConnected = false;
    }
  }

  public send(msg: ClientMessage): void {
    if (msg.type === 'create_room') {
      this.handleCreateRoom(msg);
      return;
    }

    if (msg.type === 'join_room') {
      this.handleJoinRoom(msg);
      return;
    }

    if (msg.type === 'leave_room') {
      this.cleanupP2P();
      if (this.wsConnected && this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(msg));
      }
      this.activeTransport = 'none';
      return;
    }

    // Route in-room messages to the active transport
    if (this.activeTransport === 'host_p2p' && this.hostedRoom) {
      this.processMessageOnHostedRoom(this.clientId, msg);
    } else if (this.activeTransport === 'guest_p2p' && this.guestConn?.open) {
      this.guestConn.send(msg);
    } else if (this.activeTransport === 'guest_bc' && this.guestBroadcastChannel) {
      this.guestBroadcastChannel.postMessage({
        fromPlayerId: this.clientId,
        reconnectToken: this.reconnectToken,
        msg,
      });
    } else if (this.wsConnected && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  /**
   * Creates an authoritative room hosted locally AND exposed globally over WebRTC (PeerJS)
   * + local BroadcastChannel, so it works 100% on Vercel, Netlify, GitHub Pages, or LAN!
   */
  private handleCreateRoom(msg: Extract<ClientMessage, { type: 'create_room' }>): void {
    this.cleanupP2P();

    const code = generateRoomCode();
    this.activeTransport = 'host_p2p';

    const room = new GameRoomCore(
      {
        code,
        roomName: msg.roomName || `Sala de ${msg.nickname || 'Operador'}`,
        mode: msg.mode || 'x1',
        maxPlayers: msg.maxPlayers || 2,
        maxRounds: msg.maxRounds || 9,
      },
      () => {}
    );
    this.hostedRoom = room;

    const token = msg.reconnectToken || this.reconnectToken;
    this.reconnectToken = token;

    const joinRes = room.addOrReconnectPlayer(
      this.clientId,
      msg.nickname || 'Operador',
      (serverMsg) => {
        this.onMessage(serverMsg);
      },
      token
    );

    if (joinRes.ok && joinRes.player) {
      this.onMessage({
        type: 'room_joined',
        code,
        playerId: this.clientId,
        reconnectToken: token,
        state: room.getStateSnapshot(),
      });
    }

    // 1. Setup BroadcastChannel for instant same-browser/same-PC multi-tab testing
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel(`arena_strike_bc_${code}`);
      this.hostBroadcastChannel = bc;
      bc.onmessage = (ev) => {
        const data = ev.data as {
          fromPlayerId: string;
          reconnectToken: string;
          msg: ClientMessage;
        };
        if (!data || !data.fromPlayerId || !data.msg || !this.hostedRoom) return;

        if (data.msg.type === 'join_room') {
          const res = this.hostedRoom.addOrReconnectPlayer(
            data.fromPlayerId,
            data.msg.nickname,
            (sMsg) => {
              bc.postMessage({ toPlayerId: data.fromPlayerId, sMsg });
            },
            data.reconnectToken || data.fromPlayerId
          );
          if (res.ok && res.player) {
            bc.postMessage({
              toPlayerId: data.fromPlayerId,
              sMsg: {
                type: 'room_joined',
                code,
                playerId: res.player.id,
                reconnectToken: data.reconnectToken || data.fromPlayerId,
                state: this.hostedRoom.getStateSnapshot(),
              } satisfies ServerMessage,
            });
          } else {
            bc.postMessage({
              toPlayerId: data.fromPlayerId,
              sMsg: {
                type: 'error',
                message: res.error || 'Não foi possível entrar na sala.',
              } satisfies ServerMessage,
            });
          }
        } else {
          this.processMessageOnHostedRoom(data.fromPlayerId, data.msg);
        }
      };
    }

    // 2. Setup PeerJS WebRTC Host for cross-computer Internet multiplayer
    try {
      const peer = new Peer(`${PEER_PREFIX}${code}`, {
        config: ICE_CONFIG,
      });
      this.hostPeer = peer;

      peer.on('connection', (conn) => {
        const guestId = 'op_' + randomHex(8);
        this.guestConnections.set(guestId, conn);

        conn.on('data', (raw) => {
          if (!this.hostedRoom) return;
          const clientMsg = raw as ClientMessage;
          if (!clientMsg || typeof clientMsg !== 'object') return;

          if (clientMsg.type === 'join_room') {
            const gToken = clientMsg.reconnectToken || guestId;
            const res = this.hostedRoom.addOrReconnectPlayer(
              guestId,
              clientMsg.nickname || 'Amigo',
              (sMsg) => {
                if (conn.open) {
                  conn.send(sMsg);
                }
              },
              gToken
            );

            if (res.ok && res.player) {
              conn.send({
                type: 'room_joined',
                code,
                playerId: res.player.id,
                reconnectToken: gToken,
                state: this.hostedRoom.getStateSnapshot(),
              } satisfies ServerMessage);
            } else {
              conn.send({
                type: 'error',
                message: res.error || 'Sala cheia ou indisponível.',
                code: 'ROOM_FULL',
              } satisfies ServerMessage);
            }
          } else {
            const existing =
              this.hostedRoom.findPlayerByReconnectToken(guestId) ||
              this.hostedRoom
                .getStateSnapshot()
                .players.find((p) => p.id === guestId);
            const resolvedId = existing ? existing.id : guestId;
            this.processMessageOnHostedRoom(resolvedId, clientMsg);
          }
        });

        conn.on('close', () => {
          this.guestConnections.delete(guestId);
          if (this.hostedRoom) {
            this.hostedRoom.handleDisconnect(guestId, false);
          }
        });
      });
    } catch {
      // PeerJS initialization fallback
    }
  }

  /**
   * Joins a room by 6-character code over BroadcastChannel (same PC), WebRTC PeerJS (Internet),
   * or Dedicated WebSocket server.
   */
  private handleJoinRoom(msg: Extract<ClientMessage, { type: 'join_room' }>): void {
    const cleanCode = (msg.code || '').trim().toUpperCase();
    if (!cleanCode) return;

    this.cleanupP2P();
    let joinedResolved = false;

    // 1. Try local BroadcastChannel first (resolves in < 30ms if room is in another tab on same PC)
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel(`arena_strike_bc_${cleanCode}`);
      this.guestBroadcastChannel = bc;
      bc.onmessage = (ev) => {
        const data = ev.data as { toPlayerId?: string; sMsg?: ServerMessage };
        if (data && data.toPlayerId === this.clientId && data.sMsg) {
          if (data.sMsg.type === 'room_joined') {
            joinedResolved = true;
            this.activeTransport = 'guest_bc';
            this.clientId = data.sMsg.playerId;
          }
          if (this.activeTransport === 'guest_bc' || data.sMsg.type === 'error') {
            this.onMessage(data.sMsg);
          }
        }
      };
      bc.postMessage({
        fromPlayerId: this.clientId,
        reconnectToken: this.reconnectToken,
        msg,
      });
    }

    // 2. Connect via Global WebRTC PeerJS (`arena-strike-v2-room-CODE`) over the internet!
    setTimeout(() => {
      if (joinedResolved || this.destroyed) return;

      try {
        const peer = new Peer({ config: ICE_CONFIG });
        this.guestPeer = peer;

        const timeout = setTimeout(() => {
          if (!joinedResolved) {
            // If dedicated WS is open, also try dedicated WS; otherwise report room not found
            if (this.wsConnected && this.ws?.readyState === WebSocket.OPEN) {
              this.ws.send(JSON.stringify(msg));
            } else {
              this.onMessage({
                type: 'error',
                message: `Não foi possível conectar à sala "${cleanCode}". Verifique se o código está correto e se o criador da sala está com o Lobby aberto.`,
              });
            }
          }
        }, 7000);

        peer.on('open', () => {
          if (joinedResolved || this.destroyed) {
            clearTimeout(timeout);
            return;
          }
          const conn = peer.connect(`${PEER_PREFIX}${cleanCode}`, {
            reliable: true,
          });
          this.guestConn = conn;

          conn.on('open', () => {
            if (joinedResolved) return;
            this.activeTransport = 'guest_p2p';
            conn.send(msg);
          });

          conn.on('data', (raw) => {
            const sMsg = raw as ServerMessage;
            if (!sMsg || typeof sMsg !== 'object') return;
            if (sMsg.type === 'room_joined') {
              joinedResolved = true;
              clearTimeout(timeout);
              this.activeTransport = 'guest_p2p';
              this.clientId = sMsg.playerId;
            }
            this.onMessage(sMsg);
          });

          conn.on('error', () => {
            if (!joinedResolved && this.wsConnected && this.ws?.readyState === WebSocket.OPEN) {
              clearTimeout(timeout);
              this.ws.send(JSON.stringify(msg));
            }
          });
        });

        peer.on('error', () => {
          clearTimeout(timeout);
          if (!joinedResolved) {
            if (this.wsConnected && this.ws?.readyState === WebSocket.OPEN) {
              this.ws.send(JSON.stringify(msg));
            } else {
              this.onMessage({
                type: 'error',
                message: `Sala "${cleanCode}" não encontrada ou inacessível no momento.`,
              });
            }
          }
        });
      } catch {
        if (this.wsConnected && this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify(msg));
        }
      }
    }, 60);
  }

  private processMessageOnHostedRoom(playerId: string, msg: ClientMessage): void {
    const room = this.hostedRoom;
    if (!room) return;

    switch (msg.type) {
      case 'set_ready':
        room.setPlayerReady(playerId, Boolean(msg.ready));
        break;
      case 'set_team':
        room.setPlayerTeam(playerId, msg.team);
        break;
      case 'update_room_config':
        room.updateConfig(playerId, msg);
        break;
      case 'start_match': {
        const res = room.startMatch(playerId);
        if (!res.ok && res.error) {
          this.onMessage({ type: 'error', message: res.error });
        }
        break;
      }
      case 'return_to_lobby':
        room.returnToLobby(playerId);
        break;
      case 'player_input':
        room.handlePlayerInput(playerId, msg.input);
        break;
      case 'shoot':
        room.handleShoot(playerId, msg.payload);
        break;
      case 'reload':
        room.handleReload(playerId);
        break;
      case 'switch_weapon':
        room.handleSwitchWeapon(playerId, msg.weaponId);
        break;
      case 'ping_check': {
        const rtt = Math.max(1, Date.now() - msg.clientTimestamp);
        room.updatePlayerPing(playerId, rtt);
        break;
      }
      case 'leave_room':
        room.handleDisconnect(playerId, true);
        break;
    }
  }

  private cleanupP2P(): void {
    if (this.hostedRoom) {
      this.hostedRoom.destroy();
      this.hostedRoom = null;
    }
    for (const c of this.guestConnections.values()) {
      try {
        c.close();
      } catch {
        // Ignore
      }
    }
    this.guestConnections.clear();
    if (this.hostPeer) {
      try {
        this.hostPeer.destroy();
      } catch {
        // Ignore
      }
      this.hostPeer = null;
    }
    if (this.hostBroadcastChannel) {
      this.hostBroadcastChannel.close();
      this.hostBroadcastChannel = null;
    }
    if (this.guestConn) {
      try {
        this.guestConn.close();
      } catch {
        // Ignore
      }
      this.guestConn = null;
    }
    if (this.guestPeer) {
      try {
        this.guestPeer.destroy();
      } catch {
        // Ignore
      }
      this.guestPeer = null;
    }
    if (this.guestBroadcastChannel) {
      this.guestBroadcastChannel.close();
      this.guestBroadcastChannel = null;
    }
  }

  public close(): void {
    this.destroyed = true;
    this.cleanupP2P();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
