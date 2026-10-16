/* ---------- boot ---------- */
function boot(data) {
  addChar('hombre', null, false); mq = chars[0];
  mq.joints.hips.position.set(0, mq.rootY, 0); applyPreset(mq, POSE.contra); state.posePreset = 'contra';
  setEnv('estudio'); applyTheme();
  buildDrawUI(); buildBodyUI(); buildBodiesUI(); buildLimbsUI(); buildDynamicsUI(); buildCharactersUI(); buildHandUI(); buildLightUI(); buildSceneUI(); buildCamUI(); buildToolsUI(); buildClothesUI(); buildClothUI(); buildExprUI(); buildHeadUI(); buildHairUI(); buildPinUI(); buildBlendUI(); buildSceneExtrasUI(); buildExportUI(); buildLayersUI(); buildAnimUI(); buildAnimGalleryUI(); buildBoardUI(); buildPhotoUI(); buildQualityUI();
  setLightPreset('estudio');
  if (data && data.snap && data.snap.chars) { try { restore(data.snap); } catch (_) {} }
  setActive(Math.min(active, chars.length - 1));
  showTab(store.get('cdp.tab', 'pose'));
  initTour(); initAvatars();
  $$('#ikMode .chip').forEach(c => c.onclick = () => setIK(c.dataset.v === 'ik')); setIK(state.ik);
  $('#dotsChk').checked = state.dots; $('#dotsChk').onchange = e => { state.dots = e.target.checked; store.set('cdp.dots', state.dots); };
  initThumbs(); buildPoseGrid(); buildMyPoses(); buildUX(); buildWeb();
  resize(); setView(30, 8); frameAll();
  if (data && data.snap && data.snap.cam) applySceneExtras({cam: data.snap.cam});
  pushHistory();
  buildShareUI(); openSharedScene();
  window.claude?.hot?.snapshot?.(() => ({snap: snapshot()}));
}
