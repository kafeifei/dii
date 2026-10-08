import './data/legendary';
import { Sfx } from './audio/sfx';
import { Input } from './core/input';
import { Game } from './game/game';
import { Renderer } from './render/renderer';
import { UI } from './ui/ui';

const canvas = document.getElementById('world') as HTMLCanvasElement;
const sfx = new Sfx();
const input = new Input(canvas, () => sfx.ensure());
const game = new Game(input, sfx);
const renderer = new Renderer(canvas, document.getElementById('float')!, game);
const ui = new UI(game, renderer, sfx);
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
  if (game.started && !game.paused) {
    acc += dt;
    while (acc >= STEP && steps < 6) {
      game.update(STEP);
      acc -= STEP;
      steps++;
      // input edges are consumed by the first sim step only
      input.lmbPressed = false;
      input.rmbPressed = false;
      input.pressed.clear();
    }
    renderer.render(dt);
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
if (location.search.includes('dev')) {
  setInterval(() => {
    if (performance.now() - lastRaf > 100) frame(performance.now());
  }, 16);
}

window.addEventListener('beforeunload', () => game.save());

if (location.search.includes('dev')) ui.devStart();

// debug handle
(window as unknown as { game: Game }).game = game;
