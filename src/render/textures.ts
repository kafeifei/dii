import * as THREE from 'three';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function mulberry(seed: number) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shade(hex: string, f: number): string {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return `rgb(${Math.min(255, c.r * 255) | 0},${Math.min(255, c.g * 255) | 0},${Math.min(255, c.b * 255) | 0})`;
}

function grain(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, rnd: () => number) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function blotches(ctx: CanvasRenderingContext2D, w: number, h: number, n: number, color: string, alpha: number, rnd: () => number, rmin = 4, rmax = 20) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = rmin + rnd() * (rmax - rmin);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha * (0.5 + rnd() * 0.5);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.globalAlpha = 1;
}

function crack(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, rnd: () => number) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  let a = rnd() * Math.PI * 2;
  for (let i = 0; i < len; i++) {
    a += (rnd() - 0.5) * 1.2;
    x += Math.cos(a) * 4;
    y += Math.sin(a) * 4;
    ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function finish(c: HTMLCanvasElement, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export type FloorStyle = 'flagstone' | 'cave' | 'grass' | 'ice' | 'hell';
export type WallStyle = 'brick' | 'rock' | 'palisade' | 'ice' | 'hell';

const cache = new Map<string, THREE.Texture>();

export function floorTexture(style: FloorStyle, base: string): THREE.Texture {
  const key = `f-${style}-${base}`;
  if (cache.has(key)) return cache.get(key)!;
  const S = 256;
  const [c, ctx] = canvas(S, S);
  const rnd = mulberry(style.length * 997 + base.length);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  if (style === 'flagstone' || style === 'hell' || style === 'ice') {
    // 2x2 irregular slabs per tile
    const cells = [
      [0, 0, 128, 128],
      [128, 0, 128, 128],
      [0, 128, 128, 128],
      [128, 128, 128, 128],
    ];
    for (const [x, y, w, h] of cells) {
      const f = 0.8 + rnd() * 0.35;
      ctx.fillStyle = shade(base, f);
      const inset = 3;
      ctx.beginPath();
      const j = () => (rnd() - 0.5) * 6;
      ctx.moveTo(x + inset + j(), y + inset + j());
      ctx.lineTo(x + w - inset + j(), y + inset + j());
      ctx.lineTo(x + w - inset + j(), y + h - inset + j());
      ctx.lineTo(x + inset + j(), y + h - inset + j());
      ctx.closePath();
      ctx.fill();
      // bevel highlight
      ctx.strokeStyle = shade(base, f * 1.25);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + inset + 2, y + h - inset - 2);
      ctx.lineTo(x + inset + 2, y + inset + 2);
      ctx.lineTo(x + w - inset - 2, y + inset + 2);
      ctx.stroke();
    }
    // grout
    ctx.strokeStyle = shade(base, 0.35);
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(128, 0);
    ctx.lineTo(128, S);
    ctx.moveTo(0, 128);
    ctx.lineTo(S, 128);
    ctx.strokeRect(0, 0, S, S);
    ctx.stroke();
    ctx.strokeStyle = shade(base, 0.45);
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) crack(ctx, rnd() * S, rnd() * S, 4 + rnd() * 8, rnd);
    blotches(ctx, S, S, 18, shade(base, 0.4), 0.4, rnd, 10, 40);
    if (style === 'hell') {
      ctx.strokeStyle = 'rgba(255,90,20,0.55)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) crack(ctx, rnd() * S, rnd() * S, 6 + rnd() * 10, rnd);
    }
    if (style === 'ice') blotches(ctx, S, S, 10, 'rgba(200,230,255,1)', 0.15, rnd, 15, 50);
  } else if (style === 'cave') {
    blotches(ctx, S, S, 40, shade(base, 1.3), 0.35, rnd, 8, 40);
    blotches(ctx, S, S, 40, shade(base, 0.5), 0.5, rnd, 6, 30);
    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = shade(base, 0.6 + rnd() * 0.8);
      const x = rnd() * S;
      const y = rnd() * S;
      ctx.beginPath();
      ctx.ellipse(x, y, 2 + rnd() * 6, 1 + rnd() * 4, rnd() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (style === 'grass') {
    blotches(ctx, S, S, 30, '#2e3a1c', 0.6, rnd, 10, 50);
    blotches(ctx, S, S, 30, '#5a4a30', 0.5, rnd, 10, 40);
    for (let i = 0; i < 900; i++) {
      ctx.strokeStyle = rnd() < 0.5 ? '#4f5a2c' : '#39421f';
      ctx.globalAlpha = 0.6;
      const x = rnd() * S;
      const y = rnd() * S;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rnd() - 0.5) * 4, y - 3 - rnd() * 5);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  grain(ctx, S, S, 22, rnd);
  const t = finish(c);
  cache.set(key, t);
  return t;
}

export function wallTexture(style: WallStyle, base: string): THREE.Texture {
  const key = `w-${style}-${base}`;
  if (cache.has(key)) return cache.get(key)!;
  const W = 128;
  const H = 256;
  const [c, ctx] = canvas(W, H);
  const rnd = mulberry(style.length * 31 + 7);
  ctx.fillStyle = shade(base, 0.5);
  ctx.fillRect(0, 0, W, H);
  if (style === 'brick' || style === 'hell' || style === 'ice') {
    const rows = 9;
    const bh = H / rows;
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? -W / 4 : 0;
      for (let x = off; x < W; x += W / 2) {
        const f = 0.7 + rnd() * 0.45;
        ctx.fillStyle = shade(base, f);
        ctx.fillRect(x + 2, r * bh + 2, W / 2 - 4, bh - 4);
        ctx.fillStyle = shade(base, f * 1.2);
        ctx.fillRect(x + 2, r * bh + 2, W / 2 - 4, 2);
      }
    }
    blotches(ctx, W, H, 14, shade(base, 0.3), 0.5, rnd, 8, 30);
    // grime towards the bottom
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.7, 'rgba(0,0,0,0.1)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (style === 'hell') {
      ctx.strokeStyle = 'rgba(255,80,20,0.5)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) crack(ctx, rnd() * W, rnd() * H, 8, rnd);
    }
  } else if (style === 'rock') {
    blotches(ctx, W, H, 50, shade(base, 1.3), 0.4, rnd, 6, 30);
    blotches(ctx, W, H, 50, shade(base, 0.4), 0.6, rnd, 6, 26);
    ctx.strokeStyle = shade(base, 0.25);
    ctx.lineWidth = 2;
    for (let i = 0; i < 10; i++) crack(ctx, rnd() * W, rnd() * H, 6 + rnd() * 6, rnd);
  } else if (style === 'palisade') {
    const n = 4;
    for (let i = 0; i < n; i++) {
      const x = (i * W) / n;
      const f = 0.75 + rnd() * 0.4;
      const g = ctx.createLinearGradient(x, 0, x + W / n, 0);
      g.addColorStop(0, shade(base, f * 0.6));
      g.addColorStop(0.5, shade(base, f * 1.1));
      g.addColorStop(1, shade(base, f * 0.5));
      ctx.fillStyle = g;
      ctx.fillRect(x + 1, 0, W / n - 2, H);
      ctx.strokeStyle = shade(base, 0.4);
      for (let k = 0; k < 6; k++) {
        ctx.beginPath();
        const yy = rnd() * H;
        ctx.moveTo(x + 3, yy);
        ctx.lineTo(x + W / n - 3, yy + (rnd() - 0.5) * 6);
        ctx.stroke();
      }
    }
    ctx.fillStyle = shade(base, 0.35);
    ctx.fillRect(0, 40, W, 8);
    ctx.fillRect(0, 180, W, 8);
  }
  grain(ctx, W, H, 26, rnd);
  const t = finish(c);
  cache.set(key, t);
  return t;
}

/** soft round sprite for particles & glows */
export function glowTexture(): THREE.Texture {
  const key = 'glow';
  if (cache.has(key)) return cache.get(key)!;
  const S = 64;
  const [c, ctx] = canvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.75)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  cache.set(key, t);
  return t;
}

export function shadowTexture(): THREE.Texture {
  const key = 'shadow';
  if (cache.has(key)) return cache.get(key)!;
  const S = 64;
  const [c, ctx] = canvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.7)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.35)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  cache.set(key, t);
  return t;
}

export function bloodTexture(seed: number): THREE.Texture {
  const key = `blood-${seed % 4}`;
  if (cache.has(key)) return cache.get(key)!;
  const S = 64;
  const [c, ctx] = canvas(S, S);
  const rnd = mulberry(seed % 4);
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 9; i++) {
    const x = S / 2 + (rnd() - 0.5) * 30;
    const y = S / 2 + (rnd() - 0.5) * 30;
    const r = 3 + rnd() * 11;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 10; i++) {
    const a = rnd() * Math.PI * 2;
    const d = 14 + rnd() * 14;
    ctx.beginPath();
    ctx.arc(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, 1 + rnd() * 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  cache.set(key, t);
  return t;
}

/** runic circle for waypoint & aura floor decal */
export function runeCircleTexture(color: string): THREE.Texture {
  const key = `rune-${color}`;
  if (cache.has(key)) return cache.get(key)!;
  const S = 256;
  const [c, ctx] = canvas(S, S);
  ctx.translate(S / 2, S / 2);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 4;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.arc(0, 0, 118, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 100, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = 'bold 20px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const glyphs = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊ';
  for (let i = 0; i < 16; i++) {
    ctx.save();
    ctx.rotate((i / 16) * Math.PI * 2);
    ctx.fillText(glyphs[i], 0, -109);
    ctx.restore();
  }
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= 5; i++) {
    const a = (i * 2 * Math.PI * 2) / 5 - Math.PI / 2;
    const x = Math.cos(a) * 92;
    const y = Math.sin(a) * 92;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

export function ringTexture(): THREE.Texture {
  const key = 'ring';
  if (cache.has(key)) return cache.get(key)!;
  const S = 128;
  const [c, ctx] = canvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.75, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.85, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  cache.set(key, t);
  return t;
}
