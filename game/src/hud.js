// Solmar Bay — HUD: the DOM overlay on top of the 3D canvas. Health bar,
// money, wanted stars, speed, mission objective, a top-down minimap drawn
// on a 2D canvas, toast messages, and the start / wasted / busted screens.

import { formatMoney, clamp } from './util.js';
import { CITY, roadLines } from './city.js';

export class Hud {
  constructor() {
    this.root = document.getElementById('hud');
    this.buildDom();
    this.toasts = [];
    this.minimap = this.root.querySelector('#minimap');
    this.miniCtx = this.minimap.getContext('2d');
    this.lastHealth = -1;
  }

  buildDom() {
    this.root.innerHTML = `
      <div id="hud-top-left">
        <div id="health-row"><span class="hud-label">HEALTH</span><div id="health-bar"><div id="health-fill"></div></div></div>
        <div id="money-row"><span class="hud-label">CASH</span><span id="money">$0</span></div>
        <div id="objective"></div>
      </div>
      <div id="hud-top-right">
        <div id="wanted"></div>
        <div id="clock"></div>
      </div>
      <div id="speedo"><span id="speed">0</span><span class="hud-label"> km/h</span></div>
      <canvas id="minimap" width="180" height="180"></canvas>
      <div id="toasts"></div>
      <div id="center-msg"></div>
      <div id="start-screen">
        <h1>SOLMAR BAY</h1>
        <p class="tagline">An open-world crime story in miniature.</p>
        <p>Five jobs. One city. Don't get caught.</p>
        <p class="controls">WASD move / drive &nbsp;·&nbsp; Mouse look &nbsp;·&nbsp; E enter car &nbsp;·&nbsp; F punch &nbsp;·&nbsp; Click shoot &nbsp;·&nbsp; M start mission &nbsp;·&nbsp; H horn</p>
        <button id="play-btn">CLICK TO PLAY</button>
        <p class="fine">Progress saves to this browser. Dana Vega is waiting.</p>
      </div>
      <div id="end-screen" class="hidden">
        <h1 id="end-title">WASTED</h1>
        <p id="end-sub"></p>
        <button id="retry-btn">TRY AGAIN</button>
      </div>`;
    this.root.querySelector('#play-btn').addEventListener('click', () => {
      if (this.onPlay) this.onPlay();
    });
    this.root.querySelector('#retry-btn').addEventListener('click', () => {
      if (this.onRetry) this.onRetry();
    });
  }

  showStart() {
    this.root.querySelector('#start-screen').classList.remove('hidden');
  }

  hideStart() {
    this.root.querySelector('#start-screen').classList.add('hidden');
  }

  showEnd(title, sub) {
    const end = this.root.querySelector('#end-screen');
    this.root.querySelector('#end-title').textContent = title;
    this.root.querySelector('#end-sub').textContent = sub;
    end.classList.remove('hidden');
  }

  hideEnd() {
    this.root.querySelector('#end-screen').classList.add('hidden');
  }

  setHealth(h) {
    const v = clamp(Math.round(h), 0, 100);
    if (v === this.lastHealth) return;
    this.lastHealth = v;
    const fill = this.root.querySelector('#health-fill');
    fill.style.width = v + '%';
    fill.style.background = v > 50 ? '#4caf50' : v > 25 ? '#ff9800' : '#f44336';
  }

  setMoney(m) {
    this.root.querySelector('#money').textContent = formatMoney(m);
  }

  setWanted(level) {
    const el = this.root.querySelector('#wanted');
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < level ? '★' : '☆';
    el.textContent = stars;
    el.className = level >= 4 ? 'hot' : level >= 2 ? 'warm' : '';
  }

  setSpeed(kmh, inCar) {
    const el = this.root.querySelector('#speedo');
    el.style.display = inCar ? 'block' : 'none';
    this.root.querySelector('#speed').textContent = String(Math.round(kmh));
  }

  setObjective(text) {
    this.root.querySelector('#objective').textContent = text;
  }

  setClock(text) {
    this.root.querySelector('#clock').textContent = text;
  }

  centerMessage(text, ms = 2200) {
    const el = this.root.querySelector('#center-msg');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this._centerTimer);
    this._centerTimer = setTimeout(() => el.classList.remove('show'), ms);
  }

  toast(text, ms = 3600) {
    const box = this.root.querySelector('#toasts');
    const div = document.createElement('div');
    div.className = 'toast';
    div.textContent = text;
    box.appendChild(div);
    setTimeout(() => {
      div.classList.add('fade');
      setTimeout(() => div.remove(), 400);
    }, ms);
    while (box.children.length > 3) box.firstChild.remove();
  }

  // Top-down minimap: roads as lines, the player as a triangle, the
  // mission marker as a gold dot, police as flashing blue dots.
  drawMinimap(playerPos, playerHeading, missionTarget, policeCars, trafficCars) {
    const ctx = this.miniCtx;
    const S = 180;
    const scale = S / (CITY.half * 2 + 30);
    const toMap = (x, z) => [(x + CITY.half + 15) * scale, (z + CITY.half + 15) * scale];
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#10141a';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#1d2b1d';
    ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = '#3a4048';
    ctx.lineWidth = 3;
    for (const l of roadLines()) {
      const [x1, y1] = toMap(l, -CITY.half - 15);
      const [x2, y2] = toMap(l, CITY.half + 15);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      const [x3, y3] = toMap(-CITY.half - 15, l);
      const [x4, y4] = toMap(CITY.half + 15, l);
      ctx.beginPath();
      ctx.moveTo(x3, y3);
      ctx.lineTo(x4, y4);
      ctx.stroke();
    }
    // Traffic as tiny grey dots.
    ctx.fillStyle = '#9aa4b0';
    for (const car of trafficCars) {
      const [x, y] = toMap(car.pos.x, car.pos.z);
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }
    // Mission marker: pulsing gold.
    if (missionTarget) {
      const [x, y] = toMap(missionTarget.x, missionTarget.z);
      const r = 4 + Math.sin(performance.now() / 300) * 1.5;
      ctx.fillStyle = '#ffc020';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Police as blue dots.
    ctx.fillStyle = '#4a86ff';
    for (const car of policeCars) {
      const [x, y] = toMap(car.pos.x, car.pos.z);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player: a white triangle pointing along the heading.
    const [px, py] = toMap(playerPos.x, playerPos.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.PI - playerHeading); // heading 0 faces +z, i.e. down the map
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4, 5);
    ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
