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
// short hands-on tutorials for the big features, from Help or Ctrl+K; a step already done (skip) is passed by
const TOURS = {
  basico: TOUR_STEPS,
  animar: [
    {id: 'a-open', title: 'Abre la línea de tiempo', text: 'Pulsa Animar: abajo aparecen los planos y la línea de tiempo.', target: '#animBtn', done: 'anim', skip: () => ANIM.open},
    {id: 'a-key1', title: 'Primera pose', text: 'Elige una pose en la pestaña Pose: se guarda como clave en este fotograma.', target: '#poseGrid', tab: 'pose', done: 'key'},
    {id: 'a-move', title: 'Avanza en el tiempo', text: 'Arrastra en la línea de tiempo o pulsa → unas cuantas veces para ir un segundo más adelante.', target: '#tlTrack', done: 'frame'},
    {id: 'a-key2', title: 'Segunda pose', text: 'Elige otra pose. El paso de una a otra se calcula solo.', target: '#poseGrid', tab: 'pose', done: 'key'},
    {id: 'a-play', title: 'Reprodúcelo', text: 'Pulsa reproducir (o la barra espaciadora).', target: '#tlPlay', done: 'play'},
    {id: 'a-style', title: 'Dale estilo', text: 'Abre Interpretación (el botón de la curva) y prueba «Cartoon»: anticipación, rebote y arrastre.', target: '#tlMotion', done: 'motion'},
    {id: 'a-clips', title: 'Movimientos listos', text: 'Animaciones trae andar, correr, saltar, luchar… para añadirlos al plano.', target: '#tlClips', done: 'clips'}
  ],
  guion: [
    {id: 'g-open', title: 'Abre la línea de tiempo', text: 'Pulsa Animar.', target: '#animBtn', done: 'anim', skip: () => ANIM.open},
    {id: 'g-script', title: 'Abre el guion', text: 'Pulsa Guion en la barra de la línea de tiempo.', target: '#tlScript', done: 'script'},
    {id: 'g-write', title: 'Escribe una escena', text: 'Escribe personajes que hablan y hacen cosas, por ejemplo «ANA: ¡Hola!» y «Luis entra y se sienta.», o usa el ejemplo.', target: '#scText', done: 'scriptText'},
    {id: 'g-go', title: 'Crea la película', text: 'Pulsa «Crear la película»: reparto, escenario, acciones, voces, subtítulos y planos salen solos.', target: '#scGo', done: 'film'},
    {id: 'g-play', title: 'Mírala', text: 'Reprodúcela. Cada plano se puede retocar como cualquier otro.', target: '#tlPlay', done: 'play'}
  ],
  pelaje: [
    {id: 'p-sp', title: 'Elige un animal', text: 'En Cuerpo → Especie elige uno: lobo, zorro, tigre, mapache…', target: '[data-sec=especie]', tab: 'cuerpo', done: 'species', skip: () => mq.body.species !== 'humano'},
    {id: 'p-coat', title: 'Un pelaje de referencia', text: 'En Pelaje y marcas toca uno de los pelajes de la especie.', target: '#coatChips', tab: 'cuerpo', done: 'coat'},
    {id: 'p-mark', title: 'Tus marcas', text: 'Toca una marca para ponerla clara, otra vez para oscura y otra para quitarla; las muestras cambian los colores.', target: '#coatMarks', tab: 'cuerpo', done: 'mark'},
    {id: 'p-tail', title: 'La cola', text: 'Prueba otra forma de cola o cambia su largo y su grosor.', target: '#tailUI', tab: 'cuerpo', done: 'tail'},
    {id: 'p-expr', title: 'Lenguaje corporal', text: 'En Pose → Cara, cada expresión mueve a la vez boca, orejas y cola.', target: '#exprChips', tab: 'pose', done: 'expr'}
  ]
};
const TOUR_NAMES = {basico: 'Lo básico', animar: 'Animar', guion: 'Del guion a la película', pelaje: 'Pelaje y marcas'};
for (const L of Object.values(TOURS)) for (const st of L) { st.title = tr(st.title); st.text = tr(st.text); }
const TOUR = {on: false, i: 0, el: null, steps: TOUR_STEPS};
function tourEvent(name) {
  if (!TOUR.on) return;
  const st = TOUR.steps[TOUR.i]; if (!st || st.done !== name || TOUR.busy) return;
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
  const st = TOUR.steps[TOUR.i], r = tourRect(st), hole = $('#tourHole'), card = TOUR.el;
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
  if (i >= TOUR.steps.length) return tourEnd(true);
  const st = TOUR.steps[i];
  if (st.skip && st.skip()) return tourGo(i + 1);  // already done
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
  c.querySelector('.tn').textContent = tr('{i} de {n}', {i: i + 1, n: TOUR.steps.length});
  c.querySelector('.dots').innerHTML = TOUR.steps.map((_, k) => `<i class="${k < i ? 'd' : k === i ? 'c' : ''}"></i>`).join('');
  c.querySelector('[data-a=next]').textContent = tr(i === TOUR.steps.length - 1 ? 'Terminar' : 'Saltar paso');
  if (st.done === 'orbit') TOUR.cam0 = camera.position.clone().sub(controls.target).normalize();
  requestAnimationFrame(tourPlace);
}
function tourStart(name = 'basico') {
  closeWelcome(); closeHelp && closeHelp();
  TOUR.steps = TOURS[typeof name === 'string' && TOURS[name] ? name : 'basico'];
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
  $('#helpTour').onclick = () => tourStart('basico');
  $$('#helpTours [data-tour]').forEach(b => b.onclick = () => tourStart(b.dataset.tour));
  $('#tourCard').addEventListener('click', e => { const a = e.target.dataset.a; if (a === 'next') tourGo(TOUR.i + 1); else if (a === 'quit') tourEnd(false); });
  addEventListener('resize', tourPlace);
  // the camera step completes after a clear orbit; the IK target follows the hand while the camera moves
  setInterval(() => {
    if (!TOUR.on) return;
    const st = TOUR.steps[TOUR.i];
    if (st && st.done === 'orbit' && TOUR.cam0 && camera.position.clone().sub(controls.target).normalize().angleTo(TOUR.cam0) > .35) tourEvent('orbit');
  }, 200);
  const follow = () => { if (TOUR.on && typeof TOUR.steps[TOUR.i]?.target === 'function') tourPlace(); requestAnimationFrame(follow); };
  requestAnimationFrame(follow);
  if (!store.get('cdp.welcomed', false)) openWelcome();
}
