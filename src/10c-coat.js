/* ======================= coats: fur colours and markings =======================
   What tells a coyote from a wolf, a snow leopard from a house cat or a red panda from a fox in a drawing is mostly the
   coat, and a 3D model is the one place where a marking can be seen from every side (where the sock ends, how the mask
   wraps round the eyes, which way the stripes run on a leg). Researched patterns, in the order they are laid down:
     countershading (lighter belly and throat, and muzzle and cheeks: most mammals), dorsal stripe (coyotes, wolves, skunks),
     stripes (tigers, tabby cats), spots (hyenas, cheetahs, fawns), rosettes (leopards, snow leopards), socks and gloves
     (foxes, red pandas, pandas, Siamese points), the mask (raccoons, pandas), ear tips (foxes, lynx-eared cats),
     the tail's tip (foxes, wolves) and rings (raccoons, red pandas, lemurs), and leather for the nose and paw pads.
   Every vertex of the body, the sculpted head and the tail carries where it is (belly, how far down a limb, along an
   ear or the tail, the back line, the mask band); with its rest position the shader paints the coat from those, so the
   markings are sharp at any zoom and follow the pose. The body has no vertex attribute left to spare (WebGL allows 16
   and muscles, skinning and lines use them), so this rides in aEye, which only the eyes' vertices use: there w = 1;
   elsewhere w = −(1 + kind + f), f = .5 ± .45 × (back line or mask): the middle of the fraction is “neither”, so what the
   triangles interpolate between equal values can never slip into the next kind or turn into a mask. Three colours per coat (base, light, dark) plus leather. */
const COAT_MARKS = [
  ['belly', 'Vientre'], ['muzzle', 'Hocico y mejillas'], ['socks', 'Calcetines'], ['mask', 'Antifaz'], ['ears', 'Puntas de las orejas'], ['tail', 'Punta de la cola'],
  ['dorsal', 'Raya del lomo'], ['stripes', 'Rayas'], ['spots', 'Manchas'], ['rosettes', 'Rosetas'], ['rings', 'Anillos en la cola']
];
const COAT_ORDER = COAT_MARKS.map(m => m[0]);
// c: base, light, dark; m: mark → 1 light, 2 dark (absent: off); sock: how far up the socks go (0 hip … 1 toes); tip: how much of the tail is its tip
const COATS = {
  lobo:      {label: 'Lobo gris', for: ['lobo', 'coyote', 'perro'], c: ['#8b8680', '#ebe6dc', '#3a3632'], m: {belly: 1, dorsal: 2, ears: 2, tail: 2}, le: '#2a2422'},
  lobo_bl:   {label: 'Lobo ártico', for: ['lobo', 'perro'], c: ['#e6e3dc', '#f8f6f1', '#b4ada2'], m: {belly: 1}, le: '#2a2422'},
  lobo_ng:   {label: 'Lobo negro', for: ['lobo', 'perro'], c: ['#33302d', '#5a544e', '#1b1918'], m: {belly: 1}, le: '#1e1a19'},
  coyote:    {label: 'Coyote', for: ['coyote', 'lobo'], c: ['#a8865f', '#efe4cf', '#3d3125'], m: {belly: 1, dorsal: 2, tail: 2, ears: 2}, le: '#2a2422'},
  perro:     {label: 'Husky', for: ['perro', 'lobo'], c: ['#5e6166', '#f3f0ea', '#2a2a2d'], m: {belly: 1, socks: 1, dorsal: 2}, sock: .74, le: '#252223'},
  pastor:    {label: 'Pastor alemán', for: ['perro'], c: ['#b57c43', '#dcb47e', '#2b2420'], m: {dorsal: 2, mask: 2, tail: 2}, le: '#221d1b'},
  dalmata:   {label: 'Dálmata', for: ['perro'], c: ['#f4f1ea', '#f8f6f1', '#232120'], m: {spots: 2}, le: '#2a2422'},
  labrador:  {label: 'Labrador', for: ['perro'], c: ['#d6a862', '#ecd29c', '#8a6230'], m: {belly: 1}, le: '#4a3426'},
  zorro:     {label: 'Zorro rojo', for: ['zorro'], c: ['#c9652b', '#f5eee3', '#2a1f1a'], m: {belly: 1, socks: 2, ears: 2, tail: 1}, sock: .68, le: '#231c19'},
  zorro_ar:  {label: 'Zorro ártico', for: ['zorro'], c: ['#ebe9e3', '#fbfaf6', '#3a3836'], m: {belly: 1}, le: '#2a2624'},
  zorro_pl:  {label: 'Zorro plateado', for: ['zorro'], c: ['#3b3836', '#8e8a85', '#1e1c1b'], m: {belly: 2, muzzle: 0, tail: 1}, le: '#1e1a19'},
  hiena:     {label: 'Hiena manchada', for: ['hiena'], c: ['#b59b73', '#dccaa9', '#3a2e24'], m: {spots: 2, tail: 2, mask: 2}, le: '#2a221d'},
  gato:      {label: 'Atigrado', for: ['gato'], c: ['#b98b5b', '#efe2cc', '#5a3e27'], m: {belly: 1, stripes: 2, rings: 2}, le: '#c98b86'},
  gato_ng:   {label: 'Negro', for: ['gato'], c: ['#2a2725', '#3e3a37', '#151413'], m: {}, le: '#2a2422'},
  siames:    {label: 'Siamés', for: ['gato'], c: ['#ece0cc', '#f7f0e4', '#4b3a2e'], m: {socks: 2, ears: 2, mask: 2, tail: 2}, sock: .8, tip: .7, le: '#4b3a2e'},
  esmoquin:  {label: 'Blanco y negro', for: ['gato'], c: ['#262321', '#f2efe9', '#151413'], m: {belly: 1, socks: 1}, sock: .82, le: '#c98b86'},
  tigre:     {label: 'Tigre de Bengala', for: ['tigre'], c: ['#d8822c', '#f6f0e5', '#1f1a17'], m: {belly: 1, stripes: 2, ears: 2, rings: 2}, le: '#c07a72'},
  tigre_bl:  {label: 'Tigre blanco', for: ['tigre'], c: ['#efe9df', '#fbf8f2', '#2b2724'], m: {belly: 1, stripes: 2, rings: 2}, le: '#c98b86'},
  leon:      {label: 'León', for: ['leon'], c: ['#c99b5f', '#ebd8b6', '#4a3524'], m: {belly: 1, ears: 2, tail: 2}, tip: .14, le: '#5a3a30'},
  leopardo:  {label: 'Leopardo de las nieves', for: ['leopardo'], c: ['#d6d2ca', '#f3f1ec', '#46433f'], m: {belly: 1, rosettes: 2, tail: 2}, tip: .12, le: '#c98b86'},
  leopardo2: {label: 'Leopardo', for: ['leopardo', 'gato'], c: ['#d9a85b', '#f4ead7', '#2a221a'], m: {belly: 1, rosettes: 2}, le: '#2a2422'},
  guepardo:  {label: 'Guepardo', for: ['leopardo', 'gato'], c: ['#dcb36f', '#f4ead8', '#241d16'], m: {belly: 1, spots: 2, rings: 2}, le: '#2a2422'},
  oso:       {label: 'Oso pardo', for: ['oso'], c: ['#6b4a32', '#8d674a', '#33241a'], m: {socks: 2}, sock: .7, le: '#211b18'},
  oso_po:    {label: 'Oso polar', for: ['oso'], c: ['#efeadf', '#f8f5ee', '#cfc6b4'], m: {}, le: '#1e1b1a'},
  panda_g:   {label: 'Panda gigante', for: ['oso'], c: ['#f3f1ec', '#f8f6f2', '#1e1c1b'], m: {socks: 2, ears: 2, mask: 2}, sock: .45, le: '#1e1c1b'},
  mapache:   {label: 'Mapache', for: ['mapache'], c: ['#8a8784', '#e8e5e0', '#2b2928'], m: {belly: 1, mask: 2, rings: 2, socks: 2, tail: 2}, sock: .86, tip: .12, le: '#2b2524'},
  panda:     {label: 'Panda rojo', for: ['panda'], c: ['#b4532a', '#f2e8d8', '#35201a'], m: {belly: 2, muzzle: 1, socks: 2, ears: 1, rings: 1, mask: 1}, sock: .5, le: '#251c19'},
  mofeta:    {label: 'Mofeta', for: ['mofeta'], c: ['#1f1d1c', '#f2efea', '#141312'], m: {dorsal: 1, tail: 1}, tip: .35, le: '#2a2422'},
  conejo:    {label: 'Conejo gris', for: ['conejo'], c: ['#9c9288', '#efe9df', '#5a524a'], m: {belly: 1, tail: 1, ears: 2}, tip: 1, le: '#c98b86'},
  conejo_bl: {label: 'Conejo blanco', for: ['conejo'], c: ['#f5f2ec', '#fbfaf7', '#d9d2c6'], m: {}, le: '#d19a96'},
  ciervo:    {label: 'Ciervo', for: ['ciervo', 'cabra'], c: ['#9b6b43', '#efe4d0', '#3a2a1e'], m: {belly: 1, tail: 1}, tip: 1, le: '#231d1a'},
  cervato:   {label: 'Cervatillo', for: ['ciervo'], c: ['#a8703f', '#f1e6d3', '#3a2a1e'], m: {belly: 1, spots: 1, tail: 1}, tip: 1, le: '#231d1a'},
  cabra:     {label: 'Cabra blanca', for: ['cabra'], c: ['#ebe5d9', '#f7f3ec', '#9d9282'], m: {}, le: '#3a302a'},
  cabra_pa:  {label: 'Cabra parda', for: ['cabra'], c: ['#7b5b3f', '#dccbb0', '#2c2119'], m: {belly: 1, dorsal: 2, socks: 2}, sock: .72, le: '#2a221d'},
  caballo:   {label: 'Castaño', for: ['caballo'], c: ['#7a4527', '#b3825a', '#1c1410'], m: {socks: 2, tail: 2}, sock: .7, tip: 1, le: '#2a2220'},
  alazan:    {label: 'Alazán', for: ['caballo'], c: ['#9a5228', '#c98e5e', '#5a2e16'], m: {tail: 1}, tip: 1, le: '#3a2a24'},
  tordo:     {label: 'Tordo', for: ['caballo'], c: ['#bdbab4', '#e9e7e2', '#4a4845'], m: {spots: 2, socks: 2, tail: 2}, sock: .8, tip: 1, le: '#2a2828'},
  dragon:    {label: 'Dragón verde', for: ['dragon'], c: ['#4f7a4a', '#d9cf9a', '#26391f'], m: {belly: 1, dorsal: 2}, le: '#2a2620'},
  dragon_r:  {label: 'Dragón rojo', for: ['dragon'], c: ['#a63b2a', '#e8ca90', '#4a1710'], m: {belly: 1, dorsal: 2}, le: '#2a1a16'},
  dragon_a:  {label: 'Dragón azul', for: ['dragon'], c: ['#3e5f8f', '#cad8e7', '#1c2a40'], m: {belly: 1, dorsal: 2, spots: 2}, le: '#1c2230'},
  dragon_n:  {label: 'Dragón negro', for: ['dragon'], c: ['#2b2a30', '#7a6a9a', '#141318'], m: {belly: 1}, le: '#141318'}
};
tLabels(COATS);
const tColor = h => new THREE.Color(h);
// the coat a body wears: its own (edited), none (null) or its species' default
function coatOf(b) {
  if (!b || b.species === 'humano' || b.coat === null) return null;
  if (b.coat && b.coat.c) return b.coat;
  const id = (b.coat && b.coat.preset) || (SPECIES[b.species] || {}).coat, p = COATS[id]; if (!p) return null;
  const m = {...p.m}; if (m.belly && m.muzzle === undefined) m.muzzle = m.belly;  // the muzzle is as light as the belly unless the animal says otherwise
  return {preset: id, c: p.c.slice(), m, sock: p.sock ?? .72, tip: p.tip ?? .25, le: p.le || '#2a2422'};
}
const coatPresetsFor = sp => Object.entries(COATS).filter(([, c]) => c.for.includes(sp));
// the shader's uniforms (one set per character, shared by all of its materials)
const makeFurU = () => ({uFurOn: {value: 0}, uFurK: {value: 1}, uNose: {value: new THREE.Vector4()}, uLipY: {value: 0}, uFurC0: {value: new THREE.Color()}, uFurC1: {value: new THREE.Color()}, uFurC2: {value: new THREE.Color()},
  uFurLe: {value: new THREE.Color()}, uFurM: {value: new Array(COAT_ORDER.length).fill(0)}, uSock: {value: .72}, uTailTip: {value: .25}});
const FUR_OFF = makeFurU();
function applyCoat(m) {
  const U = m.lib && m.lib.uFur; if (!U) return;
  const c = coatOf(m.body); U.uFurOn.value = c ? 1 : 0; U.uFurK.value = 1 / (m.size || 1); if (!c) return;
  U.uFurC0.value.set(c.c[0]); U.uFurC1.value.set(c.c[1]); U.uFurC2.value.set(c.c[2]); U.uFurLe.value.set(c.le || '#2a2422');
  U.uFurM.value = COAT_ORDER.map(k => c.m[k] || 0); U.uSock.value = c.sock ?? .72; U.uTailTip.value = c.tip ?? .25;
}
const FUR_GLSL = `
  uniform float uFurOn, uSock, uTailTip, uLipY; uniform vec3 uFurC0, uFurC1, uFurC2, uFurLe; uniform float uFurM[${COAT_ORDER.length}]; uniform vec4 uNose;
  varying vec3 vFurP;
  float fHash(vec3 p) { p = fract(p * .3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float fNoise(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(fHash(i), fHash(i + vec3(1, 0, 0)), f.x), mix(fHash(i + vec3(0, 1, 0)), fHash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(fHash(i + vec3(0, 0, 1)), fHash(i + vec3(1, 0, 1)), f.x), mix(fHash(i + vec3(0, 1, 1)), fHash(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
  vec2 fCell(vec3 x) { vec3 i = floor(x), f = fract(x); float d = 8.0, id = 0.0;
    for (int a = -1; a <= 1; a++) for (int b = -1; b <= 1; b++) for (int c = -1; c <= 1; c++) {
      vec3 g = vec3(float(a), float(b), float(c)), o = vec3(fHash(i + g), fHash(i + g + 19.1), fHash(i + g + 47.7)), r = g + o - f; float e = dot(r, r);
      if (e < d) { d = e; id = fHash(i + g + 7.3); } }
    return vec2(sqrt(d), id); }
  vec3 furSlot(float k, vec3 c) { return k > 1.5 ? uFurC2 : k > .5 ? uFurC1 : c; }
  // the skin's nose: the sphere round the snout's tip whose vertices the coat marks as leather (noseAt), cut per
  // pixel, a rounded shape where the coarse mesh's own patch of vertices was a star (or, on a sculpted head, a blot);
  // only on that patch and the triangles round it, where the kinds meet, and above the lips (vLip: a snout whose tip
  // is at the mouth, a dragon's, had its nose run down onto the jaw) (noseF: the sphere's edge one pixel soft)
  float noseF;
  float noseMask(float w) { return uNose.w > 0.0 && w > 2.55 && w < 4.0 && vLip >= 0.0 ? 1.0 - smoothstep(uNose.w - noseF, uNose.w + noseF, length(vFurP - uNose.xyz)) : 0.0; }
  vec3 furPaint(vec3 c0) {
    float w = -vEye.w; if (w < 1.5) return c0;
    float kind = floor(w) - 1.0, fr = fract(w) - .5, nose = 0.0;
    #ifdef SKIN
    // (round the nose the skin is fur, with no back line or mask, which the kinds' meeting read from the fraction)
    nose = noseMask(w); if (w > 2.55 && w < 4.0) { kind = 1.0; fr = 0.0; }
    #endif
    if (kind > 3.5) return vec3(.86, .81, .7);                  // horn and antler
    if (kind > 2.5) return mix(uFurLe, vec3(.32, .29, .26), .45); // claws and hooves
    if (kind > 1.5) return uFurLe;                               // nose and pads
    vec3 p = vFurP, c = uFurC0; float m, belly = max(vEye.x, 0.0), muz = max(-vEye.x, 0.0), dist = vEye.y, tip = vEye.z, dors = clamp(fr / .45, 0.0, 1.0), mask = clamp(-fr / .45, 0.0, 1.0);
    float onTail = step(1.5, tip), u = tip - 2.0, body = 1.0 - smoothstep(.3, .6, belly);
    m = uFurM[0]; if (m > .5) c = mix(c, furSlot(m, c), smoothstep(.35, .65, belly));
    m = uFurM[1]; if (m > .5) c = mix(c, furSlot(m, c), smoothstep(.35, .65, muz));
    m = uFurM[6]; if (m > .5) c = mix(c, furSlot(m, c), smoothstep(.35, .7, dors));
    m = uFurM[7]; if (m > .5) { float s = sin(p.y * 64.0 + fNoise(p * 7.0) * 5.0 + fNoise(p * 2.5) * 6.0); float w = smoothstep(.58, .76, s + (fNoise(p * 16.0) - .5) * .7);
      c = mix(c, furSlot(m, c), w * body * (1.0 - onTail)); }
    m = uFurM[8]; if (m > .5) { vec2 ce = fCell(p * 15.0); float r = .2 + .14 * ce.y; c = mix(c, furSlot(m, c), (1.0 - smoothstep(r - .05, r, ce.x)) * body); }
    m = uFurM[9]; if (m > .5) { vec2 ce = fCell(p * 14.0); float ring = smoothstep(.16, .22, ce.x) * (1.0 - smoothstep(.34, .42, ce.x)) * step(.28, fNoise(p * 46.0));
      float dot2 = 1.0 - smoothstep(.07, .11, fCell(p * 21.0 + 3.1).x); c = mix(c, furSlot(m, c), max(ring, dot2 * step(.6, ce.y)) * body); }
    m = uFurM[2]; if (m > .5) c = mix(c, furSlot(m, c), smoothstep(uSock - .025, uSock + .025, dist));
    m = uFurM[3]; if (m > .5) c = mix(c, furSlot(m, c), smoothstep(.3, .6, mask));
    m = uFurM[4]; if (m > .5) c = mix(c, furSlot(m, c), smoothstep(.55, .7, tip) * (1.0 - onTail));
    m = uFurM[10]; if (m > .5) c = mix(c, furSlot(m, c), onTail * smoothstep(.12, .2, u) * smoothstep(.42, .5, fract(u * 5.0 + .25)) * (1.0 - smoothstep(.92, .98, fract(u * 5.0 + .25))));
    m = uFurM[5]; if (m > .5) c = mix(c, furSlot(m, c), onTail * smoothstep(.97 - uTailTip, 1.03 - uTailTip, u));
    return mix(c, uFurLe, nose);
  }`;

/* ---------- the same coat on the CPU: vertex colours for the GLB ----------
   A line-for-line copy of furPaint() (the shader), so a model taken to Blender or a game engine wears the markings
   exactly as they are seen here. Colours out in linear light, as glTF wants them. */
const fract = x => x - Math.floor(x);  // smooth() is 03-figure.js's smoothstep
function fHashJS(x, y, z) { x = fract(x * .3183099 + .1) * 17; y = fract(y * .3183099 + .1) * 17; z = fract(z * .3183099 + .1) * 17; return fract(x * y * z * (x + y + z)); }
function fNoiseJS(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z); let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const h = (a, b, c) => fHashJS(ix + a, iy + b, iz + c), L = (a, b, t) => a + (b - a) * t;
  return L(L(L(h(0, 0, 0), h(1, 0, 0), fx), L(h(0, 1, 0), h(1, 1, 0), fx), fy), L(L(h(0, 0, 1), h(1, 0, 1), fx), L(h(0, 1, 1), h(1, 1, 1), fx), fy), fz);
}
function fCellJS(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz; let d = 8, id = 0;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
    const gx = ix + a, gy = iy + b, gz = iz + c, rx = a + fHashJS(gx, gy, gz) - fx, ry = b + fHashJS(gx + 19.1, gy + 19.1, gz + 19.1) - fy, rz = c + fHashJS(gx + 47.7, gy + 47.7, gz + 47.7) - fz, e = rx * rx + ry * ry + rz * rz;
    if (e < d) { d = e; id = fHashJS(gx + 7.3, gy + 7.3, gz + 7.3); } }
  return [Math.sqrt(d), id];
}
function furPaintJS(C, E, px, py, pz) {
  const w = -E[3]; if (w < 1.5) return null;
  const kind = Math.floor(w) - 1, fr = fract(w) - .5, mix = (c, d, t) => c.map((v, i) => v + (d[i] - v) * t), M = C.m, slot = (k, c) => k > 1.5 ? C.c2 : k > .5 ? C.c1 : c;
  if (kind > 3.5) return [.86, .81, .7]; if (kind > 2.5) return mix(C.le, [.32, .29, .26], .45); if (kind > 1.5) return C.le;
  let c = C.c0, m; const belly = Math.max(E[0], 0), muz = Math.max(-E[0], 0), dist = E[1], tip = E[2], dors = clamp(fr / .45, 0, 1), mask = clamp(-fr / .45, 0, 1);
  const onTail = tip >= 1.5 ? 1 : 0, u = tip - 2, body = 1 - smooth(.3, .6, belly);
  if ((m = M[0]) > .5) c = mix(c, slot(m, c), smooth(.35, .65, belly));
  if ((m = M[1]) > .5) c = mix(c, slot(m, c), smooth(.35, .65, muz));
  if ((m = M[6]) > .5) c = mix(c, slot(m, c), smooth(.35, .7, dors));
  if ((m = M[7]) > .5) { const s = Math.sin(py * 64 + fNoiseJS(px * 7, py * 7, pz * 7) * 5 + fNoiseJS(px * 2.5, py * 2.5, pz * 2.5) * 6), ww = smooth(.58, .76, s + (fNoiseJS(px * 16, py * 16, pz * 16) - .5) * .7); c = mix(c, slot(m, c), ww * body * (1 - onTail)); }
  if ((m = M[8]) > .5) { const ce = fCellJS(px * 15, py * 15, pz * 15), r = .2 + .14 * ce[1]; c = mix(c, slot(m, c), (1 - smooth(r - .05, r, ce[0])) * body); }
  if ((m = M[9]) > .5) { const ce = fCellJS(px * 14, py * 14, pz * 14), ring = smooth(.16, .22, ce[0]) * (1 - smooth(.34, .42, ce[0])) * (fNoiseJS(px * 46, py * 46, pz * 46) >= .28 ? 1 : 0);
    const dot2 = 1 - smooth(.07, .11, fCellJS(px * 21 + 3.1, py * 21 + 3.1, pz * 21 + 3.1)[0]); c = mix(c, slot(m, c), Math.max(ring, dot2 * (ce[1] >= .6 ? 1 : 0)) * body); }
  if ((m = M[2]) > .5) c = mix(c, slot(m, c), smooth(C.sock - .025, C.sock + .025, dist));
  if ((m = M[3]) > .5) c = mix(c, slot(m, c), smooth(.3, .6, mask));
  if ((m = M[4]) > .5) c = mix(c, slot(m, c), smooth(.55, .7, tip) * (1 - onTail));
  if ((m = M[10]) > .5) { const f = fract(u * 5 + .25); c = mix(c, slot(m, c), onTail * smooth(.12, .2, u) * smooth(.42, .5, f) * (1 - smooth(.92, .98, f))); }
  if ((m = M[5]) > .5) c = mix(c, slot(m, c), onTail * smooth(.97 - C.tip, 1.03 - C.tip, u));
  return c;
}
// per-vertex colours (linear RGB) of one of a character's meshes in its coat, or null
function coatColors(m, mesh) {
  const coat = coatOf(m.body), g = mesh.geometry, E = g.attributes.aEye; if (!coat || !E) return null;
  const lin = h => { const c = new THREE.Color(h); return [c.r, c.g, c.b].map(v => v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4)); };
  const C = {c0: lin(coat.c[0]), c1: lin(coat.c[1]), c2: lin(coat.c[2]), le: lin(coat.le || '#2a2422'), m: COAT_ORDER.map(k => coat.m[k] || 0), sock: coat.sock ?? .72, tip: coat.tip ?? .25};
  const P = g.attributes.position.array, n = P.length / 3, k = 1 / (m.size || 1), out = new Float32Array(n * 3), e = [0, 0, 0, 0], eyeW = lin('#f2efe9'), base = C.c0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < 4; j++) e[j] = E.array[i * 4 + j];
    const c = e[3] > .5 ? eyeW : furPaintJS(C, e, P[i * 3] * k, P[i * 3 + 1] * k, P[i * 3 + 2] * k) || base;
    out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2];
  }
  return out;
}

/* ---------- where every vertex is, for the coat ----------
   aEye of a vertex that is not an eye = (belly, how far down the limb, along an ear 0..1 or the tail 2..3, packed w).
   kind: 1 fur, 2 leather (nose, pads), 3 claw or hoof, 4 horn. Eyes and meshes without the attribute are left alone. */
function furPack(A, o, belly, dist, tip, kind, dm) { const f = .5 + clamp(dm, -1, 1) * .45; A[o] = belly; A[o + 1] = dist; A[o + 2] = tip; A[o + 3] = -(1 + kind + f); }
function furAttrsBody(m, P) {
  const nV = FIG.meta.nV, g = m.geo, A = g.attributes.aEye.array, N = g.attributes.normal.array, J = m.J, sz = m.size || 1;
  const jy = n => J[FIG.jIdx[n] * 3 + 1], reg = FIG.region, SI = g.attributes.skinIndex.array, SW = g.attributes.skinWeight.array, EL = FIG.meta.bones.length;
  noseAt(m, null);
  if (m.body.species === 'humano') return;
  // half width of the trunk by height, for the belly and the back line
  const NB = 64, top = m.top || 1.8, hw = new Float32Array(NB);
  const trunk = r => r === 'torso' || r === 'hips' || r === 'neck';
  for (let i = 0; i < nV; i++) if (trunk(reg[m.dom[i]])) { const k = clamp(Math.floor(P[i * 3 + 1] / top * NB), 0, NB - 1); hw[k] = Math.max(hw[k], Math.abs(P[i * 3])); }
  const crotch = jy('hipL') - .04 * sz, chin = m.anthro ? m.anthro.L.chin : jy('neck') + .08 * sz, an = m.anthro, L = an && an.L;
  const tipY = s => { let y = Infinity; for (let f = 0; f < 5; f++) y = Math.min(y, jy(`tip${s}${f}`)); return y; };
  const arm = {L: [jy('shoulderL'), tipY('L')], R: [jy('shoulderR'), tipY('R')]}, leg = {L: jy('hipL'), R: jy('hipR')};
  // ears of a MakeHuman-target head: skinned to the ear bones; measured from their base to their top
  const earTop = {L: -Infinity, R: -Infinity};
  const earW = i => { let w = 0, b = -1; for (let k = 0; k < 4; k++) if (SI[i * 4 + k] >= EL) { w += SW[i * 4 + k]; b = SI[i * 4 + k] - EL; } return [w, b]; };
  for (let i = 0; i < nV; i++) { const [w, b] = earW(i); if (w > .5) { const k = b === 0 ? 'L' : 'R'; earTop[k] = Math.max(earTop[k], P[i * 3 + 1]); } }
  for (let i = 0; i < nV; i++) {
    if (FIG.eye[i]) continue;
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], nz = N[i * 3 + 2], r = reg[m.dom[i]], o = i * 4;
    let belly = 0, dist = 0, tip = 0, kind = 1, dm = 0;
    if (trunk(r)) {
      const w = hw[clamp(Math.floor(y / top * NB), 0, NB - 1)] || .1, ax = Math.abs(x) / w, span = sstep(crotch - .02 * sz, crotch + .04 * sz, y) * (1 - sstep(chin + .02 * sz, chin + .06 * sz, y));
      belly = sstep(.15, .5, nz) * (1 - sstep(.45, .75, ax)) * span;
      dm = sstep(.2, .55, -nz) * (1 - sstep(.12, .3, ax)) * sstep(crotch, crotch + .08 * sz, y);
    } else if (/^(arm|hand)/.test(r)) { const s = r.slice(-1), a = arm[s]; dist = clamp((a[0] - y) / (a[0] - a[1]), 0, 1); }
    else if (/^(leg|foot)/.test(r)) { const s = r.slice(-1); dist = clamp((leg[s] - y) / leg[s], 0, 1); }
    else if (r === 'head' && L) {
      // a head made from MakeHuman targets: muzzle and cheeks below the eyes are the light part, the mask is the eye band
      const hh = L.hh, low = sstep(L.eyeY - .04 * hh, L.eyeY - .22 * hh, y), front = sstep(L.eyeZ - .32 * hh, L.eyeZ - .05 * hh, z);
      const bridge = (1 - sstep(.08 * hh, .15 * hh, Math.abs(x))) * sstep(an.mouthY - .01 * hh, an.mouthY + .05 * hh, y);
      const muz = low * front * (1 - bridge), thr = sstep(L.chin + .1 * hh, L.chin - .02 * hh, y) * sstep(-.1, .3, nz); belly = thr >= muz ? thr : -muz;
      dm = -(1 - sstep(.07 * hh, .15 * hh, Math.abs(y - L.eyeY))) * sstep(L.eyeZ - .35 * hh, L.eyeZ - .1 * hh, z) * (1 - sstep(L.eyeZ + .1 * hh, L.eyeZ + .25 * hh, z));
      const [w, b] = earW(i);
      if (w > .3 && an.earBase) { const k = b === 0 ? 'L' : 'R', eb = an.earBase[k]; if (eb && isFinite(earTop[k])) tip = clamp((y - eb.y) / (earTop[k] - eb.y), 0, 1) * sstep(.3, .6, w); }
      if (an.tip && Math.hypot(x - an.tip[0], y - an.tip[1], z - an.tip[2]) < .07 * hh) kind = 2;
    }
    furPack(A, o, belly, dist, tip, kind, dm);
  }
  if (an && an.tip) noseAt(m, an.tip, .07 * L.hh, an.mouthY);
  g.attributes.aEye.needsUpdate = true;
}
// the nose (see noseMask) and the mouth's level (the closed mouth's line in the flat styles), in the space vFurP is
// in (position / size); no tip, no nose
function noseAt(m, tip, r, lipY) { const U = m.lib && m.lib.uFur, k = 1 / (m.size || 1); if (!U) return;
  if (tip) U.uNose.value.set(tip[0] * k, tip[1] * k, tip[2] * k, r * k), U.uLipY.value = lipY * k; else U.uNose.value.set(0, 0, 0, 0); }
// the sculpted head: muzzle, cheeks and throat; the eye band; the ears from base to tip; the nose leather
function furAttrsHead(m, geo, hs) {
  const d = hs.d, n = d.n, Q = hs.Q, E = hs.E, s = hs.s, L = d.L, A = geo.attributes.aEye.array;
  const earTop = {L: -Infinity, R: -Infinity}, eb = hs.earBase || {};
  for (let i = 0; i < n; i++) if (d.ear[i] > 128) { const k = Q[i * 3] > 0 ? 'L' : 'R'; earTop[k] = Math.max(earTop[k], Q[i * 3 + 1]); }
  const tip = [E.x + s * L.tip[0], E.y + s * L.tip[1], E.z + s * L.tip[2] * (hs.kSn || 1)], chinY = E.y + s * L.chin;
  for (let i = 0; i < n; i++) {
    const o = i * 4; if (A[o + 3] > .5) continue;  // an eye
    const x = Q[i * 3], y = Q[i * 3 + 1], z = Q[i * 3 + 2];
    const low = sstep(E.y - .02 * s, E.y - .2 * s, y), front = sstep(E.z - .34 * s, E.z - .08 * s, z);
    const mouthY = E.y + s * L.mouthY, bridge = (1 - sstep(.07 * s, .14 * s, Math.abs(x - E.x))) * sstep(mouthY - .01 * s, mouthY + .05 * s, y);
    const muz = low * front * (1 - sstep(.3 * s, .42 * s, Math.abs(x - E.x))) * (1 - bridge), thr = sstep(chinY + .05 * s, chinY - .06 * s, y) * sstep(E.z - .45 * s, E.z - .25 * s, z);
    let belly = thr >= muz ? thr : -muz;  // the throat goes with the belly, muzzle and cheeks are their own mark (negative)
    let dm = -(1 - sstep(.06 * s, .14 * s, Math.abs(y - E.y))) * sstep(E.z - .38 * s, E.z - .12 * s, z) * (1 - sstep(E.z + .08 * s, E.z + .22 * s, z)), tp = 0, kind = 1;
    const e = d.ear[i] / 255;
    if (e > .3) { const k = x > 0 ? 'L' : 'R', b = eb[k]; if (b && isFinite(earTop[k])) tp = clamp((y - b.y) / (earTop[k] - b.y), 0, 1) * sstep(.3, .6, e); belly *= 1 - e; dm *= 1 - e; }
    if (Math.hypot(x - tip[0], y - tip[1], z - tip[2]) < .075 * s && z > tip[2] - .06 * s) kind = 2;
    furPack(A, o, belly, 0, tp, kind, dm);
  }
  noseAt(m, tip, .075 * s, E.y + s * L.mouthY);
  geo.attributes.aEye.needsUpdate = true;
}
// lofted parts: the tail (2..3 along it, the top side is the back line), claws, hooves, pads and horns by kind
// (len > 0: a tail that long; len < 0: an ear that tall, measured from its base to its tip)
function furAttrsLoft(g, kind, len = 0) {
  const n = g.attributes.position.count, ln = g.attributes.aLine.array, A = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    if (len < 0) { furPack(A, i * 4, 0, 0, clamp(ln[i * 4 + 2] / -len, 0, 1), kind, 0); continue; }
    furPack(A, i * 4, len ? sstep(.4, .9, ln[i * 4]) * .6 : 0, 0, len ? 2 + clamp(ln[i * 4 + 2] / len, 0, 1) : 0, kind, len ? sstep(.3, .85, -ln[i * 4]) : 0);
  }
  g.setAttribute('aEye', new THREE.BufferAttribute(A, 4)); return g;
}
// the tail's natural carriage for a joint (what a pose without a tail of its own gets)
function tailRest(m, n) { const t = tailOf(m && m.body); return t && t.rest ? t.rest[+n.slice(4) - 1] : null; }
// put the tail in its natural carriage (a new species, a new shape)
function restTail(m) { for (const n of ['tail1', 'tail2', 'tail3']) { const r = tailRest(m, n); if (r) m.joints[n].rotation.set(r[0] * DEG, r[1] * DEG, r[2] * DEG); } }

/* ---------- fluff: the tufts that make a furry silhouette ----------
   Furry art draws fur as tufts that break the outline where the coat is longest: a ruff on the neck and chest, tufts
   behind the elbows, cuffs at the wrists and on the hocks. They are cones grown out of the skin, leaning with the hair
   (down and back), each taking the coat's colour at its root; all of them one mesh. body.fluff: 0 sleek … 1 very fluffy. */
const FLUFF_DEF = {can: .55, fel: .4, otro: .5, pre: .3, rep: 0};
const fluffOf = b => b && b.species !== 'humano' ? (b.fluff ?? FLUFF_DEF[(SPECIES[b.species] || {}).fam] ?? .4) : 0;
function fluffGeo(m) {
  const k = fluffOf(m.body); if (k < .02) return null;
  const P = m.geo.attributes.position.array, N = m.geo.attributes.normal.array, E = m.geo.attributes.aEye.array, J = m.J, sz = m.size || 1, nV = FIG.meta.nV;
  const jp = n => new V3(J[FIG.jIdx[n] * 3], J[FIG.jIdx[n] * 3 + 1], J[FIG.jIdx[n] * 3 + 2]), ACC = n => m.accBones.indexOf(m.bones[FIG.jIdx[n]]);
  const reg = FIG.region, rng = mulberry(7), parts = [];
  // spread n roots over the vertices that pass `ok`, far from each other
  const pick = (ok, n) => { const c = []; for (let i = 0; i < nV; i++) if (!FIG.eye[i] && ok(i)) c.push(i); if (!c.length) return [];
    const out = [c[Math.floor(rng() * c.length)]];
    while (out.length < n) { let best = -1, bd = -1; for (let t = 0; t < 40; t++) { const i = c[Math.floor(rng() * c.length)]; let d = Infinity; for (const o of out) d = Math.min(d, (P[i * 3] - P[o * 3]) ** 2 + (P[i * 3 + 1] - P[o * 3 + 1]) ** 2 + (P[i * 3 + 2] - P[o * 3 + 2]) ** 2); if (d > bd) { bd = d; best = i; } } out.push(best); }
    return out; };
  const SI = m.geo.attributes.skinIndex.array, SW = m.geo.attributes.skinWeight.array;
  // a tuft lies along the skin (flat, wide, leaning with the hair) and is skinned like the skin it grows from
  const tuft = (i, bone, len, w, lean) => {
    const o = new V3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]), n = new V3(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]).normalize();
    const ax = lean.clone().addScaledVector(n, -lean.dot(n)).normalize().multiplyScalar(.85).addScaledVector(n, .35).normalize(), L = len * (.75 + .5 * rng()) * sz, W = w * (.8 + .4 * rng()) * sz;
    const side = n.clone().cross(ax).normalize(), wts = [0, 1, 2, 3].map(k => [SI[i * 4 + k], SW[i * 4 + k]]).filter(x => x[1] > 0);
    const g = loft({origin: o.clone().addScaledVector(n, -W * .12), axis: ax, side, radial: 6, sub: 2, n: 2,
      secs: [[0, W, W * .22], [L * .4, W * .7, W * .16], [L * .78, W * .3, W * .08], [L, .0008, .0008]], bend: .12, weights: () => wts});
    const ln = g.attributes.aLine.array; for (let v = 3; v < ln.length; v += 4) ln[v] = -1;  // no contour rings on a tuft
    // the colour of the coat where it grows
    const c = E.slice(i * 4, i * 4 + 4), cnt = g.attributes.position.count, A = new Float32Array(cnt * 4);
    for (let v = 0; v < cnt; v++) A.set(c[3] < -1.5 ? c : [0, 0, 0, -2.5], v * 4);
    g.setAttribute('aEye', new THREE.BufferAttribute(A, 4)); g.setAttribute('aHide', new THREE.BufferAttribute(new Float32Array(cnt), 1));
    g.setAttribute('aRoot', new THREE.BufferAttribute(new Float32Array(cnt).fill(i), 1)); parts.push(g);
  };
  const down = new V3(0, -1, -.25).normalize(), back = new V3(0, -.4, -1).normalize(), s = k;
  const neck = jp('neck'), chest = jp('chest'), chin = m.anthro ? m.anthro.L.chin : neck.y + .06 * sz;
  // neck ruff and chest fluff: from under the chin down the breastbone, and round the sides and back of the neck
  for (const i of pick(i => reg[m.dom[i]] === 'torso' || reg[m.dom[i]] === 'neck' ? P[i * 3 + 1] > chest.y + .02 * sz && P[i * 3 + 1] < chin - .01 * sz && N[i * 3 + 2] > .35 && Math.abs(P[i * 3]) < .075 * sz : false, Math.round(6 + 10 * s)))
    tuft(i, ACC('chest'), .05 + .06 * s, .022, down);
  for (const i of pick(i => reg[m.dom[i]] === 'neck' && P[i * 3 + 1] < chin + .02 * sz && N[i * 3 + 2] < .2, Math.round(3 + 8 * s)))
    tuft(i, ACC('neck'), .04 + .05 * s, .02, new V3(0, -.7, -.3).normalize());
  for (const sd of ['L', 'R']) {
    const el = jp('elbow' + sd), wr = jp('wrist' + sd), an = jp('ankle' + sd);
    // behind the elbow, round the wrist (a cuff pointing to the hand), on the back of the hock
    for (const i of pick(i => /^arm/.test(reg[m.dom[i]]) && Math.abs(P[i * 3 + 1] - el.y) < .035 * sz && N[i * 3 + 2] < -.3, Math.round(2 + 3 * s))) tuft(i, ACC('elbow' + sd), .035 + .04 * s, .016, back);
    for (const i of pick(i => /^arm/.test(reg[m.dom[i]]) && P[i * 3 + 1] > wr.y && P[i * 3 + 1] < wr.y + .035 * sz, Math.round(4 + 4 * s))) tuft(i, ACC('wrist' + sd), .025 + .03 * s, .013, new V3(0, -1, 0));
    if (legSpec(m.body)) for (const i of pick(i => /^(leg|foot)/.test(reg[m.dom[i]]) && Math.abs(P[i * 3 + 1] - an.y) < .03 * sz && N[i * 3 + 2] < -.3, Math.round(2 + 3 * s))) tuft(i, ACC('ankle' + sd), .03 + .035 * s, .015, back);
  }
  return parts.length ? mergeLofts(parts) : null;
}
// a tuft is not drawn where clothes cover the skin it grows from (called with the body's hide values)
function hideFluff(m, H) {
  const g = m.fluffGeo; if (!g) return;
  const R = g.attributes.aRoot.array, A = g.attributes.aHide.array;
  for (let i = 0; i < R.length; i++) A[i] = H[R[i]] >= .5 ? 1 : 0;
  g.attributes.aHide.needsUpdate = true;
}
// many small lofted pieces as one mesh (same attributes in each)
function mergeLofts(parts) {
  const names = Object.keys(parts[0].attributes), g = new THREE.BufferGeometry(), idx = []; let off = 0;
  for (const nm of names) {
    const a0 = parts[0].attributes[nm], tot = parts.reduce((t, p) => t + p.attributes[nm].array.length, 0), arr = new a0.array.constructor(tot); let o = 0;
    for (const p of parts) { arr.set(p.attributes[nm].array, o); o += p.attributes[nm].array.length; }
    g.setAttribute(nm, new THREE.BufferAttribute(arr, a0.itemSize));
  }
  for (const p of parts) { const I = p.index.array; for (let i = 0; i < I.length; i++) idx.push(I[i] + off); off += p.attributes.position.count; p.dispose(); }
  g.setIndex(idx); return g;
}
const mulberry = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

/* ---------- the panel: Pelaje ---------- */
const coatSl = {};
function buildCoatUI() {
  const box = $('#coatBox'); if (!box) return;
  $('#coatCols').innerHTML = '';
  [['0', 'Base'], ['1', 'Claro'], ['2', 'Oscuro'], ['le', 'Nariz y almohadillas']].forEach(([k, label]) => {
    const l = document.createElement('label'); l.className = 'coatcol'; const inp = document.createElement('input'); inp.type = 'color'; inp.dataset.k = k;
    inp.oninput = () => editCoat(c => { if (k === 'le') c.le = inp.value; else c.c[+k] = inp.value; }, false);
    inp.onchange = () => pushHistory();
    l.append(inp, document.createTextNode(tr(label))); $('#coatCols').append(l);
  });
  coatSl.fluff = slider($('#fluffBox'), {id: 'coatFluff', label: 'Pelo esponjoso', min: 0, max: 1, step: .01, value: .5, fmt: v => v < .02 ? tr('Pelo liso') : pctFmt(v),
    input: v => { mq.body.fluff = v; rebuildActive(); }, change: pushHistory});
  coatSl.sock = slider($('#coatSockBox'), {id: 'coatSock', label: 'Altura de los calcetines', min: 0, max: 1, step: .01, value: .72, fmt: pctFmt,
    input: v => editCoat(c => { c.sock = 1 - v * .9; }, false), change: pushHistory});
  coatSl.tip = slider($('#coatTipBox'), {id: 'coatTip', label: 'Punta de la cola', min: .05, max: 1, step: .01, value: .25, fmt: pctFmt,
    input: v => editCoat(c => { c.tip = v; }, false), change: pushHistory});
  syncCoatUI();
}
// changes to the coat are the body's own from then on (a preset is only where it starts)
function editCoat(fn, hist = true) {
  const c = coatOf(mq.body) || coatOf({...mq.body, coat: undefined}); if (!c) return;
  const own = {...c, c: c.c.slice(), m: {...c.m}}; fn(own); mq.body.coat = own; applyCoat(mq); syncCoatUI(true); if (hist) pushHistory(); tourEvent('mark');
}
function syncCoatUI(light) {
  const box = $('#coatBox'); if (!box) return;
  const anthro = mq.body.species !== 'humano' && !mq.avatar; box.hidden = !anthro;
  // humans and avatars have no coat: the section and its chip in the tab's index go away instead of showing an empty box
  $('#coatSec').hidden = !anthro; const nb = $('.secnav .chip[data-sec="pelaje"]'); if (nb) nb.hidden = !anthro;
  if (!anthro) return;
  const c = coatOf(mq.body), sp = mq.body.species; if (coatSl.fluff) coatSl.fluff.set(fluffOf(mq.body));
  if (!light) {
    const list = coatPresetsFor(sp).concat(Object.entries(COATS).filter(([, p]) => !p.for.includes(sp) && p.for.includes(headSp(mq.body))));
    chips($('#coatChips'), [['', 'Sin color'], ...list.map(([k, p]) => [k, p.label])], c ? c.preset || '*' : '', id => {
      mq.body.coat = id ? {preset: id} : null; applyCoat(mq); syncCoatUI(); pushHistory(); tourEvent('coat'); });
    chips($('#coatMarks'), COAT_MARKS.map(([k, l]) => [k, l]), null, k => editCoat(cc => { const v = cc.m[k] || 0; cc.m[k] = (v + 1) % 3; if (!cc.m[k]) delete cc.m[k]; }));
  }
  setPressed($('#coatChips'), c ? (mq.body.coat && mq.body.coat.c ? '' : c.preset) : '');
  if (c && mq.body.coat && mq.body.coat.c) $('#coatChips').querySelectorAll('.chip').forEach(b => b.setAttribute('aria-pressed', 'false'));
  $('#coatEdit').hidden = !c;
  if (!c) return;
  $('#coatCols').querySelectorAll('input').forEach(inp => { inp.value = inp.dataset.k === 'le' ? c.le : c.c[+inp.dataset.k]; });
  $('#coatMarks').querySelectorAll('.chip').forEach(b => {
    const v = c.m[b.dataset.v] || 0; b.setAttribute('aria-pressed', v ? 'true' : 'false'); b.style.setProperty('--mk', v ? c.c[v] : 'transparent');
    b.title = v ? tr(v === 1 ? 'Color claro · toca para oscuro' : 'Color oscuro · toca para quitar') : tr('Toca para añadir (claro, oscuro, sin)');
  });
  $('#coatSockBox').hidden = !c.m.socks; $('#coatTipBox').hidden = !c.m.tail;
  if (coatSl.sock) coatSl.sock.set((1 - (c.sock ?? .72)) / .9); if (coatSl.tip) coatSl.tip.set(c.tip ?? .25);
  if (!light && typeof crCoatSwatches === 'function') crCoatSwatches();
}
