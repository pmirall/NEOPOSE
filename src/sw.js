/* NEOPOSE web app: works offline once opened, updates when a new version is published.
   - the page itself is asked for first (a cheap check: 304 when nothing changed), the stored one when offline;
   - every other file is stored under its content hash: the shell (three.js, fonts, the figure, the languages) when the
     worker installs, the rest (clothes, sets, heads, the pose model) the first time it is used. A new release only
     downloads the files that changed; the old copies of those are dropped once it takes over;
   - a new version waits until the app says so (the "Update" button), so a session is never swapped mid-work.
   Written by build.py from src/sw.js. */
const VERSION = '__VERSION__', BUILD = '__BUILD__', SHELL = 'neopose-shell-' + BUILD, FILES = 'neopose-files';
const CORE = __CORE__, HASHES = __HASHES__;
const SCOPE = new URL(self.registration.scope);
// a file's place in the store: its path and its content hash
const keyOf = rel => new URL(rel + '?h=' + HASHES[rel], SCOPE).href;
const relOf = u => decodeURIComponent(u.pathname.slice(SCOPE.pathname.length));
self.addEventListener('install', e => e.waitUntil((async () => {
  const c = await caches.open(FILES);
  for (const rel of CORE) if (!(await c.match(keyOf(rel)))) { const r = await fetch(new Request(rel, {cache: 'reload'})); if (r.ok) await c.put(keyOf(rel), r); }
  const s = await caches.open(SHELL); const r = await fetch(new Request('./', {cache: 'reload'})); if (r.ok) await s.put('index.html', r);
})()));
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('neopose-') && k !== SHELL && k !== FILES) await caches.delete(k);
  // (what changed or is gone in this release goes)
  const c = await caches.open(FILES);
  for (const r of await c.keys()) { const u = new URL(r.url), rel = relOf(u); if (HASHES[rel] !== u.searchParams.get('h')) await c.delete(r); }
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
  const rel = relOf(u);
  if (!HASHES[rel]) { e.respondWith(fetch(r).catch(() => caches.match(r, {ignoreSearch: true}))); return; }
  const key = keyOf(rel);
  e.respondWith(caches.open(FILES).then(c => c.match(key).then(hit => hit || fetch(r).then(res => {
    if (res.ok && res.status === 200 && res.type === 'basic') { const cp = res.clone(); c.put(key, cp).catch(() => {}); }
    return res;
  }))));
});
