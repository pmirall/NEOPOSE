// Browser tests for NEOPOSE: the built app (app/index.html) in headless Chromium with software WebGL.
//   node run.js                 all suites
//   node run.js i18n practice   only some
// CHROMIUM=/path/to/chrome overrides the browser playwright-core installed.
const {chromium} = require('playwright-core');
const fs = require('fs'), path = require('path'), http = require('http');

const APP = path.join(__dirname, '..', 'app'), OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, {recursive: true});
const DICT = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'i18n-en.json'), 'utf8'));
const want = process.argv.slice(2);
// legitimately non-English: the language switcher, garment titles as their authors wrote them, avatar names
const ALLOW = new Set(['Español', 'Language · Idioma', 'Café', ...JSON.parse(fs.readFileSync(path.join(APP, 'ropa', 'catalog.json'), 'utf8')).map(c => c.title)]);
let failed = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) failed++; };

const server = http.createServer((q, r) => {
  let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html';
  fs.readFile(path.join(APP, u), (e, d) => { if (e) { r.statusCode = 404; return r.end(); } if (u.endsWith('.html')) r.setHeader('content-type', 'text/html'); r.end(d); });
});

async function open(browser, {lang = 'en', viewport = {width: 1400, height: 900}, mobile = false} = {}) {
  const ctx = await browser.newContext({viewport, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile});
  await ctx.addInitScript(l => { if (!localStorage.getItem('cdp.lang')) localStorage.setItem('cdp.lang', JSON.stringify(l)); localStorage.setItem('cdp.welcomed', 'true'); }, lang);
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(String(e.stack || e).slice(0, 300)));
  page.on('console', m => { if (m.type() === 'error' && !/404|favicon|Failed to load resource/.test(m.text())) page.errors.push(m.text().slice(0, 300)); });
  await page.goto(`http://localhost:${server.address().port}/`);
  await page.waitForFunction(() => window.__cdp && window.__cdp.chars && window.__cdp.chars.length, null, {timeout: 120000});
  await page.waitForTimeout(800);
  return page;
}
// every visible text and labelled attribute
const texts = page => page.evaluate(() => {
  const out = [], w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) { const s = w.currentNode.nodeValue.trim(); if (s && !w.currentNode.parentElement.closest('script,style,textarea')) out.push(s); }
  for (const el of document.querySelectorAll('[title],[aria-label],[placeholder],[alt]')) for (const a of ['title', 'aria-label', 'placeholder', 'alt']) { const v = el.getAttribute(a); if (v) out.push(v); }
  return out;
});
const waitIdle = page => page.waitForFunction(() => !window.__cdp.practice.busy, null, {timeout: 120000});

const SUITES = {
  // every panel, card and window in English: nothing left in Spanish, no errors
  async i18n(browser) {
    for (const lang of ['en', 'es']) {
      const page = await open(browser, {lang}), seen = new Set(), grab = async () => (await texts(page)).forEach(t => seen.add(t));
      await page.evaluate(() => document.querySelectorAll('details').forEach(d => d.open = true));
      for (const tab of ['pose', 'cuerpo', 'ropa', 'dibujo', 'escena', 'camara']) {
        await page.click(`.tab[data-tab=${tab}]`); await page.waitForTimeout(400);
        if (tab === 'ropa') { await page.click('#outfitChips .chip'); await page.waitForTimeout(2500); await page.evaluate(() => document.querySelectorAll('#garmentList details, #garmentAdd details').forEach(d => d.open = true)); }
        if (tab === 'cuerpo') { await page.click('#speciesChips .chip:nth-child(2)'); await page.waitForTimeout(1200); }
        await grab(); await page.screenshot({path: path.join(OUT, `${lang}-${tab}.png`)});
      }
      await page.click('.tab[data-tab=escena]');
      await page.evaluate(() => document.querySelector('#propChips .chip').click()); await page.waitForTimeout(800); await grab();
      await page.evaluate(() => document.querySelector('#addSpot').click()); await page.waitForTimeout(300); await grab();
      for (const b of ['#exportBtn', '#helpBtn', '#practiceBtn']) { await page.click(b); await page.waitForTimeout(900); await grab(); await page.evaluate(() => document.querySelectorAll('.modal').forEach(m => m.hidden = true)); }
      await page.click('#sketchBtn'); await page.waitForTimeout(300); await grab(); await page.click('#skClose');
      if (lang === 'en') {
        const left = [...seen].filter(t => DICT[t] !== undefined && DICT[t] !== t);
        ok(left.length === 0, `en: no untranslated text (${left.slice(0, 5).join(' | ') || 'none'})`);
        // text that looks Spanish and is not in the dictionary at all (new strings someone forgot to translate)
        const spanish = [...seen].filter(t => !ALLOW.has(t) && (/[áéíóúñ¿¡]/i.test(t) || /\b(de|la|el|los|las|con|para|una|por|que|del|sin|cada|tu|tus)\b/.test(t)));
        ok(spanish.length === 0, `en: no Spanish-looking text left (${spanish.slice(0, 5).join(' | ') || 'none'})`);
      } else {
        ok([...seen].includes('Práctica'), 'es: the interface is in Spanish');
      }
      ok(page.errors.length === 0, `${lang}: no JS errors ${page.errors.slice(0, 2).join(' | ')}`);
      await page.context().close();
    }
  },
  // switching language reloads the page and keeps the scene
  async language(browser) {
    const page = await open(browser);
    const before = await page.evaluate(async () => { const A = window.__cdp; A.useGroup(A.GROUP_POSES[2][3]); await A.setEnv('bosque'); return {n: A.chars.length, env: A.state.env}; });
    await page.click('#helpBtn');
    await Promise.all([page.waitForNavigation(), page.click('#helpModal .langChips .chip[data-v=es]')]);
    await page.waitForFunction(() => window.__cdp && window.__cdp.chars && window.__cdp.chars.length === 2, null, {timeout: 120000});
    const after = await page.evaluate(() => ({lang: document.documentElement.lang, n: window.__cdp.chars.length, env: window.__cdp.state.env}));
    ok(after.lang === 'es' && after.n === before.n && after.env === before.env, `language switch keeps the scene (${JSON.stringify(after)})`);
    ok(page.errors.length === 0, `no JS errors ${page.errors.slice(0, 2).join(' | ')}`);
    await page.context().close();
  },
  // gesture practice with everything random: bodies, clothes, sets, objects in hand; the scene comes back
  async practice(browser) {
    const page = await open(browser);
    const before = await page.evaluate(() => { const A = window.__cdp; A.useGroup(A.GROUP_POSES[2][0]); return {env: A.state.env, bodies: A.chars.map(m => JSON.stringify(m.body))}; });
    await page.click('#practiceBtn');
    await page.evaluate(() => { const $ = s => document.querySelector(s); for (const id of ['prBody', 'prAnthro', 'prChibi', 'prEnv', 'prProps']) if (!$('#' + id).checked) $('#' + id).click(); $('#prSound').checked = false; $('#prClothes .chip[data-v=random]').click(); });
    await page.click('#prStart');
    let withProps = 0;
    for (let i = 0; i < 4; i++) {
      await page.waitForTimeout(300); await waitIdle(page); await page.waitForTimeout(800);
      const s = await page.evaluate(() => { const A = window.__cdp; return {props: A.practice.props.length, held: A.practice.props.every(g => g.userData.held), chars: A.chars.length}; });
      if (s.props > 0) withProps++;
      ok(s.held, `pose ${i + 1}: every practice object is held (${s.props})`);
      await page.screenshot({path: path.join(OUT, `practice-${i}.png`)});
      await page.click('#hNext');
    }
    ok(withProps >= 2, `objects were placed in most poses (${withProps}/4)`);
    await waitIdle(page); await page.click('#hStop'); await page.waitForTimeout(800);
    ok(await page.evaluate(() => !document.querySelector('#prSummary').hidden), 'finishing shows the session summary');
    await page.click('#psClose'); await page.waitForTimeout(2500);
    const after = await page.evaluate(() => { const A = window.__cdp; return {env: A.state.env, bodies: A.chars.map(m => JSON.stringify(m.body)), props: A.props.length}; });
    ok(after.env === before.env && after.bodies.every((b, i) => b === before.bodies[i]) && after.props === 0, 'stopping practice restores the scene');
    ok(page.errors.length === 0, `no JS errors ${page.errors.slice(0, 2).join(' | ')}`);
    await page.context().close();
  },
  // hairstyles: worn and tinted, kept when dressing, undone, refused by species heads
  async hair(browser) {
    const page = await open(browser), A = f => page.evaluate(f);
    await page.click('.tab[data-tab=cuerpo]'); await page.waitForTimeout(500);
    ok(await A(() => document.querySelectorAll('#hairGrid .hairItem').length) === 11, 'every hairstyle has a tile, plus bald');
    await page.click('#hairGrid .hairItem[data-v="h-long01"]'); await page.waitForTimeout(2000);
    await page.click('#hairSw button[data-c="#c7a066"]'); await page.waitForTimeout(300);
    let s = await A(() => { const m = window.__cdp.mq; return {g: !!(m.hairG && m.hairG.d), col: m.hairG && '#' + m.hairG.U.uColA.value.getHexString()}; });
    ok(s.g && s.col === '#c7a066', `the hair is worn and tinted (${JSON.stringify(s)})`);
    await page.screenshot({path: path.join(OUT, 'hair.png')});
    await page.click('.tab[data-tab=ropa]'); await page.click('#outfitChips .chip'); await page.waitForTimeout(2500);
    s = await A(() => { const m = window.__cdp.mq; return {kept: m.garments.includes(m.hairG), cards: document.querySelectorAll('#garmentList .garment').length, outfit: m.outfit.length}; });
    ok(s.kept && s.cards === s.outfit, `dressing keeps the hair out of the outfit (${JSON.stringify(s)})`);
    for (let i = 0; i < 3; i++) { await page.click('#undo'); await page.waitForTimeout(600); }
    ok(await A(() => !window.__cdp.mq.hairG && !window.__cdp.mq.body.hair), 'undo takes the hair off again');
    await page.click('#redo'); await page.waitForTimeout(1500);
    await page.click('.tab[data-tab=cuerpo]'); await page.click('#speciesChips .chip:nth-child(2)'); await page.waitForTimeout(1500);
    ok(await A(() => !window.__cdp.mq.hairG && document.querySelector('#hairGrid').classList.contains('off')), 'species heads do not wear human hair');
    ok(page.errors.length === 0, `no JS errors ${page.errors.slice(0, 2).join(' | ')}`);
    await page.context().close();
  },
  // skeleton construction mode: the bones appear inside a ghost of the figure, follow body changes, and go away again
  async skeleton(browser) {
    const page = await open(browser), A = f => page.evaluate(f);
    await page.click('.tab[data-tab=dibujo]'); await page.evaluate(() => document.querySelector('[data-sec=constr]').open = true);
    await page.click('#formChips .chip[data-v="esqueleto"]');
    await page.waitForFunction(() => window.__cdp.mq.skel && window.__cdp.mq.skel.mesh.visible, null, {timeout: 30000});
    ok(await A(() => !document.querySelector('#skelNote').hidden), 'the skeleton credit is shown');
    const h0 = await A(() => { const g = window.__cdp.mq.skel.geo; g.computeBoundingBox(); return g.boundingBox.max.y; });
    await page.click('.tab[data-tab=cuerpo]'); await page.click('#bodyChips .chip[data-v="nino"]'); await page.waitForTimeout(1200);
    const h1 = await A(() => { const g = window.__cdp.mq.skel.geo; g.computeBoundingBox(); return g.boundingBox.max.y; });
    ok(h1 < h0 * .9, `the bones follow a smaller body (${h0.toFixed(2)} → ${h1.toFixed(2)} m)`);
    await page.screenshot({path: path.join(OUT, 'skeleton.png')});
    await page.click('.tab[data-tab=dibujo]'); await page.click('#formChips .chip[data-v="figura"]'); await page.waitForTimeout(300);
    ok(await A(() => !window.__cdp.mq.skel), 'back to the figure, the skeleton is removed');
    ok(page.errors.length === 0, `no JS errors ${page.errors.slice(0, 2).join(' | ')}`);
    await page.context().close();
  },
  // posing helpers: a pinned hand stays put, a library pose can be blended with the one before, a chair can be sat on
  async posing(browser) {
    const page = await open(browser), A = f => page.evaluate(f);
    await page.click('.tab[data-tab=pose]'); await page.evaluate(() => document.querySelector('[data-sec=ayudas]').open = true);
    await page.click('#pinChips .chip[data-v="handL"]');
    const d = await A(() => { const C = window.__cdp, m = C.mq, w0 = m.joints.wristL.getWorldPosition(new THREE.Vector3());
      document.querySelector('.tab[data-tab=pose]').click(); m.joints.chest.rotation.x += .25; m.joints.chest.rotation.y += .2; m.group.updateMatrixWorld(true); C.enforcePins(m, 'chest');
      return m.joints.wristL.getWorldPosition(new THREE.Vector3()).distanceTo(w0); });
    ok(d < .02, `a pinned hand stays where it was (${(d * 100).toFixed(1)} cm)`);
    await page.click('#pinChips .chip[data-v="handL"]');
    await page.click('#poseGrid .pose[data-id="victoria"]'); await page.waitForTimeout(300);
    ok(await A(() => !document.querySelector('#blendBar').hidden), 'picking a pose offers to blend it with the previous one');
    const before = await A(() => window.__cdp.mq.joints.shoulderL.quaternion.toArray());
    await page.evaluate(() => { const i = document.querySelector('#blendAmt'); i.value = 0; i.dispatchEvent(new Event('input')); i.dispatchEvent(new Event('change')); });
    const back = await A(() => window.__cdp.mq.joints.shoulderL.quaternion.toArray());
    ok(before.some((v, i) => Math.abs(v - back[i]) > .05), 'the blend slider brings back the previous pose');
    const seat = await A(async () => { const C = window.__cdp, g = C.makeProp('silla', new THREE.Vector3(.8, 0, 0)); await g.userData.ready; await C.sitOn(C.mq, g);
      const h = C.mq.joints.hips.getWorldPosition(new THREE.Vector3()); return {y: h.y, x: h.x, preset: C.state.posePreset}; });
    ok(seat.preset === 'sentado' && seat.y > .45 && seat.y < .75 && Math.abs(seat.x - .8) < .3, `sitting on a chair puts the hips on its seat (${JSON.stringify(seat)})`);
    await page.screenshot({path: path.join(OUT, 'posing.png')});
    ok(page.errors.length === 0, `no JS errors ${page.errors.slice(0, 2).join(' | ')}`);
    await page.context().close();
  },
  // scene: a 360° panorama behind the cast, perspective framings, the four-view layout
  async scene(browser) {
    const page = await open(browser), A = f => page.evaluate(f);
    await page.click('.tab[data-tab=escena]'); await page.click('#envChips .chip[data-v="pano_prado"]');
    await page.waitForFunction(() => window.__cdp.panoReady(), null, {timeout: 30000}).catch(() => {});
    ok(await A(() => window.__cdp.panoReady()), 'the panorama is shown behind the cast');
    await page.click('.tab[data-tab=camara]'); await page.click('#perspChips .chip[data-v="p2"]'); await page.waitForTimeout(300);
    const c = await A(() => ({y: window.__cdp.camera.position.y, t: window.__cdp.controls.target.y, g: document.querySelector('#gPersp').checked}));
    ok(Math.abs(c.y - c.t) < .02 && c.g, `two-point framing: level camera, horizon guide on (${JSON.stringify(c)})`);
    await page.click('#multiBtn'); await page.waitForTimeout(800);
    const mv = await A(() => ({side: document.querySelector('#mvSide').getBoundingClientRect().width, gl: document.querySelector('#gl').getBoundingClientRect().width}));
    ok(mv.side > 100 && mv.gl > mv.side, `four views: small views beside a narrower main view (${JSON.stringify(mv)})`);
    await page.screenshot({path: path.join(OUT, 'scene.png')});
    await page.click('#multiBtn'); await page.waitForTimeout(300);
    ok(page.errors.length === 0, `no JS errors ${page.errors.slice(0, 2).join(' | ')}`);
    await page.context().close();
  },
  // the export window renders a PNG
  async export(browser) {
    const page = await open(browser);
    await page.click('#exportBtn'); await page.waitForTimeout(1500);
    const src = await page.evaluate(() => document.querySelector('#exImg').src);
    ok(src.startsWith('data:image/png') && src.length > 20000, `export renders a PNG (${Math.round(src.length / 1024)} kB)`);
    await page.click('#exKind .chip[data-v="turn"]'); await page.waitForTimeout(2000);
    const turn = await page.evaluate(() => { const i = document.querySelector('#exImg'); return {w: i.naturalWidth, h: i.naturalHeight}; });
    ok(turn.w > turn.h * 2, `the turnaround sheet puts the views side by side (${turn.w}×${turn.h})`);
    await page.click('#exKind .chip[data-v="maps"]');
    for (const m of ['depth', 'normal', 'openpose', 'lineart']) {
      await page.click(`#exMap .chip[data-v="${m}"]`); await page.waitForTimeout(800);
      const lit = await page.evaluate(() => { const i = document.querySelector('#exImg'), c = document.createElement('canvas'); c.width = 64; c.height = 64; const x = c.getContext('2d'); x.drawImage(i, 0, 0, 64, 64);
        const d = x.getImageData(0, 0, 64, 64).data, seen = new Set(); for (let k = 0; k < d.length; k += 4) seen.add(d[k] >> 4 << 8 | d[k + 1] >> 4 << 4 | d[k + 2] >> 4); return seen.size; });
      ok(lit > 3, `the ${m} map has content (${lit} tones)`);
    }
    await page.click('#exKind .chip[data-v="m3d"]');
    const glb = await page.evaluate(() => new Promise(res => { const b = window.__cdp.exportGLB(); new THREE.GLTFLoader().parse(b.buffer, '', g => { let n = 0; g.scene.traverse(o => { if (o.isMesh) n += o.geometry.attributes.position.count; }); res(n); }, e => res('error ' + e)); }));
    ok(glb > 10000, `the GLB loads back with the posed figure (${glb} vertices)`);
    const bvh = await page.evaluate(() => window.__cdp.exportBVH(window.__cdp.mq));
    ok(/^HIERARCHY[\s\S]*ROOT hips[\s\S]*MOTION\nFrames: 1/.test(bvh), 'the BVH has a hierarchy and one frame');
    ok(page.errors.length === 0, `no JS errors ${page.errors.slice(0, 2).join(' | ')}`);
    await page.context().close();
  },
  // phone layout: no horizontal scroll, the panel and the canvas are both reachable
  async mobile(browser) {
    for (const lang of ['en', 'es']) {
      const page = await open(browser, {lang, viewport: {width: 390, height: 844}, mobile: true});
      const m = await page.evaluate(() => ({scroll: document.documentElement.scrollWidth - innerWidth, canvas: document.querySelector('#gl').getBoundingClientRect().height}));
      ok(m.scroll <= 0, `${lang} phone: no horizontal scroll (${m.scroll}px)`);
      ok(m.canvas > 200, `${lang} phone: canvas is visible (${Math.round(m.canvas)}px)`);
      await page.screenshot({path: path.join(OUT, `${lang}-phone.png`)});
      ok(page.errors.length === 0, `${lang} phone: no JS errors ${page.errors.slice(0, 2).join(' | ')}`);
      await page.context().close();
    }
  }
};

(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
  for (const [name, fn] of Object.entries(SUITES)) {
    if (want.length && !want.includes(name)) continue;
    console.log(name);
    try { await fn(browser); } catch (e) { ok(false, `${name} crashed: ${String(e).slice(0, 300)}`); }
  }
  await browser.close(); server.close();
  console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})();
