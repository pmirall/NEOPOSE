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
const CLIP_CATS = {todas: 'Todas', mov: 'Andar y correr', salto: 'Saltos y acrobacias', combate: 'Combate', gestos: 'Gestos y charla', reposo: 'Reposo y sentado', trabajo: 'Tareas', baile: 'Baile', mias: 'Mis animaciones'};

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
  return {q, p: a.p.map((v, n) => v + (b.p[n] - v) * k), h: a.h.map((v, n) => v + (b.h[n] - v) * k)};
}
const REST_CURLS = [.25, .18, .26, .32, .4, .25, .18, .26, .32, .4];
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
  const limb = (a, b, c, ja, jb, jc, sign) => {
    if (!has(a, b, c)) return;
    const d1 = K[b].clone().sub(K[a]), d2 = K[c].clone().sub(K[b]);
    turnBone(m, J[ja], wposOf(J[jb]).sub(wposOf(J[ja])), d1);
    const H = HINGE[jb]; J[jb].rotation.set(clamp(sign * d1.angleTo(d2), H[0] * DEG, H[1] * DEG), 0, 0, 'XYZ'); m.group.updateMatrixWorld(true);
    const ax = d1.clone().normalize(), cur = wposOf(J[jc]).sub(wposOf(J[jb])), pc = cur.addScaledVector(ax, -cur.dot(ax)), pw = d2.clone().addScaledVector(ax, -d2.dot(ax));
    if (pc.lengthSq() > 1e-8 && pw.lengthSq() > 1e-8) { let t = pc.angleTo(pw); if (new V3().crossVectors(pc, pw).dot(ax) < 0) t = -t; setWorldQ(m, J[ja], new Q().setFromAxisAngle(ax, t).multiply(J[ja].getWorldQuaternion(new Q()))); }
  };
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

/* ---------- NEOPOSE's own clips: key poses, eased ---------- */
const OWN_CLIPS = [
  {id: 'np-andar', name: 'Andar (ciclo)', cat: 'mov', loop: true, dur: 1, step: .5, keys: [[0, 'caminar'], [.5, 'caminar', true], [1, 'caminar']]},
  {id: 'np-correr', name: 'Correr (ciclo)', cat: 'mov', loop: true, dur: .7, step: .35, keys: [[0, 'correr'], [.35, 'correr', true], [.7, 'correr']]},
  {id: 'np-respirar', name: 'Respirar', cat: 'reposo', loop: true, dur: 3, keys: [[0, {chest: [-2, 0, 0], ...ARMS_DOWN, ...LEGS_STAND}], [1.5, {chest: [-6, 0, 0], neck: [2, 0, 0], ...ARMS_DOWN, ...LEGS_STAND}], [3, {chest: [-2, 0, 0], ...ARMS_DOWN, ...LEGS_STAND}]]},
  {id: 'np-saludar', name: 'Saludar con la mano', cat: 'gestos', loop: true, dur: 1.2, keys: [[0, {shoulderR: [0, -90, -100, 'ZXY'], elbowR: [-60], ...LEGS_STAND, shoulderL: [0, 0, 8], elbowL: [-15]}, 'abierta'], [.6, {shoulderR: [0, -90, -100, 'ZXY'], elbowR: [-100], ...LEGS_STAND, shoulderL: [0, 0, 8], elbowL: [-15]}, 'abierta'], [1.2, {shoulderR: [0, -90, -100, 'ZXY'], elbowR: [-60], ...LEGS_STAND, shoulderL: [0, 0, 8], elbowL: [-15]}, 'abierta']]},
  {id: 'np-si', name: 'Asentir', cat: 'gestos', dur: 1.2, keys: [[0, {head: [0, 0, 0], ...ARMS_DOWN, ...LEGS_STAND}], [.3, {head: [18, 0, 0], neck: [6, 0, 0], ...ARMS_DOWN, ...LEGS_STAND}], [.6, {head: [-4, 0, 0], ...ARMS_DOWN, ...LEGS_STAND}], [.9, {head: [15, 0, 0], neck: [5, 0, 0], ...ARMS_DOWN, ...LEGS_STAND}], [1.2, {...ARMS_DOWN, ...LEGS_STAND}]]},
  {id: 'np-no', name: 'Negar con la cabeza', cat: 'gestos', dur: 1.2, keys: [[0, {...ARMS_DOWN, ...LEGS_STAND}], [.25, {head: [0, 28, 0], neck: [0, 8, 0], ...ARMS_DOWN, ...LEGS_STAND}], [.55, {head: [0, -28, 0], neck: [0, -8, 0], ...ARMS_DOWN, ...LEGS_STAND}], [.85, {head: [0, 22, 0], ...ARMS_DOWN, ...LEGS_STAND}], [1.2, {...ARMS_DOWN, ...LEGS_STAND}]]},
  {id: 'np-aplaudir', name: 'Aplaudir', cat: 'gestos', loop: true, dur: .5, keys: [[0, {...sym({shoulderL: [-45, -30, 18, 'ZXY'], elbowL: [-100]}), ...LEGS_STAND}, 'plana'], [.25, {...sym({shoulderL: [-45, -50, 8, 'ZXY'], elbowL: [-90]}), ...LEGS_STAND}, 'plana'], [.5, {...sym({shoulderL: [-45, -30, 18, 'ZXY'], elbowL: [-100]}), ...LEGS_STAND}, 'plana']]},
  {id: 'np-mirar', name: 'Mirar alrededor', cat: 'reposo', dur: 3, keys: [[0, {...ARMS_DOWN, ...LEGS_STAND}], [.8, {head: [0, 55, 0], neck: [0, 15, 0], chest: [0, 10, 0], ...ARMS_DOWN, ...LEGS_STAND}], [1.6, {head: [0, 0, 0], ...ARMS_DOWN, ...LEGS_STAND}], [2.4, {head: [0, -55, 0], neck: [0, -15, 0], chest: [0, -10, 0], ...ARMS_DOWN, ...LEGS_STAND}], [3, {...ARMS_DOWN, ...LEGS_STAND}]]},
  {id: 'np-reverencia', name: 'Reverencia', cat: 'gestos', dur: 2, keys: [[0, 'pie'], [.8, 'reverencia'], [1.3, 'reverencia'], [2, 'pie']]},
  {id: 'np-saltar', name: 'Salto en el sitio', cat: 'salto', dur: 1.2, keys: [[0, 'pie'], [.3, {hips: [20, 0, 0], ...sym({hipL: [-60, 0, 6], kneeL: [90], ankleL: [-25], shoulderL: [30, 0, 15], elbowL: [-20]})}, null, -.2], [.6, 'salto', null, .28], [.9, {hips: [15, 0, 0], ...sym({hipL: [-45, 0, 6], kneeL: [70], ankleL: [-20], shoulderL: [-20, 0, 25], elbowL: [-20]})}, null, -.14], [1.2, 'pie']]},
  {id: 'np-sentarse', name: 'Sentarse', cat: 'reposo', dur: 1.6, keys: [[0, 'pie'], [.8, {hips: [30, 0, 0], waist: [10, 0, 0], ...sym({hipL: [-60, 0, 6], kneeL: [70], ankleL: [-15], shoulderL: [-30, 0, 10], elbowL: [-30]})}, null, -.18], [1.6, 'sentado', null, -.43]]},
  {id: 'np-boxeo', name: 'Combinación de puñetazos', cat: 'combate', dur: 1.4, keys: [[0, 'guardia'], [.25, 'jab'], [.5, 'guardia'], [.8, 'cross'], [1.1, 'guardia'], [1.4, 'guardia']]}
];
function buildOwnClip(def) {
  const m = clipRig(), fps = 24, n = Math.round(def.dur * fps) + 1, Ks = [];
  for (const [t, p, hands, dy] of def.keys) {
    const pose = typeof p === 'string' ? POSE[p] : {j: p, hands: hands ? {L: hands, R: hands} : undefined};
    m.joints.hips.position.set(0, m.rootY, 0); applyPreset(m, hands === true ? {j: Object.fromEntries(Object.entries(pose.j).map(([k, e]) => [swapSide(k), mirrorRot(e)])), hands: pose.hands} : pose, {ground: false});
    const g = m.getPose(), q = {}; for (const j of CLIP_J) q[j] = g.q[j];
    Ks.push({t, q, dy: dy || 0, h: [...m.hands.L.c, ...m.hands.R.c]});
  }
  const frames = [];
  for (let i = 0; i < n; i++) {
    const t = i / fps; let a = 0; while (a < Ks.length - 2 && Ks[a + 1].t <= t) a++;
    const A = Ks[a], B = Ks[Math.min(a + 1, Ks.length - 1)], u0 = B.t > A.t ? clamp((t - A.t) / (B.t - A.t), 0, 1) : 0, u = u0 * u0 * (3 - 2 * u0), q = {}, qa = new Q(), qb = new Q();
    for (const j of CLIP_J) { qa.fromArray(A.q[j]); qb.fromArray(B.q[j]); q[j] = qa.slerp(qb, u).toArray(); }
    frames.push({q, p: [0, A.dy + (B.dy - A.dy) * u, 0], h: A.h.map((v, k) => v + (B.h[k] - v) * u)});
  }
  if (def.loop) frames.pop();  // the last key repeats the first
  return {id: def.id, name: tr(def.name), cat: def.cat, src: 'neopose', fps, loop: !!def.loop, frames, len: (def.loop ? frames.length : n - 1) / fps};
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
  const own = OWN_CLIPS.map(buildOwnClip);
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
  const p0 = m.getPose(), at = new V3().fromArray(p0.pos), yaw = facingOf(p0.q), k = m.rootY / clipRig().rootY;
  const last = c.frames[c.frames.length - 1].p, first = c.frames[0].p, span = c.len / Math.max(1e-6, (c.frames.length - 1) / c.fps), stride = new V3(last[0] - first[0], 0, last[2] - first[2]).multiplyScalar(span);
  const K = s.keys[ci].filter(x => x.f < f0 || x.f > f0 + n - 1);
  for (let i = 0; i < n; i++) {
    const tt = i / ANIM.fps * speed, loop = Math.min(loops - 1, Math.floor(tt / c.len + 1e-6)), t = tt - loop * c.len;
    const smp = sampleClip(c, Math.min(t, c.len)), base = at.clone();
    if (!o.inPlace && loop) base.add(stride.clone().multiplyScalar(loop * k).applyQuaternion(new Q().setFromAxisAngle(new V3(0, 1, 0), yaw)));
    const pose = clipPose(m, smp, base, yaw, o.inPlace, k, p0.q);
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
