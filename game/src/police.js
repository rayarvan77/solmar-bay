// Police for Solmar Bay: cruisers that spawn with the wanted level,
// chase the player, and bust them if they get caught standing still.
import * as THREE from '../vendor/three.module.min.js';
import { clamp, turnToward, dist } from './util.js';
import { makePoliceCarMesh } from './vehicles.js';

function targetCountFor(wanted) {
  if (wanted <= 0) return 0;
  if (wanted === 1) return 1;
  if (wanted === 2) return 2;
  if (wanted === 3) return 2;
  if (wanted === 4) return 3;
  return 4;
}

export function createPolice(scene, rng, city) {
  const mgr = {
    cars: [],
    bustTimer: 0,
    farTimer: 0,
    spawnCooldown: 0,
  };

  function spawnOne(playerPos) {
    const mesh = makePoliceCarMesh();
    // Spawn at an intersection at least 55 units from the player.
    let inter = city.randomIntersection(rng);
    let tries = 0;
    while (dist(inter.x, inter.z, playerPos.x, playerPos.z) < 55 && tries < 12) {
      inter = city.randomIntersection(rng);
      tries++;
    }
    const car = {
      ...mesh,
      x: inter.x,
      z: inter.z,
      heading: rng() * Math.PI * 2,
      speed: 0,
      awayTime: 0,
    };
    car.group.position.set(car.x, 0, car.z);
    scene.add(car.group);
    mgr.cars.push(car);
    return car;
  }

  function removeCar(car) {
    scene.remove(car.group);
    const i = mgr.cars.indexOf(car);
    if (i >= 0) mgr.cars.splice(i, 1);
  }

  // dt seconds; player: {x, z, speed, inCar}; wanted: 0..5.
  // events: {onBusted, onRam} callbacks.
  mgr.update = function (dt, player, wanted, events, time) {
    const want = targetCountFor(wanted);
    mgr.spawnCooldown -= dt;
    while (mgr.cars.length < want && mgr.spawnCooldown <= 0) {
      spawnOne(player);
      mgr.spawnCooldown = 1.2;
    }
    while (mgr.cars.length > want) {
      removeCar(mgr.cars[mgr.cars.length - 1]);
    }
    const maxSpeed = 19 + wanted * 3.2;
    for (const car of [...mgr.cars]) {
      const d = dist(car.x, car.z, player.x, player.z);
      // Despawn a cruiser that lost the player far away for a while.
      if (d > 130) {
        car.awayTime += dt;
        if (car.awayTime > 7) { removeCar(car); continue; }
      } else {
        car.awayTime = 0;
      }
      // Steer toward the player and accelerate.
      const targetHeading = Math.atan2(player.z - car.z, player.x - car.x);
      car.heading = turnToward(car.heading, targetHeading, 2.6 * dt);
      car.speed = Math.min(car.speed + 12 * dt, maxSpeed);
      const nx = car.x + Math.cos(car.heading) * car.speed * dt;
      const nz = car.z + Math.sin(car.heading) * car.speed * dt;
      let blocked = false;
      if (city.collides(nx, car.z, 1.5)) blocked = true;
      else car.x = nx;
      if (city.collides(car.x, nz, 1.5)) blocked = true;
      else car.z = nz;
      if (blocked) car.speed *= 0.4;
      car.group.position.set(car.x, 0, car.z);
      car.group.rotation.y = -car.heading + Math.PI / 2;
      const spin = (car.speed * dt) / 0.38;
      for (const w of car.wheels) w.rotation.x += spin;
      // Flashing light bar.
      const phase = Math.floor(time * 6) % 2 === 0;
      car.lights.redMat.emissive.setHex(phase ? 0xff0000 : 0x330000);
      car.lights.blueMat.emissive.setHex(phase ? 0x000033 : 0x0022ff);
      // Ram the player on foot.
      if (!player.inCar && d < 2.6 && car.speed > 4) {
        events.onRam && events.onRam();
        car.speed *= 0.3;
      }
    }
    // Bust: a cruiser sits on a slow player.
    const nearest = mgr.cars.length
      ? Math.min(...mgr.cars.map((c) => dist(c.x, c.z, player.x, player.z)))
      : Infinity;
    if (wanted > 0 && nearest < 4 && player.speed < 3.5) {
      mgr.bustTimer += dt;
      if (mgr.bustTimer > 2.5) {
        mgr.bustTimer = 0;
        events.onBusted && events.onBusted();
      }
    } else {
      mgr.bustTimer = Math.max(0, mgr.bustTimer - dt * 2);
    }
    return mgr.cars;
  };

  mgr.clear = function () {
    for (const car of [...mgr.cars]) removeCar(car);
    mgr.bustTimer = 0;
  };

  return mgr;
}
