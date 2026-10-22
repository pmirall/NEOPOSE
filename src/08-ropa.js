/* ======================= clothes =======================
   Every garment is a modelled MakeHuman community asset (CC0, makehumancommunity.org). Each vertex of the garment
   is stored as a point on a triangle of the body (three anchor vertices, barycentric weights) plus an offset, as
   MakeHuman's MakeClothes does, so the garment is refitted to every age, build and proportion. It is skinned with
   the weights of those anchors and bound to the body's skeleton; the skin it covers is not drawn, and z_depth
   decides which garment sits on top. */
const ROPA = {catalog: null, byId: {}, cache: new Map()};
const clothState = {on: false};
function clothTick() {}
function settleAll() {}
function buildClothUI() {}

function loadCatalog() {
  if (!ROPA.catalogP) ROPA.catalogP = fetch('ropa/catalog.json').then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(list => { ROPA.catalog = list; for (const it of list) ROPA.byId[it.id] = it; return list; });
  return ROPA.catalogP;
}
async function gunzip(buf) {
  const ds = new DecompressionStream('gzip'), s = new Blob([buf]).stream().pipeThrough(ds);
  return await new Response(s).arrayBuffer();
}
// one garment file: [u32 header length][header json][blob with the arrays listed in header.offs]
function loadItem(id) {
  if (ROPA.cache.has(id)) return ROPA.cache.get(id);
  const p = fetch(`ropa/${id}.txt`).then(r => { if (!r.ok) throw new Error(r.status); return r.text(); })
    .then(b64 => { const bin = atob(b64.trim()), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8.buffer; }).then(gunzip).then(buf => {
    const hl = new DataView(buf).getUint32(0, true), h = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hl))), b0 = 4 + hl, o = h.offs, n = h.n, nt = h.nt;
    // packed files (tools/makehuman/repack_ropa.py): arrays stored as byte planes, weights maybe as int16
    const arr = (C, at, count) => { if (!h.pl || C.BYTES_PER_ELEMENT === 1) return new C(buf, b0 + at, count);
      const k = C.BYTES_PER_ELEMENT, src = new Uint8Array(buf, b0 + at, count * k), out = new Uint8Array(count * k);
      for (let p = 0; p < k; p++) for (let i = 0; i < count; i++) out[i * k + p] = src[p * count + i];
      return new C(out.buffer); };
    const w = h.wq ? Float32Array.from(arr(Int16Array, o[1], n * 3), v => v / h.wq) : arr(Float32Array, o[1], n * 3);
    const d = {...h, id,
      refs: arr(Uint16Array, o[0], n * 3), w, off: arr(Int16Array, o[2], n * 3),
      uv: arr(Int16Array, o[3], n * 2), si: arr(Uint8Array, o[4], n * 4), sw: arr(Uint8Array, o[5], n * 4),
      bv: arr(Uint16Array, o[6], n), idx: h.big ? arr(Uint32Array, o[7], nt * 3) : arr(Uint16Array, o[7], nt * 3), tex: null};
    const mk = list => { const M = new Uint8Array(FIG.meta.nV); for (const [a, b] of list || []) for (let i = a; i <= b && i < M.length; i++) M[i] = 1; return M; };
    d.mask = mk(h.del); d.cover = h.cov ? mk(h.cov) : d.mask;
    // welded vertex ids (same anchors and offset) so shading is smooth across uv seams
    const key = new Map(), weld = new Uint32Array(n);
    for (let i = 0; i < n; i++) { const k = `${d.refs[i * 3]},${d.refs[i * 3 + 1]},${d.refs[i * 3 + 2]},${d.w[i * 3]},${d.w[i * 3 + 1]},${d.off[i * 3]},${d.off[i * 3 + 1]},${d.off[i * 3 + 2]}`;
      let v = key.get(k); if (v === undefined) { v = i; key.set(k, v); } weld[i] = v; }
    d.weld = weld;
    if (h.texLen) {
      const url = URL.createObjectURL(new Blob([new Uint8Array(buf, b0 + o[8], h.texLen)], {type: 'image/webp'}));
      d.texP = new Promise(res => { const im = new Image(); im.onload = () => { const t = new THREE.Texture(im); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.needsUpdate = true; d.tex = t; res(t); }; im.onerror = () => res(null); im.src = url; });
    } else d.texP = Promise.resolve(null);
    return d.texP.then(() => d);
  });
  ROPA.cache.set(id, p);
  p.catch(() => ROPA.cache.delete(id));
  return p;
}

/* ---------- materials ---------- */
const PATTERNS = {liso: 'Liso', rayasH: 'Rayas', rayasV: 'Rayas verticales', cuadros: 'Cuadros', lunares: 'Lunares', camuflaje: 'Camuflaje', vaquero: 'Vaquero', rombos: 'Rombos'};
const PAT_ID = Object.fromEntries(Object.keys(PATTERNS).map((k, i) => [k, i]));
const COLOR_MODES = {tex: 'Original', tint: 'Teñir', pat: 'Estampado'};
const PATTERN_GLSL = `
  uniform vec3 uColA, uColB; uniform float uPat, uPatS;
  varying vec4 vL2; varying vec3 vRest;
  float hsh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hsh(i), hsh(i + vec2(1, 0)), f.x), mix(hsh(i + vec2(0, 1)), hsh(i + vec2(1, 1)), f.x), f.y); }
  vec3 garmentColor() {
    float ang = atan(vL2.y, vL2.x);
    vec2 uv = vec2(ang * .16, vRest.y) / max(uPatS, .005);
    if (uPat < .5) return uColA;
    if (uPat < 1.5) return fract(uv.y) < .5 ? uColA : uColB;
    if (uPat < 2.5) return fract(uv.x) < .5 ? uColA : uColB;
    if (uPat < 3.5) { vec3 c = uColA; float a = step(fract(uv.x), .28), b = step(fract(uv.y), .28), t = step(fract(uv.x * 4.0 + .5), .12) + step(fract(uv.y * 4.0 + .5), .12);
      c = mix(c, uColB, max(a, b) * .7); c = mix(c, uColB * .6, a * b * .6); return mix(c, vec3(1.0), min(t, 1.0) * .12); }
    if (uPat < 4.5) { vec2 g = fract(uv * 1.4 + vec2(floor(uv.y * 1.4) * .5, 0.0)) - .5; return length(g) < .2 ? uColB : uColA; }
    if (uPat < 5.5) { float n = vnoise(uv * 1.3) + .5 * vnoise(uv * 2.7 + 7.0); return n < .55 ? uColA : n < .95 ? uColB : mix(uColA, uColB, .5) * .7; }
    if (uPat < 6.5) { float tw = fract((uv.x + uv.y) * 14.0); float n = vnoise(uv * 22.0); return uColA * (.82 + .18 * step(.5, tw)) * (.9 + .2 * n); }
    vec2 r = fract(vec2(uv.x + uv.y, uv.x - uv.y) * .8); return (r.x < .5) == (r.y < .5) ? uColA : uColB;
  }`;
const TEX_GLSL = `
  uniform sampler2D uTex; uniform float uTexOn, uMode, uAvgL, uCut; varying vec2 vTUv;
  vec4 texel() { return uTexOn > .5 ? texture2D(uTex, vTUv) : vec4(1.0); }`;
function makeGarmentUniforms() {
  return {uColA: {value: new THREE.Color(0xeeeeee)}, uColB: {value: new THREE.Color(0x333333)}, uPat: {value: 0}, uPatS: {value: .08},
    uTex: {value: null}, uTexOn: {value: 0}, uMode: {value: 0}, uAvgL: {value: .6}, uCut: {value: 0}, uInkZ: {value: 1}};
}
function garmentMat(style, U) {
  const tint = style === 'construccion' || style === 'volumen' || style === 'lapiz' || style === 'valores';
  const mat = style === 'construccion' ? new THREE.MeshToonMaterial({gradientMap: TOON_GRAD}) : style === 'contorno' ? new THREE.MeshBasicMaterial({color: 0xf8f5ee})
    : style === 'silueta' ? new THREE.MeshBasicMaterial({color: 0x2a2620}) : new THREE.MeshStandardMaterial({roughness: .85});
  mat.side = THREE.DoubleSide;
  mat.polygonOffset = true;
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, LU, U); inkUniforms(sh, mat);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aLine; attribute float aHide; varying float vGHide; varying vec4 vL2; varying vec3 vRest; varying vec2 vTUv; varying vec3 vInkN; uniform float uInk, uInkZ;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vL2 = aLine; vRest = position; vTUv = vec2(uv.x, uv.y); vGHide = aHide; ${inkVert(mat)}`)
      // in the ink pass each layer lies clearly over what it covers (.6 % of the distance a layer, along the line of
      // sight, so nothing moves on screen): skin or an inner garment that pokes through it a little cannot win the
      // depth test there and draw zig-zag borders at a waistband or a hem, and the hem itself is a step the pass inks
      .replace('#include <project_vertex>', `#include <project_vertex>
        if (uInk > .5) { if (isPerspectiveMatrix(projectionMatrix)) mvPosition.xyz *= 1.0 - .006 * uInkZ; else mvPosition.z -= .006 * uInkZ * mvPosition.z; gl_Position = projectionMatrix * mvPosition; }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${PATTERN_GLSL}\n${TEX_GLSL}\n${SKETCH_GLSL}\nvarying float vGHide; uniform float uInk, uInkId; varying vec3 vInkN;`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n if (vGHide > .999) discard; vec4 tx = texel(); if (uCut > .5 && tx.a < .5) discard;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        ${tint ? `{ float l = dot(tx.rgb, vec3(.299, .587, .114)), det = clamp(l / max(uAvgL, .05), .35, 1.5);
          diffuseColor.rgb = uMode < .5 ? tx.rgb : (uMode < 1.5 ? uColA * det : garmentColor() * mix(1.0, det, .8)); }` : ''}`)
      .replace('#include <output_fragment>', `#include <output_fragment>\n if (uRender > .5) gl_FragColor.rgb = sketchify(gl_FragColor.rgb);`)
      .replace('#include <dithering_fragment>', inkFrag('1.0'));   // (kind 1: cloth, whose folds the ink draws, not its valleys)
  };
  mat.customProgramCacheKey = () => 'ropa-' + style;
  return mat;
}
function garmentHullMat(U) {
  return new THREE.ShaderMaterial({
    uniforms: {...U, uW: LU.uOutW, uPx: LU.uPx, uCol: LU.uOutCol}, side: THREE.BackSide, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2,  // (behind the garment's own inside, seen through a sleeve or a collar)
    vertexShader: `#include <common>
      #include <skinning_pars_vertex>
      #include <morphtarget_pars_vertex>
      uniform float uW; uniform vec2 uPx; varying vec2 vTUv; attribute float aHide; varying float vGHide;
      void main() {
        vTUv = uv; vGHide = aHide;
        #include <beginnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <begin_vertex>
        #include <morphtarget_vertex>
        #include <skinning_vertex>
        #include <project_vertex>
        vec3 nv = normalize(normalMatrix * objectNormal); vec2 d = nv.xy; float l = length(d); d = l > 1e-4 ? d / l : vec2(0.0);
        gl_Position.xy += d * max(uW * (1.0 + .4 * dot(d, vec2(.6, -.8))), min(uW, 1.0)) * uPx * gl_Position.w;  // (weighted as the body's contour, see OUTLINE_MAT)
      }`,
    fragmentShader: `uniform vec3 uCol; uniform sampler2D uTex; uniform float uTexOn, uCut; varying vec2 vTUv; varying float vGHide;
      void main() { if (vGHide > .999) discard; if (uCut > .5 && uTexOn > .5 && texture2D(uTex, vTUv).a < .5) discard; gl_FragColor = vec4(uCol, 1.0); }`
  });
}

// hidden parts of a garment cast no shadow either
function hiddenAwareShadow(mat) {
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aHide; varying float vGHide;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGHide = aHide;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vGHide;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vGHide > .999) discard;');
  };
  mat.customProgramCacheKey = () => 'ropa-shadow-' + mat.type;
  return mat;
}
/* ---------- fitting ---------- */
// rest-pose positions of the garment on this character's body
function fitPositions(m, d, out) {
  const A = (d.hair && m.anchorsHair) || m.anchors, n = d.n, R = d.refs, W = d.w, O = d.off, s = [1, 1, 1];
  d.sc.forEach(([a, b, d0, sc0], k) => { const dist = Math.abs(A[a * 3 + k] - A[b * 3 + k]); s[k] = d0 > 1e-6 ? sc0 * dist / d0 : sc0; });
  for (let i = 0; i < n; i++) {
    const r0 = R[i * 3] * 3, r1 = R[i * 3 + 1] * 3, r2 = R[i * 3 + 2] * 3, w0 = W[i * 3], w1 = W[i * 3 + 1], w2 = W[i * 3 + 2];
    for (let k = 0; k < 3; k++) out[i * 3 + k] = A[r0 + k] * w0 + A[r1 + k] * w1 + A[r2 + k] * w2 + O[i * 3 + k] * 1e-4 * s[k];
  }
  return out;
}
// normals averaged over welded vertices, so uv seams do not show as creases
function weldedNormals(geo, weld) {
  geo.computeVertexNormals();
  const N = geo.attributes.normal.array, n = weld.length, acc = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const w = weld[i] * 3; acc[w] += N[i * 3]; acc[w + 1] += N[i * 3 + 1]; acc[w + 2] += N[i * 3 + 2]; }
  for (let i = 0; i < n; i++) { const w = weld[i] * 3, l = Math.hypot(acc[w], acc[w + 1], acc[w + 2]) || 1; N[i * 3] = acc[w] / l; N[i * 3 + 1] = acc[w + 1] / l; N[i * 3 + 2] = acc[w + 2] / l; }
  geo.attributes.normal.needsUpdate = true;
}
function buildGeometry(m, d) {
  const n = d.n, geo = new THREE.BufferGeometry();
  const P = fitPositions(m, d, new Float32Array(n * 3));
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const uv = new Float32Array(n * 2); for (let i = 0; i < n * 2; i++) uv[i] = d.uv[i] / 4096;
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(Uint16Array.from(d.si), 4));
  const sw = new Float32Array(n * 4); for (let i = 0; i < n * 4; i++) sw[i] = d.sw[i] / 255;
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  geo.setAttribute('aLine', new THREE.BufferAttribute(new Float32Array(n * 4), 4));
  geo.setAttribute('aHide', new THREE.BufferAttribute(new Float32Array(n), 1));
  geo.setIndex(new THREE.BufferAttribute(d.idx, 1));
  refitGeometry(m, d, geo);
  geo.boundingSphere = new THREE.Sphere(new V3(), 20);
  return geo;
}
function refitGeometry(m, d, geo) {
  const P = fitPositions(m, d, geo.attributes.position.array), L = geo.attributes.aLine.array, cy = m.rootY || 1;
  for (let i = 0; i < d.n; i++) { const a = Math.atan2(P[i * 3], P[i * 3 + 2]); L[i * 4] = Math.cos(a); L[i * 4 + 1] = Math.sin(a); L[i * 4 + 2] = P[i * 3 + 1] - cy; L[i * 4 + 3] = -1; }
  geo.attributes.position.needsUpdate = geo.attributes.aLine.needsUpdate = true;
  weldedNormals(geo, d.weld);
  if (typeof limbGarmentSkin === 'function') limbGarmentSkin(m, d, geo);
}

/* ---------- garments on a character ---------- */
const PALETTE = ['#e9e4da', '#f2f0ea', '#2b2b2b', '#1a1a1a', '#3d5878', '#2b4c8c', '#2b5a9e', '#9fb4d0', '#8c2f3e', '#a8323a', '#c9526b', '#f0c8d4',
  '#6f7b5a', '#3f4a33', '#5b6e4a', '#b59a6e', '#8a6a44', '#4a3426', '#c8a24a', '#e8d27a', '#5a2e3a', '#2f2d6b', '#7fb3b0', '#6b5a4a'];
const garmentSpec = (id, o = {}) => ({id, mode: 'tex', colA: '#8a8f99', colB: '#2b2b2b', pat: 'liso', patS: .08, hide: true, ...o});
function createGarment(m, spec) {
  const g = {spec, U: makeGarmentUniforms(), mats: {}, meshes: [], hull: null, geo: null, d: null};
  g.ready = Promise.all([loadItem(spec.id), loadCatalog().catch(() => null)]).then(([d]) => {
    if (!m.garments.includes(g)) return;
    g.d = d; if (spec.hair) d.hair = true;
    g.mat = style => { if (!g.mats[style]) { g.mats[style] = garmentMat(style, g.U); setLayerOffset(g); } return g.mats[style]; };
    g.geo = buildGeometry(m, d); garmentMuscles(m, g);
    const s = new THREE.SkinnedMesh(g.geo, g.mat(m.style)); s.frustumCulled = false; s.castShadow = s.receiveShadow = true; s.userData.garment = g;
    s.customDepthMaterial = hiddenAwareShadow(new THREE.MeshDepthMaterial({depthPacking: THREE.RGBADepthPacking}));
    s.customDistanceMaterial = hiddenAwareShadow(new THREE.MeshDistanceMaterial());
    const h = new THREE.SkinnedMesh(g.geo, garmentHullMat(g.U)); h.frustumCulled = false;
    const I = new THREE.Matrix4(); s.bind(m.skeleton, I); h.bind(m.skeleton, I);
    m.group.add(s, h); g.meshes = [s]; g.hull = h;
    updateGarment(m, g); updateBodyHide(m); updateGroundPad(m); applyGarmentVis(m); if (typeof wake === 'function') wake();
    if (m === mq && typeof renderGarmentList === 'function') renderGarmentList();
  }).catch(e => { console.warn('ropa', spec.id, e); g.failed = true; });
  return g;
}
function updateGarment(m, g) {
  const U = g.U, s = g.spec, d = g.d;
  U.uColA.value.set(s.colA); U.uColB.value.set(s.colB); U.uPat.value = PAT_ID[s.pat] || 0; U.uPatS.value = s.patS || .08;
  U.uMode.value = s.mode === 'tint' ? 1 : s.mode === 'pat' ? 2 : 0;
  if (d) {
    U.uTex.value = d.tex; U.uTexOn.value = d.tex ? 1 : 0; U.uCut.value = d.tex && d.alpha > .02 ? 1 : 0;
    const a = d.avg || [200, 200, 200]; U.uAvgL.value = (a[0] * .299 + a[1] * .587 + a[2] * .114) / 255;
    // without a texture, "Original" uses the material colour of the asset
    if (!d.tex && s.mode === 'tex') { U.uMode.value = 1; U.uColA.value.setRGB(...(d.col || [.8, .8, .8])); }
  }
}
/* layers: underwear, socks, trousers, shirts, coats, accessories (the asset's z_depth refines it, and the user can move a
   garment in or out). Where a garment covers the body, the skin and every garment under it are not drawn there,
   so nothing can poke through. */
const layerOf = g => (g.d ? g.d.rank : 40) + (g.spec.layer || 0) * 3;
function layerOrder(m) { return (m.garments || []).filter(g => g.d).map((g, i) => [g, i]).sort((a, b) => layerOf(a[0]) - layerOf(b[0]) || a[1] - b[1]).map(x => x[0]); }
function setLayerOffset(g) { g.U.uInkZ.value = (g.rankIdx ?? 0) + 1; for (const k in g.mats) { const mt = g.mats[k]; mt.polygonOffsetFactor = -((g.rankIdx ?? 0) + 1) * .5; mt.polygonOffsetUnits = -((g.rankIdx ?? 0) + 1) * 3; } }
// vertices of a garment in a 3 cm grid, for "is this point under that garment" tests
const GRID = .03;
function surfaceGrid(geo) {
  const P = geo.attributes.position.array, N = geo.attributes.normal.array, n = P.length / 3, cells = new Map();
  const key = (x, y, z) => (Math.floor(x / GRID) + 512) * 1048576 + (Math.floor(y / GRID) + 512) * 1024 + (Math.floor(z / GRID) + 512);
  for (let i = 0; i < n; i++) { const k = key(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); let c = cells.get(k); if (!c) cells.set(k, c = []); c.push(i); }
  return {P, N, cells, key};
}
function coveredBy(o, x, y, z) {
  const cx = Math.floor(x / GRID) + 512, cy = Math.floor(y / GRID) + 512, cz = Math.floor(z / GRID) + 512, P = o.P, N = o.N;
  let best = 1e9, bi = -1;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
    const l = o.cells.get((cx + a) * 1048576 + (cy + b) * 1024 + (cz + c)); if (!l) continue;
    for (const i of l) { const dx = x - P[i * 3], dy = y - P[i * 3 + 1], dz = z - P[i * 3 + 2], d2 = dx * dx + dy * dy + dz * dz; if (d2 < best) { best = d2; bi = i; } }
  }
  if (bi < 0) return false;
  const dx = x - P[bi * 3], dy = y - P[bi * 3 + 1], dz = z - P[bi * 3 + 2], al = dx * N[bi * 3] + dy * N[bi * 3 + 1] + dz * N[bi * 3 + 2];
  const lat2 = dx * dx + dy * dy + dz * dz - al * al;
  return lat2 < .025 * .025 && Math.abs(al) < .05;
}
// human shoes and socks do not go on an animal's paws or hooves (they cannot be put on: garmentBlock); worn before the
// species or its feet changed, they stay in the outfit but are not drawn, hide nothing and lift nothing
const offFeet = (m, g) => typeof animalFeet === 'function' && animalFeet(m) && (ROPA.byId[g.spec.id] || {}).cat === 'Calzado y calcetines';
function updateBodyHide(m) {
  const nV = FIG.meta.nV;
  if (!m.geo.attributes.aHide) m.geo.setAttribute('aHide', new THREE.BufferAttribute(new Float32Array(nV), 1));
  const H = m.geo.attributes.aHide.array; H.fill(0);
  const order = layerOrder(m);
  // 1: skin not drawn · .5: skin drawn (it may show through openings) but its ink outline is not, so it cannot poke through loose cloth
  for (const g of order) if (g.spec.hide !== false && !offFeet(m, g)) { const M = g.d.mask, Cv = g.d.cover; for (let i = 0; i < nV; i++) if (M[i]) H[i] = 1; else if (Cv[i] && H[i] < .5) H[i] = .5; }
  if (typeof pawsUnderHem === 'function') pawsUnderHem(m, H);
  if (m.mouthOpen && m.anthro && m.anthro.lip) for (const i of m.anthro.lip) H[i] = 1;
  // the fur tufts hide with what is worn over their skin; a sculpted head's cheek tufts root in the head skin it replaces, so that is hidden after
  if (typeof hideFluff === 'function') hideFluff(m, H); if (typeof hideHandParts === 'function') hideHandParts(m, H); if (typeof hideUnderParts === 'function') hideUnderParts(m, H);
  // (2: the throat below the cut, drawn but not outlined; never over what a garment hides)
  const HM = typeof headSwapMask === 'function' ? headSwapMask(m) : null; if (HM) for (let i = 0; i < nV; i++) if (HM[i]) H[i] = Math.max(H[i], HM[i] > 1 ? .5 : 1);
  m.geo.attributes.aHide.needsUpdate = true;
  // garments under others: hidden wherever an outer garment lies over them (or they poke out through it a little)
  const outer = [], hole = tailHole(m);
  for (let k = order.length - 1; k >= 0; k--) {
    const g = order[k], d = g.d, A = g.geo.attributes.aHide.array;
    g.rankIdx = k; setLayerOffset(g); A.fill(0);
    if (offFeet(m, g)) { A.fill(1); g.geo.attributes.aHide.needsUpdate = true; continue; }
    if (outer.length) {
      const P = g.geo.attributes.position.array;
      for (let i = 0; i < d.n; i++) { for (const o of outer) if (coveredBy(o, P[i * 3], P[i * 3 + 1], P[i * 3 + 2])) { A[i] = 1; break; } }
    }
    if (hole) { const P = g.geo.attributes.position.array; for (let i = 0; i < d.n; i++) if (hole(P[i * 3], P[i * 3 + 1], P[i * 3 + 2])) A[i] = 1; }
    g.geo.attributes.aHide.needsUpdate = true;
    if (g.spec.hide !== false && !(d.alpha > .02)) outer.push(surfaceGrid(g.geo));
  }
}
/* a tail hole: trousers, skirts, coats and underwear open where the tail comes out (as anthro clothes are made), a
   little wider than the tail's root so the tail fills it; along the first stretch of the tail, in its natural carriage */
const TAIL_ROOT_R = {tupida: .6, gruesa: .75, crin: .6, 'pompón': .85};
function tailHole(m) {
  const t = m.hasTail && m.tailRoot && tailOf(m.body); if (!t) return null;
  const r = (TAIL_ROOT_R[t.shape] || 1) * t.r * m.size * 1.3 + .008, rest = (t.rest || [[0, 0, 0]])[0];
  const dir = m.tailDir.clone().applyEuler(new THREE.Euler(rest[0] * DEG, rest[1] * DEG, rest[2] * DEG)), len = Math.min(.12 * m.size, t.len * m.size * .3), O = m.tailRoot;
  return (x, y, z) => { const dx = x - O.x, dy = y - O.y, dz = z - O.z, al = clamp(dx * dir.x + dy * dir.y + dz * dir.z, -.02, len);
    const ex = dx - dir.x * al, ey = dy - dir.y * al, ez = dz - dir.z * al; return ex * ex + ey * ey + ez * ez < r * r; };
}
// shoes with soles lift the figure so it stands on them
function updateGroundPad(m) {
  let pad = 0;
  for (const g of m.garments || []) if (g.geo && !offFeet(m, g)) { const P = g.geo.attributes.position.array; for (let i = 1; i < P.length; i += 3) if (-P[i] > pad && P[i] > -.08) pad = -P[i]; }
  if (Math.abs(pad - (m.groundPad || 0)) > 1e-4) { m.groundPad = pad; m.ground(); }
}
function disposeGarment(m, g) {
  for (const x of [...g.meshes, g.hull]) if (x) m.group.remove(x);
  for (const x of g.meshes) { if (x.customDepthMaterial) x.customDepthMaterial.dispose(); if (x.customDistanceMaterial) x.customDistanceMaterial.dispose(); }
  if (g.geo) g.geo.dispose(); for (const k in g.mats) g.mats[k].dispose(); if (g.hull) g.hull.material.dispose();
}
function setOutfit(m, specs) {
  for (const g of m.garments || []) if (g !== m.hairG) disposeGarment(m, g);
  m.outfit = (specs || []).filter(s => s && s.id).map(s => ({...s}));
  m.garments = m.hairG ? [m.hairG] : [];
  m.garments = [...m.outfit.map(s => createGarment(m, s)), ...m.garments];
  updateBodyHide(m); updateGroundPad(m);
  return Promise.all(m.garments.map(g => g.ready));
}
function applyGarmentVis(m) {
  const show = m.formMode !== 'formas' && m.formMode !== 'esqueleto';
  for (const g of m.garments || []) { if (!g.d) continue; for (const x of g.meshes) { x.visible = show; x.material = g.mat(m.style); } g.hull.visible = show && m.outlineOn !== false; }
}
// the body changed (age, build, proportions): refit every garment
function garmentsAfterBuild(m) {
  if (!m.garments) return;
  syncHair(m);
  for (const g of m.garments) if (g.d && g.geo) refitGeometry(m, g.d, g.geo);
  updateBodyHide(m); updateGroundPad(m);
}
