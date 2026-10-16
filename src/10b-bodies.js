/* ======================= body builds and advanced body settings =======================
   MakeHuman's modelling targets (CC0, baked by tools/makehuman/build_body.py into figure-body.txt) give each body
   its own build on top of sex, age, muscle and fat: where the fat sits (belly, waist, hips, buttocks, bust, arms,
   legs), how the muscle shows (chest, back, V shape, arms, legs), proportions (shoulders, torso, hips, limb lengths)
   and the overall shape (apple, pear, hourglass, rectangle, inverted triangle, diamond, column, trapezoid).
   A build keeps the character's sex and age: it is how this person is made, not who they are. */
const BODY_ADV = [
  // key, label, group
  ['shoulders', 'Hombros', 'prop'], ['torsow', 'Anchura del torso', 'prop'], ['torsod', 'Fondo del torso', 'prop'], ['hipw', 'Anchura de cadera', 'prop'],
  ['neck', 'Cuello', 'prop'], ['uarmlen', 'Largo del brazo', 'prop'], ['farmlen', 'Largo del antebrazo', 'prop'], ['thighlen', 'Largo del muslo', 'prop'], ['shinlen', 'Largo de la pierna', 'prop'],
  ['vshape', 'Espalda en V', 'mus'], ['pecs', 'Pectorales', 'mus'], ['lats', 'Dorsales', 'mus'], ['armmus', 'Músculo de los brazos', 'mus'], ['legmus', 'Músculo de las piernas', 'mus'],
  ['belly', 'Barriga', 'fat'], ['waist', 'Cintura', 'fat'], ['hips', 'Caderas', 'fat'], ['glutes', 'Glúteos', 'fat'], ['bust', 'Pecho', 'fat'],
  ['armfat', 'Grasa en los brazos', 'fat'], ['legfat', 'Grasa en las piernas', 'fat'], ['uarm', 'Contorno del brazo', 'fat'], ['thigh', 'Muslos', 'fat'], ['calf', 'Pantorrillas', 'fat']
];
const BODY_ADV_GROUPS = {prop: 'Proporciones', mus: 'Músculo', fat: 'Grasa y volumen'};
// overall shapes: MakeHuman's target for women, and for men (the other one stands in where one is missing)
const BODY_SHAPES = {
  ninguna: ['Sin forma'], manzana: ['Manzana', 'fem-apple', 'man-apple'], pera: ['Pera', 'fem-triangle', 'man-triangle'],
  reloj: ['Reloj de arena', 'fem-full-hourglass', null], rectangulo: ['Rectángulo', 'fem-rectangle', 'man-rectangle'],
  triangulo: ['Triángulo invertido', 'fem-invert-triangle', 'man-invert-triangle'], diamante: ['Diamante', 'fem-diamond', null],
  columna: ['Columna', 'fem-lean-column', 'man-lean-column'], trapecio: ['Trapecio', null, 'man-trapezoid']
};
// builds: muscle and fat, where they sit, and the shape (sex, age, height and proportions stay)
const BODY_BUILDS = [
  {id: 'media', label: 'Media', set: {muscle: .5, weight: .5}},
  {id: 'delgada', label: 'Delgada', set: {muscle: .3, weight: .12, shape: 'columna', shapeAmt: .7, adv: {shoulders: -.2, uarm: -.3, thigh: -.3}}},
  {id: 'fibrosa', label: 'Fibrosa', set: {muscle: .7, weight: .15, adv: {vshape: .3, armmus: .3, legmus: .3}}},
  {id: 'atletica', label: 'Atlética', set: {muscle: .78, weight: .3, shape: 'triangulo', shapeAmt: .5, adv: {vshape: .45, pecs: .3, shoulders: .25}}},
  {id: 'culturista', label: 'Culturista', set: {muscle: 1, weight: .2, adv: {vshape: 1, pecs: .8, lats: .7, armmus: .8, legmus: .7, shoulders: .5, neck: .5, waist: -.3}}},
  {id: 'fuerte', label: 'Fuerte', set: {muscle: .85, weight: .72, adv: {torsow: .4, torsod: .3, belly: .25, neck: .6, armmus: .4, legmus: .4, uarm: .4, thigh: .4}}},
  {id: 'robusta', label: 'Robusta', set: {muscle: .55, weight: .7, shape: 'rectangulo', shapeAmt: .6, adv: {torsow: .45, shoulders: .3, neck: .4, shinlen: -.25, thighlen: -.15}}},
  {id: 'curvas', label: 'Con curvas', set: {muscle: .45, weight: .58, shape: 'reloj', shapeAmt: .9, adv: {hips: .45, bust: .35, glutes: .4, waist: -.25, thigh: .3}}},
  {id: 'pera', label: 'Pera', set: {muscle: .4, weight: .6, shape: 'pera', shapeAmt: .9, adv: {hips: .6, glutes: .5, thigh: .55, legfat: .4, shoulders: -.25, bust: -.15}}},
  {id: 'manzana', label: 'Manzana', set: {muscle: .4, weight: .68, shape: 'manzana', shapeAmt: .9, adv: {belly: .55, waist: .6, armfat: .2, legfat: -.15}}},
  {id: 'grande', label: 'Talla grande', set: {muscle: .45, weight: 1, adv: {belly: .45, waist: .4, hips: .35, armfat: .55, legfat: .5, uarm: .4, thigh: .45, neck: .4}}},
  {id: 'blanda', label: 'Blanda', set: {muscle: .1, weight: .55, adv: {belly: .3, armfat: .3, legfat: .2, pecs: -.3}}},
  {id: 'embarazo', label: 'Embarazo', set: {muscle: .4, weight: .55, adv: {belly: 1, bust: .4, hips: .2}}},
  {id: 'acondroplasia', label: 'Acondroplasia', set: {muscle: .5, weight: .55, adv: {uarmlen: -1, thighlen: -1, farmlen: -.6, shinlen: -.6, torsow: .15, hipw: .1}, extra: {head: 1.12, legs: .78, arms: .8}}}
];
tLabels(Object.fromEntries(BODY_BUILDS.map(b => [b.id, b])));
for (const v of Object.values(BODY_SHAPES)) v[0] = tr(v[0]);

// the weights of the sets for a body: each advanced slider -1..1 to its decrease or increase target, the shape by sex
function bodyMorphs(b) {
  const w = {};
  for (const [k, v] of Object.entries(b.adv || {})) if (Math.abs(v) > 1e-3) w[`b-${k}${v > 0 ? '+' : '-'}`] = Math.abs(v);
  const sh = BODY_SHAPES[b.shape], amt = b.shapeAmt ?? .7;
  if (sh && sh[1] !== undefined && amt > 0) {
    const g = b.gender ?? 1, fem = sh[1] || sh[2], man = sh[2] || sh[1];
    if (fem) w['bs-' + fem] = (w['bs-' + fem] || 0) + (1 - g) * amt;
    if (man) w['bs-' + man] = (w['bs-' + man] || 0) + g * amt;
  }
  return w;
}
function applyBuild(m, build) {
  const s = build.set, prev = m.body.build && (BODY_BUILDS.find(b => b.id === m.body.build) || {}).set, undo = prev && prev.extra ? Object.fromEntries(Object.keys(prev.extra).map(k => [k, BODY_BASE[k]])) : {};
  m.body = {...m.body, ...undo, ...(s.extra || {}), muscle: s.muscle, weight: s.weight, adv: {...(s.adv || {})}, shape: s.shape || 'ninguna', shapeAmt: s.shapeAmt ?? .7, build: build.id};
}

/* ---------- the panel ---------- */
let buildThumbR = null, buildFig = null;
function buildThumb(build) {  // a silhouette of the build on the active character's sex and age, front and side
  try {
    if (!buildThumbR) { buildThumbR = new THREE.WebGLRenderer({antialias: true, alpha: true, preserveDrawingBuffer: true}); buildThumbR.setPixelRatio(2); buildThumbR.setSize(96, 120); buildThumbR.setClearColor(0, 0);
      buildFig = new Mannequin({sil: new THREE.MeshBasicMaterial({color: 0xffffff})}, 'sil'); buildFig.noMuscles = true; buildFig.sc = new THREE.Scene(); buildFig.cam = new THREE.PerspectiveCamera(24, 96 / 120, .05, 80); }
    const fake = {body: {...BODY_BASE, gender: mq.body.gender, age: mq.body.age}}; applyBuild(fake, build);
    buildFig.build(fake.body); buildFig.joints.hips.position.set(0, buildFig.rootY, 0); applyPreset(buildFig, POSE.pie); buildFig.sc.add(buildFig.group);
    const box = buildFig.box(8), c = box.getCenter(new V3()), h = box.getSize(new V3()).y;
    buildFig.cam.position.set(c.x + h * .9, c.y, c.z + h * 2.1); buildFig.cam.lookAt(c); buildThumbR.render(buildFig.sc, buildFig.cam);
    return buildThumbR.domElement.toDataURL('image/png');
  } catch (e) { return null; }
}
const buildThumbs = new Map();
function renderBuilds() {
  const grid = $('#buildGrid'); if (!grid) return; grid.innerHTML = '';
  const key = `${(mq.body.gender ?? 1) > .5 ? 'm' : 'f'}${(mq.body.age ?? 1) < .6 ? 'c' : (mq.body.age ?? 1) > 1.3 ? 'o' : 'a'}`;
  for (const b of BODY_BUILDS) {
    const el = poseCard(b.label, () => { applyBuild(mq, b); rebuildActive(true); syncBodyUI(); pushHistory(); markBuild(); }, buildThumbs.get(key + b.id));
    el.dataset.id = b.id; grid.appendChild(el);
    if (!buildThumbs.has(key + b.id)) requestAnimationFrame(() => { const url = buildThumb(b); if (!url) return; buildThumbs.set(key + b.id, url); const th = el.querySelector('.th'); th.classList.remove('pending'); th.style.setProperty('--m', `url(${url})`); });
  }
  markBuild();
}
function markBuild() { $$('#buildGrid .pose').forEach(el => el.classList.toggle('on', el.dataset.id === mq.body.build)); }
const advEls = {};
function buildAdvancedUI() {
  const box = $('#advBody'); if (!box) return; box.innerHTML = '';
  // overall shape first: the quickest way to put the fat somewhere else
  const shapeRow = document.createElement('div'); shapeRow.className = 'advgroup';
  shapeRow.innerHTML = `<p class="advh">${tr('Forma corporal')}</p><div class="chips" id="shapeChips"></div><div id="shapeAmtBox"></div>`; box.appendChild(shapeRow);
  chips($('#shapeChips'), Object.entries(BODY_SHAPES).map(([k, v]) => [k, v[0]]), mq.body.shape || 'ninguna', v => { mq.body.shape = v; mq.body.build = null; markBuild(); rebuildActive(); pushHistory(); });
  advEls.shapeAmt = slider($('#shapeAmtBox'), {id: 'b_shapeAmt', label: 'Intensidad de la forma', min: 0, max: 1.5, step: .05, value: mq.body.shapeAmt ?? .7, fmt: pctFmt, input: v => { mq.body.shapeAmt = v; rebuildActive(); }, change: pushHistory});
  for (const [g, title] of Object.entries(BODY_ADV_GROUPS)) {
    const grp = document.createElement('div'); grp.className = 'advgroup'; grp.innerHTML = `<p class="advh">${tr(title)}</p>`; box.appendChild(grp);
    for (const [k, label, gg] of BODY_ADV) if (gg === g)
      advEls[k] = slider(grp, {id: 'adv_' + k, label, min: -1, max: 1, step: .05, value: (mq.body.adv || {})[k] || 0, fmt: v => (v > 0 ? '+' : '') + Math.round(v * 100) + '%',
        input: v => { mq.body.adv = {...(mq.body.adv || {}), [k]: v}; mq.body.build = null; markBuild(); rebuildActive(); }, change: pushHistory});
  }
  for (const k of Object.keys(advEls)) if (k !== 'shapeAmt') advEls[k].inp.ondblclick = () => { mq.body.adv = {...(mq.body.adv || {}), [k]: 0}; advEls[k].set(0); rebuildActive(); pushHistory(); };
  const reset = document.createElement('button'); reset.className = 'btn small'; reset.textContent = tr('Restablecer los ajustes avanzados');
  reset.onclick = () => { mq.body.adv = {}; mq.body.shape = 'ninguna'; mq.body.build = null; syncAdvancedUI(); markBuild(); rebuildActive(true); pushHistory(); };
  box.appendChild(reset);
}
function syncAdvancedUI() {
  for (const [k, el] of Object.entries(advEls)) el.set(k === 'shapeAmt' ? (mq.body.shapeAmt ?? .7) : (mq.body.adv || {})[k] || 0);
  if ($('#shapeChips')) setPressed($('#shapeChips'), mq.body.shape || 'ninguna');
  markBuild();
}
function buildBodiesUI() { renderBuilds(); buildAdvancedUI(); }
