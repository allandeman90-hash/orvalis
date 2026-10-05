// Targeted end-of-checkpoint smoke for V1.2.
//
// This deliberately does not reuse the broad historical `--tag=model` smoke: the debug overlay now starts hidden
// by design, while several older suites still assume its text is continuously populated. This smoke exercises the
// current user-visible contract instead: the panel starts closed, F3 opens it, and model/character debug controls
// then refresh it. It runs the same built site on WebGL2 and real WebGPU software backends.
import { readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const engineDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(engineDir, 'dist');
const indexPath = path.join(distDir, 'index.html');
const PORT = 4174;
const BASE_URL = `http://127.0.0.1:${PORT}/`;

if (!existsSync(indexPath)) {
  console.error('v1.2 smoke: engine/dist/index.html missing — run the build first');
  process.exit(1);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.map': 'application/json',
};
const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const relative = url === '/' ? 'index.html' : url.replace(/^\//, '');
  const file = path.resolve(distDir, relative);
  if (!file.startsWith(`${distDir}${path.sep}`) || !existsSync(file)) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((resolve, reject) => server.once('error', reject).listen(PORT, '127.0.0.1', resolve));

const BASE_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const WEBGPU_ARGS = ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader'];
const browsers = [];
const failures = [];

function fail(label, message) {
  failures.push(`[${label}] ${message}`);
}

async function launchWebGL2() {
  const browser = await chromium.launch({ args: BASE_ARGS });
  browsers.push(browser);
  return browser;
}

async function launchWebGPU() {
  // Full Chromium + software Vulkan is the combination already used by the main smoke runner for a presentable
  // WebGPU canvas in headless CI.
  const browser = await chromium.launch({ channel: 'chromium', args: [...BASE_ARGS, ...WEBGPU_ARGS] });
  browsers.push(browser);
  const page = await browser.newPage();
  await page.goto(`${BASE_URL}?engine=new&renderer=webgl2`, { waitUntil: 'load' });
  const adapter = await page.evaluate(async () => {
    const value = await navigator.gpu?.requestAdapter();
    return value ? `${value.info?.vendor ?? '?'}/${value.info?.architecture ?? '?'}` : null;
  });
  await page.close();
  if (!adapter) throw new Error('WebGPU adapter unavailable with the CI software-Vulkan launch options');
  console.log(`v1.2 smoke: WebGPU adapter ${adapter}`);
  return browser;
}

async function openModelPage(browser, renderer, query, label) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') fail(label, `console.${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => fail(label, `pageerror: ${error.message}`));
  page.on('requestfailed', (request) => fail(label, `requestfailed: ${request.url()}`));

  const response = await page.goto(`${BASE_URL}?engine=new&renderer=${renderer}&scene=model&textures=solid&${query}`, { waitUntil: 'load' });
  if (!response?.ok()) fail(label, `HTTP ${response?.status() ?? 'no response'}`);
  await page.waitForSelector('#boot-status[data-state="ready"]', { state: 'attached', timeout: 30000 });

  const backend = await page.evaluate(() => window.__orvalisEngine?.backend ?? null);
  if (backend !== renderer) fail(label, `requested ${renderer}, engine reports ${String(backend)}`);

  const startsHidden = await page.evaluate(() => document.getElementById('debug-overlay')?.hidden ?? null);
  if (startsHidden !== true) fail(label, 'debug stats must start hidden');

  await page.keyboard.press('F3');
  await page.waitForFunction(() => {
    const overlay = document.getElementById('debug-overlay');
    return overlay && !overlay.hidden && overlay.textContent.includes('Models:');
  }, null, { timeout: 5000 });
  return page;
}

async function checkBackend(browser, renderer) {
  const display = renderer === 'webgpu' ? 'WebGPU' : 'WebGL2';

  const modelLabel = `${display} model`;
  const model = await openModelPage(browser, renderer, 'pitch=0&heading=90&modelDebug=bones', modelLabel);
  const modelState = await model.evaluate(() => ({
    text: document.getElementById('debug-overlay')?.textContent ?? '',
    draws: Number(document.getElementById('boot-status')?.dataset.drawCalls),
    triangles: Number(document.getElementById('boot-status')?.dataset.triangles),
  }));
  const modelLine = 'Models: 1 model · 1 instance(s) · 68 vertices · 44 triangles · view bones (M)';
  if (!modelState.text.split('\n').includes(modelLine)) fail(modelLabel, `missing overlay line: ${modelLine}`);
  if (modelState.draws !== 1 || modelState.triangles !== 44) fail(modelLabel, `expected 1 draw / 44 triangles, got ${modelState.draws} / ${modelState.triangles}`);
  await model.keyboard.press('KeyM');
  await model.waitForFunction(() => /Models: .* · view lit \(M\)/m.test(document.getElementById('debug-overlay')?.textContent ?? ''), null, { timeout: 5000 });
  await model.close();

  const characterLabel = `${display} character`;
  const character = await openModelPage(browser, renderer, 'model=character&anim=off&pitch=0&heading=180', characterLabel);
  const characterState = await character.evaluate(() => ({
    text: document.getElementById('debug-overlay')?.textContent ?? '',
    draws: Number(document.getElementById('boot-status')?.dataset.drawCalls),
    texture: window.__orvalisEngine?.getCharacterTexture?.() ?? null,
  }));
  if (!characterState.text.includes('Character: hair 1 (1)')) fail(characterLabel, 'baseline semantic character line missing from overlay');
  if (!characterState.text.includes('Texture: 256 × 256 composite')) fail(characterLabel, 'character composite line missing from overlay');
  if (!characterState.texture) fail(characterLabel, 'character composite test hook returned no texture state');
  if (characterState.draws !== 4) fail(characterLabel, `baseline character should use 4 visible-section draws, got ${characterState.draws}`);

  await character.keyboard.press('Digit1');
  await character.keyboard.press('Digit1');
  await character.waitForFunction(() => (document.getElementById('debug-overlay')?.textContent ?? '').includes('Character: hair 3 (1)'), null, { timeout: 5000 });
  await character.close();

  console.log(`v1.2 smoke: ${display} model + character PASS`);
}

try {
  const webgl2 = await launchWebGL2();
  await checkBackend(webgl2, 'webgl2');
  const webgpu = await launchWebGPU();
  await checkBackend(webgpu, 'webgpu');
} catch (error) {
  failures.push(error instanceof Error ? error.stack ?? error.message : String(error));
} finally {
  for (const browser of browsers) await browser.close();
  server.close();
}

if (failures.length > 0) {
  console.error(`v1.2 smoke: FAIL\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log('v1.2 smoke: PASS — overlay closed by default, F3/debug controls, model fixture and character fixture verified on WebGL2 + WebGPU');
