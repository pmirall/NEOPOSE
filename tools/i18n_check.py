# Checks a translation file against the English one: same keys only, every {placeholder}, HTML tag and <kbd> kept.
#   python3 tools/i18n_check.py fr
import json, os, re, sys
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'i18n')
en = json.load(open(os.path.join(D, 'en.json'), encoding='utf-8'))
l = sys.argv[1]; o = json.load(open(os.path.join(D, l + '.json'), encoding='utf-8'))
ph = lambda s: sorted(re.findall(r'\{\w+\}', s)); tags = lambda s: sorted(re.findall(r'</?[a-zA-Z]+', s))
bad = []
for k, v in o.items():
    if k not in en: bad.append(('unknown key', k)); continue
    if not isinstance(v, str) or not v.strip(): bad.append(('empty', k)); continue
    if ph(v) != ph(en[k]): bad.append(('placeholders', k, v))
    if tags(v) != tags(en[k]): bad.append(('html tags', k, v))
    if k.endswith(' ') != v.endswith(' ') or k.startswith(' ') != v.startswith(' '): bad.append(('edge spaces', k, v))
missing = [k for k in en if k not in o]
for b in bad[:40]: print(*b, sep=' | ')
print(f'{l}: {len(o)} translated, {len(missing)} missing, {len(bad)} problems')
sys.exit(1 if bad else 0)
