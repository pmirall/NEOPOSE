/* ======================= the project: what the three spaces share =======================
   One piece of work is a cast, the places it lives in, a film and comic pages made of them. The cast and the
   locations are kept once, here (Personajes y lugares writes them); the film's shots and the comic's panels stand on
   them through their ids (a body's castId, a set's locId), so a character redesigned once is redesigned in every shot
   and every panel that has not been made its own (scene.chars[i].own). A comic panel is a film shot seen at one frame
   (its own, or linked to one of the film's): what improves the film improves the comic, and back.
     PROJECT = {v, cast: [{id, name, aka, body, preset, outfit, thumb, notes}], locations: [{id, name, env, amb, props,
                lights, light, views: [{name, cam}], thumb}], film: {aspect}, comic: Comic|null} */
const PROJECT = {v: 1, cast: [], locations: [], film: {aspect: null}, comic: null};
const newId = p => p + '_' + Math.random().toString(36).slice(2, 7);
function projectState() {
  if (!PROJECT.cast.length && !PROJECT.locations.length && !(PROJECT.comic && PROJECT.comic.pages.length) && !PROJECT.film.aspect) return undefined;  // nothing to keep
  return JSON.parse(JSON.stringify(PROJECT));
}
function applyProjectState(p) {
  const o = p && typeof p === 'object' ? p : {};
  PROJECT.cast = Array.isArray(o.cast) ? o.cast : []; PROJECT.locations = Array.isArray(o.locations) ? o.locations : [];
  PROJECT.film = {aspect: null, ...(o.film || {})}; PROJECT.comic = o.comic || null;
  // (the panels' own shots keep their ids too: new ones are numbered after them)
  for (const pg of (PROJECT.comic && PROJECT.comic.pages) || []) for (const p of pg.panels) if (p.shot && p.shot.id) shotSeq = Math.max(shotSeq, p.shot.id);
  if (typeof histReset === 'function') histReset(); if (typeof comicChanged === 'function') comicChanged(); if (typeof renderBible === 'function') renderBible();
}
// every shot of the project: the film's and the comic panels' own ones (linked panels are the film's)
function eachProjectShot(fn) {
  for (const s of ANIM.shots) fn(s, {film: true});
  for (const pg of (PROJECT.comic && PROJECT.comic.pages) || []) for (const p of pg.panels) if (p.shot) fn(p.shot, {panel: p, page: pg});
}
const castById = id => PROJECT.cast.find(c => c.id === id);
// a character of the canvas into the cast (or brought up to date there): its id goes into its body
function castFromChar(m, name) {
  let c = m.body.castId && castById(m.body.castId);
  const body = JSON.parse(JSON.stringify(m.body)); delete body.expr;
  if (!c) { c = {id: newId('c'), name: name || m.body.name || speaker(chars.indexOf(m))}; PROJECT.cast.push(c); m.body.castId = c.id; body.castId = c.id; }
  Object.assign(c, {body, preset: m.bodyPreset, outfit: (m.outfit || []).map(x => ({...x}))});
  return c;
}
// a cast member changed: every shot and panel that has them (and has not made them its own) changes too
function propagateCast(id) {
  const c = castById(id); if (!c) return {shots: 0, panels: 0};
  let shots = 0, panels = 0;
  eachProjectShot((s, w) => {
    let hit = false;
    for (const sc of s.scene.chars) if (sc.body && sc.body.castId === id && !sc.own) { sc.body = {...JSON.parse(JSON.stringify(c.body)), name: sc.body.name, castId: id}; sc.preset = c.preset; sc.outfit = (c.outfit || []).map(x => ({...x})); hit = true; }
    if (hit) { touchShot(s); if (w.panel) panels++; else shots++; }
  });
  return {shots, panels};
}
