/* ======================= the page, on screen =======================
   The Cómic tab turns Estático's canvas into the page (the desk: 36e; its pages and script: 36f), its panels drawn
   from their shots, the balloons on top. A panel's «Editar escena» (or a double click) opens the panel on the stage: the canvas shows that shot, framed exactly as the panel (the guide is the
   panel's shape), posed, lit and dressed with all of Estático's tabs; going back to Cómic keeps what was done in the
   panel and gives the canvas back as it was. */
function showPage(on) {
  const el = $('#pageView'); if (!el) return;
  if (on && CM.edit) { finishPanelEdit(); return; }  // (it shows the page when done)
  el.hidden = !on; document.body.classList.toggle('paging', on);
  // (the top bar acts on the page while it is shown: Exportar takes the pages out; the sketch is drawn over the figure, not the page)
  $('#exportBtn').title = tr(on ? 'Exportar las páginas del cómic (Ctrl+E)' : 'Exportar imagen, 3D o animación (Ctrl+E)'); if (on && sk.on) setSketch(false);
  if (on) { if (!comic().pages.length) addPage('p4'); if (CMH.i < 0) histReset(); renderTracker(); renderScript(true); syncPageUI(); syncDeskTools(); drawPage(); }
}
// every change of the pages: saved soon, kept for undo, shown in the row of pages
const comicSaved = () => { if (typeof autosaveSoon === 'function') autosaveSoon(); histSoon(); trackerSoon(); };

/* ---------- a panel on the stage ---------- */
// open a panel in 3D: the canvas becomes it (an empty panel starts from what the canvas shows)
async function editPanel(p) {
  if (CM.edit) await finishPanelEdit();
  const bench = benchSave();
  // (what the panel showed, for «Descartar» to give it back as it was: its film link, or nothing at all)
  const was = {}; for (const k of ['shot', 'link', 'f', 'cam']) was[k] = p[k] === undefined ? undefined : JSON.parse(JSON.stringify(p[k]));
  if (!panelShot(p)) p.shot = shotFromStage();
  // a linked panel is edited as its own copy (the film stays as it is)
  if (p.link && !p.shot) { const s = panelShot(p); p.shot = JSON.parse(JSON.stringify(s)); p.shot.id = ++shotSeq; p.f = p.link.f; p.link = null; toast(tr('Esta viñeta tiene ahora su propia escena: los cambios en la película ya no la cambian («Descartar» la deja como estaba).')); }
  CM.edit = {p, bench, was}; $('#pageView').hidden = true; document.body.classList.remove('paging'); document.body.classList.add('panelEdit');
  await stagePanel(p);
  const B = panelBox(p); RATIOS._panel = ['Viñeta', B.w / B.h]; state.ratio = '_panel'; applyFrameAspect(B.w / B.h);
  ANIM.focus = null;  // (the stage is free to pose: the panel's shot is written back on leaving)
  $('#cmEditBar').hidden = false; $('#cmEditBar .t').textContent = tr('Viñeta {n} · página {p}: posa, ilumina y encuadra; luego «Volver a la página».', {n: readingOrder(curPage()).indexOf(p) + 1, p: CM.page + 1});
  showTab('pose');
}
// what was done on the stage goes into the panel; the canvas gets its own picture back
async function finishPanelEdit(cancel) {
  const E = CM.edit; if (!E) return; CM.edit = null;
  if (!cancel) {
    const s = E.p.shot; s.scene = captureScene(); s.len = Math.max(1, s.len); s.keys = chars.map(m => [{f: 0, pose: basePose(m)}]); s.cam = [{f: 0, c: camState()}]; s.scene.cam = camState(); E.p.f = 0; delete E.p.cam; touchShot(s);
  } else for (const k of ['shot', 'link', 'f', 'cam']) { if (E.was[k] === undefined) delete E.p[k]; else E.p[k] = E.was[k]; }  // («Descartar»: the panel as it was)
  $('#cmEditBar').hidden = true; document.body.classList.remove('panelEdit');
  await benchRestore(E.bench); comicSaved();
  if (state.tab === 'comic') { showPage(true); deskReturn(E.p); }
}

/* ---------- from the film: a page of panels from its shots ---------- */
// each shot of the film a panel (linked: the film changes, the panel follows), at its most telling key pose
async function filmToComic(o = {}) {
  if (!ANIM.shots.length) { toast(tr('Primero haz una película (Animación › Guion) o abre una.')); return 0; }
  const c = comic(), per = o.per || 6, tplFor = n => n >= 6 ? 'p6' : n === 5 ? 'p5' : n === 4 ? 'p4' : n === 3 ? 'p3' : n === 2 ? 'p2' : 'p1';
  histCommit();  // (what was there before is kept, for Deshacer to go back to)
  // (a page with nothing in it yet makes way)
  for (let i = c.pages.length - 1; i >= 0; i--) if (c.pages[i].panels.every(p => !panelShot(p) && !p.balloons.length)) c.pages.splice(i, 1);
  // (the new pages go after the ones there are: the first of them is shown)
  const start = c.pages.length, had = c.pages.some(pg => pg.panels.some(p => p.link));
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
        p.link = {shotId: s.id, f: mid}; if (s.note) p.note = s.note;
        // where the speakers' heads will be in the panel: each balloon goes above its speaker, in reading order
        await stagePanel(p); const B = panelBox(p), anchors = panelAnchors(B.w / B.h);
        // the panel's camera: the shot's, turned to the panel's shape (the same lens, the same aim)
        // balloons from the lines said in the shot, in order, each one by its speaker
        const L = s.lines.filter(l => l.text && l.text.trim()).slice(0, 3);
        L.forEach((l, n) => { const a = anchors[l.c], x = a ? clamp(a.x + (a.x > .5 ? -.12 : .12), .18, .82) : (c.rtl ? .78 - n * .3 : .22 + n * .3), y = a ? clamp(Math.min(a.top, a.y) - .16 - n * .04, .1, .4) : .16 + n * .1;
          p.balloons.push({id: newId('b'), kind: /!\s*$/.test(l.text.trim()) && (/[A-ZÁÉÍÓÚÑ]{3,}/.test(l.text) || /^¡/.test(l.text.trim())) ? 'shout' : 'speech', text: l.text.trim(), ci: l.c, x, y, size: 9}); });
        made++;
      }
    }
  } finally { await benchRestore(bench); }
  CM.page = start; comicChanged(); comicSaved();
  if (made) toast(had ? trn(c.pages.length - start, 'Página {a} añadida al final; las anteriores siguen ahí.', 'Páginas {a}–{b} añadidas al final; las anteriores siguen ahí.', {a: start + 1, b: c.pages.length}) : tr('{n} viñetas hechas desde la película, enlazadas a sus planos.', {n: made}), {undo: () => comicUndo(-1)});
  return made;
}

/* ---------- export ---------- */
// (quiet: the export section says it is under way and shows the progress)
async function exportComicPages(which = 'page', dpi = 300, quiet) {
  const c = comic(), list = which === 'all' ? c.pages : [curPage()].filter(Boolean); if (!list.length) return;
  if (!quiet) toast(tr('Preparando {n} página(s) a {d} ppp…', {n: list.length, d: dpi}));
  const files = {}; let first = null;
  for (const [i, pg] of list.entries()) { const cv = await pageImage(pg, dpi); first = first || cv; const b = await new Promise(r => cv.toBlob(r, 'image/png')); files[`${tr('pagina')}-${String(c.pages.indexOf(pg) + 1).padStart(3, '0')}.png`] = new Uint8Array(await b.arrayBuffer()); exportProgress((i + 1) / list.length); }
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
  syncPageUI();
  $('#cmFmtNow').textContent = tr(c.rtl ? '{f} · se lee de derecha a izquierda' : '{f} · se lee de izquierda a derecha', {f: COMIC_FORMATS[c.format] ? COMIC_FORMATS[c.format].label : c.format});
  $('#cmPanelBox').hidden = !p; $('#cmBalloonBox').hidden = !p; $('#cmNoPanel').hidden = !!p; $('#cmNoBalloon').hidden = !!p;
  if (p) {
    const s = panelShot(p); $('#cmEdit').textContent = tr(s ? 'Editar escena' : 'Montar escena');
    $('#cmPanelInfo').textContent = !s ? tr('Vacía: «Montar escena» la abre en 3D para posarla; «Copiar la escena 3D» pone en ella lo que hay ahora en el lienzo.') : p.link ? tr('Enlazada a «{s}» de la película (fotograma {f}): si cambias la película, cambia la viñeta. Si editas su escena, se separa de la película.', {s: s.name, f: p.link.f + 1}) : tr('Tiene su propia escena.');
    const who = $('#cmWho'); who.innerHTML = ''; const cast = s ? s.scene.chars : [];
    chips(who, [['', tr('Nadie (cartela)')], ...cast.map((x, i) => [String(i), `${i + 1} · ${x.body.name || tr('Personaje')}`])], b && b.ci != null ? String(b.ci) : '', v => { if (!CM.selB) return; CM.selB.ci = v === '' ? null : +v; drawPage(); comicSaved(); });
  }
  $('#cmBalloonEdit').hidden = !b;
  if (typeof syncComicExtraUI === 'function') syncComicExtraUI(); if (typeof syncComicShapeUI === 'function') syncComicShapeUI();
  if (b) { setPressed($('#cmKind'), b.kind); if (document.activeElement !== $('#cmText')) $('#cmText').value = b.text || ''; $('#cmSize').value = b.size || 9; }
}
function buildComicUI() {
  initPageView();
  const sec = $('section[data-tab=comic]'); if (!sec) return;
  chips($('#cmFormat'), Object.entries(COMIC_FORMATS).map(([k, v]) => [k, v.label]), (PROJECT.comic || {format: 'manga'}).format, k => {
    const c = comic(), F = COMIC_FORMATS[k], sx = F.w / c.page.w, sy = F.h / c.page.h;
    for (const pg of c.pages) for (const p of pg.panels) { p.x *= sx; p.w *= sx; p.y *= sy; p.h *= sy; if (p.poly) p.poly = p.poly.map(([x, y]) => [x * sx, y * sy]); }  // (the panels keep their places, scaled)
    Object.assign(c, {format: k}); Object.assign(c.page, {w: F.w, h: F.h, margin: [...F.margin], gutter: [...F.gutter]}); CM.cache.clear(); comicChanged(); comicSaved();
  });
  $('#cmRtl').onchange = e => { const c = comic(); c.rtl = e.target.checked; for (const pg of c.pages) for (const p of pg.panels) { p.x = c.page.w - (p.x + p.w); if (p.poly) p.poly = p.poly.map(([x, y]) => [c.page.w - x, y]).reverse(); } CM.cache.clear(); comicChanged(); comicSaved(); };
  $('#cmTone').onchange = e => { comic().look.tone = e.target.checked; CM.cache.clear(); comicChanged(); comicSaved(); };
  $('#cmSet').onchange = e => { comic().look.set = e.target.checked; CM.cache.clear(); comicChanged(); comicSaved(); };
  $('#cmDelPage').onclick = () => curPage() && deletePage(curPage());
  $('#cmFromStage').onclick = () => { const p = CM.sel; if (!p) return; const bench = benchSave(); p.shot = shotFromStage(); p.link = null; p.f = 0; void bench; comicChanged(); comicSaved(); };
  $('#cmEdit').onclick = () => CM.sel && openPanelScene(CM.sel);
  $('#cmClearPanel').onclick = () => { const p = CM.sel; if (!p || !(p.shot || p.link || p.balloons.length)) return; p.shot = null; p.link = null; p.balloons = []; comicChanged(); comicSaved(); toast(tr('Viñeta vaciada.'), {undo: () => comicUndo(-1)}); };
  chips($('#cmKind'), Object.entries(BALLOON_KINDS), 'speech', k => { if (CM.selB) { CM.selB.kind = k; drawPage(); comicSaved(); } });
  $('#cmAddB').onclick = () => { const p = CM.sel; if (!p) return; const s = panelShot(p), b = {id: newId('b'), kind: 'speech', text: tr('…'), ci: s && s.scene.chars.length ? 0 : null, x: comic().rtl ? .75 : .25, y: .18 + p.balloons.length * .12, size: 9};
    p.balloons.push(b); CM.selB = b; drawPage(); syncComicUI(); comicSaved(); const t = $('#cmText'); t.focus(); t.select(); };
  $('#cmDelB').onclick = () => { const p = CM.sel, b = CM.selB; if (!p || !b) return; removeBalloon(p, b); CM.selB = null; drawPage(); syncComicUI(); comicSaved(); };
  $('#cmText').oninput = e => { if (CM.selB) { CM.selB.text = e.target.value; drawPage(); renderScript(); } }; $('#cmText').onchange = comicSaved;
  $('#cmSize').oninput = e => { if (CM.selB) { CM.selB.size = +e.target.value; drawPage(); } };
  $('#cmFromScript').onclick = () => { SC.target = 'both'; store.set('cdp.scTarget', 'both'); openScript(); setPressed($('#scTarget'), 'both'); };
  $('#cmFromFilm').onclick = () => filmToComic();
  $('#cmExport').onclick = () => exportComic('png'); $('#cmExportAll').onclick = () => exportComic('zip');
  $('#cmBack').onclick = () => { finishPanelEdit(); goTab('comic'); };
  $('#cmCancel').onclick = () => { finishPanelEdit(true); goTab('comic'); };
  buildComicExtraUI(); buildComicShapeUI(); syncComicUI();
}
