import {
  ALPHA_SPAWNS,
  FFA_SPAWNS,
  getForwardVector,
  OMEGA_SPAWNS,
  SpawnPoint,
} from './mapData';
import {
  computePlayerAnimState,
  getPlayerEyeHeight,
  isPositionColliding,
  PLAYER_RADIUS,
  stepPlayerPhysics,
} from './physics';
import { performAuthoritativeRaycast, TargetPlayerHitboxPose } from './raycast';
import {
  DamageEvent,
  GameMode,
  InputPayload,
  KillFeedEntry,
  PlayerNetState,
  PublicRoomSummary,
  RoomScoreState,
  RoomStateSnapshot,
  RoundPhase,
  ServerMessage,
  ShootPayload,
  ShotResultEvent,
  TeamId,
  Vec3,
  WeaponId,
} from './types';
import { createInitialAmmoState, WEAPONS } from './weapons';

interface HistoricalPose {
  timestamp: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  crouching: boolean;
}

export interface InternalRoomPlayer extends PlayerNetState {
  send: ((msg: ServerMessage) => void) | null;
  reconnectToken: string;
  lastShotAt: number;
  lastInputAt: number;
  disconnectedAt: number | null;
  history: HistoricalPose[];
  damagedBy: Map<string, number>;
}

export interface RoomCoreOptions {
  code: string;
  roomName: string;
  mode: GameMode;
  maxPlayers: number;
  maxRounds: number;
  freezeTimeSec?: number;
  roundTimeSec?: number;
}

export class GameRoomCore {
  public readonly code: string;
  public roomName: string;
  public hostId: string = '';
  public mode: GameMode;
  public maxPlayers: number;
  public maxRounds: number;
  public roundsToWin: number;
  public freezeTimeSec: number;
  public roundTimeSec: number;
  public readonly roundEndDelaySec = 4;
  public mapId: string = 'setor_omega';

  public phase: RoundPhase = 'lobby';
  public roundNumber: number = 0;
  public phaseEndTime: number = 0;
  public scores: RoomScoreState = {
    alpha: 0,
    omega: 0,
    ffaScores: {},
  };
  public roundWinnerTitle: string = '';
  public roundWinnerSubtitle: string = '';
  public matchWinnerTitle: string = '';
  public matchWinnerSubtitle: string = '';
  public killFeed: KillFeedEntry[] = [];

  private players: Map<string, InternalRoomPlayer> = new Map();
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private onEmptyCallback: (code: string) => void;
  private nextColorIndex = 0;

  constructor(options: RoomCoreOptions, onEmpty: (code: string) => void) {
    this.code = options.code;
    this.roomName = options.roomName || `Arena ${options.code}`;
    this.mode = options.mode;
    this.maxPlayers = this.normalizeMaxPlayers(options.mode, options.maxPlayers);
    this.maxRounds = Math.max(1, Math.min(30, options.maxRounds || 9));
    this.roundsToWin = Math.floor(this.maxRounds / 2) + 1;
    this.freezeTimeSec = options.freezeTimeSec ?? 6;
    this.roundTimeSec = options.roundTimeSec ?? 90;
    this.onEmptyCallback = onEmpty;

    this.tickInterval = setInterval(() => this.updateTick(), 33);
  }

  private normalizeMaxPlayers(mode: GameMode, requested: number): number {
    if (mode === 'x1') return 2;
    if (mode === '2v2') return 4;
    if (mode === '3v3') return 6;
    return Math.max(2, Math.min(6, requested || 6));
  }

  public getConnectedCount(): number {
    let count = 0;
    for (const p of this.players.values()) {
      if (p.connected) count++;
    }
    return count;
  }

  public getPublicSummary(): PublicRoomSummary {
    const host = this.players.get(this.hostId);
    return {
      code: this.code,
      roomName: this.roomName,
      hostName: host ? host.nickname : 'Operador',
      mode: this.mode,
      playerCount: this.getConnectedCount(),
      maxPlayers: this.maxPlayers,
      phase: this.phase,
      mapId: this.mapId,
    };
  }

  public findPlayerByReconnectToken(token: string): InternalRoomPlayer | undefined {
    if (!token) return undefined;
    for (const p of this.players.values()) {
      if (p.reconnectToken === token) return p;
    }
    return undefined;
  }

  private pickBalancedTeam(): TeamId {
    if (this.mode === 'ffa') return 'ffa';
    let alphaCount = 0;
    let omegaCount = 0;
    for (const p of this.players.values()) {
      if (p.team === 'alpha') alphaCount++;
      else if (p.team === 'omega') omegaCount++;
    }
    return alphaCount <= omegaCount ? 'alpha' : 'omega';
  }

  public addOrReconnectPlayer(
    playerId: string,
    nickname: string,
    sendFn: (msg: ServerMessage) => void,
    reconnectToken: string
  ): { ok: boolean; error?: string; player?: InternalRoomPlayer } {
    const existing = this.findPlayerByReconnectToken(reconnectToken) || this.players.get(playerId);
    if (existing) {
      existing.send = sendFn;
      existing.connected = true;
      existing.disconnectedAt = null;
      if (nickname.trim()) {
        existing.nickname = nickname.trim().slice(0, 18);
      }
      this.broadcastState();
      return { ok: true, player: existing };
    }

    if (this.getConnectedCount() >= this.maxPlayers) {
      return { ok: false, error: 'A sala já atingiu o limite máximo de jogadores.' };
    }

    const cleanName = (nickname || 'Operador').trim().slice(0, 18) || 'Operador';
    const isFirst = this.players.size === 0;
    if (isFirst) {
      this.hostId = playerId;
    }

    const team = this.pickBalancedTeam();
    const spawn = this.getSpawnForPlayer(team, this.players.size);

    const newPlayer: InternalRoomPlayer = {
      id: playerId,
      nickname: cleanName,
      team,
      colorIndex: this.nextColorIndex++,
      ready: isFirst,
      connected: true,
      isHost: isFirst,
      ping: 12,
      x: spawn.x,
      y: spawn.y,
      z: spawn.z,
      vx: 0,
      vy: 0,
      vz: 0,
      yaw: spawn.yaw,
      pitch: 0,
      crouching: false,
      walking: false,
      grounded: true,
      scoped: false,
      reloading: false,
      reloadEndTime: 0,
      weaponId: 'rifle',
      ammo: createInitialAmmoState(),
      animState: 'idle',
      hp: 100,
      maxHp: 100,
      alive: this.phase === 'lobby',
      deathTime: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      headshots: 0,
      damageDealt: 0,
      lastProcessedInputSeq: 0,
      send: sendFn,
      reconnectToken,
      lastShotAt: 0,
      lastInputAt: Date.now(),
      disconnectedAt: null,
      history: [],
      damagedBy: new Map(),
    };

    if (this.scores.ffaScores[playerId] === undefined) {
      this.scores.ffaScores[playerId] = 0;
    }

    this.players.set(playerId, newPlayer);
    this.broadcastState();
    return { ok: true, player: newPlayer };
  }

  public handleDisconnect(playerId: string, immediateLeave = false): void {
    const player = this.players.get(playerId);
    if (!player) return;

    player.send = null;
    player.connected = false;
    player.disconnectedAt = Date.now();

    if (immediateLeave) {
      this.players.delete(playerId);
      delete this.scores.ffaScores[playerId];
    } else if (this.phase !== 'lobby' && player.alive) {
      player.alive = false;
      player.hp = 0;
      player.animState = 'dead';
      this.checkRoundWinConditions();
    }

    if (this.hostId === playerId) {
      let nextHostId = '';
      for (const p of this.players.values()) {
        if (p.connected) {
          nextHostId = p.id;
          break;
        }
      }
      if (nextHostId) {
        this.hostId = nextHostId;
        for (const p of this.players.values()) {
          p.isHost = p.id === this.hostId;
        }
      }
    }

    if (this.getConnectedCount() === 0 && immediateLeave) {
      this.destroy();
      return;
    }

    this.broadcastState();
  }

  public setPlayerReady(playerId: string, ready: boolean): void {
    const p = this.players.get(playerId);
    if (!p) return;
    p.ready = ready;
    this.broadcastState();
  }

  public setPlayerTeam(playerId: string, team: TeamId): void {
    if (this.phase !== 'lobby') return;
    const p = this.players.get(playerId);
    if (!p) return;
    if (this.mode === 'ffa') {
      p.team = 'ffa';
    } else if (team === 'alpha' || team === 'omega') {
      p.team = team;
    }
    this.broadcastState();
  }

  public updateConfig(
    playerId: string,
    config: {
      mode?: GameMode;
      maxPlayers?: number;
      maxRounds?: number;
      freezeTimeSec?: number;
      roundTimeSec?: number;
    }
  ): void {
    if (playerId !== this.hostId || this.phase !== 'lobby') return;

    if (config.mode) {
      this.mode = config.mode;
      this.maxPlayers = this.normalizeMaxPlayers(this.mode, config.maxPlayers ?? this.maxPlayers);
      let idx = 0;
      for (const p of this.players.values()) {
        if (this.mode === 'ffa') {
          p.team = 'ffa';
        } else {
          p.team = idx % 2 === 0 ? 'alpha' : 'omega';
        }
        idx++;
      }
    } else if (config.maxPlayers !== undefined) {
      this.maxPlayers = this.normalizeMaxPlayers(this.mode, config.maxPlayers);
    }

    if (config.maxRounds !== undefined) {
      this.maxRounds = Math.max(1, Math.min(30, config.maxRounds));
      this.roundsToWin = Math.floor(this.maxRounds / 2) + 1;
    }

    if (config.freezeTimeSec !== undefined) {
      this.freezeTimeSec = Math.max(0, Math.min(20, config.freezeTimeSec));
    }

    if (config.roundTimeSec !== undefined) {
      this.roundTimeSec = Math.max(15, Math.min(300, config.roundTimeSec));
    }

    this.broadcastState();
  }

  public canStartMatch(): { ok: boolean; reason?: string } {
    const connected = Array.from(this.players.values()).filter((p) => p.connected);
    if (connected.length < 2) {
      return { ok: false, reason: 'São necessários pelo menos 2 jogadores conectados para iniciar.' };
    }

    if (this.mode !== 'ffa') {
      const alphas = connected.filter((p) => p.team === 'alpha').length;
      const omegas = connected.filter((p) => p.team === 'omega').length;
      if (alphas === 0 || omegas === 0) {
        return { ok: false, reason: 'Ambas as equipes (Alpha e Omega) precisam ter pelo menos 1 jogador.' };
      }
    }

    const notReady = connected.filter((p) => !p.ready && p.id !== this.hostId);
    if (notReady.length > 0) {
      return { ok: false, reason: 'Aguardando todos os jogadores marcarem PRONTO.' };
    }

    return { ok: true };
  }

  public startMatch(requesterId: string): { ok: boolean; error?: string } {
    if (requesterId !== this.hostId && this.phase === 'lobby') {
      return { ok: false, error: 'Apenas o líder da sala pode iniciar a partida.' };
    }

    const check = this.canStartMatch();
    if (!check.ok) {
      return { ok: false, error: check.reason };
    }

    this.roundNumber = 0;
    this.scores = { alpha: 0, omega: 0, ffaScores: {} };
    this.killFeed = [];
    this.matchWinnerTitle = '';
    this.matchWinnerSubtitle = '';

    for (const p of this.players.values()) {
      p.kills = 0;
      p.deaths = 0;
      p.assists = 0;
      p.headshots = 0;
      p.damageDealt = 0;
      this.scores.ffaScores[p.id] = 0;
    }

    this.startNextRound();
    return { ok: true };
  }

  public returnToLobby(requesterId: string): void {
    if (requesterId !== this.hostId && this.phase !== 'match_end') return;
    this.phase = 'lobby';
    this.roundNumber = 0;
    this.roundWinnerTitle = '';
    this.roundWinnerSubtitle = '';
    this.matchWinnerTitle = '';
    this.matchWinnerSubtitle = '';
    this.killFeed = [];
    for (const [id, p] of this.players.entries()) {
      if (!p.connected) {
        this.players.delete(id);
      } else {
        p.ready = p.id === this.hostId;
        p.hp = 100;
        p.alive = true;
      }
    }
    this.broadcastState();
  }

  private getSpawnForPlayer(team: TeamId, slotIndex: number): SpawnPoint {
    if (this.mode === 'ffa' || team === 'ffa') {
      return FFA_SPAWNS[slotIndex % FFA_SPAWNS.length];
    }
    if (team === 'alpha') {
      return ALPHA_SPAWNS[slotIndex % ALPHA_SPAWNS.length];
    }
    return OMEGA_SPAWNS[slotIndex % OMEGA_SPAWNS.length];
  }

  public startNextRound(): void {
    this.roundNumber++;
    this.roundWinnerTitle = '';
    this.roundWinnerSubtitle = '';

    let alphaSlot = 0;
    let omegaSlot = 0;
    let ffaSlot = 0;

    for (const p of this.players.values()) {
      if (!p.connected) continue;
      let spawn: SpawnPoint;
      if (this.mode === 'ffa' || p.team === 'ffa') {
        spawn = this.getSpawnForPlayer('ffa', ffaSlot++);
      } else if (p.team === 'alpha') {
        spawn = this.getSpawnForPlayer('alpha', alphaSlot++);
      } else {
        spawn = this.getSpawnForPlayer('omega', omegaSlot++);
      }

      p.x = spawn.x;
      p.y = spawn.y;
      p.z = spawn.z;
      p.vx = 0;
      p.vy = 0;
      p.vz = 0;
      p.yaw = spawn.yaw;
      p.pitch = 0;
      p.crouching = false;
      p.walking = false;
      p.grounded = true;
      p.scoped = false;
      p.reloading = false;
      p.reloadEndTime = 0;
      p.hp = 100;
      p.maxHp = 100;
      p.alive = true;
      p.deathTime = 0;
      p.animState = 'idle';
      p.ammo = createInitialAmmoState();
      if (!p.weaponId || p.weaponId === 'knife') {
        p.weaponId = 'rifle';
      }
      p.damagedBy.clear();
      p.history = [
        {
          timestamp: Date.now(),
          x: p.x,
          y: p.y,
          z: p.z,
          yaw: p.yaw,
          crouching: p.crouching,
        },
      ];
    }

    if (this.freezeTimeSec > 0) {
      this.phase = 'freeze';
      this.phaseEndTime = Date.now() + this.freezeTimeSec * 1000;
    } else {
      this.phase = 'live';
      this.phaseEndTime = Date.now() + this.roundTimeSec * 1000;
    }

    this.broadcast({
      type: 'round_started',
      roundNumber: this.roundNumber,
      phase: this.phase,
    });
    this.broadcastState();
  }

  public handlePlayerInput(playerId: string, input: InputPayload): void {
    const p = this.players.get(playerId);
    if (!p || !p.connected) return;

    p.lastProcessedInputSeq = input.seq;
    p.lastInputAt = Date.now();

    if (!p.alive || this.phase === 'round_end' || this.phase === 'match_end') {
      return;
    }

    if (input.weaponId && WEAPONS[input.weaponId] && input.weaponId !== p.weaponId) {
      this.handleSwitchWeapon(playerId, input.weaponId);
    }

    const freezeMovement = this.phase === 'freeze';
    const nextPhys = stepPlayerPhysics(
      {
        x: p.x,
        y: p.y,
        z: p.z,
        vx: p.vx,
        vy: p.vy,
        vz: p.vz,
        crouching: p.crouching,
        walking: p.walking,
        grounded: p.grounded,
        yaw: p.yaw,
        pitch: p.pitch,
      },
      input,
      freezeMovement
    );

    p.x = nextPhys.x;
    p.y = nextPhys.y;
    p.z = nextPhys.z;
    p.vx = nextPhys.vx;
    p.vy = nextPhys.vy;
    p.vz = nextPhys.vz;
    p.crouching = nextPhys.crouching;
    p.walking = nextPhys.walking;
    p.grounded = nextPhys.grounded;
    p.yaw = nextPhys.yaw;
    p.pitch = nextPhys.pitch;
    p.scoped = Boolean(input.scoped);
    p.animState = computePlayerAnimState(
      p.alive,
      p.grounded,
      p.crouching,
      p.walking,
      p.vx,
      p.vz
    );

    this.recordPlayerHistory(p);
  }

  private recordPlayerHistory(p: InternalRoomPlayer): void {
    const now = Date.now();
    p.history.push({
      timestamp: now,
      x: p.x,
      y: p.y,
      z: p.z,
      yaw: p.yaw,
      crouching: p.crouching,
    });
    while (p.history.length > 2 && now - p.history[0].timestamp > 1000) {
      p.history.shift();
    }
  }

  private getLagCompensatedPose(target: InternalRoomPlayer, targetTimestamp: number): TargetPlayerHitboxPose {
    const hist = target.history;
    if (hist.length === 0) {
      return {
        id: target.id,
        x: target.x,
        y: target.y,
        z: target.z,
        yaw: target.yaw,
        crouching: target.crouching,
      };
    }

    if (targetTimestamp >= hist[hist.length - 1].timestamp) {
      return {
        id: target.id,
        x: target.x,
        y: target.y,
        z: target.z,
        yaw: target.yaw,
        crouching: target.crouching,
      };
    }

    if (targetTimestamp <= hist[0].timestamp) {
      const first = hist[0];
      return {
        id: target.id,
        x: first.x,
        y: first.y,
        z: first.z,
        yaw: first.yaw,
        crouching: first.crouching,
      };
    }

    for (let i = hist.length - 1; i >= 1; i--) {
      const newer = hist[i];
      const older = hist[i - 1];
      if (targetTimestamp >= older.timestamp && targetTimestamp <= newer.timestamp) {
        const span = newer.timestamp - older.timestamp;
        const t = span > 0 ? (targetTimestamp - older.timestamp) / span : 1;
        return {
          id: target.id,
          x: older.x + (newer.x - older.x) * t,
          y: older.y + (newer.y - older.y) * t,
          z: older.z + (newer.z - older.z) * t,
          yaw: newer.yaw,
          crouching: newer.crouching,
        };
      }
    }

    return {
      id: target.id,
      x: target.x,
      y: target.y,
      z: target.z,
      yaw: target.yaw,
      crouching: target.crouching,
    };
  }

  public handleReload(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p || !p.alive || this.phase !== 'live') return;

    const weapon = WEAPONS[p.weaponId];
    if (!weapon || weapon.melee) return;

    const ammoState = p.ammo[p.weaponId];
    if (p.reloading) return;
    if (ammoState.magazine >= weapon.magazineSize || ammoState.reserve <= 0) return;

    p.reloading = true;
    p.scoped = false;
    p.reloadEndTime = Date.now() + weapon.reloadTimeMs;

    this.broadcast({
      type: 'reload_started',
      playerId: p.id,
      weaponId: p.weaponId,
      durationMs: weapon.reloadTimeMs,
    });
  }

  public handleSwitchWeapon(playerId: string, weaponId: WeaponId): void {
    const p = this.players.get(playerId);
    if (!p || !p.alive || !WEAPONS[weaponId]) return;
    if (p.weaponId === weaponId) return;

    p.weaponId = weaponId;
    p.reloading = false;
    p.reloadEndTime = 0;
    p.scoped = false;
    p.lastShotAt = 0;

    this.broadcast({
      type: 'weapon_switched',
      playerId: p.id,
      weaponId,
    });
  }

  public handleShoot(playerId: string, payload: ShootPayload): void {
    const shooter = this.players.get(playerId);
    if (!shooter || !shooter.connected || !shooter.alive) return;
    if (this.phase !== 'live') return;

    const now = Date.now();
    if (shooter.reloading) {
      if (now >= shooter.reloadEndTime) {
        this.finishPlayerReload(shooter);
      } else {
        return;
      }
    }

    const weaponId = WEAPONS[payload.weaponId] ? payload.weaponId : shooter.weaponId;
    shooter.weaponId = weaponId;
    const weapon = WEAPONS[weaponId];

    if (now - shooter.lastShotAt < weapon.fireIntervalMs * 0.8) {
      return;
    }

    const ammoState = shooter.ammo[weaponId];
    if (!weapon.melee) {
      if (ammoState.magazine <= 0) {
        if (ammoState.reserve > 0) {
          this.handleReload(playerId);
        }
        return;
      }
      ammoState.magazine -= 1;
    }

    shooter.lastShotAt = now;
    shooter.yaw = payload.yaw;
    shooter.pitch = Math.max(-Math.PI * 0.485, Math.min(Math.PI * 0.485, payload.pitch));

    const authEye: Vec3 = {
      x: shooter.x,
      y: shooter.y + getPlayerEyeHeight(shooter.crouching),
      z: shooter.z,
    };

    let validOrigin = authEye;
    if (payload.origin) {
      const distSq =
        (payload.origin.x - authEye.x) ** 2 +
        (payload.origin.y - authEye.y) ** 2 +
        (payload.origin.z - authEye.z) ** 2;
      if (
        distSq <= 0.65 * 0.65 &&
        !isPositionColliding(
          payload.origin.x,
          shooter.y,
          payload.origin.z,
          shooter.crouching,
          PLAYER_RADIUS * 0.5
        )
      ) {
        validOrigin = payload.origin;
      }
    }

    const lookDir = getForwardVector(shooter.yaw, shooter.pitch);
    let shotDir = lookDir;
    if (payload.direction) {
      const len = Math.hypot(payload.direction.x, payload.direction.y, payload.direction.z);
      if (len > 1e-5) {
        const normDir = {
          x: payload.direction.x / len,
          y: payload.direction.y / len,
          z: payload.direction.z / len,
        };
        const dot = normDir.x * lookDir.x + normDir.y * lookDir.y + normDir.z * lookDir.z;
        if (dot >= 0.92) {
          shotDir = normDir;
        }
      }
    }

    const rewindDuration = Math.min(400, Math.max(0, shooter.ping * 0.5));
    const targetTimestamp = now - rewindDuration;

    const candidateTargets: TargetPlayerHitboxPose[] = [];
    for (const other of this.players.values()) {
      if (other.id === shooter.id) continue;
      if (!other.alive || other.hp <= 0) continue;
      if (this.mode !== 'ffa' && other.team === shooter.team) continue;

      candidateTargets.push(this.getLagCompensatedPose(other, targetTimestamp));
    }

    const rayOutcome = performAuthoritativeRaycast(
      validOrigin,
      shotDir,
      weapon.maxRange,
      candidateTargets
    );

    let damageApplied: number | undefined;
    let killed = false;
    let headshot = false;

    if (rayOutcome.surfaceType === 'player' && rayOutcome.targetPlayerId && rayOutcome.hitbox) {
      const victim = this.players.get(rayOutcome.targetPlayerId);
      if (victim && victim.alive) {
        const baseDamage = weapon.damageByZone[rayOutcome.hitbox];
        damageApplied = baseDamage;
        headshot = rayOutcome.hitbox === 'head';

        victim.hp = Math.max(0, victim.hp - damageApplied);
        shooter.damageDealt += damageApplied;
        victim.damagedBy.set(shooter.id, (victim.damagedBy.get(shooter.id) || 0) + damageApplied);

        if (victim.hp <= 0) {
          killed = true;
          victim.alive = false;
          victim.deathTime = now;
          victim.animState = 'dead';
          victim.reloading = false;
          victim.scoped = false;
          victim.deaths += 1;
          shooter.kills += 1;
          if (headshot) {
            shooter.headshots += 1;
          }

          for (const [assistantId, dmg] of victim.damagedBy.entries()) {
            if (assistantId !== shooter.id && dmg >= 35) {
              const assistant = this.players.get(assistantId);
              if (assistant) {
                assistant.assists += 1;
              }
            }
          }

          const killEntry: KillFeedEntry = {
            id: `${now}-${shooter.id}-${victim.id}`,
            killerId: shooter.id,
            killerName: shooter.nickname,
            killerTeam: shooter.team,
            victimId: victim.id,
            victimName: victim.nickname,
            victimTeam: victim.team,
            weaponId,
            headshot,
            timestamp: now,
          };
          this.killFeed.push(killEntry);
          if (this.killFeed.length > 8) {
            this.killFeed.shift();
          }
        }

        const dmgEvent: DamageEvent = {
          attackerId: shooter.id,
          attackerName: shooter.nickname,
          victimId: victim.id,
          victimName: victim.nickname,
          weaponId,
          hitbox: rayOutcome.hitbox,
          damage: damageApplied,
          headshot,
          killed,
          attackerPos: { x: shooter.x, y: shooter.y, z: shooter.z },
          victimHpAfter: victim.hp,
        };
        this.broadcast({
          type: 'damage_event',
          event: dmgEvent,
        });
      }
    }

    const shotResult: ShotResultEvent = {
      shotId: payload.shotId || `${now}`,
      shooterId: shooter.id,
      weaponId,
      origin: validOrigin,
      hitPoint: rayOutcome.hitPoint,
      hitNormal: rayOutcome.hitNormal,
      surfaceType: rayOutcome.surfaceType,
      targetPlayerId: rayOutcome.targetPlayerId,
      hitbox: rayOutcome.hitbox,
      damage: damageApplied,
      headshot,
      killed,
      remainingMagazine: ammoState.magazine,
      remainingReserve: ammoState.reserve,
    };

    this.broadcast({
      type: 'shot_fired',
      result: shotResult,
    });

    if (killed) {
      this.checkRoundWinConditions();
    }

    if (
      !weapon.melee &&
      ammoState.magazine === 0 &&
      ammoState.reserve > 0 &&
      shooter.alive &&
      this.phase === 'live'
    ) {
      this.handleReload(shooter.id);
    }
  }

  private finishPlayerReload(p: InternalRoomPlayer): void {
    const weapon = WEAPONS[p.weaponId];
    if (!weapon || weapon.melee) {
      p.reloading = false;
      return;
    }
    const ammo = p.ammo[p.weaponId];
    const needed = weapon.magazineSize - ammo.magazine;
    if (needed > 0 && ammo.reserve > 0) {
      const transfer = Math.min(needed, ammo.reserve);
      ammo.magazine += transfer;
      ammo.reserve -= transfer;
    }
    p.reloading = false;
    p.reloadEndTime = 0;
  }

  private checkRoundWinConditions(): void {
    if (this.phase !== 'live') return;

    const connectedPlayers = Array.from(this.players.values()).filter((p) => p.connected);

    if (this.mode === 'ffa') {
      const alivePlayers = connectedPlayers.filter((p) => p.alive);
      if (alivePlayers.length === 1 && connectedPlayers.length >= 2) {
        const winner = alivePlayers[0];
        this.scores.ffaScores[winner.id] = (this.scores.ffaScores[winner.id] || 0) + 1;
        this.concludeRound(
          `${winner.nickname.toUpperCase()} VENCEU O ROUND!`,
          'Último sobrevivente na Arena',
          winner.id
        );
      } else if (alivePlayers.length === 0) {
        this.concludeRound('EMPATE NO ROUND', 'Todos os operadores foram eliminados');
      }
      return;
    }

    const alphaAlive = connectedPlayers.filter((p) => p.team === 'alpha' && p.alive);
    const omegaAlive = connectedPlayers.filter((p) => p.team === 'omega' && p.alive);

    if (alphaAlive.length === 0 && omegaAlive.length > 0) {
      this.scores.omega += 1;
      const winnerPlayer = omegaAlive[0];
      if (this.mode === 'x1' && winnerPlayer) {
        this.scores.ffaScores[winnerPlayer.id] = (this.scores.ffaScores[winnerPlayer.id] || 0) + 1;
        this.concludeRound(
          `${winnerPlayer.nickname.toUpperCase()} VENCEU O ROUND!`,
          'Adversário eliminado no duelo X1',
          winnerPlayer.id
        );
      } else {
        this.concludeRound('EQUIPE OMEGA VENCEU O ROUND!', 'Esquadrão Alpha eliminado');
      }
    } else if (omegaAlive.length === 0 && alphaAlive.length > 0) {
      this.scores.alpha += 1;
      const winnerPlayer = alphaAlive[0];
      if (this.mode === 'x1' && winnerPlayer) {
        this.scores.ffaScores[winnerPlayer.id] = (this.scores.ffaScores[winnerPlayer.id] || 0) + 1;
        this.concludeRound(
          `${winnerPlayer.nickname.toUpperCase()} VENCEU O ROUND!`,
          'Adversário eliminado no duelo X1',
          winnerPlayer.id
        );
      } else {
        this.concludeRound('EQUIPE ALPHA VENCEU O ROUND!', 'Esquadrão Omega eliminado');
      }
    } else if (alphaAlive.length === 0 && omegaAlive.length === 0) {
      this.concludeRound('EMPATE NO ROUND!', 'Eliminação mútua');
    }
  }

  private handleRoundTimeExpired(): void {
    if (this.phase !== 'live') return;
    const connectedPlayers = Array.from(this.players.values()).filter((p) => p.connected);

    if (this.mode === 'ffa') {
      const alive = connectedPlayers.filter((p) => p.alive).sort((a, b) => b.hp - a.hp);
      if (alive.length >= 1 && (alive.length === 1 || alive[0].hp > alive[1].hp)) {
        const winner = alive[0];
        this.scores.ffaScores[winner.id] = (this.scores.ffaScores[winner.id] || 0) + 1;
        this.concludeRound(
          `${winner.nickname.toUpperCase()} VENCEU POR TEMPO!`,
          `Maior vitalidade restante (${winner.hp} HP)`,
          winner.id
        );
      } else {
        this.concludeRound('TEMPO ESGOTADO — EMPATE!', 'Nenhum operador obteve vantagem decisiva');
      }
      return;
    }

    const alphaAlive = connectedPlayers.filter((p) => p.team === 'alpha' && p.alive);
    const omegaAlive = connectedPlayers.filter((p) => p.team === 'omega' && p.alive);
    const alphaHp = alphaAlive.reduce((acc, p) => acc + p.hp, 0);
    const omegaHp = omegaAlive.reduce((acc, p) => acc + p.hp, 0);

    if (alphaHp > omegaHp) {
      this.scores.alpha += 1;
      this.concludeRound(
        'EQUIPE ALPHA VENCEU POR TEMPO!',
        `Vantagem tática (${alphaHp} HP vs ${omegaHp} HP)`
      );
    } else if (omegaHp > alphaHp) {
      this.scores.omega += 1;
      this.concludeRound(
        'EQUIPE OMEGA VENCEU POR TEMPO!',
        `Vantagem tática (${omegaHp} HP vs ${alphaHp} HP)`
      );
    } else {
      this.concludeRound('TEMPO ESGOTADO — EMPATE!', 'Vitalidade igual entre as equipes');
    }
  }

  private concludeRound(title: string, subtitle: string, ffaWinnerId?: string): void {
    this.roundWinnerTitle = title;
    this.roundWinnerSubtitle = subtitle;

    if (this.mode === 'ffa') {
      if (ffaWinnerId && (this.scores.ffaScores[ffaWinnerId] || 0) >= this.roundsToWin) {
        const winner = this.players.get(ffaWinnerId);
        this.concludeMatch(
          `VITÓRIA DE ${winner ? winner.nickname.toUpperCase() : 'OPERADOR'}!`,
          `Campeão Todos Contra Todos (${this.scores.ffaScores[ffaWinnerId]} rounds vencidos)`
        );
        return;
      }
    } else {
      if (this.scores.alpha >= this.roundsToWin) {
        const alphaPlayers = Array.from(this.players.values()).filter((p) => p.team === 'alpha');
        const winnerTitle =
          this.mode === 'x1' && alphaPlayers[0]
            ? `VITÓRIA DE ${alphaPlayers[0].nickname.toUpperCase()}!`
            : 'VITÓRIA DA EQUIPE ALPHA!';
        this.concludeMatch(winnerTitle, `Placar Final: ${this.scores.alpha} x ${this.scores.omega}`);
        return;
      }
      if (this.scores.omega >= this.roundsToWin) {
        const omegaPlayers = Array.from(this.players.values()).filter((p) => p.team === 'omega');
        const winnerTitle =
          this.mode === 'x1' && omegaPlayers[0]
            ? `VITÓRIA DE ${omegaPlayers[0].nickname.toUpperCase()}!`
            : 'VITÓRIA DA EQUIPE OMEGA!';
        this.concludeMatch(winnerTitle, `Placar Final: ${this.scores.omega} x ${this.scores.alpha}`);
        return;
      }
    }

    this.phase = 'round_end';
    this.phaseEndTime = Date.now() + this.roundEndDelaySec * 1000;

    this.broadcast({
      type: 'round_ended',
      roundNumber: this.roundNumber,
      winnerTitle: title,
      winnerSubtitle: subtitle,
      scores: this.scores,
    });
    this.broadcastState();
  }

  private concludeMatch(title: string, subtitle: string): void {
    this.phase = 'match_end';
    this.phaseEndTime = 0;
    this.matchWinnerTitle = title;
    this.matchWinnerSubtitle = subtitle;

    this.broadcast({
      type: 'match_ended',
      winnerTitle: title,
      winnerSubtitle: subtitle,
      scores: this.scores,
    });
    this.broadcastState();
  }

  private updateTick(): void {
    const now = Date.now();

    for (const [id, p] of this.players.entries()) {
      if (!p.connected && p.disconnectedAt && now - p.disconnectedAt > 45000) {
        this.players.delete(id);
      }
      if (p.alive && p.reloading && now >= p.reloadEndTime) {
        this.finishPlayerReload(p);
      }
    }

    if (this.players.size === 0) {
      this.destroy();
      return;
    }

    if (this.phase === 'freeze' && now >= this.phaseEndTime) {
      this.phase = 'live';
      this.phaseEndTime = now + this.roundTimeSec * 1000;
      this.broadcast({
        type: 'round_started',
        roundNumber: this.roundNumber,
        phase: 'live',
      });
    } else if (this.phase === 'live' && now >= this.phaseEndTime) {
      this.handleRoundTimeExpired();
    } else if (this.phase === 'round_end' && now >= this.phaseEndTime) {
      if (this.getConnectedCount() >= 2) {
        this.startNextRound();
      } else {
        this.returnToLobby(this.hostId);
      }
    }

    this.broadcastState();
  }

  public updatePlayerPing(playerId: string, rttMs: number): void {
    const p = this.players.get(playerId);
    if (p) {
      p.ping = Math.max(1, Math.min(999, Math.round(rttMs)));
    }
  }

  public getStateSnapshot(): RoomStateSnapshot {
    const now = Date.now();
    const playersList: PlayerNetState[] = [];

    for (const p of this.players.values()) {
      playersList.push({
        id: p.id,
        nickname: p.nickname,
        team: p.team,
        colorIndex: p.colorIndex,
        ready: p.ready,
        connected: p.connected,
        isHost: p.id === this.hostId,
        ping: p.ping,
        x: Number(p.x.toFixed(3)),
        y: Number(p.y.toFixed(3)),
        z: Number(p.z.toFixed(3)),
        vx: Number(p.vx.toFixed(2)),
        vy: Number(p.vy.toFixed(2)),
        vz: Number(p.vz.toFixed(2)),
        yaw: Number(p.yaw.toFixed(4)),
        pitch: Number(p.pitch.toFixed(4)),
        crouching: p.crouching,
        walking: p.walking,
        grounded: p.grounded,
        scoped: p.scoped,
        reloading: p.reloading,
        reloadEndTime: p.reloadEndTime,
        weaponId: p.weaponId,
        ammo: p.ammo,
        animState: p.animState,
        hp: p.hp,
        maxHp: p.maxHp,
        alive: p.alive,
        deathTime: p.deathTime,
        kills: p.kills,
        deaths: p.deaths,
        assists: p.assists,
        headshots: p.headshots,
        damageDealt: p.damageDealt,
        lastProcessedInputSeq: p.lastProcessedInputSeq,
      });
    }

    return {
      code: this.code,
      roomName: this.roomName,
      hostId: this.hostId,
      mode: this.mode,
      maxPlayers: this.maxPlayers,
      maxRounds: this.maxRounds,
      roundsToWin: this.roundsToWin,
      freezeTimeSec: this.freezeTimeSec,
      roundTimeSec: this.roundTimeSec,
      mapId: this.mapId,
      phase: this.phase,
      roundNumber: this.roundNumber,
      phaseTimeRemainingMs: Math.max(0, this.phaseEndTime - now),
      serverTimestamp: now,
      scores: this.scores,
      roundWinnerTitle: this.roundWinnerTitle,
      roundWinnerSubtitle: this.roundWinnerSubtitle,
      matchWinnerTitle: this.matchWinnerTitle,
      matchWinnerSubtitle: this.matchWinnerSubtitle,
      players: playersList,
      killFeed: this.killFeed,
    };
  }

  public broadcastState(): void {
    const snapshot = this.getStateSnapshot();
    this.broadcast({
      type: 'room_state',
      state: snapshot,
    });
  }

  public broadcast(msg: ServerMessage): void {
    for (const p of this.players.values()) {
      if (p.connected && p.send) {
        try {
          p.send(msg);
        } catch {
          // Ignore send errors
        }
      }
    }
  }

  public destroy(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    this.players.clear();
    this.onEmptyCallback(this.code);
  }
}
