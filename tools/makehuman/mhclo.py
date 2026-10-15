# parsers for MakeHuman clothes (.mhclo fitting + .obj mesh), CC0 assets from makehumancommunity.org
def parse_mhclo(path):
    out = {'scale': {}, 'verts': [], 'delete': [], 'z_depth': 50, 'name': '', 'material': None, 'obj_file': None}
    mode = None
    for raw in open(path, encoding='utf-8', errors='ignore'):
        l = raw.split('#', 1)[0].strip()
        if not l: continue
        p = l.split()
        if p[0][0].isalpha() and not (p[0] == '-'):
            k = p[0]
            if k in ('verts', 'delete_verts'): mode = k
            if k in ('x_scale', 'y_scale', 'z_scale'): out['scale'][k[0]] = (int(p[1]), int(p[2]), float(p[3]))
            elif k == 'z_depth': out['z_depth'] = int(float(p[1]))
            elif k in ('name', 'material', 'obj_file'): out[k] = ' '.join(p[1:])
            continue
        if mode == 'verts':
            if len(p) >= 9: out['verts'].append((int(p[0]), int(p[1]), int(p[2]), float(p[3]), float(p[4]), float(p[5]), float(p[6]), float(p[7]), float(p[8])))
            elif len(p) == 1: out['verts'].append((int(p[0]), int(p[0]), int(p[0]), 1.0, 0.0, 0.0, 0.0, 0.0, 0.0))
        elif mode == 'delete_verts':
            i = 0
            while i < len(p):
                if i + 2 < len(p) and p[i + 1] == '-': out['delete'] += list(range(int(p[i]), int(p[i + 2]) + 1)); i += 3
                else:
                    try: out['delete'].append(int(p[i]))
                    except ValueError: pass
                    i += 1
    return out

def parse_obj(path):
    V, VT, F = [], [], []
    for l in open(path, encoding='utf-8', errors='ignore'):
        if l.startswith('v '): V.append([float(x) for x in l.split()[1:4]])
        elif l.startswith('vt '): VT.append([float(x) for x in l.split()[1:3]])
        elif l.startswith('f '):
            f = []
            for c in l.split()[1:]:
                s = c.split('/'); f.append((int(s[0]) - 1, int(s[1]) - 1 if len(s) > 1 and s[1] else -1))
            F.append(f)
    return V, VT, F

def parse_mhmat(path):
    d = {}
    try:
        for l in open(path, encoding='utf-8', errors='ignore'):
            p = l.split('#', 1)[0].split()
            if len(p) >= 2: d[p[0]] = p[1:]
    except OSError: pass
    return d
