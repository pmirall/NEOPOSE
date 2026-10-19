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
     balloon {id, kind: speech|thought|shout|whisper|radio|wavy|black|caption|narration, text, ci (who speaks: a
              character of the panel's shot), x, y (its centre, 0..1 of the panel), size (pt)}
   (the shapes, slanted and split panels, borders, joined balloons: 36d-comic-shapes) */
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
  tira3: {label: '3 en tira', rows: [[1, [1, 1, 1]]]},
  // slanted: the gutters between rows tilt (tilt, mm per mm, turning each row), and those between panels (vtilt)
  s3: {label: '3 inclinadas', rows: [[1, [1]], [1, [1]], [1, [1]]], tilt: .1},
  s4: {label: '4 en acción', rows: [[1, [1.3, 1]], [1, [1, 1.3]]], tilt: .08, vtilt: .14},
  s5: {label: '5 en acción', rows: [[1.1, [1]], [1, [1, 1]], [1, [1, 1]]], tilt: .12, vtilt: .16},
  big: {label: 'Grande + 2', rows: [[2.2, [1]], [1, [1, 1]]], tilt: .06, vtilt: .1}
};
const BALLOON_KINDS = {speech: 'Habla', thought: 'Pensamiento', shout: 'Grito', whisper: 'Susurro', radio: 'Radio / teléfono', wavy: 'Tembloroso', black: 'Monstruo', caption: 'Cartela', narration: 'Narración'};
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
// the panels of a template laid in the page's live area (right to left when the comic reads that way): each the live
// area cut by the lines through its gutters (straight, or slanted when the template tilts them)
function layoutPanels(tpl, c = comic()) {
  const T = PANEL_TEMPLATES[tpl] || PANEL_TEMPLATES.p4, P = c.page, [mt, mr, mb, ml] = P.margin, [gx, gy] = P.gutter;
  const W = P.w - ml - mr, H = P.h - mt - mb, hs = T.rows.reduce((a, r) => a + r[0], 0), live = rectPts({x: ml, y: mt, w: W, h: H}), cxL = ml + W / 2, out = [];
  const half = (pts, p0, dir, g) => { const L = Math.hypot(...dir), n = [-dir[1] / L, dir[0] / L]; return clipHalf(pts, n, n[0] * p0[0] + n[1] * p0[1] + g); };
  let y = mt; const rows = T.rows.map(([rh, cols]) => { const h = (H - gy * (T.rows.length - 1)) * rh / hs, r = {y, h, cols}; y += h + gy; return r; });
  rows.forEach((r, ri) => {
    const s0 = (T.tilt || 0) * ((ri - 1) % 2 ? -1 : 1), s1 = (T.tilt || 0) * (ri % 2 ? -1 : 1), ws = r.cols.reduce((a, x) => a + x, 0), cy = r.y + r.h / 2;
    let x = ml; const xs = r.cols.map(cw => { const w = (W - gx * (r.cols.length - 1)) * cw / ws, q = [x, w]; x += w + gx; return q; });
    xs.forEach(([x0, w], j) => {
      let pts = live;
      if (ri > 0) pts = half(pts, [cxL, r.y - gy / 2], [1, s0], gy / 2);  // (below the gutter above)
      if (ri < rows.length - 1) pts = half(pts, [cxL, r.y + r.h + gy / 2], [-1, -s1], gy / 2);
      const t0 = (T.vtilt || 0) * ((ri + j - 1) % 2 ? -1 : 1), t1 = (T.vtilt || 0) * ((ri + j) % 2 ? -1 : 1);
      if (j > 0) pts = half(pts, [x0 - gx / 2, cy], [-t0, -1], gx / 2);
      if (j < xs.length - 1) pts = half(pts, [x0 + w + gx / 2, cy], [t1, 1], gx / 2);
      if (c.rtl) pts = pts.map(([px, py]) => [P.w - px, py]).reverse();  // (mirrored: the first panel at the right)
      if (pts.length >= 3) out.push(setPanelPoly({id: newId('p'), x: 0, y: 0, w: 1, h: 1, shot: null, link: null, f: 0, balloons: []}, pts));
    });
  });
  return out;
}
// n panels in rows of up to three (a page with more than a template holds)
function layoutGrid(n, c = comic()) {
  const rows = Math.ceil(n / 3), tplRows = []; let left = n; for (let r = 0; r < rows; r++) { const k = Math.ceil(left / (rows - r)); tplRows.push([1, new Array(k).fill(1)]); left -= k; }
  PANEL_TEMPLATES._grid = {label: '', rows: tplRows}; const out = layoutPanels('_grid', c); delete PANEL_TEMPLATES._grid; return out;
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
  if (!p.cam && p.link && p.autoCam !== false) { const B = panelBox(p), c = panelAutoCam(B.w / B.h, s); if (c) applyCam(c); }
  return true;
}
// a film shot's framing turned to a panel's shape: the camera stays where it is and looks the same way; it turns to
// the middle of the people the film frame shows and zooms so they fill the panel as they filled the shot (a close-up
// stays a close-up, a two-shot keeps both) — a wide establishing shot keeps its whole place
function panelAutoCam(aspect, s) {
  if (s && (s.kind === 'est' || s.kind === 'master')) return null;
  const fa = PROJECT.film.aspect || 16 / 9, cam = camera.clone(); cam.clearViewOffset(); cam.aspect = fa; cam.setFocalLength(state.focal); cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
  let x0 = 1, x1 = -1, y0 = 1, y1 = -1, any = false;
  for (const m of chars) { if (!m.group.visible) continue; const hp = m.joints.hips.getWorldPosition(new V3()); if (hp.y < -5) continue;
    const top = m.joints.head.getWorldPosition(new V3()).add(new V3(0, m.headH * .6, 0)), pts = [top, hp, m.joints.ankleL.getWorldPosition(new V3()), m.joints.ankleR.getWorldPosition(new V3()), m.joints.wristL.getWorldPosition(new V3()), m.joints.wristR.getWorldPosition(new V3())];
    const q = pts.map(v => v.clone().project(cam)); if (!q.some(v => v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1)) continue;  // (not in the film's frame)
    for (const v of q) { if (v.z > 1) continue; x0 = Math.min(x0, clamp(v.x, -1, 1)); x1 = Math.max(x1, clamp(v.x, -1, 1)); y0 = Math.min(y0, clamp(v.y, -1, 1)); y1 = Math.max(y1, clamp(v.y, -1, 1)); any = true; } }
  if (!any || x1 <= x0 || y1 <= y0) return null;
  const tv = Math.tan(cam.fov * DEG / 2), th = tv * fa, cx = (x0 + x1) / 2 * th, cy = (y0 + y1) / 2 * tv;
  // the tangent the panel needs to hold them with a little air, never closer than a third of the shot's own view
  const need = Math.max((y1 - y0) / 2 * tv / .86, (x1 - x0) / 2 * th / (aspect * .9)), tvp = clamp(need, tv * .35, tv * 1.15);
  const P = camera.position.clone(), T = controls.target.clone(), dist = P.distanceTo(T), fwd = T.clone().sub(P).normalize(), right = new V3().crossVectors(fwd, camera.up).normalize(), up = new V3().crossVectors(right, fwd);
  const dir = fwd.clone().add(right.multiplyScalar(cx)).add(up.multiplyScalar(cy)).normalize(), t = P.clone().addScaledVector(dir, dist);
  const focal = (camera.filmGauge / Math.max(aspect, 1)) / 2 / tvp;
  return {p: P.toArray(), t: t.toArray(), f: clamp(focal, 10, 200), r: state.roll || 0};
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
  const out = document.createElement('canvas'); out.width = w; out.height = h; const g = out.getContext('2d'), anchors = panelAnchors(aspect);
  g.fillStyle = p.bg === 'black' ? '#141210' : '#fff'; g.fillRect(0, 0, w, h);
  if (set && !['speed', 'focus', 'flash', 'black', 'white'].includes(p.bg)) g.drawImage(set, 0, 0); if (tone) g.drawImage(tone, 0, 0);
  if (p.bg && p.bg !== 'set') panelEffect(g, p.bg, w, h, anchors.find(Boolean));
  g.drawImage(recolor(ink, p.bg === 'black' ? '#f4f1ea' : '#141210', 1), 0, 0);
  // breaking out of the panel: the figures drawn again in a wider picture (the same camera, a wider lens), white
  // under their ink, to be laid over the page round the panel
  let out2 = null;
  if (p.breakout) { const E = BREAKOUT, W = Math.round(w * E), H = Math.round(h * E), f0 = state.focal; state.focal = f0 / E;
    try { const big = renderView({w: W, h: H, bg: 'lines'}), sil = renderView({w: W, h: H, bg: 'alpha'}); out2 = document.createElement('canvas'); out2.width = W; out2.height = H; const g2 = out2.getContext('2d');
      g2.drawImage(sil, 0, 0); g2.globalCompositeOperation = 'source-in'; g2.fillStyle = '#fff'; g2.fillRect(0, 0, W, H); g2.globalCompositeOperation = 'source-over'; g2.drawImage(recolor(big, '#141210', 1), 0, 0); }
    finally { state.focal = f0; } }
  return {img: out, anchors, out: out2};
}
const panelKey = (p, w, h) => { const s = panelShot(p), c = comic(); return [p.id, s ? s.id : '-', s ? s.rev || 0 : 0, panelFrame(p), w, h, JSON.stringify(p.cam || null), p.bg || '', p.breakout ? 'B' : '', c.look.tone, c.look.set, PROJECT.film.aspect || ''].join('|'); };
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

// the backgrounds of manga: speed lines (the move), focus lines (to a face), a flash (a shock)
function panelEffect(g, kind, w, h, a) {
  const cx = a ? a.x * w : w / 2, cy = a ? a.y * h : h / 2, rnd = n => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); }, L = Math.hypot(w, h);
  g.save(); g.fillStyle = '#141210';
  if (kind === 'speed') for (let i = 0; i < 70; i++) { const y = rnd(i) * h, len = w * (.35 + rnd(i + 99) * .6), th = Math.max(1, h * .006 * (.4 + rnd(i + 7))), x = rnd(i + 3) * (w - len * .5);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y - th / 2); g.lineTo(x + len, y + th / 2); g.closePath(); g.fill(); }
  else if (kind === 'focus' || kind === 'flash') {
    const n = kind === 'focus' ? 140 : 46, inner = Math.min(w, h) * (kind === 'focus' ? .3 : .18);
    for (let i = 0; i < n; i++) { const ang = (i + rnd(i) * .6) / n * Math.PI * 2, r0 = inner * (.8 + rnd(i + 5) * .5), wd = (kind === 'focus' ? .006 : .045) * (.5 + rnd(i + 11));
      g.beginPath(); g.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0); g.lineTo(cx + Math.cos(ang - wd) * L, cy + Math.sin(ang - wd) * L); g.lineTo(cx + Math.cos(ang + wd) * L, cy + Math.sin(ang + wd) * L); g.closePath(); g.fill(); }
    if (kind === 'flash') { const gr = g.createRadialGradient(cx, cy, 0, cx, cy, inner * 1.6); gr.addColorStop(0, '#fff'); gr.addColorStop(.7, '#fff'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
  }
  g.restore();
}
// a sound written on the page (BLAM, ドン): big letters, white with a thick ink edge, turned, over the panels
function drawSfx(g, x, k, ox, oy, sel) {
  const px = x.size * k; g.save(); g.translate(ox + x.x * k, oy + x.y * k); g.rotate((x.rot || 0) * DEG); g.font = SFX_FONT(px); g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = px * .2; g.strokeStyle = '#141210'; g.strokeText(x.text, 0, 0); g.fillStyle = x.fill || '#ffffff'; g.fillText(x.text, 0, 0);
  const wd = g.measureText(x.text).width; if (sel) { g.strokeStyle = '#2b5a9e'; g.lineWidth = 2; g.setLineDash([5, 4]); g.strokeRect(-wd / 2 - 6, -px * .6, wd + 12, px * 1.2); }
  g.restore(); return {w: wd, h: px * 1.1};
}

/* ---------- balloons ---------- */
// lines of text that fit a width
function wrapText(g, text, maxW) {
  const rows = []; for (const para of String(text || '').split('\n')) { let row = ''; for (const w of para.split(/\s+/).filter(Boolean)) { const t = row ? row + ' ' + w : w; if (row && g.measureText(t).width > maxW) { rows.push(row); row = w; } else row = t; } rows.push(row); }
  return rows;
}
const balloonFont = (px, b) => `${b.kind === 'narration' ? 'italic ' : ''}${b.kind === 'shout' || b.kind === 'black' ? 700 : 400} ${px}px "Comic Neue", ${css('--f-hand')}, sans-serif`;
const SFX_FONT = px => `400 ${px}px Bangers, "Comic Neue", ${css('--f-hand')}, sans-serif`;
// the lettering fonts come with the app, loaded the first time a page is drawn
const comicFonts = () => CM.fonts || (CM.fonts = Promise.all(['700 20px "Comic Neue"', '400 20px "Comic Neue"', '400 20px Bangers'].map(f => document.fonts.load(f).catch(() => {}))));

/* ---------- a page drawn: on screen, or for print ---------- */
// panels into a 2D context at k px per mm (offset ox, oy); cached panel pictures where there are, a note where not.
// In layers (o.part): the panels' pictures, their borders, the figures breaking out of them, balloons, sounds
function composePage(g, pg, k, ox, oy, o = {}) {
  const c = comic(), P = c.page, part = o.part, want = x => !part || part === x; if (!part) { g.fillStyle = '#fff'; g.fillRect(ox, oy, P.w * k, P.h * k); }
  const hits = [], num = new Map(readingOrder(pg, c).map((p, i) => [p, i + 1]));
  const L = drawOrder(pg).map(p => { const B = panelBox(p), R = {x: ox + B.x * k, y: oy + B.y * k, w: B.w * k, h: B.h * k}, w = Math.round(R.w * (o.px || 1)), h = Math.round(R.h * (o.px || 1));
    return {p, R, path: panelPath(p, k, ox, oy), hit: CM.cache.get(panelKey(p, w, h))}; });
  for (const {p, R, path, hit} of L) {
    // (a panel set into another: a white edge round it, the page's gutter)
    if (p.inset && want('panels')) { g.save(); g.strokeStyle = '#fff'; g.lineJoin = 'round'; g.lineWidth = c.page.gutter[0] * k * 2; g.stroke(path); g.restore(); }
    g.save(); g.clip(path);
    if (hit && want('panels')) { if (p.inset) { g.fillStyle = '#fff'; g.fillRect(R.x, R.y, R.w, R.h); } g.drawImage(hit.img, R.x, R.y, R.w, R.h); }
    else if (o.screen) { g.fillStyle = '#f4f1ea'; g.fillRect(R.x, R.y, R.w, R.h); g.fillStyle = '#8a8170'; const fs = Math.max(10, Math.min(k * 3.2, R.w / 9)); g.font = `600 ${fs}px ${css('--f-body')}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      const rows = wrapText(g, panelShot(p) ? tr('Dibujando…') : tr('Viñeta vacía: doble clic para montarla'), R.w * .82); rows.forEach((r, j) => g.fillText(r, R.x + R.w / 2, R.y + R.h / 2 + (j - (rows.length - 1) / 2) * fs * 1.25)); g.textBaseline = 'alphabetic'; }
    g.restore();
    if (want('borders')) strokePanel(g, p, path, k, ox, oy);
  }
  // the figures that break out of their panels, over the borders round them (inside, the panel is already drawn)
  if (want('breakout')) for (const {p, R, path, hit} of L) if (p.breakout && hit && hit.out) {
    const W = R.w * BREAKOUT, H = R.h * BREAKOUT, outside = new Path2D(); outside.rect(ox - P.w * k, oy - P.h * k, P.w * k * 3, P.h * k * 3); outside.addPath(path);
    g.save(); g.clip(outside, 'evenodd'); g.drawImage(hit.out, R.x + R.w / 2 - W / 2, R.y + R.h / 2 - H / 2, W, H); g.restore(); }
  for (const {p, R, hit} of L) {
    if (want('balloons')) for (const h of drawBalloons(g, p.balloons, R, hit && hit.anchors, k, o.screen && CM.selB)) hits.push({...h, p});
    if (o.screen) { if (CM.sel === p) { g.save(); g.strokeStyle = '#2b5a9e'; g.lineWidth = 3; g.setLineDash([]); g.stroke(panelPath(p, k, ox, oy)); g.restore(); }
      g.fillStyle = '#8a8170'; g.font = `600 ${Math.max(10, k * 2.4)}px ${css('--f-mono')}`; g.textAlign = 'left'; const pt = panelPts(p).reduce((a, q) => q[0] + q[1] < a[0] + a[1] ? q : a);
      g.fillText(String(num.get(p)), ox + Math.max(0, pt[0]) * k + 4, oy + Math.max(0, pt[1]) * k + Math.max(12, k * 3)); }
  }
  if (want('sfx')) for (const x of pg.sfx || []) { const b = drawSfx(g, x, k, ox, oy, o.screen && CM.selX === x); hits.push({x, box: {x: ox + x.x * k - b.w / 2, y: oy + x.y * k - b.h / 2, w: b.w, h: b.h}}); }
  return hits;
}
// the page at print size (dpi): the panels drawn for it first
async function pageImage(pg, dpi = 300, part) {
  const c = comic(), k = mmPx(1, dpi); await comicFonts();
  await drawPanels(pg.panels, p => { const B = panelBox(p); return [Math.round(B.w * k), Math.round(B.h * k)]; });
  const cv = document.createElement('canvas'); cv.width = Math.round(c.page.w * k); cv.height = Math.round(c.page.h * k);
  composePage(cv.getContext('2d'), pg, k, 0, 0, {part});
  return cv;
}
