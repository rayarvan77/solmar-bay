// Solmar Bay — HUD: health, cash, wanted stars, speed, objective, feed, minimap.
import { CITY_HALF } from './city.js';
import { formatCash } from './util.js';

export class Hud {
  constructor() {
    this.el = {
      healthFill: document.getElementById('health-fill'),
      healthText: document.getElementById('health-text'),
      cash: document.getElementById('cash'),
      stars: document.getElementById('stars'),
      speed: document.getElementById('speed'),
      speedLabel: document.getElementById('speed-label'),
      objective: document.getElementById('objective'),
      feed: document.getElementById('feed'),
      banner: document.getElementById('banner'),
      ammo: document.getElementById('ammo'),
      minimap: document.getElementById('minimap'),
    };
    this.mapCtx = this.el.minimap.getContext('2d');
    this.messages = [];
    this.bannerTimer = 0;
  }

  message(text) {
    this.messages.unshift(text);
    if (this.messages.length > 5) this.messages.pop();
    this.el.feed.innerHTML = this.messages.map((m) => '<div>' + escapeHtml(m) + '</div>').join('');
  }

  banner(text, seconds) {
    this.el.banner.textContent = text;
    this.el.banner.style.opacity = '1';
    this.bannerTimer = seconds || 3;
  }

  update(dt, s) {
    // s: { health, cash, wanted, speedKmh, driving, ammo, objective, playerPos, heading, cars, policeCars, cops, waypoint, peds }
    this.el.healthFill.style.width = Math.max(0, s.health) + '%';
    this.el.healthText.textContent = 'HP ' + Math.max(0, Math.ceil(s.health));
    this.el.cash.textContent = formatCash(s.cash);
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < s.wanted ? '★' : '☆';
    this.el.stars.textContent = stars;
    this.el.stars.style.color = s.wanted > 0 ? '#ffd21a' : '#cfd6dd';
    this.el.speed.textContent = s.driving ? String(Math.round(s.speedKmh)) : '';
    this.el.speedLabel.textContent = s.driving ? 'km/h' : '';
    this.el.ammo.textContent = 'Ammo ' + s.ammo + '  •  [E] car  •  [Click] shoot/punch';
    this.el.objective.textContent = s.objective || '';
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.el.banner.style.opacity = '0';
    }
    this._drawMinimap(s);
  }

  _drawMinimap(s) {
    const c = this.mapCtx;
    const W = 200, H = 200;
    const span = CITY_HALF * 2 + 120;
    const toMap = (x, z) => [
      ((x + span / 2) / span) * W,
      ((z + span / 2) / span) * H,
    ];
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(12, 20, 28, 0.82)';
    c.fillRect(0, 0, W, H);
    // Roads as a grid.
    c.strokeStyle = '#5a636e';
    c.lineWidth = 3;
    for (let k = 0; k <= 10; k++) {
      const p = -CITY_HALF + k * 56;
      const [x1] = toMap(p, 0);
      const [, y1] = toMap(0, p);
      c.beginPath(); c.moveTo(x1, 0); c.lineTo(x1, H); c.stroke();
      c.beginPath(); c.moveTo(0, y1); c.lineTo(W, y1); c.stroke();
    }
    // Water / docks at the south edge.
    c.fillStyle = '#2a6a8a';
    c.fillRect(0, H - 12, W, 12);
    // Waypoint marker.
    if (s.waypoint) {
      const [wx, wy] = toMap(s.waypoint.x, s.waypoint.z);
      c.fillStyle = '#ffd21a';
      c.beginPath(); c.arc(wx, wy, 6, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#ffd21a'; c.lineWidth = 2;
      c.beginPath(); c.arc(wx, wy, 10, 0, Math.PI * 2); c.stroke();
    }
    // Traffic cars (grey), police (blue/red blink), peds (dots).
    c.fillStyle = '#9aa0a3';
    for (const car of s.cars || []) {
      const [x, y] = toMap(car.pos.x, car.pos.z);
      c.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    c.fillStyle = '#3b82f6';
    for (const car of s.policeCars || []) {
      const [x, y] = toMap(car.pos.x, car.pos.z);
      c.beginPath(); c.arc(x, y, 3.5, 0, Math.PI * 2); c.fill();
    }
    // Player arrow.
    const [px, py] = toMap(s.playerPos.x, s.playerPos.z);
    c.save();
    c.translate(px, py);
    c.rotate(Math.atan2(Math.sin(s.heading), Math.cos(s.heading)) * -1 + Math.PI);
    c.fillStyle = s.driving ? '#ffd21a' : '#ffffff';
    c.beginPath();
    c.moveTo(0, -7); c.lineTo(5, 6); c.lineTo(-5, 6); c.closePath();
    c.fill();
    c.restore();
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
