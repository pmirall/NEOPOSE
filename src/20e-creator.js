/* ======================= the character creator =======================
   Personajes y lugares' Cuerpo and Ropa tabs are one place to make someone, laid out the way games lay out their
   character creators (Create-a-Sim above all):
   - the character large in the middle, on a turntable, the camera on the face or on the whole body;
   - a rail of big categories (body, face, hair, species, limbs, clothes, accessories) that takes the panel to its part
     and the camera to where that part is; the panel follows (it is one long page, so everything stays reachable by
     scrolling, by the keyboard and by the tests);
   - options as pictures: body types as silhouettes, species and coats as fur swatches, outfits as their garments,
     expressions as drawn faces, accessories as photos; the sliders fold away under "Ajuste fino";
   - a strip of everyone you have (on the stage, yours on this device, the project's cast) with portraits, to make,
     copy, rename, remove (with the way back), save, import and export them; a dice for each part and one for all;
   - one search over every library (clothes, hair, heads, species, coats, bodies, expressions, characters).
   Nothing here is a new 3D or garment system: every tile does what the tabs' own chips do (often by pressing them). */
const CR = {built: false, on: false, cat: 'body', view: null, spin: false, lock: 0, pTimer: 0, portraits: new WeakMap(), thumbs: new Map(), q: '', filt: 'all', acc: 'all', res: []};
const CR_FACE = new Set(['face', 'hair']);  // categories seen from close up
const CR_ACC = ['Sombreros, cascos y máscaras', 'Accesorios', 'Joyas', 'Guantes', 'Objetos y armas'];
const CR_SKIN = ['#e8c4a4', '#c08a62', '#7d5236'];
const OUTFIT_SLOTS = {diario: 'Diario', formal: 'Formal', deporte: 'Deporte', dormir: 'Para dormir', fiesta: 'Fiesta'};
const CR_FILTERS = [['all', 'Todos'], ['garment', 'Ropa'], ['hair', 'Pelo'], ['head', 'Cabezas'], ['species', 'Especies'], ['body', 'Cuerpos'], ['expr', 'Expresiones'], ['char', 'Personajes']];
const CR_TYPE = {garment: 'Prenda', hair: 'Peinado', head: 'Cabeza', species: 'Especie', body: 'Cuerpo', expr: 'Expresión', char: 'Personaje'};
const CR_DICE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="8.5" cy="8.5" r="1.1" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.1" fill="currentColor"/><circle cx="12" cy="12" r="1.1" fill="currentColor"/></svg>';
const crPhone = () => matchMedia('(max-width: 860px)').matches;
// what stays at the top of the panel while it scrolls: the rail on a phone, the search on a wide screen
const crStick = () => (crPhone() ? $('#crRail') : $('#crTop')).offsetHeight;
const crPick = a => a[Math.floor(Math.random() * a.length)];
const crSpecs = l => (l || []).map(s => ({...s}));

/* ---------- on and off: Cuerpo or Ropa showing in Personajes ---------- */
function creatorSync() {
  const on = CR_TABS.has(state.tab) && !(typeof WS !== 'undefined' && WS.ready && WS.cur !== 'chars'), was = CR.on;
  CR.on = on; document.body.classList.toggle('creator', on);
  if (!CR.built) return;
  if (!on) { if (was) crLeave(); return; }
  if (state.tab === 'ropa' && !$('#crAcc .libItem')) crRenderAcc();
  if (!was) crEnter(); else crSpy(true);
}
function crEnter() {
  crRenderStage(); crRenderCast(); crDecorate(); crSyncExpr(); crSyncCam(); crSpy(true);
  // the stage has just changed size (the rail and the strip came): frame once the canvas has followed
  if (!ANIM.open) requestAnimationFrame(() => requestAnimationFrame(() => { if (CR.on) crFrame(CR_FACE.has(CR.cat) ? 'face' : 'body', true); }));
}
function crLeave() { if (CR.spin) crSetSpin(false); if (CR.view === 'face') frameAll(true); CR.view = null; crSyncCam(); }
// the rail and the strip sit around the stage on a wide screen; on a phone they go into the sheet, above the options
function crPlace() {
  const rail = $('#crRail'), gal = $('#crGallery'), pg = $('#book .page'), main = $('.main');
  if (crPhone()) { if (rail.parentElement !== pg) { pg.prepend(gal); pg.prepend(rail); } }
  else if (rail.parentElement !== main) { main.prepend(rail); main.append(gal); }
  crFold(store.get(crPhone() ? 'cdp.crGalP' : 'cdp.crGal', !crPhone()), false);
}
function crFold(open, keep = true) {
  $('#crGallery').classList.toggle('folded', !open); $('#crGalToggle').setAttribute('aria-expanded', String(open));
  if (keep) store.set(crPhone() ? 'cdp.crGalP' : 'cdp.crGal', open);
  if (open) crPortraitsSoon(200);
}

/* ---------- the rail: categories ---------- */
function crGo(cat, user) {
  const el = $(`.crcat[data-cat="${cat}"]`); if (!el) return;
  const tab = el.closest('section[data-tab]').dataset.tab;
  if (state.tab !== tab) { showTab(tab); setPanel(true); }
  CR.cat = cat; CR.lock = performance.now(); crMarkRail();
  if (sheetOn() && SHEET.snap === 'peek') setSheet('half');
  requestAnimationFrame(() => {
    const pg = el.closest('.page'), stick = crStick();
    pg.scrollTo({top: el.getBoundingClientRect().top - pg.getBoundingClientRect().top + pg.scrollTop - stick - 4, behavior: UX.reduce ? 'auto' : 'smooth'});
  });
  if (user && !ANIM.open) crFrame(CR_FACE.has(cat) ? 'face' : 'body');
}
function crMarkRail() {
  for (const b of $$('#crRail .crr')) { const on = b.dataset.cat === CR.cat; b.setAttribute('aria-current', String(on)); if (!b.contains(document.activeElement)) b.tabIndex = on ? 0 : -1; }
}
// the category the panel is showing: the last heading scrolled past (a click on the rail wins while the page travels)
function crSpy(force) {
  if (!CR.on || (!force && performance.now() - CR.lock < 800)) return;
  const pg = $('#book .page'), line = pg.getBoundingClientRect().top + crStick() + 50;
  const list = $$(`section[data-tab="${state.tab}"] .crcat`); let cur = list[0];
  for (const c of list) if (c.getBoundingClientRect().top <= line) cur = c;
  if (cur) { CR.cat = cur.dataset.cat; crMarkRail(); }
}

/* ---------- the camera: face, body, a quarter turn, the turntable ---------- */
function crGlide(p, t) {
  if (UX.reduce) { CAMG.go = null; controls.target.copy(t); camera.position.copy(p); controls.update(); }
  else CAMG.go = {p0: camera.position.clone(), t0: controls.target.clone(), p, t, s: performance.now()};
  wake();
}
// the active character, its face or all of it, from where the camera already looks (front, three quarters, at entry)
function crFrame(kind, front) {
  const m = mq; if (!m || !m.joints) return;
  m.group.updateMatrixWorld(true);
  const tf = Math.tan(camera.fov * DEG / 2), asp = camera.aspect || 1, face = kind === 'face';
  let t, rv, rh;
  if (face) { t = m.joints.head.getWorldPosition(new V3()).add(new V3(0, m.headH * .4, 0)); rv = m.headH * 1.3; rh = m.headH * 1.1; }  // (the head's joint is at the skull's base)
  else { const b = m.box(8), s = b.getSize(new V3()); t = b.getCenter(new V3()); rv = s.y * .56; rh = Math.max(s.x, s.z) * .6; }
  const d = Math.max(rv / tf, rh / (tf * asp)) * 1.06, v = camera.position.clone().sub(controls.target);
  const az = front ? m.yaw() + 22 * DEG : Math.atan2(v.x, v.z), el = (face ? 3 : 7) * DEG;
  // what covers the canvas' top and bottom (the cast, the hint): aim so the character sits in the free band
  if (!face) { const {top, bot, H} = framePads(); t.y += (top - bot) / H * d * tf; }
  const p = t.clone().add(new V3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(d)); if (p.y < .06) p.y = .06;
  crGlide(p, t); CR.view = kind; crSyncCam();
  if (typeof camTouched === 'function') camTouched();
}
function crRotate(deg) {
  const t = controls.target.clone(), v = camera.position.clone().sub(t).applyAxisAngle(new V3(0, 1, 0), deg * DEG);
  crGlide(t.clone().add(v), t); if (typeof camTouched === 'function') camTouched();
}
function crSetSpin(on) {
  CR.spin = on; controls.autoRotate = on; controls.autoRotateSpeed = 2.5; const s = $('#bbSpin'); if (s) s.checked = on;
  crSyncCam(); wake();
}
function crSyncCam() {
  if (!$('#crCam')) return;
  CR.spin = CR.on && controls.autoRotate;
  $('#crFace').setAttribute('aria-pressed', String(CR.view === 'face')); $('#crBody').setAttribute('aria-pressed', String(CR.view === 'body'));
  $('#crSpin').setAttribute('aria-pressed', String(CR.spin));
}

/* ---------- pictures for the options: silhouettes, fur swatches, outfits, drawn faces ---------- */
function crSwatch(cols) { const s = document.createElement('span'); s.className = 'crsw'; s.setAttribute('aria-hidden', 'true'); cols.forEach((c, i) => s.style.setProperty('--c' + i, c)); return s; }
function crDecorate() {
  const todo = [];
  for (const b of $$('#bodyChips .chip')) if (!b.querySelector('.crth')) {
    const th = document.createElement('span'); th.className = 'crth pending'; th.setAttribute('aria-hidden', 'true'); b.prepend(th); todo.push([b.dataset.v, th]);
  }
  for (const b of $$('#speciesChips .chip')) if (!b.querySelector('.crsw')) { const sp = SPECIES[b.dataset.v], co = sp && sp.coat && COATS[sp.coat]; b.prepend(crSwatch(co ? co.c : CR_SKIN)); }
  crCoatSwatches(); crOutfitLooks();
  // body types on the build thumbnails' renderer, a few per frame
  const pump = () => {
    const t0 = performance.now();
    while (todo.length && performance.now() - t0 < 24) {
      const [id, th] = todo.shift(); let url = CR.thumbs.get(id);
      if (!url) { url = bodySilhouette(bodyOf(id)); if (url) CR.thumbs.set(id, url); }
      if (url) { th.classList.remove('pending'); th.style.setProperty('--m', `url(${url})`); }
    }
    if (todo.length) requestAnimationFrame(pump);
  };
  if (todo.length) requestAnimationFrame(pump);
}
function crCoatSwatches() {
  for (const b of $$('#coatChips .chip')) if (!b.querySelector('.crsw')) { const c = COATS[b.dataset.v]; b.prepend(crSwatch(c ? c.c : ['var(--page)', 'var(--page)', 'var(--line)'])); }
}
function crOutfitLooks() {
  if (!ROPA.catalog) return;
  for (const b of $$('#outfitChips .chip')) {
    const o = OUTFITS[b.dataset.v]; if (!o || b.querySelector('.crol')) continue;
    const box = document.createElement('span'); box.className = 'crol'; box.setAttribute('aria-hidden', 'true');
    for (const sp of o[1].slice(0, 3)) { const it = ROPA.byId[sp.id]; if (it && it.thumb) { const im = new Image(); im.alt = ''; im.src = it.thumb; box.append(im); } }
    b.prepend(box);
  }
}
// a face per expression, drawn like a margin doodle: brows, eyes, mouth
const CR_DOODLE = {
  neutra: ['flat', 'dot', 'flat'], sonrisa: ['flat', 'dot', 'smile'], risa: ['up', 'happy', 'laugh'], triste: ['sad', 'dot', 'frown'], enfado: ['angry', 'dot', 'grim'],
  sorpresa: ['up', 'wide', 'o'], miedo: ['sad', 'wide', 'wobble'], asco: ['angry', 'slit', 'disgust'], grito: ['angry', 'slit', 'shout'], concentrado: ['angry', 'slit', 'flat'],
  guino: ['flat', 'wink', 'smile'], morros: ['flat', 'dot', 'purse'], dormido: ['flat', 'closed', 'flat'],
  alerta: ['up', 'wide', 'flat'], feliz: ['flat', 'happy', 'smile'], jadeo: ['flat', 'happy', 'tongue'], aullido: ['sad', 'closed', 'o'], rugido: ['angry', 'slit', 'shout'],
  curiosa: ['tilt', 'dot', 'purse'], timida: ['sad', 'dot', 'smile']
};
const CR_BROW = {flat: 'M7 8h3.4M13.6 8H17', up: 'M7 6.9q1.7-1.1 3.4 0M13.6 6.9q1.7-1.1 3.4 0', sad: 'M7 8.5l3.4-1.3M13.6 7.2 17 8.5', angry: 'M7 7.2l3.4 1.3M13.6 8.5 17 7.2', tilt: 'M7 7.6h3.4M13.6 6.5 17 7.3'};
const CR_EYES = {dot: '<circle cx="8.7" cy="11" r="1" fill="currentColor"/><circle cx="15.3" cy="11" r="1" fill="currentColor"/>', wide: '<circle cx="8.7" cy="11" r="1.7"/><circle cx="15.3" cy="11" r="1.7"/><circle cx="8.7" cy="11" r=".5" fill="currentColor"/><circle cx="15.3" cy="11" r=".5" fill="currentColor"/>',
  slit: '<path d="M7.6 11h2.3M14.1 11h2.3"/>', closed: '<path d="M7.5 10.8q1.2 1.1 2.4 0M14.1 10.8q1.2 1.1 2.4 0"/>', happy: '<path d="M7.5 11.5q1.2-1.4 2.4 0M14.1 11.5q1.2-1.4 2.4 0"/>',
  wink: '<circle cx="8.7" cy="11" r="1" fill="currentColor"/><path d="M14.1 10.9q1.2 1.1 2.4 0"/>'};
const CR_MOUTH = {flat: '<path d="M9.6 16h4.8"/>', smile: '<path d="M8.8 15q3.2 2.8 6.4 0"/>', laugh: '<path d="M8.6 14.6h6.8q-.4 3.6-3.4 3.6t-3.4-3.6Z"/>', frown: '<path d="M9 17.2q3-2.4 6 0"/>',
  grim: '<rect x="9" y="15" width="6" height="2.2" rx=".6"/><path d="M11 15v2.2M13 15v2.2"/>', o: '<ellipse cx="12" cy="16.2" rx="1.6" ry="2"/>', wobble: '<path d="M9 16.6q1-1.1 2 0t2 0 2 0"/>',
  disgust: '<path d="M9 16.6q1.5-1.4 3 0t3-.9"/>', shout: '<path d="M9 14.6h6l-1 3.8h-4Z"/>', purse: '<circle cx="12" cy="16" r="1"/>', tongue: '<path d="M8.8 14.8h6.4q-.5 3-3.2 3t-3.2-3Z"/><path d="M11 17.3q1 1.7 2 0"/>'};
function crFaceSvg(id) {
  const [b, e, m] = CR_DOODLE[id] || CR_DOODLE.neutra;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.9c5 0 8.5 3.9 8.5 8.9S16.8 21 12 21s-8.6-4.1-8.6-9.2S7.1 2.9 12 2.9Z"/><path d="${CR_BROW[b]}"/>${CR_EYES[e]}${CR_MOUTH[m]}</svg>`;
}
let crAmt = null;
function crSyncExpr() {
  const box = $('#crExpr'); if (!box || !mq) return;
  const human = mq.body.species === 'humano' && !mq.avatar, kind = human ? 'h' : 'a';
  if (box.dataset.kind !== kind) {
    box.dataset.kind = kind; box.innerHTML = '';
    for (const [k, v] of Object.entries(human ? FACE_EXPR : ANTHRO_EXPR)) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'crface'; b.dataset.v = k; b.innerHTML = crFaceSvg(k);
      const l = document.createElement('span'); l.textContent = tr(v.label); b.append(l); b.onclick = () => pickExpression(k); box.append(b);
    }
  }
  const cur = human ? mq.body.expr || 'neutra' : mq.aexpr || '';
  for (const b of box.children) b.setAttribute('aria-pressed', String(b.dataset.v === cur));
  $('#crExprFine').hidden = !human || !mq.body.expr; if (crAmt) crAmt.set(mq.body.exprAmt ?? 1);
  $('#crExprNote').textContent = tr(human ? 'Cejas, ojos y boca de MakeHuman. Para abrir más la boca, toca la mandíbula y gírala.'
    : 'Boca, orejas y cola a la vez, con el lenguaje corporal de los animales. También puedes tocar la mandíbula, una oreja o la cola para girarlas a mano.');
}

/* ---------- a look before choosing: hovering a swatch or a face tries it on, leaving takes it off ----------
   Only where it costs nothing (a colour, a coat, a face): what needs a new body or a garment download waits for the click.
   on(el) returns what to put back (false: nothing to try); pressing goes back first, so the click is the real change. */
function crPreview(box, sel, on, off) {
  let cur = null, st = null;
  const end = () => { if (cur) { off(cur, st); cur = st = null; wake(); } };
  box.addEventListener('pointerover', e => {
    if (e.pointerType !== 'mouse') return; const el = e.target.closest(sel);
    if (el === cur) return; end();
    if (el && box.contains(el) && !el.disabled && !ANIM.open) { const s = on(el); if (s !== false) { cur = el; st = s; wake(); } }
  });
  box.addEventListener('pointerleave', end);
  box.addEventListener('pointerdown', end, true);
}
const CR_EXPR_JOINTS = ['jaw', 'earL', 'earR', 'head', 'tail1', 'tail2', 'tail3'];
function crPreviews() {
  crPreview($('#hairSw'), 'button[data-c]', el => { if (!mq.body.hair || hairBlock(mq)) return false; const old = mq.body.hairCol; mq.body.hairCol = el.dataset.c; syncHair(mq); return old; },
    (el, old) => { mq.body.hairCol = old; syncHair(mq); });
  crPreview($('#coatChips'), '.chip', el => { const had = 'coat' in mq.body, old = had ? JSON.parse(JSON.stringify(mq.body.coat)) : undefined; mq.body.coat = el.dataset.v ? {preset: el.dataset.v} : null; applyCoat(mq); return {had, old}; },
    (el, s) => { if (s.had) mq.body.coat = s.old; else delete mq.body.coat; applyCoat(mq); });
  crPreview($('#crExpr'), '.crface', el => {
    if (mq.body.species === 'humano' && !mq.avatar) { if (mq.body.expr || typeof faceNow !== 'function') return false; faceNow(mq, el.dataset.v); return {h: true}; }
    const s = {a: mq.aexpr, r: CR_EXPR_JOINTS.filter(n => mq.joints[n]).map(n => [n, mq.joints[n].rotation.clone()])}; applyExpression(mq, el.dataset.v); return s;
  }, (el, s) => { if (s.h) return faceNow(mq, 'neutra'); for (const [n, r] of s.r) mq.joints[n].rotation.copy(r); mq.aexpr = s.a; });
}

/* ---------- clothes: outfits per occasion, accessories ---------- */
// each character keeps an outfit per occasion (in its body, so it travels with it: saved, in the cast, in files);
// the one worn is the character's outfit as always, kept in its slot when another is chosen
function setOutfitSlot(m, id) {
  const cur = m.body.outfitSlot || 'diario'; if (id === cur || !OUTFIT_SLOTS[id]) return;
  const all = {...(m.body.outfits || {}), [cur]: crSpecs(m.outfit)}, next = all[id];
  m.body.outfits = all; m.body.outfitSlot = id;
  const p = wearOutfit(m, crSpecs(next || m.outfit));  // (an occasion not dressed yet starts from what is worn)
  if (m === mq) { crSlotsSync(); renderGarmentList(); renderLibrary(); }
  renderCast(); pushHistory(); toast(tr('Conjunto para: {x}', {x: tr(OUTFIT_SLOTS[id])}));
  return p;
}
function crSlotsSync() {
  const box = $('#crSlots'); if (!box || !mq) return;
  if (!box.childElementCount) chips(box, Object.entries(OUTFIT_SLOTS), mq.body.outfitSlot || 'diario', id => setOutfitSlot(mq, id));
  setPressed(box, mq.body.outfitSlot || 'diario');
}
function crGarmentTile(c) {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'libItem'; b.dataset.id = c.id; b.title = gTitle(c);
  b.innerHTML = c.thumb ? `<img loading="lazy" alt="" src="${c.thumb}">` : `<span class="noimg">${tr('sin imagen')}</span>`;
  const t = document.createElement('span'); t.className = 'lt'; t.textContent = gTitle(c); b.append(t);
  b.onclick = () => { const why = !mq.outfit.some(s => s.id === c.id) && garmentBlock(mq, c); if (why) return toast(why); toggleGarment(c.id); };
  return b;
}
async function crRenderAcc() {
  const box = $('#crAcc'); if (!box) return;
  if (!ROPA.catalog) {
    if (state.tab !== 'ropa') return;  // (the library is fetched when Ropa is shown, not before)
    box.innerHTML = `<p class="empty">${tr('Cargando el armario…')}</p>`;
    await loadCatalog().catch(() => null);
    if (!ROPA.catalog) { box.innerHTML = `<p class="empty">${tr('No se pudo cargar el armario.')}</p>`; return; }
  }
  crOutfitLooks();
  const have = new Set(ROPA.catalog.map(c => c.cat));
  chips($('#crAccCats'), [['all', 'Todos'], ...CR_ACC.filter(c => have.has(c)).map(c => [c, c])], CR.acc, v => { CR.acc = v; crRenderAcc(); });
  box.innerHTML = '';
  for (const c of ROPA.catalog) if (CR_ACC.includes(c.cat) && (CR.acc === 'all' || c.cat === CR.acc)) box.append(crGarmentTile(c));
  crMarks();
}
// what the active character wears, marked on the creator's tiles
function crMarks() {
  if (!mq) return;
  const worn = new Set(mq.outfit.map(s => s.id));
  for (const b of $$('#crAcc .libItem')) {
    const on = worn.has(b.dataset.id), why = !on && garmentBlock(mq, ROPA.byId[b.dataset.id]);
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); b.classList.toggle('blocked', !!why); b.toggleAttribute('aria-disabled', !!why);
  }
  if (CR.q) crResultMarks();
}

/* ---------- the dice: one part, or all of it (Ctrl+Z takes it back) ---------- */
const CR_RAND_TYPES = ['hombre', 'mujer', 'hombre', 'mujer', 'atletico', 'atletica', 'delgado', 'robusta', 'adolescente', 'adolescenta', 'mayor', 'mayora', 'animeM', 'animeF', 'heroico'];
async function crRandom(what = 'all') {
  const m = mq, all = what === 'all'; let rebuild = false;
  if (all || what === 'body') {
    const id = crPick(CR_RAND_TYPES), nb = bodyOf(id); for (const k of KEEP_ON_TYPE) if (m.body[k] !== undefined) nb[k] = m.body[k];
    nb.height = clamp(nb.height + (Math.random() - .5) * .4, 0, 1); m.body = nb; m.bodyPreset = id;
    applyBuild(m, crPick(BODY_BUILDS.filter(b => b.id !== 'embarazo' && b.id !== 'acondroplasia'))); rebuild = true;
  }
  if (what === 'species') {
    const id = crPick(Object.keys(SPECIES).filter(k => k !== 'humano' && k !== m.body.species));
    m.body.species = id; delete m.body.coat; delete m.body.tail; delete m.body.headModel; delete m.body.pads; rebuild = true;
  }
  if ((all || what === 'species') && m.body.species !== 'humano') { const cs = coatPresetsFor(m.body.species); if (cs.length) m.body.coat = {preset: crPick(cs)[0]}; }
  if (all || what === 'hair') {
    const why = hairBlock(m);
    if (why) { if (!all) return toast(why); }
    else { const l = await loadHairList().catch(() => null); if (l) { m.body.hair = crPick(l).id; m.body.hairCol = crPick(Math.random() < .85 ? HAIR_COLORS.slice(0, 9) : HAIR_COLORS)[0]; } }
  }
  const human = m.body.species === 'humano' && !m.avatar;
  if ((all || what === 'face') && human) { const e = crPick(Object.keys(FACE_EXPR).filter(k => k !== 'dormido')); if (e === 'neutra') delete m.body.expr; else m.body.expr = e; m.body.exprAmt = 1; rebuild = true; }
  if (rebuild) { if (m === mq) rebuildActive(true); else m.build(m.body); restTail(m); } else syncHair(m);
  if ((all || what === 'face') && !human) applyExpression(m, crPick(Object.keys(ANTHRO_EXPR)));
  if (all || what === 'clothes') wearOutfit(m, await randomOutfit());
  if (what === 'acc') {
    const cat = await loadCatalog(), keep = m.outfit.filter(s => !CR_ACC.includes((ROPA.byId[s.id] || {}).cat)), pool = cat.filter(c => CR_ACC.slice(0, 4).includes(c.cat) && !garmentBlock(m, c));
    const add = []; for (let n = 1 + (Math.random() < .5); n > 0 && pool.length; n--) { const c = crPick(pool); if (!add.some(s => s.id === c.id)) add.push(garmentSpec(c.id)); }
    wearOutfit(m, [...keep, ...add]);
  }
  syncBodyUI(); renderGarmentList(); renderLibrary(); renderCast(); pushHistory();
  toast(tr('Al azar'), {undo: true});
}

/* ---------- Tus personajes: the stage, Mis personajes, the project's cast ---------- */
function crRenderStage(again = true) {
  const box = $('#crStage'); if (!box || !CR.built) return;
  crSlotsSync(); if (!CR.on) return;
  // (drawn again on every change of the cast: the keyboard's place in it is kept)
  const fi = $$('#crStage button, #crStage [tabindex]').indexOf(document.activeElement);
  box.innerHTML = '';
  chars.forEach((m, i) => {
    const name = charLabel(m), p = CR.portraits.get(m), card = characterCard({id: '', name, thumb: p && p.url}, () => setActive(i));
    delete card.dataset.id; card.title = tr('Hacer activo'); card.classList.toggle('on', i === active); card.setAttribute('aria-pressed', String(i === active)); card.setAttribute('role', 'button');
    if (!p) card.querySelector('img').classList.add('pending');
    charActs(card, name, [['dup', 'Duplicar', () => crDuplicate(m)], ['ren', 'Cambiar el nombre', () => crRename(m)], ...(chars.length > 1 ? [['del', 'Quitar de la escena', () => crRemove(i)]] : [])]);
    box.append(card);
  });
  if (chars.length < MAX_CHARS) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'pose charcard crnew'; b.title = tr('Un personaje nuevo en la escena');
    b.innerHTML = '<span class="crplus" aria-hidden="true">+</span><span></span>'; b.lastChild.textContent = tr('Nuevo'); b.onclick = crNew; box.append(b);
  }
  if (fi >= 0) $$('#crStage button, #crStage [tabindex]')[fi]?.focus();
  if (again) crPortraitsSoon();
}
function crRenderCast() {
  const box = $('#crCast'); if (!box) return; box.innerHTML = '';
  $('#crCastBox').hidden = !PROJECT.cast.length;
  for (const c of PROJECT.cast) {
    const card = characterCard(c, () => placeCharacter(c)); card.dataset.cast = c.id;
    charActs(card, c.name, [['save', 'Guardar en Mis personajes', () => crSaveCopy(c)], ['file', 'Exportar a un archivo', () => exportCharacter(c)]]);
    box.append(card);
  }
}
function crNew() {
  const m = addChar(chars.length % 2 ? 'mujer' : 'hombre'); if (!m) return toast(tr('Ya hay {n} personajes en la escena.', {n: MAX_CHARS}));
  setActive(chars.length - 1); pushHistory(); buildPoseGrid(); if (CR.on && !ANIM.open) crFrame('body');
}
function crDuplicate(m) {
  if (chars.length >= MAX_CHARS) return toast(tr('Ya hay {n} personajes en la escena.', {n: MAX_CHARS}));
  const c = characterOf(m, tr('{x} (copia)', {x: charLabel(m)})); delete c.body.castId;  // (a copy is someone new, not the cast member)
  placeCharacter(c);
}
function crRename(m) { const n = (prompt(tr('Nombre del personaje'), charLabel(m)) || '').trim(); if (!n) return; m.body.name = n; renderCast(); pushHistory(); }
function crRemove(i) { const n = charLabel(chars[i]); removeChar(i); pushHistory(); toast(tr('{x}: fuera de la escena', {x: n}), {undo: true}); }
async function crSaveCopy(c) {
  const d = {...characterOf({body: c.body, bodyPreset: c.preset, outfit: c.outfit || []}, c.name), thumb: c.thumb || null}; delete d.body.castId;
  await charDB.put(d); await loadCharacters(); toast(tr('«{x}» guardado en Mis personajes.', {x: d.name}));
}
function crExportActive() { const c = characterOf(mq, charName(mq)); c.thumb = (CR.portraits.get(mq) || {}).url || characterThumb(mq); exportCharacter(c); }
function crExportAll() {
  if (!SAVED_CHARS.length) return toast(tr('Aún no hay personajes guardados. Ajusta uno a tu gusto y pulsa «Guardar este personaje».'));
  const bytes = new TextEncoder().encode(JSON.stringify(SAVED_CHARS.map(c => ({neopose: 'character', ...c})), null, 1));
  saveFile(`${tr('personajes')}.neopose-personaje.json`, bytes, 'application/json');
}
// colour portraits of the stage's characters, taken a moment after a change settles (one at a time, dressed)
function crPortraitsSoon(ms = 900) { clearTimeout(CR.pTimer); if (CR.on) CR.pTimer = setTimeout(crPortraits, ms); }
async function crPortraits() {
  if (!CR.on || $('#crGallery').classList.contains('folded')) return;
  if (ANIM.playing || CAMG.go || TWEENS.size || practice.active || (typeof SC !== 'undefined' && SC.busy)) return crPortraitsSoon(1200);
  let n = 0;
  for (const m of [...chars]) {
    const hid = headModelFor(m.body); if (hid && !HEADS[hid]) { crPortraitsSoon(1500); continue; }  // (a sculpted head still on its way)
    const sig = JSON.stringify([m.body, m.outfit]), p = CR.portraits.get(m); if (p && p.sig === sig) continue;
    await Promise.all((m.garments || []).map(g => g.ready)).catch(() => {});
    if (!CR.on || !chars.includes(m) || CAMG.go) return crPortraitsSoon(600);
    const url = characterThumb(m); if (url) { CR.portraits.set(m, {sig, url}); n++; }
    await new Promise(r => setTimeout(r, 40));
  }
  if (n) crRenderStage(false);
}
// every change (the history's step): the portraits, and the search's marks
function crChanged() { if (!CR.on) return; crPortraitsSoon(); if (CR.q) crResultMarks(); }

/* ---------- one search over the libraries ---------- */
const crChip = (sel, v) => { const b = $(`${sel} .chip[data-v="${v}"]`); if (b) b.click(); };
// a species from the search: what its chip does (a fresh head, coat and tail), without the second rebuild a head or coat would add
function crSpecies(id) { mq.body.species = id; delete mq.body.coat; delete mq.body.tail; delete mq.body.headModel; delete mq.body.pads; }
function crUseHead(k) {
  const c = HEAD_CATALOG[k]; if (!c) return;
  if (mq.body.species === 'humano') crSpecies(SPECIES[c.species[0]] ? c.species[0] : 'lobo');
  mq.body.headModel = k; mq.body.headStyle = c.style; rebuildActive(true); restTail(mq); syncBodyUI(); pushHistory();
}
function crUseCoat(k) {
  const p = COATS[k]; if (!p) return;
  const sw = !p.for.includes(mq.body.species); if (sw) crSpecies(p.for[0]);
  mq.body.coat = {preset: k}; if (sw) { rebuildActive(true); restTail(mq); syncBodyUI(); } else { applyCoat(mq); syncCoatUI(); } pushHistory();
}
function crIndex() {
  const out = [], add = (type, id, label, extra, look, run, on, why) => out.push({type, id, label, n: uxNorm(label + ' ' + (extra || '')), look: look || {}, run, on, why});
  const worn = id => mq.outfit.some(s => s.id === id);
  if (ROPA.catalog) for (const c of ROPA.catalog) add('garment', c.id, gTitle(c), `${c.title} ${tr(c.cat)} ${c.cat}`, {img: c.thumb}, () => toggleGarment(c.id), () => worn(c.id), () => !worn(c.id) && garmentBlock(mq, c));
  for (const [k, v] of Object.entries(OUTFITS)) add('garment', 'outfit:' + k, tr(v[0]), tr('Conjuntos'), {img: ROPA.catalog && (ROPA.byId[v[1][0].id] || {}).thumb}, () => crChip('#outfitChips', k));
  if (HAIR.list) for (const h of HAIR.list) add('hair', h.id, h.title, `${tr('Pelo')} ${h.id.slice(2).replace(/[_\d]+/g, ' ')}`, {img: h.thumb}, () => { setHair(mq, h.id); renderHairUI(); pushHistory(); }, () => mq.body.hair === h.id, () => hairBlock(mq));
  for (const [k, c] of Object.entries(HEAD_CATALOG)) add('head', k, c.label, `${tr('Cabeza')} ${c.species.map(s => (SPECIES[s] ? SPECIES[s].label + ' ' : '') + s).join(' ')} ${c.style}`, {icon: 'species'}, () => crUseHead(k), () => headModelFor(mq.body) === k);
  for (const [k, v] of Object.entries(SPECIES)) { const co = v.coat && COATS[v.coat]; add('species', k, v.label, `${tr('Especie')} ${k}`, {sw: co ? co.c : CR_SKIN}, () => crChip('#speciesChips', k), () => mq.body.species === k); }
  for (const [k, p] of Object.entries(COATS)) add('species', 'coat:' + k, p.label, `${tr('Pelaje y marcas')} ${p.for.map(s => SPECIES[s] ? SPECIES[s].label + ' ' + s : s).join(' ')}`, {sw: p.c}, () => crUseCoat(k), () => (mq.body.coat || {}).preset === k);
  for (const [k, v] of Object.entries(BODY_PRESETS)) add('body', k, v.label, tr('Tipo de cuerpo'), {mask: CR.thumbs.get(k)}, () => crChip('#bodyChips', k), () => mq.bodyPreset === k);
  for (const b of BODY_BUILDS) add('body', 'build:' + b.id, b.label, tr('Complexión'), {icon: 'body'}, () => $(`#buildGrid .pose[data-id="${b.id}"]`)?.click(), () => mq.body.build === b.id);
  const human = mq.body.species === 'humano' && !mq.avatar;
  for (const [k, v] of Object.entries(human ? FACE_EXPR : ANTHRO_EXPR)) add('expr', k, v.label, tr('Expresión'), {face: k}, () => pickExpression(k), () => (human ? mq.body.expr || 'neutra' : mq.aexpr) === k);
  for (const c of SAVED_CHARS) add('char', 'mine:' + c.id, c.name, tr('Mis personajes'), {img: c.thumb}, () => placeCharacter(c));
  for (const c of PROJECT.cast) add('char', 'cast:' + c.id, c.name, tr('Reparto del proyecto'), {img: c.thumb}, () => placeCharacter(c));
  return out;
}
function crSearch() {
  const q = $('#crQ').value.trim(), box = $('#crResults'); CR.q = q;
  $('#crFilt').hidden = box.hidden = !q;
  if (!q) { $('#crCount').textContent = ''; box.innerHTML = ''; return; }
  // what is not loaded yet is searched again when it arrives
  const need = [!ROPA.catalog && loadCatalog(), !HAIR.list && loadHairList()].filter(Boolean);
  if (need.length) Promise.all(need).then(() => { if (CR.q === q) crSearch(); }, () => {});
  const w = uxNorm(q).split(/\s+/).filter(Boolean), hits = [], count = {};
  for (const x of crIndex()) {
    if (!w.every(t => x.n.includes(t))) continue;
    count[x.type] = (count[x.type] || 0) + 1; if (CR.filt !== 'all' && x.type !== CR.filt) continue;
    const l = uxNorm(x.label); hits.push([(l.startsWith(w[0]) ? 0 : l.includes(' ' + w[0]) ? 1 : 2) * 100 + l.length, x]);
  }
  const total = Object.values(count).reduce((a, b) => a + b, 0);
  chips($('#crFilt'), CR_FILTERS.filter(([k]) => k === 'all' || count[k]).map(([k, l]) => [k, `${tr(l)} ${k === 'all' ? total : count[k]}`]), CR.filt, v => { CR.filt = v; crSearch(); });
  CR.res = hits.sort((a, b) => a[0] - b[0]).slice(0, 60).map(h => h[1]);
  box.innerHTML = '';
  if (!CR.res.length) box.innerHTML = `<p class="empty">${tr('Nada coincide con la búsqueda.')}</p>`;
  for (const x of CR.res) box.append(crTile(x));
  crResultMarks();
  $('#crCount').textContent = trn(CR.res.length, '1 resultado', '{n} resultados');
}
function crTile(x) {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'crres'; b.dataset.type = x.type; b.dataset.id = x.id; b._x = x;
  const L = x.look;
  if (L.img) { const im = new Image(); im.alt = ''; im.loading = 'lazy'; im.src = L.img; b.append(im); }
  else if (L.sw) b.append(crSwatch(L.sw));
  else if (L.face) b.insertAdjacentHTML('beforeend', crFaceSvg(L.face));
  else if (L.mask) { const s = document.createElement('span'); s.className = 'crth'; s.style.setProperty('--m', `url(${L.mask})`); b.append(s); }
  else { const svg = $(`.crcat[data-cat="${L.icon || 'body'}"] svg`); if (svg) b.append(svg.cloneNode(true)); }
  const l = document.createElement('span'); l.className = 'lt'; l.textContent = x.label;
  const t = document.createElement('span'); t.className = 'ty'; t.textContent = tr(CR_TYPE[x.type]);
  b.append(l, t);
  b.onclick = () => { const why = x.why && x.why(); if (why) return toast(why); x.run(); setTimeout(crResultMarks, 50); };
  return b;
}
function crResultMarks() {
  for (const b of $$('#crResults .crres')) {
    const x = b._x, why = x.why && x.why();
    b.setAttribute('aria-pressed', String(!!(x.on && x.on()))); b.classList.toggle('blocked', !!why); b.title = why || `${x.label} · ${tr(CR_TYPE[x.type])}`;
  }
}
// the arrows walk the results as a grid; Escape goes back to the box
function crResultKeys(e) {
  const list = $$('#crResults .crres'), i = list.indexOf(document.activeElement); if (i < 0) return;
  const cols = Math.max(1, list.filter(b => b.offsetTop === list[0].offsetTop).length);
  const j = {ArrowRight: i + 1, ArrowLeft: i - 1, ArrowDown: i + cols, ArrowUp: i - cols, Home: 0, End: list.length - 1}[e.key];
  if (e.key === 'Escape') { e.preventDefault(); $('#crQ').focus(); return; }
  if (j === undefined) return; e.preventDefault();
  if (j < 0) return $('#crQ').focus();
  list[Math.min(j, list.length - 1)].focus();
}

/* ---------- building it ---------- */
function buildCreatorUI() {
  const rail = $('#crRail'); if (!rail) return;
  // the rail is made from the categories' own headings (their icon and name), so the two never disagree
  for (const c of $$('.crcat[data-cat]')) {
    const h = c.querySelector('h3'), b = document.createElement('button'), label = [...h.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
    b.type = 'button'; b.className = 'crr'; b.dataset.cat = c.dataset.cat; b.setAttribute('aria-controls', c.id); b.title = `${label}: ${h.querySelector('span') ? h.querySelector('span').textContent : ''}`;
    const s = document.createElement('span'); s.textContent = label; b.append(h.querySelector('svg').cloneNode(true), s);
    b.onclick = () => crGo(c.dataset.cat, true); rail.append(b);
  }
  rail.addEventListener('keydown', e => {
    const list = $$('#crRail .crr'), i = list.indexOf(document.activeElement); if (i < 0) return;
    const j = {ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: list.length - 1}[e.key]; if (j === undefined) return;
    e.preventDefault(); const b = list[(j + list.length) % list.length]; list.forEach(x => x.tabIndex = x === b ? 0 : -1); b.focus();
  });
  // (on a phone the rail scrolls sideways: its right edge fades until the end is in sight)
  const fade = () => rail.classList.toggle('end', rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 4);
  rail.addEventListener('scroll', fade, {passive: true}); new ResizeObserver(fade).observe(rail);
  for (const b of $$('.crdice')) { b.innerHTML = CR_DICE; b.onclick = () => crRandom(b.dataset.dice); }
  $('#crDice').onclick = () => crRandom('all');
  // the camera
  $('#crFace').onclick = () => crFrame('face'); $('#crBody').onclick = () => crFrame('body');
  $('#crRotL').onclick = () => crRotate(-45); $('#crRotR').onclick = () => crRotate(45);
  $('#crSpin').onclick = () => crSetSpin(!controls.autoRotate);
  $('#bbSpin').addEventListener('change', crSyncCam);
  // a hand on the canvas ends the camera's own moves (the turntable keeps turning: it is a mode)
  vp.addEventListener('pointerdown', e => { if (e.target === canvas && CR.on && CR.view) { CR.view = null; crSyncCam(); } });
  // the strip
  $('#crGalToggle').onclick = () => crFold($('#crGallery').classList.contains('folded'));
  $('#crNew').onclick = crNew; $('#crExport').onclick = crExportActive; $('#crExportAll').onclick = crExportAll;
  // the face's fine tuning, beside the faces
  crAmt = slider($('#crExprAmtBox'), {id: 'crExprAmt', label: 'Intensidad', min: 0, max: 1.3, step: .01, value: 1, fmt: pctFmt,
    input: v => { mq.body.exprAmt = v; rebuildActive(); }, change: () => { if (exprAmtEl) exprAmtEl.set(mq.body.exprAmt ?? 1); pushHistory(); }});
  // the search
  const q = $('#crQ');
  q.oninput = () => { CR.filt = CR.filt || 'all'; crSearch(); };
  q.onkeydown = e => {
    if (e.key === 'Enter') { e.preventDefault(); const f = $('#crResults .crres'); if (f) f.click(); }
    else if (e.key === 'ArrowDown') { const f = $('#crResults .crres'); if (f) { e.preventDefault(); f.focus(); } }
    else if (e.key === 'Escape' && q.value) { e.preventDefault(); e.stopPropagation(); q.value = ''; crSearch(); }
  };
  $('#crResults').addEventListener('keydown', crResultKeys);
  crPreviews();
  $('#book .page').addEventListener('scroll', () => { if (!CR.spyT) CR.spyT = requestAnimationFrame(() => { CR.spyT = 0; crSpy(); }); }, {passive: true});
  matchMedia('(max-width: 860px)').addEventListener('change', crPlace);
  CR.built = true; crPlace(); CR.on = false; creatorSync();
}
