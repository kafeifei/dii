// The browser globals the game's modules touch when they load (and a little after), for running
// them under Node in tools/test/run.mjs. Only what game code needs without a page: storage, the
// URL, a document with nothing in it. There is no AudioContext, so Sfx never starts and stays
// silent; there is no WebGL, so nothing under src/render or src/ui is meant to load here.

/** an in-memory Web Storage: localStorage and sessionStorage start empty on every run */
class MemoryStorage {
  #data = new Map();
  get length() {
    return this.#data.size;
  }
  key(i) {
    return [...this.#data.keys()][i] ?? null;
  }
  getItem(k) {
    return this.#data.has(String(k)) ? this.#data.get(String(k)) : null;
  }
  setItem(k, v) {
    this.#data.set(String(k), String(v));
  }
  removeItem(k) {
    this.#data.delete(String(k));
  }
  clear() {
    this.#data.clear();
  }
}

const noop = () => {};

/** an element that takes whatever is done to it and draws nothing */
function stubElement(tag = 'div') {
  return {
    tagName: String(tag).toUpperCase(),
    style: {},
    dataset: {},
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    children: [],
    appendChild(c) {
      return c;
    },
    append: noop,
    remove: noop,
    addEventListener: noop,
    removeEventListener: noop,
    setAttribute: noop,
    querySelector: () => null,
    querySelectorAll: () => [],
    getContext: () => null,
    getBoundingClientRect: () => ({ x: 0, y: 0, left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }),
  };
}

const define = (name, value) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true, enumerable: true });

define('window', globalThis);
// ?dev and friends are read from here; tests can swap it (location = new URL('http://localhost/?dev'))
define('location', new URL('http://localhost/'));
define('localStorage', new MemoryStorage());
define('sessionStorage', new MemoryStorage());
// Node's own navigator says "Node.js/22" and lacks what a browser has
define('navigator', { userAgent: 'node', language: 'zh-CN', languages: ['zh-CN'], maxTouchPoints: 0, hardwareConcurrency: 4 });
define('matchMedia', () => ({ matches: false, media: '', addEventListener: noop, removeEventListener: noop }));
define('document', {
  body: stubElement('body'),
  documentElement: stubElement('html'),
  visibilityState: 'visible',
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: stubElement,
  addEventListener: noop,
  removeEventListener: noop,
});
define('addEventListener', noop);
define('removeEventListener', noop);
define('requestAnimationFrame', (cb) => setTimeout(() => cb(performance.now()), 16));
define('cancelAnimationFrame', (id) => clearTimeout(id));
delete globalThis.AudioContext;
delete globalThis.webkitAudioContext;
