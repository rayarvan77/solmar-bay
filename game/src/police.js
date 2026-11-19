// Solmar Bay — wanted level, police cars that chase, on-foot cops, busted/wasted.
import * as THREE from 'three';
import { clamp, dist2d, angleApproach, angleWrap, randRange, pick } from './util.js';
import { makeCarMesh, Car, carForward } from './vehicles.js';
import { makePersonMesh, Ped } from './peds.js';

export class PoliceSystem {
  constructor(scene, city, rng, callbacks) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.cb = callbacks; // { onBusted, onWasted, onCrime }
    this.wanted = 0;
    this.policeCars = [];
    this.cops = [];
    this.decayTimer = 0;
    this.bustedTimer = 0;
    this.spawnTimer = 0;
    this.sirenTime = 0;
  }

  addWanted(n, reason) {
    const before = this.wanted;
    this.wanted = clamp(this.wanted + n, 0, 5);
    if (this.wanted > before) {
      this.decayTimer = 0;
      this.cb.onCrime && this.cb.onCrime(reason, this.wanted);
    }
  }

  clearWanted() {
    this.wanted = 0;
    this._despawnAll();
  }

  _despawnAll() {
    for (const car of this.policeCars) this.scene.remove(car.mesh);
    for (const cop of this.cops) this.scene.remove(cop.mesh);
    this.policeCars = [];
    this.cops = [];
  }

  _spawnPoliceCar(playerPos) {
    // Spawn on a road near the player so the chase is visible at once.
    const horizontal = this.rng() < 0.5;
    const dist = randRange(this.rng, 30, 45) * (this.rng() < 0.5 ? -1 : 1);
    const k = Math.round(((horizontal ? playerPos.z : playerPos.x) + 280) / 56);
    const line = -280 + k * 56;
    const pos = horizontal
      ? new THREE.Vector3(playerPos.x + dist, 0, line + 3.5)
      : new THREE.Vector3(line + 3.5, 0, playerPos.z + dist);
    pos.x = Math.max(-280, Math.min(280, pos.x));
    pos.z = Math.max(-280, Math.min(280, pos.z));
    const mesh = makeCarMesh(0x111111, true);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    const car = new Car(mesh, { heading: 0, isPolice: true });
    car.speed = 0;
    this.policeCars.push(car);
    return car;
  }

  _spawnCop(playerPos) {
    const angle = this.rng() * Math.PI * 2;
    const pos = new THREE.Vector3(
      playerPos.x + Math.sin(angle) * 22,
      0,
      playerPos.z + Math.cos(angle) * 22,
    );
    const mesh = makePersonMesh(0x1a2a4a, pick(this.rng, [0xf1c27d, 0xe0ac69, 0x8d5524]), false);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    const cop = new Ped(mesh, pos);
    cop.state = 'fight';
    cop.speed = 4.2;
    cop.health = 5;
    this.cops.push(cop);
    return cop;
  }

  _nearestPoliceDist(playerPos) {
    let best = Infinity;
    for (const car of this.policeCars) {
      best = Math.min(best, dist2d(car.pos.x, car.pos.z, playerPos.x, playerPos.z));
    }
    for (const cop of this.cops) {
      best = Math.min(best, dist2d(cop.pos.x, cop.pos.z, playerPos.x, playerPos.z));
    }
    return best;
  }

  update(dt, ctx) {
    const playerPos = ctx.playerPos;
    const driving = ctx.driving;
    const wanted = this.wanted;
    this.sirenTime += dt;

    // Keep the right number of pursuers.
    const wantCars = wanted >= 1 ? Math.min(wanted, 3) : 0;
    const wantCops = wanted >= 2 && !driving ? Math.min(wanted - 1, 3) : 0;
    this.spawnTimer -= dt;
    if (this.policeCars.length < wantCars && this.spawnTimer <= 0) {
      this._spawnPoliceCar(playerPos);
      this.spawnTimer = 2.5;
    }
    if (this.cops.length < wantCops && this.spawnTimer <= 0) {
      this._spawnCop(playerPos);
      this.spawnTimer = 2.5;
    }
    // Trim extras when the heat drops.
    while (this.policeCars.length > wantCars) {
      const car = this.policeCars.pop();
      this.scene.remove(car.mesh);
    }
    while (this.cops.length > wantCops) {
      const cop = this.cops.pop();
      this.scene.remove(cop.mesh);
    }

    // Police cars chase: steer toward the player, ram them.
    for (const car of this.policeCars) {
      const dx = playerPos.x - car.pos.x, dz = playerPos.z - car.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      const targetHeading = Math.atan2(dx / d, dz / d);
      const topSpeed = 34 + wanted * 2.5;
      car.speed = Math.min(car.speed + 12 * dt, topSpeed);
      car.heading = angleApproach(car.heading, targetHeading, 1.9 * dt);
      car.pos.x += Math.sin(car.heading) * car.speed * dt;
      car.pos.z += Math.cos(car.heading) * car.speed * dt;
      // Buildings slow them down (they mostly follow roads anyway).
      if (this.city.collideCircle(car.pos, 2.0)) car.speed *= 0.5;
      car.syncMesh();
      // Siren lights blink.
      const on = Math.floor(this.sirenTime * 4) % 2 === 0;
      if (car.mesh.userData.sirenRed) {
        car.mesh.userData.sirenRed.visible = on;
        car.mesh.userData.sirenBlue.visible = !on;
      }
      // Ram the player's car.
      if (driving && ctx.playerCar) {
        const pd = dist2d(car.pos.x, car.pos.z, ctx.playerCar.pos.x, ctx.playerCar.pos.z);
        if (pd < 3.4) {
          ctx.playerCar.speed *= 0.92;
          if (car.speed > 12 && ctx.onRam) ctx.onRam(car.speed);
        }
      }
    }

    // On-foot cops run at the player and try to bust them.
    let copClose = false;
    for (const cop of this.cops) {
      const dx = playerPos.x - cop.pos.x, dz = playerPos.z - cop.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      cop.heading = Math.atan2(dx / d, dz / d);
      if (d > 1.5) {
        cop.pos.x += (dx / d) * cop.speed * dt;
        cop.pos.z += (dz / d) * cop.speed * dt;
      } else {
        copClose = true;
        if (ctx.onCopGrab) ctx.onCopGrab(dt);
      }
      this.city.collideCircle(cop.pos, 0.5);
      cop.syncMesh();
    }
    if (!copClose) this.bustedTimer = Math.max(0, this.bustedTimer - dt * 2);

    // Wanted decay: out of sight of every pursuer for a while.
    if (wanted > 0) {
      const nearest = this._nearestPoliceDist(playerPos);
      if (nearest > 55) {
        this.decayTimer += dt;
        if (this.decayTimer > 9) {
          this.wanted -= 1;
          this.decayTimer = 0;
          this.cb.onCrime && this.cb.onCrime('The heat is cooling off…', this.wanted);
        }
      } else {
        this.decayTimer = 0;
      }
    }
    void angleWrap;
  }
}
