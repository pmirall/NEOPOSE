/* ---------- welcome screen and interactive tutorial ----------
   Research (NN/g "Mobile tutorials"; Autodesk Maya's in-app tutorial): passive deck-of-cards tips don't improve
   success and make tasks feel harder; what works is short, skippable learn-by-doing: each step asks for one real
   action, highlights where to do it and moves on by itself when the user has done it. */
const TOUR_STEPS = [
  {id: 'orbit', title: 'Mira alrededor', text: 'Arrastra el fondo del lienzo para girar la cámara. Rueda (o pellizca) para acercarte.', target: '#viewport', done: 'orbit'},
  {id: 'ik', title: 'Mueve una mano', text: 'Arrastra el punto rojo de una mano: el brazo entero la sigue (IK).', target: () => handleRect('handR'), done: 'ik', before: () => setIK(true)},
  {id: 'rotate', title: 'Gira una articulación', text: 'Toca el pecho, la cabeza o cualquier punto de articulación y gíralo con el aro de colores.', target: '#viewport', done: 'rotate'},
  {id: 'fk', title: 'Modo FK', text: 'Cambia a FK y arrastra un codo o una rodilla: solo gira ese hueso. Tecla I para alternar.', target: '#ikMode', done: 'fk'},
  {id: 'pose', title: 'Poses listas', text: 'Abre la pestaña Pose y toca una pose, o arrástrala sobre un personaje. Las de 2 a 4 personas colocan a todo el reparto.', target: '#poseGrid', tab: 'pose', done: 'pose'},
  {id: 'body', title: 'Cuerpo y especie', text: 'En Cuerpo cambia el tipo de cuerpo, ponle pelo o elige una especie anthro (lobo, zorro, gato…).', target: '[data-sec=tipo], [data-sec=especie]', tab: 'cuerpo', done: 'body'},
  {id: 'env', title: 'Un escenario', text: 'En Escena elige un lugar. Trae sus propias luces y nunca tapará al personaje.', target: '#envChips', tab: 'escena', done: 'env'},
  {id: 'anim', title: 'Dale movimiento', text: 'Pulsa Animar: posa en dos momentos de la línea de tiempo y el paso de una pose a otra se hace solo.', target: '#animBtn', done: 'anim'},
  {id: 'export', title: 'Llévatelo a tu dibujo', text: 'Pulsa Exportar: imagen PNG, hoja de giro, mapas para IA o modelo 3D.', target: '#exportBtn', done: 'export'}
];
for (const st of TOUR_STEPS) { st.title = tr(st.title); st.text = tr(st.text); }
const TOUR = {on: false, i: 0, el: null};
function tourEvent(name) {
  if (!TOUR.on) return;
  const st = TOUR_STEPS[TOUR.i]; if (!st || st.done !== name || TOUR.busy) return;
  TOUR.busy = true; TOUR.el.classList.add('ok'); const i = TOUR.i; setTimeout(() => { if (TOUR.on && TOUR.i === i) tourGo(i + 1); }, 750);
}
function handleRect(id) {
  const h = handles[id]; if (!h) return null;
  const p = h.position.clone().project(camera), r = canvas.getBoundingClientRect();
  const x = r.left + (p.x + 1) / 2 * r.width, y = r.top + (1 - p.y) / 2 * r.height;
  return {left: x - 34, top: y - 34, width: 68, height: 68};
}
function tourRect(st) {
  if (typeof st.target === 'function') return st.target();
  const els = $$(st.target).filter(e => e.offsetParent); if (!els.length) return null;
  const rs = els.map(e => e.getBoundingClientRect()), pg = els[0].closest('.page');
  let l = Math.min(...rs.map(r => r.left)), t = Math.min(...rs.map(r => r.top)), rr = Math.max(...rs.map(r => r.right)), b = Math.max(...rs.map(r => r.bottom));
  if (pg) { const p = pg.getBoundingClientRect(); t = Math.max(t, p.top); b = Math.min(b, p.bottom); }  // only the part of the panel in sight
  return {left: l, top: t, width: rr - l, height: Math.max(20, Math.min(b - t, innerHeight - t - 8))};
}
function tourPlace() {
  if (!TOUR.on) return;
  const st = TOUR_STEPS[TOUR.i], r = tourRect(st), hole = $('#tourHole'), card = TOUR.el;
  if (r) { const pad = 6; Object.assign(hole.style, {left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px'}); hole.hidden = false; } else hole.hidden = true;
  // card: next to the target where it fits, else at the bottom (at the top on a phone when the target is in the sheet)
  const cw = Math.min(340, innerWidth - 24), ch = card.offsetHeight || 180, inSheet = r && innerWidth <= 760 && typeof st.target === 'string' && $(st.target.split(',')[0].trim())?.closest('#book');
  let x = 12, y = inSheet ? 8 : innerHeight - ch - 12;
  if (r && innerWidth > 760) {
    const big = r.width > innerWidth * .5 && r.height > innerHeight * .5;
    if (big) { x = r.left + 16; y = r.top + 16; }
    else if (r.left - cw - 20 > 0) { x = r.left - cw - 20; y = clamp(r.top, 12, innerHeight - ch - 12); }
    else if (r.left + r.width + cw + 20 < innerWidth) { x = r.left + r.width + 20; y = clamp(r.top, 12, innerHeight - ch - 12); }
    else { x = clamp(r.left, 12, innerWidth - cw - 12); y = r.top + r.height + 16 + ch < innerHeight ? r.top + r.height + 16 : Math.max(12, r.top - ch - 16); }
  }
  Object.assign(card.style, {left: x + 'px', top: y + 'px', width: cw + 'px'});
}
function tourGo(i) {
  TOUR.i = i; TOUR.busy = false;
  if (i >= TOUR_STEPS.length) return tourEnd(true);
  const st = TOUR_STEPS[i];
  if (st.tab) {
    showTab(st.tab); setPanel(true); const d = document.querySelector(st.target.split(',')[0].trim()); const sec = d && d.closest('details.sec'); if (sec) sec.open = true;
    if (typeof sheetOn === 'function' && sheetOn()) setSheet('full');
    // the target into view, in the panel only: the first of several at the top, a single one in the middle
    if (d) requestAnimationFrame(() => { const pg = d.closest('.page'); if (!pg) return; const several = st.target.includes(','), rd = d.getBoundingClientRect(), rp = pg.getBoundingClientRect();
      pg.scrollTop += several ? rd.top - rp.top - 52 : rd.top + rd.height / 2 - (rp.top + rp.height / 2); setTimeout(tourPlace, 300); });
  }
  if (st.before) st.before();
  const c = TOUR.el; c.classList.remove('ok');
  c.querySelector('.tt').textContent = st.title; c.querySelector('.tx').textContent = st.text;
  c.querySelector('.tn').textContent = tr('{i} de {n}', {i: i + 1, n: TOUR_STEPS.length});
  c.querySelector('.dots').innerHTML = TOUR_STEPS.map((_, k) => `<i class="${k < i ? 'd' : k === i ? 'c' : ''}"></i>`).join('');
  c.querySelector('[data-a=next]').textContent = tr(i === TOUR_STEPS.length - 1 ? 'Terminar' : 'Saltar paso');
  if (st.done === 'orbit') TOUR.cam0 = camera.position.clone().sub(controls.target).normalize();
  requestAnimationFrame(tourPlace);
}
function tourStart() {
  closeWelcome(); closeHelp && closeHelp();
  TOUR.on = true; $('#tour').hidden = false; TOUR.el = $('#tourCard');
  tourGo(0);
}
function tourEnd(finished) {
  TOUR.on = false; $('#tour').hidden = true; store.set('cdp.welcomed', true);
  if (finished) toast('¡Listo! Tienes la ayuda y el tutorial en el botón ? de arriba a la derecha.');
}
function openWelcome() { $('#welcome').hidden = false; $('#wStart').focus(); }
function closeWelcome() { $('#welcome').hidden = true; store.set('cdp.welcomed', true); }
function initTour() {
  $('#wStart').onclick = tourStart; $('#wSkip').onclick = closeWelcome;
  $('#helpTour').onclick = tourStart;
  $('#tourCard').addEventListener('click', e => { const a = e.target.dataset.a; if (a === 'next') tourGo(TOUR.i + 1); else if (a === 'quit') tourEnd(false); });
  addEventListener('resize', tourPlace);
  // the camera step completes after a clear orbit; the IK target follows the hand while the camera moves
  setInterval(() => {
    if (!TOUR.on) return;
    const st = TOUR_STEPS[TOUR.i];
    if (st.done === 'orbit' && TOUR.cam0 && camera.position.clone().sub(controls.target).normalize().angleTo(TOUR.cam0) > .35) tourEvent('orbit');
  }, 200);
  const follow = () => { if (TOUR.on && typeof TOUR_STEPS[TOUR.i]?.target === 'function') tourPlace(); requestAnimationFrame(follow); };
  requestAnimationFrame(follow);
  if (!store.get('cdp.welcomed', false)) openWelcome();
}
