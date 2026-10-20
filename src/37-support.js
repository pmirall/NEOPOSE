/* ======================= supporting the app =======================
   NEOPOSE is free. A rare thank-you note asks for a coffee on Ko-fi, only right after the app has just saved
   something for the person (never at the start, in a tutorial or in practice): first after the third save, then at
   most once a fortnight; its ✕ quiets it for two months and following the link ends it for good. Help and Settings
   keep a quiet link. A plain link, no Ko-fi script: it works offline and tracks no one. */
const KOFI = 'https://ko-fi.com/pmirall';
const SUP = {saves: 0, last: 0, quiet: 0, done: false, ...store.get('cdp.support', {})};
const DAY = 864e5;
function openKofi() { SUP.done = true; store.set('cdp.support', SUP); window.open(KOFI, '_blank', 'noopener'); toast(tr('¡Gracias de corazón! ☕')); }
function supportAfterSave() {
  SUP.saves++; store.set('cdp.support', SUP);
  const now = Date.now();
  if (SUP.done || SUP.saves < 3 || now < SUP.quiet || now - SUP.last < 14 * DAY) return;
  if ((typeof TOUR !== 'undefined' && TOUR.on) || (typeof practice !== 'undefined' && practice.active)) return;
  SUP.last = now; store.set('cdp.support', SUP);
  // (after the save's own message has been read)
  setTimeout(() => {
    toast(tr('¿Te está sirviendo NEOPOSE? Es gratis y lo hace una persona.'), {act: ['Invítame a un café ☕', openKofi], ms: 12000});
    const h = $('#hint'), x = document.createElement('button'); x.type = 'button'; x.className = 'undo'; x.textContent = '✕'; x.title = tr('Ahora no'); x.setAttribute('aria-label', x.title);
    x.onclick = () => { SUP.quiet = Date.now() + 60 * DAY; store.set('cdp.support', SUP); h.classList.remove('toast'); };
    h.append(' ', x);
  }, 2200);
}
function buildSupportUI() { for (const a of $$('a.kofi')) { a.href = KOFI; a.onclick = e => { e.preventDefault(); openKofi(); }; } }
