/* ======================= sculpted anthro parts: paw-hands and hind paws =======================
   Like the sculpted heads, but made here: each part is sculpted offline as a signed distance field round a canonical
   skeleton (tools/parts: round cones, ellipsoids and smooth unions, measured on real anatomy and furry art — palm as
   wide as long, fingers 1 : .67 : .57, a heart-shaped palm pad with three lobes toward the wrist, claws hooded at the root
   and as deep as 1.4 their width), cleaned up in Blender and baked with its bone weights. On a body it replaces the
   human hand or foot: every canonical bone's frame is carried onto the character's own bone (moved, turned, stretched
   along it, scaled across it by the hand's size), so the paw fits any build, and it is skinned to those bones, so it
   curls, grips and poses like the hand it stands for. It does what the lofted paws (10-anthro) did: without pads its
   leather is fur, a species without claws has none, a limb that ends above it has none, and clothes hide it where they
   hide the skin it stands for. The human part under it is not drawn where it covers it. */
const PARTS = {cache: new Map()};
// (rabbits keep their own paws, furred, the toes close together under the fur: the dog's sculpt is grooved round beans
// and a heart they have not got, which in fur would still read as pads)
const PART_FAMILY = {lobo: 'canid', zorro: 'canid', perro: 'canid', gato: 'felid', tigre: 'felid', leon: 'felid', oso: 'bear', dragon: 'dragon'};
function partFor(b, kind) {
  if (!b || b.species === 'humano') return null;
  if (kind === 'hand' && (b.paws === 'humanas' || !handShape(b) || handShape(b) === HAND_SHAPES.pezuna)) return null;
  if (kind === 'foot') { const L = legSpec(b); if (!L || L.type !== 'digi') return null; }
  const fam = PART_FAMILY[legSp(b)]; if (!fam) return null;
  const id = `${kind}-${fam}`; return PART_LIST.includes(id) ? id : null;
}
const PART_LIST = ['hand-canid', 'hand-felid', 'hand-bear', 'hand-dragon', 'foot-canid', 'foot-felid'];
function loadPart(id) {
  if (PARTS.cache.has(id)) return PARTS.cache.get(id);
  const p = fetch(`parts/${id}.txt`).then(r => { if (!r.ok) throw new Error(r.status); return r.text(); })
    .then(b64 => { const bin = atob(b64.trim()), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return gunzip(u8.buffer); })
    .then(buf => {
      const hl = new DataView(buf).getUint32(0, true), h = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hl))), b0 = 4 + hl, o = h.offs, n = h.n;
      const d = {...h, id, P: new Float32Array(buf, b0 + o[0], n * 3), idx: h.big ? new Uint32Array(buf, b0 + o[1], h.nt * 3) : new Uint16Array(buf, b0 + o[1], h.nt * 3),
        kind: new Uint8Array(buf, b0 + o[2], n), si: new Uint8Array(buf, b0 + o[3], n * 4), sw: new Uint8Array(buf, b0 + o[4], n * 4), roots: {}};
      // the claws (keratin, kind 3) are pieces of their own, baked after the skin: a paw without them fits the skin's
      // vertices alone (ns) and draws its triangles. The windings of both sides, with claws and without, made here once,
      // and the normals of the canonical shape (a hind paw is laid rigidly: they only turn)
      const c = d.kind.indexOf(3), T = d.idx, bare = [], Ix = h.big ? Uint32Array : Uint16Array;
      d.ns = c >= 0 && d.kind.subarray(c).every(k => k === 3) ? c : n;
      for (let t = 0; t < T.length; t += 3) if (d.kind[T[t]] !== 3 && d.kind[T[t + 1]] !== 3 && d.kind[T[t + 2]] !== 3) bare.push(T[t], T[t + 1], T[t + 2]);
      const flip = a => { const b = a.slice(); for (let t = 0; t < b.length; t += 3) { b[t + 1] = a[t + 2]; b[t + 2] = a[t + 1]; } return b; }, B = Ix.from(bare);
      d.tris = {L: [T, B], R: [flip(T), flip(B)]}; d.N = partNormals(d.P, T, n); d.w = partWeights(d, B);
      return d;
    });
  PARTS.cache.set(id, p); p.then(d => { PARTS[id] = d; }, () => PARTS.cache.delete(id));
  return p;
}
// the data when it is there; otherwise it loads and the character is built again when it comes
function partReady(m, id) {
  if (!id) return null; if (PARTS[id]) return PARTS[id];
  loadPart(id).then(() => { if (m.bones && (partFor(m.body, 'hand') === id || partFor(m.body, 'foot') === id)) m.build(m.body); }).catch(e => console.warn('part', id, e));
  return null;
}
// vertex normals, area-weighted over the triangles (as computeVertexNormals does, on the arrays: a few times quicker)
function partNormals(Q, I, n) {
  const N = new Float32Array(n * 3);
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3, ux = Q[b] - Q[a], uy = Q[b + 1] - Q[a + 1], uz = Q[b + 2] - Q[a + 2], vx = Q[c] - Q[a], vy = Q[c + 1] - Q[a + 1], vz = Q[c + 2] - Q[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    N[a] += nx; N[a + 1] += ny; N[a + 2] += nz; N[b] += nx; N[b + 1] += ny; N[b + 2] += nz; N[c] += nx; N[c + 1] += ny; N[c + 2] += nz;
  }
  for (let i = 0; i < n * 3; i += 3) { const l = Math.sqrt(N[i] * N[i] + N[i + 1] * N[i + 1] + N[i + 2] * N[i + 2]) || 1; N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; }
  return N;
}
/* the weights, normalized (the baked bytes sum to 255 or 256: as they are, a point a metre from the origin stands 4 mm
   off its neighbour) and relaxed over the skin: baked, they meet hard in places (the thumb's root against the palm, a
   vertex all the palm's beside one all the thumb's), and a closing thumb drew those edges out to three times their
   length, a tear in the paw. Twelve rounds of each vertex's weights halfway to its neighbours' mean spread every such
   step over a few edges, so no edge of the paw stretches in a fist more than the human hand's do (the claws, pieces of
   their own, keep theirs: rigid on the last segment). The four strongest kept */
function partWeights(d, I) {
  const n = d.n, nb = d.bones.length, W = new Float32Array(n * nb);
  for (let i = 0; i < n; i++) { const t = d.sw[i * 4] + d.sw[i * 4 + 1] + d.sw[i * 4 + 2] + d.sw[i * 4 + 3] || 1; for (let c = 0; c < 4; c++) W[i * nb + d.si[i * 4 + c]] += d.sw[i * 4 + c] / t; }
  if (nb > 1) {  // (a hind paw is all the ankle's)
    const deg = new Int32Array(n + 1);
    for (let t = 0; t < I.length; t++) deg[I[t] + 1] += 2;
    for (let i = 0; i < n; i++) deg[i + 1] += deg[i];
    const at = deg.slice(0, -1), adj = new Int32Array(deg[n]);
    for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const a = I[t + e], b = I[t + (e + 1) % 3]; adj[at[a]++] = b; adj[at[b]++] = a; }
    const U = new Float32Array(n * nb);
    for (let it = 0; it < 12; it++) {
      U.set(W);
      for (let i = 0; i < n; i++) { const a = deg[i], b = deg[i + 1]; if (b === a || d.kind[i] === 3) continue; const o = i * nb;
        for (let c = 0; c < nb; c++) { let s = 0; for (let q = a; q < b; q++) s += U[adj[q] * nb + c]; W[o + c] = .5 * U[o + c] + .5 * s / (b - a); } }
    }
  }
  const si = new Uint8Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { const o = i * nb; let t = 0;
    for (let c = 0; c < 4; c++) { let bj = -1; for (let b = 0; b < nb; b++) if (W[o + b] > 0 && (bj < 0 || W[o + b] > W[o + bj])) bj = b; if (bj < 0) break; si[i * 4 + c] = bj; sw[i * 4 + c] = W[o + bj]; t += W[o + bj]; W[o + bj] = 0; }
    for (let c = 0; c < 4; c++) sw[i * 4 + c] /= t || 1; }
  return {si, sw};
}
/* the nearest of some points (indices `list` into P) to any other, near enough: a grid of cells about c wide over them
   (and a margin of empty ones round them), each empty cell given the nearest full one by a flood out from the full ones,
   so a point looks at the cells round its own, or round the full one its cell was given: a few dozen points, wherever
   it is (a paw's toes reach well past the body's foot) */
function nearGrid(P, list, c) {
  if (!list.length) return () => -1;
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (const i of list) { const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  const ic = 1 / c, pad = 2, N0 = Math.ceil((x1 - x0) * ic) + 2 * pad + 1, N1 = Math.ceil((y1 - y0) * ic) + 2 * pad + 1, N2 = Math.ceil((z1 - z0) * ic) + 2 * pad + 1, S0 = N1 * N2, NC = N0 * S0;
  x0 -= pad * c; y0 -= pad * c; z0 -= pad * c;
  const cellAt = (x, y, z) => { let a = ((x - x0) * ic) | 0, b = ((y - y0) * ic) | 0, e = ((z - z0) * ic) | 0;
    a = a < 0 ? 0 : a >= N0 ? N0 - 1 : a; b = b < 0 ? 0 : b >= N1 ? N1 - 1 : b; e = e < 0 ? 0 : e >= N2 ? N2 - 1 : e; return a * S0 + b * N2 + e; };
  const start = new Int32Array(NC + 1), items = new Int32Array(list.length), src = new Int32Array(NC).fill(-1), queue = new Int32Array(NC);
  for (const i of list) start[cellAt(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]) + 1]++;
  for (let k = 1; k <= NC; k++) start[k] += start[k - 1];
  const fill = start.slice(0, -1); for (const i of list) items[fill[cellAt(P[i * 3], P[i * 3 + 1], P[i * 3 + 2])]++] = i;
  let qe = 0; for (let k = 0; k < NC; k++) if (start[k + 1] > start[k]) { src[k] = k; queue[qe++] = k; }
  for (let qs = 0; qs < qe; qs++) {
    const k = queue[qs], x = (k / S0) | 0, y = ((k / N2) | 0) % N1, z = k % N2, v = src[k];
    if (x > 0 && src[k - S0] < 0) { src[k - S0] = v; queue[qe++] = k - S0; } if (x < N0 - 1 && src[k + S0] < 0) { src[k + S0] = v; queue[qe++] = k + S0; }
    if (y > 0 && src[k - N2] < 0) { src[k - N2] = v; queue[qe++] = k - N2; } if (y < N1 - 1 && src[k + N2] < 0) { src[k + N2] = v; queue[qe++] = k + N2; }
    if (z > 0 && src[k - 1] < 0) { src[k - 1] = v; queue[qe++] = k - 1; } if (z < N2 - 1 && src[k + 1] < 0) { src[k + 1] = v; queue[qe++] = k + 1; }
  }
  return (x, y, z) => {
    const k0 = src[cellAt(x, y, z)], cx = (k0 / S0) | 0, cy = ((k0 / N2) | 0) % N1, cz = k0 % N2, a1 = cx < N0 - 1 ? cx + 1 : cx, b1 = cy < N1 - 1 ? cy + 1 : cy, e0 = cz > 0 ? cz - 1 : 0, e1 = cz < N2 - 1 ? cz + 1 : cz;
    let best = -1, bd = Infinity;
    for (let a = cx > 0 ? cx - 1 : 0; a <= a1; a++) for (let b = cy > 0 ? cy - 1 : 0; b <= b1; b++) {
      const r = a * S0 + b * N2;
      for (let q = start[r + e0], q1 = start[r + e1 + 1]; q < q1; q++) { const i = items[q] * 3, dx = P[i] - x, dy = P[i + 1] - y, dz = P[i + 2] - z, d = dx * dx + dy * dy + dz * dz; if (d < bd) { bd = d; best = i; } }
    }
    return best / 3;
  };
}
// the body's vertices by the bone that carries most of each (m.dom, from the base weights: the same on every figure)
function domLists(m) {
  if (FIG.domLists) return FIG.domLists;
  const L = {}; for (let i = 0; i < FIG.meta.nV; i++) (L[m.dom[i]] = L[m.dom[i]] || []).push(i);
  for (const k in L) L[k] = Int32Array.from(L[k]);
  return (FIG.domLists = L);
}
/* of the body's skin under a part (cov), what is hidden: only what has all its neighbours under it too. The edge of what
   is hidden then lies inside the part, and the skin round it goes on into the part's surface, which it meets at a clean
   angle (cut off where the part took over, it ended in a ragged rim, inked as one) */
function partUnder(cov, list) {
  const I = FIG.index, keep = cov.slice(), out = [];
  for (let t = 0; t < I.length; t += 3) { const a = I[t], b = I[t + 1], c = I[t + 2]; if (!(cov[a] && cov[b] && cov[c])) keep[a] = keep[b] = keep[c] = 0; }
  for (const i of list) if (keep[i]) out.push(i);
  return Int32Array.from(out);
}
/* each of a part's points goes with one body vertex, its root: the nearest of those its own main bone carries (B, per
   point; per bone a grid of them), so clothes hide the part where they hide that skin (hideUnderParts). Both are carried
   by the same bones, so the pairs hold whatever the sliders do: found on a part's first fitting, a few milliseconds, and
   kept with it (by side, and with claws or without) */
function partRoots(m, d, key, Q, B) {
  if (d.roots[key]) return d.roots[key];
  const P = m.geo.attributes.position.array, L = domLists(m), n = B.length, R = new Float32Array(n), grids = new Map();
  for (let i = 0; i < n; i++) { let f = grids.get(B[i]); if (!f) grids.set(B[i], f = nearGrid(P, L[B[i]] || [], .008)); R[i] = Math.max(0, f(Q[i * 3], Q[i * 3 + 1], Q[i * 3 + 2])); }
  return (d.roots[key] = R);
}
/* a geometry for the accessories, skinned to the body's skeleton, coat and ink data like the body's own extremities.
   Without pads its leather is fur (the beans' relief stays, as the lofted toes keep theirs); without claws it is the
   skin alone. o.under: the body's skin not drawn under it */
function partGeometry(m, d, Q, N, SI, SW, B, s, o) {
  const n = Q.length / 3, g = new THREE.BufferGeometry(), I = d.tris[s][o.claws ? 0 : 1], key = +o.pads + 2 * o.claws;
  // (the kinds and the lines, the same on every fitting: made once for each way of wearing it)
  const [line, E] = (d.attrs = d.attrs || {})[key] || (d.attrs[key] = (() => { const line = new Float32Array(n * 4), E = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { line[i * 4 + 3] = -1; const k = d.kind[i]; furPack(E, i * 4, 0, 1, 0, k === 0 || k === 2 && !o.pads ? 1 : k, 0); }
    return [line, E]; })());
  g.setAttribute('position', new THREE.BufferAttribute(Q, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N || partNormals(Q, I, n), 3));
  g.setAttribute('aLine', new THREE.BufferAttribute(line, 4)); g.setAttribute('aEye', new THREE.BufferAttribute(E, 4));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4)); g.setIndex(new THREE.BufferAttribute(I, 1));
  g.setAttribute('aRoot', new THREE.BufferAttribute(partRoots(m, d, s + +o.claws, Q, B), 1)); g.setAttribute('aHide', new THREE.BufferAttribute(new Float32Array(n), 1));
  g.userData.skin = true; g.userData.part = d.id; g.userData.under = o.under;
  return g;
}
/* the paw-hand on one side: each canonical bone (the palm's, then three per finger) has a frame — origin at its joint, y
   along it, z toward the back of the hand — and so has the character's; a vertex goes where its bones' frames take it
   (each bone's map an affine matrix: the canonical frame's coordinates, stretched along the bone and scaled across it,
   laid in the character's) */
function fitHand(m, d, s) {
  const J = m.J, jv = n => new V3(J[FIG.jIdx[n] * 3], J[FIG.jIdx[n] * 3 + 1], J[FIG.jIdx[n] * 3 + 2]), mir = s === 'R' ? -1 : 1;
  const cj = (f, k) => { const p = d.J[f][k]; return new V3(p[0] * mir, p[1], p[2]); }, back = m.handAxes[s].n.clone().negate();
  const frame = (o, a, up) => { const y = a.clone().normalize(), z = up.clone().addScaledVector(y, -up.dot(y)).normalize(); return {o, x: new V3().crossVectors(y, z), y, z, len: a.length()}; };
  const W0 = jv('wrist' + s), k = jv(`f${s}20`).distanceTo(W0) / cj(2, 0).length();
  const map = (C, A, along) => { const M = new Float64Array(12), ax = ['x', 'y', 'z'], sc = [k, along, k];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) M[r * 3 + c] = ax.reduce((t, a, q) => t + A[a].getComponent(r) * sc[q] * C[a].getComponent(c), 0);
    for (let r = 0; r < 3; r++) M[9 + r] = A.o.getComponent(r) - M[r * 3] * C.o.x - M[r * 3 + 1] * C.o.y - M[r * 3 + 2] * C.o.z;
    return M; };
  // per bone: the skin's map and the claws' (claws keep their shape: scaled by the hand's size only)
  const F = d.bones.map(b => {
    if (b === 'wrist') { const C = frame(new V3(), cj(2, 0), new V3(0, 0, 1)), A = frame(W0, jv(`f${s}20`).sub(W0), back), M = map(C, A, k); return [M, M]; }
    const f = +b[1], j = +b[2], oc = cj(f, j), oa = jv(`f${s}${f}${j}`), na = j < 2 ? jv(`f${s}${f}${j + 1}`) : jv(`tip${s}${f}`);
    const C = frame(oc, cj(f, j + 1).sub(oc), new V3(0, 0, 1)), A = frame(oa, na.sub(oa), back), M = map(C, A, k);
    // (the claw is held at the finger's tip, which the skin's stretch along the segment takes to the rig's: held at the
    // joint, a claw on a segment shorter than the sculpt's stood off the end of the finger)
    for (let a = 0; a < 3; a++) M[9 + a] += A.y.getComponent(a) * (A.len - k * C.len);
    return [map(C, A, A.len / C.len), M];
  });
  const claws = !!ANIMAL_LEGS[legSp(m.body)].hand, n = claws ? d.n : d.ns, Q = new Float32Array(n * 3), SI = new Uint16Array(n * 4), SW = new Float32Array(n * 4), B = new Int32Array(n);
  const bone = d.bones.map(b => FIG.jIdx[b === 'wrist' ? 'wrist' + s : `f${s}${b.slice(1)}`]), arm = FIG.jIdx['elbow' + s], DP = d.P;   // (the rig names fingers fL00 … fR42)
  for (let i = 0; i < n; i++) {
    const x = DP[i * 3] * mir, y = DP[i * 3 + 1], z = DP[i * 3 + 2], cl = d.kind[i] === 3 ? 1 : 0; let ox = 0, oy = 0, oz = 0;
    for (let c = 0; c < 4; c++) {
      const w = d.w.sw[i * 4 + c], bi = d.w.si[i * 4 + c]; SI[i * 4 + c] = bone[bi]; SW[i * 4 + c] = w; if (!w) continue;
      const M = F[bi][cl]; ox += w * (M[0] * x + M[1] * y + M[2] * z + M[9]); oy += w * (M[3] * x + M[4] * y + M[5] * z + M[10]); oz += w * (M[6] * x + M[7] * y + M[8] * z + M[11]);
    }
    Q[i * 3] = ox; Q[i * 3 + 1] = oy; Q[i * 3 + 2] = oz;
    // its root's bone: its strongest; the stub that reaches back over the wrist lies on the forearm's skin
    B[i] = d.w.si[i * 4] === 0 && y < 0 ? arm : bone[d.w.si[i * 4]];
  }
  (m.pawFist = m.pawFist || {})[s] = pawFist(m, d, s, Q, SI, SW);
  // the body's hand under it is hidden whole: the paw is what the hand is now, and the human fingers, thicker than the
  // sculpt's here and there, would show through it (its edge at the wrist lies inside the paw's stub of forearm)
  const L = domLists(m), under = Int32Array.from(bone.flatMap(b => Array.from(L[b] || [])));
  return partGeometry(m, d, Q, null, SI, SW, B, s, {pads: padsOn(m.body), claws, under});
}
/* A clawed hand closes as a paw does (HAND_SHAPES: the last joints a little bent), as far as the pads of its finger tips
   rest on the palm and the claws on it; the sculpt is thicker than the remodelled hand that fist was set for, and closed
   all the way its finger tips sank a centimetre into the palm, their claws through it, the thumb's into the fingers it
   closes over. So the fist is closed here, in the rest frame (each finger bone turned about its curl axis as applyHands
   turns it, the paw skinned as it will be), and each finger's closing is found (bisected) at which its last segment and
   its claw go no more than a millimetre and a half into the palm; then the thumb's, over the fingers closed so. The
   pose closes no finger further (applyHands, m.pawFist: what a hand's c asks past it is the paw's fist). Found once for
   each set of hand proportions (a few milliseconds) */
function pawFist(m, d, s, P, SI, SW) {
  const J = m.J, jv = n => new V3(J[FIG.jIdx[n] * 3], J[FIG.jIdx[n] * 3 + 1], J[FIG.jIdx[n] * 3 + 2]), A = m.handAxes[s], S = handShape(m.body), W0 = jv('wrist' + s);
  const tip = [0, 1, 2, 3, 4].map(f => jv(`tip${s}${f}`)), pl = jv(`f${s}20`).distanceTo(W0);
  // (both sides alike, as a body is: a mirror's fist is the same)
  const key = [0, 1, 2, 3, 4].flatMap(f => [0, 1, 2].map(k => Math.round(jv(`f${s}${f}${k}`).distanceTo(k < 2 ? jv(`f${s}${f}${k + 1}`) : tip[f]) / pl * 20))).join() + (S === HAND_SHAPES.garra ? 'g' : '');
  return (d.fist = d.fist || {})[key] || (d.fist[key] = (() => {
    const n = P.length / 3, ns = Math.min(n, d.ns), fing = new Int8Array(FIG.meta.bones.length).fill(-1), q = new Q(), r = new V3(), lim = new Float32Array(5).fill(1);
    for (let f = 0; f < 5; f++) for (let k = 0; k < 3; k++) fing[FIG.jIdx[`f${s}${f}${k}`]] = f;
    // a finger's bones in its fist closed to c, each a matrix (a point p goes to R p + t): its rest joint o goes to p0, turned by q
    const maps = (M, f, c) => { const ang = f ? S.curl : S.tcurl; let p0 = jv(`f${s}${f}0`), qa = new Q();
      for (let k = 0; k < 3; k++) { const o = jv(`f${s}${f}${k}`); if (k) p0 = p0.clone().add(o.clone().sub(jv(`f${s}${f}${k - 1}`)).applyQuaternion(qa));
        qa = qa.clone().multiply(q.setFromAxisAngle(A.fingers[f].curl[k], c * ang[k] * DEG));
        const e = new THREE.Matrix4().makeRotationFromQuaternion(qa).elements, B = new Float64Array(12); [B[0], B[1], B[2], B[3], B[4], B[5], B[6], B[7], B[8]] = [e[0], e[4], e[8], e[1], e[5], e[9], e[2], e[6], e[10]];
        for (let a = 0; a < 3; a++) B[9 + a] = p0.getComponent(a) - B[a * 3] * o.x - B[a * 3 + 1] * o.y - B[a * 3 + 2] * o.z;
        M[FIG.jIdx[`f${s}${f}${k}`]] = B; }
      return M; };
    const pose = (i, M) => { const px = P[i * 3], py = P[i * 3 + 1], pz = P[i * 3 + 2]; let x = 0, y = 0, z = 0;
      for (let c = 0; c < 4; c++) { const w = SW[i * 4 + c]; if (!w) continue; const B = M[SI[i * 4 + c]];
        if (B) { x += w * (B[0] * px + B[1] * py + B[2] * pz + B[9]); y += w * (B[3] * px + B[4] * py + B[5] * pz + B[10]); z += w * (B[6] * px + B[7] * py + B[8] * pz + B[11]); } else { x += w * px; y += w * py; z += w * pz; } }
      return r.set(x, y, z); };
    // how far a finger's tip (its last segment's skin and its claw) goes into a surface (X, N, near: a grid of its points)
    // (every third point of them: they lie a millimetre or two apart)
    const tips = [0, 1, 2, 3, 4].map(f => { const b2 = FIG.jIdx[`f${s}${f}2`], out = []; for (let i = 0; i < n; i++) if (SI[i * 4] === b2 && !(out.length && i % 3)) out.push(i); return out; });
    const depth = (f, c, base, X, N, near) => { const M = maps({...base}, f, c); let dp = 0;
      for (const i of tips[f]) { pose(i, M); const j = near(r.x, r.y, r.z); if (j < 0 || fing[SI[j * 4]] === f) continue;
        dp = Math.max(dp, -((r.x - X[j * 3]) * N[j * 3] + (r.y - X[j * 3 + 1]) * N[j * 3 + 1] + (r.z - X[j * 3 + 2]) * N[j * 3 + 2])); }
      return dp; };
    const close = (f, base, X, N, near) => { if (depth(f, 1, base, X, N, near) <= .0015) return 1; let lo = 0, hi = 1;
      for (let k = 0; k < 6; k++) { const c = (lo + hi) / 2; if (depth(f, c, base, X, N, near) <= .0015) lo = c; else hi = c; } return lo; };
    // the fingers against the palm (the skin no finger carries most), at rest
    const N0 = partNormals(P, d.tris[s][1], ns), palm = []; for (let i = 0; i < ns; i++) if (fing[SI[i * 4]] < 0) palm.push(i);
    const nearPalm = nearGrid(P, palm, .006);
    for (let f = 1; f < 5; f++) lim[f] = close(f, {}, P, N0, nearPalm);
    // the thumb against the palm and the fingers closed so
    const M = {}; for (let f = 1; f < 5; f++) maps(M, f, lim[f]);
    const X = new Float32Array(ns * 3), rest = []; for (let i = 0; i < ns; i++) { pose(i, M); X[i * 3] = r.x; X[i * 3 + 1] = r.y; X[i * 3 + 2] = r.z; if (fing[SI[i * 4]] !== 0) rest.push(i); }
    lim[0] = close(0, M, X, partNormals(X, d.tris[s][1], ns), nearGrid(X, rest, .006));
    return lim;
  })());
}
/* the hind paw on one side, rigid on the ankle (the rig has no toe bones). The leg's last segment runs from the hock down
   to the ball of the foot (remodelLegs lays its shaft on the line from the hock to the ball, not to the toe point, which
   is over the toes: laid on that, the stub stood in front of the leg, a second shin), and the sculpt's own stub of
   metatarsus is laid along that shaft: its heel where the shaft is as high above the ground, its slope bent at the
   heel into the shaft's (a wolf's metatarsus stands at 70°, the sculpt's stub at 55–60°); the paw reaches forward from
   there (toward the rig's toe point), flat on the ground, as wide as the leg's paw frame (pawFrame) says */
function fitFoot(m, d, s) {
  const L = legSpec(m.body), fr = pawFrame(L, m.J, s), J = m.J, jv = n => new V3(J[FIG.jIdx[n] * 3], J[FIG.jIdx[n] * 3 + 1], J[FIG.jIdx[n] * 3 + 2]), mir = s === 'R' ? -1 : 1;
  const A = jv('ankle' + s), T = jv('toe' + s), up = new V3(0, 1, 0), fwd = T.clone().sub(A).setY(0).normalize(), side = up.clone().cross(fwd), ai = FIG.jIdx['ankle' + s];
  // the sculpt's stub, measured on it once: its axis' place at the heel's height (.22 up) and its slope
  const st = d.stub || (d.stub = (() => { const mid = z => { let y0 = Infinity, y1 = -Infinity; for (let i = 0; i < d.ns; i++) if (Math.abs(d.P[i * 3 + 2] - z) < .02) { y0 = Math.min(y0, d.P[i * 3 + 1]); y1 = Math.max(y1, d.P[i * 3 + 1]); } return (y0 + y1) / 2; };
    const a = mid(.5), b = mid(.7); return a > b ? {hy: a + (a - b) / .2 * .28, a: Math.atan2(.2, a - b)} : {hy: .16, a: 55 * DEG}; })());
  // the leg's shaft: a line fitted through the middles of its skin (what the ankle carries) in bands from a quarter to
  // seven tenths of the hock's height, between the body's paw and the hock's knob (a band holds a few vertices only)
  const P = m.geo.attributes.position.array, ankle = domLists(m)[ai] || [], S = new Float64Array(7), NB = 10, Bx = new Float64Array(NB * 5).fill(Infinity), bh = (A.y - fr.g) * .05;
  for (const i of ankle) { const k = Math.round((P[i * 3 + 1] - fr.g) / bh) - 5; if (k < 0 || k >= NB) continue; const o = k * 5, x = P[i * 3], z = P[i * 3 + 2];
    Bx[o] = Math.min(Bx[o], x); Bx[o + 1] = Math.min(Bx[o + 1], -x); Bx[o + 2] = Math.min(Bx[o + 2], z); Bx[o + 3] = Math.min(Bx[o + 3], -z); Bx[o + 4] = (isFinite(Bx[o + 4]) ? Bx[o + 4] : 0) + 1; }
  for (let k = 0; k < NB; k++) { const o = k * 5, c = Bx[o + 4]; if (!(c >= 3)) continue;
    const h = fr.g + (k + 5) * bh, x = (Bx[o] - Bx[o + 1]) / 2, z = (Bx[o + 2] - Bx[o + 3]) / 2; S[0] += c; S[1] += c * h; S[2] += c * h * h; S[3] += c * x; S[4] += c * x * h; S[5] += c * z; S[6] += c * z * h; }
  const k = fr.W / d.Fw, hz = .22 * k, det = S[0] * S[2] - S[1] * S[1], yh = fr.g + hz;
  let heel, rise = 70 * DEG;
  if (S[0] > 6 && det > 1e-9) { const bx = (S[0] * S[4] - S[1] * S[3]) / det, bz = (S[0] * S[6] - S[1] * S[5]) / det, my = S[1] / S[0];
    heel = new V3(S[3] / S[0] + bx * (yh - my), yh, S[5] / S[0] + bz * (yh - my)); rise = Math.atan2(1, Math.hypot(bx, bz)); }
  else heel = T.clone().lerp(A, clamp((yh - T.y) / (A.y - T.y), 0, 1));
  const O = heel.clone().addScaledVector(fwd, -st.hy * k); O.y = fr.g;
  const claws = !!pawOf(L).claw, n = claws ? d.n : d.ns, Q = new Float32Array(n * 3), N = new Float32Array(n * 3), SI = new Uint16Array(n * 4), SW = new Float32Array(n * 4);
  // the bend: about the heel, none at it, all of it a fifth of the paw's length up the stub
  const dA = clamp(rise - st.a, -25 * DEG, 25 * DEG), ca = Math.cos(st.a), sa = Math.sin(st.a);
  // canonical +x is toward the body's midline: on the left foot that is the character's −x
  for (let i = 0; i < n; i++) {
    let y = d.P[i * 3 + 1] - st.hy, z = d.P[i * 3 + 2] - .22, ny = d.N[i * 3 + 1], nz = d.N[i * 3 + 2];
    const b = -dA * sstep(0, .2, -y * ca + z * sa);
    if (b) { const c = Math.cos(b), sn = Math.sin(b); [y, z, ny, nz] = [y * c - z * sn, y * sn + z * c, ny * c - nz * sn, ny * sn + nz * c]; }
    const x = -d.P[i * 3] * mir, nx = -d.N[i * 3] * mir; y += st.hy; z += .22;
    Q[i * 3] = O.x + (side.x * x + fwd.x * y) * k; Q[i * 3 + 1] = O.y + z * k; Q[i * 3 + 2] = O.z + (side.z * x + fwd.z * y) * k;
    N[i * 3] = side.x * nx + fwd.x * ny; N[i * 3 + 1] = nz; N[i * 3 + 2] = side.z * nx + fwd.z * ny;
    SI[i * 4] = ai; SW[i * 4] = 1;
  }
  // its toe point, as the rig's (over the front of the toes, a tenth of the paw's width up): the sculpt reaches well past
  // the rig's, and a kneeling leg brings this one down to the floor (kneelPaws)
  let front = 0; for (let i = 1; i < n; i++) if ((Q[i * 3] - Q[front * 3]) * fwd.x + (Q[i * 3 + 2] - Q[front * 3 + 2]) * fwd.z > 0) front = i;
  (m.pawToe = m.pawToe || {})[s] = new V3(Q[front * 3], fr.g + .1 * fr.W, Q[front * 3 + 2]);
  /* the body's skin it covers: what the ankle carries inside it (behind the nearest of its skin's points, or less than a
     millimetre and a half before it; partUnder). So the leg above the paw and a trouser's hem over the hock are drawn down
     to where the paw takes over, and no hole opens between them */
  const near = nearGrid(Q, Int32Array.from({length: Math.min(n, d.ns)}, (_, i) => i), .012), cov = new Uint8Array(FIG.meta.nV);
  for (const i of ankle) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], j = near(x, y, z);
    if (j >= 0 && (x - Q[j * 3]) * N[j * 3] + (y - Q[j * 3 + 1]) * N[j * 3 + 1] + (z - Q[j * 3 + 2]) * N[j * 3 + 2] < .0015) cov[i] = 1;
  }
  return partGeometry(m, d, Q, N, SI, SW, new Int32Array(n).fill(ai), s, {pads: padsOn(m.body), claws, under: partUnder(cov, ankle)});
}
// none where the limb ends above it (limb differences: the stump closes over the cut)
function handPartGeos(m) {
  m.pawFist = null; const d = partReady(m, partFor(m.body, 'hand')); if (!d || !m.handAxes) return null;
  return ['L', 'R'].filter(s => limbCut(m.body, 'arm' + s) == null).map(s => fitHand(m, d, s));
}
function footPartGeos(m) {
  m.pawToe = null; const d = partReady(m, partFor(m.body, 'foot')); if (!d) return null;
  return ['L', 'R'].filter(s => limbCut(m.body, 'leg' + s) == null).map(s => fitFoot(m, d, s));
}
/* clothes hide a part where they hide its roots: the garments' state (what they hide, 1, and what they only cover, .5,
   drawn but not outlined), copied before the skin under the parts is hidden, which is the parts' own doing; then the
   body's skin each part covers is not drawn (aHide, as under clothes) */
function hideUnderParts(m, H) {
  const parts = (m.acc || []).filter(a => !a.userData.hull && a.geometry.userData.part);
  for (const a of parts) { const g = a.geometry, R = g.attributes.aRoot.array, A = g.attributes.aHide.array; for (let i = 0; i < A.length; i++) A[i] = H[R[i]]; g.attributes.aHide.needsUpdate = true; }
  for (const a of parts) for (const i of a.geometry.userData.under) H[i] = 1;
}
