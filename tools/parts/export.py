# Bake a sculpted part for the app: decimate in Blender, weight to the canonical bones, pack like the sculpted heads
# (gzip + base64 text: a 4-byte header length, a JSON header, then the arrays).
#   bvenv/bin/python export.py part.npz out.txt [skin_faces] [claw_faces]
# Bones (canonical, names as in the app's rig without the side letter): 'wrist', 'f00'..'f42'. Every vertex: up to four
# (bone, weight); kind 0 fur, 2 leather (pads), 3 keratin (claws).
import sys, json, gzip, base64, struct, numpy as np, bpy

npz, out = sys.argv[1], sys.argv[2]
NS = int(sys.argv[3]) if len(sys.argv) > 3 else 9000; NC = int(sys.argv[4]) if len(sys.argv) > 4 else 2400
D = np.load(npz); FOOT = 'J0' not in D; J = {} if FOOT else {f: D[f'J{f}'] for f in range(5)}

def decimate(V, F, target, attr=None):
    """Even quads (QuadriFlow) at about `target` triangles; a per-vertex value comes across from the nearest source vertex."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    me = bpy.data.meshes.new('m'); me.vertices.add(len(V)); me.vertices.foreach_set('co', V.astype(np.float32).ravel())
    me.loops.add(F.size); me.loops.foreach_set('vertex_index', F.astype(np.int32).ravel())
    me.polygons.add(len(F)); me.polygons.foreach_set('loop_start', np.arange(0, F.size, 3, dtype=np.int32)); me.polygons.foreach_set('loop_total', np.full(len(F), 3, np.int32))
    me.update(); me.validate()
    ob = bpy.data.objects.new('m', me); bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob; ob.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.remove_doubles(threshold=1e-5); bpy.ops.object.mode_set(mode='OBJECT')
    # voxel remesh (watertight, even), then collapse to the budget; QuadriFlow lost whole skins on some parts
    m = ob.modifiers.new('rm', 'REMESH'); m.mode = 'VOXEL'; m.voxel_size = float(np.ptp(V, 0).max()) / 160; m.use_smooth_shade = True
    bpy.ops.object.modifier_apply(modifier='rm')
    d = ob.modifiers.new('dec', 'DECIMATE'); d.ratio = min(1, target / max(1, len(ob.data.polygons) * (1 if ob.data.polygons[0].loop_total == 3 else 2))); d.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier='dec')
    s = ob.modifiers.new('sm', 'CORRECTIVE_SMOOTH'); s.factor = .35; s.iterations = 3; s.use_only_smooth = True; bpy.ops.object.modifier_apply(modifier='sm')
    m2 = ob.data; m2.calc_loop_triangles()
    V2 = np.empty(len(m2.vertices) * 3, np.float32); m2.vertices.foreach_get('co', V2); V2 = V2.reshape(-1, 3)
    F2 = np.empty(len(m2.loop_triangles) * 3, np.int32); m2.loop_triangles.foreach_get('vertices', F2); F2 = F2.reshape(-1, 3)
    A2 = None
    if attr is not None:
        from mathutils.kdtree import KDTree
        kd = KDTree(len(V)); [kd.insert(v, i) for i, v in enumerate(V.tolist())]; kd.balance()
        A2 = np.array([attr[kd.find(v)[1]] for v in V2.tolist()], np.float32)
    return V2, F2, A2

def seg_param(p, a, b):
    ab = b - a; t = np.clip(((p - a) @ ab) / (ab @ ab), 0, 1); q = a + t[:, None] * ab; return t, np.linalg.norm(p - q, axis=1)

BONES = ['wrist'] + [f'f{f}{k}' for f in range(5) for k in range(3)]
def weights(V, claws=False):
    """Per vertex: the finger it belongs to (nearest of the five chains, or the palm), then its bones along that chain,
    blended over a short window across each joint; the palm's bone (wrist) blends into each knuckle the same way."""
    n = len(V); W = np.zeros((n, len(BONES)), np.float32)
    # distance to each finger's chain (joint 0 → tip), and to the palm
    best, bestd = np.full(n, -1), np.full(n, np.inf)
    for f in range(5):
        P = J[f]; dmin = np.full(n, np.inf)
        for k in range(3): _, dd = seg_param(V, P[k], P[k + 1]); dmin = np.minimum(dmin, dd)
        # (the thumb's first bone sits inside the palm: count it only past half way to its knuckle)
        if f == 0: t, dd = seg_param(V, P[0], P[1]); dmin = np.where(t < .5, np.inf, dmin)
        closer = dmin < bestd; best[closer] = f; bestd[closer] = dmin[closer]
    palm_c = np.array([0, .3, 0], np.float32)
    for i_f in range(5):
        P = J[i_f]; sel = best == i_f
        if not sel.any(): continue
        p = V[sel]; Wf = np.zeros((sel.sum(), len(BONES)), np.float32)
        # position along the chain as a continuous joint index s (0 at joint 0 … 3 at the tip)
        s = np.zeros(len(p), np.float32); dmin = np.full(len(p), np.inf)
        for k in range(3):
            t, dd = seg_param(p, P[k], P[k + 1]); c = dd < dmin; s[c] = (k + t)[c]; dmin[c] = dd[c]
        win = .18 if not claws else 0
        for k in range(3):  # bone k owns s in [k, k+1], blended ± win round each joint
            lo = k - win; hi = k + 1 + win
            w = np.clip((s - lo) / (2 * win + 1e-6), 0, 1) if k > 0 else np.ones(len(p))
            w = w * (np.clip((hi - s) / (2 * win + 1e-6), 0, 1) if k < 2 else 1)
            Wf[:, 1 + i_f * 3 + k] = w
        if claws: Wf[:] = 0; Wf[:, 1 + i_f * 3 + 2] = 1
        else:
            # before the first joint (the knuckle), the palm takes over, smoothly
            pre = np.clip((.25 - s) / .5, 0, 1) if i_f else np.clip((.55 - s) / .55, 0, 1)
            Wf *= (1 - pre)[:, None]; Wf[:, 0] += pre
        W[sel] = Wf
    W[best < 0, 0] = 1
    # vertices of the palm far from every chain (its heel, the forearm stub): the wrist's alone
    far = bestd > .12
    if not claws: W[far] = 0; W[far, 0] = 1
    W /= np.maximum(W.sum(1, keepdims=True), 1e-6)
    # four strongest
    idx = np.argsort(-W, 1)[:, :4]; w4 = np.take_along_axis(W, idx, 1); w4 /= np.maximum(w4.sum(1, keepdims=True), 1e-6)
    return idx.astype(np.uint8), np.round(w4 * 255).astype(np.uint8)

V, F, K = decimate(D['V'], D['F'], NS, D['kind'].astype(np.float32))
kind = (K > 1).astype(np.uint8) * 2 if K is not None else np.zeros(len(V), np.uint8)
CV, CF, _ = decimate(D['CV'], D['CF'], NC) if len(D['CV']) else (np.zeros((0, 3), np.float32), np.zeros((0, 3), np.int32), None)
if FOOT:  # rigid on the ankle
    BONES = ['ankle']; SI = np.zeros((len(V), 4), np.uint8); SW = np.zeros((len(V), 4), np.uint8); SW[:, 0] = 255
    CSI = np.zeros((len(CV), 4), np.uint8); CSW = np.zeros((len(CV), 4), np.uint8); CSW[:, 0] = 255
else: SI, SW = weights(V); CSI, CSW = weights(CV, claws=True)
Vall = np.concatenate([V, CV]).astype(np.float32); Fall = np.concatenate([F, CF + len(V)]).astype(np.uint32)
kall = np.concatenate([kind, np.full(len(CV), 3, np.uint8)]); SIall = np.concatenate([SI, CSI]); SWall = np.concatenate([SW, CSW])
big = len(Vall) > 65535
arrs = [Vall.tobytes(), (Fall if big else Fall.astype(np.uint16)).tobytes(), kall.tobytes(), SIall.tobytes(), SWall.tobytes()]
offs = []; o = 0
for a in arrs: offs.append(o); o += len(a) + (-len(a)) % 4
meta = {'n': len(Vall), 'nt': len(Fall), 'big': big, 'offs': offs, 'bones': BONES, 'J': {str(f): J[f].round(5).tolist() for f in J}}
if FOOT: meta['Fw'] = float(D['Fw']) if 'Fw' in D else .85
head = json.dumps(meta).encode()
head += b' ' * ((-len(head)) % 4)
body = b''.join(a + b'\0' * ((-len(a)) % 4) for a in arrs)
raw = struct.pack('<I', len(head)) + head + body
open(out, 'w').write(base64.b64encode(gzip.compress(raw, 9)).decode())
print(f'{out}: {len(V)} skin + {len(CV)} claw vertices, {len(Fall)} triangles, {len(raw) // 1024} kB raw, {len(open(out).read()) // 1024} kB text')
np.savez_compressed(out.replace('.txt', '.low.npz'), V=V, F=F, kind=kind, CV=CV, CF=CF, SI=SI, SW=SW, **{f'J{f}': J[f] for f in J})
