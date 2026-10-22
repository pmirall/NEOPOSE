// The default wolf's body as the app builds it (rest positions, triangles, each vertex's main bone, the rig's joints), for
// export_body.py's roots:   CHROMIUM=/path/to/chrome node dump_body.js lobo .out/mhbody.json
const fs = require('fs'), path = require('path'), http = require('http'), {chromium} = require(path.join(__dirname, '../../tests/node_modules/playwright-core'));
const APP = process.env.APP || path.join(__dirname, '../../app'), SP = process.argv[2] || 'lobo', OUT = process.argv[3] || 'mhbody.json';
const server = http.createServer((q, r) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html'; fs.readFile(path.join(APP, u), (e, d) => { if (e) { r.statusCode = 404; return r.end(); } const ext = path.extname(u); r.setHeader('content-type', {'.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json'}[ext] || 'application/octet-stream'); r.end(d); }); });
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  const ctx = await browser.newContext({viewport: {width: 900, height: 700}});
  await ctx.addInitScript(() => { localStorage.setItem('cdp.lang', '"es"'); localStorage.setItem('cdp.welcomed', 'true'); });
  const page = await ctx.newPage();
  await page.goto(`http://localhost:${server.address().port}/`); await page.waitForFunction(() => window.__cdp && window.__cdp.chars && window.__cdp.chars.length, null, {timeout: 120000}); await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector('[data-tab="cuerpo"], .tab[data-t="cuerpo"]') && 0);
  await page.evaluate(sp => { const C = window.__cdp; const el = document.querySelector(`#speciesChips .chip[data-v="${sp}"]`); el.click(); }, SP);
  await page.waitForTimeout(8000);
  const r = await page.evaluate(() => { const C = window.__cdp, m = C.mq, FIG = C.FIG || window.FIG;
    const P = m.geo.attributes.position.array, I = m.geo.index.array;
    return {P: Array.from(P, v => +v.toFixed(5)), I: Array.from(I), dom: Array.from(m.dom), eye: Array.from(FIG.eye), J: Array.from(m.J, v => +v.toFixed(5)), bones: FIG.meta.bones.map(b => b.name || b), size: m.size,
      yc: m.headSwap && m.headSwap.yc, pawHeel: m.pawHeel && {L: m.pawHeel.L && m.pawHeel.L.toArray(), R: m.pawHeel.R && m.pawHeel.R.toArray()}}; });
  fs.writeFileSync(OUT, JSON.stringify(r)); console.log('nV', r.P.length / 3, 'nT', r.I.length / 3, 'size', r.size, 'yc', r.yc, r.pawHeel);
  await browser.close(); server.close();
})();
