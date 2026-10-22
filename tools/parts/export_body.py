# (run by export.py with BODY=<family>: the whole body below the head, see body.py)
# Every vertex: how much it is each of four pieces (gw: the sculpted core — torso, arms, thighs —, the paw-hand, the
# lower leg, the hind paw), as the body's field had them blended; the core's points ride on the body's own skin (four
# roots among its vertices and their weights, and the offset from where those roots are on the default wolf), the other
# three are laid by the parts' own fittings, from their canonical coordinates (the default maps' inverses), with the
# parts' own bone weights. The runtime blends the pieces' positions and skin weights by gw.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import body as BD
from mathutils.kdtree import KDTree
SD = BD.sdf(BODY); FR = SD['frames']
MH = np.load(sys.argv[5] if len(sys.argv) > 5 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'mhbody.npz'))
# the trunk (with legs and paws) and the arms (with their paw-hands) apart, the arms' share bigger for their fingers
def piece(t, budget):
    keep = D['PT'] == t; idx = -np.ones(len(keep), np.int64); idx[keep] = np.arange(keep.sum())
    Fp = D['F'][np.all(keep[D['F']], 1)]
    return decimate(D['V'][keep], idx[Fp], budget, D['kind'][keep].astype(np.float32), remesh=False)
V0, F0, K0 = piece(0, int(NS * .62)); V1, F1, K1 = piece(1, int(NS * .38))
V = np.concatenate([V0, V1]); F = np.concatenate([F0, F1 + len(V0)]); K = np.concatenate([K0, K1]); PT = np.r_[np.zeros(len(V0), int), np.ones(len(V1), int)]
kind = (K > 1).astype(np.uint8) * 2
# (a leather speck of a few points at a pad's rim, left by the decimation: fur)
par = np.arange(len(V))
def root(i):
    while par[i] != i: par[i] = par[par[i]]; i = par[i]
    return i
for t in F:
    for e in range(3):
        a, b = t[e], t[(e + 1) % 3]
        if kind[a] == 2 and kind[b] == 2: par[root(a)] = root(b)
from collections import Counter
cnt = Counter(root(i) for i in np.nonzero(kind == 2)[0])
for i in np.nonzero(kind == 2)[0]:
    if cnt[root(i)] < 20: kind[i] = 0
CV, CF, _ = decimate(D['CV'], D['CF'], NC, remesh=False, speck=.004)   # (18 claws, the thumbs' small: none of them a speck)
ns = len(V); Vall = np.concatenate([V, CV]).astype(np.float32); n = len(Vall)
mirx = lambda p: np.c_[np.abs(p[:, :1]), p[:, 1:]].astype(np.float32)
# the pieces: the nearest field wins, blended over the width its union was blended with
G = SD['groups']; Vm = mirx(Vall)
# (an arm's points are its own core or its hand; the trunk's its core, a lower leg or a paw)
arm = np.r_[PT == 1, np.zeros(len(CV), bool)]; INF = np.float32(1e3)
dist = np.stack([np.where(arm, G['arm'](Vall), G['core'](Vall)), np.where(arm, G['hand'](Vall), INF), np.where(arm, INF, G['leg'](Vall)), np.where(arm, INF, G['foot'](Vall))], 1)
width = np.array([.02, .012, .03, .015], np.float32)
w = np.clip(1 - (dist - dist.min(1, keepdims=True)) / width, 0, 1); w = w * w * (3 - 2 * w)
cl = np.arange(n) >= ns; hand_claw = cl & (Vall[:, 1] > .45)
w[cl] = 0; w[hand_claw, 1] = 1; w[cl & ~hand_claw, 3] = 1
w /= w.sum(1, keepdims=True); gw = np.round(w * 255).astype(np.int32); gw[np.arange(n), gw.argmax(1)] += 255 - gw.sum(1)
# canonical coordinates in each part (left side: x mirrored)
canon = lambda key: (Vm - FR[key][1]) @ np.linalg.inv(FR[key][0]).T
CH, CL = canon('hand'), canon('leg')
# hand weights (canonical bones) — claws rigid on their finger's last bone
J = {f: np.stack(SD['HJ'][f]) for f in range(5)}
HSI, HSW = weights(CH[:ns]); HCSI, HCSW = weights(CH[ns:], claws=True)
HSI = np.concatenate([HSI, HCSI]); HSW = np.concatenate([HSW, HCSW])
# leg weights: hip, knee, ankle by the point's place along the leg (as for the leg part)
T_, K_, H_, E_ = SD['LJ']
ts, ds = seg_param(CL, K_, H_); tm, dm = seg_param(CL, H_, E_); tt, dt = seg_param(CL, K_, T_)
sst = lambda a, b, x: (lambda t: t * t * (3 - 2 * t))(np.clip((x - a) / (b - a), 0, 1))
u = np.where(dm < ds, 1 + tm, ts); u = np.where((dt < np.minimum(ds, dm)) & (tt > 0), -tt, u)
W3 = np.stack([1 - sst(-.12, .06, u), sst(-.12, .06, u) * (1 - sst(.9, 1.08, u)), sst(.9, 1.08, u)], 1)
LW = np.floor(W3 * 255).astype(np.int32); LW[:, 1] += 255 - LW.sum(1)
LW = np.c_[LW, np.zeros(n, np.int32)]
# roots on the default body: four for the core among the skin the core stands for (trunk, neck, arms down to the
# wrist, thighs), and one among all its skin below the head (for clothes and the coat)
P0, dom, eye, bn = MH['P'], MH['dom'], MH['eye'], [str(b) for b in MH['bones']]
bi = {b: i for i, b in enumerate(bn)}
trunk_b = {bi[b] for b in ['hips', 'waist', 'chest', 'neck', 'hipL', 'hipR']}; arm_b = {bi[b] for b in ['shoulderL', 'elbowL', 'shoulderR', 'elbowR']}
wri = {bi['wristL']: P0[:, 1] > MH['J'][bi['wristL']][1] - .005, bi['wristR']: P0[:, 1] > MH['J'][bi['wristR']][1] - .005}
ok_trunk = np.array([d in trunk_b and not eye[i] for i, d in enumerate(dom)])
ok_arm = np.array([(d in arm_b or (d in wri and wri[d][i])) and not eye[i] for i, d in enumerate(dom)])
ok_any = np.array([d not in (bi['head'], bi['jaw']) and not eye[i] for i, d in enumerate(dom)])
def tree(mask):
    idx = np.nonzero(mask)[0]; kd = KDTree(len(idx)); [kd.insert(P0[i].tolist(), j) for j, i in enumerate(idx)]; kd.balance(); return kd, idx
(kt, it_), (kr, ir), (ka, ia) = tree(ok_trunk), tree(ok_arm), tree(ok_any)
RT = np.zeros((n, 4), np.int32); RW = np.zeros((n, 4), np.float32); R1 = np.zeros(n, np.int32)
for i, v in enumerate(Vall.tolist()):
    kc, ic = (kr, ir) if arm[i] or (i >= ns and Vall[i, 1] > .45) else (kt, it_)
    hits = kc.find_n(v, 4); d4 = np.array([h[2] for h in hits]) + 1e-4; ww = 1 / d4 ** 2
    RT[i] = [ic[h[1]] for h in hits]; RW[i] = ww / ww.sum()
    R1[i] = ia[ka.find(v)[1]]
RWq = np.floor(RW * 255).astype(np.int32); RWq[:, 0] += 255 - RWq.sum(1)
OFF = (Vall - (P0[RT] * (RWq[:, :, None] / 255)).sum(1)).astype(np.float32)
Fall = np.concatenate([F, CF + ns]).astype(np.uint32); kall = np.concatenate([kind, np.full(len(CV), 3, np.uint8)])
big = n > 65535
# (positions and offsets as 16-bit steps over their boxes: a hundredth of a millimetre or so, half the file)
plo = Vall.min(0); psc = np.maximum(Vall.max(0) - plo, 1e-6) / 65535; olo = OFF.min(0); osc = np.maximum(OFF.max(0) - olo, 1e-6) / 65535
Pq = np.round((Vall - plo) / psc).astype(np.uint16); Oq = np.round((OFF - olo) / osc).astype(np.uint16)
arrs = [Pq.tobytes(), (Fall if big else Fall.astype(np.uint16)).tobytes(), kall.tobytes(), HSI.astype(np.uint8).tobytes(), HSW.astype(np.uint8).tobytes(),
        gw.astype(np.uint8).tobytes(), LW.astype(np.uint8).tobytes(), RT.astype(np.uint16).tobytes(), RWq.astype(np.uint8).tobytes(), R1.astype(np.uint16).tobytes(), Oq.tobytes()]
offs = []; o = 0
for a in arrs: offs.append(o); o += len(a) + (-len(a)) % 4
frames = {k: {'M': FR[k][0].round(6).tolist(), 'o': FR[k][1].round(6).tolist()} for k in FR}
meta = {'n': n, 'nt': len(Fall), 'big': big, 'offs': offs, 'bones': BONES, 'body': True, 'J': {str(f): J[f].round(5).tolist() for f in J},
        'LJ': SD['LJ'].round(5).tolist(), 'Fw': float(SD['Fw']), 'frames': frames,
        'q': {'p': [plo.tolist(), psc.tolist()], 'o': [olo.tolist(), osc.tolist()]}}
head = json.dumps(meta).encode(); head += b' ' * ((-len(head)) % 4)
bodyb = b''.join(a + b'\0' * ((-len(a)) % 4) for a in arrs)
raw = struct.pack('<I', len(head)) + head + bodyb
open(out, 'w').write(base64.b64encode(gzip.compress(raw, 9)).decode())
print(f'{out}: {ns} skin + {len(CV)} claw vertices, {len(Fall)} triangles, {len(raw) // 1024} kB raw, {len(open(out).read()) // 1024} kB text')
print('pieces', (gw > 127).sum(0), 'max offset', np.abs(OFF).max(0))
np.savez_compressed(out.replace('.txt', '.low.npz'), V=V, F=F, kind=kind, CV=CV, CF=CF, GW=gw.astype(np.uint8))
