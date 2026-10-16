/* ======================= drawings and video to animation =======================
   Drop a storyboard sheet, a few photos or drawings, or a video, and press Animate. A sheet is cut into its panels
   (the boxes drawn on the paper); each panel, photo or video frame goes through the photo-to-pose detector
   (BlazePose, on this device), with a second try on thickened lines for light pencil drawings. Panels and photos
   become key poses, eased in between, like an animatic; a video becomes motion capture: every frame, smoothed over
   time, with the sideways movement and the jumps taken from the picture, and can be kept in "My animations". */
const BD = {kind: null, items: [], clip: null, token: 0, busy: false, gap: 1, smooth: 2, root: true, from: 0, to: 1, who: 0, name: ''};

/* ---------- pictures ---------- */
const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
// a piece of a picture (box in its own pixels) on a canvas no bigger than max
function cropOf(src, box, max = 1024) {
  const sw = src.naturalWidth || src.videoWidth || src.width, sh = src.naturalHeight || src.videoHeight || src.height, b = box || {x: 0, y: 0, w: sw, h: sh};
  const k = Math.min(1, max / Math.max(b.w, b.h)), c = mkCanvas(b.w * k, b.h * k);
  c.getContext('2d').drawImage(src, b.x, b.y, b.w, b.h, 0, 0, c.width, c.height); return c;
}
// pencil lines made darker and thicker, on a white margin: what the detector needs to see a light drawing
function inkier(src, pad) {
  const r = Math.max(2, Math.round(Math.min(src.width, src.height) / 110)), m = pad ? Math.round(Math.max(src.width, src.height) * .25) : 0;
  const c = mkCanvas(src.width + 2 * m, src.height + 2 * m), x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.filter = 'grayscale(1) contrast(1.8)'; x.globalCompositeOperation = 'darken';
  for (let a = 0; a < 8; a++) x.drawImage(src, m + Math.round(Math.cos(a * Math.PI / 4) * r), m + Math.round(Math.sin(a * Math.PI / 4) * r));
  x.drawImage(src, m, m); c.off = m; return c;
}
// grey with its histogram spread evenly: a pale figure on a pale or dark ground (old photos, white mannequins) stands out
function evened(src) {
  const c = mkCanvas(src.width, src.height), x = c.getContext('2d'); x.drawImage(src, 0, 0);
  const im = x.getImageData(0, 0, c.width, c.height), d = im.data, n = d.length / 4, hist = new Uint32Array(256), lum = new Uint8Array(n);
  for (let i = 0; i < n; i++) { lum[i] = (d[i * 4] * 3 + d[i * 4 + 1] * 6 + d[i * 4 + 2]) / 10; hist[lum[i]]++; }
  const map = new Uint8Array(256); let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]; map[v] = Math.round(acc / n * 255); }
  for (let i = 0; i < n; i++) d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = map[lum[i]];
  x.putImageData(im, 0, 0); return c;
}
async function detectIn(cv, photo) {  // photo (video frames): only the first two tries
  const det = await poseDetector(), ok = p => p && p.keypoints3D && (p.score == null || p.score >= .3);
  const tries = [() => [cv, 0], () => [evened(cv), 0], () => [inkier(cv, false), 0], () => [inkier(cv, true), 1]];
  for (const t of photo ? tries.slice(0, 2) : tries) {
    const [pic, off] = t();
    if (!photo && det.reset) det.reset();  // panels are separate pictures: no tracking from the last one (a video keeps it)
    const p = (await det.estimatePoses(pic, {flipHorizontal: false}))[0];
    if (ok(p)) { if (off) for (const k of p.keypoints) { k.x -= pic.off; k.y -= pic.off; } return p; }
  }
  return null;
}
// the panels of a storyboard sheet, in reading order (none for a photo or a lone drawing). As comic readers do it
// (recursive XY cut): split the page along blank bands, again and again; the pieces left that are big and have a
// drawn frame on three sides or more are panels. "Ink" is anything darker than the paper around it, so faint pencil
// and photographed paper with uneven light both work.
function splitPanels(img) {
  const W0 = img.naturalWidth || img.width, H0 = img.naturalHeight || img.height, k = Math.min(1, 800 / W0), W = Math.round(W0 * k), H = Math.round(H0 * k);
  const c = mkCanvas(W, H), x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, W, H);
  const d = x.getImageData(0, 0, W, H).data, g = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) g[i] = (d[i * 4] * 3 + d[i * 4 + 1] * 6 + d[i * 4 + 2]) / 10;
  // the paper: brightest within 9 px, then averaged over 15 px
  const pass = (src, w, h, r, f, horiz) => { const out = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x2 = 0; x2 < w; x2++) { let a = f === 'max' ? 0 : 0, n = 0; for (let e = -r; e <= r; e++) { const xx = horiz ? x2 + e : x2, yy = horiz ? y : y + e; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const v = src[yy * w + xx]; if (f === 'max') { if (v > a) a = v; } else { a += v; n++; } } out[y * w + x2] = f === 'max' ? a : a / n; } return out; };
  const bg = pass(pass(pass(pass(g, W, H, 4, 'max', true), W, H, 4, 'max', false), W, H, 7, 'avg', true), W, H, 7, 'avg', false);
  const ink = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) ink[i] = bg[i] - g[i] > 14 ? 1 : 0;
  const leaves = [];
  const bands = (prof, tol, gap) => { const out = []; let st = -1, last = 0, blank = 0;
    for (let i = 0; i <= prof.length + gap; i++) { const v = i < prof.length ? prof[i] : 0; if (v > tol) { if (st < 0) st = i; blank = 0; last = i; } else if (st >= 0 && ++blank >= gap) { out.push([st, last + 1]); st = -1; } }
    return out; };
  const cut = (x0, y0, x1, y1, depth) => {
    for (const rows of [true, false]) {
      const n = rows ? y1 - y0 : x1 - x0, m = rows ? x1 - x0 : y1 - y0, prof = new Uint32Array(n);
      for (let y = y0; y < y1; y++) for (let x2 = x0; x2 < x1; x2++) if (ink[y * W + x2]) prof[rows ? y - y0 : x2 - x0]++;
      const segs = bands(prof, Math.max(1, m * .004), Math.max(3, Math.round((rows ? H : W) * .008)));
      if (!segs.length) return;
      if (segs.length > 1 && depth < 8) { for (const [a, b] of segs) rows ? cut(x0, y0 + a, x1, y0 + b, depth + 1) : cut(x0 + a, y0, x0 + b, y1, depth + 1); return; }
      const [a, b] = segs[0]; if (a > 0 || b < n) return rows ? cut(x0, y0 + a, x1, y0 + b, depth + 1) : cut(x0 + a, y0, x0 + b, y1, depth + 1);
    }
    leaves.push([x0, y0, x1, y1]);
  };
  cut(0, 0, W, H, 0);
  const P = leaves.filter(([x0, y0, x1, y1]) => {
    const w = x1 - x0, h = y1 - y0; if (w < W * .12 || h < H * .1) return false;
    const t = Math.max(2, Math.round(Math.min(w, h) * .04)), cov = (horiz, from) => { let hit = 0; const n = horiz ? w : h;
      for (let i = 0; i < n; i++) { let any = 0; for (let e = 0; e < t && !any; e++) { const xx = horiz ? x0 + i : from ? x1 - 1 - e : x0 + e, yy = horiz ? (from ? y1 - 1 - e : y0 + e) : y0 + i; any = ink[yy * W + xx]; } hit += any; }
      return hit / n; };
    const cv = [cov(true, 0), cov(true, 1), cov(false, 0), cov(false, 1)]; return cv.filter(v => v > .45).length >= 3 && cv.reduce((a, b) => a + b) >= 2.4;
  });
  if (P.length < 2) return [];
  // a panel whose frame was drawn too lightly still lines up with a row of the others: take it, as tall as its row
  const med = i => P.map(b => b[i + 2] - b[i]).sort((a, b) => a - b)[P.length >> 1], mw = med(0), mh = med(1);
  for (const l of leaves) {
    if (P.includes(l) || l[2] - l[0] < mw * .5 || l[3] - l[1] < mh * .6) continue;
    const row = P.find(b => Math.min(b[3], l[3]) - Math.max(b[1], l[1]) > (b[3] - b[1]) * .7);
    if (row && !P.some(b => Math.min(b[2], l[2]) > Math.max(b[0], l[0]) && Math.min(b[3], l[3]) > Math.max(b[1], l[1]))) P.push([l[0], row[1], l[2], row[3]]);
  }
  P.sort((a, b) => Math.abs(a[1] - b[1]) > mh / 2 ? a[1] - b[1] : a[0] - b[0]);
  return P.map(([x0, y0, x1, y1]) => { const ix = (x1 - x0) * .015, iy = (y1 - y0) * .015; return {x: (x0 + ix) / k, y: (y0 + iy) / k, w: (x1 - x0 - 2 * ix) / k, h: (y1 - y0 - 2 * iy) / k}; });
}
async function imageOf(file) { const img = new Image(); img.src = URL.createObjectURL(file); await img.decode(); return img; }
async function isStoryboard(file) { try { return splitPanels(await imageOf(file)).length >= 2; } catch (_) { return false; } }

/* ---------- poses ---------- */
// a detected pose on the helper figure: rotations, and how far the pelvis drops below standing (crouches, sitting)
function rigPose(pose) {
  const m = clipRig(); m.joints.hips.position.set(0, m.rootY, 0); applyPhotoPose(m, pose);
  const p = m.getPose(), q = {}; for (const j of CLIP_J) q[j] = p.q[j];
  return {q, dy: m.joints.hips.position.y - m.rootY};
}
// key poses eased into one another, as a clip for the preview
function keysClip(list, gap) {
  const fps = 24, step = Math.max(2, Math.round(gap * fps)), frames = [], qa = new Q(), qb = new Q();
  if (list.length === 1) return {frames: [{q: list[0].q, p: [0, list[0].dy, 0], h: REST_CURLS}], fps, len: 0, loop: false};
  for (let i = 0; i < list.length - 1; i++) for (let s = 0; s < step; s++) {
    const t = s / step, u = t * t * (3 - 2 * t), A = list[i], B = list[i + 1], q = {};
    for (const j of CLIP_J) { qa.fromArray(A.q[j]); qb.fromArray(B.q[j]); q[j] = qa.slerp(qb, u).toArray(); }
    frames.push({q, p: [0, A.dy + (B.dy - A.dy) * u, 0], h: REST_CURLS});
  }
  const L = list[list.length - 1]; frames.push({q: L.q, p: [0, L.dy, 0], h: REST_CURLS});
  return {frames, fps, len: (frames.length - 1) / fps, loop: false};
}
// video: the 3D points smoothed over time (gaps filled in), then each frame onto the figure; sideways moves and jumps from the picture
function videoClip(F, fps, o) {
  const ok = F.map(f => !!f.pose), idx = ok.map((v, i) => v ? i : -1).filter(i => i >= 0);
  if (idx.length < 2) return null;
  const lerpPose = i => { // a frame with no figure: between its neighbours
    const a = [...idx].reverse().find(j => j < i) ?? idx[0], b = idx.find(j => j > i) ?? idx[idx.length - 1], t = a === b ? 0 : (i - a) / (b - a), A = F[a].pose, B = F[b].pose;
    const mix = (P, Q2) => P.map((k, n) => ({...k, x: k.x + (Q2[n].x - k.x) * t, y: k.y + (Q2[n].y - k.y) * t, z: (k.z ?? 0) + ((Q2[n].z ?? 0) - (k.z ?? 0)) * t, score: Math.min(k.score, Q2[n].score)}));
    return {keypoints: mix(A.keypoints, B.keypoints), keypoints3D: mix(A.keypoints3D, B.keypoints3D), score: 1};
  };
  const P = F.map((f, i) => f.pose || lerpPose(i)), sig = o.smooth, R = Math.ceil(sig * 2), wts = [];
  for (let d = -R; d <= R; d++) wts.push(sig ? Math.exp(-d * d / (2 * sig * sig)) : d === 0 ? 1 : 0);
  const sm = P.map((p, i) => {
    const out = {keypoints: p.keypoints.map(k => ({...k})), keypoints3D: p.keypoints3D.map(k => ({...k})), score: 1};
    for (const key of ['keypoints', 'keypoints3D']) out[key].forEach((k, n) => {
      let sx = 0, sy = 0, sz = 0, sw = 0;
      for (let d = -R; d <= R; d++) { const j = i + d; if (j < 0 || j >= P.length) continue; const q = P[j][key][n], w = wts[d + R]; sx += q.x * w; sy += q.y * w; sz += (q.z ?? 0) * w; sw += w; }
      k.x = sx / sw; k.y = sy / sw; if (k.z != null) k.z = sz / sw;
    });
    return out;
  });
  // metres per pixel from the torso, and the ground line from where the feet usually are
  const kp = (p, n) => p.keypoints.find(k => k.name === n), k3 = (p, n) => p.keypoints3D.find(k => k.name === n);
  const midOf = (p, f, a, b) => { const A = f(p, a), B = f(p, b); return {x: (A.x + B.x) / 2, y: (A.y + B.y) / 2, z: ((A.z ?? 0) + (B.z ?? 0)) / 2}; };
  const torso = (p, f) => { const a = midOf(p, f, 'left_shoulder', 'right_shoulder'), b = midOf(p, f, 'left_hip', 'right_hip'); return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); };
  const mpps = sm.map(p => torso(p, k3) / Math.max(1, torso(p, kp))).sort((a, b) => a - b), mpp = mpps[mpps.length >> 1];
  const foot = p => Math.max(...['left_ankle', 'right_ankle', 'left_heel', 'right_heel', 'left_foot_index', 'right_foot_index'].map(n => kp(p, n).y));
  const feet = sm.map(foot), ground = [...feet].sort((a, b) => a - b)[Math.floor(feet.length * .8)], x0 = midOf(sm[0], kp, 'left_hip', 'right_hip').x;
  const frames = sm.map((p, i) => {
    const r = rigPose(p), lift = o.root ? Math.max(0, ground - feet[i]) * mpp : 0, dx = o.root ? (midOf(p, kp, 'left_hip', 'right_hip').x - x0) * mpp : 0;
    return {q: r.q, p: [dx, r.dy + (lift > .04 ? lift : 0), 0], h: REST_CURLS};
  });
  return {frames, fps, len: (frames.length - 1) / fps, loop: false};
}
// key poses into a character's track: one every `gap` seconds from frame f0, eased like hand-set keys
function insertKeyPoses(list, ci, f0, gap) {
  const s = shot(), m = chars[ci]; if (!s || !m || !list.length) return 0;
  padKeys(s);
  const step = Math.max(1, Math.round(gap * ANIM.fps)), end = f0 + step * (list.length - 1);
  if (end + 1 > s.len) setShotLen(end + 1);
  const p0 = m.getPose(), at = new V3().fromArray(p0.pos), yaw = facingOf(p0.q), k = m.rootY / clipRig().rootY;
  const K = s.keys[ci].filter(x => x.f < f0 || x.f > end);
  list.forEach((r, i) => K.push({f: f0 + i * step, pose: clipPose(m, {q: r.q, p: [0, r.dy, 0], h: REST_CURLS}, at, yaw, true, k, p0.q)}));
  K.sort((a, b) => a.f - b.f); s.keys[ci] = K;
  ANIM.track = ci; setFrame(f0); renderLabels(); thumbLater(); pushHistory();
  return list.length;
}

/* ---------- reading the files ---------- */
const natural = (a, b) => a.name.localeCompare(b.name, undefined, {numeric: true, sensitivity: 'base'});
async function readBoard(files) {
  const tok = ++BD.token, live = () => tok === BD.token && !$('#sbModal').hidden;
  BD.items = []; BD.clip = null; BD.busy = true; renderBoard();
  const vid = files.find(f => /^video\//.test(f.type)), gif = files.length === 1 && await isAnimatedGif(files[0]) ? files[0] : null;
  try {
    if (gif) { sbMsg(tr('Preparando el detector (solo tarda la primera vez)…')); await poseDetector(); await readGif(gif, live); }
    else if (vid) { sbMsg(tr('Preparando el detector (solo tarda la primera vez)…')); await poseDetector(); await readVideo(vid, live); }
    else {
      BD.kind = 'board'; const pics = files.filter(f => /^image\//.test(f.type)).sort(natural);
      BD.name = pics.length === 1 ? pics[0].name.replace(/\.[^.]+$/, '') : tr('Storyboard');
      for (const f of pics) {  // a sheet gives its panels, any other picture is one panel
        const img = await imageOf(f), boxes = splitPanels(img);
        for (const b of boxes.length ? boxes : [null]) BD.items.push({cv: cropOf(img, b), status: 'wait', on: true});
      }
      renderBoard();
      sbMsg(tr('Preparando el detector (solo tarda la primera vez)…')); await poseDetector();
      for (const [i, it] of BD.items.entries()) {
        if (!live()) return;
        sbMsg(tr('Buscando la figura en la viñeta {i} de {n}…', {i: i + 1, n: BD.items.length})); sbProgress(i / BD.items.length);
        it.pose = await detectIn(it.cv); it.status = it.pose ? 'ok' : 'none'; it.on = !!it.pose;
        if (it.pose) it.res = rigPose(it.pose);
        renderCard(i);
      }
    }
  } catch (e) { console.warn('board', e); sbMsg(tr('El detector no ha podido funcionar aquí ({e}).', {e: e && e.message || e})); BD.busy = false; renderBoard(); return; }
  if (!live()) return;
  BD.busy = false; sbProgress(1); buildBoardClip(); renderBoard();
  if (BD.kind === 'video') { BD.trim[0].set(BD.from); BD.trim[1].set(BD.to); }  // now in seconds
}
// an animated GIF: its frames composed the way a browser plays them (WebCodecs where it exists, omggif elsewhere: iOS)
async function gifReader(buf) { if (typeof GifReader === 'undefined') await loadScript('vendor/omggif.js'); return new GifReader(buf); }
async function isAnimatedGif(file) { if (file.type !== 'image/gif' && !/\.gif$/i.test(file.name)) return false; try { return (await gifReader(new Uint8Array(await file.arrayBuffer()))).numFrames() > 1; } catch (_) { return false; } }
async function gifFrames(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  if ('ImageDecoder' in window) {
    try {
      const dec = new ImageDecoder({data: buf, type: 'image/gif'}); await dec.tracks.ready;
      const n = dec.tracks.selectedTrack.frameCount, out = [];
      for (let i = 0; i < n; i++) { const {image} = await dec.decode({frameIndex: i}); const c = document.createElement('canvas'); c.width = image.displayWidth; c.height = image.displayHeight; c.getContext('2d').drawImage(image, 0, 0); out.push({cv: c, delay: (image.duration || 1e5) / 1000}); image.close(); }
      dec.close(); return out;
    } catch (e) { console.warn('ImageDecoder', e); }
  }
  const r = await gifReader(buf), W = r.width, H = r.height, out = [], acc = document.createElement('canvas'); acc.width = W; acc.height = H;
  const ax = acc.getContext('2d'), fc = document.createElement('canvas'); fc.width = W; fc.height = H; const fx = fc.getContext('2d');
  for (let i = 0; i < r.numFrames(); i++) {
    const info = r.frameInfo(i), prev = info.disposal === 3 ? ax.getImageData(0, 0, W, H) : null;
    const px = new Uint8ClampedArray(W * H * 4); r.decodeAndBlitFrameRGBA(i, px); fx.putImageData(new ImageData(px, W, H), 0, 0); ax.drawImage(fc, 0, 0);
    const c = document.createElement('canvas'); c.width = W; c.height = H; c.getContext('2d').drawImage(acc, 0, 0); out.push({cv: c, delay: (info.delay || 10) * 10});
    if (info.disposal === 2) ax.clearRect(info.x, info.y, info.width, info.height); else if (prev) ax.putImageData(prev, 0, 0);
  }
  return out;
}
async function readGif(file, live) {
  BD.kind = 'video'; BD.name = file.name.replace(/\.[^.]+$/, '');
  const fr = await gifFrames(file), dur = f => Math.max(20, f.delay) / 1000, total = fr.reduce((a, f) => a + dur(f), 0);
  const fps = Math.min(24, ANIM.fps), n = Math.max(2, Math.min(Math.round(total * fps), 60 * fps)), every = Math.max(1, Math.round(n / 12));
  const at = t => { let acc = 0; for (const f of fr) { acc += dur(f); if (t < acc) return f; } return fr[fr.length - 1]; };  // the GIF's frame on screen at time t
  BD.frames = []; BD.fps = fps; BD.from = 0; BD.to = 1; const seen = new Map();
  for (let i = 0; i < n; i++) {
    if (!live()) return;
    const f = at(i / fps); if (!seen.has(f)) seen.set(f, await detectIn(cropOf(f.cv, null, 512), true));
    const pose = seen.get(f); BD.frames.push({pose});
    if (i % every === 0) { BD.items.push({cv: cropOf(f.cv, null, 512), pose, status: pose ? 'ok' : 'none', on: true, t: i / fps}); renderBoard(); }
    sbMsg(tr('Leyendo el GIF: fotograma {i} de {n}…', {i: i + 1, n})); sbProgress((i + 1) / n);
  }
  if (!BD.frames.some(f => f.pose)) throw new Error(tr('no se ve a ninguna persona en el GIF'));  // the pose gate: only people moving become animations
}
async function readVideo(file, live) {
  BD.kind = 'video'; BD.name = file.name.replace(/\.[^.]+$/, '');
  const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = URL.createObjectURL(file);
  await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error(tr('no se puede leer el vídeo'))); });
  if (!isFinite(v.duration)) { v.currentTime = 1e7; await new Promise(res => { v.ontimeupdate = () => { if (isFinite(v.duration)) { v.ontimeupdate = null; res(); } }; setTimeout(res, 3000); }); v.currentTime = 0; }  // recordings made in a browser carry no length
  const fps = Math.min(24, ANIM.fps), dur = Math.min(v.duration || 0, 60), n = Math.max(2, Math.floor(dur * fps) + 1);
  if (v.duration > 60) toast(tr('Solo se leen los primeros 60 segundos del vídeo.'));
  BD.frames = []; BD.fps = fps; BD.from = 0; BD.to = 1;
  const every = Math.max(1, Math.round(n / 12));
  for (let i = 0; i < n; i++) {
    if (!live()) return;
    v.currentTime = Math.min(i / fps, v.duration - .001); await new Promise(res => { v.onseeked = res; });
    const cv = cropOf(v, null, 512), pose = await detectIn(cv, true);
    BD.frames.push({pose});
    if (i % every === 0) { BD.items.push({cv, pose, status: pose ? 'ok' : 'none', on: true, t: i / fps}); renderBoard(); }
    sbMsg(tr('Leyendo el vídeo: fotograma {i} de {n}…', {i: i + 1, n})); sbProgress((i + 1) / n);
  }
}
function buildBoardClip() {
  if (BD.kind === 'video') {
    const n = BD.frames.length, a = Math.floor(BD.from * (n - 1)), b = Math.max(a + 1, Math.round(BD.to * (n - 1)));
    BD.clip = videoClip(BD.frames.slice(a, b + 1), BD.fps, {smooth: BD.smooth, root: BD.root});
  } else {
    const list = BD.items.filter(it => it.on && it.res).map(it => it.res);
    BD.clip = list.length ? keysClip(list, BD.gap) : null;
  }
  BD.t = 0;
}

/* ---------- the window ---------- */
const sbMsg = t => { $('#sbMsg').textContent = t; };
const sbProgress = v => { $('#sbBar').style.setProperty('--p', Math.round(v * 100) + '%'); };
function drawPoseOn(cv, pose) {
  const c = cv.getContext('2d'), P = {}; for (const k of pose.keypoints) P[k.name] = k;
  c.lineWidth = Math.max(2, cv.width / 90); c.lineCap = 'round';
  for (const [a, b] of BP_LINKS) { const A = P[a], B = P[b]; if (!A || !B || A.score < .3 || B.score < .3) continue; c.strokeStyle = a.startsWith('left') ? '#2b5a9e' : a.startsWith('right') ? '#b0432c' : '#e9a23b'; c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(B.x, B.y); c.stroke(); }
}
function renderCard(i) {
  const it = BD.items[i], el = $('#sbStrip').children[i]; if (!el) return;
  el.className = 'sbcard ' + it.status + (it.on ? ' on' : '');
  el.setAttribute('aria-pressed', String(!!it.on));
  if (it.pose && !it.drawn) { const c = el.querySelector('canvas'); drawPoseOn(c, it.pose); it.drawn = true; }
  el.querySelector('.sbst').textContent = it.status === 'wait' ? '…' : it.status === 'none' ? tr('Sin figura') : BD.kind === 'video' ? dec(it.t) + ' s' : it.on ? tr('Clave {n}', {n: BD.items.slice(0, i + 1).filter(x => x.on).length}) : tr('Fuera');
  if (!BD.busy && BD.kind !== 'video') renderBoardInfo();
}
function renderBoard() {
  const has = BD.items.length > 0 || BD.busy;
  $('#sbDrop').hidden = has; $('#sbWork').hidden = !has;
  const strip = $('#sbStrip'); strip.innerHTML = '';
  BD.items.forEach((it, i) => {
    const b = document.createElement('button'); b.type = 'button';
    const c = mkCanvas(it.cv.width, it.cv.height); c.getContext('2d').drawImage(it.cv, 0, 0); it.drawn = false;
    const n = document.createElement('span'); n.className = 'sbn'; n.textContent = i + 1;
    const st = document.createElement('span'); st.className = 'sbst';
    b.append(c, n, st);
    b.onclick = () => { if (BD.busy || BD.kind === 'video' || !it.res) return; it.on = !it.on; BD.items.forEach((_, j) => renderCard(j)); buildBoardClip(); renderBoardInfo(); };
    strip.appendChild(b); renderCard(i);
  });
  $('#sbBar').hidden = !BD.busy;
  const video = BD.kind === 'video';
  $('#sbGapBox').hidden = video; $('#sbVideoOpts').hidden = !video; $('#sbSave').hidden = !video;
  chips($('#sbWho'), chars.map((_, i) => [String(i), speaker(i)]), String(BD.who), v => { BD.who = +v; });
  renderBoardInfo();
  if (has) BD.stage.start();
}
function renderBoardInfo() {
  const ready = !BD.busy && BD.clip, n = BD.items.filter(it => it.on && it.res).length;
  $('#sbGo').disabled = !ready; $('#sbSave').disabled = !ready; $('#sbGo').classList.toggle('ready', !!ready);
  if (BD.busy) return;
  if (BD.kind === 'video') sbMsg(BD.clip ? tr('{n} fotogramas, {s} s de movimiento. Pulsa «Animar».', {n: BD.clip.frames.length, s: dec(BD.clip.len)}) : tr('No he encontrado a nadie en el vídeo. Prueba con uno en el que se vea a una persona entera.'));
  else sbMsg(n ? tr('{n} poses clave de {m} viñetas. Toca una viñeta para quitarla o volver a ponerla.', {n, m: BD.items.length}) : tr('No he encontrado figuras. Funciona mejor con personas enteras dibujadas con volumen (no con palitos) o con fotos.'));
}
function openBoard(files) {
  $('#sbModal').hidden = false; BD.who = Math.max(0, chars.indexOf(mq));
  if (!BD.stage) BD.stage = miniStage($('#sbView'), () => !$('#sbModal').hidden, (dt, fig) => {
    const c = BD.clip; if (!c) return null;
    BD.t = (BD.t || 0) + dt; if (BD.t > c.len + .8) BD.t = 0;
    return clipPose(fig, sampleClip(c, Math.min(BD.t, c.len)), new V3(0, 0, 0), 0, false, fig.rootY / clipRig().rootY);
  });
  if (files && files.length) readBoard(files); else { BD.items = []; BD.busy = false; BD.clip = null; renderBoard(); sbMsg(''); }
}
function closeBoard() { $('#sbModal').hidden = true; BD.token++; BD.busy = false; }
async function animateBoard() {
  if (!BD.clip) return;
  if (!ANIM.open) openTimeline(true);
  const ci = Math.min(BD.who, chars.length - 1), f0 = ANIM.f;
  let n;
  if (BD.kind === 'video') n = insertClip({...BD.clip, name: BD.name}, ci, f0, {inPlace: !BD.root});
  else n = insertKeyPoses(BD.items.filter(it => it.on && it.res).map(it => it.res), ci, f0, BD.gap);
  closeBoard();
  toast(BD.kind === 'video' ? tr('«{x}» convertido en {n} fotogramas de animación.', {x: BD.name, n}) : tr('{n} poses clave en la pista de {w}. Ajusta las que quieras.', {n, w: speaker(ci)}));
  ANIM.t = f0; setFrame(f0); play(true);  // and there it goes
}
function buildBoardUI() {
  const pick = () => $('#sbFile').click();
  $('#tlBoard').onclick = () => openBoard(); $('#photoBoard').onclick = () => openBoard();
  $('#sbPick').onclick = pick; $('#sbAgain').onclick = () => { BD.token++; BD.items = []; BD.busy = false; BD.clip = null; renderBoard(); sbMsg(''); pick(); };
  $('#sbFile').onchange = e => { const f = [...e.target.files]; e.target.value = ''; if (f.length) readBoard(f); };
  $('#sbClose').onclick = closeBoard;
  $('#sbModal').onclick = e => { if (e.target === e.currentTarget) closeBoard(); };
  $('#sbGo').onclick = animateBoard;
  $('#sbSave').onclick = async () => {
    if (!BD.clip) return; await loadClipLibrary();
    await saveMyClip({...BD.clip, id: 'v' + Date.now().toString(36), name: BD.name, cat: 'mias', src: 'user'});
    sbMsg(tr('Guardada en «Mis animaciones».'));
  };
  const drop = $('#sbModal'); drop.addEventListener('dragover', e => { e.preventDefault(); $('#sbDrop').classList.add('over'); });
  drop.addEventListener('dragleave', () => $('#sbDrop').classList.remove('over'));
  drop.addEventListener('drop', e => { const f = [...e.dataTransfer.files].filter(f => /^(image|video)\//.test(f.type)); $('#sbDrop').classList.remove('over'); if (f.length) { e.preventDefault(); e.stopPropagation(); readBoard(f); } });
  slider($('#sbGapBox'), {id: 'sbGap', label: 'Tiempo entre viñetas', min: .25, max: 4, step: .25, value: BD.gap, fmt: v => dec(v, 2) + ' s', input: v => { BD.gap = v; if (!BD.busy) buildBoardClip(); }});
  slider($('#sbSmoothBox'), {id: 'sbSmooth', label: 'Suavizado', min: 0, max: 5, step: .5, value: BD.smooth, fmt: v => v ? dec(v) : tr('No'), input: v => { BD.smooth = v; }, change: () => { if (!BD.busy) { buildBoardClip(); renderBoardInfo(); } }});
  const secs = v => BD.frames && BD.frames.length > 1 ? dec(v * (BD.frames.length - 1) / BD.fps) + ' s' : pctFmt(v);
  BD.trim = [slider($('#sbFromBox'), {id: 'sbFrom', label: 'Desde', min: 0, max: .95, step: .01, value: 0, fmt: secs, input: v => { BD.from = Math.min(v, BD.to - .05); }, change: () => { if (!BD.busy) { buildBoardClip(); renderBoardInfo(); } }}),
    slider($('#sbToBox'), {id: 'sbTo', label: 'Hasta', min: .05, max: 1, step: .01, value: 1, fmt: secs, input: v => { BD.to = Math.max(v, BD.from + .05); }, change: () => { if (!BD.busy) { buildBoardClip(); renderBoardInfo(); } }})];
  $('#sbRoot').onchange = e => { BD.root = e.target.checked; if (!BD.busy) buildBoardClip(); };
}
