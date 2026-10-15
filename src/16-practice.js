/* ---------- gesture practice ----------
   Free sessions (fixed time per pose) or classes (blocks of rising length, as in a life-drawing class), a focus
   (whole figure, hands, feet, heads, foreshortening), memory mode, random bodies, clothes, sets and objects in hand.
   Every finished pose is logged per day for the week chart; sketches drawn over a pose are kept for the summary. */
const practice = {active: false, mode: 'libre', dur: 30, count: 10, cls: 'corta', focus: 'figura', mem: 10, clothes: 'keep',
  queue: [], i: 0, left: 0, paused: false, last: 0, prevId: null, timer: null, done: false, props: [], history: [], gallery: [], shownAt: 0};
const CLASSES = {
  calentamiento: {label: 'Calentamiento', steps: [[30, 10], [60, 5]]},
  corta: {label: 'Clase corta', steps: [[30, 6], [60, 4], [120, 2], [300, 1]]},
  progresiva: {label: 'De 30 s a 10 min', steps: [[30, 4], [60, 3], [120, 2], [300, 1], [600, 1]]},
  larga: {label: 'Clase larga', steps: [[30, 10], [60, 5], [300, 3], [600, 1]]}
};
const FOCUS_NOTE = {
  figura: 'Poses completas, de uno a cuatro personajes.',
  manos: 'Primer plano de una mano: gesto, giro de muñeca y ángulo distintos en cada pose.',
  pies: 'Primer plano de un pie, apoyado o en el aire, desde ángulos variados.',
  cabezas: 'La cabeza girada e inclinada en cada pose; con un anthro, también su expresión.',
  escorzo: 'Gran angular, cámara cerca y picados o contrapicados fuertes: brazos y piernas hacia ti.'
};
const fmtT = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const fmtDur = s => s < 60 ? `${s} s` : s % 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s / 60} min`;
const pickOne = a => a[Math.floor(Math.random() * a.length)];
const shuffled = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const rnd = (a, b) => a + Math.random() * (b - a);

/* sound */
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

/* ---------- log: poses and seconds per day ---------- */
const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function logPose(sec) {
  if (sec < 5) return;
  const log = store.get('cdp.practiceLog', {}), k = dayKey(), e = log[k] || {poses: 0, sec: 0};
  e.poses++; e.sec += Math.round(sec); log[k] = e;
  for (const old of Object.keys(log).sort().slice(0, -90)) delete log[old];
  store.set('cdp.practiceLog', log);
}
function practiceStats() {
  const log = store.get('cdp.practiceLog', {}), days = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push({d, ...(log[dayKey(d)] || {poses: 0, sec: 0})}); }
  let streak = 0; const d = new Date(); if (!log[dayKey(d)]) d.setDate(d.getDate() - 1);
  while (log[dayKey(d)]) { streak++; d.setDate(d.getDate() - 1); }
  return {days, streak, today: days[6], any: Object.keys(log).length > 0};
}
function renderStats() {
  const box = $('#prStats'), st = practiceStats();
  if (!st.any) { box.innerHTML = ''; return; }
  const max = Math.max(60, ...st.days.map(x => x.sec)), wd = new Intl.DateTimeFormat(LANG, {weekday: 'narrow'}), long = new Intl.DateTimeFormat(LANG, {weekday: 'long'});
  const bars = st.days.map(x => `<i class="${x.sec ? '' : 'zero'}" style="height:${Math.max(2, x.sec / max * 44)}px" data-tip="${long.format(x.d)}: ${tr('{n} poses · {m} min', {n: x.poses, m: Math.round(x.sec / 60)})}"></i>`).join('');
  box.innerHTML = `<div><div class="prbars" role="img" aria-label="${tr('Minutos de práctica de los últimos 7 días')}: ${st.days.map(x => Math.round(x.sec / 60)).join(', ')}">${bars}</div>
    <div class="prdays">${st.days.map(x => `<span>${wd.format(x.d)}</span>`).join('')}</div></div>
    <div class="prfigs"><b>${st.streak}</b>${tr(st.streak === 1 ? 'día seguido' : 'días seguidos')}<span>${tr('Hoy: {n} poses · {m} min', {n: st.today.poses, m: Math.round(st.today.sec / 60)})}</span></div>`;
}

/* ---------- setup sheet ---------- */
const PR_OPTS = ['prVar', 'prGen', 'prCam', 'prLight', 'prSound', 'prBody', 'prAnthro', 'prChibi', 'prEnv', 'prProps', 'prMemory'];
const savePractice = () => store.set('cdp.practice', {...Object.fromEntries(PR_OPTS.map(k => [k, $('#' + k).checked])),
  prClothes: practice.clothes, mode: practice.mode, dur: practice.dur, count: practice.count, cls: practice.cls, focus: practice.focus, mem: practice.mem});
function customDur() { return clamp((+$('#prCustomMin').value || 0) * 60 + (+$('#prCustomSec').value || 0), 5, 3600); }
function buildQueue() {
  if (practice.mode === 'clase') return CLASSES[practice.cls].steps.flatMap(([s, n]) => Array(n).fill(s));
  return practice.count ? Array(practice.count).fill(practice.dur) : [];
}
function syncPracticeOpts() {
  const on = $('#prBody').checked; $('#prBodyOpts').classList.toggle('off', !on); $$('#prBodyOpts input').forEach(i => i.disabled = !on);
  const mem = $('#prMemory').checked; $('#prMemoryOpts').classList.toggle('off', !mem); $$('#prMemoryOpts .chip').forEach(b => b.disabled = !mem);
  $('#prLibre').hidden = practice.mode !== 'libre'; $('#prClase').hidden = practice.mode !== 'clase';
  $('#prCustom').hidden = !$('#prDur [data-v=custom]').matches('[aria-pressed=true]');
  $('#prFocusNote').textContent = tr(FOCUS_NOTE[practice.focus]);
  // a close-up chooses its own camera
  $('#prCam').disabled = practice.focus !== 'figura'; $('#prCam').closest('.check').classList.toggle('off', practice.focus !== 'figura');
  $('#prPlan').innerHTML = CLASSES[practice.cls].steps.map(([s, n]) => `<li><b>${n} × ${tr(fmtDur(s))}</b><span>${tr('{m} min', {m: Number.isInteger(s * n / 60) ? s * n / 60 : dec(s * n / 60)})}</span></li>`).join('');
  const q = buildQueue(), tot = q.reduce((a, b) => a + b, 0);
  $('#prTotal').textContent = q.length ? tr('{n} poses · unos {m} min', {n: q.length, m: Math.round(tot / 60) || 1}) : tr('Sin límite: para cuando quieras');
}
function initPracticeUI() {
  const saved = store.get('cdp.practice', {});
  for (const id of PR_OPTS) { const el = $('#' + id); if (typeof saved[id] === 'boolean') el.checked = saved[id]; el.addEventListener('change', () => { savePractice(); syncPracticeOpts(); }); }
  practice.clothes = ['keep', 'set', 'random'].includes(saved.prClothes) ? saved.prClothes : 'keep';
  practice.mode = saved.mode === 'clase' ? 'clase' : 'libre';
  practice.dur = clamp(+saved.dur || 30, 5, 3600); practice.count = [0, 5, 10, 20].includes(saved.count) ? saved.count : 10;
  practice.cls = CLASSES[saved.cls] ? saved.cls : 'corta'; practice.focus = FOCUS_NOTE[saved.focus] ? saved.focus : 'figura'; practice.mem = [5, 10, 20].includes(saved.mem) ? saved.mem : 10;
  chips($('#prClass'), Object.entries(CLASSES).map(([k, c]) => [k, `${tr(c.label)} · ${tr('{m} min', {m: Math.round(c.steps.reduce((a, [s, n]) => a + s * n, 0) / 60)})}`]), practice.cls, v => { practice.cls = v; savePractice(); syncPracticeOpts(); });
  const isStd = [30, 60, 120, 300].includes(practice.dur);
  setPressed($('#prDur'), isStd ? practice.dur : 'custom');
  if (!isStd) { $('#prCustomMin').value = Math.floor(practice.dur / 60); $('#prCustomSec').value = practice.dur % 60; }
  setPressed($('#prCount'), practice.count); setPressed($('#prMode'), practice.mode); setPressed($('#prFocus'), practice.focus);
  setPressed($('#prMemSecs'), practice.mem); setPressed($('#prClothes'), practice.clothes);
  bindChipGroup('#prMode', v => { practice.mode = v; savePractice(); syncPracticeOpts(); });
  bindChipGroup('#prDur', v => { practice.dur = v === 'custom' ? customDur() : +v; savePractice(); syncPracticeOpts(); if (v === 'custom') $('#prCustomSec').focus(); });
  for (const id of ['#prCustomMin', '#prCustomSec']) $(id).addEventListener('input', () => { practice.dur = customDur(); savePractice(); syncPracticeOpts(); });
  bindChipGroup('#prCount', v => { practice.count = +v; savePractice(); syncPracticeOpts(); });
  bindChipGroup('#prFocus', v => { practice.focus = v; savePractice(); syncPracticeOpts(); });
  bindChipGroup('#prMemSecs', v => { practice.mem = +v; savePractice(); });
  bindChipGroup('#prClothes', v => { practice.clothes = v; savePractice(); });
  $('#practiceBtn').onclick = () => { if (practice.active) return stopPractice(); renderStats(); syncPracticeOpts(); $('#practiceModal').hidden = false; $('#practiceModal .sheet').scrollTop = 0; $('#prStart').focus({preventScroll: true}); };
  $('#prCancel').onclick = () => $('#practiceModal').hidden = true;
  $('#practiceModal').onclick = e => { if (e.target.id === 'practiceModal') $('#practiceModal').hidden = true; };
  $('#prStart').onclick = () => { $('#practiceModal').hidden = true; startPractice(); };
  $('#psClose').onclick = () => { $('#prSummary').hidden = true; stopPractice(); };
  $('#psAgain').onclick = () => { $('#prSummary').hidden = true; restartPractice(); };
  syncPracticeOpts();
}

/* ---------- random bodies, sets, clothes, objects ---------- */
// any preset (chibi a quarter of the time, only if asked) nudged a little, anthro half of the time if asked
function randomizeBody(m, o) {
  const id = o.chibi && Math.random() < .25 ? 'chibi' : pickOne(Object.keys(BODY_PRESETS).filter(k => k !== 'chibi'));
  const b = bodyOf(id);
  for (const k of ['muscle', 'weight', 'height']) b[k] = clamp(b[k] + rnd(-.15, .15), 0, 1);
  if (id === 'chibi') b.gender = Math.random();
  if (o.anthro && Math.random() < .5) {
    b.species = pickOne(Object.keys(SPECIES).filter(k => k !== 'humano'));
    const heads = Object.keys(HEAD_CATALOG).filter(k => HEAD_CATALOG[k].species.includes(b.species));
    if (heads.length) b.headModel = pickOne(heads);
  }
  // a hairstyle most of the time, grey or white on older people
  if (b.species === 'humano' && HAIR.list && Math.random() < .85) {
    b.hair = pickOne(HAIR.list).id;
    b.hairCol = pickOne(HAIR_COLORS.slice(...(b.age > 1.4 ? [7, 9] : Math.random() < .08 ? [9, 12] : [0, 7])))[0];
  }
  m.bodyPreset = id; m.build(b);
}
function randomEnv() {
  const ids = Object.keys(SCENES).filter(k => k !== 'vacio' && k !== state.env), id = pickOne(ids);
  $('#envChips').querySelectorAll('.chip').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === id)));
  return setEnv(id);
}
// one of the outfits, or garments drawn from the whole library; what an anthro cannot wear is left out quietly
async function dressRandom(m, mode) {
  await loadCatalog();
  const specs = mode === 'set' ? pickOne(Object.values(OUTFITS))[1] : await randomOutfit();
  setOutfit(m, specs.filter(s => !garmentBlock(m, ROPA.byId[s.id])));
}
function dropPracticeProp(g) {
  const h = g.userData.prevHand; releaseProp(g); scene.remove(g); const i = props.indexOf(g); if (i >= 0) props.splice(i, 1);
  if (h) { h.m.hands[h.side] = h.hand; h.m.applyHands(); }
}
function clearPracticeProps() { for (const g of practice.props) dropPracticeProp(g); practice.props = []; }
// something in one hand of every character, tried object by object and hand by hand until it touches nothing
async function equipPractice(tok, caps, only) {
  const boxes = sceneryBoxes();
  let all = true;
  for (const m of shuffled(only || chars)) {
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

/* ---------- poses and close-ups ---------- */
function practicePose() {
  const n = chars.length, v = $('#prVar').checked ? 9 : 0;
  // foreshortening reads best with action and movement
  let list = n === 1 ? POSES : GROUP_POSES[n];
  if (practice.focus === 'escorzo' && n === 1) list = POSES.filter(p => p.cat === 'accion' || p.cat === 'mov' || p.cat === 'deporte');
  if (practice.focus === 'cabezas' && n === 1) list = POSES.filter(p => !['tumbado', 'lado', 'bocabajo', 'plancha', 'gatas', 'puntas'].includes(p.id));
  let p; do { p = pickOne(list); } while (p.id === practice.prevId && list.length > 1);
  practice.prevId = p.id;
  if (n === 1 && $('#prGen').checked && Math.random() < .5) { mq.joints.hips.position.set(0, mq.rootY, 0); applyRandom(mq, practice.focus === 'escorzo' ? 'accion' : practice.focus === 'cabezas' ? 'pie' : 'cualquiera', false); mq.joints.hips.quaternion.premultiply(new Q().setFromAxisAngle(new V3(0, 1, 0), (Math.random() * 2 - 1) * Math.PI)); mq.ground(); }
  else if (n === 1) { mq.joints.hips.position.set(0, mq.rootY, 0); applyPreset(mq, p, {variation: v, yaw: (Math.random() * 2 - 1) * Math.PI}); }
  else applyGroupTo(chars, p, {variation: v * .6});
}
// point the camera at a few world points from a direction, filling the view
function frameOn(pts, az, el, fill = 1) {
  const c = pts.reduce((s, p) => s.add(p), new V3()).multiplyScalar(1 / pts.length);
  const r = Math.max(.06, ...pts.map(p => p.distanceTo(c))) * 1.25 / fill;
  const vf = camera.fov * DEG, hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect), d = r / Math.sin(Math.min(vf, hf) / 2);
  const dir = new V3(Math.sin(az * DEG) * Math.cos(el * DEG), Math.sin(el * DEG), Math.cos(az * DEG) * Math.cos(el * DEG));
  return {target: c, pos: c.clone().addScaledVector(dir, d)};
}
// a close-up nobody's body blocks: up to 24 directions, the first clear one wins
function closeUp(pts, skip, dirFn, fill) {
  const caps = chars.flatMap(m => bodyCapsules(m).map(c => ({...c, m}))).filter(c => !skip(c));
  let shot = null;
  for (let t = 0; t < 24; t++) {
    const [az, el] = dirFn(), s = frameOn(pts, az, el, fill);
    if (s.pos.y < .04) continue;
    shot = s;
    if (!caps.some(c => segSegDist(s.pos, s.target, c.a, c.b) < c.r * .9)) break;
  }
  if (!shot) shot = frameOn(pts, 0, 20, fill);
  controls.target.copy(shot.target); camera.position.copy(shot.pos); controls.update();
}
const wpos = o => o.getWorldPosition(new V3());
// where the face looks, as a world heading in degrees: from the head joint towards the jaw
const facing = m => { const f = wpos(m.joints.jaw).sub(wpos(m.joints.head)); return Math.atan2(f.x, f.z) / DEG; };
function focusShot(m) {
  const side = Math.random() < .5 ? 'L' : 'R', setFocalNow = f => { $('#focal').value = f; setFocal(f, false); };
  if (practice.focus === 'manos') {
    const g = gest(pickOne(Object.keys(GESTURES)));
    m.hands[side] = {c: g.c.map(x => clamp(x + rnd(-.15, .15), 0, 1)), s: clamp(g.s + rnd(-.2, .2), 0, 1)}; m.applyHands();
    m.joints['wrist' + side].rotation.set(rnd(-55, 45) * DEG, rnd(-35, 35) * DEG, rnd(-30, 30) * DEG);
    m.group.updateMatrixWorld(true);
    const pts = [wpos(m.joints['wrist' + side]), ...m.fingers[side].flatMap(f => f.map(wpos))];
    setFocalNow(pickOne([50, 50, 85]));
    closeUp(pts, c => c.m === m && (c.k === 'hand' + side || c.k === 'elbow' + side), () => [rnd(-180, 180), rnd(-25, 55)], .75);
  } else if (practice.focus === 'pies') {
    m.joints['ankle' + side].rotation.set(rnd(-35, 30) * DEG, rnd(-20, 20) * DEG, rnd(-15, 15) * DEG);
    m.group.updateMatrixWorld(true);
    const foot = bodyCapsules(m).find(c => c.k === 'foot' + side);
    setFocalNow(pickOne([50, 85]));
    closeUp([foot.a, foot.b, wpos(m.joints['knee' + side]).lerp(foot.a, .7)], c => c.m === m && (c.k === 'foot' + side || c.k === 'knee' + side), () => [rnd(-180, 180), rnd(-5, 45)], .7);
  } else if (practice.focus === 'cabezas') {
    m.joints.neck.rotation.set(rnd(-15, 20) * DEG, rnd(-35, 35) * DEG, rnd(-12, 12) * DEG);
    m.joints.head.rotation.set(rnd(-25, 30) * DEG, rnd(-40, 40) * DEG, rnd(-18, 18) * DEG);
    if (m.body.species !== 'humano') applyExpression(m, pickOne(Object.keys(ANTHRO_EXPR)));
    m.group.updateMatrixWorld(true);
    const head = bodyCapsules(m).find(c => c.k === 'head'), face = facing(m);
    setFocalNow(pickOne([50, 85, 85]));
    // from the face's side: front, three-quarter or profile, above or below
    closeUp([head.a, head.b, wpos(m.joints.neck)], c => c.m === m && (c.k === 'head' || c.k === 'neck' || c.k === 'ear'), () => [face + rnd(-100, 100), rnd(-20, 35)], .6);
  } else if (practice.focus === 'escorzo') {
    setFocalNow(pickOne([14, 18, 24])); frameAll();
    setView(rnd(-180, 180), pickOne([-1, 1]) * rnd(38, 68));
    frameAll();
    // closer than a comfortable framing: the near limbs grow, the far ones shrink
    camera.position.lerp(controls.target, .35); controls.update();
  }
}

/* ---------- session ---------- */
function startPractice() {
  practice.saved = JSON.stringify({...snapshot(), ...sceneExtras(false)});
  practice.savedForm = state.form;
  practice.queue = buildQueue(); practice.history = []; practice.gallery = [];
  practice.active = true; practice.i = 0; practice.paused = false; practice.done = false; practice.loggedSec = 0; practice.loggedPoses = 0;
  document.body.classList.add('practicing'); $('#practiceBtn').lastChild.textContent = tr('Terminar práctica');
  select(null); if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  // the editor's own sketch is kept aside and comes back at the end
  practice.savedStrokes = sk.strokes; sk.strokes = []; sk.redo = []; redrawSketch();
  nextPose(); practice.last = performance.now(); clearInterval(practice.timer); practice.timer = setInterval(tick, 200);
}
function restartPractice() {
  practice.queue = buildQueue(); practice.i = 0; practice.done = false; practice.paused = false; practice.history = []; practice.gallery = []; practice.loggedSec = 0; practice.loggedPoses = 0;
  $('#hud').innerHTML = ''; nextPose(); practice.last = performance.now();
}
const poseDur = i => practice.queue.length ? practice.queue[i - 1] : practice.dur;
// the time spent on the pose being left, for the log
function closePose() {
  if (!practice.i || practice.done) return;
  const spent = poseDur(practice.i) - Math.max(0, practice.left);
  logPose(spent); if (spent >= 5) { practice.loggedSec += spent; practice.loggedPoses++; }
  if (sk.strokes.length) {
    // keep the sketch over its reference for the summary
    try {
      setHideFig(false); frame();
      const src = renderer.domElement, w = 240, h = 320, ref = document.createElement('canvas'); ref.width = w; ref.height = h;
      const k = Math.max(w / src.width, h / src.height), dw = src.width * k, dh = src.height * k;
      ref.getContext('2d').drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh);
      const skc2 = sketchCanvas(1), sv = document.createElement('canvas'); sv.width = w; sv.height = h;
      const k2 = Math.max(w / skc2.width, h / skc2.height), sw = skc2.width * k2, sh = skc2.height * k2;
      sv.getContext('2d').drawImage(skc2, (w - sw) / 2, (h - sh) / 2, sw, sh);
      practice.gallery.push({ref: ref.toDataURL('image/jpeg', .8), sk: sv.toDataURL('image/png'), n: practice.i});
    } catch (_) {}
    sk.strokes = []; sk.redo = []; redrawSketch();
  }
}
// what is needed to come back to a pose: the scene without practice objects, and those objects apart
function practiceState() {
  const o = {...snapshot(), ...sceneExtras(false)};
  o.props = o.props.filter((_, i) => !practice.props.includes(props[i]));
  return {snap: JSON.stringify(o), held: practice.props.map(g => ({t: g.userData.prop, c: chars.indexOf(g.userData.held.m), side: g.userData.held.side, hand: g.userData.prevHand && g.userData.prevHand.hand})),
    cam: {p: camera.position.toArray(), t: controls.target.toArray(), f: state.focal}, prevId: practice.prevId, i: practice.i};
}
async function previousPose() {
  if (practice.busy || !practice.history.length) return;
  practice.busy = true; const tok = practice.tok = (practice.tok || 0) + 1;
  try {
    closePose();
    const st = practice.history.pop();
    clearPracticeProps(); showForcedScenery(); restore(JSON.parse(st.snap));
    for (const h of st.held) {
      const g = makeProp(h.t, new V3()); await g.userData.ready; if (tok !== practice.tok) { dropPracticeProp(g); return; }
      const m = chars[h.c]; if (!m) { dropPracticeProp(g); continue; }
      holdProp(g, m, h.side); g.userData.prevHand = {m, side: h.side, hand: h.hand}; practice.props.push(g);
    }
    camera.position.fromArray(st.cam.p); controls.target.fromArray(st.cam.t); $('#focal').value = st.cam.f; setFocal(st.cam.f, false); controls.update();
    practice.prevId = st.prevId; practice.i = st.i; practice.shownAt = performance.now(); practice.memHidden = false; setHideFig(false);
  } finally { practice.busy = false; }
  practice.left = poseDur(practice.i); renderHud();
}
async function nextPose(skipLog) {
  if (practice.busy) return;
  if (practice.i && !skipLog) { closePose(); practice.history.push(practiceState()); if (practice.history.length > 20) practice.history.shift(); }
  practice.i++;
  if (practice.queue.length && practice.i > practice.queue.length) return finishPractice();
  const tok = practice.tok = (practice.tok || 0) + 1, live = () => practice.active && tok === practice.tok;
  practice.busy = true; practice.left = poseDur(practice.i);
  try {
    setHideFig(false); practice.memHidden = false; clearPracticeProps(); showForcedScenery();
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
    if (practice.focus !== 'figura') focusShot(pickOne(chars));
    else {
      if ($('#prCam').checked) { const f = pickOne([24, 35, 50, 50, 85]); $('#focal').value = f; setFocal(f, false); frameAll(); setView(rnd(-180, 180), rnd(-12, 33)); }
      frameAll();
    }
    if ($('#prLight').checked) setLightPreset(pickOne(Object.keys(LIGHTS)));
  } finally { practice.busy = false; }
  practice.left = poseDur(practice.i); practice.shownAt = performance.now(); renderHud();
}
function tick() {
  const now = performance.now(), dt = (now - practice.last) / 1000; practice.last = now;
  if (practice.paused || practice.done || practice.busy) return;
  practice.left -= dt;
  // memory mode: the figure goes once its seconds are up (until "show reference")
  if ($('#prMemory').checked && !practice.memHidden && (now - practice.shownAt) / 1000 >= practice.mem) { practice.memHidden = true; setHideFig(true); }
  if (practice.left <= 0) { beep(); nextPose(); } else renderHud();
}
function hudPhase() {
  if (practice.mode !== 'clase' || !practice.queue.length) return '';
  const d = poseDur(practice.i), block = practice.queue.filter(x => x === d).length, nth = practice.queue.slice(0, practice.i).filter(x => x === d).length;
  return tr('Bloque de {d}: {i} de {n}', {d: tr(fmtDur(d)), i: nth, n: block});
}
function renderHud() {
  const hud = $('#hud'); hud.hidden = false;
  if (practice.done) return;
  {
    if (!hud.querySelector('.t')) {
      hud.innerHTML = `<div class="t" aria-live="off"></div><div class="n"></div><div class="phase"></div><div class="mem" hidden></div><div class="bar"><i></i></div>
        <div class="row"><button class="btn small icon" id="hPrev" title="${tr('Pose anterior')}" aria-label="${tr('Pose anterior')}"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button><button class="btn small" id="hPause">${tr('Pausa')}</button><button class="btn small" id="hNext">${tr('Siguiente')}</button><button class="btn small" id="hStop">${tr('Terminar')}</button></div>
        <div class="row" style="margin-top:6px"><button class="btn small hideFigBtn" id="hHide">${tr('Ocultar figura')}</button><button class="btn small" id="hSketch">${tr('Dibujar encima')}</button></div>`;
      $('#hHide').onclick = () => setHideFig(!sk.hideFig); $('#hSketch').onclick = () => setSketch(!sk.on);
      $('#hPause').onclick = () => { practice.paused = !practice.paused; $('#hPause').textContent = tr(practice.paused ? 'Seguir' : 'Pausa'); };
      $('#hNext').onclick = () => nextPose(); $('#hStop').onclick = () => { if (practice.i > 1 || practice.loggedPoses) { closePose(); finishPractice(); } else stopPractice(); };
      $('#hPrev').onclick = () => previousPose();
    }
  }
  const mem = hud.querySelector('.mem');
  mem.hidden = !practice.memHidden; mem.textContent = tr('De memoria: la figura está oculta');
  hud.querySelector('.hideFigBtn').textContent = tr(sk.hideFig ? (practice.memHidden ? 'Ver la referencia' : 'Mostrar figura') : 'Ocultar figura');
  const t = hud.querySelector('.t'); t.textContent = fmtT(practice.left); t.classList.toggle('warn', practice.left <= 5);
  hud.querySelector('.n').textContent = practice.queue.length ? tr('Pose {i} de {n}', {i: practice.i, n: practice.queue.length}) : tr('Pose {i}', {i: practice.i});
  hud.querySelector('.phase').textContent = hudPhase();
  hud.querySelector('.bar i').style.width = (practice.left / poseDur(practice.i) * 100) + '%';
  $('#hPrev').disabled = !practice.history.length;
}
function finishPractice() {
  practice.done = true; beep(); $('#hud').hidden = true;
  if (sk.on) setSketch(false);
  const st = practiceStats();
  $('#psLine').textContent = tr('{n} poses · {t} de dibujo', {n: practice.loggedPoses, t: fmtT(practice.loggedSec)}) + (st.streak > 1 ? ' · ' + tr('{n} días seguidos', {n: st.streak}) : '');
  const g = practice.gallery; $('#psGallery').hidden = !g.length;
  $('#psGrid').innerHTML = g.map((x, i) => `<button type="button" data-i="${i}" aria-label="${tr('Boceto de la pose {n}', {n: x.n})}"><img alt="" src="${x.ref}"><img class="sk" alt="" src="${x.sk}"><span>${x.n}</span></button>`).join('');
  $$('#psGrid button').forEach(b => b.onclick = () => b.classList.toggle('ref'));
  $('#prSummary').hidden = false; $('#psClose').focus();
}
function stopPractice() {
  clearInterval(practice.timer); practice.active = false; practice.done = false; practice.memHidden = false; practice.tok = (practice.tok || 0) + 1;
  clearPracticeProps(); showForcedScenery();
  document.body.classList.remove('practicing'); $('#hud').hidden = true; $('#hud').innerHTML = ''; $('#prSummary').hidden = true;
  $('#practiceBtn').lastChild.textContent = tr('Práctica');
  setHideFig(false); if (sk.on) setSketch(false);
  if (practice.savedStrokes) { sk.strokes = practice.savedStrokes; sk.redo = []; practice.savedStrokes = null; redrawSketch(); }
  if (practice.saved) restore(practice.saved);
  if (practice.savedForm && state.form !== practice.savedForm) setForm(practice.savedForm);
}
initPracticeUI();
