import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const engineDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(engineDir, 'dist');
const pageFile = path.join(dist, 'art-review.html');
const outputDir = path.join(engineDir, 'artifacts');
const screenshotFile = path.join(outputDir, 'art-review.png');
const PORT = 4174;
const BASE_URL = `http://127.0.0.1:${PORT}/`;

if (!existsSync(pageFile)) throw new Error('art-review smoke: dist/art-review.html missing — run the engine build first');
mkdirSync(outputDir, { recursive: true });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary' };
const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let file = path.join(dist, url === '/' ? 'art-review.html' : url);
  if (!file.startsWith(dist) || !existsSync(file)) return void res.writeHead(404).end('not found');
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((resolve, reject) => server.once('error', reject).listen(PORT, '127.0.0.1', resolve));

const executablePath = process.env.CHROMIUM_PATH || '/usr/bin/google-chrome';
if (!existsSync(executablePath)) throw new Error(`art-review smoke: Chrome not found at ${executablePath}`);

const problems = [];
let browser;
let page;
try {
  browser = await chromium.launch({ executablePath, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console.error: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => problems.push(`requestfailed: ${request.url()} · ${request.failure()?.errorText ?? 'unknown'}`));

  const response = await page.goto(`${BASE_URL}art-review.html`, { waitUntil: 'load', timeout: 30000 });
  if (!response?.ok()) problems.push(`HTTP ${response?.status() ?? 'no response'}`);
  await page.waitForFunction(() => document.body.dataset.state !== 'loading', null, { timeout: 30000 }).catch(() => problems.push('page stayed in loading state'));
  await page.waitForTimeout(750);

  const state = await page.evaluate(() => ({
    state: document.body.dataset.state ?? '',
    loaded: Number(document.body.dataset.loaded ?? 0),
    failed: Number(document.body.dataset.failed ?? 0),
    status: document.getElementById('status')?.textContent ?? '',
    canvas: (() => { const r = document.getElementById('game')?.getBoundingClientRect(); return r ? { width: r.width, height: r.height } : null; })(),
  }));
  if (state.state !== 'ready') problems.push(`state=${state.state || '<empty>'}: ${state.status}`);
  if (state.loaded < 1) problems.push(`loaded=${state.loaded}; at least one real GLB must load`);
  if (state.failed !== 0) problems.push(`failed=${state.failed}; all art-review candidates must load`);
  if (!state.canvas || state.canvas.width < 1000 || state.canvas.height < 600) problems.push(`canvas size invalid: ${JSON.stringify(state.canvas)}`);

  await page.screenshot({ path: screenshotFile, fullPage: true });
  console.log(`art-review smoke: ${state.loaded} loaded / ${state.failed} failed · ${state.status}`);
  console.log(`art-review smoke: screenshot ${screenshotFile}`);
} finally {
  await page?.close().catch(() => {});
  await browser?.close().catch(() => {});
  server.close();
}

if (problems.length) {
  console.error(`art-review smoke failed:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log('art-review smoke: PASS');
