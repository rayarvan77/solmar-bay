# solmar-bay

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/rayarvan77/solmar-bay/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/rayarvan77/solmar-bay/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Solmar Bay is an open-world 3D crime game in the browser: a procedural 10×10-block city, drivable cars and traffic, pedestrians, a 0–5 star wanted system with police pursuits, eight story jobs from Dana Vega, combat, a minimap, synthesized sound, and localStorage saves. Built with three.js (vendored) and no network requests at runtime. Round 3 adds a golden-hour art pass — the bay and low sunset sun along the north shore, beach strollers on the sand — plus police roadblocks with a dispatch radio banner and three new jobs.

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

Ten by ten blocks of seeded, deterministic streets: towers of varied heights, road markings, lamps and palms, and the open bay with its beach along the north edge under a low golden-hour sun. Traffic follows the road grid and turns at intersections — some of it slow beachfront cruisers in sunset orange and bay teal; pedestrians stroll the sidewalks (and the sand) and flee when trouble starts. Wanted heat rises with car theft, assaults and reckless driving near police, and cools off when you lay low; at three stars dispatch radios every unit in and a roadblock goes up on Marina Row. Finish all eight jobs — First Wheels, Cab Fare, Hot Delivery, Lose the Heat, The Big Score, Sunset Courier, Night Fare, and Lay Low — to own Solmar Bay.

## Screenshots

`shots.json` lists the four deterministic scenes (`?shot=1..4`): the title screen on the beach with the bay and sunset behind it, driving, a police chase with a roadblock and dispatch banner, and a mission at the gold beacon.

---

<sub>Entered on [make.fun](https://make.fun/?ref=kkgmy690&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
