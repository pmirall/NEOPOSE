/* ======================= the timeline: selecting and editing keys =======================
   The way Blender's dope sheet, After Effects, Toon Boom and Procreate Dreams work, with mouse, keyboard and fingers:
   - a click selects a key; a click on the body of a gallery clip selects the whole clip; Shift/Ctrl adds or removes;
     dragging on an empty part of a lane draws a box; Ctrl+A selects everything, Esc nothing;
   - Delete or Backspace deletes what is selected (with Undo in the toast); dragging moves it, frame by frame
     (Alt while dragging moves a copy); Ctrl+C / Ctrl+V copy and paste at the playhead; Shift+D duplicates there;
     Alt+, / Alt+. nudge a frame (with Shift, ten);
   - each key says how it goes on to the next: smooth (diamond), linear (circle) or held (square, with a bar);
   - right click, or a long press on a touch screen, opens the menu of what is under the pointer; a bar over the
     lanes keeps the actions at hand while something is selected;
   - the ruler scrubs; ←/→ step, Shift+←/→ go to the ends, ↑/↓ jump between keys, Home/End; Ctrl+wheel or a pinch
     zooms the lanes, Shift+wheel pans, F fits them again. */
const TL = {sel: new Map(), clip: null, clipT: 0, box: null, hover: null, over: false, frames: store.get('cdp.tlFrames', false)};
const tlKeys = tr => { const s = shot(); return !s ? [] : tr === 'cam' ? s.cam : (s.keys[tr] || []); };
const tlTracks = () => ['cam', ...chars.map((_, i) => i)];
function tlView(s = shot()) { const v = s && s.view; return v && v.b - v.a >= 4 && v.a >= 0 && v.b <= s.len - 1 ? v : {a: 0, b: Math.max(1, (s ? s.len : 2) - 1)}; }
// the runs of a gallery clip (keys frame to frame) and the keys of their ends
function tlRuns(K) { const out = []; for (let a = 0; a < K.length; a++) { if (!K[a].lin) continue; let b = a; while (b < K.length - 1 && K[b].lin) b++; out.push([a, b]); a = b; } return out; }
const coarse = () => matchMedia('(pointer: coarse)').matches;
// what is under x in a lane: a key (the nearest within reach), else the body of a clip
function tlHit(tr, x) {
  const K = tlKeys(tr), reach = coarse() ? 16 : 8; let best = null, bd = reach;
  const runs = tlRuns(K), inner = new Set(); for (const [a, b] of runs) for (let i = a + 1; i < b; i++) inner.add(i);
  K.forEach((k, i) => { if (inner.has(i)) return; const d = Math.abs(trackX(k.f) - x); if (d < bd) { bd = d; best = k; } });
  if (best) return {key: best};
  for (const [a, b] of runs) if (x >= trackX(K[a].f) && x <= trackX(K[b].f)) return {block: K.slice(a, b + 1)};
  return null;
}
function tlSelect(list, tr, add) { if (!add) TL.sel.clear(); for (const k of list) TL.sel.set(k, tr); syncSelBar(); drawTimeline(); }
function tlToggle(list, tr) { const all = list.every(k => TL.sel.has(k)); for (const k of list) all ? TL.sel.delete(k) : TL.sel.set(k, tr); syncSelBar(); drawTimeline(); }
function tlClear() { if (!TL.sel.size) return false; TL.sel.clear(); syncSelBar(); drawTimeline(); return true; }
function tlSelectAll() { TL.sel.clear(); for (const tr of tlTracks()) for (const k of tlKeys(tr)) TL.sel.set(k, tr); syncSelBar(); drawTimeline(); }
const tlSorted = () => { const s = shot(); for (const K of [...s.keys, s.cam]) K.sort((a, b) => a.f - b.f); };

/* ---------- editing ---------- */
function tlDelete() {
  const n = TL.sel.size; if (!n) return false; const s = shot();
  for (const [k, tr] of TL.sel) { const K = tlKeys(tr), i = K.indexOf(k); if (i >= 0) K.splice(i, 1); }
  TL.sel.clear(); syncSelBar(); setFrame(ANIM.f); renderStrip(); pushHistory();
  toast(tr(n === 1 ? 'Clave borrada' : '{n} claves borradas', {n}), {undo: true});
  return true;
}
function tlCopy() {
  if (!TL.sel.size) return false;
  const items = [...TL.sel].map(([k, tr]) => ({tr, k: JSON.parse(JSON.stringify(k))})), base = Math.min(...items.map(i => i.k.f));
  TL.clip = {items: items.map(i => ({tr: i.tr, df: i.k.f - base, k: i.k})), tracks: [...new Set(items.map(i => i.tr))]}; TL.clipT = Date.now();
  toast(tr(items.length === 1 ? 'Clave copiada' : '{n} claves copiadas', {n: items.length}));
  return true;
}
// at the playhead, keeping the spacing; into the same lanes, or into the active one if they all came from one character
function tlPaste(at = ANIM.f) {
  if (!TL.clip) return false; const s = shot(), oneChar = TL.clip.tracks.length === 1 && TL.clip.tracks[0] !== 'cam';
  TL.sel.clear(); let n = 0;
  for (const it of TL.clip.items) {
    const tr = oneChar && typeof ANIM.track === 'number' ? ANIM.track : it.tr, f = at + it.df; if (f > s.len - 1 || (tr !== 'cam' && !chars[tr])) continue;
    padKeys(s); const K = tlKeys(tr), old = K.findIndex(k => k.f === f); if (old >= 0) K.splice(old, 1);
    const k = {...JSON.parse(JSON.stringify(it.k)), f}; K.push(k); TL.sel.set(k, tr); n++;
  }
  tlSorted(); syncSelBar(); setFrame(ANIM.f); renderStrip(); pushHistory();
  if (n) toast(tr(n === 1 ? 'Clave pegada' : '{n} claves pegadas', {n}), {undo: true});
  return true;
}
function tlDuplicate() { if (!TL.sel.size) return false; const keep = TL.clip, t = TL.clipT; tlCopy(); const start = Math.max(...[...TL.sel.keys()].map(k => k.f)) + 1; tlPaste(Math.min(start, shot().len - 1)); TL.clip = keep || TL.clip; TL.clipT = t; return true; }
// move the selection by df frames (all of it, or none if it would go off the shot); keys landing on others replace them
function tlShift(df, commit = true) {
  if (!TL.sel.size || !df) return; const s = shot(), fs = [...TL.sel.keys()].map(k => k.f);
  df = clamp(df, -Math.min(...fs), s.len - 1 - Math.max(...fs)); if (!df) return;
  for (const k of TL.sel.keys()) k.f += df;
  if (commit) tlLand();
  tlSorted(); setFrame(ANIM.f, true);
}
function tlLand() { for (const tr of tlTracks()) { const K = tlKeys(tr), mine = K.filter(k => TL.sel.has(k)); for (const k of mine) { for (let i = K.length - 1; i >= 0; i--) if (K[i] !== k && K[i].f === k.f && !TL.sel.has(K[i])) K.splice(i, 1); } } renderStrip(); pushHistory(); }
const IP_LABEL = {ease: 'Suave', lin: 'Lineal', hold: 'Constante'};
function tlInterp(ip) {
  const list = TL.sel.size ? [...TL.sel.keys()] : [keyOf(tlKeys(ANIM.track), ANIM.f)].filter(Boolean); let n = 0;
  for (const k of list) { if (k.lin) continue; if (ip === 'ease') delete k.ip; else k.ip = ip; n++; }
  if (n) { setFrame(ANIM.f); pushHistory(); toast(tr('Interpolación: {x}', {x: tr(IP_LABEL[ip])})); }
}
function tlMenu(x, y, hit, ln) {
  const items = [], sel = TL.sel.size;
  if (sel) {
    items.push(['Borrar', tlDelete, 'Supr'], ['Copiar', tlCopy, 'Ctrl C'], ['Duplicar', tlDuplicate, 'Mayús D']);
    if (TL.clip) items.push(['Pegar en el cursor', () => tlPaste(), 'Ctrl V']);
    if ([...TL.sel.keys()].some(k => !k.lin)) for (const ip of ['ease', 'lin', 'hold']) items.push([tr('Interpolación: {x}', {x: tr(IP_LABEL[ip])}), () => tlInterp(ip)]);
    items.push(['Seleccionar toda la pista', () => tlSelect(tlKeys(ln), ln, false)], ['No seleccionar nada', tlClear, 'Esc']);
  } else {
    items.push(['Guardar una clave aquí', () => { setKey(ln, ANIM.f); pushHistory(); }, 'K']);
    if (TL.clip) items.push(['Pegar en el cursor', () => tlPaste(), 'Ctrl V']);
    items.push(['Seleccionar toda la pista', () => tlSelect(tlKeys(ln), ln, false)], ['Seleccionar todo', tlSelectAll, 'Ctrl A']);
  }
  openMenuSpec({title: ln === 'cam' ? tr('Cámara') : speaker(ln), items}, x, y);
}

/* ---------- the bar of actions while something is selected ---------- */
function syncSelBar() {
  const bar = $('#tlSelBar'); if (!bar) return; const n = TL.sel.size; bar.hidden = !n || !ANIM.open; if (!n) return;
  bar.querySelector('.n').textContent = tr(n === 1 ? '1 clave' : '{n} claves', {n});
  bar.querySelector('[data-a=paste]').hidden = !TL.clip;
  const canIp = [...TL.sel.keys()].some(k => !k.lin); bar.querySelector('[data-a=ip]').hidden = !canIp;
}
function buildSelBar() {
  const bar = $('#tlSelBar'); if (!bar) return;
  const act = {del: tlDelete, copy: tlCopy, paste: () => tlPaste(), dup: tlDuplicate, none: tlClear,
    ip: e => { const r = e.currentTarget.getBoundingClientRect(); openMenuSpec({title: tr('Interpolación'), items: ['ease', 'lin', 'hold'].map(ip => [tr(IP_LABEL[ip]), () => tlInterp(ip)])}, r.left, r.bottom + 4); }};
  bar.querySelectorAll('[data-a]').forEach(b => b.onclick = e => act[b.dataset.a](e));
}

/* ---------- the pointer on the lanes ---------- */
function initTimeline(cv) {
  let drag = null, lp = null; const ptrs = new Map();
  const at = e => { const r = cv.getBoundingClientRect(); return {x: e.clientX - r.left, y: e.clientY - r.top}; };
  const laneAt = y => y < RULER ? null : lanes()[Math.floor((y - RULER) / LANE())];
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointerenter', () => { TL.over = true; }); cv.addEventListener('pointerleave', () => { TL.over = false; if (TL.hover) { TL.hover = null; drawTimeline(); } });
  cv.addEventListener('pointerdown', e => {
    ptrs.set(e.pointerId, {x: e.clientX, y: e.clientY});
    if (ptrs.size === 2) { clearTimeout(lp && lp.t); lp = null; if (drag && drag.orig) for (const [k, f] of drag.orig) k.f = f; const [a, b] = [...ptrs.values()]; drag = {pinch: true, d0: Math.hypot(a.x - b.x, a.y - b.y), v0: {...tlView()}, cx: (a.x + b.x) / 2}; return; }
    if (ANIM.playing) play(false); if (ANIM.busy) return;
    const {x, y} = at(e), ln = laneAt(y), s = shot();
    try { cv.setPointerCapture(e.pointerId); } catch (_) {}
    if (e.button === 2) { drag = {menu: true, x, y, ln, cx: e.clientX, cy: e.clientY}; return; }
    if (ln === null) { drag = {scrub: true}; setFrame(trackF(x)); return; }  // the ruler scrubs
    if (ln === 'lines') { const hit = lineAtXY(x, y); if (hit) { const l = s.lines[hit.j]; tlClear(); drag = {line: hit.j, edge: hit.edge, x0: x, f0: l.f, len0: l.len, moved: false}; ANIM.sel = {line: hit.j}; drawTimeline(); return; } drag = {scrub: true}; setFrame(trackF(x)); return; }
    if (ln === undefined) return;
    if (ln !== ANIM.track) { ANIM.track = ln; if (typeof ln === 'number' && chars[ln] !== mq) setActive(ln); renderLabels(); }
    const hit = tlHit(ln, x), list = hit ? (hit.key ? [hit.key] : hit.block) : null, add = e.shiftKey || e.ctrlKey || e.metaKey;
    if (list) {
      if (add) tlToggle(list, ln); else if (!list.every(k => TL.sel.has(k))) tlSelect(list, ln, false);
      drag = {move: true, x0: x, df: 0, alt: e.altKey, list, ln, f: hit.key ? hit.key.f : null};
    } else drag = {box: true, x0: x, y0: y, add, ln};
    if (e.pointerType !== 'mouse') lp = {x: e.clientX, y: e.clientY, t: setTimeout(() => { if (!lp) return; lp = null; const d = drag; drag = null; if (d && d.orig) for (const [k, f] of d.orig) k.f = f; tlMenu(e.clientX, e.clientY, hit, ln); haptic(14); }, 500)};
  });
  cv.addEventListener('pointermove', e => {
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, {x: e.clientX, y: e.clientY});
    const {x, y} = at(e), s = shot(); if (!s) return;
    if (lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 8) { clearTimeout(lp.t); lp = null; }
    if (!drag) { // hover: the key under the mouse grows
      if (e.pointerType !== 'mouse') return; const ln = laneAt(y), h = ln !== null && ln !== undefined && ln !== 'lines' ? tlHit(ln, x) : null, k = h && h.key ? h.key : null;
      cv.style.cursor = k || (h && h.block) ? 'grab' : ln === null ? 'col-resize' : ''; if (k !== TL.hover) { TL.hover = k; drawTimeline(); } return;
    }
    if (drag.pinch) { if (ptrs.size < 2) return; const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y); tlZoomTo(drag.v0, drag.d0 / Math.max(10, d), trackF(drag.cx - cv.getBoundingClientRect().left)); return; }
    if (drag.scrub) { const f = clamp(Math.round(trackF(x)), 0, s.len - 1); if (f !== ANIM.f) setFrame(f); return; }
    if (drag.move) {
      const df = Math.round(trackF(x) - trackF(drag.x0)); if (df === drag.df) return;
      if (!drag.orig) {  // the first frame of a drag: Alt leaves a copy behind
        if (Math.abs(x - drag.x0) < 4) return; cv.style.cursor = 'grabbing';
        if (drag.alt) { const copies = []; for (const [k, tr] of TL.sel) { const c = JSON.parse(JSON.stringify(k)); tlKeys(tr).push(c); copies.push([c, tr]); } tlSorted(); }
        drag.orig = new Map([...TL.sel.keys()].map(k => [k, k.f]));
      }
      const fs = [...drag.orig.values()], d = clamp(df, -Math.min(...fs), s.len - 1 - Math.max(...fs));
      for (const [k, f] of drag.orig) k.f = f + d; drag.df = df; tlSorted(); setFrame(drag.f != null ? drag.f + d : ANIM.f, true); return;
    }
    if (drag.box) { if (Math.abs(x - drag.x0) < 5 && Math.abs(y - drag.y0) < 5) return; TL.box = {x0: Math.min(drag.x0, x), x1: Math.max(drag.x0, x), y0: Math.min(drag.y0, y), y1: Math.max(drag.y0, y)}; drag.boxed = true;
      if (!drag.add) TL.sel.clear(); const L = lanes();
      L.forEach((ln, i) => { if (ln === 'lines') return; const yy = laneY(i) + LANE() / 2; if (yy < TL.box.y0 || yy > TL.box.y1) return; for (const k of tlKeys(ln)) { const kx = trackX(k.f); if (kx >= TL.box.x0 && kx <= TL.box.x1) TL.sel.set(k, ln); } });
      syncSelBar(); drawTimeline(); return; }
    if (drag.line !== undefined) {
      const l = s.lines[drag.line], df = Math.round(trackF(x) - trackF(drag.x0)); if (!df && !drag.moved) return; drag.moved = true;
      if (drag.edge) { l.len = clamp(drag.len0 + df, 2, s.len - l.f); l.auto = false; } else l.f = clamp(drag.f0 + df, 0, s.len - 2);
      drawTimeline(); applyFrame(ANIM.f);
    }
  });
  const up = e => {
    ptrs.delete(e.pointerId); if (lp) { clearTimeout(lp.t); lp = null; }
    const d = drag; drag = null; cv.style.cursor = ''; if (!d) return;
    if (d.pinch) return;
    if (d.menu) { const {x} = at(e); if (d.ln !== null && d.ln !== undefined && d.ln !== 'lines') { const hit = tlHit(d.ln, x); if (hit && !(hit.key ? TL.sel.has(hit.key) : hit.block.every(k => TL.sel.has(k)))) tlSelect(hit.key ? [hit.key] : hit.block, d.ln, false); tlMenu(e.clientX, e.clientY, hit, d.ln); } return; }
    if (d.move) { if (d.orig) { tlLand(); setFrame(ANIM.f); } else if (d.f != null) setFrame(d.f); return; }
    if (d.box) { TL.box = null; if (!d.boxed) { tlClear(); ANIM.sel = null; setFrame(trackF(at(e).x)); } drawTimeline(); return; }
    if (d.line !== undefined) { if (!d.moved) openLineEditor(d.line); else pushHistory(); }
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', e => { if (drag && drag.orig) { for (const [k, f] of drag.orig) k.f = f; tlSorted(); setFrame(ANIM.f); } drag = null; ptrs.delete(e.pointerId); TL.box = null; drawTimeline(); });
  // Ctrl+wheel (and a trackpad pinch) zooms round the pointer, Shift+wheel or a sideways swipe pans
  cv.addEventListener('wheel', e => {
    const s = shot(); if (!s) return; const v = tlView(s), {x} = at(e);
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); tlZoomTo(v, Math.exp(e.deltaY * .01), trackF(x)); }
    else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY) || s.view) { e.preventDefault(); const span = v.b - v.a, d = (e.shiftKey ? e.deltaY : e.deltaX || e.deltaY) / cv.clientWidth * span; tlPanTo(v, d); }
  }, {passive: false});
  $('#tlFrame').onclick = () => { TL.frames = !TL.frames; store.set('cdp.tlFrames', TL.frames); drawTimeline(); };
  $('#tlFrame').style.cursor = 'pointer';
  buildSelBar();
}
function tlZoomTo(v0, k, center) { const s = shot(), span = clamp((v0.b - v0.a) * k, 8, s.len - 1), u = (center - v0.a) / Math.max(1, v0.b - v0.a); let a = center - u * span; a = clamp(a, 0, s.len - 1 - span); s.view = span >= s.len - 1.5 ? null : {a, b: a + span}; drawTimeline(); }
function tlPanTo(v, d) { const s = shot(), span = v.b - v.a; if (span >= s.len - 1.5) return; const a = clamp(v.a + d, 0, s.len - 1 - span); s.view = {a, b: a + span}; drawTimeline(); }
function tlFit() { const s = shot(); if (s && s.view) { s.view = null; drawTimeline(); return true; } return false; }

/* ---------- the keyboard ---------- */
function initTimelineKeys() {
  addEventListener('keydown', e => {
    if (!ANIM.open || e.target.matches('input:not([type=range]):not([type=checkbox]),textarea,select,[contenteditable],[role=tab]') || topModal()) return;
    const c = e.code, mod = e.ctrlKey || e.metaKey, done = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    if ((c === 'Delete' || c === 'Backspace') && !mod) { if (tlDelete()) return done(); if (ANIM.sel && ANIM.sel.line !== undefined) return; if (hasKey(ANIM.track, ANIM.f)) { deleteKey(ANIM.track, ANIM.f); pushHistory(); toast(tr('Clave borrada'), {undo: true}); return done(); } return; }
    if (mod && c === 'KeyC' && !e.shiftKey && TL.sel.size) { tlCopy(); return done(); }
    if (mod && c === 'KeyV' && !e.shiftKey && TL.clip && (!UX.clip || TL.clipT >= (UX.clipT || 0))) { tlPaste(); return done(); }
    if (mod && c === 'KeyA' && !e.shiftKey) { tlSelectAll(); return done(); }
    if (e.shiftKey && !mod && c === 'KeyD') { if (tlDuplicate()) return done(); }
    // Esc closes the open popover (Interpretación or «…»), and the focus goes back to its button («…» when that one is hidden)
    if (c === 'Escape' && (!$('#mvMotion').hidden || !$('#tlOpts').hidden)) { const was = !$('#mvMotion').hidden ? '#tlMotion' : '#tlMore'; $('#mvMotion').hidden = $('#tlOpts').hidden = true; $('#tlMotion').setAttribute('aria-expanded', 'false'); $('#tlMore').setAttribute('aria-expanded', 'false'); const b = $(was); (b.offsetParent ? b : $('#tlMore')).focus(); return done(); }
    if (c === 'Escape' && tlClear()) return done();
    if (e.altKey && (c === 'Comma' || c === 'Period') && TL.sel.size) { tlShift((c === 'Comma' ? -1 : 1) * (e.shiftKey ? 10 : 1)); return done(); }
    if (mod || e.altKey) return;
    const s = shot(), K = tlKeys(ANIM.track).map(k => k.f);
    if (c === 'ArrowLeft' || c === 'ArrowRight') { const r = c === 'ArrowRight'; setFrame(e.shiftKey ? (r ? s.len - 1 : 0) : ANIM.f + (r ? 1 : -1)); return done(); }
    if (c === 'ArrowUp' || c === 'ArrowDown') { const t = c === 'ArrowUp' ? K.find(f => f > ANIM.f) : [...K].reverse().find(f => f < ANIM.f); if (t != null) setFrame(t); return done(); }
    if (c === 'Home' || c === 'End') { setFrame(c === 'Home' ? 0 : s.len - 1); return done(); }
    if (c === 'KeyK' && e.shiftKey) { if (hasKey(ANIM.track, ANIM.f)) { deleteKey(ANIM.track, ANIM.f); pushHistory(); } return done(); }
    if (c === 'KeyT') { const r = $('#tlTrack').getBoundingClientRect(); openMenuSpec({title: tr('Interpolación'), items: ['ease', 'lin', 'hold'].map(ip => [tr(IP_LABEL[ip]), () => tlInterp(ip)])}, r.left + trackX(ANIM.f), r.top); return done(); }
    if (c === 'KeyF' && TL.over) { tlFit(); return done(); }
    if (c === 'KeyO') { ANIM.onion = !ANIM.onion; const o = $('#tlOnion'); if (o) o.checked = ANIM.onion; updateOnion(); toast(tr(ANIM.onion ? 'Papel cebolla activado' : 'Papel cebolla desactivado')); return done(); }
    if (c === 'BracketLeft' && ANIM.cur > 0) { enterShot(ANIM.cur - 1); return done(); }
    if (c === 'BracketRight' && ANIM.cur < ANIM.shots.length - 1) { enterShot(ANIM.cur + 1); return done(); }
  }, true);
}
