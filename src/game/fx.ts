import type { P2 } from '../core/math';
import type { Blood, Elem } from '../data/monsters';
import type { Actor } from './actor';

export type FxKind =
  | 'holyfire'
  | 'freeze'
  | 'lightning'
  | 'frostnova'
  | 'fireblast'
  | 'levelup'
  | 'potion_hp'
  | 'potion_mp'
  | 'portal'
  | 'block'
  | 'dust'
  | 'charge'
  | 'resurrect'
  | 'holyburst'
  | 'smite'
  | 'swing'
  | 'chest'
  | 'barrel'
  | 'aura_switch'
  | 'shield_buff'
  | 'gold'
  | 'unique_drop';

/** Visual effect sink implemented by the renderer. Sim code only talks to this. */
export interface Fx {
  hit(target: Actor, blood: Blood, dir: P2, heavy: boolean, elem: Elem): void;
  death(target: Actor, blood: Blood, elem: Elem): void;
  burst(kind: FxKind, pos: P2, opts?: { radius?: number; dir?: P2; color?: string; target?: P2 }): void;
  shake(amount: number): void;
  text(pos: P2, text: string, color: string, big?: boolean): void;
}

export const nullFx: Fx = {
  hit() {},
  death() {},
  burst() {},
  shake() {},
  text() {},
};
