import { Vec3 } from './types';

export type MapObjectStyle =
  | 'perimeter_wall'
  | 'concrete_wall'
  | 'brick_building'
  | 'container_blue'
  | 'container_red'
  | 'container_rust'
  | 'crate_wood'
  | 'crate_metal'
  | 'steel_pillar'
  | 'platform_concrete'
  | 'hazard_barrier'
  | 'roof_beam';

export interface MapBoxObject {
  id: string;
  x: number; // Center X
  y: number; // Center Y
  z: number; // Center Z
  w: number; // Size X
  h: number; // Size Y
  d: number; // Size Z
  style: MapObjectStyle;
  collidable: boolean;
  surfaceType: 'wall' | 'crate' | 'metal' | 'ground';
}

export interface SpawnPoint {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export const MAP_BOUNDS = {
  halfWidth: 30, // X from -30 to +30 (60m wide)
  halfDepth: 34, // Z from -34 to +34 (68m long)
  wallHeight: 7,
};

/**
 * Spawn Points:
 * Alpha Base is at North (z ~ -27), looking South (yaw = Math.PI)
 * Omega Base is at South (z ~ +27), looking North (yaw = 0)
 * Note: In our Three.js / FPS coordinate convention:
 * - Forward vector from yaw=0, pitch=0 is (0, 0, -1) (looking toward -Z).
 * - Forward vector from yaw=Math.PI, pitch=0 is (0, 0, +1) (looking toward +Z).
 */
export const ALPHA_SPAWNS: SpawnPoint[] = [
  { x: 0, y: 0, z: -27.5, yaw: Math.PI },
  { x: -5.5, y: 0, z: -27.5, yaw: Math.PI },
  { x: 5.5, y: 0, z: -27.5, yaw: Math.PI },
];

export const OMEGA_SPAWNS: SpawnPoint[] = [
  { x: 0, y: 0, z: 27.5, yaw: 0 },
  { x: -5.5, y: 0, z: 27.5, yaw: 0 },
  { x: 5.5, y: 0, z: 27.5, yaw: 0 },
];

export const FFA_SPAWNS: SpawnPoint[] = [
  { x: 0, y: 0, z: -27.5, yaw: Math.PI },
  { x: 0, y: 0, z: 27.5, yaw: 0 },
  { x: -22, y: 0, z: -16, yaw: Math.PI * 0.75 },
  { x: 22, y: 0, z: 16, yaw: -Math.PI * 0.25 },
  { x: -22, y: 0, z: 16, yaw: Math.PI * 0.25 },
  { x: 22, y: 0, z: -16, yaw: -Math.PI * 0.75 },
];

/**
 * SETOR OMEGA — Complexo Industrial Urbano Abandonado
 * 3-Lane Competitive Tactical Arena:
 * - Base Alpha (Z = -28) & Base Omega (Z = +28) with spawn-shield walls at Z = -20.5 and Z = +20.5
 *   preventing any instant spawn-kill sightlines while offering immediate left/right/mid exits.
 * - Center Arena (Praça Central): Tactical central structure with twin passages, metal containers, and low cover crates.
 * - West Lane (Pátio de Contêineres, X < -10): Shipping containers, flanking corridors, stacked wooden crates.
 * - East Lane (Galpão Industrial, X > +10): Brick warehouse walls, interior rooms, pillars, and stepped platforms.
 */
export const MAP_OBJECTS: MapBoxObject[] = [
  // ================= PERIMETER WALLS =================
  {
    id: 'wall_north',
    x: 0,
    y: 3.5,
    z: -34,
    w: 61,
    h: 7,
    d: 1,
    style: 'perimeter_wall',
    collidable: true,
    surfaceType: 'wall',
  },
  {
    id: 'wall_south',
    x: 0,
    y: 3.5,
    z: 34,
    w: 61,
    h: 7,
    d: 1,
    style: 'perimeter_wall',
    collidable: true,
    surfaceType: 'wall',
  },
  {
    id: 'wall_west',
    x: -30,
    y: 3.5,
    z: 0,
    w: 1,
    h: 7,
    d: 68,
    style: 'perimeter_wall',
    collidable: true,
    surfaceType: 'wall',
  },
  {
    id: 'wall_east',
    x: 30,
    y: 3.5,
    z: 0,
    w: 1,
    h: 7,
    d: 68,
    style: 'perimeter_wall',
    collidable: true,
    surfaceType: 'wall',
  },

  // ================= SPAWN PROTECTION BARRIERS (ALPHA & OMEGA) =================
  // Blocks direct spawn-to-spawn line of sight at x=0 while opening side lanes at x = ±5.5
  {
    id: 'alpha_spawn_shield',
    x: 0,
    y: 2.0,
    z: -21.5,
    w: 7.0,
    h: 4.0,
    d: 1.2,
    style: 'concrete_wall',
    collidable: true,
    surfaceType: 'wall',
  },
  {
    id: 'alpha_spawn_wing_w',
    x: -12.5,
    y: 2.25,
    z: -23.5,
    w: 4.5,
    h: 4.5,
    d: 1.2,
    style: 'concrete_wall',
    collidable: true,
    surfaceType: 'wall',
  },
  {
    id: 'alpha_spawn_wing_e',
    x: 12.5,
    y: 2.25,
    z: -23.5,
    w: 4.5,
    h: 4.5,
    d: 1.2,
    style: 'concrete_wall',
    collidable: true,
    surfaceType: 'wall',
  },

  {
    id: 'omega_spawn_shield',
    x: 0,
    y: 2.0,
    z: 21.5,
    w: 7.0,
    h: 4.0,
    d: 1.2,
    style: 'concrete_wall',
    collidable: true,
    surfaceType: 'wall',
  },
  {
    id: 'omega_spawn_wing_w',
    x: -12.5,
    y: 2.25,
    z: 23.5,
    w: 4.5,
    h: 4.5,
    d: 1.2,
    style: 'concrete_wall',
    collidable: true,
    surfaceType: 'wall',
  },
  {
    id: 'omega_spawn_wing_e',
    x: 12.5,
    y: 2.25,
    z: 23.5,
    w: 4.5,
    h: 4.5,
    d: 1.2,
    style: 'concrete_wall',
    collidable: true,
    surfaceType: 'wall',
  },

  // ================= CENTRAL TACTICAL ARENA (MID) =================
  // Central divider blocks direct center lane, forcing tactical angles left or right of center pillar
  {
    id: 'mid_central_tower',
    x: 0,
    y: 2.4,
    z: 0,
    w: 3.6,
    h: 4.8,
    d: 3.6,
    style: 'brick_building',
    collidable: true,
    surfaceType: 'wall',
  },
  // Low tactical cover barriers flanking Mid avenues
  {
    id: 'mid_barrier_north_w',
    x: -8.2,
    y: 0.65,
    z: -9.5,
    w: 2.4,
    h: 1.3,
    d: 0.9,
    style: 'hazard_barrier',
    collidable: true,
    surfaceType: 'wall',
  },
  {
    id: 'mid_barrier_north_e',
    x: 8.2,
    y: 0.65,
    z: -9.5,
    w: 2.4,
    h: 1.3,
    d: 0.9,
    style: 'hazard_barrier',
    collidable: true,
    surfaceType: 'wall',
  },
  {
    id: 'mid_barrier_south_w',
    x: -8.2,
    y: 0.65,
    z: 9.5,
    w: 2.4,
    h: 1.3,
    d: 0.9,
    style: 'hazard_barrier',
    collidable: true,
    surfaceType: 'wall',
  },
  {
    id: 'mid_barrier_south_e',
    x: 8.2,
    y: 0.65,
    z: 9.5,
    w: 2.4,
    h: 1.3,
    d: 0.9,
    style: 'hazard_barrier',
    collidable: true,
    surfaceType: 'wall',
  },

  // Mid Crates near center tower
  {
    id: 'mid_crate_w',
    x: -2.6,
    y: 0.8,
    z: 0,
    w: 1.4,
    h: 1.6,
    d: 1.4,
    style: 'crate_metal',
    collidable: true,
    surfaceType: 'metal',
  },
  {
    id: 'mid_crate_e',
    x: 2.6,
    y: 0.8,
    z: 0,
    w: 1.4,
    h: 1.6,
    d: 1.4,
    style: 'crate_metal',
    collidable: true,
    surfaceType: 'metal',
  },

  // ================= WEST LANE: CONTAINER YARD (PÁTIO DE CARGA) =================
  // Large Blue & Red Shipping Containers forming tactical corridors & angles
  {
    id: 'container_west_north',
    x: -15.5,
    y: 1.5,
    z: -11.5,
    w: 3.2,
    h: 3.0,
    d: 7.5,
    style: 'container_blue',
    collidable: true,
    surfaceType: 'metal',
  },
  {
    id: 'container_west_south',
    x: -15.5,
    y: 1.5,
    z: 11.5,
    w: 3.2,
    h: 3.0,
    d: 7.5,
    style: 'container_red',
    collidable: true,
    surfaceType: 'metal',
  },
  {
    id: 'container_west_outer',
    x: -23.5,
    y: 1.5,
    z: 0,
    w: 3.2,
    h: 3.0,
    d: 8.5,
    style: 'container_rust',
    collidable: true,
    surfaceType: 'metal',
  },
  // West connector wall with doorway gap
  {
    id: 'west_mid_divider_n',
    x: -9.5,
    y: 2.0,
    z: -4.5,
    w: 1.2,
    h: 4.0,
    d: 5.5,
    style: 'concrete_wall',
    collidable: true,
    surfaceType: 'wall',
  },
  {
    id: 'west_mid_divider_s',
    x: -9.5,
    y: 2.0,
    z: 4.5,
    w: 1.2,
    h: 4.0,
    d: 5.5,
    style: 'concrete_wall',
    collidable: true,
    surfaceType: 'wall',
  },
  // Wooden Crates in West Yard (climbable/step-up + cover)
  {
    id: 'west_crate_stack_1a',
    x: -19.5,
    y: 0.75,
    z: -5.5,
    w: 1.5,
    h: 1.5,
    d: 1.5,
    style: 'crate_wood',
    collidable: true,
    surfaceType: 'crate',
  },
  {
    id: 'west_crate_stack_1b',
    x: -19.5,
    y: 0.4,
    z: -7.1,
    w: 1.4,
    h: 0.8,
    d: 1.4,
    style: 'crate_wood',
    collidable: true,
    surfaceType: 'crate',
  },
  {
    id: 'west_crate_stack_2a',
    x: -19.5,
    y: 0.75,
    z: 5.5,
    w: 1.5,
    h: 1.5,
    d: 1.5,
    style: 'crate_wood',
    collidable: true,
    surfaceType: 'crate',
  },
  {
    id: 'west_crate_stack_2b',
    x: -19.5,
    y: 0.4,
    z: 7.1,
    w: 1.4,
    h: 0.8,
    d: 1.4,
    style: 'crate_wood',
    collidable: true,
    surfaceType: 'crate',
  },

  // ================= EAST LANE: INDUSTRIAL WAREHOUSE (GALPÃO LESTE) =================
  // Warehouse walls with side doors and center window/opening
  {
    id: 'east_mid_divider_n',
    x: 9.5,
    y: 2.2,
    z: -5.0,
    w: 1.2,
    h: 4.4,
    d: 6.0,
    style: 'brick_building',
    collidable: true,
    surfaceType: 'wall',
  },
  {
    id: 'east_mid_divider_s',
    x: 9.5,
    y: 2.2,
    z: 5.0,
    w: 1.2,
    h: 4.4,
    d: 6.0,
    style: 'brick_building',
    collidable: true,
    surfaceType: 'wall',
  },
  {
    id: 'east_warehouse_wall_n',
    x: 17.5,
    y: 2.2,
    z: -13.0,
    w: 6.5,
    h: 4.4,
    d: 1.4,
    style: 'brick_building',
    collidable: true,
    surfaceType: 'wall',
  },
  {
    id: 'east_warehouse_wall_s',
    x: 17.5,
    y: 2.2,
    z: 13.0,
    w: 6.5,
    h: 4.4,
    d: 1.4,
    style: 'brick_building',
    collidable: true,
    surfaceType: 'wall',
  },
  // Elevated Central Platform inside East Warehouse with steps on both ends
  {
    id: 'east_platform_main',
    x: 23.0,
    y: 0.5,
    z: 0,
    w: 5.0,
    h: 1.0,
    d: 10.0,
    style: 'platform_concrete',
    collidable: true,
    surfaceType: 'wall',
  },
  {
    id: 'east_platform_step_n',
    x: 23.0,
    y: 0.25,
    z: -5.8,
    w: 4.0,
    h: 0.5,
    d: 1.6,
    style: 'platform_concrete',
    collidable: true,
    surfaceType: 'wall',
  },
  {
    id: 'east_platform_step_s',
    x: 23.0,
    y: 0.25,
    z: 5.8,
    w: 4.0,
    h: 0.5,
    d: 1.6,
    style: 'platform_concrete',
    collidable: true,
    surfaceType: 'wall',
  },
  {
    id: 'east_platform_cover',
    x: 20.8,
    y: 1.55,
    z: 0,
    w: 0.6,
    h: 1.1,
    d: 3.8,
    style: 'hazard_barrier',
    collidable: true,
    surfaceType: 'metal',
  },
  // Industrial Steel Pillars in East Lane
  {
    id: 'east_pillar_n',
    x: 15.0,
    y: 2.5,
    z: -6.0,
    w: 1.2,
    h: 5.0,
    d: 1.2,
    style: 'steel_pillar',
    collidable: true,
    surfaceType: 'metal',
  },
  {
    id: 'east_pillar_s',
    x: 15.0,
    y: 2.5,
    z: 6.0,
    w: 1.2,
    h: 5.0,
    d: 1.2,
    style: 'steel_pillar',
    collidable: true,
    surfaceType: 'metal',
  },

  // ================= ADDITIONAL TACTICAL CRATES NEAR SPAWN APPROACHES =================
  {
    id: 'alpha_approach_crate_w',
    x: -7.5,
    y: 0.85,
    z: -16.5,
    w: 1.7,
    h: 1.7,
    d: 1.7,
    style: 'crate_wood',
    collidable: true,
    surfaceType: 'crate',
  },
  {
    id: 'alpha_approach_crate_e',
    x: 7.5,
    y: 0.85,
    z: -16.5,
    w: 1.7,
    h: 1.7,
    d: 1.7,
    style: 'crate_metal',
    collidable: true,
    surfaceType: 'metal',
  },
  {
    id: 'omega_approach_crate_w',
    x: -7.5,
    y: 0.85,
    z: 16.5,
    w: 1.7,
    h: 1.7,
    d: 1.7,
    style: 'crate_metal',
    collidable: true,
    surfaceType: 'metal',
  },
  {
    id: 'omega_approach_crate_e',
    x: 7.5,
    y: 0.85,
    z: 16.5,
    w: 1.7,
    h: 1.7,
    d: 1.7,
    style: 'crate_wood',
    collidable: true,
    surfaceType: 'crate',
  },

  // ================= OVERHEAD INDUSTRIAL TRUSS BEAMS (DECORATIVE / HIGH) =================
  {
    id: 'roof_beam_1',
    x: 0,
    y: 6.6,
    z: -15,
    w: 60,
    h: 0.5,
    d: 0.8,
    style: 'roof_beam',
    collidable: false,
    surfaceType: 'metal',
  },
  {
    id: 'roof_beam_2',
    x: 0,
    y: 6.6,
    z: 0,
    w: 60,
    h: 0.5,
    d: 0.8,
    style: 'roof_beam',
    collidable: false,
    surfaceType: 'metal',
  },
  {
    id: 'roof_beam_3',
    x: 0,
    y: 6.6,
    z: 15,
    w: 60,
    h: 0.5,
    d: 0.8,
    style: 'roof_beam',
    collidable: false,
    surfaceType: 'metal',
  },
];

export const COLLIDABLE_MAP_OBJECTS: MapBoxObject[] = MAP_OBJECTS.filter((o) => o.collidable);

export function getForwardVector(yaw: number, pitch: number): Vec3 {
  const cosPitch = Math.cos(pitch);
  return {
    x: -Math.sin(yaw) * cosPitch,
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * cosPitch,
  };
}
