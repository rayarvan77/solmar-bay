// Solmar Bay — pedestrians. They stroll the sidewalks, wander at corners,
// flee from speeding cars and gunfire, and fall over (briefly) when hit.
// Hitting one is a crime: the caller is told through onCrime('hit-ped').
import * as THREE from 'three';
import { randRange, randInt, pick, clamp } from './util.js';

const SHIRTS = [0xc94f4f, 0x4f7ec9, 0x53a05a, 0xd8b13c, 0x8a5fc9, 0xd8d8d8, 0x3c3c46, 0xc97b4f];
const SKINS = [0xe8b98a, 0xc98d5f, 0x8a5a3b, 0xf0c8a0];

function makePedMesh(rng) {
  const g = new THREE.Group();
  const shirt = pick(rng, SHIRTS);
  const skin = pick(rng, SKINS);
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.85, 0.34),
    new THREE.MeshLambertMaterial({ color: shirt }),
  );
  body.position.y = 0.95;
  g.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 10, 8),
    new THREE.MeshLambertMaterial({ color: skin }),
  );
  head.position.y = 1.62;
  g.add(head);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x2e3138 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.55, 0.22), legMat);
  legL.position.set(-0.14, 0.28, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.14;
  g.add(legR);
  g.userData.legs = [legL, legR];
  g.userData.head = head;
  return g;
}

export class PedManager {
  constructor(scene, city, rng, hooks) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.hooks = hooks; // { onCrime(kind) }
    this.peds = [];
    this.spawnCount = 26;
  }

  spawnAll() {
    for (let i = 0; i < this.spawnCount; i++) this.spawnOne(true);
  }

  spawnOne(anywhere) {
    const rng = this.rng;
    const p = this.city.randomSidewalkPoint(rng);
    const mesh = makePedMesh(rng);
    mesh.position.set(p.x, 0, p.z);
    this.scene.add(mesh);
    const ped = {
      mesh,
      x: p.x, z: p.z,
      heading: randRange(rng, 0, Math.PI * 2),
      speed: randRange(rng, 0.8, 1.6),
      state: 'walk', // walk | flee | down
      stateT: 0,
      walkPhase: randRange(rng, 0, Math.PI * 2),
      target: null,
    };
    this.pickWalkTarget(ped);
    this.peds.push(ped);
    return ped;
  }

  pickWalkTarget(ped) {
    // Walk to another sidewalk point a block or two away.
    const p = this.city.randomSidewalkPoint(this.rng);
    ped.target = p;
    ped.heading = Math.atan2(p.x - ped.x, p.z - ped.z);
  }

  // A car (or the player) hit this ped.
  knockDown(ped, fromX, fromZ) {
    if (ped.state === 'down') return;
    ped.state = 'down';
    ped.stateT = 0;
    ped.mesh.rotation.x = -Math.PI / 2;
    ped.mesh.position.y = 0.25;
    const dx = ped.x - fromX, dz = ped.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    ped.x += (dx / d) * 1.5;
    ped.z += (dz / d) * 1.5;
    this.hooks.onCrime('hit-ped');
  }

  scare(x, z, radius) {
    for (const ped of this.peds) {
      if (ped.state !== 'walk') continue;
      const d = Math.hypot(ped.x - x, ped.z - z);
      if (d < radius) {
        ped.state = 'flee';
        ped.stateT = 0;
        ped.heading = Math.atan2(ped.x - x, ped.z - z);
        ped.speed = 3.4;
      }
    }
  }

  update(dt, player, cars) {
    for (const ped of this.peds) {
      ped.stateT += dt;
      if (ped.state === 'down') {
        if (ped.stateT > 14) {
          // Get up somewhere else and walk on.
          const p = this.city.randomSidewalkPoint(this.rng);
          ped.x = p.x; ped.z = p.z;
          ped.mesh.rotation.x = 0;
          ped.mesh.position.y = 0;
          ped.state = 'walk';
          ped.speed = randRange(this.rng, 0.8, 1.6);
          this.pickWalkTarget(ped);
        }
        continue;
      }
      if (ped.state === 'flee' && ped.stateT > 4) {
        ped.state = 'walk';
        ped.speed = randRange(this.rng, 0.8, 1.6);
        this.pickWalkTarget(ped);
      }
      // Step toward the walk target; pick a new one on arrival.
      const tx = ped.target ? ped.target.x : ped.x;
      const tz = ped.target ? ped.target.z : ped.z;
      const dx = tx - ped.x, dz = tz - ped.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.2) {
        this.pickWalkTarget(ped);
      } else {
        const want = Math.atan2(dx, dz);
        let dh = want - ped.heading;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        ped.heading += clamp(dh, -2.2 * dt, 2.2 * dt);
        ped.x += Math.sin(ped.heading) * ped.speed * dt;
        ped.z += Math.cos(ped.heading) * ped.speed * dt;
      }
      // A fast car nearby makes peds scatter.
      if (player.inCar && player.carSpeed > 6) {
        const d = Math.hypot(ped.x - player.x, ped.z - player.z);
        if (d < 7) this.scare(player.x, player.z, 8);
      }
      // Walk-cycle leg swing.
      ped.walkPhase += dt * ped.speed * 5;
      const swing = Math.sin(ped.walkPhase) * 0.45;
      ped.mesh.userData.legs[0].rotation.x = swing;
      ped.mesh.userData.legs[1].rotation.x = -swing;
      ped.mesh.position.set(ped.x, 0, ped.z);
      ped.mesh.rotation.y = ped.heading;
    }
    // Player car running a ped over.
    if (player.inCar && Math.abs(player.carSpeed) > 3) {
      for (const ped of this.peds) {
        if (ped.state === 'down') continue;
        const d = Math.hypot(ped.x - player.x, ped.z - player.z);
        if (d < 1.6) this.knockDown(ped, player.x, player.z);
      }
    }
  }

  // Nearest standing ped within range of a point (for punching / shooting).
  nearest(x, z, range) {
    let best = null, bd = range;
    for (const ped of this.peds) {
      if (ped.state === 'down') continue;
      const d = Math.hypot(ped.x - x, ped.z - z);
      if (d < bd) { bd = d; best = ped; }
    }
    return best;
  }
}
