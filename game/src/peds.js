// Solmar Bay — pedestrians: simple walkers that stroll along the sidewalks
// (the edges of the blocks), turn at corners, and flee when the player
// gets violent nearby. A ped is a small capsule-ish figure built from
// boxes; hitting one at speed counts as a crime.

import * as THREE from '../vendor/three.module.min.js';
import { blockCentres, CITY } from './city.js';
import { clamp } from './util.js';

const SHIRTS = [0xd84a4a, 0x4a7ad8, 0x4ad87a, 0xd8c84a, 0x9a4ad8, 0xe0e0e0, 0x2a2a2a, 0xd87a4a];
const PANTS = [0x2a3a5a, 0x3a2a2a, 0x2a4a3a, 0x444444];

export function makePedMesh(shirt, pants) {
  const group = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xd8a080 });

  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.7, 0.2), pantsMat);
  legs.position.y = 0.35;
  group.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.28), shirtMat);
  torso.position.y = 1.0;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), skinMat);
  head.position.y = 1.5;
  group.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.34), new THREE.MeshLambertMaterial({ color: 0x1a1210 }));
  hair.position.y = 1.68;
  group.add(hair);
  return group;
}

export class Ped {
  constructor(scene, x, z, heading, shirt, pants) {
    this.mesh = makePedMesh(shirt, pants);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
    this.pos = this.mesh.position;
    this.heading = heading;
    this.speed = 1.1 + Math.random() * 0.9;
    this.state = 'walk'; // walk | flee | down
    this.downTimer = 0;
    this.fleeTimer = 0;
    this.turnTimer = 1 + Math.random() * 3;
    this.radius = 0.5;
    this.walkPhase = Math.random() * Math.PI * 2;
  }

  // Wander along sidewalk edges: peds walk parallel to a block edge and
  // turn at random intervals, staying on the pavement ring.
  update(dt, playerPos, time) {
    if (this.state === 'down') {
      this.downTimer -= dt;
      this.mesh.rotation.x = -Math.PI / 2 + 0.15;
      this.mesh.position.y = 0.25;
      if (this.downTimer <= 0) {
        this.state = 'walk';
        this.mesh.rotation.x = 0;
        this.mesh.position.y = 0;
      }
      return;
    }
    if (this.state === 'flee') {
      this.fleeTimer -= dt;
      const away = Math.atan2(this.pos.x - playerPos.x, this.pos.z - playerPos.z);
      this.heading = away;
      this.pos.x += Math.sin(away) * 3.4 * dt;
      this.pos.z += Math.cos(away) * 3.4 * dt;
      if (this.fleeTimer <= 0) this.state = 'walk';
    } else {
      this.turnTimer -= dt;
      if (this.turnTimer <= 0) {
        this.turnTimer = 2 + Math.random() * 4;
        // Turn left or right by 90 degrees.
        this.heading += (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 2);
      }
      this.pos.x += Math.sin(this.heading) * this.speed * dt;
      this.pos.z += Math.cos(this.heading) * this.speed * dt;
      // Keep peds inside the city; bounce off the edge.
      const lim = CITY.half + 4;
      if (this.pos.x > lim || this.pos.x < -lim || this.pos.z > lim || this.pos.z < -lim) {
        this.heading += Math.PI;
        this.pos.x = clamp(this.pos.x, -lim, lim);
        this.pos.z = clamp(this.pos.z, -lim, lim);
      }
    }
    this.mesh.rotation.y = this.heading;
    this.walkPhase += dt * (this.state === 'flee' ? 14 : 7);
    // Little bob while walking.
    this.mesh.position.y = this.state === 'walk' || this.state === 'flee' ? Math.abs(Math.sin(this.walkPhase)) * 0.06 : 0;
    void time;
  }

  knockDown() {
    this.state = 'down';
    this.downTimer = 6;
  }

  scare(playerPos) {
    if (this.state !== 'down') {
      this.state = 'flee';
      this.fleeTimer = 4;
      void playerPos;
    }
  }
}

export function spawnPeds(scene, count, rng) {
  const peds = [];
  const centres = blockCentres();
  for (let i = 0; i < count; i++) {
    const c = centres[Math.floor(rng() * centres.length)];
    // Stand on the sidewalk ring around a block.
    const edge = Math.floor(rng() * 4);
    const off = (rng() * 2 - 1) * 9;
    const ring = CITY.blockSize / 2 + 1.2;
    let x = c.x;
    let z = c.z;
    if (edge === 0) { x = c.x + off; z = c.z - ring; }
    if (edge === 1) { x = c.x + off; z = c.z + ring; }
    if (edge === 2) { x = c.x - ring; z = c.z + off; }
    if (edge === 3) { x = c.x + ring; z = c.z + off; }
    const heading = rng() * Math.PI * 2;
    peds.push(new Ped(scene, x, z, heading, SHIRTS[Math.floor(rng() * SHIRTS.length)], PANTS[Math.floor(rng() * PANTS.length)]));
  }
  return peds;
}
