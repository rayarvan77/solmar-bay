// Cars for Solmar Bay: mesh builder, traffic AI, parked cars and the
// player's simple arcade driving physics.
import * as THREE from '../vendor/three.module.min.js';
import { clamp, mulberry32 } from './util.js';

const WHEEL_R = 0.38;

export function makeCarMesh(color) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x223344 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.65, 4.3), bodyMat);
  body.position.y = 0.55;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.1), glassMat);
  cabin.position.set(0, 1.15, -0.25);
  group.add(cabin);
  const bumperF = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.25, 0.3), darkMat);
  bumperF.position.set(0, 0.35, 2.2);
  group.add(bumperF);
  const bumperR = bumperF.clone();
  bumperR.position.z = -2.2;
  group.add(bumperR);

  // Headlights / taillights.
  const lightMat = new THREE.MeshLambertMaterial({ color: 0xfff6c0, emissive: 0x777744 });
  for (const sx of [-0.7, 0.7]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.08), lightMat);
    hl.position.set(sx, 0.62, 2.16);
    group.add(hl);
  }
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xaa1111, emissive: 0x550000 });
  for (const sx of [-0.7, 0.7]) {
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.08), tailMat);
    tl.position.set(sx, 0.62, -2.16);
    group.add(tl);
  }

  // Wheels: cylinder (axle along X) wrapped in a group that spins about X.
  const wheelGeo = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.3, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]]) {
    const holder = new THREE.Group();
    holder.position.set(wx, WHEEL_R, wz);
    const tyre = new THREE.Mesh(wheelGeo, wheelMat);
    tyre.rotation.z = Math.PI / 2;
    holder.add(tyre);
    group.add(holder);
    wheels.push(holder);
  }
  return { group, wheels, body };
}

export function makePoliceCarMesh() {
  const car = makeCarMesh(0xf2f2f2);
  const { group } = car;
  // Black doors stripe.
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(2.02, 0.3, 1.6),
    new THREE.MeshLambertMaterial({ color: 0x111111 }),
  );
  stripe.position.set(0, 0.62, -0.2);
  group.add(stripe);
  // Light bar: red left, blue right, emissive so they can flash.
  const redMat = new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0x880000 });
  const blueMat = new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x000088 });
  const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.7), redMat);
  red.position.set(-0.45, 1.6, -0.25);
  group.add(red);
  const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.7), blueMat);
  blue.position.set(0.45, 1.6, -0.25);
  group.add(blue);
  return { ...car, lights: { red, blue, redMat, blueMat } };
}

const TRAFFIC_COLORS = [0xc0392b, 0x2980b9, 0xf39c12, 0x27ae60, 0x8e44ad, 0xececec, 0x34495e, 0xd35400];

function nextRoadLineAhead(lines, v) {
  for (const c of lines) if (c > v + 0.01) return c;
  return null;
}
function prevRoadLineBehind(lines, v) {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i] < v - 0.01) return lines[i];
  }
  return null;
}

// Traffic cars drive on the road grid and turn at intersections.
export function createTraffic(scene, rng, city, count = 8) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    const color = TRAFFIC_COLORS[Math.floor(rng() * TRAFFIC_COLORS.length)];
    const mesh = makeCarMesh(color);
    const inter = city.randomIntersection(rng);
    // Head along a random axis from this intersection.
    const eastWest = rng() < 0.5;
    const dir = eastWest ? (rng() < 0.5 ? 0 : Math.PI) : (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
    const car = {
      ...mesh,
      x: inter.x,
      z: inter.z,
      heading: dir,
      speed: 0,
      cruise: 7 + rng() * 5,
      rng: mulberry32(1000 + i * 77),
    };
    car.group.position.set(car.x, 0, car.z);
    car.group.rotation.y = -car.heading + Math.PI / 2;
    scene.add(car.group);
    cars.push(car);
  }
  return cars;
}

function aheadOf(car, other) {
  const fx = Math.cos(car.heading);
  const fz = Math.sin(car.heading);
  const dx = other.x - car.x;
  const dz = other.z - car.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d < 0.01 || d > 9) return false;
  return (dx * fx + dz * fz) / d > 0.75;
}

export function updateTraffic(dt, cars, city) {
  for (const car of cars) {
    // Car-following: brake for a car ahead.
    let blocked = false;
    for (const other of cars) {
      if (other !== car && aheadOf(car, other)) { blocked = true; break; }
    }
    const target = blocked ? 0 : car.cruise;
    car.speed += clamp(target - car.speed, -14 * dt, 8 * dt);
    const step = car.speed * dt;
    const nx = car.x + Math.cos(car.heading) * step;
    const nz = car.z + Math.sin(car.heading) * step;
    // Did we cross the next intersection line on our axis?
    const east = Math.abs(Math.cos(car.heading)) > 0.5;
    let crossed = null;
    if (east) {
      const line = Math.cos(car.heading) > 0
        ? nextRoadLineAhead(city.roadLines, car.x)
        : prevRoadLineBehind(city.roadLines, car.x);
      if (line !== null && ((Math.cos(car.heading) > 0 && nx >= line) || (Math.cos(car.heading) < 0 && nx <= line))) crossed = line;
    } else {
      const line = Math.sin(car.heading) > 0
        ? nextRoadLineAhead(city.roadLines, car.z)
        : prevRoadLineBehind(city.roadLines, car.z);
      if (line !== null && ((Math.sin(car.heading) > 0 && nz >= line) || (Math.sin(car.heading) < 0 && nz <= line))) crossed = line;
    }
    if (crossed !== null) {
      // Snap to the intersection and pick a new direction.
      if (east) { car.x = crossed; car.z = Math.round(car.z); } else { car.z = crossed; car.x = Math.round(car.x); }
      const r = car.rng();
      if (r < 0.55) {
        // straight on
      } else if (r < 0.78) {
        car.heading += Math.PI / 2; // left
      } else {
        car.heading -= Math.PI / 2; // right
      }
      // Keep inside the city: at the edge, turn back.
      if (car.x > 165 || car.x < -165 || car.z > 165 || car.z < -165) {
        car.heading += Math.PI;
        car.x = clamp(car.x, -160, 160);
        car.z = clamp(car.z, -160, 160);
      }
    } else {
      car.x = nx;
      car.z = nz;
    }
    car.group.position.set(car.x, 0, car.z);
    car.group.rotation.y = -car.heading + Math.PI / 2;
    const spin = (car.speed * dt) / WHEEL_R;
    for (const w of car.wheels) w.rotation.x += spin;
  }
}

// Parked cars the player can steal, lined up along road edges.
export function createParkedCars(scene, rng, city, count = 4) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    const color = TRAFFIC_COLORS[Math.floor(rng() * TRAFFIC_COLORS.length)];
    const mesh = makeCarMesh(color);
    const inter = city.randomIntersection(rng);
    const eastWest = rng() < 0.5;
    const heading = eastWest ? (rng() < 0.5 ? 0 : Math.PI) : (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
    // Parked just off the road centre, on the road edge.
    const off = (rng() < 0.5 ? -1 : 1) * 3.1;
    const along = (rng() < 0.5 ? -1 : 1) * (6 + rng() * 8);
    let x = inter.x;
    let z = inter.z;
    if (eastWest) { x = inter.x + along; z = inter.z + off; }
    else { x = inter.x + off; z = inter.z + along; }
    const car = { ...mesh, x, z, heading, speed: 0, parked: true };
    car.group.position.set(x, 0, z);
    car.group.rotation.y = -heading + Math.PI / 2;
    scene.add(car.group);
    cars.push(car);
  }
  return cars;
}

// Arcade driving for the player's car. Returns an event string or null.
export function updatePlayerCar(dt, input, car, city, traffic, onEvent) {
  const ACCEL = 17;
  const BRAKE = 34;
  const MAX_SPEED = 36;
  const MAX_REVERSE = 9;
  if (input.up) car.speed += ACCEL * dt;
  else if (input.down) {
    if (car.speed > 0.5) car.speed -= BRAKE * dt;
    else car.speed -= ACCEL * 0.6 * dt;
  } else {
    // Drag + rolling resistance.
    car.speed -= car.speed * 0.55 * dt;
    if (Math.abs(car.speed) < 0.05) car.speed = 0;
  }
  car.speed = clamp(car.speed, -MAX_REVERSE, MAX_SPEED);
  const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  if (steer !== 0 && Math.abs(car.speed) > 0.4) {
    const rate = 2.1 * clamp(Math.abs(car.speed) / 10, 0.25, 1);
    car.heading += steer * rate * dt * Math.sign(car.speed);
  }
  const nx = car.x + Math.cos(car.heading) * car.speed * dt;
  const nz = car.z + Math.sin(car.heading) * car.speed * dt;
  let hit = false;
  if (city.collides(nx, car.z, 1.5)) {
    hit = true;
  } else {
    car.x = nx;
  }
  if (city.collides(car.x, nz, 1.5)) {
    hit = true;
  } else {
    car.z = nz;
  }
  if (hit) {
    if (Math.abs(car.speed) > 6) onEvent && onEvent('crash');
    car.speed *= -0.25;
  }
  // Bump into traffic cars.
  for (const other of traffic) {
    const dx = other.x - car.x;
    const dz = other.z - car.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < 4.4 * 4.4 && d2 > 0.01) {
      const d = Math.sqrt(d2);
      const push = (4.4 - d) / 2;
      car.x -= (dx / d) * push;
      car.z -= (dz / d) * push;
      if (Math.abs(car.speed) > 8) onEvent && onEvent('crash');
      car.speed *= 0.55;
    }
  }
  car.x = clamp(car.x, -172, 172);
  car.z = clamp(car.z, -172, 172);
  car.group.position.set(car.x, 0, car.z);
  car.group.rotation.y = -car.heading + Math.PI / 2;
  const spin = (car.speed * dt) / WHEEL_R;
  for (const w of car.wheels) w.rotation.x += spin;
  return null;
}
