/* ======================= muscles that answer to the pose =======================
   Skinning alone moves the skin with the bones and nothing else: a bent arm keeps a flat biceps and the elbow loses
   volume. Like the joint-controlled morphs of DAZ figures and the corrective shapes of pose space deformation, each
   muscle here is a shape driven by the angles of the joints it crosses: the biceps rises and shortens as the elbow
   bends, the calf bunches on tiptoe, the glute tightens with the leg behind, the abs fold in a crunch, the neck's
   sternocleidomastoid stands out on the far side of a head turn, and elbows and knees keep their volume.
   The shapes are made for every body from its own rest mesh (no sculpted data): a soft region along the bone that the
   muscle covers, on the side where it lies, pushed out from the bone. More muscle shows more, more fat shows less.
   They are morph targets after the mouth shapes, so outlines, shadows and the clothes on top (anchored to the same
   triangles) follow them. */
const MUSCLE_DEFS = [
  // gate: bones whose skin it is on · ax: from, to · t, w: centre and spread along that line · dir: the side it lies on
  // (character's left: x left, y up, z front) · p: how tightly to that side · amp, shift: out from the bone and along it (m)
  {id: 'biceps', gate: ['shoulder'], ax: ['shoulder', 'elbow'], t: .6, w: .22, dir: [0, 0, 1], p: 2, amp: .022, shift: -.012, drv: 'elbow'},
  {id: 'triceps', gate: ['shoulder'], ax: ['shoulder', 'elbow'], t: .55, w: .32, dir: [0, 0, -1], p: 2, amp: -.004, drv: 'elbow'},
  {id: 'forearm', gate: ['elbow'], ax: ['elbow', 'wrist'], t: .22, w: .22, dir: [.4, 0, 1], p: 1.5, amp: .011, shift: -.006, drv: 'forearm'},
  {id: 'deltoid', gate: ['shoulder', 'chest'], ax: ['shoulder', 'elbow'], t: .04, w: .2, dir: [1, .7, 0], p: 1, amp: .014, drv: 'raise'},
  {id: 'pec', gate: ['chest'], ax: ['midShoulder', 'shoulder'], t: .5, w: .5, dir: [0, -.3, 1], p: 2.5, amp: .012, drv: 'pec'},
  {id: 'trap', gate: ['chest', 'neck'], ax: ['neck', 'shoulder'], t: .5, w: .45, dir: [0, 1, -.5], p: 2, amp: .011, drv: 'shrug'},
  {id: 'oblique', gate: ['waist', 'hips'], ax: ['hips', 'chest'], t: .45, w: .45, dir: [1, 0, .3], p: 3, amp: .010, drv: 'side'},
  {id: 'scm', gate: ['neck'], ax: ['neck', 'head'], t: .25, w: .5, dir: [.6, 0, 1], p: 3, amp: .007, drv: 'scm'},
  {id: 'glute', gate: ['hips', 'hip'], ax: ['hips', 'hip'], t: 1, w: .7, dir: [0, -.3, -1], p: 2, amp: .016, drv: 'glute'},
  {id: 'quad', gate: ['hip'], ax: ['hip', 'knee'], t: .72, w: .28, dir: [0, 0, 1], p: 2, amp: .010, drv: 'quad'},
  {id: 'hamstring', gate: ['hip'], ax: ['hip', 'knee'], t: .88, w: .2, dir: [0, 0, -1], p: 1.5, amp: .013, drv: 'deepKnee'},
  {id: 'calf', gate: ['knee'], ax: ['knee', 'ankle'], t: .3, w: .24, dir: [0, 0, -1], p: 2, amp: .016, shift: -.008, drv: 'calf'},
  // volume kept at the hinges: the point of the elbow and the kneecap stay round when bent
  {id: 'elbowFill', gate: ['shoulder', 'elbow'], ax: ['shoulder', 'elbow'], t: 1, w: .17, dir: [0, 0, -1], p: .7, amp: .010, drv: 'elbow'},
  {id: 'kneeFill', gate: ['hip', 'knee'], ax: ['hip', 'knee'], t: 1, w: .14, dir: [0, 0, 1], p: .7, amp: .012, drv: 'knee'},
  // the middle: one abdominal wall
  {id: 'abs', mid: true, gate: ['waist', 'hips', 'chest'], ax: ['hips', 'chest'], t: .55, w: .55, dir: [0, 0, 1], p: 4, amp: .009, drv: 'crunch'}
];
const MUSCLES = MUSCLE_DEFS.flatMap(d => d.mid ? [{...d, s: ''}] : [{...d, s: 'L'}, {...d, s: 'R'}]);
const muscleBase = () => (FIG.visemes ? FIG.visemes.length : 0);
const smoothR = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/* ---------- the shapes, for this body ---------- */
function muscleAmount(b) {
  const age = b.age ?? 1, young = .45 + .55 * Math.min(age, 1), old = age > 1 ? 1 - .3 * (age - 1) : 1;
  return (.35 + 1.1 * (b.muscle ?? .5)) * (1.15 - .6 * (b.weight ?? .5)) * young * old;
}
function computeMuscles(m) {
  if (!m.anchors || !m.J) return;
  const nV = FIG.meta.nV, nA = m.anchors.length / 3, A = m.anchors, J = m.J, F = m.size * muscleAmount(m.body);
  const jp = n => new V3(J[FIG.jIdx[n] * 3], J[FIG.jIdx[n] * 3 + 1], J[FIG.jIdx[n] * 3 + 2]);
  { const t0 = new V3(J[FIG.jIdx.toeL * 3], J[FIG.jIdx.toeL * 3 + 1], J[FIG.jIdx.toeL * 3 + 2]), a0 = new V3(J[FIG.jIdx.ankleL * 3], J[FIG.jIdx.ankleL * 3 + 1], J[FIG.jIdx.ankleL * 3 + 2]), k0 = new V3(J[FIG.jIdx.kneeL * 3], J[FIG.jIdx.kneeL * 3 + 1], J[FIG.jIdx.kneeL * 3 + 2]);
    m._footRest = a0.clone().sub(k0).angleTo(t0.sub(a0)); }  // the rest angle of foot to shin
  const pt = (n, s) => n === 'midShoulder' ? jp('shoulder' + (s || 'L')).setX(0).add(new V3(0, -.05 * m.size, .02 * m.size)) : FIG.jIdx[n + s] !== undefined ? jp(n + s) : jp(n);
  // skin weights of every anchor (body vertices, then the helper ones the clothes also hang on)
  const wOf = (i, set) => { const body = i < nV, si = body ? FIG.si : FIG.hsi, sw = body ? FIG.sw : FIG.hsw, j = body ? i : i - nV; if (!si) return 0;
    let g = 0, t = 0; for (let k = 0; k < 4; k++) { const w = sw[j * 4 + k]; t += w; if (set.has(si[j * 4 + k])) g += w; } return t ? g / t : 0; };
  const out = [];
  for (const mu of MUSCLES) {
    const D = new Float32Array(nA * 3), s = mu.s, a = pt(mu.ax[0], s), b = pt(mu.ax[1], s), axis = b.clone().sub(a), L = axis.length(), u = axis.clone().divideScalar(L || 1);
    const dir = new V3(mu.dir[0] * (s === 'R' ? -1 : 1), mu.dir[1], mu.dir[2]), dp = dir.addScaledVector(u, -dir.dot(u)); const hasDir = dp.lengthSq() > 1e-6; dp.normalize();
    const set = new Set(mu.gate.map(g => FIG.jIdx[FIG.jIdx[g + s] !== undefined ? g + s : g]).filter(v => v !== undefined));
    const v = new V3(), rad = new V3();
    for (let i = 0; i < nA; i++) {
      v.set(A[i * 3], A[i * 3 + 1], A[i * 3 + 2]).sub(a);
      const t = v.dot(u) / L, g = Math.exp(-(((t - mu.t) / mu.w) ** 2) * 2.5); if (g < .02) continue;
      const gate = wOf(i, set); if (gate < .25) continue;
      rad.copy(v).addScaledVector(u, -t * L); const r = rad.length(); if (r < 1e-5) continue; rad.divideScalar(r);
      const c = hasDir ? rad.dot(dp) : 1, lobe = mu.p < 1 ? (.5 + .5 * c) ** (mu.p * 2) : Math.max(0, c) ** mu.p;
      const k = smoothR(.25, .75, gate) * g * lobe * F; if (k < 1e-6) continue;
      for (let e = 0; e < 3; e++) D[i * 3 + e] = rad.getComponent(e) * mu.amp * k + u.getComponent(e) * (mu.shift || 0) * k;
    }
    out.push(D);
  }
  m.musc = {D: out, nV};
  // into the body (after the mouth shapes) and every garment it wears; with their normals so the light shows the
  // shape too (not on the graphics saver: half the memory)
  const g = m.geo, vis = FIG.visemes || [], withN = state.quality !== 'baja';
  g.morphAttributes.position = [...vis, ...out.map((D, k) => { const at = new THREE.BufferAttribute(D.subarray(0, nV * 3), 3); at.name = MUSCLES[k].id + MUSCLES[k].s; return at; })];
  if (withN) { const z = FIG.zeroN || (FIG.zeroN = new THREE.BufferAttribute(new Float32Array(nV * 3), 3)); g.morphAttributes.normal = [...vis.map(() => z), ...out.map(D => new THREE.BufferAttribute(muscleNormals(g, D), 3))]; }
  else delete g.morphAttributes.normal;
  g.morphTargetsRelative = true; g.dispose();  // the renderer keeps one morph texture per geometry: let it make a new one
  for (const x of [m.body3, ...m.hulls]) if (x && x.geometry === g) x.updateMorphTargets();
  for (const gm of m.garments || []) garmentMuscles(m, gm);
  m._muscSig = '';
}
// how a shape turns the normals: faces around the moved vertices, measured moved and still (sums of face normals
// weighted by area, as the base normals are)
function muscleNormals(g, D) {
  const P = g.attributes.position.array, I = g.index.array, nV = P.length / 3, out = new Float32Array(nV * 3);
  if (!FIG.vFaces) {  // faces of every vertex, once
    const cnt = new Uint32Array(nV + 1); for (let i = 0; i < I.length; i++) cnt[I[i] + 1]++;
    for (let i = 0; i < nV; i++) cnt[i + 1] += cnt[i];
    const at = cnt.slice(0, nV), list = new Uint32Array(I.length); for (let f = 0; f < I.length / 3; f++) for (let k = 0; k < 3; k++) list[at[I[f * 3 + k]]++] = f;
    FIG.vFaces = {start: cnt, list};
  }
  const {start, list} = FIG.vFaces, moved = new Uint8Array(nV);
  for (let i = 0; i < nV; i++) if (D[i * 3] || D[i * 3 + 1] || D[i * 3 + 2]) moved[i] = 1;
  const touch = new Uint8Array(nV);  // moved vertices and their neighbours
  for (let i = 0; i < nV; i++) if (moved[i]) for (let j = start[i]; j < start[i + 1]; j++) { const f = list[j]; touch[I[f * 3]] = touch[I[f * 3 + 1]] = touch[I[f * 3 + 2]] = 1; }
  const a = new V3(), b = new V3(), c = new V3(), n0 = new V3(), n1 = new V3(), e1 = new V3(), e2 = new V3();
  const fn = (f, off, n) => { const i0 = I[f * 3], i1 = I[f * 3 + 1], i2 = I[f * 3 + 2];
    a.set(P[i0 * 3], P[i0 * 3 + 1], P[i0 * 3 + 2]); b.set(P[i1 * 3], P[i1 * 3 + 1], P[i1 * 3 + 2]); c.set(P[i2 * 3], P[i2 * 3 + 1], P[i2 * 3 + 2]);
    if (off) { a.x += D[i0 * 3]; a.y += D[i0 * 3 + 1]; a.z += D[i0 * 3 + 2]; b.x += D[i1 * 3]; b.y += D[i1 * 3 + 1]; b.z += D[i1 * 3 + 2]; c.x += D[i2 * 3]; c.y += D[i2 * 3 + 1]; c.z += D[i2 * 3 + 2]; }
    n.add(e1.subVectors(c, b).cross(e2.subVectors(a, b))); };
  for (let i = 0; i < nV; i++) {
    if (!touch[i]) continue;
    n0.set(0, 0, 0); n1.set(0, 0, 0);
    for (let j = start[i]; j < start[i + 1]; j++) { fn(list[j], false, n0); fn(list[j], true, n1); }
    if (n0.lengthSq() < 1e-20 || n1.lengthSq() < 1e-20) continue;
    n1.normalize().sub(n0.normalize()); out[i * 3] = n1.x; out[i * 3 + 1] = n1.y; out[i * 3 + 2] = n1.z;
  }
  return out;
}
// a garment's muscles: each of its vertices moves as the three body points it hangs on
function garmentMuscles(m, gm) {
  if (!m.musc || !gm.d || !gm.geo) return;
  const d = gm.d, n = d.n, R = d.refs, W = d.w;
  gm.geo.morphAttributes.position = m.musc.D.map(D => {  // muscles only (no mouth shapes on clothes): their influences start at 0
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { const r = R[i * 3 + k] * 3, w = W[i * 3 + k]; if (!w) continue; a[i * 3] += D[r] * w; a[i * 3 + 1] += D[r + 1] * w; a[i * 3 + 2] += D[r + 2] * w; }
    return new THREE.BufferAttribute(a, 3);
  });
  gm.geo.morphTargetsRelative = true; gm.geo.dispose();
  for (const x of [...gm.meshes, gm.hull]) if (x) x.updateMorphTargets();
}
function musclesAfterBuild(m) {
  if (m.noMuscles || m.lib.sil || !FIG.meta) return;  // not the silhouettes of thumbnails nor helper figures
  if (!m.musc) return computeMuscles(m);  // the first time now; while sliders move, once they rest
  clearTimeout(m._muscT); m._muscT = setTimeout(() => computeMuscles(m), 250);
}

/* ---------- reading the pose ---------- */
const _mv3 = new V3();
function muscleDrives(m) {
  const J = m.joints, wp = (o, v) => o.getWorldPosition(v), ang = (a, b) => a.angleTo(b), out = {};
  const hipsQ = J.hips.getWorldQuaternion(new Q()), chestQ = J.chest.getWorldQuaternion(new Q()), chestI = chestQ.clone().invert(), hipsI = hipsQ.clone().invert();
  for (const s of ['L', 'R']) {
    const sh = wp(J['shoulder' + s], new V3()), el = wp(J['elbow' + s], new V3()), wr = wp(J['wrist' + s], new V3());
    const hp = wp(J['hip' + s], new V3()), kn = wp(J['knee' + s], new V3()), an = wp(J['ankle' + s], new V3());
    const up = el.clone().sub(sh), fo = wr.clone().sub(el), th = kn.clone().sub(hp), shin = an.clone().sub(kn);
    const elbow = ang(up, fo), knee = ang(th, shin), side = s === 'L' ? 1 : -1;
    const arm = up.clone().normalize().applyQuaternion(chestI), raise = Math.acos(clamp(-arm.y, -1, 1));
    const leg = th.clone().normalize().applyQuaternion(hipsI), ext = Math.atan2(-leg.z, -leg.y), flex = Math.atan2(leg.z, -leg.y);
    const curls = m.hands && m.hands[s] ? m.hands[s].c.reduce((a, b) => a + b, 0) / 5 : .25;
    // the foot against the shin: pointing the toes opens the angle
    const i = FIG.jIdx['ankle' + s], t = FIG.jIdx['toe' + s], T = m.J, foot = J['ankle' + s].localToWorld(_mv3.set(T[t * 3] - T[i * 3], T[t * 3 + 1] - T[i * 3 + 1], T[t * 3 + 2] - T[i * 3 + 2])).sub(an);
    const ankle = ang(shin, foot), rest = m._footRest || 1.75;
    const e = smoothR(.25, 2.3, elbow), k = smoothR(.3, 2.2, knee), deep = smoothR(1.6, 2.5, knee);
    out['elbow' + s] = e; out['knee' + s] = k; out['deepKnee' + s] = deep;
    out['forearm' + s] = clamp(e * .55 + smoothR(.35, .85, curls) * .7, 0, 1);
    out['raise' + s] = smoothR(.9, 2.4, raise); out['shrug' + s] = smoothR(1.7, 2.7, raise);
    out['pec' + s] = clamp(smoothR(0, .9, arm.z) * (1 - smoothR(.2, .9, arm.y)) + smoothR(.05, .6, -arm.x * side) * .8, 0, 1);
    out['glute' + s] = smoothR(.05, .5, ext); out['quad' + s] = smoothR(.4, 1.4, flex) * (1 - k);
    out['calf' + s] = Math.max(smoothR(.1, .8, rest - ankle), deep * .6);  // pointing the toes brings the foot in line with the shin
  }
  const cu = new V3(0, 1, 0).applyQuaternion(chestQ).applyQuaternion(hipsI), fwd = Math.atan2(cu.z, cu.y), lat = Math.atan2(cu.x, cu.y);
  out.crunch = smoothR(.15, .8, fwd); out.sideL = smoothR(.12, .6, lat); out.sideR = smoothR(.12, .6, -lat);
  const hf = new V3(0, 0, 1).applyQuaternion(J.head.getWorldQuaternion(new Q())).applyQuaternion(chestI), yaw = Math.atan2(hf.x, hf.z);
  out.scmR = smoothR(.25, 1.1, yaw); out.scmL = smoothR(.25, 1.1, -yaw);  // turning to the left works the right one
  return out;
}
function muscleTick() {
  for (const m of chars) {
    if (!m.musc || !m.body3.morphTargetInfluences) continue;
    const on = m.formMode === 'figura' && !m.avatar, gain = on ? (m.body.flex ?? 1) : 0, d = gain ? muscleDrives(m) : null, base = muscleBase();
    const body = [m.body3, ...m.hulls].filter(x => x.morphTargetInfluences && x.geometry === m.geo), worn = (m.garments || []).flatMap(g => [...g.meshes, g.hull]).filter(x => x && x.morphTargetInfluences);
    MUSCLES.forEach((mu, k) => { const v = d ? (d[mu.drv + mu.s] ?? d[mu.drv] ?? 0) * gain : 0; for (const x of body) x.morphTargetInfluences[base + k] = v; for (const x of worn) x.morphTargetInfluences[k] = v; });
  }
}
