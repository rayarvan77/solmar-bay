// Solmar Bay — police: pursuit cars that spawn at the map edge, steer
// towards the player, and try to ram them to a stop. Higher wanted levels
// mean more cars, faster cars and harder ramming. When a cop gets close
// and slow for long enough while the player is on foot or crawling, the
// player is busted.

import * as THREE from '../vendor/three.module.min.js';
import { Car } from './vehicles.js';
import { collideCircle, CITY } from './city.js';
import { clamp, turnTowards } from './util.js';

export class PoliceForce {
  constructor(scene, colliders) {
    this.scene = scene;
    this.colliders = colliders;
    this.cars = [];
    this.bustTimer = 0;
    this.spawnTimer = 0;
    this.flashTime = 0;
  }

  // How many pursuit cars the current wanted level calls for.
  wantedCount(wanted) {
    return wanted <= 0 ? 0 : Math.min(1 + wanted, 6);
  }

  update(dt, playerPos, playerSpeed, wanted, onBusted, onRam) {
    this.flashTime += dt;
    const want = this.wantedCount(wanted);
    this.spawnTimer -= dt;
    if (this.cars.length < want && this.spawnTimer <= 0) {
      this.spawnTimer = 2.5;
      this.spawnPolice(playerPos);
    }
    if (this.cars.length > want) {
      // Wanted dropped: the furthest cop gives up and drives away.
      let far = null;
      let farD = -1;
      for (const c of this.cars) {
        const d = Math.hypot(c.pos.x - playerPos.x, c.pos.z - playerPos.z);
        if (d > farD) {
          farD = d;
          far = c;
        }
      }
      if (far) this.removeCar(far);
    }

    const sirenPhase = Math.floor(this.flashTime * 4) % 2 === 0;
    for (const car of this.cars) {
      // Steer towards the player with a little prediction.
      const px = playerPos.x + Math.sin(playerPos.heading || 0) * (playerSpeed || 0) * 0.4;
      const pz = playerPos.z + Math.cos(playerPos.heading || 0) * (playerSpeed || 0) * 0.4;
      const targetHeading = Math.atan2(px - car.pos.x, pz - car.pos.z);
      const maxTurn = 2.4 * dt;
      car.heading = turnTowards(car.heading, targetHeading, maxTurn);
      const topSpeed = 13 + wanted * 2.6;
      car.speed += (topSpeed - car.speed) * Math.min(1, dt * 0.9);
      const beforeX = car.pos.x;
      const beforeZ = car.pos.z;
      car.pos.x += Math.sin(car.heading) * car.speed * dt;
      car.pos.z += Math.cos(car.heading) * car.speed * dt;
      // Slide along buildings instead of sticking inside them.
      const probe = { x: car.pos.x, z: car.pos.z };
      if (collideCircle(this.colliders, probe, car.radius)) {
        car.pos.x = probe.x;
        car.pos.z = probe.z;
        car.speed *= 0.6;
      }
      // Ram check: a hard hit on the player.
      const d = Math.hypot(car.pos.x - playerPos.x, car.pos.z - playerPos.z);
      if (d < 2.6 && car.speed > 8) {
        if (onRam) onRam(car.speed);
        car.speed *= 0.35;
      }
      // Busted: a cop sitting on the player while the player is slow.
      if (d < 3.4 && Math.abs(playerSpeed || 0) < 2.5) {
        this.bustTimer += dt;
        if (this.bustTimer > 2.2 && onBusted) {
          onBusted();
          this.bustTimer = 0;
        }
      } else {
        this.bustTimer = Math.max(0, this.bustTimer - dt * 2);
      }
      car.syncMesh();
      // Flash the light bar.
      const red = car.mesh.getObjectByName('sirenRed');
      const blue = car.mesh.getObjectByName('sirenBlue');
      if (red) red.visible = sirenPhase;
      if (blue) blue.visible = !sirenPhase;
    }
  }

  spawnPolice(playerPos) {
    // Spawn at a road on the far side of the map from the player.
    const angle = Math.atan2(playerPos.x, playerPos.z) + Math.PI + (Math.random() - 0.5) * 1.2;
    const r = CITY.half - 12;
    const x = clamp(Math.sin(angle) * r, -CITY.half, CITY.half);
    const z = clamp(Math.cos(angle) * r, -CITY.half, CITY.half);
    const heading = Math.atan2(playerPos.x - x, playerPos.z - z);
    const car = new Car(this.scene, x, z, heading, 0xe8e8e8, true);
    car.speed = 8;
    this.cars.push(car);
  }

  removeCar(car) {
    this.scene.remove(car.mesh);
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
  }

  clear() {
    for (const car of [...this.cars]) this.removeCar(car);
    this.bustTimer = 0;
  }
}
