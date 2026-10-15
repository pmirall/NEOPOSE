/* ======================= hair =======================
   MakeHuman's system hairstyles (CC0), converted like the clothes: every strand card hangs from the scalp, so the
   hair follows head size, age and pose. It is one more garment on the character (kept apart from the outfit, so
   dressing or undressing leaves it alone), tinted with the chosen colour. Sculpted anthro heads bring their own. */
const HAIR = {list: null};
const HAIR_COLORS = [['#1b1512', 'Negro'], ['#3a2a20', 'Castaño oscuro'], ['#6b4a31', 'Castaño'], ['#94622f', 'Avellana'], ['#8a3a1c', 'Pelirrojo'], ['#c7a066', 'Rubio'],
  ['#e3cf9f', 'Rubio claro'], ['#8f8a84', 'Canoso'], ['#e6e3dd', 'Blanco'], ['#3d55b0', 'Azul'], ['#cf6a9b', 'Rosa'], ['#4b8a5c', 'Verde']];
for (const c of HAIR_COLORS) c[1] = tr(c[1]);
const HAIR_DEFAULT_COL = '#3a2a20';
function loadHairList() {
  if (!HAIR.p) HAIR.p = fetch('ropa/hair.json').then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(l => { for (const h of l) h.title = tr(h.title); HAIR.list = l; return l; });
  return HAIR.p;
}
// why this character cannot wear the hair, or null
function hairBlock(m) {
  if (m.body.species !== 'humano') return tr('Las cabezas de especie traen su propio pelaje y peinado.');
  if (m.avatar) return tr('Los avatares importados traen su propio pelo.');
  return null;
}
const hairSpec = m => garmentSpec(m.body.hair, {mode: m.body.hairCol === 'tex' ? 'tex' : 'tint', colA: m.body.hairCol && m.body.hairCol !== 'tex' ? m.body.hairCol : HAIR_DEFAULT_COL, hide: false, hair: true});
// put on, change or take off the hair the body asks for
function syncHair(m) {
  const want = m.body.hair && !hairBlock(m) ? m.body.hair : null, g = m.hairG;
  if (g && (!want || g.spec.id !== want)) {
    disposeGarment(m, g); m.garments = m.garments.filter(x => x !== g); m.hairG = null;
    updateBodyHide(m);
  }
  if (want && !m.hairG) {
    m.hairG = createGarment(m, hairSpec(m)); m.hairG.hair = true; m.garments.push(m.hairG);
    return m.hairG.ready;
  }
  if (m.hairG) { Object.assign(m.hairG.spec, hairSpec(m)); updateGarment(m, m.hairG); }
  return Promise.resolve();
}
function setHair(m, id, col) {
  m.body.hair = id || '';
  if (col) m.body.hairCol = col;
  return syncHair(m);
}

/* ---------- Body tab: hairstyle tiles and colour ---------- */
function renderHairUI() {
  const grid = $('#hairGrid'); if (!grid) return;
  if (!HAIR.list) { grid.innerHTML = `<p class="empty">${tr('Cargando peinados…')}</p>`; loadHairList().then(renderHairUI, () => grid.innerHTML = `<p class="empty">${tr('No se pudieron cargar los peinados.')}</p>`); return; }
  const why = hairBlock(mq), cur = mq.body.hair || '';
  grid.innerHTML = '';
  grid.classList.toggle('off', !!why);
  for (const h of [{id: '', title: tr('Sin pelo')}, ...HAIR.list]) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'hairItem'; b.dataset.v = h.id;
    b.setAttribute('aria-pressed', String(h.id === cur)); b.title = h.title; b.disabled = !!why;
    b.innerHTML = h.thumb ? `<img alt="" src="${h.thumb}">` : '<span class="bald" aria-hidden="true"></span>';
    const t = document.createElement('span'); t.className = 'lt'; t.textContent = h.title; b.appendChild(t);
    b.onclick = () => { setHair(mq, h.id); renderHairUI(); tourEvent('body'); pushHistory(); };
    grid.appendChild(b);
  }
  $('#hairNote').textContent = why || '';
  $('#hairNote').hidden = !why;
  $('#hairColorBox').hidden = !!why || !cur;
  const col = mq.body.hairCol || HAIR_DEFAULT_COL;
  $('#hairSw').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.c === col)));
  $('#hairColor').value = col === 'tex' ? '#6b4a31' : col;
  const it = HAIR.list.find(h => h.id === cur);
  $('#hairWho').textContent = it ? it.title : '';
}
function buildHairUI() {
  const sw = $('#hairSw'); sw.innerHTML = '';
  for (const [c, name] of [...HAIR_COLORS, ['tex', 'Original']]) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.c = c; b.title = c === 'tex' ? tr('Original') : name; b.setAttribute('aria-label', b.title);
    if (c === 'tex') b.className = 'orig'; else b.style.background = c;
    b.onclick = () => { setHair(mq, mq.body.hair, c); renderHairUI(); pushHistory(); };
    sw.appendChild(b);
  }
  const inp = $('#hairColor');
  inp.oninput = () => { mq.body.hairCol = inp.value; syncHair(mq); $('#hairSw').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', 'false')); };
  inp.onchange = pushHistory;
  renderHairUI();
}
