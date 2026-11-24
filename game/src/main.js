// Solmar Bay — entrypoint: renderer, input, the player on foot and in a
// car, wanted heat, combat, missions, saves, and the main loop. Everything
// is wired here; the world itself lives in city.js / vehicles.js / peds.js
// / police.js / missions.js / hud.js, sound in audio.js, and the fixed
// screenshot scenes in shots.js.

import * as THREE from '../vendor/three.module.min.js';
import { buildCity, collideCircle, clampToMap, onRoad, nearestRoad } from './city.js';
import { Car, spawnTraffic, updateTraffic } from './vehicles.js';
import { spawnPeds } from './peds.js';
import { PoliceForce } from './police.js';
import { MissionRunner } from './missions.js';
import { Hud } from './hud.js';
import { SoundBank } from './audio.js';
import { setupShot, SHOT_NAMES } from './shots.js';
import { mulberry32, clamp, formatMoney } from './util.js';

const SAVE_KEY = 'solmar-bay-save-v1';
const PLAYER_RADIUS = 0.6;

const params = new URLSearchParams(location.search);
const shotNum = Number(params.get('shot') || 0);
const shotMode = shotNum >= 1 && shotNum <= 4;

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf2a05e); // golden hour over the bay
scene.fog = new THREE.Fog(0xf2a05e, 90, 260);

const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 600);
camera.position.set(0, 6, -14);

const hemi = new THREE.HemisphereLight(0xffd9a0, 0x5a4636, 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffb060, 1.9);
sun.position.set(-90, 55, -140); // low sun over the bay, long shadows
sun.castShadow = true;
sun.shadow.camera.left = -160;
sun.shadow.camera.right = 160;
sun.shadow.camera.top = 160;
sun.shadow.camera.bottom = -160;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);

// ---------- world ----------
const city = buildCity(scene);
const rng = mulberry32(20261119);
const traffic = spawnTraffic(scene, 14, city.colliders, rng);
const peds = spawnPeds(scene, 26, rng);
const police = new PoliceForce(scene, city.colliders);
const missions = new MissionRunner(scene, rng);
const hud = new Hud();
const sounds = new SoundBank();

// ---------- player ----------
function makePlayerMesh() {
  const group = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0x2a6a9a });
  const jeans = new THREE.MeshLambertMaterial({ color: 0x2a3350 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd8a080 });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.75, 0.24), jeans);
  legs.position.y = 0.38;
  group.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.68, 0.32), jacket);
  torso.position.y = 1.08;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.36), skin);
  head.position.y = 1.62;
  group.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.4), new THREE.MeshLambertMaterial({ color: 0xc23b2e }));
  cap.position.y = 1.84;
  group.add(cap);
  return group;
}

const player = {
  mesh: makePlayerMesh(),
  pos: new THREE.Vector3(4, 0, -128),
  heading: 0,
  camYaw: 0,
  camPitch: 0.32,
  health: 100,
  money: 150,
  wanted: 0,
  heat: 0, // 0..100, drives the wanted level
  inCar: null, // Car or null
  speed: 0,
  punchCooldown: 0,
  shootCooldown: 0,
  dead: false,
  busted: false,
};
player.mesh.position.copy(player.pos);
scene.add(player.mesh);

// ---------- save ----------
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (typeof data.money === 'number') player.money = data.money;
    if (typeof data.missionsDone === 'number') {
      missions.index = Math.min(data.missionsDone, 8);
      missions.done = missions.index;
    }
  } catch (e) {
    /* corrupted save: start fresh */
  }
}

function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: Math.floor(player.money),
      missionsDone: missions.done,
    }));
  } catch (e) {
    /* storage unavailable (private mode): ignore */
  }
}
loadSave();

// ---------- input ----------
const keys = {};
let pointerLocked = false;
let started = false;

window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyM' && started && !shotMode) tryStartMission();
  if (e.code === 'KeyE' && started && !shotMode) tryEnterExitCar();
  if (e.code === 'KeyH' && started && player.inCar) sounds.blip(320, 0.25, 0.3);
});
window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
});
document.addEventListener('mousemove', (e) => {
  if (!pointerLocked || !started || shotMode) return;
  player.camYaw -= e.movementX * 0.0028;
  player.camPitch = clamp(player.camPitch + e.movementY * 0.0022, 0.08, 1.1);
});
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === renderer.domElement;
});
renderer.domElement.addEventListener('click', () => {
  if (!started || shotMode) return;
  sounds.ensure();
  if (!pointerLocked) renderer.domElement.requestPointerLock();
  else shoot();
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

hud.onPlay = () => {
  sounds.ensure();
  hud.hideStart();
  started = true;
  renderer.domElement.requestPointerLock();
  hud.toast('Dana Vega: "Welcome to Solmar Bay. Press M for your first job."', 5000);
  hud.setObjective(missions.statusLine());
};
hud.onRetry = () => {
  hud.hideEnd();
  respawn();
};

// ---------- wanted ----------
function addHeat(amount, reason) {
  player.heat = clamp(player.heat + amount, 0, 100);
  const level = Math.min(5, Math.floor(player.heat / 20));
  if (level > player.wanted) {
    player.wanted = level;
    hud.centerMessage('WANTED LEVEL ' + level + (reason ? ' — ' + reason : ''), 2600);
    hud.dispatch('DISPATCH: ' + (level >= 3
      ? 'All units converge on Solmar Bay — roadblock going up on Marina Row!'
      : level === 2
        ? 'Units responding — suspect last seen near Marina Row.'
        : 'Unit 7 responding — possible 10-31 in progress.'));
    sounds.setSiren(level > 0);
  }
}

function decayHeat(dt) {
  // Heat cools when the player stays out of trouble and out of sight.
  const nearestCop = police.cars.reduce((m, c) => Math.min(m, Math.hypot(c.pos.x - player.pos.x, c.pos.z - player.pos.z)), Infinity);
  if (nearestCop > 45) {
    player.heat = clamp(player.heat - dt * 2.2, 0, 100);
  } else {
    player.heat = clamp(player.heat - dt * 0.4, 0, 100);
  }
  const level = Math.min(5, Math.floor(player.heat / 20));
  if (level < player.wanted) {
    player.wanted = level;
    if (level === 0) {
      sounds.setSiren(false);
      hud.toast('You lost the cops. Heat is off.');
    }
  }
}

// ---------- actions ----------
function nearestCar(maxDist) {
  let best = null;
  let bestD = maxDist;
  const all = [...traffic, ...police.cars];
  for (const car of all) {
    const d = Math.hypot(car.pos.x - player.pos.x, car.pos.z - player.pos.z);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

function tryEnterExitCar() {
  if (player.inCar) {
    const car = player.inCar;
    player.inCar = null;
    player.pos.x = car.pos.x + Math.sin(car.heading + Math.PI / 2) * 2.4;
    player.pos.z = car.pos.z + Math.cos(car.heading + Math.PI / 2) * 2.4;
    player.mesh.position.copy(player.pos);
    player.mesh.visible = true;
    sounds.setEngine(0, false);
    return;
  }
  const car = nearestCar(4);
  if (!car) return;
  player.inCar = car;
  player.mesh.visible = false;
  if (car.police) {
    addHeat(25, 'stole a police car');
  } else if (!car.stolen) {
    car.stolen = true;
    addHeat(12, 'car theft');
    hud.toast('You stole a car. The owner will not be pleased.');
  }
  sounds.blip(500, 0.1, 0.2);
}

function punch() {
  if (player.punchCooldown > 0 || player.inCar) return;
  player.punchCooldown = 0.45;
  const reach = 2.2;
  const fx = Math.sin(player.heading);
  const fz = Math.cos(player.heading);
  for (const ped of peds) {
    if (ped.state === 'down') continue;
    const dx = ped.pos.x - player.pos.x;
    const dz = ped.pos.z - player.pos.z;
    if (Math.hypot(dx, dz) < reach && dx * fx + dz * fz > 0) {
      ped.knockDown();
      addHeat(18, 'assault');
      hud.toast('You knocked a pedestrian down. People saw that.');
      sounds.thud();
      return;
    }
  }
  // Punching a car door dents it and draws attention if a cop is near.
  const car = nearestCar(2.6);
  if (car) {
    sounds.thud();
    if (police.cars.some((c) => Math.hypot(c.pos.x - player.pos.x, c.pos.z - player.pos.z) < 25)) {
      addHeat(10, 'vandalism');
    }
  }
}

function shoot() {
  if (player.shootCooldown > 0 || player.inCar || !started) return;
  player.shootCooldown = 0.35;
  sounds.shot();
  addHeat(10, 'fired a shot');
  const fx = Math.sin(player.camYaw);
  const fz = Math.cos(player.camYaw);
  // Hitscan against peds within a narrow cone and 40 units.
  for (const ped of peds) {
    if (ped.state === 'down') continue;
    const dx = ped.pos.x - player.pos.x;
    const dz = ped.pos.z - player.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 40 && dist > 0.5) {
      const dot = (dx * fx + dz * fz) / dist;
      if (dot > 0.985) {
        ped.knockDown();
        addHeat(15, 'shot a pedestrian');
        break;
      }
    }
  }
  // Flash a tracer line for a split second.
  const tracer = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.06, 40),
    new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.8 })
  );
  tracer.position.set(player.pos.x + fx * 20, 1.4, player.pos.z + fz * 20);
  tracer.rotation.y = player.camYaw;
  scene.add(tracer);
  setTimeout(() => scene.remove(tracer), 70);
}

function tryStartMission() {
  if (missions.state === 'active') {
    hud.toast('Job already running: ' + missions.current.name);
    return;
  }
  if (missions.allDone) {
    hud.toast('All jobs done. Solmar Bay is yours.');
    return;
  }
  const def = missions.start(player.pos);
  if (def) {
    hud.centerMessage('New job — ' + def.name + ': ' + def.brief, 4200);
    hud.toast('Dana Vega: "' + def.brief + '"', 5000);
    sounds.chime();
  }
}

function respawn() {
  player.health = 100;
  player.wanted = 0;
  player.heat = 0;
  player.dead = false;
  player.busted = false;
  player.inCar = null;
  player.mesh.visible = true;
  player.pos.set(4, 0, -128);
  player.heading = 0;
  player.mesh.position.copy(player.pos);
  police.clear();
  sounds.setSiren(false);
  hud.setHealth(100);
  hud.setWanted(0);
  hud.setObjective(missions.statusLine());
  saveGame();
}

function wasted() {
  if (player.dead) return;
  player.dead = true;
  sounds.setEngine(0, false);
  sounds.setSiren(false);
  hud.showEnd('WASTED', 'The streets of Solmar Bay got the better of you.');
  saveGame();
}

function busted() {
  if (player.busted || player.dead) return;
  player.busted = true;
  const fine = Math.min(player.money, 150);
  player.money -= fine;
  hud.setMoney(player.money);
  hud.showEnd('BUSTED', 'The police caught you. Fine: ' + formatMoney(fine) + '.');
  saveGame();
}

// ---------- per-frame updates ----------
const clock = new THREE.Clock();
let elapsed = 0;

function updatePlayerOnFoot(dt) {
  const walk = 6;
  const fwd = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  const strafe = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  const sin = Math.sin(player.camYaw);
  const cos = Math.cos(player.camYaw);
  // Forward is along the camera yaw; strafe is screen-right (f x up).
  const mx = (sin * fwd - cos * strafe) * walk * dt;
  const mz = (cos * fwd + sin * strafe) * walk * dt;
  if (fwd !== 0 || strafe !== 0) {
    player.heading = Math.atan2(mx, mz);
  }
  player.pos.x += mx;
  player.pos.z += mz;
  clampToMap(player.pos, 6);
  collideCircle(city.colliders, player.pos, PLAYER_RADIUS);
  player.mesh.position.copy(player.pos);
  player.mesh.rotation.y = player.heading;
  // Walk bob.
  const moving = fwd !== 0 || strafe !== 0;
  player.mesh.position.y = moving ? Math.abs(Math.sin(elapsed * 10)) * 0.05 : 0;
  player.speed = moving ? walk : 0;
  if (keys.KeyF) punch();
}

function updatePlayerInCar(dt) {
  const car = player.inCar;
  const input = {
    forward: !!(keys.KeyW || keys.ArrowUp),
    back: !!(keys.KeyS || keys.ArrowDown),
    left: !!(keys.KeyA || keys.ArrowLeft),
    right: !!(keys.KeyD || keys.ArrowRight),
  };
  const prevSpeed = car.speed;
  car.drive(input, dt, city.colliders, (impact) => {
    sounds.thud();
    if (impact > 12) {
      player.health -= (impact - 12) * 0.9;
      hud.setHealth(player.health);
      if (player.health <= 0) wasted();
    }
    if (impact > 8 && onRoad(car.pos.x, car.pos.z)) {
      // Reckless driving near police draws heat.
      const nearCop = police.cars.some((c) => Math.hypot(c.pos.x - car.pos.x, c.pos.z - car.pos.z) < 30);
      if (nearCop) addHeat(8, 'reckless driving');
    }
  });
  player.speed = Math.abs(car.speed);
  player.pos.x = car.pos.x;
  player.pos.z = car.pos.z;
  player.heading = car.heading;
  // Running over a pedestrian is a serious crime.
  for (const ped of peds) {
    if (ped.state === 'down') continue;
    const d = Math.hypot(ped.pos.x - car.pos.x, ped.pos.z - car.pos.z);
    if (d < 1.9 && Math.abs(car.speed) > 4) {
      ped.knockDown();
      addHeat(20, 'hit a pedestrian');
      hud.toast('You ran over a pedestrian!');
      sounds.thud();
    } else if (d < 6 && Math.abs(car.speed) > 2) {
      ped.scare(player.pos);
    }
  }
  // Bump into traffic cars: push them aside, slow down.
  for (const other of traffic) {
    if (other === car) continue;
    const d = Math.hypot(other.pos.x - car.pos.x, other.pos.z - car.pos.z);
    if (d < 3.4 && d > 0.01) {
      const push = (3.4 - d) / d;
      other.pos.x += (other.pos.x - car.pos.x) * push * 0.5;
      other.pos.z += (other.pos.z - car.pos.z) * push * 0.5;
      other.speed *= 0.7;
      car.speed *= 0.92;
      if (Math.abs(prevSpeed) > 7) sounds.thud();
    }
  }
  // Roadblock cruisers are parked solid: hitting one hurts.
  for (const block of police.blockCars) {
    const d = Math.hypot(block.pos.x - car.pos.x, block.pos.z - car.pos.z);
    if (d < 3.2 && Math.abs(car.speed) > 3) {
      car.speed *= 0.3;
      player.health -= 6;
      hud.setHealth(player.health);
      hud.toast('You smashed into a police roadblock!');
      sounds.thud();
      if (player.health <= 0) wasted();
    } else if (d < 3.2) {
      car.speed *= 0.85;
    }
  }
  sounds.setEngine(Math.abs(car.speed) / 26, true);
}

function updateCamera(dt) {
  if (player.inCar) {
    const car = player.inCar;
    const back = 11;
    const targetX = car.pos.x - Math.sin(car.heading) * back;
    const targetZ = car.pos.z - Math.cos(car.heading) * back;
    camera.position.x += (targetX - camera.position.x) * Math.min(1, dt * 4);
    camera.position.z += (targetZ - camera.position.z) * Math.min(1, dt * 4);
    camera.position.y += (5.2 - camera.position.y) * Math.min(1, dt * 4);
    camera.lookAt(car.pos.x + Math.sin(car.heading) * 8, 1.6, car.pos.z + Math.cos(car.heading) * 8);
  } else {
    const cx = player.pos.x - Math.sin(player.camYaw) * 7 * Math.cos(player.camPitch);
    const cz = player.pos.z - Math.cos(player.camYaw) * 7 * Math.cos(player.camPitch);
    const cy = 2.2 + Math.sin(player.camPitch) * 7;
    camera.position.x += (cx - camera.position.x) * Math.min(1, dt * 8);
    camera.position.y += (cy - camera.position.y) * Math.min(1, dt * 8);
    camera.position.z += (cz - camera.position.z) * Math.min(1, dt * 8);
    camera.lookAt(player.pos.x, 1.5, player.pos.z);
  }
}

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;

  if (shotMode) {
    // Frozen tableau: render the staged scene, keep the minimap alive.
    renderer.render(scene, camera);
    hud.drawMinimap(player.pos, player.heading, missions.target, police.cars, traffic);
    return;
  }

  if (started && !player.dead && !player.busted) {
    player.punchCooldown = Math.max(0, player.punchCooldown - dt);
    player.shootCooldown = Math.max(0, player.shootCooldown - dt);
    if (player.inCar) updatePlayerInCar(dt);
    else updatePlayerOnFoot(dt);

    updateTraffic(traffic, dt, elapsed);
    for (const ped of peds) ped.update(dt, player.pos, elapsed);
    player.pos.heading = player.heading; // police aim/roadblock use it
    police.update(dt, player.pos, player.speed, player.wanted, busted, (speed) => {
      player.health -= speed * 0.55;
      hud.setHealth(player.health);
      sounds.thud();
      if (player.health <= 0) wasted();
    });
    decayHeat(dt);

    const evt = missions.update(dt, {
      playerPos: player.pos,
      inCar: !!player.inCar,
      wanted: player.wanted,
      onReward: (amount) => {
        player.money += amount;
        hud.setMoney(player.money);
        hud.toast('Job complete! Dana Vega paid ' + formatMoney(amount) + '.');
        sounds.chime();
        saveGame();
      },
      onGrab: () => {
        addHeat(30, 'bank robbery');
        hud.centerMessage('Cash grabbed! Lose the cops!', 2600);
      },
    });
    if (evt === 'complete') {
      hud.centerMessage('Job complete! Next job is ready — press M.', 3000);
      if (missions.allDone) {
        hud.centerMessage('ALL JOBS DONE — Solmar Bay is yours!', 5000);
      }
      hud.setObjective(missions.statusLine());
    } else if (evt === 'failed') {
      hud.centerMessage('Job failed — the clock ran out.', 3000);
      hud.setObjective(missions.statusLine());
    } else if (evt === 'stage') {
      hud.setObjective(missions.objectiveText());
      sounds.blip(760, 0.15, 0.25);
    }
    if (missions.state === 'active') hud.setObjective(missions.objectiveText());

    updateCamera(dt);
    hud.setWanted(player.wanted);
    hud.setSpeed(player.speed * 3.6, !!player.inCar);
    hud.setClock(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
    hud.drawMinimap(player.pos, player.inCar ? player.inCar.heading : player.camYaw, missions.target, police.cars, traffic);
  }

  renderer.render(scene, camera);
}

// ---------- boot ----------
hud.setHealth(player.health);
hud.setMoney(player.money);
hud.setWanted(player.wanted);
hud.setObjective(missions.statusLine());

if (shotMode) {
  started = true;
  const world = { camera, player, cars: { traffic }, peds, police, missions, hud, renderer };
  setupShot(shotNum, world);
  hud.setClock('12:00');
  hud.drawMinimap(player.pos, player.heading, missions.target, police.cars, traffic);
  window.__solmarShot = SHOT_NAMES[shotNum];
  document.title = 'Solmar Bay — shot ' + shotNum;
} else {
  hud.showStart();
}

tick();
