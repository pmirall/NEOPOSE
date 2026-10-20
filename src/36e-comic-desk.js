/* ======================= the comic desk: the page under the hand =======================
   The page view is a drawing desk, and everything is done on the page itself:
   - a gutter (the white between panels) is dragged to move it, and every panel along it follows (Alt: only this
     one); a corner of the chosen panel is dragged to slant its sides. They snap to the margins, the middle, the
     thirds and the other gutters, with the guide shown
   - a panel's picture is dragged onto another to swap them (they fly to their places); a balloon onto another panel
     to give it to that one
   - over a panel, its toolbar: its scene opened in 3D in one click (the panel grows into the stage), a balloon, cuts
   - shapes glide when they change (a new layout, a cut, a panel taken out, undo): the panels morph from where they were
   - zoom (Ctrl+wheel, pinch, the toolbar), two facing pages (a spread), undo and redo of all that is done on the pages
   - keys: Ctrl+Z / Ctrl+Mayús+Z, Supr, the arrows (a balloon, or the page), Intro (3D), Re Pág / Av Pág, Esc */
const pv = {cv: null, g: null, k: 1, k0: 1, ox: 0, oy: 0, dpr: 1, hits: [], drag: null, zoom: 1, panX: 0, panY: 0, spread: false, pages: [], hover: null, edge: null, guides: [], drop: null, ghost: null, hl: null, pulse: null, raf: 0, ptrs: new Map(), gone: []};
const CONTENT_KEYS = ['shot', 'link', 'f', 'cam', 'bg', 'balloons', 'note', 'autoCam'];
const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeBack = t => { const s = 1.5; t -= 1; return t * t * ((s + 1) * t + s) + 1; };
function pageOn() { return !!$('#pageView') && !$('#pageView').hidden; }
const rawPts = p => p.poly ? p.poly.map(q => [...q]) : rectPts(p);

/* ---------- shapes that glide ---------- */
// a polygon as n points along its outline, from its top-left corner, the same way round (so two can be blended)
function resample(pts, n = 40) {
  let P = pts.slice(); if (polyArea(P) < 0) P.reverse();
  const i0 = P.reduce((b, q, i) => q[0] + q[1] < P[b][0] + P[b][1] ? i : b, 0); P = [...P.slice(i0), ...P.slice(0, i0)];
  const L = P.map((a, i) => { const b = P[(i + 1) % P.length]; return Math.hypot(b[0] - a[0], b[1] - a[1]); }), tot = L.reduce((x, y) => x + y, 0) || 1, out = [];
  let seg = 0, acc = 0;
  for (let j = 0; j < n; j++) { const d = j / n * tot; while (seg < P.length - 1 && acc + L[seg] < d) { acc += L[seg]; seg++; }
    const a = P[seg], b = P[(seg + 1) % P.length], t = L[seg] ? (d - acc) / L[seg] : 0; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  return out;
}
function tweenPts(tw, to) {
  const t = clamp((performance.now() - tw.t0) / tw.dur, 0, 1); if (t >= 1) return to;
  const e = tw.ease(t), B = resample(to, tw.from.length); return tw.from.map((a, i) => [a[0] + (B[i][0] - a[0]) * e, a[1] + (B[i][1] - a[1]) * e]);
}
// a change of the pages, its panels gliding from where they were to where they end (new ones grow from their parent,
// or from their middle; the ones gone fade away)
function morph(fn, o = {}) {
  const c = comic(), before = new Map(); CM.twOn = true;
  for (const pg of c.pages) for (const p of pg.panels) before.set(p.id, {pts: resample(panelPts(p)), pg: pg.id, img: CM.last.get(p.id)});
  CM.twOn = false;
  const r = fn(), now = performance.now(), after = new Set();
  for (const pg of comic().pages) for (const p of pg.panels) {
    after.add(p.id); const b = before.get(p.id), own = resample(panelPts(p));
    let from = b && b.pts; if (!from && o.parent && before.get(o.parent)) from = before.get(o.parent).pts;
    if (!from) { const cx = own.reduce((a, q) => a + q[0], 0) / own.length, cy = own.reduce((a, q) => a + q[1], 0) / own.length; from = own.map(([x, y]) => [cx + (x - cx) * .5, cy + (y - cy) * .5]); }
    if (from.some((q, i) => Math.hypot(q[0] - own[i][0], q[1] - own[i][1]) > .05)) CM.tw.set(p.id, {from, t0: now, dur: o.dur || 460, ease: o.ease || easeBack});
  }
  for (const [id, b] of before) if (!after.has(id)) pv.gone.push({...b, t0: now});
  drawPage(); return r;
}

/* ---------- undo and redo of the pages ---------- */
const CMH = {stack: [], i: -1, t: 0};
const comicSnap = () => JSON.stringify(PROJECT.comic || null);
function histReset() { CMH.stack = [comicSnap()]; CMH.i = 0; clearTimeout(CMH.t); syncDeskTools(); }
function histCommit() {
  clearTimeout(CMH.t); CMH.t = 0; const s = comicSnap(); if (CMH.i < 0) { histReset(); return; } if (s === CMH.stack[CMH.i]) return;
  CMH.stack.length = CMH.i + 1; CMH.stack.push(s); if (CMH.stack.length > 100) CMH.stack.shift(); CMH.i = CMH.stack.length - 1; syncDeskTools();
}
function histSoon() { clearTimeout(CMH.t); CMH.t = setTimeout(histCommit, 250); }
function comicUndo(d) {
  if (CMH.t) histCommit();  // (what was just done is kept first, to be redone)
  const j = CMH.i + d; if (j < 0 || j >= CMH.stack.length) return false;
  CMH.i = j; const ids = {p: CM.sel && CM.sel.id, b: CM.selB && CM.selB.id, x: CM.selX && CM.selX.id};
  morph(() => { PROJECT.comic = JSON.parse(CMH.stack[j]); });
  const c = comic(), all = c.pages.flatMap(pg => pg.panels); CM.page = clamp(CM.page, 0, Math.max(0, c.pages.length - 1));
  CM.sel = all.find(p => p.id === ids.p) || null; CM.selB = CM.sel && CM.sel.balloons.find(b => b.id === ids.b) || null; CM.selX = (curPage() && (curPage().sfx || []).find(x => x.id === ids.x)) || null;
  if (typeof autosaveSoon === 'function') autosaveSoon(); syncComicUI(); deskChanged(); syncDeskTools(); return true;
}

/* ---------- where things are ---------- */
// the pages shown: one, or the spread it belongs to (the first page alone, then 2-3, 4-5…; right to left in manga)
function spreadOf(i) {
  const n = comic().pages.length; if (!pv.spread || i === 0) return [i];
  const lo = i % 2 ? i : i - 1, L = [lo, lo + 1].filter(x => x < n); return comic().rtl ? L.reverse() : L;
}
function deskInsets() {
  const css = el => el && !el.hidden ? el.getBoundingClientRect() : null, phone = innerWidth <= 600, tr0 = css($('#pvTrack')), sh = css($('#pvShots')), sc = css($('#pvScript'));
  const tl = css($('#pvTools')), top = tl ? tl.bottom - $('#pageView').getBoundingClientRect().top + 8 : 52;
  return {t: top, r: sc && !phone ? sc.width + 12 : 0, b: (tr0 ? tr0.height + 10 : 0) + (sh ? sh.height + 6 : 0), l: 0};
}
function deskLayout() {
  const c = comic(), cv = pv.cv, dpr = pv.dpr, ins = deskInsets(), W = cv.width - (ins.l + ins.r) * dpr, H = cv.height - (ins.t + ins.b) * dpr, pad = 22 * dpr, label = 22 * dpr;
  const idx = spreadOf(CM.page), n = idx.length;
  pv.k0 = Math.max(.1, Math.min((W - pad * 2) / (c.page.w * n), (H - pad * 2 - label) / c.page.h)); const k = pv.k = pv.k0 * pv.zoom;
  const x0 = ins.l * dpr + (W - c.page.w * n * k) / 2 + pv.panX, y0 = ins.t * dpr + (H - label - c.page.h * k) / 2 + pv.panY;
  pv.pages = idx.map((i, j) => ({i, pg: c.pages[i], ox: x0 + j * c.page.w * k, oy: y0}));
  const cur = pv.pages.find(e => e.i === CM.page) || pv.pages[0]; pv.ox = cur.ox; pv.oy = cur.oy;
}
// (the layout is computed again if the page was just changed and not drawn yet)
const entryOf = pg => pv.pages.find(e => e.pg === pg) || (pageOn() && pv.cv && pv.cv.width && comic().pages.includes(pg) && spreadOf(CM.page).includes(comic().pages.indexOf(pg)) ? (deskLayout(), pv.pages.find(e => e.pg === pg)) : null);
const entryAt = (x, y) => { const c = comic(); return pv.pages.find(e => x >= e.ox - 8 && x <= e.ox + c.page.w * pv.k + 8 && y >= e.oy - 8 && y <= e.oy + c.page.h * pv.k + 8) || null; };
const toMm = (e, x, y) => [(x - e.ox) / pv.k, (y - e.oy) / pv.k];
// a panel's rectangle on screen, in CSS px of the page view
function panelScreenRect(p) { const pg = comic().pages.find(q => q.panels.includes(p)), e = pg && entryOf(pg); if (!e) return null; const B = panelBox(p), d = pv.dpr; return {x: (e.ox + B.x * pv.k) / d, y: (e.oy + B.y * pv.k) / d, w: B.w * pv.k / d, h: B.h * pv.k / d}; }

/* ---------- drawing the desk ---------- */
function drawPage() { if (pageOn() && !pv.raf) pv.raf = requestAnimationFrame(renderDesk); }
function renderDesk() {
  pv.raf = 0; if (!pageOn()) return;
  if (!CM.fontsReady) comicFonts().then(() => { if (!CM.fontsReady) { CM.fontsReady = true; drawPage(); } });
  const c = comic(); if (!curPage()) return;
  const box = $('#pageView'), r = box.getBoundingClientRect(), dpr = pv.dpr = Math.min(devicePixelRatio || 1, 2), cv = pv.cv, W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  deskLayout(); const g = pv.g, k = pv.k, now = performance.now();
  for (const [id, tw] of CM.tw) if (now - tw.t0 > tw.dur) CM.tw.delete(id);
  for (const [id, f] of CM.fly) if (now - f.t0 > f.dur) CM.fly.delete(id);
  pv.gone = pv.gone.filter(x => now - x.t0 < 360);
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
  pv.hits = []; CM.twOn = true;
  for (const e of pv.pages) {
    const PW = c.page.w * k, PH = c.page.h * k, cur = e.i === CM.page;
    g.save(); g.shadowColor = 'rgba(40,30,10,.22)'; g.shadowBlur = 20 * dpr; g.shadowOffsetY = 5 * dpr; g.fillStyle = '#fff'; g.fillRect(e.ox, e.oy, PW, PH); g.restore();
    for (const h of composePage(g, e.pg, k, e.ox, e.oy, {screen: true})) pv.hits.push({...h, pg: e.pg});
    // the live area (inside the margins), faint; the fold between two facing pages
    const [mt, mr, mb, ml] = c.page.margin; g.save(); g.setLineDash([4 * dpr, 5 * dpr]); g.strokeStyle = cur ? 'rgba(43,90,158,.32)' : 'rgba(43,90,158,.14)'; g.lineWidth = 1; g.strokeRect(e.ox + ml * k, e.oy + mt * k, (c.page.w - ml - mr) * k, (c.page.h - mt - mb) * k); g.restore();
    if (pv.pages.length > 1) { const left = e === pv.pages[0], gr = g.createLinearGradient(left ? e.ox + PW - 26 * dpr : e.ox, 0, left ? e.ox + PW : e.ox + 26 * dpr, 0); gr.addColorStop(left ? 0 : 1, 'rgba(0,0,0,0)'); gr.addColorStop(left ? 1 : 0, 'rgba(60,45,20,.13)'); g.fillStyle = gr; g.fillRect(left ? e.ox + PW - 26 * dpr : e.ox, e.oy, 26 * dpr, PH); }
    g.fillStyle = cur ? '#2a2620' : '#8a8170'; g.font = `${cur ? 700 : 600} ${12 * dpr}px ${css('--f-body')}`; g.textAlign = 'center';
    g.fillText(`${e.i + 1}${e.pg.title ? ' · ' + e.pg.title : ''}`, e.ox + PW / 2, e.oy + PH + 17 * dpr);
  }
  CM.twOn = false;
  drawDeskOverlays(g, now);
  // the panels not yet drawn for this size (not while they move: their last picture stands in)
  if (!CM.tw.size && !(pv.drag && /edge|corner/.test(pv.drag.kind)) && !CM.busy) {
    const px = p => { const B = panelBox(p); return [Math.round(B.w * k), Math.round(B.h * k)]; }, missing = pv.pages.flatMap(e => e.pg.panels).filter(p => panelShot(p) && !CM.cache.has(panelKey(p, ...px(p))));
    if (missing.length) drawPanels(missing, px);
  }
  placeDeskBar();
  const sh = $('#pvShots'), sc = $('#pvScript'); if (sh) sh.style.right = sc && !sc.hidden && innerWidth > 600 ? sc.offsetWidth + 24 + 'px' : '';
  if (CM.tw.size || CM.fly.size || pv.gone.length || (pv.pulse && now - pv.pulse.t0 < 900) || pv.drop) drawPage();
}
function polyPathPx(pts, e) { const P = new Path2D(); pts.forEach(([x, y], i) => i ? P.lineTo(e.ox + x * pv.k, e.oy + y * pv.k) : P.moveTo(e.ox + x * pv.k, e.oy + y * pv.k)); P.closePath(); return P; }
function drawDeskOverlays(g, now) {
  const dpr = pv.dpr, k = pv.k, blue = '#2b5a9e';
  // panels taken out, fading and shrinking
  for (const x of pv.gone) { const pg = comic().pages.find(q => q.id === x.pg), e = pg && entryOf(pg); if (!e) continue; const t = (now - x.t0) / 360, s = 1 - .3 * easeOut(t), cx = x.pts.reduce((a, q) => a + q[0], 0) / x.pts.length, cy = x.pts.reduce((a, q) => a + q[1], 0) / x.pts.length;
    g.save(); g.globalAlpha = 1 - t; g.fillStyle = '#e8e1d0'; g.fill(polyPathPx(x.pts.map(([px, py]) => [cx + (px - cx) * s, cy + (py - cy) * s]), e)); g.restore(); }
  // the panel under the hand, or a row of the script, lit faintly
  for (const id of [pv.hover && pv.hover.id, pv.hl].filter(Boolean)) { const p = findPanel(id), e = p && entryOf(pageOfPanel(p)); if (!e || (CM.sel === p && id !== pv.hl)) continue; g.save(); g.fillStyle = 'rgba(43,90,158,.08)'; g.fill(panelPath(p, k, e.ox, e.oy)); g.restore(); }
  // a gutter about to be moved: the sides that will move with it
  const ed = pv.drag && pv.drag.set ? pv.drag : pv.edge;
  if (ed && ed.set) { g.save(); g.strokeStyle = 'rgba(43,90,158,.75)'; g.lineWidth = 3 * dpr; g.lineCap = 'round';
    for (const p of new Set(ed.set.map(s => s.p))) { const e = entryOf(pageOfPanel(p)); if (!e) continue; const P = panelPts(p), js = ed.set.filter(s => s.p === p).map(s => s.j);
      for (let j = 0; j < P.length; j++) { const j2 = (j + 1) % P.length; if (js.includes(j) && js.includes(j2) || (ed.kind === 'corner' && (js.includes(j) || js.includes(j2)))) { g.beginPath(); g.moveTo(e.ox + P[j][0] * k, e.oy + P[j][1] * k); g.lineTo(e.ox + P[j2][0] * k, e.oy + P[j2][1] * k); g.stroke(); } } }
    g.restore(); }
  // the chosen panel's handles: its corners (to slant) and the middle of its sides (to move them)
  if (CM.sel && !pv.drag?.swap) { const p = CM.sel, e = entryOf(pageOfPanel(p)); if (e) { const P = panelPts(p);
    g.save(); g.lineWidth = 1.5 * dpr; g.strokeStyle = blue;
    P.forEach(([x, y], j) => { const [x2, y2] = P[(j + 1) % P.length], mx = e.ox + (x + x2) / 2 * k, my = e.oy + (y + y2) / 2 * k, a = Math.atan2(y2 - y, x2 - x);
      g.save(); g.translate(mx, my); g.rotate(a); g.fillStyle = '#fff'; g.beginPath(); g.roundRect(-9 * dpr, -3 * dpr, 18 * dpr, 6 * dpr, 3 * dpr); g.fill(); g.stroke(); g.restore(); });
    P.forEach(([x, y]) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(e.ox + x * k, e.oy + y * k, 5 * dpr, 0, Math.PI * 2); g.fill(); g.stroke(); });
    g.restore(); } }
  // snapping guides
  for (const gd of pv.guides) { const e = entryOf(gd.pg); if (!e) continue; const c = comic(); g.save(); g.strokeStyle = '#b0432c'; g.lineWidth = 1 * dpr; g.setLineDash([6 * dpr, 4 * dpr]); g.beginPath();
    if (gd.x != null) { g.moveTo(e.ox + gd.x * k, e.oy - 10 * dpr); g.lineTo(e.ox + gd.x * k, e.oy + c.page.h * k + 10 * dpr); } else { g.moveTo(e.ox - 10 * dpr, e.oy + gd.y * k); g.lineTo(e.ox + c.page.w * k + 10 * dpr, e.oy + gd.y * k); }
    g.stroke(); g.restore(); }
  // where a picture, a balloon or a shot would land
  if (pv.drop) { const p = pv.drop.p, e = entryOf(pageOfPanel(p)); if (e) { const t = (now % 900) / 900, P = panelPath(p, k, e.ox, e.oy);
    g.save(); g.fillStyle = 'rgba(43,90,158,.12)'; g.fill(P); g.strokeStyle = blue; g.lineWidth = 3 * dpr; g.setLineDash([10 * dpr, 6 * dpr]); g.lineDashOffset = -t * 32 * dpr; g.stroke(P); g.restore();
    const B = panelBox(p), cx = e.ox + (B.x + B.w / 2) * k, cy = e.oy + (B.y + B.h / 2) * k; g.save(); g.font = `700 ${13 * dpr}px ${css('--f-body')}`; const w = g.measureText(pv.drop.label).width + 20 * dpr;
    g.fillStyle = blue; g.beginPath(); g.roundRect(cx - w / 2, cy - 14 * dpr, w, 28 * dpr, 14 * dpr); g.fill(); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(pv.drop.label, cx, cy); g.restore(); } }
  // pictures flying to the panels they were dropped on
  for (const [id, f] of CM.fly) { const p = findPanel(id), e = p && entryOf(pageOfPanel(p)); if (!e) continue; const t = easeBack(clamp((now - f.t0) / f.dur, 0, 1)), B = panelBox(p);
    const to = {x: e.ox + B.x * k, y: e.oy + B.y * k, w: B.w * k, h: B.h * k}, R = {x: f.from.x + (to.x - f.from.x) * t, y: f.from.y + (to.y - f.from.y) * t, w: f.from.w + (to.w - f.from.w) * t, h: f.from.h + (to.h - f.from.h) * t};
    g.save(); g.shadowColor = 'rgba(40,30,10,.35)'; g.shadowBlur = 16 * dpr * (1 - t); g.shadowOffsetY = 6 * dpr * (1 - t); drawCover(g, f.img, R); g.restore(); }
  // a panel's picture in the hand
  if (pv.ghost) { const G = pv.ghost, w = Math.min(G.img.width, 220 * dpr), h = w * G.img.height / G.img.width;
    g.save(); g.translate(G.x, G.y); g.rotate(-.05); g.globalAlpha = .92; g.shadowColor = 'rgba(40,30,10,.45)'; g.shadowBlur = 22 * dpr; g.shadowOffsetY = 10 * dpr; g.fillStyle = '#fff'; g.fillRect(-w / 2 - 4 * dpr, -h / 2 - 4 * dpr, w + 8 * dpr, h + 8 * dpr); g.shadowColor = 'transparent'; g.drawImage(G.img, -w / 2, -h / 2, w, h); g.restore(); }
  // a panel just made, chosen from the script or back from 3D: a ring that opens out
  if (pv.pulse) { const t = (now - pv.pulse.t0) / 900, p = findPanel(pv.pulse.id), e = p && entryOf(pageOfPanel(p)); if (t < 1 && e) { const B = panelBox(p), s = 1 + .06 * easeOut(t), cx = e.ox + (B.x + B.w / 2) * k, cy = e.oy + (B.y + B.h / 2) * k;
    g.save(); g.translate(cx, cy); g.scale(s, s); g.translate(-cx, -cy); g.globalAlpha = 1 - t; g.strokeStyle = blue; g.lineWidth = 4 * dpr; g.stroke(panelPath(p, k, e.ox, e.oy)); g.restore(); } }
}
const findPanel = id => { for (const pg of comic().pages) for (const p of pg.panels) if (p.id === id) return p; return null; };
const pageOfPanel = p => comic().pages.find(pg => pg.panels.includes(p));
function pulsePanel(p) { if (p) { pv.pulse = {id: p.id, t0: performance.now()}; drawPage(); } }

/* ---------- what the hand is over ---------- */
// a balloon or a sound first, then a corner or side of the chosen panel, a gutter, a panel
function pageHit(x, y) {
  for (let i = pv.hits.length - 1; i >= 0; i--) { const h = pv.hits[i], B = h.box; if (x >= B.x && x <= B.x + B.w && y >= B.y && y <= B.y + B.h) return h.x ? {x: h.x, pg: h.pg} : {b: h.b, p: h.p, pg: h.pg}; }
  const e = entryAt(x, y); if (!e) return null;
  const [mx, my] = toMm(e, x, y), p = panelAt(e.pg, mx, my); return p ? {p, pg: e.pg} : {pg: e.pg};
}
function cornerAt(x, y) {
  const p = CM.sel, e = p && entryOf(pageOfPanel(p)); if (!e) return null; const P = panelPts(p), r = 10 * pv.dpr;
  const j = P.findIndex(([px, py]) => Math.hypot(e.ox + px * pv.k - x, e.oy + py * pv.k - y) < r); return j < 0 ? null : {p, j, e};
}
const segDist2 = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1, t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L, 0, 1); return Math.hypot(a[0] + dx * t - p[0], a[1] + dy * t - p[1]); };
function edgeAt(x, y) {
  const e = entryAt(x, y); if (!e) return null; const m = toMm(e, x, y), inside = panelAt(e.pg, ...m), gut = Math.max(...comic().page.gutter);
  const thr = inside ? 6 * pv.dpr / pv.k : gut / 2 + 1.6; let best = null;
  const L = drawOrder(e.pg).reverse(); if (CM.sel && L.includes(CM.sel)) { L.splice(L.indexOf(CM.sel), 1); L.unshift(CM.sel); }
  for (const p of L) { if (inside && inside !== p) continue; const P = panelPts(p);
    for (let j = 0; j < P.length; j++) { const d = segDist2(m, P[j], P[(j + 1) % P.length]); if (d < thr && (!best || d < best.d - .3)) best = {p, j, d, e}; } }
  return best;
}

/* ---------- moving gutters and corners ---------- */
const unit = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; return [dx / L, dy / L]; };
// the corners that move together: a side's two (or one corner), the ones touching them across the gutters and, along
// a straight gutter, the corners of every side that lies on it (Alt: only this panel's)
function moveSet(pg, p, js, alone, line) {
  const tol = Math.max(...comic().page.gutter) * 1.6 + .6, S = new Map(), Q = js.map(j => [p, j]);
  const R0 = rawPts(p), a = R0[js[0]], dir = js.length > 1 ? unit(R0[js[0]], R0[js[1]]) : null;
  const onLine = v => Math.abs((v[0] - a[0]) * dir[1] - (v[1] - a[1]) * dir[0]) < tol;
  while (Q.length) {
    const [q, j] = Q.shift(), key = q.id + ':' + j; if (S.has(key)) continue; const P = rawPts(q), v = P[j]; S.set(key, {p: q, j, v0: v});
    if (alone) continue;
    for (const o of pg.panels) if (o !== q) rawPts(o).forEach((w, m) => { if (Math.hypot(v[0] - w[0], v[1] - w[1]) <= tol) Q.push([o, m]); });
    if (line && dir) for (const m of [(j + 1) % P.length, (j - 1 + P.length) % P.length]) { const e = unit(v, P[m]); if (Math.abs(e[0] * dir[1] - e[1] * dir[0]) < .05 && onLine(P[m])) Q.push([q, m]); }
  }
  return [...S.values()];
}
function polyOk(P, c) {
  const n = P.length, b = (c.page.bleed || 3) + .01; let sg = 0;
  if (Math.abs(polyArea(P)) < 80) return false;
  for (let i = 0; i < n; i++) { const a = P[i], q = P[(i + 1) % n], r = P[(i + 2) % n]; if (Math.hypot(q[0] - a[0], q[1] - a[1]) < 3) return false;
    const cr = (q[0] - a[0]) * (r[1] - q[1]) - (q[1] - a[1]) * (r[0] - q[0]); if (Math.abs(cr) > 1e-6) { if (sg && Math.sign(cr) !== sg) return false; sg = Math.sign(cr); }
    if (a[0] < -b || a[0] > c.page.w + b || a[1] < -b || a[1] > c.page.h + b) return false; }
  return true;
}
// the set moved by (dx, dy) mm from where it was, as far as the shapes stay sound
function applyMove(D, dx, dy) {
  const c = comic(), tryS = s => { const out = new Map(); for (const [p, P0] of D.orig) out.set(p, P0.map(q => [...q])); for (const m of D.set) out.get(m.p)[m.j] = [m.v0[0] + dx * s, m.v0[1] + dy * s]; return out; };
  let s = 1, res = tryS(1); if (![...res.values()].every(P => polyOk(P, c))) { let lo = 0, hi = 1; for (let i = 0; i < 9; i++) { const mid = (lo + hi) / 2; if ([...tryS(mid).values()].every(P => polyOk(P, c))) lo = mid; else hi = mid; } s = lo; res = tryS(s); }
  for (const [p, P] of res) setPanelPoly(p, P);
}
// where a line or a corner wants to settle: the margins, the middle, the thirds, the other panels' sides
function snapLines(pg, skip) {
  const c = comic(), P = c.page, [mt, mr, mb, ml] = P.margin, xs = [ml, P.w - mr, P.w / 2, ml + (P.w - ml - mr) / 3, ml + (P.w - ml - mr) * 2 / 3], ys = [mt, P.h - mb, P.h / 2, mt + (P.h - mt - mb) / 3, mt + (P.h - mt - mb) * 2 / 3];
  for (const q of pg.panels) if (!skip.has(q)) for (const [x, y] of rawPts(q)) { xs.push(x); ys.push(y); }
  return {xs, ys};
}
function startShapeDrag(kind, hit, ev) {
  const pg = pageOfPanel(hit.p), P = rawPts(hit.p), js = kind === 'corner' ? [hit.j] : [hit.j, (hit.j + 1) % P.length];
  const set = moveSet(pg, hit.p, js, ev.altKey, kind === 'edge'), orig = new Map(); for (const m of set) if (!orig.has(m.p)) orig.set(m.p, rawPts(m.p));
  const d = unit(P[js[0]], P[js[1] ?? js[0]]), n = kind === 'edge' ? [-d[1], d[0]] : null;
  return {kind, set, orig, pg, e: hit.e, n, mid: kind === 'edge' ? [(P[js[0]][0] + P[js[1]][0]) / 2, (P[js[0]][1] + P[js[1]][1]) / 2] : P[js[0]], start: toMm(hit.e, ev._x, ev._y), skip: new Set(set.map(m => m.p))};
}
function moveShapeDrag(D, x, y, ev) {
  const m = toMm(D.e, x, y); let dx = m[0] - D.start[0], dy = m[1] - D.start[1]; const tol = 9 * pv.dpr / pv.k, S = snapLines(D.pg, D.skip); pv.guides = [];
  if (D.kind === 'edge') {
    let t = dx * D.n[0] + dy * D.n[1];
    // a straight side snaps its line; a slanted one only to the others' corners along its normal
    if (Math.abs(D.n[1]) < .02) { const X = D.mid[0] + t, s = S.xs.find(v => Math.abs(v - X) < tol); if (s != null) { t = s - D.mid[0]; pv.guides.push({pg: D.pg, x: s}); } }
    else if (Math.abs(D.n[0]) < .02) { const Y = D.mid[1] + t * Math.sign(D.n[1]), s = S.ys.find(v => Math.abs(v - Y) < tol); if (s != null) { t = (s - D.mid[1]) * Math.sign(D.n[1]); pv.guides.push({pg: D.pg, y: s}); } }
    dx = D.n[0] * t; dy = D.n[1] * t;
  } else {
    if (ev.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
    const X = D.mid[0] + dx, Y = D.mid[1] + dy, sx = S.xs.find(v => Math.abs(v - X) < tol), sy = S.ys.find(v => Math.abs(v - Y) < tol);
    if (sx != null) { dx = sx - D.mid[0]; pv.guides.push({pg: D.pg, x: sx}); } if (sy != null) { dy = sy - D.mid[1]; pv.guides.push({pg: D.pg, y: sy}); }
  }
  applyMove(D, dx, dy); D.moved = true;
}

/* ---------- swapping, re-homing, linking ---------- */
function swapContents(a, b) {
  const la = CM.last.get(a.id), lb = CM.last.get(b.id);
  for (const k of CONTENT_KEYS) { const t = a[k]; if (b[k] === undefined) delete a[k]; else a[k] = b[k]; if (t === undefined) delete b[k]; else b[k] = t; }
  if (!a.balloons) a.balloons = []; if (!b.balloons) b.balloons = [];
  if (lb) CM.last.set(a.id, lb); else CM.last.delete(a.id); if (la) CM.last.set(b.id, la); else CM.last.delete(b.id);
}
function flyFrom(p, R, img) { if (img) CM.fly.set(p.id, {img, from: R, t0: performance.now(), dur: 520}); }
const pxRect = p => { const e = entryOf(pageOfPanel(p)); if (!e) return null; const B = panelBox(p); return {x: e.ox + B.x * pv.k, y: e.oy + B.y * pv.k, w: B.w * pv.k, h: B.h * pv.k}; };
// a balloon given to another panel: where it was dropped
function rehomeBalloon(b, from, to, x, y) {
  const e = entryOf(pageOfPanel(to)); if (!e || from === to) return; removeBalloon(from, b); delete b.join;
  const [mx, my] = toMm(e, x, y), B = panelBox(to); b.x = clamp((mx - B.x) / B.w, .08, .92); b.y = clamp((my - B.y) / B.h, .08, .92);
  const s = panelShot(to); if (b.ci != null && !(s && s.scene.chars[b.ci])) b.ci = s && s.scene.chars.length ? 0 : null;
  to.balloons.push(b); CM.sel = to; CM.selB = b;
}
// a film shot linked to a panel (the panel follows it); its lines as balloons if the panel has none yet
function linkShot(p, s) {
  p.link = {shotId: s.id, f: Math.floor(s.len / 2)}; delete p.shot; p.f = 0; delete p.cam;
  if (!p.balloons.length) s.lines.filter(l => l.text && l.text.trim()).slice(0, 3).forEach((l, n) => p.balloons.push({id: newId('b'), kind: 'speech', text: l.text.trim(), ci: l.c, x: comic().rtl ? .75 - n * .25 : .25 + n * .25, y: .16 + n * .08, size: 9}));
  if (!p.note && s.note) p.note = s.note;
  CM.sel = p; pulsePanel(p); comicChanged(); comicSaved();
}

/* ---------- the toolbar over a panel ---------- */
const DESK_ICONS = {
  cube: '<path d="M12 3 4 7.5v9L12 21l8-4.5v-9z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/>',
  talk: '<path d="M4 5h16v10H9l-4 4v-4H4z"/>',
  cutH: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 12h16"/>',
  cutV: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M12 4v16"/>',
  cutS: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M15 4 9 20"/>',
  film: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4"/>',
  trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>', redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
  minus: '<path d="M5 12h14"/>', plus: '<path d="M12 5v14M5 12h14"/>',
  book: '<path d="M12 6c-2-1.5-5-2-8-1.5v14c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5v-14c-3-.5-6 0-8 1.5zM12 6v14"/>',
  script: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h7M9 16h5"/>'
};
const deskIcon = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${DESK_ICONS[n]}</svg>`;
function placeDeskBar() {
  const bar = $('#pvBar'); if (!bar) return; const p = (pv.drag ? null : CM.sel || (matchMedia('(hover: hover)').matches ? pv.hover : null));
  const R = p && panelScreenRect(p); if (!R || R.w < 60 || R.h < 40) { bar.hidden = true; bar._p = null; return; }
  const empty = !panelShot(p); bar.hidden = false; bar.classList.toggle('empty', empty);
  if (bar._p !== p || bar._e !== empty) { bar._p = p; bar._e = empty;
    bar.querySelector('[data-act=edit] span').textContent = empty ? tr('Montar escena') : tr('Editar escena'); }
  const box = $('#pageView').getBoundingClientRect(), bw = bar.offsetWidth, bh = bar.offsetHeight;
  // (over the bottom of the panel, where balloons seldom are; an empty one's in its middle)
  const x = clamp(R.x + R.w / 2 - bw / 2, 6, box.width - bw - 6), y = empty ? clamp(R.y + R.h / 2 - bh / 2, 56, box.height - bh - 6) : clamp(R.y + R.h - bh - 10, 56, box.height - bh - 6);
  bar.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}
// one click into a panel's scene: the panel grows into the stage, which opens under it on that shot
async function openPanelScene(p) {
  if (!p) return; const R = panelScreenRect(p), hit = CM.last.get(p.id) || [...CM.cache.entries()].find(([k]) => k.startsWith(p.id + '|'))?.[1];
  const vb = $('#viewport').getBoundingClientRect(), pb = $('#pageView').getBoundingClientRect(), B = panelBox(p), a = B.w / B.h;
  let z = null;
  if (R && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    z = document.createElement('div'); z.className = 'pvzoom'; if (hit) { const c2 = document.createElement('canvas'); c2.width = hit.img.width; c2.height = hit.img.height; c2.getContext('2d').drawImage(hit.img, 0, 0); z.appendChild(c2); } else z.classList.add('blank');
    Object.assign(z.style, {left: R.x + pb.left + 'px', top: R.y + pb.top + 'px', width: R.w + 'px', height: R.h + 'px'}); document.body.appendChild(z); z.getBoundingClientRect();
    const tw = Math.min(vb.width * .94, vb.height * .9 * a), th = tw / a; z.classList.add('go'); Object.assign(z.style, {left: vb.left + (vb.width - tw) / 2 + 'px', top: vb.top + (vb.height - th) / 2 + 'px', width: tw + 'px', height: th + 'px'});
  }
  const go = editPanel(p); await new Promise(r => setTimeout(r, z ? 440 : 0)); await go;
  if (z) { z.classList.add('out'); setTimeout(() => z.remove(), 300); }
}
// back from 3D: the page settles in and the panel shows it is done
function deskReturn(p) { const cv = pv.cv; if (cv) { cv.classList.remove('back'); void cv.offsetWidth; cv.classList.add('back'); } pulsePanel(p); }

/* ---------- pages ---------- */
function goPage(i, o = {}) {
  const c = comic(); i = clamp(i, 0, c.pages.length - 1); if (i === CM.page && !o.force) return;
  const was = CM.page, dir = Math.sign(i - was) * (c.rtl ? -1 : 1); CM.page = i; CM.sel = CM.selB = CM.selX = null; pv.panX = pv.panY = 0;
  const cv = pv.cv; if (cv && dir && !spreadOf(was).includes(i)) { cv.classList.remove('turnL', 'turnR', 'back'); void cv.offsetWidth; cv.classList.add(dir > 0 ? 'turnL' : 'turnR'); }
  syncComicUI(); deskChanged();
}
function deskChanged() { drawPage(); if (typeof trackerSoon === 'function') trackerSoon(); if (typeof renderScript === 'function') renderScript(); }
function setZoom(z, x, y) {
  const cv = pv.cv; x = x ?? cv.width / 2; y = y ?? cv.height / 2; const e = entryAt(x, y) || pv.pages[0], m = e ? toMm(e, x, y) : [0, 0], ei = e ? e.i : CM.page;
  pv.zoom = clamp(z, .4, 6); if (pv.zoom === 1 || z === 1) { pv.panX = pv.panY = 0; } deskLayout();
  const e2 = pv.pages.find(q => q.i === ei); if (e2 && pv.zoom !== 1) { pv.panX += x - (e2.ox + m[0] * pv.k); pv.panY += y - (e2.oy + m[1] * pv.k); }
  syncDeskTools(); drawPage();
}
function syncDeskTools() {
  const t = $('#pvTools'); if (!t) return;
  t.querySelector('[data-act=undo]').disabled = CMH.i <= 0 && !CMH.t; t.querySelector('[data-act=redo]').disabled = CMH.i >= CMH.stack.length - 1;
  t.querySelector('[data-act=fit]').textContent = Math.round(pv.zoom * 100) + ' %';
  t.querySelector('[data-act=spread]').setAttribute('aria-pressed', String(pv.spread));
  const sc = $('#pvScript'); t.querySelector('[data-act=script]').setAttribute('aria-pressed', String(!!sc && !sc.hidden));
  const sh = $('#pvShots'); t.querySelector('[data-act=shots]').setAttribute('aria-pressed', String(!!sh && !sh.hidden));
}
function deleteSelection() {
  const pg = curPage(); if (!pg) return false;
  if (CM.selB && CM.sel) { removeBalloon(CM.sel, CM.selB); CM.selB = null; }
  else if (CM.selX) { pg.sfx.splice(pg.sfx.indexOf(CM.selX), 1); CM.selX = null; }
  else if (CM.sel) { const p = CM.sel, q = pageOfPanel(p); morph(() => removePanel(q, p)); CM.sel = null; }
  else return false;
  syncComicUI(); deskChanged(); comicSaved(); return true;
}

/* ---------- the hand on the desk ---------- */
function initPageView() {
  const vp = $('#viewport'); if (!vp || $('#pageView')) return;
  const el = document.createElement('div'); el.id = 'pageView'; el.hidden = true;
  const b = (act, icon, label, cls = '') => `<button class="pvb ${cls}" type="button" data-act="${act}" title="${tr(label)}" aria-label="${tr(label)}">${icon ? deskIcon(icon) : ''}</button>`;
  el.innerHTML = `<canvas></canvas>
    <div class="pvtools" id="pvTools" role="toolbar" aria-label="${tr('Mesa del cómic')}">${b('undo', 'undo', 'Deshacer (Ctrl+Z)')}${b('redo', 'redo', 'Rehacer (Ctrl+Mayús+Z)')}<i></i>${b('zoomOut', 'minus', 'Alejar')}<button class="pvb pct" type="button" data-act="fit" title="${tr('Ajustar a la pantalla')}">100 %</button>${b('zoomIn', 'plus', 'Acercar (Ctrl+rueda)')}<i></i>${b('spread', 'book', 'Doble página')}${b('shots', 'film', 'Planos de la película')}${b('script', 'script', 'Guion de la página')}</div>
    <div class="pvbar" id="pvBar" hidden><button class="pvb main" type="button" data-act="edit">${deskIcon('cube')}<span></span></button>${b('balloon', 'talk', 'Añadir bocadillo')}${b('cutH', 'cutH', 'Partir ─')}${b('cutV', 'cutV', 'Partir │')}${b('cutS', 'cutS', 'Partir ╱')}${b('link', 'film', 'Enlazar un plano de la película')}${b('del', 'trash', 'Quitar la viñeta')}</div>`;
  vp.appendChild(el); pv.cv = el.querySelector('canvas'); pv.g = pv.cv.getContext('2d');
  pv.cv.setAttribute('aria-label', tr('Página del cómic')); pv.cv.tabIndex = 0;
  new ResizeObserver(() => pageOn() && drawPage()).observe(el);
  // the desk's own toolbar
  $('#pvTools').onclick = e => { const a = e.target.closest('[data-act]')?.dataset.act; if (!a) return;
    if (a === 'undo') comicUndo(-1); else if (a === 'redo') comicUndo(1); else if (a === 'zoomIn') setZoom(pv.zoom * 1.25); else if (a === 'zoomOut') setZoom(pv.zoom / 1.25); else if (a === 'fit') setZoom(1);
    else if (a === 'spread') { pv.spread = !pv.spread; store.set('cdp.cmSpread', pv.spread); pv.panX = pv.panY = 0; syncDeskTools(); drawPage(); }
    else if (a === 'script') toggleDeskPane('#pvScript', 'cdp.cmScript'); else if (a === 'shots') toggleDeskPane('#pvShots', 'cdp.cmShots'); };
  // the panel's toolbar
  const bar = $('#pvBar');
  bar.onpointerdown = e => e.stopPropagation();
  bar.onclick = e => { const a = e.target.closest('[data-act]')?.dataset.act, p = bar._p; if (!a || !p) return; CM.sel = p; const pg = pageOfPanel(p);
    if (a === 'edit') openPanelScene(p);
    else if (a === 'balloon') { const s = panelShot(p), nb = {id: newId('b'), kind: 'speech', text: tr('…'), ci: s && s.scene.chars.length ? 0 : null, x: comic().rtl ? .72 : .28, y: .16 + p.balloons.length * .1, size: 9}; p.balloons.push(nb); CM.selB = nb; syncComicUI(); deskChanged(); comicSaved(); const t = $('#cmText'); if (t && t.offsetParent) { t.focus(); t.select(); } }
    else if (/^cut/.test(a)) { let q = null; morph(() => { q = splitPanel(pg, p, a === 'cutH' ? 'h' : a === 'cutV' ? 'v' : 's1'); }, {parent: p.id}); if (!q) toast(tr('Esta viñeta es demasiado pequeña para partirla.')); else { CM.cache.clear(); comicSaved(); deskChanged(); } }
    else if (a === 'link') { const sh = $('#pvShots'); if (sh && sh.hidden) toggleDeskPane('#pvShots', 'cdp.cmShots'); toast(tr('Arrastra un plano a la viñeta (o tócalo para ponerlo en la elegida).')); }
    else if (a === 'del') deleteSelection();
    syncComicUI(); drawPage(); };
  const at = e => { const r = pv.cv.getBoundingClientRect(); return [(e.clientX - r.left) * pv.dpr, (e.clientY - r.top) * pv.dpr]; };
  const cursor = c => { if (pv.cv.style.cursor !== c) pv.cv.style.cursor = c; };
  pv.cv.addEventListener('pointerdown', e => {
    pv.ptrs.set(e.pointerId, at(e)); pv.cv.focus({preventScroll: true});
    if (pv.ptrs.size === 2) { const [a, b2] = [...pv.ptrs.values()]; pv.drag = {kind: 'pinch', d0: Math.hypot(a[0] - b2[0], a[1] - b2[1]), z0: pv.zoom}; return; }
    const [x, y] = at(e); e._x = x; e._y = y; const E = entryAt(x, y); if (E && E.i !== CM.page) { CM.page = E.i; CM.selB = CM.selX = null; }
    const c0 = cornerAt(x, y), h = c0 ? null : pageHit(x, y), ed = c0 || (h && (h.b || h.x)) ? null : edgeAt(x, y);
    if (c0) pv.drag = startShapeDrag('corner', c0, e);
    else if (h && h.b) { CM.sel = h.p; CM.selB = h.b; CM.selX = null; pv.drag = {kind: 'balloon', b: h.b, p: h.p, x, y, bx: h.b.x, by: h.b.y}; }
    else if (h && h.x) { CM.selX = h.x; CM.selB = null; pv.drag = {kind: 'sfx', sfx: h.x, x, y, bx: h.x.x, by: h.x.y}; }
    else if (ed) { CM.sel = ed.p; CM.selB = CM.selX = null; pv.drag = startShapeDrag('edge', ed, e); }
    else if (h && h.p) { CM.sel = h.p; CM.selB = CM.selX = null; pv.drag = {kind: 'panel', p: h.p, x, y}; }
    else { CM.sel = CM.selB = CM.selX = null; pv.drag = {kind: 'pan', x, y, px: pv.panX, py: pv.panY}; }
    pv.cv.setPointerCapture(e.pointerId); syncComicUI(); deskChanged();
  });
  pv.cv.addEventListener('pointermove', e => {
    const [x, y] = at(e); if (pv.ptrs.has(e.pointerId)) pv.ptrs.set(e.pointerId, [x, y]); const D = pv.drag;
    if (!D) { // hovering: what would be taken
      const c0 = cornerAt(x, y), h = c0 ? null : pageHit(x, y), ed = c0 || (h && (h.b || h.x)) ? null : edgeAt(x, y), hv = h && h.p && !h.b ? h.p : null;
      const edge = ed ? {...ed, set: moveSet(pageOfPanel(ed.p), ed.p, [ed.j, (ed.j + 1) % panelPts(ed.p).length], e.altKey, true)} : null;
      if (hv !== pv.hover || (edge?.p !== pv.edge?.p || edge?.j !== pv.edge?.j)) { pv.hover = hv; pv.edge = edge; drawPage(); }
      if (c0) cursor('move'); else if (h && (h.b || h.x)) cursor('grab'); else if (ed) { const P = panelPts(ed.p), d = unit(P[ed.j], P[(ed.j + 1) % P.length]); cursor(Math.abs(d[0]) > Math.abs(d[1]) ? 'ns-resize' : 'ew-resize'); }
      else if (h && h.p) cursor('pointer'); else cursor(pv.zoom > 1 ? 'grab' : 'default');
      return; }
    if (D.kind === 'pinch') { const [a, b2] = [...pv.ptrs.values()]; if (b2) { const d = Math.hypot(a[0] - b2[0], a[1] - b2[1]); setZoom(D.z0 * d / D.d0, (a[0] + b2[0]) / 2, (a[1] + b2[1]) / 2); } return; }
    if (D.kind === 'edge' || D.kind === 'corner') { e._x = x; e._y = y; moveShapeDrag(D, x, y, e); drawPage(); return; }
    if (D.kind === 'balloon') { const B = panelBox(D.p); D.b.x = clamp(D.bx + (x - D.x) / (B.w * pv.k), .05, .95); D.b.y = clamp(D.by + (y - D.y) / (B.h * pv.k), .05, .95);
      const h = pageHit(x, y), over = h && h.p && h.p !== D.p && !h.b ? h.p : null; pv.drop = over ? {p: over, label: tr('Soltar: el bocadillo pasa a esta viñeta')} : null; D.over = over; drawPage(); return; }
    if (D.kind === 'sfx') { D.sfx.x = D.bx + (x - D.x) / pv.k; D.sfx.y = D.by + (y - D.y) / pv.k; drawPage(); return; }
    if (D.kind === 'pan') { if (pv.zoom > 1 || Math.hypot(x - D.x, y - D.y) > 4) { pv.panX = D.px + x - D.x; pv.panY = D.py + y - D.y; cursor('grabbing'); drawPage(); } return; }
    if (D.kind === 'panel') {
      const img = (CM.last.get(D.p.id) || {}).img;
      if (!D.swap && Math.hypot(x - D.x, y - D.y) > 7 * pv.dpr && img) { D.swap = true; cursor('grabbing'); }
      if (D.swap) { pv.ghost = {img, x, y}; const h = pageHit(x, y), over = h && h.p && h.p !== D.p ? h.p : null; pv.drop = over ? {p: over, label: panelShot(over) ? tr('Soltar: intercambiar') : tr('Soltar: mover aquí')} : null; D.over = over; drawPage(); }
    }
  });
  const end = e => {
    pv.ptrs.delete(e.pointerId); const D = pv.drag; if (!D) return; pv.drag = null; pv.guides = []; pv.ghost = null; pv.drop = null; const [x, y] = at(e);
    if (D.kind === 'pinch') { if (pv.ptrs.size) pv.drag = null; return; }
    if ((D.kind === 'edge' || D.kind === 'corner') && D.moved) { CM.cache.clear(); comicSaved(); }
    else if (D.kind === 'balloon') { if (D.over) { rehomeBalloon(D.b, D.p, D.over, x, y); pulsePanel(D.over); } comicSaved(); }
    else if (D.kind === 'sfx') comicSaved();
    else if (D.kind === 'panel' && D.swap && D.over) {
      const a = D.p, b2 = D.over, ra = pxRect(a), rb = pxRect(b2), ia = (CM.last.get(a.id) || {}).img, ib = (CM.last.get(b2.id) || {}).img;
      swapContents(a, b2); flyFrom(b2, {x: x - (ra.w * .25), y: y - (ra.h * .25), w: ra.w * .5, h: ra.h * .5}, ia); if (ib) flyFrom(a, rb, ib);
      CM.sel = b2; syncComicUI(); comicSaved();
    }
    cursor('default'); deskChanged();
  };
  pv.cv.addEventListener('pointerup', end); pv.cv.addEventListener('pointercancel', end);
  pv.cv.addEventListener('pointerleave', () => { if (!pv.drag && (pv.hover || pv.edge)) { pv.hover = null; pv.edge = null; drawPage(); } });
  pv.cv.addEventListener('dblclick', e => { const [x, y] = at(e), h = pageHit(x, y); if (h && h.b) { CM.selB = h.b; syncComicUI(); const t = $('#cmText'); if (t) t.focus(); } else if (h && h.p) openPanelScene(h.p); else setZoom(1); });
  pv.cv.addEventListener('wheel', e => { e.preventDefault(); const [x, y] = at(e);
    if (e.ctrlKey || e.metaKey) setZoom(pv.zoom * Math.exp(-e.deltaY * .0022), x, y);
    else if (pv.zoom > 1.001) { pv.panX -= e.deltaX * pv.dpr; pv.panY -= e.deltaY * pv.dpr; drawPage(); }
    else { const now = performance.now(); if (Math.abs(e.deltaY) > 25 && now - (pv.wheelT || 0) > 450) { pv.wheelT = now; goPage(CM.page + (e.deltaY > 0 ? 1 : -1) * (pv.spread ? 2 : 1)); } } }, {passive: false});
  // keys, before the stage's own (while the page is shown)
  addEventListener('keydown', e => {
    if (!pageOn() || (typeof topModal === 'function' && topModal()) || e.target.matches('input,textarea,select,[contenteditable]')) return;
    const k = e.key, mod = e.ctrlKey || e.metaKey; let done = true;
    if (mod && k.toLowerCase() === 'z' && !e.shiftKey) { if (comicUndo(-1)) toast(tr('Deshecho')); }
    else if (mod && (k.toLowerCase() === 'y' || (k.toLowerCase() === 'z' && e.shiftKey))) { if (comicUndo(1)) toast(tr('Rehecho')); }
    else if (mod && (k === '0')) setZoom(1); else if (mod && (k === '+' || k === '=')) setZoom(pv.zoom * 1.25); else if (mod && k === '-') setZoom(pv.zoom / 1.25);
    else if (mod) done = false;
    else if (k === 'Delete' || k === 'Backspace') done = deleteSelection();
    else if (k === 'Enter' && CM.sel) openPanelScene(CM.sel);
    else if (k === 'Escape') { if (CM.selB || CM.selX) CM.selB = CM.selX = null; else if (CM.sel) CM.sel = null; else done = false; syncComicUI(); drawPage(); }
    else if (k === 'PageDown') goPage(CM.page + (pv.spread ? 2 : 1)); else if (k === 'PageUp') goPage(CM.page - (pv.spread ? 2 : 1));
    else if (/^Arrow/.test(k)) {
      const s = e.shiftKey ? 5 : 1, dx = k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : 0, dy = k === 'ArrowUp' ? -1 : k === 'ArrowDown' ? 1 : 0;
      if (CM.selB && CM.sel) { CM.selB.x = clamp(CM.selB.x + dx * .01 * s, .05, .95); CM.selB.y = clamp(CM.selB.y + dy * .01 * s, .05, .95); comicSaved(); drawPage(); }
      else if (CM.selX) { CM.selX.x += dx * s; CM.selX.y += dy * s; comicSaved(); drawPage(); }
      else if (dx) goPage(CM.page + dx * (comic().rtl ? -1 : 1) * (pv.spread ? 2 : 1)); else done = false;
    } else done = false;
    if (done) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  pv.spread = !!store.get('cdp.cmSpread', false);
  if (typeof buildTrackerUI === 'function') buildTrackerUI(el);
}
function toggleDeskPane(sel, key, on) { const el = $(sel); if (!el) return; el.hidden = on == null ? !el.hidden : !on; store.set(key, !el.hidden); if (!el.hidden && sel === '#pvScript') renderScript(true); if (!el.hidden && sel === '#pvShots') renderShots(); syncDeskTools(); drawPage(); }
