# Thin out leaf/twig cards on photoscanned trees: keep whole cards (connected components) instead of edge-collapsing them,
# and enlarge the survivors so the crown keeps its mass. Writes src/<id>/c.gltf next to s.gltf.
import json, sys, os, numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}
def run(id_, keep, grow, mats_kw=('leaf', 'leaves', 'twig', 'needle', 'foliage')):
    d = f'{os.path.dirname(os.path.abspath(__file__))}/src/{id_}'; j = json.load(open(d + '/s.gltf'))
    bufs = [open(d + '/' + b['uri'], 'rb').read() for b in j['buffers']]
    def read(ai):
        a = j['accessors'][ai]; bv = j['bufferViews'][a['bufferView']]; dt = CT[a['componentType']]; n = NC[a['type']]
        off = bv.get('byteOffset', 0) + a.get('byteOffset', 0); stride = bv.get('byteStride', 0) or np.dtype(dt).itemsize * n
        raw = np.frombuffer(bufs[bv['buffer']], np.uint8, count=stride * (a['count'] - 1) + np.dtype(dt).itemsize * n, offset=off)
        if stride == np.dtype(dt).itemsize * n: return np.frombuffer(raw.tobytes(), dt).reshape(a['count'], n).copy()
        return np.stack([np.frombuffer(raw[i * stride:i * stride + np.dtype(dt).itemsize * n].tobytes(), dt) for i in range(a['count'])])
    leafy = {i for i, m in enumerate(j['materials']) if any(k in m['name'].lower() for k in mats_kw)}
    out = bytearray(); views = []; accs = []
    def add(arr, target=None):
        arr = np.ascontiguousarray(arr); views.append({'buffer': 0, 'byteOffset': len(out), 'byteLength': arr.nbytes, **({'target': target} if target else {})})
        out.extend(arr.tobytes()); out.extend(b'\0' * ((4 - len(out) % 4) % 4)); return len(views) - 1
    def acc(arr, ctype, typ, target):
        a = {'bufferView': add(arr, target), 'componentType': ctype, 'count': len(arr), 'type': typ}
        if typ == 'VEC3' and ctype == 5126: a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
        accs.append(a); return len(accs) - 1
    rng = np.random.default_rng(1); tot = [0, 0]
    for me in j['meshes']:
        for p in me['primitives']:
            attrs = {k: read(v) for k, v in p['attributes'].items() if k in ('POSITION', 'NORMAL', 'TEXCOORD_0')}
            idx = read(p['indices']).reshape(-1, 3).astype(np.int64); tot[0] += len(idx)
            if p.get('material') in leafy:
                n = len(attrs['POSITION']); e = np.concatenate([idx[:, [0, 1]], idx[:, [1, 2]]])
                nc, lab = connected_components(coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(n, n)), directed=False)
                kept = rng.random(nc) < keep; tl = lab[idx[:, 0]]; idx = idx[kept[tl]]
                # grow each kept card around its centre
                P = attrs['POSITION'].astype(np.float64); cs = np.zeros((nc, 3)); cnt = np.bincount(lab, minlength=nc)
                for k in range(3): cs[:, k] = np.bincount(lab, P[:, k], minlength=nc) / np.maximum(cnt, 1)
                attrs['POSITION'] = (cs[lab] + (P - cs[lab]) * grow).astype(np.float32)
            used = np.unique(idx); rm = -np.ones(len(attrs['POSITION']), np.int64); rm[used] = np.arange(len(used))
            idx = rm[idx].astype(np.uint32); tot[1] += len(idx)
            p['attributes'] = {k: acc(v[used].astype(np.float32), 5126, {1: 'SCALAR', 2: 'VEC2', 3: 'VEC3'}[v.shape[1]], 34962) for k, v in attrs.items()}
            p['indices'] = acc(idx.reshape(-1), 5125, 'SCALAR', 34963)
    open(d + '/c.bin', 'wb').write(out)
    j['buffers'] = [{'uri': 'c.bin', 'byteLength': len(out)}]; j['bufferViews'] = views; j['accessors'] = accs
    json.dump(j, open(d + '/c.gltf', 'w')); print(id_, 'tris', tot)
if __name__ == '__main__': run(sys.argv[1], float(sys.argv[2]), float(sys.argv[3]))
