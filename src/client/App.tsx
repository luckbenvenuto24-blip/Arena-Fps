import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ClientMessage,
  DamageEvent,
  GameMode,
  PublicRoomSummary,
  RoomStateSnapshot,
  ServerMessage,
  ShotResultEvent,
  TeamId,
  WeaponId,
} from '../shared/types';
import { WEAPON_ORDER, WEAPONS } from '../shared/weapons';
import { EngineHudBridge, GameEngine } from './GameEngine';
import { ArenaNetworkClient } from './network';
import { loadUserSettings, saveUserSettings, UserSettings } from './settings';
import { soundManager } from './sound';

const NICKNAME_STORAGE_KEY = 'arena_strike_nickname';
const RECONNECT_STORAGE_KEY = 'arena_strike_reconnect_token';

interface HitmarkerFeedback {
  id: number;
  headshot: boolean;
  damage: number;
  killed: boolean;
}

export const App: React.FC = () => {
  const [nickname, setNickname] = useState<string>(() => {
    return localStorage.getItem(NICKNAME_STORAGE_KEY) || `Operador_${Math.floor(100 + Math.random() * 899)}`;
  });

  const [wsConnected, setWsConnected] = useState<boolean>(true);
  const [netStatusLabel, setNetStatusLabel] = useState<string>('MULTIPLAYER ONLINE PRONTO');
  const [clientId, setClientId] = useState<string>('');
  const [roomState, setRoomState] = useState<RoomStateSnapshot | null>(null);
  const [publicRooms, setPublicRooms] = useState<PublicRoomSummary[]>([]);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [copyToast, setCopyToast] = useState<string | null>(null);

  // Menu navigation modals
  const [activeModal, setActiveModal] = useState<'none' | 'create' | 'join' | 'settings' | 'arsenal'>('none');
  const [joinCodeInput, setJoinCodeInput] = useState<string>('');
  const [createMode, setCreateMode] = useState<GameMode>('x1');
  const [createMaxPlayers, setCreateMaxPlayers] = useState<number>(2);
  const [createMaxRounds, setCreateMaxRounds] = useState<number>(9);

  // Settings
  const [settings, setSettings] = useState<UserSettings>(() => loadUserSettings());

  // In-game HUD states
  const [pointerLocked, setPointerLocked] = useState<boolean>(false);
  const [scoreboardOpen, setScoreboardOpen] = useState<boolean>(false);
  const [fps, setFps] = useState<number>(60);
  const [dynamicSpread, setDynamicSpread] = useState<number>(0);
  const [isScoped, setIsScoped] = useState<boolean>(false);
  const [equippedWeaponId, setEquippedWeaponId] = useState<WeaponId>('rifle');
  const [spectatingName, setSpectatingName] = useState<string | null>(null);
  const [hitmarker, setHitmarker] = useState<HitmarkerFeedback | null>(null);
  const [hurtFlash, setHurtFlash] = useState<number>(0);

  const netClientRef = useRef<ArenaNetworkClient | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const clientIdRef = useRef<string>('');
  const hitmarkerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hurtTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Save nickname
  useEffect(() => {
    if (nickname.trim()) {
      localStorage.setItem(NICKNAME_STORAGE_KEY, nickname.trim());
    }
  }, [nickname]);

  const sendNetMessage = useCallback((msg: ClientMessage) => {
    netClientRef.current?.send(msg);
  }, []);

  // Check URL invite parameter (?room=CODE)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inviteCode = params.get('room');
    if (inviteCode && inviteCode.trim().length >= 4) {
      setJoinCodeInput(inviteCode.trim().toUpperCase());
      setActiveModal('join');
    }
  }, []);

  // Establish Hybrid WebSocket + Global WebRTC Network Client
  useEffect(() => {
    const handleServerMessage = (msg: ServerMessage) => {
      switch (msg.type) {
        case 'welcome': {
          clientIdRef.current = msg.clientId;
          setClientId(msg.clientId);
          if (!sessionStorage.getItem(RECONNECT_STORAGE_KEY)) {
            sessionStorage.setItem(RECONNECT_STORAGE_KEY, msg.reconnectToken);
          }
          break;
        }

        case 'room_list': {
          setPublicRooms(msg.rooms);
          break;
        }

        case 'room_joined': {
          clientIdRef.current = msg.playerId;
          setClientId(msg.playerId);
          sessionStorage.setItem(RECONNECT_STORAGE_KEY, msg.reconnectToken);
          setRoomState(msg.state);
          setActiveModal('none');
          setErrorBanner(null);
          if (engineRef.current) {
            engineRef.current.setLocalPlayerId(msg.playerId);
            engineRef.current.onRoomState(msg.state);
          }
          break;
        }

        case 'room_state': {
          setRoomState(msg.state);
          if (engineRef.current) {
            engineRef.current.onRoomState(msg.state);
          }
          break;
        }

        case 'shot_fired': {
          const res: ShotResultEvent = msg.result;
          if (engineRef.current) {
            engineRef.current.onShotFired(res);
          }
          break;
        }

        case 'damage_event': {
          const ev: DamageEvent = msg.event;
          const myId = clientIdRef.current;
          if (ev.attackerId === myId) {
            soundManager.playHitmarker(ev.headshot);
            if (ev.killed) {
              soundManager.playKillConfirm();
            }
            setHitmarker({
              id: Date.now(),
              headshot: ev.headshot,
              damage: ev.damage,
              killed: ev.killed,
            });
            if (hitmarkerTimeoutRef.current) clearTimeout(hitmarkerTimeoutRef.current);
            hitmarkerTimeoutRef.current = setTimeout(() => setHitmarker(null), 420);
          }
          if (ev.victimId === myId) {
            soundManager.playHurt();
            setHurtFlash(Date.now());
            if (hurtTimeoutRef.current) clearTimeout(hurtTimeoutRef.current);
            hurtTimeoutRef.current = setTimeout(() => setHurtFlash(0), 380);
          }
          break;
        }

        case 'reload_started': {
          if (engineRef.current) {
            engineRef.current.onReloadStarted(msg.playerId, msg.durationMs);
          }
          break;
        }

        case 'round_ended': {
          const isWin = msg.winnerTitle.includes('VENCEU');
          soundManager.playRoundEnd(isWin);
          break;
        }

        case 'match_ended': {
          soundManager.playRoundEnd(true);
          if (engineRef.current) {
            engineRef.current.exitPointerLock();
          }
          break;
        }

        case 'error': {
          setErrorBanner(msg.message);
          break;
        }
      }
    };

    const netClient = new ArenaNetworkClient(handleServerMessage, (online, label) => {
      setWsConnected(online);
      setNetStatusLabel(label);
    });
    netClientRef.current = netClient;
    clientIdRef.current = netClient.clientId;
    setClientId(netClient.clientId);

    const pingInterval = setInterval(() => {
      netClient.send({
        type: 'ping_check',
        clientTimestamp: Date.now(),
      });
    }, 2500);

    return () => {
      clearInterval(pingInterval);
      netClient.close();
    };
  }, []);

  // Mount/unmount 3D GameEngine when inside an active match phase
  const inMatchPhase =
    roomState &&
    (roomState.phase === 'freeze' ||
      roomState.phase === 'live' ||
      roomState.phase === 'round_end' ||
      roomState.phase === 'match_end');

  useEffect(() => {
    if (!inMatchPhase || !canvasContainerRef.current) {
      if (engineRef.current) {
        engineRef.current.dispose();
        engineRef.current = null;
      }
      return;
    }

    if (!engineRef.current) {
      const bridge: EngineHudBridge = {
        onDynamicSpreadChange: (spreadPx, scoped, wid) => {
          setDynamicSpread(spreadPx);
          setIsScoped(scoped);
          setEquippedWeaponId(wid);
        },
        onFpsUpdate: (currentFps) => setFps(currentFps),
        onPointerLockChange: (locked) => setPointerLocked(locked),
        onScoreboardToggle: (visible) => setScoreboardOpen(visible),
        onSpectatingChange: (specName) => setSpectatingName(specName),
      };

      const engine = new GameEngine(
        canvasContainerRef.current,
        settings,
        bridge,
        sendNetMessage
      );
      engine.setLocalPlayerId(clientIdRef.current);
      if (roomState) {
        engine.onRoomState(roomState);
      }
      engineRef.current = engine;
    }
  }, [inMatchPhase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep engine settings synced
  useEffect(() => {
    saveUserSettings(settings);
    soundManager.updateSettings(settings);
    if (engineRef.current) {
      engineRef.current.applySettings(settings);
    }
  }, [settings]);

  const localPlayer = useMemo(() => {
    if (!roomState) return null;
    return roomState.players.find((p) => p.id === clientId) || null;
  }, [roomState, clientId]);

  const handleQuickX1Create = () => {
    const token = sessionStorage.getItem(RECONNECT_STORAGE_KEY) || undefined;
    sendNetMessage({
      type: 'create_room',
      nickname: nickname.trim() || 'Operador',
      roomName: `Duelo X1 de ${nickname.trim() || 'Operador'}`,
      mode: 'x1',
      maxPlayers: 2,
      maxRounds: 9,
      reconnectToken: token,
    });
  };

  const handleCreateCustomRoom = (e: React.FormEvent) => {
    e.preventDefault();
    const token = sessionStorage.getItem(RECONNECT_STORAGE_KEY) || undefined;
    sendNetMessage({
      type: 'create_room',
      nickname: nickname.trim() || 'Operador',
      roomName: `Arena de ${nickname.trim() || 'Operador'}`,
      mode: createMode,
      maxPlayers: createMaxPlayers,
      maxRounds: createMaxRounds,
      reconnectToken: token,
    });
  };

  const handleJoinRoomByCode = (codeToJoin: string) => {
    const clean = codeToJoin.trim().toUpperCase();
    if (!clean) {
      setErrorBanner('Informe o código da sala para entrar.');
      return;
    }
    const token = sessionStorage.getItem(RECONNECT_STORAGE_KEY) || undefined;
    sendNetMessage({
      type: 'join_room',
      code: clean,
      nickname: nickname.trim() || 'Operador',
      reconnectToken: token,
    });
  };

  const handleLeaveRoom = () => {
    sendNetMessage({ type: 'leave_room' });
    setRoomState(null);
    setPointerLocked(false);
    // Clear ?room URL parameter if present
    if (window.location.search.includes('room=')) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopyToast(label);
    setTimeout(() => setCopyToast(null), 2400);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const formatTimer = (ms: number): string => {
    const totalSec = Math.ceil(Math.max(0, ms) / 1000);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const getModeLabel = (mode: GameMode): string => {
    switch (mode) {
      case 'x1':
        return 'DUELO X1 (1 vs 1)';
      case 'ffa':
        return 'TODOS CONTRA TODOS (FFA)';
      case '2v2':
        return 'EQUIPES TÁTICAS (2 vs 2)';
      case '3v3':
        return 'ESQUADRÃO COMPLETO (3 vs 3)';
    }
  };

  // ==================== RENDER: IN-GAME 3D MATCH VIEW & HUD ====================
  if (roomState && inMatchPhase) {
    const activeWeaponId = localPlayer?.weaponId || equippedWeaponId;
    const weaponDef = WEAPONS[activeWeaponId] || WEAPONS.rifle;
    const currentAmmo = localPlayer?.ammo[activeWeaponId] || { magazine: 0, reserve: 0 };

    const alphaPlayers = roomState.players.filter((p) => p.team === 'alpha' && p.connected);
    const omegaPlayers = roomState.players.filter((p) => p.team === 'omega' && p.connected);
    const alphaAlive = alphaPlayers.filter((p) => p.alive).length;
    const omegaAlive = omegaPlayers.filter((p) => p.alive).length;

    const totalCrosshairGap = Math.round(settings.crosshairGap + dynamicSpread);

    return (
      <div className="game-viewport">
        {/* 3D WebGL Canvas Mount */}
        <div
          ref={canvasContainerRef}
          className="webgl-container"
          onClick={() => {
            if (roomState.phase !== 'match_end' && activeModal === 'none') {
              engineRef.current?.requestPointerLock();
            }
          }}
        />

        {/* Sniper Telescopic Scope Overlay */}
        {isScoped && activeWeaponId === 'sniper' && localPlayer?.alive && (
          <div className="sniper-scope-overlay">
            <div className="scope-circle">
              <div className="scope-line-h" />
              <div className="scope-line-v" />
              <div className="scope-mil-dots-h" />
              <div className="scope-center-dot" />
            </div>
          </div>
        )}

        {/* Damage Received Vignette Flash */}
        {hurtFlash > 0 && <div className="damage-vignette" />}

        {/* Dynamic Competitive Crosshair */}
        {localPlayer?.alive && !(isScoped && activeWeaponId === 'sniper') && (
          <div className="crosshair-layer">
            {settings.crosshairDot && (
              <div
                style={{
                  position: 'absolute',
                  width: settings.crosshairThickness,
                  height: settings.crosshairThickness,
                  backgroundColor: settings.crosshairColor,
                  transform: 'translate(-50%, -50%)',
                  boxShadow: '0 0 2px rgba(0,0,0,0.9)',
                }}
              />
            )}
            {/* Top line */}
            <div
              style={{
                position: 'absolute',
                width: settings.crosshairThickness,
                height: settings.crosshairSize,
                backgroundColor: settings.crosshairColor,
                left: '50%',
                bottom: `calc(50% + ${totalCrosshairGap}px)`,
                transform: 'translateX(-50%)',
                boxShadow: '0 0 2px rgba(0,0,0,0.9)',
              }}
            />
            {/* Bottom line */}
            <div
              style={{
                position: 'absolute',
                width: settings.crosshairThickness,
                height: settings.crosshairSize,
                backgroundColor: settings.crosshairColor,
                left: '50%',
                top: `calc(50% + ${totalCrosshairGap}px)`,
                transform: 'translateX(-50%)',
                boxShadow: '0 0 2px rgba(0,0,0,0.9)',
              }}
            />
            {/* Left line */}
            <div
              style={{
                position: 'absolute',
                width: settings.crosshairSize,
                height: settings.crosshairThickness,
                backgroundColor: settings.crosshairColor,
                right: `calc(50% + ${totalCrosshairGap}px)`,
                top: '50%',
                transform: 'translateY(-50%)',
                boxShadow: '0 0 2px rgba(0,0,0,0.9)',
              }}
            />
            {/* Right line */}
            <div
              style={{
                position: 'absolute',
                width: settings.crosshairSize,
                height: settings.crosshairThickness,
                backgroundColor: settings.crosshairColor,
                left: `calc(50% + ${totalCrosshairGap}px)`,
                top: '50%',
                transform: 'translateY(-50%)',
                boxShadow: '0 0 2px rgba(0,0,0,0.9)',
              }}
            />
          </div>
        )}

        {/* Server-Confirmed Hitmarker Feedback */}
        {hitmarker && (
          <div className={`hitmarker-overlay ${hitmarker.headshot ? 'headshot' : ''}`}>
            <div className="hit-x-1" />
            <div className="hit-x-2" />
            <div className="hit-damage-tag">
              -{hitmarker.damage} {hitmarker.headshot ? 'HEADSHOT!' : ''}
            </div>
          </div>
        )}

        {/* TOP HUD BAR: Round Scoreboard, Timer & Alive Operators */}
        <div className="hud-top-bar">
          {roomState.mode !== 'ffa' ? (
            <div className="hud-score-cluster">
              <div className="team-score-box alpha">
                <span className="team-label">ALPHA</span>
                <span className="alive-pips">{alphaAlive} VIVOS</span>
                <span className="team-score-num">{roomState.scores.alpha}</span>
              </div>

              <div className="round-clock-box">
                <div className={`clock-digits ${roomState.phase === 'freeze' ? 'freeze' : ''}`}>
                  {formatTimer(roomState.phaseTimeRemainingMs)}
                </div>
                <div className="round-sublabel">
                  {roomState.phase === 'freeze'
                    ? 'PREPARAÇÃO'
                    : `ROUND ${roomState.roundNumber}/${roomState.maxRounds} (META: ${roomState.roundsToWin})`}
                </div>
              </div>

              <div className="team-score-box omega">
                <span className="team-score-num">{roomState.scores.omega}</span>
                <span className="alive-pips">{omegaAlive} VIVOS</span>
                <span className="team-label">OMEGA</span>
              </div>
            </div>
          ) : (
            <div className="hud-score-cluster">
              <div className="team-score-box alpha">
                <span className="team-label">TODOS CONTRA TODOS</span>
                <span className="team-score-num">
                  {roomState.players.filter((p) => p.connected && p.alive).length} VIVOS
                </span>
              </div>
              <div className="round-clock-box">
                <div className="clock-digits">{formatTimer(roomState.phaseTimeRemainingMs)}</div>
                <div className="round-sublabel">
                  ROUND {roomState.roundNumber}/{roomState.maxRounds} • PRIMEIRO A {roomState.roundsToWin}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* TOP RIGHT: Telemetry (FPS/Ping) & Kill Feed */}
        <div className="hud-top-right">
          {settings.showFps && (
            <div className="telemetry-pill">
              <span>{fps} FPS</span>
              <span className="sep">•</span>
              <span>{localPlayer?.ping ?? 12} ms</span>
              <span className="sep">•</span>
              <span>SALA: {roomState.code}</span>
            </div>
          )}

          <div className="killfeed-list">
            {roomState.killFeed.slice(-5).map((kf) => (
              <div key={kf.id} className="killfeed-item">
                <span className={`kf-name ${kf.killerTeam}`}>{kf.killerName}</span>
                <span className="kf-weapon">
                  [{WEAPONS[kf.weaponId]?.shortName || kf.weaponId.toUpperCase()}]
                  {kf.headshot && <strong className="kf-hs"> 🎯 HS</strong>}
                </span>
                <span className={`kf-name ${kf.victimTeam}`}>{kf.victimName}</span>
              </div>
            ))}
          </div>
        </div>

        {/* FREEZE TIME BANNER */}
        {roomState.phase === 'freeze' && (
          <div className="phase-announcement freeze">
            <div className="pa-title">FASE DE PREPARAÇÃO — ROUND {roomState.roundNumber}</div>
            <div className="pa-sub">
              Escolha sua arma nas teclas [1] a [5] • Combate inicia em{' '}
              {Math.ceil(roomState.phaseTimeRemainingMs / 1000)}s
            </div>
          </div>
        )}

        {/* ROUND END BANNER */}
        {roomState.phase === 'round_end' && (
          <div className="phase-announcement round-end">
            <div className="pa-title">{roomState.roundWinnerTitle}</div>
            <div className="pa-sub">{roomState.roundWinnerSubtitle}</div>
          </div>
        )}

        {/* SPECTATOR BANNER WHEN ELIMINATED */}
        {localPlayer && !localPlayer.alive && roomState.phase === 'live' && (
          <div className="spectator-banner">
            <div className="spec-badge">VOCÊ FOI ELIMINADO NESTE ROUND</div>
            <div className="spec-sub">
              {spectatingName
                ? `Modo Espectador: Observando ${spectatingName} (Clique ou Espaço para alternar)`
                : 'Aguardando conclusão do round...'}
            </div>
          </div>
        )}

        {/* BOTTOM LEFT: Health Bar & Stance Indicator */}
        {localPlayer && (
          <div className="hud-bottom-left">
            <div className="hp-card">
              <div className="hp-header">
                <span className="hp-label">VITALIDADE</span>
                <span className="stance-tag">
                  {!localPlayer.alive
                    ? 'ELIMINADO'
                    : localPlayer.crouching
                      ? 'AGACHADO (CTRL)'
                      : localPlayer.walking
                        ? 'SILENCIOSO (SHIFT)'
                        : 'EM PÉ'}
                </span>
              </div>
              <div className="hp-main-row">
                <span
                  className={`hp-number ${
                    localPlayer.hp > 50 ? 'good' : localPlayer.hp > 25 ? 'warn' : 'crit'
                  }`}
                >
                  {localPlayer.hp}
                </span>
                <div className="hp-bar-track">
                  <div
                    className={`hp-bar-fill ${
                      localPlayer.hp > 50 ? 'good' : localPlayer.hp > 25 ? 'warn' : 'crit'
                    }`}
                    style={{ width: `${Math.max(0, Math.min(100, localPlayer.hp))}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* BOTTOM RIGHT: Ammo Counter & 5-Weapon Loadout Bar */}
        {localPlayer && (
          <div className="hud-bottom-right">
            <div className="ammo-card">
              <div className="weapon-title-row">
                <span className="weapon-cat">{weaponDef.category.toUpperCase()}</span>
                <span className="weapon-name">{weaponDef.shortName}</span>
              </div>
              {weaponDef.melee ? (
                <div className="ammo-numbers melee">CORPO A CORPO</div>
              ) : localPlayer.reloading ? (
                <div className="ammo-numbers reloading">RECARREGANDO...</div>
              ) : (
                <div className="ammo-numbers">
                  <span className={`mag-num ${currentAmmo.magazine <= 5 ? 'low' : ''}`}>
                    {currentAmmo.magazine}
                  </span>
                  <span className="ammo-slash">/</span>
                  <span className="res-num">{currentAmmo.reserve}</span>
                </div>
              )}
            </div>

            <div className="weapon-slots-bar">
              {WEAPON_ORDER.map((wid, index) => {
                const w = WEAPONS[wid];
                const isSelected = activeWeaponId === wid;
                return (
                  <div
                    key={wid}
                    className={`weapon-slot-pill ${isSelected ? 'active' : ''}`}
                    onClick={() => engineRef.current?.selectWeapon(wid)}
                  >
                    <span className="slot-key">[{index + 1}]</span>
                    <span className="slot-name">{w.shortName}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* CLICK TO LOCK MOUSE / PAUSE MENU OVERLAY (WHEN POINTER NOT LOCKED) */}
        {!pointerLocked && roomState.phase !== 'match_end' && (
          <div className="pause-overlay">
            <div className="pause-card">
              <div className="pause-badge">PARTIDA EM ANDAMENTO • SALA {roomState.code}</div>
              <h2>ARENA STRIKE</h2>
              <p className="pause-hint">
                Clique em <strong>Entrar em Combate</strong> para travar o cursor do mouse na mira 3D.
                Pressione <strong>ESC</strong> a qualquer momento para liberar o mouse.
              </p>

              <div className="pause-actions">
                <button
                  className="btn-primary btn-large"
                  onClick={() => {
                    setActiveModal('none');
                    engineRef.current?.requestPointerLock();
                  }}
                >
                  🎯 ENTRAR EM COMBATE (TRAVAR MIRA)
                </button>

                <button
                  className="btn-secondary"
                  onClick={() =>
                    setActiveModal(activeModal === 'settings' ? 'none' : 'settings')
                  }
                >
                  ⚙️ CONFIGURAÇÕES DE JOGO E MIRA
                </button>

                {localPlayer?.isHost && (
                  <button
                    className="btn-secondary"
                    onClick={() => sendNetMessage({ type: 'return_to_lobby' })}
                  >
                    🔄 ENCERRAR E VOLTAR AO LOBBY
                  </button>
                )}

                <button className="btn-danger" onClick={handleLeaveRoom}>
                  🚪 SAIR DA SALA
                </button>
              </div>

              <div className="controls-mini-grid">
                <div><strong>WASD</strong> Mover</div>
                <div><strong>Mouse Esq</strong> Atirar</div>
                <div><strong>Mouse Dir</strong> Luneta / Mira</div>
                <div><strong>R</strong> Recarregar</div>
                <div><strong>Espaço</strong> Pular</div>
                <div><strong>Ctrl</strong> Agachar</div>
                <div><strong>Shift</strong> Silencioso</div>
                <div><strong>1 a 5</strong> Armas</div>
                <div><strong>Tab</strong> Placar</div>
              </div>
            </div>
          </div>
        )}

        {/* SCOREBOARD OVERLAY (TAB OR MATCH END) */}
        {(scoreboardOpen || roomState.phase === 'match_end') && (
          <div className="scoreboard-overlay">
            <div className="scoreboard-card">
              <div className="sb-header">
                <div>
                  <span className="sb-mode-tag">{getModeLabel(roomState.mode)}</span>
                  <h2>
                    {roomState.phase === 'match_end'
                      ? roomState.matchWinnerTitle || 'FIM DA PARTIDA'
                      : `PLACAR TÁTICO — SALA ${roomState.code}`}
                  </h2>
                  {roomState.phase === 'match_end' && (
                    <p className="sb-subtitle">{roomState.matchWinnerSubtitle}</p>
                  )}
                </div>
                <div className="sb-round-badge">
                  ROUND {roomState.roundNumber} / {roomState.maxRounds}
                </div>
              </div>

              <table className="sb-table">
                <thead>
                  <tr>
                    <th>OPERADOR</th>
                    <th>EQUIPE</th>
                    <th>STATUS</th>
                    <th>ELIMINAÇÕES (K)</th>
                    <th>MORTES (D)</th>
                    <th>ASSIST. (A)</th>
                    <th>HS 🎯</th>
                    <th>DANO</th>
                    <th>PING</th>
                  </tr>
                </thead>
                <tbody>
                  {roomState.players
                    .slice()
                    .sort((a, b) => b.kills - a.kills || b.damageDealt - a.damageDealt)
                    .map((p) => (
                      <tr key={p.id} className={p.id === clientId ? 'me-row' : ''}>
                        <td>
                          <strong>{p.nickname}</strong> {p.id === clientId ? '(Você)' : ''}{' '}
                          {p.isHost ? '👑' : ''}
                        </td>
                        <td>
                          <span className={`team-pill ${p.team}`}>
                            {p.team === 'alpha'
                              ? 'ALPHA'
                              : p.team === 'omega'
                                ? 'OMEGA'
                                : 'SOLO'}
                          </span>
                        </td>
                        <td>{p.alive ? `${p.hp} HP` : '💀 Eliminado'}</td>
                        <td>{p.kills}</td>
                        <td>{p.deaths}</td>
                        <td>{p.assists}</td>
                        <td>{p.headshots}</td>
                        <td>{p.damageDealt}</td>
                        <td>{p.ping} ms</td>
                      </tr>
                    ))}
                </tbody>
              </table>

              {roomState.phase === 'match_end' && (
                <div className="match-end-actions">
                  {localPlayer?.isHost ? (
                    <>
                      <button
                        className="btn-primary btn-large"
                        onClick={() => sendNetMessage({ type: 'start_match' })}
                      >
                        🔥 JOGAR NOVAMENTE (NOVA PARTIDA)
                      </button>
                      <button
                        className="btn-secondary btn-large"
                        onClick={() => sendNetMessage({ type: 'return_to_lobby' })}
                      >
                        📋 VOLTAR AO LOBBY DA SALA
                      </button>
                    </>
                  ) : (
                    <div className="waiting-host-msg">
                      Aguardando o líder da sala iniciar uma nova partida ou voltar ao lobby...
                    </div>
                  )}
                  <button className="btn-danger" onClick={handleLeaveRoom}>
                    SAIR PARA O MENU PRINCIPAL
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* IN-GAME SETTINGS MODAL */}
        {activeModal === 'settings' && (
          <SettingsModal
            settings={settings}
            onChange={setSettings}
            onClose={() => setActiveModal('none')}
            onToggleFullscreen={toggleFullscreen}
          />
        )}
      </div>
    );
  }

  // ==================== RENDER: ROOM LOBBY SCREEN ====================
  if (roomState && roomState.phase === 'lobby') {
    const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${roomState.code}`;
    const connectedCount = roomState.players.filter((p) => p.connected).length;
    const isHost = localPlayer?.isHost ?? false;

    return (
      <div className="menu-shell">
        <div className="bg-grid-decor" />
        <header className="top-nav">
          <div className="brand-logo">
            <span className="logo-badge">FPS 3D</span>
            <h1>ARENA STRIKE</h1>
          </div>
          <div className="nav-status">
            <span className={`conn-dot ${wsConnected ? 'online' : 'offline'}`} />
            <span>{netStatusLabel}</span>
          </div>
        </header>

        <main className="lobby-container">
          {errorBanner && (
            <div className="alert-banner error" onClick={() => setErrorBanner(null)}>
              ⚠️ {errorBanner}
            </div>
          )}
          {copyToast && <div className="alert-banner success">✅ {copyToast}</div>}

          <div className="lobby-header-card">
            <div className="lobby-title-col">
              <span className="section-eyebrow">LOBBY DA PARTIDA MULTIPLAYER</span>
              <h2>{roomState.roomName}</h2>
              <p className="lobby-meta">
                Mapa: <strong>Setor Omega (Complexo Industrial Abandonado)</strong> •{' '}
                {getModeLabel(roomState.mode)} • Melhor de {roomState.maxRounds} rounds (Primeiro a{' '}
                {roomState.roundsToWin} vence)
              </p>
            </div>

            <div className="room-code-box">
              <span className="code-label">CÓDIGO DA SALA</span>
              <div className="code-value">{roomState.code}</div>
              <div className="code-buttons">
                <button
                  className="btn-secondary btn-sm"
                  onClick={() =>
                    copyToClipboard(roomState.code, 'Código da sala copiado!')
                  }
                >
                  📋 Copiar Código
                </button>
                <button
                  className="btn-secondary btn-sm"
                  onClick={() =>
                    copyToClipboard(inviteUrl, 'Link de convite copiado!')
                  }
                >
                  🔗 Copiar Link de Convite
                </button>
              </div>
            </div>
          </div>

          <div className="lobby-grid">
            {/* Left Column: Players & Team Selection */}
            <div className="lobby-players-panel">
              <div className="panel-header-row">
                <h3>
                  OPERADORES CONECTADOS ({connectedCount} / {roomState.maxPlayers})
                </h3>
                {roomState.mode !== 'ffa' && (
                  <div className="team-switch-btns">
                    <button
                      className={`btn-team alpha ${
                        localPlayer?.team === 'alpha' ? 'selected' : ''
                      }`}
                      onClick={() => sendNetMessage({ type: 'set_team', team: 'alpha' })}
                    >
                      Entrar em ALPHA
                    </button>
                    <button
                      className={`btn-team omega ${
                        localPlayer?.team === 'omega' ? 'selected' : ''
                      }`}
                      onClick={() => sendNetMessage({ type: 'set_team', team: 'omega' })}
                    >
                      Entrar em OMEGA
                    </button>
                  </div>
                )}
              </div>

              <div className="player-slots-list">
                {roomState.players
                  .filter((p) => p.connected)
                  .map((p) => (
                    <div
                      key={p.id}
                      className={`lobby-player-row ${p.id === clientId ? 'is-me' : ''}`}
                    >
                      <div className="lp-left">
                        <span className={`team-badge ${p.team}`}>
                          {p.team === 'alpha'
                            ? 'ALPHA'
                            : p.team === 'omega'
                              ? 'OMEGA'
                              : 'SOLO'}
                        </span>
                        <span className="lp-name">
                          {p.nickname} {p.id === clientId ? '(Você)' : ''}
                        </span>
                        {p.isHost && <span className="host-crown">LÍDER</span>}
                      </div>

                      <div className="lp-right">
                        <span className="lp-ping">{p.ping} ms</span>
                        <span className={`ready-pill ${p.ready ? 'ready' : 'waiting'}`}>
                          {p.ready ? '✓ PRONTO' : 'AGUARDANDO'}
                        </span>
                      </div>
                    </div>
                  ))}

                {Array.from({
                  length: Math.max(0, roomState.maxPlayers - connectedCount),
                }).map((_, idx) => (
                  <div key={`empty_${idx}`} className="lobby-player-row empty">
                    <span>Slot disponível — compartilhe o código {roomState.code} com um amigo</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Column: Match Config & Start Controls */}
            <div className="lobby-config-panel">
              <h3>CONFIGURAÇÃO DA PARTIDA</h3>

              <div className="config-field">
                <label>Modo de Jogo</label>
                <div className="mode-pill-group">
                  {(['x1', 'ffa', '2v2', '3v3'] as GameMode[]).map((m) => (
                    <button
                      key={m}
                      disabled={!isHost}
                      className={`mode-pill ${roomState.mode === m ? 'active' : ''}`}
                      onClick={() =>
                        sendNetMessage({
                          type: 'update_room_config',
                          mode: m,
                          maxPlayers: m === 'x1' ? 2 : m === '2v2' ? 4 : 6,
                        })
                      }
                    >
                      {m.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {roomState.mode === 'ffa' && (
                <div className="config-field">
                  <label>Máximo de Jogadores (2 a 6)</label>
                  <div className="mode-pill-group">
                    {[2, 3, 4, 5, 6].map((num) => (
                      <button
                        key={num}
                        disabled={!isHost}
                        className={`mode-pill ${roomState.maxPlayers === num ? 'active' : ''}`}
                        onClick={() =>
                          sendNetMessage({ type: 'update_room_config', maxPlayers: num })
                        }
                      >
                        {num} Jogadores
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="config-field">
                <label>Duração da Partida (Melhor de N Rounds)</label>
                <div className="mode-pill-group">
                  {[3, 5, 9, 13, 15].map((r) => (
                    <button
                      key={r}
                      disabled={!isHost}
                      className={`mode-pill ${roomState.maxRounds === r ? 'active' : ''}`}
                      onClick={() =>
                        sendNetMessage({ type: 'update_room_config', maxRounds: r })
                      }
                    >
                      MD{r} (Vence {Math.floor(r / 2) + 1})
                    </button>
                  ))}
                </div>
              </div>

              <div className="config-field">
                <label>Tempo de Preparação por Round</label>
                <div className="mode-pill-group">
                  {[3, 6, 10].map((sec) => (
                    <button
                      key={sec}
                      disabled={!isHost}
                      className={`mode-pill ${roomState.freezeTimeSec === sec ? 'active' : ''}`}
                      onClick={() =>
                        sendNetMessage({ type: 'update_room_config', freezeTimeSec: sec })
                      }
                    >
                      {sec}s
                    </button>
                  ))}
                </div>
              </div>

              <div className="lobby-footer-actions">
                <button
                  className={`btn-ready-toggle ${localPlayer?.ready ? 'is-ready' : ''}`}
                  onClick={() =>
                    sendNetMessage({
                      type: 'set_ready',
                      ready: !localPlayer?.ready,
                    })
                  }
                >
                  {localPlayer?.ready ? '✓ VOCÊ ESTÁ PRONTO' : 'MARCAR COMO PRONTO'}
                </button>

                {isHost ? (
                  <button
                    className="btn-primary btn-large"
                    disabled={connectedCount < 2}
                    onClick={() => sendNetMessage({ type: 'start_match' })}
                  >
                    🚀 INICIAR PARTIDA AGORA
                  </button>
                ) : (
                  <div className="waiting-host-box">
                    Aguardando o líder iniciar a partida...
                  </div>
                )}

                <button className="btn-danger" onClick={handleLeaveRoom}>
                  VOLTAR AO MENU INICIAL
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ==================== RENDER: MAIN MENU ====================
  return (
    <div className="menu-shell">
      <div className="bg-grid-decor" />

      <header className="top-nav">
        <div className="brand-logo">
          <span className="logo-badge">FPS 3D</span>
          <h1>ARENA STRIKE</h1>
        </div>
        <div className="nav-status">
          <span className={`conn-dot ${wsConnected ? 'online' : 'offline'}`} />
          <span>{netStatusLabel}</span>
        </div>
      </header>

      <main className="main-menu-content">
        {errorBanner && (
          <div className="alert-banner error" onClick={() => setErrorBanner(null)}>
            ⚠️ {errorBanner}
          </div>
        )}

        <div className="hero-split">
          {/* Left Hero Column: Operator Profile & Actions */}
          <div className="hero-left-card">
            <span className="section-eyebrow">COMPETITIVE TACTICAL SHOOTER</span>
            <h2 className="hero-headline">COMBATE FPS 3D EM TEMPO REAL</h2>
            <p className="hero-description">
              Entre no <strong>Setor Omega</strong>. Física em primeira pessoa estilo CS2,
              raycasting validado pelo servidor com hitboxes anatômicas (Cabeça, Tronco,
              Braços, Pernas) e salas de duelo X1 até 6 jogadores.
            </p>

            <div className="operator-input-group">
              <label htmlFor="nickname-input">SEU APELIDO DE OPERADOR</label>
              <input
                id="nickname-input"
                type="text"
                maxLength={18}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Digite seu apelido..."
              />
            </div>

            <div className="menu-primary-actions">
              <button className="btn-primary btn-xl" onClick={handleQuickX1Create}>
                ⚔️ CRIAR SALA X1 RÁPIDA
              </button>

              <div className="menu-secondary-row">
                <button
                  className="btn-secondary btn-large"
                  onClick={() => setActiveModal('create')}
                >
                  ➕ CRIAR SALA (ATÉ 6 JOGADORES)
                </button>
                <button
                  className="btn-secondary btn-large"
                  onClick={() => {
                    sendNetMessage({ type: 'list_rooms' });
                    setActiveModal('join');
                  }}
                >
                  🔑 ENTRAR COM CÓDIGO
                </button>
              </div>

              <div className="menu-secondary-row">
                <button
                  className="btn-outline"
                  onClick={() => setActiveModal('arsenal')}
                >
                  🔫 ARSENAL 3D & CONTROLES
                </button>
                <button
                  className="btn-outline"
                  onClick={() => setActiveModal('settings')}
                >
                  ⚙️ CONFIGURAÇÕES
                </button>
              </div>
            </div>
          </div>

          {/* Right Hero Column: Active Rooms Browser & Quick Join */}
          <div className="hero-right-card">
            <div className="browser-header">
              <h3>SALAS ATIVAS NO SERVIDOR</h3>
              <button
                className="btn-secondary btn-sm"
                onClick={() => sendNetMessage({ type: 'list_rooms' })}
              >
                🔄 Atualizar
              </button>
            </div>

            <div className="quick-code-bar">
              <input
                type="text"
                maxLength={8}
                placeholder="CÓDIGO DA SALA (EX: A7K9X2)"
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
              />
              <button
                className="btn-primary"
                onClick={() => handleJoinRoomByCode(joinCodeInput)}
              >
                ENTRAR
              </button>
            </div>

            <div className="rooms-list-box">
              {publicRooms.length === 0 ? (
                <div className="empty-rooms-state">
                  <p>Nenhuma sala pública aguardando no momento.</p>
                  <span>
                    Clique em <strong>Criar Sala X1 Rápida</strong> ao lado e envie o código
                    para seu amigo!
                  </span>
                </div>
              ) : (
                publicRooms.map((r) => (
                  <div key={r.code} className="room-browser-item">
                    <div>
                      <div className="rb-title">
                        <strong>{r.roomName}</strong>
                        <span className="rb-code">#{r.code}</span>
                      </div>
                      <div className="rb-sub">
                        Modo: {r.mode.toUpperCase()} • Líder: {r.hostName} •{' '}
                        {r.phase === 'lobby' ? 'No Lobby' : 'Em Partida'}
                      </div>
                    </div>
                    <div className="rb-right">
                      <span className="rb-count">
                        {r.playerCount}/{r.maxPlayers}
                      </span>
                      <button
                        className="btn-primary btn-sm"
                        onClick={() => handleJoinRoomByCode(r.code)}
                      >
                        Entrar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>

      {/* MODAL: CREATE CUSTOM ROOM */}
      {activeModal === 'create' && (
        <div className="modal-backdrop" onClick={() => setActiveModal('none')}>
          <form
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleCreateCustomRoom}
          >
            <h2>CRIAR SALA PRIVADA</h2>
            <p className="modal-sub">
              Configure o modo de jogo e a quantidade de rounds. Um código exclusivo e link de
              convite serão gerados.
            </p>

            <div className="config-field">
              <label>Modo de Jogo</label>
              <div className="mode-pill-group">
                {(
                  [
                    { id: 'x1', label: 'X1 (1 vs 1)', max: 2 },
                    { id: 'ffa', label: 'Todos contra Todos', max: 6 },
                    { id: '2v2', label: 'Equipes 2 vs 2', max: 4 },
                    { id: '3v3', label: 'Equipes 3 vs 3', max: 6 },
                  ] as const
                ).map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={`mode-pill ${createMode === item.id ? 'active' : ''}`}
                    onClick={() => {
                      setCreateMode(item.id);
                      setCreateMaxPlayers(item.max);
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {createMode === 'ffa' && (
              <div className="config-field">
                <label>Limite de Jogadores (2 a 6)</label>
                <div className="mode-pill-group">
                  {[2, 3, 4, 5, 6].map((n) => (
                    <button
                      type="button"
                      key={n}
                      className={`mode-pill ${createMaxPlayers === n ? 'active' : ''}`}
                      onClick={() => setCreateMaxPlayers(n)}
                    >
                      {n} Jogadores
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="config-field">
              <label>Quantidade de Rounds</label>
              <div className="mode-pill-group">
                {[3, 5, 9, 13, 15].map((r) => (
                  <button
                    type="button"
                    key={r}
                    className={`mode-pill ${createMaxRounds === r ? 'active' : ''}`}
                    onClick={() => setCreateMaxRounds(r)}
                  >
                    Melhor de {r} (Vence {Math.floor(r / 2) + 1})
                  </button>
                ))}
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setActiveModal('none')}
              >
                Cancelar
              </button>
              <button type="submit" className="btn-primary">
                Criar Sala Agora
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: JOIN BY CODE */}
      {activeModal === 'join' && (
        <div className="modal-backdrop" onClick={() => setActiveModal('none')}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>ENTRAR EM SALA COM CÓDIGO</h2>
            <p className="modal-sub">
              Digite o código de 6 caracteres enviado pelo seu amigo para conectar-se à mesma
              partida.
            </p>
            <div className="config-field">
              <label>Código da Sala</label>
              <input
                type="text"
                className="code-big-input"
                maxLength={8}
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                placeholder="EX: A7K9X2"
                autoFocus
              />
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setActiveModal('none')}>
                Voltar
              </button>
              <button
                className="btn-primary"
                onClick={() => handleJoinRoomByCode(joinCodeInput)}
              >
                Conectar à Sala
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ARSENAL & CONTROLS */}
      {activeModal === 'arsenal' && (
        <div className="modal-backdrop" onClick={() => setActiveModal('none')}>
          <div className="modal-card modal-wide" onClick={(e) => e.stopPropagation()}>
            <h2>ARSENAL TÁTICO 3D & HITBOXES</h2>
            <p className="modal-sub">
              Todas as armas utilizam raycasting validado pelo servidor com multiplicadores de
              dano por região anatômica.
            </p>

            <table className="sb-table">
              <thead>
                <tr>
                  <th>TECLA</th>
                  <th>ARMA</th>
                  <th>MODO</th>
                  <th>CABEÇA 🎯</th>
                  <th>TRONCO</th>
                  <th>BRAÇOS</th>
                  <th>PERNAS</th>
                  <th>CARREGADOR</th>
                </tr>
              </thead>
              <tbody>
                {WEAPON_ORDER.map((wid, i) => {
                  const w = WEAPONS[wid];
                  return (
                    <tr key={wid}>
                      <td><strong>[{i + 1}]</strong></td>
                      <td><strong>{w.name}</strong></td>
                      <td>{w.melee ? 'Corpo a Corpo' : w.automatic ? 'Automática' : 'Semiauto'}</td>
                      <td style={{ color: '#fbbf24', fontWeight: 700 }}>{w.damageByZone.head}</td>
                      <td>{w.damageByZone.torso}</td>
                      <td>{w.damageByZone.arms}</td>
                      <td>{w.damageByZone.legs}</td>
                      <td>{w.melee ? '∞' : `${w.magazineSize} / ${w.initialReserve}`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="modal-actions" style={{ marginTop: 20 }}>
              <button className="btn-primary" onClick={() => setActiveModal('none')}>
                Fechar Guia
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SETTINGS */}
      {activeModal === 'settings' && (
        <SettingsModal
          settings={settings}
          onChange={setSettings}
          onClose={() => setActiveModal('none')}
          onToggleFullscreen={toggleFullscreen}
        />
      )}
    </div>
  );
};

interface SettingsModalProps {
  settings: UserSettings;
  onChange: (next: UserSettings) => void;
  onClose: () => void;
  onToggleFullscreen: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  onChange,
  onClose,
  onToggleFullscreen,
}) => {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card modal-wide" onClick={(e) => e.stopPropagation()}>
        <h2>CONFIGURAÇÕES DO OPERADOR</h2>

        <div className="settings-grid">
          <div className="config-field">
            <label>Sensibilidade do Mouse: {settings.sensitivity.toFixed(2)}</label>
            <input
              type="range"
              min={0.2}
              max={4.0}
              step={0.05}
              value={settings.sensitivity}
              onChange={(e) =>
                onChange({ ...settings, sensitivity: parseFloat(e.target.value) })
              }
            />
          </div>

          <div className="config-field">
            <label>Campo de Visão (FOV): {settings.fov}°</label>
            <input
              type="range"
              min={68}
              max={105}
              step={1}
              value={settings.fov}
              onChange={(e) =>
                onChange({ ...settings, fov: parseInt(e.target.value, 10) })
              }
            />
          </div>

          <div className="config-field">
            <label>Volume Geral: {Math.round(settings.masterVolume * 100)}%</label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.masterVolume}
              onChange={(e) =>
                onChange({ ...settings, masterVolume: parseFloat(e.target.value) })
              }
            />
          </div>

          <div className="config-field">
            <label>Volume de Efeitos: {Math.round(settings.sfxVolume * 100)}%</label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.sfxVolume}
              onChange={(e) =>
                onChange({ ...settings, sfxVolume: parseFloat(e.target.value) })
              }
            />
          </div>

          <div className="config-field">
            <label>Qualidade Gráfica</label>
            <div className="mode-pill-group">
              {(['low', 'medium', 'high'] as const).map((q) => (
                <button
                  type="button"
                  key={q}
                  className={`mode-pill ${settings.graphicsQuality === q ? 'active' : ''}`}
                  onClick={() => onChange({ ...settings, graphicsQuality: q })}
                >
                  {q === 'low' ? 'Baixa (Máx FPS)' : q === 'medium' ? 'Média' : 'Alta (Sombras)'}
                </button>
              ))}
            </div>
          </div>

          <div className="config-field">
            <label>Escala de Renderização: {Math.round(settings.renderScale * 100)}%</label>
            <input
              type="range"
              min={0.5}
              max={1.0}
              step={0.05}
              value={settings.renderScale}
              onChange={(e) =>
                onChange({ ...settings, renderScale: parseFloat(e.target.value) })
              }
            />
          </div>

          <div className="config-field">
            <label>Cor da Mira</label>
            <div className="mode-pill-group">
              {[
                { c: '#00ff88', label: 'Verde Neon' },
                { c: '#00e5ff', label: 'Ciano' },
                { c: '#ffcc00', label: 'Amarelo' },
                { c: '#ff3366', label: 'Vermelho' },
                { c: '#ffffff', label: 'Branco' },
              ].map((item) => (
                <button
                  type="button"
                  key={item.c}
                  className={`mode-pill ${settings.crosshairColor === item.c ? 'active' : ''}`}
                  onClick={() => onChange({ ...settings, crosshairColor: item.c })}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="config-field">
            <label>Tamanho da Mira: {settings.crosshairSize}px</label>
            <input
              type="range"
              min={4}
              max={20}
              step={1}
              value={settings.crosshairSize}
              onChange={(e) =>
                onChange({ ...settings, crosshairSize: parseInt(e.target.value, 10) })
              }
            />
          </div>
        </div>

        <div className="modal-actions" style={{ marginTop: 22 }}>
          <button type="button" className="btn-secondary" onClick={onToggleFullscreen}>
            🖥️ Alternar Tela Cheia
          </button>
          <button type="button" className="btn-primary" onClick={onClose}>
            Salvar e Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
