# Anthro paw-hand, sculpted as a signed distance field around a canonical hand skeleton (numbers from anatomy.md).
# Canonical left hand: wrist crease at the origin, unit H = wrist to the middle finger's tip (claw excluded), +y along the
# hand, +z the back of the hand, +x the thumb side. Joints use the app's names: finger f (0 thumb … 4 little), joints 0..2
# and the tip; the thumb's joint 0 is its root in the palm (carpometacarpal), the others' joint 0 their knuckle.
import numpy as np
from sdf import ellipsoid, round_cone, smin, ssub, claw, frame, Field, _n

def rot_x(a): c, s = np.cos(a), np.sin(a); return np.array([[1, 0, 0], [0, c, -s], [0, s, c]], np.float32)
def rot_axis(ax, a):
    ax = _n(ax); K = np.array([[0, -ax[2], ax[1]], [ax[2], 0, -ax[0]], [-ax[1], ax[0], 0]], np.float32)
    return (np.eye(3) + np.sin(a) * K + (1 - np.cos(a)) * K @ K).astype(np.float32)

# P palm length, W palm width (both in H); dig: digit 2..5 length in H (knuckle to tip); d digit width (in W);
# seg: proximal : middle : distal; curl at knuckle, middle and last joint (degrees); claw: chord in d, arc (deg), height in d,
# width/height, tip radius in d, angle below the digit line (deg); pad: digital pad (width, length, bulge) in d
SPECIES = {
    'canid': dict(P=.52, W=.53, dig=(.43, .48, .456, .36), d=.23, seg=(1, .67, .57), curl=(14, 26, 14), spread=6,
                  claw=(1.0, 75, .62, .7, .1, 15), pad=(.82, 1.05, .22), palm_pad=(.6, .5), thumb=(.17, .17, .14)),
    'felid': dict(P=.52, W=.53, dig=(.39, .43, .41, .33), d=.24, seg=(1, .67, .57), curl=(14, 30, 30), spread=6,
                  claw=(1.0, 130, .75, .5, .03, 25), pad=(.8, 1.05, .22), palm_pad=(.75, .55), thumb=(.16, .15, .13)),
    'bear':  dict(P=.56, W=.62, dig=(.3, .33, .32, .27), d=.24, seg=(1, .7, .6), curl=(10, 20, 14), spread=5,
                  claw=(1.8, 55, .68, .7, .1, 12), pad=(.85, 1.0, .2), palm_pad=(.95, .4), thumb=(.15, .13, .11)),
    'dragon': dict(P=.5, W=.5, dig=(.52, .57, .55, .45), d=.19, seg=(1, .75, .6), curl=(12, 24, 20), spread=7,
                  claw=(1.6, 140, .9, .55, .02, 20), pad=(.7, .9, .15), palm_pad=(0, 0), thumb=(.17, .17, .15)),
}

def skeleton(sp):
    """{f: [joint0, joint1, joint2, tip]} of the canonical paw-hand, and per finger its radius."""
    S = SPECIES[sp]; P, W, d = S['P'], S['W'], S['d'] * S['W']; r = d / 2
    J, R = {}, {}
    xs = np.array([1.5, .5, -.5, -1.5]) * (d + .02 * W)
    ys = P - np.array([.025, 0, .01, .055])
    sg = np.array(S['seg']) / sum(S['seg'])
    for i, f in enumerate([1, 2, 3, 4]):
        fan = np.radians(S['spread'] * (1.5 - i)); dvec = np.array([np.sin(fan), np.cos(fan), 0], np.float32)
        p = np.array([xs[i], ys[i], .012 if f in (2, 3) else 0], np.float32); pts = [p.copy()]
        for k in range(3):
            dvec = rot_x(-np.radians(S['curl'][k])) @ dvec
            p = p + dvec * S['dig'][i] * sg[k]; pts.append(p.copy())
        J[f] = pts; R[f] = r * (.92 if f == 4 else .97 if f == 1 else 1)
    # thumb: root low on the radial edge, knuckle at .4 P, splayed ~40° from the middle finger and turned to face it
    b = np.array([W * .36, .1 * P, -.03], np.float32); kn = np.array([W * .52, .4 * P, -.055], np.float32)
    dvec = _n(rot_axis([0, 0, 1], np.radians(-38)) @ np.array([0, 1, 0], np.float32) + np.array([0, 0, -.25], np.float32))
    pts = [b, kn]; p = kn.copy()
    for k, L in enumerate(S['thumb'][1:]):
        dvec = rot_x(-np.radians(12)) @ dvec if k else dvec; p = p + dvec * L; pts.append(p.copy())
    J[0] = pts; R[0] = r * 1.05
    return J, R

def build(sp='canid', step=.004):
    S = SPECIES[sp]; J, R = skeleton(sp); P, W = S['P'], S['W']
    up = np.array([0, 0, 1], np.float32)
    skin, pads, claws = [], [], []
    # palm: a box-ish pillow, thicker at the heel; the metacarpals fan from the wrist to the knuckles
    T0, T1 = .38 * W, .46 * W
    def palm(p):
        dd = ellipsoid(p, (0, P * .55, 0), (W * .5, P * .5, T0 * .5))
        dd = smin(dd, ellipsoid(p, (0, P * .2, -.01), (W * .44, P * .32, T1 * .5)), .05)
        dd = smin(dd, round_cone(p, (0, -.3, 0), (0, .02, -.005), W * .3, W * .33), .06)   # forearm stub (overlaps the body's)
        for f in (1, 2, 3, 4): dd = smin(dd, round_cone(p, J[f][0] * np.array([.5, .15, 1], np.float32), J[f][0], R[f] * 1.05, R[f] * 1.05), .04)
        return dd
    skin.append((palm, .0))
    for f in (0, 1, 2, 3, 4):
        Pt, r = J[f], R[f]
        rs = (r * 1.08, r * .98, r * .86, r * 1.0) if f else (r * 1.15, r * 1.0, r * .9, r * .98)  # narrows before the fat tip
        for k in range(3):
            skin.append((lambda p, a=Pt[k], b=Pt[k + 1], ra=rs[k], rb=rs[k + 1]: round_cone(p, a, b, ra, rb), .03 if k == 0 else .006))
        # knuckles: planes standing a little proud on the back
        for k in ((0, 1, 2) if f else (1, 2)):
            fwd = _n(Pt[min(k + 1, 3)] - Pt[k]); upk = _n(up - (up @ fwd) * fwd)
            c = Pt[k] + upk * rs[k] * .62
            skin.append((lambda p, c=c, R3=frame(fwd, upk), s=rs[k]: ellipsoid(p, c, (s * .62, s * .55, s * .45), R3), .01))
        fwd = _n(Pt[3] - Pt[2]); upk = _n(up - (up @ fwd) * fwd); side = np.cross(fwd, upk)
        # the claw: chord ~d, leaving the tip below the digit's line, hooded at the root by a rim of skin
        ch, arc, hh, ww, tr, dn = S['claw']; dw = 2 * r; arc_r = np.radians(arc); chord = ch * dw * (.8 if f == 0 else 1)
        L = chord * (arc_r / 2) / np.sin(arc_r / 2)
        base = Pt[3] + upk * rs[3] * .35 + fwd * rs[3] * .1
        cdir = _n(rot_axis(side, -np.radians(dn) + arc_r * .35) @ fwd)   # aimed up by part of its arc, so the curve ends below the line
        claws.append(lambda p, b=base, dv=cdir, u=_n(upk - (upk @ cdir) * cdir), L=L, c0=hh * dw / 2, a=arc_r, fl=ww, t=tr * dw / 2: claw(p, b, dv, u, L, c0, a, fl, t))
        hood = Pt[3] - fwd * rs[3] * .15 + upk * rs[3] * .32
        skin.append((lambda p, c=hood, R3=frame(fwd, upk), s=rs[3]: ellipsoid(p, c, (s * .9, s * .85, s * .72), R3), .008))
        # digital pad: an oval bean under the last segment, its front stopping short of the claw
        pw, pl, pb = S['pad']; sc = .8 if f == 0 else 1
        pc = Pt[2] + (Pt[3] - Pt[2]) * .6 - upk * rs[3] * (1 - pb * 1.3)
        pads.append(lambda p, c=pc, R3=frame(fwd, upk), s=dw * sc: ellipsoid(p, c, (s * pw * .53, s * pl * .52, s * .42), R3))
    # the palm pad: heart-shaped, one lobe toward the fingers, three toward the wrist; the carpal pad by the wrist
    if S['palm_pad'][0]:
        pw, ph = S['palm_pad'][0] * W, S['palm_pad'][1] * W; cy = .7 * P; zf = -T0 * .5 + .004
        # plump: the cushion, its rounded lobe toward the fingers and three full lobes toward the wrist, each its own bulge
        zf -= .014
        for c, s in [((0, cy + ph * .05, zf), (pw * .4, ph * .36, .05)), ((0, cy + ph * .26, zf - .004), (pw * .28, ph * .2, .052)),
                     ((0, cy - ph * .2, zf - .004), (pw * .2, ph * .22, .054)), ((pw * .29, cy - ph * .13, zf), (pw * .17, ph * .21, .048)),
                     ((-pw * .29, cy - ph * .13, zf), (pw * .17, ph * .21, .048))]:
            pads.append(lambda p, c=c, s=s: ellipsoid(p, c, s))
        pads.append(lambda p: ellipsoid(p, (-W * .24, .03, -T1 * .5 + .004), (.05, .055, .03)))

    def skin_f(p):
        dd = None
        for g, k in skin: dd = g(p) if dd is None else smin(dd, g(p), k)
        return dd
    def pad_f(p):
        dd = None
        for g in pads: dd = g(p) if dd is None else smin(dd, g(p), .016)
        return dd if dd is not None else np.full(len(p), 1, np.float32)
    def body(p):  # the skin with the pads raised out of it, a fine groove where pad meets fur
        s = skin_f(p); pd = pad_f(p)
        return smin(ssub(s, pd - .006, .008), pd, .003)   # a deep groove round every pad, so each one pops
    def claw_f(p):
        dd = None
        for g in claws: dd = g(p) if dd is None else np.minimum(dd, g(p))
        return dd
    allp = np.concatenate([np.stack(v) for v in J.values()])
    lo = allp.min(0) - .16; hi = allp.max(0) + .16; lo[1] = -.5
    V, F, N = Field(lo, hi, step).mesh(body)
    kind = (pad_f(V) < .005).astype(np.int8) * 2    # 2 = leather (pads), 0 = fur
    tips = np.stack([J[f][3] for f in J]); clo = tips.min(0) - .16; chi = tips.max(0) + .16
    CV, CF, CN = Field(clo, chi, step * .5).mesh(claw_f)
    return dict(V=V, F=F, kind=kind, CV=CV, CF=CF, J={k: np.stack(v) for k, v in J.items()}, R=R)

if __name__ == '__main__':
    import sys, time
    sp = sys.argv[1] if len(sys.argv) > 1 else 'canid'; out = sys.argv[2] if len(sys.argv) > 2 else f'hand-{sp}.npz'
    t = time.time(); m = build(sp); print(f'{sp}: skin {len(m["V"])} v {len(m["F"])} f, claws {len(m["CV"])} v, {time.time() - t:.1f}s')
    np.savez_compressed(out, V=m['V'], F=m['F'], kind=m['kind'], CV=m['CV'], CF=m['CF'], **{f'J{k}': v for k, v in m['J'].items()})
