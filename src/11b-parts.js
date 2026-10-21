/* ======================= sculpted anthro parts: paw-hands and hind paws =======================
   Like the sculpted heads, but made here: each part is sculpted offline as a signed distance field round a canonical
   skeleton (tools/parts: round cones, ellipsoids and smooth unions, measured on real anatomy and furry art — palm as
   wide as long, fingers 1 : .67 : .57, a heart-shaped palm pad with three lobes toward the wrist, claws hooded at the root
   and as deep as 1.4 their width), cleaned up in Blender and baked with its bone weights. On a body it replaces the
   human hand or foot: every canonical bone's frame is carried onto the character's own bone (moved, turned, stretched
   along it, scaled across it by the hand's size), so the paw fits any build, and it is skinned to those bones, so it
   curls, grips and poses like the hand it stands for. The human part under it is hidden. */
const PARTS = {cache: new Map()};
const PART_FAMILY = {lobo: 'canid', zorro: 'canid', perro: 'canid', conejo: 'canid', gato: 'felid', tigre: 'felid', leon: 'felid', oso: 'bear', dragon: 'dragon'};
function partFor(b, kind) {
  if (!b || b.species === 'humano') return null;
  if (kind === 'hand' && (b.paws === 'humanas' || !handShape(b) || handShape(b) === HAND_SHAPES.pezuna)) return null;
  if (kind === 'foot') { const L = legSpec(b); if (!L || L.type !== 'digi') return null; }
  const fam = PART_FAMILY[legSp(b)] || PART_FAMILY[b.species]; if (!fam) return null;
  const id = `${kind}-${fam}`; return PART_LIST.includes(id) ? id : null;
}
const PART_LIST = ['hand-canid', 'hand-felid', 'hand-bear', 'hand-dragon', 'foot-canid', 'foot-felid'];
function loadPart(id) {
  if (PARTS.cache.has(id)) return PARTS.cache.get(id);
  const p = fetch(`parts/${id}.txt`).then(r => { if (!r.ok) throw new Error(r.status); return r.text(); })
    .then(b64 => { const bin = atob(b64.trim()), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return gunzip(u8.buffer); })
    .then(buf => {
      const hl = new DataView(buf).getUint32(0, true), h = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hl))), b0 = 4 + hl, o = h.offs, n = h.n;
      return {...h, id, P: new Float32Array(buf, b0 + o[0], n * 3), idx: h.big ? new Uint32Array(buf, b0 + o[1], h.nt * 3) : new Uint16Array(buf, b0 + o[1], h.nt * 3),
        kind: new Uint8Array(buf, b0 + o[2], n), si: new Uint8Array(buf, b0 + o[3], n * 4), sw: new Uint8Array(buf, b0 + o[4], n * 4)};
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
// a geometry for the accessories, skinned to the body's skeleton, coat and ink data like the body's own extremities
function partGeometry(d, Q, SI, SW, mirror) {
  const n = d.n, g = new THREE.BufferGeometry(), idx = Array.from(d.idx);
  if (mirror) for (let t = 0; t < idx.length; t += 3) { const a = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = a; }
  const line = new Float32Array(n * 4), E = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { line[i * 4 + 3] = -1; const k = d.kind[i]; furPack(E, i * 4, 0, 1, 0, k === 0 ? 1 : k, 0); }
  g.setAttribute('position', new THREE.BufferAttribute(Q, 3)); g.setAttribute('aLine', new THREE.BufferAttribute(line, 4)); g.setAttribute('aEye', new THREE.BufferAttribute(E, 4));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
  g.setIndex(idx); g.computeVertexNormals(); g.userData.skin = true; g.userData.part = d.id;
  return g;
}
/* the paw-hand on one side: each canonical bone (the palm's, then three per finger) has a frame — origin at its joint, y
   along it, z toward the back of the hand — and so has the character's; a vertex goes where its bones' frames take it */
function fitHand(m, d, s) {
  const J = m.J, jv = n => new V3(J[FIG.jIdx[n] * 3], J[FIG.jIdx[n] * 3 + 1], J[FIG.jIdx[n] * 3 + 2]), mir = s === 'R' ? -1 : 1;
  const cj = (f, k) => { const p = d.J[f][k]; return new V3(p[0] * mir, p[1], p[2]); }, back = m.handAxes[s].n.clone().negate();
  const frame = (o, a, up) => { const y = a.clone().normalize(), z = up.clone().addScaledVector(y, -up.dot(y)).normalize(); return {o, x: new V3().crossVectors(y, z), y, z, len: a.length()}; };
  const W0 = jv('wrist' + s), k = jv(`f${s}20`).distanceTo(W0) / cj(2, 0).length();
  const F = d.bones.map(b => {
    if (b === 'wrist') return [frame(new V3(), cj(2, 0), new V3(0, 0, 1)), frame(W0, jv(`f${s}20`).sub(W0), back), k];
    const f = +b[1], j = +b[2], oc = cj(f, j), oa = jv(`f${s}${f}${j}`), na = j < 2 ? jv(`f${s}${f}${j + 1}`) : jv(`tip${s}${f}`);
    const c = frame(oc, cj(f, j + 1).sub(oc), new V3(0, 0, 1)), a = frame(oa, na.sub(oa), back);
    return [c, a, a.len / c.len];
  });
  const n = d.n, Q = new Float32Array(n * 3), SI = new Uint16Array(n * 4), SW = new Float32Array(n * 4), v = new V3(), l = new V3(), out = new V3();
  const bone = d.bones.map(b => FIG.jIdx[b === 'wrist' ? 'wrist' + s : `f${s}${b.slice(1)}`]);   // (the rig names fingers fL00 … fR42)
  for (let i = 0; i < n; i++) {
    v.set(d.P[i * 3] * mir, d.P[i * 3 + 1], d.P[i * 3 + 2]); out.set(0, 0, 0);
    for (let c = 0; c < 4; c++) {
      const w = d.sw[i * 4 + c] / 255, bi = d.si[i * 4 + c]; SI[i * 4 + c] = bone[bi]; SW[i * 4 + c] = w; if (!w) continue;
      const [C, A, ax] = F[bi], along = d.kind[i] === 3 ? k : ax;   // claws keep their shape: stretched by the hand's size only
      l.subVectors(v, C.o); const lx = l.dot(C.x) * k, ly = l.dot(C.y) * along, lz = l.dot(C.z) * k;
      out.addScaledVector(A.o, w).addScaledVector(A.x, lx * w).addScaledVector(A.y, ly * w).addScaledVector(A.z, lz * w);
    }
    Q[i * 3] = out.x; Q[i * 3 + 1] = out.y; Q[i * 3 + 2] = out.z;
  }
  return partGeometry(d, Q, SI, SW, s === 'R');
}
/* the hind paw on one side: rigid on the ankle (the rig has no toe bones). The leg's last segment runs from the hock down
   to the ball of the foot on the ground (the rig's toe joint); the sculpt's own stub of metatarsus is laid along it, its
   heel where the body's shaft is as high above the ground, and the paw reaches forward from there, as wide as the leg's
   paw frame (pawFrame) says */
function fitFoot(m, d, s) {
  const L = legSpec(m.body), fr = pawFrame(L, m.J, s), J = m.J, jv = n => new V3(J[FIG.jIdx[n] * 3], J[FIG.jIdx[n] * 3 + 1], J[FIG.jIdx[n] * 3 + 2]), mir = s === 'R' ? -1 : 1;
  const A = jv('ankle' + s), T = jv('toe' + s), up = new V3(0, 1, 0), fwd = T.clone().sub(A).setY(0).normalize(), side = up.clone().cross(fwd);
  const k = fr.W / d.Fw, hz = .22 * k, heel = T.clone().lerp(A, clamp((fr.g + hz - T.y) / (A.y - T.y), 0, 1));
  const O = heel.clone().addScaledVector(fwd, -.16 * k); O.y = fr.g;
  const n = d.n, Q = new Float32Array(n * 3), SI = new Uint16Array(n * 4), SW = new Float32Array(n * 4), ai = FIG.jIdx['ankle' + s];
  // canonical +x is toward the body's midline: on the left foot that is the character's −x
  for (let i = 0; i < n; i++) {
    const x = -d.P[i * 3] * mir * k, y = d.P[i * 3 + 1] * k, z = d.P[i * 3 + 2] * k;
    Q[i * 3] = O.x + side.x * x + fwd.x * y; Q[i * 3 + 1] = O.y + z; Q[i * 3 + 2] = O.z + side.z * x + fwd.z * y;
    SI[i * 4] = ai; SW[i * 4] = 1;
  }
  return partGeometry(d, Q, SI, SW, s === 'R');
}
function handPartGeos(m) {
  const d = partReady(m, partFor(m.body, 'hand')); if (!d || !m.handAxes) return null;
  return ['L', 'R'].filter(s => !(m.stumps && m.stumps['arm' + s])).map(s => fitHand(m, d, s));
}
function footPartGeos(m) {
  const d = partReady(m, partFor(m.body, 'foot')); if (!d) return null;
  return ['L', 'R'].filter(s => !(m.stumps && m.stumps['leg' + s])).map(s => fitFoot(m, d, s));
}
// the body's own hand and toes under a sculpted part are not drawn (aHide, as under clothes)
function hideUnderParts(m, H) {
  const hand = partFor(m.body, 'hand') && PARTS[partFor(m.body, 'hand')], foot = partFor(m.body, 'foot') && PARTS[partFor(m.body, 'foot')];
  if (!hand && !foot) return;
  const nV = FIG.meta.nV, P = m.geo.attributes.position.array, sides = ['L', 'R'];
  const handBones = new Set(), footY = {};
  if (hand) for (const s of sides) { handBones.add(FIG.jIdx['wrist' + s]); for (let f = 0; f < 5; f++) for (let k = 0; k < 3; k++) handBones.add(FIG.jIdx[`f${s}${f}${k}`]); }
  if (foot) for (const s of sides) { const fr = pawFrame(legSpec(m.body), m.J, s); footY[FIG.jIdx['ankle' + s]] = fr.g + .55 * fr.W; }
  for (let i = 0; i < nV; i++) { const b = m.dom[i]; if (handBones.has(b) || footY[b] !== undefined && P[i * 3 + 1] < footY[b]) H[i] = 1; }
}
