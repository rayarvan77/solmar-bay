// Solmar Bay — deterministic screenshot scenes for ?shot=1..4.
// Each shot arranges the world at fixed positions and returns a fixed camera
// pose, so the screenshots are reproducible on every run.
import * as THREE from 'three';

// Set the player up in a car at a fixed street spot, already moving.
function putPlayerInCar(game, x, z, heading, speed) {
  const car = game.givePlayerCar(x, z, heading, 0xb03a2e);
  car.speed = speed;
  game.player.carSpeed = speed;
  return car;
}

export function setupShot(game, n) {
  const { player } = game;
  if (n === 1) {
    // Start screen: player on foot at the central plaza, wide skyline view.
    game.teleportOnFoot(-8, -8, Math.PI * 0.25);
    game.hud.setObjective('Welcome to Solmar Bay — press Start to play.');
    return {
      camPos: new THREE.Vector3(-120, 78, -120),
      lookAt: new THREE.Vector3(10, 8, 10),
      showStart: true,
    };
  }
  if (n === 2) {
    // Driving: player cruising down a main avenue with traffic around.
    putPlayerInCar(game, -34, -68, 0, 16);
    game.hud.setObjective('Cruising Solmar Bay — press Tab to see Dana\u2019s jobs.');
    return {
      camPos: new THREE.Vector3(-34, 6, -88),
      lookAt: new THREE.Vector3(-34, 2, -45),
      showStart: false,
    };
  }
  if (n === 3) {
    // Police chase: wanted 3, two squad cars on the player's tail.
    putPlayerInCar(game, 0, -102, 0, 22);
    game.police.setWanted(3);
    game.hud.setObjective('Wanted level 3 — lose the cops!');
    // Spawn the squad explicitly (update() has not run yet, so no cars
    // exist to reposition), then place them: two behind the player, one
    // oncoming ahead, all inside the camera frame.
    while (game.police.cars.length < 3) game.police.spawnPolice();
    const cops = game.police.cars;
    if (cops[0]) { cops[0].x = -3; cops[0].z = -124; cops[0].heading = 0; cops[0].speed = 14; }
    if (cops[1]) { cops[1].x = 5; cops[1].z = -120; cops[1].heading = 0; cops[1].speed = 14; }
    if (cops[2]) { cops[2].x = 3; cops[2].z = -40; cops[2].heading = Math.PI; cops[2].speed = 20; }
    return {
      camPos: new THREE.Vector3(6, 9, -132),
      lookAt: new THREE.Vector3(0, 2, -70),
      showStart: false,
    };
  }
  // Mission: on foot at a glowing beacon, Dana waiting at the marker.
  game.teleportOnFoot(-40, -2, Math.PI / 2);
  game.missions.setMarker(-34, 34);
  game.missions.dana.position.set(-33, 0, 32);
  game.missions.dana.visible = true;
  game.hud.setObjective('Job: bring the package to Dana — follow the beacon.');
  return {
    camPos: new THREE.Vector3(-52, 6, -16),
    lookAt: new THREE.Vector3(-33, 2, 33),
    showStart: false,
  };
}
