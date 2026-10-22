# The whole anthro body below the head as one continuous signed distance field, in the app's rig coordinates (metres,
# the default wolf's rest pose: +x the character's left, +y up, +z forward). Torso, arms and thighs are sculpted here
# round the rig's joints and the MakeHuman body's measured sections (so clothes fitted to it still fit); the paw-hands,
# the digitigrade lower legs and the hind paws are the parts' own fields placed on their bones, and everything is
# blended into one skin, so there is no seam at the wrist, the knee or the ankle.
#   python body.py canid|felid out.npz [step]
import json, os, numpy as np
from sdf import ellipsoid, round_cone, smin, smax, ssub, Field, _n
import hand, foot, leg

HERE = os.path.dirname(os.path.abspath(__file__))
RIG = json.load(open(os.path.join(HERE, 'rig.json')))
J = {k: np.array(v, np.float32) for k, v in RIG['J'].items()}
A = lambda *v: np.array(v, np.float32)

def placed(f, M, o):
    """A canonical part's field put in the world by the affine map the app lays it with on the default body (fitted on
    its points: world = o + M c); distances scaled by the map's mean scale."""
    M = np.asarray(M, np.float32); o = np.asarray(o, np.float32); Mi = np.linalg.inv(M).astype(np.float32); s = float(np.cbrt(abs(np.linalg.det(M))))
    return lambda p: f((p - o) @ Mi.T) * s

DEF = json.load(open(os.path.join(HERE, 'defaults.json')))
def frames(): return {k: (np.array(DEF[k]['M'], np.float32), np.array(DEF[k]['o'], np.float32)) for k in ('hand', 'leg', 'foot')}

def torso_arm_thigh():
    """The sculpted torso, arms and thighs (left half and midline; evaluated on |x|)."""
    T, Ar = [], []   # (field, blend) in order: the trunk's (with the thighs), the arm's
    P = T; add = lambda f, k: P.append((f, k))
    E = lambda c, r, R=None: (lambda p, c=A(*c), r=A(*r), R=R: ellipsoid(p, c, r, R))
    C = lambda a, b, ra, rb: (lambda p, a=A(*a), b=A(*b): round_cone(p, a, b, ra, rb))
    def tilt(ax, deg):
        ax = _n(ax); a = np.radians(deg); K = np.array([[0, -ax[2], ax[1]], [ax[2], 0, -ax[0]], [-ax[1], ax[0], 0]], np.float32)
        return (np.eye(3) + np.sin(a) * K + (1 - np.cos(a)) * K @ K).astype(np.float32)
    # --- torso: the ribcage's egg, the abdomen and the pelvis' bowl, stacked; a V from the shoulders to the waist
    add(E((0, 1.355, .028), (.145, .2, .108)), 0)                    # ribcage
    add(E((0, 1.17, .036), (.128, .15, .094)), .05)                  # abdomen
    add(E((0, 1.0, .015), (.132, .1, .095)), .05)                      # pelvis
    add(E((.112, 1.045, .03), (.05, .065, .075)), .03)               # obliques over the hip bone
    add(E((0, 1.47, .0), (.185, .085, .085)), .05)                   # the shoulder girdle: the chest's top as wide as the shoulders
    # chest: the pectorals, two thick slabs hung from the clavicle and the sternum, their lower edge a crease
    add(E((.08, 1.42, .1), (.1, .062, .046), tilt((0, 0, 1), 18)), .014)
    add(E((.15, 1.45, .068), (.05, .04, .04), tilt((0, 0, 1), 35)), .02)   # (its tendon sweeping into the deltoid)
    # abdominal wall: six pads in three rows and a softer lower one, a groove down the middle (the linea alba)
    for y, h in ((1.285, .03), (1.215, .031), (1.145, .031)):
        add(E((.033, y, .113), (.03, h, .022)), .01)
    add(E((.035, 1.075, .104), (.04, .05, .024)), .02)
    # serratus: the saw-teeth on the ribs under the arm
    for i, y in enumerate((1.35, 1.315, 1.28)):
        add(E((.122 - i * .004, y, .07 - i * .006), (.012, .011, .024), tilt((1, 0, 0), -25)), .015)
    # back: the lats' wings from the armpit to the waist, the traps from the neck to the shoulder and down to mid-back,
    # the shoulder blades, the erectors either side of the spine (a groove between them)
    add(E((.112, 1.3, -.028), (.052, .15, .058), tilt((0, 0, 1), -12)), .03)
    add(C((.02, 1.585, -.012), (.155, 1.505, -.012), .045, .028), .03)
    add(E((.045, 1.43, -.052), (.075, .11, .038)), .03)
    add(E((.082, 1.415, -.068), (.048, .068, .022), tilt((0, 0, 1), 10)), .02)
    add(C((.03, 1.0, -.064), (.034, 1.34, -.068), .03, .024), .025)
    # the neck: a column a little forward of the spine, the sternomastoids from behind the ear to the notch, the clavicles
    add(C((0, 1.5, .02), (0, 1.63, .03), .066, .058), .04)
    add(C((.045, 1.665, .0), (.014, 1.545, .072), .017, .014), .015)
    add(C((.02, 1.54, .072), (.168, 1.528, .036), .014, .013), .015)
    # glutes and the hip
    add(E((.062, .97, -.04), (.07, .088, .062)), .035)
    # --- the arm: the deltoid's cap, the upper arm's core, the biceps in front and the triceps' horseshoe behind; the
    # elbow's point; the forearm's two masses (the extensors and brachioradialis outside, the flexors inside) tapering
    # to a flat wrist
    sh, el, wr = J['shoulderL'], J['elbowL'], J['wristL']
    add(E((.19, 1.45, .02), (.05, .06, .055)), .03)   # (the trunk's shoulder under the deltoid, which the arm's piece covers)
    P = Ar
    add(E((.212, 1.455, .022), (.066, .088, .07), tilt((0, 0, 1), -10)), .015)
    add(C(sh + A(0, -.02, .012), el + A(0, 0, .012), .044, .036), .03)
    add(E((.206, 1.32, .055), (.034, .07, .032)), .012)
    add(E((.216, 1.36, -.012), (.036, .085, .036), tilt((0, 0, 1), -4)), .012)
    add(E((.205, 1.22, -.012), (.022, .024, .02)), .015)
    add(C(el + A(0, .01, .012), wr + A(0, .02, .012), .04, .026), .025)
    add(E((.225, 1.16, .035), (.034, .085, .032), tilt((0, 0, 1), 6)), .012)
    add(E((.188, 1.15, .018), (.03, .075, .03)), .02)
    # --- the thigh above the lower leg's own: from the hip into the pelvis, the adductors inside
    P = T
    add(C((.1, .98, .03), (.106, .74, .05), .088, .064), .04)
    add(E((.055, .87, .03), (.04, .1, .055)), .03)
    cuts = [(C((.105, 1.06, .1), (.03, .925, .118), .007, .006), .012),     # the inguinal line: the V from the hip bone to the pubis
            (C((.0, 1.33, .13), (.0, 1.05, .115), .005, .005), .01)]      # the linea alba down the abdomen
    def field(L, cut):
        def f(p):
            q = p.copy(); q[:, 0] = np.abs(q[:, 0]); d = None
            for g, k in L: d = g(q) if d is None else smin(d, g(q), k)
            for g, k in cut: d = ssub(d, g(q), k)
            return d
        return f
    return field(T, cuts), field(Ar, [])

def sdf(sp='canid'):
    fr = frames()
    H = hand.sdf(sp); L = leg.sdf(sp); F = foot.sdf(sp)
    hb, hp, hc = (placed(H[k], *fr['hand']) for k in ('body', 'pad', 'claw'))
    lb = placed(lambda p: L['body'](p) - .012, *fr['leg'])
    fb, fp = placed(F['body'], *fr['foot']), placed(F['pad'], *fr['foot'])
    fc = placed(F['claw'], *fr['foot']) if F['claw'] else None
    core, arm = torso_arm_thigh()
    def mir(g): return lambda p: g(np.c_[np.abs(p[:, :1]), p[:, 1:]])
    groups = {'core': core, 'arm': arm, 'hand': mir(hb), 'leg': mir(lb), 'foot': mir(fb)}
    # two pieces: the trunk with the legs and paws, and each arm with its paw-hand (at rest the hand lies on the thigh, the
    # forearm by the hip: one field would weld them; the arm's piece goes in under the deltoid, into the trunk's shoulder)
    def body(p): return smin(smin(groups['core'](p), groups['leg'](p), .03), groups['foot'](p), .015)
    def arms(p): return smin(groups['arm'](p), groups['hand'](p), .012)
    pad = lambda p: np.minimum(mir(hp)(p), mir(fp)(p))
    claw = lambda p: np.minimum(mir(hc)(p), mir(fc)(p)) if fc else mir(hc)(p)
    return dict(body=body, arms=arms, pad=pad, claw=claw, groups=groups, frames=fr, HJ=H['J'], LJ=L['LJ'], Fw=F['Fw'])

def build(sp='canid', step=.003):
    D = sdf(sp)
    lo = A(-.32, -.01, -.2); hi = A(.32, 1.74, .22)
    V, F, _ = Field(lo, hi, step).mesh(D['body'])
    # the arms, finer (the fingers), the left one meshed and mirrored
    va, fa, _ = Field(A(.12, .7, -.1), A(.3, 1.56, .14), step * .7).mesh(D['arms'])
    PT = np.r_[np.zeros(len(V), np.int8), np.ones(2 * len(va), np.int8)]
    V = np.concatenate([V, va, va * A(-1, 1, 1)]); F = np.concatenate([F, fa + len(V) - 2 * len(va), fa[:, ::-1] + len(V) - len(va)])
    kind = (D['pad'](V) < .0012).astype(np.int8) * 2
    # claws: finer, round each hand and paw on the left, mirrored to the right
    CV, CF = [], []; n0 = 0
    for c, r in [((J['tipL2'] + J['tipL0']) / 2, .1), (A(.11, .02, .1), .08)]:
        v, fa, _ = Field(c - r, c + r, step * .3).mesh(D['claw'])
        for sgn in (1, -1):
            w = v * A(sgn, 1, 1); ff = fa if sgn > 0 else fa[:, ::-1]
            CV.append(w); CF.append(ff + n0); n0 += len(w)
    return dict(V=V.astype(np.float32), F=F, PT=PT, kind=kind, CV=np.concatenate(CV).astype(np.float32), CF=np.concatenate(CF).astype(np.int32))

if __name__ == '__main__':
    import sys, time
    sp = sys.argv[1] if len(sys.argv) > 1 else 'canid'; out = sys.argv[2] if len(sys.argv) > 2 else f'body-{sp}.npz'
    step = float(sys.argv[3]) if len(sys.argv) > 3 else .003
    t = time.time(); m = build(sp, step); print(f'{sp}: body {len(m["V"])} v, claws {len(m["CV"])} v, {time.time() - t:.1f}s')
    np.savez_compressed(out, **m)
