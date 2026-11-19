// Solmar Bay — entry point: renderer, player controller, game loop, save.
// A GTA-style open world: walk, steal and drive cars, dodge the cops, run
// jobs for Dana Vega, all in one static page with no network requests.
import * as THREE from 'three';
import { mulberry32, hashSeed, clamp, damp, wrapAngle } from './util.js';
import { AudioSys } from './audio.js';
import { buildCity } from './city.js';
import { PedManager } from './peds.js';
import { makeCarMesh, makeCarState, stepCar, syncCarMesh, TrafficManager } from './vehicles.js';
import { PoliceManager } from './police.js';
import { MissionManager } from './missions.js';
import { Hud } from './hud.js';
import { setupShot } from './shots.js';

const SAVE_KEY = 'solmar-bay-save-v1';
const SEED = hashSeed('solmar-bay');

// Surface page errors for automated play-testing.
window.__solmarErrors = [];
window.addEventListener('error', (e) => window.__solmarErrors.push(String(e.message || e.error)));
window.addEventListener('unhandledrejection', (e) => window.__solmarErrors.push('rejection: ' + String(e.reason)));

const params = new URLSearchParams(location.search);
const shotNum = params.has('shot') ? parseInt(params.get('shot'), 10) : 0;
const SHOT_MODE = shotNum >= 1 && shotNum <= 4;

const rng = mulberry32(SEED);
const audio = new AudioSys();

// ---- Save ---------------------------------------------------------------
function defaultSave() {
  return { money: 250, missionsDone: {} };
}
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const s = JSON.parse(raw);
    return { money: typeof s.money === 'number' ? s.money : 250, missionsDone: s.missionsDone || {} };
  } catch (e) {
    return defaultSave();
  }
}
const save = loadSave();
let saveTimer = 0;
function saveGame() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* storage full/blocked */ }
}

// ---- Renderer / scene ----------------------------------------------------
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fb0d8);
scene.fog = new THREE.Fog(0x8fb0d8, 220, 620);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(-60, 40, -60);

scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x3a4a3a, 0.95));
const sun = new THREE.DirectionalLight(0xffe0b3, 1.25);
sun.position.set(140, 200, 80);
scene.add(sun);

// ---- World ---------------------------------------------------------------
const city = buildCity(scene, rng);
const hud = new Hud(city);

const player = {
  x: -8, z: -8, y: 0, vy: 0, heading: Math.PI * 0.25,
  inCar: false, car: null, carSpeed: 0,
  health: 100, wanted: 0, lastHurtT: -99,
};

// The player on foot: orange jacket, easy to spot.
const playerMesh = new THREE.Group();
{
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.58, 0.88, 0.36),
    new THREE.MeshLambertMaterial({ color: 0xe86a1c }),
  );
  body.position.y = 0.95;
  playerMesh.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.23, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xe8b98a }),
  );
  head.position.y = 1.64;
  playerMesh.add(head);
  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.12, 0.5),
    new THREE.MeshLambertMaterial({ color: 0x222831 }),
  );
  cap.position.y = 1.82;
  playerMesh.add(cap);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x2e4a6b });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.55, 0.22), legMat);
  legL.position.set(-0.14, 0.28, 0);
  playerMesh.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.14;
  playerMesh.add(legR);
  playerMesh.userData.legs = [legL, legR];
}
playerMesh.position.set(player.x, 0, player.z);
scene.add(playerMesh);

const traffic = new TrafficManager(scene, city, rng);
traffic.spawnAll(22);
const parkedCars = [];

const peds = new PedManager(scene, city, rng, {
  onCrime: (kind) => police.addCrime(kind),
});

const police = new PoliceManager(scene, city, rng, {
  onWanted: (level) => {
    player.wanted = level;
    hud.setWanted(level);
    if (level > 0) hud.toast(`Wanted level ${level} — lose the cops!`, 2600);
  },
  onBusted: () => {
    const fine = Math.min(save.money, 300);
    save.money -= fine;
    player.health = 100;
    player.wanted = 0;
    police.setWanted(0);
    teleportOnFoot(0, -170, 0); // Solmar Central police station
    hud.toast(`BUSTED! You paid a $${fine} fine.`, 5000);
    hud.setMoney(save.money);
    saveGame();
  },
  onCrime: (kind) => police.addCrime(kind),
});

const missions = new MissionManager(scene, city, rng, {
  onObjective: (t) => hud.setObjective(t),
  onToast: (t) => hud.toast(t),
  onComplete: () => { saveGame(); hud.renderMissionList(missions.missions, -1); },
  onMoney: (n) => { audio.cash(); hud.setMoney(save.money); },
});
missions.loadSave(save);

// ---- Car enter / exit ----------------------------------------------------
function givePlayerCar(x, z, heading, color) {
  const mesh = makeCarMesh(color);
  scene.add(mesh);
  const car = makeCarState(x, z, heading);
  car.mesh = mesh;
  car.owned = true;
  player.car = car;
  player.inCar = true;
  player.carSpeed = 0;
  playerMesh.visible = false;
  syncCarMesh(car);
  return car;
}

function enterCar(car, fromTraffic) {
  if (fromTraffic) traffic.cars = traffic.cars.filter((c) => c !== car);
  else {
    const i = parkedCars.indexOf(car);
    if (i >= 0) parkedCars.splice(i, 1);
  }
  player.car = car;
  player.inCar = true;
  player.carSpeed = car.speed || 0;
  playerMesh.visible = false;
  if (!car.owned) {
    car.owned = true;
    police.addCrime('steal');
    hud.toast('You stole a car! The cops are onto you.', 3000);
  }
  audio.blip(520, 0.08, 'square', 0.1);
}

function exitCar() {
  const car = player.car;
  if (!car) return;
  player.inCar = false;
  player.carSpeed = 0;
  car.speed = 0;
  const side = car.heading + Math.PI / 2;
  player.x = car.x + Math.sin(side) * 2.2;
  player.z = car.z + Math.cos(side) * 2.2;
  player.y = 0;
  city.collideCircle(player, 0.6);
  parkedCars.push(car);
  player.car = null;
  playerMesh.visible = true;
  playerMesh.position.set(player.x, 0, player.z);
}

function teleportOnFoot(x, z, heading) {
  if (player.inCar && player.car) {
    player.car.speed = 0;
    parkedCars.push(player.car);
    player.car = null;
    player.inCar = false;
    player.carSpeed = 0;
    playerMesh.visible = true;
  }
  player.x = x; player.z = z; player.y = 0; player.vy = 0;
  player.heading = heading;
  playerMesh.position.set(x, 0, z);
  playerMesh.rotation.y = heading;
}

// ---- Input ---------------------------------------------------------------
const keys = {};
let camYaw = Math.PI * 0.25;
let camPitch = 0.32;
let camDist = 9;
let state = SHOT_MODE ? 'shot' : 'menu';
let mouseDown = false;

window.addEventListener('keydown', (e) => {
  if (e.code === 'Tab') {
    e.preventDefault();
    if (state === 'playing') {
      const open = hud.el.phone.style.display !== 'block';
      hud.togglePhone(open);
      if (open) hud.renderMissionList(missions.missions, missions.active ? missions.active.index : -1);
    }
    return;
  }
  keys[e.code] = true;
  if (e.code === 'KeyM') audio.setMuted(!audio.muted);
  if (state !== 'playing') return;
  if (e.code === 'KeyE') tryEnterExitCar();
  if (e.code === 'KeyF') punch();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

canvas.addEventListener('click', () => {
  if (state === 'playing' && canvas.requestPointerLock) canvas.requestPointerLock();
});
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvas && state === 'playing') {
    camYaw -= e.movementX * 0.0032;
    camPitch = clamp(camPitch + e.movementY * 0.0024, 0.08, 1.1);
  }
});
canvas.addEventListener('mousedown', (e) => {
  if (e.button === 0 && state === 'playing') shoot();
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
window.addEventListener('solmar-start-mission', (e) => {
  if (missions.startMission(e.detail)) {
    hud.togglePhone(false);
    hud.renderMissionList(missions.missions, missions.active.index);
  }
});

function tryEnterExitCar() {
  if (player.inCar) { exitCar(); return; }
  const nearTraffic = traffic.nearest(player.x, player.z, 4.5);
  if (nearTraffic) { enterCar(nearTraffic, true); return; }
  let best = null, bd = 4.5;
  for (const car of parkedCars) {
    const d = Math.hypot(car.x - player.x, car.z - player.z);
    if (d < bd) { bd = d; best = car; }
  }
  if (best) enterCar(best, false);
}

function punch() {
  if (player.inCar) return;
  audio.thud();
  const fx = Math.sin(player.heading), fz = Math.cos(player.heading);
  const ped = peds.nearest(player.x + fx * 1.2, player.z + fz * 1.2, 2.4);
  if (ped) {
    peds.knockDown(ped, player.x, player.z);
    hud.toast('You decked a pedestrian! That was a crime.', 2600);
  }
}

function shoot() {
  if (player.inCar) return;
  audio.shot();
  const fx = Math.sin(camYaw + Math.PI), fz = Math.cos(camYaw + Math.PI);
  // Tracer from the player toward the camera-forward direction.
  const from = new THREE.Vector3(player.x, 1.4, player.z);
  const to = new THREE.Vector3(player.x + fx * 30, 1.4, player.z + fz * 30);
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([from, to]),
    new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9 }),
  );
  scene.add(line);
  setTimeout(() => scene.remove(line), 90);
  // Hit the nearest ped roughly in front of the camera.
  let best = null, bd = 45;
  for (const ped of peds.peds) {
    if (ped.state === 'down') continue;
    const dx = ped.x - player.x, dz = ped.z - player.z;
    const d = Math.hypot(dx, dz);
    const dot = (dx * fx + dz * fz) / (d || 1);
    if (d < bd && dot > 0.86) { bd = d; best = ped; }
  }
  if (best) {
    peds.knockDown(best, player.x, player.z);
    peds.scare(player.x, player.z, 25);
  } else {
    peds.scare(player.x, player.z, 25);
    police.addCrime('shoot');
  }
}

// ---- Per-frame update ----------------------------------------------------
let walkPhase = 0;
function updatePlayer(dt) {
  const fwd = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  const strafe = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  if (player.inCar && player.car) {
    const car = player.car;
    const input = {
      throttle: fwd,
      steer: (keys.KeyA || keys.ArrowLeft ? -1 : 0) + (keys.KeyD || keys.ArrowRight ? 1 : 0),
    };
    if (keys.Space) input.throttle = car.speed > 0.5 ? -1 : input.throttle;
    const hit = stepCar(car, input, dt, (pos, r) => city.collideCircle(pos, r), (impact) => {
      audio.crash(clamp(impact / 20, 0.2, 1));
      player.health = Math.max(0, player.health - impact * 0.35);
      player.lastHurtT = elapsed;
    });
    player.carSpeed = car.speed;
    player.x = car.x; player.z = car.z;
    player.heading = car.heading;
    camYaw = damp(camYaw, car.heading + Math.PI, 2.2, dt);
    audio.setEngine(Math.abs(car.speed) / 34, true);
    syncCarMesh(car);
  } else {
    audio.setEngine(0, false);
    const run = keys.ShiftLeft || keys.ShiftRight;
    const speed = run ? 8 : 5;
    const sin = Math.sin(camYaw + Math.PI), cos = Math.cos(camYaw + Math.PI);
    // Forward is (sin, cos); screen-right is (-cos, sin) — D must move right.
    let mx = sin * fwd - cos * strafe;
    let mz = cos * fwd + sin * strafe;
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      mx /= len; mz /= len;
      player.x += mx * speed * dt;
      player.z += mz * speed * dt;
      player.heading = Math.atan2(mx, mz);
      walkPhase += dt * speed * 1.6;
      const swing = Math.sin(walkPhase) * 0.5;
      playerMesh.userData.legs[0].rotation.x = swing;
      playerMesh.userData.legs[1].rotation.x = -swing;
    } else {
      playerMesh.userData.legs[0].rotation.x *= 0.8;
      playerMesh.userData.legs[1].rotation.x *= 0.8;
    }
    if (keys.Space && player.y === 0) player.vy = 6.5;
    if (player.y > 0 || player.vy !== 0) {
      player.vy -= 18 * dt;
      player.y += player.vy * dt;
      if (player.y <= 0) { player.y = 0; player.vy = 0; }
    }
    city.collideCircle(player, 0.6);
    playerMesh.position.set(player.x, player.y, player.z);
    playerMesh.rotation.y = player.heading;
  }
}

function updateCamera(dt) {
  const target = new THREE.Vector3(
    player.x,
    (player.inCar ? 1.8 : 1.6) + player.y,
    player.z,
  );
  const dist = player.inCar ? 11 : 8;
  const cx = target.x + Math.sin(camYaw) * Math.cos(camPitch) * dist;
  const cz = target.z + Math.cos(camYaw) * Math.cos(camPitch) * dist;
  const cy = target.y + Math.sin(camPitch) * dist + 1.2;
  camera.position.set(
    damp(camera.position.x, cx, 8, dt),
    damp(camera.position.y, cy, 8, dt),
    damp(camera.position.z, cz, 8, dt),
  );
  camera.lookAt(target);
}

function updateHud(dt) {
  hud.setHealth(player.health);
  hud.setMoney(save.money);
  hud.setWanted(player.wanted);
  hud.setSpeed(player.inCar ? player.carSpeed * 3.6 : 0, player.inCar);
  // Contextual hint.
  let hint = '';
  if (player.inCar) hint = 'W/S drive · A/D steer · Space brake · E exit car';
  else {
    const nearCar = traffic.nearest(player.x, player.z, 4.5) ||
      parkedCars.find((c) => Math.hypot(c.x - player.x, c.z - player.z) < 4.5);
    if (nearCar) hint = 'Press E to get in the car';
    else if (missions.active && missions.active.steps[missions.active.step].kind === 'grab') hint = 'Hold E to grab the cash';
    else hint = 'WASD move · Shift run · F punch · Click shoot · Tab phone';
  }
  hud.setHint(hint);
  hud.drawMinimap({
    player,
    traffic: traffic.cars,
    police: police.cars,
    marker: missions.marker,
  });
}

function checkDeath() {
  if (player.health <= 0) {
    player.health = 100;
    const fine = Math.min(save.money, 200);
    save.money -= fine;
    police.setWanted(0);
    teleportOnFoot(-34, 170, Math.PI); // Solmar General hospital
    hud.toast(`WASTED! You woke up at the hospital, $${fine} poorer.`, 5000);
    hud.setMoney(save.money);
    saveGame();
  }
}

let elapsed = 0;
function updateWorld(dt, freezePlayer) {
  if (!freezePlayer) updatePlayer(dt);
  // Traffic always sees the player — cars stop for a pedestrian standing
  // in the road ahead of them, which is also what makes stealing a car
  // feasible on foot.
  traffic.update(dt, { x: player.x, z: player.z });
  peds.update(dt, player, traffic.cars);
  police.update(dt, player, audio);
  missions.update(dt, player, !!keys.KeyE);
  missions.animate(elapsed);
  if (!freezePlayer) {
    // Health regen after 8 s without damage.
    if (elapsed - player.lastHurtT > 8 && player.health < 100) {
      player.health = Math.min(100, player.health + 2 * dt);
    }
    checkDeath();
  }
}

// ---- Main loop -----------------------------------------------------------
let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  elapsed += dt;
  if (state === 'playing') {
    updateWorld(dt, false);
    updateCamera(dt);
    updateHud(dt);
    saveTimer += dt;
    if (saveTimer > 20) { saveTimer = 0; saveGame(); }
  } else if (state === 'shot') {
    updateWorld(dt, true);
  }
  renderer.render(scene, camera);
}

// ---- Start / menu --------------------------------------------------------
const overlay = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
const continueBtn = document.getElementById('continue-btn');
const titleEl = document.getElementById('game-title');

function beginGame() {
  audio.init();
  overlay.style.display = 'none';
  state = 'playing';
  hud.setObjective('No active job — open the phone (Tab) to take the next one.');
  hud.toast('Welcome to Solmar Bay. Dana Vega has work for you — press Tab.', 5000);
}
startBtn.addEventListener('click', beginGame);
if (save.money > 250 || Object.keys(save.missionsDone).length > 0) {
  continueBtn.style.display = 'inline-block';
  continueBtn.addEventListener('click', beginGame);
}
hud.setMoney(save.money);
hud.setHealth(player.health);
hud.renderMissionList(missions.missions, -1);

// ---- Shot mode -----------------------------------------------------------
const game = {
  scene, city, rng, player, traffic, police, missions, hud,
  givePlayerCar, teleportOnFoot,
};
if (SHOT_MODE) {
  overlay.style.display = 'none';
  const pose = setupShot(game, shotNum);
  camera.position.copy(pose.camPos);
  camera.lookAt(pose.lookAt);
  if (pose.showStart) overlay.style.display = 'flex';
  // Settle the world: run a short fixed simulation so traffic and police
  // are mid-motion, but keep the player frozen so the shot stays framed.
  for (let i = 0; i < 45; i++) updateWorld(1 / 60, true);
  hud.setHealth(player.health);
  hud.setMoney(save.money);
  hud.setWanted(player.wanted);
  hud.setSpeed(player.inCar ? player.carSpeed * 3.6 : 0, player.inCar);
  hud.drawMinimap({ player, traffic: traffic.cars, police: police.cars, marker: missions.marker });
  renderer.render(scene, camera);
  window.__solmarReady = true;
}

requestAnimationFrame(frame);
window.__solmarReady = true;

// Read-only debug handle for automated play-testing.
window.__solmar = {
  get state() { return state; },
  get camYaw() { return camYaw; },
  get money() { return save.money; },
  get player() {
    return {
      x: player.x, z: player.z, inCar: player.inCar,
      carSpeed: player.carSpeed, health: player.health, wanted: player.wanted,
    };
  },
  get nearestCar() {
    let best = null, bd = Infinity;
    for (const c of [...traffic.cars, ...parkedCars]) {
      const d = Math.hypot(c.x - player.x, c.z - player.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best ? { x: best.x, z: best.z, dist: bd, speed: best.speed || 0 } : null;
  },
  get missions() { return missions.missions.map((m) => ({ id: m.id, done: m.done })); },
  get policeCount() { return police.cars.length; },
  get trafficCount() { return traffic.cars.length; },
};
