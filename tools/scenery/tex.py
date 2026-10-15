import json, os, urllib.request, io, base64, concurrent.futures as cf
from PIL import Image
H = os.path.dirname(os.path.abspath(__file__)); OUT = H + '/build/assets/tex'; os.makedirs(OUT, exist_ok=True)
NAMES = """laminate_floor_02 herringbone_parquet wood_floor_worn dark_wooden_planks concrete_floor_02 garage_floor floor_tiles_06 checkered_pavement_tiles marble_tiles terrazzo_tiles terracotta_floor_tiles cobblestone_floor_01 asphalt_02 grass_path_2 leafy_grass sparse_grass forrest_ground_01 leaves_forest_ground coast_sand_01 sand_01 dirt_floor rocky_terrain dry_ground_01 painted_plaster_wall beige_wall_001 plastered_wall brick_wall_001 large_red_bricks castle_brick_01 medieval_blocks_02 concrete_wall_003 rough_concrete dark_planks weathered_planks hinoki_planks japanese_cedar_planks bamboo_wall corrugated_iron factory_wall decrepit_wallpaper rock_wall_02 white_planks_clean velour_velvet rough_linen clay_roof_tiles""".split()
def one(n):
    f = json.load(urllib.request.urlopen(urllib.request.Request('https://api.polyhaven.com/files/' + n, headers={'User-Agent': 'cp'})))
    u = f['Diffuse']['1k']['jpg']['url']
    img = Image.open(io.BytesIO(urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'cp'})).read())).convert('RGB').resize((512, 512), Image.LANCZOS)
    b = io.BytesIO(); img.save(b, 'WEBP', quality=78); open(f'{OUT}/{n}.txt', 'w').write(base64.b64encode(b.getvalue()).decode())
    img.resize((96, 96)).save(f'{H}/texprev_{n}.png'); return n, len(b.getvalue()) // 1024
with cf.ThreadPoolExecutor(8) as ex:
    for r in ex.map(lambda n: (lambda: one(n))() if True else None, NAMES): print(r)
