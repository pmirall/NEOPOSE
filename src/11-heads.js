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
    jaw[i] = K[i] === 1 || K[i] === 2 ? 0 : Math.round(jawWeight(F, x, yy, z, open.has(i) ? false : open.has(i - 1) && i >= n0 ? true : yy < F.y) * 255);
    let e = Infinity; if (K[i] === 0 && Math.abs(yy - F.y) < .08 && z > F.zc - .08) for (const q of rim) e = Math.min(e, Math.hypot(q[0] - x, q[1] - yy, q[2] - z));
    lip[i] = e < .03 ? 1 + .5 * e / .03 : 2;
  }
  // some sculpts model the closed mouth as a slit, a roll of lips or a whole mouth going into the head: open, these would
  // show through the cut (the fox girl's mouth floor, inked, floated over the tongue as a black arch; the rabbit's inner
  // mouth stood in the opening as white shards). Round the mouth, skin is the sculpt's inside of the mouth when it looks
  // into a closed space: rays from it, along its normal and leaning four ways off it, all meet
  // the sculpt again, and above the line some of them below it (the palate sees the floor or the closed lips), where a
  // receding chin or the underside of an overhanging lip looks out into the open one way or another, and a fold beside
  // the nose or under the eye, closed as it may be, stays above. Away from the lip edge itself (the rim's outer envelope in plan, as in mouthParts)
  // it is not drawn while the mouth is open (4): the new inside, whose inner lips are dark, takes its place
  const zf = Math.max(...rim.map(q => q[2])), Cb = F.zc - .3 * (zf - F.zc), Nv = new Float32Array(n * 3), NS = 16, R = new Array(NS + 1).fill(0), ring = [];
  let tc = 0; for (const [x, , z] of rim) tc = Math.max(tc, Math.abs(Math.atan2(x, z - Cb)));
  for (const [x, , z] of rim) { const b = Math.round(Math.abs(Math.atan2(x, z - Cb)) / tc * NS); R[b] = Math.max(R[b], Math.hypot(x, z - Cb)); }
  for (let k = 0; k <= NS; k++) if (!R[k]) { let a = k - 1, b = k + 1; while (a >= 0 && !R[a]) a--; while (b <= NS && !R[b]) b++; R[k] = a < 0 ? R[b] : b > NS ? R[a] : R[a] + (R[b] - R[a]) * (k - a) / (b - a); }
  for (let k = -NS; k <= NS; k++) { const t = k / NS * tc; ring.push([R[Math.abs(k)] * Math.sin(t), Cb + R[Math.abs(k)] * Math.cos(t)]); }
  const inside = (x, z) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, zi] = ring[i], [xj, zj] = ring[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
  const depth = (x, z) => { let e = Infinity; for (let i = 1; i < ring.length; i++) { const [ax, az] = ring[i - 1], dx = ring[i][0] - ax, dz = ring[i][1] - az, t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1); e = Math.min(e, Math.hypot(x - ax - dx * t, z - az - dz * t)); } return e; };
  const T = [];  // the triangles round the mouth as corner and two edges, flat, for the rays
  for (let t = 0; t < idx.length; t += 3) { const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3, e1 = [0, 1, 2].map(k => P[b + k] - P[a + k]), e2 = [0, 1, 2].map(k => P[c + k] - P[a + k]);
    const nn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    for (const v of [a, b, c]) for (let k = 0; k < 3; k++) Nv[v + k] += nn[k];
    if (Math.abs((P[a + 1] + P[b + 1] + P[c + 1]) / 3 - F.y) < .45 && (P[a + 2] + P[b + 2] + P[c + 2]) / 3 > F.zh - .3 && Math.abs(P[a]) < F.xc + .35) T.push(idx[t], idx[t + 1], idx[t + 2], P[a], P[a + 1], P[a + 2], ...e1, ...e2); }
  // Möller–Trumbore, from just off the surface, as far as .3 head heights, against the triangles filed in a grid of cells
  // along the way (each filed under every cell its box reaches, with a margin, so a ray sampled every half cell finds it)
  const G = .04, cells = new Map(), ck = (a, b, c) => (a + 512) * 1048576 + (b + 512) * 1024 + c + 512, key = (x, y, z) => ck(Math.floor(x / G), Math.floor(y / G), Math.floor(z / G)), seen = new Int32Array(T.length / 12);
  for (let t = 0; t < T.length; t += 12) { const lo = [0, 1, 2].map(k => Math.floor((T[t + 3 + k] + Math.min(0, T[t + 6 + k], T[t + 9 + k]) - G / 2) / G)), hi = [0, 1, 2].map(k => Math.floor((T[t + 3 + k] + Math.max(0, T[t + 6 + k], T[t + 9 + k]) + G / 2) / G));
    for (let a = lo[0]; a <= hi[0]; a++) for (let b = lo[1]; b <= hi[1]; b++) for (let c = lo[2]; c <= hi[2]; c++) { const kk = ck(a, b, c); (cells.get(kk) || cells.set(kk, []).get(kk)).push(t); } }
  let ray = 0;
  const looksIn = (i, ox, oy, oz, dx, dy, dz) => { ray++; for (let s = 0; s <= .3; s += G / 2) for (const t of cells.get(key(ox + dx * s, oy + dy * s, oz + dz * s)) || []) {
    if (seen[t / 12] === ray || T[t] === i || T[t + 1] === i || T[t + 2] === i) continue; seen[t / 12] = ray;
    const e1x = T[t + 6], e1y = T[t + 7], e1z = T[t + 8], e2x = T[t + 9], e2y = T[t + 10], e2z = T[t + 11], px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x, det = e1x * px + e1y * py + e1z * pz;
    if (det > -1e-12 && det < 1e-12) continue; const iv = 1 / det, sx = ox - T[t + 3], sy = oy - T[t + 4], sz = oz - T[t + 5], u = (sx * px + sy * py + sz * pz) * iv; if (u < 0 || u > 1) continue;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x, v = (dx * qx + dy * qy + dz * qz) * iv; if (v < 0 || u + v > 1) continue;
    const tt = (e2x * qx + e2y * qy + e2z * qz) * iv; if (tt > 1e-5 && tt < .3) return (oy + dy * tt - F.y) * (oy - F.y) < 0 ? 2 : 1; } return 0; };
  for (let i = 0; i < n && ring.length > 2; i++) {
    const x = P[i * 3], z = P[i * 3 + 2], dy = P[i * 3 + 1] - F.y;
    if (K[i] === 1 || K[i] === 2 || dy < -.3 || dy > .12 || Math.abs(x) > F.xc + .05 || z < F.zh) continue;
    if (inside(x, z) && depth(x, z) < .008) continue;
    const d = new V3(Nv[i * 3], Nv[i * 3 + 1], Nv[i * 3 + 2]).normalize(), t1 = new V3(Math.abs(d.y) > .9 ? 1 : 0, Math.abs(d.y) > .9 ? 0 : 1, 0).cross(d).normalize(), t2 = d.clone().cross(t1);
    const o = [x + d.x * 1e-4, P[i * 3 + 1] + d.y * 1e-4, z + d.z * 1e-4];
    const hits = [d, ...[t1, t2].flatMap(t => [1, -1].map(sg => d.clone().addScaledVector(t, sg).normalize()))].map(r => looksIn(i, ...o, r.x, r.y, r.z));
    if (hits.filter(Boolean).length > 3 && (dy < 0 || hits.includes(2))) lip[i] = 4;
  }
  // a triangle that reaches into the marked inside is marked whole (its other corners doubled), so the border between
  // drawn and not drawn runs along its edges and not across it as a half-drawn band (on the fox girl, such a band of her
  // mouth floor's outline floated over the tongue as a black arch)
  const Jw = Array.from(jaw), Lp = Array.from(lip), dup = new Map();
  for (let t = 0; t < idx.length; t += 3) { if (Lp[idx[t]] < 4 && Lp[idx[t + 1]] < 4 && Lp[idx[t + 2]] < 4) continue;
    for (let c = t; c < t + 3; c++) { const i = idx[c]; if (Lp[i] === 4) continue; let v = dup.get(i);
      if (v === undefined) { v = P.length / 3; dup.set(i, v); P.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); K.push(K[i]); ear.push(ear[i]); Jw.push(Jw[i]); Lp.push(4); }
      idx[c] = v; } }
  // the hem: the open edge of the skin round the neck, which the swap pulls down onto the body's neck (the kemono cat's
  // ends just under its chin, above the cut, and floated over the body's open neck)
  const cnt = new Map(), hem = new Set(); for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) { const a = idx[t + e], b = idx[t + (e + 1) % 3], k = Math.min(a, b) * 4194304 + Math.max(a, b); cnt.set(k, (cnt.get(k) || 0) + 1); }
  for (const [k, c] of cnt) if (c === 1) for (const i of [Math.floor(k / 4194304), k % 4194304]) if (K[i] === 0 && Lp[i] < 4 && P[i * 3 + 1] < Math.min(F.chin + .1, F.y - .1)) hem.add(i);
  return {...d, P: new Float32Array(P), K: Uint8Array.from(K), ear: Uint8Array.from(ear), idx: Uint32Array.from(idx), n: P.length / 3, nt: idx.length / 3, jaw: Uint8Array.from(Jw), lip: Float32Array.from(Lp),
    rim, mouth: F, hem};
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
  // the sculpt's edge at the cut goes onto the body's neck ring, and above it whatever lies inside the ring is pushed out
  // to it, fading upwards (never drawn in: a throat that ends under an overhanging chin, the fox girl's or the rabbit's,
  // was scaled in with the chin, and the body's neck showed its inside through the gap, inked black)
  const fade = Math.max(.015 * m.size, chinY - yc);
  for (let i = 0; i < n; i++) {
    if (d.K[i] === 1 || d.K[i] === 2) continue;
    let Y = Q[i * 3 + 1]; if (Y > yc + fade && !d.hem.has(i)) continue;
    if (Y < yc || d.hem.has(i)) Y = Q[i * 3 + 1] = yc;
    const dx = Q[i * 3] - cx, dz = Q[i * 3 + 2] - cz, r = Math.hypot(dx, dz); if (r < 1e-5) continue;
    const a = Math.atan2(dx, dz), f = (a / (2 * Math.PI) * NB + NB) % NB, k0 = Math.floor(f) % NB, k1 = (k0 + 1) % NB, u = f - Math.floor(f);
    const rb = 1.01 * (Rb[k0] * (1 - u) + Rb[k1] * u), t = sstep(yc, yc + fade, Y), sc = Y <= yc ? rb / r : Math.max(1, (rb * (1 - t) + r * t) / r);
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
    mouth: jawRoom(m, P, J, {...Fm, y: E.y + s * Fm.y, zc: zs(Fm.zc), xc: s * Fm.xc, zh: zs(Fm.zh), h: s, chin: E.y + s * Fm.chin, tip: tip[2]})};
}
function fillRing(R) {
  const n = R.length;
  for (let pass = 0; pass < n; pass++) for (let k = 0; k < n; k++) if (!R[k]) { const a = R[(k + n - 1) % n], b = R[(k + 1) % n]; if (a || b) R[k] = a && b ? (a + b) / 2 : a || b; }
}
// body vertices the new head replaces (the human head and the neck above the cut)
function headSwapMask(m) {
  const hs = m.headSwap; if (!hs) return null;
  const nV = FIG.meta.nV, P = m.geo.attributes.position.array, M = new Uint8Array(nV), Hb = FIG.jIdx.head, Jw = FIG.jIdx.jaw;
  // 1 hidden, 2 drawn without its ink outline: the throat below the cut, though it may be the head's or the jaw's (hidden,
  // it left the neck open under the sculpt's chin; inked, the human chin's underside showed its back as a black shelf)
  for (let i = 0; i < nV; i++) if (FIG.eye[i] || P[i * 3 + 1] > hs.yc + .002 && (m.dom[i] === Hb || m.dom[i] === Jw || Math.abs(P[i * 3]) < .2 * m.size && m.dom[i] === FIG.jIdx.neck)) M[i] = 1;
    else if (m.dom[i] === Hb || m.dom[i] === Jw) M[i] = 2;
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
  const I = new THREE.Matrix4(), mesh = new THREE.SkinnedMesh(geo, twoSided(m.lib[m.style], TWIN_SKIN));
  mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.userData.acc = true; mesh.userData.headSwap = true;
  m.group.add(mesh); mesh.bind(m.skeleton, I); m.acc.push(mesh); m.meshes.push(mesh);
  if (m.lib.outline) { const o = new THREE.SkinnedMesh(geo, m.lib.outline); o.frustumCulled = false; o.userData.hull = true; m.group.add(o); o.bind(m.skeleton, I); m.acc.push(o); m.hulls.push(o);
    o.onBeforeRender = () => { const U = OUTLINE_MAT.uniforms; U.uOpenO.value = m.mouthOpen ? 1 : 0; U.uLipO.value.copy(m.lib.uEye.uLip.value); OUTLINE_MAT.uniformsNeedUpdate = true; }; }
  m.headMesh = mesh;
}
// picking on the sculpted head: the bone with most weight
function headPick(m, hit) {
  const g = hit.object.geometry, a = g.index.getX(hit.faceIndex * 3), si = g.attributes.skinIndex, sw = g.attributes.skinWeight, nB = FIG.meta.bones.length;
  let best = 0, bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(a, k); if (w > bw) { bw = w; best = si.getComponent(a, k); } }
  return best === nB ? 'earL' : best === nB + 1 ? 'earR' : m.bonePick[best] || 'head';
}
