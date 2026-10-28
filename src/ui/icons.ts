import { ITEM_BASES, lookOf, staffGem } from '../data/items';
import type { QuestIcon } from '../data/quests';
import { GEMS as GEM_DEFS, RUNE_BY_ID } from '../data/legendary';
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

function drawStaff(ctx: CanvasRenderingContext2D, w: number, h: number, kind: string) {
  const cx = w / 2;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#2a180a';
  ctx.lineWidth = Math.max(4, w * 0.16);
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.06, h * 0.97);
  ctx.quadraticCurveTo(cx + w * 0.12, h * 0.55, cx, h * 0.16);
  ctx.stroke();
  ctx.strokeStyle = lookOf(ITEM_BASES[kind]?.tiers?.[0]) === 'gnarledstaff' ? '#6a5030' : '#7a5230';
  ctx.lineWidth = Math.max(2, w * 0.09);
  ctx.stroke();
  const gem = staffGem(kind);
  if (gem) {
    ctx.fillStyle = '#8a6a2a';
    ctx.beginPath();
    ctx.arc(cx, h * 0.12, w * 0.17, 0, Math.PI * 2);
    ctx.fill();
    outline(ctx);
    ctx.fillStyle = gem;
    ctx.beginPath();
    ctx.arc(cx, h * 0.12, w * 0.1, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = '#5a3a1c';
    ctx.beginPath();
    ctx.arc(cx, h * 0.14, w * 0.12, 0, Math.PI * 2);
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
  // a rune's name is one to three characters ("艾尔", "乔")
  ctx.font = `bold ${Math.floor((h * 0.55) / Math.max(1, glyph.length * 0.72))}px "Noto Serif SC", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(glyph, w / 2, h * 0.52);
  ctx.shadowBlur = 0;
}

/** a long haft with a head at the top: spears (a leaf blade), polearms (an axe blade and spike) */
function drawPole(ctx: CanvasRenderingContext2D, w: number, h: number, kind: 'spear' | 'polearm', base: string) {
  const cx = w / 2;
  ctx.fillStyle = '#5a3a20';
  ctx.fillRect(cx - w * 0.06, h * 0.12, w * 0.12, h * 0.86);
  ctx.strokeRect(cx - w * 0.06, h * 0.12, w * 0.12, h * 0.86);
  ctx.fillStyle = metalGrad(ctx, cx - w * 0.3, 0, cx + w * 0.3, h * 0.25, base);
  ctx.beginPath();
  if (kind === 'spear') {
    ctx.moveTo(cx, h * 0.01);
    ctx.quadraticCurveTo(cx + w * 0.3, h * 0.1, cx + w * 0.08, h * 0.2);
    ctx.lineTo(cx - w * 0.08, h * 0.2);
    ctx.quadraticCurveTo(cx - w * 0.3, h * 0.1, cx, h * 0.01);
  } else {
    ctx.moveTo(cx, h * 0.01);
    ctx.lineTo(cx + w * 0.06, h * 0.08);
    ctx.lineTo(cx + w * 0.06, h * 0.1);
    ctx.quadraticCurveTo(cx + w * 0.5, h * 0.08, cx + w * 0.46, h * 0.26);
    ctx.quadraticCurveTo(cx + w * 0.26, h * 0.22, cx + w * 0.06, h * 0.26);
    ctx.lineTo(cx - w * 0.06, h * 0.26);
    ctx.lineTo(cx - w * 0.06, h * 0.08);
  }
  ctx.closePath();
  ctx.fill();
  outline(ctx);
}

/** a short rod with a head: wands (a bone tip), scepters (a gilded crown and gem) */
function drawRod(ctx: CanvasRenderingContext2D, w: number, h: number, kind: 'wand' | 'scepter', gem: string) {
  const cx = w / 2;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#2a180a';
  ctx.lineWidth = Math.max(4, w * 0.16);
  ctx.beginPath();
  ctx.moveTo(cx, h * 0.96);
  ctx.lineTo(cx, h * 0.24);
  ctx.stroke();
  ctx.strokeStyle = kind === 'wand' ? '#d8ccb0' : '#8a6a30';
  ctx.lineWidth = Math.max(2, w * 0.09);
  ctx.stroke();
  if (kind === 'wand') {
    ctx.fillStyle = '#e8dcc0';
    ctx.beginPath();
    ctx.arc(cx, h * 0.17, w * 0.16, 0, Math.PI * 2);
    ctx.fill();
    outline(ctx);
    ctx.fillStyle = '#1a1008';
    ctx.fillRect(cx - w * 0.09, h * 0.15, w * 0.06, h * 0.03);
    ctx.fillRect(cx + w * 0.03, h * 0.15, w * 0.06, h * 0.03);
  } else {
    ctx.fillStyle = metalGrad(ctx, cx - w * 0.3, 0, cx + w * 0.3, h * 0.3, '#d8b860');
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.3, h * 0.28);
    ctx.lineTo(cx - w * 0.34, h * 0.08);
    ctx.lineTo(cx - w * 0.12, h * 0.16);
    ctx.lineTo(cx, h * 0.02);
    ctx.lineTo(cx + w * 0.12, h * 0.16);
    ctx.lineTo(cx + w * 0.34, h * 0.08);
    ctx.lineTo(cx + w * 0.3, h * 0.28);
    ctx.closePath();
    ctx.fill();
    outline(ctx);
    ctx.fillStyle = gem;
    ctx.beginPath();
    ctx.arc(cx, h * 0.19, w * 0.09, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** a sorceress's orb: a glowing sphere */
function drawOrb(ctx: CanvasRenderingContext2D, w: number, h: number, color: string) {
  const cx = w / 2;
  const cy = h * 0.48;
  const r = Math.min(w, h) * 0.36;
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.35, color);
  g.addColorStop(1, '#0a0a18');
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  outline(ctx);
}

/** a cut gem; the grade sets its size and how many facets show */
function drawGem(ctx: CanvasRenderingContext2D, w: number, h: number, color: string, grade: number, skull: boolean) {
  const cx = w / 2;
  const cy = h / 2;
  const r = w * (0.2 + grade * 0.05);
  if (skull) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.15, r, Math.PI, 0);
    ctx.lineTo(cx + r * 0.6, cy + r * 0.8);
    ctx.lineTo(cx - r * 0.6, cy + r * 0.8);
    ctx.closePath();
    ctx.fill();
    outline(ctx);
    ctx.fillStyle = '#1a1008';
    ctx.beginPath();
    ctx.arc(cx - r * 0.38, cy, r * 0.22, 0, Math.PI * 2);
    ctx.arc(cx + r * 0.38, cy, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const n = 5 + grade;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  ctx.closePath();
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 1, cx, cy, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.4, color);
  g.addColorStop(1, shadeHex(color, 0.35));
  ctx.shadowColor = color;
  ctx.shadowBlur = grade * 3;
  ctx.fillStyle = g;
  ctx.fill();
  ctx.shadowBlur = 0;
  outline(ctx);
}

/** the Horadric Cube: a dark box with gold edges and a rune on its face */
function drawCube(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const s = Math.min(w, h) * 0.78;
  const x = (w - s) / 2;
  const y = (h - s) / 2 + s * 0.06;
  const d = s * 0.22;
  ctx.fillStyle = '#3a2a1a';
  ctx.beginPath();
  ctx.moveTo(x, y + d);
  ctx.lineTo(x + d, y);
  ctx.lineTo(x + s, y);
  ctx.lineTo(x + s - d, y + d);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#2a1c10';
  ctx.beginPath();
  ctx.moveTo(x + s - d, y + d);
  ctx.lineTo(x + s, y);
  ctx.lineTo(x + s, y + s - d);
  ctx.lineTo(x + s - d, y + s);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#4a3624';
  ctx.fillRect(x, y + d, s - d, s - d);
  ctx.strokeStyle = '#c8a040';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y + d, s - d, s - d);
  ctx.beginPath();
  ctx.moveTo(x, y + d);
  ctx.lineTo(x + d, y);
  ctx.lineTo(x + s, y);
  ctx.lineTo(x + s, y + s - d);
  ctx.lineTo(x + s - d, y + s);
  ctx.moveTo(x + s - d, y + d);
  ctx.lineTo(x + s, y);
  ctx.stroke();
  ctx.fillStyle = '#ffd060';
  ctx.shadowColor = '#ffb020';
  ctx.shadowBlur = 8;
  ctx.font = `bold ${Math.floor(s * 0.45)}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ᚺ', x + (s - d) / 2, y + d + (s - d) / 2);
  ctx.shadowBlur = 0;
}

const GEMS = ['#3080ff', '#ff3030', '#30d040', '#d040ff', '#ffd030', '#30e0e0'];
const GEM_BY_ID = Object.fromEntries(GEM_DEFS.map((g) => [g.id, g]));

/**
 * The code-drawn icon of an item: what a cell shows while its painted picture loads, and for an item
 * with none (src/ui/itempics.ts itemImg). Like D2's pictures it doesn't mark the quality: the name's
 * colour does that
 */
export function itemIcon(item: Item): string {
  const b = ITEM_BASES[item.baseId];
  const gem = GEMS[(item.uid.charCodeAt(item.uid.length - 1) + item.uid.length) % GEMS.length];
  const key = `${item.baseId}|${b.type === 'ring' || b.type === 'amulet' ? gem : ''}`;
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
  // exceptional bases a darker steel, elite ones a blued one (in D2 the three share one picture)
  const metal = b.tier === 2 ? '#98a8c8' : b.tier === 1 ? '#a8a0a0' : '#c8c8d0';
  switch (b.type) {
    case 'sword':
    case 'dagger':
    case 'claw':
    case 'throwing':
      drawSword(ctx, W, H, b.w > 1 || !!b.twoHanded, metal);
      break;
    case 'axe':
      drawAxe(ctx, W, H, !!b.twoHanded, metal);
      break;
    case 'club':
      drawMace(ctx, W, H, 'club', metal);
      break;
    case 'mace':
      drawMace(ctx, W, H, lookOf(b.tiers?.[0] ?? b.id), metal);
      break;
    case 'hammer':
      drawMace(ctx, W, H, 'warhammer', metal);
      break;
    case 'spear':
    case 'polearm':
    case 'javelin':
      drawPole(ctx, W, H, b.type === 'polearm' ? 'polearm' : 'spear', metal);
      break;
    case 'bow':
    case 'crossbow':
      drawStaff(ctx, W, H, '');
      break;
    case 'wand':
    case 'scepter':
      drawRod(ctx, W, H, b.type, gem);
      break;
    case 'orb':
      drawOrb(ctx, W, H, staffGem(b.tiers?.[1] ?? 'longstaff') ?? '#a0c0ff');
      break;
    case 'gem': {
      const g = GEM_BY_ID[b.id];
      drawGem(ctx, W, H, b.tint ?? '#fff', g?.grade ?? 2, g?.gem === 'skull');
      break;
    }
    case 'cube':
      drawCube(ctx, W, H);
      break;
    case 'staff':
      drawStaff(ctx, W, H, b.id);
      break;
    case 'shield':
      drawShield(ctx, W, H, lookOf(b.id), '#6a3a1e');
      break;
    case 'helm':
      drawHelm(ctx, W, H, lookOf(b.id));
      break;
    case 'armor':
      drawArmor(ctx, W, H, lookOf(b.id));
      break;
    case 'gloves':
      drawGloves(ctx, W, H, lookOf(b.id));
      break;
    case 'boots':
      drawBoots(ctx, W, H, lookOf(b.id));
      break;
    case 'belt':
      drawBelt(ctx, W, H);
      break;
    case 'ring':
      drawRing(ctx, W, H, gem);
      break;
    case 'charm':
      drawAmulet(ctx, W, H, gem);
      break;
    case 'jewel':
      drawGem(ctx, W, H, gem, 2, false);
      break;
    case 'amulet':
      drawAmulet(ctx, W, H, gem);
      break;
    case 'potion':
      drawPotion(ctx, W, H, b.tint ?? '#c01010');
      break;
    case 'rune': {
      const r = RUNE_BY_ID[b.id];
      drawRune(ctx, W, H, r?.glyph ?? '?', '#ffa31a');
      break;
    }
    // an item this build doesn't know: a plain stone with a question mark
    case 'unknown':
      drawRune(ctx, W, H, '?', b.tint ?? '#8a8278');
      break;
    // scrolls, tomes, keys and the rest: a stone marked with the first character of its name
    default:
      drawRune(ctx, W, H, b.name.slice(0, 1), '#c8b890');
      break;
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

/**
 * A quest's picture in the quest log, a medallion: the cave of the Den of Evil, the sisters' graves,
 * the caged sage, the tower, the smith's hammer, the horned demon. The log dims or marks it by its state.
 */
export function questIcon(kind: QuestIcon): string {
  const key = `quest-${kind}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const S = 96;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d')!;
  const bg = ctx.createRadialGradient(S * 0.5, S * 0.42, 4, S / 2, S / 2, S * 0.5);
  bg.addColorStop(0, '#3a2c1e');
  bg.addColorStop(1, '#0a0705');
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S * 0.46, 0, Math.PI * 2);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.save();
  ctx.clip();
  const poly = (pts: number[][], fill: string | CanvasGradient) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * S, y * S) : ctx.moveTo(x * S, y * S)));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    outline(ctx);
  };
  const dot = (x: number, y: number, r: number, fill: string, glow = 0) => {
    ctx.shadowColor = fill;
    ctx.shadowBlur = glow;
    ctx.beginPath();
    ctx.arc(x * S, y * S, r * S, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.shadowBlur = 0;
  };
  switch (kind) {
    case 'den': {
      // a mound of rock, its mouth black, eyes in the dark
      poly([[0.05, 0.86], [0.2, 0.5], [0.38, 0.34], [0.6, 0.32], [0.8, 0.48], [0.95, 0.86]], '#5a4632');
      ctx.beginPath();
      ctx.moveTo(0.3 * S, 0.86 * S);
      ctx.quadraticCurveTo(0.3 * S, 0.5 * S, 0.5 * S, 0.5 * S);
      ctx.quadraticCurveTo(0.7 * S, 0.5 * S, 0.7 * S, 0.86 * S);
      ctx.fillStyle = '#050302';
      ctx.fill();
      dot(0.44, 0.68, 0.025, '#ff3010', 8);
      dot(0.56, 0.68, 0.025, '#ff3010', 8);
      break;
    }
    case 'graves': {
      ctx.fillStyle = '#2a2018';
      ctx.fillRect(0, 0.8 * S, S, 0.2 * S);
      const stone = (x: number, w: number, top: number) => {
        ctx.beginPath();
        ctx.moveTo((x - w / 2) * S, 0.82 * S);
        ctx.lineTo((x - w / 2) * S, (top + w / 2) * S);
        ctx.arc(x * S, (top + w / 2) * S, (w / 2) * S, Math.PI, 0);
        ctx.lineTo((x + w / 2) * S, 0.82 * S);
        ctx.closePath();
        ctx.fillStyle = metalGrad(ctx, (x - w / 2) * S, 0, (x + w / 2) * S, 0, '#8a8478');
        ctx.fill();
        outline(ctx);
      };
      stone(0.3, 0.22, 0.42);
      stone(0.68, 0.26, 0.34);
      // a cross between them
      ctx.fillStyle = '#6a5a44';
      ctx.fillRect(0.47 * S, 0.3 * S, 0.06 * S, 0.52 * S);
      ctx.fillRect(0.38 * S, 0.42 * S, 0.24 * S, 0.06 * S);
      break;
    }
    case 'cain': {
      // a wooden cage, an old man behind its bars
      dot(0.5, 0.36, 0.09, '#a8a090');
      poly([[0.32, 0.86], [0.4, 0.48], [0.6, 0.48], [0.68, 0.86]], '#5a5a6a');
      ctx.fillStyle = '#d8d0c0';
      ctx.fillRect(0.45 * S, 0.42 * S, 0.1 * S, 0.12 * S);
      ctx.strokeStyle = '#7a5428';
      ctx.lineWidth = S * 0.04;
      ctx.strokeRect(0.18 * S, 0.16 * S, 0.64 * S, 0.72 * S);
      ctx.lineWidth = S * 0.025;
      for (const x of [0.3, 0.42, 0.58, 0.7]) {
        ctx.beginPath();
        ctx.moveTo(x * S, 0.16 * S);
        ctx.lineTo(x * S, 0.88 * S);
        ctx.stroke();
      }
      break;
    }
    case 'tower': {
      poly([[0, 0.92], [0.2, 0.78], [0.8, 0.78], [1, 0.92]], '#2a2218');
      poly([[0.36, 0.82], [0.38, 0.26], [0.62, 0.26], [0.64, 0.82]], '#5c5248');
      for (const x of [0.36, 0.45, 0.54]) {
        ctx.fillStyle = '#5c5248';
        ctx.fillRect(x * S, 0.18 * S, 0.08 * S, 0.09 * S);
        ctx.strokeRect(x * S, 0.18 * S, 0.08 * S, 0.09 * S);
      }
      ctx.fillStyle = '#ffb040';
      ctx.shadowColor = '#ff8020';
      ctx.shadowBlur = 10;
      ctx.fillRect(0.46 * S, 0.4 * S, 0.08 * S, 0.12 * S);
      ctx.shadowBlur = 0;
      break;
    }
    case 'hammer': {
      ctx.save();
      ctx.translate(S / 2, S / 2);
      ctx.rotate(-0.6);
      ctx.fillStyle = '#5a3a20';
      ctx.fillRect(-0.04 * S, -0.18 * S, 0.08 * S, 0.62 * S);
      ctx.strokeRect(-0.04 * S, -0.18 * S, 0.08 * S, 0.62 * S);
      ctx.fillStyle = metalGrad(ctx, 0, -0.36 * S, 0, -0.14 * S, '#a8a8b0');
      ctx.fillRect(-0.26 * S, -0.36 * S, 0.52 * S, 0.2 * S);
      ctx.strokeRect(-0.26 * S, -0.36 * S, 0.52 * S, 0.2 * S);
      ctx.restore();
      for (const [x, y] of [[0.2, 0.3], [0.26, 0.2], [0.14, 0.42], [0.32, 0.12]]) dot(x, y, 0.012, '#ffc060', 6);
      break;
    }
    case 'demon': {
      // a horned head, its eyes poison green
      poly([[0.3, 0.42], [0.12, 0.14], [0.38, 0.34]], '#6a2a3a');
      poly([[0.7, 0.42], [0.88, 0.14], [0.62, 0.34]], '#6a2a3a');
      ctx.beginPath();
      ctx.ellipse(0.5 * S, 0.56 * S, 0.22 * S, 0.28 * S, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#4a1a2a';
      ctx.fill();
      outline(ctx);
      dot(0.41, 0.52, 0.035, '#60ff40', 10);
      dot(0.59, 0.52, 0.035, '#60ff40', 10);
      ctx.fillStyle = '#60c040';
      for (const x of [0.44, 0.5, 0.56]) ctx.fillRect(x * S, 0.7 * S, 0.02 * S, (0.08 + (x === 0.5 ? 0.06 : 0)) * S);
      break;
    }
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S * 0.46, 0, Math.PI * 2);
  ctx.strokeStyle = '#8a7040';
  ctx.lineWidth = 4;
  ctx.stroke();
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
