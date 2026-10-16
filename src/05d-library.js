/* ---------- pose library with silhouettes ---------- */
let thumbR, thumbScene, thumbCam, thumbChars = [];
const thumbs = new Map(); let thumbQueue = [];
function initThumbs() {
  try {
    thumbR = new THREE.WebGLRenderer({antialias: true, alpha: true, preserveDrawingBuffer: true});
    thumbR.setPixelRatio(2); thumbR.setSize(96, 120); thumbR.setClearColor(0, 0);
    thumbScene = new THREE.Scene(); thumbCam = new THREE.PerspectiveCamera(28, 96 / 120, .05, 80);
    const white = new THREE.MeshBasicMaterial({color: 0xffffff});
    thumbChars = ['hombre', 'mujer', 'hombre', 'mujer'].map(id => { const m = new Mannequin({sil: white}, 'sil'); m.build(bodyOf(id)); thumbScene.add(m.group); return m; });
  } catch (e) { thumbR = null; }
}
function renderThumb(def) {
  if (!thumbR) return null;
  const n = def.n || 1;
  thumbChars.forEach((m, i) => m.group.visible = i < n);
  if (n === 1) { const m = thumbChars[0]; m.joints.hips.position.set(0, m.rootY, 0); applyPreset(m, def); }
  else applyGroupTo(thumbChars, def);
  for (let i = 0; i < n; i++) applyMuscles(thumbChars[i], 1);
  const box = new THREE.Box3(); for (let i = 0; i < n; i++) box.union(thumbChars[i].box(12));
  const c = box.getCenter(new V3()), size = box.getSize(new V3());
  const r = Math.max(size.y, size.x * 1.25, size.z * 1.1) * .5;
  const d = r / Math.tan(thumbCam.fov * DEG / 2) * (n === 1 ? 1.12 : 1.4);
  const a = n === 1 ? 32 * DEG + thumbChars[0].yaw() : 18 * DEG, e = n === 1 ? 10 * DEG : 22 * DEG;
  thumbCam.position.set(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)).multiplyScalar(d).add(c);
  thumbCam.lookAt(c); thumbR.render(thumbScene, thumbCam);
  return thumbR.domElement.toDataURL('image/png');
}
function pumpThumbs() {
  const t0 = performance.now();
  while (thumbQueue.length && performance.now() - t0 < 30) {
    const [def, el] = thumbQueue.shift();
    let url = thumbs.get(def.id);
    if (!url) { url = renderThumb(def); if (url) thumbs.set(def.id, url); }
    if (url && el.isConnected) { el.classList.remove('pending'); el.style.setProperty('--m', `url(${url})`); }
  }
  if (thumbQueue.length) requestAnimationFrame(pumpThumbs);
}
function poseCard(label, onClick, thumb, onDel, img) {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'pose';
  const th = document.createElement(img ? 'img' : 'div'); th.className = 'th' + (img ? ' img' : thumb ? '' : ' pending');
  if (img) { th.src = img; th.alt = ''; } else if (thumb) th.style.setProperty('--m', `url(${thumb})`);
  const sp = document.createElement('span'); sp.textContent = label;
  b.append(th, sp); b.onclick = onClick;
  if (!onDel) return b;
  // the × beside the card, not inside it: a button in a button is neither valid nor reachable by keyboard
  const w = document.createElement('div'); w.className = 'pose-wrap';
  const x = document.createElement('button'); x.type = 'button'; x.className = 'del'; x.textContent = '×'; x.title = tr('Borrar'); x.setAttribute('aria-label', tr('Borrar {x}', {x: label})); x.onclick = onDel;
  w.append(b, x); return w;
}
function markPose() { $$('#poseGrid .pose').forEach(el => el.classList.toggle('on', el.dataset.id === state.posePreset)); }
function buildPoseGrid() {
  const g = $('#poseGrid'); g.innerHTML = '';
  chips($('#castChips'), [1, 2, 3, 4].map(n => [n, String(n)]), state.castN, v => { state.castN = +v; buildPoseGrid(); });
  $('#catChips').hidden = state.castN !== 1;
  chips($('#catChips'), Object.entries(POSE_CATS), state.cat, v => { state.cat = v; buildPoseGrid(); });
  const norm = t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(), q = norm($('#poseSearch').value.trim());
  const list = (state.castN === 1 ? POSES.filter(p => state.cat === 'todas' || p.cat === state.cat) : GROUP_POSES[state.castN]).filter(p => !q || q.split(/\s+/).every(w => norm(p.label + ' ' + (p.find || '')).includes(w)));
  $('#poseCount').textContent = tr('{n} poses', {n: list.length});
  if (!list.length) g.innerHTML = `<p class="empty">${tr('Ninguna pose coincide con la búsqueda.')}</p>`;
  thumbQueue = [];
  for (const p of list) {
    const el = poseCard(p.label, () => withGlide(() => state.castN === 1 ? usePreset(p) : useGroup(p)), thumbs.get(p.id));
    el.dataset.id = p.id; g.appendChild(el);
    if (!thumbs.has(p.id)) thumbQueue.push([p, el.querySelector('.th')]);
  }
  markPose();
  if (thumbQueue.length) requestAnimationFrame(pumpThumbs);
}
let myPoses = store.get('cdp.scenes', []);
function buildMyPoses() {
  const g = $('#myPoses'); g.innerHTML = '';
  $('#myEmpty').hidden = myPoses.length > 0;
  myPoses.forEach((p, i) => g.appendChild(poseCard(p.name, () => { restore(p.snap); frameAll(); pushHistory(); }, null,
    () => { myPoses.splice(i, 1); store.set('cdp.scenes', myPoses); buildMyPoses(); $('#myPoses .del')?.focus();
      toast(tr('Escena «{x}» borrada', {x: p.name}), {undo: () => { myPoses.splice(i, 0, p); store.set('cdp.scenes', myPoses); buildMyPoses(); }}); }, p.img)));
}
function viewSnapshot() {
  frame();
  const src = renderer.domElement, c = document.createElement('canvas'); c.width = 192; c.height = 240;
  const k = Math.max(192 / src.width, 240 / src.height), w = src.width * k, h = src.height * k;
  c.getContext('2d').drawImage(src, (192 - w) / 2, (240 - h) / 2, w, h);
  return c.toDataURL('image/jpeg', .8);
}
$('#saveForm').onsubmit = e => {
  e.preventDefault();
  const name = $('#poseName').value.trim() || tr('Escena {n}', {n: myPoses.length + 1});
  myPoses.unshift({name, snap: {...snapshot(), ...sceneExtras(true)}, img: viewSnapshot()});
  if (!store.set('cdp.scenes', myPoses)) $('#myEmpty').textContent = tr('Este navegador no deja guardar datos; solo durará esta sesión.');
  $('#poseName').value = ''; buildMyPoses();
};

/* tools */
function mirrorPose() {
  const p = mq.getPose(), out = {q: {}, pos: [-p.pos[0], p.pos[1], p.pos[2]], hands: {L: p.hands.R, R: p.hands.L}};
  for (const n of JOINTS) { const [x, y, z, w] = p.q[n]; out.q[swapSide(n)] = [x, -y, -z, w]; }
  mq.setPose(out); syncAll(); pushHistory();
}
$('#mirrorBtn').onclick = mirrorPose;
$('#groundBtn').onclick = () => { mq.ground(); pushHistory(); };
$('#resetBtn').onclick = () => usePreset(POSE.pie);
$('#stoolChk').onchange = e => { mq.stool = e.target.checked; pushHistory(); };
$('#undo').onclick = undo; $('#redo').onclick = redo;
$('#jointClose').onclick = () => select(null);
function syncAll() { refreshPins(mq); syncPinUI(); syncJointSliders(); syncHandUI(); syncBodyUI(); if (typeof renderAvatarUI === 'function') renderAvatarUI(); $('#stoolChk').checked = mq.stool; if (typeof renderGarmentList === 'function') { renderGarmentList(); renderLibrary(); } }
