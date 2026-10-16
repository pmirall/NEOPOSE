/* ---------- language ----------
   English by default. The Spanish source text is the key (as in gettext): a string missing in a language falls
   back to English, and then to the Spanish source, instead of breaking. Same text with two meanings:
   'Escalar@objeto' → context after @. Translations live in src/i18n/<lang>.json (Weblate-ready). */
// every language with a file is offered, named in its own language (a new one from Weblate needs no code)
const LANGS = Object.fromEntries(['en', 'es', ...Object.keys(I18N).filter(k => k !== 'en').sort()].map(c => {
  let n = c; try { n = new Intl.DisplayNames([c], {type: 'language'}).of(c); } catch (_) {}
  return [c, n.charAt(0).toLocaleUpperCase(c) + n.slice(1)];
}));
// machine translations, waiting for a human review on Weblate
const LANGS_MACHINE = new Set(['ca', 'fr', 'pt', 'de', 'it']);
const LANG = (() => { try { const v = JSON.parse(localStorage.getItem('cdp.lang')); return LANGS[v] ? v : 'en'; } catch (e) { return 'en'; } })();
document.documentElement.lang = LANG;
const I18N_LANG = LANG === 'es' ? null : I18N[LANG] || I18N.en;
const look = s => I18N_LANG ? (I18N_LANG[s] !== undefined ? I18N_LANG[s] : I18N.en[s]) : undefined;
function tr(s, vars) {
  const hit = look(s); let r = hit !== undefined ? hit : s.replace(/@[\w-]+$/, '');
  if (vars) r = r.replace(/\{(\w+)\}/g, (m, k) => k in vars ? vars[k] : m);
  return r;
}
// one or many: trn(n, '1 plano', '{n} planos')
const trn = (n, one, many, vars) => tr(n === 1 ? one : many, {n, ...vars});
// translate data tables in place: {id: {label}} or {id: 'label'}
const tLabels = (o, k = 'label') => { for (const v of Object.values(o)) if (v && typeof v[k] === 'string') v[k] = tr(v[k]); return o; };
const tValues = o => { for (const k in o) if (typeof o[k] === 'string') o[k] = tr(o[k]); return o; };
// decimal point in English, comma in the other languages
const dec = (v, d = 1) => LANG !== 'en' ? v.toFixed(d).replace('.', ',') : v.toFixed(d);
/* static HTML: text nodes and a few attributes are looked up as they are; a run of text with inline markup
   (<b>, <kbd>, <a>…) is looked up as one piece by its innerHTML, so sentences are not cut into fragments */
const I18N_INLINE = new Set(['B', 'I', 'KBD', 'A', 'EM', 'STRONG', 'BR', 'CODE']);
function tDom(root) {
  if (LANG === 'es') return;
  const lk = s => look(s.replace(/\s+/g, ' ').trim());
  (function walk(el) {
    for (const a of ['title', 'aria-label', 'placeholder', 'alt']) { const v = el.getAttribute(a); if (v && lk(v) !== undefined) el.setAttribute(a, lk(v)); }
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.namespaceURI !== 'http://www.w3.org/1999/xhtml') return;
    const kids = [...el.childNodes];
    if (kids.some(n => n.nodeType === 1) && kids.every(n => n.nodeType === 3 || (n.nodeType === 1 && I18N_INLINE.has(n.tagName) && !n.firstElementChild))) {
      const hit = lk(el.innerHTML); if (hit !== undefined) { el.innerHTML = hit; return; }
    }
    for (const n of kids) {
      if (n.nodeType === 3) { const s = n.nodeValue.trim(), hit = s && lk(s); if (hit !== undefined && hit) n.nodeValue = n.nodeValue.replace(s, hit); }
      else if (n.nodeType === 1) walk(n);
    }
  })(root);
}
tDom(document.body);
