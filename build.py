#!/usr/bin/env python3
"""Assemble app/index.html from src/ (offline: three.js and fonts are vendored in app/)."""
import json, os
H = os.path.dirname(os.path.abspath(__file__))
rd = lambda p: open(os.path.join(H, p), encoding='utf-8').read()
MODULES = ['00-i18n', '01-core', '02-poses', '03-figure', '03b-muscles', '04-scene', '05-app', '05b-guides', '05c-ui', '05d-library', '05e-input', '05f-render', '05g-boot', '06-tools', '08-ropa', '09-ropa-ui', '10-anthro', '10b-bodies', '11-heads', '12-sets', '13-envs', '14-tour', '15-avatars', '16-practice', '17-hair', '18-anatomy', '19-posing', '19b-dynamics', '20-scene', '20b-limbs', '21-export', '22-anim', '22b-motion', '23-photo', '24-perf', '25-share', '26-clips', '27-board', '07-start']
I18D = os.path.join(H, 'src', 'i18n')
I18N = {f[:-5]: json.load(open(os.path.join(I18D, f), encoding='utf-8')) for f in sorted(os.listdir(I18D)) if f.endswith('.json') and f != 'es.json'}
GD = os.path.join(I18D, 'garments')
GTR = {f[:-5]: json.load(open(os.path.join(GD, f), encoding='utf-8')) for f in sorted(os.listdir(GD)) if f.endswith('.json') and f != 'en.json'} if os.path.isdir(GD) else {}
js = ('const I18N = ' + json.dumps(I18N, ensure_ascii=False) + ';\nconst I18N_EN = I18N.en;\nconst GARMENT_TR = ' + json.dumps(GTR, ensure_ascii=False) + ';\n'
      + 'const ENV_MANIFEST = ' + rd('app/envs/manifest.json') + ';\n'
      + 'const HEAD_CATALOG = ' + json.dumps(json.load(open(os.path.join(H, 'app/heads/catalog.json'), encoding='utf-8')), ensure_ascii=False) + ';\n'
      + '\n'.join(rd(f'src/{m}.js') for m in MODULES))
VENDOR = ['three.min.js', 'OrbitControls.js', 'TransformControls.js', 'GLTFLoader.js', 'meshopt_decoder.js', 'fflate.min.js', 'NURBSUtils.js', 'NURBSCurve.js', 'FBXLoader.js']
html = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>NEOPOSE</title>
<link rel="icon" href="icon.png">
<link rel="stylesheet" href="fonts/fonts.css">
<style>{rd('src/style.css')}</style>
</head>
<body>
{rd('src/body.html')}
{''.join(f'<script src="vendor/{v}"></script>' + chr(10) for v in VENDOR)}<script>
(() => {{
{js}
}})();
</script>
</body>
</html>
'''
open(os.path.join(H, 'app/index.html'), 'w', encoding='utf-8').write(html)
print('app/index.html', len(html) // 1024, 'kB')
