/* ---------- language ----------
   English by default, Spanish on request. The Spanish source text is the key (as in gettext), so a missing
   entry falls back to Spanish instead of breaking. Same text with two meanings: 'Escalar@objeto' → context after @. */
const LANGS = {en: 'English', es: 'Español'};
const LANG = (() => { try { const v = JSON.parse(localStorage.getItem('cdp.lang')); return LANGS[v] ? v : 'en'; } catch (e) { return 'en'; } })();
document.documentElement.lang = LANG;
function tr(s, vars) {
  let r = LANG === 'en' && I18N_EN[s] !== undefined ? I18N_EN[s] : s.replace(/@[\w-]+$/, '');
  if (vars) r = r.replace(/\{(\w+)\}/g, (m, k) => k in vars ? vars[k] : m);
  return r;
}
// translate data tables in place: {id: {label}} or {id: 'label'}
const tLabels = (o, k = 'label') => { for (const v of Object.values(o)) if (v && typeof v[k] === 'string') v[k] = tr(v[k]); return o; };
const tValues = o => { for (const k in o) if (typeof o[k] === 'string') o[k] = tr(o[k]); return o; };
// decimal comma in Spanish, point in English
const dec = (v, d = 1) => LANG === 'es' ? v.toFixed(d).replace('.', ',') : v.toFixed(d);
/* static HTML: text nodes and a few attributes are looked up as they are; a run of text with inline markup
   (<b>, <kbd>, <a>…) is looked up as one piece by its innerHTML, so sentences are not cut into fragments */
const I18N_INLINE = new Set(['B', 'I', 'KBD', 'A', 'EM', 'STRONG', 'BR']);
function tDom(root) {
  if (LANG !== 'en') return;
  const look = s => I18N_EN[s.replace(/\s+/g, ' ').trim()];
  (function walk(el) {
    for (const a of ['title', 'aria-label', 'placeholder', 'alt']) { const v = el.getAttribute(a); if (v && look(v) !== undefined) el.setAttribute(a, look(v)); }
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.namespaceURI !== 'http://www.w3.org/1999/xhtml') return;
    const kids = [...el.childNodes];
    if (kids.some(n => n.nodeType === 1) && kids.every(n => n.nodeType === 3 || (n.nodeType === 1 && I18N_INLINE.has(n.tagName) && !n.firstElementChild))) {
      const hit = look(el.innerHTML); if (hit !== undefined) { el.innerHTML = hit; return; }
    }
    for (const n of kids) {
      if (n.nodeType === 3) { const s = n.nodeValue.trim(), hit = s && look(s); if (hit !== undefined && hit) n.nodeValue = n.nodeValue.replace(s, hit); }
      else if (n.nodeType === 1) walk(n);
    }
  })(root);
}
tDom(document.body);
