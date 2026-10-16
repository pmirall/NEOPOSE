// Browser tests for NEOPOSE: the built app (app/index.html) in headless Chromium with software WebGL.
//   node run.js                 all suites
//   node run.js i18n practice   only some
// CHROMIUM=/path/to/chrome overrides the browser playwright-core installed.
const {chromium} = require('playwright-core');
const fs = require('fs'), path = require('path'), http = require('http');

const APP = path.join(__dirname, '..', 'app'), OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, {recursive: true});
const DICT = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'i18n', 'en.json'), 'utf8'));
const LANG_DICT = l => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'i18n', l + '.json'), 'utf8'));
const want = process.argv.slice(2);
// legitimately non-English: the language switcher, garment titles as their authors wrote them, avatar names
const ALLOW = new Set(['Español', 'Language · Idioma', 'Café', ...JSON.parse(fs.readFileSync(path.join(APP, 'ropa', 'catalog.json'), 'utf8')).map(c => c.title)]);
let failed = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) failed++; };

const server = http.createServer((q, r) => {
  let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html';
  fs.readFile(u.startsWith('/fixtures/') ? path.join(__dirname, u) : path.join(APP, u), (e, d) => { if (e) { r.statusCode = 404; return r.end(); } if (u.endsWith('.html')) r.setHeader('content-type', 'text/html'); r.end(d); });
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
  // the machine-translated languages: every panel translated, no errors, the review note shown
  async languages(browser) {
    for (const lang of ['ca', 'fr', 'pt', 'de', 'it']) {
      const D = LANG_DICT(lang), page = await open(browser, {lang}), seen = new Set(), grab = async () => (await texts(page)).forEach(t => seen.add(t));
      await page.evaluate(() => document.querySelectorAll('details').forEach(d => d.open = true));
      for (const tab of ['pose', 'cuerpo', 'ropa', 'dibujo', 'escena', 'camara']) { await page.click(`.tab[data-tab=${tab}]`); await page.waitForTimeout(250); await grab(); }
      await page.click('#helpBtn'); await page.waitForTimeout(300); await grab();
      const note = await page.evaluate(() => !document.querySelector('#helpModal .mtnote').hidden);
      await page.screenshot({path: path.join(OUT, `${lang}-help.png`)}); await page.click('#helpClose');
      const vals = new Set(Object.values(D)), left = [...seen].filter(t => D[t] !== undefined && D[t] !== t && !vals.has(t));
      ok(left.length === 0 && note, `${lang}: no untranslated text, review note shown (${left.slice(0, 4).join(' | ') || 'ok'})`);
      ok(page.errors.length === 0, `${lang}: no JS errors ${page.errors.slice(0, 2).join(' | ')}`);
      await page.context().close();
    }
  },
  // a scene shared as a link opens again with the same cast and set
  async share(browser) {
    const page = await open(browser);
    const link = await page.evaluate(async () => { const A = window.__cdp; A.useGroup(A.GROUP_POSES[3][5]); await A.setEnv('bosque'); return A.sceneLink(); });
    const ctx = page.context(), p2 = await ctx.newPage(); p2.errors = []; p2.on('pageerror', e => p2.errors.push(String(e)));
    await p2.goto(`http://localhost:${server.address().port}/` + link.slice(link.indexOf('#')));
    await p2.waitForFunction(() => window.__cdp && window.__cdp.chars && window.__cdp.chars.length === 3, null, {timeout: 120000}).catch(() => {});
    const r = await p2.evaluate(() => ({n: window.__cdp.chars.length, env: window.__cdp.state.env, hash: location.hash}));
    ok(r.n === 3 && r.env === 'bosque' && !r.hash, `the shared link rebuilds the scene (${JSON.stringify(r)}, ${link.length} characters)`);
    ok(page.errors.length + p2.errors.length === 0, `no JS errors ${[...page.errors, ...p2.errors].slice(0, 2).join(' | ')}`);
    await ctx.close();
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
  // animation: a film of shots. Posing at a frame keys that character, lines of dialogue move the mouth,
  // the film plays from shot to shot with each shot's own set, and the storyboard has a panel per shot
  async anim(browser) {
    const page = await open(browser), A = f => page.evaluate(f);
    await page.click('#animBtn'); await page.waitForTimeout(300);
    ok(await A(() => !document.querySelector('#timeline').hidden && document.querySelectorAll('#mvStrip .mvshot').length === 1), 'the film opens with one shot');
    const box = await page.evaluate(() => { const r = document.querySelector('#tlTrack').getBoundingClientRect(); return {x: r.x, y: r.y, w: r.width}; });
    const xOf = f => box.x + 12 + (box.w - 24) * f / 47;
    await page.mouse.click(xOf(24), box.y + 18 + 24 + 12); await page.waitForTimeout(200);
    await page.evaluate(() => document.querySelector('[data-sec=lib]').open = true);
    await page.click('#poseGrid .pose[data-id="salto"]'); await page.waitForTimeout(300);
    const keys = await A(() => window.__cdp.ANIM.shots[0].keys[0].map(k => k.f));
    ok(keys.join() === '0,24', `posing at frame 25 keys that character, keeping the start (${keys})`);
    await page.mouse.click(xOf(12), box.y + 8); await page.waitForTimeout(200);
    const mid = await A(() => { const C = window.__cdp, q = C.mq.joints.shoulderL.quaternion.toArray(), k = C.ANIM.shots[0].keys[0]; return {q, a: k[0].pose.q.shoulderL, b: k[1].pose.q.shoulderL}; });
    const d = (x, y) => Math.abs(x.reduce((s, v, i) => s + v * y[i], 0));
    ok(d(mid.q, mid.a) < .9999 && d(mid.q, mid.b) < .9999, 'a frame between two keys is a blend of both');
    await page.click('#tlLine'); await page.waitForTimeout(200);
    await page.fill('#leText', 'Hola, ¿qué tal? Me alegro de verte.'); await page.click('#leDone'); await page.waitForTimeout(200);
    const talk = await A(() => { const C = window.__cdp, l = C.ANIM.shots[0].lines[0]; let open = 0; for (let f = l.f; f < l.f + l.len; f++) { C.ANIM.f = f; document.querySelector('#tlTrack'); } return {n: C.ANIM.shots[0].lines.length, len: l.len}; });
    await page.mouse.click(xOf(18), box.y + 8); await page.waitForTimeout(200);
    const mouth = await A(() => ({inf: Math.max(...window.__cdp.mq.body3.morphTargetInfluences), subs: !document.querySelector('#subs').hidden}));
    ok(talk.n === 1 && mouth.inf > .05 && mouth.subs, `a line of dialogue moves the mouth and shows as a subtitle (${JSON.stringify({...talk, ...mouth})})`);
    const bvh = await A(() => window.__cdp.animBVH(window.__cdp.mq));
    ok(/Frames: 48/.test(bvh), 'the BVH holds every frame of the shot');
    await page.click('#mvStrip .mvadd'); await page.waitForTimeout(300);
    await page.evaluate(async () => { await window.__cdp.setEnv('bosque'); });
    await page.waitForTimeout(500);
    ok(await A(() => window.__cdp.ANIM.shots.length === 2 && window.__cdp.ANIM.cur === 1), 'a new shot is added after the current one');
    await page.click('#mvStrip .mvshot:first-child .mvthumb'); await page.waitForFunction(() => window.__cdp.ANIM.cur === 0 && !window.__cdp.ANIM.busy, null, {timeout: 60000});
    ok(await A(() => window.__cdp.state.env !== 'bosque'), 'each shot keeps its own set');
    await page.click('#tlPlay');
    await page.waitForFunction(() => window.__cdp.ANIM.cur === 1 && window.__cdp.state.env === 'bosque', null, {timeout: 60000}).catch(() => {});
    ok(await A(() => window.__cdp.ANIM.cur === 1 && window.__cdp.state.env === 'bosque'), 'the film plays on into the next shot and its set');
    await page.evaluate(() => { if (window.__cdp.ANIM.playing) document.querySelector('#tlPlay').click(); });
    await page.waitForTimeout(500);
    await page.screenshot({path: path.join(OUT, 'anim.png')});
    ok(page.errors.length === 0, `no JS errors ${page.errors.slice(0, 2).join(' | ')}`);
    await page.context().close();
  },
  // pose from a photo, offline: a render of a known pose goes through the detector and comes back as the same pose
  async photo(browser) {
    const page = await open(browser);
    const r = await page.evaluate(async () => {
      const C = window.__cdp, m = C.mq; await C.setEnv('vacio'); document.querySelector('#styleChips .chip[data-v=volumen]').click(); document.body.classList.add('nopanel'); C.state.dots = false; C.state.ik = false;
      for (const s of ['#hint', '.cast', '.modebar']) document.querySelectorAll(s).forEach(e => e.style.visibility = 'hidden');
      C.usePreset(C.POSES.find(p => p.id === 'senalar')); m.group.updateMatrixWorld(true); await new Promise(r => setTimeout(r, 300));
      const bx = new THREE.Box3().setFromObject(m.body3), c = bx.getCenter(new THREE.Vector3());
      C.controls.target.copy(c); C.camera.position.set(c.x, c.y, c.z + 4.5); C.controls.update();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const img = new Image(); img.src = document.querySelector('#gl').toDataURL('image/png'); await img.decode();
      const w = n => m.joints[n].getWorldPosition(new THREE.Vector3()), segs = [['shoulderL', 'elbowL'], ['elbowL', 'wristL'], ['shoulderR', 'elbowR'], ['elbowR', 'wristR'], ['hipL', 'kneeL'], ['hipR', 'kneeR']];
      const dirs = () => segs.map(([a, b]) => w(b).sub(w(a)).normalize()), want = dirs();
      const pose = await C.poseFromImage(img); if (!pose) return null;
      C.applyPhotoPose(m, pose); m.group.updateMatrixWorld(true);
      const got = dirs(); return want.reduce((s, v, i) => s + v.dot(got[i]), 0) / want.length;
    });
    ok(r !== null && r > .85, `a rendered pose is recognised and rebuilt (mean agreement ${r && r.toFixed(2)})`);
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
  // the animation gallery: the bundled library, a clip into a shot, saving a track, BVH round trip, use as pose
  async clips(browser) {
    const page = await open(browser), A = (f, a) => page.evaluate(f, a);
    await page.click('#animBtn'); await page.waitForTimeout(300);
    await page.click('#tlClips'); await page.waitForFunction(() => document.querySelectorAll('#agGrid .agItem').length > 20, null, {timeout: 60000});
    const lib = await A(() => { const C = window.__cdp.clips.allClips(); return {n: C.length, ual: C.filter(c => c.src === 'ual').length, own: C.filter(c => c.src === 'neopose').length}; });
    ok(lib.ual >= 80 && lib.own >= 10, `the gallery has NEOPOSE's clips and the Quaternius library (${lib.own} + ${lib.ual})`);
    await page.waitForTimeout(1500);
    ok(await A(() => document.querySelectorAll('#agGrid .agItem .th:not(.pending)').length > 6), 'cards get their silhouettes');
    await page.fill('#agSearch', 'sword'); await page.waitForTimeout(300);
    const found = await A(() => [...document.querySelectorAll('#agGrid .agItem')].map(b => b.title));
    ok(found.length >= 5 && found.every(t => /sword/i.test(t)), `search filters by name (${found.length}: ${found.slice(0, 3).join(', ')}…)`);
    await page.fill('#agSearch', ''); await A(() => { const C = window.__cdp.clips; C.AG.sel = C.allClips().find(c => c.id === 'ual1-Roll'); });
    await page.click('#agAdd'); await page.waitForTimeout(500);
    const ins = await A(() => { const S = window.__cdp.ANIM.shots[0], K = S.keys[0], a = K[0].pose.pos, b = K[K.length - 1].pose.pos; return {n: K.length, lin: K.slice(0, -1).every(k => k.lin), clip: K[0].clip, d: Math.hypot(b[0] - a[0], b[2] - a[2]), len: S.len, closed: document.querySelector('#animGallery').hidden}; });
    ok(ins.closed && ins.n >= 17 && ins.lin && ins.clip, `the roll goes into the track as ${ins.n} straight keys named “${ins.clip}”`);
    ok(ins.d > 3, `with its root motion: it travels ${ins.d.toFixed(1)} m`);
    const mid = await A(() => { const C = window.__cdp; C.ANIM.f = 0; return C.mq.joints.kneeL.quaternion.angleTo(new THREE.Quaternion().fromArray(C.ANIM.shots[0].keys[0][8].pose.q.kneeL)) * 180 / Math.PI; });
    ok(mid > 20, `the body really moves mid-roll (knee turns ${mid.toFixed(0)}° from the start)`);
    // a track of yours, saved and played back; then the BVH export read back in
    await A(() => window.__cdp.clips.openAnimGallery()); await page.waitForTimeout(500);
    page.once('dialog', d => d.accept('Mi voltereta'));
    await page.click('#agSaveTrack'); await page.waitForTimeout(800);
    const mine = await A(() => { const C = window.__cdp.clips; return {n: C.CLIPS.mine.length, name: C.CLIPS.mine[0] && C.CLIPS.mine[0].name, cat: C.AG.cat, cards: document.querySelectorAll('#agGrid .agItem.mine').length}; });
    ok(mine.n === 1 && mine.name === 'Mi voltereta' && mine.cat === 'mias' && mine.cards === 1, 'a track can be saved as an animation of your own');
    const rt = await A(async () => {
      const C = window.__cdp.clips, m = window.__cdp.mq, S = window.__cdp.ANIM.shots[0];
      await C.importAnimFile(new File([window.__cdp.animBVH(m)], 'vuelta.bvh'));
      const c = C.CLIPS.mine[0], err = [];
      for (const f of [3, 8, 13]) { const k = S.keys[0].find(k => k.f === f), smp = C.sampleClip(c, f / window.__cdp.ANIM.fps); for (const j of ['shoulderL', 'elbowL', 'hipR', 'kneeR', 'head']) err.push(new THREE.Quaternion().fromArray(k.pose.q[j]).angleTo(new THREE.Quaternion().fromArray(smp.q[j])) * 180 / Math.PI); }
      return {name: c.name, max: Math.max(...err)};
    });
    ok(rt.name === 'vuelta' && rt.max < 12, `a BVH file is carried onto the figure (our own export read back: worst joint ${rt.max.toFixed(1)}°)`);
    await A(() => { const C = window.__cdp.clips; C.AG.sel = C.allClips().find(c => c.id === 'ual2-Idle_FoldArms_Loop'); C.AG.t = 1; });
    await page.click('#agPose'); await page.waitForTimeout(300);
    const arms = await A(() => { const m = window.__cdp.mq, w = m.joints.wristL.getWorldPosition(new THREE.Vector3()), c = m.joints.chest.getWorldPosition(new THREE.Vector3()); return w.distanceTo(c); });
    ok(arms < .35, `“use as pose” folds the arms (left wrist ${arms.toFixed(2)} m from the chest)`);
    await page.screenshot({path: path.join(OUT, 'clips.png')});
    ok(!page.errors.length, 'no errors' + (page.errors.length ? ': ' + page.errors.join(' | ') : ''));
    await page.context().close();
  },
  // drawings to animation: a storyboard sheet (made here from three renders in drawn frames) cut into panels, posed, animated
  async board(browser) {
    const page = await open(browser), A = (f, a) => page.evaluate(f, a);
    await A(async () => {
      const C = window.__cdp; C.ex.size = 1; C.ex.bg = 'paper'; C.state.dots = false;
      const sheet = document.createElement('canvas'); sheet.width = 1800; sheet.height = 760; const x = sheet.getContext('2d');
      x.fillStyle = '#fbfaf6'; x.fillRect(0, 0, 1800, 760); x.fillStyle = '#555'; x.font = '40px sans-serif'; x.fillText('SECUENCIA 1', 60, 60);
      for (const [i, id] of ['pie', 'caminar', 'salto'].entries()) {
        C.usePreset(C.POSES.find(p => p.id === id)); C.camera.position.set(0, 1, 3.4); C.controls.target.set(0, .9, 0); C.controls.update(); await new Promise(r => setTimeout(r, 300));
        const r = C.renderExportCanvas(), bx = 60 + i * 580, k = Math.min(520 / r.width, 560 / r.height);
        x.drawImage(r, bx + (520 - r.width * k) / 2, 110 + (560 - r.height * k) / 2, r.width * k, r.height * k);
        x.strokeStyle = '#333'; x.lineWidth = 4; x.strokeRect(bx, 110, 520, 560); x.fillStyle = '#555'; x.font = '28px sans-serif'; x.fillText('PLANO ' + (i + 1), bx, 720);
      }
      C.usePreset(C.POSES.find(p => p.id === 'pie'));
      const blob = await new Promise(r => sheet.toBlob(r, 'image/png'));
      window.__sheet = new File([blob], 'storyboard.png', {type: 'image/png'});
      const img = new Image(); img.src = URL.createObjectURL(blob); await img.decode(); window.__panels = C.board.splitPanels(img).length;
    });
    ok(await A(() => window.__panels) === 3, `a storyboard sheet is cut into its 3 panels (${await A(() => window.__panels)})`);
    await A(() => window.__cdp.board.photoOrBoard([window.__sheet]));
    await page.waitForFunction(() => !document.querySelector('#sbModal').hidden && window.__cdp.board.BD.items.length === 3, null, {timeout: 20000});
    ok(true, 'dropping a sheet opens “drawings to animation” with its panels, instead of the single-photo pose');
    await page.waitForFunction(() => !window.__cdp.board.BD.busy, null, {timeout: 300000});
    // several photos (four frames of a Muybridge jump, out of order on purpose): sorted by name, each one a key pose
    await A(async () => { const F = []; for (const n of ['09', '01', '07', '05']) { const b = await (await fetch('/fixtures/muybridge-161-' + n + '.jpg')).blob(); F.push(new File([b], 'salto-' + n + '.jpg', {type: 'image/jpeg'})); } window.__cdp.board.readBoard(F); });
    await page.waitForFunction(() => !window.__cdp.board.BD.busy && window.__cdp.board.BD.items.length === 4, null, {timeout: 300000});
    const r = await A(() => { const B = window.__cdp.board.BD; return {st: B.items.map(i => i.status), go: !document.querySelector('#sbGo').disabled, cards: document.querySelectorAll('#sbStrip .sbcard.ok').length, name: B.name}; });
    const found = r.st.filter(s => s === 'ok').length;
    ok(found >= 3 && r.go && r.cards === found, `the person is found in the photos (${r.st.join(', ')}) and Animate is ready`);
    await page.screenshot({path: path.join(OUT, 'board.png')});
    await page.click('#sbGo'); await page.waitForTimeout(800);
    const k = await A(() => { const A2 = window.__cdp.ANIM, K = A2.shots[A2.cur].keys[0]; return {n: K.length, fs: K.map(k => k.f), playing: A2.playing, closed: document.querySelector('#sbModal').hidden,
      diff: Math.max(...K.slice(1).map(k => new THREE.Quaternion().fromArray(K[0].pose.q.hipL).angleTo(new THREE.Quaternion().fromArray(k.pose.q.hipL)))) * 180 / Math.PI}; });
    ok(k.closed && k.playing && k.n === found && k.fs[1] - k.fs[0] === 12, `one click: ${k.n} key poses a second apart (${k.fs}) and it plays`);
    ok(k.diff > 20, `the poses follow the photos (the hip bends up to ${k.diff.toFixed(0)}° during the jump)`);
    ok(!page.errors.length, 'no errors' + (page.errors.length ? ': ' + page.errors.join(' | ') : ''));
    await page.context().close();
  },
  // muscles that answer to the pose and skin that keeps its volume (dual quaternions): body, clothes, thumbnails
  async muscles(browser) {
    const page = await open(browser), A = (f, a) => page.evaluate(f, a);
    const peak = () => A(() => { const F = window.__cdp.mq.musc; let x = 0, n = 0; for (let i = 0; i < F.ids.length; i++) if (F.ids[i] === 0) { n++; x = Math.max(x, Math.hypot(F.dv[i * 3], F.dv[i * 3 + 1], F.dv[i * 3 + 2])); } return {x, n}; });
    const info = await A(() => { const m = window.__cdp.mq, g = m.body3.geometry, I = g.attributes.aMuscI; let used = 0; if (I) for (let i = 0; i < I.count; i++) if (I.array[i * 4]) used++;
      return {attrs: !!I, used, morphs: (g.morphAttributes.position || []).length, bones: m.skeleton.bones.filter(b => b.name === '_musc').length}; });
    ok(info.attrs && info.used > 2000 && info.morphs === 7 && info.bones === 2, `muscles live in the vertices (${info.used} moved by some muscle) and the skeleton's two activation bones; the mouth keeps its 7 shapes`);
    const p0 = await peak();
    ok(p0.x > .008 && p0.x < .04, `the biceps rises ${(p0.x * 100).toFixed(1)} cm at most on this body`);
    const drive = id => A(id => { const C = window.__cdp; C.usePreset(C.POSES.find(p => p.id === id)); return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(C.mq._muscVals.slice())))); }, id);
    const stand = await drive('pie'), guard = await drive('guardia'), toes = await drive('puntillas');
    ok(Math.max(...stand) < .2, `standing, the muscles rest (max ${Math.max(...stand).toFixed(2)})`);
    ok(guard[0] > .8 && guard[1] > .8, `a boxing guard flexes both biceps (${guard[0].toFixed(2)}, ${guard[1].toFixed(2)})`);
    ok(toes[22] > .8 && toes[23] > .8 && toes[0] < .2, `on tiptoe the calves work and the biceps do not (${toes[22].toFixed(2)}, ${toes[0].toFixed(2)})`);
    // the sweet-wrapper test: a wrist turned 90° on the forearm keeps the forearm round
    const keep = await A(() => { const C = window.__cdp, m = C.mq, b = m.body3; C.usePreset(C.POSES.find(p => p.id === 'pie'));
      const w = m.joints.wristL, e = m.joints.elbowL, V = THREE.Vector3, pos = b.geometry.attributes.position, sk = m.skeleton;
      const radius = () => { m.group.updateMatrixWorld(true); sk.update(); const a = e.getWorldPosition(new V()), c = w.getWorldPosition(new V()), u = c.clone().sub(a).normalize(); let s = 0, n = 0;
        for (let i = 0; i < pos.count; i++) { if (m.bonePick[m.dom[i]] !== 'elbowL' && m.bonePick[m.dom[i]] !== 'wristL') continue; const v = b.boneTransform(i, new V().fromBufferAttribute(pos, i)).applyMatrix4(b.matrixWorld);
          const t = v.clone().sub(a).dot(u), L = c.distanceTo(a); if (t < L * .8 || t > L * 1.05) continue; s += v.clone().sub(a).addScaledVector(u, -t).length(); n++; } return s / n; };
      const r0 = radius(); w.quaternion.setFromAxisAngle(w.position.clone().normalize(), Math.PI / 2); const r1 = radius(); return r1 / r0; });
    ok(keep > .93, `a wrist turned 90° keeps ${(keep * 100).toFixed(0)}% of the forearm's thickness (no sweet-wrapper pinch)`);
    // the body sliders: the muscles follow while they move, not after
    await page.click('.tab[data-tab=cuerpo]'); await A(() => document.querySelector('[data-sec=prop]').open = true);
    await A(() => { const s = document.querySelector('#b_muscle'); s.value = 1; s.dispatchEvent(new Event('input')); });
    await page.waitForTimeout(120); const p1 = await peak();
    await A(() => { const s = document.querySelector('#b_muscle'); s.value = 0; s.dispatchEvent(new Event('input')); });
    await page.waitForTimeout(120); const p2 = await peak();
    ok(p1.x > p0.x * 1.3 && p2.x < p0.x * .8, `dragging “muscle” changes them at once (${(p2.x * 100).toFixed(1)} → ${(p0.x * 100).toFixed(1)} → ${(p1.x * 100).toFixed(1)} cm)`);
    await A(() => { const s = document.querySelector('#b_flex'); s.value = 0; s.dispatchEvent(new Event('input')); });
    const off = await drive('puntillas');
    ok(Math.max(...off) === 0, 'the “muscle reaction” slider at 0 switches them off');
    // thumbnails of the pose library show them too
    const th = await A(() => { const C = window.__cdp; C.renderThumb(C.POSES.find(p => p.id === 'guardia')); const t = C.thumbChars[0]; return t._muscVals ? t._muscVals[0] : -1; });
    ok(th > .8, `the pose library's silhouettes flex too (biceps ${th.toFixed(2)})`);
    await page.click('.tab[data-tab=ropa]'); await page.click('#outfitChips .chip'); await page.waitForTimeout(4000);
    const worn = await A(() => window.__cdp.mq.garments.filter(g => g.geo).map(g => { const I = g.geo.attributes.aMuscI; let u = 0; if (I) for (let i = 0; i < I.count; i++) if (I.array[i * 4]) u++; return u; }));
    ok(worn.length && worn.some(n => n > 100), `clothes follow the same muscles (${worn.join(', ')} vertices)`);
    ok(!page.errors.length, 'no errors' + (page.errors.length ? ': ' + page.errors.join(' | ') : ''));
    await page.context().close();
  },
  // body builds and advanced settings (MakeHuman modelling targets): shape where it should be, sex and age kept, undo
  async bodies(browser) {
    const page = await open(browser), A = (f, a) => page.evaluate(f, a);
    ok(await A(() => Object.keys(window.__cdp.FIG.xsets).filter(k => /^bs?-/.test(k)).length) >= 60, 'the body sets are loaded');
    await page.click('.tab[data-tab=cuerpo]'); await page.waitForTimeout(800);
    ok(await A(() => document.querySelectorAll('#buildGrid .pose').length) >= 12, 'the builds are shown as silhouettes');
    // girth of the body at a height (fraction of its height), from its rest mesh
    const girth = (id, at) => A(([id, at]) => { const m = window.__cdp.mq; if (id) document.querySelector(`#buildGrid .pose[data-id="${id}"]`).click(); else m.build(m.body);
      const P = m.anchors, nV = window.__cdp.FIG.meta.nV, y0 = m.top * at; let w = 0, d = 0; for (let i = 0; i < nV; i++) { const y = P[i * 3 + 1]; if (Math.abs(y - y0) > .015 || /shoulder|elbow|wrist/.test(m.bonePick[m.dom[i]])) continue; w = Math.max(w, Math.abs(P[i * 3])); d = Math.max(d, P[i * 3 + 2]); }
      return {w, d, g: m.body.gender, age: m.body.age}; }, [id, at]);
    await A(() => { const m = window.__cdp.mq; m.body.gender = .3; m.body.age = 1.2; m.build(m.body); });
    const avgW = await girth('media', .58), apple = await girth('manzana', .58), avgS = await girth('media', .82), bb = await girth('culturista', .82);
    ok(apple.d > avgW.d + .01, `the apple build carries its fat on the belly (${(avgW.d * 100).toFixed(1)} → ${(apple.d * 100).toFixed(1)} cm forward)`);
    ok(bb.w > avgS.w + .01, `the bodybuilder is broader at the shoulders (${(avgS.w * 100).toFixed(1)} → ${(bb.w * 100).toFixed(1)} cm)`);
    ok(Math.abs(bb.g - .3) < 1e-6 && Math.abs(bb.age - 1.2) < 1e-6, 'a build keeps the character\'s sex and age');
    await A(() => { document.querySelector('[data-sec=prop]').open = true; document.querySelector('#advMore').open = true; });
    const hips0 = await girth(null, .5);
    await A(() => { const s = document.querySelector('#adv_hipw'); s.value = 1; s.dispatchEvent(new Event('input')); s.dispatchEvent(new Event('change')); });
    await page.waitForTimeout(150); const hips1 = await girth(null, .5);
    ok(hips1.w > hips0.w + .01, `“hip width” widens the hips (${(hips0.w * 100).toFixed(1)} → ${(hips1.w * 100).toFixed(1)} cm)`);
    await page.click('#shapeChips .chip:nth-child(3)'); await page.waitForTimeout(150);
    ok(await A(() => window.__cdp.mq.body.shape) === 'pera', 'a body shape can be chosen');
    await page.keyboard.press('Control+z'); await page.waitForTimeout(200); await page.keyboard.press('Control+z'); await page.waitForTimeout(300);
    ok(await A(() => !(window.__cdp.mq.body.adv || {}).hipw && window.__cdp.mq.body.shape !== 'pera'), 'undo takes the advanced settings back');
    ok(!page.errors.length, 'no errors' + (page.errors.length ? ': ' + page.errors.join(' | ') : ''));
    await page.context().close();
  },
  // limb differences: stumps that close, joints that are not there stay still, prostheses that pose, a wheelchair
  async limbs(browser) {
    const page = await open(browser), A = (f, a) => page.evaluate(f, a);
    await page.click('.tab[data-tab=cuerpo]'); await A(() => document.querySelector('[data-sec=extremidades]').open = true);
    const reach = () => A(() => { const m = window.__cdp.mq, P = m.anchors, nV = window.__cdp.FIG.meta.nV, s = m.J, i = window.__cdp.FIG.jIdx.shoulderL; let x = 0;
      for (let v = 0; v < nV; v++) if (/shoulderL|elbowL|wristL|^fL/.test(m.bonePick[m.dom[v]] || '') || m.bonePick[m.dom[v]] === 'wristL') x = Math.max(x, Math.hypot(P[v * 3] - s[i * 3], P[v * 3 + 1] - s[i * 3 + 1], P[v * 3 + 2] - s[i * 3 + 2])); return x; });
    const r0 = await reach();
    await page.selectOption('#limb_armL', 'antebrazo'); await page.waitForTimeout(300);
    const r1 = await reach(), st = await A(() => { const m = window.__cdp.mq; return {lock: [...m._limbLock], hide: [...m._limbHide], long: (() => { const P = m.geo.attributes.position.array, I = m.geo.index.array; let n = 0; for (let t = 0; t < I.length; t += 3) for (const [a, b] of [[I[t], I[t + 1]], [I[t + 1], I[t + 2]]]) if (Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]) > .1) n++; return n; })()}; });
    ok(r1 < r0 * .75, `below the elbow, the arm ends there (${(r0 * 100).toFixed(0)} → ${(r1 * 100).toFixed(0)} cm from the shoulder)`);
    ok(st.long < 12, `the skin closes over the stump without stretched triangles (${st.long})`);
    ok(st.lock.includes('wristL') && st.hide.includes('handL'), 'the missing wrist does not move and its hand handle goes away');
    await page.click('[data-limb=armL] .limbpros .chip:nth-child(2)'); await page.waitForTimeout(300);
    const pr = await A(() => { const C = window.__cdp, m = C.mq; C.usePreset(C.POSES.find(p => p.id === 'saludo')); m.group.updateMatrixWorld(true);
      const hand = m.prosthetics.find(g => g.parent === m.joints.wristL), w = m.joints.wristL.getWorldPosition(new THREE.Vector3()); return {n: m.prosthetics.length, onWrist: !!hand, lock: m._limbLock.size, hy: w.y}; });
    ok(pr.n >= 3 && pr.onWrist && pr.lock === 0, `with a prosthetic hand the arm poses again (${pr.n} parts, the hand on the wrist)`);
    await page.selectOption('#limb_legR', 'muslo'); await page.waitForTimeout(300); await page.click('[data-limb=legR] .limbpros .chip:nth-child(2)'); await page.waitForTimeout(300);
    const leg = await A(() => { const C = window.__cdp, m = C.mq; C.usePreset(C.POSES.find(p => p.id === 'pie')); const b = m.box(4), kn = m.prosthetics.some(g => g.parent === m.joints.kneeR), ft = m.prosthetics.some(g => g.parent === m.joints.ankleR); return {y: b.min.y, kn, ft}; });
    ok(leg.kn && leg.ft && Math.abs(leg.y) < .01, `above the knee: knee unit and foot on their bones, standing on the floor (${leg.y.toFixed(3)} m)`);
    await page.click('.tab[data-tab=ropa]'); await page.click('#outfitChips .chip'); await page.waitForTimeout(4000);
    ok(await A(() => window.__cdp.mq.garments.some(g => g.geo && g.geo.attributes.skinIndex.array.some((v, i) => i % 4 === 0 && v === window.__cdp.FIG.jIdx.elbowL && g.geo.attributes.skinWeight.array[i] === 1))), 'the sleeve over the stump hangs on the stump');
    const sat = await A(async () => { const C = window.__cdp, g = C.makeProp('sillaRuedas', new THREE.Vector3(1.5, 0, 0)); await C.sitOn(C.mq, g); return C.mq.joints.hips.getWorldPosition(new THREE.Vector3()).y; });
    ok(sat > .45 && sat < .7, `someone can sit in the wheelchair (pelvis at ${sat.toFixed(2)} m)`);
    ok(!page.errors.length, 'no errors' + (page.errors.length ? ': ' + page.errors.join(' | ') : ''));
    await page.context().close();
  },
  async mobile(browser) {
    for (const lang of ['en', 'es']) {
      const page = await open(browser, {lang, viewport: {width: 390, height: 844}, mobile: true});
      const m = await page.evaluate(() => ({scroll: document.documentElement.scrollWidth - innerWidth, canvas: document.querySelector('#gl').getBoundingClientRect().height}));
      ok(m.scroll <= 0, `${lang} phone: no horizontal scroll (${m.scroll}px)`);
      ok(m.canvas > 200, `${lang} phone: canvas is visible (${Math.round(m.canvas)}px)`);
      const hh = await page.evaluate(() => document.querySelector('header.top').getBoundingClientRect().height);
      ok(hh < 60, `${lang} phone: the top bar fits on one line (${Math.round(hh)}px)`);
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
