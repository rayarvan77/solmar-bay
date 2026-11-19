// Procedural Solmar Bay city: a 10x10 block grid with roads, buildings,
// sidewalks, parks, lamps and trees. Fully deterministic for a given seed.
import * as THREE from '../vendor/three.module.min.js';
import { randRange, randInt, pick } from './util.js';

export const BLOCK = 24;
export const ROAD = 8;
export const PITCH = 32;
export const GRID = 10;

const ROAD_LINES = [];
for (let i = 0; i <= GRID; i++) ROAD_LINES.push(-160 + i * PITCH);

const PALETTE = [
  0x8a7f72, 0x7a8ba0, 0xa08a7a, 0x6f7f6f, 0x9a9a8a,
  0x5f6a7a, 0xb09a6a, 0x746a5e, 0x6a7a8a, 0x8a6a72,
];
const ROOF = [0x4a4a4a, 0x5a4a3a, 0x3a4a4a, 0x6a5a4a];

function box(w, h, d, color, x, y, z) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color }),
  );
  m.position.set(x, y, z);
  return m;
}

export function buildCity(scene, rng) {
  const colliders = [];
  const group = new THREE.Group();
  group.name = 'city';

  // Base ground: dark green-grey so roads read as streets.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(430, 430),
    new THREE.MeshLambertMaterial({ color: 0x2f3a2e }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  group.add(ground);

  // Road strips (vertical + horizontal).
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x232323 });
  const dashMat = new THREE.MeshLambertMaterial({ color: 0xd8c33a });
  for (const c of ROAD_LINES) {
    const v = new THREE.Mesh(new THREE.PlaneGeometry(ROAD, 336), roadMat);
    v.rotation.x = -Math.PI / 2;
    v.position.set(c, 0, 0);
    group.add(v);
    const h = new THREE.Mesh(new THREE.PlaneGeometry(336, ROAD), roadMat);
    h.rotation.x = -Math.PI / 2;
    h.position.set(0, 0.001, c);
    group.add(h);
    // Centre dashes along each road.
    for (let t = -160; t <= 160; t += 16) {
      const d1 = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 4), dashMat);
      d1.rotation.x = -Math.PI / 2;
      d1.position.set(c, 0.01, t);
      group.add(d1);
      const d2 = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.6), dashMat);
      d2.rotation.x = -Math.PI / 2;
      d2.position.set(t, 0.011, c);
      group.add(d2);
    }
  }

  // Blocks: sidewalk slabs, buildings or parks.
  for (let bi = 0; bi < GRID; bi++) {
    for (let bj = 0; bj < GRID; bj++) {
      const cx = -144 + bi * PITCH;
      const cz = -144 + bj * PITCH;
      const isPark = rng() < 0.16;
      const slab = box(
        BLOCK, 0.4, BLOCK,
        isPark ? 0x3f6b3a : 0x6b6f6a,
        cx, 0.2, cz,
      );
      group.add(slab);
      if (isPark) {
        // A few trees on the park block.
        for (let k = 0; k < 3; k++) {
          const tx = cx + randRange(rng, -8, 8);
          const tz = cz + randRange(rng, -8, 8);
          const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.25, 0.35, 2.2, 6),
            new THREE.MeshLambertMaterial({ color: 0x5a4028 }),
          );
          trunk.position.set(tx, 1.5, tz);
          group.add(trunk);
          const top = new THREE.Mesh(
            new THREE.ConeGeometry(2.2, 4.5, 8),
            new THREE.MeshLambertMaterial({ color: 0x2f6b2f }),
          );
          top.position.set(tx, 4.6, tz);
          group.add(top);
        }
        continue;
      }
      // One or two buildings per block.
      const n = rng() < 0.45 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const w = randRange(rng, 9, n === 2 ? 10 : 18);
        const d = randRange(rng, 9, n === 2 ? 10 : 18);
        const h = randRange(rng, 6, 38);
        const ox = n === 2 ? (k === 0 ? -5.5 : 5.5) : 0;
        const oz = n === 2 ? (k === 0 ? -5.5 : 5.5) : 0;
        const bx = cx + ox + randRange(rng, -1.5, 1.5);
        const bz = cz + oz + randRange(rng, -1.5, 1.5);
        const b = box(w, h, d, pick(rng, PALETTE), bx, 0.4 + h / 2, bz);
        group.add(b);
        // Rooftop box and a window band for taller towers.
        const roof = box(
          Math.min(w * 0.5, 8), 1.2, Math.min(d * 0.5, 8),
          pick(rng, ROOF), bx, 0.4 + h + 0.6, bz,
        );
        group.add(roof);
        if (h > 20) {
          const band = box(
            w + 0.2, 0.8, d + 0.2, 0xffe9a8, bx, 0.4 + h * 0.55, bz,
          );
          band.material = new THREE.MeshLambertMaterial({
            color: 0xffe9a8, emissive: 0x554411,
          });
          group.add(band);
        }
        colliders.push({
          minX: bx - w / 2, maxX: bx + w / 2,
          minZ: bz - d / 2, maxZ: bz + d / 2,
        });
      }
    }
  }

  // Street lamps at every second intersection.
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3a3a });
  const lampMat = new THREE.MeshLambertMaterial({
    color: 0xfff2b0, emissive: 0x887722,
  });
  for (let i = 0; i <= GRID; i += 2) {
    for (let j = 0; j <= GRID; j += 2) {
      const x = ROAD_LINES[i] + 5;
      const z = ROAD_LINES[j] + 5;
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.16, 6, 6), poleMat,
      );
      pole.position.set(x, 3.4, z);
      group.add(pole);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), lampMat);
      head.position.set(x, 6.5, z);
      group.add(head);
    }
  }

  scene.add(group);

  const intersections = [];
  for (const x of ROAD_LINES) {
    for (const z of ROAD_LINES) intersections.push({ x, z });
  }

  function collides(x, z, r) {
    for (const c of colliders) {
      if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) {
        return true;
      }
    }
    return false;
  }

  return {
    colliders,
    roadLines: ROAD_LINES,
    pitch: PITCH,
    half: 176,
    intersections,
    // On the road (z = 0 line), never inside a block: block buildings can
    // reach to within ~5.5 units of a road centre, so a sidewalk spawn
    // risks starting the player inside a building collider.
    spawn: { x: 8, z: 0 },
    collides,
    randomIntersection(rng2) {
      return intersections[Math.floor(rng2() * intersections.length)];
    },
  };
}

// Snap a world point to the nearest road centre line on one axis.
export function nearestRoadCoord(v) {
  let best = ROAD_LINES[0];
  let bd = Math.abs(v - best);
  for (const c of ROAD_LINES) {
    const d = Math.abs(v - c);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
