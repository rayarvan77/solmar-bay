// Solmar Bay — main.ts (Node 22, standard library only).
// Copies game/ and screenshots/ next to this file into $MAKEFUN_OUTPUT_DIR
// (default /output), then writes /output/dossier.json with buildDossier
// from ./vendor/makefun-game.ts.
import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = dirname(fileURLToPath(import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR || '/output';

const gameSrc = join(here, 'game');
const shotsSrc = join(here, 'screenshots');
if (!existsSync(join(gameSrc, 'index.html'))) {
  throw new Error(`main.ts: game/index.html not found next to main.ts (${gameSrc})`);
}
// Fail fast with a clear message when the screenshots are missing: the
// dossier builder refuses an entry with no screenshots, so check first.
const shotFiles = existsSync(shotsSrc)
  ? readdirSync(shotsSrc).filter((f) => /\.(jpe?g|png)$/i.test(f))
  : [];
if (shotFiles.length === 0) {
  throw new Error(
    'main.ts: screenshots/ holds no image — take the ?shot=1..4 screenshots first ' +
    '(see shots.json), the dossier needs at least one as the cover',
  );
}

mkdirSync(out, { recursive: true });
cpSync(gameSrc, join(out, 'game'), { recursive: true });
cpSync(shotsSrc, join(out, 'screenshots'), { recursive: true });

const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), dossier);
const shotSizes = shotFiles.map((f) => `${f} ${statSync(join(shotsSrc, f)).size}B`).join(', ');
console.log(`Solmar Bay: wrote ${out} (dossier.json ${dossier.length} bytes; screenshots: ${shotSizes})`);
