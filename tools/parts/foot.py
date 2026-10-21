# Digitigrade hind paw, sculpted as a signed distance field (numbers from anatomy.md §2).
# Canonical left paw standing on the ground (z = 0): unit F = back edge of the main pad to the front of the middle toes'
# pads (claws excluded); +y forward, +z up, +x medial (toward the body's midline). Origin under the main pad's back edge.
import numpy as np
from sdf import ellipsoid, round_cone, smin, ssub, claw, frame, Field, _n

def rot_z(a): c, s = np.cos(a), np.sin(a); return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]], np.float32)

SPECIES = {
    # Fw width/length; toes: (x, y of the pad centre, pad half width, half length, splay deg) for digits 2..5 (medial to lateral);
    # mt: metatarsal pad (half width, half length, lobes behind); claw: (chord in F, arc deg, height, flat, tip, lift deg); arch: toe knuckle height in toe widths
    'canid': dict(Fw=.85, toes=[(.32, .56, .105, .13, 18), (.125, .8, .118, .15, 4), (-.125, .8, .118, .15, -4), (-.32, .56, .105, .13, -18)],
                  mt=(.25, .21, 3), claw=(.16, 70, .07, .7, .012, 12), arch=.62, meta=(.22, 70)),
    'felid': dict(Fw=1.0, toes=[(.36, .6, .11, .13, 16), (.14, .82, .12, .145, 4), (-.12, .8, .12, .14, -4), (-.36, .58, .11, .13, -16)],
                  mt=(.34, .23, 3), claw=(.07, 60, .045, .55, .006, 20), arch=.55, meta=(.24, 70)),   # (retracted: only the points show)
}

def build(sp='canid', step=.005):
    S = SPECIES[sp]; skin, pads, claws = [], [], []
    tw = 2 * S['toes'][1][2]                                   # a toe's width ~ its pad's
    # metatarsus stub rising up and back from the paw's heel (overlaps the body's leg)
    mr, ang = S['meta']; ma = np.radians(ang)
    heel = np.array([0, .16, .22], np.float32); top = heel + np.array([0, -np.cos(ma), np.sin(ma)], np.float32) * .55
    skin.append((lambda p: round_cone(p, heel, top, mr * .95, mr * .45), 0))   # tapering into the leg's shaft, which covers its top (no cuff)   # tapering into the leg's shaft, which covers its top
    # the paw's body over the main pad: a low dome from the heel to the toes' roots
    skin.append((lambda p: ellipsoid(p, (0, .34, .15), (S['Fw'] * .46, .3, .15)), .08))
    for (x, y, hw, hl, spl) in S['toes']:
        d = rot_z(np.radians(spl)) @ np.array([0, 1, 0], np.float32)
        tip = np.array([x, y, 0], np.float32) + d * hl * .3; tip[2] = tw * .45
        root = np.array([x * .85, y - .2, tw * .55], np.float32)
        knuckle = root + (tip - root) * .5; knuckle[2] = tw * (S['arch'] + .42)
        r = tw * .5
        skin.append((lambda p, a=root, b=knuckle: round_cone(p, a, b, r * 1.0, r * .98), .04))
        skin.append((lambda p, a=knuckle, b=tip: round_cone(p, a, b, r * .98, r * .9), .01))
        # the toe's fat underside, resting on its pad
        skin.append((lambda p, c=np.array([x, y, tw * .42], np.float32), R=frame(d, [0, 0, 1]): ellipsoid(p, c, (hw * 1.05, hl * 1.0, tw * .42), R), .015))
        # bean
        pads.append(lambda p, c=np.array([x, y, tw * .27], np.float32), R=frame(d, [0, 0, 1]): ellipsoid(p, c, (hw * 1.06, hl * 1.04, tw * .33), R))
        # claw out of the front of the toe, its point at the ground just ahead of the pad
        ch, arc, hh, fl, tr, lift = S['claw']
        if ch:
            arc_r = np.radians(arc); L = ch * (arc_r / 2) / np.sin(arc_r / 2)
            base = tip + d * r * .55 + np.array([0, 0, r * .25], np.float32)
            cd = _n(d * np.cos(np.radians(lift)) + np.array([0, 0, np.sin(np.radians(lift))], np.float32))
            claws.append(lambda p, b=base, dv=cd, L=L: claw(p, b, dv, np.array([0, 0, 1], np.float32) - (np.array([0, 0, 1], np.float32) @ dv) * dv, L, hh, arc_r, fl, tr))
            skin.append((lambda p, c=tip + d * r * .3 + np.array([0, 0, r * .3], np.float32), R=frame(d, [0, 0, 1]): ellipsoid(p, c, (r * .8, r * .7, r * .6), R), .01))
    # main pad: a heart, one lobe forward, three behind (the middle one largest)
    w, l, nl = S['mt']
    # a plump cushion: the body, its one rounded lobe forward and three full lobes behind, each a bulge of its own with a
    # soft valley to the next; it stands proud of the fur and squashes flat only where it meets the ground
    mt = [((0, .24, .072), (w * .85, l * .62, .085)), ((0, .34, .07), (w * .58, l * .34, .078)), ((0, .12, .07), (w * .4, l * .34, .078)),
          ((w * .52, .15, .066), (w * .36, l * .34, .072)), ((-w * .52, .15, .066), (w * .36, l * .34, .072))]
    def mainpad(p):
        dd = None
        for c, s_ in mt: e = ellipsoid(p, np.array(c, np.float32), s_); dd = e if dd is None else smin(dd, e, .04)
        return dd
    pads.append(mainpad)
    def skin_f(p):
        dd = None
        for g, k in skin: dd = g(p) if dd is None else smin(dd, g(p), k)
        return dd
    def pad_f(p):
        dd = None
        for g in pads: dd = g(p) if dd is None else smin(dd, g(p), .01)
        return dd
    def body(p):
        s = skin_f(p); pd = pad_f(p)
        s = smin(ssub(s, pd - .007, .009), pd, .003)   # a deep groove round every pad, so each one pops
        return np.maximum(s, -p[:, 2] + .0)   # flat on the ground
    lo = np.array([-.62, -.85, -.02], np.float32); hi = np.array([.62, 1.25, 1.05], np.float32)
    V, F, N = Field(lo, hi, step).mesh(body)
    kind = (pad_f(V) < .006).astype(np.int8) * 2   # the pad and where it presses flat on the ground
    if claws:
        def claw_f(p):
            dd = None
            for g in claws: dd = g(p) if dd is None else np.minimum(dd, g(p))
            return dd
        CV, CF, _ = Field(np.array([-.6, .4, -.02]), np.array([.6, 1.4, .4]), step * .5).mesh(claw_f)
    else: CV, CF = np.zeros((0, 3), np.float32), np.zeros((0, 3), np.int32)
    return dict(V=V, F=F, kind=kind, CV=CV, CF=CF, Fw=np.float32(S['Fw']))

if __name__ == '__main__':
    import sys, time
    sp = sys.argv[1] if len(sys.argv) > 1 else 'canid'; out = sys.argv[2] if len(sys.argv) > 2 else f'foot-{sp}.npz'
    t = time.time(); m = build(sp); print(f'{sp}: skin {len(m["V"])} v, claws {len(m["CV"])} v, {time.time() - t:.1f}s')
    np.savez_compressed(out, **m)
