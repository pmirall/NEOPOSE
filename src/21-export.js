/* ======================= export, more kinds =======================
   Turnaround sheet: front, three-quarter, profile and back of the active character on one image, with head-height lines.
   AI maps: depth, normals, OpenPose skeleton (body and hands) and white-on-black lines, for ControlNet-style tools.
   3D: the posed scene as a GLB mesh, or the active character's skeleton and pose as BVH.
   Print sizes: A5, A4 or A3 at 300 ppi, with the resolution written into the PNG. */
const EXK = {kind: 'img', map: 'depth', views: 4, neutral: true, heads: true, hands: true, envInMap: false, fmt3d: 'glb', animWhat: 'frames', animRange: 'movie', animStep: '1', subs: true};
const PRINT = {a5: ['A5', 1748, 2480], a4: ['A4', 2480, 3508], a3: ['A3', 3508, 4961]};
const EX_KINDS = {img: 'Imagen', turn: 'Hoja de giro', maps: 'Mapas para IA', m3d: 'Modelo 3D', anim: 'Animación'};
const EX_ANIM = {frames: 'Fotogramas (PNG en ZIP)', video: 'Vídeo WebM', board: 'Guion gráfico', bvh: 'BVH del personaje activo'};
const EX_MAPS = {depth: 'Profundidad', normal: 'Normales', openpose: 'Esqueleto OpenPose', lineart: 'Líneas'};
const TURN_VIEWS = {4: [[0, 'Frente'], [45, 'Tres cuartos'], [90, 'Perfil'], [180, 'Espalda']], 8: [[0, 'Frente'], [45, 'Tres cuartos'], [90, 'Perfil'], [135, 'Tres cuartos de espalda'], [180, 'Espalda'], [225, 'Tres cuartos de espalda'], [270, 'Perfil'], [315, 'Tres cuartos']]};

/* ---------- shared: hide helpers, render at a scale, restore ---------- */
function exportHide() {
  const list = [...Object.values(handles), ...Object.values(jointDots), ...Object.values(pinRings), sunHandle, sunRing, ...extraLights.flatMap(g => g.children.filter(c => c.isMesh)), ...(ghostMesh ? [ghostMesh] : [])];
  const vis = list.map(o => o.visible), tcv = tc.visible; list.forEach(o => o.visible = false); tc.visible = false;
  return () => { list.forEach((o, i) => o.visible = vis[i]); tc.visible = tcv; };
}
function withPixelRatio(k, fn) {
  const pr = renderer.getPixelRatio(), lw = LU.uLineW.value, dpr = LU.uDpr.value;
  LU.uLineW.value = lw * k / pr; LU.uDpr.value = k; renderer.setPixelRatio(k); renderer.setSize(W, Hh, false);
  try { return fn(); } finally { renderer.setPixelRatio(pr); renderer.setSize(W, Hh, false); LU.uLineW.value = lw; LU.uDpr.value = dpr; }
}
function stageOnly(alpha) { // the characters (and props) alone, on paper or on nothing
  const s = {bg: scene.background, env: envGroup && envGroup.visible, grid: grid.visible, fog: scene.fog, sky: sky.visible, pano: panoSphere.visible};
  if (envGroup) envGroup.visible = false; grid.visible = false; sky.visible = false; panoSphere.visible = false; scene.fog = null;
  scene.background = alpha ? null : LU.uPaper.value.clone(); renderer.setClearColor(0, 0);
  return () => { scene.background = s.bg; if (envGroup) envGroup.visible = s.env; grid.visible = s.grid; scene.fog = s.fog; sky.visible = s.sky; panoSphere.visible = s.pano; };
}
// the scale for an image of the frame: 1×–3×, or a paper size at 300 ppi
function exportScale(f) {
  const p = PRINT[ex.size];
  if (!p) return +ex.size || 2;
  const portrait = f.h >= f.w, pw = portrait ? p[1] : p[2], ph = portrait ? p[2] : p[1];
  return Math.min(pw / f.w, ph / f.h, 8192 / Math.max(W, Hh));
}
// place an image on the paper (centred), so the PNG is exactly A5/A4/A3
function onPaper(src, alpha) {
  const p = PRINT[ex.size]; if (!p) return src;
  const portrait = src.height >= src.width, out = document.createElement('canvas');
  out.width = portrait ? p[1] : p[2]; out.height = portrait ? p[2] : p[1];
  const c = out.getContext('2d'); if (!alpha) { c.fillStyle = '#ffffff'; c.fillRect(0, 0, out.width, out.height); }
  const s = Math.min(out.width / src.width, out.height / src.height), w = src.width * s, h = src.height * s;
  c.drawImage(src, (out.width - w) / 2, (out.height - h) / 2, w, h);
  return out;
}

/* ---------- turnaround sheet ---------- */
function renderTurnaround() {
  const m = mq, alpha = ex.bg === 'alpha', lines = ex.bg === 'lines', views = TURN_VIEWS[EXK.views];
  const restoreHide = exportHide(), restoreStage = stageOnly(alpha || lines);
  const others = chars.filter(c => c !== m).map(c => [c, c.group.visible]); others.forEach(([c]) => c.group.visible = false);
  const pose = m.getPose();
  if (EXK.neutral) { const p = m.joints.hips.position.clone(), yaw = m.yaw(); m.joints.hips.position.set(p.x, m.rootY, p.z); applyPreset(m, POSE.pie, {yaw}); m.joints.hips.position.x = p.x; m.joints.hips.position.z = p.z; }
  if (lines) m.setStyle('contorno');
  const cam = {p: camera.position.clone(), q: camera.quaternion.clone(), fov: camera.fov, aspect: camera.aspect, t: controls.target.clone(), roll: state.roll};
  state.roll = 0;
  m.group.updateMatrixWorld(true);
  const box = m.box(4), c = box.getCenter(new V3()), hgt = box.max.y - box.min.y, yaw = m.yaw();
  const ph = Math.min(Hh, W) * .96, pw = Math.min(ph * .62, W / 2), fov = 10, d = (hgt * .56) / Math.tan(fov * DEG / 2);
  const k = Math.min(PRINT[ex.size] ? 2400 / ph : (+ex.size || 2), 8192 / Math.max(W, Hh));
  let headLines = null;
  const lab = 34, sheet = document.createElement('canvas'); sheet.width = Math.round(pw * k * views.length); sheet.height = Math.round((ph + lab) * k);
  const sc = sheet.getContext('2d');
  if (!alpha) { sc.fillStyle = '#' + LU.uPaper.value.getHexString(); sc.fillRect(0, 0, sheet.width, sheet.height); }
  withPixelRatio(k, () => {
    camera.fov = fov; camera.aspect = pw / ph; camera.updateProjectionMatrix();
    renderer.setScissorTest(true);
    views.forEach(([az, name], i) => {
      const a = yaw + az * DEG;
      camera.position.set(c.x + Math.sin(a) * d, c.y, c.z + Math.cos(a) * d); camera.up.set(0, 1, 0); camera.lookAt(c); camera.updateMatrixWorld(true);
      updateLights(); updateStools();
      renderer.setViewport(0, 0, pw, ph); renderer.setScissor(0, 0, pw, ph); renderer.render(scene, camera);
      sc.drawImage(renderer.domElement, 0, renderer.domElement.height - ph * k, pw * k, ph * k, i * pw * k, 0, pw * k, ph * k);
      if (i === 0 && EXK.heads) { const pm = camera.projectionMatrix.clone(), vm = camera.matrixWorldInverse.clone(); headLines = y => { const v = new V3(c.x, y, c.z).applyMatrix4(vm).applyMatrix4(pm); return (1 - v.y) / 2 * ph * k; }; }
    });
    renderer.setScissorTest(false);
    if (headLines) { // head-height lines across the whole sheet
        const yOf = headLines;
        sc.save(); sc.strokeStyle = 'rgba(43,90,158,.55)'; sc.fillStyle = 'rgba(43,90,158,.9)'; sc.lineWidth = Math.max(1, k * .8); sc.setLineDash([6 * k, 5 * k]); sc.font = `600 ${11 * k}px ${css('--f-mono')}`;
        const n = Math.ceil(hgt / m.headH - .02);
        for (let j = 0; j <= n; j++) { const y = yOf(box.min.y + j * m.headH); sc.beginPath(); sc.moveTo(0, y); sc.lineTo(sheet.width, y); sc.stroke(); if (j < n) sc.fillText(String(n - j), 4 * k, yOf(box.min.y + (j + .5) * m.headH) + 4 * k); }
        sc.restore();
    }
  });
  sc.fillStyle = css('--ink'); sc.font = `600 ${13 * k}px ${css('--f-hand')}`; sc.textAlign = 'center';
  views.forEach(([, name], i) => sc.fillText(tr(name), (i + .5) * pw * k, (ph + lab * .72) * k));
  if (lines) m.setStyle(state.style);
  m.setPose(pose); if (EXK.neutral) m.group.updateMatrixWorld(true);
  camera.position.copy(cam.p); camera.quaternion.copy(cam.q); camera.fov = cam.fov; camera.aspect = cam.aspect; camera.updateProjectionMatrix(); controls.target.copy(cam.t); state.roll = cam.roll; controls.update();
  others.forEach(([o, v]) => o.group.visible = v); restoreStage(); restoreHide(); updateLights();
  return lines ? inkOnly(sheet) : sheet;
}
// keep the ink of a line drawing: paper becomes transparent
function inkOnly(cv) {
  const c = cv.getContext('2d'), id = c.getImageData(0, 0, cv.width, cv.height), d = id.data;
  for (let i = 0; i < d.length; i += 4) { if (!d[i + 3]) continue; const L = (d[i] * .299 + d[i + 1] * .587 + d[i + 2] * .114) / 255, a = clamp((.93 - L) / .55, 0, 1); d[i + 3] = Math.round(d[i + 3] * a); d[i] *= .6; d[i + 1] *= .6; d[i + 2] *= .6; }
  c.putImageData(id, 0, 0); return cv;
}

/* ---------- AI maps ---------- */
const MAP_MATS = {};
function mapMaterial(kind, o) {
  const tex = o.userData.garment && o.userData.garment.d && o.userData.garment.d.alpha > .02 ? o.userData.garment.d.tex : null, key = kind + (tex ? tex.uuid : '');
  if (!MAP_MATS[key]) MAP_MATS[key] = kind === 'depth' ? new THREE.MeshDepthMaterial({depthPacking: THREE.BasicDepthPacking, map: tex, alphaTest: tex ? .5 : 0, side: THREE.DoubleSide})
    : new THREE.MeshNormalMaterial({side: THREE.DoubleSide, ...(tex ? {map: tex, alphaTest: .5} : {})});
  if (kind === 'normal' && tex) { MAP_MATS[key].onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n#ifdef USE_MAP\n if (texture2D(map, vUv).a < .5) discard;\n#endif'); }; }
  return MAP_MATS[key];
}
function renderMap(kind) {
  const f = frameRect(W, Hh), k = exportScale(f), restoreHide = exportHide();
  const s = {bg: scene.background, env: envGroup && envGroup.visible, grid: grid.visible, fog: scene.fog, sky: sky.visible, pano: panoSphere.visible, near: camera.near, far: camera.far};
  grid.visible = false; sky.visible = false; panoSphere.visible = false; scene.fog = null; if (envGroup) envGroup.visible = EXK.envInMap && kind !== 'openpose' && kind !== 'lineart';
  let out;
  if (kind === 'openpose') out = drawOpenPose(f, k);
  else if (kind === 'lineart') {
    scene.background = new THREE.Color(0xffffff); const st = state.style; for (const m of chars) m.setStyle('contorno'); const lr = LU.uRender.value, la = LU.uLineA.value; LU.uRender.value = 0; LU.uLineA.value = 0;  // outlines only, no rings
    out = withPixelRatio(k, () => { updateLights(); renderer.render(scene, camera); return crop(f, k); });
    for (const m of chars) m.setStyle(st); LU.uRender.value = lr; LU.uLineA.value = la;
    const c = out.getContext('2d'), id = c.getImageData(0, 0, out.width, out.height), d = id.data;  // white lines on black
    for (let i = 0; i < d.length; i += 4) { const L = (d[i] * .299 + d[i + 1] * .587 + d[i + 2] * .114) / 255, v = Math.round(clamp((.9 - L) / .6, 0, 1) * 255); d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
    c.putImageData(id, 0, 0);
  } else {
    // depth: near white, far black, stretched over the cast; normals: view space, flat blue background
    const box = castBox(); if (EXK.envInMap && envGroup) box.union(new THREE.Box3().setFromObject(envGroup).intersect(new THREE.Box3(new V3(-12, -1, -12), new V3(12, 6, 12))));
    const sph = box.getBoundingSphere(new THREE.Sphere()), dist = camera.position.distanceTo(sph.center);
    if (kind === 'depth') { camera.near = Math.max(.05, dist - sph.radius * 1.05); camera.far = dist + sph.radius * 1.05; camera.updateProjectionMatrix(); }
    scene.background = new THREE.Color(kind === 'depth' ? 0x000000 : 0x8080ff);
    const swaps = [];
    scene.traverseVisible(o => {
      if (!o.isMesh) return;
      if (o.userData.isHull || o.material === OUTLINE_MAT || (o.material && o.material.isShadowMaterial)) { swaps.push([o, null, true]); o.visible = false; return; }
      if (o === panoSphere || o === sky) return;
      swaps.push([o, o.material, false]); o.material = mapMaterial(kind, o);
    });
    out = withPixelRatio(k, () => { renderer.render(scene, camera); return crop(f, k); });
    for (const [o, mt, hid] of swaps) { if (hid) o.visible = true; else o.material = mt; }
    if (kind === 'depth') { // stretch what was drawn over the full range: nearest white, farthest dark grey
      const c = out.getContext('2d'), id = c.getImageData(0, 0, out.width, out.height), d = id.data; let lo = 255, hi = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] > 0) { if (d[i] < lo) lo = d[i]; if (d[i] > hi) hi = d[i]; }
      if (hi > lo) for (let i = 0; i < d.length; i += 4) if (d[i] > 0) { const v = 40 + (d[i] - lo) / (hi - lo) * 215; d[i] = d[i + 1] = d[i + 2] = v; }
      c.putImageData(id, 0, 0);
    }
    camera.near = s.near; camera.far = s.far; camera.updateProjectionMatrix();
  }
  scene.background = s.bg; if (envGroup) envGroup.visible = s.env; grid.visible = s.grid; scene.fog = s.fog; sky.visible = s.sky; panoSphere.visible = s.pano;
  restoreHide();
  return onPaper(out, false);
}
function crop(f, k) {
  const out = document.createElement('canvas'); out.width = Math.round(f.w * k); out.height = Math.round(f.h * k);
  out.getContext('2d').drawImage(renderer.domElement, f.x * k, f.y * k, f.w * k, f.h * k, 0, 0, out.width, out.height); return out;
}
// OpenPose (COCO 18 points) and the 21-point hands, in the standard colours, on black
const OP_LIMBS = [[1, 2], [1, 5], [2, 3], [3, 4], [5, 6], [6, 7], [1, 8], [8, 9], [9, 10], [1, 11], [11, 12], [12, 13], [1, 0], [0, 14], [14, 16], [0, 15], [15, 17]];
const OP_COLS = ['#ff0000', '#ff5500', '#ffaa00', '#ffff00', '#aaff00', '#55ff00', '#00ff00', '#00ff55', '#00ffaa', '#00ffff', '#00aaff', '#0055ff', '#0000ff', '#5500ff', '#aa00ff', '#ff00ff', '#ff00aa', '#ff0055'];
function headPoints(m) {
  // rest positions of the eyes, ears and nose on the head bone, carried by the head's skinning matrix
  if (!m._opRest || m._opRest.v !== m.J) {
    const P = m.geo.attributes.position.array, nV = FIG.meta.nV, hb = FIG.jIdx.head, eye = {L: [0, 0, 0, 0], R: [0, 0, 0, 0]};
    let nose = null, earL = null, earR = null; const hy = m.J[hb * 3 + 1];
    for (let i = 0; i < nV; i++) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      if (FIG.eye[i]) { const e = eye[x > 0 ? 'L' : 'R']; e[0] += x; e[1] += y; e[2] += z; e[3]++; continue; }
      if (m.dom[i] !== hb) continue;
      if (!nose || z > nose[2]) nose = [x, y, z];
      if (Math.abs(y - hy) < .03 * m.size) { if (!earL || x > earL[0]) earL = [x, y, z]; if (!earR || x < earR[0]) earR = [x, y, z]; }
    }
    const av = e => [e[0] / (e[3] || 1), e[1] / (e[3] || 1), e[2] / (e[3] || 1)];
    m._opRest = {v: m.J, nose, eyeL: av(eye.L), eyeR: av(eye.R), earL, earR};
  }
  const r = m._opRest, hb = FIG.jIdx.head, M = new THREE.Matrix4().multiplyMatrices(m.bones[hb].matrixWorld, m.skeleton.boneInverses[hb]);
  const t = a => new V3(...a).applyMatrix4(M);
  return {nose: t(r.nose), eyeL: t(r.eyeL), eyeR: t(r.eyeR), earL: t(r.earL), earR: t(r.earR)};
}
function drawOpenPose(f, k) {
  const out = document.createElement('canvas'); out.width = Math.round(f.w * k); out.height = Math.round(f.h * k);
  const c = out.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, out.width, out.height);
  const scr = v => { const p = v.clone().project(camera); return [((p.x + 1) / 2 * W - f.x) * k, ((1 - p.y) / 2 * Hh - f.y) * k, p.z < 1]; };
  const lw = Math.max(2, 4 * k * Math.min(out.width, out.height) / 1024 / k * 1.6);
  for (const m of chars) {
    if (!m.group.visible) continue;
    m.group.updateMatrixWorld(true);
    const j = n => m.joints[n].getWorldPosition(new V3()), h = headPoints(m), sh = [j('shoulderR'), j('shoulderL')];
    const pts = [h.nose, sh[0].clone().add(sh[1]).multiplyScalar(.5), j('shoulderR'), j('elbowR'), j('wristR'), j('shoulderL'), j('elbowL'), j('wristL'),
      j('hipR'), j('kneeR'), j('ankleR'), j('hipL'), j('kneeL'), j('ankleL'), h.eyeR, h.eyeL, h.earR, h.earL].map(scr);
    c.globalAlpha = .6; c.lineWidth = lw; c.lineCap = 'round';
    OP_LIMBS.forEach(([a, b], i) => { if (!pts[a][2] || !pts[b][2]) return; c.strokeStyle = OP_COLS[i]; c.beginPath(); c.moveTo(pts[a][0], pts[a][1]); c.lineTo(pts[b][0], pts[b][1]); c.stroke(); });
    c.globalAlpha = 1;
    pts.forEach((p, i) => { if (!p[2]) return; c.fillStyle = OP_COLS[i]; c.beginPath(); c.arc(p[0], p[1], lw * .9, 0, Math.PI * 2); c.fill(); });
    if (EXK.hands) for (const s of ['L', 'R']) {
      const F = m.fingers[s];
      const hp = [j('wrist' + s)];
      for (let fi = 0; fi < 5; fi++) { for (let q = 0; q < 3; q++) hp.push(F[fi][q].getWorldPosition(new V3())); hp.push(fingerTip(m, s, fi)); }
      const P2 = hp.map(scr);
      c.lineWidth = lw * .55;
      for (let fi = 0; fi < 5; fi++) for (let q = 0; q < 4; q++) {
        const a = q === 0 ? 0 : 1 + fi * 4 + q - 1, b = 1 + fi * 4 + q, col = new THREE.Color().setHSL((fi * 4 + q) / 20, 1, .5);
        c.strokeStyle = '#' + col.getHexString(); c.beginPath(); c.moveTo(P2[a][0], P2[a][1]); c.lineTo(P2[b][0], P2[b][1]); c.stroke();
      }
      P2.forEach(p => { c.fillStyle = '#0000ff'; c.beginPath(); c.arc(p[0], p[1], lw * .45, 0, Math.PI * 2); c.fill(); });
    }
  }
  return out;
}
// fingertip: the last phalanx carried a bone's length further along itself
function fingerTip(m, s, f) {
  const F = m.fingers[s], a = F[f][1].getWorldPosition(new V3()), b = F[f][2].getWorldPosition(new V3());
  const J = m.J, i2 = FIG.jIdx[`f${s}${f}2`], it = FIG.jIdx[`tip${s}${f}`];
  const len = Math.hypot(J[it * 3] - J[i2 * 3], J[it * 3 + 1] - J[i2 * 3 + 1], J[it * 3 + 2] - J[i2 * 3 + 2]);
  const dir = new V3(J[it * 3] - J[i2 * 3], J[it * 3 + 1] - J[i2 * 3 + 1], J[it * 3 + 2] - J[i2 * 3 + 2]).normalize().transformDirection(F[f][2].matrixWorld);
  return b.addScaledVector(dir, len);
}

/* ---------- 3D: posed meshes as GLB, skeleton and pose as BVH ---------- */
function bakedMesh(o) {
  // world-space positions and normals of a mesh as it is drawn (skinned meshes posed)
  const g = o.geometry, P = g.attributes.position, n = P.count, pos = new Float32Array(n * 3), v = new V3();
  o.updateMatrixWorld(true); if (o.isSkinnedMesh) o.skeleton.update();
  for (let i = 0; i < n; i++) { v.fromBufferAttribute(P, i); if (o.isSkinnedMesh) o.boneTransform(i, v); v.applyMatrix4(o.matrixWorld); pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z; }
  let idx = g.index ? Array.from(g.index.array) : null;
  const hide = g.attributes.aHide;
  if (idx && hide) { const H = hide.array, keep = []; for (let t = 0; t < idx.length; t += 3) if (H[idx[t]] < .999 || H[idx[t + 1]] < .999 || H[idx[t + 2]] < .999) keep.push(idx[t], idx[t + 1], idx[t + 2]); idx = keep; }
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); if (idx) bg.setIndex(idx); bg.computeVertexNormals();
  return bg;
}
function exportGLB() {
  const items = [];
  const add = (name, o, color) => { if (!o || !o.visible || !o.geometry || !o.geometry.attributes.position) return; items.push({name, geo: bakedMesh(o), color}); };
  chars.forEach((m, ci) => {
    if (!m.group.visible) return;
    const skin = new THREE.Color(0xcfc5b3);
    add(`personaje${ci + 1}`, m.body3, skin);
    for (const a of m.acc || []) if (!a.userData.hull && a.visible && a.isMesh) add(`personaje${ci + 1}_extra`, a, skin);
    for (const g of m.garments || []) if (g.meshes && g.meshes[0]) add(`personaje${ci + 1}_${g.hair ? 'pelo' : 'ropa'}`, g.meshes[0], new THREE.Color(g.spec.mode === 'tex' ? (g.d && g.d.avg ? `rgb(${g.d.avg.join(',')})` : '#888') : g.spec.colA));
    if (m.headSwap && m.headSwap.mesh) add(`personaje${ci + 1}_cabeza`, m.headSwap.mesh, skin);
  });
  for (const p of props) p.traverse(o => { if (o.isMesh && !o.userData.isHull && !o.isInstancedMesh) add('objeto', o, o.material && o.material.color ? o.material.color : new THREE.Color(0x999999)); });
  return glbBytes(items);
}
// a minimal glTF 2.0 binary: one buffer, positions + normals + indices per mesh, a plain colour material each
function glbBytes(items) {
  const chunks = [], views = [], accs = [], meshes = [], nodes = [], mats = []; let off = 0;
  const push = (arr, target) => { const b = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength); chunks.push(b); const pad = (4 - b.byteLength % 4) % 4; if (pad) chunks.push(new Uint8Array(pad)); views.push({buffer: 0, byteOffset: off, byteLength: b.byteLength, target}); off += b.byteLength + pad; return views.length - 1; };
  for (const it of items) {
    const P = it.geo.attributes.position.array, N = it.geo.attributes.normal.array, n = P.length / 3;
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) { const v = P[i * 3 + a]; if (v < mn[a]) mn[a] = v; if (v > mx[a]) mx[a] = v; }
    const pv = push(new Float32Array(P), 34962), nv = push(new Float32Array(N), 34962);
    accs.push({bufferView: pv, componentType: 5126, count: n, type: 'VEC3', min: mn, max: mx}); const pa = accs.length - 1;
    accs.push({bufferView: nv, componentType: 5126, count: n, type: 'VEC3'}); const na = accs.length - 1;
    const prim = {attributes: {POSITION: pa, NORMAL: na}, material: mats.length};
    if (it.geo.index) { const I = new Uint32Array(it.geo.index.array); accs.push({bufferView: push(I, 34963), componentType: 5125, count: I.length, type: 'SCALAR'}); prim.indices = accs.length - 1; }
    const c = it.color || new THREE.Color(.7, .7, .7);
    mats.push({name: it.name, pbrMetallicRoughness: {baseColorFactor: [c.r, c.g, c.b, 1], metallicFactor: 0, roughnessFactor: .8}, doubleSided: true});
    meshes.push({name: it.name, primitives: [prim]}); nodes.push({name: it.name, mesh: meshes.length - 1});
  }
  const json = {asset: {version: '2.0', generator: 'NEOPOSE'}, scene: 0, scenes: [{nodes: nodes.map((_, i) => i)}], nodes, meshes, materials: mats, accessors: accs, bufferViews: views, buffers: [{byteLength: off}]};
  let js = new TextEncoder().encode(JSON.stringify(json)); const jp = (4 - js.length % 4) % 4; if (jp) { const t = new Uint8Array(js.length + jp).fill(32); t.set(js); js = t; }
  const total = 12 + 8 + js.length + 8 + off, out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, js.length, true); dv.setUint32(16, 0x4E4F534A, true); out.set(js, 20);
  let o = 20 + js.length; dv.setUint32(o, off, true); dv.setUint32(o + 4, 0x004E4942, true); o += 8;
  for (const b of chunks) { out.set(b, o); o += b.byteLength; }
  return out;
}
function exportBVH(m) {
  const names = FIG.meta.bones, par = FIG.meta.parents, J = m.J, cm = 100, kids = names.map(() => []);
  par.forEach((p, i) => { if (p >= 0) kids[p].push(i); });
  const E = FIG.jIdx;
  const endOf = n => { const t = n.match(/^f([LR])(\d)2$/); if (t) return `tip${t[1]}${t[2]}`; if (/^ankle[LR]$/.test(n)) return 'toe' + n.slice(-1); return null; };
  const f = x => (x * cm).toFixed(4);
  let txt = 'HIERARCHY\n';
  const rec = (i, depth) => {
    const ind = '  '.repeat(depth), n = names[i], p = par[i];
    const o = p < 0 ? [J[i * 3], J[i * 3 + 1], J[i * 3 + 2]] : [J[i * 3] - J[p * 3], J[i * 3 + 1] - J[p * 3 + 1], J[i * 3 + 2] - J[p * 3 + 2]];
    txt += `${ind}${p < 0 ? 'ROOT' : 'JOINT'} ${n}\n${ind}{\n${ind}  OFFSET ${o.map(f).join(' ')}\n${ind}  CHANNELS ${p < 0 ? '6 Xposition Yposition Zposition ' : '3 '}Zrotation Xrotation Yrotation\n`;
    if (kids[i].length) for (const c of kids[i]) rec(c, depth + 1);
    else {
      const e = endOf(n), t = e != null && E[e] != null ? [J[E[e] * 3] - J[i * 3], J[E[e] * 3 + 1] - J[i * 3 + 1], J[E[e] * 3 + 2] - J[i * 3 + 2]] : n === 'head' || n === 'jaw' ? [0, .1 * m.size, 0] : [0, .05, 0];
      txt += `${ind}  End Site\n${ind}  {\n${ind}    OFFSET ${t.map(f).join(' ')}\n${ind}  }\n`;
    }
    txt += `${ind}}\n`;
  };
  par.forEach((p, i) => { if (p < 0) rec(i, 0); });
  const order = []; const walk = i => { order.push(i); for (const c of kids[i]) walk(c); }; par.forEach((p, i) => { if (p < 0) walk(i); });
  const e = new THREE.Euler(), vals = [];
  for (const i of order) {
    const b = m.bones[i]; if (par[i] < 0) vals.push(f(b.position.x), f(b.position.y), f(b.position.z));
    e.setFromQuaternion(b.quaternion, 'ZXY'); vals.push(...[e.z, e.x, e.y].map(a => (a / DEG).toFixed(4)));
  }
  txt += `MOTION\nFrames: 1\nFrame Time: 0.0333333\n${vals.join(' ')}\n`;
  return txt;
}

/* ---------- files ---------- */
// PNG with its print resolution (pHYs chunk, pixels per metre)
function pngWithDpi(dataUrl, dpi) {
  const bin = atob(dataUrl.split(',')[1]), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const ppm = Math.round(dpi / .0254), chunk = new Uint8Array(21), dv = new DataView(chunk.buffer);
  dv.setUint32(0, 9); chunk.set([112, 72, 89, 115], 4); dv.setUint32(8, ppm); dv.setUint32(12, ppm); chunk[16] = 1;
  let crc = -1; for (let i = 4; i < 17; i++) { crc ^= chunk[i]; for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1)); }
  dv.setUint32(17, (crc ^ -1) >>> 0);
  const at = 33, out = new Uint8Array(u8.length + 21); out.set(u8.subarray(0, at)); out.set(chunk, at); out.set(u8.subarray(at), at + 21);
  return out;
}
function saveFile(name, bytes, mime) {
  const cap = window.Capacitor;
  if (cap && cap.isNativePlatform && cap.isNativePlatform()) {
    let b64 = ''; for (let i = 0; i < bytes.length; i += 32768) b64 += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768)); b64 = btoa(b64);
    const call = (pl, m, o) => cap.Plugins && cap.Plugins[pl] ? cap.Plugins[pl][m](o) : cap.nativePromise(pl, m, o);
    return call('Filesystem', 'writeFile', {path: name, data: b64, directory: 'CACHE'}).then(r => call('Share', 'share', {title: 'NEOPOSE', files: [r.uri]}))
      .catch(e => { if (!/cancel/i.test(String(e && e.message))) $('#exMsg').textContent = tr('No se ha podido guardar la imagen: ') + (e && e.message || e); });
  }
  const a = document.createElement('a'), url = URL.createObjectURL(new Blob([bytes], {type: mime}));
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
}
const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };

/* ---------- the window ---------- */
function exportKindUI() {
  const k = EXK.kind;
  const w = EXK.animWhat, pic = k !== 'anim' || w === 'frames' || w === 'board';
  $('#exOptImg').hidden = k !== 'img'; $('#exOptTurn').hidden = k !== 'turn'; $('#exOptMap').hidden = k !== 'maps'; $('#exOpt3d').hidden = k !== 'm3d'; $('#exOptAnim').hidden = k !== 'anim';
  $('#exBgRow').hidden = k === 'maps' || k === 'm3d' || !pic; $('#exSizeRow').hidden = k === 'm3d' || !pic;
  $('#exImgWrap').hidden = k === 'm3d' || (k === 'anim' && !pic); $('#exCopy').hidden = k === 'm3d' || k === 'anim';
  $('#exAnimStepRow').hidden = w !== 'frames'; $('#exSubsRow').hidden = !(w === 'frames' || w === 'board');
  $('#exAnimRange').querySelectorAll('.chip').forEach(b => b.disabled = w === 'bvh' && b.dataset.v === 'movie');
  $('#exBg .chip[data-v=paper]').textContent = tr(k === 'turn' ? 'Papel' : 'Con escenario');
  $('#exSave').textContent = k === 'anim' ? tr('Exportar') : k === 'm3d' ? tr(EXK.fmt3d === 'bvh' ? 'Guardar BVH' : 'Guardar GLB') : tr('Guardar PNG');
}
function renderExportKind() {
  exportKindUI();
  if (EXK.kind === 'img') return renderExport();
  if (EXK.kind === 'anim') return animExportPreview();
  if (EXK.kind === 'm3d') {
    $('#exMsg').textContent = EXK.fmt3d === 'bvh' ? tr('El esqueleto del personaje {n} y su pose, en centímetros, para Blender, Maya o cualquier programa de animación.', {n: active + 1})
      : tr('Todos los personajes y objetos tal como están posados, como malla (sin esqueleto), para Blender u otro programa 3D.');
    return;
  }
  const out = EXK.kind === 'turn' ? onPaper(renderTurnaround(), ex.bg !== 'paper') : renderMap(EXK.map);
  ex.canvas = out; $('#exImg').src = out.toDataURL('image/png');
  $('#exMsg').textContent = tr('{w} × {h} px. Pulsa «Guardar PNG» o copia la imagen para pegarla en tu programa de dibujo.', {w: out.width, h: out.height});
}
function saveExport() {
  if (EXK.kind === 'anim') return exportAnimation();
  if (EXK.kind === 'm3d') {
    if (EXK.fmt3d === 'bvh') return saveFile(`pose-${stamp()}.bvh`, new TextEncoder().encode(exportBVH(mq)), 'text/plain');
    return saveFile(`escena-${stamp()}.glb`, exportGLB(), 'model/gltf-binary');
  }
  const src = $('#exImg').src, name = `${EXK.kind === 'maps' ? EXK.map : EXK.kind === 'turn' ? 'giro' : 'pose'}-${stamp()}.png`;
  const bytes = PRINT[ex.size] ? pngWithDpi(src, 300) : (() => { const b = atob(src.split(',')[1]), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; })();
  saveFile(name, bytes, 'image/png');
}
function buildExportUI() {
  chips($('#exKind'), Object.entries(EX_KINDS), EXK.kind, v => { EXK.kind = v; setPressed($('#exKind'), v); renderExportKind(); });
  chips($('#exMap'), Object.entries(EX_MAPS), EXK.map, v => { EXK.map = v; setPressed($('#exMap'), v); renderExportKind(); });
  chips($('#exViews'), [['4', '4 vistas'], ['8', '8 vistas']], String(EXK.views), v => { EXK.views = +v; setPressed($('#exViews'), v); renderExportKind(); });
  chips($('#ex3d'), [['glb', 'GLB (malla posada)'], ['bvh', 'BVH (esqueleto y pose)']], EXK.fmt3d, v => { EXK.fmt3d = v; setPressed($('#ex3d'), v); renderExportKind(); });
  const chk = (id, key) => { const el = $(id); el.checked = EXK[key]; el.onchange = () => { EXK[key] = el.checked; renderExportKind(); }; };
  chk('#exNeutral', 'neutral'); chk('#exHeads', 'heads'); chk('#exHands', 'hands'); chk('#exEnvMap', 'envInMap'); chk('#exSubs', 'subs');
  chips($('#exAnimWhat'), Object.entries(EX_ANIM), EXK.animWhat, v => { EXK.animWhat = v; setPressed($('#exAnimWhat'), v); if (v === 'bvh') { EXK.animRange = 'shot'; setPressed($('#exAnimRange'), 'shot'); } renderExportKind(); });
  chips($('#exAnimRange'), [['shot', 'Este plano'], ['movie', 'Toda la película']], EXK.animRange, v => { EXK.animRange = v; setPressed($('#exAnimRange'), v); renderExportKind(); });
  chips($('#exAnimStep'), [['1', 'Cada fotograma'], ['2', 'De 2 en 2'], ['4', 'De 4 en 4'], ['keys', 'Solo claves']], EXK.animStep, v => { EXK.animStep = v; setPressed($('#exAnimStep'), v); renderExportKind(); });
  // the old controls redraw whatever kind is chosen
  bindChipGroup('#exBg', v => { ex.bg = v; renderExportKind(); });
  bindChipGroup('#exSize', v => { ex.size = isNaN(+v) ? v : +v; renderExportKind(); });
  $('#exGuides').onchange = renderExportKind; $('#exSketch').onchange = renderExportKind;
  $('#exSave').onclick = saveExport;
  exportKindUI();
}

/* ---------- animation: frames, video, storyboard, BVH ---------- */
const slug = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 30) || 'plano';
function countFrames() {
  const list = EXK.animRange === 'movie' ? ANIM.shots : [shot()], st = EXK.animStep;
  return list.reduce((a, s) => a + (st === 'keys' ? new Set([0, ...s.keys.flat().map(k => k.f), ...s.cam.map(k => k.f), ...s.lines.map(l => l.f), s.len - 1]).size : Math.ceil(s.len / +st)), 0);
}
function animExportPreview() {
  exportKindUI();
  if (!ANIM.shots.length) { $('#exAnimNote').textContent = tr('Abre «Animar» y crea tu película: aquí se exporta plano a plano.'); $('#exSave').disabled = true; $('#exImgWrap').hidden = true; return; }
  $('#exSave').disabled = false;
  const w = EXK.animWhat, list = EXK.animRange === 'movie' ? ANIM.shots : [shot()], secs = list.reduce((a, s) => a + s.len, 0) / ANIM.fps;
  $('#exAnimNote').textContent = w === 'frames' ? tr('{n} fotogramas en PNG, en carpetas por plano dentro de un archivo ZIP.', {n: countFrames()})
    : w === 'video' ? tr('Se graba mientras se reproduce: {s} s. Sin subtítulos (van en los fotogramas y el guion gráfico).', {s: dec(secs)})
    : w === 'board' ? tr('Una viñeta por plano, con su nombre, duración, cámara y diálogo: {n} viñetas.', {n: list.length})
    : tr('El movimiento de {w} en este plano, para Blender u otro programa 3D.', {w: speaker(chars.indexOf(mq))});
  if (w === 'frames' || w === 'board') { const out = renderExportCanvas(EXK.subs ? ANIM.f : null); ex.canvas = out; $('#exImg').src = out.toDataURL('image/png');
    $('#exMsg').textContent = tr('Vista previa del fotograma actual: {w} × {h} px.', {w: out.width, h: out.height}); }
  else $('#exMsg').textContent = '';
}
function exportBusy(on, p) {
  for (const id of ['#exSave', '#exClose', '#exCopy']) $(id).disabled = on;
  $('#exProg').hidden = !on; if (on) $('#exProg i').style.width = Math.round((p || 0) * 100) + '%';
}
async function exportAnimation() {
  if (!ANIM.shots.length) return;
  const w = EXK.animWhat;
  if (w === 'bvh') return saveFile(`animacion-${stamp()}.bvh`, new TextEncoder().encode(animBVH(mq)), 'text/plain');
  storeShot();
  if (w === 'video') { exportBusy(true, 0); $('#exMsg').textContent = tr('Grabando la animación…'); closeExport(); return recordVideo(EXK.animRange, () => exportBusy(false)); }
  exportBusy(true, 0);
  try {
    if (w === 'frames') {
      const files = {}, total = countFrames(); let n = 0;
      await eachFrame(EXK.animRange, EXK.animStep === 'keys' ? 'keys' : +EXK.animStep, async (i, f, s) => {
        const cv = renderExportCanvas(EXK.subs ? f : null), b = await new Promise(r => cv.toBlob(r, 'image/png'));
        files[`${String(i + 1).padStart(2, '0')}-${slug(s.name)}/${String(f + 1).padStart(4, '0')}.png`] = new Uint8Array(await b.arrayBuffer());
        n++; exportBusy(true, n / total); $('#exMsg').textContent = tr('Fotograma {n} de {t}…', {n, t: total});
      });
      saveFile(`animacion-${stamp()}.zip`, fflate.zipSync(files, {level: 0}), 'application/zip');
      $('#exMsg').textContent = tr('{n} fotogramas exportados.', {n});
    } else if (w === 'board') {
      const pages = await storyboardPages(), fname = `guion-grafico-${stamp()}`;
      if (pages.length === 1) saveFile(fname + '.png', new Uint8Array(await (await new Promise(r => pages[0].toBlob(r, 'image/png'))).arrayBuffer()), 'image/png');
      else { const files = {}; for (const [k, p] of pages.entries()) files[`${fname}-${k + 1}.png`] = new Uint8Array(await (await new Promise(r => p.toBlob(r, 'image/png'))).arrayBuffer()); saveFile(fname + '.zip', fflate.zipSync(files, {level: 0}), 'application/zip'); }
      ex.canvas = pages[0]; $('#exImg').src = pages[0].toDataURL('image/png'); $('#exMsg').textContent = tr('Guion gráfico listo: {n} página(s).', {n: pages.length});
    }
  } catch (e) { console.warn('anim export', e); $('#exMsg').textContent = tr('No se ha podido exportar: {e}', {e: e && e.message || e}); }
  exportBusy(false);
}
// storyboard: a panel per shot (its first frame) with number, name, length, camera and the lines of the script
async function storyboardPages() {
  const list = EXK.animRange === 'movie' ? ANIM.shots.map((_, i) => i) : [ANIM.cur], back = {cur: ANIM.cur, f: ANIM.f}, panels = [];
  for (const [n, i] of list.entries()) {
    if (i !== ANIM.cur) await enterShot(i, 0); else setFrame(0);
    const s = shot(); panels.push({img: renderExportCanvas(EXK.subs ? 0 : null), s, i}); exportBusy(true, (n + 1) / list.length * .9);
  }
  if (back.cur !== ANIM.cur) await enterShot(back.cur, back.f); else setFrame(back.f);
  const cols = panels.length <= 2 ? panels.length : 3, PW = 560, per = cols * 3, pages = [], ink = '#2a2620', soft = '#6d6555', font = css('--f-body'), hand = css('--f-hand');
  for (let p0 = 0; p0 < panels.length; p0 += per) {
    const P = panels.slice(p0, p0 + per), rows = Math.ceil(P.length / cols), ph = Math.round(PW * P[0].img.height / P[0].img.width), cap = 112, gap = 28, head = 86;
    const cv = document.createElement('canvas'); cv.width = cols * PW + (cols + 1) * gap; cv.height = head + rows * (ph + cap + gap) + gap;
    const c = cv.getContext('2d'); c.fillStyle = '#fbf8f1'; c.fillRect(0, 0, cv.width, cv.height);
    c.fillStyle = ink; c.font = `700 34px ${hand}`; c.fillText(tr('Guion gráfico'), gap, 52);
    c.font = `14px ${font}`; c.fillStyle = soft; const tot = ANIM.shots.reduce((a, s) => a + s.len, 0) / ANIM.fps;
    c.fillText(`NEOPOSE · ${new Date().toLocaleDateString(LANG)} · ${tr('{n} planos · {s} s', {n: ANIM.shots.length, s: dec(tot)})}${pages.length || panels.length > per ? ' · ' + tr('página {n}', {n: pages.length + 1}) : ''}`, gap, 74);
    P.forEach(({img, s, i}, k) => {
      const x = gap + (k % cols) * (PW + gap), y = head + Math.floor(k / cols) * (ph + cap + gap);
      c.drawImage(img, x, y, PW, ph); c.strokeStyle = ink; c.lineWidth = 2; c.strokeRect(x, y, PW, ph);
      c.fillStyle = ink; c.font = `700 15px ${font}`; c.fillText(`${i + 1}. ${s.name}`, x, y + ph + 22);
      c.font = `13px ${font}`; c.fillStyle = soft; const meta = [`${dec(s.len / ANIM.fps)} s`]; if (s.cam.length > 1) meta.push(tr('movimiento de cámara'));
      c.textAlign = 'right'; c.fillText(meta.join(' · '), x + PW, y + ph + 22); c.textAlign = 'left';
      let ly = y + ph + 42; c.font = `13px ${font}`;
      for (const l of s.lines.filter(l => l.text.trim()).slice(0, 4)) {
        const who = speaker(l.c) + ': '; c.fillStyle = MV_COLS[l.c % 4]; c.font = `700 13px ${font}`; c.fillText(who, x, ly);
        const ww = c.measureText(who).width; c.fillStyle = ink; c.font = `13px ${font}`;
        let t = l.text.trim(); while (c.measureText(t).width > PW - ww && t.length > 3) t = t.slice(0, -2); if (t !== l.text.trim()) t = t.trimEnd() + '…';
        c.fillText(t, x + ww, ly); ly += 18;
      }
    });
    pages.push(cv);
  }
  return pages;
}
