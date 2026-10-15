# Translations: src/i18n/<lang>.json, one flat JSON object per language; the key is the Spanish source text (as in
# gettext). es.json is the base file for Weblate (key -> itself, without an "@context" suffix); this keeps it and every
# other language in step with en.json, which is where new strings are added.
#   python3 tools/i18n_sync.py          (also reports how much of each language is translated)
import json, os, re
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'i18n')
load = lambda l: json.load(open(os.path.join(D, l + '.json'), encoding='utf-8'))
save = lambda l, o: json.dump(dict(sorted(o.items())), open(os.path.join(D, l + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
en = load('en'); keys = sorted(en)
save('es', {k: re.sub(r'@[\w-]+$', '', k) for k in keys})
for f in sorted(os.listdir(D)):
    l = f[:-5]
    if not f.endswith('.json') or l in ('en', 'es'): continue
    o = load(l); kept = {k: v for k, v in o.items() if k in en and v}
    save(l, kept); print(f'{l}: {len(kept)}/{len(keys)} ({100 * len(kept) // len(keys)} %)')
print('en:', len(keys), 'strings')
