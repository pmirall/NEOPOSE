/* ======================= posing helpers =======================
   Pins: a hand or foot stays where it is while the rest of the body is posed (the pelvis dragged, the spine turned).
   Blend: after picking a pose from the library, a slider mixes it with the pose before.
   Sit: a selected chair, sofa, bench, box… gets the active character seated on it, facing away from its back. */

/* ---------- pins ---------- */
const PIN_IDS = ['handL', 'handR', 'footL', 'footR'];
const PIN_LABEL = {handL: 'Mano izquierda', handR: 'Mano derecha', footL: 'Pie izquierdo', footR: 'Pie derecho'};
const pinRings = {};
{
  const geo = new THREE.TorusGeometry(1.5, .2, 6, 32), mat = new THREE.MeshBasicMaterial({color: 0x2b5a9e, depthTest: false, transparent: true, opacity: .95});
  for (const id of PIN_IDS) { const r = new THREE.Mesh(geo, mat); r.renderOrder = 1000; r.visible = false; r.raycast = () => {}; scene.add(r); pinRings[id] = r; }
}
const pinsOf = m => m.pins || (m.pins = {});
function setPin(m, id, on) {
  const P = pinsOf(m);
  if (on) P[id] = m.joints[EFFECTOR[id]].getWorldPosition(new V3()); else delete P[id];
}
// the pinned points follow the character's new pose (after a library pose, undo, mirror…)
function refreshPins(m) { m.group.updateMatrixWorld(true); const P = pinsOf(m); for (const id in P) m.joints[EFFECTOR[id]].getWorldPosition(P[id]); }
const chainHas = (m, id, jn) => EFFECTOR[id] === jn || m.chains[id].some(l => l.obj === m.joints[jn]);
// put every pinned hand and foot back on its pin, except the limb being posed directly
function enforcePins(m, jn) {
  const P = pinsOf(m); let any = false;
  for (const id in P) { if (jn && chainHas(m, id, jn)) continue; solveIK(m.chains[id], m.joints[EFFECTOR[id]], P[id], 40); any = true; }
  if (any) m.group.updateMatrixWorld(true);
}
function pinTick() {
  const P = pinsOf(mq), show = !practice.active && !sk.hideFig && !sk.on && !ANIM.rec, coarse = matchMedia('(pointer: coarse)').matches ? 1.6 : 1;
  for (const id of PIN_IDS) {
    const r = pinRings[id]; r.visible = show && !!P[id]; if (!r.visible) continue;
    mq.joints[EFFECTOR[id]].getWorldPosition(r.position); r.quaternion.copy(camera.quaternion);
    r.scale.setScalar(camera.position.distanceTo(r.position) * Math.tan(camera.fov * DEG / 2) * .026 * coarse);
  }
}
function syncPinUI() { const P = pinsOf(mq); $$('#pinChips .chip').forEach(b => b.setAttribute('aria-pressed', String(!!P[b.dataset.v]))); }
function buildPinUI() {
  const box = $('#pinChips'); box.innerHTML = '';
  for (const id of PIN_IDS) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.dataset.v = id; b.textContent = tr(PIN_LABEL[id]); b.setAttribute('aria-pressed', 'false');
    b.onclick = () => { setPin(mq, id, !pinsOf(mq)[id]); syncPinUI(); };
    box.appendChild(b);
  }
}

/* ---------- blend with the pose before ---------- */
const blend = {prev: null, next: null, last: null};
const poseKey = m => JSON.stringify(m.getPose().q);
function mixPose(a, b, t) {
  const q = {}, qa = new Q(), qb = new Q();
  for (const n of JOINTS) { qa.fromArray(a.q[n] || [0, 0, 0, 1]); qb.fromArray(b.q[n] || [0, 0, 0, 1]); q[n] = qa.slerp(qb, t).toArray(); }
  const lerp = (x, y) => x + (y - x) * t, hand = (x, y) => ({c: x.c.map((v, i) => lerp(v, y.c[i])), s: lerp(x.s, y.s), t: lerp(x.t || 0, y.t || 0)});
  return {q, pos: a.pos.map((v, i) => lerp(v, b.pos[i])), hands: {L: hand(a.hands.L, b.hands.L), R: hand(a.hands.R, b.hands.R)}, stool: t < .5 ? a.stool : b.stool};
}
function offerBlend(prev) {
  blend.prev = prev; blend.next = mq.getPose(); blend.last = poseKey(mq); blend.m = mq;
  blendEl.set(100); $('#blendBar').hidden = false;
}
let blendEl;
function buildBlendUI() {
  blendEl = slider($('#blendBar'), {id: 'blendAmt', label: 'Mezclar con la pose anterior', min: 0, max: 100, step: 1, value: 100, fmt: v => Math.round(v) + ' %',
    input: v => {
      if (!blend.prev || blend.m !== mq) return;
      if (poseKey(mq) !== blend.last) blend.next = mq.getPose();  // edited since: mix towards the edited pose
      mq.setPose(mixPose(blend.prev, blend.next, v / 100)); mq.ground(); blend.last = poseKey(mq);
      syncJointSliders(); syncHandUI();
    }, change: () => { refreshPins(mq); pushHistory(); }});
  const x = document.createElement('button'); x.type = 'button'; x.className = 'gx'; x.textContent = '×'; x.setAttribute('aria-label', tr('Cerrar'));
  x.onclick = () => { $('#blendBar').hidden = true; blend.prev = null; };
  $('#blendBar').appendChild(x);
}

/* ---------- sit on a piece of furniture ---------- */
const SEATS = new Set(['cubo', 'caja', 'cilindro', 'silla', 'banco', 'taburete', 'escalon', 'barril', 'roca', 'r_sofa', 'r_sillon', 'r_lounge', 'r_silla', 'r_sillamad', 'r_plastico',
  'r_taburete', 'r_banqueta', 'r_mecedora', 'r_banco', 'r_picnic', 'r_cama', 'r_cajamad', 'r_carton', 'r_cofre', 'r_barril', 'r_bidon', 'r_roca', 'r_neumatico', 'r_cubo']);
const SEATED_POSES = new Set(POSES.filter(p => p.stool).map(p => p.id));
// the seat: rays from above over the object; the lowest broad flat level between 20 and 95 cm, its back from what rises behind it
function findSeat(g) {
  g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(g), meshes = []; g.traverse(o => { if (o.isMesh && !o.userData.isHull) meshes.push(o); });
  const rc = new THREE.Raycaster(), N = 28, hits = [], floor = box.min.y;
  for (let i = 0; i < N; i++) for (let k = 0; k < N; k++) {
    const x = box.min.x + (box.max.x - box.min.x) * (i + .5) / N, z = box.min.z + (box.max.z - box.min.z) * (k + .5) / N;
    rc.set(new V3(x, box.max.y + .5, z), new V3(0, -1, 0)); const h = rc.intersectObjects(meshes, false)[0];
    if (h) hits.push(new V3(x, h.point.y - floor, z));
  }
  const bins = new Map(); for (const p of hits) if (p.y > .2 && p.y < .95) { const b = Math.round(p.y / .03); bins.set(b, (bins.get(b) || 0) + 1 + (bins.get(b - 1) ? .5 : 0)); }
  if (!bins.size) return null;
  const best = Math.max(...bins.values()), lvl = Math.min(...[...bins].filter(([, c]) => c >= best * .2).map(([b]) => b)) * .03;
  const seat = hits.filter(p => Math.abs(p.y - lvl) < .045), back = hits.filter(p => p.y > lvl + .12);
  if (seat.length < 2) return null;
  const c = seat.reduce((s, p) => s.add(p), new V3()).multiplyScalar(1 / seat.length);
  // the seat's long axis (a bed, a bench is sat on from a long side)
  let sxx = 0, szz = 0, sxz = 0; for (const p of seat) { const dx = p.x - c.x, dz = p.z - c.z; sxx += dx * dx; szz += dz * dz; sxz += dx * dz; }
  const th = .5 * Math.atan2(2 * sxz, sxx - szz), major = new V3(Math.cos(th), 0, Math.sin(th)), ext = Math.sqrt(Math.max(sxx, szz) / seat.length) * 3.4;
  let front = null;
  if (back.length >= 3) { // the back: tall things weigh more than armrests
    let wsum = 0; const bc = new V3(); for (const p of back) { const w = (p.y - lvl) ** 2; bc.addScaledVector(p, w); wsum += w; } bc.multiplyScalar(1 / wsum); const d = c.clone().sub(bc); d.y = 0;
    // a back on one side only: a bed has a board at each end, so no back (armrests reaching forward at the sides don't count)
    const dn = d.clone().normalize(), sn = new V3(dn.z, 0, -dn.x), wid = Math.max(...seat.map(p => Math.abs((p.x - c.x) * sn.x + (p.z - c.z) * sn.z)));
    const ahead = back.filter(p => (p.x - c.x) * dn.x + (p.z - c.z) * dn.z > .05 && Math.abs((p.x - c.x) * sn.x + (p.z - c.z) * sn.z) < .6 * wid);
    if (d.length() > .25 * ext && ahead.length < Math.max(2, back.length * .05)) front = d; }
  if (!front) { const toCam = camera.position.clone().sub(c); toCam.y = 0; front = new V3(-major.z, 0, major.x); if (front.dot(toCam) < 0) front.negate(); }
  front.normalize();
  const side = new V3(front.z, 0, -front.x), pr = (p, a) => p.x * a.x + p.z * a.z;
  const fr = seat.map(p => pr(p, front)), sd = seat.map(p => pr(p, side));
  return {y: floor + seat.reduce((s, p) => s + p.y, 0) / seat.length, floor, c, front, side, f0: Math.min(...fr), f1: Math.max(...fr), s0: Math.min(...sd), s1: Math.max(...sd),
    tall: back.map(p => [pr(p, front), pr(p, side)])};
}
async function sitOn(m, g) {
  await (g.userData.ready || Promise.resolve());
  const st = findSeat(g); if (!st) return toast(tr('No encuentro dónde sentarse en este objeto.'));
  const pose = SEATED_POSES.has(state.posePreset) ? POSE[state.posePreset] : POSE.sentado, s = m.size;
  const yaw = Math.atan2(st.front.x, st.front.z);
  m.joints.hips.position.set(0, m.rootY, 0);
  applyPreset(m, pose, {yaw, ground: false}); m.stool = false;
  // pelvis well back on the seat, knees past its front edge; across a long seat, the place nearest to where the character was
  const thigh = m.joints.kneeL.getWorldPosition(new V3()).distanceTo(m.joints.hipL.getWorldPosition(new V3()));
  const along = Math.min(Math.max(st.f0 + .1 * s, st.f1 - .92 * thigh), st.f1 - .05);
  const cur = m.joints.hips.getWorldPosition(new V3()), wide = st.s1 - st.s0 > .75;
  let across = (st.s0 + st.s1) / 2;
  if (wide) { // the free place nearest to the character: nothing tall (an armrest, a footboard) beside the hips or in front of them
    const want = cur.x * st.side.x + cur.z * st.side.z; let best = Infinity;
    for (let a = st.s0 + .22 * s; a <= st.s1 - .22 * s; a += .04) {
      if (st.tall.some(([f, sd]) => Math.abs(sd - a) < .24 * s && f > along - .12)) continue;
      if (Math.abs(a - want) < best) { best = Math.abs(a - want); across = a; }
    }
  }
  const p = st.front.clone().multiplyScalar(along).add(st.side.clone().multiplyScalar(across));
  m.joints.hips.position.set(p.x, st.y + .1 * s, p.z); m.group.updateMatrixWorld(true);
  // feet down to the floor in front of the knees (crossed legs stay as they are)
  if (state.posePreset !== 'silla_cruzada') for (const side of ['L', 'R']) {
    const k = m.joints['knee' + side].getWorldPosition(new V3()).addScaledVector(st.front, .05 * s);
    solveIK(m.chains['foot' + side], m.joints['ankle' + side], new V3(k.x, st.floor + .075 * s, k.z));
  }
  state.posePreset = pose.id; markPose(); select(null); syncAll(); pushHistory();
}
function seatButton(obj, box) {
  if (!SEATS.has(obj.userData.prop) || obj.userData.held) return;
  const b = document.createElement('button'); b.type = 'button'; b.className = 'btn small'; b.id = 'sitHere';
  b.textContent = tr('Sentar aquí al personaje {n}', {n: active + 1}); b.onclick = () => sitOn(mq, obj);
  const row = document.createElement('div'); row.className = 'row'; row.style.marginTop = '8px'; row.appendChild(b); box.appendChild(row);
}
