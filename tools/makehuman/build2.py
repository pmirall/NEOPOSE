# Bake the MakeHuman (CC0) base mesh into a compact rig for Cuaderno de Poses:
# arms rotated from A-pose to hanging, MakeHuman bones merged into the app's 47 bones,
# macro morphs (gender, muscle, weight, ideal proportions, height) stored as quantized deltas.
import numpy as np, json, struct

SCALE = 0.1  # decimetres -> metres

V = []; F = {}; g = None
for l in open('base.obj'):
    if l.startswith('v '): V.append([float(x) for x in l.split()[1:4]])
    elif l.startswith('g '): g = l.split()[1]
    elif l.startswith('f '): F.setdefault(g, []).append([int(p.split('/')[0]) - 1 for p in l.split()[1:]])
V0 = np.array(V)

def target(name):
    d = np.zeros_like(V0)
    for l in open(name if '/' in name else 't/' + name):
        if l[:1].isdigit():
            i, x, y, z = l.split(); d[int(i)] = [float(x), float(y), float(z)]
    return d

skel = json.load(open('default.mhskel'))
B = skel['bones']; JNT = skel['joints']
def jpos(Vf, key): return Vf[JNT[key]].mean(0)
def head(Vf, b): return jpos(Vf, B[b]['head'])
def tail(Vf, b): return jpos(Vf, B[b]['tail'])

W = json.load(open('default_weights.mhw'))['weights']

# ---- app bones ----
APP = []  # (name, mh source bone, parent name)
APP += [('hips', 'root', None), ('waist', 'spine04', 'hips'), ('chest', 'spine02', 'waist'), ('neck', 'neck01', 'chest'), ('head', 'head', 'neck')]
for s in 'LR':
    APP += [('shoulder' + s, 'upperarm01.' + s, 'chest'), ('elbow' + s, 'lowerarm01.' + s, 'shoulder' + s), ('wrist' + s, 'wrist.' + s, 'elbow' + s)]
    for f in range(5):
        for k in range(3):
            APP.append((f'f{s}{f}{k}', f'finger{f+1}-{k+1}.{s}', 'wrist' + s if k == 0 else f'f{s}{f}{k-1}'))
    APP += [('hip' + s, 'upperleg01.' + s, 'hips'), ('knee' + s, 'lowerleg01.' + s, 'hip' + s), ('ankle' + s, 'foot.' + s, 'knee' + s)]
APP += [('jaw', 'jaw', 'head')]  # lower jaw, lower lip and tongue: the mouth opens
names = [a[0] for a in APP]
src2app = {a[1]: i for i, a in enumerate(APP)}
def app_of(mhb):
    b = mhb
    while b is not None:
        if b in src2app: return src2app[b]
        b = B[b]['parent']
    raise Exception(mhb)

# extra points: fingertips + toe tip, used for axes
EXTRA = []
for s in 'LR':
    for f in range(5): EXTRA.append((f'tip{s}{f}', ('tail', f'finger{f+1}-3.{s}')))
    EXTRA.append((f'toe{s}', ('tail', f'foot.{s}')))

# ---- clothes (MakeHuman CC0 assets): parsed first, their reference vertices outside the body become helper anchors ----
import os, gzip, sys
from mhclo import parse_mhclo, parse_obj, parse_mhmat
ASSETS = '../mhassets'
ITEMS = json.load(open(ASSETS + '/items.json'))
CLO = []
for it in ITEMS:
    try:
        m = parse_mhclo(os.path.join(ASSETS, it['mhclo'])); Vc, VTc, Fc = parse_obj(os.path.join(ASSETS, it['obj']))
    except Exception as e: print('skip', it['id'], e); continue
    if len(m['verts']) != len(Vc) or not Fc or len(m['scale']) < 3: print('skip', it['id'], len(m['verts']), len(Vc)); continue
    CLO.append((it, m, VTc, Fc))
print('clothes', len(CLO))

# ---- mesh subset ----
groups = ['body', 'helper-l-eye', 'helper-r-eye']
quads = [(gname, q) for gname in groups for q in F[gname]]
used = sorted({i for _, q in quads for i in q})
remap = {v: i for i, v in enumerate(used)}
tris = []
for _, q in quads:
    a, b, c, d = [remap[i] for i in q]
    tris += [a, b, c, a, c, d]
usedset = set(used)
hset = set()
for it, m, VTc, Fc in CLO:
    for v in m['verts']:
        for r in v[:3]:
            if r not in usedset: hset.add(r)
    for a, b, _ in m['scale'].values():
        for r in (a, b):
            if r not in usedset: hset.add(r)
hidx = sorted(hset); hpos = {v: i for i, v in enumerate(hidx)}
print('helper anchors', len(hidx))
eye = np.zeros(len(used), np.uint8)
for gname, q in quads:
    if gname != 'body':
        for i in q: eye[remap[i]] = 1

# ---- weights (merged) ----
nAll = len(V0)
wacc = [dict() for _ in range(nAll)]
mhw = [dict() for _ in range(nAll)]  # raw, for baking
for bname, lst in W.items():
    ai = app_of(bname)
    for v, w in lst:
        wacc[v][ai] = wacc[v].get(ai, 0) + w
        mhw[v][bname] = mhw[v].get(bname, 0) + w

def subtree(root):
    out = {root}; changed = True
    while changed:
        changed = False
        for b, d in B.items():
            if d['parent'] in out and b not in out: out.add(b); changed = True
    return out
# straighten the rest pose: upper arm, forearm and leg each rotated to hang straight down
STEPS = []
for sd in 'LR':
    STEPS += [('upperarm01.' + sd, 'lowerarm01.' + sd), ('lowerarm01.' + sd, 'wrist.' + sd), ('upperleg01.' + sd, 'foot.' + sd)]
SUB = {b: subtree(b) for b, _ in STEPS}
SUBW = {b: np.zeros(nAll) for b in SUB}
for v in range(nAll):
    tot = sum(mhw[v].values())
    if tot <= 0: continue
    for b in SUB: SUBW[b][v] = sum(w for bb, w in mhw[v].items() if bb in SUB[b]) / tot

def rot_to(a, b):
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b)
    v = np.cross(a, b); c = np.dot(a, b); k = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + k + k @ k / (1 + c)
def raw_points(Vf):
    pts = {}
    for b in B: pts[b] = head(Vf, b); pts[b + '>tail'] = tail(Vf, b)
    return pts
def move_points(pts, b, R):
    p = pts[b]
    for k in list(pts):
        if k.split('>')[0] in SUB[b] and k != b: pts[k] = R @ (pts[k] - p) + p

maleBase = V0 + sum(target(f'{e}-male-young.target') for e in ['caucasian', 'african', 'asian']) / 3
femaleBase = V0 + sum(target(f'{e}-female-young.target') for e in ['caucasian', 'african', 'asian']) / 3
ROTS = []
_pts = raw_points(maleBase)
for b, nxt in STEPS:
    R = rot_to(_pts[nxt] - _pts[b], np.array([0, -1.0, 0])); ROTS.append(R); move_points(_pts, b, R)

def bake(Vf):
    """returns (mesh positions of used verts, app joint heads + extra points), metres"""
    out = Vf.copy(); pts = raw_points(Vf)
    for (b, nxt), R in zip(STEPS, ROTS):
        p = pts[b]
        out = out + SUBW[b][:, None] * (((out - p) @ R.T + p) - out)
        move_points(pts, b, R)
    J = np.array([pts[src] for (n, src, _) in APP] + [pts[b + '>tail'] for n, (kind, b) in EXTRA])
    return out[used] * SCALE, J * SCALE, out[hidx] * SCALE, out * SCALE

base, J0, hbase, fullBase = bake(maleBase)
floor = base[:, 1].min()
base[:, 1] -= floor; J0[:, 1] -= floor; hbase[:, 1] -= floor; fullBase[:, 1] -= floor

sets = []; deltas = []; jdeltas = []; hdeltas = []
def add(name, Vf, ref):
    m, j, h, _ = bake(Vf); m[:, 1] -= floor; j[:, 1] -= floor; h[:, 1] -= floor
    rm, rj, rh = ref
    sets.append(name); deltas.append(m - rm); jdeltas.append(j - rj); hdeltas.append(h - rh)
fb = bake(femaleBase); fb = (fb[0] - [0, floor, 0], fb[1] - [0, floor, 0], fb[2] - [0, floor, 0])
mb = (base, J0, hbase)
add('female', femaleBase, mb)
maleChild = V0 + sum(target(f'{e}-male-child.target') for e in ['caucasian', 'african', 'asian']) / 3
femaleChild = V0 + sum(target(f'{e}-female-child.target') for e in ['caucasian', 'african', 'asian']) / 3
add('child-male', maleChild, mb)
add('child-female', femaleChild, fb)
for gname, gb, ref in [('male', maleBase, mb), ('female', femaleBase, fb)]:
    for m in ['minmuscle', 'averagemuscle', 'maxmuscle']:
        for w in ['minweight', 'averageweight', 'maxweight']:
            if m == 'averagemuscle' and w == 'averageweight': continue
            add(f'u-{gname}-{m}-{w}', gb + target(f'universal-{gname}-young-{m}-{w}.target'), ref)
    add(f'ideal-{gname}', gb + target(f'{gname}-young-averagemuscle-averageweight-idealproportions.target'), ref)
    add(f'hmin-{gname}', gb + target(f'{gname}-young-averagemuscle-averageweight-minheight.target'), ref)
    add(f'hmax-{gname}', gb + target(f'{gname}-young-averagemuscle-averageweight-maxheight.target'), ref)

# extra shape targets (MakeHuman community, mostly by JALdMIC and titleknown): stored sparse, only the vertices they move
XT = json.load(open(ASSETS + '/xtargets.json'))
xsets = []; xdata = []
# ear mask on the unbaked base: the human ear sticks out of the skull wall beside the head (MakeHuman hm08, decimetres)
def sst(a, b, x): t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
VB = maleBase
eyeIdx = [i for g in ('helper-l-eye', 'helper-r-eye') for q in F[g] for i in q]
eyc = VB[eyeIdx].mean(0)
EARM = sst(eyc[2] - .3, eyc[2] - .65, VB[:, 2]) * sst(eyc[1] - .45, eyc[1] - .2, VB[:, 1])  # back and top of the skull, where the ears grow
print('ear mask verts', int((EARM > .5).sum()), 'eye centre', eyc.round(3))
XT2 = []
for name, fn in XT:
    XT2.append((name, fn, None))
    if name in json.load(open(ASSETS + '/xsplit.json')): XT2 += [(name + 'f', fn, 'face'), (name + 'e', fn, 'ears')]
for name, fn, part in XT2:
    try:
        dt = target(ASSETS + '/' + fn)
        if part == 'face': dt = dt * (1 - EARM[:, None])
        elif part == 'ears': dt = dt * EARM[:, None]
        m_, j_, h_, _ = bake(maleBase + dt)
    except Exception as e: print('xtarget fail', name, e); continue
    m_[:, 1] -= floor; j_[:, 1] -= floor; h_[:, 1] -= floor
    dm, dj, dh = m_ - base, j_ - J0, h_ - hbase
    iv = np.where(np.abs(dm).max(1) > 2e-5)[0]; ih = np.where(np.abs(dh).max(1) > 2e-5)[0]
    xsets.append({'name': name, 'n': int(len(iv)), 'nh': int(len(ih))})
    xdata.append((iv, dm[iv], ih, dh[ih], dj))
print('xsets', len(xsets), 'verts', sum(x['n'] for x in xsets))

# skin: top 4
nV = len(used)
si = np.zeros((nV, 4), np.uint8); sw = np.zeros((nV, 4), np.uint8)
for k, v in enumerate(used):
    items = sorted(wacc[v].items(), key=lambda x: -x[1])[:4]
    tot = sum(w for _, w in items)
    if tot <= 0: items = [(names.index('head') if eye[k] else 0, 1.0)]; tot = 1
    q = [int(round(w / tot * 255)) for _, w in items]
    q[0] += 255 - sum(q)
    for j, (b, _) in enumerate(items): si[k, j] = b; sw[k, j] = q[j]

def top4(acc):
    items = sorted(((b, w) for b, w in acc.items() if w > 0), key=lambda x: -x[1])[:4]
    tot = sum(w for _, w in items)
    if tot <= 0: return [0, 0, 0, 0], [255, 0, 0, 0]
    q = [int(round(w / tot * 255)) for _, w in items]; q[0] += 255 - sum(q)
    return [b for b, _ in items] + [0] * (4 - len(items)), q + [0] * (4 - len(items))
hsi = np.zeros((len(hidx), 4), np.uint8); hsw = np.zeros((len(hidx), 4), np.uint8)
for k, v in enumerate(hidx): a, b = top4(wacc[v]); hsi[k] = a; hsw[k] = b
maxd = max(np.abs(d).max() for d in deltas); print('max delta m', maxd, 'verts', nV, 'tris', len(tris) // 3, 'sets', len(sets))
QS = 1e-4
meta = {'xsets': xsets, 'nH': len(hidx), 'nV': nV, 'nT': len(tris) // 3, 'bones': names, 'parents': [names.index(a[2]) if a[2] else -1 for a in APP],
        'extra': [n for n, _ in EXTRA], 'sets': sets, 'q': QS,
        'license': 'Mesh, skeleton, weights and targets: MakeHuman, CC0 1.0 (makehumancommunity.org)'}
js = json.dumps(meta).encode()
js += b' ' * ((4 - len(js) % 4) % 4)
with open('../figure.bin', 'wb') as f:
    f.write(struct.pack('<I', len(js))); f.write(js)
    def pad(buf):
        f.write(buf)
        if len(buf) % 4: f.write(b'\0' * (4 - len(buf) % 4))
    pad(np.array(tris, np.uint16).tobytes())
    pad(base.astype(np.float32).tobytes())
    for d in deltas: pad(np.clip(np.round(d / QS), -32767, 32767).astype(np.int16).tobytes())
    pad(si.tobytes()); pad(sw.tobytes()); pad(eye.tobytes())
    pad(J0.astype(np.float32).tobytes())
    for d in jdeltas: pad(d.astype(np.float32).tobytes())
    pad(hbase.astype(np.float32).tobytes())
    for d in hdeltas: pad(np.clip(np.round(d / QS), -32767, 32767).astype(np.int16).tobytes())
    pad(hsi.tobytes()); pad(hsw.tobytes())
    for iv, dv, ih, dh, dj in xdata:
        pad(iv.astype(np.uint16).tobytes()); pad(np.clip(np.round(dv / QS), -32767, 32767).astype(np.int16).tobytes())
        pad(ih.astype(np.uint16).tobytes()); pad(np.clip(np.round(dh / QS), -32767, 32767).astype(np.int16).tobytes())
        pad(dj.astype(np.float32).tobytes())
print('height m', base[:, 1].max(), 'bones', len(names))

# ---- clothes: one compressed file per garment, fitted at runtime from the body's anchors ----
OUT = "../ropa"; os.makedirs(OUT, exist_ok=True)
if os.environ.get("NOCLO"): CLO = []
if os.environ.get("DBG"): CLO_ALL = CLO; CLO = []
nVb = len(used)
anchor = lambda v: remap[v] if v in remap else nVb + hpos[v]
# nearest body vertex of every helper anchor, and the body's vertex rings, for coverage masks
bodyOnly = np.where(eye == 0)[0]
hnear = np.array([bodyOnly[np.argmin(((base[bodyOnly] - p) ** 2).sum(1))] for p in hbase], np.int32)
nbr = [set() for _ in range(nVb)]
for t in range(0, len(tris), 3):
    a, b, c = tris[t:t + 3]; nbr[a] |= {b, c}; nbr[b] |= {a, c}; nbr[c] |= {a, b}
def dilate(mask):
    out = mask.copy()
    for v in np.where(mask)[0]: out[list(nbr[v])] = True
    return out
def erode(mask):
    out = mask.copy()
    for v in np.where(mask)[0]:
        if not all(mask[u] for u in nbr[v]): out[v] = False
    return out
SOCK = ('sock', 'stocking', 'hose', 'warmer', 'tights', 'pantyhose', 'nylon', 'stock')
CAT_RANK = {'Ropa interior y baño': 10, 'Pantalones': 30, 'Faldas': 34, 'Camisetas, camisas y jerséis': 40, 'Conjuntos MakeHuman': 40,
            'Uniformes, trajes y armaduras': 42, 'Vestidos, batas y túnicas': 46, 'Guantes': 50, 'Sombreros, cascos y máscaras': 60,
            'Accesorios': 62, 'Joyas': 64, 'Objetos y armas': 66, 'Extras del cuerpo': 20, 'Varios': 44}
AUTO_HIDE = {'Pantalones', 'Faldas', 'Camisetas, camisas y jerséis', 'Conjuntos MakeHuman', 'Uniformes, trajes y armaduras', 'Vestidos, batas y túnicas', 'Calzado y calcetines', 'Guantes'}
catalog = []
for it, m, VTc, Fc in CLO:
    refs = np.array([v[:3] for v in m['verts']]); W3 = np.array([v[3:6] for v in m['verts']]); O = np.array([v[6:9] for v in m['verts']]) * SCALE
    # offsets follow the arms from MakeHuman's A pose to the hanging rest pose
    Wp = np.clip(W3, 0, None); Wp = Wp / np.maximum(Wp.sum(1, keepdims=True), 1e-9)
    for (b, nxt), R in zip(STEPS, ROTS):
        sb = (SUBW[b][refs] * Wp).sum(1)[:, None]
        O = O + sb * (O @ R.T - O)
    sc = []
    for ax, k in (('x', 0), ('y', 1), ('z', 2)):
        a, b2, ref = m['scale'][ax]
        sc0 = abs(maleBase[a][k] - maleBase[b2][k]) / ref if ref else 1.0
        d0 = abs(fullBase[a][k] - fullBase[b2][k])
        sc.append([anchor(a), anchor(b2), float(d0), float(sc0)])
    # skin weights from the reference vertices
    si = np.zeros((len(refs), 4), np.uint8); sw = np.zeros((len(refs), 4), np.uint8)
    for k in range(len(refs)):
        acc = {}
        for r, w in zip(refs[k], Wp[k]):
            for bn, ww in wacc[r].items(): acc[bn] = acc.get(bn, 0) + w * ww
        a, b2 = top4(acc); si[k] = a; sw[k] = b2
    # render vertices: one per (position, uv) pair
    keymap = {}; rv = []; tris = []
    for f in Fc:
        ids = []
        for v, t in f:
            key = (v, t if t >= 0 and t < len(VTc) else -1)
            if key not in keymap: keymap[key] = len(rv); rv.append(key)
            ids.append(keymap[key])
        for j in range(1, len(ids) - 1): tris += [ids[0], ids[j], ids[j + 1]]
    vi = np.array([k[0] for k in rv]); uv = np.array([VTc[k[1]] if k[1] >= 0 else (0, 0) for k in rv], np.float64)
    n = len(rv)
    # body vertex under each garment vertex (its main anchor, helpers mapped to the nearest skin) and how far the cloth is from it
    wi = np.argmax(np.abs(W3), 1); mainRef = refs[np.arange(len(refs)), wi]
    bv = np.array([remap[r] if r in remap else hnear[hpos[r]] for r in mainRef], np.int32)
    Pfit = (np.concatenate([base, hbase])[np.vectorize(anchor)(refs)] * W3[:, :, None]).sum(1) + O
    dist = np.sqrt(((Pfit - base[bv]) ** 2).sum(1))
    ti0 = {'alpha': 0}
    af = os.path.join(ASSETS, 'web', it['id'] + '.alpha.bin')
    if os.path.exists(af):  # transparency where the garment actually samples its texture (image row 0 is the top, v is up)
        am = np.frombuffer(open(af, 'rb').read(), np.uint8).reshape(64, 64)
        uvv = np.array([VTc[t] for f in Fc for v, t in f if 0 <= t < len(VTc)]) if VTc else np.zeros((0, 2))
        if len(uvv):
            px = np.clip((np.mod(uvv[:, 0], 1) * 64).astype(int), 0, 63); py = np.clip(((1 - np.mod(uvv[:, 1], 1)) * 64).astype(int), 0, 63)
            ti0['alpha'] = float((am[py, px] < 128).mean())
    cat = it['cat']; tl = it['title'].lower()
    if cat == 'Calzado y calcetines':
        tall = Pfit[:, 1].max() - floor * 0 > 0.22
        rank = 12 if any(k in tl for k in SOCK) else (36 if tall else 25)
    else: rank = CAT_RANK.get(cat, 44)
    rank += (m['z_depth'] - 50) / 10
    dele = sorted({remap[v] for v in m['delete'] if v in remap})
    if cat in AUTO_HIDE and ti0['alpha'] < .02:
        mk = np.zeros(nVb, bool); mk[bv[dist < .035]] = True
        mk = erode(dilate(dilate(mk))); mk = erode(mk); mk[dele] = True
        dele = np.where(mk)[0].tolist()
    # what this garment covers for the garments under it: the skin it hangs over, a little looser
    if cat in AUTO_HIDE and ti0['alpha'] < .02:
        mk = np.zeros(nVb, bool); mk[bv[dist < .12]] = True; mk[dele] = True
        mk = erode(erode(erode(dilate(dilate(dilate(mk)))))); mk[dele] = True
        cov = np.where(mk)[0].tolist()
    else: cov = list(dele)
    cranges = []
    for v in cov:
        if cranges and cranges[-1][1] == v - 1: cranges[-1][1] = v
        else: cranges.append([v, v])
    ranges = []
    for v in dele:
        if ranges and ranges[-1][1] == v - 1: ranges[-1][1] = v
        else: ranges.append([v, v])
    texf = os.path.join(ASSETS, 'web', it['id'] + '.tex.webp'); texinfo = os.path.join(ASSETS, 'web', it['id'] + '.tex.json')
    tex = open(texf, 'rb').read() if os.path.exists(texf) else b''
    ti = json.load(open(texinfo)) if os.path.exists(texinfo) else {'alpha': 0, 'avg': None}
    mat = parse_mhmat(os.path.join(ASSETS, it['mhmat'])) if it.get('mhmat') else {}
    dc = mat.get('diffuseColor'); col = [float(x) for x in dc[:3]] if dc and len(dc) >= 3 else [1, 1, 1]
    big = n > 65535
    arrs = [np.array([anchor(r) for r in refs[vi].ravel()], np.uint16).tobytes(),
            W3[vi].astype(np.float32).tobytes(),
            np.clip(np.round(O[vi] / 1e-4), -32767, 32767).astype(np.int16).tobytes(),
            np.clip(np.round(uv * 4096), -32767, 32767).astype(np.int16).tobytes(),
            si[vi].tobytes(), sw[vi].tobytes(), bv[vi].astype(np.uint16).tobytes(),
            np.array(tris, np.uint32 if big else np.uint16).tobytes(), tex]
    offs = []; blob = b''
    for a in arrs:
        offs.append(len(blob)); blob += a + b'\0' * ((4 - len(a) % 4) % 4)
    hdr = {'rank': rank, 'n': n, 'nt': len(tris) // 3, 'big': big, 'sc': sc, 'del': ranges, 'cov': cranges, 'z': m['z_depth'], 'offs': offs, 'texLen': len(tex),
           'alpha': ti0['alpha'], 'avg': ti['avg'], 'col': col}
    hj = json.dumps(hdr).encode(); hj += b' ' * ((4 - len(hj) % 4) % 4)
    data = struct.pack('<I', len(hj)) + hj + blob
    import base64 as _b64
    with open(f"{OUT}/{it["id"]}.txt", 'w') as f: f.write(_b64.b64encode(gzip.compress(data, 9)).decode())
    thumb = os.path.join(ASSETS, 'web', it['id'] + '.thumb.webp')
    import base64
    catalog.append({'id': it['id'], 'title': it['title'], 'cat': it['cat'], 'author': it['author'], 'z': m['z_depth'], 'rank': rank, 'n': n,
                    'thumb': 'data:image/webp;base64,' + base64.b64encode(open(thumb, 'rb').read()).decode() if os.path.exists(thumb) else ''})
if CLO: json.dump(catalog, open(f'{OUT}/catalog.json', 'w'), ensure_ascii=False)
tot = sum(os.path.getsize(f'{OUT}/{c["id"]}.txt') for c in catalog)
print('clothes written', len(catalog), 'MB', tot / 1e6)

if os.environ.get("DBG"):
    CLO = CLO_ALL
    A = np.concatenate([base, hbase])
    for it, m, VTc, Fc in CLO:
        if it['id'] not in os.environ['DBG'].split(','): continue
        refs = np.array([v[:3] for v in m['verts']]); W3 = np.array([v[3:6] for v in m['verts']]); O = np.array([v[6:9] for v in m['verts']]) * SCALE
        ar = np.vectorize(anchor)(refs)
        P = (A[ar] * W3[:, :, None]).sum(1) + O
        Pm = (maleBase[refs] * W3[:, :, None]).sum(1) * SCALE
        d = np.array([np.sqrt(((base - p) ** 2).sum(1)).min() for p in P[::7]])
        print(it['id'], 'dist to body: med', np.median(d), 'max', d.max(), '>0.15:', (d > .15).sum(), '/', len(d))
        bad = np.argsort(-d)[:3] * 7
        for i in bad: print('  ', i, refs[i], [r in remap for r in refs[i]], W3[i].round(2), P[i].round(3))
