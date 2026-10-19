/* ---------- render loop ---------- */
let W = 1, Hh = 1;
function resize() {
  const r = canvas.getBoundingClientRect(); W = Math.max(1, r.width); Hh = Math.max(1, r.height);
  renderer.setSize(W, Hh, false);
  camera.aspect = W / Hh; camera.setFocalLength(state.focal); camera.updateProjectionMatrix();
  const pr = Math.min(devicePixelRatio, 2);
  ov.width = W * pr; ov.height = Hh * pr; octx.setTransform(pr, 0, 0, pr, 0, 0);
  LU.uPx.value.set(2 / W, 2 / Hh); LU.uDpr.value = pr;
  sizeSketch();
}
new ResizeObserver(resize).observe(vp);
function updateHandles() {
  const show = !practice.active && !sk.hideFig && !sk.on && !ANIM.rec, coarse = matchMedia('(pointer: coarse)').matches ? 1.6 : 1;
  for (const n of DOT_JOINTS) {
    const d = jointDots[n], j = mq.joints[n];
    d.visible = show && state.dots && !!j && !(n.startsWith('tail') && !mq.hasTail) && !(n.startsWith('ear') && !mq.hasEars) && !(n === 'hips' && state.ik) && !(mq._limbLock && mq._limbLock.has(n));
    if (!d.visible) continue;
    j.getWorldPosition(_hp); d.position.copy(_hp);
    d.scale.setScalar(camera.position.distanceTo(_hp) * Math.tan(camera.fov * DEG / 2) * (state.ik ? .013 : .017) * coarse * (hoverHandle === d ? 1.35 : 1));
    d.children[0].material = state.selected === n ? DOT_SEL : DOT_FILL;
  }
  for (const id in handles) {
    const h = handles[id]; h.visible = show && (state.ik || id === 'hips') && !(id === 'hips' && !state.ik && state.dots) && !(mq._limbHide && mq._limbHide.has(id));
    mq.joints[EFFECTOR[id]].getWorldPosition(_hp); h.position.copy(_hp);
    h.scale.setScalar(camera.position.distanceTo(_hp) * Math.tan(camera.fov * DEG / 2) * (id === 'hips' ? .03 : .026) * coarse * (hoverHandle === h ? 1.2 : 1));
  }
}
function updateStools() {
  for (const m of chars) {
    const s = m.stoolMesh; s.visible = m.stool; if (!m.stool) continue;
    const hp = m.joints.hips.getWorldPosition(new V3()), back = new V3(0, 0, -1).applyQuaternion(m.joints.hips.quaternion); back.y = 0;
    const hs = Math.max(.12, hp.y - .1 * m.size);
    s.position.set(hp.x + back.x * .04, 0, hp.z + back.z * .04);
    s.userData.seat.position.y = hs - .022; s.userData.leg.scale.y = hs - .04; s.userData.leg.position.y = (hs - .04) / 2;
  }
}
/* resting: on phones and tablets (and in the balanced and saver qualities) the canvas is drawn at full speed while
   something happens (a finger or the mouse, the keyboard, the camera, a film playing, a glide, a garment or head
   arriving, the first seconds after any change) and a few times a second when nothing does, which is most of the time
   someone spends looking at the pose to draw it: far less battery and heat. wake() is called by whatever changes. */
const REST = {last: performance.now(), drawn: 0};
function wake() { REST.last = performance.now(); }
for (const t of ['pointerdown', 'pointermove', 'wheel', 'keydown', 'touchstart']) addEventListener(t, wake, {passive: true, capture: true});
controls.addEventListener('change', wake);
const resting = now => state.quality !== 'alta' && now - REST.last > 2500 && !ANIM.playing && !ANIM.rec && !TWEENS.size && !CAMG.go && !practice.active && !(typeof SC !== 'undefined' && SC.busy);
function frame() {
  if (!mq) return;
  const now = performance.now(); if (resting(now) && now - REST.drawn < 250) return; REST.drawn = now;
  glideTick(); camGlideTick(); controls.update(); if (state.roll) camera.rotateZ(-state.roll * DEG); sceneTicks();
  animTick(); dockView(); renderMulti(); renderer.render(scene, camera); drawOverlay(octx, W, Hh);
}
// what the scene does every frame besides the animation (also run by the video export, frame by frame)
function sceneTicks() {
  updateLights(); envTick(); avatarsTick(); limbTick(); accessTick(); muscleTick(); dynamicsTick(); updateOcclusion(); updateHandles(); pinTick(); sceneTick(); updateStools(); updateSun(); clothTick(); anthroTick();
  for (const m of chars) { m.group.visible = !sk.hideFig; if (sk.hideFig) m.stoolMesh.visible = false; if (ANIM.rec && m.lib && m.lib.uHi) m.lib.uHi.value = -1; }
}
// with the animation dock open, the shot is framed in the part of the canvas above it (what the film will show)
function dockView() {
  const tl = $('#timeline'), d = ANIM.open && !ANIM.rec && tl && !tl.hidden ? Math.min(tl.offsetHeight + 12, Hh * .55) : 0;
  if (d > 20) { const a = W / (Hh - d); if (Math.abs(camera.aspect - a) > 1e-4 || !camera.view || !camera.view.enabled || camera.view.fullHeight !== Hh - d) { camera.aspect = a; camera.setFocalLength(state.focal); camera.setViewOffset(W, Hh - d, 0, 0, W, Hh); } }
  else if (camera.view && camera.view.enabled) noDockView();
}
function noDockView() { camera.clearViewOffset(); camera.aspect = W / Hh; camera.setFocalLength(state.focal); camera.updateProjectionMatrix(); }
renderer.setAnimationLoop(frame);

/* ---------- export ---------- */
const ex = {bg: 'paper', size: 2};
function renderExport() {
  const out = renderExportCanvas();
  ex.canvas = out; $('#exImg').src = out.toDataURL('image/png');
  $('#exMsg').textContent = tr('{w} × {h} px. Pulsa «Guardar PNG» o copia la imagen para pegarla en tu programa de dibujo.', {w: out.width, h: out.height});
}
// the picture of the current view, with the chosen background, size and layers (also each frame of an animation)
function renderExportCanvas(subsFrame) {
  noDockView();  // the next frame puts it back
  const lines = ex.bg === 'lines', alpha = ex.bg === 'alpha' || lines;
  const vis = {tc: tc.visible, bg: scene.background, env: envGroup && envGroup.visible, grid: grid.visible, fog: scene.fog, sky: sky.visible, style: state.style, render: LU.uRender.value};
  const hidden = [...(typeof TRAIL !== 'undefined' && TRAIL.group ? [TRAIL.group] : []), ...(typeof DYN !== 'undefined' ? [DYN.loaObj, DYN.balObj, ...DYN.inbMeshes].filter(Boolean) : []), ...Object.values(handles), ...Object.values(jointDots), ...Object.values(pinRings), sunHandle, sunRing, ...extraLights.flatMap(g => g.children.filter(c => c.isMesh)), ...(ghostMesh ? [ghostMesh] : []), ...ANIM.ghosts];
  const hv = hidden.map(h => h.visible);
  tc.visible = false; hidden.forEach(h => h.visible = false);
  const panoV = panoSphere.visible;
  if (alpha) { scene.background = null; if (envGroup) envGroup.visible = false; grid.visible = false; sky.visible = false; panoSphere.visible = false; scene.fog = null; renderer.setClearColor(0, 0); }
  if (lines) { for (const m of chars) m.setStyle('contorno'); LU.uRender.value = 0; }
  const pr = renderer.getPixelRatio(), lw = LU.uLineW.value, dpr = LU.uDpr.value, f = frameRect(W, Hh), k = exportScale(f);
  LU.uLineW.value = lw * k / pr; LU.uDpr.value = k;
  renderer.setPixelRatio(k); renderer.setSize(W, Hh, false);
  updateLights(); updateStools(); renderer.render(scene, camera);
  let out = document.createElement('canvas'); out.width = Math.round(f.w * k); out.height = Math.round(f.h * k);
  const c = out.getContext('2d');
  c.drawImage(renderer.domElement, f.x * k, f.y * k, f.w * k, f.h * k, 0, 0, out.width, out.height);
  if (lines) { // keep only the ink: paper-white becomes transparent, darker strokes stay
    const id = c.getImageData(0, 0, out.width, out.height), d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const L = (d[i] * .299 + d[i + 1] * .587 + d[i + 2] * .114) / 255, a = clamp((.93 - L) / .55, 0, 1);
      d[i + 3] = Math.round(d[i + 3] * a); d[i] *= .6; d[i + 1] *= .6; d[i + 2] *= .6;
    }
    c.putImageData(id, 0, 0);
  }
  c.save(); c.scale(k, k); c.translate(-f.x, -f.y);
  if ($('#exGuides').checked && (state.guides.thirds || state.guides.persp || state.guides.ruler || state.guides.action)) { c.noFrame = true; drawOverlay(c, W, Hh); }
  c.restore();
  if ($('#exSketch').checked && sk.strokes.length) c.drawImage(sketchCanvas(k), f.x * k, f.y * k, f.w * k, f.h * k, 0, 0, out.width, out.height);
  renderer.setPixelRatio(pr); renderer.setSize(W, Hh, false); LU.uLineW.value = lw; LU.uDpr.value = dpr;
  if (lines) { for (const m of chars) m.setStyle(vis.style); LU.uRender.value = vis.render; }
  tc.visible = vis.tc; scene.background = vis.bg; if (envGroup) envGroup.visible = vis.env; grid.visible = vis.grid; scene.fog = vis.fog; sky.visible = vis.sky; panoSphere.visible = panoV;
  hidden.forEach((h, i) => h.visible = hv[i]);
  if (subsFrame != null) burnSubs(out, subsFrame);
  return onPaper(out, alpha);
}
function openExport() { tourEvent('export'); $('#exportModal').hidden = false; renderExportKind(); $('#exSave').focus(); }
function closeExport() { $('#exportModal').hidden = true; }
$('#exportBtn').onclick = openExport; $('#exClose').onclick = closeExport;
$('#exportModal').onclick = e => { if (e.target.id === 'exportModal') closeExport(); };
bindChipGroup('#exBg', v => { ex.bg = v; renderExport(); });
bindChipGroup('#exSize', v => { ex.size = +v; renderExport(); });
$('#exGuides').onchange = renderExport;
$('#exSave').onclick = () => {
  const a = document.createElement('a'), d = new Date(), pad = n => String(n).padStart(2, '0');
  a.download = `pose-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`;
  // Android (Capacitor): no downloads in the WebView, so write the PNG to the cache and open the share sheet (Galería, Drive, Telegram…)
  const cap = window.Capacitor;
  if (cap && cap.isNativePlatform && cap.isNativePlatform()) {
    const call = (pl, m, o) => cap.Plugins && cap.Plugins[pl] ? cap.Plugins[pl][m](o) : cap.nativePromise(pl, m, o);
    call('Filesystem', 'writeFile', {path: a.download, data: $('#exImg').src.split(',')[1], directory: 'CACHE'})
      .then(r => call('Share', 'share', {title: 'NEOPOSE', files: [r.uri]}))
      .catch(e => { if (!/cancel/i.test(String(e && e.message))) $('#exMsg').textContent = tr('No se ha podido guardar la imagen: ') + (e && e.message || e); });
    return;
  }
  a.href = $('#exImg').src; document.body.appendChild(a); a.click(); a.remove();
};
$('#exCopy').onclick = () => {
  const msg = $('#exMsg'), fail = () => msg.textContent = tr('Aquí no se puede copiar la imagen. Haz clic derecho sobre ella y elige «Guardar imagen».');
  try {
    if (!navigator.clipboard || !window.ClipboardItem) throw 0;
    navigator.clipboard.write([new ClipboardItem({'image/png': new Promise(r => ex.canvas.toBlob(r, 'image/png'))})])
      .then(() => msg.textContent = tr('Imagen copiada. Pégala en tu programa de dibujo con Ctrl+V.')).catch(fail);
  } catch (_) { fail(); }
};
