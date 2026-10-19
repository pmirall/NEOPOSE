/* ======================= dynamics for drawing =======================
   What the principles of animation give a single drawing: the line of action through the figure (one clear curve
   from the head down the spine to the supporting foot), its balance (the centre of gravity over the base of support),
   exaggeration (every bend pushed further, or softened), squash and stretch for cartoony figures, and in-betweens:
   translucent poses between the ghost and the current pose, spaced evenly or easing towards either end, to draw
   the frames in between. */
const DYN = {loa: false, bal: false, inb: 0, spacing: 'suave', loaObj: null, balObj: null, inbMeshes: [], inbSig: '', inbT: 0, sig: ''};
let ghostPose = null;
const DYN_MAT = {};
function dynMat(k, color, op = 1) { return DYN_MAT[k] || (DYN_MAT[k] = new THREE.MeshBasicMaterial({color, transparent: op < 1, opacity: op, depthTest: false, depthWrite: false})); }
const wpo = (m, n) => m.joints[n].getWorldPosition(new V3());

// the line of action: head, neck, chest, pelvis and the leg that carries the weight, as one smooth curve
function lineOfAction(m) {
  const head = wpo(m, 'head'), neck = wpo(m, 'neck'), top = head.clone().add(head.clone().sub(neck).setLength(.12 * m.size));
  const aL = wpo(m, 'ankleL'), aR = wpo(m, 'ankleR'), s = aL.y < aR.y - .02 ? 'L' : aR.y < aL.y - .02 ? 'R' : (Math.abs(aL.x - head.x) + Math.abs(aL.z - head.z) < Math.abs(aR.x - head.x) + Math.abs(aR.z - head.z) ? 'L' : 'R');
  const pts = [top, neck, wpo(m, 'chest'), wpo(m, 'hips'), wpo(m, 'knee' + s), wpo(m, 'ankle' + s)];
  return new THREE.CatmullRomCurve3(pts, false, 'centripetal');
}
// the centre of gravity (body segments weighted as in anthropometric tables) and the base of support
const SEG_W = [['head', null, .081], ['chest', 'hips', .497], ['shoulderL', 'elbowL', .028], ['shoulderR', 'elbowR', .028], ['elbowL', 'wristL', .022], ['elbowR', 'wristR', .022], ['hipL', 'kneeL', .1], ['hipR', 'kneeR', .1], ['kneeL', 'ankleL', .061], ['kneeR', 'ankleR', .061]];
function balanceOf(m) {
  const c = new V3(); let w = 0;
  for (const [a, b, k] of SEG_W) { const p = b ? wpo(m, a).add(wpo(m, b)).multiplyScalar(.5) : wpo(m, a); c.addScaledVector(p, k); w += k; }
  c.divideScalar(w);
  const floor = m.box(8).min.y, feet = [];
  for (const s of ['L', 'R']) {
    const a = wpo(m, 'ankle' + s); if (a.y - floor > .14 * m.size) continue;  // only feet on the ground carry weight
    const i = FIG.jIdx['ankle' + s], t = FIG.jIdx['toe' + s], T = m.J, toe = m.joints['ankle' + s].localToWorld(new V3(T[t * 3] - T[i * 3], T[t * 3 + 1] - T[i * 3 + 1], T[t * 3 + 2] - T[i * 3 + 2]));
    const heel = a.clone().add(a.clone().sub(toe).setY(0).setLength(.05 * m.size)), side = new V3().crossVectors(toe.clone().sub(heel).setY(0), new V3(0, 1, 0)).setLength(.045 * m.size);
    feet.push(heel.clone().add(side), heel.clone().sub(side), toe.clone().add(side), toe.clone().sub(side));
  }
  const hull = convexHull2(feet.map(p => [p.x, p.z]));
  const inside = hull.length >= 3 ? pointInPoly([c.x, c.z], hull) : hull.length ? Math.hypot(c.x - hull[0][0], c.z - hull[0][1]) < .08 * m.size : false;
  return {c, floor, hull, inside};
}
function convexHull2(P) {
  if (P.length < 3) return P;
  P = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
  for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of P.reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
function pointInPoly([x, y], poly) { let inn = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inn = !inn; } return inn; }

function dynamicsTick() {
  // squash and stretch of a still figure (the film's own squash multiplies it while animating)
  for (const m of chars) { const k0 = m.body.stretch ?? 1; if (!ANIM.open || !shot()) setFigureStretch(m, k0); }
  const m = mq, show = m && !practice.active && !(typeof sk !== 'undefined' && sk.on) && !ANIM.rec;
  m && m.group.updateMatrixWorld(true);
  const sig = show ? [m.getPose().pos.join(), JSON.stringify(m.getPose().q.hips), wpo(m, 'wristL').toArray().map(v => v.toFixed(3)).join(), wpo(m, 'ankleR').toArray().map(v => v.toFixed(3)).join(), wpo(m, 'head').toArray().map(v => v.toFixed(3)).join(), chars.indexOf(m)].join('|') : '';
  if (DYN.loaObj) DYN.loaObj.visible = show && DYN.loa;
  if (DYN.balObj) DYN.balObj.visible = show && DYN.bal;
  if (show && (DYN.loa || DYN.bal) && sig !== DYN.sig) {
    DYN.sig = sig;
    if (DYN.loa) {
      if (!DYN.loaObj) { DYN.loaObj = new THREE.Mesh(new THREE.BufferGeometry(), dynMat('loa', 0xd2552e, .9)); DYN.loaObj.renderOrder = 30; DYN.loaObj.frustumCulled = false; scene.add(DYN.loaObj); }
      DYN.loaObj.geometry.dispose(); DYN.loaObj.geometry = new THREE.TubeGeometry(lineOfAction(m), 48, .007 * m.size, 6);
    }
    if (DYN.bal) {
      if (!DYN.balObj) { DYN.balObj = new THREE.Group(); DYN.balObj.renderOrder = 30; scene.add(DYN.balObj); }
      DYN.balObj.clear();
      const b = balanceOf(m), col = b.inside ? 0x3f8a4a : 0xc0392b, mat = dynMat(b.inside ? 'balIn' : 'balOut', col, .9);
      const dot = new THREE.Mesh(G.sph(), mat); dot.position.copy(b.c); dot.scale.setScalar(.022 * m.size); dot.renderOrder = 31; DYN.balObj.add(dot);
      const base = b.c.clone().setY(b.floor + .002), line = new THREE.Mesh(new THREE.CylinderGeometry(.003 * m.size, .003 * m.size, b.c.y - base.y, 6), mat); line.position.copy(b.c.clone().add(base).multiplyScalar(.5)); line.renderOrder = 31; DYN.balObj.add(line);
      const ring = new THREE.Mesh(new THREE.RingGeometry(.018 * m.size, .028 * m.size, 24), mat); ring.rotation.x = -Math.PI / 2; ring.position.copy(base); ring.renderOrder = 31; DYN.balObj.add(ring);
      if (b.hull.length >= 2) {
        const pts = b.hull.map(([x, z]) => new V3(x, b.floor + .003, z)); pts.push(pts[0].clone());
        const outline = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0), pts.length * 4, .003 * m.size, 4), dynMat('balHull', 0x2b5a9e, .8)); outline.renderOrder = 31; DYN.balObj.add(outline);
      }
      DYN.balObj.traverse(o => { o.frustumCulled = false; o.raycast = () => {}; });
    }
  }
  updateInbetweens(show);
}
// the whole figure taller and thinner, or shorter and wider, with its volume kept, from the floor under it
function setFigureStretch(m, k) {
  const g = m.group;
  if (Math.abs(k - 1) < 1e-4) { if (g.scale.y !== 1) { g.scale.set(1, 1, 1); g.position.set(0, 0, 0); g.updateMatrixWorld(true); } return; }
  const hx = m.joints.hips.position.x, hz = m.joints.hips.position.z, sx = 1 / Math.sqrt(k);
  g.scale.set(sx, k, sx); g.position.set(hx * (1 - sx), 0, hz * (1 - sx)); g.updateMatrixWorld(true);
}

/* ---------- in-betweens from the ghost ---------- */
const SPACING = {lineal: t => t, suave: t => t * t * (3 - 2 * t), fantasma: t => t * t, pose: t => 1 - (1 - t) * (1 - t)};
function updateInbetweens(show) {
  const want = show && DYN.inb > 0 && ghostPose && ghostPose.m === mq;
  const sig = want ? JSON.stringify(mq.getPose().q) + mq.getPose().pos.join() + DYN.inb + DYN.spacing : '';
  if (sig === DYN.inbSig) return;
  if (want && performance.now() - DYN.inbT < 180) return;  // while the pose is being dragged, wait until it rests
  DYN.inbSig = sig; DYN.inbT = performance.now();
  for (const g of DYN.inbMeshes) { scene.remove(g); g.geometry.dispose(); } DYN.inbMeshes = [];
  if (!want) return;
  const cur = mq.getPose(), n = DYN.inb, ca = new THREE.Color(0x2b5a9e), cb = new THREE.Color(0xd2552e);
  for (let k = 1; k <= n; k++) {
    const t = SPACING[DYN.spacing](k / (n + 1)), p = mixPose(ghostPose.pose, cur, t);
    const mesh = ghostOf(mq, p, ca.clone().lerp(cb, k / (n + 1)).getHex()); mesh.material.opacity = .2; scene.add(mesh); DYN.inbMeshes.push(mesh);
  }
}
// the ghost: the existing one (a translucent copy), now remembering its pose for the in-betweens
function rememberGhost() { ghostPose = {m: mq, pose: mq.getPose()}; DYN.inbSig = ''; }

/* ---------- the panel ---------- */
let exagBase = null, exagEl = null, stretchEl = null;
function buildDynamicsUI() {
  $('#loaChk').onchange = e => { DYN.loa = e.target.checked; DYN.sig = ''; };
  $('#balChk').onchange = e => { DYN.bal = e.target.checked; DYN.sig = ''; };
  exagEl = slider($('#exagBox'), {id: 'dynExag', label: 'Exagerar la pose', min: -.5, max: 1, step: .05, value: 0, fmt: v => (v > 0 ? '+' : '') + Math.round(v * 100) + '%',
    input: v => { if (!exagBase || exagBase.m !== mq) exagBase = {m: mq, pose: mq.getPose()}; mq.setPose(exaggerate(exagBase.pose, v)); if (!mq.stool) mq.ground(); syncJointSliders(); },  // feet stay on the floor
    change: () => { exagBase = null; exagEl.set(0); refreshPins(mq); pushHistory(); }});
  stretchEl = slider($('#stretchBox'), {id: 'dynStretch', label: 'Estirar y encoger (cartoon)', min: .6, max: 1.4, step: .02, value: 1, fmt: v => Math.round(v * 100) + '%',
    input: v => { mq.body.stretch = v; setFigureStretch(mq, v); }, change: pushHistory});
  stretchEl.inp.ondblclick = () => { mq.body.stretch = 1; stretchEl.set(1); setFigureStretch(mq, 1); pushHistory(); };
  chips($('#inbChips'), [['0', tr('Ninguno')], ['1', '1'], ['2', '2'], ['3', '3'], ['5', '5']], '0', v => { DYN.inb = +v; if (DYN.inb && !ghostPose) toast(tr('Fija primero un fantasma: los intermedios van del fantasma a la pose actual.')); DYN.inbSig = ''; });
  chips($('#spacingChips'), [['lineal', tr('Lineal')], ['suave', tr('Suave')], ['fantasma', tr('Cerca del fantasma')], ['pose', tr('Cerca de la pose')]], DYN.spacing, v => { DYN.spacing = v; DYN.inbSig = ''; });
}
function syncDynamicsUI() { if (stretchEl) stretchEl.set(mq.body.stretch ?? 1); }
