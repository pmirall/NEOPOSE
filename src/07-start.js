const HINT = $('#hint').innerHTML;
// a scene carried over a language switch (see setLang)
function carried() { try { const s = sessionStorage.getItem('cdp.carry'); sessionStorage.removeItem('cdp.carry'); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
function start(data) {
  if (!(data && data.snap)) { const snap = carried(); if (snap) data = {...data, snap}; }
  $('#hint').textContent = tr('Cargando figura…');
  const load = f => fetch(f).then(r => { if (!r.ok) throw new Error(r.status); return r.text(); })
    .then(b64 => { const bin = atob(b64.trim()), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8.buffer; });
  // the extension (old age, facial expressions) is optional: without it the app still works
  const ext = load('figure-ext.txt').catch(e => { console.warn('figure-ext', e); return null; });
  load('figure.txt')
    .then(async buf => { parseFigure(buf); const e = await ext; if (e) try { parseFigureExt(e); } catch (err) { console.warn(err); } $('#hint').innerHTML = HINT; boot(data); })
    .catch(err => { console.error(err); $('#hint').textContent = tr('No se ha podido cargar la figura. Recarga la página.'); });
}
window.__cdp = {practice, poseFromImage, applyPhotoPose, ANIM, animBVH, exportGLB, exportBVH, panoReady: () => panoSphere.visible && !!panoSphere.material.map, sitOn, makeProp, enforcePins, LANG, I18N_EN, SETS, loadAsset, surfaces, A, loadHeadModel, HEAD_CATALOG, rebuildActive, applyExpression, garmentSpec, clothState, settleAll, setOutfitNow: setOutfit, frameNow: frame, sk, setSketch, redrawSketch, applyRandom, renderExport, ex, makeGhost, lookAtPoint, lookTarget, snapshot, sceneExtras, restore, props, extraLights, get mq() { return mq; }, camera, controls, POSES, GROUP_POSES, renderThumb, get thumbChars() { return thumbChars; }, get chars() { return chars; }, useGroup, usePreset, setEnv, applyAmbient, state, frameAll, setView, buildPoseGrid};
window.claude?.hot?.ready ? window.claude.hot.ready(start) : start(window.claude?.hot?.data ?? {});
