/* ======================= share a scene as a link =======================
   The whole scene (cast, poses, clothes, set, camera, animation) is compressed into the link itself, after "#s=", so
   nothing is uploaded anywhere: whoever opens it sees the scene in the web version of NEOPOSE. */
const WEB_APP = 'https://pmirall.github.io/NEOPOSE/app/';
const b64url = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode.apply(null, u8.subarray(i, i + 32768)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64url = s => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/')), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
function sceneLink() {
  const json = JSON.stringify({cdp: 1, ...snapshot(), ...sceneExtras(true)});
  return WEB_APP + '#s=' + b64url(fflate.deflateSync(fflate.strToU8(json), {level: 9}));
}
async function shareScene() {
  const url = sceneLink(), cap = window.Capacitor;
  try {
    if (cap && cap.isNativePlatform && cap.isNativePlatform()) {
      const call = (pl, m, o) => cap.Plugins && cap.Plugins[pl] ? cap.Plugins[pl][m](o) : cap.nativePromise(pl, m, o);
      await call('Share', 'share', {title: 'NEOPOSE', url}); return;
    }
    if (navigator.share && matchMedia('(pointer: coarse)').matches) { await navigator.share({title: 'NEOPOSE', url}); return; }
    await navigator.clipboard.writeText(url);
    toast(tr('Enlace copiado ({k} caracteres). Quien lo abra verá esta escena.', {k: url.length}));
  } catch (e) { if (!/abort|cancel/i.test(String(e && (e.name || e.message)))) openJson(url); }
}
// a link with a scene: load it once the app is ready, then clean the address bar
function openSharedScene() {
  const m = location.hash.match(/^#s=([\w-]+)/); if (!m) return false;
  try {
    const o = JSON.parse(fflate.strFromU8(fflate.inflateSync(unb64url(m[1]))));
    if (!o.chars) throw new Error('no cast');
    restore(o); if (o.cam) applySceneExtras({cam: o.cam}); else frameAll(); pushHistory();
    toast(tr('Escena abierta desde el enlace.'));
  } catch (e) { console.warn('shared scene', e); toast(tr('Ese enlace no contiene una escena válida.')); }
  try { history.replaceState(null, '', location.pathname + location.search); } catch (_) {}
  return true;
}
function buildShareUI() { $('#shareScene').onclick = shareScene; }
