/* ======================= feel: direct manipulation, gestures, menus, finding things =======================
   Learnt from the apps artists already have in their hands (Procreate's ColorDrop and finger gestures, Clip Studio's
   pose materials dropped on the model, Figma and Linear's command palette, Material and Apple's touch guidelines):
   - poses glide into place instead of jumping;
   - anything in the panel can be dragged onto the canvas, with a live preview before letting go: a pose onto a
     character, a gesture onto a hand, a colour onto a garment or the hair, an object or a saved character onto the
     floor where it is dropped, a set onto the background. Mouse: just drag. Touch: press and hold, or slide sideways;
   - two-finger tap undoes, three-finger tap redoes; a long press (or right click) opens what can be done there;
   - Ctrl+K (or the magnifier) finds any pose, garment, set, object or command;
   - reversible changes say so with an "Undo" button instead of asking first. */
const UX = {reduce: matchMedia('(prefers-reduced-motion: reduce)').matches, drag: null, clip: null};
function haptic(ms = 10) { try { if (navigator.vibrate && !UX.reduce) navigator.vibrate(ms); } catch (_) {} }
const uxNorm = t => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/* ---------- poses glide ---------- */
const TWEENS = new Map(), easeOutCubic = k => 1 - Math.pow(1 - k, 3);
const poseSig = m => ['hips', 'chest', 'wristL', 'wristR', 'ankleL', 'ankleR'].map(n => m.joints[n] ? m.joints[n].quaternion.toArray().map(v => v.toFixed(4)).join() : '').join('|') + m.joints.hips.position.toArray().map(v => v.toFixed(4)).join();
// run a change, then let every character it moved travel there over a quarter of a second
function withGlide(fn, ms = 260) {
  const before = new Map(chars.map(m => [m, m.getPose()]));
  const r = fn();
  if (!UX.reduce) for (const [m, from] of before) {
    if (!chars.includes(m)) continue;
    const to = m.getPose(); if (JSON.stringify(to.q) === JSON.stringify(from.q) && to.pos.join() === from.pos.join()) continue;
    const t = {from, to, t0: performance.now(), ms}; TWEENS.set(m, t);
    m.setPose(mixPose(from, to, 0)); m.group.updateMatrixWorld(true); t.sig = poseSig(m);
  }
  return r;
}
function finishGlides() { for (const [m, t] of TWEENS) if (poseSig(m) === t.sig) { m.setPose(t.to); m.group.updateMatrixWorld(true); } TWEENS.clear(); }
function glideTick() {
  if (!TWEENS.size) return;
  const now = performance.now();
  for (const [m, t] of TWEENS) {
    if (!chars.includes(m) || poseSig(m) !== t.sig) { TWEENS.delete(m); continue; }  // someone else moved it since: leave it be
    const k = Math.min(1, (now - t.t0) / t.ms);
    m.setPose(k >= 1 ? t.to : mixPose(t.from, t.to, easeOutCubic(k))); m.group.updateMatrixWorld(true); t.sig = poseSig(m);
    if (k >= 1) { TWEENS.delete(m); if (m === mq) { syncJointSliders(); syncHandUI(); } }
  }
}

/* ---------- where the pointer is on the canvas ---------- */
function rayAt(x, y) { const r = canvas.getBoundingClientRect(); ndc.set((x - r.left) / r.width * 2 - 1, -(y - r.top) / r.height * 2 + 1); ray.setFromCamera(ndc, camera); return r; }
function inCanvas(x, y) { const r = canvas.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; }
function screenOf(v) { const r = canvas.getBoundingClientRect(), p = v.clone().project(camera); return {x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height, z: p.z}; }
function screenBox(m) {
  const b = m.box(12), r = canvas.getBoundingClientRect(); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < 8; i++) { const s = screenOf(new V3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z)); x0 = Math.min(x0, s.x); y0 = Math.min(y0, s.y); x1 = Math.max(x1, s.x); y1 = Math.max(y1, s.y); }
  return {x0: Math.max(r.left, x0), y0: Math.max(r.top, y0), x1: Math.min(r.right, x1), y1: Math.min(r.bottom, y1)};
}
// the character under a point: its body (or avatar) first, then the box around it
function charAt(x, y, boxes) {
  if (!inCanvas(x, y)) return null;
  rayAt(x, y);
  const meshes = [...chars.flatMap(m => m.meshes), ...chars.flatMap(m => m.avatar ? m.avatar.meshes : [])];
  const hit = ray.intersectObjects(meshes, false)[0];
  if (hit) { const m = hit.object.userData.avatarOf || chars.find(c => c.meshes.includes(hit.object)); if (m) return {m, ci: chars.indexOf(m), point: hit.point}; }
  if (boxes) { const pad = 14; for (const [i, b] of boxes.entries()) if (x >= b.x0 - pad && x <= b.x1 + pad && y >= b.y0 - pad && y <= b.y1 + pad) return {m: chars[i], ci: i, point: null}; }
  return null;
}
function garmentAt(x, y) {
  if (!inCanvas(x, y)) return null;
  rayAt(x, y);
  const meshes = chars.flatMap(m => m.garments.filter(g => g.meshes && !g.failed).flatMap(g => g.meshes));
  const hit = ray.intersectObjects([...meshes, ...chars.flatMap(m => m.meshes)], false)[0];
  if (!hit || !hit.object.userData.garment) return null;
  const g = hit.object.userData.garment, m = chars.find(c => c.garments.includes(g));
  return m ? {m, ci: chars.indexOf(m), g} : null;
}
const FLOOR = new THREE.Plane(new V3(0, 1, 0), 0);
function floorAt(x, y) { if (!inCanvas(x, y)) return null; rayAt(x, y); const p = ray.ray.intersectPlane(FLOOR, new V3()); return p && p.distanceTo(camera.position) < 60 ? p : null; }
function handAt(t, x, y) {
  const d = s => { const w = screenOf(t.m.joints['wrist' + s].getWorldPosition(new V3())); return Math.hypot(w.x - x, w.y - y); };
  return d('L') <= d('R') ? 'L' : 'R';
}

/* ---------- what can be dragged, and where it goes ---------- */
const nameOf = m => `${chars.indexOf(m) + 1} · ${charLabel(m)}`;
// keep a character's pose, put it back
const keepPose = m => { const p = m.getPose(); return () => { m.setPose(p); m.group.updateMatrixWorld(true); }; };
function poseOnto(m, p) {
  const yaw = m.yaw(), pos = m.joints.hips.position.clone();
  m.joints.hips.position.set(pos.x, m.rootY, pos.z); applyPreset(m, p, {yaw}); m.joints.hips.position.x = pos.x; m.joints.hips.position.z = pos.z; m.group.updateMatrixWorld(true);
}
const onActive = (ci, fn) => { if (ci !== active) setActive(ci); return fn(); };
const DRAG_KINDS = [
  {sel: '#poseGrid .pose[data-id]', target: 'char', single: () => state.castN === 1,
    item: el => state.castN === 1 ? POSE[el.dataset.id] : (GROUP_POSES[state.castN] || []).find(p => p.id === el.dataset.id),
    label: t => tr('Poner la pose a {x}', {x: nameOf(t.m)}),
    preview: (t, p) => { const back = keepPose(t.m); poseOnto(t.m, p); return back; },
    commit: (t, p, back) => { back(); onActive(t.ci, () => withGlide(() => usePreset(p))); return tr('Pose «{p}» para {x}', {p: p.label, x: nameOf(t.m)}); }},
  {sel: '#poseGrid .pose[data-id]', target: 'canvas', single: () => state.castN !== 1, item: el => (GROUP_POSES[state.castN] || []).find(p => p.id === el.dataset.id),
    label: () => tr('Colocar al reparto'), commit: (t, p) => withGlide(() => useGroup(p)) || tr('Pose «{p}» para el reparto', {p: p.label})},
  {sel: '#gestureChips .chip[data-v]', target: 'hand', item: el => el.dataset.v,
    label: t => tr(t.side === 'L' ? 'Mano izquierda de {x}' : 'Mano derecha de {x}', {x: nameOf(t.m)}),
    preview: (t, id) => { const old = JSON.parse(JSON.stringify(t.m.hands[t.side])); t.m.hands[t.side] = gest(id); t.m.applyHands(); return () => { t.m.hands[t.side] = old; t.m.applyHands(); }; },
    commit: (t, id) => { onActive(t.ci, () => { mq.hands[t.side] = gest(id); mq.applyHands(); syncHandUI(); pushHistory(); }); return tr(t.side === 'L' ? 'Gesto en la mano izquierda' : 'Gesto en la mano derecha'); }},
  {sel: '#exprChips .chip[data-v]', target: 'char', item: el => el.dataset.v, label: t => tr('Expresión para {x}', {x: nameOf(t.m)}),
    commit: (t, v) => { onActive(t.ci, () => $(`#exprChips .chip[data-v="${v}"]`)?.click()); return tr('Expresión para {x}', {x: nameOf(t.m)}); }},
  {sel: '#outfitChips .chip[data-v]', target: 'char', item: el => el.dataset.v, label: t => tr('Vestir a {x}', {x: nameOf(t.m)}),
    commit: (t, k) => { onActive(t.ci, () => { setPressed($('#outfitChips'), k); wearOutfit(mq, OUTFITS[k][1]); renderGarmentList(); renderLibrary(); renderCast(); pushHistory(); }); return tr('«{p}» para {x}', {p: tr(OUTFITS[k][0]), x: nameOf(t.m)}); }},
  {sel: '#garmentAdd .libItem[data-id]', target: 'char', item: el => el.dataset.id, label: t => tr('Ponérselo a {x}', {x: nameOf(t.m)}),
    commit: (t, id) => onActive(t.ci, () => { if (mq.outfit.some(s => s.id === id)) return tr('Ya lo lleva.'); toggleGarment(id); return tr('«{p}» para {x}', {p: garmentTitle(id), x: nameOf(t.m)}); })},
  {sel: '.swatches button, .dropcolor button', target: 'garment', item: el => el.dataset.c || el.title,
    label: t => t.g === t.m.hairG ? tr('Teñir el pelo de {x}', {x: nameOf(t.m)}) : tr('Teñir «{p}»', {p: garmentTitle(t.g.spec.id)}),
    preview: (t, c) => { const s = t.g.spec, old = {mode: s.mode, colA: s.colA}; if (s.mode === 'tex') s.mode = 'tint'; s.colA = c; updateGarment(t.m, t.g); return () => { Object.assign(s, old); updateGarment(t.m, t.g); }; },
    commit: (t, c, back) => { back(); return onActive(t.ci, () => {
      if (t.g === mq.hairG) { setHair(mq, mq.body.hair, c); renderHairUI(); pushHistory(); return tr('Pelo teñido'); }
      const s = t.g.spec; if (s.mode === 'tex') s.mode = 'tint'; s.colA = c; updateGarment(mq, t.g); t.g.open = true; renderGarmentList(); pushHistory(); return tr('«{p}» teñido', {p: garmentTitle(s.id)}); }); }},
  {sel: '#propChips .chip[data-v]', target: 'floor', item: el => el.dataset.v, label: () => tr('Dejarlo aquí'),
    commit: (t, id) => { const g = makeProp(id, t.point); setOutlines(g, state.envOutline); selectObj(g); pushHistory(); return tr('«{p}» en la escena', {p: tr(PROPS[id] || (ASSET_PROPS[id] || [id])[0])}); }},
  {sel: '#charGrid .charcard[data-id], #castPop .charcard[data-id]', target: 'floor', item: el => el.dataset.cast ? castById(el.dataset.cast) : SAVED_CHARS.find(c => c.id === el.dataset.id), label: () => tr('Que entre aquí'),
    commit: (t, c) => { $('#castPop')?.remove(); const n = chars.length; placeCharacter(c); if (chars.length > n) { const m = chars[chars.length - 1]; m.joints.hips.position.x = t.point.x; m.joints.hips.position.z = t.point.z; m.group.updateMatrixWorld(true); pushHistory(); } return null; }},
  {sel: '#addPoint, #addSpot', target: 'floor', item: el => el.id === 'addSpot' ? 'foco' : 'punto', label: () => tr('Una luz aquí encima'),
    commit: (t, type) => { if (extraLights.length >= 4) return tr('Ya hay 4 luces.'); const g = makeLight(type, t.point.clone().setY(2.2)); selectObj(g); pushHistory(); return tr('Luz añadida'); }},
  {sel: '#envChips .chip[data-v]', target: 'canvas', item: el => el.dataset.v, label: () => tr('Cambiar el escenario'),
    commit: (t, id) => { $('#envChips').querySelectorAll('.chip').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === id))); setEnv(id).then(() => { if (state.env === id) pushHistory(); }); return null; }},
  {sel: '#hairGrid .hairItem:not([disabled])', target: 'char', item: el => el.dataset.v, label: t => tr('Peinar a {x}', {x: nameOf(t.m)}),
    commit: (t, id) => { onActive(t.ci, () => { setHair(mq, id); renderHairUI(); pushHistory(); }); return null; }},
  {sel: '#buildGrid .pose[data-id]', target: 'char', item: el => el.onclick, label: t => tr('Complexión para {x}', {x: nameOf(t.m)}), commit: (t, fn, back, el) => { onActive(t.ci, () => fn.call(el)); return null; }},
  {sel: '#myPoses .pose', target: 'canvas', item: el => el.onclick, label: () => tr('Abrir esta escena'), commit: (t, fn, back, el) => { fn.call(el); return null; }}
];
const DRAG_SEL = [...new Set(DRAG_KINDS.map(k => k.sel))].join(', ');
const kindFor = el => DRAG_KINDS.find(k => el.matches(k.sel) && (!k.single || k.single()));

/* ---------- the drag itself (pointer events: mouse, pen and touch alike) ---------- */
function ghostFor(el) {
  const g = document.createElement('div'); g.className = 'dndghost'; g.setAttribute('aria-hidden', 'true');
  const img = el.querySelector('img'), th = el.querySelector('.th');
  if (img && img.src) { const i = new Image(); i.src = img.src; i.alt = ''; g.appendChild(i); }
  else if (th && th.style.getPropertyValue('--m')) { const d = document.createElement('div'); d.className = 'gth'; d.style.setProperty('--m', th.style.getPropertyValue('--m')); g.appendChild(d); }
  else if (el.matches('.swatches button, .dropcolor button')) { g.classList.add('swatch'); g.style.background = el.dataset.c || el.title; }
  const t = (el.querySelector('span:not(.del)') || el).textContent.trim(); if (t && !g.classList.contains('swatch')) { const s = document.createElement('span'); s.textContent = t; g.appendChild(s); }
  document.body.appendChild(g); return g;
}
function targetBox(cls) { let b = document.querySelector('.dndtarget.' + cls); if (!b) { b = document.createElement('div'); b.className = 'dndtarget ' + cls; b.innerHTML = '<span></span>'; document.body.appendChild(b); } return b; }
function placeBox(b, r, label) { b.hidden = false; b.classList.toggle('inside', r.y0 < canvas.getBoundingClientRect().top + 44); Object.assign(b.style, {left: r.x0 - 6 + 'px', top: r.y0 - 6 + 'px', width: r.x1 - r.x0 + 12 + 'px', height: r.y1 - r.y0 + 12 + 'px'}); b.firstChild.textContent = label || ''; b.firstChild.hidden = !label; }
function startDrag(p) {
  const k = kindFor(p.el); if (!k) return;
  const item = k.item(p.el); if (item == null) return;
  finishGlides();
  const d = UX.drag = {k, item, el: p.el, x: p.x, y: p.y, x0: p.x, y0: p.y, touch: p.touch, ghost: ghostFor(p.el), t: null, back: null, boxes: chars.map(screenBox)};
  p.el.classList.add('lifted'); document.body.classList.add('dragging'); haptic(12);
  if (k.target === 'char' || k.target === 'hand') d.boxes.forEach((b, i) => placeBox(targetBox('all' + i), b, ''));
  sheetDuringDrag(true); moveDrag(p.x, p.y);
}
function sameTarget(a, b) { return a && b && a.ci === b.ci && a.side === b.side && a.g === b.g && (!a.point === !b.point); }
function moveDrag(x, y) {
  const d = UX.drag; if (!d) return;
  d.x = x; d.y = y;
  d.ghost.style.transform = `translate(${x}px, ${y - (d.touch ? 64 : -14)}px) translate(-50%, -50%)`;
  if (d.raf) return;
  d.raf = requestAnimationFrame(() => { d.raf = 0; if (UX.drag === d) aimDrag(d); });
}
function aimDrag(d) {
  const {k, x, y} = d; let t = null;
  if (k.target === 'char' || k.target === 'hand') { t = charAt(x, y, d.boxes); if (t && k.target === 'hand') t.side = handAt(t, x, y); }
  else if (k.target === 'garment') t = garmentAt(x, y);
  else if (k.target === 'floor') { const p = floorAt(x, y); t = p ? {point: p, ci: -1} : null; }
  else if (k.target === 'canvas') t = inCanvas(x, y) ? {ci: -1, point: null} : null;
  if (!sameTarget(t, d.t) || k.target === 'floor') {
    if (!sameTarget(t, d.t)) { if (d.back) { d.back(); d.back = null; } if (t && k.preview) d.back = k.preview(t, d.item); if (t) haptic(6); }
    d.t = t;
  }
  const hot = targetBox('hot'), lab = t ? k.label(t) : '';
  if (t && t.m) placeBox(hot, screenBox(t.m), lab);
  else if (t) { const r = canvas.getBoundingClientRect(); placeBox(hot, k.target === 'canvas' ? {x0: r.left + 6, y0: r.top + 6, x1: r.right - 6, y1: r.bottom - 6} : {x0: x - 28, y0: y - 28, x1: x + 28, y1: y + 28}, lab); }
  else hot.hidden = true;
  hot.classList.toggle('floor', !!t && k.target === 'floor');
  d.ghost.classList.toggle('ok', !!t);
}
function endDrag2(drop) {
  const d = UX.drag; if (!d) return; UX.drag = null;
  cancelAnimationFrame(d.raf); document.body.classList.remove('dragging'); d.el.classList.remove('lifted');
  $$('.dndtarget').forEach(b => b.hidden = true);
  if (drop && d.t == null) aimDrag(d);
  const t = drop ? d.t : null;
  if (!t) {  // back where it came from
    if (d.back) d.back();
    const r = d.el.getBoundingClientRect();
    d.ghost.classList.add('home'); d.ghost.style.transform = `translate(${r.left + r.width / 2}px, ${r.top + r.height / 2}px) translate(-50%, -50%) scale(.6)`;
    setTimeout(() => d.ghost.remove(), 220);
  } else {
    d.ghost.classList.add('drop'); setTimeout(() => d.ghost.remove(), 260);
    let msg = null; try { msg = d.k.commit(t, d.item, d.back || (() => {}), d.el); } catch (e) { console.warn('drop', e); }
    pop(d.x, d.y); haptic(18); tourEvent('pose');
    if (msg) toast(msg, {undo: true});
  }
  sheetDuringDrag(false);
  // the click that follows the end of a drag must not also tap the item
  const stop = e => { e.stopPropagation(); e.preventDefault(); }; addEventListener('click', stop, true); setTimeout(() => removeEventListener('click', stop, true), 0);
}
function pop(x, y) { if (UX.reduce) return; const p = document.createElement('div'); p.className = 'dndpop'; p.style.left = x + 'px'; p.style.top = y + 'px'; document.body.appendChild(p); setTimeout(() => p.remove(), 500); }
function initDrag() {
  let pend = null;
  addEventListener('pointerdown', e => {
    if (UX.drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const el = e.target.closest && e.target.closest(DRAG_SEL); if (!el || !kindFor(el) || el.closest('[aria-disabled="true"]')) return;
    pend = {el, x: e.clientX, y: e.clientY, id: e.pointerId, touch: e.pointerType !== 'mouse'};
    if (pend.touch) pend.timer = setTimeout(() => { if (pend) { startDrag(pend); pend = null; } }, 300);  // press and hold to lift it
  }, true);
  addEventListener('pointermove', e => {
    if (UX.drag) { e.preventDefault(); return moveDrag(e.clientX, e.clientY); }
    if (!pend || e.pointerId !== pend.id) return;
    const dx = e.clientX - pend.x, dy = e.clientY - pend.y;
    if (!pend.touch) { if (Math.hypot(dx, dy) > 6) { const p = pend; pend = null; startDrag(p); } return; }
    if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.4) { clearTimeout(pend.timer); const p = pend; pend = null; startDrag(p); moveDrag(e.clientX, e.clientY); }  // sideways: towards the canvas
    else if (Math.hypot(dx, dy) > 10) { clearTimeout(pend.timer); pend = null; }  // up and down: scrolling the panel
  }, {capture: true, passive: false});
  const up = drop => e => { if (pend) { clearTimeout(pend.timer); pend = null; } if (UX.drag) { e.preventDefault(); endDrag2(drop); } };
  addEventListener('pointerup', up(true), true); addEventListener('pointercancel', up(false), true);
  // while something is lifted, the finger moves it instead of scrolling; the long press must not open the browser's menu
  addEventListener('touchmove', e => { if (UX.drag) e.preventDefault(); }, {passive: false});
  addEventListener('contextmenu', e => { if (UX.drag || (pend && pend.touch)) e.preventDefault(); }, true);
  addEventListener('keydown', e => { if (UX.drag && e.key === 'Escape') endDrag2(false); });
  // the first tap on something that could have been dragged: say so, once
  addEventListener('click', e => {
    const el = e.target.closest && e.target.closest(DRAG_SEL); if (!el || !kindFor(el) || store.get('cdp.tipDrag', false) || TOUR.on) return;
    store.set('cdp.tipDrag', true); setTimeout(() => toast(tr('Consejo: también puedes arrastrarlo al lienzo y soltarlo encima de un personaje.')), 700);
  });
}

/* ---------- canvas gestures: two fingers undo, three redo ---------- */
function initGestures() {
  // starts with a finger on the canvas; the other fingers count wherever they land (the hint, the cast bar…)
  let g = null;
  addEventListener('touchstart', e => {
    const n = e.touches.length;
    if (n === e.changedTouches.length) g = vp.contains(e.target) && !UX.drag ? {n, t0: e.timeStamp, pts: new Map(), moved: false} : null;
    if (!g) return;
    g.n = Math.max(g.n, n);
    for (const t of e.changedTouches) g.pts.set(t.identifier, [t.clientX, t.clientY]);
  }, {passive: true, capture: true});
  addEventListener('touchmove', e => { if (!g) return; for (const t of e.changedTouches) { const p = g.pts.get(t.identifier); if (p && Math.hypot(t.clientX - p[0], t.clientY - p[1]) > 14) g.moved = true; } }, {passive: true, capture: true});
  addEventListener('touchend', e => {
    if (!g || e.touches.length) return;
    const quick = e.timeStamp - g.t0 < 500 && !g.moved, n = g.n; g = null;  // the time the fingers really took, not when the page got round to it
    if (!quick || sk.on || practice.active || UX.drag) return;
    if (n === 2 && !$('#undo').disabled) { withGlide(undo); haptic(10); toast(tr('Deshecho')); }
    else if (n === 3 && !$('#redo').disabled) { withGlide(redo); haptic(10); toast(tr('Rehecho')); }
  }, {passive: true, capture: true});
  addEventListener('touchcancel', () => { g = null; }, {passive: true, capture: true});
}

/* ---------- what can be done here: right click or press and hold ---------- */
function menuItemsAt(x, y) {
  rayAt(x, y);
  const propMeshes = props.flatMap(p => { const a = []; p.traverse(o => { if (o.isMesh && !o.userData.isHull) a.push(o); }); return a; });
  const hp = ray.intersectObjects(propMeshes, false)[0], hc = charAt(x, y, null);
  if (hp && (!hc || !hc.point || hp.distance < hc.point.distanceTo(camera.position))) {
    const g = hp.object.userData.propRoot; if (!g) return null;
    return {title: tr(PROPS[g.userData.prop] || (ASSET_PROPS[g.userData.prop] || [g.userData.prop])[0]), items: [
      ['Duplicar', () => { selectObj(g); $('#objDup').click(); }],
      ['Girar 90°', () => { g.rotation.y += Math.PI / 2; pushHistory(); }],
      ['Borrar', () => { selectObj(g); deleteSel(); toast(tr('Objeto borrado'), {undo: true}); }, 'danger']]};
  }
  if (hc) {
    const {m, ci} = hc, act = fn => () => onActive(ci, fn);
    return {title: nameOf(m), items: [
      ['Espejar la pose', act(() => withGlide(mirrorPose)), 'M'],
      ['Al suelo', act(() => withGlide(() => { mq.ground(); pushHistory(); }))],
      ['Pose al azar', act(() => withGlide(() => { applyRandom(mq, 'cualquiera'); state.posePreset = null; markPose(); syncAll(); pushHistory(); }))],
      ['Poner de pie', act(() => withGlide(() => usePreset(POSE.pie)))],
      ['Copiar la pose', () => { UX.clip = {pose: m.getPose(), yaw: m.yaw()}; UX.clipT = Date.now(); toast(tr('Pose copiada: pégala en cualquier personaje.')); }, 'Ctrl C'],
      ...(UX.clip ? [['Pegar la pose', act(() => pastePose(mq)), 'Ctrl V']] : []),
      ['Duplicar', act(() => duplicateChar(mq))],
      ['Guardar en Mis personajes', act(() => saveCharacter(mq))],
      ...(chars.length > 1 ? [['Quitar de la escena', () => { removeChar(ci); pushHistory(); toast(tr('Personaje quitado'), {undo: true}); }, 'danger']] : [])]};
  }
  return {title: null, items: [
    ['Añadir personaje', () => { const m = addChar(chars.length % 2 ? 'mujer' : 'hombre'); if (m) { const p = floorAt(x, y); if (p) { m.joints.hips.position.x = p.x; m.joints.hips.position.z = p.z; } setActive(chars.length - 1); pushHistory(); } }],
    ['Encuadrar a todos', () => { frameAll(); camTouched(); }, 'F'],
    ['Buscar…', openPalette, 'Ctrl K']]};
}
// the pose of another character, keeping where this one stands and which way it faces
function pastePose(m) {
  if (!UX.clip) return;
  const p = JSON.parse(JSON.stringify(UX.clip.pose)), here = m.joints.hips.position.clone(), turn = new Q().setFromAxisAngle(new V3(0, 1, 0), m.yaw() - UX.clip.yaw);
  p.q.hips = turn.multiply(new Q().fromArray(p.q.hips)).toArray(); p.pos = [here.x, p.pos[1], here.z];
  m.setPose(p); m.group.updateMatrixWorld(true); if (!m.stool) m.ground(); syncAll(); pushHistory();
}
function duplicateChar(m) {
  const c = addChar(m.bodyPreset || 'hombre', JSON.parse(JSON.stringify(m.body)), false); if (!c) return toast(tr('Ya hay {n} personajes en la escena.', {n: MAX_CHARS}));
  c.bodyPreset = m.bodyPreset; const p = m.getPose(), side = new V3(1, 0, 0).applyAxisAngle(new V3(0, 1, 0), camAzimuth() * DEG).multiplyScalar(.8 * m.size);
  p.pos = [p.pos[0] + side.x, p.pos[1], p.pos[2] + side.z]; c.setPose(p); c.group.updateMatrixWorld(true);
  if (m.outfit.length) setOutfit(c, JSON.parse(JSON.stringify(m.outfit)));
  setActive(chars.length - 1); pushHistory();
}
function openMenu(x, y) { const spec = menuItemsAt(x, y); if (spec) openMenuSpec(spec, x, y); }
function openMenuSpec(spec, x, y) {
  closeMenu();
  const box = document.createElement('div'); box.className = 'ctxmenu'; box.id = 'ctxMenu'; box.setAttribute('role', 'menu');
  if (spec.title) { const h = document.createElement('p'); h.className = 'ctxtitle'; h.textContent = spec.title; box.appendChild(h); }
  for (const [label, fn, extra] of spec.items) {
    const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.className = extra === 'danger' ? 'danger' : '';
    b.innerHTML = '<span></span>' + (extra && extra !== 'danger' ? `<kbd>${extra}</kbd>` : ''); b.firstChild.textContent = tr(label);
    b.onclick = () => { closeMenu(); fn(); }; box.appendChild(b);
  }
  document.body.appendChild(box);
  const w = box.offsetWidth, h = box.offsetHeight;
  box.style.left = Math.max(8, Math.min(x, innerWidth - w - 8)) + 'px'; box.style.top = Math.max(8, Math.min(y, innerHeight - h - 8)) + 'px';
  box.querySelector('button').focus({preventScroll: true}); haptic(14);
  box.onkeydown = e => { const bs = [...box.querySelectorAll('button')], i = bs.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); bs[(i + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length].focus(); } else if (e.key === 'Escape') closeMenu(); };
  setTimeout(() => addEventListener('pointerdown', UX.menuOff = e => { if (!box.contains(e.target)) closeMenu(); }, true), 0);
}
function closeMenu() { $('#ctxMenu')?.remove(); if (UX.menuOff) { removeEventListener('pointerdown', UX.menuOff, true); UX.menuOff = null; } }
function initMenus() {
  let rd = null, lp = null;
  vp.addEventListener('pointerdown', e => {
    if (e.target !== canvas || practice.active || sk.on) return;
    if (e.pointerType === 'mouse' && e.button === 2) rd = {x: e.clientX, y: e.clientY};
    else if (e.pointerType !== 'mouse' && !drag) {  // a still finger on the canvas: after a moment, the menu (and the camera stays put)
      clearTimeout(lp && lp.t); lp = {x: e.clientX, y: e.clientY, id: e.pointerId, t: setTimeout(() => { if (!lp || drag) return; controls.enabled = false; openMenu(lp.x, lp.y); lp.fired = true; }, 550)};
    }
  });
  vp.addEventListener('pointermove', e => { if (lp && e.pointerId === lp.id && !lp.fired && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 10) { clearTimeout(lp.t); lp = null; } });
  const end = e => { if (lp) { clearTimeout(lp.t); if (lp.fired) { controls.enabled = true; e.preventDefault(); } lp = null; } };
  vp.addEventListener('pointerup', e => { end(e); if (rd && e.button === 2 && Math.hypot(e.clientX - rd.x, e.clientY - rd.y) < 5) openMenu(e.clientX, e.clientY); rd = null; });
  vp.addEventListener('pointercancel', end);
  vp.addEventListener('touchstart', e => { if (e.touches.length > 1 && lp) { clearTimeout(lp.t); lp = null; } }, {passive: true});
  vp.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('scroll', closeMenu, true); addEventListener('resize', closeMenu);
}

/* ---------- find anything: Ctrl+K ---------- */
const RECENT_KEY = 'cdp.recent';
function paletteIndex() {
  const out = [], add = (type, label, run, extra = '', id = type + ':' + label) => out.push({type, label, run, extra, id, n: uxNorm(label + ' ' + extra)});
  const tabName = id => tabs.find(t => t.dataset.tab === id)?.querySelector('span')?.textContent || id;
  for (const [label, fn, key] of [['Deshacer', () => withGlide(undo), 'Ctrl Z'], ['Rehacer', () => withGlide(redo), 'Ctrl Y'], ['Espejar la pose', () => withGlide(mirrorPose), 'M'],
    ['Al suelo', () => { mq.ground(); pushHistory(); }], ['Poner de pie', () => withGlide(() => usePreset(POSE.pie))], ['Pose al azar', () => withGlide(() => { applyRandom(mq, 'cualquiera'); state.posePreset = null; markPose(); syncAll(); pushHistory(); })],
    ['Añadir personaje', () => castAddMenu($('#cast .chip.add') || $('#cast'))], ['Encuadrar a todos', () => { frameAll(); camTouched(); }, 'F'], ['Animación', () => setWorkspace('anim')], ['Exportar', () => $('#exportBtn').click()],
    ['Abrir en…', () => $('#openIn').click()], ['Boceto', () => $('#sketchBtn').click()], ['Práctica de gesto', () => $('#practiceBtn').click()], ['Cómo se usa', openHelp, '?'],
    ['Cambiar entre IK y FK', () => setIK(!state.ik), 'I'], ['Guardar archivo .neopose', saveNeopose, 'Ctrl+S'], ['Tutorial: lo básico', () => tourStart('basico')], ['Tutorial: animar', () => tourStart('animar')], ['Tutorial: del guion a la película', () => tourStart('guion')], ['Tutorial: pelaje y marcas', () => tourStart('pelaje')], ['Abrir archivo .neopose', pickNeopose, 'Ctrl+O'], ['Guardar este personaje', () => saveCharacter(mq)], ['Del guion a la película', () => { if (!ANIM.open) $('#animBtn').click(); openScript(); }], ['Buscar referencias libres', () => openRefs('pose')], ['Buscar GIFs libres', () => openRefs('anim')], ['Escenario desde una referencia', () => openRefs('scene')], ['Animaciones', () => { setWorkspace('anim'); setTimeout(() => $('#tlClips')?.click(), 50); }]])
    add('cmd', tr(label), fn, key || '');
  for (const t of tabs) add('tab', tr('Ir a {x}', {x: tabName(t.dataset.tab)}), () => { showTab(t.dataset.tab); setPanel(true); }, '');
  WS_ORDER.forEach((id, i) => add('cmd', tr('Espacio: {x}', {x: tr(WORKSPACES[id].label)}), () => setWorkspace(id), 'Alt ' + (i + 1)));
  for (const p of POSES) add('pose', p.label, () => withGlide(() => usePreset(p)), p.find || '');
  for (const n of [2, 3, 4]) for (const p of GROUP_POSES[n] || []) add('pose', p.label, () => withGlide(() => useGroup(p)), tr('{n} personas', {n}));
  for (const [k, v] of Object.entries(OUTFITS)) add('outfit', tr(v[0]), () => { wearOutfit(mq, v[1]); renderGarmentList(); renderLibrary(); renderCast(); pushHistory(); });
  for (const [k, v] of Object.entries(SCENES)) add('set', tr(v.label), () => { $('#envChips').querySelectorAll('.chip').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === k))); setEnv(k).then(() => { if (state.env === k) pushHistory(); }); });
  for (const [k, v] of [...Object.entries(ASSET_PROPS).map(([k, v]) => [k, v[0]]), ...Object.entries(PROPS)]) add('prop', tr(v), () => { const g = makeProp(k, spotNear()); setOutlines(g, state.envOutline); selectObj(g); pushHistory(); });
  for (const b of $$('#exprChips .chip[data-v]')) add('expr', b.textContent, () => b.click());
  for (const c of PROJECT.cast) add('char', c.name, () => placeCharacter(c), tr('Reparto del proyecto'), 'cast:' + c.id);
  for (const c of SAVED_CHARS) add('char', c.name, () => placeCharacter(c));
  if (ROPA.catalog) for (const c of ROPA.catalog) add('garment', gTitle(c), () => { if (!mq.outfit.some(s => s.id === c.id)) toggleGarment(c.id); }, c.title + ' ' + tr(c.cat));
  // the chips of the panels, read as they are now (the list of species keeps growing): pressing one is using it
  const chipsOf = (type, sel, tab, extra = () => '') => { for (const b of $$(sel)) if (!b.disabled) add(type, b.textContent.trim(), () => { showTab(tab); b.click(); }, extra(b), type + ':' + b.dataset.v); };
  chipsOf('species', '#speciesChips .chip', 'cuerpo', b => I18N_EN[SPECIES[b.dataset.v]?.label] || b.dataset.v);
  chipsOf('body', '#bodyChips .chip', 'cuerpo');
  for (const b of $$('#hairGrid .hairItem:not([disabled])')) add('hair', b.querySelector('.lt')?.textContent || b.title, () => { showTab('cuerpo'); b.click(); }, tr('Pelo'), 'hair:' + b.dataset.v);
  chipsOf('style', '#styleChips .chip', 'dibujo');
  chipsOf('view', '#viewChips .chip', 'camara', () => tr('Ángulo'));
  chipsOf('view', '#perspChips .chip', 'camara', () => tr('Perspectiva'));
  chipsOf('light', '#lightChips .chip', 'luz', () => tr('Luz'));
  for (const inp of $$('section[data-tab=dibujo] .checks input')) add('guide', inp.parentElement.textContent.trim(), () => { showTab('dibujo'); inp.click(); }, tr('Guías'), 'guide:' + inp.id);
  for (const c of typeof allClips === 'function' ? allClips() : []) add('anim', c.name, () => { if (!ANIM.open) openTimeline(true); AG.sel = c; AG.cat = 'todas'; AG.q = ''; $('#agSearch').value = ''; openAnimGallery(); }, `${I18N_EN[c.name] || ''} ${c.id} ${c.cat || ''}`, 'anim:' + c.id);
  // settings: language, theme, quality
  add('setting', tr('Ajustes'), openSettings, 'settings preferences', 'setting:all');
  for (const [k, v] of Object.entries(LANGS)) add('setting', `${tr('Idioma')}: ${v}`, () => setLang(k), 'language idioma', 'lang:' + k);
  for (const [k, v] of Object.entries(UI_THEMES)) add('setting', `${tr('Tema')}: ${tr(v)}`, () => setTheme(k), 'theme ' + k, 'theme:' + k);
  for (const [k, v] of Object.entries(QUALITY)) add('setting', `${tr('Calidad gráfica')}: ${tr(v[0])}`, () => applyQuality(k), 'quality', 'quality:' + k);
  return out;
}
const PAL_TYPE = {cmd: 'Acción', tab: 'Pestaña', pose: 'Pose', outfit: 'Conjunto', set: 'Escenario', prop: 'Objeto', expr: 'Expresión', char: 'Personaje', garment: 'Prenda',
  species: 'Especie', body: 'Cuerpo', hair: 'Peinado', style: 'Acabado', view: 'Cámara', light: 'Luz', guide: 'Guía', anim: 'Animación', setting: 'Ajuste'};
function openPalette() {
  if (!ROPA.catalog) loadCatalog().catch(() => {});
  if (!CLIPS.lib) loadClipLibrary().then(() => { if (!$('#palModal').hidden) { UX.pal.idx = paletteIndex(); renderPalette(); } }).catch(() => {});
  closeMenu(); const m = $('#palModal'); m.hidden = false; const inp = $('#palInput'); inp.value = ''; UX.pal = {idx: paletteIndex(), sel: 0};
  renderPalette(); inp.focus();
}
function closePalette() { $('#palModal').hidden = true; }
function paletteResults(q) {
  const P = UX.pal, w = uxNorm(q).trim().split(/\s+/).filter(Boolean);
  if (!w.length) { const rec = store.get(RECENT_KEY, []); return [...rec.map(id => P.idx.find(x => x.id === id)).filter(Boolean), ...P.idx.filter(x => x.type === 'cmd' && !rec.includes(x.id))].slice(0, 12); }
  const scored = [];
  for (const x of P.idx) {
    if (!w.every(t => x.n.includes(t))) continue;
    const l = uxNorm(x.label), s = (l.startsWith(w[0]) ? 0 : l.includes(' ' + w[0]) ? 1 : 2) * 100 + l.length + (x.type === 'cmd' ? -30 : x.type === 'garment' ? 25 : 0);
    scored.push([s, x]);
  }
  return scored.sort((a, b) => a[0] - b[0]).slice(0, 40).map(s => s[1]);
}
function renderPalette() {
  const P = UX.pal, list = $('#palList'), res = P.res = paletteResults($('#palInput').value);
  P.sel = Math.min(P.sel, Math.max(0, res.length - 1)); list.innerHTML = '';
  if (!res.length) list.innerHTML = `<li class="empty">${tr('Nada coincide con la búsqueda.')}</li>`;
  res.forEach((x, i) => {
    const li = document.createElement('li'); li.setAttribute('role', 'option'); li.id = 'pal' + i; li.setAttribute('aria-selected', String(i === P.sel));
    li.innerHTML = '<span class="pt"></span><span class="pl"></span>' + (x.type === 'cmd' && x.extra ? `<kbd>${x.extra}</kbd>` : '');
    li.querySelector('.pt').textContent = tr(PAL_TYPE[x.type]); li.querySelector('.pl').textContent = x.label;
    li.onpointerenter = () => { P.sel = i; list.querySelectorAll('li').forEach((e, j) => e.setAttribute('aria-selected', String(j === i))); };
    li.onclick = () => runPalette(x); list.appendChild(li);
  });
  $('#palInput').setAttribute('aria-activedescendant', res.length ? 'pal' + P.sel : '');
  list.querySelector('[aria-selected="true"]')?.scrollIntoView({block: 'nearest'});
}
function runPalette(x) {
  closePalette();
  const rec = store.get(RECENT_KEY, []).filter(id => id !== x.id); rec.unshift(x.id); store.set(RECENT_KEY, rec.slice(0, 6));
  try { x.run(); } catch (e) { console.warn('palette', e); }
}
function initPalette() {
  const inp = $('#palInput');
  inp.oninput = () => { UX.pal.sel = 0; renderPalette(); };
  inp.onkeydown = e => {
    const P = UX.pal;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); P.sel = (P.sel + (e.key === 'ArrowDown' ? 1 : -1) + P.res.length) % Math.max(1, P.res.length); renderPalette(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (P.res[P.sel]) runPalette(P.res[P.sel]); }
    else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
  };
  $('#palModal').onclick = e => { if (e.target.id === 'palModal') closePalette(); };
  $('#findBtn').onclick = $('#findF').onclick = openPalette;
  addEventListener('keydown', e => {
    const k = e.key.toLowerCase(), typing = e.target.matches('input,textarea,select,[contenteditable]');
    if ((e.ctrlKey || e.metaKey) && k === 'k') { e.preventDefault(); return $('#palModal').hidden ? openPalette() : closePalette(); }
    if (typing || e.altKey || sk.on || practice.active || !$('#palModal').hidden) return;
    if (e.ctrlKey || e.metaKey) {
      if (k === 'c' && !getSelection().toString()) { UX.clip = {pose: mq.getPose(), yaw: mq.yaw()}; UX.clipT = Date.now(); toast(tr('Pose copiada: pégala en cualquier personaje.')); }
      else if (k === 'v' && UX.clip) { e.preventDefault(); withGlide(() => pastePose(mq)); toast(tr('Pose pegada'), {undo: true}); }
      return;
    }
    if (k === '/') { e.preventDefault(); openPalette(); }
    else if (k === 'm') withGlide(mirrorPose);
    else if (k === 'f') { frameAll(); camTouched(); }
  });
}

/* ---------- phones: the panel is a sheet over the bottom of the canvas ---------- */
const SHEET = {snap: 'half'};
const sheetOn = () => matchMedia('(max-width: 860px)').matches;
function sheetHeights() { const top = $('header.top').getBoundingClientRect().bottom, H = innerHeight; return {peek: 118, half: Math.round(H * .48), full: Math.round(H - top - 96)}; }
function setSheet(snap, live) {
  SHEET.snap = snap; const h = typeof snap === 'number' ? snap : sheetHeights()[snap];
  document.body.style.setProperty('--sheetH', h + 'px'); $('#book').classList.toggle('live', !!live);
  $('#book').dataset.snap = typeof snap === 'number' ? 'drag' : snap;
  if (!live && typeof snap === 'string') store.set('cdp.sheet', snap);
  const g = $('.sheetgrip'); if (g && typeof snap === 'string') g.setAttribute('aria-expanded', String(snap !== 'peek'));  // (folded down or not, for screen readers)
}
function sheetDuringDrag(on) {
  if (!sheetOn()) return;
  if (on && SHEET.snap === 'full') { SHEET.restore = 'full'; setSheet('half'); }
  else if (!on && SHEET.restore) { setSheet(SHEET.restore); SHEET.restore = null; }
}
function initSheet() {
  const grip = document.createElement('button'); grip.type = 'button'; grip.className = 'sheetgrip'; grip.setAttribute('aria-label', tr('Ampliar o reducir el panel'));
  $('#book').prepend(grip);
  setSheet(store.get('cdp.sheet', 'half'));
  let d = null, tapT = 0;
  const step = () => setSheet(SHEET.snap === 'peek' ? 'half' : SHEET.snap === 'half' ? 'full' : 'peek');
  const startOn = el => el === grip || (el.closest('.tabs') && !el.closest('.tab'));
  $('#book').addEventListener('pointerdown', e => { if (!sheetOn() || !startOn(e.target)) return; d = {y: e.clientY, h: $('#book').getBoundingClientRect().height, t: performance.now(), moved: false}; try { e.target.setPointerCapture(e.pointerId); } catch (_) {} });
  $('#book').addEventListener('pointermove', e => {
    if (!d) return; const dy = e.clientY - d.y; if (Math.abs(dy) > 4) d.moved = true;
    const H = sheetHeights(); setSheet(clamp(d.h - dy, H.peek, H.full), true);
  });
  const end = e => {
    if (!d) return; const H = sheetHeights(), dy = e.clientY - d.y, v = dy / Math.max(1, performance.now() - d.t), h = d.h - dy;
    if (!d.moved) { tapT = performance.now(); step(); }  // a tap on the grip: one step up (and back down from the top)
    else if (v > .5) setSheet(h > H.half ? 'half' : 'peek');  // a flick down
    else if (v < -.5) setSheet(h < H.half ? 'half' : 'full');
    else setSheet(['peek', 'half', 'full'].reduce((a, b) => Math.abs(H[b] - h) < Math.abs(H[a] - h) ? b : a));
    d = null;
  };
  $('#book').addEventListener('pointerup', end); $('#book').addEventListener('pointercancel', end);
  // the grip pressed from the keyboard or a switch steps the same way (the click that follows a tap is already done)
  grip.onclick = () => { if (performance.now() - tapT < 500) return; step(); };
  // a tab touched while the sheet is lowered brings it up
  tabs.forEach(t => t.addEventListener('click', () => { if (sheetOn() && SHEET.snap === 'peek') setSheet('half'); }));
  // and so does a tap or the keyboard's focus inside it (not a mouse press: the chip under the pointer would move mid-click)
  const pg = $('#book .page'), up = () => { if (sheetOn() && SHEET.snap === 'peek') setSheet('half'); };
  pg.addEventListener('click', up);
  pg.addEventListener('focusin', e => { if (e.target.matches(':focus-visible')) up(); });
  addEventListener('resize', () => { if (typeof SHEET.snap === 'string') setSheet(SHEET.snap); });
}

/* ---------- sliders: double click resets, the value can be typed ---------- */
function sliderExtras(wrap, inp, out, o) {
  const def = o.def ?? o.value, fire = () => { inp.dispatchEvent(new Event('input', {bubbles: true})); inp.dispatchEvent(new Event('change', {bubbles: true})); };
  inp.ondblclick = () => { inp.value = def; fire(); };
  out.tabIndex = 0; out.setAttribute('role', 'button'); out.title = tr('Escribir un valor');
  const edit = () => {
    if (wrap.querySelector('input.slnum')) return;
    const max = +inp.max || 1, shown = parseFloat(o.fmt(max)), k = isFinite(shown) && max ? shown / max : 1;
    const num = document.createElement('input'); num.type = 'number'; num.className = 'slnum'; num.step = 'any'; num.value = +(parseFloat(o.fmt(+inp.value)) || +inp.value * k).toFixed(3);
    num.setAttribute('aria-label', wrap.querySelector('label').textContent); out.hidden = true; out.after(num); num.focus(); num.select();
    let closed = false;
    const done = ok => { if (closed) return; closed = true; const v = num.value; num.remove(); out.hidden = false; if (ok && v !== '' && isFinite(+v)) { inp.value = clamp(+v / k, +inp.min, +inp.max); fire(); } };
    num.onkeydown = e => { if (e.key === 'Enter') done(true); else if (e.key === 'Escape') done(false); };
    num.onblur = () => done(true);
  };
  out.onclick = edit; out.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); edit(); } };
}

/* ---------- a handle a finger can find: the nearest one within reach of the touch ---------- */
function nearHandle(x, y) {
  const reach = matchMedia('(pointer: coarse)').matches ? 30 : 16; let best = null, bd = reach;
  for (const o of [...Object.values(handles), ...Object.values(jointDots)]) {
    if (!o.visible) continue; const s = screenOf(o.position); if (s.z > 1) continue;
    const dd = Math.hypot(s.x - x, s.y - y); if (dd < bd) { bd = dd; best = o; }
  }
  return best ? {object: best} : null;
}

/* ---------- windows: Esc closes the top one, Tab stays inside it, focus goes back to what opened it ----------
   One place for every .modal, however it is opened: a watcher on their [hidden] attribute. Esc presses the
   window's own close button ([data-close]) so its clean-up runs (and a busy export, whose button is disabled, stays). */
const MODAL = {stack: [], recent: []};
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';
const focusablesIn = el => [...el.querySelectorAll(FOCUSABLE)].filter(e => e.getClientRects().length && !e.closest('[hidden]'));
function modalShown(m) {
  MODAL.stack = MODAL.stack.filter(x => x.m !== m);
  const opener = [...MODAL.recent].reverse().find(e => e.isConnected && !m.contains(e)) || null;
  MODAL.stack.push({m, opener});
  const sheet = m.querySelector('[role=dialog]') || m;
  if (!m.contains(document.activeElement)) (focusablesIn(sheet)[0] || sheet).focus({preventScroll: true});
}
function modalHidden(m) {
  const i = MODAL.stack.findIndex(x => x.m === m); if (i < 0) return;
  const {opener} = MODAL.stack.splice(i, 1)[0], a = document.activeElement;
  if ((!a || a === document.body || m.contains(a)) && opener && opener.isConnected && opener.getClientRects().length) opener.focus({preventScroll: true});
}
const topModal = () => { for (let i = MODAL.stack.length - 1; i >= 0; i--) if (!MODAL.stack[i].m.hidden) return MODAL.stack[i].m; return null; };
function closeModal(m) { const b = m.querySelector('[data-close]'); if (!b) m.hidden = true; else if (!b.disabled) b.click(); }
function initModals() {
  const mods = $$('.modal');
  for (const m of mods) { const d = m.querySelector('[role=dialog]'); if (d) { d.setAttribute('aria-modal', 'true'); if (!d.hasAttribute('tabindex')) d.tabIndex = -1; } if (!m.hidden) modalShown(m); }
  const obs = new MutationObserver(recs => { for (const r of recs) (r.target.hidden ? modalHidden : modalShown)(r.target); });
  for (const m of mods) obs.observe(m, {attributes: true, attributeFilter: ['hidden']});
  // what had the focus (or the finger) outside the windows: where the focus goes back
  const remember = e => { const el = e.target.closest && e.target.closest(FOCUSABLE); if (el && !el.closest('.modal')) { MODAL.recent.push(el); if (MODAL.recent.length > 8) MODAL.recent.shift(); } };
  addEventListener('focusin', remember, true); addEventListener('pointerdown', remember, true);
  addEventListener('keydown', e => {
    const m = topModal(); if (!m) return;
    if (e.key === 'Escape' && !e.target.matches('input.slnum')) { e.preventDefault(); e.stopImmediatePropagation(); closeModal(m); }
    else if (e.key === 'Tab') {
      const f = focusablesIn(m.querySelector('[role=dialog]') || m); if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (i < 0 || (e.shiftKey && i === 0) || (!e.shiftKey && i === f.length - 1)) { e.preventDefault(); f[e.shiftKey ? f.length - 1 : 0].focus(); }
    }
  }, true);
}

// opens a section of the panel and scrolls the panel (never the page) to it; the tab must be showing already
function goSection(d, flash = true) {
  if (!d) return; const sec = d.closest('section[data-tab]'), pg = d.closest('.page'), nav = sec && sec.querySelector(':scope > .secnav');
  d.open = true; if (typeof sheetOn === 'function' && sheetOn() && SHEET.snap === 'peek') setSheet('half');
  pg.scrollTo({top: d.getBoundingClientRect().top - pg.getBoundingClientRect().top + pg.scrollTop - (nav ? nav.offsetHeight : 0) - 4, behavior: UX.reduce ? 'auto' : 'smooth'});
  if (flash) { d.classList.add('flash'); setTimeout(() => d.classList.remove('flash'), 900); }
}
// a long tab gets an index at the top: one tap opens a section and takes you there
function buildSectionNav() {
  for (const sec of $$('.page section[data-tab]')) {
    const ds = [...sec.querySelectorAll(':scope > details.sec')]; if (ds.length < 3) continue;
    const nav = document.createElement('nav'); nav.className = 'secnav'; nav.setAttribute('aria-label', tr('Secciones'));
    for (const d of ds) {
      const h = d.querySelector('summary h3'); if (!h) continue;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = [...h.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
      b.dataset.sec = d.dataset.sec; b.hidden = d.hidden;
      b.onclick = () => { nav.scrollTo({left: b.offsetLeft - (nav.clientWidth - b.offsetWidth) / 2, behavior: UX.reduce ? 'auto' : 'smooth'}); goSection(d); };
      nav.appendChild(b);
    }
    sec.prepend(nav);
    // the fade at the right edge says there is more; it goes once the end is in sight
    const fade = () => nav.classList.toggle('end', nav.scrollLeft + nav.clientWidth >= nav.scrollWidth - 4);
    nav.addEventListener('scroll', fade, {passive: true}); new ResizeObserver(fade).observe(nav);
    // a mouse wheel scrolls the row sideways; at either end it goes on to the panel
    nav.addEventListener('wheel', e => { if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || nav.scrollWidth <= nav.clientWidth) return; const x = nav.scrollLeft; nav.scrollLeft += e.deltaY; if (nav.scrollLeft !== x) e.preventDefault(); }, {passive: false});
  }
}
function buildUX() {
  buildSectionNav();
  const dc = $('#dropColors');
  for (const c of PALETTE) { const b = document.createElement('button'); b.type = 'button'; b.dataset.c = c; b.style.background = c; b.title = c; b.setAttribute('aria-label', tr('Color {c}: arrástralo a una prenda', {c}));
    b.onclick = () => toast(tr('Arrastra el color hasta una prenda o el pelo de un personaje.')); dc.appendChild(b); }
  initDrag(); initGestures(); initMenus(); initPalette(); initSheet(); initModals();
  // the handlers that change a pose from the panel glide too
  for (const [sel, fn] of [['#mirrorBtn', () => mirrorPose()], ['#resetBtn', () => { usePreset(POSE.pie); toast(tr('Pose de pie neutra'), {undo: true}); }], ['#undo', undo], ['#redo', redo], ['#undoF', undo], ['#redoF', redo]]) {
    const b = $(sel), strokes = /^#(un|re)do/.test(sel);  // (while sketching, undo and redo act on the strokes)
    if (b) b.onclick = () => strokes && sk.on ? $(sel.includes('undo') ? '#skUndo' : '#skRedo').click() : withGlide(fn);
  }
}
