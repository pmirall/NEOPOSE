/* ======================= the comic: sounds, effects and print =======================
   Sounds written on the page (onomatopoeia), the backgrounds of manga per panel (speed lines, focus lines, a flash,
   black), and the pages out of the app: a PDF to print or send (each page an image at its true size), a CBZ for
   comic readers, or a PSD per page in layers (paper, panels, balloons, sounds, borders and an empty one to ink on). */
const PANEL_BGS = [['set', 'Escenario'], ['white', 'Blanco'], ['speed', 'Líneas de velocidad'], ['focus', 'Líneas de concentración'], ['flash', 'Destello'], ['black', 'Negro']];

/* ---------- PDF: one image per page, at its size in points ---------- */
async function comicPDF(dpi = 300) {
  const c = comic(), enc = new TextEncoder(), parts = [], offs = []; let len = 0;
  const put = b => { const u = typeof b === 'string' ? enc.encode(b) : b; parts.push(u); len += u.length; };
  const obj = (n, body) => { offs[n] = len; put(`${n} 0 obj\n`); for (const b of [].concat(body)) put(b); put('\nendobj\n'); };
  put('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'.replace(/[\u0080-ÿ]/g, ch => ch));  // (a binary comment marks the file as binary)
  const N = c.pages.length, kids = [], wPt = c.page.w / 25.4 * 72, hPt = c.page.h / 25.4 * 72;
  // objects: 1 catalog, 2 pages, then per page: page, contents, image
  for (let i = 0; i < N; i++) kids.push(3 + i * 3);
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${N} >>`);
  for (let i = 0; i < N; i++) {
    const cv = await pageImage(c.pages[i], dpi), jpg = new Uint8Array(await (await new Promise(r => cv.toBlob(r, 'image/jpeg', .92))).arrayBuffer());
    const p = 3 + i * 3, content = `q ${wPt.toFixed(2)} 0 0 ${hPt.toFixed(2)} 0 0 cm /Im${i} Do Q`;
    obj(p, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${wPt.toFixed(2)} ${hPt.toFixed(2)}] /Resources << /XObject << /Im${i} ${p + 2} 0 R >> >> /Contents ${p + 1} 0 R >>`);
    obj(p + 1, [`<< /Length ${content.length} >>\nstream\n`, content, '\nendstream']);
    obj(p + 2, [`<< /Type /XObject /Subtype /Image /Width ${cv.width} /Height ${cv.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`, jpg, '\nendstream']);
    exportProgress((i + 1) / N);
  }
  const xref = len, n = 3 + N * 3;
  put(`xref\n0 ${n}\n0000000000 65535 f \n`); for (let i = 1; i < n; i++) put(String(offs[i]).padStart(10, '0') + ' 00000 n \n');
  put(`trailer\n<< /Size ${n} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(len); let o = 0; for (const b of parts) { out.set(b, o); o += b.length; }
  return out;
}
// CBZ: the pages in order as JPEG in a ZIP, with the reader's metadata (right to left for manga)
async function comicCBZ(dpi = 300) {
  const c = comic(), files = {};
  for (const [i, pg] of c.pages.entries()) { const cv = await pageImage(pg, dpi); files[`${String(i + 1).padStart(3, '0')}.jpg`] = new Uint8Array(await (await new Promise(r => cv.toBlob(r, 'image/jpeg', .92))).arrayBuffer()); exportProgress((i + 1) / c.pages.length); }
  files['ComicInfo.xml'] = new TextEncoder().encode(`<?xml version="1.0" encoding="utf-8"?>\n<ComicInfo><Title>${(c.title || 'NEOPOSE').replace(/[<&>]/g, '')}</Title><PageCount>${c.pages.length}</PageCount><Manga>${c.rtl ? 'YesAndRightToLeft' : 'No'}</Manga><Notes>NEOPOSE</Notes></ComicInfo>`);
  return fflate.zipSync(files, {level: 0});
}
// a page as a PSD in layers, for inking in Krita, Clip Studio or Photoshop
async function comicPSD(pg, dpi = 300) {
  const c = comic(), k = mmPx(1, dpi), w = Math.round(c.page.w * k), h = Math.round(c.page.h * k);
  await pageImage(pg, dpi);  // (draws the panels for this size)
  const layer = (name, part, o = {}) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'); if (part === 'paper') { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); } else if (part) composePage(g, pg, k, 0, 0, {part}); return {name, canvas: cv, ...o}; };
  return psdBytes(w, h, [layer(tr('Papel'), 'paper'), layer(tr('Viñetas'), 'panels'), layer(tr('Entintado'), null), layer(tr('Bordes'), 'borders'), layer(tr('Fuera de viñeta'), 'breakout'), layer(tr('Bocadillos'), 'balloons'), layer(tr('Onomatopeyas'), 'sfx')]);
}
const exportProgress = p => { const b = $('#cmProg'); if (b) { b.hidden = p >= 1; b.querySelector('i').style.width = Math.round(p * 100) + '%'; } };
async function exportComic(kind) {
  const c = comic(), dpi = +$('#cmDpi').value || 300; if (!c.pages.length) return;
  try {
    exportProgress(0); toast(tr('Preparando {n} página(s) a {d} ppp…', {n: kind === 'psd' ? 1 : c.pages.length, d: dpi}));
    if (kind === 'pdf') saveFile(`${tr('comic')}-${stamp()}.pdf`, await comicPDF(dpi), 'application/pdf');
    else if (kind === 'cbz') saveFile(`${tr('comic')}-${stamp()}.cbz`, await comicCBZ(dpi), 'application/vnd.comicbook+zip');
    else if (kind === 'psd') saveFile(`${tr('pagina')}-${CM.page + 1}-${stamp()}.psd`, await comicPSD(curPage(), dpi), 'image/vnd.adobe.photoshop');
  } catch (e) { console.warn('comic export', e); toast(tr('No se ha podido exportar: {e}', {e: e && e.message || e})); }
  exportProgress(1); drawPage();
}

/* ---------- the tab's extra controls ---------- */
function syncComicExtraUI() {
  const p = CM.sel, x = CM.selX; if (!$('#cmBg')) return;
  $('#cmBgRow').hidden = !p; if (p) setPressed($('#cmBg'), p.bg || 'set');
  $('#cmSfxEdit').hidden = !x; if (x) { if (document.activeElement !== $('#cmSfxText')) $('#cmSfxText').value = x.text; $('#cmSfxSize').value = x.size; $('#cmSfxRot').value = x.rot || 0; }
}
function buildComicExtraUI() {
  if (!$('#cmBg')) return;
  chips($('#cmBg'), PANEL_BGS, 'set', v => { const p = CM.sel; if (!p) return; p.bg = v === 'set' ? undefined : v; drawPage(); comicSaved(); });
  $('#cmSfxAdd').onclick = () => { const c = comic(), pg = curPage(); if (!pg) return; pg.sfx = pg.sfx || []; const p = CM.sel, x = {id: newId('s'), text: ($('#cmSfxNew').value || '').trim() || tr('¡BAM!'), x: p ? panelBox(p).x + panelBox(p).w * .6 : c.page.w / 2, y: p ? panelBox(p).y + panelBox(p).h * .35 : c.page.h / 3, size: 16, rot: -8};
    pg.sfx.push(x); CM.selX = x; drawPage(); syncComicUI(); comicSaved(); };
  $('#cmSfxText').oninput = e => { if (CM.selX) { CM.selX.text = e.target.value; drawPage(); } }; $('#cmSfxText').onchange = comicSaved;
  $('#cmSfxSize').oninput = e => { if (CM.selX) { CM.selX.size = +e.target.value; drawPage(); } };
  $('#cmSfxRot').oninput = e => { if (CM.selX) { CM.selX.rot = +e.target.value; drawPage(); } };
  $('#cmSfxDel').onclick = () => { const pg = curPage(), x = CM.selX; if (!pg || !x) return; pg.sfx.splice(pg.sfx.indexOf(x), 1); CM.selX = null; drawPage(); syncComicUI(); comicSaved(); };
  $('#cmPdf').onclick = () => exportComic('pdf'); $('#cmCbz').onclick = () => exportComic('cbz'); $('#cmPsd').onclick = () => exportComic('psd');
}
