#!/usr/bin/env python3
"""Assemble app/index.html from src/ (offline: three.js and fonts are vendored in app/)."""
import json, os
H = os.path.dirname(os.path.abspath(__file__))
rd = lambda p: open(os.path.join(H, p), encoding='utf-8').read()
MODULES = ['00-i18n', '01-core', '02-poses', '03-figure', '03b-muscles', '04-scene', '05-app', '05b-guides', '05c-ui', '05d-library', '05e-input', '05f-render', '05g-boot', '05h-spaces', '06-tools', '08-ropa', '09-ropa-ui', '10-anthro', '10b-bodies', '10c-coat', '11-heads', '12-sets', '13-envs', '14-tour', '15-avatars', '16-practice', '17-hair', '18-anatomy', '19-posing', '19b-dynamics', '20-scene', '20b-limbs', '20c-characters', '20d-access', '21-export', '21b-layers', '21c-video', '21d-keys', '22-anim', '22b-motion', '22c-timeline', '22d-film-panel', '23-photo', '24-perf', '25-share', '26-clips', '26b-gait', '27-board', '28-ux', '29-web', '30-refs', '31-script-lex', '31-script-look', '31-script', '32-voice', '33-paper', '34-file', '34b-backups', '35-project', '35b-bible', '36-comic', '36d-comic-shapes', '36e-comic-desk', '36f-comic-tracker', '36b-comic-ui', '36c-comic-export', '37-support', '07-start']
I18D = os.path.join(H, 'src', 'i18n')
I18N = {f[:-5]: json.load(open(os.path.join(I18D, f), encoding='utf-8')) for f in sorted(os.listdir(I18D)) if f.endswith('.json') and f != 'es.json'}
GD = os.path.join(I18D, 'garments')
GTR = {f[:-5]: json.load(open(os.path.join(GD, f), encoding='utf-8')) for f in sorted(os.listdir(GD)) if f.endswith('.json') and f != 'en.json'} if os.path.isdir(GD) else {}
VERSION = json.load(open(os.path.join(H, 'package.json')))['version']
# each language is a script of its own (app/i18n/<lang>.js): the page loads English and the chosen one only
os.makedirs(os.path.join(H, 'app/i18n'), exist_ok=True)
for f in os.listdir(os.path.join(H, 'app/i18n')):
    if f.endswith('.js'): os.remove(os.path.join(H, 'app/i18n', f))
for l in I18N:
    open(os.path.join(H, f'app/i18n/{l}.js'), 'w', encoding='utf-8').write('(window.NEOPOSE_I18N = window.NEOPOSE_I18N || {})[' + json.dumps(l) + '] = ' + json.dumps(I18N[l], ensure_ascii=False, separators=(',', ':'))
        + ';\n(window.NEOPOSE_GTR = window.NEOPOSE_GTR || {})[' + json.dumps(l) + '] = ' + json.dumps(GTR.get(l, {}), ensure_ascii=False, separators=(',', ':')) + ';\n')
import hashlib
fhash = p => hashlib.sha1(open(os.path.join(H, p), 'rb').read()).hexdigest()[:10]
LOADER = ('<script>(function () { var all = ' + json.dumps(sorted(I18N)) + ', l = null; try { l = JSON.parse(localStorage.getItem("cdp.lang")); } catch (e) {}\n'
  + '  var h = ' + json.dumps({l: fhash(f'app/i18n/{l}.js') for l in I18N}) + ';\n'
  + '  ["en"].concat(l && l !== "en" && all.indexOf(l) >= 0 ? [l] : []).forEach(function (c) { document.write(\'<script src="i18n/\' + c + \'.js?h=\' + h[c] + \'"><\\/script>\'); });\n})();</script>\n')
js = ('const APP_VERSION = ' + json.dumps(VERSION) + ';\nconst I18N_LANGS = ' + json.dumps(sorted(I18N)) + ';\nconst I18N = window.NEOPOSE_I18N || {en: {}};\nconst I18N_EN = I18N.en || {};\nconst GARMENT_TR = window.NEOPOSE_GTR || {};\n'
      + 'const ENV_MANIFEST = ' + rd('app/envs/manifest.json') + ';\n'
      + 'const HEAD_CATALOG = ' + json.dumps(json.load(open(os.path.join(H, 'app/heads/catalog.json'), encoding='utf-8')), ensure_ascii=False) + ';\n'
      + '\n'.join(rd(f'src/{m}.js') for m in MODULES))
VENDOR = ['three.min.js', 'OrbitControls.js', 'TransformControls.js', 'GLTFLoader.js', 'meshopt_decoder.js', 'fflate.min.js', 'gifenc.min.js']
# (loaded when an FBX is imported: see loadFBX)
LAZY = ['NURBSUtils.js', 'NURBSCurve.js', 'FBXLoader.js']
html = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>NEOPOSE</title>
<meta name="description" content="3D mannequin for artists: pose, dress, light and animate characters as drawing references. Free software.">
<link rel="icon" href="icon.png">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<meta name="theme-color" content="#e4ddcb" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#171614" media="(prefers-color-scheme: dark)">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="NEOPOSE">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="stylesheet" href="fonts/fonts.css">
<style>{rd('src/style.css')}</style>
</head>
<body>
{rd('src/body.html')}
{LOADER}{''.join(f'<script src="vendor/{v}"></script>' + chr(10) for v in VENDOR)}<script>
(() => {{
{js}
}})();
</script>
</body>
</html>
'''
open(os.path.join(H, 'app/index.html'), 'w', encoding='utf-8').write(html)

# the installable web app (GitHub Pages): manifest, service worker and the list of files for offline use
import hashlib
VERSION = json.load(open(os.path.join(H, 'package.json')))['version']
BUILD = hashlib.sha1(html.encode('utf-8')).hexdigest()[:10]
manifest = {'id': './', 'name': 'NEOPOSE', 'short_name': 'NEOPOSE', 'description': '3D mannequin for artists: pose, dress, light and animate characters as drawing references.',
  'start_url': './', 'scope': './', 'display': 'standalone', 'orientation': 'any', 'background_color': '#e4ddcb', 'theme_color': '#e4ddcb', 'lang': 'en', 'categories': ['graphics', 'design', 'education'],
  'icons': [{'src': 'icons/icon-192.png', 'sizes': '192x192', 'type': 'image/png', 'purpose': 'any'}, {'src': 'icons/icon-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'any'},
            {'src': 'icons/maskable-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'maskable'}]}
open(os.path.join(H, 'app/manifest.webmanifest'), 'w', encoding='utf-8').write(json.dumps(manifest, ensure_ascii=False, indent=1))
APPD = os.path.join(H, 'app')
files = sorted(os.path.relpath(os.path.join(d, f), APPD).replace(os.sep, '/') for d, _, fs in os.walk(APPD) for f in fs
               if not f.startswith('.') and f not in ('sw.js', 'offline.json') and not f.endswith(('.txt.map', '.md')))
HASHES = {f: fhash(os.path.join('app', f)) for f in files if f != 'index.html'}
open(os.path.join(APPD, 'offline.json'), 'w').write(json.dumps({'version': VERSION, 'files': [[f, os.path.getsize(os.path.join(APPD, f)), HASHES.get(f, '')] for f in files]}, separators=(',', ':')))
CORE = ['manifest.webmanifest', 'icon.png', 'icons/apple-touch-icon.png', 'icons/icon-192.png', 'fonts/fonts.css'] + [f'vendor/{v}' for v in VENDOR] + [f for f in files if f.startswith('fonts/') and f.endswith('.woff2')] + [f for f in files if f.startswith('i18n/')] + ['figure.txt', 'figure-ext.txt', 'figure-body.txt', 'skeleton.txt']
CORE = [c for c in dict.fromkeys(CORE) if c in HASHES]
sw = open(os.path.join(H, 'src/sw.js'), encoding='utf-8').read().replace('__VERSION__', VERSION).replace('__BUILD__', BUILD).replace('__CORE__', json.dumps(CORE)).replace('__HASHES__', json.dumps(HASHES, separators=(',', ':')))
open(os.path.join(APPD, 'sw.js'), 'w', encoding='utf-8').write(sw)
print('web app', VERSION, BUILD, len(files), 'files', sum(os.path.getsize(os.path.join(APPD, f)) for f in files) // 2**20, 'MB')
print('app/index.html', len(html) // 1024, 'kB')
