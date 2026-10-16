/* ======================= pose from a photo =======================
   BlazePose GHUM 3D (MediaPipe, Apache-2.0) on TensorFlow.js finds 33 body points in 3D in a photo, on this device,
   offline. The active character takes that pose: pelvis and chest from the hip and shoulder lines, the head from
   the ears and nose, each limb aimed bone by bone, elbows and knees bent by the measured angle and turned so the
   forearm and shin point where the photo says. The photo can stay over the canvas as a reference. */
const PHOTO = {det: null, loading: null, img: null};
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error(src)); document.head.appendChild(s); }); }
function poseDetector() {
  if (!PHOTO.loading) PHOTO.loading = (async () => {
    for (const f of ['tf-core.min.js', 'tf-converter.min.js', 'tf-backend-webgl.min.js', 'pose-detection.min.js']) await loadScript('vendor/pose/' + f);
    await tf.setBackend('webgl'); await tf.ready();
    PHOTO.det = await poseDetection.createDetector(poseDetection.SupportedModels.BlazePose, {runtime: 'tfjs', modelType: 'full', enableSmoothing: false,
      detectorModelUrl: 'vendor/pose/detector/model.json', landmarkModelUrl: 'vendor/pose/landmark/model.json'});
    return PHOTO.det;
  })().catch(e => { PHOTO.loading = null; throw e; });
  return PHOTO.loading;
}
const photoMsg = t => { const el = $('#photoMsg'); if (el) el.textContent = t; };
async function poseFromImage(img) {
  photoMsg(tr('Cargando el detector de poses…'));
  const det = await poseDetector();
  photoMsg(tr('Buscando a la persona…'));
  const poses = await det.estimatePoses(img, {flipHorizontal: false});
  const p = poses && poses[0];
  if (!p || !p.keypoints3D || (p.score != null && p.score < .3)) { photoMsg(tr('No he encontrado a ninguna persona en la foto. Prueba con otra en la que se vea entera.')); return null; }
  return p;
}

/* ---------- retargeting ---------- */
const _q1 = new Q(), _q2 = new Q();
// turn bone P (in world space) so that the world vector cur becomes the direction want
function turnBone(m, P, cur, want) {
  if (cur.lengthSq() < 1e-10 || want.lengthSq() < 1e-10) return;
  const d = new Q().setFromUnitVectors(cur.clone().normalize(), want.clone().normalize());
  const pw = P.getWorldQuaternion(new Q()), parW = P.parent.getWorldQuaternion(new Q());
  P.quaternion.copy(parW.invert().multiply(d.multiply(pw))); m.group.updateMatrixWorld(true);
}
const wposOf = o => o.getWorldPosition(new V3());
// a basis (x left, y up, z forward) as a world rotation
function basisQ(left, up) {
  const x = left.clone().normalize(), y = up.clone().addScaledVector(x, -up.dot(x)).normalize(), z = new V3().crossVectors(x, y);
  return new Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}
function setWorldQ(m, P, qw) { const parW = P.parent.getWorldQuaternion(new Q()); P.quaternion.copy(parW.invert().multiply(qw)); m.group.updateMatrixWorld(true); }
function applyPhotoPose(m, pose) {
  const K = {}; for (const k of pose.keypoints3D) K[k.name] = {v: new V3(k.x, -k.y, -k.z), s: k.score ?? 1};
  const v = n => K[n].v.clone(), ok = (...n) => n.every(x => K[x] && K[x].s > .35), mid = (a, b) => v(a).add(v(b)).multiplyScalar(.5);
  const J = m.joints, keep = J.hips.position.clone();
  for (const n of JOINTS) J[n].quaternion.identity();
  m.group.updateMatrixWorld(true);
  // pelvis and trunk
  const hipL = v('left_hip').sub(v('right_hip')), shL = v('left_shoulder').sub(v('right_shoulder')), up = mid('left_shoulder', 'right_shoulder').sub(mid('left_hip', 'right_hip'));
  const qh = basisQ(hipL, up); setWorldQ(m, J.hips, qh);
  const qc = basisQ(shL, up), dl = qh.clone().invert().multiply(qc), half = new Q().slerp(dl, .5);
  J.waist.quaternion.copy(half); J.chest.quaternion.copy(half); m.group.updateMatrixWorld(true);
  // head: ears give the side, the nose the front
  if (ok('left_ear', 'right_ear', 'nose')) {
    const earL = v('left_ear').sub(v('right_ear')), fwd = v('nose').sub(mid('left_ear', 'right_ear')), hup = new V3().crossVectors(fwd, earL).normalize();
    const qhd = basisQ(earL, hup), cw = J.chest.getWorldQuaternion(new Q()), d = cw.clone().invert().multiply(qhd);
    J.neck.quaternion.copy(new Q().slerp(d, .4)); J.head.quaternion.copy(J.neck.quaternion.clone().invert().multiply(d)); m.group.updateMatrixWorld(true);
  }
  // limbs: aim the upper bone, bend the hinge by the measured angle, turn about the upper bone so the lower one points right
  const limb = (a, b, c, ja, jb, jc, sign) => {
    if (!ok(a, b, c)) return;
    const d1 = v(b).sub(v(a)), d2 = v(c).sub(v(b));
    turnBone(m, J[ja], wposOf(J[jb]).sub(wposOf(J[ja])), d1);
    const ang = d1.angleTo(d2), H = HINGE[jb];
    J[jb].rotation.set(clamp(sign * ang, H[0] * DEG, H[1] * DEG), 0, 0, 'XYZ'); m.group.updateMatrixWorld(true);
    const ax = d1.clone().normalize(), cur = wposOf(J[jc]).sub(wposOf(J[jb])), pc = cur.addScaledVector(ax, -cur.dot(ax)), pw = d2.clone().addScaledVector(ax, -d2.dot(ax));
    if (pc.lengthSq() > 1e-8 && pw.lengthSq() > 1e-8) {
      let t = pc.angleTo(pw); if (new V3().crossVectors(pc, pw).dot(ax) < 0) t = -t;
      const pwq = J[ja].getWorldQuaternion(new Q()); setWorldQ(m, J[ja], new Q().setFromAxisAngle(ax, t).multiply(pwq));
    }
  };
  for (const [s, side] of [['L', 'left'], ['R', 'right']]) {
    limb(`${side}_shoulder`, `${side}_elbow`, `${side}_wrist`, 'shoulder' + s, 'elbow' + s, 'wrist' + s, -1);
    limb(`${side}_hip`, `${side}_knee`, `${side}_ankle`, 'hip' + s, 'knee' + s, 'ankle' + s, 1);
    // hand towards the knuckles, foot from heel to toes
    if (ok(`${side}_wrist`, `${side}_index`, `${side}_pinky`)) {
      const w = J['wrist' + s], tip = mid(`${side}_index`, `${side}_pinky`).sub(v(`${side}_wrist`)), f = m.fingers[s][2][0];
      turnBone(m, w, wposOf(f).sub(wposOf(w)), tip);
    }
    if (ok(`${side}_heel`, `${side}_foot_index`)) {
      const a = J['ankle' + s], i = FIG.jIdx['ankle' + s], t = FIG.jIdx['toe' + s], T = m.J;
      const toe = a.localToWorld(new V3(T[t * 3] - T[i * 3], T[t * 3 + 1] - T[i * 3 + 1], T[t * 3 + 2] - T[i * 3 + 2]));
      turnBone(m, a, toe.sub(wposOf(a)), v(`${side}_foot_index`).sub(v(`${side}_heel`)));
    }
  }
  m.hands = {L: gest('relajada'), R: gest('relajada')}; m.applyHands();
  J.hips.position.copy(keep); m.group.updateMatrixWorld(true); m.ground();
}

/* ---------- the photo: preview with its points, reference over the canvas ---------- */
const BP_LINKS = [['left_shoulder', 'right_shoulder'], ['left_hip', 'right_hip'], ['left_shoulder', 'left_hip'], ['right_shoulder', 'right_hip'], ['left_shoulder', 'left_elbow'], ['left_elbow', 'left_wrist'],
  ['right_shoulder', 'right_elbow'], ['right_elbow', 'right_wrist'], ['left_hip', 'left_knee'], ['left_knee', 'left_ankle'], ['right_hip', 'right_knee'], ['right_knee', 'right_ankle'],
  ['left_ankle', 'left_foot_index'], ['right_ankle', 'right_foot_index'], ['left_ear', 'nose'], ['right_ear', 'nose']];
function drawPhotoPreview(img, pose) {
  const cv = $('#photoCv'), w = Math.min(560, img.naturalWidth), h = Math.round(w * img.naturalHeight / img.naturalWidth), s = w / img.naturalWidth;
  cv.width = w; cv.height = h; const c = cv.getContext('2d'); c.drawImage(img, 0, 0, w, h);
  if (pose) {
    const P = {}; for (const k of pose.keypoints) P[k.name] = k;
    c.lineWidth = 3; c.lineCap = 'round';
    for (const [a, b] of BP_LINKS) { const A = P[a], B = P[b]; if (!A || !B || A.score < .35 || B.score < .35) continue; c.strokeStyle = a.startsWith('left') ? '#2b5a9e' : a.startsWith('right') ? '#b0432c' : '#f2ede1'; c.beginPath(); c.moveTo(A.x * s, A.y * s); c.lineTo(B.x * s, B.y * s); c.stroke(); }
  }
  $('#photoPrev').hidden = false;
}
function showPhotoRef() {
  const el = $('#photoOverlay'), on = $('#photoRef').checked && PHOTO.img;
  el.hidden = !on; if (on) { el.src = PHOTO.img.src; el.style.opacity = PHOTO.alpha ?? .4; }
}
async function usePhoto(file) {
  if (!file || !/^image\//.test(file.type)) return;
  const img = new Image(); img.src = URL.createObjectURL(file);
  try { await img.decode(); } catch (_) { return photoMsg(tr('No se ha podido abrir la imagen.')); }
  PHOTO.img = img; drawPhotoPreview(img, null);
  $('#photoPick').disabled = true;
  try {
    const pose = await poseFromImage(img);
    if (pose) {
      drawPhotoPreview(img, pose); applyPhotoPose(mq, pose); state.posePreset = null; markPose();
      // look at the character from where the photo was taken
      const c = mq.joints.chest.getWorldPosition(new V3()); controls.target.copy(c); camera.position.set(c.x, c.y, c.z + 3.2 * mq.size); setRoll(0); controls.update();
      syncAll(); pushHistory(); photoMsg(tr('Pose aplicada al personaje {n}. Ajústala a mano si hace falta.', {n: active + 1}));
      showPhotoRef();
    }
  } catch (e) { console.warn('photo', e); photoMsg(tr('El detector no ha podido funcionar aquí ({e}).', {e: e && e.message || e})); }
  $('#photoPick').disabled = false;
}
// one photo: its pose; several pictures, a video or a storyboard sheet: an animation (see 27-board.js)
async function photoOrBoard(files) {
  if (!files.length) return;
  if (files.length > 1 || /^video\//.test(files[0].type) || await isStoryboard(files[0])) return openBoard(files);
  showTab('pose'); const d = $('[data-sec=foto]'); if (d) d.open = true; usePhoto(files[0]);
}
function buildPhotoUI() {
  $('#photoPick').onclick = () => $('#photoFile').click();
  $('#photoFile').onchange = e => { photoOrBoard([...e.target.files]); e.target.value = ''; };
  $('#photoRef').onchange = showPhotoRef;
  slider($('#photoAlphaBox'), {id: 'photoAlpha', label: 'Transparencia de la foto', min: .1, max: .9, step: .05, value: .4, fmt: pctFmt, input: v => { PHOTO.alpha = v; $('#photoOverlay').style.opacity = v; }});
  vp.addEventListener('drop', e => { const f = [...e.dataTransfer.files].filter(f => /^(image|video)\//.test(f.type)); if (f.length) { e.preventDefault(); photoOrBoard(f); } });
}
