# Hairstyles: MakeHuman's system hair (MHCLO proxies, CC0 1.0) converted to the app's garment format, so they are fitted,
# skinned and refitted to every body exactly like the clothes. Writes app/ropa/h-<name>.txt and app/ropa/hair.json.
#   python3 build_hair.py <MakeHuman data dir, as for build_ext.py> <hair dirs, ':'-separated: <name>/<name>.mhclo, .obj, .mhmat, textures, .thumb> [names]
# With names (comma-separated), only those are (re)built and added to the hair.json already there; without, the system ten.
# Community hair from the MakeHuman asset packs (hair01 CC0, hair02/hair03 CC-BY): author and licence come from the .mhclo.
# Hair proxies hang from MakeHuman's helper-hair shell, which the stored figure has no anchors for: each such reference is
# moved to the nearest anchor the figure does have, and the garment offset absorbs the difference.
import sys, os, io, json, struct, gzip, base64
import numpy as np
from PIL import Image, ImageFile, PngImagePlugin
PngImagePlugin.MAX_TEXT_CHUNK = 64 * 2 ** 20; ImageFile.LOAD_TRUNCATED_IMAGES = True  # some community textures carry large metadata chunks
HAIRS = sys.argv[2].split(':'); NAMES = sys.argv[3].split(',') if len(sys.argv) > 3 else None
sys.argv = sys.argv[:2]
import build_ext as X
from mhclo import parse_mhclo, parse_obj, parse_mhmat
from repack_ropa import repack_file

TITLES = {'afro01': 'Afro', 'bob01': 'Media melena', 'bob02': 'Bob', 'braid01': 'Trenza', 'long01': 'Melena larga', 'ponytail01': 'Coleta',
          'short01': 'Despeinado', 'short02': 'Ondulado', 'short03': 'De lado', 'short04': 'Hacia atrás'}
ORDER = ['short04', 'short01', 'short02', 'short03', 'afro01', 'bob02', 'bob01', 'long01', 'ponytail01', 'braid01']
# community hairstyles (asset packs hair01/02/03), picked to fill what the system ten lack
TITLES.update({'culturalibre_hair_05': 'Corto texturizado', 'elvs_grump_hair': 'Tupé', 'elvs_maxwell_hair': 'Pompadour', 'culturalibre_hair_06': 'Pixie',
  'elvs_inverted_curly_bob': 'Rizado corto', 'toigo_blunt_bob_with_bangs': 'Bob con flequillo', 'cortu_straight_bangs': 'Liso con flequillo',
  'elvs_daisy_hair': 'Larga ondulada', 'o4saken_long01': 'Larga a capas', 'elvs_that_80s_babe_hair': 'Ochentero', 'rehmanpolanski_hair_bun_brown': 'Moño',
  'elvs_reverse_french_braid_bun': 'Moño trenzado', 'elvs_50s_updo': 'Recogido', 'elvs_double_mh_braid': 'Dos trenzas', 'elvs_braided_rows': 'Trenzas pegadas',
  'elvs_micky_afro': 'Moños afro', 'culturalibre_hair_13': 'Coleta de lado', 'o4saken_curly01': 'Rizos largos', 'culturalibre_hair_17': 'Larga voluminosa'})
SCALE_DEF = {'x': (5399, 11998, 1.398), 'y': (791, 881, 2.2028), 'z': (962, 5320, 1.8441)}  # elvs_micky_afro's, measured on the head
RELEVEL = {'elvs_double_mh_braid', 'elvs_reverse_french_braid_bun'}
def find(name):
    for h in HAIRS:
        d = os.path.join(h, name)
        if os.path.exists(os.path.join(d, name + '.mhclo')): return d
    raise FileNotFoundError(name)
def header(path):  # '# author: …' and '# license: …' in the .mhclo's opening comments
    out = {}
    for l in open(path, encoding='utf-8', errors='ignore'):
        if not l.startswith('#'): break
        k, _, v = l[1:].partition(':')
        if k.strip() in ('author', 'license'): out[k.strip()] = v.strip()
    return out
OUT = os.path.join(X.APPDIR, 'ropa')

used, remap, hidx, full0 = X.used, X.remap, X.hidx, X.full0
nV = len(used); hpos = {v: i for i, v in enumerate(hidx)}
anchors = np.array(used + hidx); A = full0[anchors]  # what the app calls m.anchors, at the default body
anchor = lambda v: remap[v] if v in remap else nV + hpos[v]
# app-bone weights per MakeHuman vertex (as build2.py merges them)
src2app = {a[1]: i for i, a in enumerate(X.APP)}
def app_of(b):
    while b is not None:
        if b in src2app: return src2app[b]
        b = X.B[b]['parent']
wacc = [dict() for _ in range(X.nAll)]
for bname, lst in X.W.items():
    ai = app_of(bname)
    for v, w in lst: wacc[v][ai] = wacc[v].get(ai, 0) + w
def top4(acc):
    items = sorted(((b, w) for b, w in acc.items() if w > 0), key=lambda x: -x[1])[:4]
    tot = sum(w for _, w in items)
    if tot <= 0: return [4, 0, 0, 0], [255, 0, 0, 0]
    q = [int(round(w / tot * 255)) for _, w in items]; q[0] += 255 - sum(q)
    return [b for b, _ in items] + [0] * (4 - len(items)), q + [0] * (4 - len(items))
eye = set(i for g in ('helper-l-eye', 'helper-r-eye') for q in X.F[g] for i in q)
bodyOnly = np.array([k for k, v in enumerate(used) if v not in eye])

catalog = []
for name in NAMES or ORDER:
    d = find(name); mp = os.path.join(d, name + '.mhclo'); hd = header(mp)
    m = parse_mhclo(mp); Vc, VTc, Fc = parse_obj(os.path.join(d, m['obj_file'] or name + '.obj')); mat = parse_mhmat(os.path.join(d, m['material'] or name + '.mhmat'))
    assert len(m['verts']) == len(Vc), name
    refs = np.array([v[:3] for v in m['verts']]); W3 = np.array([v[3:6] for v in m['verts']]); O = np.array([v[6:9] for v in m['verts']]) * X.SCALE
    # references the figure cannot follow: the nearest anchor it has, the offset keeps the vertex where it was
    moved = 0
    for k in range(len(refs)):
        for j in range(3):
            r = refs[k, j]
            if r in remap or r in hpos: continue
            a = int(np.argmin(((A - full0[r]) ** 2).sum(1)))
            O[k] += W3[k, j] * (full0[r] - A[a]); refs[k, j] = anchors[a]; moved += 1
    sc = []
    if len(m['scale']) < 3: m['scale'] = {**SCALE_DEF, **m['scale']}  # a few community files have no scale lines: the head's usual ones
    for ax, k in (('x', 0), ('y', 1), ('z', 2)):
        a, b2, ref = m['scale'][ax]
        sc.append([anchor(a), anchor(b2), float(abs(full0[a][k] - full0[b2][k])), float(abs(X.maleBase[a][k] - X.maleBase[b2][k]) / ref)])
    Wp = np.clip(W3, 0, None); Wp = Wp / np.maximum(Wp.sum(1, keepdims=True), 1e-9)
    # long hair below the neck follows the chest, not only the head: it hangs down the back when the body bends
    Pfit = (A[np.vectorize(anchor)(refs)] * W3[:, :, None]).sum(1) + O
    yN = X.J0[3][1]; tH = np.clip((Pfit[:, 1] - (yN - .1)) / .12, 0, 1); tH = tH * tH * (3 - 2 * tH)
    si = np.zeros((len(refs), 4), np.uint8); sw = np.zeros((len(refs), 4), np.uint8)
    for k in range(len(refs)):
        acc = {}
        for r, w in zip(refs[k], Wp[k]):
            for bn, ww in wacc[r].items(): acc[bn] = acc.get(bn, 0) + w * ww * tH[k]
        if tH[k] < 1: acc[2] = acc.get(2, 0) + (1 - tH[k])
        si[k], sw[k] = top4(acc)
    keymap = {}; rv = []; tris = []
    for f in Fc:
        ids = []
        for v, t in f:
            key = (v, t if 0 <= t < len(VTc) else -1)
            if key not in keymap: keymap[key] = len(rv); rv.append(key)
            ids.append(keymap[key])
        for j in range(1, len(ids) - 1): tris += [ids[0], ids[j], ids[j + 1]]
    vi = np.array([k[0] for k in rv]); uv = np.array([VTc[k[1]] if k[1] >= 0 else (0, 0) for k in rv], np.float64); n = len(rv)
    bv = np.array([bodyOnly[np.argmin(((A[bodyOnly] - p) ** 2).sum(1))] for p in Pfit], np.int32)
    # texture: 512 px webp with its alpha; the average colour of the strands, for tinting
    im = Image.open(os.path.join(d, mat['diffuseTexture'][0])).convert('RGBA')
    if name in RELEVEL:  # a dyed texture (black, grape…): its strands' light and shade as neutral greys, so the tint works like on the rest
        px = np.asarray(im).astype(np.float32); L = px[..., :3] @ np.array([.299, .587, .114]); op = px[..., 3] > 128
        lo, hi = np.percentile(L[op], [4, 96]) if op.any() else (0, 255); g = np.clip((L - lo) / max(hi - lo, 1) * .7 + .25, 0, 1) * 255
        im = Image.fromarray(np.dstack([g, g, g, px[..., 3]]).astype(np.uint8), 'RGBA')
    px = np.asarray(im.resize((256, 256), Image.LANCZOS)).reshape(-1, 4); op = px[px[:, 3] > 128]
    avg = [int(x) for x in op[:, :3].mean(0)] if len(op) else [128, 100, 70]
    bio = io.BytesIO(); im.resize((512, 512), Image.LANCZOS).save(bio, 'WEBP', quality=82, method=6); tex = bio.getvalue()
    big = n > 65535
    arrs = [np.array([anchor(r) for r in refs[vi].ravel()], np.uint16).tobytes(), W3[vi].astype(np.float32).tobytes(),
            np.clip(np.round(O[vi] / 1e-4), -32767, 32767).astype(np.int16).tobytes(), np.clip(np.round(uv * 4096), -32767, 32767).astype(np.int16).tobytes(),
            si[vi].tobytes(), sw[vi].tobytes(), bv[vi].astype(np.uint16).tobytes(), np.array(tris, np.uint32 if big else np.uint16).tobytes(), tex]
    offs = []; blob = b''
    for a in arrs: offs.append(len(blob)); blob += a + b'\0' * ((4 - len(a) % 4) % 4)
    hdr = {'rank': 55, 'n': n, 'nt': len(tris) // 3, 'big': big, 'sc': sc, 'del': [], 'cov': [], 'z': m['z_depth'], 'offs': offs, 'texLen': len(tex),
           'alpha': 1, 'avg': avg, 'col': [1, 1, 1], 'hair': True}
    hj = json.dumps(hdr).encode(); hj += b' ' * ((4 - len(hj) % 4) % 4)
    hid = 'h-' + name
    open(os.path.join(OUT, hid + '.txt'), 'w').write(base64.b64encode(gzip.compress(struct.pack('<I', len(hj)) + hj + blob, 9)).decode())
    repack_file(os.path.join(OUT, hid + '.txt'))
    # thumbnail: a render from the app itself when there is one (<name>/app-thumb.png), else MakeHuman's
    tf = os.path.join(d, 'app-thumb.png')
    th = io.BytesIO(); Image.open(tf if os.path.exists(tf) else os.path.join(d, name + '.thumb')).convert('RGB').resize((96, 96), Image.LANCZOS).save(th, 'WEBP', quality=80)
    catalog.append({'id': hid, 'title': TITLES[name], 'author': hd.get('author', 'MakeHuman'), 'license': hd.get('license', 'CC0'), 'n': n, 'top': float(Pfit[:, 1].max()), 'low': float(Pfit[:, 1].min()),
                    'thumb': 'data:image/webp;base64,' + base64.b64encode(th.getvalue()).decode()})
    print(f'{hid}: {n} vertices, {len(tris) // 3} triangles, {moved} references moved, texture {len(tex) // 1024} kB, lowest point {Pfit[:, 1].min():.2f} m')
if NAMES:  # add to (or replace in) the catalogue that is there, keeping its order
    old = json.load(open(os.path.join(OUT, 'hair.json'))); ids = {c['id'] for c in catalog}
    catalog = [c for c in old if c['id'] not in ids] + catalog
json.dump(catalog, open(os.path.join(OUT, 'hair.json'), 'w'), ensure_ascii=False)
print('hair.json', len(catalog))
