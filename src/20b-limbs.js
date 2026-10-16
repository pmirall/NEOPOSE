/* ======================= limb differences and prostheses =======================
   Any arm or leg can end at a chosen level (from the shoulder or the hip down to the wrist, the ankle or part of
   the foot). The figure's own skin closes over the end as a rounded stump: past the cut, the skin of the limb is
   drawn in onto a dome, so there is no hole and nothing to hide, and the clothes (hung on the same skin) close over it
   like a pinned-up sleeve or trouser leg. Without a prosthesis the joints that are not there do not move and their
   handles go away. A prosthesis is built on the bones (socket over the stump, elbow or knee unit, forearm or pylon,
   hand, hook, foot or running blade), so it bends and poses like the rest. In the scene there are also a wheelchair,
   crutches, a walking stick and a walking frame. */
const LIMB_CUTS = {
  arm: [['entero', 'Completo', null], ['hombro', 'Desde el hombro', .06], ['brazo', 'Por encima del codo', .55], ['codo', 'En el codo', 1], ['antebrazo', 'Por debajo del codo', 1.5], ['muneca', 'En la muñeca', 2]],
  leg: [['entera', 'Completa', null], ['cadera', 'Desde la cadera', .06], ['muslo', 'Por encima de la rodilla', .55], ['rodilla', 'En la rodilla', 1], ['pierna', 'Por debajo de la rodilla', 1.45], ['tobillo', 'En el tobillo', 2], ['pie', 'Parte del pie', 2.5]]
};
const LIMB_PROS = {arm: [['no', 'Sin prótesis'], ['mano', 'Mano'], ['bionica', 'Mano biónica'], ['gancho', 'Gancho']], leg: [['no', 'Sin prótesis'], ['pie', 'Pie'], ['lamina', 'Lámina de carrera']]};
const LIMBS = {
  armL: {kind: 'arm', s: 'L', label: 'Brazo izquierdo'}, armR: {kind: 'arm', s: 'R', label: 'Brazo derecho'},
  legL: {kind: 'leg', s: 'L', label: 'Pierna izquierda'}, legR: {kind: 'leg', s: 'R', label: 'Pierna derecha'}
};
const limbChain = (kind, s) => kind === 'arm' ? ['shoulder' + s, 'elbow' + s, 'wrist' + s, 'tip' + s + '2'] : ['hip' + s, 'knee' + s, 'ankle' + s, 'toe' + s];
const limbBones = (kind, s) => kind === 'arm' ? ['shoulder' + s, 'elbow' + s, 'wrist' + s, ...[0, 1, 2, 3, 4].flatMap(f => [0, 1, 2].map(k => `f${s}${f}${k}`))] : ['hip' + s, 'knee' + s, 'ankle' + s];
function limbCut(b, key) { const l = b.limbs && b.limbs[key]; if (!l || !l.cut) return null; const c = LIMB_CUTS[LIMBS[key].kind].find(x => x[0] === l.cut); return c ? c[2] : null; }
const limbPros = (b, key) => (b.limbs && b.limbs[key] && b.limbs[key].pros) || 'no';
// the segment a cut falls in (a cut at a joint belongs to the segment above it)
const cutSeg = t => Math.min(2, t > 0 && t % 1 === 0 ? t - 1 : Math.floor(t));

/* ---------- the stump: the skin past the cut drawn onto a dome (rest pose, before skinning) ---------- */
function limbStumps(m, P, H, J) {
  const b = m.body, nV = FIG.meta.nV, nH = FIG.nH; m.stumps = {};
  const had = m.stumpBone && m.stumpBone.some(v => v >= 0); m.stumpBone = new Int16Array(nV + nH).fill(-1);
  for (const key of Object.keys(LIMBS)) {
    const t = limbCut(b, key); if (t == null) continue;
    const {kind, s} = LIMBS[key], chain = limbChain(kind, s).map(n => new V3(J[FIG.jIdx[n] * 3], J[FIG.jIdx[n] * 3 + 1], J[FIG.jIdx[n] * 3 + 2]));
    const lens = [0, 1, 2].map(k => chain[k + 1].distanceTo(chain[k])), cum = [0, lens[0], lens[0] + lens[1], lens[0] + lens[1] + lens[2]];
    const k = cutSeg(t), f = t - k, u = chain[k + 1].clone().sub(chain[k]).normalize(), C = chain[k].clone().lerp(chain[k + 1], f), sc = cum[k] + f * lens[k];
    const band = Math.min(.08 * m.size, .45 * lens[k]), set = new Set(limbBones(kind, s).map(n => FIG.jIdx[n]));
    // which points belong to the limb (mostly its bones), and how far along it they are
    const along = (x, y, z) => { let best = Infinity, sv = 0; const v = new V3(x, y, z);
      for (let q = 0; q < 3; q++) { const a = chain[q], d = chain[q + 1].clone().sub(a), L2 = d.lengthSq(), p = clamp(v.clone().sub(a).dot(d) / L2, 0, 1), dist = v.distanceToSquared(a.clone().addScaledVector(d, p)); if (dist < best) { best = dist; sv = cum[q] + p * lens[q]; } }
      return sv; };
    const member = (si, sw, j) => { let g = 0, tt = 0; for (let c = 0; c < 4; c++) { const w = sw[j * 4 + c]; tt += w; if (set.has(si[j * 4 + c])) g += w; } return tt && g / tt >= .5; };
    const pts = [[P, nV, FIG.si, FIG.sw], [H, nH, FIG.hsi, FIG.hsw]];  // body vertices, and the helper points clothes hang on
    // the radius of the limb at the cut
    let rs = 0, rn = 0; const v = new V3(), rv = new V3();
    for (const [A, n, si, sw] of pts) { if (!si) continue; for (let i = 0; i < n; i++) { if (!member(si, sw, i)) continue; const sv = along(A[i * 3], A[i * 3 + 1], A[i * 3 + 2]); if (Math.abs(sv - sc) > band * .35) continue;
      v.set(A[i * 3], A[i * 3 + 1], A[i * 3 + 2]).sub(C); rv.copy(v).addScaledVector(u, -v.dot(u)); rs += rv.length(); rn++; } }
    const r0 = rn ? rs / rn : .04 * m.size, h = r0 * .75, segBone = FIG.jIdx[limbChain(kind, s)[k]];
    for (const [A, n, si, sw, off] of [[P, nV, FIG.si, FIG.sw, 0], [H, nH, FIG.hsi, FIG.hsw, nV]]) {
      if (!si) continue;
      for (let i = 0; i < n; i++) {
        if (!member(si, sw, i)) continue;
        const sv = along(A[i * 3], A[i * 3 + 1], A[i * 3 + 2]); if (sv <= sc) continue;
        const x = Math.min(1, (sv - sc) / band), phi = x * Math.PI / 2;
        v.set(A[i * 3], A[i * 3 + 1], A[i * 3 + 2]).sub(C); rv.copy(v).addScaledVector(u, -v.dot(u)); const r = Math.min(rv.length(), r0 * 1.3); if (rv.lengthSq() > 1e-12) rv.normalize();
        const p = C.clone().addScaledVector(u, h * Math.sin(phi)).addScaledVector(rv, r * Math.cos(phi));
        A[i * 3] = p.x; A[i * 3 + 1] = p.y; A[i * 3 + 2] = p.z; m.stumpBone[off + i] = segBone;
      }
    }
    m.stumps[key] = {t, k, C, u, r0, h};
  }
  // the skin drawn onto the stump hangs on the bone of the stump only (the hand or foot bones would pull it about)
  if (had || Object.keys(m.stumps).length) {
    const SI = m.geo.attributes.skinIndex.array, SW = m.geo.attributes.skinWeight.array;
    for (let i = 0; i < nV * 4; i++) { SI[i] = FIG.si[i]; SW[i] = FIG.sw[i] / 255; }
    for (let i = 0; i < nV; i++) if (m.stumpBone[i] >= 0) { SI[i * 4] = m.stumpBone[i]; SW[i * 4] = 1; for (let c = 1; c < 4; c++) { SI[i * 4 + c] = 0; SW[i * 4 + c] = 0; } }
    m.geo.attributes.skinIndex.needsUpdate = m.geo.attributes.skinWeight.needsUpdate = true;
  }
}
// clothes over a stump: the same
function limbGarmentSkin(m, d, geo) {
  const SI = geo.attributes.skinIndex.array, SW = geo.attributes.skinWeight.array, B = m.stumpBone, R = d.refs; if (!B) return;
  for (let i = 0; i < d.n; i++) { const b = B[R[i * 3]]; if (b >= 0) { SI[i * 4] = b; SW[i * 4] = 1; for (let c = 1; c < 4; c++) { SI[i * 4 + c] = 0; SW[i * 4 + c] = 0; } } else { for (let c = 0; c < 4; c++) { SI[i * 4 + c] = d.si[i * 4 + c]; SW[i * 4 + c] = d.sw[i * 4 + c] / 255; } } }
  geo.attributes.skinIndex.needsUpdate = geo.attributes.skinWeight.needsUpdate = true;
}

/* ---------- prostheses: parts on the bones ---------- */
const PROS_MAT = {};
function prosMats() {
  if (!PROS_MAT.carbon) Object.assign(PROS_MAT, {carbon: M(0x34363a, {r: .5, m: .3}), metal: M(0x9aa0a6, {r: .35, m: .8}), shell: M(0xd8cdbd, {r: .8}), socket: M(0x5a6470, {r: .55, m: .1}), accent: M(0x2b5a9e, {r: .4, m: .2}), grip: M(0x2a2a2a, {r: .9})});
  return PROS_MAT;
}
// a tapered rod from a to b (in the parent's frame)
function rod(parent, mat, a, b, r1, r2 = r1, seg = 20) {
  const d = b.clone().sub(a), L = d.length(); if (L < 1e-5) return null;
  const g = new THREE.CylinderGeometry(r2, r1, L, seg), mm = new THREE.Mesh(g, mat);
  mm.position.copy(a).addScaledVector(d, .5); mm.quaternion.setFromUnitVectors(new V3(0, 1, 0), d.normalize()); mm.castShadow = mm.receiveShadow = true; parent.add(mm); return mm;
}
function blob(parent, mat, c, sx, sy, sz, q) { const mm = new THREE.Mesh(G.sph(), mat); mm.position.copy(c); mm.scale.set(sx, sy, sz); if (q) mm.quaternion.copy(q); mm.castShadow = mm.receiveShadow = true; parent.add(mm); return mm; }
function limbsAfterBuild(m) {
  for (const g of m.prosthetics || []) { g.parent && g.parent.remove(g); g.traverse(o => { if (o.isMesh && o.geometry !== G.sph()) o.geometry.dispose(); }); }
  m.prosthetics = []; m._limbLock = new Set(); m._limbHide = new Set();
  if (!m.stumps) return;
  const J = m.J, jp = n => new V3(J[FIG.jIdx[n] * 3], J[FIG.jIdx[n] * 3 + 1], J[FIG.jIdx[n] * 3 + 2]), S = m.size, mats = prosMats();
  for (const [key, st] of Object.entries(m.stumps)) {
    const {kind, s} = LIMBS[key], pros = limbPros(m.body, key), chain = limbChain(kind, s), bones = chain.slice(0, 3).map(n => m.joints[n] || m.bones[FIG.jIdx[n]]);
    if (pros === 'no') {  // what is not there does not move
      for (let q = Math.ceil(st.t - 1e-6); q < 3; q++) if (q > 0) m._limbLock.add(chain[q]);
      if (kind === 'arm' && st.t < 2.4) { m._limbLock.add('wrist' + s); m._limbHide.add('hand' + s); }
      if (kind === 'leg' && st.t < 2.4) { m._limbHide.add('foot' + s); if (st.t <= 2) m._limbLock.add('ankle' + s); }
      continue;
    }
    // parts in each bone's own frame (bones rest axis-aligned at their joint)
    const part = q => { const g = new THREE.Group(); g.userData.prosthesis = key; bones[q].add(g); m.prosthetics.push(g); return g; };
    const local = (q, p) => p.clone().sub(jp(chain[q]));
    const P0 = jp(chain[0]), P1 = jp(chain[1]), P2 = jp(chain[2]), P3 = jp(chain[3]), r = st.r0, k = st.k;
    // the socket over the stump
    const sk = part(k), top = st.C.clone().addScaledVector(st.u, -Math.min(.11 * S, chain[k + 1] ? jp(chain[k + 1]).distanceTo(jp(chain[k])) * .5 : .1)), end = st.C.clone().addScaledVector(st.u, st.h * .9);
    rod(sk, mats.socket, local(k, top), local(k, end), r * 1.03, r * .95, 24); blob(sk, mats.socket, local(k, end), r * .95, r * .45, r * .95, new Q().setFromUnitVectors(new V3(0, 1, 0), st.u));
    rod(sk, mats.carbon, local(k, top), local(k, top.clone().addScaledVector(st.u, .012 * S)), r * 1.07, r * 1.07, 24);  // the rim
    if (kind === 'arm') {
      // above the elbow: an elbow unit and a forearm; below it, a forearm shell from the socket to the wrist
      if (k === 0) { if (st.t < 1) rod(sk, mats.carbon, local(0, end), local(0, P1), .024 * S, .026 * S); const e = part(1); blob(e, mats.metal, new V3(), .032 * S, .032 * S, .032 * S); rod(e, mats.carbon, new V3(-.035 * S, 0, 0), new V3(.035 * S, 0, 0), .022 * S); rod(e, mats.carbon, new V3(), local(1, P2), .028 * S, .022 * S); }
      else if (st.t < 2) { const e = part(1); rod(e, mats.carbon, local(1, end), local(1, P2), r * .95, .026 * S); }
      // the hand, hook or bionic hand on the wrist
      const h = part(2), dir = P3.clone().sub(P2), Lh = dir.length(); dir.normalize();
      const side = s === 'L' ? -1 : 1, inward = new V3(side, 0, 0), front = new V3(0, 0, 1);  // palms face the body, thumbs forward
      rod(h, mats.carbon, new V3(), dir.clone().multiplyScalar(.035 * S), .03 * S, .028 * S);  // wrist unit
      if (pros === 'gancho') {
        const base = dir.clone().multiplyScalar(.04 * S);
        for (const sgn of [1, -1]) {
          const pts = [0, .25, .5, .75, 1].map(x => base.clone().addScaledVector(dir, x * Lh * .7).addScaledVector(front, sgn * .012 * S + Math.sin(x * Math.PI) * .025 * S * sgn).addScaledVector(front, x > .8 ? -sgn * .02 * S : 0));
          const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, .006 * S, 8), mats.metal); tube.castShadow = true; h.add(tube);
        }
      } else {
        const mat = pros === 'bionica' ? mats.carbon : mats.shell, palmL = Lh * .42, palmW = .085 * S, palmT = .03 * S;
        const palmC = dir.clone().multiplyScalar(.035 * S + palmL / 2), qPalm = new Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(inward, dir, front));
        const palm = new THREE.Mesh(G.box(), mat); palm.position.copy(palmC); palm.quaternion.copy(qPalm); palm.scale.set(palmT, palmL, palmW); palm.castShadow = true; h.add(palm);
        const fl = Lh * .5;
        for (let i = 0; i < 4; i++) {  // fingers, a little curled towards the palm
          const z = (i - 1.5) / 1.5 * palmW * .38, a = palmC.clone().addScaledVector(dir, palmL / 2).addScaledVector(front, z), mid = a.clone().addScaledVector(dir, fl * .55).addScaledVector(inward, .006 * S), tip = mid.clone().addScaledVector(dir, fl * .4 * (i === 3 ? .8 : 1)).addScaledVector(inward, .018 * S);
          rod(h, mat, a, mid, .0095 * S, .009 * S, 10); rod(h, mat, mid, tip, .009 * S, .008 * S, 10);
          if (pros === 'bionica') blob(h, mats.metal, mid, .0105 * S, .0105 * S, .0105 * S);
        }
        const tb = palmC.clone().addScaledVector(dir, -palmL * .2).addScaledVector(front, palmW * .5), tt = tb.clone().addScaledVector(dir, fl * .55).addScaledVector(front, .02 * S).addScaledVector(inward, .015 * S);
        rod(h, mat, tb, tt, .011 * S, .009 * S, 10);
        if (pros === 'bionica') rod(h, mats.accent, dir.clone().multiplyScalar(.03 * S), dir.clone().multiplyScalar(.036 * S), .031 * S, .031 * S, 24);
      }
    } else {
      // above the knee: a knee unit; then a pylon to the ankle, and a foot (or a running blade instead of both)
      const floorY = -P2.y, ank = P2, toe = P3.clone().setY(0), heel = P2.clone().setY(0).add(new V3(0, 0, -.05 * S));
      if (k === 0) { if (st.t < 1) rod(sk, mats.carbon, local(0, end), local(0, P1.clone().add(new V3(0, .04 * S, 0))), .026 * S, .03 * S); const kn = part(1); blob(kn, mats.metal, new V3(), .042 * S, .045 * S, .042 * S); rod(kn, mats.carbon, new V3(-.045 * S, 0, 0), new V3(.045 * S, 0, 0), .03 * S); }
      const pyFrom = k === 0 ? P1 : end;
      if (pros === 'lamina') {
        const sh = part(1), a = local(1, pyFrom), lowY = P2.y * .55;
        const pts = [a, a.clone().add(new V3(0, -.08 * S, 0)), local(1, new V3(P2.x, lowY + .12 * S, P2.z - .07 * S)), local(1, new V3(P2.x, lowY, P2.z - .03 * S)), local(1, new V3(P2.x, .06 * S, P2.z + .06 * S)), local(1, new V3(P3.x, .008 * S, P3.z + .03 * S))];
        const shape = new THREE.Shape(); const w = .028 * S, th = .006 * S; shape.moveTo(-w, -th); shape.lineTo(w, -th); shape.lineTo(w, th); shape.lineTo(-w, th); shape.lineTo(-w, -th);
        const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, {steps: 60, extrudePath: new THREE.CatmullRomCurve3(pts), bevelEnabled: false}), mats.carbon); blade.castShadow = blade.receiveShadow = true; sh.add(blade);
        rod(sh, mats.grip, local(1, new V3(P3.x, .004 * S, P3.z + .03 * S)), local(1, new V3(P3.x, .004 * S, P3.z - .05 * S)), .01 * S, .01 * S, 10);
      } else {
        if (st.t < 2) { const sh = part(1); rod(sh, mats.metal, local(1, pyFrom), local(1, ank.clone().add(new V3(0, .02 * S, 0))), .016 * S, .016 * S, 16); }
        const ft = part(2), len = toe.distanceTo(heel), c = heel.clone().lerp(toe, .5).setY(P2.y * .32);
        const foot = new THREE.Mesh(G.box(), mats.shell); foot.position.copy(local(2, c)); foot.scale.set(.085 * S, P2.y * .55, len); foot.castShadow = foot.receiveShadow = true; ft.add(foot);
        blob(ft, mats.shell, local(2, toe.clone().setY(P2.y * .2)), .045 * S, P2.y * .22, .05 * S);
        if (st.t <= 2) blob(ft, mats.metal, new V3(), .03 * S, .03 * S, .03 * S);
        void floorY;
      }
    }
  }
  for (const g of m.prosthetics) { addOutlines(g); g.traverse(o => { if (o.isMesh && !o.userData.isHull) o.userData.prosOf = m; }); }
}
// the joints that are not there stay still
function limbTick() {
  for (const m of chars) if (m._limbLock && m._limbLock.size) {
    for (const n of m._limbLock) { const j = m.joints[n]; if (j) j.quaternion.identity(); }
    for (const s of ['L', 'R']) if (m._limbLock.has('wrist' + s)) for (const F of m.fingers[s]) for (const b of F) b.quaternion.identity();
  }
}

/* ---------- the panel ---------- */
function buildLimbsUI() {
  const box = $('#limbsBox'); if (!box) return; box.innerHTML = '';
  for (const [key, L] of Object.entries(LIMBS)) {
    const row = document.createElement('div'); row.className = 'limbrow'; row.dataset.limb = key;
    row.innerHTML = `<label class="limbl" for="limb_${key}">${tr(L.label)}</label><select id="limb_${key}" class="limbsel"></select><div class="chips limbpros"></div>`;
    const sel = row.querySelector('select');
    for (const [id, label] of LIMB_CUTS[L.kind]) { const o = document.createElement('option'); o.value = id; o.textContent = tr(label); sel.appendChild(o); }
    sel.onchange = () => { setLimb(mq, key, {cut: sel.value === LIMB_CUTS[L.kind][0][0] ? null : sel.value}); };
    box.appendChild(row);
  }
  syncLimbsUI();
}
function setLimb(m, key, o) {
  const cur = (m.body.limbs || {})[key] || {}, next = {...cur, ...o}; if (!next.cut) delete next.pros;
  const limbs = {...(m.body.limbs || {}), [key]: next}; if (!next.cut) delete limbs[key];
  m.body = {...m.body, limbs}; rebuildActive(true); syncLimbsUI(); pushHistory();
}
function syncLimbsUI() {
  for (const row of $$('#limbsBox .limbrow')) {
    const key = row.dataset.limb, L = LIMBS[key], l = (mq.body.limbs || {})[key] || {}, sel = row.querySelector('select'), pc = row.querySelector('.limbpros');
    sel.value = l.cut || LIMB_CUTS[L.kind][0][0];
    pc.hidden = !l.cut;
    if (l.cut) chips(pc, LIMB_PROS[L.kind].map(([id, label]) => [id, tr(label)]), l.pros || 'no', v => setLimb(mq, key, {pros: v}));
  }
}

/* ---------- in the scene: wheelchair, crutches, walking stick, walking frame ---------- */
Object.assign(PROP_BUILD, {
  sillaRuedas: p => {
    const fr = EM.metal, dk = EM.black;
    box(p, EM.fabric2, .42, .04, .42, 0, .46, 0); box(p, EM.fabric2, .42, .4, .03, 0, .52, -.21);  // seat and back
    for (const x of [-.24, .24]) {
      const w = new THREE.Mesh(new THREE.TorusGeometry(.29, .018, 10, 40), dk); w.position.set(x, .3, -.08); w.rotation.y = Math.PI / 2; w.castShadow = true; p.add(w);  // big wheels
      const rim = new THREE.Mesh(new THREE.TorusGeometry(.265, .007, 6, 40), fr); rim.position.set(x * 1.07, .3, -.08); rim.rotation.y = Math.PI / 2; p.add(rim);  // hand rims
      cyl(p, fr, .02, .02, x, .29, -.08, 10);
      const c = new THREE.Mesh(new THREE.TorusGeometry(.055, .015, 8, 20), dk); c.position.set(x * .85, .07, .27); c.rotation.y = Math.PI / 2; p.add(c);  // casters
      box(p, fr, .02, .38, .02, x * .9, .08, .27); box(p, fr, .02, .02, .5, x * .9, .46, .03);  // frame
      box(p, fr, .02, .5, .02, x * .9, .46, -.22); box(p, dk, .03, .03, .12, x * .9, .95, -.28);  // push handles
      box(p, fr, .02, .02, .22, x * .85, .22, .3); box(p, EM.black, .14, .015, .12, x * .45, .12, .38);  // footrests
    }
  },
  muletas: p => { for (const x of [-.18, .18]) { box(p, EM.metal, .025, 1.05, .025, x, 0, 0); box(p, EM.black, .03, .03, .12, x, .78, .04); box(p, EM.black, .04, .05, .16, x, 1.2, 0); box(p, EM.metal, .02, .45, .02, x, .78, 0); cyl(p, EM.black, .02, .04, x, 0, 0, 10); } },
  andador: p => { for (const [x, z] of [[-.25, -.2], [.25, -.2], [-.25, .2], [.25, .2]]) { box(p, EM.metal, .025, .85, .025, x, 0, z); cyl(p, EM.black, .025, .03, x, 0, z, 10); } for (const x of [-.25, .25]) box(p, EM.black, .04, .04, .44, x, .85, 0); box(p, EM.metal, .52, .025, .025, 0, .6, .2); }
});
Object.assign(PROPS, {sillaRuedas: tr('Silla de ruedas'), muletas: tr('Muletas'), andador: tr('Andador')});
SEATS.add('sillaRuedas');
