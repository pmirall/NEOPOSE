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
  caballo:{face: [['x2952f', 1.45]],             ears: [['x2952e', 1]],                                          pupil: 'horizontal', mouth: 'herbivoro', side: 1},
  cabra:  {face: [['x2952f', .6]],            ears: [['x2952e', 1]],                                          pupil: 'horizontal', mouth: 'herbivoro', side: 1},
  ciervo: {face: [['x2952f', .8]],            ears: [['x2952e', 1]],                                          pupil: 'horizontal', mouth: 'herbivoro', side: 1},
  dragon: {face: [['x2931', 1]],              ears: [],                                                        pupil: 'rendija', mouth: 'reptil'}
};
const HEAD_STYLES = {real: 'Occidental realista', toon: 'Occidental toony', kemono: 'Kemono'};
const KEMO_LEVEL = {1: 'Kemonomimi (cara humana)', 2: 'Hocico muy corto', 3: 'Hocico corto', 4: 'Hocico medio', 5: 'Hocico completo'};
const HEAD_CREDITS = 'Cabezas y orejas: targets de JALdMIC (CC-BY) y titleknown (CC0), comunidad MakeHuman.';
// morph weights for a body: species head at its style and kemo level
function speciesMorphs(b) {
  const r = HEAD_RECIPES[headSp(b)]; if (!r) return {};
  const style = b.headStyle || 'real', lvl = clamp(Math.round(b.kemo ?? (style === 'kemono' ? 3 : 5)), 1, 5);
  const k = b.snout != null ? clamp((b.snout - .3) / .7, 0, 1) : [0, 0, .3, .55, .8, 1][lvl];
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
  const r = HEAD_RECIPES[headSp(m.body)];
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
    if (!/^x\d+e$/.test(name) && !(HEAD_RECIPES[headSp(m.body)].ears || []).some(([n]) => n === name)) continue;
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

/* expressions: jaw opening, ear pose and tail (degrees). back = ears laid back, out = ears turned/drooping to the side;
   tail = [lift from its natural carriage, curl of the tip]. Researched body language shared by dogs, cats and most
   furry art: tail up and loose when content, high and stiff when alert or angry, low when sad, tucked under in fear,
   a question-mark curl when curious; ears forward when alert, flat back in fear or anger, drooping to the side when sad. */
const ANTHRO_EXPR = {
  neutra:   {label: 'Neutra',     jaw: 0,  back: 0,   out: 0,   twist: 0,   tail: [0, 0]},
  alerta:   {label: 'Alerta',     jaw: 0,  back: -12, out: -8,  twist: -10, tail: [24, -4]},
  feliz:    {label: 'Contenta',   jaw: 14, back: 8,   out: 6,   twist: 0,   tail: [30, 12]},
  jadeo:    {label: 'Jadeando',   jaw: 22, back: 14,  out: 12,  twist: 0,   tail: [12, 6]},
  enfado:   {label: 'Gruñido',    jaw: 10, back: 55,  out: 20,  twist: 25,  tail: [36, -14]},
  miedo:    {label: 'Miedo',      jaw: 6,  back: 70,  out: 35,  twist: 10,  tail: [-62, -30]},
  triste:   {label: 'Triste',     jaw: 0,  back: 25,  out: 60,  twist: -10, tail: [-34, -6]},
  sorpresa: {label: 'Sorpresa',   jaw: 18, back: -15, out: -5,  twist: -15, tail: [32, -10]},
  aullido:  {label: 'Aullido',    jaw: 30, back: 30,  out: 5,   twist: 0,   tail: [-12, 0]},
  rugido:   {label: 'Rugido',     jaw: 38, back: 45,  out: 25,  twist: 20,  tail: [20, -12]},
  curiosa:  {label: 'Curiosa',    jaw: 4,  back: -8,  out: 0,   twist: -25, tilt: 1, tail: [22, 38]},
  timida:   {label: 'Tímida',     jaw: 0,  back: 30,  out: 30,  twist: 5,   tail: [-30, 24]}
};
// the joints an expression turns (Euler angles in radians), so a script can bake them into its keys
function exprJoints(m, id) {
  const e = ANTHRO_EXPR[id]; if (!e) return null;
  const out = {jaw: [e.jaw * DEG, 0, 0]};
  for (const [k, sd] of [['L', 1], ['R', -1]]) { const o = e.out * (e.tilt && sd < 0 ? .3 : 1); out['ear' + k] = [-e.back * DEG, sd * e.twist * DEG, -sd * o * DEG]; }
  if (m.hasTail && e.tail) ['tail1', 'tail2', 'tail3'].forEach((n, i) => {
    const r = tailRest(m, n) || [0, 0, 0], lift = e.tail[0] * [.8, .45, .2][i], curl = e.tail[1] * [0, .35, .65][i];
    out[n] = [(r[0] + lift + curl) * DEG, r[1] * DEG, r[2] * DEG];
  });
  return out;
}
function applyExpression(m, id) {
  const J = exprJoints(m, id); if (!J || !m.joints) return;
  for (const [n, r] of Object.entries(J)) m.joints[n].rotation.set(r[0], r[1], r[2]);
  // the head tilts a little with curiosity
  if (ANTHRO_EXPR[id].tilt) m.joints.head.rotation.z = 9 * DEG;
  m.aexpr = id;
}
// a human face's expression as an anthro's body language (the script and the practice use human names)
const ANTHRO_OF = {sonrisa: 'feliz', risa: 'feliz', guino: 'feliz', triste: 'triste', enfado: 'enfado', asco: 'enfado', sorpresa: 'sorpresa', miedo: 'miedo', grito: 'rugido', concentrado: 'alerta', morros: 'curiosa', dormido: 'neutra', neutra: 'neutra'};
// the face: humans get MakeHuman's facial expressions (stored in the body, with an intensity);
// anthro characters keep the jaw-and-ears expressions of their sculpted heads
let exprAmtEl = null, exprFor = null;
// humans: a face baked into the body (with its intensity); anthros: jaw, ears and tail turned at once
function pickExpression(id) {
  if (mq.body.species === 'humano' && !mq.avatar) { mq.body.expr = id === 'neutra' ? undefined : id; if (mq.body.exprAmt === undefined) mq.body.exprAmt = 1; rebuildActive(true); syncExprUI(); pushHistory(); return; }
  applyExpression(mq, id); syncExprUI(); syncJointSliders(); pushHistory(); tourEvent('expr');
}
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
    chips($('#exprChips'), Object.entries(human ? FACE_EXPR : ANTHRO_EXPR).map(([k, v]) => [k, v.label]), human ? mq.body.expr || 'neutra' : null, pickExpression);
  }
  setPressed($('#exprChips'), human ? mq.body.expr || 'neutra' : mq.aexpr || '');
  $('#exprAmtBox').hidden = !human || !mq.body.expr;
  if (typeof crSyncExpr === 'function') crSyncExpr();
  exprAmtEl.set(mq.body.exprAmt ?? 1);
  $('#exprNote').textContent = tr(human ? 'Cejas, ojos y boca de MakeHuman. Para abrir más la boca, toca la mandíbula y gírala.'
    : 'Boca, orejas y cola a la vez, con el lenguaje corporal de los animales. También puedes tocar la mandíbula, una oreja o la cola para girarlas a mano.');
}

// the body as the skeleton stretch sees it: kemono heads are larger, rounder craniums
// body proportions by style: kemono bigger, rounder head and slightly shorter legs; western toony a little bigger head
const effBody = b => {
  if (!HEAD_RECIPES[headSp(b)]) return b;
  const L = legSpec(b); if (L && L.type !== 'planti') b = {...b, legs: (b.legs ?? 1) * (L.type === 'ungu' ? .84 : .85)};
  if (b.headStyle === 'kemono') return {...b, head: (b.head ?? 1) * 1.12, legs: (b.legs ?? 1) * .96};
  if (b.headStyle === 'toon') return {...b, head: (b.head ?? 1) * 1.05};
  return b;
};
const headSl = {};
function buildHeadUI() {
  const box = $('#headStyle'); if (!box) return;
  chips($('#feetChips'), [['animal', 'Del animal'], ['humano', 'Humanas']], mq.body.feet || 'animal', v => { mq.body.feet = v === 'animal' ? undefined : v; rebuildActive(true); syncHeadUI(); pushHistory(); });
  // the kemo scale (獣度): from a short, soft muzzle (kemono) to the animal's full snout
  headSl.snout = slider($('#snoutBox'), {id: 'snoutSl', label: 'Hocico', min: .45, max: 1, step: .01, value: 1, def: 1, fmt: v => v > .985 ? tr('Completo') : pctFmt(v),
    input: v => { mq.body.snout = v > .985 ? undefined : v; rebuildActive(); }, change: pushHistory});
  chips($('#handsChips'), [['animal', 'Zarpas'], ['humanas', 'Humanas']], 'animal', v => { mq.body.paws = v === 'animal' ? undefined : v; rebuildActive(true); syncHeadUI(); pushHistory(); });
  $('#padsChk').onchange = e => { mq.body.pads = e.target.checked; rebuildActive(true); pushHistory(); };
  chips($('#tailChips'), TAIL_SHAPES, '', v => { mq.body.tail = {...(mq.body.tail || {}), shape: v === (SPECIES[mq.body.species].tail || {}).shape ? undefined : v}; rebuildActive(true); syncHeadUI(); pushHistory(); tourEvent('tail'); });
  chips($('#tailMoveChips'), [['quieta', 'Quieta'], ['viva', 'Viva'], ['meneo', 'Meneo'], ['rapido', 'Meneo rápido']], 'viva', v => { mq.body.tailMove = v === 'viva' ? undefined : v; if (ANIM.open) setFrame(ANIM.f); pushHistory(); });
  headSl.tlen = slider($('#tailLenBox'), {id: 'tailLen', label: 'Largo de la cola', min: .3, max: 2, step: .01, value: 1, def: 1, fmt: pctFmt,
    input: v => { mq.body.tail = {...(mq.body.tail || {}), len: v}; rebuildActive(); }, change: () => { pushHistory(); tourEvent('tail'); }});
  headSl.tr = slider($('#tailThickBox'), {id: 'tailThick', label: 'Grosor de la cola', min: .4, max: 2, step: .01, value: 1, def: 1, fmt: pctFmt,
    input: v => { mq.body.tail = {...(mq.body.tail || {}), r: v}; rebuildActive(); }, change: pushHistory});
  syncHeadUI();
}
// sculpted head choices for this species (plus the MakeHuman target head)
function renderHeadModels() {
  const box = $('#headModelChips'); if (!box) return;
  // the species' own heads first, then every other one (a hybrid: a fox's head on a wolf, a dragon's on a cat…)
  const own = (SPECIES[mq.body.species] || {}).head || mq.body.species, all = Object.entries(HEAD_CATALOG), mine = all.filter(([, c]) => c.species.includes(own)), other = all.filter(([, c]) => !c.species.includes(own));
  const id = headModelFor(mq.body), c = id && HEAD_CATALOG[id];
  // a species without a sculpt of its own (tiger, lion, bear, horse, deer) has its MakeHuman head as the first choice
  const recipe = !mine.length && HEAD_RECIPES[own], first = recipe ? [['', SPECIES[mq.body.species].label]] : [];
  chips(box, [...first, ...[...mine, ...other].map(([k, c]) => [k, c.label])], id || '', v => {
    if (!v || (mine.length && v === mine[0][0])) { delete mq.body.headModel; delete mq.body.headStyle; } else { mq.body.headModel = v; mq.body.headStyle = HEAD_CATALOG[v].style; }
    rebuildActive(true); syncHeadUI(); pushHistory();
  });
  if (other.length) { const sep = document.createElement('span'); sep.className = 'famlbl'; sep.textContent = tr('Híbrido: la cabeza de otra especie'); box.insertBefore(sep, box.children[first.length + mine.length]); }
  box.parentElement.hidden = !all.length;
  const cr = $('#headCredit'); cr.innerHTML = '';
  if (c) { cr.append(tr('Cabeza: «{x}» de {a} (CC-BY), ', {x: c.label.replace(/ \(.*\)$/, ''), a: c.author})); const a = document.createElement('a'); a.href = c.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Sketchfab'; cr.append(a, '.'); }
  else cr.textContent = tr(HEAD_CREDITS);
}
function syncHeadUI() {
  const box = $('#headStyle'); if (!box) return;
  const on = !!HEAD_RECIPES[headSp(mq.body)]; box.hidden = !on;
  setPressed($('#feetChips'), mq.body.feet || 'animal');
  const L = ANIMAL_LEGS[legSp(mq.body)];
  $('#feetNote').textContent = L ? tr(L.type === 'ungu' ? 'Del animal: patas ungulígradas, apoyadas en la pezuña, con el corvejón alto.' : L.type === 'planti' ? 'Del animal: patas plantígradas, apoyadas en toda la planta, como las de un oso.' : 'Del animal: patas digitígradas, apoyadas en los dedos; el tobillo es el corvejón que dobla hacia atrás.') : '';
  $('#padsRow').hidden = !(L && !L.hoof); $('#padsChk').checked = padsOn(mq.body);
  // the hands' name follows the animal: paws, hoof-hands or claws
  const hk = L ? (L.type === 'ungu' ? 'Pezuñas' : legSp(mq.body) === 'dragon' ? 'Garras' : 'Zarpas') : 'Zarpas';
  $('#handsRow').hidden = !L; const hb = $('#handsChips .chip[data-v="animal"]'); if (hb) hb.textContent = tr(hk); setPressed($('#handsChips'), mq.body.paws || 'animal');
  const t = SPECIES[mq.body.species] && SPECIES[mq.body.species].tail, own = mq.body.tail || {};
  $('#tailUI').hidden = !t; if (t) { setPressed($('#tailChips'), own.shape || t.shape); headSl.tlen.set(own.len ?? 1); headSl.tr.set(own.r ?? 1); setPressed($('#tailMoveChips'), mq.body.tailMove || 'viva'); $('#tailLenBox').hidden = $('#tailThickBox').hidden = own.shape === 'no'; }
  $('#snoutBox').hidden = !headModelFor(mq.body) && !HEAD_RECIPES[headSp(mq.body)]; headSl.snout.set(mq.body.snout ?? 1);
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
  const A = m.geo.attributes.aEye.array, r = HEAD_RECIPES[headSp(m.body)], style = r ? (m.body.headStyle || 'real') : 'humano';
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
   Digitigrade animals (canids, felids, rabbits, most anthro dragons) stand on their toes: the heel is lifted into a
   "hock" and the long metatarsus reads as a backwards knee. Ungulates stand on the tip of the toe, a hoof.
   Hind-limb ratios from comparative anatomy: metatarsus ≈ 0.45 × femur in wolves and dogs (Garland & Janis 1993),
   ≈ 0.6 × femur in goats (tibia 1.14 × femur, metatarsus 0.53 × tibia); rabbits have a long, fully furred foot
   without pads. Anthro construction sheets draw it longer still (the hock near a third of the leg's height), as here.
   The human foot is a single bone (the ankle), so its rest geometry is laid again along the animal's: shaped in its
   own frame and turned down about the ankle the way a joint bends (so shin and hock stay one skin), then its forefoot
   swept, section by section, into the paw:
   - the heel becomes the point of the hock: the calcaneus, behind the joint and in line with the metatarsus, the lever
     the Achilles tendon pulls on, so the back of the leg runs taut from the calf to it;
   - the rest of the sole becomes the back of a slim metatarsus, narrower than the joints at both of its ends;
   - the ball goes on into the ground, which flattens it into the sole (the big pad under it), the human toes drawn
     in inside its end; the animal's toes (rigid parts on the ankle, see footGeos) make the paw's top;
   - ungulates: the metatarsus is the cannon bone and its end the fetlock; the pastern then slopes forward at ~55°
     into the hoof (horse: one toe; goats and deer: two, the cloven hoof);
   - bears are plantigrade: the human sole stays on the ground, broader, ending in a low dome behind five toes. */
const ANIMAL_LEGS = {
  lobo:   {type: 'digi', mt: .82, th: 20, hock: .4, knee: .14, paw: 'can', hand: .014},
  perro:  {type: 'digi', mt: .78, th: 20, hock: .38, knee: .14, paw: 'can', hand: .012},
  zorro:  {type: 'digi', mt: .84, th: 20, hock: .4, knee: .14, paw: 'can', pw: .9, hand: .012},
  gato:   {type: 'digi', mt: .76, th: 18, hock: .38, knee: .14, paw: 'fel', hand: .01},
  conejo: {type: 'digi', mt: .62, th: 50, hock: .3, knee: .12, paw: 'lep', hand: 0},
  cabra:  {type: 'ungu', mt: .64, th: 10, hock: .32, knee: .12, hoof: true, hand: 0},
  dragon: {type: 'digi', mt: .74, th: 22, hock: .38, knee: .14, paw: 'rep', hand: .026},
  tigre:  {type: 'digi', mt: .72, th: 18, hock: .38, knee: .14, paw: 'fel', pw: 1.12, hand: .016},
  leon:   {type: 'digi', mt: .72, th: 18, hock: .38, knee: .14, paw: 'fel', pw: 1.12, hand: .016},
  // bears walk on the whole sole (plantigrade): the human leg stays, with a bear's broad foot and heavy claws
  oso:    {type: 'planti', paw: 'urs', hand: .024},
  // horses stand on one toe (a single hoof), deer on two like goats; both with a long cannon bone
  caballo:{type: 'ungu', mt: .72, th: 8, hock: .32, knee: .12, hoof: 'single', hand: 0},
  ciervo: {type: 'ungu', mt: .7, th: 10, hock: .32, knee: .12, hoof: true, hand: 0}
};
const legSpec = b => b && b.species !== 'humano' && b.feet !== 'humano' ? ANIMAL_LEGS[legSp(b)] || null : null;
const animalFeet = m => !!legSpec(m && m.body);
// pads: on every paw that has beans by default; never on hooves (rabbits' feet are furred, so off for them)
const padsOn = b => { const L = legSpec(b) || ANIMAL_LEGS[legSp(b)]; return b && b.species !== 'humano' && (b.pads ?? !!(L && !L.hoof && pawOf(L).bean)); };
/* Paws by kind, sizes in paw widths W (w femur lengths). From the vets' and artists' sheets: canids have four toes in an
   arc, the middle two longest, oval beans and a trilobed metatarsal pad with its point to the toes, short blunt claws
   that reach the ground; felids a rounder, compact paw, round beans and the claws kept in their sheaths; bears five
   toes in a flatter arc, a whole sole pad and long, little curved claws; dragons three long toes and a dewclaw, with
   talons; rabbits a long, narrow foot, the toes close together under the fur, no pads or claws to see.
   x: centre of the outer toe across; reach: tips of the outer and middle toes ahead of the knuckles; tw, tt: toe half width
   and height; claw: length, base half height, curl; bean and pad: half width and length; mitt: ball to knuckles; slim:
   how much the metatarsus is slimmed (a rabbit's long foot keeps its thickness) */
const PAWS = {
  can: {w: .36, n: 4, x: .36, reach: [.18, .27], tw: .145, tt: .15, claw: [.115, .058, -.75], bean: [.075, .11], pad: [.24, .19], mitt: .33},
  fel: {w: .37, n: 4, x: .37, reach: [.14, .21], tw: .145, tt: .155, claw: [.07, .035, -.9], bean: [.095, .1], pad: [.25, .18], mitt: .3},
  urs: {w: .4, n: 5, x: .4, reach: [.2, .3], tw: .1, tt: .11, claw: [.2, .06, -.4], bean: [.085, .065], pad: [.34, .5], mitt: .1},
  rep: {w: .36, n: 3, x: .3, reach: [.5, .64], tw: .115, tt: .16, claw: [.26, .065, -.9], bean: [.07, .1], pad: [.2, .16], mitt: .24, dew: 1, knuckles: 1},
  lep: {w: .32, n: 4, x: .25, reach: [.36, .44], tw: .115, tt: .15, claw: 0, bean: 0, pad: 0, mitt: .2, slim: .15},
  hoof: {w: .25}
};
const pawOf = L => PAWS[L.hoof ? 'hoof' : L.paw] || PAWS.can;
// the paw's frame in the rest pose, read from the joints, so footGeos builds on the paw remodelLegs laid: the toe point T
// sits over the toes, .1 W above the ground, (mitt + .2) W ahead of the ball B; ungulates: the coronet C over it, the
// fetlock B up the pastern p. Paw width W, femur F, ground g
const PASTERN = 55 * DEG;
function pawFrame(L, J, s) {
  const jv = n => new V3(J[FIG.jIdx[n] * 3], J[FIG.jIdx[n] * 3 + 1], J[FIG.jIdx[n] * 3 + 2]), K = pawOf(L);
  const F = jv('hip' + s).distanceTo(jv('knee' + s)), W = K.w * (L.pw || 1) * F, T = jv('toe' + s), g = T.y - .1 * W, fr = {F, W, K, T, g};
  if (L.type === 'ungu') { fr.p = new V3(0, -Math.sin(PASTERN), Math.cos(PASTERN)); fr.C = new V3(T.x, g + .2 * F, T.z); fr.B = fr.C.clone().addScaledVector(fr.p, -.2 * F); }
  else fr.B = new V3(T.x, g, T.z - (K.mitt + .2) * W);
  return fr;
}
// the height where clothes over an animal leg end, a little under the hock (ankle height Ay, ground g)
const hemY = (Ay, g) => Ay - .2 * (Ay - g);
// what clothes hide on a human foot shows under their hem on an animal leg (the garment's helpers end there)
function pawsUnderHem(m, Hd) {
  const L = legSpec(m.body); if (!L || L.type === 'planti' || !m.anchors) return;
  const P = m.anchors;
  for (const s of ['L', 'R']) { const ai = FIG.jIdx['ankle' + s], hy = hemY(m.J[ai * 3 + 1], 0) - .004; for (let i = 0; i < FIG.meta.nV; i++) if (m.dom[i] === ai && P[i * 3 + 1] < hy) Hd[i] = 0; }
}
// the neighbours of each vertex the ankle carries (the mesh's topology never changes: worked out once)
function footNb(ai) {
  const key = 'nb' + ai; if (FIG[key]) return FIG[key];
  const nV = FIG.meta.nV, I = FIG.index, on = new Uint8Array(nV), sets = new Map();
  for (let i = 0; i < nV; i++) for (let k = 0; k < 4; k++) if (FIG.si[i * 4 + k] === ai && FIG.sw[i * 4 + k]) on[i] = 1;
  const link = (a, b) => { if (on[a]) { if (!sets.has(a)) sets.set(a, new Set()); sets.get(a).add(b); } };
  for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const a = I[t + e], b = I[t + (e + 1) % 3]; link(a, b); link(b, a); }
  const ids = [...sets.keys()], off = new Int32Array(ids.length + 1), nb = [];
  ids.forEach((i, j) => { nb.push(...sets.get(i)); off[j + 1] = nb.length; });
  // the clothes' helper points the ankle carries, each with the nearest of these skin vertices (in the base mesh)
  const hv = [], hn = [], B = FIG.base, HB = FIG.hbase;
  for (let h = 0; h < FIG.nH; h++) { let w = 0; for (let k = 0; k < 4; k++) if (FIG.hsi[h * 4 + k] === ai) w += FIG.hsw[h * 4 + k]; if (!w) continue;
    let best = 0, bd = Infinity; ids.forEach((i, j) => { const d = (B[i * 3] - HB[h * 3]) ** 2 + (B[i * 3 + 1] - HB[h * 3 + 1]) ** 2 + (B[i * 3 + 2] - HB[h * 3 + 2]) ** 2; if (d < bd) { bd = d; best = j; } });
    hv.push(h); hn.push(best); }
  return (FIG[key] = {ids, nb: Int32Array.from(nb), off, hv: Int32Array.from(hv), hn: Int32Array.from(hn)});
}
function remodelLegs(b, P, J, H) {
  const L = legSpec(b); if (!L) return;
  for (const s of ['L', 'R']) {
    const ai = FIG.jIdx['ankle' + s], hi = FIG.jIdx['hip' + s], ki = FIG.jIdx['knee' + s], jv = i => new V3(J[i * 3], J[i * 3 + 1], J[i * 3 + 2]);
    // zig-zag of the hind leg: knee a little forward, hock well back (the shin slopes back to the hock)
    if (L.type !== 'planti') {
      const Hy = J[hi * 3 + 1], Ky = J[ki * 3 + 1], Ay = J[ai * 3 + 1];
      const fwd = (L.knee ?? .12) * (Hy - Ky), back = (L.hock ?? .3) * (Ky - Ay);
      const dz = y => fwd * clamp((Hy - y) / (Hy - Ky), 0, 1) - back * clamp((Ky - y) / (Ky - Ay), 0, 1);
      const legW = (si, sw, i) => { let w = 0; for (let k = 0; k < 4; k++) { const b = si[i * 4 + k]; if (b === hi || b === ki || b === ai) w += sw[i * 4 + k] / 255; } return w; };
      const shear = (Q, cnt, si, sw) => { for (let i = 0; i < cnt; i++) { const w = legW(si, sw, i); if (w > .01) Q[i * 3 + 2] += dz(Q[i * 3 + 1]) * w; } };
      shear(P, FIG.meta.nV, FIG.si, FIG.sw); if (H) shear(H, FIG.nH, FIG.hsi, FIG.hsw);
      for (const j of [ki, ai]) J[j * 3 + 2] += dz(J[j * 3 + 1]);
    }
    const A = jv(ai), F = jv(hi).distanceTo(jv(ki)), K = pawOf(L), W = K.w * (L.pw || 1) * F;
    const wA = (si, sw, i) => { let w = 0; for (let k = 0; k < 4; k++) if (si[i * 4 + k] === ai) w += sw[i * 4 + k] / 255; return w; };
    // the human foot: its length and its cross-sections in bands along it (centre, half width, middle, half height)
    let z0 = Infinity, z1 = -Infinity; const foot = [];
    for (let i = 0, nV = FIG.meta.nV; i < nV; i++) if (P[i * 3 + 1] < A.y && wA(FIG.si, FIG.sw, i) > .5) { foot.push(i); z0 = Math.min(z0, P[i * 3 + 2]); z1 = Math.max(z1, P[i * 3 + 2]); }
    if (!foot.length) continue;
    const NB = 24, bx0 = new Float32Array(NB).fill(Infinity), bx1 = new Float32Array(NB).fill(-Infinity), by0 = bx0.slice(), by1 = bx1.slice(), bi = z => clamp(Math.floor((z - z0) / (z1 - z0) * NB), 0, NB - 1);
    for (const i of foot) { const k = bi(P[i * 3 + 2]), x = P[i * 3], y = P[i * 3 + 1]; bx0[k] = Math.min(bx0[k], x); bx1[k] = Math.max(bx1[k], x); by0[k] = Math.min(by0[k], y); by1[k] = Math.max(by1[k], y); }
    for (let k = 1; k < NB; k++) if (!isFinite(bx0[k])) { bx0[k] = bx0[k - 1]; bx1[k] = bx1[k - 1]; by0[k] = by0[k - 1]; by1[k] = by1[k - 1]; }
    const band = z => { const f = clamp((z - z0) / (z1 - z0) * NB - .5, 0, NB - 1), k = Math.min(Math.floor(f), NB - 2), t = f - k, l = a => a[k] + (a[k + 1] - a[k]) * t;
      const x0 = l(bx0), x1 = l(bx1), y0 = l(by0), y1 = l(by1); return [(x0 + x1) / 2, Math.max((x1 - x0) / 2, 1e-3), (y0 + y1) / 2, Math.max((y1 - y0) / 2, 1e-3)]; };
    const gf = Math.min(...foot.map(i => P[i * 3 + 1])), len = z1 - z0, zBall = z0 + .68 * len, zToe = z0 + .8 * len, f = new V3(0, 0, 1), o = [0, 0, 0];
    // 1. the heel and the metatarsus, shaped in the foot's own frame and then turned down about the ankle as a joint
    //    bends (fully below it, fading out up the shin): the heel shortened into the point of the hock, the foot
    //    stretched to the metatarsus' length and slimmed in the middle, its sections brought onto the line from the
    //    ankle to the ball (ungulates: the cannon bone, to the fetlock)
    const th = (L.th || 0) * DEG, rot = L.type === 'planti' ? 0 : Math.PI / 2 - th, ks = L.type === 'planti' ? 1 : L.mt * F / (zBall - A.z);
    const u = new V3(0, -Math.cos(th), Math.sin(th)), n = new V3(0, Math.sin(th), Math.cos(th)), psiU = Math.atan2(u.y, u.z);
    //    The metatarsus is a bone's shaft, as thick at its end as below the hock (the human foot, high at the instep and
    //    thin at the ball, would make it a wedge): just past the joint its sections take a constant size, a little
    //    slimmer down to the ball (Wm, Dm: half width and half depth at q), and the joint itself (the human ankle, as deep
    //    as the foot is high) is brought to Dj, so the hock is a knob and not the top of a cone (a rabbit's furred foot
    //    keeps most of its own shape)
    const dg = rot ? 1 : 0, sl = K.slim ?? 1, Wm = q => W * (.25 - .05 * q), Dm = q => W * (.19 - .06 * q), Dj = .25 * W, hA = band(A.z)[3];
    const shape = (x, y, z, w, out) => {
      const q = clamp((z - A.z) / (zBall - A.z), 0, 1), [bxc, bhw, bym, bhh] = band(clamp(z, z0, zBall)), f = sl * sstep(0, .1, q);
      const kx = dg ? (z < A.z ? 1 - .3 * sstep(A.z, z0, z) : 1 + f * (Wm(q) / bhw - 1)) : 1.1 + .25 * q;
      const ky = dg ? (z < A.z ? (1 - .2 * sstep(A.z, z0, z)) * (1 + sl * (Dj / hA - 1)) : 1 + sl * (Dj + (Dm(q) - Dj) * sstep(0, .1, q)) / bhh - sl) : 1;
      // (the stretch to the metatarsus' length starts past the joint: stretched there, the skin of the ankle's front,
      // half bent, would swing far forward)
      const kz = !dg ? 1 : z < A.z ? .4 : 1 + (ks - 1) * sstep(0, .3, q), rc = dg * (.3 + .7 * sstep(0, .15, q));
      let lx = (bxc - A.x) * (1 - rc) + (x - bxc) * kx, ly = (bym - A.y) * (1 - rc) + (y - bym) * ky, lz = (z - A.z) * kz;
      // a bear's sole is flat on the ground from heel to ball: the human arch is let down, the top of the foot stays
      if (!dg) ly -= (bym - bhh - gf) * clamp(1 - (y - bym + bhh) / (2 * bhh), 0, 1);
      // only what the ankle carries: the shin above keeps its place
      lx = (x - A.x) + (lx - (x - A.x)) * w; ly = (y - A.y) + (ly - (y - A.y)) * w; lz = (z - A.z) + (lz - (z - A.z)) * w;
      const a = rot * w, c = Math.cos(a), sn = Math.sin(a);
      out[0] = A.x + lx; out[1] = A.y + ly * c - lz * sn; out[2] = A.z + ly * sn + lz * c;
    };
    // 2. the forefoot swept into the paw, in the final frame, from the ball's section as step 1 leaves it, the human toes
    //    drawn in at its end. Rows: human z, centre, the section's tilt ψ (0: upright), half width, half depth
    const [bxB, bhB, , bdB] = band(zBall); shape(bxB, band(zBall)[2], zBall, 1, o);
    const Bc = new V3(...o), WB = dg ? bhB + sl * (Wm(1) - bhB) : bhB * 1.35, DB = dg ? bdB + sl * (Dm(1) - bdB) : bdB, psiB = dg * psiU;
    let g, T, KF;
    if (L.type === 'ungu') {
      const p = new V3(0, -Math.sin(PASTERN), Math.cos(PASTERN)), C = Bc.clone().addScaledVector(p, .2 * F), psiP = Math.atan2(p.y, p.z), cw = L.hoof === 'single' ? .085 : .07;
      g = C.y - .2 * F; T = new V3(C.x, g + .1 * W, C.z);
      KF = [[zBall, Bc.x, Bc.y, Bc.z, psiB, WB, DB], [(zBall + zToe) / 2, ...Bc.clone().lerp(C, .5).toArray(), (psiB + psiP) / 2, .075 * F, .07 * F],
        [zToe, ...C.toArray(), psiP, cw * F, .08 * F], [z1, ...C.clone().addScaledVector(p, .025 * F).toArray(), psiP, .045 * F, .04 * F]];
    } else {
      // digitigrade: the metatarsus ends on the big pad and the paw goes on forward from it along the ground, wider than
      // the shaft (the paw flares out of it), low and flat underneath, rising to the knuckles, where the toes take over
      // (a compact paw about as long as it is wide); bears: the human sole stays, broadened, and the forefoot ends in a
      // low dome behind the toes
      const kn = Bc.z + K.mitt * W;
      if (dg) {
        g = Bc.y - DB * Math.cos(psiB) - .02 * W; T = new V3(Bc.x, g + .1 * W, kn + .2 * W);
        KF = [[zBall, Bc.x, Bc.y, Bc.z, psiB, WB, DB], [(zBall + zToe) / 2, Bc.x, g + .17 * W, Bc.z + .45 * K.mitt * W, 0, .46 * W, .17 * W],
          [zToe, Bc.x, g + .12 * W, kn, 0, .42 * W, .12 * W], [z1, Bc.x, g + .1 * W, kn + .07 * W, 0, .24 * W, .08 * W]];
      } else {
        g = gf; T = new V3(Bc.x, g + .1 * W, kn + .2 * W);
        const Dk = .15 * W, Kc = new V3(Bc.x, g + Dk, kn);
        KF = [[zBall, Bc.x, Bc.y, Bc.z, 0, WB, DB], [zToe, ...Kc.toArray(), 0, .48 * W, Dk], [z1, ...Kc.clone().addScaledVector(f, .12 * W).toArray(), 0, .34 * W, .6 * Dk]];
      }
    }
    // the fur of the sole stops a little above the ground where the pads stand on it (a bear's sole pad is a thin slab
    // under the whole sole: just under it). The human toes are not folded into the paw's end, which would crumple it:
    // their vertices go onto the surface of the closing dome, each by its angle about the foot's axis
    const fl = g + (padsOn(b) && L.type !== 'ungu' ? (dg ? .035 : .015) * W : 0), zT = zToe - .06 * len, sweep = (x, y, z, out) => {
      const [bxc, bhw, bym, bhh] = band(clamp(z, zBall, zToe)), r = Math.max(Math.hypot(x - bxc, (y - bym) / bhh * bhw), .2 * bhw) / bhw, k = 1 + sstep(zT, zToe, z) * (1 / r - 1);
      const xn = (x - bxc) / bhw * k, yn = (y - bym) / bhh * k;
      let i = 0; while (i < KF.length - 2 && z > KF[i + 1][0]) i++;
      const t = clamp((z - KF[i][0]) / (KF[i + 1][0] - KF[i][0]), 0, 1), c = k => crInterp(KF, i, t, k), psi = c(4);
      out[0] = c(1) + xn * c(5); out[1] = Math.max(fl, c(2) + yn * c(6) * Math.cos(psi)); out[2] = c(3) - yn * c(6) * Math.sin(psi);
    };
    const apply = (Q, cnt, si, sw, ws) => {
      for (let i = 0; i < cnt; i++) {
        const x = Q[i * 3], y = Q[i * 3 + 1], z = Q[i * 3 + 2], wa = wA(si, sw, i); if (wa < .01) continue;
        const w = wa * sstep(A.y + .06, A.y - .025, y); if (w < .005) continue;
        if (ws) ws[i] = z > zT && y < A.y ? -w : w;
        if (z > zBall && y < A.y) { sweep(x, y, z, o); Q[i * 3] += (o[0] - x) * w; Q[i * 3 + 1] += (o[1] - y) * w; Q[i * 3 + 2] += (o[2] - z) * w; }
        else { shape(x, y, z, w, o); Q[i * 3] = o[0]; Q[i * 3 + 1] = Math.max(o[1], fl); Q[i * 3 + 2] = o[2]; }
      }
    };
    const ws = new Float32Array(FIG.meta.nV); apply(P, FIG.meta.nV, FIG.si, FIG.sw, ws);
    if (H) apply(H, FIG.nH, FIG.hsi, FIG.hsw);
    // the human foot's tendons and bones, drawn out along the metatarsus, would show as long facets: the laid skin is
    // relaxed (Taubin's smoothing, which keeps the volume), the more the more it was moved, and the gathered toes (ws < 0)
    // fully and for longer. The clothes' helper points ride with the skin vertex nearest to them, so trousers follow
    // the laid skin (a hem does not let the point of the hock through)
    const {ids, nb, off, hv, hn} = footNb(ai), tmp = new Float32Array(ids.length * 3), P0 = Float32Array.from(ids.flatMap(i => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]));
    // the shaft: the skin of the ankle's front, half bent with the shin, and the instep's would still bulge in front of
    // it; below the hock knob every section is laid on the shaft's ellipse (Wm across, Dm along n) about the line from
    // the joint to the ball
    if (dg) { const ax = Bc.clone().sub(A), La = ax.length(), e = new V3(); ax.multiplyScalar(1 / La); const nx = new V3(0, ax.z, -ax.y);
      for (const i of ids) { if (!(ws[i] > 0)) continue; e.set(P[i * 3] - A.x, P[i * 3 + 1] - A.y, P[i * 3 + 2] - A.z); const t = e.dot(ax) / La, k = sl * ws[i] * sstep(.07, .2, t) * (1 - sstep(.97, 1.03, t)); if (k < .005) continue;
        const a = e.x, b = e.dot(nx), r = Math.hypot(a / Wm(t), b / Dm(t)) || 1, f = 1 + k * (1 / r - 1);
        P[i * 3] += a * (f - 1); P[i * 3 + 1] += nx.y * b * (f - 1); P[i * 3 + 2] += nx.z * b * (f - 1); } }
    for (let it = 0; it < 24; it++) {
      const k = it % 2 ? -.53 : .5;
      ids.forEach((i, j) => { const kw = k * (ws[i] < 0 ? 1 : it < 8 ? ws[i] : 0); if (!kw) { tmp[j * 3] = P[i * 3]; tmp[j * 3 + 1] = P[i * 3 + 1]; tmp[j * 3 + 2] = P[i * 3 + 2]; return; }
        let ax = 0, ay = 0, az = 0; const a = off[j], c = off[j + 1]; for (let q = a; q < c; q++) { const v = nb[q]; ax += P[v * 3]; ay += P[v * 3 + 1]; az += P[v * 3 + 2]; }
        const cnt = c - a || 1; tmp[j * 3] = P[i * 3] + (ax / cnt - P[i * 3]) * kw; tmp[j * 3 + 1] = P[i * 3 + 1] + (ay / cnt - P[i * 3 + 1]) * kw; tmp[j * 3 + 2] = P[i * 3 + 2] + (az / cnt - P[i * 3 + 2]) * kw; });
      ids.forEach((i, j) => { P[i * 3] = tmp[j * 3]; P[i * 3 + 1] = Math.max(fl, tmp[j * 3 + 1]); P[i * 3 + 2] = tmp[j * 3 + 2]; });
    }
    if (H) {
      for (let q = 0; q < hv.length; q++) { const h = hv[q] * 3, j = hn[q], i = ids[j] * 3; for (let c = 0; c < 3; c++) H[h + c] += P[i + c] - P0[j * 3 + c]; }
      // and the cloth goes round the point of the hock: behind the joint, no helper point lies in front of the skin's
      // back at its height (the heel, turned up into the hock, stood out behind the human ankle's helpers)
      const NB = 10, y0 = A.y - .06, dy = .16 / NB, back = new Float32Array(NB).fill(Infinity), bk = y => Math.floor((y - y0) / dy);
      for (const i of ids) { const k = bk(P[i * 3 + 1]); if (k >= 0 && k < NB) back[k] = Math.min(back[k], P[i * 3 + 2]); }
      for (const h of hv) { const y = H[h * 3 + 1], k = bk(y); if (k < 0 || k >= NB || H[h * 3 + 2] > A.z) continue;
        const b2 = Math.min(back[k], back[Math.max(k - 1, 0)], back[Math.min(k + 1, NB - 1)]); if (isFinite(b2)) H[h * 3 + 2] = Math.min(H[h * 3 + 2], b2 - .004); }
      // a trouser leg ends at the hock: what a human foot's helpers carried below it (the cloth breaking over the
      // instep, now the whole front of the metatarsus) is gathered into a short cuff under the hock, and the skin
      // below shows (pawsUnderHem)
      if (dg) { const hy = hemY(A.y, g); for (const h of hv) { const y = H[h * 3 + 1]; if (y < hy) H[h * 3 + 1] = hy - (hy - y) * .12; } }
    }
    // the toe point (feet planted, IK, and the frame footGeos reads)
    const ti = FIG.jIdx['toe' + s]; J[ti * 3] = T.x; J[ti * 3 + 1] = T.y; J[ti * 3 + 2] = T.z;
  }
}
/* ---------- paw-hands (researched) ----------
   Anthro hands in furry art are paws that can still hold things: fingers shorter and much thicker than a human's,
   ending in rounded tips with pads and claws (canids, felids, bears, rabbits); ungulates get "hoof-hands", the
   fingers pressed together, short, capped with keratin; dragons keep long fingers with heavy claws. The rest hand is
   reshaped like the legs: every finger's joints move to their new place and each vertex follows the bones it is
   skinned to (shorter along the bone, fatter around it), so the hand still curls, spreads and holds as before. */
const HAND_SHAPES = {zarpa: {len: .72, thumb: .8, r: 1.3, sq: 1}, pezuna: {len: .58, thumb: .5, r: 1.34, sq: .5}, garra: {len: 1.04, thumb: 1, r: .94, sq: 1}};
function handShape(b) {
  if (!b || b.species === 'humano' || b.paws === 'humanas') return null;
  const k = legSp(b), L = ANIMAL_LEGS[k]; if (!L) return null;
  return HAND_SHAPES[L.type === 'ungu' ? 'pezuna' : k === 'dragon' ? 'garra' : 'zarpa'];
}
function remodelHands(b, P, J, H) {
  const S = handShape(b); if (!S) return;
  const jv = n => new V3(J[FIG.jIdx[n] * 3], J[FIG.jIdx[n] * 3 + 1], J[FIG.jIdx[n] * 3 + 2]);
  for (const s of ['L', 'R']) {
    const seg = new Map(), mid = jv(`f${s}20`);
    for (let f = 0; f < 5; f++) {
      const names = [`f${s}${f}0`, `f${s}${f}1`, `f${s}${f}2`, `tip${s}${f}`], p = names.map(jv), k = f === 0 ? S.thumb : S.len;
      const dlt = f > 0 && S.sq < 1 ? mid.clone().sub(p[0]).multiplyScalar(1 - S.sq) : new V3(), n = [p[0].clone().add(dlt)];
      for (let i = 1; i < 4; i++) n.push(n[i - 1].clone().add(p[i].clone().sub(p[i - 1]).multiplyScalar(k)));
      for (let i = 0; i < 3; i++) seg.set(FIG.jIdx[names[i]], {o: p[i], n: n[i], d: p[i + 1].clone().sub(p[i]).normalize(), k, r: S.r * (f === 0 ? .92 : 1)});
      names.forEach((nm, i) => { const j = FIG.jIdx[nm] * 3; J[j] = n[i].x; J[j + 1] = n[i].y; J[j + 2] = n[i].z; });
    }
    const v = new V3(), out = new V3(), loc = new V3(), rad = new V3();
    const apply = (Q, cnt, si, sw) => {
      for (let i = 0; i < cnt; i++) {
        let wf = 0; for (let k = 0; k < 4; k++) if (seg.has(si[i * 4 + k])) wf += sw[i * 4 + k] / 255; if (wf < .01) continue;
        v.set(Q[i * 3], Q[i * 3 + 1], Q[i * 3 + 2]); out.set(0, 0, 0); let wt = 0;
        for (let k = 0; k < 4; k++) {
          const w = sw[i * 4 + k] / 255; if (!w) continue; const g = seg.get(si[i * 4 + k]);
          if (!g) { out.addScaledVector(v, w); wt += w; continue; }
          loc.subVectors(v, g.o); const al = loc.dot(g.d); rad.copy(loc).addScaledVector(g.d, -al);
          out.addScaledVector(g.n.clone().addScaledVector(g.d, al * g.k).addScaledVector(rad, g.r), w); wt += w;
        }
        if (wt > 0) { out.multiplyScalar(1 / wt); Q[i * 3] = out.x; Q[i * 3 + 1] = out.y; Q[i * 3 + 2] = out.z; }
      }
    };
    apply(P, FIG.meta.nV, FIG.si, FIG.sw); if (H) apply(H, FIG.nH, FIG.hsi, FIG.hsw);
  }
}
// claws on fingers and paws, hooves on goats, pads: rigid on the finger tips and the ankles (accessory skeleton)
function pawGeos(m, P) { return [...footGeos(m, P), ...handGeos(m, P)]; }
// the shared makers: a claw (keratin cone, bent down) and a pad (low leather dome)
function pawMakers(m) {
  const L = legSpec(m.body), sz = m.size, jp = n => new V3(m.J[FIG.jIdx[n] * 3], m.J[FIG.jIdx[n] * 3 + 1], m.J[FIG.jIdx[n] * 3 + 2]);
  const ACC = n => m.accBones.indexOf(m.bones[FIG.jIdx[n]]);
  const claw = (origin, axis, len, r, bone) => furAttrsLoft(loft({origin, axis, side: new V3(1, 0, 0), secs: [[-r * .5, r * .9, r * .75], [0, r, r * .8], [len * .5, r * .65, r * .55], [len, .0015, .0015]], radial: 8, sub: 2, bend: -.35, weights: () => [[bone, 1]]}), 3, 0, sz);
  // pads (toe beans): low leather domes, a in the skin's plane and h out of it
  const pad = (origin, axis, side, a, b, h, bone) => furAttrsLoft(loft({origin, axis, side, secs: [[-h * .6, a * .7, b * .7], [-h * .2, a, b], [h * .35, a * .85, b * .85], [h * .75, a * .45, b * .45], [h, .001, .001]], radial: 12, sub: 2, weights: () => [[bone, 1]]}), 2, 0, sz);
  return {L, sz, jp, ACC, claw, pad, pads: padsOn(m.body)};
}
/* Feet: the animal's toes, its beans and big pad, claws or hooves, rigid on the ankle (accessory skeleton), one mesh a
   foot (one draw, one outline). Built in the paw's frame (pawFrame), the same the leg was laid in:
   - toes: beans of fur rooted inside the front of the paw, rising over the knuckle and down to the tip, so they can be
     counted from above and from the side (the grooves between them are their own outlines);
   - claws: keratin, wider than the tip at the root and taller than wide, hooded by the toe's fur, curling down so their
     points reach the ground (the angle is solved for it); felids keep them sheathed, only the points show;
   - beans under the toe tips and the big pad under the ball, low domes of leather (kind 2) standing on the ground; the
     big pad trilobed (its point to the toes, three lobes behind), a bear's a whole sole;
   - hooves (kind 3): walls sloping at ~55° in front, lower at the heels; cloven ones in two halves with dewclaws. */
function footGeos(m, P) {
  const out = [], L = legSpec(m.body); if (!L) return out;
  const pads = padsOn(m.body), X = new V3(1, 0, 0), dn = new V3(0, -1, 0), up = new V3(0, 1, 0);
  for (const s of ['L', 'R']) {
    if (m.stumps && m.stumps['leg' + s]) continue;
    const fr = pawFrame(L, m.J, s), {W, F, g, B, K} = fr, o = s === 'L' ? 1 : -1, bone = m.accBones.indexOf(m.bones[FIG.jIdx['ankle' + s]]), weights = () => [[bone, 1]], parts = [];
    // a lofted part (no contour rings: they would ring the toes like nails); fur takes the coat of the foot (socks); a
    // closing ring is drawn into one point (loft keeps a hair's width, a pinhole up close), its normals along `tip` (the
    // last ring) or `root` (the first). A toe (`seam`) inks its two sides instead, the groove that parts it from the next
    // one, which no outline draws (the toes touch): the ring line's coordinate is made zero along the side seams and
    // kept under the smallest ring spacing elsewhere, so the line is drawn there and nowhere else, in every drawing style
    const add = (o2, kind, tip, root, seam) => {
      const geo = loft({weights, ...o2}), E = furAttrsLoft(geo, kind).attributes.aEye.array, ln = geo.attributes.aLine.array, nm = geo.attributes.normal, pa = geo.attributes.position, r = (o2.radial || 18) + 1;
      for (let i = 0; i < E.length; i += 4) { if (kind === 1) E[i + 1] = 1; if (seam) { ln[i + 2] = .004 * ln[i]; ln[i + 3] = 0; } else ln[i + 3] = -1; }
      const close = (i0, d) => { const c = new V3(); for (let i = i0; i < i0 + r; i++) c.x += pa.getX(i) / r, c.y += pa.getY(i) / r, c.z += pa.getZ(i) / r;
        for (let i = i0; i < i0 + r; i++) { pa.setXYZ(i, c.x, c.y, c.z); nm.setXYZ(i, d.x, d.y, d.z); } };
      if (tip) close(pa.count - r, tip); if (root) close(0, root);
      parts.push(geo); return geo;
    };
    // a low leather dome on the ground: a along `side`, b across it; mod shapes its outline
    const pad = (c, side, a, b, h, mod, n = 2.2) => add({origin: new V3(c.x, g + h, c.z), axis: dn, side, radial: mod ? 36 : 14, sub: 1, n, mod,
      secs: [[0, .55 * a, .55 * b], [.35 * h, .93 * a, .93 * b], [.62 * h, a, b], [.86 * h, .8 * a, .8 * b], [.97 * h, .42 * a, .42 * b], [h, .001, .001]]}, 2, dn);
    // a claw from p along d: as wide as the toe's tip at the root and taller than wide, tilted 10° down and curling, or
    // less tilted if its point would go into the ground
    const claw = (p, d, len, c, curl) => {
      const drop = a => -Math.sin(a) + curl * Math.cos(a), r = (g + .15 * c - p.y) / len; let a = 10 * DEG;
      if (drop(a) < r) { let lo = -40 * DEG, hi = a; for (let k = 0; k < 14; k++) { a = (lo + hi) / 2; if (drop(a) > r) lo = a; else hi = a; } }
      const ax = new V3(d.x * Math.cos(a), -Math.sin(a), d.z * Math.cos(a)).normalize();
      add({origin: p, axis: ax, side: new V3(d.z, 0, -d.x), radial: 8, sub: 2, bend: curl,
        secs: [[-.5 * len, .62 * c, c], [0, .64 * c, c], [.35 * len, .5 * c, .8 * c], [.7 * len, .28 * c, .45 * c], [.92 * len, .1 * c, .14 * c], [len, .001, .001]]}, 3, ax);
    };
    // a toe: a bean of fur from inside the paw (buried as deep as a short toe, so a long one does not come out behind)
    // over its knuckle and down to the tip (dragons: three knuckles); the buried root rides high, clear of the sole. Rows: t, half width, half height, centre height (in
    // tw, tt); its underside stays a third of tt above the ground over the bean, which stands out under it as its own
    // oval (a toe sitting on its bean, not a bean cut by the fur)
    const TOE = K.knuckles ? [[-.5, .001, .001, 1.3], [-.42, .7, .6, 1.3], [0, 1, .95, 1.28], [.28, 1.08, 1.04, 1.36], [.44, .9, .86, 1.2], [.6, .98, .85, 1.17], [.76, .8, .66, .98], [.9, .72, .5, .82], [.975, .36, .3, .66], [1, .001, .001, .62]]
      : [[-.5, .001, .001, 1.3], [-.42, .7, .6, 1.3], [0, 1, .95, 1.25], [.32, 1.04, 1.04, 1.32], [.62, .96, .78, 1.1], [.84, .76, .56, .9], [.95, .46, .34, .68], [1, .001, .001, .62]];
    const toe = (root, d, Lt, tw, tt) => add({origin: root, axis: d, side: X, radial: 12, sub: 2, n: 2.2, secs: TOE.map(([t, w, h, c]) => [t * (t < 0 ? Math.min(Lt, .32 * W) : Lt), w * tw, h * tt, 0, c * tt])}, 1, d, d.clone().negate(), true);
    if (L.hoof) {
      // the hoof under the coronet: its sole on the ground, the front wall at ~55°, the heels lower (horse: one; goats and
      // deer: two halves with the cleft between them, and two dewclaws behind the fetlock)
      const {C} = fr, Hh = C.y - g, two = L.hoof !== 'single', slope = 1 / Math.tan(PASTERN);
      for (const k of two ? [-1, 1] : [0]) {
        // sections up the wall: the toe slopes back with the pastern, the heels rise nearly upright (and lower, below);
        // cloven halves lean in at the top so the two meet over the pastern
        const bw = (two ? .26 : .5) * W, bl = (two ? .58 : .56) * W, hz = C.z + .39 * Hh, x = C.x + k * .27 * W;
        const sec = (t, kw, kl = 1) => { const zf = hz + bl * kl - t * slope, zb = hz - bl * kl - .08 * t; return [t, bw * kw, (zf - zb) / 2, -k * .1 * W * t / Hh, hz - (zf + zb) / 2]; };
        const geo = add({origin: new V3(x, g, hz), axis: up, side: X, radial: 24, sub: 2, n: two ? 2.3 : 2.1,
          mod: two ? ph => (1 - .3 * Math.max(0, -k * Math.sin(ph)) ** 2) * (1 + .12 * Math.max(0, Math.cos(ph)) ** 8) : null,
          secs: [[-.004 * F, .001, .001], sec(-.002 * F, .85, .85), sec(0, 1), sec(.35 * Hh, .96), sec(.7 * Hh, .9), sec(Hh, .84), sec(1.1 * Hh, .7, .9), sec(1.18 * Hh, .25, .3)]}, 3);
        // the heels are lower than the toe: the back of the wall comes down
        const pa = geo.attributes.position; for (let i = 0; i < pa.count; i++) { const back = clamp((hz - pa.getZ(i)) / bl, 0, 1.5), h = pa.getY(i) - g; if (h > 0) pa.setY(i, g + h * (1 - .32 * back * back)); }
        geo.computeVertexNormals();
      }
      if (two) for (const k of [-1, 1]) claw(fr.B.clone().lerp(C, .45).add(new V3(k * .2 * W, 0, -.1 * F)), new V3(0, 0, -1), .09 * F, .025 * F, -.4);
      if (parts.length) out.push(mergeLofts(parts));
      continue;
    }
    // toes from the inside out: the middle ones longest, the outer ones shorter and set back, a little splayed
    const n = K.n, kn = B.z + K.mitt * W, toes = [];
    for (let i = 0; i < n; i++) {
      const e = n > 1 ? 2 * i / (n - 1) - 1 : 0, ax = Math.abs(e), tw = K.tw * W * (1 - .12 * ax * ax), tt = K.tt * W * (1 - .14 * ax * ax);
      const root = new V3(B.x + o * e * K.x * W * .8, g, kn - (.12 + .08 * ax * ax) * W), tip = new V3(B.x + o * e * K.x * W * 1.12, g, kn + (K.reach[1] - (K.reach[1] - K.reach[0]) * ax * ax) * W);
      const d = tip.clone().sub(root), Lt = d.length(); d.normalize(); toes.push({root, d, Lt, tw, tt}); toe(root, d, Lt, tw, tt);
    }
    if (K.claw) for (const t of toes) claw(t.root.clone().addScaledVector(t.d, .84 * t.Lt).setY(g + .98 * t.tt), t.d, K.claw[0] * W, K.claw[1] * W, K.claw[2]);
    if (K.dew) {
      // a dragon's dewclaw: a short toe high on the inside of the foot, pointing back and down, with its talon
      const d = new V3(-o * .35, -.6, -.72).normalize(), r = new V3(B.x - o * .24 * W, g + .32 * W, B.z - .02 * W), Lt = .24 * W;
      toe(r, d, Lt, .075 * W, .075 * W); claw(r.clone().addScaledVector(d, .8 * Lt).add(new V3(0, .05 * W, 0)), new V3(d.x, 0, d.z).normalize(), K.claw[0] * W * .4, K.claw[1] * W * .55, K.claw[2]);
    }
    if (pads && K.bean) {
      for (const t of toes) pad(t.root.clone().addScaledVector(t.d, .58 * t.Lt), t.d, K.bean[1] * W, K.bean[0] * W, .075 * W);
      if (L.type === 'planti') {
        // a bear's plantar pad: a thin slab on the sole's own outline (inset), broad across the ball with a shallow hollow
        // in front, narrowing to the heel, ending short of the toe beans
        const ai = FIG.jIdx['ankle' + s], NB = 12, hw = new Float32Array(NB), xc = new Float32Array(NB); let z0 = Infinity, z1 = B.z + .07 * W;
        const sole = []; for (let i = 0; i < FIG.meta.nV; i++) if (m.dom[i] === ai && P[i * 3 + 1] < g + .12 * W && P[i * 3 + 2] < z1) { sole.push(i); z0 = Math.min(z0, P[i * 3 + 2]); }
        const bin = z => clamp(Math.round((z - z0) / (z1 - z0) * (NB - 1)), 0, NB - 1), lo = new Float32Array(NB).fill(Infinity), hi = new Float32Array(NB).fill(-Infinity);
        for (const i of sole) { const k = bin(P[i * 3 + 2]); lo[k] = Math.min(lo[k], P[i * 3]); hi[k] = Math.max(hi[k], P[i * 3]); }
        // (the sole widens from the heel to the ball: its half width read as a running maximum, so a sparse band of
        // vertices does not notch the pad)
        for (let k = 0; k < NB; k++) { if (!isFinite(lo[k])) { lo[k] = lo[k - 1] ?? B.x; hi[k] = hi[k - 1] ?? B.x; } xc[k] = (lo[k] + hi[k]) / 2; hw[k] = Math.max((hi[k] - lo[k]) / 2, k ? hw[k - 1] : 0); }
        const zc = (z0 + z1) / 2, cx = xc.reduce((a, v) => a + v, 0) / NB, len = z1 - z0, inside = (x, z) => { const u = (z - z0) / len, k = bin(z), dx = Math.abs(x - cx) / (hw[k] * .86 * (.72 + .28 * sstep(0, .5, u)) || 1e-4);
          return u > .03 && dx < 1 && z < z1 - .08 * W * (1 - dx * dx); };
        const R = ph => { const c = Math.cos(ph), sn = Math.sin(ph); let d = 0; while (d < len && inside(cx + c * d, zc + sn * d)) d += .005 * W; return Math.max(d, .02 * W); };
        if (sole.length) pad(new V3(cx, 0, zc), new V3(0, 0, 1), 1, 1, .05 * W, R, 2);
      } else {
        // the big pad, trilobed: a rounded point towards the toes, three lobes behind
        pad(new V3(B.x, 0, B.z + .08 * W), new V3(0, 0, 1), K.pad[1] * W * .92, K.pad[0] * W, .07 * W, ph => {
          const q = ph - Math.PI / 2, d = Math.abs(Math.abs(q) - Math.PI);  // q: from the front; d: from straight back
          return (1 - .6 * Math.max(0, Math.cos(q)) ** 2 * Math.sin(q) ** 2) * (1 + .08 * Math.cos(2 * Math.PI * d / .8) * sstep(1.25, .85, d)); });
      }
    }
    if (parts.length) out.push(mergeLofts(parts));
  }
  return out;
}
// hands: palm and finger pads, hoof caps, finger claws
function handGeos(m, P) {
  const out = []; if (!legSpec(m.body)) return out;
  const {L, sz, jp, ACC, claw, pad, pads} = pawMakers(m);
  for (const s of ['L', 'R']) {
    if (pads && m.handAxes) {
      // palm and finger pads, on the palm side of the hand
      const n = m.handAxes[s].n, w = jp('wrist' + s), mid = jp(`f${s}20`), side = jp(`f${s}10`).sub(jp(`f${s}40`)).normalize();
      for (let f = 1; f < 5; f++) { const a = jp(`f${s}${f}2`), b = jp(`tip${s}${f}`), c = a.clone().lerp(b, .55).addScaledVector(n, .0075 * sz);
        out.push(pad(c, n, side, .0058 * sz, .007 * sz, .0035 * sz, ACC(`f${s}${f}2`))); }
      const pc = w.clone().lerp(mid, .62).addScaledVector(n, .014 * sz);
      out.push(pad(pc, n, side, .019 * sz, .014 * sz, .005 * sz, ACC('wrist' + s)));
    }
    if (handShape(m.body) === HAND_SHAPES.pezuna) {
      // hoof-hands: two keratin caps over the fingers pressed together (one for a horse)
      const n = m.handAxes ? m.handAxes[s].n : new V3(0, 0, 1), groups = L.hoof === 'single' ? [[1, 2, 3, 4]] : [[1, 2], [3, 4]];
      for (const gr of groups) {
        const tip = gr.reduce((a, f) => a.add(jp(`tip${s}${f}`)), new V3()).multiplyScalar(1 / gr.length), base = gr.reduce((a, f) => a.add(jp(`f${s}${f}2`)), new V3()).multiplyScalar(1 / gr.length);
        const ax = tip.clone().sub(base).normalize(), w = .009 * sz * (gr.length > 2 ? 1.7 : 1.05), len = tip.distanceTo(base) * 1.05;
        out.push(furAttrsLoft(loft({origin: base.clone().addScaledVector(ax, len * .25), axis: ax, side: n.clone(), secs: [[0, w, w * .9], [len * .45, w * 1.08, w], [len * .8, w * .95, w * .85], [len * .95, w * .55, w * .45], [len, .001, .001]], radial: 12, sub: 2, weights: () => [[ACC(`f${s}${gr[0]}2`), 1]]}), 3));
      }
    }
    if (L.hand) for (let f = 1; f < 5; f++) {
      const tip = jp(`tip${s}${f}`), last = jp(`f${s}${f}2`), dir = tip.clone().sub(last).normalize();
      out.push(claw(tip.clone().addScaledVector(dir, -.004 * sz), dir, L.hand * sz, L.hand * .3 * sz, ACC(`f${s}${f}2`)));
    }
  }
  return out;
}
