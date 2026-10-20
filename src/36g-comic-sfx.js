/* ======================= the comic: sounds on the page =======================
   Onomatopoeia lettered the way letterers do them: each letter set on its own (so a sound can swell along the word,
   ride an arc or a wave, come at us in perspective, shake, rock), a double edge (white inside, ink outside), a fill
   that is flat, graded or in screentone dots, a drop shadow or a solid 3D block, and what goes round the letters (a
   jagged burst, debris, speed trails, sparks, a shudder, bubbles). Black and white by default, as in manga; colour if asked.
     sfx {id, text, x, y (its middle, mm on the page), size (letter height, mm), rot (deg),
          style?: one of SFX_STYLES (none: the first sounds' look, white letters with an ink edge, set whole),
          and over the style's own values, any of:
          grow (crescendo, -1..1.5), arc (-1..1), wave (0..1), persp (-1..1), jit (0..1), tilt (letters rocking, deg),
          slant (italic), track (spacing, em), edge (outline, em), outline: single|double|none, paint: solid|grad|tone,
          shadow: none|drop|depth, deco: none|burst|debris|trails|zigzag|shake|bubbles, font: bangers|neue|thin|jp,
          vert (letters stacked, for katakana), fill, ink (colours), seed (another throw of the shake)}
   On the desk (36e) the chosen sound has handles: dragged to move, the round one above to turn it, the corner to
   size it; a double click writes in it. */
const SFX_KEYS = ['grow', 'arc', 'wave', 'persp', 'jit', 'tilt', 'slant', 'track', 'edge', 'outline', 'paint', 'shadow', 'deco', 'font', 'vert', 'fill', 'fill2', 'ink'];
const SFX_BASE = {grow: 0, arc: 0, wave: 0, persp: 0, jit: 0, tilt: 0, slant: 0, track: 0, edge: .2, outline: 'single', paint: 'solid', shadow: 'none', deco: 'none', font: 'bangers', vert: false, fill: '#ffffff', ink: '#141210', rot: -8};
// the looks: what letterers reach for (classic is the old one, and what a sound saved without a style is drawn in)
const SFX_STYLES = {
  classic: {label: 'Clásica', sample: '¡BAM!'},
  impact: {label: 'Impacto', sample: '¡PUM!', deco: 'burst', outline: 'double', fill: '#141210', grow: .35, tilt: 5, edge: .15, rot: -10},
  boom: {label: 'Explosión', sample: 'BOOM', deco: 'debris', shadow: 'depth', paint: 'grad', grow: .9, jit: .3, edge: .22, track: -.02, rot: -6},
  speed: {label: 'Velocidad', sample: 'ZOOM', deco: 'trails', slant: .38, persp: .55, edge: .17, track: -.03, rot: -5},
  soft: {label: 'Susurro', sample: 'fiuu…', font: 'thin', fill: '#141210', ink: '#ffffff', edge: .16, wave: .35, track: .12, rot: -4},
  tremble: {label: 'Temblor', sample: 'BRRR', deco: 'shake', outline: 'double', fill: '#141210', jit: .55, tilt: 4, edge: .14, rot: 0},
  electric: {label: 'Eléctrico', sample: '¡BZZT!', deco: 'zigzag', outline: 'double', paint: 'tone', tilt: 12, jit: .2, edge: .15, rot: -4},
  cute: {label: 'Tierno', sample: '¡POP!', font: 'neue', deco: 'bubbles', shadow: 'drop', wave: .55, tilt: 8, edge: .3, rot: -6},
  manga: {label: 'Manga (katakana)', sample: 'ドン', font: 'jp', vert: true, outline: 'double', fill: '#141210', grow: .3, jit: .12, tilt: 4, edge: .13, track: -.06, rot: 0}
};
tLabels(SFX_STYLES);
// the fonts the letters come in: Bangers and Comic Neue come with the app; Japanese takes the system's bold gothic
const SFX_FONTS = {
  bangers: px => SFX_FONT(px),
  neue: px => `700 ${px}px "Comic Neue", ${css('--f-hand')}, sans-serif`,
  thin: px => `400 ${px}px "Comic Neue", ${css('--f-hand')}, sans-serif`,
  jp: px => `900 ${px}px "Hiragino Kaku Gothic ProN", "Hiragino Sans", "Yu Gothic", Meiryo, "Noto Sans CJK JP", "Noto Sans JP", Bangers, sans-serif`
};
// the words a letterer reaches for, in three languages, each with the look it usually has (the words themselves are
// never translated: they are the sound)
const SFX_CATALOG = [
  ['Español', [['¡PUM!', 'impact'], ['¡ZAS!', 'speed'], ['¡BUM!', 'boom'], ['¡CRAC!', 'impact'], ['¡PLAF!', 'impact'], ['¡ZUUM!', 'speed'], ['¡RING!', 'tremble'], ['¡BZZZ!', 'electric'], ['¡CHOF!', 'cute'], ['¡GLUP!', 'cute'], ['ÑAM', 'cute'], ['TOC TOC', 'classic'], ['¡AY!', 'classic'], ['GRRR', 'tremble'], ['shhh…', 'soft']]],
  ['English', [['BOOM', 'boom'], ['CRASH', 'impact'], ['POW!', 'impact'], ['WHAM!', 'impact'], ['WHOOSH', 'speed'], ['ZOOM', 'speed'], ['KA-BOOM!', 'boom'], ['ZAP!', 'electric'], ['RUMBLE', 'tremble'], ['POP!', 'cute'], ['BOING', 'cute'], ['THUD', 'classic'], ['SNAP', 'classic'], ['hush…', 'soft']]],
  ['日本語', [['ドン', 'manga'], ['ゴゴゴ', 'manga', {deco: 'shake', jit: .4}], ['ザッ', 'manga', {slant: .3}], ['バン', 'manga', {deco: 'burst'}], ['ドカーン', 'manga', {deco: 'debris', grow: .8}], ['ガシャン', 'manga'], ['ビュン', 'manga', {deco: 'trails', vert: false}], ['ゴロゴロ', 'manga', {wave: .4}], ['ドキドキ', 'manga', {deco: 'shake'}], ['キラキラ', 'manga', {deco: 'bubbles', fill: '#ffffff'}], ['シーン', 'manga', {font: 'jp', outline: 'single', grow: 0, jit: 0, tilt: 0}], ['ズーン', 'manga', {shadow: 'depth'}]]]
];
// the sliders of the tab: [key, label, min, max, step, shown as]
const pctF = v => Math.round(v * 100) + ' %', degF = v => Math.round(v) + '°';
const SFX_SLIDERS = [['size', 'Tamaño', 4, 80, 1, v => v + ' mm'], ['rot', 'Giro', -180, 180, 1, degF],
  ['grow', 'Crescendo', -1, 1.5, .05, pctF], ['arc', 'Curva', -1, 1, .05, pctF], ['wave', 'Onda', 0, 1, .05, pctF], ['persp', 'Perspectiva', -1, 1, .05, pctF],
  ['jit', 'Desorden', 0, 1, .05, pctF], ['tilt', 'Baile de las letras', 0, 30, 1, degF], ['slant', 'Inclinación', -.6, .6, .02, pctF], ['track', 'Espaciado', -.3, .6, .01, pctF], ['edge', 'Grosor del borde', 0, .5, .01, pctF]];
const SFX_CHIPS = {
  outline: ['#cmSfxOutline', [['single', 'Simple'], ['double', 'Doble'], ['none', 'Sin borde']]],
  paint: ['#cmSfxPaint', [['solid', 'Liso'], ['grad', 'Degradado'], ['tone', 'Trama']]],
  shadow: ['#cmSfxShadow', [['none', 'Ninguna'], ['drop', 'Proyectada'], ['depth', 'Relieve 3D']]],
  deco: ['#cmSfxDeco', [['none', 'Ninguno'], ['burst', 'Estallido'], ['debris', 'Metralla'], ['trails', 'Estela'], ['zigzag', 'Rayos'], ['shake', 'Vibración'], ['bubbles', 'Burbujas']]],
  font: ['#cmSfxFont', [['bangers', 'Bangers'], ['neue', 'Redonda'], ['thin', 'Fina'], ['jp', 'Japonesa']]]
};

/* ---------- the letters set ---------- */
// what a sound looks like: the base, its style, what was changed on it
function sfxParams(x) { const P = {...SFX_BASE, ...(SFX_STYLES[x.style] || SFX_STYLES.classic)}; for (const k of SFX_KEYS) if (x[k] !== undefined) P[k] = x[k]; return P; }
// a steady throw of the dice per sound (its shake stays the same from one drawing to the next, and in print)
function sfxRand(s) {
  let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return () => { h = Math.imul(h ^ h >>> 15, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}
// each letter's place (its middle), size and turn round the sound's middle, px; and the box the letters (with their
// edges and shadow) fill. A sound with no shaping is set whole, as the first sounds were
function sfxLayout(g, x, px) {
  const P = sfxParams(x), font = SFX_FONTS[P.font] || SFX_FONTS.bangers, text = String(x.text || ''), L = [...text], n = L.length, R = sfxRand((x.id || '') + ':' + (x.seed || 0));
  g.font = font(px); const E = P.edge * px, rim = (P.outline === 'double' ? 1.9 : P.outline === 'none' ? 0 : 1) * E / 2 + (P.shadow === 'depth' ? px * .15 : P.shadow === 'drop' ? px * .09 : 0);
  let G;
  if (!(P.grow || P.arc || P.wave || P.persp || P.jit || P.tilt || P.track || P.vert)) G = [{ch: text, x: 0, y: 0, s: 1, r: 0, w: g.measureText(text).width}];
  else {
    // sizes: the crescendo grows evenly along the word; perspective grows as things coming at us do
    const S = L.map((_, i) => { const t = n > 1 ? i / (n - 1) : .5, sg = Math.max(.25, 1 + P.grow * (t - .5)), sp = P.persp ? Math.pow(1 + Math.abs(P.persp) * 2, (P.persp > 0 ? t : 1 - t) - .5) : 1; return {t, sg, s: sg * sp}; });
    const W = L.map((ch, i) => g.measureText(ch).width), sp = i => P.track * px * S[i].s, adv = L.map((ch, i) => (P.vert ? px * 1.02 : W[i]) * S[i].s + sp(i));
    const T = adv.reduce((a, v) => a + v, 0) - (n ? sp(n - 1) : 0), th = P.arc * Math.PI * .9; let u = -T / 2;
    G = L.map((ch, i) => {
      const {t, sg} = S[i], c = u + (adv[i] - sp(i)) / 2; u += adv[i]; let a = c, p = 0, r = 0, s = S[i].s;
      // (along an arc: the letters stand on a circle, each turned to it)
      if (Math.abs(th) > .01) { const Rr = T / th, f = c / Rr; a = Rr * Math.sin(f); p = Rr * (1 - Math.cos(f)); r = P.vert ? -f : f; }
      if (P.wave) { const w = t * Math.PI * 2.5 + .6; p += Math.sin(w) * P.wave * px * .28; r += Math.cos(w) * P.wave * .3 * (P.vert ? -1 : 1); }
      if (!P.vert && P.grow) p -= (sg - 1) * px * .36;  // (the crescendo stands on one line: the letters grow up from it)
      r += (i % 2 ? -1 : 1) * P.tilt * DEG;
      if (P.jit) { a += (R() - .5) * P.jit * px * .14; p += (R() - .5) * P.jit * px * .34; r += (R() - .5) * P.jit * .55; s *= 1 + (R() - .5) * P.jit * .28; }
      return P.vert ? {ch, x: p, y: a, s, r, w: W[i] * s} : {ch, x: a, y: p, s, r, w: W[i] * s};
    });
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of G) { if (!q.ch.trim()) continue; const hw = q.w / 2 + Math.abs(P.slant) * px * q.s * .45 + rim, hh = px * q.s * .45 + rim, c = Math.cos(q.r), s = Math.sin(q.r);
    for (const [u, v] of [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]) { const X = q.x + u * c - v * s, Y = q.y + u * s + v * c; x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y); } }
  if (!isFinite(x0)) { x0 = y0 = -px * .4; x1 = y1 = px * .4; }
  const box = {x0, y0, x1, y1}, D = SFX_DECO[P.deco];
  return {P, font, G, E, box, full: D ? D.ext(box, px, P) : box};
}

/* ---------- what goes round the letters ---------- */
// a rounded rectangle round the letters (a superellipse): where bursts, debris, sparks and bubbles start from
const sfxRing = (b, px, add = .2) => ({cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, rx: (b.x1 - b.x0) / 2 * 1.2 + px * add, ry: (b.y1 - b.y0) / 2 * 1.2 + px * add});
const ringAt = (E, a) => { const c = Math.cos(a), s = Math.sin(a); return [E.cx + E.rx * Math.sign(c) * Math.sqrt(Math.abs(c)), E.cy + E.ry * Math.sign(s) * Math.sqrt(Math.abs(s))]; };
const growBox = (b, l, t, r, bt) => ({x0: b.x0 - l, y0: b.y0 - t, x1: b.x1 + r, y1: b.y1 + bt});
const ringBox = (b, px, add, out) => { const E = sfxRing(b, px, add); return {x0: E.cx - E.rx - out, y0: E.cy - E.ry - out, x1: E.cx + E.rx + out, y1: E.cy + E.ry + out}; };
// a stroke with a white edge under it (to stand out over the drawing)
function inkLine(g, path, w, ink) { g.save(); g.lineJoin = 'miter'; g.lineCap = 'round'; g.strokeStyle = '#fff'; g.lineWidth = w * 2.6; g.stroke(path); g.strokeStyle = ink; g.lineWidth = w; g.stroke(path); g.restore(); }
// a spike: a thin wedge from a point outwards
function wedge(g, X, Y, a, len, w) { g.beginPath(); g.moveTo(X + Math.cos(a + Math.PI / 2) * w, Y + Math.sin(a + Math.PI / 2) * w); g.lineTo(X + Math.cos(a) * len, Y + Math.sin(a) * len); g.lineTo(X + Math.cos(a - Math.PI / 2) * w, Y + Math.sin(a - Math.PI / 2) * w); g.closePath(); }
const SFX_DECO = {
  // impact: a jagged white burst behind, ink round it
  burst: {ext: (b, px) => ringBox(b, px, .2, px * .6), back(g, L, px, R) {
    const E = sfxRing(L.box, px), n = clamp(Math.round((E.rx + E.ry) * 2.4 / (px * .5)), 12, 44); g.beginPath();
    for (let i = 0; i < n * 2; i++) { const a = i / (n * 2) * Math.PI * 2, [X, Y] = ringAt(E, a), o = i % 2 ? 0 : px * (.3 + R() * .28); i ? g.lineTo(X + Math.cos(a) * o, Y + Math.sin(a) * o) : g.moveTo(X + Math.cos(a) * o, Y + Math.sin(a) * o); }
    g.closePath(); g.save(); g.fillStyle = '#fff'; g.fill(); g.lineJoin = 'miter'; g.strokeStyle = L.P.ink; g.lineWidth = Math.max(1, px * .055); g.stroke(); g.restore(); }},
  // explosion: lines flung out from the word, and chunks with them
  debris: {ext: (b, px) => ringBox(b, px, .1, px * 1.25), back(g, L, px, R) {
    const E = sfxRing(L.box, px, .1); g.save(); g.fillStyle = L.P.ink; g.strokeStyle = '#fff'; g.lineWidth = Math.max(1, px * .03);
    for (let i = 0; i < 22; i++) { const a = (i + R() * .7) / 22 * Math.PI * 2, [X, Y] = ringAt(E, a); wedge(g, X, Y, a, px * (.4 + R() * .7), px * (.03 + R() * .04)); g.stroke(); g.fill(); }
    for (let i = 0; i < 9; i++) { const a = R() * Math.PI * 2, [X, Y] = ringAt(E, a), d = px * (.55 + R() * .6), cx = X + Math.cos(a) * d, cy = Y + Math.sin(a) * d, s = px * (.05 + R() * .09);
      g.beginPath(); for (let j = 0; j < 4; j++) { const b = j / 4 * Math.PI * 2 + R() * .9, r = s * (.6 + R() * .6); j ? g.lineTo(cx + Math.cos(b) * r, cy + Math.sin(b) * r) : g.moveTo(cx + Math.cos(b) * r, cy + Math.sin(b) * r); } g.closePath(); g.stroke(); g.fill(); }
    g.restore(); }},
  // speed: trails behind the word (to its left, or above it when stacked)
  trails: {ext: (b, px, P) => P.vert ? growBox(b, px * .05, px * 2.5, px * .05, 0) : growBox(b, px * 2.5, px * .05, 0, px * .05), back(g, L, px, R) {
    const b = L.box, v = L.P.vert, n = 7; g.save(); g.fillStyle = L.P.ink;
    for (let i = 0; i < n; i++) { const f = (i + .5) / n, len = px * (.9 + R() * 1.5), w = px * (.02 + R() * .035);
      if (v) { const X = b.x0 + (b.x1 - b.x0) * (.12 + f * .76) + (R() - .5) * px * .1; wedge(g, X, b.y0 + px * .25, -Math.PI / 2, len, w); }
      else { const Y = b.y0 + (b.y1 - b.y0) * (.12 + f * .76) + (R() - .5) * px * .1; wedge(g, b.x0 + px * .25, Y, Math.PI, len, w); }
      g.fill(); }
    g.restore(); }},
  // electric: zigzag sparks out of the word
  zigzag: {ext: (b, px) => ringBox(b, px, .05, px * 1.4), back(g, L, px, R) {
    const E = sfxRing(L.box, px, .05);
    for (let i = 0; i < 7; i++) { const a = (i + R() * .6) / 7 * Math.PI * 2, [X, Y] = ringAt(E, a), len = px * (.8 + R() * .5), P = new Path2D(); P.moveTo(X, Y);
      for (let j = 1; j <= 4; j++) { const d = len * j / 4, o = j < 4 ? (j % 2 ? 1 : -1) * px * .16 : 0; P.lineTo(X + Math.cos(a) * d - Math.sin(a) * o, Y + Math.sin(a) * d + Math.cos(a) * o); }
      inkLine(g, P, Math.max(1, px * .065), L.P.ink); } }},
  // tremble: a faint double of the letters each side, and shudder marks
  shake: {ext: (b, px) => growBox(b, px * .6, px * .05, px * .6, px * .05), back(g, L, px, R, pass) {
    for (const d of [-1, 1]) pass((q, f) => { g.globalAlpha = .3; g.fillStyle = g.strokeStyle = L.P.ink; g.lineWidth = L.E * f; g.strokeText(q.ch, 0, 0); g.fillText(q.ch, 0, 0); }, d * px * .08, 0); },
    front(g, L, px) { const b = L.box, cy = (b.y0 + b.y1) / 2, h = (b.y1 - b.y0) / 2;
      for (const [side, x] of [[-1, b.x0], [1, b.x1]]) for (let j = 0; j < 3; j++) { const r = h * (.55 + j * .2), cx = x - side * (r - px * (.12 + j * .14)), P = new Path2D(); P.arc(cx, cy, r, side < 0 ? Math.PI - .45 : -.45, side < 0 ? Math.PI + .45 : .45); inkLine(g, P, Math.max(1, px * .04), L.P.ink); } }},
  // cute: bubbles and a sparkle or two round the word
  bubbles: {ext: (b, px) => ringBox(b, px, .05, px * .45), front(g, L, px, R) {
    const E = sfxRing(L.box, px, .05); g.save(); g.lineWidth = Math.max(1, px * .03); g.strokeStyle = L.P.ink; g.fillStyle = '#fff';
    for (let i = 0; i < 8; i++) { const a = (i + R() * .8) / 8 * Math.PI * 2, [X, Y] = ringAt(E, a), d = px * R() * .2; g.beginPath(); g.arc(X + Math.cos(a) * d, Y + Math.sin(a) * d, px * (.06 + R() * .12), 0, Math.PI * 2); g.fill(); g.stroke(); }
    g.fillStyle = L.P.ink; for (let i = 0; i < 2; i++) { const a = R() * Math.PI * 2, [X, Y] = ringAt(E, a), s = px * (.12 + R() * .08); g.beginPath();
      for (let j = 0; j < 8; j++) { const b = j / 8 * Math.PI * 2, r = j % 2 ? s * .22 : s; j ? g.lineTo(X + Math.cos(b) * r, Y + Math.sin(b) * r) : g.moveTo(X + Math.cos(b) * r, Y + Math.sin(b) * r); } g.closePath(); g.fill(); }
    g.restore(); }}
};

/* ---------- a sound drawn ---------- */
// screentone: ink dots on the fill colour, sized to the letters
function sfxTone(g, px, P) {
  const c = Math.max(2, Math.round(px * .09)), cv = document.createElement('canvas'); cv.width = cv.height = c * 2; const t = cv.getContext('2d');
  t.fillStyle = P.fill; t.fillRect(0, 0, c * 2, c * 2); t.fillStyle = P.ink; for (const [x, y] of [[c / 2, c / 2], [c * 1.5, c * 1.5]]) { t.beginPath(); t.arc(x, y, c * .32, 0, Math.PI * 2); t.fill(); }
  return g.createPattern(cv, 'repeat');
}
// a sound written on the page at k px per mm (offset ox, oy), over the panels: its look's passes over all the letters
// at once (shadow, outer ink, the white inside it, the fill, the keyline), so neighbouring letters melt into one shape.
// Returns where it is on the screen: its box turned with it (rb: its middle sx, sy; the box's middle, size and turn)
function drawSfx(g, x, k, ox, oy) {
  const px = (x.size || 16) * k, rot = (x.rot || 0) * DEG, sx = ox + x.x * k, sy = oy + x.y * k; g.save(); g.translate(sx, sy); g.rotate(rot);
  const Lo = sfxLayout(g, x, px), {P, G, E} = Lo, R = sfxRand((x.id || '') + ':d' + (x.seed || 0)), D = SFX_DECO[P.deco];
  g.font = Lo.font(px); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  // each letter in its own place; the line widths grow with the letters, more slowly than they do
  const pass = (fn, dx = 0, dy = 0) => { for (const q of G) { if (!q.ch.trim()) continue; g.save(); g.translate(q.x + dx, q.y + dy); if (q.r) g.rotate(q.r); if (P.slant) g.transform(1, 0, -P.slant, 1, 0, 0); if (q.s !== 1) g.scale(q.s, q.s); fn(q, 1 / Math.sqrt(q.s)); g.restore(); } };
  // (a shadow falls down and to the right of the page, whichever way the sound is turned)
  const off = d => [d * Math.cos(-rot) - d * 1.15 * Math.sin(-rot), d * Math.sin(-rot) + d * 1.15 * Math.cos(-rot)];
  const outer = P.outline === 'double' ? E * 1.9 : P.outline === 'none' ? 0 : E, solid = col => (q, f) => { g.fillStyle = g.strokeStyle = col; if (outer) { g.lineWidth = outer * f; g.strokeText(q.ch, 0, 0); } g.fillText(q.ch, 0, 0); };
  if (D && D.back) D.back(g, Lo, px, R, pass);
  if (P.shadow === 'drop') pass(solid(P.ink), ...off(px * .08));
  else if (P.shadow === 'depth') { const n = clamp(Math.round(px * .14 / Math.max(.6, px * .012)), 4, 24); for (let i = n; i >= 1; i--) pass(solid(P.ink), ...off(px * .13 * i / n)); }
  if (outer) pass((q, f) => { g.strokeStyle = P.ink; g.lineWidth = outer * f; g.strokeText(q.ch, 0, 0); });
  if (P.outline === 'double') pass((q, f) => { g.strokeStyle = '#ffffff'; g.lineWidth = E * f; g.strokeText(q.ch, 0, 0); });
  const tone = P.paint === 'tone' ? sfxTone(g, px, P) : null, shade = P.fill2 || mixHex(P.fill, P.ink, .45);
  pass(q => { if (P.paint === 'grad') { const gr = g.createLinearGradient(0, -px * .42, 0, px * .42); gr.addColorStop(0, P.fill); gr.addColorStop(1, shade); g.fillStyle = gr; } else g.fillStyle = tone || P.fill; g.fillText(q.ch, 0, 0); });
  if (P.outline === 'double') pass((q, f) => { g.strokeStyle = P.ink; g.lineWidth = Math.max(.6, E * .22) * f; g.strokeText(q.ch, 0, 0); });
  if (D && D.front) D.front(g, Lo, px, R, pass);
  g.restore();
  const B = Lo.full, w = B.x1 - B.x0, h = B.y1 - B.y0, bx = (B.x0 + B.x1) / 2, by = (B.y0 + B.y1) / 2, c = Math.cos(rot), s = Math.sin(rot), aw = Math.abs(w * c) + Math.abs(h * s), ah = Math.abs(w * s) + Math.abs(h * c);
  const cx = sx + bx * c - by * s, cy = sy + bx * s + by * c;
  return {w, h, rb: {sx, sy, cx, cy, w, h, a: rot}, box: {x: cx - aw / 2, y: cy - ah / 2, w: aw, h: ah}};
}
// is a point (screen px) on a sound's turned box
const inSfxBox = (rb, x, y, pad = 0) => { const dx = x - rb.cx, dy = y - rb.cy, c = Math.cos(-rb.a), s = Math.sin(-rb.a), u = dx * c - dy * s, v = dx * s + dy * c; return Math.abs(u) <= rb.w / 2 + pad && Math.abs(v) <= rb.h / 2 + pad; };

/* ---------- on the desk: the chosen sound's handles ---------- */
const sfxHit = x => pv.hits.find(h => h.x === x);
// where the handles are (screen px): the round one above the box turns it, the corner sizes it
function sfxHandles(rb) {
  const d = pv.dpr, c = Math.cos(rb.a), s = Math.sin(rb.a), at = (u, v) => [rb.cx + u * c - v * s, rb.cy + u * s + v * c];
  return {top: at(0, -rb.h / 2), rot: at(0, -rb.h / 2 - 26 * d), size: at(rb.w / 2, rb.h / 2), corners: [at(-rb.w / 2, -rb.h / 2), at(rb.w / 2, -rb.h / 2), at(rb.w / 2, rb.h / 2), at(-rb.w / 2, rb.h / 2)]};
}
function sfxHandleAt(x, y) {
  const h = CM.selX && sfxHit(CM.selX); if (!h) return null; const H = sfxHandles(h.rb), r = 11 * pv.dpr;
  if (Math.hypot(H.rot[0] - x, H.rot[1] - y) < r) return {kind: 'sfxRot', h}; if (Math.hypot(H.size[0] - x, H.size[1] - y) < r) return {kind: 'sfxSize', h}; return null;
}
function drawSfxHandles(g) {
  const x = CM.selX, h = x && sfxHit(x); if (!h) return; const d = pv.dpr, H = sfxHandles(h.rb), blue = '#2b5a9e', D = pv.drag;
  g.save(); g.strokeStyle = blue; g.lineWidth = 1.5 * d; g.setLineDash([5 * d, 4 * d]); g.beginPath(); H.corners.forEach(([u, v], i) => i ? g.lineTo(u, v) : g.moveTo(u, v)); g.closePath(); g.stroke();
  g.setLineDash([]); g.beginPath(); g.moveTo(...H.top); g.lineTo(...H.rot); g.stroke();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(H.rot[0], H.rot[1], 7 * d, 0, Math.PI * 2); g.fill(); g.stroke();
  // (the turning arrow drawn in the round handle)
  g.beginPath(); g.arc(H.rot[0], H.rot[1], 3.4 * d, -Math.PI * .9, Math.PI * .45); g.stroke();
  g.save(); g.translate(H.size[0], H.size[1]); g.rotate(h.rb.a); g.beginPath(); g.rect(-5.5 * d, -5.5 * d, 11 * d, 11 * d); g.fill(); g.stroke(); g.restore();
  // while turning or sizing: the angle, or the size, by the hand
  if (D && (D.kind === 'sfxRot' || D.kind === 'sfxSize')) { const t = D.kind === 'sfxRot' ? Math.round(x.rot || 0) + '°' : Math.round(x.size) + ' mm', [u, v] = D.kind === 'sfxRot' ? H.rot : H.size;
    g.font = `700 ${12 * d}px ${css('--f-body')}`; const w = g.measureText(t).width + 14 * d; g.fillStyle = blue; g.beginPath(); g.roundRect(u + 12 * d, v - 24 * d, w, 20 * d, 10 * d); g.fill(); g.fillStyle = '#fff'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(t, u + 19 * d, v - 14 * d); }
  g.restore();
}
function startSfxDrag(H, x, y) { const x0 = H.h.x, rb = H.h.rb; return {kind: H.kind, sfx: x0, sx: rb.sx, sy: rb.sy, a0: Math.atan2(y - rb.sy, x - rb.sx), r0: x0.rot || 0, d0: Math.max(4, Math.hypot(x - rb.sx, y - rb.sy)), s0: x0.size}; }
// turning (Mayús: by 15°) or sizing round the sound's middle
function moveSfxDrag(D, x, y, ev) {
  if (D.kind === 'sfxRot') { let r = D.r0 + (Math.atan2(y - D.sy, x - D.sx) - D.a0) / DEG; r = ((r + 540) % 360) - 180; if (ev.shiftKey) r = Math.round(r / 15) * 15; D.sfx.rot = Math.round(r); }
  else D.sfx.size = clamp(Math.round(D.s0 * Math.hypot(x - D.sx, y - D.sy) / D.d0 * 2) / 2, 4, 80);
  D.moved = true;
}
// a double click writes in the sound itself: a field over it, Intro to keep, Esc to leave it as it was
function editSfxInline(x) {
  const h = sfxHit(x), box = $('#pageView'); if (!h || !box) return; $('#pvSfxEdit')?.remove();
  const d = pv.dpr, el = document.createElement('input'), was = x.text; let done = false; el.id = 'pvSfxEdit'; el.className = 'pvsfxedit'; el.value = x.text; el.maxLength = 24; el.setAttribute('aria-label', tr('Texto de la onomatopeya'));
  Object.assign(el.style, {left: h.rb.sx / d + 'px', top: h.rb.sy / d + 'px', fontSize: clamp(x.size * pv.k / d * .55, 14, 56) + 'px', transform: `translate(-50%, -50%) rotate(${x.rot || 0}deg)`});
  box.appendChild(el); el.focus(); el.select();
  el.oninput = () => { x.text = el.value; drawPage(); syncComicUI(); };
  const close = keep => { if (done) return; done = true; if (!keep || !x.text.trim()) x.text = was; el.remove(); drawPage(); syncComicUI(); if (x.text !== was) comicSaved(); pv.cv && pv.cv.focus({preventScroll: true}); };
  el.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') close(true); else if (e.key === 'Escape') close(false); };
  el.onpointerdown = e => e.stopPropagation(); el.onblur = () => close(true);
}

/* ---------- a new sound: where it goes ---------- */
// in the chosen panel (or the page's live area): letters a quarter of its smaller side, never wider than most of it,
// at the spot of a grid over it furthest from its balloons and the other sounds, inside its shape, high rather than low
function sfxSpot(pg, p, x) {
  const c = comic(), [mt, mr, mb, ml] = c.page.margin, B = p ? panelBox(p) : {x: ml, y: mt, w: c.page.w - ml - mr, h: c.page.h - mt - mb}, P = sfxParams(x), n = Math.max(2, [...String(x.text || '')].length);
  let size = clamp(Math.min(B.w, B.h) * .26, 7, 34); size = P.vert ? Math.min(size, B.h * .72 / (n * 1.02), B.w * .45) : Math.min(size, B.w * .72 / (n * .5 + .3));
  const busy = [...(p ? p.balloons.map(b => [B.x + b.x * B.w, B.y + b.y * B.h]) : []), ...(pg.sfx || []).map(s => [s.x, s.y])], pts = p ? panelPts(p) : null; let best = null;
  for (const fy of [.25, .38, .5, .62, .75]) for (const fx of [.28, .4, .5, .6, .72]) { const X = B.x + B.w * fx, Y = B.y + B.h * fy; if (pts && !inPoly(pts, X, Y)) continue;
    const dist = busy.length ? Math.min(...busy.map(([u, v]) => Math.hypot((u - X) / B.w, (v - Y) / B.h))) : 1, score = Math.min(dist, .45) - Math.abs(fx - .55) * .12 - Math.abs(fy - .4) * .18;
    if (!best || score > best.s) best = {s: score, x: X, y: Y}; }
  if (!best) best = {x: B.x + B.w / 2, y: B.y + B.h / 2};
  return {x: Math.round(best.x * 10) / 10, y: Math.round(best.y * 10) / 10, size: Math.max(5, Math.round(size)), rot: P.rot};
}
function addSfx(text, style, extra) {
  const pg = curPage(); if (!pg) return null; pg.sfx = pg.sfx || []; const p = CM.sel && pg.panels.includes(CM.sel) ? CM.sel : null;
  const x = {id: newId('s'), text: String(text || '').trim() || tr('¡BAM!'), x: 0, y: 0, size: 16, rot: 0, style: style || CM.sfxStyle || 'impact', ...(extra || {})};
  Object.assign(x, sfxSpot(pg, p, x)); pg.sfx.push(x); CM.selX = x; CM.selB = null; drawPage(); syncComicUI(); comicSaved(); return x;
}

/* ---------- the tab's section ---------- */
const SFXUI = {sl: {}, prev: ''};
// a look chosen: the chosen sound takes it (what was changed on it goes back to the look's), or the next new one will
function pickSfxStyle(key) {
  const x = CM.selX; if (!SFX_STYLES[key]) return;
  if (x) { const wasV = sfxParams(x).vert; x.style = key; for (const k of SFX_KEYS) delete x[k]; if (sfxParams(x).vert !== wasV) x.rot = SFX_STYLES[key].rot ?? SFX_BASE.rot; drawPage(); comicSaved(); }
  else { CM.sfxStyle = key; store.set('cdp.cmSfxStyle', key); }
  syncSfxUI();
}
// the gallery's pictures: each look on the chosen sound's words (or its own word), fitted to its card
function sfxPreviews(force) {
  const x = CM.selX, key = (x ? x.text : '') + '|' + !!CM.fontsReady; if (!force && key === SFXUI.prev) return; SFXUI.prev = key;
  for (const b of $$('#cmSfxStyles .sfxst')) { const cv = b.querySelector('canvas'), g = cv.getContext('2d'), S = SFX_STYLES[b.dataset.v], s = {id: 'pv-' + b.dataset.v, text: (x && x.text.trim()) || S.sample, x: 0, y: 0, size: 10, rot: 0, style: b.dataset.v};
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
    const L = sfxLayout(g, s, 10), B = L.full, f = Math.min(cv.width * .86 / (B.x1 - B.x0), cv.height * .82 / (B.y1 - B.y0)); s.size = 10 * f;
    drawSfx(g, s, 1, cv.width / 2 - (B.x0 + B.x1) / 2 * f, cv.height / 2 - (B.y0 + B.y1) / 2 * f); }
}
function syncSfxUI() {
  const x = CM.selX; if (!$('#cmSfxEdit')) return;
  $('#cmSfxEdit').hidden = !x; $('#cmSfxHint').hidden = !!x; setPressed($('#cmSfxStyles'), x ? x.style || 'classic' : CM.sfxStyle || 'impact'); sfxPreviews();
  if (!x) return; const P = sfxParams(x);
  if (document.activeElement !== $('#cmSfxText')) $('#cmSfxText').value = x.text;
  for (const [k, s] of Object.entries(SFXUI.sl)) if (document.activeElement !== s.inp) s.set(k === 'size' ? x.size : k === 'rot' ? x.rot || 0 : P[k]);
  for (const [k, [sel]] of Object.entries(SFX_CHIPS)) setPressed($(sel), P[k]);
  $('#cmSfxVert').checked = !!P.vert; $('#cmSfxFill').value = P.fill; $('#cmSfxInk').value = P.ink;
}
function buildSfxUI() {
  if (!$('#cmSfxStyles')) return; CM.sfxStyle = store.get('cdp.cmSfxStyle', 'impact'); if (!SFX_STYLES[CM.sfxStyle]) CM.sfxStyle = 'impact';
  const gal = $('#cmSfxStyles'); gal.innerHTML = '';
  for (const [key, S] of Object.entries(SFX_STYLES)) { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip preset sfxst'; b.dataset.v = key; b.innerHTML = '<canvas width="168" height="84"></canvas><span></span>'; b.querySelector('span').textContent = S.label; b.onclick = () => pickSfxStyle(key); gal.appendChild(b); }
  const cat = $('#cmSfxCat'); cat.innerHTML = '';
  for (const [lang, list] of SFX_CATALOG) { const row = document.createElement('div'); row.className = 'sfxcatrow'; row.innerHTML = `<b></b>`; row.querySelector('b').textContent = lang;
    for (const [text, style, extra] of list) { const b = document.createElement('button'); b.type = 'button'; b.className = 'sfxword'; b.textContent = text; b.onclick = () => addSfx(text, style, extra); row.appendChild(b); }
    cat.appendChild(row); }
  $('#cmSfxAdd').onclick = () => addSfx($('#cmSfxNew').value);
  $('#cmSfxNew').onkeydown = e => { if (e.key === 'Enter') addSfx($('#cmSfxNew').value); };
  $('#cmSfxText').oninput = e => { if (CM.selX) { CM.selX.text = e.target.value; drawPage(); sfxPreviews(); } }; $('#cmSfxText').onchange = comicSaved;
  // the sliders: what they change is kept on the sound, over its look
  const box = k => $(k === 'size' || k === 'rot' ? '#cmSfxSl' : k === 'edge' ? '#cmSfxLook' : '#cmSfxShape'); for (const id of ['#cmSfxSl', '#cmSfxShape', '#cmSfxLook']) $(id).innerHTML = '';
  for (const [k, label, min, max, step, fmt] of SFX_SLIDERS) SFXUI.sl[k] = slider(box(k), {id: 'cmSfx' + k[0].toUpperCase() + k.slice(1), label, min, max, step, value: k === 'size' ? 16 : SFX_BASE[k] ?? 0, def: k === 'size' ? 16 : k === 'rot' ? 0 : SFX_BASE[k], fmt,
    input: v => { const x = CM.selX; if (!x) return; x[k] = v; drawPage(); }, change: () => { if (CM.selX) comicSaved(); }});
  for (const [k, [sel, items]] of Object.entries(SFX_CHIPS)) chips($(sel), items, SFX_BASE[k], v => { const x = CM.selX; if (!x) return; x[k] = v; drawPage(); comicSaved(); sfxPreviews(true); });
  $('#cmSfxVert').onchange = e => { const x = CM.selX; if (!x) return; x.vert = e.target.checked; drawPage(); comicSaved(); };
  for (const [id, k] of [['#cmSfxFill', 'fill'], ['#cmSfxInk', 'ink']]) { $(id).oninput = e => { const x = CM.selX; if (!x) return; x[k] = e.target.value; delete x.fill2; drawPage(); }; $(id).onchange = () => CM.selX && comicSaved(); }
  $('#cmSfxBW').onclick = () => { const x = CM.selX; if (!x) return; delete x.fill; delete x.fill2; delete x.ink; drawPage(); syncSfxUI(); comicSaved(); };
  $('#cmSfxReset').onclick = () => { const x = CM.selX; if (!x) return; for (const k of SFX_KEYS) delete x[k]; drawPage(); syncSfxUI(); comicSaved(); };
  $('#cmSfxShuffle').onclick = () => { const x = CM.selX; if (!x) return; x.seed = (x.seed || 0) + 1; drawPage(); comicSaved(); };
  $('#cmSfxDup').onclick = () => { const pg = curPage(), x = CM.selX; if (!pg || !x) return; const y = {...JSON.parse(JSON.stringify(x)), id: newId('s'), x: x.x + 6, y: x.y + 6}; pg.sfx.push(y); CM.selX = y; drawPage(); syncComicUI(); comicSaved(); };
  $('#cmSfxDel').onclick = () => { const pg = curPage(), x = CM.selX; if (!pg || !x) return; pg.sfx.splice(pg.sfx.indexOf(x), 1); CM.selX = null; drawPage(); syncComicUI(); comicSaved(); };
  comicFonts().then(() => sfxPreviews(true));
}
