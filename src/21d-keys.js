/* ======================= the key poses of a shot, drawn in line =======================
   What an animator wants from a film to draw over: not every frame, but its keys (the extremes, where a move turns,
   stops or starts) and, if asked, the breakdowns between them, each one a clean line drawing on white, numbered with
   its frame, the previous key in blue under it the way it is done on a light table, and a timing sheet saying how many
   frames each one is held. The keys are found in the motion itself, not in how it was made: a pose is a key when the
   in-between of its neighbours would miss it (the curve simplified, Douglas–Peucker style, over the joints that read in
   a drawing: head, chest, hips, hands, elbows, knees and feet of everyone in the shot). */
const KEYJ = ['head', 'chest', 'hips', 'wristL', 'wristR', 'elbowL', 'elbowR', 'kneeL', 'kneeR', 'ankleL', 'ankleR'];
// where the joints of everyone are at every frame of the shot (NaN for whoever is out of the world)
function shotJointPaths(s) {
  const P = [], save = chars.map(m => m.getPose()), size = chars.reduce((a, m) => Math.max(a, m.size || 1), 0) || 1, v = new V3();
  for (let f = 0; f < s.len; f++) {
    const row = [];
    chars.forEach((m, ci) => {
      const p = poseAt(ci, f); if (p) m.setPose(p); m.group.updateMatrixWorld(true);
      const gone = !m.group.visible || s.empty || m.joints.hips.getWorldPosition(v).y < -5;
      for (const j of KEYJ) { if (gone) { row.push(NaN, NaN, NaN); continue; } m.joints[j].getWorldPosition(v); row.push(v.x, v.y, v.z); }
    });
    P.push(row);
  }
  chars.forEach((m, i) => { m.setPose(save[i]); m.group.updateMatrixWorld(true); });
  return {P, size};
}
// how far frame f is from the straight in-between of a and b: the joint that strays most
function strayOf(P, a, b, f) {
  const u = (f - a) / (b - a), A = P[a], B = P[b], F = P[f]; let mx = 0;
  for (let i = 0; i < F.length; i += 3) {
    if (Number.isNaN(F[i]) || Number.isNaN(A[i]) || Number.isNaN(B[i])) continue;
    const dx = F[i] - (A[i] + (B[i] - A[i]) * u), dy = F[i + 1] - (A[i + 1] + (B[i + 1] - A[i + 1]) * u), dz = F[i + 2] - (A[i + 2] + (B[i + 2] - A[i + 2]) * u), d = dx * dx + dy * dy + dz * dz;
    if (d > mx) mx = d;
  }
  return Math.sqrt(mx);
}
// someone coming in or going out between two frames is a key too (the drawing changes who is in it)
const presenceOf = row => { let s = ''; for (let i = 0; i < row.length; i += KEYJ.length * 3) s += Number.isNaN(row[i]) ? '0' : '1'; return s; };
// the keys (and breakdowns) of a shot: [{f, kind: 'key'|'bd'}], first and last frame always keys
function shotKeyPoses(s, withBreakdowns) {
  if (!s || s.len < 2) return [{f: 0, kind: 'key'}];
  const {P, size} = shotJointPaths(s), fps = ANIM.fps, tK = .22 * size, tB = .08 * size, minGap = Math.max(3, Math.round(fps / 4)), maxGap = Math.round(fps * 2);
  const keys = new Set([0, s.len - 1]);
  for (let f = 1; f < s.len; f++) if (presenceOf(P[f]) !== presenceOf(P[f - 1])) keys.add(f);
  // split where the in-between would miss most, until it misses by less than the threshold (or the gap is too short)
  const split = (a, b, t, out) => {
    if (b - a < minGap * 2) return; let best = -1, bd = 0;
    for (let f = a + minGap; f <= b - minGap; f++) { const d = strayOf(P, a, b, f); if (d > bd) { bd = d; best = f; } }
    if (best < 0 || (bd < t && !(b - a > maxGap && bd > t * .35))) return;
    out.add(best); split(a, best, t, out); split(best, b, t, out);
  };
  let K = [...keys].sort((a, b) => a - b);
  for (let i = 0; i < K.length - 1; i++) split(K[i], K[i + 1], tK, keys);
  K = [...keys].sort((a, b) => a - b);
  const out = K.map(f => ({f, kind: 'key'}));
  if (withBreakdowns) {
    // one breakdown between two keys where the in-between still strays (the passing position, the top of an arc)
    for (let i = 0; i < K.length - 1; i++) { const a = K[i], b = K[i + 1]; if (b - a < minGap * 2) continue; let best = -1, bd = 0;
      for (let f = a + minGap; f <= b - minGap; f++) { const d = strayOf(P, a, b, f); if (d > bd) { bd = d; best = f; } }
      if (best >= 0 && bd > tB) out.push({f: best, kind: 'bd'}); }
    out.sort((a, b) => a.f - b.f);
  }
  return out;
}

/* ---------- drawing them ---------- */
const KEY_EX = {bd: false, ghost: true, set: false};
// the ink alone (transparent elsewhere) of the current frame, at the export's size
function inkNow() { const old = ex.bg; ex.bg = 'lines'; try { return renderExportCanvas(null); } finally { ex.bg = old; } }
function recolor(cv, hex, alpha) {
  const out = document.createElement('canvas'); out.width = cv.width; out.height = cv.height; const c = out.getContext('2d');
  c.drawImage(cv, 0, 0); c.globalCompositeOperation = 'source-in'; c.fillStyle = hex; c.fillRect(0, 0, out.width, out.height);
  if (alpha < 1) { const o2 = document.createElement('canvas'); o2.width = cv.width; o2.height = cv.height; const c2 = o2.getContext('2d'); c2.globalAlpha = alpha; c2.drawImage(out, 0, 0); return o2; }
  return out;
}
// the set, faint, under the drawing (a hint of where things are, not something to trace)
function faintSet() {
  const old = ex.bg; ex.bg = 'paper'; let cv; try { cv = renderExportCanvas(null); } finally { ex.bg = old; }
  const c = cv.getContext('2d'), id = c.getImageData(0, 0, cv.width, cv.height), d = id.data;
  for (let i = 0; i < d.length; i += 4) { const L = (d[i] * .299 + d[i + 1] * .587 + d[i + 2] * .114) / 255, v = Math.round(255 - (1 - L) * 255 * .16); d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
  c.putImageData(id, 0, 0); return cv;
}
// one key on its sheet: paper, the faint set, the last key in blue, this one in black, and its label
function drawKeySheet(ink, prevInk, label, setCv) {
  const out = document.createElement('canvas'); out.width = ink.width; out.height = ink.height; const c = out.getContext('2d');
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, out.width, out.height);
  if (setCv) c.drawImage(setCv, 0, 0, out.width, out.height);
  if (prevInk) c.drawImage(recolor(prevInk, '#3d7fd0', .38), 0, 0);
  c.drawImage(recolor(ink, '#1d1b19', 1), 0, 0);
  const fs = Math.max(13, Math.round(out.height * .022)); c.font = `600 ${fs}px ${css('--f-body')}`; c.fillStyle = '#6d6555'; c.textBaseline = 'top';
  c.fillText(label, fs * .8, fs * .7);
  return out;
}
const keyLabel = (s, i, k, n) => `${s.name} · ${k.kind === 'bd' ? tr('intermedia') : tr('clave {n}', {n})} · f ${k.f + 1} · ${dec(k.f / ANIM.fps, 2)} s`;
// a shot's sheet of keys: small drawings in order with their frames, and a timing chart under them (keys circled, breakdowns ticked)
function timingSheet(s, i, keys, thumbs) {
  const cols = 4, TW = 300, th = Math.round(TW * thumbs[0].height / thumbs[0].width), gap = 18, head = 70, chart = 90, rows = Math.ceil(thumbs.length / cols);
  const cv = document.createElement('canvas'); cv.width = cols * TW + (cols + 1) * gap; cv.height = head + rows * (th + 30 + gap) + chart + gap;
  const c = cv.getContext('2d'), ink = '#2a2620', soft = '#6d6555', font = css('--f-body'); c.fillStyle = '#fbf8f1'; c.fillRect(0, 0, cv.width, cv.height);
  c.fillStyle = ink; c.font = `700 24px ${css('--f-hand') || font}`; c.fillText(`${i + 1}. ${s.name}`, gap, 36);
  c.font = `13px ${font}`; c.fillStyle = soft; const nk = keys.filter(k => k.kind === 'key').length, nb = keys.length - nk;
  c.fillText(`${s.len} f · ${dec(s.len / ANIM.fps, 1)} s · ${ANIM.fps} fps · ${trn(nk, '1 clave', '{n} claves')}${nb ? ' · ' + trn(nb, '1 intermedia', '{n} intermedias') : ''}`, gap, 58);
  let n = 0;
  keys.forEach((k, j) => {
    const x = gap + (j % cols) * (TW + gap), y = head + Math.floor(j / cols) * (th + 30 + gap);
    c.fillStyle = '#fff'; c.fillRect(x, y, TW, th); c.drawImage(thumbs[j], x, y, TW, th); c.strokeStyle = k.kind === 'key' ? ink : '#9a907e'; c.lineWidth = k.kind === 'key' ? 2 : 1; c.strokeRect(x, y, TW, th);
    const next = keys[j + 1] ? keys[j + 1].f : s.len, hold = next - k.f;
    c.fillStyle = ink; c.font = `700 14px ${font}`; c.fillText(k.kind === 'key' ? tr('Clave {n}', {n: ++n}) : tr('Intermedia'), x, y + th + 18);
    c.font = `13px ${font}`; c.fillStyle = soft; c.textAlign = 'right'; c.fillText(`f ${k.f + 1} · ${trn(hold, '1 f', '{n} f')}`, x + TW, y + th + 18); c.textAlign = 'left';
  });
  // the timing chart: the shot's frames on a line, the keys circled with their number, the breakdowns ticked
  const y0 = cv.height - chart / 2 - gap / 2, x0 = gap + 10, x1 = cv.width - gap - 10, X = f => x0 + (x1 - x0) * f / Math.max(1, s.len - 1);
  c.strokeStyle = ink; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y0); c.stroke();
  for (let f = 0; f < s.len; f++) { const big = f % ANIM.fps === 0; c.beginPath(); c.moveTo(X(f), y0 - (big ? 7 : 3)); c.lineTo(X(f), y0 + (big ? 7 : 3)); c.lineWidth = big ? 1.4 : .6; c.stroke(); }
  c.font = `11px ${font}`; c.fillStyle = soft; c.textAlign = 'center'; for (let f = 0; f < s.len; f += ANIM.fps) c.fillText(`${f / ANIM.fps} s`, X(f), y0 + 22);
  n = 0;
  for (const k of keys) {
    if (k.kind === 'key') { n++; c.beginPath(); c.arc(X(k.f), y0 - 20, 10, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 1.6; c.strokeStyle = ink; c.stroke(); c.fillStyle = ink; c.font = `700 11px ${font}`; c.fillText(String(n), X(k.f), y0 - 16); }
    else { c.strokeStyle = '#3d7fd0'; c.lineWidth = 2; c.beginPath(); c.moveTo(X(k.f), y0 - 14); c.lineTo(X(k.f), y0 - 4); c.stroke(); }
  }
  c.textAlign = 'left';
  return cv;
}
// the whole export: a folder per shot with its keys, a timing sheet per shot, and the exposure sheet as CSV
async function exportKeyLines() {
  const list = EXK.animRange === 'movie' ? ANIM.shots.map((_, i) => i) : [ANIM.cur], back = {cur: ANIM.cur, f: ANIM.f}, files = {}, rows = [], enc = new TextEncoder();
  const png = async cv => new Uint8Array(await (await new Promise(r => cv.toBlob(r, 'image/png'))).arrayBuffer());
  const q = v => `"${String(v).replace(/"/g, '""')}"`;
  rows.push([tr('plano'), tr('clave'), tr('tipo'), tr('fotograma'), tr('segundo'), tr('dura (fotogramas)'), tr('diálogo')].map(q).join(','));
  let total = 0, done = 0, first = null;
  for (const [n, i] of list.entries()) {
    if (i !== ANIM.cur) await enterShot(i, 0);
    const s = shot(), keys = shotKeyPoses(s, KEY_EX.bd), dir = `${String(i + 1).padStart(2, '0')}-${slug(s.name)}`, thumbs = []; total += keys.length;
    let prev = null, kn = 0;
    for (const [j, k] of keys.entries()) {
      setFrame(k.f); const ink = inkNow(), setCv = KEY_EX.set ? faintSet() : null; if (k.kind === 'key') kn++;
      const sheet = drawKeySheet(ink, KEY_EX.ghost ? prev : null, keyLabel(s, i, k, kn), setCv); if (!first) first = sheet;
      files[`${dir}/${k.kind === 'key' ? 'K' + String(kn).padStart(2, '0') : 'B' + String(kn).padStart(2, '0') + 'b'}-f${String(k.f + 1).padStart(4, '0')}.png`] = await png(sheet);
      const tw = 300, t = document.createElement('canvas'); t.width = tw; t.height = Math.round(tw * sheet.height / sheet.width); t.getContext('2d').drawImage(drawKeySheet(ink, null, '', null), 0, 0, t.width, t.height); thumbs.push(t);
      if (k.kind === 'key') prev = ink;
      const next = keys[j + 1] ? keys[j + 1].f : s.len, said = s.lines.filter(l => k.f >= l.f && k.f < l.f + l.len).map(l => `${speaker(l.c)}: ${l.text}`).join(' / ');
      rows.push([s.name, k.kind === 'key' ? kn : '', k.kind === 'key' ? tr('clave') : tr('intermedia'), k.f + 1, dec(k.f / ANIM.fps, 2), next - k.f, said].map(q).join(','));
      done++; exportBusy(true, (n + j / keys.length) / list.length); $('#exMsg').textContent = tr('Plano {s} de {t}: clave {n} de {k}…', {s: n + 1, t: list.length, n: j + 1, k: keys.length});
    }
    files[`${dir}/${tr('hoja-de-tiempos')}.png`] = await png(timingSheet(s, i, keys, thumbs));
  }
  files[`${tr('exposicion')}.csv`] = enc.encode('﻿' + rows.join('\r\n') + '\r\n');
  if (back.cur !== ANIM.cur) await enterShot(back.cur, back.f); else setFrame(back.f);
  saveFile(`${tr('claves')}-${stamp()}.zip`, fflate.zipSync(files, {level: 0}), 'application/zip');
  if (first) { ex.canvas = first; $('#exImg').src = first.toDataURL('image/png'); }
  $('#exMsg').textContent = tr('{n} dibujos de claves exportados, con su hoja de tiempos.', {n: done});
  void total;
}
// the window's preview: the shot's first key drawn as it will be exported, and how many there are
function keyLinesPreview() {
  const s = shot(); if (!s) return; const keys = shotKeyPoses(s, KEY_EX.bd), f0 = ANIM.f;
  setFrame(keys[0].f); const sheet = drawKeySheet(inkNow(), null, keyLabel(s, ANIM.cur, keys[0], 1), KEY_EX.set ? faintSet() : null); setFrame(f0);
  ex.canvas = sheet; $('#exImg').src = sheet.toDataURL('image/png');
  const nk = keys.filter(k => k.kind === 'key').length, nb = keys.length - nk;
  $('#exAnimNote').textContent = tr('Las poses clave dibujadas en línea, numeradas, con la clave anterior en azul y una hoja de tiempos por plano. En este plano: {k}{b}.', {k: trn(nk, '1 clave', '{n} claves'), b: nb ? ' · ' + trn(nb, '1 intermedia', '{n} intermedias') : ''});
  $('#exMsg').textContent = tr('Vista previa de la primera clave: {w} × {h} px.', {w: sheet.width, h: sheet.height});
}
function buildKeyLinesUI() {
  const box = $('#exKeyRow'); if (!box) return;
  chips($('#exKeyDensity'), [['keys', 'Solo claves'], ['bd', 'Claves e intermedias']], KEY_EX.bd ? 'bd' : 'keys', v => { KEY_EX.bd = v === 'bd'; setPressed($('#exKeyDensity'), v); renderExportKind(); });
  const chk = (id, k) => { const el = $(id); el.checked = KEY_EX[k]; el.onchange = () => { KEY_EX[k] = el.checked; renderExportKind(); }; };
  chk('#exKeyGhost', 'ghost'); chk('#exKeySet', 'set');
}
