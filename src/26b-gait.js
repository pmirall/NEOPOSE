/* ======================= locomotion, worked out step by step =======================
   NEOPOSE's own walks and runs are not key poses: they are made the way a game makes them, from where the feet go.
   Over one gait cycle (two steps) each foot lands on its heel with the toes up, rolls flat, lifts its heel, pushes off
   from the ball of the foot and swings forward low over the ground to land a stride further on (Perry's phases of gait).
   A foot on the ground stays exactly where it is: the leg reaches it with a two-bone IK (the knee bends in the plane
   of the hip, the ankle and a point ahead), so nothing slides. The pelvis rides as high as the legs on the ground
   allow (lowest with the feet apart, highest as one passes the other), sways over the foot it stands on, turns with
   the leg that swings and drops on the side of it; the chest turns the other way, the arms swing against the legs a
   moment late, and the head keeps looking ahead. A run spends most of its time in the air: there the pelvis flies on
   a springy bounce, lowest as the knee gives under the weight at mid-stance and highest halfway through the flight.
   All lengths are in legs (hip to ankle), so the same gait suits the clip rig and keeps its proportions. */
const GAITS = {
  walk: {T: 1.1, stride: 1.38, duty: .62, land: .26, lift: .1, hs: -17, flat: .1, rise: .3, to: 52, toeOut: 6, width: .6,
    yaw: 5, roll: 3.5, pitch: 3, sway: .022, chest: 6, lean: 2, arm: 17, armBias: 3, elbow: [16, 32], lag: .06, reach: .996, give: 0, curls: null},
  run: {T: .72, stride: 2.6, duty: .3, land: .1, lift: .46, hs: -6, flat: .05, rise: .12, to: 55, bob: .075, toeOut: 4, width: .7,
    yaw: 8, roll: 4, pitch: 9, sway: .012, chest: 11, lean: 6, arm: 36, armBias: 6, elbow: [80, 98], lag: .05, reach: .985, give: .05, curls: .6},
  // with a cane in the right hand: shorter, slower steps; the cane goes with the left foot, the body leans a little on it
  cane: {T: 1.32, stride: 1.1, duty: .66, land: .2, lift: .08, hs: -12, flat: .12, rise: .36, to: 32, toeOut: 7, width: .7,
    yaw: 4, roll: 3, pitch: 5, sway: .026, chest: 4, lean: 4, arm: 12, armBias: 3, elbow: [16, 26], lag: .06, reach: .995, give: 0, curls: null,
    caneArm: {swing: 20, bias: -8, elbow: 26, out: -12}, tilt: -3}
};
const minJerk = s => s * s * s * (10 - 15 * s + 6 * s * s);
// the rig's legs: lengths and where the foot's heel, ankle, ball and toe joint sit (z forward, y up from the floor)
function gaitRig(m) {
  if (m._gait) return m._gait;
  const save = m.getPose(), J = m.joints;
  for (const n of JOINTS) J[n].quaternion.identity();
  J.hips.position.set(0, m.rootY, 0); m.group.updateMatrixWorld(true);
  const T = m.J, hip = wposOf(J.hipL), knee = wposOf(J.kneeL), ank = wposOf(J.ankleL), i = FIG.jIdx.ankleL, t = FIG.jIdx.toeL;
  const toe = J.ankleL.localToWorld(new V3(T[t * 3] - T[i * 3], T[t * 3 + 1] - T[i * 3 + 1], T[t * 3 + 2] - T[i * 3 + 2]));
  const floor = Math.min(ank.y, toe.y) - .012, heelZ = ank.z - .035;  // the heel a little behind the ankle, the sole just under the joints
  const g = {a: hip.distanceTo(knee), b: knee.distanceTo(ank), hipOff: hip.clone().sub(wposOf(J.hips)), floor,
    ank: new V3(0, ank.y - floor, ank.z - heelZ), toe: new V3(0, toe.y - floor, toe.z - heelZ), ball: new V3(0, 0, toe.z - heelZ), footX: hip.x};
  g.L = g.a + g.b;
  m.setPose(save); m.group.updateMatrixWorld(true);
  return (m._gait = g);
}
// a point of the foot (in the foot's own frame, from the heel on the floor) with the foot pitched by rho: above 0 the
// heel is up and it turns on the ball, below 0 the toes are up and it turns on the heel
function footPoint(g, P, rho) {
  const piv = rho > 0 ? g.ball : new V3(), z = P.z - piv.z, y = P.y - piv.y, c = Math.cos(rho), s = Math.sin(rho);
  return new V3(0, piv.y - z * s + y * c, piv.z + z * c + y * s);
}
// where the heel point is and how the foot is pitched, at phase psi of its own cycle (0: heel strike)
function footAt(G, g, psi, S) {
  const r = DEG, d = G.duty;
  if (psi < d) {  // on the ground: the heel stays where it landed (z 0); the foot rolls flat, then rises onto its ball
    const rho = psi < G.flat ? G.hs * r * (1 - easeIO(psi / G.flat)) : psi < G.rise ? 0 : G.to * r * Math.pow((psi - G.rise) / (d - G.rise), 1.25);
    return {heel: rho > 0 ? footPoint(g, new V3(), rho) : new V3(), rho, down: true};
  }
  // in the air: from where it pushed off, low over the ground, to land a stride ahead with the toes up
  const s = (psi - d) / (1 - d), start = footPoint(g, new V3(), G.to * r), h = minJerk(s);
  const rho = G.to * r + (G.hs * r - G.to * r) * easeIO(Math.min(1, s * 1.35));
  const up = G.lift * g.L * Math.sin(Math.PI * Math.pow(s, .7)), heel = new V3(0, start.y * (1 - h) + up, start.z + (S - start.z) * h);
  return {heel, rho, down: false};
}
// the clip: frames of our poses with root motion, one gait cycle, looped
function gaitClip(def, fps = 30) {
  const G = GAITS[def.gait], m = clipRig(), g = gaitRig(m), J = m.joints, save = m.getPose();
  const n = Math.round(G.T * fps), T = n / fps, S = G.stride * g.L, v = S / T, land = G.land * S, frames = [];
  const off = {R: 0, L: .5}, side = {L: 1, R: -1}, yawOut = s => side[s] * G.toeOut * DEG;
  // the feet first: where each one is at every frame (world, the body going +z at v)
  const feet = [];
  for (let i = 0; i < n; i++) {
    const phi = i / n, F = {};
    for (const s of ['L', 'R']) {
      const psi = ((phi - off[s]) % 1 + 1) % 1, f = footAt(G, g, psi, S), z0 = v * T * (phi - psi) + land;  // the heel's last landing
      const x = side[s] * g.footX * G.width, Y = new Q().setFromAxisAngle(new V3(0, 1, 0), yawOut(s));
      const at = P => { const q = footPoint(g, P, f.rho).sub(footPoint(g, new V3(), f.rho)).applyQuaternion(Y); return new V3(x, g.floor, z0).add(f.heel).add(q); };
      F[s] = {ank: at(g.ank), toe: at(g.toe), down: f.down, psi};
    }
    feet.push(F);
  }
  // the pelvis: turned, rolled, swayed; as high as the legs on the ground reach (with a little give in a run)
  const pel = feet.map((F, i) => {
    const phi = i / n, c = Math.cos(2 * Math.PI * phi), x = -G.sway * g.L * Math.cos(2 * Math.PI * (phi - G.duty / 2));
    const q = new Q().setFromEuler(new THREE.Euler(G.pitch * DEG + .2 * G.pitch * DEG * Math.cos(4 * Math.PI * phi), G.yaw * DEG * c, -G.roll * DEG * Math.cos(2 * Math.PI * (phi - G.duty / 2)) + (G.tilt || 0) * DEG, 'YXZ'));
    let ys = [];
    for (const s of ['L', 'R']) {
      if (!F[s].down) continue;
      // (once the other foot has landed this one no longer bears the weight: it only has to reach the ground, straight)
      const k = (F[s].psi > .5 ? .998 : G.reach - G.give * Math.sin(Math.PI * F[s].psi / G.duty)) * g.L, o = g.hipOff.clone().setX(side[s] * Math.abs(g.hipOff.x)).applyQuaternion(q);
      const dx = x + o.x - F[s].ank.x, dz = v * T * phi + o.z - F[s].ank.z;
      ys.push(F[s].ank.y - o.y + Math.sqrt(Math.max(1e-6, k * k - dx * dx - dz * dz)));
    }
    const y = ys.length ? -.008 * Math.log(ys.reduce((a, y) => a + Math.exp(-y / .008), 0)) : null;  // the lower of the two, smoothly
    return {x, z: v * T * phi, y, q};
  });
  // a run: lowest with the leg most bent under the body (mid-stance, where the legs allow), highest halfway through the
  // flight, on a smooth swing between (the centre of mass of a runner bounces as on a spring)
  if (G.bob) { const yl = pel[Math.round(n * G.duty / 2) % n].y; pel.forEach((p, i) => { p.y = yl + G.bob * g.L * (1 - Math.cos(4 * Math.PI * (i / n - G.duty / 2))) / 2; }); }
  // in the air: the arc from leaving the ground to landing again
  const on = pel.map(p => p.y != null), d0 = on.indexOf(true);
  for (let u = d0 + 1; u < d0 + n; u++) {
    if (on[u % n]) continue;
    let b = u; while (!on[b % n]) b++;
    const a = u - 1, Tf = (b - a) / fps, ya = pel[a % n].y, yb = pel[b % n].y;
    for (let j = u; j < b; j++) { const t = (j - a) / fps; pel[j % n].y = ya + (yb - ya) * t / Tf + 4.9 * t * (Tf - t); }
    u = b;
  }
  for (let i = 0; i < n; i++) {
    const phi = i / n, F = feet[i], P = pel[i];
    for (const n2 of JOINTS) J[n2].quaternion.identity();
    J.hips.position.set(P.x, P.y, P.z); J.hips.quaternion.copy(P.q); m.group.updateMatrixWorld(true);
    // the chest turns against the pelvis and leans into the move
    const cy = -G.chest * DEG * Math.cos(2 * Math.PI * (phi - .03)), cr = G.roll * .6 * DEG * Math.cos(2 * Math.PI * (phi - G.duty / 2));
    J.waist.rotation.set(G.lean * .4 * DEG, cy * .45, cr * .5, 'YXZ'); J.chest.rotation.set(G.lean * .6 * DEG, cy * .55, cr * .5, 'YXZ'); m.group.updateMatrixWorld(true);
    // the legs reach their feet: the knee in the plane of hip, ankle and a point ahead (and a touch out)
    for (const s of ['L', 'R']) {
      const H = wposOf(J['hip' + s]), A = F[s].ank, d = Math.min(H.distanceTo(A), g.L * .999), u = A.clone().sub(H).normalize();
      const fwd = new V3(side[s] * .05, 0, 1).applyQuaternion(new Q().setFromAxisAngle(new V3(0, 1, 0), yawOut(s) * .5)), w = fwd.addScaledVector(u, -fwd.dot(u)).normalize();
      const al = Math.acos(clamp((g.a * g.a + d * d - g.b * g.b) / (2 * g.a * d), -1, 1)), K = H.clone().addScaledVector(u, g.a * Math.cos(al)).addScaledVector(w, g.a * Math.sin(al));
      aimLimb(m, 'hip' + s, 'knee' + s, 'ankle' + s, K.clone().sub(H), H.clone().addScaledVector(u, d).sub(K), 1);
      const a = J['ankle' + s], i2 = FIG.jIdx['ankle' + s], t = FIG.jIdx['toe' + s], T2 = m.J;
      turnBone(m, a, a.localToWorld(new V3(T2[t * 3] - T2[i2 * 3], T2[t * 3 + 1] - T2[i2 * 3 + 1], T2[t * 3 + 2] - T2[i2 * 3 + 2])).sub(wposOf(a)), F[s].toe.clone().sub(F[s].ank));
    }
    // the arms swing against the legs, a moment late, more bent as they come forward
    const sw = s => side[s] * Math.cos(2 * Math.PI * (phi - G.lag));  // 1: this arm is forward (the left one as the right foot lands)
    for (const s of ['L', 'R']) {
      const f = sw(s), ca = s === 'R' && G.caneArm;
      if (ca) { const c = Math.cos(2 * Math.PI * (phi - .5 - G.lag)); J.shoulderR.rotation.set((ca.bias - ca.swing * c) * DEG, 0, ca.out * DEG, 'XYZ'); J.elbowR.rotation.set(-ca.elbow * DEG, 0, 0); continue; }
      J['shoulder' + s].rotation.set((G.armBias - G.arm * f) * DEG, 0, side[s] * 7 * DEG, 'XYZ');
      J['elbow' + s].rotation.set(-(G.elbow[0] + (G.elbow[1] - G.elbow[0]) * (1 + f) / 2) * DEG, 0, 0);
    }
    m.group.updateMatrixWorld(true);
    // the head keeps looking ahead: neck and head undo what the chest does, with a slight nod down
    const want = new Q().setFromEuler(new THREE.Euler((3 + G.lean * .3) * DEG, 0, 0)), cw = J.chest.getWorldQuaternion(new Q()), d = cw.clone().invert().multiply(want);
    J.neck.quaternion.copy(new Q().slerp(d, .4)); J.head.quaternion.copy(J.neck.quaternion.clone().invert().multiply(d));
    m.group.updateMatrixWorld(true);
    const pose = m.getPose(), q = {}; for (const j of CLIP_J) q[j] = pose.q[j];
    frames.push({q, p: [P.x, P.y - m.rootY, P.z], h: G.curls == null ? REST_CURLS : REST_CURLS.map(() => G.curls)});
  }
  m.setPose(save); m.group.updateMatrixWorld(true);
  return frames;
}
