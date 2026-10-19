/* ======================= comic and manga pages =======================
   Estático's second surface: pages of panels with balloons, drawn from the same stage as everything else. A panel IS
   a shot seen at one frame — its own (a pose, a camera, a set: what was on the canvas when it was made, editable in
   3D) or one of the film's, linked (the film changes, the panel follows). So the poses, faces, cameras, lights, sets,
   clothes and the engine that turns a script into a film all serve the comic too. Panels are drawn in the key
   drawings' line (21d-keys: black ink on white), with screentone (the Trama style) under it if asked.
   Everything is measured in millimetres on the page (print-true: trim, bleed, margins, gutters); pixels only when
   drawing (on screen, or at 300/600 dpi for export).
     comic   {v, format, rtl, page: {w, h, bleed, margin: [t, r, b, l], gutter: [x, y]}, look: {tone, set, line}, pages}
     page    {id, panels: [panel]}
     panel   {id, x, y, w, h (mm), shot | link: {shotId, f}, f, cam?, balloons: [balloon]}
     balloon {id, kind: speech|thought|shout|whisper|caption, text, ci (who speaks: a character of the panel's shot),
              x, y (its centre, 0..1 of the panel), size (pt)} */
const COMIC_FORMATS = {
  manga: {label: 'Manga (B5)', w: 182, h: 257, margin: [20, 16, 20, 16], gutter: [3, 6], rtl: true},
  comic: {label: 'Cómic americano', w: 168, h: 260, margin: [13, 13, 16, 13], gutter: [4, 4]},
  album: {label: 'Álbum europeo', w: 240, h: 320, margin: [16, 14, 20, 14], gutter: [4, 5]},
  a4: {label: 'A4', w: 210, h: 297, margin: [15, 15, 15, 15], gutter: [5, 5]},
  tira: {label: 'Tira', w: 300, h: 100, margin: [6, 6, 6, 6], gutter: [4, 4]}
};
tLabels(COMIC_FORMATS);
// page layouts: rows (their height share) of panels (their width share)
const PANEL_TEMPLATES = {
  p1: {label: '1', rows: [[1, [1]]]},
  p2: {label: '2', rows: [[1, [1]], [1, [1]]]},
  p3: {label: '3', rows: [[1.3, [1]], [1, [1, 1]]]},
  p4: {label: '4', rows: [[1, [1, 1]], [1, [1, 1]]]},
  p5: {label: '5', rows: [[1.2, [1]], [1, [1, 1.4]], [1, [1.4, 1]]]},
  p6: {label: '6', rows: [[1, [1, 1]], [1, [1, 1]], [1, [1, 1]]]},
  koma4: {label: '4 koma', rows: [[1, [1]], [1, [1]], [1, [1]], [1, [1]]]},
  tira3: {label: '3 en tira', rows: [[1, [1, 1, 1]]]}
};
const BALLOON_KINDS = {speech: 'Habla', thought: 'Pensamiento', shout: 'Grito', whisper: 'Susurro', caption: 'Cartela'};
tValues(BALLOON_KINDS);
const CM = {sel: null, selB: null, page: 0, edit: null, cache: new Map(), view: null, busy: false, queue: Promise.resolve()};
const mmPx = (mm, dpi) => mm / 25.4 * dpi;

/* ---------- the model ---------- */
function newComic(fmt = 'manga') {
  const F = COMIC_FORMATS[fmt] || COMIC_FORMATS.manga;
  return {v: 1, format: fmt, rtl: !!F.rtl, page: {w: F.w, h: F.h, bleed: 3, margin: [...F.margin], gutter: [...F.gutter]}, look: {tone: false, set: true, line: 1}, pages: []};
}
const comic = () => PROJECT.comic || (PROJECT.comic = newComic());
const curPage = () => comic().pages[CM.page];
// the panels of a template laid in the page's live area (right to left when the comic reads that way)
function layoutPanels(tpl, c = comic()) {
  const T = PANEL_TEMPLATES[tpl] || PANEL_TEMPLATES.p4, P = c.page, [mt, mr, mb, ml] = P.margin, [gx, gy] = P.gutter;
  const W = P.w - ml - mr, H = P.h - mt - mb, hs = T.rows.reduce((a, r) => a + r[0], 0), out = [];
  let y = mt;
  T.rows.forEach(([rh, cols]) => {
    const h = (H - gy * (T.rows.length - 1)) * rh / hs, ws = cols.reduce((a, x) => a + x, 0); let x = ml;
    const row = cols.map(cw => { const w = (W - gx * (cols.length - 1)) * cw / ws, r = {x, y, w, h}; x += w + gx; return r; });
    if (c.rtl) row.forEach(r => { r.x = P.w - (r.x + r.w); });  // (mirrored: the first panel at the right)
    out.push(...row);
    y += h + gy;
  });
  return out.map(r => ({id: newId('p'), x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.w.toFixed(2), h: +r.h.toFixed(2), shot: null, link: null, f: 0, balloons: []}));
}
// reading order: top to bottom, then left to right (right to left in manga)
function readingOrder(pg, c = comic()) {
  return [...pg.panels].sort((a, b) => Math.abs(a.y - b.y) > 4 ? a.y - b.y : (c.rtl ? b.x - a.x : a.x - b.x));
}
function addPage(tpl = 'p4') { const c = comic(), pg = {id: newId('pg'), panels: layoutPanels(tpl, c)}; c.pages.push(pg); CM.page = c.pages.length - 1; CM.sel = null; comicChanged(); return pg; }
// what a panel shows: its own shot, or the film's one it is linked to
function panelShot(p) { if (p.shot) return p.shot; if (p.link) return ANIM.shots.find(s => s.id === p.link.shotId) || null; return null; }
const panelFrame = p => p.link ? p.link.f : p.f || 0;
// the canvas as it is (pose, camera, set, clothes) as a one-frame shot: what a panel keeps
function shotFromStage() {
  const s = newShot(tr('Viñeta de cómic')); s.len = 1;
  s.keys = chars.map(m => [{f: 0, pose: basePose(m)}]); s.cam = [{f: 0, c: camState()}];
  s.scene.cam = camState(); return s;
}

/* ---------- drawing a panel (the stage lent for a moment, then given back) ---------- */
// the workbench (what Estático shows) kept while panels are put on stage
const benchSave = () => ({snap: {...snapshot(), ...sceneExtras(false)}, cam: camState(), focus: ANIM.focus, ratio: state.ratio, fa: state.frameAspect});
async function benchRestore(b) {
  ANIM.focus = b.focus; restore(b.snap); applyCam(b.cam); state.ratio = b.ratio; applyFrameAspect(b.fa);
  await (state.envReady || Promise.resolve()).catch(() => {});
}
// put a panel's shot on stage at its frame
async function stagePanel(p, prev) {
  const s = panelShot(p); if (!s) return false;
  ANIM.focus = s; await stageShot(s, prev || null);
  const f = Math.min(panelFrame(p), s.len - 1); applyFrame(f); if (p.cam) applyCam(p.cam);
  chars.forEach(m => m.group.updateMatrixWorld(true));
  return true;
}
// where each character's head is in the panel's picture (0..1): the balloons' tails point at it
function panelAnchors(aspect) {
  const cam = camera.clone(); cam.clearViewOffset(); cam.aspect = aspect; cam.setFocalLength(state.focal); cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
  return chars.map(m => { if (!m.group.visible) return null; const h = m.joints.head.getWorldPosition(new V3()), top = h.clone().add(new V3(0, m.headH * .55, 0)), mouth = h.clone().add(new V3(0, -m.headH * .15, 0));
    const P = v => { const q = v.clone().project(cam); return {x: (q.x + 1) / 2, y: (1 - q.y) / 2, z: q.z}; }; const a = P(mouth), b = P(top); return a.z < 1 ? {x: a.x, y: a.y, top: b.y} : null; });
}
// a panel drawn at w × h px: the key drawings' ink over white (the set faint, the screentone, if asked)
async function drawPanelOnStage(p, w, h) {
  const c = comic(), look = c.look, aspect = w / h;
  const ink = renderView({w, h, bg: 'lines'});
  let tone = null, set = null;
  if (look.tone) { const st = state.style, ur = LU.uRender.value; for (const m of chars) m.setStyle('trama'); LU.uRender.value = 3; tone = renderView({w, h, bg: 'alpha'}); for (const m of chars) m.setStyle(st); LU.uRender.value = ur; }
  if (look.set) { set = renderView({w, h, bg: 'paper'}); const g = set.getContext('2d'), id = g.getImageData(0, 0, w, h), d = id.data;
    for (let i = 0; i < d.length; i += 4) { const L = (d[i] * .299 + d[i + 1] * .587 + d[i + 2] * .114) / 255, v = Math.round(255 - (1 - L) * 255 * .22); d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; } g.putImageData(id, 0, 0); }
  const out = document.createElement('canvas'); out.width = w; out.height = h; const g = out.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); if (set) g.drawImage(set, 0, 0); if (tone) g.drawImage(tone, 0, 0);
  g.drawImage(recolor(ink, '#141210', 1), 0, 0);
  return {img: out, anchors: panelAnchors(aspect)};
}
const panelKey = (p, w, h) => { const s = panelShot(p), c = comic(); return [p.id, s ? s.id : '-', s ? s.rev || 0 : 0, panelFrame(p), w, h, JSON.stringify(p.cam || null), c.look.tone, c.look.set].join('|'); };
// several panels drawn in one go (the workbench put back once at the end); cached by what they show
function drawPanels(list, pxOf) {
  CM.queue = CM.queue.then(async () => {
    const todo = list.filter(p => panelShot(p) && !CM.cache.has(panelKey(p, ...pxOf(p)))); if (!todo.length || CM.edit) return;
    CM.busy = true; const bench = benchSave(); let prev = null;
    try {
      for (const p of todo) { const [w, h] = pxOf(p); if (!(await stagePanel(p, prev))) continue; prev = panelShot(p); const r = await drawPanelOnStage(p, w, h); CM.cache.set(panelKey(p, w, h), r); }
    } catch (e) { console.warn('comic panels', e); }
    finally { await benchRestore(bench); CM.busy = false; }
    drawPage();
  });
  return CM.queue;
}
function comicChanged() { if (typeof drawPage === 'function' && $('#pageView') && !$('#pageView').hidden) drawPage(); if (typeof syncComicUI === 'function') syncComicUI(); }

/* ---------- balloons ---------- */
// lines of text that fit a width
function wrapText(g, text, maxW) {
  const rows = []; for (const para of String(text || '').split('\n')) { let row = ''; for (const w of para.split(/\s+/).filter(Boolean)) { const t = row ? row + ' ' + w : w; if (row && g.measureText(t).width > maxW) { rows.push(row); row = w; } else row = t; } rows.push(row); }
  return rows;
}
const balloonFont = (px, b) => `${b.kind === 'shout' ? 700 : 600} ${px}px ${css('--f-hand')}, ${css('--f-body')}, sans-serif`;
// one balloon in a panel rectangle R (px): its body round the text, its tail to the speaker; k = px per mm
function drawBalloon(g, b, R, anchor, k, sel) {
  const fs = (b.size || 9) / 72 * 25.4 * k, pad = fs * .7; g.font = balloonFont(fs, b);
  const maxW = Math.min(R.w * .62, fs * 14), rows = wrapText(g, b.text || '…', maxW), tw = Math.max(fs * 2, ...rows.map(r => g.measureText(r).width)), th = rows.length * fs * 1.12;
  const cx = R.x + b.x * R.w, cy = R.y + b.y * R.h, cap = b.kind === 'caption';
  const rx = cap ? tw / 2 + pad : (tw / 2 + pad) * 1.18, ry = cap ? th / 2 + pad * .7 : (th / 2 + pad) * 1.18;
  g.save(); g.lineWidth = Math.max(1, k * .3); g.strokeStyle = '#141210'; g.fillStyle = '#fff'; g.lineJoin = 'round';
  // the tail first (its base under the body), to the speaker's mouth, stopping short of it
  if (!cap && anchor && b.kind !== 'thought') {
    const ax = R.x + anchor.x * R.w, ay = R.y + anchor.y * R.h, dx = ax - cx, dy = ay - cy, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    const tipD = Math.max(Math.min(d * .72, d - fs * 1.2), Math.min(rx, ry) * 1.1), tip = [cx + ux * tipD, cy + uy * tipD], wb = Math.min(rx, ry) * .32;
    g.beginPath(); g.moveTo(cx - uy * wb, cy + ux * wb); g.lineTo(tip[0], tip[1]); g.lineTo(cx + uy * wb, cy - ux * wb); g.closePath(); g.fill(); g.stroke();
  }
  g.beginPath();
  if (cap) g.rect(cx - rx, cy - ry, rx * 2, ry * 2);
  else if (b.kind === 'shout') { const n = 18; for (let i = 0; i <= n * 2; i++) { const a = i / (n * 2) * Math.PI * 2, r = i % 2 ? 1 : 1.24, j = 1 + .06 * Math.sin(i * 7.3); const x = cx + Math.cos(a) * rx * r * j, y = cy + Math.sin(a) * ry * r * j; i ? g.lineTo(x, y) : g.moveTo(x, y); } }
  else if (b.kind === 'thought') { const n = 11; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, x = cx + Math.cos(a) * rx * .92, y = cy + Math.sin(a) * ry * .92, r = Math.min(rx, ry) * .42; g.moveTo(x + r, y); g.arc(x, y, r, 0, Math.PI * 2); } }
  else g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  g.fill(); if (b.kind === 'whisper') g.setLineDash([fs * .35, fs * .3]); g.stroke(); g.setLineDash([]);
  if (b.kind === 'thought') { g.fill(); if (anchor) { const ax = R.x + anchor.x * R.w, ay = R.y + anchor.y * R.h; for (const [t, r] of [[.55, .16], [.75, .1]]) { g.beginPath(); g.arc(cx + (ax - cx) * t, cy + (ay - cy) * t, Math.min(rx, ry) * r, 0, Math.PI * 2); g.fill(); g.stroke(); } } }
  g.fillStyle = '#141210'; g.textAlign = 'center'; g.textBaseline = 'middle';
  rows.forEach((r, i) => g.fillText(r, cx, cy - th / 2 + fs * 1.12 * (i + .5)));
  if (sel) { g.strokeStyle = '#2b5a9e'; g.lineWidth = 2; g.setLineDash([5, 4]); g.strokeRect(cx - rx - 4, cy - ry - 4, rx * 2 + 8, ry * 2 + 8); g.setLineDash([]); }
  g.restore();
  return {x: cx - rx, y: cy - ry, w: rx * 2, h: ry * 2};
}

/* ---------- a page drawn: on screen, or for print ---------- */
// panels into a 2D context at k px per mm (offset ox, oy); cached panel pictures where there are, a note where not
function composePage(g, pg, k, ox, oy, o = {}) {
  const c = comic(), P = c.page; g.fillStyle = '#fff'; g.fillRect(ox, oy, P.w * k, P.h * k);
  const hits = [];
  for (const [i, p] of readingOrder(pg, c).entries()) {
    const R = {x: ox + p.x * k, y: oy + p.y * k, w: p.w * k, h: p.h * k}, w = Math.round(R.w * (o.px || 1)), h = Math.round(R.h * (o.px || 1)), hit = CM.cache.get(panelKey(p, w, h));
    g.save(); g.beginPath(); g.rect(R.x, R.y, R.w, R.h); g.clip();
    if (hit) g.drawImage(hit.img, R.x, R.y, R.w, R.h);
    else if (o.screen) { g.fillStyle = '#f4f1ea'; g.fillRect(R.x, R.y, R.w, R.h); g.fillStyle = '#8a8170'; const fs = Math.max(10, Math.min(k * 3.2, R.w / 9)); g.font = `600 ${fs}px ${css('--f-body')}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      const rows = wrapText(g, panelShot(p) ? tr('Dibujando…') : tr('Viñeta vacía: doble clic para montarla'), R.w * .82); rows.forEach((r, j) => g.fillText(r, R.x + R.w / 2, R.y + R.h / 2 + (j - (rows.length - 1) / 2) * fs * 1.25)); g.textBaseline = 'alphabetic'; }
    for (const b of p.balloons) { const box = drawBalloon(g, b, R, hit && b.ci != null ? hit.anchors[b.ci] : null, k, o.screen && CM.selB === b); hits.push({b, p, box}); }
    g.restore();
    g.lineWidth = Math.max(1, k * .5); g.strokeStyle = '#141210'; g.strokeRect(R.x, R.y, R.w, R.h);
    if (o.screen) { if (CM.sel === p) { g.strokeStyle = '#2b5a9e'; g.lineWidth = 3; g.strokeRect(R.x - 2, R.y - 2, R.w + 4, R.h + 4); }
      g.fillStyle = '#8a8170'; g.font = `600 ${Math.max(10, k * 2.4)}px ${css('--f-mono')}`; g.textAlign = 'left'; g.fillText(String(i + 1), R.x + 4, R.y + Math.max(12, k * 3)); }
  }
  return hits;
}
// the page at print size (dpi): the panels drawn for it first
async function pageImage(pg, dpi = 300) {
  const c = comic(), k = mmPx(1, dpi);
  await drawPanels(pg.panels, p => [Math.round(p.w * k), Math.round(p.h * k)]);
  const cv = document.createElement('canvas'); cv.width = Math.round(c.page.w * k); cv.height = Math.round(c.page.h * k);
  composePage(cv.getContext('2d'), pg, k, 0, 0, {});
  return cv;
}
