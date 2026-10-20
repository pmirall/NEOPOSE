/* ======================= sculpted anthro heads (head swap) =======================
   Modular-character technique: the body's own head is hidden and a sculpted head is put in its place, cut across the
   neck. The seam is matched to the body: at the cut the head's neck takes the body's neck shape and skin weights, and
   blends back to the sculpt above it. Heads are CC-BY sculpts from Sketchfab, baked by wrap/heads.py: origin at the
   eyes, unit = head height, with ear, jaw and lip marks so ears bend and the mouth opens like the rest of the rig. */
const HEADS = {cache: new Map()};
const HEAD_STYLE_SCALE = {real: 1.04, toon: 1.05, kemono: 1.04}; // kemono and toony skulls are already enlarged by effBody
const SNOUT_BY_LEVEL = [0, .45, .6, .75, .88, 1];
function headModelFor(b) {
  // only sculpted (downloaded) heads: the species' own sculpt first, or the one chosen in the panel
  if (!b || b.species === 'humano') return null;
  if ((b.kemo ?? 3) <= 1 && !b.headModel) return null;  // a kemonomimi: a human face with the animal's ears
  if (b.headModel && HEAD_CATALOG[b.headModel]) return b.headModel;  // any sculpt, even another species' (a hybrid)
  const sp = (SPECIES[b.species] || {}).head || b.species, list = Object.entries(HEAD_CATALOG).filter(([, c]) => c.species.includes(sp));
  return list.length ? list[0][0] : null;
}
function loadHeadModel(id) {
  if (HEADS.cache.has(id)) return HEADS.cache.get(id);
  const p = fetch(`heads/${id}.txt`).then(r => { if (!r.ok) throw new Error(r.status); return r.text(); })
    .then(b64 => { const bin = atob(b64.trim()), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return gunzip(u8.buffer); })
    .then(buf => {
      const hl = new DataView(buf).getUint32(0, true), h = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hl))), b0 = 4 + hl, o = h.offs, n = h.n;
      return {...h, id, P: new Float32Array(buf, b0 + o[0], n * 3), idx: h.big ? new Uint32Array(buf, b0 + o[1], h.nt * 3) : new Uint16Array(buf, b0 + o[1], h.nt * 3),
        K: new Uint8Array(buf, b0 + o[2], n), ear: new Uint8Array(buf, b0 + o[3], n)};
    }).then(cutMouth);
  HEADS.cache.set(id, p); p.then(d => { HEADS.cache.set(id, Promise.resolve(d)); HEADS[id] = d; }, () => HEADS.cache.delete(id));
  return p;
}
/* The sculpt is cut along its lip line once, when it loads: every skin triangle crossing the line is split there, and in
   front of the corners of the mouth (mouthFrame) the new vertices are doubled, one for the upper lip and one for the
   lower, so the mouth opens with clean lip edges and closes without a seam; behind the corners they are shared and the
   cheek stretches. Jaw weights come from the same rule as the body's head (jawWeight). The lip edge (rim, points round
   the arch) is kept for the inside of the mouth to be built on; a sculpt modelled with its lips already apart (the
   husky) has no skin on the line, and its upper lip's edge just above stands for it. */
function cutMouth(d) {
  const L = d.L, F = mouthFrame((HEAD_RECIPES[HEAD_CATALOG[d.id].species[0]] || {}).mouth || 'canino', L.mouthY, L.tip[2], 0, L.hingeZ, 1, L.chin);
  const P = Array.from(d.P), K = Array.from(d.K), ear = Array.from(d.ear), idx = [], cut = new Map(), up = [], n0 = d.n, y = i => P[i * 3 + 1];
  // a separate piece in front of and below the eyes is the muzzle's, never an ear (the goat's lips came marked as one)
  for (let i = 0; i < n0; i++) if (K[i] === 1 && P[i * 3 + 2] > .15 && P[i * 3 + 1] < 0) { K[i] = 0; ear[i] = 0; }
  for (let i = 0; i < n0; i++) if (K[i] === 0 && Math.abs(y(i) - F.y) < 1e-4) P[i * 3 + 1] = F.y + 1e-4;
  const vert = (a, b, open) => { const u = (F.y - y(a)) / (y(b) - y(a)), v = P.length / 3;
    for (let c = 0; c < (open ? 2 : 1); c++) { for (let k = 0; k < 3; k++) P.push(P[a * 3 + k] + (P[b * 3 + k] - P[a * 3 + k]) * u); K.push(0); ear.push(Math.round(ear[a] + (ear[b] - ear[a]) * u)); }
    if (open) up.push(v); return [v, open ? v + 1 : v]; };
  const cross = (a, b) => { const key = Math.min(a, b) * n0 + Math.max(a, b); let c = cut.get(key);
    if (!c) { const u = (F.y - y(a)) / (y(b) - y(a)), x = P[a * 3] + (P[b * 3] - P[a * 3]) * u, z = P[a * 3 + 2] + (P[b * 3 + 2] - P[a * 3 + 2]) * u; c = vert(a, b, z > F.zc && Math.abs(x) < F.xc); cut.set(key, c); }
    return c; };
  for (let t = 0; t < d.idx.length; t += 3) {
    const v = [d.idx[t], d.idx[t + 1], d.idx[t + 2]], s = v.map(i => y(i) >= F.y);
    if (s[0] === s[1] && s[1] === s[2] || K[v[0]] || K[v[1]] || K[v[2]]) { idx.push(...v); continue; }
    // the vertex alone on its side first (the winding kept), then the crossings on its two edges
    const o = s[0] !== s[1] && s[0] !== s[2] ? 0 : s[1] !== s[0] && s[1] !== s[2] ? 1 : 2, a = v[o], b = v[(o + 1) % 3], c = v[(o + 2) % 3], hi = s[o] ? 0 : 1;
    const ab = cross(a, b), ac = cross(a, c);
    idx.push(a, ab[hi], ac[hi], ab[1 - hi], b, c, ab[1 - hi], c, ac[1 - hi]);
  }
  let rim = up.map(i => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]);
  for (let dy = .01; rim.length < 6 && dy < .13; dy += .01) { rim = []; const Y = F.y + dy;
    for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) { const a = idx[t + e], b = idx[t + (e + 1) % 3], ya = y(a) - Y, yb = y(b) - Y; if ((ya < 0) === (yb < 0) || K[a] || K[b]) continue;
      const u = ya / (ya - yb), x = P[a * 3] + (P[b * 3] - P[a * 3]) * u, z = P[a * 3 + 2] + (P[b * 3 + 2] - P[a * 3 + 2]) * u; if (z > F.zc && Math.abs(x) < F.xc) rim.push([x, Y, z]); } }
  // aLip: 1 + how far from the open edge (0 … .03 head heights → 1 … 1.5) near it, for the shader's dark lip margin; 2 elsewhere
  const n = P.length / 3, jaw = new Uint8Array(n), lip = new Float32Array(n), open = new Set(up);
  for (let i = 0; i < n; i++) {
    const x = P[i * 3], yy = P[i * 3 + 1], z = P[i * 3 + 2];
    jaw[i] = K[i] === 1 || K[i] === 2 ? 0 : open.has(i) ? 0 : open.has(i - 1) && i >= n0 ? 255 : Math.round(jawWeight(F, x, yy, z) * 255);
    let e = Infinity; if (K[i] === 0 && Math.abs(yy - F.y) < .08 && z > F.zc - .08) for (const q of rim) e = Math.min(e, Math.hypot(q[0] - x, q[1] - yy, q[2] - z));
    lip[i] = e < .03 ? 1 + .5 * e / .03 : 2;
  }
  // some sculpts model the closed mouth as a slit or a roll of lips going into the head: open, their far sides would be
  // inked as solid black. What lies inside the lip edge near the line loses its ink (aLip 3), and deep inside, where
  // the inside of the mouth takes its place, its skin too (4)
  const zf = Math.max(...rim.map(q => q[2])), Cz = F.zc + .35 * (zf - F.zc), NS = 16, R = new Array(NS + 1).fill(0);
  let tc = 0; for (const [x, , z] of rim) tc = Math.max(tc, Math.abs(Math.atan2(x, z - Cz)));
  for (const [x, , z] of rim) { const b = Math.round(Math.abs(Math.atan2(x, z - Cz)) / tc * NS); R[b] = Math.max(R[b], Math.hypot(x, z - Cz)); }
  for (let i = 0; i < n && rim.length; i++) {
    const x = P[i * 3], yy = P[i * 3 + 1], z = P[i * 3 + 2], th = Math.abs(Math.atan2(x, z - Cz)), r = Math.hypot(x, z - Cz);
    if (K[i] === 1 || K[i] === 2 || th > tc * 1.15 || Math.abs(yy - F.y) > .1 || z < F.zc - .03) continue;
    const f = Math.min(th / tc, 1) * NS, k = Math.min(NS - 1, Math.floor(f)), Rt = R[k] + (R[k + 1] - R[k]) * (f - k);
    if (r < Rt - .008) lip[i] = r < Rt - .03 && Math.abs(yy - F.y) < .06 ? 4 : 3;
  }
  return {...d, P: new Float32Array(P), K: Uint8Array.from(K), ear: Uint8Array.from(ear), idx: Uint32Array.from(idx), n, nt: idx.length / 3, jaw, lip,
    rim, mouth: F};
}
// called by build(): the head data must be ready, otherwise it loads and the character is rebuilt when it arrives
function headSwapReady(m) {
  const id = headModelFor(m.body); if (!id) return null;
  if (HEADS[id]) return HEADS[id];
  loadHeadModel(id).then(() => { if (headModelFor(m.body) === id && m.bones) { m.build(m.body); if (typeof syncHeadUI === 'function') syncHeadUI(); } }).catch(e => console.warn('head', id, e));
  return null;
}
/* place the sculpt on this body: eyes on the body's eyes, size from the body's head height, neck snapped to the body's
   neck at the cut. Fills m.headSwap and points the anthro landmarks (mouth, ears, snout tip) at the new head. */
function computeHeadSwap(m, P, J) {
  m.headSwap = null;
  const d = headSwapReady(m); if (!d) return;
  const nV = FIG.meta.nV, Hb = FIG.jIdx.head, Jw = FIG.jIdx.jaw, Nk = FIG.jIdx.neck, jy = b => J[b * 3 + 1];
  // body landmarks (rest pose, after the lift to the ground)
  let ex = 0, ey = 0, ez = 0, ne = 0, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < nV; i++) {
    if (FIG.eye[i]) { ex += P[i * 3]; ey += P[i * 3 + 1]; ez += P[i * 3 + 2]; ne++; continue; }
    const dm = m.dom[i]; if (dm !== Hb && dm !== Jw) continue; const y = P[i * 3 + 1]; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const E = new V3(ex / ne, ey / ne, ez / ne), headH = y1 - y0, yHead = jy(Hb);
  const style = m.body.headStyle || HEAD_CATALOG[d.id].style, s = headH * (HEAD_STYLE_SCALE[style] || 1.05) * (HEAD_CATALOG[d.id].scale || 1);
  // the cut goes across the neck, below the sculpt's chin so its whole jaw stays
  const yc = Math.min(jy(Nk) + .5 * (jy(Hb) - jy(Nk)), E.y + s * d.L.chin - .012 * m.size);
  // body neck ring at the cut: centre and radius by angle
  const NB = 32, Rb = new Float32Array(NB), ring = [];
  let cx = 0, cz = 0, nc = 0;
  for (let i = 0; i < nV; i++) if ((m.dom[i] === Nk || m.dom[i] === Hb) && Math.abs(P[i * 3 + 1] - yc) < .012 * m.size && !FIG.eye[i]) { cx += P[i * 3]; cz += P[i * 3 + 2]; nc++; ring.push(i); }
  cx /= nc || 1; cz /= nc || 1;
  for (const i of ring) { const a = Math.atan2(P[i * 3] - cx, P[i * 3 + 2] - cz), k = ((Math.round(a / (2 * Math.PI) * NB) % NB) + NB) % NB; Rb[k] = Math.max(Rb[k], Math.hypot(P[i * 3] - cx, P[i * 3 + 2] - cz)); }
  fillRing(Rb);
  const lvl = clamp(Math.round(m.body.kemo ?? 5), 2, 5), kSn = m.body.snout ?? SNOUT_BY_LEVEL[lvl];
  const L = d.L, n = d.n, Q = new Float32Array(n * 3), src = d.P;
  // model neck centre vs body neck centre: the neck slides onto the body below the chin
  const mnx = E.x + s * L.neck[0], mnz = E.z + s * L.neck[2], chinY = E.y + s * L.chin;
  for (let i = 0; i < n; i++) {
    let x = src[i * 3], y = src[i * 3 + 1], z = src[i * 3 + 2];
    if (z > 0) z *= kSn + (1 - kSn) * Math.min(1, Math.max(0, (y - L.crown * .5) * 4)); // kemo level shortens the snout, not the skull
    let X = E.x + s * x, Y = E.y + s * y, Z = E.z + s * z;
    const t = sstep(chinY, yc, Y); X += (cx - mnx) * t; Z += (cz - mnz) * t;
    Q[i * 3] = X; Q[i * 3 + 1] = Y; Q[i * 3 + 2] = Z;
  }
  // model ring just above the cut, then snap radially towards the body ring, fading out upwards
  const Rm = new Float32Array(NB), fade = Math.max(.015 * m.size, chinY - yc);
  for (let i = 0; i < n; i++) { if (d.K[i] !== 0 || d.ear[i] > 25) continue; const Y = Q[i * 3 + 1]; if (Y < yc - .01 || Y > yc + .015) continue;
    const a = Math.atan2(Q[i * 3] - cx, Q[i * 3 + 2] - cz), k = ((Math.round(a / (2 * Math.PI) * NB) % NB) + NB) % NB; Rm[k] = Math.max(Rm[k], Math.hypot(Q[i * 3] - cx, Q[i * 3 + 2] - cz)); }
  fillRing(Rm);
  for (let i = 0; i < n; i++) {
    if (d.K[i] === 1 || d.K[i] === 2) continue;
    let Y = Q[i * 3 + 1]; if (Y > yc + fade) continue;
    if (Y < yc) Y = Q[i * 3 + 1] = yc;
    const dx = Q[i * 3] - cx, dz = Q[i * 3 + 2] - cz, r = Math.hypot(dx, dz); if (r < 1e-5) continue;
    const a = Math.atan2(dx, dz), f = (a / (2 * Math.PI) * NB + NB) % NB, k0 = Math.floor(f) % NB, k1 = (k0 + 1) % NB, u = f - Math.floor(f);
    const rb = Rb[k0] * (1 - u) + Rb[k1] * u, rm = Rm[k0] * (1 - u) + Rm[k1] * u; if (!rm) continue;
    const t = sstep(yc, yc + fade, Y), sc = (rb * 1.01 / rm) * (1 - t) + t;
    Q[i * 3] = cx + dx * sc; Q[i * 3 + 2] = cz + dz * sc;
  }
  // keep only triangles above the cut
  // (a species borrowing this sculpt may leave out its ears or horns, unless the head was picked by hand)
  const keep = [], hide = new Set(!m.body.headModel && SPECIES[m.body.species] && SPECIES[m.body.species].hide || []);
  for (let t = 0; t < d.idx.length; t += 3) { const a = d.idx[t], b = d.idx[t + 1], c = d.idx[t + 2];
    if (hide.size && (hide.has(d.K[a]) || hide.has(d.K[b]) || hide.has(d.K[c]))) continue;
    if (src[a * 3 + 1] * s + E.y >= yc - .002 || src[b * 3 + 1] * s + E.y >= yc - .002 || src[c * 3 + 1] * s + E.y >= yc - .002) keep.push(a, b, c); }
  // ear bases: where the ear meets the skull
  const earBase = {}, earDir = {};
  for (const [k, sd] of [['L', 1], ['R', -1]]) {
    let ax = 0, ay = 0, az = 0, an = 0, minY = Infinity; const c = new V3(); let nc = 0;
    for (let i = 0; i < n; i++) if (d.ear[i] > 128 && Math.sign(Q[i * 3]) === sd) { minY = Math.min(minY, Q[i * 3 + 1]); c.x += Q[i * 3]; c.y += Q[i * 3 + 1]; c.z += Q[i * 3 + 2]; nc++; }
    for (let i = 0; i < n; i++) if (d.ear[i] > 128 && Math.sign(Q[i * 3]) === sd && Q[i * 3 + 1] < minY + .02 * s) { ax += Q[i * 3]; ay += Q[i * 3 + 1]; az += Q[i * 3 + 2]; an++; }
    if (an) { earBase[k] = new V3(ax / an, ay / an, az / an); earDir[k] = c.multiplyScalar(1 / nc).sub(earBase[k]).normalize(); }
  }
  const tip = [E.x + s * L.tip[0], E.y + s * L.tip[1], E.z + s * L.tip[2] * kSn], Fm = d.mouth, zs = z => E.z + s * (z > 0 ? z * kSn : z);
  m.headSwap = {d, Q, keep, s, E, yc, yHead, cx, cz, rn: Rb.reduce((a, b) => a + b, 0) / NB, ringIdx: ring, earBase, kSn};
  m.anthro = {L: {eyeX: Math.abs(L.eyeL[0]) * s, eyeY: E.y, eyeZ: E.z, chin: E.y + s * L.chin, crown: E.y + s * L.crown, hh: s, hw: .4 * s, front: tip[2]},
    mouthY: E.y + s * L.mouthY, tip, spec: {snout: (tip[2] - E.z) / s, nose: (HEAD_RECIPES[headSp(m.body)] || {}).mouth || 'canino'},
    recipe: HEAD_RECIPES[headSp(m.body)], earBase: Object.keys(earBase).length ? earBase : null, earDir, swap: true, rim: d.rim.map(([x, , z]) => [E.x + s * x, zs(z)]),
    mouth: {...Fm, y: E.y + s * Fm.y, zc: zs(Fm.zc), xc: s * Fm.xc, zh: zs(Fm.zh), h: s, chin: E.y + s * Fm.chin, tip: tip[2], jz: J[Jw * 3 + 2]}};
}
function fillRing(R) {
  const n = R.length;
  for (let pass = 0; pass < n; pass++) for (let k = 0; k < n; k++) if (!R[k]) { const a = R[(k + n - 1) % n], b = R[(k + 1) % n]; if (a || b) R[k] = a && b ? (a + b) / 2 : a || b; }
}
// body vertices the new head replaces (the human head and the neck above the cut)
function headSwapMask(m) {
  const hs = m.headSwap; if (!hs) return null;
  const nV = FIG.meta.nV, P = m.geo.attributes.position.array, M = new Uint8Array(nV), Hb = FIG.jIdx.head, Jw = FIG.jIdx.jaw;
  for (let i = 0; i < nV; i++) if (FIG.eye[i] || m.dom[i] === Hb || m.dom[i] === Jw || (P[i * 3 + 1] > hs.yc + .002 && Math.abs(P[i * 3]) < .2 * m.size && P[i * 3 + 1] > hs.yc + .002 && m.dom[i] === FIG.jIdx.neck)) M[i] = 1;
  return M;
}
// build the skinned mesh of the head once the skeleton is bound
function attachHeadSwap(m) {
  const hs = m.headSwap; if (!hs) return;
  const d = hs.d, n = d.n, Q = hs.Q, geo = new THREE.BufferGeometry(), nB = FIG.meta.bones.length;
  geo.setAttribute('position', new THREE.BufferAttribute(Q, 3));
  geo.setIndex(new THREE.BufferAttribute(Uint32Array.from(hs.keep), 1));
  // skin: the neck takes the weights of the body ring at the cut, the rest is head, jaw or ear
  const SI = new Uint16Array(n * 4), SW = new Float32Array(n * 4), BSI = m.geo.attributes.skinIndex.array, BSW = m.geo.attributes.skinWeight.array, BP = m.geo.attributes.position.array;
  const Hb = FIG.jIdx.head, Jw = FIG.jIdx.jaw;
  for (let i = 0; i < n; i++) {
    const w = new Map(), add = (b, x) => { if (x > 1e-4) w.set(b, (w.get(b) || 0) + x); };
    // the neck's weights fade up to the head joint, but not out over the snout, into the jaw or the ears (they would hold them back)
    const Y = Q[i * 3 + 1], e = d.ear[i] / 255, j = d.jaw[i] / 255, u = Math.max(sstep(hs.yc, hs.yHead + .02 * m.size, Y), sstep(1.2 * hs.rn, 1.8 * hs.rn, Math.hypot(Q[i * 3] - hs.cx, Q[i * 3 + 2] - hs.cz)), j, e);
    if (u < 1) { // nearest vertex of the body ring
      let best = -1, bd = Infinity;
      for (const r of hs.ringIdx) { const dx = BP[r * 3] - Q[i * 3], dy = BP[r * 3 + 1] - Y, dz = BP[r * 3 + 2] - Q[i * 3 + 2], dd = dx * dx + dy * dy + dz * dz; if (dd < bd) { bd = dd; best = r; } }
      if (best >= 0) for (let k = 0; k < 4; k++) add(BSI[best * 4 + k], BSW[best * 4 + k] * (1 - u));
    }
    const rest = u;
    add(Hb, rest * (1 - e) * (1 - j)); add(Jw, rest * j * (1 - e)); add(nB + (Q[i * 3] > 0 ? 0 : 1), rest * e);
    const top = [...w.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4), sum = top.reduce((a, b) => a + b[1], 0) || 1;
    top.forEach(([b, x], k) => { SI[i * 4 + k] = b; SW[i * 4 + k] = x / sum; });
  }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(SI, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(SW, 4));
  // drawing attributes: rings around the head, centre line in front, eye shading on the eyes, the lip seam
  const Ln = new Float32Array(n * 4), Ey = new Float32Array(n * 4), Lp = new Float32Array(n), Hd = new Float32Array(n);
  const E = hs.E, s = hs.s, L = d.L, er = (L.eyeR_ || .07) * s;
  for (let i = 0; i < n; i++) {
    const x = Q[i * 3] - E.x, y = Q[i * 3 + 1], z = Q[i * 3 + 2] - (E.z - .35 * s), a = Math.atan2(x, z);
    Ln[i * 4] = Math.cos(a); Ln[i * 4 + 1] = Math.sin(a); Ln[i * 4 + 2] = y; Ln[i * 4 + 3] = d.K[i] === 0 ? 1 : -1;
    Lp[i] = d.lip[i];
    const sd = x > 0 ? 'eyeL' : 'eyeR', c = L[sd], ecx = E.x + c[0] * s, ecy = E.y + c[1] * s, ecz = E.z + c[2] * s;
    const isEye = d.K[i] === 2 || (d.K[i] === 0 && !HEAD_CATALOG[d.id].eyes && Math.hypot(Q[i * 3] - ecx, Q[i * 3 + 1] - ecy, Q[i * 3 + 2] - ecz) < er);
    if (isEye) {
      const bz = ecz - er; let vx = Q[i * 3] - ecx, vy = Q[i * 3 + 1] - ecy, vz = Q[i * 3 + 2] - bz; const l = Math.hypot(vx, vy, vz) || 1;
      Ey[i * 4] = vx / l * (x > 0 ? 1 : -1); Ey[i * 4 + 1] = vy / l; Ey[i * 4 + 2] = vz / l; Ey[i * 4 + 3] = 1;
    }
  }
  geo.setAttribute('aLine', new THREE.BufferAttribute(Ln, 4)); geo.setAttribute('aEye', new THREE.BufferAttribute(Ey, 4));
  geo.setAttribute('aLip', new THREE.BufferAttribute(Lp, 1)); geo.setAttribute('aHide', new THREE.BufferAttribute(Hd, 1));
  furAttrsHead(m, geo, hs);
  geo.computeVertexNormals(); geo.boundingSphere = new THREE.Sphere(new V3(), 20);
  const I = new THREE.Matrix4(), mesh = new THREE.SkinnedMesh(geo, m.lib[m.style]);
  mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.userData.acc = true; mesh.userData.headSwap = true;
  m.group.add(mesh); mesh.bind(m.skeleton, I); m.acc.push(mesh); m.meshes.push(mesh);
  if (m.lib.outline) { const o = new THREE.SkinnedMesh(geo, m.lib.outline); o.frustumCulled = false; o.userData.hull = true; m.group.add(o); o.bind(m.skeleton, I); m.acc.push(o); m.hulls.push(o);
    o.onBeforeRender = () => { OUTLINE_MAT.uniforms.uOpenO.value = m.mouthOpen ? 1 : 0; OUTLINE_MAT.uniformsNeedUpdate = true; }; }
  m.headMesh = mesh;
}
// picking on the sculpted head: the bone with most weight
function headPick(m, hit) {
  const g = hit.object.geometry, a = g.index.getX(hit.faceIndex * 3), si = g.attributes.skinIndex, sw = g.attributes.skinWeight, nB = FIG.meta.bones.length;
  let best = 0, bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(a, k); if (w > bw) { bw = w; best = si.getComponent(a, k); } }
  return best === nB ? 'earL' : best === nB + 1 ? 'earR' : m.bonePick[best] || 'head';
}
