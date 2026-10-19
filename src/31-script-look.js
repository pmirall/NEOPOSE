/* ======================= from a script to a film: how the cast looks =======================
   A screenplay introduces each character once, in the action, the first time they appear: «KAEL, un joven héroe de
   cabello negro, capa desgarrada y katana luminosa, aparece entre el humo», «JACK MORGAN (40s), a tired detective in a
   wrinkled trench coat». That description is read for who they are and what they wear, in the app's seven languages:
   - the body: woman or man, age (a number, «(40s)», «fifty», «joven», «anciana»), build (tall, slim, muscular, a giant),
     an animal (a fox, «zorro-humana», «fox ears»: a fox anthro or, half human, a kemonomimi), a robot, a ghost;
   - the hair: colour and cut («cabello plateado», «roten Haaren», «platinum blonde», «coleta», «calvo»);
   - the clothes, from the garment library, each with its colour («armadura negra», «a red cape», «vestito verde»), and
     what they carry (a sword, a katana, an axe, a staff); a role with no clothes said (a knight, a sheriff, a
     superheroine, a robot, a wizard) dresses as one;
   - what is not said is filled in so nobody is a bare mannequin: clothes of the story's world (fantasy, the West,
     science fiction or today), different for each one, grey hair with age.
   Words, stems and rules: no AI. */

/* ---------- the story's world: what a script is about, from its words ---------- */
const SCL_GENRES = {
  fantasy: 'castillo castle chateau castelo burg castello reino kingdom royaume reino konigreich regno rey reina king queen espada sword epee schwert spada katana magia magic magie zauber mago maga wizard sorcier hechizo spell sortilege dragon dragones drache drago elfo elfa elf elfe caballero knight chevalier ritter cavaliere princesa princess princesse prinzessin principessa trono throne trone thron hechicero bruja witch demonio demon daemon orco orc goblin hada fairy fee kitsune zorro-humana habilidad poder sombra oscuro',
  scifi: 'nave spaceship starship vaisseau raumschiff astronave espacial espacio space spatial weltraum spazio robot robots androide android cyborg laser galaxia galaxy galaxie planeta planet planete alien aliens alienigena extraterrestre futuro future futur zukunft holograma hologram teletransporte warp escudos shields boucliers boucliers capitaine passerelle puente unit',
  western: 'sheriff pistolero gunslinger vaquero cowboy saloon salon revolver forajido outlaw rancho ranch diligencia stagecoach oeste west far-west duelo duel planta rodadora tumbleweed alguacil marshal colt winchester',
  superhero: 'superheroe superheroina superhero superheroine supervillano supervillain villano villain poderes superpoderes superpowers capa cape mascara mask antifaz vuela flies volar fly',
  horror: 'monstruo monster zombi zombie fantasma ghost vampiro vampire sangre blood grito scream cuchillo knife mascara asesino killer maske messer bosque oscuro dark'
};
const SCL_GENRE_SETS = Object.fromEntries(Object.entries(SCL_GENRES).map(([k, v]) => [k, new Set(v.split(' '))]));
function genreOf(text) {
  const w = scWords(text), score = {};
  for (const [g, set] of Object.entries(SCL_GENRE_SETS)) score[g] = w.filter(x => set.has(x)).length;
  if (score.superhero >= 3 && score.superhero >= score.fantasy - 1) return 'superhero';
  const best = Object.entries(score).filter(([g]) => g !== 'superhero').sort((a, b) => b[1] - a[1])[0];
  return best && best[1] >= 3 ? best[0] : 'modern';
}

/* ---------- colours ---------- */
const SCL_COLORS = [
  ['#17161a', 'negro negra negros negras black noir noire noirs noires preto preta pretos pretas schwarz schwarze schwarzen schwarzer schwarzes nero nera neri nere negre'],
  ['#ece9e2', 'blanco blanca blancos blancas white blanc blanche blancs blanches branco branca brancos brancas weiss weisse weissen weisser weisses bianco bianca bianchi bianche'],
  ['#a32a24', 'rojo roja rojos rojas red rouge rouges vermelho vermelha vermelhos vermelhas rot rote roten roter rotes rosso rossa rossi rosse vermell vermella carmesi escarlata scarlet crimson cramoisi'],
  ['#2d4f9e', 'azul azules blue bleu bleue bleus bleues blau blaue blauen blauer blaues blu'],
  ['#3d7a46', 'verde verdes green vert verte verts vertes grun grune grunen gruner grunes verd'],
  ['#e2b62c', 'amarillo amarilla amarillos amarillas yellow jaune jaunes amarelo amarela gelb gelbe gelben gelber giallo gialla gialli groc groga'],
  ['#e0782c', 'naranja naranjas anaranjado anaranjada orange arancione laranja taronja'],
  ['#6b3a9a', 'morado morada morados moradas violeta violetas purpura purple violet violette violets roxo roxa lila viola violetto porpra'],
  ['#e48ab0', 'rosa rosas rosado rosada pink rose roses'],
  ['#7a7a80', 'gris grises grey gray cinza grau graue grauen grauer grigio grigia grigi'],
  ['#6a4428', 'marron marrones cafe brown brun brune bruns marrom braun braune braunen brauner marrone marroni marro'],
  ['#c9a227', 'dorado dorada dorados doradas golden gold dore doree dourado dourada goldene goldenen dorato dorata daurat'],
  ['#c4c8cf', 'plateado plateada plateados plateadas silver argente argentee prateado prateada silberne silbernen silberner argentato argentata argentat'],
  ['#c8b48e', 'beige beis'], ['#8d8358', 'caqui khaki kaki'], ['#6a1f2a', 'granate burdeos burgundy bordeaux maroon'], ['#2fa3a0', 'turquesa turquoise turchese'],
  ['#1f2a4a', 'marino navy'], ['#e8dcc0', 'crema cream creme']
];
const SCL_COLOR_MAP = new Map(SCL_COLORS.flatMap(([hex, w]) => w.split(' ').map(x => [x, hex])));
// (German adjectives take endings: «grauem Anzug», «roten Haaren»)
const SCL_COLOR_OF = {get: x => SCL_COLOR_MAP.get(x) || (x && x.length > 4 ? SCL_COLOR_MAP.get(x.replace(/(em|en|er|es|e)$/, '')) : undefined)};
const SCL_ALLCOL = /\b(vestid[oa]s? de|vestit[oa]? di|vestit de|dressed in|dressed all in|clad in|all in|vetue? de|vetus de|vestid[oa]s? em|gekleidet in|ganz in|tout en|todo de|tutto di|tota de|tot de)\s+(\w+)/;
const SCL_DARK = new Set('oscuro oscura oscuros oscuras dark sombre fonce foncee escuro escura dunkel dunkle dunklen scuro scura fosc fosca'.split(' '));
const SCL_LIGHT = new Set('claro clara claros claras light pale clair claire hell helle hellen chiaro chiara clar'.split(' '));
const shadeHex = (hex, k) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();
const mixHex = (a, b, t) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();

/* ---------- hair ---------- */
const SCL_HAIR_NOUN = new Set('pelo cabello cabellos melena hair cheveux chevelure cabelo cabelos haar haare haaren capelli chioma cabell cabells'.split(' '));
// a colour said of hair is a hair colour (not a dye of clothes): the same word, another shade
const SCL_HAIR_HEX = {'#17161a': '#15110f', '#ece9e2': '#ece9e2', '#a32a24': '#a8231c', '#2d4f9e': '#2c4ea0', '#3d7a46': '#3c8a4c', '#e2b62c': '#d2b06a', '#e0782c': '#c8641e', '#6b3a9a': '#6a3a9a',
  '#e48ab0': '#e48ab0', '#7a7a80': '#9a958e', '#6a4428': '#5a3a22', '#c9a227': '#d8b25a', '#c4c8cf': '#c9ccd2'};
// adjectives that are a hair colour by themselves («una mujer rubia», «platinum blonde», «rothaarig»)
const SCL_HAIR_ADJ = [
  ['#e8e0c8', 'platino platinum platine platinado platinada platin'],
  ['#d2b06a', 'rubio rubia rubios rubias blond blonde blondes blonds loiro loira louro loura biondo bionda biondi blonde'],
  ['#8a3a1c', 'pelirrojo pelirroja pelirrojos pelirrojas redhead redheaded red-haired ginger roux rousse ruivo ruiva rothaarig rothaarige rothaarigen pelroig pel-roig'],
  ['#5a3a22', 'castano castana castanos castanas castani castane chestnut chatain chatains castanho castanha kastanienbraun brunette brunet'],
  ['#1f1712', 'moreno morena morenos morenas brune brunes bruns bruna'],
  ['#9a958e', 'canoso canosa canosos canosas grisonnant grisonnante grisalho grisalha grauhaarig grauhaarige brizzolato brizzolata'],
  ['', 'calvo calva calvos bald chauve careca glatze glatzkopfig glatzkopf kahl kahlkopfig rapado rapada shaved calvizie']
];
const SCL_HAIR_ADJ_OF = new Map(SCL_HAIR_ADJ.flatMap(([hex, w]) => w.split(' ').map(x => [x, hex])));
const SCL_HAIR_CUT = [  // [cut, words]: cut → a style for her and for him
  ['ponytail', 'coleta|ponytail|queue de cheval|rabo de cavalo|pferdeschwanz|coda di cavallo|cua de cavall'], ['braid', 'trenza|trenzas|braid*|tresse*|tranca*|zopf|zopfe|treccia|trecce|trena'],
  ['bun', 'mono|chignon|bun|coque|dutt|crocchia|monyo'], ['afro', 'afro'], ['curly', 'rizad*|rizos|curly|curls|boucle*|frise*|cacheado*|encaracolad*|lockig*|locken|ricci*|riccioli|arrissat*'],
  ['long', 'largo|larga|largos|long|longs|longue|longues|lang|lange|langen|langes|lungo|lunga|lunghi|comprido|comprida|compridos|llarg|llarga|melena'],
  ['short', 'corto|corta|cortos|cortas|short|court|courte|courts|curto|curta|curtos|kurz|kurze|kurzen|corto|corti|curt|curta'],
  ['spiky', 'de punta|en punta|spiky|en pointe|espetado|stachelig|a punta']
];
const SCL_HAIR_CUT_PATS = SCL_HAIR_CUT.map(([k, w]) => [k, scPats(w)]);
const SCL_CUT_STYLE = {ponytail: ['h-ponytail01', 'h-ponytail01'], braid: ['h-braid01', 'h-braid01'], bun: ['h-rehmanpolanski_hair_bun_brown', 'h-rehmanpolanski_hair_bun_brown'], afro: ['h-afro01', 'h-afro01'],
  curly: ['h-elvs_inverted_curly_bob', 'h-elvs_inverted_curly_bob'], long: ['h-o4saken_long01', 'h-long01'], short: ['h-bob01', 'h-short02'], spiky: ['h-elvs_daisy_hair', 'h-elvs_grump_hair']};

/* ---------- clothes and what they carry: concepts → the garment library ----------
   [concept, slot, words, ids for him, ids for her, default colour]. Slots: full (a dress, a suit, armour, a robe: the
   whole body), top, bottom, outer (over the rest), cape, feet, head, face, eyes, hands, neck, waist, back, prop. */
const SCL_WEAR = [
  ['superhero', 'full', 'traje de superheroe|traje de superheroina|superhero suit|superheroine suit|costume de super-heros|fato de super-heroi|superheldenanzug|costume da supereroe', ['c2061'], ['c2145'], null],
  ['spacesuit', 'full', 'traje espacial|traje de astronauta|space suit|spacesuit|combinaison spatiale|fato espacial|raumanzug|tuta spaziale', ['c3517'], ['c3517'], null],
  ['armor', 'full', 'armadura|armor|armour|armored suit|armoured suit|armure|rustung|armatura|cota de malla|chainmail|chain mail|coraza|cuirass|cuirasse|couraca|harnisch|corazza|cuirassa', ['c2015', 'c356'], ['c2015', 'c356'], '#8a8f99'],
  ['swim', 'full', 'banador|traje de bano|swimsuit|bathing suit|maillot de bain|fato de banho|badeanzug|costume da bagno|banyador', ['c2656'], ['c31'], null],
  ['school', 'full', 'uniforme escolar|uniforme de colegio|uniforme del colegio|uniforme del instituto|uniforme de instituto|school uniform|uniforme scolaire|uniforme da escola|uniforme escolar|schuluniform|divisa scolastica|uniforme scolastica|uniforme de l escola|seifuku|sailor fuku|gakuran', ['c3165', 'c3244', 'c181'], ['c1750', 'c1751'], null],
  ['uniform', 'full', 'uniforme|uniform|fardamento|uniforme', ['c2694', 'c2798'], ['c2694', 'c2798'], null],
  ['labcoat', 'outer', 'bata|bata blanca|bata de laboratorio|lab coat|labcoat|blouse blanche|blouse de laboratoire|jaleco|laborkittel|camice|bata de metge', ['c1412'], ['c157'], '#ecebe6'],
  ['trench', 'outer', 'gabardina|trench|trenchcoat|trench coat|impermeable|imper|sobretudo|trenchcoat|trench|gabardina', ['c1412'], ['c157'], '#9c8a64'],
  ['raincoat', 'outer', 'chubasquero|raincoat|rain coat|regenjacke|regenmantel|cire|capa de chuva|impermeabile', ['c20'], ['c20'], '#e2b62c'],
  ['coat', 'outer', 'abrigo|coat|overcoat|manteau|casaco|mantel|cappotto|abric|parka|anorak', ['c1412'], ['c157'], '#3a3a40'],
  ['gown', 'full', 'vestido de noche|vestido largo|vestido de gala|vestido de fiesta|evening dress|evening gown|ball gown|gown|robe de soiree|robe longue|vestido longo|abendkleid|abito da sera|abito lungo|vestit llarg', ['c226'], ['c1855'], null],
  ['dress', 'full', 'vestido|dress|robe|vestit|kleid|vestito|abito', ['c226'], ['c1730'], null],
  ['pyjamas', 'full', 'pijama|pijamas|pyjama|pyjamas|pajamas|pigiama|schlafanzug|camison|nightgown|nightshirt', ['c2626'], ['c2626'], null],
  ['scrubs', 'full', 'scrubs|pijama sanitario|uniforme sanitario|ropa de quirofano|blouse medicale|kasack', ['c3165', 'c3244'], ['c1158', 'c1756'], '#5a9aa8'],
  ['robe', 'full', 'tunica larga|tunica|tunic|tunique|tunika|toga|habito|sotana|cassock|robe de moine|tonaca|tunica', ['c1763'], ['c1763'], null],
  ['monk', 'full', 'habito de monje|monk robe|robe de moine', ['c3238'], ['c3238'], '#5a4632'],
  ['kimono', 'full', 'kimono|yukata|hakama', ['c3171'], ['c3171'], null],
  ['suit', 'full', 'traje|suit|costume|terno|anzug|completo|vestit de|smoking|esmoquin|tuxedo|tuxedo', ['m_male_elegantsuit01'], ['c1739'], null],
  ['skirt', 'bottom', 'falda|skirt|jupe|saia|rock|gonna|faldilla|minifalda|miniskirt', ['c1641'], ['c1641'], null],
  ['shorts', 'bottom', 'pantalon corto|pantalones cortos|shorts|bermudas|short|calcoes|kurze hose|pantaloncini', ['c2800'], ['c2800'], null],
  ['jeans', 'bottom', 'vaqueros|tejanos|jeans|jean|calca jeans|denim', ['c807'], ['c807'], null],
  ['pants', 'bottom', 'pantalon|pantalones|pants|trousers|calca|calcas|hose|pantaloni|pantalons|leggings|mallas', ['c3244'], ['c1756'], null],
  ['vest', 'outer', 'chaleco|vest|gilet|colete|weste|panciotto|armilla', ['c1849'], ['c1849'], '#4a3020'],
  ['jacket', 'outer', 'chaqueta|cazadora|chupa|jacket|veste|blouson|casaco|jaqueta|jacke|giacca|giubbotto|americana|blazer|jaqueta', ['c2953'], ['c2953'], null],
  ['hoodie', 'top', 'sudadera|hoodie|sweat|sweatshirt|moletom|kapuzenpulli|felpa|dessuadora', ['c674'], ['c674'], null],
  ['sweater', 'top', 'jersey|sueter|sweater|pullover|camisola|pulli|maglione|jersei|cuello alto|turtleneck|col roule', ['c1187'], ['c1104'], null],
  ['tshirt', 'top', 'camiseta|t-shirt|tshirt|tee|tee-shirt|maglietta|samarreta|tank top|top', ['c1416'], ['c22'], null],
  ['shirt', 'top', 'camisa|blusa|shirt|blouse|chemise|chemisier|hemd|bluse|camicia|camicetta|polo', ['c3165'], ['c1158'], null],
  ['bodice', 'top', 'corse|corset|corsage|corpino|corpete|mieder|bustino|cotilla', ['c241'], ['c241'], null],
  ['cape', 'cape', 'capa|cape|cloak|manto|mantle|umhang|mantello|mantell|capote|capucha larga', ['c2128'], ['c2048'], '#2b2f3a'],
  ['boots', 'feet', 'botas|boots|bottes|stiefel|stivali|botes|bota', ['c2548'], ['c1738'], '#3a2a20'],
  ['heels', 'feet', 'tacones|heels|high heels|talons|saltos altos|absatze|tacchi|sabates de taco', ['c1039'], ['c1039'], null],
  ['sneakers', 'feet', 'zapatillas|deportivas|sneakers|trainers|baskets|tenis|turnschuhe|sneaker|scarpe da ginnastica|bambes', ['m_shoes05'], ['m_shoes05'], null],
  ['shoes', 'feet', 'zapatos|shoes|chaussures|sapatos|schuhe|scarpe|sabates|mocasines|loafers', ['c1732'], ['c1741'], null],
  ['cowboyhat', 'head', 'sombrero de vaquero|sombrero vaquero|cowboy hat|stetson|sombrero texano|chapeau de cowboy|chapeu de vaqueiro|cowboyhut|cappello da cowboy', ['c24'], ['c24'], '#5a3e26'],
  ['fedora', 'head', 'fedora|borsalino|trilby|sombrero de ala', ['m_fedora01'], ['m_fedora01'], null],
  ['hat', 'head', 'sombrero|hat|chapeau|chapeu|hut|cappello|barret|gorro de bruja|witch hat|top hat|chistera', ['c24'], ['c24'], null],
  ['cap', 'head', 'gorra|gorro|cap|casquette|bone|mutze|berretto|beanie|bonnet|boina|beret|gorra de beisbol', ['c78'], ['c78'], null],
  ['helmet', 'head', 'casco|helmet|casque|capacete|helm|elmo|yelmo', ['c2351'], ['c2351'], null],
  ['hood', 'head', 'capucha|hood|capuche|capuz|kapuze|cappuccio|caputxa', ['c2100'], ['c2100'], null],
  ['crown', 'head', 'corona|crown|couronne|coroa|krone|tiara|diadema|diademe', ['c2704'], ['c2704'], '#d4af37'],
  ['horns', 'head', 'cuernos|horns|cornes|chifres|horner|corna|banyes|cornamenta', ['c2355'], ['c2355'], null],
  ['mask', 'face', 'mascara|mask|masque|maske|maschera|antifaz|careta', ['c134'], ['c134'], null],
  ['balaclava', 'face', 'pasamontanas|balaclava|ski mask|cagoule|gorro passa-montanhas|sturmhaube|passamontagna', ['c30'], ['c30'], '#151515'],
  ['eyepatch', 'eyes', 'parche en el ojo|parche|eyepatch|eye patch|bandeau sur l\'oeil|tapa-olho|pala|augenklappe|benda sull\'occhio', ['c2510'], ['c2510'], null],
  ['glasses', 'eyes', 'gafas|anteojos|lentes|glasses|spectacles|lunettes|oculos|brille|occhiali|ulleres|gafas de sol|sunglasses|lunettes de soleil|sonnenbrille|occhiali da sole', ['c928'], ['c928'], null],
  ['gloves', 'hands', 'guantes|gloves|gants|luvas|handschuhe|guanti|guants', ['c1852'], ['c1852'], null],
  ['scarf', 'neck', 'bufanda|scarf|echarpe|cachecol|schal|sciarpa|panuelo|foulard', ['c73'], ['c73'], null],
  ['tie', 'neck', 'corbata|tie|necktie|cravate|gravata|krawatte|cravatta|corbata', ['c181'], ['c180'], null],
  ['belt', 'waist', 'cinturon|belt|ceinture|cinto|gurtel|cintura|cinturo', ['c2112'], ['c2286'], null],
  ['backpack', 'back', 'mochila|backpack|rucksack|sac a dos|zaino|motxilla', ['c316'], ['c316'], null],
  // what they carry
  ['sword', 'prop', 'espada|katana|sable|sword|blade|epee|lame|schwert|klinge|spada|espasa|mandoble|cimitarra|scimitar|florete|rapier|estoque', ['c428'], ['c428'], '#c9ced6'],
  ['dagger', 'prop', 'daga|cuchillo|punal|dagger|knife|poignard|couteau|faca|punhal|dolch|messer|pugnale|coltello|ganivet', ['c809'], ['c809'], null],
  ['axe', 'prop', 'hacha|axe|hache|machado|axt|ascia|destral', ['c2487'], ['c2487'], null],
  ['hammer', 'prop', 'martillo|maza|mace|hammer|marteau|martelo|martello|martell|mazo', ['c2051'], ['c2051'], null],
  ['bow', 'prop', 'arco y flechas|arco|bow|arc|bogen|arco e frecce', ['c2362', 'c2364'], ['c2362', 'c2364'], null],
  ['staff', 'prop', 'baculo|cetro|varita|vara magica|staff|wand|sceptre|scepter|baton magique|cajado|varinha|zauberstab|stab|bacchetta|scettro|bastone magico|bastao', ['c2358'], ['c2358'], null],
  ['cigarette', 'prop', 'cigarro|cigarrillo|pitillo|cigarette|cigar|cigare|zigarette|zigarre|sigaretta|sigaro|cigarret', ['c3442'], ['c3442'], null]
];
const SCL_WEAR_PATS = SCL_WEAR.map(([k, slot, w, m, f, col]) => ({k, slot, pats: scPats(w), m, f, col}));
// roles that dress a character when the script says what they are but not what they wear
const SCL_ROLES = [
  ['superhero', 'superheroe|superheroina|superhero|superheroine|super-heros|super heroe|super-heroi|superheld*|supereroe|supereroina|vigilante enmascarad*'],
  ['knight', 'caballero|caballera|knight|chevalier|cavaleiro|ritter|cavaliere|cavaller|paladin*|templari*'],
  ['viking', 'vikingo|vikinga|viking*|wikinger*|vichingo'],
  ['samurai', 'samurai|ronin'], ['ninja', 'ninja|shinobi|kunoichi'],
  ['wizard', 'mago|hechicer*|brujo|wizard|sorcer*|mage|magicien*|feiticeir*|zauberer|zauberin|magier*|stregone|mago oscuro|nigromante|necromancer|druida|druid'],
  ['witch', 'bruja|witch|sorciere|bruxa|hexe|strega|bruixa'],
  ['king', 'rey|king|roi|rei|konig|monarca|emperador|emperor|empereur|imperador|kaiser|imperatore|sultan|faraon|pharaoh'],
  ['queen', 'reina|queen|reine|rainha|konigin|regina|emperatriz|empress|imperatrice|kaiserin'],
  ['princess', 'princesa|princess|princesse|prinzessin|principessa'], ['prince', 'principe|prince|prinz'],
  ['pirate', 'pirata|pirate|pirat|corsario|bucanero|buccaneer|filibuster*'],
  ['cowboy', 'vaquero|vaquera|cowboy|cowgirl|pistolero|pistolera|gunslinger|sheriff|alguacil|forajido|outlaw|ranchero|bandido|bandit|marshal'],
  ['warrior', 'guerrer*|warrior|guerrier*|krieger*|gladiador*|gladiator*|espartan*|spartan*|barbar*|mercenari*|mercenary|soldado medieval'],
  ['robot', 'robot|robots|androide|android|cyborg|automata|automaton|robo|roboter|robotto|droide|droid|mecha'],
  ['ghost', 'fantasma|ghost|espectro|spectre|specter|fantome|geist|gespenst|spettro'],
  ['orc', 'orco|orca|orc|orcs|orque|ork|troll|trol|ogro|ogre|oger|orco guerrero'],
  ['zombie', 'zombi|zombie|zombis|zombies|muerto viviente|mort-vivant|morto-vivo|untoter|morto vivente'],
  ['monk', 'monje|monja|fraile|monk|nun|moine|nonne|monge|freira|monch|monaco|monaca'],
  ['astronaut', 'astronaut*|cosmonaut*|astronauta'],
  ['soldier', 'soldad*|militar|sargento|sergeant|marine|soldat*|soldier|recluta|recruit|comando'],
  ['police', 'policia|police|policier*|polizist*|poliziott*|guardia civil|agente de policia|cop|officer|gendarme'],
  ['doctor', 'medic*|doctor|doctora|cientific*|investigador*|quimic*|scientist|chemist|physician|nurse|enfermer*|cirujan*|surgeon|scientifique|wissenschaftler*|arzt|arztin|scienziat*'],
  ['detective', 'detective|inspector*|comisari*|investigador privado|private eye|sherlock'],
  ['business', 'ejecutiv*|abogad*|empresari*|banquer*|politic*|businessman|businesswoman|executive|lawyer|banker|avocat*|anwalt|avvocat*'],
  ['worker', 'mecanic*|obrer*|fontaner*|albanil*|granjer*|mechanic|plumber|worker|builder|farmer|mecanicien|mechaniker|operai*'],
  ['athlete', 'atleta|deportista|corredor*|athlete|athletic|runner|jogger|futbolista|footballer|boxeador*|boxer|chandal|tracksuit|sweatsuit|survetement|fato de treino|trainingsanzug|jogginganzug|tuta da ginnastica|tuta sportiva|xandall'],
  ['student', 'estudiante|colegial*|alumno|alumna|student|schoolgirl|schoolboy|eleve|etudiant*|aluno|aluna|schuler*|studente|studentessa'],
  ['chef', 'cocinero|cocinera|cook|cuisinier*|cozinheir*|koch|kochin|cuoco|cuoca|chef de cocina|chef de cuisine|head chef'],
  ['captain', 'capitan|capitana|captain|capitaine|capitao|kapitan|capitano|comandante|commander|tripulante|crew|officier|offizier']
];
const SCL_ROLE_PATS = SCL_ROLES.map(([k, w]) => [k, scPats(w)]);
// [id, slot, colour] by role: M, F (F omitted → the same)
const SCL_ROLE_WEAR = {
  superhero: [[['c2061', 'full'], ['c2081', 'feet'], ['c2112', 'waist']], [['c2145', 'full'], ['c2155', 'feet'], ['c2286', 'waist']]],
  knight: [[['c2015', 'full'], ['c2014', 'head'], ['c2619', 'feet']]],
  viking: [[['c2617', 'top', '#6a5a46'], ['c2618', 'bottom'], ['c2619', 'feet']], [['c143', 'full'], ['c2619', 'feet']]],
  samurai: [[['c3171', 'full', '#2a2a3a'], ['c428', 'prop']]], ninja: [[['c462', 'full', '#141418'], ['c30', 'face', '#141418'], ['c1852', 'hands', '#141418']], [['c463', 'full', '#141418'], ['c30', 'face', '#141418'], ['c1852', 'hands', '#141418']]],
  wizard: [[['c3238', 'full', '#3b2a6b'], ['c3236', 'head', '#3b2a6b'], ['c2358', 'prop']]], witch: [[['c2521', 'full', '#1a1a1e'], ['c24', 'head', '#151515'], ['c1738', 'feet', '#151515']]],
  king: [[['c226', 'full', '#6a1a24'], ['c2704', 'head', '#d4af37'], ['c2548', 'feet', '#2a1e14']]], queen: [[['c1157', 'full', '#5a1a4a'], ['c2704', 'head', '#d4af37'], ['c1039', 'feet']]],
  princess: [[['c1157', 'full', '#e7a6c4'], ['c2704', 'head', '#d4af37'], ['c1734', 'feet']]], prince: [[['c1774', 'top', '#e8e0c8'], ['c1756', 'bottom', '#2b2b33'], ['c2548', 'feet'], ['c2128', 'cape', '#4a1a2a']]],
  pirate: [[['c1774', 'top', '#e8e0c8'], ['c1849', 'outer', '#3a2a1a'], ['c27', 'bottom', '#3a3a44'], ['c2548', 'feet', '#2a1e14'], ['c2510', 'eyes']], [['c1158', 'top', '#e8e0c8'], ['c1849', 'outer', '#3a2a1a'], ['c1756', 'bottom', '#2a2a30'], ['c211', 'feet'], ['c2510', 'eyes']]],
  cowboy: [[['c3165', 'top', '#c9b48a'], ['c1849', 'outer', '#4a3020'], ['c807', 'bottom'], ['c2548', 'feet', '#4a3020'], ['c24', 'head', '#5a3e26']], [['c1158', 'top', '#c9b48a'], ['c1849', 'outer', '#4a3020'], ['c807', 'bottom'], ['c1738', 'feet', '#4a3020'], ['c24', 'head', '#5a3e26']]],
  zombie: [[['c1416', 'top', '#6a6c5a'], ['c807', 'bottom', '#3c3e34']], [['c1158', 'top', '#6a6c5a'], ['c1727', 'bottom', '#3c3e34']]],
  orc: [[['c2617', 'top', '#4a3a2a'], ['c2618', 'bottom', '#3a3026'], ['c2619', 'feet']]],
  warrior: [[['c2617', 'top', '#5a4a3a'], ['c2618', 'bottom', '#3a3026'], ['c2619', 'feet']], [['c241', 'top', '#5a3a26'], ['c1756', 'bottom', '#2a2420'], ['c2619', 'feet']]],
  robot: [[['c2880', 'full', '#c4c8cf']]], ghost: [[['c3515', 'full']]], monk: [[['c3238', 'full', '#5a4632'], ['c3236', 'head', '#5a4632']]],
  astronaut: [[['c3517', 'full']]], soldier: [[['c2694', 'top'], ['c2798', 'bottom'], ['c11', 'feet']]],
  police: [[['c3165', 'top', '#2a3a5a'], ['c3244', 'bottom', '#1f2a4a'], ['c11', 'feet', '#151515'], ['c78', 'head', '#1f2a4a']]],
  doctor: [[['m_male_casualsuit06', 'full'], ['c1412', 'outer'], ['m_shoes05', 'feet']], [['m_female_casualsuit01', 'full'], ['c157', 'outer'], ['c1117', 'feet']]],
  detective: [[['m_male_elegantsuit01', 'full'], ['m_fedora01', 'head'], ['c1732', 'feet']], [['c1739', 'full'], ['m_fedora01', 'head'], ['c1741', 'feet']]],
  business: [[['m_male_elegantsuit01', 'full'], ['c1732', 'feet']], [['m_female_elegantsuit01', 'full'], ['c156', 'feet']]],
  worker: [[['m_male_worksuit01', 'full'], ['m_shoes03', 'feet']]], athlete: [[['m_male_casualsuit04', 'full'], ['m_shoes05', 'feet']], [['m_female_sportsuit01', 'full'], ['m_shoes05', 'feet']]],
  student: [[['c1416', 'top'], ['c807', 'bottom'], ['m_shoes05', 'feet']], [['c1750', 'top'], ['c1751', 'bottom'], ['c1078', 'feet'], ['c1700', 'feet']]],
  chef: [[['c3165', 'top', '#f2f2ee'], ['c1194', 'bottom', '#3a3a40'], ['m_shoes01', 'feet']]]
};
// what everyone else wears, by the story's world (one of each list, different for each character)
const SCL_WORLD_WEAR = {
  fantasy: [[[['c1774', 'top', '#cdbb9a'], ['c2618', 'bottom', '#4a3a2a'], ['c2548', 'feet', '#3a2a20']], [['c2617', 'top', '#5b6a52'], ['c1756', 'bottom', '#2b2b33'], ['c2619', 'feet']]],
    [[['c12', 'full', '#6b4a3a'], ['c1734', 'feet']], [['c1158', 'top', '#e8e0c8'], ['c1727', 'bottom', '#3d4a6a'], ['c1738', 'feet', '#3a2a20']]]],
  western: [[[['c3165', 'top', '#c9b48a'], ['c1849', 'outer', '#4a3020'], ['c807', 'bottom'], ['c2548', 'feet', '#4a3020']]], [[['c1640', 'full', '#8a5a4a'], ['c1738', 'feet', '#4a3020']]]],
  scifi: [[[['c1333', 'top'], ['c1329', 'bottom'], ['c237', 'feet']], [['c1330', 'top'], ['c1329', 'bottom'], ['c237', 'feet']]], [[['c1327', 'full'], ['c237', 'feet']], [['c1328', 'full'], ['c237', 'feet']]]]
};
const SCL_SLOTS_BODY = ['full', 'top', 'bottom'];

/* ---------- the body ---------- */
const SCL_F = new Set('mujer mujeres chica nina senora senorita dama woman women girl lady wife mother daughter sister grandmother widow femme fille dame mere soeur mulher menina rapariga senhora mae irma frau madchen dame mutter schwester tochter donna ragazza signora madre sorella figlia dona noia senyora mare germana reina queen reine rainha konigin regina princesa princess princesse prinzessin principessa bruja witch heroina heroine actriz actress madrastra stepmother abuela grandma oma nonna avia'.split(' '));
const SCL_M = new Set('hombre hombres chico nino senor caballero man men boy guy gentleman husband father brother grandfather homme garcon monsieur pere frere fils homem menino rapaz senhor pai irmao mann herr vater bruder sohn uomo ragazzo signore padre fratello figlio senyor germa rey king roi rei konig principe prince prinz heroe hero heros eroe actor padrastro abuelo grandpa opa nonno avi barba barbudo beard bearded bigote mustache moustache bart schnurrbart baffi'.split(' '));
const SCL_ART_F = new Set('una une uma eine'.split(' ')), SCL_ART_M = new Set('un um ein uno'.split(' '));
const SCL_WORDNUM = {veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  vingt: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60, 'soixante-dix': 70, 'quatre-vingts': 80, 'quatre-vingt': 80, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, oitenta: 80,
  zwanzig: 20, dreissig: 30, vierzig: 40, funfzig: 50, sechzig: 60, siebzig: 70, achtzig: 80, neunzig: 90, venti: 20, trenta: 30, quaranta: 40, cinquanta: 50, sessanta: 60, settanta: 70, ottanta: 80, novanta: 90,
  vint: 20, trent: 30};
for (const [n, ws] of [[5, 'cinco five cinq cinc funf cinque'], [6, 'seis six sis sechs sei'], [7, 'siete seven sept sete set sieben sette'], [8, 'ocho eight huit oito vuit acht otto'], [9, 'nueve nine neuf nove nou neun'],
  [10, 'diez ten dix dez deu zehn dieci'], [11, 'once eleven onze elf undici'], [12, 'doce twelve douze doze dotze zwolf dodici'], [13, 'trece thirteen treize treze tretze dreizehn tredici'], [14, 'catorce fourteen quatorze catorze vierzehn quattordici'],
  [15, 'quince fifteen quinze funfzehn quindici'], [16, 'dieciseis sixteen seize dezasseis setze sechzehn sedici'], [17, 'diecisiete seventeen dix-sept dezassete disset siebzehn diciassette'], [18, 'dieciocho eighteen dix-huit dezoito divuit achtzehn diciotto'], [19, 'diecinueve nineteen dix-neuf dezanove dinou neunzehn diciannove']]) for (const w of ws.split(' ')) SCL_WORDNUM[w] = n;
const yearsToAge = y => y < 25 ? Math.max(.05, y / 25) : Math.min(2, 1 + (y - 25) / 55);
const SCL_AGE_W = [[.05, 'bebe|baby|bebes|nourrisson|neugeboren*|neonato'], [.25, 'nino|nina|nene|nena|crio|cria|chaval*|child|kid|little boy|little girl|enfant|gamin*|crianca|menino|menina|kind|kinder|bambino|bambina|nen|nena|petit garcon|petite fille'],
  [.5, 'adolescente|teen*|teenager|ado|adolescent*|jugendlich*|ragazzino|ragazzina|chaval|chavala|muchacho|muchacha'], [.85, 'joven|jovenes|young|jeune|jeunes|jovem|jung|junge|junger|jungen|giovane|giovani|jove'],
  [1.4, 'mediana edad|middle-aged|middle aged|d\'age mur|age moyen|meia-idade|mittleren alters|mezza eta|maduro|madura'], [1.85, 'anciano|anciana|viejo|vieja|old|elderly|aged|vieux|vieille|age|agee|idoso|idosa|velho|velha|alt|alte|alter|greis*|anziano|anziana|vecchio|vecchia|vell|vella|abuelo|abuela|grandpa|grandma|grandfather|grandmother']];
const SCL_AGE_PATS = SCL_AGE_W.map(([a, w]) => [a, scPats(w)]);
const SCL_BUILD = [
  [{height: 1, muscle: .85, weight: .68}, 'gigante|gigantesco|gigantesca|enorme|huge|giant|gigantic|massive|colosal|colossal|imponente|towering|hulking|gigantesque|immense|gigantesco|riesig*|kolossal|enorme|gegant'],
  [{height: 0, weight: .62}, 'enano|enana|dwarf|nain|naine|anao|zwerg*|nano|nana'],
  [{muscle: .88, weight: .45}, 'musculos*|muscular|muscled|muscle*|muscle|muscle|fornid*|forzud*|atletic*|athletic|musclé*|muscle|robust*|kraftig*|muskulos*|muscolos*|corpulento|corpulenta|cachas|ripped|buff'],
  [{weight: .14, muscle: .35}, 'delgad*|flac*|thin|slim|skinny|slender|lanky|mince|maigre|magr*|dunn*|schlank*|esbelt*|sottile|prim|prima|escualid*|huesud*|scrawny'],
  [{weight: .9}, 'gord*|obes*|fat|chubby|heavy|rechonch*|regordete*|gros|grosse|dick*|grasso|grassa|gras|gras|corpulent'],
  [{height: .85}, 'alto|alta|altos|altas|tall|grand|grande|grandes|hoch|grosse|gross|alto|alta|gigante|gigantes|giant|giants|geant|geante|riesig*|gegant|gegants|gigantesc*'],
  [{height: .2}, 'bajito|bajita|de baja estatura|de corta estatura|hombre bajo|mujer baja|chico bajo|chica baja|muy bajo|muy baja|petit|petite|baixinho|baixinha|klein|kleine|kleiner|basso|bassa|bassino|pequeno|pequena|baixet|baixeta|menudo|menuda|small|tiny|diminut*|minuscul*|winzig*']
];
const SCL_BUILD_PATS = SCL_BUILD.map(([v, w]) => [v, scPats(w)]);
// half human: «zorro-humana», «fox ears», «mitad lobo», «nekomimi»
const SCL_HUMAN = new Set('humano humana humanos humanas human humaine humain humaines humano mensch menschlich umano umana huma humana'.split(' '));
const SCL_EARS = new Set('orejas oreja ears ear oreilles oreille orelhas orelha ohren ohr orecchie orecchio orelles orella'.split(' '));
const SCL_TAIL = new Set('cola colas tail tails queue cauda schwanz coda cua rabo'.split(' '));
const SCL_EYES = new Set('ojos ojo eyes eye yeux oeil olhos olho augen auge occhi occhio ulls ull mirada'.split(' '));
const SCL_YOUNGP = new Set('chica chico nina nino muchacha muchacho girl boy fille garcon madchen junge ragazza ragazzo noia noi menina menino rapariga rapaz'.split(' '));
const SCL_HALF = /\b(mitad|medio|half|demi|meio|metade|halb|meta|mig|semi)\b/;
const SCL_MIMI = {nekomimi: 'gato', kitsune: 'zorro', inumimi: 'perro', usagimimi: 'conejo', kemonomimi: null};

/* ---------- what is said about each character ---------- */
// the sentences of the action that describe them: the introduction («NAME, …» / «NAME (40s), …» / «El científico NAME …»)
// whole, and every sentence that has them wear or carry something; cut where another character comes in
// (positions kept: a letter with an accent is still one letter, so a cut in the plain text cuts the real one)
const SCL_CONJ = new Set("y e i and et und ed og la el en na le les los las the der die das lo il l' n'".split(' '));
const SCL_GROUP = /^\s*[,(]\s*(dos|tres|cuatro|ambos|ambas|los dos|las dos|two|three|four|both|the two|deux|trois|quatre|tous|toutes|les deux|zwei|drei|vier|beide|due|tre|quattro|entrambi|entrambe|i due|tots|totes|dues|els dos|les dues|dois|duas|os dois|as duas)\b/;
const normKeep = t => [...t].map(ch => scNorm(ch).charAt(0) || ' ').join('');
function descOf(c, cast, P, kind) {
  const K = castKeys(cast), me = cast.indexOf(c), mine = new Set(K.filter(k => k[1] === me).map(k => k[0])), others = new Set(K.filter(k => k[1] !== me).map(k => k[0]));
  const WEAR = /\b(lleva|llevan|viste|visten|vestid|lleva puest|wears|wearing|dressed|in a|in an|in black|in white|in red|in blue|in green|in grey|in gray|in brown|in pink|in purple|in yellow|in dark|in leather|in uniform|in uniforms|in suits|in armor|in armour|in robes|in rags|con|with|avec|com|mit|porte|portant|veste|usa|tragt|indossa|vestit|porta|de cabello|de pelo|of hair|aux cheveux|com cabelo|haar|dai capelli|con i capelli)\b/;
  const out = []; let intro = false;
  for (const sc of P.scenes) for (const b of sc.beats) if (b.k === 'act') for (const sent of b.text.split(/(?<=[.!?])\s+/)) {
    const raw = sent.replace(/\s+/g, ' '), nk = normKeep(raw), words = [...nk.matchAll(/[a-z0-9ñç']+/g)].map(m => ({w: m[0], at: m.index}));
    const at = words.findIndex(x => mine.has(x.w)); if (at < 0) continue;
    // names said together and described together: «En POL i la LAIA, dos alumnes de deu anys» is both of them
    let i0 = at, j0 = at; const joined = (a, b) => words.slice(a + 1, b).every(x => SCL_CONJ.has(x.w) || mine.has(x.w) || others.has(x.w));
    for (let k = at + 1; k < words.length; k++) if (others.has(words[k].w)) { if (joined(j0, k)) j0 = k; else break; }
    for (let k = at - 1; k >= 0; k--) if (others.has(words[k].w)) { if (joined(k, i0)) i0 = k; else break; }
    const both = (i0 < at || j0 > at) && SCL_GROUP.test(nk.slice(words[j0].at + words[j0].w.length));
    const firstOther = words.findIndex((x, i) => others.has(x.w) && i > (both ? j0 : at)), firstMention = !words.slice(0, both ? i0 : at).some(x => others.has(x.w));
    const cut = firstOther < 0 ? raw.length : words[firstOther].at, seg = raw.slice(firstMention ? 0 : words[both ? i0 : at].at, cut);
    // an apposition after the name («REX, un lobo…»), or the name the apposition of what it is («Un DRAGON rouge, FLAMÈCHE, dort»)
    // (or the name said with its apposition later in the sentence: «JOE, un vaquero…, y BILL, un sheriff con bigote»)
    const own = new RegExp(`^[^a-z0-9]*${words[at].w}\\b\\s*[,(]`).test(normKeep(seg));
    if (!intro && own) { intro = true; out.push(seg); continue; }
    const apposition = both || new RegExp(`^[^,(]*?\\b${words[at].w}\\b[^,(]*?\\s*[,(]`).test(nk) || new RegExp(`[,(]\\s*${words[at].w}\\s*[,)]`).test(nk);
    if (!intro && firstMention && (apposition || kind || WEAR.test(nk))) { intro = true; out.push(seg); continue; }
    if (firstMention && WEAR.test(normKeep(seg))) out.push(seg);
  }
  return out.join(' . ');
}
// the description → a body, hair and clothes (anything not found is left as it is; the name's own words are not read:
// «LEÓN, un chico» is not a lion)
function lookFrom(name, desc, ctx) {
  const own = new Set(ctx.kind ? [] : scContent(name)), toks = scNorm(desc).replace(/[-‐]/g, ' ').split(/([,;:.()]|\s+)/).map(x => x.trim()).filter(Boolean).filter(x => !own.has(x));
  const wt = [], w = []; toks.forEach((x, ti) => { if (/[a-z0-9]/.test(x)) { w.push(x); wt.push(ti); } }); const D = w.join(' ');
  const has = (pats, from = 0) => scFind(w, pats, from), out = {body: {}, wear: [], hair: undefined, hairCol: undefined, roles: []};
  // who: an article at the start of the description, nouns, a beard
  let g = null; const art = w.find(x => SCL_ART_F.has(x) || SCL_ART_M.has(x)), artAt = w.indexOf(art);
  for (const x of w) { if (SCL_F.has(x)) { g = 'mujer'; break; } if (SCL_M.has(x)) { g = 'hombre'; break; } }
  if (g) out.body.gender = g === 'mujer' ? 0 : 1;
  else if (art && artAt <= 3) { const ag = SCL_ART_F.has(art) ? 'mujer' : 'hombre', who = w.slice(artAt + 1, artAt + 3).some(x => SC_PERSON.has(x) || SCL_ROLE_PATS.some(([, pats]) => scFind([x], pats)));
    if (who) out.body.gender = ag === 'mujer' ? 0 : 1; else out.gWeak = ag; }  // (a hint: «ELENA, joven, con un vestido» is still Elena)
  // age: «(40s)», «(30)», «40 años», «fifty years old», «cinquante ans», «trent'anni», or a word
  let yrs = null; const nd = scNorm(desc);
  const m1 = nd.match(/\(\s*(\d{1,2})\s*'?s?\s*\)/) || nd.match(/\b(\d{1,2})\s*(?:anos|ano|years?|yrs|ans|anni|anys|jahre|jahrige?|year-old|-year-old|y\/o)\b/) || nd.match(/,\s*(\d{1,2})\s*,/);
  if (m1) yrs = +m1[1]; else for (const [k, v] of Object.entries(SCL_WORDNUM)) if (new RegExp(`\\b${k}(?:'|\\s)?(?:anos|years|ans|anni|anys|jahre|ani)?\\b`).test(nd) && /(anos|years|ans|anni|anys|jahre|'anni|ish|something|aine|ans)/.test(nd)) { yrs = v; break; }
  if (/\b(\d)0s\b|\b(\d)0'?s\b/.test(nd) && !yrs) yrs = +(nd.match(/\b(\d)0'?s\b/) || [0, 3])[1] * 10 + 3;
  if (yrs) out.body.age = yearsToAge(yrs); else for (const [a, pats] of SCL_AGE_PATS) if (has(pats)) { out.body.age = a; break; }
  // build
  for (const [v, pats] of SCL_BUILD_PATS) { const f = has(pats); if (!f) continue;
    // «short hair», «pelo corto de…» is the hair (but «alta amb cabells arrissats» is tall)
    const nx = w.slice(f.j + 1, f.j + 3), of = x => SCL_HAIR_NOUN.has(x) || SCL_TAIL.has(x), ofHair = of(nx[0]) || (/^(de|of|du|des|do|da|di)$/.test(nx[0] || '') && of(nx[1]));
    if ('height' in v && ofHair) continue;
    for (const [k, x] of Object.entries(v)) if (out.body[k] === undefined) out.body[k] = x; }
  // an animal, whole or half
  let sp = null, half = false;
  for (const [i, x] of w.entries()) { for (const [s, list] of SC_SPECIES) if (list.includes(x)) { sp = s; if (SCL_HUMAN.has(w[i + 1]) || SCL_HUMAN.has(w[i - 1]) || SCL_EARS.has(w[i - 1]) || SCL_EARS.has(w[i - 2]) || SCL_YOUNGP.has(w[i - 1]) || SCL_YOUNGP.has(w[i + 1]) || SCL_HALF.test(w.slice(Math.max(0, i - 2), i).join(' '))) half = true; break; } if (sp) break; }
  for (const [k, s] of Object.entries(SCL_MIMI)) if (w.includes(k)) { if (s) sp = sp || s; half = true; }
  if (sp) { out.body.species = sp; if (half) Object.assign(out.body, {headStyle: 'real', kemo: 1, feet: 'humano'}); }
  // colours, each to the thing it is said of: the nearest noun of its phrase (before it in the Romance languages, after
  // it in English and German), never across a comma
  const things = [];  // {i, j, kind: 'wear'|'hair'|'tail'|'body', item}
  // (plurals too: «THUGS in black suits», «dos guardias con trajes grises»)
  const w1 = w.map(x => x.length > 4 && /[^s]s$/.test(x) ? x.slice(0, -1) : x);
  for (const it of SCL_WEAR_PATS) for (const ws of [w, w1]) { let from = 0, f; while ((f = scFind(ws, it.pats, from))) { if (!things.some(t => t.item === it && t.i === f.i)) things.push({i: f.i, j: f.j, kind: 'wear', item: it}); from = f.j + 1; } }
  w.forEach((x, i) => { if (SCL_HAIR_NOUN.has(x)) things.push({i, j: i, kind: 'hair'}); else if (SCL_TAIL.has(x)) things.push({i, j: i, kind: 'tail'}); else if (SCL_EARS.has(x)) things.push({i, j: i, kind: 'ears'}); else if (SCL_EYES.has(x)) things.push({i, j: i, kind: 'eyes'}); });
  // (a longer phrase wins over a word inside it: «traje espacial» over «traje»)
  const kept = things.filter((t, k) => !things.some((u, l) => l !== k && u.kind === 'wear' && t.kind === 'wear' && u.i <= t.i && u.j >= t.j && (u.j - u.i > t.j - t.i)));
  const sepBetween = (a, b) => toks.slice(Math.min(wt[a], wt[b]), Math.max(wt[a], wt[b])).some(x => /^[,;:.()]$/.test(x));
  const colours = []; w.forEach((x, i) => { const hex = SCL_COLOR_OF.get(x); if (hex) colours.push({i, hex: SCL_DARK.has(w[i + 1]) || SCL_DARK.has(w[i - 1]) ? shadeHex(hex, .55) : SCL_LIGHT.has(w[i + 1]) || SCL_LIGHT.has(w[i - 1]) ? mixHex(hex, '#ffffff', .45) : hex}); });
  const romance = !['en', 'de'].includes(ctx.lang);
  for (const c of colours) {
    let best = null, bd = 9;
    for (const t of kept) { const after = t.j < c.i, d = after ? c.i - t.j : t.i - c.i; if (d <= 0 || d > (after ? 3 : 2) || sepBetween(after ? t.j : c.i, after ? c.i : t.i)) continue; const score = d + (after === romance ? 0 : .6); if (score < bd) { bd = score; best = t; } }
    if (best) best.col = best.col || (best.kind === 'hair' ? SCL_HAIR_HEX[c.hex] || c.hex : c.hex);
    if (best && best.kind === 'eyes') out.eyeCol = best.col;
  }
  // hair: a colour said of it, or an adjective that is a hair colour, and its cut
  const hairT = kept.find(t => t.kind === 'hair' && t.col); if (hairT) out.hairCol = hairT.col;
  if (!out.hairCol) for (const x of w) if (SCL_HAIR_ADJ_OF.has(x)) { const hex = SCL_HAIR_ADJ_OF.get(x); if (hex === '') out.hair = ''; else out.hairCol = hex; break; }
  // (a cut that is also an everyday word — long, short, «mono» — only next to the word for hair)
  if (out.hair !== '') for (const [k, pats] of SCL_HAIR_CUT_PATS) { const f = has(pats); if (!f) continue; const near = w.slice(f.i, f.j + 4).concat(w.slice(Math.max(0, f.i - 3), f.i)).some(x => SCL_HAIR_NOUN.has(x));
    if (['long', 'short', 'bun', 'spiky'].includes(k) ? near || (k === 'long' && w[f.i] === 'melena') : true) { out.cut = k; break; } }
  // a tail or a coat colour for an animal
  const tailT = kept.find(t => t.kind === 'tail' && t.col); if (tailT) out.tailCol = tailT.col;
  if (sp && !half) { const c0 = colours.find(c => !kept.some(t => t.col === c.hex && t.kind === 'wear')); if (c0) out.furCol = c0.hex; }
  // dressed in a colour («vestito di nero», «dressed in black»): everything not otherwise coloured, and no dress said
  const all = D.match(SCL_ALLCOL); if (all && SCL_COLOR_OF.get(all[2])) { out.allCol = SCL_COLOR_OF.get(all[2]); for (let k = kept.length - 1; k >= 0; k--) if (kept[k].kind === 'wear' && ['dress', 'gown'].includes(kept[k].item.k) && /^vest|^dress/.test(w[kept[k].i])) kept.splice(k, 1); }
  // clothes said, each with its colour
  for (const t of kept) if (t.kind === 'wear') out.wear.push({k: t.item.k, slot: t.item.slot, ids: (out.body.gender === 0 || (out.body.gender == null && (ctx.g || out.gWeak) === 'mujer')) ? t.item.f : t.item.m, col: t.col || t.item.col, glow: /luminos|brillant|glowing|shining|lumineu|leuchtend|luminos|incandescent|energia|energy/.test(w.slice(t.j + 1, t.j + 3).join(' ') + ' ' + w.slice(Math.max(0, t.i - 2), t.i).join(' '))});
  // roles
  for (const [k, pats] of SCL_ROLE_PATS) if (has(pats)) out.roles.push(k);
  return out;
}
// the outfit: the role's clothes (or the story world's), with what was said put on top, slot by slot, and the gaps filled
function dressOf(look, ctx) {
  const fem = ctx.g === 'mujer', pick = (list, h) => list[Math.floor(h * list.length) % list.length];
  const said = look.wear, role = look.roles.map(r => r === 'captain' && ctx.genre !== 'scifi' ? null : r).find(r => r && (SCL_ROLE_WEAR[r] || r === 'captain'));
  let base = [];
  if (role === 'captain') base = (SCL_WORLD_WEAR.scifi[fem ? 1 : 0][0]).map(x => x.slice());
  else if (role) { const R = SCL_ROLE_WEAR[role]; base = (fem && R[1] ? R[1] : R[0]).map(x => x.slice()); }
  else if (SCL_WORLD_WEAR[ctx.genre]) base = pick(SCL_WORLD_WEAR[ctx.genre][fem ? 1 : 0], ctx.h).map(x => x.slice());
  const slots = new Set(said.map(x => x.slot));
  let items = base.filter(([id, slot]) => !slots.has(slot) && !(slots.has('full') && ['top', 'bottom'].includes(slot)) && !((slots.has('top') || slots.has('bottom')) && slot === 'full'));
  // armour and uniforms belong to their world: plates and mail in a fantasy, a hard suit in science fiction or with
  // superheroes, a starship's uniform in space
  const WORLD = {armor: {scifi: ['c2882'], superhero: ['c2882']}, uniform: {scifi: fem ? ['c1327'] : ['c1331', 'c1329'], fantasy: fem ? ['c241', 'c1756'] : ['c2617', 'c2618']}};
  for (const s of said) for (const id of (WORLD[s.k] && WORLD[s.k][ctx.genre]) || s.ids) items.push([id, s.slot, s.col, s.glow]);
  if (look.allCol) items = items.map(x => x[2] || !['full', 'top', 'bottom', 'outer', 'feet'].includes(x[1]) ? x : [x[0], x[1], look.allCol, x[3]]);
  // nobody undressed: something on the body, the legs and the feet
  const has = sl => items.some(x => x[1] === sl), dressed = has('full') || (has('top') && has('bottom'));
  if (!dressed && !items.length && !look.allCol) return null;  // nothing said and no role: the everyday wardrobe (see the caller)
  if (!dressed) {
    if (!has('top') && !has('full')) items.push(fem ? ['c1158', 'top', look.allCol || null] : ['c3165', 'top', look.allCol || null]);
    if (!has('bottom') && !has('full')) items.push(fem ? ['c1727', 'bottom', look.allCol || null] : ['c3244', 'bottom', look.allCol || null]);
  }
  if (!has('feet') && !items.some(x => ['c2015', 'c3517', 'c3515', 'c2880'].includes(x[0]))) items.push(ctx.genre === 'fantasy' || ctx.genre === 'western' ? [fem ? 'c1738' : 'c2548', 'feet', '#3a2a20'] : [fem ? 'c1117' : 'm_shoes01', 'feet', null]);
  const seen = new Set();
  // (two of the catalogue's everyday pieces come printed — splashes, flowers —: plain, unless a colour was said)
  const PLAIN = {c3244: '#3d4150', c1727: '#4a4f6a'};
  return items.filter(([id]) => !seen.has(id) && seen.add(id)).map(([id, , col, glow]) => { if (glow && !col) col = '#7fd8ff'; if (!col && PLAIN[id]) col = PLAIN[id]; return garmentSpec(id, col ? {mode: 'tint', colA: glow ? mixHex(col, '#ffffff', .35) : col, ...(glow ? {glow: 1} : {})} : {}); });
}
