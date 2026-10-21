/* ---------- drawing materials: cross-contour lines, ink outline, pencil hatching and value studies ---------- */
const LU = {
  uStride: {value: .03}, uLineW: {value: 1.5}, uLineA: {value: .8}, uMer: {value: 0}, uCenter: {value: 1},
  uLineCol: {value: new THREE.Color(0x3a3229)}, uCenterCol: {value: new THREE.Color(0xb0432c)},
  uHiCol: {value: new THREE.Color(0x2b5a9e)},
  uOutW: {value: 1.6}, uPx: {value: new THREE.Vector2(.002, .002)}, uOutCol: {value: new THREE.Color(0x1e1a15)},
  // 0 normal · 1 pencil hatching · 2 value study · 3 screentone (manga dots; uTone: the dot cell in pixels)
  uRender: {value: 0}, uDpr: {value: 1}, uThresh: {value: .5}, uLevels: {value: 3}, uHatch: {value: .4}, uTone: {value: 7},
  uPaper: {value: new THREE.Color(0xf4f0e6)}, uGraphite: {value: new THREE.Color(0x2e2a25)},
  uInk: {value: 0}  // 1 while the ink pass draws the characters' normals and part ids (see INK in 05f-render.js)
};
/* the ink pass's output, shared by every material a character is drawn with: the view normal (xy; z is the visible
   side), and in blue the part: one id per material (body, garment, teeth, tongue; the paws' pads and claws and the tufts, apart
   from the body) plus, on
   every surface, what the coat says the skin is there when it is a part of its own (claw, horn: kinds 3–4 of furPack;
   fur and leather, 0–2, are one: on the body and the heads leather is the nose, a patch of the mesh's vertices whose
   border inked would be a jagged polygon, not a nose; the paws' pads are made shapes, apart by their material), so a
   line is found where one part meets another. Each kind is read halfway between its value and its neighbour's (below
   −4), so the border runs along the triangles' middle, not on their vertex ring; the kinds past 7 (the linings inside
   a mouth) are one part with 7, which keeps every material's ids within its stride of 8.
   The eye is no part of its own: its vertices take in a ring of the lid on the coarse body, and a border there is a
   star round the eye; the lid's line is the depth step where it passes over the eyeball. Alpha tells the inside of a
   two-sided part (.75) from its outside (1). Skin under loose cloth (aHide .5: drawn, in case it shows through an
   opening, but not outlined) is left out as the hull leaves it out: a sliver of it at a sleeve's or a shirt's side would
   be a dotted border along the cloth's edge. (Skin poking through tight cloth: see uInkZ in garmentMat.) */
// (the ids are handed out in turn as materials are first drawn, 30 of them to the byte with room for the kinds: the
// body, its parts, the garments and the mouth, drawn together, get different ones, which the materials' own ids, taken
// modulo, did not promise)
const INK_IDS = new WeakMap(); let inkNext = 0;
const inkId = mat => { if (!INK_IDS.has(mat)) INK_IDS.set(mat, 8 * (1 + inkNext++ % 30)); return INK_IDS.get(mat); };
const inkVert = mat => `vInkN = normalMatrix * ${mat.isMeshBasicMaterial ? '\n#if defined(USE_ENVMAP) || defined(USE_SKINNING)\nobjectNormal\n#else\nnormal\n#endif\n' : 'objectNormal'};`;
const inkFrag = (kind, cut = '') => `#include <dithering_fragment>
  if (uInk > .5) { ${cut} vec3 n = normalize(vInkN) * (gl_FrontFacing ? 1.0 : -1.0); gl_FragColor = vec4(n.xy * .5 + .5, (uInkId + ${kind}) / 255.0, gl_FrontFacing ? 1.0 : .75); }`;
function inkUniforms(sh, mat) { sh.uniforms.uInkId = {value: inkId(mat)}; mat.userData.ink = true; }
const SKETCH_GLSL = `
  uniform float uRender, uDpr, uThresh, uLevels, uHatch, uTone;
  uniform vec3 uPaper, uGraphite;
  float hatchL(vec2 p, vec2 d, float s) { float f = abs(fract(dot(p, d) / s) - .5) * s; return 1.0 - smoothstep(.4, 1.3, f); }
  vec3 sketchify(vec3 c) {
    float L = dot(c, vec3(.299, .587, .114));
    if (uRender > 2.5) {  // screentone: a 45° grid of dots, bigger where it is darker; the darkest shadow solid, the light paper
      vec2 p = gl_FragCoord.xy / uDpr, q = vec2(p.x + p.y, p.y - p.x) * .7071 / uTone, cell = fract(q) - .5;
      float r = sqrt(clamp((uThresh * 1.5 - L) / (uThresh * 1.5), 0.0, 1.0)) * .62, d = length(cell), aa = .9 / uTone;
      float ink = L < uThresh * .32 ? 1.0 : 1.0 - smoothstep(r - aa, r + aa, d);
      return mix(uPaper, uGraphite, ink);
    }
    if (uRender > 1.5) {
      vec3 mid = mix(uGraphite, uPaper, .55);
      if (uLevels < 2.5) return L < uThresh ? uGraphite : uPaper;
      return L < uThresh * .62 ? uGraphite : (L < uThresh * 1.3 ? mid : uPaper);
    }
    vec2 p = gl_FragCoord.xy / uDpr;
    p += vec2(sin(p.y * .071), cos(p.x * .063)) * 1.3;
    float k = uHatch * 2.0, ink = 0.0;
    if (L < .8 * k) ink = max(ink, hatchL(p, vec2(.7071, .7071), 6.0));
    if (L < .56 * k) ink = max(ink, hatchL(p, vec2(.7071, -.7071), 6.0));
    if (L < .36 * k) ink = max(ink, hatchL(p, vec2(1.0, 0.0), 4.5));
    if (L < .2 * k) ink = max(ink, hatchL(p + 2.3, vec2(.7071, .7071), 3.0));
    return mix(uPaper, uGraphite, ink * .78);
  }`;
function patchLines(mat, uHi, uMouth = {value: 0}, uEye = EYE_DEFAULT, uFur = null) {
  // (a function, not an arrow: the two-sided twins share it, and each must take its own ink id, see twoSided)
  mat.onBeforeCompile = function (sh) {
    Object.assign(sh.uniforms, LU, {uHi, uMouth}, uEye, uFur || FUR_OFF); inkUniforms(sh, this);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vInkN;\nattribute vec4 aLine;\nattribute float aHide;\nattribute float aLip;\nattribute vec4 aEye;\nuniform float uFurK;\nvarying vec3 vFurP;\nvarying vec4 vEye;\nvarying float vHide;\nvarying float vLip;\nvarying vec4 vLine;\nvarying float vHi;\nuniform float uHi;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vLine = aLine; vHi = 0.0; vHide = aHide; vLip = aLip; vEye = aEye; vFurP = position * uFurK; ${inkVert(mat)}
        #ifdef USE_SKINNING
        vHi = dot(skinWeight, vec4(1.0 - step(.5, abs(skinIndex.x - uHi)), 1.0 - step(.5, abs(skinIndex.y - uHi)),
                                   1.0 - step(.5, abs(skinIndex.z - uHi)), 1.0 - step(.5, abs(skinIndex.w - uHi))));
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec4 vLine; varying float vHi; varying float vHide; varying float vLip; uniform float uMouth; uniform float uInk, uInkId; varying vec3 vInkN;
        varying vec4 vEye; uniform float uIris, uShine; uniform vec3 uPupil;
        ${FUR_GLSL}
        // eyes: iris, pupil (round, slit or horizontal) and a highlight, in the eye's own frame (+z looks forward)
        vec3 eyeShade(vec3 c, vec3 ink, vec3 paper) {
          vec3 d = normalize(vEye.xyz); float ang = acos(clamp(d.z, -1.0, 1.0));
          if (ang > uIris) return c;
          vec2 uv = d.xy / max(sin(uIris), 1e-3);
          vec3 iris = mix(c, ink, .38), col = iris;
          float ring = ${mat.isMeshBasicMaterial ? 'smoothstep(uIris * .93 - fwidth(ang), uIris * .93, ang)' : 'smoothstep(uIris * .9, uIris, ang)'}; col = mix(col, ink, ring * .85);  // (the limbal ring: in the flat styles a crisp inked ring, not shading)
          vec2 pu = uv / uPupil.yz; if (dot(pu, pu) < 1.0) col = mix(ink, ink * .6, .3);
          if (uShine > .5) { vec2 h = uv - vec2(-.32, .38); if (dot(h, h) < .045) col = paper; vec2 h2 = uv - vec2(.28, -.3); if (dot(h2, h2) < .01) col = paper; }
          return col;
        }
        uniform float uStride, uLineW, uLineA, uMer, uCenter;
        uniform vec3 uLineCol, uCenterCol, uHiCol;
        ${SKETCH_GLSL}
        float gridLine(float x, float w) {
          float d = abs(fract(x - .5) - .5) / max(fwidth(x), 1e-5);
          return 1.0 - clamp(d - w * .5 + .5, 0.0, 1.0);
        }
        float lineAt(float x, float w) {
          float d = abs(x) / max(fwidth(x), 1e-5);
          return 1.0 - clamp(d - w * .5 + .5, 0.0, 1.0);
        }`)
      // (Solo línea is a line drawing on paper: no coat, which follows the coarse mesh's vertices and would show round
      // the eyes and on the nose as polygons the ink does not fit; the rings and the centre line faint, guides under
      // the contour and the ink of the interior lines. Silueta is flat and has no coat either)
      .replace('#include <color_fragment>', `#include <color_fragment>${mat.isMeshBasicMaterial ? '' : `
        diffuseColor.rgb = mix(diffuseColor.rgb, furPaint(diffuseColor.rgb) * .58, uFurOn);`}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        if (vHide > .999) discard;
        // open mouth: triangles that join the upper snout (+1) to the jaw (-1) are cut
        if (uMouth > .5 && vLip > -.999 && vLip < .999 && vLip != 0.0) discard;`)
      .replace('#include <output_fragment>', `#include <output_fragment>
        {
          vec3 c = gl_FragColor.rgb;${mat.isMeshBasicMaterial ? `
          // (flat styles are values of the paper's own tint, as the flat greys of an inked drawing: a part painted in
          // colour, the inside of a mouth, is a darker or lighter grey of it, never darker than a dark grey, which leaves
          // the black to the ink, the pupils and the lip margin, as the references' open mouths are toned)
          { float v = dot(c, vec3(.299, .587, .114)) / max(dot(diffuse, vec3(.299, .587, .114)), .05); c = diffuse * (vEye.w < -1.5 ? .32 + .68 * v : v); }` : ''}
          if (vEye.w > .5) c = eyeShade(c, uLineCol, vec3(1.0));
          if (uRender > .5) c = sketchify(c);
          c = mix(c, uHiCol, vHi * .4);
          // (rings and the centre line on the fur only: the leather of the nose and pads, claws, horns and teeth are
          // small hard shapes a drawing leaves clean, where rings were stray stripes and dots)
          if (vLine.w > -.5 && vEye.w > -3.0) {
            float ring = gridLine(vLine.z / uStride, uLineW);
            float mer = uMer > 0.0 ? max(lineAt(vLine.x, uLineW), lineAt(vLine.y, uLineW)) * .85 : 0.0;
            float cen = vLine.w * uCenter * max(lineAt(vLine.y, uLineW * 1.7) * step(0.0, vLine.x), lineAt(vLine.y, uLineW * 1.2) * step(vLine.x, 0.0) * .7);
            c = mix(c, uLineCol, max(ring, mer) * uLineA${mat.isMeshBasicMaterial ? ' * .3' : ''});
            c = mix(c, uCenterCol, cen * min(1.0, uLineA * 1.4)${mat.isMeshBasicMaterial ? ' * .5' : ''});
          }
          gl_FragColor.rgb = c;
        }`)
      .replace('#include <dithering_fragment>', inkFrag('(vEye.w < -4.0 ? min(floor(-vEye.w) - 1.0, 7.0) : 0.0)', 'if (vHide > .49) discard;'));
  };
  mat.customProgramCacheKey = () => 'cdp-lines-' + mat.type;
  return mat;
}
// scenery and construction forms: no contour rings, but they follow the pencil / value modes
function patchEnv(mat) {
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, LU); inkUniforms(sh, mat);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vInkN;').replace('#include <begin_vertex>', `#include <begin_vertex>\n${inkVert(mat)}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uInk, uInkId; varying vec3 vInkN;\n${SKETCH_GLSL}`)
      .replace('#include <output_fragment>', `#include <output_fragment>\n if (uRender > .5) gl_FragColor.rgb = sketchify(gl_FragColor.rgb);`)
      .replace('#include <dithering_fragment>', inkFrag('0.0'));
  };
  mat.customProgramCacheKey = () => 'cdp-env-' + mat.type;
  return mat;
}
function toonGradient() {
  const d = new Uint8Array([105,105,105,255, 165,165,165,255, 225,225,225,255]);
  const t = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true;
  return t;
}
const TOON_GRAD = toonGradient();
const OUTLINE_MAT = new THREE.ShaderMaterial({
  uniforms: {uW: LU.uOutW, uPx: LU.uPx, uCol: LU.uOutCol},
  side: THREE.BackSide, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2,  // (behind thin parts' own faces: an ear or a tuft is not blotted by its hull)
  vertexShader: `#include <common>
    #include <skinning_pars_vertex>
    #include <morphtarget_pars_vertex>
    uniform float uW; uniform vec2 uPx; attribute float aHide; varying float vHide;
    void main() {
      vHide = aHide;
      #include <beginnormal_vertex>
      #include <skinbase_vertex>
      #include <skinnormal_vertex>
      #include <begin_vertex>
      #include <morphtarget_vertex>
      #include <skinning_vertex>
      #include <project_vertex>
      vec3 nv = normalize(normalMatrix * objectNormal);
      vec2 d = nv.xy; float l = length(d);
      d = l > 1e-4 ? d / l : vec2(0.0);
      // an inker's weight: the light comes from above on the left, so the contour swells on the shadow side (below and
      // right, where forms turn away and rest on what is under them) and thins on the lit one, as a brush line does
      // (never under a pixel there, where a thinner line would break into dots)
      gl_Position.xy += d * max(uW * (1.0 + .4 * dot(d, vec2(.6, -.8))), min(uW, 1.0)) * uPx * gl_Position.w;
    }`,
  fragmentShader: `uniform vec3 uCol; varying float vHide; void main() { if (vHide > .49) discard; gl_FragColor = vec4(uCol, 1.0); }`
});
// the sculpted heads' ears, a hoof's cap, a tuft are single sheets or open shells: seen from behind, a one-sided
// material shows nothing there and the outline hull behind them comes through as black blots. Everything but the
// body wears a two-sided twin of the style's material (same shader and uniforms, so the same coat, highlight and ink
// id); the closed body, most of the pixels, keeps culling its back faces
const TWO_SIDED = new WeakMap();
function twoSided(mat) {
  let c = TWO_SIDED.get(mat);
  if (!c) { c = mat.clone(); c.side = THREE.DoubleSide; c.onBeforeCompile = mat.onBeforeCompile; c.customProgramCacheKey = mat.customProgramCacheKey; c.userData.ink = true; TWO_SIDED.set(mat, c); }
  c.transparent = mat.transparent; c.opacity = mat.opacity; c.depthWrite = mat.depthWrite;
  return c;
}
// one material set per character, so each can highlight its own selected joint and fade on its own
const EYE_DEFAULT = {uIris: {value: .5}, uShine: {value: 0}, uPupil: {value: new THREE.Vector3(0, .42, .42)}};
function makeCharMats() {
  const uHi = {value: -1}, uMouth = {value: 0}, uEye = {uIris: {value: .5}, uShine: {value: 0}, uPupil: {value: new THREE.Vector3(0, .42, .42)}}, uFur = makeFurU();
  const vol = patchLines(new THREE.MeshStandardMaterial({color: 0xcfc5b3, roughness: .8}), uHi, uMouth, uEye, uFur);
  return {uHi, uMouth, uEye, uFur,
    construccion: patchLines(new THREE.MeshToonMaterial({color: 0xcdc1ab, gradientMap: TOON_GRAD}), uHi, uMouth, uEye, uFur),
    contorno: patchLines(new THREE.MeshBasicMaterial({color: 0xf8f5ee}), uHi, uMouth, uEye, uFur),
    volumen: vol, lapiz: vol, valores: vol, trama: vol,
    silueta: patchLines(new THREE.MeshBasicMaterial({color: 0x2a2620}), uHi, uMouth, uEye),
    outline: OUTLINE_MAT,
    form: patchEnv(new THREE.MeshToonMaterial({color: 0xaeb8c2, gradientMap: TOON_GRAD})),
    formLine: new THREE.MeshBasicMaterial({color: 0xb0432c})};
}

/* ---------- anatomical figure ----------
   Body: MakeHuman base mesh (CC0), baked with arms hanging and its rig merged into 47 bones.
   Macro morphs (gender, age, muscle, weight, ideal proportions, height) are blended live,
   then the rest pose is stretched for stylised proportions (head, legs, arms, torso). */
let FIG = null;
function parseFigure(buf) {
  const dv = new DataView(buf), jl = dv.getUint32(0, true);
  const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, jl)));
  let o = 4 + jl;
  const take = (C, n) => { const a = new C(buf, o, n); o += a.byteLength; o = (o + 3) & ~3; return a; };
  const nV = meta.nV, nJ = meta.bones.length + meta.extra.length;
  FIG = {meta, index: take(Uint16Array, meta.nT * 3), base: take(Float32Array, nV * 3),
    deltas: meta.sets.map(() => take(Int16Array, nV * 3)),
    si: take(Uint8Array, nV * 4), sw: take(Uint8Array, nV * 4), eye: take(Uint8Array, nV),
    j0: take(Float32Array, nJ * 3), jd: meta.sets.map(() => take(Float32Array, nJ * 3))};
  // helper anchors: MakeHuman vertices outside the body (tights, skirt helpers) that clothes are fitted to
  const nH = meta.nH || 0;
  Object.assign(FIG, {nH, hbase: take(Float32Array, nH * 3), hdeltas: meta.sets.map(() => take(Int16Array, nH * 3)), hsi: take(Uint8Array, nH * 4), hsw: take(Uint8Array, nH * 4)});
  // extra shape targets (anthro heads, ears, legs, styles), sparse
  FIG.xsets = {};
  for (const x of meta.xsets || []) FIG.xsets[x.name] = {iv: take(Uint16Array, x.n), dv: take(Int16Array, x.n * 3), ih: take(Uint16Array, x.nh), dh: take(Int16Array, x.nh * 3), dj: take(Float32Array, nJ * 3)};
  FIG.setIdx = Object.fromEntries(meta.sets.map((n, i) => [n, i]));
  FIG.jIdx = Object.fromEntries([...meta.bones, ...meta.extra].map((n, i) => [n, i]));
  // body region of every bone and extra point, used by the proportion stretch
  const region = n => n === 'hips' ? 'hips' : (n === 'waist' || n === 'chest') ? 'torso' : n === 'neck' ? 'neck' : (n === 'head' || n === 'jaw') ? 'head'
    : /^(shoulder|elbow)[LR]$/.test(n) ? 'arm' + n.slice(-1) : /^wrist[LR]$/.test(n) ? 'hand' + n.slice(-1) : /^f[LR]\d\d$/.test(n) || /^tip[LR]/.test(n) ? 'hand' + n[n.startsWith('tip') ? 3 : 1]
    : /^(hip|knee)[LR]$/.test(n) ? 'leg' + n.slice(-1) : 'foot' + n.slice(-1);
  FIG.region = [...meta.bones, ...meta.extra].map(region);
}
// extension: extra sparse sets (old age, facial expression units) baked by tools/makehuman/build_ext.py
function parseFigureExt(buf) {
  const dv = new DataView(buf), jl = dv.getUint32(0, true), meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, jl)));
  if (meta.nV !== FIG.meta.nV || meta.nH !== FIG.nH) return;
  let o = 4 + jl; const nJ = FIG.meta.bones.length + FIG.meta.extra.length;
  const take = (C, n) => { const a = new C(buf, o, n); o += a.byteLength; o = (o + 3) & ~3; return a; };
  for (const x of meta.xsets) FIG.xsets[x.name] = {iv: take(Uint16Array, x.n), dv: take(Int16Array, x.n * 3), ih: take(Uint16Array, x.nh), dh: take(Int16Array, x.nh * 3), dj: take(Float32Array, nJ * 3)};
}
// the speech units, as dense relative morph targets shared by every character (built once); then the eyelids and the
// brows, which blink and lift as people talk and listen, and the rest of what the faces of a film are made of, so a
// face changes at once, without rebuilding the body (see applyMouths in 22-anim)
const VISEME_UNITS = ['mouth-open', 'mouth-pursing', 'mouth-protusion', 'mouth-compression', 'mouth-corner-puller', 'mouth-retraction', 'mouth-eversion',
  'eye-left-closure', 'eye-right-closure', 'eyebrows-left-up', 'eyebrows-right-up', 'eyebrows-left-inner-up', 'eyebrows-right-inner-up',
  'eye-left-opened-up', 'eye-right-opened-up', 'eye-left-slit', 'eye-right-slit', 'eyebrows-left-down', 'eyebrows-right-down', 'mouth-depression', 'mouth-elevation',
  'mouth-part-later', 'mouth-upward-retraction', 'neck-platysma', 'nose-left-elevation', 'nose-right-elevation'];
const UNIT_AT = Object.fromEntries(VISEME_UNITS.map((u, i) => [u, i]));
function visemeTargets() {
  if (FIG.visemes !== undefined) return FIG.visemes;
  if (!FIG.xsets['e-mouth-open']) return (FIG.visemes = null);
  const nV = FIG.meta.nV, q = FIG.meta.q;
  return (FIG.visemes = VISEME_UNITS.map(u => {
    const x = FIG.xsets['e-' + u], a = new Float32Array(nV * 3);
    if (x) for (let k = 0; k < x.iv.length; k++) { const o = x.iv[k] * 3; a[o] = x.dv[k * 3] * q; a[o + 1] = x.dv[k * 3 + 1] * q; a[o + 2] = x.dv[k * 3 + 2] * q; }
    const attr = new THREE.BufferAttribute(a, 3); attr.name = u; return attr;
  }));
}
// age 0..1 is 11 to 25 years (the original range, so saved scenes keep their age); 1..2 goes on to 90
const ageYears = a => Math.round(a <= 1 ? 11 + a * 14 : 25 + (a - 1) * 65);
// sets from the extension: growing old, and the face of a human expression
function extMorphs(b) {
  const w = {}, old = clamp((b.age ?? 1) - 1, 0, 1);
  if (old > 0) { w['old-male'] = b.gender * old; w['old-female'] = (1 - b.gender) * old; }
  const e = b.species === 'humano' && FACE_EXPR[b.expr];
  if (e) for (const [k, v] of Object.entries(e.u)) w['e-' + k] = (w['e-' + k] || 0) + v * (b.exprAmt ?? 1);
  return w;
}
function morphWeights(b) {
  const g = b.gender, f = 1 - g, a = Math.min(b.age ?? 1, 1), ad = .25 + .75 * a, w = {female: f, 'child-male': g * (1 - a), 'child-female': f * (1 - a)};
  const tri = v => { const mn = Math.max(0, 1 - 2 * v), mx = Math.max(0, 2 * v - 1); return [mn, 1 - mn - mx, mx]; };
  const M = tri(b.muscle), Wt = tri(b.weight), mN = ['minmuscle', 'averagemuscle', 'maxmuscle'], wN = ['minweight', 'averageweight', 'maxweight'];
  for (const [gn, gw] of [['male', g], ['female', f]]) {
    if (gw <= 0) continue;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (!(i === 1 && j === 1)) w[`u-${gn}-${mN[i]}-${wN[j]}`] = gw * M[i] * Wt[j] * ad;
    w['ideal-' + gn] = gw * b.ideal * a;
    w['hmin-' + gn] = gw * Math.max(0, 1 - 2 * b.height) * ad;
    w['hmax-' + gn] = gw * Math.max(0, 2 * b.height - 1) * ad;
  }
  return w;
}
// stretch the rest pose: every vertex moves by the weighted displacement of the regions of its bones
function stretchRest(P, J, b, o = {}) {
  const nV = o.n ?? FIG.meta.nV, R = FIG.region, si = o.si || FIG.si, sw = o.sw || FIG.sw, nJ = R.length;
  const jy = n => J[FIG.jIdx[n] * 3 + 1];
  const pass = disp => {
    const tmp = [0, 0, 0];
    for (let i = 0; i < nV; i++) {
      let dx = 0, dy = 0, dz = 0;
      for (let k = 0; k < 4; k++) {
        const w = sw[i * 4 + k] / 255; if (!w) continue;
        disp(R[si[i * 4 + k]], P[i * 3], P[i * 3 + 1], P[i * 3 + 2], tmp);
        dx += w * tmp[0]; dy += w * tmp[1]; dz += w * tmp[2];
      }
      P[i * 3] += dx; P[i * 3 + 1] += dy; P[i * 3 + 2] += dz;
    }
    for (let j = 0; j < nJ; j++) { disp(R[j], J[j * 3], J[j * 3 + 1], J[j * 3 + 2], tmp); J[j * 3] += tmp[0]; J[j * 3 + 1] += tmp[1]; J[j * 3 + 2] += tmp[2]; }
  };
  const set = (t, x, y, z) => { t[0] = x; t[1] = y; t[2] = z; };
  if (Math.abs(b.head - 1) > .005) {
    const hi = FIG.jIdx.head * 3, hx = J[hi], hy = J[hi + 1], hz = J[hi + 2], s = b.head - 1;
    pass((r, x, y, z, t) => r === 'head' ? set(t, (x - hx) * s, (y - hy) * s, (z - hz) * s) : set(t, 0, 0, 0));
  }
  if (Math.abs(b.torso - 1) > .005) {
    const h0 = jy('hips'), nk = jy('neck') - h0, sh = jy('shoulderL') - h0, s = b.torso - 1;
    pass((r, x, y, z, t) => set(t, 0, r === 'torso' ? clamp(y - h0, 0, nk) * s : (r === 'neck' || r === 'head') ? nk * s
      : (r[0] === 'a' || r.startsWith('hand')) ? sh * s : 0, 0));
  }
  if (Math.abs(b.arms - 1) > .005) {
    const s = b.arms - 1, top = {L: jy('shoulderL'), R: jy('shoulderR')}, wr = {L: jy('wristL'), R: jy('wristR')};
    pass((r, x, y, z, t) => {
      const sd = r.slice(-1);
      if (r.startsWith('arm')) set(t, 0, -Math.max(0, top[sd] - y) * s, 0);
      else if (r.startsWith('hand')) set(t, 0, -(top[sd] - wr[sd]) * s, 0);
      else set(t, 0, 0, 0);
    });
  }
  if (Math.abs(b.legs - 1) > .005) {
    const s = b.legs - 1, top = {L: jy('hipL'), R: jy('hipR')}, an = {L: jy('ankleL'), R: jy('ankleR')};
    pass((r, x, y, z, t) => {
      const sd = r.slice(-1);
      if (r.startsWith('leg')) set(t, 0, -Math.max(0, top[sd] - y) * s, 0);
      else if (r.startsWith('foot')) set(t, 0, -(top[sd] - an[sd]) * s, 0);
      else set(t, 0, 0, 0);
    });
  }
}

/* ---------- lofts for furry parts ---------- */
const se = (x, n) => Math.sign(x) * Math.pow(Math.abs(x), 2 / n);
function crInterp(secs, i, f, k) {
  const g = j => secs[clamp(j, 0, secs.length - 1)][k] || 0;
  const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2), f2 = f * f, f3 = f2 * f;
  return .5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f2 + (-p0 + 3 * p1 - 3 * p2 + p3) * f3);
}
// secs: [t, half-width, half-depth, offset along width axis, offset along depth axis]; weights(t) → [[bone, w], ...]
function loft({origin, axis, side, secs, n = 2, radial = 18, sub = 3, weights, bend = 0, mod = null, arc = null}) {
  const A = axis.clone().normalize(), P1 = side.clone().addScaledVector(A, -side.dot(A)).normalize(), P2 = new V3().crossVectors(A, P1);
  const rings = [];
  for (let i = 0; i < secs.length - 1; i++) for (let k = 0; k < sub; k++) {
    const f = k / sub, t = secs[i][0] + (secs[i + 1][0] - secs[i][0]) * f;
    rings.push([t, Math.max(crInterp(secs, i, f, 1), 4e-4), Math.max(crInterp(secs, i, f, 2), 4e-4), crInterp(secs, i, f, 3), crInterp(secs, i, f, 4)]);
  }
  { const l = secs[secs.length - 1]; rings.push([l[0], Math.max(l[1], 4e-4), Math.max(l[2], 4e-4), l[3] || 0, l[4] || 0]); }
  const C = radial + 1, R = rings.length, pos = [], line = [], si = [], sw = [], idx = [], tmp = new V3();
  const tMax = secs[secs.length - 1][0];
  for (const [t, a0, b0, ca, cb] of rings) {
    const bendOff = bend * Math.pow(Math.max(0, t) / tMax, 2) * tMax;
    for (let i = 0; i <= radial; i++) {
      const ph = arc ? arc[0] + (arc[1] - arc[0]) * i / radial : i / radial * Math.PI * 2, w = weights(t, ph), k = mod ? mod(ph, t) : 1, a = a0 * k, b = b0 * k;
      tmp.copy(origin).addScaledVector(A, t).addScaledVector(P1, ca + a * se(Math.sin(ph), n)).addScaledVector(P2, cb + bendOff - b * se(Math.cos(ph), n));
      pos.push(tmp.x, tmp.y, tmp.z);
      line.push(-Math.cos(ph), Math.sin(ph), t, 0);
      for (let k = 0; k < 4; k++) { si.push(w[k] ? w[k][0] : 0); sw.push(w[k] ? w[k][1] : 0); }
    }
  }
  for (let j = 0; j < R - 1; j++) for (let i = 0; i < radial; i++) { const a = j * C + i, b = a + 1, c = a + C, d = c + 1; idx.push(a, c, b, b, c, d); }
  const jm = Math.floor(R / 2), a0 = jm * C + Math.floor(radial / 4);
  const pA = new V3().fromArray(pos, a0 * 3), pC = new V3().fromArray(pos, (a0 + C) * 3), pB = new V3().fromArray(pos, (a0 + 1) * 3);
  const ctr = new V3().fromArray(pos, jm * C * 3).add(new V3().fromArray(pos, (jm * C + Math.floor(radial / 2)) * 3)).multiplyScalar(.5);
  if (pC.clone().sub(pA).cross(pB.clone().sub(pA)).dot(pA.clone().sub(ctr)) < 0) for (let k = 0; k < idx.length; k += 3) { const s = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = s; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aLine', new THREE.Float32BufferAttribute(line, 4));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setIndex(idx); g.computeVertexNormals();
  const nm = g.attributes.normal, v = new V3();
  if (!arc) for (let j = 0; j < R; j++) { const i0 = j * C, i1 = j * C + radial; v.set(nm.getX(i0) + nm.getX(i1), nm.getY(i0) + nm.getY(i1), nm.getZ(i0) + nm.getZ(i1)).normalize(); nm.setXYZ(i0, v.x, v.y, v.z); nm.setXYZ(i1, v.x, v.y, v.z); }
  g.boundingSphere = new THREE.Sphere(new V3(), 20);
  return g;
}
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const chainW = (list, blend) => t => {
  let k = 0;
  for (let i = 1; i < list.length; i++) if (t >= list[i][1]) k = i;
  if (k + 1 < list.length && t > list[k + 1][1] - blend) { const w = smooth(list[k + 1][1] - blend, list[k + 1][1] + blend, t); return [[list[k][0], 1 - w], [list[k + 1][0], w]]; }
  if (k > 0 && t < list[k][1] + blend) { const w = smooth(list[k][1] - blend, list[k][1] + blend, t); return [[list[k - 1][0], 1 - w], [list[k][0], w]]; }
  return [[list[k][0], 1]];
};

const AXIAL = ['hips', 'waist', 'chest', 'neck', 'head'];
const SPREAD_K = [.7, 1, 0, .55, 1];
class Mannequin {
  constructor(lib, style = 'construccion') {
    this.lib = lib; this.style = style;
    this.group = new THREE.Group();
    this.hands = {L: gest('relajada'), R: gest('relajada')};
    this.hiJoint = null; this.outlineOn = true; this.stool = false; this.formMode = 'figura'; this.forms = []; this.outfit = []; this.garments = []; this.groundPad = 0;
  }
  init() {
    const meta = FIG.meta, nV = meta.nV;
    this.bones = meta.bones.map(n => { const b = new THREE.Bone(); b.name = n; return b; });
    meta.parents.forEach((p, i) => (p < 0 ? this.group : this.bones[p]).add(this.bones[i]));
    this.tail = [0, 1, 2].map(i => { const b = new THREE.Bone(); b.name = 'tail' + (i + 1); return b; });
    this.bones[FIG.jIdx.hips].add(this.tail[0]); this.tail[0].add(this.tail[1]); this.tail[1].add(this.tail[2]);
    // ear bones (children of the head) so animal ears can be posed: alert, back, drooping
    this.ears = {L: new THREE.Bone(), R: new THREE.Bone()}; this.ears.L.name = 'earL'; this.ears.R.name = 'earR';
    this.bones[FIG.jIdx.head].add(this.ears.L, this.ears.R);
    this.joints = {}; for (const n of JOINTS) this.joints[n] = n.startsWith('tail') ? this.tail[+n[4] - 1] : n.startsWith('ear') ? this.ears[n[3]] : this.bones[FIG.jIdx[n]];
    this.fingers = {L: [], R: []};
    for (const s of ['L', 'R']) for (let f = 0; f < 5; f++) this.fingers[s].push([0, 1, 2].map(k => this.bones[FIG.jIdx[`f${s}${f}${k}`]]));
    this.bonePick = meta.bones.map(n => /^f[LR]\d\d$/.test(n) ? 'wrist' + n[1] : n);
    const g = new THREE.BufferGeometry();
    g.setIndex(new THREE.BufferAttribute(FIG.index, 1));
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nV * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nV * 3), 3));
    g.setAttribute('aLine', new THREE.BufferAttribute(new Float32Array(nV * 4), 4));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(Array.from(FIG.si), 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(Array.from(FIG.sw, v => v / 255), 4));
    g.boundingSphere = new THREE.Sphere(new V3(), 20);
    // mouth shapes for speech: MakeHuman's mouth units as morph targets, mixed at run time (no rebuild)
    const vis = visemeTargets(); if (vis) { g.morphAttributes.position = vis; g.morphTargetsRelative = true; }
    addMuscleAttrs(g, nV);
    this.geo = g;
    this.dom = new Uint8Array(nV);
    for (let i = 0; i < nV; i++) { let b = 0, bw = -1; for (let k = 0; k < 4; k++) if (FIG.sw[i * 4 + k] > bw) { bw = FIG.sw[i * 4 + k]; b = FIG.si[i * 4 + k]; } this.dom[i] = b; }
    // the body skeleton also carries the ear bones (indices after the baked ones), so sculpted ears can bend
    this.skeleton = new THREE.Skeleton([...this.bones, this.ears.L, this.ears.R, ...muscleBones()]);  // last: the muscles' activations (03b)
    // furry parts use their own skeleton: pelvis, head and the three tail bones
    this.accBones = [this.bones[FIG.jIdx.hips], this.bones[FIG.jIdx.head], ...this.tail, this.bones[FIG.jIdx.jaw], this.ears.L, this.ears.R,
      this.bones[FIG.jIdx.ankleL], this.bones[FIG.jIdx.ankleR], ...['L', 'R'].flatMap(s => [0, 1, 2, 3, 4].map(f => this.bones[FIG.jIdx[`f${s}${f}2`]])), this.bones[FIG.jIdx.wristL], this.bones[FIG.jIdx.wristR],
      this.bones[FIG.jIdx.chest], this.bones[FIG.jIdx.neck], this.bones[FIG.jIdx.elbowL], this.bones[FIG.jIdx.elbowR]];
    this.accSkeleton = new THREE.Skeleton(this.accBones);
    this.accPick = ['hips', 'head', 'tail1', 'tail2', 'tail3', 'jaw', 'earL', 'earR', 'ankleL', 'ankleR', 'wristL', 'wristL', 'wristL', 'wristL', 'wristL', 'wristR', 'wristR', 'wristR', 'wristR', 'wristR', 'wristL', 'wristR', 'chest', 'neck', 'elbowL', 'elbowR'];
    const m = new THREE.SkinnedMesh(g, this.lib[this.style]);
    m.castShadow = m.receiveShadow = true; m.frustumCulled = false;
    this.group.add(m); this.body3 = m; this.meshes = [m]; this.hulls = [];
    if (this.lib.outline) { const o = new THREE.SkinnedMesh(g, this.lib.outline); o.frustumCulled = false; this.group.add(o); this.hulls.push(o); }
    if (g.morphAttributes.position) for (const x of [m, ...this.hulls]) x.updateMorphTargets();
    this.acc = [];
    const hinge = n => ({obj: this.joints[n], hinge: HINGE[n].map(v => v * DEG)});
    this.chains = {handL: [hinge('elbowL'), {obj: this.joints.shoulderL}], handR: [hinge('elbowR'), {obj: this.joints.shoulderR}],
      footL: [hinge('kneeL'), {obj: this.joints.hipL}], footR: [hinge('kneeR'), {obj: this.joints.hipR}]};
  }
  build(body) {
    if (!this.bones) this.init();
    const prev = this.posed ? this.getPose() : null, oldRoot = this.rootY;
    this.body = {...BODY_BASE, ...body}; delete this.body.label;
    if (!SPECIES[this.body.species]) this.body.species = 'humano';
    if (this.body.species !== 'humano') { const h = headModelFor(this.body); if (h) this.body.headStyle = HEAD_CATALOG[h].style; }
    const meta = FIG.meta, nV = meta.nV, nJ = meta.bones.length + meta.extra.length;
    const P = this.geo.attributes.position.array, J = new Float32Array(nJ * 3);
    P.set(FIG.base); J.set(FIG.j0);
    for (const [name, w] of Object.entries(morphWeights(this.body))) {
      if (w < 1e-4 || !(name in FIG.setIdx)) continue;
      const k = FIG.setIdx[name], d = FIG.deltas[k], q = meta.q * w, jd = FIG.jd[k];
      for (let i = 0; i < P.length; i++) P[i] += d[i] * q;
      for (let i = 0; i < J.length; i++) J[i] += jd[i] * w;
    }
    // clothing anchors = body vertices + helper vertices, morphed and stretched the same way
    const nH = FIG.nH, H = new Float32Array(nH * 3); H.set(FIG.hbase);
    for (const [name, w] of Object.entries(morphWeights(this.body))) {
      if (w < 1e-4 || !(name in FIG.setIdx)) continue;
      const d = FIG.hdeltas[FIG.setIdx[name]], q = meta.q * w; for (let i = 0; i < H.length; i++) H[i] += d[i] * q;
    }
    const swapId = headModelFor(this.body), swapReady = swapId && HEADS[swapId];
    // a kemonomimi's hair sits on the human scalp, and the animal's ears come up through it (the ears' morph is kept
    // apart for the hair's anchors)
    const kemoHair = this.body.species !== 'humano' && (this.body.kemo ?? 3) <= 1 && !this.body.headModel && typeof HEAD_RECIPES !== 'undefined', rec = kemoHair && HEAD_RECIPES[headSp(this.body)];
    const earSet = rec ? new Set((((this.body.headStyle === 'kemono' && rec.kemonoEars) || rec.ears) || []).map(e => e[0])) : null, earP = earSet ? new Float32Array(P.length) : null;
    for (const [name, w] of Object.entries({...(swapId ? {} : speciesMorphs(this.body)), ...(this.body.morphs || {}), ...extMorphs(this.body), ...bodyMorphs(this.body)})) {
      const x = FIG.xsets[name]; if (!x || Math.abs(w) < 1e-4) continue; const q = meta.q * w;
      for (let k = 0; k < x.iv.length; k++) { const o = x.iv[k] * 3; P[o] += x.dv[k * 3] * q; P[o + 1] += x.dv[k * 3 + 1] * q; P[o + 2] += x.dv[k * 3 + 2] * q; }
      if (earP && earSet.has(name)) for (let k = 0; k < x.iv.length; k++) { const o = x.iv[k] * 3; earP[o] += x.dv[k * 3] * q; earP[o + 1] += x.dv[k * 3 + 1] * q; earP[o + 2] += x.dv[k * 3 + 2] * q; }
      for (let k = 0; k < x.ih.length; k++) { const o = x.ih[k] * 3; H[o] += x.dh[k * 3] * q; H[o + 1] += x.dh[k * 3 + 1] * q; H[o + 2] += x.dh[k * 3 + 2] * q; }
      for (let i = 0; i < J.length; i++) J[i] += x.dj[i] * w;
    }
    stretchRest(H, J.slice(), effBody(this.body), {n: nH, si: FIG.hsi, sw: FIG.hsw});
    stretchRest(P, J, effBody(this.body));
    remodelLegs(this.body, P, J, H); remodelHands(this.body, P, J, H);
    anthroHead(this, P); eyeSetup(this, P);
    let minY = Infinity; for (let i = 1; i < P.length; i += 3) if (P[i] < minY) minY = P[i];
    for (let i = 1; i < P.length; i += 3) P[i] -= minY;
    for (let i = 1; i < H.length; i += 3) H[i] -= minY;
    if (!this.anchors) this.anchors = new Float32Array((nV + nH) * 3);
    this.anchors.set(P); this.anchors.set(H, nV * 3);
    for (let i = 1; i < J.length; i += 3) J[i] -= minY;
    shiftAnthro(this, minY);
    this.J = J;
    limbStumps(this, P, H, J); this.anchors.set(P); this.anchors.set(H, nV * 3);  // limb differences: the skin closes over the stump
    if (earP) { this.anchorsHair = this.anchors.slice(); for (let i = 0; i < earP.length; i++) this.anchorsHair[i] -= earP[i]; } else this.anchorsHair = null;
    const jp = n => new V3(J[FIG.jIdx[n] * 3], J[FIG.jIdx[n] * 3 + 1], J[FIG.jIdx[n] * 3 + 2]);
    this.bones.forEach((b, i) => {
      const p = meta.parents[i];
      b.quaternion.identity(); b.scale.set(1, 1, 1);
      b.position.set(J[i * 3] - (p < 0 ? 0 : J[p * 3]), J[i * 3 + 1] - (p < 0 ? 0 : J[p * 3 + 1]), J[i * 3 + 2] - (p < 0 ? 0 : J[p * 3 + 2]));
    });
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.rootY = J[FIG.jIdx.hips * 3 + 1];
    computeHeadSwap(this, P, J);
    // head measurements for the canon and for furry parts
    const hb = FIG.jIdx.head, hd = {x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity};
    let top = 0, backZ = Infinity;
    const hipsY = this.rootY;
    for (let i = 0; i < nV; i++) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      if (y > top) top = y;
      if (this.dom[i] === hb && !FIG.eye[i]) { hd.x0 = Math.min(hd.x0, x); hd.x1 = Math.max(hd.x1, x); hd.y0 = Math.min(hd.y0, y); hd.y1 = Math.max(hd.y1, y); hd.z0 = Math.min(hd.z0, z); hd.z1 = Math.max(hd.z1, z); }
      if (Math.abs(y - (hipsY + .04)) < .05 && Math.abs(x) < .05 && z < backZ) backZ = z;
    }
    this.headBox = hd; this.headH = hd.y1 - hd.y0; this.top = top; this.heads = top / this.headH;
    this.size = top / 1.74;
    furAttrsBody(this, P);
    // tail rest: from the sacrum, pointing back and down
    const sp = SPECIES[this.body.species] || SPECIES.humano, tsp = tailOf(this.body), tl = tsp ? tsp.len * this.size : .3 * this.size;
    this.tailDir = new V3(0, -.55, -1).normalize();
    this.tailRoot = new V3(0, hipsY + .06 * this.size, (isFinite(backZ) ? backZ : -.12) + .02);
    this.tail.forEach((b, i) => { b.quaternion.identity(); b.position.copy(i === 0 ? this.tailRoot.clone().sub(jp('hips')) : this.tailDir.clone().multiplyScalar(tl / 3)); });
    // ear roots: on the back half of the skull (anthro landmarks when the head is sculpted)
    {
      const hd = this.headBox, hh = this.headH, hw = (hd.x1 - hd.x0) / 2, hdep = hd.z1 - hd.z0, cz = (hd.z0 + hd.z1) / 2, LL = this.anthro ? this.anthro.L : null;
      this.earRoot = {};
      for (const [k, sd] of [['L', 1], ['R', -1]]) {
        const hidden = !this.body.headModel && (sp.hide || []).includes(1), eb = !hidden && this.anthro && this.anthro.earBase && this.anthro.earBase[k];
        this.earRoot[k] = eb ? eb.clone() : LL ? new V3(sd * LL.hw * (hidden ? 1.05 : .58), LL.crown - LL.hh * (hidden ? .12 : .17), LL.eyeZ - LL.hh * (hidden ? .5 : .42)) : new V3(sd * hw * .62, hd.y1 - hh * .2, cz - hdep * .05);
        this.ears[k].quaternion.identity(); this.ears[k].position.copy(this.earRoot[k]).sub(jp('head'));
      }
      this.hasEars = !!sp.ears || !!(this.anthro && this.anthro.earBase);
    }
    this.group.updateMatrixWorld(true);
    this.skeleton.calculateInverses(); this.accSkeleton.calculateInverses(); fixMuscleInverses(this.skeleton);
    const I = new THREE.Matrix4();
    for (const m of [this.body3, ...this.hulls.slice(0, 1)]) m.bind(this.skeleton, I);
    this.computeLines(J);
    this.computeHandAxes(jp);
    this.buildAccessories(sp, tl, tsp);
    attachHeadSwap(this);
    musclesAfterBuild(this);
    garmentsAfterBuild(this);
    limbsAfterBuild(this);
    this.posed = true;
    if (prev) { prev.pos[1] += this.rootY - oldRoot; this.setPose(prev); } else this.applyHands();
    this.setStyle(this.style); applyCoat(this);
    this.highlight(this.hiJoint);
    if (this.formMode !== 'figura') this.buildForms();
    if (typeof wake === 'function') wake();  // a rebuilt figure is drawn at once, even at rest
  }
  /* Bridgman / Loomis construction: simple solids hung on the real bones */
  buildForms() {
    for (const f of this.forms) { f.parent && f.parent.remove(f); if (f.userData.own) f.geometry.dispose(); }
    this.forms = [];
    if (this.formMode === 'esqueleto') { buildSkeleton(this); return this.applyFormVis(); }
    disposeSkeleton(this);
    if (!this.lib.form || this.formMode === 'figura') return this.applyFormVis();
    const meta = FIG.meta, nB = meta.bones.length, P = this.geo.attributes.position.array, nV = meta.nV, J = this.J;
    const bb = Array.from({length: nB}, () => new THREE.Box3()), v = new V3();
    for (let i = 0; i < nV; i++) { if (FIG.eye[i]) continue; v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); bb[this.dom[i]].expandByPoint(v); }
    const id = n => FIG.jIdx[n], jw = n => new V3(J[id(n) * 3], J[id(n) * 3 + 1], J[id(n) * 3 + 2]);
    const box = n => ({c: bb[id(n)].getCenter(new V3()), s: bb[id(n)].getSize(new V3())});
    const add = (bone, geo, center, scale, quat, line, own) => {
      const m = new THREE.Mesh(geo, line ? this.lib.formLine : this.lib.form);
      m.position.copy(center).sub(jw(bone)); if (scale) m.scale.copy(scale); if (quat) m.quaternion.copy(quat);
      m.castShadow = !line; m.receiveShadow = !line; m.userData.own = !!own; m.userData.formOf = bone;
      this.joints[bone] ? this.joints[bone].add(m) : this.bones[id(bone)].add(m); this.forms.push(m);
      if (!line) { const h = new THREE.Mesh(geo, OUTLINE_MAT); h.userData.isHull = true; h.raycast = () => {}; m.add(h); }
      return m;
    };
    const RING = new THREE.TorusGeometry(1, .012, 5, 56);
    const ring = (bone, c, r, plane) => {
      const q = new Q();
      if (plane === 'eq') q.setFromAxisAngle(new V3(1, 0, 0), Math.PI / 2);
      else if (plane === 'side') q.setFromAxisAngle(new V3(0, 1, 0), Math.PI / 2);
      const sc = plane === 'eq' ? new V3(r.x * 1.01, r.z * 1.01, 1) : plane === 'side' ? new V3(r.z * 1.01, r.y * 1.01, 1) : new V3(r.x * 1.01, r.y * 1.01, 1);
      if (plane === 'mid') { q.setFromAxisAngle(new V3(0, 1, 0), Math.PI / 2); sc.set(r.z * 1.01, r.y * 1.01, 1); }
      return add(bone, RING, c, sc, q, true);
    };
    const limb = (bone, a, b, r1, r2) => {
      const len = a.distanceTo(b), g = new THREE.CylinderGeometry(r2, r1, len, 18, 1);
      const q = new Q().setFromUnitVectors(new V3(0, 1, 0), b.clone().sub(a).normalize());
      return add(bone, g, a.clone().add(b).multiplyScalar(.5), null, q, false, true);
    };
    const sph = (bone, c, r) => add(bone, G.sph(), c, new V3(r, r, r));
    const rad = n => { const s = box(n).s; return (Math.min(s.x, s.z) * .5 + (s.x + s.z) * .25) * .5; };
    // pelvis box, belly, ribcage egg with equator and centre line
    { const {c, s} = box('hips'); add('hips', G.box(), c, s.clone().multiply(new V3(.9, .7, .85))); }
    { const {c, s} = box('waist'); add('waist', G.sph(), c, s.clone().multiply(new V3(.42, .5, .44))); }
    { const {c, s} = box('chest'), r = new V3(s.x * .4, s.y * .48, s.z * .47); add('chest', G.sph(), c, r); ring('chest', c, r, 'eq'); ring('chest', c, r, 'mid'); }
    { const r = rad('neck'); limb('neck', jw('neck'), jw('head'), r * 1.05, r); }
    // Loomis head: cranium ball, side planes, brow line, centre line and jaw block
    { const hb = this.headBox, w = (hb.x1 - hb.x0) / 2, r = w * 1.06, dep = hb.z1 - hb.z0;
      const c = new V3(0, hb.y1 - r * .98, (hb.z0 + hb.z1) / 2 - dep * .04), rv = new V3(r, r, r);
      sph('head', c, r); ring('head', c, rv, 'eq'); ring('head', c, rv, 'mid');
      for (const sx of [1, -1]) ring('head', c.clone().add(new V3(sx * r * .8, 0, 0)), new V3(r * .6, r * .6, r * .6), 'side');
      const jawTop = c.y - r * .35, jawLen = Math.max(.02, jawTop - hb.y0);
      const JAW = geoCache.jaw || (geoCache.jaw = new THREE.CylinderGeometry(.5, .3, 1, 4, 1).rotateY(Math.PI / 4));
      add('head', JAW, new V3(0, hb.y0 + jawLen * .55, c.z + dep * .16), new V3(r * 1.35, jawLen * 1.1, r * 1.2)); }
    for (const s of ['L', 'R']) {
      const sh = jw('shoulder' + s), el = jw('elbow' + s), wr = jw('wrist' + s), hp = jw('hip' + s), kn = jw('knee' + s), an = jw('ankle' + s);
      const ru = rad('shoulder' + s), rf = rad('elbow' + s), rt = rad('hip' + s), rs = rad('knee' + s);
      sph('shoulder' + s, sh, ru * 1.05); limb('shoulder' + s, sh, el, ru, ru * .78);
      sph('elbow' + s, el, rf * .8); limb('elbow' + s, el, wr, rf, rf * .62);
      sph('wrist' + s, wr, rf * .55);
      { const {c, s: sz} = box('wrist' + s); add('wrist' + s, G.box(), c, sz.clone().multiply(new V3(.85, .9, .9))); }
      for (let f = 0; f < 5; f++) for (let k = 0; k < 3; k++) {
        const n = `f${s}${f}${k}`, a = jw(n), b = jw(k < 2 ? `f${s}${f}${k + 1}` : `tip${s}${f}`), r = Math.max(.004, rad(n) * .8);
        limb(n, a, b, r, r * .85);
      }
      sph('hip' + s, hp, rt * .8); limb('hip' + s, hp, kn, rt, rt * .7);
      sph('knee' + s, kn, rs * .85); limb('knee' + s, kn, an, rs, rs * .55);
      sph('ankle' + s, an, rs * .45);
      { const {c, s: sz} = box('ankle' + s); add('ankle' + s, G.box(), c, sz.clone().multiply(new V3(.85, .85, .95))); }
    }
    this.applyFormVis();
  }
  applyFormVis() {
    const mode = this.formMode, ghost = mode === 'mixto' || mode === 'esqueleto';
    this.body3.visible = mode !== 'formas';
    for (const a of this.acc) a.visible = mode !== 'formas' && mode !== 'esqueleto' && (!a.userData.hull || this.outlineOn !== false) && (!a.userData.mouth || !!this.mouthOpen);
    if (this.hulls[0]) this.hulls[0].visible = mode === 'figura' && this.outlineOn !== false;
    for (const k of ['construccion', 'contorno', 'volumen', 'silueta']) {
      const m = this.lib[k]; if (!m || !m.isMaterial) continue;
      m.transparent = ghost; m.opacity = ghost ? (mode === 'esqueleto' ? .16 : .3) : 1; m.depthWrite = !ghost; m.needsUpdate = true;
    }
    for (const m of this.meshes) if (m !== this.body3) { m.material = twoSided(this.lib[this.style]); m.material.needsUpdate = true; }
    applySkeletonVis(this);
    if (this.garments) applyGarmentVis(this);
  }
  setFormMode(mode) { this.formMode = mode; this.buildForms(); }
  buildAccessories(sp, tl, tsp = tailOf(this.body)) {
    for (const m of this.acc) { this.group.remove(m); if (!m.userData.hull) m.geometry.dispose(); }
    this.acc = []; this.meshes = [this.body3]; this.hulls = this.hulls.slice(0, 1);
    const hd = this.headBox, hh = this.headH, hw = (hd.x1 - hd.x0) / 2, hdep = hd.z1 - hd.z0, cz = (hd.z0 + hd.z1) / 2;
    const HEAD = 1, rigidHead = () => [[HEAD, 1]];
    const geos = [];
    const ear = (sd, e, horn) => {
      const out = (e.out || 0) * DEG * sd, back = (e.back || 0) * DEG;
      const axis = new V3(Math.sin(out), Math.cos(out) * Math.cos(back), -Math.sin(back)).normalize();
      // animal ears and horns sit on the back half of the skull, wherever the snout goes
      const an = this.anthro, LL = an ? an.L : null;
      const origin = LL ? new V3(sd * LL.hw * (horn ? .45 : .58), LL.crown - LL.hh * (horn ? .12 : .17), LL.eyeZ - LL.hh * (horn ? .28 : .42))
        : new V3(sd * hw * (horn ? .5 : .62), hd.y1 - hh * (horn ? .16 : .2), cz - hdep * (horn ? .12 : .05));
      const h = e.h * hh, w = (e.w || e.r) * hh, d = (e.d || e.r) * hh;
      let secs;
      if (horn) secs = [[-.05 * h, w, w], [0, w, w], [.45 * h, w * .65, w * .65], [.85 * h, w * .3, w * .3], [h, .002, .002]];
      else if (e.shape === 'redonda') secs = [[-.1 * h, w * .7, d], [0, w * .9, d], [.45 * h, w, d], [.85 * h, w * .75, d * .8], [h, w * .08, d * .3]];
      else if (e.shape === 'larga') secs = [[-.05 * h, w * .6, d], [0, w * .7, d], [.3 * h, w, d], [.75 * h, w * .85, d * .8], [h, w * .08, d * .3]];
      else secs = [[-.06 * h, w * .9, d], [0, w, d], [.35 * h, w * .75, d * .8], [.75 * h, w * .32, d * .5], [h, .004, .004]];
      const earW = horn ? rigidHead : () => [[sd > 0 ? 6 : 7, 1]];
      geos.push(furAttrsLoft(loft({origin: horn ? origin : this.earRoot[sd > 0 ? 'L' : 'R'].clone(), axis, side: new V3(Math.cos(out), -Math.sin(out), 0), secs, radial: horn ? 14 : 16, weights: earW, bend: horn ? (e.antler ? -.15 : -.35) : 0}), horn ? 4 : 1, horn ? 0 : -h));
      if (horn && e.antler) for (const k of [.4, .7]) {
        const o2 = origin.clone().addScaledVector(axis, h * k), ax2 = axis.clone().add(new V3(0, .1, .9)).normalize();
        geos.push(furAttrsLoft(loft({origin: o2, axis: ax2, side: new V3(1, 0, 0), secs: [[0, w * .5, w * .5], [h * .3, w * .3, w * .3], [h * .45, .002, .002]], radial: 10, weights: rigidHead}), 4));
      }
    };
    for (const sd of [1, -1]) { if (sp.ears) ear(sd, sp.ears, false); if (sp.horns) ear(sd, sp.horns, true); }
    if (tsp) {
      const t = tsp, r = t.r * this.size, L = tl;
      // profiles (radius along the tail): fine and whip-like (cats, dogs), bushy and widest past the middle (foxes,
      // wolves), thick all along (raccoons, red pandas, snow leopards), a thin tail with a tuft (lions, hyenas),
      // a pom (rabbits, deer), a reptile's that starts as wide as the hips, a horse's hair that widens as it falls
      let secs;
      if (t.shape === 'tupida') secs = [[-.04, r * .5, r * .5], [0, r * .6, r * .6], [L * .25, r * .95, r * .95], [L * .55, r * 1.15, r * 1.1], [L * .85, r * .8, r * .8], [L, r * .05, r * .05]];
      else if (t.shape === 'gruesa') secs = [[-.04, r * .6, r * .6], [0, r * .75, r * .75], [L * .2, r, r], [L * .6, r * 1.05, r * 1.05], [L * .9, r * .8, r * .8], [L, r * .12, r * .12]];
      else if (t.shape === 'penacho') secs = [[-.03, r, r], [0, r, r], [L * .5, r * .75, r * .75], [L * .8, r * .7, r * .7], [L * .88, r * 1.7, r * 1.7], [L * .96, r * 1.5, r * 1.5], [L, r * .1, r * .1]];
      else if (t.shape === 'pompón') secs = [[-.03, r * .4, r * .4], [0, r * .85, r * .85], [L * .5, r, r], [L, r * .1, r * .1]];
      else if (t.shape === 'reptil') secs = [[-.06, r * 1.1, r * .9], [0, r, r * .85], [L * .4, r * .65, r * .55], [L * .8, r * .28, r * .24], [L, .003, .003]];
      else if (t.shape === 'crin') secs = [[-.03, r * .55, r * .55], [0, r * .6, r * .6], [L * .2, r * .8, r * .7], [L * .6, r * 1.15, r * .9], [L * .92, r * 1.3, r * .95], [L, r * .3, r * .3]];
      else secs = [[-.03, r, r], [0, r, r], [L * .5, r * .9, r * .9], [L * .9, r * .7, r * .7], [L, .004, .004]];
      geos.push(furAttrsLoft(loft({origin: this.tailRoot, axis: this.tailDir, side: new V3(1, 0, 0), secs, radial: 16, sub: 3,
        weights: chainW([[0, -1e9], [2, .015], [3, L / 3], [4, L * 2 / 3]], Math.min(.05, L * .08))}), 1, L, this.size));
    }
    if (sp.mane) {
      // a lion's mane: a shaggy ring round the face (its axis looking forward), fuller below where it falls onto the
      // chest, as dark as the tail's tuft; rigid on the head
      const an = this.anthro, L = an && an.L, hh2 = L ? L.hh : hh, cy = L ? L.eyeY - .08 * hh2 : (hd.y0 + hd.y1) / 2, cz2 = L ? L.eyeZ - .42 * hh2 : cz;
      const R = (L ? L.hw : hw) * 1.12, r = hh2 * .24, g = new THREE.TorusGeometry(R, r, 14, 40), p = g.attributes.position, n = p.count;
      for (let i = 0; i < n; i++) {
        let x = p.getX(i), y = p.getY(i), z = p.getZ(i); const a = Math.atan2(y, x), lob = 1 + .16 * Math.sin(a * 13 + z * 60) + .08 * Math.sin(a * 29);
        const low = Math.max(0, -Math.sin(a)) * .55, ring = Math.hypot(x, y), k = (ring - R) * lob;
        x = Math.cos(a) * (R + k) * (1 + low * .25); y = Math.sin(a) * (R + k) * (1 + low * .6) - low * hh2 * .25; z = z * lob * (1 + low * .4) - low * hh2 * .12;
        p.setXYZ(i, x, y + cy, z + cz2);
      }
      g.computeVertexNormals();
      const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), A = new Float32Array(n * 4), ln = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) { si[i * 4] = HEAD; sw[i * 4] = 1; furPack(A, i * 4, 0, 0, 2.97, 1, 0); ln[i * 4 + 3] = -1; }
      g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
      g.setAttribute('aEye', new THREE.BufferAttribute(A, 4)); g.setAttribute('aLine', new THREE.BufferAttribute(ln, 4)); geos.push(g);
    }
    for (const g of pawGeos(this, this.geo.attributes.position.array)) geos.push(g);
    // fluff tufts are skinned like the skin under them: the body's skeleton, not the accessories'
    this.fluffGeo = null;
    { const g = fluffGeo(this); this.fluffGeo = g; if (g) { const I0 = new THREE.Matrix4(), fm = new THREE.SkinnedMesh(g, twoSided(this.lib[this.style])); fm.castShadow = fm.receiveShadow = true; fm.frustumCulled = false; fm.userData.fluff = true;
      this.group.add(fm); fm.bind(this.skeleton, I0); this.acc.push(fm); this.meshes.push(fm);
      if (this.lib.outline) { const o = new THREE.SkinnedMesh(g, this.lib.outline); o.frustumCulled = false; o.userData.hull = true; this.group.add(o); o.bind(this.skeleton, I0); this.acc.push(o); this.hulls.push(o); } } }
    const I = new THREE.Matrix4();
    // inside of the mouth (hidden until the jaw opens)
    this.mouthMeshes = [];
    for (const p of mouthParts(this)) {
      const mm = new THREE.SkinnedMesh(p.geo, mouthMat(p.kind, this.style)); mm.frustumCulled = false; mm.userData.acc = true; mm.userData.mouth = true; mm.userData.kind = p.kind;
      mm.visible = !!this.mouthOpen; this.group.add(mm); mm.bind(this.accSkeleton, I); this.acc.push(mm); this.mouthMeshes.push(mm);
      // teeth and tongue outlined like every other part (the hull hangs from its part, so it opens and closes with it)
      if (this.lib.outline && p.kind !== 'cavity') { const o = new THREE.SkinnedMesh(p.geo, this.lib.outline); o.frustumCulled = false; o.userData.hull = true; mm.add(o); o.bind(this.accSkeleton, I); this.hulls.push(o); }
    }
    for (const g of geos) {
      const m = new THREE.SkinnedMesh(g, twoSided(this.lib[this.style]));
      m.castShadow = m.receiveShadow = true; m.frustumCulled = false; m.userData.acc = true;
      this.group.add(m); m.bind(this.accSkeleton, I); this.acc.push(m); this.meshes.push(m);
      m.onBeforeRender = () => { if (this.hiAcc >= 0 && this.lib.uHi) { this.lib.uHi.value = this.hiAcc; m.material.uniformsNeedUpdate = true; } };
      m.onAfterRender = () => { if (this.hiAcc >= 0 && this.lib.uHi) { this.lib.uHi.value = -1; m.material.uniformsNeedUpdate = true; } };
      if (this.lib.outline && !g.userData.noHull) { const o = new THREE.SkinnedMesh(g, this.lib.outline); o.frustumCulled = false; o.userData.hull = true; this.group.add(o); o.bind(this.accSkeleton, I); this.acc.push(o); this.hulls.push(o); }
    }
    this.hasTail = !!tsp;
  }
  computeLines(J) {
    const meta = FIG.meta, nB = meta.bones.length, P = this.geo.attributes.position.array, L = this.geo.attributes.aLine.array;
    const pt = i => new V3(J[i * 3], J[i * 3 + 1], J[i * 3 + 2]);
    const child = {hips: 'waist', waist: 'chest', chest: 'neck', neck: 'head', shoulderL: 'elbowL', elbowL: 'wristL', wristL: 'fL20',
      shoulderR: 'elbowR', elbowR: 'wristR', wristR: 'fR20', hipL: 'kneeL', kneeL: 'ankleL', ankleL: 'toeL', hipR: 'kneeR', kneeR: 'ankleR', ankleR: 'toeR'};
    for (const s of ['L', 'R']) for (let f = 0; f < 5; f++) { child[`f${s}${f}0`] = `f${s}${f}1`; child[`f${s}${f}1`] = `f${s}${f}2`; child[`f${s}${f}2`] = `tip${s}${f}`; }
    const head = [], dir = [], ref = [], side = [], c = new Float32Array(nB), Z = new V3(0, 0, 1), Y = new V3(0, 1, 0);
    meta.bones.forEach((n, i) => {
      head[i] = pt(i);
      const d = child[n] ? pt(FIG.jIdx[child[n]]).sub(head[i]) : new V3(0, 1, 0);
      if (n.startsWith('ankle')) d.y = 0;
      d.normalize(); dir[i] = d;
      const r0 = Math.abs(d.dot(Z)) > .8 ? Y : Z;
      ref[i] = r0.clone().addScaledVector(d, -d.dot(r0)).normalize();
      side[i] = new V3().crossVectors(d, ref[i]);
      const p = meta.parents[i];
      c[i] = p < 0 ? 0 : c[p] + head[i].clone().sub(head[p]).dot(dir[p]);
    });
    const v = new V3(), rad = new V3();
    for (let i = 0, nV = meta.nV; i < nV; i++) {
      v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
      let s = 0, cs = 0, sn = 0;
      for (let k = 0; k < 4; k++) {
        const w = FIG.sw[i * 4 + k] / 255; if (!w) continue;
        const b = FIG.si[i * 4 + k];
        rad.subVectors(v, head[b]); const t = rad.dot(dir[b]);
        s += w * (c[b] + t);
        rad.addScaledVector(dir[b], -t);
        const l = rad.length() || 1;
        cs += w * rad.dot(ref[b]) / l; sn += w * rad.dot(side[b]) / l;
      }
      L[i * 4] = cs; L[i * 4 + 1] = sn; L[i * 4 + 2] = s;
      L[i * 4 + 3] = FIG.eye[i] ? -1 : AXIAL.includes(meta.bones[this.dom[i]]) ? 1 : 0;
    }
    this.geo.attributes.aLine.needsUpdate = true;
  }
  computeHandAxes(jp) {
    this.handAxes = {};
    for (const s of ['L', 'R']) {
      const sg = s === 'L' ? 1 : -1, w = jp('wrist' + s), ib = jp(`f${s}10`), pb = jp(`f${s}40`), mb = jp(`f${s}20`);
      const n = new V3().crossVectors(ib.clone().sub(w), pb.clone().sub(w)).normalize();
      if (n.x * sg > 0) n.negate();
      const fingers = [];
      for (let f = 0; f < 5; f++) {
        const pts = [jp(`f${s}${f}0`), jp(`f${s}${f}1`), jp(`f${s}${f}2`), jp(`tip${s}${f}`)];
        const goal = f === 0 ? jp(`f${s}30`).sub(pts[0]).normalize() : n;
        const curl = [0, 1, 2].map(k => { const d = pts[k + 1].clone().sub(pts[k]).normalize(); return new V3().crossVectors(d, goal).normalize(); });
        const d0 = pts[1].clone().sub(pts[0]).normalize(), lat = pts[0].clone().sub(mb);
        fingers.push({curl, spread: Math.sign(new V3().crossVectors(n, d0).dot(lat)) || 1});
      }
      // thumb opposition: the thumb turns about the hand's long axis, towards the palm
      const along = mb.clone().sub(w).normalize(), tv = jp(`tip${s}0`).sub(jp(`f${s}00`));
      const opp = tv.clone().applyAxisAngle(along, .3).dot(n) > tv.dot(n) ? 1 : -1;
      this.handAxes[s] = {n, fingers, along, opp};
    }
  }
  applyHands() {
    if (!this.handAxes) return;
    const q = new Q(), q2 = new Q();
    for (const s of ['L', 'R']) {
      const st = this.hands[s], F = this.fingers[s], A = this.handAxes[s];
      for (let f = 0; f < 5; f++) {
        const c = st.c[f], ax = A.fingers[f], ang = f === 0 ? [48, 45, 55] : [85, 100, 70];
        q2.setFromAxisAngle(A.n, ax.spread * st.s * SPREAD_K[f] * (f === 0 ? 22 : 12) * DEG * (1 - c * .6));
        if (f === 0 && st.t) q2.premultiply(q.setFromAxisAngle(A.along, A.opp * st.t * 60 * DEG));
        F[f][0].quaternion.copy(q2).multiply(q.setFromAxisAngle(ax.curl[0], c * ang[0] * DEG));
        F[f][1].quaternion.setFromAxisAngle(ax.curl[1], c * ang[1] * DEG);
        F[f][2].quaternion.setFromAxisAngle(ax.curl[2], c * ang[2] * DEG);
      }
    }
  }
  setStyle(style) {
    this.style = style;
    for (const m of this.meshes) m.material = m === this.body3 ? this.lib[style] : twoSided(this.lib[style]);
    for (const m of this.mouthMeshes || []) m.material = mouthMat(m.userData.kind, style);
    this.hulls.forEach(o => o.visible = this.outlineOn !== false);
    if (this.formMode && this.formMode !== 'figura') this.applyFormVis();
    if (this.garments) applyGarmentVis(this);
  }
  highlight(j) {
    this.hiJoint = j;
    if (!this.lib.uHi) return;
    // tail parts live in the accessory skeleton (their meshes swap the index in while they draw, see buildAccessories);
    // the rest, ears included, in the body skeleton
    const tail = !!j && j.startsWith('tail');
    this.hiAcc = tail ? this.accBones.indexOf(this.joints[j]) : -1;
    this.lib.uHi.value = j && !tail ? this.skeleton.bones.indexOf(this.joints[j]) : -1;
  }
  pick(hit) {
    const g = hit.object.geometry, a = g.index.getX(hit.faceIndex * 3);
    if (hit.object.userData.headSwap) return headPick(this, hit);
    if (hit.object.userData.acc) {
      const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
      let best = 0, bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(a, k); if (w > bw) { bw = w; best = si.getComponent(a, k); } }
      return this.accPick[best];
    }
    return this.bonePick[this.dom[a]];
  }
  box(step = 4) {
    this.group.updateMatrixWorld(true); this.skeleton.update(); this.accSkeleton.update();  // the skin on the CPU reads the skeleton's matrices
    const bx = new THREE.Box3(), v = new V3();
    for (const m of this.meshes) {
      const p = m.geometry.attributes.position, st = m === this.body3 ? step : 3;
      for (let i = 0; i < p.count; i += st) { v.fromBufferAttribute(p, i); m.boneTransform(i, v); v.applyMatrix4(m.matrixWorld); bx.expandByPoint(v); }
    }
    for (const g of this.prosthetics || []) g.traverse(o => { if (o.isMesh && !o.userData.isHull) bx.union(new THREE.Box3().setFromObject(o)); });
    return bx;
  }
  getPose() {
    const q = {};
    for (const n of JOINTS) q[n] = this.joints[n].quaternion.toArray().map(v => +v.toFixed(5));
    const pos = this.joints.hips.position.toArray(); pos[1] /= this.joints.hips.scale.y;  // an avatar's size is not part of the pose
    return {q, pos: pos.map(v => +v.toFixed(4)), hands: JSON.parse(JSON.stringify(this.hands)), stool: this.stool};
  }
  setPose(p) {
    this._visJaw = 0;
    for (const n of JOINTS) { const j = this.joints[n]; j.rotation.order = 'XYZ'; if (p.q && p.q[n]) j.quaternion.fromArray(p.q[n]); else if (p.q) j.quaternion.identity(); }
    if (p.pos) { this.joints.hips.position.fromArray(p.pos); this.joints.hips.position.y *= this.joints.hips.scale.y; }
    if (p.hands) this.hands = JSON.parse(JSON.stringify(p.hands));
    if ('stool' in p) this.stool = !!p.stool;
    this.applyHands();
  }
  ground(lift = 0) {
    const bx = this.box(3);
    this.joints.hips.position.y += -bx.min.y + lift + (this.groundPad || 0);
  }
  yaw() {
    const f = new V3(0, 0, 1).applyQuaternion(this.joints.hips.quaternion);
    return Math.atan2(f.x, f.z);
  }
}

/* ---------- IK ---------- */
function hingeAngle(q) { let a = 2 * Math.atan2(q.x, q.w); if (a > Math.PI) a -= 2 * Math.PI; if (a < -Math.PI) a += 2 * Math.PI; return a; }
const _ep = new V3(), _jp = new V3(), _v1 = new V3(), _v2 = new V3(), _q = new Q(), _pq = new Q(), _pqi = new Q(), _lq = new Q();
function solveIK(chain, effector, target, iters = 18) {
  for (const l of chain) if (l.hinge) {
    const a = hingeAngle(l.obj.quaternion), mid = (l.hinge[0] + l.hinge[1]) / 2;
    if (Math.abs(a) < .05) l.obj.rotation.set(Math.sign(mid) * .06, 0, 0);
  }
  for (let it = 0; it < iters; it++) {
    for (const l of chain) {
      const o = l.obj;
      effector.getWorldPosition(_ep); o.getWorldPosition(_jp);
      if (_ep.distanceToSquared(target) < 1e-8) return;
      _v1.subVectors(_ep, _jp).normalize(); _v2.subVectors(target, _jp).normalize();
      _q.setFromUnitVectors(_v1, _v2);
      o.parent.getWorldQuaternion(_pq); _pqi.copy(_pq).invert();
      _lq.copy(_pqi).multiply(_q).multiply(_pq).multiply(o.quaternion);
      if (l.hinge) o.rotation.set(clamp(hingeAngle(_lq), l.hinge[0], l.hinge[1]), 0, 0, 'XYZ');
      else o.quaternion.copy(_lq).normalize();
      o.updateMatrixWorld(true);
    }
  }
}
const EFFECTOR = {handL: 'wristL', handR: 'wristR', footL: 'ankleL', footR: 'ankleR', hips: 'hips'};
// target: a joint of a character plus an offset in that character's heading frame, scaled to its size
function ikTarget(m, joint, off) {
  const p = m.joints[joint].getWorldPosition(new V3());
  const o = new V3(...off).multiplyScalar(m.size || 1).applyAxisAngle(new V3(0, 1, 0), m.yaw());
  return p.add(o);
}
function solveSpec(m, spec, target) { solveIK(m.chains[spec.e], m.joints[EFFECTOR[spec.e]], target); }

/* ---------- applying poses ---------- */
function applyPreset(m, p, o = {}) {
  const J = m.joints;
  for (const n of JOINTS) {
    const e = (p.j && p.j[n]) || (n.startsWith('tail') && tailRest(m, n)) || [0, 0, 0];
    if (e.seq) { // ordered rotations in the parent frame: first, second, third…
      const q = new Q(), t = new Q(), ax = {x: new V3(1, 0, 0), y: new V3(0, 1, 0), z: new V3(0, 0, 1)};
      for (const [a, d] of e.seq) q.premultiply(t.setFromAxisAngle(ax[a], d * DEG));
      J[n].rotation.order = 'XYZ'; J[n].quaternion.copy(q); continue;
    }
    const v = o.variation ? (n === 'hips' || n.startsWith('tail') ? 0 : o.variation * (SPINE.includes(n) ? .6 : 1)) : 0;
    const r = () => (Math.random() * 2 - 1) * v;
    let x = (e[0] || 0) + r(), y = (e[1] || 0) + r(), z = (e[2] || 0) + r();
    if (HINGE[n]) { x = clamp(x, HINGE[n][0], HINGE[n][1]); y = z = 0; }
    J[n].rotation.set(x * DEG, y * DEG, z * DEG, e[3] || 'XYZ');
  }
  const hs = p.hands || {};
  m.hands = {L: gest(hs.L), R: gest(hs.R)};
  m.applyHands();
  m.stool = !!p.stool;
  if (o.yaw) J.hips.quaternion.premultiply(new Q().setFromAxisAngle(new V3(0, 1, 0), o.yaw));
  m.group.updateMatrixWorld(true);
  for (const spec of p.ik || []) solveSpec(m, spec, ikTarget(m, spec.t, spec.o));
  if (o.ground !== false) m.ground(p.lift || 0);
}
