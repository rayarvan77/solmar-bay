// Solmar Bay — cars: meshes, parked cars, traffic AI, arcade driving physics.
import * as THREE from 'three';
import { clamp, randRange, pick, angleApproach, angleWrap } from './util.js';
import { CITY_HALF, GRID } from './city.js';

const CAR_COLORS = [0xc0392b, 0x2471a3, 0xf1c40f, 0xecf0f1, 0x2c3e50, 0x8e44ad, 0x16a085, 0xe67e22, 0x95a5a6, 0x7f8c8d];
const TAXI_COLOR = 0xf7dc6f;

export function makeCarMesh(color, isPolice) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: isPolice ? 0x1a1a1a : color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), bodyMat);
  body.position.y = 0.55;
  group.add(body);
  const cabinMat = new THREE.MeshLambertMaterial({ color: isPolice ? 0xecf0f1 : 0x1c2833 });
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.0), cabinMat);
  cabin.position.set(0, 1.1, -0.2);
  group.add(cabin);
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(1.72, 0.4, 0.5),
    new THREE.MeshLambertMaterial({ color: 0x9fd8ff }),
  );
  glass.position.set(0, 1.08, 0.85);
  group.add(glass);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  group.userData.wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.36, wz);
    group.add(wheel);
    group.userData.wheels.push(wheel);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const hx of [-0.7, 0.7]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), lightMat);
    head.position.set(hx, 0.6, 2.21);
    group.add(head);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
  for (const hx of [-0.7, 0.7]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), tailMat);
    tail.position.set(hx, 0.6, -2.21);
    group.add(tail);
  }
  if (isPolice) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.16, 0.5), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    bar.position.set(0, 1.45, -0.2);
    group.add(bar);
    const red = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    red.position.set(-0.35, 1.58, -0.2);
    group.add(red);
    const blue = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0x0044ff }));
    blue.position.set(0.35, 1.58, -0.2);
    group.add(blue);
    group.userData.sirenRed = red;
    group.userData.sirenBlue = blue;
  }
  return group;
}

export class Car {
  constructor(mesh, opts) {
    this.mesh = mesh;
    this.pos = mesh.position;
    this.heading = opts.heading || 0;
    this.speed = 0;
    this.steer = 0;
    this.isPolice = !!opts.isPolice;
    this.isTraffic = !!opts.isTraffic;
    this.isParked = !!opts.isParked;
    this.axis = opts.axis || 'z';   // traffic: road axis it follows
    this.dir = opts.dir || 1;
    this.lane = opts.lane || 3.5;
    this.cruise = opts.cruise || 10;
    this.color = opts.color || 0x888888;
  }

  syncMesh() {
    this.mesh.position.set(this.pos.x, 0, this.pos.z);
    this.mesh.rotation.y = this.heading;
    const spin = this.speed * 0.016 * 2.4;
    for (const w of this.mesh.userData.wheels || []) w.rotation.x += spin;
  }
}

export class TrafficSystem {
  constructor(scene, city, rng) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.cars = [];
    this.parked = [];
    this._spawnTraffic(16);
    this._spawnParked(14);
  }

  _roadLine(k) {
    return -CITY_HALF + k * 56;
  }

  _spawnTraffic(n) {
    for (let i = 0; i < n; i++) {
      const k = Math.floor(this.rng() * (GRID + 1));
      const along = randRange(this.rng, -CITY_HALF + 20, CITY_HALF - 20);
      const lane = this.rng() < 0.5 ? -3.5 : 3.5;
      const horizontal = this.rng() < 0.5;
      const color = this.rng() < 0.12 ? TAXI_COLOR : pick(this.rng, CAR_COLORS);
      const mesh = makeCarMesh(color, false);
      const pos = horizontal
        ? new THREE.Vector3(along, 0, this._roadLine(k) + lane)
        : new THREE.Vector3(this._roadLine(k) + lane, 0, along);
      mesh.position.copy(pos);
      this.scene.add(mesh);
      const heading = horizontal ? (lane > 0 ? Math.PI / 2 : -Math.PI / 2) : (lane > 0 ? 0 : Math.PI);
      const car = new Car(mesh, {
        heading, axis: horizontal ? 'x' : 'z', dir: lane > 0 ? 1 : -1,
        lane, cruise: randRange(this.rng, 8, 13), isTraffic: true, color,
      });
      car.speed = car.cruise;
      this.cars.push(car);
    }
  }

  _spawnParked(n) {
    for (let i = 0; i < n; i++) {
      const k = Math.floor(this.rng() * (GRID + 1));
      const along = randRange(this.rng, -CITY_HALF + 20, CITY_HALF - 20);
      const horizontal = this.rng() < 0.5;
      const color = pick(this.rng, CAR_COLORS);
      const mesh = makeCarMesh(color, false);
      const edge = (this.rng() < 0.5 ? -1 : 1) * 5.6;
      const pos = horizontal
        ? new THREE.Vector3(along, 0, this._roadLine(k) + edge)
        : new THREE.Vector3(this._roadLine(k) + edge, 0, along);
      mesh.position.copy(pos);
      this.scene.add(mesh);
      const heading = horizontal ? (edge > 0 ? Math.PI / 2 : -Math.PI / 2) : (edge > 0 ? 0 : Math.PI);
      const car = new Car(mesh, { heading, isParked: true, color });
      car.syncMesh();
      this.parked.push(car);
    }
  }

  nearestParked(pos, maxDist) {
    let best = null, bestD = maxDist;
    for (const car of this.parked) {
      const d = Math.hypot(car.pos.x - pos.x, car.pos.z - pos.z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  update(dt, playerPos) {
    for (const car of this.cars) {
      // Drive along the current road axis; at intersections sometimes turn.
      const speed = car.cruise;
      let x = car.pos.x, z = car.pos.z;
      if (car.axis === 'x') x += car.dir * speed * dt;
      else z += car.dir * speed * dt;
      // Near an intersection centre? maybe turn.
      const line = car.axis === 'x' ? z : x;
      const nearest = Math.round((line + CITY_HALF) / 56) * 56 - CITY_HALF;
      const along = car.axis === 'x' ? x : z;
      const alongLine = Math.round((along + CITY_HALF) / 56) * 56 - CITY_HALF;
      if (Math.abs(along - alongLine) < 1.2 && this.rng() < 0.35) {
        car.axis = car.axis === 'x' ? 'z' : 'x';
        car.dir = this.rng() < 0.5 ? 1 : -1;
        car.lane = car.dir > 0 ? 3.5 : -3.5;
        if (car.axis === 'x') { z = nearest; x = alongLine; }
        else { x = nearest; z = alongLine; }
        car.heading = car.axis === 'x' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? 0 : Math.PI);
      }
      car.pos.set(x, 0, z);
      // Wrap around the city edge.
      if (car.pos.x > CITY_HALF + 10) car.pos.x = -CITY_HALF - 10;
      if (car.pos.x < -CITY_HALF - 10) car.pos.x = CITY_HALF + 10;
      if (car.pos.z > CITY_HALF + 10) car.pos.z = -CITY_HALF - 10;
      if (car.pos.z < -CITY_HALF - 10) car.pos.z = CITY_HALF + 10;
      car.syncMesh();
    }
    void playerPos;
  }
}

// Arcade driving for the car the player is in. Returns collision info.
export function driveCar(car, input, dt, city) {
  const maxSpeed = 40, maxReverse = 12, accel = 16, brake = 30;
  const forward = input.forward, back = input.back;
  if (forward) car.speed += accel * dt;
  else if (back) {
    if (car.speed > 0.5) car.speed -= brake * dt;
    else car.speed -= accel * 0.6 * dt;
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 8 * dt);
  }
  car.speed = clamp(car.speed, -maxReverse, maxSpeed);
  const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const steerAmount = 0.55 * clamp(Math.abs(car.speed) / 10, 0.25, 1);
  car.steer = angleApproach(car.steer, steerTarget * steerAmount, dt * 4);
  const moving = car.speed !== 0;
  if (moving) {
    car.heading += car.steer * (car.speed / maxSpeed) * 2.4 * dt * Math.sign(car.speed);
  }
  const nx = car.pos.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.pos.z + Math.cos(car.heading) * car.speed * dt;
  const test = new THREE.Vector3(nx, 0, nz);
  let hit = false;
  // Try full move, then slide along each axis.
  if (!city.collideCircle(test, 2.0)) {
    car.pos.set(nx, 0, nz);
  } else {
    hit = true;
    const tx = new THREE.Vector3(nx, 0, car.pos.z);
    const tz = new THREE.Vector3(car.pos.x, 0, nz);
    if (!city.collideCircle(tx, 2.0)) car.pos.set(nx, 0, car.pos.z);
    else if (!city.collideCircle(tz, 2.0)) car.pos.set(car.pos.x, 0, nz);
    car.speed *= 0.4;
  }
  // Keep inside the map.
  car.pos.x = clamp(car.pos.x, -CITY_HALF - 24, CITY_HALF + 24);
  car.pos.z = clamp(car.pos.z, -CITY_HALF - 24, CITY_HALF + 64);
  car.syncMesh();
  return { hit };
}

export function carForward(car) {
  return new THREE.Vector3(Math.sin(car.heading), 0, Math.cos(car.heading));
}
