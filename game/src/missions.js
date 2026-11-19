// Solmar Bay — missions: five jobs handed out by Dana Vega, played in
// order. Each mission is a small state machine with an objective line, a
// beacon in the world, and a cash reward. Progress (money and completed
// missions) is saved to localStorage by main.js.

import * as THREE from '../vendor/three.module.min.js';
import { formatMoney, formatTime } from './util.js';
import { nearestRoad, roadLines, CITY } from './city.js';

const MISSION_DEFS = [
  {
    id: 'wheels',
    name: 'First Wheels',
    giver: 'Dana Vega',
    brief: 'You need wheels, kid. Grab any car on the street and bring it to my garage.',
    objective: 'Steal a car (press E near one), then drive to the garage marker.',
    reward: 200,
  },
  {
    id: 'cab',
    name: 'Cab Fare',
    giver: 'Dana Vega',
    brief: 'A client is waiting at the corner. Pick them up and drop them off across town. Drive smooth — they tip for clean rides.',
    objective: 'Pick up the passenger at the marker, then drive them to the drop-off.',
    reward: 350,
  },
  {
    id: 'delivery',
    name: 'Hot Delivery',
    giver: 'Dana Vega',
    brief: 'A package needs to be across town in 90 seconds. The cops are bored tonight, so keep it clean.',
    objective: 'Deliver the package to the marker before the timer runs out.',
    reward: 500,
    timeLimit: 90,
  },
  {
    id: 'heat',
    name: 'Lose the Heat',
    giver: 'Dana Vega',
    brief: 'The precinct is on your tail. Get the heat up, then shake every last cop and go quiet.',
    objective: 'Reach wanted level 2, then bring it back down to 0.',
    reward: 750,
  },
  {
    id: 'score',
    name: 'The Big Score',
    giver: 'Dana Vega',
    brief: 'One last job: the bank vault on Marina Row. Grab the cash, lose the cops, and meet me at the safehouse. Then we are done.',
    objective: 'Reach the bank, grab the cash, then escape to the safehouse with no cops on you.',
    reward: 1500,
  },
];

// A road-side point at least `minDist` away from a reference point.
function farRoadPoint(rng, ref, minDist) {
  const lines = roadLines();
  for (let tries = 0; tries < 40; tries++) {
    const x = lines[Math.floor(rng() * lines.length)];
    const z = lines[Math.floor(rng() * lines.length)];
    if (Math.hypot(x - ref.x, z - ref.z) >= minDist) return { x, z };
  }
  return { x: -lines[0], z: lines[lines.length - 1] };
}

export class MissionRunner {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.index = 0; // next mission to play
    this.done = 0;
    this.state = 'idle'; // idle | active | done
    this.stage = 0; // per-mission sub-stage
    this.target = null; // {x, z} of the current marker
    this.timer = 0;
    this.heatReached = false;
    this.cashGrabbed = false;
    this.passenger = null;
    this.marker = this.makeMarker();
    this.scene.add(this.marker);
    this.marker.visible = false;
  }

  makeMarker() {
    const group = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.6, 26, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffc020,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    beam.position.y = 13;
    group.add(beam);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.4, 0.22, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xffc020 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.25;
    group.add(ring);
    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.9),
      new THREE.MeshBasicMaterial({ color: 0xffe060 })
    );
    diamond.position.y = 5;
    diamond.name = 'diamond';
    group.add(diamond);
    return group;
  }

  get current() {
    return MISSION_DEFS[this.index] || null;
  }

  get allDone() {
    return this.index >= MISSION_DEFS.length;
  }

  start(playerPos) {
    const def = this.current;
    if (!def) return null;
    this.state = 'active';
    this.stage = 0;
    this.timer = def.timeLimit || 0;
    this.heatReached = false;
    this.cashGrabbed = false;
    if (def.id === 'wheels') {
      this.target = farRoadPoint(this.rng, playerPos, 40);
    } else if (def.id === 'cab') {
      this.target = farRoadPoint(this.rng, playerPos, 45);
    } else if (def.id === 'delivery') {
      this.target = farRoadPoint(this.rng, playerPos, 70);
    } else if (def.id === 'heat') {
      this.target = null;
    } else if (def.id === 'score') {
      this.target = { x: nearestRoad(60), z: nearestRoad(-90) };
    }
    this.placeMarker();
    return def;
  }

  placeMarker() {
    if (this.target) {
      this.marker.position.set(this.target.x, 0, this.target.z);
      this.marker.visible = true;
    } else {
      this.marker.visible = false;
    }
  }

  objectiveText() {
    const def = this.current;
    if (this.state !== 'active' || !def) return '';
    let text = def.name + ' — ' + def.objective;
    if (def.id === 'cab' && this.stage === 1) text = def.name + ' — Passenger aboard. Drive them to the drop-off marker.';
    if (def.id === 'score' && this.stage === 1) text = def.name + ' — Cash grabbed! Lose the cops and reach the safehouse marker.';
    if (def.id === 'heat' && this.heatReached) text = def.name + ' — Heat is on! Now shake the cops and get wanted back to 0.';
    if (def.timeLimit) text += '  [' + formatTime(this.timer) + ']';
    return text;
  }

  // Called every frame while a mission is active. Returns an event string
  // ('complete' | 'failed' | 'stage' | null) for main.js to act on.
  update(dt, ctx) {
    const def = this.current;
    if (this.state !== 'active' || !def) return null;
    // Spin the diamond.
    const diamond = this.marker.getObjectByName('diamond');
    if (diamond) diamond.rotation.y += dt * 2.4;

    if (def.timeLimit) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.fail();
        return 'failed';
      }
    }

    const p = ctx.playerPos;
    const nearTarget = this.target && Math.hypot(p.x - this.target.x, p.z - this.target.z) < 4.5;

    if (def.id === 'wheels') {
      if (nearTarget && ctx.inCar) {
        return this.complete(ctx);
      }
    } else if (def.id === 'cab') {
      if (this.stage === 0) {
        if (nearTarget && ctx.inCar) {
          this.stage = 1;
          this.target = farRoadPoint(this.rng, p, 60);
          this.placeMarker();
          return 'stage';
        }
      } else if (nearTarget) {
        return this.complete(ctx);
      }
    } else if (def.id === 'delivery') {
      if (nearTarget) return this.complete(ctx);
    } else if (def.id === 'heat') {
      if (ctx.wanted >= 2) this.heatReached = true;
      if (this.heatReached && ctx.wanted === 0) return this.complete(ctx);
    } else if (def.id === 'score') {
      if (this.stage === 0 && nearTarget) {
        this.stage = 1;
        this.cashGrabbed = true;
        this.target = { x: nearestRoad(-105), z: nearestRoad(105) };
        this.placeMarker();
        if (ctx.onGrab) ctx.onGrab();
        return 'stage';
      }
      if (this.stage === 1 && nearTarget && ctx.wanted === 0) {
        return this.complete(ctx);
      }
    }
    return null;
  }

  complete(ctx) {
    const def = this.current;
    this.state = 'done';
    this.marker.visible = false;
    this.done += 1;
    this.index += 1;
    if (ctx.onReward) ctx.onReward(def.reward);
    return 'complete';
  }

  fail() {
    this.state = 'idle';
    this.marker.visible = false;
  }

  // Start the next mission (after a completed/failed one).
  next(playerPos) {
    this.state = 'idle';
    if (this.allDone) return null;
    return this.start(playerPos);
  }

  statusLine() {
    if (this.allDone) return 'All jobs done — Solmar Bay is yours, legend.';
    const def = this.current;
    if (!def) return '';
    if (this.state === 'active') return this.objectiveText();
    return 'Next job: ' + def.name + ' (' + formatMoney(def.reward) + ') — press M to start.';
  }
}

export { MISSION_DEFS };
