// Solmar Bay — serve.ts (Node 22, standard library only).
// A tiny static server for game/ on 127.0.0.1:8080, for local play-testing.
// Rejects any path that climbs out of game/ (path-traversal guard).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const gameDir = resolve(join(here, 'game'));
const PORT = Number(process.env.PORT || 8080);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/index.html';
    const target = resolve(join(gameDir, normalize(rel)));
    // Path-traversal guard: the resolved file must stay under game/.
    if (!target.startsWith(gameDir + '/') && target !== gameDir) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('forbidden\n');
      return;
    }
    const data = await readFile(target);
    res.writeHead(200, {
      'content-type': MIME[extname(target)] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(data);
  } catch (e) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found\n');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Solmar Bay: serving game/ at http://127.0.0.1:${PORT}/`);
});
