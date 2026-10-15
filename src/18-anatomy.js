/* ======================= skeleton =======================
   The "Skeleton" construction mode: the real bones (BodyParts3D, © The Database Center for Life Science, CC BY 4.0),
   fitted once to the default body by tools/anatomy/build_skeleton.py, each bone rigidly bound to one bone of the rig.
   For every other body the bones are carried from the default rest pose to this one: each moves with its joint, turns
   with the segment to its next joint and stretches to its length; the figure is drawn as a ghost around them. */
const SKEL = {};
// the joint each rig bone points to; the head (and the jaw with it) scales with the head's height instead
const SKEL_NEXT = {hips: 'waist', waist: 'chest', chest: 'neck', neck: 'head'};
for (const s of ['L', 'R']) {
  Object.assign(SKEL_NEXT, {['shoulder' + s]: 'elbow' + s, ['elbow' + s]: 'wrist' + s, ['wrist' + s]: `f${s}20`, ['hip' + s]: 'knee' + s, ['knee' + s]: 'ankle' + s, ['ankle' + s]: 'toe' + s});
  for (let f = 0; f < 5; f++) for (let k = 0; k < 3; k++) SKEL_NEXT[`f${s}${f}${k}`] = k < 2 ? `f${s}${f}${k + 1}` : `tip${s}${f}`;
}
function loadSkeleton() {
  if (!SKEL.p) SKEL.p = fetch('skeleton.txt').then(r => { if (!r.ok) throw new Error(r.status); return r.text(); })
    .then(b64 => { const bin = atob(b64.trim()), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return gunzip(u8.buffer); })
    .then(buf => {
      const hl = new DataView(buf).getUint32(0, true), h = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hl)));
      let o = 4 + hl; const take = (C, n) => { const a = new C(buf, o, n); o += a.byteLength; o = (o + 3) & ~3; return a; };
      const q = take(Int16Array, h.n * 3), P = new Float32Array(h.n * 3); for (let i = 0; i < P.length; i++) P[i] = q[i] * 1e-4;
      Object.assign(SKEL, {h, P, B: take(Uint8Array, h.n), idx: take(h.big ? Uint32Array : Uint16Array, h.nt * 3)});
      // the default body's head height, measured as the figure measures it
      const nV = FIG.meta.nV, hb = FIG.jIdx.head; let y0 = Infinity, y1 = -Infinity;
      for (let i = 0; i < nV; i++) if (FIG.si[i * 4] === hb && !FIG.eye[i]) { const y = FIG.base[i * 3 + 1]; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      SKEL.headH0 = y1 - y0;
      return SKEL;
    });
  return SKEL.p;
}
const SKEL_MATS = {};
function skelMat(style) {
  if (!SKEL_MATS[style]) {
    const ivory = 0xe9e0c9;
    SKEL_MATS[style] = style === 'construccion' ? patchEnv(new THREE.MeshToonMaterial({color: ivory, gradientMap: TOON_GRAD}))
      : style === 'contorno' ? new THREE.MeshBasicMaterial({color: 0xf8f5ee}) : style === 'silueta' ? new THREE.MeshBasicMaterial({color: 0x2a2620})
      : patchEnv(new THREE.MeshStandardMaterial({color: ivory, roughness: .62}));
  }
  return SKEL_MATS[style];
}
// rest positions of the bones on this character
function skeletonPositions(m, out) {
  const J0 = FIG.j0, J = m.J, ji = FIG.jIdx, nB = FIG.meta.bones.length, P = SKEL.P, B = SKEL.B, n = SKEL.h.n;
  const T = [];
  const v = (A, i) => new V3(A[i * 3], A[i * 3 + 1], A[i * 3 + 2]);
  const sHead = m.headH / SKEL.headH0;
  for (let b = 0; b < nB; b++) {
    const name = FIG.meta.bones[b], nx = SKEL_NEXT[name], o0 = v(J0, b), o = v(J, b);
    if (!nx) { // head and jaw: scaled about the head joint
      const h0 = v(J0, ji.head), h = v(J, ji.head);
      T[b] = {o0: h0, o: h, q: new Q(), k: sHead, r: sHead}; continue;
    }
    const a0 = v(J0, ji[nx]).sub(o0), a = v(J, ji[nx]).sub(o), k = a.length() / Math.max(a0.length(), 1e-6);
    T[b] = {o0, o, q: new Q().setFromUnitVectors(a0.clone().normalize(), a.clone().normalize()), k, r: Math.sqrt(k * m.size), ax: a0.normalize()};
  }
  const p = new V3();
  for (let i = 0; i < n; i++) {
    const t = T[B[i]]; p.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).sub(t.o0);
    if (t.ax) { const along = p.dot(t.ax); p.addScaledVector(t.ax, -along).multiplyScalar(t.r).addScaledVector(t.ax, along * t.k); }
    else p.multiplyScalar(t.k);
    p.applyQuaternion(t.q).add(t.o);
    out[i * 3] = p.x; out[i * 3 + 1] = p.y; out[i * 3 + 2] = p.z;
  }
  return out;
}
function disposeSkeleton(m) {
  const s = m.skel; if (!s) return;
  m.group.remove(s.mesh, s.hull); s.geo.dispose(); m.skel = null;
}
function buildSkeleton(m) {
  disposeSkeleton(m);
  if (!SKEL.P) { loadSkeleton().then(() => { if (m.formMode === 'esqueleto' && !m.skel) { buildSkeleton(m); m.applyFormVis(); } }, e => console.warn('skeleton', e)); return; }
  const n = SKEL.h.n, geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(skeletonPositions(m, new Float32Array(n * 3)), 3));
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { si[i * 4] = SKEL.B[i]; sw[i * 4] = 1; }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  geo.setAttribute('aHide', new THREE.BufferAttribute(new Float32Array(n), 1));
  geo.setIndex(new THREE.BufferAttribute(SKEL.idx, 1)); geo.computeVertexNormals();
  geo.boundingSphere = new THREE.Sphere(new V3(), 20);
  const mesh = new THREE.SkinnedMesh(geo, skelMat(m.style)), hull = new THREE.SkinnedMesh(geo, OUTLINE_MAT);
  mesh.frustumCulled = hull.frustumCulled = false; mesh.castShadow = mesh.receiveShadow = true; hull.userData.isHull = true; hull.raycast = () => {};
  const I = new THREE.Matrix4(); mesh.bind(m.skeleton, I); hull.bind(m.skeleton, I);
  m.group.add(mesh, hull); m.skel = {mesh, hull, geo};
}
function applySkeletonVis(m) {
  const s = m.skel; if (!s) return;
  const on = m.formMode === 'esqueleto';
  s.mesh.visible = on; s.hull.visible = on && m.outlineOn !== false; s.mesh.material = skelMat(m.style);
}
