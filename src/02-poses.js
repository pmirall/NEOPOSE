/* ---------- pose library ----------
   Euler degrees [x, y, z, order?]. The figure faces +Z and its left side is +X.
   shoulder: x- raises forward, z+ (left) / z- (right) raises sideways; 'ZXY' order twists the arm first.
   elbow x- bends, knee x+ bends, hip x- lifts the thigh, ankle x+ points the toes, spine x+ bends forward.
   ik: hand/foot targets on the body, offsets in metres in the figure's own frame (x left, y up, z forward). */
const swapSide = n => n.endsWith('L') ? n.slice(0, -1) + 'R' : n.endsWith('R') ? n.slice(0, -1) + 'L' : n;
const mirrorRot = e => e.seq ? {seq: e.seq.map(([a, d]) => [a, a === 'x' ? d : -d])} : [e[0], -(e[1] || 0), -(e[2] || 0), e[3]];
// left-side joints → adds the mirrored right side (unless given)
const sym = j => { const o = {...j}; for (const [n, e] of Object.entries(j)) if (n.endsWith('L') && !(swapSide(n) in j)) o[swapSide(n)] = mirrorRot(e); return o; };
const ikSym = (e, t, o) => [{e: e, t, o}, {e: swapSide(e), t: t.endsWith('L') || t.endsWith('R') ? swapSide(t) : t, o: [-o[0], o[1], o[2]]}];
const LEGS_STAND = {hipL:[0,0,3], hipR:[0,0,-3]};
const ARMS_DOWN = {shoulderL:[0,0,7], elbowL:[-12], shoulderR:[0,0,-7], elbowR:[-12]};
const HANDS_HIP = {j: sym({shoulderL:[0,-90,38,'ZXY'], elbowL:[-100]}), ik: ikSym('handL', 'hips', [.17, .1, .0])};
const ARMS_CROSSED = {j: {shoulderL:[-25,-60,8,'ZXY'], elbowL:[-115], shoulderR:[-25,60,-8,'ZXY'], elbowR:[-110]},
  ik: [{e:'handL', t:'chest', o:[-.13,.08,.2]}, {e:'handR', t:'chest', o:[.13,.12,.23]}]};
const GUARD_ARMS = {shoulderL:[-55,0,22], elbowL:[-120], shoulderR:[-30,0,-28], elbowR:[-135]};
const SIT = sym({hipL:[-90,0,7], kneeL:[92], ankleL:[-2]});

// search words: the name in both languages plus words for its category, so 'jump', 'salto' or 'saltar' all find it
const both = s => s + ' ' + Object.values(I18N).map(D => D[s] || '').join(' ');
const CAT_WORDS = {pie: 'de pie parado erguido standing stand upright', mov: 'movimiento moverse dinámico movement motion moving dynamic',
  accion: 'acción pelea lucha combate action fight fighting combat', suelo: 'suelo sentado sentarse tumbado floor ground sit sitting lying',
  deporte: 'deporte baile gimnasio yoga sport dance gym exercise', grupo: 'grupo pareja group couple'};
const P = (id, label, cat, j, extra = {}) => ({id, label: tr(label), find: both(label) + ' ' + CAT_WORDS[cat], cat, j, ...extra});
const POSES = [
  // De pie
  P('pie', 'De pie', 'pie', {...ARMS_DOWN, ...LEGS_STAND}),
  P('contra', 'Contrapposto', 'pie', {hips:[0,8,-5], waist:[0,-4,4], chest:[0,-6,5], neck:[0,10,-3], head:[3,8,-4],
    hipR:[0,0,7], hipL:[-8,0,2], kneeL:[18], ankleL:[-6], shoulderL:[-4,0,10], elbowL:[-18], shoulderR:[8,0,-11], elbowR:[-8]}),
  P('mirar', 'Mirar atrás', 'pie', {waist:[0,18,0], chest:[0,24,0], neck:[0,25,0], head:[-4,25,-6],
    hipL:[-10,0,4], kneeL:[12], hipR:[4,0,-3], shoulderL:[8,0,8], elbowL:[-20], shoulderR:[-12,0,-12], elbowR:[-35]}),
  P('brazos', 'Brazos cruzados', 'pie', {...ARMS_CROSSED.j, head:[-4,0,0], hipL:[-4,0,5], kneeL:[8], hipR:[0,0,-4]}, {ik: ARMS_CROSSED.ik}),
  P('jarra', 'Manos en la cintura', 'pie', {...HANDS_HIP.j, hipL:[0,0,7], hipR:[0,0,-7], head:[-3,0,0]}, {ik: HANDS_HIP.ik}),
  P('espalda', 'Manos a la espalda', 'pie', {...sym({shoulderL:[18,-90,10,'ZXY'], elbowL:[-80]}), chest:[-4,0,0], ...LEGS_STAND},
    {ik: [{e:'handL', t:'hips', o:[.04,.02,-.17]}, {e:'handR', t:'hips', o:[-.04,.04,-.17]}]}),
  P('bolsillos', 'Manos en los bolsillos', 'pie', {...sym({shoulderL:[4,0,10], elbowL:[-25]}), hips:[0,0,-3], hipL:[-6,0,3], kneeL:[10], hipR:[0,0,-2]},
    {ik: ikSym('handL', 'hips', [.16, -.07, .05])}),
  P('cruzadas', 'Piernas cruzadas', 'pie', {...ARMS_CROSSED.j, hipL:[-4,0,-9], kneeL:[8], ankleL:[12], hipR:[0,0,-2], chest:[-3,0,-3], head:[0,8,4]}, {ik: ARMS_CROSSED.ik}),
  P('timido', 'Tímido', 'pie', {neck:[10,0,0], head:[20,10,0], ...sym({shoulderL:[-15,-40,4,'ZXY'], elbowL:[-40]}), hipL:[-5,0,-5], kneeL:[15], hipR:[0,0,-2]},
    {ik: [{e:'handL', t:'hips', o:[.03,-.1,.17]}, {e:'handR', t:'hips', o:[-.03,-.1,.17]}]}),
  P('cansado', 'Cansado', 'pie', {hips:[30,0,0], waist:[15,0,0], chest:[15,0,0], neck:[-20,0,0], head:[-15,0,0],
    ...sym({hipL:[-32,0,8], kneeL:[34], ankleL:[-8], shoulderL:[-50,0,10], elbowL:[-10]})}, {ik: ikSym('handL', 'kneeL', [0, .07, .07])}),
  P('sorpresa', 'Sorprendido', 'pie', {hips:[-4,0,0], chest:[-8,0,0], head:[-8,0,0], ...sym({shoulderL:[-40,-30,30,'ZXY'], elbowL:[-120]}),
    hipL:[-8,0,3], kneeL:[10], hipR:[0,0,-3]}, {hands:{L:'abierta', R:'abierta'}, ik: ikSym('handL', 'head', [.13, 0, .12])}),
  P('telefono', 'Al teléfono', 'pie', {hips:[0,8,-5], chest:[0,-6,5], hipR:[0,0,7], hipL:[-8,0,2], kneeL:[18],
    shoulderR:[-20,40,-30,'ZXY'], elbowR:[-140], shoulderL:[0,0,8], elbowL:[-15], head:[5,-10,6]}, {hands:{R:'agarre'}, ik: [{e:'handR', t:'head', o:[-.1,.02,.02]}]}),
  P('pensativo', 'Pensativo', 'pie', {shoulderR:[-20,40,-20,'ZXY'], elbowR:[-140], shoulderL:[-20,-60,8,'ZXY'], elbowL:[-100], head:[5,0,-5], hipL:[-5,0,3], kneeL:[8], hipR:[0,0,-3]},
    {hands:{R:'senalar'}, ik: [{e:'handR', t:'head', o:[-.03,-.13,.09]}, {e:'handL', t:'elbowR', o:[0,0,.05]}]}),
  P('victoria', 'Victoria', 'pie', {chest:[-8,0,0], head:[-15,0,0], ...sym({shoulderL:[-10,0,145], elbowL:[-15]}), hipL:[0,0,9], hipR:[0,0,-9]}, {hands:{L:'puno', R:'puno'}}),
  P('heroe', 'Pose heroica', 'pie', {...HANDS_HIP.j, chest:[-5,0,0], head:[-5,15,0], hipL:[0,0,14], hipR:[0,0,-14]}, {hands:{L:'puno', R:'puno'}, ik: HANDS_HIP.ik}),
  P('saludo', 'Saludar', 'pie', {shoulderR:[0,-90,-100,'ZXY'], elbowR:[-75], shoulderL:[0,0,8], elbowL:[-15], head:[0,-8,0], hips:[0,0,-4], hipL:[-8,0,2], kneeL:[14], hipR:[0,0,5]}, {hands:{R:'abierta'}}),
  P('militar', 'Saludo militar', 'pie', {shoulderR:[-10,-60,-80,'ZXY'], elbowR:[-130], shoulderL:[0,0,4], elbowL:[-5], hipL:[0,0,1], hipR:[0,0,-1], head:[-3,0,0]},
    {hands:{R:'plana', L:'plana'}, ik: [{e:'handR', t:'head', o:[-.08,.09,.11]}]}),
  P('reverencia', 'Reverencia', 'pie', {waist:[25,0,0], chest:[25,0,0], neck:[5,0,0], head:[10,0,0], ...sym({shoulderL:[-12,0,6], elbowL:[-10]}), ...LEGS_STAND}),
  P('encoger', 'Encogerse de hombros', 'pie', {...sym({shoulderL:[-5,-90,28,'ZXY'], elbowL:[-90]}), head:[0,0,12], hipL:[-6,0,3], kneeL:[10], hipR:[0,0,-3]}, {hands:{L:'abierta', R:'abierta'}}),
  P('taparse', 'Taparse la cara', 'pie', {chest:[15,0,0], neck:[10,0,0], head:[20,0,0], ...sym({shoulderL:[-45,-40,12,'ZXY'], elbowL:[-130]}), hipL:[-6,0,-3], kneeL:[14], hipR:[0,0,-2]},
    {hands:{L:'plana', R:'plana'}, ik: ikSym('handL', 'head', [.05, .06, .14])}),
  P('senalar', 'Señalar', 'pie', {chest:[0,-8,0], neck:[0,-6,0], head:[0,-12,0], shoulderR:[-88,8,-6], elbowR:[-4], shoulderL:[0,0,7], elbowL:[-12], hipL:[-6,0,4], kneeL:[8], hipR:[0,0,-3]}, {hands:{R:'senalar'}}),
  P('estirarse', 'Estirarse', 'pie', {waist:[-4,0,0], chest:[-10,0,0], neck:[-6,0,0], head:[-18,0,0], ...sym({shoulderL:[-5,0,172], elbowL:[-8]})}, {hands:{L:'abierta', R:'abierta'}}),
  P('hombro', 'Mirar por encima del hombro', 'pie', {hips:[0,-12,0], waist:[0,-12,0], chest:[0,-18,0], neck:[0,-22,0], head:[-6,-32,4], hipL:[-6,0,4], kneeL:[10], hipR:[0,0,-3], ...ARMS_DOWN}),
  P('nuca', 'Manos en la nuca', 'pie', {...sym({shoulderL:[-20,0,125], elbowL:[-140]}), chest:[-4,0,0], head:[-6,0,0], hipL:[-5,0,5], kneeL:[8], hipR:[0,0,-5]},
    {ik: ikSym('handL', 'head', [.05, .02, -.09])}),
  P('esperar', 'Esperando', 'pie', {hips:[0,6,-5], waist:[0,-3,3], chest:[0,-4,4], head:[4,8,-3], hipR:[0,0,7], hipL:[-6,0,2], kneeL:[14], ankleL:[-5], ...sym({shoulderL:[-12,-30,8,'ZXY'], elbowL:[-30]})},
    {ik: [{e:'handL', t:'hips', o:[.02,-.08,.16]}, {e:'handR', t:'hips', o:[-.03,-.1,.16]}]}),
  P('reloj', 'Mirar el reloj', 'pie', {shoulderL:[-45,-50,15,'ZXY'], elbowL:[-110], head:[22,12,0], neck:[10,0,0], shoulderR:[0,0,-7], elbowR:[-12], ...LEGS_STAND}),
  P('selfie', 'Selfi', 'pie', {shoulderR:[-115,0,-30], elbowR:[-12], shoulderL:[0,0,8], elbowL:[-20], head:[-6,-16,-8], chest:[0,-6,0], hips:[0,0,-3], hipL:[-8,0,2], kneeL:[14], hipR:[0,0,5]}, {hands:{R:'agarre', L:'paz'}}),
  P('enfadado', 'Enfadado', 'pie', {chest:[8,0,0], neck:[6,0,0], head:[8,0,0], ...sym({shoulderL:[6,0,16], elbowL:[-38], hipL:[0,0,6]})}, {hands:{L:'puno', R:'puno'}}),
  P('mochila', 'Con mochila', 'pie', {...sym({shoulderL:[-20,-40,6,'ZXY'], elbowL:[-110]}), head:[-3,0,0], hipL:[-4,0,4], kneeL:[6], hipR:[0,0,-4]},
    {hands:{L:'agarre', R:'agarre'}, ik: ikSym('handL', 'chest', [.1, .1, .12])}),
  P('puntillas', 'De puntillas', 'pie', {chest:[-5,0,0], head:[-8,0,0], ...sym({hipL:[0,0,3], ankleL:[42], shoulderL:[-8,0,22], elbowL:[-15]})}, {hands:{L:'abierta', R:'abierta'}}),
  // Movimiento
  P('caminar', 'Caminar', 'mov', {hips:[0,-5,0], waist:[0,4,0], chest:[0,6,0], head:[0,-4,0], hipL:[-24,0,2], kneeL:[8], ankleL:[-12], hipR:[16,0,-2], kneeR:[22], ankleR:[14],
    shoulderL:[20,0,6], elbowL:[-14], shoulderR:[-24,0,-6], elbowR:[-28]}),
  P('correr', 'Correr', 'mov', {hips:[10,-10,0], waist:[5,8,0], chest:[4,10,0], neck:[-8,-4,0], head:[-6,-4,0], hipL:[-65,0,4], kneeL:[85], ankleL:[-5],
    hipR:[22,0,-4], kneeR:[65], ankleR:[35], shoulderL:[48,0,12], elbowL:[-95], shoulderR:[-55,0,-12], elbowR:[-90]}, {hands:{L:'agarre', R:'agarre'}}),
  P('salto', 'Salto', 'mov', {chest:[-8,0,0], head:[-12,0,0], ...sym({hipL:[-10,0,25], kneeL:[30], ankleL:[30], shoulderL:[-10,0,150], elbowL:[-10]})}, {lift:.28, hands:{L:'abierta', R:'abierta'}}),
  P('saltolargo', 'Salto de longitud', 'mov', {hips:[15,0,0], hipL:[-80,0,4], kneeL:[60], hipR:[-55,0,-4], kneeR:[95], ankleR:[30], ...sym({shoulderL:[-120,0,12], elbowL:[-10]}), head:[-15,0,0]}, {lift:.4}),
  P('sprint', 'Salida de sprint', 'mov', {hips:[70,0,0], neck:[-40,0,0], head:[-30,0,0], hipL:[-135,0,6], kneeL:[115], ankleL:[-20], hipR:[-50,0,-4], kneeR:[100], ankleR:[30],
    ...sym({shoulderL:[-70,0,8], elbowL:[0]})}, {hands:{L:'abierta', R:'abierta'}}),
  P('caer', 'Tropezar', 'mov', {hips:[30,0,10], chest:[10,20,0], head:[-20,0,0], shoulderL:[-80,0,40], elbowL:[-20], shoulderR:[-60,0,-60], elbowR:[-30],
    hipL:[-60,0,0], kneeL:[40], hipR:[30,0,0], kneeR:[60]}, {hands:{L:'abierta', R:'abierta'}}),
  P('esquivar', 'Esquivar', 'mov', {hips:[-20,0,0], waist:[-10,0,0], chest:[-12,0,0], head:[12,0,0], ...sym({hipL:[-32,0,7], kneeL:[70], ankleL:[-18], shoulderL:[0,0,70], elbowL:[-20]})}, {hands:{L:'abierta', R:'abierta'}}),
  P('subir', 'Subir un escalón', 'mov', {chest:[10,0,0], hipL:[-55,0,2], kneeL:[80], ankleL:[-15], hipR:[10,0,-2], kneeR:[5], ankleR:[10], shoulderL:[20,0,6], elbowL:[-10], shoulderR:[-25,0,-6], elbowR:[-30]}),
  P('gatas', 'A gatas', 'mov', {hips:[90,0,0], neck:[-30,0,0], head:[-30,0,0], ...sym({hipL:[-90,0,4], kneeL:[90], shoulderL:[-90,0,5], elbowL:[0]})}, {hands:{L:'plana', R:'plana'}}),
  P('escalar', 'Escalar', 'mov', {head:[-25,0,0], shoulderL:[-170,0,10], elbowL:[-20], shoulderR:[-120,0,-10], elbowR:[-60], hipL:[-80,0,6], kneeL:[100], hipR:[0,0,-3], kneeR:[10], ankleR:[40]}, {hands:{L:'agarre', R:'agarre'}}),
  P('trotar', 'Trotar', 'mov', {hips:[5,-6,0], chest:[2,6,0], head:[-4,-4,0], hipL:[-40,0,3], kneeL:[60], ankleL:[-5], hipR:[15,0,-3], kneeR:[50], ankleR:[25],
    shoulderL:[30,0,10], elbowL:[-85], shoulderR:[-35,0,-10], elbowR:[-85]}, {hands:{L:'relajada', R:'relajada'}}),
  P('patinar', 'Patinar', 'mov', {hips:[35,15,0], chest:[5,-10,0], head:[-25,0,0], hipL:[-60,0,4], kneeL:[65], ankleL:[-20], hipR:[25,0,-30], kneeR:[5], ankleR:[20],
    shoulderL:[30,0,15], elbowL:[-20], shoulderR:[-40,0,-25], elbowR:[-25]}, {hands:{L:'relajada', R:'relajada'}}),
  P('valla', 'Saltar una valla', 'mov', {hips:[30,0,0], chest:[10,0,0], head:[-25,0,0], hipL:[-95,0,4], kneeL:[8], ankleL:[-10], hipR:[10,0,-45], kneeR:[100], ankleR:[20],
    shoulderR:[-80,0,-5], elbowR:[-15], shoulderL:[30,0,20], elbowL:[-40]}, {lift:.35, hands:{L:'abierta', R:'abierta'}}),
  P('cubrirse', 'Agacharse y cubrirse', 'mov', {hips:[40,0,0], waist:[15,0,0], chest:[20,0,0], neck:[10,0,0], head:[15,0,0], ...sym({hipL:[-120,0,12], kneeL:[130], ankleL:[-30], shoulderL:[-140,0,20], elbowL:[-120]})},
    {ik: ikSym('handL', 'head', [.06, .08, .02])}),
  // Acción
  P('guardia', 'Guardia', 'accion', {hips:[0,-30,0], waist:[0,10,0], chest:[8,10,0], neck:[0,8,0], head:[10,6,0], hipL:[-18,0,6], kneeL:[22], ankleL:[-5], hipR:[12,0,-10], kneeR:[25], ankleR:[8], ...GUARD_ARMS}, {hands:{L:'puno', R:'puno'}}),
  P('jab', 'Puñetazo', 'accion', {hips:[0,-30,0], waist:[0,6,0], chest:[5,-6,0], head:[10,8,0], hipL:[-20,0,6], kneeL:[22], hipR:[12,0,-10], kneeR:[22], ankleR:[10],
    shoulderL:[-88,0,6], elbowL:[-6], shoulderR:[-30,0,-28], elbowR:[-135]}, {hands:{L:'puno', R:'puno'}}),
  P('cross', 'Directo', 'accion', {hips:[0,-12,0], waist:[0,18,0], chest:[5,25,0], head:[8,-20,0], hipL:[-22,0,6], kneeL:[25], hipR:[15,0,-8], kneeR:[15], ankleR:[25],
    shoulderR:[-88,0,-4], elbowR:[-5], shoulderL:[-55,0,22], elbowL:[-120]}, {hands:{L:'puno', R:'puno'}}),
  P('patada', 'Patada frontal', 'accion', {chest:[-15,0,0], hipL:[-95,0,2], kneeL:[10], ankleL:[-10], hipR:[0,0,-2], kneeR:[10], ...GUARD_ARMS}, {hands:{L:'puno', R:'puno'}}),
  P('patadalat', 'Patada lateral', 'accion', {chest:[0,0,25], head:[0,0,-15], hipL:[0,0,85], kneeL:[5], hipR:[0,0,-4], kneeR:[12], ...GUARD_ARMS}, {hands:{L:'puno', R:'puno'}}),
  P('bloqueo', 'Bloqueo alto', 'accion', {hips:[0,-20,0], shoulderL:[-60,0,40], elbowL:[-100], shoulderR:[-30,0,-28], elbowR:[-130], hipL:[-15,0,6], kneeL:[20], hipR:[10,0,-8], kneeR:[18], head:[8,0,0]}, {hands:{L:'puno', R:'puno'}}),
  P('espada', 'Espada en alto', 'accion', {chest:[-5,0,0], ...sym({shoulderL:[-150,0,5], elbowL:[-30]}), hipL:[-20,0,8], kneeL:[20], hipR:[10,0,-8], kneeR:[15]},
    {hands:{L:'agarre', R:'agarre'}, ik: [{e:'handL', t:'head', o:[.02,.27,.04]}, {e:'handR', t:'head', o:[-.02,.24,.04]}]}),
  P('estocada', 'Estocada', 'accion', {hips:[10,-20,0], hipL:[-70,0,5], kneeL:[70], ankleL:[-5], hipR:[30,0,-5], kneeR:[0], ankleR:[20],
    shoulderL:[-85,0,10], elbowL:[0], shoulderR:[30,0,-50], elbowR:[-60], head:[-5,15,0]}, {hands:{L:'agarre'}}),
  P('arco', 'Tensar un arco', 'accion', {hips:[0,-70,0], chest:[0,-10,0], head:[0,70,0], shoulderL:[-10,0,88], elbowL:[0], shoulderR:[0,-90,-85,'ZXY'], elbowR:[-145],
    hipL:[0,0,14], hipR:[0,0,-14]}, {hands:{L:'agarre', R:'pinza'}}),
  P('lanzar', 'Lanzar', 'accion', {hips:[0,20,0], chest:[-5,25,0], shoulderR:[30,-90,-95,'ZXY'], elbowR:[-90], shoulderL:[-60,0,20], elbowL:[-20], hipL:[-30,0,4], kneeL:[10], hipR:[15,0,-4], kneeR:[20]}, {hands:{R:'agarre', L:'abierta'}}),
  P('empujar', 'Empujar', 'accion', {hips:[25,0,0], head:[-25,0,0], ...sym({shoulderL:[-80,0,10], elbowL:[-30]}), hipL:[-55,0,4], kneeL:[50], ankleL:[-10], hipR:[-5,0,-4], kneeR:[5], ankleR:[25]}, {hands:{L:'abierta', R:'abierta'}}),
  P('tirar', 'Tirar de una cuerda', 'accion', {hips:[-20,0,0], head:[15,0,0], hipL:[-50,0,4], kneeL:[50], ankleL:[-25], hipR:[-20,0,-4], kneeR:[40], ankleR:[-15],
    shoulderL:[-70,0,5], elbowL:[-30], shoulderR:[-60,0,-5], elbowR:[-40]}, {hands:{L:'agarre', R:'agarre'}}),
  P('levantar', 'Levantar una caja', 'accion', {hips:[35,0,0], waist:[10,0,0], head:[-25,0,0], ...sym({hipL:[-110,0,15], kneeL:[110], ankleL:[-30], shoulderL:[-60,0,15], elbowL:[-20]})}, {hands:{L:'agarre', R:'agarre'}}),
  P('cargar', 'Cargar al hombro', 'accion', {chest:[0,0,-6], shoulderR:[-10,-60,-100,'ZXY'], elbowR:[-120], shoulderL:[0,0,10], elbowL:[-15], hipL:[-6,0,3], kneeL:[12], hipR:[0,0,-3]},
    {hands:{R:'agarre'}, ik: [{e:'handR', t:'head', o:[-.19,.05,0]}]}),
  P('recoger', 'Recoger del suelo', 'accion', {waist:[20,0,0], chest:[20,0,0], hipL:[-100,0,5], kneeL:[110], ankleL:[-15], hipR:[-10,0,-4], kneeR:[115], ankleR:[50],
    shoulderR:[-70,0,-5], elbowR:[-5], shoulderL:[-30,0,10], elbowL:[-60]}, {hands:{R:'pinza'}}),
  P('apuntar', 'Apuntar con pistola', 'accion', {hips:[0,-10,0], chest:[3,8,0], head:[6,4,0], shoulderR:[-88,0,14], elbowR:[-4], shoulderL:[-80,0,-18], elbowL:[-20],
    hipL:[-12,0,8], kneeL:[14], hipR:[8,0,-8], kneeR:[10]}, {hands:{R:'pistola', L:'agarre'}}),
  P('gancho', 'Gancho', 'accion', {hips:[0,15,0], waist:[5,12,0], chest:[10,18,0], head:[12,-10,0], shoulderR:[-55,0,-12], elbowR:[-115], shoulderL:[-45,0,28], elbowL:[-125],
    hipL:[-25,0,8], kneeL:[35], hipR:[10,0,-10], kneeR:[30]}, {hands:{L:'puno', R:'puno'}}),
  P('hechizo', 'Lanzar un hechizo', 'accion', {hips:[0,-15,0], chest:[-4,10,0], head:[-4,10,0], ...sym({shoulderL:[-82,0,12], elbowL:[-12]}), hipL:[-25,0,10], kneeL:[30], hipR:[12,0,-12], kneeR:[10]},
    {hands:{L:'tension', R:'tension'}}),
  P('herido', 'Herido', 'accion', {chest:[22,0,8], neck:[5,0,0], head:[12,0,-6], shoulderR:[-30,-40,-10,'ZXY'], elbowR:[-100], shoulderL:[-10,0,25], elbowL:[-25],
    hipL:[-25,0,6], kneeL:[35], hipR:[0,0,-6], kneeR:[22]}, {hands:{R:'plana', L:'abierta'}, ik: [{e:'handR', t:'waist', o:[-.05,.02,.14]}]}),
  P('escudo', 'Cubrirse con escudo', 'accion', {hips:[0,-25,0], chest:[5,10,0], head:[8,10,0], shoulderL:[-75,0,22], elbowL:[-95], shoulderR:[-20,0,-35], elbowR:[-80],
    hipL:[-22,0,8], kneeL:[30], ankleL:[-6], hipR:[14,0,-10], kneeR:[22], ankleR:[10]}, {hands:{L:'agarre', R:'agarre'}}),
  // Sentado y en el suelo
  P('sentado', 'Sentado', 'suelo', {...SIT, waist:[-4,0,0], chest:[6,0,0], head:[6,0,0], ...sym({shoulderL:[-22,0,10], elbowL:[-55]})}, {stool:true}),
  P('pensador', 'El pensador', 'suelo', {...SIT, waist:[10,0,0], chest:[25,0,0], head:[10,0,0], shoulderR:[-35,0,-5], elbowR:[-140], shoulderL:[-40,0,10], elbowL:[-60]},
    {stool:true, hands:{R:'puno'}, ik: [{e:'handR', t:'head', o:[-.02,-.12,.08]}]}),
  P('silla_cruzada', 'Sentado, piernas cruzadas', 'suelo', {hipL:[-105,0,-20], kneeL:[95], ankleL:[20], hipR:[-90,0,-5], kneeR:[90], waist:[-4,0,0], ...sym({shoulderL:[-22,0,10], elbowL:[-60]})}, {stool:true}),
  P('recostado', 'Sentado recostado', 'suelo', {waist:[-15,0,0], chest:[-10,0,0], head:[10,0,0], ...sym({hipL:[-70,0,10], kneeL:[30], shoulderL:[30,0,25], elbowL:[-20]})}, {stool:true}),
  P('codos', 'Codos en las rodillas', 'suelo', {...SIT, waist:[10,0,0], chest:[25,0,0], head:[-5,0,0], ...sym({shoulderL:[-40,0,10], elbowL:[-100]})},
    {stool:true, ik: [{e:'handL', t:'kneeL', o:[-.11,.05,.13]}, {e:'handR', t:'kneeR', o:[.11,.07,.13]}]}),
  P('rodilla', 'Rodilla en tierra', 'suelo', {chest:[5,0,0], head:[5,0,0], hipL:[-88,0,6], kneeL:[90], hipR:[8,0,-4], kneeR:[100], shoulderL:[-30,0,12], elbowL:[-70], shoulderR:[5,0,-8], elbowR:[-15]}),
  P('derodillas', 'De rodillas', 'suelo', {...sym({hipL:[0,0,4], kneeL:[90], ankleL:[40], shoulderL:[0,0,8], elbowL:[-15]}), head:[5,0,0]}),
  P('rezar', 'Rezar', 'suelo', {...sym({hipL:[0,0,4], kneeL:[90], ankleL:[40], shoulderL:[-30,-50,10,'ZXY'], elbowL:[-110]}), head:[15,0,0]},
    {hands:{L:'plana', R:'plana'}, ik: [{e:'handL', t:'chest', o:[.025,.14,.2]}, {e:'handR', t:'chest', o:[-.025,.14,.2]}]}),
  P('agachado', 'En cuclillas', 'suelo', {hips:[25,0,0], waist:[10,0,0], chest:[12,0,0], neck:[-15,0,0], head:[-12,0,0],
    ...sym({hipL:[-130,0,15], kneeL:[140], ankleL:[-35], shoulderL:[-40,0,12], elbowL:[-50]})}),
  P('indio', 'Piernas cruzadas en el suelo', 'suelo', {...sym({hipL:{seq:[['y',90],['x',-82],['y',38]]}, kneeL:[132], ankleL:[-10], shoulderL:[-20,0,10], elbowL:[-40]}), chest:[5,0,0]},
    {ik: ikSym('handL', 'kneeL', [0, .06, .02])}),
  P('abrazar', 'Abrazando las rodillas', 'suelo', {waist:[20,0,0], chest:[15,0,0], head:[10,0,0], ...sym({hipL:[-120,0,5], kneeL:[150], ankleL:[-20], shoulderL:[-50,-40,10,'ZXY'], elbowL:[-80]})},
    {ik: [{e:'handL', t:'kneeR', o:[.02,-.12,.09]}, {e:'handR', t:'kneeL', o:[-.02,-.1,.09]}]}),
  P('suelo', 'Sentado en el suelo', 'suelo', {waist:[-10,0,0], head:[5,0,0], ...sym({hipL:[-90,0,6], kneeL:[5], shoulderL:[30,0,20], elbowL:[0]})}, {hands:{L:'plana', R:'plana'}}),
  P('tumbado', 'Tumbado', 'suelo', {hips:[-90,0,0], head:[-10,0,0], hipL:[-10,0,8], kneeL:[20], hipR:[0,0,-6], shoulderL:[0,0,40], elbowL:[-30], shoulderR:[0,0,-20], elbowR:[-60]}),
  P('lado', 'Tumbado de lado', 'suelo', {hips:[0,0,90], head:[0,0,-30], shoulderR:[-80,0,-10], elbowR:[-90], shoulderL:[-20,0,10], elbowL:[-30], hipL:[-30,0,0], kneeL:[40], hipR:[-10,0,0], kneeR:[20]}),
  P('bocabajo', 'Boca abajo', 'suelo', {hips:[90,0,0], neck:[-20,0,0], head:[-30,0,0], ...sym({shoulderL:[-100,0,30], elbowL:[-120]})}),
  P('plancha', 'Plancha', 'suelo', {hips:[75,0,0], head:[-20,0,0], ...sym({hipL:[0,0,2], shoulderL:[-75,0,8], elbowL:[0]})}, {hands:{L:'plana', R:'plana'}}),
  P('leer', 'Leyendo sentado', 'suelo', {...SIT, chest:[10,0,0], neck:[10,0,0], head:[22,0,0], ...sym({shoulderL:[-40,-35,10,'ZXY'], elbowL:[-105]})},
    {stool:true, hands:{L:'agarre', R:'agarre'}, ik: ikSym('handL', 'chest', [.07, -.12, .3])}),
  P('tobillo', 'Sentado, tobillo sobre la rodilla', 'suelo', {hipL:{seq:[['y',50],['x',-90]]}, kneeL:[100], ankleL:[10], hipR:[-90,0,-6], kneeR:[90], waist:[-6,0,0], chest:[-4,0,0],
    shoulderL:[-25,0,12], elbowL:[-50], shoulderR:[10,0,-25], elbowR:[-20]}, {stool:true}),
  P('nucasuelo', 'Tumbado, manos en la nuca', 'suelo', {hips:[-90,0,0], head:[-20,0,0], hipL:[-35,0,4], kneeL:[70], hipR:[0,0,-4], ...sym({shoulderL:[-10,0,150], elbowL:[-140]})},
    {ik: ikSym('handL', 'head', [.06, .02, -.08])}),
  P('meditar', 'Meditación', 'suelo', {...sym({hipL:{seq:[['y',90],['x',-82],['y',38]]}, kneeL:[132], ankleL:[-10], shoulderL:[-12,0,14], elbowL:[-30]}), chest:[-3,0,0], head:[-3,0,0]},
    {hands:{L:'pinza', R:'pinza'}, ik: ikSym('handL', 'kneeL', [.02, .07, .0])}),
  // Deporte y baile
  P('arbol', 'Yoga: árbol', 'deporte', {...sym({shoulderL:[0,0,170], elbowL:[-20]}), hipR:[-40,0,-55], kneeR:[125], hipL:[0,0,2]},
    {hands:{L:'plana', R:'plana'}, ik: [{e:'handL', t:'head', o:[.02,.33,0]}, {e:'handR', t:'head', o:[-.02,.33,0]}, {e:'footR', t:'kneeL', o:[-.07,-.04,0]}]}),
  P('zancada', 'Zancada', 'deporte', {hips:[8,0,0], hipL:[-80,0,5], kneeL:[80], hipR:[40,0,-5], kneeR:[12], ankleR:[20], ...sym({shoulderL:[-170,0,8], elbowL:[-5]}), head:[-10,0,0]},
    {hands:{L:'plana', R:'plana'}, ik: [{e:'footL', t:'hips', o:[.1,-.66,.5]}, {e:'footR', t:'hips', o:[-.1,-.6,-.62]}]}),
  P('puntas', 'Tocarse las puntas', 'deporte', {hips:[85,0,0], neck:[10,0,0], ...sym({hipL:[-85,0,3], shoulderL:[-85,0,4], elbowL:[0]})}, {hands:{L:'plana', R:'plana'}}),
  P('arabesco', 'Arabesco', 'deporte', {hips:[20,0,0], hipR:[45,0,-4], kneeR:[0], ankleR:[40], hipL:[-20,0,2], shoulderL:[-80,0,30], elbowL:[-5], shoulderR:[-20,0,-90], elbowR:[-5], head:[-15,0,0]}, {hands:{L:'abierta', R:'abierta'}}),
  P('disco', 'Baile disco', 'deporte', {hips:[0,0,8], shoulderR:[0,0,-150], elbowR:[-5], shoulderL:[-10,0,40], elbowL:[-10], hipR:[-10,0,-15], kneeR:[25], hipL:[0,0,4], head:[-10,-20,0]}, {hands:{R:'senalar'}}),
  P('tiro', 'Tiro a canasta', 'deporte', {...sym({shoulderL:[-150,0,10], elbowL:[-70]}), head:[-20,0,0], ...sym({hipL:[-20,0,4], kneeL:[30], ankleL:[40]})}, {lift:.15, hands:{L:'abierta', R:'abierta'}}),
  P('chutar', 'Chutar', 'deporte', {chest:[-10,15,0], hipR:[-70,0,-4], kneeR:[20], ankleR:[30], hipL:[0,0,4], kneeL:[25], shoulderL:[-30,0,50], elbowL:[-20], shoulderR:[30,0,-30], elbowR:[-20]}),
  P('flexion', 'Estiramiento lateral', 'deporte', {chest:[0,0,-25], waist:[0,0,-12], shoulderL:[0,0,165], elbowL:[-15], shoulderR:[0,0,-15], elbowR:[-30], hipL:[0,0,8], hipR:[0,0,-8]}, {hands:{L:'plana'}}),
  P('sentadilla', 'Sentadilla', 'deporte', {hips:[35,0,0], waist:[-5,0,0], chest:[-5,0,0], head:[-20,0,0], ...sym({hipL:[-100,0,14], kneeL:[105], ankleL:[-25], shoulderL:[-88,0,5], elbowL:[0]})}, {hands:{L:'plana', R:'plana'}}),
  P('flexiones', 'Flexiones', 'deporte', {hips:[86,0,0], head:[-20,0,0], ...sym({hipL:[0,0,2], shoulderL:[-25,0,42], elbowL:[-90]})}, {hands:{L:'plana', R:'plana'}}),
  P('golf', 'Golf', 'deporte', {hips:[28,0,0], chest:[5,-35,0], head:[15,30,0], shoulderL:[-55,0,-28], elbowL:[-4], shoulderR:[-62,0,20], elbowR:[-18], ...sym({hipL:[-18,0,6], kneeL:[22], ankleL:[-6]})},
    {hands:{L:'agarre', R:'agarre'}}),
  P('tenis', 'Tenis', 'deporte', {hips:[5,-45,0], chest:[5,-25,0], head:[5,45,0], shoulderR:[-25,0,-75], elbowR:[-25], shoulderL:[-60,0,25], elbowL:[-40],
    hipL:[-30,0,10], kneeL:[40], ankleL:[-8], hipR:[15,0,-14], kneeR:[30], ankleR:[15]}, {hands:{R:'agarre', L:'abierta'}}),
  P('ballet', 'Ballet: brazos en corona', 'deporte', {chest:[-4,0,0], head:[-8,10,0], ...sym({shoulderL:[-15,0,160], elbowL:[-55]}), hipR:[-45,0,-50], kneeR:[110], ankleR:[30], hipL:[0,0,2], ankleL:[40]},
    {lift:.06, hands:{L:'relajada', R:'relajada'}, ik: [{e:'footR', t:'kneeL', o:[-.05,-.02,.02]}]})
];
const POSE = Object.fromEntries(POSES.map(p => [p.id, p]));
const POSE_CATS = tValues({todas:'Todas', pie:'De pie', mov:'Movimiento', accion:'Acción', suelo:'Sentado y suelo', deporte:'Deporte y baile'});

/* ---------- group poses ----------
   chars: [{p: pose id, x, z, yaw (deg)}]; ik: [{c, e, tc, t, o}] → hand of char c to joint t of char tc (offset in tc's frame),
   or {c, e, pt:[x,y,z]} to a point of the scene. Built from templates so every cast size has 50+ entries. */
const GROUP_POSES = {2: [], 3: [], 4: []};
function addGroup(n, id, label, chars, ik = [], cat = 'grupo', find = '') { GROUP_POSES[n].push({id: `g${n}-${id}`, label, find: find + ' ' + CAT_WORDS.grupo, n, chars, ik, cat}); }
// two people: [label, A pose, B pose, layout, ik]
const face = (dist, ang = 0) => [{x: -dist / 2, z: 0, yaw: 90 - ang}, {x: dist / 2, z: 0, yaw: -90 + ang}];
const DUOS = [
  ['conversa', 'Conversación', 'contra', 'brazos', face(1.1, 25)],
  ['conversa2', 'Conversación animada', 'encoger', 'pensativo', face(1.1, 25)],
  ['saludo', 'Saludo a distancia', 'saludo', 'saludo', face(2.2, 20)],
  ['apreton', 'Apretón de manos', 'pie', 'pie', face(.95, 0), [{c:0, e:'handR', pt:[0,.95,0]}, {c:1, e:'handR', pt:[0,.96,0]}]],
  ['chocar', 'Choca esos cinco', 'pie', 'pie', face(.85, 0), [{c:0, e:'handR', pt:[0,1.72,.0]}, {c:1, e:'handL', pt:[0,1.72,.0]}]],
  ['abrazo', 'Abrazo', 'pie', 'pie', face(.36, 0), [{c:0, e:'handR', tc:1, t:'chest', o:[.13,.15,-.13]}, {c:0, e:'handL', tc:1, t:'chest', o:[-.13,.12,-.13]},
    {c:1, e:'handR', tc:0, t:'waist', o:[.14,0,-.12]}, {c:1, e:'handL', tc:0, t:'waist', o:[-.14,0,-.12]}]],
  ['hombro', 'Mano en el hombro', 'contra', 'pie', [{x:-.34, z:0, yaw:10}, {x:.34, z:0, yaw:-10}], [{c:0, e:'handL', tc:1, t:'shoulderR', o:[0,.05,-.02]}]],
  ['pelea', 'Pelea', 'guardia', 'guardia', face(1.4, 0)],
  ['golpe', 'Golpe y esquiva', 'jab', 'esquivar', face(1.15, 0)],
  ['patada', 'Patada y bloqueo', 'patada', 'bloqueo', face(1.5, 0)],
  ['espadas', 'Duelo de espadas', 'espada', 'estocada', face(1.8, 0)],
  ['discusion', 'Discusión', 'senalar', 'jarra', face(1.2, 15)],
  ['caminar', 'Caminar juntos', 'caminar', 'caminar', [{x:-.35, z:0, yaw:15}, {x:.35, z:.05, yaw:15}]],
  ['carrera', 'Carrera', 'correr', 'correr', [{x:-.5, z:.4, yaw:90}, {x:.3, z:-.4, yaw:90}]],
  ['banco', 'Sentados juntos', 'sentado', 'codos', [{x:-.32, z:0, yaw:12}, {x:.32, z:0, yaw:-12}]],
  ['explica', 'Explicar a alguien sentado', 'senalar', 'sentado', face(1.3, 30)],
  ['espaldas', 'Espalda con espalda', 'brazos', 'brazos', [{x:-.22, z:0, yaw:-90}, {x:.22, z:0, yaw:90}]],
  ['levantar', 'Ayudar a levantarse', 'recoger', 'rodilla', face(1.25, 0), [{c:0, e:'handR', tc:1, t:'shoulderR', o:[-.05,.1,.3]}, {c:1, e:'handR', tc:1, t:'shoulderR', o:[-.05,.1,.3]}]],
  ['cuerda', 'Tira y afloja', 'tirar', 'tirar', face(2.2, 0)],
  ['pase', 'Pase de balón', 'lanzar', 'tiro', face(3, 10)],
  ['reverencia', 'Reverencia mutua', 'reverencia', 'reverencia', face(1.3, 0)],
  ['foto', 'Foto de pareja', 'victoria', 'heroe', [{x:-.4, z:0, yaw:8}, {x:.4, z:0, yaw:-8}]],
  ['consolar', 'Consolar', 'taparse', 'pie', [{x:-.3, z:0, yaw:20}, {x:.32, z:-.05, yaw:-40}], [{c:1, e:'handR', tc:0, t:'shoulderL', o:[.02,.05,-.02]}]],
  ['amenaza', 'Amenaza', 'guardia', 'timido', face(1.2, 10)],
  ['charla_suelo', 'Charla en el suelo', 'indio', 'suelo', face(1.2, 35)],
  ['entrenador', 'Entrenador y alumno', 'plancha', 'jarra', [{x:-.3, z:.2, yaw:90}, {x:.7, z:-.3, yaw:-60}]],
  ['baile', 'Baile en pareja', 'pie', 'pie', face(.45, 0), [{c:0, e:'handL', tc:1, t:'chest', o:[-.14,.05,-.08]}, {c:1, e:'handR', tc:0, t:'shoulderL', o:[0,.04,0]},
    {c:0, e:'handR', pt:[0,1.3,.32]}, {c:1, e:'handL', pt:[0,1.3,.34]}]]
];
for (const [id, label, a, b, lay, ik] of DUOS) {
  addGroup(2, id, tr(label), [{p:a, ...lay[0]}, {p:b, ...lay[1]}], ik || [], 'grupo', both(label));
  // second version: roles swapped and the whole layout turned 35° so it reads at an angle
  const r = 35 * DEG, rot = (x, z) => ({x: x * Math.cos(r) + z * Math.sin(r), z: -x * Math.sin(r) + z * Math.cos(r)});
  addGroup(2, id + '-b', tr(label) + ' · ' + tr('en diagonal'), [{p:b, ...rot(lay[0].x, lay[0].z), yaw:lay[0].yaw + 35}, {p:a, ...rot(lay[1].x, lay[1].z), yaw:lay[1].yaw + 35}],
    (ik || []).map(k => ({...k, c: 1 - k.c, tc: k.tc === undefined ? undefined : 1 - k.tc, pt: k.pt && [rot(k.pt[0], k.pt[2]).x, k.pt[1], rot(k.pt[0], k.pt[2]).z]})), 'grupo', both(label) + ' diagonal');
}
// three and four people: formation × activity
const THEMES = [
  ['charla', 'Charla', ['contra', 'brazos', 'jarra', 'pensativo'], 'centro'],
  ['foto', 'Foto de grupo', ['victoria', 'heroe', 'saludo', 'brazos'], 'camara'],
  ['pelea', 'Pelea', ['guardia', 'jab', 'patada', 'bloqueo'], 'centro'],
  ['baile', 'Baile', ['disco', 'arabesco', 'saludo', 'victoria'], 'camara'],
  ['calentar', 'Calentamiento', ['zancada', 'puntas', 'estirarse', 'arbol'], 'camara'],
  ['descanso', 'Descanso', ['suelo', 'indio', 'abrazar', 'tumbado'], 'centro'],
  ['heroes', 'Equipo de héroes', ['heroe', 'guardia', 'espada', 'jarra'], 'camara'],
  ['sorpresa', 'Sorpresa', ['sorpresa', 'taparse', 'senalar', 'timido'], 'camara'],
  ['marcha', 'En marcha', ['caminar', 'caminar', 'caminar', 'caminar'], 'lado'],
  ['carrera', 'Carrera', ['correr', 'correr', 'sprint', 'correr'], 'lado'],
  ['ceremonia', 'Ceremonia', ['rezar', 'derodillas', 'reverencia', 'militar'], 'centro'],
  ['combate', 'Entrenamiento de combate', ['jab', 'cross', 'patadalat', 'bloqueo'], 'camara'],
  ['mudanza', 'Mudanza', ['levantar', 'cargar', 'empujar', 'recoger'], 'libre'],
  ['espera', 'Esperando', ['bolsillos', 'telefono', 'cruzadas', 'mirar'], 'libre']
];
const FORMATIONS = [
  ['linea', 'en línea', n => Array.from({length: n}, (_, i) => ({x: (i - (n - 1) / 2) * .85, z: 0}))],
  ['arco', 'en arco', n => Array.from({length: n}, (_, i) => { const a = (i - (n - 1) / 2) * .55; return {x: Math.sin(a) * 1.4, z: -Math.cos(a) * 1.4 + 1.4}; })],
  ['circulo', 'en corro', n => Array.from({length: n}, (_, i) => { const a = i / n * Math.PI * 2 + Math.PI / n; return {x: Math.sin(a) * .9, z: Math.cos(a) * .9}; })],
  ['uve', 'en uve', n => Array.from({length: n}, (_, i) => { const k = i === 0 ? 0 : Math.ceil(i / 2) * (i % 2 ? 1 : -1); return {x: k * .8, z: -Math.abs(k) * .6}; })],
  ['diagonal', 'en diagonal', n => Array.from({length: n}, (_, i) => ({x: (i - (n - 1) / 2) * .8, z: (i - (n - 1) / 2) * -.7}))]
];
for (const n of [3, 4]) {
  let k = 0;
  for (const [tid, tlabel, poses, facing] of THEMES) for (const [fid, flabel, fn] of FORMATIONS) {
    if (facing === 'lado' && fid === 'circulo') continue;
    const pts = fn(n), cx = pts.reduce((s, p) => s + p.x, 0) / n, cz = pts.reduce((s, p) => s + p.z, 0) / n;
    const chars = pts.map((pt, i) => {
      let yaw = 0;
      if (facing === 'centro') yaw = Math.atan2(cx - pt.x, cz - pt.z) / DEG;
      else if (facing === 'camara') yaw = clamp((cx - pt.x) * 18, -30, 30);
      else if (facing === 'lado') yaw = 90;
      else yaw = ((i * 73 + k * 31) % 120) - 60;
      // pelea: everyone faces the first fighter, who faces the group
      if (tid === 'pelea' && i > 0) yaw = Math.atan2(pts[0].x - pt.x, pts[0].z - pt.z) / DEG;
      return {p: poses[(i + k) % poses.length], x: pt.x, z: pt.z, yaw};
    });
    if (tid === 'pelea') chars[0].yaw = Math.atan2(cx - pts[0].x, cz - pts[0].z) / DEG;
    addGroup(n, `${tid}-${fid}`, `${tr(tlabel)} ${tr(flabel)}`, chars, [], 'grupo', both(tlabel) + ' ' + both(flabel));
    k++;
  }
  // hand on the next person's shoulder, all in a row
  const row = Array.from({length: n}, (_, i) => ({p: 'contra', x: (i - (n - 1) / 2) * .62, z: 0, yaw: 0}));
  addGroup(n, 'hombros', tr('Hombro con hombro'), row, row.slice(0, -1).map((_, i) => ({c: i, e: 'handL', tc: i + 1, t: 'shoulderR', o: [0, .05, -.02]})), 'grupo', both('Hombro con hombro'));
}
