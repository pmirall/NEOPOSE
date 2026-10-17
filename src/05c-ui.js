/* ---------- history ---------- */
const hist = {stack: [], i: -1};
const snapshot = () => ({chars: chars.map(m => ({body: {...m.body}, preset: m.bodyPreset, pose: m.getPose(), outfit: m.outfit})), active});
function pushHistory() {
  if (typeof animAutoKey === 'function') animAutoKey();
  const s = JSON.stringify({...snapshot(), ...sceneExtras(false), mv: typeof animHist === 'function' ? animHist() : undefined});
  if (hist.stack[hist.i] === s) return;
  hist.stack = hist.stack.slice(0, hist.i + 1); hist.stack.push(s);
  if (hist.stack.length > 80) hist.stack.shift();
  hist.i = hist.stack.length - 1; updateUndo(); autosaveSoon(); if (typeof wake === 'function') wake();
  // someone joined (or left) the cast or a body changed shape: make room in the frame if needed
  const sig = chars.length + JSON.stringify(chars.map(m => [m.body.species, m.body.headStyle, m.heads, m.size]));
  if (hist.castSig && sig !== hist.castSig) reframeSoon();
  hist.castSig = sig;
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
    if (m.avatar && (m.body.avatarScale || 1) !== m.avatar.k) setAvatarScale(m, m.body.avatarScale || 1);
    if (c.outfit && JSON.stringify(c.outfit) !== JSON.stringify(m.outfit)) setOutfit(m, c.outfit);
    else if (!c.outfit && m.outfit.length) setOutfit(m, []);
  });
  applySceneExtras(o);
  setActive(Math.min(o.active || 0, chars.length - 1));
  if (o.mv && typeof animHistRestore === 'function') animHistRestore(o.mv);
}
function undo() { if (hist.i > 0) { restore(hist.stack[--hist.i]); updateUndo(); autosaveSoon(); return true; } return false; }
function redo() { if (hist.i < hist.stack.length - 1) { restore(hist.stack[++hist.i]); updateUndo(); autosaveSoon(); return true; } return false; }
function updateUndo() { $('#undo').disabled = $('#undoF').disabled = hist.i <= 0; $('#redo').disabled = $('#redoF').disabled = hist.i >= hist.stack.length - 1; }
/* ---------- the scene survives a reload, a closed tab or an update ----------
   A moment after each change (and whenever the page is hidden) the whole scene (cast, set, camera, look and film)
   goes to IndexedDB, or to localStorage where there is none; the next start brings it back, with a way to begin
   afresh. Nothing is kept while the scene is still the one the app starts with. */
const AUTO = {key: 'cdp.autosave', t: 0, base: null};
const histStr = () => JSON.stringify({...snapshot(), ...sceneExtras(false), mv: typeof animHist === 'function' ? animHist() : undefined});
const idb = (() => {
  let db = null;
  const open = () => db || (db = new Promise((ok, ko) => { const r = indexedDB.open('neopose', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); }));
  const run = (mode, fn) => open().then(d => new Promise((ok, ko) => { const t = d.transaction('kv', mode), q = fn(t.objectStore('kv')); t.oncomplete = () => ok(q.result); t.onerror = t.onabort = () => ko(t.error); }));
  return {get: k => run('readonly', s => s.get(k)), set: (k, v) => run('readwrite', s => s.put(v, k)), del: k => run('readwrite', s => s.delete(k))};
})();
function autosaveSoon(ms = 1200) { if (AUTO.base === null) return; clearTimeout(AUTO.t); AUTO.t = setTimeout(autosaveNow, ms); }
// leaving: the page may go before IndexedDB has written, so a copy goes to localStorage at once too (if it fits);
// the newer of the two is read back
function autosaveNow(e) {
  if (AUTO.base === null) return; clearTimeout(AUTO.t);
  // not in the middle of a practice session (random scenes), a playing film or a script being staged
  if (practice.active || ANIM.playing || ANIM.busy || (typeof SC !== 'undefined' && SC.busy)) return e ? undefined : autosaveSoon(3000);
  const an = animState(), data = histStr() !== AUTO.base || an ? JSON.stringify({v: 1, t: Date.now(), ...snapshot(), ...sceneExtras(true)}) : null;
  const ls = () => { try { if (data) localStorage.setItem(AUTO.key, data); else localStorage.removeItem(AUTO.key); } catch (_) {} };
  if (e) ls();
  try { (data ? idb.set(AUTO.key, data) : idb.del(AUTO.key)).then(() => { if (!e) try { localStorage.removeItem(AUTO.key); } catch (_) {} }, ls); } catch (_) { ls(); }
}
function readAutosave() {
  if (/^#s=/.test(location.hash)) return Promise.resolve(null);  // a shared scene is what this start is for
  const parse = v => { try { return v ? JSON.parse(v) : null; } catch (_) { return null; } };
  let p; try { p = idb.get(AUTO.key).catch(() => null); } catch (_) { p = Promise.resolve(null); }
  return p.then(v => { let l = null; try { l = localStorage.getItem(AUTO.key); } catch (_) {} const a = parse(v), b = parse(l); return a && b ? ((b.t || 0) > (a.t || 0) ? b : a) : a || b; });
}
// "Start afresh": the scene the app starts with (kept before the saved one came back); undo still has the other
function startFresh() {
  if (!AUTO.fresh) return;
  if (ANIM.open) openTimeline(false);
  ANIM.shots = []; ANIM.cur = 0; restore(AUTO.fresh); setView(30, 8); frameAll(); pushHistory();
}
function initAutosave(restored, recovered) {
  if (!restored) AUTO.base = hist.stack[hist.i];
  addEventListener('pagehide', autosaveNow);
  document.addEventListener('visibilitychange', e => { if (document.visibilityState === 'hidden') autosaveNow(e); });
  controls.addEventListener('end', () => autosaveSoon(2500));  // the camera is part of it
  if (recovered) toast(tr('Escena recuperada'), {act: ['Empezar de cero', startFresh], ms: 9000});
}
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
  set(o.value); parent.appendChild(wrap); sliderExtras(wrap, inp, out, o);
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
  tabs.forEach(t => { t.setAttribute('aria-selected', String(t.dataset.tab === id)); t.tabIndex = t.dataset.tab === id ? 0 : -1; });
  $$('.page section').forEach(s => s.hidden = s.dataset.tab !== id);
  state.tab = id;
  store.set('cdp.tab', id);
  // the garment library (1.3 MB) is fetched the first time it is shown, not at start
  if (id === 'ropa' && typeof renderLibrary === 'function' && typeof ROPA !== 'undefined' && !ROPA.catalog) renderLibrary();
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
/* help: opens at the top (focusing the button at its foot must not scroll the sheet down) */
const openHelp = () => { $('#setModal').hidden = true; $('#helpModal').hidden = false; $('#helpModal .sheet').scrollTop = 0; $('#helpClose').focus({preventScroll: true}); };
const closeHelp = () => { $('#helpModal').hidden = true; };
$('#helpBtn').onclick = openHelp; $('#helpClose').onclick = closeHelp;
$('#helpModal').onclick = e => { if (e.target === e.currentTarget) closeHelp(); };
/* settings: language, theme, graphics quality, offline (the phone's top bar has no room for the gear: Help leads here) */
const openSettings = () => { closeHelp(); $('#setModal').hidden = false; $('#setModal .sheet').scrollTop = 0; };
const closeSettings = () => { $('#setModal').hidden = true; };
$('#setBtn').onclick = openSettings; $('#helpSet').onclick = openSettings; $('#setClose').onclick = closeSettings; $('#setHelp').onclick = openHelp;
$('#setModal').onclick = e => { if (e.target === e.currentTarget) closeSettings(); };
// light, dark or as the system says; the choice is applied before the first paint (a line at the top of the body)
const UI_THEMES = {system: 'Sistema', light: 'Claro', dark: 'Oscuro'};
function setTheme(t) {
  if (!UI_THEMES[t]) t = 'system'; store.set('cdp.theme', t);
  if (t === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  // the browser's bar follows too
  for (const m of $$('meta[name=theme-color]')) { m.dataset.c = m.dataset.c || m.content; m.content = t === 'system' ? m.dataset.c : t === 'dark' ? '#171614' : '#e4ddcb'; }
  setPressed($('#themeChips'), t);
}
chips($('#themeChips'), Object.entries(UI_THEMES), store.get('cdp.theme', 'system'), setTheme);
setTheme(store.get('cdp.theme', 'system'));
/* language: switching reloads the page and carries the current scene over */
function setLang(l) {
  if (l === LANG) return;
  store.set('cdp.lang', l);
  carryScene(); location.reload();
}
// the scene goes over a reload (a language switch, an update) in this tab at once
function carryScene() { if (!chars.length) return; try { sessionStorage.setItem('cdp.carry', JSON.stringify({...snapshot(), ...sceneExtras(true)})); } catch (e) {} }
$$('.langChips').forEach(c => chips(c, Object.entries(LANGS), LANG, setLang));
$$('.mtnote').forEach(n => n.hidden = !LANGS_MACHINE.has(LANG));
/* the canvas hint steps back once the user has tried posing */
{ let n = store.get('cdp.hintN', 0); if (n >= 3) $('#hint').classList.add('quiet');
  $('#viewport').addEventListener('pointerdown', () => { if (++n === 3) $('#hint').classList.add('quiet'); store.set('cdp.hintN', n); }); }

/* body */
let bodyEls = {};
function buildBodyUI() {
  chips($('#bodyChips'), Object.entries(BODY_PRESETS).map(([k, v]) => [k, v.label]), mq.bodyPreset, id => {
    mq.body = {...bodyOf(id), species: mq.body.species, headStyle: mq.body.headStyle, kemo: mq.body.kemo, snout: mq.body.snout, headModel: mq.body.headModel, feet: mq.body.feet, coat: mq.body.coat, tail: mq.body.tail, tailMove: mq.body.tailMove, pads: mq.body.pads, paws: mq.body.paws, fluff: mq.body.fluff, expr: mq.body.expr, exprAmt: mq.body.exprAmt, hair: mq.body.hair, hairCol: mq.body.hairCol}; mq.bodyPreset = id; tourEvent('body'); rebuildActive(true); syncBodyUI(); pushHistory();
  });
  // species by family, so the list reads like a field guide
  const fams = [['', ''], ['can', 'Cánidos'], ['fel', 'Felinos'], ['otro', 'Osos y prociónidos'], ['pre', 'Conejos y ungulados'], ['rep', 'Reptiles']], spBox = $('#speciesChips');
  spBox.innerHTML = ''; spBox.classList.add('spfam');
  for (const [f, title] of fams) {
    const list = Object.entries(SPECIES).filter(([, v]) => (v.fam || '') === f); if (!list.length) continue;
    const row = document.createElement('div'); row.className = 'chips';
    if (title) { const h = document.createElement('span'); h.className = 'famlbl'; h.textContent = tr(title); row.append(h); }
    for (const [k, v] of list) { const b = document.createElement('button'); b.className = 'chip'; b.type = 'button'; b.dataset.v = k; b.textContent = v.label; row.append(b); }
    spBox.append(row);
  }
  spBox.querySelectorAll('.chip').forEach(b => b.onclick = () => {
    const id = b.dataset.v; spBox.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c === b)));
    // a new species starts from its own head, coat and tail
    if (id !== mq.body.species) { mq.body.species = id; delete mq.body.coat; delete mq.body.tail; delete mq.body.headModel; delete mq.body.pads; }
    tourEvent('body'); tourEvent('species'); rebuildActive(true); restTail(mq); syncHeadUI(); syncExprUI(); syncCoatUI(); renderHairUI(); pushHistory();
  });
  const mk2 = (box, list) => { box.innerHTML = ''; for (const [k, label, mn, mx, fmt] of list)
    bodyEls[k] = slider(box, {id: 'b_' + k, label, min: mn, max: mx, step: .01, value: mq.body[k], fmt: fmt || pctFmt,
      input: v => { mq.body[k] = v; mq.bodyPreset = null; setPressed($('#bodyChips'), ''); rebuildActive(); }, change: pushHistory}); };
  mk2($('#bodySliders'), BODY_SLIDERS); mk2($('#styleSliders'), STYLE_SLIDERS);
  // how much the muscles answer to the pose (no rebuild: it scales the shapes as they are drawn)
  bodyEls.flex = slider($('#bodySliders'), {id: 'b_flex', label: 'Reacción muscular', min: 0, max: 1.5, step: .05, value: mq.body.flex ?? 1, fmt: pctFmt, input: v => { mq.body.flex = v; }, change: pushHistory});
  bodyEls.flex.inp.title = tr('Los músculos se hinchan, se acortan y mantienen el volumen al doblar las articulaciones');
}
function syncBodyUI() {
  for (const k in bodyEls) bodyEls[k].set(mq.body[k]);
  setPressed($('#bodyChips'), mq.bodyPreset || ''); setPressed($('#speciesChips'), mq.body.species); if (typeof syncHeadUI === 'function') syncHeadUI(); if (typeof syncCoatUI === 'function') syncCoatUI(); if (typeof syncExprUI === 'function') syncExprUI(); if (typeof renderHairUI === 'function') renderHairUI();
  $('#headsOut').textContent = dec(mq.heads);
  if (typeof syncAdvancedUI === 'function') { syncAdvancedUI(); renderBuilds(); }
  if (typeof syncLimbsUI === 'function') syncLimbsUI();
  if (typeof syncDynamicsUI === 'function') syncDynamicsUI();
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
  $('#clearLights').onclick = () => { if (!extraLights.length) return; tc.detach(); $('#objCard').hidden = true; state.sel = null; for (const g of [...extraLights]) { scene.remove(g); if (g.userData.ref.light.isSpotLight) scene.remove(g.userData.ref.light.target); } extraLights.length = 0; pushHistory(); toast(tr('Luces quitadas'), {undo: true}); };
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
  const ACCESS = ['sillaRuedas', 'muleta', 'muletas', 'bastonPaseo', 'andador', 'baston'];
  for (const [label, items] of [['Muebles y objetos', Object.entries(ASSET_PROPS).map(([k, v]) => [k, v[0]])], ['Accesibilidad', ACCESS.map(k => [k, PROPS[k]])], ['Formas básicas', Object.entries(PROPS).filter(([k]) => !ACCESS.includes(k))]]) {
    const c = document.createElement('div'); c.className = 'chips';
    if (label === 'Formas básicas') { const d = document.createElement('details'); d.className = 'more'; const sm = document.createElement('summary'); sm.textContent = tr(label); d.append(sm, c); pb.append(d); }
    else { const h = document.createElement('p'); h.className = 'lbl'; h.textContent = tr(label); pb.append(h, c); }
    chips(c, items, null, id => { setPressed(c, ''); const g = makeProp(id, spotNear()); setOutlines(g, state.envOutline); selectObj(g); pushHistory(); });
  }
  $('#clearProps').onclick = () => { if (!props.length) return; if (state.sel && state.sel.kind === 'prop') { tc.detach(); state.sel = null; $('#objCard').hidden = true; } clearProps(); pushHistory(); toast(tr('Objetos quitados'), {undo: true}); };
  $('#delChar').onclick = () => { if (chars.length < 2) return; const n = charLabel(mq); removeChar(active); pushHistory(); toast(tr('{x}: fuera de la escena', {x: n}), {undo: true}); };
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
