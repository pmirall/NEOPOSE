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
// how fast someone goes walking, running…: at the pace the clip's own steps take (so it is not played in slow motion
// or fast forward to keep its feet planted), within reason for what the script says
const paceOf = kind => { const c = clipById(SC_CLIP[kind]), v = SC_SPEED[kind] || 1; return c ? clamp(clipSpeed(c), v * .7, v * 1.6) : v; };
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));

/* ---------- places and times ---------- */
const SC_PLACES = [
  // (before the plain studio and workshop: «ESTUDIO DE PINTURA» is the painter's)
  ['laboratorio', 'laboratorio|laboratory|lab|laboratoire|laboratori|labor|laboratorium|clinica|clinic|hospital|consulta medica|quirofano|farmacia|pharmacy|clinique|hopital|krankenhaus|ospedale|investigacion|research center|centro de investigacion|nave espacial|nave|spaceship|starship|space ship|vaisseau|vaisseau spatial|passerelle|raumschiff|astronave|nave estelar|estacion espacial|space station|station spatiale|puente de mando|cockpit|cabina de mando|sala de control|control room|salle de controle|centro de mando'],
  ['atelier', 'estudio de pintura|estudio de arte|estudio del pintor|taller de pintura|taller del pintor|atelier|art studio|painting studio|painters studio|estudi de pintura|galeria de arte|art gallery|studio de peinture|atelie|atelier de pintura|malerstudio|atelier di pittura'],
  ['cocina', 'cocina|kitchen|comedor|dining|cuina|cuisine|cozinha|kuche|cucina|menjador|salle a manger'], ['dormitorio', 'dormitorio|habitacion|cuarto|bedroom|alcoba|dormitori|chambre|quarto|schlafzimmer|camera da letto'],
  ['habitacion', 'salon|living|sala de estar|casa|house|home|piso|apartamento|apartment|flat|hogar|sala|lounge|menjador|maison|casa|wohnzimmer|soggiorno'], ['oficina', 'oficina|office|despacho|trabajo|empresa|bureau|escritorio|ufficio|buro|oficina'],
  ['aula', 'aula|clase|classroom|colegio|escuela|instituto|school|universidad|universitat|ecole|salle de classe|escola|schule|scuola'], ['biblioteca', 'biblioteca|library|libreria|bibliotheque|bibliothek'],
  ['cafeteria', 'cafeteria|cafe|coffee|restaurante|restaurant|cafetaria|caffe|ristorante'], ['taberna', 'taberna|bar|pub|tavern|posada|inn|cantina|bodega|saloon|taverne|kneipe|osteria'],
  ['taller', 'taller|workshop|garaje|garage|fabrica|factory|almacen|warehouse|atelier|oficina mecanica|werkstatt|officina'], ['castillo', 'castillo|castle|palacio|palace|trono|throne|fortaleza|castell|chateau|castelo|schloss|castello'],
  ['teatro', 'teatro|theatre|theater|escenario|stage|auditorio|teatre|theatre|theater|scene vide|palco|buhne|palcoscenico|spotlight|foco'], ['ring', 'ring|boxeo|boxing|gimnasio|gym|cuadrilatero|gimnas|salle de sport|ginasio|turnhalle|palestra'],
  ['dojo', 'dojo|tatami|artes marciales|martial|templo de lucha'], ['callejon', 'callejon|alley|alleyway|carrer estret|ruelle|beco|gasse|vicolo'],
  ['calle', 'calle|street|avenida|avenue|ciudad|city|town|pueblo|barrio|acera|carrer|rue|rua|strasse|via|centro|coche|car|auto|taxi|autobus|bus|furgoneta|van|camion|truck|voiture|carro|wagen|macchina|cotxe|carretera|road|highway|autopista|route|estrada|landstrasse|strada'], ['parque', 'parque|park|jardin|garden|plaza|square|parc|jardi|praca|garten|giardino|piazza'],
  ['bosque', 'bosque|forest|woods|selva|jungle|arboleda|bosc|foret|floresta|wald|bosco|montana|montanas|mountain|mountains|montagne|montanha|berg|berge|gebirge|montagna|muntanya|nieve|snow|neige|neve|schnee|neu|nevado|enneigee'], ['campamento', 'campamento|camp|acampada|hoguera|campfire|tienda de campana|campament|camping|lagerfeuer|accampamento'],
  ['playa', 'playa|beach|muelle|pier|puerto|harbour|harbor|costa|coast|mar|sea|platja|plage|praia|strand|spiaggia|porto'], ['desierto', 'desierto|desert|dunas|desert|deserto|wuste'],
  ['ruinas', 'ruinas|ruins|templo|temple|ruines|ruinas|ruinen|rovine'], ['escalinata', 'escalinata|escaleras|stairs|staircase|escalera|escales|escalier|escadaria|treppe|scalinata'],
  ['azotea', 'azotea|rooftop|rooftops|roof|roofs|tejado|tejados|terraza|terrat|teulades|toit|toits|telhado|telhados|dach|dacher|tetto|tetti'], ['estudio', 'estudio|studio|plato|set de rodaje|estudi'], ['pano_noche', 'ciudad de noche|city at night|noche en la ciudad'],
  ['pano_prado', 'prado|meadow|campo|field|pradera|prat|prairie|wiese|prato'], ['pano_loft', 'loft|nave|ventanales'], ['pano_chimenea', 'chimenea|fireplace|cabana|cabin']
];
const SC_PLACE_PATS = SC_PLACES.map(([id, w]) => [id, scPats(w)]);
const SC_TIMES = [['noche', 'noche|night|nit|nuit|noite|nacht|notte|madrugada|midnight|medianoche|dawn of night'], ['atardecer', 'atardecer|anochecer|sunset|dusk|evening|crepusculo|amanecer|dawn|sunrise|alba|aube|soir|vespre|capvespre|abenddammerung|tramonto|sera'],
  ['dia', 'dia|day|manana|morning|mediodia|noon|afternoon|tarde|jour|matin|dia|tag|morgen|giorno|mattina|continuo|continuous']];
// the place a heading names: the most specific match wins («SALÓN DEL TRONO» is the throne's, not a living room's), and
// an exterior is outside («EXT. CASTILLO» is in front of it, among stones)
const SC_GENERIC = new Set('salon sala casa house home piso apartamento apartment flat hogar centro trabajo empresa edificio building interior exterior lugar place calle street ciudad city town pueblo plaza'.split(' '));
const SC_OUTSIDE = {castillo: 'ruinas', teatro: 'calle', laboratorio: 'calle', oficina: 'calle', habitacion: 'calle', dormitorio: 'calle', cocina: 'parque', aula: 'parque', biblioteca: 'escalinata', cafeteria: 'calle', taberna: 'calle', taller: 'calle', ring: 'calle', dojo: 'ruinas', atelier: 'calle', estudio: 'parque'};
function placeOf(head) {
  const w = scWords(head.place || head.text || ''); let best = null, bs = 0;
  // (two places said: the head noun wins — the one before «de» in «AZOTEA DEL INSTITUTO», the last in «SCHOOL ROOFTOP»;
  const ofAt = w.findIndex(x => /^(de|del|di|du|des|do|da|dos|das|of|della|dello|dels|von|vom|der)$/.test(x)), head1 = i => ofAt >= 0 ? (i < ofAt ? .2 : 0) : (w.length <= 4 ? i : -i) * .01;  // (in a sentence, the first one said)
  for (const [id, pats] of SC_PLACE_PATS) { if (!SCENES[id]) continue;
    for (const pat of pats) { const f = scFind(w, [pat]); if (!f) continue; const sc = pat.length * (pat.length === 1 && pat[0].w && SC_GENERIC.has(pat[0].w) ? .3 : 1) + head1(f.i); if (sc > bs) { bs = sc; best = id; } } }
  if (best && head.int === false && SCENES[best].group === 'in') best = SC_OUTSIDE[best] || 'calle';
  return best;
}
// a place the script does not name (or NEOPOSE has not got): one of the story's world, inside or out
const SC_WORLD_PLACE = {fantasy: ['castillo', 'ruinas'], scifi: ['laboratorio', 'desierto'], western: ['taberna', 'desierto'], horror: ['dormitorio', 'bosque'], superhero: ['oficina', 'azotea'], modern: ['habitacion', 'calle']};
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
const SC_GIRLS = new Set('sue suzy meg liz lynn joan jill jess gwen fran eve ivy joy kay may nell peg pam val viv wendy cindy mandy sandy judy molly holly polly sally kelly daisy maggie annie katie jenny penny abby betsy dolly ellie evie gabby izzy josie lizzie mabel maisie millie olive phoebe rosie ruby sadie tilly winnie yvonne astrid sigrid brigitte colette odette juliette mireille nathalie sylvie aurelie elodie amelie margot lou chantal agnes beatrix carmen ines isabel mercedes nieves consuelo pilar rocio raquel sol luz paz flor mar dulce noor zainab aiko yuki hana sakura mei ling jade hope faith grace rose claire jane kate anne alice beth ruth helen sarah emma olivia emily mary lucy anne ann kate jane alice grace sophie chloe ella amy rachel jessica jennifer elizabeth beth claire helen ruth rose lily isabel isabelle carmen raquel ines pilar mercedes dolores consuelo nieves rocio beatriz isabel abigail charlotte megan hannah zoe judith ester esther miriam noemi belen marta sara laura lucia paula elena nuria clara julia alba eva irene noelia silvia susan karen nancy betty sharon carol margaret dorothy marie louise nicole camille chloe manon ingrid'.split(' '));
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
  if (/\b(nino|nina|nene|nena|chaval|crio|boy|girl|kid|child|baby|bebe|enfant|garcon|fille|menino|menina|kind|junge|madchen|bambino|bambina)\b/.test(k)) return .3;
  if (/\b(abuelo|abuela|anciano|anciana|viejo|vieja|old|grandpa|grandma|grandfather|grandmother|elder|avi|avia|grand-pere|grand-mere|avo|opa|oma|nonno|nonna)\b/.test(k)) return 1.85;
  return null;
}
function castOf(P, text) {
  const out = [], seen = new Set(); let alt = 0; const genre = genreOf(text), lang = scLang(text), names = [...P.names.values()].map(n => ({name: n.name, aka: n.aka}));
  for (const [key, n] of P.names) {
    if (seen.has(key)) continue; seen.add(key);
    const mine = (SAVED_CHARS || []).find(c => scNorm(c.name) === key || scNorm(c.name).split(/\s+/)[0] === key.split(/\s+/)[0]);
    if (mine) { out.push({key, name: n.name, aka: n.aka, body: {...BODY_BASE, ...JSON.parse(JSON.stringify(mine.body)), name: n.name}, preset: mine.preset || null, outfit: mine.outfit || [], mine: true}); continue; }
    // what the action says about them (their introduction, what they wear), not what anyone says
    // (a name that is what they are, said with an article — «Um FANTASMA», «Un HOMBRE», «the GUARD» — is read as words)
    const kw = scNorm(n.name).replace(/\s+\d+$/, ''), kind = (SC_PERSON.has(kw) || SC_SPECIES.some(([, l]) => l.includes(kw)) || SCL_ROLE_PATS.some(([, pats]) => scFind([kw], pats))) &&
      new RegExp(`\\b(un|una|el|la|a|an|the|um|uma|o|ein|eine|einen|der|die|das|il|lo|une|le|l'|two|dos|deux|zwei|due|dois|tres|three|trois|drei|tre|unos|unas|some|des|alguns|einige|degli|dei)\\s+${kw}`).test(scNorm(text));
    const desc = descOf(names.find(c => c.name === n.name), names, P, kind), g0 = genderOf(n.name, text), look = lookFrom(n.name, desc, {lang, g: kind ? null : g0, kind});
    const g = look.body.gender != null ? (look.body.gender < .5 ? 'mujer' : 'hombre') : (kind ? look.gWeak || g0 : g0 || look.gWeak) || (alt++ % 2 ? 'mujer' : 'hombre'), fem = g === 'mujer';
    const age = look.body.age ?? ageOf(n.name), sp = look.body.species || speciesOf(n.name, text);
    const body = {...bodyOf(g), name: n.name}; if (age != null) body.age = age; if (sp) body.species = sp;
    for (const k of ['height', 'muscle', 'weight', 'headStyle', 'kemo', 'feet']) if (look.body[k] !== undefined) body[k] = look.body[k];
    if (look.roles.includes('robot') || look.roles.includes('ghost')) look.hair = '';
    if (look.roles.includes('orc')) { if (look.body.muscle == null) body.muscle = .95; if (look.body.weight == null) body.weight = .72; if (look.body.height == null) body.height = .92; look.hair = look.hair ?? ''; }  // an orc, a troll, an ogre: big
    // an animal's coat in the colour said («una gata blanca», «a brown dog»); a kemonomimi's ears and tail
    if (sp && sp !== 'humano') { const base = coatOf({...BODY_BASE, species: sp}), col = look.furCol || look.tailCol || (body.kemo === 1 ? look.hairCol : null);
      if (base && col) body.coat = body.kemo === 1 ? {...base, c: [col, mixHex(col, '#ffffff', .5), mixHex(col, '#000000', .25)], m: {}, tip: 0} : {...base, c: [col, mixHex(col, '#ffffff', .55), shadeHex(col, .45)]}; }
    // hair (people, and the half-human, who have a human head)
    const h = Math.abs(Math.sin((scWords(n.name)[0].length + out.length * 7.1) * 12.9898) * 43758.5453) % 1, old = (body.age ?? 1) > 1.55, kid = (body.age ?? 1) < .5;
    if (!sp || sp === 'humano' || body.kemo === 1) {
      body.hair = look.hair === '' ? '' : look.cut ? SCL_CUT_STYLE[look.cut][fem ? 0 : 1] : (fem ? ['h-bob01', 'h-long01', 'h-ponytail01', 'h-elvs_daisy_hair', 'h-culturalibre_hair_06', 'h-o4saken_long01'] : ['h-short01', 'h-short02', 'h-short03', 'h-short04', 'h-culturalibre_hair_05', 'h-elvs_grump_hair'])[Math.floor(h * 6)];
      body.hairCol = look.hairCol || (old ? '#8f8a84' : HAIR_COLORS[Math.floor(h * 5)][0]);
    }
    // clothes: what is said, on the role's or the story world's; else everyday clothes, different for each one
    // a beast (a dragon, «a giant wolf», «une bête sauvage») wears what it is said to and nothing else
    const beast = sp && sp !== 'humano' && body.kemo !== 1 && (sp === 'dragon' || /\b(gigante|giant|geant|geante|riesig\w*|salvaje|wild|feral|sauvage|selvatico|feroz|ferocious|feroce|bestia|beast|bete|monstruo|monster|monstre|mostro|criatura|creature|kreatur)\b/.test(scNorm(desc)));
    const outfit = beast ? (look.wear.length ? dressOf({...look, roles: []}, {g, genre: null, h}) : []) :
      dressOf(look, {g, genre, h}) || (OUTFITS[kid ? 'camiseta' : fem ? ['mujer', 'mujer2', 'falda', 'verano'][Math.floor(h * 4)] : ['casual', 'casual2', 'camiseta', 'jersey'][Math.floor(h * 4)]][1]).map(x => ({...x}));
    out.push({key, name: n.name, aka: n.aka, body, preset: g, outfit, desc, genre});
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
// the pronouns that stand for a person in each language (not the articles that look like them: Spanish «el», Italian «il»)
const SC_PRON_BY = {es: ['ella', 'ellos', 'ellas'], en: ['he', 'she', 'they', 'him', 'her'], fr: ['il', 'elle', 'ils', 'elles'], ca: ['ell', 'ella', 'ells', 'elles'], pt: ['ele', 'ela', 'eles', 'elas'], de: ['er', 'sie'], it: ['lui', 'lei', 'loro', 'egli']};
/* ---------- what the place does, and the camera, in the action ----------
   A sentence about no one is the place or the camera: «Rayos violetas atraviesan el cielo» flashes violet light,
   «Una explosión sacude el salón» is a flash, the camera shaken and everyone ducking, «La luna roja ilumina…» tints
   the night red, «Rain hammers the street» darkens it; «La cámara se eleva hacia el cielo» is a crane up. */
const SC_FX = [
  ['blast', 'explosion|explosiones|explota*|estalla*|detona*|revienta|deflagracion|explode*|explosion*|blast|blows up|kaboom|boom|explose*|detonation|explosao|explodiert|esplode|esplosione|esclata|explosio'],
  ['lightning', 'rayo|rayos|relampago*|trueno*|tormenta|lightning|thunder*|storm|eclair*|tonnerre|orage|trovao|trovoada|blitz*|donner|gewitter|fulmine|fulmini|tuono|lampo|llamp*|tempesta|tempestad'],
  ['fire', 'fuego|llamas|incendio|hoguera|arde|ardiendo|en llamas|fire|flames|burning|blaze|ablaze|feu|flammes|brule|incendie|fogo|chamas|incendio|feuer|flammen|brennt|fuoco|fiamme|brucia|foc|flames'],
  ['smoke', 'humo|niebla|neblina|bruma|polvareda|smoke|fog|mist|haze|dust cloud|fumee|brouillard|brume|fumaca|nevoeiro|rauch|nebel|dunst|fumo|nebbia|foschia|fum|boira'],
  ['rain', 'lluvia|llueve|lloviendo|lluvios*|aguacero|tormenta de lluvia|rain|raining|rainy|downpour|pluvieu*|chuvos*|regnerisch*|piovos*|plujos*|pluie|pleut|chuva|chove|regen|regnet|pioggia|piove|pluja|plou'],
  ['moon', 'luna|moon|lune|lua|mond|lluna|luna llena|full moon'], ['sun', 'sol|sun|soleil|sonne|sole'],
  ['lights', 'las luces|luces de emergencia|luces rojas|luz roja|the lights|emergency lights|red lights|warning lights|les lumieres|as luzes|die lichter|le luci|els llums|alarma|alarm|alarme|sirena|sirenas|siren|sirens|neon|neones|neons|leuchtreklame']
];
const SC_FX_PATS = SC_FX.map(([k, w]) => [k, scPats(w)]);
function fxOf(cl, skip) {
  const w = scWords(cl).filter(x => !skip.has(x)), out = [];
  // (the colour said of it: right after it, or right before it in English and German — «explosión azul», «red moon»)
  for (const [k, pats] of SC_FX_PATS) { const f = scFind(w, pats); if (!f) continue; const near = [w[f.j + 1], w[f.j + 2], w[f.i - 1]].map(x => SCL_COLOR_OF.get(x)).find(Boolean); out.push({fx: k, col: near || null}); }
  return out;
}
const SC_CAM_W = new Set('camara camera kamera camaras cameras'.split(' '));
const SC_CAM_MOVES = [['rise', 'eleva|sube|asciende|se alza|rises|cranes up|crane up|pulls up and|lifts|moves up|tilts up|eleve|monte|sobe|steigt|hebt sich|si alza|sale verso|puja'], ['descend', 'baja|desciende|cranes down|descends|tilts down|descend|desce|senkt sich|scende|baixa'],
  ['push', 'se acerca|acerca|avanza|moves in|pushes in|push in|zooms in|dollies in|approche|avance|aproxima|nahert|fahrt heran|si avvicina|acosta'], ['pull', 'se aleja|aleja|retrocede|pulls back|pulls out|pull back|zooms out|dollies out|recule|eloigne|afasta|entfernt sich|fahrt zuruck|si allontana|allunya'],
  ['orbit', 'gira alrededor|da vueltas alrededor|rodea|circles|orbits|circle around|tourne autour|gira em torno|kreist|gira intorno|gira al voltant'], ['track', 'sigue|sigue a|follows|suit|segue|folgt|segueix']];
const SC_CAM_MOVE_PATS = SC_CAM_MOVES.map(([k, w]) => [k, scPats(w)]);
function camOf(cl) {
  const w = scWords(cl.replace(SC_SLOW_RX, ' ')); if (!w.slice(0, 4).some(x => SC_CAM_W.has(x))) return null;
  for (const [k, pats] of SC_CAM_MOVE_PATS) if (scFind(w, pats)) return {move: k};
  // (the camera doing something not a move — «la cámara muestra…» — is just a note; looking up to the sky is a crane up)
  return {move: w.some(x => /^(cielo|sky|ciel|ceu|himmel|cel|cielo|arriba|upwards|up|vers le haut|oben|alto|amunt)$/.test(x)) ? 'rise' : null};
}
const SC_SHOT_RX = /\b(extreme |very |medium |big )?(wide|close|closer|medium|long|full|establishing|tracking|two|aerial|overhead|reverse|insert|low[- ]angle|high[- ]angle|master|cowboy|over[- ]the[- ]shoulder|pov|dutch|crane|drone|group|single|split) shot(s)?( of| on| from)?\b|\bclose[- ]?ups?( of| on)?\b/i;
// «A cámara lenta, los dos se separan»: the speed, and what happens
const SC_SLOW_RX = /(^|[\s,(])(a |en |in |au |em |al |in )?(c[aá]mara lenta|slow[- ]?motion|slow-?mo|super slow|ralent[ií]|c[aâ]mera lenta|zeitlupe|rallentatore|c[aá]mara r[aá]pida|fast[- ]motion|acc[eé]l[eé]r[eé])\b[,.:]?/i;
const SC_MAGIC = new Set('esfera bola orbe rayo rayos energia fuego llamas hechizo magia magico magica poder ataque dragon ki laser energy blast beam fireball orb bolt magic power spell flames energie boule sort foudre fogo feitico poder feuerball strahl magie zauber energia palla raggio incantesimo potere encanteri'.split(' '));
const SC_CHAINS = new Set('cadenas cadena cuerdas cuerda grilletes esposas chains chain ropes rope shackles handcuffs chaines chaine cordes correntes corrente cordas algemas ketten kette seile fesseln catene catena corde manette cadenes'.split(' '));
const SC_FROM = new Set('de del desde from out du des da do dos aus dal dalla dallo dai dels'.split(' '));
const SC_THING_ART = new Set('the el la los las le les der die das il lo gli o os as a un una une um uma ein eine'.split(' '));
const SC_LINK = 'y|e|and|then|luego|despues|entonces|et|puis|und|dann|poi|i|tambien|also'.split('|');
const SC_ALL = 'todos|todas|ambos|ambas|los dos|las dos|everyone|everybody|both|all|tous|toutes|tots|totes|todos|alle|beide|tutti|entrambi'.split('|');
const SC_TOGETHER = 'mientras|a la vez|al mismo tiempo|while|meanwhile|at the same time|pendant que|alors que|enquanto|wahrend|mentre'.split('|');
// a sentence into clauses: "se levanta y sale", "he stands, then leaves"
const scClauses = s => s.split(/(?<=[.;!?])\s+|,\s*(?:y |and |then |luego |despues |entonces |et |e |und |poi )|\s+(?:y luego|y despues|y entonces|and then|then|luego|despues|et puis|e depois|und dann|e poi)\s+|\s+y\s+(?=(?:se\s+)?[a-z]+(?:a|e|an|en)\b)|\s+and\s+(?=[a-z]+s\b)/i).map(x => x && x.trim()).filter(Boolean);
function readAction(text, cast, lang, ctx) {
  const out = [], names = castKeys(cast), keys = new Set(names.map(n => n[0])), prons = SC_PRON_BY[lang] || SC_PRON_BY.en;
  for (let cl of scClauses(text)) {
    // a shot named in the action («Wide shot of a rainy street», «Close-up on her hand»): how it is seen, not a gunshot
    const sh = cl.match(SC_SHOT_RX); if (sh) { const sd = shotDirection(sh[0]); if (sd) out.push({dir: sd, text: cl}); cl = cl.replace(SC_SHOT_RX, ' ').trim(); if (scWords(cl).length < 2) continue; }
    // the speed first («A cámara lenta, …»), then the rest of the clause
    const sl = cl.match(SC_SLOW_RX); if (sl) { out.push({dir: {speed: /r[aá]pida|fast|acc[eé]l/i.test(sl[3]) ? 2 : .4}, text: cl}); cl = cl.replace(SC_SLOW_RX, '$1').trim(); if (scWords(cl).length < 2) continue; }
    const w = scWords(cl);
    // the camera's own sentence
    const cam = camOf(cl); if (cam) { out.push({cam, text: cl}); continue; }
    // who: names in the clause (in order), "everyone", or a pronoun for the last one spoken of
    const who = []; for (let i = 0; i < w.length; i++) for (const n of names.filter(x => x[0] === w[i])) if (!who.some(o => o.c === n[1])) who.push({c: n[1], at: i});  // («the THUGS»: all of them)
    const all = w.some((x, i) => SC_ALL.includes(x) || SC_ALL.includes(x + ' ' + w[i + 1]));
    // what: every intention the clause holds, in the order written
    const found = [];
    for (const [id, pats] of verbPats(lang)) { let from = 0, f; while ((f = scFind(w, pats, from))) { found.push({id, i: f.i, j: f.j}); from = f.j + 1; } }
    found.sort((a, b) => a.i - b.i);
    const kept = found.filter((f, k) => !found.some((g, l) => l !== k && g.i <= f.i && g.j >= f.j && (g.j - g.i > f.j - f.i)));  // the longer phrase wins ("se sienta" over "sienta", "walks to" over "walks")
    const neg = i => w.slice(Math.max(0, i - 2), i).some(x => ['no', 'not', "doesn't", 'never', 'nunca', 'ne', 'pas', 'nao', 'nicht', 'non'].includes(x));
    const verbs = kept.filter(v => !neg(v.i));
    // what the place does (an explosion, lightning, fire, rain, a red moon), unless it is what someone throws
    const fx = fxOf(cl, keys).filter(f => !(['blast', 'fire'].includes(f.fx) && verbs.some(v => ['shoot', 'spell', 'throw', 'aim', 'raise', 'unleash'].includes(v.id))));
    if (fx.length) out.push({fx, text: cl});
    // magic: firing or letting loose a sphere, a ray, energy, fire, a dragon is a spell, not a gun
    const magic = w.some(x => SC_MAGIC.has(x));
    for (const v of verbs) if ((magic && ['shoot', 'throw', 'free'].includes(v.id) && !w.some(x => SC_CHAINS.has(x)) && !(v.id === 'free' && who.some(o => o.at > v.i))) || v.id === 'unleash') v.id = 'spell';
    // coming out of somewhere is coming on, outdoors («sale de la oficina» into the street)
    for (const v of verbs) if (v.id === 'exit' && ctx.int === false && SC_FROM.has(w[v.j + 1])) v.id = 'enter';
    if (!verbs.length && kept.length) continue;  // "Ana no se sienta": nothing happens, and nothing to warn about
    // running with a way in or out of the scene: a fast entrance or exit ("sale corriendo", "runs out")
    for (const m of verbs.filter(v => ['enter', 'exit', 'approach'].includes(v.id))) { const r = verbs.find(v => v.id === 'run' && Math.abs(v.i - m.i) <= 3); if (r) { m.fast = true; verbs.splice(verbs.indexOf(r), 1); } }
    if (!verbs.length) {
      const emo = emotionOf(cl); if (emo && (who.length || ctx.last != null)) { out.push({who: who.length ? who.map(o => o.c) : [ctx.last], id: 'emo', e: emo, text: cl}); continue; }
      // (a sentence about nobody describes the place; one that introduces someone — «KAEL, un joven…» — describes them)
      const intro = who.length && /[,(]/.test(cl) && who[0].at <= 2;
      if (who.length) { ctx.last = who[0].c; }  // (whoever is introduced is who the rest of the sentence is about: «…, está atrapada»)
      if (!fx.length && !intro && !shotDirection(cl) && w.length > 2 && (who.length || w.some(x => prons.includes(x)))) out.push({unknown: cl});
      continue;
    }
    let prevSubj = null, prevObj = null;
    verbs.forEach((v, vi) => {
      const from = vi ? verbs[vi - 1].j + 1 : 0, to = vi < verbs.length - 1 ? verbs[vi + 1].i : w.length;
      // the subject: names just before the verb (since the last verb), else a pronoun told by its gender, else the one before
      let subj = who.filter(o => o.at >= from && o.at < v.i && !(prevObj != null && o.c === prevObj && o.at <= from + 1)).map(o => o.c);  // "mira a Ana y sonríe": Ana is looked at, Luis smiles
      if (!subj.length) { const pr = w.slice(from, v.i).find(x => SC_PRON.includes(x)); if (pr) subj = [pronounTo(pr, cast, ctx, prevSubj)]; }
      if (!subj.length && all) subj = cast.map((_, i) => i).filter(i => ctx.present.includes(i));
      // something appearing or going («en la pantalla aparece una imagen») is not somebody coming in or out
      if (!subj.length && !prevSubj && ['enter', 'exit'].includes(v.id) && w.slice(from, v.i).filter(x => !SC_LINK.includes(x)).length >= 2) return;
      // a thing doing it («The cake flies», «La puerta se abre», «Le vase tombe»): an article and a noun before the verb, no one named
      if (!subj.length && SC_THING_ART.has(w[from]) && v.i - from >= 2 && v.i - from <= 4 && !all) return;
      if (!subj.length) subj = prevSubj || (ctx.last != null ? [ctx.last] : [ctx.present[0] ?? 0]);
      // the object: the first name after the verb (before the next one), or "him / her / lo / la / le" (people only for
      // what is done with things: «mira los resultados» looks at the results, not at «los»)
      const spec = VERBS[v.id], things = ['study', 'paint', 'show', 'point', 'pick', 'touch', 'throw'].includes(v.id);
      let target = who.filter(o => o.at > v.j - (v.j - v.i) && o.at > v.i && o.at < to).map(o => o.c)[0];
      if (target == null && !things) { const ob = w.slice(v.i, Math.min(to, v.j + 4)).find(x => SC_OBJ.includes(x)); if (ob) target = pronounTo(ob, cast, ctx, subj, true); }
      if (target != null && subj.includes(target)) target = undefined;
      // a spell or a shot at no one named: at the one they face (the other one in the scene)
      if (target == null && ['spell', 'shoot', 'throw', 'free', 'tie', 'give', 'follow', 'embrace'].includes(v.id)) { const others = ctx.present.filter(i => !subj.includes(i)); target = v.id === 'free' ? others.find(i => ctx.bound && ctx.bound.has(i)) ?? (ctx.lastOther != null && others.includes(ctx.lastOther) ? ctx.lastOther : others[0]) : ctx.lastOther != null && others.includes(ctx.lastOther) ? ctx.lastOther : others[0]; }
      const last = out[out.length - 1]; if (last && last.id === v.id && last.who.join() === subj.join() && last.text === cl) return;  // said twice in one go
      if (spec.t === 'none') { prevSubj = subj; return; }
      if (spec.t === 'state') { (ctx.bound = ctx.bound || new Set()); for (const c of subj) ctx.bound.add(c); }
      if (spec.t === 'free' && target != null && ctx.bound) ctx.bound.delete(target);
      if (target == null && ['approach', 'face', 'group'].includes(spec.t)) { const others = ctx.present.filter(i => !subj.includes(i)); target = ctx.lastOther != null && !subj.includes(ctx.lastOther) && ctx.present.includes(ctx.lastOther) ? ctx.lastOther : others[0]; }
      out.push({who: subj, id: v.id, target, together: SC_TOGETHER.some(t => scNorm(cl).includes(t)), text: cl, fast: v.fast || spec.fast || /corr|run|rapid|deprisa|quick|fast/.test(scNorm(w.slice(from, to).join(' ')))});
      ctx.last = subj[subj.length - 1]; prevSubj = subj; prevObj = target; if (target != null) ctx.lastOther = target;
    });
  }
  return out;
}

/* ---------- one scene: staging, actions, timing ---------- */
const SC_SLOTS = {1: [[0, 0, 0]], 2: [[-.62, 0, 62], [.62, 0, -62]], 3: [[-.85, .1, 55], [.85, .1, -55], [0, -.75, 0]], 4: [[-1.2, .15, 50], [-.4, -.35, 20], [.4, -.35, -20], [1.2, .15, -50]]};
function directScene(sc, idx, cast, lang, o) {
  const present = [], add = i => { if (i != null && !present.includes(i) && present.length < MAX_CHARS) present.push(i); };
  const ctx = {last: null, lastOther: null, present, int: sc.head.int};
  // who is in the scene: whoever speaks or is named, in order of appearance (four at most)
  for (const b of sc.beats) { if (b.who) add(cast.findIndex(c => c.name === b.who)); if (b.k === 'act' || b.k === 'shot') for (const i of scWho(b.text, cast)) add(i); }
  // nobody named, but «ambos», «everyone», «they»: those of the scene before (still standing); nobody at all: the place alone
  if (!present.length && (o.prev || []).length && sc.beats.some(b => b.k === 'act' && scWords(b.text).some((x, i, A) => SC_ALL.includes(x) || SC_ALL.includes(x + ' ' + A[i + 1]) || ['ellos', 'ellas', 'they', 'ils', 'elles', 'eles', 'elas', 'sie', 'loro'].includes(x)))) for (const i of o.prev) add(i);
  present.sort((a, b) => a - b);  // always in the cast's order: from scene to scene each one keeps their figure (no rebuilding at the cut)
  const local = ci => present.indexOf(ci), N = present.length;
  // where each one starts: in place, or off to one side if their first action is to come in
  const firstAct = new Map(), plans = [];
  for (const b of sc.beats) if (b.k === 'act' || b.k === 'paren') {
    const speaker = b.who ? cast.findIndex(c => c.name === b.who) : null; if (speaker != null && speaker >= 0) ctx.last = speaker;
    const acts = readAction(b.text, cast, lang, ctx); b.acts = acts;
    for (const a of acts) if (a.who) for (const c of a.who) if (!firstAct.has(c)) firstAct.set(c, a.id);
  }
  const slot = SC_SLOTS[Math.min(4, N)] || SC_SLOTS[1];
  const st = present.map((ci, i) => { const [x, z, yawDeg] = slot[i] || [i * .9 - 1, 0, 0], enter = firstAct.get(ci) === 'enter', land = firstAct.get(ci) === 'land';
    const x0 = enter ? (x < 0 || (x === 0 && i % 2) ? -4.5 : 4.5) : x, z0 = enter ? z + .3 : z, y0 = enter ? (x0 < 0 ? Math.PI / 2 : -Math.PI / 2) : yawDeg * DEG;
    return {ci, home: {x, z, yaw: yawDeg * DEG}, x: x0, z: z0, yaw: y0, mode: enter || land ? 'off' : 'stand', landing: land, initX: x0, initZ: z0, initYaw: y0, initMode: enter || land ? 'off' : 'stand', segs: [], expr: [{t: 0, e: null}], gaze: []}; });
  const S = ci => st[local(ci)];
  // (a state held — kneeling in chains — lasts until the next thing that person does)
  const seg = (s, t0, t1, kind, d) => { for (const g of s.segs) if (g.open && t0 >= g.t0) { g.t1 = Math.max(g.t0 + .1, t0); g.open = false; } s.segs.push({t0, t1, kind, ...d}); };
  const fxs = []; let slowK = 1;
  // when someone is free to do the next thing (a state held — kneeling in chains — does not keep them busy)
  const endOf = s => s.segs.reduce((a, g) => Math.max(a, g.open || g.kind === 'gone' && g.t1 > 1e5 ? g.t0 + .3 : g.t1), 0);
  const lines = [], events = [], chairs = [], warn = [];
  let T = 0;
  const free = s => Math.max(T, endOf(s));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const walkTo = (s, x, z, t0, kind = 'walk', stopAt = 0) => {
    const dx = x - s.x, dz = z - s.z, L = Math.hypot(dx, dz) - stopAt; if (L < .15) return t0;
    const yaw = Math.atan2(dx, dz), v = paceOf(kind) * (chars[local(s.ci)] ? chars[local(s.ci)].size : 1) * slowK, dur = L / v, ex = s.x + dx / Math.hypot(dx, dz) * L, ez = s.z + dz / Math.hypot(dx, dz) * L;
    seg(s, t0, t0 + dur, 'walk', {clip: SC_CLIP[kind], from: {x: s.x, z: s.z}, to: {x: ex, z: ez}, yaw}); s.x = ex; s.z = ez; s.yaw = yaw; if (s.mode === 'off') s.mode = 'stand';
    events.push({t0, t1: t0 + dur, kind: 'move', c: s.ci, shot: takeShot()}); return t0 + dur;
  };
  const faceTo = (s, b, t) => { if (!b) return; s.yaw = Math.atan2(b.x - s.x, b.z - s.z); seg(s, t, t + .45, 'turn', {yaw: s.yaw}); };
  const intensity = (b) => { let k = .25; if (/!/.test(b.text)) k += .25; if (/!{2,}|[A-ZÁÉÍÓÚÑ]{4,}/.test(b.text)) k += .25; if (b.emo && !['sonrisa', 'concentrado'].includes(b.emo)) k += .3; return Math.min(1, k); };
  let pendingShot = null; const takeShot = () => { const x = pendingShot; pendingShot = null; return x; };
  for (const b of sc.beats) {
    if (b.k === 'shot') { pendingShot = {dir: b.dir, who: scWho(b.text, cast).filter(i => present.includes(i)), t: T}; continue; }
    if (b.k === 'trans') { const tw = scNorm(b.text);
      if (/fade in|fundido de entrada|desde negro|fondu d'ouverture|abblende auf|aufblende|dissolvenza in apertura|fos d'entrada/.test(tw)) fxs.push({t: T, fx: 'fadein'});
      else if (/fade out|fade to black|fundido a negro|fundido en negro|fundido|fondu au noir|fondu|abblende|dissolvenza|fos a negre|escurecimento/.test(tw)) fxs.push({t: null, fx: 'fadeout'});
      continue; }
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
    // action, and actions inside a speech (in slow motion if the camera said so just before)
    slowK = pendingShot && pendingShot.dir && pendingShot.dir.speed ? pendingShot.dir.speed : 1;
    for (const a of b.acts || []) {
      if (a.unknown) {
        // what a camera direction shows («PRIMER PLANO: la mano de Billy junto al revólver»): the shot's subject, not an action
        if (pendingShot && pendingShot.t === T) { const who = scWho(a.unknown, cast).filter(i => present.includes(i)); if (who.length) pendingShot.who = who;
          if (/\b(mano|manos|hand|hands|main|mains|mao|maos|hande|mani|ma|mans)\b/.test(scNorm(a.unknown))) pendingShot.dir = {...pendingShot.dir, size: 'ecu', insert: true}; continue; }
        warn.push(tr('No he entendido: «{x}»', {x: a.unknown})); continue;
      }
      if (a.cam) { pendingShot = {dir: {...(pendingShot && pendingShot.dir || {}), move: a.cam.move}, who: [], t: T}; continue; }
      if (a.dir) { pendingShot = {dir: {...(pendingShot && pendingShot.dir || {}), ...a.dir}, who: [], t: T}; slowK = a.dir.speed || slowK; continue; }
      if (a.fx) {
        for (const f of a.fx) {
          fxs.push({t: T, fx: f.fx, col: f.col});
          // a blast: everyone free at that moment ducks, the camera shakes (see fxApply), a wide shot
          if (f.fx === 'blast') { for (const ci of present) { const s = S(ci); if (s.mode !== 'stand' || (endOf(s) > T + .05)) continue; seg(s, T + .05, T + 1.2, 'pose', {pose: 'cubrirse', at: {x: s.x, z: s.z}, yaw: s.yaw}); s.expr.push({t: T, e: 'miedo'}); }
            events.push({t0: T, t1: T + 1.6, kind: 'fx', fx: 'blast', c: present[0], shot: takeShot()}); T += 1.3; }
        }
        continue;
      }
      const start = a.together ? Math.max(0, T - 1) : T; let end = start;
      for (const ci of a.who) {
        if (!present.includes(ci)) continue; const s = S(ci), t0 = Math.max(start, endOf(s)), spec = VERBS[a.id] || {}, tgt = a.target != null && present.includes(a.target) ? S(a.target) : null;
        let t1 = t0;
        if (a.id === 'emo') { s.expr.push({t: t0, e: a.e}); continue; }
        switch (spec.t) {
          case 'enter': s.onAt = t0; t1 = walkTo(s, s.home.x, s.home.z, t0, a.fast ? 'run' : 'walk'); if (Math.abs(wrapA(s.home.yaw - s.yaw)) > .2) { s.yaw = s.home.yaw; seg(s, t1, t1 + .55, 'turn', {yaw: s.yaw}); t1 += .55; } break;  // there, they turn to the others
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
          case 'spin': { const y0 = s.yaw; s.yaw = wrapA(y0 + Math.PI * .999); seg(s, t0, t0 + .38, 'turn', {yaw: s.yaw}); s.yaw = y0; seg(s, t0 + .38, t0 + .76, 'turn', {yaw: y0}); t1 = t0 + .76; break; }
          case 'face': if (tgt) { faceTo(s, tgt, t0); s.gaze.push({t0, t1: t0 + 3, c: tgt.ci}); } t1 = t0 + .6; break;
          case 'clip': case 'loop': { if (s.mode === 'sit' && !/sit/i.test(spec.c[0])) { /* gestures seated: the upper body only would be ideal; stand them up first */ const c = clipById(SC_CLIP.stand); seg(s, t0, t0 + c.len, 'clip', {clip: c.id, at: {x: s.sx ?? s.x, z: s.sz ?? s.z}, yaw: s.yaw, root: true, seated: true}); s.mode = 'stand'; }
            const t00 = Math.max(t0, endOf(s));
            if (tgt) { if (['punch', 'kick', 'sword', 'push', 'shoot', 'aim', 'throw', 'spell'].includes(a.id) && dist(s, tgt) > 1.4 && ['punch', 'kick', 'push'].includes(a.id)) { const tt = walkTo(s, tgt.x, tgt.z, t00, 'walk', .75); faceTo(s, tgt, tt); } else faceTo(s, tgt, t00); }
            const tA = Math.max(t00, endOf(s)); if (a.id === 'wake') s.expr.push({t: tA, e: 'sorpresa'});
            const ids = spec.c.filter(clipById); if (!ids.length) { warn.push(tr('No tengo animación para «{x}»', {x: a.text})); break; }
            const c = clipById(ids[(ctx.n = (ctx.n || 0) + 1) % ids.length]), dur = (spec.t === 'loop' ? (spec.dur || 2.5) : c.len * (spec.loops || 1)) / slowK;
            seg(s, tA, tA + dur, 'clip', {clip: c.id, at: {x: s.x, z: s.z}, yaw: s.yaw, loop: spec.t === 'loop' || (spec.loops || 1) > 1, root: !c.loop && c.id !== 'np-saltar', speed: slowK});
            if (!c.loop && c.id !== 'np-saltar') { const e2 = c.frames[c.frames.length - 1].p, s0 = c.frames[0].p, k = chars[local(ci)] ? chars[local(ci)].rootY / clipRig().rootY : 1, dd = new V3(e2[0] - s0[0], 0, e2[2] - s0[2]).multiplyScalar(k).applyAxisAngle(new V3(0, 1, 0), s.yaw); s.x += dd.x; s.z += dd.z; }
            if (spec.down) s.mode = 'down';
            t1 = tA + dur; events.push({shot: takeShot(), t0: tA, t1, kind: ['punch', 'kick', 'sword', 'shoot', 'hurt', 'knock', 'block', 'dodge', 'throw', 'spell'].includes(a.id) ? 'fight' : ['jump', 'climb', 'roll', 'fall'].includes(a.id) ? 'big' : 'gesture', c: ci, target: a.target, act: a.id});
            // the one hit reacts
            if (tgt && ['punch', 'kick', 'sword', 'shoot', 'throw', 'spell'].includes(a.id) && !(b.acts || []).some(x => x.who && x.who.includes(tgt.ci) && ['hurt', 'knock', 'block', 'dodge', 'fall'].includes(x.id))) {
              const hc = clipById(a.id === 'shoot' ? 'ual1-Death01' : 'ual1-Hit_Chest'); if (hc) { const th = tA + Math.min(dur * .45, .5); seg(tgt, Math.max(th, endOf(tgt)), th + hc.len, 'clip', {clip: hc.id, at: {x: tgt.x, z: tgt.z}, yaw: tgt.yaw}); if (a.id === 'shoot') tgt.mode = 'down'; tgt.expr.push({t: th, e: 'miedo'}); } }
            break; }
          case 'pose': { if (tgt) faceTo(s, tgt, t0); const tA = Math.max(t0, endOf(s)), pose = a.id === 'raise' && /(desenfund|pistol|revolver|gun|colt|rifle|fusil|escopeta|arma de fuego|pistole|fucile|arme a feu)/.test(scNorm(a.text)) ? 'apuntar' : spec.pose; seg(s, tA, tA + (spec.dur || 1.2) + .3, 'pose', {pose, at: {x: s.x, z: s.z}, yaw: s.yaw}); t1 = tA + (spec.dur || 1.2) + .3;
            events.push({t0: tA, t1, kind: a.id === 'kick' || a.id === 'block' || a.id === 'dodge' ? 'fight' : 'gesture', c: ci, shot: takeShot(), act: a.id}); break; }
          case 'group': { if (!tgt) { warn.push(tr('«{x}»: ¿con quién?', {x: a.text})); break; }
            let tA = t0; if (dist(s, tgt) > 1.3) tA = walkTo(s, tgt.x, tgt.z, t0, 'walk', .9);
            const tB = Math.max(tA, endOf(tgt)), d = spec.dur || 1.6;
            const mid = {x: (s.x + tgt.x) / 2, z: (s.z + tgt.z) / 2}, yaw = Math.atan2(tgt.x - s.x, tgt.z - s.z);
            seg(s, tB, tB + d + .4, 'group', {g: spec.g, who: 0, mid, yaw}); seg(tgt, tB, tB + d + .4, 'group', {g: spec.g, who: 1, mid, yaw});
            events.push({t0: tB, t1: tB + d + .4, kind: 'group', c: ci, target: tgt.ci, shot: takeShot()}); t1 = tB + d + .4; break; }
          case 'expr': s.expr.push({t: t0, e: spec.e}); t1 = t0; break;
          // a state held until the next thing they do (or until someone frees them)
          case 'state': if (spec.sleep) s.expr.push({t: t0, e: 'dormido'}); if (spec.sleep && s.mode === 'sit') { t1 = t0 + .6; break; }  // (asleep in a chair: the eyes shut, still seated)
            seg(s, t0, 1e6, 'pose', {pose: spec.pose, at: {x: s.x, z: s.z}, yaw: s.yaw, open: true}); if (spec.pose === 'cautivo') s.expr.push({t: t0, e: 'miedo'}); t1 = t0 + .6; break;
          case 'free': { if (tgt) { t1 = walkTo(s, tgt.x, tgt.z, t0, a.fast ? 'run' : 'walk', .8); faceTo(s, tgt, t1); t1 += .45; }
            const armed = (cast[ci].outfit || []).some(g => g.id === 'c428'), c = clipById(armed ? 'ual1-Sword_Attack' : 'ual1-Interact') || clipById('ual1-Interact');
            if (c) { seg(s, t1, t1 + c.len, 'clip', {clip: c.id, at: {x: s.x, z: s.z}, yaw: s.yaw}); t1 += c.len; }
            if (tgt) { for (const g of tgt.segs) if (g.open) { g.t1 = Math.max(g.t0 + .1, t1 - .2); g.open = false; } tgt.expr.push({t: t1, e: 'sonrisa'}); events.push({t0, t1, kind: 'gesture', c: ci, target: tgt.ci, shot: takeShot(), act: 'free'}); }
            break; }
          case 'vanish': fxs.push({t: t0 + .1, fx: 'blast', col: '#c9b9a0', k: .35}); seg(s, t0 + .35, 1e6, 'gone', {at: {x: s.x, z: s.z}, yaw: s.yaw}); s.mode = 'off'; s.offAt = t0 + .35; t1 = t0 + .8; break;
          case 'fly': { const c = clipById('np-saltar'); const tA = Math.max(t0, endOf(s)); if (c) seg(s, tA, tA + c.len * .55, 'clip', {clip: c.id, at: {x: s.x, z: s.z}, yaw: s.yaw}); t1 = tA + (c ? c.len * .55 : .5);
            seg(s, t1, 1e6, 'gone', {at: {x: s.x, z: s.z}, yaw: s.yaw, rise: true}); s.mode = 'off'; s.offAt = t1 + 1.2; t1 += 1.6; break; }
          case 'land': { if (s.landing) { s.landing = false; seg(s, 0, t0, 'gone', {at: {x: s.home.x, z: s.home.z}, yaw: s.home.yaw}); s.x = s.home.x; s.z = s.home.z; s.yaw = s.home.yaw; s.onAt = t0; }
            const c = clipById('np-saltar'); s.mode = 'stand'; if (c) { seg(s, t0, t0 + c.len, 'clip', {clip: c.id, at: {x: s.x, z: s.z}, yaw: s.yaw}); t1 = t0 + c.len; } events.push({t0, t1, kind: 'big', c: ci, shot: takeShot(), act: 'land'}); break; }
          case 'apart': { const os = present.filter(o => o !== ci && S(o).mode !== 'off').map(S); if (!os.length) break;
            const cx = os.reduce((a, o) => a + o.x, 0) / os.length, cz = os.reduce((a, o) => a + o.z, 0) / os.length, d = Math.hypot(s.x - cx, s.z - cz) || 1;
            t1 = walkTo(s, s.x + (s.x - cx) / d * 1.4, s.z + (s.z - cz) / d * 1.4, t0, a.fast ? 'run' : 'walk'); faceTo(s, os[0], t1); t1 += .4; break; }
          case 'float': case 'follow': if (tgt) t1 = walkTo(s, tgt.x, tgt.z, t0, a.fast || /corr|run|chase|persig|poursui|verfolg|insegu|rennt/.test(scNorm(a.text)) ? 'run' : 'walk', 1.3); else t1 = walkTo(s, s.x + Math.sin(s.yaw) * 2.4, s.z + Math.cos(s.yaw) * 2.4, t0); break;
          case 'tie': if (tgt) { t1 = walkTo(s, tgt.x, tgt.z, t0, 'walk', .75); faceTo(s, tgt, t1); const c = clipById('ual1-Interact'); if (c) { seg(s, t1 + .4, t1 + .4 + c.len, 'clip', {clip: c.id, at: {x: s.x, z: s.z}, yaw: s.yaw}); t1 += .4 + c.len; }
            seg(tgt, Math.max(t1 - .3, endOf(tgt)), 1e6, 'pose', {pose: 'cautivo', at: {x: tgt.x, z: tgt.z}, yaw: tgt.yaw, open: true}); } break;
          case 'give': if (tgt) { t1 = walkTo(s, tgt.x, tgt.z, t0, 'walk', .8); faceTo(s, tgt, t1); seg(s, t1 + .4, t1 + 1.6, 'pose', {pose: 'senalar', at: {x: s.x, z: s.z}, yaw: s.yaw}); t1 += 1.6; events.push({t0, t1, kind: 'gesture', c: ci, target: tgt.ci, shot: takeShot(), act: 'show'}); } break;
          case 'facing': for (const o of present) if (o !== ci) { const so = S(o); faceTo(s, so, t0); s.gaze.push({t0, t1: t0 + 3, c: o}); } t1 = t0 + 1.8; break;
        }
        end = Math.max(end, t1);
      }
      if (!a.together || end > T) T = Math.max(T, end);
    }
  }
  // the camera moving at the end («La cámara se eleva hacia el cielo»): a last shot of its own
  if (pendingShot && pendingShot.dir && pendingShot.dir.move) { events.push({t0: T, t1: T + 3.5, kind: 'cam', c: present[0], shot: takeShot()}); T += 3.5; }
  const len = present.length ? Math.max(T + .9, 3) : Math.max(3.5, T + .5, Math.min(8, 1.3 * sc.beats.filter(b => b.k === 'act').reduce((a, b) => a + b.text.split(/(?<=[.!?])\s+/).length, 0)));
  for (const f of fxs) if (f.t == null) f.t = len - 1.2;
  return {sc, idx, present, st, lines, events, chairs, warn, len, lang, fx: fxs};
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

/* ---------- talking and listening bodies ----------
   People talk with their hands in phrases (Kendon, McNeill): the hands rise from rest into the space in front of the
   body (preparation), strike on the word that carries the stress (stroke), hold it a moment and go on to the next
   stroke or sink back to rest when the sentence is done. What a stroke looks like depends on what is said, as BEAT and
   Greta pick it from the words: small beats, an open palm offered, both hands spread for "everything", a hand to the
   chest for "I", palms up for a question, a palm-down sweep for "no", a blade chop for an exclamation, a pinch for "a
   little". Mostly one hand (each person leads with one), sometimes both, and on a long sentence the other hand comes up
   to wait. The hands are placed in the space in front of the body and the arms reach them (two-bone IK), with
   minimum-jerk timing, so hands travel along paths, speed up and settle like hands do instead of joints turning in
   step. The head nods with the strokes, shakes on "no", tilts on a question and never stands quite still while
   talking; listeners nod as a sentence ends and, on a long listen, fold their hands in front or bring one to the chin.
   All from the line's word timings, the same every time for the same script. */
const GW = {  // words that call for a kind of gesture (lowercase, without accents), the app's seven languages
  self: /^(yo|me|mi|mis|mio|mia|conmigo|nosotros|nosotras|nos|i|my|mine|myself|we|us|our|jo|em|meu|meva|nosaltres|je|moi|mon|ma|mes|nous|eu|minha|ich|mich|mir|mein|meine|wir|uns|io|noi)$/,
  you: /^(tu|te|ti|usted|ustedes|vosotros|os|you|your|yours|teu|teva|vos|vostes|vous|toi|ton|ta|tes|voce|voces|seu|sua|du|dich|dir|dein|deine|ihr|euch|tuo|tua|voi)$/,
  no: /^(no|nunca|nada|jamas|ni|not|never|nothing|no|mai|res|non|jamais|rien|nao|nein|nicht|nie|nichts|niente)$/,
  big: /^(todo|todos|toda|todas|mundo|grande|enorme|muchos|muchas|mucho|siempre|everything|all|world|big|huge|many|much|always|tot|tots|totes|gran|tout|tous|toute|monde|grand|tudo|alles|welt|gross|viele|immer|tutto|tutti|mondo|molti|sempre)$/,
  small: /^(poco|poquito|pequeno|pequena|pequenos|pequenas|exacto|exactamente|preciso|little|small|tiny|bit|exactly|precise|petit|petite|peu|exactement|pouco|exato|klein|bisschen|genau|piccolo|esatto|mica)$/
};
// where the wrist goes, from its own shoulder, in arm lengths: x away from the body's middle, y up, z forward;
// palm: its turn about the forearm (0 thumb up, 90 palm up, -90 palm down); shape: a hand of GESTURES
const G_HOME = {x: -.06, y: -.68, z: .38, palm: 18, shape: 'relajada'};
const G_WAIT = {x: -.1, y: -.78, z: .3, palm: 10, shape: 'relajada'};  // the other hand, up and waiting
const GKIND = {
  beat: {prep: {x: .02, y: -.5, z: .48, palm: 28}, hit: {x: .03, y: -.69, z: .52, palm: 22}},
  offer: {prep: {x: -.04, y: -.62, z: .36, palm: 45}, hit: {x: .2, y: -.54, z: .64, palm: 88}, shape: 'abierta'},
  spread: {both: true, prep: {x: -.1, y: -.56, z: .44, palm: 55}, hit: {x: .44, y: -.56, z: .46, palm: 82}, shape: 'abierta'},
  self: {prep: {x: -.12, y: -.52, z: .4, palm: 5}, hit: {x: -.26, y: -.4, z: .34, palm: -5}, shape: 'plana', pole: 'front'},
  you: {prep: {x: -.02, y: -.56, z: .44, palm: 55}, hit: {x: .06, y: -.46, z: .74, palm: 78}, shape: 'abierta'},
  shrug: {both: true, prep: {x: 0, y: -.66, z: .34, palm: 60}, hit: {x: .32, y: -.56, z: .42, palm: 98}, shape: 'abierta'},
  no: {prep: {x: -.18, y: -.5, z: .5, palm: -78}, hit: {x: .36, y: -.53, z: .52, palm: -86}, shape: 'plana'},
  chop: {prep: {x: .03, y: -.3, z: .44, palm: 0}, hit: {x: .03, y: -.68, z: .58, palm: 0}, shape: 'plana'},
  pinch: {prep: {x: -.05, y: -.46, z: .5, palm: 32}, hit: {x: -.02, y: -.54, z: .56, palm: 36}, shape: 'pinza'}
};
const LISTEN = {
  clasp: {L: {x: -.26, y: -.84, z: .26, palm: 0, shape: 'agarre'}, R: {x: -.26, y: -.86, z: .28, palm: 0, shape: 'agarre'}},
  chin: {R: {x: -.29, y: -.03, z: .27, palm: -8, shape: 'puno', pole: 'front'}, L: {x: -.3, y: -.55, z: .3, palm: 70, shape: 'relajada'}}
};
const hashF2 = x => { const h = Math.sin(x * 127.1 + 311.7) * 43758.5453; return h - Math.floor(h); };
const plain = w => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}]/gu, '');
// a line's words with their times in the line (from the voice, or spread by length)
function lineWordTimes(l) {
  return l.words && l.words.length ? l.words.map((w, i) => [l.text.slice(w[0], l.words[i + 1] ? l.words[i + 1][0] : l.text.length).trim(), w[2]])
    : l.text.split(/\s+/).map((w, i, A) => [w, l.dur * A.slice(0, i).join(' ').length / Math.max(1, l.text.length)]);
}
function gesturePlan(D, ci) {
  const arms = {L: [], R: []}, acc = [], lead = hashF2(ci * 3.1 + 1) < .78 ? 'R' : 'L', other = lead === 'R' ? 'L' : 'R';
  const mine = D.lines.filter(l => l.c === ci).sort((a, b) => a.t0 - b.t0);
  const last = a => arms[a][arms[a].length - 1], up = a => { const k = last(a); return k && k.w > 0; };
  const key = (a, t, p, w = 1) => { const k = last(a); if (k && t < k.t + .06) { if (t < k.t - .01) return; arms[a].pop(); } arms[a].push({t, w, x: p.x, y: p.y, z: p.z, palm: p.palm, shape: p.shape || 'relajada', pole: p.pole || 'side'}); };
  const rest = (a, t) => { if (!up(a)) return; const k = last(a); key(a, Math.max(t, k.t + .1), G_HOME); key(a, Math.max(t, k.t + .1) + .55, {...G_HOME, y: -.86, z: .2}, 0); };
  for (const [li, l] of mine.entries()) {
    const next = mine[li + 1], words = lineWordTimes(l), q = /[?¿]/.test(l.text), ex = /[!¡]/.test(l.text), strokes = []; let lastT = -9;
    words.forEach(([w, t], i) => {
      const p = plain(w), tb = l.t0 + t + .05, kind = GW.self.test(p) ? 'self' : GW.you.test(p) && l.to != null ? 'you' : GW.no.test(p) ? 'no' : GW.big.test(p) ? 'spread' : GW.small.test(p) ? 'pinch' : null;
      const stress = /[!¡]/.test(w) || /[áéíóú]/i.test(w) || p.length >= 6 || (i === 0 && l.inten > .45);
      if (!(kind || stress) || tb - lastT < (kind ? .45 : .62)) return;
      if (tb > l.t0 + l.dur - .12 && strokes.length) return;  // not on the very last syllable: the hand would still be striking as the voice stops
      strokes.push({t: tb, kind, w: p, bang: /[!¡]/.test(w)}); lastT = tb;
    });
    if (!strokes.length && l.dur > .8) strokes.push({t: l.t0 + Math.min(.35, l.dur * .3), kind: null});
    if (q && strokes.length && l.dur > 1.1) strokes[strokes.length - 1].kind = 'shrug';
    // a quiet line has fewer and smaller gestures; a loud one more and bigger
    const amp = .65 + .5 * (l.inten ?? .5), keep = strokes.filter((x, i) => x.kind || i === 0 || hashF2(x.t * 7.7 + ci) < .45 + .5 * (l.inten ?? .5));
    const waitOther = keep.length >= 3 && hashF2(l.t0 * 3.3 + ci) < .6;
    for (const [si, st] of keep.entries()) {
      const r = hashF2(st.t * 13.1 + ci * 5.3), kind = st.kind || (st.bang || (ex && si === 0) ? 'chop' : r < .5 ? 'beat' : r < .86 ? 'offer' : 'pinch'), G = GKIND[kind];
      const sides = G.both || (kind === 'beat' && r > .38 && r < .5 && amp > .9) ? ['L', 'R'] : [hashF2(st.t * 3.7 + 9) < .72 ? lead : other];
      const sc = v => ({...v, x: v.x * amp, z: .3 + (v.z - .3) * amp});
      for (const a of sides) {
        const pre = st.t - .2, wasUp = up(a), prev = last(a);
        if (!wasUp) key(a, Math.max(pre - .4, prev ? prev.t + .1 : -9), {...G.prep, shape: G.shape}, 0);
        else if (prev && pre - prev.t > .9) key(a, pre - .45, G_HOME);
        key(a, pre, {...sc(G.prep), shape: G.shape, pole: G.pole});
        const hit = sc(G.hit), over = {...hit, x: hit.x + (hit.x - G.prep.x) * .08, y: hit.y + (hit.y - G.prep.y) * .08, z: hit.z + (hit.z - G.prep.z) * .08, shape: G.shape, pole: G.pole};
        // the stroke never snaps: at least a quarter of a second from wherever the hand was
        const tHit = Math.max(st.t + .06, (last(a) ? last(a).t : -9) + .25);
        key(a, tHit, over); key(a, tHit + .2, {...hit, shape: G.shape, pole: G.pole});
        // the hold, ended before the next stroke gets ready
        const nextPre = keep[si + 1] ? keep[si + 1].t - .28 : l.t0 + l.dur, hold = Math.min(.5, Math.max(.15, ((keep[si + 1] ? keep[si + 1].t : l.t0 + l.dur) - st.t) * .45)), tEnd = Math.min(tHit + .2 + hold, nextPre);
        if (tEnd > tHit + .32) key(a, tEnd, {x: hit.x * .7 + G_HOME.x * .3, y: hit.y * .7 + G_HOME.y * .3, z: hit.z * .7 + G_HOME.z * .3, palm: hit.palm * .8 + G_HOME.palm * .2, shape: G.shape, pole: G.pole});
      }
      acc.push({t: st.t, kind, side: sides.length > 1 ? 0 : sides[0] === 'L' ? 1 : -1, a: amp});
      if (si === 0 && waitOther && sides.length === 1) { const o = sides[0] === 'L' ? 'R' : 'L'; if (!up(o)) { key(o, st.t - .5, G_WAIT, 0); key(o, st.t, G_WAIT); } }
    }
    // the sentence is over: the hands go back down, unless the same person goes on talking soon
    const end = l.t0 + l.dur + .15;
    if (!next || next.t0 - end > 1.3) { rest('L', end); rest('R', end + .08); }
  }
  // listening: nods as the other's sentence ends; on a long listen, the hands folded in front or one at the chin
  const nods = [];
  for (const l of D.lines) {
    if (l.c === ci) continue;
    const h = hashF2(l.t0 * 5.9 + ci);
    if (l.to === ci && l.dur > 1.4 && h < .75) nods.push(l.t0 + l.dur * (.55 + .3 * h));
    const busy = mine.some(x => x.t0 < l.t0 + l.dur + .8 && x.t0 + x.dur > l.t0 - .8) || ['L', 'R'].some(a => arms[a].some(k => k.w > 0 && k.t > l.t0 - .8 && k.t < l.t0 + l.dur + .8));
    if (l.dur < 3.2 || busy || h > .55) continue;
    const P = LISTEN[h < .3 ? 'clasp' : 'chin'], t0 = l.t0 + .5, t1 = l.t0 + l.dur - .2;
    // (in between the talking, so put in by time, not after it)
    const mk = (t, p, w) => ({t, w, x: p.x, y: p.y, z: p.z, palm: p.palm, shape: p.shape, pole: p.pole || 'side'});
    for (const a of ['L', 'R']) if (P[a]) arms[a].push(mk(t0, P[a], 0), mk(t0 + .8, P[a], 1), mk(t1, P[a], 1), mk(t1 + .8, {...P[a], y: -.86, z: .2}, 0));
  }
  for (const a of ['L', 'R']) arms[a].sort((x, y) => x.t - y.t);
  return {arms, acc, nods};
}
const minJerk5 = u => u * u * u * (10 - 15 * u + 6 * u * u);
function armAt(K, t) {
  if (!K.length || t <= K[0].t) return null;
  let i = 0; while (i < K.length - 1 && K[i + 1].t <= t) i++;
  const a = K[i], b = K[i + 1]; if (!b) return a.w > 0 ? a : null;
  const u = minJerk5(clamp((t - a.t) / (b.t - a.t), 0, 1)), L = (x, y) => x + (y - x) * u;
  return {w: L(a.w, b.w), x: L(a.x, b.x), y: L(a.y, b.y), z: L(a.z, b.z), palm: L(a.palm, b.palm), shapeA: a.shape, shapeB: b.shape, u, pole: u < .5 ? a.pole : b.pole};
}
const beatAt = x => x <= 0 ? 0 : x * Math.exp(1 - x);  // a stroke: up quickly, down slowly (x in units of its rise)
// the arm of side s reaches the wrist position T (world), the elbow out towards the pole, the palm turned as asked.
// Only the arm's bones are updated as it goes (the whole figure is not), as this runs for every frame of a film.
function reachArm(m, s, T, pole, palm, out, fw) {
  const J = m.joints, sh = J['shoulder' + s], el = J['elbow' + s], wr = J['wrist' + s], S = wposOf(sh), E0 = wposOf(el), W0 = wposOf(wr);
  const a = E0.distanceTo(S), b = W0.distanceTo(E0), d0 = T.clone().sub(S), d = clamp(d0.length(), Math.abs(a - b) + .01, (a + b) * .985), n = d0.normalize();
  // the elbow's side: the pole across the arm; when the arm points almost along the pole (a hand straight down), a
  // second hint (out and back) takes over gradually, so the elbow never swings round from one frame to the next
  const ca = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1), across = v => v.clone().normalize().addScaledVector(n, -v.clone().normalize().dot(n));
  const p1 = across(pole), k1 = p1.length(), pp = p1.addScaledVector(across(out.clone().multiplyScalar(.8).addScaledVector(fw, -.6)), Math.max(0, 1 - k1 / .6) * 1.5); if (pp.lengthSq() < 1e-6) pp.copy(out);
  const E = S.clone().addScaledVector(n, a * ca).addScaledVector(pp.normalize(), a * Math.sqrt(1 - ca * ca)), Wt = S.clone().addScaledVector(n, d), d1 = E.clone().sub(S), d2 = Wt.clone().sub(E);
  const setW = (P, qw) => { P.quaternion.copy(P.parent.getWorldQuaternion(new Q()).invert().multiply(qw)); P.updateMatrixWorld(true); };
  // upper arm along d1, the elbow bent by the angle to d2, then the upper arm turned about itself so the forearm points along d2
  setW(sh, new Q().setFromUnitVectors(E0.clone().sub(S).normalize(), d1.clone().normalize()).multiply(sh.getWorldQuaternion(new Q())));
  const H = HINGE['elbow' + s]; el.rotation.set(clamp(-d1.angleTo(d2), H[0] * DEG, H[1] * DEG), 0, 0, 'XYZ'); el.updateMatrixWorld(true);
  const ax = d1.clone().normalize(), cur = wposOf(wr).sub(wposOf(el)), pc0 = cur.addScaledVector(ax, -cur.dot(ax)), pw0 = d2.clone().addScaledVector(ax, -d2.dot(ax));
  if (pc0.lengthSq() > 1e-8 && pw0.lengthSq() > 1e-8) { let t = pc0.angleTo(pw0); if (new V3().crossVectors(pc0, pw0).dot(ax) < 0) t = -t; setW(sh, new Q().setFromAxisAngle(ax, t).multiply(sh.getWorldQuaternion(new Q()))); }
  // the palm: turned about the forearm from thumb-up (palm to the body's middle) towards up or down
  if (!m.handAxes) return;
  // (towards the middle and up, across the forearm; with the forearm upright, towards the body instead, gradually)
  const f = wposOf(wr).sub(wposOf(el)).normalize(), flat = v => v.addScaledVector(f, -v.dot(f));
  const want = flat(out.clone().multiplyScalar(-Math.cos(palm * DEG)).add(new V3(0, Math.sin(palm * DEG), 0))), kw = want.length();
  want.addScaledVector(flat(fw.clone().negate()), Math.max(0, 1 - kw / .5) * 1.5); if (want.lengthSq() < 1e-6) return;
  const wq = wr.getWorldQuaternion(new Q());
  const pc = m.handAxes[s].n.clone().applyQuaternion(wq), pw = want; pc.addScaledVector(f, -pc.dot(f)); pw.addScaledVector(f, -pw.dot(f)); if (pc.lengthSq() < 1e-8 || pw.lengthSq() < 1e-8) return;
  let ang = pc.angleTo(pw); if (new V3().crossVectors(pc, pw).dot(f) < 0) ang = -ang;
  setW(wr, new Q().setFromAxisAngle(f, clamp(ang, -110 * DEG, 110 * DEG)).multiply(wq));
}
// the trunk and arms of a pose put on the figure's bones (only those, and only the skeleton updated)
function setTrunk(m, pose) {
  const J = m.joints;
  for (const n of ['hips', 'waist', 'chest', 'shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR']) { J[n].rotation.order = 'XYZ'; J[n].quaternion.fromArray(pose.q[n] || [0, 0, 0, 1]); }
  if (pose.pos) { J.hips.position.fromArray(pose.pos); J.hips.position.y *= J.hips.scale.y; }
  J.hips.updateMatrixWorld(true);
}
// the talking (or listening) body on top of the pose of the moment: arms, hands, head and chest
function gestureLayer(m, pose, plan, t, sit, talkw) {
  const A = {L: armAt(plan.arms.L, t), R: armAt(plan.arms.R, t)};
  let nod = 0, shake = 0, tilt = 0, lean = 0, twist = 0;
  for (const c of plan.acc) {
    const x = t - c.t; if (x < -.3 || x > 1.4) continue;
    const v = beatAt((x + .05) / .18) * c.a;
    if (c.kind === 'no') shake += Math.sin(x * 2 * Math.PI * 2.4) * Math.max(0, 1 - Math.abs(x - .2) / .55) * 7;
    else if (c.kind === 'shrug') { tilt += beatAt((x + .1) / .3) * 6 * (c.side || 1); nod -= beatAt((x + .1) / .3) * 1.5; }
    else nod += v * (c.kind === 'chop' ? 4.5 : 3);
    lean += v * (c.kind === 'you' ? 2.5 : c.kind === 'self' ? -1.2 : 1); twist += v * c.side * 3;
  }
  for (const n of plan.nods) nod += beatAt((t - n) / .22) * 4.5 + beatAt((t - n - .45) / .2) * 2.2;
  // talking, the head is never quite still (slow, uneven drifts, a few degrees)
  const dr = (f1, f2, ph) => Math.sin(t * f1 + ph) * .6 + Math.sin(t * f2 + ph * 1.7) * .4;
  nod += talkw * 1.6 * dr(2.1, 3.7, .3); const yaw = talkw * 2.2 * dr(1.3, 2.9, 1.1); tilt += talkw * 1.8 * dr(1.1, 2.3, 2.2);
  const armsOn = (A.L && A.L.w > .002) || (A.R && A.R.w > .002);
  if (!armsOn && Math.abs(nod) + Math.abs(shake) + Math.abs(tilt) + Math.abs(lean) + Math.abs(twist) + Math.abs(yaw) < .05) return pose;
  const q = {...pose.q}, E = new THREE.Euler(), add = (j, x, y, z) => { if (Math.abs(x) + Math.abs(y) + Math.abs(z) > 1e-4) q[j] = new Q().fromArray(q[j] || [0, 0, 0, 1]).multiply(new Q().setFromEuler(E.set(x * DEG, y * DEG, z * DEG))).toArray(); };
  add('chest', lean * .8, twist * .6, 0); add('neck', nod * .35, (yaw + shake) * .35, tilt * .3); add('head', nod * .65, (yaw + shake) * .65, tilt * .7);
  if (!armsOn) return {...pose, q};
  setTrunk(m, {...pose, q});
  const yawB = facingOf(q), fw = new V3(Math.sin(yawB), 0, Math.cos(yawB)), left = new V3(fw.z, 0, -fw.x), upv = new V3(0, 1, 0), hands = JSON.parse(JSON.stringify(pose.hands || m.hands));
  for (const s of ['L', 'R']) {
    const g = A[s]; if (!g || g.w <= .002) continue;
    const J = m.joints, S = wposOf(J['shoulder' + s]), La = wposOf(J['elbow' + s]).distanceTo(S) + wposOf(J['wrist' + s]).distanceTo(wposOf(J['elbow' + s]));
    const out = s === 'L' ? left : left.clone().negate(), y = sit ? g.y * .85 + .08 : g.y;
    const T = S.clone().addScaledVector(out, g.x * La).addScaledVector(upv, y * La).addScaledVector(fw, g.z * La);
    const pole = g.pole === 'front' ? upv.clone().negate().addScaledVector(out, .3).addScaledVector(fw, .1) : upv.clone().negate().addScaledVector(out, .22).addScaledVector(fw, -.35);
    const base = ['shoulder', 'elbow', 'wrist'].map(n => q[n + s]);
    reachArm(m, s, T, pole, g.palm, out, fw);
    ['shoulder', 'elbow', 'wrist'].forEach((n, i) => { const j = n + s, b = new Q().fromArray(base[i] || [0, 0, 0, 1]); q[j] = b.slerp(J[j].quaternion, g.w).toArray(); });
    // the hand's shape, eased between the two keys' shapes and in from its own
    const sa = gest(g.shapeA), sb = gest(g.shapeB), h = hands[s] || gest('relajada'), mix = (x, y) => x + (y - x) * g.u;
    h.c = h.c.map((c, k) => c + (mix(sa.c[k], sb.c[k]) - c) * g.w); h.s = h.s + (mix(sa.s, sb.s) - h.s) * g.w; h.t = (h.t || 0) + (mix(sa.t || 0, sb.t || 0) - (h.t || 0)) * g.w; hands[s] = h;
  }
  return {...pose, q, hands};
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
    const phase = li * .83, keys = []; let prevPose = null, cur = -1, from = -1;
    // talking or not, eased in and out over a third of a second (the hands do not snap into a gesture)
    const talkW = t => { let w = 0; for (const l of D.lines) if (l.c === s.ci) { const a = l.t0 - .1, b = l.t0 + l.dur + .2, d = t < a ? a - t : t > b ? t - b : 0; w = Math.max(w, 1 - d / .35); } return easeIO(clamp(w, 0, 1)); };
    const plan = gesturePlan(D, s.ci);
    // how far along a walk is at tl: it speeds up over its first steps and slows down over its last
    const walked = (g, tl) => {
      const L = Math.hypot(g.to.x - g.from.x, g.to.z - g.from.z), T = g.t1 - g.t0, r = Math.min(.45, T / 3), v = L / Math.max(1e-6, T - r), t = clamp(tl, 0, T);
      return [t < r ? v * t * t / (2 * r) : t > T - r ? L - v * (T - t) ** 2 / (2 * r) : v * (t - r / 2), L];
    };
    // the pose of part i at time tt (also after it has ended: a walk stands where it stopped, a clip on its last frame)
    const partPose = (i, tt) => {
      const g = full[i], tl = tt - g.t0, at = new V3(g.at.x, 0, g.at.z);
      if (g.kind === 'idle') {
        if (g.mode === 'down') return g._still;
        // talking is not a gesture loop: the idle goes on, the hands come up ready, and they beat with the stressed words
        const sit = g.mode === 'sit', a = clipById(sit ? SC_CLIP.sitIdle : SC_CLIP.idle) || clipById(SC_CLIP.idle2);
        const pose = gestureLayer(m, clipPose(m, sampleClip(a, tt + phase), at, g.at.yaw ?? P.yaw, true, k, keep), plan, tt, sit, talkW(tt));
        return sit ? seatPose(m, pose, g) : pose;
      }
      if (g.kind === 'walk') {  // the steps go with the ground covered, so the feet do not slide
        const c = clipById(g.clip) || clipById(SC_CLIP.walk), [d, L] = walked(g, tl), u = L > 0 ? d / L : 1, sp = clipSpeed(c) * k;
        return clipPose(m, sampleClip(c, sp > .1 ? d / sp : tl), new V3(g.from.x + (g.to.x - g.from.x) * u, 0, g.from.z + (g.to.z - g.from.z) * u), g.yaw, true, k, keep);
      }
      if (g.kind === 'turn') {
        const c = clipById(SC_CLIP.idle), pv = full[i - 1], y0 = pv ? (pv.yaw ?? (pv.at && pv.at.yaw) ?? g.yaw) : g.yaw, u = easeIO(clamp(tl / Math.max(.1, g.t1 - g.t0), 0, 1));
        return clipPose(m, sampleClip(c, tt + phase), at, y0 + wrapA(g.yaw - y0) * u, true, k, keep);
      }
      if (g.kind === 'clip') { const c = clipById(g.clip), tc = tl * (g.speed || 1); return c ? clipPose(m, sampleClip(c, g.loop ? tc : Math.min(tc, c.len)), at, g.yaw, !g.root, k, keep) : null; }
      if (g.kind === 'gone') { const p = g._still || m.getPose();  // out of the world (gone, or not come yet); flying off: up and out of the frame first
        if (g.rise && tl < 2.2) return {...p, pos: [p.pos[0], p.pos[1] + 1.6 * tl * tl, p.pos[2]]}; return {...p, pos: [p.pos[0], -60, p.pos[2]]}; }
      if (g.kind === 'pose') return g._pose || (g._pose = stillPose(m, g));
      if (g.kind === 'group') return g._pose || (g._pose = groupPose(D, li, g));
      return null;
    };
    for (let f = 0; f < n; f++) {
      const tt = f / fps; let i = full.findIndex(g => tt >= g.t0 && tt < g.t1); if (i < 0) i = full.length - 1;
      const g = full[i]; if (i !== cur) { from = cur; cur = i; if ((g.kind === 'idle' && g.mode === 'down') || g.kind === 'gone') g._still = prevPose || m.getPose(); }
      let pose = partPose(i, tt) || prevPose || m.getPose();
      // each part takes over from the last one still moving, not from a frozen frame of it
      const tl = tt - g.t0;
      if (from >= 0 && tl < .35 && g.kind !== 'gone' && full[from].kind !== 'gone') { const was = partPose(from, tt); if (was) pose = mixPose(was, pose, easeIO(tl / .35)); }
      keys.push({f, pose, lin: true}); prevPose = pose;
    }
    despike(keys);
    tracks.push({ci: s.ci, keys});
  }
  // the heads turn to whoever is being listened to (now that everyone's place at every frame is known), smoothly
  for (const [li, s] of D.st.entries()) {
    const K = tracks[li].keys; let gy = 0;
    for (let f = 0; f < n; f++) {
      const tt = f / fps, gz = s.gaze.filter(x => tt >= x.t0 && tt < x.t1).pop(), o = gz && tracks.find(x => x.ci === gz.c); let want = 0;
      if (o) { const p = K[f].pose, op = o.keys[f].pose.pos; want = clamp(wrapA(Math.atan2(op[0] - p.pos[0], op[2] - p.pos[2]) - facingOf(p.q)), -70 * DEG, 70 * DEG); }
      gy += (want - gy) * Math.min(1, 6 / fps);
      // the turn is shared down the spine (the head leads, the chest follows), never all in the neck
      if (Math.abs(gy) > .01) { const p = K[f].pose, q = {...p.q}; for (const [j, w] of [['waist', .12], ['chest', .2], ['neck', .28], ['head', .4]]) q[j] = new Q().fromArray(q[j] || [0, 0, 0, 1]).premultiply(new Q().setFromAxisAngle(new V3(0, 1, 0), gy * w)).toArray(); K[f].pose = {...p, q}; }
    }
  }
  return {tracks, n};
}
const easeIO = t => t * t * (3 - 2 * t);
// a joint that jumps away for one frame and comes straight back (a flip in a blend, a clip's glitch) is put back on its
// way between the frames around it; a fast move that goes on (a punch, a fall) is left as it is
function despike(keys) {
  const qa = new Q(), qb = new Q(), qc = new Q(), lim = 35 * DEG;
  for (let f = 1; f < keys.length - 1; f++) {
    const A = keys[f - 1].pose, B = keys[f].pose, C = keys[f + 1].pose; let fixed = null;
    for (const n of Object.keys(B.q)) {
      if (!A.q[n] || !C.q[n]) continue; qa.fromArray(A.q[n]); qb.fromArray(B.q[n]); qc.fromArray(C.q[n]);
      const a = qa.angleTo(qb), b = qb.angleTo(qc), c = qa.angleTo(qc);
      if (a > lim && b > lim && c < .5 * Math.min(a, b)) { (fixed = fixed || {...B.q})[n] = qa.clone().slerp(qc, .5).toArray(); }
    }
    if (fixed) keys[f].pose = {...B, q: fixed};
  }
}
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
const SC_SHOT_NAME = {est: 'Plano de situación', master: 'Plano general', two: 'Plano a dos', ots: 'Sobre el hombro', single: 'Plano', track: 'Seguimiento', pov: 'Subjetivo', react: 'Reacción', fight: 'Acción', insert: 'Detalle'};
function planShots(D) {
  const units = [], N = D.present.length, L = D.lines;
  const push = (t0, t1, spec) => { if (t1 - t0 > .05) units.push({t0, t1, ...spec}); };
  // an establishing shot when the place changes (and at the start), until the first line or for 3 s
  const firstLine = L.length ? L[0].t0 - .25 : D.len, estEnd = Math.max(Math.min(firstLine, D.events.length && D.events[0].kind === 'move' ? Math.max(3, D.events[0].t1) : 3.2), Math.min(2.5, D.len));
  push(0, Math.min(estEnd, D.len), {type: 'est', size: 'ws', subj: D.present.slice()});
  let t = Math.min(estEnd, D.len), exch = 0, lastSubj = null, lastSize = null, insertN = 0;
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
    } else if (e.kind === 'cam') spec = N ? {type: 'master', size: 'ws', subj: D.present.slice()} : {type: 'est', size: 'ws', subj: []};
    else if (e.kind === 'fx') spec = {type: 'master', size: 'ws', subj: D.present.slice(), shake: true};
    else if (e.kind === 'move') spec = {type: 'track', size: 'fs', subj: [e.c]};
    else if (e.kind === 'fight') spec = {type: 'fight', size: units.length % 2 ? 'mfs' : 'fs', subj: e.target != null ? [e.c, e.target] : [e.c]};
    else if (e.kind === 'big') spec = {type: 'single', size: 'fs', subj: [e.c], angle: 'low'};
    else if (e.kind === 'group') spec = {type: 'two', size: 'ms', subj: [e.c, e.target]};
    else if (INSERT_ACTS.includes(e.act) && (insertN++ % 2 === 0)) spec = {type: 'insert', size: 'cu', subj: [e.c]};  // a hand at work, close: every other one
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
  return styleShots(units, D);
}
function shotFromDirection(sd, spec, D) {
  const d = sd.dir, out = {...spec, fixed: true};
  if (d.insert) { out.type = 'insert'; out.size = 'cu'; }
  else if (d.size === 'two') { out.type = 'two'; out.subj = D.present.slice(0, 2); out.size = 'ms'; }
  else if (d.size === 'ots') out.type = 'ots';
  else if (d.size === 'pov') { out.type = 'pov'; }
  else if (d.size) { out.size = d.size === 'ws' || d.size === 'ews' ? d.size : d.size; if (['ws', 'ews'].includes(d.size)) { out.type = 'master'; out.subj = D.present.slice(); } else if (out.type === 'ots' || out.type === 'two' || out.type === 'master') out.type = 'single'; }
  if (sd.who && sd.who.length) { out.subj = sd.who; }
  if (d.angle) out.angle = d.angle; if (d.move) out.move = d.move;
  return out;
}
/* ---------- a film that breathes: how each shot moves and from where ----------
   A cut is not all a film does: the establishing shot comes down onto the place (a crane), groups are watched with
   a slow drift, a camera creeps in on a line that matters or on a face that reacts, a fight is shot handheld. Angles
   follow the feeling (from below for anger or a shout, from above for fear or sadness), and each shot turns a few
   degrees and changes its lens a touch, so two shots of the same person never look the same. Never across the line. */
const INSERT_ACTS = ['paint', 'study', 'point', 'pick', 'touch', 'show', 'drink', 'phone', 'fix'];
const hashF = n => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
function styleShots(units, D) {
  const emoOf = u => { const L = D.lines.find(l => l.c === u.subj[0] && l.t0 < u.t1 && l.t0 + l.dur > u.t0); return L ? [L.emo, L.inten] : [null, 0]; };
  units.forEach((u, i) => {
    const h = hashF(i * 7.31 + D.idx * 101.7), h2 = hashF(i * 3.17 + D.idx * 57.1 + 9), [emo, inten] = emoOf(u);
    if (u.move && ['rise', 'descend', 'push', 'pull', 'orbit'].includes(u.move)) { u.cam = {kind: u.move, amt: .5}; return; }
    if (u.fixed && u.move) return;
    if (u.shake) u.cam = {kind: 'hand', amt: .02};
    else if (u.type === 'est') u.cam = {kind: 'crane', amt: .5};
    else if (u.type === 'master' || u.type === 'two') u.cam = {kind: 'drift', amt: (h > .5 ? 1 : -1) * .06};
    else if (u.type === 'fight') u.cam = {kind: 'hand', amt: .012};
    else if (u.type === 'react') u.cam = {kind: 'push', amt: .1};
    else if (u.type === 'insert') u.cam = {kind: 'drift', amt: (h > .5 ? 1 : -1) * .05};
    else if (u.type === 'single' || u.type === 'ots') u.cam = inten > .55 || ['grito', 'enfado', 'miedo', 'triste', 'sorpresa'].includes(emo) ? {kind: 'push', amt: .14} : h < .45 ? {kind: 'drift', amt: (h2 > .5 ? 1 : -1) * .035} : {kind: 'hand', amt: .004};
    if (u.type === 'single' || u.type === 'react') {
      if (!u.angle) u.angle = ['grito', 'enfado'].includes(emo) && inten > .5 ? 'low' : ['miedo', 'triste'].includes(emo) ? 'high' : null;
      u.az = (h2 - .5) * 16; u.el = (h - .5) * 6; u.fk = .9 + h2 * .22;
    } else if (u.type === 'ots') { u.el = (h - .5) * 4; u.fk = .95 + h * .1; }
    else if (u.type === 'master' || u.type === 'two') { u.az = (h - .5) * 10; u.fk = .92 + h2 * .16; }
  });
  return units;
}
// the camera's keys for a shot: from where it is framed, moving as its style says
function camMove(c, mv, len, fps) {
  if (!mv || len < 4) return [{f: 0, c}];
  const P = new V3().fromArray(c.p), T = new V3().fromArray(c.t), d = P.clone().sub(T), r = d.length(), right = new V3(0, 1, 0).cross(d).normalize();
  const mk2 = (p, t, f = c.f, rr = c.r) => ({p: p.toArray().map(v => +v.toFixed(3)), t: t.toArray().map(v => +v.toFixed(3)), f: +f.toFixed(1), r: +rr.toFixed(2)});
  const a = mv.amt, end = len - 1;
  if (mv.kind === 'push') return [{f: 0, c}, {f: end, c: mk2(T.clone().addScaledVector(d, 1 - a), T, c.f * (1 + a * .25))}];
  if (mv.kind === 'drift') return [{f: 0, c: mk2(P.clone().addScaledVector(right, -r * a / 2), T.clone().addScaledVector(right, -r * a / 3))}, {f: end, c: mk2(P.clone().addScaledVector(right, r * a / 2), T.clone().addScaledVector(right, r * a / 3))}];
  if (mv.kind === 'crane') return [{f: 0, c: mk2(P.clone().add(new V3(0, r * a * .35, 0)).addScaledVector(d, a * .15), T.clone().add(new V3(0, r * a * .08, 0)))}, {f: end, c}];
  // what the script asks of the camera: up and looking up to the sky, down, closer, back, round
  if (mv.kind === 'rise') return [{f: 0, c}, {f: end, c: mk2(P.clone().add(new V3(0, r * .9 + 1.5, 0)).addScaledVector(d, .2), T.clone().add(new V3(0, r * 1.3 + 4, 0)).addScaledVector(d, -1.2), c.f * .9)}];
  if (mv.kind === 'descend') return [{f: 0, c: mk2(P.clone().add(new V3(0, r * .9 + 1.5, 0)), T.clone().add(new V3(0, r * .6 + 1, 0)))}, {f: end, c}];
  if (mv.kind === 'pull') return [{f: 0, c}, {f: end, c: mk2(T.clone().addScaledVector(d, 1.9).add(new V3(0, r * .25, 0)), T, c.f * .85)}];
  if (mv.kind === 'orbit') { const K = []; for (let i = 0; i <= 4; i++) { const ang = (i / 4 - .5) * 1.2; K.push({f: Math.round(end * i / 4), c: mk2(T.clone().add(d.clone().applyAxisAngle(new V3(0, 1, 0), ang)), T)}); } return K; }
  if (mv.kind === 'hand') {  // a held camera: small, slow wanders and a hint of roll, a key every half second
    const K = [], step = Math.max(2, Math.round(fps * .55));
    for (let f = 0, i = 0; f <= end; f = Math.min(end, f + step), i++) { const w = (n, s) => (hashF(i * 5.7 + n + len) - .5) * 2 * s; K.push({f, c: mk2(P.clone().add(new V3(w(1, r * a), w(2, r * a * .7), w(3, r * a * .5))), T.clone().add(new V3(w(4, r * a * .5), w(5, r * a * .5), 0)), c.f, c.r + w(6, a * 60))}); if (f === end) break; }
    return K;
  }
  return [{f: 0, c}];
}
// the scene's line of interest: between the first two people; the camera stays on the side that faces +Z
function lineOfInterest(D, at) {
  if (D.present.length < 2) return {n: new V3(0, 0, 1)};
  const a = at(D.present[0], 0), b = at(D.present[1], 0), d = new V3(b.x - a.x, 0, b.z - a.z).normalize(), n = new V3(-d.z, 0, d.x);
  if (n.z < 0) n.negate(); return {n, d};
}
function camFor(spec, t, D, sample, side) {
  const W = sample(t), vfovOf = f => 2 * Math.atan(.5 * camera.filmGauge / Math.max(camera.aspect, 1) / f), k = W.size;
  const subj = spec.subj.map(c => W.of[c]).filter(x => x && x.hips.y > -10);  // (not who has gone)
  if (!subj.length) {  // nobody there: the place itself, from in front and low, looking up a little (a sky, a building, a hall)
    if (!['est', 'master'].includes(spec.type) || Object.values(W.of).some(x => x.hips.y > -10)) return null;
    return {p: [0, 1.15 * k, 6.8 * k], t: [0, 2.1 * k, -1.5 * k], f: 22, r: 0};
  }
  const eye = s => s.eye.clone(), mid = subj.reduce((a, s) => a.add(s.eye), new V3()).multiplyScalar(1 / subj.length);
  let size = spec.size || 'ms', H = SC_H[size] * k, focal = SC_F[size], pos, tgt;
  const n = side.n.clone();
  if (spec.type === 'est' || spec.type === 'master' || spec.type === 'two' || spec.type === 'fight') {
    const all = spec.type === 'est' ? Object.values(W.of).filter(x => x.hips.y > -10) : subj, xs = all.map(s => s.hips);
    const c = xs.reduce((a, p) => a.add(p), new V3()).multiplyScalar(1 / xs.length); let spread = 0; for (const p of xs) spread = Math.max(spread, p.distanceTo(c));
    H = Math.max(H, (spread * 2 + 1.1 * k) / Math.max(1, camera.aspect) * 1.15, spec.type === 'est' ? 3.4 * k : 0);
    focal = spec.type === 'est' ? 24 : focal; const vf = vfovOf(focal), d = H / 2 / Math.tan(vf / 2);
    const el = (spec.type === 'est' ? 18 : 7) * DEG, dir = n.clone().add(side.d ? side.d.clone().multiplyScalar(spec.type === 'est' ? .55 : .15) : new V3()).normalize();
    tgt = new V3(c.x, Math.max(.5 * k, (spec.type === 'est' ? c.y * .9 : mid.y - H / 6)), c.z);
    pos = tgt.clone().add(dir.multiplyScalar(d * Math.cos(el))).add(new V3(0, d * Math.sin(el), 0));
  } else if (spec.type === 'ots' && spec.other != null && W.of[spec.other] && W.of[spec.other].eye.y > 1.05 * k && subj[0].fwd.dot(W.of[spec.other].eye.clone().sub(subj[0].eye).setY(0).normalize()) > -.3) {
    const S = subj[0], O = W.of[spec.other], dirOS = S.eye.clone().sub(O.eye).setY(0).normalize(), sideV = n.clone().multiplyScalar(n.dot(new V3().crossVectors(new V3(0, 1, 0), dirOS)) >= 0 ? 1 : -1);
    pos = O.eye.clone().addScaledVector(dirOS, -.62 * k).addScaledVector(new V3(-dirOS.z, 0, dirOS.x).multiplyScalar(sideV.dot(new V3(-dirOS.z, 0, dirOS.x)) >= 0 ? 1 : -1), .36 * k).add(new V3(0, .06 * k, 0));
    tgt = S.eye.clone().add(new V3(0, -H / 6, 0)); const d = pos.distanceTo(tgt);
    focal = clamp(camera.filmGauge / Math.max(camera.aspect, 1) * d / H, 22, 110);
  } else if (spec.type === 'insert') {  // the hands and what they work on, from beside and a little above
    const S = subj[0], side2 = new V3(-S.fwd.z, 0, S.fwd.x).multiplyScalar(n.dot(new V3(-S.fwd.z, 0, S.fwd.x)) >= 0 ? 1 : -1);
    tgt = S.hands.clone().addScaledVector(S.fwd, .12 * k); focal = 60; const d = .55 * k / Math.tan(vfovOf(focal) / 2);
    pos = tgt.clone().addScaledVector(S.fwd.clone().multiplyScalar(.75).add(side2).normalize(), d).add(new V3(0, d * .35, 0));
  } else if (spec.type === 'pov' && spec.other != null && W.of[spec.other]) {
    pos = W.of[spec.other].eye.clone(); tgt = subj[0].eye.clone(); focal = 32;
  } else {  // a single (or a reaction, or a follow): in front of the subject, a little towards whoever they face, on the camera's side
    // (one who has turned away from the other — «sin girarse», walking off — is shot from where they face: the face, not the back)
    const S = subj[0], O0 = spec.other != null ? W.of[spec.other] : null, lookO = O0 && O0.eye.clone().sub(S.eye).setY(0).normalize(), O = O0 && S.fwd.dot(lookO) > -.3 ? O0 : null, look = O ? lookO : S.fwd.clone();
    // (the line is the one between these two — the 180° rule of the exchange —, on the side the scene is seen from)
    let np = n.clone(); if (O) { np.set(-look.z, 0, look.x); if (np.dot(n) < 0) np.negate(); }
    const toCam = look.clone().multiplyScalar(.55).add(np.multiplyScalar(np.dot(S.fwd) < -.3 && !O ? -1 : 1)).normalize();
    const vf = vfovOf(focal), d = H / 2 / Math.tan(vf / 2);
    tgt = S.eye.clone().add(new V3(0, -H / 6, 0)).addScaledVector(look, H * .12);  // looking room on the side they look to
    if (spec.type === 'track') tgt.addScaledVector(S.vel, .6);
    pos = tgt.clone().addScaledVector(toCam, d);
  }
  if (spec.angle === 'high') pos.y += pos.distanceTo(tgt) * .45; else if (spec.angle === 'low') pos.y = Math.max(.25 * k, tgt.y - pos.distanceTo(tgt) * .3);
  // the shot's own little turn: a few degrees round (never across the line) and up or down, and its lens
  if (spec.az || spec.el) { const v = pos.clone().sub(tgt), r = v.length(), ax = new V3(-v.z, 0, v.x).normalize(); v.applyAxisAngle(new V3(0, 1, 0), (spec.az || 0) * DEG); if (ax.lengthSq() > 1e-6) v.applyAxisAngle(ax, -(spec.el || 0) * DEG); pos = tgt.clone().add(v.setLength(r)); }
  if (spec.fk && spec.type !== 'pov') { const d0 = pos.distanceTo(tgt); pos = tgt.clone().add(pos.clone().sub(tgt).multiplyScalar(spec.fk)); focal *= spec.fk; void d0; }
  pos.y = Math.max(pos.y, .15);
  return {p: pos.toArray().map(v => +v.toFixed(3)), t: tgt.toArray().map(v => +v.toFixed(3)), f: +focal.toFixed(1), r: 0};
}

// a still camera that keeps its people in: their heads and hips at the start, middle and end of the shot are seen through
// it, and it steps back (the same lens) until they stay inside the frame with room above the heads
const _fitCam = new THREE.PerspectiveCamera();
function fitCam(c, u, sample) {
  const pts = []; for (const t of [u.t0 + .05, (u.t0 + u.t1) / 2, u.t1 - .05]) { const W = sample(t); for (const ci of u.subj) { const x = W.of[ci]; if (x && x.hips.y > -10) pts.push(x.eye.clone().add(new V3(0, .12 * W.size, 0)), x.hips); } }
  if (!pts.length) return c;
  const T = new V3().fromArray(c.t); let P = new V3().fromArray(c.p);
  _fitCam.filmGauge = camera.filmGauge; _fitCam.aspect = camera.aspect; _fitCam.setFocalLength(c.f); _fitCam.near = .05; _fitCam.far = 500;
  for (let n = 0; n < 4; n++) {
    _fitCam.position.copy(P); _fitCam.lookAt(T); _fitCam.updateMatrixWorld(true); _fitCam.updateProjectionMatrix();
    let worst = 0; for (const p of pts) { const q = p.clone().project(_fitCam); if (q.z > 1) { worst = 2; break; } worst = Math.max(worst, Math.abs(q.x) / .94, q.y / .92, -q.y / .98); }
    if (worst <= 1) break;
    P = T.clone().add(P.clone().sub(T).multiplyScalar(Math.min(1.6, Math.max(1.12, worst * 1.05))));
  }
  return {...c, p: P.toArray().map(v => +v.toFixed(3))};
}

/* ---------- the light of each shot ----------
   The mood comes from the time and the place (a night outside is moonlit, a room at night warm, a dusk back-lit), then
   from the story and the moment: a horror's frights and its monsters lit from below, sorrow, fear and anger in low key,
   laughter bright, a fight hard. The key comes from the side the face is turned to (seen from the camera). */
const SC_MONSTER = /\b(zombi|zombie|monstruo|monster|monstre|monstro|mostro|fantasma|ghost|fantome|geist|demonio|demon|vampiro|vampire|orco|orc|criatura|creature|bestia|beast)\b/;
function filmLightFor(D, u, c0, sample, cast) {
  const amb = state.amb, out = SCENES[state.env] && SCENES[state.env].group !== 'in';
  let mood = amb === 'noche' ? (out ? 'noche' : 'calida') : amb === 'atardecer' ? 'atardecer' : amb === 'interior' || !out ? 'calida' : 'natural';
  const L = D.lines.find(l => u.subj.includes(l.c) && l.t0 < u.t1 && l.t0 + l.dur > u.t0), emo = L && L.emo, inten = L ? L.inten : 0;
  const monster = u.subj.some(c => SC_MONSTER.test(scNorm(`${cast[c].name} ${cast[c].desc || ''}`)));
  if (D.genre === 'horror' && (monster || emo === 'miedo' || emo === 'grito') && ['single', 'react', 'track', 'fight'].includes(u.type)) mood = 'terror';
  else if (['triste', 'miedo', 'enfado'].includes(emo) && inten > .45 && mood !== 'noche') mood = 'drama';
  else if (D.genre === 'horror' && mood !== 'noche') mood = 'drama';
  else if (u.type === 'fight' && mood === 'calida') mood = 'drama';
  else if (['risa', 'sonrisa'].includes(emo) && mood !== 'noche' && mood !== 'atardecer') mood = 'comedia';
  // the side: the key on the side the subject looks to, as the camera sees it
  let side = -1; const S = c0 && sample(u.t0 + .05).of[u.subj[0]];
  if (S && !['est', 'master', 'two'].includes(u.type)) { const d = new V3().fromArray(c0.p).sub(new V3().fromArray(c0.t)), right = new V3(0, 1, 0).cross(d).normalize(), k = S.fwd.dot(right); if (Math.abs(k) > .15) side = Math.sign(k); }
  return {auto: mood, side};
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
    storeShot(); SC.last = JSON.stringify({shots: ANIM.shots, cur: ANIM.cur, fps: ANIM.fps});  // for "Undo" (the shot being edited included)
    // a film is baked at 24 frames a second: fast moves (a punch, a jump) keep their arcs, and the key drawings are found
    // in the real motion (it can still be shown on twos or threes: Interpretación › Ritmo)
    ANIM.fps = o.fps || 24; if ($('#tlFps')) setPressed($('#tlFps'), String(ANIM.fps));
    const film = [], genre = genreOf(text); let prevPresent = [], lastTime = null, lastEnv = null;
    for (const [idx, sc] of P.scenes.entries()) {
      if (!sc.beats.length) continue;
      msg(tr('Escena {n} de {t}: {p}', {n: idx + 1, t: P.scenes.length, p: sc.head.place || sc.head.text || ''}));
      // the scene's people on stage, with their bodies
      o.prev = prevPresent; const D0 = directScene(sc, idx, cast, lang, o), present = D0.present; prevPresent = present.filter(ci => { const s = D0.st[D0.present.indexOf(ci)]; return s && s.mode !== 'off' && s.mode !== 'down'; });
      ensureCount(Math.max(1, present.length));
      for (const [li, ci] of present.entries()) { const m = chars[li], want = {...BODY_BASE, ...cast[ci].body}; if (JSON.stringify(want) !== JSON.stringify(m.body)) m.build(want); m.bodyPreset = cast[ci].preset; }
      // the set and its time of day
      // (a scene with no heading — a play, a monologue — is placed by its first stage directions: «Sala de uma casa
      // antiga. Noite.», «on an empty stage»)
      // (the first sentence that names a place: «Un hombre entra en un bar vacío» is a bar, whatever is served later)
      const firstActs = sc.beats.filter(b => b.k === 'act').slice(0, 2).map(b => b.text).join(' '), head = sc.head.place ? sc.head : {...sc.head, place: firstActs, time: firstActs};
      let env = sc.head.place ? placeOf(head) : null;
      if (!sc.head.place) for (const sent of firstActs.split(/(?<=[.!?])\s+/)) { env = placeOf({...sc.head, place: sent}); if (env) break; } if (!env && sc.head.place && o.online !== false) { msg(tr('Buscando un escenario para «{p}»…', {p: sc.head.place})); env = await placeOnline(sc.head); }
      if (!env && !sc.head.place && lastEnv) env = lastEnv;  // (a page or an act that does not say where: where we were)
      if (!env) { const outside = sc.head.int === false || (sc.head.int == null && /\b(cielo|sky|ciel|ceu|himmel|sol|sun|soleil|luna|moon|lune|lua|mond|calle|street|bosque|forest|wald|jardin|garden)\b/.test(scNorm(firstActs))); env = SC_WORLD_PLACE[genre][outside ? 1 : 0]; }
      // (a street of the West is a dusty plain, a street of a fantasy among old stones)
      if (genre === 'western' && ['calle', 'callejon', 'parque', 'escalinata'].includes(env)) env = 'desierto'; else if (genre === 'fantasy' && ['calle', 'callejon', 'escalinata'].includes(env)) env = 'ruinas';
      lastEnv = env; await setEnv(env); const tm0 = timeOf(head), tm = tm0 || (/(later|mas tarde|continu|plus tard|mais tarde|spater|piu tardi|mismo|same)/.test(scNorm(sc.head.time || '')) ? lastTime : null); lastTime = tm || lastTime;
      const amb = tm === 'noche' ? (SCENES[env] && SCENES[env].group === 'in' ? 'interior' : 'noche') : tm === 'atardecer' ? 'atardecer' : tm === 'dia' && SCENES[env] && SCENES[env].group !== 'in' ? 'dia' : null;
      if (amb) { state.amb = amb; applyAmbient(); setPressed($('#ambChips'), amb); }
      clearProps();
      // laid out again now that the bodies exist (sizes), timed with the voices, baked, shot
      const D = directScene(sc, idx, cast, lang, o); D.genre = genre;
      await timeLines(D, cast);
      for (const c of D.chairs) { const g = makeProp('silla', new V3(c.x, 0, c.z)); g.rotation.y = c.yaw + Math.PI; }
      const B = bakeScene(D), sample = worldSampler(D, B), side = lineOfInterest(D, (ci, t) => sample(t).of[ci].hips);
      const units = o.cams === false ? [{t0: 0, t1: D.len, type: 'master', size: 'fs', subj: D.present.slice()}] : planShots(D);
      SC.plans = SC.plans || []; SC.plans[idx] = {units: units.map(u => ({...u})), lines: D.lines.map(l => [l.c, l.t0, l.dur]), events: D.events.map(e => ({...e})), len: D.len};
      for (const [ui, u] of units.entries()) film.push(makeShot(D, B, u, ui, sample, side, cast));
      report.warn.push(...D.warn.map(w => `${idx + 1}: ${w}`)); report.scenes++;
    }
    ANIM.shots = film; ANIM.cur = -1; report.shots = film.length; report.cast = cast;
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
      of[tr2.ci] = {eye, hips, fwd: new V3(Math.sin(yaw), 0, Math.cos(yaw)), vel, hands: [m.joints.wristL, m.joints.wristR].map(j => j.getWorldPosition(new V3())).sort((a, b) => b.distanceTo(hips) + b.y - a.distanceTo(hips) - a.y)[0]}; size = m.size || 1;  // (the hand at work: the one held out and up)
      m.setPose(save); m.group.updateMatrixWorld(true);
    });
    const r = {of, size}; cache.set(f, r); return r;
  };
}
function makeShot(D, B, u, ui, sample, side, cast) {
  const fps = ANIM.fps, f0 = Math.round(u.t0 * fps), f1 = Math.max(f0 + 2, Math.round(u.t1 * fps)), len = f1 - f0;
  const s = newShot(`${D.idx + 1}${String.fromCharCode(65 + (ui % 26))} · ${tr(SC_SHOT_NAME[u.type] || 'Plano')}${u.size && !['est', 'master', 'two', 'insert'].includes(u.type) ? ' ' + tr({ews: 'muy general', ws: 'general', fs: 'entero', mfs: 'americano', ms: 'medio', mcu: 'medio corto', cu: 'primer plano', ecu: 'detalle'}[u.size]) : ''}`);
  s.len = len;
  // the scene as it stands at the shot's first frame: bodies (with the face of the moment), clothes, set
  s.scene = captureScene();
  // (the faces change on the body's morphs as the shot plays, not baked into it: the body stays the same from shot to
  // shot, so cutting between them does not rebuild anyone)
  s.scene.chars = D.present.map((ci, li) => { const m = chars[li], body = {...m.body}; delete body.expr;
    return {body, preset: m.bodyPreset, outfit: (cast[ci].outfit || []).map(x => ({...x})), pose: B.tracks[li].keys[Math.min(f0, B.n - 1)].pose}; });
  s.faces = D.present.map((ci, li) => { const E = D.st[li].expr.filter(x => x.t < u.t1), out = []; for (const x of E) { const f = Math.round((x.t - u.t0) * fps); if (f <= 0 && out.length) out.length = 0; out.push({f: Math.max(f, -1000), e: x.e || 'neutra'}); } return out; });
  s.keys = B.tracks.map(tr2 => { const K = []; for (let f = f0; f < Math.min(f1, B.n); f++) K.push({f: f - f0, pose: tr2.keys[f].pose, lin: true}); return K; });
  // a place with nobody in it: the figure the app always has stays, hidden (see sceneTicks), so the set is what is seen
  if (!D.present.length) { const m = chars[0]; s.empty = true; s.scene.chars = [{body: {...m.body}, preset: m.bodyPreset, outfit: (m.outfit || []).map(x => ({...x})), pose: m.getPose()}]; s.keys = [[]]; s.faces = [[]]; }
  // anthros say it with their ears and tail: the moment's feeling as body language, over the baked keys (the jaw is the voice's)
  D.present.forEach((ci, li) => { const m = chars[li]; if (!m || m.body.species === 'humano' || !s.keys[li]) return;
    const e = [...D.st[li].expr].filter(x => x.t <= (u.t0 + u.t1) / 2).pop(), J = exprJoints(m, ANTHRO_OF[e && e.e] || 'neutra'); if (!J) return; delete J.jaw;
    const Qs = Object.fromEntries(Object.entries(J).map(([n, r]) => [n, new Q().setFromEuler(new THREE.Euler(r[0], r[1], r[2])).toArray()]));
    s.keys[li] = s.keys[li].map(k => ({...k, pose: {...k.pose, q: {...k.pose.q, ...Qs}}})); });
  let c0 = camFor(u, u.t0 + .05, D, sample, side), c1 = u.type === 'track' || u.move === 'track' ? camFor(u, u.t1 - .05, D, sample, side) : null;
  if (c0 && !c1 && !['insert', 'pov', 'ots'].includes(u.type)) c0 = fitCam(c0, u, sample);
  if (c0) { s.cam = c1 ? [{f: 0, c: c0}, {f: len - 1, c: c1}] : camMove(c0, u.cam, len, fps); s.scene.cam = s.cam[0].c; }
  s.key = u.type === 'est' ? .6 : 1;
  // a little overlap: the chest, the head and the hands arrive a moment after the hips (Interpretación › Arrastre)
  s.motion = Object.fromEntries(s.keys.map((_, li) => [li, {drag: .25}]));
  s.light = filmLightFor(D, u, c0, sample, cast);
  // the place's effects in this shot, in its frames (a blast only while it lasts; light, rain, fire, a fade, all through)
  s.fx = (D.fx || []).filter(x => x.t < u.t1 && (x.fx !== 'blast' || x.t > u.t0 - 2.5) && (x.fx !== 'fadein' || x.t > u.t0 - 1.5) && (x.fx !== 'fadeout' || x.t < u.t1)).map(x => ({f: Math.round((x.t - u.t0) * fps), kind: x.fx, col: x.col || undefined, k: x.k || undefined}));
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
  ANIM.shots = o.shots; ANIM.cur = -1; if (o.fps) { ANIM.fps = o.fps; if ($('#tlFps')) setPressed($('#tlFps'), String(o.fps)); } await enterShot(Math.max(0, o.cur), 0); renderStrip();
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
