/* ---------- renderer, camera, controls ---------- */
const vp = $('#viewport'), canvas = $('#gl'), ov = $('#overlay'), octx = ov.getContext('2d');
const renderer = new THREE.WebGLRenderer({canvas, antialias: true, preserveDrawingBuffer: true, alpha: true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, .02, 600);
camera.filmGauge = 35; camera.setFocalLength(50);
camera.position.set(1.9, 1.25, 3.6);
const controls = new THREE.OrbitControls(camera, canvas);
controls.target.set(0, .9, 0);
controls.enableDamping = true; controls.dampingFactor = .12;
controls.minDistance = .25; controls.maxDistance = 80;
controls.update();
const tc = new THREE.TransformControls(camera, canvas);
tc.setMode('rotate'); tc.setSpace('local'); tc.setSize(.72);
scene.add(tc);

/* ---------- lights ---------- */
const hemi = new THREE.HemisphereLight(0xfff5e6, 0x7d7262, .42); scene.add(hemi);
const key = new THREE.DirectionalLight(0xfff0da, .95);
key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, {left: -5, right: 5, top: 5, bottom: -5, near: .5, far: 30});
key.shadow.bias = -.0008; key.shadow.normalBias = .045;
scene.add(key, key.target);
const rim = new THREE.DirectionalLight(0xdfe7ff, .35); scene.add(rim, rim.target);

/* ---------- environment materials ---------- */
const M = (color, o = {}) => patchEnv(new THREE.MeshStandardMaterial({color, roughness: o.r ?? .95, metalness: o.m ?? 0, ...(o.e ? {emissive: o.e, emissiveIntensity: 0} : {}), ...(o.t ? {transparent: true, opacity: o.t} : {})}));
const EM = {
  floor: M(0xd8cfba), wall: M(0xe9e2d2), wood: M(0xb59a76), dark: M(0x7a6650), stone: M(0xbdb6a8), stone2: M(0xa59e90),
  metal: M(0x8e9298, {r: .45, m: .5}), fabric: M(0x9a8f86), fabric2: M(0x6f7b83), foliage: M(0x7f8f6a), foliage2: M(0x667756), bark: M(0x6e5a48),
  road: M(0x55524e), walk: M(0xa8a39a), grass: M(0x8f9a76), sand: M(0xdccdaa), water: M(0x7f9fae, {r: .25, t: .85}), tatami: M(0xcfc39a), tatami2: M(0xc2b68c),
  white: M(0xf2eee6), black: M(0x2c2a28), red: M(0x9a4a3c), canvas: M(0xc9c1b0),
  glass: M(0xc9d6dc, {e: 0xffe2a8}), lamp: M(0xf4ead8, {e: 0xffd9a0}), sky: null
};
const EMISSIVE = [EM.glass, EM.lamp];
const geoCache = {};
const G = {
  box: () => geoCache.box || (geoCache.box = new THREE.BoxGeometry(1, 1, 1)),
  cyl: s => geoCache['cyl' + s] || (geoCache['cyl' + s] = new THREE.CylinderGeometry(1, 1, 1, s || 20)),
  cone: s => geoCache['cone' + s] || (geoCache['cone' + s] = new THREE.ConeGeometry(1, 1, s || 16)),
  sph: () => geoCache.sph || (geoCache.sph = new THREE.SphereGeometry(1, 24, 16)),
  ico: () => geoCache.ico || (geoCache.ico = new THREE.IcosahedronGeometry(1, 0)),
  dod: () => geoCache.dod || (geoCache.dod = new THREE.DodecahedronGeometry(1, 0))
};
function mk(geo, mat, x, y, z, sx, sy, sz, ry = 0, rx = 0, rz = 0, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.set(rx, ry, rz);
  m.castShadow = shadow; m.receiveShadow = true; return m;
}
// box/cylinder resting on y (bottom at y)
const box = (p, mat, w, h, d, x, y, z, ry = 0) => { const m = mk(G.box(), mat, x, y + h / 2, z, w, h, d, ry); p.add(m); return m; };
const cyl = (p, mat, r, h, x, y, z, seg = 20, r2) => { const g = r2 === undefined ? G.cyl(seg) : new THREE.CylinderGeometry(r2, r, 1, seg); const m = mk(g, mat, x, y + h / 2, z, r2 === undefined ? r : 1, h, r2 === undefined ? r : 1); p.add(m); return m; };
const cone = (p, mat, r, h, x, y, z, seg = 16) => { const m = mk(G.cone(seg), mat, x, y + h / 2, z, r, h, r); p.add(m); return m; };
const ball = (p, mat, r, x, y, z, sy = 1) => { const m = mk(G.sph(), mat, x, y, z, r, r * sy, r); p.add(m); return m; };
const plane = (p, mat, w, d, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true; m.userData.noOutline = true; p.add(m); return m; };
function pointLamp(env, x, y, z, color = 0xffcf8a, power = 1.2, dist = 9) {
  const l = new THREE.PointLight(color, 0, dist, 1.6); l.position.set(x, y, z); l.userData.power = power; env.add(l); env.userData.lamps.push(l); return l;
}

/* ---------- reusable furniture (also used as props) ---------- */
const FURN = {
  silla(p) { box(p, EM.wood, .44, .04, .42, 0, .44, 0); for (const [x, z] of [[-.19, -.18], [.19, -.18], [-.19, .18], [.19, .18]]) box(p, EM.dark, .035, .44, .035, x, 0, z); box(p, EM.wood, .44, .45, .03, 0, .48, -.2); },
  mesa(p) { box(p, EM.wood, 1.2, .05, .7, 0, .72, 0); for (const [x, z] of [[-.55, -.3], [.55, -.3], [-.55, .3], [.55, .3]]) box(p, EM.dark, .05, .72, .05, x, 0, z); },
  banco(p) { box(p, EM.wood, 1.5, .05, .42, 0, .43, 0); box(p, EM.wood, 1.5, .4, .04, 0, .5, -.2); for (const x of [-.65, .65]) { box(p, EM.metal, .05, .43, .4, x, 0, 0); } },
  taburete(p) { cyl(p, EM.wood, .18, .04, 0, .58, 0, 28); for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; box(p, EM.dark, .03, .6, .03, Math.sin(a) * .12, 0, Math.cos(a) * .12); } },
  mesaRedonda(p) { cyl(p, EM.wood, .4, .04, 0, .74, 0, 32); cyl(p, EM.metal, .04, .74, 0, 0, 0); cyl(p, EM.metal, .25, .03, 0, 0, 0, 24); },
  farola(p, env) { cyl(p, EM.black, .06, 4.2, 0, 0, 0, 12); box(p, EM.black, .7, .06, .06, .32, 4.15, 0); const h = box(p, EM.lamp, .3, .14, .22, .62, 4.0, 0); h.castShadow = false; if (env) { const ry = p.rotation.y; pointLamp(env, p.position.x + Math.cos(ry) * .62, 3.85, p.position.z - Math.sin(ry) * .62, 0xffc477, 1.1, 10); } },
  arbol(p) { cyl(p, EM.bark, .14, 2.2, 0, 0, 0, 10, .09); const f = [[0, 2.6, 0, 1.1], [.4, 2.2, .2, .75], [-.35, 2.3, -.2, .8], [0, 3.2, 0, .75]]; for (const [x, y, z, r] of f) { const m = mk(G.ico(), EM.foliage, x, y, z, r, r * .85, r, x * 3); p.add(m); } },
  pino(p) { cyl(p, EM.bark, .12, 1, 0, 0, 0, 10, .08); cone(p, EM.foliage2, .9, 1.6, 0, .8, 0, 9); cone(p, EM.foliage2, .7, 1.3, 0, 1.7, 0, 9); cone(p, EM.foliage2, .45, 1, 0, 2.5, 0, 9); },
  roca(p) { const m = mk(G.dod(), EM.stone2, 0, .25, 0, .5, .35, .42, .6, .2, .1); p.add(m); },
  barril(p) { cyl(p, EM.dark, .28, .85, 0, 0, 0, 20); for (const y of [.12, .7]) cyl(p, EM.metal, .29, .05, 0, y, 0, 20); },
  caja(p) { box(p, EM.wood, .6, .6, .6, 0, 0, 0); box(p, EM.dark, .62, .06, .62, 0, .27, 0); },
  columna(p, h = 3.2) { box(p, EM.stone, .8, .25, .8, 0, 0, 0); cyl(p, EM.stone, .3, h - .5, 0, .25, 0, 24, .27); box(p, EM.stone, .8, .25, .8, 0, h - .25, 0); }
};
const PROP_BUILD = {
  cubo: p => box(p, EM.stone, .5, .5, .5, 0, 0, 0),
  caja: p => FURN.caja(p),
  cilindro: p => cyl(p, EM.stone, .25, .8, 0, 0, 0, 28),
  esfera: p => ball(p, EM.stone, .3, 0, .3, 0),
  silla: p => FURN.silla(p), mesa: p => FURN.mesa(p), banco: p => FURN.banco(p), taburete: p => FURN.taburete(p),
  escalon: p => box(p, EM.stone, 1, .2, .35, 0, 0, 0),
  pared: p => box(p, EM.wall, 2, 2.4, .12, 0, 0, 0),
  barril: p => FURN.barril(p),
  espada: p => { box(p, EM.metal, .045, .8, .012, 0, .95, 0); box(p, EM.dark, .2, .03, .04, 0, .93, 0); cyl(p, EM.dark, .018, .18, 0, .75, 0, 10); ball(p, EM.metal, .025, 0, .74, 0); },
  baston: p => cyl(p, EM.wood, .018, 1.5, 0, 0, 0, 10),
  balon: p => ball(p, EM.red, .12, 0, .12, 0),
  farola: p => FURN.farola(p),
  arbol: p => FURN.arbol(p),
  roca: p => FURN.roca(p),
  puerta: p => { box(p, EM.dark, 1.05, 2.15, .08, 0, 0, 0); box(p, EM.wood, .9, 2.05, .05, 0, 0, .04); ball(p, EM.metal, .03, .36, 1.0, .09); }
};

/* ---------- environments ---------- */
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const place = (env, fn, x, y, z, ry = 0, s = 1) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; g.scale.setScalar(s); env.add(g); fn(g, env); return g; };
const ENV_BUILD = {
  estudio(e) {
    plane(e, EM.floor, 60, 60);
    box(e, EM.wall, 16, 7, .05, 0, 0, -7).userData.noOutline = true;
    for (const sx of [-1, 1]) {
      const st = place(e, p => { for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; box(p, EM.black, .03, .9, .03, Math.sin(a) * .25, 0, Math.cos(a) * .25); } cyl(p, EM.black, .025, 2.2, 0, .5, 0, 8);
        const sb = box(p, EM.white, .8, .6, .35, 0, 2.3, 0); sb.castShadow = false; }, sx * 4.2, 0, -3.2, sx * -.7);
      st.userData.lampAt = true;
    }
    place(e, FURN.caja, 2.6, 0, -1.4, .3, .75); place(e, FURN.caja, -2.8, 0, -1.8, -.2, .6);
  },
  habitacion(e) {
    plane(e, EM.wood, 9, 8, 0, 0, .5);
    box(e, EM.wall, 9, 2.8, .15, 0, 0, -3.5).userData.noOutline = true;
    // side wall with a window
    const wx = -4.2;
    box(e, EM.wall, .15, .9, 7, wx, 0, .3); box(e, EM.wall, .15, .7, 7, wx, 2.1, .3);
    box(e, EM.wall, .15, 1.2, 2.6, wx, .9, -2.2); box(e, EM.wall, .15, 1.2, 2.4, wx, .9, 2.6);
    const gl = box(e, EM.glass, .04, 1.2, 1.9, wx, .9, .45); gl.castShadow = false;
    box(e, EM.white, .2, .06, 2, wx + .05, .87, .45); box(e, EM.white, .08, 1.2, .06, wx + .05, .9, .45);
    // sofa
    place(e, p => { box(p, EM.fabric, 2.1, .42, .9, 0, 0, 0); box(p, EM.fabric, 2.1, .5, .22, 0, .42, -.34); for (const x of [-.98, .98]) box(p, EM.fabric, .2, .25, .9, x, .42, 0);
      for (const x of [-.5, .5]) box(p, EM.fabric2, .9, .12, .62, x, .42, .08); }, 0, 0, -2.8);
    place(e, p => { box(p, EM.wood, 1.1, .04, .55, 0, .4, 0); for (const [x, z] of [[-.5, -.22], [.5, -.22], [-.5, .22], [.5, .22]]) box(p, EM.dark, .04, .4, .04, x, 0, z); }, 0, 0, -1.6);
    cyl(e, EM.fabric2, 1.4, .012, 0, 0, -1.4, 40).castShadow = false;
    // shelf with books
    place(e, p => { box(p, EM.dark, 1.2, 2, .32, 0, 0, 0); const r = rng(4);
      for (let s = 0; s < 4; s++) { box(p, EM.wood, 1.14, .025, .3, 0, .1 + s * .48, .02); let x = -.52; while (x < .5) { const w = .03 + r() * .04, h = .22 + r() * .14; box(p, r() > .5 ? EM.fabric : EM.fabric2, w, h, .2, x + w / 2, .125 + s * .48, .04); x += w + .005; } } }, 3, 0, -3.25);
    // floor lamp
    place(e, (p, env) => { cyl(p, EM.black, .15, .03, 0, 0, 0, 20); cyl(p, EM.black, .02, 1.5, 0, 0, 0, 8); const sh = cyl(p, EM.lamp, .2, .3, 0, 1.45, 0, 20, .14); sh.castShadow = false; }, -2.3, 0, -2.9);
    pointLamp(e, -2.3, 1.55, -2.9, 0xffc98a, 1, 7);
    place(e, FURN.silla, 2.2, 0, -.6, -.8);
    box(e, EM.dark, .6, .45, .04, 1.4, 1.2, -3.42).castShadow = false;
  },
  calle(e) {
    plane(e, EM.road, 14, 120, 0, 0, 0);
    for (const sx of [-1, 1]) { box(e, EM.walk, 4, .15, 120, sx * 9, 0, 0).userData.noOutline = true; }
    for (let i = -5; i <= 5; i++) { const s = box(e, EM.white, .3, .005, 1.8, 0, .002, i * 4.5); s.castShadow = false; s.userData.noOutline = true; }
    for (let i = 0; i < 6; i++) { const s = box(e, EM.white, .5, .005, 3, -2.4 + i * 1, .002, 3.2); s.castShadow = false; s.userData.noOutline = true; }
    const r = rng(9);
    const winGeo = new THREE.BoxGeometry(.9, 1.2, .1);
    for (const sx of [-1, 1]) for (let i = -4; i <= 3; i++) {
      const w = 6 + r() * 3, h = 8 + r() * 18, d = 8, x = sx * (11 + w / 2), z = i * 11 + r() * 2;
      const b = box(e, r() > .5 ? EM.stone : EM.wall, w, h, d, x, 0, z); b.castShadow = i > -2 && i < 2; b.userData.noOutline = true;
      const cols = Math.floor(d / 1.6), rows = Math.floor((h - 2) / 2.4);
      const inst = new THREE.InstancedMesh(winGeo, EM.glass, cols * rows), m4 = new THREE.Matrix4();
      let k = 0; for (let rr = 0; rr < rows; rr++) for (let c = 0; c < cols; c++) { m4.makeRotationY(Math.PI / 2); m4.setPosition(x - sx * (w / 2 + .03), 2.2 + rr * 2.4, z - d / 2 + .8 + c * 1.6); inst.setMatrixAt(k++, m4); }
      inst.userData.noOutline = true; e.add(inst);
    }
    for (const z of [-8, 2, 12]) for (const sx of [-1, 1]) place(e, FURN.farola, sx * 7.4, .15, z + sx * 4, sx > 0 ? Math.PI : 0);
    place(e, FURN.banco, -8, .15, -1.5, Math.PI / 2);
    place(e, p => { cyl(p, EM.red, .14, .5, 0, 0, 0, 16); ball(p, EM.red, .14, 0, .5, 0); box(p, EM.red, .38, .07, .07, 0, .32, 0); }, 7.6, .15, -1);
    place(e, FURN.barril, -7.6, .15, 3.4, 0, .9);
  },
  bosque(e) {
    plane(e, EM.grass, 200, 200);
    const r = rng(3);
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2, d = 3.2 + Math.pow(r(), .7) * 28, x = Math.sin(a) * d, z = Math.cos(a) * d - 2;
      place(e, r() > .45 ? FURN.pino : FURN.arbol, x, 0, z, r() * 6, .8 + r() * .9);
    }
    for (let i = 0; i < 14; i++) { const a = r() * Math.PI * 2, d = 2.2 + r() * 8; place(e, FURN.roca, Math.sin(a) * d, 0, Math.cos(a) * d, r() * 6, .5 + r() * 1.3); }
    for (let i = 0; i < 18; i++) { const a = r() * Math.PI * 2, d = 2.5 + r() * 9; ball(e, EM.foliage, .3 + r() * .35, Math.sin(a) * d, .15, Math.cos(a) * d, .7); }
    const log = mk(G.cyl(14), EM.bark, -1.8, .2, 1.4, .2, 2.4, .2, 0, 0, Math.PI / 2); log.rotation.y = .5; e.add(log);
  },
  ring(e) {
    plane(e, EM.black, 60, 60, 0, -.35);
    box(e, EM.canvas, 6.2, .02, 6.2, 0, -.02, 0).userData.noOutline = true;
    box(e, EM.red, 6.6, .3, 6.6, 0, -.32, 0);
    for (const [x, z] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) { cyl(e, EM.metal, .07, 1.5, x, 0, z, 12); box(e, EM.red, .2, .5, .2, x, .7, z); }
    for (const h of [.55, .9, 1.25]) for (const [x, z, ry] of [[0, -3, 0], [0, 3, 0], [-3, 0, Math.PI / 2], [3, 0, Math.PI / 2]]) {
      const m = mk(G.cyl(8), EM.white, x, h, z, .022, 6, .022, ry, 0, Math.PI / 2); e.add(m);
    }
    for (const [x, z] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) cyl(e, EM.black, .08, 6.35, x, -.35, z, 10);
    box(e, EM.black, 8.4, .3, .3, 0, 6, -4); box(e, EM.black, 8.4, .3, .3, 0, 6, 4);
    for (const x of [-2.5, 0, 2.5]) { const l = box(e, EM.lamp, .4, .25, .4, x, 5.6, 4); l.castShadow = false; pointLamp(e, x, 5.3, 3.5, 0xfff2de, .6, 14); }
    const r = rng(2);
    for (let i = 0; i < 40; i++) { const a = r() * Math.PI * 2, d = 5.5 + r() * 3; place(e, p => { cyl(p, EM.fabric2, .22, .9, 0, 0, 0, 10); ball(p, EM.fabric2, .13, 0, 1.05, 0); }, Math.sin(a) * d, -.35, Math.cos(a) * d, a + Math.PI); }
  },
  cafeteria(e) {
    plane(e, EM.stone, 14, 12, 0, 0, 0);
    box(e, EM.wall, 14, 3.2, .15, 0, 0, -4.5).userData.noOutline = true;
    box(e, EM.wall, .15, 3.2, 10, -6, 0, 0).userData.noOutline = true;
    const gl = box(e, EM.glass, .05, 1.8, 5, -5.9, .8, .5); gl.castShadow = false;
    place(e, p => { box(p, EM.dark, 4, 1.05, .7, 0, 0, 0); box(p, EM.wood, 4.1, .05, .8, 0, 1.05, 0); }, 2.5, 0, -3.3);
    for (let i = 0; i < 4; i++) place(e, FURN.taburete, 1 + i * 1, 0, -2.6, 0, 1.25);
    for (let s = 0; s < 3; s++) box(e, EM.wood, 3, .04, .3, 2.5, 1.5 + s * .45, -4.3);
    for (const [x, z] of [[-3.6, -1.5], [-3.6, 1.6], [-1.4, 2.4], [2.6, 1.6]]) {
      place(e, FURN.mesaRedonda, x, 0, z);
      for (const a of [0, Math.PI]) place(e, FURN.silla, x + Math.sin(a) * .75, 0, z + Math.cos(a) * .75, a + Math.PI);
      const sh = cyl(e, EM.lamp, .28, .25, x, 2.2, z, 20, .1); sh.castShadow = false;
      cyl(e, EM.black, .006, .8, x, 2.42, z, 4);
      pointLamp(e, x, 2.05, z, 0xffcf8a, .9, 6);
    }
  },
  ruinas(e) {
    plane(e, EM.sand, 200, 200);
    box(e, EM.stone2, 9, .3, 7, 0, -.3, -1).userData.noOutline = true;
    for (let i = 0; i < 3; i++) box(e, EM.stone2, 9 + i * .9, .1, 7 + i * .9, 0, -.4 - i * .1, -1);
    const r = rng(7);
    for (const [x, z, h] of [[-3.6, -3.6, 3.4], [-1.2, -3.6, 3.4], [1.2, -3.6, 1.8], [3.6, -3.6, 3.4], [-3.6, 1.4, 2.2], [3.6, 1.4, 3.4]]) place(e, p => FURN.columna(p, h), x, 0, z);
    box(e, EM.stone, 3.6, .5, .9, -2.4, 3.4, -3.6);
    for (let i = 0; i < 6; i++) { const m = mk(G.cyl(20), EM.stone, 2 + r() * 3, .27, 1 + r() * 2.5, .27, .5, .27, r() * 3, 0, Math.PI / 2); e.add(m); }
    for (let i = 0; i < 8; i++) box(e, EM.stone2, .5 + r() * .6, .3 + r() * .4, .4 + r() * .4, -4.5 + r() * 9, 0, 2.5 + r() * 2, r() * 2);
    place(e, p => { FURN.columna(p, 2.8); }, -6, 0, 3, 0, .9);
  },
  escalinata(e) {
    plane(e, EM.stone2, 200, 200);
    for (let i = 0; i < 12; i++) box(e, EM.stone, 8, .16 * (i + 1), .36, 0, 0, -1 - i * .36).userData.noOutline = true;
    box(e, EM.stone, 8, 1.92, 4, 0, 0, -7.3).userData.noOutline = true;
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 12; i++) box(e, EM.stone2, .5, .16 * (i + 1) + .9, .36, sx * 4.25, 0, -1 - i * .36);
      for (let i = 0; i < 6; i++) cyl(e, EM.stone, .06, .8, sx * 3.7, .16 * (i * 2 + 1), -1.2 - i * .72, 10);
    }
    place(e, p => FURN.columna(p, 3.6), -3, 1.92, -6.5); place(e, p => FURN.columna(p, 3.6), 3, 1.92, -6.5);
  },
  azotea(e) {
    plane(e, EM.walk, 16, 16);
    for (const [w, d, x, z] of [[16, .3, 0, -8], [16, .3, 0, 8], [.3, 16, -8, 0], [.3, 16, 8, 0]]) box(e, EM.stone, w, 1, d, x, 0, z);
    place(e, p => { for (const [x, z] of [[-.6, -.6], [.6, -.6], [-.6, .6], [.6, .6]]) box(p, EM.metal, .08, 1.6, .08, x, 0, z); cyl(p, EM.wood, .85, 1.6, 0, 1.6, 0, 24); cone(p, EM.dark, .9, .4, 0, 3.2, 0, 24); }, -4.5, 0, -4.5);
    for (const [x, z] of [[3, -5], [4.6, -5]]) place(e, p => { box(p, EM.metal, 1.2, .9, .8, 0, 0, 0); cyl(p, EM.black, .3, .05, 0, .9, 0, 20); }, x, 0, z);
    place(e, p => { box(p, EM.wall, 2.4, 2.6, 2.2, 0, 0, 0); box(p, EM.dark, .9, 2, .05, 0, 0, 1.11); }, 5, 0, 4.5, Math.PI);
    cyl(e, EM.metal, .03, 3, -6.5, 1, 6, 6);
    const r = rng(11);
    for (let i = 0; i < 40; i++) { const a = r() * Math.PI * 2, d = 30 + r() * 60, w = 6 + r() * 10, h = 10 + r() * 50; const b = box(e, EM.stone2, w, h, w, Math.sin(a) * d, -20, Math.cos(a) * d); b.castShadow = false; b.userData.noOutline = true; }
  },
  dojo(e) {
    for (let i = -4; i <= 4; i++) for (let j = -7; j <= 6; j++) { const t = box(e, (i + j) & 1 ? EM.tatami : EM.tatami2, 1.78, .03, .88, i * 1.8 + (j & 1) * .9, -.03, j * .9); t.castShadow = false; t.userData.noOutline = true; }
    box(e, EM.wood, 18, .2, 14, 0, -.25, 0).userData.noOutline = true;
    for (const [w, d, x, z] of [[17, .15, 0, -6.5], [.15, 13, -8.4, 0], [.15, 13, 8.4, 0]]) {
      box(e, EM.white, w, 3, d, x, 0, z).userData.noOutline = true;
      const n = Math.round(Math.max(w, d) / 1.2);
      for (let k = 0; k <= n; k++) { const t = -Math.max(w, d) / 2 + k * Math.max(w, d) / n; box(e, EM.dark, w > d ? .07 : .2, 3, w > d ? .2 : .07, w > d ? x + t : x, 0, w > d ? z : z + t); }
      box(e, EM.dark, w > d ? w : .22, .12, w > d ? .22 : d, x, 2.2, z);
    }
    for (const x of [-4.2, 4.2]) for (const z of [-4, 4]) box(e, EM.dark, .3, 3.2, .3, x, 0, z);
    place(e, p => { box(p, EM.dark, 1.6, .06, .1, 0, 1.1, 0); box(p, EM.dark, 1.6, .06, .1, 0, .5, 0); for (const x of [-.75, .75]) box(p, EM.dark, .06, 1.3, .1, x, 0, 0);
      for (let i = 0; i < 4; i++) { const s = mk(G.cyl(8), EM.wood, -.5 + i * .33, 1.15, .06, .012, 1.4, .012, 0, 0, .1); p.add(s); } }, 4, 0, -6.3);
    box(e, EM.white, .7, 1.4, .02, -3, 1, -6.4);
  },
  playa(e) {
    plane(e, EM.sand, 200, 120, 0, 0, 30);
    const w = new THREE.Mesh(new THREE.PlaneGeometry(200, 120), EM.water); w.rotation.x = -Math.PI / 2; w.position.set(0, .03, -62); w.userData.noOutline = true; e.add(w);
    const r = rng(5);
    for (const [x, z, lean] of [[-4, -2, .25], [5, -3.5, -.3], [-7, 2, .15]]) place(e, p => {
      let y = 0, xx = 0; for (let i = 0; i < 6; i++) { const m = mk(G.cyl(10), EM.bark, xx, y + .38, 0, .13 - i * .012, .8, .13 - i * .012, 0, 0, -lean * (1 + i * .3)); p.add(m); xx += Math.sin(lean * (1 + i * .3)) * .75; y += Math.cos(lean * (1 + i * .3)) * .76; }
      for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2; const l = mk(G.cone(6), EM.foliage, xx + Math.sin(a) * .8, y, Math.cos(a) * .8, .25, 1.8, .08, a, Math.PI / 2 - .35, 0); l.rotation.order = 'YXZ'; l.rotation.set(Math.PI / 2 + .3, a, 0); p.add(l); }
    }, x, 0, z);
    place(e, p => { cyl(p, EM.white, .02, 2.2, 0, 0, 0, 8); const c = mk(G.cone(12), EM.red, 0, 2.2, 0, 1.1, .45, 1.1); c.castShadow = true; p.add(c); }, 2.2, 0, .5);
    box(e, EM.fabric2, .8, .01, 1.8, 1.4, 0, 1.2, .2).castShadow = false;
    for (let i = 0; i < 6; i++) place(e, FURN.roca, -8 + r() * 16, 0, -4 - r() * 3, r() * 6, .6 + r());
  },
  vacio() {}
};

/* ---------- props and added lights ---------- */
const props = [], extraLights = [];
function makeProp(type, pos) {
  const g = new THREE.Group(); g.userData = {prop: type};
  const fin = () => {
    g.userData.box = new THREE.Box3().setFromObject(g);
    g.traverse(o => { if (o.isMesh) { o.userData.propRoot = g; } });
    addOutlines(g); if (typeof state !== 'undefined') setOutlines(g, state.envOutline);
  };
  g.position.copy(pos); scene.add(g); props.push(g);
  const ap = typeof ASSET_PROPS !== 'undefined' && ASSET_PROPS[type];
  if (ap) {
    g.userData.box = new THREE.Box3(new V3(-.3, 0, -.3), new V3(.3, .6, .3));
    loadAsset(ap[1]).then(() => { const pos0 = g.position.clone(), q0 = g.quaternion.clone(), s0 = g.scale.clone(); g.position.set(0, 0, 0); g.quaternion.identity(); g.scale.set(1, 1, 1); g.updateMatrixWorld(true);
      A(g, ap[1], 0, 0, 0, ap[2] || {}); fin(); g.position.copy(pos0); g.quaternion.copy(q0); g.scale.copy(s0); }, err => console.error(err));
  } else { (PROP_BUILD[type] || PROP_BUILD.cubo)(g); fin(); }
  return g;
}
function addOutlines(root) {
  const list = []; root.traverse(o => { if (o.isMesh && !o.userData.noOutline && !o.userData.isHull && !o.isInstancedMesh) list.push(o); });
  for (const o of list) { const h = new THREE.Mesh(o.geometry, OUTLINE_MAT); h.userData.isHull = true; h.raycast = () => {}; o.add(h); }
}
function setOutlines(root, on) { root.traverse(o => { if (o.userData.isHull) o.visible = on; }); }
const bulbGeo = new THREE.SphereGeometry(.07, 16, 12), coneGeo = new THREE.ConeGeometry(.12, .22, 16, 1, true);
function makeLight(type, pos) {
  const color = LIGHT_COLORS.calida[1];
  const light = type === 'foco' ? new THREE.SpotLight(color, 2.2, 14, 32 * DEG, .45, 1.4) : new THREE.PointLight(color, 1.6, 10, 1.6);
  const bulb = new THREE.Mesh(bulbGeo, new THREE.MeshBasicMaterial({color})); bulb.userData.lightRoot = null;
  const g = new THREE.Group(); g.position.copy(pos); g.add(light, bulb);
  if (type === 'foco') { const c = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({color: 0x2c2a28, side: THREE.DoubleSide})); c.rotation.x = Math.PI / 2; c.userData.aim = true; g.add(c); scene.add(light.target); }
  g.userData = {light: type, ref: {light, bulb}, color: 'calida'}; bulb.userData.lightRoot = g;
  scene.add(g); extraLights.push(g); return g;
}

/* ---------- IK handles ---------- */
const handleGeo = new THREE.SphereGeometry(1, 16, 12);
const handles = {};
for (const id of ['handL', 'handR', 'footL', 'footR', 'hips']) {
  const m = new THREE.Mesh(handleGeo, new THREE.MeshBasicMaterial({color: 0xb0432c, depthTest: false, transparent: true, opacity: .9}));
  m.renderOrder = 999; m.userData.id = id; scene.add(m); handles[id] = m;
}
// joint dots: an ink ring around a paper centre, drawn on top so every joint reads clearly
const jointDots = {}, dotGeo = new THREE.SphereGeometry(1, 14, 10);
const DOT_INK = new THREE.MeshBasicMaterial({color: 0x2a2620, depthTest: false, transparent: true, opacity: .85});
const DOT_FILL = new THREE.MeshBasicMaterial({color: 0xf2ede1, depthTest: false, transparent: true});
const DOT_SEL = new THREE.MeshBasicMaterial({color: 0x2b5a9e, depthTest: false, transparent: true});
for (const n of DOT_JOINTS) {
  const ring = new THREE.Mesh(dotGeo, DOT_INK), fill = new THREE.Mesh(dotGeo, DOT_FILL);
  ring.renderOrder = 997; fill.renderOrder = 998; fill.scale.setScalar(.62); ring.add(fill);
  ring.userData.joint = n; fill.userData.joint = n; fill.raycast = () => {};
  scene.add(ring); jointDots[n] = ring;
}
const grid = new THREE.GridHelper(12, 24, 0x6d6555, 0xb9ad94);
grid.material.transparent = true; grid.material.opacity = .45; grid.position.y = .003; scene.add(grid);
const skyMat = new THREE.MeshBasicMaterial({vertexColors: true, side: THREE.BackSide, fog: false});
const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), skyMat); scene.add(sky);
