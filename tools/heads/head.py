# Our own anthro heads, sculpted as signed distance fields from the animals' anatomy and the way furry sculptors build
# a stylised head (tools/heads/REFS.md): profiles and plans measured on live animals' photos and museum skulls, the
# masses and the planes from professional busts, looked at and measured, never copied.
# Every head is built in the head-swap frame (11-heads.js): origin halfway between the eyes, unit = head height (top of
# the skull to the bottom of the jaw), +y up, +z forward, +x the head's left. Evaluated on |x|: made for the left.
#
# The head is put together the way a modeller blocks one out, form by form, each blended into the last:
#   the head's mass, lofted through drawn cross-sections from the nose back to the nape (as a modeller lays out edge
#   loops: the muzzle a box with a flat bridge and full upper lips, the face round the eyes, the cheeks, the braincase);
#   the lower jaw under it, narrower, rising inside the muzzle so the two are one solid and the upper lip overhangs it;
#   whisker pads and heavy cheeks where the animal has them, the flesh round a short face's eyes, the nose leather; the
#   brow ridges, tubes standing out of the forehead and overhanging the eyes.
# Then it is carved: the smile behind the mouth's corners, the nostrils and the philtrum, the furrow between the brows,
# the almond openings with lids round them. Last the fur and the rest: tufts of fur laid on the cheeks and flaring off
# them, the ears (shells with a cup and fluff inside), horns, a goatee.
#   python head.py lobo out.npz [step]
import os, sys, json, copy, numpy as np
from scipy.spatial import ConvexHull
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'parts'))
from sdf import ellipsoid, round_cone, smin, smax, ssub, sphere, Field, _n

A = lambda *v: np.array(v, np.float32)

def rot(ax, deg):
    ax = _n(ax); a = np.radians(deg); K = np.array([[0, -ax[2], ax[1]], [ax[2], 0, -ax[0]], [-ax[1], ax[0], 0]], np.float32)
    return (np.eye(3) + np.sin(a) * K + (1 - np.cos(a)) * K @ K).astype(np.float32)

def sstep(a, b, x): t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)

# ---------- forms ----------
class Form:
    """A form: its distance function and the box it lies in. Away from the box (farther than the blend reaches) the
    distance to the box stands in for it, so a head of many small forms is evaluated quickly."""
    def __init__(self, f, lo, hi): self.f, self.lo, self.hi = f, np.asarray(lo, np.float32), np.asarray(hi, np.float32)
    def __call__(self, q, pad=0.):
        dd = np.maximum(np.maximum(self.lo - q, q - self.hi), 0); out = np.sqrt((dd * dd).sum(1)).astype(np.float32)
        ins = np.all((q >= self.lo - pad) & (q <= self.hi + pad), axis=1)
        if ins.any(): out[ins] = self.f(q[ins])
        return out

def Ell(c, r, R=None):
    c, r = A(*c), A(*r); m = float(r.max())
    return Form(lambda q: ellipsoid(q, c, r, R), c - m, c + m)

def Cone(a, b, ra, rb):
    a, b = A(*a), A(*b); m = max(ra, rb)
    return Form(lambda q: round_cone(q, a, b, ra, rb), np.minimum(a, b) - m, np.maximum(a, b) + m)

def spline(pts, n=8):
    """Points along the smooth curve through pts (Catmull-Rom), n per span, and each one's parameter (span index + t)."""
    P = np.array(pts, np.float32); S, T = [], []
    for i in range(len(P) - 1):
        p0, p1, p2, p3 = P[max(i - 1, 0)], P[i], P[i + 1], P[min(i + 2, len(P) - 1)]
        for t in np.linspace(0, 1, n, endpoint=False):
            S.append(.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t ** 3)); T.append(i + t)
    S.append(P[-1]); T.append(len(P) - 1.)
    return np.array(S, np.float32), np.array(T, np.float32)

def Tube(pts, rs, squash=None, n=8):
    """A tube along the smooth curve through pts, its radius rs at those points; squash = (axis, f): its section f times
    as thick along that axis as across it (a ridge flatter than it is wide, a blade of fur)."""
    S, T = spline(pts, n); R = np.interp(T, np.arange(len(rs)), np.asarray(rs, np.float32)).astype(np.float32)
    ax, fl = (None, 1.) if squash is None else (_n(squash[0]), float(squash[1]))
    S2 = S if ax is None else S + np.outer(S @ ax, ax) * (1 / fl - 1)
    keep = [0] + [i for i in range(1, len(S2)) if np.linalg.norm(S2[i] - S2[i - 1]) > 1e-4]; S2, R = S2[keep], R[keep]
    def f(q):
        if ax is not None: q = q + np.outer(q @ ax, ax) * (1 / fl - 1)
        d = None
        for i in range(len(S2) - 1):
            e = round_cone(q, S2[i], S2[i + 1], float(R[i]), float(R[i + 1])); d = e if d is None else np.minimum(d, e)
        return d * fl
    m = float(R.max()); return Form(f, S.min(0) - m, S.max(0) + m)

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

def Hull(pts, r=.02):
    P = np.asarray(pts, np.float32); return Form(lambda q: hull(q, P, r), P.min(0) - r, P.max(0) + r)

def sym(*pts):
    """Points given on the left, mirrored to the right as well (forms across the middle line)."""
    out = []
    for q in pts:
        out.append(q)
        if abs(q[0]) > 1e-6: out.append((-q[0], q[1], q[2]))
    return out

# ---------- the head's mass: a loft of drawn cross-sections ----------
def _cr(p0, p1, p2, p3, t):
    t = t[..., None] if np.ndim(t) else t
    return .5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t ** 3)

def half_curve(P, n=4):
    """A cross-section's right half drawn through its points, from the top of the middle line round to the bottom of
    it (each end meets the middle line square, as the mirrored left half carries it on), n points a span."""
    P = np.asarray(P, np.float32); E = np.concatenate([P[1:2] * A(-1, 1), P, P[-2:-1] * A(-1, 1)])
    t = np.linspace(0, 1, n, endpoint=False, dtype=np.float32); out = [_cr(E[i], E[i + 1], E[i + 2], E[i + 3], t) for i in range(len(P) - 1)]
    return np.concatenate(out + [P[-1:]]).astype(np.float32)

class Sections(Form):
    """A mass lofted through drawn cross-sections, as a modeller lays out a head's edge loops: at each station z a half
    outline (top of the middle line round the side to the bottom of it), the outlines blended smoothly from station to
    station (the same number of points in each, point following point), capped round at the first and last station.
    The distance is the section's own, corrected for how fast the sections change along z."""
    def __init__(self, stations, n=4, rf=.03, rb=.03):
        st = sorted(stations, key=lambda s: s[0]); self.Z = np.array([s[0] for s in st], np.float32)
        self.C = np.stack([half_curve(s[1], n) for s in st]); self.rf, self.rb = rf, rb
        P = self.C.reshape(-1, 2); Form.__init__(self, self.dist, A(-P[:, 0].max(), P[:, 1].min(), self.Z[0]) - .02, A(P[:, 0].max(), P[:, 1].max(), self.Z[-1]) + .02)
    def at(self, z):
        """The outline at z: Catmull-Rom across the stations (by station index), held at the ends."""
        Z, C, nS = self.Z, self.C, len(self.Z); s = np.interp(z, Z, np.arange(nS, dtype=np.float32)); i = np.clip(np.floor(s).astype(int), 0, nS - 2); t = (s - i).astype(np.float32)
        g = lambda k: C[np.clip(k, 0, nS - 1)]
        return _cr(g(i - 1), g(i), g(i + 1), g(i + 2), t[:, None])
    def d2(self, q):
        out = np.empty(len(q), np.float32); B = 20000
        for j in range(0, len(q), B):
            Q = q[j:j + B]; C = self.at(Q[:, 2]); px, py = np.abs(Q[:, 0]), Q[:, 1]
            a, b = C[:, :-1], C[:, 1:]; ab = b - a; L2 = (ab * ab).sum(2) + 1e-12
            dx = px[:, None] - a[..., 0]; dy = py[:, None] - a[..., 1]
            t = np.clip((dx * ab[..., 0] + dy * ab[..., 1]) / L2, 0, 1); ex = dx - t * ab[..., 0]; ey = dy - t * ab[..., 1]
            d = np.sqrt((ex * ex + ey * ey).min(1))
            ya, yb = a[..., 1], b[..., 1]; c = (ya > py[:, None]) != (yb > py[:, None])
            xc = a[..., 0] + (py[:, None] - ya) / np.where(np.abs(yb - ya) < 1e-9, 1e-9, yb - ya) * ab[..., 0]
            ins = (c & (xc > px[:, None])).sum(1) % 2 == 1; out[j:j + B] = np.where(ins, -d, d)
        return out
    def dist(self, q):
        h = .006; d0 = self.d2(q); dz = (self.d2(q + A(0, 0, h)) - self.d2(q - A(0, 0, h))) / (2 * h)
        d = d0 / np.sqrt(1 + dz * dz)
        d = smax(d, q[:, 2] - self.Z[-1], self.rf)
        return smax(d, self.Z[0] - q[:, 2], self.rb)

# ---------- carving along the skin ----------
def groove(d, u, R, c=.004):
    """A groove along a line on the skin: u is how far a point is from the line across the skin (the line where u = 0);
    the groove is a tube of radius R running c under the skin, so it cuts R - c deep."""
    g = np.sqrt(u * u + (d + c) ** 2) - R
    return np.maximum(d, -g)

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
    side, its arcs hu above and hl below, the outer corner raised by the tilt, slanted by the shift), the eyeball behind
    it with its front just under the skin, and the lids: a roll of skin round the opening, the upper one heavier and
    lying over the eyeball's top (lo: how far forward its roll sits along the gaze)."""
    c = A(*E['c']); g, rg, up = eye_frame(E); v = q - c
    vg, vr, vu = v @ g, v @ rg, v @ up; x2 = vr - E.get('shift', 0) * vu; re = E['re']
    a = almond(x2, vu, E['w'], E['hu'], E['hl'])
    d = ssub(d, np.maximum(a, -vg - re * .5), E.get('soft', .006))
    lid = np.where(vu > 0, E.get('lu', .02), E.get('ll', .011)); off = np.where(vu > 0, E.get('lo', .9), .84)
    d = smin(d, np.hypot(np.abs(a) - lid * .35, vg - re * off) - lid, .01)
    cr = E.get('crease')   # the fold over the upper lid: a groove along its arc, lifted off it, fading out to the corners
    if cr:
        w = E['w'] * 1.06; ya = vu - E.get('lu', .02) * 1.5 - cr[1]; arc = almond(x2, ya, w, E['hu'] * .9, E['hu'] * .9)
        R = cr[0] * (1 - sstep(.55 * w, .92 * w, np.abs(x2))) * (ya > -.003) * (vg > -re * .2)
        d = groove(d, np.where(R > 0, arc, 1.), .002 + R, .002)
    return d

# ---------- fur, ears, horns ----------
def Tuft(root, mid, tip, w, t, normal):
    """A tuft of fur as a sculptor makes one: a flame lying on the skin, from its root through mid (the curve's bend) to
    a point that flares off, full most of its length and then tapering; flat across the skin's normal (w wide, t thick)."""
    root, mid, tip = A(*root), A(*mid), A(*tip); q1 = mid + (tip - mid) * .45
    return Tube([root, mid, q1, tip], [w, w * .9, w * .55, .004], squash=(normal, t / w), n=6)

def ear_frame(E):
    Re = rot((0, 0, 1), -E['out']) @ rot((1, 0, 0), -E['back']) @ rot((0, 1, 0), E.get('turn', 0))
    return np.stack([Re @ A(1, 0, 0), Re @ A(0, 0, 1), Re @ A(0, 1, 0)], 1).astype(np.float32)

class Ear(Form):
    """An ear as a sculptor makes one: a thick shell lofted up from its base on the skull, each section an ellipse (W wide,
    D deep at the base, narrowing to the tip; round_ keeps it wide up to a rounded top, a bear's or a cat's), leaning
    back as it rises; the front hollowed into a cup inside a rim; tufts of fluff rising from the cup's floor.
    In its own frame: x across, y up the ear, z out of the cup (base, out, back, turn place it on the head)."""
    TA = np.array([0, .15, .35, .55, .75, .9, 1.], np.float32)
    def __init__(self, E):
        self.E = E; self.B = A(*E["base"]); self.R = ear_frame(E)[:, [0, 2, 1]]; H, W, D = E['H'], E['W'], E.get('D', E.get('T', .1) * 1.8)
        rd = E.get('round_', 0.)
        pa = np.array([1, .97, .86, .68, .45, .22, .02]) * (1 - rd) + np.array([1, 1, .98, .92, .78, .52, .05]) * rd
        pb = np.array([1, .85, .64, .46, .32, .2, .12])
        self.a, self.b, self.H, self.lean, self.rim = (pa * W / 2).astype(np.float32), (pb * D / 2).astype(np.float32), H, E.get('lean', .12), E.get('rim', .035)
        C = [self.B + self.R @ A(sx * W / 2, sy * H * 1.05, sz * D) for sx in (-1, 1) for sy in (0, 1) for sz in (-1, 1)]
        Form.__init__(self, self.dist, np.minimum.reduce(C) - .05, np.maximum.reduce(C) + .05); self.fluff = []
    def local(self, q): return (q - self.B) @ self.R          # (x across, y up, z out of the cup)
    def sec(self, y, inner=False):
        t = np.clip(y / self.H, 0, 1); a = np.interp(t, self.TA, self.a); b = np.interp(t, self.TA, self.b); c = -self.lean * self.H * t * t
        if inner: a, b, c = np.maximum(a - self.rim, .004), b * .72, c + b * .62
        return a, b, c
    def d(self, p, inner=False):
        def e2(y):
            a, b, c = self.sec(y, inner); u = np.sqrt((p[:, 0] / a) ** 2 + ((p[:, 2] - c) / b) ** 2); return (u - 1) * np.minimum(a, b)
        h = .005; d0 = e2(p[:, 1]); dy = (e2(p[:, 1] + h) - e2(p[:, 1] - h)) / (2 * h); d = d0 / np.sqrt(1 + dy * dy)
        if inner: return smax(smax(d, p[:, 1] - self.H * .93, .03), self.H * .05 - p[:, 1], .02)
        return smax(smax(d, p[:, 1] - self.H, .012), -p[:, 1] - .06, .02)
    def dist(self, q):
        p = self.local(q); d = ssub(self.d(p), self.d(p, True), .01)
        for T in self.fluff: d = smin(d, T(q, .02), .012)
        return d
    def build_fluff(self):
        """Tufts from the cup's floor near the base, up along it and out of it (the inner fluff artists draw)."""
        E, R = self.E, self.R; out = []
        for sx, h0, h1, out_ in [(-.35, .06, .5, .2), (.3, .1, .42, .15), (0, .04, .58, .3)][:E.get('fluff', 3)]:
            a0, b0, c0 = self.sec(self.H * h0, True); a1, b1, c1 = self.sec(self.H * h1, True); hm = (h0 + h1) / 2; am, bm, cm = self.sec(self.H * hm, True)
            l = E.get('fl', 1); pts = [(sx * a0, self.H * h0, c0 - b0 * .4), (sx * am * .7, self.H * hm * l, cm + bm * out_), (sx * a1 * .4, self.H * h1 * l, c1 + b1 * (out_ + .5))]
            out.append(Tube([self.B + R @ A(*p) for p in pts], [self.a[0] * .26, self.a[0] * .2, .004], squash=(R @ A(0, 0, 1), .45), n=5))
        self.fluff = out; return self

def horn_pts(H):
    """A horn's spine: from its base it rises along d0 and curls towards d1 through `sweep` degrees, tapering."""
    B, d0, d1 = A(*H['base']), _n(H['d0']), _n(H['d1']); n = 14; out = []
    for i in range(n + 1):
        t = i / n; th = np.radians(H['sweep']) * t
        out.append((B + H['R'] * (np.sin(th) * d0 + (1 - np.cos(th)) * d1), H['r0'] + (H['r1'] - H['r0']) * t))
    return out

# ---------- on the skin ----------
def grad(f, p, h=.002):
    e = np.eye(3, dtype=np.float32) * h
    return np.stack([(f(p + e[i]) - f(p - e[i])) / (2 * h) for i in range(3)], 1)

def onskin(f, pts, lift=0., it=6):
    """Points moved along the field's gradient until they lie `lift` off its skin (negative: under it)."""
    p = np.array(pts, np.float32).reshape(-1, 3); lift = np.broadcast_to(np.asarray(lift, np.float32), (len(p),))
    for _ in range(it):
        d = f(p) - lift; g = grad(f, p); g /= np.linalg.norm(g, axis=1, keepdims=True) + 1e-9; p = p - d[:, None] * g
    return p

# ---------- the head's forms ----------
def mouth_line(S, z):
    """The mouth's line in profile: the lip line y straight back to the corners, then the smile rising behind them."""
    M = S['mouth']; zc, (ls, rise) = M['corner'], M.get('smile', (.08, .04)); t = np.clip((zc - z) / ls, 0, 1)
    return M['y'] + rise * t * t

def forms(S):
    """The head's masses in order, each blended into what is there (+), or cut out of it (-): (op, form, blend)."""
    H = S['head']; ops = [('+', Sections(H['st'], rf=H.get('rf', .04), rb=H.get('rb', .04)), 0)]
    a, b, ra, rb = S['neck']; ops.append(('+', Cone(a, b, ra, rb), .12))
    J = S.get('jaw')
    if J: ops.append(('+', Sections(J['st'], rf=J.get('rf', .03), rb=J.get('rb', .05)), J.get('k', .02)))
    M = S['mouth']; Y0, Z0 = M['y'] + .009, M['corner'] - .02
    def lipsafe(F):
        """A form kept off the mouth's cut: in front of the corners nothing of it under the lip line (the cut there would
        hand it to the jaw), behind them all of it (a heavy cheek fills out down to the jaw)."""
        g = F.f; F.f = lambda q: smax(g(q), np.minimum(Y0 - q[:, 1], q[:, 2] - Z0), .01); return F
    for f in S.get('masses', []): ops.append(('+', lipsafe(Ell(f['c'], f['r'], f.get('R'))), f.get('k', .06)))
    E = S['eye']
    if E.get('mound'):   # the flesh round the eyeball, so a short face still holds it (an ellipsoid along the gaze)
        sx, sy, sz, k = E['mound']; g, rg, up = eye_frame(E); R = np.stack([rg, up, g], 1)
        for sd in (1, -1):
            Rm = R * A(sd, 1, sd)[:, None] if sd < 0 else R
            ops.append(('+', Ell((E['x'] * sd, 0, 0), (E['re'] * sx, E['re'] * sy, E['re'] * sz), Rm), k))
    for f in S.get('pads') or []:   # the whisker pads either side of the split lip
        for sd in (1, -1): ops.append(('+', Ell((f['c'][0] * sd, *f['c'][1:]), f['r']), f.get('k', .02)))
    if S.get('goatee'): r, m, t, w, th = S['goatee']; ops.append(('+', Tuft(r, m, t, w, th, (1, 0, 0)), .03))
    N = S['nose']
    if N.get('pts'): ops.append(('+', Hull(sym(*N['pts']), N.get('r', .025)), N.get('k', .015)))
    if N.get('rim'): c, r = N['rim']; ops.append(('+', Ell(c, r), .02))   # the flesh a horse's nostril flares out of
    for c, r in N.get('ells', []): ops.append(('+', Ell(c, r), N.get('k', .02)))
    return ops

def run(ops, q):
    d = ops[0][1].f(q)   # (the first form whole: what stands in for a form away from its box is only good next to another's)
    for op, F, k in ops[1:]:
        e = F(q, k + .02)
        d = smin(d, e, k) if op == '+' else ssub(d, e, k)
    return d

# ---------- the species ----------
# Each head: head and jaw, the stations of their lofts, each a half outline drawn with muz (a muzzle's box), jaw (the
# lower jaw's) or cran (the face's and the skull's round sections), rf / rb how round their front and back ends, k
# the jaw's blend; masses and pads (ellipsoids: centre, radii, blend); brow (the ridge's curve over the left eye, its
# radii, sq how flat); furrow (from, to, depth); nose (kind: 'can' leather of ellipsoids with comma nostrils, 'fel' a
# small pad of corners, 'none' a horse's or a goat's nostrils cut in, 'drag' raised ones; the philtrum under it); the
# mouth (the lip line y, the corners' z, the smile: how far back it runs and how much it rises) and the jaw's hinge; the
# eye (half spacing x, eyeball radius re, gaze yaw out / pitch, the opening's corners w and arcs hu / hl, tilt (the
# outer corner up), shift (a slant), sink (the eyeball's front under the skin), lids lu / ll, mound: the flesh round it
# as radii in eyeballs and its blend); ears (base, tilt out / back, turn, height H, width W, depth D, lean, rim,
# round_, fluff); tufts (root, bend, tip, width, thickness); horns; goatee; the neck (two centres and radii, under the
# body's neck). Measures in head heights from between the eyes; the head is measured again once made (the top of its
# skull to the bottom of its jaw) and scaled to exactly one.
def muz(z, top, w, lip):
    """A muzzle's cross-section at z: a box with its top flat (the bridge, at `top`), its sides full and widest (w)
    low down at the upper lip, the lip's edge turning in at the lip line `lip`."""
    H = top - lip
    return (z, [(0, top), (.45 * w, top - .01 * H), (.78 * w, top - .09 * H), (.95 * w, top - .28 * H), (w, lip + .4 * H),
                (.97 * w, lip + .2 * H), (.86 * w, lip + .04 * H), (.57 * w, lip + .009), (0, lip + .009)])

def smuz(z, top, w, lip):
    """A soft muzzle's cross-section at z (a horse's, a deer's): narrower over the bridge and rounded off it, widest low
    down where the nostrils flare over the upper lip, the lip's edge turning in at the lip line `lip`."""
    H = top - lip
    return (z, [(0, top), (.34 * w, top - .015 * H), (.65 * w, top - .09 * H), (.88 * w, top - .27 * H), (w, lip + .38 * H), (.97 * w, lip + .17 * H),
                (.84 * w, lip + .04 * H), (.5 * w, lip + .009), (0, lip + .009)])

def jaw(z, w, bot, top):
    """The lower jaw's cross-section at z: w its half width, its bottom `bot`; it meets the lip line (just under `top`) at
    its sides and rises inside the muzzle in the middle, so the two are one solid there and the mouth's cut runs through
    flesh, round the jaw's top edge under the overhanging upper lip."""
    lip = top - .005; D = lip - bot
    return (z, [(0, lip + .05), (.5 * w, lip + .045), (.8 * w, lip + .012), (.95 * w, lip - .02), (w, lip - .25 * D), (.97 * w, lip - .5 * D),
                (.86 * w, lip - .75 * D), (.6 * w, lip - .92 * D), (.32 * w, lip - .985 * D), (0, bot)])

def cran(z, top, w, wy, bot):
    """The skull's (or the face's) cross-section at z: round, its top `top`, widest (w) at height wy, its bottom `bot`."""
    a, b = top - wy, wy - bot
    return (z, [(0, top), (.4 * w, top - .01), (.75 * w, top - .17 * a), (.95 * w, wy + .45 * a), (w, wy), (.97 * w, wy - .35 * b),
                (.84 * w, wy - .7 * b), (.6 * w, bot + .1 * b), (0, bot)])

WOLF = dict(
    head=dict(rf=.05, rb=.04, st=[
        (.523, [(0, -.055), (.045, -.06), (.078, -.085), (.094, -.13), (.098, -.18), (.092, -.22), (.075, -.25), (.04, -.262), (0, -.265)]),
        (.45, [(0, -.025), (.065, -.028), (.104, -.046), (.12, -.095), (.126, -.165), (.123, -.21), (.108, -.25), (.07, -.265), (0, -.268)]),
        (.339, [(0, .0), (.07, -.002), (.115, -.022), (.135, -.075), (.142, -.15), (.14, -.21), (.13, -.25), (.09, -.268), (0, -.27)]),
        (.229, [(0, .038), (.08, .036), (.13, .012), (.157, -.05), (.167, -.14), (.165, -.21), (.15, -.255), (.1, -.27), (0, -.27)]),
        (.137, [(0, .07), (.08, .07), (.14, .045), (.18, -.02), (.2, -.11), (.2, -.2), (.18, -.255), (.12, -.272), (0, -.272)]),
        (.06, [(0, .14), (.1, .15), (.2, .13), (.28, .06), (.3, -.04), (.28, -.14), (.24, -.23), (.16, -.272), (0, -.274)]),
        (-.04, [(0, .26), (.13, .26), (.25, .21), (.33, .1), (.36, -.03), (.36, -.15), (.32, -.25), (.24, -.31), (0, -.32)]),
        (-.18, [(0, .37), (.15, .37), (.28, .3), (.36, .17), (.39, .02), (.39, -.13), (.35, -.27), (.26, -.37), (0, -.4)]),
        (-.34, [(0, .44), (.16, .43), (.29, .36), (.36, .22), (.38, .06), (.37, -.1), (.32, -.24), (.22, -.34), (0, -.38)]),
        (-.48, [(0, .41), (.15, .4), (.27, .33), (.33, .2), (.34, .06), (.32, -.07), (.27, -.18), (.17, -.26), (0, -.29)]),
        (-.6, [(0, .32), (.12, .31), (.21, .25), (.26, .15), (.27, .04), (.25, -.06), (.2, -.13), (.12, -.18), (0, -.2)]),
        (-.69, [(0, .18), (.07, .175), (.12, .14), (.15, .09), (.155, .03), (.14, -.02), (.11, -.06), (.06, -.08), (0, -.09)])]),
    jaw=dict(k=.008, rf=.045, rb=.06, st=[jaw(.465, .052, -.345, -.255), jaw(.38, .072, -.38, -.255), jaw(.26, .092, -.415, -.255),
        jaw(.12, .118, -.455, -.255), jaw(.0, .15, -.5, -.255), jaw(-.12, .19, -.555, -.265), jaw(-.24, .2, -.545, -.295)]),
    brow=dict(pts=[(.08, .095, .145), (.13, .13, .135), (.2, .148, .115), (.27, .135, .075), (.32, .095, .01), (.35, .035, -.06)], r=[.028, .042, .048, .042, .032, .02], sq=.7, k=.032),
    furrow=(.08, .24, .01),
    nose=dict(kind='can', ells=[((0, -.04, .505), (.112, .058, .075)), ((0, -.09, .52), (.07, .052, .06))], k=.025,
              comma=[(.022, -.078, .578), (.052, -.07, .574), (.078, -.08, .558), (.09, -.104, .534)], nr=.022, philtrum=(-.138, .565)),
    mouth=dict(y=-.26, corner=.02, smile=(.1, .05)),
    jawh=dict(hinge=-.3),
    eye=dict(x=.2, re=.11, yaw=14, pitch=-2, w=.108, hu=.047, hl=.042, tilt=12, shift=.12, sink=.004, lu=.016, ll=.007, lo=.86, crease=(.006, .008)),
    ears=dict(base=(.24, .34, -.33), out=16, back=8, turn=-14, H=.52, W=.4, D=.27, lean=.16, rim=.035),
    tufts=[((.34, .03, -.21), (.42, -.01, -.32), (.52, -.04, -.45), .11, .03),
           ((.36, -.11, -.19), (.45, -.16, -.3), (.56, -.21, -.41), .12, .032),
           ((.34, -.25, -.17), (.43, -.31, -.27), (.51, -.39, -.37), .11, .03),
           ((.29, -.37, -.15), (.36, -.45, -.24), (.41, -.54, -.32), .09, .026)],
    neck=((0, -.32, -.26), (0, -1.05, -.21), .2, .19))
CAT = dict(
    head=dict(rf=.05, rb=.04, st=[muz(.3, -.085, .072, -.2), muz(.23, -.035, .125, -.2), cran(.13, .055, .25, -.03, -.205),
        cran(.05, .12, .31, -.03, -.215), cran(-.06, .25, .38, -.02, -.3), cran(-.19, .38, .43, .03, -.38), cran(-.33, .45, .42, .06, -.4),
        cran(-.46, .42, .37, .06, -.32), cran(-.57, .32, .28, .05, -.21), cran(-.64, .17, .15, .04, -.09)]),
    jaw=dict(k=.008, rf=.035, rb=.06, st=[jaw(.25, .035, -.25, -.195), jaw(.17, .075, -.31, -.195), jaw(.06, .125, -.4, -.195),
        jaw(-.1, .18, -.52, -.2), jaw(-.22, .19, -.54, -.22)]),
    pads=[dict(c=(.062, -.148, .245), r=(.08, .062, .072), k=.02)],
    masses=[dict(c=(.21, -.15, -.04), r=(.15, .13, .15), k=.07), dict(c=(-.21, -.15, -.04), r=(.15, .13, .15), k=.07)],
    brow=dict(pts=[(.1, .115, .115), (.18, .145, .095), (.26, .13, .05), (.31, .08, -.02)], r=[.016, .022, .019, .012], sq=.7, k=.03),
    nose=dict(kind='fel', pts=[(.052, -.045, .24), (.056, -.053, .305), (.03, -.09, .322), (0, -.108, .32), (0, -.055, .245)], r=.016, k=.012,
              comma=[(.018, -.075, .322), (.034, -.073, .315), (.045, -.083, .3)], nr=.009, philtrum=(-.105, .31)),
    mouth=dict(y=-.2, corner=.03, smile=(.08, .03)),
    jawh=dict(hinge=-.28),
    eye=dict(x=.2, re=.12, yaw=10, pitch=-2, w=.12, hu=.054, hl=.054, tilt=12, shift=.1, sink=.004, lu=.016, ll=.007, lo=.86, mound=(1.45, 1.3, .96, .06)),
    ears=dict(base=(.25, .34, -.23), out=20, back=4, turn=-18, H=.45, W=.44, D=.22, lean=.1, rim=.035),
    tufts=[((.33, -.1, -.14), (.42, -.14, -.2), (.5, -.17, -.26), .1, .03),
           ((.33, -.21, -.13), (.41, -.26, -.18), (.48, -.31, -.23), .1, .03),
           ((.3, -.31, -.12), (.37, -.37, -.16), (.42, -.43, -.2), .085, .026)],
    neck=((0, -.32, -.24), (0, -1.05, -.22), .2, .19))
BIGCAT = dict(
    head=dict(rf=.06, rb=.04, st=[muz(.46, -.065, .1, -.27), muz(.38, -.022, .165, -.27), muz(.28, .018, .205, -.27), muz(.17, .055, .235, -.27),
        cran(.08, .14, .31, -.05, -.28), cran(-.03, .28, .42, -.06, -.33), cran(-.17, .4, .47, -.04, -.42), cran(-.32, .45, .45, 0, -.42),
        cran(-.46, .42, .39, .04, -.32), cran(-.58, .31, .3, .04, -.2), cran(-.66, .16, .16, .04, -.08)]),
    jaw=dict(k=.008, rf=.045, rb=.06, st=[jaw(.37, .065, -.375, -.265), jaw(.28, .105, -.425, -.265), jaw(.15, .15, -.48, -.265),
        jaw(0, .2, -.53, -.265), jaw(-.15, .23, -.555, -.28), jaw(-.26, .23, -.55, -.3)]),
    pads=[dict(c=(.085, -.19, .37), r=(.1, .075, .085), k=.03)],
    masses=[dict(c=(.25, -.17, -.09), r=(.16, .15, .18), k=.08), dict(c=(-.25, -.17, -.09), r=(.16, .15, .18), k=.08)],
    brow=dict(pts=[(.08, .1, .15), (.15, .13, .13), (.23, .137, .1), (.3, .11, .04), (.34, .06, -.04)], r=[.03, .04, .042, .034, .022], sq=.7, k=.035),
    furrow=(.1, .24, .008),
    nose=dict(kind='fel', pts=[(.1, -.005, .36), (.105, -.012, .438), (.075, -.05, .462), (0, -.09, .466), (0, -.02, .37)], r=.022, k=.015,
              comma=[(.03, -.058, .463), (.055, -.052, .455), (.072, -.062, .44)], nr=.012, philtrum=(-.085, .448)),
    mouth=dict(y=-.27, corner=.04, smile=(.08, .03)),
    jawh=dict(hinge=-.3),
    eye=dict(x=.2, re=.1, yaw=10, pitch=-2, w=.1, hu=.05, hl=.044, tilt=8, shift=.08, sink=.004, lu=.015, ll=.007, lo=.86, mound=(1.4, 1.25, 1.0, .06)),
    ears=dict(base=(.28, .33, -.26), out=26, back=6, turn=-12, H=.25, W=.3, D=.16, lean=.04, rim=.035, round_=.9),
    tufts=[((.38, -.08, -.15), (.51, -.13, -.23), (.66, -.17, -.31), .13, .032),
           ((.37, -.2, -.14), (.5, -.27, -.21), (.63, -.33, -.28), .13, .032),
           ((.33, -.31, -.13), (.44, -.39, -.19), (.54, -.47, -.25), .11, .028)],
    neck=((0, -.32, -.26), (0, -1.05, -.21), .22, .2))
BEAR = dict(
    head=dict(rf=.05, rb=.04, st=[muz(.47, -.075, .1, -.27), muz(.38, -.035, .14, -.27), muz(.26, .01, .18, -.27), muz(.14, .055, .22, -.27),
        cran(.05, .17, .33, -.06, -.285), cran(-.05, .3, .43, -.06, -.33), cran(-.2, .42, .47, -.04, -.42), cran(-.36, .46, .46, 0, -.42),
        cran(-.5, .42, .4, .04, -.32), cran(-.62, .3, .3, .04, -.2), cran(-.7, .15, .16, .04, -.08)]),
    jaw=dict(k=.008, rf=.04, rb=.06, st=[jaw(.42, .065, -.355, -.265), jaw(.3, .11, -.42, -.265), jaw(.15, .155, -.48, -.265),
        jaw(0, .2, -.53, -.265), jaw(-.15, .24, -.555, -.28), jaw(-.26, .24, -.55, -.3)]),
    brow=dict(pts=[(.08, .09, .13), (.14, .12, .12), (.21, .13, .1), (.28, .11, .05), (.33, .06, -.03)], r=[.03, .04, .042, .034, .022], sq=.7, k=.04),
    furrow=(.08, .2, .008),
    nose=dict(kind='can', ells=[((0, -.045, .475), (.115, .055, .06)), ((0, -.088, .485), (.075, .045, .05))], k=.025,
              comma=[(.024, -.075, .535), (.055, -.068, .53), (.08, -.078, .515), (.09, -.098, .495)], nr=.02, philtrum=(-.13, .52)),
    mouth=dict(y=-.27, corner=.03, smile=(.08, .03)),
    jawh=dict(hinge=-.3),
    eye=dict(x=.2, re=.085, yaw=8, pitch=-2, w=.082, hu=.042, hl=.036, tilt=4, shift=.05, sink=.004, lu=.013, ll=.007, lo=.86),
    ears=dict(base=(.3, .33, -.3), out=30, back=5, turn=-10, H=.24, W=.28, D=.15, lean=.05, rim=.035, round_=1),
    tufts=[((.4, -.1, -.2), (.47, -.16, -.31), (.54, -.22, -.4), .09, .03),
           ((.37, -.24, -.18), (.43, -.31, -.28), (.48, -.39, -.35), .08, .028)],
    neck=((0, -.32, -.26), (0, -1.05, -.21), .22, .2))
COON = dict(
    head=dict(rf=.05, rb=.04, st=[muz(.47, -.085, .065, -.25), muz(.38, -.048, .09, -.25), muz(.27, -.005, .125, -.25), muz(.15, .045, .17, -.25),
        cran(.05, .16, .31, -.05, -.26), cran(-.05, .3, .42, -.06, -.31), cran(-.18, .41, .44, -.04, -.38), cran(-.33, .45, .42, 0, -.4),
        cran(-.47, .41, .36, .03, -.3), cran(-.58, .3, .27, .04, -.2), cran(-.65, .15, .15, .04, -.08)]),
    jaw=dict(k=.008, rf=.035, rb=.06, st=[jaw(.43, .038, -.32, -.245), jaw(.32, .065, -.37, -.245), jaw(.18, .09, -.42, -.245),
        jaw(.03, .14, -.49, -.245), jaw(-.12, .18, -.54, -.26), jaw(-.24, .19, -.54, -.28)]),
    brow=dict(pts=[(.08, .09, .14), (.14, .12, .13), (.21, .13, .11), (.28, .11, .06), (.33, .06, -.02)], r=[.022, .032, .035, .03, .018], sq=.7, k=.03),
    furrow=(.08, .2, .007),
    nose=dict(kind='can', ells=[((0, -.06, .465), (.06, .038, .045)), ((0, -.085, .47), (.04, .03, .035))], k=.02,
              comma=[(.014, -.074, .508), (.03, -.07, .505), (.044, -.077, .495), (.05, -.09, .48)], nr=.012, philtrum=(-.11, .5)),
    mouth=dict(y=-.25, corner=.03, smile=(.08, .03)),
    jawh=dict(hinge=-.28),
    eye=dict(x=.2, re=.1, yaw=14, pitch=-2, w=.098, hu=.05, hl=.044, tilt=10, shift=.1, sink=.004, lu=.014, ll=.007, lo=.86),
    ears=dict(base=(.26, .35, -.3), out=22, back=8, turn=-12, H=.28, W=.3, D=.15, lean=.06, rim=.035, round_=.7),
    tufts=[((.4, -.06, -.17), (.5, -.11, -.27), (.61, -.15, -.36), .1, .03),
           ((.39, -.19, -.15), (.48, -.26, -.24), (.58, -.33, -.32), .1, .03),
           ((.34, -.31, -.13), (.41, -.39, -.21), (.48, -.47, -.27), .085, .026)],
    neck=((0, -.32, -.24), (0, -1.05, -.21), .2, .19))
RABBIT = dict(
    head=dict(rf=.08, rb=.04, st=[muz(.35, -.075, .09, -.2), muz(.29, -.03, .13, -.2), muz(.21, .02, .165, -.2), cran(.12, .1, .23, -.06, -.21),
        cran(.03, .19, .3, -.05, -.25), cran(-.09, .3, .35, -.05, -.34), cran(-.23, .37, .36, -.03, -.42), cran(-.37, .39, .34, 0, -.42),
        cran(-.5, .34, .29, .03, -.32), cran(-.6, .24, .21, .04, -.2), cran(-.66, .12, .11, .04, -.08)]),
    jaw=dict(k=.008, rf=.04, rb=.06, st=[jaw(.28, .035, -.245, -.195), jaw(.2, .075, -.3, -.195), jaw(.08, .125, -.39, -.195),
        jaw(-.06, .17, -.5, -.2), jaw(-.2, .18, -.54, -.22)]),
    pads=[dict(c=(.062, -.135, .3), r=(.082, .066, .072), k=.025)],
    masses=[dict(c=(.21, -.105, .02), r=(.14, .085, .15), k=.07), dict(c=(-.21, -.105, .02), r=(.14, .085, .15), k=.07)],
    brow=dict(pts=[(.12, .1, .1), (.19, .13, .07), (.26, .12, .02)], r=[.016, .02, .014], sq=.7, k=.03),
    nose=dict(kind='fel', pts=[(.034, -.055, .31), (.036, -.06, .36), (.018, -.08, .368), (0, -.093, .366), (0, -.06, .315)], r=.012, k=.01,
              comma=[(.012, -.069, .368), (.024, -.067, .362), (.032, -.075, .35)], nr=.007, philtrum=(-.09, .358)),
    mouth=dict(y=-.2, corner=.08, smile=(.06, .02)),
    jawh=dict(hinge=-.22),
    eye=dict(x=.22, re=.12, yaw=24, pitch=-2, w=.11, hu=.07, hl=.064, tilt=4, shift=0, sink=.004, lu=.014, ll=.007, lo=.86, mound=(1.45, 1.35, 1.0, .07)),
    ears=dict(base=(.13, .36, -.26), out=6, back=14, turn=-22, H=.85, W=.3, D=.14, lean=.08, rim=.04, round_=.6, fluff=2, fl=.5),
    tufts=[((.31, -.1, -.05), (.41, -.14, -.11), (.5, -.17, -.17), .1, .03),
           ((.31, -.19, -.06), (.4, -.24, -.11), (.47, -.29, -.16), .095, .028),
           ((.28, -.27, -.07), (.35, -.32, -.11), (.41, -.37, -.15), .08, .025)],
    neck=((0, -.32, -.22), (0, -1.05, -.2), .19, .18))
GOAT = dict(
    head=dict(rf=.08, rb=.04, st=[smuz(.66, -.17, .06, -.32), smuz(.58, -.115, .08, -.32), smuz(.46, -.05, .105, -.32), muz(.32, .015, .14, -.32),
        muz(.17, .07, .185, -.32), cran(.05, .17, .27, -.07, -.33), cran(-.05, .3, .33, -.07, -.38), cran(-.18, .4, .34, -.05, -.45),
        cran(-.32, .44, .32, 0, -.44), cran(-.44, .39, .27, .03, -.32), cran(-.53, .27, .2, .04, -.2), cran(-.58, .14, .11, .04, -.08)]),
    jaw=dict(k=.008, rf=.05, rb=.06, st=[jaw(.6, .042, -.37, -.315), jaw(.48, .065, -.405, -.315), jaw(.3, .095, -.45, -.315),
        jaw(.1, .13, -.5, -.315), jaw(-.08, .17, -.55, -.32), jaw(-.2, .17, -.55, -.33)]),
    brow=dict(pts=[(.1, .1, .12), (.18, .12, .09), (.26, .1, .02), (.3, .05, -.06)], r=[.024, .03, .026, .016], sq=.7, k=.035),
    nose=dict(kind='none', comma=[(.028, -.185, .7), (.047, -.2, .7), (.053, -.226, .7), (.045, -.25, .7)], nr=.014, philtrum=(-.24, .69)),
    mouth=dict(y=-.32, corner=.3, smile=(.06, .02)),
    jawh=dict(hinge=-.22),
    eye=dict(x=.24, re=.104, yaw=27, pitch=-2, w=.095, hu=.06, hl=.05, tilt=0, shift=0, sink=.004, lu=.02, ll=.009, lo=.86, mound=(1.5, 1.35, 1.0, .08),
             crease=(.005, .007)),
    ears=dict(base=(.24, .2, -.2), out=72, back=10, turn=-40, H=.34, W=.18, D=.12, lean=.04, rim=.03, fluff=2, fl=.7),
    horns=dict(base=(.11, .36, -.08), d0=(.15, 1, -.3), d1=(.1, -.15, -1), R=.32, sweep=125, r0=.055, r1=.012),
    goatee=((0, -.36, .55), (0, -.44, .57), (0, -.53, .6), .045, .035),
    neck=((0, -.32, -.24), (0, -1.05, -.21), .19, .18))
HORSE = dict(
    head=dict(rf=.1, rb=.04, st=[smuz(1.0, -.25, .11, -.41), smuz(.95, -.17, .15, -.42), smuz(.88, -.13, .16, -.42), smuz(.76, -.095, .146, -.42),
        smuz(.6, -.055, .128, -.42), smuz(.44, -.012, .134, -.42), muz(.26, .05, .178, -.42), cran(.08, .14, .26, -.1, -.43), cran(-.05, .27, .31, -.15, -.6),
        cran(-.18, .36, .33, -.18, -.64), cran(-.3, .38, .31, -.12, -.58), cran(-.4, .34, .26, -.05, -.42), cran(-.47, .22, .19, 0, -.25),
        cran(-.51, .1, .1, 0, -.1)]),
    jaw=dict(k=.008, rf=.08, rb=.06, st=[jaw(.93, .11, -.565, -.415), jaw(.82, .1, -.565, -.415), jaw(.66, .082, -.525, -.415), jaw(.44, .1, -.55, -.415),
        jaw(.2, .15, -.6, -.415), jaw(0, .2, -.64, -.42), jaw(-.15, .22, -.65, -.44), jaw(-.28, .2, -.6, -.46)]),
    masses=[dict(c=(.21, -.36, -.17), r=(.16, .25, .27), k=.07), dict(c=(-.21, -.36, -.17), r=(.16, .25, .27), k=.07)],
    brow=dict(pts=[(.13, .1, .1), (.2, .128, .07), (.28, .115, .005), (.32, .07, -.07)], r=[.026, .037, .035, .02], sq=.7, k=.035),
    ridges=[dict(pts=[(.33, -.11, -.06), (.3, -.13, .06), (.25, -.15, .18), (.2, -.16, .3)], r=[.042, .036, .026, .012], sink=.45, sq=.5, k=.03)],
    nose=dict(kind='none', comma=[(.11, -.22, 1.0), (.132, -.245, 1.0), (.128, -.285, 1.0), (.105, -.315, 1.0), (.08, -.33, 1.0)], nr=.024,
              rim=((.135, -.255, .92), (.04, .065, .045))),
    mouth=dict(y=-.42, corner=.45, smile=(.06, .02)),
    jawh=dict(hinge=-.25),
    eye=dict(x=.25, re=.108, yaw=28, pitch=-2, w=.1, hu=.064, hl=.052, tilt=0, shift=0, sink=.004, lu=.022, ll=.009, lo=.86, mound=(1.55, 1.4, 1.05, .08),
             crease=(.006, .008)),
    ears=dict(base=(.15, .33, -.22), out=10, back=4, turn=-30, H=.36, W=.2, D=.15, lean=.06, rim=.03, fluff=2, fl=.7),
    tufts=[((.02, .39, -.27), (.03, .3, -.06), (.05, .15, .12), .095, .04), ((.07, .38, -.29), (.09, .3, -.1), (.12, .16, .07), .08, .036),
           ((.11, .36, -.3), (.15, .28, -.15), (.2, .19, -.02), .07, .03)],
    neck=((0, -.36, -.26), (0, -1.05, -.21), .19, .18))
DRAGON = dict(
    head=dict(rf=.1, rb=.04, st=[muz(.73, -.1, .065, -.28), muz(.62, -.07, .11, -.28), muz(.45, -.03, .14, -.28), muz(.3, .01, .16, -.28),
        muz(.16, .05, .2, -.28), cran(.05, .15, .3, -.06, -.29), cran(-.05, .27, .36, -.06, -.33), cran(-.2, .38, .38, -.04, -.42),
        cran(-.35, .43, .36, 0, -.42), cran(-.48, .39, .31, .03, -.32), cran(-.58, .28, .23, .04, -.2), cran(-.64, .14, .12, .04, -.08)]),
    jaw=dict(k=.008, rf=.065, rb=.06, st=[jaw(.67, .08, -.34, -.275), jaw(.5, .105, -.39, -.275), jaw(.3, .127, -.44, -.275),
        jaw(.1, .15, -.5, -.275), jaw(-.1, .19, -.55, -.28), jaw(-.24, .2, -.55, -.3)]),
    brow=dict(pts=[(.08, .1, .16), (.15, .14, .14), (.23, .155, .1), (.3, .13, .03), (.35, .08, -.06), (.38, .04, -.15)], r=[.03, .045, .05, .045, .035, .02], sq=.75, k=.03),
    nose=dict(kind='drag', ells=[((.06, -.075, .64), (.038, .03, .05))], k=.03, nostril=(.06, -.05, .65), nr=.016),
    mouth=dict(y=-.28, corner=-.06, smile=(.1, .05)),
    jawh=dict(hinge=-.3),
    eye=dict(x=.22, re=.1, yaw=18, pitch=-2, w=.1, hu=.045, hl=.04, tilt=14, shift=.15, sink=.004, lu=.018, ll=.009, lo=.86),
    tufts=[((.33, -.05, -.22), (.45, -.04, -.36), (.62, .0, -.52), .11, .022),
           ((.33, -.2, -.2), (.44, -.24, -.34), (.58, -.28, -.48), .1, .02)],
    horns=dict(base=(.17, .36, -.24), d0=(.2, .45, -1), d1=(0, -1, -.3), R=.55, sweep=50, r0=.065, r1=.012),
    neck=((0, -.32, -.26), (0, -1.05, -.21), .21, .19))
KEMONO = dict(
    head=dict(rf=.05, rb=.04, st=[muz(.33, -.09, .06, -.21), muz(.25, -.04, .1, -.21), muz(.15, .03, .15, -.21),
        cran(.05, .2, .27, -.05, -.22), cran(-.06, .38, .37, -.04, -.3), cran(-.2, .5, .42, 0, -.4), cran(-.36, .55, .42, .05, -.42),
        cran(-.5, .5, .37, .07, -.33), cran(-.59, .36, .28, .07, -.2), cran(-.64, .18, .15, .06, -.08)]),
    jaw=dict(k=.008, rf=.035, rb=.06, st=[jaw(.29, .034, -.265, -.205), jaw(.2, .07, -.32, -.205), jaw(.08, .12, -.38, -.205),
        jaw(-.08, .17, -.44, -.21), jaw(-.2, .18, -.45, -.23)]),
    brow=dict(pts=[(.1, .14, .12), (.18, .17, .1), (.27, .15, .05)], r=[.014, .018, .012], sq=.7, k=.03),
    nose=dict(kind='can', ells=[((0, -.072, .315), (.05, .03, .035))], k=.02,
              comma=[(.012, -.084, .345), (.026, -.08, .342), (.036, -.086, .334)], nr=.008, philtrum=(-.1, .335)),
    mouth=dict(y=-.21, corner=.03, smile=(.06, .03)),
    jawh=dict(hinge=-.26),
    eye=dict(x=.22, re=.13, yaw=12, pitch=-2, w=.12, hu=.092, hl=.07, tilt=6, shift=.05, sink=.004, lu=.012, ll=.006, lo=.88, mound=(1.4, 1.3, 1.02, .06)),
    ears=dict(base=(.24, .42, -.3), out=20, back=10, turn=-12, H=.62, W=.5, D=.24, lean=.14, rim=.04),
    tufts=[((.35, -.1, -.12), (.44, -.16, -.22), (.54, -.2, -.3), .1, .03),
           ((.33, -.22, -.1), (.41, -.29, -.19), (.49, -.36, -.25), .09, .028)],
    neck=((0, -.32, -.22), (0, -1.05, -.2), .19, .18))
FAMS = dict(lobo=WOLF, gato=CAT, felino=BIGCAT, oso=BEAR, mapache=COON, conejo=RABBIT, cabra=GOAT, caballo=HORSE, dragon=DRAGON, kemono=KEMONO)
# each species: its family's head, its own changes, xf: the muzzle mz times as long, mw times as wide, the skull sk wide
SPECIES = {
  'lobo': {},
  'perro': dict(xf=dict(mz=.88, mw=1.08), eye=dict(hu=.054), ears=dict(H=.46, W=.42, round_=.25),
                tufts=[((.34, .0, -.21), (.41, -.04, -.31), (.49, -.07, -.42), .1, .03), ((.35, -.14, -.19), (.43, -.19, -.29), (.51, -.24, -.38), .1, .03)]),
  'zorro': dict(xf=dict(mw=.82, sk=.96, mz=1.04), eye=dict(tilt=18, hu=.044), ears=dict(base=(.24, .35, -.3), H=.62, W=.5, D=.27),
                tufts=[((.33, .03, -.21), (.43, -.02, -.33), (.56, -.05, -.47), .12, .03), ((.35, -.11, -.19), (.46, -.17, -.31), (.6, -.22, -.43), .13, .032),
                       ((.33, -.25, -.17), (.43, -.32, -.28), (.54, -.4, -.38), .12, .03), ((.28, -.37, -.15), (.35, -.46, -.24), (.42, -.56, -.32), .1, .026)]),
  'coyote': dict(xf=dict(mw=.9, mz=1.03), ears=dict(H=.56, W=.44)),
  'hiena': dict(xf=dict(mz=.86, mw=1.16, sk=1.04), eye=dict(re=.095, w=.092, hu=.044), ears=dict(round_=.9, H=.3, W=.34, D=.18, out=26),
                tufts=[((.35, -.06, -.2), (.42, -.11, -.3), (.49, -.15, -.39), .09, .03)]),
  'gato': dict(fam='gato'),
  'tigre': dict(fam='felino'),
  'leon': dict(fam='felino', xf=dict(mz=1.05, mw=1.05), eye=dict(re=.095, w=.096, hu=.048, hl=.042), brow=dict(r=[.034, .044, .046, .036, .022]),
               ears=dict(base=(.29, .33, -.28), round_=1, H=.21, W=.26, D=.15, out=30), tufts=None),
  'leopardo': dict(fam='felino', xf=dict(mz=.84, mw=.9, sk=.96), eye=dict(re=.108, w=.106, hu=.056, hl=.048, tilt=10),
                   ears=dict(base=(.27, .34, -.26), round_=.9, H=.24, W=.28, D=.15, out=24),
                   tufts=[((.36, -.07, -.15), (.47, -.12, -.22), (.59, -.16, -.29), .11, .03), ((.35, -.19, -.14), (.46, -.26, -.2), (.56, -.32, -.26), .11, .03),
                          ((.32, -.3, -.13), (.41, -.37, -.18), (.49, -.44, -.23), .09, .026)]),
  'oso': dict(fam='oso'),
  'mapache': dict(fam='mapache'),
  'panda': dict(fam='mapache', xf=dict(mz=.8, sk=1.04), ears=dict(base=(.27, .36, -.26), round_=.6, H=.32, W=.36, out=22)),
  'mofeta': dict(fam='mapache', xf=dict(mw=.86), eye=dict(re=.09, w=.088, hu=.046), ears=dict(base=(.26, .35, -.27), round_=1, H=.18, W=.22, D=.12),
                 tufts=[((.37, -.1, -.17), (.44, -.15, -.26), (.52, -.19, -.33), .09, .028)]),
  'conejo': dict(fam='conejo'),
  'cabra': dict(fam='cabra'),
  'ciervo': dict(fam='cabra', xf=dict(mw=.86, mz=.96), eye=dict(re=.112, w=.108, hu=.064, hl=.054, yaw=27),
                 pits=[dict(pts=[(.165, -.035, .12), (.14, -.065, .18), (.122, -.09, .23)], r=[.013, .012, .007])],
                 nose=dict(kind='can', ells=[((0, -.15, .66), (.07, .05, .05))], k=.03, comma=[(.02, -.16, .705), (.045, -.155, .7), (.062, -.165, .688)], nr=.013, philtrum=(-.2, .69)),
                 ears=dict(H=.5, W=.36, D=.15, out=58, back=12, turn=-34, round_=.55, lean=.05), horns=None, goatee=None),
  'caballo': dict(fam='caballo', xf=dict(mz=.94)),
  'dragon': dict(fam='dragon'),
  'zorro_k': dict(fam='kemono'),
}

def xform(P, mz=1., mw=1., sk=1.):
    """A variant of a family's head: everything in front of the eyes' plane mz times as far forward and mw times as wide,
    the skull behind it sk times as wide (blended over the face between)."""
    zs = .1
    def zx(z): return zs + (z - zs) * mz if z > zs else z
    def wx(z): t = min(max((z + .05) / .15, 0), 1); return sk + (mw - sk) * t
    for key in ('head', 'jaw'):
        P[key]['st'] = [(zx(z), [(x * wx(z), y) for x, y in sec]) for z, sec in P[key]['st']]
    N = P['nose']
    if N.get('ells'): N['ells'] = [((c[0] * mw, c[1], zx(c[2])), (r[0] * mw, r[1], r[2])) for c, r in N['ells']]
    if N.get('pts'): N['pts'] = [(x * mw, y, zx(z)) for x, y, z in N['pts']]
    if N.get('comma'): N['comma'] = [(x * mw, y, zx(z)) for x, y, z in N['comma']]
    if N.get('philtrum'): N['philtrum'] = (N['philtrum'][0], zx(N['philtrum'][1]))
    if N.get('nostril'): x, y, z = N['nostril']; N['nostril'] = (x * mw, y, zx(z))
    if N.get('rim'): (x, y, z), r = N['rim']; N['rim'] = ((x * mw, y, zx(z)), r)
    for R_ in (P.get('ridges') or []) + (P.get('pits') or []): R_['pts'] = [(x * (mw if z > zs else 1), y, zx(z)) for x, y, z in R_['pts']]
    for p in P.get('pads') or []: p['c'] = (p['c'][0] * mw, p['c'][1], zx(p['c'][2])); p['r'] = (p['r'][0] * mw, p['r'][1], p['r'][2] * (1 + (mz - 1) * .6))
    if P.get('tufts'): P['tufts'] = [tuple((x * (sk if z < 0 else 1), y, z) for x, y, z in t[:3]) + tuple(t[3:]) for t in P['tufts']]
    if P['mouth']['corner'] > zs: P['mouth']['corner'] = zx(P['mouth']['corner'])

def params(sp):
    S = SPECIES[sp]; P = copy.deepcopy(FAMS[S.get('fam', 'lobo')])
    for k, v in S.items():
        if k in ('fam', 'xf'): continue
        if isinstance(v, dict) and isinstance(P.get(k), dict): P[k] = {**P[k], **v}
        else: P[k] = copy.deepcopy(v)
    if S.get('xf'): xform(P, **S['xf'])
    seat(P)
    return P

def leather(N):
    """The nose leather as an ellipsoid round the sculpted nose (its box: centre and half extents, design frame), or
    None: a canid's or a bear's wide pad, a cat's small triangle; none on a horse, a goat or a dragon, whose muzzles are
    skin or scales to the front."""
    if N.get('kind') == 'can' and N.get('ells'):
        lo = np.min([A(*c) - A(*r) for c, r in N['ells']], 0); hi = np.max([A(*c) + A(*r) for c, r in N['ells']], 0)
    elif N.get('kind') == 'fel' and N.get('pts'):
        P = np.array(sym(*N['pts']), np.float32); r = N.get('r', .02); lo, hi = P.min(0) - r, P.max(0) + r
    else: return None
    c, r = (lo + hi) / 2, (hi - lo) / 2 + .004
    c[2] += .3 * r[2]; r[2] *= .7   # (its back blends into the bridge and the pads, which are fur)
    return c, r

def seat(P):
    """The mouth's cut is a plane at the lip line: in front of the corners nothing of the upper lip may hang under it
    (it would go with the jaw), so the muzzle's underside and the whisker pads are kept just above it."""
    lip, zc = P['mouth']['y'], P['mouth']['corner']
    # (from a little behind the corners: the app's own corner, where the lips start to part, may lie a little further back)
    P["head"]["st"] = [(z, [(x, max(y, lip + .009)) if z > zc - .05 else (x, y) for x, y in sec]) for z, sec in P["head"]["st"]]
    for p in P.get("pads") or []: p["c"] = (p["c"][0], max(p["c"][1], lip + .009 + p["r"][1]), p["c"][2])

def build_sdf(S):
    N, ER = S['nose'], S.get('ears'); my = S['mouth']['y']
    ops = forms(S); base = lambda q, o=list(ops): run(o, q)
    if ER: EAR = Ear(ER).build_fluff()
    # the brow ridges: their curve laid on the skin, sunk so each stands out about .7 of its radius
    B = S.get('brow')   # (where drawn: a ridge stands out of the forehead and overhangs the eye)
    if B:
        for sd in (1, -1): ops.append(('+', Tube([(x * sd, y, z) for x, y, z in B['pts']], B['r'], squash=((0, 1, 0), B.get('sq', .7))), B.get('k', .03)))
    core = lambda q: run(ops, q)
    # ridges: a curve laid on the skin, sunk so it stands out (1 - sink) of its radius, flattened along the skin's normal
    # (a horse's facial crest)
    for R_ in S.get('ridges') or []:
        P = onskin(core, R_['pts'], [-r * R_.get('sink', .4) for r in R_['r']]); nr = grad(core, P[len(P) // 2:len(P) // 2 + 1])[0]
        ops.append(('+', Tube(list(P), R_['r'], squash=(nr / np.linalg.norm(nr), R_.get('sq', .6))), R_.get('k', .03)))
    # and pits: a curve sunk into the skin (a deer's tear pit in front of its eye)
    for C_ in S.get('pits') or []: ops.append(('-', Tube(list(onskin(core, C_['pts'], [r * C_.get('lift', 0) for r in C_['r']])), C_['r'], n=6), C_.get('k', .006)))
    # the tufts: the root sunk into the skin, the bend just over it, the tip lifted off; flat along the skin
    tufts = []
    for r, m, t, w, th in S.get('tufts') or []:
        P = onskin(core, [r, m], [-th * .5, th * .4]); nr = grad(core, P[1:2])[0]   # (the tip where drawn: it flares off)
        tufts.append(Tuft(P[0], P[1], A(*t), w, th, nr / np.linalg.norm(nr)))
    def ear_f(q): return EAR(q, .05)
    mir = lambda p: np.c_[np.abs(p[:, :1]), p[:, 1:]].astype(np.float32)
    # the eye: its front just under the face's skin in front of it (found along the gaze), the head moved back so the
    # eyes stay at z = 0
    E = S['eye']; g, _, _ = eye_frame(E)
    c0 = A(E['x'], 0, 0); t = np.linspace(-.4, .4, 1601, dtype=np.float32); ray = c0[None] + t[:, None] * g[None]
    out = core(ray) > 0; k = np.nonzero(out & (t > -.3))[0]; zf = t[k[0]] if len(k) else 0
    off = A(0, 0, (zf - E['re'] - E.get('sink', .004)) * g[2])
    ec = A(E['x'], 0, 0); eye = {**E, 'c': ec + off}
    M = S['mouth']
    if N.get('comma'):
        if N.get('kind') == 'none':   # (an ungulate's comma: drawn on the skin, wide at its top, narrowing down its tail,
            # opening into a deep hole behind its top)
            P = onskin(core, N['comma'], -N['nr'] * .45); g0 = grad(core, P[:1])[0]; g0 /= np.linalg.norm(g0)
            com = Tube(list(P), [N['nr'] * f for f in (1.2, 1.05, .8, .45, .25)][:len(P)], n=6); hole = Ell(P[0] - g0 * N['nr'] * 1.5, (N['nr'] * 1.05,) * 3)
            nostril = lambda q: smin(com(q), hole(q), .01)
        else: nostril = Tube(N['comma'], [N.get('nr', .014)] * len(N['comma']), n=6)
    def skin(p):
        q = mir(p) + off                              # (the head moved back so the eyes sit at z = 0)
        d = core(q)
        # the mouth: a groove along the lip line, round the front and back to the corners, then up into the smile
        # (the smile only, behind the corners: in front of them the upper lip's overhang is the line, and a groove there
        # would cut through where the muzzle and the jaw meet)
        sl = M.get('smile', (.08, .04))[0]; zc = M['corner']; zq = q[:, 2]
        fade = sstep(zc - sl - .01, zc - .04, zq) * (1 - sstep(zc - .03, zc + .005, zq))
        lip = (fade > 0) & (np.abs(q[:, 1] - my) < .12)
        if lip.any(): u = q[lip, 1] - mouth_line(S, zq[lip]); d[lip] = groove(d[lip], u, .004 + .011 * fade[lip], .004)
        if N.get('kind') in ('can', 'fel'):
            if N.get('comma'):   # nostrils: commas from the front of the leather curling out and down round its sides
                d = ssub(d, nostril(q), .004)
            else:
                nr = N.get('nr', .02); d = ssub(d, ellipsoid(q, A(*N['nostril']), (nr, nr * .55, nr * 1.1), rot((0, 0, 1), 28) @ rot((0, 1, 0), 25)), .006)
        elif N.get('kind') == 'none':   # a horse's or a goat's: long open nostrils on the muzzle's front corners
            if N.get('comma'): d = ssub(d, nostril(q), .008)
            else: nr = N['nr']; d = ssub(d, ellipsoid(q, A(*N['nostril']), (nr * .55, nr * 1.2, nr), rot((0, 0, 1), -18) @ rot((0, 1, 0), 35)), .012)
        if N.get('philtrum') and N.get('kind') in ('can', 'fel', 'none'):   # the philtrum: a groove from the notch under the nose down to the lip
            nb, nf = N['philtrum']; d = ssub(d, round_cone(q, A(0, nb, nf), A(0, my + .008, nf - .025), .01, .006), .006)
        elif N.get('kind') == 'drag':   # a dragon's: on top of its raised nostril bumps, opening up and forward
            nr = N['nr']; d = ssub(d, ellipsoid(q, A(*N['nostril']), (nr, nr * .6, nr * 1.4), rot((1, 0, 0), -30)), .006)
        if S.get('furrow'):   # the furrow up the forehead between the brows
            fy0, fy1, fr = S['furrow']; band = sstep(fy0 - .03, fy0 + .02, q[:, 1]) * (1 - sstep(fy1 - .06, fy1, q[:, 1]))
            m = band > 0
            if m.any(): d[m] = groove(d[m], q[m, 0], .003 + fr * band[m], .003)
        d = eye_ops(d, q, eye)
        if tufts:   # (each tuft apart from the next, a crease between them; all of them blended into the skin)
            t = tufts[0](q, .04)
            for T in tufts[1:]: t = np.minimum(t, T(q, .04))
            d = smin(d, t, .02)
        return smin(d, ear_f(q), .035) if ER else d
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
    oz = float(off[2]); jaw_bot = min(p[1] for _, sec in S['jaw']['st'] for p in sec)
    L = dict(eyeL=[E['x'], 0., 0.], eyeR=[-E['x'], 0., 0.], mouthY=float(my), hingeZ=float(S['jawh']['hinge'] - oz),
             neck=[0., float(jaw_bot + .02), float(S['neck'][0][2] - oz)], eyeR_=float(E['re']), eyeYaw=float(E['yaw']))
    le = leather(N)   # (moved with the head, as everything is: the eyes stay at z = 0)
    if le: L['nose'] = [float(v) for v in (le[0] - off)] + [float(v) for v in le[1]]
    return dict(skin=skin, ear=ear_w, horns=horns, eyes=[(ec, E['re']), (ec * A(-1, 1, 1), E['re'])], L=L, oz=oz, jaw_bot=jaw_bot)

def build(sp, step=.006):
    S = params(sp); D = build_sdf(S)
    top = max(p[1] for _, sec in S['head']['st'] for p in sec); lo = A(-.9, D['jaw_bot'] - 1.0, -1.0 - D['oz']); hi = A(.9, top + 1.1, .9 - D['oz'])
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
    if 'nose' in L: L['nose'] = [float(v * u) for v in L['nose']]
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
