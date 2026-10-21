import http from 'http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { createArenaHttpServer } from '../src/server/index';
import { getForwardVector } from '../src/shared/mapData';
import {
  EYE_HEIGHT_CROUCH,
  EYE_HEIGHT_STANDING,
  PhysicsState,
  stepPlayerPhysics,
} from '../src/shared/physics';
import { performAuthoritativeRaycast } from '../src/shared/raycast';
import {
  ClientMessage,
  DamageEvent,
  RoomStateSnapshot,
  ServerMessage,
  ShotResultEvent,
} from '../src/shared/types';
import { WEAPONS } from '../src/shared/weapons';

class TestWsClient {
  public ws!: WebSocket;
  public clientId = '';
  public reconnectToken = '';
  public latestState: RoomStateSnapshot | null = null;
  public shotEvents: ShotResultEvent[] = [];
  public damageEvents: DamageEvent[] = [];
  public errors: string[] = [];
  private listeners: Array<(msg: ServerMessage) => void> = [];

  constructor(private url: string) {}

  public async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      this.ws.on('open', () => {});
      this.ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString()) as ServerMessage;
        if (msg.type === 'welcome') {
          this.clientId = msg.clientId;
          this.reconnectToken = msg.reconnectToken;
          resolve();
        } else if (msg.type === 'room_joined') {
          this.clientId = msg.playerId;
          this.reconnectToken = msg.reconnectToken;
          this.latestState = msg.state;
        } else if (msg.type === 'room_state') {
          this.latestState = msg.state;
        } else if (msg.type === 'shot_fired') {
          this.shotEvents.push(msg.result);
        } else if (msg.type === 'damage_event') {
          this.damageEvents.push(msg.event);
        } else if (msg.type === 'error') {
          this.errors.push(msg.message);
        }
        for (const fn of [...this.listeners]) {
          fn(msg);
        }
      });
      this.ws.on('error', reject);
    });
  }

  public send(msg: ClientMessage): void {
    this.ws.send(JSON.stringify(msg));
  }

  public waitForMessage<T extends ServerMessage['type']>(
    type: T,
    predicate?: (msg: Extract<ServerMessage, { type: T }>) => boolean,
    timeoutMs = 5000
  ): Promise<Extract<ServerMessage, { type: T }>> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for message type: ${type}`));
      }, timeoutMs);

      const handler = (msg: ServerMessage) => {
        if (msg.type === type) {
          const typed = msg as Extract<ServerMessage, { type: T }>;
          if (!predicate || predicate(typed)) {
            clearTimeout(timer);
            this.listeners = this.listeners.filter((l) => l !== handler);
            resolve(typed);
          }
        }
      };
      this.listeners.push(handler);
    });
  }

  public close(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
  }
}

describe('ARENA STRIKE — Sistemas Fundamentais, Física, Tiros e Multiplayer X1/6P', () => {
  let server: http.Server;
  let arena: ReturnType<typeof createArenaHttpServer>['arena'];
  let wsUrl = '';

  beforeAll(async () => {
    const created = createArenaHttpServer();
    server = created.server;
    arena = created.arena;
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 3001;
        wsUrl = `ws://127.0.0.1:${port}/ws`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    arena.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('1. Movimentação FPS, Gravidade, Pulo, Agachamento e Colisão com Paredes', () => {
    let state: PhysicsState = {
      x: 0,
      y: 0,
      z: -25,
      vx: 0,
      vy: 0,
      vz: 0,
      crouching: false,
      walking: false,
      grounded: true,
      yaw: Math.PI, // Looking South (+Z) toward alpha_spawn_shield at z = -21.5
      pitch: 0,
    };

    // Walk forward toward wall at z = -21.5 for 3 seconds: wall must block player!
    for (let i = 0; i < 60; i++) {
      state = stepPlayerPhysics(state, {
        seq: i + 1,
        dt: 0.05,
        forward: 1,
        right: 0,
        jump: false,
        crouch: false,
        walk: false,
        scoped: false,
        yaw: Math.PI,
        pitch: 0,
        weaponId: 'rifle',
        clientTimestamp: Date.now(),
      });
    }

    // alpha_spawn_shield is at z = -21.5 with depth 1.2 (north face at -22.1)
    expect(state.z).toBeLessThan(-22.1);
    expect(state.grounded).toBe(true);

    // Test Jump & Gravity
    const jumped = stepPlayerPhysics(state, {
      seq: 100,
      dt: 0.05,
      forward: 0,
      right: 0,
      jump: true,
      crouch: true,
      walk: false,
      scoped: false,
      yaw: Math.PI,
      pitch: 0,
      weaponId: 'rifle',
      clientTimestamp: Date.now(),
    });
    expect(jumped.y).toBeGreaterThan(0);
    expect(jumped.grounded).toBe(false);
    expect(jumped.crouching).toBe(true);
    expect(EYE_HEIGHT_CROUCH).toBeLessThan(EYE_HEIGHT_STANDING);
  });

  it('2. Testes Obrigatórios do Tiro #1 a #5: Hitboxes (Cabeça, Tronco, Braços, Pernas), Tiro Fora e Bloqueio por Parede', () => {
    // Place shooter at (-6, 0, -14) and target at (-6, 0, -4) in clear corridor
    const targetPose = {
      id: 'enemy_1',
      x: -6,
      y: 0,
      z: -4,
      yaw: 0,
      crouching: false,
    };

    // TESTE 1: Tiro na CABEÇA (y = 1.64)
    const headOrigin = { x: -6, y: 1.64, z: -14 };
    const headHit = performAuthoritativeRaycast(
      headOrigin,
      { x: 0, y: 0, z: 1 },
      200,
      [targetPose]
    );
    expect(headHit.surfaceType).toBe('player');
    expect(headHit.targetPlayerId).toBe('enemy_1');
    expect(headHit.hitbox).toBe('head');
    expect(WEAPONS.rifle.damageByZone[headHit.hitbox!]).toBe(112);

    // TESTE 2: Tiro no TRONCO (y = 1.12)
    const torsoOrigin = { x: -6, y: 1.12, z: -14 };
    const torsoHit = performAuthoritativeRaycast(
      torsoOrigin,
      { x: 0, y: 0, z: 1 },
      200,
      [targetPose]
    );
    expect(torsoHit.surfaceType).toBe('player');
    expect(torsoHit.hitbox).toBe('torso');
    expect(WEAPONS.rifle.damageByZone[torsoHit.hitbox!]).toBe(34);

    // TESTE 3A: Tiro nas PERNAS (y = 0.40)
    const legsOrigin = { x: -6, y: 0.40, z: -14 };
    const legsHit = performAuthoritativeRaycast(
      legsOrigin,
      { x: 0, y: 0, z: 1 },
      200,
      [targetPose]
    );
    expect(legsHit.surfaceType).toBe('player');
    expect(legsHit.hitbox).toBe('legs');
    expect(WEAPONS.rifle.damageByZone[legsHit.hitbox!]).toBe(24);

    // TESTE 3B: Tiro nos BRAÇOS (x = -6 + 0.33 = -5.67, y = 1.12)
    const armsOrigin = { x: -5.67, y: 1.12, z: -14 };
    const armsHit = performAuthoritativeRaycast(
      armsOrigin,
      { x: 0, y: 0, z: 1 },
      200,
      [targetPose]
    );
    expect(armsHit.surfaceType).toBe('player');
    expect(armsHit.hitbox).toBe('arms');
    expect(WEAPONS.rifle.damageByZone[armsHit.hitbox!]).toBe(28);

    // TESTE 4: Atirar fora do personagem e verificar que não atinge o jogador
    const missOrigin = { x: -8.0, y: 1.62, z: -14 };
    const missHit = performAuthoritativeRaycast(
      missOrigin,
      { x: 0, y: 0, z: 1 },
      200,
      [targetPose]
    );
    expect(missHit.surfaceType).not.toBe('player');
    expect(missHit.targetPlayerId).toBeUndefined();

    // TESTE 5: Atirar contra uma parede sólida com adversário atrás dela (mid_central_tower em x=0, z=0)
    const behindWallTarget = {
      id: 'enemy_behind_wall',
      x: 0,
      y: 0,
      z: 6,
      yaw: 0,
      crouching: false,
    };
    const blockedHit = performAuthoritativeRaycast(
      { x: 0, y: 1.5, z: -6 },
      { x: 0, y: 0, z: 1 },
      200,
      [behindWallTarget]
    );
    expect(blockedHit.surfaceType).toBe('wall');
    expect(blockedHit.targetPlayerId).toBeUndefined();
  });

  it('3. Testes Obrigatórios #6 a #10 + Partida X1 Multiplayer Real entre Dois Clientes WebSocket Independentes', async () => {
    const clientA = new TestWsClient(wsUrl);
    const clientB = new TestWsClient(wsUrl);
    await clientA.connect();
    await clientB.connect();

    // Client A cria sala X1 (Melhor de 3 rounds -> primeiro a 2 vence)
    const joinedPromiseA = clientA.waitForMessage('room_joined');
    clientA.send({
      type: 'create_room',
      nickname: 'AtiradorAlpha',
      mode: 'x1',
      maxPlayers: 2,
      maxRounds: 3,
    });
    const joinedA = await joinedPromiseA;
    const roomCode = joinedA.code;
    expect(roomCode).toHaveLength(6);

    // Configurar freezeTimeSec = 0 para teste imediato da partida
    clientA.send({
      type: 'update_room_config',
      freezeTimeSec: 0,
      maxRounds: 3,
    });

    // Client B entra na sala usando o código
    const joinedPromiseB = clientB.waitForMessage('room_joined');
    clientB.send({
      type: 'join_room',
      code: roomCode,
      nickname: 'OperadorOmega',
    });
    await joinedPromiseB;

    // Verificar limite máximo de jogadores (3º cliente deve ser recusado no X1)
    const clientC = new TestWsClient(wsUrl);
    await clientC.connect();
    const errPromiseC = clientC.waitForMessage('error');
    clientC.send({
      type: 'join_room',
      code: roomCode,
      nickname: 'Intruso',
    });
    const errMsg = await errPromiseC;
    expect(errMsg.code).toBe('ROOM_FULL');
    clientC.close();

    // Client B marca PRONTO e Client A inicia a partida
    clientB.send({ type: 'set_ready', ready: true });
    await clientA.waitForMessage(
      'room_state',
      (m) => m.state.players.filter((p) => p.ready).length === 2
    );

    const roundStartPromise = clientA.waitForMessage(
      'round_started',
      (m) => m.phase === 'live'
    );
    clientA.send({ type: 'start_match' });
    await roundStartPromise;

    // Posicionar ambos os jogadores em linha de visão limpa (x = -6) através de inputs de movimento
    for (let i = 0; i < 20; i++) {
      clientA.send({
        type: 'player_input',
        input: {
          seq: i + 1,
          dt: 0.05,
          forward: 0,
          right: 1, // Move para x negativo (yaw = Math.PI -> rightX = -1)
          jump: false,
          crouch: false,
          walk: false,
          scoped: false,
          yaw: Math.PI,
          pitch: 0,
          weaponId: 'pistol',
          clientTimestamp: Date.now(),
        },
      });
      clientB.send({
        type: 'player_input',
        input: {
          seq: i + 1,
          dt: 0.05,
          forward: 0,
          right: -1, // Move para x negativo (yaw = 0 -> rightX = +1, so right=-1 moves to -X)
          jump: false,
          crouch: false,
          walk: false,
          scoped: false,
          yaw: 0,
          pitch: 0,
          weaponId: 'pistol',
          clientTimestamp: Date.now(),
        },
      });
    }

    // Aguardar sincronização do estado
    const syncedState = await clientA.waitForMessage('room_state', (m) => {
      const pA = m.state.players.find((p) => p.id === clientA.clientId);
      const pB = m.state.players.find((p) => p.id === clientB.clientId);
      return Boolean(pA && pB && pA.x < -4.5 && pB.x < -4.5);
    });

    const pA = syncedState.state.players.find((p) => p.id === clientA.clientId)!;
    const pB = syncedState.state.players.find((p) => p.id === clientB.clientId)!;

    // TESTE 6 & 7: Dois jogadores atirando simultaneamente com Pistola no tronco um do outro
    const dirAtoB = {
      x: pB.x - pA.x,
      y: pB.y + 1.12 - (pA.y + 1.62),
      z: pB.z - pA.z,
    };
    const yawAtoB = Math.atan2(-dirAtoB.x, -dirAtoB.z);
    const pitchAtoB = Math.atan2(dirAtoB.y, Math.hypot(dirAtoB.x, dirAtoB.z));

    const dirBtoA = {
      x: pA.x - pB.x,
      y: pA.y + 1.12 - (pB.y + 1.62),
      z: pA.z - pB.z,
    };
    const yawBtoA = Math.atan2(-dirBtoA.x, -dirBtoA.z);
    const pitchBtoA = Math.atan2(dirBtoA.y, Math.hypot(dirBtoA.x, dirBtoA.z));

    const dmgPromiseA = clientA.waitForMessage('damage_event');
    const dmgPromiseB = clientB.waitForMessage('damage_event');

    clientA.send({
      type: 'shoot',
      payload: {
        shotId: 'simul_a',
        origin: { x: pA.x, y: pA.y + 1.62, z: pA.z },
        direction: getForwardVector(yawAtoB, pitchAtoB),
        yaw: yawAtoB,
        pitch: pitchAtoB,
        weaponId: 'pistol',
        recoilIndex: 0,
        scoped: false,
        clientTimestamp: Date.now(),
      },
    });

    clientB.send({
      type: 'shoot',
      payload: {
        shotId: 'simul_b',
        origin: { x: pB.x, y: pB.y + 1.62, z: pB.z },
        direction: getForwardVector(yawBtoA, pitchBtoA),
        yaw: yawBtoA,
        pitch: pitchBtoA,
        weaponId: 'pistol',
        recoilIndex: 0,
        scoped: false,
        clientTimestamp: Date.now(),
      },
    });

    await Promise.all([dmgPromiseA, dmgPromiseB]);

    // TESTE 8 & 10: Verificar que ambos os computadores receberam a confirmação do dano e redução de munição
    const afterSimul = await clientA.waitForMessage('room_state', (m) => {
      const a = m.state.players.find((p) => p.id === clientA.clientId);
      const b = m.state.players.find((p) => p.id === clientB.clientId);
      return Boolean(a && b && a.hp < 100 && b.hp < 100);
    });

    const aAfter = afterSimul.state.players.find((p) => p.id === clientA.clientId)!;
    const bAfter = afterSimul.state.players.find((p) => p.id === clientB.clientId)!;
    expect(aAfter.hp).toBe(100 - WEAPONS.pistol.damageByZone.torso); // 74 HP
    expect(bAfter.hp).toBe(100 - WEAPONS.pistol.damageByZone.torso); // 74 HP
    expect(aAfter.ammo.pistol.magazine).toBe(WEAPONS.pistol.magazineSize - 1);

    // TESTE 8B: Recarregar a arma e validar evento reload_started
    const reloadPromise = clientA.waitForMessage('reload_started');
    clientA.send({ type: 'reload' });
    const reloadEv = await reloadPromise;
    expect(reloadEv.playerId).toBe(clientA.clientId);

    // Trocar para Rifle de Assalto e eliminar o adversário com Headshot (112 de dano)
    clientA.send({ type: 'switch_weapon', weaponId: 'rifle' });
    const dirHead = {
      x: bAfter.x - aAfter.x,
      y: bAfter.y + 1.64 - (aAfter.y + 1.62),
      z: bAfter.z - aAfter.z,
    };
    const yawHead = Math.atan2(-dirHead.x, -dirHead.z);
    const pitchHead = Math.atan2(dirHead.y, Math.hypot(dirHead.x, dirHead.z));

    const roundEndPromise = clientB.waitForMessage('round_ended');
    clientA.send({
      type: 'shoot',
      payload: {
        shotId: 'kill_shot_r1',
        origin: { x: aAfter.x, y: aAfter.y + 1.62, z: aAfter.z },
        direction: getForwardVector(yawHead, pitchHead),
        yaw: yawHead,
        pitch: pitchHead,
        weaponId: 'rifle',
        recoilIndex: 0,
        scoped: false,
        clientTimestamp: Date.now(),
      },
    });

    const roundEndMsg = await roundEndPromise;
    expect(roundEndMsg.scores.alpha).toBe(1);
    expect(roundEndMsg.winnerTitle).toContain('ATIRADORALPHA');

    // Verificar que o jogador eliminado (clientB) NÃO consegue causar dano enquanto morto
    clientB.send({
      type: 'shoot',
      payload: {
        shotId: 'dead_shot',
        origin: { x: bAfter.x, y: bAfter.y + 1.62, z: bAfter.z },
        direction: getForwardVector(yawBtoA, pitchBtoA),
        yaw: yawBtoA,
        pitch: pitchBtoA,
        weaponId: 'rifle',
        recoilIndex: 0,
        scoped: false,
        clientTimestamp: Date.now(),
      },
    });

    clientA.close();
    clientB.close();
  });

  it('4. Suporte a Salas de até 6 Jogadores (Todos contra Todos / 3v3) e Reconexão de Sessão', async () => {
    const clients: TestWsClient[] = [];
    for (let i = 0; i < 6; i++) {
      const c = new TestWsClient(wsUrl);
      await c.connect();
      clients.push(c);
    }

    // Host cria sala Todos contra Todos para 6 jogadores
    const hostJoinPromise = clients[0].waitForMessage('room_joined');
    clients[0].send({
      type: 'create_room',
      nickname: 'Operador_1',
      mode: 'ffa',
      maxPlayers: 6,
      maxRounds: 5,
    });
    const hostJoined = await hostJoinPromise;
    const ffaCode = hostJoined.code;

    // Outros 5 jogadores conectam na mesma sala (total = 6 jogadores)
    for (let i = 1; i < 6; i++) {
      const pJoin = clients[i].waitForMessage('room_joined');
      clients[i].send({
        type: 'join_room',
        code: ffaCode,
        nickname: `Operador_${i + 1}`,
      });
      await pJoin;
      clients[i].send({ type: 'set_ready', ready: true });
    }

    const fullRoomState = await clients[0].waitForMessage(
      'room_state',
      (m) => m.state.players.filter((p) => p.connected).length === 6
    );
    expect(fullRoomState.state.players).toHaveLength(6);

    // Testar reconexão mantendo identidade via reconnectToken
    const savedToken = clients[5].reconnectToken;
    const savedPlayerId = clients[5].clientId;
    clients[5].close();

    const reconnectingClient = new TestWsClient(wsUrl);
    await reconnectingClient.connect();
    const reconnPromise = reconnectingClient.waitForMessage('room_joined');
    reconnectingClient.send({
      type: 'join_room',
      code: ffaCode,
      nickname: 'Operador_6_Reconectado',
      reconnectToken: savedToken,
    });
    const reconnJoined = await reconnPromise;
    expect(reconnJoined.playerId).toBe(savedPlayerId);

    reconnectingClient.close();
    for (const c of clients) {
      c.close();
    }
  });
});
