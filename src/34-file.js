/* ======================= .neopose files =======================
   A whole piece of work in one file, to keep, move to another device or send: the cast (bodies, coats, poses,
   clothes, hair), the set, objects and lights, the camera and the look, the film with all its shots, the sketch layer
   and the guides, and any avatar imported from a file (gallery avatars are only named: they come back from the
   gallery). A .neopose is a ZIP:
     scene.json   {format: 'neopose', version, app, saved, name, scene: {…snapshot, …extras}, sketch, ui}
     thumb.png    a picture of the scene as it was saved (file managers and the app's own list can show it)
     avatars/<id> the imported avatars the scene uses
   `version` is the file format's, not the app's: older files are brought up to date by migrateScene() step by step,
   and a newer file still opens, with a warning, keeping what this version understands. */
const NP_VERSION = 1;
const NP_MIGRATIONS = {
  // 0 → 1: the first files were the plain JSON of "Copy as text" ({cdp: 1, chars, …}); they become the scene
  0: o => ({format: 'neopose', version: 1, scene: o})
};
function migrateScene(o) {
  if (o && o.cdp && !o.format) o = {version: 0, ...o};
  let v = o.version ?? 0;
  while (v < NP_VERSION && NP_MIGRATIONS[v]) { o = NP_MIGRATIONS[v](o); v = o.version; }
  return o;
}
async function neoposeBytes(name) {
  const scene = {...snapshot(), ...sceneExtras(true)}, files = {};
  // imported avatars travel inside; gallery ones are only named
  for (const m of chars) {
    const a = m.body.avatar; if (!a || a.url || files[`avatars/${a.id}`]) continue;
    const r = await avatarDB.get(a.id); if (r && r.buf) files[`avatars/${a.id}`] = new Uint8Array(r.buf);
  }
  const doc = {format: 'neopose', version: NP_VERSION, app: APP_VERSION, saved: new Date().toISOString(), name: name || '',
    scene, sketch: sk.strokes.length ? sk.strokes : undefined, ui: {guides: {...state.guides}, ratio: state.ratio},
    avatars: Object.keys(files).map(k => {
      const id = k.slice(8), m = chars.find(c => c.body.avatar && c.body.avatar.id === id); return {id, name: m.body.avatar.name, file: m.body.avatar.file}; })};
  files['scene.json'] = fflate.strToU8(JSON.stringify(doc));
  try { files['thumb.png'] = await sceneThumb(); } catch (_) {}
  return fflate.zipSync(files, {level: 6});
}
// a 480 px picture of the canvas as it is
function sceneThumb() {
  renderer.render(scene, camera);
  const src = renderer.domElement, k = 480 / Math.max(src.width, src.height), c = document.createElement('canvas');
  c.width = Math.round(src.width * k); c.height = Math.round(src.height * k); c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return new Promise(res => c.toBlob(b => b ? b.arrayBuffer().then(a => res(new Uint8Array(a))) : res(null), 'image/png'));
}
async function saveNeopose() {
  const name = ($('#poseName') && $('#poseName').value.trim()) || '';
  const file = `${(name || 'escena').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'escena'}-${stamp()}.neopose`;
  try { const bytes = await neoposeBytes(name); await saveFile(file, bytes, 'application/x-neopose'); toast(tr('Guardado en «{f}»', {f: file})); }
  catch (e) { console.warn('neopose save', e); toast(tr('No se ha podido guardar: {e}', {e: e && e.message || e})); }
}
// read a .neopose (or the JSON of "Copy as text") and put it on the canvas; undo goes back to what was there
async function openNeopose(file) {
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    let doc, files = {};
    if (buf[0] === 0x50 && buf[1] === 0x4b) { files = fflate.unzipSync(buf); if (!files['scene.json']) throw new Error(tr('no es un archivo de NEOPOSE')); doc = JSON.parse(fflate.strFromU8(files['scene.json'])); }
    else doc = JSON.parse(fflate.strFromU8(buf));
    doc = migrateScene(doc);
    if (!doc.scene || !doc.scene.chars || !doc.scene.chars.length) throw new Error(tr('no es un archivo de NEOPOSE'));
    for (const a of doc.avatars || []) { const b = files[`avatars/${a.id}`]; if (b) await avatarDB.put({id: a.id, file: a.file || a.name, buf: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)}); }
    if (ANIM.playing) play(false);
    restore(doc.scene);
    if (doc.scene.cam) applySceneExtras({cam: doc.scene.cam}); else frameAll();
    sk.strokes = Array.isArray(doc.sketch) ? doc.sketch : []; sk.redo = []; redrawSketch();
    if (doc.ui) {
      if (doc.ui.guides) { Object.assign(state.guides, doc.ui.guides); for (const [id, k] of [['#gThirds', 'thirds'], ['#gPersp', 'persp'], ['#gGrid', 'grid'], ['#gRuler', 'ruler']]) { const el = $(id); if (el) el.checked = !!state.guides[k]; } grid.visible = state.guides.grid; }
      if (doc.ui.ratio && RATIOS[doc.ui.ratio]) { state.ratio = doc.ui.ratio; setPressed($('#ratioChips'), state.ratio); }
    }
    pushHistory();
    const newer = doc.version > NP_VERSION;
    toast(newer ? tr('Este archivo es de una versión más nueva de NEOPOSE ({v}); se ha abierto lo que esta versión entiende.', {v: doc.app || '?'})
      : tr('Abierto «{f}»', {f: doc.name || file.name}), {undo: true});
  } catch (e) { console.warn('neopose open', e); toast(tr('No se ha podido abrir «{f}»: {e}', {f: file.name, e: e && e.message || e})); }
}
function pickNeopose() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.neopose,.json,application/zip';
  inp.onchange = () => { if (inp.files[0]) openNeopose(inp.files[0]); }; inp.click();
}
function buildFileUI() {
  const save = $('#saveFile'), open = $('#openFile');
  if (save) save.onclick = saveNeopose; if (open) open.onclick = pickNeopose;
  // the desktop app opened with a .neopose (double click or "Open with")
  if (window.neoposeNative && neoposeNative.onOpenFile) neoposeNative.onOpenFile((name, bytes) => openNeopose(new File([bytes], name)));
  vp.addEventListener('dragover', e => { if ([...e.dataTransfer.items].some(i => i.kind === 'file')) e.preventDefault(); });
  vp.addEventListener('drop', e => { const f = [...e.dataTransfer.files].find(f => /\.neopose$/i.test(f.name)); if (f) { e.preventDefault(); openNeopose(f); } });
  addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.target.closest('input, textarea, [contenteditable]')) return;
    const k = e.key.toLowerCase();
    if (k === 's') { e.preventDefault(); saveNeopose(); } else if (k === 'o') { e.preventDefault(); pickNeopose(); }
  });
}
