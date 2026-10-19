/* ======================= mobility aids: poses and animations =======================
   Poses and gallery animations for people who use crutches, a walking stick, a walking frame or a wheelchair. The
   aid goes with the character: crutches and the stick are gripped in the hand with their tip on the floor (a fixed
   length that leans as the hand moves, forward and a little out), the frame stands in front of them, the wheelchair
   under the pelvis, so they follow every pose and travel with the animation. */
Object.assign(PROP_BUILD, {
  // forearm crutch: tip at the origin, the shaft up the y axis, handle at .8, cuff at .96 (scaled to the person)
  muleta: p => { const m = EM.metal, k = EM.black; cyl(p, k, .016, .04, 0, 0, 0, 12); cyl(p, m, .011, .8, 0, .02, 0, 12); box(p, k, .028, .03, .12, 0, .79, .05); cyl(p, m, .011, .17, 0, .8, -.015, 12);
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(.045, .008, 6, 16, Math.PI * 1.2), k); cuff.position.set(0, .96, -.04); cuff.rotation.set(Math.PI / 2, 0, -Math.PI * .1); cuff.castShadow = true; p.add(cuff); },
  // walking stick: tip at the origin, crook at .86
  bastonPaseo: p => { cyl(p, EM.black, .014, .03, 0, 0, 0, 10); cyl(p, EM.wood, .012, .84, 0, .02, 0, 10);
    const crook = new THREE.Mesh(new THREE.TorusGeometry(.045, .014, 8, 16, Math.PI), EM.wood); crook.position.set(0, .86, .045); crook.rotation.y = Math.PI / 2; crook.castShadow = true; p.add(crook); }
});
Object.assign(PROPS, {muleta: tr('Muleta'), bastonPaseo: tr('Bastón de paseo')});

// the aids a pose or an animation brings, and how each goes with the character
const ACCESS_KITS = {
  muletas: [{t: 'muleta', kind: 'mano', side: 'L'}, {t: 'muleta', kind: 'mano', side: 'R'}], muletaR: [{t: 'muleta', kind: 'mano', side: 'R'}],
  baston: [{t: 'bastonPaseo', kind: 'mano', side: 'R'}], andador: [{t: 'andador', kind: 'andador'}], silla: [{t: 'sillaRuedas', kind: 'silla'}]
};
const AID_LEN = {muleta: .8, bastonPaseo: .86};
function accessKit(m, kitId) {
  for (const p of [...props]) if (p.userData.ride && p.userData.ride.m === m) { const i = props.indexOf(p); scene.remove(p); props.splice(i, 1); }
  const kit = ACCESS_KITS[kitId]; if (!kit) return;
  for (const k of kit) {
    const g = makeProp(k.t, m.joints.hips.getWorldPosition(new V3()).setY(0)); g.scale.setScalar(m.size || 1); setOutlines(g, state.envOutline);
    g.userData.ride = {m, kind: k.kind, side: k.side};
    if (k.kind === 'mano') {  // as long as this person needs it: from the floor to the hand, standing
      const F = m.fingers[k.side], grip = m.joints['wrist' + k.side].getWorldPosition(new V3()).lerp(F[2][0].getWorldPosition(new V3()), .55), L0 = (AID_LEN[k.t] || .8) * (m.size || 1);
      g.userData.ride.L = clamp(grip.y * .97, L0 * .8, L0 * 1.3); g.scale.y = (m.size || 1) * g.userData.ride.L / L0;
    }
  }
  if (kitId === 'silla') seatInChair(m);
  accessTick();
}
// in the wheelchair: the pelvis on its seat, feet towards the footrests
function seatInChair(m) {
  m.stool = false;
  const s = m.size || 1; m.joints.hips.position.y = .5 * s + .1 * s; m.group.updateMatrixWorld(true);  // the cushion's top, and the depth of the buttocks under the hip joints
}
// every frame: each aid where its character needs it
function accessTick() {
  for (const g of props) {
    const r = g.userData.ride; if (!r) continue;
    if (!chars.includes(r.m)) { g.userData.ride = null; continue; }
    const m = r.m, s = m.size || 1, yaw = m.yaw(), fw = new V3(Math.sin(yaw), 0, Math.cos(yaw)), left = new V3(fw.z, 0, -fw.x), hip = m.joints.hips.getWorldPosition(new V3());
    if (r.kind === 'silla') { g.position.set(hip.x - fw.x * .03 * s, 0, hip.z - fw.z * .03 * s); g.rotation.set(0, yaw, 0); }
    else if (r.kind === 'andador') { g.position.set(hip.x + fw.x * .36 * s, 0, hip.z + fw.z * .36 * s); g.rotation.set(0, yaw, 0); }
    else if (r.kind === 'mano') {
      // the grip in the palm, the tip on the floor ahead and out: a fixed length that leans as the hand moves
      const w = m.joints['wrist' + r.side], F = m.fingers[r.side], grip = w.getWorldPosition(new V3()).lerp(F[2][0].getWorldPosition(new V3()), .55);
      const L = r.L || (AID_LEN[g.userData.prop] || .8) * s, out = (r.side === 'L' ? 1 : -1), dir = fw.clone().multiplyScalar(-.75).addScaledVector(left, -out * .45).normalize();
      const uy = clamp(grip.y / L, 0, 1), u = dir.multiplyScalar(Math.sqrt(1 - uy * uy)).setY(uy).normalize(), tip = grip.clone().addScaledVector(u, -L);
      const z = fw.clone().addScaledVector(u, -fw.dot(u)).normalize(), x = new V3().crossVectors(u, z);
      g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, u, z)); g.position.copy(tip);
      if (m.hands[r.side] && m.hands[r.side].c[1] < .6) { m.hands[r.side] = gest('agarre'); m.applyHands(); }
    }
  }
}

/* ---------- poses ---------- */
const ACCESS_POSES = [
  ['muletas_pie', 'De pie con muletas', {...LEGS_STAND, chest: [4, 0, 0], ...sym({shoulderL: [-14, 0, 16], elbowL: [-28]})}, 'muletas'],
  ['muletas_paso', 'Paso pendular con muletas', {hips: [8, 0, 0], chest: [10, 0, 0], ...sym({shoulderL: [-38, 0, 14], elbowL: [-12]}), hipL: [10, 0, 3], hipR: [14, 0, -3], kneeL: [18], kneeR: [22]}, 'muletas'],
  ['muleta_una', 'Con una muleta', {shoulderR: [-14, 0, -16], elbowR: [-28], shoulderL: [0, 0, 8], elbowL: [-15], hipL: [-12, 0, 3], kneeL: [35], ankleL: [-10], hipR: [0, 0, -3], hips: [0, 0, -3]}, 'muletaR'],
  ['baston_pie', 'Con bastón', {...LEGS_STAND, shoulderR: [-12, 0, -12], elbowR: [-30], shoulderL: [0, 0, 7], elbowL: [-12], chest: [3, 0, 0]}, 'baston'],
  ['andador_pie', 'Con andador', {...LEGS_STAND, hips: [6, 0, 0], chest: [10, 0, 0], neck: [-6, 0, 0], ...sym({shoulderL: [-38, 0, 10], elbowL: [-30]})}, 'andador'],
  ['silla_reposo', 'En silla de ruedas', {...SIT, chest: [2, 0, 0], ...sym({shoulderL: [-20, 0, 14], elbowL: [-60]})}, 'silla'],
  ['silla_empujar', 'Impulsando la silla de ruedas', {...SIT, waist: [8, 0, 0], chest: [10, 0, 0], ...sym({shoulderL: [32, 0, 24], elbowL: [-72]})}, 'silla', {L: 'agarre', R: 'agarre'}],
  ['silla_alcanzar', 'Alcanzando desde la silla', {...SIT, waist: [10, 0, 0], chest: [12, 0, 0], head: [-10, 0, 0], shoulderR: [-120, 0, -10], elbowR: [-10], shoulderL: [-20, 0, 14], elbowL: [-60]}, 'silla', {R: 'abierta'}],
  ['silla_saludo', 'Saludando desde la silla', {...SIT, shoulderR: [0, -90, -100, 'ZXY'], elbowR: [-75], shoulderL: [-20, 0, 14], elbowL: [-60], head: [0, -8, 0]}, 'silla', {R: 'abierta'}]
];
for (const [id, label, j, kit, hands] of ACCESS_POSES) { const p = P(id, label, 'movilidad', j, {kit, ...(hands ? {hands} : {})}); POSES.push(p); POSE[id] = p; }

/* ---------- animations (put in the gallery at start: see 26-clips) ---------- */
const WALK = POSE.caminar ? POSE.caminar.j : {};
// the passing positions of a walk and a run: the leg that stood is under the body, the other swings past it, bent
const mirrorJ = j => Object.fromEntries(Object.entries(j).map(([k, e]) => [swapSide(k), mirrorRot(e)]));
const WALK_PASS = {hipL: [2, 0, 2], kneeL: [5], ankleL: [-3], hipR: [-16, 0, -2], kneeR: [46], ankleR: [-10], shoulderL: [2, 0, 6], elbowL: [-16], shoulderR: [-4, 0, -6], elbowR: [-20], head: [0, 0, 0]};
const RUN_PASS = {hips: [12, 0, 0], waist: [5, 0, 0], chest: [4, 0, 0], neck: [-8, 0, 0], head: [-6, 0, 0], hipL: [6, 0, 4], kneeL: [38], ankleL: [-12], hipR: [-42, 0, -4], kneeR: [110], ankleR: [-15],
  shoulderL: [6, 0, 12], elbowL: [-92], shoulderR: [-8, 0, -12], elbowR: [-90]};
const ACCESS_CLIPS = [
  {id: 'acc-silla', name: 'Impulsar la silla de ruedas', cat: 'movilidad', loop: true, dur: 1.2, kit: 'silla', keys: [
    [0, {...SIT, waist: [4, 0, 0], chest: [6, 0, 0], ...sym({shoulderL: [35, 0, 22], elbowL: [-75]})}, 'agarre', 0, 0],
    [.35, {...SIT, waist: [12, 0, 0], chest: [14, 0, 0], ...sym({shoulderL: [-25, 0, 18], elbowL: [-20]})}, 'agarre', 0, .3],
    [.7, {...SIT, waist: [6, 0, 0], chest: [8, 0, 0], ...sym({shoulderL: [-5, 0, 30], elbowL: [-80]})}, 'relajada', 0, .52],
    [1.2, {...SIT, waist: [4, 0, 0], chest: [6, 0, 0], ...sym({shoulderL: [35, 0, 22], elbowL: [-75]})}, 'agarre', 0, .62]]},
  {id: 'acc-muletas', name: 'Andar con muletas (pendular)', cat: 'movilidad', loop: true, dur: 1, kit: 'muletas', keys: [
    [0, {hips: [6, 0, 0], chest: [10, 0, 0], ...sym({shoulderL: [-35, 0, 14], elbowL: [-10]}), hipL: [12, 0, 3], hipR: [12, 0, -3], kneeL: [15], kneeR: [15]}, 'agarre', 0, 0],
    [.45, {hips: [-4, 0, 0], chest: [2, 0, 0], ...sym({shoulderL: [5, 0, 14], elbowL: [-8]}), hipL: [-30, 0, 3], hipR: [-30, 0, -3], kneeL: [10], kneeR: [10]}, 'agarre', .03, .45],
    [.7, {hips: [2, 0, 0], chest: [4, 0, 0], ...sym({shoulderL: [20, 0, 14], elbowL: [-20]}), hipL: [-10, 0, 3], hipR: [-10, 0, -3], kneeL: [20], kneeR: [20]}, 'agarre', -.03, .7],
    [1, {hips: [6, 0, 0], chest: [10, 0, 0], ...sym({shoulderL: [-35, 0, 14], elbowL: [-10]}), hipL: [12, 0, 3], hipR: [12, 0, -3], kneeL: [15], kneeR: [15]}, 'agarre', 0, .85]]},
  {id: 'acc-baston', name: 'Andar con bastón', cat: 'movilidad', loop: true, dur: 1.2, kit: 'baston', feet: true, keys: [
    [0, {...WALK, shoulderR: [-22, 0, -12], elbowR: [-28]}],
    [.3, {...WALK_PASS, shoulderR: [-8, 0, -12], elbowR: [-26]}],
    [.6, {...mirrorJ(WALK), shoulderR: [6, 0, -12], elbowR: [-24]}],
    [.9, {...mirrorJ(WALK_PASS), shoulderR: [-8, 0, -12], elbowR: [-26]}],
    [1.2, {...WALK, shoulderR: [-22, 0, -12], elbowR: [-28]}]]}
];
