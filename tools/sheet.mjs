// Model contact sheet for tools/play.mjs: every monster (plus player/vendor) close-up in a few states.
// IDS=zombie1,bloodraven STATES=idle,attack,death SHEET=out.png node tools/play.mjs tools/sheet.mjs --url http://localhost:PORT/?dev
// Ids are D2's monsters (D2X_MONSTERS, drawn by their looks: src/data/monsters.ts). An id that isn't
// one with a look is taken as a body (MonsterModel) on a zombie1's stats, and
// `<id>@<n>` draws it as actor n (bodies that vary what they carry roll it by actor id). States
// besides idle / move / attack / death: cast, hit; `<state>@<f>` stops a timed state at fraction f
// of a 4 s run (a death at f seconds). ZOOM=2.5 looks closer (default 4.5; under 3 the hero is
// hidden), CELL=400 takes bigger cells (default 260 px), FACING turns the bodies (radians, default
// π/4: toward the camera).
export default async function (page, shot, log) {
  const zoom = +(process.env.ZOOM || 4.5);
  const cell = +(process.env.CELL || 260);
  const ids = (
    process.env.IDS ||
    'zombie1,fallen1,fallenshaman1,quillrat1,brute1,corruptrogue1,cr_lancer1,cr_archer1,skeleton1,sk_archer1,skmage_fire1,wraith1,arach1,goatman1,bighead1,foulcrow1,vampire5,fetish1,smith,bloodraven,andariel,player,vendor'
  ).split(',');
  const states = (process.env.STATES || 'idle,attack,move').split(',');
  await page.evaluate(async ([zoom, facing]) => {
    game.enterLevel(1, 'stairs');
    window.__Ctor = game.level.monsters[0].constructor;
    game.enterLevel(0, 'stairs');
    window.__def = (await import('/src/data/monsters.ts')).monsterDef;
    game.level.monsters.length = 0;
    // the shots are taken in the camp, whose tiles the sim keeps monsters off (Level.monsterMap)
    game.level.monsterMap = game.level.map;
    // townsfolk would stand in the shot
    for (const n of renderer.npcViews ?? []) n.rig.root.visible = false;
    renderer.zoomTarget = zoom; renderer.zoom = zoom; renderer.updateFrustum();
    // where the body stands from the hero (behind them on screen); close up, beside them with the
    // hero hidden, where the view still has room (not on the same spot: the sim pushes bodies apart)
    window.__off = zoom < 3 ? { x: 0.6, z: -0.6 } : { x: -2.2, z: -2.2 };
    window.__spec = (await import('/src/render/specs.ts')).monsterSpec;
    if (zoom < 3) for (const o of renderer.playerView?.rig.root.children ?? []) o.visible = false;
    window.__facing = facing;
  }, [zoom, +(process.env.FACING || Math.PI / 4)]);
  // the area's name fades from the screen
  await page.waitForTimeout(3500);
  const cells = [];
  for (const id of ids) {
    for (const st of states) {
      const r = await page.evaluate(({ id, st }) => {
        const lvl = game.level, p = game.player;
        clearInterval(window.__freeze);
        // a new list: the renderer and the monster grid only look again when the list changes
        lvl.monsters = [];
        const vendor = lvl.objects.find((o) => o.kind === 'vendor');
        let target;
        if (id === 'player') target = p;
        else if (id === 'vendor') { p.pos = { x: vendor.pos.x + 2, z: vendor.pos.z + 2 }; return { x: 0, y: 0, vendor: true }; }
        else {
          const pos = { x: p.pos.x + window.__off.x, z: p.pos.z + window.__off.z };
          const [key, actor] = id.split('@');
          const def = window.__def(key);
          target = new window.__Ctor(def ?? { ...window.__def('zombie1'), id: key, model: key, scale: 1, attack: [], cast: undefined }, def ? def.row.diff[0].level : 5, 'normal', pos);
          if (actor) target.id = +actor;
          // held still as the gallery holds its row (level.ts): the AI leaves its state alone
          target.stunTime = 1e9;
          lvl.monsters.push(target);
        }
        const [state, at] = st.split('@');
        const t0 = performance.now();
        window.__freeze = setInterval(() => {
          const m = target;
          if (m !== p) { m.awake = false; m.pos = { x: p.pos.x + window.__off.x, z: p.pos.z + window.__off.z }; }
          m.facing = window.__facing;
          const run = (performance.now() - t0) / 1000;
          m.state = state === 'death' ? 'idle' : state;
          if (at) { m.stateDur = 4; m.stateTime = Math.min(+at * 4, run); }
          else { m.stateDur = 0.8; m.stateTime = (m.stateTime + 0.016) % 0.8; }
          if (state === 'death') { m.dead = true; m.state = 'dead'; m.deathTime = at ? Math.min(+at, run) : m.deathTime + 0.016; }
          if (m === p) { p.intent = null; }
        }, 16);
        return null;
      }, { id, st });
      const at = st.split('@')[1];
      await page.waitForTimeout(at ? (st.startsWith('death') ? +at : +at * 4) * 1000 + 40 : st === 'attack' ? 420 : 900);
      const pt = await page.evaluate((id) => {
        const p = game.player;
        const t = id === 'player' ? p.pos : id === 'vendor' ? game.level.objects.find((o) => o.kind === 'vendor').pos : { x: p.pos.x + window.__off.x, z: p.pos.z + window.__off.z };
        // the middle of the body (models.ts draws it at 0.9 of its spec height), or of one 1.6 high
        const m = game.level.monsters[0];
        const h = id === 'player' || id === 'vendor' || !m ? 1.6 : window.__spec(m).height * 0.9;
        return renderer.projectP(t, h / 2);
      }, id);
      const buf = await page.screenshot({ clip: { x: Math.max(0, pt.x - cell / 2), y: Math.max(0, pt.y - cell / 2), width: cell, height: cell } });
      cells.push({ label: `${id} · ${st}`, src: 'data:image/png;base64,' + buf.toString('base64') });
    }
  }
  const html = `<body style="margin:0;background:#111;font:12px sans-serif;color:#ddd;display:grid;grid-template-columns:repeat(${states.length * 2},${cell}px);gap:2px">${cells.map((c) => `<div><img src="${c.src}" width=${cell} height=${cell} style="display:block"><div style="padding:2px">${c.label}</div></div>`).join('')}</body>`;
  const sheet = await page.context().browser().newPage();
  await sheet.setViewportSize({ width: states.length * 2 * (cell + 2), height: Math.ceil(cells.length / (states.length * 2)) * (cell + 20) });
  await sheet.setContent(html);
  await sheet.screenshot({ path: process.env.SHEET || 'sheet.png', fullPage: true });
  log('sheet saved');
}
