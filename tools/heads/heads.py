# Bake sculpted anthro heads (Sketchfab, CC-BY) into compact files for the head-swap system.
# Coordinates are normalised: origin = midpoint of the eyes, unit = head height (crown to chin), +y up, +z forward.
# Per vertex: part (0 skin, 1 ear mesh, 2 eye mesh, 3 rigid extra: horns, hair), ear weight, jaw weight, lip side.
import json, os, sys, struct, base64, gzip
import numpy as np, trimesh, fast_simplification

D = '/home/pmirall/Documentos/claude/DownloadedModels/'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'app', 'heads'); os.makedirs(OUT, exist_ok=True)

def sst(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)

HEADS = json.load(open(os.path.join(os.path.dirname(__file__), 'heads.json')))

def load(cfg):
    sc = trimesh.load(D + cfg['file'], force='scene')
    R = trimesh.transformations.rotation_matrix(np.radians(cfg.get('yaw', 0)), [0, 1, 0])
    parts = []
    for node in sc.graph.nodes_geometry:
        T, gname = sc.graph[node]
        if cfg.get('include') and node not in cfg['include']: continue
        if node in cfg.get('exclude', []): continue
        g = sc.geometry[gname]
        if not isinstance(g, trimesh.Trimesh) or len(g.faces) == 0: continue
        v = trimesh.transform_points(g.vertices, R @ T)
        kind = 1 if node in cfg.get('ears', []) else 2 if node in cfg.get('eyes', []) else 3 if node in cfg.get('extras', []) else 0
        f = np.asarray(g.faces)
        if node in cfg.get('dropCentre', []):  # a piece sharing the mesh with the ears (a hat): drop the separate parts on the centre line
            comp = trimesh.graph.connected_components(trimesh.Trimesh(v, f, process=False).face_adjacency, nodes=np.arange(len(f)), min_len=1)
            keep = np.ones(len(f), bool)
            for cf in comp:
                cx = v[np.unique(f[cf])][:, 0]
                if abs((cx.min() + cx.max()) / 2) < .15 * (v[:, 0].max() - v[:, 0].min()): keep[cf] = False
            f = f[keep]
        parts.append((v, f, kind))
    return parts

def process(name, cfg):
    parts = load(cfg)
    cut = cfg['cutY']
    V, F, K = [], [], []
    cutp = []
    for v, f, k in parts:
        # drop everything below the cut (with a margin, the runtime crops exactly)
        keep = (v[f][:, :, 1] > cut).any(1)
        f = f[keep]
        if not len(f): continue
        used = np.unique(f); remap = -np.ones(len(v), int); remap[used] = np.arange(len(used))
        cutp.append((v[used], remap[f], k))
    total = sum(len(p[0]) for p in cutp)
    for v2, f2, k in cutp:
        # decimate heavy parts
        target = cfg.get('budget', 14000) * (len(v2) / max(1, total))
        if len(v2) > target * 1.3 and len(f2) > 200:
            red = 1 - target / len(v2)
            v2, f2 = fast_simplification.simplify(v2.astype(np.float32), f2.astype(np.int32), target_reduction=min(.995, red))
        v2 = np.asarray(v2, float); f2 = np.asarray(f2)
        # winding: faces should point away from the part's centre (some parts come inside out)
        tri = v2[f2]; nrm = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]); ctr = tri.mean(1) - v2.mean(0)
        if (np.einsum('ij,ij->i', nrm, ctr) < 0).mean() > .5: f2 = f2[:, ::-1]
        if k in (1, 3):  # thin sheets (ears, hair, frills): give them a back side of their own
            vn = trimesh.Trimesh(v2, f2, process=False).vertex_normals
            eps = 2e-3 * (cfg['crownY'] - cfg['chinY'])
            f2 = np.concatenate([f2, f2[:, ::-1] + len(v2)]); v2 = np.concatenate([v2, v2 - vn * eps])
        F.append(f2 + sum(len(x) for x in V)); V.append(v2); K.append(np.full(len(v2), k, np.uint8))
    V = np.concatenate(V).astype(np.float64); F = np.concatenate(F); K = np.concatenate(K)
    # weld coincident vertices of the same part (decimation keeps them apart otherwise)
    m = trimesh.Trimesh(V, F, process=False)
    if not cfg.get('noweld'): m.merge_vertices(digits_vertex=6)
    # trimesh merge drops our per-vertex kinds: recover them by nearest original vertex
    from scipy.spatial import cKDTree
    _, nn = cKDTree(V).query(m.vertices); K = K[nn]; V = np.asarray(m.vertices); F = np.asarray(m.faces)
    eyeL, eyeR = np.array(cfg['eyeL'], float), np.array(cfg.get('eyeR', [-cfg['eyeL'][0], *cfg['eyeL'][1:]]), float)
    if cfg.get('eyes'):  # eye meshes: their centres are the eyes
        for s, arr in ((1, 'L'), (-1, 'R')):
            sel = (K == 2) & (np.sign(V[:, 0]) == s)
            if sel.sum(): c = V[sel].mean(0); (eyeL if s > 0 else eyeR)[:] = c
    O = (eyeL + eyeR) / 2; H = cfg['crownY'] - cfg['chinY']
    P = (V - O) / H
    # ears: separate meshes, or a region above a base point along an axis
    ear = (K == 1).astype(float)
    if 'earBase' in cfg:
        b = np.array(cfg['earBase'], float); ax = np.array(cfg.get('earAxis', [.3, 1, 0]), float); ax /= np.linalg.norm(ax)
        for s in (1, -1):
            bb = b * [s, 1, 1]; aa = ax * [s, 1, 1]; d = V - bb; along = d @ aa; lat = np.linalg.norm(d - np.outer(along, aa), axis=1)
            w = sst(-.02 * H, cfg.get('earFade', .1) * H, along) * (1 - sst(cfg['earR'] * H * .8, cfg['earR'] * H * 1.2, lat)) * (np.sign(V[:, 0]) == s)
            ear = np.maximum(ear, w * (K == 0))
    # jaw: below the mouth line, in front of the hinge; lip side marks the seam the open mouth splits along
    mY, hz = cfg['mouthY'], cfg['hingeZ']
    front = sst(hz, hz + .08 * H, V[:, 2]) * (K != 1) * (K != 2)
    jaw = sst(mY + .005 * H, mY - .03 * H, V[:, 1]) * front * (V[:, 1] > cfg['chinY'] - .25 * H)
    lip = np.where((V[:, 1] < mY - .002 * H) & (front > .04) & (V[:, 1] > cfg['chinY'] - .25 * H), -1, 1).astype(np.int8)
    # landmarks (normalised)
    skin = (K == 0) & (ear < .1)
    near = skin & (np.abs(V[:, 0]) < .03 * H) & (V[:, 1] > mY)
    tip = V[near][np.argmax(V[near][:, 2])] if near.any() else O + [0, 0, .3 * H]
    neckBand = skin & (np.abs(V[:, 1] - cfg['neckY']) < .04 * H)
    nc = V[neckBand].mean(0) if neckBand.any() else np.array([0, cfg['neckY'], 0])
    L = {'eyeL': ((eyeL - O) / H).tolist(), 'eyeR': ((eyeR - O) / H).tolist(), 'tip': ((tip - O) / H).tolist(), 'mouthY': (mY - O[1]) / H,
         'hingeZ': (hz - O[2]) / H, 'chin': (cfg['chinY'] - O[1]) / H, 'crown': (cfg['crownY'] - O[1]) / H,
         'neck': ((nc - O) / H).tolist(), 'eyeR_': cfg.get('eyeRad', .07)}
    n = len(P); big = n > 65535
    arrs = [P.astype(np.float32).tobytes(), (F.astype(np.uint32) if big else F.astype(np.uint16)).tobytes(), K.tobytes(),
            np.round(ear * 255).astype(np.uint8).tobytes(), np.round(np.clip(jaw, 0, 1) * 255).astype(np.uint8).tobytes(), lip.tobytes()]
    blob = b''; offs = []
    for a in arrs: offs.append(len(blob)); blob += a + b'\0' * ((4 - len(a) % 4) % 4)
    hdr = {'n': n, 'nt': len(F), 'big': big, 'offs': offs, 'L': L}
    hj = json.dumps(hdr).encode(); hj += b' ' * ((4 - len(hj) % 4) % 4)
    data = struct.pack('<I', len(hj)) + hj + blob
    open(f'{OUT}/{name}.txt', 'w').write(base64.b64encode(gzip.compress(data, 9)).decode())
    print(name, 'verts', n, 'tris', len(F), 'kB', os.path.getsize(f'{OUT}/{name}.txt') // 1024, 'ear verts', int((ear > .5).sum()), 'jaw', int((jaw > .5).sum()))
    return {**{k: cfg[k] for k in ('label', 'author', 'url', 'species', 'style', 'scale') if k in cfg}, 'eyes': bool(cfg.get('eyes'))}

if __name__ == '__main__':
    only = sys.argv[1:]
    cat = {}
    for name, cfg in HEADS.items():
        if only and name not in only: continue
        cat[name] = process(name, cfg)
    old = json.load(open(f'{OUT}/catalog.json')) if os.path.exists(f'{OUT}/catalog.json') and only else {}
    old.update(cat); json.dump(old, open(f'{OUT}/catalog.json', 'w'), ensure_ascii=False, indent=0)
