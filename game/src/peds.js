// Solmar Bay — pedestrians: sidewalk walkers who flee crimes, plus mission enforcers.
import * as THREE from 'three';
import { randRange, pick, dist2d } from './util.js';
import { CITY_HALF, GRID } from './city.js';

const SHIRTS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c, 0xecf0f1, 0x34495e];
const SKINS = [0xf1c27d, 0xe0ac69, 0x8d5524, 0xffdbac, 0xc68642];

export function makePersonMesh(shirt, skin, hostile) {
  const group = new THREE.Group();
  const legMat = new THREE.MeshLambertMaterial({ color: hostile ? 0x1a1a1a : 0x2c3e50 });
  for (const lx of [-0.14, 0.14]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.8, 0.22), legMat);
    leg.position.set(lx, 0.4, 0);
    group.add(leg);
  }
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.75, 0.36),
    new THREE.MeshLambertMaterial({ color: shirt }),
  );
  body.position.y = 1.18;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 10, 8),
    new THREE.MeshLambertMaterial({ color: skin }),
  );
  head.position.y = 1.82;
  group.add(head);
  const armMat = new THREE.MeshLambertMaterial({ color: skin });
  for (const ax of [-0.4, 0.4]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 0.16), armMat);
    arm.position.set(ax, 1.2, 0);
    group.add(arm);
  }
  return group;
}

export class Ped {
  constructor(mesh, pos) {
    this.mesh = mesh;
    this.pos = pos;
    this.heading = 0;
    this.speed = 1.4;
    this.state = 'walk';   // walk | flee | fight | dead
    this.health = 3;
    this.fleeFrom = null;
    this.walkTarget = null;
    this.attackCooldown = 0;
  }

  syncMesh() {
    this.mesh.position.set(this.pos.x, 0, this.pos.z);
    this.mesh.rotation.y = this.heading;
    // Simple walk bob.
    const t = performance.now() * 0.008;
    this.mesh.position.y = this.state === 'walk' ? Math.abs(Math.sin(t)) * 0.04 : 0;
  }
}

export class PedSystem {
  constructor(scene, city, rng) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.peds = [];
    this.enforcers = [];
    for (let i = 0; i < 26; i++) this.spawnPed();
  }

  _roadLine(k) {
    return -CITY_HALF + k * 56;
  }

  randomSidewalkPoint() {
    const k = Math.floor(this.rng() * (GRID + 1));
    const along = randRange(this.rng, -CITY_HALF + 10, CITY_HALF - 10);
    const side = this.rng() < 0.5 ? -1 : 1;
    const off = (14 / 2 + 2) * side;
    if (this.rng() < 0.5) return new THREE.Vector3(along, 0, this._roadLine(k) + off);
    return new THREE.Vector3(this._roadLine(k) + off, 0, along);
  }

  spawnPed() {
    const pos = this.randomSidewalkPoint();
    const mesh = makePersonMesh(pick(this.rng, SHIRTS), pick(this.rng, SKINS), false);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    const ped = new Ped(mesh, pos);
    ped.heading = this.rng() * Math.PI * 2;
    ped.walkTarget = this.randomSidewalkPoint();
    ped.speed = randRange(this.rng, 1.0, 1.9);
    this.peds.push(ped);
    return ped;
  }

  spawnEnforcer(pos) {
    const mesh = makePersonMesh(0x8b0000, pick(this.rng, SKINS), true);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    const ped = new Ped(mesh, pos.clone());
    ped.state = 'fight';
    ped.health = 4;
    ped.speed = 3.4;
    this.enforcers.push(ped);
    this.peds.push(ped);
    return ped;
  }

  // Everyone nearby runs from a crime at `point`.
  scareNearby(point, radius) {
    for (const ped of this.peds) {
      if (ped.state === 'dead' || ped.state === 'fight') continue;
      if (dist2d(ped.pos.x, ped.pos.z, point.x, point.z) < radius) {
        ped.state = 'flee';
        ped.fleeFrom = point.clone();
        ped.fleeTimer = 4;
      }
    }
  }

  nearest(pos, maxDist, includeFighters) {
    let best = null, bestD = maxDist;
    for (const ped of this.peds) {
      if (ped.state === 'dead') continue;
      if (!includeFighters && ped.state === 'fight') continue;
      const d = dist2d(ped.pos.x, ped.pos.z, pos.x, pos.z);
      if (d < bestD) { bestD = d; best = ped; }
    }
    return best;
  }

  update(dt, playerPos) {
    for (const ped of this.peds) {
      if (ped.state === 'dead') continue;
      ped.attackCooldown = Math.max(0, ped.attackCooldown - dt);
      if (ped.state === 'flee') {
        ped.fleeTimer -= dt;
        if (ped.fleeTimer <= 0) { ped.state = 'walk'; ped.walkTarget = this.randomSidewalkPoint(); }
        else {
          const dx = ped.pos.x - ped.fleeFrom.x, dz = ped.pos.z - ped.fleeFrom.z;
          const len = Math.hypot(dx, dz) || 1;
          ped.heading = Math.atan2(dx / len, dz / len);
          ped.pos.x += (dx / len) * 4.5 * dt;
          ped.pos.z += (dz / len) * 4.5 * dt;
        }
      } else if (ped.state === 'fight') {
        const d = dist2d(ped.pos.x, ped.pos.z, playerPos.x, playerPos.z);
        const dx = playerPos.x - ped.pos.x, dz = playerPos.z - ped.pos.z;
        const len = Math.hypot(dx, dz) || 1;
        ped.heading = Math.atan2(dx / len, dz / len);
        if (d > 1.4) {
          ped.pos.x += (dx / len) * ped.speed * dt;
          ped.pos.z += (dz / len) * ped.speed * dt;
        }
      } else {
        // Walk toward the current target, pick a new one on arrival.
        if (!ped.walkTarget || dist2d(ped.pos.x, ped.pos.z, ped.walkTarget.x, ped.walkTarget.z) < 2) {
          ped.walkTarget = this.randomSidewalkPoint();
        }
        const dx = ped.walkTarget.x - ped.pos.x, dz = ped.walkTarget.z - ped.pos.z;
        const len = Math.hypot(dx, dz) || 1;
        ped.heading = Math.atan2(dx / len, dz / len);
        ped.pos.x += (dx / len) * ped.speed * dt;
        ped.pos.z += (dz / len) * ped.speed * dt;
      }
      // Keep inside the map and out of buildings.
      ped.pos.x = Math.max(-CITY_HALF - 20, Math.min(CITY_HALF + 20, ped.pos.x));
      ped.pos.z = Math.max(-CITY_HALF - 20, Math.min(CITY_HALF + 60, ped.pos.z));
      this.city.collideCircle(ped.pos, 0.5);
      ped.syncMesh();
    }
  }

  removeDead() {
    for (let i = this.peds.length - 1; i >= 0; i--) {
      const ped = this.peds[i];
      if (ped.state === 'dead') {
        this.scene.remove(ped.mesh);
        this.peds.splice(i, 1);
        const ei = this.enforcers.indexOf(ped);
        if (ei >= 0) this.enforcers.splice(ei, 1);
      }
    }
  }
}
