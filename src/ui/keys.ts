import { bindName, SLOT_KEYS } from './common';
import { answerTrade, tradeAsked } from './inventory';
import { openQuestLog } from './questlog';
import { saveSettings } from './settings';
import type { UI } from './ui';

// The HUD's panel buttons and the keyboard.

/** a HUD button clicked, or its key pressed: a panel opens or closes with its own sound, the rest click */
export function pressButton(ui: UI, k: string) {
  switch (k) {
    case 'char':
      ui.left = ui.left === 'char' ? null : 'char';
      ui.sfx.play(ui.left ? 'ui.open' : 'ui.close');
      break;
    case 'inv':
      ui.right = ui.right === 'inv' ? null : 'inv';
      ui.sfx.play(ui.right ? 'ui.open' : 'ui.close');
      break;
    case 'skills':
      ui.right = ui.right === 'skills' ? null : 'skills';
      ui.sfx.play(ui.right ? 'ui.open' : 'ui.close');
      break;
    case 'quests':
      ui.left = ui.left === 'quests' ? null : 'quests';
      if (ui.left) openQuestLog(ui);
      ui.sfx.play(ui.left ? 'ui.open' : 'ui.close');
      break;
    case 'portal':
      ui.sfx.play('ui.click');
      ui.game.castTownPortal();
      break;
    case 'map':
      ui.sfx.play('ui.click');
      ui.automap.isOpen = !ui.automap.isOpen;
      break;
    case 'menu':
      ui.sfx.play('ui.click');
      ui.menu.toggle();
      break;
  }
  ui.dirty = true;
}

export function onKey(ui: UI, e: KeyboardEvent) {
  // settings sit over the title or the pause menu: Esc goes back to whichever
  if (e.key === 'Escape' && ui.settingsPanel.isOpen) {
    ui.settingsPanel.close();
    return;
  }
  if (!ui.game.started) return;
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === 'INPUT') return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  // the debug panel opened or folded, the game playing on: the ` key by where it sits, so a Chinese
  // input method (which turns it into ·) doesn't hide it
  if (e.code === 'Backquote' && ui.debugPanel) {
    ui.debugPanel.toggle();
    return;
  }
  // a townsperson's line is cut short, then their menu left (D2: Esc)
  if (ui.npc.isOpen && (k === 'Escape' || (k === ' ' && ui.npc.talking))) {
    e.preventDefault();
    if (ui.npc.talking) ui.npc.skip();
    else ui.npc.close();
    return;
  }
  // the merchant's question: Enter says yes, Esc no (D2R's purchase box takes Enter)
  if ((k === 'Escape' || k === 'Enter') && tradeAsked(ui)) {
    e.preventDefault();
    answerTrade(ui, k === 'Enter');
    return;
  }
  if (k === 'Escape') {
    if (ui.picker.isOpen) {
      ui.picker.close();
    } else if (ui.left || ui.right || ui.automap.isOpen) {
      if (ui.left || ui.right) ui.sfx.play('ui.close');
      ui.left = null;
      ui.right = null;
      ui.automap.isOpen = false;
      ui.dirty = true;
    } else ui.menu.toggle();
    return;
  }
  if (ui.game.paused) return;
  // bind hovered skill to a hotkey
  const hoverSkill = ui.tooltip.hoverSkill;
  if (hoverSkill && ['q', 'w', 'e', 'r'].includes(k)) {
    const idx = 2 + ['q', 'w', 'e', 'r'].indexOf(k);
    ui.game.player.binds[idx] = hoverSkill;
    ui.message(`${bindName(hoverSkill)} → ${SLOT_KEYS[idx]}`, '#c8a86a', 1.2);
    ui.dirty = true;
    return;
  }
  switch (k) {
    case 'i':
    case 'b':
      pressButton(ui, 'inv');
      break;
    case 'c':
      pressButton(ui, 'char');
      break;
    case 't':
    case 's':
      pressButton(ui, 'skills');
      break;
    case 'p':
      pressButton(ui, 'portal');
      break;
    // the quest log: D2's key for it is Q, here one of the skill keys (Q, W, E, R)
    case 'l':
      pressButton(ui, 'quests');
      break;
    case 'Tab':
      e.preventDefault();
      pressButton(ui, 'map');
      break;
    case 'm':
      ui.sfx.toggleMute();
      ui.settings.muted = ui.sfx.muted;
      saveSettings(ui.settings);
      ui.settingsPanel.refresh();
      ui.message(ui.sfx.muted ? '声音：关' : '声音：开', '#aaa', 1);
      break;
  }
}
