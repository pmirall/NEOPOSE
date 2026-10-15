#!/usr/bin/env python3
"""Assemble app/index.html from src/ (offline: three.js and fonts are vendored in app/)."""
import json, os
H = os.path.dirname(os.path.abspath(__file__))
rd = lambda p: open(os.path.join(H, p), encoding='utf-8').read()
MODULES = ['01-core', '02-poses', '03-figure', '04-scene', '05-app', '06-tools', '08-ropa', '09-ropa-ui', '10-anthro', '11-heads', '12-sets', '13-envs', '14-tour', '07-start']
js = ('const ENV_MANIFEST = ' + rd('app/envs/manifest.json') + ';\n'
      + 'const HEAD_CATALOG = ' + json.dumps(json.load(open(os.path.join(H, 'app/heads/catalog.json'), encoding='utf-8')), ensure_ascii=False) + ';\n'
      + '\n'.join(rd(f'src/{m}.js') for m in MODULES))
VENDOR = ['three.min.js', 'OrbitControls.js', 'TransformControls.js', 'GLTFLoader.js', 'meshopt_decoder.js']
html = f'''<!doctype html>
<html lang="es">
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
