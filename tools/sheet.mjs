// Model contact sheet for tools/play.mjs: every monster (plus player/vendor) close-up in a few states.
// IDS=zombie,lich STATES=idle,attack,death SHEET=out.png node tools/play.mjs tools/sheet.mjs --url http://localhost:PORT/?dev
export default async function (page, shot, log) {
  const ids = (process.env.IDS || 'zombie,skeleton,skelarcher,imp,shaman,ghoul,spider,wraith,demon,hellimp,butcher,lich,overlord,player,vendor').split(',');
  const states = (process.env.STATES || 'idle,attack,move').split(',');
  await page.evaluate(async () => {
    game.enterLevel(1, 'stairs');
    window.__Ctor = game.level.monsters[0].constructor;
    game.enterLevel(0, 'stairs');
    window.__M = (await import('/src/data/monsters.ts')).MONSTERS;
    game.level.monsters.length = 0;
    renderer.zoomTarget = 4.5; renderer.zoom = 4.5; renderer.updateFrustum();
  });
  const cells = [];
  for (const id of ids) {
    for (const st of states) {
      const r = await page.evaluate(({ id, st }) => {
        const lvl = game.level, p = game.player;
        clearInterval(window.__freeze);
        lvl.monsters.length = 0;
        const vendor = lvl.objects.find((o) => o.kind === 'vendor');
        let target;
        if (id === 'player') target = p;
        else if (id === 'vendor') { p.pos = { x: vendor.pos.x + 2, z: vendor.pos.z + 2 }; return { x: 0, y: 0, vendor: true }; }
        else {
          const pos = { x: p.pos.x - 2.2, z: p.pos.z - 2.2 };
          target = new window.__Ctor(window.__M[id], 5, 'normal', pos);
          lvl.monsters.push(target);
        }
        window.__freeze = setInterval(() => {
          const m = target;
          if (m !== p) { m.awake = false; m.pos = { x: p.pos.x - 2.2, z: p.pos.z - 2.2 }; }
          m.facing = Math.PI / 4;
          m.state = st === 'death' ? 'idle' : st; m.stateDur = 0.8; m.stateTime = (m.stateTime + 0.016) % 0.8;
          if (st === 'death') { m.dead = true; m.state = 'dead'; m.deathTime += 0.016; }
          if (m === p) { p.intent = null; }
        }, 16);
        return null;
      }, { id, st });
      await page.waitForTimeout(st === 'attack' ? 420 : 900);
      const pt = await page.evaluate((id) => {
        const p = game.player;
        const t = id === 'player' ? p.pos : id === 'vendor' ? game.level.objects.find((o) => o.kind === 'vendor').pos : { x: p.pos.x - 2.2, z: p.pos.z - 2.2 };
        return renderer.projectP(t, 1.0);
      }, id);
      const buf = await page.screenshot({ clip: { x: Math.max(0, pt.x - 130), y: Math.max(0, pt.y - 150), width: 260, height: 260 } });
      cells.push({ label: `${id} · ${st}`, src: 'data:image/png;base64,' + buf.toString('base64') });
    }
  }
  const html = `<body style="margin:0;background:#111;font:12px sans-serif;color:#ddd;display:grid;grid-template-columns:repeat(${states.length * 2},260px);gap:2px">${cells.map((c) => `<div><img src="${c.src}" width=260 height=260 style="display:block"><div style="padding:2px">${c.label}</div></div>`).join('')}</body>`;
  const sheet = await page.context().browser().newPage();
  await sheet.setViewportSize({ width: states.length * 2 * 262, height: Math.ceil(cells.length / (states.length * 2)) * 280 });
  await sheet.setContent(html);
  await sheet.screenshot({ path: process.env.SHEET || 'sheet.png', fullPage: true });
  log('sheet saved');
}
