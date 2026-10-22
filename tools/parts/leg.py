# Digitigrade lower leg, sculpted as a signed distance field (numbers from anatomy.md §2 and the construction sheets):
# from just above the knee to the paw's heel — the calf's two gastrocnemius heads as an inverted heart ending 0.4 down
# the shin, the Achilles tendon a band behind the bone running to the point of the hock (the calcaneus' knob, a third of
# the metatarsus' width behind the joint), the shin's front bony and straight, the metatarsus a long shaft deeper than it
# is wide. Canonical left leg: unit = the shin (knee joint to hock joint); origin at the knee joint; +y forward, +z up,
# +x toward the body's midline. Joints: T (up the thigh), K (knee), H (hock), E (the shaft's end, inside the paw's heel).
import numpy as np
from sdf import ellipsoid, round_cone, smin, Field, _n

def sdf(sp='canid'):
    """The lower leg's field function and its joints T, K, H, E."""
    u1 = _n([0, -.42, -.906]); K = np.zeros(3, np.float32); H = K + u1                       # shin: down and back
    u2 = _n([0, .34, -.94]); E = H + u2 * .6                                                # metatarsus: down, a little forward
    u0 = _n([0, -.2, .98]); T = K + u0 * .86                                                # the thigh, up to the hip joint
    fwd = lambda u: _n(np.cross(u, [1, 0, 0])) * (1 if np.cross(u, [1, 0, 0])[1] >= 0 else -1)   # forward, square to a bone
    f0, f1, f2 = fwd(u0), fwd(u1), fwd(u2); X = np.array([1, 0, 0], np.float32)                # (+x: toward the midline)
    sx = lambda p, k: p * np.array([k, 1, 1], np.float32)                                    # (side to side squeezed: a deeper than wide section)
    ax = lambda f, u: np.stack([X, f, u], 1).astype(np.float32)                              # an ellipsoid's axes: across, front, along
    parts = []
    # the thigh: a core inside the body's (which stays drawn above) and the muscles that stand out of it toward the knee —
    # the quadriceps in front (the rectus down the middle, the vastus lateralis outside and long, the vastus medialis a
    # teardrop just above the knee inside), the hamstrings' two tendons behind, framing the hollow of the knee
    parts.append((lambda p: round_cone(p, K + u0 * .05, K + u0 * .72, .12, .155), 0))
    for c, r in [(K + u0 * .45 + f0 * .095, (.08, .075, .3)), (K + u0 * .38 + f0 * .02 - X * .1, (.075, .09, .28)), (K + u0 * .17 + f0 * .05 + X * .09, (.075, .075, .13))]:
        parts.append((lambda p, c=c, r=r: ellipsoid(p, c, r, ax(f0, u0)), .035))
    for x in (-.055, .05):
        parts.append((lambda p, x=x: round_cone(p, K - f0 * .07 + X * x + u0 * .04, K + u0 * .4 - f0 * .075 + X * x * .8, .03, .055), .03))
    # the knee: the joint's block, the kneecap in front and the tibia's tuberosity under it
    parts.append((lambda p: ellipsoid(p, K + f1 * .005, (.12, .11, .11)), .04))
    parts.append((lambda p: ellipsoid(p, K + f1 * .1 + u1 * .02, (.055, .035, .06)), .025))
    parts.append((lambda p: ellipsoid(p, K + f1 * .085 + u1 * .13, (.03, .025, .04)), .03))
    # the shin: the bone's front edge, straight and narrowing to the hock, and the tibialis anterior beside it, outside
    parts.append((lambda p: round_cone(sx(p, 1.15), K + f1 * .02 + u1 * .08, H - f1 * .01, .085, .068), .04))
    parts.append((lambda p: round_cone(p, K + f1 * .055 + u1 * .14 - X * .045, H + f1 * .035 - u1 * .2 - X * .02, .045, .02), .03))
    # the calf: two heads behind the upper shin, the outer a little higher, a groove between them; ending in a point 0.4 down
    for x, dz, r in [(.038, 0, 1), (-.034, -.035, .93)]:
        c = K + u1 * (.24 + dz) - f1 * .085 + X * x * 1.3
        parts.append((lambda p, c=c, r=r: ellipsoid(p, c, (.072 * r, .1 * r, .2 * r), ax(-f1, -u1)), .035))
    # the Achilles tendon: a band from where the calf ends to the point of the hock, a hollow between it and the bone
    knob = H - f1 * .09 + u1 * .005
    parts.append((lambda p: round_cone(sx(p, 1.3), K + u1 * .4 - f1 * .085, knob, .05, .04), .06))
    # the hock: the joint (its two knuckles each side) and the calcaneus' knob behind it
    parts.append((lambda p: ellipsoid(p, H, (.08, .075, .075)), .035))
    for x in (-.06, .06): parts.append((lambda p, x=x: ellipsoid(p, H + X * x, (.025, .04, .04)), .02))
    parts.append((lambda p: ellipsoid(p, knob, (.048, .052, .058)), .025))
    # the metatarsus: a long even shaft, deeper than wide, into the paw's heel (ending inside it: the paw's own stub of it
    # rises over the end), the flexor tendons down its back and the extensors' two cords down its front
    parts.append((lambda p: round_cone(sx(p, 1.15), H + u2 * .05, E - u2 * .16, .085, .072), .05))
    parts.append((lambda p: round_cone(sx(p, 1.5), knob + u2 * .03, E - u2 * .2 - f2 * .04, .038, .028), .025))
    for x in (-.018, .018): parts.append((lambda p, x=x: round_cone(p, H + u2 * .12 + f2 * .05 + X * x, E - u2 * .2 + f2 * .045 + X * x, .016, .014), .012))
    def body(p):
        d = None
        for g, k in parts: d = g(p) if d is None else smin(d, g(p), k)
        return d
    return dict(body=body, LJ=np.stack([T, K, H, E]).astype(np.float32))

def build(sp='canid', step=.005):
    D = sdf(sp); body, J = D['body'], D['LJ']
    lo = J.min(0) - .2; hi = J.max(0) + .2
    V, F, _ = Field(lo, hi, step).mesh(body)
    return dict(V=V, F=F, kind=np.zeros(len(V), np.int8), CV=np.zeros((0, 3), np.float32), CF=np.zeros((0, 3), np.int32), LJ=J)

if __name__ == '__main__':
    import sys, time
    sp = sys.argv[1] if len(sys.argv) > 1 else 'canid'; out = sys.argv[2] if len(sys.argv) > 2 else f'leg-{sp}.npz'
    t = time.time(); m = build(sp); print(f'{sp}: leg {len(m["V"])} v, {time.time() - t:.1f}s')
    np.savez_compressed(out, **m)
