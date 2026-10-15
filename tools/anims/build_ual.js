// Universal Animation Library 1 and 2 by Quaternius (CC0, https://quaternius.com) -> app/anims/ual.txt
// Each clip is carried onto the NEOPOSE figure by the app's own retargeting (26-clips.js), in headless Chromium,
// and stored as our poses: base64 of gzip of JSON. Where a clip comes both in place and with root motion (_RM),
// only the root-motion one is kept (the gallery can still play it in place).
//   node build_ual.js <UAL1 Standard .glb> <UAL2 Standard .glb>
// Uses the app as built (python3 build.py first) and the tests' playwright-core; CHROMIUM=/path/to/chrome overrides
// the browser. Clip names are Spanish source text, translated in src/i18n like the rest.
const fs = require('fs'), path = require('path'), http = require('http'), zlib = require('zlib');
const {chromium} = require(require.resolve('playwright-core', {paths: [__dirname, path.join(__dirname, '..', '..', 'tests')]}));
const APP = path.join(__dirname, '..', '..', 'app'), [G1, G2] = process.argv.slice(2);
if (!G1 || !G2) { console.error('node build_ual.js UAL1.glb UAL2.glb'); process.exit(1); }

// clip -> [Spanish name (translated in src/i18n), category, loops]
const NAMES = {
  Crouch_Fwd_Loop: ['Avanzar agachado', 'mov', 1], Crouch_Idle_Loop: ['Agachado, esperando', 'reposo', 1], Dance_Loop: ['Bailar', 'baile', 1],
  Death01: ['Caer muerto', 'combate', 0], Driving_Loop: ['Conducir', 'reposo', 1], Fixing_Kneeling: ['Arreglar algo de rodillas', 'trabajo', 0],
  Hit_Chest: ['Golpe en el pecho', 'combate', 0], Hit_Head: ['Golpe en la cabeza', 'combate', 0], Idle_Loop: ['De pie, esperando', 'reposo', 1],
  Idle_Talking_Loop: ['Hablar gesticulando', 'gestos', 1], Idle_Torch_Loop: ['Sostener una antorcha', 'reposo', 1], Interact: ['Pulsar o tocar algo', 'trabajo', 0],
  Jog_Fwd_Loop: ['Trotar', 'mov', 1], Jump_Land: ['Aterrizar de un salto', 'salto', 0], Jump_Loop: ['En el aire', 'salto', 1], Jump_Start: ['Impulso para saltar', 'salto', 0],
  PickUp_Table: ['Coger algo de la mesa', 'trabajo', 0], Pistol_Aim_Down: ['Apuntar con pistola hacia abajo', 'combate', 0], Pistol_Aim_Neutral: ['Apuntar con pistola', 'combate', 0],
  Pistol_Aim_Up: ['Apuntar con pistola hacia arriba', 'combate', 0], Pistol_Idle_Loop: ['Pistola en reposo', 'combate', 1], Pistol_Reload: ['Recargar la pistola', 'combate', 0],
  Pistol_Shoot: ['Disparar la pistola', 'combate', 0], Punch_Cross: ['Directo', 'combate', 0], Punch_Enter: ['Ponerse en guardia', 'combate', 0], Punch_Jab: ['Jab', 'combate', 0],
  Push_Loop: ['Empujar', 'trabajo', 1], Roll: ['Voltereta', 'salto', 0], Sitting_Enter: ['Sentarse', 'reposo', 0], Sitting_Exit: ['Levantarse de la silla', 'reposo', 0],
  Sitting_Idle_Loop: ['Sentado, esperando', 'reposo', 1], Sitting_Talking_Loop: ['Sentado, hablando', 'gestos', 1], Spell_Simple_Enter: ['Preparar un hechizo', 'combate', 0],
  Spell_Simple_Exit: ['Terminar el hechizo', 'combate', 0], Spell_Simple_Idle_Loop: ['Hechizo preparado', 'combate', 1], Spell_Simple_Shoot: ['Lanzar un hechizo', 'combate', 0],
  Sprint_Loop: ['Esprintar', 'mov', 1], Swim_Fwd_Loop: ['Nadar', 'mov', 1], Swim_Idle_Loop: ['Flotar en el agua', 'mov', 1], Sword_Attack: ['Ataque con espada', 'combate', 0],
  Sword_Idle: ['Espada en guardia', 'combate', 1], Walk_Formal_Loop: ['Andar con elegancia', 'mov', 1], Walk_Loop: ['Andar', 'mov', 1],
  Chest_Open: ['Abrir un cofre', 'trabajo', 0], ClimbUp_1m: ['Trepar un muro de un metro', 'salto', 0], Consume: ['Comer o beber', 'gestos', 0],
  Farm_Harvest: ['Cosechar', 'trabajo', 0], Farm_PlantSeed: ['Plantar una semilla', 'trabajo', 0], Farm_Watering: ['Regar', 'trabajo', 0],
  Hit_Knockback: ['Salir despedido', 'combate', 0], Idle_FoldArms_Loop: ['Brazos cruzados', 'reposo', 1], Idle_Lantern_Loop: ['Sostener un farol', 'reposo', 1],
  Idle_No_Loop: ['Decir que no', 'gestos', 1], Idle_Rail_Call: ['Llamar desde la barandilla', 'gestos', 0], Idle_Rail_Loop: ['Apoyado en la barandilla', 'reposo', 1],
  Idle_Shield_Break: ['Escudo roto', 'combate', 0], Idle_Shield_Loop: ['Cubrirse con el escudo', 'combate', 1], Idle_TalkingPhone_Loop: ['Hablar por teléfono', 'gestos', 1],
  LayToIdle: ['Levantarse del suelo', 'reposo', 0], Melee_Hook: ['Gancho', 'combate', 0], Melee_Hook_Rec: ['Gancho y recuperar', 'combate', 0],
  NinjaJump_Idle_Loop: ['Salto ninja: en el aire', 'salto', 1], NinjaJump_Land: ['Salto ninja: aterrizar', 'salto', 0], NinjaJump_Start: ['Salto ninja: impulso', 'salto', 0],
  OverhandThrow: ['Lanzar por encima del hombro', 'combate', 0], Shield_Dash: ['Embestida con escudo', 'combate', 0], Shield_OneShot: ['Golpe de escudo', 'combate', 0],
  Slide_Exit: ['Deslizarse: levantarse', 'salto', 0], Slide_Loop: ['Deslizarse por el suelo', 'salto', 1], Slide_Start: ['Deslizarse: entrar', 'salto', 0],
  Sword_Block: ['Bloquear con la espada', 'combate', 0], Sword_Dash: ['Estocada a la carrera', 'combate', 0], Sword_Regular_A: ['Espadazo A', 'combate', 0],
  Sword_Regular_A_Rec: ['Espadazo A y recuperar', 'combate', 0], Sword_Regular_B: ['Espadazo B', 'combate', 0], Sword_Regular_B_Rec: ['Espadazo B y recuperar', 'combate', 0],
  Sword_Regular_C: ['Espadazo C', 'combate', 0], Sword_Regular_Combo: ['Combo de espada', 'combate', 0], TreeChopping_Loop: ['Talar un árbol', 'trabajo', 1],
  Walk_Carry_Loop: ['Andar cargando algo', 'mov', 1], Yes: ['Decir que sí', 'gestos', 0], Zombie_Idle_Loop: ['Zombi esperando', 'reposo', 1],
  Zombie_Scratch: ['Zombi arañando', 'combate', 0], Zombie_Walk_Fwd_Loop: ['Andar como un zombi', 'mov', 1]
};

const server = http.createServer((q, r) => {
  let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html';
  const f = u === '/ual1.glb' ? G1 : u === '/ual2.glb' ? G2 : path.join(APP, u);
  fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; return r.end(); } if (u.endsWith('.html')) r.setHeader('content-type', 'text/html'); r.end(d); });
});
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader']});
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('page:', String(e).slice(0, 300)));
  await page.addInitScript(() => { localStorage.setItem('cdp.lang', JSON.stringify('es')); localStorage.setItem('cdp.welcomed', 'true'); });
  await page.goto(`http://localhost:${server.address().port}/`);
  await page.waitForFunction(() => window.__cdp && window.__cdp.chars && window.__cdp.chars.length, null, {timeout: 120000});
  const out = await page.evaluate(async NAMES => {
    const C = window.__cdp.clips, out = [], skipped = [];
    for (const [file, lib] of [['ual1.glb', 'ual1'], ['ual2.glb', 'ual2']]) {
      const buf = await (await fetch(file)).arrayBuffer(), av = await C.parseAvatar(buf, file), names = new Set(av.animations.map(a => a.name));
      for (const a of av.animations) {
        const base = a.name.replace(/_RM$/, '');
        if (!a.name.endsWith('_RM') && names.has(a.name + '_RM')) continue;
        const meta = NAMES[base]; if (!meta) { skipped.push(a.name); continue; }
        const src = C.framesFromModel(av.scene, av.map, a, 24);
        const clip = C.retargetFrames(src, {id: `${lib}-${base}`, name: meta[0], cat: meta[1], src: 'ual', fps: 24, loop: !!meta[2]});
        // loops: the last frame repeats the first, drop it so the cycle joins cleanly
        if (clip.loop && clip.frames.length > 2) clip.frames.pop();
        out.push(C.packClip(clip));
      }
    }
    return {out, skipped};
  }, NAMES);
  console.log(out.out.length, 'clips; skipped:', out.skipped.join(', '));
  const order = ['mov', 'salto', 'gestos', 'reposo', 'trabajo', 'combate', 'baile'];
  out.out.sort((a, b) => order.indexOf(a.cat) - order.indexOf(b.cat) || a.name.localeCompare(b.name, 'es'));
  const txt = zlib.gzipSync(Buffer.from(JSON.stringify(out.out)), {level: 9}).toString('base64');
  fs.writeFileSync(path.join(APP, 'anims', 'ual.txt'), txt);
  console.log('app/anims/ual.txt', (txt.length / 1e6).toFixed(2), 'MB');
  await browser.close(); server.close();
})();
