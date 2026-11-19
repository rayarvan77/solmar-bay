// Deterministic screenshot scenes for Solmar Bay (?shot=1..4).
// Each shot places the player, cars and police at fixed positions and
// parks the camera, so the four screenshots are reproducible.
import * as THREE from '../vendor/three.module.min.js';

export const SHOTS = [
  { id: 1, name: 'start', title: 'Welcome to Solmar Bay', description: 'Opening view over the city, player on foot by the kerb.' },
  { id: 2, name: 'play', title: 'On the road', description: 'Driving east down the main avenue.' },
  { id: 3, name: 'chase', title: 'Heat on your tail', description: 'Two cruisers in pursuit at wanted level 3.' },
  { id: 4, name: 'mission', title: "Dana Vega's job", description: 'At the mission beacon for the first job.' },
];

function setFixedCam(world, px, py, pz, tx, ty, tz) {
  world.cameraMode = 'fixed';
  world.fixedCam = {
    position: new THREE.Vector3(px, py, pz),
    target: new THREE.Vector3(tx, ty, tz),
  };
}

export function applyShot(id, world) {
  const G = world;
  if (id === 1) {
    // Opening: high view over the city centre, player on foot.
    G.inCar = false;
    G.playerCar = null;
    G.player.x = 8;
    G.player.z = 0;
    G.player.heading = Math.PI / 4;
    G.player.mesh.position.set(8, 0, 0);
    G.player.mesh.rotation.y = -G.player.heading + Math.PI / 2;
    G.wanted = 0;
    G.money = 250;
    G.health = 100;
    G.speedKmh = 0;
    G.objectiveOverride = 'Welcome to Solmar Bay — steal a car and start mission 1.';
    setFixedCam(G, 72, 58, 72, 0, 0, 0);
    return;
  }
  if (id === 2) {
    // Driving: player in a car heading east on the avenue z = 0.
    const car = G.parkedCars[0];
    car.x = -40;
    car.z = 0;
    car.heading = 0;
    car.speed = 22;
    car.group.position.set(-40, 0, 0);
    car.group.rotation.y = -car.heading + Math.PI / 2;
    G.playerCar = car;
    G.inCar = true;
    G.player.mesh.visible = false;
    G.wanted = 0;
    G.money = 250;
    G.health = 100;
    G.speedKmh = 79;
    G.objectiveOverride = '1. First Wheels — Get a car and drive to the yellow marker.';
    // Camera stays inside the road corridor (z near 0) so no building blocks it.
    setFixedCam(G, -58, 6.5, -3.5, -26, 1.5, 0);
    return;
  }
  if (id === 3) {
    // Chase: player car northbound, two cruisers right behind, wanted 3.
    const car = G.parkedCars[0];
    car.x = 0;
    car.z = 32;
    car.heading = Math.PI / 2;
    car.speed = 26;
    car.group.position.set(0, 0, 32);
    car.group.rotation.y = -car.heading + Math.PI / 2;
    G.playerCar = car;
    G.inCar = true;
    G.player.mesh.visible = false;
    G.wanted = 3;
    G.money = 250;
    G.health = 100;
    G.speedKmh = 94;
    G.objectiveOverride = 'WANTED 3 — lose the cruisers!';
    // Spawn two cruisers, then park them on the player's tail.
    const p = { x: 0, z: 32, speed: 26, inCar: true };
    G.police.update(1.5, p, 3, {}, 1.0);
    G.police.update(1.3, p, 3, {}, 2.3);
    const spots = [{ x: 2, z: 16 }, { x: -3, z: 8 }];
    G.police.cars.forEach((c, i) => {
      const s = spots[i % spots.length];
      c.x = s.x;
      c.z = s.z;
      c.heading = Math.PI / 2;
      c.speed = 27;
      c.group.position.set(c.x, 0, c.z);
      c.group.rotation.y = -c.heading + Math.PI / 2;
    });
    // Camera on the road itself (x near 0), looking north up the chase:
    // police in the foreground, player car ahead. Pulled back so the
    // nearest cruiser is fully in frame.
    setFixedCam(G, 1, 9, 0, 0, 1.5, 32);
    return;
  }
  // Shot 4: at the mission beacon for mission 1 (target 96, -64).
  const car = G.parkedCars[0];
  car.x = 82;
  car.z = -64;
  car.heading = 0;
  car.speed = 0;
  car.group.position.set(82, 0, -64);
  car.group.rotation.y = -car.heading + Math.PI / 2;
  G.playerCar = car;
  G.inCar = true;
  G.player.mesh.visible = false;
  G.wanted = 1;
  G.money = 450;
  G.health = 100;
  G.speedKmh = 0;
  G.objectiveOverride = '1. First Wheels — Get a car and drive to the yellow marker.';
  setFixedCam(G, 116, 17, -42, 94, 2, -64);
}
