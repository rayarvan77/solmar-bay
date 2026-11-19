// HUD for Solmar Bay: health, cash, wanted stars, speed, mission objective,
// message toasts, and the 2D top-down minimap.
export function initHud() {
  const el = (id) => document.getElementById(id);
  const hud = {
    healthFill: el('health-fill'),
    healthText: el('health-text'),
    money: el('money'),
    stars: el('stars'),
    speed: el('speed'),
    objective: el('objective'),
    toast: el('toast'),
    minimap: el('minimap'),
    busted: el('busted'),
    bustedText: el('busted-text'),
  };
  let toastTimer = 0;
  hud.showToast = function (text, ms = 3200) {
    if (!hud.toast) return;
    hud.toast.textContent = text;
    hud.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => hud.toast.classList.remove('show'), ms);
  };
  hud.showBusted = function (text) {
    if (!hud.busted) return;
    hud.bustedText.textContent = text;
    hud.busted.classList.add('show');
    setTimeout(() => hud.busted.classList.remove('show'), 2600);
  };
  return hud;
}

export function updateHud(hud, s) {
  if (hud.healthFill) hud.healthFill.style.width = `${Math.max(0, Math.min(100, s.health))}%`;
  if (hud.healthText) hud.healthText.textContent = `HP ${Math.ceil(s.health)}`;
  if (hud.money) hud.money.textContent = `$${s.money.toLocaleString('en-US')}`;
  if (hud.stars) {
    const stars = hud.stars.children;
    for (let i = 0; i < stars.length; i++) {
      stars[i].classList.toggle('on', i < s.wanted);
    }
  }
  if (hud.speed) hud.speed.textContent = `${Math.round(Math.abs(s.speedKmh))} km/h`;
  if (hud.objective) hud.objective.textContent = s.objective;
}

// view: { player:{x,z,heading}, police:[{x,z}], marker:{x,z}|null,
//         traffic:[{x,z}], peds:[{x,z}], half }
export function drawMinimap(hud, view) {
  const cv = hud.minimap;
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const W = cv.width;
  const H = cv.height;
  const half = view.half || 176;
  const toMap = (x, z) => [
    ((x + half) / (half * 2)) * W,
    ((z + half) / (half * 2)) * H,
  ];
  ctx.fillStyle = '#101a12';
  ctx.fillRect(0, 0, W, H);
  // Roads.
  ctx.strokeStyle = '#4a4a4a';
  ctx.lineWidth = 4;
  const lines = [-160, -128, -96, -64, -32, 0, 32, 64, 96, 128, 160];
  for (const c of lines) {
    const [x] = toMap(c, 0);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    const [, z] = toMap(0, c);
    ctx.beginPath(); ctx.moveTo(0, z); ctx.lineTo(W, z); ctx.stroke();
  }
  // Mission marker: pulsing yellow diamond.
  if (view.marker) {
    const [mx, mz] = toMap(view.marker.x, view.marker.z);
    const r = 5 + Math.sin(performance.now() / 250) * 2;
    ctx.fillStyle = '#ffcc00';
    ctx.beginPath();
    ctx.moveTo(mx, mz - r); ctx.lineTo(mx + r, mz);
    ctx.lineTo(mx, mz + r); ctx.lineTo(mx - r, mz);
    ctx.closePath(); ctx.fill();
  }
  // Traffic: grey dots. Peds: tiny green dots.
  ctx.fillStyle = '#9a9a9a';
  for (const t of view.traffic || []) {
    const [x, z] = toMap(t.x, t.z);
    ctx.fillRect(x - 1.5, z - 1.5, 3, 3);
  }
  ctx.fillStyle = '#7fbf7f';
  for (const p of view.peds || []) {
    const [x, z] = toMap(p.x, p.z);
    ctx.fillRect(x - 1, z - 1, 2, 2);
  }
  // Police: blue dots with a white ring.
  for (const c of view.police || []) {
    const [x, z] = toMap(c.x, c.z);
    ctx.fillStyle = '#2244ff';
    ctx.beginPath(); ctx.arc(x, z, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, z, 5, 0, Math.PI * 2); ctx.stroke();
  }
  // Player: white triangle pointing along the heading.
  const [px, pz] = toMap(view.player.x, view.player.z);
  const h = view.player.heading;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(px + Math.cos(h) * 7, pz + Math.sin(h) * 7);
  ctx.lineTo(px + Math.cos(h + 2.5) * 5, pz + Math.sin(h + 2.5) * 5);
  ctx.lineTo(px + Math.cos(h - 2.5) * 5, pz + Math.sin(h - 2.5) * 5);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  ctx.stroke();
}
