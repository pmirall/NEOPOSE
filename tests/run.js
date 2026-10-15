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
