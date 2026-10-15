/* ======================= anthro anatomy =======================
   Heads are sculpted out of the body's own head, not glued on: the lower face is drawn forward into a snout that
   tapers to the nose, the brow stays put so the "stop" (the step between forehead and snout) appears where the
   eyes are, the cranium takes the species' width and the human ears are folded flat against the skull.
   All numbers are in head heights (crown to chin), so they hold for every age and proportion. */
/* Heads: sculpted MakeHuman community targets on our own base mesh, each split into a face part (snout, eyes, jaw)
   and an ear part (skull back and ears) so the two can be dosed apart.
   Research behind the three styles:
   - Kemono (Japanese): round compact cranium, big forward-facing eyes (up to a third of the face), short soft muzzle that
     barely projects and melts into full cheeks, tiny nose, small mouth (furmakers.com kemono guides; kemono 獣度 scale).
   - Western toony: pronounced snout and wide jaw, cartoon eyes, exaggerated features.
   - Western semi-realistic: the animal's real skull: canid muzzle long and boxy with a marked stop, feline short and
     round with whisker pads and a soft stop, prey animals with eyes to the side.
   The kemo level (獣度) goes from 1 (kemonomimi: human face, animal ears) to 5 (full animal head). */
const HEAD_RECIPES = {
  //        face sets at full level           ears                  toony face (optional)                   pupil
  lobo:   {face: [['x3009f', 1]],             ears: [['x3009e', 1]], toon: [['x3488f', .7], ['x3009f', .3]], pupil: 'redonda', mouth: 'canino'},
  zorro:  {face: [['x3488f', .85], ['x3009f', .15]], ears: [['x3488e', 1]], toon: [['x3488f', 1]],           pupil: 'rendija', mouth: 'canino'},
  perro:  {face: [['x3540f', 1]],             ears: [['x3540e', 1]],                                          pupil: 'redonda', mouth: 'canino'},
  gato:   {face: [['x3144f', 1]],             ears: [['x3144e', 1]],                                          pupil: 'rendija', mouth: 'felino'},
  tigre:  {face: [['x3221f', 1]],             ears: [['x3221e', 1]],                                          pupil: 'redonda', mouth: 'felino'},
  leon:   {face: [['x3200f', 1]],             ears: [['x3200e', 1]], kemono: [['x3178f', 1]],                 pupil: 'redonda', mouth: 'felino'},
  oso:    {face: [['x3487f', 1]],             ears: [['x3487e', 1]], toon: [['x3486f', 1]], kemono: [['x3486f', 1]], kemonoEars: [['x3486e', 1]], pupil: 'redonda', mouth: 'canino'},
  conejo: {face: [['x3152f', 1]],             ears: [['x3152e', 1]], kemono: [['x3489f', 1]], kemonoEars: [['x3489e', 1]], pupil: 'redonda', mouth: 'roedor', side: 1},
  caballo:{face: [['x2952f', 1]],             ears: [['x2952e', 1]],                                          pupil: 'horizontal', mouth: 'herbivoro', side: 1},
  cabra:  {face: [['x2952f', .6]],            ears: [['x2952e', 1]],                                          pupil: 'horizontal', mouth: 'herbivoro', side: 1},
  ciervo: {face: [['x2952f', .8]],            ears: [['x2952e', 1]],                                          pupil: 'horizontal', mouth: 'herbivoro', side: 1},
  dragon: {face: [['x2931', 1]],              ears: [],                                                        pupil: 'rendija', mouth: 'reptil'}
};
const HEAD_STYLES = {real: 'Occidental realista', toon: 'Occidental toony', kemono: 'Kemono'};
const KEMO_LEVEL = {1: 'Kemonomimi (cara humana)', 2: 'Hocico muy corto', 3: 'Hocico corto', 4: 'Hocico medio', 5: 'Hocico completo'};
const HEAD_CREDITS = 'Cabezas y orejas: targets de JALdMIC (CC-BY) y titleknown (CC0), comunidad MakeHuman.';
// morph weights for a body: species head at its style and kemo level
function speciesMorphs(b) {
  const r = HEAD_RECIPES[b.species]; if (!r) return {};
  const style = b.headStyle || 'real', lvl = clamp(Math.round(b.kemo ?? (style === 'kemono' ? 3 : 5)), 1, 5);
  const k = [0, 0, .3, .55, .8, 1][lvl];
  const out = {}, add = (list, w) => { for (const [n, x] of list || []) out[n] = (out[n] || 0) + x * w; };
  const face = style === 'kemono' ? (r.kemono || r.face) : style === 'toon' ? (r.toon || r.face) : r.face;
  add(face, style === 'kemono' ? Math.min(k, .6) * (r.kemono ? 1.4 : 1) : k);
  add(style === 'kemono' ? (r.kemonoEars || r.ears) : r.ears, 1);
  if (style === 'kemono') { out.x171 = (out.x171 || 0) + 1; out.x2248 = (out.x2248 || 0) + 1; }
  if (style === 'toon') { out.x171 = (out.x171 || 0) + .5; out.x2248 = (out.x2248 || 0) + .45; }
  return out;
}
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function headLandmarks(m, P) {
  const nV = FIG.meta.nV, H = FIG.jIdx.head, Jw = FIG.jIdx.jaw;
  let ex = 0, ey = 0, ez = 0, ne = 0, y0 = Infinity, y1 = -Infinity, xw = 0, zf = -Infinity;
  for (let i = 0; i < nV; i++) {
    if (FIG.eye[i]) { ex += Math.abs(P[i * 3]); ey += P[i * 3 + 1]; ez += P[i * 3 + 2]; ne++; continue; }
    const d = m.dom[i]; if (d !== H && d !== Jw) continue;
    const y = P[i * 3 + 1]; if (y < y0) y0 = y; if (y > y1) y1 = y; xw = Math.max(xw, Math.abs(P[i * 3])); zf = Math.max(zf, P[i * 3 + 2]);
  }
  return {eyeX: ex / ne, eyeY: ey / ne, eyeZ: ez / ne, chin: y0, crown: y1, hh: y1 - y0, hw: xw, front: zf};
}
// mouth line: top of the lower jaw (vertices carried mostly by the jaw bone)
function mouthLine(m, P, L) {
  const nV = FIG.meta.nV, Jw = FIG.jIdx.jaw; let my = -Infinity;
  for (let i = 0; i < nV; i++) if (m.dom[i] === Jw && Math.abs(P[i * 3]) < .25 * L.hw) my = Math.max(my, P[i * 3 + 1]);
  return isFinite(my) ? my : L.chin + .2 * L.hh;
}
// the snout of a target head opens along its mouth line: lower half goes to the jaw, the seam is marked for cutting
function anthroHead(m, P) {
  const SI = m.geo.attributes.skinIndex.array, SW = m.geo.attributes.skinWeight.array;
  if (m.anthroSkinned) { for (let i = 0; i < SI.length; i++) { SI[i] = FIG.si[i]; SW[i] = FIG.sw[i] / 255; } m.anthroSkinned = false; }
  if (!m.geo.attributes.aLip) m.geo.setAttribute('aLip', new THREE.BufferAttribute(new Float32Array(FIG.meta.nV), 1));
  const LIP = m.geo.attributes.aLip.array; LIP.fill(1); m.geo.attributes.aLip.needsUpdate = true;
  m.geo.attributes.skinIndex.needsUpdate = m.geo.attributes.skinWeight.needsUpdate = true;
  const r = HEAD_RECIPES[m.body.species];
  if (!r) { m.anthro = null; return; }
  const nV = FIG.meta.nV, H = FIG.jIdx.head, Jw = FIG.jIdx.jaw, L = headLandmarks(m, P), hh = L.hh, hw = L.hw, mY = mouthLine(m, P, L);
  let tip = null, tipZ = -Infinity;
  for (let i = 0; i < nV; i++) {
    const d = m.dom[i]; if ((d !== H && d !== Jw) || FIG.eye[i]) continue;
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    // snout: in front of the eyes, below them, inside the cheeks
    const w = sstep(L.eyeZ - .06 * hh, L.eyeZ + .06 * hh, z) * sstep(L.eyeY - .02 * hh, L.eyeY - .12 * hh, y) * (1 - sstep(.5 * hw, .95 * hw, Math.abs(x)));
    if (Math.abs(x) < .012 * hh && y > mY && z > tipZ) { tipZ = z; tip = [0, y, z]; }
    if (w <= 0 || y >= mY - .004 * hh) continue;
    if (w > .04) LIP[i] = -1;
    const o = i * 4; let jw = 0;
    for (let k = 0; k < 4; k++) if (SI[o + k] === Jw) jw += SW[o + k];
    if (w <= jw) continue;
    for (let k = 0; k < 4; k++) SW[o + k] *= (1 - w) / Math.max(1e-6, 1 - jw);
    let slot = -1; for (let k = 0; k < 4; k++) if (SI[o + k] === Jw) slot = k;
    if (slot < 0) { slot = 0; for (let k = 1; k < 4; k++) if (SW[o + k] < SW[o + slot]) slot = k; SI[o + slot] = Jw; }
    SW[o + slot] = w;
    const sum = SW[o] + SW[o + 1] + SW[o + 2] + SW[o + 3]; for (let k = 0; k < 4; k++) SW[o + k] /= sum;
    m.anthroSkinned = true;
  }
  // ears: the vertices the species' ear target lifts away from the skull belong to the ear bones; their base is the pivot
  const earW = new Float32Array(nV), mor = {...speciesMorphs(m.body), ...(m.body.morphs || {})};
  for (const [name, wt] of Object.entries(mor)) {
    if (!/^x\d+e$/.test(name) && !(HEAD_RECIPES[m.body.species].ears || []).some(([n]) => n === name)) continue;
    const x = FIG.xsets[name]; if (!x) continue; const q = FIG.meta.q * wt;
    for (let k = 0; k < x.iv.length; k++) { const d = Math.hypot(x.dv[k * 3], x.dv[k * 3 + 1], x.dv[k * 3 + 2]) * q; earW[x.iv[k]] = Math.max(earW[x.iv[k]], d); }
  }
  const earBase = {}, acc = {L: [0, 0, 0, 0], R: [0, 0, 0, 0]}, EL = FIG.meta.bones.length, lo = .015 * hh, hi = .13 * hh;
  for (let i = 0; i < nV; i++) {
    if (earW[i] < lo * .5 || FIG.eye[i]) { earW[i] = 0; continue; }
    const y = P[i * 3 + 1]; if (y < L.eyeY) { earW[i] = 0; continue; }
    const w = sstep(lo, hi, earW[i]); earW[i] = w;
    const k = P[i * 3] > 0 ? 'L' : 'R';
    if (w > .15 && w < .45) { const a = acc[k]; a[0] += P[i * 3]; a[1] += P[i * 3 + 1]; a[2] += P[i * 3 + 2]; a[3]++; }
    if (w > .02) {
      const o = i * 4, bone = EL + (k === 'L' ? 0 : 1);
      for (let j = 0; j < 4; j++) SW[o + j] *= 1 - w;
      let slot = 0; for (let j = 1; j < 4; j++) if (SW[o + j] < SW[o + slot]) slot = j;
      SI[o + slot] = bone; SW[o + slot] = w;
      const sum = SW[o] + SW[o + 1] + SW[o + 2] + SW[o + 3]; for (let j = 0; j < 4; j++) SW[o + j] /= sum;
      m.anthroSkinned = true;
    }
  }
  for (const k of ['L', 'R']) if (acc[k][3] > 3) earBase[k] = new V3(acc[k][0] / acc[k][3], acc[k][1] / acc[k][3], acc[k][2] / acc[k][3]);
  // snout length decides whether there is a muzzle to open
  const snout = tip ? (tip[2] - L.eyeZ) / hh : 0;
  m.anthro = {L, mouthY: mY, tip, spec: {snout, nose: r.mouth}, recipe: r, earBase: Object.keys(earBase).length ? earBase : null};
}
// after the body is lifted onto the ground, landmarks move with it
function shiftAnthro(m, dy) {
  const an = m.anthro; if (!an) return;
  an.L.eyeY -= dy; an.L.chin -= dy; an.L.crown -= dy; an.mouthY -= dy; if (an.tip) an.tip[1] -= dy;
  if (an.earBase) for (const k in an.earBase) an.earBase[k].y -= dy;
}
/* inside of the snout, shown when the jaw opens: palate and floor (dark), tongue, and teeth with canines */
const MOUTH_MATS = {};
function mouthMat(kind) {
  if (!MOUTH_MATS[kind]) MOUTH_MATS[kind] = patchEnv(new THREE.MeshToonMaterial({color: kind === 'teeth' ? 0xf1ece0 : kind === 'tongue' ? 0xb0646a : 0x4a2a2a, gradientMap: TOON_GRAD, side: THREE.DoubleSide}));
  return MOUTH_MATS[kind];
}
function snoutProfile(m) {
  const an = m.anthro, L = an.L, hh = L.hh, H = FIG.jIdx.head, Jw = FIG.jIdx.jaw, hs = m.headSwap;
  const P = hs ? hs.Q : m.geo.attributes.position.array, nV = hs ? hs.d.n : FIG.meta.nV;
  const use = hs ? (i => hs.d.K[i] === 0 && hs.d.ear[i] < 25) : (i => (m.dom[i] === H || m.dom[i] === Jw) && !FIG.eye[i]);
  const z0 = L.eyeZ - .18 * hh, z1 = an.tip[2], n = 7, out = [];
  for (let k = 0; k < n; k++) {
    const zs = z0 + (z1 - z0) * k / (n - 1), band = (z1 - z0) / n * .8;
    let xw = 0, top = -Infinity, bot = Infinity;
    for (let i = 0; i < nV; i++) {
      if (!use(i)) continue;
      if (Math.abs(P[i * 3 + 2] - zs) > band) continue;
      const y = P[i * 3 + 1];
      if (Math.abs(y - an.mouthY) < .07 * hh) xw = Math.max(xw, Math.abs(P[i * 3]));
      if (Math.abs(P[i * 3]) < .02 * hh) { top = Math.max(top, y); bot = Math.min(bot, y); }
    }
    if (!isFinite(top)) { top = an.mouthY + .05 * hh; bot = an.mouthY - .05 * hh; }
    out.push({z: zs, xw: Math.max(xw, .02 * hh), top, bot});
  }
  return out;
}
// geometries for the accessory skeleton: index 1 = head, 5 = jaw
function mouthParts(m) {
  const an = m.anthro; if (!an || !an.tip || an.spec.snout < .2) return [];
  const pr = snoutProfile(m), hh = an.L.hh, mY = an.mouthY, z0 = pr[0].z, HEAD = 1, JAW = 5, parts = [];
  const len = pr[pr.length - 1].z - z0;
  const at = t => { const f = clamp(t, 0, 1) * (pr.length - 1), i = Math.min(pr.length - 2, Math.floor(f)), u = f - i, A = pr[i], B = pr[i + 1];
    return {xw: A.xw + (B.xw - A.xw) * u, top: A.top + (B.top - A.top) * u, bot: A.bot + (B.bot - A.bot) * u}; };
  // cavity: a tube just inside the snout, upper half on the skull, lower half on the jaw
  const secs = [];
  for (let k = 0; k <= 6; k++) { const t = k / 6, p = at(t * .94), r = Math.max(.012 * hh, Math.min(p.top - mY, mY - p.bot) * .7);
    secs.push([t * len * .94, p.xw * .5 * (k === 6 ? .5 : 1), r * (k === 6 ? .5 : 1)]); }
  parts.push({kind: 'cavity', geo: loft({origin: new V3(0, mY, z0), axis: new V3(0, 0, 1), side: new V3(1, 0, 0), secs, radial: 20, n: 2.2,
    weights: (t, ph) => { const lo = sstep(.15, -.35, -Math.cos(ph)); return [[JAW, lo], [HEAD, 1 - lo]]; }})});
  // tongue on the jaw floor
  const tg = []; for (let k = 0; k <= 5; k++) { const t = k / 5, p = at(.1 + t * .7); tg.push([t * len * .7, p.xw * .5 * (k === 5 ? .4 : 1), .012 * hh * (k === 5 ? .5 : 1)]); }
  parts.push({kind: 'tongue', geo: loft({origin: new V3(0, mY - .025 * hh, z0 + len * .1), axis: new V3(0, 0, 1), side: new V3(1, 0, 0), secs: tg, radial: 14, n: 2.4, weights: () => [[JAW, 1]]})});
  // teeth: canines near the front, a row of smaller ones behind them
  const tooth = (x, y, z, h, r, down, bone) => loft({origin: new V3(x, y, z), axis: new V3(0, down ? -1 : 1, 0), side: new V3(1, 0, 0), radial: 8,
    secs: [[-r * .5, r, r * .8], [0, r, r * .8], [h * .6, r * .55, r * .45], [h, .0015, .0015]], weights: () => [[bone, 1]]});
  const mt = an.spec.nose, fangs = mt === 'canino' || mt === 'felino' || mt === 'reptil';
  for (const sd of [1, -1]) {
    const pc = at(.86), cx = sd * pc.xw * .7, ch = .13 * hh * Math.min(1.4, an.spec.snout + .4) * (mt === 'felino' ? 1.25 : 1);
    if (fangs) {
      parts.push({kind: 'teeth', geo: tooth(cx, mY + .006 * hh, z0 + len * .86, ch, .016 * hh, true, HEAD)});
      parts.push({kind: 'teeth', geo: tooth(cx * .9, mY - .006 * hh, z0 + len * .8, ch * .8, .014 * hh, false, JAW)});
    }
    if (mt === 'roedor') { // two long front incisors on top
      parts.push({kind: 'teeth', geo: tooth(sd * .012 * hh, mY + .004 * hh, z0 + len * .98, .06 * hh, .011 * hh, true, HEAD)});
      continue;
    }
    for (let k = 0; k < 4; k++) { const t = .74 - k * .14, p = at(t), x = sd * p.xw * .74;
      parts.push({kind: 'teeth', geo: tooth(x, mY + .004 * hh, z0 + len * t, .035 * hh, .011 * hh, true, HEAD)});
      parts.push({kind: 'teeth', geo: tooth(x * .95, mY - .004 * hh, z0 + len * (t - .04), .03 * hh, .01 * hh, false, JAW)}); }
    // incisors across the tip
    for (let k = 0; k < 3; k++) { const p = at(.96), x = sd * p.xw * (.14 + k * .22);
      parts.push({kind: 'teeth', geo: tooth(x, mY + .004 * hh, z0 + len * .97, .022 * hh, .007 * hh, true, HEAD)}); }
  }
  return parts;
}
// the mouth opens: lips part (their seam is not drawn) and the inside shows
function anthroTick() {
  for (const m of chars) {
    if (!m.joints || !m.joints.jaw) continue;
    const q = m.joints.jaw.quaternion, ang = 2 * Math.acos(Math.min(1, Math.abs(q.w))), open = !!m.anthro && ang > .05;
    if (open !== !!m.mouthOpen) { m.mouthOpen = open; if (m.lib.uMouth) m.lib.uMouth.value = open ? 1 : 0; for (const p of m.mouthMeshes || []) p.visible = open && m.formMode !== 'formas'; }
  }
}

/* expressions: jaw opening and ear pose (degrees). back = ears laid back, out = ears turned/drooping to the side */
const ANTHRO_EXPR = {
  neutra:   {label: 'Neutra',     jaw: 0,  back: 0,   out: 0,   twist: 0},
  alerta:   {label: 'Alerta',     jaw: 0,  back: -12, out: -8,  twist: -10},
  feliz:    {label: 'Contenta',   jaw: 14, back: 8,   out: 6,   twist: 0},
  jadeo:    {label: 'Jadeando',   jaw: 22, back: 14,  out: 12,  twist: 0},
  enfado:   {label: 'Gruñido',    jaw: 10, back: 55,  out: 20,  twist: 25},
  miedo:    {label: 'Miedo',      jaw: 6,  back: 70,  out: 35,  twist: 10},
  triste:   {label: 'Triste',     jaw: 0,  back: 25,  out: 60,  twist: -10},
  sorpresa: {label: 'Sorpresa',   jaw: 18, back: -15, out: -5,  twist: -15},
  aullido:  {label: 'Aullido',    jaw: 30, back: 30,  out: 5,   twist: 0},
  rugido:   {label: 'Rugido',     jaw: 38, back: 45,  out: 25,  twist: 20},
  curiosa:  {label: 'Curiosa',    jaw: 4,  back: -8,  out: 0,   twist: -25, tilt: 1}
};
function applyExpression(m, id) {
  const e = ANTHRO_EXPR[id]; if (!e || !m.joints) return;
  m.joints.jaw.rotation.set(e.jaw * DEG, 0, 0);
  for (const [k, sd] of [['L', 1], ['R', -1]]) {
    const out = e.out * (e.tilt && sd < 0 ? .3 : 1);
    m.joints['ear' + k].rotation.set(-e.back * DEG, sd * e.twist * DEG, -sd * out * DEG);
  }
}
// the face: humans get MakeHuman's facial expressions (stored in the body, with an intensity);
// anthro characters keep the jaw-and-ears expressions of their sculpted heads
let exprAmtEl = null, exprFor = null;
function buildExprUI() {
  exprAmtEl = slider($('#exprAmtBox'), {id: 'exprAmt', label: 'Intensidad', min: 0, max: 1.3, step: .01, value: 1, fmt: pctFmt,
    input: v => { mq.body.exprAmt = v; rebuildActive(); }, change: pushHistory});
  syncExprUI();
}
function syncExprUI() {
  if (!exprAmtEl) return;
  const human = mq.body.species === 'humano' && !mq.avatar, kind = human ? 'h' : 'a';
  if (exprFor !== kind) {
    exprFor = kind;
    if (human) chips($('#exprChips'), Object.entries(FACE_EXPR).map(([k, v]) => [k, v.label]), mq.body.expr || 'neutra', id => {
      mq.body.expr = id === 'neutra' ? undefined : id; if (mq.body.exprAmt === undefined) mq.body.exprAmt = 1; rebuildActive(true); syncExprUI(); pushHistory(); });
    else chips($('#exprChips'), Object.entries(ANTHRO_EXPR).map(([k, v]) => [k, v.label]), null, id => { applyExpression(mq, id); setPressed($('#exprChips'), id); pushHistory(); });
  }
  if (human) setPressed($('#exprChips'), mq.body.expr || 'neutra');
  $('#exprAmtBox').hidden = !human || !mq.body.expr;
  exprAmtEl.set(mq.body.exprAmt ?? 1);
  $('#exprNote').textContent = tr(human ? 'Cejas, ojos y boca de MakeHuman. Para abrir más la boca, toca la mandíbula y gírala.'
    : 'Abre la boca y mueve las orejas de los personajes anthro. También puedes tocar la mandíbula o una oreja para girarlas a mano.');
}

// the body as the skeleton stretch sees it: kemono heads are larger, rounder craniums
// body proportions by style: kemono bigger, rounder head and slightly shorter legs; western toony a little bigger head
const effBody = b => {
  if (!HEAD_RECIPES[b.species]) return b;
  const L = legSpec(b); if (L) b = {...b, legs: (b.legs ?? 1) * (L.type === 'ungu' ? .84 : .88)};
  if (b.headStyle === 'kemono') return {...b, head: (b.head ?? 1) * 1.12, legs: (b.legs ?? 1) * .96};
  if (b.headStyle === 'toon') return {...b, head: (b.head ?? 1) * 1.05};
  return b;
};
let kemoSl = null;
function buildHeadUI() {
  const box = $('#headStyle'); if (!box) return;
  chips($('#feetChips'), [['animal', 'Del animal'], ['humano', 'Humanas']], mq.body.feet || 'animal', v => { mq.body.feet = v === 'animal' ? undefined : v; rebuildActive(true); pushHistory(); });
  syncHeadUI();
}
// sculpted head choices for this species (plus the MakeHuman target head)
function renderHeadModels() {
  const box = $('#headModelChips'); if (!box) return;
  const sp = mq.body.species, list = Object.entries(HEAD_CATALOG).filter(([, c]) => c.species.includes(sp));
  const id = headModelFor(mq.body), c = id && HEAD_CATALOG[id];
  chips(box, list.map(([k, c]) => [k, c.label]), id, v => {
    mq.body.headModel = v; mq.body.headStyle = HEAD_CATALOG[v].style;
    rebuildActive(true); syncHeadUI(); pushHistory();
  });
  box.parentElement.hidden = list.length < 2;
  const cr = $('#headCredit'); cr.innerHTML = '';
  if (c) { cr.append(tr('Cabeza: «{x}» de {a} (CC-BY), ', {x: c.label.replace(/ \(.*\)$/, ''), a: c.author})); const a = document.createElement('a'); a.href = c.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Sketchfab'; cr.append(a, '.'); }
  else cr.textContent = tr(HEAD_CREDITS);
}
function syncHeadUI() {
  const box = $('#headStyle'); if (!box) return;
  const on = !!HEAD_RECIPES[mq.body.species]; box.hidden = !on;
  setPressed($('#feetChips'), mq.body.feet || 'animal');
  const L = ANIMAL_LEGS[mq.body.species]; $('#feetNote').textContent = L ? tr(L.type === 'ungu' ? 'Del animal: patas ungulígradas, apoyadas en la pezuña, con el corvejón alto.' : 'Del animal: patas digitígradas, apoyadas en los dedos; el tobillo es el corvejón que dobla hacia atrás.') : '';
  renderHeadModels();
}

/* eyes (researched): kemono irises are oversized and glossy, often most of the visible eye; western semi-realistic
   eyes keep the white around a smaller iris; pupils follow the animal: round (canids, bears, big cats), vertical slit
   (house cats, foxes, reptiles), horizontal bar (horses, deer, goats). Prey animals' eyes sit more to the side. */
const PUPILS = {redonda: [0, .42, .42], rendija: [1, .12, .85], horizontal: [2, .8, .28]};
const IRIS = {humano: .5, real: .62, toon: .78, kemono: 1.0};
function eyeSetup(m, P) {
  const nV = FIG.meta.nV;
  if (!m.geo.attributes.aEye) m.geo.setAttribute('aEye', new THREE.BufferAttribute(new Float32Array(nV * 4), 4));
  const A = m.geo.attributes.aEye.array, r = HEAD_RECIPES[m.body.species], style = r ? (m.body.headStyle || 'real') : 'humano';
  const cen = {1: [0, 0, 0, 0], [-1]: [0, 0, 0, 0]};
  for (let i = 0; i < nV; i++) if (FIG.eye[i]) { const s = P[i * 3] > 0 ? 1 : -1, c = cen[s]; c[0] += P[i * 3]; c[1] += P[i * 3 + 1]; c[2] += P[i * 3 + 2]; c[3]++; }
  const side = r && r.side ? 28 * DEG : 6 * DEG;
  for (let i = 0; i < nV; i++) {
    if (!FIG.eye[i]) { A[i * 4 + 3] = 0; continue; }
    const s = P[i * 3] > 0 ? 1 : -1, c = cen[s], n = c[3] || 1;
    let dx = P[i * 3] - c[0] / n, dy = P[i * 3 + 1] - c[1] / n, dz = P[i * 3 + 2] - c[2] / n; const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    // eye frame: forward turned outward by the species' eye angle
    const fx = s * Math.sin(side), fz = Math.cos(side), rx = fz, rz = -fx * 1;
    A[i * 4] = dx * rx * s + dz * rz * s; A[i * 4 + 1] = dy; A[i * 4 + 2] = dx * fx + dz * fz; A[i * 4 + 3] = 1;
  }
  m.geo.attributes.aEye.needsUpdate = true;
  const U = m.lib.uEye; if (!U) return;
  const lvl = m.body.kemo ?? 5, pup = r ? PUPILS[style === 'kemono' && r.pupil === 'rendija' ? 'redonda' : r.pupil] : PUPILS.redonda;
  U.uIris.value = IRIS[style]; U.uShine.value = style === 'kemono' || style === 'toon' ? 1 : 0;
  U.uPupil.value.set(pup[0], pup[1] * (style === 'kemono' ? 1.15 : 1), pup[2]);
}

/* ---------- animal legs (researched) ----------
   Digitigrade animals (canids, rabbits, most anthro dragons) stand on their toes: the heel is lifted into a
   "hock" and the long metatarsus reads as a backwards knee. Ungulates (goats) stand on the tip of the toe, a hoof.
   Hind-limb ratios from comparative anatomy: metatarsus ≈ 0.45 × femur in wolves and dogs (Garland & Janis 1993),
   ≈ 0.6 × femur in goats (tibia 1.14 × femur, metatarsus 0.53 × tibia); rabbits have a long, fully furred foot
   without pads. The human foot here is a single bone (the ankle), so the rest geometry is remodelled: the heel
   rises along the metatarsus, the toes stay flat on the ground as the paw, and the ankle joint becomes the hock. */
const ANIMAL_LEGS = {
  lobo:   {type: 'digi', mt: .52, th: 30, hock: .4, knee: .14, toe: .85, claws: .022, hand: .014},
  perro:  {type: 'digi', mt: .5, th: 28, hock: .38, knee: .14, toe: .85, claws: .02, hand: .012},
  zorro:  {type: 'digi', mt: .54, th: 30, hock: .4, knee: .14, toe: .8, claws: .018, hand: .012},
  gato:   {type: 'digi', mt: .5, th: 28, hock: .38, knee: .14, toe: .78, claws: .012, hand: .01},
  conejo: {type: 'digi', mt: .5, th: 30, hock: .36, knee: .12, toe: 1.65, claws: 0, hand: 0},
  cabra:  {type: 'ungu', mt: .62, th: 14, hock: .32, knee: .12, toe: .32, hoof: true, claws: 0, hand: 0},
  dragon: {type: 'digi', mt: .48, th: 28, hock: .38, knee: .14, toe: .95, claws: .034, hand: .026}
};
const legSpec = b => b && b.species !== 'humano' && b.feet !== 'humano' ? ANIMAL_LEGS[b.species] || null : null;
const animalFeet = m => !!legSpec(m && m.body);
function remodelLegs(b, P, J, H) {
  const L = legSpec(b); if (!L) return null;
  const sst = (a, c, x) => { const t = clamp((x - a) / (c - a), 0, 1); return t * t * (3 - 2 * t); };
  const res = {};
  for (const s of ['L', 'R']) {
    const ai = FIG.jIdx['ankle' + s], jv = i => new V3(J[i * 3], J[i * 3 + 1], J[i * 3 + 2]);
    // zig-zag of the hind leg: knee a little forward, hock well back (the shin slopes back to the hock)
    {
      const hi = FIG.jIdx['hip' + s], ki = FIG.jIdx['knee' + s], Hy = J[hi * 3 + 1], Ky = J[ki * 3 + 1], Ay = J[ai * 3 + 1];
      const fwd = (L.knee ?? .12) * (Hy - Ky), back = (L.hock ?? .3) * (Ky - Ay);
      const dz = y => fwd * clamp((Hy - y) / (Hy - Ky), 0, 1) - back * clamp((Ky - y) / (Ky - Ay), 0, 1);
      const legW = (si, sw, i) => { let w = 0; for (let k = 0; k < 4; k++) { const b = si[i * 4 + k]; if (b === hi || b === ki || b === ai) w += sw[i * 4 + k] / 255; } return w; };
      const shear = (Q, cnt, si, sw) => { for (let i = 0; i < cnt; i++) { const w = legW(si, sw, i); if (w > .01) Q[i * 3 + 2] += dz(Q[i * 3 + 1]) * w; } };
      shear(P, FIG.meta.nV, FIG.si, FIG.sw); if (H) shear(H, FIG.nH, FIG.hsi, FIG.hsw);
      for (const j of [ki, ai, FIG.jIdx['toe' + s]]) if (j !== undefined) J[j * 3 + 2] += dz(J[j * 3 + 1]);
    }
    const A = jv(ai), femur = jv(FIG.jIdx['hip' + s]).distanceTo(jv(FIG.jIdx['knee' + s]));
    const wA = (si, sw, i) => { let w = 0; for (let k = 0; k < 4; k++) if (si[i * 4 + k] === ai) w += sw[i * 4 + k] / 255; return w; };
    let soleY = Infinity, fmin = Infinity, fmax = -Infinity;
    for (let i = 0, nV = FIG.meta.nV; i < nV; i++) if (P[i * 3 + 1] < A.y && wA(FIG.si, FIG.sw, i) > .5) {
      soleY = Math.min(soleY, P[i * 3 + 1]); fmin = Math.min(fmin, P[i * 3 + 2]); fmax = Math.max(fmax, P[i * 3 + 2]);
    }
    if (!isFinite(soleY)) continue;
    const fb = fmin + .68 * (fmax - fmin), hMid = (A.y - soleY) * .55, Lmt = L.mt * femur, th = L.th * DEG;
    const u = new V3(0, -Math.cos(th), Math.sin(th)), n = new V3(0, Math.sin(th), Math.cos(th)), B = A.clone().addScaledVector(u, Lmt);
    const map = (x, y, z, o) => {
      const sp = (z - fmin) / (fb - fmin), h = y - soleY;
      const my = A.y + u.y * sp * Lmt + n.y * (h - hMid), mz = A.z + u.z * sp * Lmt + n.z * (h - hMid);
      const ty = B.y + (h - hMid), tz = B.z + (z - fb) * L.toe;
      const w = sst(.8, 1.2, sp); o[0] = x; o[1] = my + (ty - my) * w; o[2] = mz + (tz - mz) * w;
    };
    const o = [0, 0, 0];
    const apply = (Q, cnt, si, sw) => {
      for (let i = 0; i < cnt; i++) {
        const y = Q[i * 3 + 1], g = wA(si, sw, i) * sst(A.y + .035, A.y - .005, y); if (g < .01) continue;
        map(Q[i * 3], y, Q[i * 3 + 2], o);
        Q[i * 3] += (o[0] - Q[i * 3]) * g; Q[i * 3 + 1] += (o[1] - y) * g; Q[i * 3 + 2] += (o[2] - Q[i * 3 + 2]) * g;
      }
    };
    apply(P, FIG.meta.nV, FIG.si, FIG.sw);
    if (H) apply(H, FIG.nH, FIG.hsi, FIG.hsw);
    const ti = FIG.jIdx['toe' + s];
    if (ti !== undefined) { map(J[ti * 3], J[ti * 3 + 1], J[ti * 3 + 2], o); J[ti * 3] = o[0]; J[ti * 3 + 1] = o[1]; J[ti * 3 + 2] = o[2]; }
    res[s] = {B, u, n};
  }
  return res;
}
// claws on fingers and paws, hooves on goats: rigid on the finger tips and the ankles (accessory skeleton)
function pawGeos(m, P) {
  const L = legSpec(m.body), out = []; if (!L) return out;
  const sz = m.size, jp = n => new V3(m.J[FIG.jIdx[n] * 3], m.J[FIG.jIdx[n] * 3 + 1], m.J[FIG.jIdx[n] * 3 + 2]);
  const ACC = n => m.accBones.indexOf(m.bones[FIG.jIdx[n]]);
  const claw = (origin, axis, len, r, bone) => loft({origin, axis, side: new V3(1, 0, 0), secs: [[-r * .5, r * .9, r * .75], [0, r, r * .8], [len * .5, r * .65, r * .55], [len, .0015, .0015]], radial: 8, sub: 2, bend: -.35, weights: () => [[bone, 1]]});
  for (const s of ['L', 'R']) {
    const ai = FIG.jIdx['ankle' + s], A = jp('ankle' + s);
    // paw extent from the remodelled geometry (front of the toes, width, sole)
    let zmax = -Infinity, sole = Infinity;
    for (let i = 0, nV = FIG.meta.nV; i < nV; i++) if (m.dom[i] === ai && P[i * 3 + 1] < A.y) { zmax = Math.max(zmax, P[i * 3 + 2]); sole = Math.min(sole, P[i * 3 + 1]); }
    if (!isFinite(zmax)) continue;
    let x0 = Infinity, x1 = -Infinity, ytop = -Infinity;
    for (let i = 0, nV = FIG.meta.nV; i < nV; i++) if (m.dom[i] === ai && P[i * 3 + 2] > zmax - .05 * sz && P[i * 3 + 1] < sole + .06 * sz) { x0 = Math.min(x0, P[i * 3]); x1 = Math.max(x1, P[i * 3]); ytop = Math.max(ytop, P[i * 3 + 1]); }
    const bone = ACC('ankle' + s);
    if (L.hoof) {
      // cloven hoof: two keratin wedges under the front of the foot
      const cx = (x0 + x1) / 2, hw = clamp((x1 - x0) * .28, .01, .025 * sz), hz = zmax - hw * 1.4, hh = .045 * sz;
      for (const k of [-1, 1]) out.push(loft({origin: new V3(cx + k * hw * .95, sole - .002, hz), axis: new V3(0, 1, -.15), side: new V3(1, 0, 0),
        secs: [[0, hw, hw * 1.7], [hh * .55, hw * .95, hw * 1.45], [hh, hw * .8, hw * 1.1], [hh * 1.05, hw * .5, hw * .6]], radial: 12, sub: 2, n: 3, weights: () => [[bone, 1]]}));
    } else if (L.claws) {
      for (const f of [.15, .38, .62, .85]) out.push(claw(new V3(x0 + (x1 - x0) * f, sole + (ytop - sole) * .45, zmax - .006 * sz), new V3(0, -.35, 1), L.claws * sz, L.claws * .28 * sz, bone));
    }
    if (L.hand) for (let f = 1; f < 5; f++) {
      const tip = jp(`tip${s}${f}`), last = jp(`f${s}${f}2`), dir = tip.clone().sub(last).normalize();
      out.push(claw(tip.clone().addScaledVector(dir, -.004 * sz), dir, L.hand * sz, L.hand * .3 * sz, ACC(`f${s}${f}2`)));
    }
  }
  return out;
}
