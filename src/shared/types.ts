export type GameMode = 'x1' | 'ffa' | '2v2' | '3v3';

export type TeamId = 'alpha' | 'omega' | 'ffa';

export type WeaponId = 'rifle' | 'smg' | 'sniper' | 'pistol' | 'knife';

export type HitboxZone = 'head' | 'torso' | 'arms' | 'legs';

export type RoundPhase = 'lobby' | 'freeze' | 'live' | 'round_end' | 'match_end';

export type PlayerAnimState =
  | 'idle'
  | 'walk'
  | 'run'
  | 'crouch_idle'
  | 'crouch_walk'
  | 'jump'
  | 'dead';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface WeaponAmmoState {
  magazine: number;
  reserve: number;
}

export interface PlayerNetState {
  id: string;
  nickname: string;
  team: TeamId;
  colorIndex: number;
  ready: boolean;
  connected: boolean;
  isHost: boolean;
  ping: number;

  // Transform & Physics
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;

  // Stance & Actions
  crouching: boolean;
  walking: boolean;
  grounded: boolean;
  scoped: boolean;
  reloading: boolean;
  reloadEndTime: number;
  weaponId: WeaponId;
  ammo: Record<WeaponId, WeaponAmmoState>;
  animState: PlayerAnimState;

  // Combat & Stats
  hp: number;
  maxHp: number;
  alive: boolean;
  deathTime: number;
  kills: number;
  deaths: number;
  assists: number;
  headshots: number;
  damageDealt: number;
  lastProcessedInputSeq: number;
}

export interface KillFeedEntry {
  id: string;
  killerId: string;
  killerName: string;
  killerTeam: TeamId;
  victimId: string;
  victimName: string;
  victimTeam: TeamId;
  weaponId: WeaponId;
  headshot: boolean;
  timestamp: number;
}

export interface RoomScoreState {
  alpha: number;
  omega: number;
  ffaScores: Record<string, number>; // playerId -> rounds won in FFA/X1
}

export interface RoomStateSnapshot {
  code: string;
  roomName: string;
  hostId: string;
  mode: GameMode;
  maxPlayers: number;
  maxRounds: number;
  roundsToWin: number;
  freezeTimeSec: number;
  roundTimeSec: number;
  mapId: string;
  phase: RoundPhase;
  roundNumber: number;
  phaseTimeRemainingMs: number;
  serverTimestamp: number;
  scores: RoomScoreState;
  roundWinnerTitle: string;
  roundWinnerSubtitle: string;
  matchWinnerTitle: string;
  matchWinnerSubtitle: string;
  players: PlayerNetState[];
  killFeed: KillFeedEntry[];
}

export interface InputPayload {
  seq: number;
  dt: number;
  forward: number; // -1, 0, 1
  right: number;   // -1, 0, 1
  jump: boolean;
  crouch: boolean;
  walk: boolean;
  scoped: boolean;
  yaw: number;
  pitch: number;
  weaponId: WeaponId;
  clientTimestamp: number;
}

export interface ShootPayload {
  shotId: string;
  origin: Vec3;
  direction: Vec3;
  yaw: number;
  pitch: number;
  weaponId: WeaponId;
  recoilIndex: number;
  scoped: boolean;
  clientTimestamp: number;
}

export interface ShotResultEvent {
  shotId: string;
  shooterId: string;
  weaponId: WeaponId;
  origin: Vec3;
  hitPoint: Vec3;
  hitNormal: Vec3;
  surfaceType: 'wall' | 'crate' | 'metal' | 'ground' | 'player' | 'none';
  targetPlayerId?: string;
  hitbox?: HitboxZone;
  damage?: number;
  headshot?: boolean;
  killed?: boolean;
  remainingMagazine: number;
  remainingReserve: number;
}

export interface DamageEvent {
  attackerId: string;
  attackerName: string;
  victimId: string;
  victimName: string;
  weaponId: WeaponId;
  hitbox: HitboxZone;
  damage: number;
  headshot: boolean;
  killed: boolean;
  attackerPos: Vec3;
  victimHpAfter: number;
}

export interface PublicRoomSummary {
  code: string;
  roomName: string;
  hostName: string;
  mode: GameMode;
  playerCount: number;
  maxPlayers: number;
  phase: RoundPhase;
  mapId: string;
}

export type ClientMessage =
  | {
      type: 'create_room';
      nickname: string;
      roomName?: string;
      mode: GameMode;
      maxPlayers: number;
      maxRounds: number;
      reconnectToken?: string;
    }
  | {
      type: 'join_room';
      code: string;
      nickname: string;
      reconnectToken?: string;
    }
  | {
      type: 'leave_room';
    }
  | {
      type: 'list_rooms';
    }
  | {
      type: 'set_ready';
      ready: boolean;
    }
  | {
      type: 'set_team';
      team: TeamId;
    }
  | {
      type: 'update_room_config';
      mode?: GameMode;
      maxPlayers?: number;
      maxRounds?: number;
      freezeTimeSec?: number;
      roundTimeSec?: number;
    }
  | {
      type: 'start_match';
    }
  | {
      type: 'return_to_lobby';
    }
  | {
      type: 'player_input';
      input: InputPayload;
    }
  | {
      type: 'shoot';
      payload: ShootPayload;
    }
  | {
      type: 'reload';
    }
  | {
      type: 'switch_weapon';
      weaponId: WeaponId;
    }
  | {
      type: 'ping_check';
      clientTimestamp: number;
    };

export type ServerMessage =
  | {
      type: 'welcome';
      clientId: string;
      reconnectToken: string;
    }
  | {
      type: 'room_joined';
      code: string;
      playerId: string;
      reconnectToken: string;
      state: RoomStateSnapshot;
    }
  | {
      type: 'room_state';
      state: RoomStateSnapshot;
    }
  | {
      type: 'room_list';
      rooms: PublicRoomSummary[];
    }
  | {
      type: 'shot_fired';
      result: ShotResultEvent;
    }
  | {
      type: 'damage_event';
      event: DamageEvent;
    }
  | {
      type: 'reload_started';
      playerId: string;
      weaponId: WeaponId;
      durationMs: number;
    }
  | {
      type: 'weapon_switched';
      playerId: string;
      weaponId: WeaponId;
    }
  | {
      type: 'round_started';
      roundNumber: number;
      phase: RoundPhase;
    }
  | {
      type: 'round_ended';
      roundNumber: number;
      winnerTitle: string;
      winnerSubtitle: string;
      scores: RoomScoreState;
    }
  | {
      type: 'match_ended';
      winnerTitle: string;
      winnerSubtitle: string;
      scores: RoomScoreState;
    }
  | {
      type: 'pong_check';
      clientTimestamp: number;
      serverTimestamp: number;
    }
  | {
      type: 'error';
      message: string;
      code?: string;
    };
