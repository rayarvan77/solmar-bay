// Solmar Bay — procedural city: roads, blocks, buildings, palms, lights, docks.
// All textures are drawn on canvas at build time; no external assets.
import * as THREE from 'three';
import { mulberry32, randRange, pick } from './util.js';

export const PITCH = 56;      // block + road
export const ROAD_W = 14;
export const GRID = 10;       // road lines 0..10
export const CITY_HALF = (GRID * PITCH) / 2; // 280

function roadLine(k) {
  return -CITY_HALF + k * PITCH;
}

function makeWindowTexture(rng, base, litRatio) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  const cols = 6, rows = 12;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const lit = rng() < litRatio;
      g.fillStyle = lit ? pick(rng, ['#ffd98a', '#ffe9b8', '#9fd8ff']) : '#1d2733';
      g.fillRect(8 + col * 20, 10 + r * 20, 12, 12);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makePalmTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#7a5a34';
  g.fillRect(28, 20, 8, 44);
  g.strokeStyle = '#2f8f4e'; g.lineWidth = 5; g.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    g.beginPath();
    g.moveTo(32, 22);
    g.quadraticCurveTo(32 + Math.cos(a) * 18, 22 + Math.sin(a) * 18 - 8, 32 + Math.cos(a) * 28, 22 + Math.sin(a) * 24 + 6);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class City {
  constructor(scene, seed) {
    this.scene = scene;
    this.rng = mulberry32(seed);
    this.buildings = [];   // {minX,maxX,minZ,maxZ,h} for collision
    this.group = new THREE.Group();
    this.group.name = 'city';
    scene.add(this.group);
    this._buildGround();
    this._buildRoads();
    this._buildBlocks();
    this._buildStreetProps();
    this._buildDocks();
    this._buildSky();
  }

  _buildGround() {
    const geo = new THREE.PlaneGeometry(CITY_HALF * 2 + 220, CITY_HALF * 2 + 220);
    const mat = new THREE.MeshLambertMaterial({ color: 0x8a7f6a });
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = false;
    this.group.add(ground);
  }

  _buildRoads() {
    const roadMat = new THREE.MeshLambertMaterial({ color: 0x2e3138 });
    const walkMat = new THREE.MeshLambertMaterial({ color: 0x9aa0a3 });
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8c84a });
    const span = CITY_HALF * 2 + ROAD_W;
    for (let k = 0; k <= GRID; k++) {
      const p = roadLine(k);
      for (const horizontal of [true, false]) {
        const road = new THREE.Mesh(new THREE.PlaneGeometry(span, ROAD_W), roadMat);
        road.rotation.x = -Math.PI / 2;
        if (horizontal) { road.position.set(0, 0.01, p); }
        else { road.rotation.z = Math.PI / 2; road.position.set(p, 0.01, 0); }
        this.group.add(road);
        // Sidewalk strips on both edges of the road.
        for (const side of [-1, 1]) {
          const walk = new THREE.Mesh(new THREE.PlaneGeometry(span, 4), walkMat);
          walk.rotation.x = -Math.PI / 2;
          if (horizontal) { walk.position.set(0, 0.02, p + side * (ROAD_W / 2 + 2)); }
          else { walk.rotation.z = Math.PI / 2; walk.position.set(p + side * (ROAD_W / 2 + 2), 0.02, 0); }
          this.group.add(walk);
        }
        // Centre dashes.
        const dashCount = Math.floor(span / 12);
        for (let d = 0; d < dashCount; d++) {
          const along = -span / 2 + 6 + d * 12;
          const dash = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.6), dashMat);
          dash.rotation.x = -Math.PI / 2;
          if (horizontal) { dash.position.set(along, 0.03, p); }
          else { dash.rotation.z = Math.PI / 2; dash.position.set(p, 0.03, along); }
          this.group.add(dash);
        }
      }
    }
  }

  _buildBlocks() {
    const rng = this.rng;
    const palettes = ['#d8b890', '#b8c8dc', '#d8c8b8', '#a8bcc8', '#e0c890', '#c8b8d8', '#a8c8b8'];
    const texA = makeWindowTexture(rng, '#c8ccd2', 0.35);
    const texB = makeWindowTexture(rng, '#d8c8b8', 0.3);
    const texC = makeWindowTexture(rng, '#b8c8d8', 0.4);
    const textures = [texA, texB, texC];
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < GRID; i++) {
      for (let j = 0; j < GRID; j++) {
        const x0 = roadLine(i) + ROAD_W / 2 + 3;
        const x1 = roadLine(i + 1) - ROAD_W / 2 - 3;
        const z0 = roadLine(j) + ROAD_W / 2 + 3;
        const z1 = roadLine(j + 1) - ROAD_W / 2 - 3;
        // A few blocks stay open as plazas / parks.
        if (rng() < 0.12) {
          const park = new THREE.Mesh(
            new THREE.PlaneGeometry(x1 - x0, z1 - z0),
            new THREE.MeshLambertMaterial({ color: 0x4a7a4a }),
          );
          park.rotation.x = -Math.PI / 2;
          park.position.set((x0 + x1) / 2, 0.04, (z0 + z1) / 2);
          this.group.add(park);
          continue;
        }
        const splitX = rng() < 0.6;
        const splitZ = rng() < 0.6;
        const nx = splitX ? 2 : 1, nz = splitZ ? 2 : 1;
        for (let a = 0; a < nx; a++) {
          for (let b = 0; b < nz; b++) {
            const bx0 = x0 + (a * (x1 - x0)) / nx + 1;
            const bx1 = x0 + ((a + 1) * (x1 - x0)) / nx - 1;
            const bz0 = z0 + (b * (z1 - z0)) / nz + 1;
            const bz1 = z0 + ((b + 1) * (z1 - z0)) / nz - 1;
            const w = bx1 - bx0, d = bz1 - bz0;
            if (w < 6 || d < 6) continue;
            const h = randRange(rng, 9, 42) * (rng() < 0.12 ? 1.8 : 1);
            const tex = pick(rng, textures);
            const mat = new THREE.MeshLambertMaterial({ map: tex, color: pick(rng, palettes) });
            const mesh = new THREE.Mesh(boxGeo, mat);
            mesh.scale.set(w, h, d);
            mesh.position.set((bx0 + bx1) / 2, h / 2, (bz0 + bz1) / 2);
            this.group.add(mesh);
            // Flat roof cap so the top is not stretched windows.
            const roof = new THREE.Mesh(
              new THREE.BoxGeometry(w + 0.4, 0.5, d + 0.4),
              new THREE.MeshLambertMaterial({ color: 0x6a7076 }),
            );
            roof.position.set(mesh.position.x, h + 0.25, mesh.position.z);
            this.group.add(roof);
            this.buildings.push({ minX: bx0, maxX: bx1, minZ: bz0, maxZ: bz1, h });
          }
        }
      }
    }
  }

  _buildStreetProps() {
    const rng = this.rng;
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x3c4148 });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f8f4e });
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 7, 6);
    const lampGeo = new THREE.SphereGeometry(0.5, 8, 6);
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 4.5, 6);
    const leafGeo = new THREE.ConeGeometry(2.2, 2.4, 7);
    for (let i = 0; i <= GRID; i += 2) {
      for (let j = 0; j <= GRID; j += 2) {
        const x = roadLine(i) + ROAD_W / 2 + 1.5;
        const z = roadLine(j) + ROAD_W / 2 + 1.5;
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(x, 3.5, z);
        this.group.add(pole);
        const lamp = new THREE.Mesh(lampGeo, lampMat);
        lamp.position.set(x, 7.1, z);
        this.group.add(lamp);
        // Traffic light on the opposite corner.
        const tl = new THREE.Group();
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 5, 6), poleMat);
        post.position.y = 2.5;
        tl.add(post);
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(0.7, 1.8, 0.7),
          new THREE.MeshLambertMaterial({ color: 0x222222 }),
        );
        box.position.y = 5.4;
        tl.add(box);
        const lightColors = [0xff3b30, 0xffcc00, 0x34c759];
        for (let li = 0; li < 3; li++) {
          const dot = new THREE.Mesh(
            new THREE.SphereGeometry(0.22, 8, 6),
            new THREE.MeshBasicMaterial({ color: lightColors[li] }),
          );
          dot.position.set(0, 5.9 - li * 0.55, 0.4);
          tl.add(dot);
        }
        tl.position.set(roadLine(i) - ROAD_W / 2 - 1.5, 0, roadLine(j) - ROAD_W / 2 - 1.5);
        this.group.add(tl);
      }
    }
    // Palm trees along sidewalk edges.
    for (let n = 0; n < 90; n++) {
      const k = Math.floor(rng() * (GRID + 1));
      const along = randRange(rng, -CITY_HALF, CITY_HALF);
      const side = rng() < 0.5 ? -1 : 1;
      const horizontal = rng() < 0.5;
      const x = horizontal ? along : roadLine(k) + side * (ROAD_W / 2 + 2);
      const z = horizontal ? roadLine(k) + side * (ROAD_W / 2 + 2) : along;
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(x, 2.25, z);
      this.group.add(trunk);
      const leaves = new THREE.Mesh(leafGeo, leafMat);
      leaves.position.set(x, 5.6, z);
      this.group.add(leaves);
    }
    void makePalmTexture;
  }

  _buildDocks() {
    const rng = this.rng;
    const z = CITY_HALF + 34;
    const pier = new THREE.Mesh(
      new THREE.BoxGeometry(220, 1.2, 60),
      new THREE.MeshLambertMaterial({ color: 0x7a6a55 }),
    );
    pier.position.set(0, 0.4, z);
    this.group.add(pier);
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(560, 120),
      new THREE.MeshLambertMaterial({ color: 0x2a6a8a }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 0.05, z + 85);
    this.group.add(water);
    const colors = [0xc0392b, 0x2471a3, 0x229954, 0xd4ac0d, 0x7d3c98];
    for (let n = 0; n < 26; n++) {
      const cx = randRange(rng, -100, 100);
      const cz = z + randRange(rng, -22, 22);
      const cont = new THREE.Mesh(
        new THREE.BoxGeometry(10, 3.4, 3),
        new THREE.MeshLambertMaterial({ color: pick(rng, colors) }),
      );
      cont.position.set(cx, 2.4 + (rng() < 0.3 ? 3.4 : 0), cz);
      cont.rotation.y = rng() < 0.5 ? 0 : Math.PI / 2;
      this.group.add(cont);
    }
    // Crane silhouettes.
    for (const cx of [-70, 0, 70]) {
      const crane = new THREE.Group();
      const legMat = new THREE.MeshLambertMaterial({ color: 0xd4ac0d });
      for (const dx of [-4, 4]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(1.5, 34, 1.5), legMat);
        leg.position.set(dx, 17, 0);
        crane.add(leg);
      }
      const arm = new THREE.Mesh(new THREE.BoxGeometry(46, 1.6, 1.6), legMat);
      arm.position.set(8, 33, 0);
      crane.add(arm);
      crane.position.set(cx, 0, z - 12);
      this.group.add(crane);
    }
    this.docksPos = new THREE.Vector3(0, 0, z);
  }

  _buildSky() {
    const skyGeo = new THREE.SphereGeometry(900, 24, 12);
    const skyMat = new THREE.MeshBasicMaterial({
      color: 0x87b5d6, side: THREE.BackSide, fog: false,
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(sky);
    const sun = new THREE.DirectionalLight(0xfff2d0, 2.0);
    sun.position.set(180, 260, 120);
    this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 1.15));
    this.scene.fog = new THREE.Fog(0x9fc3dd, 320, 850);
  }

  // Road-line coordinate nearest to a position (for traffic / spawns).
  nearestRoadLine(v) {
    return Math.round((v + CITY_HALF) / PITCH);
  }

  roadPoint(k, along, lane) {
    return new THREE.Vector3(roadLine(k) + lane, 0, along);
  }

  // Push a circle (x,z,r) out of every building AABB it overlaps. Returns true on hit.
  collideCircle(pos, r) {
    let hit = false;
    for (const b of this.buildings) {
      const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
      const dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        hit = true;
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          pos.x = cx + (dx / d) * r;
          pos.z = cz + (dz / d) * r;
        } else {
          pos.x = b.maxX + r;
        }
      }
    }
    return hit;
  }

  insideCity(x, z, margin) {
    const m = margin || 0;
    return x > -CITY_HALF - 30 - m && x < CITY_HALF + 30 + m
      && z > -CITY_HALF - 30 - m && z < CITY_HALF + 70 + m;
  }

  randomRoadPoint(rng) {
    const k = Math.floor(rng() * (GRID + 1));
    const along = randRange(rng, -CITY_HALF + 10, CITY_HALF - 10);
    const lane = rng() < 0.5 ? -3.5 : 3.5;
    if (rng() < 0.5) return new THREE.Vector3(roadLine(k) + lane, 0, along);
    return new THREE.Vector3(along, 0, roadLine(k) + lane);
  }
}
