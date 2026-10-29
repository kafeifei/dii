import './data/legendary';
import { Sfx } from './audio/sfx';
import { Input } from './core/input';
import { Game } from './game/game';
import { GALLERY } from './game/level';
import { claimHero, heartbeat, markInGame, playedElsewhere, releaseHero, slotNow, useDevSlot, wasInGame } from './game/save';
import { assets, NOW } from './render/assets';
import { CORE, streamOrder } from './render/needs';
import { Renderer } from './render/renderer';
import { loadSettings } from './ui/settings';
import { UI } from './ui/ui';

const DEV = location.search.includes('dev');
// ?dev&slot=1: a dev hero of its own, for two tabs with two heroes
if (DEV) useDevSlot(Number(new URLSearchParams(location.search).get('slot')) || 0);
// A reload of this tab goes back to the hero it had: claimed now, while the models load (save.ts
// claimHero). A copy of this tab (duplicated, or opened from it) carries the in-game mark along in its
// sessionStorage, but must not take the hero from the tab still playing it: it starts at the title
const nav = (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type;
const resuming = !DEV && wasInGame() && (nav === 'reload' || nav === 'back_forward') && !playedElsewhere(slotNow());
if (resuming) claimHero();
else if (!DEV && wasInGame()) markInGame(false);

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
  // the world waits behind a level's loading veil (Renderer.veiled): nothing steps, nothing piles up for after
  const held = renderer.veiled;
  // a game in play says its hero is still this tab's on every frame the page runs, paused in the menu
  // or held behind a veil as much as playing: either can outlast save.ts's GONE_MS, and a tab silent
  // that long counts as gone, its hero read elsewhere without waiting for its last save (save.ts heartbeat)
  if (game.started) heartbeat();
  if (game.started && !game.paused && !game.headless) {
    acc = held ? 0 : acc + dt;
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
  if (steps > 0 || !game.started || game.paused || held) input.endFrame();
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
window.addEventListener('pagehide', () => {
  game.save();
  // gone for good, or into the back-forward cache: let the hero go either way (pageshow takes it back)
  releaseHero();
});
// back from the back-forward cache: the hero again this tab's, unless another tab has opened it since
window.addEventListener('pageshow', (e) => {
  if (!e.persisted || !game.started) return;
  if (playedElsewhere(slotNow())) game.heroClaimed();
  else claimHero();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') game.save();
});

// The title lets a game start once the core models are in (the heroes, what they hold and drop, the
// camp); the rest streams in behind, each level asking for its own first as it's built
// (Renderer.buildLevel). ?gallery's showroom has every model there is: it waits for them all
(GALLERY ? assets.ensureAll(NOW, (done, total) => ui.loadProgress(done, total)) : assets.ensure(CORE, NOW, (done, total) => ui.loadProgress(done, total)))
  .then(() => {
    ui.loadProgress(1, 1);
    assets.stream(streamOrder());
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
    else if (resuming) ui.resume();
  });

// debug handles (the tools wait on assets.ensureAll)
(window as unknown as { game: Game }).game = game;
(window as unknown as { renderer: Renderer }).renderer = renderer;
(window as unknown as { assets: typeof assets }).assets = assets;
