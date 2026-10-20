/* ======================= the comic: shapes of panels and balloons =======================
   A panel is any polygon on the page, not only a rectangle: slanted pages (the gutters tilted), a panel split in two
   by a cut (across, down, or slanted), a small one set into the corner of another, one that bleeds off the paper, one
   the characters break out of. Its rectangle (x, y, w, h) is the picture's (what the camera frames); its outline
   (poly) clips it. Its border is ink, thick, by hand, rounded, a cloud (a memory), dashed (a dream) or none.
   Balloons: speech, thought, shout, whisper, radio (electric), trembling, black (a monster's), caption and narration;
   a tail to the speaker, out of the panel (they are off screen) or none; and joined balloons (one speech in several
   breaths), drawn as one outline with a neck between them.
     panel   … poly?: [[x, y] mm], border?: thick|rough|round|cloud|dashed|none, bleed?, breakout?, inset?
     balloon … tail?: off|none, join?: (the id of the balloon it follows) */
const PANEL_BORDERS = [['', 'Tinta'], ['thick', 'Gruesa'], ['rough', 'A mano'], ['round', 'Redondeada'], ['cloud', 'Nube (recuerdo)'], ['dashed', 'Discontinua (sueño)'], ['none', 'Sin borde']];
const PANEL_CUTS = [['h', 'Partir ─'], ['v', 'Partir │'], ['s1', 'Partir ╱'], ['s2', 'Partir ╲']];
const BALLOON_TAILS = [['', 'Al personaje'], ['off', 'Fuera de cuadro'], ['none', 'Sin cola']];
const BOXY = new Set(['caption', 'narration']);
const BREAKOUT = 1.35;  // (how far past its panel a figure may go: the picture drawn this much wider)

/* ---------- polygons, in mm: [[x, y], …] ---------- */
const rectPts = r => [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
const polyArea = pts => pts.reduce((a, p, i) => { const q = pts[(i + 1) % pts.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
function polyBox(pts) { const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), x = Math.min(...xs), y = Math.min(...ys); return {x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y}; }
function inPoly(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside; }
  return inside;
}
// the part of a polygon where n·p ≥ d (Sutherland–Hodgman)
function clipHalf(pts, n, d) {
  const out = [], side = p => p[0] * n[0] + p[1] * n[1] - d;
  pts.forEach((a, i) => { const b = pts[(i + 1) % pts.length], sa = side(a), sb = side(b);
    if (sa >= 0) out.push(a);
    if ((sa >= 0) !== (sb >= 0)) { const t = sa / (sa - sb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); } });
  return out;
}
// a polygon moved in by d on every side (its corners where the moved sides meet)
function insetPoly(pts, d) {
  const n = pts.length, s = Math.sign(polyArea(pts)) || 1;
  const L = pts.map((a, i) => { const b = pts[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [[a[0] - dy / l * s * d, a[1] + dx / l * s * d], [dx, dy]]; });
  return pts.map((_, i) => { const [p1, d1] = L[(i - 1 + n) % n], [p2, d2] = L[i], den = d1[0] * d2[1] - d1[1] * d2[0];
    if (Math.abs(den) < 1e-9) return p2;
    const t = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / den; return [p1[0] + d1[0] * t, p1[1] + d1[1] * t]; });
}
const hashStr = s => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
const rnd01 = n => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };

/* ---------- a panel's outline ---------- */
// as drawn: its own polygon or its rectangle; out past the paper's edge where it bleeds and touches the margin
function panelPts(p, c = comic()) {
  let pts = p.poly ? p.poly.map(q => [...q]) : rectPts(p);
  if (p.bleed) { const P = c.page, [mt, mr, mb, ml] = P.margin, e = .6, b = P.bleed || 3;
    pts = pts.map(([x, y]) => [x <= ml + e ? -b : x >= P.w - mr - e ? P.w + b : x, y <= mt + e ? -b : y >= P.h - mb - e ? P.h + b : y]); }
  // (on screen, a panel that changed shape glides there from its old outline: see 36e)
  const tw = CM.twOn && CM.tw.get(p.id); return tw ? tweenPts(tw, pts) : pts;
}
// the picture's rectangle (mm): what the camera frames, the balloons' room
const panelBox = p => polyBox(panelPts(p));
// a new outline for a panel: its rectangle follows (a plain rectangle keeps no polygon)
function setPanelPoly(p, pts) {
  pts = pts.map(([x, y]) => [+x.toFixed(2), +y.toFixed(2)]); const B = polyBox(pts), near = (a, b) => Math.abs(a - b) < .02;
  Object.assign(p, {x: +B.x.toFixed(2), y: +B.y.toFixed(2), w: +B.w.toFixed(2), h: +B.h.toFixed(2)});
  if (pts.length === 4 && pts.every(([x, y]) => (near(x, B.x) || near(x, B.x + B.w)) && (near(y, B.y) || near(y, B.y + B.h)))) delete p.poly; else p.poly = pts;
  return p;
}
// the outline in px (k px per mm, offset ox, oy): rounded corners or a cloud when the border is one
function panelPath(p, k, ox, oy) {
  const pts = panelPts(p).map(([x, y]) => [ox + x * k, oy + y * k]), P = new Path2D(), n = pts.length, bd = p.border;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (bd === 'round') {
    P.moveTo(...mid(pts[n - 1], pts[0]));
    pts.forEach((v, i) => { const nx = pts[(i + 1) % n], pv = pts[(i - 1 + n) % n]; P.arcTo(v[0], v[1], ...mid(v, nx), Math.min(3.5 * k, len(v, nx) / 2, len(v, pv) / 2)); });
  } else if (bd === 'cloud') {
    // bumps along each side (inside the outline, so the picture keeps its place): the frame of a memory
    const r = 2.6 * k, q = insetPoly(pts, r * .9), s = Math.sign(polyArea(q)) || 1;
    q.forEach((a, i) => { const b = q[(i + 1) % q.length], L = len(a, b) || 1, m = Math.max(1, Math.round(L / (r * 1.8))), ux = (b[1] - a[1]) / L * s, uy = -(b[0] - a[0]) / L * s;
      for (let j = 0; j < m; j++) { const s0 = [a[0] + (b[0] - a[0]) * j / m, a[1] + (b[1] - a[1]) * j / m], c0 = [a[0] + (b[0] - a[0]) * (j + .5) / m, a[1] + (b[1] - a[1]) * (j + .5) / m], a0 = Math.atan2(s0[1] - c0[1], s0[0] - c0[0]);
        const cw = Math.cos(a0 + Math.PI / 2) * ux + Math.sin(a0 + Math.PI / 2) * uy > 0;  // (each bump outwards)
        if (!i && !j) P.moveTo(...s0); P.arc(c0[0], c0[1], L / m / 2, a0, a0 + (cw ? Math.PI : -Math.PI), !cw); } });
  } else pts.forEach((v, i) => i ? P.lineTo(...v) : P.moveTo(...v));
  P.closePath(); return P;
}
// its border, in the panel's style
function strokePanel(g, p, path, k, ox, oy) {
  const bd = p.border; if (bd === 'none') return;
  g.save(); g.strokeStyle = '#141210'; g.lineJoin = 'round'; g.lineCap = 'round'; g.lineWidth = Math.max(1, k * (bd === 'thick' ? 1.2 : .5));
  if (bd === 'dashed') g.setLineDash([k * 2.4, k * 1.5]);
  if (bd === 'rough') {
    // by hand: two passes that wander a little off the line, never quite closing
    const pts = panelPts(p).map(([x, y]) => [ox + x * k, oy + y * k]), seed = hashStr(p.id) % 997;
    for (const [pass, wd] of [[0, .55], [1, .28]]) { g.lineWidth = Math.max(1, k * wd); g.beginPath();
      pts.forEach((a, i) => { const b = pts[(i + 1) % pts.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), m = Math.max(2, Math.round(L / (k * 3))), nx = -(b[1] - a[1]) / (L || 1), ny = (b[0] - a[0]) / (L || 1);
        for (let j = 0; j <= m; j++) { const t = j / m, w = (rnd01(seed + i * 31 + j * 7 + pass * 101) - .5) * k * .5, over = (j === 0 ? -1 : j === m ? 1 : 0) * k * (.6 + pass * .5);
          const x = a[0] + (b[0] - a[0]) * t + nx * w + (b[0] - a[0]) / (L || 1) * over, y = a[1] + (b[1] - a[1]) * t + ny * w + (b[1] - a[1]) / (L || 1) * over; j ? g.lineTo(x, y) : g.moveTo(x, y); } });
      g.stroke(); }
  } else g.stroke(path);
  g.restore();
}
// the order panels are drawn in: the ones set into others last (over them)
const drawOrder = pg => [...pg.panels].sort((a, b) => (a.inset ? 1 : 0) - (b.inset ? 1 : 0));
// the panel under a point of the page (mm): the topmost
function panelAt(pg, x, y) { const L = drawOrder(pg); for (let i = L.length - 1; i >= 0; i--) if (inPoly(panelPts(L[i]), x, y)) return L[i]; return null; }

/* ---------- making panels ---------- */
// a panel cut in two by a line through its middle (across, down, or slanted rising ╱ or falling ╲ along its longer
// side), with the page's gutter between the halves: the first in reading order keeps what it showed, the other starts empty
function splitPanel(pg, p, cut, c = comic()) {
  const pts = p.poly ? p.poly.map(q => [...q]) : rectPts(p), B = polyBox(pts), cx = B.x + B.w / 2, cy = B.y + B.h / 2, tilt = 14 * DEG;
  const vert = cut === 'v' || (cut[0] === 's' && B.w >= B.h), sg = cut === 's1' ? 1 : cut === 's2' ? -1 : 0, ang = vert ? Math.PI / 2 + sg * tilt : -sg * tilt;
  const n = [-Math.sin(ang), Math.cos(ang)], d = n[0] * cx + n[1] * cy, gap = (vert ? c.page.gutter[0] : c.page.gutter[1]) / 2;
  const A = clipHalf(pts, [-n[0], -n[1]], -(d - gap)), Bq = clipHalf(pts, n, d + gap);
  if (A.length < 3 || Bq.length < 3 || Math.abs(polyArea(A)) < 25 || Math.abs(polyArea(Bq)) < 25) return null;
  const first = (a, b) => { const ba = polyBox(a), bb = polyBox(b); return Math.abs(ba.y - bb.y) > 4 ? ba.y < bb.y : (c.rtl ? ba.x > bb.x : ba.x < bb.x); };
  const [keep, other] = first(A, Bq) ? [A, Bq] : [Bq, A];
  // (the balloons stay where they were on the page, inside the half that keeps them)
  const R0 = panelBox(p), abs = p.balloons.map(b => [b, R0.x + b.x * R0.w, R0.y + b.y * R0.h]);
  setPanelPoly(p, keep); const R1 = panelBox(p); for (const [b, x, y] of abs) { b.x = clamp((x - R1.x) / R1.w, .08, .92); b.y = clamp((y - R1.y) / R1.h, .08, .92); }
  const q = setPanelPoly({id: newId('p'), x: 0, y: 0, w: 1, h: 1, shot: null, link: null, f: 0, balloons: [], ...(p.border ? {border: p.border} : {}), ...(p.bleed ? {bleed: true} : {})}, other);
  pg.panels.splice(pg.panels.indexOf(p) + 1, 0, q); CM.cache.clear(); return q;
}
// a small panel set into the corner a page reads last (a detail, a reaction), with a white edge round it
function insetPanel(pg, p, c = comic()) {
  const B = p ? polyBox(p.poly || rectPts(p)) : {x: c.page.margin[3], y: c.page.margin[0], w: c.page.w - c.page.margin[1] - c.page.margin[3], h: c.page.h - c.page.margin[0] - c.page.margin[2]};
  const w = B.w * .38, h = Math.min(B.h * .42, w * 1.1), m = 3, x = c.rtl ? B.x + m : B.x + B.w - w - m, y = B.y + B.h - h - m;
  const q = {id: newId('p'), x: +x.toFixed(2), y: +y.toFixed(2), w: +w.toFixed(2), h: +h.toFixed(2), shot: null, link: null, f: 0, balloons: [], inset: true};
  pg.panels.push(q); return q;
}
function removePanel(pg, p) { const i = pg.panels.indexOf(p); if (i < 0) return false; pg.panels.splice(i, 1); return true; }

/* ---------- balloons ---------- */
// a balloon measured and placed in its panel's rectangle R (px): its text in rows, its centre and half sizes
function balloonGeom(g, b, R, k) {
  const fs = (b.size || 9) / 72 * 25.4 * k, pad = fs * .7, box = BOXY.has(b.kind); g.font = balloonFont(fs, b);
  const maxW = Math.min(R.w * (box ? .8 : .62), fs * (box ? 18 : 14)), rows = wrapText(g, b.text || '…', maxW), tw = Math.max(fs * 2, ...rows.map(r => g.measureText(r).width)), th = rows.length * fs * 1.12;
  const grow = b.kind === 'shout' ? 1.26 : b.kind === 'radio' ? 1.22 : 1.18;
  const rx = box ? tw / 2 + pad : (tw / 2 + pad) * grow, ry = box ? th / 2 + pad * .7 : (th / 2 + pad) * grow, mg = k * 1.5;
  // (kept inside its panel, whatever its text grew to)
  const cx = clamp(R.x + b.x * R.w, R.x + rx + mg, Math.max(R.x + rx + mg, R.x + R.w - rx - mg)), cy = clamp(R.y + b.y * R.h, R.y + ry + mg, Math.max(R.y + ry + mg, R.y + R.h - ry - mg));
  return {b, fs, rows, th, cx, cy, rx, ry};
}
// its body as a path
function balloonBody(G) {
  const {b, cx, cy, rx, ry} = G, P = new Path2D(), ring = (n, f) => { for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2, r = f(i, a); const x = cx + Math.cos(a) * rx * r, y = cy + Math.sin(a) * ry * r; i ? P.lineTo(x, y) : P.moveTo(x, y); } };
  const seed = hashStr(b.id) % 991;
  if (b.kind === 'caption') P.rect(cx - rx, cy - ry, rx * 2, ry * 2);
  else if (b.kind === 'narration') { const r = Math.min(rx, ry) * .45; P.moveTo(cx - rx + r, cy - ry); P.arcTo(cx + rx, cy - ry, cx + rx, cy + ry, r); P.arcTo(cx + rx, cy + ry, cx - rx, cy + ry, r); P.arcTo(cx - rx, cy + ry, cx - rx, cy - ry, r); P.arcTo(cx - rx, cy - ry, cx + rx, cy - ry, r); }
  else if (b.kind === 'shout') ring(36, i => (i % 2 ? 1 : 1.24) * (1 + .06 * Math.sin(i * 7.3)));
  else if (b.kind === 'radio') ring(44, i => (i % 2 ? .96 : 1.1) + (rnd01(seed + i) - .5) * .1);  // (sharp and uneven: a voice through a machine)
  else if (b.kind === 'wavy') ring(96, (i, a) => 1 + .045 * Math.sin(a * 13 + seed) + .02 * Math.sin(a * 29));  // (trembling: fear, cold, weakness)
  else if (b.kind === 'thought') { const n = 11; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, x = cx + Math.cos(a) * rx * .92, y = cy + Math.sin(a) * ry * .92, r = Math.min(rx, ry) * .42; P.moveTo(x + r, y); P.arc(x, y, r, 0, Math.PI * 2); } P.moveTo(cx + rx * .9, cy); P.ellipse(cx, cy, rx * .9, ry * .9, 0, 0, Math.PI * 2); }
  else P.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  return P;
}
// its tail: to the speaker's mouth (stopping short of it), or out of the panel (they are off screen); thought, as
// little bubbles; radio, a lightning bolt
function balloonTail(G, anchor, R, k) {
  const {b, cx, cy, rx, ry, fs} = G; if (BOXY.has(b.kind) || b.tail === 'none') return null;
  let tx, ty, tipD;
  if (b.tail === 'off') { const e = [[cx - R.x, -1, 0], [R.x + R.w - cx, 1, 0], [cy - R.y, 0, -1], [R.y + R.h - cy, 0, 1]].sort((a, c) => a[0] - c[0])[0]; tx = cx + e[1] * (e[0] + k * 3); ty = cy + e[2] * (e[0] + k * 3); }
  else if (anchor) { tx = R.x + clamp(anchor.x, .03, .97) * R.w; ty = R.y + clamp(anchor.y, .03, .97) * R.h; }  // (a head out of the picture: towards it, to the panel's edge)
  else return null;
  const dx = tx - cx, dy = ty - cy, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, wb = Math.min(rx, ry) * .32;
  tipD = b.tail === 'off' ? d : Math.max(Math.min(d * .72, d - fs * 1.2), Math.min(rx, ry) * 1.1);
  const tip = [cx + ux * tipD, cy + uy * tipD], P = new Path2D();
  if (b.kind === 'thought') {
    // little bubbles from the cloud's edge towards the head, smaller as they go
    const m = Math.min(rx, ry), e = .92 / Math.hypot(ux / rx, uy / ry), rs = [m * .2, m * .13, m * .08]; let at = e + m * .1, bubbles = [];
    for (const r of rs) { at += r; bubbles.push([cx + ux * at, cy + uy * at, r]); at += r + m * .12; }
    return {bubbles};
  }
  if (b.kind === 'radio') {
    // a zigzag that thins to its point
    const st = [[0, 1], [.42, .8], [.38, .62], [.72, .4], [.66, .3], [1, 0]], L = tipD, side = (s, t, w) => [cx + ux * L * t - uy * (s * wb * w + zig(t)), cy + uy * L * t + ux * (s * wb * w + zig(t))];
    function zig(t) { return t > .3 && t < .5 ? wb * .9 : t > .6 && t < .8 ? -wb * .7 : 0; }
    const left = st.map(([t, w]) => side(1, t, w)), right = st.map(([t, w]) => side(-1, t, w)).reverse();
    [...left, ...right].forEach((v, i) => i ? P.lineTo(...v) : P.moveTo(...v)); P.closePath(); return {path: P, bubbles: []};
  }
  // a tail that curves a little, as a pen draws it
  const b1 = [cx - uy * wb, cy + ux * wb], b2 = [cx + uy * wb, cy - ux * wb], bend = tipD * .12;
  P.moveTo(...b1); P.quadraticCurveTo(cx + ux * tipD * .55 - uy * (wb * .4 + bend), cy + uy * tipD * .55 + ux * (wb * .4 + bend), ...tip);
  P.quadraticCurveTo(cx + ux * tipD * .55 + uy * (wb * .2 - bend), cy + uy * tipD * .55 - ux * (wb * .2 - bend), ...b2); P.closePath();
  return {path: P, bubbles: []};
}
// the neck between two joined balloons
function balloonNeck(A, B) {
  const dx = B.cx - A.cx, dy = B.cy - A.cy, d = Math.hypot(dx, dy) || 1, w = Math.min(A.rx, A.ry, B.rx, B.ry) * .3, nx = -dy / d * w, ny = dx / d * w, P = new Path2D();
  P.moveTo(A.cx + nx, A.cy + ny); P.lineTo(B.cx + nx, B.cy + ny); P.lineTo(B.cx - nx, B.cy - ny); P.lineTo(A.cx - nx, A.cy - ny); P.closePath(); return P;
}
// the balloons of a panel: the joined ones as one outline (each stroked twice as wide, then all filled: the inner
// lines vanish), each with its own text; anchors are where the speakers' heads are in the panel
function drawBalloons(g, list, R, anchors, k, selB) {
  const geo = list.map(b => balloonGeom(g, b, R, k)), byId = new Map(geo.map(G => [G.b.id, G])), out = [];
  const root = G => { let r = G, n = 0; while (r.b.join && byId.has(r.b.join) && byId.get(r.b.join) !== G && n++ < 24) r = byId.get(r.b.join); return r; };
  const groups = new Map(); for (const G of geo) { const r = root(G); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(G); }
  for (const [r, gs] of groups) {
    const lw = Math.max(1, k * (r.b.kind === 'shout' ? .4 : .3)), black = r.b.kind === 'black', paths = [], bubbles = [];
    for (const G of gs) {
      paths.push(balloonBody(G));
      const t = balloonTail(G, G.b.ci != null && anchors ? anchors[G.b.ci] : null, R, k); if (t) { if (t.path) paths.push(t.path); bubbles.push(...t.bubbles); }
      const prev = G.b.join && byId.get(G.b.join); if (prev && groups.get(r).includes(prev)) paths.push(balloonNeck(prev, G));
    }
    g.save(); g.lineJoin = 'round'; g.strokeStyle = '#141210'; g.lineWidth = lw * 2;
    if (r.b.kind === 'whisper') g.setLineDash([r.fs * .5, r.fs * .4]);
    for (const P of paths) g.stroke(P); g.setLineDash([]);
    g.fillStyle = black ? '#141210' : '#fff'; for (const P of paths) g.fill(P);
    g.lineWidth = lw; for (const [x, y, rr] of bubbles) { g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill(); g.stroke(); }
    for (const G of gs) {
      g.font = balloonFont(G.fs, G.b); g.fillStyle = black ? '#f4f1ea' : '#141210'; g.textAlign = 'center'; g.textBaseline = 'middle';
      G.rows.forEach((row, i) => g.fillText(row, G.cx, G.cy - G.th / 2 + G.fs * 1.12 * (i + .5)));
      if (selB === G.b) { g.strokeStyle = '#2b5a9e'; g.lineWidth = 2; g.setLineDash([5, 4]); g.strokeRect(G.cx - G.rx - 4, G.cy - G.ry - 4, G.rx * 2 + 8, G.ry * 2 + 8); g.setLineDash([]); }
      out.push({b: G.b, box: {x: G.cx - G.rx, y: G.cy - G.ry, w: G.rx * 2, h: G.ry * 2}});
    }
    g.restore();
  }
  return out;
}
// a balloon taken out: the one joined after it is joined to the one before
function removeBalloon(p, b) {
  const i = p.balloons.indexOf(b); if (i < 0) return; p.balloons.splice(i, 1);
  for (const x of p.balloons) if (x.join === b.id) { if (b.join) x.join = b.join; else delete x.join; }
}
// a balloon that goes on the same speech: below (and on, in reading order) the one it follows, joined to it, no tail
function addJoinedBalloon(p, b, c = comic()) {
  const n = {id: newId('b'), kind: b.kind === 'shout' || b.kind === 'black' ? b.kind : 'speech', text: tr('…'), ci: b.ci, x: clamp(b.x + (c.rtl ? -.14 : .14), .1, .9), y: clamp(b.y + .16, .1, .9), size: b.size || 9, join: b.id, tail: 'none'};
  p.balloons.splice(p.balloons.indexOf(b) + 1, 0, n); return n;
}

/* ---------- the panel's and the balloon's shape, in the Cómic tab ---------- */
function syncComicShapeUI() {
  const p = CM.sel, b = CM.selB; if (!$('#cmBorder')) return;
  if (p) { setPressed($('#cmBorder'), p.border || ''); $('#cmBleed').checked = !!p.bleed; $('#cmBreak').checked = !!p.breakout; }
  if (b) { setPressed($('#cmTail'), b.tail || ''); const i = p ? p.balloons.indexOf(b) : -1; $('#cmJoin').hidden = !!b.join || i < 1; $('#cmUnjoin').hidden = !b.join; }
}
function buildComicShapeUI() {
  if (!$('#cmBorder')) return;
  const changed = () => { CM.cache.clear(); drawPage(); syncComicUI(); comicSaved(); };
  const cuts = $('#cmCuts'); cuts.innerHTML = '';
  for (const [v, label] of PANEL_CUTS) { const btn = document.createElement('button'); btn.className = 'btn small'; btn.type = 'button'; btn.dataset.v = v; btn.textContent = tr(label);
    btn.onclick = () => { const pg = curPage(), p = CM.sel; if (!pg || !p) return; if (!splitPanel(pg, p, v)) { toast(tr('Esta viñeta es demasiado pequeña para partirla.')); return; } changed(); }; cuts.appendChild(btn); }
  chips($('#cmBorder'), PANEL_BORDERS, '', v => { const p = CM.sel; if (!p) return; if (v) p.border = v; else delete p.border; drawPage(); comicSaved(); });
  $('#cmBleed').onchange = e => { const p = CM.sel; if (!p) return; if (e.target.checked) p.bleed = true; else delete p.bleed; changed(); };
  $('#cmBreak').onchange = e => { const p = CM.sel; if (!p) return; if (e.target.checked) p.breakout = true; else delete p.breakout; changed(); };
  $('#cmInset').onclick = () => { const pg = curPage(); if (!pg) return; CM.sel = insetPanel(pg, CM.sel); CM.selB = null; changed(); };
  $('#cmDelPanel').onclick = () => { const pg = curPage(), p = CM.sel; if (!pg || !p) return; removePanel(pg, p); CM.sel = CM.selB = null; changed(); };
  chips($('#cmTail'), BALLOON_TAILS, '', v => { const b = CM.selB; if (!b) return; if (v) b.tail = v; else delete b.tail; drawPage(); comicSaved(); });
  $('#cmJoinAdd').onclick = () => { const p = CM.sel, b = CM.selB; if (!p || !b) return; CM.selB = addJoinedBalloon(p, b); drawPage(); syncComicUI(); comicSaved(); const t = $('#cmText'); t.focus(); t.select(); };
  $('#cmJoin').onclick = () => { const p = CM.sel, b = CM.selB; if (!p || !b) return; const prev = p.balloons[p.balloons.indexOf(b) - 1]; if (!prev) return; if (prev.join === b.id) delete prev.join; b.join = prev.id; if (!b.tail) b.tail = 'none'; drawPage(); syncComicUI(); comicSaved(); };
  $('#cmUnjoin').onclick = () => { const b = CM.selB; if (!b) return; delete b.join; if (b.tail === 'none') delete b.tail; drawPage(); syncComicUI(); comicSaved(); };
}
