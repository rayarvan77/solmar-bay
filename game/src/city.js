// Solmar Bay — procedural city: a 10x10 grid of blocks separated by roads.
// The layout is fully deterministic (seeded RNG) so every screenshot run
// builds the same streets. Buildings are axis-aligned boxes; their
// footprints are exported as colliders for the player, cars and peds.

import * as THREE from '../vendor/three.module.min.js';
import { mulberry32, pick } from './util.js';

export const CITY = {
  seed: 20261119,
  blocks: 10, // blocks per side
  pitch: 30, // distance between neighbouring road centrelines
  roadWidth: 9,
  blockSize: 21, // pitch - roadWidth
  half: 135, // half-extent of the road network (9 * pitch / 2)
};

const PALETTE = {
  asphalt: 0x3d3330,
  sidewalk: 0xb09a7c,
  grass: 0x77803f,
  curb: 0x8a7a62,
  roof: [0x9a4a30, 0x7a5a3a, 0x8a6a52, 0xa86a3a, 0x4a6a5a, 0x7a4a5a],
  wall: [0xd8b08a, 0xc09a70, 0xe0c0a0, 0xc8a888, 0xd0b8a0, 0xb89070],
  lamp: 0xffd9a0,
};

// Road centreline coordinates, one per grid line.
export function roadLines() {
  const lines = [];
  for (let k = 0; k < CITY.blocks; k++) {
    lines.push(-CITY.half + k * CITY.pitch);
  }
  return lines;
}

// Nearest road centreline coordinate to a world x (or z).
export function nearestRoad(v) {
  const lines = roadLines();
  let best = lines[0];
  let bestD = Infinity;
  for (const l of lines) {
    const d = Math.abs(v - l);
    if (d < bestD) {
      bestD = d;
      best = l;
    }
  }
  return best;
}

// Is the point (x, z) on a road (within the asphalt, not inside a block)?
export function onRoad(x, z) {
  const half = CITY.roadWidth / 2 + 0.6;
  const lines = roadLines();
  const nearX = lines.some((l) => Math.abs(x - l) <= half);
  const nearZ = lines.some((l) => Math.abs(z - l) <= half);
  return nearX || nearZ;
}

// Block centres: the square plots between four roads.
export function blockCentres() {
  const out = [];
  const lines = roadLines();
  for (let i = 0; i < CITY.blocks - 1; i++) {
    for (let j = 0; j < CITY.blocks - 1; j++) {
      out.push({ x: (lines[i] + lines[i + 1]) / 2, z: (lines[j] + lines[j + 1]) / 2 });
    }
  }
  return out;
}

export function buildCity(scene) {
  const rng = mulberry32(CITY.seed);
  const colliders = []; // {minX, maxX, minZ, maxZ, height}
  const buildings = [];
  const group = new THREE.Group();
  group.name = 'city';

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.half * 2 + 120, CITY.half * 2 + 120),
    new THREE.MeshLambertMaterial({ color: PALETTE.grass })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  ground.receiveShadow = true;
  group.add(ground);

  // Solmar Bay itself: open water along the whole north edge of the map,
  // with a sand beach between the water and the northernmost road. The
  // golden-hour shots all face north, so the bay is in frame.
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.half * 2 + 120, 58),
    new THREE.MeshLambertMaterial({ color: 0x2e7fa8 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.02, -CITY.half - 34);
  group.add(water);
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.half * 2 + 120, 9),
    new THREE.MeshLambertMaterial({ color: 0xd8b878 })
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0, -CITY.half - 5.5);
  sand.receiveShadow = true;
  group.add(sand);
  // Low sun disc hanging over the bay, due north.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(9, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, fog: false })
  );
  sunDisc.position.set(-52, 18, -192);
  sunDisc.lookAt(0, 18, 0);
  group.add(sunDisc);
  const sunGlow = new THREE.Mesh(
    new THREE.CircleGeometry(15, 24),
    new THREE.MeshBasicMaterial({ color: 0xff9a4d, transparent: true, opacity: 0.35, fog: false })
  );
  sunGlow.position.set(-52, 18, -193);
  sunGlow.lookAt(0, 18, 0);
  group.add(sunGlow);

  // Asphalt: one long strip per road, both directions.
  const asphaltMat = new THREE.MeshLambertMaterial({ color: PALETTE.asphalt });
  const lines = roadLines();
  for (const l of lines) {
    for (const horizontal of [true, false]) {
      const strip = new THREE.Mesh(
        new THREE.PlaneGeometry(CITY.half * 2 + CITY.roadWidth, CITY.roadWidth),
        asphaltMat
      );
      strip.rotation.x = -Math.PI / 2;
      if (!horizontal) strip.rotation.z = Math.PI / 2;
      strip.position.set(horizontal ? 0 : l, 0.01, horizontal ? l : 0);
      strip.receiveShadow = true;
      group.add(strip);
    }
  }

  // Centre dashes on every road.
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8d8c0 });
  const dashGeo = new THREE.BoxGeometry(3.2, 0.06, 0.45);
  for (const l of lines) {
    for (let d = -CITY.half + 8; d < CITY.half - 4; d += 12) {
      for (const horizontal of [true, false]) {
        const dash = new THREE.Mesh(dashGeo, dashMat);
        dash.position.set(horizontal ? d : l, 0.03, horizontal ? l : d);
        if (!horizontal) dash.rotation.y = Math.PI / 2;
        group.add(dash);
      }
    }
  }

  // Sidewalk slabs: a slightly raised square per block.
  const walkMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
  for (const c of blockCentres()) {
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(CITY.blockSize + 2, 0.3, CITY.blockSize + 2),
      walkMat
    );
    slab.position.set(c.x, 0.12, c.z);
    slab.receiveShadow = true;
    group.add(slab);
  }

  // Buildings: 1-3 towers per block, deterministic heights and colours.
  const wallMats = PALETTE.wall.map((c) => new THREE.MeshLambertMaterial({ color: c }));
  const roofMats = PALETTE.roof.map((c) => new THREE.MeshLambertMaterial({ color: c }));
  const windowMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (const c of blockCentres()) {
    const count = 1 + Math.floor(rng() * 3);
    const slots = [
      { dx: -4.5, dz: -4.5 },
      { dx: 4.5, dz: -4.5 },
      { dx: -4.5, dz: 4.5 },
      { dx: 4.5, dz: 4.5 },
      { dx: 0, dz: 0 },
    ];
    // Shuffle the slots deterministically, then take the first `count`.
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }
    for (let s = 0; s < count; s++) {
      const slot = slots[s];
      const w = 6 + rng() * 4;
      const d = 6 + rng() * 4;
      const h = 5 + rng() * rng() * 26; // mostly low, a few tall towers
      const x = c.x + slot.dx;
      const z = c.z + slot.dz;
      const wall = pick(rng, wallMats);
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wall);
      body.position.set(x, h / 2 + 0.25, z);
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.5, d + 0.4), pick(rng, roofMats));
      roof.position.set(x, h + 0.5, z);
      group.add(roof);
      // Lit windows: a thin glowing strip near the top of taller towers.
      if (h > 12) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.5, d + 0.1), windowMat);
        strip.position.set(x, h * 0.62, z);
        group.add(strip);
      }
      colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, height: h });
      buildings.push({ x, z, w, d, h });
    }
  }

  // Street lamps at road corners, deterministic placement.
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x30343a });
  const bulbMat = new THREE.MeshBasicMaterial({ color: PALETTE.lamp });
  for (const l of lines) {
    for (const m of lines) {
      if (rng() < 0.45) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 5.2, 6), poleMat);
      pole.position.set(l + 5.6, 2.6, m + 5.6);
      group.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), bulbMat);
      bulb.position.set(l + 5.6, 5.3, m + 5.6);
      group.add(bulb);
    }
  }

  // A few palm-ish trees on the outer ring, for the skyline.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f7a3a });
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2;
    const r = CITY.half + 18 + rng() * 26;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 4.5, 6), trunkMat);
    trunk.position.set(x, 2.25, z);
    group.add(trunk);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(2.1, 8, 6), leafMat);
    crown.position.set(x, 5.4, z);
    crown.scale.y = 0.7;
    group.add(crown);
  }

  scene.add(group);
  return { group, colliders, buildings };
}

// Push a circle (x, z, radius) out of every building collider it overlaps.
// Returns true when a push happened.
export function collideCircle(colliders, pos, radius) {
  let hit = false;
  for (const b of colliders) {
    const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (radius - d) / d;
        pos.x += dx * push;
        pos.z += dz * push;
      } else {
        // Dead centre: shove out along the smallest penetration axis.
        const left = pos.x - b.minX;
        const right = b.maxX - pos.x;
        const top = pos.z - b.minZ;
        const bottom = b.maxZ - pos.z;
        const m = Math.min(left, right, top, bottom);
        if (m === left) pos.x = b.minX - radius;
        else if (m === right) pos.x = b.maxX + radius;
        else if (m === top) pos.z = b.minZ - radius;
        else pos.z = b.maxZ + radius;
      }
    }
  }
  return hit;
}

// Clamp a position inside the playable map (roads + margin).
export function clampToMap(pos, margin = 6) {
  const lim = CITY.half + margin;
  pos.x = Math.max(-lim, Math.min(lim, pos.x));
  pos.z = Math.max(-lim, Math.min(lim, pos.z));
}
