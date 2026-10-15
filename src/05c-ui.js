/* ---------- history ---------- */
const hist = {stack: [], i: -1};
const snapshot = () => ({chars: chars.map(m => ({body: {...m.body}, preset: m.bodyPreset, pose: m.getPose(), outfit: m.outfit})), active});
function pushHistory() {
  if (typeof animAutoKey === 'function') animAutoKey();
  const s = JSON.stringify({...snapshot(), ...sceneExtras(false), mv: typeof animHist === 'function' ? animHist() : undefined});
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
  if (o.mv && typeof animHistRestore === 'function') animHistRestore(o.mv);
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
      input: v => { mq.joints[state.selected].rotation[ax] = v * DEG; if (state.sym) mirrorJoint(mq, state.selected); enforcePins(mq, state.selected); }, change: pushHistory});
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
    seatButton(obj, extra);
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
$$('.mtnote').forEach(n => n.hidden = !LANGS_MACHINE.has(LANG));
/* the canvas hint steps back once the user has tried posing */
{ let n = store.get('cdp.hintN', 0); if (n >= 3) $('#hint').classList.add('quiet');
  $('#viewport').addEventListener('pointerdown', () => { if (++n === 3) $('#hint').classList.add('quiet'); store.set('cdp.hintN', n); }); }

/* body */
let bodyEls = {};
function buildBodyUI() {
  chips($('#bodyChips'), Object.entries(BODY_PRESETS).map(([k, v]) => [k, v.label]), mq.bodyPreset, id => {
    mq.body = {...bodyOf(id), species: mq.body.species, headStyle: mq.body.headStyle, kemo: mq.body.kemo, feet: mq.body.feet, expr: mq.body.expr, exprAmt: mq.body.exprAmt, hair: mq.body.hair, hairCol: mq.body.hairCol}; mq.bodyPreset = id; tourEvent('body'); rebuildActive(true); syncBodyUI(); pushHistory();
  });
  chips($('#speciesChips'), Object.entries(SPECIES).map(([k, v]) => [k, v.label]), mq.body.species, id => {
    mq.body.species = id; tourEvent('body'); rebuildActive(true); syncHeadUI(); syncExprUI(); renderHairUI(); pushHistory();
  });
  const mk2 = (box, list) => { box.innerHTML = ''; for (const [k, label, mn, mx, fmt] of list)
    bodyEls[k] = slider(box, {id: 'b_' + k, label, min: mn, max: mx, step: .01, value: mq.body[k], fmt: fmt || pctFmt,
      input: v => { mq.body[k] = v; mq.bodyPreset = null; setPressed($('#bodyChips'), ''); rebuildActive(); }, change: pushHistory}); };
  mk2($('#bodySliders'), BODY_SLIDERS); mk2($('#styleSliders'), STYLE_SLIDERS);
}
function syncBodyUI() {
  for (const k in bodyEls) bodyEls[k].set(mq.body[k]);
  setPressed($('#bodyChips'), mq.bodyPreset || ''); setPressed($('#speciesChips'), mq.body.species); if (typeof syncHeadUI === 'function') syncHeadUI(); if (typeof syncExprUI === 'function') syncExprUI(); if (typeof renderHairUI === 'function') renderHairUI();
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
let fingerEls = [], spreadEl, thumbEl;
const handTargets = () => state.handSide === 'both' ? ['L', 'R'] : [state.handSide];
function buildHandUI() {
  chips($('#gestureChips'), Object.entries(GESTURES).map(([k, v]) => [k, v.label]), null, id => { for (const s of handTargets()) mq.hands[s] = gest(id); mq.applyHands(); syncHandUI(); pushHistory(); });
  const box = $('#fingerSliders'); box.innerHTML = ''; fingerEls = [];
  FINGER_NAMES.forEach((label, i) => fingerEls.push(slider(box, {id: 'f_' + i, label, min: 0, max: 1, step: .01, value: 0, fmt: v => Math.round(v * 100),
    input: v => { for (const s of handTargets()) mq.hands[s].c[i] = v; mq.applyHands(); setPressed($('#gestureChips'), ''); }, change: pushHistory})));
  spreadEl = slider(box, {id: 'f_spread', label: 'Separación de dedos', min: 0, max: 1, step: .01, value: 0, fmt: v => Math.round(v * 100),
    input: v => { for (const s of handTargets()) mq.hands[s].s = v; mq.applyHands(); setPressed($('#gestureChips'), ''); }, change: pushHistory});
  thumbEl = slider(box, {id: 'f_thumb', label: 'Pulgar hacia la palma', min: 0, max: 1, step: .01, value: 0, fmt: v => Math.round(v * 100),
    input: v => { for (const s of handTargets()) mq.hands[s].t = v; mq.applyHands(); setPressed($('#gestureChips'), ''); }, change: pushHistory});
  bindChipGroup('#handSide', v => { state.handSide = v; syncHandUI(); });
}
function syncHandUI() { const h = mq.hands[handTargets()[0]]; fingerEls.forEach((el, i) => el.set(h.c[i])); spreadEl.set(h.s); thumbEl.set(h.t || 0); }

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
  for (const [g, label] of [['in', 'Interiores'], ['out', 'Exteriores'], ['pano', 'Panoramas 360°'], ['x', 'Otros']]) {
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
let rollEl;
function setRoll(v) { state.roll = v || 0; if (rollEl) rollEl.set(state.roll); }
function buildCamUI() {
  chips($('#viewChips'), VIEWS.map(v => [v[0], v[0]]), null, id => { const v = VIEWS.find(x => x[0] === id); setView(v[1], v[2]); });
  $('#frameBtn').onclick = frameAll;
  rollEl = slider($('#rollBox'), {id: 'roll', label: 'Inclinación (plano holandés)', min: -45, max: 45, step: 1, value: state.roll, fmt: v => Math.round(v) + '°', input: v => state.roll = Math.abs(v) < 1.5 ? 0 : v, change: () => rollEl.set(state.roll)});
  rollEl.inp.ondblclick = () => setRoll(0);
  $('#focal').oninput = e => setFocal(+e.target.value, $('#dollyChk').checked);
  for (const mm of LENSES) { const b = document.createElement('button'); b.type = 'button'; b.textContent = mm; b.title = mm + ' mm'; b.onclick = () => { $('#focal').value = mm; setFocal(mm, $('#dollyChk').checked); }; $('#lensTicks').appendChild(b); }
  const link = (id, k, after) => { const el = $(id); el.checked = state.guides[k]; el.onchange = () => { state.guides[k] = el.checked; after && after(); }; };
  link('#gThirds', 'thirds'); link('#gPersp', 'persp'); link('#gGrid', 'grid', () => grid.visible = state.guides.grid);
  link('#gRuler', 'ruler');
  grid.visible = state.guides.grid;
}
