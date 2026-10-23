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
// the sculpted paws (11b-parts) load when a species first wears them, and the figure is built again when they come
const partsReady = page => page.waitForFunction(() => { const F = window.__cdp.furry; return window.__cdp.chars.every(m => ['hand', 'foot', 'leg', 'body'].every(k => { const id = F.partFor(m.body, k); return !id || F.PARTS[id] && (k !== 'body' || m.acc.some(a => a.geometry.userData.part === id)); })); }, null, {timeout: 120000});

const SUITES = {
  // every panel, card and window in English: nothing left in Spanish, no errors
  async i18n(browser) {
    for (const lang of ['en', 'es']) {
      const page = await open(browser, {lang}), seen = new Set(), grab = async () => (await texts(page)).forEach(t => seen.add(t));
      // (the comic's catalogue of sound effects: the words of each language, as they are written there)
      for (const t of await page.evaluate(() => window.__cdp.comic.SFX_CATALOG.flatMap(g => [g[0], ...g[1].map(e => e[0])]))) ALLOW.add(t);
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
    for (const lang of ['ca', 'fr', 'pt', 'de', 'it', 'ja', 'zh', 'ko']) {
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
  // anthro mouths: the lips are cut clean, the inside is built on them (teeth per dentition in the gums, tongue, palate),
  // it shows only while the jaw is open, expressions and talking open it; the body's own head and a kemonomimi too
  async furmouth(browser) {
    const page = await open(browser), A = (f, a) => page.evaluate(f, a);
    await goTab(page, 'cuerpo'); await page.waitForTimeout(400);
    const pick = async (sp, morph) => { await A(([sp, morph]) => { const C = window.__cdp; C.__hc = C.__hc || {...C.HEAD_CATALOG}; for (const k in C.__hc) { if (morph) delete C.HEAD_CATALOG[k]; else C.HEAD_CATALOG[k] = C.__hc[k]; }
        document.querySelector(`#speciesChips .chip[data-v="${sp}"]`).click(); C.rebuildActive(true); }, [sp, morph]);
      await page.waitForFunction(m => { const q = window.__cdp.mq; return q.anthro && (m || q.headSwap); }, morph, {timeout: 30000}); await page.waitForTimeout(300); };
    // what the mouth is made of: teeth (kind 5) on the skull (accessory bone 1) and on the jaw (5), each tooth's root, the longest
    const mouth = () => A(() => { const m = window.__cdp.mq, F = m.anthro.mouth, parts = m.mouthMeshes.filter(x => !x.userData.hull), out = {n: parts.length, F: !!F, kinds: [], up: [], lo: [], tongue: null};
      for (const p of parts) { const g = p.geometry, P = g.attributes.position.array, E = g.attributes.aEye.array, SI = g.attributes.skinIndex.array, SW = g.attributes.skinWeight.array, k = Math.floor(-E[3]) - 1; for (let i = 3; i < E.length; i += 4) out.kinds.push(Math.floor(-E[i]) - 1);
        if (k === 5) for (let i = 0; i < P.length / 3; i++) (SI[i * 4] === 1 && SW[i * 4] > .99 ? out.up : SI[i * 4] === 5 && SW[i * 4] > .99 ? out.lo : []).push([(P[i * 3]) / F.h, (P[i * 3 + 1] - F.y) / F.h, (P[i * 3 + 2] - F.zc) / F.h]);
        if (k === 6) { let top = -9, n = 0, x = 0; for (let i = 0; i < P.length / 3; i++) { top = Math.max(top, (P[i * 3 + 1] - F.y) / F.h); x += P[i * 3]; n++; } out.tongue = {top, xm: x / n / F.h, jaw: SI[0] === 5}; } }
      const s = l => ({n: l.length, xs: l.reduce((a, p) => a + p[0], 0) / Math.max(1, l.length), deep: Math.max(0, ...l.map(p => Math.abs(p[1]))), deepZ: (l.reduce((b, p) => Math.abs(p[1]) > Math.abs(b[1]) ? p : b, [0, 0, 0]))[2], front: Math.max(...l.map(p => p[2]))});
      return {...out, up: s(out.up), lo: s(out.lo)}; });
    await pick('lobo');
    let w = await mouth();
    ok(w.F && w.n >= 4 && [5, 6, 7, 8, 9].every(k => w.kinds.includes(k)), `a wolf's mouth: gums, palate, throat, teeth and tongue (kinds ${[...new Set(w.kinds)].join()})`);
    ok(w.up.n > 300 && w.lo.n > 300 && Math.abs(w.up.xs) < .005 && Math.abs(w.lo.xs) < .005, `teeth in both jaws, rigid on the skull and on the jaw, symmetric (mean x ${w.up.xs.toFixed(4)}, ${w.lo.xs.toFixed(4)} head heights)`);
    ok(w.up.deep > .09 && w.up.deepZ < w.up.front - .02, `the longest upper tooth is a canine (${w.up.deep.toFixed(3)} head heights), not at the very front`);
    ok(w.tongue && w.tongue.jaw && w.tongue.top < 0 && Math.abs(w.tongue.xm) < .01, `the tongue lies on the jaw's floor, in the middle (${JSON.stringify(w.tongue)})`);
    // the sculpt is cut: in front of the corners no skin triangle joins the upper lip to the lower
    const cut = await A(() => { const m = window.__cdp.mq, g = m.headMesh.geometry, P = g.attributes.position.array, I = g.index.array, SI = g.attributes.skinIndex.array, SW = g.attributes.skinWeight.array, F = m.anthro.mouth, Jw = window.__cdp.FIG.jIdx.jaw;
      const jw = i => { let w = 0; for (let k = 0; k < 4; k++) if (SI[i * 4 + k] === Jw) w += SW[i * 4 + k]; return w; };
      let bad = 0, n = 0, ear = 0, nB = window.__cdp.FIG.meta.bones.length;
      for (let t = 0; t < I.length; t += 3) { const v = [I[t], I[t + 1], I[t + 2]]; if (!v.every(i => P[i * 3 + 2] > F.zc + .01 * F.h && Math.abs(P[i * 3]) < F.xc && Math.abs(P[i * 3 + 1] - F.y) < .05 * F.h)) continue; n++; const j = v.map(jw); if (Math.max(...j) - Math.min(...j) > .9) bad++; }
      for (let i = 0; i < P.length / 3; i++) { let e = 0; for (let k = 0; k < 4; k++) if (SI[i * 4 + k] >= nB) e += SW[i * 4 + k]; if (e > .5 && jw(i) > .01) ear++; }
      return {bad, n, ear}; });
    ok(cut.n > 20 && cut.bad === 0 && cut.ear === 0, `the lips part cleanly (${cut.n} triangles at the lip line, ${cut.bad} torn) and no ear vertex goes with the jaw (${cut.ear})`);
    // every tooth stands inside the lip edge in plan (the bag's rim, which runs on round the cheek pouch behind the corners)
    // and behind the front of the lips, so none shows through the lips or the cheek
    const inLips = () => A(() => { const m = window.__cdp.mq, F = m.anthro.mouth, parts = m.mouthMeshes.filter(x => !x.userData.hull), rim = [], T = [];
      for (const p of parts) { const P = p.geometry.attributes.position.array, E = p.geometry.attributes.aEye.array, k = Math.floor(-E[3]) - 1;
        for (let i = 0; i < P.length / 3; i++) { if (k === 5) T.push([P[i * 3], P[i * 3 + 2]]); else if (k !== 6 && P[i * 3 + 1] === Math.fround(F.y) && p === parts[0]) rim.push([P[i * 3], P[i * 3 + 2]]); } }
      const inside = ([x, z]) => { let c = false; for (let i = 0, j = rim.length - 1; i < rim.length; j = i++) { const [xi, zi] = rim[i], [xj, zj] = rim[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
      return {n: T.length, rim: rim.length, out: T.filter(p => !inside(p)).length, front: (Math.max(...T.map(p => p[1])) - Math.max(...rim.map(p => p[1]))) / F.h}; });
    const lipsOf = async sp => { if (sp) await pick(...sp); const r = await inLips(); return `${sp ? sp[0] : 'lobo'} ${r.out}/${r.n} out, front ${r.front.toFixed(3)}` + (r.rim > 20 && r.out === 0 && r.front < -.005 ? '' : ' ✗'); };
    { const r = [await lipsOf()]; for (const sp of [['zorro'], ['gato'], ['conejo'], ['dragon'], ['cabra'], ['caballo', true]]) r.push(await lipsOf(sp));
      ok(!r.join().includes('✗'), `teeth inside the lips and the cheeks, behind the lip front (${r.join('; ')})`); }
    // our sculpts are modelled closed, the upper lip overhanging the lower jaw: the cut finds the lip edge round the arch
    // up to the front of the jaw (the chin, under the overhang), and none of the head's skin is hidden while the mouth
    // is open (it has no inside of its own)
    await pick('zorro');
    const fox = await A(() => { const d = window.__cdp.mq.headSwap.d, F = d.mouth, rim = d.rim, P = d.P; let chin = -Infinity;
      for (let i = 0; i < d.n; i++) if (d.K[i] === 0 && Math.abs(P[i * 3]) < .03 && P[i * 3 + 1] < F.y - .01 && P[i * 3 + 1] > F.y - .08) chin = Math.max(chin, P[i * 3 + 2]);
      return {id: d.id, n: rim.length, front: (Math.max(...rim.map(q => q[2])) - F.zc) / (chin - F.zc), hid: [...d.lip].filter(v => v > 3).length}; });
    ok(fox.id === 'zorro' && fox.n > 20 && fox.front > .9 && fox.hid === 0, `the fox's lips part along the arch (${fox.n} points on the edge, reaching ${(fox.front * 100).toFixed(0)}% of the way to the front of its jaw) and none of its skin is hidden (${fox.hid})`);
    await pick('lobo');
    // hidden while closed; an expression opens it, the margin uniform is set
    await goTab(page, 'pose'); await page.waitForTimeout(300);
    const vis = () => A(() => { const C = window.__cdp, m = C.mq; C.renderView({w: 64, h: 64}); return {open: !!m.mouthOpen, vis: m.mouthMeshes.filter(x => x.visible).length, u: m.lib.uMouth.value, lip: m.lib.uEye.uLip.value.w}; });
    const shut = await vis(); await A(() => document.querySelector('#exprChips .chip[data-v="rugido"]').click()); const roar = await vis();
    ok(!shut.open && shut.vis === 0 && roar.open && roar.vis >= 4 && roar.u === 1 && roar.lip < 0, `closed, nothing of the inside shows; a roar opens it (${JSON.stringify([shut, roar])})`);
    // talking moves the jaw and the inside follows
    const jawTo = async r => { await A(r => { const C = window.__cdp, m = C.mq; C.applyExpression(m, 'neutra'); m.joints.jaw.rotation.set(r, 0, 0); C.controls.dispatchEvent({type: 'change'}); }, r); await page.waitForTimeout(500); return A(() => [window.__cdp.mq.mouthOpen, window.__cdp.mq.mouthMeshes.some(x => x.visible)]); };
    const talk = [(await jawTo(.18))[0], ...(await jawTo(0))];
    ok(talk.join() === 'true,false,false', `a few degrees of jaw (talking) open the mouth, closing hides it all again (${talk.join()})`);
    // and through the animation path: a dialogue line's visemes move the jaw frame by frame, the inside shows and goes
    await A(() => { if (!window.__cdp.ANIM.open) document.querySelector('#animBtn').click(); }); await page.waitForTimeout(500);
    const said = await A(() => { const C = window.__cdp, s = C.ANIM.shots[C.ANIM.cur], m = C.mq, seen = [];
      s.lines.push({c: C.chars.indexOf(m), text: 'hola, ¿cómo estás? muy bien, gracias', f: 2, len: 30});
      for (let f = 0; f < 44; f += 2) { C.setFrameAnim(f); C.renderView({w: 32, h: 32}); seen.push(m.mouthOpen ? 1 : 0); }
      s.lines.pop(); C.setFrameAnim(0); C.renderView({w: 32, h: 32}); return {open: C.ANIM.open, seen: seen.join(''), after: !!m.mouthOpen || m.mouthMeshes.some(x => x.visible)}; });
    ok(said.open && /^0+1/.test(said.seen) && /10/.test(said.seen) && /0$/.test(said.seen) && !said.after, `a spoken line opens and closes the mouth as it plays (${said.seen}), shut again after`);
    // a long muzzle opens less for the same expression; a horse's ears fold back instead of flipping
    const jawOf = sp => A(() => { const m = window.__cdp.mq; window.__cdp.applyExpression(m, 'rugido'); return m.joints.jaw.rotation.x; });
    await goTab(page, 'cuerpo'); const wolfJaw = await jawOf(); await pick('caballo'); const horseJaw = await jawOf();
    ok(horseJaw < wolfJaw * .85, `a horse opens its long jaw less (${(horseJaw * 57.3).toFixed(0)}° against ${(wolfJaw * 57.3).toFixed(0)}°)`);
    w = await mouth(); ok(w.up.n > 0 && w.up.deep < .06, `herbivore teeth: flat incisors and molars, no fangs (${w.up.deep.toFixed(3)})`);
    const upI = () => A(() => window.__cdp.mq.mouthMeshes.find(x => x.geometry.userData.teeth).geometry.userData.teeth.filter(x => x.up && (x.s === 'i' || x.s === 'f')).length);
    { const horse = await upI(); await pick('cabra'); const goat = await upI(); await pick('caballo');
      ok(horse === 3 && goat === 0, `a horse has upper incisors (${horse} a side), a goat only a dental pad (${goat})`); }
    // other dentitions: a cat's fangs are its longest teeth, a rabbit's longest are its front incisors, a dragon's are many cones
    await pick('gato'); w = await mouth();
    // a kemono cat's short jaw sits right over its neck: roaring, the front of its chin stays in front of the throat
    const chin = await A(() => { const m = window.__cdp.mq, F = m.anthro.mouth; window.__cdp.applyExpression(m, 'rugido'); const a = m.joints.jaw.rotation.x, z = (F.zc + F.tip) / 2 - F.jz, y = F.chin - F.jy;
      return {deg: a * 57.3, z: (z * Math.cos(a) + y * Math.sin(a) + F.jz - F.nz) / F.h}; });
    ok(chin.deg > 20 && chin.z > .03, `a cat roars wide (${chin.deg.toFixed(0)}°) with its chin still ${chin.z.toFixed(2)} head heights in front of its throat`);
    ok(w.up.deep > .09 && w.up.deepZ < w.up.front - .005, `a cat's fangs: its longest teeth, behind the incisors (${w.up.deep.toFixed(3)} at ${w.up.deepZ.toFixed(3)}, front ${w.up.front.toFixed(3)})`);
    await pick('conejo'); w = await mouth(); ok(w.up.deep > .05 && w.up.deepZ > w.up.front - .05, `a rabbit's long front incisors (${w.up.deep.toFixed(3)} at ${w.up.deepZ.toFixed(3)}, front ${w.up.front.toFixed(3)})`);
    await pick('dragon'); const dr = w = await mouth(); ok(w.up.n > (await pick('lobo'), await mouth()).up.n, `a dragon has more teeth than a wolf (${dr.up.n} vertices)`);
    // rows: a wolf's teeth stand side by side round the arch up to near the corner, a horse keeps its bars;
    // roots end in the gum band, so none rises above the lips (nor sinks below the lower ones) where the sculpt is open
    const row = () => A(() => { const m = window.__cdp.mq, F = m.anthro.mouth, t = m.mouthMeshes.find(x => x.geometry.userData.teeth), g = t.geometry, P = g.attributes.position.array, SI = g.attributes.skinIndex.array;
      let hi = -9, lo = 9; for (let i = 0; i < P.length / 3; i++) { const y = (P[i * 3 + 1] - F.y) / F.h; if (SI[i * 4] === 1) hi = Math.max(hi, y); else lo = Math.min(lo, y); }
      const up = g.userData.teeth.filter(x => x.up); let gap = 0; for (let k = 1; k < up.length; k++) gap = Math.max(gap, up[k].u - up[k].w - up[k - 1].u - up[k - 1].w);
      return {gap, n: up.length, end: up[up.length - 1].u + up[up.length - 1].w, hi, lo}; });
    // a horse's mouth is narrow however long its muzzle (not cheek to cheek), its incisors a closed arc of chisels
    { await pick('caballo'); const hz = await A(() => { const m = window.__cdp.mq, F = m.anthro.mouth, t = m.mouthMeshes.find(x => x.geometry.userData.teeth).geometry.userData.teeth.filter(x => x.up && x.s === 'f');
        let gap = 0; for (let k = 1; k < t.length; k++) gap = Math.max(gap, t[k].u - t[k].w - t[k - 1].u - t[k - 1].w); return {xc: F.xc / F.h, n: t.length, gap}; });
      ok(hz.xc < .4 && hz.n === 3 && hz.gap < .005, `a horse's mouth is narrow (${hz.xc.toFixed(2)} head heights each side) with ${hz.n} chisel incisors a side, closed up (gap ${hz.gap.toFixed(3)})`); }
    // the rows end where the lips have parted at least half way: nearer the corner the cheek stretches over them as the
    // jaw opens, and a last tooth there stood on the cheek above the lip margin
    for (const sp of ['zorro', 'dragon', 'lobo']) { await pick(sp); const c = await A(() => { const m = window.__cdp.mq, F = m.anthro.mouth, g = m.mouthMeshes.find(x => x.geometry.userData.teeth).geometry, P = g.attributes.position.array, S = .35 * Math.min(F.tip - F.zc, F.xc);
        let n = 0; for (let i = 0; i < P.length / 3; i++) if (P[i * 3 + 2] - F.zc < .25 * S) n++; return n; });
      ok(c === 0, `${sp}: no tooth in the corners, where the lips have hardly parted (${c} vertices)`); }
    // (the half arch runs on round the corner, where the upper lip's overhang meets the cheek and no tooth stands; a
    // stylised wolf's short muzzle has room for all but one cheek tooth: drawn fewer and bigger)
    { const wr = await row(); await pick('caballo', true); const hr = await row(); await pick('lobo');
      ok(wr.n >= 7 && wr.gap < .03 && wr.end > .55 && wr.end < 1 && hr.gap > .035 && hr.end < 1, `a wolf's row of teeth is closed (${wr.n} teeth a side, widest gap ${wr.gap.toFixed(3)} of the half arch, ending at ${wr.end.toFixed(2)}), a horse's has its bars (${hr.gap.toFixed(2)})`);
      ok(wr.hi < .032 && wr.lo > -.032 && hr.hi < .032 && hr.lo > -.032, `roots end in the gums (wolf ${wr.hi.toFixed(3)}/${wr.lo.toFixed(3)}, horse ${hr.hi.toFixed(3)}/${hr.lo.toFixed(3)} head heights from the lip line)`); }
    // panting lolls the tongue out past the lips; any other expression keeps it in
    { const t = async e => A(e => { const C = window.__cdp, m = C.mq; C.applyExpression(m, e); C.renderView({w: 64, h: 64}); const p = m.mouthMeshes.find(x => x.geometry.userData.tongue), g = p.geometry, P = g.attributes.position.array, D = g.morphAttributes.position[0].array, k = p.morphTargetInfluences[0];
        let z = -9; for (let i = 0; i < P.length; i += 3) z = Math.max(z, P[i + 2] + k * D[i + 2]); return {k, out: (z - Math.max(...m.anthro.rim.map(r => r[1]))) / m.anthro.mouth.h}; }, e);
      const j = await t('jadeo'), r = await t('rugido'); await A(() => window.__cdp.applyExpression(window.__cdp.mq, 'neutra'));
      ok(j.k === 1 && j.out > .02 && r.k === 0 && r.out < 0, `panting lolls the tongue out (${j.out.toFixed(3)} head heights past the lips), a roar keeps it in (${r.out.toFixed(3)})`); }
    // the neck under a sculpt: the body's throat below the cut stays drawn (inked or not) and every sculpt reaches down to the
    // cut, so the body's neck is never open under the chin
    { const r = []; for (const sp of ['zorro', 'gato', 'conejo', 'lobo']) { await pick(sp); r.push(await A(sp => { const m = window.__cdp.mq, hs = m.headSwap, FIG = window.__cdp.FIG, P = m.geo.attributes.position.array, H = m.geo.attributes.aHide.array;
        let hid = 0; for (let i = 0; i < FIG.meta.nV; i++) if ((m.dom[i] === FIG.jIdx.head || m.dom[i] === FIG.jIdx.jaw) && !FIG.eye[i] && P[i * 3 + 1] < hs.yc && H[i] > .99) hid++;
        let low = Infinity; for (const i of hs.keep) low = Math.min(low, hs.Q[i * 3 + 1]); return {sp, hid, low: (low - hs.yc) / hs.s}; }, sp)); }
      ok(r.every(x => x.hid === 0 && x.low < 1e-3), `the throat under each sculpt is closed (${r.map(x => `${x.sp} ${x.hid} hidden, edge ${x.low.toFixed(4)}`).join('; ')})`); }
    // the body's own head (no sculpt): the line it is cut along, and an inside too
    await pick('lobo', true);
    const mh = await A(() => { const m = window.__cdp.mq, L = m.geo.attributes.aLip.array; let up = 0, dn = 0; for (const v of L) { if (v === 1) up++; else if (v === -1) dn++; } return {up, dn, lip: m.lib.uEye.uLip.value.w, parts: m.mouthMeshes.length, swap: !!m.headSwap}; });
    ok(!mh.swap && mh.up > 20 && mh.dn > 20 && mh.lip > 0 && mh.parts >= 4, `the body's own head marks both lips (${mh.up}, ${mh.dn}) and has an inside (${mh.parts} meshes)`);
    // no triangle of it joins a lip (±1) to the other side's skin (∓2): only one joining the two lips may fall in the cut band
    // (one that did was cut half way and left slivers and flaps in the opening); MakeHuman's own mouth pocket is left out of
    // the draw while open (its triangles at the end of the index), and only from round the mouth
    for (const k of [2, 3, 5]) { await A(k => { const C = window.__cdp; C.mq.body.kemo = k; C.rebuildActive(true); }, k); await page.waitForTimeout(500);
      const b = await A(() => { const C = window.__cdp, m = C.mq, L = m.geo.attributes.aLip.array, I = m.geo.index.array, P = m.geo.attributes.position.array, F = m.anthro.mouth, n = m.anthro.pocket; let mixed = 0, far = 0;
        for (let t = 0; t < I.length; t += 3) { const v = [L[I[t]], L[I[t + 1]], L[I[t + 2]]], cut = [0, 1, 2].every(e => Math.abs(P[I[t + e] * 3]) < F.xc && P[I[t + e] * 3 + 2] > F.zc);
          if (cut && (v.some(x => x === 1) && v.some(x => x === -2) || v.some(x => x === -1) && v.some(x => x === 2))) mixed++;
          if (t >= n && [0, 1, 2].some(e => { const i = I[t + e]; return Math.abs(P[i * 3 + 1] - F.y) > .25 * F.h || Math.abs(P[i * 3]) > F.xc + .05 * F.h || P[i * 3 + 2] < F.zc - .6 * F.h; })) far++; }
        C.applyExpression(m, 'rugido'); C.renderView({w: 32, h: 32}); const open = m.geo.drawRange.count; C.applyExpression(m, 'neutra'); C.renderView({w: 32, h: 32});
        return {mixed, far, drop: (I.length - n) / 3, open, shut: m.geo.drawRange.count, n}; });
      ok(b.mixed === 0 && b.far === 0 && b.drop > 20 && b.open === b.n && b.shut === Infinity, `kemo ${k}: in the opening no lip triangle crosses into the cut band from the other side (${b.mixed}); ${b.drop} triangles of the human mouth pocket, all round the mouth (${b.far} away), left out while open`); }
    await A(() => { const C = window.__cdp; delete C.mq.body.kemo; C.rebuildActive(true); }); await page.waitForTimeout(400);
    // panting with the jaw closed by hand: the tongue goes back in
    { const t = await A(() => { const C = window.__cdp, m = C.mq; C.applyExpression(m, 'jadeo'); C.renderView({w: 32, h: 32}); const p = m.mouthMeshes.find(x => x.geometry.userData.tongue), open = p.morphTargetInfluences[0];
        m.joints.jaw.rotation.set(.06, 0, 0); C.renderView({w: 32, h: 32}); const shut = p.morphTargetInfluences[0]; C.applyExpression(m, 'neutra'); return {open, shut}; });
      ok(t.open === 1 && t.shut === 0, `the panting tongue lolls with the jaw open (${t.open}) and goes back in as it closes (${t.shut})`); }
    // a kemonomimi keeps its human mouth
    await A(() => { const C = window.__cdp; C.mq.body.kemo = 1; C.rebuildActive(true); }); await page.waitForTimeout(800);
    ok(await A(() => { const m = window.__cdp.mq; return !m.anthro.mouth && m.mouthMeshes.length === 0 && m.lib.uEye.uLip.value.w === 0; }), 'a kemonomimi (human face) keeps its human mouth');
    await A(() => { const C = window.__cdp; delete C.mq.body.kemo; for (const k in C.__hc) C.HEAD_CATALOG[k] = C.__hc[k]; C.rebuildActive(true); });
    ok(page.errors.length === 0, 'no errors ' + page.errors.slice(0, 2).join(' | '));
    await page.context().close();
  },
  // skeleton construction mode: the bones appear inside a ghost of the figure, follow body changes, and go away again
  async skeleton(browser) {
    const page = await open(browser), A = f => page.evaluate(f);
    await goTab(page, 'dibujo'); await page.evaluate(() => document.querySelector('details[data-sec=constr]').open = true);
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
  // fur tufts: clumps of thick tapered locks where real fur breaks the outline, flowing with the hair, attached to the skin
  async furtufts(browser) {
    const page = await open(browser), A = (f, a) => page.evaluate(f, a);
    await goTab(page, 'cuerpo');
    const pick = async sp => { await A(sp => document.querySelector(`#speciesChips .chip[data-v="${sp}"]`).click(), sp); await page.waitForTimeout(2500); };
    // every lock (5 rings of 6 vertices): where it grows, its base and tip, its length, how deep it is against how wide
    const locks = () => A(() => {
      const C = window.__cdp, m = C.mq, F = C.FIG, g = m.fluffGeo; if (!g) return null;
      const P = g.attributes.position.array, R = g.attributes.aRoot.array, E = g.attributes.aEye.array, BP = m.geo.attributes.position.array, BN = m.geo.attributes.normal.array, J = m.J, j = n => [0, 1, 2].map(k => J[F.jIdx[n] * 3 + k]);
      // a cheek lock on a sculpted head grows from that head's skin: its rest positions and normals
      // (its skin: K 0; the eyes and the mouth's parts are other pieces inside it)
      const HG = m.headSwap && m.headMesh && m.headMesh.geometry.attributes, HP = HG && HG.position.array, HN = HG && HG.normal.array, HK = HG && m.headSwap.d.K;
      const skinAt = p => { if (!HP) return null; let r = 0, rd = Infinity; for (let i = 0; i < HP.length / 3; i++) { if (HK[i]) continue; const e = (HP[i * 3] - p[0]) ** 2 + (HP[i * 3 + 1] - p[1]) ** 2 + (HP[i * 3 + 2] - p[2]) ** 2; if (e < rd) { rd = e; r = i; } } return r; };
      // the rest grow on the sculpted body when there is one (11b-parts): its skin, not the body's own under it
      const SB = (m.acc || []).filter(a => !a.userData.hull && a.geometry.userData.body).map(a => [a.geometry.attributes.position.array, a.geometry.attributes.normal.array]);
      const bodyAt = p => { let best = null, rd = Infinity; for (const [Q, N] of SB) for (let i = 0; i < Q.length / 3; i++) { const e = (Q[i * 3] - p[0]) ** 2 + (Q[i * 3 + 1] - p[1]) ** 2 + (Q[i * 3 + 2] - p[2]) ** 2; if (e < rd) { rd = e; best = [Q, N, i]; } } return best; };
      const v = i => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), avg = (o, r) => [0, 1, 2].map(k => { let s = 0; for (let q = 0; q < 6; q++) s += P[(o + r * 6 + q) * 3 + k]; return s / 6; });
      const out = [];
      for (let o = 0; o < R.length; o += 30) {
        const r = R[o], base = avg(o, 0), tip = avg(o, 4), ring = [0, 1, 2, 3, 4, 5].map(q => v(o + 6 + q)), wide = Math.max(...ring.map(a => Math.max(...ring.map(b => d(a, b)))));
        // a cheek lock on a sculpted head roots in its own skin and hides with the body's head skin it stands in for
        const part = F.region[m.dom[r]] === 'head' ? 'cheek' : F.region[m.dom[r]], h = part === 'cheek' && skinAt(base);
        const sb = !(h === null || h === false) ? null : SB.length && bodyAt(base);
        const sunk = sb ? [0, 1, 2].reduce((a, k) => a + (base[k] - sb[0][sb[2] * 3 + k]) * sb[1][sb[2] * 3 + k], 0)
          : h === null || h === false ? [0, 1, 2].reduce((a, k) => a + (base[k] - BP[r * 3 + k]) * BN[r * 3 + k], 0) : [0, 1, 2].reduce((a, k) => a + (base[k] - HP[h * 3 + k]) * HN[h * 3 + k], 0);
        const BE = m.geo.attributes.aEye.array, own = [0, 1, 2, 3].every(k => Math.abs(E[o * 4 + k] - BE[r * 4 + k]) < 1e-4);
        out.push({part, root: [BP[r * 3], BP[r * 3 + 1], BP[r * 3 + 2]], sunk, own, hid: g.attributes.aHide.array[o], base, tip, len: d(base, tip), deep: d(ring[0], ring[3]) / wide, belly: E[o * 4]});
      }
      return {L: out, n: P.length / 3, size: m.size, chest: j('chest'), elbow: j('elbowL'), wrist: j('wristL'), ankle: j('ankleL')};
    });
    // (the fox's sculpted head loads on its own: wait for its cheeks)
    await pick('zorro'); await page.waitForFunction(() => { const m = window.__cdp.mq; return m.headSwap && m.headMesh && m.fluffGeo; }, null, {timeout: 60000}); await page.waitForTimeout(1000); const f = await locks();
    ok(f && f.L.length >= 60 && f.n < 9000, `a fox grows tufts: ${f && f.L.length} locks, ${f && f.n} vertices (modest)`);
    ok(f.L.every(l => l.deep > .65), `every lock is round enough to read edge-on (thinnest depth/width ${Math.min(...f.L.map(l => l.deep)).toFixed(2)})`);
    // each lock roots under the skin it grows from (a root standing proud of a curved neck or under the jaw reads as a
    // cut slab): the body's skin (the sculpted body's), or for a cheek lock the sculpted head's own
    ok(f.L.every(l => l.sunk < 0), `every lock's root is buried in its skin, the sculpted head's cheeks too (${f.L.filter(l => l.sunk >= 0).length} of ${f.L.length} stand out)`);
    // and takes the coat where it grows: each lock the coat of its own root (a clump on the edge of a marking grades
    // across it), light on the throat and dark on the sides of the neck
    const body = f.L.filter(l => l.part !== 'cheek'), ruff = f.L.filter(l => l.part === 'neck');
    ok(body.every(l => l.own), `every lock is coloured by the coat at its own root (${body.filter(l => !l.own).length} of ${body.length} are not)`);
    ok(ruff.some(l => l.belly > .4) && ruff.some(l => l.belly < .1), `the neck ruff is light at the throat and takes the side coat behind (${ruff.filter(l => l.belly > .4).length} light, ${ruff.filter(l => l.belly < .1).length} dark)`);
    const lens = f.L.map(l => l.len / f.size);
    ok(Math.max(...lens) < .12 && Math.min(...lens) > .01, `locks are tufts, not spikes: ${(Math.min(...lens) * 100).toFixed(1)}–${(Math.max(...lens) * 100).toFixed(1)} cm per metre of body`);
    // the fox's sculpt carries its own cheek ruff (tufts sculpted on its cheeks), so no locks are added there
    const cheek = f.L.filter(l => l.part === 'cheek'), ruffed = await A(() => { const C = window.__cdp, m = C.mq; return !!(C.HEAD_CATALOG[m.headSwap.d.id] || {}).ruff; });
    ok(ruffed && cheek.length === 0, `the sculpted head's own cheek ruff stands for the cheek tufts (ruff ${ruffed}, ${cheek.length} cheek locks)`);
    ok(f.L.every(l => !l.hid), `with nothing worn every tuft is drawn, the sculpted head's cheeks too (${f.L.filter(l => l.hid).length} hidden)`);
    const bib = f.L.filter(l => l.part === 'torso' && l.root[2] > f.chest[2] && Math.abs(l.root[0]) < .08 * f.size);
    ok(bib.length >= 10 && bib.filter(l => l.tip[1] < l.base[1]).length >= bib.length * .8, `a chest bib falling down the breastbone (${bib.length} locks)`);
    ok(bib.filter(l => l.belly > .4).length >= bib.length * .8, 'the bib takes the light colour of the fox\'s chest');
    const near = (l, p, r) => l.root && Math.hypot(l.root[0] - p[0], l.root[1] - p[1], l.root[2] - p[2]) < r * f.size;
    const el = f.L.filter(l => near(l, f.elbow, .08) && l.root[2] < f.elbow[2]), wr = f.L.filter(l => near(l, f.wrist, .09)), hk = f.L.filter(l => near(l, f.ankle, .09) && l.root[2] < f.ankle[2]);
    ok(el.length >= 3 && wr.length >= 6 && hk.length >= 3, `tufts behind the elbow (${el.length}), round the wrist (${wr.length}) and behind the hock (${hk.length})`);
    ok(wr.filter(l => l.tip[1] < l.base[1]).length >= wr.length * .8, 'the wrist tufts point down the arm, to the paw');
    // the heel fur sits behind the calcaneus: it does not widen the ankle seen from the front
    const hw = Math.max(...hk.map(l => Math.abs(l.tip[0] - f.ankle[0]))) / f.size;
    ok(hw < .028, `the hock tufts stay behind the heel, not out to the sides (${(hw * 100).toFixed(1)} cm/m from the ankle's midline)`);
    // the hair lies along the limb and lifts off only at the tips: a lock falls further than it stands out
    const lie = ls => ls.reduce((a, l) => a + (l.base[1] - l.tip[1]) / Math.hypot(l.tip[0] - l.base[0], l.tip[2] - l.base[2]), 0) / ls.length;
    ok(lie(el) > 1 && lie(wr) > 1, `elbow and wrist tufts lie down the forearm, not out from it (fall/stand ${lie(el).toFixed(1)}, ${lie(wr).toFixed(1)})`);
    // attached: in a pose, every arm lock keeps its place on the skin it grows from
    const drift = await A(() => {
      const C = window.__cdp, m = C.mq, fm = m.meshes.find(x => x.userData.fluff), bm = m.body3, R = fm.geometry.attributes.aRoot.array, F = C.FIG, v = new THREE.Vector3();
      const sk = (mesh, i) => mesh.boneTransform(i, v.fromBufferAttribute(mesh.geometry.attributes.position, i)).clone().applyMatrix4(mesh.matrixWorld);
      const at = [], gaps = () => { m.group.updateMatrixWorld(true); const out = []; for (let o = 0; o < R.length; o += 30) { const r = R[o]; if (r >= 0 && /^(arm|hand)R/.test(F.region[m.dom[r]])) { const b = sk(fm, o); at.push(b); out.push(b.distanceTo(sk(bm, r))); } } return out; };
      const g0 = gaps(); C.usePreset(C.POSES.find(p => p.id === 'saludo')); const g1 = gaps();
      return {gap: g0.length ? Math.max(...g0.map((g, i) => Math.abs(g - g1[i]))) / m.size : 1, moved: Math.max(...g0.map((g, i) => at[i].distanceTo(at[i + g0.length]))) / m.size}; });
    ok(drift.moved > .2 && drift.gap < .005, `waving, the arm's tufts travel with it (${(drift.moved * 100).toFixed(0)} cm/m) and stay where they grow (gaps to their roots change by ${(drift.gap * 1000).toFixed(1)} mm/m at most)`);
    await A(() => { const C = window.__cdp; C.usePreset(C.POSES.find(p => p.id === 'pie')); });
    // the fluff slider: fuller and longer tufts; quick to rebuild
    const at = v => A(v => { const C = window.__cdp, m = C.mq; m.body.fluff = v; C.furry.fluffGeo(m).dispose(); let t = Infinity;
      for (let i = 0; i < 10; i++) { const t0 = performance.now(); C.furry.fluffGeo(m).dispose(); t = Math.min(t, performance.now() - t0); }  // the best of ten: the machine's load aside
      const g = C.furry.fluffGeo(m), n = g.attributes.position.count; g.dispose(); return {n, t}; }, v);
    const lo = await at(.2), hi = await at(1);
    ok(hi.n > lo.n * 1.3, `more fluff, fuller tufts (${lo.n} → ${hi.n} vertices)`);
    ok(hi.t < 12, `generated in a few milliseconds (${hi.t.toFixed(1)} ms of script at full fluff, warmed up, best of ten)`);
    await A(() => { delete window.__cdp.mq.body.fluff; window.__cdp.rebuildActive(); });
    // a lion's mane is its ruff: no cheek or neck tufts on it; a dragon has scales, no fur
    await pick('leon'); const li = await locks();
    ok(li && !li.L.some(l => l.part === 'cheek' || l.part === 'neck'), `a lion's mane stands for its cheek and neck ruff (${li && li.L.length} locks elsewhere)`);
    await pick('dragon'); ok(await locks() === null, 'a dragon has no fur tufts');
    ok(page.errors.length === 0, `no JS errors ${page.errors.slice(0, 2).join(' | ')}`);
    await page.context().close();
  },
  // posing helpers: a pinned hand stays put, a library pose can be blended with the one before, a chair can be sat on
  async posing(browser) {
    const page = await open(browser), A = f => page.evaluate(f);
    await goTab(page, 'pose'); await page.evaluate(() => document.querySelector('details[data-sec=ayudas]').open = true);
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
    // a lens chip sets the focal length and shows pressed
    const lens = await A(() => { document.querySelector('#lensTicks .chip[data-v="85"]').click(); return {f: window.__cdp.state.focal, on: [...document.querySelectorAll('#lensTicks .chip[aria-pressed=true]')].map(b => b.dataset.v).join()}; });
    ok(lens.f === 85 && lens.on === '85', `the 85 mm chip sets the lens and shows pressed (${JSON.stringify(lens)})`);
    // the time of day asked for survives the set being built (undo, files, shots); a set picked by hand keeps its own in undo
    const amb = await A(async () => { const C = window.__cdp; await C.setEnv('estudio'); C.restore({...C.snapshot(), env: 'calle', amb: 'noche'}); await C.state.envReady; return {env: C.state.env, amb: C.state.amb}; });
    ok(amb.env === 'calle' && amb.amb === 'noche', `a scene restored with a set and a time of day keeps that time once the set is built (${JSON.stringify(amb)})`);
    await goTab(page, 'escena');
    await A(async () => { document.querySelector('#envChips .chip[data-v="calle"]').click(); await window.__cdp.state.envReady; });
    const amb2 = await A(async () => { const C = window.__cdp, a = C.state.amb; document.querySelector('#undo').click(); await C.state.envReady; const u = C.state.env; document.querySelector('#redo').click(); await C.state.envReady; return {picked: a, undone: u, env: C.state.env, amb: C.state.amb}; });
    ok(amb2.picked === 'dia' && amb2.undone !== 'calle' && amb2.env === 'calle' && amb2.amb === 'dia', `Calle picked by hand, undone and redone, comes back by day (${JSON.stringify(amb2)})`);
    // a light style is its own undo step: Ctrl+Z takes the light back and keeps the pose made before it
    const pa = await A(async () => { const C = window.__cdp; C.usePreset(C.POSES.find(p => p.id === 'senalar')); await new Promise(r => setTimeout(r, 500)); return {q: C.mq.getPose().q, light: JSON.stringify(C.state.light)}; });
    await goTab(page, 'luz'); await page.click('#lightChips .chip[data-v="contraluz"]'); await page.waitForTimeout(200);
    const lit = await A(() => window.__cdp.state.lightPreset);
    await page.keyboard.press('Control+z'); await page.waitForTimeout(600);
    const pz = await A(() => { const C = window.__cdp; return {q: C.mq.getPose().q, light: JSON.stringify(C.state.light), lp: C.state.lightPreset}; });
    const poseOff = Math.max(...Object.keys(pa.q).map(k => Math.max(...pa.q[k].map((v, i) => Math.abs(v - ((pz.q[k] || [])[i] ?? 9))))));
    ok(lit === 'contraluz' && pz.light === pa.light && poseOff < 1e-3 && pz.lp !== 'contraluz', `Ctrl+Z after «Contraluz» takes the light back and keeps the pose (${JSON.stringify({lit, light: pz.light === pa.light, poseOff})})`);
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
    await page.click('.tab[data-tab=pose]'); await page.waitForTimeout(200);  // (Animación opens on its Película tab)
    await page.evaluate(() => document.querySelector('details[data-sec=lib]').open = true);
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
    // with «Grabar la cámara» on, Cámara's buttons store camera keys; with it off, a shot whose camera is animated says so
    await goTab(page, 'camara'); await page.evaluate(() => { if (!window.__cdp.ANIM.camRec) document.querySelector('#tlCamRec').click(); });
    const ck = await A(async () => { const C = window.__cdp, n = () => C.ANIM.shots[C.ANIM.cur].cam.length, n0 = n();
      document.querySelector('#viewChips .chip:nth-child(3)').click(); const n1 = n();
      C.setFrameAnim(C.ANIM.f > 20 ? 4 : 36); document.querySelector('#frameBtn').click(); const n2 = n();
      document.querySelector('#tlCamRec').click(); document.querySelector('#viewChips .chip:nth-child(1)').click(); return {n0, n1, n2, n3: n(), warned: !!C.ANIM.camWarned}; });
    ok(ck.n1 > ck.n0 && ck.n2 > ck.n1 && ck.n3 === ck.n2 && ck.warned, `an angle and «Encuadrar a todos» key the recorded camera; unrecorded, it warns instead (${JSON.stringify(ck)})`);
    // the film's format sets the frame: Cámara's ratio chips are locked (none pressed) until the timeline closes
    const rl = () => A(() => { const b = [...document.querySelectorAll('#ratioChips .chip')]; return {off: b.filter(x => x.disabled).length, n: b.length, on: b.filter(x => x.getAttribute('aria-pressed') === 'true').length, note: !document.querySelector('#ratioNote').hidden}; });
    await page.evaluate(() => document.querySelector('#fpFormat .chip[data-v="2.39"]').click()); await page.waitForTimeout(200);
    const r1 = await rl();
    await page.evaluate(() => window.__cdp.spaces.setWorkspace('static')); await page.waitForTimeout(400);
    const r2 = await rl();
    ok(r1.off === r1.n && r1.on === 0 && r1.note && r2.off === 0 && r2.on === 1 && !r2.note, `the film's format locks the ratio chips, closing the timeline frees them (${JSON.stringify({r1, r2})})`);
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
    const info = await A(() => { const m = window.__cdp.mq, g = m.body3.geometry, I = g.attributes.aMuscP0; let used = 0; if (I) for (let i = 0; i < I.count; i++) if (I.array[i * 4]) used++;
      return {attrs: !!I, used, morphs: (g.morphAttributes.position || []).length, bones: m.skeleton.bones.filter(b => b.name === '_musc').length}; });
    ok(info.attrs && info.used > 2000 && info.morphs >= 7 && info.bones === 2, `muscles live in the vertices (${info.used} moved by some muscle) and the skeleton's two activation bones; the mouth and face keep their ${info.morphs} shapes`);
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
    await goTab(page, 'cuerpo'); await A(() => document.querySelector('details[data-sec=prop]').open = true);
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
    const worn = await A(() => window.__cdp.mq.garments.filter(g => g.geo).map(g => { const I = g.geo.attributes.aMuscP0; let u = 0; if (I) for (let i = 0; i < I.count; i++) if (I.array[i * 4]) u++; return u; }));
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
    await A(() => { document.querySelector('details[data-sec=prop]').open = true; document.querySelector('#advMore').open = true; });
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
  // anthro feet: a digitigrade leg with a hock, paws whose beans and claws can be counted, standing on the floor (a
  // sculpted hind paw, 11b-parts, where there is one; lofted toes elsewhere); hooves, a bear's sole, a rabbit's furred foot;
  // pads off, a missing foot and "Human feet" give the right thing back
  async furfeet(browser) {
    const page = await open(browser), A = (f, a) => page.evaluate(f, a);
    await goTab(page, 'cuerpo'); await page.waitForTimeout(400);
    const pick = async sp => { await A(sp => document.querySelector(`#speciesChips .chip[data-v="${sp}"]`).click(), sp); await page.waitForTimeout(2000); await partsReady(page); };
    // standing: each foot's mesh (the sculpted paw, or the lofted parts on the ankle) in connected pieces of one kind (1 fur,
    // 2 leather, 3 keratin: a sculpt's fur is one skin with its toes, its beans and claws pieces of their own), how low each
    // kind reaches and how long the paw is on the ground; the rest leg: the hock's height, how far its point sticks out
    // behind the joint, the joint's depth against the metatarsus'
    const feet = () => A(() => {
      const C = window.__cdp, m = C.mq, F = C.FIG.jIdx; C.usePreset(C.POSES.find(p => p.id === 'pie')); const floor = m.box(3).min.y, out = {floor, verts: 0};
      for (const s of ['L', 'R']) {
        const ab = m.accBones.indexOf(m.bones[F['ankle' + s]]), mesh = m.acc.find(a => !a.userData.hull && (a.geometry.userData.part ? /^foot/.test(a.geometry.userData.part) && a.geometry.attributes.position.array[0] > 0 === (s === 'L') : a.geometry.attributes.skinIndex.getX(0) === ab));
        if (!mesh) { out[s] = null; continue; }
        const g = mesh.geometry, n = g.attributes.position.count, I = g.index.array, E = g.attributes.aEye.array, par = Int32Array.from({length: n}, (_, i) => i), f = i => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; };
        for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const a = I[t + e], b = I[t + (e + 1) % 3]; if (Math.floor(-E[a * 4 + 3]) === Math.floor(-E[b * 4 + 3])) par[f(a)] = f(b); }
        const kinds = new Map(), lo = {1: Infinity, 2: Infinity, 3: Infinity}, v = new THREE.Vector3(); let z0 = Infinity, z1 = -Infinity;
        for (let i = 0; i < n; i++) { const k = Math.floor(-E[i * 4 + 3]) - 1; kinds.set(f(i), k); v.fromBufferAttribute(g.attributes.position, i); mesh.boneTransform(i, v); v.applyMatrix4(mesh.matrixWorld); lo[k] = Math.min(lo[k], v.y - floor);
          if (v.y - floor < .02) { z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z); } }
        const cnt = k => [...kinds.values()].filter(x => x === k).length; out[s] = [cnt(1), cnt(2), cnt(3)].join('/'); out['lo' + s] = lo; out.verts = Math.max(out.verts, n);
        if (s === 'R') out.paw = z1 - z0;
      }
      const J = m.J, P = m.anchors, ai = F.ankleR, Ay = J[ai * 3 + 1], Az = J[ai * 3 + 2], leg = new Set([F.kneeR, ai]); let zb = Infinity, h0 = Infinity, h1 = -Infinity, m0 = Infinity, m1 = -Infinity;
      for (let i = 0; i < C.FIG.meta.nV; i++) { if (!leg.has(m.dom[i])) continue; const y = P[i * 3 + 1], z = P[i * 3 + 2];
        if (Math.abs(y - Ay) < .015) { zb = Math.min(zb, z); h0 = Math.min(h0, z); h1 = Math.max(h1, z); }
        if (m.dom[i] === ai && Math.abs(y - Ay / 2) < .01) { m0 = Math.min(m0, z); m1 = Math.max(m1, z); } }
      // the shaft's depth and width in slices across it, at a third, two thirds and 85% of the hock's height (just under
      // its knob)
      const sl = f => { let z0 = Infinity, z1 = -Infinity, x0 = Infinity, x1 = -Infinity; for (let i = 0; i < C.FIG.meta.nV; i++) { if (m.dom[i] !== ai || Math.abs(P[i * 3 + 1] - Ay * f) > .006) continue;
        z0 = Math.min(z0, P[i * 3 + 2]); z1 = Math.max(z1, P[i * 3 + 2]); x0 = Math.min(x0, P[i * 3]); x1 = Math.max(x1, P[i * 3]); } return [z1 - z0, x1 - x0]; };
      const [dHi, wHi] = sl(.66), [dLo, wLo] = sl(.33), [dTop] = sl(.85);
      return {...out, hock: Ay / J[F.hipR * 3 + 1], heel: Az - zb, joint: (h1 - h0) / (m1 - m0), toe: J[F.toeR * 3 + 2] - Az, shaft: [dHi / dLo, wHi / wLo, dTop / dLo], pawK: out.paw / Ay};
    });
    await pick('lobo'); const wolf = await feet();
    ok(wolf.hock > .2 && wolf.hock < .4, `a wolf stands on its toes: the hock at ${(wolf.hock * 100).toFixed(0)}% of the hip's height`);
    ok(wolf.heel > .045 && wolf.joint > 1.3, `the point of the hock sticks out ${(wolf.heel * 100).toFixed(1)} cm behind the joint, which is ${wolf.joint.toFixed(1)}× as deep as the slim metatarsus`);
    ok(wolf.L === '1/5/4' && wolf.R === '1/5/4', `each paw: its toes one skin with it, four beans and the big pad, four claws (${wolf.R})`);
    ok(Math.abs(wolf.loR[2]) < .002 && wolf.loR[3] > -.001 && wolf.loR[3] < .015 && wolf.loR[1] > -.001, `standing, the pads are on the floor, the claws reach down to it, nothing goes through (${(wolf.loR[3] * 1000).toFixed(1)} mm)`);
    ok(wolf.verts < 5000, `each paw in ${wolf.verts} vertices, one mesh a foot`);
    ok(wolf.shaft.every(r => r > .75 && r < 1.4), `the metatarsus is an even shaft, not a wedge: under the hock ${wolf.shaft.map(r => r.toFixed(2)).join(' / ')} × as deep / wide (and just under the knob as deep) as above the paw`);
    ok(wolf.pawK > .33, `a compact paw on the ground, ${(wolf.pawK * 100).toFixed(0)}% as long as the metatarsus is high`);
    ok(wolf.loR[1] > .0015, `the toes stand on their beans: the fur stays ${(wolf.loR[1] * 1000).toFixed(1)} mm off the floor`);
    // one knee down: the kneeling leg's knee and paw on the floor, the hock folded between them (the paw's toes: the lowest
    // point of a sculpted paw, the rig's toe point on lofted toes); a run's trailing leg keeps the pose's own ankle
    const kn = await A(() => {
      const C = window.__cdp, m = C.mq, F = C.FIG.jIdx, V = THREE.Vector3, w = n => m.joints[n].getWorldPosition(new V()), q = new THREE.Quaternion();
      C.usePreset(C.POSES.find(p => p.id === 'rodilla')); m.group.updateMatrixWorld(true); const floor = m.box(3).min.y, sc = m.group.getWorldScale(new V()).y; m.joints.ankleR.getWorldQuaternion(q);
      const paw = m.acc.find(a => !a.userData.hull && /^foot/.test(a.geometry.userData.part || '') && a.geometry.attributes.position.array[0] < 0); let low = Infinity;
      if (paw) for (let i = 0; i < paw.geometry.attributes.position.count; i += 3) { const v = new V().fromBufferAttribute(paw.geometry.attributes.position, i); paw.boneTransform(i, v); low = Math.min(low, v.applyMatrix4(paw.matrixWorld).y); }
      const toe = paw ? low : w('ankleR').add(new V(...[0, 1, 2].map(k => m.J[F.toeR * 3 + k] - m.J[F.ankleR * 3 + k])).multiplyScalar(sc).applyQuaternion(q)).y, r = {toe: toe - floor, knee: w('kneeR').y - floor, hock: w('ankleR').y - floor};
      C.usePreset(C.POSES.find(p => p.id === 'correr')); r.run = m.joints.ankleR.rotation.x / Math.PI * 180; C.usePreset(C.POSES.find(p => p.id === 'pie')); return r;
    });
    ok(kn.toe < .03 && kn.knee < .07 && kn.hock > kn.toe, `kneeling, the knee (${(kn.knee * 100).toFixed(1)} cm) and the paw's toes (${(kn.toe * 100).toFixed(1)} cm) are on the floor, the hock up between them`);
    ok(Math.abs(kn.run - 35) < .5, `a run's trailing leg keeps its ankle (${kn.run.toFixed(1)}°)`);
    // the underside of the right foot, standing: a bear's sole pad (the largest leather piece) as wide across its back
    // quarter as across its front one; a hoof's keratin, how low its middle comes against its rim
    const under = () => A(() => {
      const C = window.__cdp, m = C.mq, F = C.FIG.jIdx; C.usePreset(C.POSES.find(p => p.id === 'pie')); const floor = m.box(3).min.y, ab = m.accBones.indexOf(m.bones[F.ankleR]);
      const mesh = m.acc.find(a => !a.userData.hull && a.geometry.attributes.skinIndex.getX(0) === ab), g = mesh.geometry, n = g.attributes.position.count, I = g.index.array, E = g.attributes.aEye.array;
      const par = Int32Array.from({length: n}, (_, i) => i), f = i => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; };
      for (let t = 0; t < I.length; t += 3) { par[f(I[t + 1])] = f(I[t]); par[f(I[t + 2])] = f(I[t]); }
      const W = [], v = new THREE.Vector3(), size = new Map();
      for (let i = 0; i < n; i++) { v.fromBufferAttribute(g.attributes.position, i); mesh.boneTransform(i, v); v.applyMatrix4(mesh.matrixWorld); W.push([v.x, v.y - floor, v.z, Math.floor(-E[i * 4 + 3]) - 1]); size.set(f(i), (size.get(f(i)) || 0) + 1); }
      const pts = k => W.filter((p, i) => p[3] === k && (k !== 2 || size.get(f(i)) === Math.max(...[...size.keys()].filter(r => W[r][3] === 2).map(r => size.get(r)))));
      const across = (P, a, b) => { const z0 = Math.min(...P.map(p => p[2])), z1 = Math.max(...P.map(p => p[2])), q = P.filter(p => { const u = (p[2] - z0) / (z1 - z0); return u > a && u < b; }); return Math.max(...q.map(p => p[0])) - Math.min(...q.map(p => p[0])); };
      const pad = pts(2), hoof = pts(3), cx = hoof.reduce((s, p) => s + p[0], 0) / hoof.length, cz = hoof.reduce((s, p) => s + p[2], 0) / hoof.length;
      const mid = hoof.filter(p => Math.hypot(p[0] - cx, p[2] - cz) < .015), rim = Math.min(...hoof.map(p => p[1]));
      const Pa = m.anchors, foot = []; for (let i = 0; i < C.FIG.meta.nV; i++) if (m.dom[i] === F.ankleR && Pa[i * 3 + 1] < .03) foot.push([Pa[i * 3], 0, Pa[i * 3 + 2]]);
      return {sole: pad.length ? across(pad, .2, .38) / across(pad, .7, .88) : 0, heel: foot.length ? across(foot, .1, .3) / across(foot, .6, .8) : 0, vault: mid.length ? Math.min(...mid.map(p => p[1])) - rim : 0, rim};
    });
    const kinds = {};
    for (const sp of ['gato', 'oso', 'conejo', 'dragon', 'caballo', 'cabra']) { await pick(sp); const f = await feet(); kinds[sp] = f.R; if (sp === 'oso') { kinds.osoHock = f.hock; const u = await under(); kinds.osoSole = u.sole; kinds.osoHeel = u.heel; } if (sp === 'caballo') kinds.hoof = await under(); }
    ok(kinds.osoSole > .6 && kinds.osoHeel > .8, `a bear's sole is a broad print, not a wedge: the heel ${(kinds.osoHeel * 100).toFixed(0)}% as wide as the ball, its pad ${(kinds.osoSole * 100).toFixed(0)}%`);
    ok(kinds.hoof.vault > .002 && kinds.hoof.rim < .002, `a hoof stands on the rim of its wall (${(kinds.hoof.rim * 1000).toFixed(1)} mm off the floor), its sole vaulted ${(kinds.hoof.vault * 1000).toFixed(1)} mm inside it`);
    ok(kinds.gato === '1/5/4' && kinds.oso === '5/6/5' && kinds.osoHock < .12, `a cat's paw has a wolf's beans, only the points of its sheathed claws showing (${kinds.gato}); a bear has five toes, five beans and its sole, and stands on its heel (${kinds.oso})`);
    ok(kinds.conejo === '4/0/0' && kinds.dragon === '4/4/4', `a rabbit's foot is furred, without pads or claws; a dragon has three toes and a dewclaw, each with its talon (${kinds.conejo}, ${kinds.dragon})`);
    ok(kinds.caballo === '0/1/1' && kinds.cabra === '0/0/4', `a horse stands on one hoof with its frog under it, a goat on a cloven one with two dewclaws (${kinds.caballo}, ${kinds.cabra})`);
    // pads off; a leg that ends at the ankle has no paw; "Human feet" give the human foot back
    await pick('lobo'); await A(() => { const c = document.querySelector('#padsChk'); c.checked = false; c.dispatchEvent(new Event('change')); }); await page.waitForTimeout(800);
    const bare = await feet(), bareHands = await A(() => window.__cdp.mq.acc.filter(a => !a.userData.hull && /^hand/.test(a.geometry.userData.part || '')).map(a => { const E = a.geometry.attributes.aEye.array; let k2 = 0; for (let i = 3; i < E.length; i += 4) if (Math.floor(-E[i]) - 1 === 2) k2++; return k2; }));
    ok(bare.R === '1/0/4' && bareHands.length === 2 && bareHands.every(k => !k), `without pads, the paws keep their toes and claws, their beans fur (${bare.R}; ${bareHands.join(', ')} leather points on the paw-hands)`);
    await A(() => { const C = window.__cdp; C.mq.body.pads = undefined; C.mq.body.limbs = {legR: {cut: 'tobillo'}}; C.rebuildActive(true); }); await page.waitForTimeout(800);
    const cut = await feet(); ok(cut.R === null && cut.L === '1/5/4', 'a leg cut at the ankle has no paw floating under it');
    await A(() => { const C = window.__cdp; delete C.mq.body.limbs; C.rebuildActive(true); }); await page.waitForTimeout(500);
    // trousers on a digitigrade leg end at the hock: no skin they hide lies below the cloth (a hole), none behind the hock
    // sticks out of it. (The skin a sculpted paw covers is the paw's to hide: a hole is hidden skin below the hem that it
    // does not cover, neither inside it, by the crossings of a ray with its surface, nor within 2 mm of that)
    await A(() => window.__cdp.spaces.goTab('ropa')); await page.waitForTimeout(1500);
    await A(() => document.querySelector('#outfitChips .chip[data-v="traje"]').click());
    await page.waitForFunction(() => { const m = window.__cdp.mq; return m.garments.length && m.garments.every(g => g.d && g.geo); }, null, {timeout: 60000}); await page.waitForTimeout(800);
    const pants = await A(() => {
      const C = window.__cdp, m = C.mq, F = C.FIG.jIdx, P = m.anchors, Hd = m.geo.attributes.aHide.array, ai = F.ankleR, Ay = m.J[ai * 3 + 1], Az = m.J[ai * 3 + 2];
      let gy = Infinity, gz = Infinity; for (const g of m.garments) { const G = g.geo.attributes.position.array; for (let i = 0; i < G.length; i += 3) if (G[i] < -.04 && G[i + 1] < Ay + .3) { gy = Math.min(gy, G[i + 1]); if (Math.abs(G[i + 1] - Ay) < .03) gz = Math.min(gz, G[i + 2]); } }
      const paw = m.acc.find(a => !a.userData.hull && /^foot/.test(a.geometry.userData.part || '') && a.geometry.attributes.position.array[0] < 0), V = THREE.Vector3;
      const covered = (() => { if (!paw) return () => false; const g = paw.geometry, Q = g.attributes.position.array, I = g.index.array, E = g.attributes.aEye.array, tri = [];
        for (let t = 0; t < I.length; t += 3) if ([0, 1, 2].every(k => Math.floor(-E[I[t + k] * 4 + 3]) - 1 !== 3)) tri.push(I[t], I[t + 1], I[t + 2]);
        const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(Q, 3)); sg.setIndex(tri);
        const mesh = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({side: THREE.DoubleSide})), rc = new THREE.Raycaster(), dir = new V(.31, .17, .93).normalize();
        const T = new THREE.Triangle(), c = new V(), p = new V();
        return (x, y, z) => { p.set(x, y, z); rc.set(p, dir); if (rc.intersectObject(mesh).length % 2) return true;
          for (let t = 0; t < tri.length; t += 3) { T.set(...[0, 1, 2].map(k => new V().fromArray(Q, tri[t + k] * 3))); if (T.closestPointToPoint(p, c).distanceTo(p) < .002) return true; } return false; }; })();
      const byLeg = new Set(m.acc.filter(a => !a.userData.hull && /^(leg-digi|body-)/.test(a.geometry.userData.part || '')).flatMap(a => [...a.geometry.userData.under || []]));   // (the sculpted leg's or body's skin)
      let holes = 0, out = 0; for (let i = 0; i < C.FIG.meta.nV; i++) { if (m.dom[i] !== ai) continue; if (Hd[i] > .99 && P[i * 3 + 1] < gy - .002 && !covered(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]) && !byLeg.has(i)) holes++; if (Math.abs(P[i * 3 + 1] - Ay) < .03 && P[i * 3 + 2] < Az && Hd[i] < .5 && P[i * 3 + 2] < gz - .002) out++; }
      return {holes, out, hem: (Ay - gy) / Ay};
    });
    ok(!pants.holes && !pants.out && pants.hem > 0 && pants.hem < .4, `trousers end under the hock (${(pants.hem * 100).toFixed(0)}% down the metatarsus): ${pants.holes} hidden skin vertices below the hem, ${pants.out} behind the hock outside the cloth`);
    // jeans with shoes and loose trousers: the cuff is gathered on the leg (no cloth below it, nothing standing off the skin
    // under the hem), and the shoes, which do not go on paws, are neither drawn nor lift the figure
    const cuff = {};
    for (const o of ['camiseta', 'casual']) {
      // (shoes cannot be put on paws: worn before the species changed, they are put back on here)
      await A(o => { document.querySelector(`#outfitChips .chip[data-v="${o}"]`).click(); const m = window.__cdp.mq; if (!m.outfit.some(s => s.id === 'm_shoes06')) window.__cdp.setOutfitNow(m, [...m.outfit, window.__cdp.garmentSpec('m_shoes06')]); }, o);
      await page.waitForFunction(() => { const m = window.__cdp.mq; return m.garments.length && m.garments.every(g => g.d && g.geo); }, null, {timeout: 60000}); await page.waitForTimeout(800);
      cuff[o] = await A(() => {
        const C = window.__cdp, m = C.mq, F = C.FIG.jIdx, P = m.anchors, ai = F.ankleR, Ay = m.J[ai * 3 + 1], hy = Ay * .8, skin = [];
        for (let i = 0; i < C.FIG.meta.nV; i++) if (m.dom[i] === ai && P[i * 3 + 1] < Ay) skin.push(i);
        let low = 0, far = 0, shoe = 0;
        for (const g of m.garments) { const G = g.geo.attributes.position.array, Hd = g.geo.attributes.aHide.array, foot = g.spec.id === 'm_shoes06';
          for (let i = 0; i < G.length / 3; i++) { if (Hd[i] > .99) continue; if (foot) { shoe++; continue; } const x = G[i * 3], y = G[i * 3 + 1], z = G[i * 3 + 2]; if (x > 0 || y > hy) continue;
            if (y < hy - .035) low++; let d = Infinity; for (const k of skin) d = Math.min(d, (P[k * 3] - x) ** 2 + (P[k * 3 + 1] - y) ** 2 + (P[k * 3 + 2] - z) ** 2); if (Math.sqrt(d) > .06) far++; } }
        return {low, far, shoe, pad: m.groundPad || 0, shoes: m.outfit.some(s => s.id === 'm_shoes06')};
      });
    }
    ok(Object.values(cuff).every(c => !c.low && !c.far), `a trouser cuff gathers on the leg under the hock: ${Object.entries(cuff).map(([o, c]) => `${o} ${c.low} below it, ${c.far} off the skin`).join(', ')}`);
    ok(cuff.camiseta.shoes && !cuff.camiseta.shoe && !cuff.camiseta.pad, `shoes worn with the outfit are not drawn on the paws and do not lift them (${cuff.camiseta.shoe} visible vertices)`);
    await A(() => document.querySelector('#outfitNone').click()); await page.waitForTimeout(500); await goTab(page, 'cuerpo'); await page.waitForTimeout(400);
    await A(() => document.querySelector('#feetChips .chip[data-v="humano"]').click()); await page.waitForTimeout(800);
    const hum = await feet(); ok(hum.L === null && hum.R === null && hum.hock < .12 && hum.toe > .05, `"Human feet": a human foot again, flat on the floor (ankle at ${(hum.hock * 100).toFixed(0)}% of the hip)`);
    ok(!page.errors.length, 'no errors' + (page.errors.length ? ': ' + page.errors.join(' | ') : ''));
    await page.context().close();
  },
  // the sculpted paws (11b-parts): which species wear them, fingers that curl with their bones, the heart pad and four
  // beans under each hind paw, the body hidden under the parts and only there, and what they cost on every rebuild
  async furparts(browser) {
    const page = await open(browser), A = (f, a) => page.evaluate(f, a);
    await goTab(page, 'cuerpo'); await page.waitForTimeout(400);
    const pick = async sp => { await A(sp => document.querySelector(`#speciesChips .chip[data-v="${sp}"]`).click(), sp); await page.waitForTimeout(1500); await partsReady(page); };
    // canids and felids wear sculpted paw-hands, hind paws and lower legs; a bear and a dragon the hands (a bear's foot is plantigrade,
    // a dragon's lofted, three toes and a dewclaw); rabbits (furred paws), hooves and humans none
    const worn = () => A(() => window.__cdp.mq.acc.filter(a => !a.userData.hull && a.geometry.userData.part).map(a => a.geometry.userData.part).sort().join());
    // (where the whole body is sculpted, one skin from the neck down, its hands, lower legs and paws are its pieces, named as the parts)
    const two = (...ids) => ids.flatMap(i => [i, i]).sort().join(), body = (b, ...ids) => [b, ...ids.flatMap(i => [i, i])].sort().join();
    const want = {lobo: body('body-canid', 'foot-canid', 'hand-canid', 'leg-digi'), zorro: body('body-canid', 'foot-canid', 'hand-canid', 'leg-digi'), gato: body('body-felid', 'foot-felid', 'hand-felid', 'leg-digi'),
      tigre: body('body-felid', 'foot-felid', 'hand-felid', 'leg-digi'), oso: two('hand-bear'), dragon: two('hand-dragon'), conejo: '', caballo: '', humano: ''}, wear = {};
    for (const sp of Object.keys(want)) { await pick(sp); wear[sp] = await worn(); }
    ok(Object.keys(want).every(k => wear[k] === want[k]), `the sculpted parts each species wears: ${Object.entries(wear).map(([k, v]) => `${k} ${[...new Set(v.split(',').filter(Boolean))].join('+') || 'none'}`).join(', ')}`);
    // the paw-hand's fingers curl with the bones: the points its fingers' outer segments carry alone stay where they were in
    // their bone's frame as the hand closes, and go with it, centimetres
    await pick('lobo');
    const curl = await A(() => { const C = window.__cdp, m = C.mq, F = C.FIG, V = THREE.Vector3, a = m.acc.find(x => !x.userData.hull && /^hand/.test(x.geometry.userData.part || '') && x.geometry.attributes.position.array[0] < 0);
      const g = a.geometry, si = g.attributes.skinIndex.array, sw = g.attributes.skinWeight.array, pts = [];
      for (let i = 0; i < g.attributes.position.count; i += 2) if (/^fR\d[12]$/.test(F.meta.bones[si[i * 4]]) && sw[i * 4] > .999) pts.push(i);
      const at = c => { C.usePreset(C.POSES.find(p => p.id === 'saludo')); m.hands.R = {c, s: 0, t: 0}; m.applyHands(); m.group.updateMatrixWorld(true); m.skeleton.update();
        return pts.map(i => { const v = new V().fromBufferAttribute(g.attributes.position, i); a.boneTransform(i, v); v.applyMatrix4(a.matrixWorld); return [v.clone(), v.applyMatrix4(new THREE.Matrix4().copy(m.bones[si[i * 4]].matrixWorld).invert())]; }); };
      const open = at([0, 0, 0, 0, 0]), shut = at([1, 1, 1, 1, 1]); let drift = 0, moved = 0;
      open.forEach(([w, l], k) => { drift = Math.max(drift, l.distanceTo(shut[k][1])); moved = Math.max(moved, w.distanceTo(shut[k][0])); });
      C.usePreset(C.POSES.find(p => p.id === 'pie')); return {n: pts.length, drift, moved}; });
    ok(curl.n > 100 && curl.drift < 1e-4 && curl.moved > .03, `the paw's fingers curl with their bones: ${curl.n} points of their outer segments keep their place on the bone (${(curl.drift * 1000).toFixed(3)} mm) as the hand closes, moving up to ${(curl.moved * 100).toFixed(1)} cm`);
    // under each hind paw (as laid on the leg, at rest: a pose may roll it a little) the heart-shaped metatarsal pad behind
    // four beans, every one of them on the ground the paw stands on
    const beans = () => A(() => { const C = window.__cdp, m = C.mq, F = C.FIG.jIdx, out = [];
      const fwd = new THREE.Vector3(m.J[F.toeR * 3] - m.J[F.ankleR * 3], 0, m.J[F.toeR * 3 + 2] - m.J[F.ankleR * 3 + 2]).normalize(), side = new THREE.Vector3(0, 1, 0).cross(fwd);
      for (const a of m.acc.filter(x => !x.userData.hull && /^foot/.test(x.geometry.userData.part || ''))) {
        const g = a.geometry, n = g.attributes.position.count, I = g.index.array, E = g.attributes.aEye.array, kind = i => Math.floor(-E[i * 4 + 3]) - 1, par = Int32Array.from({length: n}, (_, i) => i), f = i => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; };
        for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const p = I[t + e], q = I[t + (e + 1) % 3]; if (kind(p) === 2 && kind(q) === 2) par[f(p)] = f(q); }
        const isl = new Map(), v = new THREE.Vector3(); let floor = Infinity; for (let i = 1; i < n * 3; i += 3) floor = Math.min(floor, g.attributes.position.array[i]);
        for (let i = 0; i < n; i++) { if (kind(i) !== 2) continue; v.fromBufferAttribute(g.attributes.position, i);
          const r = f(i), o = isl.get(r) || {n: 0, c: 0, low: Infinity, f0: Infinity, f1: -Infinity, s0: Infinity, s1: -Infinity}, u = v.dot(fwd), w = v.dot(side); isl.set(r, o);
          o.n++; o.c += u; o.low = Math.min(o.low, v.y - floor); o.f0 = Math.min(o.f0, u); o.f1 = Math.max(o.f1, u); o.s0 = Math.min(o.s0, w); o.s1 = Math.max(o.s1, w); }
        const pads = [...isl.values()].map(o => ({at: o.c / o.n, low: o.low, area: (o.f1 - o.f0) * (o.s1 - o.s0)})).sort((p, q) => q.area - p.area);
        out.push({pads: pads.length, heart: pads[0].area / Math.max(...pads.slice(1).map(p => p.area)), behind: pads.slice(1).every(p => p.at > pads[0].at), low: Math.max(...pads.map(p => p.low))});
      }
      return out; });
    const paws = {lobo: await beans()}; await pick('gato'); paws.gato = await beans();
    ok(Object.values(paws).every(ps => ps.length === 2 && ps.every(p => p.pads === 5 && p.heart > 1.5 && p.behind && p.low < .001)), `under each hind paw the heart pad, ${Object.values(paws).map(ps => ps[0].heart.toFixed(1)).join(' / ')}× a bean's size, behind four beans, all five on the ground it stands on (wolf, cat)`);
    // the human body under the sculpted one is not drawn, all of it below the head (the sculpt is what the body is now: the
    // human trunk, arms and legs, thinner here and fuller there, would show through it in patches); "Human" hands bring
    // back the parts and the human hands
    await pick('lobo');
    const hide = await A(() => { const C = window.__cdp, m = C.mq, F = C.FIG, P = m.geo.attributes.position.array, H = m.geo.attributes.aHide.array, yc = m.headSwap.yc;
      let below = 0, shown = 0; for (let i = 0; i < F.meta.nV; i++) { if (F.eye[i] || m.dom[i] === F.jIdx.head || m.dom[i] === F.jIdx.jaw) continue; below++; if (H[i] < .99) shown++; }
      return {below, shown}; });
    await A(() => document.querySelector('#handsChips .chip[data-v="humanas"]').click()); await page.waitForTimeout(800);
    const back = await A(() => { const C = window.__cdp, m = C.mq, F = C.FIG, H = m.geo.attributes.aHide.array; let n = 0, arm = 0; for (let i = 0; i < F.meta.nV; i++) { if (m.dom[i] === F.jIdx.fR21 && H[i] > .5) n++; if (m.dom[i] === F.jIdx.elbowR && H[i] < .5) arm++; }
      return {n, arm, worn: m.acc.filter(a => !a.userData.hull && a.geometry.userData.part).map(a => a.geometry.userData.part).join()}; });
    await A(() => document.querySelector('#handsChips .chip[data-v="animal"]').click()); await page.waitForTimeout(800);
    ok(hide.below > 5000 && !hide.shown, `the sculpted body hides the human one below the head, the throat under the head's cut aside (${hide.shown} of ${hide.below} points drawn)`);
    ok(!back.n && back.arm > 50 && !/body|hand/.test(back.worn), `with "Human" hands the human body and hands are drawn again, the hind paws sculpted parts (${back.worn})`);
    // their cost: built again with the body on every slider drag (where the pads go and the fist's reach are kept), they take
    // no longer than the lofted parts they replace on the same body
    // (each timed in turn with the other, the quickest of twelve: the least a run is disturbed by anything else)
    const cost = await A(() => { const C = window.__cdp, m = C.mq, F = C.furry, P = m.geo.attributes.position.array, out = {parts: Infinity, lofted: Infinity}, fn = {parts: () => { F.handPartGeos(m); F.footPartGeos(m); }, lofted: () => { F.handGeos(m, P); F.footGeos(m, P); }};
      for (let i = 0; i < 13; i++) for (const k of ['parts', 'lofted']) { const t0 = performance.now(); fn[k](); if (i) out[k] = Math.min(out[k], performance.now() - t0); }
      return out; });
    ok(cost.parts < Math.max(cost.lofted, 5), `the sculpted parts build in ${cost.parts.toFixed(1)} ms a character (the lofted parts on the same body ${cost.lofted.toFixed(1)} ms)`);
    ok(!page.errors.length, 'no errors' + (page.errors.length ? ': ' + page.errors.join(' | ') : ''));
    await page.context().close();
  },
  // limb differences: stumps that close, joints that are not there stay still, prostheses that pose, a wheelchair
  async limbs(browser) {
    const page = await open(browser), A = (f, a) => page.evaluate(f, a);
    await goTab(page, 'cuerpo'); await A(() => document.querySelector('details[data-sec=extremidades]').open = true);
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
  // paw-hands: fingers thick and knuckled, a sculpted paw (11b-parts) with its pads and claws over the hand, claws out of
  // the finger tips that stay on them as the hand closes (a paw's fist, no claw through the palm, no skin torn), hooves,
  // "Human" hands and feet, gloves, a missing hand
  async furhands(browser) {
    const page = await open(browser), A = (f, a) => page.evaluate(f, a);
    await goTab(page, 'cuerpo'); await page.waitForTimeout(400);
    const species = async sp => { await A(sp => document.querySelector(`#speciesChips .chip[data-v="${sp}"]`).click(), sp); await page.waitForTimeout(2500); await partsReady(page); };
    // in the page: the hand parts (a sculpted paw-hand a side, pawL and pawR: fur, leather pads and keratin claws in one mesh
    // on the body's skeleton; or the lofted claws or hooves on the finger tips' bones and pads on the skin), points as drawn,
    // joints at rest, the connected pieces of one kind of a mesh (a paw's beans, its claws)
    await A(() => { const C = window.__cdp, V = THREE.Vector3, F = C.FIG;
      window.__hp = {
        parts: () => { const o = {}; for (const a of C.mq.acc) { if (a.userData.hull) continue; const g = a.geometry, k = g.userData.hand || (/^hand/.test(g.userData.part || '') && (g.attributes.position.array[0] < 0 ? 'pawR' : 'pawL')); if (k) o[k] = a; } return o; },
        world: (mesh, i) => { const v = new V().fromBufferAttribute(mesh.geometry.attributes.position, i); mesh.boneTransform(i, v); return v.applyMatrix4(mesh.matrixWorld); },
        posed: mesh => { const g = mesh.geometry, n = g.attributes.position.count, out = new Float32Array(n * 3), v = new V(); for (let i = 0; i < n; i++) { v.fromBufferAttribute(g.attributes.position, i); mesh.boneTransform(i, v); v.applyMatrix4(mesh.matrixWorld); out.set([v.x, v.y, v.z], i * 3); } return out; },
        jv: n => { const J = C.mq.J, k = F.jIdx[n]; return new V(J[k * 3], J[k * 3 + 1], J[k * 3 + 2]); },
        kind: (g, i) => Math.floor(-g.attributes.aEye.array[i * 4 + 3]) - 1,
        islands: (g, k) => { const H = window.__hp, n = g.attributes.position.count, I = g.index.array, par = Int32Array.from({length: n}, (_, i) => i), f = i => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; };
          for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const a = I[t + e], b = I[t + (e + 1) % 3]; if (H.kind(g, a) === k && H.kind(g, b) === k) par[f(a)] = f(b); }
          const out = new Map(); for (let i = 0; i < n; i++) if (H.kind(g, i) === k) { const r = f(i); if (!out.has(r)) out.set(r, []); out.get(r).push(i); }
          return [...out.values()].filter(v => v.length > 3); },
        pose: (id, c) => { const m = C.mq; C.usePreset(C.POSES.find(p => p.id === id)); if (c) { m.hands.R = {c, s: 0, t: 0}; m.applyHands(); } m.group.updateMatrixWorld(true); m.skeleton.update(); m.accSkeleton.update(); }
      }; });
    const summary = () => A(() => { const H = window.__hp, o = {}; for (const [k, a] of Object.entries(H.parts())) { const g = a.geometry, kinds = new Set();
      for (let i = 0; i < g.attributes.position.count; i++) kinds.add(H.kind(g, i));
      o[k] = {n: g.attributes.position.count, kinds: [...kinds].sort().join(), body: a.skeleton === window.__cdp.mq.skeleton, nan: Array.from(g.attributes.position.array).some(v => !isFinite(v)),
        pads: g.userData.part ? H.islands(g, 2).length : 0, claws: g.userData.part ? H.islands(g, 3).length : 0}; } return o; });
    // the right middle finger's middle segment: its half width, and how far its back stands out at the knuckle against its middle
    const finger = () => A(() => { const C = window.__cdp, H = window.__hp, m = C.mq, F = C.FIG, P = m.geo.attributes.position.array, a = H.jv('fR21'), d = H.jv('fR22').sub(a), L = d.length(); d.normalize();
      const n = m.handAxes.R.n; let w = 0, near = 0, mid = 0;
      for (let i = 0; i < F.meta.nV; i++) if (m.dom[i] === F.jIdx.fR21) { const v = new THREE.Vector3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).sub(a), t = v.dot(d) / L; v.addScaledVector(d, -v.dot(d)); w = Math.max(w, v.length());
        const dor = -v.dot(n); if (t < .2) near = Math.max(near, dor); else if (t > .35 && t < .65) mid = Math.max(mid, dor); }
      // and how smooth its skin is: each vertex's offset from its neighbours' mean, in edge lengths (the 95th percentile over
      // the fingers' backs), so knuckles come out as rounded swellings, not facets
      const fb = new Set([0, 1, 2, 3, 4].flatMap(f => [0, 1, 2].map(k => F.jIdx[`fR${f}${k}`]))), nb = new Map(), I = F.index;
      for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) { const a = I[t + k], b = I[t + (k + 1) % 3]; if (!fb.has(m.dom[a]) || !fb.has(m.dom[b])) continue; for (const [x, y] of [[a, b], [b, a]]) { if (!nb.has(x)) nb.set(x, new Set()); nb.get(x).add(y); } }
      const lap = []; for (const [i, ns] of nb) { if (ns.size < 4 || (N => N[i * 3] * n.x + N[i * 3 + 1] * n.y + N[i * 3 + 2] * n.z)(m.geo.attributes.normal.array) > -.3) continue; let cx = 0, cy = 0, cz = 0, e = 0;
        for (const j of ns) { cx += P[j * 3]; cy += P[j * 3 + 1]; cz += P[j * 3 + 2]; e += Math.hypot(P[j * 3] - P[i * 3], P[j * 3 + 1] - P[i * 3 + 1], P[j * 3 + 2] - P[i * 3 + 2]); }
        lap.push(Math.hypot(cx / ns.size - P[i * 3], cy / ns.size - P[i * 3 + 1], cz / ns.size - P[i * 3 + 2]) / (e / ns.size)); }
      lap.sort((a, b) => a - b);
      return {w, knuckle: near / mid, rough: lap[Math.floor(lap.length * .95)]}; });
    // how far the skin's edges stretch when the right hand closes into a fist (c), against saludo with the hand open: the
    // most any one grows (mm), on a mesh's points (the paw's, or the body's own hand)
    const stretch = (paw, c) => A(([paw, c]) => { const C = window.__cdp, H = window.__hp, m = C.mq, F = C.FIG, mesh = paw ? H.parts().pawR : m.body3, g = mesh.geometry, I = g.index.array;
      const hand = new Set(['wristR', ...[0, 1, 2, 3, 4].flatMap(f => [0, 1, 2].map(k => `fR${f}${k}`))].map(n => F.jIdx[n])), on = i => paw ? H.kind(g, i) !== 3 : hand.has(m.dom[i]);
      H.pose('saludo', [0, 0, 0, 0, 0]); const a = H.posed(mesh); H.pose('saludo', c); const b = H.posed(mesh); let worst = 0;
      for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const p = I[t + e] * 3, q = I[t + (e + 1) % 3] * 3; if (!on(p / 3) || !on(q / 3)) continue;
        worst = Math.max(worst, Math.hypot(b[p] - b[q], b[p + 1] - b[q + 1], b[p + 2] - b[q + 2]) - Math.hypot(a[p] - a[q], a[p + 1] - a[q + 1], a[p + 2] - a[q + 2])); }
      return worst * 1000; }, [paw, c]);
    await species('lobo'); const wolf = await summary(), wf = await finger();
    ok(wolf.pawL && wolf.pawR && wolf.pawR.kinds === '1,2,3' && wolf.pawR.body && !wolf.pawR.nan && !wolf.pawL.nan && !wolf.claws && !wolf.pads,
      `a wolf's hands are sculpted paws on the body's skeleton: fur, leather pads and keratin claws (${JSON.stringify(wolf)})`);
    ok(wolf.pawR.n < 6000 && wolf.pawL.n < 6000, `each paw-hand stays light (${wolf.pawR.n} points)`);
    // rebuilt with the body on every slider drag: as quick as the feet's parts, for the paws, a dragon's and a horse's hooves
    // (lofted: those have no sculpt)
    const timing = () => A(() => { const C = window.__cdp, m = C.mq, F = C.furry, P = m.geo.attributes.position.array, t = f => { f(); const t0 = performance.now(); for (let i = 0; i < 8; i++) f(); return (performance.now() - t0) / 8; };
      return {hand: t(() => F.partFor(m.body, 'hand') ? F.handPartGeos(m) : F.handGeos(m, P)), foot: t(() => F.partFor(m.body, 'foot') ? F.footPartGeos(m) : F.footGeos(m, P))}; });
    const speed = {lobo: await timing()}; for (const sp of ['dragon', 'caballo']) { await species(sp); speed[sp] = await timing(); } await species('lobo');
    ok(Object.values(speed).every(t => t.hand < Math.max(5, speed.lobo.foot * 2.5)), `the hand parts build in a few milliseconds (${Object.entries(speed).map(([k, t]) => `${k} ${t.hand.toFixed(1)} ms`).join(', ')}; the wolf's feet ${speed.lobo.foot.toFixed(1)} ms)`);
    // the pads are inked round their rims, as every bean is in the drawings: in Solo línea the ink pass draws the border
    // where the paw's leather meets its fur (a part of its own in the ink buffer); seen on the open palm
    const style0 = await A(() => window.__cdp.mq.style); await goTab(page, 'dibujo'); await A(() => document.querySelector('#styleChips .chip[data-v="contorno"]').click()); await page.waitForTimeout(300);
    const rim = await A(() => { const C = window.__cdp, H = window.__hp, m = C.mq, F = C.FIG.jIdx; H.pose('saludo', [0, 0, 0, 0, 0]);
      const w = m.joints.wristR, n = m.handAxes.R.n.clone().applyQuaternion(w.getWorldQuaternion(new THREE.Quaternion())), c = m.bones[F.fR20].getWorldPosition(new THREE.Vector3()).lerp(w.getWorldPosition(new THREE.Vector3()), .4);
      C.controls.target.copy(c); C.camera.position.copy(c).addScaledVector(n, .25); C.camera.lookAt(c); C.controls.update();
      const S = 480, ink = C.renderView({w: S, h: S, bg: 'lines'}).getContext('2d').getImageData(0, 0, S, S).data, rt = C.ink.INK.rts.get(S + 'x' + S), id = new Uint8Array(S * S * 4); C.renderer.readRenderTargetPixels(rt, 0, 0, S, S, id);
      const kindAt = (x, y) => { const j = ((S - 1 - y) * S + x) * 4; return id[j + 3] > 128 ? id[j + 2] % 8 : -1; }, inked = (x, y) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (ink[((y + dy) * S + x + dx) * 4 + 3] > 100) return true; return false; };
      let leather = 0, rim = 0, on = 0;
      for (let y = 3; y < S - 3; y++) for (let x = 3; x < S - 3; x++) { const k = kindAt(x, y); if (k !== 2) continue; leather++;
        if ([[3, 0], [-3, 0], [0, 3], [0, -3]].some(([dx, dy]) => kindAt(x + dx, y + dy) === 0)) { rim++; if (inked(x, y)) on++; } }
      return {leather, rim, on}; });
    await A(st => document.querySelector(`#styleChips .chip[data-v="${st}"]`).click(), style0); await goTab(page, 'cuerpo'); await page.waitForTimeout(300);
    ok(rim.leather > 2000 && rim.rim > 200 && rim.on > rim.rim * .9, `the pads' rims are inked: ${rim.on} of the ${rim.rim} pixels where leather meets fur have a line (${rim.leather} px of pads seen)`);
    // claws: a keratin piece out of the end of each finger and the thumb, rigid on its last segment: rooted in the finger's
    // end (past the middle of the last segment, inside the tip's skin, which hoods it), its point out past the skin
    const claw = await A(() => { const C = window.__cdp, H = window.__hp, m = C.mq, F = C.FIG, g = H.parts().pawR.geometry, si = g.attributes.skinIndex.array, sw = g.attributes.skinWeight.array, P = g.attributes.position.array;
      let rigid = true; const out = [];
      for (const vs of H.islands(g, 3)) { const b = si[vs[0] * 4], name = F.meta.bones[b], f = name[2]; if (!/^fR\d2$/.test(name)) rigid = false;
        for (const i of vs) if (sw[i * 4] !== 1 || si[i * 4] !== b) rigid = false;
        const a = H.jv(`fR${f}2`), d = H.jv(`tipR${f}`).sub(a), L = d.length(); d.normalize(); const t = i => (P[i * 3] - a.x) * d.x + (P[i * 3 + 1] - a.y) * d.y + (P[i * 3 + 2] - a.z) * d.z;
        let skin = -Infinity; for (let i = 0; i < P.length / 3; i++) if (H.kind(g, i) !== 3 && si[i * 4] === b && sw[i * 4] > .5) skin = Math.max(skin, t(i));
        out.push({f, root: Math.min(...vs.map(t)) / L, skin: skin / L, past: (Math.max(...vs.map(t)) - skin) / L}); }
      out.sort((a, b) => a.f - b.f); return {rigid, fingers: out.map(o => o.f).join(''), out}; });
    ok(claw.rigid && claw.fingers === '01234', `a claw on every finger and thumb, rigid on its last segment (${claw.fingers})`);
    ok(claw.out.every(o => o.root > .5 && o.root < o.skin && o.past > .3), `each grows out of its finger's end: rooted in the tip, under its skin, the point past it (${claw.out.map(o => o.root.toFixed(2) + '<' + o.skin.toFixed(2) + '+' + o.past.toFixed(2)).join(' ')})`);
    // a paw's fist: the claws rest on the palm instead of going through it (their points over the palm's surface, and no
    // claw inside the paw's skin but its own finger's), and closing it tears nothing: no edge of the paw's skin stretches
    // more than the human hand's do in the same fist (measured below with "Human" hands)
    const fist = await A(() => { const C = window.__cdp, H = window.__hp, m = C.mq, F = C.FIG, cl = H.parts().pawR, g = cl.geometry, si = g.attributes.skinIndex.array, n = g.attributes.position.count;
      H.pose('saludo', [.8, 1, 1, 1, 1]);
      const w = m.joints.wristR.getWorldPosition(new THREE.Vector3()), q = new THREE.Quaternion(); m.joints.wristR.getWorldQuaternion(q); const nrm = m.handAxes.R.n.clone().applyQuaternion(q), X = H.posed(cl);
      const fing = i => { const b = F.meta.bones[si[i * 4]]; return /^fR/.test(b) ? +b[2] : -1; }, up = i => (X[i * 3] - w.x) * nrm.x + (X[i * 3 + 1] - w.y) * nrm.y + (X[i * 3 + 2] - w.z) * nrm.z;
      let palm = -1; for (let i = 0; i < n; i++) if (H.kind(g, i) !== 3 && fing(i) < 0 && g.attributes.skinWeight.array[i * 4] > .9) palm = Math.max(palm, up(i));
      // the skin's normals in the fist, and every claw point outside its own finger: how deep it is in the paw
      const N = new Float32Array(n * 3), I = g.index.array; for (let t = 0; t < I.length; t += 3) { const [a, b, c] = [I[t] * 3, I[t + 1] * 3, I[t + 2] * 3], u = [0, 1, 2].map(k => X[b + k] - X[a + k]), v = [0, 1, 2].map(k => X[c + k] - X[a + k]), nn = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; for (const j of [a, b, c]) for (let k = 0; k < 3; k++) N[j + k] += nn[k]; }
      const skin = []; for (let i = 0; i < n; i++) if (H.kind(g, i) !== 3) skin.push(i);
      const tips = [], deep = {};
      for (const vs of H.islands(g, 3)) { const f = fing(vs[0]); let top = -Infinity, end = vs[0];
        const a = H.jv(`fR${f}2`), d = H.jv(`tipR${f}`).sub(a).normalize(), P = g.attributes.position.array; for (const i of vs) { const s = (P[i * 3] - a.x) * d.x + (P[i * 3 + 1] - a.y) * d.y + (P[i * 3 + 2] - a.z) * d.z; if (s > top) { top = s; end = i; } }
        if (f > 0) tips.push((up(end) - palm) / m.size);
        let dp = 0; for (const i of vs) { let bj = -1, bd = Infinity; for (const j of skin) { const e = (X[i * 3] - X[j * 3]) ** 2 + (X[i * 3 + 1] - X[j * 3 + 1]) ** 2 + (X[i * 3 + 2] - X[j * 3 + 2]) ** 2; if (e < bd) { bd = e; bj = j; } }
          if (fing(bj) === f) continue; const l = Math.hypot(N[bj * 3], N[bj * 3 + 1], N[bj * 3 + 2]) || 1; dp = Math.max(dp, -((X[i * 3] - X[bj * 3]) * N[bj * 3] + (X[i * 3 + 1] - X[bj * 3 + 1]) * N[bj * 3 + 1] + (X[i * 3 + 2] - X[bj * 3 + 2]) * N[bj * 3 + 2]) / l); }
        deep[f] = dp * 1000; }
      return {tips, deep, dip: new THREE.Quaternion().copy(m.fingers.R[2][2].quaternion).angleTo(new THREE.Quaternion())}; });
    const pawTear = await stretch(true, [.8, 1, 1, 1, 1]);
    ok(fist.tips.every(t => t > -.006) && Object.values(fist.deep).every(d => d < 1), `a paw's fist: the claws rest on the palm, none through it (${fist.tips.map(t => (t * 1000).toFixed(1)).join(' ')} mm over it; ${Object.values(fist.deep).map(d => d.toFixed(1)).join(' ')} mm into the paw)`);
    // thick, knuckled fingers; "Human" hands are a human's, without claws or pads; "Human" feet keep the paws
    await A(() => document.querySelector('#handsChips .chip[data-v="humanas"]').click()); await page.waitForTimeout(800);
    const human = await summary(), hf = await finger(), humanTear = await stretch(false, [.8, 1, 1, 1, 1]);
    const hfist = await A(() => { const H = window.__hp, m = window.__cdp.mq; H.pose('saludo', [.8, 1, 1, 1, 1]); return new THREE.Quaternion().copy(m.fingers.R[2][2].quaternion).angleTo(new THREE.Quaternion()); });
    ok(pawTear < humanTear, `closing the paw tears nothing: its skin's edges stretch ${pawTear.toFixed(1)} mm at most, a human hand's in the same fist ${humanTear.toFixed(1)} mm`);
    ok(wf.w > hf.w * 1.3 && wf.knuckle > hf.knuckle * 1.1, `paw fingers are thick and knuckled (${(wf.w * 1000).toFixed(1)} against ${(hf.w * 1000).toFixed(1)} mm; knuckle ${wf.knuckle.toFixed(2)} against ${hf.knuckle.toFixed(2)})`);
    ok(wf.rough < hf.rough * 1.25, `the knuckles are smooth swellings, the paw's skin as smooth as a human hand's (${wf.rough.toFixed(3)} against ${hf.rough.toFixed(3)})`);
    ok(!Object.keys(human).length, `"Human" hands have no paws, claws or pads (${Object.keys(human).join() || 'none'})`);
    ok(fist.dip < hfist * .4, `a paw closes its last joints much less than a human hand (${(fist.dip * 57.3).toFixed(0)}° against ${(hfist * 57.3).toFixed(0)}°)`);
    await A(() => document.querySelector('#handsChips .chip[data-v="animal"]').click()); await page.waitForTimeout(500);
    await A(() => document.querySelector('#feetChips .chip[data-v="humano"]').click()); await page.waitForTimeout(800);
    const feet = await summary();
    ok(feet.pawR && feet.pawL && feet.pawR.kinds === '1,2,3', `with "Human" feet the hands keep their paws (${JSON.stringify(feet.pawR)})`);
    await A(() => document.querySelector('#feetChips .chip[data-v="animal"]').click()); await page.waitForTimeout(500);
    // gloves hide what they cover; a missing hand has no paw
    await A(() => { const C = window.__cdp; C.setOutfitNow(C.mq, [C.garmentSpec('c1852')]); });
    await page.waitForFunction(() => window.__cdp.mq.garments.some(g => g.geo), null, {timeout: 60000}); await page.waitForTimeout(800);
    const hid = await A(() => { const o = {}; for (const [k, a] of Object.entries(window.__hp.parts())) { const h = a.geometry.attributes.aHide.array; o[k] = h.reduce((s, v) => s + (v > .99), 0) / h.length; } return o; });
    ok(hid.pawL > .8 && hid.pawR > .8, `gloves hide the paws, claws and pads with them (${(hid.pawL * 100).toFixed(0)}%, ${(hid.pawR * 100).toFixed(0)}% hidden)`);
    await A(() => { const C = window.__cdp; C.setOutfitNow(C.mq, []); }); await page.waitForFunction(() => !window.__cdp.mq.garments.length, null, {timeout: 60000});
    await A(() => { const C = window.__cdp; C.mq.body.limbs = {armR: {cut: 'muneca'}}; C.rebuildActive(true); });
    const cut = await summary();
    ok(cut.pawL && !cut.pawR && cut.pawL.kinds === '1,2,3', 'a hand that is not there has no paw (and so no claws or pads)');
    await A(() => { const C = window.__cdp; delete C.mq.body.limbs; C.rebuildActive(true); });
    // each kind of hand: cats', bears' and dragons' paws with a claw on every finger; the wolf's, cat's and bear's beans,
    // heart-shaped palm pad and carpal pad, a dragon's palm bare (beans only); hooves
    const kinds = {};
    for (const sp of ['gato', 'oso', 'dragon', 'conejo', 'caballo', 'cabra']) { await species(sp); kinds[sp] = await summary(); }
    ok(['gato', 'oso', 'dragon'].every(k => kinds[k].pawR && kinds[k].pawR.claws === 5 && kinds[k].pawR.kinds === '1,2,3') && wolf.pawR.claws === 5, `cats, bears and dragons have their claws, five a hand (${['gato', 'oso', 'dragon'].map(k => kinds[k].pawR && kinds[k].pawR.claws).join(', ')})`);
    ok(wolf.pawR.pads === 7 && kinds.gato.pawR.pads === 7 && kinds.oso.pawR.pads === 7 && kinds.dragon.pawR.pads === 5, `pads: five beans, the palm's heart and the carpal pad (${wolf.pawR.pads}, ${kinds.gato.pawR.pads}, ${kinds.oso.pawR.pads}); a dragon's beans only (${kinds.dragon.pawR.pads})`);
    ok(!Object.keys(kinds.conejo).length, 'a rabbit\'s paws are furred, without claws or pads (its own, no dog\'s sculpt)');
    ok(!kinds.caballo.pads && kinds.caballo.claws.kinds === '3' && kinds.cabra.claws.n === kinds.caballo.claws.n * 2, `hoof-hands: one hoof a hand for a horse, two for a goat (${kinds.caballo.claws.n} / ${kinds.cabra.claws.n})`);
    const hoof = await A(() => { const H = window.__hp, g = H.parts().claws.geometry, P = g.attributes.position, half = P.count / 2, c = new THREE.Vector3(); let r = 0;
      for (let i = half; i < P.count; i++) c.add(new THREE.Vector3().fromBufferAttribute(P, i)); c.multiplyScalar(1 / half);
      for (let i = half; i < P.count; i++) r = Math.max(r, new THREE.Vector3().fromBufferAttribute(P, i).distanceTo(c));
      return [1, 2, 3, 4].map(f => H.jv(`tipR${f}`).distanceTo(c) / r); });
    ok(hoof.every(x => x < .9), `the hoof takes in the finger tips (${hoof.map(x => x.toFixed(2)).join(' ')} of its reach)`);
    // a hoof caps the end of the digit (from a little behind the last joint), not the whole hand from the knuckles, so a
    // closing hand bends at the knuckles below it (the right hand's half over the index and middle fingers)
    const cap = await A(() => { const H = window.__hp, g = H.parts().claws.geometry, P = g.attributes.position, half = P.count / 2, a = H.jv('fR21'), b = H.jv('fR22'), d = b.clone().sub(a), L = d.length(); d.normalize();
      let lo = Infinity; for (let i = half; i < half * 1.5; i++) lo = Math.min(lo, new THREE.Vector3().fromBufferAttribute(P, i).sub(a).dot(d) / L); return lo; });
    ok(cap > .2, `the hoof starts past the fingers' middle joints (${cap.toFixed(2)} of the middle segment)`);
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
    await A(() => { document.querySelector('details[data-sec=dinamismo]').open = true; document.querySelector('details[data-sec=ayudas]').open = true; const C = window.__cdp; C.usePreset(C.POSES.find(p => p.id === 'pie')); document.querySelector('#ghostBtn').click(); C.usePreset(C.POSES.find(p => p.id === 'correr')); });
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
    const cached = await page.evaluate(async () => { const ks = await caches.keys(), files = ks.includes('neopose-files') ? await (await caches.open('neopose-files')).keys() : [], shell = ks.find(k => k.startsWith('neopose-shell-')); return {n: files.length, hashed: files.every(r => /[?&]h=[0-9a-f]{10}/.test(r.url)), page: shell ? (await (await caches.open(shell)).keys()).length : 0}; });
    ok(cached.n >= 10 && cached.hashed && cached.page >= 1, `the service worker keeps the shell (${cached.n} files, each by its content hash, and the page)`);
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
    ok(await A(() => window.__cdp.ANIM.open && document.body.dataset.ws === 'anim' && !document.querySelector('#timeline').hidden), 'Animation again: it stays in Animation, like the other space tabs');
    await page.click('#tlClose'); await page.waitForTimeout(500);
    ok(await A(() => !window.__cdp.ANIM.open && document.body.dataset.ws === 'chars'), 'the dock\'s ✕ leaves Animation: back to the space it came from, timeline closed');
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
    // «Descartar» after editing a linked panel's scene gives the panel back as it was: linked to the film again
    const dc = await A(async () => { const K = window.__cdp.comic, p = K.comic().pages.flatMap(pg => pg.panels).find(q => q.link), id = p.link.shotId;
      await K.editPanel(p); const own = !p.link && !!p.shot; await K.finishPanelEdit(true); return {own, back: !!p.link && p.link.shotId === id && !p.shot}; });
    ok(dc.own && dc.back, '«Discard» after editing a linked panel\'s scene gives it back its link to the film');
    // while the page is shown the top bar acts on it: Exportar opens the tab's «Export pages» (its note over the page); B draws over the figure, in Pose
    await goTab(page, 'comic'); await page.waitForTimeout(500);
    await A(() => { document.querySelector('details[data-sec=cmexport]').open = false; });
    await page.click('#exportBtn'); await page.waitForTimeout(500);
    const tb = await A(() => { const h = document.querySelector('#hint'), r = h.getBoundingClientRect(), at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {modal: !document.querySelector('#exportModal').hidden, open: document.querySelector('details[data-sec=cmexport]').open, focus: document.activeElement.id, note: !!at && h.contains(at)}; });
    ok(!tb.modal && tb.open && tb.focus === 'cmExport' && tb.note, `on the comic page, Export opens the tab's «Export pages» (not the 3D export window), with its note over the page ${JSON.stringify(tb)}`);
    await page.keyboard.press('b'); await page.waitForTimeout(500);
    const bk = await A(() => ({tab: window.__cdp.state.tab, sk: window.__cdp.sk.on, page: !document.querySelector('#pageView').hidden}));
    ok(bk.tab === 'pose' && bk.sk && !bk.page, `B on the comic page draws over the figure: to ${bk.tab}, the sketch on, the page put away`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    // the panel's trash takes the panel, not the balloon chosen in it; the note over the page offers Undo, which brings it back
    await goTab(page, 'comic'); await page.waitForTimeout(500);
    await A(() => { const K = window.__cdp.comic; K.goPage(K.comic().pages.findIndex(pg => pg.panels.some(p => p.balloons.length)), {force: true}); }); await page.waitForTimeout(500);
    const tp = await A(() => { const K = window.__cdp.comic, pg = K.comic().pages[K.CM.page], p = K.readingOrder(pg).find(q => q.balloons.length), R = K.panelScreenRect(p), b = document.querySelector('#pageView').getBoundingClientRect(); return {x: b.left + R.x + R.w * .5, y: b.top + R.y + R.h * .6}; });
    await page.mouse.click(tp.x, tp.y); await page.waitForTimeout(400);
    const del = await A(async () => { const K = window.__cdp.comic, pg = K.comic().pages[K.CM.page], p = K.CM.sel, n = pg.panels.length, nb = p.balloons.length; K.CM.selB = p.balloons[0];
      document.querySelector('#pvBar [data-act=del]').click(); await new Promise(r => setTimeout(r, 400));
      const h = document.querySelector('#hint'), r = h.getBoundingClientRect(), at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2), undo = h.querySelector('.undo');
      const out = {n, nb, gone: !pg.panels.includes(p) && pg.panels.length === n - 1, note: !!at && h.contains(at) && !!undo};
      if (undo) undo.click(); await new Promise(r => setTimeout(r, 400)); const pg2 = K.comic().pages[K.CM.page]; out.back = pg2.panels.length === n && pg2.panels.some(q => q.id === p.id && q.balloons.length === nb); return out; });
    ok(del.gone && del.note && del.back, `the panel's trash takes the panel (not its chosen balloon); the note over the page offers Undo, which brings it back ${JSON.stringify(del)}`);
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
    // phone: a small panel chosen shows its toolbar (next to it, clear of the row of pages); a panel opened in 3D keeps «Back to the page» in sight
    await ph.evaluate(() => { const K = window.__cdp.comic; K.applyLayout(K.comic().pages[0], 'p9'); }); await ph.waitForTimeout(800);
    const sp = await ph.evaluate(() => { const K = window.__cdp.comic, p = K.comic().pages[0].panels[4], R = K.panelScreenRect(p), b = document.querySelector('#pageView').getBoundingClientRect(); return {x: b.left + R.x + R.w / 2, y: b.top + R.y + R.h / 2, w: R.w, h: R.h}; });
    await ph.touchscreen.tap(sp.x, sp.y); await ph.waitForTimeout(400);
    const sb = await ph.evaluate(() => { const b = document.querySelector('#pvBar'), r = b.getBoundingClientRect(), t = document.querySelector('#pvTrack').getBoundingClientRect(), v = document.querySelector('#pageView').getBoundingClientRect();
      return {shown: !b.hidden, inside: r.left >= v.left - 1 && r.right <= v.right + 1 && r.top >= v.top && r.bottom <= t.top}; });
    await ph.screenshot({path: path.join(OUT, 'comic-phone-bar.png')});
    ok(sb.shown && sb.inside, `phone: a small panel (${Math.round(sp.w)}×${Math.round(sp.h)} px) chosen shows its toolbar, clear of the row of pages ${JSON.stringify(sb)}`);
    const eb = await ph.evaluate(async () => { const K = window.__cdp.comic; await K.editPanel(K.comic().pages[0].panels[0]); await new Promise(r => setTimeout(r, 300));
      const r = document.querySelector('#cmEditBar').getBoundingClientRect(), v = document.querySelector('#viewport').getBoundingClientRect(), out = {top: Math.round(r.top), bottom: Math.round(r.bottom), vt: Math.round(v.top), vb: Math.round(v.bottom)};
      await K.finishPanelEdit(true); return out; });
    ok(eb.top >= eb.vt && eb.bottom <= eb.vb, `phone: the bar to go back to the page sits at the foot of the canvas (${eb.top}–${eb.bottom} px, the canvas ${eb.vt}–${eb.vb})`);
    await ph.context().close();
  },
  // the comic desk: gutters and corners dragged on the page, layouts that keep what the panels hold, pictures swapped
  // by dragging, undo and redo, the row of pages (new, copied, reordered, their state), the page's script (the same
  // words as the balloons), one click into a panel's scene and back
  // nothing is lost: shot ids survive a reopen (panels stay linked), the sketch is autosaved, panels keep their picture
  // when their shot goes, a copy is kept before a file or a link replaces the work, and a copy comes back
  async safety(browser) {
    let page = await open(browser), A = fn => page.evaluate(fn);
    const film = await A(async () => { const C = window.__cdp; C.script.VOICE.on = false;
      await C.script.scriptToFilm('INT. COCINA - DÍA\n\nANA está en la cocina.\n\nANA: Hola.\n\nLUIS entra.\n\nLUIS: ¿Qué tal?\n', {cams: true, online: false}); return C.ANIM.shots.length; });
    await page.click('#wsStatic'); await goTab(page, 'comic'); await page.waitForTimeout(400);
    const L = await A(async () => { const C = window.__cdp, K = C.comic; await K.filmToComic(); const P = K.comic().pages.flatMap(p => p.panels).filter(p => p.link);
      const before = P.map(p => p.link.shotId).join(); const bytes = await C.file.neoposeBytes('t'); for (let i = 0; i < 5; i++) C.ANIM.shots.push({...C.ANIM.shots[0], id: 9000 + i});
      C.project.applyProjectState(null); await C.file.openNeopose(new File([bytes], 't.neopose'));
      const Q = K.comic().pages.flatMap(p => p.panels).filter(p => p.link); return {n: Q.length, before, after: Q.map(p => p.link.shotId).join(), ok: Q.every(p => !!K.panelShot(p))}; });
    ok(film >= 2 && L.n >= 2 && L.ok && L.before === L.after, `a film of ${film} shots in ${L.n} linked panels: after reopening the file every panel still finds its shot`);
    const U = await A(() => { const C = window.__cdp, S = C.safety, K = C.comic, P = K.comic().pages.flatMap(p => p.panels).filter(p => p.link), s = K.panelShot(P[0]);
      const kept = S.unlinkPanels([s]); const own = !!P[0].shot && !P[0].link && P[0].shot.id !== s.id; S.relinkPanels(kept); return {own, back: !!P[0].link && !P[0].shot && K.panelShot(P[0]) === s}; });
    ok(U.own && U.back, 'a panel whose shot goes keeps its picture as a scene of its own, and undo links it again');
    const B = await A(async () => { const C = window.__cdp, S = C.safety; C.sk.strokes.push({brush: C.sk.brush, color: '#141210', size: 4, opacity: 1, flow: 1, erase: false, pSize: C.sk.pSize, pOpac: C.sk.pOpac, curve: C.sk.curve, h0: 600, seed: 7, pts: [[100, 100, .5], [140, 160, .5], [180, 200, .5]]}); C.redrawSketch(); S.autosaveNow(); await new Promise(r => setTimeout(r, 600));
      const a = await S.readAutosave(true); const bytes = await C.file.neoposeBytes('u'); await C.file.openNeopose(new File([bytes], 'u.neopose')); const L = await S.snapList();
      return {sketch: !!(a && a.sketch && a.sketch.length), copy: L.some(x => /u\.neopose/.test(x.label)), act: /Bring back|Recuperar/.test(document.querySelector('#hint').textContent)}; });
    ok(B.sketch && B.copy && B.act, 'the sketch is in the autosave; opening a file keeps a copy of the work first and offers to bring it back');
    // a copy brought back: the app starts again on it (here: with the sketch the copy had)
    const R = await A(async () => { const C = window.__cdp, S = C.safety; window.__it = await S.keepSnap('test'); return C.sk.strokes.length; });
    await Promise.all([page.waitForNavigation({timeout: 60000}), A(() => { window.__cdp.sk.strokes.length = 0; window.__cdp.safety.recoverSnap(window.__it); }).catch(() => {})]);
    await page.waitForFunction(() => window.__cdp && window.__cdp.chars && window.__cdp.chars.length, null, {timeout: 120000}); await page.waitForTimeout(1500);
    const R2 = await A(() => ({n: window.__cdp.sk.strokes.length, copies: 0}));
    ok(R > 0 && R2.n === R, `a copy brought back restores the work after a restart (sketch: ${R2.n} of ${R} strokes)`);
    // a shared link: what was here is kept as a copy
    const S2 = await A(async () => { const C = window.__cdp, S = C.safety; S.autosaveNow(); await new Promise(r => setTimeout(r, 500)); const n0 = (await S.snapList()).length;
      location.hash = C.sceneLink().split('#')[1]; S.openSharedScene(); await new Promise(r => setTimeout(r, 1500)); const L = await S.snapList(); return {n0, n: L.length, label: L[0] && L[0].label, all: L.map(x => x.label).join(' | '), hash: location.hash.slice(0, 10), sh: (document.querySelector('#hint').textContent || '').slice(0, 60)}; });
    ok(S2.n >= Math.min(10, S2.n0 + 1) && /link|enlace/i.test(S2.label), `opening a shared link keeps the previous work as a copy («${S2.label}»)` + (/link|enlace/i.test(S2.label) ? '' : ' ' + JSON.stringify(S2)));
    await A(() => { document.querySelector('#setBtn').click(); }); await page.waitForTimeout(500);
    const st = await A(() => ({rows: document.querySelectorAll('#snapList .snaprow').length, saved: document.querySelector('#snapSaved').textContent}));
    ok(st.rows >= 3 && st.saved.length > 5, `Settings lists ${st.rows} copies and when the work was last saved`);
    ok(!page.errors.filter(e => !/VALIDATE_STATUS|Too many attributes/.test(e)).length, 'no errors' + (page.errors.filter(e => !/VALIDATE_STATUS|Too many attributes/.test(e)).slice(0, 2).join(' | ').slice(0, 300)));
    await page.context().close();
  },
  // the Ko-fi note: only after the third save, then not again for a fortnight; quiet links in Help and Settings
  async support(browser) {
    const page = await open(browser), A = fn => page.evaluate(fn);
    const r = await A(async () => { const S = window.__cdp.support, wait = () => new Promise(res => setTimeout(res, 2600)), shown = () => /Ko-fi|coffee|café/i.test(document.querySelector('#hint').textContent);
      S.supportAfterSave(); S.supportAfterSave(); await wait(); const early = shown(); S.supportAfterSave(); await wait(); const third = shown();
      document.querySelector('#hint').classList.remove('toast'); S.supportAfterSave(); await wait(); const again = shown() && S.SUP.saves === 4 && S.SUP.last > 0;
      const links = [...document.querySelectorAll('a.kofi')].map(a => a.href); return {early, third, again, links, last: S.SUP.last}; });
    ok(!r.early && r.third && r.links.length === 2 && r.links.every(h => h === 'https://ko-fi.com/pmirall'), `the Ko-fi note waits for the third save (${r.early ? 'shown early!' : 'not before'}), and Help and Settings link to it`);
    const q = await A(async () => { const S = window.__cdp.support; S.SUP.last = Date.now(); const n = S.SUP.saves; S.supportAfterSave(); await new Promise(res => setTimeout(res, 2600)); return S.SUP.last !== 0 && S.SUP.saves === n + 1; });
    ok(q, 'after it has shown, it stays quiet for a fortnight');
    ok(!page.errors.filter(e => !/VALIDATE_STATUS|Too many attributes/.test(e)).length, 'no errors');
    await page.context().close();
  },
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
  // sound effects: the first sounds drawn as they were, every look, letters shaped one by one, the handles on the
  // page (move, turn, size, write), the catalogue, a new one placed in its panel, undo, and the pages out
  async sfx(browser) {
    const page = await open(browser), A = fn => page.evaluate(fn);
    await goTab(page, 'comic'); await page.waitForTimeout(900);
    await A(() => document.fonts.load('400 20px Bangers'));
    const ink = 'const ink = (cv) => { const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128 && d[i] < 90) n++; return n; };';
    // an old sound ({id, text, x, y, size, rot}) drawn exactly as before: white letters, an ink edge, set whole
    const old = await A(() => { const K = window.__cdp.comic, x = {id: 's1', text: '¡BLAM!', x: 60, y: 40, size: 16, rot: -8}, mk = () => { const cv = document.createElement('canvas'); cv.width = 480; cv.height = 320; return cv; };
      const a = mk(), b = mk(), ga = a.getContext('2d'), gb = b.getContext('2d'), hand = getComputedStyle(document.documentElement).getPropertyValue('--f-hand').trim();
      K.drawSfx(ga, x, 4, 0, 0);
      const px = x.size * 4; gb.save(); gb.translate(x.x * 4, x.y * 4); gb.rotate(x.rot * Math.PI / 180); gb.font = `400 ${px}px Bangers, "Comic Neue", ${hand}, sans-serif`; gb.textAlign = 'center'; gb.textBaseline = 'middle';
      gb.lineJoin = 'round'; gb.lineWidth = px * .2; gb.strokeStyle = '#141210'; gb.strokeText(x.text, 0, 0); gb.fillStyle = '#ffffff'; gb.fillText(x.text, 0, 0); gb.restore();
      const da = ga.getImageData(0, 0, 480, 320).data, db = gb.getImageData(0, 0, 480, 320).data; let diff = 0, on = 0; for (let i = 0; i < da.length; i++) { if (da[i] !== db[i]) diff++; if (i % 4 === 3 && db[i]) on++; }
      return {diff, on, keys: Object.keys(x).join(), style: K.sfxParams(x).outline + '/' + K.sfxParams(x).fill}; });
    ok(old.diff === 0 && old.on > 2000 && old.keys === 'id,text,x,y,size,rot' && old.style === 'single/#ffffff', `an old sound drawn exactly as before (${old.diff} bytes differ of ${old.on} pixels drawn), and left as it was saved`);
    // every look drawn, each its own; the gallery shows them small
    const st = await page.evaluate(new Function(`return (async () => { ${ink} const K = window.__cdp.comic, out = {}, sig = {};
      for (const k of Object.keys(K.SFX_STYLES)) { const cv = document.createElement('canvas'); cv.width = 600; cv.height = 360; const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 600, 360);
        K.drawSfx(g, {id: 'x', text: 'BOOM', x: 75, y: 45, size: 14, rot: 0, style: k}, 4, 0, 0); out[k] = ink(cv); sig[k] = cv.toDataURL(); }
      const gal = [...document.querySelectorAll('#cmSfxStyles .sfxst canvas')].map(ink);
      // (a sheet of every look, on a grey ground, for the eye)
      const keys = Object.keys(K.SFX_STYLES), sheet = document.createElement('canvas'); sheet.width = 1200; sheet.height = Math.ceil(keys.length / 3) * 300; const g = sheet.getContext('2d'); g.fillStyle = '#c9c4ba'; g.fillRect(0, 0, sheet.width, sheet.height);
      keys.forEach((k, i) => K.drawSfx(g, {id: 's' + i, text: K.SFX_STYLES[k].sample, x: 50, y: 37, size: 14, rot: K.SFX_STYLES[k].rot ?? -8, style: k}, 4, (i % 3) * 400 - 0, Math.floor(i / 3) * 300));
      return {out, distinct: new Set(Object.values(sig)).size, gal, sheet: sheet.toDataURL()}; })()`));
    fs.writeFileSync(path.join(OUT, 'comic-sfx-looks.png'), Buffer.from(st.sheet.split(',')[1], 'base64'));
    ok(Object.keys(st.out).length >= 9 && Object.values(st.out).every(n => n > 800) && st.distinct === Object.keys(st.out).length && st.gal.length === Object.keys(st.out).length && st.gal.every(n => n > 50), `${Object.keys(st.out).length} looks, each drawn its own way (${Object.entries(st.out).map(([k, n]) => k + ' ' + n).join(', ')}); the gallery shows ${st.gal.length} of them small`);
    // letters shaped one by one: crescendo, arc, perspective, the same shake every time, stacked for katakana
    const sh = await A(() => { const K = window.__cdp.comic, g = document.createElement('canvas').getContext('2d'), L = o => K.sfxLayout(g, {id: 'q', text: 'WHAAAM', x: 0, y: 0, size: 10, rot: 0, style: 'classic', ...o}, 40).G;
      const gr = L({grow: 1}), ar = L({arc: .8}), pe = L({persp: 1}), j1 = L({jit: .8}), j2 = L({jit: .8}), j3 = L({jit: .8, seed: 1}), ve = L({vert: true}), ti = L({tilt: 15});
      return {grow: gr[5].s / gr[0].s, up: gr[5].y < gr[0].y, arc: ar[2].y < ar[0].y && ar[0].r < 0 && ar[5].r > 0, persp: pe[5].s > pe[0].s * 2, same: JSON.stringify(j1) === JSON.stringify(j2), other: JSON.stringify(j1) !== JSON.stringify(j3),
        vert: ve.every((q, i) => !i || q.y > ve[i - 1].y) && ve.every(q => Math.abs(q.x) < 1), rock: Math.sign(ti[0].r) !== Math.sign(ti[1].r), n: gr.length}; });
    ok(sh.n === 6 && sh.grow > 2.5 && sh.up && sh.arc && sh.persp && sh.same && sh.other && sh.vert && sh.rock, `letters one by one: a crescendo ${sh.grow.toFixed(1)}× from first to last, standing on its line; on an arc, each turned to it; in perspective; the shake the same each time (another on «Otra variación»); stacked in a column; rocking`);
    // the look: a double edge (white inside the ink), screentone, a 3D block, colour
    const lk = await page.evaluate(new Function(`return (() => { ${ink} const K = window.__cdp.comic, draw = o => { const cv = document.createElement('canvas'); cv.width = 500; cv.height = 300; const g = cv.getContext('2d'); g.fillStyle = '#888'; g.fillRect(0, 0, 500, 300); K.drawSfx(g, {id: 'l', text: 'POW', x: 62, y: 37, size: 16, rot: 0, style: 'classic', ...o}, 4, 0, 0); return cv; };
      const white = cv => { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 240 && d[i + 1] > 240) n++; return n; };
      const one = draw({fill: '#141210'}), two = draw({fill: '#141210', outline: 'double'}), tone = draw({paint: 'tone'}), flat = draw({}), depth = draw({shadow: 'depth'}), col = draw({fill: '#e03020'});
      const red = (() => { const d = col.getContext('2d').getImageData(0, 0, 500, 300).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 180 && d[i + 1] < 90) n++; return n; })();
      return {one: white(one), two: white(two), tone: ink(tone) > ink(flat) * 1.05 && white(tone) > 100, depth: ink(depth) > ink(flat) * 1.15, red}; })()`));
    ok(lk.one < 50 && lk.two > 1000 && lk.tone && lk.depth && lk.red > 1000, `the look: black letters with a double edge show white inside the ink (${lk.two} px), screentone dots in the letters, a 3D block behind them, a colour when asked`);
    // the catalogue: a word picked goes into the chosen panel, clear of its balloon, sized to it, in its look
    const ct = await A(() => { const K = window.__cdp.comic, pg = K.comic().pages[0], p = pg.panels[0]; K.CM.sel = p; p.balloons = [{id: 'b1', kind: 'speech', text: 'Hola', ci: null, x: .3, y: .25, size: 9}];
      const words = [...document.querySelectorAll('#cmSfxCat .sfxword')], w = words.find(b => b.textContent === 'ドン'), n0 = (pg.sfx || []).length; w.click();
      const x = K.CM.selX, B = K.panelBox(p), g = document.createElement('canvas').getContext('2d'), L = K.sfxLayout(g, x, x.size), bw = L.full.x1 - L.full.x0;
      return {words: words.length, langs: document.querySelectorAll('#cmSfxCat .sfxcatrow').length, added: pg.sfx.length === n0 + 1, style: x.style, inside: K.inPoly(K.panelPts(p), x.x, x.y), far: Math.hypot((x.x - (B.x + .3 * B.w)) / B.w, (x.y - (B.y + .25 * B.h)) / B.h), fits: bw < B.w, edit: !document.querySelector('#cmSfxEdit').hidden}; });
    ok(ct.words >= 30 && ct.langs === 3 && ct.added && ct.style === 'manga' && ct.inside && ct.far > .3 && ct.fits && ct.edit, `the catalogue: ${ct.words} words in ${ct.langs} languages; ドン goes into the chosen panel in the manga look, inside it, clear of its balloon (${ct.far.toFixed(2)} of the panel away), fitting it`);
    // in the tab: a look chosen for it, a slider, a chip, back to its look
    const ui = await A(() => { const K = window.__cdp.comic, x = K.CM.selX; document.querySelector('#cmSfxStyles .sfxst[data-v="impact"]').click(); const r = {style: x.style, vert: K.sfxParams(x).vert};
      const s = document.querySelector('#cmSfxGrow'); s.value = 1.2; s.dispatchEvent(new Event('input')); s.dispatchEvent(new Event('change')); r.grow = x.grow;
      document.querySelector('#cmSfxDeco .chip[data-v="debris"]').click(); r.deco = x.deco; r.pressed = document.querySelector('#cmSfxStyles .sfxst[data-v="impact"]').getAttribute('aria-pressed');
      document.querySelector('#cmSfxReset').click(); r.reset = x.grow === undefined && x.deco === undefined && K.sfxParams(x).deco === 'burst'; return r; });
    ok(ui.style === 'impact' && !ui.vert && ui.grow === 1.2 && ui.deco === 'debris' && ui.pressed === 'true' && ui.reset, 'in the tab: the look chosen in the gallery, a crescendo slid, debris round it, then back to its look as it was');
    // on the page: dragged, turned by the round handle, sized by the corner; each step undone
    const H = async () => page.evaluate(() => { const K = window.__cdp.comic, h = K.pv.hits.find(q => q.x === K.CM.selX), b = document.querySelector('#pageView').getBoundingClientRect(), d = K.pv.dpr, Hs = K.sfxHandles(h.rb), P = q => ({x: b.left + q[0] / d, y: b.top + q[1] / d});
      return {mid: P([h.rb.cx, h.rb.cy]), rot: P(Hs.rot), size: P(Hs.size), x: K.CM.selX.x, y: K.CM.selX.y, r: K.CM.selX.rot, s: K.CM.selX.size}; });
    await A(() => window.__cdp.comic.histCommit()); await page.waitForTimeout(300);
    const h0 = await H(); await page.mouse.move(h0.mid.x, h0.mid.y); await page.mouse.down(); await page.mouse.move(h0.mid.x + 30, h0.mid.y + 20, {steps: 6}); await page.mouse.up(); await page.waitForTimeout(400);
    const h1 = await H(); await page.mouse.move(h1.rot.x, h1.rot.y); await page.mouse.down(); await page.mouse.move(h1.rot.x + 80, h1.rot.y + 40, {steps: 8}); await page.mouse.up(); await page.waitForTimeout(400);
    const h2 = await H(); await page.mouse.move(h2.size.x, h2.size.y); await page.mouse.down(); await page.mouse.move(h2.size.x + 40, h2.size.y + 40, {steps: 8}); await page.mouse.up(); await page.waitForTimeout(400);
    const h3 = await H();
    const un = await A(() => { const K = window.__cdp.comic, id = K.CM.selX.id, get = () => K.comic().pages[0].sfx.find(q => q.id === id); K.histCommit(); K.comicUndo(-1); const b = {...get()}; K.comicUndo(-1); const c = {...get()}; K.comicUndo(1); K.comicUndo(1); return {b, c, back: get().size}; });
    ok(Math.abs(h1.x - h0.x) > 3 && h2.r !== h1.r && h3.s > h2.s * 1.2 && un.b.size === h2.s && un.c.rot === h1.r && un.back === h3.s, `on the page: dragged ${(h1.x - h0.x).toFixed(1)} mm, turned by its round handle from ${h1.r}° to ${h2.r}°, sized by its corner from ${h2.s} to ${h3.s} mm; each step undone and redone`);
    // a double click writes in it: a field over it, Intro keeps it
    await page.waitForTimeout(300); const m = (await H()).mid; await page.mouse.dblclick(m.x, m.y); await page.waitForTimeout(250);
    const fld = await A(() => !!document.querySelector('#pvSfxEdit') && document.activeElement === document.querySelector('#pvSfxEdit'));
    await page.keyboard.type('ゴゴゴ'); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
    const wr = await A(() => { const K = window.__cdp.comic; return {text: K.CM.selX.text, gone: !document.querySelector('#pvSfxEdit'), side: document.querySelector('#cmSfxText').value}; });
    ok(fld && wr.text === 'ゴゴゴ' && wr.gone && wr.side === 'ゴゴゴ', `a double click writes in the sound itself: «${wr.text}», in the tab too`);
    await page.screenshot({path: path.join(OUT, 'comic-sfx.png')});
    await page.evaluate(() => document.querySelector('details[data-sec=cmsfx]').scrollIntoView()); await page.waitForTimeout(300); await page.locator('details[data-sec=cmsfx]').screenshot({path: path.join(OUT, 'comic-sfx-tab.png')});
    await page.evaluate(() => document.querySelector('#cmSfxEdit').scrollIntoView()); await page.waitForTimeout(300); await page.locator('#cmSfxEdit').screenshot({path: path.join(OUT, 'comic-sfx-edit.png')});
    // the pages out: the sounds in the PNG page, its PSD layer, the PDF and CBZ; saved and back with all their looks
    const ex = await page.evaluate(new Function(`return (async () => { ${ink} const C = window.__cdp, K = C.comic, pg = K.comic().pages[0], k = 150 / 25.4, c = K.comic();
      pg.sfx.push({id: 'old1', text: 'CRASH', x: 40, y: 200, size: 14, rot: 10});
      const cv = document.createElement('canvas'); cv.width = Math.round(c.page.w * k); cv.height = Math.round(c.page.h * k); K.composePage(cv.getContext('2d'), pg, k, 0, 0, {part: 'sfx'}); const layer = ink(cv);
      const withS = ink(await K.pageImage(pg, 150)), keep = pg.sfx; pg.sfx = []; const without = ink(await K.pageImage(pg, 150)); pg.sfx = keep;
      const pdf = await C.comicx.comicPDF(72), cbz = await C.comicx.comicCBZ(72), psd = await C.comicx.comicPSD(pg, 72), t = new TextDecoder('latin1');
      const before = JSON.stringify(pg.sfx), bytes = await C.file.neoposeBytes('t'); C.project.applyProjectState(null); await C.file.openNeopose(new File([bytes], 't.neopose'));
      return {layer, more: withS - without, pdf: t.decode(pdf.slice(0, 5)), cbz: cbz.length > 1000, psd: t.decode(psd.slice(0, 4)), back: JSON.stringify(K.comic().pages[0].sfx) === before, n: K.comic().pages[0].sfx.length}; })()`));
    ok(ex.layer > 1500 && ex.more > 1000 && ex.pdf === '%PDF-' && ex.cbz && ex.psd === '8BPS' && ex.back && ex.n === 2, `the pages out: the sounds on their own PSD layer (${ex.layer} px of ink) and on the page (${ex.more} px more); PDF, CBZ and PSD made; ${ex.n} sounds back from the .neopose file as they were`);
    ok(!page.errors.filter(e => !/VALIDATE_STATUS|Too many attributes/.test(e)).length, 'no errors' + (page.errors.filter(e => !/VALIDATE_STATUS|Too many attributes/.test(e)).slice(0, 2).join(' | ').slice(0, 300)));
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
  // Solo línea as a line drawing: interior lines from the ink pass (overlaps, folds, part borders), the small parts
  // (teeth, tongue, the inside of the mouth) outlined and in every style, the ink renders without the guides
  async furlines(browser) {
    const page = await open(browser), A = (f, a) => page.evaluate(f, a);
    const style = st => A(st => document.querySelector(`#styleChips .chip[data-v="${st}"]`).click(), st);
    await goTab(page, 'cuerpo'); await A(() => document.querySelector('#speciesChips .chip[data-v="lobo"]').click()); await page.waitForTimeout(6000);
    await goTab(page, 'dibujo'); await page.waitForTimeout(300);
    // the camera on the head, from the front and a little to the side
    const aim = (bone, k) => A(([bone, k]) => { const C = window.__cdp, m = C.mq, c = m.joints[bone].getWorldPosition(new THREE.Vector3()), q = m.joints.hips.getWorldQuaternion(new THREE.Quaternion());
      C.controls.target.copy(c); C.camera.position.copy(c).add(new THREE.Vector3(.35, .05, 1).normalize().applyQuaternion(q).multiplyScalar(m.headH * k)); C.camera.lookAt(c); C.controls.update(); }, [bone, k]);
    await aim('head', 3.4);
    await style('silueta'); const off = await A(() => window.__cdp.ink.inkWanted());
    await style('construccion'); const built = await A(() => window.__cdp.ink.inkWanted());
    await style('contorno'); await page.waitForTimeout(300); const on = await A(() => window.__cdp.ink.inkWanted());
    ok(on && built && !off, 'the ink pass draws the inner lines in every style but the silhouette (a flat shape)');
    // the buffer it reads: the head at the picture's size, seen from outside, its eyes and nose leather no parts of their
    // own (a border drawn on the mesh's eye or nose vertices is a jagged star or polygon, not a lid or a nose); the
    // sculpted head and the neck under it, two materials, apart
    const parts = await A(() => { const C = window.__cdp; C.renderView({w: 480, h: 480, bg: 'paper'}); const rt = C.ink.INK.rts.get('480x480'), px = new Uint8Array(rt.width * rt.height * 4);
      C.renderer.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, px); const n = new Map(); let cov = 0, out = 0;
      for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 128) { cov++; if (px[i + 3] > 240) out++; n.set(px[i + 2], (n.get(px[i + 2]) || 0) + 1); }
      const big = [...n].filter(([, k]) => k > cov * .01).map(([v]) => v); return {size: rt.width + '×' + rt.height, cov, out: out / cov, mats: new Set(big.map(v => v >> 3)).size, leather: big.filter(v => v % 8 === 2 || v % 8 === 7).length}; });
    ok(parts.size === '480×480' && parts.cov > 20000 && parts.out > .9 && parts.mats >= 2 && !parts.leather, `the ink buffer has the head at the picture's size (${parts.size}, ${parts.cov} px) seen from outside, head and neck apart (${parts.mats}), no eye or nose border (${parts.leather})`);
    // the nose is drawn: filled with the ink's dark (the sphere round the snout's tip, noseMask), not left blank paper
    const nose = await A(() => { const C = window.__cdp, U = C.mq.lib.uFur.uNose.value, r = U.w, dark = () => { const d = C.renderView({w: 480, h: 480, bg: 'paper'}).getContext('2d').getImageData(0, 0, 480, 480).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] < 200) n++; return n; };
      const on = dark(); U.w = 0; const off = dark(); U.w = r; return {r, on, off}; });
    ok(nose.r > 0 && nose.on - nose.off > 300, `the nose leather is inked solid: ${nose.on - nose.off} dark pixels more with it than without (radius ${nose.r.toFixed(3)})`);
    // Solo línea's guides are faint pencil under the ink: the rings barely tint the paper, no red centre line
    const rings = await A(() => { const C = window.__cdp, L = C.ink.LU, la = L.uLineA.value, ce = L.uCenter.value, shot = a => { L.uLineA.value = a; L.uCenter.value = 1; return C.renderView({w: 480, h: 480, bg: 'paper'}).getContext('2d').getImageData(0, 0, 480, 480).data; };
      const on = shot(.8), off = shot(0); L.uLineA.value = la; L.uCenter.value = ce; let max = 0, red = 0;
      for (let i = 0; i < on.length; i += 4) { max = Math.max(max, Math.abs(on[i + 1] - off[i + 1])); if (on[i] - on[i + 2] > 40 && on[i] > 120) red++; } return {max, red}; });
    ok(rings.max > 3 && rings.max < 40 && rings.red === 0, `rings faint in Solo línea (at most ${rings.max}/255 darker), no centre line (${rings.red} red pixels)`);
    // lines inside the silhouette: far more ink away from the outline with the pass than with its lines made invisible
    const inner = async a => A(a => { const C = window.__cdp, U = C.ink.INK.mat.uniforms.uA, a0 = U.value; U.value = a;
      const ink = C.renderView({w: 480, h: 480, bg: 'lines'}).getContext('2d').getImageData(0, 0, 480, 480).data, sil = C.renderView({w: 480, h: 480, bg: 'alpha'}).getContext('2d').getImageData(0, 0, 480, 480).data; U.value = a0;
      let n = 0; for (let y = 5; y < 475; y++) for (let x = 5; x < 475; x++) { const i = (y * 480 + x) * 4; if (ink[i + 3] < 128) continue; let inside = true;
        for (let dy = -5; dy <= 5 && inside; dy += 5) for (let dx = -5; dx <= 5; dx += 5) if (!sil[((y + dy) * 480 + x + dx) * 4 + 3]) { inside = false; break; } if (inside) n++; }
      return n; }, a);
    // (a smooth sculpt: its eyes, tufts and ear fluff are the outline's, inside the silhouette; the pass adds the folds)
    const withInk = await inner(1), without = await inner(0);
    ok(withInk > without * 1.2 && withInk - without > 150, `interior lines: ${withInk} ink pixels inside the head against ${without} with the outline alone`);
    // the ink render is the drawing's line: no rings, no red centre line, and the guides are back afterwards
    const guide = await A(() => { const C = window.__cdp, L = C.ink.LU, la = L.uLineA.value, ce = L.uCenter.value; L.uLineA.value = .8; L.uCenter.value = 1;
      const d = C.renderView({w: 400, h: 400, bg: 'lines'}).getContext('2d').getImageData(0, 0, 400, 400).data; let red = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 60 && d[i] - d[i + 2] > 40) red++;
      const kept = L.uLineA.value === .8 && L.uCenter.value === 1; L.uLineA.value = la; L.uCenter.value = ce; return {red, kept}; });
    ok(guide.red === 0 && guide.kept, `the ink render leaves out the centre line and the rings, and puts them back (${guide.red} red pixels)`);
    // rings are the fur's guides: the claws (their own part in the ink buffer, kind 3) are the same with the rings on or off
    await aim('wristL', 2.2);
    const hard = await A(() => { const C = window.__cdp, L = C.ink.LU, la = L.uLineA.value, ce = L.uCenter.value, shot = a => { L.uLineA.value = a; L.uCenter.value = 0; return C.renderView({w: 480, h: 480, bg: 'paper'}).getContext('2d').getImageData(0, 0, 480, 480).data; };
      const on = shot(.8), rt = C.ink.INK.rts.get('480x480'), id = new Uint8Array(480 * 480 * 4); C.renderer.readRenderTargetPixels(rt, 0, 0, 480, 480, id); const off = shot(0); L.uLineA.value = la; L.uCenter.value = ce;
      const n = {claw: 0, clawRing: 0, fur: 0, furRing: 0};
      for (let y = 0; y < 480; y++) for (let x = 0; x < 480; x++) { const j = ((479 - y) * 480 + x) * 4, i = (y * 480 + x) * 4; if (id[j + 3] < 240) continue; const k = id[j + 2] % 8 === 3 ? 'claw' : id[j + 2] % 8 === 0 ? 'fur' : null; if (!k) continue;
        n[k]++; if (Math.abs(on[i] - off[i]) > 4) n[k + 'Ring']++; }
      return n; });
    ok(hard.claw > 30 && hard.clawRing <= hard.claw * .02 && hard.furRing > hard.fur * .02, `no rings on the claws (${hard.clawRing} of ${hard.claw} px changed), on the fur they stay (${hard.furRing} of ${hard.fur})`);
    await aim('head', 3.4);
    // a picture bigger than the canvas (an export) lets its buffers go once the canvas is drawn again
    const mem = await A(() => { const C = window.__cdp; C.renderView({w: 2400, h: 2400, bg: 'paper'}); const big = C.ink.INK.rts.has('2400x2400'); C.frameNow();
      const b = C.renderer.getDrawingBufferSize(new THREE.Vector2()); return {big, left: [...C.ink.INK.rts.values()].filter(r => r.width * r.height > b.x * b.y).length}; });
    ok(mem.big && mem.left === 0, `an export's ink buffers are let go after it (${mem.left} bigger than the canvas left)`);
    // the multi-view draws the canvas and three panes each frame: their buffers stay, none is made again frame after frame
    const multi = () => A(() => document.querySelector('#multiBtn').click());
    await multi(); await page.waitForTimeout(800);
    const churn = await A(() => { const C = window.__cdp, seen = new Set(); for (let f = 0; f < 6; f++) { C.frameNow(); for (const rt of C.ink.INK.rts.values()) seen.add(rt); }
      const first = seen.size; for (let f = 0; f < 6; f++) { C.frameNow(); for (const rt of C.ink.INK.rts.values()) seen.add(rt); } return {first, made: seen.size - first, kept: C.ink.INK.rts.size}; });
    await multi(); await page.waitForTimeout(300);
    ok(churn.kept >= 2 && churn.made === 0, `with the multi-view on, the canvas's and the panes' ink buffers (${churn.kept}) stay: ${churn.made} new ones over 6 more frames`);
    // a print-sized picture (a comic panel for paper) is the same drawing finer: its lines wider with it, not hairlines
    const print = await A(() => { const C = window.__cdp, H = C.renderer.domElement.getBoundingClientRect().height, n = s => { const d = C.renderView({w: s, h: s, bg: 'lines'}).getContext('2d').getImageData(0, 0, s, s).data; let k = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 100) k++; return k; };
      const s0 = Math.round(H * .8), s1 = Math.round(H * 2.4); return {r: n(s1) / n(s0), lin: (s1 / s0) * (s1 / H)}; });
    ok(print.r > print.lin * .7, `lines grow with a picture bigger than the canvas: ${print.r.toFixed(1)}× the ink at 3× the size (a fixed width would be ~3×)`);
    // the seat a pose sits on is a prop, no part of the drawing: the ink render leaves it out (a shaded block there), the canvas has it back
    await aim('hips', 7);
    const seat = await A(() => { const C = window.__cdp, m = C.mq, n = () => { const d = C.renderView({w: 400, h: 400, bg: 'lines'}).getContext('2d').getImageData(0, 0, 400, 400).data; let k = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 100) k++; return k; };
      const st = m.stool; m.stool = false; const off = n(); m.stool = true; const on = n(); C.frameNow(); const back = m.stoolMesh.visible; m.stool = st; return {on, off, back}; });
    ok(seat.off > 1000 && Math.abs(seat.on - seat.off) < seat.off * .01 && seat.back, `the stool stays out of the ink render (${seat.on} ink pixels with it, ${seat.off} without) and is back on the canvas`);
    // clothes: a clean line, no specks (single ink pixels) and each garment layer over what it covers in the ink pass
    await goTab(page, 'ropa'); await A(() => document.querySelector('#outfitChips .chip[data-v="camiseta"]').click()); await page.waitForTimeout(6000);
    await goTab(page, 'dibujo'); await aim('hips', 6);
        const cloth = await A(() => { const C = window.__cdp, m = C.mq, d = C.renderView({w: 600, h: 600, bg: 'lines'}).getContext('2d').getImageData(0, 0, 600, 600).data, on = (x, y) => d[(y * 600 + x) * 4 + 3] > 100;
      let ink = 0, lone = 0; for (let y = 1; y < 599; y++) for (let x = 1; x < 599; x++) if (on(x, y)) { ink++; let n = 0; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if ((i || j) && on(x + i, y + j)) n++; if (!n) lone++; }
      const G = (m.garments || []).filter(g => g.d), ranks = G.map(g => [g.rankIdx, g.U.uInkZ.value]); return {n: G.length, ink, lone, layered: ranks.every(([r, z]) => z === r + 1)}; });
    ok(cloth.n >= 2 && cloth.layered, `each of the ${cloth.n} garments lies over what it covers in the ink pass, by its layer`);
    ok(cloth.ink > 2000 && cloth.lone < cloth.ink * .005, `clothes drawn with a clean line: ${cloth.lone} lone specks in ${cloth.ink} ink pixels`);
    await goTab(page, 'ropa'); await A(() => document.querySelector('#outfitNone').click()); await page.waitForTimeout(800); await aim('head', 3.4);
    // an open mouth: teeth and tongue outlined, every part of it in the drawing style
    await goTab(page, 'pose'); await A(() => document.querySelector('#exprChips .chip[data-v="rugido"]').click()); await page.waitForTimeout(800);
    const mouth = async st => { await goTab(page, 'dibujo'); await style(st); await page.waitForTimeout(200);
      // (the inside is drawn with the body's own material, its parts told apart by the coat's kinds: see furmouth)
      return A(() => { const m = window.__cdp.mq, M = m.mouthMeshes.filter(x => !x.userData.hull), H = m.mouthMeshes.filter(x => x.userData.hull);
        return {n: M.length, open: M.every(x => x.visible), types: [...new Set(M.map(x => x.material.type))].join(), cols: [...new Set(M.map(x => x.material.color.getHex()))],
          hulls: H.filter(h => h.visible).length, teeth: H.length, body: M.every(x => x.material === m.lib[m.style])}; }); };
    const mc = await mouth('contorno'), ms = await mouth('silueta'), mk = await mouth('construccion');
    ok(mc.n > 4 && mc.open && mc.body && mc.teeth >= 2 && mc.hulls === mc.teeth && mk.hulls === mk.teeth, `an open mouth: its teeth and tongue outlined (${mc.teeth} hulls), in Solo línea and in Construcción`);
    ok(mc.types === 'MeshBasicMaterial' && ms.cols.length === 1 && ms.cols[0] === 0x2a2620 && ms.hulls === 0 && mk.types === 'MeshToonMaterial', `the mouth takes the style: flat paper and greys in Solo línea, the figure's dark in Silueta (no outline there), shaded in Construcción`);
    // the sculpted head's ears, hoof caps, tufts are single sheets: drawn from both sides with the body's own shader (and ink id); the closed body culls
    // (the inside of the mouth keeps the body's own one-sided material: its inner lips are seen only from within)
    const head = await A(() => { const m = window.__cdp.mq, b = m.lib[m.style], rest = m.meshes.filter(x => x !== m.body3 && !x.userData.mouth);
      return {n: rest.length, inside: m.meshes.filter(x => x.userData.mouth).every(x => x.material === b), side: rest.every(x => x.material.side === THREE.DoubleSide), same: rest.every(x => x.material.onBeforeCompile === b.onBeforeCompile && x.material.userData.ink), head: rest.includes(m.headMesh), body: m.body3.material.onBeforeCompile === b.onBeforeCompile && m.body3.material.side === (m.headMesh ? THREE.DoubleSide : THREE.FrontSide) && 'SKIN' in m.body3.material.defines && !rest.some(x => x !== m.headMesh && 'SKIN' in x.material.defines), style: m.style}; });
    ok(head.n > 3 && head.side && head.same && head.head && head.body && head.inside, `the sculpted head and the ${head.n - 1} other parts are drawn from both sides with the style's own shader, and so is the body under the head (its neck open at the cut) (${head.style})`);
    // small parts take a finer hull (teeth), a tuft's swells from its root
    const hulls = await A(() => { const m = window.__cdp.mq, H = m.hulls.map(h => h.material); const T = m.mouthMeshes.filter(x => x.userData.hull); return {fine: T.length > 0 && T.every(x => x.material.uniforms.uK.value < .7), root: m.hulls.some(h => h.geometry === m.fluffGeo && 'ROOT' in h.material.defines), body: H[0].uniforms.uK.value === 1}; });
    ok(hulls.fine && hulls.root && hulls.body, `teeth and tongue outlined finer than the body, tufts' outlines grown from the root`);
    // a human in Solo línea: the ink pass too, and nothing of a coat
    await goTab(page, 'cuerpo'); await A(() => document.querySelector('#speciesChips .chip[data-v="humano"]').click()); await page.waitForTimeout(3000);
    await goTab(page, 'dibujo'); await style('contorno'); await aim('head', 3.4);
    const hum = await inner(1), hum0 = await inner(0);
    ok(hum > hum0 && await A(() => window.__cdp.mq.lib.uFur.uFurOn.value === 0 && window.__cdp.mq.lib.uFur.uNose.value.w === 0), `a human's face gets its interior lines too (${hum} against ${hum0}), no coat and no nose leather`);
    // the contour's weight: seen from the front, the torso's right side (the shadow side, the light being up on the left) is drawn heavier than its left
    const weight = await A(() => { const C = window.__cdp, m = C.mq, c = m.joints.chest.getWorldPosition(new THREE.Vector3()), q = m.joints.hips.getWorldQuaternion(new THREE.Quaternion());
      C.controls.target.copy(c); C.camera.position.copy(c).add(new THREE.Vector3(0, 0, 1).applyQuaternion(q).multiplyScalar(m.headH * 6)); C.camera.lookAt(c); C.controls.update();
      const d = C.renderView({w: 600, h: 600, bg: 'lines'}).getContext('2d').getImageData(0, 0, 600, 600).data, on = (x, y) => d[(y * 600 + x) * 4 + 3] > 90; let l = 0, r = 0;
      for (let y = 240; y < 360; y++) { let x = 0; while (x < 600 && !on(x, y)) x++; while (x < 600 && on(x, y)) { l++; x++; } x = 599; while (x >= 0 && !on(x, y)) x--; while (x >= 0 && on(x, y)) { r++; x--; } }
      return {l, r}; });
    ok(weight.l > 100 && weight.r > weight.l * 1.15, `a heavier contour on the shadow side: ${weight.r} px of line on the right against ${weight.l} on the left`);
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
    // pads (leather) and claws (keratin) are there, as their own kinds (on any point of a part: a sculpted paw is fur,
    // leather and keratin in one mesh)
    const kinds = await A(() => { const out = new Set(); for (const a of window.__cdp.mq.acc) { const e = a.geometry.attributes.aEye; if (!e || a.userData.hull) continue; for (let i = 3; i < e.array.length; i += 4) { const w = -e.array[i]; if (w > 1.5) out.add(Math.floor(w) - 1); } } return [...out].sort().join(); });
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
    // a hybrid: a fox's head on a tiger's body keeps the tiger's legs and coat
    await A(() => document.querySelector('#speciesChips .chip[data-v="tigre"]').click()); await page.waitForTimeout(1500);
    await A(() => document.querySelector('#headModelChips .chip[data-v="zorro"]').click()); await page.waitForTimeout(3500);
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
    await page.click('#tlClose'); await page.waitForTimeout(300);
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
  // the character creator (Personajes › Cuerpo and Ropa): a rail of categories, options as pictures, the camera on the
  // face or the body, the strip of characters (new, copy, rename, remove and back, save, export, import), the dice,
  // an outfit per occasion, one search over the libraries, a look before choosing; and on a phone
  async creator(browser) {
    const SHOTS = process.env.CREATOR_SHOTS || OUT; fs.mkdirSync(SHOTS, {recursive: true});
    const noise = e => /VALIDATE_STATUS|Too many attributes/.test(e);
    const page = await open(browser), A = (f, a) => page.evaluate(f, a);
    // the body and the clothes, keys in order (a restored body may list them differently)
    const sig = () => A(() => { const m = window.__cdp.mq, so = o => o && typeof o === 'object' ? Array.isArray(o) ? o.map(so) : Object.fromEntries(Object.keys(o).sort().map(k => [k, so(o[k])])) : o; return JSON.stringify(so([m.body, m.outfit.map(s => s.id)])); });
    await goTab(page, 'cuerpo');
    await page.waitForFunction(() => document.querySelectorAll('#bodyChips .crth:not(.pending)').length >= 16, null, {timeout: 60000}).catch(() => {});
    const s0 = await A(() => ({on: document.body.classList.contains('creator'), rail: [...document.querySelectorAll('#crRail .crr')].map(b => b.dataset.cat).join(), cur: (document.querySelector('#crRail .crr[aria-current="true"]') || {}).dataset?.cat,
      cam: getComputedStyle(document.querySelector('#crCam')).display !== 'none', gal: getComputedStyle(document.querySelector('#crGallery')).display !== 'none', stage: document.querySelectorAll('#crStage .charcard:not(.crnew)').length,
      thumbs: document.querySelectorAll('#bodyChips .chip .crth:not(.pending)').length, sw: document.querySelectorAll('#speciesChips .chip .crsw').length, faces: document.querySelectorAll('#crExpr .crface svg').length,
      dots: window.__cdp.video.jointDots.head.visible, fine: !document.querySelector('details[data-sec=prop]').open && !!document.querySelector('details[data-sec=prop] .finetag')}));
    ok(s0.on && s0.rail === 'body,face,hair,species,limbs,clothes,acc' && s0.cur === 'body', `Body opens the creator with its rail (${s0.rail}; on ${s0.cur})`);
    ok(s0.cam && s0.gal && s0.stage === 1 && !s0.dots, 'the camera buttons and the strip of characters are there; the posing dots are not');
    ok(s0.thumbs === 16 && s0.sw >= 18 && s0.faces >= 12 && s0.fine, `options as pictures: ${s0.thumbs} body silhouettes, ${s0.sw} fur swatches, ${s0.faces} faces; the sliders folded under “fine tuning”`);
    // the rail: Hair takes the panel there and the camera to the face; the arrows walk it; Clothes is the other tab
    await page.click('#crRail .crr[data-cat="hair"]'); await page.waitForTimeout(1500);
    const s1 = await A(() => { const C = window.__cdp, pg = document.querySelector('#book .page'), h = document.querySelector('#crCatHair').getBoundingClientRect().top - pg.getBoundingClientRect().top, head = C.mq.joints.head.getWorldPosition(C.camera.position.clone());
      return {h, cur: document.querySelector('#crRail .crr[aria-current="true"]').dataset.cat, d: C.camera.position.distanceTo(head), view: C.creator.CR.view}; });
    ok(s1.h >= 0 && s1.h < 160 && s1.cur === 'hair' && s1.view === 'face' && s1.d < 2, `Hair: the panel goes there (${Math.round(s1.h)} px from its top), the camera to the face (${s1.d.toFixed(2)} m)`);
    await page.focus('#crRail .crr[data-cat="hair"]'); await page.keyboard.press('ArrowDown');
    const kb = await A(() => document.activeElement.dataset.cat); await page.keyboard.press('Enter'); await page.waitForTimeout(1200);
    ok(kb === 'species' && await A(() => window.__cdp.creator.CR.cat) === 'species', 'the arrow keys walk the rail and Enter opens a category');
    await page.click('#crRail .crr[data-cat="clothes"]'); await page.waitForTimeout(2500);
    ok(await A(() => window.__cdp.state.tab === 'ropa' && document.body.classList.contains('creator') && window.__cdp.creator.CR.view === 'body'), 'Clothes: the Ropa tab, still the creator, the whole body in view');
    await page.waitForFunction(() => document.querySelectorAll('#crAcc .libItem').length > 40 && document.querySelectorAll('#outfitChips .crol img').length > 20, null, {timeout: 60000}).catch(() => {});
    const acc = await A(() => ({looks: document.querySelectorAll('#outfitChips .chip .crol img').length, n: document.querySelectorAll('#crAcc .libItem').length, cats: document.querySelectorAll('#crAccCats .chip').length}));
    ok(acc.looks > 20 && acc.n > 40 && acc.cats >= 5, `outfits show their garments (${acc.looks}); accessories as photos (${acc.n}), by kind (${acc.cats})`);
    const hat = await A(() => document.querySelector('#crAcc .libItem:not(.blocked)').dataset.id);
    await A(id => document.querySelector(`#crAcc .libItem[data-id="${id}"]`).click(), hat); await page.waitForTimeout(1500);
    ok(await A(id => window.__cdp.mq.outfit.some(s => s.id === id) && document.querySelector(`#crAcc .libItem[data-id="${id}"]`).classList.contains('on'), hat), `a tap on an accessory puts it on and the tile says so (${hat})`);
    // an outfit per occasion
    await page.click('#outfitChips .chip[data-v="traje"]'); await page.waitForTimeout(2500);
    await page.click('#crSlots .chip[data-v="deporte"]'); await page.waitForTimeout(600);
    await page.click('#outfitChips .chip[data-v="deporte"]'); await page.waitForTimeout(2500);
    const o1 = await A(() => window.__cdp.mq.outfit.map(s => s.id).join());
    await page.click('#crSlots .chip[data-v="diario"]'); await page.waitForTimeout(1500);
    const o2 = await A(() => ({ids: window.__cdp.mq.outfit.map(s => s.id).join(), slot: window.__cdp.mq.body.outfitSlot}));
    ok(o2.slot === 'diario' && /elegantsuit/.test(o2.ids) && !/sportsuit/.test(o2.ids) && /sportsuit/.test(o1), `an outfit per occasion: everyday ${o2.ids} · sport ${o1}`);
    await page.click('#crSlots .chip[data-v="deporte"]'); await page.waitForTimeout(1500);
    ok(await A(() => window.__cdp.mq.outfit.some(s => /sportsuit/.test(s.id)) && document.querySelector('#crSlots .chip[data-v="deporte"]').getAttribute('aria-pressed') === 'true'), 'and back to the sport one');
    await page.screenshot({path: path.join(SHOTS, 'creator-desktop-ropa.png')});
    // the dice, and Ctrl+Z
    const b0 = await sig(); await page.click('#crDice'); await page.waitForTimeout(3500); const b1 = await sig();
    await page.keyboard.press('Control+z'); await page.waitForTimeout(2000); const b2 = await sig();
    ok(b1 !== b0 && b2 === b0, 'the dice makes someone else; Ctrl+Z brings them back');
    // the strip: new, rename, duplicate, remove and back, portraits
    await page.click('#crNew'); await page.waitForTimeout(1500);
    ok(await A(() => window.__cdp.chars.length === 2 && document.querySelectorAll('#crStage .charcard:not(.crnew)').length === 2 && document.querySelectorAll('#crStage .charcard')[1].classList.contains('on')), 'New: a second character, active, in the strip');
    page.once('dialog', d => d.accept('Bea')); await page.click('#crStage .charcard.on .charact:nth-child(2)'); await page.waitForTimeout(500);
    ok(await A(() => window.__cdp.mq.body.name === 'Bea' && [...document.querySelectorAll('#cast .chip')].some(b => /Bea/.test(b.textContent))), 'a character is renamed from its card');
    await page.click('#crStage .charcard.on .charact:nth-child(1)'); await page.waitForTimeout(2500);
    ok(await A(() => { const C = window.__cdp.chars; return C.length === 3 && /Bea/.test(C[2].body.name) && C[2].body.name !== 'Bea'; }), 'Duplicate: a copy of her joins the scene');
    await page.click('#crStage .charcard:nth-child(3) .charact:nth-child(3)'); await page.waitForTimeout(800);
    const gone = await A(() => window.__cdp.chars.length); await page.click('#hint .undo'); await page.waitForTimeout(1500);
    ok(gone === 2 && await A(() => window.__cdp.chars.length) === 3, 'removing someone from the strip is undone right there');
    await page.waitForFunction(() => [...document.querySelectorAll('#crStage .charcard:not(.crnew) img')].every(i => /^data:image\/png/.test(i.src)), null, {timeout: 90000}).catch(() => {});
    ok(await A(() => [...document.querySelectorAll('#crStage .charcard:not(.crnew) img')].every(i => /^data:image\/png/.test(i.src))), 'everyone on stage gets a colour portrait');
    // My characters: save, rename, duplicate, delete and back, export all, import
    page.once('dialog', d => d.accept('Ana')); await page.click('#charSave'); await page.waitForTimeout(2500);
    ok(await A(() => window.__cdp.SAVED_CHARS().some(c => c.name === 'Ana' && c.thumb) && document.querySelectorAll('#charGrid .charcard').length === 1), 'Save: into My characters, shown in the strip');
    page.once('dialog', d => d.accept('Ana B')); await page.click('#charGrid .charcard .charact:nth-child(3)'); await page.waitForTimeout(800);
    await page.click('#charGrid .charcard .charact:nth-child(2)'); await page.waitForTimeout(800);
    const sv = await A(() => window.__cdp.SAVED_CHARS().map(c => c.name));
    ok(sv.length === 2 && sv.includes('Ana B') && sv.every(n => /^Ana B/.test(n)), `renamed and copied in My characters (${sv.join(' | ')})`);
    await page.click('#charGrid .charcard .charact:nth-child(5)'); await page.waitForTimeout(800);
    const n1 = await A(() => window.__cdp.SAVED_CHARS().length); await page.click('#hint .undo'); await page.waitForTimeout(800);
    ok(n1 === 1 && await A(() => window.__cdp.SAVED_CHARS().length) === 2, 'deleting from My characters asks nothing and is undone right there');
    const [dl] = await Promise.all([page.waitForEvent('download', {timeout: 20000}), page.click('#crExportAll')]), file = await dl.path(), arr = JSON.parse(fs.readFileSync(file, 'utf8'));
    ok(Array.isArray(arr) && arr.length === 2 && arr.every(c => c.neopose === 'character' && c.body), `Export all: one file with every saved character (${dl.suggestedFilename()})`);
    await page.setInputFiles('#charFile', {name: 'mine.neopose-personaje.json', mimeType: 'application/json', buffer: fs.readFileSync(file)}); await page.waitForTimeout(1500);
    ok(await A(() => window.__cdp.SAVED_CHARS().length) === 4, 'Import reads that file back');
    // one search: clothes, faces, hair (Enter takes the first), species with a filter
    await page.fill('#crQ', 'fedora'); await page.waitForTimeout(1500);
    await page.click('#crResults .crres[data-id="m_fedora01"]'); await page.waitForTimeout(1500);
    ok(await A(() => window.__cdp.mq.outfit.some(s => s.id === 'm_fedora01') && document.querySelector('#crResults .crres[data-id="m_fedora01"]').getAttribute('aria-pressed') === 'true'), 'search “fedora”: a tap puts the hat on, and the result says so');
    await page.fill('#crQ', 'smile'); await page.waitForTimeout(600);
    await page.click('#crResults .crres[data-type="expr"]'); await page.waitForTimeout(1500);
    ok(await A(() => window.__cdp.mq.body.expr === 'sonrisa'), 'search “smile”: the face smiles');
    await page.fill('#crQ', 'afro'); await page.waitForTimeout(600); await page.keyboard.press('Enter'); await page.waitForTimeout(3000);
    ok(await A(() => window.__cdp.mq.body.hair === 'h-afro01'), 'search “afro” and Enter: the first result is put on');
    await page.fill('#crQ', 'fox'); await page.waitForTimeout(800);
    const r = await A(() => ({n: document.querySelectorAll('#crResults .crres').length, types: [...new Set([...document.querySelectorAll('#crResults .crres')].map(b => b.dataset.type))].sort().join(), filt: document.querySelectorAll('#crFilt .chip').length}));
    ok(r.n >= 4 && /head/.test(r.types) && /species/.test(r.types) && r.filt >= 3, `search “fox”: ${r.n} results (${r.types}) and filters by library`);
    await page.click('#crFilt .chip[data-v="species"]'); await page.waitForTimeout(300);
    ok(await A(() => [...document.querySelectorAll('#crResults .crres')].every(b => b.dataset.type === 'species')), 'a filter keeps one library');
    await page.screenshot({path: path.join(SHOTS, 'creator-desktop-search.png')});
    // a look before choosing: a hair colour under the mouse is tried on, and taken off when the mouse goes
    await page.fill('#crQ', ''); await page.click('#crRail .crr[data-cat="hair"]'); await page.waitForTimeout(1500);
    const c0 = await A(() => window.__cdp.mq.body.hairCol); await page.hover('#hairSw button[data-c="#3d55b0"]'); await page.waitForTimeout(200);
    const c1 = await A(() => window.__cdp.mq.body.hairCol); await page.mouse.move(400, 300); await page.waitForTimeout(200); const c2 = await A(() => window.__cdp.mq.body.hairCol);
    ok(c1 === '#3d55b0' && c2 === c0, `hovering a hair colour tries it on (${c0} → ${c1} → ${c2})`);
    await page.fill('#crQ', 'fox'); await page.waitForTimeout(500); await page.click('#crFilt .chip[data-v="species"]').catch(() => {});
    await page.click('#crResults .crres[data-id="zorro"]'); await page.waitForTimeout(3500);
    ok(await A(() => window.__cdp.mq.body.species === 'zorro' && document.querySelector('#speciesChips .chip[data-v="zorro"]').getAttribute('aria-pressed') === 'true'), 'search “fox” → Species: a tap makes a fox, as its chip would');
    await page.fill('#crQ', ''); await page.click('#crRail .crr[data-cat="body"]'); await page.waitForTimeout(3000);
    await page.screenshot({path: path.join(SHOTS, 'creator-desktop-cuerpo.png')});
    // the turntable, and leaving
    await page.click('#crSpin'); await page.waitForTimeout(300);
    const spin = await A(() => window.__cdp.controls.autoRotate && document.querySelector('#crSpin').getAttribute('aria-pressed') === 'true');
    await goTab(page, 'pose'); await page.waitForTimeout(800);
    ok(spin && await A(() => !document.body.classList.contains('creator') && !window.__cdp.controls.autoRotate && getComputedStyle(document.querySelector('#crRail')).display === 'none'), 'the turntable turns; leaving for Pose stops it and puts the creator away');
    ok(!page.errors.filter(e => !noise(e)).length, 'no errors' + (page.errors.filter(e => !noise(e)).length ? ': ' + page.errors.filter(e => !noise(e)).join(' | ') : ''));
    await page.context().close();
    // a phone: the rail and the strip in the sheet, the character in sight
    const ph = await open(browser, {viewport: {width: 390, height: 844}, mobile: true}), P = (f, a) => ph.evaluate(f, a);
    await goTab(ph, 'cuerpo'); await ph.waitForTimeout(3000);
    const m = await P(() => { const r = document.querySelector('#crRail'), pg = document.querySelector('#book .page'), c = document.querySelector('#crCam').getBoundingClientRect();
      return {x: document.documentElement.scrollWidth - innerWidth, px: pg.scrollWidth - pg.clientWidth, inSheet: pg.contains(r) && pg.contains(document.querySelector('#crGallery')), btn: Math.min(...[...r.querySelectorAll('.crr')].map(b => b.getBoundingClientRect().height)),
        cam: c.width >= 40 && c.right <= innerWidth && c.left > 0, canvas: document.querySelector('#gl').getBoundingClientRect().height, top: document.querySelector('header.top').getBoundingClientRect().height}; });
    ok(m.x <= 0 && m.px <= 0 && m.top < 60, `phone: no sideways scroll (page ${m.x}, sheet ${m.px}), the top bar on one line (${Math.round(m.top)} px)`);
    ok(m.inSheet && m.btn >= 40 && m.cam && m.canvas > 200, `phone: the rail and the strip are in the sheet (rail buttons ${Math.round(m.btn)} px), the character in sight (${Math.round(m.canvas)} px) with its camera buttons`);
    await ph.screenshot({path: path.join(SHOTS, 'creator-phone-cuerpo.png')});
    await ph.click('#crRail .crr[data-cat="face"]'); await ph.waitForTimeout(1500);
    const f = await P(() => { const pg = document.querySelector('#book .page').getBoundingClientRect(), r = document.querySelector('#crRail').getBoundingClientRect(), h = document.querySelector('#crCatFace').getBoundingClientRect(); return {stuck: Math.abs(r.top - pg.top) < 12 || r.top >= pg.top - 8, h: h.top - r.bottom, view: window.__cdp.creator.CR.view}; });
    ok(f.stuck && f.h >= -4 && f.h < 120 && f.view === 'face', `phone: Face scrolls the sheet there under the rail, which stays (${Math.round(f.h)} px), and looks at the face`);
    await ph.screenshot({path: path.join(SHOTS, 'creator-phone-face.png')});
    await ph.fill('#crQ', 'sombrero'); await ph.waitForTimeout(2500);
    ok(await P(() => document.querySelectorAll('#crResults .crres').length > 0), 'phone: the search finds things too');
    await ph.click('#crRail .crr[data-cat="clothes"]'); await ph.waitForTimeout(3000);
    await ph.screenshot({path: path.join(SHOTS, 'creator-phone-ropa.png')});
    ok(await P(() => window.__cdp.state.tab === 'ropa' && document.body.classList.contains('creator')), 'phone: Clothes from the rail');
    ok(!ph.errors.filter(e => !noise(e)).length, 'phone: no errors' + (ph.errors.filter(e => !noise(e)).length ? ': ' + ph.errors.filter(e => !noise(e)).join(' | ') : ''));
    await ph.context().close();
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
