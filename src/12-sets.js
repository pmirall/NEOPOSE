/* ---------- scenery v2: Poly Haven (CC0) models and textures, practical lights ---------- */
// Models are packed with gltfpack (meshopt + WebP, diffuse only) and shipped as base64 text in envs/.
const SETS = {assets: new Map(), tex: new Map(), mats: new Map()};
const gltfLoader = new THREE.GLTFLoader(); gltfLoader.setMeshoptDecoder(MeshoptDecoder);
// assets travel in one JSON bundle per scene (see envassets/bundle.py); textures in envs/b/tex.json
const BUNDLES = new Map();
function envBundle(name) {
  if (!BUNDLES.has(name)) { const p = fetch(`envs/b/${name}.json`).then(r => { if (!r.ok) throw new Error(name + ' ' + r.status); return r.json(); }); BUNDLES.set(name, p); p.catch(() => BUNDLES.delete(name)); }
  return BUNDLES.get(name);
}
const b64buf = s => { const bin = atob(s.trim()), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8.buffer; };
// sketch-friendly copy of a glTF material: keeps the colour map, drops PBR extras, alpha cards use alpha test
function setMaterial(m) {
  const cut = m.transparent || m.alphaTest > 0 || (m.map && m.name && /leaf|leaves|twig|foliage|needle|branch/i.test(m.name) && m.alphaTest > 0);
  const n = patchEnv(new THREE.MeshStandardMaterial({color: m.color, map: m.map || null, roughness: .9, metalness: Math.min(m.metalness || 0, .35),
    side: cut || m.side === THREE.DoubleSide ? THREE.DoubleSide : THREE.FrontSide, alphaTest: cut ? .45 : 0, transparent: false}));
  if (n.map) n.map.encoding = THREE.LinearEncoding;
  n.userData.cut = cut; n.name = m.name;
  return n;
}
function loadAsset(id) {
  if (SETS.assets.has(id)) return SETS.assets.get(id);
  const p = envBundle(ENV_MANIFEST[id] || 'props').then(b => { if (!b[id]) throw new Error('missing asset ' + id); return b[id]; })
    .then(t => new Promise((res, rej) => gltfLoader.parse(b64buf(t), '', res, rej)))
    .then(gl => {
      const root = gl.scene, mm = new Map();
      root.traverse(o => {
        if (!o.isMesh) return;
        if (!mm.has(o.material)) mm.set(o.material, setMaterial(o.material));
        o.material = mm.get(o.material); o.castShadow = o.receiveShadow = true;
        if (o.material.userData.cut) {
          o.userData.noOutline = true;
          o.customDepthMaterial = new THREE.MeshDepthMaterial({depthPacking: THREE.RGBADepthPacking, map: o.material.map, alphaTest: .45});
        }
      });
      root.updateMatrixWorld(true);
      SETS.assets.set(id, Promise.resolve(root)); SETS[id] = root; return root;
    });
  SETS.assets.set(id, p); p.catch(() => SETS.assets.delete(id));
  return p;
}
// tileable textures (diffuse only, 512px WebP)
function setTex(name) {
  if (SETS.tex.has(name)) return SETS.tex.get(name);
  const t = new THREE.Texture(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.encoding = THREE.LinearEncoding;
  envBundle('tex').then(b => { const img = new Image(); img.onload = () => { t.image = img; t.needsUpdate = true; }; img.src = 'data:image/webp;base64,' + b[name]; });
  SETS.tex.set(name, t); return t;
}
// material from a texture, optionally tinted (multiplied)
function T(name, tint = 0xffffff, o = {}) {
  const k = name + tint + JSON.stringify(o);
  if (!SETS.mats.has(k)) SETS.mats.set(k, patchEnv(new THREE.MeshStandardMaterial({map: setTex(name), color: tint, roughness: o.r ?? .92, metalness: o.m ?? 0, ...(o.e ? {emissive: o.e, emissiveIntensity: 0} : {})})));
  return SETS.mats.get(k);
}
// UVs in metres: one texture tile covers `tile` metres
function tileUV(geo, w, h, d, tile) {
  const uv = geo.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * dims[f][0] / tile, uv.getY(k) * dims[f][1] / tile); }
  return geo;
}
function tbox(p, mat, w, h, d, x, y, z, tile = 2, ry = 0) {
  const m = new THREE.Mesh(tileUV(new THREE.BoxGeometry(w, h, d), w, h, d, tile), mat);
  m.position.set(x, y + h / 2, z); m.rotation.y = ry; m.castShadow = m.receiveShadow = true; p.add(m); return m;
}
function tplane(p, mat, w, d, x = 0, y = 0, z = 0, tile = 2) {
  const g = new THREE.PlaneGeometry(w, d), uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tile, uv.getY(i) * d / tile);
  const m = new THREE.Mesh(g, mat); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true; m.userData.noOutline = true; m.userData.ground = true; p.add(m); return m;
}
// place a model: centred on x/z, resting on y; `node` keeps only matching child nodes (kits ship several variants)
function A(p, id, x, z, ry = 0, o = {}) {
  const src = SETS[id]; if (!src) { console.warn('asset not loaded', id); return new THREE.Group(); }
  const keep = o.node ? (Array.isArray(o.node) ? o.node : [o.node]) : null;
  const inner = new THREE.Group();
  for (const c of src.children) if (!keep || keep.some(k => k instanceof RegExp ? k.test(c.name) : c.name === k)) inner.add(c.clone());
  const s = o.s || 1; inner.scale.setScalar(s);
  if (o.rx) inner.rotation.x = o.rx; if (o.rz) inner.rotation.z = o.rz;
  inner.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(inner);
  if (o.h) { const k = o.h / (bb.max.y - bb.min.y); inner.scale.multiplyScalar(k); inner.updateMatrixWorld(true); bb.setFromObject(inner); }
  const c = bb.getCenter(new V3());
  inner.position.set(o.raw ? 0 : -c.x, o.top !== undefined ? -bb.max.y : o.raw ? 0 : -bb.min.y, o.raw ? 0 : -c.z);
  const g = new THREE.Group(); g.add(inner);
  g.position.set(x, o.top !== undefined ? o.top : (o.y || 0), z); g.rotation.y = ry;
  if (o.noShadow) g.traverse(m => { if (m.isMesh) m.castShadow = false; });
  g.userData.asset = id; p.add(g); g.updateMatrixWorld(true); return g;
}
// heights of the surfaces under (x, z) of an object, top first: lets things sit on tables and shelves
const _ray = new THREE.Raycaster();
function surfaces(obj, x, z, from = 10) {
  obj.updateMatrixWorld(true); _ray.set(new V3(x, from, z), new V3(0, -1, 0));
  const hits = _ray.intersectObject(obj, true).filter(h => h.face && h.face.normal.clone().transformDirection(h.object.matrixWorld).y > .7);
  const ys = []; for (const h of hits) if (!ys.length || ys[ys.length - 1] - h.point.y > .04) ys.push(h.point.y);
  return ys;
}
const topOf = (obj, x, z) => (surfaces(obj, x, z)[0] ?? 0);
// practical lights: spots pointing down from lamps, or warm points; scaled by the time of day and the scenery-light slider
function L(e, x, y, z, o = {}) {
  const c = o.c ?? 0xffcf8a, spot = o.to || o.spot;
  const l = spot ? new THREE.SpotLight(c, 0, o.d ?? 12, (o.ang ?? 60) * DEG, o.pen ?? .6, o.decay ?? 1.4) : new THREE.PointLight(c, 0, o.d ?? 8, o.decay ?? 1.6);
  l.position.set(x, y, z);
  if (spot) { const t = o.to || [x, 0, z]; l.target.position.set(t[0], t[1], t[2]); e.add(l.target); }
  if (o.sh) { l.castShadow = true; l.shadow.mapSize.set(1024, 1024); l.shadow.bias = -.0006; l.shadow.normalBias = .03; l.shadow.radius = 3; if (l.shadow.camera) { l.shadow.camera.near = .1; l.shadow.camera.far = o.d ?? 12; } }
  l.userData.power = o.i ?? 1; l.userData.sh0 = !!o.sh; l.userData.studio = !!o.studio; l.userData.flicker = o.flicker || 0;
  e.add(l); e.userData.lamps.push(l);
  if (o.bulb) { const b = new THREE.Mesh(G.sph(), EM.lamp); b.position.set(x, y, z); b.scale.setScalar(o.bulb); b.castShadow = false; b.userData.noOutline = true; e.add(b); }
  return l;
}
// a three-walled set (open towards +z so the camera can orbit), with skirting and an optional window in the left wall
function room(e, o) {
  const {w = 8, d = 7, h = 2.9, floor, wall, ft = 1.5, wt = 2.5, z0 = .5} = o, back = z0 - d / 2, cz = z0;
  tplane(e, T(floor, o.ftint), w, d, 0, 0, cz, ft);
  const W = T(wall, o.wtint);
  tbox(e, W, w, h, .14, 0, 0, back - .07, wt).userData.noOutline = true;
  for (const sx of [-1, 1]) {
    if (o.sides === false || (o.noRight && sx > 0)) continue;
    const x = sx * (w / 2 + .07);
    if (o.window && sx < 0) {
      const [wz, ww, wy, wh] = o.window; // centre z, width, sill height, height
      const z1 = wz - ww / 2, z2 = wz + ww / 2, zs = back, ze = back + d;
      tbox(e, W, .14, h, z1 - zs, x, 0, (zs + z1) / 2, wt).userData.noOutline = true;
      tbox(e, W, .14, h, ze - z2, x, 0, (z2 + ze) / 2, wt).userData.noOutline = true;
      tbox(e, W, .14, wy, ww, x, 0, wz, wt).userData.noOutline = true;
      tbox(e, W, .14, h - wy - wh, ww, x, wy + wh, wz, wt).userData.noOutline = true;
      const gl = box(e, EM.glass, .03, wh, ww, x, wy, wz); gl.castShadow = false; gl.userData.noOutline = true;
      box(e, EM.white, .22, .05, ww + .1, x + .05, wy - .05, wz); box(e, EM.white, .06, wh, .06, x + .03, wy, wz);
      box(e, EM.white, .06, .06, ww, x + .03, wy + wh / 2, wz);
    } else tbox(e, W, .14, h, d, x, 0, cz, wt).userData.noOutline = true;
  }
  if (o.skirt !== false) {
    const sk = o.skirtMat || EM.white;
    box(e, sk, w, .1, .03, 0, 0, back + .015).castShadow = false;
    for (const sx of [-1, 1]) if (o.sides !== false && !(o.noRight && sx > 0)) box(e, sk, .03, .1, d, sx * (w / 2 - .015), 0, cz).castShadow = false;
  }
  return {back, left: -w / 2, right: w / 2, front: back + d, h};
}
// pendant lamp hanging from the ceiling: model + cord + spot down
function pendant(e, id, x, z, h, o = {}) {
  const g = A(e, id, x, z, o.ry || 0, {top: h - (o.drop || 0), s: o.s, node: o.node});
  const bb = new THREE.Box3().setFromObject(g);
  if (o.drop) { const c = cyl(e, EM.black, .006, o.drop, x, h - o.drop, z, 4); c.castShadow = false; }
  L(e, x, bb.min.y + (o.ly || .05), z, {to: [x, 0, z], ang: o.ang ?? 62, pen: .7, i: o.i ?? 1.2, d: o.d ?? 9, c: o.c, sh: o.sh, bulb: o.bulb});
  return g;
}
function rug(e, mat, w, d, x, z, ry = 0) { const m = tbox(e, mat, w, .012, d, x, 0, z, 1, ry); m.castShadow = false; m.userData.noOutline = true; return m; }
// fabric curtain: a vertical sheet with folds
function curtain(e, mat, w, h, x, y, z, ry = 0, folds = 10, depth = .12) {
  const g = new THREE.PlaneGeometry(w, h, folds * 6, 1), p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) { p.setZ(i, Math.sin(p.getX(i) / w * folds * Math.PI * 2) * depth); uv.setXY(i, uv.getX(i) * w / 1.5, uv.getY(i) * h / 1.5); }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.material.side = THREE.DoubleSide; m.position.set(x, y + h / 2, z); m.rotation.y = ry; m.castShadow = m.receiveShadow = true; e.add(m); return m;
}
// ground-scatter helper: deterministic random positions outside a clear circle around the cast
// keeps a wedge towards +z free (where the camera usually is) unless open = true
function scatter(n, seed, rMin, rMax, fn, zBias = 0, open = false) {
  const r = rng(seed); let k = 0;
  for (let i = 0; i < n * 4 && k < n; i++) {
    const a = r() * Math.PI * 2, d = rMin + Math.sqrt(r()) * (rMax - rMin), x = Math.sin(a) * d, z = Math.cos(a) * d + zBias, rr = r();
    if (!open && z > -1 && Math.hypot(x, z) < 14 && Math.abs(x) < z * 1.4 + 4) continue;
    fn(x, z, rr, k++);
  }
}
// rows of books on every shelf of a bookcase (one instanced mesh, coloured spines)
const BOOK_MAT = patchEnv(new THREE.MeshStandardMaterial({roughness: .8}));
const BOOK_COLS = [0x7a2f2a, 0x2f4a6b, 0x3d5a3a, 0x8a6a3a, 0x5a3a5e, 0x2a2a2a, 0xa88f6a, 0x6b2420, 0x2c3e50, 0x9a7b4f, 0x4f6d7a, 0x7d5a44];
function fillShelf(e, shelf, x, z, ry, width, depth = .22, seed = 1, skipTop = true) {
  const ys = surfaces(shelf, x, z); if (skipTop) ys.shift();
  const r = rng(seed), n = ys.length * Math.ceil(width / .03), inst = new THREE.InstancedMesh(G.box(), BOOK_MAT, n), m4 = new THREE.Matrix4(), q = new Q(), c = new THREE.Color();
  const right = new V3(Math.cos(ry), 0, -Math.sin(ry)), fwd = new V3(Math.sin(ry), 0, Math.cos(ry)); let k = 0;
  for (let si = 0; si < ys.length; si++) {
    const y = ys[si], gap = si + 1 < ys.length ? ys[si] - ys[si + 1] : .4, room = si === 0 && !skipTop ? .3 : Math.min(.34, (si > 0 ? ys[si - 1] - y : .34) - .03);
    let t = -width / 2 + .02;
    while (t < width / 2 - .03 && k < n) {
      const w = .022 + r() * .035, h = Math.min(room, .17 + r() * .14), d = depth * (.8 + r() * .2);
      if (r() < .06) { t += .05 + r() * .1; continue; }
      const lean = r() < .08 ? .2 : 0;
      q.setFromAxisAngle(new V3(0, 1, 0), ry); if (lean) q.multiply(new Q().setFromAxisAngle(new V3(0, 0, 1), -lean));
      const p = new V3(x, y + h / 2, z).addScaledVector(right, t + w / 2).addScaledVector(fwd, (depth - d) / 2 - .02);
      m4.compose(p, q, new V3(w, h, d)); inst.setMatrixAt(k, m4); inst.setColorAt(k, c.setHex(BOOK_COLS[Math.floor(r() * BOOK_COLS.length)]).multiplyScalar(.75 + r() * .4)); k++;
      t += w + .002;
    }
  }
  inst.count = k; inst.castShadow = inst.receiveShadow = true; inst.userData.noOutline = true; e.add(inst); return inst;
}

// real objects for the props list: [label, asset, placement options]
const ASSET_PROPS = {
  r_sofa: ['Sofá', 'Sofa_01', {s: 1.25}], r_sillon: ['Sillón', 'ArmChair_01'], r_lounge: ['Butaca giratoria', 'mid_century_lounge_chair'],
  r_silla: ['Silla de comedor', 'dining_chair_02'], r_sillamad: ['Silla de madera', 'painted_wooden_chair_02'], r_plastico: ['Silla de plástico', 'plastic_monobloc_chair_01'],
  r_taburete: ['Taburete de bar', 'bar_chair_round_01'], r_banqueta: ['Banqueta', 'wooden_stool_01'], r_mecedora: ['Mecedora', 'Rockingchair_01'],
  r_mesa: ['Mesa de comedor', 'dining_table', {node: 'dining_table', s: .8}], r_mesaredonda: ['Mesa redonda', 'round_wooden_table_02'], r_mesacafe: ['Mesa baja', 'CoffeeTable_01', {s: .8}],
  r_escritorio: ['Escritorio', 'metal_office_desk'], r_pupitre: ['Pupitre', 'SchoolDesk_01'], r_cama: ['Cama', 'GothicBed_01'],
  r_banco: ['Banco de parque', 'painted_wooden_bench'], r_picnic: ['Mesa de picnic', 'wooden_picnic_table'], r_estanteria: ['Estantería', 'wooden_bookshelf_worn'],
  r_barril: ['Barril', 'wine_barrel_01', {node: /wine_barrel_01/}], r_cajamad: ['Caja de madera', 'wooden_crate_01'], r_carton: ['Caja de cartón', 'cardboard_box_01'],
  r_cofre: ['Cofre', 'treasure_chest'], r_escalera: ['Escalera de mano', 'wooden_ladder'], r_farola: ['Farola', 'street_lamp_01', {h: 4}],
  r_basura: ['Cubo de basura', 'metal_trash_can', {node: /^metal_trash_can(_lid|_handle_left|_handle_right)?$/}], r_coche: ['Coche tapado', 'covered_car'],
  r_arbol: ['Árbol', 'tree_small_02', {h: 4.5}], r_roca: ['Roca', 'namaqualand_boulder_05'], r_planta: ['Planta', 'potted_plant_02'],
  r_lampara: ['Lámpara de mesa', 'desk_lamp_arm_01'], r_farol: ['Farol', 'Lantern_01'], r_ukelele: ['Ukelele', 'Ukulele_01'],
  r_bate: ['Bate', 'baseball_bat'], r_balon: ['Balón', 'football', {node: 'football_inflated'}], r_katana: ['Katana', 'antique_katana_01'],
  r_escudo: ['Escudo', 'kite_shield', {node: /kite_shield/}], r_maleta: ['Maleta', 'vintage_suitcase', {node: /vintage_suitcase_01/}], r_camara: ['Cámara de fotos', 'Camera_01', {node: 'Camera_01'}],
  r_busto: ['Busto', 'marble_bust_01'], r_tele: ['Televisor', 'Television_01'], r_caballete: ['Pizarra', 'standing_chalkboard_01'], r_bidon: ['Bidón', 'Barrel_01'],
  r_hacha: ['Hacha', 'wooden_axe'], r_cubo: ['Cubo de madera', 'wooden_bucket_01'], r_neumatico: ['Neumático', 'old_tyre']
};

/* ---------- the scenery never hides the cast ----------
   Each frame, rays go from the camera to several joints of every character; any piece of scenery crossed by
   one (or with the camera inside it) is hidden until the view is clear again: the cutaway used by The Sims and
   third-person games. Pieces the character stands in or sits on (their box contains that joint) don't count. */
let OCC = [];
function occBox(o) {
  const b = new THREE.Box3(), t = new THREE.Box3(), m4 = new THREE.Matrix4();
  o.updateMatrixWorld(true);
  o.traverse(c => {
    if (!c.isMesh || c.userData.isHull) return;
    if (!c.geometry.boundingBox) c.geometry.computeBoundingBox();
    if (c.isInstancedMesh) for (let i = 0; i < c.count; i++) { c.getMatrixAt(i, m4); t.copy(c.geometry.boundingBox).applyMatrix4(m4).applyMatrix4(c.matrixWorld); b.union(t); }
    else { t.copy(c.geometry.boundingBox).applyMatrix4(c.matrixWorld); b.union(t); }
  });
  return b;
}
function collectOccluders() {
  for (const c of OCC) c.o.visible = true;
  OCC = [];
  if (!envGroup) return;
  for (const o of envGroup.children) {
    if (o.isLight || o.userData.ground || o.userData.noOcclude) continue;
    const b = occBox(o); if (b.isEmpty() || b.max.y < .12) continue;
    OCC.push({o, b, hidden: false});
  }
}
const _occRay = new THREE.Ray(), _occHit = new V3(), OCC_JOINTS = ['head', 'neck', 'chest', 'hips', 'wristL', 'wristR', 'elbowL', 'elbowR', 'kneeL', 'kneeR', 'ankleL', 'ankleR'];
let _occPts = [];
function updateOcclusion() {
  if (!OCC.length) return;
  const cam = camera.position; let n = 0;
  for (const m of chars) for (const j of OCC_JOINTS) { if (!m.joints[j]) continue; (_occPts[n] || (_occPts[n] = new V3())); m.joints[j].getWorldPosition(_occPts[n++]); }
  for (const c of OCC) {
    let block = c.b.containsPoint(cam);
    for (let i = 0; i < n && !block; i++) {
      const p = _occPts[i]; if (c.b.containsPoint(p)) continue;
      _occRay.origin.copy(cam); _occRay.direction.subVectors(p, cam); const d = _occRay.direction.length(); if (d < 1e-4) continue;
      _occRay.direction.multiplyScalar(1 / d);
      if (_occRay.intersectBox(c.b, _occHit) && _occHit.distanceTo(cam) < d - .04) block = true;
    }
    if (block !== c.hidden) { c.hidden = block; c.o.visible = !block; }
  }
}
