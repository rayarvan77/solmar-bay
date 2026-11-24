// Solmar Bay — cars: mesh factory, arcade driving physics for the player,
// and simple traffic AI that follows the road grid. Cars are circles for
// collision (radius ~1.6) and slide along building walls via the city's
// collideCircle helper.

import * as THREE from '../vendor/three.module.min.js';
import { clampToMap, roadLines } from './city.js';
import { clamp as clampNum, randRange } from './util.js';

const CAR_COLORS = [0xc23b2e, 0x2e6ac2, 0xd8a020, 0x3a9a5a, 0x7a4a9a, 0xc0c8d0, 0x22262c, 0x8a5a2a, 0xe86a2a, 0x2a9a8a]; // last two: sunset orange + bay teal, round 3 palette

export function makeCarMesh(color, police = false) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: police ? 0xe8e8e8 : color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a2a3a });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x181a1e });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.3), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.1), glassMat);
  cabin.position.set(0, 1.1, -0.2);
  cabin.castShadow = true;
  group.add(cabin);

  if (police) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.2, 1.1), darkMat);
    stripe.position.set(0, 0.62, 0.4);
    group.add(stripe);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 0.5), darkMat);
    bar.position.set(0, 1.5, -0.2);
    group.add(bar);
    const red = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.2, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xff2222 })
    );
    red.position.set(-0.28, 1.62, -0.2);
    red.name = 'sirenRed';
    group.add(red);
    const blue = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.2, 0.5),
      new THREE.MeshBasicMaterial({ color: 0x2244ff })
    );
    blue.position.set(0.28, 1.62, -0.2);
    blue.name = 'sirenBlue';
    group.add(blue);
  }

  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111214 });
  for (const [wx, wz] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.38, wz);
    group.add(wheel);
  }

  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const hx of [-0.65, 0.65]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.08), headMat);
    lamp.position.set(hx, 0.6, 2.16);
    group.add(lamp);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff3020 });
  for (const tx of [-0.65, 0.65]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.08), tailMat);
    lamp.position.set(tx, 0.6, -2.16);
    group.add(lamp);
  }
  return group;
}

export class Car {
  constructor(scene, x, z, heading, color, police = false) {
    this.mesh = makeCarMesh(color, police);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
    this.pos = this.mesh.position; // alias: pos.x / pos.z are the world coords
    this.heading = heading;
    this.speed = 0;
    this.police = police;
    this.radius = 1.7;
    this.stolen = false;
    // Traffic AI state: which road axis/line the car follows and its direction.
    this.axis = 'x';
    this.line = 0;
    this.dir = 1;
    this.cruise = 7 + Math.random() * 4;
    this.wait = 0;
    this.turnCooldown = 0;
  }

  syncMesh() {
    this.mesh.position.x = this.pos.x;
    this.mesh.position.z = this.pos.z;
    this.mesh.rotation.y = this.heading;
  }

  // Arcade driving: forward/back with steering that scales with speed.
  drive(input, dt, colliders, onCrash) {
    const maxSpeed = 26;
    const maxReverse = 9;
    if (input.forward) this.speed += 15 * dt;
    if (input.back) this.speed -= 18 * dt;
    if (!input.forward && !input.back) {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 9 * dt);
    }
    this.speed = clampNum(this.speed, -maxReverse, maxSpeed);
    const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    const steerSign = this.speed >= 0 ? 1 : -1;
    this.heading += steer * 1.9 * dt * clampNum(Math.abs(this.speed) / 8, 0, 1) * steerSign;
    const nx = this.pos.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.pos.z + Math.cos(this.heading) * this.speed * dt;
    const beforeX = this.pos.x;
    const beforeZ = this.pos.z;
    this.pos.x = nx;
    this.pos.z = nz;
    clampToMap(this.pos, 4);
    this._resolveCollision(colliders, beforeX, beforeZ, onCrash);
    this.syncMesh();
  }

  _resolveCollision(colliders, beforeX, beforeZ, onCrash) {
    // Cheap AABB-circle resolve inlined here to avoid a circular import.
    let crashed = false;
    for (const b of colliders) {
      const cx = Math.max(b.minX, Math.min(this.pos.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(this.pos.z, b.maxZ));
      const dx = this.pos.x - cx;
      const dz = this.pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < this.radius * this.radius) {
        crashed = true;
        const impact = Math.abs(this.speed);
        this.pos.x = beforeX;
        this.pos.z = beforeZ;
        this.speed *= -0.25;
        if (impact > 6 && onCrash) onCrash(impact);
        break;
      }
    }
    return crashed;
  }
}

// Spawn parked/ambient traffic cars along the roads.
export function spawnTraffic(scene, count, colliders, rng) {
  const cars = [];
  const lines = roadLines();
  for (let i = 0; i < count; i++) {
    const horizontal = rng() < 0.5;
    const line = lines[Math.floor(rng() * lines.length)];
    const along = (rng() * 2 - 1) * 128;
    const dir = rng() < 0.5 ? 1 : -1;
    const color = CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)];
    const x = horizontal ? along : line;
    const z = horizontal ? line : along;
    const car = new Car(scene, x, z, horizontal ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : dir > 0 ? 0 : Math.PI, color);
    car.axis = horizontal ? 'x' : 'z';
    car.line = line;
    car.dir = dir;
    car.speed = car.cruise * (0.7 + rng() * 0.6);
    // Beachfront cruisers: about one car in seven takes it slow along the
    // bayfront roads, golden-hour traffic instead of commuter traffic.
    if (rng() < 0.15) {
      car.cruise = randRange(rng, 5, 7);
      car.speed = car.cruise;
    }
    cars.push(car);
  }
  return cars;
}

// One traffic step: follow the road, randomly turn at intersections,
// slow down for the car ahead on the same lane.
export function updateTraffic(cars, dt, time) {
  const lines = roadLines();
  for (const car of cars) {
    // Slow for a car ahead on the same road.
    let targetSpeed = car.cruise;
    for (const other of cars) {
      if (other === car) continue;
      if (other.axis !== car.axis || Math.abs(other.line - car.line) > 1) continue;
      const ahead = car.axis === 'x' ? (other.pos.x - car.pos.x) * car.dir : (other.pos.z - car.pos.z) * car.dir;
      const lateral = car.axis === 'x' ? Math.abs(other.pos.z - car.pos.z) : Math.abs(other.pos.x - car.pos.x);
      if (ahead > 0 && ahead < 9 && lateral < 2.5) {
        targetSpeed = Math.min(targetSpeed, Math.max(0, other.speed - 1.5));
      }
    }
    car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 1.5);

    const step = car.speed * dt * car.dir;
    if (car.axis === 'x') car.pos.x += step;
    else car.pos.z += step;

    // At an intersection, sometimes turn onto the crossing road (but not
    // twice in a row: a cooldown keeps cars from spinning in place).
    const along = car.axis === 'x' ? car.pos.x : car.pos.z;
    const cross = car.axis === 'x' ? car.pos.z : car.pos.x;
    car.turnCooldown = Math.max(0, (car.turnCooldown || 0) - dt);
    let nearest = null;
    let nearestD = Infinity;
    for (const l of lines) {
      const d = Math.abs(along - l);
      if (d < nearestD) {
        nearestD = d;
        nearest = l;
      }
    }
    if (nearest !== null && nearestD < 0.6 && Math.abs(cross - car.line) < 0.6 && car.turnCooldown <= 0) {
      // We are right on an intersection: snap to it and maybe turn.
      if (car.axis === 'x') car.pos.x = nearest;
      else car.pos.z = nearest;
      if (Math.random() < 0.28) {
        const turnLeft = Math.random() < 0.5;
        const newAxis = car.axis === 'x' ? 'z' : 'x';
        const newDir = turnLeft ? -car.dir : car.dir;
        // Heading when driving along +x is PI/2, along -x is -PI/2,
        // along +z is 0, along -z is PI.
        const headings = { x: { 1: Math.PI / 2, '-1': -Math.PI / 2 }, z: { 1: 0, '-1': Math.PI } };
        car.axis = newAxis;
        car.dir = newDir;
        car.line = nearest;
        car.heading = headings[newAxis][String(newDir)];
        car.turnCooldown = 2.5;
      }
    }

    // Wrap around the far edge so traffic never runs out.
    const lim = 138;
    if (car.axis === 'x' && (car.pos.x > lim || car.pos.x < -lim)) {
      car.pos.x = -Math.sign(car.pos.x) * lim;
    }
    if (car.axis === 'z' && (car.pos.z > lim || car.pos.z < -lim)) {
      car.pos.z = -Math.sign(car.pos.z) * lim;
    }
    car.syncMesh();
  }
  void time;
}
