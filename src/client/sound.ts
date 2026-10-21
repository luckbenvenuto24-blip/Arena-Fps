import { WeaponId } from '../shared/types';
import { UserSettings } from './settings';

class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private settings: UserSettings | null = null;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.7;
      this.masterGain.connect(this.ctx.destination);
      this.createNoiseBuffer();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private createNoiseBuffer(): void {
    if (!this.ctx) return;
    const sampleRate = this.ctx.sampleRate;
    const length = sampleRate * 1.0;
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
  }

  public updateSettings(settings: UserSettings): void {
    this.settings = settings;
    if (this.masterGain && this.ctx) {
      const vol = Math.max(0, Math.min(1, settings.masterVolume * settings.sfxVolume));
      this.masterGain.gain.setValueAtTime(vol, this.ctx.currentTime);
    }
  }

  private getVolumeScale(distance = 0): number {
    const base = this.settings ? this.settings.masterVolume * this.settings.sfxVolume : 0.72;
    if (distance <= 1) return base;
    const atten = Math.max(0.05, 1 - distance / 55);
    return base * atten;
  }

  public playWeaponShot(weaponId: WeaponId, distance = 0): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || !this.noiseBuffer) return;

    const vol = this.getVolumeScale(distance);
    if (vol <= 0.01) return;

    const now = ctx.currentTime;

    if (weaponId === 'knife') {
      // Metallic blade slash whoosh
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1600, now);
      filter.frequency.exponentialRampToValueAtTime(420, now + 0.14);
      filter.Q.value = 3.2;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.35 * vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      src.start(now);
      src.stop(now + 0.16);
      return;
    }

    // Noise burst for gunshot report
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';

    const noiseGain = ctx.createGain();

    // Low-end punch oscillator
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();

    if (weaponId === 'rifle') {
      // KR-47 Vandal: Aggressive mid-low punch + metallic crack
      filter.frequency.setValueAtTime(2600, now);
      filter.frequency.exponentialRampToValueAtTime(280, now + 0.18);
      noiseGain.gain.setValueAtTime(0.75 * vol, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(155, now);
      osc.frequency.exponentialRampToValueAtTime(38, now + 0.11);
      oscGain.gain.setValueAtTime(0.55 * vol, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    } else if (weaponId === 'smg') {
      // VX-9 Specter: Snappy tight high-RPM report
      filter.frequency.setValueAtTime(3200, now);
      filter.frequency.exponentialRampToValueAtTime(520, now + 0.10);
      noiseGain.gain.setValueAtTime(0.52 * vol, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(210, now);
      osc.frequency.exponentialRampToValueAtTime(65, now + 0.07);
      oscGain.gain.setValueAtTime(0.4 * vol, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    } else if (weaponId === 'sniper') {
      // AWM-X Titan: Thunderous heavy cannon + long tail
      filter.frequency.setValueAtTime(3800, now);
      filter.frequency.exponentialRampToValueAtTime(160, now + 0.48);
      noiseGain.gain.setValueAtTime(1.0 * vol, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.50);

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(110, now);
      osc.frequency.exponentialRampToValueAtTime(24, now + 0.28);
      oscGain.gain.setValueAtTime(0.85 * vol, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.30);
    } else {
      // P-250 Pistol: Crisp sharp crack
      filter.frequency.setValueAtTime(3400, now);
      filter.frequency.exponentialRampToValueAtTime(450, now + 0.12);
      noiseGain.gain.setValueAtTime(0.58 * vol, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

      osc.type = 'square';
      osc.frequency.setValueAtTime(190, now);
      osc.frequency.exponentialRampToValueAtTime(55, now + 0.08);
      oscGain.gain.setValueAtTime(0.35 * vol, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    }

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    osc.connect(oscGain);
    oscGain.connect(this.masterGain);

    const dur = weaponId === 'sniper' ? 0.52 : 0.22;
    noise.start(now);
    noise.stop(now + dur);
    osc.start(now);
    osc.stop(now + dur);
  }

  public playFootstep(distance = 0): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || !this.noiseBuffer) return;

    const vol = this.getVolumeScale(distance) * 0.28;
    if (vol <= 0.01) return;

    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(240 + Math.random() * 90, now);
    filter.Q.value = 2.2;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    src.start(now);
    src.stop(now + 0.07);
  }

  public playReload(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const vol = this.getVolumeScale(0) * 0.45;
    const now = ctx.currentTime;

    // Click 1: Mag out
    const osc1 = ctx.createOscillator();
    const g1 = ctx.createGain();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(580, now);
    osc1.frequency.exponentialRampToValueAtTime(260, now + 0.06);
    g1.gain.setValueAtTime(vol, now);
    g1.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc1.connect(g1);
    g1.connect(this.masterGain);
    osc1.start(now);
    osc1.stop(now + 0.08);

    // Click 2: Mag in
    const osc2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(420, now + 0.55);
    osc2.frequency.exponentialRampToValueAtTime(780, now + 0.62);
    g2.gain.setValueAtTime(vol, now + 0.55);
    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.64);
    osc2.connect(g2);
    g2.connect(this.masterGain);
    osc2.start(now + 0.55);
    osc2.stop(now + 0.65);
  }

  public playWeaponSwitch(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const vol = this.getVolumeScale(0) * 0.3;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(500, now);
    osc.frequency.exponentialRampToValueAtTime(900, now + 0.045);
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.055);
  }

  public playHitmarker(headshot: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const vol = this.getVolumeScale(0) * 0.65;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const g = ctx.createGain();

    if (headshot) {
      // Classic metallic CS2 headshot dink
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1950, now);
      osc.frequency.exponentialRampToValueAtTime(1150, now + 0.11);
      g.gain.setValueAtTime(vol, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    } else {
      // Crisp body hit tick
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1100, now);
      osc.frequency.exponentialRampToValueAtTime(480, now + 0.05);
      g.gain.setValueAtTime(vol * 0.75, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
    }

    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  public playHurt(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const vol = this.getVolumeScale(0) * 0.6;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(130, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.14);
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  public playKillConfirm(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const vol = this.getVolumeScale(0) * 0.55;
    const now = ctx.currentTime;

    const notes = [660, 880];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.07);
      g.gain.setValueAtTime(vol, now + idx * 0.07);
      g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.16);
      osc.connect(g);
      g.connect(this.masterGain!);
      osc.start(now + idx * 0.07);
      osc.stop(now + idx * 0.07 + 0.17);
    });
  }

  public playRoundEnd(victory: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const vol = this.getVolumeScale(0) * 0.5;
    const now = ctx.currentTime;

    const freqs = victory ? [440, 554.37, 659.25, 880] : [392, 349.23, 311.13, 261.63];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, now + idx * 0.11);
      g.gain.setValueAtTime(vol, now + idx * 0.11);
      g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.11 + 0.35);
      osc.connect(g);
      g.connect(this.masterGain!);
      osc.start(now + idx * 0.11);
      osc.stop(now + idx * 0.11 + 0.36);
    });
  }
}

export const soundManager = new SoundManager();
