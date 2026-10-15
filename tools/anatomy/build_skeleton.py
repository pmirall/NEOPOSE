# Anatomical skeleton for the "Skeleton" construction mode: the bones of BodyParts3D (© The Database Center for Life Science,
# CC Attribution 4.0), simplified and fitted to the figure's default body, each bone rigidly bound to one app bone.
#   python3 build_skeleton.py <MakeHuman data dir, as for build_ext.py> <BodyParts3D partof_BP3D_4.0_obj_99 dir>
# Fitting: the trunk (pelvis, spine, ribs, shoulder girdle) by the hip and shoulder joint centres; every limb segment from
# joint to joint (twist from a reference direction); the skull by the eyes. Writes app/skeleton.txt:
# [u32 header length][header json][positions i16 n*3, 0.1 mm][app bone u8 n][triangles u16|u32 nt*3]
import sys, os, json, struct, base64, gzip, re
import numpy as np
import fast_simplification
BP = sys.argv[2]
sys.argv = sys.argv[:2]
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'makehuman'))
import build_ext as X

NAMES = [a[0] for a in X.APP] + [e[0] for e in X.EXTRA]
JI = {n: i for i, n in enumerate(NAMES)}
J0 = X.J0  # app joints of the default body, metres, floor at 0
jm = lambda n: J0[JI[n]]
# MakeHuman eye centres (helper-l-eye is the character's left, +x)
eyeC = {s: X.full0[sorted({i for q in X.F[f'helper-{k}-eye'] for i in q})].mean(0) for s, k in (('L', 'l'), ('R', 'r'))}

# ---------- BodyParts3D ----------
names = {}
for f in os.listdir(BP):
    if not f.endswith('.obj'): continue
    with open(os.path.join(BP, f)) as fh:
        for l in fh:
            if l.startswith('# English name'): names[l.split(':', 1)[1].strip()] = f[:-4]; break
def load(name):
    V = []; F = []
    for l in open(os.path.join(BP, names[name] + '.obj')):
        if l.startswith('v '): x, y, z = map(float, l.split()[1:4]); V.append((x / 1000, z / 1000, -y / 1000))  # mm, z up, -y front -> m, y up, z front
        elif l.startswith('f '): F.append([int(q.split('/')[0]) - 1 for q in l.split()[1:4]])
    return np.array(V), np.array(F, np.int64)
SIDE = {'L': 'left', 'R': 'right'}
NUM = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth']
FING = ['thumb', 'index finger', 'middle finger', 'ring finger', 'little finger']
TOE = ['big toe', 'second toe', 'third toe', 'fourth toe', 'little toe']
SKULL = ['Frontal bone', 'Occipital bone', 'Sphenoid bone', 'Left parietal bone', 'Right parietal bone', 'Left temporal bone', 'Right temporal bone',
         'Left maxilla', 'Right maxilla', 'Left zygomatic bone', 'Right zygomatic bone', 'Left nasal bone', 'Right nasal bone', 'Left lacrimal bone', 'Right lacrimal bone']
parts = []  # (name, group, app bone)
for n in SKULL: parts.append((n, 'head', 'head'))
parts.append(('Mandible', 'head', 'jaw'))
parts.append(('Hyoid bone', 'head', 'neck'))
for k, nm in enumerate(['Atlas', 'Axis'] + [f'{NUM[i].capitalize()} cervical vertebra' for i in range(2, 7)]): parts.append((nm, f'cerv{k}', 'neck' if k > 0 else 'head'))
for i in range(12): parts.append((f'{NUM[i].capitalize()} thoracic vertebra', 'trunk', None))
for i in range(5): parts.append((f'{NUM[i].capitalize()} lumbar vertebra', 'trunk', None))
parts += [('Sacrum', 'trunk', 'hips'), ('Manubrium', 'trunk', 'chest'), ('Body of sternum', 'trunk', 'chest'), ('Xiphoid process', 'trunk', 'chest')]
for s in 'LR':
    sd = SIDE[s].capitalize()
    parts += [(f'{sd} hip bone', 'trunk', 'hips'), (f'{sd} clavicle', 'trunk', 'chest'), (f'{sd} scapula', 'trunk', 'chest')]
    for i in range(12): parts.append((f'{sd} {NUM[i]} rib', 'trunk', 'chest'))
    for i in range(7): parts.append((f'{sd} {NUM[i]} costal cartilage', 'trunk', 'chest'))
    parts += [(f'{sd} humerus', 'uarm' + s, 'shoulder' + s), (f'{sd} radius', 'farm' + s, 'elbow' + s), (f'{sd} ulna', 'farm' + s, 'elbow' + s)]
    for c in ['scaphoid', 'lunate', 'triquetral', 'pisiform', 'trapezium', 'trapezoid', 'capitate', 'hamate']: parts.append((f'{sd} {c}', 'hand' + s, 'wrist' + s))
    for i in range(1, 5): parts.append((f'{sd} {NUM[i]} metacarpal bone', 'hand' + s, 'wrist' + s))
    parts.append((f'{sd} first metacarpal bone', f'f{s}00', f'f{s}00'))
    parts += [(f'Proximal phalanx of {SIDE[s]} thumb', f'f{s}01', f'f{s}01'), (f'Distal phalanx of {SIDE[s]} thumb', f'f{s}02', f'f{s}02')]
    for f in range(1, 5):
        for k, ph in enumerate(['Proximal', 'Middle', 'Distal']): parts.append((f'{ph} phalanx of {SIDE[s]} {FING[f]}', f'f{s}{f}{k}', f'f{s}{f}{k}'))
    parts += [(f'{sd} femur', 'thigh' + s, 'hip' + s), (f'{sd} patella', 'thigh' + s, 'hip' + s), (f'{sd} tibia', 'shin' + s, 'knee' + s), (f'{sd} fibula', 'shin' + s, 'knee' + s)]
    for c in ['calcaneus', 'talus', 'cuboid bone', 'medial cuneiform bone', 'intermediate cuneiform bone', 'lateral cuneiform bone']: parts.append((f'{sd} {c}', 'foot' + s, 'ankle' + s))
    parts.append((f'Navicular bone of {SIDE[s]} foot', 'foot' + s, 'ankle' + s))
    for i in range(5): parts.append((f'{sd} {NUM[i]} metatarsal bone', 'foot' + s, 'ankle' + s))
    for t in range(5):
        for ph in ['Proximal', 'Middle', 'Distal']:
            if t == 0 and ph == 'Middle': continue
            parts.append((f'{ph} phalanx of {SIDE[s]} {TOE[t]}', 'foot' + s, 'ankle' + s))
missing = [p[0] for p in parts if p[0] not in names]
print('missing', missing)
parts = [p for p in parts if p[0] in names]
M = {p[0]: load(p[0]) for p in parts}
print('bones', len(parts), 'vertices', sum(len(v) for v, f in M.values()))

# ---------- BodyParts3D landmarks ----------
def endc(V, d, frac=.1, top=True):
    # centroid of the vertices in the last `frac` of the extent along direction d
    t = V @ d; lo, hi = t.min(), t.max(); L = hi - lo
    sel = t > hi - frac * L if top else t < lo + frac * L
    return V[sel].mean(0)
def sphere(P):
    A = np.c_[2 * P, np.ones(len(P))]; b = (P ** 2).sum(1); c = np.linalg.lstsq(A, b, rcond=None)[0]; return c[:3]
def axis(V):
    c = V.mean(0); u = np.linalg.svd(V - c, full_matrices=False)[2][0]; return u
up = np.array([0, 1.0, 0])
L = {}
for s in 'LR':
    sd = SIDE[s].capitalize(); sx = 1 if s == 'L' else -1
    H = M[f'{sd} humerus'][0]; top = H[H[:, 1] > H[:, 1].max() - .045]; med = top[(top[:, 0] * sx) < np.median(top[:, 0] * sx)]
    L['shoulder' + s] = sphere(med)
    L['elbow' + s] = endc(H, up, .06, False) + np.array([0, .01, 0])
    R_, U_ = M[f'{sd} radius'][0], M[f'{sd} ulna'][0]
    rd, ud = endc(R_, up, .05, False), endc(U_, up, .05, False)
    L['wrist' + s] = (rd + ud) / 2 * .5 + M[f'{sd} lunate'][0].mean(0) * .5
    L['radLat' + s] = rd - ud
    Fm = M[f'{sd} femur'][0]; top = Fm[Fm[:, 1] > Fm[:, 1].max() - .06]; med = top[(top[:, 0] * sx) < np.median(top[:, 0] * sx)]
    L['hip' + s] = sphere(med)
    Tb = M[f'{sd} tibia'][0]
    L['knee' + s] = (endc(Fm, up, .04, False) + endc(Tb, up, .04, True)) / 2
    Ta = M[f'{sd} talus'][0]; L['ankle' + s] = Ta[Ta[:, 1] > np.percentile(Ta[:, 1], 60)].mean(0)
    mt2, pp2 = M[f'{sd} second metatarsal bone'][0], M[f'Proximal phalanx of {SIDE[s]} second toe'][0]
    fwd = np.array([0, 0, 1.0]); L['toe' + s] = (endc(mt2, fwd, .12, True) + endc(pp2, fwd, .12, False)) / 2
    L['mt1' + s] = endc(M[f'{sd} first metatarsal bone'][0], fwd, .12, True); L['mt5' + s] = endc(M[f'{sd} fifth metatarsal bone'][0], fwd, .12, True)
    # hand: joints between consecutive bones along each finger, measured along the finger's own axis
    wr = L['wrist' + s]
    def ends(V):
        d = axis(V); d = d if (V.mean(0) - wr) @ d > 0 else -d; return endc(V, d, .12, False), endc(V, d, .12, True), V[np.argmax(V @ d)]
    for f in range(5):
        chain = [f'{sd} first metacarpal bone', f'Proximal phalanx of {SIDE[s]} thumb', f'Distal phalanx of {SIDE[s]} thumb'] if f == 0 else \
                [f'{sd} {NUM[f]} metacarpal bone'] + [f'{ph} phalanx of {SIDE[s]} {FING[f]}' for ph in ['Proximal', 'Middle', 'Distal']]
        E = [ends(M[n][0]) for n in chain]
        if f == 0: L[f'f{s}00'] = (M[f'{sd} trapezium'][0].mean(0) + E[0][0]) / 2; js = [(E[0][1] + E[1][0]) / 2, (E[1][1] + E[2][0]) / 2]; names_ = [f'f{s}01', f'f{s}02']
        else: js = [(E[k][1] + E[k + 1][0]) / 2 for k in range(3)]; names_ = [f'f{s}{f}0', f'f{s}{f}1', f'f{s}{f}2']
        for n, p in zip(names_, js): L[n] = p
        L[f'tip{s}{f}'] = E[-1][2]
# eyeball centres: the anterior chamber (only the left one is modelled) a centimetre forward of the centre, mirrored for the right
V, _ = load('Anterior chamber of left eyeball'); L['eyeL'] = V.mean(0) - np.array([0, 0, .0105]); L['eyeR'] = L['eyeL'] * np.array([-1, 1, 1])

# ---------- transforms ----------
def frame(a, b, ref):
    # orthonormal frame: x along a->b, y = ref made orthogonal, z = x × y
    x = (b - a) / np.linalg.norm(b - a); y = ref - (ref @ x) * x; y /= np.linalg.norm(y); return np.stack([x, y, np.cross(x, y)])
def seg(a, b, A, B, ref_bp, ref_mh, radial):
    Fb, Fm = frame(a, b, ref_bp), frame(A, B, ref_mh); k = np.linalg.norm(B - A) / np.linalg.norm(b - a)
    def T(V):
        loc = (V - a) @ Fb.T; loc[:, 0] *= k; loc[:, 1:] *= radial; return A + loc @ Fm
    return T
mid = lambda p, q: (p + q) / 2
# trunk: the height ratio of the two bodies, the ribcage fitted inside the figure's chest (breadth and depth), centred at
# the middle of the hip and shoulder joints in height and at the chest's middle in depth
Bd = X.full0[X.used]; armw = np.maximum(X.SUBW['upperarm01.L'], X.SUBW['upperarm01.R'])[X.used]
hgt_m = Bd[:, 1].max(); allbp = np.concatenate([v for v, f in M.values()]); hgt_b = allbp[:, 1].max() - allbp[:, 1].min()
ribs = np.concatenate([M[n][0] for n in M if ' rib' in n]); yb = np.percentile(ribs[:, 1], 45)
band = ribs[np.abs(ribs[:, 1] - yb) < .02]; Wb, Db, zcb = np.ptp(band[:, 0]), np.ptp(band[:, 2]), (band[:, 2].max() + band[:, 2].min()) / 2
hb, sb = mid(L['hipL'], L['hipR']), mid(L['shoulderL'], L['shoulderR'])
hm, sm = mid(jm('hipL'), jm('hipR')), mid(jm('shoulderL'), jm('shoulderR'))
ky = hgt_m / hgt_b; ym = (hm[1] + sm[1]) / 2 + (yb - (hb[1] + sb[1]) / 2) * ky
tb = Bd[(np.abs(Bd[:, 1] - ym) < .015) & (armw < .3)]; Wm, Dm, zcm = np.ptp(tb[:, 0]), np.ptp(tb[:, 2]), (tb[:, 2].max() + tb[:, 2].min()) / 2
kx, kz = .84 * Wm / Wb, .86 * Dm / Db
print(f'trunk: ribcage {Wb:.3f} x {Db:.3f} m, chest {Wm:.3f} x {Dm:.3f} m at {ym:.2f} m; scales x {kx:.3f} y {ky:.3f} z {kz:.3f}')
def Ttrunk(V):
    return np.c_[V[:, 0] * kx, ym + (V[:, 1] - yb) * ky, zcm + (V[:, 2] - zcb) * kz]
wr = (kx + kz) / 2
GR = wr  # bone thickness follows the body's breadth
# skull: eyes to eyes, uniform
eb, em = mid(L['eyeL'], L['eyeR']), mid(eyeC['L'], eyeC['R']); ks = np.linalg.norm(eyeC['L'] - eyeC['R']) / np.linalg.norm(L['eyeL'] - L['eyeR'])
Thead = lambda V: em + (V - eb) * ks
print(f'skull {ks:.3f}')
fwd = np.array([0, 0, 1.0])
TR = {'head': Thead, 'trunk': Ttrunk}
for k in range(7):  # cervical vertebrae: from the skull's fit at the atlas to the trunk's at C7
    a = 1 - k / 6
    TR[f'cerv{k}'] = (lambda a: lambda V: a * Thead(V) + (1 - a) * Ttrunk(V))(a)
for s in 'LR':
    sx = 1 if s == 'L' else -1
    hl_b = L[f'f{s}10'] - L[f'f{s}40']; hl_m = jm(f'f{s}10') - jm(f'f{s}40')
    TR['uarm' + s] = seg(L['shoulder' + s], L['elbow' + s], Ttrunk(L['shoulder' + s][None])[0], jm('elbow' + s), fwd, fwd, GR)
    TR['farm' + s] = seg(L['elbow' + s], L['wrist' + s], jm('elbow' + s), jm('wrist' + s), L['radLat' + s], jm(f'f{s}01') - jm(f'f{s}40'), GR)
    TR['hand' + s] = seg(L['wrist' + s], L[f'f{s}20'], jm('wrist' + s), jm(f'f{s}20'), hl_b, hl_m, GR)
    for f in range(5):
        for k in range(3):
            n = f'f{s}{f}{k}'; nx = f'f{s}{f}{k + 1}' if k < 2 else f'tip{s}{f}'
            TR[n] = seg(L[n], L[nx], jm(n), jm(nx), hl_b, hl_m, GR)
    TR['thigh' + s] = seg(L['hip' + s], L['knee' + s], Ttrunk(L['hip' + s][None])[0], jm('knee' + s), fwd, fwd, GR)
    TR['shin' + s] = seg(L['knee' + s], L['ankle' + s], jm('knee' + s), jm('ankle' + s), fwd, fwd, GR)
    TR['foot' + s] = seg(L['ankle' + s], L['toe' + s], jm('ankle' + s), jm('toe' + s), (L['mt1' + s] - L['mt5' + s]) * -sx, np.array([1.0, 0, 0]), GR)

# ---------- simplify, place, bind ----------
TARGET = 34000  # triangles for the whole skeleton
tot = sum(len(f) for v, f in M.values())
Pall = []; Ball = []; Tall = []; off = 0
spineY = lambda n: (jm('waist')[1], jm('chest')[1])
for name, grp, bone in parts:
    V, F = M[name]
    wgt = 3 if grp == 'head' else 1.6 if grp.startswith(('hand', 'f')) else 1  # the skull and hands are looked at closely
    keep = max(TARGET * wgt * len(F) / tot, min(len(F), 200))
    red = 1 - keep / len(F)
    if red > .05: V, F = fast_simplification.simplify(V.astype(np.float32), F.astype(np.int32), red); V = V.astype(np.float64)
    W = TR[grp](V)
    if bone is None:  # vertebrae: by height between the app's spine joints
        y = W[:, 1].mean(); bone = 'hips' if y < jm('waist')[1] else 'waist' if y < jm('chest')[1] else 'chest'
    Pall.append(W); Ball.append(np.full(len(W), JI[bone])); Tall.append(F + off); off += len(W)
P = np.concatenate(Pall); Bi = np.concatenate(Ball).astype(np.uint8); T = np.concatenate(Tall)
print('skeleton', len(P), 'vertices', len(T), 'triangles')
# how far inside the skin: sample distance to the body surface
body = X.full0[X.used]
from numpy.linalg import norm
samp = P[::37]; dmin = np.array([np.sqrt(((body - p) ** 2).sum(1)).min() for p in samp])
print('bone to skin distance: median %.3f, min %.3f' % (np.median(dmin), dmin.min()))
big = len(P) > 65535
hdr = {'n': len(P), 'nt': len(T), 'big': big, 'credit': 'BodyParts3D, © The Database Center for Life Science, CC Attribution 4.0 International'}
hj = json.dumps(hdr).encode(); hj += b' ' * ((4 - len(hj) % 4) % 4)
blob = bytearray()
for a in [np.round(P / 1e-4).astype(np.int16).tobytes(), Bi.tobytes(), T.astype(np.uint32 if big else np.uint16).tobytes()]: blob += a + b'\0' * ((4 - len(a) % 4) % 4)
out = os.path.join(X.APPDIR, 'skeleton.txt')
open(out, 'w').write(base64.b64encode(gzip.compress(struct.pack('<I', len(hj)) + hj + bytes(blob), 9)).decode())
print(out, os.path.getsize(out) // 1024, 'kB')
