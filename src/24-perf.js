/* ======================= graphics quality =======================
   High: full sharpness on high-density screens, every shadow. Balanced: a little less resolution. Saver: the screen's
   own pixels at most, no cast shadows: for modest phones and long sessions on battery. The first time, the app picks
   one from the device (memory, cores, touch screen); the choice is remembered. */
const QUALITY = {alta: ['Alta', 2], media: ['Equilibrada', 1.5], baja: ['Ahorro', 1]};
function autoQuality() {
  const mem = navigator.deviceMemory || 8, cores = navigator.hardwareConcurrency || 8, touch = matchMedia('(pointer: coarse)').matches;
  return mem <= 3 || cores <= 4 && touch ? 'baja' : touch ? 'media' : 'alta';
}
function applyQuality(q, save = true) {
  if (!QUALITY[q]) q = 'alta';
  const was = state.quality; state.quality = q; if (save) store.set('cdp.quality', q);
  renderer.setPixelRatio(Math.min(devicePixelRatio, QUALITY[q][1])); resize();
  const saver = q === 'baja';
  if (saver || was === 'baja') {
    state.shadows = !saver; state.lampShadows = !saver;
    const a = $('#shadowChk'), b = $('#lampShadowChk'); if (a) a.checked = !saver; if (b) b.checked = !saver;
    applyAmbient();
  }
  $$('.qualChips').forEach(c => setPressed(c, q));
  if ((was === 'baja') !== (q === 'baja') && was) for (const m of chars) if (m.musc) computeMuscles(m);  // muscle normals on or off
}
function buildQualityUI() {
  $$('.qualChips').forEach(c => chips(c, Object.entries(QUALITY).map(([k, v]) => [k, v[0]]), null, applyQuality));
  applyQuality(store.get('cdp.quality', null) || autoQuality(), false);
}
