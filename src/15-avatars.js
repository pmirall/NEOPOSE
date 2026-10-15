/* ---------- imported avatars (VRM, GLB, FBX) ----------
   VRM is glTF plus a humanoid map (which node is "hips", "leftUpperArm"…), the open standard behind VRoid and many
   VRChat avatars. Other files (Mixamo, VRChat/CATS, VRoid, Blender exports) are mapped by their bone names.
   The avatar is driven by the hidden NEOPOSE mannequin, so IK, FK, the rotation ring and the pose library keep
   working: each frame every mapped bone gets the mannequin joint's world rotation, corrected once for the
   difference between the two rest poses (T-pose vs our A-pose) by aligning bone directions. */
const AV_JOINTS = {hips: 'hips', waist: 'spine', chest: 'chest', neck: 'neck', head: 'head',
  shoulderL: 'leftUpperArm', elbowL: 'leftLowerArm', wristL: 'leftHand', shoulderR: 'rightUpperArm', elbowR: 'rightLowerArm', wristR: 'rightHand',
  hipL: 'leftUpperLeg', kneeL: 'leftLowerLeg', ankleL: 'leftFoot', hipR: 'rightUpperLeg', kneeR: 'rightLowerLeg', ankleR: 'rightFoot'};
const AV_FINGERS = ['Thumb', 'Index', 'Middle', 'Ring', 'Little'];
// direction of each of our joints at rest: towards this child
const AV_OUR_CHILD = {hips: 'waist', waist: 'chest', chest: 'neck', neck: 'head', shoulderL: 'elbowL', elbowL: 'wristL', wristL: 'fL20', shoulderR: 'elbowR', elbowR: 'wristR', wristR: 'fR20',
  hipL: 'kneeL', kneeL: 'ankleL', ankleL: 'toeL', hipR: 'kneeR', kneeR: 'ankleR', ankleR: 'toeR'};
const AV_CHILD = {hips: ['spine'], spine: ['chest', 'upperChest', 'neck'], chest: ['upperChest', 'neck'], neck: ['head'],
  leftUpperArm: ['leftLowerArm'], leftLowerArm: ['leftHand'], leftHand: ['leftMiddleProximal'], rightUpperArm: ['rightLowerArm'], rightLowerArm: ['rightHand'], rightHand: ['rightMiddleProximal'],
  leftUpperLeg: ['leftLowerLeg'], leftLowerLeg: ['leftFoot'], leftFoot: ['leftToes'], rightUpperLeg: ['rightLowerLeg'], rightLowerLeg: ['rightFoot'], rightFoot: ['rightToes']};
for (const s of ['left', 'right']) for (const f of AV_FINGERS) {
  const ch = f === 'Thumb' ? ['Metacarpal', 'Proximal', 'Intermediate', 'Distal'] : ['Proximal', 'Intermediate', 'Distal'];
  ch.forEach((k, i) => { if (ch[i + 1]) AV_CHILD[s + f + k] = [s + f + ch[i + 1]]; });
}

/* --- humanoid map from bone names (no VRM extension) --- */
function guessHumanoid(root) {
  const bones = []; root.traverse(o => { if (o.isBone || (o.type === 'Object3D' && o.children.length && /hip|spine|arm|leg|head/i.test(o.name))) bones.push(o); });
  const norm = n => n.toLowerCase().replace(/^.*[:|]/, '').replace(/mixamorig\d*_?/, '').replace(/^j_bip_[clr]_?/, m => m.slice(6)).replace(/^(bip0?1|def|org|b|c)[ _.-]/, '').replace(/[ _.-]/g, '');
  const side = n => { const r = n.toLowerCase(); if (/(^|[ _.:-])(l|left)([ _.-]|$)|left|^j_bip_l|\.l$|_l$/.test(r)) return 'left'; if (/(^|[ _.:-])(r|right)([ _.-]|$)|right|^j_bip_r|\.r$|_r$/.test(r)) return 'right'; return ''; };
  const mixamo = bones.some(b => /upleg/i.test(b.name));
  const out = {}, put = (k, b) => { if (!out[k]) out[k] = b; };
  for (const b of bones) {
    const n = norm(b.name), sd = side(b.name), k = n.replace(/^(left|right)/, '').replace(/(left|right|l|r)$/, '');
    if (!sd) {
      if (/^(hips|pelvis|hip)$/.test(k)) put('hips', b);
      else if (/^spine0?$|^spine$/.test(k)) put('spine', b);
      else if (/^(spine1|spine01|chest)$/.test(k)) put('chest', b);
      else if (/^(spine2|spine02|upperchest)$/.test(k)) put('upperChest', b);
      else if (/^neck/.test(k)) put('neck', b);
      else if (/^head$/.test(k)) put('head', b);
      continue;
    }
    const S = sd;
    let m = null;
    if (/^(shoulder|clavicle)$/.test(k)) m = 'Shoulder';
    else if (/^(upperarm|arm)$/.test(k)) m = 'UpperArm';
    else if (/^(forearm|lowerarm|elbow)$/.test(k)) m = 'LowerArm';
    else if (/^(hand|wrist)$/.test(k)) m = 'Hand';
    else if (/^(upleg|upperleg|thigh|leg)$/.test(k)) m = (k === 'leg' && mixamo) ? 'LowerLeg' : 'UpperLeg';
    else if (/^(lowerleg|calf|shin|knee)$/.test(k)) m = 'LowerLeg';
    else if (/^(foot|ankle)$/.test(k)) m = 'Foot';
    else if (/^(toebase|toes?|toe0?)$/.test(k)) m = 'Toes';
    else {
      const f = /(thumb|index|middle|ring|pinky|little)(\d)/.exec(k.replace(/proximal/, '1').replace(/intermediate/, '2').replace(/distal/, '3'));
      if (f) { const nm = {thumb: 'Thumb', index: 'Index', middle: 'Middle', ring: 'Ring', pinky: 'Little', little: 'Little'}[f[1]]; const seg = nm === 'Thumb' ? ['Metacarpal', 'Proximal', 'Distal'] : ['Proximal', 'Intermediate', 'Distal']; const j = +f[2] - (/0$/.test(f[2]) ? 0 : 1); if (seg[j]) put(S + nm + seg[j], b); }
    }
    if (m) put(S + m, b);
  }
  return out;
}

/* --- loading --- */
const avLoaderGLTF = new THREE.GLTFLoader();
function glbStripRequired(buf) {
  // GLTFLoader refuses unknown *required* extensions (VRM / MToon); they only add materials we don't need
  const dv = new DataView(buf); if (dv.getUint32(0, true) !== 0x46546C67) return buf;
  const jl = dv.getUint32(12, true), json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jl)));
  if (!json.extensionsRequired || !json.extensionsRequired.length) return buf;
  json.extensionsRequired = json.extensionsRequired.filter(e => /^KHR_|^EXT_/.test(e));
  let t = new TextEncoder().encode(JSON.stringify(json)); const pad = (4 - t.length % 4) % 4; if (pad) { const u = new Uint8Array(t.length + pad); u.set(t); u.fill(32, t.length); t = u; }
  const rest = new Uint8Array(buf, 20 + jl), out = new Uint8Array(20 + t.length + rest.length), o = new DataView(out.buffer);
  out.set(new Uint8Array(buf, 0, 12)); o.setUint32(8, out.length, true); o.setUint32(12, t.length, true); o.setUint32(16, 0x4E4F534A, true); out.set(t, 20); out.set(rest, 20 + t.length);
  return out.buffer;
}
async function parseAvatar(buf, name) {
  const lower = (name || '').toLowerCase(), isGLB = new DataView(buf).getUint32(0, true) === 0x46546C67;
  if (/\.fbx$/.test(lower) || (!isGLB && /FBX|Kaydara/.test(new TextDecoder().decode(new Uint8Array(buf, 0, Math.min(64, buf.byteLength)))))) {
    const obj = new THREE.FBXLoader().parse(buf, '');
    return {scene: obj, map: guessHumanoid(obj), vrm0: false, meta: {}};
  }
  const gl = await new Promise((res, rej) => avLoaderGLTF.parse(glbStripRequired(buf), '', res, rej));
  const j = gl.parser.json, ext = j.extensions || {}, map = {};
  let vrm0 = false, meta = {};
  if (ext.VRM && ext.VRM.humanoid) {
    vrm0 = true; meta = ext.VRM.meta || {};
    for (const hb of ext.VRM.humanoid.humanBones || []) map[hb.bone] = await gl.parser.getDependency('node', hb.node);
  } else if (ext.VRMC_vrm && ext.VRMC_vrm.humanoid) {
    meta = ext.VRMC_vrm.meta || {};
    for (const [k, v] of Object.entries(ext.VRMC_vrm.humanoid.humanBones || {})) map[k] = await gl.parser.getDependency('node', v.node);
  }
  const m = Object.keys(map).length ? map : guessHumanoid(gl.scene);
  return {scene: gl.scene, map: m, vrm0, meta};
}
// sketch-friendly materials (same lighting and pencil styles as the scenery) and ink outlines
function avatarMaterials(root) {
  const cache = new Map(), hulls = [];
  root.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = true; o.frustumCulled = false;
    const conv = mat => {
      if (cache.has(mat)) return cache.get(mat);
      const cut = mat.transparent || mat.alphaTest > 0;
      // FBX files often keep their textures outside the file and come with a black diffuse: show them in light clay instead
      const col = mat.color ? mat.color.clone() : new THREE.Color(0xffffff);
      if (!mat.map && col.r + col.g + col.b < .15) col.setHex(0xd9d2c3);
      const n = patchEnv(new THREE.MeshStandardMaterial({color: col, map: mat.map || null, roughness: .85, metalness: 0, side: THREE.DoubleSide, alphaTest: cut ? .4 : 0}));
      if (n.map) n.map.encoding = THREE.LinearEncoding;
      // textures referenced by the file but missing on disk never load: fall back to clay
      if (n.map) setTimeout(() => { const im = n.map && n.map.image; if (!im || (im.naturalWidth === 0 && im.width === 0)) { n.map = null; if (n.color.r + n.color.g + n.color.b < .15) n.color.setHex(0xd9d2c3); n.needsUpdate = true; } }, 2500);
      cache.set(mat, n); return n;
    };
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
    if (o.isSkinnedMesh) hulls.push(o);
  });
  for (const o of hulls) { const h = new THREE.SkinnedMesh(o.geometry, OUTLINE_MAT); h.userData.isHull = true; h.frustumCulled = false; h.raycast = () => {}; h.bind(o.skeleton, o.bindMatrix); o.parent.add(h); }
}

/* --- binding to a character --- */
function attachAvatar(m, parsed, info) {
  detachAvatar(m);
  const root = new THREE.Group(), inner = parsed.scene;
  if (parsed.vrm0) inner.rotation.y = Math.PI; // VRM 0.x faces -Z
  root.add(inner); scene.add(root); root.updateMatrixWorld(true);
  avatarMaterials(inner);
  const map = parsed.map;
  if (!map.hips || !map.leftUpperArm || !map.leftUpperLeg) { scene.remove(root); throw new Error('no humanoid'); }
  // scale: hip height of the avatar = hip height of the mannequin
  const bb = new THREE.Box3().setFromObject(inner), hipY = map.hips.getWorldPosition(new V3()).y - bb.min.y;
  const s = (m.rootY || .95) / Math.max(hipY, 1e-3); root.scale.setScalar(s); root.updateMatrixWorld(true);
  const wp = b => b.getWorldPosition(new V3()), J = m.J, jp = n => new V3(J[FIG.jIdx[n] * 3], J[FIG.jIdx[n] * 3 + 1], J[FIG.jIdx[n] * 3 + 2]);
  const ours = [];
  for (const [j, vb] of Object.entries(AV_JOINTS)) ours.push([j, vb]);
  for (const sd of ['L', 'R']) AV_FINGERS.forEach((f, fi) => {
    const S = sd === 'L' ? 'left' : 'right', segs = f === 'Thumb' ? (map[S + 'ThumbMetacarpal'] ? ['Metacarpal', 'Proximal', 'Distal'] : ['Proximal', 'Intermediate', 'Distal']) : ['Proximal', 'Intermediate', 'Distal'];
    segs.forEach((g, k) => ours.push([`f${sd}${fi}${k}`, S + f + g]));
  });
  const links = [];
  for (const [j, vb] of ours) {
    const b = map[vb]; if (!b || !m.joints[j] && !m.bones[FIG.jIdx[j]]) continue;
    const myBone = m.joints[j] || m.bones[FIG.jIdx[j]];
    // rest correction: rotate the avatar's bone direction onto ours
    let C = new Q();
    const oc = AV_OUR_CHILD[j] || (/^f[LR]\d[01]$/.test(j) ? j.slice(0, 3) + (+j[3] + 1) : /^f[LR]\d2$/.test(j) ? 'tip' + j[1] + j[2] : null);
    const vc = (AV_CHILD[vb] || []).map(k => map[k]).find(Boolean);
    if (oc && FIG.jIdx[oc] !== undefined && vc) {
      const dO = jp(oc).sub(jp(j)), dA = wp(vc).sub(wp(b));
      if (dO.lengthSq() > 1e-10 && dA.lengthSq() > 1e-10) C.setFromUnitVectors(dA.normalize(), dO.normalize());
    } else if (links.length) { const par = links.find(l => l.b === b.parent || l.b === (b.parent && b.parent.parent)); if (par) C.copy(par.C); }
    links.push({j, b, my: myBone, C, rest: b.getWorldQuaternion(new Q())});
  }
  // parents before children
  const depth = o => { let d = 0; while (o.parent) { d++; o = o.parent; } return d; };
  links.sort((a, c) => depth(a.b) - depth(c.b));
  const meshes = []; inner.traverse(o => { if (o.isMesh && !o.userData.isHull) { meshes.push(o); o.userData.avatarOf = m; } });
  m.avatar = {root, inner, links, hips: map.hips, meshes, info, scale: s};
  m.body.avatar = info;
  retargetAvatar(m);
}
function detachAvatar(m) {
  if (!m.avatar) return;
  scene.remove(m.avatar.root);
  m.avatar.root.traverse(o => { if (o.isMesh && !o.userData.isHull) { o.geometry.dispose(); } });
  m.avatar = null;
  m.group.traverse(o => { if (o.isMesh && o.userData.avHidden) { o.visible = true; o.userData.avHidden = false; } });
}
const _avQ = new Q(), _avP = new Q(), _avV = new V3(), _avH = new V3();
function retargetAvatar(m) {
  const av = m.avatar; if (!av) return;
  m.group.updateMatrixWorld(true);
  for (const l of av.links) {
    l.my.getWorldQuaternion(_avQ);
    _avQ.multiply(l.C).multiply(l.rest);
    l.b.parent.getWorldQuaternion(_avP);
    l.b.quaternion.copy(_avP.invert().multiply(_avQ));
    l.b.updateMatrixWorld(true);
  }
  // hips follow the mannequin's pelvis
  m.joints.hips.getWorldPosition(_avH); av.hips.getWorldPosition(_avV);
  av.root.position.add(_avH.sub(_avV)); av.root.updateMatrixWorld(true);
}
function avatarsTick() {
  for (const m of chars) {
    const want = m.body.avatar;
    if (want && (!m.avatar || m.avatar.info.id !== want.id) && !m._avLoading) {
      if (want.url) loadAvatarFor(m, want);
      else { m._avLoading = true; avatarDB.get(want.id).then(r => { m._avLoading = false; if (r) loadAvatarFor(m, want, r.buf); else { delete m.body.avatar; toast(tr('El avatar «{x}» ya no está guardado en este navegador; vuelve a importarlo.', {x: want.name})); } }); }
    }
    if (!want && m.avatar) detachAvatar(m);
    if (!m.avatar) continue;
    m.group.traverse(o => { if (o.isMesh && o.visible) { o.visible = false; o.userData.avHidden = true; } });
    m.avatar.root.visible = m.group.visible;
    retargetAvatar(m);
  }
}

/* --- sources: local files and the Open Source Avatars registry (CC0 / CC-BY VRM) --- */
const AV_REG = 'https://raw.githubusercontent.com/toxsam/open-source-avatars/main/data/';
async function loadAvatarFor(m, info, buf) {
  m._avLoading = true; toast(tr('Cargando avatar «{x}»…', {x: info.name}));
  try {
    if (!buf) { const r = await fetch(info.url); if (!r.ok) throw new Error(r.status); buf = await r.arrayBuffer(); }
    const parsed = await parseAvatar(buf, info.file || info.name);
    attachAvatar(m, parsed, info);
    toast(tr('Avatar «{x}» listo. Se posa con los mismos controles.', {x: info.name}));
    renderAvatarUI();
  } catch (e) {
    console.error(e); delete m.body.avatar;
    toast(tr(/humanoid/.test(e.message) ? 'Ese modelo no tiene un esqueleto humanoide reconocible.' : info.url ? 'No se ha podido cargar el avatar (¿hay conexión?).' : 'No se ha podido cargar el avatar.'));
  }
  m._avLoading = false;
}
// avatars from a file are kept in this browser (the 8 most recent), so scenes that use them can load them again
const avatarDB = {
  open() { return new Promise((res, rej) => { try { const r = indexedDB.open('cdp-avatars', 1); r.onupgradeneeded = () => r.result.createObjectStore('a', {keyPath: 'id'}); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } }); },
  async get(id) { try { const db = await this.open(); return await new Promise(res => { const q = db.transaction('a').objectStore('a').get(id); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); } catch (_) { return null; } },
  async put(v) {
    try {
      const db = await this.open(), st = db.transaction('a', 'readwrite').objectStore('a');
      st.put({...v, at: Date.now()});
      const q = st.getAll(); q.onsuccess = () => { for (const old of (q.result || []).sort((a, b) => b.at - a.at).slice(8)) st.delete(old.id); };
    } catch (_) {}
  }
};
function importAvatarFile(file) {
  if (!file) return;
  file.arrayBuffer().then(buf => {
    const info = {id: 'file:' + file.name + ':' + file.size, name: file.name.replace(/\.(vrm|glb|gltf|fbx)$/i, ''), file: file.name, license: 'Archivo propio'};
    avatarDB.put({id: info.id, file: file.name, buf});
    return loadAvatarFor(mq, info, buf);
  }).then(pushHistory);
}
let AV_GAL = null;
async function openAvatarGallery() {
  $('#avGallery').hidden = false; const grid = $('#avGrid'), msg = $('#avMsg');
  if (AV_GAL) return renderAvatarGallery();
  msg.textContent = tr('Cargando la galería…'); grid.innerHTML = '';
  try {
    const projects = (await (await fetch(AV_REG + 'projects.json')).json()).filter(p => /^CC/.test(p.license || ''));
    const lists = await Promise.all(projects.map(p => fetch(AV_REG + p.avatar_data_file).then(r => r.json()).then(a => a.map(x => ({...x, project: p.name, license: p.license}))).catch(() => [])));
    AV_GAL = {all: lists.flat().filter(a => a.model_file_url && /vrm/i.test(a.format || 'VRM')), projects: projects.map(p => p.name), filter: 'animales'};
    msg.textContent = '';
    renderAvatarGallery();
  } catch (e) { msg.textContent = tr('Necesitas conexión a Internet para ver la galería.'); }
}
const AV_ANIMAL = /fox|wolf|cat|dog|bunny|rabbit|bear|dragon|lizard|goat|deer|kitsune|neko|mouse|rat|tiger|lion|horse|shark|frog|bird|owl|monkey|ape|panda|pig|cow|bull|duck|croc|snake|bat|moth|furry|beast|kemono|dino/i;
function renderAvatarGallery() {
  const g = AV_GAL, grid = $('#avGrid');
  chips($('#avFilter'), [['animales', 'Animales'], ['todos', 'Todos'], ...g.projects.map(p => [p, p])], g.filter, v => { g.filter = v; renderAvatarGallery(); });
  const list = g.all.filter(a => g.filter === 'todos' ? true : g.filter === 'animales' ? AV_ANIMAL.test(a.name + ' ' + (a.description || '')) : a.project === g.filter);
  grid.innerHTML = '';
  $('#avCount').textContent = tr('{n} avatares', {n: list.length});
  for (const a of list) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'libItem';
    const img = document.createElement('img'); img.loading = 'lazy'; img.alt = ''; img.src = a.thumbnail_url || '';
    img.onerror = () => { const d = document.createElement('div'); d.className = 'noimg'; d.textContent = a.name; img.replaceWith(d); };
    const t = document.createElement('span'); t.className = 'lt'; t.textContent = a.name;
    b.append(img, t); b.title = `${a.name} · ${a.project} · ${tr(a.license)}`;
    b.onclick = () => { $('#avGallery').hidden = true; mq.body.avatar = {id: a.id, name: a.name, url: a.model_file_url, license: a.license, project: a.project}; pushHistory(); };
    grid.appendChild(b);
  }
}
function renderAvatarUI() {
  const box = $('#avInfo'); if (!box) return;
  const a = mq.body.avatar;
  $('#avRemove').hidden = !a;
  box.textContent = a ? tr('Avatar: «{x}»', {x: a.name}) + (a.project ? ' · ' + a.project : '') + ' · ' + tr(a.license || '') + tr('. La ropa, la especie y los deslizadores del cuerpo solo cambian el maniquí.') :
    tr('Usa tu propio modelo humanoide (VRM de VRoid o VRChat, GLB, FBX de Mixamo…) o elige uno libre de la galería. Se posa con los mismos controles.');
}
function initAvatars() {
  $('#avImport').onclick = () => $('#avFile').click();
  $('#avFile').onchange = e => { importAvatarFile(e.target.files[0]); e.target.value = ''; };
  $('#avBrowse').onclick = openAvatarGallery;
  $('#avClose').onclick = () => { $('#avGallery').hidden = true; };
  $('#avGallery').onclick = e => { if (e.target === e.currentTarget) $('#avGallery').hidden = true; };
  $('#avRemove').onclick = () => { delete mq.body.avatar; detachAvatar(mq); renderAvatarUI(); pushHistory(); };
  // drop a model file on the canvas
  vp.addEventListener('dragover', e => { if ([...e.dataTransfer.items].some(i => i.kind === 'file')) e.preventDefault(); });
  vp.addEventListener('drop', e => { const f = [...e.dataTransfer.files].find(f => /\.(vrm|glb|fbx)$/i.test(f.name)); if (f) { e.preventDefault(); importAvatarFile(f); } });
  renderAvatarUI();
}
