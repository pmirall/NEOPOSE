/* ======================= layers, and "open in" your drawing program =======================
   A reference is more useful in layers: the set, each character on its own, the ink lines, your sketch, and an
   empty layer on top to draw on. They go out as a layered PSD (Photoshop, Clip Studio Paint, Krita, GIMP,
   Affinity, Photopea, Procreate and ibisPaint all open it) or, for animation, as one image sequence per layer
   (Krita and Clip Studio import each sequence as an animated layer).
   "Open in…" does it in one go: on the desktop app it finds the drawing programs installed and opens the file in
   the one you pick; in the Flatpak, the system's own "open with"; on Android, the share sheet (Krita, ibisPaint,
   Clip Studio, Medibang…); in a browser, the picture goes to the clipboard to paste and the PSD is downloaded. */

/* ---------- PSD: 8-bit RGBA layers, RLE (PackBits) channels, unicode layer names ---------- */
function packBits(row) {
  const out = [], n = row.length; let i = 0;
  while (i < n) {
    let run = 1; while (i + run < n && run < 128 && row[i + run] === row[i]) run++;
    if (run >= 2) { out.push(257 - run, row[i]); i += run; continue; }  // a repeat: -(run - 1), then the byte
    const start = i; let len = 0;
    while (i < n && len < 128 && !(i + 1 < n && row[i] === row[i + 1])) { i++; len++; }
    if (!len) { i++; len = 1; }
    out.push(len - 1); for (let k = start; k < start + len; k++) out.push(row[k]);
  }
  return out;
}
// one channel of an RGBA image as RLE: row byte counts, then the rows
function rleChannel(px, w, h, c) {
  const rows = [], row = new Uint8Array(w); let total = 0;
  for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) row[x] = px[(y * w + x) * 4 + c]; const r = packBits(row); rows.push(r); total += r.length; }
  const out = new Uint8Array(h * 2 + total), dv = new DataView(out.buffer); let o = h * 2;
  rows.forEach((r, y) => { dv.setUint16(y * 2, r.length); out.set(r, o); o += r.length; });
  return out;
}
function psdBytes(w, h, layers) {
  const parts = [], push = a => parts.push(a), u8 = n => new Uint8Array([n]), u16 = n => { const a = new Uint8Array(2); new DataView(a.buffer).setUint16(0, n); return a; },
    i16 = n => { const a = new Uint8Array(2); new DataView(a.buffer).setInt16(0, n); return a; }, u32 = n => { const a = new Uint8Array(4); new DataView(a.buffer).setUint32(0, n); return a; },
    i32 = n => { const a = new Uint8Array(4); new DataView(a.buffer).setInt32(0, n); return a; }, str = s => new TextEncoder().encode(s);
  const cat = list => { const n = list.reduce((a, b) => a + b.length, 0), o = new Uint8Array(n); let k = 0; for (const b of list) { o.set(b, k); k += b.length; } return o; };
  // header
  push(cat([str('8BPS'), u16(1), new Uint8Array(6), u16(4), u32(h), u32(w), u16(8), u16(3)]));
  push(u32(0)); push(u32(0));  // colour mode data, image resources
  // layer records and their channel data (bottom layer first)
  const recs = [], data = [];
  for (const L of layers) {
    const px = L.canvas.getContext('2d').getImageData(0, 0, w, h).data, ch = [[-1, 3], [0, 0], [1, 1], [2, 2]].map(([id, c]) => ({id, d: rleChannel(px, w, h, c)}));
    const ascii = (L.name.replace(/\s*·\s*/g, ' - ').normalize('NFD').replace(/[^\x20-\x7e]/g, '') || 'Layer').slice(0, 63), padN = (4 - (ascii.length + 1) % 4) % 4;
    const uni = [...L.name].map(c => c.charCodeAt(0)), luniLen = 4 + uni.length * 2 + (uni.length * 2 + 4) % 4;
    const luni = cat([str('8BIM'), str('luni'), u32(luniLen), u32(uni.length), ...uni.map(u16), new Uint8Array((uni.length * 2 + 4) % 4)]);
    const extra = cat([u32(0), u32(0), u8(ascii.length), str(ascii), new Uint8Array(padN), luni]);
    recs.push(cat([i32(0), i32(0), i32(h), i32(w), u16(4), ...ch.flatMap(c => [i16(c.id), u32(c.d.length + 2)]), str('8BIM'), str('norm'), u8(Math.round((L.opacity ?? 1) * 255)), u8(0), u8(L.hidden ? 2 : 0), u8(0), u32(extra.length), extra]));
    for (const c of ch) data.push(cat([u16(1), c.d]));
  }
  let layerInfo = cat([i16(layers.length), ...recs, ...data]); if (layerInfo.length % 2) layerInfo = cat([layerInfo, u8(0)]);
  push(cat([u32(layerInfo.length + 4 + 4), u32(layerInfo.length), layerInfo, u32(0)]));
  // the merged image: every visible layer flattened
  const flat = document.createElement('canvas'); flat.width = w; flat.height = h; const fc = flat.getContext('2d');
  for (const L of layers) if (!L.hidden) { fc.globalAlpha = L.opacity ?? 1; fc.drawImage(L.canvas, 0, 0); }
  const fp = fc.getImageData(0, 0, w, h).data, chans = [0, 1, 2, 3].map(c => rleChannel(fp, w, h, c));
  push(u16(1)); for (const c of chans) push(c.subarray(0, h * 2)); for (const c of chans) push(c.subarray(h * 2));
  return cat(parts);
}

/* ---------- the layers of the current view ---------- */
async function renderLayerSet(subsFrame) {
  const keep = {bg: ex.bg, guides: $('#exGuides').checked, sketch: $('#exSketch').checked}, vis = chars.map(m => m.group.visible), stools = chars.map(m => m.stoolMesh && m.stoolMesh.visible), pv = props.map(p => p.visible);
  const only = f => chars.forEach((m, i) => { m.group.visible = vis[i] && f(i); if (m.avatar) m.avatar.root.visible = m.group.visible; if (m.stoolMesh) m.stoolMesh.visible = stools[i] && f(i); });
  const layers = [];
  ex.userGuides = keep.guides; $('#exGuides').checked = false; $('#exSketch').checked = false;  // (no guides drawn over the layers, but the centre line and the grid stay as asked)
  try {
    ex.bg = keep.bg === 'alpha' || keep.bg === 'lines' ? 'alpha' : 'paper'; only(() => false);
    layers.push({name: tr('Escenario'), canvas: renderExportCanvas()});
    ex.bg = 'alpha'; props.forEach(p => { if (!(p.userData.held)) p.visible = false; });
    for (let i = 0; i < chars.length; i++) { if (!vis[i]) continue; only(j => j === i); layers.push({name: `${tr('Personaje')} ${i + 1} · ${charName(chars[i])}`, canvas: renderExportCanvas()}); }
    ex.bg = 'lines'; only(() => true); layers.push({name: tr('Líneas'), canvas: renderExportCanvas(), opacity: .9});
    if (sketchInExport()) { ex.bg = 'alpha'; only(() => false); if (envGroup) envGroup.visible = false; $('#exSketch').checked = true; const c = renderExportCanvas(); layers.push({name: tr('Boceto'), canvas: c}); }
    if (subsFrame != null && typeof burnSubs === 'function' && shot() && shot().lines.some(l => l.text.trim())) {  // the same folders in every frame of a shot that has dialogue
      const c = document.createElement('canvas'); c.width = layers[0].canvas.width; c.height = layers[0].canvas.height; burnSubs(c, subsFrame); layers.push({name: tr('Subtítulos'), canvas: c}); }
  } finally {
    ex.bg = keep.bg; ex.userGuides = undefined; $('#exGuides').checked = keep.guides; $('#exSketch').checked = keep.sketch; only(() => true); props.forEach((p, i) => p.visible = pv[i]);
  }
  const top = document.createElement('canvas'); top.width = layers[0].canvas.width; top.height = layers[0].canvas.height; layers.push({name: tr('Dibuja aquí'), canvas: top});
  return layers;
}
async function layeredPSD() { const L = await renderLayerSet(); return psdBytes(L[0].canvas.width, L[0].canvas.height, L); }
async function savePSD() {
  $('#exMsg').textContent = tr('Preparando las capas…'); await new Promise(r => setTimeout(r, 30));
  const bytes = await layeredPSD(); saveFile(`neopose-${stamp()}.psd`, bytes, 'image/vnd.adobe.photoshop');
  $('#exMsg').textContent = tr('PSD con capas: escenario, cada personaje, líneas{s} y una capa vacía para dibujar.', {s: sketchInExport() ? ', ' + tr('boceto') : ''});
}

/* ---------- open in… ---------- */
const nativeShell = () => window.neoposeNative || null;
// a plain browser cannot start a program: "Open in…" copies the picture and downloads the PSD (asked each time: the desktop app's bridge can arrive after boot)
function openInIsBrowser() { const cap = window.Capacitor; return !nativeShell() && !(cap && cap.isNativePlatform && cap.isNativePlatform()); }
// from the top bar the export window is closed: the news goes to a note on the canvas
const oiMsg = t => { $('#exMsg').textContent = t; if ($('#exportModal').hidden) toast(t); };
async function openIn() {
  const N = nativeShell(), cap = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
  if (N) {
    const apps = await N.apps().catch(() => []);
    return showOpenIn(apps);
  }
  oiMsg(tr('Preparando las capas…')); await new Promise(r => setTimeout(r, 30));
  const bytes = await layeredPSD();
  if (cap) return saveFile(`neopose-${stamp()}.psd`, bytes, 'image/vnd.adobe.photoshop');  // the share sheet: Krita, ibisPaint, Clip Studio…
  // a browser cannot start programs: the picture to the clipboard (paste it anywhere) and the PSD downloaded
  let copied = false;
  try { const flat = renderExportCanvas(), blob = await new Promise(r => flat.toBlob(r, 'image/png')); await navigator.clipboard.write([new ClipboardItem({'image/png': blob})]); copied = true; } catch (_) {}
  saveFile(`neopose-${stamp()}.psd`, bytes, 'image/vnd.adobe.photoshop');
  oiMsg(copied ? tr('Imagen copiada: pégala (Ctrl+V) en tu programa. También se ha descargado el PSD con capas para abrirlo allí.') : tr('Se ha descargado el PSD con capas: ábrelo en tu programa de dibujo.'));
}
function showOpenIn(apps) {
  const box = $('#openInList'); box.innerHTML = '';
  const found = apps.filter(a => a.id !== 'default'), list = [...found, {id: 'default', name: '', fmt: 'psd'}];
  for (const a of list) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn openinapp' + (a.id === 'default' ? '' : ' found');
    b.innerHTML = `<strong></strong><span class="note"></span>`; b.querySelector('strong').textContent = a.id === 'default' ? tr('Elegir otro programa…') : a.name;
    b.querySelector('.note').textContent = a.fmt === 'png' ? tr('Imagen PNG') : tr('PSD con capas');
    b.onclick = async () => {
      $('#openInMsg').textContent = tr('Preparando las capas…'); await new Promise(r => setTimeout(r, 30));
      try {
        const bytes = a.fmt === 'png' ? new Uint8Array(await (await new Promise(r => renderExportCanvas().toBlob(r, 'image/png'))).arrayBuffer()) : await layeredPSD();
        const r = await nativeShell().openIn(a.id, `neopose-${stamp()}.${a.fmt === 'png' ? 'png' : 'psd'}`, bytes);
        $('#openInMsg').textContent = r && r.ok ? tr('Abriendo en {x}…', {x: a.id === 'default' ? tr('tu programa') : a.name}) : tr('No se ha podido abrir: {e}', {e: r && r.error || '?'});
        if (r && r.ok) setTimeout(() => { $('#openInModal').hidden = true; }, 900);
      } catch (e) { $('#openInMsg').textContent = tr('No se ha podido abrir: {e}', {e: e && e.message || e}); }
    };
    box.appendChild(b);
  }
  $('#openInMsg').textContent = found.length ? '' : tr('No he encontrado programas de dibujo conocidos: elige uno o se abrirá con el que tengas asignado.');
  $('#openInModal').hidden = false;
}

/* ---------- animation: one image sequence per layer ---------- */
async function exportLayerSequences() {
  const files = {}, total = countFrames(); let n = 0;
  await eachFrame(EXK.animRange, EXK.animStep === 'keys' ? 'keys' : +EXK.animStep, async (i, f, s) => {
    const L = await renderLayerSet(EXK.subs ? f : null);
    for (const [k, l] of L.entries()) { if (l.name === tr('Dibuja aquí')) continue; const b = await new Promise(r => l.canvas.toBlob(r, 'image/png'));
      files[`${String(i + 1).padStart(2, '0')}-${slug(s.name)}/${String(k + 1).padStart(2, '0')}-${slug(l.name)}/${String(f + 1).padStart(4, '0')}.png`] = new Uint8Array(await b.arrayBuffer()); }
    n++; exportBusy(true, n / total); $('#exMsg').textContent = tr('Fotograma {n} de {t}…', {n, t: total});
  });
  saveFile(`animacion-capas-${stamp()}.zip`, fflate.zipSync(files, {level: 0}), 'application/zip');
  $('#exMsg').textContent = tr('{n} fotogramas en capas: importa cada carpeta como capa animada (Krita: Archivo → Importar fotogramas de animación).', {n});
}
function buildLayersUI() {
  $('#exPsd').onclick = savePSD;
  $('#exOpenIn').onclick = openIn; $('#openIn').onclick = openIn;
  if (openInIsBrowser()) $('#openIn').title = tr('Copia la imagen para pegarla en tu programa de dibujo y descarga un PSD con capas para abrirlo en Krita, Clip Studio, Photoshop…');
  $('#openInClose').onclick = () => { $('#openInModal').hidden = true; };
  $('#openInModal').onclick = e => { if (e.target.id === 'openInModal') $('#openInModal').hidden = true; };
}
