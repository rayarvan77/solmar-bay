# solmar-bay

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/rayarvan77/solmar-bay/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/rayarvan77/solmar-bay/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Solmar Bay is an open-world 3D crime game in the browser, built for the [Make GTA 6](https://make.fun/bounty/gta6-01) bounty on make.fun. A procedural 10×10 city, drivable cars and traffic, pedestrians, a 0–5 wanted system with police chases, five missions from Dana Vega, combat, a HUD with minimap, localStorage saves, and synthesised WebAudio sound — no network calls while playing, and every run of the city is seeded and deterministic.

## Run it

```sh
node serve.ts
```

Then open http://127.0.0.1:8080/ in a desktop browser.

## How to play

- **WASD / arrows** — move on foot, drive when in a car
- **Mouse drag** — orbit the camera (arrow keys turn it too)
- **E** — enter / exit the nearest car (stealing one raises your wanted level)
- **Space** — punch · **Click** — shoot · **Shift** — run
- **Wanted 0–5** — crimes (car theft, hitting pedestrians, shooting) raise it; police cruisers spawn and chase you. Lay low and the heat fades.
- **Missions** — follow the yellow beacon. Five jobs from Dana Vega pay $200–$1,500; progress and cash are saved to localStorage.

## Screenshots

Deterministic scenes, reproducible with `?shot=1..4`:

1. `screenshots/1-start.jpg` — opening view over the city
2. `screenshots/2-play.jpg` — driving down the avenue
3. `screenshots/3-chase.jpg` — police chase at wanted level 3
4. `screenshots/4-mission.jpg` — at the mission beacon

## Layout

- `game/` — the game itself: `index.html` plus `src/` modules (city, vehicles, peds, police, missions, HUD, audio, shots), three.js vendored under `game/vendor/`
- `main.ts` — entrypoint: copies `game/` and `screenshots/` to `$MAKEFUN_OUTPUT_DIR` and writes `dossier.json`
- `serve.ts` — tiny static dev server for play-testing
- `shots.json` — the four deterministic screenshot scenes

---

<sub>Entered on [make.fun](https://make.fun/?ref=kkgmy690&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
