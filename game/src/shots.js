// Solmar Bay — deterministic screenshot scenes. `?shot=1..4` freezes the
// game into a fixed, staged tableau and parks the camera, so the four
// dossier screenshots are reproducible: no live input, no random AI state,
// no timers running. main.js calls setupShot() once after the world loads
// and then just renders.

import * as THREE from '../vendor/three.module.min.js';

export const SHOT_NAMES = {
  1: 'start',
  2: 'play',
  3: 'chase',
  4: 'mission',
};

// Park the camera at a fixed position looking at a fixed target.
function parkCamera(camera, x, y, z, tx, ty, tz) {
  camera.position.set(x, y, z);
  camera.lookAt(tx, ty, tz);
}

export function setupShot(shot, world) {
  const { camera, player, cars, peds, police, missions, hud, renderer } = world;
  const playerPos = player.pos;
  const setPlayer = (x, z, heading) => {
    playerPos.x = x;
    playerPos.z = z;
    player.heading = heading;
    player.mesh.rotation.y = heading;
    player.mesh.position.set(x, 0, z);
    player.inCar = false;
  };

  if (shot === 1) {
    // Start screen: the player on the north road looking into the city,
    // title overlay up. Camera and player both on the road so no building
    // ever blocks the view; the camera sits high and level so the sky and
    // towers show above the overlay, and the player stands left of centre
    // where the button does not hide them.
    setPlayer(-19, -142, 0.3);
    parkCamera(camera, -12, 6, -126, -17, 3, -160);
    hud.showStart();
    hud.setObjective('Five jobs. One city. Don\'t get caught.');
    hud.setMoney(150);
    hud.setWanted(0);
    hud.setHealth(100);
    return { label: 'start', hint: 'title screen over the city' };
  }

  if (shot === 2) {
    // Driving: the player mid-drive down a long avenue, traffic ahead,
    // chase camera behind the car. Everything sits on road x = -15.
    const car = cars.traffic[0];
    const px = -15;
    const pz = -60;
    car.pos.x = px;
    car.pos.z = pz;
    car.heading = 0;
    car.speed = 16;
    car.syncMesh();
    player.inCar = car;
    player.pos.x = px;
    player.pos.z = pz;
    player.heading = 0;
    parkCamera(camera, px, 5.5, pz - 13, px, 2, pz + 12);
    hud.hideStart();
    hud.setObjective('Cruise Solmar Bay — steal a car, take a job, stay free.');
    hud.setMoney(350);
    hud.setWanted(0);
    hud.setHealth(100);
    hud.setSpeed(16 * 3.6, true);
    return { label: 'play', hint: 'driving down the avenue' };
  }

  if (shot === 3) {
    // Police chase: the player speeding away with two pursuit cars on
    // their bumper, sirens flashing, wanted stars up. All on road x = -15.
    const car = cars.traffic[1];
    const px = -15;
    const pz = 20;
    car.pos.x = px;
    car.pos.z = pz;
    car.heading = 0;
    car.speed = 22;
    car.syncMesh();
    player.inCar = car;
    player.pos.x = px;
    player.pos.z = pz;
    player.heading = 0;
    police.spawnPolice({ x: px, z: pz, heading: 0 });
    police.spawnPolice({ x: px, z: pz, heading: 0 });
    const tailSpots = [[px - 2, pz - 12], [px + 2, pz - 8]];
    police.cars.forEach((c, i) => {
      c.pos.x = tailSpots[i][0];
      c.pos.z = tailSpots[i][1];
      c.speed = 20;
      c.heading = 0;
      c.syncMesh();
    });
    parkCamera(camera, px, 6.5, pz - 18, px, 2, pz + 12);
    hud.hideStart();
    hud.setObjective('Lose the Heat — shake the cops!');
    hud.setMoney(900);
    hud.setWanted(3);
    hud.setHealth(72);
    hud.setSpeed(22 * 3.6, true);
    hud.centerMessage('WANTED ★★★ — lose them!');
    return { label: 'chase', hint: 'police pursuit' };
  }

  // Shot 4: a mission moment — the player on foot at the gold beacon with
  // Dana Vega's objective on screen. Player, beacon and camera all on
  // road x = -15 so the street frames the shot.
  setPlayer(-15, -92, 0);
  missions.marker.position.set(-15, 0, -84);
  missions.marker.visible = true;
  parkCamera(camera, -15, 4.5, -104, -15, 2, -82);
  hud.hideStart();
  hud.setObjective('The Big Score — Grab the cash, then reach the safehouse.');
  hud.setMoney(1400);
  hud.setWanted(1);
  hud.setHealth(100);
  hud.centerMessage('Dana Vega: "One last job, kid."');
  // A couple of peds nearby so the street feels alive.
  peds[0].pos.x = -9;
  peds[0].pos.z = -86;
  peds[1].pos.x = -21;
  peds[1].pos.z = -88;
  return { label: 'mission', hint: 'at the mission beacon' };
}

// Render one frame and report whether the canvas actually drew anything.
// Used by the screenshot harness to confirm the scene is alive.
export function renderOnce(renderer, scene, camera) {
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  const pixels = new Uint8Array(4);
  gl.readPixels(2, 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  return pixels[0] + pixels[1] + pixels[2] > 0;
}
