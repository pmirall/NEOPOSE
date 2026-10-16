/* NEOPOSE web app: works offline once opened, updates when a new version is published.
   - the shell (page, three.js, fonts, the figure) is stored when the worker installs;
   - the page itself is asked for first (a cheap check: 304 when nothing changed), the stored one when offline;
   - everything else (clothes, sets, heads, the pose model) is kept the first time it is used, per release;
   - a new version waits until the app says so (the "Update" button), so a session is never swapped mid-work.
   Written by build.py from src/sw.js. */
const VERSION = '1.3.0', BUILD = '140a58e6df', SHELL = 'neopose-shell-' + BUILD, ASSETS = 'neopose-assets-' + VERSION;
const CORE = ["./", "index.html", "manifest.webmanifest", "icon.png", "icons/apple-touch-icon.png", "icons/icon-192.png", "fonts/fonts.css", "vendor/three.min.js", "vendor/OrbitControls.js", "vendor/TransformControls.js", "vendor/GLTFLoader.js", "vendor/meshopt_decoder.js", "vendor/fflate.min.js", "vendor/gifenc.min.js", "vendor/NURBSUtils.js", "vendor/NURBSCurve.js", "vendor/FBXLoader.js", "fonts/CourierPrime-400-latin-ext.woff2", "fonts/CourierPrime-400-latin.woff2", "fonts/CourierPrime-700-latin-ext.woff2", "fonts/CourierPrime-700-latin.woff2", "fonts/Kalam-400-latin-ext.woff2", "fonts/Kalam-400-latin.woff2", "fonts/Kalam-700-latin-ext.woff2", "fonts/Kalam-700-latin.woff2", "fonts/Karla-400-latin-ext.woff2", "fonts/Karla-400-latin.woff2", "fonts/Karla-500-latin-ext.woff2", "fonts/Karla-500-latin.woff2", "fonts/Karla-600-latin-ext.woff2", "fonts/Karla-600-latin.woff2", "fonts/Karla-700-latin-ext.woff2", "fonts/Karla-700-latin.woff2", "figure.txt", "figure-ext.txt", "figure-body.txt", "skeleton.txt"];
self.addEventListener('install', e => e.waitUntil(caches.open(SHELL).then(c => c.addAll(CORE.map(u => new Request(u, {cache: 'reload'}))))));
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('neopose-') && k !== SHELL && k !== ASSETS) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin || r.headers.has('range')) return;  // other sites (reference search) and video ranges: straight to the network
  if (r.mode === 'navigate') {
    e.respondWith(fetch(r, {cache: 'no-cache'}).then(res => { if (res.ok) { const cp = res.clone(); caches.open(SHELL).then(c => c.put('index.html', cp)); } return res; })
      .catch(() => caches.match('index.html', {ignoreSearch: true})));
    return;
  }
  e.respondWith(caches.match(r, {ignoreSearch: u.pathname.endsWith('.html')}).then(hit => hit || fetch(r).then(res => {
    if (res.ok && res.status === 200 && res.type === 'basic') { const cp = res.clone(); caches.open(CORE.includes(u.pathname.split('/app/').pop()) ? SHELL : ASSETS).then(c => c.put(r, cp)).catch(() => {}); }
    return res;
  })));
});
