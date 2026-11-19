// Solmar Bay — story missions for Dana Vega, courier of Solmar Bay.
// Five short missions with waypoints, timers and cash rewards.
import * as THREE from 'three';
import { dist2d, formatCash, formatTime } from './util.js';

export const MISSIONS = [
  {
    id: 1, title: 'Hot Wheels',
    briefing: 'Dana needs wheels. Steal any car, then drive it to the Docks — the crew is waiting.',
    objective: 'Steal a car and drive to the Docks',
    reward: 500,
    waypoint: new THREE.Vector3(0, 0, 300),
    type: 'steal-and-drive',
  },
  {
    id: 2, title: 'Express Run',
    briefing: 'A package for the Northside penthouse. 100 seconds on the clock — drive like it matters.',
    objective: 'Deliver the package to Northside before time runs out',
    reward: 800,
    waypoint: new THREE.Vector3(-224, 0, -224),
    type: 'timed-delivery',
    timeLimit: 100,
  },
  {
    id: 3, title: 'Cool Down',
    briefing: 'The Bay PD is watching. Get the heat up to 2 stars, then shake it off completely.',
    objective: 'Reach 2 wanted stars, then lose the heat (0 stars)',
    reward: 600,
    waypoint: null,
    type: 'lose-heat',
  },
  {
    id: 4, title: 'Dockside Brawl',
    briefing: 'Rico’s enforcers are shaking down the docks. Go there and send them packing.',
    objective: 'Defeat the 4 enforcers at the Docks',
    reward: 1000,
    waypoint: new THREE.Vector3(0, 0, 300),
    type: 'fight',
    enemyCount: 4,
  },
  {
    id: 5, title: 'The Big Score',
    briefing: 'The finale. The whole Bay PD is on you — reach the old airport with the heat still on.',
    objective: 'Reach the Old Airport with at least 2 wanted stars',
    reward: 2000,
    waypoint: new THREE.Vector3(252, 0, -252),
    type: 'finale',
  },
];

export class MissionManager {
  constructor(cb) {
    this.cb = cb; // { onMessage, onComplete, onFail, onSpawnEnforcers, onSetWanted }
    this.index = 0;          // next mission to play (0-based)
    this.active = null;      // { def, timer, phase, reachedTwoStars }
    this.completed = 0;
    this.enemiesLeft = 0;
  }

  get currentDef() {
    return MISSIONS[this.index] || null;
  }

  startNext() {
    const def = this.currentDef;
    if (!def) return null;
    this.active = { def, timer: def.timeLimit || 0, phase: 'active', reachedTwoStars: false };
    if (def.type === 'fight') {
      this.enemiesLeft = def.enemyCount;
      this.cb.onSpawnEnforcers && this.cb.onSpawnEnforcers(def.enemyCount, def.waypoint);
    }
    if (def.type === 'finale') {
      this.cb.onSetWanted && this.cb.onSetWanted(3);
    }
    this.cb.onMessage && this.cb.onMessage('Mission: ' + def.title + ' — ' + def.briefing);
    return def;
  }

  complete() {
    const def = this.active.def;
    this.cb.onComplete && this.cb.onComplete(def);
    this.completed += 1;
    this.index += 1;
    this.active = null;
  }

  fail(reason) {
    const def = this.active.def;
    this.active = null;
    this.cb.onFail && this.cb.onFail(def, reason);
  }

  objectiveText() {
    if (!this.active) {
      if (this.index >= MISSIONS.length) return 'All missions complete — Solmar Bay is yours, Dana.';
      return 'Press N to start the next mission.';
    }
    const def = this.active.def;
    let text = 'Mission ' + def.id + ': ' + def.title + ' — ' + def.objective;
    if (def.type === 'timed-delivery') text += '  [' + formatTime(this.active.timer) + ']';
    if (def.type === 'fight') text += '  [' + this.enemiesLeft + ' enforcers left]';
    if (def.type === 'lose-heat' && this.active.reachedTwoStars) text += '  [heat reached — now lose it!]';
    return text;
  }

  update(dt, ctx) {
    if (!this.active) return;
    const def = this.active.def;
    const p = ctx.playerPos;
    if (def.type === 'timed-delivery') {
      this.active.timer -= dt;
      if (this.active.timer <= 0) { this.fail('Out of time — the client walked away.'); return; }
    }
    if (def.type === 'lose-heat') {
      if (ctx.wanted >= 2) this.active.reachedTwoStars = true;
      if (this.active.reachedTwoStars && ctx.wanted === 0) { this.complete(); return; }
    }
    if (def.type === 'fight') {
      if (this.enemiesLeft <= 0) { this.complete(); return; }
    }
    if (def.waypoint && (def.type === 'steal-and-drive' || def.type === 'timed-delivery' || def.type === 'finale')) {
      const d = dist2d(p.x, p.z, def.waypoint.x, def.waypoint.z);
      const needCar = def.type === 'steal-and-drive';
      const arrived = d < 14 && (!needCar || ctx.driving);
      if (def.type === 'finale' && d < 16 && ctx.wanted >= 2) { this.complete(); return; }
      if (def.type === 'finale' && d < 16 && ctx.wanted < 2) {
        // Arrived cold: keep the mission open, tell the player.
        if (!this.active.warnedCold) {
          this.active.warnedCold = true;
          this.cb.onMessage && this.cb.onMessage('Too quiet — get the heat back to 2 stars, then come here.');
        }
      }
      if (arrived && def.type !== 'finale') { this.complete(); return; }
    }
  }

  // Called when the player steals a car (mission 1 flavour).
  onCarStolen() {
    if (this.active && this.active.def.type === 'steal-and-drive') {
      this.cb.onMessage && this.cb.onMessage('Nice. Now drive it to the Docks — follow the gold marker.');
    }
  }

  onEnforcerDown() {
    if (this.active && this.active.def.type === 'fight') {
      this.enemiesLeft = Math.max(0, this.enemiesLeft - 1);
    }
  }

  rewardText(def) {
    return 'Mission complete: ' + def.title + ' — +' + formatCash(def.reward);
  }
}
