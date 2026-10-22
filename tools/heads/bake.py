# Bake our sculpted heads (head.py) into the head-swap format (11-heads.js): the skin decimated in Blender to its budget,
# the eyeballs as spheres of their own (part 2, painted by the app), ear weights, landmarks; and their catalog entry.
#   python bake.py [id ...]        (needs numpy, scipy, scikit-image and bpy)
import os, sys, json, gzip, base64, struct, numpy as np, bpy
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import head as HD
OUT = os.path.join(HERE, '..', '..', 'app', 'heads')

# id: species it is the head of (the first names its mouth and eyes), label, style, size against the body's head
CATALOG = {
  'lobo':     dict(species=['lobo'], label='Lobo', style='real', scale=1.15),
  'perro':    dict(species=['perro'], label='Perro', style='real', scale=1.15),
  'zorro':    dict(species=['zorro'], label='Zorro', style='real', scale=1.12),
  'coyote':   dict(species=['coyote'], label='Coyote', style='real', scale=1.12),
  'hiena':    dict(species=['hiena'], label='Hiena', style='real', scale=1.15),
  'gato':     dict(species=['gato'], label='Gato', style='real', scale=1.1),
  'tigre':    dict(species=['tigre'], label='Tigre', style='real', scale=1.18),
  'leon':     dict(species=['leon'], label='León', style='real', scale=1.2),
  'leopardo': dict(species=['leopardo'], label='Leopardo de las nieves', style='real', scale=1.12),
  'oso':      dict(species=['oso'], label='Oso', style='real', scale=1.2),
  'mapache':  dict(species=['mapache'], label='Mapache', style='real', scale=1.08),
  'panda':    dict(species=['panda'], label='Panda rojo', style='real', scale=1.08),
  'mofeta':   dict(species=['mofeta'], label='Mofeta', style='real', scale=1.05),
  'conejo':   dict(species=['conejo'], label='Conejo', style='real', scale=1.05),
  'cabra':    dict(species=['cabra'], label='Cabra', style='real', scale=1.12),
  'ciervo':   dict(species=['ciervo'], label='Ciervo', style='real', scale=1.12),
  'caballo':  dict(species=['caballo'], label='Caballo', style='real', scale=1.1),
  'dragon':   dict(species=['dragon'], label='Dragón', style='real', scale=1.15),
  'zorro_k':  dict(species=['zorro', 'lobo', 'perro'], label='Zorro (kemono)', style='kemono', scale=1.0),
}

def decimate(V, F, target, attr=None, keep=None):
    """V, F decimated to about target triangles, smoothed a little; attr carried to the new vertices; keep(P): 0 where
    the mesh keeps its full detail (the lip line, which the app cuts along), 1 where it may be thinned."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    me = bpy.data.meshes.new('m'); me.vertices.add(len(V)); me.vertices.foreach_set('co', V.astype(np.float32).ravel())
    me.loops.add(F.size); me.loops.foreach_set('vertex_index', F.astype(np.int32).ravel())
    me.polygons.add(len(F)); me.polygons.foreach_set('loop_start', np.arange(0, F.size, 3, dtype=np.int32)); me.polygons.foreach_set('loop_total', np.full(len(F), 3, np.int32))
    me.update(); me.validate()
    ob = bpy.data.objects.new('m', me); bpy.context.scene.collection.objects.link(ob); bpy.context.view_layer.objects.active = ob; ob.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.remove_doubles(threshold=1e-5); bpy.ops.object.mode_set(mode='OBJECT')
    d = ob.modifiers.new('dec', 'DECIMATE'); d.ratio = min(1, target / max(1, len(ob.data.polygons))); d.use_collapse_triangulate = True
    if keep is not None:
        co = np.empty(len(ob.data.vertices) * 3, np.float32); ob.data.vertices.foreach_get('co', co); w = np.round(keep(co.reshape(-1, 3)), 2)
        vg = ob.vertex_groups.new(name='thin')
        for val in np.unique(w): vg.add(np.nonzero(w == val)[0].tolist(), float(val), 'REPLACE')
        d.vertex_group = 'thin'; d.vertex_group_factor = 1.
    bpy.ops.object.modifier_apply(modifier='dec')
    s = ob.modifiers.new('sm', 'CORRECTIVE_SMOOTH'); s.factor = .3; s.iterations = 2; s.use_only_smooth = True; bpy.ops.object.modifier_apply(modifier='sm')
    m2 = ob.data; m2.calc_loop_triangles()
    V2 = np.empty(len(m2.vertices) * 3, np.float32); m2.vertices.foreach_get('co', V2); V2 = V2.reshape(-1, 3)
    F2 = np.empty(len(m2.loop_triangles) * 3, np.int32); m2.loop_triangles.foreach_get('vertices', F2); F2 = F2.reshape(-1, 3)
    A2 = None
    if attr is not None:
        from mathutils.kdtree import KDTree
        kd = KDTree(len(V)); [kd.insert(v, i) for i, v in enumerate(V.tolist())]; kd.balance()
        A2 = np.array([attr[kd.find(v)[1]] for v in V2.tolist()], np.float32)
    return V2, F2, A2

def icosphere(c, r, sub=3):
    t = (1 + 5 ** .5) / 2
    V = [(-1, t, 0), (1, t, 0), (-1, -t, 0), (1, -t, 0), (0, -1, t), (0, 1, t), (0, -1, -t), (0, 1, -t), (t, 0, -1), (t, 0, 1), (-t, 0, -1), (-t, 0, 1)]
    F = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6), (7, 1, 8), (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1)]
    V = [np.array(v, float) / np.linalg.norm(v) for v in V]
    for _ in range(sub):
        mid = {}; F2 = []
        def m(a, b):
            k = (min(a, b), max(a, b))
            if k not in mid: v = V[a] + V[b]; V.append(v / np.linalg.norm(v)); mid[k] = len(V) - 1
            return mid[k]
        for a, b, cc in F: ab, bc, ca = m(a, b), m(b, cc), m(cc, a); F2 += [(a, ab, ca), (b, bc, ab), (cc, ca, bc), (ab, bc, ca)]
        F = F2
    return np.array(V) * r + c, np.array(F, np.int32)

def bake(hid, step=.006, budget=24000):
    cfg = CATALOG[hid]; m = HD.build(cfg.get('head', hid), step)
    my, hz = m['L']['mouthY'], m['L']['hingeZ']
    V, F, ear = decimate(m['V'], m['F'], budget, m['ear'], keep=lambda P: np.where((np.abs(P[:, 1] - my) < .015) & (P[:, 2] > hz - .05), 0., 1.))
    EV, EF = [], []
    for c, r in m['eyes']:
        v, f = icosphere(np.asarray(c, float), r); EF.append(f + len(V) + sum(len(x) for x in EV)); EV.append(v)
    # horns (part 3: rigid, on the skull), decimated apart
    HV, HF = (decimate(m['HV'], m['HF'], 3000)[:2] if len(m['HV']) else (np.zeros((0, 3), np.float32), np.zeros((0, 3), np.int32)))
    ne = sum(len(x) for x in EV)
    P = np.concatenate([V, *EV, HV]).astype(np.float32); I = np.concatenate([F, *EF, HF + len(V) + ne]).astype(np.int32)
    K = np.concatenate([np.zeros(len(V), np.uint8), np.full(ne, 2, np.uint8), np.full(len(HV), 3, np.uint8)])
    E = np.concatenate([np.round(np.clip(ear, 0, 1) * 255), np.zeros(ne + len(HV))]).astype(np.uint8)
    n = len(P); big = n > 65535
    arrs = [P.tobytes(), (I.astype(np.uint32) if big else I.astype(np.uint16)).tobytes(), K.tobytes(), E.tobytes(), np.zeros(n, np.uint8).tobytes(), np.ones(n, np.int8).tobytes()]
    blob = b''; offs = []
    for a in arrs: offs.append(len(blob)); blob += a + b'\0' * ((4 - len(a) % 4) % 4)
    hdr = json.dumps({'n': n, 'nt': len(I), 'big': big, 'offs': offs, 'L': m['L']}).encode(); hdr += b' ' * ((4 - len(hdr) % 4) % 4)
    data = struct.pack('<I', len(hdr)) + hdr + blob
    open(f'{OUT}/{hid}.txt', 'w').write(base64.b64encode(gzip.compress(data, 9)).decode())
    print(hid, 'verts', n, 'tris', len(I), 'kB', os.path.getsize(f'{OUT}/{hid}.txt') // 1024, 'ear verts', int((E > 128).sum()))
    np.savez_compressed(os.path.join(HERE, '.out', f'{hid}.low.npz'), V=P, F=I[K[I].max(1) == 0], TV=P, TF=I[K[I].min(1) == 2], ear=E, K=K, L=json.dumps(m['L']))
    return {'label': cfg['label'], 'author': 'NEOPOSE', 'species': cfg['species'], 'style': cfg['style'], 'scale': cfg['scale'], 'eyes': True}

if __name__ == '__main__':
    # bake.py [id ...]: bake those heads (all by default), each one's catalog entry in .out/<id>.cat.json (so several can
    # run at once); bake.py --catalog: the catalog from those entries, in CATALOG's order
    os.makedirs(os.path.join(HERE, '.out'), exist_ok=True)
    if sys.argv[1:] != ['--catalog']:
        for hid in sys.argv[1:] or list(CATALOG): json.dump(bake(hid), open(os.path.join(HERE, '.out', f'{hid}.cat.json'), 'w'))
    if sys.argv[1:] in (['--catalog'], []):
        cat = {k: json.load(open(os.path.join(HERE, '.out', f'{k}.cat.json'))) for k in CATALOG if os.path.exists(os.path.join(HERE, '.out', f'{k}.cat.json'))}
        json.dump(cat, open(f'{OUT}/catalog.json', 'w'), ensure_ascii=False, indent=1); print('catalog', list(cat))
