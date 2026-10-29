import { D2X_AREAS } from '../data/d2x/areas';
import { D2X_MONSTERS } from '../data/d2x/monsters';
import { D2X_SUPERUNIQUES } from '../data/d2x/superuniques';
import { lookedMonsters, monsterDef } from '../data/monsters';
import type { Difficulty } from '../items/d2/types';
import type { Level } from '../game/level';
import type { Monster } from '../game/monster';
import type { WorldObject } from '../game/objects';
import type { Player } from '../game/player';
import { CAMP_AREA, areaDef, areaList, routeTo, trialFloor } from '../world/areas';
import { presetMonstersOf } from '../world/overworld';
import type { ModelKey } from './assets';
import { DEV_MODELS } from './dev-models';
import { MODEL_PACKS } from './model-list';
import type { ModelSpec } from './models';
import { decorModels, groundModels, MODELS } from './props';
import { monsterSpec, npcSpec, playerSpec, vendorSpec } from './specs';

/**
 * Which models what the game shows is made of, so they are asked for before it's built: what the
 * title waits for (CORE), a level's (levelNeeds: its essentials, the area the hero arrives in, and
 * the rest of it), where the hero can go from there (areaNeeds), and the order the rest streams in
 * (streamOrder). The builders (props.ts, specs.ts, Renderer) note what they miss as they go
 * (assets.watch) and swap it in when it comes, so a model left out here only comes later.
 */

const pack = (name: string) => (MODEL_PACKS[name] ?? []) as readonly ModelKey[];

/**
 * What the title waits for before a game can start: both heroes and all they can hold (the weapons
 * pack), what drops (the drops pack), and the camp with its people (its own pack, and the graveyard
 * and nature packs its graves and trees are from). A dev hero (dev-models.ts) when its switch is on.
 */
export const CORE: readonly string[] = [
  ...pack('camp'),
  ...pack('graveyard'),
  ...pack('nature'),
  ...pack('weapons'),
  ...pack('drops'),
  'paladin',
  'sorceress',
  'npc_vendor',
  'npc_mercenary',
  'npc_rogue',
  'npc_warden',
  ...Object.keys(DEV_MODELS),
];

/** the models a character is made of: its body and what it carries that is a model (a staff or a bow built in code asks for its own as it's built) */
export function specNeeds(spec: ModelSpec): ModelKey[] {
  const out: ModelKey[] = [spec.model];
  for (const a of spec.attach ?? []) if (typeof a.model === 'string') out.push(a.model);
  return out;
}

/**
 * The models a maze's objects are drawn with (objviews.ts), the closest the packs have, each at the size
 * the furnishings use it (src/world/furnish.ts): a casket the dungeon pack's coffin, the grave among the
 * caskets the graveyard's grave and its broken one once opened, a well the camp's well. A rogue's corpse
 * has none: drawn in code.
 */
export const OBJECT_MODELS = {
  casket: 'h_coffin',
  grave: 'h_grave_A',
  graveOpened: 'h_grave_A_destroyed',
  well: 'x_well',
} as const satisfies Record<string, ModelKey>;

/** what an object's view is made of (Renderer.makeObjectView); the way down from under the sky has braziers */
export function objectNeeds(o: Pick<WorldObject, 'kind' | 'corpse' | 'hole'>, outdoor: boolean): ModelKey[] {
  switch (o.kind) {
    case 'chest':
    case 'stash':
      return [MODELS.chest];
    case 'barrel':
      return [MODELS.barrel];
    case 'stairs':
      return outdoor ? [MODELS.entrance, MODELS.brazier] : [MODELS.entrance];
    case 'waypoint':
      return [MODELS.waypoint];
    case 'shrine':
      return [MODELS.shrine];
    case 'obelisk':
      return [MODELS.obelisk];
    case 'vendor':
      return specNeeds(vendorSpec());
    case 'corpse':
      return o.corpse ? specNeeds(playerSpec({ cls: o.corpse.cls, equipment: o.corpse.equipment } as Player)) : [];
    // a maze's caskets and their graves, and wells (OBJECT_MODELS); a rogue's corpse is drawn in code
    case 'casket':
      return o.hole ? [OBJECT_MODELS.grave, OBJECT_MODELS.graveOpened] : [OBJECT_MODELS.casket];
    case 'well':
      return [OBJECT_MODELS.well];
    case 'remains':
      return [];
  }
  return [];
}

/**
 * The models a level's views are made of (Renderer.buildLevel): its props, wall hangings, houses,
 * pillars, torches and decor, its people and objects, its monsters and what lies on its ground; with
 * `area`, only what stands in that area of it
 */
export function levelNeeds(level: Level, area?: number): Set<string> {
  const L = level.layout;
  const out = new Set<string>();
  const add = (keys: Iterable<string>) => {
    for (const k of keys) out.add(k);
  };
  const at = (x: number, z: number) => area === undefined || level.areaAt(x, z).id === area;
  for (const p of L.props) if (at(p.x, p.z)) out.add(p.model);
  for (const w of L.wallDecor) if (at(w.x, w.z)) out.add(w.model);
  for (const h of L.houses ?? []) if (h.model && at(h.x + h.w / 2, h.y + h.h / 2)) out.add(h.model);
  if (L.pillars.size && (area === undefined || [...L.pillars].some((i) => level.areas[i] === area))) out.add(MODELS.pillar);
  if (L.torches.some((t) => at(t.x, t.z))) out.add(MODELS.torch);
  for (const d of L.decor) if (at(d.x, d.z)) add(decorModels(d.kind));
  for (const n of L.npcs ?? []) if (at(n.x, n.z)) add(specNeeds(npcSpec(n.model)));
  const outdoor = !!L.theme.outdoor;
  for (const o of level.objects) if (at(o.pos.x, o.pos.z)) add(objectNeeds(o, outdoor));
  for (const m of level.monsters) if (at(m.pos.x, m.pos.z)) add(specNeeds(monsterSpec(m)));
  for (const g of level.ground) if (at(g.pos.x, g.pos.z)) add(groundModels(g.item));
  return out;
}

/**
 * The monsters an area of Diablo II's can bring this difficulty (src/game/spawn.ts): its levels.txt
 * kinds, its superuniques, what its presets set down besides (the Burial Grounds' Blood Raven:
 * overworld.ts presetMonstersOf) and the minions of any; a trial floor any Act 1 monster with a look
 */
function areaMonsters(id: number, difficulty: Difficulty): string[] {
  if (trialFloor(id) !== undefined) return lookedMonsters().filter((d) => d.row.spawns && !d.boss && d.row.align === 0).map((d) => d.id);
  // a rift's floor: the area it replays (src/world/rift.ts)
  const src = areaDef(id)?.rift?.source ?? id;
  const row = D2X_AREAS.find((a) => a.id === src);
  if (!row) return [];
  const ids = new Set([...(difficulty ? row.nmon : row.mon), ...row.umon]);
  const guardian = areaDef(id)?.rift?.guardian;
  if (guardian) ids.add(guardian);
  for (const key of row.superuniques ?? []) {
    const su = D2X_SUPERUNIQUES.find((s) => s.key === key);
    if (su) ids.add(su.mon);
  }
  for (const m of presetMonstersOf(src)) ids.add(m);
  for (const id of [...ids]) for (const m of D2X_MONSTERS[id]?.minions ?? []) ids.add(m);
  return [...ids];
}

/** the monster ids areaNeeds draws each kind with: specs.ts picks by id mod 3 and mod 4 (a rogue's gear by a hash of it, all in the core's weapons) */
const SPEC_IDS = 12;

/**
 * What area `id` would need before its map is made (prefetching where the hero can go next): the
 * packs its kind of map is furnished from past the camp's, and the bodies of the monsters it can bring,
 * each as any of them may be drawn (specs.ts: a champion's or unique's, and every third skeleton, the
 * elite's body; what one carries by its id)
 */
export function areaNeeds(id: number, difficulty: Difficulty = 0): Set<string> {
  const out = new Set<string>();
  const a = areaDef(id);
  if (!a || a.kind === 'town') return out;
  for (const k of pack('wild')) out.add(k);
  if (a.kind === 'dungeon') for (const k of pack('dungeon')) out.add(k);
  for (const mid of areaMonsters(id, difficulty)) {
    const def = monsterDef(mid);
    if (!def) continue;
    for (const rank of ['normal', 'champion'] as const) for (let k = 0; k < SPEC_IDS; k++) for (const key of specNeeds(monsterSpec({ def, rank, id: k } as Monster))) out.add(key);
  }
  return out;
}

/**
 * The order the rest streams in after the title's (assets.stream): the overworld's areas past the
 * camp, then the dungeons, each the nearer the camp the sooner (the steps there on the connection
 * graph, areas.ts routeTo; the lower Id where they tie)
 */
export function streamOrder(): string[] {
  const steps = (id: number) => routeTo(CAMP_AREA, id)?.length ?? Infinity;
  const areas = areaList()
    .filter((a) => a.kind !== 'town')
    .sort((a, b) => steps(a.id) - steps(b.id) || a.id - b.id);
  return [...areas.filter((a) => a.kind === 'outdoor'), ...areas.filter((a) => a.kind === 'dungeon')].flatMap((a) => [...areaNeeds(a.id)]);
}
