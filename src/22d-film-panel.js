/* ======================= Animación's own tab: the film =======================
   What only the film has: its shots in order (to see, pick, rename and reorder them in a list with their pictures and
   lengths), the doors to make it (the script, the gallery of animations, drawings or a video), its format (the frame
   of every shot: 16:9, cinemascope, vertical…, the same on any screen), how each shot plays (Interpretación: motion,
   camera, light) and the way across to the comic (each shot a panel, linked). */
const FILM_FORMATS = [['', 'Libre'], ['1.7778', '16:9'], ['2.39', '2,39:1 (cinemascope)'], ['1.85', '1,85:1'], ['1.3333', '4:3'], ['1', '1:1'], ['0.5625', '9:16 (vertical)']];
// the film's frame on the canvas while animating: the guide is the film's, and the camera is exactly that picture's
function applyFilmFormat() {
  const a = PROJECT.film.aspect;
  if (ANIM.open && a) { if (state.ratio !== '_film') ANIM.ratioBack = state.ratio; RATIOS._film = [tr('Película'), a]; state.ratio = '_film'; applyFrameAspect(a); }
  else if (state.ratio === '_film') { state.ratio = ANIM.ratioBack || 'libre'; applyFrameAspect(null); }
}
function renderFilmList() {
  const box = $('#fpShots'); if (!box) return; box.innerHTML = '';
  const tot = ANIM.shots.reduce((a, s) => a + s.len, 0) / ANIM.fps; $('#fpTotal').textContent = trn(ANIM.shots.length, '1 plano · {s} s', '{n} planos · {s} s', {s: dec(tot)});
  ANIM.shots.forEach((s, i) => {
    const row = document.createElement('div'); row.className = 'fpshot' + (i === ANIM.cur ? ' on' : ''); row.setAttribute('role', 'listitem');
    row.innerHTML = `<button class="fpth" type="button"></button><div class="fpm"><b></b><span></span></div><div class="fpbtn"><button class="btn icon small" data-d="-1" aria-label=""><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 15 6-6 6 6"/></svg></button><button class="btn icon small" data-d="1" aria-label=""><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg></button></div>`;
    const th = row.querySelector('.fpth'); th.innerHTML = s.thumb ? `<img alt="" src="${s.thumb}">` : ''; th.setAttribute('aria-label', tr('Ir a {n}', {n: s.name}));
    th.onclick = () => { if (ANIM.playing) play(false); enterShot(i).then(renderFilmList); };
    row.querySelector('b').textContent = `${i + 1}. ${s.name}`;
    row.querySelector('.fpm span').textContent = `${dec(s.len / ANIM.fps)} s` + (s.lines.some(l => l.text.trim()) ? ' · ' + tr('diálogo') : '') + (s.light && s.light.mood && s.light.mood !== 'auto' ? ' · ' + LIGHT_MOODS[s.light.mood].label : '');
    const [up, dn] = row.querySelectorAll('.fpbtn button'); up.setAttribute('aria-label', tr('Antes')); dn.setAttribute('aria-label', tr('Después')); up.disabled = i === 0; dn.disabled = i === ANIM.shots.length - 1;
    for (const b of [up, dn]) b.onclick = async () => { if (i !== ANIM.cur) await enterShot(i); moveShot(+b.dataset.d); pushHistory(); renderFilmList(); };
    box.appendChild(row);
  });
}
function buildFilmPanelUI() {
  if (!$('section[data-tab=pelicula]')) return;
  $('#fpScript').onclick = () => $('#tlScript').click(); $('#fpClips').onclick = () => $('#tlClips').click(); $('#fpBoard').onclick = () => $('#tlBoard').click();
  $('#fpMotion').onclick = () => { const p = $('#mvMotion'); if (p.hidden) $('#tlMotion').click(); };
  chips($('#fpFormat'), FILM_FORMATS, String(PROJECT.film.aspect || ''), v => { PROJECT.film.aspect = v ? +v : null; applyFilmFormat(); setPressed($('#fpFormat'), v); autosaveSoon(); });
  $('#fpComic').onclick = async () => { setWorkspace('static', {tab: 'comic'}); await new Promise(r => setTimeout(r, 60)); const n = await filmToComic(); if (n) toast(tr('{n} viñetas hechas desde la película, enlazadas a sus planos.', {n})); };
  renderFilmList();
}
