import { randomBytes } from 'crypto';
import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import {
  ClientMessage,
  GameMode,
  PublicRoomSummary,
  ServerMessage,
} from '../shared/types';
import { GameRoom } from './GameRoom';

interface ConnectedClient {
  id: string;
  ws: WebSocket;
  reconnectToken: string;
  roomCode: string | null;
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class ArenaServer {
  private rooms: Map<string, GameRoom> = new Map();
  private clients: Map<WebSocket, ConnectedClient> = new Map();
  private wss: WebSocketServer;

  constructor(httpServer: http.Server) {
    this.wss = new WebSocketServer({ server: httpServer, path: '/ws' });
    this.wss.on('connection', (ws) => this.handleConnection(ws));
  }

  private generateRoomCode(): string {
    for (let attempt = 0; attempt < 50; attempt++) {
      let code = '';
      for (let i = 0; i < 6; i++) {
        code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      }
      if (!this.rooms.has(code)) {
        return code;
      }
    }
    return randomBytes(3).toString('hex').toUpperCase();
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  public getPublicRoomList(): PublicRoomSummary[] {
    const list: PublicRoomSummary[] = [];
    for (const room of this.rooms.values()) {
      if (room.getConnectedCount() > 0) {
        list.push(room.getPublicSummary());
      }
    }
    return list;
  }

  public getRoom(code: string): GameRoom | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  private handleConnection(ws: WebSocket): void {
    const clientId = 'op_' + randomBytes(5).toString('hex');
    const reconnectToken = 'tok_' + randomBytes(8).toString('hex');

    const client: ConnectedClient = {
      id: clientId,
      ws,
      reconnectToken,
      roomCode: null,
    };
    this.clients.set(ws, client);

    this.send(ws, {
      type: 'welcome',
      clientId,
      reconnectToken,
    });

    this.send(ws, {
      type: 'room_list',
      rooms: this.getPublicRoomList(),
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as ClientMessage;
        this.handleClientMessage(client, msg);
      } catch {
        this.send(ws, { type: 'error', message: 'Formato de mensagem inválido.' });
      }
    });

    ws.on('close', () => {
      this.handleDisconnect(client, false);
      this.clients.delete(ws);
    });

    ws.on('error', () => {
      this.handleDisconnect(client, false);
      this.clients.delete(ws);
    });
  }

  private handleDisconnect(client: ConnectedClient, immediateLeave: boolean): void {
    if (!client.roomCode) return;
    const room = this.rooms.get(client.roomCode);
    if (room) {
      room.handleDisconnect(client.id, immediateLeave);
    }
    client.roomCode = null;
  }

  private handleClientMessage(client: ConnectedClient, msg: ClientMessage): void {
    switch (msg.type) {
      case 'list_rooms': {
        this.send(client.ws, {
          type: 'room_list',
          rooms: this.getPublicRoomList(),
        });
        break;
      }

      case 'create_room': {
        if (client.roomCode) {
          this.handleDisconnect(client, true);
        }
        const code = this.generateRoomCode();
        const mode: GameMode = msg.mode || 'x1';
        const room = new GameRoom(
          {
            code,
            roomName: msg.roomName || `Sala de ${msg.nickname || 'Operador'}`,
            mode,
            maxPlayers: msg.maxPlayers || 2,
            maxRounds: msg.maxRounds || 9,
          },
          (emptyCode) => {
            this.rooms.delete(emptyCode);
          }
        );

        this.rooms.set(code, room);
        const token = msg.reconnectToken || client.reconnectToken;
        client.reconnectToken = token;

        const joinRes = room.addOrReconnectWsPlayer(client.id, msg.nickname, client.ws, token);
        if (!joinRes.ok || !joinRes.player) {
          this.send(client.ws, {
            type: 'error',
            message: joinRes.error || 'Erro ao criar a sala.',
          });
          return;
        }

        client.id = joinRes.player.id;
        client.roomCode = code;

        this.send(client.ws, {
          type: 'room_joined',
          code,
          playerId: client.id,
          reconnectToken: token,
          state: room.getStateSnapshot(),
        });
        break;
      }

      case 'join_room': {
        const cleanCode = (msg.code || '').trim().toUpperCase();
        const room = this.rooms.get(cleanCode);
        if (!room) {
          this.send(client.ws, {
            type: 'error',
            message: `Sala "${cleanCode}" não encontrada. Verifique o código informado.`,
            code: 'ROOM_NOT_FOUND',
          });
          return;
        }

        if (client.roomCode && client.roomCode !== cleanCode) {
          this.handleDisconnect(client, true);
        }

        const token = msg.reconnectToken || client.reconnectToken;
        client.reconnectToken = token;

        const joinRes = room.addOrReconnectWsPlayer(client.id, msg.nickname, client.ws, token);
        if (!joinRes.ok || !joinRes.player) {
          this.send(client.ws, {
            type: 'error',
            message: joinRes.error || 'Não foi possível entrar na sala.',
            code: 'ROOM_FULL',
          });
          return;
        }

        client.id = joinRes.player.id;
        client.roomCode = cleanCode;

        this.send(client.ws, {
          type: 'room_joined',
          code: cleanCode,
          playerId: client.id,
          reconnectToken: token,
          state: room.getStateSnapshot(),
        });
        break;
      }

      case 'leave_room': {
        this.handleDisconnect(client, true);
        this.send(client.ws, {
          type: 'room_list',
          rooms: this.getPublicRoomList(),
        });
        break;
      }

      case 'set_ready': {
        if (!client.roomCode) return;
        const room = this.rooms.get(client.roomCode);
        if (room) {
          room.setPlayerReady(client.id, Boolean(msg.ready));
        }
        break;
      }

      case 'set_team': {
        if (!client.roomCode) return;
        const room = this.rooms.get(client.roomCode);
        if (room) {
          room.setPlayerTeam(client.id, msg.team);
        }
        break;
      }

      case 'update_room_config': {
        if (!client.roomCode) return;
        const room = this.rooms.get(client.roomCode);
        if (room) {
          room.updateConfig(client.id, msg);
        }
        break;
      }

      case 'start_match': {
        if (!client.roomCode) return;
        const room = this.rooms.get(client.roomCode);
        if (room) {
          const res = room.startMatch(client.id);
          if (!res.ok && res.error) {
            this.send(client.ws, { type: 'error', message: res.error });
          }
        }
        break;
      }

      case 'return_to_lobby': {
        if (!client.roomCode) return;
        const room = this.rooms.get(client.roomCode);
        if (room) {
          room.returnToLobby(client.id);
        }
        break;
      }

      case 'player_input': {
        if (!client.roomCode || !msg.input) return;
        const room = this.rooms.get(client.roomCode);
        if (room) {
          room.handlePlayerInput(client.id, msg.input);
        }
        break;
      }

      case 'shoot': {
        if (!client.roomCode || !msg.payload) return;
        const room = this.rooms.get(client.roomCode);
        if (room) {
          room.handleShoot(client.id, msg.payload);
        }
        break;
      }

      case 'reload': {
        if (!client.roomCode) return;
        const room = this.rooms.get(client.roomCode);
        if (room) {
          room.handleReload(client.id);
        }
        break;
      }

      case 'switch_weapon': {
        if (!client.roomCode || !msg.weaponId) return;
        const room = this.rooms.get(client.roomCode);
        if (room) {
          room.handleSwitchWeapon(client.id, msg.weaponId);
        }
        break;
      }

      case 'ping_check': {
        const now = Date.now();
        if (client.roomCode && msg.clientTimestamp) {
          const room = this.rooms.get(client.roomCode);
          if (room) {
            const rtt = Math.max(1, now - msg.clientTimestamp);
            room.updatePlayerPing(client.id, rtt);
          }
        }
        this.send(client.ws, {
          type: 'pong_check',
          clientTimestamp: msg.clientTimestamp,
          serverTimestamp: now,
        });
        break;
      }
    }
  }

  public close(): void {
    for (const room of this.rooms.values()) {
      room.destroy();
    }
    this.rooms.clear();
    for (const ws of this.clients.keys()) {
      try {
        ws.terminate();
      } catch {
        // Ignore
      }
    }
    this.clients.clear();
    this.wss.close();
  }
}
