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
  gato:   {face: [['x3144f', 1]],             ears: [['x3144e', 1]],                                          pupil: 'rendija', mouth: 'gato'},
  tigre:  {face: [['x3221f', 1]],             ears: [['x3221e', 1]],                                          pupil: 'redonda', mouth: 'felino'},
  leon:   {face: [['x3200f', 1]],             ears: [['x3200e', 1]], kemono: [['x3178f', 1]],                 pupil: 'redonda', mouth: 'felino'},
  oso:    {face: [['x3487f', 1]],             ears: [['x3487e', 1]], toon: [['x3486f', 1]], kemono: [['x3486f', 1]], kemonoEars: [['x3486e', 1]], pupil: 'redonda', mouth: 'canino'},
  conejo: {face: [['x3152f', 1]],             ears: [['x3152e', 1]], kemono: [['x3489f', 1]], kemonoEars: [['x3489e', 1]], pupil: 'redonda', mouth: 'roedor', side: 1},
  caballo:{face: [['x2952f', 1.45]],             ears: [['x2952e', 1]],                                          pupil: 'horizontal', mouth: 'herbivoro', side: 1},
  cabra:  {face: [['x2952f', .6]],            ears: [['x2952e', 1]],                                          pupil: 'horizontal', mouth: 'herbivoro', side: 1, pad: 1},
  ciervo: {face: [['x2952f', .8]],            ears: [['x2952e', 1]],                                          pupil: 'horizontal', mouth: 'herbivoro', side: 1, pad: 1},
  dragon: {face: [['x2931', 1]],              ears: [],                                                        pupil: 'rendija', mouth: 'reptil'}
};
// close relatives: their mouths and eyes (and, with a human face, their ears) are those of the head they used to borrow
Object.assign(HEAD_RECIPES, {coyote: HEAD_RECIPES.lobo, hiena: HEAD_RECIPES.perro, leopardo: {...HEAD_RECIPES.gato, pupil: 'redonda'},
  mapache: {...HEAD_RECIPES.zorro, pupil: 'redonda'}, panda: {...HEAD_RECIPES.zorro, pupil: 'redonda'}, mofeta: {...HEAD_RECIPES.gato, pupil: 'redonda'}});
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
/* The mouth opens along a lip line, not across the face: in front of the corners of the mouth (the commissures) the upper
   and lower lips come apart, behind them the cheek stretches from the skull to the jaw. A sculpted head is cut along
   that line (11-heads.js); this head, the body's own mesh, keeps its triangles, so the ones that cross the line in front
   of the corners are dropped by the shader while the mouth is open and the rest stretch. aLip is ±1 round the mouth in
   front of the corners and ±2 elsewhere, the sign by the side of the line: a triangle is dropped where it interpolates
   strictly between −1 and 1, which only one joining the two lips does (one from 1 to 2 or from −1 to −2 never passes
   through that band, so the skin round the opening is never cut half way, as a side marked 2 against a lower lip at −1
   was, leaving slivers and flaps in the opening). The ±1 reach well above and below the line (and the shader's cut as
   far): MakeHuman's lips roll in to a mouth whose roof and floor are joined by long triangles across it, which, cut only
   near the line, stood stretched in the opening as grey shards.
   Both carry the same jaw weights (mouthFrame, jawWeight). */
function anthroHead(m, P, J) {
  const SI = m.geo.attributes.skinIndex.array, SW = m.geo.attributes.skinWeight.array;
  if (m.anthroSkinned) { for (let i = 0; i < SI.length; i++) { SI[i] = FIG.si[i]; SW[i] = FIG.sw[i] / 255; } m.anthroSkinned = false; }
  if (!m.geo.attributes.aLip) m.geo.setAttribute('aLip', new THREE.BufferAttribute(new Float32Array(FIG.meta.nV), 1));
  const LIP = m.geo.attributes.aLip.array; m.geo.attributes.aLip.needsUpdate = true;
  if (m.geo.index.array !== FIG.index) m.geo.setIndex(new THREE.BufferAttribute(FIG.index, 1));
  m.geo.attributes.skinIndex.needsUpdate = m.geo.attributes.skinWeight.needsUpdate = true;
  const r = HEAD_RECIPES[headSp(m.body)];
  if (!r) { m.anthro = null; LIP.fill(2); return; }
  const nV = FIG.meta.nV, H = FIG.jIdx.head, Jw = FIG.jIdx.jaw, L = headLandmarks(m, P), hh = L.hh, mY = mouthLine(m, P, L);
  for (let i = 0; i < nV; i++) LIP[i] = P[i * 3 + 1] < mY ? -2 : 2;
  let tip = null, tipZ = -Infinity;
  for (let i = 0; i < nV; i++) {
    const d = m.dom[i]; if ((d !== H && d !== Jw) || FIG.eye[i]) continue;
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    if (Math.abs(x) < .012 * hh && y > mY && z > tipZ) { tipZ = z; tip = [0, y, z]; }
  }
  // a kemonomimi keeps its human mouth (MakeHuman's own jaw weights and lips)
  const F = tip && (m.body.kemo ?? 3) > 1 ? jawRoom(m, P, J, mouthFrame(r.mouth, mY, tip[2], L.eyeZ, J[Jw * 3 + 2], hh, L.chin)) : null;
  if (F) for (let i = 0; i < nV; i++) {
    const d = m.dom[i]; if ((d !== H && d !== Jw) || FIG.eye[i]) continue;
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], o = i * 4;
    if (z > F.zc - .1 * hh && Math.abs(x) < F.xc + .05 * hh && Math.abs(y - mY) < .3 * hh) LIP[i] = y < mY ? -1 : 1;
    // the lips in front of the corners go wholly with the skull or the jaw; elsewhere the human jaw weights stay if larger
    let jw = 0; for (let k = 0; k < 4; k++) if (SI[o + k] === Jw) jw += SW[o + k];
    const w = jawWeight(F, x, y, z), open = z > F.zc && Math.abs(x) < F.xc;
    if (open ? Math.abs(w - jw) < 1e-3 : w <= jw) continue;
    for (let k = 0; k < 4; k++) SW[o + k] = SI[o + k] === Jw ? 0 : SW[o + k] * (1 - w) / Math.max(1e-6, 1 - jw);
    let slot = -1; for (let k = 0; k < 4; k++) if (SI[o + k] === Jw) slot = k;
    if (slot < 0) { slot = 0; for (let k = 1; k < 4; k++) if (SW[o + k] < SW[o + slot]) slot = k; SI[o + slot] = Jw; }
    SW[o + slot] = w;
    const sum = SW[o] + SW[o + 1] + SW[o + 2] + SW[o + 3]; for (let k = 0; k < 4; k++) SW[o + k] /= sum || 1;
    if (!(sum > 0)) { SI[o] = H; SW[o] = 1; }
    m.anthroSkinned = true;
  }
  // inside those lips MakeHuman's mouth is a shallow pocket, its walls joined to the lips and on into the cheeks behind
  // the corners: open, they stretched in front of the new inside as grey shards and, seen from behind and inked, black
  // flaps. Skin inside the lip edge (in plan) near the line that faces into the mouth, towards its middle or the other
  // jaw, or lies flat on the line (where the lips meet) is that pocket (the outer skin under the edge in plan, the
  // chin's underside, faces down and away); its
  // triangles go to the end of this body's own index and are left out of the draw while the mouth is open (anthroTick),
  // whole triangles, which no cut by a per-vertex mark can do
  let pocket = 0;
  if (F) { const pts = lipCross(m, F, P);
    if (pts.length > 5) { const {Cb, inside} = mouthOutline(pts, F, 10), I = FIG.index, N = new Float32Array(nV * 3), inner = new Uint8Array(nV), ok = i => (m.dom[i] === H || m.dom[i] === Jw) && !FIG.eye[i];
      for (let t = 0; t < I.length; t += 3) { const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3, ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
        for (const v of [a, b, c]) { N[v] += uy * vz - uz * vy; N[v + 1] += uz * vx - ux * vz; N[v + 2] += ux * vy - uy * vx; } }
      for (let i = 0; i < nV; i++) { const x = P[i * 3], y = P[i * 3 + 1] - mY, z = P[i * 3 + 2], dz = Math.max(z - Cb, 0), r = Math.hypot(x, dz) || 1e-6; if (!ok(i) || Math.abs(y) > .2 * hh || inside(x, z) < .01 * hh) continue;
        const n = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1, ny = N[i * 3 + 1] / n;
        inner[i] = (N[i * 3] * x + N[i * 3 + 2] * dz) / (r * n) < -.1 || ny * Math.sign(y) < -.3 || Math.abs(y) < .02 * hh && Math.abs(ny) > .5 ? 1 : 0; }
      // and any triangle across the line well inside the edge, which the opening would stretch from roof to floor
      const across = (a, b, c) => { const ys = [a, b, c].map(i => P[i * 3 + 1] - mY); return Math.min(...ys) < 0 && Math.max(...ys) >= 0 && [a, b, c].every(ok) && inside((P[a * 3] + P[b * 3] + P[c * 3]) / 3, (P[a * 3 + 2] + P[b * 3 + 2] + P[c * 3 + 2]) / 3) > .01 * hh; };
      const keep = [], drop = []; for (let t = 0; t < I.length; t += 3) (inner[I[t]] || inner[I[t + 1]] || inner[I[t + 2]] || across(I[t], I[t + 1], I[t + 2]) ? drop : keep).push(I[t], I[t + 1], I[t + 2]);
      if (drop.length) { pocket = keep.length; m.geo.setIndex(new THREE.BufferAttribute(new I.constructor([...keep, ...drop]), 1)); } } }
  // ears: the vertices the species' ear target lifts away from the skull belong to the ear bones; their base is the pivot
  const earW = new Float32Array(nV), mor = {...speciesMorphs(m.body), ...(m.body.morphs || {})};
  for (const [name, wt] of Object.entries(mor)) {
    if (!/^x\d+e$/.test(name) && !(HEAD_RECIPES[headSp(m.body)].ears || []).some(([n]) => n === name)) continue;
    const x = FIG.xsets[name]; if (!x) continue; const q = FIG.meta.q * wt;
    for (let k = 0; k < x.iv.length; k++) { const d = Math.hypot(x.dv[k * 3], x.dv[k * 3 + 1], x.dv[k * 3 + 2]) * q; earW[x.iv[k]] = Math.max(earW[x.iv[k]], d); }
  }
  const earBase = {}, earDir = {}, acc = {L: [0, 0, 0, 0], R: [0, 0, 0, 0]}, tipAcc = {L: [0, 0, 0, 0], R: [0, 0, 0, 0]}, EL = FIG.meta.bones.length, lo = .015 * hh, hi = .13 * hh;
  for (let i = 0; i < nV; i++) {
    if (earW[i] < lo * .5 || FIG.eye[i]) { earW[i] = 0; continue; }
    const y = P[i * 3 + 1]; if (y < L.eyeY) { earW[i] = 0; continue; }
    const w = sstep(lo, hi, earW[i]); earW[i] = w;
    const k = P[i * 3] > 0 ? 'L' : 'R';
    if (w > .15 && w < .45) { const a = acc[k]; a[0] += P[i * 3]; a[1] += P[i * 3 + 1]; a[2] += P[i * 3 + 2]; a[3]++; }
    if (w > .8) { const a = tipAcc[k]; a[0] += P[i * 3]; a[1] += P[i * 3 + 1]; a[2] += P[i * 3 + 2]; a[3]++; }
    if (w > .02) {
      const o = i * 4, bone = EL + (k === 'L' ? 0 : 1);
      for (let j = 0; j < 4; j++) SW[o + j] *= 1 - w;
      let slot = 0; for (let j = 1; j < 4; j++) if (SW[o + j] < SW[o + slot]) slot = j;
      SI[o + slot] = bone; SW[o + slot] = w;
      const sum = SW[o] + SW[o + 1] + SW[o + 2] + SW[o + 3]; for (let j = 0; j < 4; j++) SW[o + j] /= sum;
      m.anthroSkinned = true;
    }
  }
  for (const k of ['L', 'R']) if (acc[k][3] > 3) { earBase[k] = new V3(acc[k][0] / acc[k][3], acc[k][1] / acc[k][3], acc[k][2] / acc[k][3]);
    if (tipAcc[k][3]) earDir[k] = new V3(tipAcc[k][0] / tipAcc[k][3], tipAcc[k][1] / tipAcc[k][3], tipAcc[k][2] / tipAcc[k][3]).sub(earBase[k]).normalize(); }
  const snout = tip ? (tip[2] - L.eyeZ) / hh : 0;
  m.anthro = {L, mouthY: mY, tip, spec: {snout, nose: r.mouth}, recipe: r, mouth: F, pocket, earBase: Object.keys(earBase).length ? earBase : null, earDir};
}
// after the body is lifted onto the ground, landmarks move with it
function shiftAnthro(m, dy) {
  const an = m.anthro; if (!an) return;
  an.L.eyeY -= dy; an.L.chin -= dy; an.L.crown -= dy; an.mouthY -= dy; if (an.tip) an.tip[1] -= dy;
  if (an.mouth) { an.mouth.y -= dy; an.mouth.chin -= dy; an.mouth.jy -= dy; }
  if (an.earBase) for (const k in an.earBase) an.earBase[k].y -= dy;
}
/* ---------- the open mouth ----------
   Research: Evans & de Lahunta (Miller's Anatomy of the Dog), Reighard & Jennings (Anatomy of the Cat) for the teeth;
   furry and creature artists' open-mouth sheets for how it reads in a drawing. Open, a predator's mouth is a black lip
   margin round the opening, then the gums along both jaws with the teeth set in them as separate teeth, the ridged palate
   above, the tongue lying on the floor between the lower rows (rounded tip, a groove down the middle) and the dark
   throat behind. The gape is long in carnivores and reptiles (the corner of the mouth under the eye) and short in
   herbivores and rodents (but a kemono rabbit's muzzle is so short that its corners sit well back, under the cheeks).
   Dental formulas, simplified, per half jaw from the front:
     canino     I3 C1 P4 M2: small incisors, a long canine curving back, spaced triangular premolars, the carnassial (the
                biggest blade: upper P4, lower M1) and a molar.
     felino     I3 C1 P3/2 M1: tiny incisors, very long canines, a gap, then two blades (the second is the carnassial).
     gato       a house cat's: the same long canines, its cheek teeth small (a hissing cat shows four fangs and a row of
                tiny incisors, not a shark's rows), and its jaw opening a little less far.
     roedor     rabbits (lagomorphs): one long chisel incisor (above, a small peg behind it), a long gap, flat cheek teeth.
     herbivoro  horses: flat spatulate incisors, a long toothless gap (the bars), square grinding cheek teeth; ruminants
                (goat, deer: recipe pad) have no upper incisors, a hard dental pad bites on the lower ones instead.
     reptil     rows of near-equal conical teeth that curve back.
   gape: where the corners are, from the nose (0) to the eyes (1); xc: widest opening; open: how far the jaw drops for an
   expression against a carnivore's (a grazer's or a rodent's gape is smaller); fmin: how small the teeth may get
   on a short (kemono) muzzle, so a cat keeps its fangs and a rabbit its incisors; om: how far the closed mouth's line
   dips under each whisker pad (a cat's ω), in head heights; teeth: [shape, u, length,
   half-width] with u along the half arch, 0 front middle … 1 corner, and sizes in head heights (i incisor, f flat
   chisel incisor, c canine, p premolar, k carnassial, m molar, r reptile cone). */
const reptRow = (n, l0, l1, w) => Array.from({length: n}, (_, k) => ['r', .06 + .88 * k / (n - 1), l0 + (l1 - l0) * k / (n - 1), w * (1 - .3 * k / (n - 1))]);
const MOUTHS = {
  canino: {gape: .95, xc: .27, pack: 1, up: [['i', .05, .032, .011], ['i', .11, .034, .012], ['i', .17, .038, .013], ['c', .28, .12, .023], ['p', .45, .042, .024], ['p', .6, .052, .028], ['k', .77, .075, .038], ['p', .92, .032, .026]],
                               lo: [['i', .04, .028, .01], ['i', .09, .03, .011], ['i', .14, .032, .012], ['c', .21, .1, .021], ['p', .38, .038, .022], ['p', .53, .048, .026], ['k', .71, .07, .036], ['p', .87, .035, .026]]},
  felino: {gape: .9, xc: .27, fmin: .8, up: [['i', .05, .018, .009], ['i', .1, .02, .01], ['i', .15, .022, .011], ['c', .27, .14, .026], ['p', .56, .045, .024], ['k', .76, .075, .04]],
                              lo: [['i', .04, .017, .008], ['i', .08, .019, .009], ['i', .12, .02, .01], ['c', .2, .115, .023], ['p', .52, .045, .024], ['k', .72, .07, .038]]},
  gato: {gape: .9, xc: .27, fmin: .8, open: .85, om: .02, up: [['i', .05, .014, .008], ['i', .1, .016, .009], ['i', .15, .018, .01], ['c', .27, .125, .024], ['p', .56, .028, .02], ['k', .76, .045, .03]],
                              lo: [['i', .04, .013, .007], ['i', .08, .015, .008], ['i', .12, .016, .009], ['c', .2, .1, .021], ['p', .52, .028, .02], ['k', .72, .042, .028]]},
  roedor: {gape: .8, xc: .2, fmin: .85, open: .85, up: [['f', .07, .085, .026], ['i', .17, .028, .011], ['m', .8, .018, .018], ['m', .92, .016, .016]],
                               lo: [['f', .06, .07, .022], ['m', .78, .018, .018], ['m', .9, .016, .016]]},
  herbivoro: {gape: .55, xc: .36, open: .75, up: [['f', .05, .05, .019], ['f', .13, .05, .018], ['f', .21, .046, .017], ['m', .52, .03, .034], ['m', .63, .03, .036], ['m', .74, .03, .036], ['m', .85, .03, .034], ['m', .95, .028, .03]],
                                   lo: [['f', .04, .052, .018], ['f', .12, .05, .017], ['f', .2, .046, .016], ['m', .5, .03, .034], ['m', .61, .03, .036], ['m', .72, .03, .036], ['m', .83, .03, .034], ['m', .93, .028, .03]]},
  reptil: {gape: 1.08, xc: .3, pack: 1, up: reptRow(11, .085, .04, .015), lo: reptRow(10, .07, .035, .014)}
};
// where a head opens, in any frame with y up and z forward (h: head height): the lip line at height y, its corners at zc
// (and no wider than xc, wider on a long muzzle with a long gape, so a flat face does not open from cheek to cheek: a
// horse's or a rabbit's mouth stays narrow however long its muzzle), the jaw's hinge at zh; what lies below the chin's
// underside is the throat
function mouthFrame(type, y, zTip, zEye, zh, h, chin) {
  const M = MOUTHS[type] || MOUTHS.canino;
  return {type, M, y, zc: Math.min(zTip - .11 * h, Math.max(zh + .05 * h, zTip - M.gape * (zTip - zEye))), xc: M.xc * h * (M.gape > .7 ? clamp((zTip - zEye) / (.3 * h), 1, 1.8) : 1), zh, h, chin, tip: zTip};
}
// the jaw's joint and the front of the throat (the body's neck) under the chin: a short jaw over a thick neck can only drop
// so far before its chin swings back into the throat (exprJoints)
function jawRoom(m, P, J, F) {
  const Jw = FIG.jIdx.jaw, Nk = FIG.jIdx.neck; let nz = -Infinity;
  for (let i = 0; i < FIG.meta.nV; i++) if (m.dom[i] === Nk && Math.abs(P[i * 3]) < .1 * F.h && P[i * 3 + 1] < F.chin && P[i * 3 + 1] > F.chin - .3 * F.h) nz = Math.max(nz, P[i * 3 + 2]);
  return {...F, jy: J[Jw * 3 + 1], jz: J[Jw * 3 + 2], nz};
}
// how much of a point of the face goes with the jaw: in front of the corners the lower lip all of it and the upper none;
// behind them a blend across the line that widens towards the hinge (the cheek stretches); nothing behind the hinge or
// down the throat. Next to the corners the lips part only gradually (k: 0 at the corner, 1 a little in front of it), so
// the opening rounds off into the commissure as lips do, instead of ending square like a slot cut into the muzzle.
// `lo`: which lip a point on the line itself belongs to (the cut's two copies of the edge)
function jawWeight(F, x, y, z, lo = y < F.y) {
  const h = F.h, out = Math.max(F.zc - z, Math.abs(x) - F.xc, 0), S = .35 * Math.min(F.tip - F.zc, F.xc) + 1e-6;
  const k = out > 0 ? 0 : sstep(0, S, Math.min(z - F.zc, F.xc - Math.abs(x))), b = .012 * h + .06 * h * (1 - k) + .6 * out;
  const c = sstep(F.y + b, F.y - b, y);
  return (lo ? c + (1 - c) * k : c * (1 - k)) * sstep(F.zh - .06 * h, F.zh + .06 * h, z) * sstep(F.chin - .22 * h, F.chin - .05 * h, y);
}
// the lip edge in plan (x, z): the sculpted head's own cut, or where the body's head (positions P) crosses the lip line
const lipPoints = (m, F) => m.anthro.rim || lipCross(m, F, m.geo.attributes.position.array);
function lipCross(m, F, P) {
  const out = [], I = FIG.index, ok = i => (m.dom[i] === FIG.jIdx.head || m.dom[i] === FIG.jIdx.jaw) && !FIG.eye[i];
  for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) {
    const a = I[t + e], b = I[t + (e + 1) % 3], ya = P[a * 3 + 1] - F.y, yb = P[b * 3 + 1] - F.y;
    if ((ya < 0) === (yb < 0) || !ok(a) || !ok(b)) continue;
    const u = ya / (ya - yb), x = P[a * 3] + (P[b * 3] - P[a * 3]) * u, z = P[a * 3 + 2] + (P[b * 3 + 2] - P[a * 3 + 2]) * u;
    if (z > F.zc && Math.abs(x) < F.xc) out.push([x, z]);
  }
  return out;
}
// the outline of the inside in plan: the lip edge as a symmetric fan of 2 NS + 1 radii (the outermost where the cut also
// crosses a modelled inside) about (0, Cb), behind the corners, so the angle grows steadily from the front to each
// corner even where the lips run straight back, then round behind the corners to the back of the mouth (zBack) and
// over to the other side; `inside(x, z)`: how far a point lies within it (negative outside)
function mouthOutline(pts, F, NS) {
  const zf = Math.max(...pts.map(p => p[1])), Cb = F.zc - .3 * (zf - F.zc), zBack = F.zc - .7 * Math.max(F.zc - F.zh, .05 * F.h), R = new Array(NS + 1).fill(0); let tc = 0;
  for (const [x, z] of pts) tc = Math.max(tc, Math.abs(Math.atan2(x, z - Cb)));
  // the edge's outer envelope, slice by slice, each slice's farthest point kept at its own angle, then read at the
  // outline's angles: put at the slice's middle it stood out of a tapering snout's tip (a dragon's front teeth outside
  // its lips)
  const env = new Array(NS + 1).fill(null);
  for (const [x, z] of pts) { const a = Math.abs(Math.atan2(x, z - Cb)), b = Math.round(a / tc * NS), r = Math.hypot(x, z - Cb); if (!env[b] || r > env[b][1]) env[b] = [a, r]; }
  const E = env.filter(Boolean);
  for (let k = 0; k <= NS; k++) { const t = k / NS * tc; let i = 0; while (i < E.length - 1 && E[i + 1][0] < t) i++;
    const [a0, r0] = E[i], [a1, r1] = E[Math.min(i + 1, E.length - 1)]; R[k] = t <= a0 ? r0 : t >= a1 ? r1 : r0 + (r1 - r0) * (t - a0) / (a1 - a0); }
  const outl = []; for (let k = -NS; k <= NS; k++) { const t = k / NS * tc, r = R[Math.abs(k)]; outl.push({x: r * Math.sin(t), z: Cb + r * Math.cos(t), open: Math.abs(k) < NS}); }
  { const c = outl[outl.length - 1]; for (let k = 1; k < 8; k++) { const f = k / 8 * Math.PI; outl.push({x: c.x * Math.cos(f) * (1 - .15 * Math.sin(f)), z: c.z - (c.z - zBack) * Math.sin(f), open: false}); } }
  const inside = (x, z) => { let c = false, e = Infinity; for (let i = 0, j = outl.length - 1; i < outl.length; j = i++) { const A = outl[j], B = outl[i], dx = B.x - A.x, dz = B.z - A.z, t = clamp(((x - A.x) * dx + (z - A.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    e = Math.min(e, Math.hypot(x - A.x - dx * t, z - A.z - dz * t)); if ((A.z > z) !== (B.z > z) && x < A.x + dx * (z - A.z) / dz) c = !c; } return c ? e : -e; };
  return {zf, Cb, zBack, outl, inside};
}
/* The inside, built on the lip edge so it meets the lips exactly: a bag fanned from the middle of the mouth to the edge
   (upper half on the skull, lower half on the jaw, the cheek pouch behind the corners skinned like the cheek), the gums
   along it with the teeth set in them, the tongue on the floor. Painted by kind in the character's own drawing style
   (10c-coat.js: 5 enamel, 6 tongue, 7 gum, 8 palate, 9 throat). Accessory skeleton: 1 head, 5 jaw. */
function mouthParts(m) {
  const an = m.anthro, F = an && an.mouth; if (!F) return [];
  const pts = lipPoints(m, F); if (pts.length < 6) return [];
  const h = F.h, HEAD = 1, JAW = 5, NS = 10, {zf, Cb, zBack, outl, inside} = mouthOutline(pts, F, NS), Cz = F.zc + .35 * (zf - F.zc), lt = .02 * h, gh = .02 * h;
  // what the inside closes towards: the point (0, Cz) for the front of the edge, the middle line straight across for its
  // sides, so the palate vaults over the middle like a real one (a single point drew creases fanning out from it)
  const into = o => new V3(-o.x, 0, clamp(o.z, zBack, Cz) - o.z);
  // how high the palate and deep the floor may go: half of the snout above and the jaw below, along the middle line
  const NZ = 8, top = new Array(NZ).fill(-Infinity), bot = new Array(NZ).fill(Infinity), zb = z => clamp(Math.floor((z - zBack) / (zf - zBack + 1e-6) * NZ), 0, NZ - 1);
  { const hs = m.headSwap, Pp = hs ? hs.Q : m.geo.attributes.position.array, n = hs ? hs.d.n : FIG.meta.nV, skin = hs ? (i => hs.d.K[i] === 0) : (i => (m.dom[i] === FIG.jIdx.head || m.dom[i] === FIG.jIdx.jaw) && !FIG.eye[i]);
    // (along a strip down the middle wide enough to hold some of a decimated sculpt's underside in each stretch)
    for (let i = 0; i < n; i++) { const x = Pp[i * 3], y = Pp[i * 3 + 1], z = Pp[i * 3 + 2]; if (Math.abs(x) > .07 * h || z < zBack || z > zf || !skin(i)) continue;
      const b = zb(z); if (y > F.y && y < F.y + .45 * h) top[b] = Math.max(top[b], y); else if (y < F.y && y > F.chin - .15 * h) bot[b] = Math.min(bot[b], y); } }
  const hp = z => { const t = top[zb(z)]; return clamp(isFinite(t) ? .45 * (t - F.y) : .1 * h, 1.6 * gh, .12 * h); };
  const hf = z => { const b = bot[zb(z)]; return clamp(isFinite(b) ? .45 * (F.y - b) : .08 * h, 1.6 * gh, .1 * h); };
  // the bag: rings from the edge in (lip, gum crest, inner gum, palate) to the middle
  const D = [0, .45 * lt, lt, 1.8 * lt], FR = [.5, .78, 1], HU = [0, .6, 1, 1.15], NK = outl.length, NJ = D.length + FR.length;
  const parts = [], bag = (sd) => {
    const pos = [], si = [], sw = [], A = [], idx = [];
    for (const o of outl) {
      const {x: dx, z: dz} = into(o), r = Math.hypot(dx, dz) || 1e-6;
      for (let j = 0; j < NJ; j++) {
        const f = j < D.length ? Math.min(D[j] / r, .4) : FR[j - D.length], x = o.x + dx * f, z = o.z + dz * f;
        const y = F.y + sd * (j < D.length ? HU[j] * gh : (sd > 0 ? hp(z) : hf(z)) * [.75, .95, 1][j - D.length]);
        pos.push(x, y, z);
        // gums on the bone, the lip edge soft; behind the corners as the cheek outside it, which lies wider (the blend
        // across the line widens out there) and so swings down less: blended as sharply as the bag's own inner points
        // are, the lower back of the bag outran the cheek and stood out under the jaw's angle, a dark lump
        const w = o.open ? (j ? (sd > 0 ? 0 : 1) : jawWeight(F, x, F.y, z, sd < 0)) : jawWeight(F, F.xc + Math.max(F.zc - z, 0), y, z);
        si.push(JAW, HEAD, 0, 0); sw.push(w, 1 - w, 0, 0);
        furPack(A, A.length, 0, 0, 0, o.open ? (j < 2 ? 9 : j < D.length ? 7 : 8) : 9, sd > 0 ? 1 : 0);  // dark inner lip, gums, palate
      }
    }
    for (let k = 0; k < NK; k++) for (let j = 0; j < NJ - 1; j++) { const a = k * NJ + j, b = ((k + 1) % NK) * NJ + j; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    return mouthGeo(pos, idx, si, sw, A, new V3(0, -sd, 0));
  };
  parts.push({geo: bag(1)}, {geo: bag(-1)});
  // the inner faces of the lips, from the upper edge to the lower, stretched as the jaw opens and seen only from inside:
  // from the side the far one closes the mouth behind the tongue (a dark wall, not the sky through both openings)
  { const pos = [], si = [], sw = [], A = [], idx = [], NR = 4, ring = outl.slice(0, 2 * NS + 1);
    for (const o of ring) { const {x: dx, z: dz} = into(o), f = Math.min(.3 * lt / (Math.hypot(dx, dz) || 1e-6), .4);
      const wu = jawWeight(F, o.x, F.y, o.z, false), wl = jawWeight(F, o.x, F.y, o.z, true);
      for (let j = 0; j <= NR; j++) { const w = wu + (wl - wu) * j / NR; pos.push(o.x + dx * f, F.y + (.5 - j / NR) * gh, o.z + dz * f); si.push(JAW, HEAD, 0, 0); sw.push(w, 1 - w, 0, 0); furPack(A, A.length, 0, 0, 0, 9, 0); } }
    for (let k = 0; k < ring.length - 1; k++) for (let j = 0; j < NR; j++) { const a = k * (NR + 1) + j, b = a + NR + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    parts.push({geo: mouthGeo(pos, idx, si, sw, A, into)}); }
  // the dental arch: the gum crest along the open edge, per side from the front middle to the corner, set in square to
  // the edge (towards the corners the lips run back and out, and straight across would slide along them)
  const arch = (sd, side) => { const p = []; for (let k = 0; k <= NS; k++) { const i = NS + side * k, o = outl[i], a = outl[Math.max(i - 1, 0)], b = outl[Math.min(i + 1, 2 * NS)];
      const n = new V3(b.z - a.z, 0, a.x - b.x).normalize(), c = into(o); if (n.x * c.x + n.z * c.z < 0) n.negate();
      p.push(new V3(o.x + n.x * lt, F.y + sd * gh, o.z + n.z * lt)); } return p; };
  const at = (p, u) => { const L = [0]; for (let k = 1; k < p.length; k++) L.push(L[k - 1] + p[k].distanceTo(p[k - 1]));
    const s = u * L[L.length - 1]; let k = 1; while (k < p.length - 1 && L[k] < s) k++; const t = (s - L[k - 1]) / (L[k] - L[k - 1] || 1);
    return {p: p[k - 1].clone().lerp(p[k], t), T: p[k].clone().sub(p[k - 1]).setY(0).normalize(), len: L[L.length - 1]}; };
  // each tooth stands in from the lip edge by its own thickness (and its lean), so its outer face stays behind the lips
  // and inside the cheek, in profile as well as from the front; a ruminant has a toothless pad for upper incisors (the
  // animal's own recipe decides: a hybrid with a goat's head on a horse keeps its incisors). Packed rows (carnivores,
  // reptiles) are laid tooth after tooth from the middle, a sliver of gum between, and spread to fill the arch up to the
  // corner, the teeth grown with it: artists draw the row closed, a gappy row of small teeth read as a comb. Roots end in
  // the gum band, closed, so none shows above or below the lips.
  const sideLen = at(arch(1, 1), 1).len, f = clamp(sideLen / (.3 * h), F.M.fmin || .45, 1.1), teeth = [], laid = [], pad = (HEAD_RECIPES[m.body.species] || an.recipe || {}).pad, rt = .45 * gh;
  for (const [sd, list0] of [[1, F.M.up], [-1, F.M.lo]]) {
    // the row ends where, going back, the lips have only half parted (jawWeight's k): nearer the corner the cheek
    // stretches over the teeth from both jaws, and a tooth there stood out on the cheek above the lip margin as the jaw
    // opened (only going back: along a narrow mouth's sides, a horse's, the rows run on, the lips parting less)
    const ap = arch(sd, 1), S = .35 * Math.min(F.tip - F.zc, F.xc) + 1e-6; let k = 1; while (k < ap.length && sstep(0, S, ap[k].z - F.zc) > .5) k++;
    const list = list0.filter(([shape]) => !(pad && sd > 0 && (shape === 'i' || shape === 'f'))), room = Math.min(sideLen - .01 * h, at(ap.slice(0, Math.max(k, 2)), 1).len);
    // runs: teeth less than a fifth of the arch apart stand side by side; the gaps between runs stay (a cat's behind its
    // canine, a horse's bars, a rabbit's); a run that would reach the corner loses teeth from before its last (the
    // carnassial, the hindmost grinder stays; a short arch keeps a single cheek tooth rather than closing the bars), then
    // is narrowed, and only then moved forward
    const W = list.map(([shape, , , w0]) => (shape === 'f' || shape === 'm' ? 2.05 : 2.3) * w0 * h * f), runs = [], pos = [], sz = [], gr = []; let g = 1, end = 0;  // flat incisors and grinders close up
    list.forEach(([, u], k) => { if (!k || u - list[k - 1][1] > .2) runs.push([]); runs[runs.length - 1].push(k); });
    if (F.M.pack) g = clamp(room / W.reduce((a, b) => a + b, 0), .75, 1.3);
    for (const r of runs) { let T = r.reduce((a, k) => a + W[k] * g, 0); let s0 = list[r[0]][1] < .1 ? 0 : Math.max(end, list[r[0]][1] * room), q = 1;
      const R = s0 ? .85 * room : room;  // a back run stops short of the corner, where the jaw is too thin to hide it
      if (s0 + T > R) { while (r.length > 1 && s0 + .9 * T > R) T -= W[r.splice(-2, 1)[0]] * g; q = clamp((R - s0) / T, .6, 1); s0 = Math.max(end, Math.min(s0, R - T * q)); q = Math.min(q, (R - s0) / T); }
      for (const k of r) { sz[k] = g * q; gr[k] = g; pos[k] = s0 + W[k] * sz[k] / 2; s0 += W[k] * sz[k]; laid.push({up: sd > 0, s: list[k][0], u: pos[k] / sideLen, w: list[k][3] * h * f * sz[k] / sideLen}); } end = s0; }
    for (const side of [1, -1]) {
      const p = arch(sd, side), bone = sd > 0 ? HEAD : JAW, V = new V3(0, -sd, 0);
      // (a canine keeps its length when the end of a short row is squeezed in: the fang is what reads)
      list.forEach(([shape, , l0, w0], k) => { if (pos[k] === undefined) return;
        const len = l0 * h * f * (shape === 'c' ? Math.sqrt(gr[k]) : sz[k]), w = w0 * h * f * sz[k], {p: base, T} = at(p, pos[k] / sideLen), N = new V3(T.z, 0, -T.x).multiplyScalar(side);
        if (N.x * base.x + N.z * (base.z - Cz) < 0) N.negate();
        const lean = shape === 'i' || shape === 'f' ? .05 : shape === 'c' ? .08 : 0, dep = w * (shape === 'i' || shape === 'f' ? .6 : shape === 'p' || shape === 'k' ? .42 : .9);
        base.addScaledVector(N, -Math.max(0, dep + lean * len + .005 * h - lt));
        const ax = V.clone().addScaledVector(N, lean).normalize(), c = shape === 'c' ? .28 * len : shape === 'r' ? .32 * len : 0;
        // also where the edge comes to a point at the front (a dragon's tapering snout) or dents in where the snout's side
        // meets the corner of the mouth, the arch there lying nearer the edge than along the sides: moved in towards the
        // fan's centre behind the corners (back under a dent as well as in from the edge) until all of it is inside, its
        // root's footprint round (a cheek tooth's square, to its corners) and the point it curves back to along the arch
        const sq = shape === 'm' ? Math.SQRT2 : 1, fp = () => { let v = Math.min(inside(base.x, base.z) - dep, inside(base.x + T.x * c + N.x * lean * len, base.z + T.z * c + N.z * lean * len));
          for (let a = 0; a < 8; a++) { const k = a % 2 ? sq : 1, ct = Math.cos(a * Math.PI / 4) * w * k, cn = Math.sin(a * Math.PI / 4) * dep * k; v = Math.min(v, inside(base.x + T.x * ct + N.x * cn, base.z + T.z * ct + N.z * cn)); }
          return v; };
        for (let it = 0; it < 16 && fp() < .004 * h; it++) base.add(new V3(-base.x, 0, Cb - base.z).setLength(.3 * dep));
        // cones curve back to a point, incisors to a rounded peg (a horse's and a rabbit's to a straight chisel edge),
        // blades to a point; cheek teeth are square blocks with a flat grinding crown
        const secs = shape === 'c' || shape === 'r' ? [[0, w, w * .9], [len * .45, w * .74, w * .66, c * .2], [len * .8, w * .36, w * .32, c * .64], [len, .0008, .0008, c]]
          : shape === 'i' ? [[0, w, w * .6], [len * .6, w * .92, w * .5], [len * .9, w * .62, w * .32], [len, .0008, .0008]]
          : shape === 'f' ? [[0, w, w * .6], [len * .7, w * .98, w * .45], [len * .97, w * .94, w * .26], [len, .0008, .0008]]
          : shape === 'm' ? [[0, w, w * .9], [len * .9, w, w * .9], [len * .99, w * .9, w * .8], [len, .0008, .0008]]
          : [[0, w, w * .42], [len * .5, w * .55, w * .34], [len, .0008, .0008]];
        secs.unshift([-rt, .0008, .0008], [-.5 * rt, w * .8, secs[0][2] * .8]);
        teeth.push(loft({origin: base, axis: ax, side: T, secs, radial: 8, sub: 2, n: shape === 'm' ? 4 : 2, weights: () => [[bone, 1]]}));
      });
    }
  }
  for (const g of teeth) { const ln = g.attributes.aLine.array, A = new Float32Array(ln.length); for (let v = 0; v < ln.length; v += 4) { ln[v + 3] = -1; furPack(A, v, 0, 0, 0, 5, 0); } g.setAttribute('aEye', new THREE.BufferAttribute(A, 4)); }
  if (teeth.length) { const g = mergeLofts(teeth); g.userData.teeth = laid; parts.push({geo: g, hull: true}); }  // where each sits along its half arch (0 middle, 1 corner)
  // the tongue: from the throat to behind the lower front teeth, lying low between the rows with the floor showing round
  // it (as wide as the floor it covered the lower teeth and read as a slab), a rounded tip, a groove down the middle
  const lo = arch(-1, 1), zt1 = lo[0].z - 3 * lt, zt0 = zBack + .25 * (F.zc - zBack), half = z => { let x = lo[NS].x; for (let k = NS; k > 0; k--) if (lo[k].z <= z && lo[k - 1].z >= z) { const t = (z - lo[k].z) / (lo[k - 1].z - lo[k].z || 1); x = lo[k].x + (lo[k - 1].x - lo[k].x) * t; } return Math.max(Math.abs(x) - 1.2 * lt, .02 * h); };
  if (zt1 > zt0 + .04 * h) {
    const Lt = zt1 - zt0, th = .03 * h * f, wt = half(zt0 + .85 * Lt) * .72;
    const secs = [[-.6 * th, .0008, .0008]];  // the root closed, rounded off into the throat (open, its far end inked as a black ring)
    // raised where the floor is shallow (a thin chin), so its underside never shows through the jaw, and flattened there
    // (no thicker than .8 of the floor's room), so that raised it still lies under the lip line (a short stylised chin)
    const up = (t, b) => [Math.max(0, 1.2 * gh + th + b - .9 * hf(zt0 + Lt * t))], sec = (t, w, b) => { b = Math.min(b, .4 * hf(zt0 + Lt * t)); return [Lt * t, w, b, 0, ...up(t, b)]; };
    for (let k = 0; k <= 5; k++) { const t = k / 5 * .8; secs.push(sec(t, Math.min(half(zt0 + Lt * t) * .72, wt * 1.15), th)); }
    secs.push(sec(.9, wt * .9, th * .85), sec(.965, wt * .62, th * .6), [Lt, .001, .001, 0, ...up(1, 0)]);
    const g = loft({origin: new V3(0, F.y - 1.2 * gh - th, zt0), axis: new V3(0, 0, 1), side: new V3(1, 0, 0), secs, radial: 16, sub: 2, n: 2.4, weights: () => [[JAW, 1]],
      mod: ph => 1 - .38 * Math.exp(-(((ph - Math.PI) / .36) ** 2))});
    const ln = g.attributes.aLine.array, A = new Float32Array(ln.length); for (let v = 0; v < ln.length; v += 4) { ln[v + 3] = -1; furPack(A, v, 0, 0, 0, 6, 0); }
    g.setAttribute('aEye', new THREE.BufferAttribute(A, 4));
    // panting: the front half rises over the lower incisors and lolls out past the lip, hanging down from it (a morph the
    // expression turns on, so the jaw still carries it)
    const P = g.attributes.position.array, D = new Float32Array(P.length), zl = outl[NS].z, out = .06 * h * f;
    for (let i = 0; i < P.length; i += 3) { const t = clamp((P[i + 2] - zt0) / Lt, 0, 1), z = P[i + 2] + sstep(.25, 1, t) * (zl - zt1 + out), over = Math.max(0, z - zl);
      D[i + 1] = sstep(.3, .7, t) * (1.2 * gh + th + .03 * h * f) - 1.3 * over; D[i + 2] = z - P[i + 2] - .3 * over; }
    g.morphAttributes.position = [new THREE.BufferAttribute(D, 3)]; g.morphTargetsRelative = true; g.userData.tongue = true;
    parts.push({geo: g, hull: true});
  }
  return parts;
}
// a mouth surface from its arrays, its faces turned towards `face` (into the mouth): all of them one way, or each by
// itself when `face` is a function of the triangle's centre
function mouthGeo(pos, idx, si, sw, A, face) {
  const g = new THREE.BufferGeometry(), v = i => new V3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]), dot = t => { const a = v(idx[t]), b = v(idx[t + 1]), c = v(idx[t + 2]);
    return b.clone().sub(a).cross(c.clone().sub(a)).dot(typeof face === 'function' ? face(a.add(b).add(c).multiplyScalar(1 / 3)) : face); }, flip = t => { const x = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = x; };
  if (typeof face === 'function') { for (let t = 0; t < idx.length; t += 3) if (dot(t) < 0) flip(t); }
  else { let s = 0; for (let t = 0; t < idx.length; t += 3) s += dot(t); if (s < 0) for (let t = 0; t < idx.length; t += 3) flip(t); }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aLine', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 4).fill(-1), 4));
  g.setAttribute('aEye', new THREE.Float32BufferAttribute(A, 4)); g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setIndex(idx); g.computeVertexNormals(); g.boundingSphere = new THREE.Sphere(new V3(), 20);
  return g;
}
// the lip line for the shader (rest position, the body's units): its height, where the cut ends (z, half width) and the
// head height; the width is negative on a cut sculpt (its margin is found by the distance to the cut edge that aLip
// carries). The body's head is cut a little short of the corners, where the lips only begin to part (jawWeight's k): a
// triangle there reaches far above and below the line, and cut out whole it left a hole by each corner that the
// opening never filled, showing the inked back of the far cheek as a black flap
const lipLine = m => { const F = m.anthro && m.anthro.mouth; if (!F) return [0, 0, 0, 0]; const d = m.headSwap ? 0 : .15 * Math.min(F.tip - F.zc, F.xc);
  return [F.y, F.zc + d, F.h, m.headSwap ? -F.xc : F.xc - d]; };
// the mouth opens: lips part, the inside shows. Checked by every render of the scene (the view, renderView, exports),
// not by the animation loop, so a picture taken right after the jaw moves never shows lips apart over an empty mouth
scene.onBeforeRender = () => anthroTick();
function anthroTick() {
  for (const m of chars) {
    if (!m.joints || !m.joints.jaw) continue;
    const q = m.joints.jaw.quaternion, ang = 2 * Math.acos(Math.min(1, Math.abs(q.w))), open = !!(m.anthro && m.anthro.mouth) && ang > .05;
    // the panting tongue lolls only as far as the jaw is open (a jaw closed by hand after 'jadeo' draws it back in)
    for (const p of m.mouthMeshes || []) if (p.geometry.userData.tongue) p.morphTargetInfluences[0] = m.aexpr === 'jadeo' ? sstep(.15, .3, ang) : 0;
    m.geo.drawRange.count = open && m.anthro.pocket ? m.anthro.pocket : Infinity;
    if (open !== !!m.mouthOpen) { m.mouthOpen = open; if (m.lib.uMouth) m.lib.uMouth.value = open ? 1 : 0; for (const p of m.mouthMeshes || []) p.visible = open && m.formMode !== 'formas' && m.formMode !== 'esqueleto' && (!p.userData.hull || m.outlineOn !== false); }
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
  // the jaw opens by angle, so a long muzzle (a horse's) opens less and a short one (a kemono cat's) a little more, but
  // never so far that the front of the chin swings back into the throat under it (a kemono cat or rabbit: its short jaw
  // sits right over the neck; z' = A cos θ + B sin θ about the joint must stay in front of the throat). A canid's jaw,
  // from the joint to the nose (.7 head heights on the stylised heads), opens by the expression's own angle; a grazer's
  // or a rodent's gape is smaller than a carnivore's (MOUTHS: open)
  const F = m.anthro && m.anthro.mouth; let jaw = e.jaw * DEG;
  if (F) { jaw *= clamp(.7 * F.h / Math.max(F.tip - F.jz, .1 * F.h), .55, 1.1) * ((F.M && F.M.open) || 1);
    const A = (F.zc + F.tip) / 2 - F.jz, B = F.chin - F.jy, R = Math.hypot(A, B), c = F.nz + .06 * F.h - F.jz;
    jaw = Math.min(jaw, Math.max(.5 * jaw, Math.acos(clamp(c / R, -1, 1)) - Math.atan2(-B, A))); }
  const out = {jaw: [jaw, 0, 0]};
  // ears turn in their own frame (a: from the base to the tip): laid back towards the nape, drooped outwards and down,
  // twisted about themselves, so a horse's ears lying to the sides fold back like a wolf's upright ones do
  for (const [k, sd] of [['L', 1], ['R', -1]]) {
    const o = e.out * (e.tilt && sd < 0 ? .3 : 1), a = (m.anthro && m.anthro.earDir && m.anthro.earDir[k]) || new V3(0, 1, 0), ax = v => { const c = a.clone().cross(v); return c.lengthSq() > 1e-6 ? c.normalize() : new V3(-1, 0, 0); };
    const q = new Q().setFromAxisAngle(ax(new V3(0, 0, -1)), e.back * DEG).multiply(new Q().setFromAxisAngle(a, sd * e.twist * DEG)).multiply(new Q().setFromAxisAngle(ax(new V3(sd, -1, 0)), o * DEG));
    const r = new THREE.Euler().setFromQuaternion(q); out['ear' + k] = [r.x, r.y, r.z];
  }
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
  // a species without a sculpt of its own would have its MakeHuman head as the first choice
  const recipe = !mine.length && HEAD_RECIPES[own], first = recipe ? [['', SPECIES[mq.body.species].label]] : [];
  chips(box, [...first, ...[...mine, ...other].map(([k, c]) => [k, c.label])], id || '', v => {
    if (!v || (mine.length && v === mine[0][0])) { delete mq.body.headModel; delete mq.body.headStyle; } else { mq.body.headModel = v; mq.body.headStyle = HEAD_CATALOG[v].style; }
    rebuildActive(true); syncHeadUI(); pushHistory();
  });
  if (other.length) { const sep = document.createElement('span'); sep.className = 'famlbl'; sep.textContent = tr('Híbrido: la cabeza de otra especie'); box.insertBefore(sep, box.children[first.length + mine.length]); }
  box.parentElement.hidden = !all.length;
  const cr = $('#headCredit'); cr.innerHTML = '';
  // (the sculpted heads are our own; only a head without one, a human face's ears, comes from MakeHuman's community)
  if (!c) cr.textContent = tr(HEAD_CREDITS);
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
const PUPILS = {redonda: [0, .42, .42], rendija: [1, .12, .85], horizontal: [2, .6, .2]};
const IRIS = {humano: .5, real: .62, toon: .78, kemono: 1.0};
function eyeSetup(m, P) {
  const nV = FIG.meta.nV;
  if (!m.geo.attributes.aEye) m.geo.setAttribute('aEye', new THREE.BufferAttribute(new Float32Array(nV * 4), 4));
  // (a sculpted head draws its eyes in its own style, whatever the body's proportions round it: a stylised sculpt's big
  // eyes as a toon's)
  const hm = typeof headModelFor === 'function' && headModelFor(m.body), hc = hm && HEAD_CATALOG[hm];
  const A = m.geo.attributes.aEye.array, r = HEAD_RECIPES[headSp(m.body)], style = r ? ((hc && hc.eyeStyle) || m.body.headStyle || 'real') : 'humano';
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
  U.uIris.value = IRIS[style]; U.uShine.value = style === 'kemono' || style === 'toon' ? 1 : style === 'humano' ? 0 : .5;
  // (a toon's iris is drawn bigger, its round pupil not with it: the iris's colour shows round it)
  const pk = style === 'kemono' ? 1.15 : style === 'toon' && !pup[0] ? .72 : 1;
  U.uPupil.value.set(pup[0], pup[1] * pk, pup[2] * (pup[0] === 1 ? 1 : pk));
  applyEyeCol(m);
}
/* the iris's colour: the one chosen for the character (body.eyeCol), else its coat's (an animal's own: a husky's blue
   eyes, a cat's green), else amber on an animal and the eye's own colour on a person */
const EYE_COLORS = [['#5a3a22', 'Marrón'], ['#c98a2e', 'Ámbar'], ['#8a7a3a', 'Avellana'], ['#4f9a4a', 'Verde'], ['#3d86d8', 'Azul'], ['#8c9aa6', 'Gris'],
  ['#c8303c', 'Rojo'], ['#d65aa4', 'Rosa'], ['#7d52c8', 'Violeta'], ['#dcb22c', 'Dorado']];
for (const c of EYE_COLORS) c[1] = tr(c[1]);
function applyEyeCol(m) {
  const U = m.lib && m.lib.uEye; if (!U || !U.uEyeC) return;
  const c = typeof coatOf === 'function' ? coatOf(m.body) : null, hex = m.body.eyeCol || (c && c.eye);
  // (the colour times a little over one: it is mixed with the ink for the iris's shade)
  if (hex) { const n = parseInt(hex.slice(1), 16); U.uEyeC.value.set((n >> 16 & 255) / 212, (n >> 8 & 255) / 212, (n & 255) / 212); }
  else if (c) U.uEyeC.value.set(1.08, .8, .42); else U.uEyeC.value.set(1, 1, 1);
}
function setEyeCol(m, col) { if (col) m.body.eyeCol = col; else delete m.body.eyeCol; applyEyeCol(m); }
/* ---------- Body tab: the eyes' colour ---------- */
function renderEyeUI() {
  const sw = $('#eyeSw'); if (!sw) return;
  const col = mq.body.eyeCol || '';
  sw.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.c === col)));
  const c = typeof coatOf === 'function' ? coatOf(mq.body) : null; $('#eyeColor').value = col || (c && c.eye) || (c ? '#c98a2e' : '#6b5a4a');
}
function buildEyeUI() {
  const sw = $('#eyeSw'); if (!sw) return; sw.innerHTML = '';
  for (const [c, name] of [['', tr('Natural')], ...EYE_COLORS]) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.c = c; b.title = name; b.setAttribute('aria-label', name);
    if (c) b.style.background = c; else b.className = 'orig';
    b.onclick = () => { setEyeCol(mq, c); renderEyeUI(); pushHistory(); };
    sw.appendChild(b);
  }
  const inp = $('#eyeColor');
  inp.oninput = () => { setEyeCol(mq, inp.value); sw.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', 'false')); };
  inp.onchange = pushHistory;
  renderEyeUI();
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
   - bears are plantigrade: the human sole stays on the ground, broader (a bear's heel is nearly as wide as its ball,
     a human's two thirds of it), ending in a low dome behind five toes. */
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
  urs: {w: .4, n: 5, x: .4, reach: [.2, .3], tw: .12, tt: .13, claw: [.2, .06, -.4], bean: [.1, .075], pad: [.34, .5], mitt: .1},
  rep: {w: .36, n: 3, x: .3, reach: [.5, .64], tw: .115, tt: .16, claw: [.26, .065, -.9], bean: [.07, .1], pad: [.2, .16], mitt: .24, dew: 1, knuckles: 1},
  lep: {w: .32, n: 4, x: .24, reach: [.36, .44], tw: .13, tt: .14, claw: 0, bean: 0, pad: 0, mitt: .2, slim: .15},
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
// the neighbours of each vertex the ankle carries, and of the shin's skin just above it (whose front the metatarsus' is
// laid against) (the mesh's topology never changes: worked out once)
function footNb(ai) {
  const key = 'nb' + ai; if (FIG[key]) return FIG[key];
  const nV = FIG.meta.nV, I = FIG.index, on = new Uint8Array(nV), sets = new Map(), ki = FIG.meta.parents[ai], top = FIG.j0[ai * 3 + 1] + .05;
  for (let i = 0; i < nV; i++) for (let k = 0; k < 4; k++) if (FIG.sw[i * 4 + k] && (FIG.si[i * 4 + k] === ai || FIG.si[i * 4 + k] === ki && FIG.base[i * 3 + 1] < top)) on[i] = 1;
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
    const dg = rot ? 1 : 0, sl = K.slim ?? 1, Wm = q => W * (.235 - .03 * q), Dm = q => W * (.155 - .02 * q), Dj = .25 * W, hA = band(A.z)[3];
    const shape = (x, y, z, w, out) => {
      const q = clamp((z - A.z) / (zBall - A.z), 0, 1), [bxc, bhw, bym, bhh] = band(clamp(z, z0, zBall)), f = sl * sstep(0, .1, q);
      const kx = dg ? (z < A.z ? 1 - .3 * sstep(A.z, z0, z) : 1 + f * (Wm(q) / bhw - 1)) : 1.75 - .4 * q;
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
    // it (the metatarsus a cone from the side); below the hock knob every section is laid on the shaft's ellipse (Wm
    // across, Dm along n) about the line from the joint to the ball. In front the skin is laid on it from the joint down,
    // and drawn in above it to a front that eases from the shin's into the shaft's (the front of the hock a clean bend,
    // not the half-bent ankle's bulge nor a groove under it); behind, from the knob's end: the calcaneus a short knob,
    // its back in line with the Achilles tendon, about a seventh of the metatarsus, over an even shaft
    if (dg) { const ax = Bc.clone().sub(A), La = ax.length(), e = new V3(); ax.multiplyScalar(1 / La); const nx = new V3(0, ax.z, -ax.y);
      for (const i of ids) { if (ws[i] < 0) continue; e.set(P[i * 3] - A.x, P[i * 3 + 1] - A.y, P[i * 3 + 2] - A.z); const t = e.dot(ax) / La, a = e.x - ax.x * e.dot(ax), b = e.dot(nx);
        const r = Math.hypot(a / Wm(t), b / (Dm(t) * (b > 0 ? 1 + .9 * sstep(.08, -.1, t) : 1))) || 1, fr = b > 0 && (t > .06 || r > 1) ? sstep(-.12, -.02, t) : r > 1 ? sstep(.06, .14, t) : 0;
        const k = sl * (1 - sstep(.97, 1.03, t)) * Math.max(Math.min(1, 2 * ws[i]) * sstep(.05, .14, t), fr * (1 - sstep(.3, .5, t))); if (k < .005) continue;
        const f = 1 + k * (1 / r - 1); ws[i] = Math.max(ws[i], k); P[i * 3] += a * (f - 1); P[i * 3 + 1] += nx.y * b * (f - 1); P[i * 3 + 2] += nx.z * b * (f - 1); } }
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
      // below shows (pawsUnderHem). Gathered, the cloth lies on the skin: each helper under the hem is laid round the
      // leg's section at the hem (by its angle about the section's middle), a little out from the skin and more so the
      // lower it came from (the folds pile up), and those just above it are drawn in towards it, so the cuff stays one
      // tube on the leg and no shard of the human foot's cloth (which stood well in front of the metatarsus) sticks out
      if (dg) { const hy = hemY(A.y, g), NR = 24, R = new Float32Array(NR); let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        const ring = ids.filter(i => Math.abs(P[i * 3 + 1] - hy) < .01); for (const i of ring) { x0 = Math.min(x0, P[i * 3]); x1 = Math.max(x1, P[i * 3]); z0 = Math.min(z0, P[i * 3 + 2]); z1 = Math.max(z1, P[i * 3 + 2]); }
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, bin = (x, z) => (Math.round((Math.atan2(z - cz, x - cx) / Math.PI + 1) * NR / 2) % NR);
        for (const i of ring) { const k = bin(P[i * 3], P[i * 3 + 2]); R[k] = Math.max(R[k], Math.hypot(P[i * 3] - cx, P[i * 3 + 2] - cz)); }
        for (let p = 0; p < 2; p++) for (let k = 0; k < NR; k++) if (!R[k]) R[k] = Math.max(R[(k + 1) % NR], R[(k + NR - 1) % NR]);
        if (ring.length) for (const h of hv) { const y = H[h * 3 + 1], u = sstep(hy + .04, hy, y); if (!u) continue;
          const yn = y < hy ? hy - (hy - y) * .12 : y, x = H[h * 3], z = H[h * 3 + 2], r = Math.hypot(x - cx, z - cz) || 1e-4, rs = R[bin(x, z)] + .005 + .2 * (hy - yn);
          const f = 1 + u * ((y < hy ? rs : Math.min(r, rs + .03 * (y - hy) / .04)) / r - 1); H[h * 3] = cx + (x - cx) * f; H[h * 3 + 1] = yn; H[h * 3 + 2] = cz + (z - cz) * f; } }
    }
    // the toe point (feet planted, IK, and the frame footGeos reads)
    const ti = FIG.jIdx['toe' + s]; J[ti * 3] = T.x; J[ti * 3 + 1] = T.y; J[ti * 3 + 2] = T.z;
  }
}
/* Kneeling on an animal leg: the poses are a human's, whose foot, at right angles to the shin, puts its toes on the floor
   behind a knee that is down. A digitigrade or ungulate foot goes on from the shin nearly in line with it, and the
   shin, sloping back to the hock at rest, rises steeply from a knee bent as a human's: the metatarsus would stick out
   behind in the air, the paw dangling, and the leg that stands (a long metatarsus under its shin) would hold the
   kneeling knee off the floor. As anthro artists draw it (and as a dog or a horse folds its hind leg), a kneeling leg
   (the pose bends its knee past 75° under a thigh within 40° of upright, the knee lower than its hock and than the
   other knee: one knee or both down, on all fours; not a run's or a hurdle's trailing leg) lays its shin low (rising
   at most 20°), the hips come down until its knee is on the floor (the standing leg bends more, its paw kept where it
   was), and the hock bends the least way that brings the paw's toe point down to the floor behind the knee: the paw
   stands on its toes. */
function kneelPaws(m) {
  const L = legSpec(m.body); if (!L || L.type === 'planti' || !m.J) return;
  const jw = n => m.joints[n].getWorldPosition(new V3()), sc = m.group.getWorldScale(new V3()).y, q = new Q(), J = m.joints, kneel = [], stand = [];
  // (a sculpted hind paw's own toe point where it has one: its toes reach well past the rig's, 11b-parts)
  const toeOff = s => { const ai = FIG.jIdx['ankle' + s], ti = FIG.jIdx['toe' + s], T = m.pawToe && m.pawToe[s]; return new V3((T ? T.x : m.J[ti * 3]) - m.J[ai * 3], (T ? T.y : m.J[ti * 3 + 1]) - m.J[ai * 3 + 1], (T ? T.z : m.J[ti * 3 + 2]) - m.J[ai * 3 + 2]).multiplyScalar(sc); };
  const toeW = s => { J['ankle' + s].getWorldQuaternion(q); return jw('ankle' + s).add(toeOff(s).applyQuaternion(q)); };
  for (const s of ['L', 'R']) {
    if (m.stumps && m.stumps['leg' + s]) continue;
    const kp = jw('knee' + s), ap = jw('ankle' + s), o = jw('knee' + (s === 'L' ? 'R' : 'L')), th = kp.clone().sub(jw('hip' + s)).normalize();
    (J['knee' + s].rotation.x > 75 * DEG && th.y < -Math.cos(40 * DEG) && ap.y > kp.y && kp.y < o.y + .05 * sc ? kneel : stand).push(s);
  }
  if (!kneel.length) return;
  const knee = Math.max(.045, m.kneeR || 0) * sc, W = pawFrame(L, m.J, 'R').W * sc;
  for (const s of kneel) {
    // the shin laid low: the knee unbent until the hock is at most 20° up from it
    const K = J['knee' + s], kp = jw('knee' + s), rise = () => { const d = jw('ankle' + s).sub(kp); return Math.atan2(d.y, Math.hypot(d.x, d.z)); };
    for (let k = 0; k < 3 && rise() > 20 * DEG; k++) { K.rotation.x = Math.max(0, K.rotation.x - (rise() - 20 * DEG)); K.updateMatrixWorld(true); }
  }
  if (stand.length) {
    // the hips down until the kneeling knee is on the floor the standing paw is on
    const floor = Math.min(...stand.map(s => toeW(s).y - .1 * W)), d = Math.min(...kneel.map(s => jw('knee' + s).y)) - knee - floor;
    if (d > 0) { const keep = stand.map(s => [s, jw('ankle' + s), J['ankle' + s].getWorldQuaternion(new Q())]);
      J.hips.position.y -= d / sc; m.group.updateMatrixWorld(true);
      for (const [s, p, wq] of keep) { solveIK(m.chains['foot' + s], J['ankle' + s], p, 30); const A = J['ankle' + s]; A.parent.getWorldQuaternion(q); A.quaternion.copy(q.invert().multiply(wq)); A.updateMatrixWorld(true); } }
  }
  for (const s of kneel) {
    const A = J['ankle' + s], x0 = A.rotation.x, floor = jw('knee' + s).y - knee + .1 * W, toeY = a => { A.rotation.x = x0 + a; A.updateMatrixWorld(true); return toeW(s).y - floor; };
    // (a sculpted paw, longer than the rig's toes, can reach through the floor instead: it is turned back up onto it)
    const y0 = toeY(0), up = y0 < -.004 * sc; if (y0 <= 0 && !up) { toeY(0); continue; }
    // the nearest turn either way that brings it down (or up), then bisected
    let best = null;
    for (const dir of [1, -1]) for (let a = 5 * DEG; a <= 150 * DEG; a += 5 * DEG) if ((toeY(dir * a) <= 0) !== up) { if (!best || a < Math.abs(best[1])) best = [dir * (a - 5 * DEG), dir * a]; break; }
    if (!best) { toeY(0); continue; }
    let [lo, hi] = best; for (let k = 0; k < 12; k++) { const mid = (lo + hi) / 2; if ((toeY(mid) > 0) !== up) lo = mid; else hi = mid; }
    toeY(hi);
  }
  m.group.updateMatrixWorld(true);
}
/* ---------- paw-hands (researched) ----------
   Anthro hands in furry art are paws that can still hold things: fingers shorter and much thicker than a human's,
   ending in rounded tips with pads and claws (canids, felids, bears, rabbits); ungulates get "hoof-hands", the
   fingers pressed together, short, capped with keratin; dragons keep long fingers with heavy claws. The rest hand is
   reshaped like the legs: every finger's joints move to their new place and each vertex follows the bones it is
   skinned to (shorter along the bone, fatter around it), so the hand still curls, spreads and holds as before.
   What makes them read as paws in the construction sheets artists draw from (and in the animals):
   - each finger a row of rounded blocks: the joints show as knuckles on the back and as creases between the
     segments on the palm side, and the finger thins a little to its tip;
   - the pads, raised leather cushions set into the fur: a digital pad under the last segment of every finger and
     the thumb (the "toe beans"); the big metacarpal pad in the palm, in dogs a heart with its point to the fingers
     and in cats trilobed toward the wrist, a wide transverse bean in bears; the small carpal pad high on the heel of
     the hand on the little finger's side (Miller's Anatomy of the Dog; feline and ursid paw anatomy). Reptiles have
     a scale-pad under each segment instead;
   - the claws grow out of the end of the last segment, as wide as the tip where they leave the skin, which hoods
     them, and curve down along the finger: short and blunt in dogs (worn by walking), narrow, sharp and hooked in
     cats (kept sharp in their sheaths), long, heavy and only gently curved in bears (digging), long hooked talons in
     dragons;
   - hoof-hands: the fingers held together as one digit (horse) or two (goat, deer), each ending in a hoof: a keratin
     wall that flares from the coronet to the bearing edge and runs higher in front than at the heels, with a flat sole.
   A clawed hand cannot close into a human fist: the last segment would drive its claw through the palm. It closes as
   a paw does, the last segments only a little bent, so the fist is the rounded knot of a paw with the pads to the
   palm and the claws resting on it (and a hoof-hand hardly closes at all).
   len, thumb: finger and thumb length; r: girth, losing tp of it to the tip (the thumb thickens only toward its end,
   so its root does not swell over the palm); sq: fingers drawn together (1 apart) and cv: turned to run side by side
   (a hoof's digit, straightened); kn: how much the knuckles show; curl, tcurl: the fingers' and the
   thumb's joints in a full fist (degrees). */
const HAND_SHAPES = {
  zarpa:  {len: .64, thumb: .72, r: 1.5, tp: .16, sq: 1, kn: 1.1, curl: [65, 55, 10], tcurl: [45, 40, 15]},
  pezuna: {len: .56, thumb: .5, r: 1.3, tp: .04, sq: .45, cv: .85, kn: .4, curl: [40, 8, 3], tcurl: [40, 30, 10]},
  garra:  {len: 1.04, thumb: 1, r: 1.02, tp: .2, sq: 1, kn: 1.2, curl: [65, 55, 10], tcurl: [45, 40, 15]}
};
function handShape(b) {
  if (!b || b.species === 'humano' || b.paws === 'humanas') return null;
  const k = legSp(b), L = ANIMAL_LEGS[k]; if (!L) return null;
  return HAND_SHAPES[L.type === 'ungu' ? 'pezuna' : k === 'dragon' ? 'garra' : 'zarpa'];
}
// whose pads and claws: dogs and most others, cats, bears, reptiles
const pawKind = b => { const k = legSp(b); return /^(gato|tigre|leon)$/.test(k) ? 'fel' : k === 'oso' ? 'oso' : k === 'dragon' ? 'rep' : 'can'; };
// the hand's frame from its joints: n out of the palm (as computeHandAxes), along to the middle knuckle, across to the index
function handFrame(J, s) {
  const jv = n => new V3(J[FIG.jIdx[n] * 3], J[FIG.jIdx[n] * 3 + 1], J[FIG.jIdx[n] * 3 + 2]), w = jv('wrist' + s), mid = jv(`f${s}20`);
  const n = new V3().crossVectors(jv(`f${s}10`).sub(w), jv(`f${s}40`).sub(w)).normalize(); if (n.x * (s === 'L' ? 1 : -1) > 0) n.negate();
  // an orthonormal frame on the palm (the knuckle row is oblique to the hand's length)
  const along = mid.clone().sub(w), plen = along.length(); along.addScaledVector(n, -along.dot(n)).normalize();
  const across = jv(`f${s}10`).sub(jv(`f${s}40`)), width = across.length(); across.addScaledVector(n, -across.dot(n)).addScaledVector(along, -across.dot(along)).normalize();
  // a finger segment: its joint, direction, length and palm side (the thumb's palm side faces the ring finger, as it curls)
  const seg = (f, k) => { const a = jv(`f${s}${f}${k}`), d = (k < 2 ? jv(`f${s}${f}${k + 1}`) : jv(`tip${s}${f}`)).sub(a), len = d.length(); d.normalize();
    const p = f ? n.clone() : jv(`f${s}30`).sub(jv(`f${s}00`)).normalize().add(n).normalize(); p.addScaledVector(d, -p.dot(d)).normalize();
    return {f, a, d, len, p, lat: new V3().crossVectors(d, p)}; };
  return {w, n, along, across, width, plen, seg};
}
// the body's vertices of each hand (any weight on the wrist or a finger) and the bone each mostly follows; its triangles,
// filed by the bone of their first vertex; the finger tips' skin; the helper points on the hand
const HAND_V = {};
function handVerts(s) {
  if (HAND_V[s]) return HAND_V[s];
  const bones = new Set(['wrist' + s, ...[0, 1, 2, 3, 4].flatMap(f => [0, 1, 2].map(k => `f${s}${f}${k}`))].map(n => FIG.jIdx[n])), idx = [], dom = new Int16Array(FIG.meta.nV).fill(-1);
  for (let i = 0; i < FIG.meta.nV; i++) { let b = -1, bw = 0, on = false; for (let k = 0; k < 4; k++) { const w = FIG.sw[i * 4 + k]; if (w && bones.has(FIG.si[i * 4 + k])) on = true; if (w > bw) { bw = w; b = FIG.si[i * 4 + k]; } } if (on) { idx.push(i); dom[i] = b; } }
  const byBone = {}; for (let t = 0, I = FIG.index; t < I.length; t += 3) if (dom[I[t]] >= 0 && dom[I[t + 1]] >= 0 && dom[I[t + 2]] >= 0) (byBone[dom[I[t]]] = byBone[dom[I[t]]] || []).push(t);
  for (const k in byBone) byBone[k] = Int32Array.from(byBone[k]);
  // the skin a claw or hoof grows from: the vertex of each finger's last segment furthest along it (at rest)
  const J = FIG.j0, tips = [0, 1, 2, 3, 4].map(f => { const b = FIG.jIdx[`f${s}${f}2`], t = FIG.jIdx[`tip${s}${f}`]; let bi = idx[0], bd = -Infinity;
    for (const i of idx) if (dom[i] === b) { const d = (FIG.base[i * 3] - J[b * 3]) * (J[t * 3] - J[b * 3]) + (FIG.base[i * 3 + 1] - J[b * 3 + 1]) * (J[t * 3 + 1] - J[b * 3 + 1]) + (FIG.base[i * 3 + 2] - J[b * 3 + 2]) * (J[t * 3 + 2] - J[b * 3 + 2]); if (d > bd) { bd = d; bi = i; } }
    return bi; });
  // and the clothes' helper points that follow the hand
  const hidx = []; for (let i = 0; i < FIG.nH; i++) for (let k = 0; k < 4; k++) if (FIG.hsw[i * 4 + k] && bones.has(FIG.hsi[i * 4 + k])) { hidx.push(i); break; }
  // each hand vertex's neighbours along the mesh's edges (as positions in idx, packed: nb[no[c]..no[c + 1]]), to smooth the relief
  const at = new Int32Array(FIG.meta.nV).fill(-1); idx.forEach((i, c) => at[i] = c); const sets = idx.map(() => new Set());
  for (let t = 0, I = FIG.index; t < I.length; t += 3) for (let k = 0; k < 3; k++) { const a = at[I[t + k]], b = at[I[t + (k + 1) % 3]]; if (a >= 0 && b >= 0) { sets[a].add(b); sets[b].add(a); } }
  const no = new Int32Array(idx.length + 1); sets.forEach((x, c) => no[c + 1] = no[c] + x.size); const nb = new Int32Array(no[idx.length]); sets.forEach((x, c) => nb.set([...x], no[c]));
  return (HAND_V[s] = {idx: Int32Array.from(idx), dom, byBone, tips, hidx: Int32Array.from(hidx), nb, no});
}
// the size of every finger segment: half its width g (at its sides, where neither knuckles nor pads reach), and how far
// its skin reaches from the bone to the back (dor) and to the palm (pal)
function fingerGirth(P, F, s) {
  const {idx, dom} = handVerts(s), G = {}, segs = {}, v = new V3();
  for (let f = 0; f < 5; f++) for (let k = 0; k < 3; k++) { segs[FIG.jIdx[`f${s}${f}${k}`]] = [`${f}${k}`, F.seg(f, k)]; G[`${f}${k}`] = {g: 0, dor: 0, pal: 0}; }
  for (const i of idx) {
    const S = segs[dom[i]]; if (!S) continue; const q = S[1], o = G[S[0]]; v.set(P[i * 3] - q.a.x, P[i * 3 + 1] - q.a.y, P[i * 3 + 2] - q.a.z);
    const t = v.dot(q.d) / q.len; if (t < .15 || t > .85) continue; const lt = Math.abs(v.dot(q.lat)), pn = v.dot(q.p);
    if (Math.abs(pn) < .4 * lt) o.g = Math.max(o.g, lt); o.dor = Math.max(o.dor, -pn); o.pal = Math.max(o.pal, pn);
  }
  for (const k in G) if (!G[k].g) G[k] = {g: .008, dor: .004, pal: .008};  // (a segment without skin of its own)
  return G;
}
/* where the pads go on a paw-hand (rest pose): c on the bone or in the palm's middle, u along (to the tip), v across, n out
   of the skin; a, b half length and width; h how far it stands out; lob: lobes toward the wrist; pt: a point to the
   fingers; bones: the skin it lies on (a finger's own; the palm's, the thumb's root and the wrist's). The pads are raised
   in the skin (handRelief) and laid on it in leather (handGeos). */
function handPads(b, F, G, s) {
  const K = pawKind(b), out = [], bones = n => FIG.jIdx[n];
  const fingers = K === 'oso' || K === 'rep' ? [0, 1, 2, 3, 4] : [1, 2, 3, 4, 0];
  for (const f of fingers) for (const k of K === 'rep' && f ? [1, 2] : [2]) {
    const q = F.seg(f, k), g = G[`${f}${k}`].g, last = k === 2;
    // the bean under the last segment, toward its tip; a dragon's scale-pads are transverse plates, one under each segment
    const A = q.len * (K === 'rep' ? .22 : K === 'fel' ? .36 : .38) * (f ? 1 : .9), B = g * (K === 'oso' ? .84 : K === 'rep' ? 1 : .76) * (f ? 1 : .85);
    out.push({c: q.a.clone().addScaledVector(q.d, q.len * (last ? .48 : .5)), u: q.d, v: q.lat, n: q.p, a: A, b: B, h: g * (last ? .3 : .2), lob: 0, pt: 0, se: K === 'rep' ? 4 : 2, bones: [`f${s}${f}${k}`, `f${s}${f}${k - 1}`, ...(last ? [] : [`f${s}${f}2`])].map(bones)});
  }
  // the palm pad, under the middle and ring fingers' knuckles; the carpal pad on the heel of the hand, little finger's
  // side, clear of the wrist's ruff; a dragon's palm has no pad but a few broad transverse scales across it
  const palmBones = ['wrist' + s, 'elbow' + s, `f${s}01`, ...[0, 1, 2, 3, 4].map(f => `f${s}${f}0`)].map(bones), at = (x, y) => F.w.clone().addScaledVector(F.along, F.plen * x).addScaledVector(F.across, -F.width * y);
  const flat = {u: F.along, v: F.across, n: F.n, lob: 0, pt: 0, bones: palmBones, palm: true};
  if (K === 'rep') for (const x of [.42, .6, .78]) out.push({...flat, c: at(x, .08), a: F.plen * .055, b: F.width * (.2 + .15 * x), h: F.plen * .025, se: 4});
  else {
    const palm = {can: [.16, .42, .26, .3], fel: [.155, .4, .34, 0], oso: [.16, .5, 0, -.55, .35]}[K];
    out.push({...flat, c: at(.68, .1), a: F.plen * palm[0], b: F.width * palm[1], h: F.plen * .045, lob: palm[2], pt: palm[3], sk: palm[4]});
    out.push({...flat, c: at(.3, .17), a: F.plen * .065, b: F.width * .12, h: F.plen * .03});
  }
  return out;
}
// a pad's outline as a radius at angle th (0 toward the fingers): two notches on the wrist side part it into three
// lobes (deep in cats, shallower in dogs, whose pad is a heart); a point to the front (dogs), or a dent there (the
// bear's transverse kidney, its little-finger side fuller: sk); se > 2 squares the oval off (a scale's rounded rectangle)
const padR = (p, th) => { const b = Math.atan2(Math.sin(th), -Math.cos(th)), notch = x => Math.exp(-(((b - x) / .17) ** 2)), c = Math.cos(th), sn = Math.sin(th), e = p.se || 2;
  return (1 + p.pt * Math.max(0, c) ** (p.pt < 0 ? 8 : 4) * (1 + (p.sk || 0) * sn) - p.lob * (notch(.45) + notch(-.45))) / (Math.abs(c) ** e + Math.abs(sn) ** e) ** (1 / e); };
/* the relief of a paw-hand: a knuckle over each joint and the pads raised in the skin. The drawings block a knuckle in
   as one clean rounded bump on the back of the finger (no creases: the pads already part the segments on the palm side),
   so each is a broad, low swelling, wide along the bone (most of a girth, but no more than about a third of the shorter
   segment it joins, so the segment's middle stays lower and the knuckle reads) and faded smoothly round the finger's
   sides; the mesh's edges are about half a finger's half width, so anything narrower falls between its vertices as facets.
   The displacement is then relaxed over the mesh (Laplacian, on the offsets, not the shape) to keep it smooth.
   F, G: the hand's frame and finger girths (fingerGirth), from the remodelled rest shape before the relief. */
function handRelief(b, S, P, J, s, F, G) {
  const {idx, nb, no} = handVerts(s), n = idx.length, D = new Float32Array(n * 3), kn = [], v = new V3(), r = new V3(), o = new V3();
  for (let f = 0; f < 5; f++) for (let j = f ? 0 : 1; j < 3; j++) { const q = F.seg(f, j), g = G[`${f}${j}`].g, sh = j ? Math.min(q.len, F.seg(f, j - 1).len) : q.len;
    kn.push({q, g, A: [.13, .1, .07][j] * g * S.kn, sg: Math.min([.9, .8, .7][j] * g, .36 * sh)}); }
  const pads = padsOn(b) && S !== HAND_SHAPES.pezuna ? handPads(b, F, G, s) : [];
  for (let c = 0; c < n; c++) {
    const i = idx[c]; o.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); v.set(0, 0, 0);
    for (const K of kn) {
      r.subVectors(o, K.q.a); const t = r.dot(K.q.d); if (t < -2.5 * K.sg || t > 2.5 * K.sg) continue;
      r.addScaledVector(K.q.d, -t); const rl = r.length(); if (rl < 1e-6 || rl > 2 * K.g) continue;
      v.addScaledVector(r, K.A * sstep(0, .6, -r.dot(K.q.p) / rl) * Math.exp(-(t * t) / (K.sg * K.sg)) * (1 - sstep(1.4 * K.g, 2 * K.g, rl)) / rl);
    }
    for (const p of pads) {
      r.subVectors(o, p.c); const x = r.dot(p.u) / p.a, y = r.dot(p.v) / p.b; if (x * x + y * y > 2.2) continue;
      const h = r.dot(p.n), rho = Math.hypot(x, y) / padR(p, Math.atan2(y, x)); if (h <= 0 || rho >= 1) continue;
      // only the skin that faces out of the palm (a finger's: measured round its bone), so the back and sides stay put
      const rr = p.palm ? r.length() : Math.sqrt(Math.max(1e-12, r.lengthSq() - r.dot(p.u) ** 2));
      v.addScaledVector(p.n, p.h * (1 - rho * rho * rho) * sstep(.15, .6, h / rr));
    }
    D[c * 3] = v.x; D[c * 3 + 1] = v.y; D[c * 3 + 2] = v.z;
  }
  // two passes of relaxation: each offset halfway to its neighbours' mean
  for (let it = 0; it < 2; it++) { const E = D.slice(); for (let c = 0; c < n; c++) { const k0 = no[c], k1 = no[c + 1]; if (k1 === k0) continue;
    for (let a = 0; a < 3; a++) { let m = 0; for (let k = k0; k < k1; k++) m += E[nb[k] * 3 + a]; D[c * 3 + a] = .5 * E[c * 3 + a] + .5 * m / (k1 - k0); } } }
  for (let c = 0; c < n; c++) { const i = idx[c] * 3; P[i] += D[c * 3]; P[i + 1] += D[c * 3 + 1]; P[i + 2] += D[c * 3 + 2]; }
}
// returns each hand's finger girths (fingerGirth), kept on the figure (handGirth) for its claws and pads
function remodelHands(b, P, J, H) {
  const S = handShape(b), girth = {}; if (!S) return null;
  // hoof-hands: the fingers drawn together onto the middle of their digit (one for a horse, two for goats and deer)
  const hoof = S === HAND_SHAPES.pezuna && ANIMAL_LEGS[legSp(b)].hoof, groups = hoof === 'single' ? [[1, 2, 3, 4]] : hoof ? [[1, 2], [3, 4]] : null;
  const jv = n => new V3(J[FIG.jIdx[n] * 3], J[FIG.jIdx[n] * 3 + 1], J[FIG.jIdx[n] * 3 + 2]);
  for (const s of ['L', 'R']) {
    const seg = new Map();
    // each digit's line (from the rest joints, before any finger moves): a cloven hoof's two halves lie close, side by side,
    // their flat inner walls nearly touching along the cleft, and each half's two fingers drawn almost wholly onto it, so
    // no skin shows in the cleft between them
    const dirOf = g => g.reduce((a, f) => a.add(jv(`tip${s}${f}`).sub(jv(`f${s}${f}0`)).normalize()), new V3()).normalize(), ctrOf = g => g.reduce((a, f) => a.add(jv(`f${s}${f}0`)), new V3()).multiplyScalar(1 / g.length);
    const line = groups && groups.map(g => groups.length > 1 ? [dirOf(g).lerp(dirOf([1, 2, 3, 4]), .9).normalize(), ctrOf(g).lerp(ctrOf([1, 2, 3, 4]), .75)] : [dirOf(g), ctrOf(g)]);
    for (let f = 0; f < 5; f++) {
      const names = [`f${s}${f}0`, `f${s}${f}1`, `f${s}${f}2`, `tip${s}${f}`], p = names.map(jv), k = f === 0 ? S.thumb : S.len, gi = groups ? groups.findIndex(g => g.includes(f)) : -1;
      const gd = gi >= 0 && line[gi][0], n = [gi >= 0 ? p[0].clone().lerp(line[gi][1], 1 - S.sq * (hoof === 'single' ? .5 : .3)) : p[0].clone()];
      for (let i = 0; i < 3; i++) {
        const d = p[i + 1].clone().sub(p[i]), l = d.length() * k; d.normalize(); const nd = gd ? d.clone().lerp(gd, S.cv).normalize() : d;
        n.push(n[i].clone().addScaledVector(nd, l));
        seg.set(FIG.jIdx[names[i]], {o: p[i], n: n[i], d, nd, q: gd && new Q().setFromUnitVectors(d, nd), k, r: f ? S.r * (1 - S.tp * i / 2) : 1 + (S.r - 1) * [.3, .5, .85][i]});
      }
      names.forEach((nm, i) => { const j = FIG.jIdx[nm] * 3; J[j] = n[i].x; J[j + 1] = n[i].y; J[j + 2] = n[i].z; });
    }
    const v = new V3(), out = new V3(), loc = new V3(), rad = new V3();
    // the points that have a hand bone (the body's or the helpers')
    const apply = (Q, list, si, sw) => {
      for (let c = 0; c < list.length; c++) {
        const i = list[c]; let wf = 0; for (let k = 0; k < 4; k++) if (seg.has(si[i * 4 + k])) wf += sw[i * 4 + k] / 255; if (wf < .01) continue;
        v.set(Q[i * 3], Q[i * 3 + 1], Q[i * 3 + 2]); out.set(0, 0, 0); let wt = 0;
        for (let k = 0; k < 4; k++) {
          const w = sw[i * 4 + k] / 255; if (!w) continue; const g = seg.get(si[i * 4 + k]);
          if (!g) { out.addScaledVector(v, w); wt += w; continue; }
          loc.subVectors(v, g.o); const al = loc.dot(g.d); rad.copy(loc).addScaledVector(g.d, -al); if (g.q) rad.applyQuaternion(g.q);
          out.addScaledVector(g.n, w).addScaledVector(g.nd, al * g.k * w).addScaledVector(rad, g.r * w); wt += w;
        }
        if (wt > 0) { out.multiplyScalar(1 / wt); Q[i * 3] = out.x; Q[i * 3 + 1] = out.y; Q[i * 3 + 2] = out.z; }
      }
    };
    apply(P, handVerts(s).idx, FIG.si, FIG.sw); if (H) apply(H, handVerts(s).hidx, FIG.hsi, FIG.hsw);
    const F = handFrame(J, s); girth[s] = fingerGirth(P, F, s); handRelief(b, S, P, J, s, F, girth[s]);
  }
  return girth;
}
// claws on fingers and paws, hooves on goats, pads: rigid on the finger tips and the ankles (accessory skeleton)
function pawGeos(m, P, o = {}) { return [...(o.feet === false ? [] : footGeos(m, P)), ...(o.hands === false ? [] : handGeos(m, P))]; }
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
    // (a little above the toe's sides, so from below the seams do not string the beans together on one line)
    const add = (o2, kind, tip, root, seam) => {
      const geo = loft({weights, ...o2}), E = furAttrsLoft(geo, kind).attributes.aEye.array, ln = geo.attributes.aLine.array, nm = geo.attributes.normal, pa = geo.attributes.position, r = (o2.radial || 18) + 1;
      for (let i = 0; i < E.length; i += 4) { if (kind === 1) E[i + 1] = 1; if (seam) { ln[i + 2] = .004 * (ln[i] - .3); ln[i + 3] = 0; } else ln[i + 3] = -1; }
      const close = (i0, d) => { const c = new V3(); for (let i = i0; i < i0 + r; i++) c.x += pa.getX(i) / r, c.y += pa.getY(i) / r, c.z += pa.getZ(i) / r;
        for (let i = i0; i < i0 + r; i++) { pa.setXYZ(i, c.x, c.y, c.z); nm.setXYZ(i, d.x, d.y, d.z); } };
      if (tip) close(pa.count - r, tip); if (root) close(0, root);
      parts.push(geo); return geo;
    };
    // a low leather dome on the ground: a along `side`, b across it; mod shapes its outline
    const pad = (c, side, a, b, h, mod, n = 2.2) => add({origin: new V3(c.x, g + h, c.z), axis: dn, side, radial: mod ? 36 : 14, sub: 1, n, mod,
      secs: [[0, .55 * a, .55 * b], [.35 * h, .93 * a, .93 * b], [.62 * h, a, b], [.86 * h, .8 * a, .8 * b], [.97 * h, .42 * a, .42 * b], [h, .001, .001]]}, 2, dn);
    // a claw from p along d: as wide as the toe's tip at the root and taller than wide, tilted 10° down (or a) and
    // curling, or less tilted if its point would go into the ground
    const claw = (p, d, len, c, curl, a = 10 * DEG) => {
      const drop = a => -Math.sin(a) + curl * Math.cos(a), r = (g + .15 * c - p.y) / len;
      if (drop(a) < r) { let lo = -40 * DEG, hi = a; for (let k = 0; k < 14; k++) { a = (lo + hi) / 2; if (drop(a) > r) lo = a; else hi = a; } }
      const ax = new V3(d.x * Math.cos(a), -Math.sin(a), d.z * Math.cos(a)).normalize();
      add({origin: p, axis: ax, side: new V3(d.z, 0, -d.x), radial: 8, sub: 2, bend: curl,
        secs: [[-.5 * len, .62 * c, c], [0, .64 * c, c], [.35 * len, .5 * c, .8 * c], [.7 * len, .28 * c, .45 * c], [.92 * len, .1 * c, .14 * c], [len, .001, .001]]}, 3, ax);
    };
    // a toe: a bean of fur from inside the paw (buried as deep as a short toe, so a long one does not come out behind)
    // over its knuckle and down to the tip (dragons: three knuckles); the buried root rides high, clear of the sole. A
    // waist where it leaves the paw and the knuckle standing up behind it, so the toes arch (the four humps of the
    // construction sheets) and do not lie on the paw as eggs. Rows: t, half width, half height, centre height (in tw,
    // tt); its underside stays a third of tt above the ground over the bean, which stands out under it as its own oval
    // (a toe sitting on its bean, not a bean cut by the fur)
    const TOE = K.knuckles ? [[-.5, .001, .001, 1.3], [-.42, .7, .6, 1.3], [0, 1, .95, 1.28], [.28, 1.08, 1.04, 1.36], [.44, .9, .86, 1.2], [.6, .98, .85, 1.17], [.76, .8, .66, .98], [.9, .72, .5, .82], [.975, .36, .3, .66], [1, .001, .001, .62]]
      : [[-.5, .001, .001, 1.3], [-.42, .7, .6, 1.3], [0, .9, .84, 1.24], [.3, 1.06, 1.1, 1.4], [.56, 1, .9, 1.2], [.78, .82, .66, .92], [.93, .54, .42, .66], [1, .001, .001, .58]];
    const toe = (root, d, Lt, tw, tt) => add({origin: root, axis: d, side: X, radial: 12, sub: 2, n: 2.2, secs: TOE.map(([t, w, h, c]) => [t * (t < 0 ? Math.min(Lt, .32 * W) : Lt), w * tw, h * tt, 0, c * tt])}, 1, d, d.clone().negate(), true);
    if (L.hoof) {
      // the hoof under the coronet: it stands on the rim of its wall, the sole a shallow vault inside it, the front wall at
      // ~55°, the heels lower (horse: one; goats and deer: two halves with the cleft between them, and two dewclaws
      // behind the fetlock)
      const {C} = fr, Hh = C.y - g, two = L.hoof !== 'single', slope = 1 / Math.tan(PASTERN);
      for (const k of two ? [-1, 1] : [0]) {
        // sections up the wall: the toe slopes back with the pastern, the heels rise nearly upright (and lower, below);
        // cloven halves lean in at the top so the two meet over the pastern
        const bw = (two ? .26 : .5) * W, bl = (two ? .58 : .56) * W, hz = C.z + .39 * Hh, x = C.x + k * .27 * W;
        const sec = (t, kw, kl = 1) => { const zf = hz + bl * kl - t * slope, zb = hz - bl * kl - .08 * t; return [t, bw * kw, (zf - zb) / 2, -k * .1 * W * t / Hh, hz - (zf + zb) / 2]; };
        const geo = add({origin: new V3(x, g, hz), axis: up, side: X, radial: 24, sub: 2, n: two ? 2.3 : 2.1,
          mod: two ? ph => (1 - .3 * Math.max(0, -k * Math.sin(ph)) ** 2) * (1 + .12 * Math.max(0, Math.cos(ph)) ** 8) : null,
          secs: [[.07 * Hh, .001, .001], sec(.05 * Hh, .6, .62), sec(0, .84, .87), sec(0, 1), sec(.35 * Hh, .96), sec(.7 * Hh, .9), sec(Hh, .84), sec(1.1 * Hh, .7, .9), sec(1.18 * Hh, .25, .3)]}, 3);
        // the heels are lower than the toe: the back of the wall comes down
        const pa = geo.attributes.position; for (let i = 0; i < pa.count; i++) { const back = clamp((hz - pa.getZ(i)) / bl, 0, 1.5), h = pa.getY(i) - g; if (h > 0) pa.setY(i, g + h * (1 - .32 * back * back)); }
        geo.computeVertexNormals();
        // a horse's frog: the wedge of soft horn in the hollow of the sole, wide at the heels with the cleft between their
        // bulbs, its point two thirds of the way to the toe; leather (it is what reads as a hoof from below)
        if (!two) add({origin: new V3(x, g + .065 * Hh, hz - .3 * bl), axis: dn, side: new V3(0, 0, 1), radial: 24, sub: 1, n: 2.2,
          mod: ph => { const q = ph - Math.PI / 2, d = Math.abs(Math.abs(q) - Math.PI); return (1 - .8 * Math.max(0, Math.cos(q)) ** 2 * Math.sin(q) ** 2) * (1 - .3 * Math.exp(-((d / .3) ** 2))); },
          secs: [[0, .5 * bl, .5 * bw], [.6 * .055 * Hh, .5 * bl, .5 * bw], [.055 * Hh, .3 * bl, .3 * bw], [.06 * Hh, .001, .001]]}, 2, dn);
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
      // a dragon's dewclaw: a short toe from the inner back of the metatarsus above the paw, hanging back and down, its
      // talon hooked down: a spur from the side, behind the foot (not a speck on it) from the front
      const d = new V3(-o * .25, -.55, -.8).normalize(), r = new V3(B.x - o * .15 * W, g + .4 * W, B.z - .2 * W), Lt = .3 * W;
      toe(r, d, Lt, .08 * W, .08 * W); claw(r.clone().addScaledVector(d, .82 * Lt).add(new V3(0, .05 * W, 0)), new V3(d.x, 0, d.z).normalize(), K.claw[0] * W * .5, K.claw[1] * W * .6, K.claw[2], 50 * DEG);
    }
    if (pads && K.bean) {
      // (a bear's toe pads are flat ovals pressed together in an arc, a digitigrade paw's beans rounder domes)
      for (const t of toes) pad(t.root.clone().addScaledVector(t.d, .58 * t.Lt), t.d, K.bean[1] * W, K.bean[0] * W, (L.type === 'planti' ? .045 : .075) * W);
      if (L.type === 'planti') {
        // a bear's plantar pad: a thin slab on the sole's own outline (inset), a little narrower at the heel, which it
        // rounds (a bear's print is a broad sole, not a wedge), its front an arc just behind the toe beans, following them
        // (one broad pad from heel to toes, no strip of fur between)
        const zb = toes.map(t => [t.root.x + t.d.x * .58 * t.Lt, t.root.z + t.d.z * .58 * t.Lt - .8 * K.bean[1] * W]), mid = zb[n >> 1], out2 = zb[0];
        const zf = x => mid[1] - (mid[1] - out2[1]) * Math.min(1, ((x - mid[0]) / (out2[0] - mid[0])) ** 2);
        const ai = FIG.jIdx['ankle' + s], NB = 12, hw = new Float32Array(NB), xc = new Float32Array(NB); let z0 = Infinity, z1 = mid[1];
        const sole = []; for (let i = 0; i < FIG.meta.nV; i++) if (m.dom[i] === ai && P[i * 3 + 1] < g + .22 * W && P[i * 3 + 2] < z1) { sole.push(i); z0 = Math.min(z0, P[i * 3 + 2]); }
        const bin = z => clamp(Math.round((z - z0) / (z1 - z0) * (NB - 1)), 0, NB - 1), lo = new Float32Array(NB).fill(Infinity), hi = new Float32Array(NB).fill(-Infinity);
        for (const i of sole) { const k = bin(P[i * 3 + 2]); lo[k] = Math.min(lo[k], P[i * 3]); hi[k] = Math.max(hi[k], P[i * 3]); }
        // (the sole widens from the heel to the ball: its half width read as a running maximum, so a sparse band of
        // vertices does not notch the pad)
        for (let k = 0; k < NB; k++) { if (!isFinite(lo[k])) { lo[k] = lo[k - 1] ?? B.x; hi[k] = hi[k - 1] ?? B.x; } xc[k] = (lo[k] + hi[k]) / 2; hw[k] = Math.max((hi[k] - lo[k]) / 2, k ? hw[k - 1] : 0); }
        const zc = (z0 + z1) / 2, cx = xc.reduce((a, v) => a + v, 0) / NB, len = z1 - z0, inside = (x, z) => { const u = (z - z0) / len, k = bin(z), e = u < .16 ? Math.sqrt(Math.max(0, 1 - ((.16 - u) / .15) ** 2)) : 1, dx = Math.abs(x - cx) / (hw[k] * .86 * (.86 + .14 * sstep(0, .4, u)) * e || 1e-4);
          return u > .01 && dx < 1 && z < zf(x); };
        const R = ph => { const c = Math.cos(ph), sn = Math.sin(ph); let d = 0; while (d < len && inside(cx + c * d, zc + sn * d)) d += .005 * W; return Math.max(d, .02 * W); };
        if (sole.length) pad(new V3(cx, 0, zc), new V3(0, 0, 1), 1, 1, .05 * W, R, 2);
      } else {
        // the big pad, trilobed: a rounded point towards the toes, three lobes behind
        pad(new V3(B.x, 0, B.z + .08 * W), new V3(0, 0, 1), K.pad[1] * W * .92, K.pad[0] * W, .07 * W, ph => {
          const q = ph - Math.PI / 2, d = Math.abs(Math.abs(q) - Math.PI);  // q: from the front; d: from straight back
          return (1 - .6 * Math.max(0, Math.cos(q)) ** 2 * Math.sin(q) ** 2) * (1 + .13 * Math.cos(2 * Math.PI * d / .8) * sstep(1.25, .85, d)); });
      }
    }
    if (parts.length) out.push(mergeLofts(parts));
  }
  return out;
}
// hands: claws or hoof caps, and the pads; none for "human" hands, nor where a hand is missing (limb differences)
function handGeos(m, P) {
  const b = m.body, S = handShape(b); if (!S) return [];
  const L = ANIMAL_LEGS[legSp(b)], K = pawKind(b), sz = m.size, N = m.geo.attributes.normal.array, E = m.geo.attributes.aEye.array, ACC = n => m.accBones.indexOf(m.bones[FIG.jIdx[n]]), hard = [], soft = [];
  for (const s of ['L', 'R']) {
    if (limbCut(b, 'arm' + s) != null) continue;
    const F = handFrame(m.J, s), G = m.handGirth && m.handGirth[s] || fingerGirth(P, F, s), {tips} = handVerts(s);
    if (S === HAND_SHAPES.pezuna) { const gs = L.hoof === 'single' ? [[1, 2, 3, 4]] : [[1, 2], [3, 4]]; for (const gr of gs) hard.push(hoofCap(F, P, s, gr, gs.find(g => g !== gr), gr.map(f => [ACC(`f${s}${f}2`), 1 / gr.length]), tips[gr[0]])); }
    else if (L.hand) { const C = HAND_CLAWS[K]; for (let f = 0; f < 5; f++) { const q = F.seg(f, 2); hard.push(handClaw(q, G[`${f}2`], C, q.len * C.k * L.hand / C.ref, ACC(`f${s}${f}2`), tips[f])); } }
    if (padsOn(b) && S !== HAND_SHAPES.pezuna) {
      const key = [s, K, S === HAND_SHAPES.garra, Math.round(F.plen / F.width * 8), Math.round(F.seg(2, 2).len / F.plen * 16)].join(), grids = PAD_GRIDS[key] || (PAD_GRIDS[key] = handPads(b, F, G, s).map(p => padGrid(P, s, p)));
      for (const gd of grids) if (gd) soft.push(padMesh(gd, P, N, .0007 * sz, K === 'rep' && E));
    }
  }
  const out = [];
  if (hard.length) { const g = mergeLofts(hard); g.userData.hand = 'claws'; out.push(g); }  // (claws or hooves: keratin)
  if (soft.length) { const g = mergeLofts(soft); g.userData.hand = 'pads'; g.userData.skin = g.userData.noHull = true; out.push(g); }
  return out;
}
// a part's points go with one skin vertex each (aRoot), so gloves hide what they cover (hideHandParts)
function rootedPart(g, kind, roots) {
  furAttrsLoft(g, kind); const n = g.attributes.position.count;
  g.setAttribute('aRoot', new THREE.BufferAttribute(typeof roots === 'number' ? new Float32Array(n).fill(roots) : roots, 1)); g.setAttribute('aHide', new THREE.BufferAttribute(new Float32Array(n), 1));
  return g;
}
// a pointed part's outline ends in a point: the hull pushes its last ring forward, along the part, not round it (which
// would draw an ink dot there)
function pointHull(g, ring) {
  const p = g.attributes.position, nm = g.attributes.normal, n = p.count, c = (a, b) => { const v = new V3(); for (let i = a; i < b; i++) v.add(new V3().fromBufferAttribute(p, i)); return v.multiplyScalar(1 / (b - a)); };
  const d = c(n - ring, n).sub(c(n - 2 * ring, n - ring)).normalize(); for (let i = n - ring; i < n; i++) nm.setXYZ(i, d.x, d.y, d.z);
  return g;
}
/* a claw out of the end of a finger's last segment: rooted inside the tip with its back just under the skin of the
   finger's back, so the skin hoods it and it comes out of the end as wide as the tip; then it tapers to its point and
   curves down toward the palm. w, h: half width and depth at its base (in the finger's half width); k: its length past
   the tip, in last-segment lengths, for a claw size of ref (ANIMAL_LEGS hand); bend: its curve; end: how blunt its
   point is. A dog's are short blunt cones (about half a segment, worn by walking), a cat's narrow hooks, a bear's long
   and heavy, a dragon's long talons. Rigid on the last segment, so it follows the finger as it curls. */
const HAND_CLAWS = {can: {w: .5, h: .54, k: .8, ref: .013, bend: -.15, end: .1}, fel: {w: .36, h: .56, k: .8, ref: .013, bend: -.7, end: .03},
  oso: {w: .52, h: .58, k: .95, ref: .024, bend: -.24, end: .12}, rep: {w: .46, h: .6, k: 1.15, ref: .026, bend: -.6, end: .03}};
function handClaw(q, Z, C, len, bone, root) {
  // e: from the root to the end of the finger; its back rises from under the skin to just over it there, like a nail plate
  const w = C.w * Z.g, h = C.h * Z.g, e = q.len * .5, top = t => Z.dor * (.75 + .65 * clamp(t / e, 0, 1)) - h, en = Math.max(C.end, .015);
  const secs = [[-h * .4, w * .5, h * .5, 0, top(0)], [0, w * .84, h * .84, 0, top(0)], [e * .6, w * .96, h * .96, 0, top(e * .6)], [e, w, h, 0, top(e)], [e + len * .3, w * .86, h * .8, 0, top(e)],
    [e + len * .7, w * Math.max(.42, en * 1.8), h * Math.max(.4, en * 1.8), 0, top(e)], [e + len * (1 - en * .25), w * en, h * en, 0, top(e)], [e + len, w * en * .3, h * en * .3, 0, top(e)]];
  return rootedPart(pointHull(loft({origin: q.a.clone().addScaledVector(q.d, q.len * .5), axis: q.d, side: new V3().crossVectors(q.d, q.p), secs, radial: 10, sub: 2, bend: C.bend, weights: () => [[bone, 1]]}), 11), 3, root);
}
/* a hoof over a digit (the fingers held together: one digit for a horse, two halves for goats and deer): a keratin wall
   from the coronet, a little behind the last joint (a hoof holds the coffin bone and the end of the pastern), on past
   the tips, flaring a little; cut by the bearing edge, a plane oblique to the digit: the toe runs long on the back of
   the hand and the heels short on the palm side, so the sole faces down and a little to the palm, its wall meeting
   it at about 60° (a hoof's toe wall stands at about 50° to the ground, the heels steeper). Each section is the skin's own outline there plus a margin, so no skin pokes
   through it; a cloven half is flat where it faces the other. The sole is flat and set back inside a rim of wall, its
   white line inked. Rigid on the digit's last segments. */
function hoofCap(F, P, s, gr, other, wts, root) {
  const avg = (g, f) => g.reduce((v, x) => v.add(f(x)), new V3()).multiplyScalar(1 / g.length), NB = 24, TAU = Math.PI * 2;
  const u = avg(gr, f => F.seg(f, 2).d).normalize(), p = F.n.clone().addScaledVector(u, -F.n.dot(u)).normalize(), lat = new V3().crossVectors(u, p);
  const c = avg(gr, f => F.seg(f, 2).a), l1 = gr.reduce((a, f) => a + F.seg(f, 1).len, 0) / gr.length, t0 = -.45 * l1;
  // the skin's outline round the digit (in NB sectors, from the palm side round by the back): all along, and at the coronet
  const bones = new Set(gr.flatMap(f => [1, 2].map(k => FIG.jIdx[`f${s}${f}${k}`]))), {idx, dom} = handVerts(s), env = new Float64Array(NB), envC = new Float64Array(NB), r = new V3();
  const sk = [];
  for (const i of idx) {
    if (!bones.has(dom[i])) continue; r.set(P[i * 3] - c.x, P[i * 3 + 1] - c.y, P[i * 3 + 2] - c.z); const t = r.dot(u); if (t < t0) continue;
    const x = r.dot(lat), y = r.dot(p), rad = Math.hypot(x, y), k = (Math.round(Math.atan2(x, y) / TAU * NB) + NB) % NB;
    env[k] = Math.max(env[k], rad); if (t < t0 + .3 * l1) envC[k] = Math.max(envC[k], rad); sk.push(t, y);
  }
  // sectors without skin take their neighbours'; then widened by one sector and smoothed (never inside the skin)
  const fill = e => { for (let it = 0; it < NB && e.includes(0); it++) { const o = e.slice(); for (let k = 0; k < NB; k++) if (!o[k]) e[k] = Math.max(o[(k + 1) % NB], o[(k + NB - 1) % NB]); }
    const d = e.map((_, k) => Math.max(e[(k + NB - 1) % NB], e[k], e[(k + 1) % NB])); return e.map((_, k) => .25 * d[(k + NB - 1) % NB] + .5 * d[k] + .25 * d[(k + 1) % NB]); };
  const E1 = fill(env), E0 = fill(envC).map((v, k) => Math.min(v, E1[k])), mean = E1.reduce((a, v) => a + v, 0) / NB, mg = .07 * mean;
  // a hoof is round where the digit is flat (the wall stands off the palm and the back, as deep as it is wide)
  const big = Math.max(...E1), ER = E1.map(v => Math.max(v, .7 * big));
  // a cloven half stops short of the plane between the two
  const half = other ? avg(other, f => F.seg(f, 2).a).sub(c).dot(lat) / 2 : 0, xmax = Math.abs(half) - .05 * mean, sg = Math.sign(half);
  const at = (ph, rad, t) => { let x = rad * Math.sin(ph); const y = rad * Math.cos(ph); if (other && x * sg > xmax) x = xmax * sg; return c.clone().addScaledVector(u, t).addScaledVector(lat, x).addScaledVector(p, y); };
  // the wall's rings, s: 0 at the coronet, 1 at the bearing edge (the ring before it tucked into the skin); the sole's plane
  // clear of the skin by more than the sole is set back
  const R1 = k => ER[k] * 1.06 + mg;
  // the sole's plane, t + K·y = L, just clear of all the skin; tilted 27° (K = tan) or less, so the heels keep their height
  const lOf = K => { let l = -Infinity; for (let i = 0; i < sk.length; i += 2) l = Math.max(l, sk[i] + K * sk[i + 1]); return l + mg + .1 * mean; };
  let K = .5; while (K > .05 && lOf(K) - K * R1(0) * 1.1 < t0 + .5 * l1) K -= .1;
  const L = lOf(K), edge = (ph, k) => L - K * R1(k) * 1.1 * Math.cos(ph);
  const rings = [[-.3, k => E0[k] * .9], [0, k => E0[k] * 1.04 + mg], [.3, k => E0[k] * .4 + R1(k) * .6 * 1.03], [.65, k => R1(k) * 1.07], [1, k => R1(k) * 1.1]];
  const pos = [], line = [], add = (v, l) => { pos.push(v.x, v.y, v.z); line.push(...l); };
  for (const [sv, rf] of rings) for (let k = 0; k <= NB; k++) { const ph = k / NB * TAU, kk = k % NB, t = sv < 0 ? t0 + sv * l1 * .4 : t0 + sv * Math.max(edge(ph, kk) - t0, .3 * l1); add(at(ph, rf(kk), t), [1, 1, (sv - .1) * .01, 0]); }
  // the sole: the bearing edge again, a rim of wall, and the sole set back a little inside it
  const nS = u.clone().addScaledVector(p, K).normalize(), W = rings.length * (NB + 1);
  for (const [q, back] of [[1, 0], [.84, .05], [0, .09]]) for (let k = 0; k <= (q ? NB : 0); k++) { const ph = k / NB * TAU, kk = k % NB, rad = R1(kk) * 1.1 * q;
    add(at(ph, rad, L - K * rad * Math.cos(ph)).addScaledVector(nS, -back * mean), [1, 1, (q - .91) * .01, 0]); }
  const idx2 = [], C = NB + 1;
  for (let j = 0; j < rings.length - 1; j++) for (let k = 0; k < NB; k++) { const a = j * C + k; idx2.push(a, a + C, a + 1, a + 1, a + C, a + C + 1); }
  for (let k = 0; k < NB; k++) { const a = W + k; idx2.push(a, a + 1, a + C, a + 1, a + C + 1, a + C); idx2.push(W + C + k, W + C + k + 1, W + 2 * C); }
  const g = new THREE.BufferGeometry(), n = pos.length / 3, si = [], sw = [];
  for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) { si.push(wts[k] ? wts[k][0] : 0); sw.push(wts[k] ? wts[k][1] : 0); }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aLine', new THREE.Float32BufferAttribute(line, 4));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  // facing out: the wall away from the digit's axis, the sole along nS
  const fc = i => { const A = new V3().fromArray(pos, idx2[i] * 3); return [new V3().fromArray(pos, idx2[i + 1] * 3).sub(A).cross(new V3().fromArray(pos, idx2[i + 2] * 3).sub(A)), A.sub(c)]; };
  const [wn, wr] = fc(2 * NB * 6), wallIn = wn.dot(wr.addScaledVector(u, -wr.dot(u))) < 0, soleIn = fc((rings.length - 1) * NB * 6)[0].dot(nS) < 0;
  g.setIndex(idx2); g.computeVertexNormals();
  // the seam where each ring closes, and the sole flat
  const nm = g.attributes.normal, v = new V3();
  for (let j = 0; j < rings.length; j++) { const i0 = j * C, i1 = i0 + NB; v.set(nm.getX(i0) + nm.getX(i1), nm.getY(i0) + nm.getY(i1), nm.getZ(i0) + nm.getZ(i1)).normalize(); nm.setXYZ(i0, v.x, v.y, v.z); nm.setXYZ(i1, v.x, v.y, v.z); }
  for (let i = W; i < n; i++) nm.setXYZ(i, nS.x, nS.y, nS.z);
  g.boundingSphere = new THREE.Sphere(new V3(), 20);
  return rootedPart(g, 3, root);
}
/* a pad laid on the skin in leather: a polar grid inside its outline, each point dropped onto the body along the pad's
   normal (onto the skin of its own bones), lifted a hair off it and skinned as that skin is (the body's skeleton), so it
   bends and stretches with the hand and can never float. Where its points land (a triangle and where in it) depends
   only on the mesh and the pad's place on the hand, so it is found once for each kind of hand (padGrid, kept in
   PAD_GRIDS) and a rebuild only reads the skin there again (padMesh). The remodel moves the hand's skin with its bones
   (each segment stretched along its own bone), so a pad set at a fraction of its segment or palm stays on the same
   triangles while the body's sliders change the hand's size; only its proportions (palm length to width, fingers to
   palm) move a pad across the mesh, and they are part of the key. Its rim is inked as the drawings outline every
   bean: a contour ring (aLine z crosses 0) just inside it, drawn by the lines shader like the body's rings. */
const PAD_RR = [0, .3, .55, .74, .87, .95, 1], PAD_GRIDS = {};
function padGrid(P, s, p) {
  const {dom, byBone} = handVerts(s), I = FIG.index, ok = new Set(p.bones), reach = 1.8 * Math.max(p.a, p.b), {u, v, n, c: o} = p;
  // the skin's triangles under the outline, flattened onto the pad's plane (in its half sizes) with their heights over it,
  // and filed in a coarse grid over the outline so a point looks at a few
  const GN = 8, cell = x => clamp(Math.floor((x + 1.4) / 2.8 * GN), 0, GN - 1), grid = Array.from({length: GN * GN}, () => []);
  let any = false;
  for (const bn of p.bones) for (const t of byBone[bn] || []) {
    // near it in the pad's plane: its first corner within the pad's reach and the triangle's longest edge (the heel of
    // the hand has big triangles, bigger than a carpal pad)
    const i0 = I[t] * 3, dx = P[i0] - o.x, dy = P[i0 + 1] - o.y, dz = P[i0 + 2] - o.z, h = dx * n.x + dy * n.y + dz * n.z, ed = (a, b) => Math.hypot(P[a] - P[b], P[a + 1] - P[b + 1], P[a + 2] - P[b + 2]);
    if (!ok.has(dom[I[t + 1]]) || !ok.has(dom[I[t + 2]]) || Math.sqrt(Math.max(0, dx * dx + dy * dy + dz * dz - h * h)) > reach + Math.max(ed(i0, I[t + 1] * 3), ed(i0, I[t + 2] * 3))) continue;
    const c = new Float64Array(10); c[9] = t; let up = false;
    for (let k = 0; k < 3; k++) { const i = I[t + k] * 3, x = P[i] - o.x, y = P[i + 1] - o.y, z = P[i + 2] - o.z;
      c[k * 3] = (x * u.x + y * u.y + z * u.z) / p.a; c[k * 3 + 1] = (x * v.x + y * v.y + z * v.z) / p.b; c[k * 3 + 2] = x * n.x + y * n.y + z * n.z; up = up || c[k * 3 + 2] > 0; }
    const x0 = Math.min(c[0], c[3], c[6]), x1 = Math.max(c[0], c[3], c[6]), y0 = Math.min(c[1], c[4], c[7]), y1 = Math.max(c[1], c[4], c[7]);
    if (!up || x0 > 1.3 || x1 < -1.3 || y0 > 1.3 || y1 < -1.3) continue;
    for (let gx = cell(x0); gx <= cell(x1); gx++) for (let gy = cell(y0); gy <= cell(y1); gy++) grid[gx * GN + gy].push(c);
    any = true;
  }
  if (!any) return null;
  // the skin seen down the pad's normal at (x, y): the topmost triangle there and where in it
  const hit = (x, y) => {
    let best = -Infinity, h = null;
    for (const c of grid[cell(x) * GN + cell(y)]) {
      const d = (c[4] - c[7]) * (c[0] - c[6]) + (c[6] - c[3]) * (c[1] - c[7]); if (Math.abs(d) < 1e-12) continue;
      const l0 = ((c[4] - c[7]) * (x - c[6]) + (c[6] - c[3]) * (y - c[7])) / d, l1 = ((c[7] - c[1]) * (x - c[6]) + (c[0] - c[6]) * (y - c[7])) / d, l2 = 1 - l0 - l1;
      if (l0 < -1e-9 || l1 < -1e-9 || l2 < -1e-9) continue; const z = l0 * c[2] + l1 * c[5] + l2 * c[8]; if (z > best) { best = z; h = [c[9], l0, l1, l2]; }
    }
    return h;
  };
  const S = p.palm ? 40 : 20, cnt = 1 + S * (PAD_RR.length - 1), tri = new Int32Array(cnt), bc = new Float32Array(cnt * 3), si = new Uint16Array(cnt * 4), sw = new Float32Array(cnt * 4), line = new Float32Array(cnt * 4);
  const wi = new Int32Array(12), wv = new Float64Array(12);
  let at = 0, prev = null;
  // rings from the middle out to the rim; a point that falls off the skin takes the one inside it
  for (const q of PAD_RR) {
    const ring = [];
    for (let j = 0; j < (q ? S : 1); j++, at++) {
      const th = j / S * Math.PI * 2, k = q * padR(p, th), h = hit(k * Math.cos(th), k * Math.sin(th)) || (prev && (prev[j] || prev[0])); if (!h) return null; ring.push(h);
      tri[at] = h[0]; bc.set(h.slice(1), at * 3); line.set([1, 1, (q - .93) * .01, 0], at * 4);
      // skinned as the skin under it: its four strongest bones
      let nw = 0, tw = 0;
      for (let k = 0; k < 3; k++) { const i = I[h[0] + k]; for (let j2 = 0; j2 < 4; j2++) { const w = FIG.sw[i * 4 + j2] / 255 * h[k + 1], bn = FIG.si[i * 4 + j2]; if (w <= 0) continue; let e = 0; while (e < nw && wi[e] !== bn) e++; if (e === nw) { wi[nw] = bn; wv[nw++] = 0; } wv[e] += w; } }
      for (let j2 = 0; j2 < 4; j2++) { let bj = -1; for (let e = 0; e < nw; e++) if (wv[e] > 0 && (bj < 0 || wv[e] > wv[bj])) bj = e; if (bj < 0) break; si[at * 4 + j2] = wi[bj]; sw[at * 4 + j2] = wv[bj]; tw += wv[bj]; wv[bj] = 0; }
      for (let j2 = 0; j2 < 4; j2++) sw[at * 4 + j2] /= tw || 1;
    }
    prev = ring;
  }
  const idx = [], ix = (ri, j) => ri ? 1 + (ri - 1) * S + j % S : 0;
  for (let j = 0; j < S; j++) idx.push(0, ix(1, j), ix(1, j + 1));
  for (let ri = 1; ri < PAD_RR.length - 1; ri++) for (let j = 0; j < S; j++) idx.push(ix(ri, j), ix(ri + 1, j), ix(ri + 1, j + 1), ix(ri, j), ix(ri + 1, j + 1), ix(ri, j + 1));
  // facing out of the skin (the grid turns about n one way or the other)
  if (new V3().crossVectors(u, v).dot(n) < 0) for (let k = 0; k < idx.length; k += 3) { const x = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = x; }
  return {tri, bc, si, sw, line, idx};
}
// a pad on the skin as it is now (P, N), each point rooted at the nearest corner of its triangle (gloves, coat); eye: the body's coat, for a dragon's scale-pads, scutes the colour of its
// belly rather than leather
function padMesh(G, P, N, lift, eye) {
  const I = FIG.index, cnt = G.tri.length, pos = new Float32Array(cnt * 3), nor = new Float32Array(cnt * 3), root = new Float32Array(cnt), av = new V3();
  for (let c = 0; c < cnt; c++) {
    let px = 0, py = 0, pz = 0, nx = 0, ny = 0, nz = 0;
    for (let k = 0; k < 3; k++) { const i = I[G.tri[c] + k] * 3, f = G.bc[c * 3 + k]; px += P[i] * f; py += P[i + 1] * f; pz += P[i + 2] * f; nx += N[i] * f; ny += N[i + 1] * f; nz += N[i + 2] * f; }
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    pos[c * 3] = px + nx * lift; pos[c * 3 + 1] = py + ny * lift; pos[c * 3 + 2] = pz + nz * lift; nor[c * 3] = nx; nor[c * 3 + 1] = ny; nor[c * 3 + 2] = nz; root[c] = I[G.tri[c] + (G.bc[c * 3] >= G.bc[c * 3 + 1] ? G.bc[c * 3] >= G.bc[c * 3 + 2] ? 0 : 2 : G.bc[c * 3 + 1] >= G.bc[c * 3 + 2] ? 1 : 2)]; av.x += nx; av.y += ny; av.z += nz;
  }
  // shaded as one smooth cushion, not with every facet of the skin under it (the drawings fill a bean flat)
  av.normalize(); for (let c = 0; c < cnt * 3; c += 3) { const v = new V3(nor[c] * .5 + av.x, nor[c + 1] * .5 + av.y, nor[c + 2] * .5 + av.z).normalize(); nor[c] = v.x; nor[c + 1] = v.y; nor[c + 2] = v.z; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('aLine', new THREE.BufferAttribute(G.line, 4));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(G.si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(G.sw, 4)); g.setIndex(G.idx);
  rootedPart(g, 2, root);
  if (eye) { const A = g.attributes.aEye.array; for (let c = 0; c < cnt; c++) { A.set(eye.subarray(root[c] * 4, root[c] * 4 + 4), c * 4); A[c * 4] = 1; } }
  return g;
}
// gloves hide the claws, hooves and pads they cover, each point with the skin it grows from (called with the body's hide)
function hideHandParts(m, H) {
  for (const a of m.acc || []) { const g = a.geometry; if (a.userData.hull || !g.userData.hand) continue;
    const R = g.attributes.aRoot.array, A = g.attributes.aHide.array; for (let i = 0; i < A.length; i++) A[i] = H[R[i]] >= .5 ? 1 : 0; g.attributes.aHide.needsUpdate = true; }
}
