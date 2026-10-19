/* ======================= from a script to a film: reading the script =======================
   The script is plain text: Fountain (the open screenplay format: INT. KITCHEN - NIGHT, character names in capitals,
   (parentheticals), dialogue, action, CUT TO:) or the way most people write a quick scene ("ANA: Hi!", "Ana walks to
   the door."). It is read into scenes made of beats: a line said by someone, an action, a camera direction.
   The words become intentions through a lexicon with synonyms and conjugations in the app's seven languages; the
   language of the script is told by its most common little words, and English is always understood as well, since
   screenplay conventions are English. Nothing here guesses with AI: it is word lists, stems and rules. */

/* ---------- words ---------- */
const scNorm = t => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, "'").replace(/ß/g, 'ss');
const scWords = t => scNorm(t).split(/[^a-z0-9ñç']+/).filter(Boolean);
// a pattern list: alternatives with |, words with spaces, a trailing * means "starting with" (camin* = camina, caminando…)
function scPats(s) { return s.split('|').map(a => a.trim()).filter(Boolean).map(a => a.split(/[\s-]+/).map(w => w.endsWith('*') ? {p: w.slice(0, -1)} : {w})); }
// (an elided article or pronoun is looked through: «l'aide» is «aide», «dell'uomo» is «uomo», «s'approche» stays itself)
const scElide = t => t.replace(/^(?:l|d|j|n|m|t|c|qu|dell|all|dall|nell|sull|un)'/, '');
const scTok = (t, k) => k.w ? t === k.w || (t.includes("'") && scElide(t) === k.w) : t.startsWith(k.p) || (t.includes("'") && scElide(t).startsWith(k.p));
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
  enter: {t: 'enter', es: 'entro|entraron|aparecio|aparecieron|llegaron|entra*|aparec*|llega|llegan|llego|llegando|irrump*|asoma*|baja del coche|sale del coche|se baja|bajan del|salen del coche|se bajan|bajan de', en: 'enter*|arriv*|appear*|comes in|come in|walks in|walk in|steps in|bursts in|shows up|steps out|step out|gets out|get out|climbs out|climb out', ca: 'entra*|apareix*|arriba|arriben|baixa del|baixen del', fr: 'entre|entrent|arrive*|apparai*|surgit|descend de|descendent de|sort de la voiture|sortent de la voiture', pt: 'entra*|aparec*|chega*|desce do|descem do', de: 'betritt|betreten|kommt herein|erschein*|tritt ein|steigt aus|steigen aus', it: 'entra*|arriva*|compar*|scende dall*|scendono dall*'},
  exit: {t: 'exit', es: 'salieron|se fue|se fueron|se marcho|desaparecio|sale|salen|salio|salir|saliendo|se va|se van|se marcha*|se aleja*|desaparec*|abandona*', en: 'exit*|leav*|goes out|go out|walks out|walk out|walks away|walk away|disappear*|walks off|storms out|runs out|run out|runs off|rushes out|hurries out|dashes out|runs away', ca: 'surt|surten|marxa*|se\'n va|desapareix*', fr: 'sort|sortent|part|partent|s\'en va|disparai*|quitte*', pt: 'sai|saem|vai embora|desaparec*|abandona*', de: 'geht hinaus|verlasst|verschwind*|geht weg|geht|rennt weg|lauft weg|lauft davon|rennt davon', it: 'esce|escono|se ne va|scompar*|lascia*'},
  approach: {t: 'approach', es: 'se acerco|se acercaron|fue hacia|camino hacia|corrio hacia|se acerca*|acercandose|se aproxima*|va hacia|va a|camina hacia|anda hacia|corre hacia|se dirige*|avanza hacia|vuelve con|vuelve junto', en: 'approach*|walks to|walk to|walks over to|walks up to|goes to|go to|goes over to|runs to|run to|runs toward*|walks toward*|moves to|heads to|heads toward*|crosses to|steps toward*', ca: 's\'acosta*|va cap a|camina cap a', fr: 's\'approche*|va vers|marche vers|court vers|se dirige*', pt: 'aproxima-se|se aproxima*|vai ate|caminha ate|vai em direcao', de: 'nahert sich|geht zu|lauft zu|geht auf', it: 'si avvicina*|va verso|cammina verso|corre verso'},
  be: {t: 'none', es: 'esta|estan|estaba|se encuentra*|se halla*|permanece de pie|esta de pie|esta sentad*', en: 'is|are|was|stands|standing|is sitting|sits at|is waiting', ca: 'es|son|esta|estan', fr: 'est|sont|se tient', pt: 'esta|estao|encontra-se', de: 'ist|sind|steht', it: 'e|sono|sta|si trova'},
  run: {t: 'run', es: 'corr*|huy*|escapa*|echa a correr|esprint*', en: 'run|runs|ran|running|flee*|dash*|sprint*|rush*|escape*|bolts', ca: 'corr*|fuig*|escapa*', fr: 'cour*|fuit|fuient|s\'enfui*|sprint*', pt: 'corr*|foge*|escapa*', de: 'renn*|lauft|lauf|flieh*|sprint*', it: 'corr*|fugg*|scappa*'},
  walk: {t: 'walk', es: 'camin*|anda|andan|andando|pasea*|avanza*|da unos pasos|da un paso|cruza*|recorre*', en: 'walk|walks|walked|walking|stroll*|wander*|pace|paces|pacing|steps|stepping|crosses|limps', ca: 'camin*|passeja*|avanca*', fr: 'march*|se promene*|avance*|traverse*', pt: 'caminh*|anda|andam|passeia*|avanca*', de: 'geht|gehen|spazier*|schreit*', it: 'cammin*|passeggi*|avanza*'},
  sneak: {t: 'sneak', es: 'sigilos*|a hurtadillas|agachad* avanza|se arrastra*|repta*', en: 'sneak*|creep*|tiptoe*|crawl*|prowl*', ca: 'sigilos*|d\'amagat', fr: 'se faufile*|a pas de loup|rampe*', pt: 'sorrateir*|rasteja*', de: 'schleich*|kriech*', it: 'di soppiatto|striscia*'},
  sit: {t: 'sit', es: 'se sienta*|se sento|sentandose|toma asiento|se acomoda*|se deja caer en', en: 'sit*|sat|takes a seat|take a seat|settles into', ca: 'seu|seuen|s\'asseu*|es seu|asseguts|assegudes|assegut|asseguda', fr: 's\'assoi*|s\'assied*|prend place', pt: 'senta-se|se senta*|sentam-se', de: 'setzt sich|setzen sich|nimmt platz', it: 'si siede|siedono|si accomoda*'},
  stand: {t: 'stand', es: 'se levanta*|se levanto|se pone de pie|se incorpora*|en pie', en: 'stands up|stand up|stood up|gets up|get up|got up|rises|rise|rose|jumps up|jumps to', ca: 'es lleva*|s\'aixeca*', fr: 'se leve*|se redresse*', pt: 'levanta-se|se levanta*|fica de pe', de: 'steht auf|stehen auf|erhebt sich', it: 'si alza*|si alzano|si rialza*'},
  turn: {t: 'turn', es: 'se gira*|se da la vuelta|se vuelve hacia|da media vuelta|se voltea*|gira*', en: 'turns around|turn around|turns away|spins around|turns back|whirls', ca: 'es gira*|fa mitja volta', fr: 'se retourne*|fait demi-tour', pt: 'vira-se|se vira*|da meia volta', de: 'dreht sich um|wendet sich', it: 'si gira*|si volta*'},
  face: {t: 'face', es: 'miro a|miro hacia|observo a|mira a|mira hacia|observa a|se queda mirando|clava la mirada|se vuelve hacia|encara*', en: 'looks at|look at|looked at|stares at|stared at|glances at|glanced at|watches|watched|faces|turns to|turned to|eyes|gazes at|gazed at', ca: 'mira a|mira cap a|observa', fr: 'regarde|fixe|observe|se tourne vers', pt: 'olha para|encara*|observa', de: 'sieht an|schaut an|blickt|starrt', it: 'guarda|fissa|osserva|si volta verso'},
  // looking closely at something, painting, showing, wearing (the clothes are read for the look: see lookOf)
  study: {t: 'loop', c: ['np-observar'], dur: 2.4, es: 'observa*|contempla*|examina*|estudia*|revisa*|analiza*|investiga*|lee|leen|leyendo|mira emocionad*|mira fijamente|mira los|mira las|mira el|mira la|mira una|mira un|mira sus|mira su', en: 'examines|studies|reads|observes|inspects|checks|looks at the|looks at his|looks at her|stares at the|watches the', ca: 'observa*|examina*|estudia*|llegeix', fr: 'observe*|examine*|etudie*|lit', pt: 'observa*|examina*|estuda*|le', de: 'beobachtet|untersucht|liest|studiert', it: 'osserva*|esamina*|studia*|legge'},
  paint: {t: 'loop', c: ['np-pintar'], dur: 2.6, es: 'pinta|pintan|pintando|pinto|dibuja*|anade*|retoca*|esboza*|da una pincelada|da pinceladas|da unos toques', en: 'paint*|draws|drawing|sketch*|adds a|adds some|dabs', ca: 'pinta*|dibuixa*|afegeix', fr: 'peint|peignent|dessine*|ajoute', pt: 'pinta*|desenha*|acrescenta*', de: 'malt|zeichnet|fugt hinzu', it: 'dipinge*|disegna*|aggiunge*'},
  show: {t: 'pose', pose: 'senalar', dur: 1.4, es: 'muestra*|ensena*|alza el|alza la|sostiene*|levanta hacia|levanta el pincel', en: 'shows|holds up|raises the|raises his|raises her|holds out', ca: 'mostra*|ensenya*', fr: 'montre|brandit|leve le|leve la', pt: 'mostra*|ergue*', de: 'zeigt vor|halt hoch|hebt', it: 'mostra*|alza il|alza la'},
  wear: {t: 'none', es: 'lleva una|lleva un|lleva puest*|viste|visten|vestid*|lleva gafas|lleva bata', en: 'wears|wearing|dressed in|has on', ca: 'porta una|porta un|vesteix', fr: 'porte une|porte un|vetu', pt: 'veste|vestid*|usa uma|usa um', de: 'tragt|gekleidet', it: 'indossa|veste|vestit*'},
  // gestures and talk
  wave: {t: 'clip', c: ['np-saludar'], loops: 2, es: 'saludo con la mano|se despidio|saluda*|hace un gesto con la mano|agita la mano|se despide*', en: 'wave*|greet*|waves goodbye|waves hello|says goodbye', ca: 'saluda*|s\'acomiada*', fr: 'salue*|fait signe|agite la main', pt: 'acena*|cumprimenta*|despede-se', de: 'wink*|gruss*|verabschied*', it: 'saluta*|fa un cenno'},
  nod: {t: 'clip', c: ['ual2-Yes', 'np-si'], es: 'asintio|asient*|dice que si|afirma con la cabeza', en: 'nod*|agrees', ca: 'assenteix*|diu que si', fr: 'acquiesce*|hoche la tete', pt: 'acena com a cabeca|concorda*', de: 'nickt|nicken', it: 'annuisce*|fa cenno di si'},
  no: {t: 'clip', c: ['np-no', 'ual2-Idle_No_Loop'], es: 'niega*|dice que no|sacude la cabeza|menea la cabeza', en: 'shakes his head|shakes her head|shakes their head|shake* head|refus*|denies', ca: 'nega*|diu que no', fr: 'secoue la tete|refuse*|nie', pt: 'nega*|abana a cabeca', de: 'schuttelt den kopf|verneint', it: 'nega*|scuote la testa'},
  clap: {t: 'clip', c: ['np-aplaudir'], loops: 4, es: 'aplaud*', en: 'clap*|applaud*', ca: 'aplaudeix*', fr: 'applaudi*', pt: 'aplaude*', de: 'klatsch*|applaudier*', it: 'applaud*'},
  spin: {t: 'spin', es: 'da una vuelta|da vueltas|gira sobre si mism*|hace un giro|hace una pirueta|pirueta', en: 'spins|twirls|pirouettes|does a spin|turns in a circle', ca: 'fa una volta|gira sobre si mateix', fr: 'tourne sur lui-meme|tourne sur elle-meme|virevolte|fait une pirouette', pt: 'da uma volta|gira sobre si|faz uma pirueta', de: 'dreht sich im kreis|wirbelt herum|dreht eine pirouette', it: 'fa una piroetta|gira su se stess*|volteggia'},
  stop: {t: 'none', es: 'se detiene|se detienen|se queda quiet*|frena|frenan|se para en seco', en: 'stops|stop|halts|freezes|comes to a stop', ca: 's\'atura|s\'aturen', fr: 's\'arrete|s\'arretent|se fige', pt: 'detem-se|detem|estaca|para de andar|para de correr', de: 'halt an|bleibt stehen|stoppt', it: 'si ferma|si fermano|si blocca'},
  headdown: {t: 'expr', e: 'triste', es: 'baja la cabeza|agacha la cabeza|baja la mirada|agacha la mirada|cabizbaj*', en: 'lowers his head|lowers her head|bows his head|bows her head|hangs his head|hangs her head|looks down', ca: 'abaixa el cap|abaixa la mirada|cot', fr: 'baisse la tete|baisse les yeux', pt: 'baixa a cabeca|abaixa a cabeca|baixa os olhos', de: 'senkt den kopf|senkt den blick|schaut zu boden', it: 'abbassa la testa|abbassa lo sguardo|china il capo'},
  holster: {t: 'none', es: 'guarda el revolver|guarda la pistola|guarda el arma|enfunda*|envaina*|guarda la espada', en: 'holsters|sheathes|puts away his gun|puts away her gun|puts the gun away', ca: 'desa el revolver|enfunda|embeina', fr: 'rengaine|range son arme|range son revolver', pt: 'guarda o revolver|guarda a arma|embainha', de: 'steckt die waffe weg|steckt den revolver weg|steckt das schwert weg', it: 'rinfodera|ripone la pistola'},
  charge: {t: 'approach', fast: true, es: 'embiste*|carga contra|se abalanza*|arremete*|se lanza contra|se lanza sobre', en: 'charges at|charges toward|charges|lunges at|rushes at|rushes toward|lunges', ca: 'carrega contra|s\'abalanca|envesteix', fr: 'charge|fonce sur|se jette sur|se rue sur', pt: 'investe contra|avanca contra|se lanca sobre|carrega contra', de: 'sturmt auf|sturzt sich auf|greift an', it: 'carica|si scaglia contro|si lancia su'},
  bow: {t: 'clip', c: ['np-reverencia'], es: 'reverencia|se inclina*|hace una reverencia', en: 'bow*', ca: 'reverencia|s\'inclina*', fr: 's\'incline*|fait la reverence', pt: 'faz uma venia|curva-se', de: 'verbeug*', it: 'si inchina*|fa un inchino'},
  phone: {t: 'loop', c: ['ual2-Idle_TalkingPhone_Loop'], dur: 3, es: 'telefon*|llama a|llama por|movil|contesta el telefono|marca un numero', en: 'phone*|calls|on the phone|dials|answers the phone|texts', ca: 'telefon*|truca*', fr: 'telephone*|appelle', pt: 'telefon*|liga para|atende o telefone', de: 'telefonier*|ruft an', it: 'telefon*|chiama'},
  drink: {t: 'clip', c: ['ual2-Consume'], es: 'bebio|bebieron|comio|comieron|beb*|come|comen|comiendo|da un sorbo|da un bocado|prueba*', en: 'drink*|drank|eat|eats|ate|eating|sip*|bites', ca: 'beu|beuen|menja*', fr: 'boit|boivent|mange*|sirote*', pt: 'bebe*|come|comem|comendo', de: 'trink*|isst|essen', it: 'beve*|mangia*|sorseggi*'},
  look: {t: 'clip', c: ['np-mirar'], es: 'mira alrededor|mira a su alrededor|busca con la mirada|observa el lugar|otea*|vigila*', en: 'looks around|look around|scans the room|searches|glances around', ca: 'mira al voltant', fr: 'regarde autour', pt: 'olha em volta|olha ao redor', de: 'sieht sich um|schaut sich um', it: 'si guarda intorno'},
  wait: {t: 'loop', c: ['ual1-Idle_Loop'], dur: 2.5, es: 'espera*|aguarda*|se queda quiet*|permanece*', en: 'wait*|stands still|stays|remains', ca: 'espera*', fr: 'attend*|reste immobile', pt: 'espera*|aguarda*', de: 'wartet|warten|bleibt stehen', it: 'aspetta*|resta*'},
  arms: {t: 'loop', c: ['ual2-Idle_FoldArms_Loop'], dur: 2.5, es: 'cruza los brazos|brazos cruzados|se cruza de brazos', en: 'folds his arms|folds her arms|crosses his arms|crosses her arms|arms crossed|fold* arms', ca: 'creua els bracos', fr: 'croise les bras', pt: 'cruza os bracos', de: 'verschrankt die arme', it: 'incrocia le braccia'},
  crouch: {t: 'loop', c: ['ual1-Crouch_Idle_Loop'], dur: 2, es: 'se agacha*|se pone en cuclillas|se esconde*|se oculta*', en: 'crouch*|ducks|duck|kneels|hides|squats', ca: 's\'ajup*|s\'amaga*', fr: 's\'accroupi*|se cache*', pt: 'agacha-se|se agacha*|esconde-se', de: 'duckt sich|hockt|versteckt sich', it: 'si accovaccia*|si nasconde*'},
  lean: {t: 'loop', c: ['ual2-Idle_Rail_Loop'], dur: 3, es: 'se apoya*|apoyad*', en: 'lean*', ca: 'es recolza*', fr: 's\'appuie*|s\'adosse*', pt: 'apoia-se|encosta-se', de: 'lehnt', it: 'si appoggia*'},
  drive: {t: 'loop', c: ['ual1-Driving_Loop'], dur: 3, es: 'conduc*|maneja*', en: 'driv*|drove', ca: 'condueix*', fr: 'condui*', pt: 'conduz*|dirige*', de: 'fahrt|fahren', it: 'guida*'},
  swim: {t: 'walkclip', c: ['ual1-Swim_Fwd_Loop'], es: 'nada|nadan|nadando|bucea*', en: 'swim*|swam|dives', ca: 'neda*', fr: 'nage*', pt: 'nada|nadam|nadando', de: 'schwimm*', it: 'nuota*'},
  dance: {t: 'loop', c: ['ual1-Dance_Loop'], dur: 3, es: 'bail*|danza*', en: 'danc*', ca: 'balla*|dansa*', fr: 'danse*', pt: 'danca*', de: 'tanz*', it: 'balla*|danza*'},
  // action
  jump: {t: 'clip', c: ['np-saltar'], es: 'saltaron|salta|saltan|salto|saltando|brinca*|da un salto|pega un bote', en: 'jump*|leap*|hops|hop', ca: 'salta*', fr: 'saute*|bondi*', pt: 'salta*|pula*', de: 'springt|springen|hupft', it: 'salta*|balza*'},
  climb: {t: 'clip', c: ['ual2-ClimbUp_1m'], es: 'trepa*|escala*|sube a|se sube', en: 'climb*|clambers', ca: 'enfila*|escala*', fr: 'grimpe*|escalade*', pt: 'trepa*|escala*|sobe em', de: 'klettert', it: 'si arrampica*|scala*'},
  roll: {t: 'clip', c: ['ual1-Roll'], es: 'rueda por|voltereta|se tira al suelo|da una voltereta', en: 'rolls|roll|somersault*|tumbles', ca: 'tomb*|fa una tombarella', fr: 'roule*|roulade', pt: 'rola*|cambalhota', de: 'rollt|purzel*', it: 'rotola*|capriola'},
  fall: {t: 'clip', c: ['ual1-Death01'], down: true, es: 'cae|caen|cayo|cayendo|se desploma*|se derrumba*|muere|mueren|murio|se desmaya*|tropieza y cae', en: 'fall*|fell|collaps*|dies|die|died|faint*|drops dead', ca: 'cau|cauen|mor|es desmaia*', fr: 'tombe*|s\'effondre*|meurt|s\'evanoui*', pt: 'cai|caem|desmaia*|morre*', de: 'fallt|sturzt|stirbt|bricht zusammen', it: 'cade*|crolla*|muore|sviene'},
  getup: {t: 'clip', c: ['ual2-LayToIdle'], up: true, es: 'se levanta del suelo|se incorpora del suelo|se recupera', en: 'gets up off the floor|gets back up|picks himself up|picks herself up|recovers', ca: 'es lleva de terra', fr: 'se releve', pt: 'levanta-se do chao', de: 'rappelt sich auf', it: 'si rialza da terra'},
  punch: {t: 'clip', c: ['ual1-Punch_Jab', 'ual1-Punch_Cross', 'ual2-Melee_Hook'], es: 'golpeo|golpearon|pego a|golpea*|pega a|pega un|punetazo|le da un golpe|aporrea*|atiza*|ataca a', en: 'punch*|hits|hit|strikes|strike|slaps|attacks|smacks|socks', ca: 'colpeja*|pega a|cop de puny', fr: 'frappe*|cogne*|gifle*|attaque*', pt: 'soca*|bate em|golpeia*|ataca*', de: 'schlagt|boxt|greift an', it: 'colpisce*|picchia*|da un pugno|attacca*'},
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
  pick: {t: 'clip', c: ['ual1-PickUp_Table'], es: 'saco|sacaron|cogio|cogieron|tomo el|tomo la|tomo un|tomo una|agarro|recogio|coge*|recoge*|agarra*|toma el|toma la|toma un|toma una|levanta el|levanta la|saca*', en: 'pick* up|grabs|grabbed|takes the|takes a|took the|took a|lifts|lifted|takes out|took out|pulls out|pulled out', ca: 'agafa*|recull*|treu|treuen', fr: 'prend|ramasse*|saisit|sort', pt: 'pega*|apanha*|agarra*|tira', de: 'nimmt|hebt auf|greift|holt heraus', it: 'prende*|raccoglie*|afferra*|tira fuori'},
  touch: {t: 'clip', c: ['ual1-Interact'], es: 'abrio|abrieron|cerro|cerraron|encendio|apago|pulso|abre|abren|cierra*|pulsa*|toca la|toca el|llama a la puerta|enciende*|apaga*', en: 'opens|open|opened|closes|closed|presses|pressed|knocks|knocked|touches|touched|switches|turns on|turns off|turned on|turned off', ca: 'obre|tanca*|prem', fr: 'ouvre*|ferme*|appuie|frappe a la porte', pt: 'abre|fecha*|carrega no|bate a porta', de: 'offnet|schliesst|druckt|klopft', it: 'apre|chiude*|preme|bussa'},
  carry: {t: 'walkclip', c: ['ual2-Walk_Carry_Loop'], es: 'carga*|lleva en brazos|transporta*', en: 'carr*|hauls', ca: 'carrega*|porta en bracos', fr: 'porte*|transporte*', pt: 'carrega*|transporta*', de: 'tragt', it: 'porta in braccio|trasporta*'},
  fix: {t: 'clip', c: ['ual1-Fixing_Kneeling'], es: 'arregla*|repara*|se arrodilla*', en: 'fix*|repair*|kneels down', ca: 'arregla*|repara*', fr: 'repare*|s\'agenouille*', pt: 'conserta*|repara*|ajoelha-se', de: 'repariert|kniet', it: 'ripara*|si inginocchia*'},
  // still poses held for a moment
  point: {t: 'pose', pose: 'senalar', dur: 1.2, es: 'senalo|senala*|apunta con el dedo|indica*', en: 'point*|gestures toward*', ca: 'assenyala*', fr: 'montre du doigt|designe*|pointe', pt: 'aponta*|indica*', de: 'zeigt', it: 'indica*'},
  think: {t: 'pose', pose: 'pensativo', dur: 1.6, es: 'penso|dudo|piensa*|reflexiona*|duda*|medita*', en: 'think*|ponder*|hesitat*|wonders', ca: 'pensa*|reflexiona*|dubta*', fr: 'reflechi*|pense*|hesite*', pt: 'pensa*|reflete*|hesita*', de: 'denkt|uberlegt|zogert', it: 'pensa*|riflette*|esita*'},
  shrug: {t: 'pose', pose: 'encoger', dur: 1, es: 'se encoge de hombros|encoge los hombros', en: 'shrug*', ca: 'arronsa les espatlles', fr: 'hausse les epaules', pt: 'encolhe os ombros', de: 'zuckt mit den schultern', it: 'alza le spalle|scrolla le spalle'},
  cover: {t: 'pose', pose: 'taparse', dur: 1.4, es: 'se tapa la cara|se cubre la cara|se esconde la cara', en: 'covers his face|covers her face|buries his face|buries her face|facepalm*', ca: 'es tapa la cara', fr: 'se cache le visage', pt: 'tapa a cara', de: 'verbirgt das gesicht', it: 'si copre il viso'},
  stretch: {t: 'pose', pose: 'estirarse', dur: 1.4, es: 'se estira*|se despereza*', en: 'stretch*|yawns', ca: 'es estira*', fr: 's\'etire*', pt: 'espreguica-se|estica-se', de: 'streckt sich|reckt sich', it: 'si stiracchia*'},
  watch: {t: 'pose', pose: 'reloj', dur: 1.2, es: 'mira el reloj|mira la hora', en: 'checks his watch|checks her watch|looks at the watch|checks the time', ca: 'mira el rellotge', fr: 'regarde sa montre', pt: 'olha o relogio', de: 'schaut auf die uhr', it: 'guarda l\'orologio'},
  cheer: {t: 'pose', pose: 'victoria', dur: 1.4, es: 'celebra*|festeja*|alza los brazos|grita de alegria', en: 'cheer*|celebrat*|raises his arms|raises her arms|triumph*', ca: 'celebra*|aixeca els bracos', fr: 'celebre*|leve les bras', pt: 'celebra*|festeja*', de: 'jubelt|feiert', it: 'esulta*|festeggia*'},
  salute: {t: 'pose', pose: 'militar', dur: 1.2, es: 'saludo militar|se cuadra*', en: 'salutes', ca: 'saluda militarment', fr: 'salut militaire|fait le salut', pt: 'faz continencia', de: 'salutiert', it: 'fa il saluto militare'},
  hips: {t: 'pose', pose: 'jarra', dur: 1.4, es: 'en jarras|brazos en jarra|manos en la cintura', en: 'hands on hips|hands on his hips|hands on her hips', ca: 'mans a la cintura', fr: 'mains sur les hanches', pt: 'maos na cintura', de: 'hande in die hufte', it: 'mani sui fianchi'},
  // two people
  hug: {t: 'group', g: 'g2-abrazo', dur: 2, es: 'abrazo a|la abrazo|lo abrazo|se abrazaron|abraza*|se abrazan', en: 'hug*|embrac*', ca: 'abraca*', fr: 'enlace*|serre dans ses bras', pt: 'abraca*', de: 'umarmt', it: 'abbraccia*'},
  shake: {t: 'group', g: 'g2-apreton', dur: 1.6, es: 'estrecha la mano|le da la mano|se dan la mano|apreton de manos', en: 'shakes hands|shakes his hand|shakes her hand|shake hands', ca: 'encaixa*|es donen la ma', fr: 'serre la main|se serrent la main', pt: 'aperta a mao|apertam as maos', de: 'schutteln die hande|gibt die hand', it: 'stringe la mano|si stringono la mano'},
  five: {t: 'group', g: 'g2-chocar', dur: 1.2, es: 'choca esos cinco|chocan los cinco|chocan las manos', en: 'high five*|high-five*', ca: 'piquen de mans', fr: 'tope la|tapent dans la main', pt: 'batem as maos|toca aqui', de: 'klatschen ab|high five', it: 'batte il cinque|battono il cinque'},
  console: {t: 'group', g: 'g2-consolar', dur: 2, es: 'consuela*|reconforta*', en: 'consol*|comfort*', ca: 'consola*|conforta*', fr: 'console*|reconforte*', pt: 'consola*|conforta*', de: 'trostet', it: 'consola*|conforta*'},
  shoulder: {t: 'group', g: 'g2-hombro', dur: 1.6, es: 'mano en el hombro|le pone la mano en el hombro|le toca el hombro', en: 'hand on his shoulder|hand on her shoulder|pats him on the shoulder|pats her on the shoulder|taps his shoulder|taps her shoulder', ca: 'ma a l\'espatlla', fr: 'main sur l\'epaule', pt: 'mao no ombro', de: 'hand auf die schulter', it: 'mano sulla spalla'},
  threaten: {t: 'group', g: 'g2-amenaza', dur: 1.6, es: 'amenaza*|intimida*|encara a', en: 'threaten*|intimidat*|looms over|confronts', ca: 'amenaca*', fr: 'menace*|intimide*', pt: 'ameaca*|intimida*', de: 'droht|bedroht', it: 'minaccia*'},
  helpup: {t: 'group', g: 'g2-levantar', dur: 1.8, es: 'ayuda a levantarse|le ayuda a levantarse|le tiende la mano', en: 'helps him up|helps her up|helps them up|pulls him up|pulls her up', ca: 'ajuda a aixecar-se', fr: 'aide a se relever', pt: 'ajuda a levantar', de: 'hilft auf', it: 'aiuta a rialzarsi'},
  dancewith: {t: 'group', g: 'g2-baile', dur: 3, es: 'bailan juntos|baila con|bailan agarrados', en: 'dances with|dance together', ca: 'balla amb|ballen junts', fr: 'danse avec|dansent ensemble', pt: 'danca com|dancam juntos', de: 'tanzt mit|tanzen zusammen', it: 'balla con|ballano insieme'},
  sleep: {t: 'state', pose: 'tumbado', sleep: true, es: 'duerme|duermen|dormid*|durmiendo|dormita|echa una siesta', en: 'sleeps|sleeping|asleep|naps|napping|dozes|dozing', ca: 'dorm|dormen|adormit*|dormint', fr: 'dort|dorment|endormi*|sommeille', pt: 'dorme|dormem|dormindo|adormecid*', de: 'schlaft|schlafen|schlafend|eingeschlafen|doest', it: 'dorme|dormono|addormentat*|dormendo|sonnecchia'},
  lie: {t: 'state', pose: 'tumbado', es: 'tumbad*|acostad*|se tumba*|se acuesta*|yace|esta en la cama|en la cama', en: 'lies|lying|lies down|lay down|in bed|lies in bed', ca: 'estirat*|ajagut*|al llit', fr: 'allonge*|couche*|au lit', pt: 'deitad*|deita-se|na cama', de: 'liegt|liegen|im bett', it: 'sdraiat*|disteso|distesa|a letto'},
  drop: {t: 'expr', e: 'sorpresa', es: 'deja caer|se le cae|se le caen|tira sin querer', en: 'drops|dropped|lets fall', ca: 'deixa caure|li cau', fr: 'laisse tomber|fait tomber', pt: 'deixa cair|deixou cair', de: 'lasst fallen|lasst los', it: 'fa cadere|lascia cadere'},
  handup: {t: 'pose', pose: 'saludo', dur: 1.4, es: 'levanta la mano|alza la mano|levanto la mano', en: 'raises her hand|raises his hand|raises a hand|puts up her hand|puts up his hand|raised her hand|raised his hand', ca: 'aixeca la ma|alca la ma', fr: 'leve la main|a leve la main', pt: 'levanta a mao|ergue a mao', de: 'hebt die hand|meldet sich', it: 'alza la mano|solleva la mano'},
  wake: {t: 'clip', c: ['np-respirar'], es: 'se despierta*|despierta|abre los ojos|abre un ojo|bosteza', en: 'wakes up|wakes|woke up|opens his eyes|opens her eyes|opens its eyes|opens one eye|opens an eye|yawns', ca: 'es desperta|desperta|obre els ulls|obre un ull|badalla', fr: 'se reveille|ouvre les yeux|ouvre un oeil|baille', pt: 'acorda|desperta|abre os olhos|abre um olho|boceja', de: 'wacht auf|erwacht|offnet die augen|offnet ein auge|gahnt', it: 'si sveglia|apre gli occhi|apre un occhio|sbadiglia'},
  // fighting, magic, rescue, and the states people are in
  raise: {t: 'pose', pose: 'espada', dur: 1.5, es: 'levanta su espada|alza su espada|levanta la espada|alza la espada|levanta su arma|blande*|desenvaina*|levanta su katana|alza su katana|empuna*|desenfunda*', en: 'raises his sword|raises her sword|raises the sword|raises his weapon|raises her weapon|lifts his sword|lifts her sword|brandish*|draws his sword|draws her sword|unsheathes|draws his gun|draws her gun', ca: 'aixeca la seva espasa|aixeca l\'espasa|desembeina', fr: 'leve son epee|leve l\'epee|brandit|degaine*', pt: 'ergue a espada|levanta a espada|empunha*|desembainha*|saca a arma', de: 'hebt sein schwert|hebt ihr schwert|zieht sein schwert|zieht ihr schwert|zieht die waffe', it: 'alza la spada|solleva la spada|brandisce|sguaina*|estrae la pistola'},
  bound: {t: 'state', pose: 'cautivo', es: 'atrapad*|encadenad*|maniatad*|prisioner*|cautiv*|apresad*|secuestrad*|amordazad*|esposad*', en: 'chained|tied up|trapped|captive|imprisoned|held captive|shackled|handcuffed|bound and', ca: 'encadenat*|lligat*|atrapat*|presoner*|captiu*', fr: 'enchaine*|ligote*|prisonnier*|prisonniere|piege*|captive|captif|attache*', pt: 'acorrentad*|amarrad*|prisioneir*|cativ*|aprisionad*|algemad*', de: 'gefesselt|gefangen|angekettet|eingesperrt', it: 'incatenat*|legat*|prigionier*|intrappolat*|catturat*|ammanettat*'},
  free: {t: 'free', es: 'libera a|rescata*|salva a|desata a|rompe las cadenas|rompe sus cadenas|corta las cuerdas|corta sus cuerdas|libera de', en: 'frees|free her|free him|rescues|rescue|saves her|saves him|unties|breaks the chains|breaks her chains|breaks his chains|cuts the ropes', ca: 'allibera|rescata|salva a|trenca les cadenes', fr: 'libere|delivre|sauve|detache|brise les chaines', pt: 'liberta*|resgata*|salva a|salva o|desamarra*|parte as correntes|quebra as correntes', de: 'befreit|rettet|bindet los|sprengt die ketten|zerbricht die ketten', it: 'libera|salva|slega|spezza le catene|rompe le catene'},
  vanish: {t: 'vanish', es: 'se desintegra*|se desvanece*|se convierte en cenizas|se convierte en polvo|se esfuma*|se disuelve*|se evapora*', en: 'vanishes|disintegrates|fades away|turns to dust|turns to ash*|dissolves|evaporates|crumbles to', ca: 'es desintegra|s\'esvaeix|es converteix en cendra', fr: 'se desintegre|s\'evanouit dans|disparait en fumee|tombe en poussiere|se volatilise', pt: 'desintegra-se|se desintegra|desvanece|vira cinzas|vira po', de: 'zerfallt|lost sich auf|zerfallt zu staub|verpufft', it: 'si disintegra|svanisce|si dissolve|diventa cenere'},
  apart: {t: 'apart', es: 'se separan|se apartan|se alejan el uno del otro|se distancian|retroceden', en: 'separate|break apart|step apart|pull apart|move apart|back away|backs away|steps back', ca: 'se separen|es separen|s\'aparten|retrocedeixen', fr: 'se separent|s\'ecartent|reculent|recule', pt: 'se separam|afastam-se|recuam|recua', de: 'trennen sich|weichen zuruck|weicht zuruck|treten zuruck', it: 'si separano|si allontanano|indietreggiano|indietreggia'},
  float: {t: 'float', es: 'flota|flotan|flotando|levita*|planea', en: 'floats|floating|float|hovers|hovering|glides', ca: 'flota|floten|levita', fr: 'flotte|flottent|levite|plane', pt: 'flutua|flutuam|levita|paira', de: 'schwebt|schweben|gleitet', it: 'fluttua|fluttuano|levita|aleggia'},
  fly: {t: 'fly', es: 'se va volando|sale volando hacia|echa a volar|alza el vuelo|despega|vuela|vuelan|volando', en: 'flies away|flies off|fly away|takes off|flies|soars|fly|flying', ca: 's\'enlaira|vola|volen|se\'n va volant', fr: 's\'envole|vole|volent|decolle', pt: 'voa|voam|levanta voo|sai voando|descola', de: 'fliegt|fliegt davon|fliegt weg|hebt ab', it: 'vola|volano|vola via|decolla|prende il volo'},
  land: {t: 'land', es: 'aterriza*|cae del cielo|desciende del cielo|baja del cielo', en: 'lands|landing|touches down|drops down from|descends from the sky', ca: 'aterra', fr: 'atterrit|atterrissent|se pose', pt: 'aterra|aterrissa|pousa', de: 'landet|landen|setzt auf', it: 'atterra|atterrano'},
  follow: {t: 'follow', es: 'sigue a|siguen a|persigue*|va tras|corre tras|la sigue|le sigue|lo sigue|los sigue', en: 'follows|chases|pursues|goes after|runs after|follow her|follow him|chase|pursue|go after|run after|chasing|pursuing', ca: 'segueix|persegueix', fr: 'suit|suivent|poursuit|poursuivent|court apres', pt: 'segue|seguem|persegue*|corre atras', de: 'folgt|folgen|verfolgt|lauft hinterher|rennt hinterher', it: 'segue|seguono|insegue*|corre dietro'},
  tie: {t: 'tie', es: 'ata a|le ata|lo ata|la ata|amarra a|maniata*|esposa a|captura a|apresa a', en: 'ties up|ties him|ties her|ties them|binds|handcuffs|captures|arrests', ca: 'lliga a|captura', fr: 'attache|ligote|capture|arrete', pt: 'amarra|algema|captura|prende', de: 'fesselt|bindet|verhaftet|nimmt fest', it: 'lega|ammanetta|cattura|arresta'},
  serve: {t: 'give', es: 'sirve|sirven|sirvio|sirvieron|le sirve|le pone|le pone un|escancia', en: 'serves|served|pours|poured', ca: 'serveix|li posa', fr: 'sert|servit|verse', pt: 'serve|serviu|deita', de: 'serviert|schenkt ein|bringt', it: 'serve|servi|versa'},
  give: {t: 'give', es: 'le dio|le entrego|le paso|le ofrecio|le da|le entrega|entrega*|le pasa|le ofrece|le tiende', en: 'hands him|hands her|hands them|hands|gives|passes him|passes her|offers', ca: 'li dona|li dona|entrega', fr: 'lui donne|lui tend|tend|donne|remet|offre', pt: 'lhe da|entrega|oferece|passa-lhe', de: 'gibt ihm|gibt ihr|reicht|uberreicht', it: 'gli da|le da|porge|consegna|offre'},
  embrace: {t: 'group', g: 'g2-abrazo', dur: 2, es: 'salta a sus brazos|se lanza a sus brazos|se echa en sus brazos|corre a sus brazos|besa*|le da un beso|se besan|beso', en: 'jumps into his arms|jumps into her arms|leaps into|throws herself into|throws himself into|kiss*', ca: 'salta als seus bracos|fa un peto|li fa un peto|es besen|besa', fr: 'saute dans ses bras|se jette dans ses bras|embrasse|s\'embrassent|fait un bisou', pt: 'salta para os bracos|atira-se aos bracos|beija*|beijo', de: 'springt in seine arme|springt in ihre arme|kusst|kussen', it: 'salta tra le sue braccia|si getta tra le sue braccia|bacia*|si baciano'},
  facing: {t: 'facing', es: 'se miran|se observan|se miran fijamente|se clavan la mirada|se encaran', en: 'stare at each other|look at each other|stare each other down|face each other|face off', ca: 'es miren|s\'observen', fr: 'se regardent|se fixent|se font face', pt: 'olham-se|encaram-se|se olham|se encaram', de: 'sehen sich an|starren sich an|stehen sich gegenuber', it: 'si guardano|si fissano|si fronteggiano'},
  unleash: {t: 'clip', c: ['ual1-Spell_Simple_Shoot'], es: 'libera un|libera una|desata*|desencadena*|lanza un ataque|invoca*|conjura*|canaliza*', en: 'unleashes|releases a|releases an|lets loose|summons|channels|invokes', ca: 'allibera un|desferma|invoca', fr: 'libere un|libere une|dechaine|invoque|deploie', pt: 'liberta um|liberta uma|desencadeia|invoca|conjura', de: 'entfesselt|setzt frei|beschwort|ruft herbei', it: 'scatena|sprigiona|libera un|libera una|evoca|invoca'},
  smoke: {t: 'clip', c: ['ual2-Consume'], es: 'fuma*|enciende un cigarr*|enciende un puro|da una calada', en: 'smok*|lights a cigarette|lights a cigar|takes a drag', ca: 'fuma*|encen una cigarreta', fr: 'fume*|allume une cigarette', pt: 'fuma*|acende um cigarro', de: 'raucht|zundet sich eine zigarette', it: 'fuma*|accende una sigaretta'},
  breathe: {t: 'loop', c: ['np-respirar'], dur: 2.2, es: 'respira hondo|toma aire|suspira*|coge aire|respira profundamente', en: 'takes a deep breath|breathes in|breathes deeply|sighs|exhales', ca: 'respira fondo|sospira', fr: 'respire profondement|soupire|inspire', pt: 'respira fundo|suspira', de: 'atmet tief|seufzt|holt luft', it: 'respira profondamente|sospira'},
  play: {t: 'clip', c: ['np-saltar'], es: 'juega|juegan|jugando|juguetea*|brinca de alegria', en: 'plays|playing|play with|frolics', ca: 'juga|juguen', fr: 'joue|jouent|jouant', pt: 'brinca*|joga com', de: 'spielt|spielen', it: 'gioca|giocano|giocando'},
  wag: {t: 'expr', e: 'sonrisa', es: 'mueve la cola|menea la cola|cola se mueve|cola se agita|agita la cola', en: 'wags|wagging|tail wags', ca: 'mou la cua|remena la cua', fr: 'remue la queue|agite la queue', pt: 'abana a cauda|abana o rabo', de: 'wedelt', it: 'scodinzola|muove la coda'},
  // faces (the face changes from here on; see SC_EMO for the words in parentheticals)
  smile: {t: 'expr', e: 'sonrisa', es: 'sonrio|sonrieron|sonrie*|sonriendo', en: 'smil*|grins|grinning|beams', ca: 'somriu*', fr: 'sourit|sourient|souriant', pt: 'sorri*', de: 'lachelt|grinst', it: 'sorride*'},
  laugh: {t: 'expr', e: 'risa', es: 'se rio|se rieron|rio|rie|rien|riendo|se rie|se rien|carcajada|se parte de risa', en: 'laugh*|giggl*|chuckl*', ca: 'riu|riuen|rient', fr: 'rit|rient|riant|eclate de rire', pt: 'ri|riem|rindo|gargalha*', de: 'lacht|lachen|kichert', it: 'ride|ridono|ridendo'},
  cry: {t: 'expr', e: 'triste', es: 'lloro|lloraron|sollozo|llora*|solloza*|se entristece*', en: 'cr|cries|cried|crying|sob*|weep*|tears up', ca: 'plora*', fr: 'pleure*|sanglote*', pt: 'chora*|solucar*', de: 'weint|schluchzt', it: 'piange*|singhiozza*'},
  anger: {t: 'expr', e: 'enfado', es: 'se enfada*|se enoja*|frunce el ceno|se irrita*|furios*', en: 'frown*|scowl*|glares|gets angry|fumes|seethes', ca: 's\'enfada*|arrufa les celles', fr: 'se fache*|fronce les sourcils', pt: 'zanga-se|franze a testa|irrita-se', de: 'runzelt die stirn|wird wutend|argert sich', it: 'si arrabbia*|aggrotta*'},
  shout: {t: 'expr', e: 'grito', es: 'grito|gritaron|chillo|grita*|chilla*|vocifera*|ruge*', en: 'shout*|yell*|scream*|roar*', ca: 'crida*|xiscla*', fr: 'crie*|hurle*', pt: 'grita*|berra*', de: 'schreit|brullt|ruft laut', it: 'grida*|urla*'},
  surprise: {t: 'expr', e: 'sorpresa', es: 'se sorprende*|sorprendid*|asombrad*|se queda boquiabierto|se sobresalta*', en: 'gasp*|startl*|is surprised|stunned|shocked|stares in disbelief', ca: 'se sorpren*|sorpres*', fr: 'sursaute*|surpris*|stupefait*', pt: 'surpreende-se|surpreendid*|espantad*', de: 'erschrickt|staunt|uberrascht', it: 'sobbalza*|sorpres*|stupit*'},
  fear: {t: 'expr', e: 'miedo', es: 'tiembla*|asustad*|aterrad*|tiene miedo|se asusta*', en: 'trembl*|scared|frightened|terrified|cowers|shivers', ca: 'tremola*|espantat*|te por', fr: 'tremble*|effraye*|a peur|terrifie*', pt: 'treme*|assustad*|tem medo', de: 'zittert|hat angst|erschrocken', it: 'trema*|spaventat*|ha paura'},
  wink: {t: 'expr', e: 'guino', es: 'guina*|hace un guino', en: 'wink*', ca: 'fa l\'ullet', fr: 'fait un clin d\'oeil', pt: 'pisca o olho', de: 'zwinkert', it: 'fa l\'occhiolino'},
  sleep: {t: 'expr', e: 'dormido', es: 'duerme*|cierra los ojos|se duerme', en: 'sleep*|closes his eyes|closes her eyes|dozes', ca: 'dorm|tanca els ulls', fr: 'dort|ferme les yeux', pt: 'dorme*|fecha os olhos', de: 'schlaft|schliesst die augen', it: 'dorme*|chiude gli occhi'}
};
// words in a parenthetical or an adverb → a face (and how loud: a shout gets a closer, harder shot)
const SC_EMO = {
  sonrisa: 'sonri*|alegre*|content*|feliz|amable*|ilusionad*|emocionad*|suave*|relajad*|relajante|tranquil*|calmad*|seren*|dulce*|gentle|calm*|soothing|relaxed|softly|excited|smil*|happ*|cheerful*|kind*|warm*|pleased|glad|somri*|content*|joyeux|heureux|souri*|feliz|alegre|froh|glucklich|lachel*|felice|allegr*|sorrid*',
  risa: 'rie*|riendo|risa|carcajada|divertid*|burlon*|laugh*|chuckl*|amused|giggl*|riu|rient|rit|riant|ri|rindo|lacht|ridendo|ride',
  triste: 'triste*|llorando|lloros*|apenad*|abatid*|melancolic*|agotad*|cansad*|exhaust*|tired|weary|sad*|crying|tearful*|sorrowful*|devastated|ploran*|trist*|pleur*|chorando|traurig|weinend|piangendo',
  enfado: 'enfadad*|furios*|enojad*|irritad*|molest*|seco|cortante|frustrad*|frustrat*|angr*|furious*|annoyed|irritat*|cold*|sharp*|enfadat*|en colere|fache*|zangad*|irritad*|wutend|verargert|arrabbiat*|furios*',
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
  ['pan', 'panoramica|pan to|pan across|panoramique|panoramica|schwenk'],
  ['slow', 'camara lenta|a camara lenta|en camara lenta|ralenti|al ralenti|slow motion|slow-mo|slowmo|au ralenti|camera lenta|em camera lenta|zeitlupe|in zeitlupe|rallentatore|al rallentatore|super slow'],
  ['fast', 'camara rapida|fast motion|time lapse|timelapse|accelere|zeitraffer']
];
const SC_SHOT_PATS = SC_SHOTS.map(([k, v]) => [k, scPats(v)]);
function shotDirection(text) {
  const w = scWords(text), out = {};
  for (const [k, pats] of SC_SHOT_PATS) if (scFind(w, pats)) { if (['high', 'low'].includes(k)) out.angle = k; else if (['track', 'pan'].includes(k)) out.move = k; else if (k === 'slow' || k === 'fast') out.speed = k === 'slow' ? .4 : 2; else if (!out.size) out.size = k; }
  return Object.keys(out).length ? out : null;
}

// what is written like a speaker or a heading but is the camera's, the editor's or the page's: «SLOW MOTION:», «CÁMARA
// LENTA:», «FLASHBACK», «MÁS TARDE», «ACTO I», «SFX:» (a line made only of these words, numbers and roman numerals)
const SC_DIRECTIVE_W = new Set(('camara lenta rapida ralenti slow motion mo slowmo fast freeze frame imagen congelada congelado au en a al camera lento zeitlupe rallentatore ' +
  'flashback flash back forward flashforward montaje montage series serie of de shots planos intercut intercalado scene vuelta la escena later mas tarde moments momentos despues poco minutes minutos ' +
  'plus tard mais spater piu continuous continuo continua insert inserto super sobreimpresion rotulo titulo title titre titolo titel caption on screen pantalla angle angulo reverse contraplano ' +
  'aerial aerea aereo vista drone overhead cenital zenital dolly zoom in out crane grua establishing sfx fx vfx sound sonido music musica card black negro fondo end credits creditos ' +
  'act acto acte ato akt atto escena scena szene sequence secuencia sequencia sequenz sequenza prologo prologue prolog epilogo epilogue epilog parte part partie teil ' +
  'i ii iii iv v vi vii viii ix x uno dos tres one two three deux trois um dois eins zwei drei primero segundo tercero primeiro first second third premier deuxieme primo secondo terzo erster zweiter dritter final ' +
  'the el los las le les il lo o os as der die das cut corte fade fundido dissolve encadenado to fin end').split(' '));
const SC_DIR_SMALL = new Set('the el los las le les il lo o os as der die das i a al en au de of on in out to back un la'.split(' '));
function isDirective(s) {
  if (shotDirection(s)) return true;
  const w = scWords(s).filter(x => !/^\d+$/.test(x)); return w.length > 0 && w.every(x => SC_DIRECTIVE_W.has(x)) && !w.every(x => SC_DIR_SMALL.has(x));
}
const scActHead = s => /^(act|acto|acte|ato|akt|atto|prologo|prologue|prolog|epilogo|epilogue|epilog)\b/.test(scNorm(s));
// titles in front of a name: «Dr. Krane» is «Krane», «Captain Nova» is «Nova», «el Rey Sombra» is «Sombra» (a title
// alone still finds its one owner: «the Captain», «el sheriff»)
const SC_TITLES = new Set(('dr doctor doctora mr mrs ms miss mister sr sra srta senor senora senorita don dona capitan capitana captain capitaine capitao kapitan capitano comandante commander ' +
  'sheriff agente agent detective inspector inspectora nurse enfermera enfermero officer oficial sargento sergeant teniente lieutenant general coronel colonel profesor profesora professor prof rey reina king queen principe princesa ' +
  'prince princess lord lady sir madame monsieur mademoiselle mme mlle herr frau fraulein signor signora signorina tio tia uncle aunt santa san saint st fray sor el la le the of de del da do von van').split(' '));
const scContent = n => scWords(n).filter(w => !SC_TITLES.has(w));
const scTitle = n => n.split(/(\s+|-)/).map(w => /^[\s-]+$/.test(w) ? w : w.charAt(0).toLocaleUpperCase() + w.slice(1).toLocaleLowerCase()).join('');
// the words that mean each character in the action: every word of the name but its titles (a title alone, if no one
// else has it), and of its other names
function castKeys(cast) {
  const out = [], count = {};
  for (const c of cast) for (const w of new Set([c.name, ...(c.aka || [])].flatMap(scWords))) count[w] = (count[w] || 0) + 1;
  cast.forEach((c, i) => { for (const w of new Set([c.name, ...(c.aka || [])].flatMap(scWords))) if ((!SC_TITLES.has(w) || count[w] === 1) && w.length > 1 && !['el', 'la', 'le', 'the', 'de', 'del', 'of'].includes(w)) out.push([w, i]); });
  return out;
}
const scWho = (text, cast) => { const w = scWords(text), K = castKeys(cast); return [...new Set(w.flatMap(x => K.filter(k => k[0] === x).map(k => k[1])))]; };

/* ---------- the script into scenes and beats ---------- */
const SC_HEAD = /^(\.(?!\.)|(int|ext|est|int\.?\/ext|ext\.?\/int|i\/e|interior|exterior|esc|escena|scene|seq)[\.\s:])/i;
const SC_TRANS = /^(>[^<]*$|[A-ZÁÉÍÓÚÑÇ\s]+(TO|A|À|AL|SU|NACH|PARA|ZU|AUF|SOBRE):$|FADE (IN|OUT|TO BLACK)|FUNDIDO|CORTE A|CORTE:|CUT TO|DISSOLVE|ENCADENADO|FIN\.?$|THE END\.?$)/;
const isCaps = s => /[A-ZÁÉÍÓÚÑÇÜ]/.test(s) && s === s.toUpperCase() && !/[a-záéíóúñçü]/.test(s);
// "INT. COCINA - NOCHE" → place and time; "ESCENA 2: EL BOSQUE" also works
function headingOf(line) {
  let s = line.replace(/^\./, '').trim(); const ie = (s.match(/^(int\.?\/ext|ext\.?\/int|i\/e|int|ext|est|interior|exterior)\b\.?/i) || [''])[0];
  s = s.slice(ie.length).replace(/^(esc(ena)?|scene|seq)\s*\d*\s*[:.\-–—]?/i, '').replace(/^[\s.:\-–—]+/, '').replace(/#\d+#\s*$/, '').replace(/\s*\(([^)]*)\)\s*$/, ' - $1').replace(/[.\s]+$/, '').trim();
  // «COCINA - NOCHE», «COCINA, NOCHE», «COCINA (NOCHE)», «COCINA. NOCHE», «COCINA / NOCHE»
  const parts = s.split(/\s+[-–—]+\s+|\s*,\s+|\.\s+|\s+\/\s+/), place = parts[0] || '', time = parts.slice(1).join(' ');
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
  const addName = (n, how) => { const k = scNorm(n); if (!k || k.length > 30) return null; if (!out.names.has(k)) out.names.set(k, {name: scTitle(n.trim()), lines: 0, how}); return out.names.get(k); };
  const prevBlank = j => j === 0 || !lines[j - 1].trim();
  // how people say who speaks in a novel or a story («—Hola —dijo Ana.», 'Leo says, "Hi."')
  const SAYW = 'dijo|dice|preguntó|pregunta|respondió|responde|contestó|contesta|gritó|grita|susurró|susurra|exclamó|exclama|murmuró|murmura|añadió|said|says|asked|asks|replied|replies|shouted|shouts|whispered|whispers|answered|dit|demanda|demande|répondit|répond|cria|crie|disse|diz|perguntou|pergunta|respondeu|responde|gritou|sagte|sagt|fragte|fragt|antwortete|rief|ruft|flüsterte|chiese|chiede|rispose|risponde|gridò|grida|sussurrò|va dir|diu|digué|preguntà|cridà';
  const NOVEL = new RegExp(`^(.*?)\\s*[—–]\\s*(?:${SAYW})\\s+(\\p{Lu}[\\p{L}'’-]+(?:\\s\\p{Lu}[\\p{L}'’-]+)?)[^—–]*?(?:[—–][.,]?\\s*(.*))?$`, 'u');
  const QUOTE = new RegExp(`^(\\p{Lu}[\\p{L}'’-]+(?:\\s\\p{Lu}[\\p{L}'’-]+)?)\\s+(?:${SAYW})(?:\\s+[^"«“:]{0,40}?)?\\s*[:,]?\\s*["«“](.+?)["»”]\\s*\\.?$`, 'u');
  const SHOUT = /(grit|grita|shout|cri|grid|rief|ruft|crid|exclam)/i;
  let lastSpk = [];
  for (; i < lines.length; i++) {
    const raw = lines[i];
    // Markdown: «## INT. COCINA», «**ANA:** hola», «*Ana entra.*»; and numbered headings («12. INT. COCINA - NOCHE»)
    let t = raw.trim().replace(/\*\*|__/g, '').replace(/^\*(.+)\*$/, '$1').replace(/^_(.+)_$/, '$1').trim();
    const NUM = /^\d+[a-z]?[.)]?\s+(?=(int|ext|est|i\/e|interior|exterior)\b)/i, md = t.match(/^#{1,6}\s+(.+)$/), mh = md && md[1].replace(NUM, '');
    if (md && (SC_HEAD.test(mh) || /^(escena|scene|scène|cena|szene|scena)\b/i.test(mh))) t = mh;
    t = t.replace(NUM, '');
    if (!t || /^={3,}$/.test(t) || /^#/.test(t) || /^=/.test(t) || /^~/.test(t)) continue;  // page breaks, sections, synopses, lyrics
    if (SC_HEAD.test(t) && (prevBlank(i) || md) && t.length < 120) { newScene(headingOf(t)); continue; }
    // an act of a play («ACTO I», «ATO I», «ACT ONE»): a new scene, its place told by the stage directions that follow
    if (isCaps(t) && scActHead(t) && isDirective(t) && t.length < 40) { newScene({place: '', time: '', int: null, text: ''}); continue; }
    // a comic's script: «PAGE ONE» is a scene (placed by its first panel), «PANEL 2» a cut, its description what is seen
    if (isCaps(t.replace(/[^\p{L}]/gu, '') || 'x') && /^(PAGE|PAGES|P[AÁÀ]GINA|P[AÁ]GINAS|SEITE|PAGINE)\s+([\dIVXLC]+|[A-ZÁÉÍÓÚÀÈÒ-]+)\s*(\(.*\))?\s*[:.]?$/u.test(t)) { if (!scene() || scene().beats.length) newScene({place: '', time: '', int: null, text: ''}); continue; }
    const pn = t.match(/^(PANEL|VI[ÑN]ETA|VIGNETTE|VIGNETTA|VINHETA|QUADRINHO|CUADRO|CASE|CASELLA|PANELL|BILD|KASTEN)(\s*(\d+|[A-ZÁÉÍÓÚ]+))?\s*[:.\-–—]?\s*(.*)$/u);
    if (pn && (pn[2] || pn[4])) { if (!scene()) newScene({place: '', time: '', int: null, text: ''}); scene().beats.push({k: 'shot', text: pn[1] + (pn[2] || ''), dir: {}, panel: true}); if (pn[4].trim()) scene().beats.push({k: 'act', text: pn[4].trim()}); continue; }
    if (!scene()) newScene({place: '', time: '', int: null, text: ''});
    if (SC_TRANS.test(t) && isCaps(t.replace(/^>/, ''))) { scene().beats.push({k: 'trans', text: t.replace(/^>\s*/, '')}); continue; }
    // the camera's or the editor's line on its own («SLOW MOTION», «FLASHBACK», «MÁS TARDE»)
    if (isCaps(t.replace(/[^\p{L}]/gu, '') || 'x') && isDirective(t.replace(/[.:]+$/, '')) && t.length < 50) { const sd = shotDirection(t); scene().beats.push({k: 'shot', text: t, dir: sd || {}}); continue; }
    // a character cue: a name in capitals alone on its line (or "@Name"), followed by what they say
    const cue = (isCaps(t.replace(/\(.*?\)/g, '').replace(/[\^\d\s.'-]/g, 'X')) || /^@/.test(t)) && prevBlank(i) && lines[i + 1] && lines[i + 1].trim() && !/[.!?:]$/.test(t.replace(/\(.*\)$/, '').trim()) && t.length < 40 && !isDirective(name(t));
    // or the quick way: "ANA: hello" / "Ana: hello" / "Ana (smiling): hello" / "Ana: (smiling) hello", and the way plays
    // are written: "JOÃO — Maria, acorda!" / "ANA.— Hola."
    const NM = "@?(\\p{Lu}[\\p{L}\\d'’.-]*(?: \\p{Lu}[\\p{L}\\d'’.-]*){0,2}(?: \\d{1,2})?)";
    const quick = !cue && (t.match(new RegExp('^' + NM + '\\s*(\\(([^)]*)\\))?\\s*[:：]\\s*(.+)$', 'u')) || t.match(new RegExp('^' + NM + '\\s*\\.?\\s*(\\(([^)]*)\\))?\\s*(?:—|–|--)\\s*(.+)$', 'u')));
    if (quick && isDirective(quick[1])) {  // «CÁMARA LENTA: Kael corre…», «LOW ANGLE: KAEL…», «PRIMER PLANO: la mano de Billy»
      scene().beats.push({k: 'shot', text: quick[1], dir: shotDirection(quick[1]) || {}}); scene().beats.push({k: 'act', text: quick[4].trim()}); continue;
    }
    if (cue) {
      const who = addName(name(t), 'cue'); let paren = (t.match(/\(([^)]*)\)/) || [])[1] || '';
      for (i++; i < lines.length && lines[i].trim(); i++) {
        const d = lines[i].trim();
        if (/^\(.*\)$/.test(d)) { paren = d.slice(1, -1); const emo = emotionOf(paren); scene().beats.push({k: 'paren', who: who.name, text: paren, emo}); continue; }
        scene().beats.push({k: 'line', who: who.name, text: d.replace(/^\^/, ''), paren, emo: emotionOf(paren)}); who.lines++; paren = '';
      }
      continue;
    }
    if (quick) {
      const who = addName(quick[1].replace(/^@/, ''), 'quick'); let paren = quick[3] || '', said = quick[4].trim();
      const pm = said.match(/^\(([^)]*)\)\s*(.*)$/); if (pm) { paren = pm[1]; said = pm[2]; }
      said = said.replace(/^["«“](.*)["»”]$/, '$1');
      if (said) { scene().beats.push({k: 'line', who: who.name, text: said, paren, emo: emotionOf(paren)}); who.lines++; lastSpk = [who.name, ...lastSpk.filter(x => x !== who.name)].slice(0, 2); }
      continue;
    }
    // a novel's dialogue: «—Hola —dijo Ana—. ¿Qué tal?» (with no «dijo», the other one of the last two who spoke)
    const dash = t.match(/^[—–]\s*(.+)$/);
    if (dash) { const at = dash[1].match(NOVEL); let said = dash[1], spk = null; if (at) { spk = at[2]; said = (at[1] + ' ' + (at[3] || '')).trim(); } else if (lastSpk.length === 2) spk = lastSpk[1]; else if (lastSpk.length) spk = lastSpk[0];
      if (spk && said) { const who = addName(spk, 'quick'); scene().beats.push({k: 'line', who: who.name, text: said.replace(/[—–]\s*$/, '').trim(), paren: '', emo: at && SHOUT.test(dash[1]) ? 'grito' : null}); who.lines++; lastSpk = [who.name, ...lastSpk.filter(x => x !== who.name)].slice(0, 2); continue; } }
    // what someone says inside the action: «Ana dice: «Hola».», 'Leo shouts, "Run!"'
    const qa = t.match(QUOTE);
    if (qa) { const who = addName(qa[1], 'quick'); scene().beats.push({k: 'line', who: who.name, text: qa[2].trim(), paren: '', emo: SHOUT.test(t.slice(qa[1].length, t.indexOf(qa[2]))) ? 'grito' : null}); who.lines++; lastSpk = [who.name, ...lastSpk.filter(x => x !== who.name)].slice(0, 2); continue; }
    // action (with camera directions inside)
    const sd = shotDirection(t); if (sd && isCaps(t.replace(/[^A-Za-zÁÉÍÓÚÑÇÜáéíóúñçü]/g, '').slice(0, 8))) {
      // "PLANO GENERAL. Ana y Luis caminan." → the camera direction, then the action
      const m = t.match(/^([^a-záéíóúñçü]*?[A-ZÁÉÍÓÚÑÇÜ'’ ]{3,}[.:—–-])\s+(.*[a-záéíóúñçü].*)$/);
      scene().beats.push({k: 'shot', text: m ? m[1] : t, dir: sd}); if (m) scene().beats.push({k: 'act', text: m[2]}); continue;
    }
    const last = scene().beats[scene().beats.length - 1];
    if (last && last.panel && !Object.keys(last.dir).length) last.dir = shotDirection(t) || {};  // «Wide shot of a rainy street»
    if (last && last.k === 'act' && !prevBlank(i)) last.text += ' ' + t; else scene().beats.push({k: 'act', text: t.replace(/^!/, '')});
  }
  // names first written in capitals inside the action (Fountain: the first appearance of a character) count too, when
  // they are written as someone: «KAEL, un joven…», «JACK MORGAN (40s)», «El REY SOMBRA, un guerrero», «Ein MANN mit…»,
  // «SARAH stands…» (a sentence's subject); a sound or a shout in capitals is not anyone («BANG!», «the rooftop EXPLODES»)
  const ROLE = /(cientific[oa]|detective|policia|agente|soldad[oa]|doctor[a]?|medic[oa]|profesor[a]?|capitan[a]?|captain|capitaine|inspector[a]?|sheriff|guardia|guard|nurse|enfermer[oa]|scientist|officer|joven|young|viej[oa]|old|senor[a]?|chic[oa]|nin[oa]|hombre|mujer|man|woman|girl|boy|robot|androide?|android|monstruo|monster|rey|reina|king|queen|principe|princesa|prince|princess|heroe|hero|villano|villain|guerrer[oa]|warrior|mago|maga|bruja|witch|wizard)$/;
  for (const sc of out.scenes) for (const b of sc.beats) if (b.k === 'act') for (const m of b.text.matchAll(/(?<![\p{L}\d'’])((?:\p{Lu}{1,3}\.\s?)?\p{Lu}[\p{Lu}\d'’-]+(?:\s\p{Lu}[\p{Lu}\d'’-]+){0,2})(?![\p{L}\d])/gu)) {
    const w = m[1].trim(); if (w.length < 2 || isDirective(w) || /^(INT|EXT|POV|OTS|ECU|CU|MS|WS|TV|OK|DJ|FBI|CIA|USA|UK|EEUU|DNI|SOS|ADN|DNA|GPS|ID|OK|VIP|CEO|PC|UFO|OVNI)$/.test(w)) continue;
    if (out.names.has(scNorm(w))) continue;
    if ([...out.names.values()].some(n => (n.aka || []).some(x => scNorm(x) === scNorm(w)))) continue;  // «the THUGS» again
    const before = b.text.slice(0, m.index), after = b.text.slice(m.index + m[0].length), prev = scWords(before).pop() || '';
    const start = /(^|[.!?:;—–]\s*)$/.test(before.trimEnd() ? before.trimEnd() + ' ' : '') || !before.trim(), lower = /^\s+[\p{Ll}]/u.test(after);
    if (/^\s*[!?¡¿]/.test(after)) continue;
    const many = SC_NUMW[prev]; if (many && /S$/.test(w) && !/\s/.test(w) && lower) {
      const one = scTitle(/[^AEIOU](ES)$/.test(w) && /(N|R|L|D|J|Z|CH|SH|X)ES$/.test(w) ? w.slice(0, -2) : w.slice(0, -1));
      for (let k = 1; k <= many; k++) { const e = addName(one + ' ' + k, 'action'); if (e) e.aka = [...new Set([...(e.aka || []), scTitle(w)])]; } continue; }
    const kind = SC_PERSON.has(scNorm(w)) || SC_SPECIES.some(([, l]) => l.includes(scNorm(w)));
    if (kind && /^[^.!?]{0,40},\s*(?:\p{Lu}{2,})/u.test(after)) continue;  // «Un DRAGON rouge géant, FLAMÈCHE, …»: the name is FLAMÈCHE, a dragon
    if (/^\s*[,(]/.test(after) || ((start || SC_ARTS.has(prev) || SC_TITLES.has(prev) || ROLE.test(prev) || (['en', 'na'].includes(prev) && /\b(i|amb|els|les|dels)\b/.test(scNorm(b.text)))) && lower)) addName(w, 'action');
  }
  // a story with no names at all («Un hombre entra en un bar. La camarera le sirve.»): the people it speaks of
  if (!out.names.size) for (const sc of out.scenes) for (const b of sc.beats) if (b.k === 'act') for (const m of b.text.matchAll(/(?<![\p{L}])(un|una|el|la|a|an|the|une|le|um|uma|o|ein|eine|der|die|il|lo|uno)\s+((?:old|young|viejo|vieja|joven|vieil|vieille|alter|alte|vecchio|vecchia)\s+)?(\p{L}+)/giu)) {
    if (SC_PERSON.has(scNorm(m[3]))) addName((m[2] ? m[2].trim() + ' ' : '') + m[3], 'noun');
  }
  // one character, many names: «NOVA» speaks as «CAPTAIN NOVA», «JACK» is «JACK MORGAN», «el sheriff» is «SHERIFF CARTER»
  const all = [...out.names.entries()], alias = new Map();
  for (const [k, n] of all) {
    const ck = scContent(n.name); let to = null;
    const fuller = n2 => scContent(n2.name).length > ck.length || (scContent(n2.name).length === ck.length && scWords(n2.name).length > scWords(n.name).length);
    if (ck.length) to = all.find(([k2, n2]) => k2 !== k && fuller(n2) && ck.every(w => scContent(n2.name).includes(w)));
    else { const own = all.filter(([k2, n2]) => k2 !== k && scWords(n2.name).some(w => scWords(n.name).includes(w) && SC_TITLES.has(w)) && scContent(n2.name).length); if (own.length === 1) to = own[0]; }
    if (to) alias.set(k, to[0]);
  }
  const root = k => { let r = k, n = 0; while (alias.has(r) && n++ < 9) r = alias.get(r); return r; };
  for (const [k] of all) { const r = root(k); if (r === k) continue; const from = out.names.get(k), into = out.names.get(r); into.lines += from.lines; (into.aka = into.aka || []).push(from.name); if (from.how === 'cue') into.cue = from.name; out.names.delete(k); }
  // nobody is a title alone: «DR» with nobody to belong to is dropped (it was half of a name)
  for (const [k, n] of [...out.names]) if (!scContent(n.name).length && n.how === 'action') out.names.delete(k);
  const canon = new Map(); for (const [k, n] of out.names) { canon.set(k, n.name); for (const a of n.aka || []) canon.set(scNorm(a), n.name); }
  for (const sc of out.scenes) for (const b of sc.beats) if (b.who && canon.has(scNorm(b.who))) b.who = canon.get(scNorm(b.who));
  return out;
}
const SC_NUMW = {dos: 2, two: 2, deux: 2, zwei: 2, due: 2, dois: 2, duas: 2, dues: 2, tres: 3, three: 3, trois: 3, drei: 3, tre: 3, cuatro: 4, four: 4, quatre: 4, vier: 4, quattro: 4, quatro: 4, 2: 2, 3: 3, 4: 4};
const SC_ARTS = new Set('un una unos unas el la los las lo le les il gli a an the der die das ein eine einen einem einer um uma o os as al del du des dem den'.split(' '));
const SC_PERSON = new Set(('hombre mujer chico chica nino nina anciano anciana joven senor senora camarero camarera policia doctor doctora medico medica enfermera enfermero soldado rey reina principe princesa caballero mago bruja ladron ladrona detective profesor profesora alumno alumna estudiante vendedor vendedora cliente desconocido desconocida ' +
  'man woman boy girl kid child stranger guy lady waiter waitress bartender cop officer nurse soldier king queen prince princess knight wizard witch thief teacher student customer ' +
  'homme femme garcon fille enfant serveur serveuse policier medecin soldat roi reine chevalier sorcier sorciere voleur inconnu inconnue ' +
  'homem mulher rapaz menino menina velho velha empregado policial rei rainha ' + 'mann frau junge madchen kind kellner kellnerin polizist arzt konig konigin fremder ' +
  'uomo donna ragazzo ragazza bambino bambina vecchio vecchia cameriere cameriera poliziotto soldato re regina principessa straniero ' + 'dona noi noia nen nena vell vella cambrer cambrera').split(' '));
// animals a character can be (seven languages, both genders, no accents): the species of the anthro cast
const SC_SPECIES = Object.entries({
  lobo: 'lobo loba lobos wolf wolves llop lloba loup louve lupo lupa wolfin werewolf licantropo hombre-lobo',
  zorro: 'zorro zorra fox vixen guineu guilla renard renarde raposa raposo fuchs fuchsin volpe kitsune',
  perro: 'perro perra dog puppy cachorro gos gossa chien chienne cao cadela hund hundin cane cagna husky',
  coyote: 'coyote coiote kojote',
  hiena: 'hiena hyena hyene hyane iena',
  gato: 'gato gata cat kitty kitten gat gata chatte katze kater gatto gatta',
  tigre: 'tigre tigresa tiger tigress tigressa tigresse tigerin',
  leon: 'leon leona lion lioness lleo lleona lionne leao leoa lowe lowin leone leonessa',
  leopardo: 'leopardo leoparda leopard lleopard leopardin irbis guepardo cheetah',
  oso: 'oso osa bear ossa ours ourse urso ursa orso orsa',
  mapache: 'mapache raccoon racoon guaxinim waschbar procione',
  panda: 'panda',
  mofeta: 'mofeta zorrillo skunk moufette mofette gamba stinktier puzzola',
  conejo: 'conejo coneja rabbit bunny conill conilla lapin lapine coelho coelha hase kaninchen coniglio coniglia',
  ciervo: 'ciervo cierva venado deer stag doe cervol cerf biche veado cervo cerva hirsch reh',
  cabra: 'cabra cabron goat chevre bouc ziege capra',
  caballo: 'caballo yegua horse stallion cavall euga cheval jument cavalo egua pferd stute cavallo cavalla',
  dragon: 'dragon dragona drac dragao drache drago dragonessa kobold'
}).map(([k, v]) => [k, v.split(' ')]);
