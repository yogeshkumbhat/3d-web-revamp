#!/usr/bin/env node
/**
 * Builds the site into site/dist.
 *
 *   node site/build.mjs              bundle, copy fonts and the starter
 *   node site/build.mjs --posters    …and render the stills from the built scene
 *
 * The stills are never committed. They are rendered from the scene on every build by
 * scripts/capture_poster.js, so they can't drift from it (references/anti-patterns.md,
 * "Hand-exporting the poster").
 *
 * Requires: npm i --no-save three@0.169.0 esbuild@0.24.0 puppeteer sharp
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { serve } from './serve.mjs';
import { POSTERS } from './src/stations.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const dist = path.join(here, 'dist');
const withPosters = process.argv.includes('--posters');

// Keep previously rendered stills across a code-only rebuild.
const keep = path.join(repo, '.posters-cache');
if (!withPosters && fs.existsSync(path.join(dist, 'posters'))) {
  fs.rmSync(keep, { recursive: true, force: true });
  fs.renameSync(path.join(dist, 'posters'), keep);
}
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
if (fs.existsSync(keep)) fs.renameSync(keep, path.join(dist, 'posters'));

// One entry, one lazily imported chunk for the scene. Three.js lands only in the chunk.
const result = await esbuild.build({
  entryPoints: [path.join(here, 'src/main.js')],
  bundle: true,
  splitting: true,
  format: 'esm',
  target: ['es2020', 'safari15'],
  minify: true,
  legalComments: 'none',
  outdir: path.join(dist, 'src'),
  entryNames: '[name]',
  chunkNames: 'chunks/[name]-[hash]',
  metafile: true,
  logLevel: 'warning',
});

fs.copyFileSync(path.join(here, 'index.html'), path.join(dist, 'index.html'));
fs.cpSync(path.join(here, 'fonts'), path.join(dist, 'fonts'), { recursive: true });
fs.cpSync(path.join(repo, 'assets/starter'), path.join(dist, 'starter'), {
  recursive: true,
  filter: (src) => !src.endsWith('.DS_Store'),
});
fs.writeFileSync(path.join(dist, '.nojekyll'), '');

console.log('\nBundle');
for (const [file, info] of Object.entries(result.metafile.outputs)) {
  const gz = (await import('node:zlib')).gzipSync(fs.readFileSync(file)).length;
  console.log(`  ${path.relative(dist, file).padEnd(40)} ${String(Math.round(info.bytes / 1024)).padStart(4)} KB  ${String(Math.round(gz / 1024)).padStart(4)} KB gzip`);
}

if (withPosters) {
  fs.mkdirSync(path.join(dist, 'posters'), { recursive: true });
  const { url, close } = await serve(dist);
  try {
    for (const name of POSTERS) {
      console.log(`\nStill: ${name}`);
      // Async on purpose: the server above lives in this process, and a synchronous
      // child would block it from answering the very page it is capturing.
      await promisify(execFile)('node', [
        path.join(repo, 'scripts/capture_poster.js'),
        `${url}/?pose=${name}`,
        '--selector', '#scene',
        '--out', path.join(dist, 'posters'),
        '--name', name,
        '--wait', '4500',
      ]);
      const sizes = fs.readdirSync(path.join(dist, 'posters'))
        .filter((f) => f.startsWith(`${name}.`) || f.startsWith(`${name}-`))
        .map((f) => `${f} ${Math.round(fs.statSync(path.join(dist, 'posters', f)).size / 1024)}KB`);
      console.log('  ' + sizes.join('  '));
    }
  } finally {
    close();
  }
}

if (!fs.existsSync(path.join(dist, 'posters/hero.avif'))) {
  console.warn('\nNo stills in dist/posters yet — run with --posters.');
}
console.log(`\nBuilt ${path.relative(repo, dist)}/`);
