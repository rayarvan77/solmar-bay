// Solmar Bay — wanted level and police. Crimes raise the wanted level;
// police cars spawn to match it and chase the player. Lose them by staying
// out of trouble and out of sight, and the heat cools down.
import * as THREE from 'three';
import { makeCarMesh, makeCarState, stepCar, syncCarMesh } from './vehicles.js';
import { clamp, randRange } from './util.js';

export class PoliceManager {
  constructor(scene, city, rng, hooks) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.hooks = hooks; // { onBusted(), onWanted(level) }
    this.wanted = 0;
    this.cars = [];
    this.quietT = 0; // seconds since the last crime
    this.coolT = 0; // cooldown countdown before a star drops
    this.bustedT = 0; // seconds a cop has been right on top of the player
    this.flashT = 0;
  }

  addCrime(kind) {
    const before = this.wanted;
    if (kind === 'hit-ped') this.wanted = clamp(this.wanted + 2, 0, 5);
    else if (kind === 'steal') this.wanted = clamp(this.wanted + 1, 0, 5);
    else if (kind === 'shoot') this.wanted = clamp(this.wanted + 1, 0, 5);
    else if (kind === 'ram-police') this.wanted = clamp(this.wanted + 1, 0, 5);
    else this.wanted = clamp(this.wanted + 1, 0, 5);
    this.quietT = 0;
    this.coolT = 0;
    if (this.wanted !== before) this.hooks.onWanted(this.wanted);
  }

  setWanted(n) {
    this.wanted = clamp(n, 0, 5);
    this.quietT = 0;
    this.coolT = 0;
    this.hooks.onWanted(this.wanted);
  }

  spawnPolice() {
    const p = this.city.randomRoadPoint(this.rng);
    const mesh = makeCarMesh(0x111111, true);
    this.scene.add(mesh);
    const car = makeCarState(p.x, p.z, 0);
    car.mesh = mesh;
    car.police = true;
    this.cars.push(car);
    return car;
  }

  removePolice(car) {
    this.scene.remove(car.mesh);
    this.cars = this.cars.filter((c) => c !== car);
  }

  update(dt, player, audio) {
    this.quietT += dt;
    this.flashT += dt;
    // Match the number of police cars to the wanted level (max 5).
    const want = this.wanted;
    while (this.cars.length < want) this.spawnPolice();
    while (this.cars.length > want) this.removePolice(this.cars[this.cars.length - 1]);
    // Siren while any police are out.
    if (audio) audio.setSiren(this.cars.length > 0);

    // Cool down: no crime for 25 s and no cop nearby -> lose a star.
    let nearestCop = Infinity;
    for (const cop of this.cars) {
      nearestCop = Math.min(nearestCop, Math.hypot(cop.x - player.x, cop.z - player.z));
    }
    if (this.wanted > 0 && this.quietT > 25 && nearestCop > 55) {
      this.coolT += dt;
      if (this.coolT > 12) {
        this.wanted -= 1;
        this.coolT = 0;
        this.quietT = 0;
        this.hooks.onWanted(this.wanted);
      }
    } else {
      this.coolT = 0;
    }

    // Pursuit: each cop steers toward the player and rams.
    const aggression = 0.6 + this.wanted * 0.22;
    for (const cop of this.cars) {
      const dx = player.x - cop.x, dz = player.z - cop.z;
      const dist = Math.hypot(dx, dz) || 1;
      const wantHeading = Math.atan2(dx, dz);
      let dh = wantHeading - cop.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      const steer = clamp(dh * 1.6, -1, 1);
      const throttle = dist > 4 ? 1 : 0.3;
      const before = { x: cop.x, z: cop.z };
      stepCar(cop, { throttle, steer }, dt, (pos, r) => this.city.collideCircle(pos, r), null);
      // Ram: if the cop hits the player's car, shove + damage it.
      if (dist < 3.4) {
        if (player.inCar) {
          player.carSpeed *= 0.86;
          player.health = Math.max(0, player.health - 6 * dt * aggression);
          if (this.rng() < dt * 0.5) this.hooks.onCrime && this.hooks.onCrime('ram-police');
        } else if (dist < 2.6) {
          this.bustedT += dt;
          if (this.bustedT > 2.5) {
            this.bustedT = 0;
            this.hooks.onBusted();
          }
        }
      } else {
        this.bustedT = Math.max(0, this.bustedT - dt * 2);
      }
      // Flash the light bar red/blue.
      if (cop.mesh.userData.flashers) {
        const phase = Math.floor(this.flashT * 4) % 2 === 0;
        cop.mesh.userData.flashers[0].material.color.setHex(phase ? 0xff2222 : 0x551111);
        cop.mesh.userData.flashers[1].material.color.setHex(phase ? 0x111155 : 0x2244ff);
      }
      syncCarMesh(cop);
      // A cop that gets stuck far behind respawns closer (keeps chases alive).
      if (dist > 190) {
        const p = this.city.randomRoadPoint(this.rng);
        cop.x = player.x + randRange(this.rng, -70, 70);
        cop.z = player.z + randRange(this.rng, -70, 70);
        cop.speed = 0;
      }
    }
  }
}
