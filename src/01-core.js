const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const DEG = Math.PI / 180;
const V3 = THREE.Vector3, Q = THREE.Quaternion;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
};
const MAX_CHARS = 4;

/* ---------- joints ---------- */
const JOINTS = ['hips','waist','chest','neck','head','jaw','earL','earR','shoulderL','elbowL','wristL','shoulderR','elbowR','wristR','hipL','kneeL','ankleL','hipR','kneeR','ankleR','tail1','tail2','tail3'];
const JOINT_LABEL = {hips:'Pelvis · todo el cuerpo',waist:'Cintura',chest:'Pecho',neck:'Cuello',head:'Cabeza',jaw:'Mandíbula',earL:'Oreja izquierda',earR:'Oreja derecha',
  shoulderL:'Hombro izquierdo',elbowL:'Codo izquierdo',wristL:'Muñeca izquierda',shoulderR:'Hombro derecho',elbowR:'Codo derecho',wristR:'Muñeca derecha',
  hipL:'Cadera izquierda',kneeL:'Rodilla izquierda',ankleL:'Tobillo izquierdo',hipR:'Cadera derecha',kneeR:'Rodilla derecha',ankleR:'Tobillo derecho',
  tail1:'Cola · base',tail2:'Cola · centro',tail3:'Cola · punta'};
tValues(JOINT_LABEL);
const HINGE = {elbowL:[-150,0], elbowR:[-150,0], kneeL:[0,150], kneeR:[0,150]};
const SPINE = ['waist','chest','neck','head'];
// FK drag: moving a joint turns its parent bone towards the cursor
const JOINT_PARENT = {waist:'hips', chest:'waist', neck:'chest', head:'neck', shoulderL:'chest', elbowL:'shoulderL', wristL:'elbowL', shoulderR:'chest', elbowR:'shoulderR', wristR:'elbowR',
  hipL:'hips', kneeL:'hipL', ankleL:'kneeL', hipR:'hips', kneeR:'hipR', ankleR:'kneeR', tail2:'tail1', tail3:'tail2'};
const DOT_JOINTS = ['hips','waist','chest','neck','head','shoulderL','elbowL','wristL','shoulderR','elbowR','wristR','hipL','kneeL','ankleL','hipR','kneeR','ankleR','tail1','tail2','tail3','earL','earR'];

/* ---------- bodies ---------- */
const BODY_BASE = {flex:1, stretch:1, limbs:{}, adv:{}, shape:'ninguna', shapeAmt:.7, build:null, gender:1, age:1, muscle:.5, weight:.5, height:.5, ideal:.5, head:1, legs:1, arms:1, torso:1, species:'humano', hair:'', hairCol:'#3a2a20'};
const BODY_PRESETS = {
  hombre:     {label:'Hombre', gender:1},
  mujer:      {label:'Mujer', gender:0},
  atletico:   {label:'Atlético', gender:1, muscle:.9, weight:.35, height:.6, ideal:.8},
  atletica:   {label:'Atlética', gender:0, muscle:.85, weight:.35, height:.55, ideal:.8},
  delgado:    {label:'Delgado', gender:1, muscle:.3, weight:.1, height:.55, ideal:.3},
  robusta:    {label:'Robusta', gender:0, muscle:.45, weight:.95, height:.45, ideal:.2},
  adolescente:{label:'Adolescente', gender:1, age:.45, muscle:.45, weight:.4, ideal:.4},
  adolescenta:{label:'Adolescente (chica)', gender:0, age:.45, muscle:.45, weight:.4, ideal:.4},
  nino:       {label:'Niño', gender:1, age:0, ideal:.3},
  nina:       {label:'Niña', gender:0, age:0, ideal:.3},
  animeM:     {label:'Anime (chico)', gender:1, age:.75, muscle:.55, weight:.22, height:.6, ideal:.85, head:.9, legs:1.12, arms:1.04, torso:.96},
  animeF:     {label:'Anime (chica)', gender:0, age:.7, muscle:.4, weight:.28, height:.55, ideal:.85, head:.9, legs:1.15, arms:1.02, torso:.94},
  chibi:      {label:'Chibi', gender:.5, age:.1, weight:.6, ideal:0, head:1.8, legs:.62, arms:.72, torso:.82},
  heroico:    {label:'Heroico (cómic)', gender:1, muscle:1, weight:.4, height:.68, ideal:1, head:.86, legs:1.06},
  mayor:      {label:'Hombre mayor', gender:1, age:1.65, muscle:.35, weight:.6, height:.45},
  mayora:     {label:'Mujer mayor', gender:0, age:1.65, muscle:.3, weight:.6, height:.4}
};
tLabels(BODY_PRESETS);
const bodyOf = id => { const p = {...BODY_BASE, ...BODY_PRESETS[id]}; delete p.label; return p; };
const BODY_SLIDERS = [
  ['age','Edad',0,2,v => tr('≈ {n} años', {n: ageYears(v)})],
  ['gender','Mujer · Hombre',0,1],['muscle','Musculatura',0,1],['weight','Grasa corporal',0,1],['height','Altura',0,1],
  ['ideal','Proporciones idealizadas',0,1]
];
const STYLE_SLIDERS = [
  ['head','Tamaño de cabeza',.75,2],['legs','Largo de piernas',.55,1.3],['arms','Largo de brazos',.6,1.25],['torso','Largo de torso',.7,1.2]
];
for (const r of [...BODY_SLIDERS, ...STYLE_SLIDERS]) r[1] = tr(r[1]);
/* species: the head is a downloaded sculpt (see 11-heads.js); tails, horns, antlers and some ears are built here.
   A species can borrow another's head (head:) and keep its own legs (legs:), so close relatives (coyote, snow leopard,
   raccoon…) are told apart by their coat, tail, ears and size the way the animals are; hide: parts of the borrowed
   sculpt left out (1 its ears, 3 its horns), replaced by ears: built for the species. tail.rest is the
   natural carriage (degrees on tail1..3: x lifts, y swings, z rolls). coat: the default coat (10c-coat.js). */
const SPECIES = {
  humano:   {label:'Humano'},
  lobo:     {label:'Lobo',     fam:'can', coat:'lobo',     tail:{len:.55,r:.065,shape:'tupida', rest:[[-8,0,0],[-6,0,0],[-4,0,0]]}},
  perro:    {label:'Perro',    fam:'can', coat:'perro',    tail:{len:.45,r:.045,shape:'fina',   rest:[[38,0,0],[22,0,0],[14,0,0]]}},
  zorro:    {label:'Zorro',    fam:'can', coat:'zorro',    tail:{len:.7,r:.1,shape:'tupida',    rest:[[4,0,0],[-4,0,0],[4,0,0]]}},
  coyote:   {label:'Coyote',   fam:'can', head:'lobo', coat:'coyote', tail:{len:.5,r:.07,shape:'tupida', rest:[[-14,0,0],[-6,0,0],[-2,0,0]]}},
  hiena:    {label:'Hiena',    fam:'can', head:'perro', coat:'hiena', tail:{len:.38,r:.05,shape:'penacho', rest:[[-20,0,0],[-6,0,0],[0,0,0]]}},
  gato:     {label:'Gato',     fam:'fel', coat:'gato',     tail:{len:.65,r:.045,shape:'fina',   rest:[[58,0,0],[18,0,0],[-26,0,0]]}},
  tigre:    {label:'Tigre',    fam:'fel', head:'gato', legs:'tigre', coat:'tigre',    tail:{len:.8,r:.06,shape:'fina',     rest:[[-14,0,0],[-8,0,0],[14,0,0]]}},
  leon:     {label:'León',     fam:'fel', head:'gato', legs:'leon', coat:'leon',     tail:{len:.75,r:.045,shape:'penacho', rest:[[-16,0,0],[-6,0,0],[10,0,0]]}, mane: true},
  leopardo: {label:'Leopardo de las nieves', fam:'fel', head:'gato', legs:'leon', coat:'leopardo', tail:{len:.9,r:.085,shape:'gruesa', rest:[[-10,0,0],[-4,0,0],[18,0,0]]}},
  oso:      {label:'Oso',      fam:'otro', head:'zorro', legs:'oso', hide:[1], coat:'oso', tail:{len:.07,r:.06,shape:'pompón',  rest:[[10,0,0],[0,0,0],[0,0,0]]}, ears:{shape:'redonda', h:.26, w:.17, d:.06, out:24, back:6}},
  mapache:  {label:'Mapache',  fam:'otro', head:'zorro', coat:'mapache', tail:{len:.5,r:.085,shape:'gruesa', rest:[[-6,0,0],[2,0,0],[6,0,0]]}},
  panda:    {label:'Panda rojo', fam:'otro', head:'zorro', coat:'panda', tail:{len:.6,r:.09,shape:'gruesa', rest:[[-2,0,0],[4,0,0],[6,0,0]]}},
  mofeta:   {label:'Mofeta',   fam:'otro', head:'gato', coat:'mofeta', tail:{len:.6,r:.12,shape:'tupida', rest:[[70,0,0],[30,0,0],[-30,0,0]]}},
  conejo:   {label:'Conejo',   fam:'pre', coat:'conejo',   tail:{len:.08,r:.065,shape:'pompón', rest:[[24,0,0],[0,0,0],[0,0,0]]}},
  ciervo:   {label:'Ciervo',   fam:'pre', head:'cabra', legs:'ciervo', hide:[3], coat:'ciervo',   tail:{len:.1,r:.045,shape:'pompón',  rest:[[16,0,0],[0,0,0],[0,0,0]]}, horns:{h:.62,r:.035,out:28,back:30,antler:true}},
  cabra:    {label:'Cabra',    fam:'pre', coat:'cabra',    tail:{len:.09,r:.04,shape:'pompón',  rest:[[30,0,0],[0,0,0],[0,0,0]]}},
  caballo:  {label:'Caballo',  fam:'pre', head:'cabra', legs:'caballo', hide:[3], coat:'caballo', tail:{len:.75,r:.075,shape:'crin', rest:[[-10,0,0],[-12,0,0],[-6,0,0]]}},
  dragon:   {label:'Dragón',   fam:'rep', coat:'dragon',   tail:{len:1.1,r:.12,shape:'reptil',  rest:[[-6,0,0],[4,0,0],[8,0,0]]}, horns:{h:.42,r:.05,out:18,back:55}}
};
// the tail a body has: its species' unless changed in the panel (shape, length and thickness as factors, or none)
const TAIL_SHAPES = [['fina', 'Fina'], ['tupida', 'Tupida'], ['gruesa', 'Gruesa'], ['penacho', 'Con penacho'], ['pompón', 'Pompón'], ['reptil', 'De reptil'], ['crin', 'De crin'], ['no', 'Sin cola']];
function tailOf(b) {
  const sp = SPECIES[b && b.species], t = sp && sp.tail, o = (b && b.tail) || {};
  if (!t || o.shape === 'no') return null;
  return {...t, shape: o.shape || t.shape, len: t.len * (o.len ?? 1), r: t.r * (o.r ?? 1), rest: t.rest};
}
// the species a body's head (eyes, mouth) comes from: a head picked from another species makes a hybrid
const headSp = b => { if (!b || b.species === 'humano') return 'humano'; const h = b.headModel && typeof HEAD_CATALOG !== 'undefined' && HEAD_CATALOG[b.headModel];
  return h ? h.species[0] : (SPECIES[b.species] && SPECIES[b.species].head) || b.species; };
// …and its legs: always the body's own species
const legSp = b => (b && SPECIES[b.species] && (SPECIES[b.species].legs || SPECIES[b.species].head)) || (b && b.species);
tLabels(SPECIES);

/* ---------- hands ---------- */
const GESTURES = {
  relajada:{label:'Relajada', c:[.25,.18,.26,.32,.4], s:.2},
  abierta: {label:'Abierta',  c:[0,0,0,0,0], s:1},
  plana:   {label:'Plana',    c:[.05,0,0,0,0], s:0},
  puno:    {label:'Puño',     c:[.8,1,1,1,1], s:0},
  senalar: {label:'Señalar',  c:[.75,0,1,1,1], s:0},
  paz:     {label:'Paz',      c:[.85,0,0,1,1], s:.9},
  agarre:  {label:'Agarre',   c:[.45,.55,.6,.62,.66], s:0},
  pinza:   {label:'Pinza',    c:[.6,.55,.3,.25,.2], s:.3},
  garra:   {label:'Garra',    c:[.35,.55,.55,.55,.55], s:.8},
  ok:      {label:'OK',       c:[.45,.62,.05,0,0], s:.5, t:.75},
  pulgar:  {label:'Pulgar arriba', c:[0,1,1,1,1], s:0, t:0},
  pistola: {label:'Pistola',  c:[0,0,1,1,1], s:.15},
  cuernos: {label:'Cuernos',  c:[.8,0,1,1,0], s:.7, t:.6},
  telefono:{label:'Teléfono@gesto', c:[0,1,1,1,0], s:1},
  tres:    {label:'Tres',     c:[.8,0,0,0,1], s:.6, t:.6},
  lapiz:   {label:'Sujetar lápiz', c:[.5,.42,.5,.78,.85], s:.1, t:.55},
  copa:    {label:'Copa',     c:[.3,.35,.38,.4,.42], s:.15, t:.4},
  tension: {label:'Tensa',    c:[.15,.28,.32,.36,.42], s:1}
};
tLabels(GESTURES);
/* human facial expressions: MakeHuman expression units (FACS-like), weights 0..1, see tools/makehuman/build_ext.py */
const FACE_EXPR = {
  neutra:    {label:'Neutra', u:{}},
  sonrisa:   {label:'Sonrisa', u:{'mouth-corner-puller':1.15, 'mouth-upward-retraction':.15, 'eye-left-slit':.35, 'eye-right-slit':.35}},
  risa:      {label:'Risa', u:{'mouth-corner-puller':1, 'mouth-open':.55, 'mouth-upward-retraction':.35, 'eye-left-slit':.6, 'eye-right-slit':.6}},
  triste:    {label:'Triste', u:{'eyebrows-left-inner-up':1, 'eyebrows-right-inner-up':1, 'mouth-depression':.8, 'eye-left-slit':.2, 'eye-right-slit':.2}},
  enfado:    {label:'Enfado', u:{'eyebrows-left-down':1.4, 'eyebrows-right-down':1.4, 'mouth-compression':.9, 'mouth-depression':.3, 'nose-left-elevation':.6, 'nose-right-elevation':.6, 'eye-left-slit':.45, 'eye-right-slit':.45, 'neck-platysma':.3}},
  sorpresa:  {label:'Sorpresa', u:{'eyebrows-left-up':1, 'eyebrows-right-up':1, 'eye-left-opened-up':1, 'eye-right-opened-up':1, 'mouth-open':.6}},
  miedo:     {label:'Miedo', u:{'eyebrows-left-inner-up':.8, 'eyebrows-right-inner-up':.8, 'eyebrows-left-up':.5, 'eyebrows-right-up':.5, 'eye-left-opened-up':.9, 'eye-right-opened-up':.9, 'mouth-part-later':.7, 'mouth-open':.25, 'neck-platysma':.5}},
  asco:      {label:'Asco', u:{'mouth-elevation':.8, 'nose-left-elevation':.9, 'nose-right-elevation':.9, 'eyebrows-left-down':.5, 'eyebrows-right-down':.5, 'eye-left-slit':.35, 'eye-right-slit':.35}},
  grito:     {label:'Grito', u:{'mouth-open':1, 'eyebrows-left-down':.8, 'eyebrows-right-down':.8, 'eye-left-slit':.35, 'eye-right-slit':.35, 'neck-platysma':.6}},
  concentrado:{label:'Concentrado', u:{'eyebrows-left-down':.45, 'eyebrows-right-down':.45, 'mouth-compression':.35, 'eye-left-slit':.3, 'eye-right-slit':.3}},
  guino:     {label:'Guiño', u:{'eye-left-closure':1, 'mouth-corner-puller':.6, 'eyebrows-left-down':.3}},
  morros:    {label:'Morros', u:{'mouth-pursing':1, 'mouth-protusion':.4}},
  dormido:   {label:'Ojos cerrados', u:{'eye-left-closure':1, 'eye-right-closure':1}}
};
tLabels(FACE_EXPR);
const FINGER_NAMES = ['Pulgar','Índice','Corazón','Anular','Meñique'].map(s => tr(s));
function gest(id) { const g = GESTURES[id] || GESTURES.relajada; return {c: [...g.c], s: g.s, t: g.t || 0}; }

/* ---------- light, look, scene ---------- */
const LIGHTS = {
  estudio:  {label:'Estudio',    az:35,  el:40, key:.95, fill:.42, rim:.25, soft:4},
  rembrandt:{label:'Rembrandt',  az:50,  el:48, key:1.15,fill:.2,  rim:0,   soft:2},
  lateral:  {label:'Lateral',    az:90,  el:8,  key:1.15,fill:.16, rim:0,   soft:2},
  contraluz:{label:'Contraluz',  az:165, el:28, key:1.1, fill:.3,  rim:.3,  soft:3},
  cenital:  {label:'Cenital',    az:0,   el:86, key:1.15,fill:.2,  rim:0,   soft:2},
  abajo:    {label:'Desde abajo',az:10,  el:-30,key:1.05,fill:.18, rim:0,   soft:2},
  nublado:  {label:'Nublado',    az:20,  el:60, key:.35, fill:.8,  rim:.15, soft:9},
  noir:     {label:'Cine negro', az:-70, el:20, key:1.3, fill:.06, rim:.5,  soft:1.5}
};
tLabels(LIGHTS);
const STYLES = {construccion:'Construcción', contorno:'Solo línea', volumen:'Volumen', lapiz:'Lápiz', valores:'Valores', silueta:'Silueta'};
const LINE_MODES = {anillos:'Anillos', malla:'Anillos y meridianos', ninguna:'Sin líneas'};
tValues(STYLES); tValues(LINE_MODES);
const ENVS = {estudio:'Estudio', habitacion:'Habitación', calle:'Calle', bosque:'Bosque', ring:'Ring', cafeteria:'Cafetería',
  ruinas:'Ruinas', escalinata:'Escalinata', azotea:'Azotea', dojo:'Dojo', playa:'Playa', vacio:'Vacío'};
tValues(ENVS);
// time of day: sky, fog, hemisphere and key tint; practical = how bright set lamps glow
const AMBIENTS = {
  dia:      {label:'Día',            top:0x9fb8d6, hor:0xe8e4d8, fog:0xe4e0d4, hemiS:0xfff6e8, hemiG:0x7d7262, fill:1, key:1, keyCol:0xfff1dc, practical:.15},
  atardecer:{label:'Atardecer',      top:0x6b6fa6, hor:0xf2b27a, fog:0xd9a37f, hemiS:0xffd7b0, hemiG:0x5d4a52, fill:.8, key:.95, keyCol:0xffb46b, practical:.6},
  noche:    {label:'Noche',          top:0x0b1020, hor:0x1d2640, fog:0x141b2b, hemiS:0x4a5a8a, hemiG:0x101118, fill:.3, key:.14, keyCol:0x8fa6ff, practical:1},
  interior: {label:'Interior cálido',top:0x4a3b30, hor:0x8a6c55, fog:0x6e5646, hemiS:0xffe2c0, hemiG:0x4a3a2e, fill:.75, key:.6, keyCol:0xffd2a0, practical:1.1},
  neutro:   {label:'Estudio neutro', top:0xd9d4c8, hor:0xebe5d6, fog:0xebe4d4, hemiS:0xffffff, hemiG:0x8a8273, fill:1, key:1, keyCol:0xffffff, practical:.3}
};
tLabels(AMBIENTS);
const PROPS = {
  cubo:'Cubo', caja:'Caja', cilindro:'Cilindro', esfera:'Esfera', silla:'Silla', mesa:'Mesa', banco:'Banco', taburete:'Taburete',
  escalon:'Escalón', pared:'Pared', barril:'Barril', espada:'Espada', baston:'Bastón', balon:'Balón', farola:'Farola', arbol:'Árbol', roca:'Roca', puerta:'Puerta'
};
tValues(PROPS);
const LIGHT_COLORS = {calida:['Cálida',0xffc98a], neutra:['Neutra',0xfff6ea], fria:['Fría',0xaecdff], roja:['Roja',0xff5a4a], azul:['Azul',0x4a7dff], verde:['Verde',0x58e07a], magenta:['Magenta',0xff4fd8]};
const VIEWS = [['Frontal',0,4],['Tres cuartos',38,10],['Perfil',90,3],['Espalda',180,6],['Picado',30,48],['Contrapicado',25,-14],['Cenital',0,86]];
for (const c of Object.values(LIGHT_COLORS)) c[0] = tr(c[0]);
for (const v of VIEWS) v[0] = tr(v[0]);
const LENSES = [14,24,35,50,85,135,200];
const pctFmt = v => Math.round(v * 100) + '%';
