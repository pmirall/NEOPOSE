// short message in the hint bar under the viewport
let toastT = 0, toastKeep = null;
function toast(msg) {
  const h = $('#hint'); if (!h) return; if (toastKeep === null) toastKeep = h.innerHTML;
  h.textContent = tr(msg); h.classList.add('toast'); clearTimeout(toastT);
  toastT = setTimeout(() => { h.innerHTML = toastKeep; toastKeep = null; h.classList.remove('toast'); }, 5000);
}
/* anthro compatibility: what cannot be worn by this character, and why */
function garmentBlock(m, it) {
  if (!it || !m || !HEAD_RECIPES[m.body.species]) return null;
  const sp = SPECIES[m.body.species].label.toLowerCase(), t = it.title.toLowerCase(), an = m.anthro, snout = an && an.spec ? an.spec.snout : 0;
  const ears = (HEAD_RECIPES[m.body.species].ears || []).length > 0;
  if (/glass|gafa|goggle|lentes/.test(t) && snout > .22) return tr('Las gafas no se apoyan en un hocico de {sp}.', {sp});
  if (/mask|máscara|mascarilla|cov|mouth protection/.test(t) && snout > .22) return tr('La máscara está hecha para una cara humana, no para un hocico de {sp}.', {sp});
  if (it.cat === 'Calzado y calcetines' && animalFeet(m)) return tr('Las patas de {sp} no entran en calzado humano.', {sp});
  if (it.cat === 'Sombreros, cascos y máscaras' && ears && !/hood|capucha|bonnet|cap \(|tiara|horn|cuerno/.test(t)) return tr('Las orejas de {sp} no caben dentro: haría falta una versión con agujeros para las orejas.', {sp});
  return null;
}
/* ---------- Ropa tab: outfits, worn garments, and the whole library in folders ---------- */
const G_ = (id, o) => garmentSpec(id, o);
const OUTFITS = {
  casual:     ['Casual', [G_('m_male_casualsuit01'), G_('m_shoes01')]],
  casual2:    ['Casual 2', [G_('m_male_casualsuit03'), G_('m_shoes04')]],
  camiseta:   ['Camiseta y vaqueros', [G_('c1416'), G_('c807'), G_('m_shoes06')]],
  jersey:     ['Jersey', [G_('c1187'), G_('c1194'), G_('c1743')]],
  traje:      ['Traje', [G_('m_male_elegantsuit01'), G_('c1732')]],
  detective:  ['Detective', [G_('m_male_elegantsuit01'), G_('m_fedora01'), G_('c1732')]],
  trabajo:    ['Peto de trabajo', [G_('m_male_worksuit01'), G_('m_shoes03')]],
  mujer:      ['Casual (mujer)', [G_('m_female_casualsuit01'), G_('c1117')]],
  mujer2:     ['Casual 2 (mujer)', [G_('m_female_casualsuit02'), G_('c1734')]],
  oficina:    ['Oficina', [G_('m_female_elegantsuit01'), G_('c156')]],
  deporte:    ['Deportivo', [G_('m_female_sportsuit01'), G_('m_shoes05')]],
  verano:     ['Vestido de verano', [G_('c1730'), G_('c1734')]],
  gala:       ['Vestido largo', [G_('c1855'), G_('c1694')]],
  falda:      ['Top y falda', [G_('c1726'), G_('c1641'), G_('c1117')]],
  escolar:    ['Marinero escolar', [G_('c1750'), G_('c1751'), G_('c1078'), G_('c1700')]],
  medico:     ['Médico', [G_('m_male_casualsuit06'), G_('c1412'), G_('m_shoes05')]],
  militar:    ['Militar', [G_('c2694'), G_('c2798'), G_('c11'), G_('c2697')]],
  pijama:     ['Pijama', [G_('c2626')]],
  interior:   ['Ropa interior', [G_('c21'), G_('c23')]],
  bikini:     ['Bikini', [G_('c2709'), G_('c2710')]],
  banador:    ['Bañador', [G_('c2656')]],
  caballero:  ['Caballero templario', [G_('c2015'), G_('c2014'), G_('c2619')]],
  vikingo:    ['Vikingo', [G_('c2617'), G_('c2618'), G_('c2619')]],
  heroe:      ['Superhéroe', [G_('c2061'), G_('c2128'), G_('c2081'), G_('c2112')]],
  heroina:    ['Superheroína', [G_('c2145'), G_('c2048'), G_('c2155'), G_('c2074')]],
  monje:      ['Monje', [G_('c3238'), G_('c3235')]],
  kimono:     ['Kimono', [G_('c3171')]],
  espacio:    ['Traje espacial', [G_('c3517')]],
  gotica:     ['Gótica', [G_('c2521'), G_('c2804'), G_('c1694')]]
};
// categories the random outfit draws from
const RANDOM_PLAN = () => {
  const r = Math.random();
  if (r < .25) return ['Conjuntos MakeHuman', 'Calzado y calcetines'];
  if (r < .45) return ['Vestidos, batas y túnicas', 'Calzado y calcetines'];
  return ['Camisetas, camisas y jerséis', Math.random() < .35 ? 'Faldas' : 'Pantalones', 'Calzado y calcetines', ...(Math.random() < .3 ? ['Sombreros, cascos y máscaras'] : [])];
};
async function randomOutfit() {
  const cat = await loadCatalog(), pick = a => a[Math.floor(Math.random() * a.length)];
  return RANDOM_PLAN().map(c => cat.filter(x => x.cat === c)).filter(l => l.length).map(l => garmentSpec(pick(l).id));
}
let ropaSearch = '';
function garmentTitle(id) { return ROPA.byId[id] ? ROPA.byId[id].title : id; }
function renderGarmentList() {
  const box = $('#garmentList'); if (!box) return;
  box.innerHTML = '';
  if (!mq.outfit.length) { box.innerHTML = `<p class="empty">${tr('Sin ropa. Elige un conjunto o añade prendas de la biblioteca.')}</p>`; return; }
  mq.garments.forEach((g, gi) => {
    const s = g.spec, card = document.createElement('details'); card.className = 'garment';
    card.open = !!g.open; card.ontoggle = () => g.open = card.open;
    const sum = document.createElement('summary'), it = ROPA.byId[s.id];
    sum.innerHTML = `<span class="gth"></span><span class="gn"></span><button type="button" class="gx" aria-label="${tr('Quitar')}">×</button>`;
    if (it && it.thumb) { const im = new Image(); im.src = it.thumb; im.alt = ''; sum.querySelector('.gth').appendChild(im); }
    sum.querySelector('.gn').textContent = garmentTitle(s.id) + (g.failed ? tr(' (no se pudo cargar)') : '');
    sum.querySelector('.gx').onclick = e => { e.preventDefault(); removeGarment(gi); };
    card.appendChild(sum);
    const body = document.createElement('div'); body.className = 'gbody'; card.appendChild(body);
    const changed = () => { updateGarment(mq, g); };
    const mc = document.createElement('div'); mc.className = 'chips'; body.appendChild(mc);
    chips(mc, Object.entries(COLOR_MODES), s.mode, v => { s.mode = v; changed(); renderGarmentList(); pushHistory(); });
    if (s.mode !== 'tex') {
      const cols = document.createElement('div'); cols.className = 'gcols';
      for (const [k, lab] of s.mode === 'pat' ? [['colA', 'Color'], ['colB', 'Color 2']] : [['colA', 'Color']]) {
        const l = document.createElement('label'); l.className = 'gcol'; l.textContent = tr(lab);
        const inp = document.createElement('input'); inp.type = 'color'; inp.value = s[k]; inp.id = `gc_${gi}_${k}`;
        inp.oninput = () => { s[k] = inp.value; changed(); }; inp.onchange = pushHistory; l.appendChild(inp); cols.appendChild(l);
      }
      body.appendChild(cols);
      const sw = document.createElement('div'); sw.className = 'swatches';
      for (const c of PALETTE) { const b = document.createElement('button'); b.type = 'button'; b.style.background = c; b.title = c; b.setAttribute('aria-label', 'Color ' + c);
        b.onclick = () => { s.colA = c; body.querySelector(`#gc_${gi}_colA`).value = c; changed(); pushHistory(); }; sw.appendChild(b); }
      body.appendChild(sw);
    }
    if (s.mode === 'pat') {
      const pc = document.createElement('div'); pc.className = 'chips'; body.appendChild(pc);
      chips(pc, Object.entries(PATTERNS), s.pat, v => { s.pat = v; changed(); pushHistory(); });
      slider(body, {id: `gs_${gi}_pat`, label: 'Escala del estampado', min: .015, max: .3, step: .005, value: s.patS, fmt: v => Math.round(v * 100) + ' cm', input: v => { s.patS = v; changed(); }, change: pushHistory});
    }
    const lr = document.createElement('div'); lr.className = 'row';
    lr.innerHTML = `<span class="gcat" style="margin:0">${tr('Capa')}</span><button type="button" class="btn small">${tr('Más adentro')}</button><button type="button" class="btn small">${tr('Más afuera')}</button>`;
    const [bIn, bOut] = lr.querySelectorAll('button');
    bIn.onclick = () => { s.layer = (s.layer || 0) - 1; updateBodyHide(mq); pushHistory(); };
    bOut.onclick = () => { s.layer = (s.layer || 0) + 1; updateBodyHide(mq); pushHistory(); };
    body.appendChild(lr);
    const hl = document.createElement('label'); hl.className = 'check';
    hl.innerHTML = `<input type="checkbox" ${s.hide !== false ? 'checked' : ''}> ${tr('Ocultar lo que tapa (piel y prendas de debajo)')}`;
    hl.querySelector('input').onchange = e => { s.hide = e.target.checked; updateBodyHide(mq); pushHistory(); };
    body.appendChild(hl);
    if (it) { const cr = document.createElement('p'); cr.className = 'note'; cr.textContent = tr('Autoría: {a} · CC0', {a: it.author}); body.appendChild(cr); }
    box.appendChild(card);
  });
}
function wearOutfit(m, specs) {
  const blocked = (specs || []).filter(sp => garmentBlock(m, ROPA.byId[sp.id]));
  if (blocked.length) { specs = specs.filter(sp => !blocked.includes(sp)); toast(tr('Sin {x}: {why}', {x: blocked.map(b => garmentTitle(b.id)).join(', '), why: garmentBlock(m, ROPA.byId[blocked[0].id])})); }
  const p = setOutfit(m, specs); p.then(() => { if (m === mq) renderGarmentList(); }); return p; }
function removeGarment(gi) { wearOutfit(mq, mq.outfit.filter((_, i) => i !== gi)); renderGarmentList(); renderLibrary(); pushHistory(); }
function toggleGarment(id) {
  const i = mq.outfit.findIndex(s => s.id === id);
  if (i >= 0) return removeGarment(i);
  const why = garmentBlock(mq, ROPA.byId[id]); if (why) return toast(why);
  const list = [...mq.outfit, garmentSpec(id)];
  wearOutfit(mq, list).then(() => { const g = mq.garments.find(x => x.spec.id === id); if (g) { g.open = true; renderGarmentList(); } });
  renderGarmentList(); renderLibrary(); pushHistory();
}
function renderLibrary() {
  const box = $('#garmentAdd'); if (!box) return;
  if (!ROPA.catalog) { box.innerHTML = `<p class="empty">${tr('Cargando la biblioteca…')}</p>`; loadCatalog().then(renderLibrary, () => box.innerHTML = `<p class="empty">${tr('No se pudo cargar la biblioteca de ropa.')}</p>`); return; }
  const open = new Set([...box.querySelectorAll('details[open]')].map(d => d.dataset.cat));
  box.innerHTML = '';
  const q = ropaSearch.trim().toLowerCase(), worn = new Set(mq.outfit.map(s => s.id));
  const cats = [...new Set(ROPA.catalog.map(c => c.cat))].sort((a, b) => a === 'Varios' ? 1 : b === 'Varios' ? -1 : tr(a).localeCompare(tr(b), LANG));
  for (const cat of cats) {
    const items = ROPA.catalog.filter(c => c.cat === cat && (!q || c.title.toLowerCase().includes(q)));
    if (!items.length) continue;
    const det = document.createElement('details'); det.className = 'folder'; det.dataset.cat = cat; det.open = open.has(cat) || !!q;
    const nWorn = items.filter(c => worn.has(c.id)).length;
    det.innerHTML = `<summary><span class="fi" aria-hidden="true"></span><span class="fn"></span><span class="fc">${nWorn ? tr(nWorn > 1 ? '{n} puestas' : '{n} puesta', {n: nWorn}) + ' · ' : ''}${items.length}</span></summary><div class="lib"></div>`;
    det.querySelector('.fn').textContent = tr(cat);
    const grid = det.querySelector('.lib');
    const fill = () => {
      if (grid.childElementCount) return;
      for (const c of items) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'libItem' + (worn.has(c.id) ? ' on' : ''); b.title = c.title; b.setAttribute('aria-pressed', worn.has(c.id));
        b.innerHTML = c.thumb ? `<img loading="lazy" alt="" src="${c.thumb}">` : `<span class="noimg">${tr('sin imagen')}</span>`;
        const t = document.createElement('span'); t.className = 'lt'; t.textContent = c.title; b.appendChild(t);
        const why = !worn.has(c.id) && garmentBlock(mq, c);
        if (why) { b.classList.add('blocked'); b.title = why; b.setAttribute('aria-disabled', 'true'); }
        b.onclick = () => toggleGarment(c.id);
        grid.appendChild(b);
      }
    };
    if (det.open) fill(); det.ontoggle = () => { if (det.open) fill(); };
    box.appendChild(det);
  }
  if (!box.childElementCount) box.innerHTML = `<p class="empty">${tr('Nada coincide con la búsqueda.')}</p>`;
}
function buildClothesUI() {
  chips($('#outfitChips'), Object.entries(OUTFITS).map(([k, v]) => [k, v[0]]), null, k => {
    setPressed($('#outfitChips'), k); wearOutfit(mq, OUTFITS[k][1]); renderGarmentList(); renderLibrary(); renderCast(); pushHistory();
  });
  $('#outfitRandom').onclick = async () => { setPressed($('#outfitChips'), ''); wearOutfit(mq, await randomOutfit()); renderGarmentList(); renderLibrary(); pushHistory(); };
  $('#outfitAll').onclick = () => { for (const m of chars) if (m !== mq) wearOutfit(m, mq.outfit); pushHistory(); };
  $('#outfitEachRandom').onclick = async () => { for (const m of chars) wearOutfit(m, await randomOutfit()); renderGarmentList(); renderLibrary(); pushHistory(); };
  $('#outfitNone').onclick = () => { setPressed($('#outfitChips'), ''); wearOutfit(mq, []); renderGarmentList(); renderLibrary(); pushHistory(); };
  const s = $('#ropaSearch'); s.oninput = () => { ropaSearch = s.value; renderLibrary(); };
  renderGarmentList(); renderLibrary();
}
