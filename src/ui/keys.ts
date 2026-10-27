import { bindName, SLOT_KEYS } from './common';
import { saveSettings } from './settings';
import type { UI } from './ui';

// The HUD's panel buttons and the keyboard.

/** a HUD button clicked, or its key pressed */
export function pressButton(ui: UI, k: string) {
  ui.sfx.play('click');
  switch (k) {
    case 'char':
      ui.left = ui.left === 'char' ? null : 'char';
      break;
    case 'inv':
      ui.right = ui.right === 'inv' ? null : 'inv';
      break;
    case 'skills':
      ui.right = ui.right === 'skills' ? null : 'skills';
      break;
    case 'portal':
      ui.game.castTownPortal();
      break;
    case 'map':
      ui.automap.isOpen = !ui.automap.isOpen;
      break;
    case 'menu':
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
  // the ` key by where it sits, so a Chinese input method (which turns it into ·) doesn't hide it
  if (ui.debugPanel?.isOpen && (e.key === 'Escape' || e.code === 'Backquote')) {
    ui.debugPanel.close();
    return;
  }
  if (!ui.game.started) return;
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === 'INPUT') return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (e.code === 'Backquote' && ui.debugPanel && !ui.game.player.dead) {
    ui.openDebug();
    return;
  }
  if (k === 'Escape') {
    if (ui.picker.isOpen) {
      ui.picker.close();
    } else if (ui.left || ui.right || ui.automap.isOpen) {
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
