/* ======================= from a script to a film: reading the script =======================
   The script is plain text: Fountain (the open screenplay format: INT. KITCHEN - NIGHT, character names in capitals,
   (parentheticals), dialogue, action, CUT TO:) or the way most people write a quick scene ("ANA: Hi!", "Ana walks to
   the door."). It is read into scenes made of beats: a line said by someone, an action, a camera direction.
   The words become intentions through a lexicon with synonyms and conjugations in the app's seven languages; the
   language of the script is told by its most common little words, and English is always understood as well, since
   screenplay conventions are English. Nothing here guesses with AI: it is word lists, stems and rules. */

/* ---------- words ---------- */
const scNorm = t => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, "'");
const scWords = t => scNorm(t).split(/[^a-z0-9ñç']+/).filter(Boolean);
// a pattern list: alternatives with |, words with spaces, a trailing * means "starting with" (camin* = camina, caminando…)
function scPats(s) { return s.split('|').map(a => a.trim()).filter(Boolean).map(a => a.split(/[\s-]+/).map(w => w.endsWith('*') ? {p: w.slice(0, -1)} : {w})); }
const scTok = (t, k) => k.w ? t === k.w : t.startsWith(k.p);
// where a pattern starts in the words (gaps of up to two words allowed inside it: "se lo sienta", "sits right down")
function scFind(words, pats, from = 0) {
  let best = null;
  for (const pat of pats) for (let i = from; i < words.length; i++) {
    if (!scTok(words[i], pat[0])) continue;
    let j = i, ok = true;
    for (let k = 1; k < pat.length; k++) { let g = 0; j++; while (j < words.length && !scTok(words[j], pat[k]) && g < 2) { j++; g++; } if (j >= words.length || !scTok(words[j], pat[k])) { ok = false; break; } }
    if (ok && (!best || i < best.i)) { best = {i, j}; break; }
  }
  return best;
}
// the language of a text: the one whose small words it uses most
const SC_STOP = {es: 'el la los las de del que y en un una se su con por para al lo le no es esta pero como', en: 'the and to of a in is it his her with on at for he she they this that', ca: 'el la els les de del que i en un una es amb per al ho no és aquesta però com', fr: 'le la les de des du que et en un une se sa son avec pour au ne pas est il elle',
  pt: 'o a os as de do da que e em um uma se sua seu com por para ao não é ela ele', de: 'der die das und zu den von ein eine sich mit auf ist nicht er sie es im dem', it: 'il la lo gli le di del che e in un una si sua suo con per al non è lei lui'};
function scLang(text) {
  const w = scWords(text), score = {};
  for (const [l, s] of Object.entries(SC_STOP)) { const set = new Set(s.split(' ')); score[l] = w.filter(x => set.has(x)).length; }
  return Object.entries(score).sort((a, b) => b[1] - a[1])[0][0];
}

/* ---------- what people do: intentions, their words, how they are played ---------- */
// t: how it plays — clip (a gallery animation, c: ids by preference), loop (a looping clip held for its time), walk/run/sneak,
// enter, exit, approach, sit, stand, turn, face, pose (a still pose held), group (a pose of two), expr (a face), down/up
const VERBS = {
  // getting about
  enter: {t: 'enter', es: 'entra*|aparec*|llega|llegan|llego|llegando|irrump*|asoma*', en: 'enter*|arriv*|appear*|comes in|come in|walks in|walk in|steps in|bursts in|shows up', ca: 'entra*|apareix*|arriba|arriben', fr: 'entre|entrent|arrive*|apparai*|surgit', pt: 'entra*|aparec*|chega*', de: 'betritt|betreten|kommt herein|erschein*|tritt ein', it: 'entra*|arriva*|compar*'},
  exit: {t: 'exit', es: 'sale|salen|salio|salir|saliendo|se va|se van|se marcha*|se aleja*|desaparec*|abandona*', en: 'exit*|leav*|goes out|go out|walks out|walk out|walks away|walk away|disappear*|walks off|storms out|runs out|run out|runs off|rushes out|hurries out|dashes out|runs away', ca: 'surt|surten|marxa*|se\'n va|desapareix*', fr: 'sort|sortent|part|partent|s\'en va|disparai*|quitte*', pt: 'sai|saem|vai embora|desaparec*|abandona*', de: 'geht hinaus|verlasst|verschwind*|geht weg|geht', it: 'esce|escono|se ne va|scompar*|lascia*'},
  approach: {t: 'approach', es: 'se acerca*|acercandose|se aproxima*|va hacia|va a|camina hacia|anda hacia|corre hacia|se dirige*|avanza hacia|vuelve con|vuelve junto', en: 'approach*|walks to|walk to|walks over to|walks up to|goes to|go to|goes over to|runs to|run to|runs toward*|walks toward*|moves to|heads to|heads toward*|crosses to|steps toward*', ca: 's\'acosta*|va cap a|camina cap a', fr: 's\'approche*|va vers|marche vers|court vers|se dirige*', pt: 'aproxima-se|se aproxima*|vai ate|caminha ate|vai em direcao', de: 'nahert sich|geht zu|lauft zu|geht auf', it: 'si avvicina*|va verso|cammina verso|corre verso'},
  be: {t: 'none', es: 'esta|estan|estaba|se encuentra*|se halla*|permanece de pie|esta de pie|esta sentad*', en: 'is|are|was|stands|standing|is sitting|sits at|is waiting', ca: 'es|son|esta|estan', fr: 'est|sont|se tient', pt: 'esta|estao|encontra-se', de: 'ist|sind|steht', it: 'e|sono|sta|si trova'},
  run: {t: 'run', es: 'corr*|huy*|escapa*|echa a correr|esprint*', en: 'run|runs|ran|running|flee*|dash*|sprint*|rush*|escape*|bolts', ca: 'corr*|fuig*|escapa*', fr: 'cour*|fuit|fuient|s\'enfui*|sprint*', pt: 'corr*|foge*|escapa*', de: 'renn*|lauft|lauf|flieh*|sprint*', it: 'corr*|fugg*|scappa*'},
  walk: {t: 'walk', es: 'camin*|anda|andan|andando|pasea*|avanza*|da unos pasos|da un paso|cruza*|recorre*', en: 'walk|walks|walked|walking|stroll*|wander*|pace|paces|pacing|steps|stepping|crosses|limps', ca: 'camin*|passeja*|avanca*', fr: 'march*|se promene*|avance*|traverse*', pt: 'caminh*|anda|andam|passeia*|avanca*', de: 'geht|gehen|spazier*|schreit*', it: 'cammin*|passeggi*|avanza*'},
  sneak: {t: 'sneak', es: 'sigilos*|a hurtadillas|agachad* avanza|se arrastra*|repta*', en: 'sneak*|creep*|tiptoe*|crawl*|prowl*', ca: 'sigilos*|d\'amagat', fr: 'se faufile*|a pas de loup|rampe*', pt: 'sorrateir*|rasteja*', de: 'schleich*|kriech*', it: 'di soppiatto|striscia*'},
  sit: {t: 'sit', es: 'se sienta*|se sento|sentandose|toma asiento|se acomoda*|se deja caer en', en: 'sit*|sat|takes a seat|take a seat|settles into', ca: 'seu|s\'asseu*|es seu', fr: 's\'assoi*|s\'assied*|prend place', pt: 'senta-se|se senta*|sentam-se', de: 'setzt sich|setzen sich|nimmt platz', it: 'si siede|siedono|si accomoda*'},
  stand: {t: 'stand', es: 'se levanta*|se levanto|se pone de pie|se incorpora*|en pie', en: 'stands up|stand up|gets up|get up|rises|rise|jumps up|jumps to', ca: 'es lleva*|s\'aixeca*', fr: 'se leve*|se redresse*', pt: 'levanta-se|se levanta*|fica de pe', de: 'steht auf|stehen auf|erhebt sich', it: 'si alza*|si alzano|si rialza*'},
  turn: {t: 'turn', es: 'se gira*|se da la vuelta|se vuelve hacia|da media vuelta|se voltea*|gira*', en: 'turns around|turn around|turns away|spins around|turns back|whirls', ca: 'es gira*|fa mitja volta', fr: 'se retourne*|fait demi-tour', pt: 'vira-se|se vira*|da meia volta', de: 'dreht sich um|wendet sich', it: 'si gira*|si volta*'},
  face: {t: 'face', es: 'mira a|mira hacia|observa a|se queda mirando|clava la mirada|se vuelve hacia|encara*', en: 'looks at|look at|stares at|glances at|watches|faces|turns to|eyes|gazes at', ca: 'mira a|mira cap a|observa', fr: 'regarde|fixe|observe|se tourne vers', pt: 'olha para|encara*|observa', de: 'sieht an|schaut an|blickt|starrt', it: 'guarda|fissa|osserva|si volta verso'},
  // gestures and talk
  wave: {t: 'clip', c: ['np-saludar'], loops: 2, es: 'saluda*|hace un gesto con la mano|agita la mano|se despide*', en: 'wave*|greet*|waves goodbye|waves hello|says goodbye', ca: 'saluda*|s\'acomiada*', fr: 'salue*|fait signe|agite la main', pt: 'acena*|cumprimenta*|despede-se', de: 'wink*|gruss*|verabschied*', it: 'saluta*|fa un cenno'},
  nod: {t: 'clip', c: ['ual2-Yes', 'np-si'], es: 'asient*|dice que si|afirma con la cabeza', en: 'nod*|agrees', ca: 'assenteix*|diu que si', fr: 'acquiesce*|hoche la tete', pt: 'acena com a cabeca|concorda*', de: 'nickt|nicken', it: 'annuisce*|fa cenno di si'},
  no: {t: 'clip', c: ['np-no', 'ual2-Idle_No_Loop'], es: 'niega*|dice que no|sacude la cabeza|menea la cabeza', en: 'shakes his head|shakes her head|shakes their head|shake* head|refus*|denies', ca: 'nega*|diu que no', fr: 'secoue la tete|refuse*|nie', pt: 'nega*|abana a cabeca', de: 'schuttelt den kopf|verneint', it: 'nega*|scuote la testa'},
  clap: {t: 'clip', c: ['np-aplaudir'], loops: 4, es: 'aplaud*', en: 'clap*|applaud*', ca: 'aplaudeix*', fr: 'applaudi*', pt: 'aplaude*', de: 'klatsch*|applaudier*', it: 'applaud*'},
  bow: {t: 'clip', c: ['np-reverencia'], es: 'reverencia|se inclina*|hace una reverencia', en: 'bow*', ca: 'reverencia|s\'inclina*', fr: 's\'incline*|fait la reverence', pt: 'faz uma venia|curva-se', de: 'verbeug*', it: 'si inchina*|fa un inchino'},
  phone: {t: 'loop', c: ['ual2-Idle_TalkingPhone_Loop'], dur: 3, es: 'telefon*|llama a|llama por|movil|contesta el telefono|marca un numero', en: 'phone*|calls|on the phone|dials|answers the phone|texts', ca: 'telefon*|truca*', fr: 'telephone*|appelle', pt: 'telefon*|liga para|atende o telefone', de: 'telefonier*|ruft an', it: 'telefon*|chiama'},
  drink: {t: 'clip', c: ['ual2-Consume'], es: 'beb*|come|comen|comiendo|da un sorbo|da un bocado|prueba*', en: 'drink*|drank|eat|eats|ate|eating|sip*|bites', ca: 'beu|beuen|menja*', fr: 'boit|boivent|mange*|sirote*', pt: 'bebe*|come|comem|comendo', de: 'trink*|isst|essen', it: 'beve*|mangia*|sorseggi*'},
  look: {t: 'clip', c: ['np-mirar'], es: 'mira alrededor|mira a su alrededor|busca con la mirada|observa el lugar|otea*|vigila*', en: 'looks around|look around|scans the room|searches|glances around', ca: 'mira al voltant', fr: 'regarde autour', pt: 'olha em volta|olha ao redor', de: 'sieht sich um|schaut sich um', it: 'si guarda intorno'},
  wait: {t: 'loop', c: ['ual1-Idle_Loop'], dur: 2.5, es: 'espera*|aguarda*|se queda quiet*|permanece*', en: 'wait*|stands still|stays|remains', ca: 'espera*', fr: 'attend*|reste immobile', pt: 'espera*|aguarda*', de: 'wartet|warten|bleibt stehen', it: 'aspetta*|resta*'},
  arms: {t: 'loop', c: ['ual2-Idle_FoldArms_Loop'], dur: 2.5, es: 'cruza los brazos|brazos cruzados|se cruza de brazos', en: 'folds his arms|folds her arms|crosses his arms|crosses her arms|arms crossed|fold* arms', ca: 'creua els bracos', fr: 'croise les bras', pt: 'cruza os bracos', de: 'verschrankt die arme', it: 'incrocia le braccia'},
  crouch: {t: 'loop', c: ['ual1-Crouch_Idle_Loop'], dur: 2, es: 'se agacha*|se pone en cuclillas|se esconde*|se oculta*', en: 'crouch*|ducks|duck|kneels|hides|squats', ca: 's\'ajup*|s\'amaga*', fr: 's\'accroupi*|se cache*', pt: 'agacha-se|se agacha*|esconde-se', de: 'duckt sich|hockt|versteckt sich', it: 'si accovaccia*|si nasconde*'},
  lean: {t: 'loop', c: ['ual2-Idle_Rail_Loop'], dur: 3, es: 'se apoya*|apoyad*', en: 'lean*', ca: 'es recolza*', fr: 's\'appuie*|s\'adosse*', pt: 'apoia-se|encosta-se', de: 'lehnt', it: 'si appoggia*'},
  drive: {t: 'loop', c: ['ual1-Driving_Loop'], dur: 3, es: 'conduc*|maneja*', en: 'driv*|drove', ca: 'condueix*', fr: 'condui*', pt: 'conduz*|dirige*', de: 'fahrt|fahren', it: 'guida*'},
  swim: {t: 'walkclip', c: ['ual1-Swim_Fwd_Loop'], es: 'nada|nadan|nadando|bucea*', en: 'swim*|swam|dives', ca: 'neda*', fr: 'nage*', pt: 'nada|nadam|nadando', de: 'schwimm*', it: 'nuota*'},
  dance: {t: 'loop', c: ['ual1-Dance_Loop'], dur: 3, es: 'bail*|danza*', en: 'danc*', ca: 'balla*|dansa*', fr: 'danse*', pt: 'danca*', de: 'tanz*', it: 'balla*|danza*'},
  // action
  jump: {t: 'clip', c: ['np-saltar'], es: 'salta|saltan|salto|saltando|brinca*|da un salto|pega un bote', en: 'jump*|leap*|hops|hop', ca: 'salta*', fr: 'saute*|bondi*', pt: 'salta*|pula*', de: 'springt|springen|hupft', it: 'salta*|balza*'},
  climb: {t: 'clip', c: ['ual2-ClimbUp_1m'], es: 'trepa*|escala*|sube a|se sube', en: 'climb*|clambers', ca: 'enfila*|escala*', fr: 'grimpe*|escalade*', pt: 'trepa*|escala*|sobe em', de: 'klettert', it: 'si arrampica*|scala*'},
  roll: {t: 'clip', c: ['ual1-Roll'], es: 'rueda por|voltereta|se tira al suelo|da una voltereta', en: 'rolls|roll|somersault*|tumbles', ca: 'tomb*|fa una tombarella', fr: 'roule*|roulade', pt: 'rola*|cambalhota', de: 'rollt|purzel*', it: 'rotola*|capriola'},
  fall: {t: 'clip', c: ['ual1-Death01'], down: true, es: 'cae|caen|cayo|cayendo|se desploma*|se derrumba*|muere|mueren|murio|se desmaya*|tropieza y cae', en: 'fall*|fell|collaps*|dies|die|died|faint*|drops dead', ca: 'cau|cauen|mor|es desmaia*', fr: 'tombe*|s\'effondre*|meurt|s\'evanoui*', pt: 'cai|caem|desmaia*|morre*', de: 'fallt|sturzt|stirbt|bricht zusammen', it: 'cade*|crolla*|muore|sviene'},
  getup: {t: 'clip', c: ['ual2-LayToIdle'], up: true, es: 'se levanta del suelo|se incorpora del suelo|se recupera', en: 'gets up off the floor|gets back up|picks himself up|picks herself up|recovers', ca: 'es lleva de terra', fr: 'se releve', pt: 'levanta-se do chao', de: 'rappelt sich auf', it: 'si rialza da terra'},
  punch: {t: 'clip', c: ['ual1-Punch_Jab', 'ual1-Punch_Cross', 'ual2-Melee_Hook'], es: 'golpea*|pega a|pega un|punetazo|le da un golpe|aporrea*|atiza*|ataca a', en: 'punch*|hits|hit|strikes|strike|slaps|attacks|smacks|socks', ca: 'colpeja*|pega a|cop de puny', fr: 'frappe*|cogne*|gifle*|attaque*', pt: 'soca*|bate em|golpeia*|ataca*', de: 'schlagt|boxt|greift an', it: 'colpisce*|picchia*|da un pugno|attacca*'},
  kick: {t: 'pose', pose: 'patada', dur: .8, es: 'patea*|da una patada|patada', en: 'kick*', ca: 'clatell*|dona una puntada', fr: 'donne un coup de pied|coup de pied', pt: 'chuta*|da um pontape', de: 'tritt|kickt', it: 'calcia*|da un calcio'},
  block: {t: 'pose', pose: 'bloqueo', dur: .8, es: 'bloquea*|para el golpe|se cubre*|se protege*', en: 'block*|parr*|guards|shields himself|shields herself', ca: 'bloqueja*|es cobreix', fr: 'bloque*|pare*|se protege*', pt: 'bloqueia*|defende-se', de: 'blockt|pariert|deckt sich', it: 'blocca*|para*|si protegge*'},
  dodge: {t: 'pose', pose: 'esquivar', dur: .7, es: 'esquiva*|se aparta*|evita el golpe', en: 'dodg*|evad*|sidesteps', ca: 'esquiva*', fr: 'esquive*|evite*', pt: 'esquiva*|desvia*', de: 'weicht aus', it: 'schiva*|evita*'},
  hurt: {t: 'clip', c: ['ual1-Hit_Chest', 'ual1-Hit_Head'], es: 'recibe un golpe|recibe el golpe|encaja el golpe|se duele|herid*|retrocede dolorid*', en: 'is hit|gets hit|takes a hit|reels|winces|staggers', ca: 'rep un cop', fr: 'recoit un coup|chancelle', pt: 'recebe um golpe|cambaleia', de: 'wird getroffen|taumelt', it: 'riceve un colpo|barcolla'},
  knock: {t: 'clip', c: ['ual2-Hit_Knockback'], es: 'sale despedid*|sale volando|es lanzad*|retrocede de un golpe', en: 'is knocked back|knocked back|thrown back|flies back|is thrown', ca: 'surt disparat*', fr: 'est projete*|recule sous le choc', pt: 'e projetad*|voa para tras', de: 'wird zuruckgeschleudert', it: 'viene sbalzat*'},
  sword: {t: 'clip', c: ['ual1-Sword_Attack', 'ual2-Sword_Regular_Combo'], es: 'espadazo|desenvaina*|ataca con la espada|blande*|estocada', en: 'slash*|swings the sword|swings his sword|swings her sword|draws the sword|thrusts|stabs|lunges', ca: 'espasa', fr: 'coup d\'epee|degaine*', pt: 'golpe de espada|desembainha*', de: 'schwert|sticht zu', it: 'fendente|sguaina*'},
  shoot: {t: 'clip', c: ['ual1-Pistol_Shoot'], es: 'dispara*|abre fuego|tirotea*', en: 'shoot*|shot|fires|fire at|opens fire', ca: 'dispara*', fr: 'tire sur|tire|fait feu', pt: 'dispara*|atira*', de: 'schiesst|feuert', it: 'spara*'},
  aim: {t: 'loop', c: ['ual1-Pistol_Idle_Loop'], dur: 2, es: 'apunta*|encañona*', en: 'aim*|points the gun|points a gun', ca: 'apunta*', fr: 'vise*|braque*', pt: 'aponta a arma|mira em', de: 'zielt', it: 'punta l\'arma|mira'},
  throw: {t: 'clip', c: ['ual2-OverhandThrow'], es: 'lanza|lanzan|arroja*|tira la|tira el|tira una|tira un', en: 'throw*|threw|tosses|hurls', ca: 'llanca*', fr: 'lance*|jette*', pt: 'lanca*|arremessa*|atira a|atira o', de: 'wirft', it: 'lancia*|getta*'},
  spell: {t: 'clip', c: ['ual1-Spell_Simple_Shoot'], es: 'hechizo|conjuro|conjura*|lanza un rayo', en: 'casts|spell|conjures', ca: 'encanteri', fr: 'sort|incantation', pt: 'feitico|conjura*', de: 'zauber*', it: 'incantesimo'},
  push: {t: 'loop', c: ['ual1-Push_Loop'], dur: 2, es: 'empuja*', en: 'push*|shoves', ca: 'empeny*', fr: 'pousse*', pt: 'empurra*', de: 'schiebt|stosst', it: 'spinge*'},
  pick: {t: 'clip', c: ['ual1-PickUp_Table'], es: 'coge*|recoge*|agarra*|toma el|toma la|toma un|toma una|levanta el|levanta la', en: 'pick* up|grabs|takes the|takes a|lifts', ca: 'agafa*|recull*', fr: 'prend|ramasse*|saisit', pt: 'pega*|apanha*|agarra*', de: 'nimmt|hebt auf|greift', it: 'prende*|raccoglie*|afferra*'},
  touch: {t: 'clip', c: ['ual1-Interact'], es: 'abre|abren|cierra*|pulsa*|toca la|toca el|llama a la puerta|enciende*|apaga*', en: 'opens|open|closes|presses|knocks|touches|switches|turns on|turns off', ca: 'obre|tanca*|prem', fr: 'ouvre*|ferme*|appuie|frappe a la porte', pt: 'abre|fecha*|carrega no|bate a porta', de: 'offnet|schliesst|druckt|klopft', it: 'apre|chiude*|preme|bussa'},
  carry: {t: 'walkclip', c: ['ual2-Walk_Carry_Loop'], es: 'carga*|lleva en brazos|transporta*', en: 'carr*|hauls', ca: 'carrega*|porta en bracos', fr: 'porte*|transporte*', pt: 'carrega*|transporta*', de: 'tragt', it: 'porta in braccio|trasporta*'},
  fix: {t: 'clip', c: ['ual1-Fixing_Kneeling'], es: 'arregla*|repara*|se arrodilla*', en: 'fix*|repair*|kneels down', ca: 'arregla*|repara*', fr: 'repare*|s\'agenouille*', pt: 'conserta*|repara*|ajoelha-se', de: 'repariert|kniet', it: 'ripara*|si inginocchia*'},
  // still poses held for a moment
  point: {t: 'pose', pose: 'senalar', dur: 1.2, es: 'senala*|apunta con el dedo|indica*', en: 'point*|gestures toward*', ca: 'assenyala*', fr: 'montre du doigt|designe*|pointe', pt: 'aponta*|indica*', de: 'zeigt', it: 'indica*'},
  think: {t: 'pose', pose: 'pensativo', dur: 1.6, es: 'piensa*|reflexiona*|duda*|medita*', en: 'think*|ponder*|hesitat*|wonders', ca: 'pensa*|reflexiona*|dubta*', fr: 'reflechi*|pense*|hesite*', pt: 'pensa*|reflete*|hesita*', de: 'denkt|uberlegt|zogert', it: 'pensa*|riflette*|esita*'},
  shrug: {t: 'pose', pose: 'encoger', dur: 1, es: 'se encoge de hombros|encoge los hombros', en: 'shrug*', ca: 'arronsa les espatlles', fr: 'hausse les epaules', pt: 'encolhe os ombros', de: 'zuckt mit den schultern', it: 'alza le spalle|scrolla le spalle'},
  cover: {t: 'pose', pose: 'taparse', dur: 1.4, es: 'se tapa la cara|se cubre la cara|se esconde la cara', en: 'covers his face|covers her face|buries his face|buries her face|facepalm*', ca: 'es tapa la cara', fr: 'se cache le visage', pt: 'tapa a cara', de: 'verbirgt das gesicht', it: 'si copre il viso'},
  stretch: {t: 'pose', pose: 'estirarse', dur: 1.4, es: 'se estira*|se despereza*', en: 'stretch*|yawns', ca: 'es estira*', fr: 's\'etire*', pt: 'espreguica-se|estica-se', de: 'streckt sich|reckt sich', it: 'si stiracchia*'},
  watch: {t: 'pose', pose: 'reloj', dur: 1.2, es: 'mira el reloj|mira la hora', en: 'checks his watch|checks her watch|looks at the watch|checks the time', ca: 'mira el rellotge', fr: 'regarde sa montre', pt: 'olha o relogio', de: 'schaut auf die uhr', it: 'guarda l\'orologio'},
  cheer: {t: 'pose', pose: 'victoria', dur: 1.4, es: 'celebra*|festeja*|alza los brazos|grita de alegria', en: 'cheer*|celebrat*|raises his arms|raises her arms|triumph*', ca: 'celebra*|aixeca els bracos', fr: 'celebre*|leve les bras', pt: 'celebra*|festeja*', de: 'jubelt|feiert', it: 'esulta*|festeggia*'},
  salute: {t: 'pose', pose: 'militar', dur: 1.2, es: 'saludo militar|se cuadra*', en: 'salutes', ca: 'saluda militarment', fr: 'salut militaire|fait le salut', pt: 'faz continencia', de: 'salutiert', it: 'fa il saluto militare'},
  hips: {t: 'pose', pose: 'jarra', dur: 1.4, es: 'en jarras|brazos en jarra|manos en la cintura', en: 'hands on hips|hands on his hips|hands on her hips', ca: 'mans a la cintura', fr: 'mains sur les hanches', pt: 'maos na cintura', de: 'hande in die hufte', it: 'mani sui fianchi'},
  // two people
  hug: {t: 'group', g: 'g2-abrazo', dur: 2, es: 'abraza*|se abrazan', en: 'hug*|embrac*', ca: 'abraca*', fr: 'enlace*|serre dans ses bras', pt: 'abraca*', de: 'umarmt', it: 'abbraccia*'},
  shake: {t: 'group', g: 'g2-apreton', dur: 1.6, es: 'estrecha la mano|le da la mano|se dan la mano|apreton de manos', en: 'shakes hands|shakes his hand|shakes her hand|shake hands', ca: 'encaixa*|es donen la ma', fr: 'serre la main|se serrent la main', pt: 'aperta a mao|apertam as maos', de: 'schutteln die hande|gibt die hand', it: 'stringe la mano|si stringono la mano'},
  five: {t: 'group', g: 'g2-chocar', dur: 1.2, es: 'choca esos cinco|chocan los cinco|chocan las manos', en: 'high five*|high-five*', ca: 'piquen de mans', fr: 'tope la|tapent dans la main', pt: 'batem as maos|toca aqui', de: 'klatschen ab|high five', it: 'batte il cinque|battono il cinque'},
  console: {t: 'group', g: 'g2-consolar', dur: 2, es: 'consuela*|reconforta*', en: 'consol*|comfort*', ca: 'consola*|conforta*', fr: 'console*|reconforte*', pt: 'consola*|conforta*', de: 'trostet', it: 'consola*|conforta*'},
  shoulder: {t: 'group', g: 'g2-hombro', dur: 1.6, es: 'mano en el hombro|le pone la mano en el hombro|le toca el hombro', en: 'hand on his shoulder|hand on her shoulder|pats him on the shoulder|pats her on the shoulder|taps his shoulder|taps her shoulder', ca: 'ma a l\'espatlla', fr: 'main sur l\'epaule', pt: 'mao no ombro', de: 'hand auf die schulter', it: 'mano sulla spalla'},
  threaten: {t: 'group', g: 'g2-amenaza', dur: 1.6, es: 'amenaza*|intimida*|encara a', en: 'threaten*|intimidat*|looms over|confronts', ca: 'amenaca*', fr: 'menace*|intimide*', pt: 'ameaca*|intimida*', de: 'droht|bedroht', it: 'minaccia*'},
  helpup: {t: 'group', g: 'g2-levantar', dur: 1.8, es: 'ayuda a levantarse|le ayuda a levantarse|le tiende la mano', en: 'helps him up|helps her up|helps them up|pulls him up|pulls her up', ca: 'ajuda a aixecar-se', fr: 'aide a se relever', pt: 'ajuda a levantar', de: 'hilft auf', it: 'aiuta a rialzarsi'},
  dancewith: {t: 'group', g: 'g2-baile', dur: 3, es: 'bailan juntos|baila con|bailan agarrados', en: 'dances with|dance together', ca: 'balla amb|ballen junts', fr: 'danse avec|dansent ensemble', pt: 'danca com|dancam juntos', de: 'tanzt mit|tanzen zusammen', it: 'balla con|ballano insieme'},
  // faces (the face changes from here on; see SC_EMO for the words in parentheticals)
  smile: {t: 'expr', e: 'sonrisa', es: 'sonrie*|sonriendo', en: 'smil*|grins|grinning|beams', ca: 'somriu*', fr: 'sourit|sourient|souriant', pt: 'sorri*', de: 'lachelt|grinst', it: 'sorride*'},
  laugh: {t: 'expr', e: 'risa', es: 'rie|rien|riendo|se rie|se rien|carcajada|se parte de risa', en: 'laugh*|giggl*|chuckl*', ca: 'riu|riuen|rient', fr: 'rit|rient|riant|eclate de rire', pt: 'ri|riem|rindo|gargalha*', de: 'lacht|lachen|kichert', it: 'ride|ridono|ridendo'},
  cry: {t: 'expr', e: 'triste', es: 'llora*|solloza*|se entristece*', en: 'cr|cries|cried|crying|sob*|weep*|tears up', ca: 'plora*', fr: 'pleure*|sanglote*', pt: 'chora*|solucar*', de: 'weint|schluchzt', it: 'piange*|singhiozza*'},
  anger: {t: 'expr', e: 'enfado', es: 'se enfada*|se enoja*|frunce el ceno|se irrita*|furios*', en: 'frown*|scowl*|glares|gets angry|fumes|seethes', ca: 's\'enfada*|arrufa les celles', fr: 'se fache*|fronce les sourcils', pt: 'zanga-se|franze a testa|irrita-se', de: 'runzelt die stirn|wird wutend|argert sich', it: 'si arrabbia*|aggrotta*'},
  shout: {t: 'expr', e: 'grito', es: 'grita*|chilla*|vocifera*|ruge*', en: 'shout*|yell*|scream*|roar*', ca: 'crida*|xiscla*', fr: 'crie*|hurle*', pt: 'grita*|berra*', de: 'schreit|brullt|ruft laut', it: 'grida*|urla*'},
  surprise: {t: 'expr', e: 'sorpresa', es: 'se sorprende*|sorprendid*|asombrad*|se queda boquiabierto|se sobresalta*', en: 'gasp*|startl*|is surprised|stunned|shocked|stares in disbelief', ca: 'se sorpren*|sorpres*', fr: 'sursaute*|surpris*|stupefait*', pt: 'surpreende-se|surpreendid*|espantad*', de: 'erschrickt|staunt|uberrascht', it: 'sobbalza*|sorpres*|stupit*'},
  fear: {t: 'expr', e: 'miedo', es: 'tiembla*|asustad*|aterrad*|tiene miedo|se asusta*', en: 'trembl*|scared|frightened|terrified|cowers|shivers', ca: 'tremola*|espantat*|te por', fr: 'tremble*|effraye*|a peur|terrifie*', pt: 'treme*|assustad*|tem medo', de: 'zittert|hat angst|erschrocken', it: 'trema*|spaventat*|ha paura'},
  wink: {t: 'expr', e: 'guino', es: 'guina*|hace un guino', en: 'wink*', ca: 'fa l\'ullet', fr: 'fait un clin d\'oeil', pt: 'pisca o olho', de: 'zwinkert', it: 'fa l\'occhiolino'},
  sleep: {t: 'expr', e: 'dormido', es: 'duerme*|cierra los ojos|se duerme', en: 'sleep*|closes his eyes|closes her eyes|dozes', ca: 'dorm|tanca els ulls', fr: 'dort|ferme les yeux', pt: 'dorme*|fecha os olhos', de: 'schlaft|schliesst die augen', it: 'dorme*|chiude gli occhi'}
};
// words in a parenthetical or an adverb → a face (and how loud: a shout gets a closer, harder shot)
const SC_EMO = {
  sonrisa: 'sonri*|alegre*|content*|feliz|amable*|ilusionad*|smil*|happ*|cheerful*|kind*|warm*|pleased|glad|somri*|content*|joyeux|heureux|souri*|feliz|alegre|froh|glucklich|lachel*|felice|allegr*|sorrid*',
  risa: 'rie*|riendo|risa|carcajada|divertid*|burlon*|laugh*|chuckl*|amused|giggl*|riu|rient|rit|riant|ri|rindo|lacht|ridendo|ride',
  triste: 'triste*|llorando|lloros*|apenad*|abatid*|melancolic*|sad*|crying|tearful*|sorrowful*|devastated|ploran*|trist*|pleur*|chorando|traurig|weinend|piangendo',
  enfado: 'enfadad*|furios*|enojad*|irritad*|molest*|seco|cortante|angr*|furious*|annoyed|irritat*|cold*|sharp*|enfadat*|en colere|fache*|zangad*|irritad*|wutend|verargert|arrabbiat*|furios*',
  sorpresa: 'sorprendid*|asombrad*|incredul*|sobresaltad*|surprised|amazed|astonish*|shocked|disbelief|stunned|sorpres*|surpris*|etonne*|surpreendid*|uberrascht|erstaunt|stupit*',
  miedo: 'asustad*|aterrad*|nervios*|temblando|timid*|scared|afraid|frightened|terrified|nervous*|anxious*|espantat*|effraye*|apeure*|assustad*|angstlich|nervos|spaventat*|nervos*',
  asco: 'asco|asquead*|disgust*|repugnad*|fastig*|degout*|enojo|angewidert|disgustat*',
  grito: 'gritando|a gritos|chillando|furibund*|shouting|yelling|screaming|cridant|criant|gritando|schreiend|urlando',
  concentrado: 'concentrad*|seri*|pensativ*|focused|serious*|thoughtful*|concentrat*|serieux|serio|ernst|nachdenklich|pensieros*',
  guino: 'guino|picaro|picaron|wink*|cheeky|sly*|ullet|clin d\'oeil|piscando|zwinkernd|occhiolino'
};
const SC_EMO_PATS = Object.fromEntries(Object.entries(SC_EMO).map(([k, v]) => [k, scPats(v)]));
const SC_VERB_PATS = {};
function verbPats(lang) {
  if (!SC_VERB_PATS[lang]) SC_VERB_PATS[lang] = Object.entries(VERBS).map(([id, v]) => [id, scPats([v[lang] || '', lang === 'en' ? '' : v.en].filter(Boolean).join('|'))]);
  return SC_VERB_PATS[lang];
}
function emotionOf(text) {
  const w = scWords(text); let best = null;
  for (const [e, pats] of Object.entries(SC_EMO_PATS)) { const f = scFind(w, pats); if (f && (!best || f.i < best.i)) best = {e, i: f.i}; }
  return best && best.e;
}

/* ---------- camera directions written in the script ---------- */
// what a screenwriter writes (CLOSE ON ANA, PRIMER PLANO DE ANA, WIDE SHOT, POV…) → a shot size, angle or kind
const SC_SHOTS = [
  ['ecu', 'plano detalle|primerisimo primer plano|extreme close|ecu|insert|inserto|detalle de|gros plan sur|plano de detalle|dettaglio|detail'],
  ['cu', 'primer plano|close up|closeup|close on|close-up|cu on|gros plan|primo piano|nahaufnahme|grande plano|pla curt'],
  ['mcu', 'plano medio corto|medium close|mcu|plan rapproche|mezzo primo piano'],
  ['ms', 'plano medio|medium shot|mid shot|ms on|plan moyen|piano medio|halbnah|pla mitja'],
  ['mfs', 'plano americano|cowboy shot|american shot|plan americain|piano americano|amerikanisch'],
  ['fs', 'plano entero|full shot|full figure|plan pied|figura intera|totale|pla sencer'],
  ['ws', 'plano general|wide shot|wide on|long shot|ws on|establishing|plano de situacion|gran plano general|plan general|plan large|campo lungo|piano generale|weit|pla general'],
  ['ots', 'sobre el hombro|over the shoulder|ots|par-dessus l\'epaule|sopra la spalla|uber die schulter'],
  ['two', 'plano conjunto|plano a dos|two shot|two-shot|2 shot|plan a deux|due persone|zweier'],
  ['pov', 'subjetivo|plano subjetivo|pov|point of view|camara subjetiva|plan subjectif|soggettiva|subjektive'],
  ['high', 'picado|high angle|vista de pajaro|bird\'s eye|plongee|plongee|dall\'alto|aufsicht|vogelperspektive'],
  ['low', 'contrapicado|low angle|contre-plongee|dal basso|untersicht|froschperspektive'],
  ['track', 'travelling|tracking|traveling|sigue a|following|follows|carrello|kamerafahrt'],
  ['pan', 'panoramica|pan to|pan across|panoramique|panoramica|schwenk']
];
const SC_SHOT_PATS = SC_SHOTS.map(([k, v]) => [k, scPats(v)]);
function shotDirection(text) {
  const w = scWords(text), out = {};
  for (const [k, pats] of SC_SHOT_PATS) if (scFind(w, pats)) { if (['high', 'low'].includes(k)) out.angle = k; else if (['track', 'pan'].includes(k)) out.move = k; else if (!out.size) out.size = k; }
  return Object.keys(out).length ? out : null;
}

/* ---------- the script into scenes and beats ---------- */
const SC_HEAD = /^(\.(?!\.)|(int|ext|est|int\.?\/ext|ext\.?\/int|i\/e|interior|exterior|esc|escena|scene|seq)[\.\s:])/i;
const SC_TRANS = /^(>[^<]*$|[A-ZÁÉÍÓÚÑÇ\s]+(TO|A|À|AL|SU|NACH|PARA):$|FADE (IN|OUT|TO BLACK)|FUNDIDO|CORTE A|CORTE:|CUT TO|DISSOLVE|ENCADENADO|FIN\.?$|THE END\.?$)/;
const isCaps = s => /[A-ZÁÉÍÓÚÑÇÜ]/.test(s) && s === s.toUpperCase() && !/[a-záéíóúñçü]/.test(s);
// "INT. COCINA - NOCHE" → place and time; "ESCENA 2: EL BOSQUE" also works
function headingOf(line) {
  let s = line.replace(/^\./, '').trim(); const ie = (s.match(/^(int\.?\/ext|ext\.?\/int|i\/e|int|ext|est|interior|exterior)\b\.?/i) || [''])[0];
  s = s.slice(ie.length).replace(/^(esc(ena)?|scene|seq)\s*\d*\s*[:.\-–—]?/i, '').replace(/^[\s.:\-–—]+/, '').replace(/#\d+#\s*$/, '').trim();
  const parts = s.split(/\s+[-–—]+\s+|\s*,\s+/), place = parts[0] || '', time = parts.slice(1).join(' ');
  return {place, time, int: /^i/i.test(ie) && !/ext/i.test(ie) ? true : /^e/i.test(ie) ? false : null, text: line.trim()};
}
// the whole text → {title, scenes: [{head, beats: [{k: 'line'|'act'|'shot'|'trans', who, text, paren, emo}]}], names}
function parseScript(src) {
  let text = src.replace(/\r\n?/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\[\[[\s\S]*?\]\]/g, '');
  const lines = text.split('\n'), out = {title: '', scenes: [], names: new Map()}, scene = () => out.scenes[out.scenes.length - 1];
  let i = 0;
  // title page: "Title: …" lines at the very top
  while (i < lines.length && /^\s*$/.test(lines[i])) i++;
  if (/^(title|titulo|título|titre|titolo|titel)\s*:/i.test(lines[i] || '')) { while (i < lines.length && lines[i].trim()) { const m = lines[i].match(/^(title|titulo|título|titre|titolo|titel)\s*:\s*(.*)$/i); if (m) out.title = m[2].trim(); i++; } }
  const newScene = head => out.scenes.push({head, beats: []});
  const name = s => s.replace(/\s*\((V\.?O\.?|O\.?S\.?|O\.?C\.?|CONT'?D|CONT\.?|OFF|FUERA DE CAMPO|VOZ EN OFF|EN OFF)\)\s*/gi, '').replace(/\^$/, '').replace(/^@/, '').trim();
  const addName = (n, how) => { const k = scNorm(n); if (!k || k.length > 30) return null; if (!out.names.has(k)) out.names.set(k, {name: n.replace(/\b\w/g, c => c.toUpperCase()).replace(/\B\w/g, c => c.toLowerCase()), lines: 0, how}); return out.names.get(k); };
  const prevBlank = j => j === 0 || !lines[j - 1].trim();
  for (; i < lines.length; i++) {
    const raw = lines[i], t = raw.trim();
    if (!t || /^={3,}$/.test(t) || /^#/.test(t) || /^=/.test(t) || /^~/.test(t)) continue;  // page breaks, sections, synopses, lyrics
    if (SC_HEAD.test(t) && prevBlank(i) && t.length < 120) { newScene(headingOf(t)); continue; }
    if (!scene()) newScene({place: '', time: '', int: null, text: ''});
    if (SC_TRANS.test(t) && isCaps(t.replace(/^>/, ''))) { scene().beats.push({k: 'trans', text: t.replace(/^>\s*/, '')}); continue; }
    // a character cue: a name in capitals alone on its line (or "@Name"), followed by what they say
    const cue = (isCaps(t.replace(/\(.*?\)/g, '').replace(/[\^\d\s.'-]/g, 'X')) || /^@/.test(t)) && prevBlank(i) && lines[i + 1] && lines[i + 1].trim() && !/[.!?:]$/.test(t.replace(/\(.*\)$/, '').trim()) && t.length < 40 && !shotDirection(t);
    // or the quick way: "ANA: hello" / "Ana: hello" / "Ana (smiling): hello"
    const quick = !cue && t.match(/^@?([A-ZÁÉÍÓÚÑÇÜ][\wÁÉÍÓÚÑÇÜáéíóúñçü'.-]*(?: [A-ZÁÉÍÓÚÑÇÜ][\wÁÉÍÓÚÑÇÜáéíóúñçü'.-]*){0,2})\s*(\(([^)]*)\))?\s*[:：]\s*(.+)$/);
    if (cue) {
      const who = addName(name(t), 'cue'); let paren = (t.match(/\(([^)]*)\)/) || [])[1] || '';
      for (i++; i < lines.length && lines[i].trim(); i++) {
        const d = lines[i].trim();
        if (/^\(.*\)$/.test(d)) { paren = d.slice(1, -1); const emo = emotionOf(paren); scene().beats.push({k: 'paren', who: who.name, text: paren, emo}); continue; }
        scene().beats.push({k: 'line', who: who.name, text: d.replace(/^\^/, ''), paren, emo: emotionOf(paren)}); who.lines++; paren = '';
      }
      continue;
    }
    if (quick && !shotDirection(quick[1])) {
      const who = addName(quick[1], 'quick'); const paren = quick[3] || '';
      scene().beats.push({k: 'line', who: who.name, text: quick[4].trim(), paren, emo: emotionOf(paren)}); who.lines++;
      continue;
    }
    // action (with camera directions inside)
    const sd = shotDirection(t); if (sd && isCaps(t.replace(/[^A-Za-zÁÉÍÓÚÑÇÜáéíóúñçü]/g, '').slice(0, 8))) {
      // "PLANO GENERAL. Ana y Luis caminan." → the camera direction, then the action
      const m = t.match(/^([^a-záéíóúñçü]*?[A-ZÁÉÍÓÚÑÇÜ'’ ]{3,}[.:—–-])\s+(.*[a-záéíóúñçü].*)$/);
      scene().beats.push({k: 'shot', text: m ? m[1] : t, dir: sd}); if (m) scene().beats.push({k: 'act', text: m[2]}); continue;
    }
    const last = scene().beats[scene().beats.length - 1];
    if (last && last.k === 'act' && !prevBlank(i)) last.text += ' ' + t; else scene().beats.push({k: 'act', text: t.replace(/^!/, '')});
  }
  // names first written in capitals inside the action (Fountain: the first appearance of a character) count too
  for (const sc of out.scenes) for (const b of sc.beats) if (b.k === 'act') for (const m of b.text.matchAll(/\b([A-ZÁÉÍÓÚÑÇÜ]{2,}(?: [A-ZÁÉÍÓÚÑÇÜ]{2,})?)\b/g)) {
    const w = m[1]; if (shotDirection(w) || /^(INT|EXT|POV|OTS|ECU|CU|MS|WS|TV|OK|DJ|FBI|CIA|USA|UK|EEUU|DNI)$/.test(w)) continue; addName(w, 'action');
  }
  return out;
}
