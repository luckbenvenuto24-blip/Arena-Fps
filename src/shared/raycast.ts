import { COLLIDABLE_MAP_OBJECTS } from './mapData';
import { HitboxZone, Vec3 } from './types';

export interface HitboxAABB {
  zone: HitboxZone;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export interface TargetPlayerHitboxPose {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  crouching: boolean;
}

export interface RayIntersection {
  distance: number;
  point: Vec3;
  normal: Vec3;
}

/**
 * Builds the 3D anatomical hitboxes (Head, Torso, Arms, Legs) for a player at (x, y, z).
 * Matches the 3D character mesh proportions in standing and crouched stances.
 */
export function buildPlayerHitboxes(pose: TargetPlayerHitboxPose): HitboxAABB[] {
  const { x, y, z, yaw, crouching } = pose;
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);

  if (!crouching) {
    // Standing stance (total height 1.80m, eye height 1.62m)
    const armOffset = 0.33;
    const leftArmX = x - rightX * armOffset;
    const leftArmZ = z - rightZ * armOffset;
    const rightArmX = x + rightX * armOffset;
    const rightArmZ = z + rightZ * armOffset;

    return [
      // Head (y: 1.44 -> 1.84, center 1.64)
      {
        zone: 'head',
        minX: x - 0.18,
        maxX: x + 0.18,
        minY: y + 1.44,
        maxY: y + 1.84,
        minZ: z - 0.18,
        maxZ: z + 0.18,
      },
      // Torso (y: 0.80 -> 1.44, center 1.12)
      {
        zone: 'torso',
        minX: x - 0.22,
        maxX: x + 0.22,
        minY: y + 0.80,
        maxY: y + 1.44,
        minZ: z - 0.18,
        maxZ: z + 0.18,
      },
      // Left Arm
      {
        zone: 'arms',
        minX: leftArmX - 0.13,
        maxX: leftArmX + 0.13,
        minY: y + 0.82,
        maxY: y + 1.42,
        minZ: leftArmZ - 0.13,
        maxZ: leftArmZ + 0.13,
      },
      // Right Arm
      {
        zone: 'arms',
        minX: rightArmX - 0.13,
        maxX: rightArmX + 0.13,
        minY: y + 0.82,
        maxY: y + 1.42,
        minZ: rightArmZ - 0.13,
        maxZ: rightArmZ + 0.13,
      },
      // Legs (y: 0.00 -> 0.80, center 0.40)
      {
        zone: 'legs',
        minX: x - 0.25,
        maxX: x + 0.25,
        minY: y + 0.0,
        maxY: y + 0.80,
        minZ: z - 0.20,
        maxZ: z + 0.20,
      },
    ];
  } else {
    // Crouching stance (total height 1.25m, eye height 1.08m)
    const armOffset = 0.33;
    const leftArmX = x - rightX * armOffset;
    const leftArmZ = z - rightZ * armOffset;
    const rightArmX = x + rightX * armOffset;
    const rightArmZ = z + rightZ * armOffset;

    return [
      // Head crouched (y: 0.92 -> 1.28, center 1.10)
      {
        zone: 'head',
        minX: x - 0.18,
        maxX: x + 0.18,
        minY: y + 0.92,
        maxY: y + 1.28,
        minZ: z - 0.18,
        maxZ: z + 0.18,
      },
      // Torso crouched (y: 0.45 -> 0.92, center 0.685)
      {
        zone: 'torso',
        minX: x - 0.23,
        maxX: x + 0.23,
        minY: y + 0.45,
        maxY: y + 0.92,
        minZ: z - 0.19,
        maxZ: z + 0.19,
      },
      // Left Arm crouched
      {
        zone: 'arms',
        minX: leftArmX - 0.13,
        maxX: leftArmX + 0.13,
        minY: y + 0.46,
        maxY: y + 0.90,
        minZ: leftArmZ - 0.13,
        maxZ: leftArmZ + 0.13,
      },
      // Right Arm crouched
      {
        zone: 'arms',
        minX: rightArmX - 0.13,
        maxX: rightArmX + 0.13,
        minY: y + 0.46,
        maxY: y + 0.90,
        minZ: rightArmZ - 0.13,
        maxZ: rightArmZ + 0.13,
      },
      // Legs crouched (y: 0.00 -> 0.45, center 0.225)
      {
        zone: 'legs',
        minX: x - 0.26,
        maxX: x + 0.26,
        minY: y + 0.0,
        maxY: y + 0.45,
        minZ: z - 0.22,
        maxZ: z + 0.22,
      },
    ];
  }
}

/**
 * Exact Slab-Method Ray-AABB intersection test.
 */
export function intersectRayAABB(
  origin: Vec3,
  dir: Vec3,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  minZ: number,
  maxZ: number,
  maxDistance: number
): RayIntersection | null {
  let tMin = 0.0;
  let tMax = maxDistance;
  let hitNormal: Vec3 = { x: 0, y: 1, z: 0 };

  // X slab
  if (Math.abs(dir.x) < 1e-8) {
    if (origin.x < minX || origin.x > maxX) return null;
  } else {
    const invX = 1.0 / dir.x;
    let t1 = (minX - origin.x) * invX;
    let t2 = (maxX - origin.x) * invX;
    let nX = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      nX = 1;
    }
    if (t1 > tMin) {
      tMin = t1;
      hitNormal = { x: nX, y: 0, z: 0 };
    }
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return null;
  }

  // Y slab
  if (Math.abs(dir.y) < 1e-8) {
    if (origin.y < minY || origin.y > maxY) return null;
  } else {
    const invY = 1.0 / dir.y;
    let t1 = (minY - origin.y) * invY;
    let t2 = (maxY - origin.y) * invY;
    let nY = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      nY = 1;
    }
    if (t1 > tMin) {
      tMin = t1;
      hitNormal = { x: 0, y: nY, z: 0 };
    }
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return null;
  }

  // Z slab
  if (Math.abs(dir.z) < 1e-8) {
    if (origin.z < minZ || origin.z > maxZ) return null;
  } else {
    const invZ = 1.0 / dir.z;
    let t1 = (minZ - origin.z) * invZ;
    let t2 = (maxZ - origin.z) * invZ;
    let nZ = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      nZ = 1;
    }
    if (t1 > tMin) {
      tMin = t1;
      hitNormal = { x: 0, y: 0, z: nZ };
    }
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return null;
  }

  if (tMin < 0 || tMin > maxDistance) return null;

  return {
    distance: tMin,
    point: {
      x: origin.x + dir.x * tMin,
      y: origin.y + dir.y * tMin,
      z: origin.z + dir.z * tMin,
    },
    normal: hitNormal,
  };
}

export interface FullRaycastOutcome {
  hitPoint: Vec3;
  hitNormal: Vec3;
  distance: number;
  surfaceType: 'wall' | 'crate' | 'metal' | 'ground' | 'player' | 'none';
  targetPlayerId?: string;
  hitbox?: HitboxZone;
}

export function normalizeVec3(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z);
  if (len < 1e-8) return { x: 0, y: 0, z: -1 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/**
 * Raycasts against map geometry (walls, containers, crates, ground) AND target players' hitboxes.
 * Ensures solid walls block shots completely.
 */
export function performAuthoritativeRaycast(
  origin: Vec3,
  rawDirection: Vec3,
  maxRange: number,
  targets: TargetPlayerHitboxPose[]
): FullRaycastOutcome {
  const dir = normalizeVec3(rawDirection);

  let closestDist = maxRange;
  let closestPoint: Vec3 = {
    x: origin.x + dir.x * maxRange,
    y: origin.y + dir.y * maxRange,
    z: origin.z + dir.z * maxRange,
  };
  let closestNormal: Vec3 = { x: -dir.x, y: -dir.y, z: -dir.z };
  let surfaceType: FullRaycastOutcome['surfaceType'] = 'none';

  // 1. Check floor plane (y = 0)
  if (dir.y < -1e-6 && origin.y > 0) {
    const tGround = -origin.y / dir.y;
    if (tGround > 0 && tGround < closestDist) {
      closestDist = tGround;
      closestPoint = {
        x: origin.x + dir.x * tGround,
        y: 0,
        z: origin.z + dir.z * tGround,
      };
      closestNormal = { x: 0, y: 1, z: 0 };
      surfaceType = 'ground';
    }
  }

  // 2. Check all collidable map objects (walls, containers, crates, platforms)
  for (let i = 0; i < COLLIDABLE_MAP_OBJECTS.length; i++) {
    const box = COLLIDABLE_MAP_OBJECTS[i];
    const hit = intersectRayAABB(
      origin,
      dir,
      box.x - box.w * 0.5,
      box.x + box.w * 0.5,
      box.y - box.h * 0.5,
      box.y + box.h * 0.5,
      box.z - box.d * 0.5,
      box.z + box.d * 0.5,
      closestDist
    );
    if (hit && hit.distance < closestDist) {
      closestDist = hit.distance;
      closestPoint = hit.point;
      closestNormal = hit.normal;
      surfaceType = box.surfaceType;
    }
  }

  // 3. Check all candidate target players' hitboxes (only hits closer than closestDist wall!)
  let hitPlayerId: string | undefined;
  let hitZone: HitboxZone | undefined;

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    const boxes = buildPlayerHitboxes(target);

    for (let b = 0; b < boxes.length; b++) {
      const hbox = boxes[b];
      const hit = intersectRayAABB(
        origin,
        dir,
        hbox.minX,
        hbox.maxX,
        hbox.minY,
        hbox.maxY,
        hbox.minZ,
        hbox.maxZ,
        closestDist
      );
      if (hit && hit.distance < closestDist) {
        closestDist = hit.distance;
        closestPoint = hit.point;
        closestNormal = hit.normal;
        surfaceType = 'player';
        hitPlayerId = target.id;
        hitZone = hbox.zone;
      }
    }
  }

  return {
    hitPoint: closestPoint,
    hitNormal: closestNormal,
    distance: closestDist,
    surfaceType,
    targetPlayerId: hitPlayerId,
    hitbox: hitZone,
  };
}
