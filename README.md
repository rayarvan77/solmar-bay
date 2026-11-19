# solmar-bay

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/rayarvan77/solmar-bay/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/rayarvan77/solmar-bay/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Solmar Bay is a complete open-world crime game in the spirit of GTA 6, built from scratch in three.js. Explore a procedural 10×10-block city on foot and by car, steal vehicles, dodge traffic and pedestrians, earn a wanted level and outrun the police, and run five story jobs for Dana Vega. It has combat, a HUD with a live minimap, synthesized WebAudio sound (engine hum, sirens, cash chimes), a save that persists in localStorage, and deterministic screenshot scenes. Everything — the city, the characters, the story, the art and the sound — is original. It runs from static files with no network requests.

## Run it

```sh
node serve.ts
# open http://127.0.0.1:8080/ in a desktop browser
```

To build the entry output (what the make.fun scorer reads):

```sh
MAKEFUN_OUTPUT_DIR=/tmp/solmar-out node main.ts
```

## Controls

- WASD move · Shift run · Mouse look (click the game to lock the mouse)
- E get in / out of a car · F punch · Click shoot
- Tab open Dana's phone (missions) · M mute
- Space brake while driving · jump on foot

## How it works

- `game/index.html` — the page, HUD and start screen
- `game/src/main.js` — bootstrap, player controller, game loop, save/load
- `game/src/city.js` — the procedural city (seeded RNG, so every load is identical)
- `game/src/vehicles.js` — car physics and traffic AI on the street grid
- `game/src/peds.js` — pedestrians on the sidewalks
- `game/src/police.js` — wanted level, pursuit AI, busted
- `game/src/missions.js` — five jobs from Dana Vega
- `game/src/hud.js` — HUD and minimap
- `game/src/audio.js` — synthesized sound, no audio files
- `game/src/shots.js` — deterministic scenes for `?shot=1..4`
- `main.ts` — copies `game/` and `screenshots/` to `$MAKEFUN_OUTPUT_DIR` and writes `dossier.json`
- `serve.ts` — tiny static server for local play-testing

---

<sub>Entered on [make.fun](https://make.fun/?ref=kkgmy690&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
