/* ======================= the comic: pages in a row, their script, the film's shots =======================
   Under the desk, the pages in a row (as a book: the first alone, then in facing pairs), each with its picture, its
   state (script, pencils, inks, letters, done: the work's progress over it all) and how much it says; dragged to
   reorder them, copied, taken out, and a new one made from a gallery of layouts. Beside it, the page's script: what
   each panel shows and what is said in it, written there or on the page (the same words: a line typed in the script is
   the balloon on the page), with warnings when a panel or a page says too much; the whole comic's script copied or
   saved as text (PAGE / PANEL, read back by the script engine). Over it, the film's shots: dragged onto a panel to
   show them there (linked). */
const PAGE_STATUS = [['guion', 'Guion', '#b9ad94'], ['boceto', 'Boceto', '#d9a441'], ['tinta', 'Tinta', '#2b5a9e'], ['rotulado', 'Rotulado', '#8a5cc0'], ['hecho', 'Hecho', '#3f8a4f']];
const wordsIn = t => String(t || '').trim().split(/\s+/).filter(Boolean).length;
const pageWords = pg => pg.panels.reduce((a, p) => a + p.balloons.reduce((b, x) => b + wordsIn(x.text), 0), 0);
const statusOf = pg => Math.max(0, PAGE_STATUS.findIndex(s => s[0] === (pg.status || 'guion')));
const WORDS_PANEL = 35, WORDS_PAGE = 210;
const TR_ICON = {dup: '<rect x="8" y="8" width="12" height="12" rx="1"/><path d="M4 16V4h12"/>', del: '<path d="M6 6l12 12M18 6 6 18"/>', plus: '<path d="M12 5v14M5 12h14"/>'};
const trIcon = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">${TR_ICON[n]}</svg>`;

/* ---------- layouts as pictures ---------- */
function presetSVG(key, c = comic()) {
  // (a panel that bleeds is drawn to the paper's edge, where it is cut)
  const L = presetPanels(key, c), P = c.page, d = p => panelPts(p).map(([x, y], i) => `${i ? 'L' : 'M'}${clamp(x, .8, P.w - .8).toFixed(1)} ${clamp(y, .8, P.h - .8).toFixed(1)}`).join('') + 'Z';
  return `<svg viewBox="0 0 ${P.w} ${P.h}" aria-hidden="true"><rect width="${P.w}" height="${P.h}" class="pp"/>${L.map(p => `<path d="${d(p)}"${p.inset ? ' class="in"' : ''}/>`).join('')}</svg>`;
}
function presetGallery(box, onPick) {
  box.innerHTML = ''; box._fmt = galleryKey();
  for (const [grp, keys] of PRESET_GROUPS) {
    const h = document.createElement('p'); h.className = 'lbl'; h.textContent = tr(grp); box.appendChild(h);
    const row = document.createElement('div'); row.className = 'presets';
    for (const k of keys) { const T = PANEL_TEMPLATES[k], b = document.createElement('button'); b.type = 'button'; b.className = 'chip preset'; b.dataset.v = k; b.title = tr(T.label);
      b.innerHTML = presetSVG(k) + '<span></span>'; b.querySelector('span').textContent = tr(T.label); b.onclick = () => onPick(k); row.appendChild(b); }
    box.appendChild(row);
  }
}
const galleryKey = () => { const c = comic(); return [c.format, c.rtl, c.page.w, c.page.h].join(); };
// a layout put on a page that has panels: they take its shapes in reading order (the pictures, balloons and notes
// go with them), gliding there; what does not fit is said, with Deshacer at hand
function applyLayout(pg, key) {
  const c = comic(), old = readingOrder(pg, c), L = presetPanels(key, c), ord = readingOrder({panels: L}, c);
  const lost = old.slice(ord.length).filter(o => panelShot(o) || o.balloons.length).length;
  morph(() => {
    ord.forEach((q, i) => { const o = old[i]; if (!o) return; q.id = o.id; for (const k of CONTENT_KEYS) if (o[k] !== undefined) q[k] = o[k]; if (o.border) q.border = o.border; if (o.breakout) q.breakout = o.breakout; });
    pg.panels = L;
  });
  CM.sel = null; CM.cache.clear(); comicSaved(); syncComicUI(); deskChanged();
  if (lost) toast(trn(lost, 'Una viñeta con contenido no cabía en este diseño y se ha quitado.', '{n} viñetas con contenido no cabían en este diseño y se han quitado.'), {undo: () => comicUndo(-1)});
}

/* ---------- the row of pages ---------- */
let trackT = 0;
function trackerSoon() { clearTimeout(trackT); trackT = setTimeout(renderTracker, 120); }
function drawThumb(cv, pg) {
  const c = comic(), dpr = Math.min(devicePixelRatio || 1, 2), w = innerWidth <= 600 ? 34 : 58, h = Math.round(w * c.page.h / c.page.w); cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px';
  const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); composePage(g, pg, cv.width / c.page.w, 0, 0, {thumb: true});
}
function renderTracker() {
  const box = $('#pvTrack'); if (!box || !pageOn()) return; const c = comic(), strip = box.querySelector('.pvt-strip'), h0 = box.offsetHeight;
  const n = c.pages.length, panels = c.pages.reduce((a, pg) => a + pg.panels.length, 0), w = c.pages.reduce((a, pg) => a + pageWords(pg), 0), prog = n ? c.pages.reduce((a, pg) => a + statusOf(pg), 0) / (n * (PAGE_STATUS.length - 1)) : 0;
  box.querySelector('.pvt-stats').textContent = [trn(n, '1 página', '{n} páginas'), trn(panels, '1 viñeta', '{n} viñetas'), trn(w, '1 palabra', '{n} palabras')].join(' · ');
  const bar = box.querySelector('.pvt-bar'); bar.querySelector('i').style.width = Math.round(prog * 100) + '%'; bar.title = tr('{p} % hecho', {p: Math.round(prog * 100)}); box.querySelector('.pvt-pct').textContent = tr('{p} % hecho', {p: Math.round(prog * 100)});
  const before = new Map([...strip.children].map(el => [el.dataset.id, el.getBoundingClientRect()])), old = new Map([...strip.querySelectorAll('.pvcard')].map(el => [el.dataset.id, el])), list = [];
  c.pages.forEach((pg, i) => { const el = old.get(pg.id) || makeCard(pg); old.delete(pg.id); updateCard(el, pg, i); list.push(el); });
  list.push(strip.querySelector('.pvadd') || makeAddCard());
  list.forEach((el, i) => { if (strip.children[i] !== el) strip.insertBefore(el, strip.children[i] || null); });
  for (const el of old.values()) el.remove();
  // (the cards glide to their new places; a new one pops in)
  for (const el of strip.children) { const r0 = before.get(el.dataset.id), r1 = el.getBoundingClientRect();
    if (!r0) { if (el.dataset.id !== 'add' && !UX.reduce) el.animate([{transform: 'scale(.5)', opacity: 0}, {transform: 'none', opacity: 1}], {duration: 280, easing: 'cubic-bezier(.2,.9,.3,1.25)'}); continue; }
    const dx = r0.left - r1.left; if (Math.abs(dx) > 1 && !UX.reduce) el.animate([{transform: `translateX(${dx}px)`}, {transform: 'none'}], {duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)'}); }
  // its height: the desk keeps the page clear of it, and the notes of #hint (outside the desk) show just above it
  if (box.offsetHeight !== h0 || !box.parentElement.style.getPropertyValue('--trackH')) { box.parentElement.style.setProperty('--trackH', box.offsetHeight + 'px'); $('#viewport').style.setProperty('--trackH', box.offsetHeight + 'px'); drawPage(); }
  const cur = strip.querySelector('.pvcard.on'); if (cur) { const a = cur.offsetLeft - strip.scrollLeft, b = a + cur.offsetWidth; if (a < 0 || b > strip.clientWidth) strip.scrollTo({left: cur.offsetLeft - strip.clientWidth / 2 + cur.offsetWidth / 2, behavior: UX.reduce ? 'auto' : 'smooth'}); }
}
function makeCard(pg) {
  const el = document.createElement('div'); el.className = 'pvcard'; el.dataset.id = pg.id; el.setAttribute('role', 'listitem'); el.tabIndex = 0;
  el.innerHTML = `<canvas></canvas><span class="n"></span><button class="st" type="button"></button><span class="w"></span><span class="ops"><button type="button" data-op="dup">${trIcon('dup')}</button><button type="button" data-op="del">${trIcon('del')}</button></span>`;
  const [dup, del] = el.querySelectorAll('.ops button'); dup.title = tr('Duplicar la página'); del.title = tr('Borrar la página'); dup.setAttribute('aria-label', dup.title); del.setAttribute('aria-label', del.title);
  const page = () => comic().pages.find(q => q.id === el.dataset.id);
  el.querySelector('.st').onclick = e => { e.stopPropagation(); const p = page(); p.status = PAGE_STATUS[(statusOf(p) + 1) % PAGE_STATUS.length][0]; comicSaved(); renderTracker(); syncPageUI(); renderScript(true); };
  dup.onclick = e => { e.stopPropagation(); duplicatePage(page()); };
  del.onclick = e => { e.stopPropagation(); deletePage(page()); };
  el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goPage(comic().pages.indexOf(page())); } };
  // a click opens it; dragged, it goes elsewhere in the book
  el.onpointerdown = e => {
    if (e.target.closest('button') || e.button) return; const strip = el.parentElement, x0 = e.clientX, cards = [...strip.querySelectorAll('.pvcard')], from = cards.indexOf(el); let to = from, drag = false;
    const W = el.getBoundingClientRect().width + 8, mids = cards.map(c2 => { const r = c2.getBoundingClientRect(); return r.left + r.width / 2; });
    const move = ev => { const dx = ev.clientX - x0; if (!drag && Math.abs(dx) > 6) { drag = true; el.classList.add('lift'); }
      if (!drag) return; el.style.transform = `translateX(${dx}px) rotate(-2deg) scale(1.06)`;
      const cx = mids[from] + dx; to = mids.reduce((best, m, i) => Math.abs(m - cx) < Math.abs(mids[best] - cx) ? i : best, from);
      cards.forEach((c2, i) => { if (c2 === el) return; const s = from < to && i > from && i <= to ? -W : from > to && i < from && i >= to ? W : 0; c2.style.transform = s ? `translateX(${s}px)` : ''; }); };
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      if (!drag) { goPage(comic().pages.indexOf(page())); return; }
      el.classList.remove('lift'); const c = comic(), curPg = curPage();
      if (to !== from) { c.pages.splice(to, 0, c.pages.splice(from, 1)[0]); CM.page = c.pages.indexOf(curPg); comicSaved(); }
      renderTracker(); cards.forEach(c2 => { c2.style.transform = ''; }); syncComicUI(); drawPage(); };
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  };
  return el;
}
function updateCard(el, pg, i) {
  const c = comic(), st = PAGE_STATUS[statusOf(pg)], w = pageWords(pg);
  el.classList.toggle('on', i === CM.page); el.classList.toggle('spread', i === 0 || i % 2 === 1);
  el.querySelector('.n').textContent = String(i + 1); el.setAttribute('aria-label', tr('Página {n}', {n: i + 1}) + (pg.title ? ': ' + pg.title : '') + ' · ' + tr(st[1]));
  const b = el.querySelector('.st'); b.style.background = st[2]; b.title = tr('Estado: {s} (toca para avanzar)', {s: tr(st[1])}); b.setAttribute('aria-label', b.title);
  const ws = el.querySelector('.w'); ws.textContent = w ? String(w) : ''; ws.classList.toggle('warn', w > WORDS_PAGE); ws.title = trn(w, '1 palabra', '{n} palabras');
  drawThumb(el.querySelector('canvas'), pg); void c;
}
function makeAddCard() {
  const el = document.createElement('button'); el.type = 'button'; el.className = 'pvadd'; el.dataset.id = 'add'; el.innerHTML = trIcon('plus'); el.title = tr('Nueva página'); el.setAttribute('aria-label', el.title);
  el.onclick = e => { e.stopPropagation(); const pop = $('#pvPresets'); if (!pop.hidden) { pop.hidden = true; return; } if (pop.querySelector('#cmTemplates')._fmt !== galleryKey()) presetGallery(pop.querySelector('#cmTemplates'), newPageFrom);
    pop.hidden = false; const r = el.getBoundingClientRect(), b = $('#pageView').getBoundingClientRect(); pop.style.left = clamp(r.left - b.left + r.width / 2 - pop.offsetWidth / 2, 8, b.width - pop.offsetWidth - 8) + 'px'; pop.style.bottom = (b.bottom - r.top + 10) + 'px'; };
  return el;
}
function newPageFrom(k) { const was = CM.page, pg = addPage(k, comic().pages.length ? CM.page + 1 : 0); CM.page = was; $('#pvPresets').hidden = true; goPage(comic().pages.indexOf(pg), {force: true}); comicSaved(); }
function duplicatePage(pg) {
  const c = comic(), q = JSON.parse(JSON.stringify(pg)); q.id = newId('pg');
  q.panels.forEach((p, i) => { const was = pg.panels[i].id, bm = {}; p.id = newId('p'); for (const b of p.balloons) { bm[b.id] = newId('b'); b.id = bm[b.id]; } for (const b of p.balloons) if (b.join) b.join = bm[b.join]; if (p.shot) p.shot.id = ++shotSeq; if (CM.last.has(was)) CM.last.set(p.id, CM.last.get(was)); });
  for (const x of q.sfx || []) x.id = newId('s');
  c.pages.splice(c.pages.indexOf(pg) + 1, 0, q); goPage(c.pages.indexOf(q), {force: true}); comicSaved(); toast(tr('Página duplicada'));
}
function deletePage(pg) {
  const c = comic(), i = c.pages.indexOf(pg); if (i < 0) return;
  const el = $(`#pvTrack .pvcard[data-id="${pg.id}"]`), go = () => { c.pages.splice(i, 1); if (!c.pages.length) addPage('p4'); CM.page = clamp(CM.page > i ? CM.page - 1 : CM.page, 0, c.pages.length - 1); CM.sel = CM.selB = CM.selX = null; comicSaved(); syncComicUI(); deskChanged(); toast(tr('Página borrada.'), {undo: () => comicUndo(-1)}); };
  if (el && !UX.reduce) el.animate([{transform: 'none', opacity: 1}, {transform: 'translateY(30px) scale(.6)', opacity: 0}], {duration: 220, easing: 'ease-in'}).onfinish = go; else go();
}

/* ---------- the film's shots, to drop on panels ---------- */
function renderShots() {
  const box = $('#pvShots .pvsh-list'); if (!box) return; box.innerHTML = '';
  if (!ANIM.shots.length) { const p = document.createElement('p'); p.className = 'note'; p.textContent = tr('Aún no hay película: hazla en Animación (un guion, la galería de animaciones…) y sus planos aparecen aquí.'); box.appendChild(p); return; }
  ANIM.shots.forEach((s, i) => {
    const it = document.createElement('div'); it.className = 'pvshot'; it.tabIndex = 0; it.setAttribute('role', 'button');
    // (its thumbnail, or the picture of a panel that shows it)
    let src = s.thumb; if (!src) { const p = comic().pages.flatMap(pg => pg.panels).find(q => q.link && q.link.shotId === s.id && CM.last.has(q.id)); if (p) { const img = CM.last.get(p.id).img, c2 = document.createElement('canvas'); c2.width = 196; c2.height = 112; drawCover(c2.getContext('2d'), img, {x: 0, y: 0, w: 196, h: 112}); src = c2.toDataURL('image/jpeg', .8); } }
    if (src) { const im = document.createElement('img'); im.alt = ''; im.src = src; im.draggable = false; it.appendChild(im); } else it.appendChild(document.createElement('i'));
    const t = document.createElement('span'); t.textContent = `${i + 1}. ${s.name}`; it.appendChild(t); it.title = tr('Arrastra «{s}» a una viñeta', {s: s.name});
    it.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); if (CM.sel) linkShot(CM.sel, s); } };
    it.onpointerdown = e => shotDrag(e, s, it);
    box.appendChild(it);
  });
}
function shotDrag(e, s, it) {
  if (e.button) return; const x0 = e.clientX, y0 = e.clientY; let ghost = null, over = null;
  const canvasPt = ev => { const r = pv.cv.getBoundingClientRect(); return ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom ? [(ev.clientX - r.left) * pv.dpr, (ev.clientY - r.top) * pv.dpr] : null; };
  const move = ev => {
    if (!ghost && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 6) { ghost = it.cloneNode(true); ghost.className = 'pvghost'; document.body.appendChild(ghost); }
    if (!ghost) return; ghost.style.transform = `translate(${ev.clientX - 50}px, ${ev.clientY - 36}px) rotate(-4deg)`;
    const pt = canvasPt(ev), h = pt && pageHit(...pt); over = h && h.p ? h.p : null; pv.drop = over ? {p: over, label: tr('Soltar: enlazar el plano')} : null; drawPage();
  };
  const up = ev => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    if (ghost) { ghost.remove(); pv.drop = null; if (over) { const pt = canvasPt(ev), im = it.querySelector('img'); if (im && im.complete && pt) { const c2 = document.createElement('canvas'); c2.width = im.naturalWidth || 160; c2.height = im.naturalHeight || 90; c2.getContext('2d').drawImage(im, 0, 0, c2.width, c2.height); flyFrom(over, {x: pt[0] - 50 * pv.dpr, y: pt[1] - 30 * pv.dpr, w: 100 * pv.dpr, h: 60 * pv.dpr}, c2); } linkShot(over, s); } drawPage(); return; }
    if (CM.sel) linkShot(CM.sel, s); else toast(tr('Elige antes una viñeta, o arrastra el plano a una.'));
  };
  addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
}

/* ---------- the page's script ---------- */
const speakerName = (p, b) => { const s = panelShot(p), x = s && b.ci != null && s.scene.chars[b.ci]; return x ? (x.body.name || tr('Personaje {n}', {n: b.ci + 1})) : ''; };
function renderScript(force) {
  const box = $('#pvScript'); if (!box || box.hidden || !pageOn()) return; const pg = curPage(); if (!pg) return; const inner = box.querySelector('.pvs-in');
  const order = readingOrder(pg), sig = [pg.id, ...order.map(p => p.id + ':' + (panelShot(p) ? panelShot(p).id : '') + ':' + p.balloons.map(b => b.id + '/' + (b.ci ?? '') + '/' + b.kind).join(','))].join(';');
  const mark = () => { for (const r of inner.querySelectorAll('.pvs-row')) r.classList.toggle('on', !!CM.sel && r.dataset.id === CM.sel.id); scriptCounts(inner, pg); };
  if (!force && sig === inner._sig) { mark(); if (!inner.contains(document.activeElement)) for (const el of inner.querySelectorAll('[data-b] .txt')) { const b = findBalloon(pg, el.closest('[data-b]').dataset.b); if (b && el.value !== b.text) el.value = b.text; } return; }
  inner._sig = sig; inner.innerHTML = '';
  const h = document.createElement('div'); h.className = 'pvs-h';
  h.innerHTML = `<input class="pvs-title" maxlength="60"><p class="lbl"></p><div class="chips pvs-st"></div><p class="pvs-sum"></p>`; h.querySelector('.lbl').textContent = tr('Estado de la página');
  const ti = h.querySelector('.pvs-title'); ti.value = pg.title || ''; ti.placeholder = tr('Página {n}: título o escena', {n: CM.page + 1}); ti.setAttribute('aria-label', tr('Título de la página'));
  ti.oninput = () => { pg.title = ti.value; drawPage(); trackerSoon(); syncPageUI(); }; ti.onchange = comicSaved;
  chips(h.querySelector('.pvs-st'), PAGE_STATUS.map(s => [s[0], s[1]]), pg.status || 'guion', v => { pg.status = v; comicSaved(); trackerSoon(); syncPageUI(); });
  inner.appendChild(h);
  const list = document.createElement('ol'); list.className = 'pvs-list';
  order.forEach((p, j) => {
    const s = panelShot(p), row = document.createElement('li'); row.className = 'pvs-row'; row.dataset.id = p.id;
    row.innerHTML = `<span class="num"></span><div class="pvs-b"><div class="pvs-meta"></div><textarea class="note" rows="2"></textarea><div class="lns"></div><button class="addln" type="button"></button></div>`;
    row.querySelector('.num').textContent = String(j + 1);
    row.querySelector('.pvs-meta').textContent = s ? (p.link ? '🎬 ' + s.name : tr('Escena propia')) : tr('Vacía');
    const note = row.querySelector('.note'); note.value = p.note || ''; note.placeholder = tr('Qué se ve en la viñeta…'); note.setAttribute('aria-label', tr('Viñeta {n}: descripción', {n: j + 1}));
    note.oninput = () => { p.note = note.value; }; note.onchange = comicSaved;
    const lns = row.querySelector('.lns');
    for (const b of p.balloons) {
      const ln = document.createElement('div'); ln.className = 'ln'; ln.dataset.b = b.id;
      ln.innerHTML = `<select class="who"></select><input class="txt"><button class="x" type="button">${trIcon('del')}</button>`;
      const sel = ln.querySelector('.who'), cast = s ? s.scene.chars : [];
      sel.innerHTML = `<option value="">${tr('Cartela')}</option>` + cast.map((x, i) => `<option value="${i}"></option>`).join('');
      [...sel.options].slice(1).forEach((o, i) => { o.textContent = cast[i].body.name || tr('Personaje {n}', {n: i + 1}); });
      sel.value = b.ci != null && cast[b.ci] ? String(b.ci) : ''; sel.setAttribute('aria-label', tr('Quién habla'));
      sel.onchange = () => { b.ci = sel.value === '' ? null : +sel.value; if (b.ci == null && !BOXY.has(b.kind)) b.kind = 'caption'; else if (b.ci != null && b.kind === 'caption') b.kind = 'speech'; comicSaved(); syncComicUI(); drawPage(); };
      const txt = ln.querySelector('.txt'); txt.value = b.text || ''; txt.placeholder = tr('Lo que dice…'); txt.setAttribute('aria-label', tr('Texto del bocadillo'));
      txt.oninput = () => { b.text = txt.value; scriptCounts(inner, pg); drawPage(); if (CM.selB === b && document.activeElement !== $('#cmText')) $('#cmText').value = b.text; };
      txt.onfocus = () => { CM.sel = p; CM.selB = b; syncComicUI(); drawPage(); mark(); }; txt.onchange = () => { comicSaved(); trackerSoon(); };
      const x = ln.querySelector('.x'); x.title = tr('Quitar el bocadillo'); x.setAttribute('aria-label', x.title); x.onclick = () => { removeBalloon(p, b); if (CM.selB === b) CM.selB = null; comicSaved(); syncComicUI(); deskChanged(); renderScript(true); };
      lns.appendChild(ln);
    }
    const add = row.querySelector('.addln'); add.textContent = '+ ' + tr('diálogo');
    add.onclick = () => { const nb = {id: newId('b'), kind: s && s.scene.chars.length ? 'speech' : 'caption', text: '', ci: s && s.scene.chars.length ? 0 : null, x: comic().rtl ? .72 : .28, y: clamp(.16 + p.balloons.length * .12, .1, .85), size: 9};
      p.balloons.push(nb); CM.sel = p; CM.selB = nb; comicSaved(); syncComicUI(); deskChanged(); renderScript(true); const t = inner.querySelector(`[data-b="${nb.id}"] .txt`); if (t) t.focus(); };
    row.onmouseenter = () => { pv.hl = p.id; drawPage(); }; row.onmouseleave = () => { pv.hl = null; drawPage(); };
    row.onclick = e => { if (e.target.closest('input,textarea,select,button')) return; CM.sel = p; CM.selB = null; pulsePanel(p); syncComicUI(); mark(); };
    list.appendChild(row);
  });
  inner.appendChild(list);
  const f = document.createElement('div'); f.className = 'pvs-f';
  f.innerHTML = `<button class="btn small" type="button" data-a="copy"></button><button class="btn small" type="button" data-a="save"></button>`;
  const [cp, sv] = f.querySelectorAll('button'); cp.textContent = tr('Copiar el guion'); sv.textContent = tr('Guardar el guion (.txt)');
  cp.onclick = async () => { try { await navigator.clipboard.writeText(comicScriptText()); toast(tr('Guion copiado')); } catch (e) { toast(tr('No se ha podido copiar')); } };
  sv.onclick = () => saveFile(`${tr('guion')}-${stamp()}.txt`, new TextEncoder().encode(comicScriptText()), 'text/plain');
  inner.appendChild(f);
  mark();
}
const findBalloon = (pg, id) => { for (const p of pg.panels) for (const b of p.balloons) if (b.id === id) return b; return null; };
// how much the page and each panel say (a comic page reads well under ~200 words; a panel under ~35)
function scriptCounts(inner, pg) {
  const w = pageWords(pg), sum = inner.querySelector('.pvs-sum'); if (!sum) return;
  sum.textContent = [trn(pg.panels.length, '1 viñeta', '{n} viñetas'), trn(w, '1 palabra', '{n} palabras')].join(' · ') + (w > WORDS_PAGE ? ' · ' + tr('demasiado texto para una página') : '');
  sum.classList.toggle('warn', w > WORDS_PAGE);
  for (const r of inner.querySelectorAll('.pvs-row')) { const p = pg.panels.find(q => q.id === r.dataset.id); if (!p) continue; const pw = p.balloons.reduce((a, b) => a + wordsIn(b.text), 0); r.classList.toggle('heavy', pw > WORDS_PANEL || p.balloons.length > 4); r.title = pw > WORDS_PANEL ? tr('Viñeta muy cargada: {n} palabras', {n: pw}) : ''; }
}
// the whole comic as a script (PAGE / PANEL / NAME: line), as the script engine reads it back
function comicScriptText() {
  const c = comic(), out = [], how = {shout: 'grita', whisper: 'susurra', thought: 'piensa', radio: 'radio'};
  c.pages.forEach((pg, i) => {
    out.push(`${tr('PÁGINA')} ${i + 1}${pg.title ? ' — ' + pg.title : ''}`, '');
    readingOrder(pg, c).forEach((p, j) => {
      out.push(`${tr('VIÑETA')} ${j + 1}`); if (p.note && p.note.trim()) out.push(p.note.trim());
      for (const b of p.balloons) { if (!b.text || !b.text.trim()) continue; const who = speakerName(p, b), box = BOXY.has(b.kind) || !who;
        out.push(`${box ? tr('CARTELA') : who.toUpperCase()}${!box && how[b.kind] ? ` (${tr(how[b.kind])})` : ''}: ${b.text.trim()}`); }
      out.push('');
    });
  });
  return out.join('\n');
}

/* ---------- the page, in the Cómic tab ---------- */
function syncPageUI() {
  const pg = curPage(); if (!$('#cmTitle') || !pg) return;
  if (document.activeElement !== $('#cmTitle')) $('#cmTitle').value = pg.title || ''; $('#cmTitle').placeholder = tr('Página {n}: título o escena', {n: CM.page + 1});
  setPressed($('#cmStatus'), pg.status || 'guion');
  if ($('#cmLayouts')._fmt !== galleryKey()) presetGallery($('#cmLayouts'), k => { const p = curPage(); if (p) applyLayout(p, k); });
  $('#cmPageNo').textContent = tr('Página {n} de {t}', {n: CM.page + 1, t: comic().pages.length});
}
function buildTrackerUI(el) {
  const add = html => { const d = document.createElement('div'); d.innerHTML = html; const n = d.firstElementChild; el.appendChild(n); return n; };
  add(`<div class="pvshots" id="pvShots" hidden><div class="pvsh-h"><b></b><span></span></div><div class="pvsh-list"></div></div>`);
  $('#pvShots .pvsh-h b').textContent = tr('Planos de la película'); $('#pvShots .pvsh-h span').textContent = tr('arrastra uno a una viñeta; queda enlazado');
  add(`<div class="pvtrack" id="pvTrack"><div class="pvt-h"><b></b><span class="pvt-stats"></span><span class="pvt-bar"><i></i></span><span class="pvt-pct"></span></div><div class="pvt-strip" role="list"></div></div>`);
  $('#pvTrack .pvt-h b').textContent = tr('Páginas'); $('#pvTrack .pvt-strip').setAttribute('aria-label', tr('Páginas del cómic'));
  add(`<aside class="pvscript" id="pvScript" hidden><div class="pvs-top"><b></b><button class="pvb" type="button" data-act="close">${trIcon('del')}</button></div><div class="pvs-in"></div></aside>`);
  $('#pvScript .pvs-top b').textContent = tr('Guion de la página'); $('#pvScript').setAttribute('aria-label', tr('Guion de la página'));
  $('#pvScript [data-act=close]').onclick = () => toggleDeskPane('#pvScript', 'cdp.cmScript', false); $('#pvScript [data-act=close]').setAttribute('aria-label', tr('Cerrar'));
  add(`<div class="pvpop" id="pvPresets" hidden><div class="pvpop-h"><b></b></div><div id="cmTemplates"></div></div>`);
  $('#pvPresets .pvpop-h b').textContent = tr('Nueva página con…');
  addEventListener('pointerdown', e => { const pop = $('#pvPresets'); if (pop && !pop.hidden && !e.target.closest('#pvPresets,.pvadd')) pop.hidden = true; });
  // (the script beside the page when there is room for it, unless it was closed)
  const wide = innerWidth >= 1100; if (store.get('cdp.cmScript', wide)) $('#pvScript').hidden = false; if (store.get('cdp.cmShots', false)) $('#pvShots').hidden = false;
  presetGallery($('#cmTemplates'), newPageFrom);
  // the page section of the tab
  if ($('#cmTitle')) {
    $('#cmTitle').oninput = e => { const pg = curPage(); if (!pg) return; pg.title = e.target.value; drawPage(); trackerSoon(); renderScript(); }; $('#cmTitle').onchange = comicSaved;
    chips($('#cmStatus'), PAGE_STATUS.map(s => [s[0], s[1]]), 'guion', v => { const pg = curPage(); if (!pg) return; pg.status = v; comicSaved(); trackerSoon(); renderScript(true); });
    $('#cmPrevPage').onclick = () => goPage(CM.page - 1); $('#cmNextPage').onclick = () => goPage(CM.page + 1);
    $('#cmDupPage').onclick = () => curPage() && duplicatePage(curPage());
  }
}
