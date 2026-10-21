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
  // (none in the character creator: it shapes who they are, the posing is Estático's and Animación's)
  const show = !practice.active && !sk.hideFig && !sk.on && !ANIM.rec && !CR.on, coarse = matchMedia('(pointer: coarse)').matches ? 1.6 : 1;
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
// (off: an ink render, the figure's line alone: the seat is a prop to pose on, which the ink pass does not draw and
// the ink filter would keep as a shaded grey and black block)
function updateStools(off = false) {
  for (const m of chars) {
    const s = m.stoolMesh; s.visible = m.stool && !off; if (!m.stool) continue;
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
// (in the high quality too, after a longer while, and still at 15 frames a second there: idle motion stays smooth)
const resting = now => now - REST.last > (state.quality === 'alta' ? 8000 : 2500) && !ANIM.playing && !ANIM.rec && !TWEENS.size && !CAMG.go && !practice.active && !(typeof SC !== 'undefined' && SC.busy);
function frame() {
  if (!mq) return;
  // (the comic page covers the canvas: nothing to draw under it; its panels are drawn on their own)
  if (typeof pageOn === 'function' && pageOn()) return;
  const now = performance.now(); if (resting(now) && now - REST.drawn < (state.quality === 'alta' ? 66 : 250)) return; REST.drawn = now;
  glideTick(); camGlideTick(); controls.update(); if (state.roll) camera.rotateZ(-state.roll * DEG); sceneTicks();
  animTick(); dockView(); renderMulti(); renderer.render(scene, camera); drawOverlay(octx, W, Hh);
}
// what the scene does every frame besides the animation (also run by the video export, frame by frame)
function sceneTicks() {
  updateLights(); envTick(); avatarsTick(); limbTick(); accessTick(); muscleTick(); dynamicsTick(); updateOcclusion(); updateHandles(); pinTick(); sceneTick(); updateStools(); updateSun(); clothTick(); anthroTick();
  const gone = sk.hideFig || (ANIM.open && ANIM.shots.length && shot() && shot().empty);  // (a film's shot of a place with nobody in it)
  for (const m of chars) { m.group.visible = !gone; if (gone) m.stoolMesh.visible = false; if (ANIM.rec && m.lib && m.lib.uHi) m.lib.uHi.value = -1; }
}
// with the animation dock open, the shot is framed in the part of the canvas above it (what the film will show)
// a frame of its own shape on the canvas (a comic panel being edited): the camera is that picture's, placed where the
// frame guide is, so what is inside the guide is exactly what the panel will show (and the canvas around it, the rest)
function applyFrameAspect(a) { state.frameAspect = a || null; if (!a) noDockView(); else panelFrameView(); if (typeof syncRatioUI === 'function') syncRatioUI(); }
function panelFrameView() {
  const f = frameRect(W, Hh); camera.aspect = state.frameAspect; camera.setFocalLength(state.focal);
  camera.setViewOffset(f.w, f.h, -f.x, -f.y, W, Hh); camera.updateProjectionMatrix();
}
function dockView() {
  if (state.frameAspect) return panelFrameView();
  const tl = $('#timeline'), d = ANIM.open && !ANIM.rec && tl && !tl.hidden ? Math.min(tl.offsetHeight + 12, Hh * .55) : 0;
  if (d > 20) { const a = W / (Hh - d); if (Math.abs(camera.aspect - a) > 1e-4 || !camera.view || !camera.view.enabled || camera.view.fullHeight !== Hh - d) { camera.aspect = a; camera.setFocalLength(state.focal); camera.setViewOffset(W, Hh - d, 0, 0, W, Hh); } }
  else if (camera.view && camera.view.enabled) noDockView();
}
function noDockView() { camera.clearViewOffset(); camera.aspect = W / Hh; camera.setFocalLength(state.focal); camera.updateProjectionMatrix(); }
renderer.setAnimationLoop(frame);

/* ---------- ink: the lines inside the silhouette ----------
   A line drawing has more than the outer contour (the hull, see OUTLINE_MAT): a line where one form passes in front of
   another (the arm across the chest, a finger over the next, the jaw over the neck), where the surface folds inwards
   (between fingers and toes, under the chin, the root of a tuft) and where one part ends and the next begins (pad and
   fur, claw and toe, eyelid, nose leather, teeth and gums, a sleeve's hem). They are found as NPR renderers find them
   (Saito & Takahashi 1990, G-buffer edges; Decaudin 1996): the characters are drawn once more, alone and without
   shadows, into a buffer of view normals, part ids and depth, and a filter reads it. A depth step is inked on its near
   side only (one stroke, not two, as a pen would draw the front form's edge); a fold only where the surface turns
   inwards (a convex tooth, claw or finger tip stays clean at any size); a part border on the part in front. The lines
   are depth-tested against the picture, so a table in front of a leg still hides them. Thinner and a little lighter
   than the contour, which keeps the heavier weight a draughtsman gives the outside. The outside itself is the hull's
   alone: the buffer has no antialiasing, and a second stroke traced inside along its stairs doubles the contour with
   specks. Solo línea only, with the ink renders (key drawings, comic panels) that use it: the other styles keep their
   look; and it costs one more draw of the figures alone, nothing of the set. */
const INK = {rts: new Map(), vp: new THREE.Vector4(), db: new THREE.Vector2(), cc: new THREE.Color()};
INK.mat = new THREE.ShaderMaterial({
  uniforms: {tN: {value: null}, tD: {value: null}, uTx: {value: new THREE.Vector2()}, uR: {value: 1}, uNear: {value: .1}, uFar: {value: 100}, uOrtho: {value: 0}, uCol: LU.uOutCol, uA: {value: 1}},
  transparent: true, depthTest: true, depthWrite: false, extensions: {fragDepth: true},
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `uniform sampler2D tN, tD; uniform vec2 uTx; uniform float uR, uNear, uFar, uOrtho, uA; uniform vec3 uCol; varying vec2 vUv;
    float Z(vec2 p) { float d = texture2D(tD, p).r; return uOrtho > .5 ? uNear + d * (uFar - uNear) : uNear * uFar / (uFar - d * (uFar - uNear)); }
    vec3 Nr(vec4 s) { vec2 v = s.xy * 2.0 - 1.0; return vec3(v, sqrt(max(0.0, 1.0 - dot(v, v)))); }
    // a part ends: on the one in front
    float ends(vec4 a, vec4 b, float za, float zb, vec4 c, float zc) {
      float tol = zc * .004, e = 0.0;
      if (a.a > .5 && abs(a.b - c.b) > .5 / 255.0 && (zc < za - tol || (abs(za - zc) <= tol && c.b > a.b))) e = 1.0;
      if (b.a > .5 && abs(b.b - c.b) > .5 / 255.0 && (zc < zb - tol || (abs(zb - zc) <= tol && c.b > b.b))) e = 1.0;
      return e;
    }
    float part(vec2 o, vec4 c, float zc) { return ends(texture2D(tN, vUv + o), texture2D(tN, vUv - o), Z(vUv + o), Z(vUv - o), c, zc); }
    // one direction across the pixel: the neighbours on both sides, at the stroke's width
    float across(vec2 o, vec4 c, float zc, float rim) {
      vec4 a = texture2D(tN, vUv + o), b = texture2D(tN, vUv - o);
      // (an empty neighbour, past the silhouette, takes the depth the surface would have there: no step, which the
      // hull draws, and no curvature from the slope of a surface turning away)
      float za = a.a > .5 ? Z(vUv + o) : 0.0, zb = b.a > .5 ? Z(vUv - o) : 0.0;
      if (a.a < .5) za = b.a > .5 ? 2.0 * zc - zb : zc; if (b.a < .5) zb = a.a > .5 ? 2.0 * zc - za : zc;
      // (a step has one side far behind and the other at hand; both sides behind alike is a rounded tip seen end-on,
      // a pad's crown or a knuckle, which the curvature of the depth took for a step and inked as a dot)
      float lap = (za + zb - 2.0 * zc) / zc, jump = lap - 2.0 * max(min(za, zb) - zc, 0.0) / zc;
      // a form in front of another: its near side; not over the inside of the same part (a garment's edge where what
      // it covers is hidden, as at a waistband under a shirt: the inside seen past it is no form of its own)
      float back = max(float(a.a > .5 && a.a < .9 && abs(a.b - c.b) < .5 / 255.0), float(b.a > .5 && b.a < .9 && abs(b.b - c.b) < .5 / 255.0)) * step(.9, c.a);
      // (where the surface turns away the depth curves fast on its own: a step must be bigger there to be one)
      float t = .004 / max(Nr(c).z, .25), step_ = smoothstep(t, t * 3.0, jump) * (1.0 - back);
      float fold = smoothstep(.3, .6, 1.0 - dot(Nr(a), Nr(b))) * step(lap, .0005) * step(.5, a.a) * step(.5, b.a) * smoothstep(.2, .4, Nr(c).z) * (1.0 - back);  // turning inwards (not where the surface grazes the eye, the contour's, nor onto a garment's inside at its edge)
      return max(max(step_, fold * .85) * rim, ends(a, b, za, zb, c, zc));
    }
    void main() {
      vec4 c = texture2D(tN, vUv); if (c.a < .5) discard;
      float zc = Z(vUv); vec2 r = uTx * uR;
      // within a few pixels of the silhouette the hull draws the line: steps and folds there (the far side of a sleeve,
      // a surface curving away fast, the unantialiased stairs of the buffer) would only stipple it from inside
      vec2 e = r * 3.0; float rim = step(.5, min(min(min(texture2D(tN, vUv + vec2(e.x, 0.0)).a, texture2D(tN, vUv - vec2(e.x, 0.0)).a), min(texture2D(tN, vUv + vec2(0.0, e.y)).a, texture2D(tN, vUv - vec2(0.0, e.y)).a)),
        min(min(texture2D(tN, vUv + e).a, texture2D(tN, vUv - e).a), min(texture2D(tN, vUv + vec2(e.x, -e.y)).a, texture2D(tN, vUv - vec2(e.x, -e.y)).a))));
      float ink = across(vec2(r.x, 0.0), c, zc, rim) + across(vec2(0.0, r.y), c, zc, rim) + .7 * (across(r, c, zc, rim) + across(vec2(r.x, -r.y), c, zc, rim));
      // a hard part (pad, claw, horn: kinds 2–4) is outlined bold, as the references draw beans and claws with the
      // contour's confidence: its border found again a stroke further in
      float k = mod(floor(c.b * 255.0 + .5), 8.0);
      if (k > 1.5 && k < 4.5) { vec2 r2 = r * 2.0; ink = max(ink, part(vec2(r2.x, 0.0), c, zc) + part(vec2(0.0, r2.y), c, zc) + .7 * (part(r2, c, zc) + part(vec2(r2.x, -r2.y), c, zc))); }
      ink = clamp(ink * .75, 0.0, 1.0); if (ink < .02) discard;
      gl_FragDepthEXT = texture2D(tD, vUv).r - 2e-6;
      gl_FragColor = vec4(uCol, ink * uA);
    }`
});
// the lines go into the picture as a full-frame sheet drawn with the transparent things, under the ghosts, trails and
// handles (which are drawn later, by their renderOrder), so the gizmos stay on top of the ink
INK.sheet = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), INK.mat); INK.sheet.frustumCulled = false; INK.sheet.renderOrder = 1; INK.sheet.raycast = () => {};
const inkWanted = () => LU.uOutW.value > 0 && chars.some(m => m.style === 'contorno' && m.group.visible);
const inkFree = (k, rt) => { rt.depthTexture.dispose(); rt.dispose(); INK.rts.delete(k); };
function inkTarget(w, h) {
  const k = w + 'x' + h; let rt = INK.rts.get(k);
  if (!rt) { // (a few sizes kept: the canvas, the multi-view's panes, an export's or a film's frames, let go once the canvas is drawn again)
    if (INK.rts.size > 2) inkFree(...INK.rts.entries().next().value);
    rt = new THREE.WebGLRenderTarget(w, h, {minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthTexture: new THREE.DepthTexture(w, h, THREE.UnsignedIntType)}); INK.rts.set(k, rt);
  }
  return rt;
}
// the normals, part ids and depth of the characters alone, at the size of the picture about to be drawn
function inkBuffer(cam) {
  renderer.getCurrentViewport(INK.vp); const w = INK.vp.z, h = INK.vp.w; if (w < 2 || h < 2) return false;
  const rt = inkTarget(w, h), prev = renderer.getRenderTarget(), groups = new Set(chars.map(m => m.group)), off = [];
  // the set's drawables out (not its lights: the lit materials would change program twice a frame)
  const unset = o => { if (groups.has(o) || !o.visible) return; if (o.isMesh || o.isLine || o.isPoints || o.isSprite) { o.visible = false; off.push(o); } else o.children.forEach(unset); };
  scene.children.forEach(unset);
  // (what is drawn with a material that writes the ink pass, see inkFrag in 03-figure.js: not the hulls or the gizmos,
  // nor the faded body over the construction forms, which writes no depth to find its lines by)
  const inked = o => o.material && o.material.userData && o.material.userData.ink && !(o.material.transparent && o.material.opacity < 1);
  for (const g of groups) if (g.visible) g.traverse(o => { if (o.visible && (o.isMesh || o.isLine || o.isPoints || o.isSprite) && !inked(o)) { o.visible = false; off.push(o); } });
  const bg = scene.background, ca = renderer.getClearAlpha(), su = renderer.shadowMap.autoUpdate; renderer.getClearColor(INK.cc);
  scene.background = null; renderer.setClearColor(0, 0); renderer.shadowMap.autoUpdate = false; LU.uInk.value = 1;
  try { renderer.setRenderTarget(rt); drawScene(scene, cam); }
  finally { LU.uInk.value = 0; renderer.setRenderTarget(prev); scene.background = bg; renderer.setClearColor(INK.cc, ca); renderer.shadowMap.autoUpdate = su; off.forEach(o => o.visible = true); }
  // the stroke: thinner than the contour, in the picture's pixels as the contour's width is (whole pixels: the buffer is read texel by texel)
  const U = INK.mat.uniforms; U.tN.value = rt.texture; U.tD.value = rt.depthTexture; U.uTx.value.set(1 / w, 1 / h);
  U.uR.value = Math.max(1, Math.round(LU.uOutW.value * .8 * LU.uPx.value.x * .5 * w)); U.uNear.value = cam.near; U.uFar.value = cam.far; U.uOrtho.value = cam.isOrthographicCamera ? 1 : 0;
  return true;
}
// every picture of the scene (the canvas, exports, thumbnails, the multi-view) gets the ink when Solo línea asks for it
const drawScene = renderer.render.bind(renderer);
renderer.render = (s, cam) => {
  if (s !== scene || !inkWanted() || !inkBuffer(cam)) return drawScene(s, cam);
  scene.add(INK.sheet); try { drawScene(s, cam); } finally { scene.remove(INK.sheet); }
  // (only what is bigger than the drawing buffer, an export's: the canvas and the multi-view's panes, drawn in turn
  // every frame, keep theirs, which were otherwise made again and let go again each frame)
  renderer.getDrawingBufferSize(INK.db); for (const [k, rt] of INK.rts) if (rt.width * rt.height > INK.db.x * INK.db.y) inkFree(k, rt);
};

/* ---------- export ---------- */
const ex = {bg: 'paper', size: 2};
// the sketch is drawn over Estático's picture: it goes into the still images made there, not into a film's frames
const sketchInExport = () => sk.strokes.length > 0 && WS.cur === 'static' && !ex.film;
function renderExport() {
  const out = renderExportCanvas();
  ex.canvas = out; $('#exImg').src = out.toDataURL('image/png');
  $('#exMsg').textContent = tr('{w} × {h} px. Pulsa «Guardar PNG» o copia la imagen para pegarla en tu programa de dibujo.', {w: out.width, h: out.height});
}
// the picture of the current view, with the chosen background, size and layers (also each frame of an animation)
function renderExportCanvas(subsFrame) {
  noDockView();  // the next frame puts it back
  const lines = ex.bg === 'lines', alpha = ex.bg === 'alpha' || lines, noGuides = !(ex.userGuides ?? $('#exGuides').checked);  // (the layers keep them, see renderLayerSet)
  const vis = {tc: tc.visible, bg: scene.background, env: envGroup && envGroup.visible, grid: grid.visible, fog: scene.fog, sky: sky.visible, style: state.style, render: LU.uRender.value, center: LU.uCenter.value};
  const hidden = [...(typeof TRAIL !== 'undefined' && TRAIL.group ? [TRAIL.group] : []), ...(typeof DYN !== 'undefined' ? [DYN.loaObj, DYN.balObj, ...DYN.inbMeshes].filter(Boolean) : []), ...Object.values(handles), ...Object.values(jointDots), ...Object.values(pinRings), sunHandle, sunRing, ...extraLights.flatMap(g => g.children.filter(c => c.isMesh)), ...(ghostMesh ? [ghostMesh] : []), ...ANIM.ghosts];
  const hv = hidden.map(h => h.visible);
  tc.visible = false; hidden.forEach(h => h.visible = false);
  const panoV = panoSphere.visible;
  if (noGuides) { LU.uCenter.value = 0; grid.visible = false; }  // without the guides: no centre line, no floor grid either
  if (alpha) { scene.background = null; if (envGroup) envGroup.visible = false; grid.visible = false; sky.visible = false; panoSphere.visible = false; scene.fog = null; renderer.setClearColor(0, 0); }
  if (lines) { for (const m of chars) m.setStyle('contorno'); LU.uRender.value = 0; }
  const pr = renderer.getPixelRatio(), lw = LU.uLineW.value, dpr = LU.uDpr.value, f = frameRect(W, Hh), k = exportScale(f);
  LU.uLineW.value = lw * k / pr; LU.uDpr.value = k;
  renderer.setPixelRatio(k); renderer.setSize(W, Hh, false);
  updateLights(); updateStools(lines); renderer.render(scene, camera);
  let out = document.createElement('canvas'); out.width = Math.round(f.w * k); out.height = Math.round(f.h * k);
  const c = out.getContext('2d');
  c.drawImage(renderer.domElement, f.x * k, f.y * k, f.w * k, f.h * k, 0, 0, out.width, out.height);
  if (lines) inkOnly(out);
  c.save(); c.scale(k, k); c.translate(-f.x, -f.y);
  if ($('#exGuides').checked && (state.guides.thirds || state.guides.persp || state.guides.ruler || state.guides.action)) { c.noFrame = true; drawOverlay(c, W, Hh); }
  c.restore();
  if ($('#exSketch').checked && sketchInExport()) c.drawImage(sketchCanvas(k), f.x * k, f.y * k, f.w * k, f.h * k, 0, 0, out.width, out.height);
  renderer.setPixelRatio(pr); renderer.setSize(W, Hh, false); LU.uLineW.value = lw; LU.uDpr.value = dpr;
  if (lines) { for (const m of chars) m.setStyle(vis.style); LU.uRender.value = vis.render; }
  tc.visible = vis.tc; scene.background = vis.bg; if (envGroup) envGroup.visible = vis.env; grid.visible = vis.grid; LU.uCenter.value = vis.center; scene.fog = vis.fog; sky.visible = vis.sky; panoSphere.visible = panoV;
  hidden.forEach((h, i) => h.visible = hv[i]);
  if (subsFrame != null) burnSubs(out, subsFrame);
  return onPaper(out, alpha);
}
// the current view as a picture of any shape and size, whatever the window is: the camera keeps its lens and turns
// to the picture's aspect (a comic panel, a film frame, a print), the renderer draws at exactly w × h. bg: 'paper'
// (the set), 'alpha' (nothing behind), 'lines' (the ink alone, transparent elsewhere — the comic panels' line: a
// drawing's contours and interior lines, without the rings and the centre line, which are guides for the eye)
function renderView(o) {
  const w = Math.max(2, Math.round(o.w)), h = Math.max(2, Math.round(o.h)), lines = o.bg === 'lines', alpha = o.bg === 'alpha' || lines;
  const vis = {tc: tc.visible, bg: scene.background, env: envGroup && envGroup.visible, grid: grid.visible, fog: scene.fog, sky: sky.visible, style: state.style, render: LU.uRender.value, pano: panoSphere.visible, la: LU.uLineA.value, center: LU.uCenter.value};
  const hidden = [...(typeof TRAIL !== 'undefined' && TRAIL.group ? [TRAIL.group] : []), ...(typeof DYN !== 'undefined' ? [DYN.loaObj, DYN.balObj, ...DYN.inbMeshes].filter(Boolean) : []), ...Object.values(handles), ...Object.values(jointDots), ...Object.values(pinRings), sunHandle, sunRing, ...extraLights.flatMap(g => g.children.filter(c => c.isMesh)), ...(ghostMesh ? [ghostMesh] : []), ...ANIM.ghosts];
  const hv = hidden.map(x => x.visible); tc.visible = false; hidden.forEach(x => x.visible = false);
  if (alpha) { scene.background = null; if (envGroup) envGroup.visible = false; grid.visible = false; sky.visible = false; panoSphere.visible = false; scene.fog = null; renderer.setClearColor(0, 0); }
  if (lines) { for (const m of chars) m.setStyle('contorno'); LU.uRender.value = 0; LU.uLineA.value = 0; LU.uCenter.value = 0; }
  // (the contour and the ink as wide as on the canvas, and in a bigger picture, a print's panel, wider with it, as the
  // same drawing at a finer resolution: a hairline there would vanish on paper)
  const pr = renderer.getPixelRatio(), lw = LU.uLineW.value, dpr = LU.uDpr.value, px = LU.uPx.value.clone(), k = h / Hh, kl = Math.max(1, k);
  camera.clearViewOffset(); camera.aspect = w / h; camera.setFocalLength(state.focal); camera.updateProjectionMatrix();
  renderer.setPixelRatio(1); renderer.setSize(w, h, false); LU.uLineW.value = lw * k / pr; LU.uDpr.value = k; LU.uPx.value.set(2 * kl / w, 2 * kl / h);
  updateLights(); updateStools(lines); renderer.render(scene, camera);
  const out = document.createElement('canvas'); out.width = w; out.height = h; const c = out.getContext('2d'); c.drawImage(renderer.domElement, 0, 0, w, h, 0, 0, w, h);
  if (lines) inkOnly(out);
  renderer.setPixelRatio(pr); LU.uLineW.value = lw; LU.uDpr.value = dpr; LU.uPx.value.copy(px);
  if (lines) { for (const m of chars) m.setStyle(vis.style); LU.uRender.value = vis.render; LU.uLineA.value = vis.la; LU.uCenter.value = vis.center; }
  tc.visible = vis.tc; scene.background = vis.bg; if (envGroup) envGroup.visible = vis.env; grid.visible = vis.grid; scene.fog = vis.fog; sky.visible = vis.sky; panoSphere.visible = vis.pano;
  hidden.forEach((x, i) => x.visible = hv[i]);
  resize(); dockView();  // the window's own size and aspect back
  return out;
}
// the window opens on what the space makes: the film in Animación, a picture elsewhere (a turnaround, maps or 3D stay as chosen)
function openExport() {
  setExportKind(ANIM.open && EXK.kind === 'img' ? 'anim' : !ANIM.open && EXK.kind === 'anim' ? 'img' : EXK.kind);
  if (EXK.kind === 'anim' && !ANIM.exported) { ANIM.exported = true; ex.imgSize = ex.size; ex.size = 1; setPressed($('#exSize'), '1'); }  // a film's first export at 1× (every frame is a picture)
  tourEvent('export'); $('#exportModal').hidden = false; renderExportKind(); $('#exSave').focus();
}
function closeExport() { $('#exportModal').hidden = true; }
// the top bar's Exportar (and Ctrl+E): while the comic page is shown, it is the pages that go out, from the Cómic tab's own section
function exportFromTop() {
  if (document.body.classList.contains('paging')) { setPanel(true); goSection($('section[data-tab=comic] details[data-sec=cmexport]')); $('#cmExport').focus({preventScroll: true}); toast(tr('Las páginas del cómic se exportan desde aquí: PNG, ZIP, PDF, CBZ o PSD.')); return; }
  openExport();
}
$('#exportBtn').onclick = exportFromTop; $('#exClose').onclick = closeExport;
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
