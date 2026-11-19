// Solmar Bay — vehicles: a box-built car mesh, simple arcade driving physics
// shared by the player and traffic, and traffic AI that follows the street
// grid and turns at intersections.
import * as THREE from 'three';
import { randRange, randInt, pick, clamp } from './util.js';

const CAR_COLORS = [0xb03a2e, 0x2e5fa3, 0xd8c23c, 0x3c8a4f, 0xd8d8d8, 0x7a4fa3, 0x333333, 0xc97b2e, 0x4fa3a3];

// A car from boxes: body, cabin, four wheels, headlights. ~1.9 m wide, 4.4 m long.
export function makeCarMesh(color, police = false) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.62, 4.4), bodyMat);
  body.position.y = 0.55;
  g.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.55, 2.1),
    new THREE.MeshLambertMaterial({ color: police ? 0xf0f0f0 : 0x1c2733 }),
  );
  cabin.position.set(0, 1.1, -0.2);
  g.add(cabin);
  if (police) {
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(1.92, 0.2, 4.42),
      new THREE.MeshLambertMaterial({ color: 0x1a2f7a }),
    );
    stripe.position.y = 0.72;
    g.add(stripe);
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.16, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x222222 }),
    );
    bar.position.set(0, 1.45, -0.2);
    g.add(bar);
    const lightR = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.12, 0.3),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }),
    );
    lightR.position.set(-0.3, 1.55, -0.2);
    g.add(lightR);
    const lightB = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.12, 0.3),
      new THREE.MeshBasicMaterial({ color: 0x2244ff }),
    );
    lightB.position.set(0.3, 1.55, -0.2);
    g.add(lightB);
    g.userData.flashers = [lightR, lightB];
  }
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const wheels = [];
  for (const [wx, wz] of [[-0.85, 1.45], [0.85, 1.45], [-0.85, -1.45], [0.85, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.36, wz);
    g.add(w);
    wheels.push(w);
  }
  const lampGeo = new THREE.BoxGeometry(0.34, 0.14, 0.06);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const lx of [-0.6, 0.6]) {
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    lamp.position.set(lx, 0.62, 2.21);
    g.add(lamp);
  }
  g.userData.wheels = wheels;
  return g;
}

// Arcade car state. heading: radians, 0 = +Z. speed: m/s (negative = reverse).
export function makeCarState(x, z, heading) {
  return { x, z, heading, speed: 0, steer: 0, mesh: null };
}

// One physics step for a driven car. input: {throttle -1..1, steer -1..1}.
// collide(pos, r) pushes the car out of buildings. Returns collision info.
export function stepCar(car, input, dt, collide, onHit) {
  const maxSpeed = 34;
  const accel = 14;
  const brake = 26;
  const drag = 0.55;
  if (input.throttle > 0) car.speed += accel * input.throttle * dt;
  else if (input.throttle < 0) {
    if (car.speed > 0.5) car.speed -= brake * dt; // braking
    else car.speed -= accel * 0.55 * dt; // reversing
  }
  car.speed -= car.speed * drag * dt;
  car.speed = clamp(car.speed, -10, maxSpeed);
  if (Math.abs(car.speed) < 0.05 && input.throttle === 0) car.speed = 0;
  const steerTarget = clamp(input.steer, -1, 1) * 0.55 * clamp(Math.abs(car.speed) / 8, 0, 1);
  car.steer += (steerTarget - car.steer) * Math.min(1, dt * 8);
  car.heading += (car.steer * car.speed * dt) / 2.9;
  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  const before = { x: car.x, z: car.z };
  car.x = nx; car.z = nz;
  collide(car, 1.9);
  const hitWall = Math.hypot(car.x - before.x, car.z - before.z) <
    Math.hypot(nx - before.x, nz - before.z) - 0.001;
  if (hitWall) {
    const impact = Math.abs(car.speed);
    car.speed *= -0.25; // bounce back a little
    if (impact > 6 && onHit) onHit(impact);
  }
  return hitWall;
}

export function syncCarMesh(car) {
  if (!car.mesh) return;
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  const spin = car.speed * 0.016;
  for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
  car.mesh.userData.wheels[0].rotation.y = car.steer * 0.4;
  car.mesh.userData.wheels[1].rotation.y = car.steer * 0.4;
}

// ---- Traffic ------------------------------------------------------------
export class TrafficManager {
  constructor(scene, city, rng) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.cars = [];
  }

  spawnAll(count = 12) {
    for (let i = 0; i < count; i++) this.spawnOne();
  }

  spawnOne() {
    const rng = this.rng;
    const p = this.city.randomRoadPoint(rng);
    const horizontal = Math.abs(p.z - Math.round(p.z / 34) * 34) < 0.01 || rng() < 0.5;
    const heading = pick(rng, [0, Math.PI / 2, Math.PI, -Math.PI / 2]);
    const mesh = makeCarMesh(pick(rng, CAR_COLORS));
    this.scene.add(mesh);
    const car = makeCarState(p.x, p.z, heading);
    car.mesh = mesh;
    car.cruise = randRange(rng, 7, 11);
    car.waitT = 0;
    car.lastTurn = ''; // intersection key of the last turn, so a car turns once per crossing
    this.cars.push(car);
    return car;
  }

  // Steer a traffic car along the grid: keep to its street, turn at
  // intersections, slow down for the car ahead.
  update(dt, playerPos) {
    for (const car of this.cars) {
      // Car ahead on the same line?
      let blocked = false;
      for (const other of this.cars) {
        if (other === car) continue;
        const dx = other.x - car.x, dz = other.z - car.z;
        const fwd = Math.sin(car.heading) * dx + Math.cos(car.heading) * dz;
        const side = Math.abs(Math.cos(car.heading) * dx - Math.sin(car.heading) * dz);
        if (fwd > 0 && fwd < 9 && side < 2.2) { blocked = true; break; }
      }
      if (playerPos) {
        const dx = playerPos.x - car.x, dz = playerPos.z - car.z;
        const fwd = Math.sin(car.heading) * dx + Math.cos(car.heading) * dz;
        const side = Math.abs(Math.cos(car.heading) * dx - Math.sin(car.heading) * dz);
        if (fwd > 0 && fwd < 10 && side < 2.4) blocked = true;
      }
      const targetSpeed = blocked ? 0 : car.cruise;
      car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 1.6);
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      // At an intersection (near a street crossing), maybe turn — but only
      // once per crossing, or the car spins in place frame after frame.
      const nearX = this.nearestStreet(car.x);
      const nearZ = this.nearestStreet(car.z);
      const crossKey = `${nearX.street},${nearZ.street}`;
      if (nearX.dist < 1.2 && nearZ.dist < 1.2 && car.speed > 2 && car.lastTurn !== crossKey) {
        car.lastTurn = crossKey;
        if (this.rng() < 0.55) {
          const turn = pick(this.rng, [-Math.PI / 2, Math.PI / 2]);
          car.heading += turn;
          // Nudge onto the new street line so it does not drift.
          car.x = nearX.street + Math.sin(car.heading) * 0.4;
          car.z = nearZ.street + Math.cos(car.heading) * 0.4;
        }
      }
      // Keep inside the city: turn around at the edge.
      if (Math.abs(car.x) > this.city.half + 8 || Math.abs(car.z) > this.city.half + 8) {
        car.heading += Math.PI;
        car.x = Math.max(-this.city.half, Math.min(this.city.half, car.x));
        car.z = Math.max(-this.city.half, Math.min(this.city.half, car.z));
      }
      syncCarMesh(car);
    }
  }

  nearestStreet(v) {
    let best = this.city.streets[0], bd = Infinity;
    for (const s of this.city.streets) {
      const d = Math.abs(v - s);
      if (d < bd) { bd = d; best = s; }
    }
    return { street: best, dist: bd };
  }

  // Nearest traffic car to a point (for stealing / entering).
  nearest(x, z, range) {
    let best = null, bd = range;
    for (const car of this.cars) {
      const d = Math.hypot(car.x - x, car.z - z);
      if (d < bd) { bd = d; best = car; }
    }
    return best;
  }
}
