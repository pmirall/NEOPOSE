/* ======================= animation gallery =======================
   Ready-made movements to drop into a shot: NEOPOSE's own, the Universal Animation Library by Quaternius (CC0, 84 clips,
   converted once by tools/anims/build_ual.js), files you import (BVH, GLB, glTF, FBX: Mixamo, Rokoko, CMU, Blender…)
   and tracks you save from your own shots.
   Any humanoid skeleton is carried over by POSITIONS, not by copying rotations, so its rest pose (T, A or anything)
   does not matter: each frame the source's hips, shoulders, elbows, wrists, knees, ankles, toes and hands give the
   pelvis and chest frames and the direction of every limb, and the head turns as the source head turns from its rest.
   A clip is stored as our own poses (17 joints, root motion, finger curls) at its own frame rate, and is resampled to
   the film's when it goes into a track. */
const CLIP_J = ['hips', 'waist', 'chest', 'neck', 'head', 'shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR', 'hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR'];
const CLIPS = {lib: null, mine: [], rig: null, thumbs: new Map()};
const CLIP_CATS = {todas: 'Todas', movilidad: 'Movilidad', mov: 'Andar y correr', salto: 'Saltos y acrobacias', combate: 'Combate', gestos: 'Gestos y charla', reposo: 'Reposo y sentado', trabajo: 'Tareas', baile: 'Baile', mias: 'Mis animaciones'};

/* ---------- clip data ---------- */
// frames: [{q: {joint: [x,y,z,w]}, p: [x,y,z] (hips, metres from the start, y from the standing height), h: [10 curls 0..1]}]
function packClip(c) {
  const n = c.frames.length, q = new Int16Array(n * CLIP_J.length * 4), p = new Int16Array(n * 3), h = new Uint8Array(n * 10);
  c.frames.forEach((f, i) => {
    CLIP_J.forEach((j, k) => { const v = f.q[j] || [0, 0, 0, 1]; for (let a = 0; a < 4; a++) q[(i * CLIP_J.length + k) * 4 + a] = Math.round(v[a] * 32767); });
    for (let a = 0; a < 3; a++) p[i * 3 + a] = Math.round(clamp(f.p[a], -32, 32) * 1000);
    for (let a = 0; a < 10; a++) h[i * 10 + a] = Math.round(clamp((f.h || REST_CURLS)[a], 0, 1) * 255);
  });
  const b64 = u => { const u8 = new Uint8Array(u.buffer); let s = ''; for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode.apply(null, u8.subarray(i, i + 32768)); return btoa(s); };
  return {id: c.id, name: c.name, cat: c.cat, src: c.src, fps: c.fps, loop: !!c.loop, n, q: b64(q), p: b64(p), h: b64(h)};
}
function unpackClip(o) {
  const u = (s, C) => { const b = atob(s), u8 = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u8[i] = b.charCodeAt(i); return new C(u8.buffer); };
  const q = u(o.q, Int16Array), p = u(o.p, Int16Array), h = u(o.h, Uint8Array), frames = [];
  for (let i = 0; i < o.n; i++) {
    const f = {q: {}, p: [p[i * 3] / 1000, p[i * 3 + 1] / 1000, p[i * 3 + 2] / 1000], h: Array.from(h.subarray(i * 10, i * 10 + 10), v => v / 255)};
    CLIP_J.forEach((j, k) => { const o4 = (i * CLIP_J.length + k) * 4; f.q[j] = [q[o4] / 32767, q[o4 + 1] / 32767, q[o4 + 2] / 32767, q[o4 + 3] / 32767]; });
    frames.push(f);
  }
  return {...o, frames, len: (o.loop ? o.n : o.n - 1) / o.fps};  // a loop's last frame leads back into its first
}
// the clip at time t (seconds): frames blended, joints along the shortest turn
function sampleClip(c, t) {
  const n = c.frames.length, x = c.loop ? ((t * c.fps) % n + n) % n : clamp(t * c.fps, 0, n - 1), i = Math.floor(x), k = x - i, a = c.frames[i], b = c.frames[c.loop ? (i + 1) % n : Math.min(i + 1, n - 1)];
  const q = {}, qa = new Q(), qb = new Q();
  for (const j of CLIP_J) { qa.fromArray(a.q[j]); qb.fromArray(b.q[j]); q[j] = qa.slerp(qb, k).toArray(); }
  // a loop's last frame leads on into the next lap, a stride further, not back to where the first one stood
  const bp = c.loop && i === n - 1 ? clipStride(c).map((d, m) => c.frames[0].p[m] + (m === 1 ? 0 : d)) : b.p;
  return {q, p: a.p.map((v, m) => v + (bp[m] - v) * k), h: a.h.map((v, m) => v + (b.h[m] - v) * k)};
}
const REST_CURLS = [.25, .18, .26, .32, .4, .25, .18, .26, .32, .4];
// how far the hips go in one lap of a loop (or the whole of a clip), in the clip's metres: [x, y, z]
function clipStride(c) {
  if (!c._stride) { const n = c.frames.length, a = c.frames[0].p, b = c.frames[n - 1].p, k = c.loop && n > 1 ? n / (n - 1) : 1; c._stride = [0, 1, 2].map(m => (b[m] - a[m]) * k); }
  return c._stride;
}
// its speed over the ground (metres a second): what a walk has to be played at for its feet not to slide. A clip that
// travels says so with its hips; one made on the spot (a treadmill walk) by how fast the foot on the ground goes back
function clipSpeed(c) {
  if (c._speed == null) {
    const d = Math.hypot(clipStride(c)[0], clipStride(c)[2]);
    if (c.len <= 0) c._speed = 0;
    else if (d > .05 * c.len) c._speed = d / c.len;
    else {
      // (the middle of how fast it goes back while it is down: the moments a foot lands or lifts do not count)
      const m = clipRig(), save = m.getPose(), P = c.frames.map(f => footPoints(m, f)), n = P.length, floor = Math.min(...P.map(f => Math.min(f[0].y, f[1].y))), v = [];
      for (let i = 0; i < n - (c.loop ? 0 : 1); i++) { const j = (i + 1) % n, s = P[i][0].y + P[j][0].y <= P[i][1].y + P[j][1].y ? 0 : 1; if (Math.max(P[i][s].y, P[j][s].y) - floor < .08) v.push((P[i][s].ankle.z - P[j][s].ankle.z) * c.fps); }
      m.setPose(save); m.group.updateMatrixWorld(true);
      v.sort((a, b) => a - b); c._speed = v.length ? Math.max(0, v[v.length >> 1]) : 0;
    }
  }
  return c._speed;
}
// where a pose faces: hips, chest and both feet together (a contrapposto or a twisted start does not count as a turn)
function facingOf(q) {
  const w = (...n) => n.reduce((a, j) => a.multiply(new Q().fromArray(q[j] || [0, 0, 0, 1])), new Q()), f = new V3();
  for (const W of [w('hips'), w('hips', 'waist', 'chest'), w('hips', 'hipL', 'kneeL', 'ankleL'), w('hips', 'hipR', 'kneeR', 'ankleR')]) { const d = new V3(0, 0, 1).applyQuaternion(W); d.y = 0; if (d.lengthSq() > 1e-4) f.add(d.normalize()); }
  return Math.atan2(f.x, f.z);
}
const handsOf = h => ({L: {c: h.slice(0, 5), s: .2, t: 0}, R: {c: h.slice(5, 10), s: .2, t: 0}});
// a full pose of character m from a clip sample, placed at hips position `at` and turned by `yaw`
// (joints the clip does not move, such as the jaw, toes or a tail, keep `keep`)
function clipPose(m, smp, at, yaw, inPlace, k, keep) {
  const q = {}; for (const n of JOINTS) q[n] = keep && keep[n] ? keep[n] : [0, 0, 0, 1];
  Object.assign(q, smp.q);
  const Y = new Q().setFromAxisAngle(new V3(0, 1, 0), yaw); q.hips = Y.clone().multiply(new Q().fromArray(smp.q.hips)).toArray();
  const d = inPlace ? new V3(0, smp.p[1], 0) : new V3(...smp.p); d.multiplyScalar(k); const xz = new V3(d.x, 0, d.z).applyQuaternion(Y);
  return {q, pos: [at.x + xz.x, m.rootY + d.y, at.z + xz.z], hands: handsOf(smp.h)};
}

/* ---------- retargeting: source joint positions to our poses ---------- */
// a hidden NEOPOSE figure (default body) on which the poses are worked out; poses are rotations, valid for any body
function clipRig() {
  if (!CLIPS.rig) { CLIPS.rig = new Mannequin(makeCharMats(), 'volumen'); CLIPS.rig.noMuscles = true; CLIPS.rig.build(bodyOf('hombre')); }
  return CLIPS.rig;
}
// a limb (shoulder, elbow, wrist or hip, knee, ankle) laid along two directions: d1 from its root to its middle joint,
// d2 from there on; the hinge bends by the angle between them (sign: which way it bends) and the root twists so it bends
// the right way
function aimLimb(m, ja, jb, jc, d1, d2, sign) {
  const J = m.joints;
  turnBone(m, J[ja], wposOf(J[jb]).sub(wposOf(J[ja])), d1);
  const H = HINGE[jb]; J[jb].rotation.set(clamp(sign * d1.angleTo(d2), H[0] * DEG, H[1] * DEG), 0, 0, 'XYZ'); m.group.updateMatrixWorld(true);
  const ax = d1.clone().normalize(), cur = wposOf(J[jc]).sub(wposOf(J[jb])), pc = cur.addScaledVector(ax, -cur.dot(ax)), pw = d2.clone().addScaledVector(ax, -d2.dot(ax));
  if (pc.lengthSq() > 1e-8 && pw.lengthSq() > 1e-8) { let t = pc.angleTo(pw); if (new V3().crossVectors(pc, pw).dot(ax) < 0) t = -t; setWorldQ(m, J[ja], new Q().setFromAxisAngle(ax, t).multiply(J[ja].getWorldQuaternion(new Q()))); }
}
// K: world positions in our frame (x left, y up, z forward): hipL/R kneeL/R ankleL/R toeL/R shL/R elL/R wrL/R tipL/R idxL/R pkyL/R neck head;
// headQ: the head's turn from its rest (world, our frame); curls: 10 values or null
function poseFromJoints(m, K, headQ, curls) {
  const J = m.joints;
  for (const n of JOINTS) J[n].quaternion.identity();
  J.hips.position.set(0, m.rootY, 0); m.group.updateMatrixWorld(true);
  const mid = (a, b) => K[a].clone().add(K[b]).multiplyScalar(.5), has = (...n) => n.every(x => K[x]);
  const up = mid('shL', 'shR').sub(mid('hipL', 'hipR')), qh = basisQ(K.hipL.clone().sub(K.hipR), up); setWorldQ(m, J.hips, qh);
  const qc = basisQ(K.shL.clone().sub(K.shR), up), half = new Q().slerp(qh.clone().invert().multiply(qc), .5);
  J.waist.quaternion.copy(half); J.chest.quaternion.copy(half); m.group.updateMatrixWorld(true);
  if (headQ) { const d = J.chest.getWorldQuaternion(new Q()).invert().multiply(headQ); J.neck.quaternion.copy(new Q().slerp(d, .4)); J.head.quaternion.copy(J.neck.quaternion.clone().invert().multiply(d)); m.group.updateMatrixWorld(true); }
  else if (has('neck', 'head')) { turnBone(m, J.neck, wposOf(J.head).sub(wposOf(J.neck)), K.head.clone().sub(K.neck)); }
  const limb = (a, b, c, ja, jb, jc, sign) => { if (has(a, b, c)) aimLimb(m, ja, jb, jc, K[b].clone().sub(K[a]), K[c].clone().sub(K[b]), sign); };
  for (const s of ['L', 'R']) {
    limb('sh' + s, 'el' + s, 'wr' + s, 'shoulder' + s, 'elbow' + s, 'wrist' + s, -1);
    limb('hip' + s, 'knee' + s, 'ankle' + s, 'hip' + s, 'knee' + s, 'ankle' + s, 1);
    // hand: towards the knuckles, then turned so index-to-little runs the same way
    if (has('wr' + s, 'tip' + s)) {
      const w = J['wrist' + s], F = m.fingers[s]; turnBone(m, w, wposOf(F[2][0]).sub(wposOf(w)), K['tip' + s].clone().sub(K['wr' + s]));
      if (has('idx' + s, 'pky' + s)) {
        const ax = K['tip' + s].clone().sub(K['wr' + s]).normalize(), cur = wposOf(F[1][0]).sub(wposOf(F[4][0])), want = K['idx' + s].clone().sub(K['pky' + s]);
        const pc = cur.addScaledVector(ax, -cur.dot(ax)), pw = want.addScaledVector(ax, -want.dot(ax));
        if (pc.lengthSq() > 1e-8 && pw.lengthSq() > 1e-8) { let t = pc.angleTo(pw); if (new V3().crossVectors(pc, pw).dot(ax) < 0) t = -t; setWorldQ(m, w, new Q().setFromAxisAngle(ax, t).multiply(w.getWorldQuaternion(new Q()))); }
      }
    }
    if (has('ankle' + s, 'toe' + s)) {
      const a = J['ankle' + s], i = FIG.jIdx['ankle' + s], t = FIG.jIdx['toe' + s], T = m.J;
      const toe = a.localToWorld(new V3(T[t * 3] - T[i * 3], T[t * 3 + 1] - T[i * 3 + 1], T[t * 3 + 2] - T[i * 3 + 2]));
      turnBone(m, a, toe.sub(wposOf(a)), K['toe' + s].clone().sub(K['ankle' + s]));
    }
  }
  const p = m.getPose(), q = {}; for (const j of CLIP_J) q[j] = p.q[j];
  return {q, h: curls};
}
// source frames -> clip. frames: [{pos: {humanoidName: V3 (source world)}, headQ: Q (source world), restHeadQ}], plus the source rest positions
function retargetFrames(src, meta) {
  const m = clipRig(), up = new V3(0, 1, 0), R0 = src.rest, mid = (P, a, b) => P[a].clone().add(P[b]).multiplyScalar(.5);
  // facing: the source turned to look along +Z, its first frame at the origin
  const left = R0.leftUpperLeg.clone().sub(R0.rightUpperLeg); left.y = 0; const fwd = new V3().crossVectors(left, up).normalize();
  const fix = new Q().setFromUnitVectors(fwd, new V3(0, 0, 1)), fixI = fix.clone().invert();
  const f0 = src.frames[0].pos, o0 = mid(f0, 'leftUpperLeg', 'rightUpperLeg'), restHipY = mid(R0, 'leftUpperLeg', 'rightUpperLeg').y - Math.min(R0.leftFoot.y, R0.rightFoot.y);
  const k = (m.rootY - .02) / Math.max(restHipY, 1e-4);  // source units to our metres, by the height of the hips
  const NM = {hipL: 'leftUpperLeg', hipR: 'rightUpperLeg', kneeL: 'leftLowerLeg', kneeR: 'rightLowerLeg', ankleL: 'leftFoot', ankleR: 'rightFoot', toeL: 'leftToes', toeR: 'rightToes',
    shL: 'leftUpperArm', shR: 'rightUpperArm', elL: 'leftLowerArm', elR: 'rightLowerArm', wrL: 'leftHand', wrR: 'rightHand', tipL: 'leftMiddleProximal', tipR: 'rightMiddleProximal',
    idxL: 'leftIndexProximal', idxR: 'rightIndexProximal', pkyL: 'leftLittleProximal', pkyR: 'rightLittleProximal', neck: 'neck', head: 'head'};
  const restCurl = src.restCurl, frames = [];
  for (const F of src.frames) {
    const K = {}; for (const [a, b] of Object.entries(NM)) if (F.pos[b]) K[a] = F.pos[b].clone().sub(o0).applyQuaternion(fix);
    for (const s of ['L', 'R']) { // feet without toe bones: point the foot forward from the ankle; hands without fingers: on along the forearm
      if (!K['toe' + s] && K['ankle' + s] && K['knee' + s]) { const sh = K['ankle' + s].clone().sub(K['knee' + s]).normalize(); K['toe' + s] = K['ankle' + s].clone().add(new V3(0, 0, .15).addScaledVector(sh, -.05)); }
      if (!K['tip' + s] && K['wr' + s] && K['el' + s]) K['tip' + s] = K['wr' + s].clone().add(K['wr' + s].clone().sub(K['el' + s]).multiplyScalar(.35));
    }
    const hq = F.headQ ? fix.clone().multiply(F.headQ.clone().multiply(src.restHeadQ.clone().invert())).multiply(fixI) : null;
    const curls = F.curls && restCurl ? F.curls.map((c, i) => clamp((c - restCurl[i]) / 2.1, 0, 1)) : null;
    const r = poseFromJoints(m, K, hq, curls);
    const hips = mid(K, 'hipL', 'hipR');
    frames.push({q: r.q, p: [hips.x * k, (hips.y - mid(R0, 'leftUpperLeg', 'rightUpperLeg').clone().sub(o0).applyQuaternion(fix).y) * k, hips.z * k], h: r.h || REST_CURLS});
  }
  return {id: meta.id || 'c' + Date.now().toString(36), name: meta.name, cat: meta.cat || 'mias', src: meta.src || 'user', fps: meta.fps, loop: !!meta.loop, frames};
}
// finger bend of each finger chain (radians), for curls
function fingerCurls(P) {
  const out = [];
  for (const s of ['left', 'right']) for (const f of ['Thumb', 'Index', 'Middle', 'Ring', 'Little']) {
    const segs = (f === 'Thumb' ? ['Metacarpal', 'Proximal', 'Distal'] : ['Proximal', 'Intermediate', 'Distal']).map(g => P[s + f + g]).filter(Boolean);
    const pts = [P[s + 'Hand'], ...segs].filter(Boolean); let a = 0;
    for (let i = 2; i < pts.length; i++) a += pts[i - 1].clone().sub(pts[i - 2]).angleTo(pts[i].clone().sub(pts[i - 1]));
    out.push(a);
  }
  return out;
}
const CLIP_BONES = ['hips', 'neck', 'head', 'leftUpperLeg', 'rightUpperLeg', 'leftLowerLeg', 'rightLowerLeg', 'leftFoot', 'rightFoot', 'leftToes', 'rightToes',
  'leftUpperArm', 'rightUpperArm', 'leftLowerArm', 'rightLowerArm', 'leftHand', 'rightHand',
  ...['left', 'right'].flatMap(s => ['Thumb', 'Index', 'Middle', 'Ring', 'Little'].flatMap(f => (f === 'Thumb' ? ['Metacarpal', 'Proximal', 'Distal'] : ['Proximal', 'Intermediate', 'Distal']).map(g => s + f + g)))];
// a loaded model (GLB/FBX) with its humanoid map and an animation clip, sampled at fps
function framesFromModel(root, map, clip, fps) {
  const grab = () => { root.updateMatrixWorld(true); const pos = {}; for (const b of CLIP_BONES) if (map[b]) pos[b] = map[b].getWorldPosition(new V3()); return pos; };
  const rest = grab(), restHeadQ = map.head ? map.head.getWorldQuaternion(new Q()) : new Q(), restCurl = fingerCurls(rest);
  const mixer = new THREE.AnimationMixer(root), act = mixer.clipAction(clip); act.play();
  const n = Math.max(2, Math.round(clip.duration * fps) + 1), frames = [];
  for (let i = 0; i < n; i++) { mixer.setTime(Math.min(i / fps, clip.duration)); const pos = grab(); frames.push({pos, headQ: map.head ? map.head.getWorldQuaternion(new Q()) : null, curls: fingerCurls(pos)}); }
  act.stop(); mixer.uncacheRoot(root);
  return {rest, restHeadQ, restCurl, frames};
}
// BVH: hierarchy and motion, forward kinematics to world positions
function framesFromBVH(text, fps) {
  const tok = text.split(/\s+/).filter(Boolean); let i = 0; const joints = [], stack = [];
  const next = () => tok[i++];
  while (i < tok.length) {
    const t = next();
    if (t === 'ROOT' || t === 'JOINT') { const j = {name: next(), parent: stack.length ? stack[stack.length - 1] : -1, off: null, ch: []}; joints.push(j); stack.push(joints.length - 1); }
    else if (t === 'End') { next(); const j = {name: joints[stack[stack.length - 1]].name + '_end', parent: stack[stack.length - 1], off: null, ch: [], end: true}; joints.push(j); stack.push(joints.length - 1); }
    else if (t === 'OFFSET') joints[stack[stack.length - 1]].off = new V3(+next(), +next(), +next());
    else if (t === 'CHANNELS') { const n = +next(), j = joints[stack[stack.length - 1]]; for (let k = 0; k < n; k++) j.ch.push(next()); }
    else if (t === '}') stack.pop();
    else if (t === 'MOTION') break;
  }
  next(); const nF = +next(); next(); next(); const ft = +next();
  const names = joints.filter(j => !j.end).map(j => j.name);
  const map = guessHumanoid({traverse: cb => joints.forEach((j, k) => { if (!j.end) cb({name: j.name, isBone: true, children: [1], _k: k}); })});
  const nCh = joints.reduce((a, j) => a + j.ch.length, 0), data = tok.slice(i, i + nF * nCh).map(Number);
  const AX = {X: new V3(1, 0, 0), Y: new V3(0, 1, 0), Z: new V3(0, 0, 1)};
  const solve = vals => {
    const W = [], WQ = []; let c = 0;
    joints.forEach((j, k) => {
      const lp = j.off ? j.off.clone() : new V3(), lq = new Q();
      for (const ch of j.ch) { const v = vals ? vals[c++] : 0; if (/position/.test(ch)) lp[ch[0].toLowerCase()] = (j.parent < 0 ? 0 : lp[ch[0].toLowerCase()]) + v + (j.parent < 0 ? 0 : 0); else lq.multiply(new Q().setFromAxisAngle(AX[ch[0]], v * DEG)); }
      if (j.parent < 0 && vals) { /* root: offset plus position channels */ }
      const pq = j.parent < 0 ? new Q() : WQ[j.parent], pp = j.parent < 0 ? new V3() : W[j.parent];
      W[k] = pp.clone().add(lp.applyQuaternion(pq)); WQ[k] = pq.clone().multiply(lq);
    });
    const pos = {}; let hq = null;
    for (const [hn, o] of Object.entries(map)) { const k = o._k; if (CLIP_BONES.includes(hn)) pos[hn] = W[k]; if (hn === 'head') hq = WQ[k]; }
    // no toe bones: the foot's end site is the tip of the foot
    for (const S of ['left', 'right']) if (!pos[S + 'Toes'] && map[S + 'Foot']) { const e = joints.findIndex(j => j.end && j.parent === map[S + 'Foot']._k); if (e >= 0) pos[S + 'Toes'] = W[e]; }
    return {pos, headQ: hq, curls: fingerCurls(pos)};
  };
  const rest = solve(null), frames = [], step = Math.max(1, Math.round(1 / ft / fps));
  for (let f = 0; f < nF; f += step) frames.push(solve(data.slice(f * nCh, (f + 1) * nCh)));
  return {src: {rest: rest.pos, restHeadQ: rest.headQ || new Q(), restCurl: rest.curls, frames}, fps: 1 / (ft * step), names};
}

/* ---------- NEOPOSE's own clips: key poses, on a smooth curve ---------- */
// a key: [time, pose (a library pose, or joints), hands (true: the library pose mirrored), dy, dz]; or a gait (26b-gait)
// a key: [time, pose (a library pose, or joints), hands (true: the library pose mirrored), dy, dz, dx]; or a gait (26b-gait).
// plant: the feet stay where they stand (the legs give, see lockFeet); air: [from, to] spans in the air, on a parabola;
// still: no breathing on top
const STAND = {...ARMS_DOWN, ...LEGS_STAND};
const GUARD = POSE.guardia ? POSE.guardia.j : {};
const OWN_CLIPS = [
  {id: 'np-andar', name: 'Andar (ciclo)', cat: 'mov', loop: true, gait: 'walk'},
  {id: 'np-correr', name: 'Correr (ciclo)', cat: 'mov', loop: true, gait: 'run'},
  // standing about: the weight going from one foot to the other, a glance one way and the other, breathing
  {id: 'np-respirar', name: 'Respirar', cat: 'reposo', loop: true, dur: 7.2, plant: true, keys: [
    [0, {...STAND, head: [2, 0, 0]}],
    [1.8, {...STAND, hips: [0, 3, 2], waist: [0, -1, -1], chest: [0, -1, -1.5], head: [0, 7, -2], neck: [1, 3, 0], hipL: [0, 0, 1], hipR: [0, 0, -5], kneeR: [6]}, null, -.006, 0, .018],
    [3.6, {...STAND, head: [3, -2, 1]}],
    [5.4, {...STAND, hips: [0, -3, -2], waist: [0, 1, 1], chest: [0, 1, 1.5], head: [1, -8, 2], neck: [0, -3, 0], hipL: [0, 0, 5], kneeL: [6], hipR: [0, 0, -1]}, null, -.006, 0, -.018],
    [7.2, {...STAND, head: [2, 0, 0]}]]},
  // a wave: the forearm swings to and fro about the upper arm, the wrist flapping after it; the body leans away a touch
  {id: 'np-saludar', name: 'Saludar con la mano', cat: 'gestos', loop: true, dur: 1.2, plant: true, keys: [0, .3, .6, .9, 1.2].map((t, i) =>
    [t, {...LEGS_STAND, shoulderR: [0, i % 2 ? -114 : -66, -102, 'ZXY'], elbowR: [i % 2 ? -88 : -66], shoulderL: [0, 0, 8], elbowL: [-15], chest: [0, -4, -3], head: [0, -6, 5], hips: [0, 0, 1.5]}, 'abierta'])},
  {id: 'np-si', name: 'Asentir', cat: 'gestos', dur: 1.4, plant: true, keys: [[0, STAND], [.14, {...STAND, head: [-6, 0, 0]}], [.4, {...STAND, head: [21, 0, 0], neck: [7, 0, 0]}], [.64, {...STAND, head: [-3, 0, 0]}],
    [.88, {...STAND, head: [15, 0, 0], neck: [5, 0, 0]}], [1.12, {...STAND, head: [1, 0, 0]}], [1.4, STAND]]},
  {id: 'np-no', name: 'Negar con la cabeza', cat: 'gestos', dur: 1.5, plant: true, keys: [[0, STAND], [.12, {...STAND, head: [2, -7, 0]}], [.36, {...STAND, head: [3, 31, 4], neck: [0, 9, 0], chest: [0, -3, 0]}],
    [.64, {...STAND, head: [3, -30, -4], neck: [0, -9, 0], chest: [0, 3, 0]}], [.9, {...STAND, head: [2, 19, 2], neck: [0, 5, 0]}], [1.14, {...STAND, head: [1, -7, -1]}], [1.5, STAND]]},
  // a clap: the hands meet quickly and part slowly, the chest giving a little at each one
  {id: 'np-aplaudir', name: 'Aplaudir', cat: 'gestos', loop: true, dur: .5, plant: true, keys: [[0, {...sym({shoulderL: [-45, -28, 18, 'ZXY'], elbowL: [-100]}), ...LEGS_STAND}, 'plana'],
    [.16, {...sym({shoulderL: [-46, -50, 8, 'ZXY'], elbowL: [-90]}), chest: [3, 0, 0], head: [2, 0, 0], ...LEGS_STAND}, 'plana'], [.5, {...sym({shoulderL: [-45, -28, 18, 'ZXY'], elbowL: [-100]}), ...LEGS_STAND}, 'plana']]},
  // looking round: the eyes and head go first, the chest follows, the weight goes onto the foot on that side
  {id: 'np-mirar', name: 'Mirar alrededor', cat: 'reposo', dur: 4, plant: true, keys: [[0, STAND], [.5, {...STAND, head: [0, 46, 0], neck: [0, 12, 0]}],
    [.95, {...STAND, head: [2, 54, -3], neck: [0, 15, 0], chest: [0, 13, 0], waist: [0, 6, 0], hips: [0, 4, 0]}, null, 0, 0, .012], [1.6, {...STAND, head: [5, 51, -2], neck: [0, 15, 0], chest: [0, 13, 0], waist: [0, 6, 0], hips: [0, 4, 0]}, null, 0, 0, .012],
    [2.05, {...STAND, head: [0, -38, 0], neck: [0, -10, 0], chest: [0, 6, 0], waist: [0, 3, 0]}], [2.5, {...STAND, head: [2, -55, 3], neck: [0, -15, 0], chest: [0, -13, 0], waist: [0, -6, 0], hips: [0, -4, 0]}, null, 0, 0, -.012],
    [3.2, {...STAND, head: [4, -52, 2], neck: [0, -15, 0], chest: [0, -12, 0], waist: [0, -6, 0], hips: [0, -4, 0]}, null, 0, 0, -.012], [4, STAND]]},
  // a bow: a breath in and up first, down from the waist, held a moment a little deeper, up again with the head last
  {id: 'np-reverencia', name: 'Reverencia', cat: 'gestos', dur: 2.8, plant: true, keys: [[0, 'pie'], [.35, {...STAND, chest: [-4, 0, 0], head: [-5, 0, 0]}], [1, 'reverencia'],
    [1.6, {...(POSE.reverencia ? POSE.reverencia.j : {}), waist: [29, 0, 0], chest: [28, 0, 0], neck: [7, 0, 0], head: [15, 0, 0]}], [2.2, {...STAND, waist: [3, 0, 0], chest: [5, 0, 0], head: [8, 0, 0]}], [2.8, 'pie']]},
  // a jump: down and arms back to load, up through the toes with the arms flung up, a tuck in the air (a true parabola),
  // landing on the balls of the feet and sinking to soak it up, then up again
  {id: 'np-saltar', name: 'Salto en el sitio', cat: 'salto', dur: 1.9, plant: true, air: [[.58, 1.02]], keys: [[0, 'pie'],
    [.38, {hips: [22, 0, 0], waist: [6, 0, 0], head: [-6, 0, 0], ...sym({hipL: [-65, 0, 6], kneeL: [95], ankleL: [-28], shoulderL: [38, 0, 12], elbowL: [-25]})}, null, -.22],
    [.58, {chest: [-4, 0, 0], head: [-8, 0, 0], ...sym({hipL: [2, 0, 4], kneeL: [4], ankleL: [35], shoulderL: [-115, 0, 14], elbowL: [-14]})}, 'abierta', .02],
    [.8, {chest: [-8, 0, 0], head: [-12, 0, 0], ...sym({hipL: [-28, 0, 12], kneeL: [48], ankleL: [20], shoulderL: [-158, 0, 18], elbowL: [-10]})}, 'abierta'],
    [1.02, {...sym({hipL: [-12, 0, 5], kneeL: [14], ankleL: [15], shoulderL: [-60, 0, 30], elbowL: [-20]})}, 'abierta', .02],
    [1.18, {hips: [18, 0, 0], head: [4, 0, 0], ...sym({hipL: [-55, 0, 6], kneeL: [80], ankleL: [-25], shoulderL: [-30, 0, 25], elbowL: [-30]})}, null, -.17],
    [1.5, {hips: [6, 0, 0], ...sym({hipL: [-15, 0, 4], kneeL: [20], ankleL: [-6], shoulderL: [-5, 0, 12], elbowL: [-15]})}, null, -.03], [1.9, 'pie']]},
  // sitting down: knees unlock, the hips go back and down with the arms forward to balance, a soft landing on the seat
  {id: 'np-sentarse', name: 'Sentarse', cat: 'reposo', dur: 2, plant: true, keys: [[0, 'pie'], [.35, {...STAND, hips: [8, 0, 0], head: [4, 0, 0], ...sym({hipL: [-10, 0, 5], kneeL: [14], ankleL: [-6]})}, null, -.03],
    [.9, {hips: [38, 0, 0], waist: [8, 0, 0], chest: [6, 0, 0], head: [-10, 0, 0], ...sym({hipL: [-75, 0, 7], kneeL: [85], ankleL: [-22], shoulderL: [-78, 0, 10], elbowL: [-18]})}, null, -.25, -.18],
    [1.35, {hips: [20, 0, 0], head: [-4, 0, 0], ...sym({hipL: [-88, 0, 7], kneeL: [90], ankleL: [-5], shoulderL: [-45, 0, 10], elbowL: [-35]})}, null, -.43, -.32],
    [1.6, {...(POSE.sentado ? POSE.sentado.j : {}), hips: [6, 0, 0]}, null, -.445, -.32], [2, 'sentado', null, -.43, -.32]]},
  // a jab and a cross: a little load before each, the fist snapping out and coming back slower, the hips turning into the cross
  {id: 'np-boxeo', name: 'Combinación de puñetazos', cat: 'combate', dur: 1.6, plant: true, keys: [[0, 'guardia'], [.14, {...GUARD, hips: [0, -34, 0], chest: [9, 14, 0]}, 'puno'], [.24, 'jab'], [.44, 'guardia'],
    [.62, {...GUARD, hips: [0, -40, 0], waist: [0, 6, 0], chest: [8, 4, 0]}, 'puno'], [.74, 'cross'], [.98, 'guardia'], [1.18, 'guardia', null, -.02], [1.6, 'guardia']]},
  // painting at an easel: the palette held low in the left hand, the brush in short strokes and dabs, the head tilting to judge it
  {id: 'np-pintar', name: 'Pintar', cat: 'trabajo', loop: true, dur: 2.4, plant: true, keys: [0, .3, .6, .9, 1.2, 1.5, 1.8, 2.1, 2.4].map((t, i) => {
    const k = i % 8, st = [[-58, 10, -14, -62, 0], [-63, 15, -12, -54, 9], [-54, 6, -16, -68, -7], [-61, 11, -14, -50, 4], [-56, 8, -15, -64, 0], [-60, 4, -11, -58, -8], [-52, 12, -17, -70, 6], [-59, 9, -14, -53, 2]][k];
    return [t, {...LEGS_STAND, hipL: [-6, 0, 4], kneeL: [8], chest: [4, -8, 0], head: [6, k > 3 ? -2 : -8, k > 3 ? -5 : 5], neck: [3, -4, 0], shoulderL: [-12, -35, 14, 'ZXY'], elbowL: [-88],
      shoulderR: [st[0], st[1], st[2]], elbowR: [st[3]], wristR: [st[4], 0, st[4] * .6]}, 'agarre']; })},
  // looking closely at something: leaning in, a hand to the chin, the head turning a little to see better
  {id: 'np-observar', name: 'Observar con atención', cat: 'gestos', loop: true, dur: 3.3, plant: true, keys: [[0, -2, 0], [1.1, 6, 5], [2.2, -5, -4], [3.3, -2, 0]].map(([t, y, z]) =>
    [t, {...LEGS_STAND, hips: [5, 0, 0], waist: [6, 0, 0], chest: [8, 0, 0], neck: [8, y * .4, 0], head: [15, y, z], shoulderR: [-30, -32, -6, 'ZXY'], elbowR: [-112], shoulderL: [-8, -62, 12, 'ZXY'], elbowL: [-95]}])}
];
/* A curve through key values that never stops between them: at each key the slope comes from its neighbours (the
   shape-keeping Hermite of Fritsch and Carlson), flat only where a move turns back or holds, so nothing overshoots a
   key and a move that goes on through a key does not halt there. A loop's ends meet with the same slope; a clip that
   is not a loop eases out of its first key and into its last.
   ts: key times, vs: one array of numbers per key; wrap(i, v): a neighbour's value seen from key i (quaternion signs) */
function keyCurve(ts, vs, loop, wrap) {
  const m = ts.length, dur = ts[m - 1] - ts[0], off = vs[m - 1].map((v, c) => v - vs[0][c]);  // a loop may travel: its last key is its first, moved on
  const nb = (i, d) => {  // the key d steps from i, with its time and value (around the loop)
    let j = i + d, t, v;
    if (j >= 0 && j < m) { t = ts[j]; v = vs[j]; }
    else if (!loop) return null;
    else if (j < 0) { j += m - 1; t = ts[j] - dur; v = vs[j].map((x, c) => x - off[c]); }
    else { j -= m - 1; t = ts[j] + dur; v = vs[j].map((x, c) => x + off[c]); }
    return {t, v: wrap ? wrap(i, v) : v};
  };
  const slope = vs.map((v, i) => {
    const a = nb(i, -1), b = nb(i, 1);
    if (!a || !b) return v.map(() => 0);
    const h0 = ts[i] - a.t, h1 = b.t - ts[i], w1 = 2 * h1 + h0, w2 = h1 + 2 * h0;
    return v.map((x, c) => { const d0 = (x - a.v[c]) / h0, d1 = (b.v[c] - x) / h1; return d0 * d1 <= 0 ? 0 : (w1 + w2) / (w1 / d0 + w2 / d1); });
  });
  return t => {
    let i = 0; while (i < m - 2 && ts[i + 1] <= t) i++;
    const h = ts[i + 1] - ts[i], s = h > 0 ? clamp((t - ts[i]) / h, 0, 1) : 0, s2 = s * s, s3 = s2 * s;
    const a = vs[i], b = wrap ? wrap(i, vs[i + 1]) : vs[i + 1], flip = b !== vs[i + 1] ? -1 : 1;  // (the next key's slope turns with it)
    return a.map((x, c) => (2 * s3 - 3 * s2 + 1) * x + (s3 - 2 * s2 + s) * h * slope[i][c] + (-2 * s3 + 3 * s2) * b[c] + (s3 - s2) * h * slope[i + 1][c] * flip);
  };
}
const mirrorJ = j => Object.fromEntries(Object.entries(j).map(([k, e]) => [swapSide(k), mirrorRot(e)]));
// a quaternion on the same side as another (q and -q are the same turn: the curve must not go the long way round)
const sameSide = (q, ref) => q[0] * ref[0] + q[1] * ref[1] + q[2] * ref[2] + q[3] * ref[3] < 0 ? q.map(x => -x) : q;
/* Follow-through and overlapping action: each joint of the upper body chases the pose it is given through a damped
   spring, stiff near the trunk and looser out to the head and the hands, so the extremities arrive a moment late, go
   a little past and settle (Thomas & Johnston's "follow through"; Williams' "successive breaking of joints"). The
   hips and legs keep their keys exactly: the feet stay where they are. A loop is run round until it repeats itself.
   SPRING: joint -> [natural frequency (rad/s), damping ratio] */
const SPRING = {waist: [34, .7], chest: [28, .62], neck: [24, .58], head: [19, .52], shoulderL: [26, .6], shoulderR: [26, .6], elbowL: [21, .55], elbowR: [21, .55], wristL: [16, .5], wristR: [16, .5]};
const rotVec = q => { const w = clamp(q[3], -1, 1), s = w < 0 ? -1 : 1, a = 2 * Math.acos(Math.abs(w)), n = Math.sqrt(Math.max(0, 1 - w * w)); return n < 1e-6 ? [0, 0, 0] : [q[0], q[1], q[2]].map(v => v * s * a / n); };
function followThrough(frames, fps, loop) {
  const n = frames.length, sub = 4, dt = 1 / fps / sub, laps = loop ? 3 : 1;
  for (const [j, [om, ze]] of Object.entries(SPRING)) {
    let x = new Q().fromArray(frames[0].q[j]), w = new V3();
    const out = [], qt = new Q(), qi = new Q(), y = new Q();
    for (let lap = 0; lap < laps; lap++) for (let i = 0; i < n; i++) {
      const a = frames[i].q[j], b = frames[loop ? (i + 1) % n : Math.min(i + 1, n - 1)].q[j];
      for (let k = 0; k < sub; k++) {
        y.fromArray(a).slerp(qt.fromArray(b), k / sub);
        const e = rotVec(y.clone().multiply(qi.copy(x).invert()).toArray());  // how far it is from where it should be
        w.x += (om * om * e[0] - 2 * ze * om * w.x) * dt; w.y += (om * om * e[1] - 2 * ze * om * w.y) * dt; w.z += (om * om * e[2] - 2 * ze * om * w.z) * dt;
        const ang = w.length() * dt; if (ang > 1e-9) x.premultiply(qt.setFromAxisAngle(w.clone().normalize(), ang)); x.normalize();
      }
      if (lap === laps - 1) out.push(x.toArray());
    }
    out.forEach((q, i) => frames[i].q[j] = q);
  }
}
// breathing under everything a standing figure does (not in a quick loop, where it would pant)
function breathe(frames, fps, loop) {
  const len = frames.length / fps; if (loop && len < 2.4) return;
  const per = loop ? len / Math.max(1, Math.round(len / 3.6)) : 3.6, E = new THREE.Euler(), d = new Q();
  frames.forEach((f, i) => { const b = Math.sin(2 * Math.PI * i / fps / per);
    for (const [j, a] of [['chest', -1.6], ['neck', .7], ['shoulderL', .8], ['shoulderR', .8]]) f.q[j] = new Q().fromArray(f.q[j]).multiply(d.setFromEuler(E.set(a * b * DEG, 0, j === 'shoulderL' ? b * .6 * DEG : j === 'shoulderR' ? -b * .6 * DEG : 0))).toArray(); });
}
/* Feet that stay put: wherever the keys take the hips, the legs give (a two-bone IK, the knee kept in the plane the keys
   bend it in) so each foot stays where it stood in the first frame, turned as the keys turn it and never through the
   floor: a foot pointed on its toes stands on them. Not in the air. */
function lockFeet(frames) {
  const m = clipRig(), g = gaitRig(m), J = m.joints, save = m.getPose(), pose = f => { m.setPose(clipPose(m, f, new V3(), 0, false, 1)); m.group.updateMatrixWorld(true); };
  pose(frames[0]); const home = {L: wposOf(J.ankleL), R: wposOf(J.ankleR)}, T = m.J, toeOff = s => { const i = FIG.jIdx['ankle' + s], t = FIG.jIdx['toe' + s]; return new V3(T[t * 3] - T[i * 3], T[t * 3 + 1] - T[i * 3 + 1], T[t * 3 + 2] - T[i * 3 + 2]); };
  const target = s => { const aq = J['ankle' + s].getWorldQuaternion(new Q()), toe = toeOff(s).applyQuaternion(aq); return {aq, A: new V3(home[s].x, Math.max(g.floor + g.ank.y, g.floor + g.toe.y - toe.y), home[s].z)}; };
  // where a leg cannot reach its foot (a wide stance), the hips come down as far as it needs, smoothly
  const drop = frames.map(f => { if (f.air) return 0; pose(f); let d = 0;
    for (const s of ['L', 'R']) { const {A} = target(s), H = wposOf(J['hip' + s]), h = Math.hypot(H.x - A.x, H.z - A.z), r = g.L * .99; d = Math.max(d, H.y - A.y - Math.sqrt(Math.max(0, r * r - h * h))); }
    return d; });
  frames.forEach((f, i) => { let a = 0, c = 0; for (let k = -3; k <= 3; k++) { const v = drop[clamp(i + k, 0, frames.length - 1)]; a = Math.max(a, v * (1 - Math.abs(k) / 4)); c++; } if (!f.air) f.p[1] -= Math.max(drop[i], a); });
  for (const f of frames) {
    if (f.air) continue;
    pose(f);
    for (const s of ['L', 'R']) {
      const {aq, A} = target(s), H = wposOf(J['hip' + s]), K0 = wposOf(J['knee' + s]);  // the foot turned as the keys turn it
      const d = Math.min(H.distanceTo(A), g.L * .999), u = A.clone().sub(H).normalize(), w = K0.clone().sub(H); w.addScaledVector(u, -w.dot(u)); if (w.lengthSq() < 1e-8) w.set(0, 0, 1).addScaledVector(u, -u.z); w.normalize();
      const al = Math.acos(clamp((g.a * g.a + d * d - g.b * g.b) / (2 * g.a * d), -1, 1)), K = H.clone().addScaledVector(u, g.a * Math.cos(al)).addScaledVector(w, g.a * Math.sin(al));
      aimLimb(m, 'hip' + s, 'knee' + s, 'ankle' + s, K.clone().sub(H), H.clone().addScaledVector(u, d).sub(K), 1);
      setWorldQ(m, J['ankle' + s], aq);
    }
    const p = m.getPose(); for (const j of ['hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR']) f.q[j] = p.q[j];
  }
  m.setPose(save); m.group.updateMatrixWorld(true);
}
function buildOwnClip(def) {
  if (def.gait) { const fps = 30, frames = gaitClip(def, fps); return {id: def.id, name: tr(def.name), cat: def.cat, src: 'neopose', fps, loop: true, frames, len: frames.length / fps, kit: def.kit}; }
  const m = clipRig(), fps = 24, n = Math.round(def.dur * fps) + 1, Ks = [];
  for (let [t, p, hands, dy, dz, dx] of def.keys) {
    const pose = typeof p === 'string' ? POSE[p] : {j: p, hands: hands ? {L: hands, R: hands} : undefined};
    m.joints.hips.position.set(0, m.rootY, 0); applyPreset(m, hands === true ? {j: mirrorJ(pose.j), hands: pose.hands} : pose, {ground: false});
    const g = m.getPose(), q = {}; for (const j of CLIP_J) q[j] = g.q[j];
    // a key that does not say how high stands on the ground: its lower foot where a foot stands at rest
    if (dy == null) { const f = footPoints(m, {q, p: [0, 0, 0]}), r = footPoints(m, {q: {hips: [0, 0, 0, 1]}, p: [0, 0, 0]}); dy = Math.min(r[0].y, r[1].y) - Math.min(f[0].y, f[1].y); }
    Ks.push({t, q, dy: dy || 0, dz: dz || 0, dx: dx || 0, h: [...m.hands.L.c, ...m.hands.R.c]});
  }
  const ts = Ks.map(k => k.t), Q4 = {};
  for (const j of CLIP_J) Q4[j] = keyCurve(ts, Ks.map(k => k.q[j]), def.loop, (i, v) => sameSide(v, Ks[i].q[j]));
  const rest = keyCurve(ts, Ks.map(k => [k.dy, k.dz, k.dx, ...k.h]), def.loop), frames = [];
  // in the air the hips fly on a parabola from where they leave the ground to where they land
  const airY = t => { for (const [a, b] of def.air || []) if (t > a && t < b) { const ya = rest(a)[0], yb = rest(b)[0], T = b - a; return ya + (yb - ya) * (t - a) / T + 4.9 * (t - a) * (b - t); } return null; };
  for (let i = 0; i < n; i++) {
    const t = i / fps, q = {}, r = rest(t), ay = airY(t);
    for (const j of CLIP_J) { const v = Q4[j](t), l = Math.hypot(...v) || 1; q[j] = v.map(x => x / l); }
    frames.push({q, p: [r[2], ay ?? r[0], r[1]], h: r.slice(3).map(v => clamp(v, 0, 1)), air: ay != null});
  }
  if (def.loop) frames.pop();  // the last key repeats the first
  if (!def.still) breathe(frames, fps, def.loop);
  followThrough(frames, fps, def.loop);
  if (def.plant) lockFeet(frames);
  frames.forEach(f => delete f.air);
  return {id: def.id, name: tr(def.name), cat: def.cat, src: 'neopose', fps, loop: !!def.loop, frames, len: (def.loop ? frames.length : n - 1) / fps, kit: def.kit};
}
// the feet of the figure posed with frame f on the spot: for each side the lower of the ankle and the toes (where the
// foot touches the ground) and the ankle (what stays put while the foot is down: the lowest point rolls on as it rocks
// from heel to toes)
function footPoints(m, f) {
  m.setPose(clipPose(m, {q: f.q, p: [0, f.p[1], 0], h: f.h || REST_CURLS}, new V3(0, 0, 0), 0, true, 1)); m.group.updateMatrixWorld(true);
  const T = m.J;
  return ['L', 'R'].map(s => {
    const a = m.joints['ankle' + s], i = FIG.jIdx['ankle' + s], t = FIG.jIdx['toe' + s];
    const an = wposOf(a), toe = a.localToWorld(new V3(T[t * 3] - T[i * 3], T[t * 3 + 1] - T[i * 3 + 1], T[t * 3 + 2] - T[i * 3 + 2]));
    const low = an.y < toe.y ? an.clone() : toe; low.ankle = an; return low;
  });
}

/* ---------- the library: own clips, Quaternius (bundled), yours (this browser) ---------- */
const clipDB = {
  open() { return new Promise((res, rej) => { try { const r = indexedDB.open('cdp-clips', 1); r.onupgradeneeded = () => r.result.createObjectStore('c', {keyPath: 'id'}); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } }); },
  async all() { try { const db = await this.open(); return await new Promise(res => { const q = db.transaction('c').objectStore('c').getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => res([]); }); } catch (_) { return []; } },
  async put(v) { try { const db = await this.open(); db.transaction('c', 'readwrite').objectStore('c').put(v); } catch (_) {} },
  async del(id) { try { const db = await this.open(); db.transaction('c', 'readwrite').objectStore('c').delete(id); } catch (_) {} }
};
async function loadClipLibrary() {
  if (CLIPS.lib) return CLIPS.lib;
  const own = [...OWN_CLIPS, ...ACCESS_CLIPS].map(buildOwnClip);
  let ual = [];
  try {
    const txt = await (await fetch('anims/ual.txt')).text(), buf = await gunzip(Uint8Array.from(atob(txt.trim()), c => c.charCodeAt(0)).buffer);
    ual = JSON.parse(new TextDecoder().decode(buf)).map(o => ({...unpackClip(o), name: tr(o.name)}));
  } catch (e) { console.warn('ual', e); }
  CLIPS.mine = (await clipDB.all()).sort((a, b) => (b.at || 0) - (a.at || 0)).map(unpackClip);
  CLIPS.lib = [...own, ...ual];
  return CLIPS.lib;
}
const allClips = () => [...CLIPS.mine, ...(CLIPS.lib || [])];
async function saveMyClip(c) { const o = {...packClip(c), at: Date.now()}; await clipDB.put(o); CLIPS.mine.unshift(unpackClip(o)); }

/* ---------- into the film ---------- */
// keys of character ci from frame f0: the clip resampled to the film's rate, linear between frames, root motion carried
function insertClip(c, ci, f0, o = {}) {
  const s = shot(), m = chars[ci]; if (!s || !m) return 0;
  padKeys(s);
  const speed = o.speed || 1, loops = Math.max(1, o.loops || 1), len = c.len / speed, n = Math.max(2, Math.round(len * loops * ANIM.fps) + 1);
  if (f0 + n > s.len) { setShotLen(f0 + n); toast(tr('El plano se alarga a {s} s para que quepa la animación.', {s: dec(sec(s.len))})); }
  // a clip is made facing +Z: turned to where the character faces now
  // a clip with a mobility aid brings it (in a wheelchair, the whole clip sits on its seat)
  let seatOff = 0;
  if (c.kit) { if (c.kit === 'silla') { const keep = m.getPose(); m.setPose(clipPose(m, c.frames[0], new V3().fromArray(keep.pos), facingOf(keep.q), true, m.rootY / clipRig().rootY, keep.q)); accessKit(m, c.kit); seatOff = m.joints.hips.position.y - m.rootY; m.joints.hips.position.y = keep.pos[1]; } else accessKit(m, c.kit); }
  const p0 = m.getPose(), at = new V3().fromArray(p0.pos), yaw = facingOf(p0.q), k = m.rootY / clipRig().rootY;
  const cs = clipStride(c), stride = new V3(cs[0], 0, cs[2]);
  const K = s.keys[ci].filter(x => x.f < f0 || x.f > f0 + n - 1);
  for (let i = 0; i < n; i++) {
    const tt = i / ANIM.fps * speed, loop = Math.min(loops - 1, Math.floor(tt / c.len + 1e-6)), t = tt - loop * c.len;
    const smp = sampleClip(c, Math.min(t, c.len)), base = at.clone();
    if (!o.inPlace && loop) base.add(stride.clone().multiplyScalar(loop * k).applyQuaternion(new Q().setFromAxisAngle(new V3(0, 1, 0), yaw)));
    const pose = clipPose(m, smp, base, yaw, o.inPlace, k, p0.q); pose.pos[1] += seatOff;
    K.push(i ? {f: f0 + i, pose, lin: i < n - 1} : {f: f0, pose, lin: true, clip: c.name});
  }
  K.sort((a, b) => a.f - b.f); s.keys[ci] = K;
  ANIM.track = ci; setFrame(f0); renderLabels(); thumbLater(); pushHistory();
  return n;
}
// the keys of a character in the current shot, as a clip of your own
function clipFromTrack(ci, name) {
  const s = shot(), K = s && s.keys[ci]; if (!K || K.length < 2) return null;
  const f0 = K[0].f, f1 = K[K.length - 1].f, frames = [], p0 = new V3().fromArray(K[0].pose.pos), m = chars[ci], yaw = facingOf(K[0].pose.q), Yi = new Q().setFromAxisAngle(new V3(0, 1, 0), -yaw);
  for (let f = f0; f <= f1; f++) {
    const p = poseAt(ci, f), q = {}; for (const j of CLIP_J) q[j] = p.q[j];
    q.hips = Yi.clone().multiply(new Q().fromArray(p.q.hips)).toArray();
    const d = new V3().fromArray(p.pos).sub(p0).applyQuaternion(Yi), h = p.hands ? [...p.hands.L.c, ...p.hands.R.c] : null;
    frames.push({q, p: [d.x, p.pos[1] - m.rootY, d.z], h});
  }
  return {id: 'm' + Date.now().toString(36), name, cat: 'mias', src: 'user', fps: ANIM.fps, loop: false, frames, len: (frames.length - 1) / ANIM.fps};
}
async function importAnimFile(file) {
  if (!file) return;
  const msg = $('#agMsg'); msg.textContent = tr('Leyendo «{x}»…', {x: file.name});
  try {
    const out = [], base = file.name.replace(/\.[^.]+$/, '');
    if (/\.bvh$/i.test(file.name)) {
      const r = framesFromBVH(await file.text(), 24); if (!r.src.rest.leftUpperLeg || !r.src.rest.leftUpperArm) throw new Error(tr('no reconozco el esqueleto'));
      out.push(retargetFrames(r.src, {name: base, fps: r.fps}));
    } else {
      const parsed = await parseAvatar(await file.arrayBuffer(), file.name), map = parsed.map;
      if (!map.hips || !map.leftUpperArm || !map.leftUpperLeg) throw new Error(tr('no reconozco el esqueleto'));
      if (!parsed.animations.length) throw new Error(tr('el archivo no trae animaciones'));
      const list = parsed.animations.filter(a => a.duration >= .05);
      for (const [i, a] of list.entries()) {
        msg.textContent = tr('Convirtiendo {i} de {n}: «{x}»…', {i: i + 1, n: list.length, x: a.name}); await new Promise(r => setTimeout(r, 0));
        out.push(retargetFrames(framesFromModel(parsed.scene, map, a, 24), {name: list.length > 1 ? `${base} · ${a.name}` : base, fps: 24}));
      }
    }
    for (const c of out) await saveMyClip(c);
    msg.textContent = tr('{n} animación(es) importada(s) en «Mis animaciones».', {n: out.length});
    AG.cat = 'mias'; AG.sel = CLIPS.mine[0] || null; renderAnimGallery();
  } catch (e) { console.warn('import anim', e); msg.textContent = tr('No se ha podido importar: {e}', {e: e && e.message || e}); }
}

/* ---------- the gallery window ---------- */
const AG = {cat: 'todas', q: '', sel: null, prev: null, t: 0, opts: {loops: 1, speed: 1, inPlace: false}};
async function openAnimGallery() {
  tourEvent('clips');
  $('#animGallery').hidden = false; $('#agMsg').textContent = CLIPS.lib ? '' : tr('Cargando la galería…');
  await loadClipLibrary(); $('#agMsg').textContent = '';
  if (!AG.sel) AG.sel = CLIPS.lib[0];
  renderAnimGallery(); startPreview();
}
function closeAnimGallery() { $('#animGallery').hidden = true; }
function clipThumb(c) {
  if (CLIPS.thumbs.has(c.id)) return CLIPS.thumbs.get(c.id);
  if (!thumbR) return null;
  const m = thumbChars[0]; thumbChars.forEach((x, i) => x.group.visible = i === 0);
  // the most telling moment: the frame furthest from the first one
  let best = 0, bi = 0; const a0 = c.frames[0].q;
  for (let i = 0; i < c.frames.length; i += Math.max(1, c.frames.length >> 4)) { let d = 0; for (const j of CLIP_J) d += 1 - Math.abs(new Q().fromArray(a0[j]).dot(new Q().fromArray(c.frames[i].q[j]))); if (d > best) { best = d; bi = i; } }
  m.setPose(clipPose(m, c.frames[bi], new V3(0, 0, 0), 0, true, m.rootY / clipRig().rootY)); m.group.updateMatrixWorld(true); applyMuscles(m, 1);
  const box = m.box(12), ctr = box.getCenter(new V3()), size = box.getSize(new V3()), r = Math.max(size.y, size.x * 1.25, size.z * 1.1) * .5;
  const d = r / Math.tan(thumbCam.fov * DEG / 2) * 1.12, az = 32 * DEG, el = 10 * DEG;
  thumbCam.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(d).add(ctr); thumbCam.lookAt(ctr); thumbR.render(thumbScene, thumbCam);
  const url = thumbR.domElement.toDataURL('image/png'); CLIPS.thumbs.set(c.id, url); return url;
}
const SRC_LABEL = {neopose: 'NEOPOSE', ual: 'Quaternius · CC0', user: 'Tuya'};
function renderAnimGallery() {
  const norm = t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(), grid = $('#agGrid'), q = norm(AG.q.trim());
  const list = allClips().filter(c => (AG.cat === 'todas' || c.cat === AG.cat) && (!q || q.split(/\s+/).every(w => norm(c.name + ' ' + tr(CLIP_CATS[c.cat] || '')).includes(w))));
  chips($('#agCats'), Object.entries(CLIP_CATS).filter(([k]) => k !== 'mias' || CLIPS.mine.length || AG.cat === 'mias').map(([k, v]) => [k, tr(v)]), AG.cat, v => { AG.cat = v; renderAnimGallery(); });
  $('#agCount').textContent = tr('{n} animaciones', {n: list.length}); const on = $('#agCats [aria-pressed="true"]'); if (on && on.scrollIntoView) on.scrollIntoView({block: 'nearest', inline: 'nearest'});
  grid.innerHTML = '';
  if (!list.length) grid.innerHTML = `<p class="empty">${AG.cat === 'mias' ? tr('Aún no tienes animaciones propias: importa un archivo o guarda la pista de un personaje.') : tr('Nada coincide con la búsqueda.')}</p>`;
  const io = new IntersectionObserver(es => {
    for (const e of es) if (e.isIntersecting) { const c = allClips().find(x => x.id === e.target.dataset.id), url = c && clipThumb(c), th = e.target.querySelector('.th'); if (url) { th.classList.remove('pending'); th.style.setProperty('--m', `url(${url})`); } io.unobserve(e.target); }
  }, {root: grid, rootMargin: '120px'});
  for (const c of list) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'pose agItem' + (AG.sel === c ? ' on' : '') + (c.src === 'user' ? ' mine' : ''); b.dataset.id = c.id; b.title = c.name;
    b.setAttribute('aria-pressed', String(AG.sel === c));
    const th = document.createElement('div'), url = CLIPS.thumbs.get(c.id); th.className = 'th' + (url ? '' : ' pending'); if (url) th.style.setProperty('--m', `url(${url})`);
    const nm = document.createElement('span'); nm.textContent = c.name;
    const meta = document.createElement('span'); meta.className = 'agmeta'; meta.textContent = `${dec(c.len)} s${c.loop ? ' · ' + tr('bucle') : ''}`;
    b.append(th, nm, meta);
    b.onclick = () => { AG.sel = c; AG.t = 0; grid.querySelectorAll('.agItem').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); }); renderAgDetail(); };
    b.ondblclick = addSelectedClip;
    grid.appendChild(b); if (!url) io.observe(b);
  }
  renderAgDetail();
}
function renderAgDetail() {
  const c = AG.sel, box = $('#agDetail'); box.hidden = !c; if (!c) return;
  $('#agName').textContent = c.name;
  $('#agSrc').textContent = `${SRC_LABEL[c.src] ? tr(SRC_LABEL[c.src]) : ''} · ${dec(c.len)} s · ${tr(CLIP_CATS[c.cat] || '')}`;
  chips($('#agWho'), chars.map((_, i) => [String(i), speaker(i)]), String(chars.indexOf(mq)), v => { AG.who = +v; });
  AG.who = chars.indexOf(mq);
  $('#agDel').hidden = c.src !== 'user';
  $('#agWhen').textContent = ANIM.shots.length ? tr('Empieza en el fotograma actual del plano «{n}» ({s} s).', {n: shot().name, s: dec(sec(ANIM.f))}) : tr('Se abrirá la línea de tiempo y empezará al principio.');
}
// a little stage with one figure, for previews: pose(dt, fig) gives the pose to show each frame, alive() keeps it running
function miniStage(cv, alive, pose) {
  let r; try { r = new THREE.WebGLRenderer({canvas: cv, antialias: true, alpha: true}); } catch (e) { return {start() {}}; }
  r.setPixelRatio(Math.min(devicePixelRatio, 2));
  const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 1, .05, 60), dl = new THREE.DirectionalLight(0xffffff, .55);
  sc.add(new THREE.HemisphereLight(0xffffff, 0x8a8273, 1.05)); dl.position.set(2, 4, 3); sc.add(dl, new THREE.GridHelper(8, 16, 0xb9ad94, 0xd8cfba));
  const fig = new Mannequin(makeCharMats(), 'volumen'); fig.build(bodyOf('hombre')); sc.add(fig.group);
  let last = 0, running = false;
  const loop = now => {
    if (!alive()) { running = false; return; }
    const w = cv.clientWidth, h = cv.clientHeight;
    if (w && cv.width !== Math.round(w * r.getPixelRatio())) { r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
    const p = pose(Math.min(.1, (now - last) / 1000), fig); last = now;
    if (p) { fig.setPose(p); fig.group.updateMatrixWorld(true); applyMuscles(fig, 1); const hp = fig.joints.hips.getWorldPosition(new V3()); cam.position.set(hp.x + 1.5, 1.25, hp.z + 3.1); cam.lookAt(hp.x, .88, hp.z); }
    r.render(sc, cam); requestAnimationFrame(loop);
  };
  return {fig, start() { if (!running) { running = true; last = performance.now(); requestAnimationFrame(loop); } }};
}
// the gallery's preview: the selected clip, at the chosen speed
function startPreview() {
  if (!AG.stage) AG.stage = miniStage($('#agView'), () => !$('#animGallery').hidden, (dt, fig) => {
    const c = AG.sel; if (!c) return null;
    AG.t += dt * AG.opts.speed; if (AG.t > c.len + (c.loop ? 0 : .6)) AG.t = 0;
    return clipPose(fig, sampleClip(c, Math.min(AG.t, c.len)), new V3(0, 0, 0), 0, AG.opts.inPlace, fig.rootY / clipRig().rootY);
  });
  AG.stage.start();
}
async function addSelectedClip() {
  const c = AG.sel; if (!c) return;
  if (!ANIM.open) openTimeline(true);
  const ci = AG.who ?? chars.indexOf(mq), n = insertClip(c, ci, ANIM.f, AG.opts);
  closeAnimGallery(); toast(tr('«{x}» añadida a {w}: {n} fotogramas.', {x: c.name, w: speaker(ci), n}));
}
function buildAnimGalleryUI() {
  $('#tlClips').onclick = openAnimGallery; $('#libClips').onclick = openAnimGallery;
  $('#agClose').onclick = closeAnimGallery;
  $('#animGallery').onclick = e => { if (e.target === e.currentTarget) closeAnimGallery(); };
  $('#agSearch').oninput = e => { AG.q = e.target.value; renderAnimGallery(); };
  $('#agAdd').onclick = addSelectedClip;
  $('#agPose').onclick = () => {
    const c = AG.sel; if (!c) return; const i = AG.who ?? chars.indexOf(mq), m = chars[i] || mq, p0 = m.getPose();
    m.setPose(clipPose(m, sampleClip(c, Math.min(AG.t, c.len)), new V3().fromArray(p0.pos), facingOf(p0.q), true, m.rootY / clipRig().rootY, p0.q)); m.group.updateMatrixWorld(true);
    closeAnimGallery(); pushHistory(); toast(tr('Postura de «{x}» aplicada a {w}.', {x: c.name, w: speaker(i)}));
  };
  // files dropped on the gallery window
  const sheet = $('#animGallery'); sheet.addEventListener('dragover', e => e.preventDefault());
  sheet.addEventListener('drop', e => { const f = [...e.dataTransfer.files].find(f => /\.(bvh|glb|gltf|fbx)$/i.test(f.name)); if (f) { e.preventDefault(); e.stopPropagation(); importAnimFile(f); } });
  $('#agImport').onclick = () => $('#agFile').click();
  $('#agFile').onchange = e => { importAnimFile(e.target.files[0]); e.target.value = ''; };
  $('#agSaveTrack').onclick = async () => {
    if (!ANIM.open || !shot()) return toast(tr('Abre «Animar» y crea claves para un personaje.'));
    const ci = chars.indexOf(mq), name = prompt(tr('Nombre de la animación'), `${speaker(ci)} · ${shot().name}`); if (!name) return;
    const c = clipFromTrack(ci, name); if (!c) return toast(tr('Ese personaje necesita al menos dos claves en este plano.'));
    await saveMyClip(c); AG.cat = 'mias'; AG.sel = CLIPS.mine[0]; renderAnimGallery(); $('#agMsg').textContent = tr('Guardada en «Mis animaciones».');
  };
  $('#agDel').onclick = async () => { const c = AG.sel; if (!c || c.src !== 'user') return; await clipDB.del(c.id); CLIPS.mine = CLIPS.mine.filter(x => x !== c); CLIPS.thumbs.delete(c.id); AG.sel = allClips()[0]; renderAnimGallery(); };
  slider($('#agLoopsBox'), {id: 'agLoops', label: 'Repeticiones', min: 1, max: 10, step: 1, value: 1, fmt: v => '× ' + v, input: v => AG.opts.loops = v});
  slider($('#agSpeedBox'), {id: 'agSpeed', label: 'Velocidad', min: .25, max: 2, step: .05, value: 1, fmt: v => Math.round(v * 100) + ' %', input: v => AG.opts.speed = v});
  $('#agInPlace').onchange = e => AG.opts.inPlace = e.target.checked;
  vp.addEventListener('drop', e => { const f = [...e.dataTransfer.files].find(f => /\.bvh$/i.test(f.name)); if (f) { e.preventDefault(); openAnimGallery().then(() => importAnimFile(f)); } });
}
