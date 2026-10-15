/* ---------- overlay guides ---------- */
const _p = new V3();
function toScreen(v, w, h) { _p.copy(v).project(camera); return {x: (_p.x + 1) / 2 * w, y: (1 - _p.y) / 2 * h, z: _p.z}; }
function drawOverlay(ctx, w, h) {
  if (!ctx.noFrame) ctx.clearRect(0, 0, w, h);
  const g = state.guides; ctx.lineCap = 'round';
  if (g.thirds) {
    ctx.strokeStyle = themeInk.soft; ctx.globalAlpha = .55; ctx.lineWidth = 1; ctx.setLineDash([6, 5]); ctx.beginPath();
    for (const f of [1 / 3, 2 / 3]) { ctx.moveTo(w * f, 0); ctx.lineTo(w * f, h); ctx.moveTo(0, h * f); ctx.lineTo(w, h * f); }
    ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  if (g.persp) drawPerspective(ctx, w, h);
  if (g.ruler) drawRuler(ctx, w, h);
  if (g.action) drawAction(ctx, w, h);
  if (!ctx.noFrame) drawFrame(ctx, w, h);
}
function drawPerspective(ctx, w, h) {
  const cp = camera.position, fwd = camera.getWorldDirection(new V3());
  const proj = d => toScreen(cp.clone().addScaledVector(d, 1e4), w, h);
  const fh = new V3(fwd.x, 0, fwd.z);
  ctx.font = `13px ${css('--f-hand')}`;
  if (fh.lengthSq() > 1e-4) {
    fh.normalize(); const right = new V3(-fh.z, 0, fh.x);
    const a = proj(fh.clone().addScaledVector(right, .4).normalize()), b = proj(fh.clone().addScaledVector(right, -.4).normalize());
    const dx = b.x - a.x, dy = b.y - a.y;
    if (Math.abs(dx) > 1e-3) {
      const k = dy / dx, y0 = a.y - k * a.x, y1 = y0 + k * w;
      ctx.strokeStyle = themeInk.ink; ctx.globalAlpha = .7; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(w, y1); ctx.stroke();
      if (y0 > 14 && y0 < h - 6) { ctx.fillStyle = themeInk.ink; ctx.fillText(tr('horizonte'), 10, y0 - 6); }
      ctx.globalAlpha = 1;
    }
  }
  const yaw = mq.yaw(), R = Math.max(w, h);
  const axes = [[new V3(Math.cos(yaw), 0, -Math.sin(yaw)), themeInk.red], [new V3(Math.sin(yaw), 0, Math.cos(yaw)), themeInk.blue], [new V3(0, 1, 0), themeInk.soft]];
  for (let [d, color] of axes) {
    const dot = d.dot(fwd); if (Math.abs(dot) < .03) continue;
    if (dot < 0) d = d.clone().negate();
    const vpnt = proj(d), cx = w / 2 - vpnt.x, cy = h / 2 - vpnt.y, dist = Math.hypot(cx, cy);
    if (dist > R * 7) continue;
    const ux = cx / dist, uy = cy / dist, px = -uy, py = ux;
    ctx.strokeStyle = color; ctx.globalAlpha = .38; ctx.lineWidth = 1; ctx.beginPath();
    for (let i = -9; i <= 9; i++) {
      const tx = w / 2 + px * i * R / 12, ty = h / 2 + py * i * R / 12, ex = tx - vpnt.x, ey = ty - vpnt.y, el = Math.hypot(ex, ey) || 1;
      ctx.moveTo(vpnt.x, vpnt.y); ctx.lineTo(vpnt.x + ex / el * (dist + R * 2), vpnt.y + ey / el * (dist + R * 2));
    }
    ctx.stroke(); ctx.globalAlpha = 1;
    if (vpnt.x > -10 && vpnt.x < w + 10 && vpnt.y > -10 && vpnt.y < h + 10) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(vpnt.x, vpnt.y, 4, 0, Math.PI * 2); ctx.fill(); }
  }
}
let _box = new THREE.Box3(), _boxT = 0;
function drawRuler(ctx, w, h) {
  const now = performance.now();
  if (now - _boxT > 150) { _box = mq.box(8); _boxT = now; }
  const hh = mq.headH, c = _box.getCenter(new V3());
  let minX = Infinity, maxX = -Infinity;
  for (const x of [_box.min.x, _box.max.x]) for (const y of [_box.min.y, _box.max.y]) for (const z of [_box.min.z, _box.max.z]) { const s = toScreen(new V3(x, y, z), w, h); minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); }
  const rx = Math.max(28, minX - 22);
  ctx.strokeStyle = themeInk.blue; ctx.fillStyle = themeInk.blue; ctx.lineWidth = 1.2; ctx.font = `600 11px ${css('--f-mono')}`; ctx.textAlign = 'right';
  const n = Math.ceil((_box.max.y - _box.min.y) / hh + .01);
  const top = toScreen(new V3(c.x, _box.min.y + n * hh, c.z), w, h), bot = toScreen(new V3(c.x, _box.min.y, c.z), w, h);
  ctx.beginPath(); ctx.moveTo(rx, bot.y); ctx.lineTo(rx, top.y); ctx.stroke();
  for (let i = 0; i <= n; i++) {
    const s = toScreen(new V3(c.x, _box.min.y + i * hh, c.z), w, h);
    ctx.globalAlpha = 1; ctx.beginPath(); ctx.moveTo(rx - 5, s.y); ctx.lineTo(rx + 5, s.y); ctx.stroke();
    ctx.globalAlpha = .28; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(rx + 6, s.y); ctx.lineTo(maxX + 10, s.y); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    if (i < n) { const s2 = toScreen(new V3(c.x, _box.min.y + (i + .5) * hh, c.z), w, h); ctx.fillText(String(n - i), rx - 8, s2.y + 4); }
  }
  ctx.textAlign = 'left'; ctx.globalAlpha = 1;
}
