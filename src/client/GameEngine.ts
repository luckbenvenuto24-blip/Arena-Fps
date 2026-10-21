import * as THREE from 'three';
import { getForwardVector, MAP_BOUNDS, MAP_OBJECTS } from '../shared/mapData';
import {
  EYE_HEIGHT_CROUCH,
  EYE_HEIGHT_STANDING,
  PhysicsState,
  stepPlayerPhysics,
} from '../shared/physics';
import {
  ClientMessage,
  PlayerNetState,
  RoomStateSnapshot,
  RoundPhase,
  ShootPayload,
  ShotResultEvent,
  WeaponId,
} from '../shared/types';
import { getRecoilPatternOffset, WEAPON_ORDER, WEAPONS } from '../shared/weapons';
import { FirstPersonViewmodel, ThirdPersonOperator } from './models3d';
import { UserSettings } from './settings';
import { soundManager } from './sound';
import { getGroundMaterial, getMapObjectMaterial } from './textures';

interface TracerEffect {
  line: THREE.Line;
  mat: THREE.LineBasicMaterial;
  life: number;
  maxLife: number;
}

interface SparkParticle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
}

export interface EngineHudBridge {
  onDynamicSpreadChange: (spreadPixels: number, scoped: boolean, weaponId: WeaponId) => void;
  onFpsUpdate: (fps: number) => void;
  onPointerLockChange: (locked: boolean) => void;
  onScoreboardToggle: (visible: boolean) => void;
  onSpectatingChange: (spectatedName: string | null) => void;
}

export class GameEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private viewmodel: FirstPersonViewmodel;

  private settings: UserSettings;
  private hudBridge: EngineHudBridge;
  private sendNetMessage: (msg: ClientMessage) => void;

  private localPlayerId: string = '';
  private roomState: RoomStateSnapshot | null = null;
  private lastKnownRound: number = -1;
  private lastKnownPhase: RoundPhase = 'lobby';

  // Local predicted physics state
  private localPhys: PhysicsState = {
    x: 0,
    y: 0,
    z: -27.5,
    vx: 0,
    vy: 0,
    vz: 0,
    crouching: false,
    walking: false,
    grounded: true,
    yaw: Math.PI,
    pitch: 0,
  };
  private currentEyeHeight = EYE_HEIGHT_STANDING;
  private localWeaponId: WeaponId = 'rifle';
  private previousWeaponId: WeaponId = 'pistol';
  private localScoped = false;
  private localAlive = true;

  // Shooting & Recoil state
  private isMouseDown = false;
  private semiAutoFired = false;
  private lastLocalShotTime = 0;
  private recoilIndex = 0;
  private visualRecoilPitch = 0;
  private visualRecoilYaw = 0;

  // Input keys
  private keys: Set<string> = new Set();
  private jumpQueued = false;
  private inputSeq = 0;
  private lastInputSentAt = 0;
  private footstepAccum = 0;

  // Remote 3D Operators
  private remoteOperators: Map<
    string,
    {
      model: ThirdPersonOperator;
      renderX: number;
      renderY: number;
      renderZ: number;
      renderYaw: number;
      renderPitch: number;
      footstepAccum: number;
    }
  > = new Map();

  // Visual Effects (Tracers, Decals, Sparks)
  private tracers: TracerEffect[] = [];
  private sparks: SparkParticle[] = [];
  private decals: THREE.Mesh[] = [];
  private maxDecals = 60;

  // Spectator state
  private spectateIndex = 0;

  // Loop & FPS tracking
  private animFrameId: number | null = null;
  private lastFrameTime = performance.now();
  private fpsFrames = 0;
  private fpsLastTime = performance.now();
  private disposed = false;

  constructor(
    container: HTMLElement,
    settings: UserSettings,
    hudBridge: EngineHudBridge,
    sendNetMessage: (msg: ClientMessage) => void
  ) {
    this.container = container;
    this.settings = settings;
    this.hudBridge = hudBridge;
    this.sendNetMessage = sendNetMessage;

    // Initialize WebGLRenderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: settings.graphicsQuality !== 'low',
      powerPreference: 'high-performance',
    });
    this.renderer.shadowMap.enabled = settings.graphicsQuality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    this.container.innerHTML = '';
    this.container.appendChild(this.renderer.domElement);

    // Initialize Scene & Camera
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#182232');
    this.scene.fog = new THREE.FogExp2('#182232', 0.011);

    this.camera = new THREE.PerspectiveCamera(
      settings.fov,
      window.innerWidth / window.innerHeight,
      0.08,
      220
    );
    this.camera.rotation.order = 'YXZ';

    // Viewmodel attached to camera
    this.viewmodel = new FirstPersonViewmodel();
    this.camera.add(this.viewmodel.container);
    this.scene.add(this.camera);

    this.buildLighting();
    this.buildArenaMap();
    this.applySettings(settings);
    this.bindEvents();

    this.lastFrameTime = performance.now();
    this.loop();
  }

  private buildLighting(): void {
    const hemiLight = new THREE.HemisphereLight('#93c5fd', '#334155', 0.85);
    hemiLight.position.set(0, 30, 0);
    this.scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight('#fff3e0', 1.65);
    sunLight.position.set(22, 38, 18);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 2;
    sunLight.shadow.camera.far = 110;
    const d = 38;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0005;
    this.scene.add(sunLight);
  }

  private buildArenaMap(): void {
    // 1. Ground Floor Plane
    const groundGeo = new THREE.PlaneGeometry(
      MAP_BOUNDS.halfWidth * 2,
      MAP_BOUNDS.halfDepth * 2
    );
    const groundMesh = new THREE.Mesh(groundGeo, getGroundMaterial());
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.receiveShadow = true;
    this.scene.add(groundMesh);

    // 2. Spawn Tactical Zone Floor Markings (Alpha North & Omega South)
    const alphaZoneMat = new THREE.MeshBasicMaterial({
      color: '#0284c7',
      transparent: true,
      opacity: 0.22,
    });
    const alphaPad = new THREE.Mesh(new THREE.PlaneGeometry(16, 6), alphaZoneMat);
    alphaPad.rotation.x = -Math.PI / 2;
    alphaPad.position.set(0, 0.02, -27.5);
    this.scene.add(alphaPad);

    const omegaZoneMat = new THREE.MeshBasicMaterial({
      color: '#ea580c',
      transparent: true,
      opacity: 0.22,
    });
    const omegaPad = new THREE.Mesh(new THREE.PlaneGeometry(16, 6), omegaZoneMat);
    omegaPad.rotation.x = -Math.PI / 2;
    omegaPad.position.set(0, 0.02, 27.5);
    this.scene.add(omegaPad);

    // 3. Build all 3D Industrial Map Objects
    for (const obj of MAP_OBJECTS) {
      const geo = new THREE.BoxGeometry(obj.w, obj.h, obj.d);
      const mat = getMapObjectMaterial(obj.style, obj.w, obj.h, obj.d);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(obj.x, obj.y, obj.z);
      mesh.castShadow = obj.style !== 'perimeter_wall';
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
  }

  public applySettings(settings: UserSettings): void {
    this.settings = settings;
    soundManager.updateSettings(settings);

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2) * settings.renderScale;

    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.renderer.shadowMap.enabled = settings.graphicsQuality !== 'low';

    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  public setLocalPlayerId(id: string): void {
    this.localPlayerId = id;
  }

  public requestPointerLock(): void {
    if (document.pointerLockElement !== this.renderer.domElement) {
      this.renderer.domElement.requestPointerLock?.();
    }
  }

  public exitPointerLock(): void {
    if (document.pointerLockElement) {
      document.exitPointerLock?.();
    }
  }

  public onRoomState(state: RoomStateSnapshot): void {
    const prevRound = this.lastKnownRound;
    const prevPhase = this.lastKnownPhase;
    this.roomState = state;
    this.lastKnownRound = state.roundNumber;
    this.lastKnownPhase = state.phase;

    const me = state.players.find((p) => p.id === this.localPlayerId);
    if (me) {
      const wasAlive = this.localAlive;
      this.localAlive = me.alive;

      // On new round start or respawn, snap local physics to authoritative spawn
      if (
        state.roundNumber !== prevRound ||
        (prevPhase !== 'freeze' && state.phase === 'freeze') ||
        (!wasAlive && me.alive)
      ) {
        this.localPhys.x = me.x;
        this.localPhys.y = me.y;
        this.localPhys.z = me.z;
        this.localPhys.vx = 0;
        this.localPhys.vy = 0;
        this.localPhys.vz = 0;
        this.localPhys.yaw = me.yaw;
        this.localPhys.pitch = me.pitch;
        this.localPhys.crouching = me.crouching;
        this.localScoped = false;
        this.recoilIndex = 0;
        this.visualRecoilPitch = 0;
        this.visualRecoilYaw = 0;
        this.viewmodel.setWeapon(me.weaponId);
        this.localWeaponId = me.weaponId;
      } else if (me.alive) {
        // Reconcile server position smoothly
        const dx = me.x - this.localPhys.x;
        const dy = me.y - this.localPhys.y;
        const dz = me.z - this.localPhys.z;
        const errDist = Math.hypot(dx, dy, dz);
        if (errDist > 1.8) {
          this.localPhys.x = me.x;
          this.localPhys.y = me.y;
          this.localPhys.z = me.z;
        } else if (errDist > 0.08) {
          this.localPhys.x += dx * 0.25;
          this.localPhys.y += dy * 0.25;
          this.localPhys.z += dz * 0.25;
        }
      }
    }

    // Sync Remote Players' 3D Models
    const activeIds = new Set<string>();
    for (const p of state.players) {
      if (p.id === this.localPlayerId || !p.connected) continue;
      activeIds.add(p.id);

      let entry = this.remoteOperators.get(p.id);
      if (!entry) {
        const model = new ThirdPersonOperator(p.team, p.colorIndex);
        this.scene.add(model.root);
        entry = {
          model,
          renderX: p.x,
          renderY: p.y,
          renderZ: p.z,
          renderYaw: p.yaw,
          renderPitch: p.pitch,
          footstepAccum: 0,
        };
        this.remoteOperators.set(p.id, entry);
      } else {
        // Snap if teleported (new round spawn)
        if (Math.hypot(p.x - entry.renderX, p.z - entry.renderZ) > 5.0) {
          entry.renderX = p.x;
          entry.renderY = p.y;
          entry.renderZ = p.z;
          entry.renderYaw = p.yaw;
        }
      }
    }

    // Remove disconnected players' models
    for (const [id, entry] of this.remoteOperators.entries()) {
      if (!activeIds.has(id)) {
        this.scene.remove(entry.model.root);
        entry.model.dispose();
        this.remoteOperators.delete(id);
      }
    }
  }

  public onShotFired(result: ShotResultEvent): void {
    const startPos = new THREE.Vector3(result.origin.x, result.origin.y, result.origin.z);

    if (result.shooterId === this.localPlayerId) {
      this.viewmodel.getMuzzleWorldPosition(startPos);
    } else {
      const remote = this.remoteOperators.get(result.shooterId);
      if (remote) {
        remote.model.triggerShotEffect();
        remote.model.getMuzzleWorldPosition(startPos);
        const dist = startPos.distanceTo(this.camera.position);
        soundManager.playWeaponShot(result.weaponId, dist);
      }
    }

    const endPos = new THREE.Vector3(result.hitPoint.x, result.hitPoint.y, result.hitPoint.z);

    if (result.weaponId !== 'knife') {
      this.spawnBulletTracer(startPos, endPos, result.weaponId === 'sniper');
    }

    if (result.surfaceType !== 'none') {
      const normal = new THREE.Vector3(result.hitNormal.x, result.hitNormal.y, result.hitNormal.z);
      this.spawnImpactSparks(endPos, normal, result.surfaceType === 'player', Boolean(result.headshot));

      if (result.surfaceType !== 'player') {
        this.spawnBulletDecal(endPos, normal);
      }
    }
  }

  public onReloadStarted(playerId: string, durationMs: number): void {
    if (playerId === this.localPlayerId) {
      this.localScoped = false;
      this.viewmodel.triggerReload(durationMs);
      soundManager.playReload();
    }
  }

  private spawnBulletTracer(start: THREE.Vector3, end: THREE.Vector3, isSniper: boolean): void {
    const points = [start.clone(), end.clone()];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color: isSniper ? '#38bdf8' : '#fde047',
      transparent: true,
      opacity: 0.85,
    });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    const maxLife = isSniper ? 0.22 : 0.085;
    this.tracers.push({ line, mat, life: maxLife, maxLife });
  }

  private spawnImpactSparks(
    pos: THREE.Vector3,
    normal: THREE.Vector3,
    isPlayer: boolean,
    isHeadshot: boolean
  ): void {
    const count = isHeadshot ? 12 : isPlayer ? 8 : 5;
    const color = isPlayer ? (isHeadshot ? '#fbbf24' : '#ef4444') : '#f59e0b';
    const mat = new THREE.MeshBasicMaterial({ color });
    const geo = new THREE.BoxGeometry(0.04, 0.04, 0.04);

    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      this.scene.add(mesh);

      const speed = 2.0 + Math.random() * 4.5;
      const vx = (normal.x + (Math.random() - 0.5) * 1.3) * speed;
      const vy = (Math.abs(normal.y) + Math.random() * 1.1) * speed;
      const vz = (normal.z + (Math.random() - 0.5) * 1.3) * speed;

      this.sparks.push({
        mesh,
        vx,
        vy,
        vz,
        life: 0.18 + Math.random() * 0.14,
      });
    }
  }

  private spawnBulletDecal(pos: THREE.Vector3, normal: THREE.Vector3): void {
    const decalGeo = new THREE.PlaneGeometry(0.11, 0.11);
    const decalMat = new THREE.MeshBasicMaterial({
      color: '#090d16',
      transparent: true,
      opacity: 0.78,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const decal = new THREE.Mesh(decalGeo, decalMat);
    decal.position.copy(pos).addScaledVector(normal, 0.012);
    decal.lookAt(pos.clone().add(normal));
    this.scene.add(decal);

    this.decals.push(decal);
    if (this.decals.length > this.maxDecals) {
      const oldest = this.decals.shift();
      if (oldest) {
        this.scene.remove(oldest);
        oldest.geometry.dispose();
      }
    }
  }

  public selectWeapon(weaponId: WeaponId): void {
    if (!WEAPONS[weaponId] || weaponId === this.localWeaponId) return;
    this.previousWeaponId = this.localWeaponId;
    this.localWeaponId = weaponId;
    this.localScoped = false;
    this.recoilIndex = 0;
    this.viewmodel.setWeapon(weaponId);
    soundManager.playWeaponSwitch();
    this.sendNetMessage({ type: 'switch_weapon', weaponId });
  }

  private bindEvents(): void {
    window.addEventListener('resize', this.handleResize);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mouseup', this.handleMouseUp);
    window.addEventListener('wheel', this.handleWheel);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('contextmenu', this.handleContextMenu);
  }

  private unbindEvents(): void {
    window.removeEventListener('resize', this.handleResize);
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mouseup', this.handleMouseUp);
    window.removeEventListener('wheel', this.handleWheel);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('contextmenu', this.handleContextMenu);
  }

  private handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };

  private handleResize = () => {
    this.applySettings(this.settings);
  };

  private handlePointerLockChange = () => {
    const locked = document.pointerLockElement === this.renderer.domElement;
    if (!locked) {
      this.isMouseDown = false;
      this.keys.clear();
    }
    this.hudBridge.onPointerLockChange(locked);
  };

  private handleMouseMove = (e: MouseEvent) => {
    if (document.pointerLockElement !== this.renderer.domElement) return;
    if (!this.localAlive) return;

    const w = WEAPONS[this.localWeaponId];
    const scopeMult = this.localScoped ? (w.hasScope ? 0.32 : 0.65) : 1.0;
    const sens = this.settings.sensitivity * 0.0021 * scopeMult;

    this.localPhys.yaw -= e.movementX * sens;
    this.localPhys.pitch = Math.max(
      -Math.PI * 0.485,
      Math.min(Math.PI * 0.485, this.localPhys.pitch - e.movementY * sens)
    );
  };

  private handleMouseDown = (e: MouseEvent) => {
    if (document.pointerLockElement !== this.renderer.domElement) return;

    if (!this.localAlive) {
      if (e.button === 0) {
        this.spectateIndex++;
      }
      return;
    }

    if (e.button === 0) {
      this.isMouseDown = true;
      this.semiAutoFired = false;
      this.tryFireShot();
    } else if (e.button === 2) {
      // Secondary aim / Sniper Scope
      const w = WEAPONS[this.localWeaponId];
      if (w.hasScope || w.hasTacticalAim) {
        this.localScoped = !this.localScoped;
        soundManager.playWeaponSwitch();
      } else if (w.melee) {
        this.tryFireShot();
      }
    }
  };

  private handleMouseUp = (e: MouseEvent) => {
    if (e.button === 0) {
      this.isMouseDown = false;
      this.semiAutoFired = false;
    }
  };

  private handleWheel = (e: WheelEvent) => {
    if (document.pointerLockElement !== this.renderer.domElement) return;
    if (!this.localAlive) return;
    const idx = WEAPON_ORDER.indexOf(this.localWeaponId);
    const nextIdx = (idx + (e.deltaY > 0 ? 1 : -1) + WEAPON_ORDER.length) % WEAPON_ORDER.length;
    this.selectWeapon(WEAPON_ORDER[nextIdx]);
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Tab') {
      e.preventDefault();
      this.hudBridge.onScoreboardToggle(true);
      return;
    }

    if (document.pointerLockElement !== this.renderer.domElement) return;

    this.keys.add(e.code);

    if (e.code === 'Space') {
      if (!this.localAlive) {
        this.spectateIndex++;
      } else {
        this.jumpQueued = true;
      }
    } else if (e.code === 'KeyR') {
      if (this.localAlive) {
        this.sendNetMessage({ type: 'reload' });
      }
    } else if (e.code === 'Digit1') {
      this.selectWeapon('rifle');
    } else if (e.code === 'Digit2') {
      this.selectWeapon('smg');
    } else if (e.code === 'Digit3') {
      this.selectWeapon('sniper');
    } else if (e.code === 'Digit4') {
      this.selectWeapon('pistol');
    } else if (e.code === 'Digit5') {
      this.selectWeapon('knife');
    } else if (e.code === 'KeyQ') {
      this.selectWeapon(this.previousWeaponId);
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'Tab') {
      e.preventDefault();
      this.hudBridge.onScoreboardToggle(false);
      return;
    }
    this.keys.delete(e.code);
  };

  private tryFireShot(): void {
    if (!this.roomState || this.roomState.phase !== 'live' || !this.localAlive) return;

    const me = this.roomState.players.find((p) => p.id === this.localPlayerId);
    if (!me || me.reloading) return;

    const weapon = WEAPONS[this.localWeaponId];
    if (!weapon.automatic && this.semiAutoFired) return;

    const now = performance.now();
    if (now - this.lastLocalShotTime < weapon.fireIntervalMs) return;

    const ammo = me.ammo[this.localWeaponId];
    if (!weapon.melee && ammo && ammo.magazine <= 0) {
      if (ammo.reserve > 0) {
        this.sendNetMessage({ type: 'reload' });
      }
      this.semiAutoFired = true;
      return;
    }

    this.lastLocalShotTime = now;
    this.semiAutoFired = true;

    // Optimistic local ammo decrement
    if (!weapon.melee && ammo && ammo.magazine > 0) {
      ammo.magazine -= 1;
    }

    // Calculate recoil pattern & movement spread
    const recoil = getRecoilPatternOffset(this.localWeaponId, this.recoilIndex);
    this.recoilIndex = Math.min(30, this.recoilIndex + 1);

    const speed = Math.hypot(this.localPhys.vx, this.localPhys.vz);
    let spread = weapon.baseSpread;
    if (!this.localPhys.grounded) {
      spread += weapon.jumpSpreadPenalty;
    } else if (speed > 0.4) {
      spread += weapon.moveSpreadPenalty * Math.min(1, speed / 6.0);
    }
    if (this.localPhys.crouching) {
      spread *= weapon.crouchSpreadBonus;
    }
    if (this.localScoped) {
      spread *= weapon.scopedSpreadBonus;
    }

    const randPitch = (Math.random() - 0.5) * spread;
    const randYaw = (Math.random() - 0.5) * spread;

    const effectivePitch = Math.max(
      -Math.PI * 0.485,
      Math.min(Math.PI * 0.485, this.localPhys.pitch + recoil.pitchOffset + randPitch)
    );
    const effectiveYaw = this.localPhys.yaw + recoil.yawOffset + randYaw;

    // Apply visual recoil punch to camera
    this.visualRecoilPitch = Math.min(0.14, this.visualRecoilPitch + weapon.recoilPitchStep * 0.75);
    this.visualRecoilYaw = recoil.yawOffset * 0.5;

    const eyeY = this.localPhys.y + (this.localPhys.crouching ? EYE_HEIGHT_CROUCH : EYE_HEIGHT_STANDING);
    const origin = {
      x: this.localPhys.x,
      y: eyeY,
      z: this.localPhys.z,
    };
    const direction = getForwardVector(effectiveYaw, effectivePitch);

    this.viewmodel.triggerShot();
    soundManager.playWeaponShot(this.localWeaponId, 0);

    // Unscope bolt-action sniper briefly after firing (like AWP in CS2)
    if (this.localWeaponId === 'sniper' && this.localScoped) {
      this.localScoped = false;
    }

    const payload: ShootPayload = {
      shotId: `${Date.now()}_${this.inputSeq}`,
      origin,
      direction,
      yaw: this.localPhys.yaw,
      pitch: this.localPhys.pitch,
      weaponId: this.localWeaponId,
      recoilIndex: this.recoilIndex,
      scoped: this.localScoped,
      clientTimestamp: Date.now(),
    };

    this.sendNetMessage({ type: 'shoot', payload });
  }

  private loop = () => {
    if (this.disposed) return;
    this.animFrameId = requestAnimationFrame(this.loop);

    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0.001, (now - this.lastFrameTime) / 1000));
    this.lastFrameTime = now;

    // Track FPS
    this.fpsFrames++;
    if (now - this.fpsLastTime >= 500) {
      const fps = Math.round((this.fpsFrames * 1000) / (now - this.fpsLastTime));
      this.hudBridge.onFpsUpdate(fps);
      this.fpsFrames = 0;
      this.fpsLastTime = now;
    }

    this.updateSimulation(dt, now);
    this.renderer.render(this.scene, this.camera);
  };

  private updateSimulation(dt: number, now: number): void {
    const phase = this.roomState?.phase || 'lobby';

    // Decay continuous recoil when not firing
    const weapon = WEAPONS[this.localWeaponId];
    if (now - this.lastLocalShotTime > weapon.fireIntervalMs * 1.45) {
      this.recoilIndex = Math.max(0, this.recoilIndex - dt * 18);
    }
    this.visualRecoilPitch = THREE.MathUtils.lerp(this.visualRecoilPitch, 0, Math.min(1, dt * 12));
    this.visualRecoilYaw = THREE.MathUtils.lerp(this.visualRecoilYaw, 0, Math.min(1, dt * 12));

    if (this.localAlive && (phase === 'live' || phase === 'freeze')) {
      this.hudBridge.onSpectatingChange(null);

      // Continuous automatic fire while holding mouse button
      if (this.isMouseDown && weapon.automatic && phase === 'live') {
        this.tryFireShot();
      }

      const forward =
        (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) -
        (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0);
      const right =
        (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) -
        (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
      const crouch =
        this.keys.has('ControlLeft') ||
        this.keys.has('ControlRight') ||
        this.keys.has('KeyC');
      const walk = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
      const jump = this.jumpQueued || this.keys.has('Space');
      this.jumpQueued = false;

      const inputPayload = {
        seq: ++this.inputSeq,
        dt,
        forward,
        right,
        jump,
        crouch,
        walk,
        scoped: this.localScoped,
        yaw: this.localPhys.yaw,
        pitch: this.localPhys.pitch,
        weaponId: this.localWeaponId,
        clientTimestamp: Date.now(),
      };

      this.localPhys = stepPlayerPhysics(
        this.localPhys,
        inputPayload,
        phase === 'freeze'
      );

      // Send input to server at ~35Hz
      if (now - this.lastInputSentAt >= 28 || jump) {
        this.lastInputSentAt = now;
        this.sendNetMessage({ type: 'player_input', input: inputPayload });
      }

      // Smooth eye height for crouching
      const targetEye = this.localPhys.crouching ? EYE_HEIGHT_CROUCH : EYE_HEIGHT_STANDING;
      this.currentEyeHeight = THREE.MathUtils.lerp(
        this.currentEyeHeight,
        targetEye,
        Math.min(1, dt * 16)
      );

      this.camera.position.set(
        this.localPhys.x,
        this.localPhys.y + this.currentEyeHeight,
        this.localPhys.z
      );
      this.camera.rotation.y = this.localPhys.yaw + this.visualRecoilYaw;
      this.camera.rotation.x = Math.max(
        -Math.PI * 0.49,
        Math.min(Math.PI * 0.49, this.localPhys.pitch + this.visualRecoilPitch)
      );

      // Footsteps for local player when moving on ground and not silent-walking
      const moveSpeed = Math.hypot(this.localPhys.vx, this.localPhys.vz);
      if (this.localPhys.grounded && moveSpeed > 3.6 && !this.localPhys.walking && !this.localPhys.crouching) {
        this.footstepAccum += dt * moveSpeed;
        if (this.footstepAccum >= 2.35) {
          this.footstepAccum = 0;
          soundManager.playFootstep(0);
        }
      } else {
        this.footstepAccum = 1.2;
      }

      // Update FOV for scope / ADS
      const targetFov = this.localScoped ? weapon.scopeFov : this.settings.fov;
      if (Math.abs(this.camera.fov - targetFov) > 0.1) {
        this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, Math.min(1, dt * 18));
        this.camera.updateProjectionMatrix();
      }

      this.viewmodel.update(dt, moveSpeed, this.localPhys.grounded, this.localScoped, true);

      // Compute dynamic crosshair spread in pixels
      let spreadPx = 0;
      if (!this.localPhys.grounded) spreadPx += 22;
      else if (moveSpeed > 0.5) spreadPx += (moveSpeed / 6.0) * 12;
      if (this.localPhys.crouching) spreadPx *= 0.5;
      spreadPx += this.recoilIndex * 1.4;
      this.hudBridge.onDynamicSpreadChange(spreadPx, this.localScoped, this.localWeaponId);
    } else if (!this.localAlive && this.roomState) {
      // Spectator mode: follow surviving players
      this.viewmodel.update(dt, 0, true, false, false);
      const aliveOthers = this.roomState.players.filter(
        (p) => p.id !== this.localPlayerId && p.connected && p.alive
      );
      if (aliveOthers.length > 0) {
        const target: PlayerNetState = aliveOthers[this.spectateIndex % aliveOthers.length];
        this.hudBridge.onSpectatingChange(target.nickname);
        const backX = Math.sin(target.yaw) * 3.2;
        const backZ = Math.cos(target.yaw) * 3.2;
        this.camera.position.lerp(
          new THREE.Vector3(target.x + backX, target.y + 2.2, target.z + backZ),
          Math.min(1, dt * 10)
        );
        this.camera.lookAt(target.x, target.y + 1.3, target.z);
      } else {
        this.hudBridge.onSpectatingChange(null);
      }
    }

    // Update Remote Players interpolation & 3D character animations
    if (this.roomState) {
      for (const p of this.roomState.players) {
        if (p.id === this.localPlayerId) continue;
        const entry = this.remoteOperators.get(p.id);
        if (!entry) continue;

        const lerpFactor = Math.min(1, dt * 18);
        entry.renderX = THREE.MathUtils.lerp(entry.renderX, p.x, lerpFactor);
        entry.renderY = THREE.MathUtils.lerp(entry.renderY, p.y, lerpFactor);
        entry.renderZ = THREE.MathUtils.lerp(entry.renderZ, p.z, lerpFactor);

        // Shortest-angle yaw interpolation
        let diffYaw = p.yaw - entry.renderYaw;
        while (diffYaw > Math.PI) diffYaw -= Math.PI * 2;
        while (diffYaw < -Math.PI) diffYaw += Math.PI * 2;
        entry.renderYaw += diffYaw * lerpFactor;
        entry.renderPitch = THREE.MathUtils.lerp(entry.renderPitch, p.pitch, lerpFactor);

        // Remote player footsteps
        const remoteSpeed = Math.hypot(p.vx, p.vz);
        if (p.alive && p.grounded && remoteSpeed > 3.6 && !p.walking && !p.crouching) {
          entry.footstepAccum += dt * remoteSpeed;
          if (entry.footstepAccum >= 2.4) {
            entry.footstepAccum = 0;
            const dist = Math.hypot(
              entry.renderX - this.camera.position.x,
              entry.renderZ - this.camera.position.z
            );
            soundManager.playFootstep(dist);
          }
        }

        entry.model.update(dt, {
          nickname: p.nickname,
          team: p.team,
          x: entry.renderX,
          y: entry.renderY,
          z: entry.renderZ,
          vx: p.vx,
          vz: p.vz,
          yaw: entry.renderYaw,
          pitch: entry.renderPitch,
          crouching: p.crouching,
          reloading: p.reloading,
          weaponId: p.weaponId,
          animState: p.animState,
          hp: p.hp,
          alive: p.alive,
        });
      }
    }

    // Update Bullet Tracers
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        t.mat.dispose();
        this.tracers.splice(i, 1);
      } else {
        t.mat.opacity = (t.life / t.maxLife) * 0.85;
      }
    }

    // Update Impact Sparks
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        this.sparks.splice(i, 1);
      } else {
        s.vy -= 14.0 * dt;
        s.mesh.position.x += s.vx * dt;
        s.mesh.position.y += s.vy * dt;
        s.mesh.position.z += s.vz * dt;
      }
    }
  }

  public dispose(): void {
    this.disposed = true;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
    }
    this.unbindEvents();
    this.exitPointerLock();
    for (const entry of this.remoteOperators.values()) {
      entry.model.dispose();
    }
    this.renderer.dispose();
  }
}
