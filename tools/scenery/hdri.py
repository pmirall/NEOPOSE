# 360° panoramas for the "Panorama" sets: Poly Haven HDRIs (CC0), their tonemapped JPG scaled to 3072x1536 WebP.
#   python3 hdri.py   (needs ImageMagick) -> app/envs/hdri/<id>.webp
import json, os, subprocess, urllib.request
H = os.path.dirname(os.path.abspath(__file__)); SRC = H + '/src/hdri'; OUT = os.path.join(H, '..', '..', 'app', 'envs', 'hdri')
IDS = ['wide_street_01', 'canary_wharf', 'shanghai_bund', 'meadow_2', 'lilienstein', 'venice_sunset', 'photo_studio_loft_hall', 'fireplace']
os.makedirs(SRC, exist_ok=True); os.makedirs(OUT, exist_ok=True)
ua = {'User-Agent': 'neopose'}
for i in IDS:
    src, dst = f'{SRC}/{i}.jpg', f'{OUT}/{i}.webp'
    if not os.path.exists(src):
        f = json.load(urllib.request.urlopen(urllib.request.Request('https://api.polyhaven.com/files/' + i, headers=ua)))['tonemapped']
        data = urllib.request.urlopen(urllib.request.Request(f['url'], headers=ua), timeout=600).read(); open(src, 'wb').write(data)
    subprocess.run(['magick', src, '-resize', '3072x1536!', '-quality', '78', dst], check=True)
    print(i, os.path.getsize(dst) // 1024, 'kB')
