// Solmar Bay — main game: player, camera, driving, combat, wanted, missions, save.
// Dana Vega, courier of Solmar Bay, pulled into the city's underworld.
import * as THREE from 'three';
import { City, CITY_HALF } from './city.js';
import { TrafficSystem, driveCar } from './vehicles.js';
import { PedSystem, makePersonMesh } from './peds.js';
import { PoliceSystem } from './police.js';
import { MissionManager } from './missions.js';
import { Hud } from './hud.js';
import { SoundEngine } from './audio.js';
import { parseShotQuery, stageShot } from './shots.js';
import { clamp, dist2d, angleWrap, formatCash } from './util.js';

const SAVE_KEY = 'solmar-bay-save-v1';
const SPAWN = new THREE.Vector3(-140, 0, -140);

export class Game {
  constructor(seed, shot) {
    this.seed = seed;
    this.shotMode = shot;
    this.state = 'menu'; // menu | playing | busted | wasted
    this.cash = 250;
    this.health = 100;
    this.ammo = 24;
    this.shotOrbit = false;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    document.getElementById('app').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87b5d6);
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2000);
    this.camera.position.set(120, 90, 190);

    this.city = new City(this.scene, seed);
    // Traffic / peds use their own streams so the city layout stays stable per seed.
    this.traffic = new TrafficSystem(this.scene, this.city, this._rng(seed + 101));
    this.peds = new PedSystem(this.scene, this.city, this._rng(seed + 202));
    this.police = new PoliceSystem(this.scene, this.city, this._rng(seed + 303), {
      onCrime: (reason, stars) => {
        this.hud.message(reason + (stars > 0 ? ' — wanted ' + stars + '★' : ''));
        if (stars > 0) this.hud.banner('WANTED — ' + stars + ' ★', 2.5);
      },
    });
    this.missions = new MissionManager({
      onMessage: (t) => this.hud.message(t),
      onComplete: (def) => {
        this.cash += def.reward;
        this.ammo += 12;
        this.hud.banner(this.missions.rewardText(def), 4);
        this.hud.message(this.missions.rewardText(def));
        this.audio.chime();
        this.saveGame();
        if (this.missions.index < 5) {
          window.setTimeout(() => {
            if (this.state === 'playing') this.missions.startNext();
          }, 3500);
        } else {
          this.hud.message('All missions complete — Solmar Bay is yours, Dana.');
        }
      },
      onFail: (def, reason) => {
        this.hud.banner('Mission failed: ' + reason, 4);
        this.hud.message('Mission failed: ' + reason + ' — press N to retry.');
      },
      onSpawnEnforcers: (count, at) => {
        for (let i = 0; i < count; i++) {
          const p = new THREE.Vector3(at.x + (i - 1.5) * 6, 0, at.z + (i % 2) * 8 - 4);
          this.peds.spawnEnforcer(p);
        }
        this.hud.message(count + ' enforcers are waiting at the Docks.');
      },
      onSetWanted: (n) => { this.police.wanted = n; },
    });
    this.hud = new Hud();
    this.audio = new SoundEngine();

    // Dana Vega on foot.
    this.playerMesh = makePersonMesh(0x16a085, 0xf1c27d, false);
    this.scene.add(this.playerMesh);
    this.playerPos = SPAWN.clone();
    this.playerY = 0;
    this.playerVy = 0;
    this.playerHeading = 0;
    this.camYaw = Math.PI * 0.75;
    this.camPitch = 0.32;
    this.driving = false;
    this.playerCar = null;
    this.bustedProgress = 0;
    this.healthRegenTimer = 0;
    this.saveTimer = 0;
    this.ramCooldown = 0;

    // Waypoint beacon: a column of light over the active objective.
    this.beacon = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(3, 3, 60, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd21a, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.y = 30;
    this.beacon.add(beam);
    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(2.2),
      new THREE.MeshBasicMaterial({ color: 0xffd21a }),
    );
    diamond.position.y = 12;
    this.beacon.add(diamond);
    this.beacon.visible = false;
    this.scene.add(this.beacon);

    this.keys = {};
    this._bindInput();
    this._bindMenu();
    this.loadGame();

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    if (shot) {
      stageShot(this, shot);
    } else {
      this.showStartScreen();
    }

    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  _rng(seed) {
    let a = seed >>> 0;
    return function next() {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- input -------------------------------------------------------------
  _bindInput() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'KeyE') this.tryEnterExitCar();
      if (e.code === 'KeyN') {
        if (this.state === 'playing' && !this.missions.active) this.missions.startNext();
      }
      if (e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    const canvas = this.renderer.domElement;
    canvas.addEventListener('click', () => {
      if (this.state === 'playing' && !this.shotMode && document.pointerLockElement !== canvas) {
        canvas.requestPointerLock();
      }
    });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas && this.state === 'playing') {
        this.camYaw -= e.movementX * 0.0028;
        this.camPitch = clamp(this.camPitch + e.movementY * 0.0022, -0.15, 0.9);
      }
    });
    document.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (this.state !== 'playing') return;
      if (document.pointerLockElement !== canvas && !this.shotMode) return;
      this.attack();
    });
  }

  _bindMenu() {
    const btnNew = document.getElementById('btn-new');
    const btnContinue = document.getElementById('btn-continue');
    const save = this.readSave();
    if (btnContinue) btnContinue.disabled = !save;
    if (btnNew) btnNew.addEventListener('click', () => this.newGame());
    if (btnContinue) btnContinue.addEventListener('click', () => this.continueGame());
  }

  showStartScreen() {
    document.getElementById('start-screen').style.display = 'flex';
    document.getElementById('hud').style.display = 'none';
  }

  hideStartScreen() {
    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('hud').style.display = 'block';
  }

  newGame() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    this.cash = 250; this.health = 100; this.ammo = 24;
    this.missions.index = 0; this.missions.completed = 0; this.missions.active = null;
    this.playerPos.copy(SPAWN);
    this.police.clearWanted();
    this.startPlaying();
    this.missions.startNext();
  }

  continueGame() {
    this.loadGame();
    this.startPlaying();
    if (!this.missions.active && this.missions.index < 5) this.missions.startNext();
  }

  startPlaying() {
    this.hideStartScreen();
    this.state = 'playing';
    this.audio.ensure();
    this.audio.startEngine();
    this.audio.startMusic();
    this.hud.message('Solmar Bay — Dana Vega. Steal a car, take the missions, stay free.');
  }

  // ---- save / load -------------------------------------------------------
  readSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: this.cash,
        missionsCompleted: this.missions.completed,
        missionIndex: this.missions.index,
        pos: [this.playerPos.x, this.playerPos.z],
        health: this.health,
        ammo: this.ammo,
      }));
    } catch (e) {}
  }

  loadGame() {
    const s = this.readSave();
    if (!s) return;
    this.cash = s.cash ?? 250;
    this.health = s.health ?? 100;
    this.ammo = s.ammo ?? 24;
    this.missions.completed = s.missionsCompleted ?? 0;
    this.missions.index = s.missionIndex ?? 0;
    if (s.pos) this.playerPos.set(s.pos[0], 0, s.pos[1]);
  }

  // ---- cars ---------------------------------------------------------------
  enterNearestParked(any) {
    const car = any
      ? this.traffic.parked[0]
      : this.traffic.nearestParked(this.playerPos, 4.5);
    if (!car) return null;
    const idx = this.traffic.parked.indexOf(car);
    if (idx >= 0) this.traffic.parked.splice(idx, 1);
    this.playerCar = car;
    this.driving = true;
    this.playerPos.copy(car.pos);
    this.playerHeading = car.heading;
    return car;
  }

  tryEnterExitCar() {
    if (this.state !== 'playing') return;
    if (this.driving) {
      const car = this.playerCar;
      this.playerPos.set(car.pos.x + Math.cos(car.heading) * 3, 0, car.pos.z - Math.sin(car.heading) * 3);
      this.playerHeading = car.heading;
      this.traffic.parked.push(car);
      this.playerCar = null;
      this.driving = false;
      this.audio.setEngine(0, false);
      return;
    }
    const car = this.enterNearestParked(false);
    if (car) {
      this.audio.ensure();
      this.police.addWanted(1, 'Car stolen');
      this.missions.onCarStolen();
      this.hud.message('You took the car. The owner will not be happy.');
    } else {
      this.hud.message('No car close enough — walk up to a parked car and press E.');
    }
  }

  // ---- combat ---------------------------------------------------------------
  attack() {
    if (this.driving) return;
    this.audio.ensure();
    // Nearest target in front of the camera.
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);
    let best = null, bestD = 35, bestAngle = 0.35;
    for (const ped of this.peds.peds) {
      if (ped.state === 'dead') continue;
      const dx = ped.pos.x - this.playerPos.x, dz = ped.pos.z - this.playerPos.z;
      const d = Math.hypot(dx, dz);
      if (d > bestD) continue;
      const ang = Math.abs(angleWrap(Math.atan2(dx, dz) - Math.atan2(camDir.x, camDir.z)));
      if (ang < bestAngle) { best = ped; bestD = d; bestAngle = ang; }
    }
    for (const cop of this.police.cops) {
      const dx = cop.pos.x - this.playerPos.x, dz = cop.pos.z - this.playerPos.z;
      const d = Math.hypot(dx, dz);
      if (d > bestD) continue;
      const ang = Math.abs(angleWrap(Math.atan2(dx, dz) - Math.atan2(camDir.x, camDir.z)));
      if (ang < bestAngle) { best = cop; bestD = d; bestAngle = ang; }
    }
    if (best && bestD <= 2.4) {
      // Punch.
      this.audio.punch();
      this._damagePed(best, 1, true);
      return;
    }
    if (this.ammo <= 0) {
      if (best) { this.audio.punch(); this._damagePed(best, 1, true); }
      else this.hud.message('Out of ammo — punch up close, or finish a mission to restock.');
      return;
    }
    // Pistol shot.
    this.ammo -= 1;
    this.audio.gunshot();
    this._tracer();
    if (best) {
      this._damagePed(best, 2, false);
      if (this.police.wanted < 5 && this.police._nearestPoliceDist(this.playerPos) < 60) {
        this.police.addWanted(1, 'Shots fired');
      }
    }
  }

  _tracer() {
    const from = this.camera.position.clone();
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const to = from.clone().add(dir.multiplyScalar(30));
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 }));
    this.scene.add(line);
    window.setTimeout(() => { this.scene.remove(line); geo.dispose(); }, 70);
  }

  _damagePed(ped, dmg) {
    ped.health -= dmg;
    if (ped.state === 'walk') {
      ped.state = 'flee';
      ped.fleeFrom = this.playerPos.clone();
      ped.fleeTimer = 4;
    }
    if (ped.health <= 0) {
      const wasEnforcer = this.peds.enforcers.includes(ped);
      const wasCop = this.police.cops.includes(ped);
      ped.state = 'dead';
      ped.mesh.rotation.x = Math.PI / 2;
      ped.mesh.position.y = 0.3;
      if (wasEnforcer) {
        this.missions.onEnforcerDown();
        this.hud.message('Enforcer down.');
      } else if (wasCop) {
        const i = this.police.cops.indexOf(ped);
        this.police.cops.splice(i, 1);
        this.police.addWanted(1, 'Officer down');
      } else {
        this.police.addWanted(1, 'Pedestrian down');
        this.peds.scareNearby(ped.pos, 25);
      }
      window.setTimeout(() => this.peds.removeDead(), 4000);
    }
  }

  // ---- busted / wasted ------------------------------------------------------
  respawn(reason) {
    const penalty = Math.floor(this.cash * 0.1);
    this.cash -= penalty;
    this.health = 100;
    this.ammo = Math.max(this.ammo, 12);
    this.playerPos.copy(SPAWN);
    this.playerY = 0; this.playerVy = 0;
    this.police.clearWanted();
    this.bustedProgress = 0;
    if (this.playerCar) {
      this.traffic.parked.push(this.playerCar);
      this.playerCar = null;
      this.driving = false;
    }
    this.state = 'playing';
    this.hideStartScreen();
    this.hud.banner(reason + ' — lost ' + formatCash(penalty) + '. Back on the streets.', 5);
    this.hud.message(reason + ' — you woke up at the marina clinic, ' + formatCash(penalty) + ' lighter.');
    this.saveGame();
  }

  // ---- per-frame ------------------------------------------------------------
  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    try {
      if (this.state === 'menu') {
        if (this.shotOrbit) {
          const t = performance.now() * 0.00008;
          this.camera.position.set(Math.sin(t) * 210, 95, Math.cos(t) * 210);
          this.camera.lookAt(0, 8, 0);
        }
        this.traffic.update(dt, this.playerPos);
        this.renderer.render(this.scene, this.camera);
        return;
      }
      if (this.state === 'playing') {
        this._updatePlaying(dt);
      }
      this.renderer.render(this.scene, this.camera);
    } catch (err) {
      // Never let one bad frame kill the game loop; report it and carry on.
      console.error('Solmar Bay frame error:', err && err.message ? err.message : err);
    }
  }

  _updatePlaying(dt) {
    const k = this.keys;
    this.ramCooldown = Math.max(0, this.ramCooldown - dt);
    this.healthRegenTimer += dt;
    if (this.healthRegenTimer > 4 && this.health < 100 && this.police.wanted === 0) {
      this.health = Math.min(100, this.health + 6);
      this.healthRegenTimer = 0;
    }

    if (this.driving && this.playerCar) {
      const input = {
        forward: !!(k.KeyW || k.ArrowUp),
        back: !!(k.KeyS || k.ArrowDown),
        left: !!(k.KeyA || k.ArrowLeft),
        right: !!(k.KeyD || k.ArrowRight),
      };
      const res = driveCar(this.playerCar, input, dt, this.city);
      if (res.hit && Math.abs(this.playerCar.speed) > 8 && this.ramCooldown <= 0) {
        this.audio.crash();
        this.ramCooldown = 0.8;
      }
      this.playerPos.copy(this.playerCar.pos);
      this.playerHeading = this.playerCar.heading;
      this.audio.setEngine(Math.abs(this.playerCar.speed) / 40, true);
      // Run over pedestrians.
      for (const ped of this.peds.peds) {
        if (ped.state === 'dead') continue;
        if (dist2d(ped.pos.x, ped.pos.z, this.playerPos.x, this.playerPos.z) < 2.4
            && Math.abs(this.playerCar.speed) > 4) {
          ped.health = 0;
          ped.state = 'dead';
          ped.mesh.rotation.x = Math.PI / 2;
          ped.mesh.position.y = 0.3;
          this.police.addWanted(1, 'Pedestrian hit');
          this.peds.scareNearby(ped.pos, 25);
          this.audio.crash();
          window.setTimeout(() => this.peds.removeDead(), 4000);
        }
      }
      // Bump traffic cars.
      for (const car of this.traffic.cars) {
        const d = dist2d(car.pos.x, car.pos.z, this.playerCar.pos.x, this.playerCar.pos.z);
        if (d < 3.6 && d > 0.01) {
          const push = (3.6 - d) / d;
          car.pos.x += (car.pos.x - this.playerCar.pos.x) * push * 0.5;
          car.pos.z += (car.pos.z - this.playerCar.pos.z) * push * 0.5;
          this.playerCar.speed *= 0.85;
          if (this.ramCooldown <= 0) { this.audio.crash(); this.ramCooldown = 0.8; }
        }
      }
    } else {
      // On foot movement, camera-relative.
      const speed = k.ShiftLeft || k.ShiftRight ? 10 : 6;
      let mx = 0, mz = 0;
      if (k.KeyW || k.ArrowUp) mz += 1;
      if (k.KeyS || k.ArrowDown) mz -= 1;
      if (k.KeyA || k.ArrowLeft) mx -= 1;
      if (k.KeyD || k.ArrowRight) mx += 1;
      const len = Math.hypot(mx, mz) || 1;
      mx /= len; mz /= len;
      const sin = Math.sin(this.camYaw), cos = Math.cos(this.camYaw);
      const vx = (mx * cos - mz * sin) * speed;
      const vz = (-mx * sin - mz * cos) * speed;
      this.playerPos.x += vx * dt;
      this.playerPos.z += vz * dt;
      if (mx !== 0 || mz !== 0) {
        this.playerHeading = Math.atan2(vx, vz);
      }
      // Jump.
      if (k.Space && this.playerY <= 0) this.playerVy = 8;
      this.playerVy -= 22 * dt;
      this.playerY += this.playerVy * dt;
      if (this.playerY <= 0) { this.playerY = 0; this.playerVy = 0; }
      this.city.collideCircle(this.playerPos, 0.6);
      this.playerPos.x = clamp(this.playerPos.x, -CITY_HALF - 24, CITY_HALF + 24);
      this.playerPos.z = clamp(this.playerPos.z, -CITY_HALF - 24, CITY_HALF + 64);
      this.audio.setEngine(0, false);
      // Enforcers / cops punch the player up close.
      for (const ped of [...this.peds.enforcers, ...this.police.cops]) {
        if (ped.state === 'dead') continue;
        const d = dist2d(ped.pos.x, ped.pos.z, this.playerPos.x, this.playerPos.z);
        if (d < 1.6 && ped.attackCooldown <= 0) {
          ped.attackCooldown = 1.1;
          this.health -= 8;
          this.audio.punch();
          this.hud.message('You took a hit!');
          if (this.health <= 0) { this.respawn('WASTED'); return; }
        }
      }
      // Cop grab -> busted.
      const copNear = this.police.cops.some((c) => dist2d(c.pos.x, c.pos.z, this.playerPos.x, this.playerPos.z) < 1.6);
      if (copNear && this.police.wanted > 0) {
        this.bustedProgress += dt;
        if (this.bustedProgress > 1.5) { this.respawn('BUSTED'); return; }
      } else {
        this.bustedProgress = Math.max(0, this.bustedProgress - dt);
      }
    }

    // Player mesh + camera.
    this.playerMesh.visible = !this.driving;
    this.playerMesh.position.set(this.playerPos.x, this.playerY, this.playerPos.z);
    this.playerMesh.rotation.y = this.playerHeading;
    this._updateCamera(dt);

    // World systems.
    this.traffic.update(dt, this.playerPos);
    this.peds.update(dt, this.playerPos);
    this.police.update(dt, {
      playerPos: this.playerPos,
      driving: this.driving,
      playerCar: this.playerCar,
      onRam: () => {
        if (this.ramCooldown <= 0) {
          this.audio.crash();
          this.health -= 3;
          this.ramCooldown = 1;
          if (this.health <= 0) { this.respawn('WASTED'); return; }
        }
      },
      onCopGrab: () => {},
    });
    this.missions.update(dt, {
      playerPos: this.playerPos,
      driving: this.driving,
      wanted: this.police.wanted,
    });

    // Waypoint beacon.
    const wp = this.missions.active ? this.missions.active.def.waypoint : null;
    if (wp) {
      this.beacon.visible = true;
      this.beacon.position.set(wp.x, 0, wp.z);
      this.beacon.children[1].position.y = 12 + Math.sin(performance.now() * 0.003) * 1.5;
      this.beacon.children[1].rotation.y += dt;
    } else {
      this.beacon.visible = false;
    }

    // Siren when wanted.
    this.audio.setSiren(this.police.wanted > 0);

    // HUD.
    this.hud.update(dt, {
      health: this.health,
      cash: this.cash,
      wanted: this.police.wanted,
      speedKmh: this.driving && this.playerCar ? Math.abs(this.playerCar.speed) * 3.6 : 0,
      driving: this.driving,
      ammo: this.ammo,
      objective: this.missions.objectiveText(),
      playerPos: this.playerPos,
      heading: this.driving && this.playerCar ? this.playerCar.heading : this.camYaw,
      cars: this.traffic.cars,
      policeCars: this.police.policeCars,
      cops: this.police.cops,
      waypoint: wp,
      peds: this.peds.peds,
    });

    // Periodic autosave.
    this.saveTimer += dt;
    if (this.saveTimer > 8) { this.saveTimer = 0; this.saveGame(); }
  }

  _updateCamera(dt) {
    const target = this.driving && this.playerCar ? this.playerCar : null;
    const focus = target ? target.pos : this.playerPos;
    const heading = target ? target.heading : this.camYaw;
    const dist = target ? 12 : 7.5;
    const height = target ? 5.2 : 3.2;
    const cx = focus.x - Math.sin(heading) * dist * Math.cos(this.camPitch);
    const cz = focus.z - Math.cos(heading) * dist * Math.cos(this.camPitch);
    const cy = focus.y + height + Math.sin(this.camPitch) * dist * 0.6;
    const desired = new THREE.Vector3(cx, cy, cz);
    this.camera.position.lerp(desired, 1 - Math.pow(0.0001, dt));
    this.camera.lookAt(focus.x, focus.y + 1.6, focus.z);
  }
}

// Boot.
const { shot, seed } = parseShotQuery(window.location.search);
window.__solmar = new Game(seed, shot);
