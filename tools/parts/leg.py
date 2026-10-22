# Digitigrade lower leg, sculpted as a signed distance field (numbers from anatomy.md §2 and the construction sheets):
# from just above the knee to the paw's heel — the calf's two gastrocnemius heads as an inverted heart ending 0.4 down
# the shin, the Achilles tendon a band behind the bone running to the point of the hock (the calcaneus' knob, a third of
# the metatarsus' width behind the joint), the shin's front bony and straight, the metatarsus a long shaft deeper than it
# is wide. Canonical left leg: unit = the shin (knee joint to hock joint); origin at the knee joint; +y forward, +z up,
# +x toward the body's midline. Joints: T (up the thigh), K (knee), H (hock), E (the shaft's end, inside the paw's heel).
import numpy as np
from sdf import ellipsoid, round_cone, smin, Field, _n

def build(sp='canid', step=.006):
    u1 = _n([0, -.42, -.906]); K = np.zeros(3, np.float32); H = K + u1                       # shin: down and back
    u2 = _n([0, .34, -.94]); E = H + u2 * .6                                                # metatarsus: down, a little forward
    T = K + _n([0, -.2, .98]) * .3                                                          # up the thigh (a stub, inside the body's)
    fwd = lambda u: _n(np.cross(u, [1, 0, 0])) * (1 if np.cross(u, [1, 0, 0])[1] >= 0 else -1)   # forward, square to a bone
    f1, f2 = fwd(u1), fwd(u2)
    sx = lambda p, k: p * np.array([k, 1, 1], np.float32)                                    # (side to side squeezed: a deeper than wide section)
    parts = []
    # the thigh's stub, tapering up inside the body's thigh, and the knee: a rounded block with the kneecap in front
    parts.append((lambda p: round_cone(p, K, T, .11, .07), 0))
    parts.append((lambda p: ellipsoid(p, K + f1 * .005, (.13, .125, .12)), .05))
    parts.append((lambda p: ellipsoid(p, K + f1 * .11 + u1 * .03, (.055, .035, .06)), .04))
    # the shin bone: the front of the leg, straight and narrowing to the hock
    parts.append((lambda p: round_cone(sx(p, 1.15), K + f1 * .03 + u1 * .05, H + f1 * .01, .095, .065), .06))
    # the calf: two heads behind the upper shin, the outer a little higher; full, ending in a point 0.4 down
    for x, dz, r in [(-.034, 0, 1), (.03, -.03, .93)]:
        c = K + u1 * (.24 + dz) - f1 * .085 + np.array([x * 1.3, 0, 0], np.float32)
        parts.append((lambda p, c=c, r=r: ellipsoid(p, c, (.085 * r, .1 * r, .21 * r), np.stack([[1, 0, 0], -f1, -u1], 1).astype(np.float32)), .08))
    # the Achilles tendon: a band from where the calf ends to the point of the hock, a hollow between it and the bone
    knob = H - f1 * .095 + u1 * .005
    parts.append((lambda p: round_cone(sx(p, 1.35), K + u1 * .42 - f1 * .095, knob, .05, .04), .05))
    # the hock: the joint and the calcaneus' knob behind it
    parts.append((lambda p: ellipsoid(p, H, (.085, .085, .085)), .05))
    parts.append((lambda p: ellipsoid(p, knob, (.05, .055, .06)), .035))
    # the metatarsus: a long even shaft, deeper than wide, tendons down its back, into the paw's heel
    parts.append((lambda p: round_cone(sx(p, 1.25), H + u2 * .05, E - u2 * .02, .08, .07), .06))
    parts.append((lambda p: round_cone(sx(p, 1.5), knob + u2 * .03, E - u2 * .08 - f2 * .045, .04, .03), .035))
    def body(p):
        d = None
        for g, k in parts: d = g(p) if d is None else smin(d, g(p), k)
        return d
    J = np.stack([T, K, H, E]).astype(np.float32)
    lo = J.min(0) - .2; hi = J.max(0) + .2
    V, F, _ = Field(lo, hi, step).mesh(body)
    return dict(V=V, F=F, kind=np.zeros(len(V), np.int8), CV=np.zeros((0, 3), np.float32), CF=np.zeros((0, 3), np.int32), LJ=J)

if __name__ == '__main__':
    import sys, time
    sp = sys.argv[1] if len(sys.argv) > 1 else 'canid'; out = sys.argv[2] if len(sys.argv) > 2 else f'leg-{sp}.npz'
    t = time.time(); m = build(sp); print(f'{sp}: leg {len(m["V"])} v, {time.time() - t:.1f}s')
    np.savez_compressed(out, **m)
