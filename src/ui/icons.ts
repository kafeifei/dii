import { ITEM_BASES } from '../data/items';
import { RUNE_BY_ID } from '../data/legendary';
import { SKILL_BY_ID } from '../data/skills';
import type { Item } from '../items/item';

export const CELL = 34;
const cache = new Map<string, string>();

function metalGrad(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, base = '#c8c8d0') {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, '#f4f4f8');
  g.addColorStop(0.4, base);
  g.addColorStop(1, '#5a5a62');
  return g;
}

function outline(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawSword(ctx: CanvasRenderingContext2D, w: number, h: number, wide: boolean, base: string) {
  const cx = w / 2;
  const bw = wide ? w * 0.22 : w * 0.16;
  ctx.beginPath();
  ctx.moveTo(cx, h * 0.04);
  ctx.lineTo(cx + bw / 2, h * 0.14);
  ctx.lineTo(cx + bw / 2, h * 0.7);
  ctx.lineTo(cx - bw / 2, h * 0.7);
  ctx.lineTo(cx - bw / 2, h * 0.14);
  ctx.closePath();
  ctx.fillStyle = metalGrad(ctx, cx - bw, 0, cx + bw, 0, base);
  ctx.fill();
  outline(ctx);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.moveTo(cx, h * 0.08);
  ctx.lineTo(cx, h * 0.68);
  ctx.stroke();
  // guard
  ctx.fillStyle = '#8a6a30';
  ctx.fillRect(cx - w * 0.36, h * 0.7, w * 0.72, h * 0.045);
  ctx.strokeRect(cx - w * 0.36, h * 0.7, w * 0.72, h * 0.045);
  ctx.fillStyle = '#4a2a18';
  ctx.fillRect(cx - w * 0.07, h * 0.745, w * 0.14, h * 0.18);
  ctx.fillStyle = '#b08a40';
  ctx.beginPath();
  ctx.arc(cx, h * 0.94, w * 0.09, 0, Math.PI * 2);
  ctx.fill();
}

function drawAxe(ctx: CanvasRenderingContext2D, w: number, h: number, big: boolean, base: string) {
  const cx = w * 0.45;
  ctx.fillStyle = '#5a3a20';
  ctx.fillRect(cx - w * 0.05, h * 0.1, w * 0.1, h * 0.86);
  ctx.strokeRect(cx - w * 0.05, h * 0.1, w * 0.1, h * 0.86);
  ctx.beginPath();
  ctx.moveTo(cx, h * 0.1);
  ctx.quadraticCurveTo(w * 0.98, h * 0.06, w * 0.95, big ? h * 0.42 : h * 0.34);
  ctx.quadraticCurveTo(w * 0.7, h * 0.3, cx, h * (big ? 0.38 : 0.3));
  ctx.closePath();
  ctx.fillStyle = metalGrad(ctx, cx, 0, w, h * 0.3, base);
  ctx.fill();
  outline(ctx);
  if (big) {
    ctx.beginPath();
    ctx.moveTo(cx, h * 0.12);
    ctx.quadraticCurveTo(w * 0.02, h * 0.1, w * 0.06, h * 0.36);
    ctx.quadraticCurveTo(w * 0.25, h * 0.3, cx, h * 0.34);
    ctx.closePath();
    ctx.fill();
    outline(ctx);
  }
}

function drawMace(ctx: CanvasRenderingContext2D, w: number, h: number, kind: string, base: string) {
  const cx = w / 2;
  ctx.fillStyle = '#5a3a20';
  ctx.fillRect(cx - w * 0.05, h * 0.25, w * 0.1, h * 0.72);
  ctx.strokeRect(cx - w * 0.05, h * 0.25, w * 0.1, h * 0.72);
  ctx.fillStyle = metalGrad(ctx, cx - w * 0.3, 0, cx + w * 0.3, h * 0.3, base);
  if (kind === 'flail') {
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, h * 0.25);
    ctx.lineTo(cx + w * 0.2, h * 0.12);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + w * 0.22, h * 0.12, w * 0.18, 0, Math.PI * 2);
    ctx.fill();
    outline(ctx);
  } else if (kind === 'warhammer' || kind === 'maul') {
    ctx.fillRect(cx - w * 0.38, h * 0.08, w * 0.76, h * 0.2);
    ctx.strokeRect(cx - w * 0.38, h * 0.08, w * 0.76, h * 0.2);
  } else {
    ctx.beginPath();
    ctx.arc(cx, h * 0.17, w * 0.24, 0, Math.PI * 2);
    ctx.fill();
    outline(ctx);
    if (kind !== 'club') {
      ctx.fillStyle = '#ddd';
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * w * 0.27, h * 0.17 + Math.sin(a) * w * 0.27, w * 0.05, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function drawShield(ctx: CanvasRenderingContext2D, w: number, h: number, id: string, tint: string) {
  const cx = w / 2;
  ctx.beginPath();
  if (id === 'buckler' || id === 'roundshield') {
    ctx.arc(cx, h / 2, Math.min(w, h) * 0.44, 0, Math.PI * 2);
  } else if (id === 'kiteshield') {
    ctx.moveTo(w * 0.1, h * 0.08);
    ctx.lineTo(w * 0.9, h * 0.08);
    ctx.lineTo(w * 0.88, h * 0.5);
    ctx.lineTo(cx, h * 0.96);
    ctx.lineTo(w * 0.12, h * 0.5);
    ctx.closePath();
  } else {
    ctx.moveTo(w * 0.08, h * 0.05);
    ctx.lineTo(w * 0.92, h * 0.05);
    ctx.lineTo(w * 0.92, h * 0.85);
    ctx.lineTo(cx, h * 0.97);
    ctx.lineTo(w * 0.08, h * 0.85);
    ctx.closePath();
  }
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, tint);
  g.addColorStop(1, '#1a0e08');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#a8a8b0';
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.fillStyle = '#c8c8d0';
  ctx.beginPath();
  ctx.arc(cx, h * 0.45, w * 0.1, 0, Math.PI * 2);
  ctx.fill();
}

function drawHelm(ctx: CanvasRenderingContext2D, w: number, h: number, id: string) {
  const cx = w / 2;
  if (id === 'crown') {
    ctx.beginPath();
    ctx.moveTo(w * 0.1, h * 0.75);
    ctx.lineTo(w * 0.1, h * 0.35);
    ctx.lineTo(w * 0.28, h * 0.55);
    ctx.lineTo(cx, h * 0.2);
    ctx.lineTo(w * 0.72, h * 0.55);
    ctx.lineTo(w * 0.9, h * 0.35);
    ctx.lineTo(w * 0.9, h * 0.75);
    ctx.closePath();
    ctx.fillStyle = metalGrad(ctx, 0, 0, w, h, '#e8c060');
    ctx.fill();
    outline(ctx);
    ctx.fillStyle = '#c02020';
    ctx.beginPath();
    ctx.arc(cx, h * 0.6, w * 0.07, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(w * 0.14, h * 0.85);
  ctx.lineTo(w * 0.14, h * 0.45);
  ctx.quadraticCurveTo(cx, -h * 0.05, w * 0.86, h * 0.45);
  ctx.lineTo(w * 0.86, h * 0.85);
  ctx.closePath();
  ctx.fillStyle = id === 'cap' ? '#6a5a3a' : metalGrad(ctx, 0, 0, w, h, id === 'skullcap' ? '#a8a090' : '#b8b8c0');
  ctx.fill();
  outline(ctx);
  if (id === 'fullhelm' || id === 'greathelm') {
    ctx.fillStyle = '#111';
    ctx.fillRect(w * 0.24, h * 0.5, w * 0.52, h * 0.07);
    ctx.fillRect(cx - w * 0.03, h * 0.5, w * 0.06, h * 0.25);
  } else if (id === 'helm') {
    ctx.fillStyle = '#8a8a90';
    ctx.fillRect(cx - w * 0.04, h * 0.45, w * 0.08, h * 0.35);
  }
}

function drawArmor(ctx: CanvasRenderingContext2D, w: number, h: number, id: string) {
  const metal = ['ringmail', 'scalemail', 'chainmail', 'breastplate', 'platemail', 'gothicplate'].includes(id);
  ctx.beginPath();
  ctx.moveTo(w * 0.28, h * 0.06);
  ctx.lineTo(w * 0.72, h * 0.06);
  ctx.lineTo(w * 0.96, h * 0.2);
  ctx.lineTo(w * 0.88, h * 0.48);
  ctx.lineTo(w * 0.78, h * 0.42);
  ctx.lineTo(w * 0.8, h * 0.95);
  ctx.lineTo(w * 0.2, h * 0.95);
  ctx.lineTo(w * 0.22, h * 0.42);
  ctx.lineTo(w * 0.12, h * 0.48);
  ctx.lineTo(w * 0.04, h * 0.2);
  ctx.closePath();
  const base = id === 'quiltedarmor' ? '#8a7a5a' : id === 'leatherarmor' ? '#6a4428' : id === 'gothicplate' ? '#5a5a62' : '#a8a8b0';
  ctx.fillStyle = metal ? metalGrad(ctx, 0, 0, w, h, base) : base;
  ctx.fill();
  outline(ctx);
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  if (id === 'chainmail' || id === 'ringmail' || id === 'scalemail') {
    for (let y = h * 0.15; y < h * 0.9; y += 4) {
      ctx.beginPath();
      ctx.moveTo(w * 0.24, y);
      ctx.lineTo(w * 0.76, y);
      ctx.stroke();
    }
  } else {
    ctx.beginPath();
    ctx.moveTo(w / 2, h * 0.1);
    ctx.lineTo(w / 2, h * 0.9);
    ctx.stroke();
  }
  ctx.fillStyle = '#3a2412';
  ctx.fillRect(w * 0.2, h * 0.7, w * 0.6, h * 0.06);
}

function drawGloves(ctx: CanvasRenderingContext2D, w: number, h: number, id: string) {
  const metal = id === 'chaingloves' || id === 'gauntlets';
  ctx.beginPath();
  ctx.moveTo(w * 0.25, h * 0.95);
  ctx.lineTo(w * 0.25, h * 0.45);
  ctx.lineTo(w * 0.15, h * 0.35);
  ctx.lineTo(w * 0.22, h * 0.28);
  ctx.lineTo(w * 0.32, h * 0.38);
  ctx.lineTo(w * 0.32, h * 0.1);
  ctx.lineTo(w * 0.72, h * 0.1);
  ctx.lineTo(w * 0.75, h * 0.95);
  ctx.closePath();
  ctx.fillStyle = metal ? metalGrad(ctx, 0, 0, w, h) : id === 'heavygloves' ? '#5a3a20' : '#7a5a38';
  ctx.fill();
  outline(ctx);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(w * (0.32 + i * 0.1), h * 0.1);
    ctx.lineTo(w * (0.32 + i * 0.1), h * 0.45);
    ctx.stroke();
  }
}

function drawBoots(ctx: CanvasRenderingContext2D, w: number, h: number, id: string) {
  const metal = id === 'chainboots' || id === 'greaves';
  ctx.beginPath();
  ctx.moveTo(w * 0.3, h * 0.08);
  ctx.lineTo(w * 0.62, h * 0.08);
  ctx.lineTo(w * 0.62, h * 0.62);
  ctx.lineTo(w * 0.92, h * 0.78);
  ctx.lineTo(w * 0.92, h * 0.94);
  ctx.lineTo(w * 0.24, h * 0.94);
  ctx.closePath();
  ctx.fillStyle = metal ? metalGrad(ctx, 0, 0, w, h) : id === 'heavyboots' ? '#4a3018' : '#6a4a2a';
  ctx.fill();
  outline(ctx);
}

function drawBelt(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = '#5a3a1e';
  ctx.fillRect(w * 0.04, h * 0.3, w * 0.92, h * 0.4);
  ctx.strokeRect(w * 0.04, h * 0.3, w * 0.92, h * 0.4);
  ctx.strokeStyle = '#c8a040';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(w * 0.42, h * 0.22, w * 0.16, h * 0.56);
  ctx.fillStyle = '#3a2410';
  for (let i = 0; i < 4; i++) ctx.fillRect(w * (0.1 + i * 0.2), h * 0.45, 3, 3);
}

function drawRing(ctx: CanvasRenderingContext2D, w: number, h: number, gem: string) {
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#d8b040';
  ctx.beginPath();
  ctx.arc(w / 2, h * 0.6, w * 0.27, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = gem;
  ctx.beginPath();
  ctx.arc(w / 2, h * 0.3, w * 0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 1;
  outline(ctx);
}

function drawAmulet(ctx: CanvasRenderingContext2D, w: number, h: number, gem: string) {
  ctx.strokeStyle = '#c8a040';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(w / 2, h * 0.25, w * 0.32, Math.PI * 0.1, Math.PI * 0.9);
  ctx.stroke();
  ctx.fillStyle = '#c8a040';
  ctx.beginPath();
  ctx.moveTo(w / 2, h * 0.45);
  ctx.lineTo(w * 0.72, h * 0.66);
  ctx.lineTo(w / 2, h * 0.92);
  ctx.lineTo(w * 0.28, h * 0.66);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = gem;
  ctx.beginPath();
  ctx.arc(w / 2, h * 0.67, w * 0.11, 0, Math.PI * 2);
  ctx.fill();
}

function drawPotion(ctx: CanvasRenderingContext2D, w: number, h: number, tint: string) {
  ctx.fillStyle = 'rgba(220,220,220,0.25)';
  ctx.beginPath();
  ctx.arc(w / 2, h * 0.62, w * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = tint;
  ctx.beginPath();
  ctx.arc(w / 2, h * 0.64, w * 0.26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.arc(w * 0.42, h * 0.56, w * 0.07, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c8c8c0';
  ctx.fillRect(w * 0.42, h * 0.18, w * 0.16, h * 0.2);
  ctx.fillStyle = '#7a5a3a';
  ctx.fillRect(w * 0.4, h * 0.1, w * 0.2, h * 0.1);
}

function drawRune(ctx: CanvasRenderingContext2D, w: number, h: number, glyph: string, color: string) {
  ctx.fillStyle = '#4a4440';
  ctx.beginPath();
  ctx.moveTo(w * 0.2, h * 0.12);
  ctx.lineTo(w * 0.8, h * 0.1);
  ctx.lineTo(w * 0.86, h * 0.86);
  ctx.lineTo(w * 0.16, h * 0.9);
  ctx.closePath();
  ctx.fill();
  outline(ctx);
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 6;
  ctx.font = `bold ${Math.floor(h * 0.55)}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(glyph, w / 2, h * 0.52);
  ctx.shadowBlur = 0;
}

const GEMS = ['#3080ff', '#ff3030', '#30d040', '#d040ff', '#ffd030', '#30e0e0'];

export function itemIcon(item: Item): string {
  const b = ITEM_BASES[item.baseId];
  const gem = GEMS[(item.uid.charCodeAt(item.uid.length - 1) + item.uid.length) % GEMS.length];
  const key = `${item.baseId}|${b.type === 'ring' || b.type === 'amulet' ? gem : ''}|${item.rarity}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const scale = 2;
  const w = b.w * CELL * scale;
  const h = b.h * CELL * scale;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.scale(scale, scale);
  const W = b.w * CELL;
  const H = b.h * CELL;
  ctx.translate(W * 0.08, H * 0.06);
  ctx.scale(0.84, 0.88);
  const metal = item.rarity === 'unique' || item.rarity === 'runeword' ? '#d8c088' : item.rarity === 'set' ? '#a8d8a0' : '#c8c8d0';
  switch (b.type) {
    case 'sword':
      drawSword(ctx, W, H, b.w > 1 || !!b.twoHanded, metal);
      break;
    case 'axe':
      drawAxe(ctx, W, H, !!b.twoHanded || b.id === 'cleaver', metal);
      break;
    case 'mace':
      drawMace(ctx, W, H, b.id, metal);
      break;
    case 'shield':
      drawShield(ctx, W, H, b.id, item.rarity === 'unique' ? '#7a5a20' : item.rarity === 'set' ? '#2a5a2a' : '#6a3a1e');
      break;
    case 'helm':
      drawHelm(ctx, W, H, b.id);
      break;
    case 'armor':
      drawArmor(ctx, W, H, b.id);
      break;
    case 'gloves':
      drawGloves(ctx, W, H, b.id);
      break;
    case 'boots':
      drawBoots(ctx, W, H, b.id);
      break;
    case 'belt':
      drawBelt(ctx, W, H);
      break;
    case 'ring':
      drawRing(ctx, W, H, gem);
      break;
    case 'amulet':
      drawAmulet(ctx, W, H, gem);
      break;
    case 'potion':
      drawPotion(ctx, W, H, b.tint ?? '#c01010');
      break;
    case 'rune': {
      const r = RUNE_BY_ID[b.id];
      drawRune(ctx, W, H, r?.glyph ?? '?', r?.color ?? '#ffa31a');
      break;
    }
  }
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

export function skillIcon(id: string): string {
  const key = `skill-${id}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const S = 96;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d')!;
  let color = '#c8c8c8';
  let glyph = '⚔';
  if (id === 'attack') {
    color = '#b0a080';
    glyph = '⚔';
  } else if (id === 'townportal') {
    color = '#4a8aff';
    glyph = '◉';
  } else {
    const s = SKILL_BY_ID[id];
    color = s.color;
    glyph = s.glyph;
  }
  const g = ctx.createRadialGradient(S * 0.4, S * 0.35, 4, S / 2, S / 2, S * 0.75);
  g.addColorStop(0, color);
  g.addColorStop(0.55, shadeHex(color, 0.35));
  g.addColorStop(1, '#050505');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = shadeHex(color, 0.6);
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, S - 4, S - 4);
  ctx.font = `bold ${S * 0.55}px "Noto Serif SC", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#000';
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#fff8e8';
  ctx.fillText(glyph + '︎', S / 2, S / 2 + 3);
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

function shadeHex(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.floor(((n >> 16) & 255) * f);
  const g = Math.floor(((n >> 8) & 255) * f);
  const b = Math.floor((n & 255) * f);
  return `rgb(${r},${g},${b})`;
}
