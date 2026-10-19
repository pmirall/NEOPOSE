// dark window glass that lights up at night (follows the practical-light level like EM.glass)
const WIN_MAT = patchEnv(new THREE.MeshStandardMaterial({color: 0x4c5560, roughness: .25, metalness: .2, emissive: 0xffd9a0, emissiveIntensity: 0})); WIN_MAT.userData.night = true; EMISSIVE.push(WIN_MAT);
const PUDDLE_MAT = patchEnv(new THREE.MeshStandardMaterial({color: 0x2c3036, roughness: .06, metalness: .5}));
/* ---------- the sets: each lists its models; build() runs once they are loaded ---------- */
// group: 'in' interior, 'out' exterior, 'x' other; amb: default time of day; out: has sky
const SCENES = {
  estudio: {label: 'Estudio de foto', group: 'x', amb: 'neutro', assets: ['wooden_crate_01', 'plastic_crate_01', 'metal_stool_01', 'Camera_01', 'cardboard_box_01'],
    build(e) {
      tplane(e, T('concrete_floor_02', 0xdcd6cb), 60, 60, 0, 0, 0, 3);
      // paper sweep (cyclorama) behind the cast
      const R = 1.4, W = 9, Hc = 4.6, zb = -3.6, prof = [];
      for (let i = 0; i <= 12; i++) { const a = i / 12 * Math.PI / 2; prof.push([zb + R - Math.sin(a) * R, R - Math.cos(a) * R]); }
      const pts = [[2.2, 0], ...prof.map(([z, y]) => [z, y]), [zb, Hc]];
      const g = new THREE.BufferGeometry(), pos = [], idx = [], uvs = [];
      pts.forEach(([z, y], i) => { for (const sx of [-1, 1]) { pos.push(sx * W / 2, y + .002, z); uvs.push(sx < 0 ? 0 : 1, i / pts.length); } if (i) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } });
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(idx); g.computeVertexNormals();
      const sw = new THREE.Mesh(g, patchEnv(new THREE.MeshStandardMaterial({color: 0xf0ece4, roughness: 1, side: THREE.DoubleSide}))); sw.receiveShadow = true; sw.userData.noOutline = true; sw.userData.noOcclude = true; e.add(sw);
      cyl(e, EM.black, .05, W + .6, 0, Hc + .05, zb, 12).rotation.z = Math.PI / 2;
      // light stands: key softbox, fill umbrella, hair light
      const stand = (x, z, h, ry, head) => place(e, p => {
        for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; const l = mk(G.cyl(6), EM.black, Math.sin(a) * .22, .3, Math.cos(a) * .22, .015, .7, .015, 0, Math.cos(a) * .6, -Math.sin(a) * .6); p.add(l); }
        cyl(p, EM.black, .022, h, 0, .55, 0, 8); head(p, h + .55);
      }, x, 0, z, ry);
      const soft = (p, y) => { const b = box(p, EM.black, .9, .65, .45, 0, y - .3, 0); const f = box(p, EM.white, .86, .6, .02, 0, y - .28, .23); f.castShadow = b.castShadow = false; };
      stand(-2.4, 1.7, 1.9, -.95, soft); stand(2.7, 1.3, 1.6, .9, soft);
      stand(1.2, -2.4, 2.4, 2.7, (p, y) => { const c = cyl(p, EM.black, .14, .3, 0, y - .1, 0, 16, .1); c.rotation.x = 1.2; c.castShadow = false; });
      L(e, -2.25, 2.25, 1.6, {to: [0, 1.1, 0], ang: 40, pen: 1, i: 1.6, d: 14, c: 0xfff3e2, sh: true, studio: true});
      L(e, 2.55, 1.95, 1.2, {to: [0, 1, 0], ang: 45, pen: 1, i: .55, d: 12, c: 0xf2f5ff, studio: true});
      L(e, 1.1, 2.9, -2.3, {to: [0, 1.4, 0], ang: 30, pen: .8, i: 1, d: 10, c: 0xffffff, sh: true, studio: true});
      A(e, 'wooden_crate_01', -1.9, -1.9, .4); A(e, 'plastic_crate_01', -1.45, -2.2, -.2); A(e, 'metal_stool_01', 1.7, -1.2, .3);
      A(e, 'cardboard_box_01', 3.4, -2.4, .7); A(e, 'cardboard_box_01', 3.1, -2.9, .2, {y: 0});
      const t = A(e, 'wooden_crate_01', 3.8, .2, 1.2); A(e, 'Camera_01', 3.8, .2, -1, {y: topOf(t, 3.8, .2), node: 'Camera_01'});
    }},
  habitacion: {label: 'Salón', group: 'in', amb: 'interior', assets: ['Sofa_01', 'ArmChair_01', 'CoffeeTable_01', 'wooden_bookshelf_worn', 'book_encyclopedia_set_01', 'Television_01', 'WoodenTable_03', 'potted_plant_02', 'hanging_picture_frame_02', 'fancy_picture_frame_01', 'throw_pillows_01', 'modern_ceiling_lamp_01', 'side_table_01', 'wall_clock', 'ceramic_vase_02', 'Ottoman_01', 'tea_set_01'],
    build(e) {
      const r = room(e, {w: 8, d: 7, h: 2.9, floor: 'herringbone_parquet', ft: 1.6, wall: 'painted_plaster_wall', wt: 2.5, window: [-.4, 2, .85, 1.45]});
      rug(e, T('rough_linen', 0xb59a84), 3.2, 2.2, 0, -1.7);
      const sofa = A(e, 'Sofa_01', 0, r.back + .45, 0, {s: 1.25});
      A(e, 'throw_pillows_01', -.55, r.back + .55, .2, {y: .48, s: .8, node: 'throw_pillows_01_pillow01'}); A(e, 'throw_pillows_01', .6, r.back + .55, -.3, {y: .48, s: .8, node: 'throw_pillows_01_pillow02'});
      const ct = A(e, 'CoffeeTable_01', 0, -1.55, Math.PI / 2, {s: .8});
      A(e, 'tea_set_01', .1, -1.55, .3, {y: topOf(ct, 0, -1.55), node: ['tea_set_01_teapot_01', 'tea_set_01_teapot_01_lid']});
      A(e, 'tea_set_01', -.2, -1.45, 0, {y: topOf(ct, 0, -1.55), node: ['tea_set_01_cup_small_01', 'tea_set_01_saucer_circular_03']});
      A(e, 'ArmChair_01', -2.5, -1.4, 1.0); A(e, 'Ottoman_01', -1.6, -.3, .4, {s: .7});
      const st = A(e, 'side_table_01', 1.35, r.back + .35, 0); A(e, 'ceramic_vase_02', 1.35, r.back + .35, 0, {y: topOf(st, 1.35, r.back + .35)});
      const sh = A(e, 'wooden_bookshelf_worn', 3.0, r.back + .32, 0);
      fillShelf(e, sh, 3.0, r.back + .32, 0, 1.22, .22, 4);
      const cab = A(e, 'WoodenTable_03', 3.6, -.6, -Math.PI / 2); A(e, 'Television_01', 3.6, -.6, -Math.PI / 2, {y: topOf(cab, 3.6, -.6)});
      A(e, 'potted_plant_02', -3.4, r.back + .4, 0, {s: 1.3});
      A(e, 'hanging_picture_frame_02', 0, r.back + .02, 0, {y: 1.5, s: 1.2}); A(e, 'fancy_picture_frame_01', 3.95, -2.4, -Math.PI / 2, {y: 1.4});
      A(e, 'wall_clock', -2.0, r.back + .03, 0, {y: 2.0, node: /wall_clock/});
      pendant(e, 'modern_ceiling_lamp_01', 0, -1.5, 2.9, {i: 1.1, sh: true, bulb: .05});
      // floor lamp beside the armchair
      place(e, p => { cyl(p, EM.black, .16, .03, 0, 0, 0, 20); cyl(p, EM.black, .015, 1.5, 0, 0, 0, 8); const s = cyl(p, EM.lamp, .22, .32, 0, 1.42, 0, 24, .15); s.castShadow = false; }, -3.3, 0, -2.2);
      L(e, -3.3, 1.5, -2.2, {i: .8, d: 6, c: 0xffc98a});
    }},
  calle: {label: 'Calle', group: 'out', amb: 'dia', out: true, assets: ['street_lamp_01', 'fire_hydrant', 'metal_trash_can', 'utility_box_01', 'korean_public_payphone_01', 'painted_wooden_bench', 'water_manhole_cover', 'exterior_aircon_unit', 'tree_small_02', 'WetFloorSign_01', 'trashbag', 'power_box_01'],
    build(e) {
      tplane(e, T('asphalt_02'), 14, 140, 0, 0, 0, 4);
      for (const sx of [-1, 1]) { tbox(e, T('checkered_pavement_tiles', 0xd8d2c8), 5, .15, 140, sx * 9.5, 0, 0, 1.2).userData.noOutline = true; box(e, EM.stone, .25, .16, 140, sx * 7.1, 0, 0).userData.noOutline = true; }
      for (let i = -7; i <= 7; i++) { const s = box(e, EM.white, .15, .005, 2.2, 0, .002, i * 5); s.castShadow = false; s.userData.noOutline = true; }
      for (let i = 0; i < 7; i++) { const s = box(e, EM.white, .45, .005, 3.2, -3 + i * 1, .002, 4.5); s.castShadow = false; s.userData.noOutline = true; }
      // facades: brick and plaster blocks with windows from the CC0 facade kit
      const r = rng(9), mats = [T('brick_wall_001'), T('large_red_bricks'), T('plastered_wall', 0xe2d7c4), T('beige_wall_001')];
      for (const sx of [-1, 1]) for (let i = -5; i <= 4; i++) {
        const w = 9 + r() * 3, h = 9 + Math.floor(r() * 4) * 3.2, x = sx * (12 + 4), z = i * 12.5 + r() * 1.5;
        const b = tbox(e, mats[Math.floor(r() * mats.length)], 8, h, w, x, 0, z, 3); b.userData.noOutline = true; b.castShadow = Math.abs(i) < 2;
        // windows: dark glass with frames, lit at night
        const rows = Math.floor((h - 3.2) / 3.2), cols = Math.floor(w / 2.4);
        const inst = new THREE.InstancedMesh(G.box(), WIN_MAT, rows * cols * 2), m4 = new THREE.Matrix4(), s4 = new THREE.Matrix4();
        let k = 0;
        for (let rr = 0; rr < rows; rr++) for (let c = 0; c < cols; c++) {
          const wz = z - w / 2 + 1.2 + c * 2.4 + (w - cols * 2.4) / 2, wy = 4.2 + rr * 3.2, wx = x - sx * 4.01;
          m4.makeScale(.06, 1.7, 1.1); m4.setPosition(wx, wy, wz); inst.setMatrixAt(k++, m4);
          s4.makeScale(.18, .08, 1.3); s4.setPosition(wx - sx * .05, wy - .9, wz); inst.setMatrixAt(k++, s4);
        }
        inst.count = k; inst.userData.noOutline = true; e.add(inst);
        // shop front on the ground floor
        const sf = box(e, WIN_MAT, .05, 2.2, w * .55, x - sx * 4.02, .4, z); sf.castShadow = false; sf.userData.noOutline = true;
        box(e, i & 1 ? EM.red : EM.fabric2, .5, .12, w * .6, x - sx * 4.2, 2.75, z).castShadow = false;
      }
      for (const z of [-14, -2, 10]) for (const sx of [-1, 1]) {
        const zz = z + sx * 6; A(e, 'street_lamp_01', sx * 7.6, zz, sx > 0 ? Math.PI : 0, {y: .15, h: 4.2});
        L(e, sx * 7.6, 4.0, zz, {to: [sx * 6.6, 0, zz], ang: 55, pen: .8, i: 1.4, d: 13, c: 0xffc477, sh: Math.abs(z + 2) < 1, bulb: .09});
      }
      A(e, 'fire_hydrant', 7.6, 2.6, -.4, {y: .15, node: /^fire_hydrant(_cap_0\d|_chain)?$/});
      A(e, 'metal_trash_can', -7.7, -4.5, .3, {y: .15, node: /^metal_trash_can(_lid|_handle_left|_handle_right)?$/});
      A(e, 'trashbag', -7.4, -5.2, 1, {y: .15}); A(e, 'trashbag', -7.9, -5.5, 2.4, {y: .15, s: .9});
      A(e, 'utility_box_01', 8.0, -6.5, -Math.PI / 2, {y: .15}); A(e, 'power_box_01', 11.85, 4.5, -Math.PI / 2, {y: 1.3});
      A(e, 'korean_public_payphone_01', -8.1, 1.4, Math.PI / 2, {y: 1.1});
      A(e, 'painted_wooden_bench', -8.8, -1.6, Math.PI / 2, {y: .15});
      A(e, 'water_manhole_cover', 2.2, -3.5, .3, {y: -.03});
      A(e, 'WetFloorSign_01', 8.4, -.6, 1.1, {y: .15});
      A(e, 'exterior_aircon_unit', -11.85, -9, Math.PI / 2, {y: 3.4, node: 'exterior_aircon_unit'}); A(e, 'exterior_aircon_unit', 11.85, -3, -Math.PI / 2, {y: 6.6, node: 'exterior_aircon_unit_rusted'});
      for (const [x, z] of [[-9.4, 6], [9.4, -11], [-9.4, -16]]) { A(e, 'tree_small_02', x, z, x, {y: .15, h: 5.2}); box(e, EM.dark, 1.1, .02, 1.1, x, .15, z).castShadow = false; }
    }},
  bosque: {label: 'Bosque', group: 'out', amb: 'dia', out: true, assets: ['pine_tree_01', 'island_tree_02', 'tree_small_02', 'dead_tree_trunk', 'tree_stump_01', 'tree_stump_02', 'rock_moss_set_01', 'rock_moss_set_02', 'boulder_01', 'fern_02', 'shrub_03', 'root_cluster_01', 'dry_branches_medium_01'],
    build(e) {
      tplane(e, T('forrest_ground_01'), 220, 220, 0, 0, 0, 3);
      tplane(e, T('leaves_forest_ground'), 9, 9, 0, .004, -.5, 2.5);
      const pines = ['pine_tree_01_a_LOD0', 'pine_tree_01_b_LOD0', 'pine_tree_01_c_LOD0'];
      scatter(14, 3, 5, 26, (x, z, r, i) => A(e, 'pine_tree_01', x, z, r * 6, {node: pines[i % 3], h: 11 + r * 7}), -4);
      scatter(6, 8, 4, 14, (x, z, r, i) => A(e, i & 1 ? 'island_tree_02' : 'tree_small_02', x, z, r * 6, {h: 4 + r * 2}), -3);
      // far ring of simple pines for depth
      scatter(60, 5, 28, 70, (x, z, r) => place(e, FURN.pino, x, 0, z, r * 6, 2.2 + r * 2));
      A(e, 'dead_tree_trunk', -2.2, 1.4, .5); A(e, 'tree_stump_01', 2.4, -1.6, 1); A(e, 'tree_stump_02', -3.2, -3.1, 2.2);
      const rocks1 = SETS.rock_moss_set_01.children.map(c => c.name), rocks2 = SETS.rock_moss_set_02.children.map(c => c.name);
      scatter(10, 11, 2.4, 12, (x, z, r, i) => A(e, i & 1 ? 'rock_moss_set_01' : 'rock_moss_set_02', x, z, r * 6, {node: (i & 1 ? rocks1 : rocks2)[i % 6], s: .7 + r * .8}));
      A(e, 'boulder_01', 3.8, -3.4, .8, {s: 1.2});
      scatter(18, 14, 1.8, 9, (x, z, r, i) => A(e, 'fern_02', x, z, r * 6, {node: 'fern_02_' + 'abcd'[i % 4], s: .6 + r * .5}));
      scatter(10, 16, 2.5, 10, (x, z, r, i) => A(e, 'shrub_03', x, z, r * 6, {node: 'shrub_03_' + 'abcd'[i % 4], s: 1 + r}));
      A(e, 'root_cluster_01', 4.6, 1.2, 2, {s: .6}); A(e, 'dry_branches_medium_01', 1.6, 2.2, .4);
    }}
};

Object.assign(SCENES, {
  dormitorio: {label: 'Dormitorio', group: 'in', amb: 'interior', assets: ['GothicBed_01', 'ClassicNightstand_01', 'painted_wooden_nightstand', 'drawer_cabinet', 'modern_wooden_cabinet', 'ornate_mirror_01', 'vintage_suitcase', 'alarm_clock_01', 'Chandelier_02', 'fancy_picture_frame_01', 'potted_plant_04', 'throw_pillows_01', 'Rockingchair_01'],
    build(e) {
      const r = room(e, {w: 7.5, d: 6.5, h: 2.8, floor: 'laminate_floor_02', ft: 1.6, wall: 'beige_wall_001', wt: 2.4, window: [-.2, 1.6, .9, 1.4]});
      rug(e, T('rough_linen', 0xa7b2b5), 2.6, 1.8, -.2, -1.2);
      A(e, 'GothicBed_01', -1.4, r.back + 1.05, 0);
      const n1 = A(e, 'ClassicNightstand_01', -.25, r.back + .3, 0), n2 = A(e, 'painted_wooden_nightstand', -2.6, r.back + .3, 0);
      A(e, 'alarm_clock_01', -.35, r.back + .3, -.4, {y: topOf(n1, -.25, r.back + .3), node: /alarm_clock_01|hand/});
      A(e, 'potted_plant_04', -2.6, r.back + .3, 0, {y: topOf(n2, -2.6, r.back + .3)});
      // bedside lamp
      const ly = topOf(n1, -.25, r.back + .3);
      place(e, p => { cyl(p, EM.dark, .07, .03, 0, 0, 0, 16); cyl(p, EM.dark, .012, .3, 0, 0, 0, 8); const s = cyl(p, EM.lamp, .13, .18, 0, .26, 0, 20, .09); s.castShadow = false; }, -.15, ly, r.back + .25);
      L(e, -.15, ly + .36, r.back + .25, {i: .7, d: 5, c: 0xffc27a});
      A(e, 'drawer_cabinet', 2.9, r.back + .26, 0); A(e, 'modern_wooden_cabinet', 3.45, -.9, -Math.PI / 2);
      A(e, 'ornate_mirror_01', 3.68, -.9, -Math.PI / 2, {y: 1.15, s: 1.3});
      A(e, 'vintage_suitcase', 1.6, r.back + .3, .2, {node: /vintage_suitcase_01/, rx: -Math.PI / 2});
      A(e, 'fancy_picture_frame_01', -1.4, r.back + .02, 0, {y: 1.55, s: 1.3});
      A(e, 'Rockingchair_01', 2.4, .6, -2.2);
      pendant(e, 'Chandelier_02', 0, -1, 2.8, {i: 1, sh: true, ly: .25});
    }},
  cocina: {label: 'Cocina-comedor', group: 'in', amb: 'interior', assets: ['dining_table', 'dining_chair_02', 'Chandelier_01', 'electric_stove', 'vintage_microwave', 'WoodenTable_03', 'wooden_display_shelves_01', 'jug_01', 'bananas', 'food_apple_01', 'wooden_cutting_board', 'brass_pot_01', 'wooden_bowl_01', 'vintage_electric_kettle', 'wooden_stool_01', 'ceramic_vase_02', 'wall_clock', 'potted_plant_02'],
    build(e) {
      const r = room(e, {w: 8, d: 7, h: 2.8, floor: 'terracotta_floor_tiles', ft: 1.2, wall: 'plastered_wall', wtint: 0xf0e6d6, wt: 2.5, window: [-1, 1.8, 1, 1.2]});
      // kitchen counter along the back wall
      tbox(e, T('dark_planks', 0xc9b79c), 3.2, .86, .62, 1.9, 0, r.back + .31, 1.2);
      tbox(e, T('marble_tiles', 0xe8e2d6), 3.26, .04, .66, 1.9, .86, r.back + .33, .8);
      tbox(e, T('floor_tiles_06', 0xf1ede6), 3.2, .7, .02, 1.9, .9, r.back + .01, .6).castShadow = false;
      A(e, 'electric_stove', -.05, r.back + .35, 0);
      A(e, 'vintage_kettle' in SETS ? 'vintage_kettle' : 'vintage_electric_kettle', -.15, r.back + .3, .4, {y: .87});
      A(e, 'brass_pot_01', .1, r.back + .42, 0, {y: .87});
      A(e, 'wooden_cutting_board', 1.3, r.back + .33, .1, {y: .9}); A(e, 'bananas', 2.2, r.back + .3, .4, {y: .9, node: 'bananas_bunch'});
      A(e, 'vintage_microwave', 3.0, r.back + .3, 0, {y: .9, s: .55});
      A(e, 'wooden_display_shelves_01', 3.75, -1.6, -Math.PI / 2, {s: 1.1});
      // dining table in the middle of the room, behind the cast
      const t = A(e, 'dining_table', -.8, -1.4, 0, {s: .85}), ty = topOf(t, -.8, -1.4);
      for (const [x, z, ry] of [[-1.4, -2.1, 0], [-.2, -2.1, 0], [-1.4, -.7, Math.PI], [-.2, -.7, Math.PI]]) A(e, 'dining_chair_02', x, z, ry);
      A(e, 'jug_01', -.6, -1.5, 2, {y: ty}); A(e, 'wooden_bowl_01', -1.1, -1.4, 0, {y: ty});
      for (const [x, z] of [[-1.15, -1.36], [-1.05, -1.45], [-1.1, -1.3]]) A(e, 'food_apple_01', x, z, x * 9, {y: ty + .04});
      A(e, 'wooden_stool_01', 2.6, -1.8, .3); A(e, 'potted_plant_02', -3.4, r.back + .4, 0, {s: 1.2});
      A(e, 'wall_clock', 3.93, -2.6, -Math.PI / 2, {y: 1.9, node: /wall_clock/});
      pendant(e, 'Chandelier_01', -.8, -1.4, 2.8, {i: 1.3, sh: true, ly: .3});
      L(e, 1.9, 2.4, r.back + .4, {to: [1.9, .9, r.back + .4], ang: 70, i: .7, d: 5, c: 0xfff0d8});
    }},
  oficina: {label: 'Oficina', group: 'in', amb: 'interior', assets: ['metal_office_desk', 'mid_century_lounge_chair', 'modern_arm_chair_01', 'classic_laptop', 'desk_lamp_arm_01', 'steel_frame_shelves_02', 'binder_notebook', 'office_notepads', 'stationery_supplies', 'potted_plant_04', 'potted_plant_02', 'wall_clock', 'mounted_fluorescent_lights', 'projector_screen', 'cardboard_box_01', 'plastic_monobloc_chair_01'],
    build(e) {
      const r = room(e, {w: 9, d: 7.5, h: 3, floor: 'laminate_floor_02', ftint: 0xb8b2a8, ft: 1.4, wall: 'painted_plaster_wall', wtint: 0xe9eef0, wt: 2.6, window: [-.4, 3.4, .9, 1.6]});
      const desk = (x, z, ry) => {
        const d = A(e, 'metal_office_desk', x, z, ry), y = topOf(d, x, z);
        const f = new V3(0, 0, .3).applyAxisAngle(new V3(0, 1, 0), ry);
        A(e, 'mid_century_lounge_chair', x + f.x * 2.6, z + f.z * 2.6, ry + Math.PI, {s: .85});
        A(e, 'classic_laptop', x, z, ry, {y, node: ['classic_laptop', 'classic_laptop_screen'], s: .9});
        A(e, 'stationery_supplies', x + .55, z, ry, {y, node: 'stationery_supplies_pencilcup'});
        A(e, 'office_notepads', x - .45, z + .1, ry + .2, {y, node: 'office_notepads_a4_stack'});
        const lp = new V3(-.75, 0, -.2).applyAxisAngle(new V3(0, 1, 0), ry);
        A(e, 'desk_lamp_arm_01', x + lp.x, z + lp.z, ry + .6, {y});
        L(e, x + lp.x * .6, y + .55, z + lp.z * .6, {to: [x, y, z], ang: 40, pen: .8, i: .9, d: 3.5, c: 0xfff1da});
      };
      desk(-1.3, r.back + 1, 0); desk(2.3, r.back + 1, 0);
      for (const x of [3.6, 4.0]) A(e, 'steel_frame_shelves_02', x - .1, -.4 - (x - 3.6) * 2.3, -Math.PI / 2);
      A(e, 'cardboard_box_01', 3.9, .9, .3); A(e, 'cardboard_box_01', 3.85, .95, 1, {y: .34});
      A(e, 'binder_notebook', 3.5, -.6, -Math.PI / 2, {y: 1.05, node: 'binder_notebook_closed'});
      A(e, 'potted_plant_02', -4.0, r.back + .4, 0, {s: 1.4});
      A(e, 'modern_arm_chair_01', -3.3, -.8, 1.1); A(e, 'plastic_monobloc_chair_01', 3.2, 1.6, -2.4);
      A(e, 'wall_clock', 0.4, r.back + .03, 0, {y: 2.4, node: /wall_clock/});
      for (const [x, z] of [[-1.3, -1.4], [2.3, -1.4], [.5, .6]]) {
        A(e, 'mounted_fluorescent_lights', x, z, 0, {top: 3, node: 'mounted_fluorescent_lights_a', s: 1.6});
        L(e, x, 2.92, z, {to: [x, 0, z], ang: 75, pen: 1, i: .9, d: 7, c: 0xf4f8ff, sh: x > 2});
      }
    }},
  // a science lab: benches with black tops along the wall and in the middle, glassware with coloured liquids, racks of
  // test tubes, a microscope, screens, steel shelving and fluorescent light
  laboratorio: {label: 'Laboratorio', group: 'in', amb: 'interior', assets: ['Television_01', 'classic_laptop', 'steel_frame_shelves_02', 'cardboard_box_01', 'binder_notebook', 'metal_stool_01', 'mounted_fluorescent_lights', 'wall_clock', 'potted_plant_04', 'industrial_storage_cart', 'office_notepads'],
    build(e) {
      const r = room(e, {w: 9.5, d: 8, h: 3, floor: 'floor_tiles_06', ftint: 0xf4f6f6, ft: .7, wall: 'painted_plaster_wall', wtint: 0xf1f4f4, wt: 2.6, window: [-.6, 3.2, 1, 1.4]});
      const glass = M(0xd9e7ee, {r: .08, t: .35}), liq = [M(0x3f8fd0, {r: .3, t: .75}), M(0x5fbf6a, {r: .3, t: .75}), M(0xe0a43a, {r: .3, t: .75}), M(0xc85a8a, {r: .3, t: .75})];
      const cyl = (mat, rad, h, x, y, z) => { const m = mk(G.cyl(16), mat, x, y + h / 2, z, rad, h, rad); m.userData.noOutline = rad < .03; e.add(m); return m; };
      const bench = (x, z, w, ry = 0) => { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; e.add(g); box(g, EM.white, w, .86, .72, 0, 0, 0); box(g, EM.black, w + .04, .05, .76, 0, .86, 0); box(g, EM.metal, w - .1, .04, .02, 0, .5, .37); return g; };
      const glassware = (g, x, z, seed) => {
        const at = (dx, dz) => new V3(dx, 0, dz).applyAxisAngle(new V3(0, 1, 0), g.rotation.y).add(g.position);
        // round flasks: a bulb of liquid in a glass bulb, a neck
        for (let i = 0; i < 3; i++) { const p = at(x + i * .16, z + (i % 2) * .08), y = .91, b = mk(G.sph(), glass, p.x, y + .07, p.z, .07, .07, .07); e.add(b); const l = mk(G.sph(), liq[(i + seed) % 4], p.x, y + .055, p.z, .055, .045, .055); e.add(l); cyl(glass, .016, .12, p.x, y + .12, p.z); }
        // a rack of test tubes
        const q = at(x + .62, z), rack = box(e, EM.wood, .3, .05, .09, q.x, .95, q.z, g.rotation.y); rack.castShadow = false;
        for (let i = 0; i < 6; i++) { const t = at(x + .5 + i * .05, z), c = liq[(i + seed) % 4]; cyl(glass, .011, .15, t.x, .93, t.z); cyl(c, .009, .05 + (i % 3) * .02, t.x, .935, t.z); }
        // a beaker
        const k = at(x - .3, z + .05); cyl(glass, .05, .13, k.x, .91, k.z); cyl(liq[(seed + 1) % 4], .046, .06, k.x, .915, k.z);
      };
      const microscope = (x, z, ry) => {
        const g = new THREE.Group(); g.position.set(x, .91, z); g.rotation.y = ry; e.add(g);
        box(g, EM.black, .16, .03, .22, 0, 0, 0); box(g, EM.white, .05, .2, .05, 0, .03, -.08); box(g, EM.black, .12, .015, .1, 0, .1, .01);
        const t = mk(G.cyl(16), EM.white, 0, .3, -.02, .028, .2, .028); t.rotation.x = -.35; g.add(t); const o = mk(G.cyl(12), EM.black, 0, .42, -.06, .018, .07, .018); o.rotation.x = -.35; g.add(o);
      };
      // along the back wall, and an island the cast can stand round
      const b1 = bench(-.6, r.back + .42, 6.4), b2 = bench(.2, -.6, 2.6);
      glassware(b1, -2.6, .05, 0); glassware(b1, .6, .05, 2); glassware(b2, -1.1, -.1, 1);
      microscope(-.2 - .9, r.back + .45, .2); microscope(.9, -.62, -.3);
      A(e, 'Television_01', 2.15, r.back + .38, 0, {y: .91, s: .8}); A(e, 'classic_laptop', -1.9, r.back + .45, .1, {y: .91, node: ['classic_laptop', 'classic_laptop_screen'], s: .9});
      A(e, 'Television_01', 3.95, -1.6, -Math.PI / 2, {y: 1.05, s: .7}); box(e, EM.metal, .5, 1.05, .5, 3.95, 0, -1.6);
      A(e, 'office_notepads', 1, -.55, .3, {y: .91, node: 'office_notepads_a4_stack'});
      A(e, 'steel_frame_shelves_02', -4.25, -1.2, Math.PI / 2); A(e, 'cardboard_box_01', -4.3, -1.6, Math.PI / 2, {y: 1.2, s: .7}); A(e, 'binder_notebook', -4.3, -.9, Math.PI / 2, {y: .45, node: 'binder_notebook_closed'});
      A(e, 'industrial_storage_cart', 3.6, .9, -Math.PI / 2, {s: .9});
      for (const x of [-1.8, -.2, 1.6]) A(e, 'metal_stool_01', x, r.back + 1.15, 0);
      A(e, 'potted_plant_04', 4.3, r.back + .5, 0, {s: 1.8}); A(e, 'wall_clock', 1, r.back + .03, 0, {y: 2.4, node: /wall_clock/});
      for (const [x, z] of [[-2.2, -2.2], [1.8, -2.2], [-.2, .6]]) { A(e, 'mounted_fluorescent_lights', x, z, 0, {top: 3, node: 'mounted_fluorescent_lights_a', s: 1.6}); L(e, x, 2.92, z, {to: [x, 0, z], ang: 75, pen: 1, i: 1, d: 7, c: 0xf2f8ff, sh: x > 1}); }
    }},
  // a painter's studio: a window, an easel with a landscape on it, a little table with the palette and jars of brushes,
  // paintings on the walls and leaning against them
  atelier: {label: 'Estudio de pintura', group: 'in', amb: 'interior', assets: ['WoodenTable_02', 'wooden_stool_01', 'ArmChair_01', 'potted_plant_02', 'standing_picture_frame_01', 'hanging_picture_frame_02', 'fancy_picture_frame_01', 'jug_01', 'ceramic_vase_02', 'wooden_crate_01', 'desk_lamp_arm_01'],
    build(e) {
      const r = room(e, {w: 9, d: 7.5, h: 3.2, floor: 'weathered_planks', ftint: 0xcdb898, ft: 1.4, wall: 'plastered_wall', wtint: 0xf0e6d6, wt: 2.6, window: [-.5, 3.6, .7, 1.9]});
      // a happy little landscape, painted when the set is built: sky, snowy mountains, a lake and some trees
      const paint = (w, h, seed) => {
        const c = document.createElement('canvas'); c.width = 512; c.height = Math.round(512 * h / w); const x = c.getContext('2d'), H = c.height, rnd = (i => () => (i = (i * 16807) % 2147483647) / 2147483647)(seed * 7919 + 1);
        const sky = x.createLinearGradient(0, 0, 0, H * .6); sky.addColorStop(0, '#f4c98a'); sky.addColorStop(.5, '#b8d4e8'); sky.addColorStop(1, '#6f9cc4'); x.fillStyle = sky; x.fillRect(0, 0, 512, H);
        for (const [col, base, amp] of [['#5d6f8f', .58, .32], ['#3f5571', .66, .22]]) { x.fillStyle = col; x.beginPath(); x.moveTo(0, H); let px = 0; while (px <= 512) { x.lineTo(px, H * (base - amp * rnd())); px += 40 + rnd() * 60; } x.lineTo(512, H); x.fill(); }
        x.fillStyle = 'rgba(255,255,255,.85)'; for (let i = 0; i < 4; i++) { const cx = 60 + rnd() * 390, cy = H * (.28 + rnd() * .12); x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx - 26, cy + 22); x.lineTo(cx + 26, cy + 22); x.fill(); }
        x.fillStyle = '#3b6b4a'; x.fillRect(0, H * .68, 512, H * .32); x.fillStyle = '#5b8fb0'; x.fillRect(0, H * .76, 512, H * .1);
        for (let i = 0; i < 14; i++) { const tx = rnd() * 512, ty = H * (.68 + rnd() * .3), s = 18 + rnd() * 26; x.fillStyle = i % 3 ? '#1f4630' : '#2c5a3a'; x.beginPath(); x.moveTo(tx, ty - s * 2.2); x.lineTo(tx - s * .6, ty); x.lineTo(tx + s * .6, ty); x.fill(); }
        const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return patchEnv(new THREE.MeshStandardMaterial({map: t, roughness: .8}));
      };
      // the easel: three legs, a ledge, the canvas
      const easel = (x, z, ry) => {
        const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; e.add(g);
        for (const [lx, lz, rx, rz] of [[-.32, .1, -.1, .12], [.32, .1, -.1, -.12], [0, -.38, .38, 0]]) { const l = mk(G.box(), EM.wood, lx, .85, lz, .04, 1.75, .04); l.rotation.set(rx, 0, rz); g.add(l); }
        box(g, EM.wood, .8, .04, .09, 0, .82, .1); box(g, EM.wood, .06, .05, .06, 0, 1.6, .02);
        const cv = mk(G.box(), paint(.9, .66, 3), 0, 1.2, .11, .9, .66, .025); cv.rotation.x = -.1; g.add(cv);
        return g;
      };
      easel(-.4, -1.3, .35);
      const tb = A(e, 'WoodenTable_02', -1.7, -.6, .3, {h: .74}), ty = topOf(tb, -1.7, -.6) || .74;
      box(e, EM.wood, .32, .01, .22, -1.7, ty, -.6, .2);
      for (const [k, c] of [[0, 0xe9e2d2], [1, 0x2b5aa8], [2, 0xd9a521], [3, 0x2d6b3f], [4, 0x9a3b2a], [5, 0x1f1d1b]]) { const d = mk(G.sph(), M(c, {r: .4}), -1.82 + (k % 3) * .1, ty + .015, -.66 + Math.floor(k / 3) * .1, .025, .008, .025); e.add(d); }
      A(e, 'jug_01', -1.5, -.5, 0, {y: ty, s: .7}); A(e, 'ceramic_vase_02', -1.95, -.45, 0, {y: ty, s: .6});
      A(e, 'wooden_stool_01', .3, -.8, .4);
      // paintings: hung, and leaning against the walls
      const hang = (x, y, z, w, h, ry, seed) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; e.add(g); box(g, EM.dark, w + .08, h + .08, .04, 0, -h / 2 - .04, 0); const p = mk(G.box(), paint(w, h, seed), 0, 0, .025, w, h, .01); g.add(p); };
      hang(-1.6, 1.95, r.back + .05, 1.1, .75, 0, 5); hang(.8, 1.85, r.back + .05, .7, .9, 0, 9); hang(2.3, 2.05, r.back + .05, .9, .6, 0, 13);
      hang(4.42, 1.8, -.5, 1, .7, -Math.PI / 2, 17);
      for (const [x, z, ry, seed] of [[3.6, r.back + .35, -.2, 21], [3.9, r.back + .7, -.5, 23]]) { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.set(0, ry, 0); e.add(g); const p = mk(G.box(), paint(.8, .6, seed), 0, .32, 0, .8, .6, .03); p.rotation.x = -.15; g.add(p); }
      A(e, 'ArmChair_01', 2.8, .6, -2.2); A(e, 'potted_plant_02', -3.8, r.back + .5, 0, {s: 1.4}); A(e, 'wooden_crate_01', 3.9, 1.6, .3, {s: .8});
      L(e, -3.5, 2.6, -.5, {to: [-.4, 1, -1.3], ang: 55, pen: .9, i: 1.1, d: 8, c: 0xfff4e2, sh: true});
      L(e, 1.5, 2.9, .5, {i: .6, d: 8, c: 0xffe2bc});
    }},
  aula: {label: 'Aula', group: 'in', amb: 'dia', assets: ['SchoolDesk_01', 'SchoolChair_01', 'standing_chalkboard_01', 'wall_clock', 'mounted_fluorescent_lights', 'metal_office_desk', 'binder_notebook', 'wooden_bookshelf_worn', 'potted_plant_04'],
    build(e) {
      const r = room(e, {w: 10, d: 9, h: 3.1, floor: 'laminate_floor_02', ftint: 0xcfc3ad, ft: 1.4, wall: 'painted_plaster_wall', wtint: 0xe8e4c8, wt: 2.6, window: [-.6, 5, 1, 1.5], z0: 0});
      // blackboard on the back wall, teacher's desk in front of it
      tbox(e, T('rough_concrete', 0x3c5146, {r: .6}), 4.2, 1.3, .04, 0, 1.0, r.back + .02, 2).castShadow = false;
      box(e, EM.wood, 4.4, .06, .1, 0, .97, r.back + .06);
      A(e, 'metal_office_desk', 2.2, r.back + 1.2, Math.PI, {s: .85});
      A(e, 'standing_chalkboard_01', -3.6, r.back + 1, .4);
      // rows of desks facing the board
      for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) {
        const x = -3.3 + j * 2.2, z = r.back + 3 + i * 1.6; if (Math.abs(x) < 1.4 && z > -1.2) continue;
        A(e, 'SchoolDesk_01', x, z, Math.PI); A(e, 'SchoolChair_01', x, z + .55, Math.PI);
      }
      A(e, 'wooden_bookshelf_worn', 4.6, -1, -Math.PI / 2); A(e, 'potted_plant_04', 4.5, .6, 0, {s: 2});
      A(e, 'wall_clock', 0, r.back + .03, 0, {y: 2.5, node: /wall_clock/});
      for (const [x, z] of [[-2.5, -2.5], [2.5, -2.5], [-2.5, 1], [2.5, 1]]) { A(e, 'mounted_fluorescent_lights', x, z, 0, {top: 3.1, node: 'mounted_fluorescent_lights_a', s: 1.6}); L(e, x, 3.02, z, {to: [x, 0, z], ang: 75, pen: 1, i: .7, d: 7, c: 0xf4f8ff, sh: x > 0 && z < 0}); }
    }},
  biblioteca: {label: 'Biblioteca', group: 'in', amb: 'interior', assets: ['wooden_bookshelf_worn', 'book_encyclopedia_set_01', 'ClassicConsole_01', 'Chandelier_03', 'Rockingchair_01', 'ArmChair_01', 'round_wooden_table_01', 'chess_set', 'marble_bust_01', 'mantel_clock_01', 'antique_ceramic_vase_01', 'Lantern_01', 'GreenChair_01'],
    build(e) {
      const r = room(e, {w: 9, d: 7.5, h: 3.4, floor: 'herringbone_parquet', ftint: 0xb08d6c, ft: 1.4, wall: 'dark_planks', wtint: 0xc7a988, wt: 2.2});
      rug(e, T('velour_velvet', 0x7a3b33), 3.4, 2.4, 0, -1.4);
      const books = /book0[1-9]|book1\d/;
      const shelfRow = (n, x0, z, ry, dx, dz) => { for (let i = 0; i < n; i++) { const x = x0 + i * dx, zz = z + i * dz; const s = A(e, 'wooden_bookshelf_worn', x, zz, ry); fillShelf(e, s, x, zz, ry, 1.22, .22, 7 + i * 3 + n); } };
      shelfRow(6, -3.6, r.back + .32, 0, 1.4, 0);
      shelfRow(3, 4.17, -2.0, -Math.PI / 2, 0, 1.45);
      const t = A(e, 'round_wooden_table_01', -2.2, -1.2, 0, {s: .75}); A(e, 'chess_set', -2.2, -1.2, .3, {y: topOf(t, -2.2, -1.2), s: .8});
      A(e, 'GreenChair_01', -3.1, -.9, 1.7); A(e, 'ArmChair_01', -1.3, -2.0, -.6);
      const c = A(e, 'ClassicConsole_01', 2.0, r.back + 1.0, 0); const cy = topOf(c, 2.0, r.back + 1.0);
      A(e, 'marble_bust_01', 1.6, r.back + 1.0, .3, {y: cy}); A(e, 'mantel_clock_01', 2.3, r.back + 1.0, 0, {y: cy, node: 'mantel_clock_01'});
      A(e, 'Rockingchair_01', 2.6, .8, -2.4); A(e, 'antique_ceramic_vase_01', -4.0, .9, 0, {s: 1.8});
      A(e, 'Lantern_01', 2.7, r.back + 1.0, 0, {y: cy}); L(e, 2.7, cy + .15, r.back + 1.0, {i: .5, d: 3.5, c: 0xffb766, flicker: .15});
      pendant(e, 'Chandelier_03', 0, -1.3, 3.4, {drop: .5, i: 1.2, sh: true, ly: .3, c: 0xffc98a});
    }},
  cafeteria: {label: 'Cafetería', group: 'in', amb: 'interior', assets: ['round_wooden_table_02', 'bar_chair_round_01', 'painted_wooden_chair_01', 'CoffeeCart_01', 'CashRegister_01', 'hanging_industrial_lamp', 'croissant', 'strawberry_chocolate_cake', 'carrot_cake', 'tea_set_01', 'potted_plant_02', 'wooden_display_shelves_01', 'jug_01', 'standing_chalkboard_01'],
    build(e) {
      const r = room(e, {w: 11, d: 8, h: 3.2, floor: 'floor_tiles_06', ft: .9, wall: 'brick_wall_001', wtint: 0xe8dccc, wt: 2.2, window: [0, 4.5, .5, 2]});
      // counter
      tbox(e, T('dark_planks', 0xb79c7e), 4.2, 1.05, .7, 2.6, 0, r.back + 1.0, 1);
      tbox(e, T('marble_tiles', 0xe2ddd2), 4.3, .05, .8, 2.6, 1.05, r.back + 1.0, .8);
      A(e, 'CashRegister_01', 1.2, r.back + 1.0, 0, {y: 1.1, node: ['CashRegister_01_body', 'CashRegister_011_drawer'], s: .7});
      A(e, 'carrot_cake', 2.4, r.back + 1.0, 0, {y: 1.1}); A(e, 'strawberry_chocolate_cake', 2.9, r.back + 1.0, 0, {y: 1.1});
      A(e, 'croissant', 3.4, r.back + .95, .3, {y: 1.1}); A(e, 'croissant', 3.55, r.back + 1.05, -.4, {y: 1.1});
      for (let i = 0; i < 4; i++) A(e, 'bar_chair_round_01', 1.2 + i * .95, r.back + 1.75, Math.PI);
      A(e, 'CoffeeCart_01', 4.0, r.back + .35, 0, {s: .9});
      A(e, 'wooden_display_shelves_01', 5.1, -1.3, -Math.PI / 2, {s: 1.2});
      for (const [x, z] of [[-3.3, -2.0], [-3.3, .4], [-1.0, -2.4]]) {
        const t = A(e, 'round_wooden_table_02', x, z, 0), y = topOf(t, x, z);
        A(e, 'painted_wooden_chair_01', x + .65, z, -Math.PI / 2); A(e, 'painted_wooden_chair_01', x - .65, z, Math.PI / 2);
        A(e, 'tea_set_01', x, z, x, {y, node: ['tea_set_01_cup_small_01', 'tea_set_01_saucer_circular_03']});
        pendant(e, 'hanging_industrial_lamp', x, z, 3.2, {i: 1.1, ang: 55, sh: x < -3 && z < 0, ly: .1, c: 0xffc98a});
      }
      A(e, 'potted_plant_02', -5, r.back + .5, 0, {s: 1.5}); A(e, 'standing_chalkboard_01', -5.0, 1.8, 1.2);
    }},
  taberna: {label: 'Taberna', group: 'in', amb: 'interior', assets: ['WoodenTable_01', 'wooden_stool_02', 'wine_barrel_01', 'wooden_barrels_01', 'Lantern_01', 'Chandelier_03', 'wine_bottles_01', 'brass_goblets', 'wooden_bowl_01', 'treasure_chest', 'wooden_bucket_01', 'wooden_crate_02', 'brass_candleholders', 'jug_01'],
    build(e) {
      const r = room(e, {w: 10, d: 8, h: 3.2, floor: 'dark_wooden_planks', ft: 1.6, wall: 'castle_brick_01', wtint: 0xc8b8a4, wt: 2.2, skirt: false});
      // wooden beams and posts
      for (const x of [-3, 0, 3]) tbox(e, T('weathered_planks', 0x8a6a4e), .25, .3, 8, x, 2.9, .5, 1.5);
      for (const [x, z] of [[-3, -1.4], [3, -1.4]]) tbox(e, T('weathered_planks', 0x8a6a4e), .25, 2.9, .25, x, 0, z, 1.5);
      // fireplace with a living fire
      tbox(e, T('castle_brick_01'), 2.2, 1.6, .7, -2.3, 0, r.back + .35, 1.2);
      box(e, EM.black, 1.2, .9, .2, -2.3, .1, r.back + .62);
      tbox(e, T('castle_brick_01'), 1.2, 1.8, .5, -2.3, 1.6, r.back + .25, 1.2);
      const em = box(e, EM.lamp, .7, .25, .2, -2.3, .12, r.back + .6); em.castShadow = false;
      L(e, -2.3, .45, r.back + .95, {i: 1.6, d: 8, c: 0xff8a3a, flicker: .35, sh: true});
      // bar counter with barrels behind
      tbox(e, T('weathered_planks', 0x9c7a58), 3.4, 1.05, .7, 2.6, 0, r.back + 1.4, 1.2);
      A(e, 'wine_barrel_01', 1.6, r.back + .45, 0, {node: /wine_barrel_01/}); A(e, 'wine_barrel_01', 2.5, r.back + .45, .5, {node: /wine_barrel_01/});
      A(e, 'wine_barrel_01', 2.05, r.back + .45, 1, {y: .87, node: /wine_barrel_01/});
      A(e, 'wooden_barrels_01', 3.6, r.back + .5, 0, {node: 'wooden_barrels_01_barrel01'});
      A(e, 'wine_bottles_01', 2.6, r.back + 1.4, 0, {y: 1.05}); A(e, 'brass_goblets', 1.6, r.back + 1.4, .3, {y: 1.05, node: 'brass_goblet_01'});
      A(e, 'jug_01', 3.5, r.back + 1.35, .7, {y: 1.05});
      for (const [x, z, ry] of [[-2.6, -.6, .1], [2.8, .9, -.2]]) {
        const t = A(e, 'WoodenTable_01', x, z, ry, {s: 1.1}), y = topOf(t, x, z);
        for (const dz of [-.65, .65]) for (const dx of [-.5, .5]) A(e, 'wooden_stool_02', x + dx, z + dz, ry, {s: 2.4});
        A(e, 'brass_goblets', x - .2, z, 0, {y, node: 'brass_goblet_02'}); A(e, 'wooden_bowl_01', x + .3, z, 0, {y});
        A(e, 'brass_candleholders', x, z + .05, 0, {y, node: 'brass_candleholder_02', s: .6}); L(e, x, y + .35, z, {i: .55, d: 3.5, c: 0xffb35c, flicker: .2});
      }
      A(e, 'treasure_chest', -4.3, r.back + .5, .3); A(e, 'wooden_bucket_01', -3.6, -2.4, 0); A(e, 'wooden_crate_02', 4.3, -1, 1.5);
      pendant(e, 'Chandelier_03', 0, -1.4, 3.2, {drop: .3, i: .9, ly: .3, c: 0xffb35c});
      for (const [x, z] of [[-4.9, 0], [4.9, -2.5]]) { A(e, 'Lantern_01', x + Math.sign(x) * -.15, z, 0, {y: 1.9}); L(e, x + Math.sign(x) * -.2, 2.05, z, {i: .5, d: 4, c: 0xffb35c, flicker: .15}); }
    }},
  taller: {label: 'Taller', group: 'in', amb: 'interior', assets: ['covered_car', 'tool_cart', 'metal_tool_chest', 'worn_metal_rack', 'ladder_sectioned_01', 'Barrel_01', 'Barrel_02', 'hand_truck', 'portable_generator', 'old_tyre', 'metal_jerrycan', 'cardboard_box_01', 'bench_vice_01', 'drill_press_01', 'WoodenTable_01', 'rollershutter_door', 'caged_hanging_light', 'plastic_crate_01', 'industrial_storage_cart', 'wooden_ladder'],
    build(e) {
      const r = room(e, {w: 11, d: 9, h: 3.6, floor: 'garage_floor', ft: 2.2, wall: 'corrugated_iron', wtint: 0xb9b6ae, wt: 1.6, skirt: false, z0: 0});
      A(e, 'rollershutter_door', 2.2, r.back + .16, 0, {node: 'rollershutter_door_graffiti', s: 1.1});
      A(e, 'covered_car', -3.3, -1.6, .15);
      const bench = A(e, 'WoodenTable_01', 2.6, r.back + 1.0, 0, {s: 1.3}), by = topOf(bench, 2.6, r.back + 1.0);
      A(e, 'bench_vice_01', 1.9, r.back + 1.0, 0, {y: by, node: /bench_vice_(frame|clamp|bar|dial)/}); A(e, 'drill_press_01', 3.2, r.back + .95, 0, {y: by});
      const tc = A(e, 'tool_cart', 4.7, -1.6, -Math.PI / 2); A(e, 'metal_tool_chest', 4.7, -1.6, -Math.PI / 2, {y: topOf(tc, 4.7, -1.6), node: /metal_tool_chest/});
      A(e, 'worn_metal_rack', -.6, r.back + .35, 0); A(e, 'cardboard_box_01', -.6, r.back + .35, .2, {y: 1.25}); A(e, 'plastic_crate_01', -.7, r.back + .35, 0, {y: .62});
      A(e, 'ladder_sectioned_01', 5.3, r.back + 1.0, -Math.PI / 2, {node: /ladder_section_0\d/, rz: -.12});
      A(e, 'Barrel_01', -5.0, r.back + .5, 0); A(e, 'Barrel_02', -4.4, r.back + .5, 1); A(e, 'metal_jerrycan', -4.7, r.back + 1.2, .4);
      for (let i = 0; i < 3; i++) A(e, 'old_tyre', -5.0, -.6, i, {y: i * .16, rx: Math.PI / 2});
      A(e, 'hand_truck', 4.6, .9, -2.2); A(e, 'portable_generator', 3.4, 1.4, .5, {node: /portable_generator/});
      A(e, 'industrial_storage_cart', -1.6, r.back + 1.2, .1, {s: .8}); A(e, 'wooden_ladder', 5.1, 2.1, -1.4);
      for (const [x, z, sh] of [[2.6, -2.8, true], [-3.2, -1.6, true], [0, .4, false]]) pendant(e, 'caged_hanging_light', x, z, 3.6, {i: 1.3, sh, ang: 65, ly: .05, c: 0xfff0d8, s: .7});
    }},
  castillo: {label: 'Salón del castillo', group: 'in', amb: 'interior', assets: ['GothicCabinet_01', 'GothicCommode_01', 'gothic_coffee_table', 'gothic_statue', 'large_castle_door', 'brass_candleholders', 'kite_shield', 'Chandelier_03', 'GreenChair_01', 'lion_head', 'treasure_chest', 'cannon_01', 'wooden_candlestick'],
    build(e) {
      const r = room(e, {w: 13, d: 11, h: 6.5, floor: 'cobblestone_floor_01', ftint: 0xd8d0c4, ft: 1.6, wall: 'castle_brick_01', wt: 2.6, skirt: false, z0: 0});
      A(e, 'large_castle_door', 0, r.back + .17, 0, {s: 1.4});
      rug(e, T('velour_velvet', 0x7a2320), 2.2, 9.5, 0, -.4);
      // dais with a throne
      tbox(e, T('marble_tiles', 0xc8c0b0), 3.4, .3, 2, -4.4, 0, -3.6, 1.2);
      A(e, 'GreenChair_01', -4.4, -3.8, .5, {y: .3, s: 1.25});
      for (const x of [-3, 3]) for (const z of [-3.5, 0, 3]) place(e, p => FURN.columna(p, 6.5), x * 1.55, 0, z);
      A(e, 'GothicCabinet_01', 5.6, -3.6, -Math.PI / 2, {node: /GothicCabinet/}); A(e, 'GothicCommode_01', 5.9, -.4, -Math.PI / 2, {node: /GothicCommode/});
      const tt = A(e, 'gothic_coffee_table', 3.4, 1.4, .2); A(e, 'brass_candleholders', 3.4, 1.4, 0, {y: topOf(tt, 3.4, 1.4), node: 'brass_candleholder_01'});
      L(e, 3.4, topOf(tt, 3.4, 1.4) + .5, 1.4, {i: .7, d: 4, c: 0xffb35c, flicker: .2});
      A(e, 'gothic_statue', -2.4, r.back + 1.0, .2, {h: 2.2});
      tbox(e, T('castle_brick_01'), .9, 1, .9, 2.8, 0, r.back + 1.0, 1); A(e, 'lion_head', 2.8, r.back + 1.0, 0, {y: 1});
      for (const [x, z] of [[-6.4, -2.5], [-6.4, 1.5]]) A(e, 'kite_shield', x + .1, z, Math.PI / 2, {node: /kite_shield/, y: 1.6, rx: -Math.PI / 2});
      A(e, 'treasure_chest', -5.4, -1.0, 1.2); A(e, 'cannon_01', 4.8, 3.4, -2.6, {node: /cannon_01_(barrel|frame|pusherblock|wheel)/});
      for (const [x, z] of [[-6.3, -4], [6.3, 2]]) { A(e, 'wooden_candlestick', x, z, 0, {y: 1.6, s: 1.5}); L(e, x - Math.sign(x) * .2, 1.95, z, {i: .5, d: 5, c: 0xffa94d, flicker: .25}); }
      pendant(e, 'Chandelier_03', 0, -2.4, 6.5, {drop: 2.2, s: 1.6, i: 1.5, sh: true, d: 14, ang: 70, ly: .4, c: 0xffbe73});
      pendant(e, 'Chandelier_03', 0, 2.4, 6.5, {drop: 2.2, s: 1.6, i: 1.2, d: 14, ang: 70, ly: .4, c: 0xffbe73});
    }},
  teatro: {label: 'Teatro', group: 'in', amb: 'noche', assets: ['painted_wooden_chair_02', 'Chandelier_01', 'wooden_crate_02', 'standing_picture_frame_01'],
    build(e) {
      // stage at y = 0 (the cast stands on it), stalls one metre below
      tbox(e, T('dark_wooden_planks', 0xb39272), 12, .02, 7, 0, -.02, -1.5, 1.5);
      tbox(e, T('dark_planks', 0x6e5038), 12, 1, .15, 0, -1, 2, 1.5);
      tplane(e, T('velour_velvet', 0x6b2a26), 30, 20, 0, -1, 12, 2);
      const red = T('velour_velvet', 0x9b2a24, {r: 1});
      curtain(e, red, 13, 7, 0, 0, -5, 0, 14, .18);
      for (const sx of [-1, 1]) { curtain(e, red, 2.6, 7, sx * 5.4, 0, 1.6, 0, 4, .2); curtain(e, red, 2.2, 7, sx * 6.2, 0, -1.5, sx * Math.PI / 2, 3, .2); }
      curtain(e, red, 13.5, 1.6, 0, 5.4, 1.75, 0, 14, .12);
      tbox(e, T('dark_planks', 0x3a2a20), 15, 7, .4, 0, 0, 2.2 + .2, 2).position.y = 7 + 3.5;
      // footlights and audience
      for (let i = -5; i <= 5; i++) { const f = box(e, EM.lamp, .18, .06, .08, i * 1.05, 0, 1.85); f.castShadow = false; }
      for (let row = 0; row < 6; row++) for (let i = -6; i <= 6; i++) if (i !== 0 || row > 1) A(e, 'painted_wooden_chair_02', i * .75, 3.4 + row * 1.1, Math.PI, {y: -1});
      A(e, 'wooden_crate_02', -3.6, -3.2, .4); A(e, 'standing_picture_frame_01', 3.8, -3.6, -.4, {s: 4});
      // stage lighting: two follow spots from the house, one warm wash from above, footlight glow
      L(e, -6, 7, 10, {to: [0, 1, 0], ang: 9, pen: .35, i: 2.4, d: 26, c: 0xfff4e2, sh: true, studio: true});
      L(e, 6, 7, 10, {to: [0, 1, 0], ang: 12, pen: .5, i: 1.2, d: 26, c: 0xbcd0ff, studio: true});
      L(e, 0, 6.5, -1, {to: [0, 0, -1.5], ang: 60, pen: .8, i: .6, d: 12, c: 0xffc98a, sh: true, studio: true});
      L(e, 0, .15, 2.4, {to: [0, 1.6, 0], ang: 70, pen: 1, i: .5, d: 6, c: 0xffd59a, studio: true});
      pendant(e, 'Chandelier_01', 0, 8, 9, {s: 2.5, i: .4, d: 14, ly: .5, c: 0xffd59a});
    }}
});

Object.assign(SCENES, {
  ring: {label: 'Ring de boxeo', group: 'in', amb: 'interior', assets: ['plastic_crate_01', 'metal_stool_01', 'WoodenTable_02'],
    build(e) {
      ENV_BUILD.ring(e);
      // canvas floor texture, corner stools, a hanging heavy bag; stadium lights from above
      tbox(e, T('rough_linen', 0xe2dccd), 6.2, .02, 6.2, 0, -.015, 0, 1.5).castShadow = false;
      A(e, 'metal_stool_01', -3.6, -3.6, .6, {y: -.35}); A(e, 'metal_stool_01', 3.6, 3.6, 2.2, {y: -.35});
      A(e, 'plastic_crate_01', 3.7, -3.6, .2, {y: -.35});
      place(e, p => { cyl(p, EM.black, .01, 1.2, 0, 1.6, 0, 4); cyl(p, EM.red, .18, 1.1, 0, .5, 0, 18); ball(p, EM.red, .18, 0, 1.6, 0, .4); ball(p, EM.red, .18, 0, .5, 0, .4); }, -5.6, -.35, -2.4);
      for (const [x, z, sh] of [[-1.6, -1.6, true], [1.6, 1.6, false], [1.6, -1.6, true], [-1.6, 1.6, false]]) L(e, x * 1.4, 5.8, z * 1.4, {to: [x * .3, 0, z * .3], ang: 32, pen: .5, i: 1.2, d: 14, c: 0xfff4e6, sh});
    }},
  dojo: {label: 'Dojo', group: 'in', amb: 'interior', assets: ['katana_stand_01', 'antique_katana_01', 'chinese_screen_panels', 'chinese_tea_table', 'chinese_stool', 'wooden_lantern_01', 'chinese_chandelier', 'chinese_cabinet', 'wooden_bucket_01'],
    build(e) {
      ENV_BUILD.dojo(e);
      A(e, 'chinese_screen_panels', -6.5, -5.4, .3, {node: 'chinese_screen_panels_a', s: 1.2}); A(e, 'chinese_screen_panels', 6.6, -5.2, -.4, {node: 'chinese_screen_panels_b', s: 1.2});
      const t = A(e, 'chinese_tea_table', -4.6, -3.2, .2); A(e, 'chinese_stool', -5.5, -2.6, 1.2, {s: .8});
      A(e, 'katana_stand_01', -4.6, -3.2, .2, {y: topOf(t, -4.6, -3.2)}); A(e, 'antique_katana_01', -4.6, -3.2, .2, {y: topOf(t, -4.6, -3.2) + .08, rz: Math.PI / 2, s: .9});
      A(e, 'chinese_cabinet', 7.9, -2.5, -Math.PI / 2); A(e, 'wooden_bucket_01', 5.8, 1.6, 0);
      for (const [x, z] of [[-7.6, -5.6], [7.6, -5.6], [-7.6, 2], [7.6, 2]]) { A(e, 'wooden_lantern_01', x, z, 0, {s: 1.6, node: /wooden_lantern_01/}); L(e, x, .55, z, {i: .55, d: 4.5, c: 0xffb766, flicker: .1}); }
      for (const z of [-3, 1.5]) pendant(e, 'chinese_chandelier', 0, z, 3.2, {drop: .2, i: 1, sh: z < 0, ly: .2, c: 0xffcf8a});
    }},
  callejon: {label: 'Callejón', group: 'out', amb: 'noche', out: true, assets: ['modular_fire_escape', 'trashbag', 'metal_trash_can', 'cardboard_box_01', 'plastic_crate_01', 'wooden_crate_01', 'exterior_aircon_unit', 'industrial_wall_lamp', 'security_light', 'rollershutter_door', 'street_rat', 'modular_airduct_rectangular_01', 'Barrel_01', 'WetFloorSign_01', 'old_tyre', 'utility_box_02'],
    build(e) {
      const W = 5;
      tplane(e, T('cobblestone_floor_01', 0xa59f97), W, 60, 0, 0, -8, 1.4);
      for (const sx of [-1, 1]) {
        const b = tbox(e, T(sx < 0 ? 'brick_wall_001' : 'large_red_bricks', 0xc9c0b6), 3, 13, 60, sx * (W / 2 + 1.5), 0, -8, 2.2); b.userData.noOutline = true;
        for (let k = 0; k < 6; k++) { const z = -26 + k * 6.5; const w = box(e, WIN_MAT, .06, 1.4, 1, sx * (W / 2 + .01), 3.4 + (k % 3) * 3.1, z); w.castShadow = false; }
      }
      // puddles
      for (const [x, z, s] of [[.8, 1.6, 1.4], [-1, -3.4, 1], [.4, -7, 1.8]]) { const p = new THREE.Mesh(new THREE.CircleGeometry(s * .6, 24), PUDDLE_MAT); p.rotation.x = -Math.PI / 2; p.scale.y = .6; p.position.set(x, .006, z); p.userData.noOutline = true; e.add(p); }
      A(e, 'modular_fire_escape', W / 2 - .7, -4.5, -Math.PI / 2, {y: 1.9});
      A(e, 'rollershutter_door', -W / 2 + .16, -1.5, Math.PI / 2, {node: 'rollershutter_door_graffiti'});
      A(e, 'metal_trash_can', -1.9, -4.6, .3, {node: /^metal_trash_can(_lid|_handle_left|_handle_right)?$/}); A(e, 'metal_trash_can', -1.95, -5.5, 1.5, {node: /^metal_trash_can_rust/});
      A(e, 'trashbag', -1.7, -3.9, .5); A(e, 'trashbag', -2.0, -3.4, 2, {s: .9}); A(e, 'trashbag', 1.9, 2.4, 1);
      A(e, 'cardboard_box_01', 1.9, -1.2, .4); A(e, 'cardboard_box_01', 1.95, -1.25, 1.3, {y: .34}); A(e, 'plastic_crate_01', 1.6, -.6, .2); A(e, 'wooden_crate_01', 2.0, -8.2, -1.4);
      A(e, 'Barrel_01', -1.9, -9.5, 0); A(e, 'old_tyre', 1.9, -3.2, .6, {rz: .3}); A(e, 'WetFloorSign_01', -.8, 3, 2, {node: undefined});
      A(e, 'exterior_aircon_unit', -W / 2 + .2, -6.5, Math.PI / 2, {y: 2.6, node: 'exterior_aircon_unit_rusted'}); A(e, 'exterior_aircon_unit', W / 2 - .2, 1.2, -Math.PI / 2, {y: 3.2, node: 'exterior_aircon_unit'});
      A(e, 'modular_airduct_rectangular_01', -W / 2 + .4, -12, 0, {y: 4.2, node: 'modular_airduct_rectangular_01_tripple_01', rz: 0});
      A(e, 'utility_box_02', W / 2 - .25, -12.5, -Math.PI / 2); A(e, 'street_rat', -.6, -2.2, 2.2);
      // wall lamps: cones of light on the wet ground
      for (const [x, z, sh] of [[-W / 2 + .1, -1.5, true], [W / 2 - .1, -7.5, true], [-W / 2 + .1, -14, false]]) {
        A(e, 'industrial_wall_lamp', x, z, x < 0 ? Math.PI / 2 : -Math.PI / 2, {y: 3.1, node: /industrial_wall_lamp/});
        L(e, x - Math.sign(x) * .35, 3.25, z, {to: [x * .2, 0, z], ang: 50, pen: .6, i: 1.6, d: 9, c: 0xffd08a, sh, bulb: .05});
      }
      A(e, 'security_light', W / 2 - .2, 3.5, -Math.PI / 2, {y: 4.4, node: /security_light/}); L(e, W / 2 - .5, 4.3, 3.5, {to: [0, 0, 2], ang: 45, i: .9, d: 11, c: 0xdfe8ff});
    }},
  parque: {label: 'Parque', group: 'out', amb: 'dia', out: true, assets: ['jacaranda_tree', 'island_tree_02', 'tree_small_02', 'painted_wooden_bench', 'wooden_picnic_table', 'street_lamp_01', 'garden_gnome', 'concrete_cat_statue', 'planter_box_01', 'shrub_03', 'fern_02', 'metal_trash_can', 'football', 'boulder_01'],
    build(e) {
      tplane(e, T('sparse_grass', 0xd8e0c0), 220, 220, 0, 0, 0, 3);
      // gravel paths crossing at the cast
      tplane(e, T('dirt_floor', 0xd9cdb6), 3, 80, 0, .004, 0, 2); tplane(e, T('dirt_floor', 0xd9cdb6), 80, 3, 0, .005, -5, 2);
      // pond with a stone rim
      const pond = new THREE.Mesh(new THREE.CircleGeometry(3.2, 40), EM.water); pond.rotation.x = -Math.PI / 2; pond.position.set(-8, .03, -10); pond.userData.noOutline = true; e.add(pond);
      for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2; box(e, EM.stone, .5, .22, .35, -8 + Math.sin(a) * 3.3, 0, -10 + Math.cos(a) * 3.3, a); }
      A(e, 'jacaranda_tree', 7, -9, .5, {h: 9}); A(e, 'jacaranda_tree', -14, -2, 2.4, {h: 8});
      scatter(16, 21, 7, 32, (x, z, r, i) => A(e, i % 3 ? 'island_tree_02' : 'tree_small_02', x, z, r * 6, {h: 4.5 + r * 2.5}), -6);
      for (const [x, z, ry] of [[-2.4, -1.4, Math.PI / 2], [2.4, -2.6, -Math.PI / 2], [2.4, -7.8, -Math.PI / 2]]) A(e, 'painted_wooden_bench', x, z, ry);
      A(e, 'wooden_picnic_table', 6, -2.2, .3); A(e, 'metal_trash_can', 1.9, .9, 0, {node: /^metal_trash_can(_lid|_handle_left|_handle_right)?$/, s: .7});
      for (const [x, z] of [[-2.1, -7], [2.1, -14], [-2.1, -20]]) { A(e, 'street_lamp_01', x, z, 0, {h: 4}); L(e, x, 3.8, z, {to: [x, 0, z], ang: 55, pen: .8, i: 1.2, d: 12, c: 0xffc477, sh: z === -7, bulb: .09}); }
      A(e, 'garden_gnome', -4.2, -8.6, .8); A(e, 'concrete_cat_statue', -6, -6.9, .6, {s: 2.5}); A(e, 'boulder_01', -10.5, -7.5, 1);
      for (const x of [-4, 4]) A(e, 'planter_box_01', x, -3.4, 0);
      scatter(14, 22, 3, 14, (x, z, r, i) => A(e, i & 1 ? 'shrub_03' : 'fern_02', x, z, r * 6, {node: (i & 1 ? 'shrub_03_' : 'fern_02_') + 'abcd'[i % 4], s: .9 + r}));
      A(e, 'football', 1.2, 1.8, .3, {node: 'football_inflated'});
    }},
  bosque2: null,
  campamento: {label: 'Campamento', group: 'out', amb: 'noche', out: true, assets: ['stone_fire_pit', 'dead_tree_trunk', 'tree_stump_01', 'Lantern_01', 'wooden_axe', 'folding_wooden_stool', 'metal_jerrycan', 'pine_tree_01', 'fern_02', 'rock_moss_set_01', 'wooden_bucket_01', 'dry_branches_medium_01'],
    build(e) {
      tplane(e, T('forrest_ground_01', 0xc8bfae), 220, 220, 0, 0, 0, 3);
      tplane(e, T('dirt_floor'), 8, 8, 0, .004, -1.4, 2);
      A(e, 'stone_fire_pit', 0, -1.9, 0);
      // fire: glowing embers, crossed logs and a flickering light that casts shadows
      for (let i = 0; i < 4; i++) { const l = mk(G.cyl(8), EM.bark, 0, .12, -1.9, .06, .7, .06, i * .8, 0, Math.PI / 2 - .35); l.rotation.order = 'YZX'; e.add(l); }
      const em = ball(e, EM.lamp, .2, 0, .1, -1.9, .5); em.castShadow = false;
      L(e, 0, .55, -1.9, {i: 2, d: 12, c: 0xff8c3a, flicker: .3, sh: true, decay: 1.6});
      A(e, 'dead_tree_trunk', -1.5, -3.1, .4, {s: .9}); A(e, 'tree_stump_01', 1.7, -2.9, .5, {s: .5}); A(e, 'folding_wooden_stool', 1.6, -.6, -1);
      A(e, 'wooden_axe', 1.7, -2.95, 0, {y: .45, rz: .4}); A(e, 'metal_jerrycan', 2.6, -3.4, .8); A(e, 'wooden_bucket_01', -2.2, -1, .3);
      A(e, 'Lantern_01', -1.5, -3.1, 0, {y: .3}); L(e, -1.5, .5, -3.1, {i: .5, d: 5, c: 0xffc070, flicker: .1});
      A(e, 'dry_branches_medium_01', -.9, .3, 2);
      // tent
      place(e, p => {
        const g = new THREE.BufferGeometry(); const v = [-1, 0, -1.2, 1, 0, -1.2, 0, 1.4, -1.2, -1, 0, 1.2, 1, 0, 1.2, 0, 1.4, 1.2];
        g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.setIndex([0, 2, 5, 0, 5, 3, 1, 4, 5, 1, 5, 2, 0, 1, 2, 3, 5, 4]); g.computeVertexNormals();
        const m = new THREE.Mesh(g, patchEnv(new THREE.MeshStandardMaterial({color: 0x7d8a5c, roughness: 1, side: THREE.DoubleSide}))); m.castShadow = m.receiveShadow = true; p.add(m);
      }, -3.6, 0, -4.2, .6);
      const pines = ['pine_tree_01_a_LOD0', 'pine_tree_01_b_LOD0', 'pine_tree_01_c_LOD0'];
      scatter(12, 31, 7, 24, (x, z, r, i) => A(e, 'pine_tree_01', x, z, r * 6, {node: pines[i % 3], h: 12 + r * 6}), -3);
      scatter(40, 32, 32, 70, (x, z, r) => place(e, FURN.pino, x, 0, z, r * 6, 2.5 + r * 2));
      const rocks = SETS.rock_moss_set_01.children.map(c => c.name);
      scatter(8, 33, 3, 10, (x, z, r, i) => A(e, 'rock_moss_set_01', x, z, r * 6, {node: rocks[i % 6], s: .6 + r * .5}));
      scatter(12, 34, 3, 10, (x, z, r, i) => A(e, 'fern_02', x, z, r * 6, {node: 'fern_02_' + 'abcd'[i % 4], s: .7 + r * .5}));
    }},
  playa: {label: 'Playa y muelle', group: 'out', amb: 'dia', out: true, assets: ['modular_wooden_pier', 'ocean_buoy', 'lateral_sea_marker', 'lifebuoy', 'life_jacket', 'wooden_crate_01', 'dutch_ship_medium', 'namaqualand_boulder_04', 'namaqualand_boulder_02', 'rock_07', 'wooden_bucket_01', 'football'],
    build(e) {
      tplane(e, T('coast_sand_01'), 200, 120, 0, 0, 40, 3);
      const w = new THREE.Mesh(new THREE.PlaneGeometry(400, 200), EM.water); w.rotation.x = -Math.PI / 2; w.position.set(0, -.25, -118); w.userData.noOutline = true; e.add(w);
      const shore = new THREE.Mesh(new THREE.PlaneGeometry(200, 14), EM.water); shore.rotation.x = -Math.PI / 2 - .04; shore.position.set(0, -.12, -24); shore.userData.noOutline = true; e.add(shore);
      // pier from the beach into the sea
      const pier = A(e, 'modular_wooden_pier', 4.5, -22, 0, {y: -3.2});
      A(e, 'lifebuoy', 3.1, -13.5, Math.PI / 2, {y: .1}); A(e, 'wooden_crate_01', 4.6, -24, .2, {y: topOf(pier, 4.6, -24)});
      A(e, 'ocean_buoy', -6, -40, .3, {y: -.6}); A(e, 'lateral_sea_marker', 14, -70, 0, {y: -1});
      A(e, 'dutch_ship_medium', -28, -95, .5, {y: -1.6});
      A(e, 'namaqualand_boulder_04', -7, -6, .5); A(e, 'namaqualand_boulder_02', -5.2, -4.4, 2); A(e, 'rock_07', -3.4, -2.6, 1, {s: 2});
      // parasol, towel and a few things on the sand (the old palms too)
      place(e, p => { cyl(p, EM.white, .02, 2.2, 0, 0, 0, 8); const c = mk(G.cone(12), EM.red, 0, 2.2, 0, 1.1, .45, 1.1); p.add(c); }, -2.4, 0, .4);
      box(e, T('rough_linen', 0x5f86a3), .8, .01, 1.8, -1.6, 0, 1.2).castShadow = false;
      A(e, 'life_jacket', -1.1, 2.2, 1.2, {rx: -Math.PI / 2}); A(e, 'wooden_bucket_01', -2.8, 1.6, .4, {s: .6}); A(e, 'football', 1.5, 2.2, 0, {node: 'football_inflated'});
      const palm = ENV_BUILD.playa.toString().includes('lean') ? null : null;
      for (const [x, z, lean] of [[-8, 4, .25], [9, -1, -.3], [-12, -1, .15]]) place(e, p => {
        let y = 0, xx = 0; for (let i = 0; i < 6; i++) { const m = mk(G.cyl(10), EM.bark, xx, y + .38, 0, .13 - i * .012, .8, .13 - i * .012, 0, 0, -lean * (1 + i * .3)); p.add(m); xx += Math.sin(lean * (1 + i * .3)) * .75; y += Math.cos(lean * (1 + i * .3)) * .76; }
        for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2; const l = mk(G.cone(6), EM.foliage, xx + Math.sin(a) * .8, y, Math.cos(a) * .8, .25, 1.8, .08); l.rotation.order = 'YXZ'; l.rotation.set(Math.PI / 2 + .3, a, 0); p.add(l); }
      }, x, 0, z);
    }},
  desierto: {label: 'Desierto', group: 'out', amb: 'atardecer', out: true, assets: ['namaqualand_boulder_02', 'namaqualand_boulder_04', 'namaqualand_boulder_05', 'quiver_tree_01', 'dead_quiver_trunk', 'shrub_03', 'boulder_01', 'stone_01', 'dead_tree_trunk'],
    build(e) {
      tplane(e, T('dry_ground_01', 0xe6c9a2), 260, 260, 0, 0, 0, 3);
      tplane(e, T('sand_01', 0xe8cfa8), 30, 30, 0, .004, -4, 3);
      A(e, 'namaqualand_boulder_04', -3.6, -3.5, .5, {s: 1.4}); A(e, 'namaqualand_boulder_02', 3.8, -2.8, 2.1, {s: 1.2}); A(e, 'namaqualand_boulder_05', -2.4, 1.6, 1);
      A(e, 'quiver_tree_01', 5.5, -6, .5, {h: 3.6}); A(e, 'quiver_tree_01', -7, -8, 2, {h: 4.4}); A(e, 'dead_quiver_trunk', 2.6, -.4, 1, {rz: Math.PI / 2 - .1});
      A(e, 'dead_tree_trunk', -1.2, -4.8, 2.2, {s: .7});
      scatter(14, 41, 3, 18, (x, z, r, i) => A(e, 'shrub_03', x, z, r * 6, {node: 'shrub_03_' + 'abcd'[i % 4], s: .8 + r * .8}));
      scatter(12, 42, 3, 12, (x, z, r) => A(e, 'stone_01', x, z, r * 6, {s: 1 + r * 3}));
      // far mesas: huge boulders on the horizon
      scatter(9, 43, 70, 120, (x, z, r) => A(e, 'boulder_01', x, z, r * 6, {s: 8 + r * 8, y: -3, noShadow: true}), -20, true);
    }},
  ruinas: {label: 'Ruinas', group: 'out', amb: 'dia', out: true, assets: ['gothic_statue', 'marble_bust_01', 'rock_moss_set_02', 'shrub_03', 'root_cluster_01', 'lion_head', 'fern_02'],
    build(e) {
      const stone = T('castle_brick_01', 0xe4ddd0), floor = T('marble_tiles', 0xe0d8c8);
      tplane(e, T('sand_01', 0xdcc9a6), 200, 200, 0, 0, 0, 3);
      tbox(e, floor, 9, .3, 7, 0, -.3, -1, 1.6).userData.noOutline = true;
      for (let i = 0; i < 3; i++) tbox(e, stone, 9 + (i + 1) * .9, .1, 7 + (i + 1) * .9, 0, -.4 - i * .1, -1, 1.6);
      const col = (x, z, h) => place(e, p => { tbox(p, stone, .8, .25, .8, 0, 0, 0, 1.2); const c = cyl(p, EM.stone, .3, h - .5, 0, .25, 0, 24, .27); c.material = T('rough_concrete', 0xe8e0d0); if (h > 3) tbox(p, stone, .8, .25, .8, 0, h - .25, 0, 1.2); }, x, 0, z);
      for (const [x, z, h] of [[-3.6, -3.6, 3.4], [-1.2, -3.6, 3.4], [1.2, -3.6, 1.8], [3.6, -3.6, 3.4], [-3.6, 1.4, 2.2], [3.6, 1.4, 3.4]]) col(x, z, h);
      tbox(e, stone, 3.6, .5, .9, -2.4, 3.4, -3.6, 1.2);
      const r = rng(7);
      for (let i = 0; i < 6; i++) { const m = mk(G.cyl(20), T('rough_concrete', 0xe8e0d0), 2 + r() * 3, .27, 1 + r() * 2.5, .27, .5, .27, r() * 3, 0, Math.PI / 2); e.add(m); }
      for (let i = 0; i < 8; i++) tbox(e, stone, .5 + r() * .6, .3 + r() * .4, .4 + r() * .4, -4.5 + r() * 9, 0, 2.5 + r() * 2, 1.2, r() * 2);
      A(e, 'gothic_statue', 0, -4.2, 0, {h: 2.2}); A(e, 'marble_bust_01', 1.2, -3.6, -.3, {y: 1.8, s: 1.6}); A(e, 'lion_head', -4.6, 2.8, .7, {s: 1.8});
      const rocks = SETS.rock_moss_set_02.children.map(c => c.name);
      scatter(8, 51, 5, 14, (x, z, rr, i) => A(e, 'rock_moss_set_02', x, z, rr * 6, {node: rocks[i % rocks.length], s: .8 + rr}));
      scatter(10, 52, 4.5, 12, (x, z, rr, i) => A(e, 'shrub_03', x, z, rr * 6, {node: 'shrub_03_' + 'abcd'[i % 4], s: 1 + rr}));
      A(e, 'root_cluster_01', 5.6, -3, 1, {s: .6});
    }},
  escalinata: {label: 'Escalinata', group: 'out', amb: 'dia', out: true, assets: ['street_lamp_01', 'lion_head', 'potted_plant_02', 'antique_ceramic_vase_01', 'marble_bust_01'],
    build(e) {
      const st = T('marble_tiles', 0xe6e0d4), side = T('castle_brick_01', 0xe4ddd0);
      tplane(e, T('cobblestone_floor_01', 0xc9c1b4), 200, 200, 0, 0, 0, 2);
      for (let i = 0; i < 12; i++) tbox(e, st, 8, .16 * (i + 1), .36, 0, 0, -1 - i * .36, 1).userData.noOutline = true;
      tbox(e, st, 8, 1.92, 4, 0, 0, -7.3, 1.5).userData.noOutline = true;
      for (const sx of [-1, 1]) {
        for (let i = 0; i < 12; i++) tbox(e, side, .5, .16 * (i + 1) + .9, .36, sx * 4.25, 0, -1 - i * .36, 1);
        for (let i = 0; i < 6; i++) cyl(e, EM.stone, .06, .8, sx * 3.7, .16 * (i * 2 + 1), -1.2 - i * .72, 10);
        tbox(e, side, 1, 1.2, 1, sx * 4.4, 0, .2, 1); A(e, 'lion_head', sx * 4.4, .2, 0, {y: 1.2, s: 2.2});
        A(e, 'street_lamp_01', sx * 3.4, -6.4, 0, {y: 1.92, h: 4}); L(e, sx * 3.4, 5.75, -6.4, {to: [sx * 3, 1.9, -6.4], ang: 60, pen: .8, i: 1.2, d: 12, c: 0xffc477, bulb: .09, sh: sx < 0});
        A(e, 'antique_ceramic_vase_01', sx * 2.2, -8.6, 0, {y: 1.92, s: 2.4});
      }
      place(e, p => FURN.columna(p, 3.6), -3, 1.92, -8.8); place(e, p => FURN.columna(p, 3.6), 3, 1.92, -8.8);
      tbox(e, side, 7.6, .5, .8, 0, 5.5, -8.8, 1.2);
      A(e, 'marble_bust_01', 0, -8.9, 0, {y: 1.92, s: 2});
    }},
  azotea: {label: 'Azotea', group: 'out', amb: 'atardecer', out: true, assets: ['exterior_aircon_unit', 'modular_airduct_circular_01', 'utility_box_02', 'security_light', 'modular_chainlink_fence', 'plastic_monobloc_chair_01', 'metal_trash_can', 'cardboard_box_01'],
    build(e) {
      tplane(e, T('rough_concrete', 0xc9c4bb), 16, 16, 0, 0, 0, 2.5);
      for (const [w, d, x, z] of [[16, .3, 0, -8], [16, .3, 0, 8], [.3, 16, -8, 0], [.3, 16, 8, 0]]) tbox(e, T('concrete_wall_003'), w, 1, d, x, 0, z, 2);
      place(e, p => { for (const [x, z] of [[-.6, -.6], [.6, -.6], [-.6, .6], [.6, .6]]) box(p, EM.metal, .08, 1.6, .08, x, 0, z); cyl(p, EM.wood, .85, 1.6, 0, 1.6, 0, 24); cone(p, EM.dark, .9, .4, 0, 3.2, 0, 24); }, -4.5, 0, -4.5);
      A(e, 'exterior_aircon_unit', 3, -6.6, 0, {node: 'exterior_aircon_unit'}); A(e, 'exterior_aircon_unit', 5.2, -6.6, 0, {node: 'exterior_aircon_unit_rusted'});
      A(e, 'modular_airduct_circular_01', 1.2, -7.2, 0, {node: 'modular_airduct_circular_triple', y: .3});
      A(e, 'utility_box_02', -7.5, 2.5, Math.PI / 2);
      place(e, p => { tbox(p, T('plastered_wall', 0xd9d0c0), 2.4, 2.6, 2.2, 0, 0, 0, 2); box(p, EM.dark, .9, 2, .05, 0, 0, 1.11); }, 5.6, 0, -2.2, -Math.PI / 2);
      A(e, 'security_light', 4.38, -2.2, -Math.PI / 2, {y: 2.1, node: /security_light/}); L(e, 4.1, 2.2, -2.2, {to: [2, 0, -1], ang: 55, i: 1, d: 10, c: 0xdfe8ff, sh: true});
      A(e, 'plastic_monobloc_chair_01', -2.6, -2, .8); A(e, 'metal_trash_can', -6.8, -6.8, 0, {node: /^metal_trash_can_rust/}); A(e, 'cardboard_box_01', -6.2, -6.9, .4);
      cyl(e, EM.metal, .03, 3, -6.5, 1, 6, 6);
      // the city around: blocks with lit windows
      const r = rng(11);
      for (let i = 0; i < 46; i++) {
        const a = r() * Math.PI * 2, d = 26 + r() * 60, w = 6 + r() * 10, h = 6 + r() * 40, x = Math.sin(a) * d, z = Math.cos(a) * d;
        const b = tbox(e, T(i % 3 ? 'concrete_wall_003' : 'brick_wall_001', 0xbdb6aa), w, h + 20, w, x, -20, z, 4); b.castShadow = false; b.userData.noOutline = true;
        const rows = Math.floor(h / 3.2), cols = Math.floor(w / 2.6), inst = new THREE.InstancedMesh(G.box(), WIN_MAT, rows * cols * 4), m4 = new THREE.Matrix4(); let k = 0;
        for (const [fx, fz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) for (let rr = 0; rr < rows; rr++) for (let c = 0; c < cols; c++) {
          const t = -w / 2 + 1.3 + c * 2.6; m4.makeScale(fz ? 1.2 : .05, 1.6, fz ? .05 : 1.2);
          m4.setPosition(x + (fx ? fx * (w / 2 + .03) : t), rr * 3.2 + 1.2, z + (fz ? fz * (w / 2 + .03) : t)); if (k < rows * cols * 4) inst.setMatrixAt(k++, m4);
        }
        inst.count = k; inst.userData.noOutline = true; e.add(inst);
      }
    }}
});
delete SCENES.bosque2;
SCENES.vacio = {label: 'Vacío', group: 'x', assets: [], build() {}};
tLabels(SCENES);
// the old ids keep working in saved scenes
for (const k of ['estudio', 'habitacion', 'calle', 'bosque', 'cafeteria', 'playa', 'dojo', 'ring', 'ruinas', 'escalinata', 'azotea']) if (!SCENES[k]) console.warn('missing scene', k);
