// Solmar Bay — make.fun entrypoint (Node 22, standard library only).
// Copies game/ and screenshots/ next to this file into $MAKEFUN_OUTPUT_DIR
// (default /output) and writes /output/dossier.json from the starter kit's
// buildDossier, so the scorer can verify the game and its screenshots.
// Fails fast with a plain message when an input is missing, so a bad run
// is obvious before anything is copied.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(process.env.MAKEFUN_OUTPUT_DIR || '/output');

function fail(msg) {
  console.error('main.ts: ' + msg);
  process.exit(1);
}

// Pre-flight: both inputs must exist, and screenshots/ must hold at least
// one image (the first is the cover) or buildDossier refuses the dossier.
for (const name of ['game', 'screenshots']) {
  if (!existsSync(join(here, name))) fail('missing input directory: ' + join(here, name));
}
const shots = readdirSync(join(here, 'screenshots')).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
if (shots.length === 0) fail('screenshots/ holds no image: take the four shots first (see shots.json)');

mkdirSync(out, { recursive: true });

for (const name of ['game', 'screenshots']) {
  cpSync(join(here, name), join(out, name), { recursive: true });
}

const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});

const dossierPath = join(out, 'dossier.json');
writeFileSync(dossierPath, dossier);
console.log('Solmar Bay: wrote ' + dossierPath);
console.log('  screenshots: ' + shots.length + ' (' + shots.join(', ') + ')');
console.log('  dossier bytes: ' + statSync(dossierPath).size);
// Round 3 dossier (24 Nov 2026): golden-hour art pass, bay + sunset,
// police roadblock + dispatch banner, 8 missions, all-file touch-ups.
console.log('  round 3: golden-hour art pass, bay + sunset, roadblock + dispatch, 8 missions');
