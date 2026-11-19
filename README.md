# solmar-bay

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/rayarvan77/solmar-bay/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/rayarvan77/solmar-bay/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Solmar Bay is an open-world 3D crime game in the browser: a procedural 10×10-block city, drivable cars and traffic, pedestrians, a 0–5 star wanted system with police pursuits, five story jobs from Dana Vega, combat, a minimap, synthesized sound, and localStorage saves. Built with three.js (vendored) and no network requests at runtime.

## Run it

```sh
node serve.ts
```

Then open http://127.0.0.1:8080/ in a desktop browser. `node main.ts` writes the entry dossier to `$MAKEFUN_OUTPUT_DIR` (default `/output`).

## Controls

- **WASD** — move on foot / drive
- **Mouse** — look around (click the game to lock the pointer)
- **E** — enter / exit a car
- **F** — punch, **Click** — shoot
- **M** — start the next job from Dana Vega
- **H** — horn

## The city

Ten by ten blocks of seeded, deterministic streets: towers of varied heights, road markings, lamps and palms. Traffic follows the road grid and turns at intersections; pedestrians stroll the sidewalks and flee when trouble starts. Wanted heat rises with car theft, assaults and reckless driving near police, and cools off when you lay low. Finish all five jobs — First Wheels, Cab Fare, Hot Delivery, Lose the Heat, and The Big Score — to own Solmar Bay.

## Screenshots

`shots.json` lists the four deterministic scenes (`?shot=1..4`): the title screen, driving, a police chase, and a mission at the gold beacon.

---

<sub>Entered on [make.fun](https://make.fun/?ref=kkgmy690&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
