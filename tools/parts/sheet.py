import sys
from PIL import Image
d, fs = sys.argv[1], sys.argv[2].split(','); ims = [Image.open(f'{d}/{f}.png').convert('RGB') for f in fs]; W = ims[0].width
s = Image.new('RGB', (W * len(ims), W), 'white')
for i, im in enumerate(ims): s.paste(im, (i * W, 0))
s.save(f'{d}/sheet.png')
