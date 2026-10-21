import { HitboxZone, WeaponAmmoState, WeaponId } from './types';

export interface WeaponDefinition {
  id: WeaponId;
  name: string;
  shortName: string;
  category: string;
  slotKey: string;
  automatic: boolean;
  melee: boolean;
  hasScope: boolean;
  hasTacticalAim: boolean;
  scopeFov: number;
  fireIntervalMs: number;
  reloadTimeMs: number;
  magazineSize: number;
  initialReserve: number;
  maxRange: number;
  moveSpeedMultiplier: number;
  baseSpread: number;
  moveSpreadPenalty: number;
  jumpSpreadPenalty: number;
  crouchSpreadBonus: number;
  scopedSpreadBonus: number;
  recoilPitchStep: number;
  recoilYawVariance: number;
  damageByZone: Record<HitboxZone, number>;
}

export const WEAPONS: Record<WeaponId, WeaponDefinition> = {
  rifle: {
    id: 'rifle',
    name: 'KR-47 Vandal (Rifle de Assalto)',
    shortName: 'KR-47 VANDAL',
    category: 'Rifle de Assalto',
    slotKey: '1',
    automatic: true,
    melee: false,
    hasScope: false,
    hasTacticalAim: true,
    scopeFov: 52,
    fireIntervalMs: 100, // 600 RPM
    reloadTimeMs: 2200,
    magazineSize: 30,
    initialReserve: 90,
    maxRange: 200,
    moveSpeedMultiplier: 0.94,
    baseSpread: 0.0025,
    moveSpreadPenalty: 0.032,
    jumpSpreadPenalty: 0.09,
    crouchSpreadBonus: 0.55,
    scopedSpreadBonus: 0.65,
    recoilPitchStep: 0.022,
    recoilYawVariance: 0.011,
    damageByZone: {
      head: 112,
      torso: 34,
      arms: 28,
      legs: 24,
    },
  },
  smg: {
    id: 'smg',
    name: 'VX-9 Specter (Submetralhadora)',
    shortName: 'VX-9 SPECTER',
    category: 'Submetralhadora',
    slotKey: '2',
    automatic: true,
    melee: false,
    hasScope: false,
    hasTacticalAim: true,
    scopeFov: 58,
    fireIntervalMs: 72, // ~833 RPM
    reloadTimeMs: 1750,
    magazineSize: 32,
    initialReserve: 128,
    maxRange: 140,
    moveSpeedMultiplier: 1.0,
    baseSpread: 0.006,
    moveSpreadPenalty: 0.014,
    jumpSpreadPenalty: 0.055,
    crouchSpreadBonus: 0.65,
    scopedSpreadBonus: 0.75,
    recoilPitchStep: 0.014,
    recoilYawVariance: 0.009,
    damageByZone: {
      head: 68,
      torso: 22,
      arms: 19,
      legs: 16,
    },
  },
  sniper: {
    id: 'sniper',
    name: 'AWM-X Titan (Rifle de Precisão)',
    shortName: 'AWM-X TITAN',
    category: 'Rifle de Precisão',
    slotKey: '3',
    automatic: false,
    melee: false,
    hasScope: true,
    hasTacticalAim: false,
    scopeFov: 20, // High zoom telescope scope
    fireIntervalMs: 1150,
    reloadTimeMs: 2900,
    magazineSize: 5,
    initialReserve: 25,
    maxRange: 300,
    moveSpeedMultiplier: 0.86,
    baseSpread: 0.0005, // Pinpoint accuracy
    moveSpreadPenalty: 0.065,
    jumpSpreadPenalty: 0.14,
    crouchSpreadBonus: 0.4,
    scopedSpreadBonus: 0.05,
    recoilPitchStep: 0.075,
    recoilYawVariance: 0.005,
    damageByZone: {
      head: 400,
      torso: 115,
      arms: 100,
      legs: 85,
    },
  },
  pistol: {
    id: 'pistol',
    name: 'P-250 Tactical (Pistola)',
    shortName: 'P-250 TACTICAL',
    category: 'Pistola Semiautomática',
    slotKey: '4',
    automatic: false,
    melee: false,
    hasScope: false,
    hasTacticalAim: true,
    scopeFov: 60,
    fireIntervalMs: 155,
    reloadTimeMs: 1500,
    magazineSize: 13,
    initialReserve: 52,
    maxRange: 150,
    moveSpeedMultiplier: 1.02,
    baseSpread: 0.003,
    moveSpreadPenalty: 0.015,
    jumpSpreadPenalty: 0.05,
    crouchSpreadBonus: 0.5,
    scopedSpreadBonus: 0.7,
    recoilPitchStep: 0.016,
    recoilYawVariance: 0.005,
    damageByZone: {
      head: 78,
      torso: 26,
      arms: 22,
      legs: 18,
    },
  },
  knife: {
    id: 'knife',
    name: 'Lâmina Tática Omega (Faca)',
    shortName: 'KARAMBIT OMEGA',
    category: 'Corpo a Corpo',
    slotKey: '5',
    automatic: false,
    melee: true,
    hasScope: false,
    hasTacticalAim: false,
    scopeFov: 75,
    fireIntervalMs: 420,
    reloadTimeMs: 0,
    magazineSize: 1,
    initialReserve: 0,
    maxRange: 2.75,
    moveSpeedMultiplier: 1.12,
    baseSpread: 0,
    moveSpreadPenalty: 0,
    jumpSpreadPenalty: 0,
    crouchSpreadBonus: 1,
    scopedSpreadBonus: 1,
    recoilPitchStep: 0.01,
    recoilYawVariance: 0,
    damageByZone: {
      head: 100,
      torso: 55,
      arms: 45,
      legs: 40,
    },
  },
};

export const WEAPON_ORDER: WeaponId[] = ['rifle', 'smg', 'sniper', 'pistol', 'knife'];

export function createInitialAmmoState(): Record<WeaponId, WeaponAmmoState> {
  return {
    rifle: { magazine: WEAPONS.rifle.magazineSize, reserve: WEAPONS.rifle.initialReserve },
    smg: { magazine: WEAPONS.smg.magazineSize, reserve: WEAPONS.smg.initialReserve },
    sniper: { magazine: WEAPONS.sniper.magazineSize, reserve: WEAPONS.sniper.initialReserve },
    pistol: { magazine: WEAPONS.pistol.magazineSize, reserve: WEAPONS.pistol.initialReserve },
    knife: { magazine: 1, reserve: 0 },
  };
}

/**
 * Deterministic CS2-inspired recoil pattern offset (pitch, yaw in radians)
 * for continuous spray index (0..30).
 */
export function getRecoilPatternOffset(weaponId: WeaponId, shotIndex: number): { pitchOffset: number; yawOffset: number } {
  const w = WEAPONS[weaponId];
  if (shotIndex <= 0 || w.melee) {
    return { pitchOffset: 0, yawOffset: 0 };
  }
  const clamped = Math.min(shotIndex, 30);
  // Vertical climb levels off around shot 12, then horizontal oscillation kicks in (like AK-47/M4 in CS2)
  const verticalFactor = Math.min(clamped, 12) * w.recoilPitchStep + Math.max(0, clamped - 12) * (w.recoilPitchStep * 0.25);
  let horizontalFactor = 0;
  if (clamped > 4) {
    const phase = (clamped - 4) * 0.55;
    horizontalFactor = Math.sin(phase) * w.recoilYawVariance * Math.min(clamped - 3, 8);
  }
  return {
    pitchOffset: verticalFactor,
    yawOffset: horizontalFactor,
  };
}
