// Dana Vega's five missions for Solmar Bay. Each mission is a drive-to,
// pickup-and-deliver or escape job with a cash reward. A 3D beacon marks
// the current objective; the minimap shows it too.
import * as THREE from '../vendor/three.module.min.js';
import { dist } from './util.js';

export const MISSIONS = [
  {
    id: 1,
    name: 'First Wheels',
    giver: 'Dana Vega',
    text: 'Get a car and drive to the yellow marker.',
    reward: 200,
    type: 'drive',
    target: { x: 96, z: -64 },
  },
  {
    id: 2,
    name: 'The Pickup',
    giver: 'Dana Vega',
    text: 'Pick up the contact at the north lot, then drop them at the south docks.',
    reward: 350,
    type: 'pickup-deliver',
    pickup: { x: -96, z: 96 },
    dropoff: { x: 96, z: 96 },
  },
  {
    id: 3,
    name: 'Hot Delivery',
    giver: 'Dana Vega',
    text: 'Deliver the package to the east side. Fast — the client hates waiting.',
    reward: 500,
    type: 'drive',
    target: { x: -128, z: -32 },
    timeLimit: 75,
  },
  {
    id: 4,
    name: 'Heat Run',
    giver: 'Dana Vega',
    text: 'The cops are onto you. Reach the hideout without getting busted.',
    reward: 700,
    type: 'escape',
    target: { x: -32, z: 128 },
    wantedOnStart: 2,
  },
  {
    id: 5,
    name: 'The Big Score',
    giver: 'Dana Vega',
    text: 'Hit the bank, then lose the heat at the getaway point.',
    reward: 1500,
    type: 'two-step',
    pickup: { x: 0, z: -128 },
    dropoff: { x: 128, z: 128 },
    wantedOnStart: 3,
  },
];

export function createMissions(scene) {
  const beaconMat = new THREE.MeshLambertMaterial({
    color: 0xffcc00, emissive: 0xaa7700, transparent: true, opacity: 0.85,
  });
  const beamMat = new THREE.MeshLambertMaterial({
    color: 0xffcc00, transparent: true, opacity: 0.22,
  });
  const beacon = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.25, 24), beaconMat);
  pad.position.y = 0.15;
  beacon.add(pad);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 34, 10), beamMat);
  beam.position.y = 17;
  beacon.add(beam);
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.9),
    new THREE.MeshLambertMaterial({ color: 0xffdd33, emissive: 0x997700 }),
  );
  gem.position.y = 5;
  beacon.add(gem);
  beacon.visible = false;
  scene.add(beacon);

  const mgr = {
    index: 0, // 0-based into MISSIONS; MISSIONS.length means all done
    phase: 'target', // 'pickup' | 'dropoff' | 'target'
    timer: 0,
    completed: 0,
    beacon,
    gem,
  };

  mgr.current = function () {
    return mgr.index < MISSIONS.length ? MISSIONS[mgr.index] : null;
  };

  mgr.setCompleted = function (n) {
    mgr.completed = n;
    mgr.index = n;
    mgr.phase = 'target';
    const m = mgr.current();
    mgr.timer = m && m.timeLimit ? m.timeLimit : 0;
    mgr.placeBeacon();
  };

  mgr.placeBeacon = function () {
    const pos = mgr.markerPos();
    if (!pos) { beacon.visible = false; return; }
    beacon.visible = true;
    beacon.position.set(pos.x, 0, pos.z);
  };

  mgr.markerPos = function () {
    const m = mgr.current();
    if (!m) return null;
    if ((m.type === 'pickup-deliver' || m.type === 'two-step') && mgr.phase === 'pickup') return m.pickup;
    if ((m.type === 'pickup-deliver' || m.type === 'two-step') && mgr.phase === 'dropoff') return m.dropoff;
    return m.target;
  };

  mgr.objectiveText = function () {
    const m = mgr.current();
    if (!m) return 'All missions complete — Solmar Bay is yours, boss.';
    let t = `${m.id}. ${m.name} — ${m.text}`;
    if (m.type === 'pickup-deliver' || m.type === 'two-step') {
      t += mgr.phase === 'pickup' ? ' (go to the pickup)' : ' (go to the drop-off)';
    }
    if (m.timeLimit) t += ` — ${Math.max(0, Math.ceil(mgr.timer))}s left`;
    return t;
  };

  // Returns an event object or null: {type:'completed'|'stage'|'failed'|'wanted', ...}
  mgr.update = function (dt, playerPos, time) {
    const m = mgr.current();
    if (!m) return null;
    // Beacon bob + pulse.
    mgr.gem.position.y = 5 + Math.sin(time * 2.2) * 0.7;
    mgr.gem.rotation.y = time * 1.5;
    if (m.timeLimit) {
      mgr.timer -= dt;
      if (mgr.timer <= 0) {
        mgr.timer = m.timeLimit;
        mgr.phase = 'target';
        mgr.placeBeacon();
        return { type: 'failed', reason: 'Too slow — the client walked away. Try again.' };
      }
    }
    const target = mgr.markerPos();
    if (!target) return null;
    if (dist(playerPos.x, playerPos.z, target.x, target.z) < 7) {
      if ((m.type === 'pickup-deliver' || m.type === 'two-step') && mgr.phase === 'pickup') {
        mgr.phase = 'dropoff';
        mgr.placeBeacon();
        return { type: 'stage', text: 'Got it. Now to the drop-off.' };
      }
      // Mission complete.
      const reward = m.reward;
      mgr.completed++;
      mgr.index++;
      mgr.phase = 'target';
      const next = mgr.current();
      mgr.timer = next && next.timeLimit ? next.timeLimit : 0;
      mgr.placeBeacon();
      const ev = { type: 'completed', mission: m, reward };
      if (next && next.wantedOnStart) ev.wanted = next.wantedOnStart;
      return ev;
    }
    return null;
  };

  // Call when a mission becomes active (first start or after a completion).
  mgr.wantedForCurrent = function () {
    const m = mgr.current();
    return m && m.wantedOnStart ? m.wantedOnStart : 0;
  };

  mgr.placeBeacon();
  return mgr;
}
