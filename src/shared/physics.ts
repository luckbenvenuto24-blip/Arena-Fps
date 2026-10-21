import { COLLIDABLE_MAP_OBJECTS, MAP_BOUNDS, MapBoxObject } from './mapData';
import { InputPayload, PlayerAnimState, WeaponId } from './types';
import { WEAPONS } from './weapons';

export const PLAYER_RADIUS = 0.42;
export const PLAYER_HEIGHT_STANDING = 1.80;
export const PLAYER_HEIGHT_CROUCH = 1.22;
export const EYE_HEIGHT_STANDING = 1.62;
export const EYE_HEIGHT_CROUCH = 1.08;
export const MAX_STEP_HEIGHT = 0.52;

export const BASE_MOVE_SPEED = 6.2;
export const CROUCH_SPEED_MULT = 0.52;
export const WALK_SPEED_MULT = 0.56;
export const SCOPED_SPEED_MULT = 0.55;
export const GROUND_ACCEL = 55.0;
export const AIR_ACCEL = 16.0;
export const GROUND_FRICTION = 11.5;
export const GRAVITY = 22.5;
export const JUMP_VELOCITY = 8.2;

export interface PhysicsState {
  x: number;
  y: number; // Foot position Y (0 on ground)
  z: number;
  vx: number;
  vy: number;
  vz: number;
  crouching: boolean;
  walking: boolean;
  grounded: boolean;
  yaw: number;
  pitch: number;
}

export function getPlayerEyeHeight(crouching: boolean): number {
  return crouching ? EYE_HEIGHT_CROUCH : EYE_HEIGHT_STANDING;
}

export function getPlayerHeight(crouching: boolean): number {
  return crouching ? PLAYER_HEIGHT_CROUCH : PLAYER_HEIGHT_STANDING;
}

function aabbIntersectsBox(
  px: number,
  py: number,
  pz: number,
  radius: number,
  height: number,
  box: MapBoxObject
): boolean {
  const minX = px - radius;
  const maxX = px + radius;
  const minY = py;
  const maxY = py + height;
  const minZ = pz - radius;
  const maxZ = pz + radius;

  const bMinX = box.x - box.w * 0.5;
  const bMaxX = box.x + box.w * 0.5;
  const bMinY = box.y - box.h * 0.5;
  const bMaxY = box.y + box.h * 0.5;
  const bMinZ = box.z - box.d * 0.5;
  const bMaxZ = box.z + box.d * 0.5;

  return (
    maxX > bMinX &&
    minX < bMaxX &&
    maxY > bMinY &&
    minY < bMaxY &&
    maxZ > bMinZ &&
    minZ < bMaxZ
  );
}

export function isPositionColliding(
  x: number,
  y: number,
  z: number,
  crouching: boolean,
  radius = PLAYER_RADIUS
): boolean {
  const height = getPlayerHeight(crouching);
  const limitX = MAP_BOUNDS.halfWidth - 0.5 - radius;
  const limitZ = MAP_BOUNDS.halfDepth - 0.5 - radius;
  if (x < -limitX || x > limitX || z < -limitZ || z > limitZ || y < -0.01) {
    return true;
  }

  for (let i = 0; i < COLLIDABLE_MAP_OBJECTS.length; i++) {
    const box = COLLIDABLE_MAP_OBJECTS[i];
    if (aabbIntersectsBox(x, y, z, radius, height, box)) {
      return true;
    }
  }
  return false;
}

/**
 * Finds highest supporting floor/box surface directly beneath player at (x, z)
 * for a player whose feet are at `y`.
 */
function findSupportFloorY(x: number, y: number, z: number, radius: number): number {
  let highestFloor = 0;
  for (let i = 0; i < COLLIDABLE_MAP_OBJECTS.length; i++) {
    const box = COLLIDABLE_MAP_OBJECTS[i];
    const bMinX = box.x - box.w * 0.5;
    const bMaxX = box.x + box.w * 0.5;
    const bMinZ = box.z - box.d * 0.5;
    const bMaxZ = box.z + box.d * 0.5;
    const bTopY = box.y + box.h * 0.5;

    if (
      x + radius > bMinX + 0.02 &&
      x - radius < bMaxX - 0.02 &&
      z + radius > bMinZ + 0.02 &&
      z - radius < bMaxZ - 0.02
    ) {
      if (bTopY <= y + 0.12 && bTopY > highestFloor) {
        highestFloor = bTopY;
      }
    }
  }
  return highestFloor;
}

/**
 * Steps player physics deterministically (shared by Client prediction & Server authority).
 */
export function stepPlayerPhysics(
  state: PhysicsState,
  input: InputPayload,
  freezeMovement = false
): PhysicsState {
  const clampedDt = Math.min(Math.max(input.dt, 0.001), 0.1);
  // Sub-step if dt > 20ms to guarantee zero wall tunneling
  const steps = Math.max(1, Math.ceil(clampedDt / 0.016));
  const stepDt = clampedDt / steps;

  let x = state.x;
  let y = state.y;
  let z = state.z;
  let vx = state.vx;
  let vy = state.vy;
  let vz = state.vz;
  let grounded = state.grounded;
  let crouching = input.crouch;
  const walking = input.walk;
  const yaw = input.yaw;
  const pitch = Math.max(-Math.PI * 0.485, Math.min(Math.PI * 0.485, input.pitch));

  // If trying to uncrouch while under low obstacle, stay crouched
  if (!crouching && state.crouching) {
    if (isPositionColliding(x, y, z, false)) {
      crouching = true;
    }
  }

  const weaponDef = WEAPONS[input.weaponId as WeaponId] || WEAPONS.rifle;
  let maxSpeed = BASE_MOVE_SPEED * weaponDef.moveSpeedMultiplier;
  if (crouching) {
    maxSpeed *= CROUCH_SPEED_MULT;
  } else if (walking) {
    maxSpeed *= WALK_SPEED_MULT;
  }
  if (input.scoped && (weaponDef.hasScope || weaponDef.hasTacticalAim)) {
    maxSpeed *= SCOPED_SPEED_MULT;
  }

  // Forward & Right vectors on XZ plane from yaw
  // yaw = 0 looks toward -Z: forward = (-sin(yaw), -cos(yaw)), right = (cos(yaw), -sin(yaw))
  const fwdX = -Math.sin(yaw);
  const fwdZ = -Math.cos(yaw);
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);

  let wishX = fwdX * input.forward + rightX * input.right;
  let wishZ = fwdZ * input.forward + rightZ * input.right;
  const wishLen = Math.hypot(wishX, wishZ);
  if (wishLen > 0.0001) {
    wishX /= wishLen;
    wishZ /= wishLen;
  }

  if (freezeMovement) {
    wishX = 0;
    wishZ = 0;
    vx = 0;
    vz = 0;
  }

  for (let s = 0; s < steps; s++) {
    // 1. Apply ground friction
    if (grounded) {
      const speed = Math.hypot(vx, vz);
      if (speed > 0.001) {
        const drop = speed * GROUND_FRICTION * stepDt;
        const newSpeed = Math.max(0, speed - drop) / speed;
        vx *= newSpeed;
        vz *= newSpeed;
      } else {
        vx = 0;
        vz = 0;
      }
    }

    // 2. Accelerate toward wish direction
    if (!freezeMovement && wishLen > 0.0001) {
      const accel = grounded ? GROUND_ACCEL : AIR_ACCEL;
      const currentProj = vx * wishX + vz * wishZ;
      const addSpeed = maxSpeed - currentProj;
      if (addSpeed > 0) {
        const accelSpeed = Math.min(addSpeed, accel * stepDt * maxSpeed * 0.22);
        vx += accelSpeed * wishX;
        vz += accelSpeed * wishZ;
      }
    }

    // Clamp horizontal speed
    const horizSpeed = Math.hypot(vx, vz);
    if (horizSpeed > maxSpeed * 1.08) {
      const scale = (maxSpeed * 1.08) / horizSpeed;
      vx *= scale;
      vz *= scale;
    }

    // 3. Jump & Gravity
    if (!freezeMovement && input.jump && grounded) {
      vy = JUMP_VELOCITY;
      grounded = false;
    }
    vy -= GRAVITY * stepDt;

    // 4. Move along X axis with step-up & collision resolution
    const height = getPlayerHeight(crouching);
    const nextX = x + vx * stepDt;
    if (!isPositionColliding(nextX, y, z, crouching)) {
      x = nextX;
    } else if (grounded && !isPositionColliding(nextX, y + MAX_STEP_HEIGHT, z, crouching)) {
      // Smooth step-up onto stairs/low ledges
      const steppedFloor = findSupportFloorY(nextX, y + MAX_STEP_HEIGHT, z, PLAYER_RADIUS);
      if (steppedFloor > y && steppedFloor - y <= MAX_STEP_HEIGHT && !isPositionColliding(nextX, steppedFloor + 0.001, z, crouching)) {
        x = nextX;
        y = steppedFloor;
      } else {
        vx = 0;
      }
    } else {
      vx = 0;
    }

    // 5. Move along Z axis with step-up & collision resolution
    const nextZ = z + vz * stepDt;
    if (!isPositionColliding(x, y, nextZ, crouching)) {
      z = nextZ;
    } else if (grounded && !isPositionColliding(x, y + MAX_STEP_HEIGHT, nextZ, crouching)) {
      const steppedFloor = findSupportFloorY(x, y + MAX_STEP_HEIGHT, nextZ, PLAYER_RADIUS);
      if (steppedFloor > y && steppedFloor - y <= MAX_STEP_HEIGHT && !isPositionColliding(x, steppedFloor + 0.001, nextZ, crouching)) {
        z = nextZ;
        y = steppedFloor;
      } else {
        vz = 0;
      }
    } else {
      vz = 0;
    }

    // 6. Move along Y axis
    const nextY = y + vy * stepDt;
    const supportY = findSupportFloorY(x, Math.max(y, nextY), z, PLAYER_RADIUS);

    if (nextY <= supportY) {
      y = supportY;
      vy = 0;
      grounded = true;
    } else if (!isPositionColliding(x, nextY, z, crouching)) {
      y = nextY;
      grounded = false;
    } else {
      // Hit ceiling or box from above/below
      if (vy < 0) {
        y = supportY;
        grounded = true;
      }
      vy = 0;
    }

    // Clamp within perimeter bounds as safety guard
    const limitX = MAP_BOUNDS.halfWidth - 0.55 - PLAYER_RADIUS;
    const limitZ = MAP_BOUNDS.halfDepth - 0.55 - PLAYER_RADIUS;
    x = Math.max(-limitX, Math.min(limitX, x));
    z = Math.max(-limitZ, Math.min(limitZ, z));
    void height;
  }

  return {
    x,
    y,
    z,
    vx,
    vy,
    vz,
    crouching,
    walking,
    grounded,
    yaw,
    pitch,
  };
}

export function computePlayerAnimState(
  alive: boolean,
  grounded: boolean,
  crouching: boolean,
  walking: boolean,
  vx: number,
  vz: number
): PlayerAnimState {
  if (!alive) return 'dead';
  if (!grounded) return 'jump';
  const speed = Math.hypot(vx, vz);
  if (crouching) {
    return speed > 0.35 ? 'crouch_walk' : 'crouch_idle';
  }
  if (speed < 0.35) return 'idle';
  if (walking || speed < 4.0) return 'walk';
  return 'run';
}
