/**
 * Minimal static server for the build, the poster capture and the verification.
 * Gzips text responses the way GitHub Pages does, so transfer sizes measured locally
 * are the ones visitors actually pay.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.jsx': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.avif': 'image/avif',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
};
const COMPRESS = /^(text\/|application\/json|image\/svg)/;

export function serve(dir, port = 0) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let file = path.join(dir, decodeURIComponent(url.pathname));
    if (!file.startsWith(dir)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404).end('not found'); return; }
    const type = TYPES[path.extname(file)] ?? 'application/octet-stream';
    let body = fs.readFileSync(file);
    const headers = { 'content-type': type, 'cache-control': 'no-cache' };
    if (COMPRESS.test(type) && /gzip/.test(req.headers['accept-encoding'] ?? '')) {
      body = zlib.gzipSync(body, { level: 9 });
      headers['content-encoding'] = 'gzip';
    }
    headers['content-length'] = body.length;
    res.writeHead(200, headers).end(body);
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => {
    resolve({ server, url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() });
  }));
}

// `node site/serve.mjs [dir] [port]` — for looking at the build by hand.
if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const dir = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist'));
  const { url } = await serve(dir, Number(process.argv[3] ?? 8080));
  console.log(`Serving ${dir} at ${url}`);
}
