# Download Poly Haven (CC0) models and pack them small for the scenery: diffuse only, WebP 512, simplified, meshopt-compressed.
import json, os, sys, subprocess, urllib.request, base64, concurrent.futures as cf
H = os.path.dirname(os.path.abspath(__file__)); SRC = H + '/src'; OUT = H + '/build/assets'; os.makedirs(OUT, exist_ok=True)
META = json.load(open(H + '/ph_models.json'))
def get(url, path, size=None):
    if os.path.exists(path) and os.path.getsize(path) > 0 and (size is None or os.path.getsize(path) == size): return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for t in range(4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'cuaderno-poses'})
            with urllib.request.urlopen(req, timeout=300) as r: data = r.read()
            if size and len(data) != size: raise IOError('short')
            open(path + '.part', 'wb').write(data); os.replace(path + '.part', path); return
        except Exception as e: err = e
    raise err
def fetch(id_, res='1k'):
    d = SRC + '/' + id_
    files = json.load(urllib.request.urlopen(urllib.request.Request('https://api.polyhaven.com/files/' + id_, headers={'User-Agent': 'cuaderno-poses'})))
    g = files['gltf'].get(res) or files['gltf'][sorted(files['gltf'])[0]]; g = g['gltf']
    get(g['url'], d + '/m.gltf', g.get('size'))
    for rel, v in g['include'].items():
        if rel.endswith('.bin') or 'diff' in rel.lower() or 'opacity' in rel.lower() or 'alpha' in rel.lower(): get(v['url'], d + '/' + rel, v.get('size'))
    # keep only base colour: drop normal / ARM / other textures (the sketch shading ignores them)
    j = json.load(open(d + '/m.gltf'))
    for m in j.get('materials', []):
        if m.pop('emissiveTexture', None) is not None: m.pop('emissiveFactor', None); m.get('extensions', {}).pop('KHR_materials_emissive_strength', None)
        for k in ('normalTexture', 'occlusionTexture'): m.pop(k, None)
        pb = m.get('pbrMetallicRoughness', {}); pb.pop('metallicRoughnessTexture', None)
    used = {m.get('pbrMetallicRoughness', {}).get('baseColorTexture', {}).get('index') for m in j.get('materials', [])}
    # remap textures/images to the used ones only
    tex = j.get('textures', []); keep = [i for i in range(len(tex)) if i in used]
    imgs = sorted({tex[i]['source'] for i in keep}); imap = {o: n for n, o in enumerate(imgs)}; tmap = {o: n for n, o in enumerate(keep)}
    j['images'] = [j['images'][i] for i in imgs]; j['textures'] = [{**tex[i], 'source': imap[tex[i]['source']]} for i in keep]
    for m in j.get('materials', []):
        bt = m.get('pbrMetallicRoughness', {}).get('baseColorTexture')
        if bt: bt['index'] = tmap[bt['index']]
    json.dump(j, open(d + '/s.gltf', 'w'))
    return d
def pack(id_, tris=6000, extra=()):
    try: d = fetch(id_)
    except Exception as e: print(id_, 'FETCH FAIL', repr(e)[:200]); return None
    src = d + ('/c.gltf' if os.path.exists(d + '/c.gltf') else '/s.gltf')
    jj = json.load(open(src)); pc = sum(jj['accessors'][p_['indices']]['count'] // 3 for m in jj['meshes'] for p_ in m['primitives'])
    r = min(1, tris / pc)
    out = f'{H}/out/{id_}.glb'; os.makedirs(H + '/out', exist_ok=True)
    cmd = [H + '/tool/gltfpack', '-i', src, '-o', out, '-tw', '-tl', '512', '-tq', '7', '-cc', '-kn', '-km'] + (['-si', f'{r:.4f}'] if r < 1 else []) + list(extra)
    p = subprocess.run(cmd, cwd=H + '/tool', capture_output=True, text=True)
    if p.returncode: print(id_, 'ERR', p.stderr[-400:]); return None
    open(f'{OUT}/{id_}.txt', 'w').write(base64.b64encode(open(out, 'rb').read()).decode())
    return id_, os.path.getsize(out) // 1024
if __name__ == '__main__':
    lst = json.load(open(H + '/list.json'))
    only = sys.argv[1:]
    jobs = [(k, v) for k, v in lst.items() if not only or k in only]
    with cf.ThreadPoolExecutor(6) as ex:
        for res in ex.map(lambda kv: pack(kv[0], kv[1].get('tris', 6000), kv[1].get('extra', [])), jobs): print(res, flush=True)
