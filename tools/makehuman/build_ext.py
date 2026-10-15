# Figure extension: extra MakeHuman (CC0) shape sets for the existing figure, without touching app/figure.txt
# (the 470 garments are fitted to its vertex and helper indices, so the base figure stays as it is).
#   - old-male / old-female: from young (25) to old (90), averaged over MakeHuman's three ethnic bases
#   - e-<unit>: facial expression units (eyes, brows, mouth, nose), averaged the same way
# The mesh is baked exactly like build2.py (arms from MakeHuman's A pose to hanging, 47 app bones, metres, floor at 0),
# and the script first checks it reproduces the stored figure before writing app/figure-ext.txt.
# Inputs (MakeHuman repository, makehuman/data): base.obj, default.mhskel, default_weights.mhw,
#   t/<ethnic>-<gender>-<age>.target (macrodetails), ex/<ethnic>/<unit>.target (expression/units)
import numpy as np, json, struct, base64, os, sys

SRC = sys.argv[1] if len(sys.argv) > 1 else '.'
APPDIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'app')
SCALE = 0.1
P = lambda *a: os.path.join(SRC, *a)

V = []; F = {}; g = None
for l in open(P('base.obj')):
    if l.startswith('v '): V.append([float(x) for x in l.split()[1:4]])
    elif l.startswith('g '): g = l.split()[1]
    elif l.startswith('f '): F.setdefault(g, []).append([int(q.split('/')[0]) - 1 for q in l.split()[1:]])
V0 = np.array(V)
def target(path):
    d = np.zeros_like(V0)
    for l in open(path):
        if l[:1].isdigit():
            i, x, y, z = l.split(); d[int(i)] = [float(x), float(y), float(z)]
    return d
ETH = ['caucasian', 'african', 'asian']
avg = lambda f: sum(target(f(e)) for e in ETH) / 3

skel = json.load(open(P('default.mhskel'))); B = skel['bones']; JNT = skel['joints']
jpos = lambda Vf, key: Vf[JNT[key]].mean(0)
head = lambda Vf, b: jpos(Vf, B[b]['head']); tail = lambda Vf, b: jpos(Vf, B[b]['tail'])
W = json.load(open(P('default_weights.mhw')))['weights']

APP = [('hips', 'root', None), ('waist', 'spine04', 'hips'), ('chest', 'spine02', 'waist'), ('neck', 'neck01', 'chest'), ('head', 'head', 'neck')]
for s in 'LR':
    APP += [('shoulder' + s, 'upperarm01.' + s, 'chest'), ('elbow' + s, 'lowerarm01.' + s, 'shoulder' + s), ('wrist' + s, 'wrist.' + s, 'elbow' + s)]
    for f in range(5):
        for k in range(3): APP.append((f'f{s}{f}{k}', f'finger{f+1}-{k+1}.{s}', 'wrist' + s if k == 0 else f'f{s}{f}{k-1}'))
    APP += [('hip' + s, 'upperleg01.' + s, 'hips'), ('knee' + s, 'lowerleg01.' + s, 'hip' + s), ('ankle' + s, 'foot.' + s, 'knee' + s)]
APP += [('jaw', 'jaw', 'head')]
EXTRA = []
for s in 'LR':
    for f in range(5): EXTRA.append((f'tip{s}{f}', f'finger{f+1}-3.{s}'))
    EXTRA.append((f'toe{s}', f'foot.{s}'))

groups = ['body', 'helper-l-eye', 'helper-r-eye']
used = sorted({i for gname in groups for q in F[gname] for i in q})
remap = {v: i for i, v in enumerate(used)}

nAll = len(V0); mhw = [dict() for _ in range(nAll)]
for bname, lst in W.items():
    for v, w in lst: mhw[v][bname] = mhw[v].get(bname, 0) + w
def subtree(root):
    out = {root}; changed = True
    while changed:
        changed = False
        for b, d in B.items():
            if d['parent'] in out and b not in out: out.add(b); changed = True
    return out
STEPS = []
for sd in 'LR': STEPS += [('upperarm01.' + sd, 'lowerarm01.' + sd), ('lowerarm01.' + sd, 'wrist.' + sd), ('upperleg01.' + sd, 'foot.' + sd)]
SUB = {b: subtree(b) for b, _ in STEPS}; SUBW = {b: np.zeros(nAll) for b in SUB}
for v in range(nAll):
    tot = sum(mhw[v].values())
    if tot <= 0: continue
    for b in SUB: SUBW[b][v] = sum(w for bb, w in mhw[v].items() if bb in SUB[b]) / tot
def rot_to(a, b):
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b); v = np.cross(a, b); c = np.dot(a, b)
    k = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]]); return np.eye(3) + k + k @ k / (1 + c)
def raw_points(Vf):
    pts = {}
    for b in B: pts[b] = head(Vf, b); pts[b + '>tail'] = tail(Vf, b)
    return pts
def move_points(pts, b, R):
    p = pts[b]
    for k in list(pts):
        if k.split('>')[0] in SUB[b] and k != b: pts[k] = R @ (pts[k] - p) + p

maleBase = V0 + avg(lambda e: P('t', f'{e}-male-young.target'))
femaleBase = V0 + avg(lambda e: P('t', f'{e}-female-young.target'))
ROTS = []; _pts = raw_points(maleBase)
for b, nxt in STEPS:
    R = rot_to(_pts[nxt] - _pts[b], np.array([0, -1.0, 0])); ROTS.append(R); move_points(_pts, b, R)
def bake(Vf):
    out = Vf.copy(); pts = raw_points(Vf)
    for (b, nxt), R in zip(STEPS, ROTS):
        p = pts[b]; out = out + SUBW[b][:, None] * (((out - p) @ R.T + p) - out); move_points(pts, b, R)
    J = np.array([pts[src] for (n, src, _) in APP] + [pts[b + '>tail'] for n, b in EXTRA])
    return out * SCALE, J * SCALE

full0, J0 = bake(maleBase); floor = full0[used][:, 1].min()
full0[:, 1] -= floor; J0[:, 1] -= floor

# ---- the stored figure: reproduce it, and find which MakeHuman vertices its helper anchors are ----
raw = base64.b64decode(open(os.path.join(APPDIR, 'figure.txt')).read().strip())
hl = struct.unpack('<I', raw[:4])[0]; meta = json.loads(raw[4:4 + hl]); o = 4 + hl
def take(dt, n):
    global o
    a = np.frombuffer(raw, dt, n, o); o += a.nbytes; o = (o + 3) & ~3; return a
nV, nT, nJ, nS, nH = meta['nV'], meta['nT'], len(meta['bones']) + len(meta['extra']), len(meta['sets']), meta['nH']
take(np.uint16, nT * 3); fbase = take(np.float32, nV * 3).reshape(-1, 3)
fdel = [take(np.int16, nV * 3).reshape(-1, 3) for _ in range(nS)]
take(np.uint8, nV * 4); take(np.uint8, nV * 4); take(np.uint8, nV); fJ0 = take(np.float32, nJ * 3).reshape(-1, 3)
[take(np.float32, nJ * 3) for _ in range(nS)]
fhbase = take(np.float32, nH * 3).reshape(-1, 3)
assert nV == len(used), (nV, len(used))
err = np.abs(full0[used] - fbase).max(); jerr = np.abs(J0 - fJ0).max()
print(f'base reproduced: max vertex error {err:.2e} m, joint error {jerr:.2e} m')
assert err < 1e-5 and jerr < 1e-5, 'the bake does not match the stored figure'
fb_full, _ = bake(femaleBase); fb_full[:, 1] -= floor
ferr = np.abs((fb_full[used] - full0[used]) - fdel[meta['sets'].index('female')] * meta['q']).max()
print(f'female set reproduced: max error {ferr:.2e} m'); assert ferr < 2e-4
# helper anchors: the MakeHuman vertex at each stored helper position
notused = np.array(sorted(set(range(nAll)) - set(used)))
hidx = []
for p in fhbase:
    d = ((full0[notused] - p) ** 2).sum(1); k = int(np.argmin(d)); assert d[k] < 1e-10, ('helper not found', p, d[k]); hidx.append(int(notused[k]))
print('helper anchors matched', len(hidx))

# ---- new sparse sets ----
xsets = []; xdata = []
def add(name, Vf, ref_full, ref_J):
    m, j = bake(Vf); m[:, 1] -= floor; j[:, 1] -= floor
    dm = m[used] - ref_full[used]; dh = m[hidx] - ref_full[hidx]; dj = j - ref_J
    iv = np.where(np.abs(dm).max(1) > 2e-5)[0]; ih = np.where(np.abs(dh).max(1) > 2e-5)[0]
    xsets.append({'name': name, 'n': int(len(iv)), 'nh': int(len(ih))}); xdata.append((iv, dm[iv], ih, dh[ih], dj))
    print(f'  {name}: {len(iv)} vertices, {len(ih)} helpers, max {np.abs(dm).max() * 100:.1f} cm')
fJ = bake(femaleBase)[1]; fJ[:, 1] -= floor
add('old-male', V0 + avg(lambda e: P('t', f'{e}-male-old.target')), full0, J0)
add('old-female', V0 + avg(lambda e: P('t', f'{e}-female-old.target')), fb_full, fJ)
for unit in sorted(f[:-7] for f in os.listdir(P('ex', 'caucasian')) if f.endswith('.target')):
    add('e-' + unit, maleBase + avg(lambda e: P('ex', e, unit + '.target')), full0, J0)

QS = meta['q']
ext = {'xsets': xsets, 'q': QS, 'nV': nV, 'nH': nH, 'license': 'Age and expression targets: MakeHuman, CC0 1.0 (makehumancommunity.org)'}
js = json.dumps(ext).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
buf = bytearray(struct.pack('<I', len(js)) + js)
def pad(b):
    buf.extend(b); buf.extend(b'\0' * ((4 - len(b) % 4) % 4))
for iv, dv, ih, dh, dj in xdata:
    pad(iv.astype(np.uint16).tobytes()); pad(np.clip(np.round(dv / QS), -32767, 32767).astype(np.int16).tobytes())
    pad(ih.astype(np.uint16).tobytes()); pad(np.clip(np.round(dh / QS), -32767, 32767).astype(np.int16).tobytes())
    pad(dj.astype(np.float32).tobytes())
open(os.path.join(APPDIR, 'figure-ext.txt'), 'w').write(base64.b64encode(bytes(buf)).decode())
print('app/figure-ext.txt', len(xsets), 'sets', round(len(buf) / 1024), 'kB')
