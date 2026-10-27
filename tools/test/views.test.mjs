// The renderer's work kept to what the views reach (src/render/chunks.ts, src/render/views.ts),
// checked against brute force with the game's own camera and sun: boxes and spheres against the
// view, shadows that can fall in it (a ray marched down to the ground), the props culled instance
// by instance into the view's and the shadow maps' meshes, scenery chunks in the scene only where a
// view reaches and never flapping at the edge, and views of things near the hero made inside 30 m,
// let go past 40 (or a further reach) and not made and freed over and over in between; rigs put by
// and taken again, the look least lately used making room; each kind of shadow caster its own
// depth materials; a let-go view's own geometry and materials disposed, the shared ones kept; a
// view tinted (the stash, a looted chest) tints copies of the shared ones, however often it is made.
export default async (load) => {
  const THREE = await load('three');
  const { CHUNK, IN, OUT, PART, PropBatches, Scenery, boxInFrustum, boxInSphere, ownDepth, shadowInView, sphereInFrustum, sphereInShadows } = await load('/src/render/chunks.ts');
  const { NearViews, Pool, VIEW_FAR, VIEW_NEAR, disposeView, tintOwn } = await load('/src/render/views.ts');
  const { RNG } = await load('/src/core/math.ts');
  const problems = [];
  const check = (ok, what) => ok || problems.push(what);
  const rng = new RNG(11);
  const rand = (a, b) => a + rng.next() * (b - a);

  // the game's camera (src/render/renderer.ts: yaw 45°, pitch 0.68, 40 m off, zoom 7.2) and its sun
  const camera = new THREE.OrthographicCamera(-7.2 * 1.6, 7.2 * 1.6, 7.2, -7.2, 0.1, 200);
  const sun = new THREE.DirectionalLight();
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 60 });
  sun.shadow.camera.updateProjectionMatrix();
  const lamp = new THREE.Sphere(new THREE.Vector3(), 16);
  const viewers = { main: new THREE.Frustum(), sun: null, sunDir: new THREE.Vector3(), lamp: null };
  /** the views with the camera on (x, z), the sun from `off` (its offset from there) or a lamp over the spot */
  const place = (x, z, off, withLamp = false) => {
    const yaw = Math.PI / 4;
    const pitch = 0.68;
    camera.position.set(x + Math.sin(yaw) * Math.cos(pitch) * 40, Math.sin(pitch) * 40, z + Math.cos(yaw) * Math.cos(pitch) * 40);
    camera.lookAt(x, 0, z);
    camera.updateMatrixWorld();
    viewers.main.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    if (off) {
      sun.position.set(x + off.x, off.y, z + off.z);
      sun.target.position.set(x, 0, z);
      sun.updateMatrixWorld();
      sun.target.updateMatrixWorld();
      sun.shadow.updateMatrices(sun);
      viewers.sun = sun.shadow.getFrustum();
      viewers.sunDir.subVectors(sun.target.position, sun.position).normalize();
    } else viewers.sun = null;
    lamp.center.set(x, 3.4, z);
    viewers.lamp = withLamp ? lamp : null;
  };
  /** a sphere seen by brute force: points of it sampled, any inside the frustum */
  const sees = (f, c, r) => {
    for (let k = 0; k < 400; k++) {
      const d = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1));
      if (d.lengthSq() > 1) continue;
      if (f.containsPoint(d.multiplyScalar(r).add(c))) return true;
    }
    return f.containsPoint(c);
  };

  // ── boxes against the view and the lamp, by sampling ──
  place(100, 100, { x: -8, y: 20, z: 4 });
  let wrongBox = 0;
  for (let k = 0; k < 300; k++) {
    const x0 = rand(70, 130);
    const z0 = rand(70, 130);
    const b = [x0, 0, z0, x0 + rand(0.5, 16), rand(0.5, 6), z0 + rand(0.5, 16)];
    const pts = [];
    for (let i = 0; i < 300; i++) pts.push(new THREE.Vector3(rand(b[0], b[3]), rand(b[1], b[4]), rand(b[2], b[5])));
    const inside = pts.filter((q) => viewers.main.containsPoint(q)).length;
    const side = boxInFrustum(viewers.main, b);
    // a box with a point inside is never out; one wholly inside is never only partly
    if (inside > 0 && side === OUT) wrongBox++;
    if (side === IN && inside < pts.length) wrongBox++;
    const inLamp = pts.filter((q) => q.distanceTo(lamp.center) <= lamp.radius).length;
    const ls = boxInSphere(lamp, b);
    if ((inLamp > 0 && ls === OUT) || (ls === IN && inLamp < pts.length)) wrongBox++;
  }
  check(!wrongBox, `${wrongBox} box(es) put wrong against the view or the lamp`);

  // ── a shadow that can fall in view: its ray, marched down to the ground, meets the view ──
  let missed = 0;
  let culled = 0;
  for (let k = 0; k < 600; k++) {
    const c = new THREE.Vector3(rand(60, 140), rand(0.3, 4), rand(60, 140));
    const r = rand(0.3, 2.5);
    const marched = (() => {
      for (let s = 0; s <= c.y + r + 0.5; s += 0.05) {
        const q = c.clone().addScaledVector(viewers.sunDir, s / -viewers.sunDir.y);
        if (sphereInFrustum(viewers.main, q.x, q.y, q.z, r)) return true;
      }
      return false;
    })();
    const said = shadowInView(viewers.main, viewers.sunDir, c.x, c.y, c.z, r);
    if (marched && !said) missed++;
    if (!said) culled++;
  }
  check(!missed, `${missed} body(ies) whose shadow falls in view were said not to`);
  check(culled > 300, `only ${culled} of 600 bodies about the view were found to throw no shadow in it`);

  // ── props: instance by instance, into the view's and the shadow maps' meshes ──
  const geo = new THREE.BoxGeometry(1, 3, 1).translate(0, 1.5, 0);
  const mat = new THREE.MeshStandardMaterial();
  const placed = [];
  const props = new PropBatches([sun.shadow.getFrustum()]);
  for (let k = 0; k < 3000; k++) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(rand(0, 200), 0, rand(0, 200)), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand(0, 6)), new THREE.Vector3(1, rand(0.6, 1.6), 1));
    const key = k % 3 ? 'tree' : 'rock';
    props.add(key, m);
    placed.push({ key, m });
  }
  const partMatrix = new THREE.Matrix4().makeTranslation(0, 0.1, 0);
  props.build((key) => (key === 'rock' ? [{ geometry: geo, material: mat, matrix: partMatrix, lit: false }] : [{ geometry: geo, material: mat, matrix: partMatrix, lit: true }]));
  geo.computeBoundingSphere();
  const meshes = props.group.children;
  const views = meshes.filter((m) => !m.castShadow);
  const shadows = meshes.filter((m) => m.castShadow);
  check(views.length === 2 && shadows.length === 1, `${views.length} view mesh(es) and ${shadows.length} shadow mesh(es) for a lit and an unlit model`);
  check(shadows.every((m) => m.frustumCulled && !m.intersectsFrustum(viewers.main) && m.intersectsFrustum(sun.shadow.getFrustum())), 'a shadow mesh would draw in the view, or not into the shadow map');
  const drawnOf = (im) => {
    const out = [];
    const a = im.instanceMatrix.array;
    for (let i = 0; i < im.count; i++) out.push(`${a[i * 16 + 12].toFixed(3)},${a[i * 16 + 14].toFixed(3)}`);
    return out.sort().join(' ');
  };
  const expect = (key, keep) =>
    placed
      .filter((q) => q.key === key)
      .map((q) => {
        const f = new THREE.Matrix4().multiplyMatrices(q.m, partMatrix);
        const s = geo.boundingSphere.clone().applyMatrix4(f);
        return { f, s };
      })
      .filter(({ s }) => keep(s))
      // as the instance buffer holds them, in 32 bits
      .map(({ f }) => `${Math.fround(f.elements[12]).toFixed(3)},${Math.fround(f.elements[14]).toFixed(3)}`)
      .sort()
      .join(' ');
  const spots = [
    [100, 100, { x: -8, y: 20, z: 4 }, false],
    [30, 170, { x: 12, y: 9, z: -15 }, false],
    [180, 20, null, true],
  ];
  let rounds = 0;
  for (const [x, z, off, withLamp] of spots) {
    place(x, z, off, withLamp);
    props.cull(viewers);
    const [rockView, treeView] = [views.find((m) => m.receiveShadow === false), views.find((m) => m.receiveShadow)];
    const treeShadow = shadows[0];
    const inView = (s) => sphereInFrustum(viewers.main, s.center.x, s.center.y, s.center.z, s.radius);
    const inShadow = (s) => sphereInShadows(viewers, s.center.x, s.center.y, s.center.z, s.radius);
    check(drawnOf(treeView) === expect('tree', inView), `at ${x},${z}: the trees drawn (${treeView.count}) aren't the ones in view`);
    check(drawnOf(rockView) === expect('rock', inView), `at ${x},${z}: the rocks drawn (${rockView.count}) aren't the ones in view`);
    check(drawnOf(treeShadow) === expect('tree', inShadow), `at ${x},${z}: the trees cast (${treeShadow.count}) aren't the ones whose shadows matter`);
    check(treeView.visible === treeView.count > 0 && treeView.count < 1000, `at ${x},${z}: ${treeView.count} trees drawn of 2000`);
    // and they are what a sphere-by-sphere brute force sees
    const seen = placed.filter((q) => q.key === 'tree').filter((q) => sees(viewers.main, geo.boundingSphere.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(q.m, partMatrix)).center, 0.01)).length;
    check(treeView.count >= seen, `at ${x},${z}: ${treeView.count} trees drawn, ${seen} have their middle in view`);
    rounds++;
  }
  // nothing moved: no new upload
  const v0 = shadows[0].instanceMatrix.version;
  props.cull(viewers);
  check(shadows[0].instanceMatrix.version === v0, 'culling again for views that did not move uploaded the instances again');

  // ── scenery chunks: in the scene where a view reaches, not flapping on the edge ──
  const scenery = new Scenery(200, 200);
  const held = new Set();
  for (let x = 2; x < 190; x += 9) {
    for (let z = 2; z < 190; z += 9) {
      scenery.add(new THREE.Mesh(geo, mat).translateX(x).translateZ(z), x, z);
      held.add(`${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`);
    }
  }
  scenery.add(new THREE.Object3D(), 199, 199).lights.push({ pos: new THREE.Vector3(199, 1, 199), color: new THREE.Color(), intensity: 1, flicker: 0, distance: 4 });
  scenery.finish();
  check(scenery.all.length === held.size + 1, `${scenery.all.length} chunks made for things in ${held.size + 1}`);
  check(scenery.all.every((c) => c.group.children.every((o) => !o.matrixAutoUpdate)), 'scenery left to work its matrices out every frame');
  place(100, 100, { x: -8, y: 20, z: 4 });
  scenery.update(viewers);
  const reached = scenery.all.filter((c) => boxInFrustum(viewers.main, c.box, 1) !== OUT || (boxInFrustum(viewers.sun, c.box, 1) !== OUT && shadowInView(viewers.main, viewers.sunDir, (c.box[0] + c.box[3]) / 2, (c.box[1] + c.box[4]) / 2, (c.box[2] + c.box[5]) / 2, Math.hypot(c.box[3] - c.box[0], c.box[4] - c.box[1], c.box[5] - c.box[2]) / 2 + 1)));
  check(scenery.visible.length === reached.length && scenery.group.children.length === reached.length, `${scenery.visible.length} chunks shown, ${reached.length} reached by a view`);
  check(scenery.visible.length < scenery.all.length / 3, `${scenery.visible.length} of ${scenery.all.length} chunks shown for one view`);
  // nudged back and forth across a chunk's edge: shown and hidden once each at most
  let flips = 0;
  let was = new Set(scenery.visible);
  for (let k = 0; k < 40; k++) {
    place(100 + (k % 2 ? 1.5 : -1.5), 100, { x: -8, y: 20, z: 4 });
    scenery.update(viewers);
    const now = new Set(scenery.visible);
    for (const c of scenery.all) if (now.has(c) !== was.has(c)) flips++;
    was = now;
  }
  check(flips <= reached.length, `nudging the view 1.5 m back and forth showed and hid chunks ${flips} times`);
  let lights = 0;
  scenery.lightsNear(195, 195, 10, () => lights++);
  check(lights === 1, `${lights} light(s) found near the one light`);
  scenery.dispose();
  check(!scenery.all.length && !scenery.group.parent, 'scenery not cleared away');

  // ── views of things near the hero: made inside 30, let go past 40, no flapping between ──
  let made = 0;
  let freed = 0;
  const nv = new NearViews(
    (k) => (made++, { k }),
    () => freed++,
  );
  const things = Array.from({ length: 50 }, (_, i) => ({ pos: { x: i * 3, z: 0 } }));
  const near = (hero) => things.filter((t) => Math.hypot(t.pos.x - hero.x, t.pos.z - hero.z) <= VIEW_NEAR);
  let hero = { x: 0, z: 0 };
  nv.sync(hero, near(hero));
  const first = made;
  check(first === near(hero).length, `${made} views made for ${near(hero).length} things within ${VIEW_NEAR}`);
  // walk back and forth by 8 m: nothing within 30 of either end is further than 40 from the other
  for (let k = 0; k < 30; k++) {
    hero = { x: k % 2 ? 8 : 0, z: 0 };
    nv.sync(hero, near(hero));
  }
  // none within 30 of one end is past 40 from the other: every view made once and kept
  const either = new Set([...near({ x: 0, z: 0 }), ...near({ x: 8, z: 0 })]);
  check(freed === 0 && made === either.size, `walking back and forth made ${made} views for ${either.size} things and freed ${freed}`);
  hero = { x: 140, z: 0 };
  nv.sync(hero, near(hero));
  check([...nv.views.keys()].every((t) => Math.hypot(t.pos.x - hero.x, t.pos.z - hero.z) <= VIEW_FAR), `views kept past ${VIEW_FAR} m`);
  check(freed > 0, 'walking away freed no views');
  // gone from the level: let go
  const gone = things[things.length - 1];
  nv.sync(hero, near(hero), (t) => t === gone);
  check(!nv.views.has(gone), 'a view of a thing gone from the level was kept');
  // a further reach keeps views further: none let go inside it
  const kept = nv.views.size;
  hero = { x: 140 - 50, z: 0 };
  nv.sync(hero, [], undefined, 55);
  check(nv.views.size === kept, `a reach of 55 let ${kept - nv.views.size} view(s) go 50 m off`);
  nv.clear();
  check(nv.views.size === 0 && freed === made, `cleared: ${made} made, ${freed} freed`);

  // ── rigs put by, a few of each, so many in all, the look least lately used making room ──
  const gone2 = [];
  const pool = new Pool((v) => gone2.push(v), 2, 3);
  pool.give('a', 1);
  pool.give('a', 2);
  // a third of a look: disposed, not put by
  pool.give('a', 3);
  pool.give('b', 4);
  check(pool.size === 3 && gone2.join() === '3', `pool of 3 holds ${pool.size}, disposed ${gone2.join() || 'none'}`);
  // full: 'a', used before 'b', gives up its oldest for the new one
  pool.give('b', 5);
  check(pool.size === 3 && gone2.join() === '3,1', `full, a new rig disposed ${gone2.join()} rather than the oldest of the look least lately used`);
  check(pool.take('b') === 5 && pool.take('a') === 2 && pool.take('a') === undefined && pool.size === 1, 'the pool hands back the wrong rigs');
  // taking a look makes it the latest used: 'c' then pushes out 'b' (used before 'a' was taken)
  pool.give('a', 6);
  pool.give('c', 7);
  pool.give('c', 8);
  check(pool.take('b') === undefined && pool.take('a') === 6 && gone2.join() === '3,1,4', `the latest used look gave way (disposed ${gone2.join()})`);
  // a new level without look 'c': its rigs go
  pool.give('a', 9);
  pool.retain((k) => k === 'a');
  check(pool.size === 1 && pool.take('c') === undefined && pool.take('a') === 9 && gone2.join() === '3,1,4,7,8', `retain kept ${pool.size}, disposed ${gone2.join()}`);
  pool.give('a', 10);
  pool.clear();
  check(pool.size === 0 && gone2.length === 6, 'the pool not cleared');

  // ── shadow casters: a pair of depth materials for each kind of mesh, none for plain or cut-out ones ──
  const plainMesh = new THREE.Mesh(geo, mat);
  const skinned = new THREE.SkinnedMesh(geo, mat);
  const skinned2 = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial());
  const inst = new THREE.InstancedMesh(geo, mat, 2);
  const coloured = new THREE.InstancedMesh(geo, mat, 2);
  coloured.setColorAt(0, new THREE.Color());
  const cutout = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial({ alphaTest: 0.5 }));
  for (const m of [plainMesh, skinned, skinned2, inst, coloured, cutout]) ownDepth(m);
  check(!plainMesh.customDepthMaterial && !cutout.customDepthMaterial, 'a plain or a cut-out mesh given a depth material of its own');
  check(skinned.customDepthMaterial && skinned.customDepthMaterial === skinned2.customDepthMaterial && skinned.customDistanceMaterial === skinned2.customDistanceMaterial, 'skinned meshes do not share their depth materials');
  const kinds = new Set([skinned.customDepthMaterial, inst.customDepthMaterial, coloured.customDepthMaterial]);
  check(kinds.size === 3 && [...kinds].every((m) => m?.isMeshDepthMaterial) && coloured.customDistanceMaterial?.isMeshDistanceMaterial, 'skinned, instanced and coloured instanced meshes share a depth material');

  // ── a let-go view: its own geometry and materials disposed, shared ones and a sprite's geometry kept ──
  const disposed = new Set();
  const watch = (x) => x.addEventListener('dispose', () => disposed.add(x));
  const view = new THREE.Group();
  const ownGeo = new THREE.BoxGeometry();
  const ownMat = new THREE.MeshStandardMaterial();
  const sharedGeo = new THREE.BoxGeometry();
  const sharedMat = new THREE.MeshStandardMaterial();
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial());
  const model = new THREE.Group().add(new THREE.Mesh(sharedGeo, [sharedMat, ownMat]));
  view.add(new THREE.Mesh(ownGeo, sharedMat), model, sprite);
  for (const x of [ownGeo, ownMat, sharedGeo, sharedMat, sprite.material, sprite.geometry]) watch(x);
  disposeView(view, (x) => x === sharedGeo || x === sharedMat);
  check(disposed.has(ownGeo) && disposed.has(ownMat) && disposed.has(sprite.material), 'a view kept geometry or materials of its own');
  check(!disposed.has(sharedGeo) && !disposed.has(sharedMat) && !disposed.has(sprite.geometry), 'a view disposed a geometry or material it shares');

  // ── tinted views made, let go and made again (the stash, a looted chest): the shared inside floor
  // never changes, each view's copy and its own materials are tinted once, and go with the view ──
  const inside = new THREE.MeshStandardMaterial({ color: '#120c08' });
  const isShared = (x) => x === inside;
  const insideHex = inside.color.getHex();
  let tinted = 0;
  for (let k = 0; k < 4; k++) {
    const own = new THREE.MeshStandardMaterial({ color: '#806040' });
    // the body's material on two of its meshes, the shared inside floor on two
    const chest = new THREE.Group().add(new THREE.Mesh(new THREE.BoxGeometry(), own), new THREE.Mesh(new THREE.PlaneGeometry(), inside), new THREE.Sprite(new THREE.SpriteMaterial()), new THREE.Mesh(new THREE.BoxGeometry(), own), new THREE.Mesh(new THREE.PlaneGeometry(), inside));
    tintOwn(chest, isShared, (m) => {
      m.color.multiplyScalar(1.5);
      tinted++;
    });
    const [body, floor, , body2, floor2] = chest.children;
    check(body2.material === own && floor2.material === floor.material, 'a material on two meshes of a view given two copies');
    check(body.material === own && Math.abs(own.color.r - new THREE.Color('#806040').r * 1.5) < 1e-6, 'a view tinted its own material other than once');
    check(floor.material !== inside && Math.abs(floor.material.color.r - inside.color.r * 1.5) < 1e-6, 'a view tinted a shared material, or its copy other than once');
    const copy = floor.material;
    watch(copy);
    watch(inside);
    disposeView(chest, isShared);
    check(disposed.has(copy) && !disposed.has(inside), 'a tinted view kept its copy of a shared material, or disposed the shared one');
  }
  check(inside.color.getHex() === insideHex && tinted === 8, `a shared material tinted (${inside.color.getHexString()} after four views), or materials missed`);

  if (problems.length) throw new Error(`${problems.length} problem(s):\n  ${problems.slice(0, 40).join('\n  ')}`);
  console.log(`  boxes, shadows that fall in view and ${rounds} views of 3000 props as brute force has them; ${reached.length} of ${held.size + 1} scenery chunks shown, ${flips} flip(s) nudging the view; near views made at ${VIEW_NEAR}, freed past ${VIEW_FAR}; rigs put by least lately used first; a depth material for each kind of caster; let-go views disposed; views made again tint their own copies, the shared ones untouched`);
};
