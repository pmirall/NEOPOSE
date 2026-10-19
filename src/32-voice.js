/* ======================= voices: the lines of the script, spoken =======================
   eSpeak NG (GPL-3, compiled to WebAssembly, only the app's seven languages: about 2.4 MB, loaded the first time a
   line is spoken) says each line on this device, offline, the same on every platform: a browser, the desktop app, a
   phone. It gives the sound and where each word falls in it, so
   - a line lasts what it takes to say it (the film is cut to the voices),
   - the mouths move word by word with the sound,
   - the voices go into the exported video and can be saved as a WAV of the whole dialogue.
   Each character has a voice of their own from their body (a woman's or a man's, a child's or an older one's, an
   anthro's lower or higher one by the animal's size), which can be changed. The Web Speech API is not used: Android's WebView has none,
   Linux often has no voices, and its sound cannot be recorded. */
const VOICE = {mod: null, w: null, ctx: null, cache: new Map(), on: store.get('cdp.tts', true), src: [], started: new Set(), dest: null, failed: false};
const SR_TTS = 22050;
function espeak() {
  if (!VOICE.mod) VOICE.mod = (async () => {
    const M = (await import(new URL('vendor/espeak/espeak-ng.js', location.href).href)).default;
    const inst = typeof M === 'function' ? await M() : M; VOICE.w = new inst.eSpeakNGWorker(); return VOICE.w;
  })().catch(e => { console.warn('tts', e); VOICE.mod = null; VOICE.failed = true; throw e; });
  return VOICE.mod;
}
// an anthro's voice follows the animal's size: big chests sound lower (bears, lions, horses), small ones higher
const VOICE_SPECIES = {lobo: -6, perro: -4, zorro: 2, coyote: -3, hiena: -2, gato: 4, tigre: -10, leon: -14, leopardo: -5, oso: -16, mapache: 4, panda: 6, mofeta: 5, conejo: 10, ciervo: 0, cabra: 2, caballo: -10, dragon: -14};
// the voice of a character: from their body unless chosen (body.voice = {g: 'f'|'m', v: 1..5, p: pitch 0..99, r: words a minute})
const VOICE_LANGS = {es: 'es', en: 'en-gb', ca: 'ca', fr: 'fr', pt: 'pt', de: 'de', it: 'it'};
function voiceOf(m, i = 0) {
  const b = (m && m.body) || {}, own = b.voice || {}, woman = b.preset === 'mujer' || b.gender < .5 || (m && m.bodyPreset === 'mujer'), age = b.age || 30;
  const g = own.g || (woman ? 'f' : 'm'), base = g === 'f' ? 62 : 42;
  const p = own.p ?? clamp(base + (age < 15 ? 22 : age < 20 ? 8 : age > 60 ? -8 : 0) + (VOICE_SPECIES[b.species] || 0) + ((i % 3) - 1) * 5, 5, 95);
  return {g, v: own.v || 1 + (i % 4), p: Math.round(p), r: own.r || (age > 65 ? 150 : 168)};
}
const voiceKey = (text, lang, vo) => [text, lang, vo.g, vo.v, vo.p, vo.r].join('|');
// a line → its sound and its words: {pcm: Float32Array, dur: seconds, words: [[charStart, charEnd, t0]]}
async function sayLine(text, lang, vo) {
  const key = voiceKey(text, lang, vo); if (VOICE.cache.has(key)) return VOICE.cache.get(key);
  const w = await espeak(), chunks = [], words = []; let n = 0;
  w.set_voice(`${VOICE_LANGS[lang] || 'en-gb'}+${vo.g}${vo.v}`); w.set_rate(vo.r); w.set_pitch(vo.p);
  w.synthesize(text, (samples, events) => {
    if (samples && samples.length) { chunks.push(samples); n += samples.length; }
    for (const e of events) if (e.type === 'word') words.push([Math.max(0, e.text_position - 1), Math.max(0, e.text_position - 1 + e.word_length), e.audio_position / 1000]);
    return 0;
  });
  const pcm = new Float32Array(n); let o = 0; for (const c of chunks) { for (let i = 0; i < c.length; i++) pcm[o + i] = c[i] / 32768; o += c.length; }
  // the sound's own silence at the end does not count as part of the line
  let end = pcm.length; while (end > 0 && Math.abs(pcm[end - 1]) < .004) end--;
  const r = {pcm, dur: Math.max(.3, end / SR_TTS + .05), words}; VOICE.cache.set(key, r);
  if (VOICE.cache.size > 400) VOICE.cache.delete(VOICE.cache.keys().next().value);
  return r;
}
// how long a line takes: the voice when it can speak, syllables otherwise (Spanish about 6 a second, English 4.5)
function syllables(text, lang) {
  const w = scWords(text); let n = 0;
  for (const x of w) { const g = x.match(/[aeiouyáéíóúü]+/g) || []; let s = g.length; if (lang === 'en' && /[^aeiou]e$/.test(x) && s > 1) s--; n += Math.max(1, s); }
  return n;
}
function estimateLen(text, lang) {
  const rate = lang === 'en' ? 4.5 : lang === 'de' ? 5 : 6, pause = (text.match(/[,;:]/g) || []).length * .3 + (text.match(/[.!?](?!$)/g) || []).length * .6 + (text.match(/…/g) || []).length * .9;
  return Math.max(.8, syllables(text, lang) / rate + pause + .15);
}
async function lineTiming(text, lang, vo) {
  if (VOICE.failed) return {dur: estimateLen(text, lang), words: null};
  try { const r = await sayLine(text, lang, vo); return {dur: r.dur, words: r.words}; } catch (_) { return {dur: estimateLen(text, lang), words: null}; }
}
// words as fractions of the line (what mouthAt uses): [[a, b, u0, u1]]
function lineWords(words, text, dur) {
  if (!words || !words.length) return null;
  return words.map((w, i) => { const nx = words[i + 1]; return [w[0], nx ? nx[0] : text.length, w[2] / dur, Math.min(1, (nx ? nx[2] : dur) / dur)]; });
}

/* ---------- playing the lines with the film ---------- */
function voiceCtx() { if (!VOICE.ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; VOICE.ctx = new C(); } if (VOICE.ctx.state === 'suspended') VOICE.ctx.resume().catch(() => {}); return VOICE.ctx; }
function voiceStop() { for (const s of VOICE.src) { try { s.stop(); } catch (_) {} } VOICE.src = []; VOICE.started.clear(); }
// called every frame while the film plays: a line that has begun and is not sounding yet starts where it should be
function voiceTick(f) {
  if (!VOICE.on || !ANIM.playing) return;
  const s = shot(); if (!s) return;
  s.lines.forEach((l, j) => {
    const k = s.id + ':' + j; if (VOICE.started.has(k) || !l.text.trim() || f < l.f || f >= l.f + l.len) return;
    VOICE.started.add(k);
    if (l.cont && VOICE.src.length) return;  // the second half of a line cut by a reaction shot: it is still sounding from the shot before
    const m = chars[l.c], vo = l.voice || voiceOf(m, l.c), lang = l.lang || (LANG.slice(0, 2) in VOICE_LANGS ? LANG.slice(0, 2) : 'en'), off = (f - l.f) / ANIM.fps;
    sayLine(l.text, lang, vo).then(r => {
      if (!ANIM.playing || !VOICE.started.has(k)) return;
      const ctx = voiceCtx(); if (!ctx) return;
      const buf = ctx.createBuffer(1, r.pcm.length, SR_TTS); buf.copyToChannel(r.pcm, 0);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const late = Math.max(0, (ANIM.t - l.f) / ANIM.fps - off);  // the time it took to make the sound
      src.connect(ctx.destination); if (VOICE.dest) src.connect(VOICE.dest);
      src.start(0, Math.min(off + late, r.dur)); VOICE.src.push(src); src.onended = () => { VOICE.src = VOICE.src.filter(x => x !== src); };
    }).catch(() => {});
  });
}
// the exported video takes the voices too
function voiceStream() { const ctx = voiceCtx(); if (!ctx || !ctx.createMediaStreamDestination) return null; VOICE.dest = ctx.createMediaStreamDestination(); return VOICE.dest.stream; }
function voiceStreamEnd() { VOICE.dest = null; }

/* ---------- the whole dialogue as a WAV ---------- */
// the voices of these shots, one after the other, mixed into one track at SR_TTS (pad: seconds of silence at the end)
async function dialoguePcm(shots = ANIM.shots, pad = .5, onLine) {
  let t0 = 0; const parts = [];
  for (const s of shots) {
    for (const l of s.lines) if (l.text.trim()) { const m = chars[l.c]; parts.push({t: t0 + l.f / ANIM.fps, l, vo: l.voice || voiceOf(m, l.c), lang: l.lang || LANG.slice(0, 2)}); }
    t0 += s.len / ANIM.fps;
  }
  const out = new Float32Array(Math.ceil((t0 + pad) * SR_TTS));
  for (const [n, p] of parts.entries()) {
    const r = await sayLine(p.l.text, p.lang, p.vo), a = Math.max(0, Math.round(p.t * SR_TTS)), from = p.l.f < 0 ? Math.round(-p.l.f / ANIM.fps * SR_TTS) : 0;
    for (let i = from; i < r.pcm.length && a + i - from < out.length; i++) out[a + i - from] += r.pcm[i];
    if (onLine) onLine(n + 1, parts.length);
  }
  return out;
}
async function dialogueWav() {
  if (ANIM.open) storeShot();
  const out = await dialoguePcm();
  // 16-bit PCM WAV
  const n = out.length, buf = new ArrayBuffer(44 + n * 2), d = new DataView(buf), str = (o, s) => { for (let i = 0; i < s.length; i++) d.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); d.setUint32(4, 36 + n * 2, true); str(8, 'WAVEfmt '); d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 1, true);
  d.setUint32(24, SR_TTS, true); d.setUint32(28, SR_TTS * 2, true); d.setUint16(32, 2, true); d.setUint16(34, 16, true); str(36, 'data'); d.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) d.setInt16(44 + i * 2, clamp(out[i], -1, 1) * 32767, true);
  return new Uint8Array(buf);
}
async function previewVoice(m, i, text) {
  const vo = voiceOf(m, i), r = await sayLine(text || tr('Hola, así suena mi voz.'), LANG.slice(0, 2) in VOICE_LANGS ? LANG.slice(0, 2) : 'en', vo), ctx = voiceCtx(); if (!ctx) return;
  const buf = ctx.createBuffer(1, r.pcm.length, SR_TTS); buf.copyToChannel(r.pcm, 0); const s = ctx.createBufferSource(); s.buffer = buf; s.connect(ctx.destination); s.start();
}
