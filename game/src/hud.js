// Solmar Bay — HUD: health, money, wanted stars, speed, mission objective,
// toasts, and a 2D top-down minimap drawn on a canvas.
export class Hud {
  constructor(city) {
    this.city = city;
    this.el = {
      health: document.getElementById('hud-health'),
      healthBar: document.getElementById('hud-health-bar'),
      money: document.getElementById('hud-money'),
      wanted: document.getElementById('hud-wanted'),
      speed: document.getElementById('hud-speed'),
      objective: document.getElementById('hud-objective'),
      toast: document.getElementById('hud-toast'),
      hint: document.getElementById('hud-hint'),
      minimap: document.getElementById('minimap'),
      phone: document.getElementById('phone'),
      missionList: document.getElementById('mission-list'),
    };
    this.mapCtx = this.el.minimap ? this.el.minimap.getContext('2d') : null;
    this.toastTimer = null;
    this.lastWanted = -1;
    this.lastMoney = -1;
  }

  setHealth(h) {
    const v = Math.max(0, Math.round(h));
    this.el.health.textContent = `HP ${v}`;
    this.el.healthBar.style.width = `${v}%`;
    this.el.healthBar.style.background = v > 50 ? '#4caf50' : v > 25 ? '#ff9800' : '#f44336';
  }

  setMoney(m) {
    if (m === this.lastMoney) return;
    this.lastMoney = m;
    this.el.money.textContent = `$${m.toLocaleString('en-US')}`;
  }

  setWanted(n) {
    if (n === this.lastWanted) return;
    this.lastWanted = n;
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < n ? '★' : '☆';
    this.el.wanted.textContent = stars;
    this.el.wanted.style.color = n > 0 ? '#ffd23c' : '#888888';
  }

  setSpeed(kmh, inCar) {
    this.el.speed.textContent = inCar ? `${Math.round(Math.abs(kmh))} km/h` : '';
  }

  setObjective(text) {
    this.el.objective.textContent = text;
  }

  setHint(text) {
    this.el.hint.textContent = text;
    this.el.hint.style.display = text ? 'block' : 'none';
  }

  toast(text, ms = 4200) {
    this.el.toast.textContent = text;
    this.el.toast.style.opacity = '1';
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.el.toast.style.opacity = '0';
    }, ms);
  }

  togglePhone(show) {
    this.el.phone.style.display = show ? 'block' : 'none';
  }

  renderMissionList(missions, activeIndex) {
    this.el.missionList.innerHTML = '';
    missions.forEach((m, i) => {
      const row = document.createElement('div');
      row.className = 'mission-row' + (m.done ? ' done' : '') + (i === activeIndex ? ' active' : '');
      row.innerHTML = `<b>${m.done ? '✓ ' : ''}${m.name}</b> — $${m.reward}<br><span>${m.brief}</span>`;
      if (!m.done && i !== activeIndex) {
        row.style.cursor = 'pointer';
        row.addEventListener('click', () => {
          window.dispatchEvent(new CustomEvent('solmar-start-mission', { detail: i }));
        });
      }
      this.el.missionList.appendChild(row);
    });
  }

  // Top-down map: roads, buildings, player, police, traffic, mission marker.
  drawMinimap(state) {
    const ctx = this.mapCtx;
    if (!ctx) return;
    const S = 200;
    const half = this.city.half + 20;
    const toMap = (x, z) => [((x + half) / (half * 2)) * S, ((z + half) / (half * 2)) * S];
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#10141a';
    ctx.fillRect(0, 0, S, S);
    // Buildings.
    ctx.fillStyle = '#2c3440';
    for (const b of this.city.buildings) {
      const [x1, y1] = toMap(b.minX, b.minZ);
      const [x2, y2] = toMap(b.maxX, b.maxZ);
      ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
    }
    // Roads.
    ctx.strokeStyle = '#5a6270';
    ctx.lineWidth = 3;
    for (const s of this.city.streets) {
      const [x1, y1] = toMap(s, -half);
      const [x2, y2] = toMap(s, half);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      const [ax, ay] = toMap(-half, s);
      const [bx, by] = toMap(half, s);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }
    // Mission marker.
    if (state.marker) {
      const [mx, my] = toMap(state.marker.x, state.marker.z);
      ctx.fillStyle = '#ffd23c';
      ctx.beginPath(); ctx.arc(mx, my, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffd23c';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(mx, my, 8, 0, Math.PI * 2); ctx.stroke();
    }
    // Traffic.
    ctx.fillStyle = '#9aa4b2';
    for (const c of state.traffic || []) {
      const [cx, cy] = toMap(c.x, c.z);
      ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
    }
    // Police.
    ctx.fillStyle = '#3f8cff';
    for (const c of state.police || []) {
      const [cx, cy] = toMap(c.x, c.z);
      ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    // Player arrow.
    const [px, py] = toMap(state.player.x, state.player.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(state.player.heading);
    ctx.fillStyle = '#ff5a3c';
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(4.5, 5); ctx.lineTo(-4.5, 5); ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
