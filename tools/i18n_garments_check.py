# Checks a garment-title translation file: same keys as garments/en.json, nothing empty.
import json, os, sys
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'i18n', 'garments')
en = json.load(open(os.path.join(D, 'en.json'), encoding='utf-8')); l = sys.argv[1]; o = json.load(open(os.path.join(D, l + '.json'), encoding='utf-8'))
bad = [k for k in o if k not in en] + [k for k, v in o.items() if not isinstance(v, str) or not v.strip()]
missing = [k for k in en if k not in o]
print(f'{l}: {len(o)} translated, {len(missing)} missing, {len(bad)} problems'); sys.exit(1 if bad or missing else 0)
