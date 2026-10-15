const HINT = $('#hint').innerHTML;
function start(data) {
  $('#hint').textContent = 'Cargando figura…';
  fetch('figure.txt').then(r => { if (!r.ok) throw new Error(r.status); return r.text(); })
    .then(b64 => { const bin = atob(b64.trim()), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8.buffer; })
    .then(buf => { parseFigure(buf); $('#hint').innerHTML = HINT; boot(data); })
    .catch(err => { console.error(err); $('#hint').textContent = 'No se ha podido cargar la figura. Recarga la página.'; });
}
window.__cdp = {SETS, loadAsset, surfaces, A, loadHeadModel, HEAD_CATALOG, rebuildActive, applyExpression, garmentSpec, clothState, settleAll, setOutfitNow: setOutfit, frameNow: frame, sk, setSketch, redrawSketch, applyRandom, renderExport, ex, makeGhost, lookAtPoint, lookTarget, snapshot, sceneExtras, restore, props, extraLights, get mq() { return mq; }, camera, controls, POSES, GROUP_POSES, renderThumb, get thumbChars() { return thumbChars; }, get chars() { return chars; }, useGroup, usePreset, setEnv, applyAmbient, state, frameAll, setView, buildPoseGrid};
window.claude?.hot?.ready ? window.claude.hot.ready(start) : start(window.claude?.hot?.data ?? {});
