import * as THREE from 'three';
import { PlayerAnimState, TeamId, WeaponId } from '../shared/types';

export interface WeaponMeshBundle {
  root: THREE.Group;
  muzzleFlash: THREE.Mesh;
  muzzlePoint: THREE.Object3D;
  magazineMesh?: THREE.Mesh;
}

const gunMetalMat = new THREE.MeshStandardMaterial({
  color: '#1e242b',
  roughness: 0.35,
  metalness: 0.78,
});

const darkPolymerMat = new THREE.MeshStandardMaterial({
  color: '#11151c',
  roughness: 0.65,
  metalness: 0.25,
});

const steelMat = new THREE.MeshStandardMaterial({
  color: '#64748b',
  roughness: 0.28,
  metalness: 0.85,
});

const rifleAccentMat = new THREE.MeshStandardMaterial({
  color: '#d97706',
  roughness: 0.45,
  metalness: 0.4,
});

const sniperBodyMat = new THREE.MeshStandardMaterial({
  color: '#1e3a2f',
  roughness: 0.5,
  metalness: 0.35,
});

const neonSightMat = new THREE.MeshBasicMaterial({
  color: '#00ff88',
});

const crimsonBladeMat = new THREE.MeshStandardMaterial({
  color: '#e11d48',
  roughness: 0.25,
  metalness: 0.9,
});

export function createWeaponMesh(weaponId: WeaponId): WeaponMeshBundle {
  const root = new THREE.Group();
  let magazineMesh: THREE.Mesh | undefined;
  const muzzlePoint = new THREE.Object3D();

  if (weaponId === 'rifle') {
    // KR-47 Vandal Assault Rifle
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.095, 0.42), gunMetalMat);
    receiver.position.set(0, 0, 0);
    root.add(receiver);

    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.075, 0.28), rifleAccentMat);
    handguard.position.set(0, 0.005, -0.32);
    root.add(handguard);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.36, 10), steelMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.52);
    root.add(barrel);

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.085, 0.24), darkPolymerMat);
    stock.position.set(0, -0.015, 0.30);
    root.add(stock);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.12, 0.06), darkPolymerMat);
    grip.position.set(0, -0.09, 0.12);
    grip.rotation.x = 0.28;
    root.add(grip);

    magazineMesh = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.19, 0.075), gunMetalMat);
    magazineMesh.position.set(0, -0.12, -0.08);
    magazineMesh.rotation.x = -0.22;
    root.add(magazineMesh);

    // Holo Sight
    const sightFrame = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.045, 0.08), darkPolymerMat);
    sightFrame.position.set(0, 0.068, 0.02);
    root.add(sightFrame);

    const sightDot = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), neonSightMat);
    sightDot.position.set(0, 0.072, -0.02);
    root.add(sightDot);

    muzzlePoint.position.set(0, 0.02, -0.72);
  } else if (weaponId === 'smg') {
    // VX-9 Specter SMG
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.09, 0.30), gunMetalMat);
    root.add(body);

    const suppressor = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.22, 12), darkPolymerMat);
    suppressor.rotation.x = Math.PI / 2;
    suppressor.position.set(0, 0.015, -0.25);
    root.add(suppressor);

    const foregrip = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.10, 0.04), darkPolymerMat);
    foregrip.position.set(0, -0.08, -0.10);
    root.add(foregrip);

    magazineMesh = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.21, 0.048), steelMat);
    magazineMesh.position.set(0, -0.13, -0.01);
    magazineMesh.rotation.x = -0.1;
    root.add(magazineMesh);

    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.04, 0.07), neonSightMat);
    sight.position.set(0, 0.058, 0);
    root.add(sight);

    muzzlePoint.position.set(0, 0.015, -0.38);
  } else if (weaponId === 'sniper') {
    // AWM-X Titan Sniper Rifle
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.095, 0.52), sniperBodyMat);
    root.add(chassis);

    const heavyBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.020, 0.62, 12), steelMat);
    heavyBarrel.rotation.x = Math.PI / 2;
    heavyBarrel.position.set(0, 0.022, -0.54);
    root.add(heavyBarrel);

    const muzzleBrake = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.04, 0.08), gunMetalMat);
    muzzleBrake.position.set(0, 0.022, -0.86);
    root.add(muzzleBrake);

    // Telescopic Scope
    const scopeTube = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.024, 0.30, 14), darkPolymerMat);
    scopeTube.rotation.x = Math.PI / 2;
    scopeTube.position.set(0, 0.085, -0.04);
    root.add(scopeTube);

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.09, 0.28), sniperBodyMat);
    stock.position.set(0, -0.01, 0.36);
    root.add(stock);

    magazineMesh = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.11, 0.10), gunMetalMat);
    magazineMesh.position.set(0, -0.08, -0.05);
    root.add(magazineMesh);

    muzzlePoint.position.set(0, 0.022, -0.92);
  } else if (weaponId === 'pistol') {
    // P-250 Tactical Pistol
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.052, 0.22), steelMat);
    slide.position.set(0, 0.02, -0.02);
    root.add(slide);

    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.036, 0.20), darkPolymerMat);
    frame.position.set(0, -0.01, -0.01);
    root.add(frame);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.040, 0.11, 0.055), darkPolymerMat);
    grip.position.set(0, -0.065, 0.055);
    grip.rotation.x = 0.24;
    root.add(grip);

    magazineMesh = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.10, 0.045), gunMetalMat);
    magazineMesh.position.set(0, -0.07, 0.055);
    magazineMesh.rotation.x = 0.24;
    root.add(magazineMesh);

    const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.012), neonSightMat);
    rearSight.position.set(0, 0.05, 0.075);
    root.add(rearSight);

    muzzlePoint.position.set(0, 0.02, -0.15);
  } else {
    // Karambit Omega Tactical Knife
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.038, 0.13), darkPolymerMat);
    root.add(handle);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 8, 16), crimsonBladeMat);
    ring.rotation.y = Math.PI / 2;
    ring.position.set(0, -0.01, 0.08);
    root.add(ring);

    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.18, 4), crimsonBladeMat);
    blade.rotation.x = -Math.PI / 2 - 0.25;
    blade.position.set(0, 0.01, -0.14);
    root.add(blade);

    muzzlePoint.position.set(0, 0.01, -0.22);
  }

  root.add(muzzlePoint);

  const flashMat = new THREE.MeshBasicMaterial({
    color: '#ffdd55',
    transparent: true,
    opacity: 0.92,
  });
  const muzzleFlash = new THREE.Mesh(new THREE.OctahedronGeometry(0.075, 0), flashMat);
  muzzleFlash.position.copy(muzzlePoint.position);
  muzzleFlash.visible = false;
  root.add(muzzleFlash);

  return { root, muzzleFlash, muzzlePoint, magazineMesh };
}

/**
 * First-Person Viewmodel Rig attached to the camera.
 */
export class FirstPersonViewmodel {
  public readonly container: THREE.Group = new THREE.Group();
  private pivot: THREE.Group = new THREE.Group();
  private currentWeaponId: WeaponId = 'rifle';
  private weaponBundles: Map<WeaponId, WeaponMeshBundle> = new Map();
  private muzzleLight: THREE.PointLight;

  private recoilKickZ = 0;
  private recoilKickPitch = 0;
  private flashTimer = 0;
  private equipProgress = 1;
  private reloadTimer = 0;
  private reloadDuration = 0;
  private slashTimer = 0;
  private bobPhase = 0;

  constructor() {
    this.container.add(this.pivot);

    // Tactical Forearms in First Person
    const sleeveMat = new THREE.MeshStandardMaterial({
      color: '#1e293b',
      roughness: 0.75,
    });
    const gloveMat = new THREE.MeshStandardMaterial({
      color: '#0f172a',
      roughness: 0.55,
    });

    const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 0.36), sleeveMat);
    rightArm.position.set(0.11, -0.12, 0.26);
    rightArm.rotation.y = -0.15;
    rightArm.rotation.x = 0.12;
    this.pivot.add(rightArm);

    const rightGlove = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.068, 0.09), gloveMat);
    rightGlove.position.set(0.01, -0.07, 0.08);
    this.pivot.add(rightGlove);

    const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.072, 0.38), sleeveMat);
    leftArm.position.set(-0.14, -0.13, 0.10);
    leftArm.rotation.y = 0.42;
    leftArm.rotation.x = 0.16;
    this.pivot.add(leftArm);

    const leftGlove = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.065, 0.09), gloveMat);
    leftGlove.position.set(-0.01, -0.05, -0.12);
    this.pivot.add(leftGlove);

    const weapons: WeaponId[] = ['rifle', 'smg', 'sniper', 'pistol', 'knife'];
    for (const wid of weapons) {
      const bundle = createWeaponMesh(wid);
      bundle.root.visible = wid === this.currentWeaponId;
      this.pivot.add(bundle.root);
      this.weaponBundles.set(wid, bundle);
    }

    this.muzzleLight = new THREE.PointLight('#ffaa22', 0, 5);
    this.muzzleLight.position.set(0.2, -0.15, -0.9);
    this.container.add(this.muzzleLight);
  }

  public setWeapon(weaponId: WeaponId): void {
    if (this.currentWeaponId === weaponId) return;
    this.currentWeaponId = weaponId;
    for (const [wid, bundle] of this.weaponBundles.entries()) {
      bundle.root.visible = wid === weaponId;
    }
    this.equipProgress = 0;
    this.reloadTimer = 0;
  }

  public triggerShot(): void {
    if (this.currentWeaponId === 'knife') {
      this.slashTimer = 0.26;
      return;
    }
    this.recoilKickZ = this.currentWeaponId === 'sniper' ? 0.14 : 0.065;
    this.recoilKickPitch = this.currentWeaponId === 'sniper' ? 0.18 : 0.075;
    this.flashTimer = 0.048;

    const bundle = this.weaponBundles.get(this.currentWeaponId);
    if (bundle) {
      bundle.muzzleFlash.visible = true;
      bundle.muzzleFlash.rotation.z = Math.random() * Math.PI * 2;
      const scale = 0.85 + Math.random() * 0.45;
      bundle.muzzleFlash.scale.set(scale, scale, scale);
    }
    this.muzzleLight.intensity = 4.5;
  }

  public triggerReload(durationMs: number): void {
    this.reloadDuration = durationMs / 1000;
    this.reloadTimer = this.reloadDuration;
  }

  public cancelReload(): void {
    this.reloadTimer = 0;
  }

  public getMuzzleWorldPosition(target: THREE.Vector3): THREE.Vector3 {
    const bundle = this.weaponBundles.get(this.currentWeaponId);
    if (bundle) {
      bundle.muzzlePoint.getWorldPosition(target);
      return target;
    }
    return this.container.getWorldPosition(target);
  }

  public update(
    dt: number,
    moveSpeed: number,
    grounded: boolean,
    scoped: boolean,
    alive: boolean
  ): void {
    this.container.visible = alive && !(scoped && this.currentWeaponId === 'sniper');
    if (!alive) return;

    // Update muzzle flash visibility
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) {
        for (const b of this.weaponBundles.values()) {
          b.muzzleFlash.visible = false;
        }
        this.muzzleLight.intensity = 0;
      }
    }

    // Smoothly decay recoil
    this.recoilKickZ = THREE.MathUtils.lerp(this.recoilKickZ, 0, Math.min(1, dt * 16));
    this.recoilKickPitch = THREE.MathUtils.lerp(this.recoilKickPitch, 0, Math.min(1, dt * 14));

    // Equip animation
    if (this.equipProgress < 1) {
      this.equipProgress = Math.min(1, this.equipProgress + dt * 4.5);
    }

    // Walk bobbing
    if (grounded && moveSpeed > 0.3) {
      this.bobPhase += dt * (moveSpeed * 1.65);
    } else {
      this.bobPhase += dt * 1.5;
    }

    const bobAmp = grounded ? Math.min(1, moveSpeed / 6.0) * 0.012 : 0.003;
    const bobX = Math.cos(this.bobPhase) * bobAmp;
    const bobY = Math.abs(Math.sin(this.bobPhase * 2)) * bobAmp;

    // Base resting position (hip vs tactical ADS)
    const targetX = scoped ? 0.0 : 0.24;
    const targetY = scoped ? -0.155 : -0.22;
    const targetZ = scoped ? -0.34 : -0.42;

    const equipOffsetY = (1 - this.equipProgress) * -0.25;
    const equipRotX = (1 - this.equipProgress) * -0.65;

    let reloadRotZ = 0;
    let reloadRotX = 0;
    let reloadOffsetY = 0;

    const bundle = this.weaponBundles.get(this.currentWeaponId);
    if (this.reloadTimer > 0 && this.reloadDuration > 0) {
      this.reloadTimer = Math.max(0, this.reloadTimer - dt);
      const p = 1 - this.reloadTimer / this.reloadDuration; // 0 -> 1
      const wave = Math.sin(p * Math.PI);
      reloadRotZ = wave * 0.48;
      reloadRotX = wave * 0.32;
      reloadOffsetY = -wave * 0.07;

      if (bundle?.magazineMesh) {
        const magPull = p > 0.2 && p < 0.75 ? Math.sin(((p - 0.2) / 0.55) * Math.PI) : 0;
        bundle.magazineMesh.position.y = -0.12 - magPull * 0.18;
      }
    } else if (bundle?.magazineMesh) {
      bundle.magazineMesh.position.y = this.currentWeaponId === 'pistol' ? -0.07 : -0.12;
    }

    // Knife slash animation
    let slashRotY = 0;
    let slashRotX = 0;
    let slashOffsetZ = 0;
    if (this.slashTimer > 0) {
      this.slashTimer = Math.max(0, this.slashTimer - dt);
      const s = Math.sin((1 - this.slashTimer / 0.26) * Math.PI);
      slashRotY = s * 0.95;
      slashRotX = -s * 0.55;
      slashOffsetZ = -s * 0.18;
    }

    this.pivot.position.set(
      targetX + bobX,
      targetY + bobY + equipOffsetY + reloadOffsetY,
      targetZ + this.recoilKickZ + slashOffsetZ
    );

    this.pivot.rotation.set(
      this.recoilKickPitch + equipRotX + reloadRotX + slashRotX,
      slashRotY,
      reloadRotZ
    );
  }
}

/**
 * Third-Person Articulated Humanoid Tactical Operator.
 * Proportions match `buildPlayerHitboxes` in `src/shared/raycast.ts`!
 */
export class ThirdPersonOperator {
  public readonly root: THREE.Group = new THREE.Group();
  private bodyPivot: THREE.Group = new THREE.Group();
  private torsoGroup: THREE.Group = new THREE.Group();
  private headGroup: THREE.Group = new THREE.Group();
  private leftArmGroup: THREE.Group = new THREE.Group();
  private rightArmGroup: THREE.Group = new THREE.Group();
  private leftLegGroup: THREE.Group = new THREE.Group();
  private rightLegGroup: THREE.Group = new THREE.Group();
  private weaponMount: THREE.Group = new THREE.Group();
  private thirdPersonWeapons: Map<WeaponId, WeaponMeshBundle> = new Map();
  private currentWeaponId: WeaponId = 'rifle';

  private nameplateCanvas: HTMLCanvasElement;
  private nameplateTex: THREE.CanvasTexture;
  private nameplateSprite: THREE.Sprite;
  private lastLabelKey = '';

  private walkCycle = 0;
  private deathProgress = 0;
  private muzzleFlashTimer = 0;

  constructor(team: TeamId, colorIndex: number) {
    this.root.add(this.bodyPivot);

    const palette = this.getTeamPalette(team, colorIndex);

    const armorMat = new THREE.MeshStandardMaterial({
      color: palette.armor,
      roughness: 0.55,
      metalness: 0.3,
    });
    const uniformMat = new THREE.MeshStandardMaterial({
      color: palette.uniform,
      roughness: 0.78,
      metalness: 0.1,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: palette.accent,
      roughness: 0.35,
      metalness: 0.5,
      emissive: palette.accent,
      emissiveIntensity: 0.22,
    });
    const visorMat = new THREE.MeshBasicMaterial({
      color: palette.visor,
    });
    const skinGloveMat = new THREE.MeshStandardMaterial({
      color: '#111827',
      roughness: 0.6,
    });

    // ================= LEGS (y: 0.0 -> 0.80) =================
    this.leftLegGroup.position.set(-0.12, 0.80, 0);
    const leftLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.78, 0.22), uniformMat);
    leftLegMesh.position.set(0, -0.39, 0);
    leftLegMesh.castShadow = true;
    this.leftLegGroup.add(leftLegMesh);

    const leftBoot = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.14, 0.27), skinGloveMat);
    leftBoot.position.set(0, -0.73, -0.02);
    this.leftLegGroup.add(leftBoot);
    this.bodyPivot.add(this.leftLegGroup);

    this.rightLegGroup.position.set(0.12, 0.80, 0);
    const rightLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.78, 0.22), uniformMat);
    rightLegMesh.position.set(0, -0.39, 0);
    rightLegMesh.castShadow = true;
    this.rightLegGroup.add(rightLegMesh);

    const rightBoot = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.14, 0.27), skinGloveMat);
    rightBoot.position.set(0, -0.73, -0.02);
    this.rightLegGroup.add(rightBoot);
    this.bodyPivot.add(this.rightLegGroup);

    // ================= TORSO (y: 0.80 -> 1.44) =================
    this.torsoGroup.position.set(0, 0.80, 0);
    const chestMesh = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.64, 0.30), armorMat);
    chestMesh.position.set(0, 0.32, 0);
    chestMesh.castShadow = true;
    this.torsoGroup.add(chestMesh);

    // Tactical Rig / Chest Emblem
    const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.28, 0.33), accentMat);
    chestPlate.position.set(0, 0.38, 0);
    this.torsoGroup.add(chestPlate);

    // Backpack
    const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.42, 0.16), skinGloveMat);
    backpack.position.set(0, 0.35, 0.20);
    this.torsoGroup.add(backpack);

    this.bodyPivot.add(this.torsoGroup);

    // ================= HEAD (y: 1.44 -> 1.84, relative to torso top = +0.64) =================
    this.headGroup.position.set(0, 0.64, 0);
    const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 0.32), uniformMat);
    headMesh.position.set(0, 0.19, 0);
    headMesh.castShadow = true;
    this.headGroup.add(headMesh);

    // Tactical Ballistic Helmet
    const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.20, 0.35), armorMat);
    helmet.position.set(0, 0.28, 0.01);
    this.headGroup.add(helmet);

    // Glowing Tactical Visor on front (-Z face)
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.09, 0.03), visorMat);
    visor.position.set(0, 0.20, -0.165);
    this.headGroup.add(visor);

    this.torsoGroup.add(this.headGroup);

    // ================= ARMS (offset ±0.32m) =================
    this.leftArmGroup.position.set(-0.31, 0.56, 0);
    const leftArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.56, 0.18), uniformMat);
    leftArmMesh.position.set(0, -0.22, -0.08);
    leftArmMesh.rotation.x = 0.55;
    leftArmMesh.castShadow = true;
    this.leftArmGroup.add(leftArmMesh);
    this.torsoGroup.add(this.leftArmGroup);

    this.rightArmGroup.position.set(0.31, 0.56, 0);
    const rightArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.56, 0.18), uniformMat);
    rightArmMesh.position.set(0, -0.18, -0.14);
    rightArmMesh.rotation.x = Math.PI * 0.38;
    rightArmMesh.castShadow = true;
    this.rightArmGroup.add(rightArmMesh);

    // Mount 3rd-person weapons to right hand
    this.weaponMount.position.set(-0.08, -0.16, -0.36);
    this.rightArmGroup.add(this.weaponMount);

    const weapons: WeaponId[] = ['rifle', 'smg', 'sniper', 'pistol', 'knife'];
    for (const wid of weapons) {
      const wBundle = createWeaponMesh(wid);
      wBundle.root.scale.set(1.15, 1.15, 1.15);
      wBundle.root.visible = wid === this.currentWeaponId;
      this.weaponMount.add(wBundle.root);
      this.thirdPersonWeapons.set(wid, wBundle);
    }

    this.torsoGroup.add(this.rightArmGroup);

    // ================= NAMEPLATE & HP BAR SPRITE =================
    this.nameplateCanvas = document.createElement('canvas');
    this.nameplateCanvas.width = 256;
    this.nameplateCanvas.height = 64;
    this.nameplateTex = new THREE.CanvasTexture(this.nameplateCanvas);
    const spriteMat = new THREE.SpriteMaterial({
      map: this.nameplateTex,
      transparent: true,
      depthTest: false,
    });
    this.nameplateSprite = new THREE.Sprite(spriteMat);
    this.nameplateSprite.scale.set(1.5, 0.38, 1);
    this.nameplateSprite.position.set(0, 2.12, 0);
    this.root.add(this.nameplateSprite);
  }

  private getTeamPalette(team: TeamId, colorIndex: number) {
    if (team === 'alpha') {
      return {
        armor: '#1e3a8a',
        uniform: '#1e293b',
        accent: '#0ea5e9',
        visor: '#38bdf8',
      };
    }
    if (team === 'omega') {
      return {
        armor: '#7f1d1d',
        uniform: '#27272a',
        accent: '#f97316',
        visor: '#fb923c',
      };
    }
    const ffaColors = [
      { armor: '#1e3a8a', accent: '#38bdf8', visor: '#38bdf8' },
      { armor: '#7f1d1d', accent: '#f97316', visor: '#fb923c' },
      { armor: '#14532d', accent: '#22c55e', visor: '#4ade80' },
      { armor: '#581c87', accent: '#a855f7', visor: '#c084fc' },
      { armor: '#713f12', accent: '#eab308', visor: '#facc15' },
      { armor: '#831843', accent: '#ec4899', visor: '#f472b6' },
    ];
    const pick = ffaColors[colorIndex % ffaColors.length];
    return {
      armor: pick.armor,
      uniform: '#1f2937',
      accent: pick.accent,
      visor: pick.visor,
    };
  }

  public triggerShotEffect(): void {
    this.muzzleFlashTimer = 0.06;
    const bundle = this.thirdPersonWeapons.get(this.currentWeaponId);
    if (bundle) {
      bundle.muzzleFlash.visible = true;
    }
  }

  public getMuzzleWorldPosition(target: THREE.Vector3): THREE.Vector3 {
    const bundle = this.thirdPersonWeapons.get(this.currentWeaponId);
    if (bundle) {
      bundle.muzzlePoint.getWorldPosition(target);
      return target;
    }
    return this.root.getWorldPosition(target);
  }

  private updateNameplate(nickname: string, hp: number, team: TeamId): void {
    const key = `${nickname}_${hp}_${team}`;
    if (key === this.lastLabelKey) return;
    this.lastLabelKey = key;

    const ctx = this.nameplateCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, 256, 64);

    // Background pill
    ctx.fillStyle = 'rgba(10, 14, 23, 0.78)';
    ctx.fillRect(18, 6, 220, 48);
    ctx.strokeStyle = team === 'alpha' ? '#38bdf8' : team === 'omega' ? '#f97316' : '#eab308';
    ctx.lineWidth = 2;
    ctx.strokeRect(18, 6, 220, 48);

    // Player name
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 20px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(nickname, 128, 29);

    // HP bar
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(34, 38, 188, 9);

    const hpRatio = Math.max(0, Math.min(1, hp / 100));
    ctx.fillStyle = hp > 50 ? '#22c55e' : hp > 25 ? '#eab308' : '#ef4444';
    ctx.fillRect(34, 38, 188 * hpRatio, 9);

    this.nameplateTex.needsUpdate = true;
  }

  public update(
    dt: number,
    state: {
      nickname: string;
      team: TeamId;
      x: number;
      y: number;
      z: number;
      vx: number;
      vz: number;
      yaw: number;
      pitch: number;
      crouching: boolean;
      reloading: boolean;
      weaponId: WeaponId;
      animState: PlayerAnimState;
      hp: number;
      alive: boolean;
    }
  ): void {
    this.root.position.set(state.x, state.y, state.z);
    this.root.rotation.y = state.yaw;

    if (this.currentWeaponId !== state.weaponId) {
      this.currentWeaponId = state.weaponId;
      for (const [wid, b] of this.thirdPersonWeapons.entries()) {
        b.root.visible = wid === state.weaponId;
      }
    }

    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= dt;
      if (this.muzzleFlashTimer <= 0) {
        for (const b of this.thirdPersonWeapons.values()) {
          b.muzzleFlash.visible = false;
        }
      }
    }

    this.nameplateSprite.visible = state.alive;
    if (state.alive) {
      this.updateNameplate(state.nickname, state.hp, state.team);
    }

    // Death animation: smooth collapse backward to the floor
    if (!state.alive) {
      this.deathProgress = Math.min(1, this.deathProgress + dt * 4.2);
      this.bodyPivot.rotation.x = this.deathProgress * (Math.PI * 0.47);
      this.bodyPivot.position.y = this.deathProgress * 0.15;
      return;
    } else {
      this.deathProgress = 0;
      this.bodyPivot.rotation.x = 0;
      this.bodyPivot.position.y = 0;
    }

    // Crouch stance adjustment (matches buildPlayerHitboxes crouched heights!)
    const targetTorsoY = state.crouching ? 0.45 : 0.80;
    const targetLegScaleY = state.crouching ? 0.56 : 1.0;

    this.torsoGroup.position.y = THREE.MathUtils.lerp(this.torsoGroup.position.y, targetTorsoY, Math.min(1, dt * 15));
    this.leftLegGroup.position.y = this.torsoGroup.position.y;
    this.rightLegGroup.position.y = this.torsoGroup.position.y;
    this.leftLegGroup.scale.y = THREE.MathUtils.lerp(this.leftLegGroup.scale.y, targetLegScaleY, Math.min(1, dt * 15));
    this.rightLegGroup.scale.y = THREE.MathUtils.lerp(this.rightLegGroup.scale.y, targetLegScaleY, Math.min(1, dt * 15));
    this.nameplateSprite.position.y = state.crouching ? 1.56 : 2.12;

    // Walk / Run cycle animation
    const speed = Math.hypot(state.vx, state.vz);
    if (state.animState === 'walk' || state.animState === 'run' || state.animState === 'crouch_walk') {
      this.walkCycle += dt * Math.max(4, speed * 1.9);
      const swing = Math.sin(this.walkCycle) * Math.min(0.65, speed * 0.11);
      this.leftLegGroup.rotation.x = swing;
      this.rightLegGroup.rotation.x = -swing;
    } else if (state.animState === 'jump') {
      this.leftLegGroup.rotation.x = 0.35;
      this.rightLegGroup.rotation.x = -0.25;
    } else {
      this.leftLegGroup.rotation.x = THREE.MathUtils.lerp(this.leftLegGroup.rotation.x, 0, Math.min(1, dt * 12));
      this.rightLegGroup.rotation.x = THREE.MathUtils.lerp(this.rightLegGroup.rotation.x, 0, Math.min(1, dt * 12));
    }

    // Pitch tracking for head & arms
    const clampedPitch = Math.max(-0.8, Math.min(0.8, state.pitch));
    this.headGroup.rotation.x = clampedPitch * 0.7;

    if (state.reloading) {
      const reloadWave = Math.sin(Date.now() * 0.012) * 0.35;
      this.rightArmGroup.rotation.x = clampedPitch * 0.5 - 0.35;
      this.leftArmGroup.rotation.x = clampedPitch * 0.5 + reloadWave;
    } else {
      this.rightArmGroup.rotation.x = clampedPitch * 0.85;
      this.leftArmGroup.rotation.x = clampedPitch * 0.85;
    }
  }

  public dispose(): void {
    this.nameplateTex.dispose();
  }
}
