/* ======================= scene extras =======================
   Panoramas: 360° photographs (Poly Haven HDRIs, CC0) as the background, with a ground that only catches shadows;
   the light takes its colours from the photo. Perspective framings: the camera placed for one, two or three
   vanishing points, with the horizon and vanishing guide on. Multi-view: front, profile and top beside the main view. */

/* ---------- panoramas ---------- */
const PANOS = {
  pano_calle: ['Calle a mediodía', 'wide_street_01', 'dia'], pano_ciudad: ['Ciudad moderna', 'canary_wharf', 'dia'], pano_noche: ['Ciudad de noche', 'shanghai_bund', 'interior'],
  pano_prado: ['Prado', 'meadow_2', 'dia'], pano_campo: ['Campo al atardecer', 'lilienstein', 'atardecer'], pano_venecia: ['Venecia al atardecer', 'venice_sunset', 'atardecer'],
  pano_loft: ['Loft con ventanales', 'photo_studio_loft_hall', 'interior'], pano_chimenea: ['Salón con chimenea', 'fireplace', 'interior']
};
for (const [k, [label, file, amb]] of Object.entries(PANOS)) SCENES[k] = {label: tr(label), group: 'pano', amb, assets: [], pano: file, build(e) {
  const g = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.ShadowMaterial({opacity: .3}));
  g.rotation.x = -Math.PI / 2; g.position.y = .001; g.receiveShadow = true; Object.assign(g.userData, {noOutline: true, noOcclude: true, ground: true}); e.add(g);
}};
const panoSphere = new THREE.Mesh(new THREE.SphereGeometry(150, 64, 32), new THREE.MeshBasicMaterial({side: THREE.BackSide, fog: false, depthWrite: false}));
panoSphere.renderOrder = -10; panoSphere.visible = false; panoSphere.raycast = () => {}; scene.add(panoSphere);
const PANO = {tex: {}, col: {}, sun: {}};
function panoTexture(file) {
  if (!PANO.tex[file]) PANO.tex[file] = new Promise((res, rej) => new THREE.TextureLoader().load(/^(https?:|blob:|data:)/.test(file) ? file : `envs/hdri/${file}.webp`, t => {
    // the light's colours: the average of the sky and of the ground in the photo
    const im = t.image, c = document.createElement('canvas'); c.width = 64; c.height = 32; const x = c.getContext('2d'); x.drawImage(im, 0, 0, 64, 32);
    const d = x.getImageData(0, 0, 64, 32).data, avg = (y0, y1) => { const s = [0, 0, 0]; let n = 0; for (let y = y0; y < y1; y++) for (let i = 0; i < 64; i++) { const o = (y * 64 + i) * 4; s[0] += d[o]; s[1] += d[o + 1]; s[2] += d[o + 2]; n++; } return new THREE.Color(s[0] / n / 255, s[1] / n / 255, s[2] / n / 255); };
    PANO.col[file] = {sky: avg(2, 14), ground: avg(18, 30)};
    res(t);
  }, undefined, rej));
  return PANO.tex[file];
}
const panoOf = id => SCENES[id] && (SCENES[id].pano || SCENES[id].backplate);
// after applyAmbient: the photo instead of the sky and the fog, and its colours in the fill light
function panoAmbient() {
  const file = panoOf(state.env);
  $('#panoBox') && ($('#panoBox').hidden = !file);
  if (!file) { panoSphere.visible = false; return; }
  sky.visible = false; scene.fog = null;
  const paper = LU.uRender.value > 0;
  const S = SCENES[state.env], flat = !!S.backplate; $('#panoBox') && ($('#panoBox').hidden = flat);  // a flat photo (30-refs) stays behind the scene instead of wrapping it
  panoSphere.visible = !paper && !flat; if (!paper) scene.background = null;
  panoTexture(file).then(t => {
    if (panoOf(state.env) !== file) return;
    if (flat) { t.encoding = THREE.sRGBEncoding; if (!paper) scene.background = t; } else { panoSphere.material.map = t; panoSphere.material.needsUpdate = true; }
    if (S.group === 'ref' && PANO.aimed !== state.env) { PANO.aimed = state.env; if (!flat) { PANO.sun[file] = PANO.sun[file] || sunFromImage(t.image); aimSun(PANO.sun[file], state.panoRot); } }
    const c = PANO.col[file]; hemi.color.copy(c.sky).lerp(new THREE.Color(0xffffff), .35); hemi.groundColor.copy(c.ground).multiplyScalar(.8);
  }, e => console.warn('pano', e));
}
function sceneTick() {
  // a flat backdrop covers the canvas without stretching (like background-size: cover)
  const bg = scene.background; if (bg && bg.isTexture && bg.image && bg.image.width) { const ca = W / Hh, ia = bg.image.width / bg.image.height, k = ca / ia;
    if (k > 1) { bg.repeat.set(1, 1 / k); bg.offset.set(0, (1 - 1 / k) / 2); } else { bg.repeat.set(k, 1); bg.offset.set((1 - k) / 2, 0); } }
  if (panoSphere.visible) { panoSphere.position.copy(camera.position); panoSphere.rotation.y = (state.panoRot || 0) * DEG; }
}

/* ---------- perspective framings ---------- */
const PERSP_SHOTS = {p1: ['1 punto', 0, 0], p2: ['2 puntos', 38, 0], p3a: ['3 puntos, picado', 38, 38], p3b: ['3 puntos, contrapicado', 38, -24]};
function perspShot(id) {
  const [, az, el] = PERSP_SHOTS[id];
  setRoll(0); frameAll();
  if (el < 0) { const t = controls.target; t.y = Math.max(t.y, 1.1 * mq.size); }  // looking up: the eye low, near the floor
  setView(az, el);
  state.guides.persp = true; const c = $('#gPersp'); if (c) c.checked = true;
}

/* ---------- multi-view ---------- */
// the main canvas narrows to the left; three small views (front, profile, top) are rendered with the same renderer
// before the main view each frame and copied to a canvas on the right
const MV = {on: false, cams: [0, 1, 2].map(() => new THREE.PerspectiveCamera(24, 1, .05, 200)), labels: ['Frente', 'Perfil', 'Arriba'].map(s => tr(s)), side: $('#mvSide')};
MV.ctx = MV.side.getContext('2d');
function aimMulti() {
  const box = castBox(), c = box.getCenter(new V3()), s = Math.max(box.getSize(new V3()).length(), 1), d = s * 2.6, yaw = mq.yaw();
  MV.cams.forEach((cam, i) => {
    if (i === 2) { cam.position.set(c.x, c.y + d, c.z); cam.up.set(-Math.sin(yaw), 0, -Math.cos(yaw)); }
    else { const a = yaw + (i ? Math.PI / 2 : 0); cam.position.set(c.x + Math.sin(a) * d, c.y, c.z + Math.cos(a) * d); cam.up.set(0, 1, 0); }
    cam.lookAt(c);
  });
}
function renderMulti() {
  if (!MV.on) return;
  const r = MV.side.getBoundingClientRect(), pr = renderer.getPixelRatio(), sw = Math.max(1, Math.min(r.width, W)), sh = Math.max(1, r.height / 3);
  if (MV.side.width !== Math.round(r.width * pr) || MV.side.height !== Math.round(r.height * pr)) { MV.side.width = Math.round(r.width * pr); MV.side.height = Math.round(r.height * pr); }
  aimMulti();
  const hide = [...Object.values(handles), ...Object.values(jointDots), sunHandle, sunRing, ...Object.values(pinRings)].map(o => [o, o.visible]); hide.forEach(([o]) => o.visible = false);
  const tcv = tc.visible; tc.visible = false;
  const x = MV.ctx; x.fillStyle = css('--stage'); x.fillRect(0, 0, MV.side.width, MV.side.height);
  MV.cams.forEach((cam, i) => {
    cam.aspect = sw / sh; cam.updateProjectionMatrix();
    renderer.setViewport(0, 0, sw, sh); renderer.render(scene, cam);
    x.drawImage(canvas, 0, canvas.height - sh * pr, sw * pr, sh * pr, 0, i * sh * pr, sw * pr, sh * pr);
  });
  hide.forEach(([o, v]) => o.visible = v); tc.visible = tcv;
  renderer.setViewport(0, 0, W, Hh);
  x.strokeStyle = css('--ink'); x.lineWidth = 1.5 * pr; x.fillStyle = css('--ink'); x.font = `600 ${11 * pr}px ${css('--f-mono')}`;
  x.beginPath(); for (let i = 1; i < 3; i++) { x.moveTo(0, i * sh * pr); x.lineTo(sw * pr, i * sh * pr); } x.stroke();
  MV.labels.forEach((l, i) => { const t = l.toUpperCase(), w = x.measureText(t).width;  // a paper tag, readable over any background
    x.fillStyle = css('--page'); x.fillRect(4 * pr, (i * sh + 4) * pr, w + 10 * pr, 17 * pr); x.fillStyle = css('--ink'); x.fillText(t, 9 * pr, (i * sh + 16.5) * pr); });
}
function setMulti(on) {
  MV.on = on; $('#viewport').classList.toggle('mv', on); const b = $('#multiBtn'); if (b) b.setAttribute('aria-pressed', String(on));
  resize();
}
function buildSceneExtrasUI() {
  slider($('#panoBox'), {id: 'panoRot', label: 'Girar el panorama', min: 0, max: 360, step: 1, value: state.panoRot || 0, fmt: v => Math.round(v) + '°', input: v => { state.panoRot = v; const f = panoOf(state.env); if (SCENES[state.env] && SCENES[state.env].group === 'ref' && PANO.sun[f]) aimSun(PANO.sun[f], v); }});  // the sun turns with a found panorama
  chips($('#perspChips'), Object.entries(PERSP_SHOTS).map(([k, v]) => [k, v[0]]), null, id => { perspShot(id); setPressed($('#perspChips'), ''); });
  $('#multiBtn').onclick = () => setMulti(!MV.on);
}
