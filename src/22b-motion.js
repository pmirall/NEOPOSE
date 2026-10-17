/* ======================= the principles of animation, as sliders =======================
   The in-betweens between key poses (and the gallery's clips) are not just a blend: each character in each shot
   has a way of moving, made of the classic principles (Thomas & Johnston, The Illusion of Life; Williams, The
   Animator's Survival Kit), worked out when a frame is drawn, so the keys stay as they are:
   - slow in and slow out: how much a move eases out of one pose and into the next
   - anticipation: a small move the other way before setting off
   - overshoot: going past the pose and settling back (springy, bouncy)
   - follow-through and overlapping action: drag down the chains, so the hips lead, the chest, the head and the
     hands arrive later (successive breaking of joints)
   - arcs: the body travels on curves through its keys, not in straight lines
   - squash and stretch: the figure stretches with speed and squashes on impact, keeping its volume
   - exaggeration: every bend of the pose pushed further
   - timing: on ones, twos or threes, and blocking (pose to pose, no in-betweens). */
const MOTION_DEF = {ease: .6, antic: 0, bounce: 0, drag: 0, arcs: .6, squash: 0, exag: 0, step: 1, block: false};
const MOTION_PRESETS = {
  natural: {label: 'Natural', set: {ease: .6, antic: .15, bounce: 0, drag: .3, arcs: .6, squash: 0, exag: 0}},
  cartoon: {label: 'Cartoon', set: {ease: .7, antic: .6, bounce: .55, drag: .55, arcs: .9, squash: .6, exag: .35}},
  pesado: {label: 'Pesado', set: {ease: .9, antic: .35, bounce: 0, drag: .7, arcs: .5, squash: .15, exag: .1}},
  agil: {label: 'Ágil', set: {ease: .35, antic: .2, bounce: .25, drag: .2, arcs: .8, squash: .2, exag: .15}},
  robot: {label: 'Mecánico', set: {ease: 0, antic: 0, bounce: 0, drag: 0, arcs: 0, squash: 0, exag: 0}},
  bloqueo: {label: 'Bloqueo', set: {block: true}}
};
tLabels(MOTION_PRESETS);
// how many frames (at 12 fps, drag 1) each joint lags behind the pelvis
const DRAG_DEPTH = {hips: 0, waist: .6, chest: 1.2, neck: 1.9, head: 2.6, jaw: 3, earL: 3.2, earR: 3.2, shoulderL: 1.6, elbowL: 2.4, wristL: 3.2, shoulderR: 1.6, elbowR: 2.4, wristR: 3.2,
  hipL: .3, kneeL: .7, ankleL: 1.1, hipR: .3, kneeR: .7, ankleR: 1.1, tail1: 2, tail2: 3, tail3: 4};
const motionOf = (s, ci) => ({...MOTION_DEF, ease: ANIM.ease ? MOTION_DEF.ease : 0, ...((s && s.motion && s.motion[ci]) || {})});
const isNeutral = st => !st.antic && !st.bounce && !st.drag && !st.squash && !st.exag && st.step <= 1 && !st.block && Math.abs(st.arcs - MOTION_DEF.arcs) < 1e-6;

// a turn scaled: the same axis, s times the angle (s may be below 0 or above 1)
const _qa = new Q(), _qb = new Q();
function qScale(q, s) {
  const w = clamp(q.w, -1, 1), sgn = w < 0 ? -1 : 1, ang = 2 * Math.acos(Math.abs(w)), sn = Math.sqrt(Math.max(0, 1 - w * w));
  if (sn < 1e-6) return new Q();
  const a = ang * s / 2, k = Math.sin(a) / sn * sgn;
  return new Q(q.x * k, q.y * k, q.z * k, Math.cos(a));
}
// the shape of a move from 0 to 1: anticipation dip, eased, overshoot near the end (a damped swing past the pose)
function motionCurve(t, st) {
  if (st.block) return t < 1 ? 0 : 1;
  let x = t;
  if (st.antic > 0) { const ta = .25; if (t < ta) return -st.antic * .25 * Math.sin(Math.PI * t / ta); x = (t - ta) / (1 - ta); }
  const sm = x * x * x * (x * (x * 6 - 15) + 10), e = clamp(st.ease, 0, 1);
  let u = x + (sm - x) * e;
  if (st.bounce > 0) {
    const y = clamp((x - .5) / .5, 0, 1);
    u += st.bounce * .28 * Math.sin(Math.PI * y) * (1 - y * .35);  // past the pose…
    if (st.bounce > .45) u -= (st.bounce - .45) * .16 * Math.sin(2 * Math.PI * y) * y;  // …and a smaller swing back before it settles
  }
  return u;
}
// a track at time f (fractional), with the curve of its style: runs of gallery keys are one move, eased as a whole
function trackAt(K, f, st) {
  if (!K.length) return null;
  if (f <= K[0].f) return K[0].pose; if (f >= K[K.length - 1].f) return K[K.length - 1].pose;
  let i = 0; while (K[i + 1].f < f) i++;
  if (K[i].lin) {  // inside a clip: remap time over the whole run, then read its own frames
    let a = i; while (a > 0 && K[a - 1].lin) a--; let b = i; while (b < K.length - 1 && K[b].lin) b++;
    // (a clip keeps its own timing unless the style asks for more easing than the default)
    const f0 = K[a].f, f1 = K[b].f, runSt = {...st, antic: 0, bounce: 0, ease: clamp((st.ease - MOTION_DEF.ease) * 2.5, 0, 1)}, u = f1 > f0 ? clamp(motionCurve((f - f0) / (f1 - f0), runSt), 0, 1) : 0, g = f0 + u * (f1 - f0);
    let j = a; while (j < b && K[j + 1].f < g) j++;
    const k2 = K[Math.min(j + 1, K.length - 1)], tt = k2.f > K[j].f ? (g - K[j].f) / (k2.f - K[j].f) : 0;
    return tt > 0 ? mixPose(K[j].pose, k2.pose, clamp(tt, 0, 1)) : K[j].pose;
  }
  const A = K[i], B = K[i + 1], t = (f - A.f) / (B.f - A.f);
  if (A.ip === 'hold') return A.pose; if (A.ip === 'lin') return mixPose(A.pose, B.pose, t);  // held or straight to the next key: no curve, no arc
  const u = motionCurve(t, st);
  const p = mixPoseX(A.pose, B.pose, u);
  // arcs: the pelvis travels on a curve through the keys around (Catmull-Rom), not straight from key to key
  if (st.arcs > 0 && !st.block) {
    const P0 = (K[i - 1] || A).pose.pos, P3 = (K[i + 2] || B).pose.pos, a = A.pose.pos, b = B.pose.pos, w = clamp(u, 0, 1), w2 = w * w, w3 = w2 * w;
    p.pos = p.pos.map((lin, n) => { const cr = .5 * ((2 * a[n]) + (-P0[n] + b[n]) * w + (2 * P0[n] - 5 * a[n] + 4 * b[n] - P3[n]) * w2 + (-P0[n] + 3 * a[n] - 3 * b[n] + P3[n]) * w3); return lin + (cr - lin) * st.arcs; });
  }
  return p;
}
// a blend that may go past both ends (anticipation, overshoot): turns scaled, positions extrapolated
function mixPoseX(a, b, u) {
  if (u >= 0 && u <= 1) return mixPose(a, b, u);
  const q = {};
  for (const n of JOINTS) { _qa.fromArray(a.q[n] || [0, 0, 0, 1]); _qb.fromArray(b.q[n] || [0, 0, 0, 1]); const d = _qa.clone().invert().multiply(_qb); q[n] = _qa.clone().multiply(qScale(d, u)).toArray(); }
  const lerp = (x, y) => x + (y - x) * u, hand = (x, y) => ({c: x.c.map((v, i) => clamp(lerp(v, y.c[i]), 0, 1)), s: lerp(x.s, y.s), t: lerp(x.t || 0, y.t || 0)});
  return {q, pos: a.pos.map((v, i) => lerp(v, b.pos[i])), hands: {L: hand(a.hands.L, b.hands.L), R: hand(a.hands.R, b.hands.R)}, stool: u < .5 ? a.stool : b.stool};
}
// every bend pushed further (the hinges stay within what a knee or an elbow can do)
function exaggerate(p, k) {
  if (!k) return p;
  const q = {...p.q};
  for (const n of JOINTS) { if (n === 'hips' || !q[n]) continue; q[n] = qScale(_qa.fromArray(q[n]), 1 + k).toArray(); }
  for (const n of ['elbowL', 'elbowR', 'kneeL', 'kneeR']) if (q[n]) { const e = new THREE.Euler().setFromQuaternion(_qa.fromArray(q[n]), 'XYZ'), H = HINGE[n]; q[n] = new Q().setFromEuler(new THREE.Euler(clamp(e.x, H[0] * DEG, H[1] * DEG), 0, 0)).toArray(); }
  return {...p, q};
}
// the pose of character ci at frame f, with its way of moving
function motionPoseAt(ci, f) {
  const s = shot(), K = s && s.keys[ci]; if (!K || !K.length) return null;
  const st = motionOf(s, ci);
  if (st.step > 1) f = Math.floor(f / st.step) * st.step;
  const drag = st.drag * ANIM.fps / 12;
  let p;
  if (drag > 0) {  // each joint read a little earlier the further it is down its chain
    const cache = new Map(), at = t => { const k = Math.round(t * 4) / 4; if (!cache.has(k)) cache.set(k, trackAt(K, k, st)); return cache.get(k); };
    const base = at(f); p = {...base, q: {...base.q}};
    for (const n of JOINTS) { const lag = (DRAG_DEPTH[n] || 0) * drag; if (lag > 0) { const o = at(f - lag); if (o && o.q[n]) p.q[n] = o.q[n]; } }
    const hl = 3 * drag, ho = at(f - hl); if (ho && ho.hands) p.hands = ho.hands;
  } else p = trackAt(K, f, st);
  return tailLife(chars[ci], exaggerate(p, st.exag), t => trackAt(K, t, st), f);
}
/* a living tail: the keys say where the tail is; on top of them it lags behind the pelvis when the body turns, rises
   and falls against a bounce (inertia, down the chain: the tip later and further), and can wag. Worked out from the
   frame number alone, so scrubbing, playing and exporting give the same tail. body.tailMove: quieta, viva, meneo, rapido */
const TAIL_WAG = {meneo: [2.2, 16], rapido: [4.2, 12]};  // wags a second, degrees at the base
function tailLife(m, p, at, f) {
  const mode = m && m.hasTail ? (m.body.tailMove || 'viva') : 'quieta'; if (mode === 'quieta' || !p || !p.q) return p;
  const fps = ANIM.fps || 24, yawOf = q => { const v = new V3(0, 0, 1).applyQuaternion(_qa.fromArray(q)); return Math.atan2(v.x, v.z); };
  const hips = t => { const o = at(t); return o && o.q && o.q.hips ? o : null; }, h0 = hips(f); if (!h0) return p;
  const q = {...p.q}, E = new THREE.Euler(), off = [0, 0, 0].map(() => new V3());
  [1, 2, 3].forEach((k, i) => {
    const lag = k * 2 * fps / 24, a = hips(f - lag); if (!a) return;
    let dy = yawOf(h0.q.hips) - yawOf(a.q.hips); dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const dv = (h0.pos[1] - a.pos[1]) / (m.size || 1);
    off[i].y = clamp(-dy * 1.4, -.8, .8); off[i].x = clamp(dv * 2.2, -.5, .5);
  });
  const wg = TAIL_WAG[mode];
  if (wg) { const w = 2 * Math.PI * wg[0] * f / fps; [0, 1, 2].forEach(i => { off[i].y += wg[1] * DEG * (1 + i * .35) * Math.sin(w - i * .9); }); }
  ['tail1', 'tail2', 'tail3'].forEach((n, i) => {
    const base = q[n] ? new Q().fromArray(q[n]) : new Q(), o = off[i];
    if (Math.abs(o.x) + Math.abs(o.y) < 1e-5) return;
    q[n] = base.multiply(new Q().setFromEuler(E.set(o.x, o.y, 0))).toArray();
  });
  return {...p, q};
}
// squash and stretch: from how fast the pelvis goes up or down, and how hard it stops; the whole figure, its volume kept
function applySquash(m, ci, f) {
  const s = shot(), st = s ? motionOf(s, ci) : null, g = m.group;
  const base = m.body.stretch ?? 1;
  if (!st || !st.squash || !ANIM.open) { setFigureStretch(m, base); return; }
  const y = t => { const p = motionPoseAt(ci, t); return p ? p.pos[1] : 0; };
  const v = (y(f + 1) - y(f - 1)) / 2, acc = y(f + 1) - 2 * y(f) + y(f - 1), size = m.size || 1;
  const k = clamp(1 + st.squash * (Math.abs(v) / size * 9 - Math.max(0, acc) / size * 45), .65, 1.35);
  setFigureStretch(m, base * k); void g;
}

/* ---------- the panel ---------- */
const MOTION_SLIDERS = [['ease', 'Suavidad (entra y sale despacio)', 0, 1], ['antic', 'Anticipación', 0, 1], ['bounce', 'Rebote', 0, 1], ['drag', 'Arrastre y solapamiento', 0, 1],
  ['arcs', 'Arcos', 0, 1], ['squash', 'Estirar y encoger', 0, 1], ['exag', 'Exageración', 0, 1]];
const motionEls = {};
function motionTrack() { return typeof ANIM.track === 'number' ? ANIM.track : Math.max(0, chars.indexOf(mq)); }
function setMotion(patch, all) {
  const s = shot(); if (!s) return; s.motion = s.motion || {};
  for (const ci of all ? chars.map((_, i) => i) : [motionTrack()]) s.motion[ci] = {...motionOf(s, ci), ...patch};
  setFrame(ANIM.f); syncMotionUI(); if (typeof motionTrailsDirty === 'function') motionTrailsDirty(); tourEvent('motion');
}
function buildMotionUI() {
  const box = $('#mvMotion'); if (!box) return; box.innerHTML = '';
  const head = document.createElement('div'); head.className = 'mvmhead'; head.innerHTML = `<p class="advh">${tr('Interpretación')} <span id="mvmWho"></span></p>`; box.appendChild(head);
  const pre = document.createElement('div'); pre.className = 'chips'; pre.id = 'mvmPresets'; box.appendChild(pre);
  chips(pre, Object.entries(MOTION_PRESETS).map(([k, v]) => [k, v.label]), null, k => { setMotion({...MOTION_DEF, ...MOTION_PRESETS[k].set}); setPressed(pre, k); });
  for (const [k, label, mn, mx] of MOTION_SLIDERS)
    motionEls[k] = slider(box, {id: 'mvm_' + k, label, min: mn, max: mx, step: .05, value: MOTION_DEF[k], fmt: pctFmt, input: v => { setMotion({[k]: v, block: false}); setPressed(pre, ''); }, change: pushHistory});
  const row = document.createElement('div'); row.className = 'filter'; row.innerHTML = `<span>${tr('Ritmo')}</span><div class="chips seg" id="mvmStep"></div>`; box.appendChild(row);
  chips($('#mvmStep'), [['1', tr('A unos')], ['2', tr('A doses')], ['3', tr('A treses')]], '1', v => { setMotion({step: +v}); pushHistory(); });
  const tl = document.createElement('label'); tl.className = 'check'; tl.innerHTML = `<input type="checkbox" id="mvmTrails"> ${tr('Ver trayectorias y espaciado')}`; box.appendChild(tl);
  tl.querySelector('input').onchange = e => { TRAIL.on = e.target.checked; motionTrailsDirty(); updateTrails(); };
  const all = document.createElement('button'); all.className = 'btn small'; all.textContent = tr('Aplicar a todo el reparto');
  all.onclick = () => { setMotion(motionOf(shot(), motionTrack()), true); pushHistory(); toast(tr('Misma interpretación para todo el reparto de este plano.')); }; box.appendChild(all);
  syncMotionUI();
}
function syncMotionUI() {
  if (!$('#mvMotion') || !shot()) return;
  const st = motionOf(shot(), motionTrack());
  for (const [k, el] of Object.entries(motionEls)) el.set(st[k]);
  setPressed($('#mvmStep'), String(st.step || 1)); const who = $('#mvmWho'); if (who) who.textContent = speaker(motionTrack());
}

/* ---------- motion trails: the arcs of the head, hands and feet, a dot per frame (spacing), a bigger one per key ---------- */
const TRAIL = {on: false, group: null, sig: ''};
const TRAIL_JOINTS = [['head', 0xb0432c], ['wristL', 0x2b5a9e], ['wristR', 0x2b5a9e], ['ankleL', 0x4f7a3a], ['ankleR', 0x4f7a3a]];
const TRAIL_MAT = {};
function motionTrailsDirty() { TRAIL.sig = ''; }
function updateTrails() {
  const s = shot(), ci = motionTrack(), m = chars[ci];
  const show = TRAIL.on && ANIM.open && !ANIM.playing && s && m && s.keys[ci] && s.keys[ci].length > 1;
  if (!show) { if (TRAIL.group) TRAIL.group.visible = false; return; }
  const K = s.keys[ci], sig = [ci, ANIM.cur, s.len, ANIM.fps, K.length, K[0].f, K[K.length - 1].f, K.reduce((a, k) => a + k.f * 7 + k.pose.q.hips[0] + k.pose.pos[0] + k.pose.pos[1], 0).toFixed(5), JSON.stringify(s.motion && s.motion[ci] || {})].join('|');
  if (TRAIL.group) TRAIL.group.visible = true;
  if (sig === TRAIL.sig) return;
  TRAIL.sig = sig;
  if (!TRAIL.group) { TRAIL.group = new THREE.Group(); TRAIL.group.renderOrder = 20; scene.add(TRAIL.group); }
  TRAIL.group.clear();
  const saved = m.getPose(), pts = TRAIL_JOINTS.map(() => []), keys = new Set(K.filter(k => !k.lin || !K[K.indexOf(k) - 1] || !K[K.indexOf(k) - 1].lin).map(k => k.f));
  for (let f = 0; f < s.len; f++) { const p = poseAt(ci, f); if (!p) continue; m.setPose(p); m.group.updateMatrixWorld(true); TRAIL_JOINTS.forEach(([n], j) => pts[j].push(m.joints[n].getWorldPosition(new V3()))); }
  m.setPose(saved); m.group.updateMatrixWorld(true);
  TRAIL_JOINTS.forEach(([, col], j) => {
    const P = pts[j]; if (P.length < 2) return;
    const lm = TRAIL_MAT['l' + col] || (TRAIL_MAT['l' + col] = new THREE.LineBasicMaterial({color: col, transparent: true, opacity: .75, depthTest: false}));
    const dm = TRAIL_MAT['d' + col] || (TRAIL_MAT['d' + col] = new THREE.PointsMaterial({color: col, size: 5, sizeAttenuation: false, depthTest: false}));
    const km = TRAIL_MAT['k' + col] || (TRAIL_MAT['k' + col] = new THREE.PointsMaterial({color: col, size: 10, sizeAttenuation: false, depthTest: false}));
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(P), lm), dots = new THREE.Points(new THREE.BufferGeometry().setFromPoints(P), dm), kp = new THREE.Points(new THREE.BufferGeometry().setFromPoints(P.filter((_, f) => keys.has(f))), km);
    for (const o of [line, dots, kp]) { o.renderOrder = 20; o.frustumCulled = false; TRAIL.group.add(o); }
  });
}
