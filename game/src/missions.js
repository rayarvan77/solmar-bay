// Solmar Bay — missions from Dana Vega. Five jobs, each a small chain of
// objectives (drive somewhere, pick something up, lose the cops). Completing
// one pays cash and saves progress.
import * as THREE from 'three';

const MISSION_DEFS = [
  {
    id: 'first-wheels',
    name: 'First Wheels',
    brief: 'Dana needs wheels. Steal any car and bring it to her garage.',
    reward: 500,
  },
  {
    id: 'package-run',
    name: 'Package Run',
    brief: 'Pick up the package at the docks, then drop it at two spots.',
    reward: 800,
  },
  {
    id: 'getaway',
    name: 'Getaway',
    brief: 'Make some noise — get to 2 stars — then lose the cops completely.',
    reward: 1200,
  },
  {
    id: 'taxi-for-vega',
    name: 'Taxi for Vega',
    brief: 'Pick Dana up and drive her to the club before the clock runs out.',
    reward: 1500,
  },
  {
    id: 'big-score',
    name: 'The Big Score',
    brief: 'Hit the bank, grab the cash, lose the heat, bring it to Dana.',
    reward: 3000,
  },
];

export class MissionManager {
  constructor(scene, city, rng, hooks) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.hooks = hooks; // { onObjective(text), onToast(text), onComplete(mission), onMoney(n) }
    this.missions = MISSION_DEFS.map((d) => ({ ...d, done: false }));
    this.active = null; // { index, step, steps, timer, grabT }
    this.marker = null; // { x, z }
    this.passenger = false;
    this.save = null;

    // Mission beacon: a glowing column + ground ring at the objective.
    const geo = new THREE.CylinderGeometry(2.6, 2.6, 34, 20, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd23c, transparent: true, opacity: 0.28,
      side: THREE.DoubleSide, depthWrite: false,
    });
    this.beacon = new THREE.Mesh(geo, mat);
    this.beacon.position.y = 17;
    this.beacon.visible = false;
    scene.add(this.beacon);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 3.0, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd23c, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    ring.visible = false;
    scene.add(ring);
    this.ring = ring;

    // Dana Vega herself: magenta jacket, stands at pickup points.
    const dana = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.85, 0.34),
      new THREE.MeshLambertMaterial({ color: 0xd13c9e }),
    );
    body.position.y = 0.95;
    dana.add(body);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 10, 8),
      new THREE.MeshLambertMaterial({ color: 0xe8b98a }),
    );
    head.position.y = 1.62;
    dana.add(head);
    const hair = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.5, 0.2),
      new THREE.MeshLambertMaterial({ color: 0x1a1a1a }),
    );
    hair.position.set(0, 1.7, -0.12);
    dana.add(hair);
    dana.visible = false;
    scene.add(dana);
    this.dana = dana;
    this.danaPos = null;
  }

  loadSave(save) {
    this.save = save;
    for (const m of this.missions) m.done = !!save.missionsDone[m.id];
  }

  nextAvailable() {
    return this.missions.findIndex((m) => !m.done);
  }

  setMarker(x, z) {
    this.marker = { x, z };
    this.beacon.position.set(x, 17, z);
    this.beacon.visible = true;
    this.ring.position.set(x, 0.06, z);
    this.ring.visible = true;
  }

  clearMarker() {
    this.marker = null;
    this.beacon.visible = false;
    this.ring.visible = false;
  }

  startMission(index) {
    if (this.active) return false;
    const def = this.missions[index];
    if (!def || def.done) return false;
    const steps = this.buildSteps(def.id);
    this.active = { index, step: 0, steps, timer: 0, grabT: 0 };
    this.hooks.onToast(`New job: ${def.name} — ${def.brief}`);
    this.advanceToStep();
    return true;
  }

  buildSteps(id) {
    const road = () => this.city.randomRoadPoint(this.rng);
    const walk = () => this.city.randomSidewalkPoint(this.rng);
    if (id === 'first-wheels') {
      const g = road();
      return [
        { kind: 'steal-car', text: 'Steal a car (walk up to one and press E)' },
        { kind: 'goto', ...g, radius: 6, text: 'Drive to Dana\u2019s garage' },
      ];
    }
    if (id === 'package-run') {
      const a = road(), b = road(), c = road();
      return [
        { kind: 'goto', ...a, radius: 5, text: 'Pick up the package at the docks' },
        { kind: 'goto', ...b, radius: 5, text: 'Drop the package — stop 1 of 2' },
        { kind: 'goto', ...c, radius: 5, text: 'Drop the package — stop 2 of 2' },
      ];
    }
    if (id === 'getaway') {
      return [
        { kind: 'get-wanted', level: 2, time: 150, text: 'Cause trouble — reach 2 wanted stars' },
        { kind: 'lose-wanted', time: 180, text: 'Now lose the cops — get back to 0 stars' },
      ];
    }
    if (id === 'taxi-for-vega') {
      const p = walk(), d = road();
      return [
        { kind: 'pickup-dana', ...p, radius: 4, text: 'Pick Dana up (drive close to her)' },
        { kind: 'goto', ...d, radius: 6, time: 120, text: 'Drive Dana to the club — fast!' },
      ];
    }
    // big-score
    const bank = road(), dana = walk();
    return [
      { kind: 'goto', ...bank, radius: 6, text: 'Drive to the Solmar Bank' },
      { kind: 'grab', ...bank, radius: 5, hold: 3, text: 'Hold E to grab the cash' },
      { kind: 'lose-wanted', time: 240, text: 'Lose the cops — get back to 0 stars' },
      { kind: 'goto', ...dana, radius: 5, text: 'Bring the cash to Dana' },
    ];
  }

  advanceToStep() {
    const a = this.active;
    if (!a) return;
    const step = a.steps[a.step];
    a.timer = step.time || 0;
    a.grabT = 0;
    this.hooks.onObjective(step.text);
    if (step.kind === 'goto' || step.kind === 'grab') this.setMarker(step.x, step.z);
    else if (step.kind === 'pickup-dana') {
      this.danaPos = { x: step.x, z: step.z };
      this.dana.position.set(step.x, 0, step.z);
      this.dana.visible = true;
      this.setMarker(step.x, step.z);
    } else {
      this.clearMarker();
    }
  }

  completeStep() {
    const a = this.active;
    a.step += 1;
    if (a.step >= a.steps.length) {
      this.finishMission();
    } else {
      this.advanceToStep();
    }
  }

  finishMission() {
    const a = this.active;
    const def = this.missions[a.index];
    def.done = true;
    this.save.missionsDone[def.id] = true;
    this.save.money += def.reward;
    this.hooks.onMoney(def.reward);
    this.hooks.onToast(`Job done: ${def.name} — +$${def.reward}`);
    this.hooks.onComplete(def);
    this.active = null;
    this.passenger = false;
    this.dana.visible = false;
    this.clearMarker();
    this.hooks.onObjective('No active job — open the phone (Tab) to take the next one.');
  }

  failMission(reason) {
    const a = this.active;
    const def = this.missions[a.index];
    this.hooks.onToast(`Job failed: ${def.name} — ${reason}`);
    this.active = null;
    this.passenger = false;
    this.dana.visible = false;
    this.clearMarker();
    this.hooks.onObjective('No active job — open the phone (Tab) to take the next one.');
  }

  update(dt, player, holdingE) {
    const a = this.active;
    if (!a) return;
    const step = a.steps[a.step];
    if (step.time) {
      a.timer -= dt;
      if (a.timer <= 0) {
        this.failMission('out of time');
        return;
      }
    }
    const dist = (x, z) => Math.hypot(player.x - x, player.z - z);
    switch (step.kind) {
      case 'steal-car':
        if (player.inCar) this.completeStep();
        break;
      case 'goto':
        if (dist(step.x, step.z) < step.radius) this.completeStep();
        break;
      case 'get-wanted':
        if (player.wanted >= step.level) this.completeStep();
        break;
      case 'lose-wanted':
        if (player.wanted === 0) this.completeStep();
        break;
      case 'pickup-dana':
        if (dist(step.x, step.z) < step.radius && player.inCar) {
          this.passenger = true;
          this.dana.visible = false;
          this.hooks.onToast('Dana hopped in. Drive!');
          this.completeStep();
        }
        break;
      case 'grab':
        if (dist(step.x, step.z) < step.radius && holdingE) {
          a.grabT += dt;
          if (a.grabT >= step.hold) {
            this.hooks.onToast('Cash grabbed! The cops are coming — run!');
            this.completeStep();
          }
        } else {
          a.grabT = 0;
        }
        break;
      default:
        break;
    }
  }

  // Beacon pulse for the render loop.
  animate(t) {
    if (this.beacon.visible) {
      this.beacon.material.opacity = 0.22 + Math.sin(t * 3) * 0.08;
      this.beacon.rotation.y = t * 0.4;
    }
  }
}
