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

const cache = new Map<string, THREE.Texture>();
const loader = new THREE.TextureLoader();
/** the tile textures still loading (tilesLoaded) */
const loading = new Set<Promise<void>>();

/** AI-painted tiling texture from public/textures (tools/ai-textures.mjs); draws once it has loaded */
export function tileTexture(name: string): THREE.Texture {
  const key = `t-${name}`;
  let t = cache.get(key);
  if (!t) {
    let done = () => {};
    const coming = new Promise<void>((r) => (done = r));
    loading.add(coming);
    const settle = () => {
      loading.delete(coming);
      done();
    };
    t = loader.load(`${import.meta.env.BASE_URL}textures/${name}.webp`, settle, undefined, settle);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    cache.set(key, t);
  }
  return t;
}

/** resolves once every tile texture asked for so far has loaded or failed (the model stream lets them go first) */
export function tilesLoaded(): Promise<void> {
  return Promise.all([...loading]).then(() => {});
}

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

/**
 * A touch skill's aiming line, drawn along the texture from the top (at the hero) down: a soft band
 * with chevrons pointing away.
 */
export function aimLineTexture(): THREE.Texture {
  const key = 'aimline';
  if (cache.has(key)) return cache.get(key)!;
  const W = 64;
  const H = 384;
  const [c, ctx] = canvas(W, H);
  const band = ctx.createLinearGradient(0, 0, W, 0);
  band.addColorStop(0, 'rgba(255,255,255,0)');
  band.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  band.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = band;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = 1; i <= 5; i++) {
    const y = (i / 6) * H;
    ctx.beginPath();
    ctx.moveTo(W * 0.18, y - 20);
    ctx.lineTo(W * 0.5, y + 4);
    ctx.lineTo(W * 0.82, y - 20);
    ctx.stroke();
  }
  // fade in from the hero's feet
  ctx.globalCompositeOperation = 'destination-in';
  const fade = ctx.createLinearGradient(0, 0, 0, H);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(0.12, 'rgba(0,0,0,1)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, W, H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}
