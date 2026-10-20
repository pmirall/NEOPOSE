/* ======================= the three spaces =======================
   NEOPOSE is three workbenches on one table, each showing only what its work needs, all of them on the same people,
   places and engine (whatever improves in one is there in the others):
   - Personajes y lugares: who they are (body, species, hair, clothes) and where (sets, props): the cast and the
     locations that the pictures, the pages and the films are made of;
   - Estático: one picture — pose, light, camera and drawing style, to draw from or to export (and, later, comic pages);
   - Animación: the film — the timeline, shots, the script, motion, the shot's camera and light.
   The panel's tabs are shared out among them (the same tab, the same controls, wherever it shows); a tab asked for from
   anywhere (the palette, a tour, a link) brings its space along. Alt+1, Alt+2, Alt+3 switch; A goes in and out of
   Animación as it always did. Each space remembers its tab. */
const WORKSPACES = {
  chars: {label: 'Personajes', title: 'Personajes y lugares: cuerpo, especie, pelo, ropa y escenarios (Alt+1)', tabs: ['cuerpo', 'ropa', 'escena', 'biblia']},
  static: {label: 'Estático', title: 'Estático: una imagen (pose, luz, cámara y estilo) o páginas de cómic y manga (Alt+2)', tabs: ['pose', 'dibujo', 'escena', 'luz', 'camara', 'comic']},
  anim: {label: 'Animación', title: 'Animación: línea de tiempo, planos, guion e interpretación (Alt+3, A)', tabs: ['pelicula', 'pose', 'dibujo', 'escena', 'luz', 'camara']}
};
const WS_ORDER = ['chars', 'static', 'anim'];
const WS = {cur: 'static', last: store.get('cdp.wsTabs', {}), back: 'static', next: null, want: null};
const wsTabs = id => WORKSPACES[id] ? WORKSPACES[id].tabs : WORKSPACES.static.tabs;
// the space a tab is shown in: the current one if it has it, else the first that does (Estático before the others)
function wsOfTab(tab) { if (wsTabs(WS.cur).includes(tab)) return WS.cur; return ['static', 'chars', 'anim'].find(w => wsTabs(w).includes(tab)) || WS.cur; }
// the space's face: the switcher, which tabs show, which buttons of the top bar, its last tab
function wsApply(id, tab) {
  const from = WS.cur; WS.cur = id; if (id !== 'anim') WS.back = id;
  document.body.dataset.ws = id; store.set('cdp.ws', id);
  for (const b of $$('#spaces .space')) { const on = b.dataset.ws === id; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; }
  $('#animBtn').setAttribute('aria-pressed', String(id === 'anim'));
  const list = wsTabs(id); for (const t of tabs) t.hidden = !list.includes(t.dataset.tab);
  // what belongs to one space ends when leaving it: the drawing over the figure and the practice are Estático's
  if (id !== 'static' && typeof sk !== 'undefined' && sk.on) setSketch(false);
  if (id !== 'static' && typeof CM !== 'undefined' && CM.edit) finishPanelEdit();
  if (from !== id && typeof SHEET !== 'undefined' && typeof sheetOn === 'function' && sheetOn()) { WS.sheet = WS.sheet || {}; WS.sheet[from] = SHEET.snap; if (WS.sheet[id]) setSheet(WS.sheet[id]); else if (id === 'anim') setSheet('peek'); }  // (the film needs the screen: the sheet folds down)
  const want = tab || WS.want || WS.last[id] || (id === 'anim' && from !== 'anim' ? 'pelicula' : state.tab); WS.want = null;  // (the first time in Animación: its own tab, the film)
  showTab(list.includes(want) ? want : list[0]);
  if (from !== id && typeof wake === 'function') wake();
}
// switching: Animación opens and closes the timeline (which tells the shell, see openTimeline)
function setWorkspace(id, o = {}) {
  if (!WORKSPACES[id]) return;
  if (o.tab) WS.want = o.tab;
  if (id === 'anim') { if (!ANIM.open) openTimeline(true); else if (WS.cur !== 'anim' || o.tab) wsApply('anim', o.tab); return; }  // (the space already chosen stays on its tab)
  if (typeof practice !== 'undefined' && practice.active && id !== 'static') stopPractice();
  if (ANIM.open) { WS.next = id; openTimeline(false); return; }
  if (id !== WS.cur || o.tab) wsApply(id, o.tab);
}
// the timeline opened or closed by anything (the A key, the script, the gallery, a tour): the space follows it
function wsFollowTimeline(on) {
  if (on) { if (WS.cur !== 'anim') wsApply('anim'); return; }
  const to = WS.next || WS.back || 'static'; WS.next = null; if (WS.cur === 'anim') wsApply(to === 'anim' ? 'static' : to);
}
// a tab from anywhere: into its space first
function goTab(id) {
  id = TAB_ALIAS[id] || id; const w = wsOfTab(id);
  if (w !== WS.cur) setWorkspace(w, {tab: id}); else showTab(id);
  setPanel(true);
}
function initSpaces() {
  const nav = $('#spaces'); if (!nav) return;
  for (const b of $$('#spaces .space')) { const W = WORKSPACES[b.dataset.ws]; b.title = tr(W.title); b.onclick = () => setWorkspace(b.dataset.ws); }
  nav.addEventListener('keydown', e => {
    const list = $$('#spaces .space'), i = list.indexOf(document.activeElement); if (i < 0) return;
    const j = {ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: list.length - 1}[e.key]; if (j === undefined) return;
    e.preventDefault(); const b = list[(j + list.length) % list.length]; b.focus(); b.click();
  });
  // the last tab of each space, kept
  const remember = () => { if (wsTabs(WS.cur).includes(state.tab)) { WS.last[WS.cur] = state.tab; store.set('cdp.wsTabs', WS.last); } };
  for (const t of tabs) t.addEventListener('click', () => setTimeout(remember));
  WS.remember = remember;
  // where it was left (the film's space starts as Estático: the timeline is opened by hand)
  WS.ready = true; const saved = store.get('cdp.ws', 'static'); wsApply(saved === 'chars' ? 'chars' : 'static', null);
}
