/* ---------- boot ---------- */
function boot(data, saved) {
  addChar('hombre', null, false); mq = chars[0];
  mq.joints.hips.position.set(0, mq.rootY, 0); applyPreset(mq, POSE.contra); state.posePreset = 'contra';
  setEnv('estudio'); applyTheme();
  buildDrawUI(); buildBodyUI(); buildBodiesUI(); buildLimbsUI(); buildDynamicsUI(); buildCharactersUI(); buildHandUI(); buildLightUI(); buildSceneUI(); buildCamUI(); buildToolsUI(); buildClothesUI(); buildClothUI(); buildExprUI(); buildHeadUI(); buildCoatUI(); buildHairUI(); buildPinUI(); buildBlendUI(); buildSceneExtrasUI(); buildExportUI(); buildLayersUI(); buildAnimUI(); buildAnimGalleryUI(); buildBoardUI(); buildPhotoUI(); buildQualityUI();
  setLightPreset('estudio');
  const snap = data && data.snap && data.snap.chars && data.snap.chars.length ? data.snap : saved && saved.chars && saved.chars.length ? saved : null;
  if (snap) { AUTO.base = histStr(); AUTO.fresh = {...snapshot(), ...sceneExtras(true)}; try { restore(snap); } catch (e) { console.warn('restore', e); } }
  setActive(Math.min(active, chars.length - 1));
  showTab(store.get('cdp.tab', 'pose'));
  initTour(); initAvatars();
  $$('#ikMode .chip').forEach(c => c.onclick = () => setIK(c.dataset.v === 'ik')); setIK(state.ik);
  $('#dotsChk').checked = state.dots; $('#dotsChk').onchange = e => { state.dots = e.target.checked; store.set('cdp.dots', state.dots); };
  initThumbs(); buildPoseGrid(); buildMyPoses(); buildUX(); buildWeb(); buildRefsUI(); buildScriptUI(); buildPaper();
  resize(); setView(30, 8); frameAll();
  if (snap && snap.cam) applySceneExtras({cam: snap.cam});
  pushHistory(); initAutosave(!!snap, !!snap && snap === saved);
  buildShareUI(); openSharedScene();
  window.claude?.hot?.snapshot?.(() => ({snap: snapshot()}));
}
