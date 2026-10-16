# Paper textures for the UI: seamless tiles, drawn the way paper is made rather than lit like a wall.
# Under a lamp a sheet of paper shows three things, none of them bumps:
#   - fibres: thin, slightly curved strands, a few darker and a few lighter than the sheet, lying every way;
#   - formation: the soft clouds where the pulp settled thicker or thinner (a few millimetres across);
#   - a grain finer than a millimetre, which only reads when it sits on the screen's own pixels.
# A lit height field (what the first version did) gives round blobs with a shadow on one side: that is plaster.
# grain.webp is 512 texels shown at 256 CSS px (one texel per pixel on a phone, finer still on a desktop);
# clouds.webp is soft, so it can be stretched to a size that does not divide the grain's and the repeat hides.
# Light paper gets warm dark and white marks; dark card stock gets faint warm light and black ones.
#   python3 tools/paper/make_textures.py
import numpy as np, os
from PIL import Image, ImageDraw
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'app', 'textures')
rng = np.random.default_rng(11)
def spectral(n, beta, lo=0, hi=None):
    k = np.fft.fftfreq(n)[:, None], np.fft.fftfreq(n)[None, :]
    r = np.sqrt(k[0] ** 2 + k[1] ** 2); r[0, 0] = 1
    amp = r ** (-beta); amp[0, 0] = 0
    if lo: amp *= 1 - np.exp(-(r / lo) ** 2)
    if hi: amp *= np.exp(-(r / hi) ** 2)
    f = np.fft.ifft2(np.fft.fft2(rng.standard_normal((n, n))) * amp).real
    return (f - f.mean()) / f.std()
def fibres(n, count, ss=4):
    # strands drawn at 4x and shrunk (antialiased); each is drawn nine times, shifted by the tile, so it wraps
    dark, light = Image.new('L', (n * ss, n * ss)), Image.new('L', (n * ss, n * ss))
    dd, dl = ImageDraw.Draw(dark), ImageDraw.Draw(light)
    for _ in range(count):
        x, y, a = rng.random() * n, rng.random() * n, rng.random() * np.pi
        length, bend, w = rng.uniform(10, 46), rng.normal(0, .05), rng.choice([1, 1, 1, 2]) * rng.uniform(.5, .9)
        pts = []
        for _ in range(int(length / 2)):
            pts.append((x, y)); a += bend + rng.normal(0, .06); x += 2 * np.cos(a); y += 2 * np.sin(a)
        ink, d = int(rng.uniform(90, 255)), (dd if rng.random() < .62 else dl)
        for ox in (-n, 0, n):
            for oy in (-n, 0, n):
                d.line([((px + ox) * ss, (py + oy) * ss) for px, py in pts], fill=ink, width=max(1, round(w * ss)), joint='curve')
    shrink = lambda im: np.asarray(im.resize((n, n), Image.LANCZOS), float) / 255
    return shrink(dark), shrink(light)
def save(name, dark_rgb, light_rgb, dark_a, light_a):
    # one tile, two inks: each pixel is either a darker or a lighter mark, its strength in the alpha
    use_light = light_a > dark_a
    a = np.where(use_light, light_a, dark_a)
    rgb = np.where(use_light[..., None], np.array(light_rgb, float), np.array(dark_rgb, float))
    a = np.round(np.clip(a, 0, 1) * 255 / 4) * 4  # alpha in 64 steps: small lossless files, no colour fringes
    img = np.dstack([rgb, np.clip(a, 0, 255)]).astype(np.uint8)
    Image.fromarray(img, 'RGBA').save(os.path.join(OUT, name), 'WEBP', lossless=True, method=6)
    print(name, os.path.getsize(os.path.join(OUT, name)) // 1024, 'KB')

n = 512
grain = spectral(n, .3, hi=.45)                       # finer than a millimetre: next to white noise
fd, fl = fibres(n, 260)
g_dark, g_light = np.clip(grain, 0, None), np.clip(-grain, 0, None)
save('paper-grain.webp', (70, 54, 32), (255, 252, 244), g_dark * .038 + fd * .13, g_light * .045 + fl * .2)
save('paper-grain-dark.webp', (0, 0, 0), (255, 236, 205), g_dark * .09 + fd * .22, g_light * .03 + fl * .09)

n = 256
clouds = spectral(n, 1.6, lo=.006, hi=.09)            # formation: soft flocs, no edges
c_dark, c_light = np.clip(clouds, 0, None), np.clip(-clouds, 0, None)
save('paper-clouds.webp', (96, 74, 40), (255, 252, 244), c_dark * .035, c_light * .05)
save('paper-clouds-dark.webp', (0, 0, 0), (255, 236, 205), c_dark * .075, c_light * .018)
