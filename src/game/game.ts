import type { Input } from '../core/input';
import { chance, dist, rand, randInt, type P2 } from '../core/math';
import type { Sfx } from '../audio/sfx';
import { CLASSES, type PlayerClass } from '../data/classes';
import { ITEM_BASES } from '../data/items';
import { SKILL_BY_ID } from '../data/skills';
import { Grid } from '../items/grid';
import { createItem, rollEquipment, rollMonsterDrops, type Drop } from '../items/gen';
import { baseOf, type Item } from '../items/item';
import { emptyPacket } from './actor';
import { blastDamage, updateMonster } from './ai';
import { applyDamage, monsterStrike } from './combat';
import { nullFx, type Fx } from './fx';
import { Level } from './level';
import type { Monster } from './monster';
import { DelayedBlast, GroundItem, Projectile, WorldObject } from './objects';
import { Player } from './player';
import { startCast, toggleAura, updatePlayer, type PlayerAction } from './playerctl';
import type { Elem } from '../data/monsters';
import { loadSave, markInGame, setSlot, writeSave } from './save';

export interface GameHooks {
  message(text: string, color?: string, dur?: number): void;
  openPanel(kind: 'shop' | 'stash' | 'waypoint'): void;
  levelChanged(level: Level): void;
  playerDied(): void;
  inventoryChanged(): void;
  getCursorItem(): Item | null;
  setCursorItem(item: Item | null): void;
  hoveredGroundId(): number | null;
  levelUp(): void;
}

export interface Picker {
  screenToGround(x: number, y: number): P2 | null;
  pickMonster(x: number, y: number, list: Monster[]): Monster | null;
  pickObject(x: number, y: number, list: WorldObject[]): WorldObject | null;
}

const ACTIVE_RADIUS = 30;

export class Game {
  player: Player;
  level!: Level;
  portalLevel: Level | null = null;
  /** the dungeon floor visited last, kept so waypoint trips and deaths don't reroll it */
  lastDungeon: Level | null = null;
  fx: Fx = nullFx;
  hooks!: GameHooks;
  picker!: Picker;
  time = 0;
  hitstop = 0;
  hover: { monster: Monster | null; object: WorldObject | null; ground: GroundItem | null } = { monster: null, object: null, ground: null };
  playerAction: PlayerAction | null = null;
  auraPulse = 0;
  saveTimer = 0;
  lmbMode: 'none' | 'move' | 'attack' | 'other' = 'none';
  shop = new Grid(10, 10);
  paused = false;
  /** driven externally (balance bot): the page loop neither steps nor renders */
  headless = false;
  started = false;

  constructor(
    public input: Input,
    public sfx: Sfx,
  ) {
    this.player = new Player({ x: 0, z: 0 });
  }

  // ───────────────────────── lifecycle ─────────────────────────

  newGame(name: string, cls: PlayerClass = 'paladin') {
    const cd = CLASSES[cls];
    const p = new Player({ x: 0, z: 0 });
    p.name = name || cd.defaultName;
    p.cls = cls;
    p.base = { ...cd.base };
    p.equipment.weapon = createItem(cd.weapon);
    if (cd.offhand) p.equipment.offhand = createItem(cd.offhand);
    p.belt[0].push(createItem('hp1'));
    p.belt[1].push(createItem('hp1'));
    p.belt[2].push(createItem('mp1'));
    p.belt[3].push(createItem('hp1'));
    p.inventory.add(createItem('hp1'));
    p.inventory.add(createItem('mp1'));
    p.gold = 50;
    p.skills[cd.firstSkill] = 1;
    p.skillPoints = 0;
    p.binds = ['attack', cd.firstSkill, null, null, null, null];
    p.markDirty();
    p.recalc();
    p.life = p.d.maxLife;
    p.mana = p.d.maxMana;
    this.player = p;
    this.started = true;
    this.lastDungeon = null;
    this.portalLevel = null;
    markInGame(true);
    this.enterLevel(0, 'start');
  }

  /** resume a saved character (the current slot when none is given) */
  continueGame(slot?: number): boolean {
    if (slot !== undefined) setSlot(slot);
    const s = loadSave();
    if (!s) return false;
    this.player = s.player;
    this.started = true;
    this.lastDungeon = null;
    this.portalLevel = null;
    markInGame(true);
    // floors are regenerated; you arrive at the entrance of the floor you were on
    this.enterLevel(s.depth, 'start');
    return true;
  }

  save() {
    if (this.started && this.level) writeSave(this.player, this.level.depth);
  }

  enterLevel(depth: number, how: 'start' | 'stairs' | 'waypoint' | 'portal' | 'respawn') {
    const p = this.player;
    let level: Level;
    if (how === 'portal' && depth > 0 && this.portalLevel && this.portalLevel.depth === depth) {
      level = this.portalLevel;
    } else if (how !== 'stairs' && depth > 0 && this.lastDungeon?.depth === depth) {
      // like D2: going back to the floor you left (waypoint, after dying) finds it as you left it;
      // the dead stay dead, survivors have healed
      level = this.lastDungeon;
      level.reenter();
    } else {
      level = new Level(depth, (Math.random() * 2 ** 31) | 0);
    }
    if (depth > 0) this.lastDungeon = level;
    this.level = level;
    let spawn: P2 = level.layout.start;
    if (how === 'portal') {
      if (depth === 0) {
        // create the return portal in town
        const pt = { x: level.layout.start.x - 2.5, z: level.layout.start.z + 0.5 };
        const portal = new WorldObject('portal', pt, `传送门 · 第 ${this.portalLevel?.depth ?? 1} 层`, 0.6);
        portal.dest = this.portalLevel?.depth ?? 1;
        level.objects.push(portal);
        spawn = { x: pt.x + 1.2, z: pt.z + 0.6 };
      } else {
        const portal = level.objects.find((o) => o.kind === 'portal');
        if (portal) {
          spawn = { x: portal.pos.x + 1, z: portal.pos.z + 0.8 };
          level.objects.splice(level.objects.indexOf(portal), 1);
        }
        this.portalLevel = null;
      }
    }
    const safe = level.map.nearestWalkable(spawn.x, spawn.z) ?? spawn;
    p.pos = { ...safe };
    p.intent = null;
    p.path = null;
    p.setState('idle');
    p.knockVel = { x: 0, z: 0 };
    p.zealHitsLeft = 0;
    p.chargeTarget = null;
    this.playerAction = null;
    this.lmbMode = 'none';
    if (depth > 0) {
      p.depthReached = Math.max(p.depthReached, depth);
      if (!p.waypoints.includes(depth)) {
        p.waypoints.push(depth);
        p.waypoints.sort((a, b) => a - b);
        if (how !== 'start') this.hooks.message('传送点已激活', '#c8a86a', 2);
      }
    } else {
      this.refreshShop();
    }
    this.sfx.ambience(depth === 0 ? 'town' : 'dungeon');
    this.hooks.levelChanged(level);
    this.hooks.message(level.name, '#d8c8a0', 3);
    this.save();
  }

  refreshShop() {
    this.shop = new Grid(10, 10);
    const lvl = Math.max(1, this.player.level);
    const potions = ['hp1', 'hp2', 'hp3', 'hp4', 'mp1', 'mp2', 'mp3', 'mp4'].filter((id) => ITEM_BASES[id].qlvl <= lvl + 4);
    for (const id of potions) this.shop.add(createItem(id));
    const count = randInt(9, 14);
    for (let i = 0; i < count; i++) {
      const it = rollEquipment(Math.min(40, lvl + randInt(0, 3)), { mf: 0 });
      if (it.rarity === 'unique' || it.rarity === 'set') continue;
      this.shop.add(it);
    }
  }

  respawn() {
    const p = this.player;
    p.dead = false;
    p.recalc();
    p.life = p.stats.maxLife;
    p.mana = p.stats.maxMana;
    p.poisonTime = 0;
    p.chillTime = 0;
    p.healQueue = [];
    p.manaQueue = [];
    this.enterLevel(0, 'respawn');
  }

  // ───────────────────────── frame update ─────────────────────────

  update(dt: number) {
    if (!this.started || this.paused) return;
    this.time += dt;
    const L = this.level;
    for (const a of [this.player, ...L.monsters, ...L.projectiles]) {
      a.prevPos.x = a.pos.x;
      a.prevPos.z = a.pos.z;
    }
    this.updateHover();
    this.handleInput();
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      return;
    }
    const p = this.player;
    updatePlayer(this, p, dt);
    for (const m of L.monsters) {
      if (dist(m.pos, p.pos) > ACTIVE_RADIUS && !m.dead) continue;
      m.hitFlash = Math.max(0, m.hitFlash - dt * 6);
      m.convictRes = 0;
      m.convictDef = 0;
      updateMonster(this, m, dt);
    }
    p.hitFlash = Math.max(0, p.hitFlash - dt * 6);
    this.updateAuras(dt);
    this.separate();
    this.updateProjectiles(dt);
    this.updateHammers(dt);
    for (const b of L.blasts) {
      b.delay -= dt;
      if (b.delay <= 0 && !b.done) {
        b.done = true;
        if (b.fx) this.fx.burst(b.fx, b.pos, { radius: b.radius });
        blastDamage(this, b);
      }
    }
    L.blasts = L.blasts.filter((b) => !b.done);
    // ground items: animate & auto-pickup gold
    for (const gi of L.ground) {
      gi.age += dt;
      if (gi.gold > 0 && gi.age > 0.5 && !p.dead && dist(gi.pos, p.pos) < 1.1) this.pickupGround(gi);
    }
    for (const o of L.objects) if (o.used) o.usedTime += dt;
    // corpse cleanup
    if (L.monsters.length > 0 && Math.random() < 0.02) {
      L.monsters = L.monsters.filter((m) => !m.dead || m.deathTime < 40);
    }
    this.saveTimer += dt;
    if (this.saveTimer > 8) {
      this.saveTimer = 0;
      this.save();
    }
  }

  private updateHover() {
    const inp = this.input;
    const gid = this.hooks.hoveredGroundId();
    const ground = gid !== null ? this.level.ground.find((g) => g.id === gid) ?? null : null;
    let monster: Monster | null = null;
    let object: WorldObject | null = null;
    if (!ground && !inp.overUI) {
      const near = this.level.monsters.filter((m) => !m.dead && dist(m.pos, this.player.pos) < 22);
      monster = this.picker.pickMonster(inp.mx, inp.my, near);
      if (!monster) object = this.picker.pickObject(inp.mx, inp.my, this.level.objects.filter((o) => !(o.used && (o.kind === 'chest' || o.kind === 'barrel'))));
    }
    this.hover = { monster, object, ground };
  }

  private handleInput() {
    const inp = this.input;
    const p = this.player;
    if (p.dead) return;
    const point = this.picker.screenToGround(inp.mx, inp.my) ?? p.pos;
    const h = this.hover;

    // number keys: belt
    for (let i = 0; i < 4; i++) if (inp.pressed.has(String(i + 1))) this.useBelt(i);

    // left mouse
    if (inp.lmbPressed) {
      const cursor = this.hooks.getCursorItem();
      if (cursor) {
        this.dropItem(cursor);
        this.hooks.setCursorItem(null);
        this.lmbMode = 'other';
      } else if (h.ground) {
        p.intent = { kind: 'pickup', ground: h.ground };
        this.lmbMode = 'other';
      } else if (h.monster) {
        this.useSkillAt(p.binds[0] ?? 'attack', h.monster, point, true);
        this.lmbMode = 'attack';
      } else if (h.object) {
        p.intent = { kind: 'interact', obj: h.object };
        this.lmbMode = 'other';
      } else if (inp.shift) {
        p.intent = { kind: 'cast', skill: p.binds[0] ?? 'attack', point, target: null };
        this.lmbMode = 'attack';
      } else {
        p.intent = { kind: 'move', point };
        this.lmbMode = 'move';
      }
    } else if (inp.lmb && inp.worldDown) {
      if (this.lmbMode === 'move') {
        if (p.intent?.kind === 'move' || !p.intent) p.intent = { kind: 'move', point };
      } else if (this.lmbMode === 'attack' && inp.shift && (p.state === 'idle' || p.state === 'move')) {
        p.intent = { kind: 'cast', skill: p.binds[0] ?? 'attack', point, target: null };
      } else if (this.lmbMode === 'attack' && !p.intent && h.monster && (p.state === 'idle' || p.state === 'move')) {
        this.useSkillAt(p.binds[0] ?? 'attack', h.monster, point, false);
      }
    } else if (!inp.lmb) {
      if (p.intent?.kind === 'attack' && this.lmbMode === 'attack') p.intent.hold = false;
      this.lmbMode = 'none';
    }

    // right mouse
    const rskill = p.binds[1];
    if (rskill && (inp.rmbPressed || (inp.rmb && inp.worldRDown))) {
      this.useSkillAt(rskill, h.monster, point, inp.rmbPressed);
    }
    // hotkeys
    const keys = ['q', 'w', 'e', 'r'];
    for (let i = 0; i < 4; i++) {
      const sk = p.binds[2 + i];
      if (!sk) continue;
      const k = keys[i];
      if (inp.pressed.has(k) || (inp.keys.has(k) && !inp.overUI)) this.useSkillAt(sk, h.monster, point, inp.pressed.has(k));
    }
  }

  useSkillAt(skill: string, monster: Monster | null, point: P2, isPress: boolean) {
    const p = this.player;
    const def = SKILL_BY_ID[skill];
    if (skill !== 'attack' && (!def || p.skillLevel(skill) <= 0)) return;
    const busy = !(p.state === 'idle' || p.state === 'move');
    if (skill === 'attack' || def.kind === 'attack') {
      if (monster) {
        if (p.intent?.kind === 'attack' && p.intent.target === monster && p.intent.skill === skill) {
          p.intent.hold = true;
          return;
        }
        p.intent = { kind: 'attack', target: monster, skill, hold: true };
      } else if (isPress && skill !== 'charge') {
        p.intent = { kind: 'cast', skill, point, target: null };
      }
      return;
    }
    if (def.kind === 'aura') {
      if (isPress) toggleAura(this, p, skill);
      return;
    }
    if (def.kind === 'passive') return;
    // spells & buffs
    if (!isPress && busy) return;
    if (!busy) {
      startCast(this, p, skill, monster ? monster.pos : point, monster);
      p.intent = null;
    } else if (isPress) {
      p.intent = { kind: 'cast', skill, point, target: monster };
    }
  }

  // ───────────────────────── combat helpers ─────────────────────────

  private updateAuras(dt: number) {
    const p = this.player;
    if (p.dead || !p.activeAura) return;
    const aura = p.activeAura;
    const lvl = p.skillLevel(aura);
    if (lvl <= 0) return;
    const sp = p.skillParams(aura);
    const radius = sp.radius ?? 5;
    const inRange = this.level.monsters.filter((m) => !m.dead && dist(m.pos, p.pos) <= radius + m.radius);
    if (aura === 'holy_freeze') {
      for (const m of inRange) {
        m.chillTime = Math.max(m.chillTime, 0.3);
        m.chillAmount = sp.slow / 100;
      }
    }
    if (aura === 'conviction') {
      for (const m of inRange) {
        m.convictRes = sp.res;
        m.convictDef = sp.def;
      }
    }
    this.auraPulse -= dt;
    if (this.auraPulse > 0) return;
    this.auraPulse = 1;
    if (aura === 'prayer') {
      if (p.life < p.stats.maxLife) p.life = Math.min(p.stats.maxLife, p.life + sp.heal);
    } else if (aura === 'holy_fire' || aura === 'holy_freeze') {
      this.fx.burst(aura === 'holy_fire' ? 'holyfire' : 'freeze', p.pos, { radius });
      for (const m of inRange) {
        const pk = emptyPacket();
        if (aura === 'holy_fire') pk.fire = randInt(sp.min, sp.max);
        else {
          pk.cold = randInt(sp.min, sp.max);
          pk.chill = 1;
        }
        pk.source = p;
        pk.spell = true;
        pk.pierceRes = p.stats.pierceRes;
        applyDamage(this, m, pk, p.pos);
      }
    }
  }

  private separate() {
    const p = this.player;
    const list = this.level.monsters.filter((m) => !m.dead && dist(m.pos, p.pos) < ACTIVE_RADIUS);
    const actors: { pos: P2; radius: number; w: number }[] = [];
    if (!p.dead) actors.push({ pos: p.pos, radius: p.radius, w: p.state === 'charge' ? 0.05 : 0.2 });
    for (const m of list) actors.push({ pos: m.pos, radius: m.radius, w: m.rank === 'boss' ? 0.25 : 1 });
    const n = actors.length;
    for (let i = 0; i < n; i++) {
      const a = actors[i];
      for (let j = i + 1; j < n; j++) {
        const b = actors[j];
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const r = a.radius + b.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        const d = Math.sqrt(d2) || 0.001;
        const push = (r - d) * 0.5;
        const nx = d2 > 1e-6 ? dx / d : Math.random() - 0.5;
        const nz = d2 > 1e-6 ? dz / d : Math.random() - 0.5;
        const wa = a.w / (a.w + b.w);
        const wb = b.w / (a.w + b.w);
        a.pos.x -= nx * push * 2 * wa;
        a.pos.z -= nz * push * 2 * wa;
        b.pos.x += nx * push * 2 * wb;
        b.pos.z += nz * push * 2 * wb;
      }
    }
    const map = this.level.map;
    if (!p.dead) p.pos = map.resolveCircle(p.pos, p.radius);
    for (const m of list) m.pos = map.resolveCircle(m.pos, m.radius);
  }

  private updateProjectiles(dt: number) {
    const L = this.level;
    const p = this.player;
    for (const pr of L.projectiles) {
      pr.age += dt;
      pr.life -= dt;
      if (pr.kind === 'chargedbolt') {
        const a = (Math.random() - 0.5) * 6 * dt;
        const c = Math.cos(a);
        const s = Math.sin(a);
        pr.vel = { x: pr.vel.x * c - pr.vel.z * s, z: pr.vel.x * s + pr.vel.z * c };
      }
      pr.pos.x += pr.vel.x * dt;
      pr.pos.z += pr.vel.z * dt;
      if (!L.map.walkableAt(pr.pos.x, pr.pos.z)) {
        this.projectileImpact(pr);
        continue;
      }
      if (pr.faction === 'monster') {
        if (!p.dead && dist(pr.pos, p.pos) < pr.radius + p.radius) {
          if (pr.owner && (pr.owner as Monster).def) monsterStrike(this, pr.owner as Monster, p, { ...pr.dmg });
          else applyDamage(this, p, { ...pr.dmg }, pr.pos);
          this.projectileImpact(pr);
        }
      } else {
        for (const m of L.monsters) {
          if (m.dead || pr.hit.has(m.id)) continue;
          if (dist(pr.pos, m.pos) < pr.radius + m.radius) {
            pr.hit.add(m.id);
            applyDamage(this, m, { ...pr.dmg }, pr.pos);
            if (!pr.pierce) {
              this.projectileImpact(pr);
              break;
            }
          }
        }
      }
      if (pr.life <= 0) pr.dead = true;
    }
    L.projectiles = L.projectiles.filter((x) => !x.dead);
  }

  private projectileImpact(pr: Projectile) {
    pr.dead = true;
    if (pr.splash > 0) {
      const cold = pr.splashKind === 'cold';
      this.fx.burst(cold ? 'ice_shatter' : 'fireblast', pr.pos, { radius: pr.splash });
      this.sfx.play(cold ? 'cold' : 'fire', 0.6);
      const p = this.player;
      if (pr.faction === 'monster' && !p.dead && dist(pr.pos, p.pos) < pr.splash + p.radius && !pr.hit.has(p.id)) {
        applyDamage(this, p, { ...pr.dmg, spell: true }, pr.pos);
      } else if (pr.faction === 'player') {
        // the monster hit head-on already took the full packet
        for (const m of this.level.monsters) {
          if (!m.dead && !pr.hit.has(m.id) && dist(pr.pos, m.pos) < pr.splash + m.radius) applyDamage(this, m, { ...pr.dmg, spell: true }, pr.pos);
        }
      }
    }
  }

  private updateHammers(dt: number) {
    const L = this.level;
    for (const h of L.hammers) {
      h.update(dt);
      for (const m of L.monsters) {
        if (m.dead) continue;
        if (dist(h.pos, m.pos) > 0.55 + m.radius) continue;
        const last = h.lastHit.get(m.id);
        if (last !== undefined && h.t - last < 0.5) continue;
        h.lastHit.set(m.id, h.t);
        applyDamage(this, m, { ...h.dmg }, h.center);
      }
    }
    L.hammers = L.hammers.filter((h) => !h.dead);
  }

  chargedBolts(m: Monster, n: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const pk = emptyPacket();
      pk.light = randInt(1, Math.max(2, Math.floor(m.dmg[1] * 0.8)));
      pk.source = m;
      pk.spell = true;
      const pr = new Projectile('chargedbolt', m.pos, { x: Math.sin(a) * 5, z: Math.cos(a) * 5 }, null, 'monster', pk, 1.6, 0.2);
      this.level.projectiles.push(pr);
    }
    this.sfx.play('lightning', 0.25);
  }

  killMonster(m: Monster, elem: Elem) {
    if (m.dead) return;
    const p = this.player;
    m.dead = true;
    m.life = 0;
    m.deathTime = 0;
    m.killedBy = elem;
    m.setState('dead');
    m.path = null;
    // xp
    let xp = m.xp;
    const diff = p.level - m.level;
    if (diff > 5) xp *= Math.max(0.05, 1 - (diff - 5) * 0.12);
    const gained = p.gainXp(Math.floor(xp));
    if (gained > 0) {
      this.fx.burst('levelup', p.pos);
      this.sfx.play('levelup');
      this.hooks.message(`等级提升！你现在是 ${p.level} 级`, '#ffd24a', 3);
      this.hooks.levelUp();
    }
    const d = p.stats;
    if (d.lifePerKill) p.life = Math.min(d.maxLife, p.life + d.lifePerKill);
    if (d.manaPerKill) p.mana = Math.min(d.maxMana, p.mana + d.manaPerKill);
    // loot
    const drops = rollMonsterDrops(m.level, m.lootQuality(), d.mf, d.gf);
    this.spawnDrops(m.pos, drops);
    // fx
    this.fx.death(m, m.def.blood, elem);
    const snd = m.def.blood === 'bone' ? 'diebone' : m.def.model === 'imp' || m.def.model === 'shaman' ? 'impdie' : 'die';
    this.sfx.play(snd, 0.8);
    if (m.mods.includes('fireench')) {
      const pk = emptyPacket();
      pk.fire = randInt(m.dmg[0], m.dmg[1]) * 1.5;
      pk.spell = true;
      pk.source = m;
      this.level.blasts.push(new DelayedBlast(m.pos, 2.4, 0.45, pk, 'monster', 'fire', m));
      setTimeout(() => {
        this.fx.burst('fireblast', m.pos, { radius: 2.4 });
        this.sfx.play('fire', 0.7);
      }, 400);
    }
    if (m.mods.includes('coldench')) {
      const pk = emptyPacket();
      pk.cold = randInt(m.dmg[0], m.dmg[1]);
      pk.chill = 3;
      pk.spell = true;
      pk.source = m;
      this.level.blasts.push(new DelayedBlast(m.pos, 3.2, 0.1, pk, 'monster', 'frost', m));
      this.fx.burst('frostnova', m.pos, { radius: 3.2 });
      this.sfx.play('cold', 0.7);
    }
    // imps nearby panic
    for (const o of this.level.monsters) {
      if (!o.dead && o.def.flee && o !== m && dist(o.pos, m.pos) < 6 && chance(0.6)) o.fleeTime = rand(1, 2);
    }
    if (m.rank === 'boss') {
      this.fx.shake(0.8);
      this.hooks.message(`${m.displayName} 被击败了！`, '#c8a86a', 4);
      this.save();
    }
  }

  killPlayer() {
    const p = this.player;
    if (p.dead) return;
    p.dead = true;
    p.life = 0;
    p.setState('dead');
    p.intent = null;
    const lost = Math.floor(p.gold * 0.1);
    p.gold -= lost;
    this.sfx.play('death');
    this.fx.death(p, 'red', 'phys');
    this.hooks.playerDied();
  }

  spawnDrops(pos: P2, drops: Drop[]) {
    const map = this.level.map;
    for (const d of drops) {
      let spot: P2 = pos;
      for (let k = 0; k < 10; k++) {
        const a = Math.random() * Math.PI * 2;
        const r = 0.5 + Math.random() * 1.1;
        const c = { x: pos.x + Math.sin(a) * r, z: pos.z + Math.cos(a) * r };
        if (map.walkableAt(c.x, c.z) && map.los(pos, c)) {
          spot = c;
          break;
        }
      }
      if (d.kind === 'gold') {
        this.level.ground.push(new GroundItem(spot, null, d.amount, pos));
      } else {
        this.level.ground.push(new GroundItem(spot, d.item, 0, pos));
        const it = d.item;
        const b = baseOf(it);
        if (it.rarity === 'unique' || it.rarity === 'set') {
          this.sfx.play('dropunique');
          this.fx.burst('unique_drop', spot, { color: it.rarity === 'set' ? '#22d422' : '#c8a86a' });
        } else if (b.type === 'rune') {
          this.sfx.play('droprune');
          this.fx.burst('unique_drop', spot, { color: '#ffa31a' });
        } else this.sfx.play('drop', 0.5);
      }
    }
  }

  dropItem(item: Item) {
    const p = this.player;
    const a = p.facing;
    const spot = { x: p.pos.x + Math.sin(a) * 0.8, z: p.pos.z + Math.cos(a) * 0.8 };
    const ok = this.level.map.walkableAt(spot.x, spot.z) ? spot : { ...p.pos };
    this.level.ground.push(new GroundItem(ok, item, 0, p.pos));
    this.sfx.play('drop', 0.5);
  }

  // ───────────────────────── items & interaction ─────────────────────────

  /** try to put a potion into the belt */
  beltInsert(item: Item): boolean {
    const p = this.player;
    if (baseOf(item).type !== 'potion') return false;
    const rows = p.beltRows();
    for (const col of p.belt) if (col.length > 0 && col.length < rows && col[0].baseId === item.baseId) {
      col.push(item);
      return true;
    }
    for (const col of p.belt) if (col.length === 0) {
      col.push(item);
      return true;
    }
    return false;
  }

  pickupGround(gi: GroundItem) {
    const L = this.level;
    const idx = L.ground.indexOf(gi);
    if (idx < 0) return;
    const p = this.player;
    if (gi.gold > 0) {
      p.gold += gi.gold;
      L.ground.splice(idx, 1);
      this.sfx.play('gold');
      this.fx.text(gi.pos, `${gi.gold} 金币`, '#e8d890');
      this.hooks.inventoryChanged();
      return;
    }
    const item = gi.item!;
    if (this.beltInsert(item) || p.inventory.add(item)) {
      L.ground.splice(idx, 1);
      this.sfx.play('pickup');
      this.hooks.inventoryChanged();
    } else {
      this.hooks.message('背包已满', '#ff6060', 1.5);
      this.sfx.play('nomana');
    }
  }

  drink(item: Item) {
    const p = this.player;
    const b = baseOf(item);
    if (b.heal) {
      p.healQueue.push({ perSec: b.heal / 3, left: 3 });
      this.fx.burst('potion_hp', p.pos);
    }
    if (b.manaHeal) {
      p.manaQueue.push({ perSec: b.manaHeal / 3, left: 3 });
      this.fx.burst('potion_mp', p.pos);
    }
    if (b.rejuv) {
      p.life = Math.min(p.stats.maxLife, p.life + p.stats.maxLife * b.rejuv);
      p.mana = Math.min(p.stats.maxMana, p.mana + p.stats.maxMana * b.rejuv);
      this.fx.burst('potion_hp', p.pos);
      this.fx.burst('potion_mp', p.pos);
    }
    this.sfx.play('potion');
  }

  useBelt(col: number) {
    const p = this.player;
    if (p.dead) return;
    const stack = p.belt[col];
    if (!stack || !stack.length) return;
    const item = stack.shift()!;
    this.drink(item);
    this.hooks.inventoryChanged();
  }

  interact(obj: WorldObject) {
    const p = this.player;
    switch (obj.kind) {
      case 'chest': {
        if (obj.used) return;
        obj.used = true;
        this.sfx.play('chest');
        this.fx.burst('chest', obj.pos);
        const lvl = Math.max(1, this.level.depth * 2);
        const drops = rollMonsterDrops(lvl, 1, p.stats.mf, p.stats.gf);
        drops.push({ kind: 'gold', amount: randInt(lvl * 5, lvl * 15) });
        this.spawnDrops(obj.pos, drops);
        break;
      }
      case 'barrel': {
        if (obj.used) return;
        obj.used = true;
        this.sfx.play('barrel');
        this.fx.burst('barrel', obj.pos);
        if (chance(0.35)) this.spawnDrops(obj.pos, rollMonsterDrops(Math.max(1, this.level.depth * 2 - 1), 0, p.stats.mf, p.stats.gf));
        break;
      }
      case 'stairs':
        this.enterLevel(this.level.depth + 1, 'stairs');
        break;
      case 'waypoint':
        this.hooks.openPanel('waypoint');
        break;
      case 'vendor':
        this.hooks.openPanel('shop');
        break;
      case 'stash':
        this.hooks.openPanel('stash');
        break;
      case 'portal':
        this.sfx.play('portal');
        if (this.level.depth === 0) this.enterLevel(obj.dest, 'portal');
        else this.enterLevel(0, 'portal');
        break;
    }
  }

  openTownPortal() {
    const L = this.level;
    if (L.depth === 0) {
      this.hooks.message('你已经在营地里了', '#aaa', 1.5);
      return;
    }
    L.objects = L.objects.filter((o) => o.kind !== 'portal');
    const p = this.player;
    const a = p.facing;
    let pt = { x: p.pos.x + Math.sin(a) * 1.5, z: p.pos.z + Math.cos(a) * 1.5 };
    if (!L.map.circleClear(pt.x, pt.z, 0.4)) pt = { ...p.pos };
    const portal = new WorldObject('portal', pt, '回城传送门', 0.6);
    portal.dest = 0;
    L.objects.push(portal);
    this.portalLevel = L;
    this.fx.burst('portal', pt);
    this.sfx.play('portal');
  }

  castTownPortal() {
    const p = this.player;
    if (p.dead || !(p.state === 'idle' || p.state === 'move')) return;
    if (this.level.depth === 0) {
      this.hooks.message('你已经在营地里了', '#aaa', 1.5);
      return;
    }
    p.setState('cast', 0.7);
    this.playerAction = { skill: 'townportal', target: null, point: { ...p.pos } };
    p.intent = null;
  }

  travel(depth: number) {
    this.sfx.play('portal');
    this.enterLevel(depth, 'waypoint');
  }
}
