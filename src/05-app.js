/* ---------- state ---------- */
const state = {roll: 0, 
  style: 'construccion', lineMode: 'anillos', lineA: .8, outline: 1.6,
  light: {...LIGHTS.estudio}, lightPreset: 'estudio', env: 'estudio', practical: 1, lampShadows: true, ik: store.get('cdp.ik', true), dots: store.get('cdp.dots', true), amb: 'neutro', envOutline: true, shadows: true,
  focal: 50, handSide: 'both', selected: null, sel: null, propMode: 'translate', castN: 1, cat: 'todas', posePreset: null,
  guides: {thirds: false, persp: false, grid: true, ruler: false, action: false},
  form: 'figura', ratio: 'libre', tab: 'pose', views: [], sym: false
};
const chars = [];
let mq = null, active = 0;
const OUTDOOR = ['calle', 'bosque', 'ruinas', 'escalinata', 'azotea', 'playa'];

/* ---------- characters ---------- */
function makeStool() {
  const g = new THREE.Group();
  const seat = mk(G.cyl(28), EM.wood, 0, 0, 0, .19, .045, .19), leg = mk(G.cyl(12), EM.dark, 0, 0, 0, .04, 1, .04), base = mk(G.cyl(24), EM.dark, 0, .015, 0, .17, .03, .17);
  g.add(seat, leg, base); g.userData = {seat, leg}; g.visible = false; addOutlines(g); return g;
}
function freeX(self) {
  const xs = chars.filter(c => c !== self).map(c => c.joints.hips.position.x);
  for (const cand of [0, .9, -.9, 1.8, -1.8, 2.7, -2.7]) if (xs.every(v => Math.abs(v - cand) > .6)) return cand;
  return 0;
}
function addChar(presetId = 'hombre', body = null, withPose = true) {
  if (chars.length >= MAX_CHARS) return null;
  const m = new Mannequin(makeCharMats(), state.style);
  m.outlineOn = state.outline > 0 && state.style !== 'silueta'; m.formMode = state.form;
  m.build(body || bodyOf(presetId));
  m.bodyPreset = body ? null : presetId;
  scene.add(m.group);
  m.stoolMesh = makeStool(); scene.add(m.stoolMesh);
  chars.push(m);
  if (withPose) { m.joints.hips.position.set(freeX(m), m.rootY, 0); applyPreset(m, POSE.contra); }
  return m;
}
function removeChar(i) {
  if (chars.length <= 1) return;
  const m = chars[i];
  for (const p of props) if (p.userData.held && p.userData.held.m === m) releaseProp(p);
  scene.remove(m.group); scene.remove(m.stoolMesh);
  for (const x of m.acc) if (!x.userData.hull) x.geometry.dispose();
  m.geo.dispose(); m.skeleton.dispose(); m.accSkeleton.dispose();
  chars.splice(i, 1);
  setActive(Math.min(active, chars.length - 1));
}
function setActive(i) {
  active = clamp(i, 0, chars.length - 1); mq = chars[active];
  select(null); renderCast(); syncAll();
}
function ensureCount(n) {
  while (chars.length < n) addChar(['mujer', 'hombre', 'mujer', 'hombre'][chars.length], null, false);
  while (chars.length > n) removeChar(chars.length - 1);
}
const charLabel = m => {
  const base = m.bodyPreset ? BODY_PRESETS[m.bodyPreset].label : tr('Personalizado');
  return m.body.species !== 'humano' ? `${base} · ${SPECIES[m.body.species].label}` : base;
};
function renderCast() {
  const bar = $('#cast'); bar.innerHTML = '';
  chars.forEach((m, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip';
    b.setAttribute('aria-pressed', String(i === active)); b.textContent = `${i + 1} · ${charLabel(m)}`;
    b.title = tr('Hacer activo'); b.onclick = () => setActive(i); bar.appendChild(b);
  });
  if (chars.length < MAX_CHARS) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip add'; b.textContent = tr('+ Personaje');
    b.onclick = () => { const m = addChar(chars.length % 2 ? 'mujer' : 'hombre'); if (m) { setActive(chars.length - 1); pushHistory(); buildPoseGrid(); } }; bar.appendChild(b);
  }
  const list = $('#castList'); list.innerHTML = '';
  const c2 = bar.cloneNode(true); c2.className = 'chips';
  [...c2.children].forEach((b, i) => b.onclick = bar.children[i].onclick);
  list.appendChild(c2);
  $('#bodyWho').textContent = tr('personaje {n}', {n: active + 1});
  $('#delChar').disabled = chars.length <= 1;
}

/* ---------- applying poses to the cast ---------- */
function usePreset(p) {
  tourEvent('pose');
  const yaw = mq.yaw(), pos = mq.joints.hips.position.clone(), prev = mq.getPose();
  mq.joints.hips.position.set(pos.x, mq.rootY, pos.z);
  applyPreset(mq, p, {yaw});
  mq.joints.hips.position.x = pos.x; mq.joints.hips.position.z = pos.z;
  state.posePreset = p.id; $('#stoolChk').checked = mq.stool;
  markPose(); syncAll(); offerBlend(prev); pushHistory();
}
function applyGroupTo(list, def, o = {}) {
  const avg = list.slice(0, def.n).reduce((s, m) => s + m.size, 0) / def.n;
  def.chars.forEach((c, i) => {
    const m = list[i];
    m.joints.hips.position.set(0, m.rootY, 0);
    applyPreset(m, POSE[c.p], {yaw: c.yaw * DEG, variation: o.variation});
    m.joints.hips.position.x = c.x * avg; m.joints.hips.position.z = c.z * avg;
  });
  list.forEach(m => m.group.updateMatrixWorld(true));
  for (const k of def.ik) {
    const m = list[k.c], t = k.pt ? new V3(k.pt[0] * avg, k.pt[1] * avg, k.pt[2] * avg) : ikTarget(list[k.tc], k.t, k.o);
    solveSpec(m, k, t);
  }
}
function useGroup(def) {
  tourEvent('pose');
  ensureCount(def.n);
  applyGroupTo(chars, def);
  state.posePreset = def.id;
  setActive(Math.min(active, chars.length - 1));
  markPose(); frameAll(); pushHistory();
}

/* ---------- environment and ambience ---------- */
let envGroup = null, envToken = 0;
const isOutdoor = id => SCENES[id] ? !!SCENES[id].out : OUTDOOR.includes(id);
function setEnv(id) {
  if (typeof TOUR !== 'undefined' && TOUR.on && id !== state.env) tourEvent('env');
  if (!SCENES[id] && !ENV_BUILD[id]) id = 'estudio';
  const tok = ++envToken, S = SCENES[id];
  state.env = id;
  const ready = S ? Promise.all(S.assets.map(loadAsset)) : Promise.resolve();
  if (S && S.assets.some(a => !SETS[a])) toast('Cargando escenario…');
  return ready.then(() => { if (tok === envToken) buildEnv(id); }, err => { console.error(err); if (tok === envToken) { toast('No se ha podido cargar el escenario.'); buildEnv('vacio'); } });
}
function buildEnv(id) {
  if (envGroup) {
    scene.remove(envGroup);
    const cached = new Set(Object.values(geoCache));
    envGroup.traverse(o => { if (o.isMesh && !o.userData.isHull && !cached.has(o.geometry) && !o.userData.shared) o.geometry.dispose(); if (o.isLight && o.shadow && o.shadow.map) o.shadow.map.dispose(); });
  }
  envGroup = new THREE.Group(); envGroup.userData.lamps = [];
  const S = SCENES[id];
  (S ? S.build : ENV_BUILD[id])(envGroup);
  envGroup.traverse(o => { if (o.isMesh && o.parent && o.parent.parent && o.parent.parent.userData.asset) o.userData.shared = true; });
  addOutlines(envGroup); setOutlines(envGroup, state.envOutline);
  scene.add(envGroup); collectOccluders();
  state.guides.grid = id === 'vacio'; grid.visible = state.guides.grid; const gg = $('#gGrid'); if (gg) gg.checked = state.guides.grid;
  const want = S && S.amb ? S.amb : null;
  if (want && state.ambAuto !== false && state.amb !== want) { state.amb = want; setPressed($('#ambChips'), state.amb); }
  else if (state.amb === 'neutro' && id !== 'estudio' && id !== 'vacio') { state.amb = isOutdoor(id) ? 'dia' : 'interior'; setPressed($('#ambChips'), state.amb); }
  applyAmbient();
}
function applyAmbient() {
  const A = AMBIENTS[state.amb], out = isOutdoor(state.env), stage = col('--stage');
  sky.visible = out;
  const top = new THREE.Color(A.top), hor = new THREE.Color(A.hor);
  const g = sky.geometry, p = g.attributes.position, cols = [];
  for (let i = 0; i < p.count; i++) { const t = clamp(p.getY(i) / 300, 0, 1); const c = hor.clone().lerp(top, Math.pow(t, .5)); cols.push(c.r, c.g, c.b); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const bg = state.amb === 'neutro' ? stage : new THREE.Color(A.fog).multiplyScalar(out ? 1 : .8);
  scene.background = out ? null : bg;
  scene.fog = state.env === 'vacio' ? null : out ? new THREE.Fog(A.fog, 35, 220) : new THREE.Fog(bg, 11, 42);
  if (LU.uRender.value > 0) { // pencil and value studies sit on plain paper
    sky.visible = false; scene.background = LU.uPaper.value.clone();
    scene.fog = state.env === 'vacio' ? null : new THREE.Fog(LU.uPaper.value.clone(), out ? 25 : 11, out ? 90 : 42);
  }
  hemi.color.set(A.hemiS); hemi.groundColor.set(A.hemiG); key.color.set(A.keyCol);
  if (typeof panoAmbient === 'function') panoAmbient();
  const pr = A.practical;
  for (const mat of EMISSIVE) mat.emissiveIntensity = mat.userData.night ? Math.max(0, pr - .3) * 1.3 : pr * (mat === EM.glass ? .8 : 1.1);
  if (envGroup) for (const l of envGroup.userData.lamps) { l.userData.base = l.userData.power * (l.userData.studio ? 1 : pr) * state.practical; l.intensity = l.userData.base; l.visible = l.userData.base > .01; l.castShadow = !!l.userData.sh0 && state.lampShadows; }
}

// flickering fires and candles
function envTick() {
  if (!envGroup) return; const t = performance.now() / 1000;
  for (const l of envGroup.userData.lamps) if (l.userData.flicker && l.userData.base) l.intensity = l.userData.base * (1 + l.userData.flicker * (Math.sin(t * 13.1 + l.id) * .5 + Math.sin(t * 7.3 + l.id * 2) * .3 + Math.sin(t * 23.7) * .2));
}

/* ---------- theme ---------- */
const col = n => new THREE.Color(css(n) || '#000');
let themeInk = {};
function applyTheme() {
  EM.floor.color.copy(col('--floor')); EM.wall.color.copy(col('--page'));
  handles.hips.material.color.copy(col('--blue'));
  ['handL', 'handR', 'footL', 'footR'].forEach(id => handles[id].material.color.copy(col('--red')));
  const c1 = col('--ink-soft'), c2 = col('--line'), a = grid.geometry.attributes.color;
  for (let i = 0; i < a.count; i++) { const c = Math.floor(i / 4) === 12 ? c1 : c2; a.setXYZ(i, c.r, c.g, c.b); }
  a.needsUpdate = true;
  themeInk = {ink: css('--ink'), soft: css('--ink-soft'), blue: css('--blue'), red: css('--red'), page: css('--page')};
  applyAmbient();
}
new MutationObserver(applyTheme).observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme']});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

/* ---------- lighting ---------- */
function camAzimuth() { const d = camera.position.clone().sub(controls.target); return Math.atan2(d.x, d.z) / DEG; }
const castCenter = new V3(), _hp = new V3();
function updateLights() {
  const L = state.light, A = AMBIENTS[state.amb];
  castCenter.set(0, 0, 0);
  for (const m of chars) castCenter.add(m.joints.hips.getWorldPosition(_hp));
  castCenter.multiplyScalar(1 / chars.length); castCenter.y = Math.max(castCenter.y * .9, .4);
  const az = L.az * DEG, el = L.el * DEG;
  key.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(9).add(castCenter);
  key.target.position.copy(castCenter);
  rim.position.set(-Math.sin(az) * .8, .5, -Math.cos(az) * .8).multiplyScalar(9).add(castCenter);
  rim.target.position.copy(castCenter);
  key.intensity = L.key * A.key; hemi.intensity = L.fill * A.fill; rim.intensity = L.rim * A.fill;
  key.shadow.radius = L.soft; key.castShadow = state.shadows;
  for (const g of extraLights) {
    const {light} = g.userData.ref;
    if (light.isSpotLight) { light.target.position.copy(castCenter); g.children.find(c => c.userData.aim)?.lookAt(castCenter); }
  }
}
function setLightPreset(id) {
  const p = LIGHTS[id]; state.lightPreset = id;
  let az = camAzimuth() + p.az; az = ((az + 540) % 360) - 180;
  state.light = {...p, az: Math.round(az)}; syncLightUI();
}

/* ---------- camera ---------- */
function setView(az, el) {
  const t = controls.target, d = camera.position.distanceTo(t);
  const a = az * DEG + mq.yaw(), e = el * DEG;
  const p = new V3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)).multiplyScalar(d).add(t);
  if (p.y < .06) p.y = .06;
  camera.position.copy(p); controls.update();
}
function castBox(step = 10) { const b = new THREE.Box3(); for (const m of chars) b.union(m.box(step)); return b; }
function frameAll() {
  const box = castBox(), c = box.getCenter(new V3()), size = box.getSize(new V3());
  const dir = camera.position.clone().sub(controls.target).normalize();
  // fit the bounding sphere in whichever field of view is narrower (portrait screens)
  const r = size.length() * .5, vf = camera.fov * DEG, hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
  const d = r / Math.sin(Math.min(vf, hf) / 2) * .92;
  controls.target.copy(c); camera.position.copy(c).addScaledVector(dir, d);
  if (camera.position.y < .06) camera.position.y = .06;
  controls.update();
}
function setFocal(mm, dolly) {
  const old = state.focal;
  camera.setFocalLength(mm); camera.updateProjectionMatrix();
  if (dolly) { const dir = camera.position.clone().sub(controls.target).multiplyScalar(mm / old); camera.position.copy(controls.target).add(dir); if (camera.position.y < .06) camera.position.y = .06; controls.update(); }
  state.focal = mm; $('#focalOut').textContent = Math.round(mm) + ' mm';
}
