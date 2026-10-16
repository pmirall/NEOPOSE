/* ======================= the notebook's page turns =======================
   A change of tab turns a leaf of the notebook from the rings: forward, the leaf lifts off the new page and turns
   away; back, it turns in from the rings and melts into the page. The panel changes at once underneath and the leaf
   lets every click through, so a quick hand never waits for it. (View Transitions were tried: they take the whole
   page's clicks while they run and are slow to start next to a WebGL canvas.) Only for a tab picked by hand. */
let leafNow = null;
function turnTo(id) {
  const from = state.tab; if (!id || id === from || UX.reduce || !$('#book') || document.body.classList.contains('nopanel')) return showTab(id);
  const order = tabs.map(t => t.dataset.tab), fwd = order.indexOf(id) > order.indexOf(from);
  if (leafNow) leafNow.remove();
  const page = $('.page'), r = page.getBoundingClientRect(), b = $('#book').getBoundingClientRect(), leaf = leafNow = document.createElement('div');
  leaf.className = 'leaf' + (fwd ? '' : ' back'); Object.assign(leaf.style, {left: r.left - b.left + 'px', top: r.top - b.top + 'px', width: r.width + 'px', height: r.height + 'px'});
  $('#book').appendChild(leaf); showTab(id);
  const P = 'perspective(1600px) ', kf = fwd
    ? [{transform: P + 'rotateY(0)', opacity: 1}, {transform: P + 'rotateY(-40deg) skewY(-1deg)', opacity: 1, offset: .45}, {transform: P + 'rotateY(-100deg) skewY(-2deg)', opacity: 0}]
    : [{transform: P + 'rotateY(-100deg) skewY(-2deg)', opacity: 0}, {transform: P + 'rotateY(-30deg) skewY(-1deg)', opacity: 1, offset: .55}, {transform: P + 'rotateY(0)', opacity: 0}];
  leaf.animate(kf, {duration: 440, easing: 'cubic-bezier(.2,.7,.2,1)'}).finished.catch(() => {}).then(() => { leaf.remove(); if (leafNow === leaf) leafNow = null; });
}
function buildPaper() {
  tabs.forEach(t => t.onclick = () => { turnTo(t.dataset.tab); setPanel(true); });
  // a tab list as screen readers and keyboards expect it: one stop for Tab, the arrows (and Home, End) to move along
  for (const t of tabs) { const sec = $(`.page section[data-tab="${t.dataset.tab}"]`); t.id = 'tab-' + t.dataset.tab; sec.id = 'panel-' + t.dataset.tab; sec.setAttribute('role', 'tabpanel'); sec.setAttribute('aria-labelledby', t.id); t.setAttribute('aria-controls', sec.id); }
  $('.tabs').addEventListener('keydown', e => {
    const i = tabs.indexOf(document.activeElement); if (i < 0) return;
    const j = {ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1}[e.key]; if (j === undefined) return;
    e.preventDefault(); const t = tabs[(j + tabs.length) % tabs.length]; t.focus(); turnTo(t.dataset.tab); setPanel(true);
  });
}
