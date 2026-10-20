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
  if (typeof animCharRemoved === 'function') animCharRemoved(i);
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
  if (m.body.name) return m.body.name;  // saved characters keep their name
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
    b.onclick = () => castAddMenu(b); bar.appendChild(b);
  }
  const list = $('#castList'); list.innerHTML = '';
  const c2 = bar.cloneNode(true); c2.className = 'chips';
  [...c2.children].forEach((b, i) => b.onclick = bar.children[i].onclick);
  list.appendChild(c2);
  $('#bodyWho').textContent = tr('personaje {n}', {n: active + 1});
  $('#delChar').disabled = chars.length <= 1; $('#delChar').textContent = tr('Quitar a {x}', {x: charLabel(mq)});
}

/* ---------- applying poses to the cast ---------- */
function usePreset(p) {
  tourEvent('pose');
  const yaw = mq.yaw(), pos = mq.joints.hips.position.clone(), prev = mq.getPose();
  mq.joints.hips.position.set(pos.x, mq.rootY, pos.z);
  applyPreset(mq, p, {yaw});
  mq.joints.hips.position.x = pos.x; mq.joints.hips.position.z = pos.z;
  if (typeof accessKit === 'function' && (p.kit || props.some(g => g.userData.ride && g.userData.ride.m === mq))) accessKit(mq, p.kit);  // crutches, stick, frame or wheelchair
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
  const reach = () => { for (const k of def.ik) {
    const m = list[k.c], t = k.pt ? new V3(k.pt[0] * avg, k.pt[1] * avg, k.pt[2] * avg) : ikTarget(list[k.tc], k.t, k.o);
    solveSpec(m, k, t);
  } };
  reach();
  // characters of different sizes can end up inside each other: push the trunks apart, then reach again
  if (separateTrunks(list.slice(0, def.n))) { list.forEach(m => m.group.updateMatrixWorld(true)); reach(); }
}
// trunk of each character as a capsule (pelvis to neck), and the head as a ball; overlapping pairs move apart on the floor
function separateTrunks(list) {
  let moved = false;
  for (let it = 0; it < 4; it++) {
    let any = false;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const A = list[i], B = list[j], w = (m, n) => m.joints[n].getWorldPosition(new V3());
      const segs = m => [[w(m, 'hips'), w(m, 'neck'), .11 * m.size], [w(m, 'head'), w(m, 'head'), .1 * m.size]];
      let worst = 0, dir = null;
      for (const [a0, a1, ra] of segs(A)) for (const [b0, b1, rb] of segs(B)) {
        const d = segSegDist(a0, a1, b0, b1), pen = ra + rb - d;
        if (pen > worst) { worst = pen; dir = w(B, 'hips').sub(w(A, 'hips')); }
      }
      if (worst > .01 && dir) {
        dir.y = 0; if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0); dir.normalize().multiplyScalar(worst / 2 + .005);
        A.joints.hips.position.sub(dir); B.joints.hips.position.add(dir); A.group.updateMatrixWorld(true); B.group.updateMatrixWorld(true); any = moved = true;
      }
    }
    if (!any) break;
  }
  return moved;
}
function useGroup(def) {
  tourEvent('pose');
  // who the pose takes out of the scene or brings in, said with the way back
  const gone = chars.slice(def.n).map(m => nameOf(m)), added = Math.max(0, def.n - chars.length);
  ensureCount(def.n);
  applyGroupTo(chars, def);
  state.posePreset = def.id;
  setActive(Math.min(active, chars.length - 1));
  markPose(); frameAll(); pushHistory();
  let msg = null;
  if (gone.length) msg = tr('Pose de {n} personas: se ha quitado a {x}', {n: def.n, x: gone.join(', ')});
  else if (added) msg = trn(added, 'Pose de {n} personas: se ha añadido 1 personaje', 'Pose de {n} personas: se han añadido {k} personajes', {n: def.n, k: added});
  if (msg) toast(msg, {undo: true});
  return msg;
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
  return state.envReady = ready.then(() => { if (tok === envToken) buildEnv(id); }, err => { console.error(err); if (tok === envToken) { toast('No se ha podido cargar el escenario.'); buildEnv('vacio'); } });
}
/* Sets are kept once built (the last few), so going back to one, or cutting between scenes of a film, swaps it in at
   once instead of building it again; prepareEnv builds the next one ahead, off screen, and compiles its shaders. */
const ENV_KEEP = new Map(), ENV_KEEP_MAX = 4;
function disposeEnv(g) { const cached = new Set(Object.values(geoCache)); g.traverse(o => { if (o.isMesh && !o.userData.isHull && !cached.has(o.geometry) && !o.userData.shared) o.geometry.dispose(); if (o.isLight && o.shadow && o.shadow.map) o.shadow.map.dispose(); }); }
function makeEnvGroup(id) {
  const g = new THREE.Group(); g.userData.lamps = []; g.userData.envId = id;
  const S = SCENES[id];
  (S ? S.build : ENV_BUILD[id])(g);
  g.traverse(o => { if (o.isMesh && o.parent && o.parent.parent && o.parent.parent.userData.asset) o.userData.shared = true; });
  addOutlines(g); return g;
}
function keepEnv(id, g) {
  ENV_KEEP.delete(id); ENV_KEEP.set(id, g);
  while (ENV_KEEP.size > ENV_KEEP_MAX) { const [k, old] = ENV_KEEP.entries().next().value; ENV_KEEP.delete(k); if (old !== envGroup) disposeEnv(old); }
}
async function prepareEnv(id) {
  const S = SCENES[id]; if (!S || ENV_KEEP.has(id)) return;
  try { await Promise.all(S.assets.map(loadAsset)); } catch (_) { return; }
  if (ENV_KEEP.has(id)) return;
  const g = makeEnvGroup(id); keepEnv(id, g);
  try { renderer.compile(g, camera); } catch (_) {}
}
function buildEnv(id) {
  const S = SCENES[id];
  if (envGroup) scene.remove(envGroup);
  envGroup = ENV_KEEP.get(id) || makeEnvGroup(id); keepEnv(id, envGroup);
  setOutlines(envGroup, state.envOutline);
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
  if (typeof filmMoodLights === 'function') filmMoodLights();
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
// what covers the top and the bottom of the canvas (the cast chips and IK/FK, the hint): the cast is framed in the rest
function framePads() {
  const vr = vp.getBoundingClientRect(); let top = 14, bot = 12;
  for (const el of [$('#cast'), $('.modebar')]) { const r = el && el.getBoundingClientRect(); if (r && r.height) top = Math.max(top, r.bottom - vr.top + 10); }
  const h = $('#hint'); if (h && h.offsetParent && !h.classList.contains('quiet') && !document.body.classList.contains('anim')) bot = Math.max(bot, vr.bottom - h.getBoundingClientRect().top + 8);
  return {top, bot, H: camera.view && camera.view.enabled ? camera.view.fullHeight : vr.height};
}
// the cast chips keep clear of the IK/FK switch, however wide it is (0 while it is hidden); --toph is how far down the cast and the switch reach, so a toast moved to the top on phones sits under them, not beneath them
{ const mb = $('.modebar'), cast = $('#cast'); if (mb && window.ResizeObserver) { const ro = new ResizeObserver(() => { vp.style.setProperty('--mbw', mb.offsetWidth + 'px'); vp.style.setProperty('--toph', Math.max(cast ? cast.offsetTop + cast.offsetHeight : 0, mb.offsetTop + mb.offsetHeight) + 'px'); }); ro.observe(mb); if (cast) ro.observe(cast); } }
function frameView() {
  const box = castBox(), c = box.getCenter(new V3()), size = box.getSize(new V3());
  const dir = camera.position.clone().sub(controls.target).normalize(), {top, bot, H} = framePads(), tf = Math.tan(camera.fov * DEG / 2);
  // fit the bounding sphere in whichever field of view is narrower (portrait screens), inside the uncovered band
  const free = clamp((H - top - bot) / H, .4, 1), r = size.length() * .5, vf = 2 * Math.atan(tf * free), hf = 2 * Math.atan(tf * camera.aspect);
  const d = r / Math.sin(Math.min(vf, hf) / 2) * 1.04;
  // the band's middle sits lower than the canvas centre when the top is more covered: aim a little above the cast
  const up = new V3(0, 1, 0).addScaledVector(dir, -dir.y), t = c.clone();
  if (up.lengthSq() > .01) t.addScaledVector(up.normalize(), (top - bot) / H * d * tf);
  const p = t.clone().addScaledVector(dir, d); if (p.y < .06) p.y = .06;
  return {p, t};
}
// smooth: the camera travels there (a third of a second) instead of jumping
const CAMG = {go: null};
function frameAll(smooth) {
  const {p, t} = frameView();
  if (smooth === true && !matchMedia('(prefers-reduced-motion: reduce)').matches) { CAMG.go = {p0: camera.position.clone(), t0: controls.target.clone(), p, t, s: performance.now()}; return; }
  CAMG.go = null; controls.target.copy(t); camera.position.copy(p); controls.update(); viewOK = true;
}
function camGlideTick() {
  const g = CAMG.go; if (!g) return;
  const k = Math.min(1, (performance.now() - g.s) / 340), e = 1 - Math.pow(1 - k, 3);
  controls.target.lerpVectors(g.t0, g.t, e); camera.position.lerpVectors(g.p0, g.p, e);
  if (k >= 1) { CAMG.go = null; viewOK = true; }
}
// is the whole cast inside the uncovered part of the canvas?
function castInView() {
  const {top, bot} = framePads(), r = canvas.getBoundingClientRect(), vr = vp.getBoundingClientRect(), b = castBox(), H = camera.view && camera.view.enabled ? camera.view.fullHeight : r.height;
  for (let i = 0; i < 8; i++) {
    const v = new V3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).project(camera);
    const x = (v.x + 1) / 2 * r.width, y = (1 - v.y) / 2 * r.height + r.top - vr.top;
    if (v.z > 1 || x < 2 || x > r.width - 2 || y < top - 6 || y > Math.min(H, r.height) - bot + 6) return false;
  }
  return true;
}
/* when the cast grows, a body changes (a wolf's ears, a taller build) or the film dock opens, the framing is checked
   once things have settled: if everyone was in view before and someone no longer is, the camera makes room. A camera
   the user has moved in close (viewOK false) is left alone. */
let viewOK = true, reframeT = [];
controls.addEventListener('start', () => { CAMG.go = null; });
controls.addEventListener('end', () => { viewOK = castInView(); });
function reframeSoon() {
  if (!viewOK) return; reframeT.forEach(clearTimeout);
  reframeT = [400, 1600].map(ms => setTimeout(() => { if (viewOK && !practice.active && !ANIM.playing && !castInView()) frameAll(true); }, ms));
}
function setFocal(mm, dolly) {
  const old = state.focal;
  camera.setFocalLength(mm); camera.updateProjectionMatrix();
  if (dolly) { const dir = camera.position.clone().sub(controls.target).multiplyScalar(mm / old); camera.position.copy(controls.target).add(dir); if (camera.position.y < .06) camera.position.y = .06; controls.update(); }
  state.focal = mm; $('#focalOut').textContent = Math.round(mm) + ' mm';
  const lt = $('#lensTicks'); if (lt) setPressed(lt, Math.round(mm));  // (Objetivo's chip of that lens, when it is one of them, shows pressed)
}
