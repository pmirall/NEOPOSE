/* ======================= video: rendered frame by frame, as an editor renders it =======================
   Filming the screen while the film plays drops frames whenever the machine is busy, needs the window left alone and
   records whatever is drawn on it. Instead every frame is rendered on its own at the export size, 30 a second, with
   the poses in between the film's frames, and given to the browser's video encoder (WebCodecs); the dialogue is
   synthesised, mixed and encoded too, and both go into an MP4 written here (H.264, or VP9 where there is no H.264;
   AAC, or Opus where there is no AAC). While it renders a window over the app shows the frame being made, how far it
   has got and the time left, and can cancel; nothing else can be touched. Without WebCodecs it is recorded while it
   plays, as before, behind the same window. */
const VID = {fps: 30, cancel: false, busy: false};

/* ---------- MP4 (ISO BMFF): one video track, maybe one audio track, every sample its own chunk, moov first ---------- */
const MP4 = (() => {
  const u32 = n => [n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255, n & 255], u16 = n => [n >> 8 & 255, n & 255], str = s => [...s].map(c => c.charCodeAt(0)), z = n => new Array(n).fill(0);
  function box(type, ...parts) {
    const len = 8 + parts.reduce((a, p) => a + p.length, 0), out = new Uint8Array(len); out.set([...u32(len), ...str(type)]);
    let o = 8; for (const p of parts) { out.set(p, o); o += p.length; } return out;
  }
  const full = (type, v, flags, ...parts) => box(type, [v, flags >> 16 & 255, flags >> 8 & 255, flags & 255], ...parts);
  const MATRIX = [0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000].flatMap(u32);
  const desc = (tag, bytes) => [tag, 0x80, 0x80, 0x80, bytes.length, ...bytes];  // an MPEG-4 descriptor, size in 4 bytes
  // sample entries
  function visual(type, w, h, ...inner) { return box(type, z(6), u16(1), z(16), u16(w), u16(h), u32(0x480000), u32(0x480000), u32(0), u16(1), z(32), u16(0x18), u16(0xffff), ...inner); }
  function audio(type, ch, sr, ...inner) { return box(type, z(6), u16(1), z(8), u16(ch), u16(16), z(4), u32(sr * 65536), ...inner); }
  function entry(t) {
    if (t.codec.startsWith('avc1')) return visual('avc1', t.w, t.h, box('avcC', t.desc));
    if (t.codec.startsWith('vp09')) {  // vp09.PP.LL.DD: profile, level, bit depth; 4:2:0, BT.709, limited range
      const [, p, l, d] = t.codec.split('.').map(Number);
      return visual('vp09', t.w, t.h, full('vpcC', 1, 0, [p, l, (d << 4) | (1 << 1), 1, 1, 1, 0, 0]));
    }
    if (t.codec.startsWith('mp4a')) {
      const dsi = [...t.desc], dcd = [0x40, 0x15, 0, 0, 0, ...u32(t.bitrate), ...u32(t.bitrate), ...desc(5, dsi)];
      return audio('mp4a', t.ch, t.sr, full('esds', 0, 0, desc(3, [0, 1, 0, ...desc(4, dcd), ...desc(6, [2])])));
    }
    return audio('Opus', t.ch, 48000, box('dOps', [0, t.ch, ...u16(t.preskip), ...u32(48000), 0, 0, 0]));
  }
  const runs = list => { const r = []; for (const v of list) { const l = r[r.length - 1]; if (l && l[1] === v) l[0]++; else r.push([1, v]); } return r; };
  function trak(t, id, movieDur, offsets) {
    const S = t.samples, dur = S.reduce((a, s) => a + s.dur, 0), vid = t.kind === 'video';
    const stts = runs(S.map(s => s.dur)), cts = S.some(s => s.cts), ctts = cts ? runs(S.map(s => s.cts | 0)) : null, keys = S.every(s => s.key) ? null : S.map((s, i) => s.key ? i + 1 : 0).filter(Boolean);
    const stbl = box('stbl', full('stsd', 0, 0, u32(1), entry(t)),
      full('stts', 0, 0, u32(stts.length), ...stts.map(([n, d]) => [...u32(n), ...u32(d)])),
      ...(ctts ? [full('ctts', 1, 0, u32(ctts.length), ...ctts.map(([n, d]) => [...u32(n), ...u32(d)]))] : []),
      ...(keys ? [full('stss', 0, 0, u32(keys.length), ...keys.map(u32))] : []),
      full('stsc', 0, 0, u32(1), u32(1), u32(1), u32(1)),
      full('stsz', 0, 0, u32(0), u32(S.length), ...S.map(s => u32(s.data.length))),
      full('stco', 0, 0, u32(S.length), ...offsets.map(u32)));
    const minf = box('minf', vid ? full('vmhd', 0, 1, z(8)) : full('smhd', 0, 0, z(4)), box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1))), stbl);
    const mdia = box('mdia', full('mdhd', 0, 0, u32(0), u32(0), u32(t.timescale), u32(dur), u16(0x55c4), u16(0)),
      full('hdlr', 0, 0, u32(0), str(vid ? 'vide' : 'soun'), z(12), str(vid ? 'NEOPOSE video' : 'NEOPOSE voices'), [0]), minf);
    const edts = t.skip ? [box('edts', full('elst', 0, 0, u32(1), u32(movieDur), u32(t.skip), u32(0x10000)))] : [];
    return box('trak', full('tkhd', 0, 3, u32(0), u32(0), u32(id), u32(0), u32(movieDur), z(8), u16(0), u16(0), u16(vid ? 0 : 0x100), u16(0), MATRIX, u32((t.w || 0) * 65536), u32((t.h || 0) * 65536)), ...edts, mdia);
  }
  // tracks: [{kind, codec, timescale, w, h | ch, sr, desc, samples: [{data, dur, cts, key}]}]
  return function mux(tracks) {
    const ftyp = box('ftyp', str('isom'), u32(0x200), str('isomiso2avc1mp41'));
    const secs = t => t.samples.reduce((a, s) => a + s.dur, 0) / t.timescale, movieDur = Math.round(Math.max(...tracks.map(secs)) * 1000);
    // samples in time order, interleaved, so a player streaming it finds sound and picture together
    const order = []; for (const [k, t] of tracks.entries()) { let at = 0; for (const s of t.samples) { order.push({k, s, at: at / t.timescale}); at += s.dur; } }
    order.sort((a, b) => a.at - b.at || a.k - b.k);
    const moovOf = offs => box('moov', full('mvhd', 0, 0, u32(0), u32(0), u32(1000), u32(movieDur), u32(0x10000), u16(0x100), z(10), MATRIX, z(24), u32(tracks.length + 1)),
      ...tracks.map((t, k) => trak(t, k + 1, movieDur, offs[k])));
    const zero = tracks.map(t => t.samples.map(() => 0)), head = ftyp.length + moovOf(zero).length + 8, offs = tracks.map(() => []);
    let o = head; for (const {k, s} of order) { offs[k].push(o); o += s.data.length; }
    const moov = moovOf(offs), size = o - head + 8, out = new Uint8Array(o);
    out.set(ftyp, 0); out.set(moov, ftyp.length); out.set([...u32(size), ...str('mdat')], ftyp.length + moov.length);
    o = head; for (const {s} of order) { out.set(s.data, o); o += s.data.length; }
    return out;
  };
})();

/* ---------- encoders ---------- */
const bytesOf = d => ArrayBuffer.isView(d) ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength).slice() : new Uint8Array(d).slice();
async function pickVideoCodec(w, h) {
  if (!window.VideoEncoder) return null;
  const mbs = Math.ceil(w / 16) * Math.ceil(h / 16), lv = mbs <= 3600 ? '1f' : mbs <= 8192 ? '28' : '33', bitrate = Math.round(w * h * VID.fps * .16);
  for (const codec of [`avc1.6400${lv}`, `avc1.4d00${lv}`, `avc1.4200${lv}`, `vp09.00.${mbs <= 3600 ? 31 : mbs <= 8192 ? 40 : 50}.08`]) {
    const cfg = {codec, width: w, height: h, bitrate, framerate: VID.fps, ...(codec.startsWith('avc1') ? {avc: {format: 'avc'}} : {})};
    try { if ((await VideoEncoder.isConfigSupported(cfg)).supported) return cfg; } catch (_) {}
  }
  return null;
}
async function pickAudioCodec() {
  if (!window.AudioEncoder) return null;
  for (const codec of ['mp4a.40.2', 'opus']) {
    const cfg = {codec, sampleRate: 48000, numberOfChannels: 1, bitrate: 128000};
    try { if ((await AudioEncoder.isConfigSupported(cfg)).supported) return cfg; } catch (_) {}
  }
  return null;
}
// the dialogue (mono, SR_TTS) at 48 kHz, encoded: samples in the track's own time (48000 a second)
async function encodeVoices(pcm, cfg, secs) {
  const n = Math.round(secs * 48000), up = new Float32Array(n), k = SR_TTS / 48000;
  for (let i = 0; i < n; i++) { const x = i * k, j = Math.floor(x), a = pcm[j] || 0, b = pcm[j + 1] || 0; up[i] = a + (b - a) * (x - j); }
  const samples = []; let desc = null, err = null;
  const enc = new AudioEncoder({output: (c, meta) => { const d = new Uint8Array(c.byteLength); c.copyTo(d); if (meta && meta.decoderConfig && meta.decoderConfig.description) desc = bytesOf(meta.decoderConfig.description);
    samples.push({data: d, dur: c.duration ? Math.round(c.duration * 48e-3) : cfg.codec === 'opus' ? 960 : 1024, key: true}); }, error: e => { err = e; }});
  enc.configure(cfg);
  for (let i = 0; i < n; i += 4800) {
    const m = Math.min(4800, n - i);
    enc.encode(new AudioData({format: 'f32-planar', sampleRate: 48000, numberOfFrames: m, numberOfChannels: 1, timestamp: Math.round(i / 48000 * 1e6), data: up.subarray(i, i + m)}));
  }
  await enc.flush(); enc.close(); if (err) throw err;
  const aac = cfg.codec.startsWith('mp4a');
  // Opus says in its header how many samples to skip at the start; AAC's priming is left as it is (a few ms)
  const preskip = !aac && desc && desc.length >= 12 && String.fromCharCode(...desc.subarray(0, 8)) === 'OpusHead' ? desc[10] | desc[11] << 8 : 312;
  if (aac && !desc) desc = new Uint8Array([0x11, 0x88]);  // AAC-LC, 48 kHz, mono
  return {kind: 'audio', codec: aac ? 'mp4a.40.2' : 'opus', timescale: 48000, ch: 1, sr: 48000, bitrate: cfg.bitrate, desc, preskip, skip: aac ? 0 : preskip, samples};
}

/* ---------- the window over the app ---------- */
function renderWindow(on, title) {
  const m = $('#renderModal'); if (!m) return;
  if (on) { $('#rnT').textContent = title; $('#rnMsg').textContent = ''; $('#rnProg i').style.width = '0%'; $('#rnCancel').disabled = false; VID.cancel = false;
    const p = $('#rnPrev'), c = p.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, p.width, p.height); }
  for (const id of ['#timeline', '#tlOpts']) { const el = $(id); if (el && on) el.inert = true; else if (el) el.inert = false; }
  m.hidden = !on;
}
function renderProgress(p, msg, cv) {
  $('#rnProg i').style.width = Math.round(clamp(p, 0, 1) * 100) + '%'; if (msg != null) $('#rnMsg').textContent = msg;
  if (cv) { const pv = $('#rnPrev'), k = Math.min(pv.width / cv.width, pv.height / cv.height), w = cv.width * k, h = cv.height * k, c = pv.getContext('2d');
    c.fillStyle = '#000'; c.fillRect(0, 0, pv.width, pv.height); c.drawImage(cv, (pv.width - w) / 2, (pv.height - h) / 2, w, h); }
}
const mmss = s => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/* ---------- the render ---------- */
async function exportVideo(range) {
  if (VID.busy) return; storeShot();
  const shots = range === 'movie' ? ANIM.shots.map((_, i) => i) : [ANIM.cur];
  // the part of the view the film shows (its frame, or 16:9 when the frame is free), at 720 or 1080 lines
  noDockView();
  let f = frameRect(W, Hh); if (!RATIOS[state.ratio || 'libre'][1]) { const r = 16 / 9, fw = W / Hh > r ? Hh * r : W, fh = fw / r; f = {x: (W - fw) / 2, y: (Hh - fh) / 2, w: fw, h: fh}; }
  const lines = +EXK.vres || 1080, H = Math.min(lines, Math.round(4096 * f.h / f.w / 2) * 2), Wv = Math.round(H * f.w / f.h / 2) * 2, k = H / f.h;
  const vcfg = await pickVideoCodec(Wv, H);
  if (!vcfg) return recordVideo(range, () => {});
  VID.busy = true; renderWindow(true, tr('Exportando el vídeo'));
  const list = shots.map(i => ANIM.shots[i]), counts = list.map(s => Math.max(1, Math.round(s.len / ANIM.fps * VID.fps))), total = counts.reduce((a, b) => a + b, 0), secs = total / VID.fps;
  const back = {cur: ANIM.cur, f: ANIM.f}, pr = renderer.getPixelRatio(), lw = LU.uLineW.value, dpr = LU.uDpr.value;
  let hide = null, err = null, enc = null, ok = false;
  const samples = []; let vdesc = null, firstTs = null;
  try {
    // the voices first (they take a moment to synthesise): the picture is cut to them anyway
    let voices = null;
    const talk = VOICE.on && !VOICE.failed && list.some(s => s.lines.some(l => l.text.trim())), acfg = talk ? await pickAudioCodec() : null;
    if (acfg) {
      renderProgress(0, tr('Preparando las voces…'));
      try { voices = await encodeVoices(await dialoguePcm(list, 0, (n, t) => renderProgress(0, tr('Preparando las voces… {n} de {t}', {n, t}))), acfg, secs); }
      catch (e) { console.warn('voices', e); voices = null; }
    }
    if (VID.cancel) return;
    enc = new VideoEncoder({output: (c, meta) => {
      if (meta && meta.decoderConfig && meta.decoderConfig.description) vdesc = bytesOf(meta.decoderConfig.description);
      const d = new Uint8Array(c.byteLength); c.copyTo(d); samples.push({data: d, ts: c.timestamp, key: c.type === 'key'});
    }, error: e => { err = e; }});
    enc.configure(vcfg);
    // the frame loop stops; the film is driven from here, one frame after another
    renderer.setAnimationLoop(null); ANIM.rec = {pause() {}, resume() {}, done() {}}; hide = filmHide(); ANIM.playing = true;
    const cv = document.createElement('canvas'); cv.width = Wv; cv.height = H; const cx = cv.getContext('2d');
    LU.uLineW.value = lw * k / pr; LU.uDpr.value = k; renderer.setPixelRatio(k); renderer.setSize(W, Hh, false);
    const t0 = performance.now(); let n = 0;
    for (const [si, i] of shots.entries()) {
      VOICE.started.clear(); await enterShot(i, 0); noDockView();
      const s = shot();
      for (let j = 0; j < counts[si]; j++) {
        if (VID.cancel || err) break;
        const t = Math.min(j * ANIM.fps / VID.fps, s.len - 1);
        ANIM.t = t; ANIM.f = Math.floor(t); applyFrame(t); controls.update(); if (state.roll) camera.rotateZ(-state.roll * DEG); sceneTicks();
        renderer.render(scene, camera);
        cx.drawImage(renderer.domElement, f.x * k, f.y * k, f.w * k, f.h * k, 0, 0, Wv, H);
        if (EXK.subs) burnSubs(cv, Math.floor(t));
        const vf = new VideoFrame(cv, {timestamp: Math.round(n * 1e6 / VID.fps), duration: Math.round(1e6 / VID.fps)});
        enc.encode(vf, {keyFrame: j === 0 || n % (VID.fps * 2) === 0}); vf.close(); n++;
        while (enc.encodeQueueSize > 4) await new Promise(r => setTimeout(r, 2));
        if (n % 3 === 0 || n === total) {
          const el = (performance.now() - t0) / 1000, left = el / n * (total - n);
          renderProgress(n / total, tr('Fotograma {n} de {t} · plano {s} de {S} · quedan {e}', {n, t: total, s: si + 1, S: shots.length, e: mmss(left)}), cv);
          await new Promise(r => setTimeout(r, 0));
        }
      }
      if (VID.cancel || err) break;
    }
    if (VID.cancel) return;
    renderProgress(1, tr('Terminando el archivo…'));
    await enc.flush(); if (err) throw err;
    // decode order is the order they came out in; where it differs from the order they are shown, a ctts says so
    const dt = Math.round(90000 / VID.fps); firstTs = samples.length ? Math.min(...samples.map(s => s.ts)) : 0;
    const vs = samples.map((s, i) => ({data: s.data, dur: dt, key: s.key, cts: Math.round((s.ts - firstTs) * .09) - i * dt}));
    const shift = Math.max(0, ...vs.map(s => -s.cts)); if (shift) vs.forEach(s => s.cts += shift);
    const vtrack = {kind: 'video', codec: vcfg.codec, timescale: 90000, w: Wv, h: H, desc: vdesc, samples: vs, skip: shift};
    if (vcfg.codec.startsWith('avc1') && !vdesc) throw new Error('H.264 sin descripción');
    const bytes = MP4([vtrack, ...(voices ? [voices] : [])]);
    saveFile(`animacion-${stamp()}.mp4`, bytes, 'video/mp4'); ok = true;
    toast(tr('Vídeo exportado: {w} × {h}, {s} s.', {w: Wv, h: H, s: dec(secs)}));
  } catch (e) { console.warn('video', e); toast(tr('No se ha podido exportar: {e}', {e: e && e.message || e})); }
  finally {
    if (enc && enc.state !== 'closed') try { enc.close(); } catch (_) {}
    renderer.setPixelRatio(pr); renderer.setSize(W, Hh, false); LU.uLineW.value = lw; LU.uDpr.value = dpr;
    if (hide) hide(); ANIM.rec = null;
    // back where it was, as after playing through cuts
    try { if (ANIM.cur !== back.cur) await enterShot(back.cur, back.f); } catch (_) {}
    ANIM.playing = false; ANIM.playedInto = true; settleAfterPlay(); setFrame(back.f);
    renderer.setAnimationLoop(frame);
    VID.busy = false; renderWindow(false);
    if (!ok && VID.cancel) toast(tr('Exportación cancelada.'));
  }
}
function initVideoWindow() {
  const b = $('#rnCancel'); if (!b) return;
  b.onclick = () => { if (VID.busy) { VID.cancel = true; b.disabled = true; $('#rnMsg').textContent = tr('Cancelando…'); } else if (ANIM.rec && ANIM.rec.cancel) ANIM.rec.cancel(); };
}
