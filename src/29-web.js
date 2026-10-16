/* ======================= the web app (GitHub Pages): install, offline, iPhone and iPad =======================
   For people who cannot install the desktop or Android builds, iOS above all: the page installs to the home screen
   (Safari: Share → Add to Home Screen; Chrome and Edge: Install), works offline once opened, keeps its data
   (persistent storage when installed) and saves files through the share sheet, since a download link strands an
   installed iOS app. A new version waits for the user's "Update". Nothing here runs in the desktop or Android apps. */
const WEB = {
  ios: /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
  standalone: matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
  native: !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) || !!window.neoposeNative || location.protocol === 'app:',
  reg: null, prompt: null
};
WEB.web = !WEB.native && (location.protocol === 'https:' || /[?&]pwa\b/.test(location.search));  // localhost and file:// stay plain pages (and the tests with them), unless ?pwa

// files out of an installed iOS app: the share sheet (Save Image, Save to Files, AirDrop)
async function shareFile(name, bytes, mime) {
  const file = new File([bytes], name, {type: mime});
  if (!navigator.canShare || !navigator.canShare({files: [file]})) return false;
  try { await navigator.share({files: [file], title: 'NEOPOSE'}); return true; }
  catch (e) {
    if (e && e.name === 'AbortError') return true;  // the person closed the sheet
    // the tap that started it is too far back (the image took a while): one more tap opens the sheet
    toastAction(tr('«{x}» está listo.', {x: name}), tr('Guardar o compartir'), () => navigator.share({files: [file], title: 'NEOPOSE'}).catch(() => {}));
    return true;
  }
}
function toastAction(msg, label, fn) {
  toast(msg); const h = $('#hint'), b = document.createElement('button'); b.type = 'button'; b.className = 'undo'; b.textContent = label;
  b.onclick = () => { fn(); h.classList.remove('toast'); }; h.append(' ', b);
}

/* ---------- the service worker: offline and updates ---------- */
function initServiceWorker() {
  if (!WEB.web || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    WEB.reg = reg;
    const offer = w => { if (!w || !navigator.serviceWorker.controller) return;
      toastAction(tr('Hay una versión nueva de NEOPOSE.'), tr('Actualizar'), () => { autosaveNow(true); carryScene(); w.postMessage('skipWaiting'); }); };
    if (reg.waiting) offer(reg.waiting);
    reg.addEventListener('updatefound', () => { const w = reg.installing; w && w.addEventListener('statechange', () => { if (w.state === 'installed') offer(w); }); });
    // installed apps are resumed rather than relaunched: look for a new version when they come back
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(e => console.warn('sw', e));
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; autosaveNow(true); carryScene(); location.reload(); } });
  if (WEB.standalone && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}

/* ---------- offline: every file, downloaded once ---------- */
async function downloadForOffline() {
  const btn = $('#offlineBtn'), msg = $('#offlineMsg');
  try {
    if (navigator.storage && navigator.storage.persist) await navigator.storage.persist().catch(() => false);
    const list = await (await fetch('offline.json', {cache: 'no-cache'})).json(), cache = await caches.open('neopose-assets-' + list.version);
    const total = list.files.reduce((a, f) => a + f[1], 0); let done = 0, i = 0;
    btn.disabled = true;
    const next = async () => {
      while (i < list.files.length) {
        const [f, size] = list.files[i++];
        if (!(await cache.match(f))) { const r = await fetch(f); if (r.ok) await cache.put(f, r); }
        done += size; msg.textContent = tr('Descargando para usar sin conexión: {p} %', {p: Math.floor(done / total * 100)});
      }
    };
    await Promise.all([next(), next(), next(), next()]);
    msg.textContent = tr('Listo: NEOPOSE funciona sin conexión ({mb} MB).', {mb: Math.round(total / 2 ** 20)});
  } catch (e) { msg.textContent = tr('No se ha podido completar: {e}', {e: e && e.message || e}); }
  btn.disabled = false;
}

/* ---------- install hint: iOS has no install button of its own ---------- */
function showInstallHint() {
  if (!WEB.web || WEB.standalone || store.get('cdp.installHint', false)) return;
  const box = $('#installHint');
  if (WEB.ios) $('#ihText').innerHTML = tr('Instálala en tu {d}: pulsa <b>Compartir</b> <span class="ihshare" aria-hidden="true"></span> y luego <b>Añadir a pantalla de inicio</b>. Funcionará a pantalla completa y sin conexión.', {d: /iPad|Macintosh/.test(navigator.userAgent) ? 'iPad' : 'iPhone'});
  else if (WEB.prompt) { $('#ihText').textContent = tr('Instala NEOPOSE como aplicación: se abre en su propia ventana y funciona sin conexión.'); $('#ihInstall').hidden = false; }
  else return;
  box.hidden = false;
}
function initInstall() {
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); WEB.prompt = e; setTimeout(showInstallHint, 4000); });
  $('#ihInstall').onclick = async () => { const p = WEB.prompt; if (!p) return; p.prompt(); await p.userChoice.catch(() => {}); WEB.prompt = null; $('#installHint').hidden = true; };
  $('#ihClose').onclick = () => { $('#installHint').hidden = true; store.set('cdp.installHint', true); };
  addEventListener('appinstalled', () => { $('#installHint').hidden = true; store.set('cdp.installHint', true); });
  if (WEB.ios) setTimeout(showInstallHint, 6000);
}

/* ---------- iOS: the page must not zoom or bounce under the fingers ---------- */
function initIOS() {
  document.documentElement.classList.toggle('ios', WEB.ios); document.documentElement.classList.toggle('standalone', WEB.standalone);
  if (!WEB.ios) return;
  for (const t of ['gesturestart', 'gesturechange']) document.addEventListener(t, e => e.preventDefault(), {passive: false});
}

function buildWeb() {
  initIOS(); initServiceWorker(); initInstall();
  const row = $('#offlineRow'); if (row) row.hidden = !WEB.web;
  const b = $('#offlineBtn'); if (b) b.onclick = downloadForOffline;
}
