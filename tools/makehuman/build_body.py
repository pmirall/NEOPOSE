# Body extension: MakeHuman (CC0) modelling targets for body types and the advanced body settings, baked like the
# figure (build_ext.py checks first that it reproduces the stored figure) into app/figure-body.txt:
#   - fat and muscle where they sit: belly, buttocks, hips, waist, bust, arms and legs (fat and muscle apart),
#     pectorals, back, V shape, shoulders, neck
#   - lengths: upper arm, forearm, thigh, shin
#   - MakeHuman's geometric body shapes (apple, pear, hourglass, rectangle, inverted triangle, diamond, column,
#     trapezoid), for women and for men (not its 'glandular' types: no basis in anatomy)
# Each set is the difference it makes on the young adult base of its sex, both sides at once for arms and legs.
#   python3 build_body.py <makehuman data dir>   (base.obj, default.mhskel, default_weights.mhw, t/ macrodetails,
#                                                 loc/<group>_<target>.target from makehuman/data/targets)
import sys, os, json, struct, base64
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_ext as X

LOC = os.path.join(X.SRC, 'loc')
tg = lambda name: X.target(os.path.join(LOC, name.replace('/', '_') + '.target'))
both = lambda f: sum(tg(f.format(s=s)) for s in 'lr')
PAIRS = {  # app name: MakeHuman target without -incr/-decr
    'belly': 'stomach/stomach-pregnant', 'glutes': 'buttocks/buttocks-volume', 'hipw': 'hip/hip-scale-horiz', 'hipd': 'hip/hip-scale-depth',
    'vshape': 'torso/torso-vshape', 'torsow': 'torso/torso-scale-horiz', 'torsod': 'torso/torso-scale-depth', 'pecs': 'torso/torso-muscle-pectoral', 'lats': 'torso/torso-muscle-dorsi',
    'waist': 'measure/measure-waist-circ', 'hips': 'measure/measure-hips-circ', 'bust': 'measure/measure-bust-circ', 'shoulders': 'measure/measure-shoulder-dist', 'neck': 'measure/measure-neck-circ',
    'uarm': 'measure/measure-upperarm-circ', 'thigh': 'measure/measure-thigh-circ', 'calf': 'measure/measure-calf-circ',
    'uarmlen': 'measure/measure-upperarm-length', 'farmlen': 'measure/measure-lowerarm-length', 'thighlen': 'measure/measure-upperleg-height', 'shinlen': 'measure/measure-lowerleg-height'}
LIMBS = {'armfat': ('upperarm', 'lowerarm', 'fat'), 'armmus': ('upperarm', 'lowerarm', 'muscle'), 'legfat': ('upperleg', 'lowerleg', 'fat'), 'legmus': ('upperleg', 'lowerleg', 'muscle')}

def main():
    X.xsets = []; X.xdata = []
    sets, data = X.xsets, X.xdata
    fJ = X.bake(X.femaleBase)[1]; fJ[:, 1] -= X.floor
    def add(name, delta, female=False):
        base, ref, refJ = (X.femaleBase, X.fb_full, fJ) if female else (X.maleBase, X.full0, X.J0)
        m, j = X.bake(base + delta); m[:, 1] -= X.floor; j[:, 1] -= X.floor
        dm = m[X.used] - ref[X.used]; dh = m[X.hidx] - ref[X.hidx]; dj = j - refJ
        iv = np.where(np.abs(dm).max(1) > 2e-5)[0]; ih = np.where(np.abs(dh).max(1) > 2e-5)[0]
        sets.append({'name': name, 'n': int(len(iv)), 'nh': int(len(ih))}); data.append((iv, dm[iv], ih, dh[ih], dj))
        print(f'  {name}: {len(iv)} vertices, max {np.abs(dm).max() * 100:.1f} cm')
    for k, t in PAIRS.items():
        add(f'b-{k}+', tg(t + '-incr')); add(f'b-{k}-', tg(t + '-decr'))
    for k, (a, b, kind) in LIMBS.items():
        for d, sgn in (('incr', '+'), ('decr', '-')):
            add(f'b-{k}{sgn}', both(f'armslegs/{{s}}-{a}-{kind}-{d}') + both(f'armslegs/{{s}}-{b}-{kind}-{d}'))
    for f in sorted(os.listdir(LOC)):
        if f.startswith('bodyshapes_') and f.endswith('.target'):
            nm = f[len('bodyshapes_bodyshapes-elvs-'):-7]
            if any(g in nm for g in ('adrenal', 'liver', 'ovary', 'thyroid', 'gonadal')): continue
            add('bs-' + nm, X.target(os.path.join(LOC, f)), female=nm.startswith('fem'))
    QS = X.meta['q']
    ext = {'xsets': sets, 'q': QS, 'nV': X.nV, 'nH': X.nH, 'license': 'Body modelling targets: MakeHuman, CC0 1.0 (makehumancommunity.org)'}
    js = json.dumps(ext).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
    buf = bytearray(struct.pack('<I', len(js)) + js)
    def pad(b): buf.extend(b); buf.extend(b'\0' * ((4 - len(b) % 4) % 4))
    for iv, dv, ih, dh, dj in data:
        pad(iv.astype(np.uint16).tobytes()); pad(np.clip(np.round(dv / QS), -32767, 32767).astype(np.int16).tobytes())
        pad(ih.astype(np.uint16).tobytes()); pad(np.clip(np.round(dh / QS), -32767, 32767).astype(np.int16).tobytes())
        pad(dj.astype(np.float32).tobytes())
    open(os.path.join(X.APPDIR, 'figure-body.txt'), 'w').write(base64.b64encode(bytes(buf)).decode())
    print('app/figure-body.txt', len(sets), 'sets', round(len(buf) / 1024), 'kB')

if __name__ == '__main__': main()
