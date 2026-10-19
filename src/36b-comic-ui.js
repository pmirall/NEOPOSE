/* ======================= the page, on screen =======================
   The Cómic tab turns Estático's canvas into the page: the page fitted to the canvas, its panels drawn from their
   shots, the balloons on top. A click picks a panel or a balloon (dragged to place it); a double click (or «Editar en
   3D») opens the panel on the stage: the canvas shows that shot, framed exactly as the panel (the guide is the
   panel's shape), posed, lit and dressed with all of Estático's tabs; going back to Cómic keeps what was done in the
   panel and gives the canvas back as it was. */
const pv = {cv: null, g: null, k: 1, ox: 0, oy: 0, hits: [], drag: null, dpr: 1};
function pageOn() { return !!$('#pageView') && !$('#pageView').hidden; }
function showPage(on) {
  const el = $('#pageView'); if (!el) return;
  if (on && CM.edit) { finishPanelEdit(); return; }  // (it shows the page when done)
  el.hidden = !on; document.body.classList.toggle('paging', on);
  if (on) { if (!comic().pages.length) addPage('p4'); drawPage(); }
}
function drawPage() {
  if (!pageOn()) return; if (!CM.fontsReady) { comicFonts().then(() => { CM.fontsReady = true; drawPage(); }); } const c = comic(), pg = curPage(); if (!pg) return;
  const box = $('#pageView'), r = box.getBoundingClientRect(), dpr = pv.dpr = Math.min(devicePixelRatio || 1, 2), cv = pv.cv;
  cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
  const pad = 26 * dpr, k = Math.min((cv.width - pad * 2) / c.page.w, (cv.height - pad * 2 - 30 * dpr) / c.page.h);
  pv.k = k; pv.ox = (cv.width - c.page.w * k) / 2; pv.oy = pad;
  const g = pv.g; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
  g.save(); g.shadowColor = 'rgba(0,0,0,.18)'; g.shadowBlur = 14 * dpr; g.fillStyle = '#fff'; g.fillRect(pv.ox, pv.oy, c.page.w * k, c.page.h * k); g.restore();
  pv.hits = composePage(g, pg, k, pv.ox, pv.oy, {screen: true});
  // the trim's safe area, faint
  const [mt, mr, mb, ml] = c.page.margin; g.setLineDash([4 * dpr, 4 * dpr]); g.strokeStyle = 'rgba(43,90,158,.35)'; g.lineWidth = 1; g.strokeRect(pv.ox + ml * k, pv.oy + mt * k, (c.page.w - ml - mr) * k, (c.page.h - mt - mb) * k); g.setLineDash([]);
  g.fillStyle = '#6d6555'; g.font = `600 ${12 * dpr}px ${css('--f-body')}`; g.textAlign = 'center';
  g.fillText(tr('Página {n} de {t}', {n: CM.page + 1, t: c.pages.length}) + (c.rtl ? ' · ' + tr('se lee de derecha a izquierda') : ''), cv.width / 2, pv.oy + c.page.h * k + 20 * dpr);
  // the panels not yet drawn (or changed) are drawn now, then the page again
  const missing = pg.panels.filter(p => panelShot(p) && !CM.cache.has(panelKey(p, Math.round(p.w * k), Math.round(p.h * k))));
  if (missing.length && !CM.busy) drawPanels(missing, p => [Math.round(p.w * k), Math.round(p.h * k)]);
}
// what is under a point of the page view (device px): a balloon first, then a panel
function pageHit(x, y) {
  for (let i = pv.hits.length - 1; i >= 0; i--) { const h = pv.hits[i], B = h.box; if (x >= B.x && x <= B.x + B.w && y >= B.y && y <= B.y + B.h) return h.x ? {x: h.x} : {b: h.b, p: h.p}; }
  const pg = curPage(); if (!pg) return null;
  for (const p of pg.panels) { const X = pv.ox + p.x * pv.k, Y = pv.oy + p.y * pv.k; if (x >= X && x <= X + p.w * pv.k && y >= Y && y <= Y + p.h * pv.k) return {p}; }
  return null;
}
function initPageView() {
  const vp = $('#viewport'); if (!vp || $('#pageView')) return;
  const el = document.createElement('div'); el.id = 'pageView'; el.hidden = true; el.innerHTML = '<canvas aria-label="Página del cómic"></canvas>';
  vp.appendChild(el); pv.cv = el.querySelector('canvas'); pv.g = pv.cv.getContext('2d');
  pv.cv.setAttribute('aria-label', tr('Página del cómic'));
  new ResizeObserver(() => pageOn() && drawPage()).observe(el);
  const at = e => { const r = pv.cv.getBoundingClientRect(); return [(e.clientX - r.left) * pv.dpr, (e.clientY - r.top) * pv.dpr]; };
  pv.cv.addEventListener('pointerdown', e => {
    const [x, y] = at(e), h = pageHit(x, y); CM.selX = h && h.x || null; if (!CM.selX) { CM.sel = h ? h.p : null; CM.selB = h && h.b || null; }
    if (h && h.b) { pv.drag = {b: h.b, p: h.p, x, y, bx: h.b.x, by: h.b.y}; pv.cv.setPointerCapture(e.pointerId); }
    else if (h && h.x) { pv.drag = {sfx: h.x, x, y, bx: h.x.x, by: h.x.y}; pv.cv.setPointerCapture(e.pointerId); }
    drawPage(); syncComicUI();
  });
  pv.cv.addEventListener('pointermove', e => { if (!pv.drag) return; const [x, y] = at(e), d = pv.drag, p = d.p;
    if (d.sfx) { d.sfx.x = d.bx + (x - d.x) / pv.k; d.sfx.y = d.by + (y - d.y) / pv.k; drawPage(); return; }
    d.b.x = clamp(d.bx + (x - d.x) / (p.w * pv.k), .05, .95); d.b.y = clamp(d.by + (y - d.y) / (p.h * pv.k), .05, .95); drawPage(); });
  pv.cv.addEventListener('pointerup', () => { if (pv.drag) { pv.drag = null; comicSaved(); } });
  pv.cv.addEventListener('dblclick', e => { const [x, y] = at(e), h = pageHit(x, y); if (h && h.p && !h.b) editPanel(h.p); else if (h && h.b) { CM.selB = h.b; syncComicUI(); const t = $('#cmText'); if (t) t.focus(); } });
}
const comicSaved = () => { if (typeof autosaveSoon === 'function') autosaveSoon(); };

/* ---------- a panel on the stage ---------- */
// open a panel in 3D: the canvas becomes it (an empty panel starts from what the canvas shows)
async function editPanel(p) {
  if (CM.edit) await finishPanelEdit();
  const bench = benchSave();
  if (!panelShot(p)) p.shot = shotFromStage();
  // a linked panel is edited as its own copy (the film stays as it is)
  if (p.link && !p.shot) { const s = panelShot(p); p.shot = JSON.parse(JSON.stringify(s)); p.shot.id = ++shotSeq; p.f = p.link.f; p.link = null; toast(tr('Esta viñeta tiene ahora su propia escena: los cambios en la película ya no la cambian.')); }
  CM.edit = {p, bench}; $('#pageView').hidden = true; document.body.classList.remove('paging'); document.body.classList.add('panelEdit');
  await stagePanel(p);
  RATIOS._panel = ['Viñeta', p.w / p.h]; state.ratio = '_panel'; applyFrameAspect(p.w / p.h);
  ANIM.focus = null;  // (the stage is free to pose: the panel's shot is written back on leaving)
  $('#cmEditBar').hidden = false; $('#cmEditBar .t').textContent = tr('Viñeta {n} · página {p}: posa, ilumina y encuadra; luego «Volver a la página».', {n: readingOrder(curPage()).indexOf(p) + 1, p: CM.page + 1});
  showTab('pose');
}
// what was done on the stage goes into the panel; the canvas gets its own picture back
async function finishPanelEdit(cancel) {
  const E = CM.edit; if (!E) return; CM.edit = null;
  if (!cancel) {
    const s = E.p.shot; s.scene = captureScene(); s.len = Math.max(1, s.len); s.keys = chars.map(m => [{f: 0, pose: basePose(m)}]); s.cam = [{f: 0, c: camState()}]; s.scene.cam = camState(); E.p.f = 0; delete E.p.cam; touchShot(s);
  }
  $('#cmEditBar').hidden = true; document.body.classList.remove('panelEdit');
  await benchRestore(E.bench); comicSaved();
  if (state.tab === 'comic') showPage(true);
}

/* ---------- from the film: a page of panels from its shots ---------- */
// each shot of the film a panel (linked: the film changes, the panel follows), at its most telling key pose
async function filmToComic(o = {}) {
  if (!ANIM.shots.length) { toast(tr('Primero haz una película (Animación › Guion) o abre una.')); return 0; }
  const c = comic(), per = o.per || 6, tplFor = n => n >= 6 ? 'p6' : n === 5 ? 'p5' : n === 4 ? 'p4' : n === 3 ? 'p3' : n === 2 ? 'p2' : 'p1';
  // (a page with nothing in it yet makes way)
  for (let i = c.pages.length - 1; i >= 0; i--) if (c.pages[i].panels.every(p => !panelShot(p) && !p.balloons.length)) c.pages.splice(i, 1);
  const bench = benchSave(); let made = 0;
  try {
    // the shots in pages: by the script's scenes (a comic script's PAGE), or six a page
    const groups = []; if (o.byScene) { let cur = null, key = null; for (const s of ANIM.shots) { const k = (s.name.match(/^(\d+)/) || [0, ''])[1]; if (k !== key || cur.length >= 9) { cur = []; groups.push(cur); key = k; } cur.push(s); } }
    else for (let i = 0; i < ANIM.shots.length; i += per) groups.push(ANIM.shots.slice(i, i + per));
    for (const group of groups) {
      const pg = addPage(group.length > 6 ? 'p6' : tplFor(group.length)), slots = readingOrder(pg, c);
      if (group.length > 6) { pg.panels = layoutGrid(group.length, c); }
      const order = readingOrder(pg, c);
      for (const [j, s] of group.entries()) {
        const p = order[j]; if (!p) break; void slots;
        ANIM.focus = s; await stageShot(s, null);
        const keys = shotKeyPoses(s, false), mid = keys.length > 2 ? keys[Math.floor(keys.length / 2)].f : Math.floor(s.len / 2);
        p.link = {shotId: s.id, f: mid};
        // where the speakers' heads will be in the panel: each balloon goes above its speaker, in reading order
        await stagePanel(p); const anchors = panelAnchors(p.w / p.h);
        // the panel's camera: the shot's, turned to the panel's shape (the same lens, the same aim)
        // balloons from the lines said in the shot, in order, each one by its speaker
        const L = s.lines.filter(l => l.text && l.text.trim()).slice(0, 3);
        L.forEach((l, n) => { const a = anchors[l.c], x = a ? clamp(a.x + (a.x > .5 ? -.12 : .12), .18, .82) : (c.rtl ? .78 - n * .3 : .22 + n * .3), y = a ? clamp(Math.min(a.top, a.y) - .16 - n * .04, .1, .4) : .16 + n * .1;
          p.balloons.push({id: newId('b'), kind: /!\s*$/.test(l.text.trim()) && (/[A-ZÁÉÍÓÚÑ]{3,}/.test(l.text) || /^¡/.test(l.text.trim())) ? 'shout' : 'speech', text: l.text.trim(), ci: l.c, x, y, size: 9}); });
        made++;
      }
    }
  } finally { await benchRestore(bench); }
  CM.page = 0; comicChanged(); comicSaved();
  return made;
}

/* ---------- export ---------- */
async function exportComicPages(which = 'page', dpi = 300) {
  const c = comic(), list = which === 'all' ? c.pages : [curPage()].filter(Boolean); if (!list.length) return;
  toast(tr('Preparando {n} página(s) a {d} ppp…', {n: list.length, d: dpi}));
  const files = {}; let first = null;
  for (const [i, pg] of list.entries()) { const cv = await pageImage(pg, dpi); first = first || cv; const b = await new Promise(r => cv.toBlob(r, 'image/png')); files[`${tr('pagina')}-${String(c.pages.indexOf(pg) + 1).padStart(3, '0')}.png`] = new Uint8Array(await b.arrayBuffer()); void i; }
  const names = Object.keys(files);
  if (names.length === 1) saveFile(`${tr('comic')}-${stamp()}-${names[0]}`, files[names[0]], 'image/png');
  else saveFile(`${tr('comic')}-${stamp()}.zip`, fflate.zipSync(files, {level: 0}), 'application/zip');
  drawPage();
  return first;
}

/* ---------- the Cómic tab ---------- */
function syncComicUI() {
  const box = $('section[data-tab=comic]'); if (!box || !PROJECT.comic) return; const c = comic(), p = CM.sel, b = CM.selB;
  CM.page = clamp(CM.page, 0, Math.max(0, c.pages.length - 1));
  setPressed($('#cmFormat'), c.format); $('#cmRtl').checked = !!c.rtl; $('#cmTone').checked = !!c.look.tone; $('#cmSet').checked = !!c.look.set;
  const pages = $('#cmPages'); pages.innerHTML = '';
  c.pages.forEach((pg, i) => { const btn = document.createElement('button'); btn.className = 'chip'; btn.textContent = String(i + 1); btn.setAttribute('aria-pressed', String(i === CM.page)); btn.onclick = () => { CM.page = i; CM.sel = CM.selB = null; drawPage(); syncComicUI(); }; pages.appendChild(btn); });
  $('#cmPanelBox').hidden = !p; $('#cmBalloonBox').hidden = !p; $('#cmNoPanel').hidden = !!p;
  if (p) {
    const s = panelShot(p); $('#cmPanelInfo').textContent = !s ? tr('Vacía: «Poner lo del lienzo» o «Editar en 3D».') : p.link ? tr('Enlazada a «{s}» de la película (fotograma {f}): si cambias la película, cambia la viñeta.', {s: s.name, f: p.link.f + 1}) : tr('Tiene su propia escena.');
    const who = $('#cmWho'); who.innerHTML = ''; const cast = s ? s.scene.chars : [];
    chips(who, [['', tr('Nadie (cartela)')], ...cast.map((x, i) => [String(i), `${i + 1} · ${x.body.name || tr('Personaje')}`])], b && b.ci != null ? String(b.ci) : '', v => { if (!CM.selB) return; CM.selB.ci = v === '' ? null : +v; drawPage(); comicSaved(); });
  }
  $('#cmBalloonEdit').hidden = !b;
  if (typeof syncComicExtraUI === 'function') syncComicExtraUI();
  if (b) { setPressed($('#cmKind'), b.kind); if (document.activeElement !== $('#cmText')) $('#cmText').value = b.text || ''; $('#cmSize').value = b.size || 9; }
}
function buildComicUI() {
  initPageView();
  const sec = $('section[data-tab=comic]'); if (!sec) return;
  chips($('#cmFormat'), Object.entries(COMIC_FORMATS).map(([k, v]) => [k, v.label]), (PROJECT.comic || {format: 'manga'}).format, k => {
    const c = comic(), F = COMIC_FORMATS[k], sx = F.w / c.page.w, sy = F.h / c.page.h;
    for (const pg of c.pages) for (const p of pg.panels) { p.x *= sx; p.w *= sx; p.y *= sy; p.h *= sy; }  // (the panels keep their places, scaled)
    Object.assign(c, {format: k}); Object.assign(c.page, {w: F.w, h: F.h, margin: [...F.margin], gutter: [...F.gutter]}); CM.cache.clear(); comicChanged(); comicSaved();
  });
  $('#cmRtl').onchange = e => { const c = comic(); c.rtl = e.target.checked; for (const pg of c.pages) for (const p of pg.panels) p.x = c.page.w - (p.x + p.w); comicChanged(); comicSaved(); };
  $('#cmTone').onchange = e => { comic().look.tone = e.target.checked; CM.cache.clear(); comicChanged(); comicSaved(); };
  $('#cmSet').onchange = e => { comic().look.set = e.target.checked; CM.cache.clear(); comicChanged(); comicSaved(); };
  chips($('#cmTemplates'), Object.entries(PANEL_TEMPLATES).map(([k, v]) => [k, v.label]), null, k => { addPage(k); drawPage(); comicSaved(); });
  $('#cmDelPage').onclick = () => { const c = comic(); if (!c.pages.length) return; c.pages.splice(CM.page, 1); CM.page = Math.max(0, CM.page - 1); CM.sel = CM.selB = null; if (!c.pages.length) addPage('p4'); comicChanged(); comicSaved(); };
  $('#cmFromStage').onclick = () => { const p = CM.sel; if (!p) return; const bench = benchSave(); p.shot = shotFromStage(); p.link = null; p.f = 0; void bench; comicChanged(); comicSaved(); };
  $('#cmEdit').onclick = () => CM.sel && editPanel(CM.sel);
  $('#cmClearPanel').onclick = () => { const p = CM.sel; if (!p) return; p.shot = null; p.link = null; p.balloons = []; comicChanged(); comicSaved(); };
  chips($('#cmKind'), Object.entries(BALLOON_KINDS), 'speech', k => { if (CM.selB) { CM.selB.kind = k; drawPage(); comicSaved(); } });
  $('#cmAddB').onclick = () => { const p = CM.sel; if (!p) return; const s = panelShot(p), b = {id: newId('b'), kind: 'speech', text: tr('…'), ci: s && s.scene.chars.length ? 0 : null, x: comic().rtl ? .75 : .25, y: .18 + p.balloons.length * .12, size: 9};
    p.balloons.push(b); CM.selB = b; drawPage(); syncComicUI(); comicSaved(); const t = $('#cmText'); t.focus(); t.select(); };
  $('#cmDelB').onclick = () => { const p = CM.sel, b = CM.selB; if (!p || !b) return; p.balloons.splice(p.balloons.indexOf(b), 1); CM.selB = null; drawPage(); syncComicUI(); comicSaved(); };
  $('#cmText').oninput = e => { if (CM.selB) { CM.selB.text = e.target.value; drawPage(); } }; $('#cmText').onchange = comicSaved;
  $('#cmSize').oninput = e => { if (CM.selB) { CM.selB.size = +e.target.value; drawPage(); } };
  $('#cmFromScript').onclick = () => { SC.target = 'both'; store.set('cdp.scTarget', 'both'); openScript(); setPressed($('#scTarget'), 'both'); };
  $('#cmFromFilm').onclick = async () => { const n = await filmToComic(); if (n) toast(tr('{n} viñetas hechas desde la película, enlazadas a sus planos.', {n})); };
  $('#cmExport').onclick = () => exportComicPages('page', +$('#cmDpi').value || 300);
  $('#cmExportAll').onclick = () => exportComicPages('all', +$('#cmDpi').value || 300);
  $('#cmBack').onclick = () => { finishPanelEdit(); goTab('comic'); };
  $('#cmCancel').onclick = () => { finishPanelEdit(true); goTab('comic'); };
  buildComicExtraUI(); syncComicUI();
}
