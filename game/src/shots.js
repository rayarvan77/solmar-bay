// Solmar Bay — deterministic screenshot staging.
// The game reads ?shot=start|play|chase|mission&seed=1 and stages a scene
// through its own render path, so screenshots are real renders of the game.
import * as THREE from 'three';

export function parseShotQuery(search) {
  const params = new URLSearchParams(search || '');
  return {
    shot: params.get('shot') || null,
    seed: parseInt(params.get('seed') || '7', 10) || 7,
  };
}

// Stage one of the four screenshot scenes. `game` is the Game instance.
export function stageShot(game, shot) {
  const g = game;
  g.hideStartScreen();
  g.state = 'playing';
  if (shot === 'start') {
    g.state = 'menu';
    g.showStartScreen();
    // Orbiting camera over the city for the title shot.
    g.camera.position.set(120, 90, 190);
    g.camera.lookAt(0, 10, 0);
    g.shotOrbit = true;
    return;
  }
  if (shot === 'play') {
    // Dana driving a sedan down the main avenue, traffic around.
    const car = g.enterNearestParked(true);
    if (car) {
      car.pos.set(-140, 0, -3.5);
      car.heading = Math.PI / 2;
      car.speed = 26;
      car.syncMesh();
      g.playerCar = car;
      g.driving = true;
      g.playerPos.set(-140, 0, -3.5);
    }
    g.missions.startNext();
    g.hud.message('Welcome to Solmar Bay, Dana.');
    g.hud.message('Mission: Hot Wheels — steal a car, drive to the Docks.');
    return;
  }
  if (shot === 'chase') {
    const car = g.enterNearestParked(true);
    if (car) {
      // On the vertical road at x = 0 (lane +3.5), heading north (+z).
      car.pos.set(3.5, 0, 40);
      car.heading = 0;
      car.speed = 30;
      car.syncMesh();
      g.playerCar = car;
      g.driving = true;
      g.playerPos.set(3.5, 0, 40);
    }
    g.police.wanted = 3;
    g.police._spawnPoliceCar(g.playerPos);
    g.police._spawnPoliceCar(g.playerPos);
    g.missions.startNext();
    g.hud.message('WANTED — 3 stars! Lose the Bay PD!');
    return;
  }
  if (shot === 'mission') {
    // Mission 2: timed delivery, Dana racing north.
    const car = g.enterNearestParked(true);
    if (car) {
      // On the vertical road at x = 112 (lane +3.5), heading south (-z).
      car.pos.set(115.5, 0, 196);
      car.heading = Math.PI;
      car.speed = 24;
      car.syncMesh();
      g.playerCar = car;
      g.driving = true;
      g.playerPos.set(115.5, 0, 196);
    }
    g.missions.index = 1;
    g.missions.startNext();
    g.hud.message('Mission: Express Run — 100 seconds to Northside!');
    return;
  }
}
