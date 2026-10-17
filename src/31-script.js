/* ======================= from a script to a film: the director =======================
   Rules, not AI (after He, Cohen & Salesin's Virtual Cinematographer, Christianson's camera idioms, Arijon's grammar of
   film and Galvane & Ronfard's editing work):
   - CAST: every name becomes a character: one of yours from My characters if the name matches, otherwise a body
     guessed from the name and the pronouns around it (a child, an old man, a woman…), with a voice of their own;
   - SETS: "INT. KITCHEN - NIGHT" → the kitchen set at night; a place NEOPOSE has not got is looked for online
     (a panorama with its light), and otherwise the photo studio;
   - STAGING: people in a scene stand as people talk (two face each other, three in a triangle, four in an arc), cheated
     a little towards the camera; whoever enters walks in from the side, whoever leaves walks out; listeners turn their
     heads to whoever speaks;
   - ACTION: each sentence of the action is read for who does what to whom; each verb plays a gallery animation, a held
     pose, a pose of two (a hug, a handshake) or a change of face; gaps are filled with breathing, talking gestures,
     sitting still;
   - TIMING: every line lasts what its voice takes to say it, with the pauses between speakers people leave;
   - CAMERA: unless the script says otherwise (CLOSE ON, PLANO GENERAL, POV…): an establishing shot when the place
     changes, then the master and over-the-shoulder shots and singles, closer as feelings rise; cuts on a change of
     speaker, never under 1.5 s, a reaction after 6 s; the camera never crosses the line between two people; a new
     shot of the same person changes size or angle (no jump cuts); people moving are followed with room ahead.
   The result is an ordinary film of shots, keys, camera moves and dialogue, to adjust by hand. */
const SC = {busy: false, last: null};
const SC_SPEED = {walk: 1.1, run: 2.6, sprint: 4.6, sneak: .7, carry: 1, swim: .9};
const SC_CLIP = {walk: 'ual1-Walk_Loop', run: 'ual1-Jog_Fwd_Loop', sprint: 'ual1-Sprint_Loop', sneak: 'ual1-Crouch_Fwd_Loop', idle: 'np-respirar', idle2: 'ual1-Idle_Loop', talk: 'ual1-Idle_Talking_Loop',
  sit: 'ual1-Sitting_Enter', sitIdle: 'ual1-Sitting_Idle_Loop', sitTalk: 'ual1-Sitting_Talking_Loop', stand: 'ual1-Sitting_Exit', getup: 'ual2-LayToIdle'};
const clipById = id => (CLIPS.lib || []).find(c => c.id === id) || CLIPS.mine.find(c => c.id === id);
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));

/* ---------- places and times ---------- */
const SC_PLACES = [
  ['cocina', 'cocina|kitchen|comedor|dining|cuina|cuisine|cozinha|kuche|cucina|menjador|salle a manger'], ['dormitorio', 'dormitorio|habitacion|cuarto|bedroom|alcoba|dormitori|chambre|quarto|schlafzimmer|camera da letto'],
  ['habitacion', 'salon|living|sala de estar|casa|house|home|piso|apartamento|apartment|flat|hogar|sala|lounge|menjador|maison|casa|wohnzimmer|soggiorno'], ['oficina', 'oficina|office|despacho|trabajo|empresa|bureau|escritorio|ufficio|buro|oficina'],
  ['aula', 'aula|clase|classroom|colegio|escuela|instituto|school|universidad|universitat|ecole|salle de classe|escola|schule|scuola'], ['biblioteca', 'biblioteca|library|libreria|bibliotheque|bibliothek'],
  ['cafeteria', 'cafeteria|cafe|coffee|restaurante|restaurant|cafetaria|caffe|ristorante'], ['taberna', 'taberna|bar|pub|tavern|posada|inn|cantina|bodega|saloon|taverne|kneipe|osteria'],
  ['taller', 'taller|workshop|garaje|garage|fabrica|factory|almacen|warehouse|atelier|oficina mecanica|werkstatt|officina'], ['castillo', 'castillo|castle|palacio|palace|trono|throne|fortaleza|castell|chateau|castelo|schloss|castello'],
  ['teatro', 'teatro|theatre|theater|escenario|stage|auditorio|teatre|theatre|theater'], ['ring', 'ring|boxeo|boxing|gimnasio|gym|cuadrilatero|gimnas|salle de sport|ginasio|turnhalle|palestra'],
  ['dojo', 'dojo|tatami|artes marciales|martial|templo de lucha'], ['callejon', 'callejon|alley|alleyway|carrer estret|ruelle|beco|gasse|vicolo'],
  ['calle', 'calle|street|avenida|avenue|ciudad|city|town|pueblo|barrio|acera|carrer|rue|rua|strasse|via|centro'], ['parque', 'parque|park|jardin|garden|plaza|square|parc|jardi|praca|garten|giardino|piazza'],
  ['bosque', 'bosque|forest|woods|selva|jungle|arboleda|bosc|foret|floresta|wald|bosco'], ['campamento', 'campamento|camp|acampada|hoguera|campfire|tienda de campana|campament|camping|lagerfeuer|accampamento'],
  ['playa', 'playa|beach|muelle|pier|puerto|harbour|harbor|costa|coast|mar|sea|platja|plage|praia|strand|spiaggia|porto'], ['desierto', 'desierto|desert|dunas|desert|deserto|wuste'],
  ['ruinas', 'ruinas|ruins|templo|temple|ruines|ruinas|ruinen|rovine'], ['escalinata', 'escalinata|escaleras|stairs|staircase|escalera|escales|escalier|escadaria|treppe|scalinata'],
  ['azotea', 'azotea|rooftop|roof|tejado|terraza|terrat|toit|telhado|dach|tetto'], ['estudio', 'estudio|studio|plato|set de rodaje|estudi'], ['pano_noche', 'ciudad de noche|city at night|noche en la ciudad'],
  ['pano_prado', 'prado|meadow|campo|field|pradera|prat|prairie|wiese|prato'], ['pano_loft', 'loft|nave|ventanales'], ['pano_chimenea', 'chimenea|fireplace|cabana|cabin']
];
const SC_PLACE_PATS = SC_PLACES.map(([id, w]) => [id, scPats(w)]);
const SC_TIMES = [['noche', 'noche|night|nit|nuit|noite|nacht|notte|madrugada|midnight|medianoche|dawn of night'], ['atardecer', 'atardecer|anochecer|sunset|dusk|evening|crepusculo|amanecer|dawn|sunrise|alba|aube|soir|vespre|capvespre|abenddammerung|tramonto|sera'],
  ['dia', 'dia|day|manana|morning|mediodia|noon|afternoon|tarde|jour|matin|dia|tag|morgen|giorno|mattina|continuo|continuous']];
function placeOf(head) {
  const w = scWords(head.place || head.text || '');
  for (const [id, pats] of SC_PLACE_PATS) if (scFind(w, pats) && SCENES[id]) return id;
  return null;
}
function timeOf(head) { const w = scWords(head.time || head.text || ''); for (const [id, v] of SC_TIMES) if (scFind(w, scPats(v))) return id; return null; }
// a place NEOPOSE has not got: a Poly Haven panorama that matches the words (with its light), if online
async function placeOnline(head) {
  try {
    const words = refQuery(head.place).split(/\s+/).filter(w => w.length > 2); if (!words.length) return null;
    const all = await polyHaven('hdris');
    const best = Object.entries(all).map(([id, a]) => [words.filter(w => uxNorm(id + ' ' + a.name + ' ' + (a.tags || []).join(' ') + ' ' + (a.categories || []).join(' ')).includes(w)).length, id, a]).filter(x => x[0]).sort((a, b) => b[0] - a[0])[0];
    if (!best) return null;
    const [, id, a] = best, sid = 'ref_ph_' + id;
    const e = {id: sid, label: a.name, url: `https://cdn.polyhaven.com/asset_img/primary/${id}.png?width=2048&format=jpg`, pano: true, credit: `“${a.name}” · Poly Haven · CC0`};
    REF_SCENES[sid] = e; store.set('cdp.refScenes', REF_SCENES); registerRefScene(e); return sid;
  } catch (_) { return null; }
}

/* ---------- cast ---------- */
const SC_FEM = 'ella|she|her|herself|elle|ela|sie|lei|la senora|la chica|la mujer|madre|mother|mama|mom|hija|daughter|hermana|sister|abuela|grandma|grandmother|reina|queen|princesa|princess|dona|senora|mrs|miss|ms|nina|girl|chica|mujer|woman|lady'.split('|');
const SC_MASC = 'el|he|him|his|himself|il|lui|ele|er|ihm|el senor|el chico|el hombre|padre|father|papa|dad|hijo|son|hermano|brother|abuelo|grandpa|grandfather|rey|king|principe|prince|don|senor|mr|sir|nino|boy|chico|hombre|man|guy'.split('|');
const SC_GIRLS = new Set('sarah emma olivia emily mary lucy anne ann kate jane alice grace sophie chloe ella amy rachel jessica jennifer elizabeth beth claire helen ruth rose lily isabel isabelle carmen raquel ines pilar mercedes dolores consuelo nieves rocio beatriz isabel abigail charlotte megan hannah zoe judith ester esther miriam noemi belen marta sara laura lucia paula elena nuria clara julia alba eva irene noelia silvia susan karen nancy betty sharon carol margaret dorothy marie louise nicole camille chloe manon ingrid'.split(' '));
const SC_BOYS = new Set('luca andrea elias jonas tobias nicola mattia borja garcia josema jose joshua matthias isaiah jeremiah zacharias ezra'.split(' '));
function genderOf(name, text) {
  const k = scNorm(name).split(/\s+/)[0];
  if (SC_GIRLS.has(k)) return 'mujer'; if (SC_BOYS.has(k)) return 'hombre';
  if (/(abuela|nina|chica|mujer|madre|senora|reina|princesa|hermana|girl|woman|mother|queen|lady|grandma|sister)/.test(k)) return 'mujer';
  if (/(abuelo|nino|chico|hombre|padre|senor|rey|principe|hermano|boy|man|father|king|grandpa|brother)/.test(k)) return 'hombre';
  // the endings that tell in the Romance languages (Ana, Lucía, Martina / Luis, Leo, Pablo, Marco)
  if (/[^aeiou]a$|ia$|ie$|ette$|elle$|ine$/.test(k)) return 'mujer';
  if (/o$|[^aeiou]$/.test(k) && k.length > 2) return 'hombre';
  return null;
}
function ageOf(name) {
  const k = scNorm(name);
  if (/\b(nino|nina|nene|nena|chaval|crio|boy|girl|kid|child|baby|bebe|enfant|garcon|fille|menino|menina|kind|junge|madchen|bambino|bambina)\b/.test(k)) return 10;
  if (/\b(abuelo|abuela|anciano|anciana|viejo|vieja|old|grandpa|grandma|grandfather|grandmother|elder|avi|avia|grand-pere|grand-mere|avo|opa|oma|nonno|nonna)\b/.test(k)) return 75;
  return null;
}
function castOf(P, text) {
  const out = [], seen = new Set(); let alt = 0;
  for (const [key, n] of P.names) {
    if (seen.has(key)) continue; seen.add(key);
    const mine = (SAVED_CHARS || []).find(c => scNorm(c.name) === key || scNorm(c.name).split(/\s+/)[0] === key.split(/\s+/)[0]);
    if (mine) { out.push({key, name: n.name, body: {...BODY_BASE, ...JSON.parse(JSON.stringify(mine.body)), name: n.name}, preset: mine.preset || null, outfit: mine.outfit || [], mine: true}); continue; }
    const g = genderOf(n.name, text) || (alt++ % 2 ? 'mujer' : 'hombre'), age = ageOf(n.name), sp = speciesOf(n.name, text);
    const body = {...bodyOf(g), name: n.name}; if (age) body.age = age; if (sp) body.species = sp;
    out.push({key, name: n.name, body, preset: g, outfit: []});
  }
  return out;
}

// a furry cast: the animal in the name (ZORRO, Mr. Wolf) or said right after it (REX, un lobo gris; Mia (gata))
function speciesOf(name, text) {
  const words = t => scNorm(t).split(/[^a-z\u00df]+/).filter(Boolean), find = ws => { for (const w of ws) for (const [sp, list] of SC_SPECIES) if (list.includes(w)) return sp; return null; };
  const own = find(words(name)); if (own) return own;
  const nm = scNorm(name).split(/\s+/)[0], T = scNorm(text); let i = -1;
  // only when the animal is said about the name: an apposition or a bracket (REX, un lobo… / Mia (gata)) or "is a"
  const ARTS = new Set('un una unos el la es era a an the is was un une le est etait um uma o e era ein eine der die das ist war il lo e era'.split(' '));
  while ((i = T.indexOf(nm, i + 1)) >= 0) {
    const after = T.slice(i + nm.length, i + nm.length + 48).split(/[.\n!?;:]/)[0], ws = words(after);
    if (!/^\s*[,(]/.test(after) && !ARTS.has(ws[0])) continue;
    const sp = find(ws.slice(0, 4)); if (sp) return sp;
  }
  return null;
}

/* ---------- reading the action: who does what to whom ---------- */
const SC_PRON = 'el|ella|ellos|ellas|he|she|they|il|elle|ils|elles|ele|ela|eles|elas|er|sie|lui|lei|loro|ell'.split('|');
const SC_OBJ = 'lo|la|le|him|her|them|los|las|les|le|lui|o|a|ihn|ihm|ihr|sie|lo|gli|l'.split('|');
const SC_PRON_F = new Set('ella|ellas|she|her|elle|elles|ela|elas|sie|lei|la|las'.split('|')), SC_PRON_M = new Set('el|ellos|he|him|il|ils|ele|eles|er|ihn|ihm|lui|lo|los'.split('|'));
// a pronoun → the person it most likely means: of its gender, the last one spoken of who is not the subject itself
function pronounTo(p, cast, ctx, not, object) {
  const g = SC_PRON_F.has(p) ? 'mujer' : SC_PRON_M.has(p) ? 'hombre' : null, cand = ctx.present.filter(i => !(not || []).includes(i) && (!g || cast[i].preset === g || (cast[i].body && (g === 'mujer' ? cast[i].body.gender < .5 : cast[i].body.gender >= .5))));
  if (!cand.length) return object ? ctx.present.find(i => !(not || []).includes(i)) : ctx.last ?? ctx.present[0];
  for (const c of [ctx.lastOther, ctx.last]) if (c != null && cand.includes(c)) return c;
  return cand[0];
}
const SC_ALL = 'todos|todas|ambos|ambas|los dos|las dos|everyone|everybody|both|all|tous|toutes|tots|totes|todos|alle|beide|tutti|entrambi'.split('|');
const SC_TOGETHER = 'mientras|a la vez|al mismo tiempo|while|meanwhile|at the same time|pendant que|alors que|enquanto|wahrend|mentre'.split('|');
// a sentence into clauses: "se levanta y sale", "he stands, then leaves"
const scClauses = s => s.split(/(?<=[.;!?])\s+|,\s*(?:y |and |then |luego |despues |entonces |et |e |und |poi )|\s+(?:y luego|y despues|y entonces|and then|then|luego|despues|et puis|e depois|und dann|e poi)\s+|\s+y\s+(?=(?:se\s+)?[a-z]+(?:a|e|an|en)\b)|\s+and\s+(?=[a-z]+s\b)/i).map(x => x && x.trim()).filter(Boolean);
function readAction(text, cast, lang, ctx) {
  const out = [], names = cast.map((c, i) => [scWords(c.name)[0], i]);
  for (const cl of scClauses(text)) {
    const w = scWords(cl);
    // who: names in the clause (in order), "everyone", or a pronoun for the last one spoken of
    const who = []; for (let i = 0; i < w.length; i++) { const n = names.find(x => x[0] === w[i]); if (n && !who.some(o => o.c === n[1])) who.push({c: n[1], at: i}); }
    const all = w.some((x, i) => SC_ALL.includes(x) || SC_ALL.includes(x + ' ' + w[i + 1]));
    // what: every intention the clause holds, in the order written
    const found = [];
    for (const [id, pats] of verbPats(lang)) { let from = 0, f; while ((f = scFind(w, pats, from))) { found.push({id, i: f.i, j: f.j}); from = f.j + 1; } }
    found.sort((a, b) => a.i - b.i);
    const kept = found.filter((f, k) => !found.some((g, l) => l !== k && g.i <= f.i && g.j >= f.j && (g.j - g.i > f.j - f.i)));  // the longer phrase wins ("se sienta" over "sienta", "walks to" over "walks")
    const neg = i => w.slice(Math.max(0, i - 2), i).some(x => ['no', 'not', "doesn't", 'never', 'nunca', 'ne', 'pas', 'nao', 'nicht', 'non'].includes(x));
    const verbs = kept.filter(v => !neg(v.i));
    if (!verbs.length && kept.length) continue;  // "Ana no se sienta": nothing happens, and nothing to warn about
    // running with a way in or out of the scene: a fast entrance or exit ("sale corriendo", "runs out")
    for (const m of verbs.filter(v => ['enter', 'exit', 'approach'].includes(v.id))) { const r = verbs.find(v => v.id === 'run' && Math.abs(v.i - m.i) <= 3); if (r) { m.fast = true; verbs.splice(verbs.indexOf(r), 1); } }
    if (!verbs.length) { const emo = emotionOf(cl); if (emo && (who.length || ctx.last != null)) out.push({who: who.length ? who.map(o => o.c) : [ctx.last], id: 'emo', e: emo, text: cl}); else if (!shotDirection(cl) && w.length > 2) out.push({unknown: cl}); continue; }
    let prevSubj = null, prevObj = null;
    verbs.forEach((v, vi) => {
      const from = vi ? verbs[vi - 1].j + 1 : 0, to = vi < verbs.length - 1 ? verbs[vi + 1].i : w.length;
      // the subject: names just before the verb (since the last verb), else a pronoun told by its gender, else the one before
      let subj = who.filter(o => o.at >= from && o.at < v.i && !(prevObj != null && o.c === prevObj && o.at <= from + 1)).map(o => o.c);  // "mira a Ana y sonríe": Ana is looked at, Luis smiles
      if (!subj.length) { const pr = w.slice(from, v.i).find(x => SC_PRON.includes(x)); if (pr) subj = [pronounTo(pr, cast, ctx, prevSubj)]; }
      if (!subj.length && all) subj = cast.map((_, i) => i).filter(i => ctx.present.includes(i));
      if (!subj.length) subj = prevSubj || (ctx.last != null ? [ctx.last] : [ctx.present[0] ?? 0]);
      // the object: the first name after the verb (before the next one), or "him / her / lo / la / le"
      let target = who.filter(o => o.at > v.j - (v.j - v.i) && o.at > v.i && o.at < to).map(o => o.c)[0];
      if (target == null) { const ob = w.slice(v.i, Math.min(to, v.j + 4)).find(x => SC_OBJ.includes(x)); if (ob) target = pronounTo(ob, cast, ctx, subj, true); }
      if (target != null && subj.includes(target)) target = undefined;
      const spec = VERBS[v.id];
      if (spec.t === 'none') { prevSubj = subj; return; }
      if (target == null && ['approach', 'face', 'group'].includes(spec.t)) { const others = ctx.present.filter(i => !subj.includes(i)); target = ctx.lastOther != null && !subj.includes(ctx.lastOther) && ctx.present.includes(ctx.lastOther) ? ctx.lastOther : others[0]; }
      out.push({who: subj, id: v.id, target, together: SC_TOGETHER.some(t => scNorm(cl).includes(t)), text: cl, fast: v.fast || /corr|run|rapid|deprisa|quick|fast/.test(scNorm(w.slice(from, to).join(' ')))});
      ctx.last = subj[subj.length - 1]; prevSubj = subj; prevObj = target; if (target != null) ctx.lastOther = target;
    });
  }
  return out;
}

/* ---------- one scene: staging, actions, timing ---------- */
const SC_SLOTS = {1: [[0, 0, 0]], 2: [[-.62, 0, 62], [.62, 0, -62]], 3: [[-.85, .1, 55], [.85, .1, -55], [0, -.75, 180]], 4: [[-1.2, .15, 50], [-.4, -.35, 20], [.4, -.35, -20], [1.2, .15, -50]]};
function directScene(sc, idx, cast, lang, o) {
  const present = [], add = i => { if (i != null && !present.includes(i) && present.length < MAX_CHARS) present.push(i); };
  const ctx = {last: null, lastOther: null, present};
  // who is in the scene: whoever speaks or is named, in order of appearance (four at most)
  for (const b of sc.beats) { if (b.who) add(cast.findIndex(c => c.name === b.who)); if (b.k === 'act') for (const [k, i] of cast.map((c, i) => [scWords(c.name)[0], i])) if (scWords(b.text).includes(k)) add(i); }
  if (!present.length && cast.length) present.push(0);
  const local = ci => present.indexOf(ci), N = present.length;
  // where each one starts: in place, or off to one side if their first action is to come in
  const firstAct = new Map(), plans = [];
  for (const b of sc.beats) if (b.k === 'act' || b.k === 'paren') {
    const speaker = b.who ? cast.findIndex(c => c.name === b.who) : null; if (speaker != null && speaker >= 0) ctx.last = speaker;
    const acts = readAction(b.text, cast, lang, ctx); b.acts = acts;
    for (const a of acts) if (a.who) for (const c of a.who) if (!firstAct.has(c)) firstAct.set(c, a.id);
  }
  const slot = SC_SLOTS[Math.min(4, N)] || SC_SLOTS[1];
  const st = present.map((ci, i) => { const [x, z, yawDeg] = slot[i] || [i * .9 - 1, 0, 0], enter = firstAct.get(ci) === 'enter';
    const x0 = enter ? (x < 0 || (x === 0 && i % 2) ? -4.5 : 4.5) : x, z0 = enter ? z + .3 : z, y0 = enter ? (x0 < 0 ? Math.PI / 2 : -Math.PI / 2) : yawDeg * DEG;
    return {ci, home: {x, z, yaw: yawDeg * DEG}, x: x0, z: z0, yaw: y0, mode: enter ? 'off' : 'stand', initX: x0, initZ: z0, initYaw: y0, initMode: enter ? 'off' : 'stand', segs: [], expr: [{t: 0, e: null}], gaze: []}; });
  const S = ci => st[local(ci)];
  const seg = (s, t0, t1, kind, d) => { s.segs.push({t0, t1, kind, ...d}); };
  const lines = [], events = [], chairs = [], warn = [];
  let T = 0;
  const free = s => Math.max(T, ...(s.segs.length ? [s.segs[s.segs.length - 1].t1] : [0]));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const walkTo = (s, x, z, t0, kind = 'walk', stopAt = 0) => {
    const dx = x - s.x, dz = z - s.z, L = Math.hypot(dx, dz) - stopAt; if (L < .15) return t0;
    const yaw = Math.atan2(dx, dz), v = SC_SPEED[kind] * (chars[local(s.ci)] ? chars[local(s.ci)].size : 1), dur = L / v, ex = s.x + dx / Math.hypot(dx, dz) * L, ez = s.z + dz / Math.hypot(dx, dz) * L;
    seg(s, t0, t0 + dur, 'walk', {clip: SC_CLIP[kind], from: {x: s.x, z: s.z}, to: {x: ex, z: ez}, yaw}); s.x = ex; s.z = ez; s.yaw = yaw; if (s.mode === 'off') s.mode = 'stand';
    events.push({t0, t1: t0 + dur, kind: 'move', c: s.ci, shot: takeShot()}); return t0 + dur;
  };
  const faceTo = (s, b, t) => { if (!b) return; s.yaw = Math.atan2(b.x - s.x, b.z - s.z); seg(s, t, t + .45, 'turn', {yaw: s.yaw}); };
  const intensity = (b) => { let k = .25; if (/!/.test(b.text)) k += .25; if (/!{2,}|[A-ZÁÉÍÓÚÑ]{4,}/.test(b.text)) k += .25; if (b.emo && !['sonrisa', 'concentrado'].includes(b.emo)) k += .3; return Math.min(1, k); };
  let pendingShot = null; const takeShot = () => { const x = pendingShot; pendingShot = null; return x; };
  for (const b of sc.beats) {
    if (b.k === 'shot') { pendingShot = {dir: b.dir, who: cast.map((c, i) => scWords(b.text).includes(scWords(c.name)[0]) ? i : -1).filter(i => i >= 0 && present.includes(i)), t: T}; continue; }
    if (b.k === 'trans') continue;
    if (b.k === 'line') {
      const ci = cast.findIndex(c => c.name === b.who); if (ci < 0 || !present.includes(ci)) continue;
      const s = S(ci), prev = lines[lines.length - 1];
      const gap = !prev ? .25 : prev.c === ci ? .35 : /[?]\s*$/.test(prev.text) || prev.inten > .6 ? .8 : .4;
      const t0 = Math.max(T + (lines.length ? gap : .4), s.mode === 'off' ? T : 0);
      if (s.mode === 'off') { warn.push(tr('{x} habla sin haber entrado: entra antes.', {x: cast[ci].name})); }
      const emo = b.emo || (/!{1,}/.test(b.text) && /[A-ZÁÉÍÓÚÑ]{4,}/.test(b.text) ? 'grito' : null);
      if (emo) s.expr.push({t: t0, e: emo});
      const to = prev && prev.c !== ci ? prev.c : present.find(i => i !== ci);
      const l = {c: ci, to, text: b.text, t0, dur: 0, inten: intensity({...b, emo}), lang, emo, shot: pendingShot}; pendingShot = null;
      lines.push(l); T = t0;  // the length comes with the voices (see timeLines); a placeholder until then
      l.dur = estimateLen(b.text, lang); T = t0 + l.dur;
      continue;
    }
    // action, and actions inside a speech
    for (const a of b.acts || []) {
      if (a.unknown) { warn.push(tr('No he entendido: «{x}»', {x: a.unknown})); continue; }
      const start = a.together ? Math.max(0, T - 1) : T; let end = start;
      for (const ci of a.who) {
        if (!present.includes(ci)) continue; const s = S(ci), t0 = Math.max(start, s.segs.length ? s.segs[s.segs.length - 1].t1 : 0), spec = VERBS[a.id] || {}, tgt = a.target != null && present.includes(a.target) ? S(a.target) : null;
        let t1 = t0;
        if (a.id === 'emo') { s.expr.push({t: t0, e: a.e}); continue; }
        switch (spec.t) {
          case 'enter': s.onAt = t0; t1 = walkTo(s, s.home.x, s.home.z, t0, a.fast ? 'run' : 'walk'); break;
          case 'exit': { const side = s.x <= 0 ? -1 : 1; t1 = walkTo(s, side * 5.5, s.z + .5, t0, a.fast ? 'run' : 'walk'); s.mode = 'off'; s.offAt = t1 - .6; break; }
          case 'approach': if (tgt) t1 = walkTo(s, tgt.x, tgt.z, t0, a.fast ? 'run' : 'walk', .85); else t1 = walkTo(s, s.x + Math.sin(s.yaw) * 2, s.z + Math.cos(s.yaw) * 2, t0); if (tgt) faceTo(tgt, s, t1 - .4); break;
          case 'run': case 'walk': case 'sneak': { const k = spec.t === 'run' && /huy|escap|flee|sprint|dash/.test(scNorm(a.text)) ? 'sprint' : spec.t;
            if (tgt) t1 = walkTo(s, tgt.x, tgt.z, t0, k, .85);
            else if (a.who.length > 1) { const yaw = Math.PI / 2; t1 = walkTo(s, s.x + Math.sin(yaw) * 2.6, s.z + Math.cos(yaw) * 2.6, t0, k); }  // walking together: side by side, across the screen
            else t1 = walkTo(s, s.x + Math.sin(s.yaw) * 2.4, s.z + Math.cos(s.yaw) * 2.4, t0, k); break; }
          case 'walkclip': t1 = walkTo(s, s.x + Math.sin(s.yaw) * 2.4, s.z + Math.cos(s.yaw) * 2.4, t0, spec.c[0] === SC_CLIP.walk ? 'walk' : a.id === 'swim' ? 'swim' : 'carry'); if (spec.c) s.segs[s.segs.length - 1].clip = spec.c[0]; break;
          case 'sit': if (s.mode !== 'sit') { const c = clipById(SC_CLIP.sit); const back = new V3(Math.sin(s.yaw), 0, Math.cos(s.yaw)).multiplyScalar(-.42);
            chairs.push({x: s.x + back.x, z: s.z + back.z, yaw: s.yaw}); seg(s, t0, t0 + c.len, 'clip', {clip: c.id, at: {x: s.x, z: s.z}, yaw: s.yaw, root: true}); t1 = t0 + c.len; s.mode = 'sit';
            const end = c.frames[c.frames.length - 1].p, start0 = c.frames[0].p, d = new V3(end[0] - start0[0], 0, end[2] - start0[2]).applyAxisAngle(new V3(0, 1, 0), s.yaw); s.sx = s.x + d.x; s.sz = s.z + d.z; } break;
          case 'stand': if (s.mode === 'sit') { const c = clipById(SC_CLIP.stand); seg(s, t0, t0 + c.len, 'clip', {clip: c.id, at: {x: s.sx ?? s.x, z: s.sz ?? s.z}, yaw: s.yaw, root: true, seated: true}); t1 = t0 + c.len; s.mode = 'stand'; }
            else if (s.mode === 'down') { const c = clipById(SC_CLIP.getup); seg(s, t0, t0 + c.len, 'clip', {clip: c.id, at: {x: s.x, z: s.z}, yaw: s.yaw}); t1 = t0 + c.len; s.mode = 'stand'; } break;
          case 'turn': s.yaw = wrapA(s.yaw + Math.PI); seg(s, t0, t0 + .6, 'turn', {yaw: s.yaw}); t1 = t0 + .6; break;
          case 'face': if (tgt) { faceTo(s, tgt, t0); s.gaze.push({t0, t1: t0 + 3, c: tgt.ci}); } t1 = t0 + .6; break;
          case 'clip': case 'loop': { if (s.mode === 'sit' && !/sit/i.test(spec.c[0])) { /* gestures seated: the upper body only would be ideal; stand them up first */ const c = clipById(SC_CLIP.stand); seg(s, t0, t0 + c.len, 'clip', {clip: c.id, at: {x: s.sx ?? s.x, z: s.sz ?? s.z}, yaw: s.yaw, root: true, seated: true}); s.mode = 'stand'; }
            const t00 = s.segs.length ? Math.max(t0, s.segs[s.segs.length - 1].t1) : t0;
            if (tgt) { if (['punch', 'kick', 'sword', 'push', 'shoot', 'aim', 'throw', 'spell'].includes(a.id) && dist(s, tgt) > 1.4 && ['punch', 'kick', 'push'].includes(a.id)) { const tt = walkTo(s, tgt.x, tgt.z, t00, 'walk', .75); faceTo(s, tgt, tt); } else faceTo(s, tgt, t00); }
            const tA = s.segs.length ? Math.max(t00, s.segs[s.segs.length - 1].t1) : t00;
            const ids = spec.c.filter(clipById); if (!ids.length) { warn.push(tr('No tengo animación para «{x}»', {x: a.text})); break; }
            const c = clipById(ids[(ctx.n = (ctx.n || 0) + 1) % ids.length]), dur = spec.t === 'loop' ? (spec.dur || 2.5) : c.len * (spec.loops || 1);
            seg(s, tA, tA + dur, 'clip', {clip: c.id, at: {x: s.x, z: s.z}, yaw: s.yaw, loop: spec.t === 'loop' || (spec.loops || 1) > 1, root: !c.loop && c.id !== 'np-saltar'});
            if (!c.loop && c.id !== 'np-saltar') { const e2 = c.frames[c.frames.length - 1].p, s0 = c.frames[0].p, k = chars[local(ci)] ? chars[local(ci)].rootY / clipRig().rootY : 1, dd = new V3(e2[0] - s0[0], 0, e2[2] - s0[2]).multiplyScalar(k).applyAxisAngle(new V3(0, 1, 0), s.yaw); s.x += dd.x; s.z += dd.z; }
            if (spec.down) s.mode = 'down';
            t1 = tA + dur; events.push({shot: takeShot(), t0: tA, t1, kind: ['punch', 'kick', 'sword', 'shoot', 'hurt', 'knock', 'block', 'dodge', 'throw', 'spell'].includes(a.id) ? 'fight' : ['jump', 'climb', 'roll', 'fall'].includes(a.id) ? 'big' : 'gesture', c: ci, target: a.target});
            // the one hit reacts
            if (tgt && ['punch', 'kick', 'sword', 'shoot', 'throw', 'spell'].includes(a.id) && !(b.acts || []).some(x => x.who && x.who.includes(tgt.ci) && ['hurt', 'knock', 'block', 'dodge', 'fall'].includes(x.id))) {
              const hc = clipById(a.id === 'shoot' ? 'ual1-Death01' : 'ual1-Hit_Chest'); if (hc) { const th = tA + Math.min(dur * .45, .5); seg(tgt, Math.max(th, tgt.segs.length ? tgt.segs[tgt.segs.length - 1].t1 : 0), th + hc.len, 'clip', {clip: hc.id, at: {x: tgt.x, z: tgt.z}, yaw: tgt.yaw}); if (a.id === 'shoot') tgt.mode = 'down'; tgt.expr.push({t: th, e: 'miedo'}); } }
            break; }
          case 'pose': { if (tgt) faceTo(s, tgt, t0); const tA = s.segs.length ? Math.max(t0, s.segs[s.segs.length - 1].t1) : t0; seg(s, tA, tA + (spec.dur || 1.2) + .3, 'pose', {pose: spec.pose, at: {x: s.x, z: s.z}, yaw: s.yaw}); t1 = tA + (spec.dur || 1.2) + .3;
            events.push({t0: tA, t1, kind: a.id === 'kick' || a.id === 'block' || a.id === 'dodge' ? 'fight' : 'gesture', c: ci, shot: takeShot()}); break; }
          case 'group': { if (!tgt) { warn.push(tr('«{x}»: ¿con quién?', {x: a.text})); break; }
            let tA = t0; if (dist(s, tgt) > 1.3) tA = walkTo(s, tgt.x, tgt.z, t0, 'walk', .9);
            const tB = Math.max(tA, tgt.segs.length ? tgt.segs[tgt.segs.length - 1].t1 : 0), d = spec.dur || 1.6;
            const mid = {x: (s.x + tgt.x) / 2, z: (s.z + tgt.z) / 2}, yaw = Math.atan2(tgt.x - s.x, tgt.z - s.z);
            seg(s, tB, tB + d + .4, 'group', {g: spec.g, who: 0, mid, yaw}); seg(tgt, tB, tB + d + .4, 'group', {g: spec.g, who: 1, mid, yaw});
            events.push({t0: tB, t1: tB + d + .4, kind: 'group', c: ci, target: tgt.ci, shot: takeShot()}); t1 = tB + d + .4; break; }
          case 'expr': s.expr.push({t: t0, e: spec.e}); t1 = t0; break;
        }
        end = Math.max(end, t1);
      }
      if (!a.together || end > T) T = Math.max(T, end);
    }
  }
  const len = Math.max(T + .9, 3);
  return {sc, idx, present, st, lines, events, chairs, warn, len, lang};
}

/* ---------- timing with the voices ---------- */
// the scene was laid out with estimated line lengths; now each line takes what its voice takes, and everything after it moves
async function timeLines(D, cast) {
  let shift = 0; const marks = [];
  const shiftedTime = t => t + marks.filter(m => t >= m[0] - 1e-6).reduce((a, m) => a + m[1], 0);
  const moveAfter = (t, d) => { for (const s of D.st) for (const g of s.segs) { if (g.t0 >= t - 1e-6) { g.t0 += d; g.t1 += d; } else if (g.t1 > t) g.t1 += d; } for (const e of D.events) if (e.t0 >= t - 1e-6) { e.t0 += d; e.t1 += d; } for (const s of D.st) for (const x of [...s.expr, ...s.gaze]) { if ((x.t ?? x.t0) >= t - 1e-6) { if (x.t != null) x.t += d; else { x.t0 += d; x.t1 += d; } } } };
  for (const l of D.lines) {
    l.t0 += shift;
    const m = chars[D.present.indexOf(l.c)], vo = voiceOf(m || {body: cast[l.c].body}, l.c), tm = await lineTiming(l.text, D.lang, vo);
    const d = tm.dur - l.dur; l.voice = vo;
    if (Math.abs(d) > .02) { marks.push([l.t0 + l.dur - shift, d]); moveAfter(l.t0 + l.dur, d); shift += d; }
    l.dur = tm.dur; l.words = tm.words;
  }
  D.len += shift;
  for (const s of D.st) { if (s.onAt != null) s.onAt = shiftedTime(s.onAt); if (s.offAt != null) s.offAt = shiftedTime(s.offAt); }
  for (const l of D.lines) { const s = D.st[D.present.indexOf(l.c)]; if (s && l.to != null) for (const o of D.st) if (o.ci !== l.c && o.mode !== 'off') o.gaze.push({t0: l.t0 - .2, t1: l.t0 + l.dur + .3, c: l.c}); if (s && l.to != null) s.gaze.push({t0: l.t0, t1: l.t0 + l.dur, c: l.to}); }
}

/* ---------- baking: every frame of every character ---------- */
function bakeScene(D) {
  const fps = ANIM.fps, n = Math.max(2, Math.round(D.len * fps)), tracks = [];
  for (const [li, s] of D.st.entries()) {
    const m = chars[li], k = m.rootY / clipRig().rootY, keep = m.getPose().q, talking = t => D.lines.some(l => l.c === s.ci && t >= l.t0 - .1 && t < l.t0 + l.dur + .2);
    // the parts in order; the gaps between them: standing breath, talking hands, sitting still, lying where fallen
    const segs = [...s.segs].sort((a, b) => a.t0 - b.t0), full = []; let t = 0, x = s.x0 ?? null;
    const P = {x: (D.st[li].initX), z: D.st[li].initZ, yaw: D.st[li].initYaw}; let mode = D.st[li].initMode;
    const pushIdle = (t0, t1) => { if (t1 - t0 > .01) full.push({t0, t1, kind: 'idle', at: {...P}, mode}); };
    for (const g of segs) {
      if (g.t0 > t) pushIdle(t, g.t0);
      full.push({...g, at: g.at || {x: P.x, z: P.z}, yaw: g.yaw ?? P.yaw, mode0: mode});
      if (g.kind === 'walk') { P.x = g.to.x; P.z = g.to.z; P.yaw = g.yaw; if (mode === 'off') mode = 'stand'; }
      else if (g.kind === 'turn') P.yaw = g.yaw;
      else if (g.kind === 'clip') { const c = clipById(g.clip); if (c && g.root && !c.loop) { const e = c.frames[c.frames.length - 1].p, a = c.frames[0].p, d = new V3(e[0] - a[0], 0, e[2] - a[2]).multiplyScalar(k).applyAxisAngle(new V3(0, 1, 0), g.yaw); P.x = g.at.x + d.x; P.z = g.at.z + d.z; }
        if (g.clip === SC_CLIP.sit) mode = 'sit'; else if (g.clip === SC_CLIP.stand || g.clip === SC_CLIP.getup) mode = 'stand'; else if (g.clip === 'ual1-Death01') mode = 'down'; }
      t = Math.max(t, g.t1);
    }
    pushIdle(t, D.len + 1);
    const phase = li * .83, keys = []; let prevPose = null, cur = -1, blendFrom = null, gazeYaw = 0;
    for (let f = 0; f < n; f++) {
      const tt = f / fps; let i = full.findIndex(g => tt >= g.t0 && tt < g.t1); if (i < 0) i = full.length - 1;
      const g = full[i]; if (i !== cur) { blendFrom = prevPose; cur = i; }
      const tl = tt - g.t0, at = new V3(g.at.x, 0, g.at.z); let pose;
      if (g.kind === 'idle') {
        if (g.mode === 'down' && prevPose) pose = prevPose;
        else { const id = g.mode === 'sit' ? (talking(tt) ? SC_CLIP.sitTalk : SC_CLIP.sitIdle) : talking(tt) ? SC_CLIP.talk : SC_CLIP.idle, c = clipById(id) || clipById(SC_CLIP.idle2);
          pose = clipPose(m, sampleClip(c, tt + phase), at, g.at.yaw ?? P.yaw, true, k, keep); if (g.mode === 'sit') pose = seatPose(m, pose, g); }
      } else if (g.kind === 'walk') {
        const c = clipById(g.clip) || clipById(SC_CLIP.walk), u = clamp(tl / (g.t1 - g.t0), 0, 1), p = new V3(g.from.x + (g.to.x - g.from.x) * u, 0, g.from.z + (g.to.z - g.from.z) * u);
        pose = clipPose(m, sampleClip(c, tl * (g.clip === SC_CLIP.walk ? 1 : 1)), p, g.yaw, true, k, keep);
      } else if (g.kind === 'turn') {
        const c = clipById(SC_CLIP.idle), pv = full[i - 1], y0 = pv ? (pv.yaw ?? (pv.at && pv.at.yaw) ?? g.yaw) : g.yaw, u = easeIO(clamp(tl / Math.max(.1, g.t1 - g.t0), 0, 1));
        pose = clipPose(m, sampleClip(c, tt + phase), at, y0 + wrapA(g.yaw - y0) * u, true, k, keep);
      } else if (g.kind === 'clip') {
        const c = clipById(g.clip); pose = clipPose(m, sampleClip(c, g.loop ? tl : Math.min(tl, c.len)), at, g.yaw, !g.root, k, keep);
      } else if (g.kind === 'pose') { pose = g._pose || (g._pose = stillPose(m, g)); }
      else if (g.kind === 'group') { pose = g._pose || (g._pose = groupPose(D, li, g)); }
      if (!pose) pose = prevPose || m.getPose();
      // the first quarter of a second of each part comes from where the last one left off
      if (blendFrom && tl < .28) pose = mixPose(blendFrom, pose, easeIO(tl / .28));
      keys.push({f, pose, lin: true}); prevPose = pose;
    }
    tracks.push({ci: s.ci, keys});
  }
  // the heads turn to whoever is being listened to (now that everyone's place at every frame is known), smoothly
  for (const [li, s] of D.st.entries()) {
    const K = tracks[li].keys; let gy = 0;
    for (let f = 0; f < n; f++) {
      const tt = f / fps, gz = s.gaze.filter(x => tt >= x.t0 && tt < x.t1).pop(), o = gz && tracks.find(x => x.ci === gz.c); let want = 0;
      if (o) { const p = K[f].pose, op = o.keys[f].pose.pos; want = clamp(wrapA(Math.atan2(op[0] - p.pos[0], op[2] - p.pos[2]) - facingOf(p.q)), -75 * DEG, 75 * DEG); }
      gy += (want - gy) * Math.min(1, 6 / fps);
      if (Math.abs(gy) > .01) { const p = K[f].pose, q = {...p.q}; for (const [j, w] of [['neck', .4], ['head', .6]]) q[j] = new Q().fromArray(q[j] || [0, 0, 0, 1]).premultiply(new Q().setFromAxisAngle(new V3(0, 1, 0), gy * w)).toArray(); K[f].pose = {...p, q}; }
    }
  }
  return {tracks, n};
}
const easeIO = t => t * t * (3 - 2 * t);
// sitting still on the chair: the clip's seated loop at the height where the sitting clip ended
function seatPose(m, pose, g) { return pose; }
function stillPose(m, g) {
  const save = m.getPose(), p = POSE[g.pose]; if (!p) return save;
  m.joints.hips.position.set(g.at.x, m.rootY, g.at.z); applyPreset(m, p, {yaw: g.yaw}); m.joints.hips.position.x = g.at.x; m.joints.hips.position.z = g.at.z; m.group.updateMatrixWorld(true);
  const out = m.getPose(); m.setPose(save); m.group.updateMatrixWorld(true); return out;
}
// a pose of two (a hug, a handshake) laid where the two are, turned along the line between them
function groupPose(D, li, g) {
  const def = (GROUP_POSES[2] || []).find(p => p.id === g.g); if (!def) return null;
  const s = D.st[li], other = D.st.find(x => x !== s && x.segs.includes(x.segs.find(y => y.kind === 'group' && y.t0 === g.t0)));
  const A = chars[li], B = other ? chars[D.st.indexOf(other)] : null; if (!B) return null;
  const pair = g.who === 0 ? [A, B] : [B, A], saved = pair.map(m => m.getPose());
  applyGroupTo(pair, def);
  // the group pose is made around the origin facing +Z between them: turned and moved onto the two
  const p0 = pair[0].joints.hips.position.clone(), p1 = pair[1].joints.hips.position.clone(), mid0 = p0.clone().add(p1).multiplyScalar(.5);
  const yaw0 = Math.atan2(p1.x - p0.x, p1.z - p0.z), rot = new Q().setFromAxisAngle(new V3(0, 1, 0), g.yaw - yaw0);
  const out = pair.map(m => { const p = m.getPose(); const v = new V3().fromArray(p.pos).sub(mid0).applyQuaternion(rot); p.pos = [g.mid.x + v.x, p.pos[1], g.mid.z + v.z]; p.q.hips = rot.clone().multiply(new Q().fromArray(p.q.hips)).toArray(); return p; });
  pair.forEach((m, i) => { m.setPose(saved[i]); m.group.updateMatrixWorld(true); });
  return out[g.who === 0 ? 0 : 1];
}

/* ---------- the camera: which shots, and where ---------- */
const SC_H = {ews: 14, ws: 5, fs: 2.25, mfs: 1.45, ms: .98, mcu: .64, cu: .4, ecu: .16};
const SC_F = {ews: 20, ws: 24, fs: 30, mfs: 35, ms: 40, mcu: 55, cu: 75, ecu: 100};
const SC_LADDER = ['ews', 'ws', 'fs', 'mfs', 'ms', 'mcu', 'cu', 'ecu'];
const SC_SHOT_NAME = {est: 'Plano de situación', master: 'Plano general', two: 'Plano a dos', ots: 'Sobre el hombro', single: 'Plano', track: 'Seguimiento', pov: 'Subjetivo', react: 'Reacción', fight: 'Acción'};
function planShots(D) {
  const units = [], N = D.present.length, L = D.lines;
  const push = (t0, t1, spec) => { if (t1 - t0 > .05) units.push({t0, t1, ...spec}); };
  // an establishing shot when the place changes (and at the start), until the first line or for 3 s
  const firstLine = L.length ? L[0].t0 - .25 : D.len, estEnd = Math.max(Math.min(firstLine, D.events.length && D.events[0].kind === 'move' ? Math.max(3, D.events[0].t1) : 3.2), Math.min(2.5, D.len));
  push(0, Math.min(estEnd, D.len), {type: 'est', size: 'ws', subj: D.present.slice()});
  let t = Math.min(estEnd, D.len), exch = 0, lastSubj = null, lastSize = null;
  const timeline = [...L.map(l => ({...l, k: 'line'})), ...D.events.filter(e => !L.some(l => e.t0 < l.t0 + l.dur - .05 && e.t1 > l.t0 + .05)).map(e => ({...e, k: 'act'}))].sort((a, b) => a.t0 - b.t0);
  for (const e of timeline) {
    const t0 = Math.max(t, e.k === 'line' ? e.t0 - .25 : e.t0); if (t0 >= D.len) break;
    let spec;
    if (e.k === 'line') {
      exch++;
      const size = e.inten > .7 ? 'cu' : e.inten > .45 ? 'mcu' : 'ms';
      if (N <= 1) spec = {type: 'single', size: exch === 1 ? 'mfs' : size, subj: [e.c]};
      else if (N === 2) spec = exch % 5 === 0 ? {type: 'two', size: 'mfs', subj: D.present.slice()} : (e.inten > .45 || exch > 3) ? {type: 'single', size, subj: [e.c], other: e.to} : {type: 'ots', size, subj: [e.c], other: e.to};
      else spec = exch % 4 === 0 ? {type: 'master', size: 'fs', subj: D.present.slice()} : {type: 'single', size: e.inten > .45 ? size : 'mcu', subj: [e.c], other: e.to};
      if (e.shot) spec = shotFromDirection(e.shot, spec, D);
      // no jump cuts: the same person again changes size by at least two steps or comes from over the shoulder
      if (lastSubj === spec.subj.join() && units.length && units[units.length - 1].type === spec.type) { const i = SC_LADDER.indexOf(spec.size), j = SC_LADDER.indexOf(lastSize); if (Math.abs(i - j) < 2) spec.size = SC_LADDER[clamp(j + (j >= 5 ? -2 : 2), 2, 6)]; }
    } else if (e.kind === 'move') spec = {type: 'track', size: 'fs', subj: [e.c]};
    else if (e.kind === 'fight') spec = {type: 'fight', size: units.length % 2 ? 'mfs' : 'fs', subj: e.target != null ? [e.c, e.target] : [e.c]};
    else if (e.kind === 'big') spec = {type: 'single', size: 'fs', subj: [e.c], angle: 'low'};
    else if (e.kind === 'group') spec = {type: 'two', size: 'ms', subj: [e.c, e.target]};
    else spec = {type: 'single', size: 'mfs', subj: [e.c]};
    if (e.k === 'act' && e.shot) spec = shotFromDirection(e.shot, spec, D);
    // a shot shorter than a second and a half is not worth a cut: the last one goes on
    const prev = units[units.length - 1];
    if (prev && t0 - prev.t0 < 1.5 && !e.shot && !(e.k === 'line' && ['track', 'est', 'fight'].includes(prev.type) && t0 - prev.t0 >= .9)) { lastSubj = prev.subj.join(); continue; }
    if (prev) prev.t1 = t0;
    push(t0, D.len, spec); t = t0; lastSubj = spec.subj.join(); lastSize = spec.size;
    // a long line: a look at the one listening halfway through (and back)
    if (e.k === 'line' && e.dur > 6 && N >= 2 && e.to != null) { const m1 = e.t0 + e.dur * .45; units[units.length - 1].t1 = m1; push(m1, m1 + 1.6, {type: 'react', size: 'mcu', subj: [e.to], other: e.c}); push(m1 + 1.6, D.len, {...spec}); t = m1 + 1.6; }
  }
  if (units.length) units[units.length - 1].t1 = D.len;
  const there = (c, t) => { const s = D.st[D.present.indexOf(c)]; return s && !(s.onAt != null && t < s.onAt) && !(s.offAt != null && t > s.offAt); };
  for (const u of units) { const tm = u.type === 'track' ? u.t0 + .3 : (u.t0 + u.t1) / 2, vis = u.subj.filter(c => there(c, tm)); if (vis.length === u.subj.length) continue;
    const left = D.present.filter(c => there(c, tm)); if (vis.length) u.subj = vis; else if (left.length) Object.assign(u, {type: left.length > 1 ? 'master' : 'single', size: 'fs', subj: left, other: undefined}); }
  // merge what is left too short at the end
  for (let i = units.length - 1; i > 0; i--) if (units[i].t1 - units[i].t0 < 1) { units[i - 1].t1 = units[i].t1; units.splice(i, 1); }
  return units;
}
function shotFromDirection(sd, spec, D) {
  const d = sd.dir, out = {...spec, fixed: true};
  if (d.size === 'two') { out.type = 'two'; out.subj = D.present.slice(0, 2); out.size = 'ms'; }
  else if (d.size === 'ots') out.type = 'ots';
  else if (d.size === 'pov') { out.type = 'pov'; }
  else if (d.size) { out.size = d.size === 'ws' || d.size === 'ews' ? d.size : d.size; if (['ws', 'ews'].includes(d.size)) { out.type = 'master'; out.subj = D.present.slice(); } else if (out.type === 'ots' || out.type === 'two' || out.type === 'master') out.type = 'single'; }
  if (sd.who && sd.who.length) { out.subj = sd.who; }
  if (d.angle) out.angle = d.angle; if (d.move) out.move = d.move;
  return out;
}
// the scene's line of interest: between the first two people; the camera stays on the side that faces +Z
function lineOfInterest(D, at) {
  if (D.present.length < 2) return {n: new V3(0, 0, 1)};
  const a = at(D.present[0], 0), b = at(D.present[1], 0), d = new V3(b.x - a.x, 0, b.z - a.z).normalize(), n = new V3(-d.z, 0, d.x);
  if (n.z < 0) n.negate(); return {n, d};
}
function camFor(spec, t, D, sample, side) {
  const W = sample(t), vfovOf = f => 2 * Math.atan(.5 * camera.filmGauge / Math.max(camera.aspect, 1) / f), k = W.size;
  const subj = spec.subj.map(c => W.of[c]).filter(Boolean); if (!subj.length) return null;
  const eye = s => s.eye.clone(), mid = subj.reduce((a, s) => a.add(s.eye), new V3()).multiplyScalar(1 / subj.length);
  let size = spec.size || 'ms', H = SC_H[size] * k, focal = SC_F[size], pos, tgt;
  const n = side.n.clone();
  if (spec.type === 'est' || spec.type === 'master' || spec.type === 'two' || spec.type === 'fight') {
    const all = spec.type === 'est' ? Object.values(W.of) : subj, xs = all.map(s => s.hips);
    const c = xs.reduce((a, p) => a.add(p), new V3()).multiplyScalar(1 / xs.length); let spread = 0; for (const p of xs) spread = Math.max(spread, p.distanceTo(c));
    H = Math.max(H, (spread * 2 + 1.1 * k) / Math.max(1, camera.aspect) * 1.15, spec.type === 'est' ? 3.4 * k : 0);
    focal = spec.type === 'est' ? 24 : focal; const vf = vfovOf(focal), d = H / 2 / Math.tan(vf / 2);
    const el = (spec.type === 'est' ? 18 : 7) * DEG, dir = n.clone().add(side.d ? side.d.clone().multiplyScalar(spec.type === 'est' ? .55 : .15) : new V3()).normalize();
    tgt = new V3(c.x, Math.max(.5 * k, (spec.type === 'est' ? c.y * .9 : mid.y - H / 6)), c.z);
    pos = tgt.clone().add(dir.multiplyScalar(d * Math.cos(el))).add(new V3(0, d * Math.sin(el), 0));
  } else if (spec.type === 'ots' && spec.other != null && W.of[spec.other]) {
    const S = subj[0], O = W.of[spec.other], dirOS = S.eye.clone().sub(O.eye).setY(0).normalize(), sideV = n.clone().multiplyScalar(n.dot(new V3().crossVectors(new V3(0, 1, 0), dirOS)) >= 0 ? 1 : -1);
    pos = O.eye.clone().addScaledVector(dirOS, -.62 * k).addScaledVector(new V3(-dirOS.z, 0, dirOS.x).multiplyScalar(sideV.dot(new V3(-dirOS.z, 0, dirOS.x)) >= 0 ? 1 : -1), .36 * k).add(new V3(0, .06 * k, 0));
    tgt = S.eye.clone().add(new V3(0, -H / 6, 0)); const d = pos.distanceTo(tgt);
    focal = clamp(camera.filmGauge / Math.max(camera.aspect, 1) * d / H, 22, 110);
  } else if (spec.type === 'pov' && spec.other != null && W.of[spec.other]) {
    pos = W.of[spec.other].eye.clone(); tgt = subj[0].eye.clone(); focal = 32;
  } else {  // a single (or a reaction, or a follow): in front of the subject, a little towards whoever they face, on the camera's side
    const S = subj[0], O = spec.other != null ? W.of[spec.other] : null, look = O ? O.eye.clone().sub(S.eye).setY(0).normalize() : S.fwd.clone();
    const toCam = look.clone().multiplyScalar(.55).add(n.clone().multiplyScalar(n.dot(S.fwd) < -.3 && !O ? -1 : 1)).normalize();
    const vf = vfovOf(focal), d = H / 2 / Math.tan(vf / 2);
    tgt = S.eye.clone().add(new V3(0, -H / 6, 0)).addScaledVector(look, H * .12);  // looking room on the side they look to
    if (spec.type === 'track') tgt.addScaledVector(S.vel, .6);
    pos = tgt.clone().addScaledVector(toCam, d);
  }
  if (spec.angle === 'high') pos.y += pos.distanceTo(tgt) * .45; else if (spec.angle === 'low') pos.y = Math.max(.25 * k, tgt.y - pos.distanceTo(tgt) * .3);
  pos.y = Math.max(pos.y, .15);
  return {p: pos.toArray().map(v => +v.toFixed(3)), t: tgt.toArray().map(v => +v.toFixed(3)), f: +focal.toFixed(1), r: 0};
}

/* ---------- the whole film ---------- */
const SC_SAMPLE = {es: 'INT. COCINA - NOCHE\n\nANA está junto a la mesa. LUIS entra y se acerca a ella.\n\nLUIS\n(sonriendo)\n¡Hola! ¿Llego tarde?\n\nANA\n(enfadada)\nUna hora tarde, Luis. Una hora.\n\nLuis se encoge de hombros y se sienta.\n\nLUIS\nLo siento. El tráfico estaba fatal…\n\nAna se ríe y lo abraza.\n\nEXT. PARQUE - DÍA\n\nPLANO GENERAL. Ana y Luis caminan.\n\nANA\n¿Ves? Así está mucho mejor.\n\nLuis salta y celebra.\n',
  en: 'INT. KITCHEN - NIGHT\n\nANNA waits by the table. LEO enters and walks over to her.\n\nLEO\n(smiling)\nHi! Am I late?\n\nANNA\n(angry)\nAn hour late, Leo. An hour.\n\nLeo shrugs and sits down.\n\nLEO\nI\'m sorry. The traffic was terrible…\n\nAnna laughs and hugs him.\n\nEXT. PARK - DAY\n\nWIDE SHOT. Anna and Leo walk.\n\nANNA\nSee? This is much better.\n\nLeo jumps and celebrates.\n'};
async function scriptToFilm(text, o = {}) {
  if (SC.busy) return; SC.busy = true;
  const msg = t => { const el = $('#scMsg'); if (el) el.textContent = t; }, report = {warn: [], scenes: 0, shots: 0};
  try {
    const P = parseScript(text), lang = o.lang || scLang(text);
    if (!P.scenes.some(s => s.beats.length)) throw new Error(tr('el guion está vacío'));
    const cast = castOf(P, text); if (!cast.length) throw new Error(tr('no encuentro personajes: escribe sus nombres en mayúsculas antes de lo que dicen'));
    msg(tr('Preparando el reparto y las animaciones…'));
    if (!ANIM.open) { $('#animBtn').click(); await new Promise(r => setTimeout(r, 50)); }
    await loadClipLibrary(); clipRig();
    if (VOICE.on) { msg(tr('Preparando las voces…')); await espeak().catch(() => {}); }
    storeShot(); SC.last = JSON.stringify({shots: ANIM.shots, cur: ANIM.cur});  // for "Undo" (the shot being edited included)
    const film = [];
    for (const [idx, sc] of P.scenes.entries()) {
      if (!sc.beats.length) continue;
      msg(tr('Escena {n} de {t}: {p}', {n: idx + 1, t: P.scenes.length, p: sc.head.place || sc.head.text || ''}));
      // the scene's people on stage, with their bodies
      const D0 = directScene(sc, idx, cast, lang, o), present = D0.present;
      ensureCount(Math.max(1, present.length));
      for (const [li, ci] of present.entries()) { const m = chars[li], want = {...BODY_BASE, ...cast[ci].body}; if (JSON.stringify(want) !== JSON.stringify(m.body)) m.build(want); m.bodyPreset = cast[ci].preset; }
      // the set and its time of day
      let env = placeOf(sc.head); if (!env && sc.head.place && o.online !== false) { msg(tr('Buscando un escenario para «{p}»…', {p: sc.head.place})); env = await placeOnline(sc.head); }
      if (!env) env = sc.head.int === false ? 'parque' : 'estudio';
      await setEnv(env); const tm = timeOf(sc.head), amb = tm === 'noche' ? (sc.head.int ? 'interior' : 'noche') : tm === 'atardecer' ? 'atardecer' : tm === 'dia' && sc.head.int === false ? 'dia' : null;
      if (amb) { state.amb = amb; applyAmbient(); setPressed($('#ambChips'), amb); }
      clearProps();
      // laid out again now that the bodies exist (sizes), timed with the voices, baked, shot
      const D = directScene(sc, idx, cast, lang, o);
      await timeLines(D, cast);
      for (const c of D.chairs) { const g = makeProp('silla', new V3(c.x, 0, c.z)); g.rotation.y = c.yaw + Math.PI; }
      const B = bakeScene(D), sample = worldSampler(D, B), side = lineOfInterest(D, (ci, t) => sample(t).of[ci].hips);
      const units = o.cams === false ? [{t0: 0, t1: D.len, type: 'master', size: 'fs', subj: D.present.slice()}] : planShots(D);
      SC.plans = SC.plans || []; SC.plans[idx] = {units: units.map(u => ({...u})), lines: D.lines.map(l => [l.c, l.t0, l.dur]), events: D.events.map(e => ({...e})), len: D.len};
      for (const [ui, u] of units.entries()) film.push(makeShot(D, B, u, ui, sample, side, cast));
      report.warn.push(...D.warn.map(w => `${idx + 1}: ${w}`)); report.scenes++;
    }
    ANIM.shots = film; ANIM.cur = -1; report.shots = film.length;
    await enterShot(0, 0); renderStrip(); renderLabels();
    msg(filmReady(report));
    return report;
  } finally { SC.busy = false; }
}
// where everyone's eyes, hips and facing are at time t (from the baked keys)
function worldSampler(D, B) {
  const cache = new Map();
  return t => {
    const f = clamp(Math.round(t * ANIM.fps), 0, B.n - 1); if (cache.has(f)) return cache.get(f);
    const of = {}; let size = 1;
    B.tracks.forEach((tr2, li) => {
      const m = chars[li], key = tr2.keys[f], save = m.getPose(); m.setPose(key.pose); m.group.updateMatrixWorld(true);
      const eye = m.joints.head.getWorldPosition(new V3()).add(new V3(0, m.headH * .35, 0)), hips = m.joints.hips.getWorldPosition(new V3());
      const yaw = facingOf(key.pose.q), nx = tr2.keys[Math.min(B.n - 1, f + 6)].pose.pos, vel = new V3(nx[0] - key.pose.pos[0], 0, nx[2] - key.pose.pos[2]);
      of[tr2.ci] = {eye, hips, fwd: new V3(Math.sin(yaw), 0, Math.cos(yaw)), vel}; size = m.size || 1;
      m.setPose(save); m.group.updateMatrixWorld(true);
    });
    const r = {of, size}; cache.set(f, r); return r;
  };
}
function makeShot(D, B, u, ui, sample, side, cast) {
  const fps = ANIM.fps, f0 = Math.round(u.t0 * fps), f1 = Math.max(f0 + 2, Math.round(u.t1 * fps)), len = f1 - f0;
  const s = newShot(`${D.idx + 1}${String.fromCharCode(65 + (ui % 26))} · ${tr(SC_SHOT_NAME[u.type] || 'Plano')}${u.size && !['est', 'master', 'two'].includes(u.type) ? ' ' + tr({ews: 'muy general', ws: 'general', fs: 'entero', mfs: 'americano', ms: 'medio', mcu: 'medio corto', cu: 'primer plano', ecu: 'detalle'}[u.size]) : ''}`);
  s.len = len;
  // the scene as it stands at the shot's first frame: bodies (with the face of the moment), clothes, set
  s.scene = captureScene();
  s.scene.chars = D.present.map((ci, li) => { const m = chars[li], st = D.st[li], e = [...st.expr].filter(x => x.t <= (u.t0 + u.t1) / 2).pop(); const body = {...m.body}; if (e && e.e && body.species === 'humano') { body.expr = e.e; body.exprAmt = 1; } else delete body.expr;
    return {body, preset: m.bodyPreset, outfit: (cast[ci].outfit || []).map(x => ({...x})), pose: B.tracks[li].keys[Math.min(f0, B.n - 1)].pose}; });
  s.keys = B.tracks.map(tr2 => { const K = []; for (let f = f0; f < Math.min(f1, B.n); f++) K.push({f: f - f0, pose: tr2.keys[f].pose, lin: true}); return K; });
  // anthros say it with their ears and tail: the moment's feeling as body language, over the baked keys (the jaw is the voice's)
  D.present.forEach((ci, li) => { const m = chars[li]; if (!m || m.body.species === 'humano' || !s.keys[li]) return;
    const e = [...D.st[li].expr].filter(x => x.t <= (u.t0 + u.t1) / 2).pop(), J = exprJoints(m, ANTHRO_OF[e && e.e] || 'neutra'); if (!J) return; delete J.jaw;
    const Qs = Object.fromEntries(Object.entries(J).map(([n, r]) => [n, new Q().setFromEuler(new THREE.Euler(r[0], r[1], r[2])).toArray()]));
    s.keys[li] = s.keys[li].map(k => ({...k, pose: {...k.pose, q: {...k.pose.q, ...Qs}}})); });
  const c0 = camFor(u, u.t0 + .05, D, sample, side), c1 = u.type === 'track' || u.move ? camFor(u, u.t1 - .05, D, sample, side) : null;
  if (c0) { s.scene.cam = c0; s.cam = [{f: 0, c: c0}]; if (c1) s.cam.push({f: len - 1, c: c1}); }
  s.lines = D.lines.filter(l => l.t0 < u.t1 && l.t0 + l.dur > u.t0).map(l => ({c: D.present.indexOf(l.c), f: Math.round((l.t0 - u.t0) * fps), len: Math.max(2, Math.round(l.dur * fps)), text: l.text, lang: l.lang, voice: l.voice,
    w: lineWords(l.words, l.text, l.dur), cont: l.t0 < u.t0 - .01 || undefined}));
  return s;
}

/* ---------- the window ---------- */
const filmReady = r => (tourEvent('film'), tr('Película lista: {s}, {n}.', {s: trn(r.scenes, '1 escena', '{n} escenas'), n: trn(r.shots, '1 plano', '{n} planos')}));
// a film with keys of its own is replaced only on a second, deliberate click (and it can still be recovered)
const filmUsed = () => ANIM.shots.some(s => s.keys.some(K => K.length) || s.cam.length || s.lines.some(l => l.text.trim()));
function scriptState() {
  const go = $('#scGo'); $('#scUndo').disabled = !SC.last || SC.busy;
  if (!SC.busy) go.disabled = !$('#scText').value.trim();
  if ($('#scText').value.trim().length > 12) tourEvent('scriptText');
  go.textContent = tr(SC.armed ? 'Sustituir la película actual' : 'Crear la película');
}
function openScript() {
  tourEvent('script');
  const m = $('#scModal'); m.hidden = false; const ta = $('#scText');
  if (!ta.value.trim()) ta.value = store.get('cdp.script', '') || '';
  SC.armed = false; scriptState();
  $('#scVoice').checked = VOICE.on; $('#scSubs').checked = ANIM.subs; setTimeout(() => ta.focus(), 50);
}
function closeScript() { $('#scModal').hidden = true; }
async function runScript() {
  const text = $('#scText').value; if (!text.trim() || SC.busy) return;
  if (filmUsed() && !SC.armed) { SC.armed = true; scriptState(); $('#scMsg').textContent = tr('Ya hay una película con claves: el guion la sustituirá. Podrás recuperarla con «Recuperar la película anterior».'); return; }
  SC.armed = false; store.set('cdp.script', text); voiceCtx();  // the sound is allowed now, on this click
  VOICE.on = $('#scVoice').checked; store.set('cdp.tts', VOICE.on); ANIM.subs = $('#scSubs').checked; const sb = $('#tlSubs'); if (sb) sb.checked = ANIM.subs; const tv = $('#tlVoice'); if (tv) tv.checked = VOICE.on;
  const go = $('#scGo'); go.disabled = $('#scUndo').disabled = true; $('#scWarn').innerHTML = '';
  try {
    const r = await scriptToFilm(text, {cams: $('#scCams').checked, online: $('#scOnline').checked});
    if (r) {
      if (r.warn.length) { const ul = $('#scWarn'); for (const w of r.warn.slice(0, 30)) { const li = document.createElement('li'); li.textContent = w; ul.appendChild(li); } }
      else setTimeout(closeScript, 900);
      toast(filmReady(r), {undo: undoScript});
      setTimeout(() => { if ($('#scModal').hidden || !r.warn.length) play(true); }, 1000);
    }
  } catch (e) { console.warn('script', e); $('#scMsg').textContent = tr('No se ha podido: {e}', {e: e && e.message || e}); }
  go.disabled = false; scriptState();
}
async function undoScript() {
  if (!SC.last || SC.busy) return; const o = JSON.parse(SC.last); if (ANIM.playing) play(false);
  ANIM.shots = o.shots; ANIM.cur = -1; await enterShot(Math.max(0, o.cur), 0); renderStrip();
  SC.last = null; scriptState(); $('#scMsg').textContent = tr('Película anterior recuperada.'); if ($('#scModal').hidden) toast(tr('Película anterior recuperada.'));
}
function buildScriptUI() {
  $('#tlScript').onclick = openScript; $('#scClose').onclick = closeScript; $('#scModal').onclick = e => { if (e.target.id === 'scModal') closeScript(); };
  $('#scGo').onclick = runScript; $('#scUndo').onclick = undoScript;
  $('#scSample').onclick = () => { $('#scText').value = SC_SAMPLE[LANG.startsWith('es') ? 'es' : 'en']; scriptState(); };
  $('#scText').addEventListener('input', () => { SC.armed = false; scriptState(); });
  $('#scOpen').onclick = () => $('#scFile').click();
  $('#scFile').onchange = async e => { const f = e.target.files[0]; if (f) $('#scText').value = await f.text(); e.target.value = ''; scriptState(); };
  $('#scText').addEventListener('drop', async e => { const f = [...e.dataTransfer.files].find(f => /\.(fountain|txt|spmd|md)$/i.test(f.name)); if (f) { e.preventDefault(); $('#scText').value = await f.text(); scriptState(); } });
  $('#scText').addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runScript(); } });
}
