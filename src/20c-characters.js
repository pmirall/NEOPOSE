/* ======================= saved characters =======================
   A character is everything that makes them who they are, apart from the pose: body and proportions, build,
   advanced settings, species, head, hair, expression, limbs and prostheses, imported avatar, and what they wear.
   Saved in this browser with a colour portrait; one tap puts them in the scene (or onto the active character);
   a file takes them to another device or to someone else. */
const charDB = {
  open() { return new Promise((res, rej) => { try { const r = indexedDB.open('cdp-chars', 1); r.onupgradeneeded = () => r.result.createObjectStore('c', {keyPath: 'id'}); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } }); },
  async all() { try { const db = await this.open(); return await new Promise(res => { const q = db.transaction('c').objectStore('c').getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => res([]); }); } catch (_) { return []; } },
  async put(v) { try { const db = await this.open(); await new Promise(res => { const t = db.transaction('c', 'readwrite'); t.objectStore('c').put(v); t.oncomplete = res; t.onerror = res; }); } catch (_) {} },
  async del(id) { try { const db = await this.open(); db.transaction('c', 'readwrite').objectStore('c').delete(id); } catch (_) {} }
};
let SAVED_CHARS = [];
const charName = m => m.body.name || charLabel(m);
function characterOf(m, name) {
  const body = JSON.parse(JSON.stringify(m.body)); body.name = name;
  return {v: 1, id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name, body, preset: m.bodyPreset || null, outfit: JSON.parse(JSON.stringify(m.outfit || [])), at: Date.now()};
}
// a colour portrait of the character alone, from the front and a little to the side
function characterThumb(m) {
  try {
    const camP = camera.position.clone(), camT = controls.target.clone(), vis = chars.map(c => c.group.visible), old = {bg: ex.bg, size: ex.size};
    chars.forEach(c => { c.group.visible = c === m; if (c.avatar) c.avatar.root.visible = c === m; });
    const b = m.box(6), c = b.getCenter(new V3()), h = b.getSize(new V3()).y, yaw = m.yaw();
    camera.position.set(c.x + Math.sin(yaw + .35) * h * 1.9, c.y + h * .05, c.z + Math.cos(yaw + .35) * h * 1.9); controls.target.copy(c); controls.update();
    ex.bg = 'alpha'; ex.size = 1; const cv = renderExportCanvas();
    ex.bg = old.bg; ex.size = old.size; chars.forEach((x, i) => { x.group.visible = vis[i]; if (x.avatar) x.avatar.root.visible = vis[i]; });
    camera.position.copy(camP); controls.target.copy(camT); controls.update();
    const out = document.createElement('canvas'); out.width = 120; out.height = 160; const w = cv.height * .75;
    out.getContext('2d').drawImage(cv, (cv.width - w) / 2, 0, w, cv.height, 0, 0, 120, 160);
    return out.toDataURL('image/png');
  } catch (e) { console.warn('portrait', e); return null; }
}
async function saveCharacter(m = mq) {
  const name = prompt(tr('Nombre del personaje'), m.body.name || charLabel(m)); if (!name) return;
  m.body.name = name.trim(); renderCast();
  const c = characterOf(m, m.body.name); c.thumb = characterThumb(m);
  // Mis personajes is this device's; the way into the project's cast (what its shots and panels follow) is offered right there
  await charDB.put(c); await loadCharacters(); toast(tr('«{x}» guardado en Mis personajes.', {x: c.name}), {act: ['Añadir al reparto del proyecto', () => { if (mq === m) bibleAddActive(m.body.name); }]});
}
async function loadCharacters() { SAVED_CHARS = (await charDB.all()).sort((a, b) => (b.at || 0) - (a.at || 0)); renderCharacters(); return SAVED_CHARS; }
// into the scene: a new character with this body and these clothes, standing where there is room
function placeCharacter(c) {
  const body = {...BODY_BASE, ...JSON.parse(JSON.stringify(c.body))}, m = addChar(c.preset || 'hombre', body);
  if (!m) return toast(tr('Ya hay {n} personajes en la escena.', {n: MAX_CHARS}));
  m.bodyPreset = c.preset || null; if (c.outfit && c.outfit.length) setOutfit(m, c.outfit);
  setActive(chars.length - 1); pushHistory(); buildPoseGrid(); toast(tr('«{x}» entra en la escena.', {x: c.name}));
}
function applyCharacter(c, m = mq) {
  m.body = {...BODY_BASE, ...JSON.parse(JSON.stringify(c.body))}; m.bodyPreset = c.preset || null;
  m.build(m.body); m.ground(); setOutfit(m, c.outfit || []);
  renderCast(); syncBodyUI(); pushHistory(); toast(tr('El personaje activo es ahora «{x}».', {x: c.name}));
}
function exportCharacter(c) {
  const {thumb, ...data} = c; const bytes = new TextEncoder().encode(JSON.stringify({neopose: 'character', ...data, thumb}, null, 1));
  saveFile(`${(c.name || 'personaje').replace(/[^\w\-áéíóúñü ]+/gi, '').trim() || 'personaje'}.neopose-personaje.json`, bytes, 'application/json');
}
async function importCharacters(files) {
  let n = 0;
  for (const f of files) {
    try {
      const o = JSON.parse(await f.text()), list = Array.isArray(o) ? o : [o];
      for (const x of list) { if (!x || !x.body) continue; const c = {...characterOf({body: x.body, bodyPreset: x.preset, outfit: x.outfit || []}, x.name || f.name.replace(/\..*$/, '')), thumb: x.thumb || null}; await charDB.put(c); n++; }
    } catch (e) { console.warn('import character', e); }
  }
  await loadCharacters();
  toast(n ? tr('{n} personaje(s) añadido(s) a Mis personajes.', {n}) : tr('Ese archivo no tiene personajes de NEOPOSE.'));
}

/* ---------- the panel and the cast's "+" ---------- */
const CH_ICONS = {use: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h12M12 6l6 6-6 6"/></svg>',
  file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  dup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 8h12v12H8zM4 16V4h12"/></svg>',
  ren: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/></svg>',
  save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12v18l-6-4-6 4Z"/></svg>'};
// a row of small buttons under a card: [icon, label, fn]; the label names the character for screen readers
function charActs(card, name, list) {
  const acts = document.createElement('div'); acts.className = 'characts';
  for (const [k, label, fn] of list) {
    const x = document.createElement('button'); x.type = 'button'; x.className = 'charact'; x.innerHTML = CH_ICONS[k]; x.title = tr(label); x.setAttribute('aria-label', `${tr(label)}: ${name}`);
    x.onclick = e => { e.stopPropagation(); fn(); }; acts.appendChild(x);
  }
  card.appendChild(acts); return acts;
}
// Mis personajes: a copy, a new name, gone with the way back right there
async function dupSaved(c) { const d = {...characterOf({body: c.body, bodyPreset: c.preset, outfit: c.outfit || []}, tr('{x} (copia)', {x: c.name})), thumb: c.thumb || null}; await charDB.put(d); await loadCharacters(); toast(tr('«{x}» guardado en Mis personajes.', {x: d.name})); }
async function renameSaved(c) { const n = (prompt(tr('Nombre del personaje'), c.name) || '').trim(); if (!n || n === c.name) return; c.name = n; c.body = {...c.body, name: n}; c.at = Date.now(); await charDB.put(c); await loadCharacters(); }
async function deleteSaved(c) {
  await charDB.del(c.id); await loadCharacters();
  toast(tr('«{x}» borrado de Mis personajes.', {x: c.name}), {undo: async () => { await charDB.put(c); loadCharacters(); }});
}
function characterCard(c, onClick) {
  const b = document.createElement('div'); b.className = 'pose charcard'; b.dataset.id = c.id; b.tabIndex = 0; b.setAttribute('role', 'button'); b.title = tr('Poner a «{x}» en la escena', {x: c.name});
  const img = document.createElement('img'); img.className = 'th img'; img.alt = ''; if (c.thumb) img.src = c.thumb;
  const nm = document.createElement('span'); nm.textContent = c.name;
  b.append(img, nm); b.onclick = onClick; b.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } };
  return b;
}
function renderCharacters() {
  const grid = $('#charGrid'); if (!grid) return; grid.innerHTML = '';
  if (!SAVED_CHARS.length) grid.innerHTML = `<p class="empty">${tr('Aún no hay personajes guardados. Ajusta uno a tu gusto y pulsa «Guardar este personaje».')}</p>`;
  for (const c of SAVED_CHARS) {
    const card = characterCard(c, () => placeCharacter(c));
    charActs(card, c.name, [['use', 'Aplicar al personaje activo', () => applyCharacter(c)], ['dup', 'Duplicar', () => dupSaved(c)], ['ren', 'Cambiar el nombre', () => renameSaved(c)],
      ['file', 'Exportar a un archivo', () => exportCharacter(c)], ['del', 'Borrar', () => deleteSaved(c)]]);
    grid.appendChild(card);
  }
}
// the cast's "+ Character": a new one, one of the project's cast or one of yours (each list under its name, and only when it has someone)
function castAddMenu(anchor) {
  if (!SAVED_CHARS.length && !PROJECT.cast.length) { const m = addChar(chars.length % 2 ? 'mujer' : 'hombre'); if (m) { setActive(chars.length - 1); pushHistory(); buildPoseGrid(); } return; }
  let pop = $('#castPop'); if (pop) { pop.remove(); return; }
  pop = document.createElement('div'); pop.id = 'castPop'; pop.className = 'castpop';
  const fresh = document.createElement('button'); fresh.type = 'button'; fresh.className = 'btn small'; fresh.textContent = tr('Personaje nuevo');
  fresh.onclick = () => { pop.remove(); const m = addChar(chars.length % 2 ? 'mujer' : 'hombre'); if (m) { setActive(chars.length - 1); pushHistory(); buildPoseGrid(); } };
  pop.append(fresh);
  for (const [title, list, cast] of [['Reparto del proyecto', PROJECT.cast, true], ['Mis personajes', SAVED_CHARS, false]]) {
    if (!list.length) continue;
    const h = document.createElement('p'); h.className = 'lbl'; h.textContent = tr(title);
    const grid = document.createElement('div'); grid.className = 'pose-grid chargrid';
    for (const c of list.slice(0, 12)) { const card = characterCard(c, () => { pop.remove(); placeCharacter(c); }); if (cast) card.dataset.cast = c.id; grid.appendChild(card); }
    pop.append(h, grid);
  }
  document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect(); pop.style.left = Math.max(8, Math.min(r.left, innerWidth - 300)) + 'px'; pop.style.top = (r.bottom + 6) + 'px';
  setTimeout(() => addEventListener('pointerdown', function off(e) { if (!pop.contains(e.target) && e.target !== anchor) { pop.remove(); removeEventListener('pointerdown', off); } }), 0);
}
function buildCharactersUI() {
  $('#charSave').onclick = () => saveCharacter(mq);
  $('#charImport').onclick = () => $('#charFile').click();
  $('#charFile').onchange = e => {
    const all = [...e.target.files], models = all.filter(f => /\.(vrm|glb|gltf|fbx)$/i.test(f.name)), json = all.filter(f => !models.includes(f)); e.target.value = '';
    if (json.length) importCharacters(json);
    for (const f of models.slice(0, 1)) { if (chars.length < MAX_CHARS) { addChar(chars.length % 2 ? 'mujer' : 'hombre'); setActive(chars.length - 1); } importAvatarFile(f); }
  };
  vp.addEventListener('drop', e => { const f = [...e.dataTransfer.files].filter(f => /\.neopose-personaje\.json$|personaje.*\.json$/i.test(f.name)); if (f.length) { e.preventDefault(); importCharacters(f); } });
  loadCharacters();
}
