# Smaller garment files: the same data, packed so gzip compresses it better (about a quarter less).
#   - barycentric weights as int16 (1/16384) when every weight is within ±2 (header "wq"); some MakeHuman fittings
#     use large cancelling weights, those keep float32
#   - every multi-byte array stored as byte planes (all low bytes, then all high bytes…), header "pl": 1
# The app reads both layouts. python3 repack_ropa.py [app/ropa]  (files already packed are left alone)
import os, sys, base64, gzip, json, struct
import numpy as np

def planes(b, k):
    return np.frombuffer(b, np.uint8).reshape(-1, k).T.tobytes() if k > 1 and len(b) else b

def pack(raw):
    hl = struct.unpack('<I', raw[:4])[0]; h = json.loads(raw[4:4 + hl])
    if h.get('pl'): return None
    b0 = 4 + hl; o = h['offs']; n = h['n']; nt = h['nt']; big = h['big']; tl = h.get('texLen', 0)
    blob = raw[b0:]
    get = (lambda i, size: blob[o[i]:o[i] + size])
    w = np.frombuffer(get(1, n * 12), np.float32)
    wq = 16384 if len(w) and np.abs(w).max() < 1.99 else 0
    wb = np.clip(np.round(w * wq), -32767, 32767).astype(np.int16).tobytes() if wq else w.tobytes()
    arrs = [planes(get(0, n * 6), 2), planes(wb, 2 if wq else 4), planes(get(2, n * 6), 2), planes(get(3, n * 4), 2), get(4, n * 4), get(5, n * 4),
            planes(get(6, n * 2), 2), planes(get(7, nt * 3 * (4 if big else 2)), 4 if big else 2), get(8, tl)]
    offs = []; out = b''
    for a in arrs: offs.append(len(out)); out += a + b'\0' * ((4 - len(a) % 4) % 4)
    h = dict(h, offs=offs, pl=1, wq=wq)
    hj = json.dumps(h).encode(); hj += b' ' * ((4 - len(hj) % 4) % 4)
    return struct.pack('<I', len(hj)) + hj + out

def repack_file(path):
    raw = gzip.decompress(base64.b64decode(open(path).read()))
    p = pack(raw)
    if p is None: return False
    open(path, 'w').write(base64.b64encode(gzip.compress(p, 9)).decode()); return True

if __name__ == '__main__':
    d = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'app', 'ropa')
    before = sum(os.path.getsize(os.path.join(d, f)) for f in os.listdir(d) if f.endswith('.txt'))
    n = sum(repack_file(os.path.join(d, f)) for f in sorted(os.listdir(d)) if f.endswith('.txt') and f != 'catalog.json')
    after = sum(os.path.getsize(os.path.join(d, f)) for f in os.listdir(d) if f.endswith('.txt'))
    print(f'{n} files repacked, {before / 1e6:.1f} MB -> {after / 1e6:.1f} MB')
