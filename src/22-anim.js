/* ======================= animation: a movie made of shots =======================
   Learned from storyboard and previs tools (Storyboarder, Toon Boom Storyboard Pro, Plotagon, Blender's dope sheet):
   - the film is a strip of SHOTS; each shot keeps its own cast (bodies, clothes), set, objects, lights and length;
   - inside a shot every character has its own track of pose keys, the camera has a track of its own (position, aim,
     lens, roll) and the DIALOGUE track holds the script: lines of text said by a character;
   - the lines move the mouths: the text becomes the classic animation mouth shapes (Preston Blair / Rhubarb: A closed
     M-B-P, B teeth, C open, D wide, E round O, F puckered OO-W, G F-V, H L, X rest) mixed from MakeHuman's mouth units
     and the jaw, and they show as subtitles;
   - between keys poses and camera are blended (eased); auto-key stores whatever is posed at the current frame;
   - the film plays shot after shot and exports frame by frame (PNG in a ZIP), as a WebM, as a storyboard sheet or BVH. */
const ANIM = {open: false, fps: 12, shots: [], cur: 0, f: 0, t: 0, playing: false, auto: true, onion: true, ease: true, loop: true, all: true, subs: true,
  camRec: false, track: 0, sel: null, ghosts: [], busy: false, min: false};
const MV_COLS = ['#b0432c', '#2b5a9e', '#4b8a5c', '#8a5aa8'];
const JAW_AXIS = new V3(1, 0, 0);
const shot = () => ANIM.shots[ANIM.cur];
const sec = f => f / ANIM.fps;
let shotSeq = 0;
function captureScene() {
  return {chars: chars.map(m => ({body: {...m.body}, preset: m.bodyPreset, outfit: (m.outfit || []).map(s => ({...s})), pose: basePose(m)})),
    extras: sceneExtras(false), cam: camState()};
}
function newShot(name) {
  return {id: ++shotSeq, name: name || tr('Plano {n}', {n: ANIM.shots.length + 1}), len: 4 * ANIM.fps, scene: captureScene(), keys: chars.map(() => []), cam: [], lines: [], thumb: ''};
}
const camState = () => ({p: camera.position.toArray(), t: controls.target.toArray(), f: state.focal, r: state.roll || 0});
function applyCam(c) { camera.position.fromArray(c.p); controls.target.fromArray(c.t); if (Math.abs(c.f - state.focal) > .01) { setFocal(c.f, false); $('#focal').value = c.f; } setRoll(c.r); controls.update(); }
// the pose without the speaking mouth (lip sync turns the jaw on top of the keyed pose)
function basePose(m) { const p = m.getPose(); if (m._visJaw) p.q.jaw = m.joints.jaw.quaternion.clone().multiply(new Q().setFromAxisAngle(JAW_AXIS, -m._visJaw)).toArray().map(v => +v.toFixed(5)); return p; }
function padKeys(s) { while (s.keys.length < chars.length) s.keys.push([]); }

/* ---------- interpolation ---------- */
const ease = t => ANIM.ease ? t * t * (3 - 2 * t) : t;
function around(K, f) {
  if (!K.length) return null;
  if (f <= K[0].f) return [K[0], K[0], 0]; if (f >= K[K.length - 1].f) return [K[K.length - 1], K[K.length - 1], 0];
  let i = 0; while (K[i + 1].f < f) i++;
  const t = (f - K[i].f) / (K[i + 1].f - K[i].f); return [K[i], K[i + 1], K[i].ip === 'hold' ? 0 : K[i].lin || K[i].ip === 'lin' ? t : ease(t)];  // held, straight or eased to the next key  // keys from a gallery clip: straight on, frame to frame
}
function poseAt(ci, f) { return motionPoseAt(ci, f); }  // in-betweens with the character's way of moving (22b-motion)
function camAt(f) {
  const r = around(shot().cam, f); if (!r) return null; const [a, b, t] = r, L = (x, y) => x.map((v, i) => v + (y[i] - v) * t);
  return {p: L(a.c.p, b.c.p), t: L(a.c.t, b.c.t), f: a.c.f + (b.c.f - a.c.f) * t, r: a.c.r + (b.c.r - a.c.r) * t};
}
// a film's key light: what a crew puts on every shot, a soft light from beside and above the camera on whoever is in
// it, so faces read even in a set lit from behind (films made from a script turn it on: s.key)
const filmKey = new THREE.SpotLight(0xfff1e0, 0, 14, 32 * DEG, .75, 1.1); filmKey.castShadow = false; scene.add(filmKey, filmKey.target);
function placeFilmKey(s) {
  if (!s || !s.key || !ANIM.open) { filmKey.intensity = 0; return; }
  const P = camera.position, T = controls.target, d = P.clone().sub(T), r = d.length(), right = new V3(0, 1, 0).cross(d).normalize();
  filmKey.position.copy(P).addScaledVector(right, -r * .45).add(new V3(0, r * .35 + .3, 0)).addScaledVector(d, -.15);
  filmKey.target.position.copy(T); filmKey.target.updateMatrixWorld(); filmKey.distance = r * 3 + 4; filmKey.intensity = s.key * (state.amb === 'noche' ? .8 : 1.1);
}
// everything at frame f: poses, camera, mouths, subtitles
function applyFrame(f) {
  const s = shot(); if (!s) return; padKeys(s);
  chars.forEach((m, i) => { const p = poseAt(i, f); if (p) m.setPose(p); applySquash(m, i, f); });
  const c = camAt(f); if (c) applyCam(c);
  placeFilmKey(s); applyMouths(f); showSubs(f);
}
function setFrame(f, apply = true) {
  const s = shot(); if (!s) return;
  ANIM.f = clamp(Math.round(f), 0, s.len - 1); ANIM.t = ANIM.f; if (typeof wake === 'function') wake(); if (ANIM.f >= 6) tourEvent('frame');
  if (apply) { applyFrame(ANIM.f); syncJointSliders(); syncHandUI(); refreshPins(mq); }
  drawTimeline(); updateOnion();
}

/* ---------- keys ---------- */
const keyOf = (K, f) => K.find(k => k.f === f);
function setKey(track = ANIM.track, f = ANIM.f) {
  const s = shot(); padKeys(s);
  if (track === 'cam') { const k = keyOf(s.cam, f), c = camState(); if (k) k.c = c; else { if (!s.cam.length && f > 0) s.cam.push({f: 0, c: ANIM.camBase || c}); s.cam.push({f, c}); s.cam.sort((a, b) => a.f - b.f); } }
  else { const K = s.keys[track], m = chars[track]; if (!m) return; const p = basePose(m), k = keyOf(K, f);
    if (k) k.pose = p; else { if (!K.length && f > 0 && m._prevPose) K.push({f: 0, pose: m._prevPose}); K.push({f, pose: p}); K.sort((a, b) => a.f - b.f); } }
  drawTimeline(); updateOnion(); thumbLater();
  tourEvent('key');
}
function deleteKey(track = ANIM.track, f = ANIM.f) {
  const s = shot(); if (track === 'cam') s.cam = s.cam.filter(k => k.f !== f); else if (s.keys[track]) s.keys[track] = s.keys[track].filter(k => k.f !== f);
  ANIM.sel = null; setFrame(ANIM.f);
}
const hasKey = (track, f) => { const s = shot(); return !!(s && (track === 'cam' ? keyOf(s.cam, f) : s.keys[track] && keyOf(s.keys[track], f))); };
// two poses that look the same (rotations within a few hundredths of a degree, the pelvis within a tenth of a millimetre)
function samePose(a, b) {
  for (const n of JOINTS) { const p = a.q[n], q = b.q[n]; if (!p || !q) { if (p || q) return false; continue; } const sg = p[0] * q[0] + p[1] * q[1] + p[2] * q[2] + p[3] * q[3] < 0 ? -1 : 1; for (let k = 0; k < 4; k++) if (Math.abs(p[k] - sg * q[k]) > 1e-4) return false; }
  return !a.pos || !b.pos || a.pos.every((v, k) => Math.abs(v - b.pos[k]) < 1e-4);
}
// auto-key: an edit at the current frame becomes (or updates) the key of each character that changed
function animAutoKey() {
  if (!ANIM.open || !ANIM.auto || ANIM.playing || ANIM.busy || !shot()) return;
  const s = shot(); padKeys(s);
  chars.forEach((m, i) => {
    const cur = basePose(m), at = poseAt(i, ANIM.f) || m._prevPose;
    if (!at || !samePose(at, cur)) setKey(i);  // with a tolerance: the pose in hand is rounded, the one in between keys is not
    m._prevPose = cur;
  });
  thumbLater();
}
// the camera, when its track is being recorded
function camAutoKey() { if (ANIM.open && ANIM.camRec && !ANIM.playing && !ANIM.busy) setKey('cam'); }

/* ---------- shots ---------- */
// leave the current shot: keep its cast, set and a thumbnail; enter another and rebuild its scene
function storeShot() { const s = shot(); if (!s) return; s.scene = captureScene(); padKeys(s); }
// what a shot needs built: who is there, what they wear, the set and its things (not poses, camera or faces)
const stageOf = sc => JSON.stringify([sc.chars.map(c => [c.body, c.preset, c.outfit]), {...sc.extras, cam: undefined}]);
async function enterShot(i, frame = 0) {
  if (ANIM.busy || !ANIM.shots[i]) return;
  // playing on through a cut: nothing has been edited, so nothing is stored, drawn or kept for undo now (that is done
  // when it stops), and if the next shot stands on the same stage nothing is rebuilt: the cut costs one frame
  const playing = ANIM.playing, prev = shot();
  if (i !== ANIM.cur && !playing) { storeShot(); thumbNow(); }
  ANIM.busy = true; ANIM.cur = i; const s = shot();
  try {
    const sc = s.scene;
    if (!playing || !prev || stageOf(prev.scene) !== stageOf(sc)) {
      restore({chars: sc.chars.map(c => ({body: c.body, preset: c.preset, pose: c.pose, outfit: c.outfit})), active: Math.min(active, sc.chars.length - 1), ...sc.extras});
      await (state.envReady || Promise.resolve()).catch(() => {});
      await Promise.all(chars.flatMap(m => (m.garments || []).map(g => g.ready))).catch(() => {});
    }
    applyCam(sc.cam); ANIM.camBase = sc.cam;
    chars.forEach(m => { m._prevPose = m.getPose(); });
  } finally { ANIM.busy = false; }
  if (playing) { ANIM.playedInto = true; applyFrame(frame); ANIM.f = frame; markStrip(); prepareNext(); return; }
  ANIM.sel = null; TL.sel.clear(); syncSelBar(); ANIM.track = Math.min(typeof ANIM.track === 'number' ? ANIM.track : 0, chars.length - 1);
  setFrame(frame); renderStrip(); renderLabels(); hist.stack = []; hist.i = -1; pushHistory();
}
// after playing through cuts: the shot it stopped in becomes the one being edited, as if entered by hand
function settleAfterPlay() {
  if (!ANIM.playedInto) return; ANIM.playedInto = false;
  ANIM.sel = null; TL.sel.clear(); syncSelBar(); ANIM.track = Math.min(typeof ANIM.track === 'number' ? ANIM.track : 0, chars.length - 1);
  renderStrip(); renderLabels(); hist.stack = []; hist.i = -1; pushHistory();
}
// the strip's current shot, without redrawing every card
function markStrip() { const box = $('#mvStrip'); if (!box) return; const id = shot().id; box.querySelectorAll('.mvshot').forEach(c => { const on = +c.dataset.id === id; c.classList.toggle('on', on); if (on) { c.setAttribute('aria-current', 'true'); c.scrollIntoView && c.scrollIntoView({block: 'nearest', inline: 'nearest'}); } else c.removeAttribute('aria-current'); }); }
// while a shot plays, the next one's set is got ready (models loaded, built, its shaders compiled) so the cut does not wait
function prepareNext() {
  const n = ANIM.shots[ANIM.cur + 1]; if (!n || !n.scene || !n.scene.extras) return;
  const id = n.scene.extras.env; if (id && id !== state.env && typeof prepareEnv === 'function') setTimeout(() => prepareEnv(id), 60);
}
function addShot() {
  storeShot(); thumbNow();
  const s = newShot(); s.scene = captureScene();
  ANIM.shots.splice(ANIM.cur + 1, 0, s); ANIM.cur++; ANIM.f = 0;
  chars.forEach(m => { m._prevPose = m.getPose(); });
  ANIM.camBase = camState(); setFrame(0); renderStrip(); renderLabels(); thumbLater();
}
function duplicateShot() {
  storeShot(); const c = JSON.parse(JSON.stringify(shot())); c.id = ++shotSeq; c.name = tr('{n} (copia)', {n: shot().name});
  ANIM.shots.splice(ANIM.cur + 1, 0, c); ANIM.cur++; renderStrip();
}
function deleteShot() {
  if (ANIM.shots.length < 2) return toast(tr('La película necesita al menos un plano.'));
  ANIM.shots.splice(ANIM.cur, 1); const i = Math.min(ANIM.cur, ANIM.shots.length - 1); ANIM.cur = -1; enterShot(i);
}
function moveShot(d) {
  const i = ANIM.cur, j = i + d; if (j < 0 || j >= ANIM.shots.length) return;
  [ANIM.shots[i], ANIM.shots[j]] = [ANIM.shots[j], ANIM.shots[i]]; ANIM.cur = j; renderStrip();
}
function setShotLen(len) {
  const s = shot(); s.len = Math.max(2, Math.round(len));
  for (const K of s.keys) for (const k of K) k.f = Math.min(k.f, s.len - 1);
  for (const k of s.cam) k.f = Math.min(k.f, s.len - 1);
  for (const K of [...s.keys, s.cam]) K.sort((a, b) => a.f - b.f);
  setFrame(Math.min(ANIM.f, s.len - 1), false); renderStrip();
}
function setFps(fps) {
  const k = fps / ANIM.fps; ANIM.fps = fps;
  for (const s of ANIM.shots) {
    s.len = Math.max(2, Math.round(s.len * k));
    for (const K of [...s.keys, s.cam]) { for (const x of K) x.f = Math.min(Math.round(x.f * k), s.len - 1); const seen = new Set(); for (let i = K.length - 1; i >= 0; i--) { if (seen.has(K[i].f)) K.splice(i, 1); else seen.add(K[i].f); } }
    for (const l of s.lines) { l.f = Math.round(l.f * k); l.len = Math.max(2, Math.round(l.len * k)); }
  }
  setFrame(Math.round(ANIM.f * k)); renderStrip();
}

/* ---------- thumbnails of the shots (rendered off screen, without helpers) ---------- */
let thumbRT = null, thumbTimer = 0;
function thumbNow() {
  const s = shot(); if (!s) return;
  if (!thumbRT) thumbRT = new THREE.WebGLRenderTarget(256, 144);
  noDockView(); const hide = exportHide(), asp = camera.aspect; camera.aspect = 16 / 9; camera.updateProjectionMatrix();
  renderer.setRenderTarget(thumbRT); renderer.render(scene, camera); renderer.setRenderTarget(null);
  camera.aspect = asp; camera.updateProjectionMatrix(); hide();
  const px = new Uint8Array(256 * 144 * 4); renderer.readRenderTargetPixels(thumbRT, 0, 0, 256, 144, px);
  const c = document.createElement('canvas'); c.width = 256; c.height = 144; const x = c.getContext('2d'), id = x.createImageData(256, 144);
  for (let y = 0; y < 144; y++) id.data.set(px.subarray((143 - y) * 1024, (144 - y) * 1024), y * 1024);
  x.putImageData(id, 0, 0); s.thumb = c.toDataURL('image/jpeg', .8);
  const img = $(`#mvStrip [data-id="${s.id}"] img`); if (img) img.src = s.thumb; else renderStrip();
}
function thumbLater() { clearTimeout(thumbTimer); thumbTimer = setTimeout(() => { if (ANIM.open && !ANIM.playing && !ANIM.busy) thumbNow(); }, 600); }

/* ---------- speech: text to mouth shapes ---------- */
// morph weights [open, pursing, protrusion, compression, corner-puller, retraction, eversion] and jaw opening (degrees)
const VIS = {X: [[0, 0, 0, 0, 0, 0, 0], 0], A: [[0, 0, 0, .75, 0, 0, 0], 0], B: [[.12, 0, 0, 0, .15, .35, 0], 3], C: [[.38, 0, 0, 0, .25, .1, 0], 8],
  D: [[.75, 0, 0, 0, .1, 0, 0], 15], E: [[.38, .45, .1, 0, 0, 0, 0], 9], F: [[.08, .85, .45, 0, 0, 0, 0], 3], G: [[.05, 0, 0, .2, 0, .15, .55], 2], H: [[.3, 0, 0, 0, .1, .1, 0], 7]};
const shapeOf = c => 'mbp'.includes(c) ? 'A' : 'fv'.includes(c) ? 'G' : c === 'l' ? 'H' : 'wu'.includes(c) ? 'F' : c === 'o' ? 'E' : c === 'a' ? 'D' : c === 'e' ? 'C' : 'iy'.includes(c) ? 'B' : /[a-zñçß]/.test(c) ? 'B' : null;
const visCache = new Map();
// the line as timed mouth shapes: vowels weigh more than consonants, punctuation is a pause
function visemes(text) {
  if (visCache.has(text)) return visCache.get(text);
  const s = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/qu/g, 'k').replace(/ch|sh|th|ll/g, 's').replace(/oo/g, 'u').replace(/ee/g, 'i').replace(/h(?=[aeiou])/g, '');
  const seq = [];
  for (const ch of s) {
    const v = shapeOf(ch), w = v ? ('aeiou'.includes(ch) ? 1 : .55) : /[.!?…]/.test(ch) ? 2.6 : /[,;:]/.test(ch) ? 1.6 : /\s/.test(ch) ? .3 : 0;
    if (!w) continue; const sh = v || 'X';
    if (seq.length && seq[seq.length - 1].v === sh) seq[seq.length - 1].w += w * .6; else seq.push({v: sh, w});
  }
  while (seq.length && seq[seq.length - 1].v === 'X') seq.pop();
  const tot = seq.reduce((a, x) => a + x.w, 0) || 1; let acc = 0; const out = seq.map(x => { const r = {v: x.v, a: acc / tot, b: (acc + x.w) / tot}; acc += x.w; return r; });
  visCache.set(text, out); return out;
}
// how long a line takes to say: about 14 characters a second, with a short floor
const lineLen = text => Math.max(Math.round(ANIM.fps * .8), Math.round(ANIM.fps * (text.trim().length / 14 + .25)));
/* The mouth on a smooth curve: the jaw and the lips go from vowel to vowel and only the sounds that need the lips have
   shapes of their own (m, b, p close them, f and v bite the lip, o and u round them); every other consonant is carried
   by the vowels around it (coarticulation), and the result is softened over about a twentieth of a second, so the mouth
   never chatters from letter to letter. Words stressed by their accent or their length open it more. */
const MOUTH_KEEP = new Set(['A', 'G', 'F', 'E', 'D', 'C', 'X']);
const mouthCache = new Map();
function mouthTargets(text) {
  if (mouthCache.has(text)) return mouthCache.get(text);
  const V = visemes(text), T = [];
  for (const x of V) {
    const c = (x.a + x.b) / 2;
    if (MOUTH_KEEP.has(x.v)) T.push({u: c, v: x.v, k: x.v === 'X' ? 0 : 1});
    else if (x.v === 'B' && x.b - x.a > .04) T.push({u: c, v: 'B', k: .8});  // an i or a long consonant cluster: a narrow, spread mouth
  }
  if (!T.length || T[0].u > .02) T.unshift({u: 0, v: 'X', k: 0});
  T.push({u: 1, v: 'X', k: 0});
  mouthCache.set(text, T); return T;
}
function mouthIn(text, u, amp = 1) {
  if (u < 0 || u > 1) return null;
  const T = mouthTargets(text); let i = 0; while (i < T.length - 2 && T[i + 1].u <= u) i++;
  const a = T[i], b = T[i + 1], s = b.u > a.u ? clamp((u - a.u) / (b.u - a.u), 0, 1) : 0, k = s * s * (3 - 2 * s), A = VIS[a.v], B = VIS[b.v];
  return {w: A[0].map((x, n) => (x + (B[0][n] - x) * k) * amp), jaw: (A[1] + (B[1] - A[1]) * k) * amp};
}
const stressed = t => /[áéíóúàèòâêôãõäöü]/i.test(t) || t.replace(/[^\p{L}]/gu, '').length >= 6;
function mouthRaw(line, u) {
  if (u < 0 || u >= 1 || !line.text.trim()) return null;
  // with the voice's timing (32-voice): each word's shapes inside the time that word takes, the mouth at rest between them
  if (line.w) { const w = line.w.find(x => u >= x[2] && u < x[3]); if (!w) return null; const t = line.text.slice(w[0], w[1]); return mouthIn(t, (u - w[2]) / Math.max(1e-6, w[3] - w[2]), stressed(t) ? 1.08 : .88); }
  return mouthIn(line.text, u);
}
function mouthAt(line, f) {
  const dur = line.len / (ANIM.fps || 12), d = .045 / Math.max(.2, dur), u = (f - line.f) / line.len;
  if (u < -d || u >= 1 + d) return null;
  let w = null, jaw = 0;
  for (const [o, k] of [[-d, .25], [0, .5], [d, .25]]) { const m = mouthRaw(line, u + o); if (!m) continue; if (!w) w = m.w.map(() => 0); m.w.forEach((x, n) => w[n] += x * k); jaw += m.jaw * k; }
  return w ? {w, jaw} : null;
}
/* The rest of the face: everyone blinks every few seconds (each at their own rhythm, a little more often while they
   talk), and the brows lift with a question, with a stressed word or as a line starts with feeling; a worried or sad
   face lifts their inner ends. Worked out from the frame alone, like the mouth. */
const hash01 = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
function blinkAt(ci, t, talking) {
  let b = .6 + hash01(ci * 7.3) * 1.8, k = 0;
  while (b < t + .3 && k < 4000) {
    if (t >= b && t < b + .26) { const s = (t - b) / .26; return s < .28 ? Math.pow(s / .28, 1.5) : s < .5 ? 1 : Math.pow(1 - (s - .5) / .5, 2); }  // down fast, shut a moment, up slower
    b += (talking ? 2 : 2.8) + hash01(ci * 13.1 + k * 1.7) * 3.4; k++;
  }
  return 0;
}
function browsAt(line, u) {
  if (u < 0 || u > 1) return [0, 0];
  const dur = line.len / (ANIM.fps || 12), t = u * dur, pulse = (t0, a) => { const x = (t - t0) / .45; return x < 0 || x > 1 ? 0 : a * Math.sin(Math.PI * Math.pow(x, .6)); };
  let up = pulse(0, line.inten > .5 ? .55 : .25), inner = 0;
  if (/\?\s*$/.test(line.text)) up = Math.max(up, .55 * smoothR(.55, .85, u) * (1 - smoothR(.95, 1, u)));
  if (line.w) for (const w of line.w) { const tx = line.text.slice(w[0], w[1]); if (stressed(tx) && /[!¡]/.test(line.text) || tx.length >= 9) up = Math.max(up, pulse(w[2] * dur, .3)); }
  if (['triste', 'miedo', 'preocupado'].includes(line.emo)) inner = .5;
  return [up, inner];
}
// the face of the moment (a film made from a script keeps when each one changes: s.faces), eased over a third of a second
function faceAt(s, i, f) {
  const F = s.faces && s.faces[i]; if (!F || !F.length) return null;
  const k = Math.round(.33 * (ANIM.fps || 12)); let j = 0; while (j < F.length - 1 && F[j + 1].f <= f) j++;
  const cur = F[j], prev = j ? F[j - 1] : null, u = prev && f < cur.f + k ? clamp((f - cur.f) / k, 0, 1) : 1, w = {};
  const add = (e, a) => { const x = FACE_EXPR[e]; if (x) for (const [n, v] of Object.entries(x.u)) w[n] = (w[n] || 0) + v * a; };
  if (f >= cur.f) add(cur.e, u * u * (3 - 2 * u) * (cur.a ?? 1)); if (prev && u < 1) add(prev.e, (1 - u * u * (3 - 2 * u)) * (prev.a ?? 1));
  return w;
}
function applyMouths(f) {
  const s = shot(), nv = mouthCount(), t = f / (ANIM.fps || 12);
  chars.forEach((m, i) => {
    let mo = null, br = [0, 0], talk = false; for (const l of s.lines) if (l.c === i) { const lm = mouthAt(l, f); if (lm) { mo = lm; talk = true; br = browsAt(l, (f - l.f) / l.len); break; } }
    const human = m.body.species === 'humano' && !m.headSwap && !m.avatar, inf = m.body3.morphTargetInfluences;
    if (inf && nv) {
      const bl = human ? blinkAt(i, t + (s.t0 || 0), talk) : 0, W = new Array(nv).fill(0);
      if (mo && human) mo.w.forEach((v, k) => W[k] = v);
      const fc = human ? faceAt(s, i, f) : null; if (fc) for (const [n, v] of Object.entries(fc)) if (UNIT_AT[n] != null && UNIT_AT[n] < nv) W[UNIT_AT[n]] += v * (mo && n.startsWith('mouth') ? .5 : 1);
      if (nv > 7) { W[7] = Math.max(W[7], bl); W[8] = Math.max(W[8], bl); W[9] += br[0]; W[10] += br[0]; W[11] += br[1]; W[12] += br[1]; }
      for (let k = 0; k < nv && k < inf.length; k++) { inf[k] = W[k]; for (const h of m.hulls) if (h.morphTargetInfluences) h.morphTargetInfluences[k] = W[k]; }
    }
    const jaw = mo ? mo.jaw * (human ? .55 : 1.4) * DEG : 0, q = m.joints.jaw.quaternion;  // take the last shape off, put this one on
    if (m._visJaw) q.multiply(new Q().setFromAxisAngle(JAW_AXIS, -m._visJaw));
    if (jaw) q.multiply(new Q().setFromAxisAngle(JAW_AXIS, jaw)); m._visJaw = jaw;
  });
}
function clearMouths() { for (const m of chars) { const inf = m.body3.morphTargetInfluences, nv = mouthCount(); if (inf) inf.fill(0, 0, nv); for (const h of m.hulls) if (h.morphTargetInfluences) h.morphTargetInfluences.fill(0, 0, nv); if (m._visJaw) m.joints.jaw.quaternion.multiply(new Q().setFromAxisAngle(JAW_AXIS, -m._visJaw)); m._visJaw = 0; } }
const speaker = i => `${i + 1} · ${chars[i] ? charLabel(chars[i]) : '?'}`;
function subsAt(f) { const s = shot(); return s ? s.lines.filter(l => f >= l.f && f < l.f + l.len && l.text.trim()) : []; }
function showSubs(f) {
  const el = $('#subs'), L = ANIM.open && ANIM.subs ? subsAt(f) : [];
  el.hidden = !L.length; if (!L.length) return;
  el.innerHTML = ''; for (const l of L) { const p = document.createElement('p'); const b = document.createElement('b'); b.textContent = speaker(l.c); b.style.setProperty('--sw', MV_COLS[l.c % 4]); p.append(b, document.createTextNode(l.text)); el.appendChild(p); }
}

/* ---------- playback ---------- */
const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';
function play(on) {
  if (on) tourEvent('play');
  if (on && ANIM.busy) return;
  ANIM.playing = on; if (on && ANIM.f >= shot().len - 1) ANIM.t = 0;
  const b = $('#tlPlay'); b.setAttribute('aria-pressed', String(on)); b.innerHTML = on ? ICON_PAUSE : ICON_PLAY; b.title = tr(on ? 'Pausa (espacio)' : 'Reproducir (espacio)');
  voiceStop(); if (on) { voiceCtx(); clearOnion(); animLast = performance.now(); prepareNext(); } else { settleAfterPlay(); setFrame(ANIM.t); }
}
let animLast = 0;
function animTick() {
  const now = performance.now(), dt = Math.min(.1, (now - animLast) / 1000); animLast = now;
  if (!ANIM.playing || ANIM.busy) return;
  ANIM.t += dt * ANIM.fps;
  const s = shot();
  if (ANIM.t >= s.len - 1) {
    const last = ANIM.cur >= ANIM.shots.length - 1;
    if (ANIM.all && !last) return nextShotWhilePlaying(ANIM.cur + 1);
    if (ANIM.loop && !ANIM.rec) return ANIM.all && ANIM.shots.length > 1 ? nextShotWhilePlaying(0) : (ANIM.t = 0, undefined);
    ANIM.t = s.len - 1; applyFrame(ANIM.t); play(false); if (ANIM.rec) ANIM.rec.done(); return;
  }
  applyFrame(ANIM.t); voiceTick(ANIM.t); ANIM.f = Math.floor(ANIM.t); drawTimeline();
}
async function nextShotWhilePlaying(i) {
  if (ANIM.rec) ANIM.rec.pause();
  VOICE.started.clear();  // the lines of the next shot (a line cut in two goes on sounding: see voiceTick)
  await enterShot(i, 0); ANIM.t = 0; animLast = performance.now();
  if (ANIM.rec) ANIM.rec.resume();
}

/* ---------- onion skin ---------- */
function clearOnion() { for (const g of ANIM.ghosts) { scene.remove(g); g.geometry.dispose(); } ANIM.ghosts = []; }
function ghostOf(m, pose, color) {
  const saved = m.getPose(); m.setPose(pose); m.group.updateMatrixWorld(true); m.skeleton.update();
  const b = m.body3, p = b.geometry.attributes.position, arr = new Float32Array(p.count * 3), v = new V3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); b.boneTransform(i, v); v.applyMatrix4(b.matrixWorld); arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z; }
  m.setPose(saved); m.group.updateMatrixWorld(true);
  const g = new THREE.BufferGeometry(); g.setIndex(b.geometry.index); g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({color, transparent: true, opacity: .16, depthWrite: false})); mesh.renderOrder = 4; mesh.raycast = () => {};
  return mesh;
}
function updateOnion() {
  clearOnion();
  const s = shot(), i = chars.indexOf(mq);
  if (!ANIM.open || !ANIM.onion || ANIM.playing || !s || !s.keys[i] || s.keys[i].length < 2) return;
  const K = s.keys[i], prev = [...K].reverse().find(k => k.f < ANIM.f), next = K.find(k => k.f > ANIM.f);
  for (const [k, c] of [[prev, 0x2b5a9e], [next, 0xb0432c]]) if (k) { const g = ghostOf(mq, k.pose, c); scene.add(g); ANIM.ghosts.push(g); }
}

/* ---------- the dock: shot strip, transport, tracks ---------- */
const LANE = () => matchMedia('(pointer: coarse)').matches ? 32 : matchMedia('(max-width: 600px)').matches ? 22 : 24, RULER = 18;
const lanes = () => ['cam', ...chars.map((_, i) => i), 'lines'];
function trackX(f) { const c = $('#tlTrack'), pad = 12, v = tlView(); return pad + (f - v.a) / Math.max(1, v.b - v.a) * (c.clientWidth - pad * 2); }
function trackF(x) { const c = $('#tlTrack'), pad = 12, v = tlView(); return v.a + (x - pad) / Math.max(1, c.clientWidth - pad * 2) * (v.b - v.a); }
const laneY = i => RULER + i * LANE();
function renderStrip() {
  const box = $('#mvStrip'); if (!box) return; box.innerHTML = '';
  ANIM.shots.forEach((s, i) => {
    const on = i === ANIM.cur, card = document.createElement('div'); card.className = 'mvshot' + (on ? ' on' : ''); card.dataset.id = s.id; card.setAttribute('role', 'listitem');
    if (on) card.setAttribute('aria-current', 'true');
    const th = document.createElement('button'); th.type = 'button'; th.className = 'mvthumb'; th.title = s.name; th.setAttribute('aria-label', tr('Ir a {n}', {n: s.name}));
    th.innerHTML = s.thumb ? `<img alt="" src="${s.thumb}">` : '<span class="mvph"></span>';
    const num = document.createElement('span'); num.className = 'mvnum'; num.textContent = i + 1; th.appendChild(num);
    if (s.lines.some(l => l.text.trim())) { const d = document.createElement('span'); d.className = 'mvtalk'; d.title = tr('Tiene diálogo'); th.appendChild(d); }
    th.onclick = () => { if (!on) { if (ANIM.playing) play(false); enterShot(i); } };
    const meta = document.createElement('div'); meta.className = 'mvmeta';
    const nm = document.createElement('span'); nm.className = 'mvname'; nm.textContent = s.name; nm.title = tr('Doble clic para cambiar el nombre');
    nm.ondblclick = () => { const inp = document.createElement('input'); inp.value = s.name; inp.className = 'mvrename'; inp.maxLength = 40; nm.replaceWith(inp); inp.focus(); inp.select();
      const done = () => { s.name = inp.value.trim() || s.name; renderStrip(); }; inp.onblur = done; inp.onkeydown = e => { if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') { inp.value = s.name; inp.blur(); } }; };
    const du = document.createElement('span'); du.className = 'mvdur'; du.textContent = dec(sec(s.len)) + ' s';
    meta.append(nm, du); card.append(th, meta);
    if (on) {
      const acts = document.createElement('div'); acts.className = 'mvacts';
      for (const [ic, label, fn, dis] of [['dup', 'Duplicar el plano', duplicateShot], ['left', 'Mover a la izquierda', () => moveShot(-1), i === 0], ['right', 'Mover a la derecha', () => moveShot(1), i === ANIM.shots.length - 1], ['del', 'Borrar el plano', deleteShot, ANIM.shots.length < 2]]) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'mvact'; b.innerHTML = MV_ICONS[ic]; b.title = tr(label); b.setAttribute('aria-label', tr(label)); b.disabled = !!dis; b.onclick = fn; acts.appendChild(b);
      }
      card.appendChild(acts);
    }
    box.appendChild(card);
  });
  const add = document.createElement('button'); add.type = 'button'; add.className = 'mvadd'; add.innerHTML = `${MV_ICONS.plus}<span>${tr('Plano')}</span>`; add.title = tr('Plano nuevo a partir de lo que se ve ahora');
  add.onclick = addShot; const li = document.createElement('div'); li.setAttribute('role', 'listitem'); li.className = 'mvaddwrap'; li.appendChild(add); box.appendChild(li);  // a list holds list items only
  const cur = box.querySelector('.mvshot.on'); if (cur) cur.scrollIntoView({block: 'nearest', inline: 'nearest'});
  const tot = ANIM.shots.reduce((a, s) => a + s.len, 0); $('#mvTotal').textContent = trn(ANIM.shots.length, '1 plano · {s} s', '{n} planos · {s} s', {s: dec(sec(tot))});
}
const MV_ICONS = {
  dup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
  left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18 9 12l6-6"/></svg>',
  right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
  del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="7" width="13" height="10" rx="2"/><path d="m16 11 5-3v8l-5-3z"/></svg>',
  talk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 5h16v10H9l-5 4z"/></svg>'
};
function renderLabels() {
  const box = $('#tlLabels'); if (!box) return; box.innerHTML = '';
  const ruler = document.createElement('div'); ruler.className = 'tllab ruler'; ruler.style.height = RULER + 'px'; box.appendChild(ruler);
  for (const ln of lanes()) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tllab'; b.style.height = LANE() + 'px';
    if (ln === 'cam') {
      b.innerHTML = `${MV_ICONS.cam}<span>${tr('Cámara')}</span>`; b.title = tr('Pista de la cámara: toca para elegirla');
      const rec = document.createElement('span'); rec.className = 'rec' + (ANIM.camRec ? ' on' : ''); rec.title = tr(ANIM.camRec ? 'Grabando la cámara: cada encuadre se guarda como clave' : 'Grabar la cámara'); b.appendChild(rec);
      rec.onclick = e => { e.stopPropagation(); toggleCamRec(); };
      b.onclick = () => { ANIM.track = 'cam'; renderLabels(); drawTimeline(); };
    } else if (ln === 'lines') {
      b.innerHTML = `${MV_ICONS.talk}<span>${tr('Diálogo')}</span>`; b.title = tr('Guion: toca para añadir una línea'); b.onclick = () => addLine();
    } else {
      const sw = document.createElement('i'); sw.style.background = MV_COLS[ln % 4]; const t = document.createElement('span'); t.textContent = speaker(ln);
      b.append(sw, t); b.title = t.textContent; b.onclick = () => { ANIM.track = ln; if (chars[ln] && chars[ln] !== mq) setActive(ln); renderLabels(); drawTimeline(); updateOnion(); syncMotionUI(); };
    }
    if (ANIM.track === ln) b.classList.add('on');
    box.appendChild(b);
  }
}
function toggleCamRec() { ANIM.camRec = !ANIM.camRec; if (ANIM.camRec) { ANIM.track = 'cam'; toast(tr('Mueve la cámara: cada encuadre se guarda en este fotograma.')); } $('#tlCamRec').setAttribute('aria-pressed', String(ANIM.camRec)); renderLabels(); drawTimeline(); }
let labelSig = '';
function drawTimeline() {
  const cv = $('#tlTrack'), s = shot(); updateTrails(); if (!cv || !ANIM.open || !s) return;
  const sig = lanes().map(l => typeof l === 'number' ? speaker(l) : l).join('|') + '#' + ANIM.track + ANIM.camRec; if (sig !== labelSig) { labelSig = sig; renderLabels(); }
  const L = lanes(), H = RULER + L.length * LANE() + 4; if (cv.style.height !== H + 'px') { cv.style.height = H + 'px'; $('#tlLabels').style.height = H + 'px'; }
  const pr = Math.min(devicePixelRatio, 2), w = cv.clientWidth, h = H;
  if (cv.width !== Math.round(w * pr) || cv.height !== Math.round(h * pr)) { cv.width = Math.round(w * pr); cv.height = Math.round(h * pr); }
  const c = cv.getContext('2d'); c.setTransform(pr, 0, 0, pr, 0, 0); c.clearRect(0, 0, w, h);
  const ink = css('--ink'), soft = css('--ink-soft'), line = css('--line'), rule = css('--rule'), blue = css('--blue'), page = css('--page');
  // lanes
  L.forEach((ln, i) => { const y = laneY(i); if (ANIM.track === ln) { c.fillStyle = rule; c.fillRect(0, y, w, LANE()); } c.strokeStyle = rule; c.beginPath(); c.moveTo(0, y + LANE() - .5); c.lineTo(w, y + LANE() - .5); c.stroke(); });
  // ruler: seconds labelled, frames ticked
  c.font = `10px ${css('--f-mono')}`; c.textAlign = 'center';
  const vw = tlView(s), step = Math.max(1, Math.ceil(((vw.b - vw.a + 1) / Math.max(1, w - 24)) * 5)), secStep = (vw.b - vw.a) / ANIM.fps > 40 ? 5 : 1;
  for (let f = Math.max(0, Math.floor(vw.a)); f <= Math.min(s.len - 1, Math.ceil(vw.b)); f++) { const x = trackX(f), isSec = f % (ANIM.fps * secStep) === 0; if (!isSec && f % step) continue;
    c.strokeStyle = isSec ? soft : line; c.lineWidth = 1; c.beginPath(); c.moveTo(x + .5, RULER - (isSec ? 7 : 4)); c.lineTo(x + .5, RULER); c.stroke();
    if (isSec) { c.fillStyle = soft; c.fillText(TL.frames ? String(f) : dec(f / ANIM.fps, 0) + 's', x, 9); } }
  // keys
  // a key's shape says how it goes on: diamond smooth, circle linear, square held; selected keys are blue with a white rim
  const diamond = (x, y, r, fill, selected, k) => { if (k && TL.hover === k) r += 2; c.beginPath();
    if (k && k.ip === 'hold') c.rect(x - r * .8, y - r * .8, r * 1.6, r * 1.6); else if (k && k.ip === 'lin') c.arc(x, y, r * .85, 0, Math.PI * 2); else { c.moveTo(x, y - r); c.lineTo(x + r, y); c.lineTo(x, y + r); c.lineTo(x - r, y); c.closePath(); }
    c.fillStyle = selected ? blue : fill; c.fill(); if (selected) { c.strokeStyle = page; c.lineWidth = 2; c.stroke(); c.strokeStyle = blue; c.lineWidth = 1; c.stroke(); } else if (k && k.f === ANIM.f) { c.strokeStyle = page; c.lineWidth = 1.5; c.stroke(); } };
  L.forEach((ln, i) => {
    const y = laneY(i) + LANE() / 2;
    if (ln === 'lines') {
      for (const [j, l] of s.lines.entries()) {
        const x0 = trackX(l.f), x1 = Math.max(x0 + 8, trackX(Math.min(l.f + l.len, s.len - 1))), col = MV_COLS[l.c % 4], top = laneY(i) + 3, hh = LANE() - 7;
        c.fillStyle = col; c.globalAlpha = ANIM.sel && ANIM.sel.line === j ? 1 : .82; c.beginPath(); c.roundRect ? c.roundRect(x0, top, x1 - x0, hh, 5) : c.rect(x0, top, x1 - x0, hh); c.fill(); c.globalAlpha = 1;
        c.save(); c.beginPath(); c.rect(x0 + 4, top, x1 - x0 - 10, hh); c.clip(); c.fillStyle = '#fff'; c.textAlign = 'left'; c.font = `600 10.5px ${css('--f-body')}`; c.fillText(l.text.trim() || '…', x0 + 6, top + hh / 2 + 3.5); c.restore();
        c.fillStyle = 'rgba(255,255,255,.7)'; c.fillRect(x1 - 4, top + 4, 1.5, hh - 8);
      }
    } else {
      const K = ln === 'cam' ? s.cam : (s.keys[ln] || []), col = ln === 'cam' ? ink : MV_COLS[ln % 4];
      if (K.length > 1) { c.strokeStyle = col; c.globalAlpha = .35; c.lineWidth = 2; c.beginPath(); c.moveTo(trackX(K[0].f), y); c.lineTo(trackX(K[K.length - 1].f), y); c.stroke(); c.globalAlpha = 1; }
      // a run of keys from a gallery clip reads as one block with its name; its own keys only at the ends
      const isSel = k => TL.sel.has(k);
      for (let a = 0; a < K.length - 1; a++) if (!K[a].lin && K[a].ip === 'hold') { c.fillStyle = col; c.globalAlpha = .45; c.fillRect(trackX(K[a].f), y - 3, trackX(K[a + 1].f) - trackX(K[a].f), 6); c.globalAlpha = 1; }  // a held pose: a bar to the next key
      for (let a = 0; a < K.length; a++) {
        if (!K[a].lin) { diamond(trackX(K[a].f), y, 6, col, isSel(K[a]), K[a]); continue; }
        let b = a; while (b < K.length - 1 && K[b].lin) b++;
        const x0 = trackX(K[a].f), x1 = trackX(K[b].f), hh = LANE() - 10;
        const blockSel = K.slice(a, b + 1).every(isSel); c.fillStyle = blockSel ? blue : col; c.globalAlpha = blockSel ? .35 : .28; c.beginPath(); c.roundRect ? c.roundRect(x0, y - hh / 2, x1 - x0, hh, 4) : c.rect(x0, y - hh / 2, x1 - x0, hh); c.fill(); c.globalAlpha = 1;
        if (blockSel) { c.strokeStyle = blue; c.lineWidth = 1.5; c.stroke(); }
        const name = K.slice(a, b + 1).find(k => k.clip);
        if (name && x1 - x0 > 40) { c.save(); c.beginPath(); c.rect(x0 + 8, y - hh / 2, x1 - x0 - 16, hh); c.clip(); c.fillStyle = ink; c.textAlign = 'left'; c.font = `600 10px ${css('--f-body')}`; c.fillText(name.clip, x0 + 10, y + 3.5); c.restore(); }
        diamond(x0, y, 5, col, isSel(K[a]), K[a]); diamond(x1, y, 5, col, isSel(K[b]), K[b]);
        if (!blockSel) for (let k = a + 1; k < b; k++) if (isSel(K[k])) diamond(trackX(K[k].f), y, 4, col, true);
        a = b;
      }
      if (ln === 'cam' && ANIM.camRec) { c.fillStyle = css('--red'); c.beginPath(); c.arc(w - 10, y, 3.5, 0, Math.PI * 2); c.fill(); }
    }
  });
  // playhead
  const x = trackX(ANIM.playing ? ANIM.t : ANIM.f); c.strokeStyle = blue; c.lineWidth = 2; c.beginPath(); c.moveTo(x, RULER - 2); c.lineTo(x, h); c.stroke();
  c.fillStyle = blue; c.beginPath(); c.moveTo(x - 6, RULER - 8); c.lineTo(x + 6, RULER - 8); c.lineTo(x + 6, RULER - 3); c.lineTo(x, RULER + 2); c.lineTo(x - 6, RULER - 3); c.closePath(); c.fill();
  if (TL.box) { const b = TL.box; c.fillStyle = css('--blue-wash'); c.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0); c.strokeStyle = blue; c.lineWidth = 1; c.setLineDash([4, 3]); c.strokeRect(b.x0 + .5, b.y0 + .5, b.x1 - b.x0, b.y1 - b.y0); c.setLineDash([]); }
  if (s.view) { const v = s.view, bw = w * (v.b - v.a) / (s.len - 1), bx = w * v.a / (s.len - 1); c.fillStyle = soft; c.globalAlpha = .35; c.fillRect(bx, h - 3, bw, 3); c.globalAlpha = 1; }  // where the zoomed view is in the shot
  // readout and the key button
  // the time and the shot's length (as the strip shows it), in the language's decimals; a click counts in frames
  const fr = ANIM.playing ? Math.floor(ANIM.t) : ANIM.f, tc = t => { const m = Math.floor(t / 60), ss = Math.round((t - m * 60) * 10) / 10; return `${m}:${ss < 10 ? '0' : ''}${dec(ss)}`; };
  $('#tlFrame').textContent = TL.frames ? `F ${fr + 1} / ${s.len}` : matchMedia('(max-width: 600px)').matches ? tc(sec(fr)) : `${tc(sec(fr))} / ${tc(sec(s.len))}`;
  $('#tlFrame').title = tr('Fotograma {f} de {n}', {f: fr + 1, n: s.len}) + ' · ' + tr(TL.frames ? 'Clic: contar en segundos' : 'Clic: contar en fotogramas');
  $('#tlShot').textContent = `${ANIM.cur + 1}/${ANIM.shots.length} · ${s.name}`;
  const k = hasKey(ANIM.track, ANIM.f), who = ANIM.track === 'cam' ? tr('la cámara') : speaker(ANIM.track);
  $('#tlKey').setAttribute('aria-pressed', String(k)); $('#tlKey').title = tr(k ? 'Quitar la clave de {w} en este fotograma (K)' : 'Guardar una clave de {w} en este fotograma (K)', {w: who});
}
function openTimeline(on) {
  ANIM.open = on; $('#timeline').hidden = !on; $('#animBtn').setAttribute('aria-pressed', String(on)); document.body.classList.toggle('anim', on);
  if (on) {
    if (!ANIM.shots.length) { ANIM.shots.push(newShot()); ANIM.cur = 0; ANIM.camBase = camState(); chars.forEach(m => { m._prevPose = m.getPose(); }); }
    ANIM.track = chars.indexOf(mq); tourEvent('anim'); renderStrip(); renderLabels(); setFrame(ANIM.f, false); thumbLater();
    chars.forEach(m => { m._prevPose = basePose(m); }); pushHistory();  // undo can take the first keys back off
  } else { play(false); clearOnion(); closeLineEditor(); clearMouths(); $('#subs').hidden = true; storeShot(); chars.forEach(m => setFigureStretch(m, m.body.stretch ?? 1)); }
  reframeSoon();  // the dock takes the bottom of the canvas (or gives it back)
}

/* ---------- dialogue lines ---------- */
function addLine(f = ANIM.f) {
  const s = shot(), c = typeof ANIM.track === 'number' ? ANIM.track : chars.indexOf(mq), l = {c, text: '', f: Math.min(f, s.len - 2), len: lineLen(''), auto: true};
  s.lines.push(l); s.lines.sort((a, b) => a.f - b.f); ANIM.sel = {line: s.lines.indexOf(l)}; drawTimeline(); openLineEditor(s.lines.indexOf(l));
}
let leIndex = -1, leLen = null;
// a line typed by hand: once the typing stops, the voice says how long it lasts and where its words fall
let timeLineT = 0;
function timeLineLater(l, s) {
  clearTimeout(timeLineT);
  timeLineT = setTimeout(async () => { const lang = l.lang || (LANG.slice(0, 2) in VOICE_LANGS ? LANG.slice(0, 2) : 'en'), tm = await lineTiming(l.text, lang, l.voice || voiceOf(chars[l.c], l.c));
    if (!tm.words) return; if (l.auto) l.len = Math.min(Math.max(2, Math.round(tm.dur * ANIM.fps)), Math.max(2, s.len - l.f)); l.w = lineWords(tm.words, l.text, l.len / ANIM.fps); drawTimeline(); }, 500);
}
function openLineEditor(j) {
  const s = shot(), l = s.lines[j]; if (!l) return; leIndex = j; ANIM.sel = {line: j};
  const box = $('#lineEdit'); box.hidden = false;
  chips($('#leChar'), chars.map((_, i) => [String(i), speaker(i)]), String(l.c), v => { l.c = +v; drawTimeline(); applyFrame(ANIM.f); });
  $$('#leChar .chip').forEach((b, i) => b.style.setProperty('--sw', MV_COLS[i % 4]));
  const ta = $('#leText'); ta.value = l.text; setTimeout(() => ta.focus({preventScroll: true}), 0);
  ta.oninput = () => { l.text = ta.value; l.w = null; if (l.auto) { l.len = Math.min(lineLen(l.text), Math.max(2, s.len - l.f)); leLen.set(sec(l.len)); } visCache.clear(); timeLineLater(l, s); drawTimeline(); applyFrame(ANIM.f); };
  leLen.set(sec(l.len)); $('#leAuto').checked = !!l.auto;
  drawTimeline();
}
function closeLineEditor() {
  const s = shot(); $('#lineEdit').hidden = true;
  if (s && leIndex >= 0 && s.lines[leIndex] && !s.lines[leIndex].text.trim()) s.lines.splice(leIndex, 1);
  leIndex = -1; ANIM.sel = null; if (s) { drawTimeline(); renderStrip(); pushHistory(); }
}
function lineAtXY(x, y) {
  const s = shot(), i = lanes().indexOf('lines'); if (y < laneY(i) || y > laneY(i) + LANE()) return null;
  for (let j = s.lines.length - 1; j >= 0; j--) { const l = s.lines[j], x0 = trackX(l.f), x1 = Math.max(x0 + 8, trackX(Math.min(l.f + l.len, s.len - 1))); if (x >= x0 - 2 && x <= x1 + 3) return {j, edge: x > x1 - 7}; }
  return null;
}

/* ---------- wiring ---------- */
function buildAnimUI() {
  $('#animBtn').onclick = () => openTimeline(!ANIM.open);
  $('#tlClose').onclick = () => openTimeline(false);
  $('#tlPlay').innerHTML = ICON_PLAY; $('#tlPlay').onclick = e => { e.currentTarget.blur(); play(!ANIM.playing); };  // blurred: the space bar must not press it again
  $('#tlKey').onclick = () => { if (hasKey(ANIM.track, ANIM.f)) deleteKey(); else setKey(); pushHistory(); };
  const jump = d => { const s = shot(), K = (ANIM.track === 'cam' ? s.cam : s.keys[ANIM.track] || []).map(k => k.f); const t = d < 0 ? [...K].reverse().find(f => f < ANIM.f) : K.find(f => f > ANIM.f); if (t != null) setFrame(t); };
  $('#tlPrev').onclick = () => jump(-1); $('#tlNext').onclick = () => jump(1);
  $('#tlCamRec').onclick = toggleCamRec;
  $('#tlLine').onclick = () => addLine();
  $('#tlExport').onclick = () => { EXK.kind = 'anim'; if (!ANIM.exported) { ANIM.exported = true; ex.size = 1; setPressed($('#exSize'), '1'); } openExport(); setPressed($('#exKind'), 'anim'); };
  $('#tlMin').onclick = () => { ANIM.min = !ANIM.min; $('#timeline').classList.toggle('min', ANIM.min); $('#tlMin').setAttribute('aria-expanded', String(!ANIM.min)); drawTimeline(); };
  // tracks: selection, moves, menus, zoom (22c-timeline)
  const cv = $('#tlTrack'); initTimeline(cv); initTimelineKeys();
  const at = e => { const r = cv.getBoundingClientRect(); return {x: e.clientX - r.left, y: e.clientY - r.top}; };
  cv.addEventListener('dblclick', e => { const {x, y} = at(e), i = lanes().indexOf('lines'); if (y >= laneY(i) && y <= laneY(i) + LANE() && !lineAtXY(x, y)) addLine(Math.round(trackF(x))); });
  new ResizeObserver(drawTimeline).observe(cv);
  new ResizeObserver(() => vp.style.setProperty('--dockH', $('#timeline').offsetHeight + 'px')).observe($('#timeline'));
  // the line editor
  leLen = slider($('#leLenBox'), {id: 'leLen', label: 'Duración de la línea', min: .3, max: 15, step: .1, value: 1, fmt: v => dec(v) + ' s',
    input: v => { const s = shot(), l = s.lines[leIndex]; if (!l) return; l.len = clamp(Math.round(v * ANIM.fps), 2, s.len - l.f); l.auto = false; $('#leAuto').checked = false; drawTimeline(); }});
  $('#leAuto').onchange = e => { const s = shot(), l = s.lines[leIndex]; if (!l) return; l.auto = e.target.checked; if (l.auto) { l.len = Math.min(lineLen(l.text), s.len - l.f); leLen.set(sec(l.len)); drawTimeline(); } };
  $('#leDel').onclick = () => { const s = shot(); if (leIndex >= 0) s.lines.splice(leIndex, 1); leIndex = -1; closeLineEditor(); applyFrame(ANIM.f); };
  $('#leDone').onclick = closeLineEditor;
  $('#leText').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); closeLineEditor(); } if (e.key === 'Escape') closeLineEditor(); };
  // options
  chips($('#tlFps'), [['8', '8'], ['12', '12'], ['24', '24']], String(ANIM.fps), v => { setFps(+v); setPressed($('#tlFps'), v); });
  ANIM.lenEl = slider($('#tlLenBox'), {id: 'tlLen', label: 'Duración de este plano', min: .5, max: 30, step: .5, value: 4, fmt: v => dec(v) + ' s', input: v => setShotLen(v * ANIM.fps)});
  const chk = (id, key, after) => { const el = $(id); el.checked = ANIM[key]; el.onchange = () => { ANIM[key] = el.checked; after && after(); }; };
  chk('#tlAuto', 'auto'); chk('#tlOnion', 'onion', updateOnion); chk('#tlEase', 'ease', () => setFrame(ANIM.f)); chk('#tlLoop', 'loop'); chk('#tlAll', 'all'); chk('#tlSubs', 'subs', () => showSubs(ANIM.f));
  { const v = $('#tlVoice'); v.checked = VOICE.on; v.onchange = () => { VOICE.on = v.checked; store.set('cdp.tts', VOICE.on); if (!VOICE.on) voiceStop(); }; }
  $('#tlMotion').onclick = () => { const p = $('#mvMotion'); p.hidden = !p.hidden; $('#tlMotion').setAttribute('aria-expanded', String(!p.hidden)); $('#tlOpts').hidden = true; if (!p.hidden) syncMotionUI(); };
  buildMotionUI();
  // phones: the row keeps play, the keys and close; the other tools wait in the "…" panel, with their names
  const ph = document.createElement('div'); ph.className = 'tlphone';
  for (const id of ['tlScript', 'tlClips', 'tlBoard', 'tlLine', 'tlCamRec', 'tlExport', 'tlMotion', 'tlMin']) {
    const o = $('#' + id), b = document.createElement('button'); b.type = 'button'; b.className = 'btn small'; b.dataset.for = id;
    b.innerHTML = o.querySelector('svg').outerHTML + '<span></span>'; b.querySelector('span').textContent = o.getAttribute('aria-label');
    b.onclick = () => { $('#tlOpts').hidden = true; $('#tlMore').setAttribute('aria-expanded', 'false'); o.click(); }; ph.appendChild(b);
  }
  $('#tlOpts').prepend(ph);
  // on a phone these panels sit over the canvas, with a way to close them at the top
  for (const [box, btn, title] of [['#tlOpts', '#tlMore', 'Opciones de animación'], ['#mvMotion', '#tlMotion', 'Interpretación']]) {
    const h = document.createElement('div'); h.className = 'tlphead'; h.innerHTML = '<strong></strong><button type="button" class="gx">×</button>';
    h.firstChild.textContent = tr(title); h.lastChild.setAttribute('aria-label', tr('Cerrar'));
    h.lastChild.onclick = () => { $(box).hidden = true; $(btn).setAttribute('aria-expanded', 'false'); }; $(box).prepend(h);
  }
  $('#tlMore').onclick = () => { $('#mvMotion').hidden = true; const p = $('#tlOpts'); p.hidden = !p.hidden; $('#tlMore').setAttribute('aria-expanded', String(!p.hidden));
    if (!p.hidden) { ANIM.lenEl.set(sec(shot().len)); setPressed($('#tlFps'), String(ANIM.fps)); ph.querySelectorAll('[data-for]').forEach(b => { const v = $('#' + b.dataset.for).getAttribute('aria-pressed'); if (v) b.setAttribute('aria-pressed', v); }); } };
  $('#tlSaveFilm').onclick = () => { storeShot(); saveFile(`pelicula-${stamp()}.neopose.json`, new TextEncoder().encode(JSON.stringify({cdp: 1, ...snapshot(), ...sceneExtras(true)})), 'application/json'); };
  $('#tlOpenFilm').onclick = () => $('#tlFilmFile').click();
  $('#tlFilmFile').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { const o = JSON.parse(await f.text()); if (!o.chars) throw 0; restore(o); if (o.anim) applyAnimState(o.anim); toast(tr('Película abierta.')); } catch (_) { toast(tr('Ese archivo no es una película de NEOPOSE.')); } };
  controls.addEventListener('end', camAutoKey);
  $('#focal').addEventListener('change', camAutoKey);
  addEventListener('keydown', e => {
    if (!ANIM.open || e.target.matches('input,textarea,[contenteditable]') || topModal()) return;
    const k = e.key.toLowerCase();
    if (e.key === ' ') { e.preventDefault(); play(!ANIM.playing); }
    else if (k === 'k' && !e.ctrlKey && !e.metaKey) $('#tlKey').click();
    else if (e.key === ',' || e.key === '<') e.shiftKey ? jump(-1) : setFrame(ANIM.f - 1);
    else if (e.key === '.' || e.key === '>') e.shiftKey ? jump(1) : setFrame(ANIM.f + 1);
    else if (k === 'pageup' && ANIM.cur > 0) enterShot(ANIM.cur - 1);
    else if (k === 'pagedown' && ANIM.cur < ANIM.shots.length - 1) enterShot(ANIM.cur + 1);
  });
}
// a cast member was removed from the scene: its track and lines go with it
function animCharRemoved(i) {
  if (ANIM.busy) return;  // a shot being entered brings its own cast
  for (const s of ANIM.shots) { if (s !== shot()) continue; s.keys.splice(i, 1); s.lines = s.lines.filter(l => l.c !== i).map(l => ({...l, c: l.c > i ? l.c - 1 : l.c})); }
  if (ANIM.open) { renderLabels(); drawTimeline(); }
}

/* ---------- export helpers (used by the Export window) ---------- */
// visit every frame of a shot (or the whole film) to render it; cb(shotIndex, frame) may be async
async function eachFrame(range, step, cb) {
  const list = range === 'movie' ? ANIM.shots.map((_, i) => i) : [ANIM.cur], back = {cur: ANIM.cur, f: ANIM.f};
  for (const i of list) {
    if (i !== ANIM.cur) await enterShot(i, 0);
    const s = shot(), frames = step === 'keys' ? [...new Set([0, ...s.keys.flat().map(k => k.f), ...s.cam.map(k => k.f), ...s.lines.map(l => l.f), s.len - 1])].sort((a, b) => a - b)
      : Array.from({length: Math.ceil(s.len / step)}, (_, k) => k * step);
    for (const f of frames) { setFrame(f); if (await cb(i, f, s) === false) return; }
  }
  if (back.cur !== ANIM.cur) await enterShot(back.cur, back.f); else setFrame(back.f);
}
// subtitles burnt into a rendered frame
function burnSubs(cv, f) {
  const L = subsAt(f); if (!L.length) return;
  const c = cv.getContext('2d'), k = cv.width / 900, fs = Math.max(14, Math.min(26 * k, cv.height * .042)); c.font = `600 ${fs}px ${css('--f-body')}`; c.textAlign = 'center';
  // each line broken into rows that fit 86% of the width, the last row of the last line nearest the bottom
  const max = cv.width * .86, rows = [];
  for (const l of L) { let row = ''; for (const w of `${speaker(l.c)}: ${l.text}`.split(/\s+/)) { const t = row ? row + ' ' + w : w; if (row && c.measureText(t).width > max) { rows.push(row); row = w; } else row = t; } if (row) rows.push(row); }
  rows.forEach((txt, n) => { const y = cv.height - (rows.length - n) * fs * 1.5 - fs * .6, w = c.measureText(txt).width;
    c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(cv.width / 2 - w / 2 - fs * .5, y - fs * 1.05, w + fs, fs * 1.5); c.fillStyle = '#fff'; c.fillText(txt, cv.width / 2, y); });
}
// WebM of the shot or the film, recorded from the canvas while it plays
function recordVideo(range, onDone) {
  if (!canvas.captureStream || !window.MediaRecorder) { toast(tr('Este navegador no puede grabar vídeo.')); return onDone && onDone(); }
  // MP4 where the browser can make it (Photoshop and Clip Studio import it as a video layer), WebM otherwise
  const talk = VOICE.on && ANIM.shots.some(s => s.lines.some(l => l.text.trim()));
  const type = [...(talk ? ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus'] : []), 'video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t)), mp4 = /mp4/.test(type || '');
  const start = async () => {
    if (range === 'movie' && ANIM.cur !== 0) await enterShot(0, 0); else setFrame(0);
    const voice = talk ? voiceStream() : null, stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...(voice ? voice.getAudioTracks() : [])]), rec = new MediaRecorder(stream, type ? {mimeType: type, videoBitsPerSecond: 8e6} : {}), parts = [], hide = filmHide(), all = ANIM.all, loop = ANIM.loop;
    ANIM.all = range === 'movie'; ANIM.loop = false;
    // it plays in real time behind a window that shows how far it has got and can cancel
    const list = range === 'movie' ? ANIM.shots : [shot()], total = list.reduce((a, x) => a + x.len, 0), before = i => list.slice(0, i).reduce((a, x) => a + x.len, 0);
    let cancelled = false; const tick = setInterval(() => { const at = before(range === 'movie' ? ANIM.cur : 0) + ANIM.t; renderProgress(at / total, tr('Grabando en tiempo real: {a} de {b}', {a: mmss(at / ANIM.fps), b: mmss(total / ANIM.fps)}), canvas); }, 250);
    rec.ondataavailable = e => { if (e.data.size) parts.push(e.data); };
    rec.onstop = () => { clearInterval(tick); if (ANIM.playing) play(false); hide(); voiceStreamEnd(); ANIM.rec = null; ANIM.all = all; ANIM.loop = loop; stream.getTracks().forEach(t => t.stop()); renderWindow(false);
      if (cancelled) { toast(tr('Exportación cancelada.')); return onDone && onDone(); }
      new Blob(parts, {type: mp4 ? 'video/mp4' : 'video/webm'}).arrayBuffer().then(b => { saveFile(`animacion-${stamp()}.${mp4 ? 'mp4' : 'webm'}`, new Uint8Array(b), mp4 ? 'video/mp4' : 'video/webm'); onDone && onDone(); }); };
    ANIM.rec = {pause: () => rec.state === 'recording' && rec.pause(), resume: () => rec.state === 'paused' && rec.resume(), done: () => rec.stop(), cancel: () => { cancelled = true; rec.stop(); }};
    clearOnion(); renderWindow(true, tr('Grabando el vídeo')); rec.start(); play(true);
  };
  start();
}
// the active character's motion in this shot as BVH
function animBVH(m) {
  const one = exportBVH(m), head = one.slice(0, one.indexOf('MOTION')), i = chars.indexOf(m), saved = m.getPose(), s = shot(), lines = [];
  for (let f = 0; f < s.len; f++) { const p = poseAt(i, f); if (p) m.setPose(p); m.group.updateMatrixWorld(true); const t = exportBVH(m); lines.push(t.slice(t.lastIndexOf('\n', t.length - 2) + 1).trim()); }
  m.setPose(saved); m.group.updateMatrixWorld(true);
  return `${head}MOTION\nFrames: ${s.len}\nFrame Time: ${(1 / ANIM.fps).toFixed(6)}\n${lines.join('\n')}\n`;
}

/* ---------- saved with the scene (thumbnails are remade) ---------- */
function animState() {
  if (!ANIM.shots.length) return null;
  if (ANIM.open) storeShot();
  const used = ANIM.shots.length > 1 || ANIM.shots.some(s => s.keys.some(K => K.length) || s.cam.length || s.lines.length);
  return used ? {v: 2, fps: ANIM.fps, cur: ANIM.cur, shots: ANIM.shots.map(({thumb, ...s}) => s)} : null;
}
function applyAnimState(a) {
  if (!a) return;
  if (!a.v) { // the first timeline (1.3 previews): one track holding every character
    const s = newShot(); s.len = a.len || 48; s.keys = chars.map((_, i) => (a.keys || []).filter(k => k.poses && k.poses[i]).map(k => ({f: k.f, pose: k.poses[i]})));
    ANIM.fps = a.fps || 12; ANIM.shots = [s]; ANIM.cur = 0;
  } else { ANIM.fps = a.fps || 12; ANIM.shots = a.shots.map(s => ({...s, id: ++shotSeq, thumb: ''})); ANIM.cur = Math.min(a.cur || 0, ANIM.shots.length - 1); }
  if (ANIM.open) { const i = ANIM.cur; ANIM.cur = -1; enterShot(i); }
}
// undo and redo also cover the tracks of the current shot
const animHist = () => ANIM.open && shot() ? {i: ANIM.cur, len: shot().len, keys: shot().keys, cam: shot().cam, lines: shot().lines} : undefined;
function animHistRestore(h) { TL.sel.clear(); syncSelBar(); const s = ANIM.shots[h.i]; if (!s || h.i !== ANIM.cur) return; Object.assign(s, JSON.parse(JSON.stringify({len: h.len, keys: h.keys, cam: h.cam, lines: h.lines}))); chars.forEach(m => { m._prevPose = m.getPose(); }); drawTimeline(); updateOnion(); }
