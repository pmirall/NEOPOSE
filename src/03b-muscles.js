/* ======================= muscles that answer to the pose, and skin that keeps its volume =======================
   Skinning alone moves the skin with the bones and nothing else: a bent arm keeps a flat biceps, the elbow loses
   volume, and a wrist turned on the forearm pinches it like a sweet wrapper (linear blend skinning averages the bone
   matrices, and an average of two turns is not a turn). Two layers fix it, for every skinned mesh in the app:
   - Dual quaternion skinning: the bones' transforms are blended as dual quaternions, which stay rigid, so twists and
     bends keep the limb round (Kavan et al., 2007). Done in the shader chunks every material uses, and the same on
     the CPU (export, picking, framing).
   - Muscles: like the joint-controlled morphs of DAZ figures and the corrective shapes of pose space deformation,
     each muscle is a shape driven by the angles of the joints it crosses: the biceps rises and shortens as the elbow
     bends, the calf bunches on tiptoe, the glute tightens with the leg behind, the abs fold in a crunch, the neck's
     sternocleidomastoid stands out on the far side of a head turn. The shapes are made for every body from its own
     rest mesh (no sculpted data): a soft region along the bone the muscle covers, on the side where it lies, pushed
     out from the bone. More muscle shows more, more fat shows less. Each vertex keeps its four strongest muscles
     (movement and normal change) as attributes; how much each muscle works travels in two extra "bones" of the
     skeleton, so any mesh on that skeleton (body, clothes, outlines, shadows, imported avatars) follows them. */
const MUSCLE_DEFS = [
  // gate: bones whose skin it is on · ax: from, to · t, w: centre and spread along that line · dir: the side it lies on
  // (character's left: x left, y up, z front) · p: how tightly to that side · amp, shift: out from the bone and along it (m)
  {id: 'biceps', gate: ['shoulder'], ax: ['shoulder', 'elbow'], t: .6, w: .22, dir: [0, 0, 1], p: 2, amp: .022, shift: -.012, drv: 'elbow'},
  {id: 'triceps', gate: ['shoulder'], ax: ['shoulder', 'elbow'], t: .55, w: .32, dir: [0, 0, -1], p: 2, amp: -.004, drv: 'elbow'},
  {id: 'forearm', gate: ['elbow'], ax: ['elbow', 'wrist'], t: .22, w: .22, dir: [.4, 0, 1], p: 1.5, amp: .011, shift: -.006, drv: 'forearm'},
  {id: 'deltoid', gate: ['shoulder', 'chest'], ax: ['shoulder', 'elbow'], t: .04, w: .2, dir: [1, .7, 0], p: 1, amp: .014, drv: 'raise'},
  {id: 'pec', gate: ['chest'], ax: ['midShoulder', 'shoulder'], t: .5, w: .5, dir: [0, -.3, 1], p: 2.5, amp: .012, drv: 'pec'},
  {id: 'trap', gate: ['chest', 'neck'], ax: ['neck', 'shoulder'], t: .5, w: .45, dir: [0, 1, -.5], p: 2, amp: .011, drv: 'shrug'},
  {id: 'oblique', gate: ['waist', 'hips'], ax: ['hips', 'chest'], t: .45, w: .45, dir: [1, 0, .3], p: 3, amp: .010, drv: 'side'},
  {id: 'scm', gate: ['neck'], ax: ['neck', 'head'], t: .25, w: .5, dir: [.6, 0, 1], p: 3, amp: .007, drv: 'scm'},
  {id: 'glute', gate: ['hips', 'hip'], ax: ['hips', 'hip'], t: 1, w: .7, dir: [0, -.3, -1], p: 2, amp: .016, drv: 'glute'},
  {id: 'quad', gate: ['hip'], ax: ['hip', 'knee'], t: .72, w: .28, dir: [0, 0, 1], p: 2, amp: .010, drv: 'quad'},
  {id: 'hamstring', gate: ['hip'], ax: ['hip', 'knee'], t: .88, w: .2, dir: [0, 0, -1], p: 1.5, amp: .013, drv: 'deepKnee'},
  {id: 'calf', gate: ['knee'], ax: ['knee', 'ankle'], t: .3, w: .24, dir: [0, 0, -1], p: 2, amp: .016, shift: -.008, drv: 'calf'},
  // the hinges, rounder when bent (dual quaternions keep most of the volume already)
  {id: 'elbowFill', gate: ['shoulder', 'elbow'], ax: ['shoulder', 'elbow'], t: 1, w: .17, dir: [0, 0, -1], p: .7, amp: .005, drv: 'elbow'},
  {id: 'kneeFill', gate: ['hip', 'knee'], ax: ['hip', 'knee'], t: 1, w: .14, dir: [0, 0, 1], p: .7, amp: .006, drv: 'knee'},
  // the middle: one abdominal wall
  {id: 'abs', mid: true, gate: ['waist', 'hips', 'chest'], ax: ['hips', 'chest'], t: .55, w: .55, dir: [0, 0, 1], p: 4, amp: .009, drv: 'crunch'}
];
const MUSCLES = MUSCLE_DEFS.flatMap(d => d.mid ? [{...d, s: ''}] : [{...d, s: 'L'}, {...d, s: 'R'}]);
const MUSC_BONES = Math.ceil(MUSCLES.length / 16);  // extra skeleton "bones" that carry 16 activations each
/* Per vertex: four muscle ids and, for each, how far it moves the skin and turns its normal (24 numbers). They ride in
   four attributes, not seven: a skinned figure with cross-contour lines, fur, lips and eyes would otherwise pass the 16
   attributes WebGL allows once the vertex index the morphs read is counted (SwiftShader, the software WebGL browsers
   fall back to, counts it and refuses the shader). Each float carries two whole numbers below 4096 (exact: a float
   holds every integer to 2^24): the ids two by two, then the 24 numbers as 12-bit steps of the vertex's own largest
   movement and turn, which ride as plain floats. A mesh without them reads zeros: no muscle. */
const MUSC_ATTRS = ['aMuscP0', 'aMuscP1', 'aMuscP2', 'aMuscP3'];
const mouthCount = () => (FIG.visemes ? FIG.visemes.length : 0);
const smoothR = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const DQ_MIX = 1;  // 1: dual quaternions, 0: plain linear blend

/* ---------- shaders: dual quaternion skinning and muscles in three's own chunks ---------- */
(function installSkinning() {
  const C = THREE.ShaderChunk;
  C.skinning_pars_vertex += `
#ifdef USE_SKINNING
  #define DQ_MIX ${DQ_MIX.toFixed(1)}
  attribute vec4 aMuscP0; attribute vec4 aMuscP1; attribute vec4 aMuscP2; attribute vec4 aMuscP3;
  vec2 mU( const in float v ) { float h = floor( v / 4096.0 ); return vec2( v - h * 4096.0, h ); }
  vec2 mQ( const in float v, const in float s ) { return ( mU( v ) / 2047.5 - 1.0 ) * s; }
  float muscAct( const in float s ) {
    if ( s < 1.5 ) return 0.0;
    float k = s - 2.0, b = floor( k / 16.0 + 0.001 ), e = k - b * 16.0; mat4 M = getBoneMatrix( b );
    vec4 c = e < 3.5 ? M[ 0 ] : e < 7.5 ? M[ 1 ] : e < 11.5 ? M[ 2 ] : M[ 3 ]; float r = e - floor( e / 4.0 + 0.001 ) * 4.0;
    return r < 0.5 ? c.x : r < 1.5 ? c.y : r < 2.5 ? c.z : c.w;
  }
  vec4 m2q( const in mat3 m ) {
    float t = m[0][0] + m[1][1] + m[2][2];
    if ( t > 0.0 ) { float s = sqrt( t + 1.0 ) * 2.0; return vec4( ( m[1][2] - m[2][1] ) / s, ( m[2][0] - m[0][2] ) / s, ( m[0][1] - m[1][0] ) / s, 0.25 * s ); }
    if ( m[0][0] > m[1][1] && m[0][0] > m[2][2] ) { float s = sqrt( 1.0 + m[0][0] - m[1][1] - m[2][2] ) * 2.0; return vec4( 0.25 * s, ( m[1][0] + m[0][1] ) / s, ( m[2][0] + m[0][2] ) / s, ( m[1][2] - m[2][1] ) / s ); }
    if ( m[1][1] > m[2][2] ) { float s = sqrt( 1.0 + m[1][1] - m[0][0] - m[2][2] ) * 2.0; return vec4( ( m[1][0] + m[0][1] ) / s, 0.25 * s, ( m[2][1] + m[1][2] ) / s, ( m[2][0] - m[0][2] ) / s ); }
    float s = sqrt( 1.0 + m[2][2] - m[0][0] - m[1][1] ) * 2.0; return vec4( ( m[2][0] + m[0][2] ) / s, ( m[2][1] + m[1][2] ) / s, 0.25 * s, ( m[0][1] - m[1][0] ) / s );
  }
  void m2dq( const in mat4 M, out vec4 r, out vec4 d, out float sc ) {
    sc = length( M[ 0 ].xyz ); r = normalize( m2q( mat3( M ) / max( sc, 1e-8 ) ) ); vec3 t = M[ 3 ].xyz;
    d = 0.5 * vec4( t.x * r.w + t.y * r.z - t.z * r.y, - t.x * r.z + t.y * r.w + t.z * r.x, t.x * r.y - t.y * r.x + t.z * r.w, - t.x * r.x - t.y * r.y - t.z * r.z );
  }
  vec3 qrot( const in vec4 q, const in vec3 v ) { return v + 2.0 * cross( q.xyz, cross( q.xyz, v ) + q.w * v ); }
#endif
`;
  C.skinbase_vertex = `
#ifdef USE_SKINNING
  mat4 boneMatX = getBoneMatrix( skinIndex.x ); mat4 boneMatY = getBoneMatrix( skinIndex.y ); mat4 boneMatZ = getBoneMatrix( skinIndex.z ); mat4 boneMatW = getBoneMatrix( skinIndex.w );
  vec4 dqr0, dqd0, dqr1, dqd1, dqr2, dqd2, dqr3, dqd3; float dqs0, dqs1, dqs2, dqs3;
  // each bone's move in the mesh's own space (where a squash or stretch of the whole figure cancels out and the move is rigid)
  m2dq( bindMatrixInverse * boneMatX * bindMatrix, dqr0, dqd0, dqs0 ); m2dq( bindMatrixInverse * boneMatY * bindMatrix, dqr1, dqd1, dqs1 ); m2dq( bindMatrixInverse * boneMatZ * bindMatrix, dqr2, dqd2, dqs2 ); m2dq( bindMatrixInverse * boneMatW * bindMatrix, dqr3, dqd3, dqs3 );
  if ( dot( dqr0, dqr1 ) < 0.0 ) { dqr1 = - dqr1; dqd1 = - dqd1; } if ( dot( dqr0, dqr2 ) < 0.0 ) { dqr2 = - dqr2; dqd2 = - dqd2; } if ( dot( dqr0, dqr3 ) < 0.0 ) { dqr3 = - dqr3; dqd3 = - dqd3; }
  vec4 dqR = dqr0 * skinWeight.x + dqr1 * skinWeight.y + dqr2 * skinWeight.z + dqr3 * skinWeight.w;
  vec4 dqD = dqd0 * skinWeight.x + dqd1 * skinWeight.y + dqd2 * skinWeight.z + dqd3 * skinWeight.w;
  float dqS = dot( vec4( dqs0, dqs1, dqs2, dqs3 ), skinWeight ) / max( dot( skinWeight, vec4( 1.0 ) ), 1e-6 ), dqL = max( length( dqR ), 1e-8 ); dqR /= dqL; dqD /= dqL;
  vec3 dqT = 2.0 * ( dqR.w * dqD.xyz - dqD.w * dqR.xyz + cross( dqR.xyz, dqD.xyz ) );
  vec2 mI0 = mU( aMuscP0.x ), mI1 = mU( aMuscP0.y ); float mSd = aMuscP0.z, mSn = aMuscP0.w;
  float mA0 = muscAct( mI0.x ), mA1 = muscAct( mI0.y ), mA2 = muscAct( mI1.x ), mA3 = muscAct( mI1.y );
  vec3 muscDisp = vec3( 0.0 ), muscNorm = vec3( 0.0 );
  if ( mA0 + mA1 + mA2 + mA3 != 0.0 ) {
    vec2 d0 = mQ( aMuscP1.x, mSd ), d1 = mQ( aMuscP1.y, mSd ), d2 = mQ( aMuscP1.z, mSd ), d3 = mQ( aMuscP1.w, mSd ), d4 = mQ( aMuscP2.x, mSd ), d5 = mQ( aMuscP2.y, mSd );
    vec2 n0 = mQ( aMuscP2.z, mSn ), n1 = mQ( aMuscP2.w, mSn ), n2 = mQ( aMuscP3.x, mSn ), n3 = mQ( aMuscP3.y, mSn ), n4 = mQ( aMuscP3.z, mSn ), n5 = mQ( aMuscP3.w, mSn );
    muscDisp = mA0 * vec3( d0, d1.x ) + mA1 * vec3( d1.y, d2 ) + mA2 * vec3( d3, d4.x ) + mA3 * vec3( d4.y, d5 );
    muscNorm = mA0 * vec3( n0, n1.x ) + mA1 * vec3( n1.y, n2 ) + mA2 * vec3( n3, n4.x ) + mA3 * vec3( n4.y, n5 );
  }
#endif
`;
  C.skinnormal_vertex = `
#ifdef USE_SKINNING
  objectNormal += muscNorm;
  mat4 skinMatrix = mat4( 0.0 ); skinMatrix += skinWeight.x * boneMatX; skinMatrix += skinWeight.y * boneMatY; skinMatrix += skinWeight.z * boneMatZ; skinMatrix += skinWeight.w * boneMatW;
  skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
  vec3 nLB = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz, nDQ = qrot( dqR, objectNormal );
  objectNormal = mix( nLB, nDQ, DQ_MIX );
  #ifdef USE_TANGENT
    objectTangent = vec4( skinMatrix * vec4( objectTangent, 0.0 ) ).xyz;
  #endif
#endif
`;
  C.skinning_vertex = `
#ifdef USE_SKINNING
  transformed += muscDisp;
  vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
  vec4 skinned = vec4( 0.0 ); skinned += boneMatX * skinVertex * skinWeight.x; skinned += boneMatY * skinVertex * skinWeight.y; skinned += boneMatZ * skinVertex * skinWeight.z; skinned += boneMatW * skinVertex * skinWeight.w;
  vec3 pDQ = qrot( dqR, transformed * dqS ) + dqT;
  transformed = mix( ( bindMatrixInverse * skinned ).xyz, pDQ, DQ_MIX );
#endif
`;
  // the same on the CPU: per-bone dual quaternions made once per skeleton update, then blended per vertex
  const upd = THREE.Skeleton.prototype.update;
  THREE.Skeleton.prototype.update = function () { upd.call(this); this._ver = (this._ver || 0) + 1; };
  const mat = new THREE.Matrix4(), q = new Q(), r = new Q(), v = new V3();
  const L = new THREE.Matrix4(), Bm = new THREE.Matrix4();
  function boneDQ(mesh) {  // per mesh: each bone's move in the mesh's own space, as in the shader
    const sk = mesh.skeleton; if (mesh._dqVer === sk._ver && mesh._dq) return mesh._dq;
    const E = sk.boneMatrices, n = E.length / 16, out = mesh._dq && mesh._dq.length === n * 9 ? mesh._dq : new Float64Array(n * 9);
    for (let b = 0; b < n; b++) {
      L.multiplyMatrices(mesh.bindMatrixInverse, Bm.fromArray(E, b * 16)).multiply(mesh.bindMatrix); const e = L.elements, o = 0, sc = Math.hypot(e[o], e[o + 1], e[o + 2]) || 1;
      mat.set(e[o] / sc, e[o + 4] / sc, e[o + 8] / sc, 0, e[o + 1] / sc, e[o + 5] / sc, e[o + 9] / sc, 0, e[o + 2] / sc, e[o + 6] / sc, e[o + 10] / sc, 0, 0, 0, 0, 1);
      q.setFromRotationMatrix(mat).normalize(); const tx = e[o + 12], ty = e[o + 13], tz = e[o + 14];
      out.set([q.x, q.y, q.z, q.w, .5 * (tx * q.w + ty * q.z - tz * q.y), .5 * (-tx * q.z + ty * q.w + tz * q.x), .5 * (tx * q.y - ty * q.x + tz * q.w), .5 * (-tx * q.x - ty * q.y - tz * q.z), sc], b * 9);
    }
    mesh._dq = out; mesh._dqVer = sk._ver; return out;
  }
  THREE.SkinnedMesh.prototype.boneTransform = function (index, target) {
    const sk = this.skeleton, g = this.geometry, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, M = sk.boneMatrices;
    const mc = g.userData.musc;
    if (mc) {  // muscles, in rest space as in the shader (from the full-precision copy the attributes were packed from)
      const I = mc.ids, o = index * 4, act = s => s < 1.5 ? 0 : (M[s - 2] || 0);
      for (let s = 0; s < 4; s++) { const a = act(I[o + s]); if (!a) continue; const d = (o + s) * 6; target.x += a * mc.pk[d]; target.y += a * mc.pk[d + 1]; target.z += a * mc.pk[d + 2]; }
    }
    const D = boneDQ(this), w = [SW.getX(index), SW.getY(index), SW.getZ(index), SW.getW(index)], b = [SI.getX(index), SI.getY(index), SI.getZ(index), SI.getW(index)];
    let rx = 0, ry = 0, rz = 0, rw = 0, dx = 0, dy = 0, dz = 0, dw = 0, sc = 0, ws = 0; const b0 = b[0] * 9;
    for (let k = 0; k < 4; k++) {
      if (!w[k]) continue; const o = b[k] * 9, s = (D[o] * D[b0] + D[o + 1] * D[b0 + 1] + D[o + 2] * D[b0 + 2] + D[o + 3] * D[b0 + 3]) < 0 ? -w[k] : w[k];
      rx += D[o] * s; ry += D[o + 1] * s; rz += D[o + 2] * s; rw += D[o + 3] * s; dx += D[o + 4] * s; dy += D[o + 5] * s; dz += D[o + 6] * s; dw += D[o + 7] * s; sc += D[o + 8] * w[k]; ws += w[k];
    }
    const L = Math.hypot(rx, ry, rz, rw) || 1; rx /= L; ry /= L; rz /= L; rw /= L; dx /= L; dy /= L; dz /= L; dw /= L; sc = ws ? sc / ws : 1;
    const tx = 2 * (rw * dx - dw * rx + (ry * dz - rz * dy)), ty = 2 * (rw * dy - dw * ry + (rz * dx - rx * dz)), tz = 2 * (rw * dz - dw * rz + (rx * dy - ry * dx));
    v.copy(target).multiplyScalar(sc).applyQuaternion(r.set(rx, ry, rz, rw));
    target.set(v.x + tx, v.y + ty, v.z + tz);
    return target;
  };
})();
// every skeleton that carries muscles has its activation bones at the end; their rest is identity, whatever they hold
function muscleBones() { return [...Array(MUSC_BONES)].map(() => { const b = new THREE.Bone(); b.name = '_musc'; b.matrixAutoUpdate = false; b.matrixWorldAutoUpdate = false; return b; }); }
function fixMuscleInverses(sk) { sk.bones.forEach((b, i) => { if (b.name === '_musc') sk.boneInverses[i].identity(); }); }
function addMuscleAttrs(g, n) { for (const a of MUSC_ATTRS) if (!g.attributes[a] || g.attributes[a].count !== n) g.setAttribute(a, new THREE.BufferAttribute(new Float32Array(n * 4), 4)); }

/* ---------- the shapes ---------- */
function muscleAmount(b) {
  const age = b.age ?? 1, young = .45 + .55 * Math.min(age, 1), old = age > 1 ? 1 - .3 * (age - 1) : 1;
  return (.35 + 1.1 * (b.muscle ?? .5)) * (1.15 - .6 * (b.weight ?? .5)) * young * old;
}
const _vFaces = new WeakMap();
function facesOfVertices(I, n) {
  let f = _vFaces.get(I); if (f && f.n === n) return f;
  const cnt = new Uint32Array(n + 1); for (let i = 0; i < I.length; i++) if (I[i] < n) cnt[I[i] + 1]++;
  for (let i = 0; i < n; i++) cnt[i + 1] += cnt[i];
  const at = cnt.slice(0, n), list = new Uint32Array(cnt[n]); for (let t = 0; t < I.length / 3; t++) for (let k = 0; k < 3; k++) { const v = I[t * 3 + k]; if (v < n) list[at[v]++] = t; }
  f = {start: cnt, list, n}; _vFaces.set(I, f); return f;
}
/* every muscle on a set of points: o = {P (positions, n*3), n, nFaced (the first ones are a mesh with index I), I,
   frame: {L, U, F} (unit left, up, front), joint(name, side) -> V3, gate(i, k) -> 0..1 (skin on muscle k's bones),
   cand: per-muscle cache of the points worth looking at, scale (metres to these units), amount}
   Out: per point its four strongest muscles: id (muscle index or -1), movement and normal change (in o's frame). */
function muscleField(o) {
  const {P, n, frame, scale} = o, ids = new Int16Array(n * 4).fill(-1), dv = new Float32Array(n * 12), nv = new Float32Array(n * 12), mag = new Float32Array(n * 4);
  const put = (i, k, d, nn) => {  // keep the four strongest
    const m = Math.hypot(d[0], d[1], d[2]) + .02 * Math.hypot(nn[0], nn[1], nn[2]) * scale; let j = -1, lo = Infinity;
    for (let s = 0; s < 4; s++) { if (ids[i * 4 + s] < 0) { j = s; lo = -1; break; } if (mag[i * 4 + s] < lo) { lo = mag[i * 4 + s]; j = s; } }
    if (lo >= m) return;
    ids[i * 4 + j] = k; mag[i * 4 + j] = m; for (let e = 0; e < 3; e++) { dv[(i * 4 + j) * 3 + e] = d[e]; nv[(i * 4 + j) * 3 + e] = nn[e]; }
  };
  const vf = o.I ? facesOfVertices(o.I, o.nFaced) : null, a = new V3(), b = new V3(), u = new V3(), dp = new V3(), v = new V3(), rad = new V3(), dir = new V3();
  MUSCLES.forEach((mu, k) => {
    const A0 = o.joint(mu.ax[0], mu.s), B0 = o.joint(mu.ax[1], mu.s); if (!A0 || !B0) return;
    a.copy(A0); b.copy(B0); u.subVectors(b, a); const L = u.length(); if (L < 1e-6) return; u.divideScalar(L);
    const sx = mu.s === 'R' ? -1 : 1; dir.set(0, 0, 0).addScaledVector(frame.L, mu.dir[0] * sx).addScaledVector(frame.U, mu.dir[1]).addScaledVector(frame.F, mu.dir[2]);
    dp.copy(dir).addScaledVector(u, -dir.dot(u)); const hasDir = dp.lengthSq() > 1e-8; dp.normalize();
    let cand = o.cand && o.cand[k]; if (!cand) { const c = []; for (let i = 0; i < n; i++) { const g = o.gate(i, k); if (g >= .25) c.push(i, g); } cand = new Float32Array(c); if (o.cand) o.cand[k] = cand; }
    const moved = new Map(), amp = mu.amp * o.amount * scale, shift = (mu.shift || 0) * o.amount * scale;
    for (let c = 0; c < cand.length; c += 2) {
      const i = cand[c], gate = cand[c + 1];
      v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).sub(a);
      const t = v.dot(u) / L, g = Math.exp(-(((t - mu.t) / mu.w) ** 2) * 2.5); if (g < .02) continue;
      rad.copy(v).addScaledVector(u, -t * L); const r = rad.length(); if (r < 1e-9) continue; rad.divideScalar(r);
      const cc = hasDir ? rad.dot(dp) : 1, lobe = mu.p < 1 ? (.5 + .5 * cc) ** (mu.p * 2) : Math.max(0, cc) ** mu.p;
      const w = smoothR(.25, .75, gate) * g * lobe; if (w < 1e-4) continue;
      moved.set(i, [rad.x * amp * w + u.x * shift * w, rad.y * amp * w + u.y * shift * w, rad.z * amp * w + u.z * shift * w]);
    }
    // how the normals turn: the faces round the moved points, measured moved and still
    const nrm = new Map();
    if (vf) {
      const {start, list} = vf, I = o.I, touch = new Set(), p0 = new V3(), p1 = new V3(), p2 = new V3(), e1 = new V3(), e2 = new V3(), n0 = new V3(), n1 = new V3();
      for (const i of moved.keys()) if (i < o.nFaced) for (let j = start[i]; j < start[i + 1]; j++) { const f = list[j]; touch.add(I[f * 3]); touch.add(I[f * 3 + 1]); touch.add(I[f * 3 + 2]); }
      const at = (i, off, out) => { out.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); if (off) { const d = moved.get(i); if (d) { out.x += d[0]; out.y += d[1]; out.z += d[2]; } } return out; };
      const fn = (f, off, acc) => { at(I[f * 3], off, p0); at(I[f * 3 + 1], off, p1); at(I[f * 3 + 2], off, p2); acc.add(e1.subVectors(p2, p1).cross(e2.subVectors(p0, p1))); };
      for (const i of touch) {
        n0.set(0, 0, 0); n1.set(0, 0, 0); for (let j = start[i]; j < start[i + 1]; j++) { fn(list[j], false, n0); fn(list[j], true, n1); }
        if (n0.lengthSq() < 1e-30 || n1.lengthSq() < 1e-30) continue;
        n1.normalize().sub(n0.normalize()); if (n1.lengthSq() > 1e-10) nrm.set(i, [n1.x, n1.y, n1.z]);
      }
    }
    const zero = [0, 0, 0];
    for (const [i, d] of moved) put(i, k, d, nrm.get(i) || zero);
    for (const [i, nn] of nrm) if (!moved.has(i)) put(i, k, zero, nn);
  });
  return {ids, dv, nv};
}
// packed into the four attributes the shader reads; slot: where the skeleton's activation bones start (x16)
function writeMuscleAttrs(g, field, n, slotBase, toGeo) {
  if (slotBase + MUSCLES.length + 2 > 4095) return;  // (a skeleton of more than 250 bones: no room for its ids)
  addMuscleAttrs(g, n);
  const A = MUSC_ATTRS.map(k => g.attributes[k].array), {ids, dv, nv} = field, d = new V3(), nn = new V3();
  const keep = g.userData.musc && g.userData.musc.n === n ? g.userData.musc : (g.userData.musc = {n, ids: new Uint16Array(n * 4), pk: new Float32Array(n * 24)}), S = keep.ids, pk = keep.pk;
  for (let i = 0; i < n; i++) {
    const o4 = i * 4;
    for (let s = 0; s < 4; s++) {
      const id = ids[o4 + s]; S[o4 + s] = id < 0 ? 0 : slotBase + id + 2;
      d.fromArray(dv, (o4 + s) * 3); nn.fromArray(nv, (o4 + s) * 3); if (toGeo) { d.applyMatrix3(toGeo); nn.applyMatrix3(toGeo); }
      const o = (o4 + s) * 6; pk[o] = d.x; pk[o + 1] = d.y; pk[o + 2] = d.z; pk[o + 3] = nn.x; pk[o + 4] = nn.y; pk[o + 5] = nn.z;
    }
    // ids two to a float; the largest movement and turn; the movements, then the turns, in 12-bit steps of those
    let sd = 0, sn = 0; for (let s = 0; s < 4; s++) { const o = (o4 + s) * 6; for (let c = 0; c < 3; c++) { sd = Math.max(sd, Math.abs(pk[o + c])); sn = Math.max(sn, Math.abs(pk[o + 3 + c])); } }
    const P0 = A[0], q = (v, sc) => sc > 0 ? clamp(Math.round((v / sc + 1) * 2047.5), 0, 4095) : 2048, two = (a, b) => a + b * 4096;
    P0[o4] = two(S[o4], S[o4 + 1]); P0[o4 + 1] = two(S[o4 + 2], S[o4 + 3]); P0[o4 + 2] = sd; P0[o4 + 3] = sn;
    const D = [], N = []; for (let s = 0; s < 4; s++) { const o = (o4 + s) * 6; D.push(q(pk[o], sd), q(pk[o + 1], sd), q(pk[o + 2], sd)); N.push(q(pk[o + 3], sn), q(pk[o + 4], sn), q(pk[o + 5], sn)); }
    for (let k = 0; k < 6; k++) { A[1 + (k >> 2)][o4 + (k & 3)] = two(D[k * 2], D[k * 2 + 1]); A[2 + ((k + 2) >> 2)][o4 + ((k + 2) & 3)] = two(N[k * 2], N[k * 2 + 1]); }
  }
  for (const k of MUSC_ATTRS) g.attributes[k].needsUpdate = true;
}

/* ---------- the figure (and the clothes hung on it) ---------- */
function computeMuscles(m) {
  if (!m.anchors || !m.J || !m.skeleton) return;
  const nV = FIG.meta.nV, nA = m.anchors.length / 3, J = m.J;
  const jp = n => FIG.jIdx[n] === undefined ? null : new V3(J[FIG.jIdx[n] * 3], J[FIG.jIdx[n] * 3 + 1], J[FIG.jIdx[n] * 3 + 2]);
  { const t0 = jp('toeL'), a0 = jp('ankleL'), k0 = jp('kneeL'); m._footRest = a0.clone().sub(k0).angleTo(t0.sub(a0)); }  // the rest angle of foot to shin
  // the bones of each muscle, and the skin weight on them, for body vertices and the helper points clothes hang on
  if (!FIG.muscGate) FIG.muscGate = MUSCLES.map(mu => new Set(mu.gate.map(g => FIG.jIdx[FIG.jIdx[g + mu.s] !== undefined ? g + mu.s : g]).filter(v => v !== undefined)));
  const gate = (i, k) => { const set = FIG.muscGate[k], body = i < nV, si = body ? FIG.si : FIG.hsi, sw = body ? FIG.sw : FIG.hsw, j = body ? i : i - nV; if (!si) return 0;
    let g = 0, t = 0; for (let c = 0; c < 4; c++) { const w = sw[j * 4 + c]; t += w; if (set.has(si[j * 4 + c])) g += w; } return t ? g / t : 0; };
  const joint = (n, s) => n === 'midShoulder' ? jp('shoulder' + (s || 'L')).setX(0).add(new V3(0, -.05 * m.size, .02 * m.size)) : jp(n + s) || jp(n);
  if (!FIG.muscCand) FIG.muscCand = [];
  m.musc = muscleField({P: m.anchors, n: nA, nFaced: nV, I: FIG.index, frame: {L: new V3(1, 0, 0), U: new V3(0, 1, 0), F: new V3(0, 0, 1)}, joint, gate, cand: FIG.muscCand, scale: m.size, amount: muscleAmount(m.body)});
  m.musc.slot = m.skeleton.bones.findIndex(b => b.name === '_musc') * 16;
  writeMuscleAttrs(m.geo, m.musc, nV, m.musc.slot, null);
  for (const gm of m.garments || []) garmentMuscles(m, gm);
}
// a garment's muscles: each of its vertices moves as the three body points it hangs on
function garmentMuscles(m, gm) {
  if (!m.musc || !gm.d || !gm.geo) return;
  const d = gm.d, n = d.n, R = d.refs, W = d.w, F = m.musc, ids = new Int16Array(n * 4).fill(-1), dv = new Float32Array(n * 12), nv = new Float32Array(n * 12), acc = new Map();
  for (let i = 0; i < n; i++) {
    acc.clear();
    for (let k = 0; k < 3; k++) { const r = R[i * 3 + k], w = W[i * 3 + k]; if (!w) continue;
      for (let s = 0; s < 4; s++) { const id = F.ids[r * 4 + s]; if (id < 0) continue; let e = acc.get(id); if (!e) acc.set(id, e = [0, 0, 0, 0, 0, 0]); for (let c = 0; c < 3; c++) { e[c] += F.dv[(r * 4 + s) * 3 + c] * w; e[c + 3] += F.nv[(r * 4 + s) * 3 + c] * w; } } }
    if (!acc.size) continue;
    [...acc].sort((x, y) => Math.hypot(y[1][0], y[1][1], y[1][2]) - Math.hypot(x[1][0], x[1][1], x[1][2])).slice(0, 4).forEach(([id, e], s) => {
      ids[i * 4 + s] = id; for (let c = 0; c < 3; c++) { dv[(i * 4 + s) * 3 + c] = e[c]; nv[(i * 4 + s) * 3 + c] = e[c + 3]; } });
  }
  writeMuscleAttrs(gm.geo, {ids, dv, nv}, n, F.slot, null);
}
function musclesAfterBuild(m) {
  if (m.noMuscles || !FIG.meta) return;
  computeMuscles(m);  // a few ms: it follows the body sliders as they move
}

/* ---------- imported avatars: the same muscles from their own skeleton and skin ---------- */
const AV_MUSC = {shoulder: 'UpperArm', elbow: 'LowerArm', wrist: 'Hand', hip: 'UpperLeg', knee: 'LowerLeg', ankle: 'Foot', toe: 'Toes'};
function avatarMuscles(m) {
  const av = m.avatar; if (!av || !av.map) return;
  const map = av.map, side = s => s === 'R' ? 'right' : 'left';
  const hbName = (n, s) => AV_MUSC[n] ? side(s) + AV_MUSC[n] : n === 'chest' ? (map.upperChest ? 'upperChest' : map.chest ? 'chest' : 'spine') : n === 'waist' ? (map.spine ? 'spine' : 'chest') : n;
  const skels = new Map();
  const meshes = []; av.root.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); });
  for (const o of meshes) {
    const g = o.geometry, n = g.attributes.position.count;
    if (!g.attributes.aMuscP0 && (Object.keys(g.attributes).length > 12 || n > 120000)) continue;  // no room for four more attributes, or too heavy
    let sk = skels.get(o.skeleton);
    if (!sk) {  // the skeleton with its activation bones (shared by the meshes and outlines that used it)
      const old = o.skeleton; sk = old.bones.some(b => b.name === '_musc') ? old : new THREE.Skeleton([...old.bones, ...muscleBones()], [...old.boneInverses, ...[...Array(MUSC_BONES)].map(() => new THREE.Matrix4())]);
      skels.set(old, sk); skels.set(sk, sk);
    }
    if (o.skeleton !== sk) o.bind(sk, o.bindMatrix);
    if (o.userData.isHull || g.attributes.aMuscP0) continue;  // outlines share the geometry of their mesh
    const part = sk.bones.map(bn => { let x = bn; while (x) { for (const [key, val] of Object.entries(map)) if (val === x) return key; x = x.parent; } return null; });
    const bindOf = bn => { const k = sk.bones.indexOf(bn); return k < 0 ? null : new V3().setFromMatrixPosition(new THREE.Matrix4().copy(sk.boneInverses[k]).invert()); };
    const J = (nm, s) => { const bn = map[hbName(nm, s)]; return bn ? bindOf(bn) : null; };
    const hl = J('hip', 'L'), hr = J('hip', 'R'), nk = J('neck') || J('head'), hp = J('hips'), ft = J('ankle', 'L'); if (!hl || !hr || !nk || !hp) continue;
    const L = hl.clone().sub(hr).normalize(), U = nk.clone().sub(hp); U.addScaledVector(L, -U.dot(L)).normalize(); const F = new V3().crossVectors(L, U);
    const hipH = ft ? Math.abs(hl.clone().add(hr).multiplyScalar(.5).sub(ft).dot(U)) : (m.rootY || .9), scale = hipH / (m.rootY || .9) * m.size;
    const joint = (nm, s) => { if (nm !== 'midShoulder') return J(nm, s); const sh = J('shoulder', s); if (!sh) return null; const c = hp.clone().add(nk).multiplyScalar(.5), t = sh.clone().sub(c); t.addScaledVector(L, -t.dot(L)); return c.add(t).addScaledVector(U, -.05 * scale / m.size); };
    const P = new Float32Array(n * 3), pos = g.attributes.position, v = new V3();
    for (let i = 0; i < n; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(o.bindMatrix); P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z; }
    const SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, gset = MUSCLES.map(mu => new Set(mu.gate.map(x => hbName(x, mu.s))));
    const comp = (a, i, c) => c === 0 ? a.getX(i) : c === 1 ? a.getY(i) : c === 2 ? a.getZ(i) : a.getW(i);
    const gate = (i, k) => { const set = gset[k]; let gg = 0, t = 0; for (let c = 0; c < 4; c++) { const w = comp(SW, i, c); t += w; if (set.has(part[comp(SI, i, c)])) gg += w; } return t ? gg / t : 0; };
    const field = muscleField({P, n, nFaced: n, I: g.index ? g.index.array : null, frame: {L, U, F}, joint, gate, cand: [], scale, amount: muscleAmount(m.body)});
    writeMuscleAttrs(g, field, n, sk.bones.findIndex(bn => bn.name === '_musc') * 16, new THREE.Matrix3().setFromMatrix4(o.bindMatrixInverse));
  }
  av.muscSkels = [...new Set(skels.values())];
}

/* ---------- reading the pose ---------- */
const _mv3 = new V3();
function muscleDrives(m) {
  const J = m.joints, wp = (o, v) => o.getWorldPosition(v), ang = (a, b) => a.angleTo(b), out = {};
  const hipsQ = J.hips.getWorldQuaternion(new Q()), chestQ = J.chest.getWorldQuaternion(new Q()), chestI = chestQ.clone().invert(), hipsI = hipsQ.clone().invert();
  for (const s of ['L', 'R']) {
    const sh = wp(J['shoulder' + s], new V3()), el = wp(J['elbow' + s], new V3()), wr = wp(J['wrist' + s], new V3());
    const hp = wp(J['hip' + s], new V3()), kn = wp(J['knee' + s], new V3()), an = wp(J['ankle' + s], new V3());
    const up = el.clone().sub(sh), fo = wr.clone().sub(el), th = kn.clone().sub(hp), shin = an.clone().sub(kn);
    const elbow = ang(up, fo), knee = ang(th, shin), side = s === 'L' ? 1 : -1;
    const arm = up.clone().normalize().applyQuaternion(chestI), raise = Math.acos(clamp(-arm.y, -1, 1));
    const leg = th.clone().normalize().applyQuaternion(hipsI), ext = Math.atan2(-leg.z, -leg.y), flex = Math.atan2(leg.z, -leg.y);
    const curls = m.hands && m.hands[s] ? m.hands[s].c.reduce((a, b) => a + b, 0) / 5 : .25;
    // the foot against the shin: pointing the toes brings it in line with the shin
    const i = FIG.jIdx['ankle' + s], t = FIG.jIdx['toe' + s], T = m.J, foot = J['ankle' + s].localToWorld(_mv3.set(T[t * 3] - T[i * 3], T[t * 3 + 1] - T[i * 3 + 1], T[t * 3 + 2] - T[i * 3 + 2])).sub(an);
    const ankle = ang(shin, foot), rest = m._footRest || 1.75;
    const e = smoothR(.25, 2.3, elbow), k = smoothR(.3, 2.2, knee), deep = smoothR(1.6, 2.5, knee);
    out['elbow' + s] = e; out['knee' + s] = k; out['deepKnee' + s] = deep;
    out['forearm' + s] = clamp(e * .55 + smoothR(.35, .85, curls) * .7, 0, 1);
    out['raise' + s] = smoothR(.9, 2.4, raise); out['shrug' + s] = smoothR(1.7, 2.7, raise);
    out['pec' + s] = clamp(smoothR(0, .9, arm.z) * (1 - smoothR(.2, .9, arm.y)) + smoothR(.05, .6, -arm.x * side) * .8, 0, 1);
    out['glute' + s] = smoothR(.05, .5, ext); out['quad' + s] = smoothR(.4, 1.4, flex) * (1 - k);
    out['calf' + s] = Math.max(smoothR(.1, .8, rest - ankle), deep * .6);
  }
  const cu = new V3(0, 1, 0).applyQuaternion(chestQ).applyQuaternion(hipsI), fwd = Math.atan2(cu.z, cu.y), lat = Math.atan2(cu.x, cu.y);
  out.crunch = smoothR(.15, .8, fwd); out.sideL = smoothR(.12, .6, lat); out.sideR = smoothR(.12, .6, -lat);
  const hf = new V3(0, 0, 1).applyQuaternion(J.head.getWorldQuaternion(new Q())).applyQuaternion(chestI), yaw = Math.atan2(hf.x, hf.z);
  out.scmR = smoothR(.25, 1.1, yaw); out.scmL = smoothR(.25, 1.1, -yaw);  // turning to the left works the right one
  return out;
}
// how much each muscle works now, into the activation bones of every skeleton that wears them
function applyMuscles(m, gain = m.body.flex ?? 1) {
  if (!m.skeleton || m.noMuscles) return;
  m.group.updateMatrixWorld(true);
  const d = gain ? muscleDrives(m) : null, vals = MUSCLES.map(mu => d ? (d[mu.drv + mu.s] ?? d[mu.drv] ?? 0) * gain : 0);
  for (const sk of [m.skeleton, ...(m.avatar && m.avatar.muscSkels || [])]) {
    let j = 0; for (const b of sk.bones) if (b.name === '_musc') { const e = b.matrixWorld.elements; for (let k = 0; k < 16; k++) e[k] = vals[j * 16 + k] || 0; j++; }
  }
  m._muscVals = vals;
}
function muscleTick() { for (const m of chars) applyMuscles(m, m.formMode === 'figura' ? (m.body.flex ?? 1) : 0); }
