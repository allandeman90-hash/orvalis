import { chromium } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const tag = process.argv[2] || 'after';
const output = path.join(root, 'validation', tag);
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', e => errors.push(e.stack));
await page.goto(new URL('../dist/test.html', import.meta.url).href);
await page.waitForFunction(() => window.__ready, null, { timeout: 180000 });
await page.evaluate(() => { const d = window.__dbg; d.quick('guerrier', 0, 30); d.G.player.god = true; d.G.flags.fixedTime = .42; d.G.settings.autoPerf = false; });
const views = [['village', -370, 30, -1.9], ['forest', -300, 330, .6], ['mountain', -300, -330, 1.2], ['combat', -300, 60, 2.4]];
const results = [];
for (const [name, x, z, yaw] of views) {
  await page.evaluate(({ x, z, yaw }) => { const { G, tp } = window.__dbg; tp(x, z); G.cam.yaw = yaw; G.cam.pitch = .2; G.cam.dist = G.cam.targetDist = 9; G.cam.first = true; }, { x, z, yaw });
  await page.waitForTimeout(2500);
  results.push(await page.evaluate(async name => {
    const frames = []; let previous = performance.now();
    for (let i = 0; i < 100; i++) await new Promise(resolve => requestAnimationFrame(t => { frames.push(t - previous); previous = t; resolve(); }));
    frames.sort((a,b) => a-b);
    const { G } = window.__dbg;
    return { name, medianMs: frames[50], p95Ms: frames[95], render: {...G.renderer.info.render}, memory: {...G.renderer.info.memory}, position: G.player.pos.toArray(), renderer: G.renderer.getContext().getParameter(G.renderer.getContext().RENDERER) };
  }, name));
  await page.screenshot({ path: path.join(output, name + '.png') });
  console.log(name, results.at(-1).medianMs);
}
fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ viewport: [1920,1080], results, errors }, null, 2));
await browser.close();
if (errors.length) { console.error(errors); process.exitCode = 1; }
