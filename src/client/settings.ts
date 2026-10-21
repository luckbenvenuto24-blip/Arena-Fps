export interface UserSettings {
  sensitivity: number;
  masterVolume: number;
  sfxVolume: number;
  graphicsQuality: 'low' | 'medium' | 'high';
  renderScale: number;
  fov: number;
  crosshairColor: string;
  crosshairSize: number;
  crosshairGap: number;
  crosshairThickness: number;
  crosshairDot: boolean;
  showFps: boolean;
}

export const DEFAULT_SETTINGS: UserSettings = {
  sensitivity: 1.2,
  masterVolume: 0.8,
  sfxVolume: 0.9,
  graphicsQuality: 'high',
  renderScale: 1.0,
  fov: 82,
  crosshairColor: '#00ff88',
  crosshairSize: 9,
  crosshairGap: 4,
  crosshairThickness: 2,
  crosshairDot: true,
  showFps: true,
};

const STORAGE_KEY = 'arena_strike_settings_v1';

export function loadUserSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveUserSettings(settings: UserSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors
  }
}
