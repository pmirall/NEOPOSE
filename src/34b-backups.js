/* ======================= nothing is lost =======================
   Besides the autosave (one slot: the work as it is now), copies of the whole work (cast, scene, film, comic, bible,
   sketch) are kept on this device: one every ten minutes of work, and one before anything that replaces the work
   (opening a file or a shared link, starting afresh, making the film again, bringing back an older copy). Settings
   lists them and brings any of them back. A failed save says so (once) and offers a file instead; a second tab of the
   app is warned about (both would write the same autosave). */
const SNAPS = {key: 'cdp.snaps', max: 10, every: 10 * 60e3, last: Date.now(), failed: false, saved: 0, persist: false};
// the whole work, as the autosave keeps it
function workData() { return JSON.stringify({v: 1, t: Date.now(), ...snapshot(), ...sceneExtras(true, {project: true}), sketch: sk.strokes.length ? sk.strokes : undefined}); }
// the work is still the scene the app starts with (nothing worth a copy)
const workPristine = () => histStr() === AUTO.base && !animState() && !(typeof projectState === 'function' && projectState()) && !sk.strokes.length;
async function snapList() { try { return (await idb.get(SNAPS.key)) || []; } catch (_) { return []; } }
async function keepSnap(label, data) {
  data = data || workData(); const L = await snapList();
  if (L[0] && L[0].data === data) return L[0];
  const it = {t: Date.now(), label: label || '', data}; L.unshift(it); L.length = Math.min(L.length, SNAPS.max);
  try { await idb.set(SNAPS.key, L); } catch (e) { storageFailed(e); return null; }
  renderSnaps(); return it;
}
// a copy before the work is replaced; null when there is nothing to keep
async function beforeReplace(label) { if (AUTO.base === null || workPristine()) return null; return keepSnap(label); }
// a copy brought back: the current work is kept first, then the app starts again on the copy
async function recoverSnap(it) {
  if (!it) return;
  await keepSnap(tr('Antes de recuperar una copia'));
  AUTO.base = null; clearTimeout(AUTO.t);  // (nothing may overwrite it on the way out)
  try { await idb.set(AUTO.key, it.data); } catch (e) { try { localStorage.setItem(AUTO.key, it.data); } catch (_) { storageFailed(e); return; } }
  try { localStorage.removeItem(AUTO.key); } catch (_) {}
  try { sessionStorage.removeItem('cdp.carry'); } catch (_) {}
  if (location.hash) location.replace(location.pathname + location.search); else location.reload();
}
function storageFailed(e) {
  console.warn('storage', e); if (SNAPS.failed) return; SNAPS.failed = true;
  toast(tr('No se ha podido guardar en este dispositivo (¿falta espacio?). Guarda un archivo .neopose para no perder el trabajo.'), {act: ['Guardar archivo…', () => saveNeopose()], ms: 15000});
}
// after each autosave: a copy now and then, the time shown in Settings, and (once) asking the browser to keep the data
function afterAutosave(data) {
  SNAPS.saved = Date.now(); syncSavedLabel();
  if (data && Date.now() - SNAPS.last > SNAPS.every) { SNAPS.last = Date.now(); keepSnap(tr('Copia automática'), data); }
  // (Firefox asks the person about it, so it is not asked there)
  if (!SNAPS.persist && navigator.storage && navigator.storage.persist && !/Firefox\//.test(navigator.userAgent)) { SNAPS.persist = true; navigator.storage.persisted().then(p => p || navigator.storage.persist()).catch(() => {}); }
}
const whenStr = t => { try { return new Date(t).toLocaleString(LANG, {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'}); } catch (_) { return new Date(t).toLocaleString(); } };
function syncSavedLabel() { const el = $('#snapSaved'); if (el) el.textContent = SNAPS.saved ? tr('Guardado automáticamente: {t}', {t: whenStr(SNAPS.saved)}) : tr('Se guarda solo mientras trabajas.'); }
async function renderSnaps() {
  const box = $('#snapList'); if (!box) return; syncSavedLabel();
  const L = await snapList(); box.innerHTML = '';
  if (!L.length) { const p = document.createElement('p'); p.className = 'note'; p.textContent = tr('Aún no hay copias: se hacen solas mientras trabajas y antes de abrir otro trabajo.'); box.appendChild(p); return; }
  for (const it of L) {
    const row = document.createElement('div'); row.className = 'snaprow';
    const t = document.createElement('span'); t.textContent = `${whenStr(it.t)} · ${it.label || tr('Copia')}`;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn small'; b.textContent = tr('Recuperar'); b.onclick = () => recoverSnap(it);
    row.append(t, b); box.appendChild(row);
  }
}
// another tab of the app: both would write the same autosave
function watchTabs() {
  if (!('BroadcastChannel' in window)) return; const ch = new BroadcastChannel('neopose'), me = Math.random().toString(36).slice(2);
  ch.onmessage = e => { const m = e.data || {}; if (m.hello && m.hello !== me) ch.postMessage({here: me}); else if (m.here && m.here !== me && !SNAPS.twin) { SNAPS.twin = true; toast(tr('NEOPOSE ya está abierto en otra pestaña: su autoguardado y el de esta se pisan. Trabaja en una sola.'), {ms: 12000}); } };
  ch.postMessage({hello: me});
}
function buildBackupsUI() {
  watchTabs(); watchGL(); watchErrors();
  if (!$('#snapList')) return;
  // (the list is read again whenever Settings opens)
  new MutationObserver(() => { if (!$('#setModal').hidden) renderSnaps(); }).observe($('#setModal'), {attributes: true, attributeFilter: ['hidden']});
  $('#snapNow').onclick = async () => { if (await keepSnap(tr('Copia manual'))) toast(tr('Copia guardada en este dispositivo')); };
}
// the 3D view lost (the system took the graphics back: a phone sent to the background, a driver reset): three.js
// takes it again when the system allows; meanwhile the person knows, the work is saved, and a reload is offered if
// it does not come back
function watchGL() {
  const cv = renderer.domElement; let t = 0;
  cv.addEventListener('webglcontextlost', e => {
    e.preventDefault(); autosaveNow(true); toast(tr('La vista 3D se ha perdido un momento; recuperándola…'), {ms: 8000});
    t = setTimeout(() => toast(tr('La vista 3D no ha vuelto. Tu trabajo está guardado: recarga para seguir.'), {act: ['Recargar', () => location.reload()], ms: 60000}), 6000);
  });
  cv.addEventListener('webglcontextrestored', () => { clearTimeout(t); if (typeof wake === 'function') wake(); toast(tr('Vista 3D recuperada')); });
}
// a fault in the app itself (not a cancelled share or a missing optional file): said once, with the work saved first
function watchErrors() {
  let said = false;
  const say = () => { if (said) return; said = true; try { autosaveNow(true); } catch (_) {} toast(tr('Algo ha fallado. Tu trabajo está guardado; si algo deja de responder, recarga la página.'), {act: ['Recargar', () => location.reload()], ms: 15000}); };
  addEventListener('error', e => { if (!e.error || /^(chrome|moz|safari)-extension:/.test(e.filename || '') || /ResizeObserver/.test(e.message || '')) return; say(); });
  addEventListener('unhandledrejection', e => { const r = e.reason; if (r && /^(TypeError|ReferenceError|RangeError|SyntaxError)$/.test(r.name)) say(); });
}
