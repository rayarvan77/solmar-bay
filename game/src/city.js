// Solmar Bay — procedural city: a 10x10 block grid of streets, buildings,
// sidewalks, lamps and trees. Everything is placed by a seeded RNG, so the
// city is identical on every load.
import * as THREE from 'three';
import { randRange, randInt, pick } from './util.js';

export const BLOCKS = 10;
export const PITCH = 34; // block (24 m) + road (10 m)
export const ROAD_HALF = 5;
export const CITY_HALF = (BLOCKS * PITCH) / 2; // 170 m

const BUILDING_COLORS = [
  0x8a7f72, 0x6f7d8c, 0x9c8a6d, 0x7d7468, 0x5f6e7a,
  0xa08b7a, 0x746a5e, 0x8c9aa5, 0x96755a, 0x6b6258,
];
const ROOF_COLORS = [0x4a4440, 0x5a5148, 0x3f4a52, 0x55483c];

export function buildCity(scene, rng) {
  const group = new THREE.Group();
  group.name = 'city';
  scene.add(group);

  // Ground: one big slab, grass-green verges under the asphalt grid.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_HALF * 2 + 120, CITY_HALF * 2 + 120),
    new THREE.MeshLambertMaterial({ color: 0x4d5e43 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  group.add(ground);

  // Street lines, at -170, -136, ..., +170.
  const streets = [];
  for (let i = 0; i <= BLOCKS; i++) streets.push(-CITY_HALF + i * PITCH);

  const roadMat = new THREE.MeshLambertMaterial({ color: 0x2b2d33 });
  const walkMat = new THREE.MeshLambertMaterial({ color: 0x8d8a80 });
  const roadGeoX = new THREE.PlaneGeometry(CITY_HALF * 2, ROAD_HALF * 2);
  const roadGeoZ = new THREE.PlaneGeometry(ROAD_HALF * 2, CITY_HALF * 2);
  const walkGeo = new THREE.PlaneGeometry(PITCH - ROAD_HALF * 2 + 5, 5);
  for (const s of streets) {
    const rx = new THREE.Mesh(roadGeoX, roadMat);
    rx.rotation.x = -Math.PI / 2;
    rx.position.set(0, 0, s);
    group.add(rx);
    const rz = new THREE.Mesh(roadGeoZ, roadMat);
    rz.rotation.x = -Math.PI / 2;
    rz.position.set(s, 0, 0);
    group.add(rz);
  }
  // Sidewalk borders around every block.
  for (let bx = 0; bx < BLOCKS; bx++) {
    for (let bz = 0; bz < BLOCKS; bz++) {
      const cx = -CITY_HALF + bx * PITCH + PITCH / 2;
      const cz = -CITY_HALF + bz * PITCH + PITCH / 2;
      const w = PITCH - ROAD_HALF * 2 + 5;
      for (const [dx, dz, ry] of [[0, -w / 2 - 0, 0], [0, w / 2, 0], [-w / 2, 0, Math.PI / 2], [w / 2, 0, Math.PI / 2]]) {
        const sw = new THREE.Mesh(walkGeo, walkMat);
        sw.rotation.x = -Math.PI / 2;
        sw.rotation.z = ry;
        sw.position.set(cx + dx, 0.01, cz + dz);
        group.add(sw);
      }
    }
  }

  // Buildings: 1-4 per block, instanced boxes with per-instance color.
  const buildings = []; // {minX, maxX, minZ, maxZ, h}
  const matrices = [];
  const colors = [];
  const dummy = new THREE.Object3D();
  const tmpColor = new THREE.Color();
  for (let bx = 0; bx < BLOCKS; bx++) {
    for (let bz = 0; bz < BLOCKS; bz++) {
      const x0 = -CITY_HALF + bx * PITCH + ROAD_HALF + 2.5;
      const z0 = -CITY_HALF + bz * PITCH + ROAD_HALF + 2.5;
      const span = PITCH - ROAD_HALF * 2 - 5; // 19 m of buildable lot
      const split = rng() < 0.55 ? 2 : 1;
      for (let sx = 0; sx < split; sx++) {
        for (let sz = 0; sz < split; sz++) {
          if (split === 2 && rng() < 0.18) continue; // occasional plaza gap
          const lot = span / split;
          const w = randRange(rng, lot * 0.55, lot * 0.85);
          const d = randRange(rng, lot * 0.55, lot * 0.85);
          const h = randRange(rng, 8, 42) * (rng() < 0.12 ? 1.6 : 1);
          const cx = x0 + sx * lot + lot / 2;
          const cz = z0 + sz * lot + lot / 2;
          buildings.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, h });
          dummy.position.set(cx, h / 2, cz);
          dummy.scale.set(w, h, d);
          dummy.rotation.set(0, 0, 0);
          dummy.updateMatrix();
          matrices.push(dummy.matrix.clone());
          colors.push(tmpColor.setHex(pick(rng, BUILDING_COLORS)).clone());
          // Flat roof cap, slightly darker.
          dummy.position.set(cx, h + 0.15, cz);
          dummy.scale.set(w * 0.92, 0.3, d * 0.92);
          dummy.updateMatrix();
          matrices.push(dummy.matrix.clone());
          colors.push(tmpColor.setHex(pick(rng, ROOF_COLORS)).clone());
        }
      }
    }
  }
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const boxMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const inst = new THREE.InstancedMesh(boxGeo, boxMat, matrices.length);
  matrices.forEach((m, i) => { inst.setMatrixAt(i, m); inst.setColorAt(i, colors[i]); });
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  group.add(inst);

  // Center dashes on every street (instanced thin white boxes).
  const dashGeo = new THREE.BoxGeometry(2.2, 0.02, 0.3);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8d4c8 });
  const dashMats = [];
  for (const s of streets) {
    for (let t = -CITY_HALF + 4; t < CITY_HALF - 4; t += 7) {
      dummy.position.set(t, 0.02, s); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
      dummy.updateMatrix(); dashMats.push(dummy.matrix.clone());
      dummy.position.set(s, 0.02, t); dummy.rotation.set(0, Math.PI / 2, 0);
      dummy.updateMatrix(); dashMats.push(dummy.matrix.clone());
    }
  }
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashMats.length);
  dashMats.forEach((m, i) => dashes.setMatrixAt(i, m));
  dashes.instanceMatrix.needsUpdate = true;
  group.add(dashes);

  // Street lamps at intersection corners (poles + glowing heads).
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.2, 6);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2e3138 });
  const headGeo = new THREE.SphereGeometry(0.28, 8, 6);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const poleMats = [];
  const headMats = [];
  for (const sx of streets) {
    for (const sz of streets) {
      const lx = sx + 6.2, lz = sz + 6.2;
      if (Math.abs(lx) > CITY_HALF + 2 || Math.abs(lz) > CITY_HALF + 2) continue;
      dummy.position.set(lx, 2.6, lz); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
      dummy.updateMatrix(); poleMats.push(dummy.matrix.clone());
      dummy.position.set(lx, 5.3, lz);
      dummy.updateMatrix(); headMats.push(dummy.matrix.clone());
    }
  }
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, poleMats.length);
  poleMats.forEach((m, i) => poles.setMatrixAt(i, m));
  poles.instanceMatrix.needsUpdate = true;
  group.add(poles);
  const heads = new THREE.InstancedMesh(headGeo, headMat, headMats.length);
  headMats.forEach((m, i) => heads.setMatrixAt(i, m));
  heads.instanceMatrix.needsUpdate = true;
  group.add(heads);

  // Trees on sidewalks (trunk + cone canopy, instanced).
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.22, 1.6, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a4632 });
  const coneGeo = new THREE.ConeGeometry(1.5, 3.4, 8);
  const coneMat = new THREE.MeshLambertMaterial({ color: 0x3d6b35 });
  const trunkMats = [];
  const coneMats = [];
  for (let i = 0; i < 150; i++) {
    const bx = randInt(rng, 0, BLOCKS - 1);
    const bz = randInt(rng, 0, BLOCKS - 1);
    const edge = randInt(rng, 0, 3);
    const along = randRange(rng, -9, 9);
    const base = -CITY_HALF + PITCH / 2;
    let x, z;
    if (edge === 0) { x = base + bx * PITCH + along; z = base + bz * PITCH - 11.4; }
    else if (edge === 1) { x = base + bx * PITCH + along; z = base + bz * PITCH + 11.4; }
    else if (edge === 2) { x = base + bx * PITCH - 11.4; z = base + bz * PITCH + along; }
    else { x = base + bx * PITCH + 11.4; z = base + bz * PITCH + along; }
    dummy.position.set(x, 0.8, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
    dummy.updateMatrix(); trunkMats.push(dummy.matrix.clone());
    dummy.position.set(x, 3.2, z);
    dummy.updateMatrix(); coneMats.push(dummy.matrix.clone());
  }
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trunkMats.length);
  trunkMats.forEach((m, i) => trunks.setMatrixAt(i, m));
  trunks.instanceMatrix.needsUpdate = true;
  group.add(trunks);
  const cones = new THREE.InstancedMesh(coneGeo, coneMat, coneMats.length);
  coneMats.forEach((m, i) => cones.setMatrixAt(i, m));
  cones.instanceMatrix.needsUpdate = true;
  group.add(cones);

  // ---- Queries the gameplay uses -------------------------------------
  function nearestStreet(v) {
    let best = streets[0], bd = Infinity;
    for (const s of streets) {
      const d = Math.abs(v - s);
      if (d < bd) { bd = d; best = s; }
    }
    return { street: best, dist: bd };
  }

  function isRoad(x, z) {
    return nearestStreet(x).dist < ROAD_HALF || nearestStreet(z).dist < ROAD_HALF;
  }

  // Push a circle (x, z, radius) out of every building AABB it overlaps.
  // Mutates and returns pos {x, z}. Also clamps to the city bounds.
  function collideCircle(pos, r) {
    for (const b of buildings) {
      const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
      const dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          pos.x = cx + (dx / d) * r;
          pos.z = cz + (dz / d) * r;
        } else {
          // Center inside the box: shove out along the smallest axis.
          const pushL = pos.x - b.minX + r, pushR = b.maxX - pos.x + r;
          const pushU = pos.z - b.minZ + r, pushD = b.maxZ - pos.z + r;
          const m = Math.min(pushL, pushR, pushU, pushD);
          if (m === pushL) pos.x = b.minX - r;
          else if (m === pushR) pos.x = b.maxX + r;
          else if (m === pushU) pos.z = b.minZ - r;
          else pos.z = b.maxZ + r;
        }
      }
    }
    const lim = CITY_HALF + 30;
    pos.x = Math.max(-lim, Math.min(lim, pos.x));
    pos.z = Math.max(-lim, Math.min(lim, pos.z));
    return pos;
  }

  function randomRoadPoint(rng2) {
    const horizontal = rng2() < 0.5;
    const street = pick(rng2, streets);
    const along = randRange(rng2, -CITY_HALF + 10, CITY_HALF - 10);
    return horizontal ? { x: along, z: street } : { x: street, z: along };
  }

  function randomSidewalkPoint(rng2) {
    const bx = randInt(rng2, 0, BLOCKS - 1);
    const bz = randInt(rng2, 0, BLOCKS - 1);
    const cx = -CITY_HALF + bx * PITCH + PITCH / 2;
    const cz = -CITY_HALF + bz * PITCH + PITCH / 2;
    const edge = randInt(rng2, 0, 3);
    const along = randRange(rng2, -8, 8);
    if (edge === 0) return { x: cx + along, z: cz - 11.4 };
    if (edge === 1) return { x: cx + along, z: cz + 11.4 };
    if (edge === 2) return { x: cx - 11.4, z: cz + along };
    return { x: cx + 11.4, z: cz + along };
  }

  return {
    group, streets, buildings, isRoad, collideCircle,
    randomRoadPoint, randomSidewalkPoint,
    pitch: PITCH, half: CITY_HALF,
  };
}
