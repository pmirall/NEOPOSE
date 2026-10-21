# Render a sculpted part (npz from hand.py / foot.py) in Blender, headless: smooth shading, flat light material, Freestyle ink.
#   bvenv/bin/python render.py part.npz outdir [views] [px]
import sys, os, math, numpy as np, bpy
from mathutils import Vector

npz, out = sys.argv[1], sys.argv[2]
VIEWS = (sys.argv[3] if len(sys.argv) > 3 else 'back,palm,side,three').split(','); PX = int(sys.argv[4]) if len(sys.argv) > 4 else 640
os.makedirs(out, exist_ok=True)
D = np.load(npz)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

def mat(name, rgb, rough=.8):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = rough
    return m

def mesh(name, V, F, mats=None, mi=None):
    me = bpy.data.meshes.new(name); me.vertices.add(len(V)); me.vertices.foreach_set('co', V.astype(np.float32).ravel())
    me.loops.add(F.size); me.loops.foreach_set('vertex_index', F.astype(np.int32).ravel())
    me.polygons.add(len(F)); me.polygons.foreach_set('loop_start', np.arange(0, F.size, 3, dtype=np.int32)); me.polygons.foreach_set('loop_total', np.full(len(F), 3, np.int32))
    me.update(); me.validate()
    me.polygons.foreach_set('use_smooth', np.ones(len(F), bool))
    ob = bpy.data.objects.new(name, me); sc.collection.objects.link(ob)
    for m in mats or []: me.materials.append(m)
    if mi is not None: me.polygons.foreach_set('material_index', mi.astype(np.int32)); me.update()
    return ob

fur, leather, keratin = mat('fur', (.93, .91, .87)), mat('leather', (.12, .1, .1), .5), mat('keratin', (.2, .18, .17), .35)
V, F = D['V'], D['F']
kind = D['kind'] if 'kind' in D else np.zeros(len(V), np.int8)
mi = (kind[F].max(1) == 2).astype(np.int32)   # a face touching a pad vertex is leather
skin = mesh('skin', V, F, [fur, leather], mi)
if 'CV' in D and len(D['CV']): mesh('claws', D['CV'], D['CF'], [keratin])
if 'TV' in D and len(D['TV']): mesh('teeth', D['TV'], D['TF'], [mat('enamel', (.97, .96, .92), .3)])

# light: a soft key, a fill, and the world as soft grey
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (.85, .85, .85, 1); w.node_tree.nodes['Background'].inputs[1].default_value = .8
for nm, loc, e in [('key', (2, -3, 4), 3.5), ('fill', (-3, 2, 1), 1.2)]:
    ld = bpy.data.lights.new(nm, 'SUN'); ld.energy = e; lo = bpy.data.objects.new(nm, ld); sc.collection.objects.link(lo); lo.location = loc; lo.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()

sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 12; sc.cycles.use_denoising = False
sc.render.resolution_x = sc.render.resolution_y = PX; sc.render.film_transparent = False
sc.view_settings.view_transform = 'Standard'
sc.render.use_freestyle = True; sc.render.line_thickness_mode = 'ABSOLUTE'; sc.render.line_thickness = 1.6
vl = sc.view_layers[0]; fs = vl.freestyle_settings; ls = fs.linesets[0] if fs.linesets else fs.linesets.new('ink')
ls.select_by_visibility = True; ls.select_silhouette = True; ls.select_border = True; ls.select_crease = True; ls.select_contour = True; ls.select_material_boundary = True
fs.crease_angle = math.radians(140)
if ls.linestyle is None: ls.linestyle = bpy.data.linestyles.new('ink')
ls.linestyle.color = (.08, .07, .06); ls.linestyle.thickness = 1.8

cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam; cam.data.lens = 70
c = Vector(V.mean(0)); ext = float(np.ptp(V, 0).max())
DIRS = {'back': (0, -.15, 1), 'palm': (0, -.15, -1), 'side': (1, 0, .05), 'inner': (-1, 0, .05), 'three': (.7, -.35, .7), 'front': (0, 1, .25), 'under': (0, -.3, -1), 'top': (0, .2, 1), 'fthree': (.6, .8, .55), 'fside': (1, .1, .15), 'fback': (0, -1, .35)}
for v in VIEWS:
    d = Vector(DIRS[v]).normalized(); cam.location = c + d * ext * 2.4
    # look at the part with its +y (toward the finger tips / toes) up in the picture, or +z when looking along y
    if os.environ.get('UP') == 'z': upv = Vector((0, 1, 0)) if abs(d.z) > .9 else Vector((0, 0, 1))
    else: upv = Vector((0, 0, 1)) if abs(d.y) > .9 else Vector((0, 1, 0))
    f = (c - cam.location).normalized(); r = f.cross(upv).normalized(); u = r.cross(f)
    from mathutils import Matrix
    cam.rotation_euler = Matrix((r, u, -f)).transposed().to_euler()
    sc.render.filepath = os.path.join(out, f'{v}.png'); bpy.ops.render.render(write_still=True)
print('rendered', VIEWS)
