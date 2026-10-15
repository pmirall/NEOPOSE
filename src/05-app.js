/* ---------- state ---------- */
const state = {
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
  const yaw = mq.yaw(), pos = mq.joints.hips.position.clone();
  mq.joints.hips.position.set(pos.x, mq.rootY, pos.z);
  applyPreset(mq, p, {yaw});
  mq.joints.hips.position.x = pos.x; mq.joints.hips.position.z = pos.z;
  state.posePreset = p.id; $('#stoolChk').checked = mq.stool;
  markPose(); syncAll(); pushHistory();
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

/* ---------- overlay guides ---------- */
const _p = new V3();
function toScreen(v, w, h) { _p.copy(v).project(camera); return {x: (_p.x + 1) / 2 * w, y: (1 - _p.y) / 2 * h, z: _p.z}; }
function drawOverlay(ctx, w, h) {
  if (!ctx.noFrame) ctx.clearRect(0, 0, w, h);
  const g = state.guides; ctx.lineCap = 'round';
  if (g.thirds) {
    ctx.strokeStyle = themeInk.soft; ctx.globalAlpha = .55; ctx.lineWidth = 1; ctx.setLineDash([6, 5]); ctx.beginPath();
    for (const f of [1 / 3, 2 / 3]) { ctx.moveTo(w * f, 0); ctx.lineTo(w * f, h); ctx.moveTo(0, h * f); ctx.lineTo(w, h * f); }
    ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  if (g.persp) drawPerspective(ctx, w, h);
  if (g.ruler) drawRuler(ctx, w, h);
  if (g.action) drawAction(ctx, w, h);
  if (!ctx.noFrame) drawFrame(ctx, w, h);
}
function drawPerspective(ctx, w, h) {
  const cp = camera.position, fwd = camera.getWorldDirection(new V3());
  const proj = d => toScreen(cp.clone().addScaledVector(d, 1e4), w, h);
  const fh = new V3(fwd.x, 0, fwd.z);
  ctx.font = `13px ${css('--f-hand')}`;
  if (fh.lengthSq() > 1e-4) {
    fh.normalize(); const right = new V3(-fh.z, 0, fh.x);
    const a = proj(fh.clone().addScaledVector(right, .4).normalize()), b = proj(fh.clone().addScaledVector(right, -.4).normalize());
    const dx = b.x - a.x, dy = b.y - a.y;
    if (Math.abs(dx) > 1e-3) {
      const k = dy / dx, y0 = a.y - k * a.x, y1 = y0 + k * w;
      ctx.strokeStyle = themeInk.ink; ctx.globalAlpha = .7; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(w, y1); ctx.stroke();
      if (y0 > 14 && y0 < h - 6) { ctx.fillStyle = themeInk.ink; ctx.fillText(tr('horizonte'), 10, y0 - 6); }
      ctx.globalAlpha = 1;
    }
  }
  const yaw = mq.yaw(), R = Math.max(w, h);
  const axes = [[new V3(Math.cos(yaw), 0, -Math.sin(yaw)), themeInk.red], [new V3(Math.sin(yaw), 0, Math.cos(yaw)), themeInk.blue], [new V3(0, 1, 0), themeInk.soft]];
  for (let [d, color] of axes) {
    const dot = d.dot(fwd); if (Math.abs(dot) < .03) continue;
    if (dot < 0) d = d.clone().negate();
    const vpnt = proj(d), cx = w / 2 - vpnt.x, cy = h / 2 - vpnt.y, dist = Math.hypot(cx, cy);
    if (dist > R * 7) continue;
    const ux = cx / dist, uy = cy / dist, px = -uy, py = ux;
    ctx.strokeStyle = color; ctx.globalAlpha = .38; ctx.lineWidth = 1; ctx.beginPath();
    for (let i = -9; i <= 9; i++) {
      const tx = w / 2 + px * i * R / 12, ty = h / 2 + py * i * R / 12, ex = tx - vpnt.x, ey = ty - vpnt.y, el = Math.hypot(ex, ey) || 1;
      ctx.moveTo(vpnt.x, vpnt.y); ctx.lineTo(vpnt.x + ex / el * (dist + R * 2), vpnt.y + ey / el * (dist + R * 2));
    }
    ctx.stroke(); ctx.globalAlpha = 1;
    if (vpnt.x > -10 && vpnt.x < w + 10 && vpnt.y > -10 && vpnt.y < h + 10) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(vpnt.x, vpnt.y, 4, 0, Math.PI * 2); ctx.fill(); }
  }
}
let _box = new THREE.Box3(), _boxT = 0;
function drawRuler(ctx, w, h) {
  const now = performance.now();
  if (now - _boxT > 150) { _box = mq.box(8); _boxT = now; }
  const hh = mq.headH, c = _box.getCenter(new V3());
  let minX = Infinity, maxX = -Infinity;
  for (const x of [_box.min.x, _box.max.x]) for (const y of [_box.min.y, _box.max.y]) for (const z of [_box.min.z, _box.max.z]) { const s = toScreen(new V3(x, y, z), w, h); minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); }
  const rx = Math.max(28, minX - 22);
  ctx.strokeStyle = themeInk.blue; ctx.fillStyle = themeInk.blue; ctx.lineWidth = 1.2; ctx.font = `600 11px ${css('--f-mono')}`; ctx.textAlign = 'right';
  const n = Math.ceil((_box.max.y - _box.min.y) / hh + .01);
  const top = toScreen(new V3(c.x, _box.min.y + n * hh, c.z), w, h), bot = toScreen(new V3(c.x, _box.min.y, c.z), w, h);
  ctx.beginPath(); ctx.moveTo(rx, bot.y); ctx.lineTo(rx, top.y); ctx.stroke();
  for (let i = 0; i <= n; i++) {
    const s = toScreen(new V3(c.x, _box.min.y + i * hh, c.z), w, h);
    ctx.globalAlpha = 1; ctx.beginPath(); ctx.moveTo(rx - 5, s.y); ctx.lineTo(rx + 5, s.y); ctx.stroke();
    ctx.globalAlpha = .28; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(rx + 6, s.y); ctx.lineTo(maxX + 10, s.y); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    if (i < n) { const s2 = toScreen(new V3(c.x, _box.min.y + (i + .5) * hh, c.z), w, h); ctx.fillText(String(n - i), rx - 8, s2.y + 4); }
  }
  ctx.textAlign = 'left'; ctx.globalAlpha = 1;
}

/* ---------- history ---------- */
const hist = {stack: [], i: -1};
const snapshot = () => ({chars: chars.map(m => ({body: {...m.body}, preset: m.bodyPreset, pose: m.getPose(), outfit: m.outfit})), active});
function pushHistory() {
  const s = JSON.stringify({...snapshot(), ...sceneExtras(false)});
  if (hist.stack[hist.i] === s) return;
  hist.stack = hist.stack.slice(0, hist.i + 1); hist.stack.push(s);
  if (hist.stack.length > 80) hist.stack.shift();
  hist.i = hist.stack.length - 1; updateUndo();
}
function restore(s) {
  const o = typeof s === 'string' ? JSON.parse(s) : s;
  if (!o.chars || !o.chars.length) return;
  while (chars.length < o.chars.length) addChar('hombre', o.chars[chars.length].body, false);
  while (chars.length > o.chars.length) removeChar(chars.length - 1);
  for (const p of props) if (p.userData.held) releaseProp(p);
  o.chars.forEach((c, i) => {
    const m = chars[i], body = {...BODY_BASE, ...c.body};
    if (JSON.stringify(body) !== JSON.stringify(m.body)) m.build(body);
    m.bodyPreset = c.preset ?? null; m.setPose(c.pose);
    if (c.outfit && JSON.stringify(c.outfit) !== JSON.stringify(m.outfit)) setOutfit(m, c.outfit);
    else if (!c.outfit && m.outfit.length) setOutfit(m, []);
  });
  applySceneExtras(o);
  setActive(Math.min(o.active || 0, chars.length - 1));
}
function undo() { if (hist.i > 0) { restore(hist.stack[--hist.i]); updateUndo(); } }
function redo() { if (hist.i < hist.stack.length - 1) { restore(hist.stack[++hist.i]); updateUndo(); } }
function updateUndo() { $('#undo').disabled = hist.i <= 0; $('#redo').disabled = hist.i >= hist.stack.length - 1; }
let rebuildPending = false;
function rebuildActive(now) {
  const run = () => { rebuildPending = false; mq.build(mq.body); mq.ground(); _boxT = 0; $('#headsOut').textContent = dec(mq.heads); renderCast(); };
  if (now) return run();
  if (!rebuildPending) { rebuildPending = true; requestAnimationFrame(run); }
}

/* ---------- selection ---------- */
function select(name) {
  state.selected = name; state.sel = name ? {kind: 'joint'} : null;
  $('#objCard').hidden = true;
  for (const m of chars) if (m !== mq || !name) m.highlight(null);
  if (!name) { tc.detach(); $('#jointCard').hidden = true; return; }
  if (name.startsWith('tail') && !mq.hasTail) return select(null);
  if (name.startsWith('ear') && !mq.hasEars) return select(null);
  tc.setMode('rotate'); tc.setSpace('local');
  tc.attach(mq.joints[name]);
  tc.showX = true; tc.showY = tc.showZ = !HINGE[name];
  mq.highlight(name);
  $('#jointName').textContent = JOINT_LABEL[name];
  buildJointSliders(); $('#jointCard').hidden = false;
}
let jointSliderEls = [];
function buildJointSliders() {
  const box = $('#jointSliders'); box.innerHTML = ''; jointSliderEls = [];
  const name = state.selected; if (!name) return;
  const axes = HINGE[name] ? [['x', tr('Flexión'), HINGE[name][0], HINGE[name][1]]] : [['x', tr('Flexión (X)'), -180, 180], ['y', tr('Giro (Y)'), -180, 180], ['z', tr('Inclinación (Z)'), -180, 180]];
  for (const [ax, label, mn, mx] of axes) {
    const el = slider(box, {id: 'j_' + ax, label, min: mn, max: mx, step: 1, value: 0, fmt: v => Math.round(v) + '°',
      input: v => { mq.joints[state.selected].rotation[ax] = v * DEG; if (state.sym) mirrorJoint(mq, state.selected); }, change: pushHistory});
    el.ax = ax; jointSliderEls.push(el);
  }
  syncJointSliders();
}
function syncJointSliders() { if (!state.selected || !state.sel || state.sel.kind !== 'joint') return; const r = mq.joints[state.selected].rotation; for (const el of jointSliderEls) el.set(r[el.ax] / DEG); }
function selectObj(obj) {
  select(null);
  const isLight = !!obj.userData.light;
  state.sel = {kind: isLight ? 'light' : 'prop', obj};
  tc.setMode(isLight ? 'translate' : state.propMode); tc.setSpace(obj.userData.held ? 'local' : 'world'); tc.showX = tc.showY = tc.showZ = true;
  tc.attach(obj);
  $('#objName').textContent = isLight ? tr(obj.userData.light === 'foco' ? 'Foco' : 'Bombilla') : (PROPS[obj.userData.prop] || (ASSET_PROPS[obj.userData.prop] || [])[0] || tr('Objeto'));
  const modes = $('#objMode'), extra = $('#objExtra'); extra.innerHTML = '';
  if (isLight) {
    modes.innerHTML = '';
    const cc = document.createElement('div'); cc.className = 'chips'; extra.appendChild(cc);
    chips(cc, Object.entries(LIGHT_COLORS).map(([k, v]) => [k, v[0]]), obj.userData.color, k => {
      obj.userData.color = k; const c = LIGHT_COLORS[k][1]; obj.userData.ref.light.color.set(c); obj.userData.ref.bulb.material.color.set(c);
    });
    const l = obj.userData.ref.light;
    slider(extra, {id: 'lt_i', label: 'Fuerza', min: 0, max: 6, step: .05, value: l.intensity, fmt: v => dec(v), input: v => l.intensity = v});
    slider(extra, {id: 'lt_d', label: 'Alcance', min: 2, max: 25, step: .5, value: l.distance, fmt: v => v.toFixed(0) + ' m', input: v => l.distance = v});
  } else {
    chips(modes, [['translate', 'Mover'], ['rotate', 'Girar'], ['scale', 'Escalar@objeto']], state.propMode, v => { state.propMode = v; tc.setMode(v); tc.setSpace(obj.userData.held ? 'local' : 'world'); });
    const hold = document.createElement('div'); hold.className = 'chips'; extra.appendChild(hold);
    const h = obj.userData.held;
    chips(hold, [['R', 'En la mano derecha'], ['L', 'En la izquierda'], ['suelo', 'Soltar']], h && h.m === mq ? h.side : (h ? '' : 'suelo'), v => {
      if (v === 'suelo') releaseProp(obj); else holdProp(obj, mq, v);
      tc.setSpace(obj.userData.held ? 'local' : 'world'); syncHandUI(); pushHistory();
    });
    const nt = document.createElement('p'); nt.className = 'tip'; nt.textContent = tr('Se agarra con la mano del personaje activo ({n}).', {n: active + 1}); extra.appendChild(nt);
  }
  $('#objDup').hidden = isLight;
  $('#objCard').hidden = false;
}
function deleteSel() {
  const s = state.sel; if (!s || s.kind === 'joint') return;
  tc.detach();
  if (s.kind === 'prop') { releaseProp(s.obj); scene.remove(s.obj); props.splice(props.indexOf(s.obj), 1); }
  else { scene.remove(s.obj); if (s.obj.userData.ref.light.isSpotLight) scene.remove(s.obj.userData.ref.light.target); extraLights.splice(extraLights.indexOf(s.obj), 1); }
  state.sel = null; $('#objCard').hidden = true; pushHistory();
}
$('#objDel').onclick = deleteSel;
$('#objClose').onclick = () => select(null);
$('#objDup').onclick = () => {
  const s = state.sel; if (!s || s.kind !== 'prop') return;
  const g = makeProp(s.obj.userData.prop, s.obj.position.clone().add(new V3(.5, 0, .3)));
  g.rotation.copy(s.obj.rotation); g.scale.copy(s.obj.scale); setOutlines(g, state.envOutline); selectObj(g); pushHistory();
};
function spotNear() {
  const p = mq.joints.hips.getWorldPosition(new V3());
  const side = new V3(1, 0, 0).applyAxisAngle(new V3(0, 1, 0), camAzimuth() * DEG);
  return p.addScaledVector(side, .9 * mq.size).setY(0);
}

/* ---------- UI helpers ---------- */
function slider(parent, o) {
  const wrap = document.createElement('div'); wrap.className = 'sl';
  wrap.innerHTML = `<label for="${o.id}">${tr(o.label)}</label><output></output><input type="range" id="${o.id}" min="${o.min}" max="${o.max}" step="${o.step}">`;
  const inp = wrap.querySelector('input'), out = wrap.querySelector('output');
  const set = v => { inp.value = v; out.textContent = o.fmt(+inp.value); };
  inp.addEventListener('input', () => { out.textContent = o.fmt(+inp.value); o.input(+inp.value); });
  if (o.change) inp.addEventListener('change', () => o.change(+inp.value));
  set(o.value); parent.appendChild(wrap);
  return {set, inp};
}
function chips(parent, items, cur, onPick) {
  parent.innerHTML = '';
  for (const [id, label] of items) {
    const b = document.createElement('button'); b.className = 'chip'; b.type = 'button';
    b.dataset.v = id; b.textContent = tr(String(label)); b.setAttribute('aria-pressed', String(String(id) === String(cur)));
    b.onclick = () => { setPressed(parent, id); onPick(id); };
    parent.appendChild(b);
  }
}
function setPressed(parent, id) { parent.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.v === String(id)))); }
function bindChipGroup(sel, onPick) { const p = $(sel); p.querySelectorAll('.chip').forEach(c => c.onclick = () => { setPressed(p, c.dataset.v); onPick(c.dataset.v); }); }

const tabs = $$('.tab');
const TAB_ALIAS = {manos: 'pose', luz: 'escena'};
function showTab(id) {
  id = TAB_ALIAS[id] || id; if (!tabs.some(t => t.dataset.tab === id)) id = 'pose';
  tabs.forEach(t => t.setAttribute('aria-selected', String(t.dataset.tab === id)));
  $$('.page section').forEach(s => s.hidden = s.dataset.tab !== id);
  state.tab = id;
  store.set('cdp.tab', id);
}
tabs.forEach(t => t.onclick = () => { showTab(t.dataset.tab); setPanel(true); });
/* collapsible sections remember whether they were open */
$$('details[data-sec]').forEach(d => {
  const k = 'cdp.sec.' + d.dataset.sec, v = store.get(k, null);
  if (v !== null) d.open = v;
  d.addEventListener('toggle', () => store.set(k, d.open));
});
/* hide the panel to draw on the whole page */
function setPanel(on) {
  document.body.classList.toggle('nopanel', !on); $('#panelBtn').setAttribute('aria-pressed', String(!on));
  store.set('cdp.panel', on);
}
$('#panelBtn').onclick = () => setPanel(document.body.classList.contains('nopanel'));
setPanel(store.get('cdp.panel', true));
/* help */
const openHelp = () => { $('#helpModal').hidden = false; $('#helpClose').focus(); };
const closeHelp = () => { $('#helpModal').hidden = true; };
$('#helpBtn').onclick = openHelp; $('#helpClose').onclick = closeHelp;
$('#helpModal').onclick = e => { if (e.target === e.currentTarget) closeHelp(); };
/* language: switching reloads the page and carries the current scene over */
function setLang(l) {
  if (l === LANG) return;
  store.set('cdp.lang', l);
  try { sessionStorage.setItem('cdp.carry', JSON.stringify({...snapshot(), ...sceneExtras(true)})); } catch (e) {}
  location.reload();
}
$$('.langChips').forEach(c => chips(c, Object.entries(LANGS), LANG, setLang));
/* the canvas hint steps back once the user has tried posing */
{ let n = store.get('cdp.hintN', 0); if (n >= 3) $('#hint').classList.add('quiet');
  $('#viewport').addEventListener('pointerdown', () => { if (++n === 3) $('#hint').classList.add('quiet'); store.set('cdp.hintN', n); }); }

/* body */
let bodyEls = {};
function buildBodyUI() {
  chips($('#bodyChips'), Object.entries(BODY_PRESETS).map(([k, v]) => [k, v.label]), mq.bodyPreset, id => {
    mq.body = {...bodyOf(id), species: mq.body.species, headStyle: mq.body.headStyle, kemo: mq.body.kemo, feet: mq.body.feet}; mq.bodyPreset = id; tourEvent('body'); rebuildActive(true); syncBodyUI(); pushHistory();
  });
  chips($('#speciesChips'), Object.entries(SPECIES).map(([k, v]) => [k, v.label]), mq.body.species, id => {
    mq.body.species = id; tourEvent('body'); rebuildActive(true); syncHeadUI(); pushHistory();
  });
  const mk2 = (box, list) => { box.innerHTML = ''; for (const [k, label, mn, mx, fmt] of list)
    bodyEls[k] = slider(box, {id: 'b_' + k, label, min: mn, max: mx, step: .01, value: mq.body[k], fmt: fmt || pctFmt,
      input: v => { mq.body[k] = v; mq.bodyPreset = null; setPressed($('#bodyChips'), ''); rebuildActive(); }, change: pushHistory}); };
  mk2($('#bodySliders'), BODY_SLIDERS); mk2($('#styleSliders'), STYLE_SLIDERS);
}
function syncBodyUI() {
  for (const k in bodyEls) bodyEls[k].set(mq.body[k]);
  setPressed($('#bodyChips'), mq.bodyPreset || ''); setPressed($('#speciesChips'), mq.body.species); if (typeof syncHeadUI === 'function') syncHeadUI();
  $('#headsOut').textContent = dec(mq.heads);
}
const STYLE_NOTE = {
  construccion: 'Sombreado en tres tonos con anillos que rodean cada volumen: lo más útil para entender la forma.',
  contorno: 'Papel blanco con contorno y anillos, como un dibujo a línea listo para calcar.',
  volumen: 'Sombreado suave para estudiar luces y sombras sobre la anatomía.',
  silueta: 'Mancha plana para leer la línea de acción y el gesto.',
  lapiz: 'Sombreado a lápiz con tramas cruzadas según la luz, también en el escenario: una referencia que ya parece un dibujo.',
  valores: 'Estudio de valores en dos o tres tonos planos (notan), para decidir dónde van las masas de sombra.'
};
function applyDrawing() {
  for (const m of chars) { m.outlineOn = state.outline > 0 && state.style !== 'silueta'; m.setStyle(state.style); }
  LU.uOutW.value = state.outline;
  LU.uLineA.value = state.style === 'silueta' || state.lineMode === 'ninguna' ? 0 : state.lineA;
  LU.uMer.value = state.lineMode === 'malla' ? 4 : 0;
  LU.uRender.value = state.style === 'lapiz' ? 1 : state.style === 'valores' ? 2 : 0;
  $('#styleNote').textContent = tr(STYLE_NOTE[state.style]);
  $('#hatchBox').hidden = state.style !== 'lapiz'; $('#valueBox').hidden = state.style !== 'valores';
  applyAmbient();
}
function buildDrawUI() {
  chips($('#styleChips'), Object.entries(STYLES), state.style, id => { state.style = id; applyDrawing(); });
  chips($('#lineChips'), Object.entries(LINE_MODES), state.lineMode, id => { state.lineMode = id; applyDrawing(); });
  const box = $('#drawSliders'); box.innerHTML = '';
  slider(box, {id: 'd_stride', label: 'Separación de anillos', min: .012, max: .08, step: .001, value: LU.uStride.value, fmt: v => dec(v * 100) + ' cm', input: v => LU.uStride.value = v});
  slider(box, {id: 'd_alpha', label: 'Intensidad de líneas', min: .1, max: 1, step: .01, value: state.lineA, fmt: pctFmt, input: v => { state.lineA = v; applyDrawing(); }});
  slider(box, {id: 'd_out', label: 'Grosor del contorno', min: 0, max: 4, step: .1, value: state.outline, fmt: v => dec(v) + ' px', input: v => { state.outline = v; applyDrawing(); }});
  $('#centerChk').onchange = e => LU.uCenter.value = e.target.checked ? 1 : 0;
  slider($('#hatchBox'), {id: 'd_hatch', label: 'Cantidad de sombreado', min: .2, max: .7, step: .01, value: LU.uHatch.value, fmt: pctFmt, input: v => LU.uHatch.value = v});
  chips($('#levelChips'), [[2, 'Dos tonos'], [3, 'Tres tonos']], 3, v => LU.uLevels.value = +v);
  slider($('#valueBox'), {id: 'd_thr', label: 'Umbral de sombra', min: .2, max: .8, step: .01, value: LU.uThresh.value, fmt: pctFmt, input: v => LU.uThresh.value = v});
  chips($('#formChips'), Object.entries(FORM_MODES), state.form, v => setForm(v));
  applyDrawing();
}

/* hands */
let fingerEls = [], spreadEl;
const handTargets = () => state.handSide === 'both' ? ['L', 'R'] : [state.handSide];
function buildHandUI() {
  chips($('#gestureChips'), Object.entries(GESTURES).map(([k, v]) => [k, v.label]), null, id => { for (const s of handTargets()) mq.hands[s] = gest(id); mq.applyHands(); syncHandUI(); pushHistory(); });
  const box = $('#fingerSliders'); box.innerHTML = ''; fingerEls = [];
  FINGER_NAMES.forEach((label, i) => fingerEls.push(slider(box, {id: 'f_' + i, label, min: 0, max: 1, step: .01, value: 0, fmt: v => Math.round(v * 100),
    input: v => { for (const s of handTargets()) mq.hands[s].c[i] = v; mq.applyHands(); setPressed($('#gestureChips'), ''); }, change: pushHistory})));
  spreadEl = slider(box, {id: 'f_spread', label: 'Separación de dedos', min: 0, max: 1, step: .01, value: 0, fmt: v => Math.round(v * 100),
    input: v => { for (const s of handTargets()) mq.hands[s].s = v; mq.applyHands(); }, change: pushHistory});
  bindChipGroup('#handSide', v => { state.handSide = v; syncHandUI(); });
}
function syncHandUI() { const h = mq.hands[handTargets()[0]]; fingerEls.forEach((el, i) => el.set(h.c[i])); spreadEl.set(h.s); }

/* light */
let lightEls = {};
function buildLightUI() {
  chips($('#lightChips'), Object.entries(LIGHTS).map(([k, v]) => [k, v.label]), state.lightPreset, id => setLightPreset(id));
  const box = $('#lightSliders'); box.innerHTML = '';
  const defs = [['az', 'Dirección', -180, 180, 1, v => Math.round(v) + '°'], ['el', 'Altura@luz', -40, 90, 1, v => Math.round(v) + '°'],
    ['key', 'Luz principal', 0, 2, .01, pctFmt], ['fill', 'Relleno ambiente', 0, 1.5, .01, pctFmt], ['rim', 'Luz de recorte', 0, 1.5, .01, pctFmt], ['soft', 'Suavidad de sombra', 1, 12, .1, v => dec(v)]];
  for (const [k, label, mn, mx, st, fmt] of defs) lightEls[k] = slider(box, {id: 'l_' + k, label, min: mn, max: mx, step: st, value: state.light[k], fmt,
    input: v => { state.light[k] = v; state.lightPreset = null; setPressed($('#lightChips'), ''); }});
  $('#shadowChk').onchange = e => state.shadows = e.target.checked;
  const addL = type => { if (extraLights.length >= 4) return; const g = makeLight(type, spotNear().setY(2.2)); selectObj(g); pushHistory(); };
  $('#addPoint').onclick = () => addL('punto'); $('#addSpot').onclick = () => addL('foco');
  $('#clearLights').onclick = () => { tc.detach(); $('#objCard').hidden = true; state.sel = null; for (const g of [...extraLights]) { scene.remove(g); if (g.userData.ref.light.isSpotLight) scene.remove(g.userData.ref.light.target); } extraLights.length = 0; pushHistory(); };
}
function syncLightUI() { for (const k in lightEls) lightEls[k].set(state.light[k]); setPressed($('#lightChips'), state.lightPreset || ''); }

/* scene */
function buildSceneUI() {
  const eb = $('#envChips'); eb.innerHTML = '';
  for (const [g, label] of [['in', 'Interiores'], ['out', 'Exteriores'], ['x', 'Otros']]) {
    const items = Object.entries(SCENES).filter(([, v]) => v.group === g).map(([k, v]) => [k, v.label]);
    if (g === 'x') for (const k of Object.keys(ENV_BUILD)) if (!SCENES[k] && k === 'vacio') items.push([k, ENVS[k]]);
    if (!items.length) continue;
    const h = document.createElement('p'); h.className = 'lbl'; h.textContent = tr(label); const c = document.createElement('div'); c.className = 'chips envg';
    eb.append(h, c); chips(c, items, state.env, id => { eb.querySelectorAll('.chip').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === id))); setEnv(id); pushHistory(); });
  }
  slider($('#practicalBox'), {id: 'e_prac', label: 'Luces del escenario', min: 0, max: 2, step: .01, value: state.practical, fmt: pctFmt, input: v => { state.practical = v; applyAmbient(); }});
  $('#lampShadowChk').onchange = e => { state.lampShadows = e.target.checked; applyAmbient(); };
  chips($('#ambChips'), Object.entries(AMBIENTS).map(([k, v]) => [k, v.label]), state.amb, id => { state.amb = id; applyAmbient(); });
  $('#envOutlineChk').onchange = e => { state.envOutline = e.target.checked; if (envGroup) setOutlines(envGroup, state.envOutline); for (const p of props) setOutlines(p, state.envOutline); for (const m of chars) setOutlines(m.stoolMesh, state.envOutline); };
  const pb = $('#propChips'); pb.innerHTML = '';
  for (const [label, items] of [['Muebles y objetos', Object.entries(ASSET_PROPS).map(([k, v]) => [k, v[0]])], ['Formas básicas', Object.entries(PROPS)]]) {
    const c = document.createElement('div'); c.className = 'chips';
    if (label === 'Formas básicas') { const d = document.createElement('details'); d.className = 'more'; const sm = document.createElement('summary'); sm.textContent = tr(label); d.append(sm, c); pb.append(d); }
    else { const h = document.createElement('p'); h.className = 'lbl'; h.textContent = tr(label); pb.append(h, c); }
    chips(c, items, null, id => { setPressed(c, ''); const g = makeProp(id, spotNear()); setOutlines(g, state.envOutline); selectObj(g); pushHistory(); });
  }
  $('#clearProps').onclick = () => { if (state.sel && state.sel.kind === 'prop') { tc.detach(); state.sel = null; $('#objCard').hidden = true; } clearProps(); pushHistory(); };
  $('#addChar').onclick = () => { const m = addChar(chars.length % 2 ? 'mujer' : 'hombre'); if (m) { setActive(chars.length - 1); pushHistory(); } };
  $('#delChar').onclick = () => { removeChar(active); pushHistory(); };
  $('#rowChars').onclick = () => { chars.forEach((m, i) => { const yaw = m.yaw(); m.joints.hips.quaternion.premultiply(new Q().setFromAxisAngle(new V3(0, 1, 0), -yaw)); m.joints.hips.position.x = (i - (chars.length - 1) / 2) * .9; m.joints.hips.position.z = 0; }); frameAll(); pushHistory(); };
}

/* camera */
function buildCamUI() {
  chips($('#viewChips'), VIEWS.map(v => [v[0], v[0]]), null, id => { const v = VIEWS.find(x => x[0] === id); setView(v[1], v[2]); });
  $('#frameBtn').onclick = frameAll;
  $('#focal').oninput = e => setFocal(+e.target.value, $('#dollyChk').checked);
  for (const mm of LENSES) { const b = document.createElement('button'); b.type = 'button'; b.textContent = mm; b.title = mm + ' mm'; b.onclick = () => { $('#focal').value = mm; setFocal(mm, $('#dollyChk').checked); }; $('#lensTicks').appendChild(b); }
  const link = (id, k, after) => { const el = $(id); el.checked = state.guides[k]; el.onchange = () => { state.guides[k] = el.checked; after && after(); }; };
  link('#gThirds', 'thirds'); link('#gPersp', 'persp'); link('#gGrid', 'grid', () => grid.visible = state.guides.grid);
  link('#gRuler', 'ruler');
  grid.visible = state.guides.grid;
}

/* ---------- pose library with silhouettes ---------- */
let thumbR, thumbScene, thumbCam, thumbChars = [];
const thumbs = new Map(); let thumbQueue = [];
function initThumbs() {
  try {
    thumbR = new THREE.WebGLRenderer({antialias: true, alpha: true, preserveDrawingBuffer: true});
    thumbR.setPixelRatio(2); thumbR.setSize(96, 120); thumbR.setClearColor(0, 0);
    thumbScene = new THREE.Scene(); thumbCam = new THREE.PerspectiveCamera(28, 96 / 120, .05, 80);
    const white = new THREE.MeshBasicMaterial({color: 0xffffff});
    thumbChars = ['hombre', 'mujer', 'hombre', 'mujer'].map(id => { const m = new Mannequin({sil: white}, 'sil'); m.build(bodyOf(id)); thumbScene.add(m.group); return m; });
  } catch (e) { thumbR = null; }
}
function renderThumb(def) {
  if (!thumbR) return null;
  const n = def.n || 1;
  thumbChars.forEach((m, i) => m.group.visible = i < n);
  if (n === 1) { const m = thumbChars[0]; m.joints.hips.position.set(0, m.rootY, 0); applyPreset(m, def); }
  else applyGroupTo(thumbChars, def);
  const box = new THREE.Box3(); for (let i = 0; i < n; i++) box.union(thumbChars[i].box(12));
  const c = box.getCenter(new V3()), size = box.getSize(new V3());
  const r = Math.max(size.y, size.x * 1.25, size.z * 1.1) * .5;
  const d = r / Math.tan(thumbCam.fov * DEG / 2) * (n === 1 ? 1.12 : 1.4);
  const a = n === 1 ? 32 * DEG + thumbChars[0].yaw() : 18 * DEG, e = n === 1 ? 10 * DEG : 22 * DEG;
  thumbCam.position.set(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)).multiplyScalar(d).add(c);
  thumbCam.lookAt(c); thumbR.render(thumbScene, thumbCam);
  return thumbR.domElement.toDataURL('image/png');
}
function pumpThumbs() {
  const t0 = performance.now();
  while (thumbQueue.length && performance.now() - t0 < 30) {
    const [def, el] = thumbQueue.shift();
    let url = thumbs.get(def.id);
    if (!url) { url = renderThumb(def); if (url) thumbs.set(def.id, url); }
    if (url && el.isConnected) { el.classList.remove('pending'); el.style.setProperty('--m', `url(${url})`); }
  }
  if (thumbQueue.length) requestAnimationFrame(pumpThumbs);
}
function poseCard(label, onClick, thumb, onDel, img) {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'pose';
  const th = document.createElement(img ? 'img' : 'div'); th.className = 'th' + (img ? ' img' : thumb ? '' : ' pending');
  if (img) { th.src = img; th.alt = ''; } else if (thumb) th.style.setProperty('--m', `url(${thumb})`);
  const sp = document.createElement('span'); sp.textContent = label;
  b.append(th, sp); b.onclick = onClick;
  if (onDel) { const x = document.createElement('span'); x.className = 'del'; x.textContent = '×'; x.title = tr('Borrar'); x.setAttribute('role', 'button'); x.setAttribute('aria-label', tr('Borrar {x}', {x: label})); x.onclick = ev => { ev.stopPropagation(); onDel(); }; b.appendChild(x); }
  return b;
}
function markPose() { $$('#poseGrid .pose').forEach(el => el.classList.toggle('on', el.dataset.id === state.posePreset)); }
function buildPoseGrid() {
  const g = $('#poseGrid'); g.innerHTML = '';
  chips($('#castChips'), [1, 2, 3, 4].map(n => [n, String(n)]), state.castN, v => { state.castN = +v; buildPoseGrid(); });
  $('#catChips').hidden = state.castN !== 1;
  chips($('#catChips'), Object.entries(POSE_CATS), state.cat, v => { state.cat = v; buildPoseGrid(); });
  const norm = t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(), q = norm($('#poseSearch').value.trim());
  const list = (state.castN === 1 ? POSES.filter(p => state.cat === 'todas' || p.cat === state.cat) : GROUP_POSES[state.castN]).filter(p => !q || norm(p.label).includes(q));
  $('#poseCount').textContent = tr('{n} poses', {n: list.length});
  if (!list.length) g.innerHTML = `<p class="empty">${tr('Ninguna pose coincide con la búsqueda.')}</p>`;
  thumbQueue = [];
  for (const p of list) {
    const el = poseCard(p.label, () => state.castN === 1 ? usePreset(p) : useGroup(p), thumbs.get(p.id));
    el.dataset.id = p.id; g.appendChild(el);
    if (!thumbs.has(p.id)) thumbQueue.push([p, el.querySelector('.th')]);
  }
  markPose();
  if (thumbQueue.length) requestAnimationFrame(pumpThumbs);
}
let myPoses = store.get('cdp.scenes', []);
function buildMyPoses() {
  const g = $('#myPoses'); g.innerHTML = '';
  $('#myEmpty').hidden = myPoses.length > 0;
  myPoses.forEach((p, i) => g.appendChild(poseCard(p.name, () => { restore(p.snap); frameAll(); pushHistory(); }, null,
    () => { myPoses.splice(i, 1); store.set('cdp.scenes', myPoses); buildMyPoses(); }, p.img)));
}
function viewSnapshot() {
  frame();
  const src = renderer.domElement, c = document.createElement('canvas'); c.width = 192; c.height = 240;
  const k = Math.max(192 / src.width, 240 / src.height), w = src.width * k, h = src.height * k;
  c.getContext('2d').drawImage(src, (192 - w) / 2, (240 - h) / 2, w, h);
  return c.toDataURL('image/jpeg', .8);
}
$('#saveForm').onsubmit = e => {
  e.preventDefault();
  const name = $('#poseName').value.trim() || tr('Escena {n}', {n: myPoses.length + 1});
  myPoses.unshift({name, snap: {...snapshot(), ...sceneExtras(true)}, img: viewSnapshot()});
  if (!store.set('cdp.scenes', myPoses)) $('#myEmpty').textContent = tr('Este navegador no deja guardar datos; solo durará esta sesión.');
  $('#poseName').value = ''; buildMyPoses();
};

/* tools */
function mirrorPose() {
  const p = mq.getPose(), out = {q: {}, pos: [-p.pos[0], p.pos[1], p.pos[2]], hands: {L: p.hands.R, R: p.hands.L}};
  for (const n of JOINTS) { const [x, y, z, w] = p.q[n]; out.q[swapSide(n)] = [x, -y, -z, w]; }
  mq.setPose(out); syncAll(); pushHistory();
}
$('#mirrorBtn').onclick = mirrorPose;
$('#groundBtn').onclick = () => { mq.ground(); pushHistory(); };
$('#resetBtn').onclick = () => usePreset(POSE.pie);
$('#stoolChk').onchange = e => { mq.stool = e.target.checked; pushHistory(); };
$('#undo').onclick = undo; $('#redo').onclick = redo;
$('#jointClose').onclick = () => select(null);
function syncAll() { syncJointSliders(); syncHandUI(); syncBodyUI(); if (typeof renderAvatarUI === 'function') renderAvatarUI(); $('#stoolChk').checked = mq.stool; if (typeof renderGarmentList === 'function') { renderGarmentList(); renderLibrary(); } }

/* ---------- pointer interaction ---------- */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let down = null, drag = null, gizmoDragged = false;
function setNdc(e) { const r = canvas.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); ray.setFromCamera(ndc, camera); }
vp.addEventListener('pointerdown', e => {
  if (e.target !== canvas) return;
  down = {x: e.clientX, y: e.clientY}; gizmoDragged = false;
  if (tc.axis || practice.active) return;
  setNdc(e);
  const hit = ray.intersectObjects([...Object.values(handles), sunHandle].filter(h => h.visible))[0]
    || ray.intersectObjects(Object.values(jointDots).filter(d => d.visible))[0];
  if (!hit) return;
  e.stopPropagation(); e.preventDefault();
  if (hit.object.userData.joint) {
    const jn = hit.object.userData.joint, start = hit.object.position.clone();
    if (jn === 'hips') { drag = {id: 'hips', plane: new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new V3()), start), offset: new V3(), dot: jn}; const p0 = ray.ray.intersectPlane(drag.plane, new V3()) || start; drag.offset.copy(mq.joints.hips.position).sub(p0); drag.feet = {footL: mq.joints.ankleL.getWorldPosition(new V3()), footR: mq.joints.ankleR.getWorldPosition(new V3())}; }
    else drag = {id: 'fk', joint: jn, plane: new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new V3()), start), moved: false, ik: state.ik};
    controls.enabled = false; try { vp.setPointerCapture(e.pointerId); } catch (_) {} vp.style.cursor = 'grabbing';
    return;
  }
  if (hit.object === sunHandle) { drag = {id: 'sun'}; controls.enabled = false; try { vp.setPointerCapture(e.pointerId); } catch (_) {} return; }
  const id = hit.object.userData.id, start = hit.object.position.clone();
  drag = {id, plane: new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new V3()), start), offset: new V3()};
  const p0 = ray.ray.intersectPlane(drag.plane, new V3()) || start;
  if (id === 'hips') { drag.offset.copy(mq.joints.hips.position).sub(p0); drag.feet = {footL: mq.joints.ankleL.getWorldPosition(new V3()), footR: mq.joints.ankleR.getWorldPosition(new V3())}; }
  else drag.offset.copy(start).sub(p0);
  controls.enabled = false;
  try { vp.setPointerCapture(e.pointerId); } catch (_) {}
  vp.style.cursor = 'grabbing';
}, true);
vp.addEventListener('pointermove', e => {
  if (!drag) {
    if (e.target === canvas && !tc.dragging && !practice.active) { setNdc(e); vp.style.cursor = ray.intersectObjects([...Object.values(handles), ...Object.values(jointDots)].filter(h => h.visible)).length ? 'grab' : ''; }
    return;
  }
  setNdc(e);
  if (drag.id === 'sun') return dragSun(ray);
  if (drag.id === 'fk') {
    const p = ray.ray.intersectPlane(drag.plane, new V3()); if (!p) return;
    drag.moved = true;
    if (drag.ik && EFFECTOR_OF[drag.joint]) { const id = EFFECTOR_OF[drag.joint]; solveIK(mq.chains[id], mq.joints[EFFECTOR[id]], p); if (state.sym) for (const l of mq.chains[id]) mirrorJoint(mq, l.obj.name); }
    else if (JOINT_PARENT[drag.joint]) { aimParent(mq, drag.joint, p); if (state.sym) mirrorJoint(mq, JOINT_PARENT[drag.joint]); }
    syncJointSliders(); return;
  }
  const p = ray.ray.intersectPlane(drag.plane, new V3()); if (!p) return;
  p.add(drag.offset);
  if (drag.id === 'hips') {
    if (p.y < .05) p.y = .05;
    mq.joints.hips.position.copy(p); mq.group.updateMatrixWorld(true);
    if ($('#pinFeet').checked) for (const f of ['footL', 'footR']) solveIK(mq.chains[f], mq.joints[EFFECTOR[f]], drag.feet[f]);
  } else {
    if (drag.id.startsWith('foot') && p.y < .02) p.y = .02;
    solveIK(mq.chains[drag.id], mq.joints[EFFECTOR[drag.id]], p);
    if (state.sym) for (const l of mq.chains[drag.id]) mirrorJoint(mq, l.obj.name);
  }
  syncJointSliders();
});
// FK: turn the parent bone so the dragged joint points at the cursor (the rest of the chain is untouched)
const EFFECTOR_OF = {wristL: 'handL', wristR: 'handR', ankleL: 'footL', ankleR: 'footR'};
function aimParent(m, jn, target) {
  const pn = JOINT_PARENT[jn], P = m.joints[pn], J = m.joints[jn]; if (!P || !J) return;
  m.group.updateMatrixWorld(true);
  const pp = P.getWorldPosition(new V3()), cur = J.getWorldPosition(new V3()).sub(pp), want = target.clone().sub(pp);
  if (cur.lengthSq() < 1e-8 || want.lengthSq() < 1e-8) return;
  const qw = new Q().setFromUnitVectors(cur.normalize(), want.normalize()), pw = P.getWorldQuaternion(new Q()), parentW = P.parent.getWorldQuaternion(new Q());
  P.quaternion.copy(parentW.invert().multiply(qw.multiply(pw)));
  if (HINGE[pn]) { const e = new THREE.Euler().setFromQuaternion(P.quaternion, 'XYZ'); P.rotation.set(clamp(e.x, HINGE[pn][0] * DEG, HINGE[pn][1] * DEG), 0, 0); }
  m.group.updateMatrixWorld(true);
}
function setIK(on) {
  state.ik = on; store.set('cdp.ik', on);
  $$('#ikMode .chip').forEach(c => c.setAttribute('aria-pressed', String((c.dataset.v === 'ik') === on)));
  if (!toastKeep) $('#hint').innerHTML = on ? HINT_IK : HINT_FK;
}
const HINT_IK = tr('Arrastra los puntos <b>●</b> para mover manos y pies, el <i>●</i> para mover el cuerpo · toca una pieza o un punto para girarla');
const HINT_FK = tr('Modo FK: arrastra cualquier articulación ◉ y solo gira el hueso que la sostiene · toca una para girarla con el aro');
function endDrag() {
  if (drag && drag.id === 'fk' && drag.moved) tourEvent(drag.ik ? 'ik' : 'fk');
  if (drag && drag.id !== 'fk' && drag.id !== 'sun') tourEvent(drag.id === 'hips' ? 'hips' : 'ik');
  if (drag && drag.id === 'fk' && !drag.moved) { const jn = drag.joint; drag = null; controls.enabled = true; vp.style.cursor = ''; down = null; return select(jn); }
  if (!drag) return; const wasSun = drag.id === 'sun'; drag = null; controls.enabled = true; vp.style.cursor = ''; if (!wasSun) pushHistory(); }
vp.addEventListener('pointerup', e => {
  if (drag) { endDrag(); down = null; return; }
  if (down && !gizmoDragged && !practice.active && e.target === canvas && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) {
    setNdc(e);
    const targets = [...chars.flatMap(m => m.meshes), ...props.flatMap(p => { const a = []; p.traverse(o => { if (o.isMesh && !o.userData.isHull) a.push(o); }); return a; }),
      ...extraLights.map(g => g.userData.ref.bulb), ...chars.flatMap(m => m.avatar ? m.avatar.meshes : [])];
    const hit = ray.intersectObjects(targets, false)[0];
    if (!hit) select(null);
    else if (hit.object.userData.lightRoot) selectObj(hit.object.userData.lightRoot);
    else if (hit.object.userData.propRoot) selectObj(hit.object.userData.propRoot);
    else if (hit.object.userData.avatarOf) {
      const owner = hit.object.userData.avatarOf, ci = chars.indexOf(owner); let best = null, bd = Infinity;
      for (const n of DOT_JOINTS) { const j = owner.joints[n]; if (!j || (n.startsWith('tail') && !owner.hasTail)) continue; const d = j.getWorldPosition(new V3()).distanceTo(hit.point); if (d < bd) { bd = d; best = n; } }
      if (ci !== active) setActive(ci);
      select(best);
    }
    else {
      const ci = chars.findIndex(m => m.meshes.includes(hit.object));
      const owner = chars[ci], jn = owner.pick(hit);
      if (ci !== active) setActive(ci);
      select(jn);
      if (jn && jn.startsWith('wrist') && state.handSide !== 'both') { state.handSide = jn.slice(-1); setPressed($('#handSide'), state.handSide); syncHandUI(); }
    }
  }
  down = null;
});
vp.addEventListener('pointercancel', endDrag);
tc.addEventListener('dragging-changed', e => { controls.enabled = !e.value; if (e.value) gizmoDragged = true; });
tc.addEventListener('objectChange', () => {
  const s = state.sel; if (s && s.kind === 'joint') tourEvent('rotate');
  if (s && s.kind === 'joint') {
    const n = state.selected;
    if (n && HINGE[n]) { const j = mq.joints[n]; j.rotation.set(clamp(hingeAngle(j.quaternion), HINGE[n][0] * DEG, HINGE[n][1] * DEG), 0, 0, 'XYZ'); }
    if (state.sym && n) mirrorJoint(mq, n);
    syncJointSliders();
  } else if (s && s.kind === 'prop' && s.obj.position.y < 0) s.obj.position.y = 0;
});
tc.addEventListener('mouseUp', () => { if (state.sel) pushHistory(); });
addEventListener('keydown', e => {
  if (e.target.matches('input[type=text],input[type=search],input:not([type]),textarea')) return;
  const k = e.key.toLowerCase();
  if (sk.on && (e.ctrlKey || e.metaKey) && (k === 'z' || k === 'y')) { e.preventDefault(); (k === 'y' || e.shiftKey ? $('#skRedo') : $('#skUndo')).click(); }
  else if ((e.ctrlKey || e.metaKey) && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  else if ((e.ctrlKey || e.metaKey) && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
  else if (k === 'delete' || k === 'backspace') { if (state.sel && state.sel.kind !== 'joint') { e.preventDefault(); deleteSel(); } }
  else if (k === 'i' && !e.ctrlKey && !e.metaKey && !sk.on && !practice.active) { setIK(!state.ik); }
  else if (k === 'escape') { if (TOUR.on) tourEnd(false); else if (!$('#welcome').hidden) closeWelcome(); else if (!$('#helpModal').hidden) closeHelp(); else if (practice.active) stopPractice(); else if (!$('#exportModal').hidden) closeExport(); else select(null); }
  else if (e.ctrlKey || e.metaKey || e.altKey || sk.on) return;
  else if (/^[1-6]$/.test(k) && !practice.active) { showTab(tabs[+k - 1].dataset.tab); setPanel(true); }
  else if (k === '\\') setPanel(document.body.classList.contains('nopanel'));
  else if (e.key === '?') openHelp();
});

/* ---------- render loop ---------- */
let W = 1, Hh = 1;
function resize() {
  const r = vp.getBoundingClientRect(); W = Math.max(1, r.width); Hh = Math.max(1, r.height);
  renderer.setSize(W, Hh, false);
  camera.aspect = W / Hh; camera.setFocalLength(state.focal); camera.updateProjectionMatrix();
  const pr = Math.min(devicePixelRatio, 2);
  ov.width = W * pr; ov.height = Hh * pr; octx.setTransform(pr, 0, 0, pr, 0, 0);
  LU.uPx.value.set(2 / W, 2 / Hh); LU.uDpr.value = pr;
  sizeSketch();
}
new ResizeObserver(resize).observe(vp);
function updateHandles() {
  const show = !practice.active && !sk.hideFig && !sk.on, coarse = matchMedia('(pointer: coarse)').matches ? 1.6 : 1;
  for (const n of DOT_JOINTS) {
    const d = jointDots[n], j = mq.joints[n];
    d.visible = show && state.dots && !!j && !(n.startsWith('tail') && !mq.hasTail) && !(n === 'hips' && state.ik);
    if (!d.visible) continue;
    j.getWorldPosition(_hp); d.position.copy(_hp);
    d.scale.setScalar(camera.position.distanceTo(_hp) * Math.tan(camera.fov * DEG / 2) * (state.ik ? .013 : .017) * coarse);
    d.children[0].material = state.selected === n ? DOT_SEL : DOT_FILL;
  }
  for (const id in handles) {
    const h = handles[id]; h.visible = show && (state.ik || id === 'hips') && !(id === 'hips' && !state.ik && state.dots);
    mq.joints[EFFECTOR[id]].getWorldPosition(_hp); h.position.copy(_hp);
    h.scale.setScalar(camera.position.distanceTo(_hp) * Math.tan(camera.fov * DEG / 2) * (id === 'hips' ? .03 : .026) * coarse);
  }
}
function updateStools() {
  for (const m of chars) {
    const s = m.stoolMesh; s.visible = m.stool; if (!m.stool) continue;
    const hp = m.joints.hips.getWorldPosition(new V3()), back = new V3(0, 0, -1).applyQuaternion(m.joints.hips.quaternion); back.y = 0;
    const hs = Math.max(.12, hp.y - .1 * m.size);
    s.position.set(hp.x + back.x * .04, 0, hp.z + back.z * .04);
    s.userData.seat.position.y = hs - .022; s.userData.leg.scale.y = hs - .04; s.userData.leg.position.y = (hs - .04) / 2;
  }
}
function frame() {
  if (!mq) return;
  controls.update(); updateLights(); envTick(); avatarsTick(); updateOcclusion(); updateHandles(); updateStools(); updateSun(); clothTick(); anthroTick();
  for (const m of chars) m.group.visible = !sk.hideFig;
  renderer.render(scene, camera); drawOverlay(octx, W, Hh);
}
renderer.setAnimationLoop(frame);

/* ---------- export ---------- */
const ex = {bg: 'paper', size: 2};
function renderExport() {
  const lines = ex.bg === 'lines', alpha = ex.bg === 'alpha' || lines;
  const vis = {tc: tc.visible, bg: scene.background, env: envGroup && envGroup.visible, grid: grid.visible, fog: scene.fog, sky: sky.visible, style: state.style, render: LU.uRender.value};
  const hidden = [...Object.values(handles), sunHandle, sunRing, ...extraLights.flatMap(g => g.children.filter(c => c.isMesh)), ...(ghostMesh ? [ghostMesh] : [])];
  const hv = hidden.map(h => h.visible);
  tc.visible = false; hidden.forEach(h => h.visible = false);
  if (alpha) { scene.background = null; if (envGroup) envGroup.visible = false; grid.visible = false; sky.visible = false; scene.fog = null; renderer.setClearColor(0, 0); }
  if (lines) { for (const m of chars) m.setStyle('contorno'); LU.uRender.value = 0; }
  const pr = renderer.getPixelRatio(), lw = LU.uLineW.value, dpr = LU.uDpr.value;
  LU.uLineW.value = lw * ex.size / pr; LU.uDpr.value = ex.size;
  renderer.setPixelRatio(ex.size); renderer.setSize(W, Hh, false);
  updateLights(); updateStools(); renderer.render(scene, camera);
  const f = frameRect(W, Hh), k = ex.size;
  const out = document.createElement('canvas'); out.width = Math.round(f.w * k); out.height = Math.round(f.h * k);
  const c = out.getContext('2d');
  c.drawImage(renderer.domElement, f.x * k, f.y * k, f.w * k, f.h * k, 0, 0, out.width, out.height);
  if (lines) { // keep only the ink: paper-white becomes transparent, darker strokes stay
    const id = c.getImageData(0, 0, out.width, out.height), d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const L = (d[i] * .299 + d[i + 1] * .587 + d[i + 2] * .114) / 255, a = clamp((.93 - L) / .55, 0, 1);
      d[i + 3] = Math.round(d[i + 3] * a); d[i] *= .6; d[i + 1] *= .6; d[i + 2] *= .6;
    }
    c.putImageData(id, 0, 0);
  }
  c.save(); c.scale(k, k); c.translate(-f.x, -f.y);
  if ($('#exGuides').checked && (state.guides.thirds || state.guides.persp || state.guides.ruler || state.guides.action)) { c.noFrame = true; drawOverlay(c, W, Hh); }
  c.restore();
  if ($('#exSketch').checked && sk.strokes.length) c.drawImage(sketchCanvas(k), f.x * k, f.y * k, f.w * k, f.h * k, 0, 0, out.width, out.height);
  renderer.setPixelRatio(pr); renderer.setSize(W, Hh, false); LU.uLineW.value = lw; LU.uDpr.value = dpr;
  if (lines) { for (const m of chars) m.setStyle(vis.style); LU.uRender.value = vis.render; }
  tc.visible = vis.tc; scene.background = vis.bg; if (envGroup) envGroup.visible = vis.env; grid.visible = vis.grid; scene.fog = vis.fog; sky.visible = vis.sky;
  hidden.forEach((h, i) => h.visible = hv[i]);
  ex.canvas = out; $('#exImg').src = out.toDataURL('image/png');
  $('#exMsg').textContent = tr('{w} × {h} px. Pulsa «Guardar PNG» o copia la imagen para pegarla en tu programa de dibujo.', {w: out.width, h: out.height});
}
function openExport() { tourEvent('export'); $('#exportModal').hidden = false; renderExport(); $('#exSave').focus(); }
function closeExport() { $('#exportModal').hidden = true; }
$('#exportBtn').onclick = openExport; $('#exClose').onclick = closeExport;
$('#exportModal').onclick = e => { if (e.target.id === 'exportModal') closeExport(); };
bindChipGroup('#exBg', v => { ex.bg = v; renderExport(); });
bindChipGroup('#exSize', v => { ex.size = +v; renderExport(); });
$('#exGuides').onchange = renderExport;
$('#exSave').onclick = () => {
  const a = document.createElement('a'), d = new Date(), pad = n => String(n).padStart(2, '0');
  a.download = `pose-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`;
  // Android (Capacitor): no downloads in the WebView, so write the PNG to the cache and open the share sheet (Galería, Drive, Telegram…)
  const cap = window.Capacitor;
  if (cap && cap.isNativePlatform && cap.isNativePlatform()) {
    const call = (pl, m, o) => cap.Plugins && cap.Plugins[pl] ? cap.Plugins[pl][m](o) : cap.nativePromise(pl, m, o);
    call('Filesystem', 'writeFile', {path: a.download, data: $('#exImg').src.split(',')[1], directory: 'CACHE'})
      .then(r => call('Share', 'share', {title: 'NEOPOSE', files: [r.uri]}))
      .catch(e => { if (!/cancel/i.test(String(e && e.message))) $('#exMsg').textContent = tr('No se ha podido guardar la imagen: ') + (e && e.message || e); });
    return;
  }
  a.href = $('#exImg').src; document.body.appendChild(a); a.click(); a.remove();
};
$('#exCopy').onclick = () => {
  const msg = $('#exMsg'), fail = () => msg.textContent = tr('Aquí no se puede copiar la imagen. Haz clic derecho sobre ella y elige «Guardar imagen».');
  try {
    if (!navigator.clipboard || !window.ClipboardItem) throw 0;
    navigator.clipboard.write([new ClipboardItem({'image/png': new Promise(r => ex.canvas.toBlob(r, 'image/png'))})])
      .then(() => msg.textContent = tr('Imagen copiada. Pégala en tu programa de dibujo con Ctrl+V.')).catch(fail);
  } catch (_) { fail(); }
};

/* ---------- gesture practice ---------- */
const practice = {active: false, dur: 30, count: 10, i: 0, left: 0, paused: false, last: 0, prevId: null, timer: null, done: false};
let audioCtx;
function beep() {
  if (!$('#prSound').checked) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = 880; g.gain.setValueAtTime(.0001, audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(.2, audioCtx.currentTime + .01); g.gain.exponentialRampToValueAtTime(.0001, audioCtx.currentTime + .25);
    o.connect(g).connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + .3);
  } catch (_) {}
}
bindChipGroup('#prDur', v => practice.dur = +v);
bindChipGroup('#prCount', v => practice.count = +v);
$('#practiceBtn').onclick = () => { if (practice.active) return stopPractice(); $('#practiceModal').hidden = false; $('#prStart').focus(); };
$('#prCancel').onclick = () => $('#practiceModal').hidden = true;
$('#practiceModal').onclick = e => { if (e.target.id === 'practiceModal') $('#practiceModal').hidden = true; };
$('#prStart').onclick = () => { $('#practiceModal').hidden = true; startPractice(); };
// the options are remembered between sessions; body variety only applies with random bodies on
const PR_OPTS = ['prVar', 'prGen', 'prCam', 'prLight', 'prSound', 'prBody', 'prAnthro', 'prChibi', 'prEnv', 'prProps'];
const savePractice = () => store.set('cdp.practice', {...Object.fromEntries(PR_OPTS.map(k => [k, $('#' + k).checked])), prClothes: practice.clothes});
function syncPracticeOpts() { const on = $('#prBody').checked; $('#prBodyOpts').classList.toggle('off', !on); $$('#prBodyOpts input').forEach(i => i.disabled = !on); }
{ const saved = store.get('cdp.practice', {});
  for (const id of PR_OPTS) { const el = $('#' + id); if (typeof saved[id] === 'boolean') el.checked = saved[id];
    el.addEventListener('change', () => { savePractice(); syncPracticeOpts(); }); }
  practice.clothes = ['keep', 'set', 'random'].includes(saved.prClothes) ? saved.prClothes : 'keep'; setPressed($('#prClothes'), practice.clothes);
  bindChipGroup('#prClothes', v => { practice.clothes = v; savePractice(); });
  syncPracticeOpts(); }
// a random body per pose: any preset (chibi a quarter of the time, only if asked) nudged a little, anthro half of the time if asked
function randomizeBody(m, o) {
  const pick = a => a[Math.floor(Math.random() * a.length)], R = (a, b) => a + Math.random() * (b - a);
  const id = o.chibi && Math.random() < .25 ? 'chibi' : pick(Object.keys(BODY_PRESETS).filter(k => k !== 'chibi'));
  const b = bodyOf(id);
  for (const k of ['muscle', 'weight', 'height']) b[k] = clamp(b[k] + R(-.15, .15), 0, 1);
  if (id === 'chibi') b.gender = Math.random();
  if (o.anthro && Math.random() < .5) {
    b.species = pick(Object.keys(SPECIES).filter(k => k !== 'humano'));
    const heads = Object.keys(HEAD_CATALOG).filter(k => HEAD_CATALOG[k].species.includes(b.species));
    if (heads.length) b.headModel = pick(heads);
  }
  m.bodyPreset = id; m.build(b);
}
function randomEnv() {
  const ids = Object.keys(SCENES).filter(k => k !== 'vacio' && k !== state.env), id = ids[Math.floor(Math.random() * ids.length)];
  $('#envChips').querySelectorAll('.chip').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === id)));
  return setEnv(id);
}
const pickOne = a => a[Math.floor(Math.random() * a.length)];
const shuffled = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
// clothes: one of the outfits, or garments drawn from the whole library; what an anthro cannot wear is left out quietly
async function dressRandom(m, mode) {
  await loadCatalog();
  const specs = mode === 'set' ? pickOne(Object.values(OUTFITS))[1] : await randomOutfit();
  setOutfit(m, specs.filter(s => !garmentBlock(m, ROPA.byId[s.id])));
}
// something in one hand of every character, tried object by object and hand by hand until it touches nothing
practice.props = [];
function dropPracticeProp(g) {
  const h = g.userData.prevHand; releaseProp(g); scene.remove(g); const i = props.indexOf(g); if (i >= 0) props.splice(i, 1);
  if (h) { h.m.hands[h.side] = h.hand; h.m.applyHands(); }
}
function clearPracticeProps() { for (const g of practice.props) dropPracticeProp(g); practice.props = []; }
async function equipPractice(tok, caps) {
  const boxes = sceneryBoxes();
  let all = true;
  for (const m of shuffled(chars)) {
    const sides = shuffled(['L', 'R'].filter(s => !props.some(p => p.userData.held && p.userData.held.m === m && p.userData.held.side === s)));
    let ok = null;
    for (const id of shuffled(HOLDABLE).slice(0, 6)) {
      const g = makeProp(id, new V3()); g.visible = false; await g.userData.ready;
      if (tok !== practice.tok) { dropPracticeProp(g); return true; }
      for (const side of sides) {
        const prev = {c: [...m.hands[side].c], s: m.hands[side].s};
        holdProp(g, m, side);
        if (!propCollides(g, caps, boxes)) { g.userData.prevHand = {m, side, hand: prev}; ok = g; break; }
        releaseProp(g); m.hands[side] = prev; m.applyHands();
      }
      if (ok) { ok.visible = true; practice.props.push(ok); break; }
      dropPracticeProp(g);
    }
    if (!ok) all = false;
  }
  return all;
}
const fmtT = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
function startPractice() {
  practice.saved = JSON.stringify({...snapshot(), ...sceneExtras(false)});
  practice.active = true; practice.i = 0; practice.paused = false; practice.done = false;
  document.body.classList.add('practicing'); $('#practiceBtn').lastChild.textContent = tr('Terminar práctica');
  select(null); if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  nextPose(); practice.last = performance.now(); practice.timer = setInterval(tick, 200);
}
function practicePose() {
  const n = chars.length, list = n === 1 ? POSES : GROUP_POSES[n], v = $('#prVar').checked ? 9 : 0;
  let p; do { p = list[Math.floor(Math.random() * list.length)]; } while (p.id === practice.prevId && list.length > 1);
  practice.prevId = p.id;
  if (n === 1 && $('#prGen').checked && Math.random() < .5) { mq.joints.hips.position.set(0, mq.rootY, 0); applyRandom(mq, 'cualquiera', false); mq.joints.hips.quaternion.premultiply(new Q().setFromAxisAngle(new V3(0, 1, 0), (Math.random() * 2 - 1) * Math.PI)); mq.ground(); }
  else if (n === 1) { mq.joints.hips.position.set(0, mq.rootY, 0); applyPreset(mq, p, {variation: v, yaw: (Math.random() * 2 - 1) * Math.PI}); }
  else applyGroupTo(chars, p, {variation: v * .6});
}
async function nextPose() {
  if (practice.busy) return;
  practice.i++;
  if (practice.count && practice.i > practice.count) return finishPractice();
  const tok = practice.tok = (practice.tok || 0) + 1, live = () => practice.active && tok === practice.tok;
  practice.busy = true; practice.left = practice.dur;
  try {
    setHideFig(false); clearPracticeProps(); showForcedScenery();
    if ($('#prBody').checked) { for (const m of chars) if (!m.avatar) randomizeBody(m, {anthro: $('#prAnthro').checked, chibi: $('#prChibi').checked}); renderCast(); }
    if (practice.clothes !== 'keep') await Promise.all(chars.filter(m => !m.avatar).map(m => dressRandom(m, practice.clothes).catch(e => console.error(e))));
    // the set has to be there before checking what a held object could hit
    if ($('#prEnv').checked) await randomEnv().catch(e => console.error(e));
    if (!live()) return;
    // with objects in hand, a pose where something would clip gets another try (and another pose)
    const tries = $('#prProps').checked ? 4 : 1;
    for (let k = 0; k < tries; k++) {
      practicePose(); showForcedScenery();
      const caps = chars.map(m => [m, bodyCapsules(m)]);
      hideClashingScenery(caps);
      if (tries === 1 || await equipPractice(tok, caps)) break;
      if (!live()) return;
      if (k < tries - 1) clearPracticeProps();
    }
    if (!live()) return;
    if ($('#prCam').checked) { const f = [24, 35, 50, 50, 85][Math.floor(Math.random() * 5)]; $('#focal').value = f; setFocal(f, false); frameAll(); setView(Math.random() * 360 - 180, Math.random() * 45 - 12); }
    frameAll();
    if ($('#prLight').checked) { const ks = Object.keys(LIGHTS); setLightPreset(ks[Math.floor(Math.random() * ks.length)]); }
  } finally { practice.busy = false; }
  practice.left = practice.dur; renderHud();
}
function tick() {
  const now = performance.now(), dt = (now - practice.last) / 1000; practice.last = now;
  if (practice.paused || practice.done || practice.busy) return;
  practice.left -= dt;
  if (practice.left <= 0) { beep(); nextPose(); } else renderHud();
}
function renderHud() {
  const hud = $('#hud'); hud.hidden = false;
  if (practice.done) {
    const total = practice.count ? practice.count : practice.i - 1;
    hud.innerHTML = `<h4>${tr('Sesión terminada')}</h4><div class="n">${tr('{n} poses · {t} de dibujo', {n: total, t: fmtT(total * practice.dur)})}</div>
      <div class="row"><button class="btn small" id="hAgain">${tr('Otra ronda')}</button><button class="btn small primary" id="hEnd">${tr('Volver al editor')}</button></div>`;
    $('#hAgain').onclick = () => { practice.i = 0; practice.done = false; hud.innerHTML = ''; nextPose(); practice.last = performance.now(); };
    $('#hEnd').onclick = () => stopPractice();
    return;
  }
  if (!hud.querySelector('.t')) {
    hud.innerHTML = `<div class="t" aria-live="off"></div><div class="n"></div><div class="bar"><i></i></div>
      <div class="row"><button class="btn small" id="hPause">${tr('Pausa')}</button><button class="btn small" id="hNext">${tr('Siguiente')}</button><button class="btn small" id="hStop">${tr('Terminar')}</button></div>
      <div class="row" style="margin-top:6px"><button class="btn small hideFigBtn" id="hHide">${tr('Ocultar figura')}</button><button class="btn small" id="hSketch">${tr('Dibujar encima')}</button></div>`;
    $('#hHide').onclick = () => setHideFig(!sk.hideFig); $('#hSketch').onclick = () => setSketch(!sk.on);
    $('#hPause').onclick = () => { practice.paused = !practice.paused; $('#hPause').textContent = tr(practice.paused ? 'Seguir' : 'Pausa'); };
    $('#hNext').onclick = () => nextPose(); $('#hStop').onclick = () => stopPractice();
  }
  const t = hud.querySelector('.t'); t.textContent = fmtT(practice.left); t.classList.toggle('warn', practice.left <= 5);
  hud.querySelector('.n').textContent = practice.count ? tr('Pose {i} de {n}', {i: practice.i, n: practice.count}) : tr('Pose {i}', {i: practice.i});
  hud.querySelector('.bar i').style.width = (practice.left / practice.dur * 100) + '%';
}
function finishPractice() { practice.done = true; practice.i = practice.count + 1; beep(); renderHud(); }
function stopPractice() {
  clearInterval(practice.timer); practice.active = false; practice.done = false; practice.tok = (practice.tok || 0) + 1; clearPracticeProps(); showForcedScenery();
  document.body.classList.remove('practicing'); $('#hud').hidden = true; $('#hud').innerHTML = '';
  $('#practiceBtn').lastChild.textContent = tr('Práctica');
  setHideFig(false);
  if (practice.saved) restore(practice.saved);
}

/* ---------- boot ---------- */
function boot(data) {
  addChar('hombre', null, false); mq = chars[0];
  mq.joints.hips.position.set(0, mq.rootY, 0); applyPreset(mq, POSE.contra); state.posePreset = 'contra';
  setEnv('estudio'); applyTheme();
  buildDrawUI(); buildBodyUI(); buildHandUI(); buildLightUI(); buildSceneUI(); buildCamUI(); buildToolsUI(); buildClothesUI(); buildClothUI(); buildExprUI(); buildHeadUI();
  setLightPreset('estudio');
  if (data && data.snap && data.snap.chars) { try { restore(data.snap); } catch (_) {} }
  setActive(Math.min(active, chars.length - 1));
  showTab(store.get('cdp.tab', 'pose'));
  initTour(); initAvatars();
  $$('#ikMode .chip').forEach(c => c.onclick = () => setIK(c.dataset.v === 'ik')); setIK(state.ik);
  $('#dotsChk').checked = state.dots; $('#dotsChk').onchange = e => { state.dots = e.target.checked; store.set('cdp.dots', state.dots); };
  initThumbs(); buildPoseGrid(); buildMyPoses();
  resize(); setView(30, 8); frameAll();
  if (data && data.snap && data.snap.cam) applySceneExtras({cam: data.snap.cam});
  pushHistory();
  window.claude?.hot?.snapshot?.(() => ({snap: snapshot()}));
}
