import * as THREE from 'three';
import { MapObjectStyle } from '../shared/mapData';

const materialCache: Map<string, THREE.MeshStandardMaterial> = new Map();

function createCanvasTexture(
  width: number,
  height: number,
  drawFn: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  repeatX = 1,
  repeatY = 1
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  drawFn(ctx, width, height);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function getGroundMaterial(): THREE.MeshStandardMaterial {
  const key = 'ground_asphalt';
  if (materialCache.has(key)) return materialCache.get(key)!;

  const tex = createCanvasTexture(
    512,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = '#2d3138';
      ctx.fillRect(0, 0, w, h);

      // Subtle concrete grain noise
      for (let i = 0; i < 4500; i++) {
        const nx = Math.random() * w;
        const ny = Math.random() * h;
        const shade = Math.random() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.045)';
        ctx.fillStyle = shade;
        ctx.fillRect(nx, ny, 3, 3);
      }

      // Concrete slab grid seams
      ctx.strokeStyle = '#1e2126';
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, w - 4, h - 4);

      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w / 2, h);
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
    },
    18,
    20
  );

  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.88,
    metalness: 0.08,
  });
  materialCache.set(key, mat);
  return mat;
}

export function getMapObjectMaterial(
  style: MapObjectStyle,
  w: number,
  h: number,
  d: number
): THREE.MeshStandardMaterial {
  const horizScale = Math.max(1, Math.round(Math.max(w, d) / 3));
  const vertScale = Math.max(1, Math.round(h / 2.5));
  const key = `${style}_${horizScale}_${vertScale}`;
  if (materialCache.has(key)) return materialCache.get(key)!;

  let mat: THREE.MeshStandardMaterial;

  switch (style) {
    case 'perimeter_wall':
    case 'concrete_wall': {
      const tex = createCanvasTexture(
        256,
        256,
        (ctx, cw, ch) => {
          ctx.fillStyle = style === 'perimeter_wall' ? '#494f59' : '#656c77';
          ctx.fillRect(0, 0, cw, ch);
          for (let i = 0; i < 1800; i++) {
            ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)';
            ctx.fillRect(Math.random() * cw, Math.random() * ch, 3, 3);
          }
          // Formwork panel lines & tie holes
          ctx.strokeStyle = 'rgba(20,24,30,0.45)';
          ctx.lineWidth = 3;
          ctx.strokeRect(2, 2, cw - 4, ch - 4);
          ctx.fillStyle = 'rgba(20,24,30,0.5)';
          const holes = [
            [28, 28],
            [cw - 28, 28],
            [28, ch - 28],
            [cw - 28, ch - 28],
          ];
          for (const [hx, hy] of holes) {
            ctx.beginPath();
            ctx.arc(hx, hy, 4, 0, Math.PI * 2);
            ctx.fill();
          }
          // Bottom industrial stripe
          ctx.fillStyle = '#d97706';
          ctx.fillRect(0, ch - 16, cw, 8);
        },
        horizScale,
        vertScale
      );
      mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82, metalness: 0.1 });
      break;
    }

    case 'brick_building': {
      const tex = createCanvasTexture(
        256,
        256,
        (ctx, cw, ch) => {
          ctx.fillStyle = '#5c3329';
          ctx.fillRect(0, 0, cw, ch);
          const rows = 8;
          const cols = 4;
          const rowH = ch / rows;
          const colW = cw / cols;
          ctx.strokeStyle = '#38221d';
          ctx.lineWidth = 3;
          for (let r = 0; r < rows; r++) {
            const y = r * rowH;
            const offset = (r % 2) * (colW * 0.5);
            for (let c = -1; c <= cols; c++) {
              const x = c * colW + offset;
              ctx.fillStyle = (r + c) % 3 === 0 ? '#6e3b2e' : (r + c) % 2 === 0 ? '#593026' : '#4f2920';
              ctx.fillRect(x + 2, y + 2, colW - 4, rowH - 4);
              ctx.strokeRect(x, y, colW, rowH);
            }
          }
        },
        horizScale * 1.5,
        vertScale * 1.5
      );
      mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.06 });
      break;
    }

    case 'container_blue':
    case 'container_red':
    case 'container_rust': {
      const baseColor =
        style === 'container_blue'
          ? '#1d4ed8'
          : style === 'container_red'
            ? '#b91c1c'
            : '#9a3412';
      const darkColor =
        style === 'container_blue'
          ? '#172554'
          : style === 'container_red'
            ? '#7f1d1d'
            : '#5c1f0a';
      const lightColor =
        style === 'container_blue'
          ? '#3b82f6'
          : style === 'container_red'
            ? '#ef4444'
            : '#c2410c';

      const tex = createCanvasTexture(
        256,
        256,
        (ctx, cw, ch) => {
          ctx.fillStyle = baseColor;
          ctx.fillRect(0, 0, cw, ch);
          // Corrugated vertical ribs
          const ribs = 16;
          const ribW = cw / ribs;
          for (let i = 0; i < ribs; i++) {
            ctx.fillStyle = i % 2 === 0 ? lightColor : darkColor;
            ctx.fillRect(i * ribW, 12, ribW * 0.45, ch - 24);
          }
          // Container frame border
          ctx.strokeStyle = darkColor;
          ctx.lineWidth = 14;
          ctx.strokeRect(0, 0, cw, ch);
          // Stencil code
          ctx.fillStyle = 'rgba(255,255,255,0.65)';
          ctx.font = 'bold 20px monospace';
          ctx.fillText('OMEGA-07', 22, 42);
        },
        horizScale,
        1
      );
      mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.52, metalness: 0.48 });
      break;
    }

    case 'crate_wood': {
      const tex = createCanvasTexture(256, 256, (ctx, cw, ch) => {
        ctx.fillStyle = '#926239';
        ctx.fillRect(0, 0, cw, ch);
        // Horizontal planks
        ctx.strokeStyle = '#5c3a1e';
        ctx.lineWidth = 4;
        for (let i = 1; i < 6; i++) {
          ctx.beginPath();
          ctx.moveTo(0, (ch / 6) * i);
          ctx.lineTo(cw, (ch / 6) * i);
          ctx.stroke();
        }
        // Diagonal brace
        ctx.strokeStyle = '#784d2a';
        ctx.lineWidth = 18;
        ctx.beginPath();
        ctx.moveTo(16, 16);
        ctx.lineTo(cw - 16, ch - 16);
        ctx.stroke();
        // Outer wood frame
        ctx.strokeStyle = '#6b4223';
        ctx.lineWidth = 22;
        ctx.strokeRect(8, 8, cw - 16, ch - 16);
      });
      mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, metalness: 0.05 });
      break;
    }

    case 'crate_metal': {
      const tex = createCanvasTexture(256, 256, (ctx, cw, ch) => {
        ctx.fillStyle = '#475569';
        ctx.fillRect(0, 0, cw, ch);
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 18;
        ctx.strokeRect(6, 6, cw - 12, ch - 12);
        // X-frame reinforcement
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.moveTo(16, 16);
        ctx.lineTo(cw - 16, ch - 16);
        ctx.moveTo(cw - 16, 16);
        ctx.lineTo(16, ch - 16);
        ctx.stroke();
        // Yellow tactical accent
        ctx.fillStyle = '#eab308';
        ctx.fillRect(cw / 2 - 36, ch / 2 - 14, 72, 28);
      });
      mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, metalness: 0.6 });
      break;
    }

    case 'hazard_barrier': {
      const tex = createCanvasTexture(
        256,
        256,
        (ctx, cw, ch) => {
          ctx.fillStyle = '#525866';
          ctx.fillRect(0, 0, cw, ch);
          // Top hazard warning stripes
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, cw, 64);
          ctx.clip();
          ctx.fillStyle = '#eab308';
          ctx.fillRect(0, 0, cw, 64);
          ctx.fillStyle = '#111827';
          for (let x = -64; x < cw + 64; x += 40) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x + 20, 0);
            ctx.lineTo(x - 10, 64);
            ctx.lineTo(x - 30, 64);
            ctx.closePath();
            ctx.fill();
          }
          ctx.restore();
          ctx.strokeStyle = '#1f2937';
          ctx.lineWidth = 6;
          ctx.strokeRect(2, 2, cw - 4, ch - 4);
        },
        horizScale,
        1
      );
      mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, metalness: 0.2 });
      break;
    }

    case 'steel_pillar':
    case 'roof_beam': {
      mat = new THREE.MeshStandardMaterial({
        color: '#334155',
        roughness: 0.42,
        metalness: 0.72,
      });
      break;
    }

    case 'platform_concrete':
    default: {
      const tex = createCanvasTexture(
        256,
        256,
        (ctx, cw, ch) => {
          ctx.fillStyle = '#525b66';
          ctx.fillRect(0, 0, cw, ch);
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 8;
          ctx.strokeRect(4, 4, cw - 8, ch - 8);
        },
        horizScale,
        vertScale
      );
      mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.78, metalness: 0.15 });
      break;
    }
  }

  materialCache.set(key, mat);
  return mat;
}
