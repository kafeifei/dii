import './data/legendary';
import { Sfx } from './audio/sfx';
import { Input } from './core/input';
import { Game } from './game/game';
import { claimHero, useDevSlot, wasInGame } from './game/save';
import { assets } from './render/assets';
import { Renderer } from './render/renderer';
import { loadSettings } from './ui/settings';
import { UI } from './ui/ui';

const DEV = location.search.includes('dev');
// ?dev&slot=1: a dev hero of its own, for two tabs with two heroes
if (DEV) useDevSlot(Number(new URLSearchParams(location.search).get('slot')) || 0);
// a reload, or a duplicated tab, goes back to the hero it had: claimed now, while the models load, so a
// tab still playing it writes it a last time before it is read here (save.ts claimHero)
else if (wasInGame()) claimHero();

const canvas = document.getElementById('world') as HTMLCanvasElement;
const sfx = new Sfx();
const input = new Input(canvas, () => sfx.ensure());
const game = new Game(input, sfx);
const settings = loadSettings();
const renderer = new Renderer(canvas, document.getElementById('float')!, game, settings.antialias);
const ui = new UI(game, renderer, sfx, settings);
game.fx = renderer.fx;
game.picker = renderer;
game.hooks = ui;

const STEP = 1 / 60;
let acc = 0;
let last = performance.now();

let lastRaf = 0;
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  let steps = 0;
  if (game.started && !game.paused && !game.headless) {
    acc += dt;
    while (acc >= STEP && steps < 6) {
      game.update(STEP);
      acc -= STEP;
      steps++;
      // input edges are consumed by the first sim step only
      input.lmbPressed = false;
      input.rmbPressed = false;
      input.pressed.clear();
      input.touchPressed.clear();
      input.touchAimed = null;
      input.touchInteract = false;
    }
    // draw between the last two sim steps so motion stays smooth at any refresh rate
    renderer.render(dt, Math.min(1, acc / STEP));
  }
  ui.update(dt);
  input.wheel = 0;
  if (steps > 0 || !game.started || game.paused) input.endFrame();
}
function raf(now: number) {
  lastRaf = performance.now();
  frame(now);
  requestAnimationFrame(raf);
}
requestAnimationFrame(raf);
// dev: keep simulating when the page is hidden (rAF pauses), useful for automated testing
if (DEV) {
  setInterval(() => {
    if (performance.now() - lastRaf > 100) frame(performance.now());
  }, 16);
}

// save whenever the page may go away (beforeunload alone is unreliable in embedded browsers)
window.addEventListener('beforeunload', () => game.save());
window.addEventListener('pagehide', () => game.save());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') game.save();
});

assets
  .load((done, total) => ui.loadProgress(done, total))
  .then(() => {
    ui.loadProgress(1, 1);
    if (DEV) {
      ui.devStart();
      // ?dev&lvl=3: start on that floor of the trial ground (for testing on devices without a console)
      const q = new URLSearchParams(location.search);
      const lvl = Number(q.get('lvl'));
      if (lvl > 0) game.enterTrial(lvl);
      // ?dev&tod=0.5: hold the time of day there (0 midnight, 0.25 dawn, 0.5 noon, 0.75 dusk)
      if (q.has('tod')) {
        game.clock = Number(q.get('tod')) || 0;
        game.clockRate = 0;
      }
    }
    // a reload mid-run goes straight back into the game
    else if (wasInGame()) ui.resume();
  });

// debug handle
(window as unknown as { game: Game }).game = game;
(window as unknown as { renderer: Renderer }).renderer = renderer;
