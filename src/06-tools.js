/* ======================= tools ======================= */

/* ---------- sketch layer: stamp-based brush engine with pen pressure and Photoshop brushes ---------- */
const sk = {on: false, strokes: [], redo: [], cur: null, brush: 'lapiz', color: '#2e2a25', size: 4, opacity: 1, flow: 1, erase: false,
  pSize: true, pOpac: false, curve: 1, smooth: .3, mouseSim: true, hideFig: false, dim: false, pressureSeen: false};
const skc = $('#sketch'), sctx = skc.getContext('2d'), skl = $('#sketchLive'), lctx = skl.getContext('2d');
const toSk = (x, y) => [(x - W / 2) / Hh, y / Hh];
const fromSk = (u, v, w = W, h = Hh) => [u * h + w / 2, v * h];
function rngS(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

/* tips are white images whose alpha is the brush mask */
function makeTip(n, fn) {
  const c = document.createElement('canvas'); c.width = c.height = n;
  const x = c.getContext('2d'), id = x.createImageData(n, n), r = rngS(n * 7 + 3);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const nx = (i + .5) / n * 2 - 1, ny = (j + .5) / n * 2 - 1, a = clamp(fn(nx, ny, r), 0, 1), k = (j * n + i) * 4;
    id.data[k] = id.data[k + 1] = id.data[k + 2] = 255; id.data[k + 3] = Math.round(a * 255);
  }
  x.putImageData(id, 0, 0); return c;
}
const disk = (x, y, hard) => { const d = Math.hypot(x, y); return hard >= 1 ? (d < .92 ? 1 : d < 1 ? (1 - d) / .08 : 0) : clamp((1 - d) / (1 - hard), 0, 1); };
const BRUSHES = {
  lapiz:      {label: 'Lápiz', spacing: .12, flow: .9, jitter: 3.14, tip: makeTip(64, (x, y, r) => disk(x, y, .7) * (.45 + .55 * r()))},
  grafito:    {label: 'Grafito blando', spacing: .1, flow: .55, jitter: 3.14, tip: makeTip(96, (x, y, r) => disk(x, y, .25) * (.25 + .75 * r() * r()))},
  tinta:      {label: 'Tinta', spacing: .05, flow: 1, jitter: 0, tip: makeTip(64, (x, y) => disk(x, y, 1))},
  rotulador:  {label: 'Rotulador', spacing: .06, flow: 1, jitter: 0, noPSize: true, tip: makeTip(64, (x, y) => disk(x, y, .92))},
  pluma:      {label: 'Plumilla', spacing: .04, flow: 1, jitter: 0, tip: makeTip(64, (x, y) => { const a = .7854, u = x * Math.cos(a) + y * Math.sin(a), v = -x * Math.sin(a) + y * Math.cos(a); return disk(u, v * 4.2, 1); })},
  carboncillo:{label: 'Carboncillo', spacing: .14, flow: .7, jitter: .5, tip: makeTip(96, (x, y, r) => disk(x * .6, y * 1.5, .3) * (r() < .62 ? .2 + .8 * r() : 0))},
  aerografo:  {label: 'Aerógrafo', spacing: .08, flow: .08, jitter: 0, tip: makeTip(96, (x, y) => Math.exp(-(x * x + y * y) * 4.5))},
  acuarela:   {label: 'Acuarela', spacing: .1, flow: .18, jitter: 3.14, tip: makeTip(128, (x, y, r) => { const d = Math.hypot(x, y) * (1 + .18 * Math.sin(Math.atan2(y, x) * 5)); return clamp((1 - d) * 3, 0, 1) * (.75 + .25 * r()) * (d > .78 ? 1.25 : .85); })},
  textura:    {label: 'Trama', spacing: .3, flow: .7, jitter: 0, tip: makeTip(96, (x, y) => disk(x, y, .8) * (Math.abs((((x + y) * 6) % 1 + 1) % 1 - .5) < .18 ? 1 : 0))}
};
tLabels(BRUSHES);
function tinted(b, color) {
  b.cache = b.cache || {};
  if (b.cache[color]) return b.cache[color];
  const c = document.createElement('canvas'); c.width = b.tip.width; c.height = b.tip.height;
  const x = c.getContext('2d'); x.drawImage(b.tip, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
  return b.cache[color] = c;
}
// stamps along the stroke from point index i0; returns the carried distance
function stampStroke(ctx, s, w, h, from = 0, carry = 0) {
  const b = BRUSHES[s.brush] || BRUSHES.lapiz, scale = h / s.h0, img = tinted(b, s.erase ? '#000' : s.color);
  const P = s.pts, rnd = s.rnd || (s.rnd = rngS(s.seed));
  const ar = img.width / img.height;
  for (let i = Math.max(1, from); i < P.length; i++) {
    const [ax, ay] = fromSk(P[i - 1][0], P[i - 1][1], w, h), [bx, by] = fromSk(P[i][0], P[i][1], w, h);
    const seg = Math.hypot(bx - ax, by - ay); let d = carry;
    while (d <= seg) {
      const t = seg ? d / seg : 0, pr = P[i - 1][2] + (P[i][2] - P[i - 1][2]) * t, pc = Math.pow(clamp(pr, 0, 1), s.curve);
      const size = Math.max(.5, s.size * scale * (s.pSize && !b.noPSize ? .12 + .88 * pc : 1));
      ctx.globalAlpha = clamp((s.flow ?? 1) * b.flow * (s.pOpac ? .1 + .9 * pc : 1), 0, 1);
      const x = ax + (bx - ax) * t, y = ay + (by - ay) * t, ang = b.jitter ? (rnd() - .5) * 2 * b.jitter : 0;
      ctx.save(); ctx.translate(x, y); if (ang) ctx.rotate(ang);
      ctx.drawImage(img, -size * ar / 2, -size / 2, size * ar, size); ctx.restore();
      d += Math.max(.4, size * (s.spacing ?? b.spacing));
    }
    carry = d - seg;
  }
  ctx.globalAlpha = 1;
  return carry;
}
function renderStroke(ctx, s, w, h) {
  s.rnd = rngS(s.seed);
  if (s.erase) { ctx.save(); ctx.globalCompositeOperation = 'destination-out'; stampStroke(ctx, s, w, h); ctx.restore(); return; }
  const t = renderStroke.tmp || (renderStroke.tmp = document.createElement('canvas'));
  if (t.width !== ctx.canvas.width || t.height !== ctx.canvas.height) { t.width = ctx.canvas.width; t.height = ctx.canvas.height; }
  const tx = t.getContext('2d'); tx.setTransform(1, 0, 0, 1, 0, 0); tx.clearRect(0, 0, t.width, t.height);
  tx.setTransform(ctx.getTransform()); stampStroke(tx, s, w, h);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = s.opacity; ctx.drawImage(t, 0, 0); ctx.restore();
}
function sizeSketch() {
  const pr = Math.min(devicePixelRatio, 2);
  for (const [c, x] of [[skc, sctx], [skl, lctx]]) { c.width = W * pr; c.height = Hh * pr; x.setTransform(pr, 0, 0, pr, 0, 0); }
  redrawSketch();
}
function redrawSketch() { sctx.save(); sctx.setTransform(1, 0, 0, 1, 0, 0); sctx.clearRect(0, 0, skc.width, skc.height); sctx.restore(); for (const s of sk.strokes) renderStroke(sctx, s, W, Hh); }
// the whole layer at any resolution, for export
function sketchCanvas(k) {
  const c = document.createElement('canvas'); c.width = Math.round(W * k); c.height = Math.round(Hh * k);
  const x = c.getContext('2d'); x.setTransform(k, 0, 0, k, 0, 0);
  for (const s of sk.strokes) renderStroke(x, s, W, Hh);
  return c;
}
let lastPt = null, lastT = 0, smoothPt = null;
function penPressure(e, x, y) {
  if (e.pointerType === 'pen' || (e.pressure > 0 && e.pressure !== .5)) {
    if (!sk.pressureSeen && e.pressure > 0 && e.pressure !== .5) { sk.pressureSeen = true; $('#skPressure').textContent = tr('Presión detectada: tableta o lápiz activo.'); }
    return e.pressure || .5;
  }
  if (!sk.mouseSim || !lastPt) return .6;
  const now = performance.now(), v = Math.hypot(x - lastPt[0], y - lastPt[1]) / Math.max(1, now - lastT);
  return clamp(1.05 - v * .45, .2, 1);
}
skl.addEventListener('pointerdown', e => {
  if (!sk.on) return;
  e.preventDefault(); try { skl.setPointerCapture(e.pointerId); } catch (_) {}
  const r = skl.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  lastPt = null; smoothPt = [x, y];
  sk.cur = {brush: sk.brush, color: sk.color, size: sk.size, opacity: sk.opacity, flow: sk.flow, erase: sk.erase, pSize: sk.pSize, pOpac: sk.pOpac, curve: sk.curve,
    h0: Hh, seed: (Math.random() * 1e9) | 0, pts: [[...toSk(x, y), penPressure(e, x, y)]]};
  sk.cur.pts.push(sk.cur.pts[0].slice()); sk.cur.carry = 0; sk.cur.drawn = 0; sk.cur.rnd = rngS(sk.cur.seed);
  skl.style.opacity = sk.erase ? 0 : sk.opacity;
  lastPt = [x, y]; lastT = performance.now();
  liveStamp();
});
function liveStamp() {
  const s = sk.cur; if (!s) return;
  const ctx = s.erase ? sctx : lctx;
  if (s.erase) { ctx.save(); ctx.globalCompositeOperation = 'destination-out'; }
  s.carry = stampStroke(ctx, s, W, Hh, Math.max(1, s.drawn), s.carry);
  if (s.erase) ctx.restore();
  s.drawn = s.pts.length;
}
skl.addEventListener('pointermove', e => {
  if (!sk.cur) return;
  const r = skl.getBoundingClientRect(), co = e.getCoalescedEvents ? e.getCoalescedEvents() : [], evs = co.length ? co : [e];
  for (const ev of evs) {
    const x = ev.clientX - r.left, y = ev.clientY - r.top, k = 1 - sk.smooth * .9;
    smoothPt = [smoothPt[0] + (x - smoothPt[0]) * k, smoothPt[1] + (y - smoothPt[1]) * k];
    const p = penPressure(ev, x, y);
    sk.cur.pts.push([...toSk(smoothPt[0], smoothPt[1]), p]);
    lastPt = [x, y]; lastT = performance.now();
  }
  liveStamp();
});
function endStroke() {
  const s = sk.cur; if (!s) return; sk.cur = null;
  delete s.carry; delete s.drawn; delete s.rnd;
  if (!s.erase) { sctx.save(); sctx.setTransform(1, 0, 0, 1, 0, 0); sctx.globalAlpha = s.opacity; sctx.drawImage(skl, 0, 0); sctx.restore(); }
  lctx.save(); lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.clearRect(0, 0, skl.width, skl.height); lctx.restore();
  sk.strokes.push(s); sk.redo = [];
}
skl.addEventListener('pointerup', endStroke); skl.addEventListener('pointercancel', endStroke);
function setSketch(on) {
  sk.on = on; skl.classList.toggle('on', on); $('#sketchBar').hidden = !on;
  $('#sketchBtn').setAttribute('aria-pressed', String(on));
  if (on) select(null);
}
function setHideFig(v) { sk.hideFig = v; $$('.hideFigBtn').forEach(b => b.textContent = tr(v ? 'Mostrar figura' : 'Ocultar figura')); }

/* ---------- Photoshop .abr brushes (sampled tips, versions 1, 2, 6 and 10) ---------- */
function parseABR(buf) {
  const dv = new DataView(buf), out = []; let o = 0;
  const u8 = () => dv.getUint8(o++), u16 = () => { const v = dv.getUint16(o); o += 2; return v; }, i32 = () => { const v = dv.getInt32(o); o += 4; return v; };
  const str4 = () => String.fromCharCode(u8(), u8(), u8(), u8());
  const readImage = (name) => {
    const top = i32(), left = i32(), bottom = i32(), right = i32(), depth = u16(), comp = u8();
    const w = right - left, h = bottom - top, bpp = depth >> 3 || 1;
    if (w <= 0 || h <= 0 || w > 5000 || h > 5000) throw new Error('size');
    const data = new Uint8Array(w * h * bpp);
    if (!comp) { for (let i = 0; i < data.length; i++) data[i] = u8(); }
    else {
      const lens = []; for (let r = 0; r < h * bpp; r++) lens.push(u16());
      let k = 0;
      for (let r = 0; r < h * bpp; r++) {
        let j = 0;
        while (j < lens[r]) {
          let n = u8(); j++; if (n >= 128) n -= 256;
          if (n < 0) { if (n === -128) continue; n = -n + 1; const c = u8(); j++; for (let q = 0; q < n && k < data.length; q++) data[k++] = c; }
          else { for (let q = 0; q < n + 1 && k < data.length; q++) { data[k++] = u8(); j++; } }
        }
      }
    }
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) mask[i] = data[i * bpp];
    out.push({name, w, h, mask});
  };
  const ver = u16();
  if (ver === 1 || ver === 2) {
    const count = u16();
    for (let b = 0; b < count && o < buf.byteLength; b++) {
      const type = u16(), size = dv.getUint32(o); o += 4; const next = o + size;
      if (type === 2) {
        o += 4; u16();
        let name = 'Pincel ' + (out.length + 1);
        if (ver === 2) { const len = dv.getUint32(o); o += 4; let t = ''; for (let i = 0; i < len; i++) { const c = u16(); if (c) t += String.fromCharCode(c); } name = t || name; }
        o += 1 + 8;
        try { readImage(name); } catch (_) {}
      }
      o = next;
    }
  } else if (ver === 6 || ver === 10) {
    const sub = u16();
    while (o + 12 <= buf.byteLength) {
      const sig = str4(), key = str4(); if (sig !== '8BIM') break;
      const len = dv.getUint32(o); o += 4; const end = o + len;
      if (key === 'samp') {
        while (o + 4 < end) {
          const bsize = dv.getUint32(o); o += 4; let bend = bsize; while (bend % 4) bend++;
          const next = o + bend;
          o += sub === 1 ? 47 : 301;
          try { readImage(tr('Pincel {n}', {n: out.length + 1})); } catch (_) {}
          o = next;
        }
      }
      o = end + (len % 2);
    }
  } else throw new Error(tr('Versión de .abr no compatible: ') + ver);
  return out;
}
// turn a grey mask (or any image) into a white tip with alpha, inverting if the background is opaque
function tipFromMask(mask, w, h) {
  let edge = 0, ne = 0;
  for (let x = 0; x < w; x++) { edge += mask[x] + mask[(h - 1) * w + x]; ne += 2; }
  for (let y = 0; y < h; y++) { edge += mask[y * w] + mask[y * w + w - 1]; ne += 2; }
  const inv = edge / ne > 128, k = Math.min(1, 256 / Math.max(w, h));
  const src = document.createElement('canvas'); src.width = w; src.height = h;
  const sx = src.getContext('2d'), id = sx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) { id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = 255; id.data[i * 4 + 3] = inv ? 255 - mask[i] : mask[i]; }
  sx.putImageData(id, 0, 0);
  if (k === 1) return src;
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height); return c;
}
function tipFromImage(img) {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height, c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, w, h).data, mask = new Uint8Array(w * h);
  let aSum = 0; for (let i = 0; i < w * h; i++) aSum += d[i * 4 + 3];
  const opaque = aSum / (w * h) > 245;
  for (let i = 0; i < w * h; i++) mask[i] = opaque ? 255 - Math.round(d[i * 4] * .299 + d[i * 4 + 1] * .587 + d[i * 4 + 2] * .114) : d[i * 4 + 3];
  if (opaque) return tipFromMask(mask.map(v => v), w, h); // dark paint on white paper
  const k = Math.min(1, 256 / Math.max(w, h)), out = document.createElement('canvas'); out.width = Math.round(w * k); out.height = Math.round(h * k);
  const ox = out.getContext('2d'); ox.drawImage(c, 0, 0, out.width, out.height); ox.globalCompositeOperation = 'source-in'; ox.fillStyle = '#fff'; ox.fillRect(0, 0, out.width, out.height);
  return out;
}
/* imported brushes persist in this browser (IndexedDB) */
const brushDB = {
  open() { return new Promise((res, rej) => { try { const r = indexedDB.open('cdp-brushes', 1); r.onupgradeneeded = () => r.result.createObjectStore('b', {keyPath: 'id'}); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } }); },
  async all() { try { const db = await this.open(); return await new Promise(res => { const q = db.transaction('b').objectStore('b').getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => res([]); }); } catch (_) { return []; } },
  async put(v) { try { const db = await this.open(); db.transaction('b', 'readwrite').objectStore('b').put(v); } catch (_) {} },
  async del(id) { try { const db = await this.open(); db.transaction('b', 'readwrite').objectStore('b').delete(id); } catch (_) {} }
};
function addImportedBrush(id, name, tip, spacing = .2, save = true) {
  BRUSHES[id] = {label: name, spacing, flow: 1, jitter: 0, tip, imported: true};
  if (save) brushDB.put({id, name, spacing, png: tip.toDataURL('image/png')});
}
async function loadSavedBrushes() {
  for (const r of await brushDB.all()) {
    const img = new Image(); img.src = r.png;
    await new Promise(res => { img.onload = res; img.onerror = res; });
    const c = document.createElement('canvas'); c.width = img.width || 1; c.height = img.height || 1; c.getContext('2d').drawImage(img, 0, 0);
    addImportedBrush(r.id, r.name, c, r.spacing, false);
  }
  renderBrushGrid();
}
async function importBrushFiles(files) {
  const msg = $('#skMsg'); let n = 0;
  for (const f of files) {
    try {
      if (/\.abr$/i.test(f.name)) {
        const list = parseABR(await f.arrayBuffer());
        list.forEach((b, i) => { addImportedBrush(`abr-${f.name}-${i}-${Date.now()}`, b.name || `${f.name} ${i + 1}`, tipFromMask(b.mask, b.w, b.h), .22); n++; });
      } else {
        const url = URL.createObjectURL(f), img = new Image(); img.src = url;
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
        addImportedBrush(`img-${f.name}-${Date.now()}`, f.name.replace(/\.[^.]+$/, ''), tipFromImage(img), .2); URL.revokeObjectURL(url); n++;
      }
    } catch (e) { msg.textContent = tr('No se ha podido leer {f}: solo se admiten pinceles de muestra (.abr) e imágenes.', {f: f.name}); }
  }
  if (n) msg.textContent = tr(n > 1 ? '{n} pinceles importados. Se guardan en este navegador.' : '1 pincel importado. Se guarda en este navegador.', {n});
  renderBrushGrid();
}
function renderBrushGrid() {
  const g = $('#skBrushes'); if (!g) return; g.innerHTML = '';
  for (const [id, b] of Object.entries(BRUSHES)) {
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'brush'; btn.title = b.label;
    btn.setAttribute('aria-pressed', String(id === sk.brush));
    const cv = document.createElement('canvas'); cv.width = 72; cv.height = 36; const x = cv.getContext('2d');
    const demo = {brush: id, color: getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#222', size: 13, opacity: 1, flow: 1, erase: false, pSize: true, pOpac: false, curve: 1, h0: 36, seed: 7,
      pts: Array.from({length: 24}, (_, i) => { const t = i / 23; return [(t - .5) * 1.6, .5 + Math.sin(t * Math.PI * 2) * .22, Math.sin(t * Math.PI)]; })};
    stampStroke(x, demo, 72, 36);
    const sp = document.createElement('span'); sp.textContent = b.label;
    btn.append(cv, sp);
    btn.onclick = () => { sk.brush = id; setPressed2(); };
    if (b.imported) { const d = document.createElement('span'); d.className = 'bdel'; d.textContent = '×'; d.title = tr('Quitar pincel');
      d.onclick = e => { e.stopPropagation(); delete BRUSHES[id]; brushDB.del(id); if (sk.brush === id) sk.brush = 'lapiz'; renderBrushGrid(); }; btn.appendChild(d); }
    g.appendChild(btn);
  }
  function setPressed2() { g.querySelectorAll('.brush').forEach((b, i) => b.setAttribute('aria-pressed', String(Object.keys(BRUSHES)[i] === sk.brush))); }
}
function setErase(v) { sk.erase = v; $('#skErase').setAttribute('aria-pressed', String(v)); $('#skErase').textContent = tr(v ? 'Goma activa' : 'Goma'); }
function buildSketchUI() {
  renderBrushGrid(); loadSavedBrushes();
  $('#skImport').onclick = () => $('#skFile').click();
  $('#skFile').onchange = e => { importBrushFiles([...e.target.files]); e.target.value = ''; };
  const cols = ['#2e2a25', '#6d6555', '#b0432c', '#2b5a9e', '#3f6b4a', '#c8a24a', '#f4f0e6'];
  const sw = $('#skSwatches'); sw.innerHTML = '';
  for (const c of cols) { const b = document.createElement('button'); b.type = 'button'; b.style.background = c; b.setAttribute('aria-label', 'Color ' + c); b.onclick = () => { sk.color = c; $('#skColor').value = c; setErase(false); }; sw.appendChild(b); }
  $('#skColor').value = sk.color; $('#skColor').oninput = e => { sk.color = e.target.value; setErase(false); };
  $('#skErase').onclick = () => setErase(!sk.erase);
  const box = $('#skSliders'); box.innerHTML = '';
  slider(box, {id: 'sk_size', label: 'Tamaño', min: 1, max: 90, step: .5, value: sk.size, fmt: v => dec(v) + ' px', input: v => sk.size = v});
  slider(box, {id: 'sk_op', label: 'Opacidad', min: .05, max: 1, step: .01, value: sk.opacity, fmt: pctFmt, input: v => sk.opacity = v});
  slider(box, {id: 'sk_flow', label: 'Flujo', min: .05, max: 1, step: .01, value: sk.flow, fmt: pctFmt, input: v => sk.flow = v});
  slider(box, {id: 'sk_smooth', label: 'Estabilizador', min: 0, max: .95, step: .01, value: sk.smooth, fmt: pctFmt, input: v => sk.smooth = v});
  slider(box, {id: 'sk_curve', label: 'Curva de presión (suave ↔ firme)', min: .35, max: 2.5, step: .05, value: sk.curve, fmt: v => dec(v, 2), input: v => sk.curve = v});
  $('#skPSize').checked = sk.pSize; $('#skPSize').onchange = e => sk.pSize = e.target.checked;
  $('#skPOpac').checked = sk.pOpac; $('#skPOpac').onchange = e => sk.pOpac = e.target.checked;
  $('#skMouse').checked = sk.mouseSim; $('#skMouse').onchange = e => sk.mouseSim = e.target.checked;
  $('#skUndo').onclick = () => { const s = sk.strokes.pop(); if (s) { sk.redo.push(s); redrawSketch(); } };
  $('#skRedo').onclick = () => { const s = sk.redo.pop(); if (s) { sk.strokes.push(s); redrawSketch(); } };
  $('#skClear').onclick = () => { if (!sk.strokes.length) return; const was = sk.strokes; sk.redo = sk.strokes.slice().reverse(); sk.strokes = []; redrawSketch(); toast(tr('Boceto borrado'), {undo: () => { sk.strokes = was; sk.redo = []; redrawSketch(); }}); };
  $$('.hideFigBtn').forEach(b => b.onclick = () => setHideFig(!sk.hideFig));
  $('#skDim').onclick = () => { sk.dim = !sk.dim; canvas.style.opacity = sk.dim ? .35 : 1; $('#skDim').textContent = tr(sk.dim ? 'Escena normal' : 'Atenuar escena'); };
  $('#skClose').onclick = () => setSketch(false);
  $('#sketchBtn').onclick = () => setSketch(!sk.on);
  addEventListener('keydown', e => {
    if (!sk.on || e.target.matches('input:not([type=range]):not([type=checkbox]):not([type=radio]):not([type=color]),textarea,select')) return;
    const k = e.key.toLowerCase();
    if (k === 'e') setErase(!sk.erase);
    else if (k === 'b') setErase(false);
    else if (k === '[' || k === ']') { sk.size = clamp(sk.size * (k === ']' ? 1.15 : .87), 1, 90); $('#sk_size').value = sk.size; $('#sk_size').dispatchEvent(new Event('input')); }
  });
}

/* ---------- random pose generator ---------- */
const RAND_KINDS = {pie: 'De pie', accion: 'Acción', suelo: 'Suelo', cualquiera: 'Cualquiera'};
function randomPose(kind) {
  const R = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.floor(Math.random() * a.length)];
  const k = kind === 'cualquiera' ? pick(['pie', 'pie', 'accion', 'accion', 'suelo']) : kind;
  let j = {}, ik = [], lift = 0, stool = false, plant = false;
  if (k === 'suelo') {
    const base = pick(POSES.filter(p => p.cat === 'suelo' && !p.ik));
    j = JSON.parse(JSON.stringify(base.j)); stool = !!base.stool;
  } else if (k === 'pie') {
    plant = true;
    const sup = Math.random() < .5 ? 'L' : 'R', oth = sup === 'L' ? 'R' : 'L', sg = sup === 'L' ? 1 : -1;
    j.hips = [R(-4, 6), R(-25, 25), sg * R(-7, 2)];
    j['hip' + sup] = [R(-6, 6), 0, sg * R(2, 9)]; j['knee' + sup] = [R(0, 10)];
    j['hip' + oth] = [R(-30, 18), 0, -sg * R(-4, 14)]; j['knee' + oth] = [R(5, 35)]; j['ankle' + oth] = [R(-15, 20)];
  } else {
    const st = pick(['zancada', 'unpie', 'salto', 'agachado', 'giro']);
    if (st === 'zancada') { const f = pick(['L', 'R']), b = f === 'L' ? 'R' : 'L', sg = f === 'L' ? 1 : -1;
      j.hips = [R(0, 20), R(-30, 30), 0]; j['hip' + f] = [R(-90, -60), 0, sg * R(0, 12)]; j['knee' + f] = [R(60, 100)]; j['hip' + b] = [R(25, 55), 0, -sg * R(0, 10)]; j['knee' + b] = [R(0, 30)]; j['ankle' + b] = [R(0, 30)];
      ik = [{e: 'foot' + f, t: 'hips', o: [sg * .1, -.66, .5]}, {e: 'foot' + b, t: 'hips', o: [-sg * .1, -.6, -.6]}];
    } else if (st === 'unpie') { const s = pick(['L', 'R']), o = s === 'L' ? 'R' : 'L', sg = s === 'L' ? 1 : -1;
      j.hips = [R(-10, 25), R(-40, 40), R(-15, 15)]; j['hip' + s] = [R(-8, 8), 0, sg * R(0, 8)]; j['knee' + s] = [R(0, 25)];
      j['hip' + o] = [R(-110, 45), 0, -sg * R(-10, 60)]; j['knee' + o] = [R(0, 120)]; j['ankle' + o] = [R(-20, 40)];
    } else if (st === 'salto') { for (const s of ['L', 'R']) { const sg = s === 'L' ? 1 : -1; j['hip' + s] = [R(-80, 20), 0, sg * R(0, 30)]; j['knee' + s] = [R(10, 120)]; j['ankle' + s] = [R(10, 40)]; } lift = R(.15, .45); j.hips = [R(-15, 25), R(-30, 30), R(-10, 10)];
    } else if (st === 'agachado') { j.hips = [R(15, 35), R(-20, 20), 0]; for (const s of ['L', 'R']) { const sg = s === 'L' ? 1 : -1; j['hip' + s] = [R(-130, -100), 0, sg * R(8, 25)]; j['knee' + s] = [R(110, 140)]; j['ankle' + s] = [R(-35, -15)]; }
    } else { plant = true; j.hips = [R(-5, 10), R(-60, 60), 0]; j.waist = [0, R(-25, 25), 0]; for (const s of ['L', 'R']) { const sg = s === 'L' ? 1 : -1; j['hip' + s] = [R(-30, 20), 0, sg * R(2, 15)]; j['knee' + s] = [R(5, 40)]; } }
  }
  const spineAmp = k === 'suelo' ? .6 : 1;
  j.waist = [R(-8, 18) * spineAmp, R(-20, 20) * spineAmp, R(-8, 8)]; j.chest = [R(-10, 18) * spineAmp, R(-22, 22) * spineAmp, R(-10, 10)];
  j.neck = [R(-8, 15), R(-25, 25), R(-8, 8)]; j.head = [R(-15, 20), R(-30, 30), R(-12, 12)];
  for (const s of ['L', 'R']) {
    const sg = s === 'L' ? 1 : -1, amp = k === 'accion' ? 1 : .6;
    j['shoulder' + s] = [R(-160, 50) * amp, sg * R(-70, 70), sg * R(4, 40 + 120 * amp), 'ZXY'];
    j['elbow' + s] = [-R(5, k === 'accion' ? 145 : 110)];
  }
  const g = ['relajada', 'relajada', 'abierta', 'puno', 'agarre', 'senalar', 'garra'];
  return {id: 'rand', label: tr('Pose generada'), cat: k, j, ik, lift, stool, plant, hands: {L: pick(g), R: pick(g)}};
}
// after a generated standing pose, put the floating foot back on the floor if it is close
function plantFeet(m) {
  const aL = m.joints.ankleL.getWorldPosition(new V3()), aR = m.joints.ankleR.getWorldPosition(new V3());
  const [hi, lo, e] = aL.y > aR.y ? [aL, aR, 'footL'] : [aR, aL, 'footR'];
  if (hi.y - lo.y < .25 * m.size) { solveIK(m.chains[e], m.joints[EFFECTOR[e]], new V3(hi.x, lo.y, hi.z)); m.ground(); }
}
function applyRandom(m, kind, keep = true) {
  const yaw = keep ? m.yaw() : 0, pos = m.joints.hips.position.clone();
  // a generated pose must not put a limb through the body: up to 10 tries, keeping the least bad one
  let best = null;
  for (let t = 0; t < 10; t++) {
    const p = randomPose(kind);
    m.joints.hips.position.set(pos.x, m.rootY, pos.z);
    applyPreset(m, p, {yaw});
    if (p.plant) plantFeet(m);
    m.joints.hips.position.x = pos.x; m.joints.hips.position.z = pos.z;
    const clip = selfClip(m);
    if (!best || clip < best.clip) best = {p, clip, pose: m.getPose()};
    if (clip <= 0) return p;
  }
  m.setPose(best.pose);
  return best.p;
}
// how deep limbs go into the rest of the body (0 = they only touch, or not even that)
const CLIP_PAIRS = (() => {
  const out = [], limb = s => ['elbow' + s, 'hand' + s, 'knee' + s, 'foot' + s], other = s => s === 'L' ? 'R' : 'L';
  for (const s of ['L', 'R']) {
    for (const a of ['elbow' + s, 'hand' + s]) for (const b of ['hips', 'waist', 'chest', 'head', 'hip' + s, 'knee' + s, 'foot' + s, ...limb(other(s)), 'hip' + other(s), 'shoulder' + other(s)]) out.push([a, b]);
    for (const a of ['knee' + s, 'foot' + s]) for (const b of ['chest', 'head', 'knee' + other(s), 'foot' + other(s), 'hip' + other(s)]) out.push([a, b]);
  }
  const seen = new Set(); return out.filter(pr => { const k = [...pr].sort().join('|'); return !seen.has(k) && seen.add(k); });
})();
function segSegDist(p1, q1, p2, q2) {
  const d1 = _sa.subVectors(q1, p1), d2 = _sb.subVectors(q2, p2), r = _sc.subVectors(p1, p2);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
  let s, t;
  if (a < 1e-9 && e < 1e-9) return p1.distanceTo(p2);
  if (a < 1e-9) { s = 0; t = clamp(f / e, 0, 1); }
  else {
    const c = d1.dot(r);
    if (e < 1e-9) { t = 0; s = clamp(-c / a, 0, 1); }
    else { const b = d1.dot(d2), den = a * e - b * b; s = den > 1e-9 ? clamp((b * f - c * e) / den, 0, 1) : 0; t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); } }
  }
  return _sd.copy(p1).addScaledVector(d1, s).distanceTo(_se.copy(p2).addScaledVector(d2, t));
}
const _sa = new V3(), _sb = new V3(), _sc = new V3(), _sd = new V3(), _se = new V3();
function selfClip(m) {
  const caps = Object.fromEntries(bodyCapsules(m).map(c => [c.k, c]));
  let worst = 0;
  for (const [a, b] of CLIP_PAIRS) {
    const A = caps[a], B = caps[b]; if (!A || !B) continue;
    // touching is fine (hands on hips, crossed arms): only count clear overlap
    worst = Math.max(worst, (A.r + B.r) * .75 - segSegDist(A.a, A.b, B.a, B.b));
  }
  return worst;
}

/* ---------- ghost: freeze the current pose to compare ---------- */
let ghostMesh = null;
function clearGhost() { if (ghostMesh) { scene.remove(ghostMesh); ghostMesh.geometry.dispose(); ghostMesh = null; } ghostPose = null; }
function makeGhost() {
  clearGhost();
  const m = mq.body3, p = m.geometry.attributes.position, arr = new Float32Array(p.count * 3), v = new V3();
  mq.group.updateMatrixWorld(true); mq.skeleton.update();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); m.boneTransform(i, v); v.applyMatrix4(m.matrixWorld); arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z; }
  const g = new THREE.BufferGeometry(); g.setIndex(m.geometry.index); g.setAttribute('position', new THREE.BufferAttribute(arr, 3)); g.computeVertexNormals();
  ghostMesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({color: 0x2b5a9e, transparent: true, opacity: .22, depthWrite: false, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4}));
  ghostMesh.renderOrder = 5; scene.add(ghostMesh); rememberGhost();
}

/* ---------- gaze ---------- */
function lookAtPoint(m, target) {
  if (!target) { m.joints.neck.quaternion.identity(); m.joints.head.quaternion.identity(); return; }
  for (const [n, f, max] of [['neck', .4, 45], ['head', 1, 70]]) {
    const j = m.joints[n]; m.group.updateMatrixWorld(true);
    const hp = m.joints.head.getWorldPosition(new V3()).add(new V3(0, m.headH * .45, 0));
    const want = target.clone().sub(hp).normalize(), wq = j.getWorldQuaternion(new Q()), fwd = new V3(0, 0, 1).applyQuaternion(wq);
    const qf = new Q().slerpQuaternions(new Q(), new Q().setFromUnitVectors(fwd, want), f);
    const pq = j.parent.getWorldQuaternion(new Q());
    let local = pq.clone().invert().multiply(qf).multiply(pq).multiply(j.quaternion);
    const ang = 2 * Math.acos(clamp(Math.abs(local.w), -1, 1));
    if (ang > max * DEG) local = new Q().slerpQuaternions(new Q(), local, max * DEG / ang);
    j.quaternion.copy(local);
  }
}
function lookTarget(kind) {
  if (kind === 'camara') return camera.position.clone();
  if (kind === 'otro') {
    const me = mq.joints.head.getWorldPosition(new V3()); let best = null, bd = Infinity;
    for (const m of chars) if (m !== mq) { const h = m.joints.head.getWorldPosition(new V3()); const d = h.distanceTo(me); if (d < bd) { bd = d; best = h; } }
    return best;
  }
  return null;
}
const LOOKS = {frente: 'Al frente', camara: 'A la cámara', otro: 'Al otro personaje'};

/* ---------- symmetry ---------- */
function mirrorJoint(m, name) {
  const o = swapSide(name); if (o === name || !m.joints[o]) return;
  const q = m.joints[name].quaternion; m.joints[o].quaternion.set(q.x, -q.y, -q.z, q.w);
}

/* ---------- props held in a hand ---------- */
// where each object is gripped: y = height of the handle (long tools, blade out of the thumb side), ball = radius;
// anything else hangs from its top (lantern, suitcase, bucket)
const GRIP = {espada: {y: .84}, baston: {y: 1.0}, balon: {ball: .12}, r_balon: {ball: .11}, r_katana: {y: .15}, r_bate: {y: .12}, r_hacha: {y: .1}};
// what the practice randomizer puts in a hand
const HOLDABLE = ['espada', 'baston', 'balon', 'r_katana', 'r_bate', 'r_hacha', 'r_farol', 'r_maleta', 'r_cubo', 'r_balon'];
function holdProp(g, m, side) {
  releaseProp(g);
  const J = m.J, jp = n => new V3(J[FIG.jIdx[n] * 3], J[FIG.jIdx[n] * 3 + 1], J[FIG.jIdx[n] * 3 + 2]);
  const w = jp('wrist' + side), mid = jp(`f${side}20`), ix = jp(`f${side}10`), pk = jp(`f${side}40`), n = m.handAxes[side].n.clone();
  const d = mid.clone().sub(w).normalize(), t = ix.clone().sub(pk).normalize();
  const palm = mid.clone().sub(w).multiplyScalar(.8).addScaledVector(n, .028 * m.size);
  const wr = m.joints['wrist' + side], type = g.userData.prop, sp = GRIP[type];
  wr.add(g);
  if (sp && sp.ball) { g.quaternion.identity(); g.position.copy(palm).addScaledVector(n, sp.ball * .85).sub(new V3(0, sp.ball, 0).multiply(g.scale)); }
  else {
    const y = sp ? t : d.clone().negate(), z = (sp ? d : n).clone().addScaledVector(y, -(sp ? d : n).dot(y)).normalize(), x = new V3().crossVectors(y, z);
    g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    const gy = sp ? sp.y : g.userData.box.max.y - .03;
    g.position.copy(palm).sub(new V3(0, gy, 0).multiply(g.scale).applyQuaternion(g.quaternion));
  }
  g.userData.held = {m, side};
  m.hands[side] = gest(sp && sp.ball ? 'garra' : 'agarre'); m.applyHands();
}
function releaseProp(g) { if (!g.userData.held) return; scene.attach(g); g.userData.held = null; if (g.position.y < 0) g.position.y = 0; }

/* ---------- does a held object touch anything? ----------
   Bodies are capsules along the bones, each as thick as the skinned mesh around that bone (measured on the posed
   mesh, so it follows body type and pose; generous, plus a margin for clothes and sculpted heads). The object is
   sampled on its surface every few cm; a sample inside a capsule, another object, a piece of scenery or under the
   floor is a collision. The hand that holds it is allowed, and so is the forearm right at the grip. */
const SEG_OF = {hips: 'hips', waist: 'waist', chest: 'chest', neck: 'neck', head: 'head', jaw: 'head', shoulderL: 'shoulderL', elbowL: 'elbowL', wristL: 'handL',
  shoulderR: 'shoulderR', elbowR: 'elbowR', wristR: 'handR', hipL: 'hipL', kneeL: 'kneeL', ankleL: 'footL', hipR: 'hipR', kneeR: 'kneeR', ankleR: 'footR'};
const SEG_ENDS = {hips: ['hips', 'waist'], waist: ['waist', 'chest'], chest: ['chest', 'neck'], neck: ['neck', 'head'], head: ['head', null], shoulderL: ['shoulderL', 'elbowL'],
  elbowL: ['elbowL', 'wristL'], handL: ['wristL', null], shoulderR: ['shoulderR', 'elbowR'], elbowR: ['elbowR', 'wristR'], handR: ['wristR', null],
  hipL: ['hipL', 'kneeL'], kneeL: ['kneeL', 'ankleL'], footL: ['ankleL', null], hipR: ['hipR', 'kneeR'], kneeR: ['kneeR', 'ankleR'], footR: ['ankleR', null]};
const segDist = (p, a, b) => { const ab = _sv.subVectors(b, a), t = clamp(_sw.subVectors(p, a).dot(ab) / (ab.lengthSq() || 1), 0, 1); return p.distanceTo(_sw.copy(a).addScaledVector(ab, t)); };
const _sv = new V3(), _sw = new V3();
function bodyCapsules(m) {
  m.group.updateMatrixWorld(true); m.skeleton.update();
  const mesh = m.body3, names = FIG.meta.bones, nV = FIG.meta.nV, wp = n => m.joints[n].getWorldPosition(new V3());
  const caps = {}; for (const k in SEG_ENDS) caps[k] = {a: wp(SEG_ENDS[k][0]), b: SEG_ENDS[k][1] ? wp(SEG_ENDS[k][1]) : null, pts: []};
  const v = new V3(); m.group.updateMatrixWorld(true); m.skeleton.update();  // boneTransform skins the position it is given, from the skeleton's matrices
  for (let i = 0; i < nV; i += 3) {
    const n = names[m.dom[i]], k = SEG_OF[n] || (/^f[LR]/.test(n) ? 'hand' + n[1] : null); if (!k) continue;
    v.fromBufferAttribute(mesh.geometry.attributes.position, i); mesh.boneTransform(i, v); caps[k].pts.push(v.clone().applyMatrix4(mesh.matrixWorld));
  }
  const pad = .015 * m.size + (m.outfit && m.outfit.length ? .025 * m.size : 0), out = [];
  for (const [k, c] of Object.entries(caps)) {
    if (!c.pts.length) continue;
    // open ends (head top, hand, foot): the farthest skinned point of that part
    if (!c.b) { let far = c.a, fd = 0; for (const p of c.pts) { const d = p.distanceTo(c.a); if (d > fd) { fd = d; far = p; } } c.b = c.a.clone().lerp(far, .85); }
    const ds = c.pts.map(p => segDist(p, c.a, c.b)).sort((x, y) => x - y);
    let r = ds[Math.floor(ds.length * .92)] + pad;
    if (k === 'head' && m.body.species !== 'humano') r *= 1.35;
    out.push({k, a: c.a, b: c.b, r});
  }
  // tails and dragon tails: a capsule per tail bone
  if (m.hasTail) { const sp = SPECIES[m.body.species], r = (sp.tail ? sp.tail.r : .05) * m.size + pad, t = ['tail1', 'tail2', 'tail3'].map(wp);
    out.push({k: 'tail', a: t[0], b: t[1], r}, {k: 'tail', a: t[1], b: t[2], r}, {k: 'tail', a: t[2], b: t[2].clone().add(t[2].clone().sub(t[1])), r}); }
  // sculpted heads, horns, claws, tails and ears are their own meshes: their real vertices go in a 3 cm grid
  if (m.acc && m.acc.length) {
    m.accSkeleton.update(); const grid = new Map(), cell = .03;
    for (const am of m.acc) {
      if (!am.isSkinnedMesh || !am.visible || am.userData.hull) continue;
      const pos = am.geometry.attributes.position;
      for (let i = 0; i < pos.count; i += 2) {
        v.fromBufferAttribute(pos, i); am.boneTransform(i, v); v.applyMatrix4(am.matrixWorld);
        const k = `${Math.floor(v.x / cell)},${Math.floor(v.y / cell)},${Math.floor(v.z / cell)}`;
        (grid.get(k) || grid.set(k, []).get(k)).push(v.clone());
      }
    }
    out.grid = grid; out.cell = cell;
  }
  // animal ears stand up from the head
  if (m.hasEars) { const up = new V3(0, 1, 0).applyQuaternion(m.joints.head.getWorldQuaternion(new Q())), len = .55 * m.headH;
    for (const s of ['L', 'R']) { const a = wp('ear' + s); out.push({k: 'ear', a, b: a.clone().addScaledVector(up, len), r: .06 * m.size + pad}); } }
  return out;
}
// surface samples of an object in its own space, every ~2.5 cm (cached per type)
const PROP_SAMPLES = {};
function propSamples(g) {
  const key = g.userData.prop; if (PROP_SAMPLES[key]) return PROP_SAMPLES[key];
  g.updateMatrixWorld(true);
  const inv = g.matrixWorld.clone().invert(), h = .025, seen = new Set(), out = [], a = new V3(), b = new V3(), c = new V3(), p = new V3();
  g.traverse(o => {
    if (!o.isMesh || o.userData.isHull) return;
    const m4 = inv.clone().multiply(o.matrixWorld), pos = o.geometry.attributes.position, idx = o.geometry.index, n = idx ? idx.count : pos.count;
    for (let t = 0; t < n; t += 3) {
      const ia = idx ? idx.getX(t) : t, ib = idx ? idx.getX(t + 1) : t + 1, ic = idx ? idx.getX(t + 2) : t + 2;
      a.fromBufferAttribute(pos, ia).applyMatrix4(m4); b.fromBufferAttribute(pos, ib).applyMatrix4(m4); c.fromBufferAttribute(pos, ic).applyMatrix4(m4);
      const s = Math.min(24, Math.ceil(Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)) / h));
      for (let i = 0; i <= s; i++) for (let j = 0; j <= s - i; j++) {
        p.set(0, 0, 0).addScaledVector(a, (s - i - j) / s).addScaledVector(b, i / s).addScaledVector(c, j / s);
        const kk = `${Math.round(p.x / h * 2)},${Math.round(p.y / h * 2)},${Math.round(p.z / h * 2)}`;
        if (!seen.has(kk)) { seen.add(kk); out.push(p.clone()); }
      }
    }
  });
  return (PROP_SAMPLES[key] = out);
}
// scenery that could be hit: not what a character stands in or sits on, nor what is hidden because a character clips it
const standsIn = () => { const js = chars.flatMap(m => ['hips', 'head', 'ankleL', 'ankleR'].map(n => m.joints[n].getWorldPosition(new V3()))); return b => js.some(p => b.containsPoint(p)); };
function sceneryBoxes() { const inside = standsIn(); return OCC.filter(c => !c.force && !inside(c.b)).map(c => c.b); }
// practice poses land anywhere in a random set: a piece of scenery a body goes through is hidden for that pose (like the camera cutaway)
function hideClashingScenery(caps) {
  const inside = standsIn(), p = new V3(), e = new THREE.Box3();
  for (const c of OCC) {
    if (inside(c.b)) continue;
    const hit = caps.some(([, list]) => list.some(s => { e.copy(c.b).expandByScalar(s.r); const n = Math.max(1, Math.ceil(s.a.distanceTo(s.b) / .03));
      for (let i = 0; i <= n; i++) if (e.containsPoint(p.lerpVectors(s.a, s.b, i / n))) return true; return false; }));
    if (hit) { c.force = true; c.o.visible = false; }
  }
}
function showForcedScenery() { for (const c of OCC) if (c.force) { c.force = false; c.o.visible = !c.hidden; } }
function propCollides(g, caps, boxes) {
  g.updateMatrixWorld(true);
  const h = g.userData.held, holder = h && h.m, grip = holder && holder.joints['wrist' + h.side].getWorldPosition(new V3()), gripR = holder ? .16 * holder.size : 0;
  const others = props.filter(o => o !== g).map(o => { o.updateMatrixWorld(true); return {inv: o.matrixWorld.clone().invert(), box: o.userData.box.clone().expandByScalar(.01)}; });
  const q = new V3(), l = new V3();
  for (const s of propSamples(g)) {
    q.copy(s).applyMatrix4(g.matrixWorld);
    if (q.y < -.005) return 'suelo';
    for (const [m, list] of caps) for (const c of list) {
      if (m === holder && (c.k === 'hand' + h.side || (c.k === 'elbow' + h.side && q.distanceTo(grip) < gripR))) continue;
      if (segDist(q, c.a, c.b) < c.r) return m === holder ? 'cuerpo' : 'otro';
    }
    for (const [m, list] of caps) {
      if (!list.grid || (m === holder && q.distanceTo(grip) < gripR)) continue;
      const cs = list.cell, gx = Math.floor(q.x / cs), gy = Math.floor(q.y / cs), gz = Math.floor(q.z / cs);
      for (let x = gx - 1; x <= gx + 1; x++) for (let y = gy - 1; y <= gy + 1; y++) for (let z = gz - 1; z <= gz + 1; z++) {
        const pts = list.grid.get(`${x},${y},${z}`); if (pts) for (const p of pts) if (p.distanceTo(q) < cs) return 'anthro';
      }
    }
    for (const o of others) if (o.box.containsPoint(l.copy(q).applyMatrix4(o.inv))) return 'objeto';
    for (const b of boxes) if (b.containsPoint(q)) return 'escenario';
  }
  return null;
}

/* ---------- sun handle: drag the key light around the cast ---------- */
const sunHandle = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({color: 0xf2b23a, depthTest: false, transparent: true, opacity: .95}));
sunHandle.renderOrder = 999; sunHandle.userData.id = 'sun'; scene.add(sunHandle);
const sunRing = new THREE.Mesh(new THREE.TorusGeometry(1, .004, 4, 64), new THREE.MeshBasicMaterial({color: 0xf2b23a, depthTest: false, transparent: true, opacity: .5}));
sunRing.renderOrder = 998; scene.add(sunRing);
let sunR = 2;
function updateSun() {
  const show = $('#sunChk').checked && state.tab === 'escena' && $('#secLuz').open && !practice.active && !sk.on;
  sunHandle.visible = sunRing.visible = show; if (!show) return;
  sunR = 1.5 * (chars.reduce((s, m) => s + m.size, 0) / chars.length);
  const az = state.light.az * DEG, el = state.light.el * DEG;
  sunHandle.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(sunR).add(castCenter);
  sunHandle.scale.setScalar(camera.position.distanceTo(sunHandle.position) * Math.tan(camera.fov * DEG / 2) * .035);
  sunRing.position.copy(castCenter).setY(castCenter.y + Math.sin(el) * sunR); sunRing.rotation.x = Math.PI / 2;
  sunRing.scale.setScalar(Math.cos(el) * sunR);
}
function dragSun(ray) {
  const sph = new THREE.Sphere(castCenter, sunR), hit = ray.ray.intersectSphere(sph, new V3());
  const p = hit || ray.ray.closestPointToPoint(castCenter, new V3());
  const d = p.sub(castCenter).normalize();
  state.light.az = Math.round(Math.atan2(d.x, d.z) / DEG); state.light.el = Math.round(clamp(Math.asin(clamp(d.y, -1, 1)) / DEG, -40, 90));
  state.lightPreset = null; setPressed($('#lightChips'), ''); syncLightUI();
}

/* ---------- full scene: cast + scenery + props + lights (+ camera) ---------- */
function serializeProp(g) {
  const h = g.userData.held;
  return {t: g.userData.prop, p: g.position.toArray().map(v => +v.toFixed(4)), q: g.quaternion.toArray().map(v => +v.toFixed(4)), s: g.scale.toArray().map(v => +v.toFixed(3)),
    h: h ? {c: chars.indexOf(h.m), side: h.side} : null, r: g.userData.ride ? {c: chars.indexOf(g.userData.ride.m), kind: g.userData.ride.kind, side: g.userData.ride.side, L: g.userData.ride.L} : null};
}
function serializeLight(g) { const l = g.userData.ref.light; return {t: g.userData.light, p: g.position.toArray().map(v => +v.toFixed(3)), c: g.userData.color, i: +l.intensity.toFixed(2), d: +l.distance.toFixed(1)}; }
function sceneExtras(withCam) {
  const o = {env: state.env, amb: state.amb, props: props.map(serializeProp), lights: extraLights.map(serializeLight)};
  if (withCam) { o.cam = {p: camera.position.toArray(), t: controls.target.toArray(), f: state.focal, r: state.roll}; o.look = {style: state.style, form: state.form, light: state.light, lineMode: state.lineMode}; const an = typeof animState === 'function' && animState(); if (an) o.anim = an; }
  return o;
}
function clearProps() { for (const p of [...props]) { releaseProp(p); scene.remove(p); } props.length = 0; }
function clearLights() { for (const g of [...extraLights]) { scene.remove(g); if (g.userData.ref.light.isSpotLight) scene.remove(g.userData.ref.light.target); } extraLights.length = 0; }
function applySceneExtras(o) {
  if (o.anim && typeof applyAnimState === 'function') applyAnimState(o.anim);
  if (o.env && o.env !== state.env) { setEnv(o.env); $('#envChips').querySelectorAll('.chip').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === o.env))); }
  if (o.amb && o.amb !== state.amb) { state.amb = o.amb; applyAmbient(); setPressed($('#ambChips'), o.amb); }
  if (o.props && JSON.stringify(props.map(serializeProp)) !== JSON.stringify(o.props)) {
    if (state.sel && state.sel.kind === 'prop') { tc.detach(); state.sel = null; $('#objCard').hidden = true; }
    clearProps();
    for (const d of o.props) {
      if (!PROP_BUILD[d.t]) continue;
      const g = makeProp(d.t, new V3()); setOutlines(g, state.envOutline);
      g.scale.fromArray(d.s);
      if (d.h && chars[d.h.c]) { chars[d.h.c].joints['wrist' + d.h.side].add(g); g.userData.held = {m: chars[d.h.c], side: d.h.side}; }
      g.position.fromArray(d.p); g.quaternion.fromArray(d.q);
      if (d.r && chars[d.r.c]) g.userData.ride = {m: chars[d.r.c], kind: d.r.kind, side: d.r.side, L: d.r.L};
    }
  }
  if (o.lights && JSON.stringify(extraLights.map(serializeLight)) !== JSON.stringify(o.lights)) {
    if (state.sel && state.sel.kind === 'light') { tc.detach(); state.sel = null; $('#objCard').hidden = true; }
    clearLights();
    for (const d of o.lights) {
      const g = makeLight(d.t, new V3().fromArray(d.p)), l = g.userData.ref.light, c = (LIGHT_COLORS[d.c] || LIGHT_COLORS.calida)[1];
      g.userData.color = d.c; l.color.set(c); g.userData.ref.bulb.material.color.set(c); l.intensity = d.i; l.distance = d.d;
    }
  }
  if (o.cam) { camera.position.fromArray(o.cam.p); controls.target.fromArray(o.cam.t); $('#focal').value = o.cam.f; setFocal(o.cam.f, false); setRoll(o.cam.r); controls.update(); }
  if (o.look) {
    if (o.look.style) { state.style = o.look.style; setPressed($('#styleChips'), state.style); }
    if (o.look.lineMode) { state.lineMode = o.look.lineMode; setPressed($('#lineChips'), state.lineMode); }
    if (o.look.form) setForm(o.look.form);
    if (o.look.light) { state.light = {...o.look.light}; state.lightPreset = null; syncLightUI(); }
    applyDrawing();
  }
}

/* ---------- frame (panel) guides ---------- */
const RATIOS = {libre: ['Libre', 0], '16:9': ['16:9', 16 / 9], '3:2': ['3:2', 1.5], '4:3': ['4:3', 4 / 3], '1:1': ['1:1', 1], '3:4': ['3:4', .75], '2:3': ['2:3', 2 / 3], a4: ['A4 vertical', 1 / 1.4142], tira: ['Tira de cómic', 3]};
function frameRect(w, h) {
  const r = RATIOS[state.ratio || 'libre'][1]; if (!r) return {x: 0, y: 0, w, h};
  const fw = w / h > r ? h * r * .94 : w * .94, fh = fw / r;
  return {x: (w - fw) / 2, y: (h - fh) / 2, w: fw, h: fh};
}
function drawFrame(ctx, w, h) {
  if (!RATIOS[state.ratio || 'libre'][1]) return;
  const f = frameRect(w, h);
  ctx.save(); ctx.fillStyle = themeInk.page; ctx.globalAlpha = .72;
  ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.rect(f.x, f.y, f.w, f.h); ctx.fill('evenodd');
  ctx.globalAlpha = 1; ctx.strokeStyle = themeInk.ink; ctx.lineWidth = 2; ctx.strokeRect(f.x, f.y, f.w, f.h); ctx.restore();
}

/* ---------- line of action ---------- */
function drawAction(ctx, w, h) {
  ctx.save(); ctx.strokeStyle = themeInk.red; ctx.lineWidth = 3.5; ctx.globalAlpha = .85; ctx.lineCap = 'round';
  for (const m of chars) {
    if (!m.group.visible) continue;
    const J = m.joints, wp = o => o.getWorldPosition(new V3());
    const aL = wp(J.ankleL), aR = wp(J.ankleR), s = aL.y < aR.y ? 'L' : 'R';
    const top = wp(J.head).add(new V3(0, 1, 0).applyQuaternion(J.head.getWorldQuaternion(new Q())).multiplyScalar(m.headH * .85));
    const pts = [top, wp(J.neck), wp(J.chest), wp(J.hips), wp(J['knee' + s]), wp(J['ankle' + s])].map(v => toScreen(v, w, h));
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      ctx.bezierCurveTo(p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6, p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6, p2.x, p2.y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/* ---------- construction forms ---------- */
const FORM_MODES = {figura: 'Figura', formas: 'Formas básicas', mixto: 'Figura + formas', esqueleto: 'Esqueleto'};
function setForm(mode) {
  state.form = mode; setPressed($('#formChips'), mode);
  for (const m of chars) m.setFormMode(mode);
  $('#skelNote').hidden = mode !== 'esqueleto';
}

/* ---------- scene as text ---------- */
function openJson(text) {
  $('#jsonModal').hidden = false; $('#jsonText').value = text || ''; $('#jsonMsg').textContent = tr(text ? 'Copia este texto para guardar o compartir la escena.' : 'Pega aquí el texto de una escena y pulsa Cargar.');
  $('#jsonText').focus(); $('#jsonText').select();
}
function buildJsonUI() {
  $('#copyScene').onclick = () => openJson(JSON.stringify({cdp: 1, ...snapshot(), ...sceneExtras(true)}));
  $('#pasteScene').onclick = () => openJson('');
  $('#jsonClose').onclick = () => $('#jsonModal').hidden = true;
  $('#jsonModal').onclick = e => { if (e.target.id === 'jsonModal') $('#jsonModal').hidden = true; };
  $('#jsonCopy').onclick = () => {
    const t = $('#jsonText'); t.select();
    (navigator.clipboard ? navigator.clipboard.writeText(t.value) : Promise.reject()).then(() => $('#jsonMsg').textContent = tr('Copiado.')).catch(() => $('#jsonMsg').textContent = tr('Selecciona el texto y cópialo con Ctrl+C.'));
  };
  $('#jsonLoad').onclick = () => {
    try { const o = JSON.parse($('#jsonText').value); if (!o.chars) throw 0; restore(o); frameAll(); pushHistory(); $('#jsonModal').hidden = true; }
    catch (_) { $('#jsonMsg').textContent = tr('Ese texto no es una escena válida. Copia de nuevo el texto completo.'); }
  };
}

/* ---------- saved camera views ---------- */
function renderViews() {
  const box = $('#viewList'); box.innerHTML = '';
  (state.views || []).forEach((v, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = tr('Vista {n}', {n: i + 1});
    b.onclick = () => { camera.position.fromArray(v.p); controls.target.fromArray(v.t); $('#focal').value = v.f; setFocal(v.f, false); setRoll(v.r); controls.update(); };
    const x = document.createElement('span'); x.className = 'chipx'; x.textContent = '×'; x.title = tr('Borrar vista');
    x.onclick = e => { e.stopPropagation(); state.views.splice(i, 1); renderViews(); };
    b.appendChild(x); box.appendChild(b);
  });
}

/* ---------- wiring for the tools ---------- */
function buildToolsUI() {
  buildSketchUI(); buildJsonUI();
  chips($('#randChips'), Object.entries(RAND_KINDS), null, k => { setPressed($('#randChips'), ''); applyRandom(mq, k); state.posePreset = null; markPose(); syncAll(); pushHistory(); });
  chips($('#lookChips'), Object.entries(LOOKS), null, k => { setPressed($('#lookChips'), ''); lookAtPoint(mq, lookTarget(k)); syncJointSliders(); pushHistory(); });
  $('#ghostBtn').onclick = () => { makeGhost(); $('#ghostClr').disabled = false; };
  $('#ghostClr').onclick = () => { clearGhost(); $('#ghostClr').disabled = true; };
  $('#ghostClr').disabled = true;
  $('#symChk').onchange = e => { state.sym = e.target.checked; if (state.sym && state.selected) { mirrorJoint(mq, state.selected); pushHistory(); } };
  $('#poseSearch').oninput = () => buildPoseGrid();
  chips($('#ratioChips'), Object.entries(RATIOS).map(([k, v]) => [k, v[0]]), state.ratio, k => state.ratio = k);
  $('#saveView').onclick = () => { if (state.views.length >= 8) state.views.shift(); state.views.push({p: camera.position.toArray(), t: controls.target.toArray(), f: state.focal, r: state.roll}); renderViews(); };
  renderViews();
  const ga = $('#gAction'); ga.checked = state.guides.action; ga.onchange = () => state.guides.action = ga.checked;
}
