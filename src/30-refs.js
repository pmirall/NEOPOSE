/* ======================= references: search free images, GIFs and panoramas, and use them =======================
   Openly licensed sources only, searched from the browser (no key, CORS-enabled): Openverse (CC and public domain,
   from Flickr, Wikimedia, the Smithsonian and other museums…), Wikimedia Commons and Poly Haven
   (CC0 panoramas and models). A picture becomes a pose (the on-device detector of 23-photo), an animated GIF becomes an
   animation (its frames through the video path of 27-board), a panorama or a photo becomes a set, with the light coming
   from where the sun is in it and objects from Poly Haven that match the search.
   For an all-ages app the results go through layers: blocked words in the search and in the titles and tags, licences
   that allow adapting (CC0, PD, BY, BY-SA), GIFs only from curated categories of people moving, and an on-device
   classifier (NSFWJS, MIT) that keeps every thumbnail blurred until it has looked at it. Every result carries its
   title, author, source and licence, shown with it and kept with what is made from it. */
const REF = {mode: 'pose', q: '', src: 'all', res: [], sel: null, page: 1, busy: false, tok: 0, nsfw: null, credits: []};
const UA_HDR = {'Api-User-Agent': 'NEOPOSE/1.6.0 (https://github.com/pmirall/NEOPOSE)'};

/* ---------- safety ---------- */
const BLOCK = ['nude', 'nudes', 'naked', 'nudity', 'nudist', 'topless', 'porn', 'porno', 'pornography', 'sex', 'sexy', 'sexual', 'erotic', 'erotica', 'nsfw', 'hentai', 'fetish', 'bdsm',
  'lingerie', 'boudoir', 'striptease', 'stripper', 'playboy', 'genital', 'genitals', 'penis', 'vagina', 'nipple', 'nipples', 'breasts', 'buttocks', 'xxx', 'onlyfans',
  'desnudo', 'desnuda', 'desnudos', 'desnudas', 'desnudez', 'erotico', 'erotica', 'sexo', 'lenceria', 'pezon', 'pezones', 'nu', 'nue', 'nus', 'nues', 'nudite', 'erotique', 'seins',
  'nua', 'nuas', 'nudez', 'pelada', 'pelado', 'nackt', 'nacktheit', 'erotik', 'busen', 'nudo', 'nuda', 'nudi', 'nude', 'erotismo', 'despullat', 'despullada'];
const BLOCK_SET = new Set(BLOCK);
const blocked = t => uxNorm(t || '').split(/[^a-z0-9]+/).some(w => BLOCK_SET.has(w));
// the classifier: MobileNetV2 trained on drawings, neutral photos and explicit ones; loaded only when searching
function nsfwModel() {
  if (!REF.nsfw) REF.nsfw = (async () => {
    await poseDetector();  // the same TensorFlow.js
    if (!window.tf || !tf.loadLayersModel) await loadScript('vendor/pose/tf-layers.min.js');
    return tf.loadLayersModel('vendor/nsfw/model.json');
  })().catch(e => { console.warn('nsfw', e); REF.nsfw = null; return null; });
  return REF.nsfw;
}
// probability that a picture is not for all ages (porn, hentai, sexy)
async function nsfwScore(img) {
  const m = await nsfwModel(); if (!m) return null;
  const p = tf.tidy(() => { const t = tf.div(tf.cast(tf.browser.fromPixels(img), 'float32'), 255), r = tf.image.resizeBilinear(t, [224, 224], true); return m.predict(tf.reshape(r, [1, 224, 224, 3])); });  // the core build has no chained ops
  const v = await p.data(); p.dispose();
  return v[1] + v[3] + v[4];
}

/* ---------- searching ---------- */
// a few common words, so that a search in any of the app's languages finds the (mostly English) descriptions
const REF_WORDS = {correr: 'running', corriendo: 'running', andar: 'walking', caminar: 'walking', saltar: 'jumping', salto: 'jump', bailar: 'dancing', baile: 'dance', bailarina: 'ballerina',
  sentado: 'sitting', sentada: 'sitting', tumbado: 'lying', acostado: 'lying', boxeo: 'boxing', lucha: 'wrestling', patada: 'kick', esgrima: 'fencing', espada: 'sword', arco: 'archery',
  guerrero: 'warrior', escultura: 'sculpture', estatua: 'statue', figura: 'figure', retrato: 'portrait', manos: 'hands', mano: 'hand', cara: 'face', pie: 'standing', depie: 'standing',
  yoga: 'yoga', gimnasia: 'gymnastics', futbol: 'football', baloncesto: 'basketball', tenis: 'tennis', nadar: 'swimming', ciclista: 'cyclist', escalar: 'climbing', patinar: 'skating',
  bosque: 'forest', ciudad: 'city', calle: 'street', playa: 'beach', montana: 'mountain', interior: 'interior', cocina: 'kitchen', salon: 'living room', dormitorio: 'bedroom',
  laboratorio: 'laboratory', hospital: 'hospital', museo: 'museum', estacion: 'station', aeropuerto: 'airport', tienda: 'shop', mercado: 'market', puerto: 'harbour', granja: 'farm',
  cueva: 'cave', lago: 'lake', rio: 'river', jardin: 'garden', carretera: 'road', puente: 'bridge', fabrica: 'factory', almacen: 'warehouse', garaje: 'garage', gimnasio: 'gym',
  piscina: 'pool', estadio: 'stadium', teatro: 'theatre', cine: 'cinema', restaurante: 'restaurant', escuela: 'school', universidad: 'university', biblioteca: 'library',
  pintura: 'art', galeria: 'gallery', taller: 'workshop', sotano: 'basement', atico: 'attic', tejado: 'roof', pasillo: 'hallway', bano: 'bathroom', terraza: 'terrace', patio: 'courtyard',
  noche: 'night', atardecer: 'sunset', nieve: 'snow', desierto: 'desert', iglesia: 'church', castillo: 'castle', parque: 'park', oficina: 'office', estudio: 'studio', campo: 'field',
  courir: 'running', marcher: 'walking', danse: 'dance', foret: 'forest', ville: 'city', plage: 'beach', laufen: 'running', tanzen: 'dancing', wald: 'forest', stadt: 'city',
  correre: 'running', ballare: 'dancing', bosco: 'forest', citta: 'city', spiaggia: 'beach', correndo: 'running', floresta: 'forest', cidade: 'city', praia: 'beach', corrent: 'running', ballar: 'dancing'};
const refQuery = q => uxNorm(q).split(/\s+/).filter(Boolean).map(w => REF_WORDS[w] || w).join(' ');
const stripTags = h => { const d = document.createElement('div'); d.innerHTML = h || ''; return d.textContent.trim(); };
async function getJSON(url, headers) { const r = await fetch(url, {headers}); if (r.status === 429) throw new Error(tr('demasiadas búsquedas seguidas; espera un minuto')); if (!r.ok) throw new Error(r.status); return r.json(); }

const REF_SOURCES = {
  openverse: {name: 'Openverse', modes: ['pose', 'anim', 'scene'], async search(q, mode, page) {
    const p = new URLSearchParams({q: mode === 'scene' ? q + ' landscape' : q, license: 'cc0,pdm,by,by-sa', mature: 'false', page_size: '20', page: String(page), filter_dead: 'true'});
    if (mode === 'anim') p.set('extension', 'gif'); if (mode === 'scene') p.set('aspect_ratio', 'wide');
    const j = await getJSON('https://api.openverse.org/v1/images/?' + p);
    return j.results.filter(r => !r.mature).map(r => ({id: 'ov:' + r.id, src: 'Openverse · ' + (r.source || r.provider || ''), title: r.title || '', tags: (r.tags || []).map(t => t.name).join(' '),
      thumb: `https://api.openverse.org/v1/images/${r.id}/thumb/`, full: mode === 'anim' ? r.url : `https://api.openverse.org/v1/images/${r.id}/thumb/?full_size=true&compressed=false`,
      gif: mode === 'anim' ? r.url : null, w: r.width, h: r.height, author: r.creator || '', authorUrl: r.creator_url || '', license: (r.license === 'pdm' ? 'Public domain' : r.license === 'cc0' ? 'CC0' : 'CC ' + r.license.toUpperCase() + ' ' + (r.license_version || '')).trim(),
      licenseUrl: r.license_url || '', page: r.foreign_landing_url || '', attribution: r.attribution || ''}));
  }},
  commons: {name: 'Wikimedia Commons', modes: ['pose', 'anim', 'scene'], async search(q, mode, page) {
    const safe = ' -nude -naked -nudity -erotic', off = (page - 1) * 20;
    // GIFs only from categories of people moving (the whole of Commons has no safe search)
    const queries = mode === 'anim' ? ['deepcat:"Animations of sports"', 'deepcat:"Animations of dance"', 'deepcat:"Animations of walking"', 'deepcat:"Animations of running"'].map(c => `${q} filemime:image/gif ${c}${safe}`)
      : mode === 'scene' ? [`hastemplate:Pano360 ${q}${safe}`] : [`${q} filetype:bitmap -filemime:image/gif${safe}`];
    const out = [];
    await Promise.all(queries.map(async gs => {
      const p = new URLSearchParams({action: 'query', format: 'json', formatversion: '2', origin: '*', generator: 'search', gsrnamespace: '6', gsrlimit: mode === 'anim' ? '10' : '20', gsroffset: String(mode === 'anim' ? (page - 1) * 10 : off),
        gsrsearch: gs, prop: 'imageinfo', iiprop: 'url|mime|size|metadata|extmetadata', iiurlwidth: mode === 'scene' ? '2048' : mode === 'anim' ? '480' : '1024',
        iiextmetadatafilter: 'LicenseShortName|LicenseUrl|Artist|ObjectName|ImageDescription|Categories|Restrictions'});
      const j = await getJSON('https://commons.wikimedia.org/w/api.php?' + p, UA_HDR);
      for (const pg of (j.query && j.query.pages) || []) {
        const ii = pg.imageinfo && pg.imageinfo[0]; if (!ii) continue;
        const md = Object.fromEntries((ii.metadata || []).map(m => [m.name, m.value])), em = ii.extmetadata || {}, v = k => em[k] ? stripTags(em[k].value) : '';
        if (mode === 'anim' && !(md.frameCount > 1)) continue;
        if (mode === 'scene' && Math.abs(ii.width / ii.height - 2) > .05) continue;
        const lic = v('LicenseShortName'); if (/\bND\b|\bNC\b|fair use/i.test(lic)) continue;
        out.push({id: 'wc:' + pg.pageid, src: 'Wikimedia Commons', title: v('ObjectName') || pg.title.replace(/^File:|\.\w+$/g, ''), tags: v('ImageDescription') + ' ' + v('Categories'),
          thumb: ii.thumburl ? ii.thumburl.replace(/\/\d+px-/, '/320px-') : ii.url, full: ii.thumburl || ii.url, gif: mode === 'anim' ? (ii.thumburl || ii.url) : null, w: ii.width, h: ii.height,
          author: v('Artist'), license: lic, licenseUrl: v('LicenseUrl'), page: ii.descriptionurl, frames: md.frameCount, pano: mode === 'scene'});
      }
    }));
    return out;
  }},
  polyhaven: {name: 'Poly Haven', modes: ['scene'], async search(q, mode, page) {
    if (page > 1) return [];
    const all = await polyHaven('hdris'), w = uxNorm(q).split(/\s+/).filter(Boolean);
    return Object.entries(all).filter(([id, a]) => !w.length || w.every(t => uxNorm(id + ' ' + a.name + ' ' + (a.tags || []).join(' ') + ' ' + (a.categories || []).join(' ')).includes(t))).slice(0, 40)
      .map(([id, a]) => ({id: 'ph:' + id, src: 'Poly Haven', title: a.name, tags: (a.tags || []).join(' '), thumb: `https://cdn.polyhaven.com/asset_img/primary/${id}.png?width=320&format=jpg`,
        full: `https://cdn.polyhaven.com/asset_img/primary/${id}.png?width=2048&format=jpg`, author: Object.keys(a.authors || {}).join(', '), license: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
        page: `https://polyhaven.com/a/${id}`, pano: true, trusted: true}));
  }}
};
const PH = {};
function polyHaven(type) { if (!PH[type]) PH[type] = getJSON('https://api.polyhaven.com/assets?t=' + type).catch(e => { delete PH[type]; throw e; }); return PH[type]; }
const QUICK = {pose: ['correr', 'bailarina', 'boxeo', 'sentado', 'escultura', 'guerrero', 'yoga', 'manos'], anim: ['walking', 'running', 'dance', 'ballet', 'jump', 'gymnastics', 'boxing', 'skating'],
  scene: ['bosque', 'ciudad', 'playa', 'interior', 'noche', 'montaña', 'nieve', 'estudio']};

async function refSearch(more) {
  const q = $('#refQ').value.trim(), tok = ++REF.tok;
  if (!more) { REF.page = 1; REF.res = []; REF.sel = null; $('#refGrid').innerHTML = ''; renderRefDetail(); }
  if (blocked(q)) { $('#refGrid').innerHTML = `<p class="empty">${tr('Esa búsqueda no está disponible en NEOPOSE.')}</p>`; return; }
  const qq = refQuery(q) || {pose: 'figure', anim: 'motion', scene: ''}[REF.mode];
  REF.busy = true; renderRefGrid(); refMsg(tr('Buscando…'));
  const srcs = Object.entries(REF_SOURCES).filter(([k, s]) => s.modes.includes(REF.mode) && (REF.src === 'all' || REF.src === k));
  const got = await Promise.all(srcs.map(([k, s]) => s.search(qq, REF.mode, REF.page).catch(e => { console.warn('refs', k, e); return {error: s.name + ': ' + (e.message || e)}; })));
  if (tok !== REF.tok) return;
  const errors = got.filter(g => g.error).map(g => g.error), lists = got.filter(g => Array.isArray(g));
  // interleave the sources, drop what the words say is not for all ages
  const seen = new Set(REF.res.map(r => r.id)), mixed = [];
  for (let i = 0; lists.some(l => i < l.length); i++) for (const l of lists) { const r = l[i]; if (r && !seen.has(r.id) && !blocked(r.title + ' ' + r.tags)) { seen.add(r.id); mixed.push(r); } }
  REF.res.push(...mixed); REF.busy = false; REF.more = mixed.length > 0;
  refMsg(errors.length && !REF.res.length ? tr('No se ha podido buscar: {e}', {e: errors.join(' · ')}) : REF.res.length ? '' : tr('Nada coincide con la búsqueda.'));
  renderRefGrid();
}
const refMsg = t => { $('#refMsg').textContent = t; };
const actMsg = t => { const m = $('#refActMsg'); if (m) m.textContent = t; };

/* ---------- the window ---------- */
function refCard(r) {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'refcard pending'; b.title = r.title; b.dataset.id = r.id;
  const img = new Image(); img.crossOrigin = 'anonymous'; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
  const lab = document.createElement('span'); lab.className = 'rl'; lab.textContent = r.license;
  b.append(img, lab); b.onclick = () => { REF.sel = r; $$('#refGrid .refcard').forEach(c => c.classList.toggle('on', c === b)); renderRefDetail(); };
  img.onload = async () => {
    if (r.trusted) return b.classList.remove('pending');
    const s = await nsfwScore(img).catch(() => null);
    if (s != null && s > .45) { b.remove(); REF.res = REF.res.filter(x => x !== r); r.hidden = true; return; }
    r.checked = s != null; b.classList.remove('pending');
  };
  img.onerror = () => { b.remove(); REF.res = REF.res.filter(x => x !== r); };
  img.src = r.thumb;
  return b;
}
function renderRefGrid() {
  const g = $('#refGrid'); if (!REF.res.length && !REF.busy) { if (!g.querySelector('.empty')) g.innerHTML = ''; return; }
  const have = new Set([...g.querySelectorAll('.refcard')].map(c => c.dataset.id));
  g.querySelector('.empty')?.remove(); g.querySelector('.refmore')?.remove(); g.querySelectorAll('.refskel').forEach(e => e.remove());
  for (const r of REF.res) if (!have.has(r.id)) g.appendChild(refCard(r));
  if (REF.busy) for (let i = 0; i < 8; i++) { const s = document.createElement('div'); s.className = 'refskel'; s.setAttribute('aria-hidden', 'true'); g.appendChild(s); }  // cards to come
  if (REF.more && !REF.busy) { const m = document.createElement('button'); m.type = 'button'; m.className = 'btn small refmore'; m.textContent = tr('Más resultados'); m.onclick = () => { REF.page++; refSearch(true); }; g.appendChild(m); }
}
function creditOf(r) { return r.attribution || [r.title && `“${r.title}”`, r.author && tr('de {a}', {a: r.author}), r.src, r.license].filter(Boolean).join(' · '); }
function renderRefDetail() {
  const d = $('#refDet'), r = REF.sel; d.hidden = !r; if (!r) return;
  d.innerHTML = `<div class="refprev"><img alt=""></div><p class="refttl"></p><p class="note refcred"></p><div class="refacts"></div><p class="msg" id="refActMsg" role="status"></p>`;
  const img = d.querySelector('img'); img.crossOrigin = 'anonymous'; img.src = r.gif || (r.pano ? r.thumb : r.full);
  d.querySelector('.refttl').textContent = r.title || tr('Sin título');
  const c = d.querySelector('.refcred'); c.textContent = creditOf(r) + ' '; if (r.page) { const a = document.createElement('a'); a.href = r.page; a.target = '_blank'; a.rel = 'noopener'; a.textContent = tr('Ver el original'); c.appendChild(a); }
  const acts = d.querySelector('.refacts'), act = (label, fn, primary) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn small' + (primary ? ' primary' : ''); b.textContent = tr(label); b.onclick = () => runRefAct(fn, b); acts.appendChild(b); };
  if (REF.mode === 'pose') { act('Usar como pose', () => refToPose(r), true); act('Ponerla sobre el lienzo', () => refAsOverlay(r)); act('Usar como fondo', () => refToScene(r, false)); }
  else if (REF.mode === 'anim') act('Convertir en animación', () => refToAnim(r), true);
  else { act('Usar como escenario', () => refToScene(r, false), true); act('Generar escenario con objetos', () => refToScene(r, true)); }
}
async function runRefAct(fn, b) {
  const m = $('#refActMsg'); b.disabled = true;
  try { await fn(); } catch (e) { console.warn('ref', e); m.textContent = tr('No se ha podido: {e}', {e: e && e.message || e}); }
  b.disabled = false;
}
async function refBlob(url) { const r = await fetch(url, {mode: 'cors'}); if (!r.ok) throw new Error(r.status); return r.blob(); }
const fileName = (r, ext) => (r.title || 'referencia').replace(/[^\w\-áéíóúñü ]+/gi, '').trim().slice(0, 40) + '.' + ext;
function keepCredit(r, what) { REF.credits = [{t: creditOf(r), url: r.page, what}, ...REF.credits.filter(c => c.url !== r.page)].slice(0, 20); store.set('cdp.refCredits', REF.credits); }

// a picture: the active character takes the pose in it, and the picture stays over the canvas to compare
async function refToPose(r) {
  actMsg(tr('Buscando a la persona…'));
  const blob = await refBlob(r.full), file = new File([blob], fileName(r, 'jpg'), {type: blob.type || 'image/jpeg'});
  closeRefs(); showTab('pose'); const d = $('details[data-sec=foto]'); if (d) d.open = true;
  PHOTO.fromCanvas = false; await usePhoto(file); PHOTO.credit = creditOf(r); $('#photoCredit').textContent = tr('Referencia: {c}', {c: PHOTO.credit}); keepCredit(r, 'pose');
}
async function refAsOverlay(r) {
  const blob = await refBlob(r.full), img = new Image(); img.src = URL.createObjectURL(blob); await img.decode();
  PHOTO.img = img; drawPhotoPreview(img, null); $('#photoRef').checked = true; showPhotoRef(); PHOTO.credit = creditOf(r); $('#photoCredit').textContent = tr('Referencia: {c}', {c: PHOTO.credit});
  keepCredit(r, 'overlay'); closeRefs(); showTab('pose'); const d = $('details[data-sec=foto]'); if (d) d.open = true;
}
// a GIF: its frames through the same window as a video (each frame's pose, trim, smoothing, into a shot)
async function refToAnim(r) {
  actMsg(tr('Descargando el GIF…'));
  const blob = await refBlob(r.gif);
  keepCredit(r, 'anim'); closeRefs(); $('#animGallery') && ($('#animGallery').hidden = true);
  if (!ANIM.open) $('#animBtn').click();
  openBoard([new File([blob], fileName(r, 'gif'), {type: 'image/gif'})]);
}

/* ---------- sets from a reference ---------- */
// a panorama (2:1) wraps the scene; any other picture stays behind the characters as a backdrop; both with a floor
// that only takes shadows, and the light from where the photo is brightest
const REF_SCENES = store.get('cdp.refScenes', {});
function registerRefScene(e) {
  const id = e.id;
  SCENES[id] = {label: e.label, group: 'ref', amb: e.amb || 'dia', assets: [], pano: e.pano ? e.url : null, backplate: e.pano ? null : e.url, credit: e.credit, build(g) {
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.ShadowMaterial({opacity: .32}));
    fl.rotation.x = -Math.PI / 2; fl.position.y = .001; fl.receiveShadow = true; Object.assign(fl.userData, {noOutline: true, noOcclude: true, ground: true}); g.add(fl);
  }};
  return id;
}
for (const e of Object.values(REF_SCENES)) registerRefScene(e);
async function refToScene(r, withProps) {
  const pano = !!r.pano || (r.w && Math.abs(r.w / r.h - 2) < .05), id = 'ref_' + r.id.replace(/[^\w]/g, '_');
  const e = {id, label: r.title || tr('Referencia'), url: pano ? r.full : r.full, pano, credit: creditOf(r)};
  REF_SCENES[id] = e; const keys = Object.keys(REF_SCENES); if (keys.length > 12) delete REF_SCENES[keys[0]]; store.set('cdp.refScenes', REF_SCENES);
  registerRefScene(e); keepCredit(r, 'scene');
  actMsg(tr('Cargando el escenario…'));
  await setEnv(id); pushHistory();
  if (withProps) await addRefProps($('#refQ').value.trim() || r.tags || r.title);
  closeRefs(); toast(tr('Escenario: {c}', {c: e.credit}));
}
// objects from Poly Haven (CC0) whose name or tags match the search, set round the back of the scene
async function addRefProps(q) {
  const all = await polyHaven('models'), words = refQuery(q).split(/\s+/).filter(w => w.length > 2);
  const score = ([id, a]) => { const t = uxNorm(id + ' ' + a.name + ' ' + (a.tags || []).join(' ') + ' ' + (a.categories || []).join(' ')); return words.filter(w => t.includes(w)).length; };
  let pick = Object.entries(all).map(x => [score(x), x]).filter(s => s[0] > 0).sort((a, b) => b[0] - a[0]).slice(0, 4).map(s => s[1][0]);
  if (!pick.length) pick = Object.entries(all).filter(([, a]) => (a.categories || []).some(c => /furniture|nature|decorative/.test(c))).sort(() => Math.random() - .5).slice(0, 3).map(x => x[0]);
  const c = mq.joints.hips.getWorldPosition(new V3()), az = camAzimuth() * DEG;
  pick.forEach((id, i) => {
    const a = az + Math.PI + (i - (pick.length - 1) / 2) * .9, rr = 2.2 + (i % 2) * .8;  // behind the characters as seen from the camera
    const g = makeProp('ph:' + id, new V3(c.x + Math.sin(a) * rr, 0, c.z + Math.cos(a) * rr)); g.rotation.y = a + Math.PI;
  });
  pushHistory();
}
// a Poly Haven model as a prop (makeProp calls this for 'ph:<id>')
const phLoader = (() => { const mgr = new THREE.LoadingManager(), l = new THREE.GLTFLoader(mgr); l.manager = mgr; return l; })();
const PH_MODELS = new Map();
function polyHavenModel(id) {
  if (!PH_MODELS.has(id)) PH_MODELS.set(id, (async () => {
    const f = await getJSON('https://api.polyhaven.com/files/' + id), g = f.gltf && (f.gltf['1k'] || f.gltf['2k']); if (!g) throw new Error('no glTF');
    const inc = g.gltf.include || {};
    phLoader.manager.setURLModifier(u => { const k = Object.keys(inc).find(p => u.endsWith(p)); return k ? inc[k].url : u; });
    const gl = await new Promise((res, rej) => phLoader.load(g.gltf.url, res, undefined, rej));
    const root = gl.scene, mm = new Map();
    root.traverse(o => { if (!o.isMesh) return; if (!mm.has(o.material)) mm.set(o.material, setMaterial(o.material)); o.material = mm.get(o.material); o.castShadow = o.receiveShadow = true; });
    return root;
  })().catch(e => { PH_MODELS.delete(id); throw e; }));
  return PH_MODELS.get(id);
}
function fillPolyHavenProp(g, id) {
  g.userData.box = new THREE.Box3(new V3(-.3, 0, -.3), new V3(.3, .6, .3));
  return polyHavenModel(id).then(root => {
    const c = root.clone(true); g.add(c); g.userData.box = new THREE.Box3().setFromObject(c).applyMatrix4(new THREE.Matrix4().copy(g.matrixWorld).invert());
    c.traverse(o => { if (o.isMesh) o.userData.propRoot = g; }); addOutlines(c); setOutlines(c, state.envOutline);
  }, e => console.warn('polyhaven', id, e));
}

/* ---------- the light from the brightest part of a panorama ---------- */
// u along the panorama (0..1) and its height above the horizon → where the key light comes from
function sunFromImage(im) {
  const W = 128, H = 64, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.drawImage(im, 0, 0, W, H);
  const d = x.getImageData(0, 0, W, H).data, lum = (i, y) => { const o = (y * W + i) * 4; return d[o] * .3 + d[o + 1] * .59 + d[o + 2] * .11; };
  let top = 0; for (let y = 1; y < H / 2; y++) for (let i = 0; i < W; i++) top = Math.max(top, lum(i, y));
  // the middle of the brightest patch (a real sun is a plateau of clipped pixels), averaged round the circle along u
  let sx = 0, sz = 0, sv = 0, n = 0;
  for (let y = 1; y < H / 2; y++) for (let i = 0; i < W; i++) if (lum(i, y) >= top - 6) { const t = 2 * Math.PI * (i + .5) / W; sx += Math.cos(t); sz += Math.sin(t); sv += (y + .5) / H; n++; }
  const u = ((Math.atan2(sz, sx) / (2 * Math.PI)) + 1) % 1;
  return {u, el: (.5 - sv / n) * 180, l: top};
}
function aimSun(sun, rot) {
  const t = 2 * Math.PI * sun.u, r = (rot || 0) * DEG, dx = -Math.cos(t), dz = Math.sin(t), wx = dx * Math.cos(r) + dz * Math.sin(r), wz = -dx * Math.sin(r) + dz * Math.cos(r);
  state.light.az = Math.round(Math.atan2(wx, wz) / DEG); state.light.el = Math.round(clamp(sun.el, 8, 75)); state.lightPreset = null;
  if (typeof syncLightUI === 'function') syncLightUI();
}

/* ---------- opening ---------- */
function openRefs(mode) {
  const changed = mode && mode !== REF.mode; REF.mode = mode || REF.mode; setPressed($('#refMode'), REF.mode); renderRefSources(); renderQuick();
  $('#refModal').hidden = false; $('#refPH').hidden = REF.mode !== 'scene';
  nsfwModel();  // starts loading while the person types
  setTimeout(() => $('#refQ').focus(), 50);
  if (changed || !REF.res.length) refSearch();  // another kind of reference: what was on screen does not apply
}
function closeRefs() { $('#refModal').hidden = true; }
function renderRefSources() {
  const items = [['all', tr('Todas')], ...Object.entries(REF_SOURCES).filter(([, s]) => s.modes.includes(REF.mode)).map(([k, s]) => [k, s.name])];
  if (!items.some(i => i[0] === REF.src)) REF.src = 'all';
  chips($('#refSrc'), items, REF.src, v => { REF.src = v; refSearch(); });
}
function renderQuick() { chips($('#refQuick'), QUICK[REF.mode].map(w => [w, LANG.startsWith('es') ? w : REF_WORDS[uxNorm(w)] || w]), null, w => { $('#refQ').value = LANG.startsWith('es') ? w : REF_WORDS[uxNorm(w)] || w; setPressed($('#refQuick'), ''); refSearch(); }); }
function buildRefsUI() {
  REF.credits = store.get('cdp.refCredits', []);
  chips($('#refMode'), [['pose', 'Poses'], ['anim', 'Animación (GIF)'], ['scene', 'Escenarios']], REF.mode, v => { REF.mode = v; $('#refPH').hidden = v !== 'scene'; renderRefSources(); renderQuick(); refSearch(); });
  $('#refForm').onsubmit = e => { e.preventDefault(); refSearch(); };
  $('#refClose').onclick = closeRefs; $('#refModal').onclick = e => { if (e.target.id === 'refModal') closeRefs(); };
  $('#refOpenPose').onclick = () => openRefs('pose'); $('#refOpenScene').onclick = () => openRefs('scene');
  const ga = $('#refOpenAnim'); if (ga) ga.onclick = () => openRefs('anim');
}
