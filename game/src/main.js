// Solmar Bay — entry point. Boots the three.js scene, wires input, runs the
// game loop (on foot / driving / wanted / missions) and the ?shot=N
// deterministic screenshot mode.
import * as THREE from '../vendor/three.module.min.js';
import { mulberry32, clamp, dist } from './util.js';
import { buildCity } from './city.js';
import { AudioSys } from './audio.js';
import { createTraffic, createParkedCars, updateTraffic, updatePlayerCar } from './vehicles.js';
import { createPeds, updatePeds, knockDownPeds, nearestPed } from './peds.js';
import { createPolice } from './police.js';
import { createMissions } from './missions.js';
import { initHud, updateHud, drawMinimap } from './hud.js';
import { applyShot } from './shots.js';

const SEED = 1337;
const SAVE_KEY = 'solmar-bay-save-v1';
const params = new URLSearchParams(location.search);
const shotId = params.has('shot') ? parseInt(params.get('shot') || '0', 10) : 0;

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0x87a5c8);
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x87a5c8, 130, 400);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
camera.position.set(30, 30, 30);

scene.add(new THREE.HemisphereLight(0xcfe5ff, 0x3a4a3a, 0.95));
const sun = new THREE.DirectionalLight(0xfff2d8, 1.1);
sun.position.set(80, 140, 40);
scene.add(sun);

// ---------- world ----------
const rng = mulberry32(SEED);
const city = buildCity(scene, rng);
const traffic = createTraffic(scene, rng, city, 8);
const parkedCars = createParkedCars(scene, rng, city, 4);
const peds = createPeds(scene, rng, city, 14);
const police = createPolice(scene, rng, city);
const missions = createMissions(scene);
const audio = new AudioSys();
const hud = initHud();

// ---------- player (on foot) ----------
function makePlayerMesh() {
  const group = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0xc0392b });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xf1c27d });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.75, 0.34), jacket);
  torso.position.y = 1.08;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 10, 8), skin);
  head.position.y = 1.66;
  group.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.72, 0.22), pants);
  legL.position.set(-0.16, 0.36, 0);
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.16;
  group.add(legR);
  return { group, legL, legR };
}
const playerMesh = makePlayerMesh();
scene.add(playerMesh.group);

// ---------- game state ----------
const G = {
  player: { x: city.spawn.x, z: city.spawn.z, heading: Math.PI / 4, mesh: playerMesh.group },
  playerCar: null,
  inCar: false,
  health: 100,
  money: 250,
  wanted: 0,
  speedKmh: 0,
  camYaw: Math.PI / 4,
  camPitch: 0.35,
  cameraMode: 'follow',
  fixedCam: null,
  objectiveOverride: null,
  crimeTimer: 99,
  decayAcc: 0,
  ramCooldown: 0,
  walkPhase: 0,
  police,
  parkedCars,
  missions,
  traffic,
  peds,
};
playerMesh.group.position.set(G.player.x, 0, G.player.z);

// ---------- save / load ----------
function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: G.money,
      missionsDone: missions.completed,
    }));
  } catch { /* storage unavailable: ignore */ }
}
function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (typeof s.money === 'number') G.money = Math.max(0, Math.floor(s.money));
    if (typeof s.missionsDone === 'number') {
      missions.setCompleted(Math.max(0, Math.min(5, Math.floor(s.missionsDone))));
      const w = missions.wantedForCurrent();
      if (w > 0) G.wanted = w;
    }
  } catch { /* corrupt save: start fresh */ }
}
loadGame();

// ---------- input ----------
const keys = {};
let dragging = false;
let lastPX = 0;
let lastPY = 0;
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys[e.code] = true;
  audio.ensure();
  if (e.code === 'KeyE') toggleCar();
  if (e.code === 'Space') {
    e.preventDefault();
    punch();
  }
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
renderer.domElement.addEventListener('pointerdown', (e) => {
  dragging = true;
  lastPX = e.clientX;
  lastPY = e.clientY;
  audio.ensure();
  hideOverlay();
});
window.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  G.camYaw -= (e.clientX - lastPX) * 0.005;
  G.camPitch = clamp(G.camPitch + (e.clientY - lastPY) * 0.003, 0.08, 0.9);
  lastPX = e.clientX;
  lastPY = e.clientY;
});
window.addEventListener('pointerup', () => { dragging = false; });
renderer.domElement.addEventListener('click', () => {
  audio.ensure();
  if (!G.inCar) shoot();
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
document.getElementById('overlay')?.addEventListener('click', hideOverlay);
function hideOverlay() {
  const o = document.getElementById('overlay');
  if (o) o.classList.add('hidden');
}
window.addEventListener('beforeunload', saveGame);

// ---------- crimes / wanted ----------
function commitCrime(level, text) {
  if (level <= 0) return;
  G.wanted = Math.min(5, G.wanted + level);
  G.crimeTimer = 0;
  if (text) hud.showToast(text);
}

// ---------- car enter / exit ----------
function nearestCar(list, maxD) {
  let best = null;
  let bd = maxD;
  for (const c of list) {
    const d = dist(G.player.x, G.player.z, c.x, c.z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
function toggleCar() {
  if (shotId) return;
  if (!G.inCar) {
    const car = nearestCar(parkedCars, 4.5) || nearestCar(traffic, 4.5);
    if (!car) return;
    const wasParked = parkedCars.includes(car);
    if (wasParked) parkedCars.splice(parkedCars.indexOf(car), 1);
    else traffic.splice(traffic.indexOf(car), 1);
    G.playerCar = car;
    G.inCar = true;
    playerMesh.group.visible = false;
    commitCrime(1, 'You stole a car! Wanted +1');
    audio.blip(520, 0.15);
  } else {
    const car = G.playerCar;
    car.parked = true;
    parkedCars.push(car);
    G.playerCar = null;
    G.inCar = false;
    // Step out on the right side of the car.
    G.player.x = car.x + Math.cos(car.heading + Math.PI / 2) * 3;
    G.player.z = car.z + Math.sin(car.heading + Math.PI / 2) * 3;
    G.player.heading = car.heading;
    playerMesh.group.visible = true;
    playerMesh.group.position.set(G.player.x, 0, G.player.z);
  }
}

// ---------- combat (on foot) ----------
function punch() {
  if (shotId || G.inCar) return;
  const ped = nearestPed(peds, G.player.x, G.player.z, 2.4);
  if (!ped) return;
  knockDownPeds(peds, ped.x, ped.z, 0.5);
  commitCrime(1, 'You punched a pedestrian! Wanted +1');
  audio.thud();
}
function shoot() {
  if (shotId || G.inCar) return;
  const fx = Math.cos(G.camYaw);
  const fz = Math.sin(G.camYaw);
  let best = null;
  let bd = 30;
  for (const ped of peds) {
    if (ped.state === 'down') continue;
    const dx = ped.x - G.player.x;
    const dz = ped.z - G.player.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < 1 || d > bd) continue;
    if ((dx * fx + dz * fz) / d < 0.86) continue; // ~30 deg cone
    bd = d;
    best = ped;
  }
  if (!best) return;
  knockDownPeds(peds, best.x, best.z, 0.5);
  commitCrime(1, 'Shots fired! Wanted +1');
  audio.blip(220, 0.08);
}

// ---------- busted / wasted ----------
function caught(text) {
  hud.showBusted(text);
  G.wanted = 0;
  G.money = Math.max(0, G.money - 100);
  G.health = 100;
  if (G.inCar && G.playerCar) {
    G.playerCar.parked = true;
    parkedCars.push(G.playerCar);
    G.playerCar = null;
    G.inCar = false;
    playerMesh.group.visible = true;
  }
  police.clear();
  G.player.x = city.spawn.x;
  G.player.z = city.spawn.z;
  G.player.heading = Math.PI / 4;
  playerMesh.group.position.set(G.player.x, 0, G.player.z);
  saveGame();
}

// ---------- per-frame update ----------
let lastT = performance.now() / 1000;
let saveAcc = 0;

function tick(dt, time) {
  const input = {
    up: !!(keys['KeyW'] || keys['ArrowUp']),
    down: !!(keys['KeyS'] || keys['ArrowDown']),
    left: !!(keys['KeyA'] || keys['ArrowLeft']),
    right: !!(keys['KeyD'] || keys['ArrowRight']),
    run: !!keys['ShiftLeft'] || !!keys['ShiftRight'],
  };
  if (keys['ArrowLeft']) G.camYaw += 1.6 * dt;
  if (keys['ArrowRight']) G.camYaw -= 1.6 * dt;

  // Player movement.
  if (G.inCar && G.playerCar) {
    updatePlayerCar(dt, input, G.playerCar, city, traffic, (ev) => {
      if (ev === 'crash') audio.thud();
    });
    G.player.x = G.playerCar.x;
    G.player.z = G.playerCar.z;
    G.player.heading = G.playerCar.heading;
    G.speedKmh = Math.abs(G.playerCar.speed) * 3.6;
    // Running over pedestrians.
    if (Math.abs(G.playerCar.speed) > 6) {
      const n = knockDownPeds(peds, G.playerCar.x, G.playerCar.z, 2.3);
      if (n > 0) {
        commitCrime(2, 'You ran someone over! Wanted +2');
        audio.thud();
      }
    }
  } else {
    const fwd = (input.up ? 1 : 0) - (input.down ? 1 : 0);
    const strafe = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const speed = input.run ? 10 : 6;
    const fx = Math.cos(G.camYaw);
    const fz = Math.sin(G.camYaw);
    let mx = fx * fwd + -fz * strafe;
    let mz = fz * fwd + fx * strafe;
    const len = Math.sqrt(mx * mx + mz * mz);
    if (len > 0.01) {
      mx /= len;
      mz /= len;
      const nx = G.player.x + mx * speed * dt;
      const nz = G.player.z + mz * speed * dt;
      if (!city.collides(nx, G.player.z, 0.6)) G.player.x = nx;
      if (!city.collides(G.player.x, nz, 0.6)) G.player.z = nz;
      G.player.heading = Math.atan2(mz, mx);
      G.walkPhase += dt * speed * 2.2;
      playerMesh.legL.rotation.x = Math.sin(G.walkPhase) * 0.5;
      playerMesh.legR.rotation.x = -Math.sin(G.walkPhase) * 0.5;
    } else {
      playerMesh.legL.rotation.x *= 0.8;
      playerMesh.legR.rotation.x *= 0.8;
    }
    playerMesh.group.position.set(G.player.x, 0, G.player.z);
    playerMesh.group.rotation.y = -G.player.heading + Math.PI / 2;
    G.speedKmh = 0;
  }

  // World life.
  updateTraffic(dt, traffic, city);
  const danger = G.inCar && G.playerCar
    ? { x: G.playerCar.x, z: G.playerCar.z, speed: Math.abs(G.playerCar.speed) }
    : null;
  updatePeds(dt, peds, rng, city, danger);
  G.ramCooldown = Math.max(0, G.ramCooldown - dt);
  police.update(dt, {
    x: G.player.x, z: G.player.z,
    speed: G.inCar && G.playerCar ? Math.abs(G.playerCar.speed) : 0,
    inCar: G.inCar,
  }, G.wanted, {
    onBusted: () => caught('BUSTED!'),
    onRam: () => {
      if (G.ramCooldown > 0) return;
      G.ramCooldown = 1;
      G.health = Math.max(0, G.health - 12);
      audio.thud();
      if (G.health <= 0) caught('WASTED!');
    },
  }, time);

  // Wanted decay: lay low and the heat fades.
  G.crimeTimer += dt;
  if (G.wanted > 0 && G.crimeTimer > 25) {
    const nearest = police.cars.length
      ? Math.min(...police.cars.map((c) => dist(c.x, c.z, G.player.x, G.player.z)))
      : Infinity;
    if (nearest > 50) {
      G.decayAcc += dt;
      if (G.decayAcc >= 8) {
        G.decayAcc = 0;
        G.wanted = Math.max(0, G.wanted - 1);
      }
    }
  }
  // Slow health regen.
  if (G.health < 100 && G.wanted === 0) G.health = Math.min(100, G.health + 2 * dt);

  // Missions.
  const ev = missions.update(dt, G.player, time);
  if (ev) {
    if (ev.type === 'completed') {
      G.money += ev.reward;
      audio.coin();
      hud.showToast(`Mission complete: ${ev.mission.name} — +$${ev.reward}`, 4200);
      if (ev.wanted) G.wanted = Math.max(G.wanted, ev.wanted);
      saveGame();
    } else if (ev.type === 'stage') {
      hud.showToast(ev.text);
      audio.blip(990, 0.12);
    } else if (ev.type === 'failed') {
      hud.showToast(ev.reason, 4200);
    }
  }

  // Audio.
  audio.setEngine(G.inCar ? Math.abs(G.playerCar ? G.playerCar.speed : 0) / 36 : 0, G.inCar);
  audio.setSiren(G.wanted > 0 && police.cars.length > 0);
  audio.update(time);

  // HUD + minimap.
  updateHud(hud, {
    health: G.health,
    money: G.money,
    wanted: G.wanted,
    speedKmh: G.speedKmh,
    objective: G.objectiveOverride || missions.objectiveText(),
  });
  drawMinimap(hud, {
    player: G.player,
    police: police.cars,
    marker: missions.markerPos(),
    traffic,
    peds,
    half: 176,
  });

  // Autosave.
  saveAcc += dt;
  if (saveAcc > 10) { saveAcc = 0; saveGame(); }

  // Camera.
  if (G.cameraMode === 'fixed' && G.fixedCam) {
    camera.position.copy(G.fixedCam.position);
    camera.lookAt(G.fixedCam.target);
  } else if (G.inCar && G.playerCar) {
    const c = G.playerCar;
    const fx = Math.cos(c.heading);
    const fz = Math.sin(c.heading);
    const tx = c.x - fx * 12;
    const tz = c.z - fz * 12;
    camera.position.x += (tx - camera.position.x) * Math.min(1, dt * 5);
    camera.position.y += (4.8 - camera.position.y) * Math.min(1, dt * 5);
    camera.position.z += (tz - camera.position.z) * Math.min(1, dt * 5);
    camera.lookAt(c.x + fx * 7, 1.6, c.z + fz * 7);
  } else {
    const fx = Math.cos(G.camYaw);
    const fz = Math.sin(G.camYaw);
    const h = 3.2 + G.camPitch * 7;
    const d = 9 + G.camPitch * 3;
    camera.position.set(
      G.player.x - fx * d,
      h,
      G.player.z - fz * d,
    );
    camera.lookAt(G.player.x + fx * 2, 1.6, G.player.z + fz * 2);
  }
}

// ---------- shot mode ----------
if (shotId >= 1 && shotId <= 4) {
  document.getElementById('overlay')?.classList.add('hidden');
  // Let the world settle deterministically before posing the shot.
  for (let i = 0; i < 4; i++) {
    updateTraffic(0.5, traffic, city);
    updatePeds(0.5, peds, rng, city, null);
  }
  applyShot(shotId, G);
  let frames = 0;
  function shotLoop() {
    const now = performance.now() / 1000;
    const dt = Math.min(0.05, now - lastT);
    lastT = now;
    tick(dt, now);
    renderer.render(scene, camera);
    frames++;
    if (frames < 6) requestAnimationFrame(shotLoop);
    else window.__shotReady = true;
  }
  requestAnimationFrame(shotLoop);
} else {
  // Interactive mode.
  hud.showToast('Welcome to Solmar Bay — WASD to move, E to enter a car, Space to punch.', 5000);
  function loop() {
    const now = performance.now() / 1000;
    const dt = Math.min(0.05, now - lastT);
    lastT = now;
    tick(dt, now);
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

window.__game = G;
