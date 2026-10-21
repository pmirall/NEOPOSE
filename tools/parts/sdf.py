# Signed distance field sculpting in numpy: primitives, smooth booleans, a field container and mesh extraction.
# Points are (N, 3) float32 arrays; every primitive returns (N,) distances (negative inside).
import numpy as np

def _n(v): v = np.asarray(v, np.float32); return v / (np.linalg.norm(v) + 1e-12)

def sphere(p, c, r): return np.linalg.norm(p - np.asarray(c, np.float32), axis=1) - r

def ellipsoid(p, c, r, R=None):
    """Approximate ellipsoid distance (Quilez, bound-corrected). r = semi-axes; R = 3x3 rotation (columns = local axes)."""
    q = p - np.asarray(c, np.float32)
    if R is not None: q = q @ np.asarray(R, np.float32)
    r = np.asarray(r, np.float32)
    k0 = np.linalg.norm(q / r, axis=1); k1 = np.linalg.norm(q / (r * r), axis=1)
    return k0 * (k0 - 1.0) / (k1 + 1e-9)

def round_cone(p, a, b, ra, rb):
    """Quilez exact round cone between spheres (a, ra) and (b, rb)."""
    a = np.asarray(a, np.float32); b = np.asarray(b, np.float32)
    ba = b - a; l2 = float(ba @ ba); rr = ra - rb; a2 = l2 - rr * rr; il2 = 1.0 / l2
    pa = p - a; y = pa @ ba; z = y - l2
    x = pa * l2 - y[:, None] * ba; x2 = np.einsum('ij,ij->i', x, x)
    y2 = y * y * l2; z2 = z * z * l2
    k = np.sign(rr) * rr * rr * x2
    d = np.where(np.sign(z) * a2 * z2 > k, np.sqrt(x2 + z2) * il2 - rb,
        np.where(np.sign(y) * a2 * y2 < k, np.sqrt(x2 + y2) * il2 - ra, (np.sqrt(x2 * a2 * il2) + y * rr) * il2 - ra))
    return d.astype(np.float32)

def capsule(p, a, b, r): return round_cone(p, a, b, r, r)

def smin(a, b, k):
    """Polynomial smooth minimum (union) with blend radius k."""
    if k <= 0: return np.minimum(a, b)
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1); return b + (a - b) * h - k * h * (1 - h)

def smax(a, b, k): return -smin(-a, -b, k)

def ssub(a, b, k):
    """Smooth subtraction: a minus b."""
    return smax(a, -b, k)

def frame(fwd, up):
    """Rotation whose columns are x (side), y (fwd), z (up), orthonormal, from a forward and an approximate up."""
    y = _n(fwd); z = np.asarray(up, np.float32); z = _n(z - (z @ y) * y); x = np.cross(y, z)
    return np.stack([x, y, z], axis=1)

def claw(p, base, fwd, up, length, r0, curl=1.0, flat=0.72, tip=0.0025):
    """A keratin claw: a tapered cone bent down along an arc in its (fwd, up) plane.
    base = centre of the root; length = arc length; r0 = root radius (side-to-side before flattening);
    curl = arc angle in radians (hooked felid ~1.6, canid ~0.9); flat = side-to-side over top-to-bottom ratio."""
    R = frame(fwd, up); q = (p - np.asarray(base, np.float32)) @ R   # local: x side, y forward, z up
    if curl < 1e-3:
        t = q[:, 1] / length; rad = np.hypot(q[:, 0] / flat, q[:, 2])
    else:
        Rc = length / curl                                            # arc centre below the root: (0, 0, -Rc)
        yz = np.stack([q[:, 1], q[:, 2] + Rc], 1)
        ang = np.arctan2(yz[:, 0], yz[:, 1])                          # 0 at the root, grows as it bends down
        t = ang / curl; dr = np.linalg.norm(yz, axis=1) - Rc
        rad = np.hypot(q[:, 0] / flat, dr)
    tc = np.clip(t, 0, 1)
    r = r0 * (1 - tc) ** 0.85 + tip
    d = rad - r
    # caps: behind the root (flat end hidden in the hood) and past the tip
    behind = np.where(t < 0, -t * length, 0); past = np.where(t > 1, (t - 1) * length, 0)
    return (np.maximum(d, 0) + behind + past + np.minimum(d, 0) * (1 - (t < 0) - (t > 1))).astype(np.float32)

class Field:
    """A grid over a box; evaluate a field function on it and extract a mesh."""
    def __init__(self, lo, hi, step):
        self.lo = np.asarray(lo, np.float32); self.hi = np.asarray(hi, np.float32); self.step = step
        self.shape = tuple(int(np.ceil((h - l) / step)) + 1 for l, h in zip(self.lo, self.hi))
    def points(self):
        ax = [self.lo[i] + np.arange(self.shape[i], dtype=np.float32) * self.step for i in range(3)]
        g = np.stack(np.meshgrid(*ax, indexing='ij'), -1).reshape(-1, 3); return g
    def mesh(self, f, chunk=1_000_000, coarse=4):
        """Narrow band: the field on a grid `coarse` times sparser first, then the fine grid only near the surface."""
        from skimage.measure import marching_cubes
        sh = self.shape; cs = tuple((n + coarse - 1) // coarse + 1 for n in sh)
        ax = [self.lo[i] + np.arange(cs[i], dtype=np.float32) * self.step * coarse for i in range(3)]
        C = np.stack(np.meshgrid(*ax, indexing='ij'), -1).reshape(-1, 3); DC = np.empty(len(C), np.float32)
        for i in range(0, len(C), chunk): DC[i:i + chunk] = f(C[i:i + chunk])
        DC = DC.reshape(cs)
        # each fine point takes its coarse cell's corner value; near the surface (within the cell's diagonal) it is evaluated
        idx = [np.minimum(np.arange(n) // coarse, cs[i] - 1) for i, n in enumerate(sh)]
        D = DC[np.ix_(*idx)].copy(); band = self.step * coarse * 1.9
        near = np.zeros(sh, bool)
        for dx in (0, 1):
            for dy in (0, 1):
                for dz in (0, 1):
                    I = [np.minimum(idx[0] + dx, cs[0] - 1), np.minimum(idx[1] + dy, cs[1] - 1), np.minimum(idx[2] + dz, cs[2] - 1)]
                    near |= np.abs(DC[np.ix_(*I)]) < band
        w = np.argwhere(near); P = self.lo + w.astype(np.float32) * self.step; V = np.empty(len(P), np.float32)
        for i in range(0, len(P), chunk): V[i:i + chunk] = f(P[i:i + chunk])
        D[near] = V; D[~near] = np.sign(D[~near]) * np.maximum(np.abs(D[~near]), band)
        # the box's faces count as outside, so a shape that reaches them is closed there (a capped stub, never a hole)
        for ax in range(3):
            sl = [slice(None)] * 3
            for e in (0, -1): sl[ax] = e; D[tuple(sl)] = np.maximum(D[tuple(sl)], self.step)
        v, fa, n, _ = marching_cubes(D, 0.0, spacing=(self.step,) * 3, gradient_direction='descent')
        return v + self.lo, fa.astype(np.int32), n
