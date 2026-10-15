# Pack the per-asset base64 files into one JSON bundle per scene (first scene that uses an asset owns it), plus props and textures.
import re, json, os, glob
H = os.path.dirname(os.path.abspath(__file__)); A = H + '/build/assets'; E = H + '/../../app/envs'; src = open(H + '/../../src/13-envs.js').read(); sets = open(H + '/../../src/12-sets.js').read()
scenes = []
for m in re.finditer(r"\n  (\w+): \{label: '[^']*', group: '\w+'.*?assets: \[([^\]]*)\]", src):
    scenes.append((m.group(1), re.findall(r"'([\w]+)'", m.group(2))))
props = re.findall(r"\['[^']+', '(\w+)'", sets[sets.index('const ASSET_PROPS'):])
owner = {}
for name, ids in scenes:
    for i in ids: owner.setdefault(i, name)
for i in props: owner.setdefault(i, 'props')
os.makedirs(E + '/b', exist_ok=True)
for f in glob.glob(E + '/b/*.json'): os.remove(f)
bund = {}
for i, b in owner.items():
    p = f'{A}/{i}.txt'
    if not os.path.exists(p): print('MISSING', i); continue
    bund.setdefault(b, {})[i] = open(p).read().strip()
for b, d in bund.items(): json.dump(d, open(f'{E}/b/{b}.json', 'w'))
tex = {os.path.basename(f)[:-4]: open(f).read().strip() for f in glob.glob(A + '/tex/*.txt')}
json.dump(tex, open(f'{E}/b/tex.json', 'w'))
json.dump({i: b for i, b in owner.items()}, open(E + '/manifest.json', 'w'))
for b in sorted(bund, key=lambda b: -os.path.getsize(f'{E}/b/{b}.json')): print(b, len(bund[b]), os.path.getsize(f'{E}/b/{b}.json') // 1024, 'kB')
print('tex', os.path.getsize(E + '/b/tex.json') // 1024, 'kB')
