// Solmar Bay entrypoint (node22, stdlib only).
// Copies game/ and screenshots/ next to this file into $MAKEFUN_OUTPUT_DIR
// (default /output), then writes /output/dossier.json with the starter kit's
// buildDossier, so the grader can score the game from the dossier alone.
import { cpSync, existsSync, mkdirSync, writeFileSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const outDir: string = resolve(process.env.MAKEFUN_OUTPUT_DIR || '/output');
const root: string = dirname(fileURLToPath(import.meta.url));

// Pre-flight: the entry is not submittable without the game and its renders.
// Fail here with a plain message instead of a deep DossierError later.
const gameDir = join(root, 'game');
const shotsDir = join(root, 'screenshots');
if (!existsSync(gameDir)) {
  throw new Error(`Solmar Bay: game/ is missing next to main.ts (${gameDir})`);
}
if (!existsSync(shotsDir)) {
  throw new Error(`Solmar Bay: screenshots/ is missing next to main.ts (${shotsDir}) — capture ?shot=1..4 first`);
}
const shotFiles = readdirSync(shotsDir).filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f));
if (shotFiles.length < 3 || shotFiles.length > 4) {
  throw new Error(`Solmar Bay: screenshots/ must hold 3 or 4 renders, found ${shotFiles.length}`);
}

mkdirSync(outDir, { recursive: true });

for (const name of ['game', 'screenshots']) {
  const src = join(root, name);
  if (existsSync(src)) {
    cpSync(src, join(outDir, name), { recursive: true });
  }
}

const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
const dossierPath = join(outDir, 'dossier.json');
writeFileSync(dossierPath, dossier);

// Post-write check: the dossier must be readable JSON, or the run is broken.
const parsed = JSON.parse(readFileSync(dossierPath, 'utf8'));
if (typeof parsed !== 'object' || parsed === null || !('schema' in parsed)) {
  throw new Error('Solmar Bay: dossier.json did not parse into a dossier object');
}
const dossierBytes = statSync(dossierPath).size;

const gameFiles = readdirSync(join(outDir, 'game'), { recursive: true }).length;
const shots = existsSync(join(outDir, 'screenshots'))
  ? readdirSync(join(outDir, 'screenshots')).length
  : 0;
console.log(`Solmar Bay: copied ${gameFiles} game entries and ${shots} screenshots to ${outDir}; dossier.json written (${dossierBytes} bytes, schema ${parsed.schema}).`);
