/* ======================= the bible: the project's cast and places =======================
   Personajes y lugares' own tab. The work's characters are kept here once (their body, species, hair and clothes),
   each with a portrait; the script's names that have no design yet are listed to be designed; the places are kept
   with their set, time of day, objects, lights and camera views; and the model sheets are made from them (turnaround,
   expressions, the cast's heights side by side). A character updated here is updated in every shot of the film and
   every comic panel that has them; a script that names them uses them; a place is used where a scene heading names it. */
function bibleCastFromActive(name) {
  const m = mq; if (name) { m.body.name = name; renderCast(); }
  // under another name it is someone new: the cast member it came from stays as it was
  const cur = m.body.castId && castById(m.body.castId); if (name && cur && scNorm(cur.name) !== scNorm(name)) delete m.body.castId;
  const c = castFromChar(m, name || m.body.name || charLabel(m)); c.thumb = characterThumb(m);
  const n = propagateCast(c.id); renderBible(); autosaveSoon();
  toast(n.shots + n.panels ? tr('«{x}» actualizado en el proyecto, en {s} planos y {p} viñetas.', {x: c.name, s: n.shots, p: n.panels}) : tr('«{x}» está en el reparto del proyecto.', {x: c.name}));
  return c;
}
// the active character into the cast under that name; when that name is the cast member it already is, it asks first,
// since every shot and comic panel that has them is changed with it
function bibleAddActive(nm) {
  const cur = mq.body.castId && castById(mq.body.castId); if (cur && scNorm(cur.name) === scNorm(nm) && !confirm(tr('¿Cambiar a «{x}» por el personaje activo en todo el proyecto (planos y viñetas)?', {x: cur.name}))) return;
  return bibleCastFromActive(nm);
}
// the names a script has that the cast has not (to be designed)
function scriptNamesToDesign() {
  const t = store.get('cdp.script', '') || ''; if (!t.trim()) return [];
  try { const P = parseScript(t), have = new Set(PROJECT.cast.map(c => scNorm(c.name).split(/\s+/)[0])); return [...P.names.values()].map(n => n.name).filter(n => !have.has(scNorm(n).split(/\s+/)[0])); } catch (e) { return []; }
}
// a place: the set as it is now, under a name
function saveLocation(name) {
  const o = sceneExtras(true), loc = {id: newId('l'), name: name || tr('Lugar {n}', {n: PROJECT.locations.length + 1}), env: o.env, amb: o.amb, props: o.props, lights: o.lights, light: {...state.light}, views: [{name: tr('Vista 1'), cam: camState()}], thumb: viewSnapshot()};
  PROJECT.locations.push(loc); renderBible(); autosaveSoon(); toast(tr('Lugar «{x}» guardado.', {x: loc.name})); return loc;
}
async function applyLocation(loc, view = 0) {
  applySceneExtras({env: loc.env, amb: loc.amb, props: loc.props, lights: loc.lights});
  if (loc.light) { state.light = {...loc.light}; if (typeof syncLightUI === 'function') syncLightUI(); }
  if (loc.views && loc.views[view]) applyCam(loc.views[view].cam);
  pushHistory();
}
// the face of an expression put on at once (the same morphs the film uses), for a sheet
function faceNow(m, e) {
  const inf = m.body3 && m.body3.morphTargetInfluences, nv = mouthCount(); if (!inf || !nv) return;
  const W = new Array(nv).fill(0), x = FACE_EXPR[e]; if (x) for (const [n, v] of Object.entries(x.u)) if (UNIT_AT[n] != null && UNIT_AT[n] < nv) W[UNIT_AT[n]] += v;
  for (let k = 0; k < nv && k < inf.length; k++) { inf[k] = W[k]; for (const h of m.hulls) if (h.morphTargetInfluences) h.morphTargetInfluences[k] = W[k]; }
}
// the active character's faces, close, in a grid with their names
async function expressionSheet() {
  const m = mq, human = m.body.species === 'humano' && !m.headSwap && !m.avatar, list = human ? Object.keys(FACE_EXPR).filter(k => k !== 'dormido') : Object.keys(ANTHRO_EXPR);
  const camP = camera.position.clone(), camT = controls.target.clone(), vis = chars.map(c => c.group.visible), save = m.getPose();
  chars.forEach(c => c.group.visible = c === m);
  const head = m.joints.head.getWorldPosition(new V3()), yaw = m.yaw(), d = m.headH * 5.2;
  controls.target.copy(head).add(new V3(0, -m.headH * .1, 0)); camera.position.set(head.x + Math.sin(yaw + .3) * d, head.y + m.headH * .2, head.z + Math.cos(yaw + .3) * d); controls.update();
  const S = 320, pics = [];
  for (const e of list) { if (human) faceNow(m, e); else { m.setPose(save); applyExpression(m, e); m.group.updateMatrixWorld(true); } pics.push([e, renderView({w: S, h: S, bg: 'paper'})]); }
  if (human) faceNow(m, m.body.expr || 'neutra'); m.setPose(save);
  chars.forEach((c, i) => c.group.visible = vis[i]); camera.position.copy(camP); controls.target.copy(camT); controls.update();
  return sheetGrid(tr('Expresiones de {x}', {x: m.body.name || charLabel(m)}), pics.map(([e, cv]) => [tr((human ? FACE_EXPR : ANTHRO_EXPR)[e].label), cv]), 4);
}
// the whole cast side by side, in a neutral pose, with head-height lines (who is how tall, in heads)
async function lineupSheet() {
  const bench = {snap: {...snapshot(), ...sceneExtras(false)}, cam: camState()};
  const pool = PROJECT.cast.length ? PROJECT.cast : chars.map(m => ({name: m.body.name || charLabel(m), body: m.body, preset: m.bodyPreset, outfit: m.outfit}));
  const list = pool.slice(0, MAX_CHARS);
  restore({chars: list.map(c => ({body: {...BODY_BASE, ...JSON.parse(JSON.stringify(c.body))}, preset: c.preset, pose: null, outfit: c.outfit || []}))});
  await Promise.all(chars.flatMap(m => (m.garments || []).map(g => g.ready))).catch(() => {});
  chars.forEach((m, i) => { m.joints.hips.position.set((i - (chars.length - 1) / 2) * .95, m.rootY, 0); applyPreset(m, POSE.pie, {yaw: 0}); m.joints.hips.position.x = (i - (chars.length - 1) / 2) * .95; m.ground(); });
  const tall = Math.max(...chars.map(m => m.box(6).max.y)), wide = chars.length * .95 + .6;
  controls.target.set(0, tall / 2, 0); state.focal = 50; setFocal(50, false); const d = Math.max(tall, wide / 1.4) * 1.9; camera.position.set(0, tall / 2, d); controls.update();
  const cv = renderView({w: 1600, h: 1000, bg: 'alpha'});
  const out = document.createElement('canvas'); out.width = 1600; out.height = 1080; const g = out.getContext('2d'); g.fillStyle = '#fbf8f1'; g.fillRect(0, 0, out.width, out.height);
  // the head lines, behind the figures, measured on the first one's head
  const ref = chars[0], hh = ref.headH, cam = camera.clone(); cam.aspect = 1.6; cam.updateProjectionMatrix(); const y2px = y => (1 - (new V3(0, y, 0).project(cam).y + 1) / 2) * 1000 + 80;
  g.strokeStyle = 'rgba(43,90,158,.3)'; g.font = `12px ${css('--f-mono')}`; g.fillStyle = '#6d6555';
  for (let k = 0; k * hh <= tall + hh; k++) { const y = y2px(k * hh); g.beginPath(); g.moveTo(40, y); g.lineTo(1560, y); g.stroke(); g.fillText(String(k), 18, y + 4); }
  g.drawImage(cv, 0, 80);
  g.fillStyle = '#2a2620'; g.font = `700 30px ${css('--f-hand')}`; g.fillText(tr('Alturas del reparto'), 40, 48); g.font = `600 15px ${css('--f-body')}`; g.textAlign = 'center';
  chars.forEach((m, i) => { const p = m.joints.hips.getWorldPosition(new V3()).project(cam), x = (p.x + 1) / 2 * 1600; g.fillText(list[i].name || charLabel(m), x, 1062); });
  restore(bench.snap); applyCam(bench.cam);
  return out;
}
function sheetGrid(title, items, cols) {
  const S = items[0][1].width, gap = 18, head = 70, rows = Math.ceil(items.length / cols), out = document.createElement('canvas');
  out.width = cols * S + (cols + 1) * gap; out.height = head + rows * (S + 30 + gap) + gap; const g = out.getContext('2d');
  g.fillStyle = '#fbf8f1'; g.fillRect(0, 0, out.width, out.height); g.fillStyle = '#2a2620'; g.font = `700 28px ${css('--f-hand')}`; g.fillText(title, gap, 44);
  items.forEach(([label, cv], i) => { const x = gap + (i % cols) * (S + gap), y = head + Math.floor(i / cols) * (S + 30 + gap); g.drawImage(cv, x, y); g.strokeStyle = '#2a2620'; g.lineWidth = 1.5; g.strokeRect(x, y, S, S); g.font = `600 15px ${css('--f-body')}`; g.fillText(label, x, y + S + 20); });
  return out;
}
async function saveSheet(kind) {
  try {
    toast(tr('Haciendo la hoja…')); await new Promise(r => setTimeout(r, 30));  // (a moment for the message to show: the sheet is drawn in one go)
    const cv = kind === 'expr' ? await expressionSheet() : await lineupSheet();
    const name = `${kind === 'expr' ? tr('expresiones') : tr('alturas')}-${stamp()}.png`, b = await new Promise(r => cv.toBlob(r, 'image/png')); await saveFile(name, new Uint8Array(await b.arrayBuffer()), 'image/png');
    toast(tr('Guardado en «{f}»', {f: name}));
  } catch (e) { console.warn('sheet', e); toast(tr('No se ha podido hacer la hoja: {e}', {e: e && e.message || e})); }
}

/* ---------- the tab ---------- */
function renderBible() {
  const box = $('#bbCast'); if (!box) return; box.innerHTML = '';
  if (!PROJECT.cast.length) { const p = document.createElement('p'); p.className = 'empty'; p.textContent = tr('Aún no hay nadie. Diseña a alguien en Cuerpo y Ropa (o tráelo de Mis personajes) y pulsa «Añadir el personaje activo».'); box.appendChild(p); }
  for (const c of PROJECT.cast) {
    const card = document.createElement('div'); card.className = 'bbcard';
    card.innerHTML = `<img alt=""><div class="bbn"><b></b><span></span></div><div class="row"><button class="btn small" data-a="put"></button><button class="btn small" data-a="upd"></button><button class="btn icon small danger" data-a="del" aria-label=""><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>`;
    if (c.thumb) card.querySelector('img').src = c.thumb; else card.querySelector('img').remove();
    card.querySelector('b').textContent = c.name; card.querySelector('.bbn span').textContent = tr((BODY_PRESETS[c.preset] || {}).label || '');
    const [put, upd, del] = card.querySelectorAll('button'); put.textContent = tr('A la escena'); upd.textContent = tr('Actualizar con el activo'); del.setAttribute('aria-label', tr('Quitar del reparto')); del.title = del.getAttribute('aria-label');
    put.onclick = () => placeCharacter(c);
    upd.onclick = () => { if (!confirm(tr('¿Cambiar a «{x}» por el personaje activo en todo el proyecto (planos y viñetas)?', {x: c.name}))) return; mq.body.castId = c.id; bibleCastFromActive(c.name); };
    // taken out with the way back right there (the same entry comes back, so the shots that still carry its id are linked again)
    del.onclick = () => { const i = PROJECT.cast.indexOf(c); PROJECT.cast.splice(i, 1); renderBible(); autosaveSoon();
      toast(tr('«{x}» ya no está en el reparto (los planos lo conservan).', {x: c.name}), {undo: () => { PROJECT.cast.splice(Math.min(i, PROJECT.cast.length), 0, c); renderBible(); autosaveSoon(); }}); };
    box.appendChild(card);
  }
  const todo = $('#bbTodo'); todo.innerHTML = ''; const names = scriptNamesToDesign(); $('#bbTodoBox').hidden = !names.length;
  for (const n of names) { const b = document.createElement('button'); b.className = 'chip'; b.textContent = n; b.title = tr('El personaje activo será «{x}»', {x: n}); b.onclick = () => bibleCastFromActive(n); todo.appendChild(b); }
  const lb = $('#bbPlaces'); lb.innerHTML = '';
  if (!PROJECT.locations.length) { const p = document.createElement('p'); p.className = 'empty'; p.textContent = tr('Aún no hay lugares. Monta el escenario en Escena y pulsa «Guardar este lugar».'); lb.appendChild(p); }
  for (const l of PROJECT.locations) {
    const card = document.createElement('div'); card.className = 'bbcard place';
    card.innerHTML = `<img alt=""><div class="bbn"><b></b><span></span></div><div class="row"><button class="btn small" data-a="go"></button><button class="btn small" data-a="view"></button><button class="btn icon small danger" data-a="del" aria-label=""><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>`;
    if (l.thumb) card.querySelector('img').src = l.thumb; card.querySelector('b').textContent = l.name; card.querySelector('.bbn span').textContent = trn(l.views.length, '1 vista', '{n} vistas');
    const [go, view, del] = card.querySelectorAll('button'); go.textContent = tr('Ir allí'); view.textContent = tr('Guardar esta vista'); del.setAttribute('aria-label', tr('Borrar el lugar')); del.title = del.getAttribute('aria-label');
    go.onclick = () => applyLocation(l, 0);
    view.onclick = () => { l.views.push({name: tr('Vista {n}', {n: l.views.length + 1}), cam: camState()}); renderBible(); autosaveSoon(); toast(tr('Vista guardada en «{x}».', {x: l.name})); };
    del.onclick = () => { const i = PROJECT.locations.indexOf(l); PROJECT.locations.splice(i, 1); renderBible(); autosaveSoon();
      toast(tr('Lugar «{x}» borrado.', {x: l.name}), {undo: () => { PROJECT.locations.splice(Math.min(i, PROJECT.locations.length), 0, l); renderBible(); autosaveSoon(); }}); };
    lb.appendChild(card);
  }
}
function buildBibleUI() {
  if (!$('section[data-tab=biblia]')) return;
  // the same name as the cast member the active character came from replaces them everywhere, so it asks first; another name adds someone new
  $('#bbAdd').onclick = () => { const name = prompt(tr('Nombre del personaje'), mq.body.name || charLabel(mq)); if (!name) return;
    bibleAddActive(name.trim()); };
  $('#bbPlaceAdd').onclick = () => { const name = prompt(tr('Nombre del lugar'), tr(SCENES[state.env] ? SCENES[state.env].label : state.env)); if (name) saveLocation(name.trim()); };
  $('#bbTurn').onclick = () => { openExport(); const c = $('#exKind .chip[data-v="turn"]'); if (c) c.click(); };
  $('#bbExpr').onclick = () => saveSheet('expr'); $('#bbLine').onclick = () => saveSheet('line');
  $('#bbSpin').onchange = e => { controls.autoRotate = e.target.checked; controls.autoRotateSpeed = 2.5; };
  renderBible();
}
