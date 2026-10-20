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
  fs.readFile(u.startsWith('/fixtures/') ? path.join(__dirname, u) : path.join(APP, u), (e, d) => { if (e) { r.statusCode = 404; return r.end(); } if (u.endsWith('.html')) r.setHeader('content-type', 'text/html'); if (u.endsWith('.js')) r.setHeader('content-type', 'text/javascript'); if (u.endsWith('.webmanifest')) r.setHeader('content-type', 'application/manifest+json'); r.end(d); });
});

async function open(browser, {lang = 'en', viewport = {width: 1400, height: 900}, mobile = false} = {}) {
  const ctx = await browser.newContext({viewport, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile});
  await ctx.addInitScript(l => { if (!localStorage.getItem('cdp.lang')) localStorage.setItem('cdp.lang', JSON.stringify(l)); localStorage.setItem('cdp.welcomed', 'true'); localStorage.setItem('cdp.tipDrag', 'true'); }, lang);
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
// a tab of the panel, whatever space it lives in (the app switches to that space first)
const goTab = (page, id) => page.evaluate(id => { const S = window.__cdp.spaces; if (S) return S.goTab(id); document.querySelector(`.tab[data-tab=${id}]`).click(); }, id);
const waitIdle = page => page.waitForFunction(() => !window.__cdp.practice.busy, null, {timeout: 120000});

const SUITES = {
  // every panel, card and window in English: nothing left in Spanish, no errors
  async i18n(browser) {
    for (const lang of ['en', 'es']) {
      const page = await open(browser, {lang}), seen = new Set(), grab = async () => (await texts(page)).forEach(t => seen.add(t));
      await page.evaluate(() => document.querySelectorAll('details').forEach(d => d.open = true));
      for (const tab of ['pose', 'cuerpo', 'ropa', 'dibujo', 'escena', 'camara']) {
        await goTab(page, tab); await page.waitForTimeout(400);
        if (tab === 'ropa') { await page.click('#outfitChips .chip'); await page.waitForTimeout(2500); await page.evaluate(() => document.querySelectorAll('#garmentList details, #garmentAdd details').forEach(d => d.open = true)); }
        if (tab === 'cuerpo') { await page.click('#speciesChips .chip:nth-child(2)'); await page.waitForTimeout(1200); }
        await grab(); await page.screenshot({path: path.join(OUT, `${lang}-${tab}.png`)});
      }
      await goTab(page, 'escena');
      await page.evaluate(() => document.querySelector('#propChips .chip').click()); await page.waitForTimeout(800); await grab();
      await page.evaluate(() => document.querySelector('#addSpot').click()); await page.waitForTimeout(300); await grab();
      for (const b of ['#exportBtn', '#helpBtn', '#setBtn', '#practiceBtn']) { await page.click(b); await page.waitForTimeout(900); await grab(); await page.evaluate(() => document.querySelectorAll('.modal').forEach(m => m.hidden = true)); }
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
      for (const tab of ['pose', 'cuerpo', 'ropa', 'dibujo', 'escena', 'camara']) { await goTab(page, tab); await page.waitForTimeout(250); await grab(); }
      await page.click('#helpBtn'); await page.waitForTimeout(300); await grab();
      await page.screenshot({path: path.join(OUT, `${lang}-help.png`)}); await page.click('#helpClose');
      await page.click('#setBtn'); await page.waitForTimeout(300); await grab();
      const note = await page.evaluate(() => !document.querySelector('#setModal .mtnote').hidden); await page.click('#setClose');
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
    await page.click('#setBtn');
    await Promise.all([page.waitForNavigation(), page.click('#setModal .langChips .chip[data-v=es]')]);
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
    await goTab(page, 'cuerpo'); await page.waitForTimeout(500);
    const tiles = await A(() => document.querySelectorAll('#hairGrid .hairItem').length);
    ok(tiles >= 29, `every hairstyle has a tile, plus bald (${tiles})`);
    ok(/Elvaerwyn \(CC-BY/.test(await A(() => document.querySelector('#hairGrid .hairItem[data-v="h-elvs_micky_afro"]').title)), 'a CC BY hairstyle names its author');
    await page.click('#hairGrid .hairItem[data-v="h-elvs_braided_rows"]'); await page.waitForTimeout(3500);
    ok(await A(() => { const m = window.__cdp.mq; return !!(m.hairG && m.hairG.d && m.hairG.spec.id === 'h-elvs_braided_rows'); }), 'a community hairstyle (cornrows) is worn');
    await page.click('#hairGrid .hairItem[data-v="h-long01"]'); await page.waitForTimeout(2000);
    await page.click('#hairSw button[data-c="#c7a066"]'); await page.waitForTimeout(300);
    let s = await A(() => { const m = window.__cdp.mq; return {g: !!(m.hairG && m.hairG.d), col: m.hairG && '#' + m.hairG.U.uColA.value.getHexString()}; });
    ok(s.g && s.col === '#c7a066', `the hair is worn and tinted (${JSON.stringify(s)})`);
    await page.screenshot({path: path.join(OUT, 'hair.png')});
    await goTab(page, 'ropa'); await page.click('#outfitChips .chip'); await page.waitForTimeout(2500);
    s = await A(() => { const m = window.__cdp.mq; return {kept: m.garments.includes(m.hairG), cards: document.querySelectorAll('#garmentList .garment').length, outfit: m.outfit.length}; });
    ok(s.kept && s.cards === s.outfit, `dressing keeps the hair out of the outfit (${JSON.stringify(s)})`);
    for (let i = 0; i < 4; i++) { await page.click('#undo'); await page.waitForTimeout(600); }
    ok(await A(() => !window.__cdp.mq.hairG && !window.__cdp.mq.body.hair), 'undo takes the hair off again');
    await page.click('#redo'); await page.waitForTimeout(1500);
    await goTab(page, 'cuerpo'); await page.click('#speciesChips .chip:nth-child(2)'); await page.waitForTimeout(1500);
    ok(await A(() => !window.__cdp.mq.hairG && document.querySelector('#hairGrid').classList.contains('off')), 'species heads do not wear human hair');
    ok(page.errors.length === 0, `no JS errors ${page.errors.slice(0, 2).join(' | ')}`);
    await page.context().close();
  },
  // skeleton construction mode: the bones appear inside a ghost of the figure, follow body changes, and go away again
  async skeleton(browser) {
    const page = await open(browser), A = f => page.evaluate(f);
    await goTab(page, 'dibujo'); await page.evaluate(() => document.querySelector('[data-sec=constr]').open = true);
    await page.click('#formChips .chip[data-v="esqueleto"]');
    await page.waitForFunction(() => window.__cdp.mq.skel && window.__cdp.mq.skel.mesh.visible, null, {timeout: 30000});
    ok(await A(() => !document.querySelector('#skelNote').hidden), 'the skeleton credit is shown');
    const h0 = await A(() => { const g = window.__cdp.mq.skel.geo; g.computeBoundingBox(); return g.boundingBox.max.y; });
    await goTab(page, 'cuerpo'); await page.click('#bodyChips .chip[data-v="nino"]'); await page.waitForTimeout(1200);
    const h1 = await A(() => { const g = window.__cdp.mq.skel.geo; g.computeBoundingBox(); return g.boundingBox.max.y; });
    ok(h1 < h0 * .9, `the bones follow a smaller body (${h0.toFixed(2)} → ${h1.toFixed(2)} m)`);
    await page.screenshot({path: path.join(OUT, 'skeleton.png')});
    await goTab(page, 'dibujo'); await page.click('#formChips .chip[data-v="figura"]'); await page.waitForTimeout(300);
    ok(await A(() => !window.__cdp.mq.skel), 'back to the figure, the skeleton is removed');
    ok(page.errors.length === 0, `no JS errors ${page.errors.slice(0, 2).join(' | ')}`);
    await page.context().close();
  },
  // posing helpers: a pinned hand stays put, a library pose can be blended with the one before, a chair can be sat on
  async posing(browser) {
    const page = await open(browser), A = f => page.evaluate(f);
    await goTab(page, 'pose'); await page.evaluate(() => document.querySelector('[data-sec=ayudas]').open = true);
    await page.click('#pinChips .chip[data-v="handL"]');
    const d = await A(() => { const C = window.__cdp, m = C.mq, w0 = m.joints.wristL.getWorldPosition(new THREE.Vector3());
      (window.__cdp.spaces ? window.__cdp.spaces.goTab('pose') : document.querySelector('.tab[data-tab=pose]').click()); m.joints.chest.rotation.x += .25; m.joints.chest.rotation.y += .2; m.group.updateMatrixWorld(true); C.enforcePins(m, 'chest');
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
    await goTab(page, 'escena'); await page.click('#envChips .chip[data-v="pano_prado"]');
    await page.waitForFunction(() => window.__cdp.panoReady(), null, {timeout: 30000}).catch(() => {});
    ok(await A(() => window.__cdp.panoReady()), 'the panorama is shown behind the cast');
    await goTab(page, 'camara'); await page.click('#perspChips .chip[data-v="p2"]'); await page.waitForTimeout(300);
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
    // NEOPOSE's own walk goes somewhere, with the foot that bears the weight planted; a walk made on the spot knows its pace
    const walk = await A(() => {
      const C = window.__cdp, K = C.clips, m = C.mq, V = THREE.Vector3, c = K.allClips().find(x => x.id === 'np-andar'), n = c.frames.length, st = (c.frames[n - 1].p[2] - c.frames[0].p[2]) * n / (n - 1);
      const P = [], fps = 48;
      for (let i = 0; i <= fps * 2 * c.len; i++) { const t = i / fps, lap = Math.floor(t / c.len + 1e-9); m.setPose(K.clipPose(m, K.sampleClip(c, t), new V(0, 0, st * lap), 0, false, 1)); m.group.updateMatrixWorld(true); P.push(['ankleL', 'ankleR'].map(j => m.joints[j].getWorldPosition(new V()))); }
      const floor = Math.min(...P.map(f => Math.min(f[0].y, f[1].y))), v = [];
      for (let i = 1; i < P.length; i++) { const s = P[i][0].y + P[i - 1][0].y <= P[i][1].y + P[i - 1][1].y ? 0 : 1; if (Math.max(P[i][s].y, P[i - 1][s].y) - floor < .06) v.push(P[i][s].distanceTo(P[i - 1][s]) * fps); }
      v.sort((a, b) => a - b); const end = K.sampleClip(c, c.len - 1e-4).p[2], ual = K.allClips().find(x => x.id === 'ual1-Walk_Loop');
      return {speed: st / c.len, slide: v[v.length >> 1], seam: Math.abs(end - st), ual: K.clipSpeed(ual), bob: Math.max(...c.frames.map(f => f.p[1])) - Math.min(...c.frames.map(f => f.p[1]))};
    });
    ok(walk.speed > 1 && walk.speed < 1.8 && walk.slide < .35 && walk.bob > .02 && walk.bob < .12, `the walk cycle travels at ${walk.speed.toFixed(2)} m/s, rising and falling ${Math.round(walk.bob * 100)} cm, its foot on the ground sliding ${walk.slide.toFixed(2)} m/s`);
    ok(walk.seam < .03 && walk.ual > .7 && walk.ual < 1.5, `a loop runs on into its next lap (${(walk.seam * 100).toFixed(1)} cm), and an on-the-spot walk is paced by its feet (${walk.ual.toFixed(2)} m/s)`);
    // every one of NEOPOSE's own clips keeps its feet: a foot on the ground does not slide or sink, and the run and the jump leave it
    const own = await A(() => {
      const C = window.__cdp, K = C.clips, m = C.mq, V = THREE.Vector3, out = {};
      m.setPose({q: Object.fromEntries(Object.keys(m.getPose().q).map(k => [k, [0, 0, 0, 1]])), pos: [0, m.rootY, 0], hands: m.getPose().hands}); m.group.updateMatrixWorld(true);
      const rest = m.joints.ankleL.getWorldPosition(new V()).y;
      for (const c of K.allClips().filter(c => c.src === 'neopose' && c.kit !== 'silla' && c.id !== 'acc-muletas')) {
        const n = c.frames.length, st = [0, 2].map(i => (c.frames[n - 1].p[i] - c.frames[0].p[i]) * (c.loop ? n / (n - 1) : 1)), fps = 60, P = [];
        for (let i = 0; i <= fps * c.len * (c.loop ? 2 : 1); i++) { const t = i / fps, lap = c.loop ? Math.floor(t / c.len + 1e-9) : 0; m.setPose(K.clipPose(m, K.sampleClip(c, t), new V(st[0] * lap, 0, st[1] * lap), 0, false, 1)); m.group.updateMatrixWorld(true); P.push(['ankleL', 'ankleR'].map(j => m.joints[j].getWorldPosition(new V()))); }
        let slide = 0, low = 1, air = 0;
        for (let i = 1; i < P.length; i++) for (const s of [0, 1]) { const a = P[i - 1][s], b = P[i][s]; low = Math.min(low, b.y - rest); if (a.y - rest < .012 && b.y - rest < .012) slide = Math.max(slide, Math.hypot(b.x - a.x, b.z - a.z) * fps); }
        for (const f of P) if (Math.min(f[0].y, f[1].y) - rest > .04) air++;
        out[c.id] = {slide, low, air: air / fps / (c.loop ? 2 : 1)};
      }
      return out;
    });
    const bad = Object.entries(own).filter(([, o]) => o.slide > .3 || o.low < -.015).map(([k, o]) => `${k} ${o.slide.toFixed(2)} m/s, ${(o.low * 100).toFixed(1)} cm`);
    ok(!bad.length, `NEOPOSE's own clips keep their feet: none slides or goes through the floor${bad.length ? ' — ' + bad.join(', ') : ` (worst ${Object.entries(own).sort((a, b) => b[1].slide - a[1].slide)[0].map(x => x.slide != null ? x.slide.toFixed(2) + ' m/s' : x).join(' ')})`}`);
    ok(own['np-correr'].air > .1 && own['np-saltar'].air > .3 && own['np-andar'].air < .01, `the run is off the ground ${Math.round(own['np-correr'].air * 1000)} ms a stride, the jump ${Math.round(own['np-saltar'].air * 1000)} ms (on its toes and in the air), the walk never`);
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
    await goTab(page, 'cuerpo'); await A(() => document.querySelector('[data-sec=prop]').open = true);
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
    await goTab(page, 'ropa'); await page.click('#outfitChips .chip'); await page.waitForTimeout(4000);
    const worn = await A(() => window.__cdp.mq.garments.filter(g => g.geo).map(g => { const I = g.geo.attributes.aMuscI; let u = 0; if (I) for (let i = 0; i < I.count; i++) if (I.array[i * 4]) u++; return u; }));
    ok(worn.length && worn.some(n => n > 100), `clothes follow the same muscles (${worn.join(', ')} vertices)`);
    ok(!page.errors.length, 'no errors' + (page.errors.length ? ': ' + page.errors.join(' | ') : ''));
    await page.context().close();
  },
  // body builds and advanced settings (MakeHuman modelling targets): shape where it should be, sex and age kept, undo
  async bodies(browser) {
    const page = await open(browser), A = (f, a) => page.evaluate(f, a);
    ok(await A(() => Object.keys(window.__cdp.FIG.xsets).filter(k => /^bs?-/.test(k)).length) >= 60, 'the body sets are loaded');
    await goTab(page, 'cuerpo'); await page.waitForTimeout(800);
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
    await goTab(page, 'cuerpo'); await A(() => document.querySelector('[data-sec=extremidades]').open = true);
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
    await goTab(page, 'ropa'); await page.click('#outfitChips .chip'); await page.waitForTimeout(4000);
    ok(await A(() => window.__cdp.mq.garments.some(g => g.geo && g.geo.attributes.skinIndex.array.some((v, i) => i % 4 === 0 && v === window.__cdp.FIG.jIdx.elbowL && g.geo.attributes.skinWeight.array[i] === 1))), 'the sleeve over the stump hangs on the stump');
    const sat = await A(async () => { const C = window.__cdp, g = C.makeProp('sillaRuedas', new THREE.Vector3(1.5, 0, 0)); await C.sitOn(C.mq, g); return C.mq.joints.hips.getWorldPosition(new THREE.Vector3()).y; });
    ok(sat > .45 && sat < .7, `someone can sit in the wheelchair (pelvis at ${sat.toFixed(2)} m)`);
    ok(!page.errors.length, 'no errors' + (page.errors.length ? ': ' + page.errors.join(' | ') : ''));
    await page.context().close();
  },
  // the principles of animation as sliders, motion trails, and dynamics for still drawings
  async motion(browser) {
    const page = await open(browser), A = (f, a) => page.evaluate(f, a);
    await page.click('#animBtn'); await page.waitForTimeout(300);
    await A(() => { const C = window.__cdp, s = C.ANIM.shots[0], m = C.mq; C.usePreset(C.POSES.find(p => p.id === 'pie')); const a = m.getPose(); C.usePreset(C.POSES.find(p => p.id === 'victoria')); const b = m.getPose(); s.keys[0] = [{f: 0, pose: a}, {f: 12, pose: b}, {f: 36, pose: b}]; });
    const wrist = preset => A(preset => { const C = window.__cdp, m = C.mq, s = C.ANIM.shots[0]; s.motion = {}; if (preset) document.querySelector(`#mvmPresets .chip[data-v="${preset}"]`).click();
      const ys = []; for (let f = 0; f <= 24; f++) { m.setPose(C.motionPoseAt(0, f)); m.group.updateMatrixWorld(true); ys.push(m.joints.wristL.getWorldPosition(new THREE.Vector3()).y); } return ys; }, preset);
    const plain = await wrist(null), cartoon = await wrist('cartoon'), natural = await wrist('natural');
    ok(Math.max(...cartoon.slice(6, 13)) > cartoon[20] + .005, `overshoot: the cartoon arm goes past its pose and settles (${Math.max(...cartoon.slice(6, 13)).toFixed(2)} → ${cartoon[20].toFixed(2)} m)`);
    ok(natural[6] < plain[6] - .05, `drag and easing: the natural arm arrives later (${natural[6].toFixed(2)} vs ${plain[6].toFixed(2)} m at frame 6)`);
    const stepped = await A(() => { const C = window.__cdp, s = C.ANIM.shots[0]; s.motion = {0: {step: 2}}; return JSON.stringify(C.motionPoseAt(0, 5).q) === JSON.stringify(C.motionPoseAt(0, 4).q); });
    ok(stepped, 'on twos: frame 5 holds frame 4');
    await page.click('#tlMotion'); await A(() => { document.querySelector('#mvmTrails').click(); window.__cdp.setFrameAnim(3); });
    await page.waitForTimeout(300);
    ok(await A(() => { const T = window.__cdp.TRAIL; return T.group && T.group.visible && T.group.children.length >= 10; }), 'motion trails show the arcs of the head, hands and feet');
    await page.click('#tlClose'); await page.waitForTimeout(200);
    // a still pose: line of action, balance, in-betweens from the ghost
    await A(() => { document.querySelector('[data-sec=dinamismo]').open = true; document.querySelector('[data-sec=ayudas]').open = true; const C = window.__cdp; C.usePreset(C.POSES.find(p => p.id === 'pie')); document.querySelector('#ghostBtn').click(); C.usePreset(C.POSES.find(p => p.id === 'correr')); });
    await page.click('#loaChk'); await page.click('#balChk'); await page.click('#inbChips .chip:nth-child(3)'); await page.waitForTimeout(700);
    const dyn = await A(() => { const D = window.__cdp.DYN, b = window.__cdp.balanceOf(window.__cdp.mq); return {loa: !!(D.loaObj && D.loaObj.visible), bal: !!(D.balObj && D.balObj.visible), inb: D.inbMeshes.length, inside: b.inside}; });
    ok(dyn.loa && dyn.bal && dyn.inb === 2, `line of action, balance and two in-betweens from the ghost (${JSON.stringify(dyn)})`);
    const still = await A(() => { const C = window.__cdp; C.usePreset(C.POSES.find(p => p.id === 'pie')); return new Promise(r => requestAnimationFrame(() => r(C.balanceOf(C.mq).inside))); });
    ok(still && !dyn.inside, 'standing is balanced; running on one foot is not');
    const ex = await A(() => { const C = window.__cdp, m = C.mq; C.usePreset(C.POSES.find(p => p.id === 'correr')); const k0 = new THREE.Quaternion().fromArray(m.getPose().q.kneeR).angleTo(new THREE.Quaternion());
      const s = document.querySelector('#dynExag'); s.value = .5; s.dispatchEvent(new Event('input')); s.dispatchEvent(new Event('change')); return [k0, new THREE.Quaternion().fromArray(m.getPose().q.kneeR).angleTo(new THREE.Quaternion())]; });
    ok(ex[1] > ex[0] * 1.2, `“exaggerate” bends the knee further (${(ex[0] * 57.3).toFixed(0)}° → ${(ex[1] * 57.3).toFixed(0)}°)`);
    await A(() => { const s = document.querySelector('#dynStretch'); s.value = 1.3; s.dispatchEvent(new Event('input')); });
    const st = await A(() => { const g = window.__cdp.mq.group, b = window.__cdp.mq.box(6); return {sy: g.scale.y, sx: g.scale.x, y0: b.min.y}; });
    ok(Math.abs(st.sy - 1.3) < .01 && st.sx < 1 && Math.abs(st.y0) < .02, `squash and stretch keeps the volume and the feet on the floor (${st.sx.toFixed(2)} × ${st.sy.toFixed(2)})`);
    ok(!page.errors.length, 'no errors' + (page.errors.length ? ': ' + page.errors.join(' | ') : ''));
    await page.context().close();
  },
  // saved characters, and poses and animations with mobility aids
  async people(browser) {
    const page = await open(browser), A = (f, a) => page.evaluate(f, a);
    await goTab(page, 'ropa'); await page.click('#outfitChips .chip:nth-child(2)'); await page.waitForTimeout(3500);
    await goTab(page, 'cuerpo'); await page.waitForTimeout(300);
    await A(() => document.querySelector('#buildGrid .pose[data-id="robusta"]').click()); await page.waitForTimeout(400);
    page.once('dialog', d => d.accept('Marta'));
    await page.click('#charSave'); await page.waitForTimeout(2500);
    const saved = await A(() => window.__cdp.SAVED_CHARS().map(c => ({n: c.name, o: c.outfit.length, b: c.body.build, t: !!c.thumb})));
    ok(saved.length === 1 && saved[0].n === 'Marta' && saved[0].o > 0 && saved[0].b === 'robusta' && saved[0].t, `a character is saved with build, clothes and a portrait (${JSON.stringify(saved)})`);
    await page.click('#cast .chip.add'); await page.click('#castPop .charcard'); await page.waitForTimeout(3500);
    const placed = await A(() => window.__cdp.chars.map(m => [m.body.name, (m.outfit || []).length, m.body.build]));
    ok(placed.length === 2 && placed[1][0] === 'Marta' && placed[1][1] === placed[0][1] && placed[1][2] === 'robusta', 'the cast\'s “+” puts a saved character in the scene, dressed');
    const rt = await A(async () => { const C = window.__cdp, c = C.SAVED_CHARS()[0], {thumb, ...d} = c; await C.importCharacters([new File([JSON.stringify({neopose: 'character', ...d, name: 'Marta 2'})], 'marta.neopose-personaje.json')]); return C.SAVED_CHARS().map(x => x.name); });
    ok(rt.includes('Marta 2'), 'a character file can be imported');
    // mobility: crutches in the hands with their tips on the floor, sitting in a wheelchair, pushing it along
    const cr = await A(() => { const C = window.__cdp, m = C.mq; C.usePreset(C.POSES.find(p => p.id === 'muletas_pie')); C.accessTick(); return C.props.filter(p => p.userData.ride).map(p => ({t: p.userData.prop, y: p.position.y})); });
    ok(cr.length === 2 && cr.every(c => c.t === 'muleta' && c.y < .05), `standing on crutches: two crutches, tips on the floor (${cr.map(c => c.y.toFixed(3))})`);
    const ch = await A(() => { const C = window.__cdp, m = C.mq; C.usePreset(C.POSES.find(p => p.id === 'silla_reposo')); C.accessTick(); const g = C.props.find(p => p.userData.ride); return {t: g && g.userData.prop, hy: m.joints.hips.position.y, n: C.props.filter(p => p.userData.ride).length}; });
    ok(ch.t === 'sillaRuedas' && ch.n === 1 && ch.hy > .5 && ch.hy < .7, `in a wheelchair: the crutches go, the chair comes, seated on it (pelvis ${ch.hy.toFixed(2)} m)`);
    await page.click('#animBtn'); await page.waitForTimeout(300);
    const push = await A(async () => { const C = window.__cdp, K = C.clips; await K.loadClipLibrary(); const c = K.allClips().find(x => x.id === 'acc-silla'); C.ANIM.shots[0].keys[C.chars.indexOf(C.mq)] = []; K.insertClip(c, C.chars.indexOf(C.mq), 0, {loops: 2});
      const g = C.props.find(p => p.userData.ride && p.userData.prop === 'sillaRuedas'); C.setFrameAnim(0); C.accessTick(); const z0 = g.position.z; C.setFrameAnim(24); C.accessTick(); return {dz: g.position.z - z0, hy: C.mq.joints.hips.position.y}; });
    ok(push.dz > .5 && push.hy > .5 && push.hy < .7, `pushing the wheelchair: chair and person travel together (${push.dz.toFixed(2)} m), still seated`);
    ok(!page.errors.length, 'no errors' + (page.errors.length ? ': ' + page.errors.join(' | ') : ''));
    await page.context().close();
  },
  // layers for drawing programs: a real layered PSD, “Open in…” on the desktop and in the browser, one sequence per layer
  async layers(browser) {
    const page = await open(browser), A = (f, a) => page.evaluate(f, a);
    await goTab(page, 'ropa'); await page.click('#outfitChips .chip:nth-child(2)'); await page.waitForTimeout(2500);
    const psd = await A(async () => {
      const C = window.__cdp; const b = await C.layers.layeredPSD(), d = new DataView(b.buffer, b.byteOffset, b.byteLength);
      const sig = String.fromCharCode(...b.slice(0, 4)), ch = d.getUint16(12), h = d.getUint32(14), w = d.getUint32(18), depth = d.getUint16(22), mode = d.getUint16(24);
      let o = 26; o += 4 + d.getUint32(o); o += 4 + d.getUint32(o); const lmi = d.getUint32(o); o += 4; const li = d.getUint32(o); o += 4; const n = Math.abs(d.getInt16(o)); o += 2;
      const names = []; for (let i = 0; i < n; i++) { o += 16; const nc = d.getUint16(o); o += 2 + nc * 6 + 12; const ex = d.getUint32(o); o += 4; const end = o + ex; o += 4 + d.getUint32(o); o += 4 + d.getUint32(o); const ln = b[o]; names.push(String.fromCharCode(...b.slice(o + 1, o + 1 + ln))); o = end; }
      return {sig, ch, w, h, depth, mode, n, names, size: b.length, fits: 26 + 8 + lmi <= b.length && li < lmi, cw: C.renderExportCanvas().width};
    });
    ok(psd.sig === '8BPS' && psd.ch === 4 && psd.depth === 8 && psd.mode === 3 && psd.w === psd.cw, `a valid RGBA PSD at the export size (${psd.w}×${psd.h}, ${Math.round(psd.size / 1024)} kB)`);
    ok(psd.fits && psd.n === 4 && psd.names[0] === 'Set' && /^Character 1 - Man/.test(psd.names[1]) && psd.names[2] === 'Lines' && psd.names[3] === 'Draw here', `layers: ${psd.names.join(' / ')}`);
    // the desktop app: the programs it found, the PSD handed to the one you pick
    await A(() => { window.__opened = []; window.neoposeNative = {apps: async () => [{id: 'krita', name: 'Krita', fmt: 'psd'}, {id: 'default', name: '', fmt: 'psd'}], openIn: async (id, name, bytes) => { window.__opened.push({id, name, sig: String.fromCharCode(...bytes.slice(0, 4))}); return {ok: true}; }}; });
    await page.click('#openIn'); await page.waitForTimeout(400);
    const list = await A(() => [...document.querySelectorAll('#openInList .openinapp strong')].map(s => s.textContent));
    ok(!(await page.isHidden('#openInModal')) && list[0] === 'Krita' && list.length === 2, `“Open in…” lists the programs found (${list.join(', ')})`);
    await page.screenshot({path: path.join(OUT, 'open-in.png')});
    await page.click('#openInList .openinapp.found'); await page.waitForFunction(() => window.__opened.length, null, {timeout: 30000});
    const op = await A(() => window.__opened[0]);
    ok(op.id === 'krita' && /\.psd$/.test(op.name) && op.sig === '8BPS', `the layered PSD goes to Krita (${op.name})`);
    await page.waitForTimeout(1200); ok(await page.isHidden('#openInModal'), 'the window closes once it opens');
    // the browser: a download of the PSD
    await A(() => { delete window.neoposeNative; });
    const [dl] = await Promise.all([page.waitForEvent('download', {timeout: 60000}), page.click('#openIn')]);
    ok(/\.psd$/.test(dl.suggestedFilename()), `in a browser the PSD is downloaded (${dl.suggestedFilename()})`);
    // animation: one folder of frames per layer
    await page.click('#animBtn'); await page.waitForTimeout(300);
    await A(async () => { const C = window.__cdp, K = C.clips; await K.loadClipLibrary(); const ci = C.chars.indexOf(C.mq); C.ANIM.shots[0].keys[ci] = []; K.insertClip(K.allClips().find(x => x.loop), ci, 0, {loops: 1}); });
    await page.click('#exportBtn'); await page.waitForTimeout(800);
    await page.click('#exKind .chip[data-v="anim"]'); await page.click('#exAnimWhat .chip[data-v="layers"]'); await page.click('#exAnimRange .chip[data-v="shot"]'); await page.click('#exAnimStep .chip[data-v="keys"]');
    const [z] = await Promise.all([page.waitForEvent('download', {timeout: 300000}), page.click('#exSave')]);
    const zp = await z.path(), names = [...fs.readFileSync(zp).toString('latin1').matchAll(/(\d\d-[\w-]+\/\d\d-[\w-]+\/\d{4}\.png)/g)].map(m => m[1]), dirs = new Set(names.map(n => n.split('/')[1]));
    ok(/\.zip$/.test(z.suggestedFilename()) && dirs.size === 3 && names.length >= dirs.size * 2, `layered frames: ${dirs.size} layer folders (${[...dirs].join(', ')}), ${names.length / 2} files`);
    await page.click('#exAnimWhat .chip[data-v="gif"]');
    const [g] = await Promise.all([page.waitForEvent('download', {timeout: 300000}), page.click('#exSave')]);
    const gb = fs.readFileSync(await g.path()), gw = gb.readUInt16LE(6); let gfr = 0, q = 13 + (gb[10] & 0x80 ? 3 << ((gb[10] & 7) + 1) : 0); const subs = () => { while (gb[q]) q += gb[q] + 1; q++; };
    while (q < gb.length && gb[q] !== 0x3b) { if (gb[q] === 0x21) { q += 2; subs(); } else if (gb[q] === 0x2c) { gfr++; const fl = gb[q + 9]; q += 10 + (fl & 0x80 ? 3 << ((fl & 7) + 1) : 0) + 1; subs(); } else break; }
    ok(/\.gif$/.test(g.suggestedFilename()) && gb.toString('latin1', 0, 6) === 'GIF89a' && gw <= 720 && gfr === names.length / 2 / 3, `an animated GIF (${gw} px wide, ${gfr} frames, ${Math.round(gb.length / 1024)} kB)`);
    ok(!page.errors.length, 'no errors' + (page.errors.length ? ': ' + page.errors.join(' | ') : ''));
    await page.context().close();
  },
  // feel: drag from the panel to the canvas, glides, undo toasts, menus, search, sliders, the phone sheet and finger gestures
  async feel(browser) {
    const page = await open(browser), A = (f, a) => page.evaluate(f, a);
    const at = (ci, j) => A(([ci, j]) => { const C = window.__cdp, r = document.querySelector('#gl').getBoundingClientRect(), p = C.chars[ci].joints[j].getWorldPosition(new THREE.Vector3()).project(C.camera); return {x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height}; }, [ci, j]);
    const drag = async (sel, to, wait = 300) => { const el = await page.$(sel); await el.evaluate(e => e.scrollIntoView({block: 'center', behavior: 'instant'})); await page.waitForTimeout(300); const b = await el.boundingBox(), x0 = b.x + b.width / 2, y0 = b.y + b.height / 2;
      await page.mouse.move(x0, y0); await page.mouse.down(); for (let i = 1; i <= 12; i++) { await page.mouse.move(x0 + (to.x - x0) * i / 12, y0 + (to.y - y0) * i / 12); await page.waitForTimeout(16); } await page.waitForTimeout(wait); };
    await page.click('#cast .chip.add'); await page.waitForTimeout(1500);
    await A(() => document.querySelectorAll('#book details.sec').forEach(d => { if (!d.querySelector('#poseGrid')) d.open = false; })); await page.waitForTimeout(300);
    // a pose dragged onto the other character: previewed while hovering, applied on release, with a way back
    const q0 = await A(() => JSON.stringify(window.__cdp.chars[0].getPose().q));
    await drag('#poseGrid .pose[data-id="victoria"]', await at(0, 'chest'));
    const hov = await A(() => ({label: document.querySelector('.dndtarget.hot span')?.textContent, preview: JSON.stringify(window.__cdp.chars[0].getPose().q)}));
    ok(/1 · Man/.test(hov.label || '') && hov.preview !== q0, `while hovering, the target says whose it is and shows the pose (“${hov.label}”)`);
    await page.mouse.up(); await page.waitForTimeout(600);
    const dr = await A(() => ({active: window.__cdp.chars.indexOf(window.__cdp.mq), preset: window.__cdp.state.posePreset, toast: document.querySelector('#hint .undo')?.textContent}));
    ok(dr.active === 0 && dr.preset === 'victoria' && dr.toast === 'Undo', 'dropped: that character takes the pose and becomes active, the toast offers Undo');
    await page.click('#hint .undo'); await page.waitForTimeout(500);
    ok(await A(q => JSON.stringify(window.__cdp.chars[0].getPose().q) === q, q0), 'Undo in the toast puts the old pose back');
    // dropped outside: nothing changes
    const q1 = await A(() => JSON.stringify(window.__cdp.chars.map(m => m.getPose().q)));
    await drag('#poseGrid .pose[data-id="victoria"]', {x: 300, y: 12}); await page.mouse.up(); await page.waitForTimeout(400);
    ok(await A(q => JSON.stringify(window.__cdp.chars.map(m => m.getPose().q)) === q, q1), 'dropped outside the canvas: nothing changes');
    // poses glide into place
    const mid = await A(() => { document.querySelector('#poseGrid .pose[data-id="salto"]').click(); return JSON.stringify(window.__cdp.mq.getPose().q); }); await page.waitForTimeout(900);
    const end = await A(() => JSON.stringify(window.__cdp.mq.getPose().q)); await page.waitForTimeout(300);
    ok(mid !== end && end === await A(() => JSON.stringify(window.__cdp.mq.getPose().q)), 'a pose picked in the panel glides into place and settles');
    // an object onto the floor where it is dropped
    await goTab(page, 'escena'); await A(() => { document.querySelector('#propChips').closest('details').open = true; }); await page.waitForTimeout(300);
    const n0 = await A(() => window.__cdp.props.length), spot = await A(() => { const r = document.querySelector('#gl').getBoundingClientRect(); return {x: r.left + r.width * .2, y: r.top + r.height * .85}; });
    await drag('#propChips > .chips .chip[data-v]', spot); await page.mouse.up(); await page.waitForTimeout(500);
    const pr = await A(s => { const C = window.__cdp, g = C.props[C.props.length - 1], r = document.querySelector('#gl').getBoundingClientRect(), p = g.position.clone().project(C.camera); return {n: C.props.length, dx: Math.abs(r.left + (p.x + 1) / 2 * r.width - s.x), y: g.position.y}; }, spot);
    ok(pr.n === n0 + 1 && pr.dx < 40 && pr.y < .01, `an object lands on the floor where it is dropped (${Math.round(pr.dx)} px off)`);
    // a colour onto a garment
    await goTab(page, 'ropa'); await A(() => ['#outfitChips', '#dropColors'].forEach(s => { document.querySelector(s).closest('details').open = true; })); await page.click('#outfitChips .chip:nth-child(3)'); await page.waitForTimeout(3500);
    await drag('#dropColors button:nth-child(9)', await at(1, 'chest'));
    const hovC = await A(() => document.querySelector('.dndtarget.hot span')?.textContent); await page.mouse.up(); await page.waitForTimeout(500);
    const tint = await A(() => { const m = window.__cdp.chars[1], g = m.garments.find(g => g.spec.mode === 'tint'); return g && g.spec.colA; });
    ok(/Dye/.test(hovC || '') && tint === await A(() => document.querySelector('#dropColors button:nth-child(9)').dataset.c), `a colour dropped on a garment dyes it (${hovC} → ${tint})`);
    // right click: what can be done there
    const c2 = await at(1, 'hipL'); await page.mouse.click(c2.x, c2.y, {button: 'right'}); await page.waitForTimeout(300);
    const menu = await A(() => [...document.querySelectorAll('#ctxMenu button span')].map(s => s.textContent));
    ok(menu.includes('Mirror the pose') && menu.includes('Duplicate'), `right click on a character: its menu (${menu.length} items)`);
    const nC = await A(() => window.__cdp.chars.length); await page.click('#ctxMenu button:has-text("Duplicate")'); await page.waitForTimeout(1500);
    ok(await A(() => window.__cdp.chars.length) === nC + 1, 'Duplicate from the menu adds a copy');
    // Ctrl+K finds anything
    await page.keyboard.press('Control+k'); await page.waitForTimeout(200); await page.keyboard.type('forest'); await page.waitForTimeout(200);
    const found = await A(() => [...document.querySelectorAll('#palList li .pl')].map(l => l.textContent));
    await page.keyboard.press('Enter'); await page.waitForTimeout(2500);
    ok(found[0] === 'Forest' && await A(() => window.__cdp.state.env) === 'bosque', `search: “forest” → ${found.slice(0, 3).join(', ')}; Enter opens it`);
    // sliders: type a value, double click resets
    await goTab(page, 'camara'); await A(() => document.querySelectorAll('.page section[data-tab=camara] details.sec').forEach(d => d.open = true)); await page.waitForTimeout(300);
    const sl = await A(() => { document.querySelector('#roll').parentElement.querySelector('output').click(); return document.activeElement && document.activeElement.classList.contains('slnum'); });
    await page.keyboard.type('20'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
    const typed = await A(() => ({out: document.querySelector('#roll').parentElement.querySelector('output').textContent, v: +document.querySelector('#roll').value}));
    await A(() => document.querySelector('#roll').dispatchEvent(new MouseEvent('dblclick', {bubbles: true}))); await page.waitForTimeout(100);
    const reset = await A(() => document.querySelector('#roll').parentElement.querySelector('output').textContent);
    ok(sl && typed.v === 20 && reset === '0°', `a slider takes a typed value (${typed.out}) and double click resets it (${reset})`);
    ok(!page.errors.length, 'no errors' + (page.errors.length ? ': ' + page.errors.join(' | ') : ''));
    await page.context().close();
    // the phone: a sheet, a finger lifting a pose onto the character, two fingers to undo
    const ph = await open(browser, {viewport: {width: 390, height: 844}, mobile: true}), P = (f, a) => ph.evaluate(f, a), cdp = await ph.context().newCDPSession(ph);
    const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints: pts.map(([x, y], i) => ({x, y, id: i}))});
    const sh = await P(() => ({snap: document.querySelector('#book').dataset.snap, canvas: document.querySelector('#gl').getBoundingClientRect().height, scroll: document.documentElement.scrollWidth - innerWidth, top: document.querySelector('header.top').getBoundingClientRect().height}));
    ok(sh.snap === 'half' && sh.canvas > 300 && sh.scroll <= 0 && sh.top < 60, `phone: the panel is a sheet and the canvas keeps ${Math.round(sh.canvas)} px`);
    await P(() => document.querySelectorAll('#book details.sec').forEach(d => { if (!d.querySelector('#poseGrid')) d.open = false; }));
    const card = await ph.$('#poseGrid .pose[data-id="victoria"]'); await card.evaluate(e => e.scrollIntoView({block: 'center', behavior: 'instant'})); await ph.waitForTimeout(400); const cb = await card.boundingBox();
    const tg = await P(() => { const C = window.__cdp, r = document.querySelector('#gl').getBoundingClientRect(), p = C.chars[0].joints.chest.getWorldPosition(new THREE.Vector3()).project(C.camera); return {x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height}; });
    const sx = cb.x + cb.width / 2, sy = cb.y + cb.height / 2, before = await P(() => JSON.stringify(window.__cdp.chars[0].getPose().q));
    await T('touchStart', [[sx, sy]]); await ph.waitForTimeout(450); for (let i = 1; i <= 12; i++) { await T('touchMove', [[sx + (tg.x - sx) * i / 12, sy + (tg.y - sy) * i / 12]]); await ph.waitForTimeout(20); }
    await ph.waitForTimeout(300); await T('touchEnd', []); await ph.waitForTimeout(700);
    ok(await P(() => window.__cdp.state.posePreset) === 'victoria', 'phone: press and hold a pose, slide it onto the character, let go');
    const r2 = await P(() => { const b = document.querySelector('#gl').getBoundingClientRect(); return {x: b.left + b.width * .6, y: b.top + b.height * .25}; });
    // software rendering can hold the second event back past the tap window: try again (it only undoes once it counts)
    for (let k = 0; k < 3 && !(await P(b => JSON.stringify(window.__cdp.chars[0].getPose().q) === b, before)); k++) { await T('touchStart', [[r2.x, r2.y], [r2.x + 50, r2.y + 20]]); await ph.waitForTimeout(40); await T('touchEnd', []); await ph.waitForTimeout(900); }
    ok(await P(b => JSON.stringify(window.__cdp.chars[0].getPose().q) === b, before), 'phone: a two-finger tap undoes');
    await ph.tap('.sheetgrip'); await ph.waitForTimeout(400);
    ok(await P(() => document.querySelector('#book').dataset.snap) === 'full', 'phone: tapping the grip raises the sheet');
    ok(!ph.errors.length, 'phone: no errors' + (ph.errors.length ? ': ' + ph.errors.join(' | ') : ''));
    await ph.context().close();
  },
  // the web app: manifest and icons, offline after the first visit, the iOS install hint and saving through the share sheet
  async web(browser) {
    const man = JSON.parse(fs.readFileSync(path.join(APP, 'manifest.webmanifest'), 'utf8'));
    const icons = man.icons.every(i => fs.existsSync(path.join(APP, i.src))) && fs.existsSync(path.join(APP, 'icons/apple-touch-icon.png'));
    ok(man.display === 'standalone' && man.start_url === './' && man.scope === './' && icons && man.icons.some(i => i.purpose === 'maskable'), 'manifest: standalone, relative scope, icons (maskable too) present');
    const off = JSON.parse(fs.readFileSync(path.join(APP, 'offline.json'), 'utf8'));
    ok(off.files.length > 400 && off.files.some(f => f[0] === 'index.html') && off.files.every(f => fs.existsSync(path.join(APP, f[0]))), `offline list: ${off.files.length} files, all there`);
    const ctx = await browser.newContext({viewport: {width: 1200, height: 800}});
    await ctx.addInitScript(() => { localStorage.setItem('cdp.welcomed', 'true'); localStorage.setItem('cdp.tipDrag', 'true'); });
    const page = await ctx.newPage(), url = `http://localhost:${server.address().port}/?pwa`; page.errors = []; page.on('pageerror', e => page.errors.push(String(e)));
    await page.goto(url); await page.waitForFunction(() => window.__cdp && window.__cdp.chars && window.__cdp.chars.length, null, {timeout: 120000});
    // the first time, the service worker takes the page over and it reloads once (keeping the scene): let it settle
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, {timeout: 60000}).catch(() => {}); await page.waitForTimeout(1500);
    await page.waitForFunction(() => window.__cdp && window.__cdp.chars && window.__cdp.chars.length, null, {timeout: 120000});
    const head = await page.evaluate(() => ({man: !!document.querySelector('link[rel=manifest]'), apple: !!document.querySelector('link[rel=apple-touch-icon]'), vp: document.querySelector('meta[name=viewport]').content}));
    ok(head.man && head.apple && /viewport-fit=cover/.test(head.vp), 'the page links the manifest and the iOS icon, and uses the whole screen');
    await page.waitForFunction(() => navigator.serviceWorker.controller || navigator.serviceWorker.ready.then(() => true), null, {timeout: 60000});
    await page.waitForTimeout(3000);
    const cached = await page.evaluate(async () => { const ks = await caches.keys(), shell = ks.find(k => k.startsWith('neopose-shell-')); return shell ? (await (await caches.open(shell)).keys()).length : 0; });
    ok(cached >= 10, `the service worker keeps the shell (${cached} files)`);
    await page.reload(); await page.waitForFunction(() => window.__cdp && window.__cdp.chars && window.__cdp.chars.length, null, {timeout: 120000}); await page.waitForTimeout(2500);
    await ctx.setOffline(true); await page.reload();
    const offline = await page.waitForFunction(() => window.__cdp && window.__cdp.chars && window.__cdp.chars.length, null, {timeout: 120000}).then(() => true, () => false);
    ok(offline, 'without a connection, the installed page still opens and builds the figure');
    await ctx.setOffline(false); await ctx.close();
    // an iPhone in Safari: the install hint; installed: files go to the share sheet
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
    for (const standalone of [false, true]) {
      const c = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, userAgent: ua});
      await c.addInitScript(sa => { localStorage.setItem('cdp.welcomed', 'true'); localStorage.setItem('cdp.tipDrag', 'true'); if (sa) Object.defineProperty(navigator, 'standalone', {get: () => true});
        window.__shared = []; navigator.canShare = () => true; navigator.share = async d => { window.__shared.push(d.files[0].name); }; }, standalone);
      const p = await c.newPage(); await p.goto(url); await p.waitForFunction(() => window.__cdp && window.__cdp.chars && window.__cdp.chars.length, null, {timeout: 120000});
      await p.waitForFunction(() => !!navigator.serviceWorker.controller, null, {timeout: 60000}).catch(() => {}); await p.waitForTimeout(1500);
      await p.waitForFunction(() => window.__cdp && window.__cdp.chars && window.__cdp.chars.length, null, {timeout: 120000});
      if (!standalone) { await p.waitForTimeout(7000); ok(await p.evaluate(() => !document.querySelector('#installHint').hidden && /Share/.test(document.querySelector('#ihText').textContent)), 'iPhone in Safari: a hint explains how to add it to the home screen'); }
      else { await p.click('#exportBtn'); await p.waitForTimeout(1500); await p.click('#exSave'); await p.waitForTimeout(2500);
        const sh = await p.evaluate(() => window.__shared); ok(sh.length === 1 && /\.png$/.test(sh[0]) && await p.evaluate(() => document.querySelector('#installHint').hidden), `installed on iPhone: saving opens the share sheet (${sh[0]}) and there is no install hint`); }
      await c.close();
    }
  },
  // free references, with the sources answered from fixtures (no network): the filters, a photo to a pose, a GIF to an
  // animation, a panorama to a set with the light from its sun
  async refs(browser) {
    const page = await open(browser), A = (f, a) => page.evaluate(f, a), FX = n => fs.readFileSync(path.join(__dirname, 'fixtures', n));
    const cors = {'access-control-allow-origin': '*'}, json = (route, o) => route.fulfill({status: 200, headers: {...cors, 'content-type': 'application/json'}, body: JSON.stringify(o)});
    const ov = (id, title) => ({id, title, url: `https://img.example.org/${id}.jpg`, creator: 'Eadweard Muybridge', creator_url: '', license: 'pdm', license_version: '1.0', license_url: 'https://creativecommons.org/publicdomain/mark/1.0/', provider: 'wikimedia', source: 'wikimedia', foreign_landing_url: 'https://commons.wikimedia.org/wiki/File:x.jpg', tags: [], width: 200, height: 400, mature: false});
    await page.route('https://api.openverse.org/v1/images/?**', r => json(r, /extension=gif|aspect_ratio/.test(r.request().url()) ? {result_count: 0, results: []} : {result_count: 2, results: [ov('man1', 'Man standing and jumping'), ov('bad1', 'Nude study')]}));
    await page.route('https://api.openverse.org/v1/images/*/thumb/**', r => r.fulfill({status: 200, headers: {...cors, 'content-type': 'image/jpeg'}, body: FX('muybridge-161-05.jpg')}));
    await page.route('https://commons.wikimedia.org/w/api.php?**', r => { const gif = /filemime%3Aimage%2Fgif|filemime:image\/gif/.test(r.request().url());
      json(r, {query: {pages: gif ? [{pageid: 77, title: 'File:Jump.gif', imageinfo: [{url: 'https://upload.wikimedia.org/jump.gif', thumburl: 'https://upload.wikimedia.org/320px-jump.gif', width: 200, height: 400, descriptionurl: 'https://commons.wikimedia.org/wiki/File:Jump.gif',
        metadata: [{name: 'frameCount', value: 4}], extmetadata: {LicenseShortName: {value: 'Public domain'}, Artist: {value: 'Muybridge'}, ObjectName: {value: 'Jumping'}}}]}] : []}}); });
    await page.route('https://upload.wikimedia.org/**', r => r.fulfill({status: 200, headers: {...cors, 'content-type': 'image/gif'}, body: FX('muybridge-161.gif')}));
    await page.route('https://api.polyhaven.com/assets?t=hdris', r => json(r, {test_sunrise: {name: 'Test sunrise', tags: ['sunrise', 'field'], categories: ['outdoor'], authors: {'Someone': 'All'}}}));
    await page.route('https://cdn.polyhaven.com/**', r => r.fulfill({status: 200, headers: {...cors, 'content-type': 'image/jpeg'}, body: FX('pano-sun.jpg')}));
    // words that are not for all ages never reach a source
    await A(() => document.querySelector('#refOpenPose').click()); await page.waitForTimeout(300); await page.fill('#refQ', 'naked'); await page.click('#refForm .btn'); await page.waitForTimeout(500);
    ok(await A(() => !document.querySelector('#refGrid .refcard') && /isn’t available/.test(document.querySelector('#refGrid').textContent)), 'a blocked search is refused before asking any source');
    await page.fill('#refQ', 'jump'); await page.click('#refForm .btn');
    await page.waitForFunction(() => document.querySelector('#refGrid .refcard:not(.pending)'), null, {timeout: 120000});
    const cards = await A(() => [...document.querySelectorAll('#refGrid .refcard')].map(c => c.title));
    ok(cards.includes('Man standing and jumping') && !cards.some(t => /Nude/.test(t)), `results: what the titles say is not for all ages is left out (${cards.join(', ')})`);
    ok(await A(() => window.__cdp.refs.REF.res.find(r => r.title === 'Man standing and jumping').checked === true), 'the on-device filter looked at the thumbnail before showing it');
    const q0 = await A(() => JSON.stringify(window.__cdp.mq.getPose().q));
    await page.click('#refGrid .refcard[title="Man standing and jumping"]'); await page.waitForTimeout(300);
    ok(await A(() => /Eadweard Muybridge|Public domain/.test(document.querySelector('#refDet .refcred').textContent)), 'the detail shows author and licence');
    await page.click('#refDet .refacts .btn.primary');
    await page.waitForFunction(() => /\S/.test(document.querySelector('#photoCredit').textContent), null, {timeout: 120000}); await page.waitForTimeout(500);
    ok(await A(q => JSON.stringify(window.__cdp.mq.getPose().q) !== q && document.querySelector('#refModal').hidden, q0), 'a reference becomes the pose of the active character, and its credit stays with it');
    // a GIF: into the drawings-to-animation window, frame by frame
    await A(() => window.__cdp.refs.openRefs('anim')); await page.waitForTimeout(300); await page.fill('#refQ', 'jump'); await page.click('#refForm .btn');
    await page.waitForFunction(() => document.querySelector('#refGrid .refcard:not(.pending)'), null, {timeout: 120000});
    await page.click('#refGrid .refcard:not(.pending)'); await page.waitForTimeout(300); await page.click('#refDet .refacts .btn.primary');
    await page.waitForFunction(() => !document.querySelector('#sbModal').hidden && window.__cdp.board.BD.clip && !window.__cdp.board.BD.busy, null, {timeout: 180000}).catch(() => {});
    const bd = await A(() => ({kind: window.__cdp.board.BD.kind, n: (window.__cdp.board.BD.frames || []).length, poses: (window.__cdp.board.BD.frames || []).filter(f => f.pose).length, clip: !!window.__cdp.board.BD.clip}));
    ok(bd.kind === 'video' && bd.n >= 4 && bd.poses >= bd.n / 2 && bd.clip, `a GIF is read like a video: ${bd.n} frames, ${bd.poses} with a pose, ready to animate`);
    await A(() => { document.querySelector('#sbModal').hidden = true; });
    // a panorama: the set, and the key light from its sun (u = .25, 36° up in the fixture)
    await A(() => window.__cdp.refs.openRefs('scene')); await page.waitForTimeout(300); await page.fill('#refQ', 'sunrise'); await page.click('#refSrc .chip[data-v="polyhaven"]');
    await page.waitForFunction(() => document.querySelector('#refGrid .refcard[data-id^="ph:"]:not(.pending)'), null, {timeout: 60000});
    await page.click('#refGrid .refcard[data-id^="ph:"]'); await page.waitForTimeout(300); await page.click('#refDet .refacts .btn.primary');
    await page.waitForFunction(() => /^ref_/.test(window.__cdp.state.env) && window.__cdp.panoReady(), null, {timeout: 60000}); await page.waitForTimeout(500);
    const L = await A(() => window.__cdp.state.light);
    ok(Math.abs(((L.az + 540) % 360) - 180) < 6 && Math.abs(L.el - 36) < 6, `the key light comes from the panorama's sun (az ${L.az}°, el ${L.el}°)`);
    ok(!page.errors.length, 'no errors' + (page.errors.length ? ': ' + page.errors.join(' | ') : ''));
    await page.context().close();
  },
  // from a script to a film: reading (Fountain and the quick way, seven languages), voices, staging, cameras, the window
  async script(browser) {
    const page = await open(browser, {lang: 'es'}), A = (f, a) => page.evaluate(f, a);
    const parse = await A(() => { const S = window.__cdp.script, P = S.parseScript('Title: Prueba\nAuthor: X\n\n.CASA DE ANA\n\nANA (V.O.)\n(susurrando)\nHola. [[nota]]\n\n/* fuera */\nBOB ^\nAdiós.\n\nCUT TO:\n\nINT. BAR - NOCHE\n\nANA: ¿Vienes?\nBob: Ya voy.\n');
      return {title: P.title, scenes: P.scenes.map(s => [s.head.place, s.head.time, s.beats.map(b => b.k + (b.who ? ':' + b.who : '') + (b.emo ? '(' + b.emo + ')' : '')).join(',')]), names: [...P.names.values()].map(n => n.name)}; });
    ok(parse.title === 'Prueba' && parse.scenes.length === 2 && parse.scenes[0][0] === 'CASA DE ANA' && parse.scenes[1][0] === 'BAR' && parse.scenes[1][1] === 'NOCHE', `scenes and headings (${JSON.stringify(parse.scenes.map(s => s[0] + '/' + s[1]))})`);
    ok(/paren:Ana,line:Ana/.test(parse.scenes[0][2]) && /line:Bob/.test(parse.scenes[0][2]) && /trans/.test(parse.scenes[0][2]) && parse.scenes[1][2] === 'line:Ana,line:Bob' && parse.names.join() === 'Ana,Bob', `cues with extensions, parentheticals, transitions, notes, the boneyard and "NAME: line" (${parse.scenes.map(s => s[2]).join(' / ')})`);
    const acts = await A(() => { const S = window.__cdp.script, cast = [{name: 'Luis', preset: 'hombre', body: {gender: 1}}, {name: 'Ana', preset: 'mujer', body: {gender: 0}}], r = (t, l) => S.readAction(t, cast, l, {last: null, lastOther: null, present: [0, 1]}).map(a => a.unknown ? '?' : a.who.join('+') + ':' + a.id + (a.target != null ? '>' + a.target : '')).join(' ');
      return [r('Luis entra y se acerca a ella.', 'es'), r('Luis se levanta, coge el abrigo y sale corriendo.', 'es'), r('Ana golpea a Luis y él cae al suelo.', 'es'), r('Luis mira a Ana y sonríe.', 'es'), r('Ana no se sienta.', 'es'), r('Luis shrugs and sits down.', 'en'), r('Ana hugs him.', 'en'),
        r('Luis entre et s\'assoit.', 'fr'), r('Ana abraça en Luis.', 'ca'), r('Luis geht hinaus.', 'de'), r('Ana saluta e si siede.', 'it'), r('Luis acena e senta-se.', 'pt')]; });
    const want = ['0:enter 0:approach>1', '0:stand 0:pick 0:exit', '1:punch>0 0:fall', '0:face>1 0:smile', '', '0:shrug 0:sit', '1:hug>0', '0:enter 0:sit', '1:hug>0', '0:exit', '1:wave 1:sit', '0:wave 0:sit'];
    acts.forEach((a, i) => ok(a === want[i], `action ${i + 1}: «${['entra y se acerca', 'se levanta, coge, sale corriendo', 'golpea / él cae', 'mira a Ana y sonríe', 'no se sienta', 'shrugs, sits down', 'hugs him', 'entre, s\'assoit', 'abraça', 'geht hinaus', 'saluta, si siede', 'acena, senta-se'][i]}» → ${a || '(nada)'}`));
    const misc = await A(() => { const S = window.__cdp.script; return {emo: [S.emotionOf('enfadada'), S.emotionOf('smiling'), S.emotionOf('a gritos')], shot: [S.shotDirection('PRIMER PLANO DE ANA'), S.shotDirection('WIDE SHOT'), S.shotDirection('CONTRAPICADO')], lang: [S.scLang('El perro de la casa se va con su amo'), S.scLang('The dog leaves the house with his owner')],
      place: [S.placeOf({place: 'COCINA'}), S.placeOf({place: 'THE OLD PUB'}), S.placeOf({place: 'Bosque oscuro'})], time: [S.timeOf({time: 'NOCHE'}), S.timeOf({time: 'SUNSET'})]}; });
    ok(misc.emo.join() === 'enfado,sonrisa,grito' && misc.shot[0].size === 'cu' && misc.shot[1].size === 'ws' && misc.shot[2].angle === 'low' && misc.lang.join() === 'es,en' && misc.place.join() === 'cocina,taberna,bosque' && misc.time.join() === 'noche,atardecer', `faces, camera words, language, places and times (${JSON.stringify(misc.place)})`);
    // the voice
    const v = await A(async () => { const S = window.__cdp.script; try { const r = await S.sayLine('Hola, me llamo Ana.', 'es', {g: 'f', v: 2, p: 60, r: 168}); return {n: r.pcm.length, dur: r.dur, words: r.words.length}; } catch (e) { return {err: String(e)}; } });
    ok(v.n > 10000 && v.dur > .6 && v.words >= 4, `the voice says a line on this device (${v.dur && v.dur.toFixed(2)} s, ${v.words} words)`);
    // the whole sample through the window
    await page.click('#animBtn'); await page.waitForTimeout(400); await page.click('#tlScript'); await page.waitForTimeout(200); await page.click('#scSample');
    await page.click('#scGo');
    await page.waitForFunction(() => window.__cdp.ANIM.shots.length > 3 && !document.querySelector('#scGo').disabled, null, {timeout: 240000});
    const film = await A(() => { const C = window.__cdp, A = C.ANIM; return {n: A.shots.length, names: A.shots.map(s => s.name), env: [...new Set(A.shots.map(s => s.scene.extras.env))], amb: A.shots[0].scene.extras.amb, secs: A.shots.reduce((a, s) => a + s.len, 0) / A.fps,
      lines: A.shots.flatMap(s => s.lines).filter(l => !l.cont).length, timed: A.shots.flatMap(s => s.lines).every(l => l.w && l.voice && l.lang === 'es'), cams: A.shots.every(s => s.cam.length >= 1), keys: A.shots.every(s => s.keys.every(K => K.length >= s.len - 1)),
      warn: document.querySelector('#scWarn').textContent, chairs: A.shots.some(s => s.scene.extras.props.some(p => /silla/.test(p.t || p.type || JSON.stringify(p))))}; });
    ok(film.n >= 6 && /situación/.test(film.names[0]) && film.env.join() === 'cocina,parque' && film.amb === 'interior', `the film: ${film.n} shots, ${film.secs.toFixed(1)} s, sets ${film.env.join(' → ')} (${film.names.slice(0, 4).join(' | ')}…)`);
    ok(film.lines === 4 && film.timed && film.cams && film.keys, `every line is said with its voice and timed word by word; every shot has its camera and every frame its pose`);
    ok(film.names.some(n => /hombro|Plano medio|primer plano/i.test(n)) && film.names.some(n => /dos|general/i.test(n)) && film.chairs, 'the camera follows film grammar (establishing, over the shoulder or singles, two-shots) and Luis has a chair to sit on');
    ok(!film.warn, 'the sample is understood without warnings' + (film.warn ? ': ' + film.warn : ''));
    // no pops: no arm or head turns in one frame while it is all but still in the frames either side (as they did when
    // someone started or stopped talking); a fast move such as a jump for joy turns a lot over several frames running
    const [jump, where] = await A(() => { const A = window.__cdp.ANIM, Q = THREE.Quaternion; let w = 0, at = '';
      for (const [si, s] of A.shots.entries()) for (const [ci, K] of s.keys.entries()) for (const j of ['shoulderL', 'elbowL', 'shoulderR', 'elbowR', 'head']) {
        const v = []; for (let i = 1; i < K.length; i++) { const a = new Q().fromArray(K[i - 1].pose.q[j] || [0, 0, 0, 1]), b = new Q().fromArray(K[i].pose.q[j] || [0, 0, 0, 1]); v.push(2 * Math.acos(Math.min(1, Math.abs(a.dot(b)))) * 180 / Math.PI); }
        for (let i = 1; i < v.length - 1; i++) if (Math.max(v[i - 1], v[i + 1]) < v[i] * .3 && v[i] > w) { w = v[i]; at = `shot ${si + 1}, character ${ci + 1}, ${j}, frame ${i}`; } }
      return [w, at]; });
    ok(jump < 20, `the film flows: no arm or head jumps in a frame between still ones (${Math.round(jump)}°${jump >= 20 ? ' at ' + where : ''})`);
    // talking like people: the turn to whoever speaks is shared down the spine (no owl necks), everyone blinks, the mouth
    // goes from vowel to vowel instead of chattering letter by letter
    const talk = await A(() => { const C = window.__cdp, A = C.ANIM, Q = THREE.Quaternion, ys = []; let n = 0, d = 0;
      for (const s of A.shots) for (const K of s.keys) for (const k of K) ys.push(Math.abs(new THREE.Euler().setFromQuaternion(new Q().fromArray(k.pose.q.neck).multiply(new Q().fromArray(k.pose.q.head)), 'YXZ').y) * 180 / Math.PI);
      ys.sort((a, b) => a - b); const neck = ys[Math.floor(ys.length * .9)];  // (most of the time: a look around turns the head further for a moment)
      for (const s of A.shots) for (const l of s.lines) { let p = null; for (let f = l.f; f < l.f + l.len; f++) { const m = C.mouthAt(l, f), j = m ? m.jaw : 0; if (p != null) { d += Math.abs(j - p); n++; } p = j; } }
      let blinks = 0; for (let t = 0; t < 20; t += 1 / 24) if (C.blinkAt(0, t, false) > .99) blinks++;
      return {neck, step: d / Math.max(1, n), blinks}; });
    ok(talk.neck < 35 && talk.step < 4.5 && talk.blinks >= 3, `talking: the head is turned ${Math.round(talk.neck)}° or less on the chest 90% of the time, the jaw moves ${talk.step.toFixed(1)}° a frame, ${talk.blinks} frames of closed eyes in 20 s`);
    // talking with the hands: while a line is said the speaker's arms come up into gestures (elbows bent, hands in front),
    // in phrases that change (not one movement repeated), and the hands go back down when the talking is over
    const ges = await A(() => { const A = window.__cdp.ANIM, Q = THREE.Quaternion, bend = p => Math.max(...['elbowL', 'elbowR'].map(j => 2 * Math.acos(Math.min(1, Math.abs((p.q[j] || [0, 0, 0, 1])[3]))) * 180 / Math.PI));
      let on = 0, n = 0, after = 0, na = 0; const seen = new Set();
      for (const s of A.shots) for (const l of s.lines) { const K = s.keys[l.c]; if (!K) continue;
        for (let f = Math.max(0, l.f + 4); f < Math.min(K.length, l.f + l.len - 2); f++) { const b = bend(K[f].pose); n++; if (b > 40) on++; seen.add(Math.round(b / 10)); }
        const later = s.lines.some(x => x.c === l.c && x !== l && x.f > l.f && x.f < l.f + l.len + 2.5 * A.fps) || s.lines.some(x => x.c !== l.c && x.f < l.f + l.len + 2.5 * A.fps && x.f + x.len > l.f + l.len);
        const g = l.f + l.len + Math.round(1.6 * A.fps); if (!later && g < K.length) { na++; if (bend(K[g].pose) < 40) after++; } }
      return {share: on / Math.max(1, n), kinds: seen.size, after, na}; });
    ok(ges.share > .5 && ges.kinds >= 5 && (!ges.na || ges.after / ges.na > .6), `talking hands: arms up in gestures ${Math.round(ges.share * 100)} % of the time a line is said, ${ges.kinds} different elbow angles, down again after ${ges.after} of ${ges.na} lines`);
    // the video is rendered frame by frame into an MP4 behind a window, with the voices, and leaves the app as it was
    const vid = await A(async () => { const C = window.__cdp, V = C.video, o = URL.createObjectURL, a0 = HTMLAnchorElement.prototype.click; let blob = null, shown = false;
      URL.createObjectURL = b => { blob = b; return o.call(URL, b); }; HTMLAnchorElement.prototype.click = function () {};
      const obs = new MutationObserver(() => { if (!document.querySelector('#renderModal').hidden) shown = true; }); obs.observe(document.querySelector('#renderModal'), {attributes: true});
      const talky = C.ANIM.shots.findIndex(x => x.lines.some(l => l.text.trim())); if (talky >= 0 && talky !== C.ANIM.cur) await C.script.enterShot(talky, 0);
      C.EXK.vres = '720'; const cur = C.ANIM.cur, s = C.ANIM.shots[cur]; await V.exportVideo('shot'); obs.disconnect(); URL.createObjectURL = o; HTMLAnchorElement.prototype.click = a0;
      if (!blob) return {err: 'no file'};
      const u = new Uint8Array(await blob.arrayBuffer()), dv = new DataView(u.buffer), top = []; for (let i = 0; i < u.length;) { const n = dv.getUint32(i); top.push(String.fromCharCode(...u.slice(i + 4, i + 8))); if (n < 8) break; i += n; }
      const txt = new TextDecoder('latin1').decode(u.slice(0, Math.min(u.length, 400000))), stsz = txt.indexOf('stsz'), frames = stsz > 0 ? dv.getUint32(stsz + 12) : 0;
      return {top: top.join(','), traks: txt.split('trak').length - 1, codec: txt.includes('avcC') ? 'H.264' : txt.includes('vpcC') ? 'VP9' : null, frames, want: Math.round(s.len / C.ANIM.fps * 30), shown, hidden: document.querySelector('#renderModal').hidden, rec: C.ANIM.rec, cur: C.ANIM.cur === cur, busy: V.VID.busy}; });
    ok(vid.top === 'ftyp,moov,mdat' && vid.traks === 2 && vid.codec && Math.abs(vid.frames - vid.want) <= 1, `video: an MP4 (${vid.top}) with picture (${vid.codec}, ${vid.frames} frames at 30/s for ${vid.want}) and voices${vid.err ? ' ' + vid.err : ''}`);
    ok(vid.shown && vid.hidden && !vid.rec && vid.cur && !vid.busy, 'video: rendered behind a window that closes when it is done, the film back where it was');
    const wav = await A(async () => { const b = await window.__cdp.script.dialogueWav(); return String.fromCharCode(...b.slice(0, 4)) + ' ' + b.length; });
    ok(/^RIFF \d+/.test(wav) && +wav.split(' ')[1] > 100000, `the dialogue as a WAV (${wav})`);
    // a film that does not stall at its cuts, and whose shots are not all alike
    const cuts = await A(async () => { const C = window.__cdp, A = C.ANIM, S = C.script; let builds = 0; const M = C.chars[0].constructor, ob = M.prototype.build; M.prototype.build = function (...a) { builds++; return ob.apply(this, a); };
      await S.enterShot(0, 0); A.playing = true; const ms = [];
      for (let i = 1; i < A.shots.length; i++) { await new Promise(r => setTimeout(r, 150)); const t0 = performance.now(); await S.enterShot(i, 0); ms.push(performance.now() - t0); }
      A.playing = false; M.prototype.build = ob;
      const moving = A.shots.filter(s => s.cam.length > 1).length, lenses = new Set(A.shots.map(s => Math.round(s.cam[0].c.f / 4))).size, kinds = new Set(A.shots.map(s => s.name.split('·')[1].trim())).size;
      return {worst: Math.max(...ms), mean: ms.reduce((a, x) => a + x, 0) / ms.length, builds, moving: moving / A.shots.length, lenses, kinds}; });
    ok(cuts.builds === 0 && cuts.mean < 40, `playing through the cuts rebuilds nobody and takes ${cuts.mean.toFixed(0)} ms a cut (worst ${cuts.worst.toFixed(0)} ms)`);
    ok(cuts.moving > .6 && cuts.lenses >= 5 && cuts.kinds >= 6, `the shots are not all alike: ${Math.round(cuts.moving * 100)} % of them move, ${cuts.lenses} lens lengths, ${cuts.kinds} kinds and sizes of shot`);
    // the set and the look come from what the script says
    const lab = await A(async () => { const S = window.__cdp.script; const r = await S.scriptToFilm('INT. LABORATORIO - NOCHE\n\nUn laboratorio lleno de tubos de ensayo y pantallas. La científica ANA lleva una bata blanca, pelirroja y con coleta.\n\nANA\nYa casi está.\n\nAna observa una muestra.\n', {cams: false, online: false});
      const A = window.__cdp.ANIM, c = A.shots[0].scene.chars[0]; return {warn: r.warn, env: A.shots[0].scene.extras.env, outfit: c.outfit.map(g => g.id), hair: c.body.hair, col: c.body.hairCol}; });
    ok(lab.env === 'laboratorio' && (lab.outfit.includes('c1412') || lab.outfit.includes('c157')) && lab.hair === 'h-ponytail01' && lab.col === '#8a3a1c' && !lab.warn.length, `a lab scene: the lab set, Ana in a lab coat with a red ponytail, nothing misunderstood (${lab.env}, ${lab.outfit.join('+')}, ${lab.hair} ${lab.col}${lab.warn.length ? ', ' + lab.warn.join(' | ') : ''})`);
    ok(!page.errors.length, 'no errors' + (page.errors.length ? ': ' + page.errors.join(' | ') : ''));
    await page.context().close();
  },
  // scripts of every kind (genres, the seven languages, Fountain, «NAME: line», plays, no headings, sound effects in
  // capitals, introductions with ages): the cast and nobody else, how each one looks, the sets, nothing misunderstood
  // the three spaces: each shows its own tabs and buttons; the switcher, Alt+1/2/3, A and a tab asked for from
  // anywhere move between them; the timeline is Animación's; the phone keeps one line on top
  async spaces(browser) {
    const page = await open(browser), A = fn => page.evaluate(fn);
    const vis = () => A(() => [...document.querySelectorAll('.tabs .tab')].filter(t => !t.hidden).map(t => t.dataset.tab).join(','));
    ok(await A(() => document.body.dataset.ws) === 'static' && await vis() === 'pose,dibujo,escena,luz,camara,comic', `starts in Static: ${await vis()}`);
    await page.click('#wsChars'); await page.waitForTimeout(400);
    const c = await vis(), top = await A(() => ['#sketchBtn', '#practiceBtn', '#openIn', '#exportBtn'].map(s => getComputedStyle(document.querySelector(s)).display !== 'none'));
    ok(c === 'cuerpo,ropa,escena,biblia' && !top[0] && !top[1] && top[2] && top[3], `Characters & places: ${c}; sketch and practice belong to Static`);
    await page.click('#animBtn'); await page.waitForTimeout(600);
    ok(await A(() => window.__cdp.ANIM.open && document.body.dataset.ws === 'anim' && !document.querySelector('#timeline').hidden), 'Animation opens the timeline');
    await page.click('#animBtn'); await page.waitForTimeout(500);
    ok(await A(() => !window.__cdp.ANIM.open && document.body.dataset.ws === 'chars'), 'Animation again: back to the space it came from, timeline closed');
    await page.keyboard.press('Alt+Digit2'); await page.waitForTimeout(300); const s2 = await A(() => document.body.dataset.ws);
    await page.keyboard.press('a'); await page.waitForTimeout(500); const s3 = await A(() => document.body.dataset.ws);
    await page.keyboard.press('a'); await page.waitForTimeout(500); const s4 = await A(() => document.body.dataset.ws);
    ok(s2 === 'static' && s3 === 'anim' && s4 === 'static', `Alt+2 → ${s2}, A → ${s3}, A → ${s4}`);
    await goTab(page, 'ropa'); await page.waitForTimeout(400);
    ok(await A(() => document.body.dataset.ws === 'chars' && !document.querySelector('section[data-tab=ropa]').hidden), 'a tab asked for from anywhere brings its space (Ropa → Characters)');
    await page.keyboard.press('Alt+Digit2'); await page.keyboard.press('2'); await page.waitForTimeout(300);
    ok(await A(() => window.__cdp.state.tab) === 'dibujo', 'number keys count the visible tabs (2 in Static = Dibujo)');
    await page.reload(); await page.waitForFunction(() => window.__cdp && window.__cdp.chars && window.__cdp.chars.length); await page.waitForTimeout(600);
    ok(await A(() => document.body.dataset.ws === 'static' && window.__cdp.state.tab === 'dibujo'), 'the space and its tab come back after a reload');
    ok(!page.errors.filter(e => !/VALIDATE_STATUS|Too many attributes/.test(e)).length, 'no errors');
    await page.screenshot({path: path.join(OUT, 'spaces-desktop.png')});
    await page.context().close();
    const ph = await open(browser, {viewport: {width: 390, height: 844}, mobile: true}), P = fn => ph.evaluate(fn);
    for (const w of ['chars', 'static', 'anim']) {
      await ph.evaluate(w => window.__cdp.spaces.setWorkspace(w), w); await ph.waitForTimeout(600);
      const m = await P(() => ({h: document.querySelector('header.top').getBoundingClientRect().height, x: document.documentElement.scrollWidth - innerWidth, tabs: [...document.querySelectorAll('.tabs .tab')].filter(t => !t.hidden).length}));
      ok(m.h < 60 && m.x <= 0 && m.tabs === {chars: 4, static: 6, anim: 6}[w], `phone, ${w}: top bar ${Math.round(m.h)} px, no sideways scroll, ${m.tabs} tabs`);
      await ph.screenshot({path: path.join(OUT, `spaces-phone-${w}.png`)});
    }
    await ph.context().close();
  },
  // comic and manga pages: panels are shots seen at one frame, drawn in the key drawings' line; balloons point at their
  // speakers; a panel is set up in 3D and given back; pages come from the film, linked; pages export for print
  async comic(browser) {
    const page = await open(browser), A = fn => page.evaluate(fn);
    await goTab(page, 'comic'); await page.waitForTimeout(600);
    const s0 = await A(() => { const K = window.__cdp.comic, c = K.comic(); return {view: !document.querySelector('#pageView').hidden, pages: c.pages.length, panels: c.pages[0].panels.length, rtl: c.rtl, order: K.readingOrder(c.pages[0]).slice(0, 2).map(p => p.x)}; });
    ok(s0.view && s0.pages === 1 && s0.panels === 4 && s0.rtl && s0.order[0] > s0.order[1], `the Cómic tab shows a manga page of 4 panels, read right to left (first at x ${Math.round(s0.order[0])} mm)`);
    // a panel from what the canvas shows, drawn in line
    const d = await A(async () => { const C = window.__cdp, K = C.comic, p = K.comic().pages[0].panels[0]; K.CM.sel = p; document.querySelector('#cmFromStage').click();
      const k = 2; await K.CM.queue; const px = [Math.round(p.w * k), Math.round(p.h * k)]; window.__cdp.comic.CM.cache.clear();
      const img = await K.pageImage(K.comic().pages[0], 50.8); const hit = [...K.CM.cache.values()][0]; const g = hit.img.getContext('2d'), id = g.getImageData(0, 0, hit.img.width, hit.img.height).data; let ink = 0, white = 0;
      for (let i = 0; i < id.length; i += 4) { const L = id[i] * .3 + id[i + 1] * .59 + id[i + 2] * .11; if (L < 60) ink++; else if (L > 200) white++; }
      return {shot: !!p.shot, w: img.width, h: img.height, ink: ink / (id.length / 4), white: white / (id.length / 4), anchors: hit.anchors.filter(Boolean).length, px}; });
    ok(d.shot && d.w === Math.round(182 / 25.4 * 50.8) && d.ink > .002 && d.white > .3 && d.anchors >= 1, `a panel from the canvas, drawn in line (${(d.ink * 100).toFixed(1)} % ink, ${(d.white * 100).toFixed(0)} % paper), its speaker's head found; page ${d.w}×${d.h} px`);
    // set up in 3D: the panel keeps the new pose, the canvas gets its own back
    const e = await A(async () => { const C = window.__cdp, K = C.comic, p = K.comic().pages[0].panels[0], m = C.chars[0], before = JSON.stringify(m.getPose().q.chest);
      await K.editPanel(p); const editing = !!K.CM.edit && document.querySelector('#pageView').hidden; m.joints.chest.rotation.y += .6; m.group.updateMatrixWorld(true);
      await K.finishPanelEdit(); const after = JSON.stringify(C.chars[0].getPose().q.chest);
      return {editing, kept: JSON.stringify(p.shot.keys[0][0].pose.q.chest) !== before, back: after === before}; });
    ok(e.editing && e.kept && e.back, 'a panel set up in 3D keeps its new pose; the canvas gets its own picture back');
    // a balloon: kind, text, speaker
    await goTab(page, 'comic'); await page.waitForTimeout(300);
    await A(() => { const K = window.__cdp.comic; K.CM.sel = K.comic().pages[0].panels[0]; document.querySelector('#cmAddB').click(); });
    await page.fill('#cmText', '¡Hola!'); await page.click('#cmKind .chip[data-v="shout"]');
    const b = await A(() => { const p = window.__cdp.comic.comic().pages[0].panels[0], b = p.balloons[0]; return b && {text: b.text, kind: b.kind, ci: b.ci}; });
    ok(b && b.text === '¡Hola!' && b.kind === 'shout' && b.ci === 0, `a balloon: «${b && b.text}», ${b && b.kind}, said by character ${b && b.ci + 1}`);
    // pages from the film, linked to its shots
    await page.click('#animBtn'); await page.waitForTimeout(300);
    const txt = fs.readFileSync(path.join(__dirname, 'anim-scripts', 'a04-drama.es.txt'), 'utf8');
    const f = await page.evaluate(async t => { const C = window.__cdp; C.script.VOICE.on = false; await C.script.scriptToFilm(t, {cams: true, online: false}); return C.ANIM.shots.length; }, txt);
    await page.click('#wsStatic'); await goTab(page, 'comic'); await page.waitForTimeout(300);
    const L = await A(async () => { const K = window.__cdp.comic, n = await K.filmToComic(); const P = K.comic().pages.flatMap(p => p.panels), linked = P.filter(p => p.link), said = P.reduce((a, p) => a + p.balloons.length, 0);
      const p = linked[0], s = K.panelShot(p), k0 = K.panelKey(p, 100, 100); s.rev = (s.rev || 0) + 1; const k1 = K.panelKey(p, 100, 100);
      return {n, linked: linked.length, said, follows: k0 !== k1}; });
    ok(L.n === f && L.linked === f && L.said >= 2 && L.follows, `${L.n} panels from the ${f} shots of the film, linked (a change in the film redraws them), ${L.said} balloons from its lines`);
    // print: the page at 300 dpi; saved in the .neopose and back
    const x = await A(async () => { const K = window.__cdp.comic, C = window.__cdp, cv = await K.pageImage(K.comic().pages[0], 300);
      const bytes = await C.file.neoposeBytes('t'), n = K.comic().pages.length; C.project.applyProjectState(null);
      await C.file.openNeopose(new File([bytes], 't.neopose')); return {w: cv.width, h: cv.height, n, back: C.project.PROJECT.comic && C.project.PROJECT.comic.pages.length}; });
    ok(x.w === 2150 && x.h === 3035 && x.back === x.n, `a manga page at 300 dpi is ${x.w}×${x.h} px (B5); the ${x.n} pages come back from the .neopose file`);
    ok(!page.errors.filter(e => !/VALIDATE_STATUS|Too many attributes/.test(e)).length, 'no errors' + (page.errors.filter(e => !/VALIDATE_STATUS|Too many attributes/.test(e)).slice(0, 2).join(' | ').slice(0, 300)));
    await page.screenshot({path: path.join(OUT, 'comic-desktop.png')});
    await page.context().close();
    const ph = await open(browser, {viewport: {width: 390, height: 844}, mobile: true});
    await goTab(ph, 'comic'); await ph.waitForTimeout(800);
    const m = await ph.evaluate(() => ({x: document.documentElement.scrollWidth - innerWidth, view: !document.querySelector('#pageView').hidden, h: document.querySelector('#pageView').getBoundingClientRect().height}));
    ok(m.view && m.x <= 0 && m.h > 150, `phone: the page shows (${Math.round(m.h)} px tall), no sideways scroll`);
    await ph.screenshot({path: path.join(OUT, 'comic-phone.png')});
    await ph.context().close();
  },
  // the comic desk: gutters and corners dragged on the page, layouts that keep what the panels hold, pictures swapped
  // by dragging, undo and redo, the row of pages (new, copied, reordered, their state), the page's script (the same
  // words as the balloons), one click into a panel's scene and back
  async comicdesk(browser) {
    const page = await open(browser), A = fn => page.evaluate(fn);
    await goTab(page, 'comic'); await page.waitForTimeout(900);
    const at = async (pi, i, fx = .5, fy = .5) => page.evaluate(([pi, i, fx, fy]) => { const K = window.__cdp.comic, p = K.comic().pages[pi].panels[i], R = K.panelScreenRect(p), b = document.querySelector('#pageView').getBoundingClientRect(); if (!R) throw new Error('no rect ' + JSON.stringify({pi, i, page: K.CM.page, shown: K.pv.pages.map(e => e.i), n: K.comic().pages.length, view: !document.querySelector('#pageView').hidden})); return {x: b.left + R.x + R.w * fx, y: b.top + R.y + R.h * fy, R}; }, [pi, i, fx, fy]);
    const d0 = await A(async () => { const K = window.__cdp.comic, pg = K.comic().pages[0]; for (const p of pg.panels) { K.CM.sel = p; document.querySelector('#cmFromStage').click(); } K.CM.sel = null; await K.CM.queue;
      return {tools: !!document.querySelector('#pvTools'), cards: document.querySelectorAll('#pvTrack .pvcard').length, script: !document.querySelector('#pvScript').hidden, rows: document.querySelectorAll('#pvScript .pvs-row').length, layouts: document.querySelectorAll('#cmLayouts .preset').length}; });
    ok(d0.tools && d0.cards === 1 && d0.script && d0.rows === 4 && d0.layouts >= 20, `the desk: its toolbar, ${d0.cards} page in the row, the page's script (${d0.rows} panels), ${d0.layouts} layouts to choose`);
    // a gutter dragged: both rows follow, the gutter keeps its width
    const g0 = await A(() => { const K = window.__cdp.comic, P = K.comic().pages[0].panels; return P.map(p => [p.x, p.w]); });
    const a = await at(0, 0), b = await at(0, 1), gx = (Math.min(a.R.x + a.R.w, b.R.x + b.R.w) + Math.max(a.R.x, b.R.x)) / 2 + (a.x - a.R.x - a.R.w * .5);
    await page.mouse.move(gx, a.y); await page.waitForTimeout(150); await page.mouse.down(); await page.mouse.move(gx + 50, a.y, {steps: 8}); await page.mouse.up(); await page.waitForTimeout(300);
    const g1 = await A(() => { const K = window.__cdp.comic, P = K.comic().pages[0].panels; return P.map(p => [p.x, p.w]); });
    const gap = P => { const [A0, B0] = [P[0], P[1]].sort((u, v) => u[0] - v[0]); return B0[0] - (A0[0] + A0[1]); };
    const moved = g1.filter((q, i) => Math.abs(q[1] - g0[i][1]) > 3).length;
    ok(moved === 4 && Math.abs(gap(g1) - gap(g0)) < .2, `a gutter dragged: the ${moved} panels along it follow, the gutter stays ${gap(g1).toFixed(1)} mm`);
    // a corner of the chosen panel dragged: it slants, and the corner across the gutter goes with it
    const c = await at(0, 0, .5, .5); await page.mouse.click(c.x, c.y); await page.waitForTimeout(150);
    const cn = await A(() => { const K = window.__cdp.comic, p = K.comic().pages[0].panels[0], P = K.panelPts(p), b = document.querySelector('#pageView').getBoundingClientRect(), R = K.panelScreenRect(p), B = K.panelBox(p);
      // its lower inner corner (towards the page's middle)
      const j = P.map((q, i) => [i, Math.abs(q[0] - K.comic().page.w / 2) - q[1]]).sort((u, v) => u[1] - v[1])[0][0], q = P[j];
      return {x: b.left + R.x + (q[0] - B.x) / B.w * R.w, y: b.top + R.y + (q[1] - B.y) / B.h * R.h}; });
    await page.mouse.move(cn.x, cn.y); await page.waitForTimeout(100); await page.mouse.down(); await page.mouse.move(cn.x + 4, cn.y + 30, {steps: 6}); await page.mouse.up(); await page.waitForTimeout(200);
    const sl = await A(() => window.__cdp.comic.comic().pages[0].panels.filter(p => p.poly).length);
    ok(sl >= 2, `a corner dragged: ${sl} panels slant together`);
    // a layout over full panels: the pictures keep their order, the shapes glide
    const L = await A(() => { const K = window.__cdp.comic, pg = K.comic().pages[0], ids = K.readingOrder(pg).map(p => p.id + ':' + (p.shot && p.shot.id)); document.querySelector('#cmLayouts .preset[data-v="s5"]').click();
      const tw = K.CM.tw.size, now = K.readingOrder(pg).map(p => p.id + ':' + (p.shot && p.shot.id)); return {n: pg.panels.length, kept: ids.every((x, i) => now[i] === x), tw}; });
    ok(L.n === 5 && L.kept && L.tw >= 4, `a layout of 5 on a page of 4: the pictures keep their order, ${L.tw} panels glide to their new shapes`);
    await page.waitForTimeout(700);
    // undo and redo
    await page.mouse.click(30, 400); await page.keyboard.press('Control+z'); await page.waitForTimeout(200); const u1 = await A(() => window.__cdp.comic.comic().pages[0].panels.length);
    await page.keyboard.press('Control+Shift+z'); await page.waitForTimeout(200); const u2 = await A(() => window.__cdp.comic.comic().pages[0].panels.length);
    ok(u1 === 4 && u2 === 5, `Ctrl+Z gives back the ${u1} panels; Ctrl+Mayús+Z the ${u2} again`);
    await page.waitForTimeout(700);
    // a picture dragged onto another panel: they swap
    const s0 = await A(() => window.__cdp.comic.comic().pages[0].panels.map(p => p.shot ? p.shot.id : '-').join());
    const p0 = await at(0, 0, .5, .7), p4 = await at(0, 4, .5, .5);
    await page.mouse.move(p0.x, p0.y); await page.mouse.down(); await page.mouse.move((p0.x + p4.x) / 2, (p0.y + p4.y) / 2, {steps: 6}); await page.mouse.move(p4.x, p4.y, {steps: 6});
    const drop = await A(() => !!window.__cdp.comic.pv.drop && !!window.__cdp.comic.pv.ghost); await page.mouse.up(); await page.waitForTimeout(200);
    const s1 = await A(() => window.__cdp.comic.comic().pages[0].panels.map(p => p.shot ? p.shot.id : '-').join());
    const x0 = s0.split(','), x1 = s1.split(',');
    ok(drop && x1[0] === x0[4] && x1[4] === x0[0], `a picture dragged onto an empty panel (its ghost in the hand, the target marked): moved there (${x0[0]} → panel 5)`);
    // the row of pages: a new page from the gallery, copied, moved first, its state advanced; one taken out
    const t = await A(async () => { const K = window.__cdp.comic, c = K.comic(); document.querySelector('#pvTrack .pvadd').click(); const pop = !document.querySelector('#pvPresets').hidden;
      document.querySelector('#cmTemplates .preset[data-v="hero"]').click(); await new Promise(r => setTimeout(r, 200)); const n1 = c.pages.length, cur = K.CM.page;
      K.duplicatePage(c.pages[1]); await new Promise(r => setTimeout(r, 200));
      const st = document.querySelector('#pvTrack .pvcard .st'); st.click(); st.click();
      return {pop, n1, cur, n2: c.pages.length, hero: c.pages[1].panels.length, status: c.pages[0].status, cards: document.querySelectorAll('#pvTrack .pvcard').length}; });
    ok(t.pop && t.n1 === 2 && t.cur === 1 && t.n2 === 3 && t.hero === 4 && t.status === 'tinta' && t.cards === 3, `a page from the gallery (Alta + 3), then a copy: ${t.cards} cards in the row; the first page's state advanced to «${t.status}»`);
    await page.waitForTimeout(500);
    // a card dragged to the front of the row
    await page.waitForFunction(() => !document.getAnimations().some(x => x.playState === 'running' && x.effect && x.effect.target && x.effect.target.closest && x.effect.target.closest('#pvTrack')), null, {timeout: 15000}).catch(() => {});
    const cards = await A(() => [...document.querySelectorAll('#pvTrack .pvcard')].map(el => { const r = el.getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + r.height / 2, id: el.dataset.id}; }));
    await page.mouse.move(cards[2].x, cards[2].y); await page.mouse.down(); await page.mouse.move(cards[0].x - 20, cards[2].y, {steps: 10}); await page.mouse.up(); await page.waitForTimeout(500);
    const ord = await A(() => window.__cdp.comic.comic().pages.map(p => p.id));
    ok(ord[0] === cards[2].id && ord.length === 3, 'a page dragged to the front of the row goes first in the book' + (ord[0] === cards[2].id ? '' : ` ${JSON.stringify(cards)} ${ord}`));
    // the page's script: a line typed is the balloon on the page; the comic's script as text
    await A(() => { const K = window.__cdp.comic; K.goPage(K.comic().pages.findIndex(pg => pg.panels.some(p => p.shot)), {force: true}); });
    await page.waitForTimeout(400);
    await A(() => document.querySelector('#pvScript .pvs-row .addln').click()); await page.waitForTimeout(100);
    await page.keyboard.type('Hello there'); await A(() => { const n = document.querySelector('#pvScript .pvs-row .note'); n.value = 'A rooftop at dusk.'; n.dispatchEvent(new Event('input')); n.dispatchEvent(new Event('change')); });
    const sc = await A(() => { const K = window.__cdp.comic, pg = K.comic().pages[K.CM.page], b = pg.panels.flatMap(p => p.balloons).find(x => x.text === 'Hello there'); return {b: !!b, text: K.comicScriptText()}; });
    ok(sc.b && /PAGE 1/.test(sc.text) && /PANEL 1\nA rooftop at dusk\./.test(sc.text) && /Hello there/.test(sc.text), 'a line typed in the script is a balloon on the page; the script comes out as PAGE / PANEL / lines' + (sc.b ? '' : ' (no balloon)') + ' ' + JSON.stringify(sc.text.slice(0, 200)));
    // one click into a panel's scene, and back
    const cp = await A(() => window.__cdp.comic.CM.page), e1 = await at(cp, 0); await page.mouse.move(e1.x, e1.y); await page.mouse.click(e1.x, e1.y); await page.waitForTimeout(200);
    const bar = await A(() => !document.querySelector('#pvBar').hidden); await A(() => document.querySelector('#pvBar [data-act=edit]').click()); await page.waitForTimeout(1500);
    const ed = await A(() => ({edit: !!window.__cdp.comic.CM.edit, page: !document.querySelector('#pageView').hidden})); await A(() => document.querySelector('#cmBack').click()); await page.waitForTimeout(800);
    const bk = await A(() => ({edit: !!window.__cdp.comic.CM.edit, page: !document.querySelector('#pageView').hidden}));
    ok(bar && ed.edit && !ed.page && !bk.edit && bk.page, 'the panel\'s toolbar opens its scene in one click; «Back to the page» returns to the desk');
    // keys: the next page, a balloon removed
    const k = await A(async () => { const K = window.__cdp.comic; K.goPage(0, {force: true}); return K.CM.page; }); await page.mouse.click(30, 400); await page.keyboard.press('PageDown'); await page.waitForTimeout(200);
    const k2 = await A(() => window.__cdp.comic.CM.page);
    ok(k === 0 && k2 === 1, 'Av Pág turns to the next page');
    ok(!page.errors.filter(e => !/VALIDATE_STATUS|Too many attributes/.test(e)).length, 'no errors' + (page.errors.filter(e => !/VALIDATE_STATUS|Too many attributes/.test(e)).slice(0, 2).join(' | ').slice(0, 300)));
    await page.screenshot({path: path.join(OUT, 'comic-desk.png')});
    await page.context().close();
    const ph = await open(browser, {viewport: {width: 390, height: 844}, mobile: true});
    await goTab(ph, 'comic'); await ph.waitForTimeout(900);
    const m = await ph.evaluate(() => ({x: document.documentElement.scrollWidth - innerWidth, track: !!document.querySelector('#pvTrack') && document.querySelector('#pvTrack').getBoundingClientRect().width <= innerWidth, tools: document.querySelector('#pvTools').getBoundingClientRect().right <= innerWidth + 1}));
    ok(m.x <= 0 && m.track && m.tools, 'phone: the desk\'s toolbar and the row of pages fit, no sideways scroll');
    await ph.screenshot({path: path.join(OUT, 'comic-desk-phone.png')});
    await ph.context().close();
  },
  // the shapes of comics: slanted pages, panels split straight and slanted, set into others, bled off the paper, broken
  // out of; every kind of border and balloon; joined balloons drawn as one outline
  async comicshapes(browser) {
    const page = await open(browser), A = fn => page.evaluate(fn);
    await goTab(page, 'comic'); await page.waitForTimeout(600);
    // slanted templates: polygons inside the live area, none over another, the gutter between them
    const t = await A(() => { const K = window.__cdp.comic, c = K.comic(), P = c.page, out = {};
      for (const k of ['s3', 's4', 's5', 'big', 'p4']) { const L = K.layoutPanels(k, c), pts = L.map(p => K.panelPts(p)); let over = 0, outside = 0;
        for (const [i, a] of pts.entries()) { for (const [x, y] of a) if (x < P.margin[3] - .05 || x > P.w - P.margin[1] + .05 || y < P.margin[0] - .05 || y > P.h - P.margin[2] + .05) outside++;
          for (const [j, b] of pts.entries()) if (i !== j) { const cx = b.reduce((s, q) => s + q[0], 0) / b.length, cy = b.reduce((s, q) => s + q[1], 0) / b.length; if (K.inPoly(a, cx, cy)) over++; for (const [x, y] of b) { const m = (x0, y0) => K.inPoly(a, x0, y0); if (m(x, y)) over++; } } }
        out[k] = {n: L.length, slanted: L.filter(p => p.poly).length, over, outside}; }
      return out; });
    ok(t.s3.n === 3 && t.s4.n === 4 && t.s5.n === 5 && t.big.n === 3 && t.s5.slanted >= 4 && t.p4.slanted === 0 && Object.values(t).every(x => !x.over && !x.outside), `slanted pages: ${t.s3.n}, ${t.s4.n}, ${t.s5.n} and ${t.big.n} panels (${t.s5.slanted} of 5 slanted), inside the margins, none over another; the straight ones stay rectangles`);
    // a panel split across, down and slanted: the halves apart by the gutter; the first keeps the shot
    const sp = await A(() => { const K = window.__cdp.comic, c = K.comic(), pg = c.pages[0]; pg.panels = K.layoutPanels('p1', c); const p = pg.panels[0]; K.CM.sel = p;
      document.querySelector('#cmFromStage').click(); const a0 = Math.abs(K.polyArea(K.panelPts(p)));
      document.querySelector('#cmCuts [data-v="s1"]').click(); const n1 = pg.panels.length, q = pg.panels[1];
      const gap = (() => { const A = K.panelPts(p), B = K.panelPts(q); let d = 1e9; for (const [x, y] of A) for (const [u, v] of B) d = Math.min(d, Math.hypot(x - u, y - v)); return d; })();
      K.CM.sel = q; document.querySelector('#cmCuts [data-v="v"]').click(); const n2 = pg.panels.length;
      const tot = pg.panels.reduce((s, x) => s + Math.abs(K.polyArea(K.panelPts(x))), 0);
      // the one under a point is the one drawn there
      const m = K.panelBox(pg.panels[2]), at = K.panelAt(pg, m.x + m.w / 2, m.y + m.h * .6);
      return {n1, n2, slanted: !!p.poly && !!q.poly, kept: !!p.shot && !q.shot, gap, ratio: tot / a0, at: at === pg.panels[2] || at === pg.panels[1]}; });
    ok(sp.n1 === 2 && sp.n2 === 3 && sp.slanted && sp.kept && sp.gap > 2 && sp.ratio > .9 && sp.ratio < 1 && sp.at, `a panel split slanted, then one half split down: ${sp.n2} panels, the gutter between them (${sp.gap.toFixed(1)} mm), ${(sp.ratio * 100).toFixed(0)} % of the panel kept; the first keeps the picture`);
    // borders, inset, bleed, breaking out: all drawn
    const bd = await A(async () => { const K = window.__cdp.comic, c = K.comic(), pg = c.pages[0], p = pg.panels[0];
      const res = {}; for (const [v] of K.PANEL_BORDERS) { p.border = v || undefined; const cv = document.createElement('canvas'); cv.width = 400; cv.height = 560; const g = cv.getContext('2d'); K.composePage(g, pg, 400 / c.page.w, 0, 0, {part: 'borders'});
        const d = g.getImageData(0, 0, 400, 560).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 128) n++; res[v || 'ink'] = n; }
      delete p.border;
      K.CM.sel = p; document.querySelector('#cmInset').click(); const ins = pg.panels.find(x => x.inset), pb = K.panelBox(p), ib = K.panelBox(ins);
      p.bleed = true; const bb = K.panelBox(p); delete p.bleed;
      p.breakout = true; K.CM.cache.clear(); await K.pageImage(pg, 60); const hit = [...K.CM.cache.values()].find(h => h.out);
      return {res, inset: ib.x > pb.x && ib.x + ib.w < pb.x + pb.w + .01 && ib.y + ib.h < pb.y + pb.h + .01 && K.panelAt(pg, ib.x + ib.w / 2, ib.y + ib.h / 2) === ins, bleed: bb.y < 0 || bb.x < 0, out: hit && Math.round(hit.out.width / hit.img.width * 100) / 100}; });
    const r = bd.res;
    for (const k in r) if (k !== 'none') r[k] -= r.none;  // (the page's other panels keep their ink border)
    ok(r.ink > 0 && r.thick > r.ink * 1.5 && r.rough > 0 && r.round > 0 && r.cloud > r.ink && r.dashed < r.ink && bd.inset && bd.bleed && bd.out === 1.35, `borders: ink ${r.ink}, thick ${r.thick}, by hand ${r.rough}, rounded ${r.round}, cloud ${r.cloud}, dashed ${r.dashed} px; an inset panel on top in its corner; bled to the paper; the figures ${bd.out}× wider to break out`);
    // every kind of balloon, and joined ones: one outline, a neck, no line between them
    const bl = await A(() => { const K = window.__cdp.comic, kinds = Object.keys(K.BALLOON_KINDS), cv = document.createElement('canvas'); cv.width = 900; cv.height = 300; const g = cv.getContext('2d'), R = {x: 0, y: 0, w: 900, h: 300};
      const drawn = kinds.map(kind => { g.clearRect(0, 0, 900, 300); K.drawBalloons(g, [{id: 'b' + kind, kind, text: 'Hola, ¿qué tal?', ci: 0, x: .5, y: .5, size: 9}], R, [{x: .5, y: .95}], 5, null); const d = g.getImageData(0, 0, 900, 300).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 128) n++; return n; });
      const two = (join) => { g.clearRect(0, 0, 900, 300); const a = {id: 'a', kind: 'speech', text: 'Uno', ci: null, x: .3, y: .5, size: 9}, b = {id: 'b', kind: 'speech', text: 'Dos', ci: null, x: .62, y: .5, size: 9, ...(join ? {join: 'a'} : {})};
        const hits = K.drawBalloons(g, [a, b], R, null, 5, null), A0 = hits[0].box, B0 = hits[1].box, mid = g.getImageData(Math.round((A0.x + A0.w + B0.x) / 2), 150, 1, 1).data, edge = g.getImageData(Math.round(A0.x + A0.w) - 3, 150, 7, 1).data;
        let ink = false; for (let i = 0; i < edge.length; i += 4) if (edge[i + 3] > 100 && edge[i] < 100) ink = true;
        return {mid: mid[3] > 0 && mid[0] > 200, edgeInk: ink}; };
      return {drawn, kinds, apart: two(false), joined: two(true)}; });
    ok(bl.drawn.every(n => n > 500) && bl.kinds.length >= 9 && !bl.apart.mid && bl.apart.edgeInk && bl.joined.mid && !bl.joined.edgeInk, `${bl.kinds.length} kinds of balloon drawn (${bl.kinds.map((k, i) => k + ' ' + bl.drawn[i]).join(', ')}); two joined balloons are one outline with a neck, no line between`);
    // in the tab: a joined balloon added, its tail off the panel, taken out again
    const ui = await A(() => { const K = window.__cdp.comic, pg = K.comic().pages[0], p = pg.panels[0]; K.CM.sel = p; document.querySelector('#cmAddB').click(); const b = K.CM.selB;
      document.querySelector('#cmTail .chip[data-v="off"]').click(); document.querySelector('#cmJoinAdd').click(); const j = K.CM.selB;
      const r = {tail: b.tail, join: j.join === b.id && j.tail === 'none', unjoin: !document.querySelector('#cmUnjoin').hidden};
      K.CM.selB = b; document.querySelector('#cmDelB').click(); r.after = p.balloons.length === 1 && !p.balloons[0].join; return r; });
    ok(ui.tail === 'off' && ui.join && ui.unjoin && ui.after, 'in the tab: a tail out of the panel, a balloon joined to it (no tail of its own); the first taken out, the second stands alone');
    // saved and back, then right to left: the outlines mirrored
    const sv = await A(async () => { const C = window.__cdp, K = C.comic, pg = K.comic().pages[0], before = JSON.stringify(pg.panels.map(p => p.poly || null));
      const bytes = await C.file.neoposeBytes('t'); C.project.applyProjectState(null); await C.file.openNeopose(new File([bytes], 't.neopose'));
      const pg2 = K.comic().pages[0], back = JSON.stringify(pg2.panels.map(p => p.poly || null)) === before; const p = pg2.panels.find(x => x.poly), x0 = p.poly[0][0];
      const rtl = document.querySelector('#cmRtl'); rtl.checked = !rtl.checked; rtl.dispatchEvent(new Event('change')); const x1 = p.poly[p.poly.length - 1][0];
      return {back, mirrored: Math.abs(x1 - (K.comic().page.w - x0)) < .01}; });
    ok(sv.back && sv.mirrored, 'slanted panels come back from the .neopose file, and mirror when the page reads the other way');
    ok(!page.errors.filter(e => !/VALIDATE_STATUS|Too many attributes/.test(e)).length, 'no errors' + (page.errors.filter(e => !/VALIDATE_STATUS|Too many attributes/.test(e)).slice(0, 2).join(' | ').slice(0, 300)));
    await A(() => { const K = window.__cdp.comic; K.CM.sel = null; document.querySelector('#cmTemplates .chip[data-v="s5"]').click(); });
    await page.waitForTimeout(800); await page.screenshot({path: path.join(OUT, 'comic-shapes.png')});
    await page.context().close();
  },
  // the project shared by the three spaces: a cast and places kept once (and used by the script), changes carried to
  // every shot; the film's format; a comic script made into its film and its pages; the comic's print formats
  async project(browser) {
    const page = await open(browser), A = fn => page.evaluate(fn);
    // the cast: the active character into the bible as «Ana»; a film from a script that names her uses her design
    await goTab(page, 'biblia'); await page.waitForTimeout(400);
    const c0 = await A(() => { const C = window.__cdp; C.chars[0].body.height = .92; C.chars[0].build(C.chars[0].body); const c = C.bible.bibleCastFromActive('Ana'); return {id: c.id, n: C.project.PROJECT.cast.length, cards: document.querySelectorAll('#bbCast .bbcard').length, thumb: !!c.thumb}; });
    ok(c0.n === 1 && c0.cards === 1 && c0.thumb, 'the active character in the bible as «Ana», with her portrait');
    await page.click('#animBtn'); await page.waitForTimeout(300);
    const f = await A(async () => { const C = window.__cdp; C.script.VOICE.on = false; await C.script.scriptToFilm(C.script.SC_SAMPLE.es, {cams: true, online: false});
      const ana = C.ANIM.shots[1].scene.chars.find(x => x.body.castId); return {h: ana && ana.body.height, id: ana && ana.body.castId}; });
    ok(f.id === c0.id && Math.abs(f.h - .92) < .01, `the script's ANA is the bible's Ana (her height ${f.h})`);
    // changed in the bible: changed in every shot
    const pr = await A(() => { const C = window.__cdp, c = C.project.PROJECT.cast[0]; c.body = {...c.body, height: .3}; const n = C.project.propagateCast(c.id); const hs = C.ANIM.shots.flatMap(s => s.scene.chars.filter(x => x.body.castId === c.id).map(x => x.body.height)); return {n, hs}; });
    ok(pr.n.shots >= 2 && pr.hs.every(h => h === .3), `a change in the bible reaches ${pr.n.shots} shots`);
    // a place saved with its view, applied again
    const pl = await A(async () => { const C = window.__cdp; C.setEnv('cafeteria'); await new Promise(r => setTimeout(r, 400)); const l = C.bible.saveLocation('Bar de Ana'); C.setEnv('bosque'); await C.bible.applyLocation(l); return {env: C.state.env, n: C.project.PROJECT.locations.length}; });
    ok(pl.env === 'cafeteria' && pl.n === 1, 'a place saved in the bible and gone back to');
    // the film's format: the same picture on any window
    const fm = await A(() => { const C = window.__cdp; document.querySelector('#fpFormat .chip[data-v="2.39"]').click(); return {aspect: C.camera.aspect, ratio: C.state.ratio, list: document.querySelectorAll('#fpShots .fpshot').length, shots: C.ANIM.shots.length}; });
    ok(Math.abs(fm.aspect - 2.39) < .01 && fm.ratio === '_film' && fm.list === fm.shots, `the film in cinemascope (camera ${fm.aspect.toFixed(2)}:1); the Película tab lists its ${fm.list} shots`);
    // a comic script: one shot per panel, a page per PAGE, linked panels with the lines in balloons
    await page.evaluate(() => document.querySelector('#fpFormat .chip[data-v=""]').click());
    const txt = fs.readFileSync(path.join(__dirname, 'comic-scripts', 'c01-manga.es.txt'), 'utf8');
    await page.evaluate(() => document.querySelector('#tlScript').click()); await page.waitForTimeout(400);
    await page.fill('#scText', txt); await page.dispatchEvent('#scText', 'input'); await page.waitForTimeout(100);
    const tg = await A(() => window.__cdp.script.SC.target);
    await page.click('#scGo'); await page.waitForTimeout(300); if (await A(() => window.__cdp.script.SC.armed)) await page.click('#scGo');  // (a film is there: the second click replaces it)
    await page.waitForFunction(() => window.__cdp.project.PROJECT.comic && window.__cdp.project.PROJECT.comic.pages.some(p => p.panels.some(x => x.link)), null, {timeout: 600000});
    const cm = await A(() => { const C = window.__cdp, P = C.project.PROJECT.comic.pages; return {shots: C.ANIM.shots.length, pages: P.map(p => p.panels.length), linked: P.every(p => p.panels.every(x => x.link)), balloons: P.flatMap(p => p.panels).reduce((a, x) => a + x.balloons.length, 0), ws: document.body.dataset.ws, tab: C.state.tab}; });
    ok(tg === 'both' && cm.shots === 7 && cm.pages.join() === '3,4' && cm.linked && cm.balloons === 5 && cm.ws === 'static' && cm.tab === 'comic', `a manga script makes its film (${cm.shots} shots, one per panel) and its pages (${cm.pages.join(' + ')} panels, linked, ${cm.balloons} balloons)`);
    // a sound on the page, a panel's background, and the pages out: PDF, CBZ, PSD
    const ex = await A(async () => { const C = window.__cdp, K = C.comic, pg = K.comic().pages[1];
      K.CM.sel = pg.panels[0]; document.querySelector('#cmBg .chip[data-v="speed"]').click(); document.querySelector('#cmSfxNew').value = 'ZAS'; document.querySelector('#cmSfxAdd').click();
      const pdf = await C.comicx.comicPDF(72), cbz = await C.comicx.comicCBZ(72), psd = await C.comicx.comicPSD(pg, 72), t = new TextDecoder('latin1');
      return {bg: pg.panels[0].bg, sfx: (K.comic().pages[K.CM.page].sfx || []).map(x => x.text).join(), pdf: t.decode(pdf.slice(0, 5)), pages: (t.decode(pdf).match(/\/Type \/Page\b/g) || []).length, cbz: t.decode(cbz).includes('ComicInfo.xml') && t.decode(cbz).includes('YesAndRightToLeft'), psd: t.decode(psd.slice(0, 4)), layers: new DataView(psd.buffer, psd.byteOffset).getInt16(26 + 4 + 4 + 4 + 4)}; });
    ok(ex.bg === 'speed' && ex.sfx === 'ZAS' && ex.pdf === '%PDF-' && ex.pages === 2 && ex.cbz && ex.psd === '8BPS', `speed lines and «${ex.sfx}» on a page; a ${ex.pages}-page PDF, a CBZ read right to left, a PSD in layers`);
    ok(!page.errors.filter(e => !/VALIDATE_STATUS|Too many attributes/.test(e)).length, 'no errors' + page.errors.filter(e => !/VALIDATE_STATUS|Too many attributes/.test(e)).slice(0, 2).join(' | ').slice(0, 300));
    await page.screenshot({path: path.join(OUT, 'project-comic.png')});
    await page.context().close();
  },
  // the key poses of a film drawn in line: found in the motion, exported with a timing sheet and an exposure sheet; the
  // camera and light of a shot restyled from the timeline
  async keylines(browser) {
    const page = await open(browser), A = fn => page.evaluate(fn);
    await page.click('#animBtn'); await page.waitForTimeout(300);
    const txt = fs.readFileSync(path.join(__dirname, 'anim-scripts', 'a01-pelea.es.txt'), 'utf8');
    const r = await page.evaluate(async t => { const C = window.__cdp, S = C.script; S.VOICE.on = false; await S.scriptToFilm(t, {cams: true, online: false});
      const A = C.ANIM, k = C.keys, out = {fps: A.fps, shots: A.shots.length, lit: A.shots.filter(s => s.light && s.light.auto).length, moods: [...new Set(A.shots.map(s => s.light && s.light.auto))]};
      await S.enterShot(5, 0); const s = A.shots[5], K = k.shotKeyPoses(s, false), KB = k.shotKeyPoses(s, true);
      out.keys = K.map(x => x.f); out.len = s.len; out.bd = 0; for (let i = 0; i < A.shots.length; i++) { await S.enterShot(i, 0); out.bd += k.shotKeyPoses(A.shots[i], true).filter(x => x.kind === 'bd').length; } void KB;
      return out; }, txt);
    ok(r.fps === 24 && r.lit === r.shots && r.moods.includes('noche'), `a script film at 24 fps, every shot lit with a mood (${r.moods.join(', ')})`);
    ok(r.keys[0] === 0 && r.keys[r.keys.length - 1] === r.len - 1 && r.keys.length >= 3 && r.keys.length < r.len / 4 && r.bd >= 1, `the keys of a fight shot found in the motion: ${r.keys.length} in ${r.len} frames (${r.keys.join(', ')}), ${r.bd} breakdowns in the film`);
    // the camera and the light of a shot, restyled and back
    const c = await A(() => { const C = window.__cdp, s = C.ANIM.shots[3], n0 = s.cam.length, p0 = JSON.stringify(s.cam[0]);
      document.querySelector('#tlMotion').click(); const pick = (id, v) => document.querySelector(`#${id} .chip[data-v="${v}"]`).click();
      pick('mvmCam', 'fija'); const fija = C.ANIM.shots[C.ANIM.cur].cam.length; pick('mvmCam', 'mano'); const mano = C.ANIM.shots[C.ANIM.cur].cam.length; pick('mvmCam', 'tal'); const back = JSON.stringify(C.ANIM.shots[C.ANIM.cur].cam[0]);
      pick('mvmLight', 'drama'); const L = C.ANIM.shots[C.ANIM.cur].light.mood; pick('mvmLight', 'ninguna'); const off = C.ANIM.shots[C.ANIM.cur].key;
      return {fija, mano, same: back === JSON.stringify(C.ANIM.shots[C.ANIM.cur].camBase[0]), L, off, n0, p0: !!p0}; });
    ok(c.fija === 1 && c.mano > 2 && c.same && c.L === 'drama' && c.off === 0, `the shot's camera still (1 key), handheld (${c.mano} keys) and back as it was; its light dramatic, then the set's alone`);
    // the export: a folder of numbered key drawings, the timing sheet and the CSV
    await page.click('#exportBtn'); await page.waitForTimeout(800);
    await page.click('#exKind .chip[data-v="anim"]'); await page.click('#exAnimWhat .chip[data-v="keylines"]'); await page.click('#exAnimRange .chip[data-v="shot"]'); await page.waitForTimeout(1500);
    const note = await A(() => document.querySelector('#exAnimNote').textContent), shown = await A(() => !document.querySelector('#exKeyRow').hidden && document.querySelector('#exImg').naturalWidth > 0);
    ok(/key/i.test(note) && shown, `the window explains it and shows the first key: «${note.slice(0, 90)}…»`);
    const [z] = await Promise.all([page.waitForEvent('download', {timeout: 300000}), page.click('#exSave')]);
    const zb = fs.readFileSync(await z.path()).toString('latin1'), keys = [...zb.matchAll(/(\d\d-[\w-]+\/K\d\d-f\d{4}\.png)/g)].map(m => m[1]);
    ok(/\.zip$/.test(z.suggestedFilename()) && keys.length >= 2 && /timing-sheet\.png/.test(zb) && /exposure-sheet\.csv/.test(zb), `${z.suggestedFilename()}: ${new Set(keys).size} key drawings, a timing sheet and an exposure sheet`);
    ok(!page.errors.filter(e => !/VALIDATE_STATUS|Too many attributes/.test(e)).length, 'no errors' + (page.errors.length ? ': ' + page.errors.slice(0, 2).join(' | ').slice(0, 200) : ''));
    await page.context().close();
  },
  async scripts(browser) {
    const page = await open(browser, {lang: 'es'}), A = (f, a) => page.evaluate(f, a), DIR = path.join(__dirname, 'scripts'), EXP = JSON.parse(fs.readFileSync(path.join(DIR, 'expect.json'), 'utf8'));
    await page.click('#animBtn'); await page.waitForTimeout(400);
    for (const [file, e] of Object.entries(EXP)) {
      const txt = fs.readFileSync(path.join(DIR, file), 'utf8');
      const r = await A(async t => { const C = window.__cdp, S = C.script, v = S.VOICE.on; S.VOICE.on = false;
        try { const r = await S.scriptToFilm(t, {cams: true, online: false}); const A = C.ANIM, sets = [], empty = []; let last = null;
          for (const s of A.shots) { const k = s.name.match(/^(\d+)/)[1]; if (k !== last) { sets.push(s.scene.extras.env); last = k; } if (s.empty && !empty.includes(+k)) empty.push(+k); }
          return {cast: r.cast.map(c => ({name: c.name, g: c.body.gender < .5 ? 'F' : 'M', age: c.body.age ?? 1, height: c.body.height ?? .5, species: c.body.species, kemo: c.body.kemo, hair: c.body.hair, hairCol: c.body.hairCol, wear: (c.outfit || []).map(g => g.id)})), warn: r.warn, sets, empty, shots: A.shots.length};
        } catch (err) { return {err: String(err && err.stack || err)}; } finally { S.VOICE.on = v; } }, txt);
      if (r.err) { ok(false, `${file}: ${r.err.slice(0, 200)}`); continue; }
      const names = r.cast.map(c => c.name), bad = [];
      for (const [n, want] of Object.entries(e.who || {})) { const c = r.cast.find(x => x.name === n); if (!c) { bad.push(n + ' missing'); continue; }
        if (want.g && c.g !== want.g) bad.push(`${n} ${c.g}`); if (want.species && c.species !== want.species) bad.push(`${n} ${c.species}`); if (want.kemo && c.kemo !== want.kemo) bad.push(`${n} kemo ${c.kemo}`);
        if (want.hairCol && c.hairCol !== want.hairCol) bad.push(`${n} hair ${c.hairCol}`); if (want.bald && c.hair !== '') bad.push(`${n} not bald`); if (want.tall && !(c.height > .7)) bad.push(`${n} not tall`);
        if (want.old && !(c.age > 1.6)) bad.push(`${n} not old`); if (want.kid && !(c.age < .6)) bad.push(`${n} not a child`); if (want.bare && c.wear.length) bad.push(`${n} dressed`); if (want.older && !(c.age > 1.15)) bad.push(`${n} too young`);
        for (const id of want.wear || []) if (!c.wear.includes(id)) bad.push(`${n} without ${id}`); }
      ok(names.slice().sort().join('|') === e.cast.slice().sort().join('|') && !bad.length, `${file}: cast ${names.join(', ')}${bad.length ? ' — ' + bad.join(', ') : ''}`);
      ok(r.sets.join() === e.sets.join() && (e.empty || []).join() === r.empty.join() && r.shots >= r.sets.length, `${file}: sets ${r.sets.join(' → ')}${r.empty.length ? ', scene ' + r.empty.join() + ' with nobody' : ''}, ${r.shots} shots`);
      ok(!r.warn.length, `${file}: nothing misunderstood${r.warn.length ? ': ' + r.warn.slice(0, 3).join(' | ') : ''}`);
    }
    ok(!page.errors.length, 'no errors' + (page.errors.length ? ': ' + page.errors.join(' | ') : ''));
    await page.context().close();
  },
  // the timeline: select (click, Shift, box, a whole clip), delete, move, Alt-copy, copy/paste, interpolation, menu, zoom, keys
  // anthro characters in depth: species by family, coats and markings, tails (shape, carriage, expressions, a living
  // tail in animation), pads, a furry cast from a script, tail and ears in the BVH
  async furry(browser) {
    const page = await open(browser), A = (f, a) => page.evaluate(f, a);
    await goTab(page, 'cuerpo'); await page.waitForTimeout(400);
    const n = await A(() => ({chips: document.querySelectorAll('#speciesChips .chip').length, fams: document.querySelectorAll('#speciesChips .famlbl').length}));
    ok(n.chips >= 19 && n.fams === 5, `species by family (${n.chips} species in ${n.fams} families)`);
    await A(() => document.querySelector('#speciesChips .chip[data-v="zorro"]').click()); await page.waitForTimeout(3500);
    const fox = await A(() => { const m = window.__cdp.mq, U = m.lib.uFur; return {on: U.uFurOn.value, base: '#' + U.uFurC0.value.getHexString(), socks: U.uFurM.value[2], tip: U.uFurM.value[5], tail: m.hasTail, ears: m.hasEars}; });
    ok(fox.on === 1 && fox.base === '#c9652b' && fox.socks === 2 && fox.tip === 1, `a fox wears a red fox's coat: dark socks, white tail tip (${fox.base})`);
    ok(fox.tail && fox.ears, 'it has a tail and ears to pose');
    // marks cycle light → dark → off
    const mark = async () => { await A(() => document.querySelector('#coatMarks .chip[data-v="stripes"]').click()); await page.waitForTimeout(150); return A(() => window.__cdp.mq.lib.uFur.uFurM.value[7]); };
    const cyc = [await mark(), await mark(), await mark()];
    ok(cyc.join() === '1,2,0', `a marking chip goes light, dark, off (${cyc.join()})`);
    await A(() => { const i = document.querySelector('#coatCols input[data-k="0"]'); i.value = '#336699'; i.dispatchEvent(new Event('input')); i.dispatchEvent(new Event('change')); });
    ok(await A(() => '#' + window.__cdp.mq.lib.uFur.uFurC0.value.getHexString() === '#336699' && window.__cdp.mq.body.coat.c[0] === '#336699'), 'a colour well recolours the coat and the body keeps it');
    await A(() => document.querySelector('#coatChips .chip[data-v=""]').click()); await page.waitForTimeout(200);
    ok(await A(() => window.__cdp.mq.lib.uFur.uFurOn.value === 0 && window.__cdp.mq.body.coat === null), '“No colour” takes the coat off');
    // pads (leather) and claws (keratin) are there, as their own kinds
    const kinds = await A(() => { const out = new Set(); for (const a of window.__cdp.mq.acc) { const e = a.geometry.attributes.aEye; if (!e || a.userData.hull) continue; const w = -e.array[3]; if (w > 1.5) out.add(Math.floor(w) - 1); } return [...out].sort().join(); });
    ok(/2/.test(kinds) && /3/.test(kinds), `paw pads and claws are there (kinds ${kinds})`);
    // tail: shape, length, none
    const tlen = () => A(() => window.__cdp.mq.tail[1].position.length());
    const l0 = await tlen(); await A(() => { const i = document.querySelector('#tailLen'); i.value = 1.6; i.dispatchEvent(new Event('input')); }); await page.waitForTimeout(400);
    const l1 = await tlen(); ok(l1 > l0 * 1.4, `"tail length" makes it longer (${l0.toFixed(3)} → ${l1.toFixed(3)} m a segment)`);
    await A(() => document.querySelector('#tailChips .chip[data-v="no"]').click()); await page.waitForTimeout(400);
    ok(await A(() => !window.__cdp.mq.hasTail), '“No tail” takes it away');
    await A(() => document.querySelector('#tailChips .chip[data-v="tupida"]').click()); await page.waitForTimeout(400);
    // expressions move the tail with the ears: fear tucks it under, happy lifts it
    await goTab(page, 'pose'); await page.waitForTimeout(400);
    const tx = () => A(() => window.__cdp.mq.joints.tail1.rotation.x);
    await A(() => document.querySelector('#exprChips .chip[data-v="miedo"]').click()); const fear = await tx();
    await A(() => document.querySelector('#exprChips .chip[data-v="feliz"]').click()); const happy = await tx();
    ok(fear < -.3 && happy > .3, `fear tucks the tail, a happy one lifts it (${(fear / Math.PI * 180).toFixed(0)}°, ${(happy / Math.PI * 180).toFixed(0)}°)`);
    ok(await A(() => document.querySelector('#exprChips .chip[data-v="feliz"]').getAttribute('aria-pressed') === 'true'), 'the expression chip stays pressed');
    // a living tail: the pelvis turns, the tail lags; with wagging it swings in time
    const life = await A(() => { const C = window.__cdp, m = C.mq, p = m.getPose(), q0 = p.q.hips;
      const turned = t => ({...p, q: {...p.q, hips: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), t * .05).multiply(new THREE.Quaternion().fromArray(q0)).toArray()}});
      const a = C.furry.tailLife(m, turned(20), turned, 20), still = C.furry.tailLife(m, p, () => p, 20);
      m.body.tailMove = 'meneo'; const w1 = C.furry.tailLife(m, p, () => p, 3), w2 = C.furry.tailLife(m, p, () => p, 9); delete m.body.tailMove;
      const d = (x, y) => new THREE.Quaternion().fromArray(x).angleTo(new THREE.Quaternion().fromArray(y));
      return {lag: d(a.q.tail1, p.q.tail1), still: d(still.q.tail1, p.q.tail1), wag: d(w1.q.tail1, w2.q.tail1)}; });
    ok(life.lag > .04 && life.still < 1e-4, `the tail lags behind a turn (${(life.lag / Math.PI * 180).toFixed(1)}°) and keeps still when the body does`);
    ok(life.wag > .1, `wagging swings it from side to side (${(life.wag / Math.PI * 180).toFixed(0)}° between two frames)`);
    // the BVH has the tail and the ears
    const bvh = await A(() => window.__cdp.exportBVH(window.__cdp.mq));
    ok(/JOINT tail3/.test(bvh) && /JOINT earL/.test(bvh) && bvh.split('MOTION')[1].trim().split('\n')[2].split(' ').length === (bvh.match(/CHANNELS 3/g).length * 3 + 6), 'the BVH carries the tail and ears, with a value for every channel');
    // more species: plantigrade bear with a sole pad, single-hoofed horse, a lion's mane
    await goTab(page, 'cuerpo'); await page.waitForTimeout(300);
    for (const sp of ['oso', 'caballo', 'leon']) { await A(sp => document.querySelector(`#speciesChips .chip[data-v="${sp}"]`).click(), sp); await page.waitForTimeout(1500); }
    ok(await A(() => window.__cdp.mq.body.species === 'leon' && window.__cdp.mq.acc.some(a => a.geometry.attributes.aEye && Math.abs(a.geometry.attributes.aEye.array[2] - 2.97) < .01)), 'a lion has its mane');
    // a hybrid: the fox girl's head on a tiger's body keeps the tiger's legs and coat
    await A(() => document.querySelector('#speciesChips .chip[data-v="tigre"]').click()); await page.waitForTimeout(1500);
    await A(() => document.querySelector('#headModelChips .chip[data-v="foxgirl"]').click()); await page.waitForTimeout(3500);
    const hy = await A(() => { const m = window.__cdp.mq; return {sp: m.body.species, head: !!m.headMesh, coat: window.__cdp.furry.coatOf(m.body).preset}; });
    ok(hy.sp === 'tigre' && hy.head && hy.coat === 'tigre', `a hybrid: another species' head on a tiger, still a tiger's coat (${JSON.stringify(hy)})`);
    // paw-hands: shorter, thicker fingers than a human's; "Human" hands give them back
    const finger = () => A(() => { const m = window.__cdp.mq, J = m.J, F = window.__cdp.FIG.jIdx, p = n => new THREE.Vector3(J[F[n] * 3], J[F[n] * 3 + 1], J[F[n] * 3 + 2]); return p('fR20').distanceTo(p('tipR2')); });
    await A(() => document.querySelector('#speciesChips .chip[data-v="zorro"]').click()); await page.waitForTimeout(2500); const paw = await finger();
    await A(() => document.querySelector('#handsChips .chip[data-v="humanas"]').click()); await page.waitForTimeout(800); const hum = await finger();
    ok(paw < hum * .8 && await A(() => document.querySelector('#handsChips .chip[data-v="animal"]').textContent) === 'Paws', `a fox has paws: fingers ${(paw * 100).toFixed(1)} cm against ${(hum * 100).toFixed(1)} cm with human hands`);
    // fluff tufts (and none when sleek); clothes open where the tail comes out and hide the tufts they cover
    await A(() => document.querySelector('#speciesChips .chip[data-v="zorro"]').click()); await page.waitForTimeout(2500);
    const tufts = await A(() => window.__cdp.mq.fluffGeo ? window.__cdp.mq.fluffGeo.attributes.position.count : 0);
    await A(() => { const i = document.querySelector('#coatFluff'); i.value = 0; i.dispatchEvent(new Event('input')); }); await page.waitForTimeout(500);
    ok(tufts > 100 && await A(() => !window.__cdp.mq.fluffGeo), `a fox has fluff tufts (${tufts} vertices) and a sleek one none`);
    await A(() => { const i = document.querySelector('#coatFluff'); i.value = .6; i.dispatchEvent(new Event('input')); }); await page.waitForTimeout(500);
    await goTab(page, 'ropa'); await A(() => document.querySelector('#outfitChips .chip[data-v="traje"]').click()); await page.waitForTimeout(4500);
    const cloth = await A(() => { const m = window.__cdp.mq, g = m.garments.find(g => g.geo && g.d && g.d.n > 500), A = g.geo.attributes.aHide.array, P = g.geo.attributes.position.array, O = m.tailRoot;
      let hole = 0; for (let i = 0; i < g.d.n; i++) if (A[i] === 1 && Math.hypot(P[i * 3] - O.x, P[i * 3 + 1] - O.y, P[i * 3 + 2] - O.z) < .1) hole++;
      const F = m.fluffGeo.attributes.aHide.array; let hid = 0; for (const v of F) if (v === 1) hid++; return {hole, hid}; });
    ok(cloth.hole > 3 && cloth.hid > 0, `a suit opens where the tail comes out (${cloth.hole} vertices) and hides the tufts under its sleeves (${cloth.hid})`);
    await goTab(page, 'cuerpo'); await page.waitForTimeout(300);
    // a furry cast read from a script
    const sp = await A(() => { const s = window.__cdp.furry.speciesOf; return [s('REX', 'REX, un lobo gris, entra.'), s('MIA', 'Mia (gata) mira.'), s('ANA', "ANA can't bear the silence."), s('ZORRO', 'ZORRO: ¡Hola!')].join(); });
    ok(sp === 'lobo,gato,,zorro', `a script's cast: “REX, un lobo”, “Mia (gata)”, the name ZORRO; “can't bear” is not a bear (${sp})`);
    ok(page.errors.length === 0, 'no errors ' + page.errors.slice(0, 2).join(' | '));
    await page.context().close();
  },
  // .neopose files: the whole work (cast, coats, film, sketch, guides) saved, the scene changed, opened again
  async file(browser) {
    const page = await open(browser), A = (f, a) => page.evaluate(f, a);
    await page.click('#cast .chip.add'); await page.waitForTimeout(1500);
    await goTab(page, 'cuerpo'); await A(() => document.querySelector('#speciesChips .chip[data-v="zorro"]').click()); await page.waitForTimeout(3000);
    await A(() => { const i = document.querySelector('#coatCols input[data-k="0"]'); i.value = '#224466'; i.dispatchEvent(new Event('input')); i.dispatchEvent(new Event('change')); });
    await page.click('#animBtn'); await page.waitForTimeout(500);
    await A(() => { const C = window.__cdp; for (const [f, p] of [[0, 'pie'], [12, 'victoria']]) { C.setFrameAnim(f); C.usePreset(C.POSES.find(x => x.id === p)); } });
    await A(() => { const C = window.__cdp; C.sk.strokes.push({brush: 'lapiz', color: '#2e2a25', size: 4, opacity: 1, pts: [[.1, .1, .5], [.3, .3, .5]]}); C.state.guides.thirds = true; });
    const state = () => A(() => JSON.stringify({c: window.__cdp.chars.map(m => [m.body.species, m.body.coat && m.body.coat.c[0]]), keys: window.__cdp.ANIM.shots[0].keys.map(K => K.map(k => k.f).join(',')), sk: window.__cdp.sk.strokes.length}));
    const before = await state();
    const bytes = await A(async () => Array.from(await window.__cdp.file.neoposeBytes('prueba')));
    ok(bytes[0] === 0x50 && bytes[1] === 0x4b && bytes.length > 1000, `a .neopose is a ZIP (${(bytes.length / 1024).toFixed(0)} kB)`);
    // change everything, then open the file
    await page.click('#animBtn'); await page.waitForTimeout(300);
    await A(() => { const C = window.__cdp; C.sk.strokes.length = 0; C.state.guides.thirds = false; C.restore({chars: [{body: {...C.chars[0].body, species: 'humano'}, pose: C.chars[0].getPose()}], active: 0}); });
    await A(async b => { await window.__cdp.file.openNeopose(new File([new Uint8Array(b)], 'prueba.neopose')); }, bytes); await page.waitForTimeout(3500);
    const after = await state();
    ok(after === before && await A(() => window.__cdp.state.guides.thirds), `opening it brings back the cast, the coat, the film, the sketch and the guides (${after})`);
    ok(/prueba/.test(await A(() => document.querySelector('#hint').textContent)), 'it says what was opened');
    // the GLB carries an anthro's coat as vertex colours (the base colour and the light belly, at least)
    const glb = await A(() => { const b = window.__cdp.exportGLB(), dv = new DataView(b.buffer), jl = dv.getUint32(12, true), J = JSON.parse(new TextDecoder().decode(b.subarray(20, 20 + jl))), bin = 20 + jl + 8;
      const mesh = J.meshes.findIndex(m => m.name === 'personaje2'), at = J.meshes[mesh].primitives[0].attributes, acc = J.accessors[at.COLOR_0], view = J.bufferViews[acc.bufferView];
      const C = new Float32Array(b.buffer.slice(bin + (view.byteOffset || 0), bin + (view.byteOffset || 0) + acc.count * 12)), seen = new Set();
      for (let i = 0; i < acc.count; i++) seen.add([0, 1, 2].map(k => Math.round(C[i * 3 + k] * 20)).join());
      return {colors: !!at.COLOR_0, distinct: seen.size}; });
    ok(glb.colors && glb.distinct >= 3, `the GLB wears the coat as vertex colours (${glb.distinct} shades)`);
    // the old "copy as text" JSON is read as a version-0 file
    const old = await A(() => window.__cdp.file.migrateScene({cdp: 1, chars: [{body: {}}]}));
    ok(old.version === await A(() => window.__cdp.file.NP_VERSION) && old.scene && old.scene.chars.length === 1, 'the old scene text is migrated to the current format');
    ok(page.errors.length === 0, 'no errors ' + page.errors.slice(0, 2).join(' | '));
    await page.context().close();
  },
  // the hands-on tutorials (coat and markings) and posing with the keyboard
  async tours(browser) {
    const page = await open(browser), A = (f, a) => page.evaluate(f, a), step = () => A(() => window.__cdp.tour.TOUR.steps[window.__cdp.tour.TOUR.i]?.id || (window.__cdp.tour.TOUR.on ? '?' : 'end'));
    await A(() => window.__cdp.tour.tourStart('pelaje')); await page.waitForTimeout(600);
    const s0 = await step();
    await A(() => document.querySelector('#speciesChips .chip[data-v="zorro"]').click()); await page.waitForTimeout(2500); const s1 = await step();
    await A(() => document.querySelector('#coatChips .chip[data-v="zorro_ar"]').click()); await page.waitForTimeout(1200); const s2 = await step();
    await A(() => document.querySelector('#coatMarks .chip[data-v="spots"]').click()); await page.waitForTimeout(1200); const s3 = await step();
    ok([s0, s1, s2, s3].join() === 'p-sp,p-coat,p-mark,p-tail', `the coat tutorial moves on as each thing is done (${[s0, s1, s2, s3].join(' → ')})`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    ok(await A(() => !window.__cdp.tour.TOUR.on), 'Esc leaves the tutorial');
    ok(await A(() => document.querySelectorAll('#helpTours [data-tour]').length) === 3, 'Help offers the three tutorials');
    // the keyboard: focus the canvas, J picks a joint, an arrow turns it and the turn is read out
    await page.focus('#gl'); await page.keyboard.press('j'); await page.keyboard.press('j'); await page.waitForTimeout(200);
    const sel = await A(() => window.__cdp.state.selected), x0 = await A(() => window.__cdp.mq.joints[window.__cdp.state.selected].rotation.x);
    await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp'); await page.waitForTimeout(300);
    const x1 = await A(() => window.__cdp.mq.joints[window.__cdp.state.selected].rotation.x), live = await A(() => document.querySelector('#srLive').textContent);
    ok(sel && Math.abs((x1 - x0) * 180 / Math.PI - 10) < .5 && /°/.test(live), `with the keyboard: J chose ${sel}, two ↑ turned it 10° and it was read out (“${live}”)`);
    ok(page.errors.length === 0, 'no errors ' + page.errors.slice(0, 2).join(' | '));
    await page.context().close();
  },
  async timeline(browser) {
    const page = await open(browser), A = (f, a) => page.evaluate(f, a);
    await page.click('#animBtn'); await page.waitForTimeout(400);
    await A(() => { const C = window.__cdp; for (const [f, p] of [[0, 'pie'], [12, 'victoria'], [24, 'saludo'], [36, 'pensativo']]) { C.setFrameAnim(f); C.usePreset(C.POSES.find(x => x.id === p)); } });
    await page.waitForTimeout(300);
    const keys = () => A(() => window.__cdp.ANIM.shots[0].keys[0].map(k => k.f + (k.ip ? k.ip[0] : '')).join(','));
    const xy = f => A(f => { const cv = document.querySelector('#tlTrack'), r = cv.getBoundingClientRect(); return {x: r.left + window.__cdp.tl.trackX(f), y: r.top + 18 + (matchMedia('(pointer: coarse)').matches ? 32 : 24) * 1.5}; }, f);
    ok(await keys() === '0,12,24,36', `four keys to work with (${await keys()})`);
    // click a key, Delete
    let p = await xy(24); await page.mouse.click(p.x, p.y); await page.keyboard.press('Delete'); await page.waitForTimeout(200);
    ok(await keys() === '0,12,36' && /Undo/.test(await A(() => document.querySelector('#hint').textContent)), `click a key, Delete: it goes, and the toast offers Undo (${await keys()})`);
    await page.click('#hint .undo'); await page.waitForTimeout(300);
    ok(await keys() === '0,12,24,36', 'Undo brings it back');
    // Shift adds; Backspace deletes both
    p = await xy(12); await page.mouse.click(p.x, p.y); p = await xy(24); await page.keyboard.down('Shift'); await page.mouse.click(p.x, p.y); await page.keyboard.up('Shift');
    ok(await A(() => window.__cdp.tl.TL.sel.size) === 2 && !(await page.isHidden('#tlSelBar')), 'Shift+click adds to the selection and the action bar shows');
    await page.keyboard.press('Backspace'); await page.waitForTimeout(200);
    ok(await keys() === '0,36', `Backspace deletes the selection (${await keys()})`);
    // box select from empty space
    await page.keyboard.press('Control+z'); await page.waitForTimeout(300);
    const a = await xy(6), b = await xy(30); await page.mouse.move(a.x, a.y - 6); await page.mouse.down(); await page.mouse.move(b.x, b.y + 6, {steps: 6}); await page.mouse.up();
    ok(await A(() => window.__cdp.tl.TL.sel.size) === 2, `dragging on empty space draws a box that selects the keys inside (${await A(() => window.__cdp.tl.TL.sel.size)})`);
    // drag to move
    await page.keyboard.press('Escape'); p = await xy(36); const q = await xy(40); await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(q.x, q.y, {steps: 5}); await page.mouse.up(); await page.waitForTimeout(200);
    ok((await keys()).endsWith(',40'), `dragging a key moves it frame by frame (${await keys()})`);
    // Alt-drag copies
    p = await xy(40); const q2 = await xy(46); await page.keyboard.down('Alt'); await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(q2.x, q2.y, {steps: 5}); await page.mouse.up(); await page.keyboard.up('Alt'); await page.waitForTimeout(200);
    ok((await keys()).endsWith(',40,46'), `Alt while dragging leaves a copy behind (${await keys()})`);
    // copy and paste at the playhead
    p = await xy(12); await page.mouse.click(p.x, p.y); await page.keyboard.press('Control+c'); await A(() => window.__cdp.setFrameAnim(30)); await page.keyboard.press('Control+v'); await page.waitForTimeout(200);
    const k30 = await A(() => { const K = window.__cdp.ANIM.shots[0].keys[0], a = K.find(k => k.f === 12), b = K.find(k => k.f === 30); return !!b && JSON.stringify(a.pose.q) === JSON.stringify(b.pose.q); });
    ok(k30, `Ctrl+C / Ctrl+V copy a key to the playhead (${await keys()})`);
    // interpolation: held
    p = await xy(12); await page.mouse.click(p.x, p.y); await page.keyboard.press('t'); await page.waitForTimeout(200);
    await page.click('#ctxMenu button:nth-of-type(3)'); await page.waitForTimeout(200);
    const held = await A(() => { const C = window.__cdp, K = C.ANIM.shots[0].keys[0]; C.setFrameAnim(18); const now = JSON.stringify(C.mq.getPose().q.shoulderR); return K.find(k => k.f === 12).ip === 'hold' && now === JSON.stringify(K.find(k => k.f === 12).pose.q.shoulderR); });
    ok(held, 'T → Constant: the pose holds until the next key (and the key turns square)');
    // right click: the menu
    p = await xy(24); await page.mouse.click(p.x, p.y, {button: 'right'}); await page.waitForTimeout(200);
    const menu = await A(() => [...document.querySelectorAll('#ctxMenu button span')].map(s => s.textContent));
    ok(menu.includes('Delete') && menu.includes('Copy') && menu.some(m => /Interpolation/.test(m)), `right click on a key: its menu (${menu.length} items)`);
    await page.keyboard.press('Escape');
    // a gallery clip: a click on its body selects all of it; Delete takes the whole clip away
    const n0 = await A(async () => { const C = window.__cdp, K = C.clips; await K.loadClipLibrary(); C.setFrameAnim(48); K.insertClip(K.allClips().find(c => c.id === 'np-saludar'), 0, 48, {loops: 1}); return C.ANIM.shots[0].keys[0].length; });
    const cx = await xy(54); await page.mouse.click(cx.x, cx.y); await page.waitForTimeout(150);
    const selN = await A(() => window.__cdp.tl.TL.sel.size); await page.keyboard.press('Delete'); await page.waitForTimeout(200);
    const n1 = await A(() => window.__cdp.ANIM.shots[0].keys[0].length);
    ok(selN > 10 && n0 - n1 === selN, `a click on a gallery clip selects the whole clip (${selN} frames) and Delete removes it`);
    // keyboard: arrows, Home/End, jump between keys
    await A(() => window.__cdp.setFrameAnim(5)); await page.keyboard.press('ArrowRight'); const f1 = await A(() => window.__cdp.ANIM.f); await page.keyboard.press('ArrowUp'); const f2 = await A(() => window.__cdp.ANIM.f); await page.keyboard.press('End'); const f3 = await A(() => window.__cdp.ANIM.f);
    ok(f1 === 6 && f2 === 12 && f3 === await A(() => window.__cdp.ANIM.shots[0].len - 1), `→ steps a frame (${f1}), ↑ jumps to the next key (${f2}), End to the last frame (${f3})`);
    // Ctrl+wheel zooms the lanes, F fits them again
    const mid = await xy(20); await page.mouse.move(mid.x, mid.y); await page.keyboard.down('Control'); await page.mouse.wheel(0, -300); await page.keyboard.up('Control'); await page.waitForTimeout(150);
    const zoomed = await A(() => { const v = window.__cdp.tl.tlView(); return v.b - v.a; }); await page.keyboard.press('f'); await page.waitForTimeout(100);
    const fit = await A(() => { const v = window.__cdp.tl.tlView(); return v.b - v.a; });
    ok(zoomed < fit && fit === await A(() => window.__cdp.ANIM.shots[0].len - 1), `Ctrl+wheel zooms (${Math.round(zoomed)} frames in view), F fits the shot again`);
    ok(!page.errors.length, 'no errors' + (page.errors.length ? ': ' + page.errors.join(' | ') : ''));
    await page.context().close();
  },
  // usability: the scene survives a reload, windows close on Esc and give the focus back, the export's buttons stay in
  // sight, the theme is remembered, the search finds settings and species
  async ux(browser) {
    const page = await open(browser, {viewport: {width: 1300, height: 860}}), A = (f, a) => page.evaluate(f, a);
    const ready = () => page.waitForFunction(() => window.__cdp && window.__cdp.chars && window.__cdp.chars.length, null, {timeout: 120000});
    // windows: Esc closes the top one, Tab stays inside, the focus goes back to the button that opened it
    for (const b of ['#helpBtn', '#setBtn', '#exportBtn', '#practiceBtn']) {
      await page.focus(b); await page.keyboard.press('Enter'); await page.waitForTimeout(600);
      const shown = await A(() => [...document.querySelectorAll('.modal')].filter(m => !m.hidden).map(m => m.id).join());
      for (let i = 0; i < 30; i++) await page.keyboard.press('Tab');
      const inside = await A(() => !!document.activeElement.closest('.modal:not([hidden])'));
      await page.keyboard.press('Escape'); await page.waitForTimeout(300);
      const r = await A(b => ({closed: [...document.querySelectorAll('.modal')].every(m => m.hidden), back: document.activeElement === document.querySelector(b), modal: document.querySelector('.modal [role=dialog]').getAttribute('aria-modal')}), b);
      ok(shown && inside && r.closed && r.back && r.modal === 'true', `${b}: ${shown} keeps Tab inside, Esc closes it and the focus goes back to the button`);
    }
    // the export window at 860 px: its main button in sight
    await page.click('#exportBtn'); await page.waitForTimeout(1500);
    const sv = await A(() => { const r = document.querySelector('#exSave').getBoundingClientRect(); return {b: Math.round(r.bottom), h: innerHeight}; });
    ok(sv.b <= sv.h - 8, `export at 860 px: "Save PNG" is in sight (bottom ${sv.b} of ${sv.h})`);
    await page.keyboard.press('Escape');
    // the command search: species and settings
    await page.keyboard.press('Control+k'); await page.waitForTimeout(300); await page.keyboard.type('wolf'); await page.waitForTimeout(300);
    const wolf = await A(() => [...document.querySelectorAll('#palList li')].map(l => l.textContent));
    await page.fill('#palInput', 'language'); await page.waitForTimeout(300);
    const lang = await A(() => [...document.querySelectorAll('#palList li')].map(l => l.textContent));
    ok(wolf.some(t => /Species.*Wolf/.test(t)) && lang.some(t => /Language: Español/.test(t)), `search finds species and settings (${wolf[0]} · ${lang[0]})`);
    await page.keyboard.press('Escape');
    // the theme: chosen in Settings, there again after a reload
    await page.click('#setBtn'); await page.click('#themeChips .chip[data-v=dark]'); await page.waitForTimeout(200); await page.keyboard.press('Escape');
    // the scene: changed, then the page is reloaded
    await A(async () => { const C = window.__cdp; C.useGroup(C.GROUP_POSES[2][3]); await C.setEnv('bosque'); });
    await page.waitForTimeout(2500); await page.reload(); await ready(); await page.waitForTimeout(1500);
    const back = await A(() => ({n: window.__cdp.chars.length, env: window.__cdp.state.env, theme: document.documentElement.dataset.theme, act: document.querySelector('#hint .undo')?.textContent}));
    ok(back.n === 2 && back.env === 'bosque' && back.act === 'Start afresh', `after a reload the scene is back, with a way to start afresh (${JSON.stringify(back)})`);
    ok(back.theme === 'dark', 'the dark theme chosen in Settings is applied again after the reload');
    await page.click('#hint .undo'); await page.waitForTimeout(1500);
    const fresh = await A(() => ({n: window.__cdp.chars.length, env: window.__cdp.state.env}));
    await page.keyboard.press('Control+z'); await page.waitForTimeout(1500);
    const undone = await A(() => ({n: window.__cdp.chars.length, env: window.__cdp.state.env}));
    ok(fresh.n === 1 && fresh.env === 'estudio' && undone.n === 2, `"Start afresh" gives the starting scene, and undo brings the other back (${JSON.stringify(fresh)} → ${JSON.stringify(undone)})`);
    // the script window: nothing to create from an empty script
    await page.click('#animBtn'); await page.waitForTimeout(400); await page.click('#tlScript'); await page.waitForTimeout(200); await page.fill('#scText', '');
    ok(await A(() => document.querySelector('#scGo').disabled && document.querySelector('#scUndo').disabled), 'script: “Create the film” waits for a script, and there is no film to recover yet');
    ok(!page.errors.length, 'no errors' + (page.errors.length ? ': ' + page.errors.join(' | ') : ''));
    await page.context().close();
  },
  async mobile(browser) {
    for (const lang of ['en', 'es']) {
      const page = await open(browser, {lang, viewport: {width: 390, height: 844}, mobile: true});
      const m = await page.evaluate(() => ({scroll: document.documentElement.scrollWidth - innerWidth, canvas: document.querySelector('#gl').getBoundingClientRect().height}));
      ok(m.scroll <= 0, `${lang} phone: no horizontal scroll (${m.scroll}px)`);
      ok(m.canvas > 200, `${lang} phone: canvas is visible (${Math.round(m.canvas)}px)`);
      if (lang === 'en') {
        // a phone at rest draws a few frames a second, and the garment library is not fetched until Ropa is opened
        const rest = await page.evaluate(() => new Promise(res => setTimeout(() => { const r = window.__cdp.renderer, f0 = r.info.render.frame; setTimeout(() => res(r.info.render.frame - f0), 3000); }, 3000)));
        const cat0 = await page.evaluate(() => performance.getEntriesByType('resource').some(e => /ropa\/catalog\.json/.test(e.name)));
        await page.evaluate(() => (window.__cdp.spaces ? window.__cdp.spaces.goTab('ropa') : document.querySelector('.tab[data-tab=ropa]').click())); await page.waitForTimeout(2500);
        const cat1 = await page.evaluate(() => performance.getEntriesByType('resource').some(e => /ropa\/catalog\.json/.test(e.name)) && !!document.querySelector('#garmentAdd details, #garmentAdd .libItem'));
        ok(rest <= 20, `${lang} phone: at rest the canvas is drawn a few times a second (${rest} frames in 3 s)`);
        ok(!cat0 && cat1, `${lang} phone: the garment library is fetched when Ropa is opened, not at start`);
        await page.evaluate(() => (window.__cdp.spaces ? window.__cdp.spaces.goTab('pose') : document.querySelector('.tab[data-tab=pose]').click())); await page.waitForTimeout(500);
      }
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
