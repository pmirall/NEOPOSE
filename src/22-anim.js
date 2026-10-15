/* ======================= animation =======================
   A timeline under the canvas: keys hold the pose of every character at a frame; between keys the poses are blended
   (joints turn along the shortest way, eased). Auto-key stores what you pose at the current frame. Onion skin shows
   the keys before and after as ghosts. Playback loops; the animation exports as WebM video or as a BVH of the
   active character, and is saved with the scene. */
const ANIM = {open: false, fps: 12, len: 48, f: 0, keys: [], playing: false, t: 0, auto: true, onion: true, ease: true, loop: true, ghosts: []};
const keyAt = f => ANIM.keys.find(k => k.f === f);
const snapPoses = () => chars.map(m => m.getPose());
function sortKeys() { ANIM.keys.sort((a, b) => a.f - b.f); }
// the poses at frame f (a fraction is fine): blend of the surrounding keys
function posesAt(f) {
  const K = ANIM.keys; if (!K.length) return null;
  if (f <= K[0].f) return K[0].poses; if (f >= K[K.length - 1].f) return K[K.length - 1].poses;
  let i = 0; while (K[i + 1].f < f) i++;
  const a = K[i], b = K[i + 1]; let t = (f - a.f) / (b.f - a.f); if (ANIM.ease) t = t * t * (3 - 2 * t);
  return chars.map((_, c) => a.poses[c] && b.poses[c] ? mixPose(a.poses[c], b.poses[c], t) : (a.poses[c] || b.poses[c]));
}
function applyFrame(f) {
  const P = posesAt(f); if (!P) return;
  chars.forEach((m, i) => { if (P[i]) m.setPose(P[i]); });
}
function setFrame(f, apply = true) {
  ANIM.f = clamp(Math.round(f), 0, ANIM.len - 1); ANIM.t = ANIM.f;
  if (apply) { applyFrame(ANIM.f); syncJointSliders(); syncHandUI(); refreshPins(mq); }
  drawTimeline(); updateOnion();
}
function setKey(f = ANIM.f) {
  const k = keyAt(f); if (k) k.poses = snapPoses(); else { ANIM.keys.push({f, poses: snapPoses()}); sortKeys(); }
  drawTimeline(); updateOnion();
}
function deleteKey(f = ANIM.f) { ANIM.keys = ANIM.keys.filter(k => k.f !== f); drawTimeline(); updateOnion(); }
// auto-key: an edit at the current frame becomes (or updates) its key
function animAutoKey() {
  if (!ANIM.open || !ANIM.auto || ANIM.playing || animAutoKey.busy) return;
  const cur = JSON.stringify(snapPoses().map(p => p.q)), at = posesAt(ANIM.f);
  if (at && JSON.stringify(at.map(p => p && p.q)) === cur && !keyAt(ANIM.f)) return;
  setKey();
}
function play(on) {
  ANIM.playing = on; if (on && ANIM.f >= ANIM.len - 1) ANIM.t = 0;
  $('#tlPlay').setAttribute('aria-pressed', String(on)); $('#tlPlay').innerHTML = on ? ICON_PAUSE : ICON_PLAY; $('#tlPlay').title = tr(on ? 'Pausa (espacio)' : 'Reproducir (espacio)');
  if (on) clearOnion(); else { setFrame(ANIM.t); }
}
let animLast = 0;
function animTick() {
  const now = performance.now(), dt = Math.min(.1, (now - animLast) / 1000); animLast = now;
  if (!ANIM.playing) return;
  ANIM.t += dt * ANIM.fps;
  if (ANIM.t >= ANIM.len - 1) { if (ANIM.loop && !ANIM.rec) ANIM.t = 0; else { ANIM.t = ANIM.len - 1; play(false); if (ANIM.rec) ANIM.rec.stop(); return; } }
  applyFrame(ANIM.t); ANIM.f = Math.floor(ANIM.t); drawTimeline();
}

/* ---------- onion skin ---------- */
function clearOnion() { for (const g of ANIM.ghosts) { scene.remove(g); g.geometry.dispose(); } ANIM.ghosts = []; }
function ghostOf(m, pose, color) {
  const saved = m.getPose(); m.setPose(pose); m.group.updateMatrixWorld(true);
  const b = m.body3, p = b.geometry.attributes.position, arr = new Float32Array(p.count * 3), v = new V3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); b.boneTransform(i, v); v.applyMatrix4(b.matrixWorld); arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z; }
  m.setPose(saved); m.group.updateMatrixWorld(true);
  const g = new THREE.BufferGeometry(); g.setIndex(b.geometry.index); g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({color, transparent: true, opacity: .16, depthWrite: false})); mesh.renderOrder = 4; mesh.raycast = () => {};
  return mesh;
}
function updateOnion() {
  clearOnion();
  if (!ANIM.open || !ANIM.onion || ANIM.playing || ANIM.keys.length < 2) return;
  const prev = [...ANIM.keys].reverse().find(k => k.f < ANIM.f), next = ANIM.keys.find(k => k.f > ANIM.f), i = chars.indexOf(mq);
  for (const [k, c] of [[prev, 0x2b5a9e], [next, 0xb0432c]]) if (k && k.poses[i]) { const g = ghostOf(mq, k.poses[i], c); scene.add(g); ANIM.ghosts.push(g); }
}

/* ---------- the timeline bar ---------- */
const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';
function trackX(f) { const c = $('#tlTrack'), pad = 10; return pad + f / Math.max(1, ANIM.len - 1) * (c.clientWidth - pad * 2); }
function trackF(x) { const c = $('#tlTrack'), pad = 10; return (x - pad) / Math.max(1, c.clientWidth - pad * 2) * (ANIM.len - 1); }
function drawTimeline() {
  const cv = $('#tlTrack'); if (!cv || !ANIM.open) return;
  const pr = Math.min(devicePixelRatio, 2), w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * pr) || cv.height !== Math.round(h * pr)) { cv.width = Math.round(w * pr); cv.height = Math.round(h * pr); }
  const c = cv.getContext('2d'); c.setTransform(pr, 0, 0, pr, 0, 0); c.clearRect(0, 0, w, h);
  const ink = css('--ink'), soft = css('--ink-soft'), line = css('--line'), red = css('--red'), blue = css('--blue');
  // frame ticks, a longer one every second
  for (let f = 0; f < ANIM.len; f++) { const x = trackX(f), sec = f % ANIM.fps === 0; c.strokeStyle = sec ? soft : line; c.lineWidth = 1; c.beginPath(); c.moveTo(x, h - (sec ? 14 : 8)); c.lineTo(x, h - 2); c.stroke();
    if (sec) { c.fillStyle = soft; c.font = `10px ${css('--f-mono')}`; c.textAlign = 'center'; c.fillText(String(f / ANIM.fps) + 's', x, 10); } }
  // keys: diamonds
  for (const k of ANIM.keys) { const x = trackX(k.f), y = h / 2 + 1, r = 6; c.fillStyle = k.f === ANIM.f ? red : ink; c.beginPath(); c.moveTo(x, y - r); c.lineTo(x + r, y); c.lineTo(x, y + r); c.lineTo(x - r, y); c.closePath(); c.fill(); }
  // playhead
  const x = trackX(ANIM.playing ? ANIM.t : ANIM.f); c.strokeStyle = blue; c.lineWidth = 2; c.beginPath(); c.moveTo(x, 12); c.lineTo(x, h); c.stroke();
  c.fillStyle = blue; c.beginPath(); c.moveTo(x - 5, 12); c.lineTo(x + 5, 12); c.lineTo(x, 18); c.fill();
  $('#tlFrame').textContent = `${(ANIM.playing ? Math.floor(ANIM.t) : ANIM.f) + 1} / ${ANIM.len}`;
  const k = keyAt(ANIM.f); $('#tlKey').setAttribute('aria-pressed', String(!!k)); $('#tlKey').title = tr(k ? 'Quitar la clave de este fotograma (K)' : 'Guardar la pose en este fotograma (K)');
}
function openTimeline(on) {
  ANIM.open = on; $('#timeline').hidden = !on; $('#animBtn').setAttribute('aria-pressed', String(on)); document.body.classList.toggle('anim', on);
  if (on && !ANIM.keys.length) setKey(0);
  if (on) tourEvent('anim');
  if (!on) { play(false); clearOnion(); }
  else { drawTimeline(); updateOnion(); }
}
function buildAnimUI() {
  $('#animBtn').onclick = () => openTimeline(!ANIM.open);
  $('#tlClose').onclick = () => openTimeline(false);
  $('#tlPlay').innerHTML = ICON_PLAY; $('#tlPlay').onclick = () => play(!ANIM.playing);
  $('#tlKey').onclick = () => { if (keyAt(ANIM.f)) deleteKey(); else setKey(); };
  const jump = d => { const K = ANIM.keys.map(k => k.f); const t = d < 0 ? [...K].reverse().find(f => f < ANIM.f) : K.find(f => f > ANIM.f); if (t != null) setFrame(t); };
  $('#tlPrev').onclick = () => jump(-1); $('#tlNext').onclick = () => jump(1);
  // track: scrub, or drag a key to another frame
  const cv = $('#tlTrack'); let drag = null;
  cv.addEventListener('pointerdown', e => {
    if (ANIM.playing) play(false);
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, k = ANIM.keys.find(k => Math.abs(trackX(k.f) - x) < 8);
    drag = k ? {key: k, moved: false} : {scrub: true}; try { cv.setPointerCapture(e.pointerId); } catch (_) {}
    if (!k) setFrame(trackF(x)); else setFrame(k.f);
  });
  cv.addEventListener('pointermove', e => {
    if (!drag) return; const r = cv.getBoundingClientRect(), f = clamp(Math.round(trackF(e.clientX - r.left)), 0, ANIM.len - 1);
    if (drag.scrub) { if (f !== ANIM.f) setFrame(f); return; }
    if (f !== drag.key.f && !keyAt(f)) { drag.key.f = f; drag.moved = true; sortKeys(); setFrame(f, false); }
  });
  const up = () => { if (drag && drag.moved) setFrame(drag.key.f); drag = null; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  new ResizeObserver(drawTimeline).observe(cv);
  // options
  chips($('#tlFps'), [['8', '8'], ['12', '12'], ['24', '24']], String(ANIM.fps), v => { const s = ANIM.len / ANIM.fps; ANIM.fps = +v; ANIM.len = Math.max(2, Math.round(s * ANIM.fps)); for (const k of ANIM.keys) k.f = Math.min(k.f, ANIM.len - 1); setFrame(ANIM.f); setPressed($('#tlFps'), v); });
  slider($('#tlLenBox'), {id: 'tlLen', label: 'Duración', min: 1, max: 20, step: .5, value: ANIM.len / ANIM.fps, fmt: v => dec(v) + ' s', input: v => { ANIM.len = Math.max(2, Math.round(v * ANIM.fps)); ANIM.keys = ANIM.keys.filter(k => k.f < ANIM.len); setFrame(Math.min(ANIM.f, ANIM.len - 1), false); }});
  const chk = (id, key, after) => { const el = $(id); el.checked = ANIM[key]; el.onchange = () => { ANIM[key] = el.checked; after && after(); }; };
  chk('#tlAuto', 'auto'); chk('#tlOnion', 'onion', updateOnion); chk('#tlEase', 'ease', () => setFrame(ANIM.f)); chk('#tlLoop', 'loop');
  $('#tlMore').onclick = () => { const p = $('#tlOpts'); p.hidden = !p.hidden; $('#tlMore').setAttribute('aria-expanded', String(!p.hidden)); };
  $('#tlVideo').onclick = recordVideo;
  $('#tlBvh').onclick = () => saveFile(`animacion-${stamp()}.bvh`, new TextEncoder().encode(animBVH(mq)), 'text/plain');
  addEventListener('keydown', e => {
    if (!ANIM.open || e.target.matches('input,textarea')) return;
    if (e.key === ' ') { e.preventDefault(); play(!ANIM.playing); }
    else if (e.key.toLowerCase() === 'k' && !e.ctrlKey && !e.metaKey) { $('#tlKey').click(); }
    else if (e.key === ',' || e.key === '<') setFrame(ANIM.f - 1);
    else if (e.key === '.' || e.key === '>') setFrame(ANIM.f + 1);
  });
}

/* ---------- export ---------- */
// WebM of one pass of the animation, recorded from the canvas as it plays
function recordVideo() {
  if (!canvas.captureStream || !window.MediaRecorder) return toast(tr('Este navegador no puede grabar vídeo.'));
  if (ANIM.keys.length < 2) return toast(tr('Pon al menos dos claves para grabar la animación.'));
  const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
  const stream = canvas.captureStream(30), rec = new MediaRecorder(stream, type ? {mimeType: type, videoBitsPerSecond: 8e6} : {}), parts = [];
  const hide = exportHide();
  rec.ondataavailable = e => { if (e.data.size) parts.push(e.data); };
  rec.onstop = () => { hide(); ANIM.rec = null; $('#tlVideo').disabled = false; stream.getTracks().forEach(t => t.stop());
    new Blob(parts, {type: 'video/webm'}).arrayBuffer().then(b => saveFile(`animacion-${stamp()}.webm`, new Uint8Array(b), 'video/webm')); };
  ANIM.rec = rec; $('#tlVideo').disabled = true; clearOnion();
  setFrame(0); rec.start(); animLast = performance.now(); ANIM.t = 0; ANIM.playing = true; $('#tlPlay').innerHTML = ICON_PAUSE;
  toast(tr('Grabando la animación…'));
}
// the active character's animation as BVH: the hierarchy once, a frame per animation frame
function animBVH(m) {
  const one = exportBVH(m), head = one.slice(0, one.indexOf('MOTION')), i = chars.indexOf(m), saved = m.getPose(), rows = [];
  const lines = [];
  for (let f = 0; f < ANIM.len; f++) { const P = posesAt(f); if (P && P[i]) m.setPose(P[i]); m.group.updateMatrixWorld(true); const t = exportBVH(m); lines.push(t.slice(t.lastIndexOf('\n', t.length - 2) + 1).trim()); }
  m.setPose(saved); m.group.updateMatrixWorld(true);
  return `${head}MOTION\nFrames: ${ANIM.len}\nFrame Time: ${(1 / ANIM.fps).toFixed(6)}\n${lines.join('\n')}\n`;
}
// saved with the scene
const animState = () => ANIM.keys.length > 1 ? {fps: ANIM.fps, len: ANIM.len, keys: ANIM.keys} : null;
function applyAnimState(a) { if (!a) return; ANIM.fps = a.fps || 12; ANIM.len = a.len || 48; ANIM.keys = a.keys || []; sortKeys(); if (ANIM.open) setFrame(0); }
