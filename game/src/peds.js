// Pedestrians for Solmar Bay: simple low-poly walkers on the sidewalks.
// They wander, flee from fast cars, and can be knocked down.
import * as THREE from '../vendor/three.module.min.js';
import { randRange, randInt, pick, dist } from './util.js';

const SHIRTS = [0xd35400, 0x2980b9, 0x27ae60, 0xe74c3c, 0x8e44ad, 0xf1c40f, 0xecf0f1, 0x16a085];
const SKINS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];

export function makePedMesh(rng) {
  const group = new THREE.Group();
  const shirt = pick(rng, SHIRTS);
  const skin = pick(rng, SKINS);
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.7, 0.32),
    new THREE.MeshLambertMaterial({ color: shirt }),
  );
  torso.position.y = 1.05;
  group.add(torso);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 10, 8),
    new THREE.MeshLambertMaterial({ color: skin }),
  );
  head.position.y = 1.62;
  group.add(head);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), legMat);
  legL.position.set(-0.15, 0.35, 0);
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.15;
  group.add(legR);
  const armMat = new THREE.MeshLambertMaterial({ color: shirt });
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.55, 0.14), armMat);
  armL.position.set(-0.36, 1.05, 0);
  group.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.36;
  group.add(armR);
  return { group, legL, legR, armL, armR };
}

// Sidewalk waypoint: on a road edge, offset 5.5 from a road centre line.
function sidewalkPoint(rng, city) {
  const line = city.roadLines[randInt(rng, 0, city.roadLines.length - 1)];
  const along = randRange(rng, -160, 160);
  const side = rng() < 0.5 ? -5.5 : 5.5;
  if (rng() < 0.5) return { x: line + side, z: along };
  return { x: along, z: line + side };
}

export function createPeds(scene, rng, city, count = 14) {
  const peds = [];
  for (let i = 0; i < count; i++) {
    const mesh = makePedMesh(rng);
    const p = sidewalkPoint(rng, city);
    const ped = {
      ...mesh,
      x: p.x,
      z: p.z,
      heading: rng() * Math.PI * 2,
      speed: randRange(rng, 1.0, 1.9),
      state: 'walk', // 'walk' | 'flee' | 'down'
      target: sidewalkPoint(rng, city),
      downTimer: 0,
      walkPhase: rng() * Math.PI * 2,
    };
    ped.group.position.set(ped.x, 0, ped.z);
    scene.add(ped.group);
    peds.push(ped);
  }
  return peds;
}

export function updatePeds(dt, peds, rng, city, danger) {
  // danger: {x, z, speed} of the player's car, or null when on foot.
  for (const ped of peds) {
    if (ped.state === 'down') {
      ped.downTimer -= dt;
      if (ped.downTimer <= 0) {
        ped.state = 'walk';
        ped.group.rotation.set(0, ped.heading, 0);
        ped.target = sidewalkPoint(rng, city);
      }
      continue;
    }
    // Flee a fast car nearby.
    let fleeing = false;
    if (danger && danger.speed > 7) {
      const d = dist(ped.x, ped.z, danger.x, danger.z);
      if (d < 9) {
        fleeing = true;
        ped.state = 'flee';
        ped.heading = Math.atan2(ped.z - danger.z, ped.x - danger.x);
      }
    }
    if (!fleeing && ped.state === 'flee') ped.state = 'walk';
    const speed = ped.state === 'flee' ? 4.2 : ped.speed;
    if (ped.state === 'walk') {
      const dx = ped.target.x - ped.x;
      const dz = ped.target.z - ped.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < 1.5) {
        ped.target = sidewalkPoint(rng, city);
      } else {
        ped.heading = Math.atan2(dz, dx);
      }
    }
    ped.x += Math.cos(ped.heading) * speed * dt;
    ped.z += Math.sin(ped.heading) * speed * dt;
    ped.x = Math.max(-170, Math.min(170, ped.x));
    ped.z = Math.max(-170, Math.min(170, ped.z));
    ped.group.position.set(ped.x, 0, ped.z);
    ped.group.rotation.y = -ped.heading + Math.PI / 2;
    // Walk cycle: swing legs and arms.
    ped.walkPhase += dt * speed * 4.5;
    const swing = Math.sin(ped.walkPhase) * 0.45;
    ped.legL.rotation.x = swing;
    ped.legR.rotation.x = -swing;
    ped.armL.rotation.x = -swing * 0.7;
    ped.armR.rotation.x = swing * 0.7;
  }
}

// Knock down every standing ped within `radius` of (x, z). Returns how many.
export function knockDownPeds(peds, x, z, radius) {
  let n = 0;
  for (const ped of peds) {
    if (ped.state === 'down') continue;
    if (dist(ped.x, ped.z, x, z) <= radius) {
      ped.state = 'down';
      ped.downTimer = 9;
      ped.group.rotation.set(0, ped.heading, Math.PI / 2);
      n++;
    }
  }
  return n;
}

// Nearest standing ped to (x, z) within maxDist, or null.
export function nearestPed(peds, x, z, maxDist) {
  let best = null;
  let bd = maxDist;
  for (const ped of peds) {
    if (ped.state === 'down') continue;
    const d = dist(ped.x, ped.z, x, z);
    if (d < bd) { bd = d; best = ped; }
  }
  return best;
}
