#!/usr/bin/env node
/**
 * Rend la vidéo de présentation (marketing/motion/index.html) en MP4 vertical 1080 × 1920, 30 images/s, sans son.
 * Chaque image est calculée par window.seek(t) puis photographiée : le résultat est parfaitement fluide.
 * Usage : node marketing/motion/render.mjs [sortie.mp4]   (nécessite Playwright et ffmpeg)
 */
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, extname, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const OUT = resolve(process.argv[2] || join(HERE, 'flashmiam-presentation.mp4'));
const FPS = 30;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.woff2': 'font/woff2' };

const server = createServer(async (req, res) => {
  try {
    const path = join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!path.startsWith(ROOT)) throw new Error('hors du dépôt');
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
    res.end(await readFile(path));
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const port = server.address().port;

const frames = await mkdtemp(join(tmpdir(), 'flashmiam-motion-'));
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
  await page.goto(`http://localhost:${port}/marketing/motion/index.html`);
  await page.evaluate(() => document.fonts.ready);
  const ok = await page.evaluate(() => document.fonts.check('850 40px Archivo'));
  if (!ok) throw new Error('police Archivo non chargée');
  const duration = await page.evaluate(() => window.DURATION);
  const total = Math.round(duration * FPS);
  for (let f = 0; f < total; f++) {
    await page.evaluate((t) => window.seek(t), f / FPS);
    await page.screenshot({ path: join(frames, String(f).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 94, clip: { x: 0, y: 0, width: 540, height: 960 } });
    if (f % 60 === 0) process.stdout.write(`image ${f}/${total}\n`);
  }
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(frames, '%05d.jpg'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT], { stdio: 'inherit' });
  console.log('vidéo : ' + OUT);
} finally {
  await browser.close();
  server.close();
  await rm(frames, { recursive: true, force: true });
}
