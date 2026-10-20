/* ---------- pointer interaction ---------- */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let down = null, drag = null, gizmoDragged = false, hoverHandle = null;
function setNdc(e) { const r = canvas.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); ray.setFromCamera(ndc, camera); }
vp.addEventListener('pointerdown', e => {
  if (e.target !== canvas) return;
  if (e.pointerType === 'mouse' && e.button !== 0) { down = null; return; }  // right button: the camera pans, or the menu opens
  down = {x: e.clientX, y: e.clientY}; gizmoDragged = false;
  if (tc.axis || practice.active) return;
  setNdc(e);
  finishGlides();
  const hit = ray.intersectObjects([...Object.values(handles), sunHandle].filter(h => h.visible))[0]
    || ray.intersectObjects(Object.values(jointDots).filter(d => d.visible))[0] || nearHandle(e.clientX, e.clientY);
  if (!hit) return;
  e.stopPropagation(); e.preventDefault();
  if (hit.object.userData.joint) {
    const jn = hit.object.userData.joint, start = hit.object.position.clone();
    if (jn === 'hips') { drag = {id: 'hips', plane: new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new V3()), start), offset: new V3(), dot: jn}; const p0 = ray.ray.intersectPlane(drag.plane, new V3()) || start; drag.offset.copy(mq.joints.hips.position).sub(p0); drag.feet = {footL: mq.joints.ankleL.getWorldPosition(new V3()), footR: mq.joints.ankleR.getWorldPosition(new V3())}; }
    else drag = {id: 'fk', joint: jn, plane: new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new V3()), start), moved: false, ik: state.ik};
    controls.enabled = false; try { vp.setPointerCapture(e.pointerId); } catch (_) {} vp.style.cursor = 'grabbing';
    return;
  }
  if (hit.object === sunHandle) { drag = {id: 'sun'}; controls.enabled = false; try { vp.setPointerCapture(e.pointerId); } catch (_) {} return; }
  const id = hit.object.userData.id, start = hit.object.position.clone();
  drag = {id, plane: new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new V3()), start), offset: new V3()};
  const p0 = ray.ray.intersectPlane(drag.plane, new V3()) || start;
  if (id === 'hips') { drag.offset.copy(mq.joints.hips.position).sub(p0); drag.feet = {footL: mq.joints.ankleL.getWorldPosition(new V3()), footR: mq.joints.ankleR.getWorldPosition(new V3())}; }
  else drag.offset.copy(start).sub(p0);
  controls.enabled = false;
  try { vp.setPointerCapture(e.pointerId); } catch (_) {}
  vp.style.cursor = 'grabbing';
}, true);
vp.addEventListener('pointermove', e => {
  if (!drag) {
    if (e.target === canvas && !tc.dragging && !practice.active) { setNdc(e); const hv = e.pointerType === 'mouse' ? (ray.intersectObjects([...Object.values(handles), ...Object.values(jointDots)].filter(h => h.visible))[0] || nearHandle(e.clientX, e.clientY)) : null; hoverHandle = hv ? hv.object : null; vp.style.cursor = hv ? 'grab' : ''; }
    return;
  }
  setNdc(e);
  if (drag.id === 'sun') return dragSun(ray);
  if (drag.id === 'fk') {
    const p = ray.ray.intersectPlane(drag.plane, new V3()); if (!p) return;
    drag.moved = true;
    if (drag.ik && EFFECTOR_OF[drag.joint]) { const id = EFFECTOR_OF[drag.joint]; solveIK(mq.chains[id], mq.joints[EFFECTOR[id]], p); if (state.sym) for (const l of mq.chains[id]) mirrorJoint(mq, l.obj.name); if (pinsOf(mq)[id]) pinsOf(mq)[id].copy(p); }
    else if (JOINT_PARENT[drag.joint]) { aimParent(mq, drag.joint, p); if (state.sym) mirrorJoint(mq, JOINT_PARENT[drag.joint]); enforcePins(mq, JOINT_PARENT[drag.joint]); }
    syncJointSliders(); return;
  }
  const p = ray.ray.intersectPlane(drag.plane, new V3()); if (!p) return;
  p.add(drag.offset);
  if (drag.id === 'hips') {
    if (p.y < .05) p.y = .05;
    mq.joints.hips.position.copy(p); mq.group.updateMatrixWorld(true);
    if ($('#pinFeet').checked) for (const f of ['footL', 'footR']) solveIK(mq.chains[f], mq.joints[EFFECTOR[f]], drag.feet[f]);
    enforcePins(mq, null);
  } else {
    if (drag.id.startsWith('foot') && p.y < .02) p.y = .02;
    solveIK(mq.chains[drag.id], mq.joints[EFFECTOR[drag.id]], p);
    if (pinsOf(mq)[drag.id]) pinsOf(mq)[drag.id].copy(p);
    if (state.sym) for (const l of mq.chains[drag.id]) mirrorJoint(mq, l.obj.name);
  }
  syncJointSliders();
});
// FK: turn the parent bone so the dragged joint points at the cursor (the rest of the chain is untouched)
const EFFECTOR_OF = {wristL: 'handL', wristR: 'handR', ankleL: 'footL', ankleR: 'footR'};
function aimParent(m, jn, target) {
  const pn = JOINT_PARENT[jn], P = m.joints[pn], J = m.joints[jn]; if (!P || !J) return;
  m.group.updateMatrixWorld(true);
  const pp = P.getWorldPosition(new V3()), cur = J.getWorldPosition(new V3()).sub(pp), want = target.clone().sub(pp);
  if (cur.lengthSq() < 1e-8 || want.lengthSq() < 1e-8) return;
  const qw = new Q().setFromUnitVectors(cur.normalize(), want.normalize()), pw = P.getWorldQuaternion(new Q()), parentW = P.parent.getWorldQuaternion(new Q());
  P.quaternion.copy(parentW.invert().multiply(qw.multiply(pw)));
  if (HINGE[pn]) { const e = new THREE.Euler().setFromQuaternion(P.quaternion, 'XYZ'); P.rotation.set(clamp(e.x, HINGE[pn][0] * DEG, HINGE[pn][1] * DEG), 0, 0); }
  m.group.updateMatrixWorld(true);
}
function setIK(on) {
  state.ik = on; store.set('cdp.ik', on);
  $$('#ikMode .chip').forEach(c => c.setAttribute('aria-pressed', String((c.dataset.v === 'ik') === on)));
  if (toastKeep !== null) toastKeep = on ? HINT_IK : HINT_FK; else $('#hint').innerHTML = on ? HINT_IK : HINT_FK;  // under a note: once it goes
}
// one wording from the start, "tap" for fingers and "click" for a mouse
const TOUCH = matchMedia('(pointer: coarse)').matches;
const HINT_IK = TOUCH ? tr('Arrastra <b>●</b> manos y pies y <i>●</i> el cuerpo · toca una pieza o un punto para girarla')
  : tr('Arrastra los puntos <b>●</b> para mover manos y pies, el <i>●</i> para mover el cuerpo · haz clic en una pieza o un punto para girarla');
const HINT_FK = TOUCH ? tr('Modo FK: arrastra una articulación ◉ para girar su hueso · tócala para usar el aro')
  : tr('Modo FK: arrastra cualquier articulación ◉ y solo gira el hueso que la sostiene · haz clic en una para girarla con el aro');
function endDrag() {
  if (drag && drag.id === 'fk' && drag.moved) tourEvent(drag.ik ? 'ik' : 'fk');
  if (drag && drag.id !== 'fk' && drag.id !== 'sun') tourEvent(drag.id === 'hips' ? 'hips' : 'ik');
  if (drag && drag.id === 'fk' && !drag.moved) { const jn = drag.joint; drag = null; controls.enabled = true; vp.style.cursor = ''; down = null; return select(jn); }
  if (!drag) return; const wasSun = drag.id === 'sun'; drag = null; controls.enabled = true; vp.style.cursor = ''; if (!wasSun) pushHistory(); }
vp.addEventListener('pointerup', e => {
  if (drag) { endDrag(); down = null; return; }
  if (down && !gizmoDragged && !practice.active && e.target === canvas && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) {
    setNdc(e);
    const targets = [...chars.flatMap(m => m.meshes), ...props.flatMap(p => { const a = []; p.traverse(o => { if (o.isMesh && !o.userData.isHull) a.push(o); }); return a; }),
      ...extraLights.map(g => g.userData.ref.bulb), ...chars.flatMap(m => m.avatar ? m.avatar.meshes : [])];
    const hit = ray.intersectObjects(targets, false)[0];
    if (!hit) select(null);
    else if (hit.object.userData.lightRoot) selectObj(hit.object.userData.lightRoot);
    else if (hit.object.userData.propRoot) selectObj(hit.object.userData.propRoot);
    else if (hit.object.userData.avatarOf) {
      const owner = hit.object.userData.avatarOf, ci = chars.indexOf(owner); let best = null, bd = Infinity;
      for (const n of DOT_JOINTS) { const j = owner.joints[n]; if (!j || (n.startsWith('tail') && !owner.hasTail) || (n.startsWith('ear') && !owner.hasEars)) continue; const d = j.getWorldPosition(new V3()).distanceTo(hit.point); if (d < bd) { bd = d; best = n; } }
      if (ci !== active) setActive(ci);
      select(best);
    }
    else {
      const ci = chars.findIndex(m => m.meshes.includes(hit.object));
      const owner = chars[ci], jn = owner.pick(hit);
      if (ci !== active) setActive(ci);
      select(jn);
      if (jn && jn.startsWith('wrist') && state.handSide !== 'both') { state.handSide = jn.slice(-1); setPressed($('#handSide'), state.handSide); syncHandUI(); }
    }
  }
  down = null;
});
vp.addEventListener('pointercancel', endDrag);
tc.addEventListener('dragging-changed', e => { controls.enabled = !e.value; if (e.value) gizmoDragged = true; });
tc.addEventListener('objectChange', () => {
  const s = state.sel; if (s && s.kind === 'joint') tourEvent('rotate');
  if (s && s.kind === 'joint') {
    const n = state.selected;
    if (n && HINGE[n]) { const j = mq.joints[n]; j.rotation.set(clamp(hingeAngle(j.quaternion), HINGE[n][0] * DEG, HINGE[n][1] * DEG), 0, 0, 'XYZ'); }
    if (state.sym && n) mirrorJoint(mq, n);
    if (n) enforcePins(mq, n);
    syncJointSliders();
  } else if (s && s.kind === 'prop' && s.obj.position.y < 0) s.obj.position.y = 0;
});
tc.addEventListener('mouseUp', () => { if (state.sel) pushHistory(); });
/* ---------- posing with the keyboard ----------
   The canvas takes the focus (Tab): J and Shift+J go from joint to joint, the arrows turn the one chosen (up/down
   bend it, left/right twist it, with Shift the third axis; 5° a press, 1° with Alt), within the joint's limits, with
   symmetry and pins as when it is dragged. What is chosen and its angles are read out to screen readers. */
function announce(msg) { const l = $('#srLive'); if (!l) return; l.textContent = ''; requestAnimationFrame(() => { l.textContent = msg; }); }
const kbJoints = () => DOT_JOINTS.filter(n => mq.joints[n] && !(n.startsWith('tail') && !mq.hasTail) && !(n.startsWith('ear') && !mq.hasEars));
let kbHistT = 0;
{
  const gl = $('#gl'); gl.tabIndex = 0; gl.setAttribute('role', 'application');
  gl.setAttribute('aria-label', tr('Lienzo 3D. J y Mayús+J eligen una articulación; las flechas la giran (Mayús: el tercer eje; Alt: de 1 en 1).'));
  gl.addEventListener('keydown', e => {
    if (practice.active || sk.on || topModal() || e.ctrlKey || e.metaKey) return;
    if (e.key.toLowerCase() === 'j') {
      const L = kbJoints(), i = L.indexOf(state.selected), n = L[((i < 0 ? (e.shiftKey ? 0 : -1) : i) + (e.shiftKey ? -1 : 1) + L.length) % L.length];
      select(n); announce(JOINT_LABEL[n]); e.preventDefault(); e.stopPropagation(); return;
    }
    if (!/^Arrow/.test(e.key) || !state.selected || !state.sel || state.sel.kind !== 'joint') return;
    e.preventDefault(); e.stopPropagation();  // the timeline's arrows are for when the canvas does not have the focus
    const n = state.selected, j = mq.joints[n], d = (e.altKey ? 1 : 5) * DEG * (e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : -1);
    const ax = e.key === 'ArrowUp' || e.key === 'ArrowDown' ? 'x' : e.shiftKey ? 'z' : 'y';
    j.rotation.order = 'XYZ'; j.rotation[ax] += d;
    if (HINGE[n]) j.rotation.set(clamp(j.rotation.x, HINGE[n][0] * DEG, HINGE[n][1] * DEG), 0, 0, 'XYZ');
    if (state.sym) mirrorJoint(mq, n); enforcePins(mq, n); syncJointSliders(); if (typeof wake === 'function') wake();
    clearTimeout(kbHistT); kbHistT = setTimeout(pushHistory, 500);
    const r = j.rotation, deg = v => Math.round(v / DEG);
    announce(HINGE[n] ? `${JOINT_LABEL[n]}: ${deg(r.x)}°` : `${JOINT_LABEL[n]}: ${deg(r.x)}°, ${deg(r.y)}°, ${deg(r.z)}°`);
  });
}
addEventListener('keydown', e => {
  if (e.target.matches('input:not([type=range]):not([type=checkbox]):not([type=radio]):not([type=color]),textarea,select') || topModal()) return;
  const k = e.key.toLowerCase();
  if (sk.on && (e.ctrlKey || e.metaKey) && (k === 'z' || k === 'y')) { e.preventDefault(); (k === 'y' || e.shiftKey ? $('#skRedo') : $('#skUndo')).click(); }
  else if ((e.ctrlKey || e.metaKey) && k === 'z' && !e.shiftKey) { e.preventDefault(); if (withGlide(undo)) toast(tr('Deshecho')); }
  else if ((e.ctrlKey || e.metaKey) && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); if (withGlide(redo)) toast(tr('Rehecho')); }
  else if (k === 'delete' || k === 'backspace') { if (state.sel && state.sel.kind !== 'joint') { e.preventDefault(); deleteSel(); } }
  else if (k === 'i' && !e.ctrlKey && !e.metaKey && !sk.on && !practice.active) { setIK(!state.ik); }
  // the windows close themselves on Esc (see initModals); here: the tour, the practice, the sketch, the selection
  else if (k === 'escape') { if (TOUR.on) tourEnd(false); else if (practice.active) stopPractice(); else if (sk.on) setSketch(false); else select(null); }
  else if ((e.ctrlKey || e.metaKey) && k === 'e' && !e.shiftKey && !practice.active) { e.preventDefault(); openExport(); }
  else if (e.altKey && !e.ctrlKey && !e.metaKey && /^Digit[123]$/.test(e.code) && !practice.active) { e.preventDefault(); setWorkspace(WS_ORDER[+e.code.slice(5) - 1]); }
  else if (e.ctrlKey || e.metaKey || e.altKey || sk.on) return;
  else if (/^[1-6]$/.test(k) && !practice.active) { const vis = tabs.filter(t => !t.hidden); if (vis[+k - 1]) { turnTo(vis[+k - 1].dataset.tab); setPanel(true); } }
  else if (k === 'b' && !practice.active) setSketch(true);
  else if (k === 'a' && !practice.active) openTimeline(!ANIM.open);  // A goes in and out of Animación (the space tab only goes in)
  else if (k === '\\') setPanel(document.body.classList.contains('nopanel'));
  else if (e.key === '?') openHelp();
});
