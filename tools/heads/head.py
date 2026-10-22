# Our own anthro heads, sculpted as signed distance fields from the animals' anatomy (tools/heads/REFS.md: profiles
# and plans measured on live animals' photos and museum skulls, and the construction furry artists draw them with).
# Every head is built in the head-swap frame (11-heads.js): origin halfway between the eyes, unit = head height (top of
# the skull to the bottom of the jaw), +y up, +z forward, +x the head's left.
# The head's mass is a box model, as a 3D artist blocks one out: cross-sections along the head (its profile above and
# below, its width and how square it is, all as curves along z) lofted into one smooth form, each section a
# superellipse with flat top and bottom. On it the features: the eyes cut in as almond openings with lids,
# the brow ridges and cheekbones, the nose pad and nostrils, whisker pads, tufts of fur, the ears, the neck; the
# eyeballs apart (the app paints iris and pupil on them) and rigid extras (horns). Evaluated on |x|: made for the left.
#   python head.py lobo out.npz [step]
import os, sys, json, copy, numpy as np
from scipy.spatial import ConvexHull
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'parts'))
from sdf import ellipsoid, round_cone, smin, smax, ssub, sphere, Field, _n

A = lambda *v: np.array(v, np.float32)

def rot(ax, deg):
    ax = _n(ax); a = np.radians(deg); K = np.array([[0, -ax[2], ax[1]], [ax[2], 0, -ax[0]], [-ax[1], ax[0], 0]], np.float32)
    return (np.eye(3) + np.sin(a) * K + (1 - np.cos(a)) * K @ K).astype(np.float32)

_HULLS = {}
def hull_planes(pts):
    """The face planes of the convex hull of some points (outward normals, offsets), coplanar facets merged."""
    key = np.asarray(pts, np.float32).tobytes()
    if key not in _HULLS:
        E = ConvexHull(np.asarray(pts, np.float64)).equations; U = []
        for e in E:
            if not any(np.abs(e - u).max() < 1e-6 for u in U): U.append(e)
        U = np.array(U); _HULLS[key] = (U[:, :3].astype(np.float32), (-U[:, 3]).astype(np.float32))
    return _HULLS[key]

def hull(p, pts, r=.02):
    """A form given by its key points (a box model's corners): their convex hull, its edges and corners rounded by about
    r (the three nearest faces' planes smoothly: an edge or a corner rounds, a face stays where it is)."""
    N, O = hull_planes(pts); D = p @ N.T - O
    k = min(3, D.shape[1]); T = -np.partition(-D, k - 1, axis=1)[:, :k]; T = -np.sort(-T, axis=1)
    d = smax(T[:, 0], T[:, 1], r) if k > 1 else T[:, 0]
    return smax(d, T[:, 2], r) if k > 2 else d

def sym(*pts):
    """Points given on the left, mirrored to the right as well (forms across the middle line)."""
    out = []
    for q in pts:
        out.append(q)
        if abs(q[0]) > 1e-6: out.append((-q[0], q[1], q[2]))
    return out

# ---------- the box model ----------
def crv(c, z):
    c = sorted(c); return float(np.interp(z, [a for a, _ in c], [b for _, b in c]))

_TAB = {}
def table(c, sm=.025):
    """A curve given by points (z, value), joined straight and then softened (a gaussian of sm along z), sampled."""
    key = (tuple(map(tuple, c)), sm)
    if key not in _TAB:
        c = sorted(c); z = np.linspace(c[0][0] - .5, c[-1][0] + .5, 2401); v = np.interp(z, [a for a, _ in c], [b for _, b in c])
        if sm > 0:
            dz = z[1] - z[0]; k = np.arange(-int(4 * sm / dz), int(4 * sm / dz) + 1) * dz; g = np.exp(-k * k / (2 * sm * sm)); g /= g.sum()
            v = np.convolve(np.pad(v, len(k) // 2, mode='edge'), g, mode='valid')
        _TAB[key] = (z.astype(np.float32), v.astype(np.float32))
    return _TAB[key]

def loft2(q, C):
    """The box model's side in each cross-section (x >= 0): a superellipse of squareness n round its widest point
    (w, yw), from a flat top wt wide at the top line to a flat bottom wb wide at the bottom line; distance estimated
    from its implicit radius and that radius' gradient."""
    z = q[:, 2]; sm = C.get('sm', .025)   # (the top line its own: a crisp stop between the muzzle and the brow is drawn)
    f = {k: np.interp(z, *table(C[k], C.get('smt', sm) if k == 'top' else sm)) for k in ('top', 'bot', 'w', 'yw', 'wt', 'wb', 'n')}
    top, bot, w = f['top'], f['bot'], f['w']; yw = np.clip(f['yw'], bot + .02, top - .02); n = f['n']
    up = q[:, 1] >= yw; hy = np.where(up, top - yw, yw - bot); fw = np.minimum(np.where(up, f['wt'], f['wb']), w * .9); ax = w - fw
    u = np.maximum(q[:, 0] - fw, 0) / ax + 1e-6; v = np.abs(q[:, 1] - yw) / hy + 1e-6
    r = (u ** n + v ** n) ** (1 / n); g = r ** (1 - n); gx = g * u ** (n - 1) / ax; gy = g * v ** (n - 1) / hy
    return (r - 1) / np.sqrt(gx * gx + gy * gy + 1e-12)

def loft(q, C):
    """The head's box model as one smooth loft along z, capped (rounded) at its front and back stations; the distance
    corrected for how fast the sections change along z (else steep ends would count too far)."""
    h = .01; d0 = loft2(q, C); dz = (loft2(q + A(0, 0, h), C) - loft2(q - A(0, 0, h), C)) / (2 * h)
    d = d0 / np.sqrt(1 + dz * dz)
    zf, zb = C['z'][0], C['z'][-1]
    d = smax(d, q[:, 2] - zf, C.get('rf', .03))
    return smax(d, zb - q[:, 2], C.get('rb', .08))

# ---------- the eyes ----------
def almond(x, y, w, hu, hl):
    """Distance in a plane to an almond (two arcs through its corners at x = ±w, peaking hu above and hl below)."""
    def lens(x, y, h):  # the lens of half width w and half height h, pointed at its corners (Quilez sdVesica, turned)
        r = (w * w + h * h) / (2 * h); dd = r - h; px, py = np.abs(y), np.abs(x)
        return np.where((py - w) * dd > px * w, np.hypot(px, py - w), np.hypot(px + dd, py) - r)
    return np.where(y >= 0, lens(x, y, hu), lens(x, y, hl))

def eye_frame(E):
    g = rot((0, 1, 0), E['yaw']) @ rot((1, 0, 0), -E.get('pitch', 0)) @ A(0, 0, 1)
    rg = _n(np.cross(A(0, 1, 0), g)); up = np.cross(g, rg)
    t = np.radians(E.get('tilt', 0)); rg, up = rg * np.cos(t) + up * np.sin(t), -rg * np.sin(t) + up * np.cos(t)
    return g, rg, up

def eye_ops(d, q, E):
    """The eye, as a sculptor makes it: an almond opening cut through the face along the gaze (its corners w to either
    side, its arcs hu above and hl below, the outer corner raised by the tilt), the eyeball behind it with its front
    just under the face's surface, and the lids: a roll of skin round the opening, thicker above."""
    c = A(*E['c']); g, rg, up = eye_frame(E); v = q - c
    vg, vr, vu = v @ g, v @ rg, v @ up; x2 = vr - E.get('shift', 0) * vu
    a = almond(x2, vu, E['w'], E['hu'], E['hl'])
    d = ssub(d, np.maximum(a, -vg - E['re'] * .5), E.get('soft', .008))
    lid = np.where(vu > 0, E.get('lu', .016), E.get('ll', .009))   # the lids' roll: its tube round the opening's edge
    return smin(d, np.hypot(np.abs(a), vg - E['re'] * .82) - lid, .012)

# ---------- fur, ears, horns ----------
def lock(root, tip, w, t, side=(1, 0, 0)):
    """A lock of fur (or a frill) as a flat blade: its root w wide and t thick, tapering to its tip; flat across `side`."""
    root, tip = A(*root), A(*tip); ax = _n(tip - root); nn = _n(np.cross(ax, np.cross(A(*side), ax))); sd = _n(np.cross(nn, ax))
    return [root + sd * w / 2, root - sd * w / 2, root + nn * t / 2, root - nn * t / 2, root - ax * t, tip]

def ear_frame(E):
    Re = rot((0, 0, 1), -E['out']) @ rot((1, 0, 0), -E['back']) @ rot((0, 1, 0), E.get('turn', 0))
    return np.stack([Re @ A(1, 0, 0), Re @ A(0, 0, 1), Re @ A(0, 1, 0)], 1).astype(np.float32)

def ear_hull(E, inner=False):
    """An ear as a box model: a leaf from a thick base on the skull to its tip (widest a little above the base, its outer
    edge curving in to the point; round_ keeps it wide up to a rounded top), the front face hollowed (inner: the hollow,
    inside a rim)."""
    B = A(*E['base']); R = ear_frame(E); ax, nn, up = R[:, 0], R[:, 1], R[:, 2]; H, W, T = E['H'], E['W'], E['T']
    rd = E.get('round_', 0.)  # 0: a triangle, its edges nearly straight to the point; 1: wide up to a rounded top
    prof = [(0, .5, 1.), (.27, .46 + .04 * rd, .85), (.52, .34 + .14 * rd, .62), (.76, .2 + .2 * rd, .42), (.94, .07 + .17 * rd, .3)]  # (height, half width, thickness), fractions
    if not inner:
        pts = []
        for h, w, t in prof: pts += [B + up * H * h + ax * W * w, B + up * H * h - ax * W * w, B + up * H * h - nn * T * t + ax * W * w * .8, B + up * H * h - nn * T * t - ax * W * w * .8]
        return pts + [B + up * H - nn * T * .2]
    pts = []
    for h, w, t in prof[1:4]: pts += [B + up * H * h + ax * W * (w - .1) + nn * .04, B + up * H * h - ax * W * (w - .1) + nn * .04, B + up * H * h - nn * T * t * .6]
    return pts + [B + up * H * .1 + nn * .04 + ax * W * .3, B + up * H * .1 + nn * .04 - ax * W * .3, B + up * H * .88 + nn * .03, B + up * H * .88 - nn * T * .1]

def ear_tufts(E):
    """The fur inside an ear: blades from the hollow's floor near the base up towards the tip, standing out of the hollow
    (artists draw an ear's inner fluff; the ink catches where it overlaps the hollow)."""
    B = A(*E['base']); R = ear_frame(E); ax, nn, up = R[:, 0], R[:, 1], R[:, 2]; H, W = E['H'], E['W']; out = []
    for s, h, l in [(-.14, .1, .5), (.12, .14, .42), (0, .18, .6)][:E.get('fluff', 3)]:   # (fl: how far up a long ear they reach)
        root = B + up * H * h + ax * W * s - nn * .01; tip = root + up * H * l * E.get('fl', 1) + ax * W * s * .5 + nn * .035
        out.append(lock(root, tip, W * .17, .024, side=tuple(nn)))
    return out

def horn_pts(H):
    """A horn's spine: from its base it rises along d0 and curls towards d1 through `sweep` degrees, tapering."""
    B, d0, d1 = A(*H['base']), _n(H['d0']), _n(H['d1']); n = 14; out = []
    for i in range(n + 1):
        t = i / n; th = np.radians(H['sweep']) * t
        out.append((B + H['R'] * (np.sin(th) * d0 + (1 - np.cos(th)) * d1), H['r0'] + (H['r1'] - H['r0']) * t))
    return out

def head_forms(S):
    """The head's forms: the box model's pieces, the brow ridges, the cheekbones, the nose, the whisker pads, the fur."""
    C = S['prof']; L = C['z'][0]; N = S['nose']; B = S.get('brow'); Z = S.get('zyg')
    forms = [dict(loft=C)]
    if B: forms.append(dict(ab=(B['a'], B['b']), ra=B['r'][0], rb=B['r'][1], k=B.get('k', .015)))    # the brow ridge over the eye
    if Z: forms.append(dict(ab=(Z['a'], Z['b']), ra=Z['r'][0], rb=Z['r'][1], k=Z.get('k', .05)))     # the cheekbone, back from under the eye
    for m in S.get('masses') or []: forms.append(dict(c=m[0], r=m[1], k=m[2] if len(m) > 2 else .06))  # a heavy cheek, a dome
    nt = crv(C['top'], L) + N.get('up', 0); nw, nb, nf = N['w'], N['bot'], L + N['out']; kind = N.get('kind', 'can')
    if kind == 'can':    # a wide pad, its top flat, nostrils at its front corners
        forms.append(dict(pts=sym((nw * .5, nt + .012, L - .075), (nw * .72, nt, nf - .02), (nw, (nt + nb) / 2 + .01, nf), (nw * .62, nb, nf - .012), (nw * .55, nb, L - .07)), r=.02, k=.02))
    elif kind == 'fel':  # a small triangle, wide at the top, its point down to the split lip
        forms.append(dict(pts=sym((nw, nt, L - .035), (nw * .95, nt - .008, nf), (nw * .25, nb + .012, nf - .006), (0, nb, nf - .012), (nw * .55, nt + .008, L - .06), (nw * .25, nb + .02, L - .045)), r=.012, k=.015))
    elif kind == 'drag':  # two raised nostrils on top of the snout's end
        forms.append(dict(c=(nw, nt + .01, L - .06), r=(.035, .025, .045), k=.03))
    if S.get('pads'): P = S['pads']; forms.append(dict(c=P['c'], r=P['r'], k=.035))       # the whisker pads either side of the split lip
    for root, tip, w, t in S.get('tufts') or []: forms.append(dict(pts=lock(root, tip, w, t), r=.014, k=.045))   # the cheeks' fur
    for root, tip, w, t in S.get('frills') or []: forms.append(dict(pts=lock(root, tip, w, t), r=.012, k=.035))
    if S.get('beard'): forms.append(dict(pts=S['beard'], r=.02, k=.04))
    return forms

# ---------- the species ----------
# Each head: its box model (prof: z, where it ends in front (the muzzle) and behind; along z, as curves of points
# (z, value): the profile's top and bottom lines; the half width w at its widest, at height yw; the flat top's and
# bottom's half widths wt and wb; the squareness n: 2 round, 3+ boxy; rf / rb, how round its front and back ends), then the features: eye (half spacing x, eyeball radius re, gaze yaw out / pitch, the
# opening's corners w and arcs hu / hl, tilt (the outer corner up), shift (a slant), sink (the eyeball's front past the
# surface), lids lu / ll); brow and zyg (the brow ridge's and the cheekbone's ends and radii); masses (extra ellipsoids:
# centre, radii, blend); nose (kind, half width, bottom, how far it stands out); mouth: the lip line y; jaw: its hinge's
# z; ears: base, tilt out / back, turn, height, width, thickness, rounding; tufts (locks of fur: root, tip, width,
# thickness); neck: two centres and radii. Measures in head heights from between the eyes; the head is measured again
# once made (the top of its skull to the bottom of its jaw) and scaled to exactly one.
WOLF = dict(
    prof=dict(z=[.63, -.72], smt=.012,
              top=[(.63, -.08), (.45, -.04), (.25, -.005), (.13, .04), (.05, .13), (-.05, .24), (-.18, .36), (-.32, .44), (-.48, .43), (-.62, .33), (-.72, .14)],
              bot=[(.63, -.28), (.56, -.33), (.5, -.4), (.42, -.44), (.25, -.47), (.05, -.51), (-.15, -.54), (-.3, -.545), (-.45, -.46), (-.62, -.25), (-.72, -.05)],
              w=[(.63, .09), (.5, .125), (.3, .17), (.13, .225), (.02, .31), (-.12, .38), (-.3, .4), (-.48, .37), (-.62, .3), (-.72, .18)],
              yw=[(.63, -.16), (.5, -.2), (.3, -.22), (.13, -.2), (.02, -.12), (-.12, -.1), (-.3, -.06), (-.48, .05), (-.62, .08), (-.72, .05)],
              wt=[(.63, .045), (.45, .06), (.25, .075), (.13, .09), (0, .1), (-.3, .07), (-.6, .05), (-.72, .03)],
              wb=[(.63, .05), (.5, .035), (.3, .06), (.1, .09), (-.15, .11), (-.3, .12), (-.6, .08), (-.72, .04)],
              n=[(.63, 3.), (.15, 2.8), (0, 2.4), (-.4, 2.1)]),
    eye=dict(x=.21, re=.1, yaw=16, pitch=-2, w=.1, hu=.058, hl=.04, tilt=12, shift=.15, sink=-.006, lu=.017, ll=.01),
    brow=dict(a=(.1, .1, .06), b=(.31, .11, -.04), r=(.044, .038)),
    zyg=dict(a=(.27, -.06, -.02), b=(.35, -.09, -.3), r=(.05, .055)),
    nose=dict(kind='can', w=.105, bot=-.18, out=.03, up=.012, nr=.026),
    mouth=dict(y=-.27), jaw=dict(hinge=-.3),
    ears=dict(base=(.25, .37, -.34), out=20, back=12, turn=-12, H=.45, W=.47, T=.1, r=.03),
    tufts=[((.34, -.06, -.16), (.54, -.12, -.4), .16, .05), ((.33, -.2, -.14), (.52, -.3, -.36), .14, .045), ((.28, -.34, -.12), (.42, -.47, -.32), .12, .04)],
    neck=((0, -.3, -.42), (0, -1.05, -.44), .28, .31))
CAT = dict(
    prof=dict(z=[.33, -.64],
              top=[(.33, -.065), (.26, -.035), (.17, .02), (.09, .1), (0, .2), (-.12, .33), (-.26, .42), (-.4, .44), (-.52, .38), (-.6, .25), (-.64, .08)],
              bot=[(.33, -.225), (.29, -.27), (.24, -.31), (.17, -.36), (.05, -.42), (-.1, -.49), (-.25, -.54), (-.36, -.55), (-.48, -.45), (-.58, -.25), (-.64, -.05)],
              w=[(.33, .1), (.26, .17), (.17, .24), (.08, .31), (0, .37), (-.12, .43), (-.26, .44), (-.42, .39), (-.56, .3), (-.64, .16)],
              yw=[(.33, -.13), (.24, -.16), (.1, -.16), (0, -.12), (-.15, -.1), (-.3, -.04), (-.45, .06), (-.64, .05)],
              wt=[(.33, .04), (.2, .07), (.05, .1), (-.2, .09), (-.5, .06), (-.64, .03)],
              wb=[(.33, .05), (.24, .04), (.1, .06), (-.1, .1), (-.3, .12), (-.6, .07), (-.64, .03)],
              n=[(.33, 2.5), (0, 2.3), (-.4, 2.)]),
    eye=dict(x=.2, re=.11, yaw=10, pitch=-2, w=.11, hu=.075, hl=.052, tilt=14, shift=.1, sink=-.006, lu=.015, ll=.009),
    brow=dict(a=(.1, .11, .06), b=(.3, .12, -.03), r=(.028, .024)),
    zyg=dict(a=(.27, -.06, -.02), b=(.36, -.08, -.28), r=(.05, .055)),
    pads=dict(c=(.07, -.16, .26), r=(.08, .06, .06)),
    nose=dict(kind='fel', w=.06, bot=-.12, out=.012, up=.01),
    mouth=dict(y=-.21), jaw=dict(hinge=-.28),
    ears=dict(base=(.25, .37, -.2), out=16, back=6, turn=-18, H=.42, W=.46, T=.085, r=.025),
    tufts=[((.36, -.08, -.14), (.52, -.16, -.32), .14, .045), ((.33, -.22, -.12), (.48, -.33, -.28), .12, .04)],
    neck=((0, -.3, -.36), (0, -1.05, -.38), .26, .29))
BEAR = dict(
    prof=dict(z=[.58, -.7],
              top=[(.58, -.075), (.45, -.04), (.3, -.01), (.18, .03), (.1, .1), (0, .22), (-.12, .34), (-.28, .43), (-.44, .44), (-.58, .34), (-.7, .1)],
              bot=[(.58, -.28), (.52, -.34), (.46, -.41), (.37, -.46), (.2, -.5), (-.05, -.54), (-.28, -.555), (-.45, -.47), (-.6, -.27), (-.7, -.05)],
              w=[(.58, .12), (.45, .155), (.3, .2), (.15, .27), (.02, .38), (-.15, .47), (-.32, .48), (-.5, .42), (-.62, .32), (-.7, .2)],
              yw=[(.58, -.17), (.3, -.2), (.1, -.17), (0, -.12), (-.2, -.08), (-.4, .02), (-.7, .03)],
              wt=[(.58, .065), (.3, .09), (.1, .12), (-.2, .14), (-.5, .1), (-.7, .04)],
              wb=[(.58, .07), (.45, .06), (.3, .08), (0, .14), (-.3, .16), (-.6, .1), (-.7, .04)],
              n=[(.58, 2.8), (0, 2.4), (-.4, 2.1)]),
    eye=dict(x=.2, re=.075, yaw=8, pitch=-2, w=.072, hu=.045, hl=.034, tilt=4, shift=.05, sink=-.006, lu=.014, ll=.008),
    brow=dict(a=(.09, .1, .07), b=(.28, .1, -.03), r=(.035, .03)),
    zyg=dict(a=(.27, -.06, -.02), b=(.38, -.08, -.3), r=(.055, .06)),
    nose=dict(kind='can', w=.13, bot=-.18, out=.03, up=.015, nr=.026),
    mouth=dict(y=-.27), jaw=dict(hinge=-.3),
    ears=dict(base=(.3, .36, -.3), out=32, back=5, turn=-10, H=.22, W=.28, T=.09, round_=1, r=.03),
    tufts=[((.4, -.1, -.18), (.54, -.18, -.34), .14, .05)],
    neck=((0, -.3, -.42), (0, -1.05, -.44), .3, .33))
COON = dict(
    prof=dict(z=[.52, -.62],
              top=[(.52, -.085), (.4, -.05), (.25, -.01), (.14, .04), (.05, .14), (-.08, .29), (-.22, .4), (-.36, .44), (-.5, .38), (-.58, .24), (-.62, .08)],
              bot=[(.52, -.25), (.46, -.29), (.4, -.34), (.3, -.38), (.12, -.43), (-.08, -.49), (-.25, -.54), (-.36, -.555), (-.48, -.45), (-.58, -.24), (-.62, -.05)],
              w=[(.52, .07), (.4, .1), (.25, .15), (.12, .22), (0, .34), (-.14, .44), (-.3, .45), (-.45, .4), (-.56, .3), (-.62, .17)],
              yw=[(.52, -.16), (.3, -.18), (.1, -.15), (0, -.1), (-.2, -.08), (-.4, .04), (-.62, .04)],
              wt=[(.52, .035), (.3, .06), (.1, .09), (-.2, .1), (-.5, .06), (-.62, .03)],
              wb=[(.52, .04), (.4, .03), (.2, .05), (0, .09), (-.3, .12), (-.55, .08), (-.62, .03)],
              n=[(.52, 2.7), (0, 2.3), (-.4, 2.)]),
    eye=dict(x=.2, re=.09, yaw=14, pitch=-2, w=.088, hu=.054, hl=.04, tilt=10, shift=.1, sink=-.006, lu=.015, ll=.009),
    brow=dict(a=(.1, .1, .06), b=(.3, .11, -.04), r=(.032, .028)),
    zyg=dict(a=(.27, -.06, -.02), b=(.37, -.08, -.28), r=(.05, .055)),
    nose=dict(kind='can', w=.075, bot=-.15, out=.02, up=.01, nr=.018),
    mouth=dict(y=-.25), jaw=dict(hinge=-.28),
    ears=dict(base=(.27, .38, -.3), out=22, back=10, turn=-12, H=.26, W=.3, T=.08, round_=.7, r=.025),
    tufts=[((.4, -.08, -.16), (.6, -.16, -.36), .16, .05), ((.38, -.22, -.14), (.56, -.34, -.32), .14, .045), ((.32, -.36, -.12), (.46, -.5, -.28), .12, .04)],
    neck=((0, -.3, -.38), (0, -1.05, -.4), .26, .29))
RABBIT = dict(
    prof=dict(z=[.33, -.6],
              top=[(.33, -.07), (.26, -.025), (.16, .05), (.06, .16), (-.06, .3), (-.2, .41), (-.34, .45), (-.46, .4), (-.55, .27), (-.6, .1)],
              bot=[(.33, -.215), (.29, -.25), (.23, -.3), (.15, -.35), (.02, -.42), (-.14, -.49), (-.3, -.55), (-.42, -.5), (-.53, -.3), (-.6, -.06)],
              w=[(.33, .1), (.24, .16), (.12, .24), (0, .33), (-.14, .39), (-.3, .4), (-.45, .36), (-.55, .27), (-.6, .15)],
              yw=[(.33, -.12), (.2, -.13), (0, -.1), (-.2, -.08), (-.4, .02), (-.6, .04)],
              wt=[(.33, .045), (.2, .07), (0, .1), (-.3, .09), (-.6, .03)],
              wb=[(.33, .05), (.25, .04), (.1, .06), (-.15, .1), (-.4, .1), (-.6, .03)],
              n=[(.33, 2.4), (0, 2.2), (-.4, 2.)]),
    eye=dict(x=.23, re=.11, yaw=34, pitch=-2, w=.1, hu=.08, hl=.065, tilt=4, shift=0, sink=-.006, lu=.014, ll=.009),
    brow=dict(a=(.1, .11, .05), b=(.27, .12, -.04), r=(.02, .018)),
    zyg=dict(a=(.26, -.06, -.02), b=(.33, -.08, -.26), r=(.045, .05)),
    pads=dict(c=(.05, -.13, .27), r=(.065, .05, .05)),
    nose=dict(kind='fel', w=.035, bot=-.09, out=.008, up=.006),
    mouth=dict(y=-.19), jaw=dict(hinge=-.22),
    ears=dict(base=(.13, .4, -.26), out=6, back=16, turn=-20, H=.85, W=.3, T=.07, round_=.6, r=.025, fluff=2, fl=.35),
    tufts=[((.36, -.12, -.12), (.46, -.2, -.26), .12, .04)],
    neck=((0, -.3, -.34), (0, -1.05, -.36), .25, .28))
GOAT = dict(
    prof=dict(z=[.72, -.55],
              top=[(.72, -.12), (.6, -.08), (.45, -.03), (.3, .03), (.15, .1), (.05, .16), (-.08, .27), (-.2, .38), (-.32, .43), (-.44, .38), (-.52, .22), (-.55, .05)],
              bot=[(.72, -.33), (.68, -.37), (.62, -.4), (.5, -.42), (.3, -.45), (.1, -.5), (-.1, -.55), (-.22, -.56), (-.35, -.48), (-.48, -.3), (-.55, -.08)],
              w=[(.72, .085), (.6, .1), (.45, .13), (.3, .17), (.15, .23), (0, .31), (-.15, .34), (-.3, .32), (-.45, .26), (-.55, .15)],
              yw=[(.72, -.22), (.5, -.23), (.3, -.2), (.1, -.13), (0, -.08), (-.2, -.05), (-.4, .04), (-.55, .03)],
              wt=[(.72, .04), (.45, .06), (.2, .08), (0, .1), (-.3, .08), (-.55, .03)],
              wb=[(.72, .04), (.6, .03), (.3, .05), (0, .08), (-.25, .1), (-.55, .03)],
              n=[(.72, 2.6), (.3, 2.6), (0, 2.3), (-.4, 2.)]),
    eye=dict(x=.24, re=.095, yaw=36, pitch=-2, w=.09, hu=.052, hl=.042, tilt=0, shift=0, sink=-.006, lu=.016, ll=.01),
    brow=dict(a=(.1, .09, .06), b=(.28, .1, -.06), r=(.035, .03)),
    zyg=dict(a=(.25, -.08, 0), b=(.3, -.1, -.25), r=(.045, .05)),
    nose=dict(kind='none', w=.055, bot=-.24, out=0, nr=.02),
    mouth=dict(y=-.32), jaw=dict(hinge=-.22),
    ears=dict(base=(.25, .2, -.2), out=72, back=10, turn=-40, H=.32, W=.17, T=.06, r=.02, fluff=2, fl=.7),
    horns=dict(base=(.11, .36, -.08), d0=(.15, 1, -.3), d1=(.1, -.15, -1), R=.32, sweep=125, r0=.055, r1=.012),
    beard=sym((.04, -.38, .44), (0, -.68, .38), (.045, -.4, .32), (0, -.4, .5)),
    neck=((0, -.3, -.3), (0, -1.05, -.34), .24, .27))
HORSE = dict(
    prof=dict(z=[1., -.5], rf=.08,
              top=[(1., -.19), (.92, -.15), (.8, -.11), (.6, -.06), (.4, 0), (.2, .07), (.05, .14), (-.08, .25), (-.2, .35), (-.3, .38), (-.4, .33), (-.48, .18), (-.5, .05)],
              bot=[(1., -.43), (.96, -.48), (.9, -.53), (.82, -.55), (.7, -.53), (.55, -.52), (.35, -.55), (.15, -.6), (0, -.64), (-.15, -.65), (-.28, -.56), (-.4, -.38), (-.5, -.12)],
              w=[(1., .14), (.9, .16), (.78, .14), (.62, .125), (.45, .14), (.25, .19), (.1, .25), (0, .3), (-.12, .32), (-.25, .3), (-.38, .25), (-.5, .15)],
              yw=[(1., -.33), (.8, -.33), (.5, -.28), (.25, -.24), (.1, -.2), (0, -.15), (-.15, -.22), (-.3, -.12), (-.5, 0)],
              wt=[(1., .07), (.8, .065), (.5, .07), (.2, .09), (0, .11), (-.3, .08), (-.5, .03)],
              wb=[(1., .08), (.9, .06), (.6, .05), (.3, .06), (0, .12), (-.15, .15), (-.35, .1), (-.5, .03)],
              n=[(1., 2.5), (.7, 2.8), (.3, 2.8), (0, 2.4), (-.3, 2.1)]),
    masses=[((.2, -.38, -.1), (.12, .2, .22), .08)],
    eye=dict(x=.25, re=.1, yaw=40, pitch=-2, w=.1, hu=.058, hl=.045, tilt=0, shift=0, sink=-.006, lu=.017, ll=.01),
    brow=dict(a=(.11, .08, .05), b=(.29, .09, -.06), r=(.035, .03)),
    zyg=dict(a=(.26, -.06, .02), b=(.32, -.12, -.2), r=(.04, .045)),
    nose=dict(kind='none', w=.1, bot=-.31, out=0, nr=.052),
    mouth=dict(y=-.41), jaw=dict(hinge=-.25),
    ears=dict(base=(.16, .36, -.22), out=10, back=4, turn=-30, H=.32, W=.17, T=.06, r=.02, fluff=2, fl=.7),
    neck=((0, -.3, -.3), (0, -1.05, -.34), .26, .29))
DRAGON = dict(
    prof=dict(z=[.75, -.6], rf=.1,
              top=[(.75, -.1), (.6, -.06), (.4, -.02), (.25, .02), (.12, .07), (.03, .13), (-.08, .24), (-.2, .35), (-.34, .42), (-.48, .38), (-.56, .24), (-.6, .08)],
              bot=[(.75, -.3), (.7, -.34), (.62, -.37), (.45, -.4), (.25, -.44), (.05, -.5), (-.15, -.55), (-.3, -.56), (-.42, -.46), (-.54, -.26), (-.6, -.06)],
              w=[(.75, .065), (.69, .1), (.6, .12), (.4, .15), (.2, .2), (.05, .28), (-.1, .34), (-.28, .36), (-.44, .33), (-.55, .25), (-.6, .15)],
              yw=[(.75, -.17), (.5, -.2), (.2, -.2), (0, -.12), (-.2, -.1), (-.4, .02), (-.6, .03)],
              wt=[(.75, .07), (.5, .08), (.2, .1), (0, .12), (-.3, .1), (-.6, .04)],
              wb=[(.75, .06), (.6, .05), (.3, .07), (0, .1), (-.3, .12), (-.6, .04)],
              n=[(.75, 2.6), (.5, 2.9), (.2, 3.), (0, 2.6), (-.4, 2.2)]),
    eye=dict(x=.22, re=.09, yaw=18, pitch=-2, w=.09, hu=.045, hl=.04, tilt=14, shift=.15, sink=-.006, lu=.02, ll=.011),
    brow=dict(a=(.1, .11, .08), b=(.31, .12, -.08), r=(.045, .04), k=.06),
    zyg=dict(a=(.27, -.04, -.02), b=(.36, -.06, -.3), r=(.05, .055)),
    nose=dict(kind='drag', w=.065, bot=-.12, out=0, nr=.016),
    mouth=dict(y=-.28), jaw=dict(hinge=-.3),
    ears=None,
    frills=[((.32, -.08, -.22), (.6, -.02, -.5), .2, .03), ((.3, -.22, -.2), (.54, -.3, -.46), .17, .028)],
    horns=dict(base=(.17, .38, -.24), d0=(.2, .45, -1), d1=(0, -1, -.3), R=.55, sweep=50, r0=.065, r1=.012),
    neck=((0, -.3, -.4), (0, -1.05, -.42), .27, .3))
KEMONO = dict(
    prof=dict(z=[.36, -.6],
              top=[(.36, -.09), (.28, -.05), (.18, .02), (.1, .1), (0, .22), (-.12, .38), (-.26, .5), (-.4, .55), (-.52, .48), (-.58, .3), (-.6, .1)],
              bot=[(.36, -.22), (.32, -.25), (.26, -.29), (.18, -.33), (.05, -.38), (-.1, -.43), (-.26, -.46), (-.4, -.42), (-.52, -.28), (-.6, -.06)],
              w=[(.36, .08), (.26, .13), (.15, .2), (.05, .3), (-.08, .4), (-.24, .44), (-.4, .42), (-.52, .34), (-.6, .18)],
              yw=[(.36, -.15), (.2, -.16), (0, -.1), (-.2, -.02), (-.4, .08), (-.6, .06)],
              wt=[(.36, .04), (.2, .06), (0, .1), (-.3, .12), (-.6, .04)],
              wb=[(.36, .04), (.25, .035), (.1, .05), (-.1, .09), (-.35, .1), (-.6, .04)],
              n=[(.36, 2.5), (0, 2.2), (-.4, 2.)]),
    eye=dict(x=.22, re=.13, yaw=12, pitch=-2, w=.12, hu=.1, hl=.075, tilt=6, shift=.05, sink=-.006, lu=.015, ll=.009),
    brow=dict(a=(.1, .12, .06), b=(.3, .13, -.04), r=(.022, .02)),
    zyg=None,
    nose=dict(kind='can', w=.055, bot=-.13, out=.015, up=.01, nr=.014),
    mouth=dict(y=-.21), jaw=dict(hinge=-.26),
    ears=dict(base=(.25, .42, -.3), out=20, back=12, turn=-12, H=.6, W=.52, T=.09, r=.03),
    tufts=[((.38, -.1, -.12), (.56, -.18, -.28), .14, .05), ((.35, -.22, -.1), (.5, -.32, -.24), .12, .045)],
    neck=((0, -.3, -.34), (0, -1.05, -.36), .24, .27))
FAMS = dict(lobo=WOLF, gato=CAT, oso=BEAR, mapache=COON, conejo=RABBIT, cabra=GOAT, caballo=HORSE, dragon=DRAGON, kemono=KEMONO)
# each species: its family's head, its own changes, xf: the muzzle mz times as long, mw times as wide, the skull sk wide
SPECIES = {
  'lobo': {},
  'perro': dict(xf=dict(mz=.86, mw=1.08), eye=dict(w=.1, hu=.064, tilt=8), ears=dict(H=.42, W=.46, round_=.2)),
  'zorro': dict(xf=dict(mw=.78, sk=.95), eye=dict(tilt=18, hu=.054), nose=dict(w=.085, bot=-.16, nr=.021), ears=dict(base=(.25, .38, -.3), H=.58, W=.54, T=.09),
                tufts=[((.33, -.06, -.16), (.58, -.14, -.42), .17, .05), ((.32, -.2, -.14), (.55, -.32, -.38), .15, .045), ((.27, -.34, -.12), (.44, -.5, -.32), .12, .04)]),
  'coyote': dict(xf=dict(mw=.86, mz=1.02), ears=dict(H=.54, W=.5)),
  'hiena': dict(xf=dict(mz=.84, mw=1.15, sk=1.05), eye=dict(re=.09, w=.088, hu=.052), ears=dict(round_=.9, H=.3, W=.36, out=26, back=10, T=.09),
                tufts=[((.34, -.08, -.16), (.48, -.14, -.34), .14, .045)]),
  'gato': dict(fam='gato'),
  'tigre': dict(fam='gato', xf=dict(mz=1.45, mw=1.15, sk=1.08), eye=dict(re=.095, w=.095, hu=.062, hl=.046, tilt=8), nose=dict(w=.085, bot=-.13),
                pads=dict(c=(.09, -.16, .25), r=(.1, .075, .075)), ears=dict(base=(.3, .36, -.26), round_=.9, H=.26, W=.32, out=25),
                tufts=[((.38, -.06, -.14), (.6, -.14, -.36), .18, .05), ((.36, -.22, -.12), (.56, -.36, -.32), .16, .045), ((.3, -.36, -.12), (.44, -.5, -.28), .12, .04)]),
  'leon': dict(fam='gato', xf=dict(mz=1.6, mw=1.18, sk=1.08), eye=dict(re=.09, w=.09, hu=.058, hl=.045, tilt=8), brow=dict(r=(.036, .03)), nose=dict(w=.09, bot=-.13),
               pads=dict(c=(.09, -.16, .25), r=(.1, .075, .075)), ears=dict(base=(.3, .36, -.28), round_=1, H=.22, W=.28, out=28), tufts=None),
  'leopardo': dict(fam='gato', xf=dict(mz=1.18, mw=1.05), eye=dict(re=.105), ears=dict(base=(.28, .37, -.26), round_=.9, H=.21, W=.27, out=24),
                   tufts=[((.37, -.07, -.14), (.56, -.15, -.34), .16, .05), ((.34, -.22, -.12), (.52, -.34, -.3), .14, .045)]),
  'oso': dict(fam='oso'),
  'mapache': dict(fam='mapache'),
  'panda': dict(fam='mapache', xf=dict(mz=.78, sk=1.04), ears=dict(base=(.28, .38, -.26), round_=.6, H=.32, W=.38, out=22)),
  'mofeta': dict(fam='mapache', xf=dict(mw=.85), eye=dict(re=.08, w=.08, hu=.05), ears=dict(base=(.26, .37, -.27), round_=1, H=.17, W=.22),
                 tufts=[((.36, -.1, -.16), (.5, -.18, -.32), .12, .04)]),
  'conejo': dict(fam='conejo'),
  'cabra': dict(fam='cabra'),
  'ciervo': dict(fam='cabra', xf=dict(mw=.9, mz=.95), eye=dict(re=.105, w=.1, hu=.06, yaw=32), nose=dict(kind='can', w=.065, bot=-.19, out=.015, up=.008, nr=.016),
                 ears=dict(H=.45, W=.22, out=50, back=14), horns=None, beard=None),
  'caballo': dict(fam='caballo', xf=dict(mz=.92)),
  'dragon': dict(fam='dragon'),
  'zorro_k': dict(fam='kemono'),
}

def xform(P, mz=1., mw=1., sk=1.):
    """A variant of a family's head: everything in front of the eyes mz times as far forward, the muzzle mw times as
    wide, the skull sk times as wide."""
    C = P['prof']; wk = ('w', 'wt', 'wb')
    for k in ('top', 'bot', 'w', 'yw', 'wt', 'wb', 'n'):
        C[k] = [(z * mz if z > 0 else z, v * (mw if k in wk and z > .1 else sk if k in wk and z < 0 else 1)) for z, v in C[k]]
    C['z'] = [C['z'][0] * mz, C['z'][-1]]
    if P.get('pads'): c = P['pads']['c']; P['pads'] = {**P['pads'], 'c': (c[0] * mw, c[1], c[2] * mz)}

def params(sp):
    S = SPECIES[sp]; P = copy.deepcopy(FAMS[S.get('fam', 'lobo')])
    for k, v in S.items():
        if k in ('fam', 'xf'): continue
        if isinstance(v, dict) and isinstance(P.get(k), dict): P[k] = {**P[k], **v}
        else: P[k] = copy.deepcopy(v)
    if S.get('xf'): xform(P, **S['xf'])
    return P

def build_sdf(S):
    N, Jw, ER = S['nose'], S['jaw'], S.get('ears'); my = S['mouth']['y']; C = S['prof']
    forms = head_forms(S)
    if ER: ear_o, ear_i, ear_fl = ear_hull(ER), ear_hull(ER, True), ear_tufts(ER)
    def core(q):
        d = None
        for f in forms:
            if 'loft' in f: e = loft(q, f['loft'])
            elif 'pts' in f: e = hull(q, f['pts'], f.get('r', .03))
            elif 'ab' in f: e = round_cone(q, A(*f['ab'][0]), A(*f['ab'][1]), f['ra'], f['rb'])
            else: e = ellipsoid(q, f['c'], f['r'], rot(f['ax'], f['deg']) if 'ax' in f else None)
            d = e if d is None else smin(d, e, f.get('k', .05))
        a, b, ra, rb = S['neck']; return smin(d, round_cone(q, a, b, ra, rb), .12)
    def ear_f(q):
        d = ssub(hull(q, ear_o, ER.get('r', .025)), hull(q, ear_i, .015), .006)
        for t in ear_fl: d = smin(d, hull(q, t, .01), .015)
        return d
    mir = lambda p: np.c_[np.abs(p[:, :1]), p[:, 1:]].astype(np.float32)
    # the eye: its front just under the face's surface in front of it (found along the gaze), the head moved back so
    # the eyes stay at z = 0
    E = S['eye']; g, _, _ = eye_frame(E)
    c0 = A(E['x'], 0, 0); t = np.linspace(-.4, .4, 1601, dtype=np.float32); ray = c0[None] + t[:, None] * g[None]
    out = core(ray) > 0; k = np.nonzero(out & (t > -.3))[0]; zf = t[k[0]] if len(k) else 0
    off = A(0, 0, (zf - E['re'] + E.get('sink', .006)) * g[2])
    ec = A(E['x'], 0, 0); eye = {**E, 'c': ec + off}
    L_ = C['z'][0]; nf, nb, nt, kind = L_ + N['out'], N['bot'], crv(C['top'], L_) + N.get('up', 0), N.get('kind', 'can')
    def skin(p):
        q = mir(p) + off                              # (the head moved back so the eyes sit at z = 0)
        e = eye_ops(core(q), q, eye)
        nr = N.get('nr', .022)
        if kind in ('can', 'fel'):    # nostrils: commas opening forward and out at the pad's front corners
            ncn = A(N['w'] * (.48 if kind == 'can' else .55), (nt + nb) / 2 - (.008 if kind == 'can' else -.004), nf - .006)
            e = ssub(e, ellipsoid(q, ncn, (nr, nr * .55, nr * 1.1), rot((0, 0, 1), 28) @ rot((0, 1, 0), 25)), .006)
        elif kind == 'none':          # a horse's: long open nostrils on the muzzle's front corners
            e = ssub(e, ellipsoid(q, A(N['w'], (nt + nb) / 2, L_ - .035), (nr * .55, nr * 1.2, nr), rot((0, 0, 1), -18) @ rot((0, 1, 0), 35)), .012)
        elif kind == 'drag':          # a dragon's: on top of its raised nostril bumps, opening up and forward
            e = ssub(e, ellipsoid(q, A(N['w'], nt + .028, L_ - .05), (nr, nr * .6, nr * 1.4), rot((1, 0, 0), -30)), .006)
        if kind in ('can', 'fel'):    # the philtrum, the groove from the nose down to the lip line (split there on a cat or a rabbit)
            e = ssub(e, round_cone(q, A(0, nb + .006, nf - .012), A(0, my + .012, L_ - .025), .008, .006), .008)
            if S.get('pads'): e = ssub(e, ellipsoid(q, A(0, my + .006, L_ - .015), (.012, .018, .03)), .008)
        return smin(e, ear_f(q), .035) if ER else e
    def ear_w(p):
        if not ER: return np.zeros(len(p), np.float32)
        q = mir(p) + off; d = core(q); e = ear_f(q)
        t = np.clip((d - e + .004) / .03, 0, 1); return t * t * (3 - 2 * t)
    horns = None
    if S.get('horns'):
        spine = horn_pts(S['horns'])
        def horns(p):
            q = mir(p) + off; d = None
            for (a, ra), (b, rb) in zip(spine, spine[1:]): e = round_cone(q, a, b, ra, rb); d = e if d is None else np.minimum(d, e)
            return d
    oz = float(off[2]); jaw_bot = min(crv(C['bot'], z) for z in np.linspace(Jw['hinge'], L_, 40))
    L = dict(eyeL=[E['x'], 0., 0.], eyeR=[-E['x'], 0., 0.], mouthY=float(my), hingeZ=float(Jw['hinge'] - oz),
             neck=[0., float(jaw_bot + .02), float(S['neck'][0][2] - oz)], eyeR_=float(E['re']), eyeYaw=float(E['yaw']))
    return dict(skin=skin, ear=ear_w, horns=horns, eyes=[(ec, E['re']), (ec * A(-1, 1, 1), E['re'])], L=L, oz=oz, jaw_bot=jaw_bot)

def build(sp, step=.006):
    S = params(sp); D = build_sdf(S); C = S['prof']
    top = max(y for _, y in C['top']); lo = A(-.9, D['jaw_bot'] - 1.0, C['z'][-1] - .15 - D['oz']); hi = A(.9, top + 1.1, C['z'][0] + .12 - D['oz'])
    V, F, _ = Field(lo, hi, step).mesh(D['skin'])
    ear = D['ear'](V).astype(np.float32)
    HV, HF = np.zeros((0, 3), np.float32), np.zeros((0, 3), np.int32)
    if D['horns']: HV, HF, _ = Field(A(-.8, -.2, -1.4 - D['oz']), A(.8, 1.4, .3 - D['oz']), step * .7).mesh(D['horns'])
    EV, EF = [], []; n0 = 0
    for c, r in D['eyes']:
        v, f, _ = Field(c - r - .02, c + r + .02, step * .5).mesh(lambda p, c=c, r=r: sphere(p, c, r))
        EV.append(v); EF.append(f + n0); n0 += len(v)
    EV = np.concatenate(EV).astype(np.float32); EF = np.concatenate(EF).astype(np.int32)
    # measured: the skull's top (not the ears'), the jaw's bottom from the profile; everything scaled so that is one
    L = D['L']; skull = (ear < .3) & (np.abs(V[:, 0]) < .3) & (V[:, 2] < .2)
    crown = float(V[skull, 1].max()); u = 1 / (crown - D['jaw_bot'])
    V, EV, HV = V * u, EV * u, HV * u
    for k in ('eyeL', 'eyeR', 'neck'): L[k] = [float(v * u) for v in L[k]]
    for k in ('mouthY', 'hingeZ', 'eyeR_'): L[k] = float(L[k] * u)
    L['crown'], L['chin'] = crown * u, D['jaw_bot'] * u
    mid = (np.abs(V[:, 0]) < .03) & (V[:, 1] > L['mouthY']) & (V[:, 1] < .05)
    tip = V[mid][np.argmax(V[mid][:, 2])]; L['tip'] = [0., float(tip[1]), float(tip[2])]
    return dict(V=V.astype(np.float32), F=F, ear=ear, EV=EV, EF=EF, HV=HV.astype(np.float32), HF=HF.astype(np.int32), L=L,
                eyes=[(c * u, r * u) for c, r in D['eyes']])

if __name__ == '__main__':
    import time
    sp = sys.argv[1] if len(sys.argv) > 1 else 'lobo'; out = sys.argv[2] if len(sys.argv) > 2 else f'head-{sp}.npz'
    step = float(sys.argv[3]) if len(sys.argv) > 3 else .006
    t = time.time(); m = build(sp, step)
    TV = np.concatenate([m['EV'], m['HV']]); TF = np.concatenate([m['EF'], m['HF'] + len(m['EV'])])
    np.savez_compressed(out, V=m['V'], F=m['F'], ear=m['ear'], kind=np.zeros(len(m['V']), np.int8), TV=TV, TF=TF, L=json.dumps(m['L']))
    print(f'{sp}: {len(m["V"])} v, eyes {len(m["EV"])} v, horns {len(m["HV"])} v, {time.time() - t:.1f}s', {k: (np.round(v, 3).tolist() if isinstance(v, list) else round(v, 3)) for k, v in m['L'].items()})
