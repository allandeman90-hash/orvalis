// Runtime smoke tests: serve the built Orvalis site (bootstrap + new engine + legacy game page), open it in
// headless Chromium, and fail on any console error / page error / wrong pixel.
//
// The tests are grouped in SUITES, each with tags. A run names what it wants:
//   node scripts/smoke.mjs --suite=model-skeleton            one suite (or several, comma-separated)
//   node scripts/smoke.mjs --tag=water                       every suite carrying a tag
//   node scripts/smoke.mjs --suite=all --exhaustive          everything (npm run smoke:all): the heavy validation
// Options:
//   --backend=webgl2 | webgpu | both (default)   which backends to run on
//   --exhaustive      also re-run each suite on WebGL2 inside the WebGPU-capable browser (same-browser parity)
//   --keep-going      do not stop at the first failing suite (default: fail fast)
//   --no-build        use engine/dist as it is (default: `vite build` first, so the tests never run on stale code)
//   --list            print the suites and their tags
// Without --suite or --tag nothing runs: the heavy validation is never started by accident.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const engineDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4173;
const BASE_URL = `http://127.0.0.1:${PORT}/`;
const LEGACY_PAGE = path.join(engineDir, 'dist', 'legacy', 'orvalis.html');

const cli = Object.fromEntries(process.argv.slice(2).map((arg) => { const m = /^--([a-z-]+)(?:=(.*))?$/.exec(arg); if (!m) { console.error(`smoke: unknown argument "${arg}"`); process.exit(2); } return [m[1], m[2] ?? true]; }));
for (const key of Object.keys(cli)) if (!['suite', 'tag', 'backend', 'exhaustive', 'keep-going', 'no-build', 'list'].includes(key)) { console.error(`smoke: unknown option --${key}`); process.exit(2); }
const BACKEND_CHOICE = cli.backend === undefined ? 'both' : cli.backend;
if (!['webgl2', 'webgpu', 'both'].includes(BACKEND_CHOICE)) { console.error(`smoke: --backend must be webgl2, webgpu or both (got ${BACKEND_CHOICE})`); process.exit(2); }

if (!cli.list && !cli['no-build'] && (cli.suite || cli.tag)) {
  const built = spawnSync('npx', ['vite', 'build'], { cwd: engineDir, encoding: 'utf8' });
  if (built.status !== 0) { console.error(`smoke: build failed\n${built.stdout}\n${built.stderr}`); process.exit(1); }
}
if (!existsSync(path.join(engineDir, 'dist', 'index.html'))) {
  console.error('smoke: engine/dist/index.html missing — run `npm run build` first');
  process.exit(1);
}
if (!existsSync(LEGACY_PAGE)) {
  console.error('smoke: engine/dist/legacy/orvalis.html missing — the build did not copy the legacy page');
  process.exit(1);
}

// Tiny static server for engine/dist, exactly what a real host would serve.
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json', '.json': 'application/json' };
const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let file = path.join(engineDir, 'dist', url === '/' ? 'index.html' : url);
  if (!file.startsWith(path.join(engineDir, 'dist'))) file = null;
  if (!file || !existsSync(file)) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((resolve, reject) => server.once('error', reject).listen(PORT, '127.0.0.1', resolve));

const execPath = process.env.CHROMIUM_PATH;
// Software GL so the pages render on machines without a GPU.
const BASE_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const launch = (extra = [], options = {}) =>
  chromium.launch({ ...(execPath ? { executablePath: execPath } : options), args: [...BASE_ARGS, ...extra] });
// WebGPU needs more than a flag here. Measured in this sandbox: with the default
// headless shell (or without Vulkan) an adapter and a device are created, but the
// device is lost as soon as the canvas must provide or present its texture
// ("A valid external Instance reference no longer exists"). Full Chromium in new
// headless mode with software Vulkan is the configuration where the canvas works.
const WEBGPU_ARGS = ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader'];
const WEBGPU_LAUNCH = { channel: 'chromium' };

const BG = [11, 14, 20];
/** Largest colour step (0..255) between two neighbouring pixels: tolerated on smooth shading / required to call it a seam. */
const SEAM_OK = 2;
const SEAM_SEEN = 4;
const near = (px, rgb, tol = 2) => rgb.every((v, i) => Math.abs(px[i] - v) <= tol);
const dominant = (px) => ['r', 'g', 'b'][px.indexOf(Math.max(px[0], px[1], px[2]))];
const problems = [];

/**
 * Opens the engine page with `query` and checks the outcome.
 * expect: { backend, fellBack }  → a backend must run and draw the triangle
 *         { error: true }        → the page must show a visible renderer failure
 * allow:  regexes for console messages this scenario is supposed to produce
 */
async function checkEngine(browser, label, extraQuery, expect, allow = []) {
  // These scenarios check backend selection with the first-triangle scene.
  const query = '?engine=new&scene=triangle' + (extraQuery ? '&' + extraQuery.replace(/^\?/, '') : '');
  const fail = (msg) => problems.push(`[${label}] ${msg}`);
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const expected = allow.map((re) => ({ re, hits: 0 }));
  let readbackWarnings = 0;
  let overlaySummary;
  page.on('console', (m) => {
    const text = m.text();
    // The pixel probe reads the framebuffer synchronously on WebGL2, which the GL
    // driver reports as a performance warning. It is caused by this test, not by
    // the engine (which never reads pixels back), so only that message is tolerated.
    if (m.type() === 'warning' && text.includes('GPU stall due to ReadPixels')) return void readbackWarnings++;
    // The browser itself logs the 404 of the deliberately missing test asset.
    if (m.type() === 'error' && text.startsWith('Failed to load resource') && m.location().url.endsWith('/assets/selftest/does-not-exist.txt')) return;
    const hit = expected.find((e) => e.re.test(text));
    if (hit) return void hit.hits++;
    if (m.type() === 'error' || m.type() === 'warning') fail(`console.${m.type()}: ${text} (at ${m.location().url || 'unknown location'} · ${query})`);
  });
  page.on('pageerror', (e) => fail(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => fail(`requestfailed: ${r.url()}`));

  const resp = await page.goto(BASE_URL + query, { waitUntil: 'load' });
  if (!resp || !resp.ok()) fail(`http status ${resp?.status()}`);
  // The page must declare its icon itself, otherwise browsers request /favicon.ico on their own (a 404: cause of the
  // intermittent failure seen in P1.4/P1.6). Checked on the document, not by ignoring the console error.
  if ((await page.locator('link[rel="icon"]').count()) !== 1) fail('index.html must declare exactly one <link rel="icon">');
  // 'attached', not 'visible': the banner is hidden once the overlay takes over.
  await page.waitForSelector('#boot-status[data-state]', { state: 'attached', timeout: 10000 }).catch(() => fail('boot-status never got a state'));
  const info = await page.evaluate(() => {
    const el = document.getElementById('boot-status');
    return { ...el.dataset, text: el.textContent };
  });
  // The renderer line is on the boot banner when startup failed, on the debug overlay otherwise.
  const overlayText = await page.evaluate(() => {
    const o = document.getElementById('debug-overlay');
    return o && !o.hidden ? o.textContent : null;
  });
  const firstLine = (info.state === 'ready' ? (overlayText ?? '') : (info.text ?? '')).split('\n')[0];

  if (expect.error) {
    if (info.state !== 'backend-error') fail(`expected a visible renderer failure, got state "${info.state}" (${firstLine})`);
    if (firstLine !== 'Renderer: indisponible') fail(`expected first line "Renderer: indisponible", got "${firstLine}"`);
    if (info.backend) fail(`no backend should be reported, got "${info.backend}"`);
    if (await page.evaluate(() => 'probe' in (window.__orvalisEngine ?? {}))) fail('render hook exists although no backend started');
    if (overlayText !== null) fail('debug overlay is visible although no backend started');
    console.log(`smoke: [${label}] ${query} → ${firstLine} (failure shown, as required)`);
  } else {
    const NAMES = { webgpu: 'WebGPU', webgl2: 'WebGL2' };
    if (info.state !== 'ready') fail(`state "${info.state}" instead of "ready": ${info.text}`);
    if (info.backend !== expect.backend) fail(`expected backend "${expect.backend}", got "${info.backend}"`);
    if (info.fellBack !== String(expect.fellBack)) fail(`expected fellBack=${expect.fellBack}, got ${info.fellBack}`);
    const wantLine = `Renderer: ${NAMES[expect.backend]}${expect.fellBack ? ' (repli)' : ''}`;
    if (firstLine !== wantLine) fail(`expected first line "${wantLine}", got "${firstLine}"`);

    if (info.state === 'ready') {
      // Main loop must be alive: frames and fixed steps keep increasing.
      const sample = () => page.evaluate(() => {
        const d = document.getElementById('boot-status').dataset;
        return { frames: Number(d.frames ?? 0), steps: Number(d.steps ?? 0), drawCalls: Number(d.drawCalls), triangles: Number(d.triangles) };
      });
      await page.waitForFunction(() => Number(document.getElementById('boot-status').dataset.frames ?? 0) > 2, null, { timeout: 5000 }).catch(() => {});
      const a = await sample();
      await page.waitForTimeout(400);
      const b = await sample();
      if (!(b.frames > a.frames)) fail('main loop: frame counter did not advance');
      if (!(b.steps > a.steps)) fail('main loop: fixed-step counter did not advance');
      if (b.drawCalls !== 1 || b.triangles !== 1) fail(`expected 1 draw call / 1 triangle, got ${b.drawCalls} / ${b.triangles}`);

      // Debug overlay: live numbers, and F3 hides/shows it.
      const overlayLines = (await page.evaluate(() => document.getElementById('debug-overlay').textContent)).split('\n');
      const line = (prefix) => overlayLines.find((l) => l.startsWith(prefix)) ?? '';
      const fps = Number(line('FPS: ').slice(5));
      const frameMs = Number.parseFloat(line('Frame: ').slice(7));
      // Liveness check, not a performance check: software rendering in a loaded
      // sandbox was measured between 29 and 60 fps, so the bounds are wide.
      if (!(fps >= 5 && fps <= 240)) fail(`overlay FPS not plausible: "${line('FPS: ')}"`);
      if (!(frameMs > 2 && frameMs <= 200)) fail(`overlay frame time not plausible: "${line('Frame: ')}"`);
      if (Math.abs(fps - 1000 / frameMs) > 1.5) fail(`overlay FPS (${fps}) and frame time (${frameMs} ms) disagree`);
      if (line('Draw calls: ') !== 'Draw calls: 1') fail(`overlay draw calls: "${line('Draw calls: ')}"`);
      if (line('Triangles: ') !== 'Triangles: 1') fail(`overlay triangles: "${line('Triangles: ')}"`);
      if (line('Canvas: ') !== 'Canvas: 1280×720') fail(`overlay canvas size: "${line('Canvas: ')}"`);
      if (line('Engine: ') !== 'Engine: new (jeu actuel : ?engine=legacy)') fail(`overlay engine line: "${line('Engine: ')}"`);
      if (expect.fellBack && !overlayLines[1]?.includes('WebGPU indisponible')) fail(`overlay should give the fallback reason, got "${overlayLines[1]}"`);
      const hiddenNow = () => page.evaluate(() => document.getElementById('debug-overlay').hidden);
      await page.keyboard.press('F3');
      if (!(await hiddenNow())) fail('F3 did not hide the debug overlay');
      await page.keyboard.press('F3');
      if (await hiddenNow()) fail('second F3 did not show the debug overlay again');
      overlaySummary = `overlay ${fps} fps / ${frameMs} ms`;

      // Asset manager in the real browser: real fetch of a file from the built
      // site, decoded, uploaded by pump() on the engine's main loop.
      const ok = await page.evaluate(() => window.__orvalisEngine.loadText('assets/selftest/hello.txt'));
      if (ok.text !== 'orvalis-asset-ok\n') fail(`asset text: ${JSON.stringify(ok.text)} (error: ${ok.error})`);
      if (ok.states.at(-1) !== 'ready' || !ok.states.includes('downloading')) fail(`asset states: ${ok.states.join(' → ')}`);
      const missing = await page.evaluate(() => window.__orvalisEngine.loadText('assets/selftest/does-not-exist.txt'));
      if (missing.states.at(-1) !== 'failed' || !/HTTP 404/.test(missing.error ?? '')) fail(`missing asset should fail with HTTP 404, got ${missing.states.join(' → ')} / ${missing.error}`);
      if (missing.text !== null) fail('a missing asset must not produce content');
      overlaySummary += ` · asset ${ok.states.join('→')} / missing ${missing.states.at(-1)}`;

      // Fractions of the canvas: centre (inside the triangle), 4 corners (background),
      // then near each vertex: top (red), bottom-left (green), bottom-right (blue).
      const probe = await page.evaluate(() =>
        window.__orvalisEngine.probe([[0.5, 0.5], [0.02, 0.02], [0.98, 0.02], [0.02, 0.98], [0.98, 0.98], [0.5, 0.25], [0.25, 0.77], [0.75, 0.77]]),
      );
      const [centre, c1, c2, c3, c4, top, left, right] = probe.pixels;
      for (const e of probe.errors) fail(`GPU error: ${e}`);
      for (const [name, px] of [['top-left', c1], ['top-right', c2], ['bottom-left', c3], ['bottom-right', c4]]) {
        if (!near(px, BG)) fail(`${name} corner should be the clear colour rgb(${BG}), got rgb(${px.slice(0, 3)})`);
      }
      if (near(centre, BG, 8)) fail('centre pixel is background — the triangle is not drawn');
      // Centre of the triangle sits halfway between the red top and the green/blue base.
      if (!near(centre, [127, 64, 64], 6)) fail(`centre should interpolate to about rgb(127,64,64), got rgb(${centre.slice(0, 3)})`);
      if (dominant(top) !== 'r') fail(`top vertex should be red-dominant, got rgb(${top.slice(0, 3)})`);
      if (dominant(left) !== 'g') fail(`left vertex should be green-dominant, got rgb(${left.slice(0, 3)})`);
      if (dominant(right) !== 'b') fail(`right vertex should be blue-dominant, got rgb(${right.slice(0, 3)})`);
      // Warnings must come only from the probe, never from normal rendering.
      await page.waitForTimeout(300);
      const afterProbe = readbackWarnings;
      await page.waitForTimeout(400);
      if (readbackWarnings !== afterProbe) fail('ReadPixels warnings keep appearing without any probe — the engine itself is reading pixels');
      console.log(
        `smoke: [${label}] ${query} → ${firstLine} · ${probe.width}x${probe.height} · ${b.drawCalls} draw / ${b.triangles} tri · ` +
          `centre rgb(${centre.slice(0, 3)}) corner rgb(${c1.slice(0, 3)}) top ${dominant(top)} left ${dominant(left)} right ${dominant(right)} · ` +
          `${probe.errors.length} GPU error(s) · ${overlaySummary}` + (readbackWarnings ? ` · ${readbackWarnings} probe readback warning(s) tolerated` : ''),
      );
    }
  }
  for (const e of expected) if (e.hits === 0) fail(`expected a console message matching ${e.re} but none was logged`);
  await page.close();
}

/**
 * P1.2: one synthetic terrain chunk, really rendered. Checks, by reading pixels,
 * that terrain is present, the background is still visible, the depth buffer
 * resolves overlapping geometry, the orientation is right (x → right, y → up,
 * height → blue) and back faces are culled. Returns the probed pixels so the
 * two backends can be compared with each other.
 */
async function checkChunk(browser, label, renderer) {
  const NAMES = { webgpu: 'WebGPU', webgl2: 'WebGL2' };
  // Fractions of the canvas, top view: +x is right, +y is up, the chunk is centred.
  const PROBES = { centre: [0.5, 0.5], left: [0.42, 0.5], right: [0.58, 0.5], top: [0.5, 0.36], bottom: [0.5, 0.64], rim: [0.61, 0.5], beside: [0.72, 0.5], farLeft: [0.05, 0.5], farRight: [0.95, 0.5], inHole: [0.4026, 0.6732], holeEdgeIn: [0.432, 0.6732], holeEdgeOut: [0.438, 0.6732], aboveHole: [0.4026, 0.60] };
  const MAGENTA = [255, 0, 255];
  const results = {};
  const cases = [
    { name: 'hill + underlay', q: 'height=hill&view=above&underlay=on', draws: 2, triangles: 258 },
    { name: 'slope', q: 'height=slope&view=above', draws: 1, triangles: 256 },
    { name: 'flat', q: 'height=flat&view=above', draws: 1, triangles: 256 },
    { name: 'hill from below', q: 'height=hill&view=below', draws: 1, triangles: 256 },
    // P1.3: mask bit 0 removes cells 0..1 × 0..1, i.e. the corner x,y ∈ [0, chunkSize/4].
    { name: 'flat + hole', q: 'height=flat&view=above&underlay=on&holes=1', draws: 2, triangles: 242, terrainTriangles: 240, holes: 1 },
  ];
  for (const c of cases) {
    const fail = (msg) => problems.push(`[${label} chunk ${c.name}] ${msg}`);
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('console', (m) => {
      const text = m.text();
      if (m.type() === 'warning' && text.includes('GPU stall due to ReadPixels')) return; // caused by the probe below
      if (m.type() === 'error' || m.type() === 'warning') fail(`console.${m.type()}: ${text}`);
    });
    page.on('pageerror', (e) => fail(`pageerror: ${e.message}`));
    await page.goto(`${BASE_URL}?engine=new&renderer=${renderer}&scene=chunk&${c.q}`, { waitUntil: 'load' });
    await page.waitForSelector('#boot-status[data-state]', { state: 'attached', timeout: 10000 }).catch(() => fail('boot-status never got a state'));
    const info = await page.evaluate(() => ({ ...document.getElementById('boot-status').dataset }));
    if (info.state !== 'ready' || info.backend !== renderer) {
      fail(`expected backend ${renderer} ready, got state "${info.state}" backend "${info.backend}"`);
      await page.close();
      continue;
    }
    await page.waitForFunction(() => document.getElementById('debug-overlay').textContent.includes('Terrain chunks'), null, { timeout: 5000 }).catch(() => fail('overlay never showed terrain statistics'));
    const lines = (await page.evaluate(() => document.getElementById('debug-overlay').textContent)).split('\n');
    const expectLines = [`Renderer: ${NAMES[renderer]}`, `Draw calls: ${c.draws}`, `Triangles: ${c.triangles}`, 'Terrain chunks: 1', 'Terrain vertices: 145', `Terrain triangles: ${c.terrainTriangles ?? 256}`, 'Terrain draw calls: 1', `Terrain holes: ${c.holes ?? 0}/16`, 'Terrain wireframe: off (F4)', 'Terrain debug: color'];
    for (const want of expectLines) if (!lines.includes(want)) fail(`overlay line missing: "${want}" (got: ${lines.join(' | ')})`);

    const probe = await page.evaluate((points) => window.__orvalisEngine.probe(points), Object.values(PROBES));
    for (const e of probe.errors) fail(`GPU error: ${e}`);
    const px = Object.fromEntries(Object.keys(PROBES).map((k, i) => [k, probe.pixels[i].slice(0, 3)]));
    results[c.name] = px;
    const isBg = (p) => near(p, BG);
    const isMagenta = (p) => near(p, MAGENTA);
    const [R, G, B_] = [0, 1, 2];

    if (c.name === 'hill from below') {
      // Back faces are culled: seen from underneath, the terrain must not be drawn at all.
      for (const k of ['centre', 'left', 'right', 'top', 'bottom']) if (!isBg(px[k])) fail(`${k} should be background when seen from below (back-face culling), got rgb(${px[k]})`);
    } else {
      // Terrain present, background still visible.
      for (const k of ['centre', 'left', 'right', 'top', 'bottom']) if (isBg(px[k]) || isMagenta(px[k])) fail(`${k} should show terrain, got rgb(${px[k]})`);
      for (const k of ['farLeft', 'farRight']) if (!isBg(px[k])) fail(`${k} should be background rgb(${BG}), got rgb(${px[k]})`);
      // Orientation: red grows with x (to the right), green grows with y (upwards).
      if (!(px.right[R] - px.left[R] > 60)) fail(`red should grow from left to right: left ${px.left[R]}, right ${px.right[R]}`);
      if (!(px.top[G] - px.bottom[G] > 60)) fail(`green should grow from bottom to top: bottom ${px.bottom[G]}, top ${px.top[G]}`);
      if (Math.abs(px.centre[R] - 127) > 8 || Math.abs(px.centre[G] - 127) > 8) fail(`centre of the chunk should be mid red/green, got rgb(${px.centre})`);
    }
    if (c.name === 'hill + underlay') {
      // Depth: the magenta quad is drawn AFTER the terrain but lies below it.
      if (!isMagenta(px.beside)) fail(`the underlay should be visible beside the chunk, got rgb(${px.beside})`);
      if (!(px.centre[B_] > 190)) fail(`hill top should be the highest point (blue ≈ 204), got rgb(${px.centre})`);
      if (!(px.centre[B_] - px.rim[B_] > 60)) fail(`blue should fall from the hill top to the rim: centre ${px.centre[B_]}, rim ${px.rim[B_]}`);
    }
    if (c.name === 'flat + hole') {
      // The hole lets the magenta quad (below the terrain) show through, and only there.
      for (const k of ['inHole', 'holeEdgeIn']) if (!isMagenta(px[k])) fail(`${k} should show the underlay through the hole, got rgb(${px[k]})`);
      for (const k of ['holeEdgeOut', 'aboveHole']) if (isBg(px[k]) || isMagenta(px[k])) fail(`${k} is outside the hole and should show terrain, got rgb(${px[k]})`);
    } else if (c.name !== 'hill from below') {
      // Without a hole mask the same spot is solid terrain.
      for (const k of ['inHole', 'holeEdgeIn']) if (isBg(px[k]) || isMagenta(px[k])) fail(`${k} should show terrain when there is no hole, got rgb(${px[k]})`);
    }
    if (c.name === 'slope') {
      if (!isBg(px.beside)) fail(`without underlay the area beside the chunk is background, got rgb(${px.beside})`);
      if (!(px.right[B_] - px.left[B_] > 50)) fail(`height (blue) should rise with x on the slope: left ${px.left[B_]}, right ${px.right[B_]}`);
    }
    if (c.name === 'flat') {
      for (const k of ['centre', 'left', 'right', 'top', 'bottom']) if (Math.abs(px[k][B_] - 51) > 4) fail(`flat chunk: blue should be 51 everywhere, ${k} is ${px[k][B_]}`);
    }
    console.log(`smoke: [${label}] chunk ${c.name} on ${NAMES[renderer]} → ${c.draws} draw / ${c.triangles} tri · centre rgb(${px.centre}) left rgb(${px.left}) right rgb(${px.right}) beside rgb(${px.beside}) · ${probe.errors.length} GPU error(s)`);
    await page.close();
  }
  return results;
}

/**
 * P1.5 terrain tile: 16 × 16 chunks drawn one by one, forming ONE surface.
 *  - oblique view: surface present, relief visible (differs from the flat tile)
 *  - normals view, zoomed on the point where 4 chunks meet: no step across
 *    x = n·chunkSize or y = n·chunkSize. The same view with tileNormals=isolated
 *    is the control: there the step MUST be seen, which proves the detector works.
 *  - a negative tile with holes and chunk bounds
 */
async function checkTile(browser, label, renderer) {
  const NAMES = { webgpu: 'WebGPU', webgl2: 'WebGL2' };
  const W = 1280, H = 720;
  const results = {};
  const open = async (name, q) => {
    const fail = (msg) => problems.push(`[${label} tile ${name} ${renderer}] ${msg}`);
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on('console', (m) => {
      const text = m.text();
      if (m.type() === 'warning' && text.includes('GPU stall due to ReadPixels')) return;
      if (m.type() === 'error' || m.type() === 'warning') fail(`console.${m.type()}: ${text} (at ${m.location().url || 'unknown location'})`);
    });
    page.on('pageerror', (e) => fail(`pageerror: ${e.message}`));
    await page.goto(`${BASE_URL}?engine=new&renderer=${renderer}&scene=tile&${q}&timeSpeed=0`, { waitUntil: 'load' });
    await page.waitForSelector('#boot-status[data-state="ready"]', { state: 'attached', timeout: 20000 }).catch(() => fail('engine never became ready'));
    await page.waitForFunction(() => document.getElementById('debug-overlay').textContent.includes('Terrain chunks'), null, { timeout: 10000 }).catch(() => fail('overlay never showed terrain statistics'));
    const lines = (await page.evaluate(() => document.getElementById('debug-overlay').textContent)).split('\n');
    const expectLines = (wanted) => {
      for (const want of wanted) if (!lines.includes(want)) fail(`overlay line missing: "${want}" (got: ${lines.join(' | ')})`);
    };
    const probe = async (points) => {
      const r = await page.evaluate((pts) => window.__orvalisEngine.probe(pts), points);
      for (const e of r.errors) fail(`GPU error: ${e}`);
      return r.pixels.map((p) => p.slice(0, 3));
    };
    return { page, fail, expectLines, probe };
  };
  const FULL = [`Renderer: ${NAMES[renderer]}`, 'Terrain chunks: 256', 'Terrain vertices: 37120', 'Terrain triangles: 65536', 'Terrain submitted chunks: 256', 'Terrain draw calls: 256', 'Draw calls: 256', 'Triangles: 65536'];
  const pixel = (x, y) => [(x + 0.5) / W, (y + 0.5) / H];
  const maxStep = (px) => {
    let worst = 0, at = -1;
    for (let i = 1; i < px.length; i++) {
      const d = Math.max(...px[i].map((v, k) => Math.abs(v - px[i - 1][k])));
      if (d > worst) [worst, at] = [d, i];
    }
    return { worst, at };
  };

  // --- Oblique view: one surface with relief.
  const INSIDE = { centre: [0.5, 0.55], left: [0.42, 0.53], right: [0.58, 0.53], near: [0.5, 0.68] };
  const OUTSIDE = { bottomLeft: [0.1, 0.9], bottomRight: [0.9, 0.9], top: [0.5, 0.1], topRight: [0.9, 0.2] };
  const oblique = {};
  for (const height of ['hills', 'flat']) {
    const t = await open(`oblique ${height}`, `height=${height}&view=oblique`);
    t.expectLines([...FULL, 'Terrain tile: 0,0', 'Terrain chunk bounds: off (B)', 'Terrain culling: on (C)', 'Terrain visible chunks: 256', 'Terrain culled chunks: 0']);
    const names = [...Object.keys(INSIDE), ...Object.keys(OUTSIDE)];
    const px = await t.probe([...Object.values(INSIDE), ...Object.values(OUTSIDE)]);
    const byName = Object.fromEntries(names.map((n, i) => [n, px[i]]));
    for (const k of Object.keys(INSIDE)) if (near(byName[k], BG)) t.fail(`${k} should show terrain, got background`);
    for (const k of Object.keys(OUTSIDE)) if (!near(byName[k], BG)) t.fail(`${k} should be background, got rgb(${byName[k]})`);
    // Blue encodes height: along a line across the tile it must vary on the hills and not on the flat tile.
    const line = await t.probe(Array.from({ length: 60 }, (_, i) => [0.4 + (0.2 * i) / 59, 0.55]));
    const blues = line.map((p) => p[2]);
    byName.blueRange = [Math.min(...blues), Math.max(...blues), 0];
    oblique[height] = byName;
    results[`oblique ${height}`] = byName;
    await t.page.close();
  }
  {
    const fail = (msg) => problems.push(`[${label} tile oblique ${renderer}] ${msg}`);
    const [lo, hi] = oblique.hills.blueRange, [flo, fhi] = oblique.flat.blueRange;
    if (!(hi - lo > 60)) fail(`hills: height colour should vary a lot across the tile, blue range ${lo}..${hi}`);
    if (!(fhi - flo <= 2)) fail(`flat: height colour should be constant, blue range ${flo}..${fhi}`);
    if (Object.keys(INSIDE).every((k) => near(oblique.hills[k], oblique.flat[k], 6))) fail('hills and flat tiles give the same picture: no relief');
    console.log(`smoke: [${label}] tile oblique on ${NAMES[renderer]} → 256 draws / 65536 tri · hills centre rgb(${oblique.hills.centre}) blue ${lo}..${hi} · flat centre rgb(${oblique.flat.centre}) blue ${flo}..${fhi}`);
  }

  // --- Normals, zoomed on the centre of the tile (corner shared by chunks 7|8 × 7|8).
  // 1 world unit ≈ 10.4 px, so the seams x = 8·chunkSize and y = 8·chunkSize cross the scans below.
  const ROW = Array.from({ length: 240 }, (_, i) => pixel(520 + i, 300)); // crosses the vertical seam at x ≈ 640
  const COL = Array.from({ length: 240 }, (_, i) => pixel(700, 240 + i)); // crosses the horizontal seam at y ≈ 360
  const steps = {};
  for (const mode of ['seamless', 'isolated']) {
    const t = await open(`normals ${mode}`, `height=hills&view=above&zoom=16&terrainDebug=normals&tileNormals=${mode}`);
    // Zoomed in: only the chunks around the centre are in view (P1.6 culling).
    t.expectLines([`Renderer: ${NAMES[renderer]}`, 'Terrain chunks: 256', 'Terrain vertices: 37120', 'Terrain triangles: 65536', 'Terrain debug: normals', 'Terrain culling: on (C)']);
    const row = await t.probe(ROW), col = await t.probe(COL);
    for (const [name, px] of [['row', row], ['column', col]]) {
      for (const p of px) {
        const len = Math.hypot(p[0] / 127.5 - 1, p[1] / 127.5 - 1, p[2] / 127.5 - 1);
        if (Math.abs(len - 1) > 0.04 || p[2] <= 128) { t.fail(`${name}: rgb(${p}) is not an upward unit normal`); break; }
      }
    }
    steps[mode] = { row: maxStep(row), col: maxStep(col) };
    if (mode === 'seamless') results['normals seamless'] = Object.fromEntries([...row.filter((_, i) => i % 20 === 0).map((p, i) => [`row${i}`, p]), ...col.filter((_, i) => i % 20 === 0).map((p, i) => [`col${i}`, p])]);
    await t.page.close();
  }
  {
    const fail = (msg) => problems.push(`[${label} tile normals ${renderer}] ${msg}`);
    const s = steps.seamless, c = steps.isolated;
    // Smooth shading changes by about 1/255 per pixel here; a seam is a step several times larger.
    if (s.row.worst > SEAM_OK) fail(`a sharp line crosses x = n·chunkSize: step of ${s.row.worst}/255 at row pixel ${520 + s.row.at}`);
    if (s.col.worst > SEAM_OK) fail(`a sharp line crosses y = n·chunkSize: step of ${s.col.worst}/255 at column pixel ${240 + s.col.at}`);
    // Control: with every chunk computing its normals alone, the seam must be detected, at the chunk border.
    if (c.row.worst < SEAM_SEEN || Math.abs(520 + c.row.at - 640) > 2) fail(`control failed: isolated normals should show a step at x ≈ 640, got ${c.row.worst}/255 at ${520 + c.row.at}`);
    if (c.col.worst < SEAM_SEEN || Math.abs(240 + c.col.at - 360) > 2) fail(`control failed: isolated normals should show a step at y ≈ 360, got ${c.col.worst}/255 at ${240 + c.col.at}`);
    console.log(`smoke: [${label}] tile normals on ${NAMES[renderer]} → largest step between neighbouring pixels: seamless row ${s.row.worst} / column ${s.col.worst} · isolated (control) row ${c.row.worst} at x=${520 + c.row.at} / column ${c.col.worst} at y=${240 + c.col.at}`);
  }

  // --- Negative tile, seen from above, flat, with holes and chunk bounds.
  {
    const t = await open('tile -2,3', 'tile=-2,3&height=flat&view=above&chunkBounds=on&holeChunks=3:4:1,9:9:0xffff');
    t.expectLines([`Renderer: ${NAMES[renderer]}`, 'Terrain tile: -2,3', 'Terrain chunks: 256', 'Terrain vertices: 37120', `Terrain triangles: ${65536 - 16 - 256}`, 'Terrain visible chunks: 256', 'Terrain submitted chunks: 255', 'Terrain draw calls: 255', 'Terrain holes: 17/4096', 'Terrain chunk bounds: on (B)', 'Draw calls: 511']);
    // Chunk centres, in fractions of the canvas: the tile is centred, +x right, +y up.
    const at = (cx, cy) => [0.5 + ((cx + 0.5 - 8) / 16) * 0.2598, 0.5 - ((cy + 0.5 - 8) / 16) * 0.4619];
    const P = { left: at(3, 8), right: at(12, 8), top: at(8, 12), bottom: at(8, 3), fullHole: at(9, 9), besideHole: at(10, 9), farLeft: [0.05, 0.5], farRight: [0.95, 0.5] };
    const px = await t.probe(Object.values(P));
    const b = Object.fromEntries(Object.keys(P).map((k, i) => [k, px[i]]));
    const colour = (cx, cy) => [Math.round((0.15 + (0.7 * (cx + 0.5)) / 16) * 255), Math.round((0.15 + (0.7 * (cy + 0.5)) / 16) * 255), 51];
    for (const [k, cx, cy] of [['left', 3, 8], ['right', 12, 8], ['top', 8, 12], ['bottom', 8, 3], ['besideHole', 10, 9]]) {
      if (!near(b[k], colour(cx, cy), 4)) t.fail(`${k}: chunk (${cx},${cy}) should be rgb(${colour(cx, cy)}), got rgb(${b[k]}) — wrong origin or orientation`);
    }
    if (!near(b.fullHole, BG)) t.fail(`the fully holed chunk (9,9) should show the background, got rgb(${b.fullHole})`);
    for (const k of ['farLeft', 'farRight']) if (!near(b[k], BG)) t.fail(`${k} should be background, got rgb(${b[k]})`);
    // Bounds: a pixel row across the tile meets the 17 vertical chunk borders.
    const row = await t.probe(Array.from({ length: 380 }, (_, i) => pixel(450 + i, 304)));
    let lines = 0;
    for (let i = 1; i < row.length; i++) if (near(row[i], [255, 255, 0], 3) && !near(row[i - 1], [255, 255, 0], 3)) lines++;
    if (lines !== 17) t.fail(`chunk bounds: expected 17 vertical border lines across the tile, counted ${lines}`);
    results['tile -2,3'] = Object.fromEntries(Object.entries(b));
    console.log(`smoke: [${label}] tile -2,3 on ${NAMES[renderer]} → 255 terrain draws + 256 bounds · left rgb(${b.left}) right rgb(${b.right}) top rgb(${b.top}) bottom rgb(${b.bottom}) hole rgb(${b.fullHole}) · ${lines} border lines`);
    await t.page.close();
  }
  return results;
}

/**
 * P1.9 textured terrain: 4 layers blended by the per-chunk mask.
 *  - exact: flat colours as layers + the « quadrants » paint → each quarter of the tile shows exactly one layer,
 *    and the line between two quarters the half-and-half mix
 *  - no step in the blend across a chunk border (the mask's edge texels coincide)
 *  - generated textures + natural paint: renders, varied, same on both backends
 */
async function checkTextured(browser, label, renderer) {
  const NAMES = { webgpu: 'WebGPU', webgl2: 'WebGL2' };
  const W = 1280, H = 720;
  const out = {};
  const COLOURS = [[40, 160, 60], [150, 100, 50], [128, 128, 136], [220, 200, 140]];
  const open = async (name, scene, q) => {
    const fail = (msg) => problems.push(`[${label} textured ${name} ${renderer}] ${msg}`);
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on('console', (m) => {
      const text = m.text();
      if (m.type() === 'warning' && text.includes('GPU stall due to ReadPixels')) return;
      if (m.type() === 'error' || m.type() === 'warning') fail(`console.${m.type()}: ${text} (at ${m.location().url || 'unknown location'})`);
    });
    page.on('pageerror', (e) => fail(`pageerror: ${e.message}`));
    await page.goto(`${BASE_URL}?engine=new&renderer=${renderer}&scene=${scene}&${q}&timeSpeed=0&sky=off`, { waitUntil: 'load' });
    await page.waitForSelector('#boot-status[data-state="ready"]', { state: 'attached', timeout: 30000 }).catch(() => fail('engine never became ready'));
    await page.waitForFunction(() => document.getElementById('debug-overlay').textContent.includes('Terrain debug: textured'), null, { timeout: 10000 }).catch(() => fail('overlay never showed "Terrain debug: textured"'));
    const probe = async (points) => {
      const r = await page.evaluate((pts) => window.__orvalisEngine.probe(pts), points);
      for (const e of r.errors) fail(`GPU error: ${e}`);
      return r.pixels.map((p) => p.slice(0, 3));
    };
    return { page, fail, probe };
  };

  // --- Exact colours, seen from above.
  {
    const t = await open('quadrants', 'tile', 'height=flat&view=above&terrainDebug=textured&textures=solid&paint=quadrants&lighting=off');
    const lines = (await t.page.evaluate(() => document.getElementById('debug-overlay').textContent)).split('\n');
    for (const want of [`Renderer: ${NAMES[renderer]}`, 'Draw calls: 256', 'Triangles: 65536', 'Terrain chunks: 256']) if (!lines.includes(want)) t.fail(`overlay line missing: "${want}"`);
    const at = (cx, cy) => [0.5 + ((cx - 8) / 16) * 0.2598, 0.5 - ((cy - 8) / 16) * 0.4619]; // chunk units, tile centred
    const mix = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);
    // The shader's formula, layer after layer.
    const blend = (a1, a2, a3) => mix(mix(mix(COLOURS[0], COLOURS[1], a1), COLOURS[2], a2), COLOURS[3], a3).map(Math.round);
    const P = {
      southWest: [at(3.5, 3.5), COLOURS[0]], southEast: [at(12.5, 3.5), COLOURS[1]], northWest: [at(3.5, 12.5), COLOURS[2]], northEast: [at(12.5, 12.5), COLOURS[3]],
      // In the corners of a quarter too: the whole quarter is one layer, far from the chunk it was sampled in.
      southWestCorner: [at(0.3, 0.3), COLOURS[0]], northEastCorner: [at(15.7, 15.7), COLOURS[3]],
      // On the line between two quarters. The pixel centre is half a pixel (0.77 world unit) east / south of the
      // line, so the blend factor there is smoothstep(0.5 ± 0.77 / 32) = 0.536 / 0.464, not exactly one half.
      southMiddle: [at(8, 3.5), blend(0.536, 0, 0)], westMiddle: [at(3.5, 8), blend(0, 0.464, 0)],
      // East side: layer 1 fades out while layer 3 fades in — the layers are mixed one after the other (spec §7.4).
      eastMiddle: [at(12.5, 8), blend(0.536, 0, 0.464)],
      outside: [[0.05, 0.5], BG],
    };
    const px = await t.probe(Object.values(P).map((v) => v[0]));
    Object.entries(P).forEach(([name, [, want]], i) => {
      if (!near(px[i], want, name.endsWith('Middle') ? 3 : 1)) t.fail(`${name} should be rgb(${want}), got rgb(${px[i]})`);
    });
    out.quadrants = Object.fromEntries(Object.keys(P).map((k, i) => [k, px[i]]));
    console.log(`smoke: [${label}] textured quadrants on ${NAMES[renderer]} → SW rgb(${px[0]}) SE rgb(${px[1]}) NW rgb(${px[2]}) NE rgb(${px[3]}) · between SW and SE rgb(${px[6]})`);
    await t.page.close();
  }

  // --- The blend from layer 0 to layer 1 crosses the border between chunks 7 and 8 (x = 256 → pixel 640): no step there.
  {
    const t = await open('blend', 'tile', 'height=flat&view=above&zoom=16&terrainDebug=textured&textures=solid&paint=quadrants&lighting=off');
    const row = await t.probe(Array.from({ length: 400 }, (_, i) => [(440 + i + 0.5) / W, 600.5 / H]));
    let worst = 0, at = -1;
    for (let i = 1; i < row.length; i++) {
      const d = Math.max(...row[i].map((v, k) => Math.abs(v - row[i - 1][k])));
      if (d > worst) [worst, at] = [d, 440 + i];
    }
    if (worst > 2) t.fail(`the blend should be smooth across the chunk border, found a step of ${worst}/255 at pixel ${at}`);
    if (!near(row[0], COLOURS[0], 2) || !near(row[row.length - 1], COLOURS[1], 2)) t.fail(`the row should go from layer 0 to layer 1, got rgb(${row[0]}) → rgb(${row[row.length - 1]})`);
    if (!near(row[200], [95, 130, 55], 4)) t.fail(`the middle of the blend should be half of each layer, got rgb(${row[200]})`);
    out.blend = Object.fromEntries(row.filter((_, i) => i % 25 === 0).map((p, i) => [`row${i}`, p]));
    console.log(`smoke: [${label}] textured blend on ${NAMES[renderer]} → rgb(${row[0]}) → rgb(${row[200]}) → rgb(${row[399]}) across the chunk border, largest step ${worst}/255`);
    await t.page.close();
  }

  // --- WHERE the mask is sampled: a sharp ramp placed a quarter of a chunk east of the tile centre (x = 264).
  // Seen from above at zoom 16, 1 world unit = 10.392 px and x = 256 is at pixel 640, so the ramp's 50 % point
  // must be at pixel 640 + 8 × 10.392 = 723.1. A mask stretched or shifted by a fraction of a texel moves it.
  {
    const t = await open('mask position', 'tile', 'height=flat&view=above&zoom=16&terrainDebug=textured&textures=solid&paint=edge&lighting=off');
    const first = 700;
    const row = await t.probe(Array.from({ length: 48 }, (_, i) => [(first + i + 0.5) / W, 300.5 / H]));
    // Red goes from 40 (layer 0) to 150 (layer 1); find where it crosses the middle, between two pixel centres.
    let crossing = Number.NaN;
    for (let i = 1; i < row.length; i++) {
      const a = row[i - 1][0], b = row[i][0];
      if (a < 95 && b >= 95) crossing = first + i - 1 + 0.5 + (95 - a) / (b - a);
    }
    const expected = 640 + 8 * (720 / (2 * 60 * Math.tan(Math.PI / 6)));
    if (!(Math.abs(crossing - expected) <= 0.5)) t.fail(`the mask is not sampled where it was painted: 50 % point at pixel ${crossing.toFixed(2)}, expected ${expected.toFixed(2)} ± 0.5`);
    if (!near(row[0], COLOURS[0], 1) || !near(row[row.length - 1], COLOURS[1], 1)) t.fail(`the row should go from layer 0 to layer 1, got rgb(${row[0]}) → rgb(${row[row.length - 1]})`);
    out.maskPosition = Object.fromEntries(row.filter((_, i) => i % 4 === 0).map((p, i) => [`row${i}`, p]));
    console.log(`smoke: [${label}] textured mask position on ${NAMES[renderer]} → 50 % point at pixel ${crossing.toFixed(2)} (expected ${expected.toFixed(2)})`);
    await t.page.close();
  }

  // --- P1.10 lighting: light = ambient + diffuse · max(N·L, 0), computed per vertex; × baked shadow (mask R).
  // Flat colours + the « shadow » paint (west half lit, east half in full baked shadow), so pixels are predictable.
  {
    const LIGHT = { toLight: [-0.5 * Math.SQRT1_2, -0.5 * Math.SQRT1_2, Math.sqrt(3) / 2], ambient: [0.36, 0.39, 0.46], diffuse: [0.84, 0.8, 0.7], shadowFactor: 0.55 }; // DEFAULT_TERRAIN_LIGHTING
    const lit = (normal, shadowLit) => {
      const len = Math.hypot(...LIGHT.toLight), nl = Math.hypot(...normal);
      const nDotL = Math.max(0, normal.reduce((sum, v, k) => sum + (v / nl) * (LIGHT.toLight[k] / len), 0));
      const shadow = LIGHT.shadowFactor + (1 - LIGHT.shadowFactor) * shadowLit;
      return COLOURS[0].map((c, k) => Math.min(255, Math.round(c * (LIGHT.ambient[k] + LIGHT.diffuse[k] * nDotL) * shadow)));
    };
    const at = (cx, cy) => [0.5 + ((cx - 8) / 16) * 0.2598, 0.5 - ((cy - 8) / 16) * 0.4619];
    const seen = {};
    for (const [height, normal] of [['flat', [0, 0, 1]], ['slope', [-0.25, -0.125, 1]]]) {
      const t = await open(`lighting ${height}`, 'tile', `height=${height}&view=above&terrainDebug=textured&textures=solid&paint=shadow`);
      const lines = (await t.page.evaluate(() => document.getElementById('debug-overlay').textContent)).split('\n');
      if (!lines.includes('Terrain lighting: on (L)')) t.fail('overlay line missing: "Terrain lighting: on (L)"');
      // Several probes per half: the light is the same everywhere on a plane.
      const west = [at(3.5, 8.5), at(1.5, 3.5), at(5.5, 12.5)], east = [at(12.5, 8.5), at(10.5, 3.5), at(14.5, 12.5)];
      let px = await t.probe([...west, ...east]);
      const wantLit = lit(normal, 1), wantShadow = lit(normal, 0);
      px.slice(0, 3).forEach((p, i) => { if (!near(p, wantLit, 2)) t.fail(`lit side, probe ${i}: expected rgb(${wantLit}), got rgb(${p})`); });
      px.slice(3).forEach((p, i) => { if (!near(p, wantShadow, 2)) t.fail(`baked shadow side, probe ${i}: expected rgb(${wantShadow}), got rgb(${p})`); });
      seen[`${height} lit`] = px[0];
      seen[`${height} shadow`] = px[3];
      if (height === 'flat') {
        // L switches the lighting off: the raw texture colour on both sides, shadow included.
        await t.page.keyboard.press('KeyL');
        await t.page.waitForFunction(() => document.getElementById('debug-overlay').textContent.includes('Terrain lighting: off (L)'), null, { timeout: 5000 }).catch(() => t.fail('L did not switch the lighting off'));
        px = await t.probe([west[0], east[0]]);
        for (const p of px) if (!near(p, COLOURS[0], 1)) t.fail(`lighting off: expected the raw texture colour rgb(${COLOURS[0]}), got rgb(${p})`);
      }
      console.log(`smoke: [${label}] lighting ${height} on ${NAMES[renderer]} → lit rgb(${seen[`${height} lit`]}) (expected ${wantLit}) · baked shadow rgb(${seen[`${height} shadow`]}) (expected ${wantShadow})`);
      await t.page.close();
    }
    if (near(seen['flat lit'], seen['slope lit'], 3)) problems.push(`[${label} textured lighting ${renderer}] a slope and flat ground must not receive the same light`);
    out.lighting = seen;
  }

  // --- P1.11 fog: mix(colour, fogColour, clamp((distance − start) / (end − start), 0, 1)), distance from the camera.
  // Flat tile seen from above, camera 960 units over its centre, fog from 960 to 1010: the centre is clear and the
  // fog thickens towards the edges, exactly as the distance sqrt(960² + r²) says.
  {
    const FOG = [0.62, 0.72, 0.82].map((v) => v * 255); // DEFAULT_FOG_COLOR
    const t = await open('fog', 'tile', 'height=flat&view=above&terrainDebug=textured&textures=solid&paint=shadow&lighting=off&fog=on&fogStart=960&fogEnd=1010');
    const lines = (await t.page.evaluate(() => document.getElementById('debug-overlay').textContent)).split('\n');
    if (!lines.includes('Terrain fog: on (F)')) t.fail('overlay line missing: "Terrain fog: on (F)"');
    const at = (cx, cy) => [0.5 + ((cx - 8) / 16) * 0.2598, 0.5 - ((cy - 8) / 16) * 0.4619];
    const expected = (cx, cy) => {
      const r = Math.hypot((cx - 8) * 32, (cy - 8) * 32), f = Math.min(1, Math.max(0, (Math.hypot(960, r) - 960) / 50));
      return { f, rgb: COLOURS[0].map((c, k) => Math.round(c + (FOG[k] - c) * f)) };
    };
    const spots = [[8.02, 8.02], [6.5, 8.5], [3.5, 8.5], [12.5, 3.5], [10.5, 12.5], [0.5, 0.5], [15.5, 15.5]];
    let px = await t.probe([...spots.map(([cx, cy]) => at(cx, cy)), [0.05, 0.5]]);
    const report = [];
    spots.forEach(([cx, cy], i) => {
      const want = expected(cx, cy);
      report.push(`${want.f.toFixed(2)}→rgb(${px[i]})`);
      if (!near(px[i], want.rgb, 2)) t.fail(`chunk (${cx},${cy}): fog factor ${want.f.toFixed(3)} → expected rgb(${want.rgb}), got rgb(${px[i]})`);
    });
    if (!near(px[spots.length], FOG.map(Math.round), 1)) t.fail(`the background should have the fog colour rgb(${FOG.map(Math.round)}), got rgb(${px[spots.length]})`);
    out.fog = Object.fromEntries(px.map((p, i) => [`p${i}`, p]));
    // F switches the fog off: raw colours everywhere, dark background again.
    await t.page.keyboard.press('KeyF');
    await t.page.waitForFunction(() => document.getElementById('debug-overlay').textContent.includes('Terrain fog: off (F)'), null, { timeout: 5000 }).catch(() => t.fail('F did not switch the fog off'));
    px = await t.probe([...spots.map(([cx, cy]) => at(cx, cy)), [0.05, 0.5]]);
    spots.forEach((_, i) => { if (!near(px[i], COLOURS[0], 1)) t.fail(`fog off: expected rgb(${COLOURS[0]}), got rgb(${px[i]})`); });
    if (!near(px[spots.length], BG)) t.fail(`fog off: the background should be rgb(${BG}) again, got rgb(${px[spots.length]})`);
    console.log(`smoke: [${label}] fog on ${NAMES[renderer]} → factor→pixel: ${report.join(' · ')} · background = fog colour · F switches it off`);
    await t.page.close();
  }

  // --- P1.12 far terrain: low-detail tiles behind the detailed ones, in their own slice of the depth buffer.
  // T switches them off: what they showed becomes the horizon colour, and nothing in front of them changes.
  {
    const FOG_RGB = [158, 184, 209];
    const t = await open('far terrain', 'stream', 'focus=256,256&view=oblique&frameBudget=50');
    await t.page.waitForFunction(() => { const text = document.getElementById('debug-overlay').textContent; return /pending 0$/m.test(text) && /^Streaming GPU queue: 0$/m.test(text) && /^Far terrain: on \(T\) · 31 tiles/m.test(text); }, null, { timeout: 60000 }).catch(() => t.fail('streaming or far terrain never settled (expected 31 far tiles)'));
    const GRID = [];
    for (let j = 0; j < 18; j++) for (let i = 0; i < 32; i++) GRID.push([(i + 0.5) / 32, (j + 0.5) / 18]);
    const withFar = await t.probe(GRID);
    await t.page.keyboard.press('KeyT');
    await t.page.waitForFunction(() => /^Far terrain: off \(T\)/m.test(document.getElementById('debug-overlay').textContent), null, { timeout: 5000 }).catch(() => t.fail('T did not switch the far terrain off'));
    const withoutFar = await t.probe(GRID);
    let shownByFar = 0, changedInFront = 0, nearRows = 0;
    GRID.forEach((_, k) => {
      const a = withFar[k], b = withoutFar[k];
      const same = near(a, b, 0);
      if (!same) {
        // A pixel that changes was showing far terrain: without it there is only the horizon colour.
        if (near(b, FOG_RGB, 2) && !near(a, FOG_RGB, 2)) shownByFar++;
        else changedInFront++;
      }
      if (k >= GRID.length / 2 && !same) nearRows++;
    });
    if (shownByFar < 10) t.fail(`the far terrain should fill part of the view beyond the detailed tiles, only ${shownByFar}/${GRID.length} probes showed it`);
    if (changedInFront !== 0) t.fail(`${changedInFront} probes changed in another way when the far terrain was switched off: it must only ever show where there was nothing`);
    if (nearRows !== 0) t.fail(`${nearRows} probes of the lower half of the view changed: far terrain must never appear in front of detailed terrain`);
    out.far = Object.fromEntries(withFar.filter((_, k) => k % 7 === 0).map((p, k) => [`p${k}`, p]));
    console.log(`smoke: [${label}] far terrain on ${NAMES[renderer]} → 31 far tiles · ${shownByFar}/${GRID.length} probes show far terrain where there was only horizon · 0 change in front of it`);
    await t.page.close();
  }

  // --- Generated textures and natural paint, on the streamed map (the default look of the stream scene).
  {
    // far=off: this scenario checks the fog alone (with far terrain the horizon is no longer empty; see the far terrain scenario).
    const t = await open('natural', 'stream', 'focus=256,256&view=oblique&frameBudget=50&far=off');
    await t.page.waitForFunction(() => { const text = document.getElementById('debug-overlay').textContent; return /pending 0$/m.test(text) && /^Streaming GPU queue: 0$/m.test(text); }, null, { timeout: 60000 }).catch(() => t.fail('streaming never settled'));
    const GRID = [];
    for (let j = 0; j < 9; j++) for (let i = 0; i < 16; i++) GRID.push([(i + 0.5) / 16, (j + 0.5) / 9]);
    const px = await t.probe(GRID);
    // The stream scene is fogged by default (P1.11): the background is the fog colour, and the horizon dissolves into it.
    const FOG_RGB = [158, 184, 209];
    const top = await t.probe(Array.from({ length: 16 }, (_, i) => [(i + 0.5) / 16, 0.02]));
    const fogged = top.filter((p) => near(p, FOG_RGB, 6)).length;
    if (fogged < 12) t.fail(`the top of the view should have dissolved into the fog colour, only ${fogged}/16 probes have`);
    const terrain = px.filter((p) => !near(p, FOG_RGB, 6));
    if (terrain.length < GRID.length / 2) t.fail(`the view should be mostly terrain, only ${terrain.length}/${GRID.length} probes are`);
    if (terrain.some((p) => p[0] + p[1] + p[2] === 0)) t.fail('a black pixel on the terrain: a texture is missing');
    const distinct = new Set(terrain.map((p) => p.map((v) => v >> 4).join(','))).size;
    if (distinct < 12) t.fail(`textured terrain should show varied colours, only ${distinct} distinct tones`);
    out.natural = Object.fromEntries(px.map((p, i) => [`p${i}`, p]));
    console.log(`smoke: [${label}] textured natural on ${NAMES[renderer]} → ${terrain.length}/${GRID.length} probes on terrain, ${distinct} distinct tones`);
    await t.page.close();
  }
  return out;
}

/**
 * P1.8 streaming: tiles of the sparse map « continent » are loaded and unloaded
 * around a focus that the camera follows.
 *  - resident tiles follow the focus (counts checked against the fixture), absent places stay empty
 *  - coming back gives the SAME picture (normals view): residency and stitched normals do not depend on history
 *  - no normal seam between two tiles; with tileBorders=raw (control) the seam must be detected
 *  - holding an arrow key moves the focus (fixed-step simulation)
 */
async function checkStream(browser, label, renderer) {
  const NAMES = { webgpu: 'WebGPU', webgl2: 'WebGL2' };
  const W = 1280, H = 720;
  const out = {};
  const open = async (name, q) => {
    const fail = (msg) => problems.push(`[${label} stream ${name} ${renderer}] ${msg}`);
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on('console', (m) => {
      const text = m.text();
      if (m.type() === 'warning' && text.includes('GPU stall due to ReadPixels')) return;
      if (m.type() === 'error' || m.type() === 'warning') fail(`console.${m.type()}: ${text} (at ${m.location().url || 'unknown location'})`);
    });
    page.on('pageerror', (e) => fail(`pageerror: ${e.message}`));
    await page.goto(`${BASE_URL}?engine=new&renderer=${renderer}&scene=stream&${q}&timeSpeed=0&sky=off`, { waitUntil: 'load' });
    await page.waitForSelector('#boot-status[data-state="ready"]', { state: 'attached', timeout: 30000 }).catch(() => fail('engine never became ready'));
    // Waits until the overlay shows the given focus tile with nothing pending, then returns its lines.
    const settled = async (tile) => {
      const pattern = `^Streaming: tile ${tile} · radius \\d+/\\d+ · pending 0$`;
      // Settled = nothing left to build AND nothing left in the GPU queue (work is spread over frames).
      await page.waitForFunction((p) => { const text = document.getElementById('debug-overlay').textContent; return new RegExp(p, 'm').test(text) && /^Streaming GPU queue: 0$/m.test(text); }, pattern, { timeout: 60000 }).catch(() => fail(`streaming never settled on tile ${tile}`));
      return (await page.evaluate(() => document.getElementById('debug-overlay').textContent)).split('\n');
    };
    const probe = async (points) => {
      const r = await page.evaluate((pts) => window.__orvalisEngine.probe(pts), points);
      for (const e of r.errors) fail(`GPU error: ${e}`);
      return r.pixels.map((p) => p.slice(0, 3));
    };
    const expectLines = (lines, wanted) => {
      for (const want of wanted) if (!lines.includes(want)) fail(`overlay line missing: "${want}" (got: ${lines.join(' | ')})`);
    };
    return { page, fail, settled, probe, expectLines };
  };
  const GRID = [];
  for (let j = 0; j < 9; j++) for (let i = 0; i < 16; i++) GRID.push([(i + 0.5) / 16, (j + 0.5) / 9]);
  const bg = BG.join(',');

  // --- A journey: start, go east, go nowhere, come back.
  {
    const t = await open('journey', 'focus=256,256&view=oblique&terrainDebug=normals');
    let lines = await t.settled('0,0');
    t.expectLines(lines, [`Renderer: ${NAMES[renderer]}`, 'Terrain map: continent', 'Terrain tiles: 8 (resident)', 'Terrain chunks: 2048', 'Streaming totals: 8 loaded · 0 unloaded', 'Focus: 256.0, 256.0 (arrows / WASD)']);
    const start = (await t.probe(GRID)).map((p) => p.join(','));
    if (start.filter((p) => p !== bg).length < GRID.length / 2) t.fail('the start view should be mostly terrain');

    await t.page.evaluate(() => window.__orvalisEngine.setFocus(2.5 * 512, 256));
    lines = await t.settled('2,0');
    t.expectLines(lines, ['Terrain tiles: 11 (resident)', 'Streaming totals: 14 loaded · 3 unloaded']);

    await t.page.evaluate(() => window.__orvalisEngine.setFocus(1e7, 1e7));
    lines = await t.settled('19531,19531');
    t.expectLines(lines, ['Terrain tiles: 0 (resident)', 'Terrain chunks: 0', 'Draw calls: 0', 'Streaming totals: 14 loaded · 14 unloaded']);
    const nowhere = (await t.probe(GRID)).map((p) => p.join(','));
    if (nowhere.some((p) => p !== bg)) t.fail('far from every tile the view should be empty');

    await t.page.evaluate(() => window.__orvalisEngine.setFocus(256, 256));
    lines = await t.settled('0,0');
    t.expectLines(lines, ['Terrain tiles: 8 (resident)', 'Streaming totals: 22 loaded · 14 unloaded']);
    // Regression (stutter reported by Allan): the main-thread work of streaming must stay small on every frame.
    // Before the fix one frame did a whole tile: 135 ms of building + GPU uploads. The limit is far above the 4 ms
    // budget because this machine is slow and noisy, and far below one tile.
    const workMax = Number(/^Streaming work: [\d.]+ ms\/frame \(max ([\d.]+)\)$/m.exec(lines.join('\n'))?.[1] ?? Number.NaN);
    if (!(workMax < 60)) t.fail(`streaming did up to ${workMax} ms of work in one frame (limit 60)`);
    const back = (await t.probe(GRID)).map((p) => p.join(','));
    const different = back.filter((p, i) => p !== start[i]).length;
    if (different !== 0) t.fail(`coming back to the start gives another picture: ${different}/${GRID.length} probes differ`);
    out.journey = Object.fromEntries(start.map((p, i) => [`p${i}`, p.split(',').map(Number)]));
    console.log(`smoke: [${label}] stream journey on ${NAMES[renderer]} → 8 tiles at (0,0) · 11 at (2,0) · 0 far away · 8 again, picture identical to the start (${GRID.length} probes) · 22 loaded / 14 unloaded · streaming work per frame: max ${workMax} ms`);
    await t.page.close();
  }

  // --- Keyboard: holding the right arrow moves the focus east at a constant speed.
  {
    // frameBudget=50: this machine renders in software at ~15 frames per second; with the default 4 ms per frame
    // the 8 painted tiles would take over a minute to build. The default budget is exercised by the journey above.
    const t = await open('keyboard', 'focus=256,256&view=oblique&height=flat&frameBudget=50');
    await t.settled('0,0');
    await t.page.keyboard.down('ArrowRight');
    await t.page.waitForFunction(() => /^Focus: (\d+\.\d)/m.exec(document.getElementById('debug-overlay').textContent)?.[1] > 300, null, { timeout: 15000 }).catch(() => t.fail('holding ArrowRight did not move the focus east'));
    await t.page.keyboard.up('ArrowRight');
    // Read the engine's own value: the overlay text is only refreshed every 250 ms and would lag behind.
    // (First version of this check compared two overlay readings and failed once on that lag: 320.0 then 324.3.)
    const read = () => t.page.evaluate(() => window.__orvalisEngine.getFocus());
    await t.page.waitForTimeout(100); // lets the keyup event be delivered
    const a = await read();
    await t.page.waitForTimeout(400);
    const b = await read();
    if (!a || !b || a.x !== b.x) t.fail(`the focus should stop when the key is released (${a?.x} then ${b?.x})`);
    if (a && a.y !== 256) t.fail(`the focus should not move along y, got ${a.y}`);
    if (a && !(a.x > 300)) t.fail(`the focus should have moved east, got x = ${a.x}`);
    console.log(`smoke: [${label}] stream keyboard on ${NAMES[renderer]} → ArrowRight moved the focus from x = 256.0 to ${a?.x.toFixed(1)}, y unchanged, stops on release`);
    await t.page.close();
  }

  // --- Normals across the border between tiles (0,0) and (1,0), at x = 512. Seen from above, zoomed: x = 512 is at pixel 640.
  const ROW = Array.from({ length: 240 }, (_, i) => [(520 + i + 0.5) / W, 360.5 / H]);
  const steps = {};
  for (const mode of ['stitched', 'raw']) {
    const t = await open(`border ${mode}`, `focus=512,208.8&view=above&zoom=16&terrainDebug=normals&tileBorders=${mode}`);
    const lines = await t.settled('1,0');
    t.expectLines(lines, ['Terrain debug: normals']);
    const row = await t.probe(ROW);
    for (const p of row) {
      const len = Math.hypot(p[0] / 127.5 - 1, p[1] / 127.5 - 1, p[2] / 127.5 - 1);
      if (Math.abs(len - 1) > 0.04 || p[2] <= 128) { t.fail(`rgb(${p}) is not an upward unit normal`); break; }
    }
    let worst = 0, at = -1;
    for (let i = 1; i < row.length; i++) {
      const d = Math.max(...row[i].map((v, k) => Math.abs(v - row[i - 1][k])));
      if (d > worst) [worst, at] = [d, 520 + i];
    }
    steps[mode] = { worst, at };
    if (mode === 'stitched') out.border = Object.fromEntries(row.filter((_, i) => i % 20 === 0).map((p, i) => [`row${i}`, p]));
    await t.page.close();
  }
  {
    const fail = (msg) => problems.push(`[${label} stream border ${renderer}] ${msg}`);
    if (steps.stitched.worst > SEAM_OK) fail(`a sharp line follows the TILE border x = 512: step of ${steps.stitched.worst}/255 at pixel ${steps.stitched.at}`);
    if (steps.raw.worst < SEAM_SEEN || Math.abs(steps.raw.at - 640) > 2) fail(`control failed: unstitched tiles should show a step at x ≈ 640, got ${steps.raw.worst}/255 at ${steps.raw.at}`);
    console.log(`smoke: [${label}] stream tile border on ${NAMES[renderer]} → largest step between neighbouring pixels: stitched ${steps.stitched.worst} at x=${steps.stitched.at} · raw (control) ${steps.raw.worst} at x=${steps.raw.at}`);
  }
  return out;
}

/**
 * M1.1 test zone: a piece of the old Orvalis terrain, loaded from its asset file and streamed by the new terrain.
 * Checks, in the real browser: the asset is downloaded and decoded, the right tiles are resident, the ground mix
 * lands at the right places (old capital = dirt layer, meadow = base, shore = sand, ridge = rock), the relief is
 * there (flat sea, steep ridge), and a missing asset gives a visible error instead of an empty scene.
 */
async function checkZone(browser, label, renderer) {
  const NAMES = { webgpu: 'WebGPU', webgl2: 'WebGL2' };
  const W = 1280, H = 720;
  const out = {};
  const open = async (name, q, { blockAsset = false } = {}) => {
    const fail = (msg) => problems.push(`[${label} zone ${name} ${renderer}] ${msg}`);
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    const consoleErrors = [];
    page.on('console', (m) => {
      const text = m.text();
      if (m.type() === 'warning' && text.includes('GPU stall due to ReadPixels')) return;
      if (m.type() === 'error' || m.type() === 'warning') {
        if (blockAsset) consoleErrors.push(text);
        else fail(`console.${m.type()}: ${text} (at ${m.location().url || 'unknown location'})`);
      }
    });
    page.on('pageerror', (e) => fail(`pageerror: ${e.message}`));
    const assetRequests = [];
    page.on('response', (r) => { if (r.url().endsWith('.ovz')) assetRequests.push(`${r.status()} ${r.headers()['content-type'] ?? ''}`); });
    if (blockAsset) await page.route('**/*.ovz', (route) => route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' }));
    await page.goto(`${BASE_URL}?engine=new&renderer=${renderer}&scene=zone&frameBudget=50&${q}&timeSpeed=0&liquidTime=0`, { waitUntil: 'load' });
    const settled = async (tile) => {
      const pattern = `^Streaming: tile ${tile} · radius \\d+/\\d+ · pending 0$`;
      await page.waitForFunction((p) => { const text = document.getElementById('debug-overlay').textContent; return new RegExp(p, 'm').test(text) && /^Streaming GPU queue: 0$/m.test(text); }, pattern, { timeout: 90000 }).catch(() => fail(`streaming never settled on tile ${tile}`));
      return (await page.evaluate(() => document.getElementById('debug-overlay').textContent)).split('\n');
    };
    const probe = async (points) => {
      const r = await page.evaluate((pts) => window.__orvalisEngine.probe(pts), points);
      for (const e of r.errors) fail(`GPU error: ${e}`);
      return r.pixels.map((p) => p.slice(0, 3));
    };
    return { page, fail, settled, probe, consoleErrors, assetRequests };
  };
  const CENTRE = [[0.5, 0.5]];
  // Places, in ENGINE coordinates (x, y = −legacy z), with the tile they are in.
  const CAPITAL = { x: -1632, y: -72, tile: '-4,-1' }, MEADOW = { x: -1500, y: -200, tile: '-3,-1' }, SHORE = { x: -1992, y: -100, tile: '-4,-1' }, RIDGE = { x: -1392, y: 700, tile: '-3,1' };

  // --- Ground mix, with flat colours: the pixel under the camera has the colour of the expected layer.
  {
    const t = await open('mix', 'view=above&zoom=16&textures=solid&lighting=off&fog=off&far=off&liquid=off');
    await t.page.waitForSelector('#boot-status[data-state="ready"]', { state: 'attached', timeout: 30000 }).catch(() => t.fail('engine never became ready'));
    const lines = await t.settled(CAPITAL.tile);
    for (const want of [`Renderer: ${NAMES[renderer]}`, 'Terrain map: val-azur-test', 'Terrain tiles: 6 (resident)', 'Terrain chunks: 1536', 'Focus: -1632.0, -72.0 (arrows / WASD)']) {
      if (!lines.includes(want)) t.fail(`overlay line missing: "${want}" (got: ${lines.join(' | ')})`);
    }
    if (t.assetRequests.length !== 1 || !t.assetRequests[0].startsWith('200 ')) t.fail(`the zone asset should be downloaded once with status 200 (got: ${t.assetRequests.join(' ; ') || 'no request'})`);
    const expected = [[CAPITAL, [150, 100, 50], 'dirt layer on the old capital'], [MEADOW, [40, 160, 60], 'base layer on the meadow'], [SHORE, [220, 200, 140], 'sand layer on the shore'], [RIDGE, [128, 128, 136], 'rock layer on the ridge']];
    const seen = [];
    for (const [place, rgb, what] of expected) {
      await t.page.evaluate(([x, y]) => window.__orvalisEngine.setFocus(x, y), [place.x, place.y]);
      await t.settled(place.tile);
      const [px] = await t.probe(CENTRE);
      seen.push(`${what.split(' ')[0]} rgb(${px})`);
      if (!near(px, rgb, 2)) t.fail(`${what}: expected rgb(${rgb}), got rgb(${px})`);
    }
    console.log(`smoke: [${label}] zone ground mix on ${NAMES[renderer]} → ${seen.join(' · ')}`);
    await t.page.close();
  }

  // --- P3.1 / P3.2 liquid: the zone's sea (height 0, ocean class) covers the sea floor (height −9) and nothing
  // above 0. A flat colour for now, so the pixel is an exact blend: (1 − alpha) × ground + alpha × ocean colour.
  {
    const LIQUID = [0.1, 0.3, 0.55], ALPHA = 0.75, SAND = [220, 200, 140], GRASS = [40, 160, 60]; // the ocean material
    const LIGHT = [0.36 + 0.84 * Math.sqrt(3) / 2, 0.39 + 0.8 * Math.sqrt(3) / 2, 0.46 + 0.7 * Math.sqrt(3) / 2]; // noon, flat surface
    const blended = (ground, light) => ground.map((g, k) => Math.round((1 - ALPHA) * Math.min(255, g * light[k]) + ALPHA * Math.min(255, 255 * LIQUID[k] * light[k])));
    const seen = [];
    for (const [name, lighting, light] of [['unlit', 'off', [1, 1, 1]], ['lit at noon', 'on', LIGHT]]) {
      const t = await open(`liquid ${name}`, `view=above&zoom=16&textures=solid&lighting=${lighting}&fog=off&far=off&sky=off&focus=${SHORE.x},${SHORE.y}`);
      await t.page.waitForSelector('#boot-status[data-state="ready"]', { state: 'attached', timeout: 30000 }).catch(() => t.fail('engine never became ready'));
      const lines = await t.settled(SHORE.tile);
      const line = lines.find((l) => l.startsWith('Liquid:')) ?? '';
      const m = /^Liquid: on \(O\) · (\d+) chunks · (\d+) cells · (\d+) drawn · ocean \2 · frame 0\/30$/.exec(line); // the zone's sea is all ocean-class; animation frozen at 0
      if (!m || Number(m[1]) < 20 || Number(m[2]) < Number(m[1]) || Number(m[3]) < 1) t.fail(`overlay liquid line wrong: "${line}"`);
      const [wet] = await t.probe(CENTRE);
      const want = blended(SAND, light);
      if (!near(wet, want, 2)) t.fail(`sea over the sea floor: expected rgb(${want}), got rgb(${wet})`);
      // O hides the liquid: the bare sea floor is back.
      await t.page.keyboard.press('KeyO');
      await t.page.waitForFunction(() => /^Liquid: off \(O\)/m.test(document.getElementById('debug-overlay').textContent), null, { timeout: 5000 }).catch(() => t.fail('O did not hide the liquid'));
      const [bare] = await t.probe(CENTRE);
      const floor = SAND.map((g, k) => Math.round(Math.min(255, g * light[k])));
      if (!near(bare, floor, 2)) t.fail(`liquid hidden: expected the sea floor rgb(${floor}), got rgb(${bare})`);
      await t.page.keyboard.press('KeyO');
      // Dry land (the meadow is above 0): no liquid over it.
      await t.page.evaluate(([x, y]) => window.__orvalisEngine.setFocus(x, y), [MEADOW.x, MEADOW.y]);
      await t.settled(MEADOW.tile);
      const [dry] = await t.probe(CENTRE);
      const grass = GRASS.map((g, k) => Math.round(Math.min(255, g * light[k])));
      if (!near(dry, grass, 2)) t.fail(`dry land should show no liquid: expected rgb(${grass}), got rgb(${dry})`);
      out[`liquid ${name}`] = { wet, bare, dry };
      seen.push(`${name}: sea rgb(${wet}) (expected ${want}) · hidden rgb(${bare}) · meadow rgb(${dry})`);
      await t.page.close();
    }
    console.log(`smoke: [${label}] zone liquid on ${NAMES[renderer]} → ${seen.join(' | ')}`);
  }

  // --- Relief, with normals as colours: the sea floor is flat, the ridge is steep.
  {
    const t = await open('relief', 'view=above&zoom=16&terrainDebug=normals&far=off');
    await t.page.waitForSelector('#boot-status[data-state="ready"]', { state: 'attached', timeout: 30000 }).catch(() => t.fail('engine never became ready'));
    await t.page.evaluate(([x, y]) => window.__orvalisEngine.setFocus(x, y), [SHORE.x, SHORE.y]);
    await t.settled(SHORE.tile);
    const [flat] = await t.probe(CENTRE);
    if (!near(flat, [128, 128, 255], 2)) t.fail(`the sea floor should be flat: normal colour rgb(128,128,255) expected, got rgb(${flat})`);
    await t.page.evaluate(([x, y]) => window.__orvalisEngine.setFocus(x, y), [RIDGE.x, RIDGE.y]);
    await t.settled(RIDGE.tile);
    const [steep] = await t.probe(CENTRE);
    // Legacy slope there is about 2.4, so the normal's z is about 1/√(1 + 2.4²) = 0.38 → blue ≈ 176.
    if (steep[2] > 200 || steep[2] < 150) t.fail(`the ridge should be steep (blue ≈ 176), got rgb(${steep})`);
    console.log(`smoke: [${label}] zone relief on ${NAMES[renderer]} → sea floor rgb(${flat}) · ridge rgb(${steep})`);
    await t.page.close();
  }

  // --- The default view (what Allan opens): textured, lit, fog, far terrain. Mostly terrain, same on both backends.
  {
    const t = await open('default', '');
    await t.page.waitForSelector('#boot-status[data-state="ready"]', { state: 'attached', timeout: 30000 }).catch(() => t.fail('engine never became ready'));
    const lines = await t.settled(CAPITAL.tile);
    if (!lines.some((l) => /^Far terrain: on \(T\) · 16 tiles/.test(l))) t.fail(`the far terrain should hold the 16 tiles of the zone (got: ${lines.filter((l) => l.startsWith('Far')).join(' | ') || 'no far line'})`);
    const GRID = [];
    for (let j = 0; j < 6; j++) for (let i = 0; i < 8; i++) GRID.push([(i + 0.5) / 8, (j + 0.5) / 6]);
    const pixels = await t.probe(GRID);
    const lower = pixels.slice(24); // lower half of the picture: ground near the camera
    if (new Set(lower.map((p) => p.join(','))).size < 12) t.fail('the default view should show varied textured ground in its lower half');
    out.default = Object.fromEntries(pixels.map((p, i) => [`p${i}`, p]));
    await t.page.close();
  }

  // --- Missing asset: a visible error, no scene, nothing ignored silently.
  {
    const t = await open('missing asset', '', { blockAsset: true });
    await t.page.waitForSelector('#boot-status[data-state="zone-error"]', { state: 'attached', timeout: 30000 }).catch(() => t.fail('a missing zone asset should put the page in the zone-error state'));
    const shown = await t.page.evaluate(() => { const s = document.getElementById('boot-status'); return { text: s.textContent, hidden: s.hidden, error: s.dataset.zoneError ?? '' }; });
    if (shown.hidden || !shown.text.startsWith('Zone de test : chargement impossible')) t.fail(`the error should be visible on the page (hidden=${shown.hidden}, text="${shown.text}")`);
    if (!/HTTP 404 for assets\/zones\/val-azur-test\.ovz/.test(shown.error)) t.fail(`the error should name the file and the status (got "${shown.error}")`);
    if (!t.consoleErrors.some((e) => e.startsWith('[zone] '))) t.fail(`the failure should be logged (console: ${t.consoleErrors.join(' ; ')})`);
    await t.page.close();
  }
  return out;
}

/**
 * P2.1 world clock, in the running engine: start time and pause from the URL, real-time advance at the
 * configured day length, a small sync absorbed without a jump, a large one jumping.
 */
async function checkClock(browser, label) {
  const fail = (msg) => problems.push(`[${label} clock] ${msg}`);
  const open = async (q) => {
    const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
    page.on('console', (m) => {
      if (m.type() === 'warning' && /falling back to WebGL2|Failed to create WebGPU Context Provider/.test(m.text())) return;
      if (m.type() === 'error' || m.type() === 'warning') fail(`console.${m.type()}: ${m.text()}`);
    });
    page.on('pageerror', (e) => fail(`pageerror: ${e.message}`));
    await page.goto(`${BASE_URL}?engine=new&scene=triangle&${q}`, { waitUntil: 'load' });
    await page.waitForSelector('#boot-status[data-state="ready"]', { state: 'attached', timeout: 30000 }).catch(() => fail('engine never became ready'));
    return page;
  };
  const read = (page) => page.evaluate(() => ({ at: performance.now(), units: window.__orvalisEngine.getWorldTime() }));

  // Paused at a given time: the overlay line is exact and stays.
  {
    const page = await open('time=14:30&timeSpeed=0');
    const want = 'World time: 14:30 · unit 1740/2880 · day 1440 s × 0 · 0 sync';
    await page.waitForFunction((w) => document.getElementById('debug-overlay').textContent.split('\n').includes(w), want, { timeout: 10000 }).catch(() => fail(`overlay line missing: "${want}"`));
    await page.waitForTimeout(700);
    const { units } = await read(page);
    if (units !== 1740) fail(`a paused clock should stay at 1740, got ${units}`);
    await page.close();
  }

  // Running: 2 units per real second with the default day; then two syncs.
  const page = await open('time=06:00');
  const a = await read(page);
  await page.waitForTimeout(1500);
  const b = await read(page);
  const rate = ((b.units - a.units) / (b.at - a.at)) * 1000;
  if (a.units < 720 || a.units > 740) fail(`the clock should start at 06:00 (unit 720), got ${a.units}`);
  if (Math.abs(rate - 2) > 0.01) fail(`the clock should advance 2 units per second, measured ${rate}`);

  // Server 4 units ahead: no jump, caught up after the announced time.
  const small = await page.evaluate(() => { const e = window.__orvalisEngine; const before = e.getWorldTime(); const r = e.syncWorldTime(before + 4); return { before, after: e.getWorldTime(), at: performance.now(), r }; });
  if (small.r.snapped || Math.abs(small.r.errorUnits + 4) > 0.01 || Math.abs(small.r.smoothingMs - 4000) > 20) fail(`a 4-unit sync should be smoothed over 4 s, got ${JSON.stringify(small.r)}`);
  if (small.after - small.before > 0.05) fail(`a smoothed sync must not jump: ${small.before} → ${small.after}`);
  await page.waitForTimeout(4300);
  const c = await read(page);
  const expected = small.before + 4 + ((c.at - small.at) / 1000) * 2;
  if (Math.abs(c.units - expected) > 0.05) fail(`after smoothing the clock should be on server time ${expected.toFixed(2)}, got ${c.units.toFixed(2)}`);

  // Server far away: jump.
  const big = await page.evaluate(() => { const e = window.__orvalisEngine; const r = e.syncWorldTime(300); return { r, after: e.getWorldTime() }; });
  if (!big.r.snapped || Math.abs(big.after - 300) > 0.05) fail(`a large sync should jump to 300, got ${JSON.stringify(big)}`);
  const line = await page.waitForFunction(() => document.getElementById('debug-overlay').textContent.split('\n').find((l) => /^World time: 02:3\d · unit 30\d\/2880 · day 1440 s · 2 sync$/.test(l)), null, { timeout: 5000 }).then((h) => h.jsonValue()).catch(() => null);
  if (!line) fail('the overlay should show the time after the jump and 2 syncs');
  console.log(`smoke: [${label}] world clock → paused at 14:30 stays · runs at ${rate.toFixed(3)} units/s · 4-unit sync smoothed over ${Math.round(small.r.smoothingMs)} ms without a jump · far sync jumps · ${line ?? 'overlay line missing'}`);
  await page.close();
}

/**
 * P2.2 day/night cycle: the terrain's light colours and the fog (= horizon) colour follow the world clock.
 * Flat ground, flat colours, clock paused at chosen times: every pixel is predictable from the keyframes.
 */
async function checkDayCycle(browser, label, renderer) {
  const NAMES = { webgpu: 'WebGPU', webgl2: 'WebGL2' };
  const fail = (msg) => problems.push(`[${label} day cycle ${renderer}] ${msg}`);
  // Copied from ORVALIS_DAY_CYCLE on purpose: an independent expectation.
  const KEY = {
    night: { ambient: [0.1, 0.12, 0.2], diffuse: [0.1, 0.12, 0.2], fog: [0.05, 0.07, 0.13] },
    noon: { ambient: [0.36, 0.39, 0.46], diffuse: [0.84, 0.8, 0.7], fog: [0.62, 0.72, 0.82] },
    afternoon: { ambient: [0.36, 0.38, 0.44], diffuse: [0.86, 0.78, 0.64], fog: [0.62, 0.7, 0.78] },
    sunset: { ambient: [0.3, 0.26, 0.3], diffuse: [0.8, 0.45, 0.25], fog: [0.72, 0.48, 0.36] },
  };
  const mix = (a, b, t) => Object.fromEntries(['ambient', 'diffuse', 'fog'].map((f) => [f, a[f].map((v, k) => v + (b[f][k] - v) * t)]));
  const BASE = [40, 160, 60]; // solid layer 0
  // P2.3 lighting sun, written out independently: compass azimuth 225°, elevation 35°..60° (cosine, highest at noon).
  const units = (time) => { const [h, m] = time.split(':').map(Number); return h * 120 + m * 2; };
  const toLight = (time) => {
    const el = ((35 + 25 * (0.5 + 0.5 * Math.cos((2 * Math.PI * (units(time) - 1440)) / 2880))) * Math.PI) / 180;
    return [-Math.cos(el) * Math.SQRT1_2, -Math.cos(el) * Math.SQRT1_2, Math.sin(el)];
  };
  const lit = (env, time, normal = [0, 0, 1], direction = toLight(time)) => {
    const nl = Math.hypot(...normal);
    const nDotL = Math.max(0, normal.reduce((sum, v, k) => sum + (v / nl) * direction[k], 0));
    return BASE.map((c, k) => Math.min(255, Math.round(c * (env.ambient[k] + env.diffuse[k] * nDotL))));
  };
  const ground = (env, time = '12:00') => lit(env, time);
  const horizon = (env) => env.fog.map((v) => Math.round(v * 255));
  const open = async (q, height = 'flat') => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('console', (m) => {
      if (m.type() === 'warning' && m.text().includes('GPU stall due to ReadPixels')) return;
      if (m.type() === 'error' || m.type() === 'warning') fail(`console.${m.type()}: ${m.text()}`);
    });
    page.on('pageerror', (e) => fail(`pageerror: ${e.message}`));
    // Fog far away (it only gives the background its colour here), so the ground shows the light alone.
    await page.goto(`${BASE_URL}?engine=new&renderer=${renderer}&scene=tile&height=${height}&view=above&terrainDebug=textured&textures=solid&paint=quadrants&fog=on&fogStart=100000&fogEnd=200000&${q}`, { waitUntil: 'load' });
    await page.waitForSelector('#boot-status[data-state="ready"]', { state: 'attached', timeout: 30000 }).catch(() => fail('engine never became ready'));
    return page;
  };
  // South-west quadrant of the tile (layer 0 only), and a corner of the picture outside the tile (background).
  const POINTS = [[0.44, 0.6], [0.02, 0.03]];
  const probe = async (page) => {
    const r = await page.evaluate((pts) => window.__orvalisEngine.probe(pts), POINTS);
    for (const e of r.errors) fail(`GPU error: ${e}`);
    return r.pixels.map((p) => p.slice(0, 3));
  };
  const out = {}, seen = [];
  const cases = [
    ['12:00', KEY.noon, 'Day cycle: noon → afternoon 0 %'],
    ['17:30', mix(KEY.afternoon, KEY.sunset, 0.5), 'Day cycle: afternoon → sunset 50 %'],
    ['19:00', KEY.sunset, 'Day cycle: sunset → dusk 0 %'],
    ['00:00', KEY.night, 'Day cycle: night → night 33 %'],
  ];
  for (const [time, env, line] of cases) {
    const page = await open(`time=${time}&timeSpeed=0`);
    const [g, bg] = await probe(page);
    if (!near(g, ground(env, time), 2)) fail(`${time}: ground expected rgb(${ground(env, time)}), got rgb(${g})`);
    if (!near(bg, horizon(env), 2)) fail(`${time}: horizon expected rgb(${horizon(env)}), got rgb(${bg})`);
    const lines = (await page.evaluate(() => document.getElementById('debug-overlay').textContent)).split('\n');
    if (!lines.some((l) => l.startsWith(line))) fail(`${time}: overlay line missing: "${line}" (got: ${lines.filter((l) => l.startsWith('Day cycle')).join(' | ') || 'none'})`);
    out[time] = { ground: g, horizon: bg };
    seen.push(`${time} ground rgb(${g}) horizon rgb(${bg})`);
    if (time === '12:00') {
      // PageUp: one game hour later, a quarter of the way to « afternoon »; the picture follows.
      await page.keyboard.press('PageUp');
      await page.waitForFunction(() => /^World time: 13:00 /m.test(document.getElementById('debug-overlay').textContent), null, { timeout: 5000 }).catch(() => fail('PageUp should move the clock to 13:00'));
      const [g13] = await probe(page);
      const want = ground(mix(KEY.noon, KEY.afternoon, 0.25), '13:00');
      if (!near(g13, want, 2)) fail(`13:00 after PageUp: ground expected rgb(${want}), got rgb(${g13})`);
      await page.keyboard.press('PageDown');
      await page.keyboard.press('PageDown');
      await page.waitForFunction(() => /^World time: 11:00 /m.test(document.getElementById('debug-overlay').textContent), null, { timeout: 5000 }).catch(() => fail('PageDown twice should move the clock to 11:00'));
    }
    await page.close();
  }
  if (near(out['12:00'].ground, out['00:00'].ground, 40)) fail('night and noon should look very different');

  // dayCycle=off: the clock says midnight, the picture stays as before the cycle existed (noon values).
  {
    const page = await open('time=00:00&timeSpeed=0&dayCycle=off');
    const [g, bg] = await probe(page);
    if (!near(g, ground(KEY.noon), 2) || !near(bg, horizon(KEY.noon), 2)) fail(`dayCycle=off should keep the default light: got ground rgb(${g}), horizon rgb(${bg})`);
    const text = await page.evaluate(() => document.getElementById('debug-overlay').textContent);
    if (/^Day cycle/m.test(text)) fail('dayCycle=off should not show a Day cycle line');
    await page.close();
  }

  // Running clock, fast (a game day in 24 s): the ground darkens from sunset into the night, and P freezes it.
  {
    const page = await open('time=19:00&timeSpeed=60');
    const [first] = await probe(page);
    await page.waitForFunction(() => /^World time: 2[23]:/m.test(document.getElementById('debug-overlay').textContent), null, { timeout: 15000 }).catch(() => fail('the clock should reach 22:00 within a few seconds at × 60'));
    await page.keyboard.press('KeyP');
    const paused = await page.evaluate(() => window.__orvalisEngine.getWorldTime());
    const [later] = await probe(page);
    await page.waitForTimeout(600);
    const still = await page.evaluate(() => window.__orvalisEngine.getWorldTime());
    if (still !== paused) fail(`P should pause the clock (${paused} → ${still})`);
    const pausedAt = `${Math.floor(paused / 120)}:${String(Math.floor((paused % 120) / 2)).padStart(2, '0')}`;
    if (!near(later, ground(KEY.night, pausedAt), 2)) fail(`after 22:00 the ground should have the night colour rgb(${ground(KEY.night, pausedAt)}), got rgb(${later})`);
    if (later[1] >= first[1]) fail(`the ground should get darker from sunset to night: rgb(${first}) → rgb(${later})`);
    await page.keyboard.press('KeyP');
    await page.waitForTimeout(400);
    if ((await page.evaluate(() => window.__orvalisEngine.getWorldTime())) === paused) fail('P again should resume the clock');
    await page.close();
  }
  // P2.3 — which sun lights the ground. On a slope, at 08:00, the disc is in the east but the light still comes
  // from the south-west: the pixel must match the LIGHTING sun, and be clearly different from what the visible
  // sun would give.
  {
    const MORNING = { ambient: [0.33, 0.36, 0.42], diffuse: [0.8, 0.74, 0.62] }; // keyframe « morning » (08:00)
    const NORMAL = [-0.25, -0.125, 1]; // the « slope » relief
    const page = await open('time=08:00&timeSpeed=0', 'slope');
    const [g] = await probe(page);
    const suns = await page.evaluate(() => window.__orvalisEngine.getSuns());
    const want = lit(MORNING, '08:00', NORMAL), wrong = lit(MORNING, '08:00', NORMAL, suns?.visible ?? [1, 0, 0]);
    if (!near(g, want, 2)) fail(`08:00 slope: expected rgb(${want}) from the lighting sun, got rgb(${g})`);
    if (near(want, wrong, 10)) fail(`control failed: lighting and visible suns should give different pixels here (${want} vs ${wrong})`);
    const deg = (d) => ({ az: ((Math.atan2(d[0], d[1]) * 180) / Math.PI + 360) % 360, el: (Math.asin(d[2]) * 180) / Math.PI });
    const l = deg(suns?.lighting ?? [0, 0, 1]), v = deg(suns?.visible ?? [0, 0, 1]);
    if (Math.abs(l.az - 225) > 0.01 || Math.abs(l.el - 53.75) > 0.01) fail(`lighting sun at 08:00 should be az 225° el 53.75°, got az ${l.az.toFixed(2)}° el ${l.el.toFixed(2)}°`);
    if (!(v.az > 90 && v.az < 120 && v.el > 20 && v.el < 30)) fail(`visible sun at 08:00 should be in the east, 20–30° high, got az ${v.az.toFixed(1)}° el ${v.el.toFixed(1)}°`);
    const line = (await page.evaluate(() => document.getElementById('debug-overlay').textContent)).split('\n').find((x) => x.startsWith('Suns:'));
    if (line !== `Suns: light az 225° el 54° · visible az ${v.az.toFixed(0)}° el ${v.el.toFixed(0)}°`) fail(`overlay sun line wrong: "${line}"`);
    out.slope0800 = { ground: g };
    console.log(`smoke: [${label}] two suns on ${NAMES[renderer]} → 08:00 slope rgb(${g}) = lighting sun (expected ${want}; the visible sun would give ${wrong}) · ${line}`);
    await page.close();
  }
  console.log(`smoke: [${label}] day cycle on ${NAMES[renderer]} → ${seen.join(' · ')} · PageUp/PageDown/P work · dayCycle=off keeps noon`);
  return out;
}

/**
 * P2.4 sky: gradient horizon → zenith behind the terrain, horizon = fog colour, disc of the VISIBLE sun.
 * The camera is known (stream scene, flat ground, pitch and heading from the URL), so every sky pixel is
 * predicted here from the formula, written out independently of the engine.
 */
async function checkSky(browser, label, renderer) {
  const NAMES = { webgpu: 'WebGPU', webgl2: 'WebGL2' };
  const W = 1280, H = 720;
  const fail = (msg) => problems.push(`[${label} sky ${renderer}] ${msg}`);
  const RAD = Math.PI / 180;
  const unitsOf = (time) => { const [h, m] = time.split(':').map(Number); return h * 120 + m * 2; };
  // Visible sun (P2.3): east at 06:00, 60° high in the south at noon.
  const sunAt = (time) => { const a = (2 * Math.PI * (unitsOf(time) - 720)) / 2880; return [Math.cos(a), -Math.sin(a) * Math.cos(60 * RAD), Math.sin(a) * Math.sin(60 * RAD)]; };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cameraOf = (pitch, heading) => {
    const p = pitch * RAD, h = heading * RAD;
    const forward = [Math.cos(p) * Math.sin(h), Math.cos(p) * Math.cos(h), -Math.sin(p)];
    const right = [Math.cos(h), -Math.sin(h), 0];
    const up = [right[1] * forward[2] - right[2] * forward[1], right[2] * forward[0] - right[0] * forward[2], right[0] * forward[1] - right[1] * forward[0]];
    const tanY = Math.tan(Math.PI / 6), tanX = tanY * (W / H);
    return { forward, right, up, tanX, tanY };
  };
  const dirOf = (cam, fx, fy) => {
    const nx = 2 * fx - 1, ny = 1 - 2 * fy;
    const d = [0, 1, 2].map((k) => cam.forward[k] + nx * cam.tanX * cam.right[k] + ny * cam.tanY * cam.up[k]);
    const l = Math.hypot(...d);
    return d.map((v) => v / l);
  };
  // Where a direction lands on the screen (fractions), or null when it is behind the camera.
  const screenOf = (cam, d) => { const f = dot(d, cam.forward); return f <= 0 ? null : [(dot(d, cam.right) / (f * cam.tanX) + 1) / 2, (1 - dot(d, cam.up) / (f * cam.tanY)) / 2]; };
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const COS_OUTER = Math.cos(2.7 * RAD), INV_EDGE = 1 / (Math.cos(2.3 * RAD) - COS_OUTER), GLOW = 0.35;
  const skyColour = (env, sun, d) => {
    const e = d[2], k = 1 - clamp01(e), gradient = 1 - k * k * k;
    const c = Math.max(0, dot(d, sun)), above = clamp01(40 * e + 0.5);
    const halo = c ** 64 * GLOW * above, disc = clamp01((c - COS_OUTER) * INV_EDGE) * above;
    return [0, 1, 2].map((i) => { const sky = env.horizon[i] + (env.zenith[i] - env.horizon[i]) * gradient + env.sun[i] * halo; return Math.round(clamp01(sky + (env.sun[i] - sky) * disc) * 255); });
  };
  // Copied from ORVALIS_DAY_CYCLE.
  const NOON = { horizon: [0.62, 0.72, 0.82], zenith: [0.2, 0.4, 0.78], sun: [1, 0.98, 0.9] };
  const NIGHT = { horizon: [0.05, 0.07, 0.13], zenith: [0.01, 0.02, 0.06], sun: [1, 0.55, 0.3] };
  const DAWN = { horizon: [0.45, 0.38, 0.42], zenith: [0.2, 0.25, 0.42], sun: [1, 0.62, 0.35] }, MORNING = { horizon: [0.6, 0.69, 0.78], zenith: [0.22, 0.42, 0.75], sun: [1, 0.95, 0.8] };
  const blend = (a, b, t) => Object.fromEntries(Object.keys(a).map((f) => [f, a[f].map((v, k) => v + (b[f][k] - v) * t)]));
  const open = async (q) => {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on('console', (m) => {
      if (m.type() === 'warning' && m.text().includes('GPU stall due to ReadPixels')) return;
      if (m.type() === 'error' || m.type() === 'warning') fail(`console.${m.type()}: ${m.text()}`);
    });
    page.on('pageerror', (e) => fail(`pageerror: ${e.message}`));
    await page.goto(`${BASE_URL}?engine=new&renderer=${renderer}&scene=stream&height=flat&textures=solid&far=off&fog=off&loadRadius=0&focus=256,256&frameBudget=50&timeSpeed=0&${q}`, { waitUntil: 'load' });
    await page.waitForSelector('#boot-status[data-state="ready"]', { state: 'attached', timeout: 30000 }).catch(() => fail('engine never became ready'));
    await page.waitForFunction(() => { const t = document.getElementById('debug-overlay').textContent; return /pending 0$/m.test(t) && /^Streaming GPU queue: 0$/m.test(t); }, null, { timeout: 60000 }).catch(() => fail('streaming never settled'));
    return page;
  };
  const probe = async (page, points) => {
    const r = await page.evaluate((pts) => window.__orvalisEngine.probe(pts), points);
    for (const e of r.errors) fail(`GPU error: ${e}`);
    return r.pixels.map((p) => p.slice(0, 3));
  };
  const centre = (px, py) => [(px + 0.5) / W, (py + 0.5) / H];
  const out = {};

  // --- Gradient: noon, looking north (the sun is behind the camera), 5° below the horizontal.
  {
    const cam = cameraOf(5, 0), sun = sunAt('12:00');
    const page = await open('pitch=5&heading=0&time=12:00');
    const lines = (await page.evaluate(() => document.getElementById('debug-overlay').textContent)).split('\n');
    if (!lines.includes('Sky: on (K)')) fail('overlay line missing: "Sky: on (K)"');
    const points = [[640, 10], [640, 80], [640, 160], [640, 240], [200, 40], [1100, 120], [30, 300]].map(([x, y]) => centre(x, y));
    const got = await probe(page, points);
    let worst = 0;
    points.forEach((pt, i) => {
      const want = skyColour(NOON, sun, dirOf(cam, pt[0], pt[1]));
      worst = Math.max(worst, ...want.map((v, k) => Math.abs(v - got[i][k])));
      if (!near(got[i], want, 2)) fail(`gradient at pixel ${Math.floor(pt[0] * W)},${Math.floor(pt[1] * H)}: expected rgb(${want}), got rgb(${got[i]})`);
    });
    if (!(got[0][0] < got[3][0] - 20)) fail(`the sky should be bluer (less red) at the top than near the horizon: rgb(${got[0]}) vs rgb(${got[3]})`);
    // Just under the horizon line, beyond the only loaded tile: the horizon colour, which is the fog colour.
    const horizonRow = Math.round(((1 - Math.tan(5 * RAD) / cam.tanY) / 2) * H); // the camera looks 5° down: the horizon is above the centre
    const [under] = await probe(page, [centre(640, horizonRow + 8)]);
    if (!near(under, NOON.horizon.map((v) => Math.round(v * 255)), 2)) fail(`below the horizon the background should be the fog colour, got rgb(${under})`);
    out.gradient = Object.fromEntries(got.map((p, i) => [`p${i}`, p]));
    // K switches the sky off: the plain clear colour is back (the fog is off in this scene).
    await page.keyboard.press('KeyK');
    await page.waitForFunction(() => document.getElementById('debug-overlay').textContent.includes('Sky: off (K)'), null, { timeout: 5000 }).catch(() => fail('K did not switch the sky off'));
    const [plain] = await probe(page, [points[0]]);
    if (!near(plain, BG, 1)) fail(`sky off: expected the clear colour rgb(${BG}), got rgb(${plain})`);
    console.log(`smoke: [${label}] sky gradient on ${NAMES[renderer]} → top rgb(${got[0]}) … near horizon rgb(${got[3]}) · 7 probes within ${worst}/255 of the formula · below the horizon rgb(${under}) = fog colour · K switches it off`);
    await page.close();
  }

  // --- Sun disc: 07:30, looking towards the sunrise side. The disc must be where the VISIBLE sun is.
  {
    const time = '07:30', sun = sunAt(time), env = blend(DAWN, MORNING, 0.8);
    const azimuth = Math.round(((Math.atan2(sun[0], sun[1]) / RAD) + 360) % 360);
    const cam = cameraOf(5, azimuth);
    const at = screenOf(cam, sun);
    if (!at || at[0] < 0.1 || at[0] > 0.9 || at[1] < 0.05 || at[1] > 0.6) fail(`test set-up: the sun should be on screen, got ${at}`);
    const page = await open(`pitch=5&heading=${azimuth}&time=${time}`);
    const px = Math.floor(at[0] * W), py = Math.floor(at[1] * H);
    const points = [centre(px, py), centre(px + 8, py), centre(px + 200, py), centre(px, py - 60), centre(px - 300, py + 40)];
    const got = await probe(page, points);
    const sunRgb = env.sun.map((v) => Math.round(v * 255));
    if (!near(got[0], sunRgb, 2) || !near(got[1], sunRgb, 2)) fail(`the disc should be at pixel ${px},${py} with colour rgb(${sunRgb}); got rgb(${got[0]}) and rgb(${got[1]}) 8 px away`);
    let worst = 0;
    points.slice(2).forEach((pt, i) => {
      const want = skyColour(env, sun, dirOf(cam, pt[0], pt[1]));
      worst = Math.max(worst, ...want.map((v, k) => Math.abs(v - got[i + 2][k])));
      if (!near(got[i + 2], want, 3)) fail(`around the sun, probe ${i}: expected rgb(${want}), got rgb(${got[i + 2]})`);
    });
    // Size of the disc: bright along a horizontal run of about 2 × 2.5° through its centre.
    const row = await probe(page, Array.from({ length: 121 }, (_, i) => centre(px - 60 + i, py)));
    const width = row.filter((p) => near(p, sunRgb, 6)).length;
    const pxPerDegree = (H / 2) / cam.tanY * RAD / (dot(sun, cam.forward) ** 2);
    if (Math.abs(width - 2 * 2.3 * pxPerDegree) > 6) fail(`the disc should be about ${(2 * 2.3 * pxPerDegree).toFixed(0)} px wide, measured ${width}`);
    const suns = await page.evaluate(() => window.__orvalisEngine.getSuns());
    if (!suns || Math.hypot(suns.visible[0] - sun[0], suns.visible[1] - sun[1], suns.visible[2] - sun[2]) > 1e-6) fail('the engine\'s visible sun direction differs from the expected one');
    out.sun = Object.fromEntries(got.map((p, i) => [`p${i}`, p]));
    console.log(`smoke: [${label}] sun disc on ${NAMES[renderer]} → at pixel ${px},${py} rgb(${got[0]}) (expected ${sunRgb}) · ${width} px wide · halo and sky around within ${worst}/255 of the formula`);
    await page.close();
  }

  // --- Night: dark sky, no disc anywhere on the row where it was in the morning.
  {
    const cam = cameraOf(5, 100), sun = sunAt('00:00');
    const page = await open('pitch=5&heading=100&time=00:00');
    const points = [[640, 10], [640, 200], [300, 100], [1000, 150]].map(([x, y]) => centre(x, y));
    const got = await probe(page, points);
    points.forEach((pt, i) => {
      const want = skyColour(NIGHT, sun, dirOf(cam, pt[0], pt[1]));
      if (!near(got[i], want, 2)) fail(`night sky, probe ${i}: expected rgb(${want}), got rgb(${got[i]})`);
    });
    if (Math.max(...got.flat()) > 40) fail(`the night sky should be dark everywhere, got ${got.map((p) => `rgb(${p})`).join(' ')}`);
    out.night = Object.fromEntries(got.map((p, i) => [`p${i}`, p]));
    console.log(`smoke: [${label}] night sky on ${NAMES[renderer]} → ${got.map((p) => `rgb(${p})`).join(' · ')}`);
    await page.close();
  }
  return out;
}

/**
 * P3.2 liquid classes: four classes side by side over flat ground (one per tile quadrant), each with its own
 * material BEHAVIOUR — river, ocean and slime are blended and follow the light; magma is opaque and full-bright.
 */
async function checkLiquidClasses(browser, label, renderer) {
  const NAMES = { webgpu: 'WebGPU', webgl2: 'WebGL2' };
  const fail = (msg) => problems.push(`[${label} liquid classes ${renderer}] ${msg}`);
  // Copied from LIQUID_MATERIALS on purpose.
  const MATERIAL = {
    river: { color: [0.2, 0.46, 0.56], alpha: 0.6, lit: true },
    ocean: { color: [0.1, 0.3, 0.55], alpha: 0.75, lit: true },
    magma: { color: [1, 0.38, 0.05], alpha: 1, lit: false },
    slime: { color: [0.35, 0.55, 0.12], alpha: 0.85, lit: true },
  };
  // « quadrants » paint: a different solid ground layer under each class, so the blend is checked against 4 grounds.
  const GROUND = { river: [40, 160, 60], ocean: [150, 100, 50], magma: [128, 128, 136], slime: [220, 200, 140] };
  // Light on a horizontal surface: keyframe colours and the lighting sun's elevation (60° at noon, 35° at midnight).
  const LIGHT = {
    '12:00': [0.36, 0.39, 0.46].map((a, k) => a + [0.84, 0.8, 0.7][k] * Math.sin((60 * Math.PI) / 180)),
    '00:00': [0.1, 0.12, 0.2].map((a, k) => a + [0.1, 0.12, 0.2][k] * Math.sin((35 * Math.PI) / 180)),
  };
  const expected = (name, m, light) => GROUND[name].map((g, k) => Math.round((1 - m.alpha) * Math.min(255, g * light[k]) + m.alpha * Math.min(255, 255 * m.color[k] * (m.lit ? light[k] : 1))));
  // Quadrant centres, seen from above (chunk units, tile centred — same mapping as the lighting check).
  const at = (cx, cy) => [0.5 + ((cx - 8) / 16) * 0.2598, 0.5 - ((cy - 8) / 16) * 0.4619];
  const POINTS = { river: at(4, 4), ocean: at(12, 4), magma: at(4, 12), slime: at(12, 12) };
  const out = {}, seen = [];
  for (const time of ['12:00', '00:00']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('console', (m) => {
      if (m.type() === 'warning' && m.text().includes('GPU stall due to ReadPixels')) return;
      if (m.type() === 'error' || m.type() === 'warning') fail(`console.${m.type()}: ${m.text()}`);
    });
    page.on('pageerror', (e) => fail(`pageerror: ${e.message}`));
    await page.goto(`${BASE_URL}?engine=new&renderer=${renderer}&scene=tile&height=flat&view=above&terrainDebug=textured&textures=solid&paint=quadrants&liquid=classes&liquidLevel=10&time=${time}&timeSpeed=0&liquidTime=0`, { waitUntil: 'load' });
    await page.waitForSelector('#boot-status[data-state="ready"]', { state: 'attached', timeout: 30000 }).catch(() => fail('engine never became ready'));
    const probe = async () => {
      const r = await page.evaluate((pts) => window.__orvalisEngine.probe(pts), Object.values(POINTS));
      for (const e of r.errors) fail(`GPU error: ${e}`);
      return Object.fromEntries(Object.keys(POINTS).map((name, i) => [name, r.pixels[i].slice(0, 3)]));
    };
    const got = await probe();
    for (const [name, m] of Object.entries(MATERIAL)) {
      const want = expected(name, m, LIGHT[time]);
      if (!near(got[name], want, 2)) fail(`${time} ${name}: expected rgb(${want}), got rgb(${got[name]})`);
    }
    if (time === '12:00') {
      const lines = (await page.evaluate(() => document.getElementById('debug-overlay').textContent)).split('\n');
      const want = 'Liquid: on (O) · 256 chunks · 16384 cells · 256 drawn · river 4096 · ocean 4096 · magma 4096 · slime 4096 · frame 0/30';
      if (!lines.includes(want)) fail(`overlay line missing: "${want}" (got: ${lines.find((l) => l.startsWith('Liquid')) ?? 'none'})`);
    }
    out[time] = got;
    seen.push(`${time} → ${Object.entries(got).map(([n, p]) => `${n} rgb(${p})`).join(' · ')}`);
    await page.close();
  }
  // The behaviours, not just the colours: the night darkens the lit classes and leaves the magma as it is.
  if (!near(out['12:00'].magma, out['00:00'].magma, 1)) fail(`magma is full-bright: it should look the same at noon and at midnight (rgb(${out['12:00'].magma}) vs rgb(${out['00:00'].magma}))`);
  if (!near(out['12:00'].magma, [255, 97, 13], 1)) fail(`magma is opaque: nothing of the ground should show through, got rgb(${out['12:00'].magma})`);
  for (const name of ['river', 'ocean', 'slime']) if (out['00:00'][name][1] > out['12:00'][name][1] / 3) fail(`${name} should be much darker at night: rgb(${out['12:00'][name]}) → rgb(${out['00:00'][name]})`);
  // P3.3 animation: 30 frames in 1250 ms. With flat-colour frames, frame k is the class colour × (1 − 0.01 k),
  // so a pixel tells which frame is shown.
  {
    const open = async (q, level = 10) => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      page.on('console', (m) => {
        if (m.type() === 'warning' && m.text().includes('GPU stall due to ReadPixels')) return;
        if (m.type() === 'error' || m.type() === 'warning') fail(`console.${m.type()}: ${m.text()}`);
      });
      page.on('pageerror', (e) => fail(`pageerror: ${e.message}`));
      await page.goto(`${BASE_URL}?engine=new&renderer=${renderer}&scene=tile&height=flat&view=above&terrainDebug=textured&textures=solid&paint=quadrants&liquid=classes&liquidLevel=${level}&time=12:00&timeSpeed=0&${q}`, { waitUntil: 'load' });
      await page.waitForSelector('#boot-status[data-state="ready"]', { state: 'attached', timeout: 30000 }).catch(() => fail('engine never became ready'));
      return page;
    };
    const frameSeen = [];
    for (const [timeMs, frame] of [[625, 15], [1249, 29], [1250, 0], [3000, 12]]) {
      const page = await open(`liquidTime=${timeMs}`);
      const r = await page.evaluate((pts) => window.__orvalisEngine.probe(pts), Object.values(POINTS));
      const got = Object.fromEntries(Object.keys(POINTS).map((name, i) => [name, r.pixels[i].slice(0, 3)]));
      const factor = 1 - 0.01 * frame;
      for (const [name, m] of Object.entries(MATERIAL)) {
        const want = expected(name, { ...m, color: m.color.map((c) => Math.round(Math.min(1, c * factor) * 255) / 255) }, LIGHT['12:00']);
        if (!near(got[name], want, 2)) fail(`animation at ${timeMs} ms (frame ${frame}) ${name}: expected rgb(${want}), got rgb(${got[name]})`);
      }
      const line = (await page.evaluate(() => document.getElementById('debug-overlay').textContent)).split('\n').find((l) => l.startsWith('Liquid')) ?? '';
      if (!line.endsWith(`· frame ${frame}/30`)) fail(`animation at ${timeMs} ms: the overlay should say frame ${frame}/30, got "${line}"`);
      frameSeen.push(`${timeMs} ms → frame ${frame}, ocean rgb(${got.ocean})`);
      out[`frame${frame}`] = got;
      await page.close();
    }
    if (near(out.frame15.ocean, out.frame0.ocean, 3)) fail('frames 0 and 15 should give visibly different pixels');
    // Running in real time: the picture changes several times within one period, and the frame number advances.
    const page = await open('');
    const colours = new Set(), frames = new Set();
    const started = Date.now();
    // Bounded by SAMPLES, not by the clock: on a slow machine one readback can take over a second, and a fixed
    // 2.5 s window then held fewer samples than the check asks for (it failed with « saw 2 colours »).
    for (let sample = 0; sample < 6 && Date.now() - started < 30000; sample++) {
      // The animation time advances with the engine's own frames: leave it room between two readbacks.
      await page.waitForTimeout(100);
      const r = await page.evaluate((pts) => window.__orvalisEngine.probe(pts), [POINTS.magma]);
      colours.add(r.pixels[0].slice(0, 3).join(','));
      const f = await page.evaluate(() => /· frame (\d+)\/30$/m.exec(document.getElementById('debug-overlay').textContent)?.[1] ?? '');
      frames.add(f);
    }
    if (colours.size < 3) fail(`a running animation should show several different frames over 6 samples, saw ${colours.size} colour(s)`);
    if (frames.size < 2 || frames.has('')) fail(`the overlay frame number should advance, saw: ${[...frames].join(', ')}`);
    await page.close();
    // P3.4 depth response: alpha × clamp(1.6 · min(depth / scale, 1)⁸). Flat ground at 0, so the liquid level IS
    // the depth. Ocean (scale 8) appears gradually; river and slime (scale 8 × 42 / 255 ≈ 1.32) are already full;
    // magma has no depth response.
    const SCALE = { river: (8 * 42) / 255, ocean: 8, magma: 0, slime: (8 * 42) / 255 };
    const curve = (depth, scale) => (scale > 0 ? Math.min(1, 1.6 * Math.min(depth / scale, 1) ** 8) : 1);
    const depthSeen = [];
    for (const depth of [1, 4, 6, 7]) {
      const page = await open('liquidTime=0', depth);
      const r = await page.evaluate((pts) => window.__orvalisEngine.probe(pts), Object.values(POINTS));
      const got = Object.fromEntries(Object.keys(POINTS).map((name, i) => [name, r.pixels[i].slice(0, 3)]));
      for (const [name, m] of Object.entries(MATERIAL)) {
        const want = expected(name, { ...m, alpha: m.alpha * curve(depth, SCALE[name]) }, LIGHT['12:00']);
        if (!near(got[name], want, 2)) fail(`depth ${depth} ${name}: expected rgb(${want}), got rgb(${got[name]})`);
      }
      depthSeen.push(`depth ${depth}: ocean rgb(${got.ocean}) (alpha ${(0.75 * curve(depth, 8)).toFixed(3)}) river rgb(${got.river})`);
      out[`depth${depth}`] = got;
      await page.close();
    }
    if (!near(out.depth4.ocean, [163, 108, 53], 4)) fail(`at depth 4 the ocean should hardly show over its ground, got rgb(${out.depth4.ocean})`);
    if (near(out.depth7.ocean, out.depth4.ocean, 15)) fail('the ocean should be clearly more present at depth 7 than at depth 4');
    console.log(`smoke: [${label}] liquid depth response on ${NAMES[renderer]} → ${depthSeen.join(' · ')}`);
    console.log(`smoke: [${label}] liquid animation on ${NAMES[renderer]} → ${frameSeen.join(' · ')} · running: ${colours.size} different pictures in 2.5 s`);
  }
  console.log(`smoke: [${label}] liquid classes on ${NAMES[renderer]} → ${seen.join(' | ')}`);
  return out;
}

/**
 * P4.1 first model: an original tree built in code, drawn by the model pipeline. The camera is known, so
 * chosen points of the model are projected here and their pixels predicted — bone indices and weights
 * (the new byte vertex attributes), normals, and the terrain's per-vertex light.
 */
/**
 * The cottage (P6.1): a building made of three separate groups. Flat textures, so that lit colours can be
 * predicted: an interior surface shows texture × baked vertex colour.
 */
async function checkBuilding(browser, label, renderer) {
  const NAMES = { webgpu: 'WebGPU', webgl2: 'WebGL2' };
  const W = 1280, H = 720, CLEAR = [11, 14, 20];
  const fail = (msg) => problems.push(`[${label} building ${renderer}] ${msg}`);
  const open = async (q) => {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on('console', (m) => {
      if (m.type() === 'warning' && m.text().includes('GPU stall due to ReadPixels')) return;
      if (m.type() === 'error' || m.type() === 'warning') fail(`console.${m.type()}: ${m.text()}`);
    });
    page.on('pageerror', (e) => fail(`pageerror: ${e.message}`));
    await page.goto(`${BASE_URL}?engine=new&renderer=${renderer}&scene=building&interiorFog=off&visibility=all&textures=solid&doodads=off&${q}`, { waitUntil: 'load' });
    await page.waitForSelector('#boot-status[data-state="ready"]', { state: 'attached', timeout: 30000 }).catch(() => fail('engine never became ready'));
    return page;
  };
  const at = async (page, point) => {
    const r = await page.evaluate(async (p) => window.__orvalisEngine.probe([window.__orvalisEngine.projectWorldPoint(p)]), point);
    for (const e of r.errors) fail(`GPU error: ${e}`);
    return r.pixels[0].slice(0, 3);
  };
  const drawn = (page) => page.evaluate(() => window.__orvalisEngine.getBuilding());
  const times = (a, b) => a.map((v, k) => Math.round((v * b[k]) / 255));
  const out = {}, seen = [];
  // Colours of the flat textures and of the room's baked light (see cottage.ts).
  const PLASTER = [220, 210, 190], PLANKS = [130, 95, 60], GLASS = [90, 160, 200], GLASS_ALPHA = 128 / 255;
  const LIGHT = { backWall: [180, 160, 130], floor: [150, 130, 110], wallBottom: [120, 110, 100], wallTop: [200, 180, 150] };
  const backWall = times(PLASTER, LIGHT.backWall);

  // 1. Groups are separate: one flat colour each (shell red, room green, shed blue). 
  let page = await open('buildingDebug=groups&heading=30&pitch=20');
  const groups = { wall: await at(page, [-2.5, -3, 1.5]), door: await at(page, [0, -3, 1]) };
  if (!near(groups.wall, [255, 0, 0], 1)) fail(`groups view: the front wall should be group 0, red (got rgb(${groups.wall}))`);
  if (!near(groups.door, [0, 255, 0], 1)) fail(`groups view: through the door one should see the room, group 1, green (got rgb(${groups.door}))`);
  let stats = await drawn(page);
  if (stats?.groupsDrawn !== 3 || stats?.batchesDrawn !== 9) fail(`expected 3 groups and 9 batches drawn (got ${JSON.stringify(stats)})`);
  // Key 1 hides the shell: the room alone remains behind where the wall was; the shed is untouched.
  await page.keyboard.press('Digit1');
  await page.waitForFunction(() => window.__orvalisEngine.getBuilding()?.groupsDrawn === 2, null, { timeout: 5000 }).catch(() => fail('key 1 should hide group 0'));
  const hiddenWall = await at(page, [-2.5, -3, 1.5]);
  if (!near(hiddenWall, [0, 255, 0], 1)) fail(`shell hidden: the room should show where the wall was (got rgb(${hiddenWall}))`);
  stats = await drawn(page);
  if (stats?.batchesDrawn !== 5) fail(`shell hidden: 5 batches expected (room 3 + shed 2), got ${stats?.batchesDrawn}`);
  await page.close();
  // The shed is behind the house from there: look at it from the east.
  page = await open('buildingDebug=groups&heading=270&pitch=10');
  groups.shed = await at(page, [6.5, 0, 1]);
  if (!near(groups.shed, [0, 0, 255], 1)) fail(`groups view: the shed should be group 2, blue (got rgb(${groups.shed}))`);
  // Its group alone can be hidden too (key 3): the house wall behind it then shows. Probed on the wall itself: the ray through the shed point passes under the base of the wall.
  await page.keyboard.press('Digit3');
  await page.waitForFunction(() => window.__orvalisEngine.getBuilding()?.groupsDrawn === 2, null, { timeout: 5000 }).catch(() => fail('key 3 should hide group 2'));
  const hiddenShed = await at(page, [4, 0, 1.5]);
  if (!near(hiddenShed, [255, 0, 0], 1)) fail(`shed hidden: the east wall of the house should show (got rgb(${hiddenShed}))`);
  out['building-groups'] = { ...groups, hiddenWall, hiddenShed };
  await page.close();
  seen.push(`groups: wall rgb(${groups.wall}) shed rgb(${groups.shed}) door rgb(${groups.door}), shell hidden → rgb(${hiddenWall})`);

  // 2. Inside, looking north: an interior surface = texture × baked vertex colour, exactly.
  page = await open('view=inside&heading=0');
  const inside = { backWall: await at(page, [-1.5, 2.7, 1.6]) };
  if (!near(inside.backWall, backWall, 2)) fail(`inside: the back wall should be plaster × its baked colour = rgb(${backWall}) (got rgb(${inside.backWall}))`);
  await page.close();
  // Looking down at the floor.
  page = await open('view=inside&heading=0&pitch=40');
  inside.floor = await at(page, [-0.5, 1.6, 0.02]);
  if (!near(inside.floor, times(PLANKS, LIGHT.floor), 2)) fail(`inside: the floor should be planks × its baked colour = rgb(${times(PLANKS, LIGHT.floor)}) (got rgb(${inside.floor}))`);
  out['building-inside'] = inside;
  await page.close();
  // Looking east through the translucent glass screen at the wall behind it (its baked colour at eye height).
  page = await open('view=inside&heading=90');
  const wallLight = LIGHT.wallBottom.map((c, k) => c + ((LIGHT.wallTop[k] - c) * 1.6) / 3);
  const wall = PLASTER.map((c, k) => (c * wallLight[k]) / 255);
  const wantGlass = GLASS.map((c, k) => Math.round(c * GLASS_ALPHA + wall[k] * (1 - GLASS_ALPHA)));
  // (Seen from the middle of the room, the whole east wall is behind the screen.)
  const glass = await at(page, [1, 0, 1.6]);
  if (!near(glass, wantGlass, 3)) fail(`glass screen: expected glass over the wall = rgb(${wantGlass}) (got rgb(${glass}))`);
  out['building-glass'] = { glass };
  await page.close();
  seen.push(`inside: back wall rgb(${inside.backWall}) (expected ${backWall}) floor rgb(${inside.floor}), glass rgb(${glass}) (expected ${wantGlass})`);

  // 3. Alpha test: through an opening of the window lattice one sees the room's back wall; a bar hides it.
  page = await open('heading=0&pitch=0&zoom=2');
  const hole = await at(page, [1.9875, -2.85, 1.7125]), bar = await at(page, [1.8375, -2.85, 1.7125]);
  if (!near(hole, backWall, 2)) fail(`lattice: through an opening the back wall of the room should show, rgb(${backWall}) (got rgb(${hole}))`);
  if (near(bar, backWall, 12) || near(bar, CLEAR, 4)) fail(`lattice: a bar should hide the room (got rgb(${bar}))`);
  out['building-lattice'] = { hole, bar };
  await page.close();
  // 4. Two-sided material: from below, the underside of the roof's overhang is drawn.
  page = await open('heading=0&pitch=-30');
  const eave = await at(page, [0, -3.3, 2.86]);
  if (near(eave, CLEAR, 6)) fail('roof: its underside should be visible from below (two-sided material)');
  out['building-roof'] = { eave };
  await page.close();
  seen.push(`lattice: opening rgb(${hole}) bar rgb(${bar}); roof underside rgb(${eave})`);
  console.log(`smoke: [${label}] building on ${NAMES[renderer]} → ${seen.join(' · ')}`);
  return out;
}

/** P6.2: props placed in the building — sets, group ownership, one upload per model, drawn before the blended batches. */
async function checkBuildingDoodads(browser, label, renderer) {
  const NAMES = { webgpu: 'WebGPU', webgl2: 'WebGL2' };
  const W = 1280, H = 720, CLEAR = [11, 14, 20];
  const fail = (msg) => problems.push(`[${label} building-doodads ${renderer}] ${msg}`);
  const open = async (q) => {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on('console', (m) => {
      if (m.type() === 'warning' && m.text().includes('GPU stall due to ReadPixels')) return;
      if (m.type() === 'error' || m.type() === 'warning') fail(`console.${m.type()}: ${m.text()}`);
    });
    page.on('pageerror', (e) => fail(`pageerror: ${e.message}`));
    await page.goto(`${BASE_URL}?engine=new&renderer=${renderer}&scene=building&interiorFog=off&visibility=all&textures=solid&doodadDebug=normals&${q}`, { waitUntil: 'load' });
    await page.waitForSelector('#boot-status[data-state="ready"]', { state: 'attached', timeout: 30000 }).catch(() => fail('engine never became ready'));
    return page;
  };
  const at = async (page, point) => {
    const r = await page.evaluate(async (p) => window.__orvalisEngine.probe([window.__orvalisEngine.projectWorldPoint(p)]), point);
    for (const e of r.errors) fail(`GPU error: ${e}`);
    return r.pixels[0].slice(0, 3);
  };
  const drawn = (page) => page.evaluate(() => window.__orvalisEngine.getBuilding());
  const until = (page, want, what) => page.waitForFunction((w) => { const b = window.__orvalisEngine.getBuilding(); return b && Object.entries(w).every(([k, v]) => b[k] === v); }, want, { timeout: 5000 }).catch(async () => fail(`${what}: expected ${JSON.stringify(want)}, got ${JSON.stringify(await drawn(page))}`));
  const out = {}, seen = [];
  // With doodadDebug=normals a prop shows its normal as a colour: a face looking up is (128,128,255), one looking south (128,0,128).
  const UP = [128, 128, 255], SOUTH = [128, 0, 128], BACK_WALL = [155, 132, 97];
  const TABLE_TOP = [0, 1.8, 0.77], STOOL_TOP = [2.2, 0, 0.47], SHED_CRATE_TOP = [5.2, -2.1, 0.6], PLANTER_FRONT = [2.4, -2.985, 1.135];

  // 1. The always-present set: the table stands in the room; without props the back wall shows there.
  let page = await open('view=inside&heading=0&pitch=20');
  await until(page, { doodads: 8, doodadsDrawn: 3, doodadModels: 3, doodadSet: 0, doodadSetName: 'always', batchesDrawn: 9 }, 'set 0');
  const table = await at(page, TABLE_TOP);
  if (!near(table, UP, 2)) fail(`the table top should show its normal, rgb(${UP}) (got rgb(${table}))`);
  await page.keyboard.press('KeyV');
  await until(page, { doodadsShown: false, doodadsDrawn: 0 }, 'key V');
  const noTable = await at(page, TABLE_TOP);
  if (!near(noTable, BACK_WALL, 2)) fail(`props off: the back wall should show where the table was, rgb(${BACK_WALL}) (got rgb(${noTable}))`);
  await page.keyboard.press('KeyV');
  // The room's props leave with the room (key 2 hides it); the planter stays: the shell lists it too.
  await page.keyboard.press('Digit2');
  await until(page, { groupsDrawn: 2, doodadsDrawn: 1 }, 'room hidden');
  const roomHidden = await at(page, TABLE_TOP);
  if (near(roomHidden, UP, 30)) fail(`room hidden: its table should not be drawn (got rgb(${roomHidden}))`);
  await page.keyboard.press('Digit1');
  await until(page, { groupsDrawn: 1, doodadsDrawn: 0 }, 'room and shell hidden');
  out['doodads-table'] = { table, noTable, roomHidden };
  await page.close();
  seen.push(`table rgb(${table}), props off → rgb(${noTable}), room hidden → rgb(${roomHidden})`);

  // 2. Sets: key N adds set 1 to set 0 (5 props), then set 2 instead (6). The crate by the shed belongs to set 1.
  page = await open('heading=0&pitch=30');
  const set0 = await at(page, SHED_CRATE_TOP);
  // (Behind that point the shed's south wall shows.)
  if (near(set0, UP, 30)) fail(`set 0: nothing should stand by the shed (got rgb(${set0}))`);
  await page.keyboard.press('KeyN');
  await until(page, { doodadSet: 1, doodadSetName: 'lived-in', doodadsDrawn: 5 }, 'key N, set 1');
  const set1 = await at(page, SHED_CRATE_TOP);
  if (!near(set1, UP, 2)) fail(`set 1: the crate by the shed should show its top, rgb(${UP}) (got rgb(${set1}))`);
  await page.keyboard.press('KeyN');
  await until(page, { doodadSet: 2, doodadSetName: 'storage', doodadsDrawn: 6, doodadModels: 3 }, 'key N, set 2');
  const set2 = await at(page, SHED_CRATE_TOP);
  if (!near(set2, set0, 1)) fail(`set 2: the crate of set 1 should be gone, as in set 0 rgb(${set0}) (got rgb(${set2}))`);
  out['doodads-sets'] = { set0, set1, set2 };
  await page.close();
  seen.push(`shed crate: set 0 rgb(${set0}) set 1 rgb(${set1}) set 2 rgb(${set2})`);

  // 3. A prop listed by two groups (the planter in the window) is drawn while ANY of them is visible.
  page = await open('heading=0&pitch=0&zoom=2');
  const planter = { both: await at(page, PLANTER_FRONT) };
  if (!near(planter.both, SOUTH, 2)) fail(`the planter's front should show its normal, rgb(${SOUTH}) (got rgb(${planter.both}))`);
  await page.keyboard.press('Digit2');
  await until(page, { groupsDrawn: 2, doodadsDrawn: 1 }, 'planter, room hidden');
  planter.shellOnly = await at(page, PLANTER_FRONT);
  if (!near(planter.shellOnly, SOUTH, 2)) fail(`room hidden: the shell still lists the planter (got rgb(${planter.shellOnly}))`);
  await page.keyboard.press('Digit2');
  await page.keyboard.press('Digit1');
  await until(page, { groupsDrawn: 2, doodadsDrawn: 3 }, 'planter, shell hidden');
  planter.roomOnly = await at(page, PLANTER_FRONT);
  if (!near(planter.roomOnly, SOUTH, 2)) fail(`shell hidden: the room still lists the planter (got rgb(${planter.roomOnly}))`);
  await page.keyboard.press('Digit2');
  await until(page, { groupsDrawn: 1, doodadsDrawn: 0 }, 'planter, both hidden');
  planter.neither = await at(page, PLANTER_FRONT);
  if (!near(planter.neither, CLEAR, 2)) fail(`shell and room hidden: the planter should be gone (got rgb(${planter.neither}))`);
  out['doodads-planter'] = planter;
  await page.close();
  seen.push(`planter: both rgb(${planter.both}) shell only rgb(${planter.shellOnly}) room only rgb(${planter.roomOnly}) neither rgb(${planter.neither})`);

  // 4. Order: a stool behind the translucent glass screen is seen THROUGH the glass (props before blended batches).
  page = await open('view=inside&heading=90&pitch=27&doodadSet=1');
  const GLASS = [90, 160, 200], A = 128 / 255;
  const wantStool = GLASS.map((c, k) => Math.round(c * A + UP[k] * (1 - A)));
  const stool = await at(page, STOOL_TOP);
  if (!near(stool, wantStool, 3)) fail(`the stool behind the glass should be glass over its colour = rgb(${wantStool}) (got rgb(${stool}))`);
  out['doodads-glass'] = { stool };
  await page.close();
  seen.push(`stool through glass rgb(${stool}) (expected ${wantStool})`);
  console.log(`smoke: [${label}] building props on ${NAMES[renderer]} → ${seen.join(' · ')}`);
  return out;
}

/** P6.3: collision sets of a building — player and camera index sets over the same vertices, rays through the grid. */
async function checkBuildingCollision(browser, label, renderer) {
  const NAMES = { webgpu: 'WebGPU', webgl2: 'WebGL2' };
  const W = 1280, H = 720;
  const fail = (msg) => problems.push(`[${label} building-collision ${renderer}] ${msg}`);
  const open = async (q) => {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on('console', (m) => {
      if (m.type() === 'warning' && m.text().includes('GPU stall due to ReadPixels')) return;
      if (m.type() === 'error' || m.type() === 'warning') fail(`console.${m.type()}: ${m.text()}`);
    });
    page.on('pageerror', (e) => fail(`pageerror: ${e.message}`));
    await page.goto(`${BASE_URL}?engine=new&renderer=${renderer}&scene=building&interiorFog=off&textures=solid&${q}`, { waitUntil: 'load' });
    await page.waitForSelector('#boot-status[data-state="ready"]', { state: 'attached', timeout: 30000 }).catch(() => fail('engine never became ready'));
    return page;
  };
  const at = async (page, point) => {
    const r = await page.evaluate(async (p) => window.__orvalisEngine.probe([window.__orvalisEngine.projectWorldPoint(p)]), point);
    for (const e of r.errors) fail(`GPU error: ${e}`);
    return r.pixels[0].slice(0, 3);
  };
  const drawn = (page) => page.evaluate(() => window.__orvalisEngine.getBuilding());
  const until = (page, want, what) => page.waitForFunction((w) => { const b = window.__orvalisEngine.getBuilding(); return b && Object.entries(w).every(([k, v]) => b[k] === v); }, want, { timeout: 5000 }).catch(async () => fail(`${what}: expected ${JSON.stringify(want)}, got ${JSON.stringify(await drawn(page))}`));
  const ray = (page, origin, direction, kind) => page.evaluate(([o, d, k]) => window.__orvalisEngine.buildingRaycast(o, d, 100, k), [origin, direction, kind]);
  const close = (a, b) => Math.abs(a - b) < 1e-4;
  const out = {}, seen = [];
  const RED = [255, 0, 0], GREEN = [0, 255, 0];
  // A point in an OPENING of the window lattice (see the building suite), seen from the south.
  const LATTICE_OPENING = [1.9875, -2.85, 1.7125];

  // 1. The two sets are different index arrays: the lattice (DETAIL) is in the camera set only.
  let page = await open('heading=0&pitch=0&zoom=2&collision=player');
  await until(page, { collisionView: 'player', groupsDrawn: 3, batchesDrawn: 3, doodadsDrawn: 0 }, 'player set');
  let stats = await drawn(page);
  const total = stats.collisionTriangles.player;
  if (stats.triangles !== total || stats.collisionTriangles.camera !== total || !(total > 20)) fail(`player set: expected its ${total} triangles drawn and as many in the camera set (got ${JSON.stringify(stats)})`);
  const player = await at(page, LATTICE_OPENING);
  if (!near(player, GREEN, 1)) fail(`player set: no lattice — the room (group 1, green) should show through the window (got rgb(${player}))`);
  await page.keyboard.press('KeyC');
  await until(page, { collisionView: 'camera', batchesDrawn: 3 }, 'key C, camera set');
  const camera = await at(page, LATTICE_OPENING);
  if (!near(camera, RED, 1)) fail(`camera set: the lattice (shell, group 0, red) should fill the window (got rgb(${camera}))`);
  await page.keyboard.press('KeyC');
  await until(page, { collisionView: 'off', batchesDrawn: 9, doodadsDrawn: 3 }, 'key C, view off');
  out['collision-sets'] = { player, camera };
  seen.push(`window: player set rgb(${player}), camera set rgb(${camera}) · ${total} triangles per set`);

  // 2. Rays, from outside through that window: the lattice stops the camera; the player ray goes on to the room's back wall.
  const from = [2.4, -6, 1.5];
  const camHit = await ray(page, from, [0, 1, 0], 'camera'), playerHit = await ray(page, from, [0, 1, 0], 'player');
  if (!camHit || camHit.group !== 0 || camHit.flags !== 4 || !close(camHit.point[1], -2.85)) fail(`camera ray through the window: expected the lattice (group 0, DETAIL, y = −2.85), got ${JSON.stringify(camHit)}`);
  if (!playerHit || playerHit.group !== 1 || !close(playerHit.point[1], 2.7)) fail(`player ray through the window: expected the room's back wall (group 1, y = 2.7), got ${JSON.stringify(playerHit)}`);
  const miss = await ray(page, [0, 0, 20], [0, 0, 1], 'camera');
  if (miss !== null) fail(`a ray going up from above the roof should hit nothing (got ${JSON.stringify(miss)})`);
  await page.close();

  // 3. Inside, looking east: straight ahead the player meets the glass screen (x = 1), the camera the wall behind it (x = 3.7).
  page = await open('view=inside&heading=90');
  stats = await drawn(page);
  if (!stats.aim.player || stats.aim.player.group !== 1 || stats.aim.player.flags !== 2 || !close(stats.aim.player.distance, 1)) fail(`ahead, player: expected the glass (group 1, NOCAMCOLLIDE) at 1, got ${JSON.stringify(stats.aim.player)}`);
  if (!stats.aim.camera || stats.aim.camera.flags !== 0 || !close(stats.aim.camera.distance, 3.7)) fail(`ahead, camera: expected the east wall at 3.7, got ${JSON.stringify(stats.aim.camera)}`);
  const floor = await ray(page, [0, 0, 1.6], [0, 0, -1], 'player');
  if (!floor || floor.group !== 1 || !close(floor.distance, 1.58) || !close(floor.normal[2], 1)) fail(`down from the eye: expected the floor 1.58 below, normal up, got ${JSON.stringify(floor)}`);
  await page.close();
  seen.push(`through the window: camera stops at y ${camHit?.point[1].toFixed(2)}, player at y ${playerHit?.point[1].toFixed(2)} · ahead inside: player ${stats.aim.player?.distance.toFixed(2)}, camera ${stats.aim.camera?.distance.toFixed(2)} · floor ${floor?.distance.toFixed(2)} below`);
  console.log(`smoke: [${label}] building collision on ${NAMES[renderer]} → ${seen.join(' · ')}`);
  return out;
}

/**
 * Regression (found during P6.3): « ready » used to be announced when the loop was started, BEFORE the first frame —
 * a check reading the overlay right after it could find it empty on a slow start. With every animation frame held
 * back 400 ms, the overlay and the frame counter must already be there when « ready » appears.
 */
async function checkBootReady(browser, label, renderer) {
  const fail = (msg) => problems.push(`[${label} boot-ready ${renderer}] ${msg}`);
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.on('pageerror', (e) => fail(`pageerror: ${e.message}`));
  await page.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => setTimeout(() => raf(callback), 400);
  });
  await page.goto(`${BASE_URL}?engine=new&renderer=${renderer}&scene=model&pose=sway&animTime=1000`, { waitUntil: 'load' });
  await page.waitForSelector('#boot-status[data-state="ready"]', { state: 'attached', timeout: 30000 }).catch(() => fail('engine never became ready'));
  const now = await page.evaluate(() => ({ overlay: document.getElementById('debug-overlay').textContent, frames: Number(document.getElementById('boot-status').dataset.frames ?? 0) }));
  if (!now.overlay.split('\n').includes('Animation: sway 1000 ms · frozen')) fail(`right after « ready » the overlay should already be filled (got ${JSON.stringify(now.overlay.slice(0, 80))})`);
  if (!(now.frames >= 1)) fail(`right after « ready » at least one frame should have been drawn (got ${now.frames})`);
  await page.close();
  console.log(`smoke: [${label}] boot on ${renderer} → « ready » after frame ${now.frames}, overlay filled (${now.overlay.split('\n').length} lines)`);
  return {};
}

/** P6.4: liquid surfaces carried by building groups — grid with a hole, kind from the group value, group visibility, animation. */
async function checkBuildingLiquid(browser, label, renderer) {
  const NAMES = { webgpu: 'WebGPU', webgl2: 'WebGL2' };
  const W = 1280, H = 720, CLEAR = [11, 14, 20];
  const fail = (msg) => problems.push(`[${label} building-liquid ${renderer}] ${msg}`);
  const open = async (q) => {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on('console', (m) => {
      if (m.type() === 'warning' && m.text().includes('GPU stall due to ReadPixels')) return;
      if (m.type() === 'error' || m.type() === 'warning') fail(`console.${m.type()}: ${m.text()}`);
    });
    page.on('pageerror', (e) => fail(`pageerror: ${e.message}`));
    await page.goto(`${BASE_URL}?engine=new&renderer=${renderer}&scene=building&building=basin&textures=solid&heading=0&pitch=60&${q}`, { waitUntil: 'load' });
    await page.waitForSelector('#boot-status[data-state="ready"]', { state: 'attached', timeout: 30000 }).catch(() => fail('engine never became ready'));
    return page;
  };
  const at = async (page, point) => {
    const r = await page.evaluate(async (p) => window.__orvalisEngine.probe([window.__orvalisEngine.projectWorldPoint(p)]), point);
    for (const e of r.errors) fail(`GPU error: ${e}`);
    return r.pixels[0].slice(0, 3);
  };
  const drawn = (page) => page.evaluate(() => window.__orvalisEngine.getBuilding());
  const until = (page, want, what) => page.waitForFunction((w) => { const b = window.__orvalisEngine.getBuilding(); return b && Object.entries(w).every(([k, v]) => b[k] === v); }, want, { timeout: 5000 }).catch(async () => fail(`${what}: expected ${JSON.stringify(want)}, got ${JSON.stringify(await drawn(page))}`));
  const out = {}, seen = [];
  const S = 4.166666507720947;
  // Points ON the liquid surfaces (see basin.ts): the pool's south-west tile, the vat; and on the platform's top.
  const WATER = [-S / 2, -S / 2, -0.2], MAGMA = [1.5 * S + 1.5, 0, 0.8], PLATFORM = [S / 2, S / 2, 0.3];
  const STONE = [150, 150, 145], RIVER = [0.2, 0.46, 0.56], RIVER_ALPHA = 0.6, MAGMA_COLOUR = [1, 0.38, 0.05];
  const magmaAt = (frame) => MAGMA_COLOUR.map((c) => Math.round(Math.min(1, c * (1 - 0.01 * frame)) * 255));

  // 1. Frozen at frame 0. The vat's tile says river, its GROUP says magma: it must be magma — opaque and full-bright.
  let page = await open('liquidTime=0');
  await until(page, { liquidSurfaces: 2, liquidsDrawn: 2, liquidTriangles: 8, liquidFrame: 0, batchesDrawn: 2 }, 'both surfaces');
  const magma = await at(page, MAGMA);
  if (!near(magma, magmaAt(0), 2)) fail(`the vat should hold magma, rgb(${magmaAt(0)}) (got rgb(${magma}))`);
  // The pool: river water blended over what is behind it, lit like flat ground. The light is read off the platform.
  const platform = await at(page, PLATFORM), water = await at(page, WATER);
  await page.keyboard.press('KeyL');
  await until(page, { liquidsShown: false, liquidsDrawn: 0 }, 'key L');
  const behind = await at(page, WATER), vatFloor = await at(page, MAGMA);
  const light = platform.map((c, k) => c / STONE[k]);
  const wantWater = behind.map((b, k) => Math.round(b * (1 - RIVER_ALPHA) + Math.min(255, 255 * RIVER[k] * light[k]) * RIVER_ALPHA));
  if (!near(water, wantWater, 3)) fail(`the pool should be river water over its floor = rgb(${wantWater}) (got rgb(${water}); behind rgb(${behind}), platform rgb(${platform}))`);
  if (near(behind, water, 6)) fail(`key L should remove the water (still rgb(${behind}))`);
  if (near(vatFloor, magmaAt(0), 20)) fail(`key L should remove the magma (still rgb(${vatFloor}))`);
  await page.keyboard.press('KeyL');
  // A liquid follows its GROUP's visibility: key 1 hides the pool and its water; the vat's magma stays.
  await page.keyboard.press('Digit1');
  await until(page, { groupsDrawn: 1, liquidsDrawn: 1, liquidTriangles: 2 }, 'pool hidden');
  const hidden = await at(page, WATER), still = await at(page, MAGMA);
  if (!near(hidden, CLEAR, 1)) fail(`pool hidden: neither the pool nor its water should be drawn (got rgb(${hidden}))`);
  if (!near(still, magmaAt(0), 2)) fail(`pool hidden: the vat's magma should still be there (got rgb(${still}))`);
  out['liquid-frame0'] = { magma, water, behind, hidden };
  await page.close();
  seen.push(`magma rgb(${magma}) · water rgb(${water}) (expected ${wantWater}) over rgb(${behind}) · pool hidden → rgb(${hidden})`);

  // 2. Another time, another frame of the animation: frame 15 at 625 ms.
  page = await open('liquidTime=625');
  await until(page, { liquidFrame: 15 }, 'frame at 625 ms');
  const later = await at(page, MAGMA);
  if (!near(later, magmaAt(15), 2)) fail(`at 625 ms the magma should show frame 15, rgb(${magmaAt(15)}) (got rgb(${later}))`);
  out['liquid-frame15'] = { magma: later };
  await page.close();
  // Running in real time, the frame number moves (bounded by samples, not by the clock).
  page = await open('');
  const frames = new Set();
  for (let sample = 0; sample < 6; sample++) {
    await page.waitForTimeout(120);
    frames.add((await drawn(page)).liquidFrame);
  }
  if (frames.size < 2) fail(`a running animation should change frame over 6 samples (saw only ${[...frames].join(', ')})`);
  await page.close();
  seen.push(`frame 15 magma rgb(${later}) · running: ${frames.size} different frames in 6 samples`);
  console.log(`smoke: [${label}] building liquid on ${NAMES[renderer]} → ${seen.join(' · ')}`);
  return out;
}

/** P6.5: portal graph and the room the camera is in (0, 1 or 2 groups), plus the portal debug view. */
async function checkBuildingPortal(browser, label, renderer) {
  const NAMES = { webgpu: 'WebGPU', webgl2: 'WebGL2' };
  const fail = (msg) => problems.push(`[${label} building-portal ${renderer}] ${msg}`);
  const open = async (q) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('console', (m) => {
      if (m.type() === 'warning' && m.text().includes('GPU stall due to ReadPixels')) return;
      if (m.type() === 'error' || m.type() === 'warning') fail(`console.${m.type()}: ${m.text()}`);
    });
    page.on('pageerror', (e) => fail(`pageerror: ${e.message}`));
    await page.goto(`${BASE_URL}?engine=new&renderer=${renderer}&scene=building&interiorFog=off&textures=solid&doodads=off&${q}`, { waitUntil: 'load' });
    await page.waitForSelector('#boot-status[data-state="ready"]', { state: 'attached', timeout: 30000 }).catch(() => fail('engine never became ready'));
    return page;
  };
  const at = async (page, point) => {
    const r = await page.evaluate(async (p) => window.__orvalisEngine.probe([window.__orvalisEngine.projectWorldPoint(p)]), point);
    for (const e of r.errors) fail(`GPU error: ${e}`);
    return r.pixels[0].slice(0, 3);
  };
  const drawn = (page) => page.evaluate(() => window.__orvalisEngine.getBuilding());
  const roomAt = (page, point, terrain) => page.evaluate(([p, t]) => window.__orvalisEngine.buildingRoomAt(p, t), [point, terrain ?? null]);
  const overlayLine = (page, line) => page.waitForFunction((l) => document.getElementById('debug-overlay').textContent.split('\n').includes(l), line, { timeout: 5000 }).catch(() => fail(`overlay line missing: "${line}"`));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const out = {}, seen = [];

  // 1. Standing in the room: one group, decided by the floor under the eye.
  let page = await open('view=inside');
  let stats = await drawn(page);
  if (!same(stats.room.groups, [1]) || stats.room.cause !== 'collision' || Math.abs(stats.room.distance - 1.58) > 1e-4) fail(`in the room: expected group 1 by its floor 1.58 below, got ${JSON.stringify(stats.room)}`);
  await overlayLine(page, 'Room: group 1 "room" (collision 1.58 below) · 2 portals, shown off (O)');
  await page.close();
  // 2. Standing in the doorway (within 0.1 of its plane, on the room's side): two groups.
  page = await open('view=inside&eye=0,-2.8,1.6&heading=180');
  stats = await drawn(page);
  if (!same(stats.room.groups, [1, 0]) || stats.room.cause !== 'portal' || stats.room.portal !== 0) fail(`in the doorway: expected groups 1 + 0 through portal 0, got ${JSON.stringify(stats.room)}`);
  await overlayLine(page, 'Room: groups 1 "room" + 0 "shell" (portal 0) · 2 portals, shown off (O)');
  const doorway = stats.room;
  await page.close();

  // 3. From outside: the camera is in no room. Points asked one by one (the building's space).
  page = await open('heading=0&pitch=0&zoom=2');
  stats = await drawn(page);
  if (stats.room.groups.length !== 0) fail(`outside: the camera should be in no room, got ${JSON.stringify(stats.room)}`);
  const cases = [
    ['middle of the room', [0, 0, 1.6], null, { groups: [1], cause: 'collision' }],
    ['terrain 0.6 under the eye, above the floor', [0, 0, 1.6], 1, { groups: [], cause: 'terrain' }],
    ['above the roof (exterior shell below)', [0, 1, 8], null, { groups: [], cause: 'exterior', hitGroup: 0 }],
    ['in front of the door, under the eaves', [0, -3.2, 1.6], null, { groups: [], cause: 'nothing' }],
    ['doorway, shell side', [0, -2.9, 1.6], null, { groups: [], cause: 'exterior', hitGroup: 0, portal: 0 }],
    ['in the window', [2.4, -2.81, 1.5], null, { groups: [1, 0], cause: 'portal', portal: 1 }],
  ];
  for (const [what, point, terrain, want] of cases) {
    const got = await roomAt(page, point, terrain);
    if (!got || !Object.entries(want).every(([k, v]) => same(got[k], v))) fail(`${what}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
  }
  // 4. Key O shows the portal polygons: the door opening turns magenta (before: the room's floor through it).
  const DOOR = [0, -2.85, 1];
  const before = await at(page, DOOR);
  await page.keyboard.press('KeyO');
  await page.waitForFunction(() => window.__orvalisEngine.getBuilding()?.portalsShown === true, null, { timeout: 5000 }).catch(() => fail('key O should show the portals'));
  const after = await at(page, DOOR);
  // (The camera is higher than that point: through the door it sees the room's floor, planks × baked light.)
  if (!near(before, [76, 48, 26], 2)) fail(`through the door the room's floor should show, rgb(76,48,26) (got rgb(${before}))`);
  if (!near(after, [255, 0, 255], 1)) fail(`portals shown: the door opening should be magenta (got rgb(${after}))`);
  out['portal-view'] = { before, after };
  await page.close();
  seen.push(`room: inside → [1], doorway → [${doorway.groups}] via portal ${doorway.portal}, outside → [] · ${cases.length} point cases · door rgb(${before}) → portals shown rgb(${after})`);
  console.log(`smoke: [${label}] building portals on ${NAMES[renderer]} → ${seen.join(' · ')}`);
  return out;
}

/** P6.6: the groups drawn are those the portal flood finds from the camera's room. */
async function checkBuildingVisibility(browser, label, renderer) {
  const NAMES = { webgpu: 'WebGPU', webgl2: 'WebGL2' };
  const CLEAR = [11, 14, 20];
  const fail = (msg) => problems.push(`[${label} building-visibility ${renderer}] ${msg}`);
  const open = async (q) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('console', (m) => {
      if (m.type() === 'warning' && m.text().includes('GPU stall due to ReadPixels')) return;
      if (m.type() === 'error' || m.type() === 'warning') fail(`console.${m.type()}: ${m.text()}`);
    });
    page.on('pageerror', (e) => fail(`pageerror: ${e.message}`));
    await page.goto(`${BASE_URL}?engine=new&renderer=${renderer}&scene=building&interiorFog=off&textures=solid&doodads=off&${q}`, { waitUntil: 'load' });
    await page.waitForSelector('#boot-status[data-state="ready"]', { state: 'attached', timeout: 30000 }).catch(() => fail('engine never became ready'));
    return page;
  };
  const at = async (page, point) => {
    const r = await page.evaluate(async (p) => window.__orvalisEngine.probe([window.__orvalisEngine.projectWorldPoint(p)]), point);
    for (const e of r.errors) fail(`GPU error: ${e}`);
    return r.pixels[0].slice(0, 3);
  };
  const grid = async (page) => {
    const points = [];
    for (let y = 1; y <= 7; y++) for (let x = 1; x <= 11; x++) points.push([x / 12, y / 8]);
    const r = await page.evaluate((pts) => window.__orvalisEngine.probe(pts), points);
    for (const e of r.errors) fail(`GPU error: ${e}`);
    return r.pixels.map((p) => p.slice(0, 3));
  };
  const drawn = (page) => page.evaluate(() => window.__orvalisEngine.getBuilding());
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const expectStats = (stats, want, what) => {
    for (const [k, v] of Object.entries(want)) if (!same(stats[k], v)) fail(`${what}: expected ${k} = ${JSON.stringify(v)}, got ${JSON.stringify(stats[k])}`);
  };
  const out = {}, seen = [];

  // 1. In the room, back to the door: the room alone is drawn, the outside is not visible. The picture is right.
  let page = await open('view=inside&heading=0');
  let stats = await drawn(page);
  expectStats(stats, { visibility: 'portals', visibleGroups: [1], groupsDrawn: 1, batchesDrawn: 3, outsideVisible: false, portalsFollowed: 0 }, 'room, back to the door');
  const backWall = await at(page, [-1.5, 2.7, 1.6]);
  if (!near(backWall, [155, 132, 97], 2)) fail(`room, back to the door: the back wall should still be rgb(155,132,97) (got rgb(${backWall}))`);
  await page.close();
  // 2. Facing the door: the flood goes out through door and window; every exterior group may draw.
  page = await open('view=inside&heading=180');
  stats = await drawn(page);
  expectStats(stats, { visibleGroups: [0, 1, 2], groupsDrawn: 3, outsideVisible: true, exteriorWindows: 2, portalsFollowed: 2 }, 'room, facing the door');
  await page.close();

  // 3. Outside, BEHIND the house: the portals face away, the room is not drawn — and the picture is the same as
  //    with every group drawn (77 pixels compared), for fewer draws.
  page = await open('heading=180&pitch=15&zoom=2');
  stats = await drawn(page);
  expectStats(stats, { visibleGroups: [0, 2], groupsDrawn: 2, batchesDrawn: 6, portalsFollowed: 0 }, 'behind the house');
  const culled = await grid(page);
  await page.keyboard.press('KeyI');
  await page.waitForFunction(() => window.__orvalisEngine.getBuilding()?.visibility === 'all' && window.__orvalisEngine.getBuilding()?.groupsDrawn === 3, null, { timeout: 5000 }).catch(() => fail('key I should draw every group'));
  stats = await drawn(page);
  expectStats(stats, { visibleGroups: [0, 1, 2], batchesDrawn: 9 }, 'behind the house, all groups');
  const all = await grid(page);
  const different = culled.filter((p, k) => !near(p, all[k], 0)).length, drawnPixels = all.filter((p) => !near(p, CLEAR, 2)).length;
  if (different !== 0) fail(`behind the house: ${different} of ${all.length} pixels differ between « portals » and « all groups »`);
  if (drawnPixels < 10) fail(`behind the house: only ${drawnPixels} of ${all.length} probed pixels are on the building — the comparison proves little`);
  out['visibility-behind'] = { culled: culled[38], all: all[38] };
  await page.close();
  // 4. Outside, in FRONT: the room is reached through the door — its floor shows in the opening.
  page = await open('heading=0&pitch=0&zoom=2');
  stats = await drawn(page);
  expectStats(stats, { visibleGroups: [0, 1, 2], outsideVisible: true }, 'in front of the house');
  if (!(stats.portalsFollowed >= 1)) fail(`in front of the house: a portal should be followed (got ${stats.portalsFollowed})`);
  const door = await at(page, [0, -2.85, 1]);
  if (!near(door, [76, 48, 26], 2)) fail(`in front of the house: the room's floor should show through the door, rgb(76,48,26) (got rgb(${door}))`);
  out['visibility-front'] = { door };
  await page.close();
  seen.push(`back to the door → groups [1] · facing it → [0,1,2] through 2 windows · behind the house → [0,2], 6 batches instead of 9, ${all.length} pixels identical (${drawnPixels} on the building) · in front → room through the door rgb(${door})`);
  console.log(`smoke: [${label}] building visibility on ${NAMES[renderer]} → ${seen.join(' · ')}`);
  return out;
}

/** P6.7: interior lighting paths (baked light, self-illumination by the baked alpha), props lit by their authored colour, interior fog and its 4-second transition. */
async function checkBuildingInterior(browser, label, renderer) {
  const NAMES = { webgpu: 'WebGPU', webgl2: 'WebGL2' };
  const fail = (msg) => problems.push(`[${label} building-interior ${renderer}] ${msg}`);
  const open = async (q) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('console', (m) => {
      if (m.type() === 'warning' && m.text().includes('GPU stall due to ReadPixels')) return;
      if (m.type() === 'error' || m.type() === 'warning') fail(`console.${m.type()}: ${m.text()}`);
    });
    page.on('pageerror', (e) => fail(`pageerror: ${e.message}`));
    await page.goto(`${BASE_URL}?engine=new&renderer=${renderer}&scene=building&textures=solid&view=inside&${q}`, { waitUntil: 'load' });
    await page.waitForSelector('#boot-status[data-state="ready"]', { state: 'attached', timeout: 30000 }).catch(() => fail('engine never became ready'));
    return page;
  };
  const at = async (page, point) => {
    const r = await page.evaluate(async (p) => window.__orvalisEngine.probe([window.__orvalisEngine.projectWorldPoint(p)]), point);
    for (const e of r.errors) fail(`GPU error: ${e}`);
    return r.pixels[0].slice(0, 3);
  };
  const drawn = (page) => page.evaluate(() => window.__orvalisEngine.getBuilding());
  const out = {}, seen = [];
  const EYE = [0, 0, 1.6], PLASTER = [220, 210, 190];
  const WALL_POINT = [-1.5, 2.7, 1.6], TABLE_TOP = [0, 1.8, 0.77];
  // Seen from east of the glass screen (from the middle of the room the panel is behind the glass).
  const GLOW_EYE = '2.5,0,1.6', GLOW_POINT = [2.7, 2.69, 1.6], WALL_BESIDE_GLOW = [2.5, 2.7, 0.8];
  const times = (a, b, k = 1) => a.map((v, i) => Math.round(Math.min(255, ((v * b[i]) / 255) * k)));

  // 1. No fog. Baked light: wall = plaster × its colour. Glow panel: plaster × (40,60,80) × (1 + 4 × 128/255).
  let page = await open(`heading=0&doodads=off&interiorFog=off&eye=${GLOW_EYE}`);
  const wall = await at(page, WALL_BESIDE_GLOW), glow = await at(page, GLOW_POINT);
  const wantWall = times(PLASTER, [180, 160, 130]), wantGlow = times(PLASTER, [40, 60, 80], 1 + (4 * 128) / 255);
  if (!near(wall, wantWall, 2)) fail(`baked wall: expected rgb(${wantWall}), got rgb(${wall})`);
  if (!near(glow, wantGlow, 2)) fail(`glow panel: expected plaster × baked × (1 + 4 × alpha) = rgb(${wantGlow}), got rgb(${glow})`);
  out['interior-light'] = { wall, glow };
  await page.close();
  // 2. A prop of the room is lit by its authored colour alone: board (150,110,70) × (170,150,125) / 255.
  page = await open('heading=0&pitch=20&interiorFog=off');
  const table = await at(page, TABLE_TOP), wantTable = times([150, 110, 70], [170, 150, 125]);
  if (!near(table, wantTable, 2)) fail(`table top: expected its texture × the prop's authored light = rgb(${wantTable}), got rgb(${table})`);
  out['interior-prop'] = { table };
  await page.close();
  seen.push(`wall rgb(${wall}) · glow rgb(${glow}) (expected ${wantGlow}) · table rgb(${table}) (expected ${wantTable})`);

  // 3. The room's fog: start 2 (8 × 0.25), end 8, colour (0.30, 0.24, 0.18). The wall point is 3.09 away.
  page = await open('heading=0&doodads=off');
  let stats = await drawn(page);
  if (stats.fog.source !== 'interior' || stats.fog.blend !== 1 || Math.abs(stats.fog.start - 2) > 1e-6 || Math.abs(stats.fog.end - 8) > 1e-6) fail(`in the room the fog should be the room's, at once: start 2, end 8 (got ${JSON.stringify(stats.fog)})`);
  const distance = Math.hypot(WALL_POINT[0] - EYE[0], WALL_POINT[1] - EYE[1], WALL_POINT[2] - EYE[2]), factor = (distance - 2) / 6;
  const FOG = [0.3 * 255, 0.24 * 255, 0.18 * 255];
  const wantFogged = wantWall.map((c, k) => Math.round(c + (FOG[k] - c) * factor));
  const fogged = await at(page, WALL_POINT);
  if (!near(fogged, wantFogged, 2)) fail(`fogged wall: expected rgb(${wantFogged}) (fog factor ${factor.toFixed(3)}), got rgb(${fogged})`);
  if (near(fogged, wantWall, 4)) fail(`fogged wall: the fog should change the wall (still rgb(${fogged}))`);
  out['interior-fog'] = { fogged };
  // 4. Walking out: the fog goes back to the outdoor one, in 4 seconds and not in one frame.
  const started = Date.now();
  await page.evaluate(() => window.__orvalisEngine.setBuildingEye([0, -8, 1.6]));
  const mid = await page.waitForFunction(() => { const f = window.__orvalisEngine.getBuilding().fog; return f.source === 'outdoor' && f.blend > 0 && f.blend < 1 ? f : null; }, null, { timeout: 5000 }).then((h) => h.jsonValue(), () => null);
  if (!mid) fail('walking out: the fog should be seen on its way (0 < transition < 1)');
  else if (!(mid.start > 2 && mid.start < 400)) fail(`walking out: mid-way the fog start should be between 2 and 400 (got ${mid.start})`);
  await page.waitForFunction(() => window.__orvalisEngine.getBuilding().fog.blend === 1, null, { timeout: 30000 }).catch(() => fail('walking out: the transition never finished'));
  const elapsed = (Date.now() - started) / 1000;
  stats = await drawn(page);
  if (stats.fog.source !== 'outdoor' || Math.abs(stats.fog.start - 400) > 1e-6) fail(`walking out: the fog should end as the outdoor one (got ${JSON.stringify(stats.fog)})`);
  if (elapsed < 3.5) fail(`walking out: the transition took ${elapsed.toFixed(1)} s, it should take about 4`);
  await page.close();
  seen.push(`fogged wall rgb(${fogged}) (expected ${wantFogged}) · walking out: transition seen at ${mid ? Math.round(mid.blend * 100) : '?'} %, done after ${elapsed.toFixed(1)} s`);
  console.log(`smoke: [${label}] building interior on ${NAMES[renderer]} → ${seen.join(' · ')}`);
  return out;
}

/** P7.1: the gameplay camera's orbit — real mouse drags, the spec's pixel → angle mapping, the ±89° pitch clamp. */
async function checkCamera(browser, label, renderer) {
  const NAMES = { webgpu: 'WebGPU', webgl2: 'WebGL2' };
  const CLEAR = [11, 14, 20];
  const fail = (msg) => problems.push(`[${label} camera ${renderer}] ${msg}`);
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => {
    if (m.type() === 'warning' && m.text().includes('GPU stall due to ReadPixels')) return;
    if (m.type() === 'error' || m.type() === 'warning') fail(`console.${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => fail(`pageerror: ${e.message}`));
  await page.goto(`${BASE_URL}?engine=new&renderer=${renderer}&scene=camera&textures=solid`, { waitUntil: 'load' });
  await page.waitForSelector('#boot-status[data-state="ready"]', { state: 'attached', timeout: 30000 }).catch(() => fail('engine never became ready'));
  const camera = () => page.evaluate(() => window.__orvalisEngine.getCamera());
  const at = async (point) => {
    const r = await page.evaluate(async (p) => window.__orvalisEngine.probe([window.__orvalisEngine.projectWorldPoint(p)]), point);
    for (const e of r.errors) fail(`GPU error: ${e}`);
    return r.pixels[0].slice(0, 3);
  };
  // « The character is at the centre »: the pivot projects to the middle of the screen, and around a point of the
  // character's chest (0.72 of its height) most of a 3 × 3 block of pixels shows the character — warm colours
  // (skin, hair, in light or shade: red ≥ green, clearly more red than blue), not the green ground, the grey stone
  // or the background. One pixel alone would be fragile: seen from the side the arm is only a few pixels wide.
  const isCharacter = (p) => !near(p, CLEAR, 6) && p[0] >= p[1] && p[0] - p[2] > 15;
  const centre = async () => {
    const c = await page.evaluate(() => window.__orvalisEngine.getCamera());
    const [middle, chest] = await page.evaluate(([pivot, h, pos]) => [window.__orvalisEngine.projectWorldPoint(pivot), window.__orvalisEngine.projectWorldPoint([pos[0], pos[1], pos[2] + 0.72 * h])], [c.pivot, c.characterHeight, c.position]);
    if (Math.abs(middle[0] - 0.5) > 1e-3 || Math.abs(middle[1] - 0.5) > 1e-3) fail(`the pivot should project to the centre of the screen (got ${middle.map((v) => v.toFixed(3))})`);
    const points = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) points.push([chest[0] + dx / 1280, chest[1] + dy / 720]);
    const r = await page.evaluate((pts) => window.__orvalisEngine.probe(pts), points);
    for (const e of r.errors) fail(`GPU error: ${e}`);
    const pixels = r.pixels.map((p) => p.slice(0, 3));
    return { pixel: pixels[4], hits: pixels.filter(isCharacter).length };
  };
  const onCharacter = (probe) => probe.hits >= 5;
  const expectAngles = async (yaw, pitch, what) => {
    await page.waitForFunction(([y, p]) => { const c = window.__orvalisEngine.getCamera(); return Math.abs(c.yaw - y) < 1e-6 && Math.abs(c.pitch - p) < 1e-6; }, [yaw, pitch], { timeout: 5000 }).catch(async () => fail(`${what}: expected yaw ${yaw}°, pitch ${pitch}°, got ${JSON.stringify(await camera())}`));
  };
  const drag = async (fromX, fromY, dx, dy, button = 'left') => {
    await page.mouse.move(fromX, fromY);
    await page.mouse.down({ button });
    await page.mouse.move(fromX + dx, fromY + dy, { steps: 8 }); // several move events: the angles must add up
    await page.mouse.up({ button });
  };
  const out = {}, seen = [];
  // The character stands at (0, −8, 0); the pivot is above its feet, at 0.9 of its height. The cottage's door is north of it.
  const GROUND = [6, -8, 0], DOOR_LINTEL = [0, -3, 2.6];

  // 1. Start: yaw 0 (looking north), pitch 20. The pivot is at the centre of the screen: the character is there.
  await expectAngles(0, 20, 'start');
  let state = await camera();
  const PIVOT = state.pivot;
  if (Math.abs(PIVOT[0]) > 1e-6 || Math.abs(PIVOT[1] + 8) > 1e-6 || Math.abs(PIVOT[2] - state.characterHeight * 0.9) > 1e-5 || !(state.characterHeight > 1.5 && state.characterHeight < 2.5)) fail(`start: the pivot should be above the character's feet at 0.9 of its height (pivot ${JSON.stringify(PIVOT)}, height ${state.characterHeight})`);
  if (Math.abs(Math.hypot(state.eye[0] - PIVOT[0], state.eye[1] - PIVOT[1], state.eye[2] - PIVOT[2]) - 8) > 1e-4) fail(`start: the eye should be 8 from the pivot (got ${JSON.stringify(state.eye)})`);
  const ground = await at(GROUND), body = await centre(), lintel = await at(DOOR_LINTEL);
  if (!onCharacter(body)) fail(`start: the character should be at the centre of the screen (got rgb(${body.pixel}), ${body.hits} of 9 pixels on it; ground rgb(${ground}))`);
  if (near(ground, CLEAR, 6)) fail(`start: the ground should be drawn (got rgb(${ground}))`);
  if (near(lintel, CLEAR, 6) || near(lintel, ground, 6)) fail(`start: the cottage should be in view, north of the character (got rgb(${lintel}))`);
  // 2. A real left-button drag of (+200, +60) pixels: Δyaw = 180 × 200 / 800 = 45°, Δpitch = 90 × 60 / 600 = 9°.
  await drag(400, 300, 200, 60);
  await expectAngles(45, 29, 'left drag (+200, +60)');
  // The camera turns around the pivot: the character is still at the centre.
  const turned = await centre();
  if (!onCharacter(turned)) fail(`after the drag the character should still be at the centre (got rgb(${turned.pixel}), ${turned.hits} of 9)`);
  // The left drag left the character alone; a move without a button turns nothing.
  await page.mouse.move(700, 500, { steps: 4 });
  await expectAngles(45, 29, 'plain move');
  state = await camera();
  if (state.characterYaw !== 0 || state.mouseMode !== 'none') fail(`after a left drag the character should still face 0° and no button be held (got ${JSON.stringify({ yaw: state.characterYaw, mode: state.mouseMode })})`);
  // 3. Pitch clamp: dragging far down stops at +89°, far up at −89°. The yaw wraps: −400 px = −90° → 315°.
  await drag(640, 100, -400, 600);
  await expectAngles(315, 89, 'drag down past the limit');
  const top = await centre();
  if (near(top.pixel, CLEAR, 6)) fail('at pitch 89 the camera looks down at the character and the ground: it cannot be empty there');
  await drag(640, 700, 0, -680);
  await drag(640, 700, 0, -680);
  await expectAngles(315, -89, 'drag up past the limit');
  state = await camera();
  // (Since P7.5 the ground stops the camera: it is under the pivot, but above the ground.)
  if (!(state.blocked && state.eye[2] > 0 && state.eye[2] < PIVOT[2])) fail(`at pitch −89 the camera should be under the pivot and stopped above the ground (eye z ${state.eye[2]}, blocked ${state.blocked})`);
  // 4. The same mapping through the hook: to yaw 270 (the camera east of the character, looking west), pitch 20.
  await page.evaluate(() => { const c = window.__orvalisEngine.getCamera(); window.__orvalisEngine.cameraDrag(((270 - c.yaw) * 800) / 180, ((20 - c.pitch) * 600) / 90); });
  await expectAngles(270, 20, 'hook drag to yaw 270');
  // (The ground had shortened the arm at pitch −89: it eases back out to 8 first.)
  await page.waitForFunction(() => window.__orvalisEngine.getCamera().distance === 8, null, { timeout: 10000 }).catch(() => fail('yaw 270: the arm should ease back out to 8 after the ground blocked it'));
  state = await camera();
  if (!(state.eye[0] > 7 && Math.abs(state.eye[1] + 8) < 1e-3)) fail(`yaw 270: the camera should be east of the character (eye ${JSON.stringify(state.eye)})`);
  const south = await centre();
  if (!onCharacter(south)) fail(`looking west the character should still be at the centre (got rgb(${south.pixel}), ${south.hits} of 9)`);
  await page.waitForFunction(() => document.getElementById('debug-overlay').textContent.split('\n').some((l) => l.startsWith('Camera: yaw 270.0° · pitch 20.0° (±89) · distance 8.00')), null, { timeout: 5000 }).catch(() => fail('overlay should show « Camera: yaw 270.0° · pitch 20.0° (±89) · distance 8.00 … »'));
  // 4a. Pivot (P7.4): key 3 makes the character three times as tall. It is drawn larger at once; the pivot climbs to
  //     0.9 of the new height at 1.2 yards per second (it is seen on its way), and the camera rises with it.
  const sizeOf = async () => {
    const h = (await camera()).characterHeight;
    const [feet, head] = await page.evaluate((top) => [window.__orvalisEngine.projectWorldPoint([0, -8, 0]), window.__orvalisEngine.projectWorldPoint([0, -8, top])], h);
    return Math.hypot(feet[0] - head[0], feet[1] - head[1]);
  };
  const near6 = (a, b) => Math.abs(a - b) < 1e-5;
  const small = await sizeOf(), eyeBefore = (await camera()).eye[2];
  await page.keyboard.press('Digit3');
  const grown = await page.waitForFunction(() => { const c = window.__orvalisEngine.getCamera(); return c.characterScale === 3 ? c : null; }, null, { timeout: 5000 }).then((h) => h.jsonValue(), () => null);
  if (!grown) fail('key 3 should make the character three times as tall');
  else if (!near6(grown.pivotTargetHeight, grown.characterHeight * 0.9) || !near6(grown.characterHeight, PIVOT[2] / 0.9 * 3)) fail(`key 3: the pivot should head for 0.9 of the new height (got ${JSON.stringify({ target: grown.pivotTargetHeight, height: grown.characterHeight })})`);
  const climbing = await page.waitForFunction(([from, to]) => { const c = window.__orvalisEngine.getCamera(); return c.pivotHeight > from + 0.05 && c.pivotHeight < to - 0.05 ? c.pivotHeight : null; }, [PIVOT[2], PIVOT[2] * 3], { timeout: 5000, polling: 'raf' }).then((h) => h.jsonValue(), () => null);
  if (climbing === null) fail('the pivot should be seen on its way up (it must not jump)');
  const climbStart = Date.now();
  await page.waitForFunction((to) => Math.abs(window.__orvalisEngine.getCamera().pivotHeight - to) < 1e-5, PIVOT[2] * 3, { timeout: 20000 }).catch(async () => fail(`the pivot never reached ${PIVOT[2] * 3} (got ${(await camera()).pivotHeight})`));
  state = await camera();
  if (!near6(state.eye[2] - eyeBefore, PIVOT[2] * 2)) fail(`the camera should have risen with the pivot by ${(PIVOT[2] * 2).toFixed(3)} (rose by ${(state.eye[2] - eyeBefore).toFixed(3)})`);
  const large = await sizeOf();
  if (!(large > small * 2)) fail(`three times as tall, the character should look much larger (${small.toFixed(3)} → ${large.toFixed(3)} of the screen)`);
  if (!onCharacter(await centre())) fail('with the pivot at its new height the character should still be at the centre of the screen');
  await page.keyboard.press('Digit2');
  await page.waitForFunction((to) => Math.abs(window.__orvalisEngine.getCamera().pivotHeight - to) < 1e-5, PIVOT[2], { timeout: 20000 }).catch(() => fail('key 2: the pivot should come back down'));
  seen.push(`pivot ${PIVOT[2].toFixed(3)} (0.9 × ${(PIVOT[2] / 0.9).toFixed(3)}) · × 3: seen at ${climbing === null ? '?' : climbing.toFixed(2)} on the way to ${(PIVOT[2] * 3).toFixed(3)}, ${((Date.now() - climbStart) / 1000).toFixed(1)} s after that · character ${(small * 100).toFixed(1)} % → ${(large * 100).toFixed(1)} % of the screen`);
  // 4b. Mouse buttons (P7.3) with the REAL mouse. Right drag: camera and character turn together.
  const held = (want, what) => page.waitForFunction((w) => { const c = window.__orvalisEngine.getCamera(); return Object.entries(w).every(([k, v]) => (typeof v === 'number' ? Math.abs(c[k] - v) < 1e-6 : c[k] === v)); }, want, { timeout: 5000 }).catch(async () => fail(`${what}: expected ${JSON.stringify(want)}, got ${JSON.stringify(await camera())}`));
  await page.evaluate(() => {
    window.__menus = [];
    window.addEventListener('contextmenu', (e) => setTimeout(() => window.__menus.push(e.defaultPrevented), 0));
  });
  await page.mouse.move(600, 300);
  await page.mouse.down({ button: 'right' });
  await held({ mouseMode: 'steer', characterYaw: 270, moveForward: false }, 'right press: the character turns to the camera heading at once');
  await page.mouse.move(520, 300, { steps: 4 }); // −80 px → −18°
  await held({ yaw: 252, characterYaw: 252 }, 'right drag: camera and character together');
  // Both buttons: move forward (an intent for now).
  await page.mouse.down({ button: 'left' });
  await held({ moveForward: true, mouseMode: 'steer' }, 'both buttons');
  await page.waitForFunction(() => document.getElementById('debug-overlay').textContent.split('\n').includes('Mouse: right — camera + character · BOTH: move forward · character faces 252.0°'), null, { timeout: 5000 }).catch(() => fail('overlay should show « Mouse: right — camera + character · BOTH: move forward · character faces 252.0° »'));
  // (Since P8.1 that intent really moves the character: it has left its starting point, along its heading.)
  const ran = await page.waitForFunction(() => { const c = window.__orvalisEngine.getCamera(); return Math.hypot(c.position[0], c.position[1] + 8) > 0.5 ? c : null; }, null, { timeout: 5000 }).then((h) => h.jsonValue(), () => null);
  if (!ran) fail('both buttons: the character should run forward');
  else if (Math.abs(Math.atan2(ran.position[0], ran.position[1] + 8) * 180 / Math.PI + 108) > 1e-3) fail(`both buttons: the character should run along its heading, 252° (it went to ${JSON.stringify(ran.position)})`);
  await page.mouse.up({ button: 'left' });
  await held({ moveForward: false, mouseMode: 'steer', speed: 0 }, 'left released, right still held');
  // Back to the starting point: the checks below measure the scene from there.
  await page.evaluate(() => window.__orvalisEngine.setCharacterPosition([0, -8, 0]));
  // A LOST release: the window loses focus while the right button is held (as when a menu or another window takes
  // over). Everything is let go; moving the mouse afterwards — the browser still reports the button — turns nothing.
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await held({ mouseMode: 'none' }, 'focus lost during a right drag');
  await page.mouse.move(900, 500, { steps: 6 });
  await page.mouse.move(200, 200, { steps: 6 });
  await held({ yaw: 252, pitch: 20, mouseMode: 'none' }, 'moving after a lost release must turn nothing');
  await page.mouse.up({ button: 'right' });
  // Same when the page switches to or from full screen during a drag.
  await page.mouse.move(600, 300);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(640, 300, { steps: 2 }); // +40 px → +9°
  await held({ yaw: 261, mouseMode: 'steer' }, 'second right drag');
  await page.evaluate(() => document.dispatchEvent(new Event('fullscreenchange')));
  await page.mouse.move(1000, 600, { steps: 6 });
  await held({ yaw: 261, pitch: 20, mouseMode: 'none' }, 'full-screen switch during a right drag');
  await page.mouse.up({ button: 'right' });
  // A plain right click on the game never opens the browser's menu.
  await page.mouse.click(640, 360, { button: 'right' });
  await page.waitForFunction(() => window.__menus.length >= 1, null, { timeout: 5000 }).catch(() => fail('a right click should produce a contextmenu event'));
  const menus = await page.evaluate(() => window.__menus);
  if (menus.length === 0 || menus.some((prevented) => !prevented)) fail(`the browser's context menu must be suppressed on the game (defaultPrevented: ${JSON.stringify(menus)})`);
  // On Windows the menu event comes at the RELEASE, when no drag is on any more: the canvas itself must refuse it.
  const refused = await page.evaluate(() => !document.getElementById('game').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 })));
  if (!refused) fail('a contextmenu event on the canvas with no button held must be refused too');
  // A release the page NEVER hears about (no « up », no blur): events built by hand. The first event that reports
  // no button ends the drag; what follows turns nothing.
  const afterLost = await page.evaluate(() => {
    const canvas = document.getElementById('game');
    const send = (type, buttons, x, y) => canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 77, buttons, clientX: x, clientY: y }));
    const before = window.__orvalisEngine.getCamera().yaw;
    send('pointerdown', 2, 400, 300);
    send('pointermove', 2, 440, 300); // +9°
    const during = window.__orvalisEngine.getCamera();
    send('pointermove', 0, 900, 500); // the button is no longer held, and no « up » was ever sent
    send('pointermove', 0, 100, 100);
    const after = window.__orvalisEngine.getCamera();
    return { before, during: { yaw: during.yaw, mode: during.mouseMode }, after: { yaw: after.yaw, pitch: after.pitch, mode: after.mouseMode } };
  });
  if (Math.abs(afterLost.during.yaw - (afterLost.before + 9)) > 1e-6 || afterLost.during.mode !== 'steer') fail(`hand-built right drag: expected +9° while steering, got ${JSON.stringify(afterLost)}`);
  if (Math.abs(afterLost.after.yaw - afterLost.during.yaw) > 1e-6 || afterLost.after.pitch !== 20 || afterLost.after.mode !== 'none') fail(`release never reported: the drag must end at the first event with no button, got ${JSON.stringify(afterLost)}`);
  await page.evaluate(() => window.__orvalisEngine.cameraDrag(-40, 0)); // undo those 9°
  // Back to where the zoom checks expect the camera, with a left drag (the character stays where the last right drag left it: 270°).
  await drag(600, 300, 40, 0);
  await held({ yaw: 270, characterYaw: 270, mouseMode: 'none' }, 'left drag after the right ones');
  await drag(600, 300, 80, 0);
  await held({ yaw: 288, characterYaw: 270 }, 'a left drag leaves the character where it faces');
  await drag(600, 300, -80, 0);
  seen.push(`right drag turns camera + character (252°) · both buttons = forward · focus loss and full-screen switch release the buttons, nothing keeps turning · ${menus.length} context menu(s) suppressed`);
  // 4c. Camera collision (P7.5). Yaw 160, level: the arm meets the cottage's front wall, 5 north of the character.
  //     The camera stops a skin (0.25) in front of it AT ONCE; turned away, it eases back out at 8.33 per second.
  const turnTo = (yaw, pitch) => page.evaluate(([y, p]) => { const c = window.__orvalisEngine.getCamera(); window.__orvalisEngine.cameraDrag(((y - c.yaw) * 800) / 180, ((p - c.pitch) * 600) / 90); }, [yaw, pitch]);
  const toWall = 5 / Math.cos((20 * Math.PI) / 180);
  await turnTo(160, 0);
  const stopped = await page.waitForFunction(() => { const c = window.__orvalisEngine.getCamera(); return c.blocked ? c : null; }, null, { timeout: 5000 }).then((h) => h.jsonValue(), () => null);
  if (!stopped) fail('towards the wall the camera should be blocked');
  else {
    if (Math.abs(stopped.obstacleDistance - toWall) > 1e-3 || Math.abs(stopped.distance - (toWall - 0.25)) > 1e-3) fail(`blocked: expected the wall at ${toWall.toFixed(3)} and the arm at ${(toWall - 0.25).toFixed(3)} (got ${stopped.obstacleDistance}, ${stopped.distance})`);
    if (!(stopped.eye[1] < -3) || stopped.zoomDistance !== 8) fail(`blocked: the camera should stay outside the wall (eye y ${stopped.eye[1]}) while the zoom still wants 8 (${stopped.zoomDistance})`);
  }
  if (!onCharacter(await centre())) fail('blocked by the wall, the camera should still show the character');
  await page.waitForFunction(() => document.getElementById('debug-overlay').textContent.split('\n').some((l) => l.startsWith('Camera collision: BLOCKED at 5.32 from the pivot — arm 5.07 of 8.00')), null, { timeout: 5000 }).catch(() => fail('overlay should show « Camera collision: BLOCKED at 5.32 from the pivot — arm 5.07 of 8.00 »'));
  // Key C turns the collision off: the camera goes through the wall, into the house. On again: back out at once.
  await page.keyboard.press('KeyC');
  await page.waitForFunction(() => { const c = window.__orvalisEngine.getCamera(); return !c.collision && c.distance === 8; }, null, { timeout: 10000 }).catch(() => fail('collision off: the arm should return to 8'));
  state = await camera();
  if (!(state.eye[1] > -3)) fail(`collision off: the camera should be through the wall (eye y ${state.eye[1]})`);
  await page.keyboard.press('KeyC');
  await page.waitForFunction((want) => { const c = window.__orvalisEngine.getCamera(); return c.collision && c.blocked && Math.abs(c.distance - want) < 1e-3; }, toWall - 0.25, { timeout: 5000 }).catch(() => fail('collision on again: the camera should be back in front of the wall'));
  // Turned away from the wall: free, and the arm is seen growing back before it reaches 8.
  await turnTo(270, 20);
  const easing = await page.waitForFunction(() => { const c = window.__orvalisEngine.getCamera(); return !c.blocked && c.distance > 5.2 && c.distance < 7.9 ? c.distance : null; }, null, { timeout: 5000, polling: 'raf' }).then((h) => h.jsonValue(), () => null);
  if (easing === null) fail('turned away from the wall the arm should be seen growing back (it must not jump to 8)');
  await page.waitForFunction(() => { const c = window.__orvalisEngine.getCamera(); return !c.blocked && c.distance === 8; }, null, { timeout: 10000 }).catch(() => fail('turned away from the wall the arm should return to 8'));
  seen.push(`wall at ${toWall.toFixed(2)}: arm ${stopped ? stopped.distance.toFixed(2) : '?'} at once, camera outside (y ${stopped ? stopped.eye[1].toFixed(2) : '?'}) · C off → through the wall, on → back · turned away: arm seen at ${easing === null ? '?' : easing.toFixed(2)} easing out to 8`);
  // 5. Zoom (P7.2): real wheel events over the canvas. The request moves by 1 yard per event at once; the distance
  //    follows at 8.33 yards per second (it is seen on its way) and stops exactly on the request.
  const wheel = async (deltaY, times) => {
    await page.mouse.move(640, 360);
    for (let k = 0; k < times; k++) await page.mouse.wheel(0, deltaY);
  };
  const apparentHeight = async () => {
    const [feet, head] = await page.evaluate(() => [window.__orvalisEngine.projectWorldPoint([0, -8, 0]), window.__orvalisEngine.projectWorldPoint([0, -8, 1.8])]);
    return Math.hypot(feet[0] - head[0], feet[1] - head[1]);
  };
  const waitCamera = (want, what, timeout = 10000) => page.waitForFunction((w) => { const c = window.__orvalisEngine.getCamera(); return Object.entries(w).every(([k, v]) => Math.abs(c[k] - v) < 1e-9); }, want, { timeout }).catch(async () => fail(`${what}: expected ${JSON.stringify(want)}, got ${JSON.stringify(await camera())}`));
  await waitCamera({ distance: 8, requestedDistance: 8, maxDistance: 15 }, 'zoom at start');
  const sizeAt8 = await apparentHeight();
  // (The distance is recorded every frame from BEFORE the first wheel event: on a slow machine the seven events
  // and the wait that follows can take longer than the 0.84 s the zoom needs, and a check made afterwards
  // would find the distance already at 15 — that race made this check fail once in three runs.)
  await page.evaluate(() => {
    window.__zoomSeen = [];
    const tick = () => {
      const d = window.__orvalisEngine.getCamera().distance;
      window.__zoomSeen.push(d);
      if (d < 15 && window.__zoomSeen.length < 2000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await wheel(100, 7); // backwards: farther
  await waitCamera({ requestedDistance: 15 }, 'wheel back 7 steps', 2000);
  await waitCamera({ distance: 15 }, 'zoomed out');
  const onTheWay = (await page.evaluate(() => window.__zoomSeen)).find((d) => d > 8 && d < 15) ?? null;
  if (onTheWay === null) fail('zooming out: the distance should be seen between 8 and 15 on its way (it must not jump)');
  const sizeAt15 = await apparentHeight();
  if (!(sizeAt15 < sizeAt8 * 0.7)) fail(`at 15 the character should look clearly smaller than at 8 (${sizeAt15.toFixed(3)} vs ${sizeAt8.toFixed(3)} of the screen)`);
  await wheel(100, 5);
  await waitCamera({ requestedDistance: 15 }, 'wheel back past the maximum', 2000);
  // 6. First person (P7.6). At 8 the character is opaque: remember what its chest looks like from here.
  await wheel(-100, 7);
  await waitCamera({ distance: 8 }, 'back to 8');
  state = await camera();
  if (state.characterAlpha !== 1 || state.firstPerson) fail(`at 8 the character should be opaque (alpha ${state.characterAlpha})`);
  await wheel(-100, 30); // forwards: closer, past the minimum — all the way into first person
  await waitCamera({ requestedDistance: 0 }, 'wheel forward past the minimum', 2000);
  await waitCamera({ distance: 0 }, 'zoomed into first person');
  state = await camera();
  if (!state.firstPerson || state.characterAlpha !== 0) fail(`at 0 the character should be hidden: first person (got ${JSON.stringify({ alpha: state.characterAlpha, firstPerson: state.firstPerson })})`);
  if (Math.hypot(state.eye[0] - PIVOT[0], state.eye[1] - PIVOT[1], state.eye[2] - PIVOT[2]) > 2e-3) fail(`first person: the eye should be at the pivot (got ${JSON.stringify(state.eye)})`);
  if (Math.abs(state.yaw - 270) > 1e-6 || Math.abs(state.pitch - 20) > 1e-6) fail(`zooming must not turn the camera (yaw ${state.yaw}, pitch ${state.pitch})`);
  // Nothing of the character is on screen: a block of pixels in the middle is all ground.
  const middle = (await page.evaluate(() => window.__orvalisEngine.probe([[0.5, 0.5], [0.45, 0.6], [0.55, 0.6], [0.5, 0.7], [0.4, 0.8], [0.6, 0.8]]))).pixels.map((p) => p.slice(0, 3));
  if (middle.some(isCharacter)) fail(`first person: no pixel of the character should be drawn (got ${JSON.stringify(middle)})`);
  await page.waitForFunction(() => document.getElementById('debug-overlay').textContent.split('\n').some((l) => l.includes('distance 0.00 → 0 (wheel, max 15)')) && document.getElementById('debug-overlay').textContent.includes('FIRST PERSON (character hidden)'), null, { timeout: 5000 }).catch(() => fail('overlay should show « distance 0.00 → 0 (wheel, max 15) » and « FIRST PERSON (character hidden) »'));
  // One step back out, to 1: the character is there again, half transparent — the ground shows through it.
  await wheel(100, 1);
  await waitCamera({ distance: 1 }, 'one step back to 1');
  state = await camera();
  const wantAlpha = (1 - Math.cos((Math.PI * 0.9) / 1.8315)) / 2;
  if (Math.abs(state.characterAlpha - wantAlpha) > 1e-6) fail(`at 1 the character's opacity should be ${wantAlpha.toFixed(4)} (got ${state.characterAlpha})`);
  // At 1 the character is drawn again (at 0 no pixel of it was): around its chest the picture is no longer bare ground.
  const chestAt1 = await page.evaluate(async (h) => {
    const c = window.__orvalisEngine.projectWorldPoint([0, -8, 0.72 * h]), points = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) points.push([c[0] + dx / 1280, c[1] + dy / 720]);
    return (await window.__orvalisEngine.probe(points)).pixels.map((p) => p.slice(0, 3));
  }, state.characterHeight);
  const drawnAt1 = chestAt1.filter((p) => !near(p, ground, 8) && !near(p, CLEAR, 6)).length;
  if (drawnAt1 < 5) fail(`at 1 the half-transparent character should be drawn over the ground (only ${drawnAt1} of 9 pixels differ from the ground: ${JSON.stringify(chestAt1[4])})`);
  // (The fade window is crossed in a fifth of a second: it is checked at rest, at 1 and at 2, not « on the way ».)
  await wheel(100, 1);
  await waitCamera({ distance: 2 }, 'one more step back to 2');
  state = await camera();
  if (state.characterAlpha !== 1) fail(`at 2 (beyond the 1.8315 window) the character should be opaque again (got ${state.characterAlpha})`);
  // 7. Follow (P7.7). Smart (default): a left drag leaves the camera where the player put it while the character
  //    stands; as soon as it moves (W held) the camera comes back behind it, smoothly; released, W stops it.
  await held({ yaw: 270, characterYaw: 270, followMode: 'smart', moving: false }, 'before the follow checks');
  await drag(600, 300, 200, 0); // +45°
  await held({ yaw: 315, characterYaw: 270, recentering: false }, 'smart, standing: the camera stays where it was put');
  await page.waitForTimeout(400);
  await held({ yaw: 315, recentering: false }, 'smart, standing, a moment later');
  await page.keyboard.down('KeyW');
  const coming = await page.waitForFunction(() => { const c = window.__orvalisEngine.getCamera(); return c.moving && c.recentering && c.yaw < 314.5 && c.yaw > 270.5 ? c.yaw : null; }, null, { timeout: 5000, polling: 'raf' }).then((h) => h.jsonValue(), () => null);
  if (coming === null) fail('smart, moving: the camera should be seen coming back behind the character (it must not snap)');
  await held({ yaw: 270, recentering: false, moving: true }, 'smart, moving: the camera ends behind the character');
  await page.keyboard.up('KeyW');
  await held({ moving: false }, 'W released');
  // Always: no need to move.
  await page.keyboard.press('KeyF');
  await held({ followMode: 'always' }, 'key F: always');
  await drag(600, 300, -200, 0);
  await held({ yaw: 270, recentering: false }, 'always: back behind the character after the drag, without moving');
  // While the left button is HELD the camera is the player's, even in « always ».
  await page.mouse.move(600, 300);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(700, 300, { steps: 4 });
  await page.waitForTimeout(600);
  await held({ yaw: 292.5, recentering: false, mouseMode: 'orbit' }, 'always, left button held: no recentring');
  await page.mouse.up({ button: 'left' });
  await held({ yaw: 270, recentering: false }, 'always: recentred once the button is released');
  // Never: nothing brings it back, moving or not. And losing the focus lets go of W.
  await page.keyboard.press('KeyF');
  await held({ followMode: 'never' }, 'key F: never');
  await drag(600, 300, 200, 0);
  await page.keyboard.down('KeyW');
  await held({ moving: true }, 'W held');
  await page.waitForTimeout(600);
  await held({ yaw: 315, recentering: false }, 'never: the camera stays, even while moving');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await held({ moving: false }, 'focus lost: W is let go');
  await page.keyboard.up('KeyW');
  await page.waitForFunction(() => document.getElementById('debug-overlay').textContent.split('\n').includes('Follow: never (F) · character standing'), null, { timeout: 5000 }).catch(() => fail('overlay should show « Follow: never (F) · character standing »'));
  seen.push(`follow: smart keeps 315° while standing, W brings it back (seen at ${coming === null ? '?' : coming.toFixed(1)}°) to 270° · always recentres without moving, not while the button is held · never stays at 315°`);
  // 8. Movement on the ground (P8.1), with the REAL keys. Two samples are taken while the keys are held: between
  //    them the character's feet moved by speed × simulated time, in the direction the intent gives.
  //    (Follow is « never » here, so the camera's yaw only changes when the test says so.)
  const RAD8 = Math.PI / 180;
  // (The follow checks above made the character run west: back to the start, the ground is only 80 wide.)
  await page.evaluate(() => window.__orvalisEngine.setCharacterPosition([0, -8, 0]));
  const moveWith = async (what, press, release, want) => {
    await press();
    const a = await page.waitForFunction(() => { const c = window.__orvalisEngine.getCamera(); return c.speed > 0 ? c : null; }, null, { timeout: 5000 }).then((h) => h.jsonValue(), () => null);
    if (!a) { fail(`${what}: the character never started moving`); await release(); return null; }
    const b = await page.waitForFunction((from) => { const c = window.__orvalisEngine.getCamera(); return c.simulatedMs >= from + 300 ? c : null; }, a.simulatedMs, { timeout: 5000 }).then((h) => h.jsonValue(), () => null);
    await release();
    await page.waitForFunction(() => window.__orvalisEngine.getCamera().speed === 0, null, { timeout: 5000 }).catch(() => fail(`${what}: the character should stop when the keys are released`));
    if (!b) { fail(`${what}: no second sample`); return null; }
    const seconds = (b.simulatedMs - a.simulatedMs) / 1000, dx = b.position[0] - a.position[0], dy = b.position[1] - a.position[1], gone = Math.hypot(dx, dy);
    const speed = gone / seconds, heading = a.characterYaw * RAD8;
    // Direction wanted, from the heading: forward = (sin h, cos h), right = (cos h, −sin h).
    const wx = want.forward * Math.sin(heading) + want.right * Math.cos(heading), wy = want.forward * Math.cos(heading) - want.right * Math.sin(heading), wl = Math.hypot(wx, wy);
    if (Math.abs(speed - want.speed) > 1e-3) fail(`${what}: expected ${want.speed} per second, measured ${speed.toFixed(4)} (${gone.toFixed(4)} in ${seconds.toFixed(4)} s)`);
    if (Math.abs(dx / gone - wx / wl) > 1e-3 || Math.abs(dy / gone - wy / wl) > 1e-3) fail(`${what}: wrong direction (moved ${(dx / gone).toFixed(3)}, ${(dy / gone).toFixed(3)}; wanted ${(wx / wl).toFixed(3)}, ${(wy / wl).toFixed(3)})`);
    if (Math.abs(b.speed - want.speed) > 1e-6 || Math.abs(b.position[2]) > 1e-9) fail(`${what}: the reported speed should be ${want.speed} and the feet stay on the ground (got ${b.speed}, z ${b.position[2]})`);
    if (b.animation !== want.animation) fail(`${what}: the character should play « ${want.animation} » (got « ${b.animation} »)`);
    if (b.characterYaw !== a.characterYaw) fail(`${what}: moving must not turn the character (${a.characterYaw} → ${b.characterYaw})`);
    return speed;
  };
  const keys = (...codes) => [async () => { for (const k of codes) await page.keyboard.down(k); }, async () => { for (const k of [...codes].reverse()) await page.keyboard.up(k); }];
  const standing = await camera();
  if (standing.speed !== 0 || standing.intent.forward !== 0) fail(`before the movement checks the character should stand still (got ${JSON.stringify({ speed: standing.speed, intent: standing.intent })})`);
  const measured = {};
  // Animation (P8.1b): standing plays « stand »; while running the legs really swing — a point beside the right
  // shin is sometimes covered by the leg, sometimes not (it would never change if the character glided).
  if (standing.animation !== 'stand') fail(`standing still the character should play « stand » (got « ${standing.animation} »)`);
  await page.keyboard.down('KeyW');
  const swing = await page.evaluate(async () => {
    const e = window.__orvalisEngine, seen = [], states = new Set();
    for (let k = 0; k < 40; k++) {
      await new Promise((r) => requestAnimationFrame(r));
      const c = e.getCamera(), h = c.characterHeight, a = (c.characterYaw * Math.PI) / 180;
      states.add(c.animation);
      // 0.12 in front of the right shin, at a quarter of the height.
      const p = [c.position[0] + 0.1 * Math.cos(a) + 0.12 * Math.sin(a), c.position[1] - 0.1 * Math.sin(a) + 0.12 * Math.cos(a), c.position[2] + 0.2 * h];
      seen.push((await e.probe([e.projectWorldPoint(p)])).pixels[0].slice(0, 3).join(','));
    }
    return { colours: [...new Set(seen)], states: [...states] };
  });
  await page.keyboard.up('KeyW');
  if (!swing.states.includes('run')) fail(`W held: the character should play « run » (saw ${JSON.stringify(swing.states)})`);
  if (swing.colours.length < 2) fail(`running, the legs should swing: the point in front of the shin never changed (always rgb(${swing.colours[0]}))`);
  await held({ animation: 'stand', speed: 0 }, 'W released: back to « stand »');
  measured.forward = await moveWith('W', ...keys('KeyW'), { speed: 7, forward: 1, right: 0, animation: 'run' });
  measured.backward = await moveWith('S', ...keys('KeyS'), { speed: 4.5, forward: -1, right: 0, animation: 'walk' });
  measured.walk = await moveWith('Shift + W', ...keys('ShiftLeft', 'KeyW'), { speed: 2.5, forward: 1, right: 0, animation: 'walk' });
  measured.diagonal = await moveWith('W + E', ...keys('KeyW', 'KeyE'), { speed: 7, forward: 1, right: 1, animation: 'run' });
  measured.strafe = await moveWith('Q', ...keys('KeyQ'), { speed: 7, forward: 0, right: -1, animation: 'run' });
  await moveWith('arrow up', ...keys('ArrowUp'), { speed: 7, forward: 1, right: 0, animation: 'run' });
  await moveWith('W + S (opposite keys cancel) + E', ...keys('KeyW', 'KeyS', 'KeyE'), { speed: 7, forward: 0, right: 1, animation: 'run' });
  // Standing still, the position does not drift.
  const rest1 = await camera();
  await page.waitForFunction((from) => window.__orvalisEngine.getCamera().simulatedMs >= from + 200, rest1.simulatedMs, { timeout: 5000 });
  const rest2 = await camera();
  if (rest2.position.some((v, k) => v !== rest1.position[k]) || rest2.travelled !== rest1.travelled) fail('with no key held the character must not move at all');
  // D turns the character clockwise at 180° per second (our choice), and the camera turns with it; it does not move.
  await page.keyboard.down('KeyD');
  const t1 = await page.waitForFunction((yaw) => { const c = window.__orvalisEngine.getCamera(); return c.characterYaw !== yaw ? c : null; }, rest2.characterYaw, { timeout: 5000 }).then((h) => h.jsonValue(), () => null);
  const t2 = t1 && await page.waitForFunction((from) => { const c = window.__orvalisEngine.getCamera(); return c.simulatedMs >= from + 200 ? c : null; }, t1.simulatedMs, { timeout: 5000 }).then((h) => h.jsonValue(), () => null);
  await page.keyboard.up('KeyD');
  if (!t1 || !t2) fail('D should turn the character');
  else {
    const wrap = (d) => (((d % 360) + 540) % 360) - 180;
    const wantTurn = (180 * (t2.simulatedMs - t1.simulatedMs)) / 1000, gotTurn = wrap(t2.characterYaw - t1.characterYaw), camTurn = wrap(t2.yaw - t1.yaw);
    if (Math.abs(gotTurn - wantTurn) > 1e-6) fail(`D: expected a turn of ${wantTurn.toFixed(3)}° (180° per second), got ${gotTurn.toFixed(3)}°`);
    if (Math.abs(camTurn - gotTurn) > 1e-6) fail(`D: the camera should turn with the character (${camTurn.toFixed(3)}° vs ${gotTurn.toFixed(3)}°)`);
    if (t2.speed !== 0 || t2.position[0] !== t1.position[0] || t2.position[1] !== t1.position[1]) fail('turning on the spot must not move the character');
    measured.turn = gotTurn / ((t2.simulatedMs - t1.simulatedMs) / 1000);
  }
  await page.waitForFunction(() => window.__orvalisEngine.getCamera().intent.turn === 0, null, { timeout: 5000 }).catch(() => fail('D released: the turn should stop'));
  const turned1 = await camera();
  await page.waitForTimeout(150);
  if ((await camera()).characterYaw !== turned1.characterYaw) fail('D released: the character should stop turning');
  // Right button held (the mouse steers): A no longer turns, it strafes to the left; the heading is the camera's.
  await page.mouse.move(600, 300);
  await page.mouse.down({ button: 'right' });
  await held({ mouseMode: 'steer' }, 'right button before strafing');
  const steerYaw = (await camera()).yaw;
  measured.steerStrafe = await moveWith('right button + A', ...keys('KeyA'), { speed: 7, forward: 0, right: -1, animation: 'run' });
  if (Math.abs((await camera()).characterYaw - steerYaw) > 1e-6) fail('right button + A: the character should keep the camera heading, not turn');
  // Both buttons: the character runs forward, with no key at all.
  measured.both = await moveWith('both buttons', () => page.mouse.down({ button: 'left' }), () => page.mouse.up({ button: 'left' }), { speed: 7, forward: 1, right: 0, animation: 'run' });
  await page.mouse.up({ button: 'right' });
  await held({ mouseMode: 'none', moving: false }, 'buttons released');
  // After all this the character is somewhere else — and still at the centre of the screen: the pivot follows it.
  const moved = await camera();
  const far = Math.hypot(moved.position[0], moved.position[1] + 8);
  if (!(far > 3)) fail(`the character should have left its starting point (it is ${far.toFixed(2)} away)`);
  if (Math.abs(moved.pivot[0] - moved.position[0]) > 1e-6 || Math.abs(moved.pivot[1] - moved.position[1]) > 1e-6) fail(`the pivot should be above the character's feet (pivot ${JSON.stringify(moved.pivot)}, feet ${JSON.stringify(moved.position)})`);
  if (!onCharacter(await centre())) fail('after moving, the character should still be at the centre of the screen');
  await page.waitForFunction(() => document.getElementById('debug-overlay').textContent.split('\n').some((l) => l.startsWith('Movement: at ') && l.includes(' · 0.00 per second')), null, { timeout: 5000 }).catch(() => fail('overlay should show « Movement: at … · 0.00 per second … »'));
  const f2 = (v) => (typeof v === 'number' ? v.toFixed(2) : '?');
  seen.push(`movement: W ${f2(measured.forward)} · S ${f2(measured.backward)} · Shift+W ${f2(measured.walk)} · W+E ${f2(measured.diagonal)} (diagonal) · Q ${f2(measured.strafe)} · D turns ${f2(measured.turn)}°/s with the camera · right button + A strafes ${f2(measured.steerStrafe)} · both buttons ${f2(measured.both)} · character ${far.toFixed(1)} from its start, still at the centre · animation: stand / run / walk follow the movement, legs swing (${swing.colours.length} colours at the shin)`);
  // 9. Jump and gravity (P8.2), with the REAL Space key. The flight is sampled every frame: its top is 1.64 above
  //    the ground, it lasts 0.825 s (seen at the first 1/60 s step after it), and the camera's pivot rises with it.
  const jumpWith = async (what, press, release) => {
    const before = await camera();
    await press();
    const trace = await page.evaluate(async (flightsBefore) => {
      const e = window.__orvalisEngine, samples = [];
      for (let k = 0; k < 600; k++) {
        await new Promise((r) => requestAnimationFrame(r));
        const c = e.getCamera();
        if (c.flights > flightsBefore) samples.push({ z: c.position[2], mode: c.mode, pivot: c.pivot[2] - c.pivotHeight, animation: c.animation, speed: c.speed });
        if (c.flights > flightsBefore && c.mode === 'grounded') return { samples, end: c };
      }
      return { samples, end: e.getCamera() };
    }, before.flights);
    await release();
    if (trace.end.mode !== 'grounded' || trace.samples.length < 5) { fail(`${what}: the character should leave the ground and come back (${trace.samples.length} samples, mode ${trace.end.mode})`); return null; }
    const top = Math.max(...trace.samples.map((s) => s.z));
    if (Math.abs(trace.end.apex - 1.6404) > 2e-3) fail(`${what}: the jump should gain 1.64 (got ${trace.end.apex.toFixed(4)})`);
    if (!(top > 1.2 && top <= 1.6405)) fail(`${what}: the character should be SEEN near the top of its jump (highest seen ${top.toFixed(3)})`);
    if (Math.abs(trace.end.airSeconds - 50 / 60) > 1e-6) fail(`${what}: the flight should last 50 steps of 1/60 s = 0.833 s (true 0.825 s) (got ${trace.end.airSeconds.toFixed(4)})`);
    if (trace.samples.some((s) => Math.abs(s.pivot - s.z) > 1e-6)) fail(`${what}: the camera's pivot should rise and fall with the character`);
    if (trace.samples.some((s) => s.mode === 'fallingFar')) fail(`${what}: a jump on flat ground is never a far fall`);
    if (!trace.samples.some((s) => s.animation === 'jumpStart' || s.animation === 'jump')) fail(`${what}: the jump animation should play (saw ${JSON.stringify([...new Set(trace.samples.map((s) => s.animation))])})`);
    if (trace.end.position[2] !== 0 || trace.end.verticalSpeed !== 0) fail(`${what}: landed, the feet are on the ground and the vertical speed is 0 (got z ${trace.end.position[2]}, ${trace.end.verticalSpeed})`);
    const gone = Math.hypot(trace.end.position[0] - before.position[0], trace.end.position[1] - before.position[1]);
    return { top, gone, air: trace.end.airSeconds, speeds: trace.samples.slice(0, -1).map((s) => s.speed), flights: trace.end.flights - before.flights };
  };
  // (From a place where no run leads into the cottage: its floor is 0.02 higher than the ground.)
  await page.evaluate(() => window.__orvalisEngine.setCharacterPosition([-20, 20, 0]));
  // The taps are as short as a tap can be (down and up at once, between two frames): the jump must not be lost.
  const tap = [() => page.keyboard.down('Space'), () => page.keyboard.up('Space')];
  const still = await jumpWith('Space, standing', async () => { await tap[0](); await tap[1](); }, async () => {});
  if (still && still.gone > 1e-9) fail(`a standing jump must not move the character sideways (moved ${still.gone})`);
  // Running jump: the horizontal speed is kept all the way (7 per second).
  await page.keyboard.down('KeyW');
  await held({ speed: 7, mode: 'grounded' }, 'running before the jump');
  const running = await jumpWith('Space while running', async () => { await tap[0](); await tap[1](); }, () => page.keyboard.up('KeyW'));
  if (running && running.speeds.some((s) => Math.abs(s - 7) > 1e-6)) fail(`a running jump keeps its speed of 7 (saw ${JSON.stringify([...new Set(running.speeds.map((s) => s.toFixed(3)))])})`);
  await held({ speed: 0, mode: 'grounded' }, 'after the running jump');
  // Standing jump, THEN W in the air: only 2.5 per second of control.
  const beforeSteer = await camera();
  await page.keyboard.down('Space');
  await page.waitForFunction((f) => window.__orvalisEngine.getCamera().flights > f, beforeSteer.flights, { timeout: 5000 }).catch(() => fail('Space should start a jump'));
  await page.keyboard.up('Space');
  await page.keyboard.down('KeyW');
  const steered = await page.waitForFunction(() => { const c = window.__orvalisEngine.getCamera(); return c.mode !== 'grounded' && c.speed > 0 ? c.speed : null; }, null, { timeout: 5000, polling: 'raf' }).then((h) => h.jsonValue(), () => null);
  if (steered === null || Math.abs(steered - 2.5) > 1e-6) fail(`W pressed in the air after a standing jump: 2.5 per second of control (got ${steered})`);
  await page.waitForFunction(() => window.__orvalisEngine.getCamera().mode === 'grounded', null, { timeout: 5000 });
  await held({ speed: 7 }, 'landed with W still held: running again');
  await page.keyboard.up('KeyW');
  await held({ speed: 0, mode: 'grounded' }, 'after the steered jump');
  // The edge of the ground: the character walks off it, falls (a FAR fall after 0.5 s), and is put back at the start.
  const atEdge = await camera();
  const h9 = atEdge.characterYaw * RAD8, sx = Math.sin(h9), cy = Math.cos(h9);
  const edge = Math.abs(sx) >= Math.abs(cy) ? [Math.sign(sx) * 39.8, -30, 0] : [-30, Math.sign(cy) * 39.8, 0];
  await page.evaluate((p) => window.__orvalisEngine.setCharacterPosition(p), edge);
  await page.keyboard.down('KeyW');
  const fall = await page.evaluate(async (start) => {
    const e = window.__orvalisEngine, seen = [];
    for (let k = 0; k < 900; k++) {
      await new Promise((r) => requestAnimationFrame(r));
      const c = e.getCamera();
      if (c.respawns > start) return { seen, end: c };
      if (c.mode !== 'grounded') seen.push({ mode: c.mode, air: c.airSeconds, z: c.position[2], v: c.verticalSpeed, jumped: c.jumped });
    }
    return { seen, end: e.getCamera() };
  }, atEdge.respawns);
  await page.keyboard.up('KeyW');
  if (fall.end.respawns !== atEdge.respawns + 1) fail(`walking off the edge the character should fall and be put back (saw ${fall.seen.length} samples in the air)`);
  else {
    if (fall.seen.some((s) => s.jumped)) fail('walking off the edge is not a jump');
    if (fall.seen.some((s) => (s.mode === 'fallingFar') !== (s.air >= 0.5 - 1e-9))) fail('off an edge the fall should become a far fall after 0.5 s exactly');
    if (!fall.seen.some((s) => s.mode === 'falling') || !fall.seen.some((s) => s.mode === 'fallingFar')) fail('both fall states should be seen off the edge');
    if (fall.seen.some((s) => Math.abs(s.z + 0.5 * 19.291105 * s.air * s.air) > 1e-6 || Math.abs(s.v + 19.291105 * s.air) > 1e-6)) fail('off the edge the fall should follow z = −g·t² / 2');
    if (Math.hypot(fall.end.position[0], fall.end.position[1] + 8) > 1.5 || fall.end.position[2] !== 0 || fall.end.mode !== 'grounded') fail(`after the fall the character should be back at its starting point (got ${JSON.stringify(fall.end.position)})`);
  }
  await held({ speed: 0, mode: 'grounded' }, 'after the respawn');
  await page.waitForFunction(() => document.getElementById('debug-overlay').textContent.split('\n').some((l) => l.startsWith('Movement: at ') && l.includes(' · 0.00 per second · on the ground (slope 0°, ') && l.includes(') (last flight ')), null, { timeout: 5000 }).catch(() => fail('overlay should show « Movement: at … · 0.00 per second · on the ground (last flight … »'));
  if (!onCharacter(await centre())) fail('after the respawn the character should be at the centre of the screen');
  seen.push(`jump: Space gains ${still ? still.top.toFixed(2) : '?'} seen (apex 1.64), ${still ? still.air.toFixed(3) : '?'} s in the air, pivot follows · running jump covers ${running ? running.gone.toFixed(2) : '?'} at 7 · standing jump + W: ${steered === null ? '?' : steered.toFixed(1)} per second · off the edge: falling, far fall after 0.5 s (${fall.seen.length} samples), back at the start`);
  // 10. The real ground (P8.3): four test lanes south-east of the cottage, slopes of 30°, 45°, 50° and 55° rising
  //     towards +x from x = 12 to platforms 2.4 high that end at x = 24. The feet follow rays cast straight down.
  const RAMP = { startX: 12, height: 2.4, endX: 24, lanes: { 30: -20.5, 45: -24.5, 50: -28.5, 55: -32.5 } };
  const topOf = (deg) => RAMP.startX + RAMP.height / Math.tan(deg * RAD8);
  // Face east: the camera is turned to 90°, and a right click gives the character the camera's heading.
  await page.evaluate(() => { const c = window.__orvalisEngine.getCamera(); window.__orvalisEngine.cameraDrag(((90 - c.yaw) * 800) / 180, 0); });
  await page.mouse.move(600, 300);
  await page.mouse.down({ button: 'right' });
  await held({ characterYaw: 90, mouseMode: 'steer' }, 'facing east');
  await page.mouse.up({ button: 'right' });
  await held({ mouseMode: 'none' }, 'right button released');
  const slopePixel = await at([14, RAMP.lanes[30], (14 - RAMP.startX) * Math.tan(30 * RAD8)]);
  if (near(slopePixel, CLEAR, 6) || near(slopePixel, ground, 8)) fail(`the test ramps should be drawn (got rgb(${slopePixel}) on the 30° slope; ground rgb(${ground}))`);
  const climb = async (deg, untilX) => {
    await page.evaluate((p) => window.__orvalisEngine.setCharacterPosition(p), [RAMP.startX - 0.5, RAMP.lanes[deg], 0]);
    await page.keyboard.down('KeyW');
    const trace = await page.evaluate(async (stopAt) => {
      const e = window.__orvalisEngine, samples = [];
      for (let k = 0; k < 400; k++) {
        await new Promise((r) => requestAnimationFrame(r));
        const c = e.getCamera();
        samples.push({ x: c.position[0], z: c.position[2], slope: c.slope, mode: c.mode, speed: c.speed, blocked: c.blockedBySlope, touching: c.touching });
        if (c.position[0] >= stopAt || (k > 60 && c.speed === 0)) break;
      }
      return samples;
    }, untilX);
    await page.keyboard.up('KeyW');
    return trace;
  };
  const climbed = {};
  for (const deg of [30, 45, 50]) {
    const trace = await climb(deg, topOf(deg) + 1);
    const onSlope = trace.filter((p) => p.x > RAMP.startX + 0.05 && p.x < topOf(deg) - 0.05), last = trace[trace.length - 1];
    if (onSlope.length < 2) fail(`${deg}° lane: the character should be seen on the slope (${onSlope.length} samples)`);
    if (onSlope.some((p) => Math.abs(p.z - (p.x - RAMP.startX) * Math.tan(deg * RAD8)) > 1e-3)) fail(`${deg}° lane: the feet should be ON the slope at every sample`);
    if (onSlope.some((p) => Math.abs(p.slope - deg) > 0.01)) fail(`${deg}° lane: the slope under the feet should read ${deg}° (saw ${JSON.stringify([...new Set(onSlope.map((p) => p.slope.toFixed(2)))])})`);
    if (trace.some((p) => p.mode !== 'grounded' || p.blocked) || onSlope.some((p) => Math.abs(p.speed - 7) > 1e-6)) fail(`${deg}° lane: a walkable slope is climbed on the ground, at 7 per second on the horizontal`);
    if (!(last.x > topOf(deg)) || Math.abs(last.z - RAMP.height) > 1e-4) fail(`${deg}° lane: the character should reach the platform, 2.4 high (ended at x ${last.x.toFixed(2)}, z ${last.z.toFixed(3)})`);
    climbed[deg] = onSlope.length;
  }
  // On the platform, 2.4 above the ground, the character is still at the centre of the screen.
  await held({ speed: 0, mode: 'grounded' }, 'standing on the platform');
  if (!onCharacter(await centre())) fail('standing on the platform the character should be at the centre of the screen');
  // Off the far end: a fall of 2.4 (0.499 s), then the ground.
  const beforeDrop = await camera();
  await page.keyboard.down('KeyW');
  const dropped = await page.waitForFunction(([f, endX]) => { const c = window.__orvalisEngine.getCamera(); return c.flights > f && c.mode === 'grounded' && c.position[0] > endX ? c : null; }, [beforeDrop.flights, RAMP.endX], { timeout: 10000 }).then((h) => h.jsonValue(), () => null);
  await page.keyboard.up('KeyW');
  if (!dropped) fail('walking off the far end of the platform the character should fall and land');
  else if (dropped.position[2] !== 0 || Math.abs(dropped.airSeconds - 0.5) > 1e-6 || dropped.jumped || dropped.respawns !== beforeDrop.respawns) fail(`the drop from the platform should last 30 steps (0.5 s) and end on the ground (got ${JSON.stringify({ z: dropped.position[2], air: dropped.airSeconds, jumped: dropped.jumped })})`);
  // 55°: too steep. The character stays at the foot of the slope, and the overlay says why.
  const steep = await climb(55, topOf(55) + 1), stuck = steep[steep.length - 1];
  // (Since P8.4 the collision capsule meets the slope a little before the feet do.)
  // (Read from the sample taken while W was still held: once released, nothing is « touching » any more.)
  if (!(stuck.blocked || stuck.touching) || stuck.z !== 0 || stuck.x > RAMP.startX + 1e-6 || stuck.speed !== 0) fail(`55° lane: the character should be stopped at the foot of the slope (got ${JSON.stringify(stuck)})`);
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => document.getElementById('debug-overlay').textContent.split('\n').some((l) => l.startsWith('Movement: at ') && (l.includes('TOO STEEP ahead') || l.includes('AGAINST AN OBSTACLE'))), null, { timeout: 5000 }).catch(() => fail('overlay should show « TOO STEEP ahead » or « AGAINST AN OBSTACLE »'));
  await page.keyboard.up('KeyW');
  // Inside the cottage the feet are on its floor, 0.02 above the ground outside.
  await page.evaluate(() => window.__orvalisEngine.setCharacterPosition([0, -1, 0.1]));
  await page.keyboard.press('KeyQ');
  await page.waitForFunction(() => { const c = window.__orvalisEngine.getCamera(); return c.position[2] !== 0.1 && c.mode === 'grounded' && c.speed === 0; }, null, { timeout: 5000 }).catch(() => fail('inside the cottage: the first step should put the feet on the floor'));
  const indoors = await camera();
  if (Math.abs(indoors.position[2] - 0.02) > 1e-6) fail(`inside the cottage the feet should be on its floor at 0.02 (got ${indoors.position[2]})`);
  await page.evaluate(() => window.__orvalisEngine.setCharacterPosition([0, -8, 0]));
  seen.push(`ground: 30° / 45° / 50° lanes climbed on the slope (${climbed[30]}, ${climbed[45]}, ${climbed[50]} samples) to the platform at 2.4 · drop off the end ${dropped ? dropped.airSeconds.toFixed(2) : '?'} s · 55° refused at x ${stuck.x.toFixed(2)} · cottage floor at ${indoors.position[2].toFixed(2)}`);
  // 11. Collision (P8.4): the capsule (radius 1/3, kept a skin of 0.02 away) against the buildings.
  const REACH = 1 / 3 + 0.02, FRONT = -3;
  await page.evaluate(() => { const c = window.__orvalisEngine.getCamera(); window.__orvalisEngine.cameraDrag(((0 - c.yaw) * 800) / 180, 0); });
  await page.mouse.move(600, 300);
  await page.mouse.down({ button: 'right' });
  await held({ characterYaw: 0, mouseMode: 'steer' }, 'facing north');
  await page.mouse.up({ button: 'right' });
  await held({ mouseMode: 'none' }, 'right button released (north)');
  // Straight into the front wall, west of the door: stopped radius + skin outside it.
  await page.evaluate(() => window.__orvalisEngine.setCharacterPosition([-2.5, -6, 0]));
  await page.keyboard.down('KeyW');
  const atWall = await page.waitForFunction(() => { const c = window.__orvalisEngine.getCamera(); return c.touching && c.speed === 0 ? c : null; }, null, { timeout: 10000 }).then((h) => h.jsonValue(), () => null);
  if (!atWall) fail('walking into the cottage wall the character should be stopped');
  else if (Math.abs(atWall.position[1] - (FRONT - REACH)) > 1e-4 || Math.abs(atWall.position[0] + 2.5) > 1e-6 || atWall.animation === 'run') fail(`the wall should stop the character ${REACH.toFixed(3)} outside it, standing (got ${JSON.stringify({ p: atWall.position, animation: atWall.animation })})`);
  await page.waitForFunction(() => document.getElementById('debug-overlay').textContent.split('\n').some((l) => l.startsWith('Movement: at ') && l.includes('AGAINST AN OBSTACLE')), null, { timeout: 5000 }).catch(() => fail('overlay should show « AGAINST AN OBSTACLE »'));
  if (!onCharacter(await centre())) fail('against the wall the character should still be at the centre of the screen');
  // W + Q: a diagonal into the wall. The character SLIDES west along it, at 7 × cos 45°, without entering it.
  //     (From just west of the door, so that the whole wall — 2.5 long — is ahead; samples stop before its corner.)
  await page.evaluate(() => window.__orvalisEngine.setCharacterPosition([-1, -3.4, 0]));
  await page.keyboard.down('KeyQ');
  const sliding = await page.evaluate(async () => {
    const e = window.__orvalisEngine, out = [];
    for (let k = 0; k < 200; k++) {
      await new Promise((r) => requestAnimationFrame(r));
      const c = e.getCamera();
      if (c.position[0] < -3.5) break;
      if (c.position[0] < -1.2) out.push({ x: c.position[0], y: c.position[1], speed: c.speed, touching: c.touching });
    }
    return out;
  });
  await page.keyboard.up('KeyQ');
  await page.keyboard.up('KeyW');
  const lastSlide = sliding[sliding.length - 1] ?? { x: 0, y: 0, speed: 0, touching: false };
  if (sliding.length < 3) fail(`W + Q against the wall: the slide should be seen (${sliding.length} samples)`);
  if (sliding.some((p) => Math.abs(p.y - (FRONT - REACH)) > 1e-4 || !p.touching || Math.abs(p.speed - 7 * Math.SQRT1_2) > 1e-3)) fail(`W + Q against the wall: the character should slide along it at ${(7 * Math.SQRT1_2).toFixed(3)} (saw ${JSON.stringify(lastSlide)})`);
  if (!(lastSlide.x < -2)) fail(`sliding along the wall the character should have moved west (x ${lastSlide.x})`);
  // Through the door (1.2 wide), then the back wall stops it inside.
  await page.evaluate(() => window.__orvalisEngine.setCharacterPosition([0, -5, 0]));
  await page.keyboard.down('KeyW');
  const inside = await page.waitForFunction(() => { const c = window.__orvalisEngine.getCamera(); return c.position[1] > 0 && c.touching && c.speed === 0 ? c : null; }, null, { timeout: 10000 }).then((h) => h.jsonValue(), () => null);
  await page.keyboard.up('KeyW');
  if (!inside) fail('the character should walk through the door and be stopped by the back wall');
  else if (Math.abs(inside.position[1] - (3 - 0.3 - REACH)) > 1e-3 || Math.abs(inside.position[0]) > 1e-6 || Math.abs(inside.position[2] - 0.02) > 1e-6) fail(`inside, the back wall should stop the character at y ${(2.7 - REACH).toFixed(3)} on the floor (got ${JSON.stringify(inside.position)})`);
  // The ramps can no longer be entered from behind.
  await page.evaluate(() => window.__orvalisEngine.setCharacterPosition([26, -20.5, 0]));
  await page.evaluate(() => { const c = window.__orvalisEngine.getCamera(); window.__orvalisEngine.cameraDrag(((270 - c.yaw) * 800) / 180, 0); });
  await page.mouse.down({ button: 'right' });
  await held({ characterYaw: 270, mouseMode: 'steer' }, 'facing west');
  await page.mouse.up({ button: 'right' });
  await page.evaluate(() => window.__orvalisEngine.setCharacterPosition([26, -20.5, 0]));
  await page.keyboard.down('KeyW');
  const behind = await page.waitForFunction(() => { const c = window.__orvalisEngine.getCamera(); return c.touching && c.speed === 0 ? c : null; }, null, { timeout: 10000 }).then((h) => h.jsonValue(), () => null);
  await page.keyboard.up('KeyW');
  if (!behind || Math.abs(behind.position[0] - (24 + REACH)) > 1e-4) fail(`the back of the ramps should stop the character at x ${(24 + REACH).toFixed(3)} (got ${behind ? behind.position[0] : 'nothing'})`);
  await page.evaluate(() => window.__orvalisEngine.setCharacterPosition([0, -8, 0]));
  seen.push(`collision: wall stops the character at y ${atWall ? atWall.position[1].toFixed(3) : '?'} · W + Q slides along it at ${lastSlide.speed.toFixed(2)} · through the door, back wall at y ${inside ? inside.position[1].toFixed(3) : '?'} · back of the ramps at x ${behind ? behind.position[0].toFixed(3) : '?'}`);
  // 12. Automatic step-up (P8.5): north-east of the cottage, met walking east from x = 12 — a staircase (four steps
  //     0.5 high, 0.8 deep, up to 2.0), a block exactly 1.0 high (climbed) and a block 1.2 high (a wall).
  await page.evaluate(() => { const c = window.__orvalisEngine.getCamera(); window.__orvalisEngine.cameraDrag(((90 - c.yaw) * 800) / 180, 0); });
  await page.mouse.move(600, 300);
  await page.mouse.down({ button: 'right' });
  await held({ characterYaw: 90, mouseMode: 'steer' }, 'facing east (steps)');
  await page.mouse.up({ button: 'right' });
  await held({ mouseMode: 'none' }, 'right button released (steps)');
  const stepPixel = await at([16, 11.5, 2]);
  if (near(stepPixel, CLEAR, 6) || near(stepPixel, ground, 8)) fail(`the test steps should be drawn (got rgb(${stepPixel}) on the stair's platform; ground rgb(${ground}))`);
  const walkEast = async (y, untilX) => {
    const before = await camera();
    await page.evaluate((p) => window.__orvalisEngine.setCharacterPosition(p), [11, y, 0]);
    await page.keyboard.down('KeyW');
    const trace = await page.evaluate(async (stopAt) => {
      const e = window.__orvalisEngine, samples = [];
      for (let k = 0; k < 400; k++) {
        await new Promise((r) => requestAnimationFrame(r));
        const c = e.getCamera();
        samples.push({ x: c.position[0], z: c.position[2], speed: c.speed, mode: c.mode, animation: c.animation, touching: c.touching });
        if (c.position[0] >= stopAt || (k > 60 && c.speed === 0)) break;
      }
      return samples;
    }, untilX);
    await page.keyboard.up('KeyW');
    const after = await camera();
    return { trace, last: trace[trace.length - 1], stepUps: after.stepUps - before.stepUps, flights: after.flights - before.flights };
  };
  const stair = await walkEast(11.5, 16.5);
  const moving = stair.trace.filter((p) => p.x > 11.2);
  if (moving.some((p) => Math.abs(p.speed - 7) > 1e-6 || p.mode !== 'grounded' || p.animation !== 'run')) fail(`the staircase should be climbed on the ground, running, at 7 per second all the way (saw ${JSON.stringify(moving.find((p) => Math.abs(p.speed - 7) > 1e-6 || p.mode !== 'grounded' || p.animation !== 'run'))})`);
  if (moving.some((p) => Math.abs(p.z - (p.x < 12 ? 0 : 0.5 * Math.min(4, Math.floor((p.x - 12) / 0.8 + 1e-6) + 1))) > 1e-5)) fail('on the staircase the feet should be on the step under them at every sample');
  if (stair.stepUps !== 4 || stair.flights !== 0 || Math.abs(stair.last.z - 2) > 1e-5) fail(`the staircase: 4 step-ups to the platform at 2.0 (got ${JSON.stringify({ stepUps: stair.stepUps, flights: stair.flights, z: stair.last.z })})`);
  await held({ speed: 0, mode: 'grounded' }, 'standing on the stair platform');
  if (!onCharacter(await centre())) fail('on top of the staircase the character should be at the centre of the screen');
  const block = await walkEast(15.5, 13);
  if (block.stepUps !== 1 || Math.abs(block.last.z - 1) > 1e-5) fail(`the block exactly 1.0 high should be climbed in one step-up (got ${JSON.stringify({ stepUps: block.stepUps, z: block.last.z })})`);
  const tall = await walkEast(19.5, 13);
  if (tall.stepUps !== 0 || tall.last.z !== 0 || Math.abs(tall.last.x - (12 - REACH)) > 1e-4 || !tall.last.touching) fail(`the block 1.2 high should stop the character at x ${(12 - REACH).toFixed(3)} (got ${JSON.stringify(tall.last)})`);
  await page.waitForFunction(() => document.getElementById('debug-overlay').textContent.split('\n').some((l) => l.startsWith('Movement: at ') && / step-ups?\)/.test(l)), null, { timeout: 5000 }).catch(() => fail('overlay should show the number of step-ups'));
  await page.evaluate(() => window.__orvalisEngine.setCharacterPosition([0, -8, 0]));
  seen.push(`step-up: staircase climbed in ${stair.stepUps} step-ups at 7 per second (${moving.length} samples, all on their step) · block 1.0 climbed · block 1.2 stops at x ${tall.last.x.toFixed(3)}`);
  // 13. Swimming (P8.6): the pool south-west of the cottage — a pit 3 deep (x −36 → −23.5, y −36 → −23.5), water
  //     up to −0.25, a 30° slope down from its east edge. Swims where the water over the feet is > 0.75 × 2.0277777.
  const POOL = { x0: -36, x1: -23.5, midY: -29.75, level: -0.25 }, ENTER = 0.75 * 2.0277777, TAN30 = Math.tan(30 * RAD8);
  const swimX = POOL.x1 - (ENTER - POOL.level) / TAN30;
  const faceLevel = async (yaw, what) => {
    await page.evaluate((y) => { const c = window.__orvalisEngine.getCamera(); window.__orvalisEngine.cameraDrag(((y - c.yaw) * 800) / 180, ((0 - c.pitch) * 600) / 90); }, yaw);
    await page.mouse.move(600, 300);
    await page.mouse.down({ button: 'right' });
    await held({ characterYaw: yaw, mouseMode: 'steer' }, what);
    await page.mouse.up({ button: 'right' });
    await held({ mouseMode: 'none' }, `${what} (released)`);
  };
  await page.evaluate(() => window.__orvalisEngine.setCharacterPosition([-21.5, -29.75, 0]));
  await faceLevel(270, 'facing west, towards the pool');
  // The water is drawn: seen from above, a point in the middle of the pool is neither ground nor background.
  await page.evaluate(() => { const c = window.__orvalisEngine.getCamera(); window.__orvalisEngine.cameraDrag(0, ((50 - c.pitch) * 600) / 90); });
  // (Two frames: the point is projected with the matrices of the last frame DRAWN, which must be one at this pitch.)
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const waterPixel = await at([-27, POOL.midY, POOL.level]);
  if (near(waterPixel, CLEAR, 6) || near(waterPixel, ground, 8)) fail(`the pool's water should be drawn (got rgb(${waterPixel}); ground rgb(${ground}))`);
  await page.evaluate(() => { const c = window.__orvalisEngine.getCamera(); window.__orvalisEngine.cameraDrag(0, ((0 - c.pitch) * 600) / 90); });
  await page.keyboard.down('KeyW');
  const walkIn = await page.evaluate(async () => {
    const e = window.__orvalisEngine, samples = [];
    for (let k = 0; k < 600; k++) {
      await new Promise((r) => requestAnimationFrame(r));
      const c = e.getCamera();
      samples.push({ x: c.position[0], z: c.position[2], mode: c.mode, speed: c.speed, depth: c.waterDepth, touching: c.touching });
      if (c.mode === 'swimming' && c.touching && c.speed === 0) break;
    }
    return samples;
  });
  await page.keyboard.up('KeyW');
  const walked = walkIn.filter((p) => p.mode === 'grounded'), swum = walkIn.filter((p) => p.mode === 'swimming'), farSide = walkIn[walkIn.length - 1];
  if (walked.length === 0 || swum.length < 3) fail(`walking into the pool the character should walk, then swim (${walked.length} / ${swum.length} samples)`);
  if (walked.some((p) => p.x < swimX - 7 / 60 - 1e-6) || swum.some((p) => p.x > swimX + 1e-6)) fail(`the character should start to swim where the water is ${ENTER.toFixed(3)} over its feet, at x ${swimX.toFixed(3)} (walking down to x ${Math.min(...walked.map((p) => p.x)).toFixed(3)}, swimming from x ${Math.max(...swum.map((p) => p.x)).toFixed(3)})`);
  if (walked.some((p) => p.x < POOL.x1 && Math.abs(p.z - (p.x - POOL.x1) * TAN30) > 1e-3)) fail('walking down into the pool the feet should be on its slope');
  if (swum.slice(1, -3).some((p) => Math.abs(p.speed - 4.722222) > 1e-5)) fail(`swimming forward should be at 4.722222 (saw ${JSON.stringify(swum.slice(1, -3).find((p) => Math.abs(p.speed - 4.722222) > 1e-5))})`);
  if (swum.some((p) => p.z > POOL.level - ENTER + 1e-6 || p.z < POOL.level - ENTER - 0.07)) fail('the swimmer should stay just under the surface line, off the bottom');
  if (Math.abs(farSide.x - (POOL.x0 + REACH)) > 1e-3) fail(`the pool's far wall should stop the swimmer at x ${(POOL.x0 + REACH).toFixed(3)} (got ${farSide.x})`);
  await page.waitForFunction(() => document.getElementById('debug-overlay').textContent.split('\n').some((l) => l.startsWith('Movement: at ') && l.includes('SWIMMING') && l.includes('(swims above 1.52)')), null, { timeout: 5000 }).catch(() => fail('overlay should show « SWIMMING … (swims above 1.52) »'));
  // No gravity: doing nothing, the swimmer stays where it is.
  const floating = await camera();
  await page.waitForFunction((from) => window.__orvalisEngine.getCamera().simulatedMs >= from + 500, floating.simulatedMs, { timeout: 5000 });
  const stillFloating = await camera();
  if (stillFloating.mode !== 'swimming' || stillFloating.position[2] !== floating.position[2]) fail(`a swimmer who does nothing should not sink (z ${floating.position[2]} → ${stillFloating.position[2]}, ${stillFloating.mode})`);
  // Space under the line swims up to it; at the line it is the jump out of the water: 9.096748 → 2.145 high.
  await page.evaluate(() => window.__orvalisEngine.setCharacterPosition([-32, -29.75, -2.5]));
  await page.keyboard.down('Space');
  const hop = await page.evaluate(async () => {
    const e = window.__orvalisEngine, start = e.getCamera().flights;
    let rose = false;
    for (let k = 0; k < 900; k++) {
      await new Promise((r) => requestAnimationFrame(r));
      const c = e.getCamera();
      if (c.mode === 'swimming' && c.verticalSpeed > 4.7) rose = true;
      if (c.flights > start && c.mode === 'swimming') return { rose, end: c };
    }
    return { rose, end: e.getCamera() };
  });
  await page.keyboard.up('Space');
  if (!hop.rose) fail('Space under the surface should swim up at 4.722222');
  if (!hop.end.jumped || Math.abs(hop.end.apex - 9.096748 ** 2 / (2 * 19.291105)) > 3e-3) fail(`Space at the surface should be the jump out of the water, 2.145 high (got ${JSON.stringify({ jumped: hop.end.jumped, apex: hop.end.apex })})`);
  await page.waitForFunction(() => window.__orvalisEngine.getCamera().mode === 'swimming', null, { timeout: 5000 }).catch(() => fail('after the hop the character should be swimming again'));
  // Looking down with the right button held, forward dives to the bottom (−3).
  await page.evaluate(() => window.__orvalisEngine.setCharacterPosition([-30, -29.75, -1.8]));
  await page.evaluate(() => { const c = window.__orvalisEngine.getCamera(); window.__orvalisEngine.cameraDrag(0, ((60 - c.pitch) * 600) / 90); });
  await page.mouse.move(600, 300);
  await page.mouse.down({ button: 'right' });
  await page.mouse.down({ button: 'left' }); // both buttons: forward
  const dive = await page.waitForFunction(() => { const c = window.__orvalisEngine.getCamera(); return c.mode === 'swimming' && c.verticalSpeed < -4 ? c : null; }, null, { timeout: 5000, polling: 'raf' }).then((h) => h.jsonValue(), () => null);
  if (!dive || Math.abs(dive.verticalSpeed + 4.722222 * Math.sin(60 * RAD8)) > 1e-4) fail(`looking 60° down, forward should dive at ${(4.722222 * Math.sin(60 * RAD8)).toFixed(3)} per second (got ${dive ? dive.verticalSpeed : 'nothing'})`);
  await page.waitForFunction(() => window.__orvalisEngine.getCamera().position[2] === -3, null, { timeout: 5000 }).catch(() => fail('the dive should end on the bottom of the pool, at −3'));
  await page.mouse.up({ button: 'left' });
  await page.mouse.up({ button: 'right' });
  // Back out by the slope: swims east, stands up where the water is shallow, walks onto the ground.
  await page.evaluate(() => window.__orvalisEngine.setCharacterPosition([-31, -29.75, -1.8]));
  await faceLevel(90, 'facing east, out of the pool');
  await page.keyboard.down('KeyW');
  const out2 = await page.evaluate(async (edge) => {
    const e = window.__orvalisEngine, modes = [];
    for (let k = 0; k < 900; k++) {
      await new Promise((r) => requestAnimationFrame(r));
      const c = e.getCamera();
      if (modes[modes.length - 1] !== c.mode) modes.push(c.mode);
      if (c.position[0] > edge + 1) return { modes, end: c };
    }
    return { modes, end: e.getCamera() };
  }, POOL.x1);
  await page.keyboard.up('KeyW');
  if (out2.modes.join(' ') !== 'swimming grounded' || out2.end.position[2] !== 0 || Math.abs(out2.end.speed - 7) > 1e-6) fail(`swimming to the slope the character should stand up once and walk out at 7 (got ${JSON.stringify({ modes: out2.modes, z: out2.end.position[2], speed: out2.end.speed })})`);
  await held({ speed: 0, mode: 'grounded' }, 'out of the pool');
  await page.evaluate(() => window.__orvalisEngine.setCharacterPosition([0, -8, 0]));
  seen.push(`swimming: walks down the slope, swims from x ${swum.length ? Math.max(...swum.map((p) => p.x)).toFixed(2) : '?'} (line at ${swimX.toFixed(2)}) at 4.72, far wall at x ${farSide.x.toFixed(2)} · floats · Space: up, then the hop out (${hop.end.apex.toFixed(2)} high) · dives at ${dive ? dive.verticalSpeed.toFixed(2) : '?'} to the bottom · out by the slope: ${out2.modes.join(' → ')}`);
  out.camera = { ground, body: body.pixel };
  await page.close();
  seen.push(`zoom: wheel back → 15 (seen at ${onTheWay === null ? '?' : onTheWay.toFixed(2)} on the way), character ${(sizeAt8 * 100).toFixed(1)} % → ${(sizeAt15 * 100).toFixed(1)} % of the screen · wheel forward → 0: first person, character hidden · back to 1: opacity ${(wantAlpha * 100).toFixed(0)} %`);
  seen.push(`start yaw 0 pitch 20, character rgb(${body.pixel}) at the centre (${body.hits}/9 pixels) · drag (+200, +60) → yaw 45 pitch 29 · clamps at +89 and −89 · yaw wraps to 315 · yaw 270: ${south.hits}/9 pixels on the character`);
  console.log(`smoke: [${label}] camera on ${NAMES[renderer]} → ${seen.join(' · ')}`);
  return out;
}

async function checkModel(browser, label, renderer, part = 'all') {
  const wants = (name) => part === 'all' || part === name;
  const NAMES = { webgpu: 'WebGPU', webgl2: 'WebGL2' };
  const W = 1280, H = 720, RAD = Math.PI / 180;
  const fail = (msg) => problems.push(`[${label} model ${renderer}] ${msg}`);
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  // Same placement as the scene: looks at the middle of the tree (0, 0, 3.5), from `reach` / tan(30°) / zoom away.
  const RADIUS = Math.hypot(0.45, 3.5);
  const cameraOf = (pitch, heading, reachFactor = 1.35, zoom = 1) => {
    const p = pitch * RAD, h = heading * RAD, distance = (reachFactor * RADIUS) / Math.tan(Math.PI / 6) / zoom;
    const forward = [Math.cos(p) * Math.sin(h), Math.cos(p) * Math.cos(h), -Math.sin(p)];
    const right = [Math.cos(h), -Math.sin(h), 0];
    const up = [right[1] * forward[2] - right[2] * forward[1], right[2] * forward[0] - right[0] * forward[2], right[0] * forward[1] - right[1] * forward[0]];
    const eye = [-forward[0] * distance, -forward[1] * distance, 3.5 - forward[2] * distance];
    const tanY = Math.tan(Math.PI / 6), tanX = tanY * (W / H);
    return { screen: (point) => { const d = point.map((v, k) => v - eye[k]), f = dot(d, forward); return [(dot(d, right) / (f * tanX) + 1) / 2, (1 - dot(d, up) / (f * tanY)) / 2]; } };
  };
  const open = async (q) => {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on('console', (m) => {
      if (m.type() === 'warning' && m.text().includes('GPU stall due to ReadPixels')) return;
      if (m.type() === 'error' || m.type() === 'warning') fail(`console.${m.type()}: ${m.text()}`);
    });
    page.on('pageerror', (e) => fail(`pageerror: ${e.message}`));
    await page.goto(`${BASE_URL}?engine=new&renderer=${renderer}&scene=model&textures=solid&${q}`, { waitUntil: 'load' });
    await page.waitForSelector('#boot-status[data-state="ready"]', { state: 'attached', timeout: 30000 }).catch(() => fail('engine never became ready'));
    return page;
  };
  const probe = async (page, points) => {
    const r = await page.evaluate((pts) => window.__orvalisEngine.probe(pts), points);
    for (const e of r.errors) fail(`GPU error: ${e}`);
    return r.pixels.map((p) => p.slice(0, 3));
  };
  const out = {}, seen = [];
  // Points of the tree, seen from the west (heading 90 = looking east), level with its middle.
  const side = cameraOf(0, 90);
  const TRUNK = [-0.4, 0, 1], LOWER = [-1.286, 0, 3.2], EDGE = [-0.7, 0, 5.5], TIP = [-0.02, 0, 6.95];

  // --- Bone indices (uint8 ×4 attribute): bits of (first index + 1) as r, g, b.
  if (wants('mesh')) {
    const page = await open('pitch=0&heading=90&modelDebug=bones');
    const lines = (await page.evaluate(() => document.getElementById('debug-overlay').textContent)).split('\n');
    const want = 'Models: 1 model · 1 instance(s) · 68 vertices · 44 triangles · view bones (M)';
    if (!lines.includes(want)) fail(`overlay line missing: "${want}" (got: ${lines.find((l) => l.startsWith('Models')) ?? 'none'})`);
    if (!lines.includes('Draw calls: 1') || !lines.includes('Triangles: 44')) fail('the tree should be 1 draw call and 44 triangles');
    const [trunk, lower, tip, corner] = await probe(page, [side.screen(TRUNK), side.screen(LOWER), side.screen(TIP), [0.02, 0.03]]);
    if (!near(trunk, [255, 0, 0], 1)) fail(`bones view, trunk (bone 0): expected rgb(255,0,0), got rgb(${trunk})`);
    if (!near(lower, [0, 255, 0], 1)) fail(`bones view, lower foliage (bone 1): expected rgb(0,255,0), got rgb(${lower})`);
    if (!(tip[0] > 200 && tip[1] > 250 && tip[2] < 3)) fail(`bones view, top (bone 2 → yellow at the tip): got rgb(${tip})`);
    if (!near(corner, BG, 1)) fail(`the background should be the clear colour, got rgb(${corner})`);
    out.bones = { trunk, lower, tip };
    seen.push(`bones: trunk rgb(${trunk}) lower rgb(${lower}) tip rgb(${tip})`);
    // M goes back to the lit view (bones → lit).
    await page.keyboard.press('KeyM');
    await page.waitForFunction(() => /view lit \(M\)$/m.test(document.getElementById('debug-overlay').textContent), null, { timeout: 5000 }).catch(() => fail('M should cycle to the lit view'));
    await page.close();
  }

  // --- Bone weights (unorm8 ×4 attribute) as r, g, b: 255/0 on the trunk; along an edge of the upper cone,
  // from 128/127 at its base to 255/0 at the tip — half-way: 191.5 / 63.5.
  if (wants('mesh')) {
    const page = await open('pitch=0&heading=90&modelDebug=weights');
    const [trunk, edge] = await probe(page, [side.screen(TRUNK), side.screen(EDGE)]);
    if (!near(trunk, [255, 0, 0], 1)) fail(`weights view, trunk: expected rgb(255,0,0), got rgb(${trunk})`);
    if (!near(edge, [192, 64, 0], 4)) fail(`weights view, half-way up the top cone: expected about rgb(192,64,0), got rgb(${edge})`);
    out.weights = { trunk, edge };
    seen.push(`weights: trunk rgb(${trunk}) mid top cone rgb(${edge})`);
    await page.close();
  }

  // --- Normals and light on the trunk, on the vertex column facing the camera: N = (−1, 0, 0.05) normalised.
  if (wants('mesh')) {
    const n = [-1, 0, 0.05].map((v) => v / Math.hypot(1, 0.05));
    const toLight = [-0.5 * Math.SQRT1_2, -0.5 * Math.SQRT1_2, Math.sqrt(3) / 2];
    const page = await open('pitch=0&heading=90&modelDebug=normals');
    const [asColour] = await probe(page, [side.screen(TRUNK)]);
    const wantNormal = n.map((v) => Math.round((v * 0.5 + 0.5) * 255));
    // The pixel centre can be up to half a pixel beside the vertex column; across this face the normal's y changes
    // by 0.033 per pixel, i.e. up to 2 levels of the green channel: hence a tolerance of 4.
    if (!near(asColour, wantNormal, 4)) fail(`normals view, trunk: expected rgb(${wantNormal}), got rgb(${asColour})`);
    await page.keyboard.press('KeyM'); // normals → weights
    await page.keyboard.press('KeyM'); // → bones
    await page.keyboard.press('KeyM'); // → lit
    await page.waitForFunction(() => /view lit \(M\)$/m.test(document.getElementById('debug-overlay').textContent), null, { timeout: 5000 }).catch(() => fail('three presses of M should reach the lit view'));
    const [lit] = await probe(page, [side.screen(TRUNK)]);
    const nDotL = Math.max(0, dot(n, toLight));
    const wantLit = [120, 80, 40].map((c, k) => Math.round(c * ([0.36, 0.39, 0.46][k] + [0.84, 0.8, 0.7][k] * nDotL)));
    if (!near(lit, wantLit, 3)) fail(`lit view, trunk: expected rgb(${wantLit}) (bark × per-vertex light), got rgb(${lit})`);
    out.trunk = { asColour, lit };
    seen.push(`trunk normal rgb(${asColour}) lit rgb(${lit}) (expected ${wantLit})`);
    await page.close();
  }

  // --- From underneath: the underside of the foliage faces away from the light → ambient only.
  if (wants('mesh')) {
    const under = cameraOf(-70, 90);
    const page = await open('pitch=-70&heading=90');
    const [cap] = await probe(page, [under.screen([-1.3, 0.2, 2.2])]);
    const want = [40, 120, 50].map((c, k) => Math.round(c * [0.36, 0.39, 0.46][k]));
    if (!near(cap, want, 2)) fail(`underside of the foliage: expected rgb(${want}) (leaves × ambient), got rgb(${cap})`);
    out.under = { cap };
    seen.push(`underside rgb(${cap}) (expected ${want})`);
    await page.close();
  }

  // --- Three instances of the same mesh: the second one is at (6, 2, 0), turned 40° and scaled 0.8.
  if (wants('mesh')) {
    const grove = cameraOf(20, 0, 3.2);
    const page = await open('models=grove&pitch=20&heading=0&modelDebug=bones');
    const lines = (await page.evaluate(() => document.getElementById('debug-overlay').textContent)).split('\n');
    if (!lines.includes('Models: 1 model · 3 instance(s) · 68 vertices · 132 triangles · view bones (M)')) fail(`grove overlay line wrong: ${lines.find((l) => l.startsWith('Models')) ?? 'none'}`);
    // Trunk of each tree, on the side facing the camera (the camera looks north: the −y side), at 1/3 of its height.
    const trunkOf = (x, y, scale) => grove.screen([x, y - 0.4 * scale, 1 * scale]);
    const foliageOf = (x, y, scale) => grove.screen([x, y - 1.286 * scale, 3.2 * scale]);
    const got = await probe(page, [trunkOf(0, 0, 1), trunkOf(6, 2, 0.8), trunkOf(-5, 3, 1.2), foliageOf(6, 2, 0.8), foliageOf(-5, 3, 1.2)]);
    got.slice(0, 3).forEach((p, i) => { if (!near(p, [255, 0, 0], 1)) fail(`grove, trunk of tree ${i}: expected rgb(255,0,0), got rgb(${p})`); });
    got.slice(3).forEach((p, i) => { if (!near(p, [0, 255, 0], 1)) fail(`grove, foliage of tree ${i + 1}: expected rgb(0,255,0), got rgb(${p})`); });
    out.grove = Object.fromEntries(got.map((p, i) => [`p${i}`, p]));
    seen.push('grove: 3 trunks and 2 foliages where their matrices put them');
    await page.close();
  }
  // --- P4.2 skeleton: the bones as lines, drawn over the model. The yellow links join the pivots; in the « bend »
  // pose the lower foliage leans 20° around +x and carries the top's pivot with it.
  if (wants('skeleton')) {
    const YELLOW = [255, 255, 0];
    // Around +x the tree leans towards −y; seen from the west (heading 90, looking east) −y is to the right.
    const cam = cameraOf(0, 90);
    const joint2 = (degrees) => [0, -1.8 * Math.sin(degrees * RAD), 2.2 + 1.8 * Math.cos(degrees * RAD)];
    const mid = (a, b) => a.map((v, k) => (v + b[k]) / 2);
    // A yellow pixel within 2 px of where the middle of a link projects.
    // With `record`, the 25 pixels also go to the WebGPU / WebGL2 comparison under that scenario name.
    const linkAt = async (page, point, record, name) => {
      const [fx, fy] = cam.screen(point);
      const px = Math.floor(fx * W), py = Math.floor(fy * H);
      const points = [];
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) points.push([(px + dx + 0.5) / W, (py + dy + 0.5) / H]);
      const pixels = await probe(page, points);
      if (record) out[record] = Object.fromEntries(pixels.map((p, k) => [`${name}-${k}`, p]).concat(Object.entries(out[record] ?? {})));
      return pixels.some((p) => near(p, YELLOW, 1));
    };
    const page = await open('pitch=0&heading=90&skeleton=on');
    const lines = (await page.evaluate(() => document.getElementById('debug-overlay').textContent)).split('\n');
    if (!lines.includes('Skeleton: 3 bones · lines on (N) · pose rest (J) · attached 0 (H)')) fail(`skeleton overlay line wrong: ${lines.find((l) => l.startsWith('Skeleton')) ?? 'none'}`);
    if (!lines.includes('Draw calls: 2')) fail('model + skeleton lines should be 2 draw calls');
    const restLink = mid([0, 0, 2.2], joint2(0)), bentLink = mid([0, 0, 2.2], joint2(20)), trunkLink = [0, 0, 1.1];
    if (!(await linkAt(page, trunkLink, 'skeleton-rest', 'trunk'))) fail('rest pose: the trunk link should be drawn over the trunk (lines are never hidden by the model)');
    if (!(await linkAt(page, restLink, 'skeleton-rest', 'upper'))) fail('rest pose: the link between the two foliage pivots should be vertical, on the axis');
    await page.keyboard.press('KeyJ');
    await page.waitForFunction(() => /pose bend \(J\)/m.test(document.getElementById('debug-overlay').textContent), null, { timeout: 5000 }).catch(() => fail('J should switch to the bend pose'));
    // Seen from the west, −y is to the right: the upper link has swung to the right of the axis.
    if (!(await linkAt(page, bentLink, 'skeleton-bend', 'upper'))) fail(`bend pose: the upper link should pass through ${bentLink.map((v) => v.toFixed(2))}`);
    if (cam.screen(bentLink)[0] <= cam.screen(restLink)[0] + 3 / W) fail('test set-up: the bent link should project clearly to the right of the rest one');
    if (!(await linkAt(page, trunkLink, 'skeleton-bend', 'trunk'))) fail('bend pose: the trunk link should not have moved');
    await page.keyboard.press('KeyN');
    await page.waitForFunction(() => /lines off \(N\)/m.test(document.getElementById('debug-overlay').textContent), null, { timeout: 5000 }).catch(() => fail('N should hide the skeleton'));
    if (await linkAt(page, trunkLink)) fail('skeleton hidden: no yellow link should remain');
    seen.push('skeleton: links on the pivots at rest, upper link swung 20° in the bend pose, N hides it');
    await page.close();
  }
  if (wants('skinning')) {
    // Bone matrices of the tree by hand: a turn around +x about a pivot on the z axis.
    const turnAbout = (pivotZ, degrees) => (p) => {
      const c = Math.cos(degrees * RAD), s = Math.sin(degrees * RAD), y = p[1], z = p[2] - pivotZ;
      return [p[0], y * c - z * s, pivotZ + y * s + z * c];
    };
    // Both foliage bones lean `d`: bone 1 turns about (0, 0, 2.2); bone 2 = bone 1 ∘ (turn about (0, 0, 4)).
    const bones = (d) => ({ lower: turnAbout(2.2, d), top: (p) => turnAbout(2.2, d)(turnAbout(4, d)(p)) });
    const mixOf = (weights, points) => points[0].map((_, k) => points.reduce((sum, p, i) => sum + p[k] * weights[i], 0));
    const cam = cameraOf(0, 90);
    const at = async (page, point) => (await probe(page, [cam.screen(point)]))[0];
    const BACKGROUND_AT = [0.02, 0.02];

    // 1. Positions. Seen from the west, in the bones view (flat colours), the top cone is the triangle
    //    A (0, −1.4, 4), B (0, 1.4, 4), tip (0, 0, 7). A and B are shared 128 / 127 between the two foliage bones.
    const skinnedTop = (d) => {
      const { lower, top } = bones(d);
      const shared = (p) => mixOf([128 / 255, 127 / 255], [lower(p), top(p)]);
      return { A: shared([0, -1.4, 4]), B: shared([0, 1.4, 4]), tip: top([0, 0, 7]) };
    };
    const inside = (t, wa, wb, wt) => mixOf([wa, wb, wt], [t.A, t.B, t.tip]);
    const rest = skinnedTop(0), bent = skinnedTop(20);
    let page = await open('pitch=0&heading=90&modelDebug=bones&pose=rest');
    const [background] = await probe(page, [BACKGROUND_AT]);
    const tipRest = await at(page, inside(rest, 0.1, 0.1, 0.8));
    if (near(tipRest, background, 3)) fail('rest: the top of the tree should be drawn near (0, 0, 6.4)');
    await page.close();
    page = await open('pitch=0&heading=90&modelDebug=bones&pose=bend');
    const tipBent = await at(page, inside(bent, 0.1, 0.1, 0.8));
    if (!near(tipBent, tipRest, 2)) fail(`bend: the top of the tree should be at its skinned place, with its own colour rgb(${tipRest}) (got rgb(${tipBent}))`);
    if (!near(await at(page, inside(rest, 0.1, 0.1, 0.8)), background, 2)) fail('bend: the top of the tree should have LEFT its rest place (the mesh does not follow the bones?)');
    // The corner A is where the 128 / 127 blend shows: just inside it there is foliage, just outside there is none.
    const cornerIn = await at(page, inside(bent, 0.84, 0.08, 0.08)), cornerOut = await at(page, inside(bent, 1.1, -0.05, -0.05));
    if (near(cornerIn, background, 3)) fail('bend: foliage expected just inside the blended corner of the top cone (weights 128 / 127)');
    if (!near(cornerOut, background, 2)) fail(`bend: nothing expected just outside the blended corner of the top cone (got rgb(${cornerOut}))`);
    const trunk = await at(page, [0, 0, 1]);
    if (!near(trunk, [255, 0, 0], 2)) fail(`bend: the trunk (bone 0, at rest) should not have moved (got rgb(${trunk}))`);
    out['skin-bend'] = { tip: tipBent, cornerIn, cornerOut, trunk };
    await page.close();

    // 2. Normals. From below, the underside of the lower foliage faces (0, 0, −1) at rest; in the bend pose bone 1
    //    turns it 20° → (0, sin 20°, −cos 20°), shown as colour n / 2 + 1 / 2.
    const below = cameraOf(-70, 90);
    const capPoint = [0, 1, 2.2];
    page = await open('pitch=-70&heading=90&modelDebug=normals&pose=bend');
    const want = [0, Math.sin(20 * RAD), -Math.cos(20 * RAD)].map((c) => Math.round((c * 0.5 + 0.5) * 255));
    const cap = (await probe(page, [below.screen(bones(20).lower(capPoint))]))[0];
    if (!near(cap, want, 3)) fail(`bend: the underside normal should have turned with its bone: expected rgb(${want}), got rgb(${cap})`);
    out['skin-normal'] = { cap };
    await page.close();

    // 3. Animated: frozen sway at 500 ms (10° lean, bob +0.15 on the top bone) — mesh and skeleton agree.
    page = await open('pitch=0&heading=90&modelDebug=bones&pose=sway&animTime=500');
    // Bone 2: turn about its pivot, THEN the bob translation, then its parent.
    const swayTip = turnAbout(2.2, 10)(turnAbout(4, 10)([0, 0, 6.4]).map((v, k) => v + (k === 2 ? 0.15 : 0)));
    const tipSway = await at(page, swayTip);
    if (!near(tipSway, tipRest, 2)) fail(`sway at 500 ms: the top should be at its skinned place (got rgb(${tipSway}))`);
    out['skin-sway'] = { tip: tipSway };
    await page.close();
    seen.push(`skinning: top moved to its skinned place rgb(${tipBent}), blended corner in rgb(${cornerIn}) / out rgb(${cornerOut}), underside normal rgb(${cap}) (expected ${want}), sway follows`);
  }
  if (wants('materials')) {
    // The material test card: nine swatches in front of a backdrop (see buildSwatchModel()). Texels and backdrop:
    const S = [200, 100, 50], D = [40, 60, 80], A = 128 / 255, CLEAR = [11, 14, 20];
    const centre = (geoset, half) => [-4.5 + (geoset - 1) + 0.45, 0, half === 'top' ? 1.5 : 0.5];
    const at = async (page, geoset, half) => {
      const point = await page.evaluate((p) => window.__orvalisEngine.projectModelPoint(p), centre(geoset, half));
      return (await probe(page, [point]))[0];
    };
    const expected = {
      1: { name: 'opaque', top: S, bottom: S },
      2: { name: 'alpha key (230 kept, 220 cut at 224)', top: S, bottom: D },
      3: { name: 'alpha', top: S.map((v, k) => v * A + D[k] * (1 - A)) },
      4: { name: 'no-alpha add', top: S.map((v, k) => Math.min(255, v + D[k])) },
      5: { name: 'add', top: S.map((v, k) => Math.min(255, v * A + D[k])) },
      6: { name: 'mod', top: S.map((v, k) => (v * D[k]) / 255) },
      7: { name: 'mod2x', top: S.map((v, k) => Math.min(255, (2 * v * D[k]) / 255)) },
      9: { name: 'two-sided', top: S },
    };
    let page = await open('model=swatches&pitch=0&heading=0');
    const front = {};
    for (const [geoset, want] of Object.entries(expected)) {
      for (const half of ['top', 'bottom']) {
        const got = await at(page, Number(geoset), half), target = (want[half] ?? want.top).map(Math.round);
        front[`${geoset}-${half}`] = got;
        if (!near(got, target, 2)) fail(`materials: swatch ${geoset} (${want.name}) ${half}: expected rgb(${target}), got rgb(${got})`);
      }
    }
    // Swatch 8 is the same opaque texel WITHOUT the unlit flag: the scene light changes its colour.
    const lit = await at(page, 8, 'top');
    front['8-top'] = lit;
    if (near(lit, S, 8) || near(lit, D, 8)) fail(`materials: the lit swatch should show the texel × light, neither the raw texel nor the backdrop (got rgb(${lit}))`);
    const drawCalls = await page.evaluate(() => Number(document.getElementById('boot-status').dataset.drawCalls));
    if (drawCalls !== 10) fail(`materials: expected 10 draw calls (backdrop + 9 swatches), got ${drawCalls}`);
    out['materials-front'] = front;
    await page.close();

    // From behind: only the two-sided swatch is still there (the others, and the backdrop, are culled).
    page = await open('model=swatches&pitch=0&heading=180');
    const behindTwoSided = await at(page, 9, 'top'), behindOpaque = await at(page, 1, 'top');
    if (!near(behindTwoSided, S, 2)) fail(`materials: the two-sided swatch should be visible from behind (got rgb(${behindTwoSided}))`);
    if (!near(behindOpaque, CLEAR, 2)) fail(`materials: a one-sided swatch should be culled from behind (got rgb(${behindOpaque}))`);
    out['materials-behind'] = { twoSided: behindTwoSided, opaque: behindOpaque };
    await page.close();

    // Geosets 3 and 5 hidden: the backdrop shows where they were; their neighbour is untouched.
    page = await open('model=swatches&pitch=0&heading=0&hideGeosets=3,5');
    const hidden3 = await at(page, 3, 'top'), hidden5 = await at(page, 5, 'top'), kept4 = await at(page, 4, 'top');
    if (!near(hidden3, D, 2) || !near(hidden5, D, 2)) fail(`materials: hidden geosets 3 and 5 should leave the backdrop visible (got rgb(${hidden3}), rgb(${hidden5}))`);
    if (!near(kept4, expected[4].top, 2)) fail(`materials: geoset 4 should still be drawn (got rgb(${kept4}))`);
    out['materials-hidden'] = { hidden3, hidden5, kept4 };
    await page.close();
    seen.push(`materials: opaque rgb(${front['1-top']}) · key rgb(${front['2-top']}) / cut rgb(${front['2-bottom']}) · alpha rgb(${front['3-top']}) · no-alpha add rgb(${front['4-top']}) · add rgb(${front['5-top']}) · mod rgb(${front['6-top']}) · mod2x rgb(${front['7-top']}) · lit rgb(${lit}) · two-sided from behind · geosets hidden`);
  }
  if (wants('attach')) {
    // An ornament (a 1.2 × 1.2 card on a spherical billboard bone) hangs on the tree's « top » socket (0, 0, 7.3).
    const GOLD = [255, 220, 80], SOCKET = [0, 0, 7.3], CLEAR = [11, 14, 20];
    const turn = (p, pivotZ, degrees) => { const c = Math.cos(degrees * RAD), sn = Math.sin(degrees * RAD), z = p[2] - pivotZ; return [p[0], p[1] * c - z * sn, pivotZ + p[1] * sn + z * c]; };
    const axesOf = (pitch, heading) => {
      const p = pitch * RAD, h = heading * RAD;
      const forward = [Math.cos(p) * Math.sin(h), Math.cos(p) * Math.cos(h), -Math.sin(p)], right = [Math.cos(h), -Math.sin(h), 0];
      return { right, up: [right[1] * forward[2] - right[2] * forward[1], right[2] * forward[0] - right[0] * forward[2], right[0] * forward[1] - right[1] * forward[0]] };
    };
    const move = (p, d, k) => p.map((v, i) => v + d[i] * k);
    const at = async (page, point) => (await probe(page, [await page.evaluate((q) => window.__orvalisEngine.projectModelPoint(q), point)]))[0];
    // The card fills ±0.6 around its centre along the CAMERA's right and up, and nothing beyond.
    const facing = async (page, centre, pitch, heading, what, record) => {
      const { right, up } = axesOf(pitch, heading), pixels = {};
      for (const [name, point, inside] of [['centre', centre, true], ['right', move(centre, right, 0.45), true], ['left', move(centre, right, -0.45), true], ['up', move(centre, up, 0.45), true], ['down', move(centre, up, -0.45), true], ['beyond-right', move(centre, right, 0.8), false], ['beyond-up', move(centre, up, 0.8), false]]) {
        const got = await at(page, point);
        pixels[name] = got;
        if (near(got, GOLD, 2) !== inside) fail(`attach, ${what}: ${name} of the card should ${inside ? 'be' : 'NOT be'} rgb(${GOLD}) (got rgb(${got}))`);
      }
      out[record] = pixels;
    };
    // From the west a card that did not turn would be seen edge-on.
    let page = await open('attach=on&pitch=20&heading=90');
    if (!(await page.evaluate(() => document.getElementById('debug-overlay').textContent)).includes('attached 1 (H)')) fail('attach: the overlay should say « attached 1 (H) »');
    await facing(page, SOCKET, 20, 90, 'seen from the west', 'attach-west');
    const drawCalls = await page.evaluate(() => Number(document.getElementById('boot-status').dataset.drawCalls));
    if (drawCalls !== 2) fail(`attach: expected 2 draw calls (tree + ornament), got ${drawCalls}`);
    // H removes it.
    await page.keyboard.press('KeyH');
    await page.waitForFunction(() => document.getElementById('boot-status').dataset.drawCalls === '1', null, { timeout: 5000 }).catch(() => fail('attach: H should remove the ornament (1 draw call)'));
    if (near(await at(page, SOCKET), GOLD, 2)) fail('attach: no ornament should remain after H');
    await page.close();
    // (From above: seen from below, the foliage would hide the lower part of the card.)
    page = await open('attach=on&pitch=35&heading=200');
    await facing(page, SOCKET, 35, 200, 'seen from the north, from above', 'attach-north');
    await page.close();
    // Bent tree: the socket is carried by the top bone (20° about z = 4, then 20° about z = 2.2).
    page = await open('attach=on&pitch=20&heading=90&pose=bend');
    const carried = turn(turn(SOCKET, 4, 20), 2.2, 20);
    await facing(page, carried, 20, 90, 'on the bent tree', 'attach-bend');
    const left = await at(page, SOCKET);
    if (!near(left, CLEAR, 2)) fail(`attach, bent tree: the ornament should have left the rest position of the socket (got rgb(${left}))`);
    await page.close();
    seen.push('attach: ornament on the top socket, facing the camera from the west and from the north, carried by the bent tree, H removes it');
  }
  if (wants('particles')) {
    // The « jet » emitter has no randomness: one particle every 0.1 s from the tip (0, 0, 7), along the top bone's
    // +z at 2 units per second, living 1 s, as flat squares of side 0.12 in rgb(255, 64, 32).
    const RED = [255, 64, 32], TIP = [0, 0, 7];
    const turn = (p, pivotZ, degrees) => { const c = Math.cos(degrees * RAD), sn = Math.sin(degrees * RAD), z = p[2] - pivotZ; return [p[0], p[1] * c - z * sn, pivotZ + p[1] * sn + z * c]; };
    const at = async (page, point) => (await probe(page, [await page.evaluate((q) => window.__orvalisEngine.projectModelPoint(q), point)]))[0];
    const along = (origin, direction, distance) => origin.map((v, k) => v + direction[k] * distance);
    // Checks the row of particles of ages `ages`: red on each, not red half-way between two neighbours.
    const row = async (page, origin, direction, ages, what, record) => {
      const pixels = {};
      for (const age of ages) {
        const on = await at(page, along(origin, direction, 2 * age)), between = await at(page, along(origin, direction, 2 * age + 0.1));
        pixels[`on-${age}`] = on;
        pixels[`between-${age}`] = between;
        if (!near(on, RED, 2)) fail(`particles, ${what}: a particle of age ${age} s expected ${(2 * age).toFixed(2)} from the tip (got rgb(${on}))`);
        if (near(between, RED, 2)) fail(`particles, ${what}: nothing expected between two particles, ${(2 * age + 0.1).toFixed(2)} from the tip`);
      }
      out[record] = pixels;
    };
    const AGES = [0.9, 0.7, 0.5, 0.3, 0.1];
    let page = await open('particles=jet&animTime=1000&pitch=0&heading=90');
    if (!(await page.evaluate(() => document.getElementById('debug-overlay').textContent)).includes('Particles: jet · 10 alive (G)')) fail('particles: the overlay should say « Particles: jet · 10 alive (G) »');
    await row(page, TIP, [0, 0, 1], AGES, 'at rest, 1000 ms', 'particles-rest');
    const drawCalls = await page.evaluate(() => Number(document.getElementById('boot-status').dataset.drawCalls));
    if (drawCalls !== 2) fail(`particles: expected 2 draw calls (tree + all its particles), got ${drawCalls}`);
    // 50 ms later every particle has moved up by 0.1: the gaps and the particles have swapped places.
    await page.evaluate(() => window.__orvalisEngine.stepModelAnimation(50));
    await row(page, TIP, [0, 0, 1], [0.85, 0.55, 0.25], 'at rest, 1050 ms', 'particles-moved');
    await page.close();
    // Bent tree: the jet starts from the skinned tip and leans with the top bone (40° in all).
    page = await open('particles=jet&animTime=1000&pitch=0&heading=90&pose=bend');
    await row(page, turn(turn(TIP, 4, 20), 2.2, 20), [0, -Math.sin(40 * RAD), Math.cos(40 * RAD)], AGES, 'bent tree', 'particles-bend');
    await page.close();
    // Sparkles, not frozen: particles appear by themselves; G turns them off.
    page = await open('particles=sparkles&pitch=10&heading=30');
    await page.waitForFunction(() => window.__orvalisEngine.getModelParticleCount() >= 30, null, { timeout: 8000 }).catch(() => fail('particles: the sparkles should reach 30 live particles by themselves'));
    await page.keyboard.press('KeyG');
    await page.waitForFunction(() => window.__orvalisEngine.getModelParticleCount() === 0 && document.getElementById('boot-status').dataset.drawCalls === '1', null, { timeout: 5000 }).catch(() => fail('particles: G should turn the sparkles off (no particle, 1 draw call)'));
    await page.close();
    seen.push('particles: jet row at 0.2 spacing from the tip, moved by 0.1 after 50 ms, leaning 40° on the bent tree, sparkles run in real time, G stops them');
  }
  if (wants('ribbon')) {
    // The tree's ribbon: 0.5 high, rgb(64, 159, 255), 20 edges per second from the tip of the swaying tree.
    const BLUE = [64, 159, 255];
    // Tip of the tree `ms` into the sway (first second): both foliage bones lean 20° × ms / 1000 around +x and
    // the top bone bobs up by 0.3 × ms / 1000; the ribbon's axis is the top bone's +z (leaning twice that angle).
    const tipAt = (ms) => {
      const d = (20 * ms) / 1000, bob = (0.3 * ms) / 1000, c = Math.cos(d * RAD), sn = Math.sin(d * RAD);
      const turn = (p, pivotZ) => [p[0], p[1] * c - (p[2] - pivotZ) * sn, pivotZ + p[1] * sn + (p[2] - pivotZ) * c];
      const top = turn([0, 0, 7], 4);
      return { node: turn([top[0], top[1], top[2] + bob], 2.2), axis: [0, -Math.sin(2 * d * RAD), Math.cos(2 * d * RAD)] };
    };
    const at = async (page, point) => (await probe(page, [await page.evaluate((q) => window.__orvalisEngine.projectModelPoint(q), point)]))[0];
    let page = await open('ribbon=on&pose=sway&animTime=0&pitch=0&heading=90');
    // One step per edge interval: every edge is committed exactly where the tip is at that moment.
    await page.evaluate(() => { for (let k = 0; k < 20; k++) window.__orvalisEngine.stepModelAnimation(50); });
    const count = await page.evaluate(() => window.__orvalisEngine.getModelRibbonEdgeCount());
    if (count !== 20) fail(`ribbon: 20 edges expected after 20 steps of 50 ms (got ${count})`);
    const pixels = {};
    for (const ms of [250, 500, 750, 950]) {
      const { node, axis } = tipAt(ms), next = tipAt(ms + 50).node;
      const on = await at(page, node), middle = await at(page, node.map((v, k) => (v + next[k]) / 2)), above = await at(page, node.map((v, k) => v + axis[k] * 0.6));
      Object.assign(pixels, { [`on-${ms}`]: on, [`middle-${ms}`]: middle, [`above-${ms}`]: above });
      if (!near(on, BLUE, 2)) fail(`ribbon: the trail should pass where the tip was at ${ms} ms (got rgb(${on}))`);
      if (!near(middle, BLUE, 2)) fail(`ribbon: the trail should be continuous between the edges of ${ms} and ${ms + 50} ms (got rgb(${middle}))`);
      if (near(above, BLUE, 2)) fail(`ribbon: nothing expected 0.6 above the trail's middle at ${ms} ms (it is 0.25 high on each side)`);
    }
    out['ribbon-sway'] = pixels;
    if (!(await page.evaluate(() => document.getElementById('debug-overlay').textContent)).includes('Ribbon: 20 edges (R)')) fail('ribbon: the overlay should say « Ribbon: 20 edges (R) »');
    const drawCalls = await page.evaluate(() => Number(document.getElementById('boot-status').dataset.drawCalls));
    if (drawCalls !== 2) fail(`ribbon: expected 2 draw calls (tree + ribbon), got ${drawCalls}`);
    await page.keyboard.press('KeyR');
    await page.waitForFunction(() => document.getElementById('boot-status').dataset.drawCalls === '1', null, { timeout: 5000 }).catch(() => fail('ribbon: R should remove the ribbon (1 draw call)'));
    if (near(await at(page, tipAt(500).node), BLUE, 2)) fail('ribbon: no trail should remain after R');
    await page.close();
    // Not frozen: the trail grows by itself and settles at edgesPerSecond × lifetime = 30 edges.
    page = await open('ribbon=on&pose=sway&pitch=0&heading=90');
    await page.waitForFunction(() => window.__orvalisEngine.getModelRibbonEdgeCount() >= 25, null, { timeout: 8000 }).catch(() => fail('ribbon: the trail should reach 25 edges by itself'));
    const settled = await page.evaluate(() => window.__orvalisEngine.getModelRibbonEdgeCount());
    if (settled > 31) fail(`ribbon: never more than 31 edges (got ${settled})`);
    await page.close();
    seen.push('ribbon: trail through the tip positions of 250, 500, 750 and 950 ms, continuous, 0.5 high, R removes it, grows in real time');
  }
  if (wants('fade')) {
    // Five trees far away (layout « row »): the nearest point of their bounding sphere is 140, 162.5, 175, 187.5 and
    // 205 from the camera. The tree's radius puts it in the 150 → 200 class: fades 1, 0.75, 0.5, 0.25, 0.
    const WANT = [1, 0.75, 0.5, 0.25, 0];
    const page = await open('models=row');
    const fades = await page.evaluate(() => window.__orvalisEngine.getModelFades());
    if (fades?.length !== 5 || fades.some((f, k) => Math.abs(f.fade - WANT[k]) > 1e-4)) fail(`fade: expected fades ${WANT} (got ${JSON.stringify(fades?.map((f) => f.fade))})`);
    // A point on the axis of each tree, in the lower foliage above the trunk: seen level, the front of the cone covers it.
    const at = async (p, centre, dz) => (await probe(p, [await p.evaluate((q) => window.__orvalisEngine.projectWorldPoint(q), [centre[0], centre[1], centre[2] + dz])]))[0];
    const [background] = await probe(page, [[0.5, 0.05]]);
    const colours = [];
    for (const f of fades ?? []) colours.push(await at(page, f.center, 0.1));
    const drawCalls = await page.evaluate(() => Number(document.getElementById('boot-status').dataset.drawCalls));
    if (drawCalls !== 4) fail(`fade: expected 4 draw calls (the fifth tree is beyond its fade and skipped), got ${drawCalls}`);
    await page.close();
    // Reference: the same view with the fade off — every tree fully drawn. (Each tree is seen from a slightly
    // different side, so each has its own full colour.)
    const plain = await open('models=row&modelFade=off');
    const plainFades = await plain.evaluate(() => window.__orvalisEngine.getModelFades());
    const full = [];
    for (const f of plainFades ?? []) full.push(await at(plain, f.center, 0.1));
    if (plainFades?.some((f) => f.fade !== 1)) fail('fade off: every fade should be 1');
    full.forEach((got, k) => { if (near(got, background, 8)) fail(`fade off: tree ${k} should be fully drawn (got the background rgb(${got}))`); });
    await plain.close();
    colours.forEach((got, k) => {
      const want = full[k].map((c, i) => Math.round(c * WANT[k] + background[i] * (1 - WANT[k])));
      if (!near(got, want, 2)) fail(`fade: tree ${k} (fade ${WANT[k]}) expected rgb(${want}) = its full colour rgb(${full[k]}) × ${WANT[k]} + background × ${1 - WANT[k]}, got rgb(${got})`);
      // A fading tree must really differ from the fully drawn one.
      if (WANT[k] < 1 && near(got, full[k], 6)) fail(`fade: tree ${k} is not faded (rgb(${got}))`);
    });
    out['fade-row'] = Object.fromEntries(colours.map((c, k) => [`tree-${k}`, c]));
    out['fade-off'] = Object.fromEntries(full.map((c, k) => [`tree-${k}`, c]));
    seen.push(`fade: trees at 140 / 162.5 / 175 / 187.5 / 205 → rgb(${colours.join(') rgb(')}) against full rgb(${full.join(') rgb(')}), fifth not drawn`);
  }
  if (wants('character')) {
    // The mannequin: one body and optional sections switched by geoset. Each probe is a point of space that only
    // ONE section fills: present = something drawn there, absent = the background.
    const CLEAR = [11, 14, 20];
    const openCharacter = async (q) => {
      const page = await browser.newPage({ viewport: { width: W, height: H } });
      page.on('console', (m) => {
        // Same known message as in open(): caused by this test reading pixels back, not by the engine.
        if (m.type() === 'warning' && m.text().includes('GPU stall due to ReadPixels')) return;
        if (m.type() === 'error' || m.type() === 'warning') fail(`console.${m.type()}: ${m.text()}`);
      });
      page.on('pageerror', (e) => fail(`pageerror: ${e.message}`));
      await page.goto(`${BASE_URL}?engine=new&renderer=${renderer}&scene=model&model=character&anim=off&${q}`, { waitUntil: 'load' });
      await page.waitForSelector('#boot-status[data-state="ready"]', { state: 'attached', timeout: 30000 }).catch(() => fail('engine never became ready'));
      return page;
    };
    const at = async (page, point) => (await probe(page, [await page.evaluate((q) => window.__orvalisEngine.projectModelPoint(q), point)]))[0];
    const FRONT = 'pitch=0&heading=180', SIDE = 'pitch=0&heading=90'; // the character faces +y; from the west its left side is nearest
    const POINTS = {
      chest: [0, 0, 1.3], // body
      // short or long hair: the side of the cap, wider than the head. (The camera is lower than the head: a point
      // ON TOP of the head would be hidden by the face.)
      capFront: [0.116, 0.012, 1.72],
      crestTop: [0, 0.012, 1.94], // crest only
      behindNeck: [0, -0.125, 1.5], // long hair only (seen from the side, behind the neck)
      chin: [0, 0.128, 1.585], // beard only (seen from the side, in front of the jaw)
      cuff: [-0.3037, 0, 1.0], // glove cuff only (seen from the front, just outside the forearm)
      shaft: [-0.09, 0.066, 0.25], // boot shaft only (seen from the side, just in front of the shin)
    };
    const cases = [
      { name: 'baseline', query: '', view: FRONT, present: ['chest', 'capFront'], absent: ['crestTop', 'cuff'], draws: 4 },
      { name: 'baseline, side', query: '', view: SIDE, present: [], absent: ['behindNeck', 'chin', 'shaft'], draws: 4 },
      { name: 'crest', query: 'hair=3', view: FRONT, present: ['chest', 'crestTop'], absent: ['capFront'], draws: 4 },
      { name: 'long hair + beard + boots, side', query: 'hair=2&facialHair=2&boots=2', view: SIDE, present: ['behindNeck', 'chin', 'shaft'], absent: [], draws: 5 },
      { name: 'gloves', query: 'gloves=2', view: FRONT, present: ['cuff', 'chest'], absent: ['crestTop'], draws: 4 },
    ];
    for (const item of cases) {
      const page = await openCharacter(`${item.view}&${item.query}`);
      const pixels = {};
      for (const name of item.present) {
        const got = (pixels[name] = await at(page, POINTS[name]));
        if (near(got, CLEAR, 4)) fail(`character, ${item.name}: « ${name} » should be drawn (got the background rgb(${got}))`);
      }
      for (const name of item.absent) {
        const got = (pixels[name] = await at(page, POINTS[name]));
        if (!near(got, CLEAR, 2)) fail(`character, ${item.name}: nothing expected at « ${name} » (got rgb(${got}))`);
      }
      const drawCalls = await page.evaluate(() => Number(document.getElementById('boot-status').dataset.drawCalls));
      if (drawCalls !== item.draws) fail(`character, ${item.name}: expected ${item.draws} draw calls (one per visible section), got ${drawCalls}`);
      out[`character-${item.name}`] = pixels;
      await page.close();
    }
    // Key 1 shows the next hair style: short → long → crest.
    const page = await openCharacter(FRONT);
    await page.keyboard.press('Digit1');
    await page.keyboard.press('Digit1');
    await page.waitForFunction(() => document.getElementById('debug-overlay').textContent.includes('Character: hair 3 (1)'), null, { timeout: 5000 }).catch(() => fail('character: pressing 1 twice should show hair 3 in the overlay'));
    if (near(await at(page, POINTS.crestTop), CLEAR, 4)) fail('character: after pressing 1 twice the crest should be drawn');
    if (!near(await at(page, POINTS.capFront), CLEAR, 2)) fail('character: after pressing 1 twice the short hair should be gone');
    await page.close();
    seen.push('character: body + baseline sections, crest, long hair, beard, gloves and boots each appear only when selected; key 1 changes the hair');
  }
  if (wants('character-texture')) {
    // The character's 256 × 256 composite texture, seen on the model. The scene is lit, so colours are compared
    // with each other (eye against cheek, hips against chest, one look against another), not with absolute values.
    const openCharacter = async (q) => {
      const page = await browser.newPage({ viewport: { width: W, height: H } });
      page.on('console', (m) => {
        if (m.type() === 'warning' && m.text().includes('GPU stall due to ReadPixels')) return;
        if (m.type() === 'error' || m.type() === 'warning') fail(`console.${m.type()}: ${m.text()}`);
      });
      page.on('pageerror', (e) => fail(`pageerror: ${e.message}`));
      await page.goto(`${BASE_URL}?engine=new&renderer=${renderer}&scene=model&model=character&anim=off&pitch=0&heading=180&${q}`, { waitUntil: 'load' });
      await page.waitForSelector('#boot-status[data-state="ready"]', { state: 'attached', timeout: 30000 }).catch(() => fail('engine never became ready'));
      return page;
    };
    const at = async (page, point) => (await probe(page, [await page.evaluate((q) => window.__orvalisEngine.projectModelPoint(q), point)]))[0];
    // A point of the head from its texel (x, y) in the head region: x goes round the head from its right side
    // (a quarter of the way = the front), y = 32 is the widest ring (z = 1.7, radii 0.105 × 0.115 around y = 0.012).
    const onHead = (tx) => { const a = ((tx - 0.5) / 127) * 2 * Math.PI; return [0.105 * Math.cos(a), 0.012 + 0.115 * Math.sin(a), 1.7]; };
    const POINTS = { pupil: onHead(24), eyeWhite: onHead(26.2), temple: onHead(8), chest: [0, 0.136, 1.34], hips: [0, 0.112, 1.0], cap: [0.116, 0.012, 1.72] };
    const look = async (q) => {
      const page = await openCharacter(q), pixels = {};
      for (const [name, point] of Object.entries(POINTS)) pixels[name] = await at(page, point);
      return { page, pixels };
    };
    const base = await look('');
    const p = base.pixels;
    // Face 0: dark pupil, eye white brighter and bluer than the skin beside it.
    if (!(p.pupil[2] < 0.6 * p.temple[2])) fail(`texture: the pupil should be much darker than the skin (pupil rgb(${p.pupil}), temple rgb(${p.temple}))`);
    if (!(p.eyeWhite[2] > 1.25 * p.temple[2])) fail(`texture: the white of the eye should be brighter than the skin (white rgb(${p.eyeWhite}), temple rgb(${p.temple}))`);
    // Underwear: the hips are blue, the chest is skin.
    if (!(p.hips[2] > p.hips[0])) fail(`texture: the hips should show the underwear (blue above red), got rgb(${p.hips})`);
    if (!(p.chest[0] > p.chest[2] * 1.2)) fail(`texture: the chest should be skin (red above blue), got rgb(${p.chest})`);
    out['texture-base'] = p;
    // Key 6: the next face (blue eyes). Only the head group of the composite is rebuilt.
    await base.page.keyboard.press('Digit6');
    await base.page.waitForFunction(() => window.__orvalisEngine.getCharacterTexture()?.skin.faceType === 1, null, { timeout: 5000 }).catch(() => fail('texture: key 6 should select face 1'));
    const stats = await base.page.evaluate(() => window.__orvalisEngine.getCharacterTexture());
    if (JSON.stringify(stats?.rebuilt) !== '["head"]' || stats?.regionsRebuilt !== 15) fail(`texture: changing the face should rebuild the head group only (14 regions at start + 1), got ${JSON.stringify(stats)}`);
    const blue = await at(base.page, POINTS.pupil);
    if (!(blue[2] > blue[0] * 1.3) || near(blue, p.pupil, 6)) fail(`texture: after key 6 the pupil should be blue (was rgb(${p.pupil}), now rgb(${blue}))`);
    const chestAfter = await at(base.page, POINTS.chest);
    if (!near(chestAfter, p.chest, 0)) fail(`texture: the chest should not change when the face does (was rgb(${p.chest}), now rgb(${chestAfter}))`);
    out['texture-face'] = { pupil: blue };
    await base.page.close();
    // Darkest skin, blond hair, no underwear.
    const other = await look('skin=2&hairColor=1&underwear=off');
    const o = other.pixels;
    if (!(o.chest[0] < 0.7 * p.chest[0])) fail(`texture: skin 2 should be clearly darker (chest rgb(${p.chest}) → rgb(${o.chest}))`);
    if (!(o.cap[0] > 1.5 * p.cap[0] && o.cap[0] > o.cap[2] * 1.5)) fail(`texture: hair colour 1 should be blond (cap rgb(${p.cap}) → rgb(${o.cap}))`);
    if (!(o.hips[0] > o.hips[2])) fail(`texture: without underwear the hips should be skin, got rgb(${o.hips})`);
    out['texture-other'] = o;
    await other.page.close();
    seen.push(`texture: pupil rgb(${p.pupil}) / eye white rgb(${p.eyeWhite}) / skin rgb(${p.temple}), hips rgb(${p.hips}) / chest rgb(${p.chest}), blue pupil rgb(${blue}) after key 6 (head group only), dark skin rgb(${o.chest}), blond rgb(${o.cap})`);
  }
  if (wants('character-equipment')) {
    // Equipment in its three forms: painted on the texture (A), switching sections of the model (B), attached models (C).
    const CLEAR = [11, 14, 20];
    const openCharacter = async (q) => {
      const page = await browser.newPage({ viewport: { width: W, height: H } });
      page.on('console', (m) => {
        if (m.type() === 'warning' && m.text().includes('GPU stall due to ReadPixels')) return;
        if (m.type() === 'error' || m.type() === 'warning') fail(`console.${m.type()}: ${m.text()}`);
      });
      page.on('pageerror', (e) => fail(`pageerror: ${e.message}`));
      await page.goto(`${BASE_URL}?engine=new&renderer=${renderer}&scene=model&model=character&anim=off&pitch=0&${q}`, { waitUntil: 'load' });
      await page.waitForSelector('#boot-status[data-state="ready"]', { state: 'attached', timeout: 30000 }).catch(() => fail('engine never became ready'));
      return page;
    };
    const at = async (page, point) => (await probe(page, [await page.evaluate((q) => window.__orvalisEngine.projectModelPoint(q), point)]))[0];
    const stats = (page) => page.evaluate(() => window.__orvalisEngine.getCharacterTexture());
    const drawCallsOf = (page) => page.evaluate(() => Number(document.getElementById('boot-status').dataset.drawCalls));
    // Seen from the front (the character faces +y).
    const FRONT = { chest: [0.09, 0.12, 1.3], thigh: [0.09, 0.09, 0.7], sleeve: [0.228, 0.05, 1.33] };
    // Seen from the west (the character's left side is nearest): the sword blade in front of the body, the face of
    // the shield beside the hips, the boot shaft in front of the shin.
    const SIDE = { blade: [0.262, 0.52, 0.84], shield: [-0.33, 0.15, 1.05], shaft: [-0.09, 0.066, 0.25] };

    // A — painted. Naked first, then the shirt alone through the hook, then the whole outfit 1.
    let page = await openCharacter('heading=180');
    const bare = { chest: await at(page, FRONT.chest), thigh: await at(page, FRONT.thigh), sleeve: await at(page, FRONT.sleeve) };
    if (!(bare.chest[0] > bare.chest[2])) fail(`equipment: the bare chest should be skin (got rgb(${bare.chest}))`);
    await page.evaluate(() => window.__orvalisEngine.setCharacterEquipment(['linenShirt']));
    const afterShirt = await stats(page);
    if (JSON.stringify(afterShirt?.rebuilt) !== '["torso","arms"]') fail(`equipment: putting the shirt on should rebuild the torso and arms groups only (got ${JSON.stringify(afterShirt?.rebuilt)})`);
    const shirt = { chest: await at(page, FRONT.chest), thigh: await at(page, FRONT.thigh), sleeve: await at(page, FRONT.sleeve) };
    if (!(shirt.chest[2] > shirt.chest[0] * 1.2) || !(shirt.sleeve[2] > shirt.sleeve[0] * 1.2)) fail(`equipment: the shirt should paint the chest and the sleeves blue (chest rgb(${shirt.chest}), sleeve rgb(${shirt.sleeve}))`);
    if (!near(shirt.thigh, bare.thigh, 0)) fail(`equipment: the shirt should not change the legs (rgb(${bare.thigh}) → rgb(${shirt.thigh}))`);
    if ((await drawCallsOf(page)) !== 4) fail('equipment: a painted item adds no draw call');
    // Items were set one by one (no outfit): key 8 starts the outfits again at 0 (nothing), then 1 (clothes).
    await page.keyboard.press('Digit8');
    await page.waitForFunction(() => window.__orvalisEngine.getCharacterTexture()?.outfit === 0, null, { timeout: 5000 }).catch(() => fail('equipment: key 8 after items set by hand should select outfit 0'));
    if (!near(await at(page, FRONT.chest), bare.chest, 0)) fail('equipment: outfit 0 should show the bare chest again, exactly as before the shirt');
    await page.keyboard.press('Digit8');
    await page.waitForFunction(() => window.__orvalisEngine.getCharacterTexture()?.outfit === 1, null, { timeout: 5000 }).catch(() => fail('equipment: a second key 8 should select outfit 1'));
    const clothed = { chest: await at(page, FRONT.chest), thigh: await at(page, FRONT.thigh) };
    if (!(clothed.thigh[1] > clothed.thigh[0] && clothed.thigh[1] > clothed.thigh[2])) fail(`equipment: the trousers should paint the legs green (got rgb(${clothed.thigh}))`);
    out['equipment-front'] = { bareChest: bare.chest, shirtChest: shirt.chest, sleeve: shirt.sleeve, trousers: clothed.thigh };
    await page.close();

    // B and C — from the side: nothing at first, then outfit 2.
    page = await openCharacter('heading=90');
    for (const [name, point] of Object.entries(SIDE)) {
      const got = await at(page, point);
      if (!near(got, CLEAR, 2)) fail(`equipment, nothing worn: nothing expected at « ${name} » (got rgb(${got}))`);
    }
    await page.close();
    page = await openCharacter('heading=90&outfit=2');
    const side = {};
    for (const [name, point] of Object.entries(SIDE)) {
      side[name] = await at(page, point);
      if (near(side[name], CLEAR, 4)) fail(`equipment, outfit 2: « ${name} » should be drawn (got the background)`);
    }
    // The blade is steel: nearly grey. The shield is wood: clearly more red than blue.
    if (Math.abs(side.blade[0] - side.blade[2]) > 0.2 * side.blade[2]) fail(`equipment: the blade should be grey steel (got rgb(${side.blade}))`);
    if (!(side.shield[0] > side.shield[2] * 1.5)) fail(`equipment: the shield should be wood (got rgb(${side.shield}))`);
    const worn = await stats(page);
    if (worn?.attached !== 2) fail(`equipment: 2 attached models expected (sword, shield), got ${worn?.attached}`);
    if ((await drawCallsOf(page)) !== 6) fail(`equipment, outfit 2: expected 6 draw calls (body, hair, gloves, boots, sword, shield), got ${await drawCallsOf(page)}`);
    out['equipment-side'] = side;
    // Key 8 again: back to nothing — the gear and the boots are gone.
    await page.keyboard.press('Digit8');
    await page.waitForFunction(() => window.__orvalisEngine.getCharacterTexture()?.outfit === 0, null, { timeout: 5000 }).catch(() => fail('equipment: key 8 after outfit 2 should return to outfit 0'));
    for (const [name, point] of Object.entries(SIDE)) if (!near(await at(page, point), CLEAR, 2)) fail(`equipment, back to nothing: « ${name} » should be gone`);
    await page.close();
    seen.push(`equipment: shirt rgb(${shirt.chest}) over skin rgb(${bare.chest}) (torso and arms groups only), trousers rgb(${clothed.thigh}), boots / sword rgb(${side.blade}) / shield rgb(${side.shield}) appear with outfit 2 and go with outfit 0`);
  }
  if (wants('character-animation')) {
    // The animated character: GPU skinning driven by the state machine. Seen from the west, level.
    const CLEAR = [11, 14, 20];
    const openCharacter = async (q) => {
      const page = await browser.newPage({ viewport: { width: W, height: H } });
      page.on('console', (m) => {
        if (m.type() === 'warning' && m.text().includes('GPU stall due to ReadPixels')) return;
        if (m.type() === 'error' || m.type() === 'warning') fail(`console.${m.type()}: ${m.text()}`);
      });
      page.on('pageerror', (e) => fail(`pageerror: ${e.message}`));
      await page.goto(`${BASE_URL}?engine=new&renderer=${renderer}&scene=model&model=character&pitch=0&heading=90&${q}`, { waitUntil: 'load' });
      await page.waitForSelector('#boot-status[data-state="ready"]', { state: 'attached', timeout: 30000 }).catch(() => fail('engine never became ready'));
      return page;
    };
    const at = async (page, point) => (await probe(page, [await page.evaluate((q) => window.__orvalisEngine.projectModelPoint(q), point)]))[0];
    const step = (page, ms) => page.evaluate((t) => window.__orvalisEngine.stepModelAnimation(t), ms);
    const state = (page) => page.evaluate(() => window.__orvalisEngine.getCharacterState());
    // Where the ankle of a straight leg is when its thigh has swung `degrees` forward: the hip is at z = 0.95 and
    // the ankle 0.85 below it. A little above the ankle (0.75 down the leg) to be well inside the shin.
    const legPoint = (degrees) => [-0.09, 0.75 * Math.sin(degrees * RAD), 0.95 - 0.75 * Math.cos(degrees * RAD)];

    // Walk, frozen: at a quarter of the cycle one leg is 25° forward and straight, at half a cycle both legs pass
    // under the body, at three quarters the OTHER leg is forward (seen from the side it is at the same place).
    let page = await openCharacter('anim=walk&animTime=0');
    const walk = {};
    if (!near((walk.start = await at(page, legPoint(25))), CLEAR, 2)) fail(`animation: at the start of the walk no leg should be 25° forward (got rgb(${walk.start}))`);
    await step(page, 250);
    if (near((walk.quarter = await at(page, legPoint(25))), CLEAR, 4)) fail('animation: a quarter into the walk cycle a leg should be 25° forward');
    if (near(await at(page, legPoint(-25)), CLEAR, 4)) fail('animation: a quarter into the walk cycle the other leg should be 25° back');
    if (!near(await at(page, legPoint(45)), CLEAR, 2)) fail('animation: walking must not swing a leg as far as 45°');
    await step(page, 250);
    if (!near((walk.half = await at(page, legPoint(25))), CLEAR, 2)) fail(`animation: half-way through the walk cycle the legs pass under the body (got rgb(${walk.half}))`);
    await step(page, 250);
    if (near((walk.threeQuarters = await at(page, legPoint(25))), CLEAR, 4)) fail('animation: three quarters into the walk cycle the other leg should be 25° forward');
    out['animation-walk'] = walk;
    // The intent changes to run: the machine changes state and, a quarter of the run cycle later, a leg is 45° forward.
    await page.evaluate(() => window.__orvalisEngine.setCharacterLocomotion('run'));
    const now = await state(page);
    if (now?.state !== 'run' || now?.animation?.previous !== 'walk') fail(`animation: asking to run should start the run, fading from the walk (got ${JSON.stringify(now)})`);
    await step(page, 150);
    const run = await at(page, legPoint(45));
    if (near(run, CLEAR, 4)) fail('animation: a quarter into the run cycle a leg should be 45° forward');
    out['animation-run'] = { quarter: run };
    // Jump: JumpStart (200 ms) → Jump → lands by itself after 500 ms in the air → JumpEnd (250 ms) → run again.
    const seenStates = [];
    await page.evaluate(() => window.__orvalisEngine.characterJump());
    for (const ms of [0, 200, 499, 1, 250]) {
      await step(page, ms);
      seenStates.push((await state(page))?.state);
    }
    if (seenStates.join(' → ') !== 'jumpStart → jump → jump → jumpEnd → run') fail(`animation: jump should go jumpStart → jump → jump → jumpEnd → run (got ${seenStates.join(' → ')})`);
    // Attack: once, then back to the run.
    await page.evaluate(() => window.__orvalisEngine.characterAttack());
    await step(page, 499);
    const attacking = (await state(page))?.state;
    await step(page, 1);
    const after = (await state(page))?.state;
    if (attacking !== 'attack' || after !== 'run') fail(`animation: an attack should last 500 ms and return to the run (got ${attacking} then ${after})`);
    await page.close();

    // Not frozen: the animation runs by itself, and the keys drive the machine.
    page = await openCharacter('');
    const first = (await state(page))?.animation?.elapsed ?? -1;
    await page.waitForFunction((t) => (window.__orvalisEngine.getCharacterState()?.animation?.elapsed ?? -1) > t + 200, first, { timeout: 5000 }).catch(() => fail('animation: the stand animation should run by itself'));
    await page.keyboard.press('Digit9');
    await page.waitForFunction(() => window.__orvalisEngine.getCharacterState()?.state === 'walk', null, { timeout: 5000 }).catch(() => fail('animation: key 9 should start the walk'));
    await page.keyboard.press('Space');
    await page.waitForFunction(() => ['jumpStart', 'jump'].includes(window.__orvalisEngine.getCharacterState()?.state), null, { timeout: 5000 }).catch(() => fail('animation: Space should start a jump'));
    await page.waitForFunction(() => window.__orvalisEngine.getCharacterState()?.state === 'walk', null, { timeout: 8000 }).catch(() => fail('animation: the jump should end by itself and return to the walk'));
    await page.keyboard.press('KeyX');
    await page.waitForFunction(() => window.__orvalisEngine.getCharacterState()?.state === 'attack', null, { timeout: 5000 }).catch(() => fail('animation: X should start an attack'));
    if (!(await page.evaluate(() => document.getElementById('debug-overlay').textContent)).includes('Character animation:')) fail('animation: the overlay should show the character animation line');
    await page.close();
    seen.push(`character animation: walk leg at 25° on the quarter and three-quarter beats and under the body between, run leg at 45°, ${seenStates.join(' → ')}, attack → run, keys 9 / Space / X`);
  }
  if (wants('animation')) {
    const YELLOW = [255, 255, 0];
    const cam = cameraOf(0, 90);
    // A point of the upper link, `r` above the lower foliage pivot, when the foliage leans `degrees` around +x.
    const onLink = (degrees, r) => [0, -r * Math.sin(degrees * RAD), 2.2 + r * Math.cos(degrees * RAD)];
    const linkAt = async (page, point, record, name) => {
      const [fx, fy] = cam.screen(point);
      const px = Math.floor(fx * W), py = Math.floor(fy * H);
      const points = [];
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) points.push([(px + dx + 0.5) / W, (py + dy + 0.5) / H]);
      const pixels = await probe(page, points);
      if (record) out[record] = Object.fromEntries(pixels.map((p, k) => [`${name}-${k}`, p]).concat(Object.entries(out[record] ?? {})));
      return pixels.some((p) => near(p, YELLOW, 1));
    };
    const overlayHas = async (page, line) => (await page.evaluate(() => document.getElementById('debug-overlay').textContent)).split('\n').includes(line);
    const step = (page, ms) => page.evaluate((t) => window.__orvalisEngine.stepModelAnimation(t), ms);
    const state = (page) => page.evaluate(() => window.__orvalisEngine.getModelAnimation());

    // 1. Frozen sway at 1000 ms: 20° lean, and the global bob at its highest (the link is 0.3 longer than at rest).
    let page = await open('pitch=0&heading=90&skeleton=on&pose=sway&animTime=1000');
    if (!(await overlayHas(page, 'Animation: sway 1000 ms · frozen'))) fail('overlay should show « Animation: sway 1000 ms · frozen »');
    if (!(await linkAt(page, onLink(20, 0.9), 'anim-sway', 'mid'))) fail('sway at 1000 ms: the upper link should lean 20°');
    if (!(await linkAt(page, onLink(20, 1.95), 'anim-sway', 'bob'))) fail('sway at 1000 ms: the link should reach 1.95 above the lower pivot (global-sequence bob at +0.3)');
    const frozenBefore = await state(page);
    // 2. Stepped by hand to 2000 ms: upright, bob back to 0 → the link stops at 1.8.
    await step(page, 1000);
    if (!(await linkAt(page, onLink(0, 0.9), 'anim-upright', 'mid'))) fail('sway at 2000 ms: the upper link should be upright');
    if (await linkAt(page, onLink(0, 1.95))) fail('sway at 2000 ms: no bob, the link should stop at 1.8');
    if (await linkAt(page, onLink(20, 0.9))) fail('sway at 2000 ms: the link should have left its 20° position');
    const frozenAfter = await state(page);
    if (frozenBefore?.elapsed !== 1000 || frozenAfter?.elapsed !== 2000) fail(`frozen clock should read 1000 then 2000 ms (got ${frozenBefore?.elapsed}, ${frozenAfter?.elapsed})`);
    await page.close();

    // 3. Cross-fade: sway at 1000 ms, J starts the gust, 150 ms later the fade is half done → 13.75° lean
    //    (sway alone would be at 17°, the gust alone at 10.5°).
    page = await open('pitch=0&heading=90&skeleton=on&pose=sway&animTime=1000');
    await page.keyboard.press('KeyJ');
    await step(page, 150);
    const fading = await state(page);
    if (fading?.sequence !== 'gust' || fading?.previous !== 'sway' || Math.abs(fading.lambda - 0.5) > 1e-9) fail(`after J + 150 ms the gust should be half faded in from the sway (got ${JSON.stringify(fading)})`);
    if (!(await linkAt(page, onLink(13.75, 1.7), 'anim-fade', 'blend'))) fail('half-way through the fade the link should lean 13.75°');
    if (await linkAt(page, onLink(17, 1.7))) fail('fade: the link is where the sway ALONE would put it (no blending?)');
    if (await linkAt(page, onLink(10.5, 1.7))) fail('fade: the link is where the gust ALONE would put it (no blending?)');
    await step(page, 150);
    const done = await state(page);
    if (done?.previous !== null || done?.lambda !== 1) fail(`the fade should be over after its 300 ms (got ${JSON.stringify(done)})`);
    if (!(await linkAt(page, onLink(21, 1.7), 'anim-gust', 'gust'))) fail('gust alone at 300 ms: the link should lean 21°');
    await page.close();

    // 4. Not frozen: the animation follows real time.
    page = await open('pitch=0&heading=90&skeleton=on&pose=gust');
    const first = (await state(page))?.elapsed ?? -1;
    await page.waitForFunction((t) => (window.__orvalisEngine.getModelAnimation()?.elapsed ?? -1) > t + 200, first, { timeout: 5000 }).catch(() => fail('not frozen: the animation clock should advance by itself'));
    if ((await state(page))?.frozen !== false) fail('without animTime the animation should not be frozen');
    await page.close();
    seen.push('animation: sway 20° + bob at 1000 ms, upright at 2000 ms, fade to gust 13.75° half-way then 21°, runs in real time');
  }
  console.log(`smoke: [${label}] model on ${NAMES[renderer]} → ${seen.join(' · ')}`);
  return out;
}

/**
 * P1.7 sparse map: only resident tiles are drawn, at the right place; absent
 * tiles show the background. Two maps of the same world are shown in turn.
 */
async function checkMap(browser, label, renderer) {
  const NAMES = { webgpu: 'WebGPU', webgl2: 'WebGL2' };
  const results = {};
  const cases = [
    {
      name: 'archipel', q: 'map=archipel&height=flat&view=above', tiles: 3,
      // Rectangle of resident tiles: x −1..1, y 0..1 → 1536 × 1024 world units, centred on screen.
      minX: -1, minY: 0, cols: 3, rows: 2,
      present: [[0, 0], [-1, 0], [1, 1]], absent: [[0, 1], [1, 0], [-1, 1]],
    },
    {
      name: 'bande', q: 'map=bande&height=flat&view=above', tiles: 2,
      minX: 5, minY: -3, cols: 1, rows: 2,
      present: [[5, -3], [5, -2]], absent: [[4, -3], [6, -2]],
    },
  ];
  for (const c of cases) {
    const fail = (msg) => problems.push(`[${label} map ${c.name} ${renderer}] ${msg}`);
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('console', (m) => {
      const text = m.text();
      if (m.type() === 'warning' && text.includes('GPU stall due to ReadPixels')) return;
      if (m.type() === 'error' || m.type() === 'warning') fail(`console.${m.type()}: ${text} (at ${m.location().url || 'unknown location'})`);
    });
    page.on('pageerror', (e) => fail(`pageerror: ${e.message}`));
    await page.goto(`${BASE_URL}?engine=new&renderer=${renderer}&scene=map&${c.q}&timeSpeed=0`, { waitUntil: 'load' });
    await page.waitForSelector('#boot-status[data-state="ready"]', { state: 'attached', timeout: 30000 }).catch(() => fail('engine never became ready'));
    await page.waitForFunction(() => document.getElementById('debug-overlay').textContent.includes('Terrain chunks'), null, { timeout: 10000 }).catch(() => fail('overlay never showed terrain statistics'));
    const lines = (await page.evaluate(() => document.getElementById('debug-overlay').textContent)).split('\n');
    const n = c.tiles;
    for (const want of [`Renderer: ${NAMES[renderer]}`, `Terrain map: ${c.name}`, `Terrain tiles: ${n} (resident)`, `Terrain chunks: ${n * 256}`, `Terrain vertices: ${n * 37120}`, `Terrain triangles: ${n * 65536}`, `Terrain visible chunks: ${n * 256}`, `Terrain submitted chunks: ${n * 256}`, `Draw calls: ${n * 256}`]) {
      if (!lines.includes(want)) fail(`overlay line missing: "${want}" (got: ${lines.join(' | ')})`);
    }
    // Centre of tile (tx, ty) on screen. The camera looks straight down at the centre of the rectangle;
    // the visible ground height is 2 · 1.0825 · (largest side of the rectangle).
    const side = Math.max(c.cols, c.rows);
    const at = (tx, ty) => [0.5 + ((tx + 0.5 - c.minX - c.cols / 2) / side) * 0.2598, 0.5 - ((ty + 0.5 - c.minY - c.rows / 2) / side) * 0.4619];
    const colour = (tx, ty) => [Math.round((0.15 + (0.7 * (tx + 0.5 - c.minX)) / c.cols) * 255), Math.round((0.15 + (0.7 * (ty + 0.5 - c.minY)) / c.rows) * 255), 51];
    const points = [...c.present.map(([x, y]) => at(x, y)), ...c.absent.map(([x, y]) => at(x, y))];
    const probe = await page.evaluate((pts) => window.__orvalisEngine.probe(pts), points);
    for (const e of probe.errors) fail(`GPU error: ${e}`);
    const px = probe.pixels.map((p) => p.slice(0, 3));
    const seen = {};
    c.present.forEach(([x, y], i) => {
      seen[`tile ${x},${y}`] = px[i];
      if (!near(px[i], colour(x, y), 4)) fail(`resident tile (${x},${y}) should be rgb(${colour(x, y)}) at its place, got rgb(${px[i]})`);
    });
    c.absent.forEach(([x, y], i) => {
      const p = px[c.present.length + i];
      seen[`absent ${x},${y}`] = p;
      if (!near(p, BG)) fail(`absent tile (${x},${y}) should show the background, got rgb(${p})`);
    });
    results[c.name] = seen;
    console.log(`smoke: [${label}] map ${c.name} on ${NAMES[renderer]} → ${n} resident tiles / ${n * 256} draws · ${c.present.map(([x, y], i) => `(${x},${y}) rgb(${px[i]})`).join(' ')} · absent ${c.absent.map(([x, y]) => `(${x},${y})`).join(' ')} = background`);
    await page.close();
  }
  return results;
}

/**
 * P1.6 frustum culling per chunk. Culling must change the COUNTS and never the PICTURE:
 * the same pixels are read with culling on and off (key C) and must be identical.
 */
async function checkCulling(browser, label, renderer) {
  const W = 1280, H = 720;
  const GRID = [];
  for (let j = 0; j < 18; j++) for (let i = 0; i < 32; i++) GRID.push([(i + 0.5) / 32, (j + 0.5) / 18]);
  const out = {};
  const cases = [
    { name: 'flat above zoom 4', q: 'height=flat&view=above&zoom=4', visible: 160 },
    { name: 'hills oblique zoom 3', q: 'height=hills&view=oblique&zoom=3' },
    { name: 'hills oblique zoom 8, tile -2,3', q: 'tile=-2,3&height=hills&view=oblique&zoom=8' },
    // P1.7: culling across the tiles of a sparse map.
    { name: 'map archipel above zoom 6', scene: 'map', total: 768, q: 'map=archipel&height=flat&view=above&zoom=6', visible: 288, minTerrain: 0.2 },
    { name: 'map archipel oblique zoom 3', scene: 'map', total: 768, q: 'map=archipel&view=oblique&zoom=3', minTerrain: 0.2 },
  ];
  for (const c of cases) {
    const fail = (msg) => problems.push(`[${label} culling ${c.name} ${renderer}] ${msg}`);
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on('console', (m) => {
      const text = m.text();
      if (m.type() === 'warning' && text.includes('GPU stall due to ReadPixels')) return;
      if (m.type() === 'error' || m.type() === 'warning') fail(`console.${m.type()}: ${text} (at ${m.location().url || 'unknown location'})`);
    });
    page.on('pageerror', (e) => fail(`pageerror: ${e.message}`));
    const total = c.total ?? 256;
    await page.goto(`${BASE_URL}?engine=new&renderer=${renderer}&scene=${c.scene ?? 'tile'}&${c.q}&timeSpeed=0`, { waitUntil: 'load' });
    await page.waitForSelector('#boot-status[data-state="ready"]', { state: 'attached', timeout: 30000 }).catch(() => fail('engine never became ready'));
    const overlay = async (pattern) => {
      await page.waitForFunction((p) => new RegExp(p, 'm').test(document.getElementById('debug-overlay').textContent), pattern, { timeout: 5000 }).catch(() => fail(`overlay never matched /${pattern}/`));
      return (await page.evaluate(() => document.getElementById('debug-overlay').textContent)).split('\n');
    };
    const number = (lines, prefix) => Number((lines.find((l) => l.startsWith(prefix)) ?? '').slice(prefix.length));
    const grid = async () => {
      const r = await page.evaluate((pts) => window.__orvalisEngine.probe(pts), GRID);
      for (const e of r.errors) fail(`GPU error: ${e}`);
      return r.pixels.map((p) => p.slice(0, 3).join(','));
    };

    const on = await overlay('^Terrain culling: on \\(C\\)$');
    const visible = number(on, 'Terrain visible chunks: '), culled = number(on, 'Terrain culled chunks: '), draws = number(on, 'Draw calls: ');
    if (!(visible > 0 && visible < total)) fail(`expected some but not all chunks visible, got ${visible}`);
    if (visible + culled !== total) fail(`visible ${visible} + culled ${culled} should be ${total}`);
    if (draws !== visible) fail(`draw calls (${draws}) should equal visible chunks (${visible})`);
    if (c.visible !== undefined && visible !== c.visible) fail(`expected exactly ${c.visible} visible chunks, got ${visible}`);
    const withCulling = await grid();
    const terrainPixels = withCulling.filter((p) => p !== BG.join(',')).length;
    if (terrainPixels < GRID.length * (c.minTerrain ?? 0.25)) fail(`the view should be mostly terrain, only ${terrainPixels}/${GRID.length} probes are`);

    await page.keyboard.press('KeyC');
    const off = await overlay('^Terrain culling: off \\(C\\)$');
    if (number(off, 'Draw calls: ') !== total && !(await overlay(`^Draw calls: ${total}$`)).includes(`Draw calls: ${total}`)) fail(`with culling off, all ${total} chunks should be drawn`);
    const withoutCulling = await grid();
    const different = withCulling.filter((p, i) => p !== withoutCulling[i]).length;
    if (different !== 0) fail(`culling changed the picture: ${different}/${GRID.length} probes differ — a visible chunk was rejected`);

    await page.keyboard.press('KeyC');
    await overlay(`^Terrain visible chunks: ${visible}$`);
    out[c.name] = visible;
    console.log(`smoke: [${label}] culling ${c.name} on ${renderer} → ${visible} visible / ${culled} culled · ${draws} draws instead of ${total} · picture identical with culling off (${GRID.length} probes, ${terrainPixels} on terrain)`);
    await page.close();
  }
  return out;
}

/**
 * P1.4 normals: ?terrainDebug=normals shows 0.5 + 0.5·normal. Seen from above:
 * flat ground is rgb(128,128,255) everywhere, the slope (z rising with x) one
 * constant colour with LESS red, the hill a different colour on each side.
 */
async function checkNormals(browser, label, renderer) {
  const POINTS = { centre: [0.5, 0.5], left: [0.42, 0.5], right: [0.58, 0.5], top: [0.5, 0.36], bottom: [0.5, 0.64], q1: [0.45, 0.42], q2: [0.56, 0.6], farLeft: [0.05, 0.5] };
  const INSIDE = ['centre', 'left', 'right', 'top', 'bottom', 'q1', 'q2'];
  const out = {};
  for (const height of ['flat', 'slope', 'hill']) {
    const fail = (msg) => problems.push(`[${label} normals ${height} ${renderer}] ${msg}`);
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('console', (m) => {
      const text = m.text();
      if (m.type() === 'warning' && text.includes('GPU stall due to ReadPixels')) return;
      if (m.type() === 'error' || m.type() === 'warning') fail(`console.${m.type()}: ${text}`);
    });
    page.on('pageerror', (e) => fail(`pageerror: ${e.message}`));
    await page.goto(`${BASE_URL}?engine=new&renderer=${renderer}&scene=chunk&height=${height}&view=above&terrainDebug=normals`, { waitUntil: 'load' });
    await page.waitForSelector('#boot-status[data-state="ready"]', { state: 'attached', timeout: 10000 }).catch(() => fail('engine never became ready'));
    await page.waitForFunction(() => document.getElementById('debug-overlay').textContent.split('\n').includes('Terrain debug: normals'), null, { timeout: 5000 }).catch(() => fail('overlay does not show "Terrain debug: normals"'));
    const probe = await page.evaluate((points) => window.__orvalisEngine.probe(points), Object.values(POINTS));
    for (const e of probe.errors) fail(`GPU error: ${e}`);
    const px = Object.fromEntries(Object.keys(POINTS).map((k, i) => [k, probe.pixels[i].slice(0, 3)]));
    out[height] = px;
    if (!near(px.farLeft, BG)) fail(`outside the chunk should be background, got rgb(${px.farLeft})`);
    for (const k of INSIDE) {
      const [r, g, b] = px[k];
      // A unit normal n gives a colour c with |2c − 1| = 1; black would mean NaN / zero vector.
      const len = Math.hypot(r / 127.5 - 1, g / 127.5 - 1, b / 127.5 - 1);
      if (Math.abs(len - 1) > 0.03) fail(`${k}: rgb(${px[k]}) does not decode to a unit normal (length ${len.toFixed(3)})`);
      if (b <= 128) fail(`${k}: normal points down (blue ${b}) — winding or cross product inverted`);
    }
    if (height === 'flat') for (const k of INSIDE) if (!near(px[k], [128, 128, 255], 1)) fail(`${k}: flat ground should be rgb(128,128,255), got rgb(${px[k]})`);
    if (height === 'slope') {
      // z = 0.375·x → n = (−0.351, 0, 0.936) → rgb(83, 128, 247)
      for (const k of INSIDE) if (!near(px[k], [83, 128, 247], 2)) fail(`${k}: slope should be rgb(83,128,247) everywhere, got rgb(${px[k]})`);
    }
    if (height === 'hill') {
      if (!near(px.centre, [128, 128, 255], 3)) fail(`hill summit should point straight up, got rgb(${px.centre})`);
      if (!(px.left[0] < 110 && px.right[0] > 145)) fail(`hill: red (n.x) should be low on the left and high on the right: ${px.left[0]} / ${px.right[0]}`);
      if (!(px.bottom[1] < 110 && px.top[1] > 145)) fail(`hill: green (n.y) should be low at the bottom and high at the top: ${px.bottom[1]} / ${px.top[1]}`);
    }
    console.log(`smoke: [${label}] normals ${height} on ${renderer} → centre rgb(${px.centre}) left rgb(${px.left}) right rgb(${px.right}) top rgb(${px.top}) bottom rgb(${px.bottom})`);
    await page.close();
  }
  // The picture must depend on the terrain, not only on the shader compiling.
  if (out.flat && out.slope && near(out.flat.left, out.slope.left, 20)) problems.push(`[${label} normals ${renderer}] flat and slope give the same colour`);
  if (out.flat && out.hill && near(out.flat.left, out.hill.left, 20)) problems.push(`[${label} normals ${renderer}] flat and hill give the same colour`);
  return out;
}

/**
 * P1.3 wireframe: on a flat chunk seen from above, one pixel row across the
 * chunk is fully covered in fill mode and only sparsely covered in wireframe.
 * Checks the URL option and the F4 run-time toggle (both directions).
 */
async function checkWireframe(browser, label, renderer) {
  const fail = (msg) => problems.push(`[${label} wireframe ${renderer}] ${msg}`);
  const ROW = Array.from({ length: 300 }, (_, i) => [0.385 + (0.23 * i) / 299, 0.47]);
  const open = async (q) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('console', (m) => {
      const text = m.text();
      if (m.type() === 'warning' && text.includes('GPU stall due to ReadPixels')) return;
      if (m.type() === 'error' || m.type() === 'warning') fail(`console.${m.type()}: ${text}`);
    });
    page.on('pageerror', (e) => fail(`pageerror: ${e.message}`));
    await page.goto(`${BASE_URL}?engine=new&renderer=${renderer}&scene=chunk&height=flat&view=above${q}`, { waitUntil: 'load' });
    await page.waitForSelector('#boot-status[data-state="ready"]', { state: 'attached', timeout: 10000 }).catch(() => fail('engine never became ready'));
    return page;
  };
  const coverage = async (page) => {
    const probe = await page.evaluate((points) => window.__orvalisEngine.probe(points), ROW);
    for (const e of probe.errors) fail(`GPU error: ${e}`);
    return probe.pixels.filter((p) => !near(p, BG)).length / ROW.length;
  };
  const overlayHas = (page, line) =>
    page.waitForFunction((l) => document.getElementById('debug-overlay').textContent.split('\n').includes(l), line, { timeout: 5000 }).then(() => true, () => false);
  const sparse = (c) => c >= 0.03 && c <= 0.5;

  const page = await open('');
  const fill = await coverage(page);
  if (fill !== 1) fail(`fill mode: the whole row should be terrain, coverage ${fill}`);
  await page.keyboard.press('F4');
  if (!(await overlayHas(page, 'Terrain wireframe: on (F4)'))) fail('F4 did not switch the overlay to wireframe on');
  if (!(await overlayHas(page, 'Triangles: 0'))) fail('wireframe should draw 0 triangles (lines only)');
  if (!(await overlayHas(page, 'Draw calls: 1'))) fail('wireframe should be 1 draw call');
  if (!(await overlayHas(page, 'Terrain triangles: 256'))) fail('terrain triangle count must not change in wireframe');
  const wire = await coverage(page);
  if (!sparse(wire)) fail(`wireframe after F4: expected a sparse row (3%..50%), coverage ${wire}`);
  await page.keyboard.press('F4');
  if (!(await overlayHas(page, 'Terrain wireframe: off (F4)'))) fail('second F4 did not switch back to fill');
  const back = await coverage(page);
  if (back !== 1) fail(`fill mode after second F4: coverage ${back}`);
  await page.close();

  const page2 = await open('&wireframe=on');
  if (!(await overlayHas(page2, 'Terrain wireframe: on (F4)'))) fail('?wireframe=on not reflected in the overlay');
  const fromUrl = await coverage(page2);
  if (!sparse(fromUrl)) fail(`?wireframe=on: expected a sparse row, coverage ${fromUrl}`);
  await page2.close();
  console.log(`smoke: [${label}] wireframe on ${renderer} → row coverage fill ${fill} · F4 ${wire.toFixed(3)} · F4 again ${back} · ?wireframe=on ${fromUrl.toFixed(3)}`);
  return { wire, fromUrl };
}

/** The same scene must give the same picture on both backends. */
function compareBackends(a, b, nameA, nameB) {
  let worst = 0, compared = 0;
  for (const scenario of Object.keys(a)) {
    for (const probe of Object.keys(a[scenario] ?? {})) {
      const pa = a[scenario][probe], pb = b[scenario]?.[probe];
      if (!pb) continue;
      compared++;
      const diff = Math.max(...pa.map((v, i) => Math.abs(v - pb[i])));
      worst = Math.max(worst, diff);
      if (diff > 3) problems.push(`[parity] chunk ${scenario}, probe ${probe}: ${nameA} rgb(${pa}) vs ${nameB} rgb(${pb})`);
    }
  }
  // Never report « same pictures » when no pixel was compared.
  if (compared === 0) console.log(`smoke: [parity] ${nameA} vs ${nameB}: NOTHING COMPARED (this suite records no pixel for the comparison)`);
  else console.log(`smoke: [parity] ${nameA} vs ${nameB}: largest channel difference ${worst}/255 over ${compared} pixels in ${Object.keys(a).length} scenarios`);
}

/**
 * Opens the bootstrap with `query` and checks it hands over to the legacy game:
 * the browser ends on the legacy page, the title screen appears, and the new
 * engine's code was never downloaded.
 */
async function checkLegacy(browser, query, allow = []) {
  const label = 'legacy';
  const fail = (msg) => problems.push(`[${label} ${query || '/'}] ${msg}`);
  const legacy = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const failedHosts = [];
  const requested = [];
  const expected = allow.map((re) => ({ re, hits: 0 }));
  legacy.on('console', (m) => {
    const t = m.text();
    const hit = expected.find((e) => e.re.test(t));
    if (hit) return void hit.hits++;
    if (m.type() === 'warning' && t.startsWith('THREE.WebGLShadowMap: PCFSoftShadowMap has been removed')) return; // known, pre-existing
    if (m.type() === 'error' && t.startsWith('Failed to load resource')) return; // accounted for through requestfailed below
    if (m.type() === 'error' || m.type() === 'warning') fail(`console.${m.type()}: ${t.slice(0, 300)}`);
  });
  legacy.on('pageerror', (e) => fail(`pageerror: ${e.message}`));
  legacy.on('request', (r) => requested.push(new URL(r.url()).pathname));
  legacy.on('requestfailed', (r) => failedHosts.push(new URL(r.url()).host));
  await legacy.goto(BASE_URL + query, { waitUntil: 'load' });
  await legacy
    .waitForFunction(() => {
      const t = document.getElementById('title');
      return t && !t.hidden && t.innerText.includes('Se connecter');
    }, null, { timeout: 30000 })
    .catch(() => fail('title screen never appeared'));
  const finalPath = new URL(legacy.url()).pathname;
  if (finalPath !== '/legacy/orvalis.html') fail(`bootstrap should end on /legacy/orvalis.html, ended on ${finalPath}`);
  if (new URL(legacy.url()).searchParams.has('engine')) fail('the engine parameter should be consumed by the bootstrap');
  // Boundary check: in legacy mode the new engine's chunk must not even be downloaded.
  const engineChunks = requested.filter((p) => /\/assets\/main-[^/]+\.js$/.test(p));
  if (engineChunks.length) fail(`new-engine code was downloaded in legacy mode: ${engineChunks.join(', ')}`);
  const legacyBuild = await legacy.evaluate(() => window.__build?.version ?? null);
  // Web fonts are an external CDN; the sandbox has no route to it. Anything else failing is a real problem.
  const FONT_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);
  const unexpected = failedHosts.filter((h) => !FONT_HOSTS.has(h));
  if (unexpected.length) fail(`requestfailed: ${unexpected.join(', ')}`);
  for (const e of expected) if (e.hits === 0) fail(`expected a console message matching ${e.re} but none was logged`);
  console.log(
    `smoke: [bootstrap] ${query || '/'} → legacy Orvalis v${legacyBuild}, title screen reached, new-engine code not loaded` +
      (failedHosts.length ? ` (web fonts unreachable from this machine: ${failedHosts.length} request)` : ''),
  );
  await legacy.close();
}

const FALLBACK_LOG = /^\[renderer\] WebGPU unavailable \(.+\) — falling back to WebGL2$/;
const FORCE_LOG = /^\[renderer\] WebGPU unavailable \(.+\) — forceWebGPU is set, no fallback$/;
const FATAL_LOG = /^\[renderer\] renderer: no graphics backend available — WebGPU: /;
const BOOTSTRAP_IGNORED_LOG = /^\[bootstrap\] unknown value engine="bogus" ignored, starting the legacy game$/;
const IGNORED_LOG = /^\[renderer\] unknown value renderer="bogus" ignored, using automatic selection$/;
// Written by Chromium itself when a WebGPU adapter request fails. Expected exactly
// in the scenarios where WebGPU is attempted in the browser that has no adapter.
const CHROMIUM_NO_ADAPTER = /^Failed to create WebGPU Context Provider$/;

let crashed = false;
let webgpuRan = false;
// ---------------------------------------------------------------------------------------------------------------
// Suites. A suite's `run(ctx)` uses ctx.noGpu() (a browser where WebGPU has no adapter: the real fallback
// situation, WebGL2) and ctx.withGpu() (a browser where WebGPU really runs, or null when this machine cannot).

/**
 * Runs a per-backend check on the requested backends and compares the two pictures.
 * Exhaustive runs also repeat it on WebGL2 inside the WebGPU-capable browser and compare within that browser.
 */
const perBackend = (check, parity = compareBackends) => async (ctx) => {
  let onWebGL2;
  if (ctx.wants('webgl2')) {
    onWebGL2 = await check(await ctx.noGpu(), 'sans WebGPU', 'webgl2');
    if (ctx.failed()) return;
  }
  if (!ctx.wants('webgpu')) return;
  const gpu = await ctx.withGpu();
  if (!gpu) return;
  const onWebGPU = await check(gpu, 'avec WebGPU', 'webgpu');
  if (ctx.failed()) return;
  if (ctx.exhaustive) {
    const again = await check(gpu, 'avec WebGPU', 'webgl2');
    if (parity) parity(onWebGPU, again, 'WebGPU', 'WebGL2');
  } else if (onWebGL2 !== undefined && parity) parity(onWebGPU, onWebGL2, 'WebGPU', 'WebGL2');
};

const cullingParity = (a, b) => {
  // The two backends use different clip-space depth ranges: the culling result must not depend on it.
  for (const k of Object.keys(a)) if (a[k] !== b[k]) problems.push(`[parity] culling ${k}: ${a[k]} visible chunks on WebGPU, ${b[k]} on WebGL2`);
  console.log(`smoke: [parity] culling: same visible-chunk counts on WebGPU and WebGL2 (${Object.values(a).join(', ')})`);
};

const SUITES = [
  {
    name: 'engine',
    tags: ['renderer', 'bootstrap', 'assets', 'webgl2', 'webgpu'],
    about: 'backend selection and fallback, first triangle, overlay, asset loading',
    run: async (ctx) => {
      if (ctx.wants('webgl2')) {
        const b = await ctx.noGpu();
        await checkEngine(b, 'sans WebGPU', '', { backend: 'webgl2', fellBack: true }, [FALLBACK_LOG, CHROMIUM_NO_ADAPTER]);
        await checkEngine(b, 'sans WebGPU', '?renderer=webgl2', { backend: 'webgl2', fellBack: false });
        await checkEngine(b, 'sans WebGPU', '?renderer=webgpu', { backend: 'webgl2', fellBack: true }, [FALLBACK_LOG, CHROMIUM_NO_ADAPTER]);
        await checkEngine(b, 'sans WebGPU', '?forceWebGPU=true', { error: true }, [FORCE_LOG, FATAL_LOG, CHROMIUM_NO_ADAPTER]);
        if (ctx.failed()) return;
      }
      if (ctx.wants('webgpu')) {
        const b = await ctx.withGpu();
        if (!b) return;
        await checkEngine(b, 'avec WebGPU', '', { backend: 'webgpu', fellBack: false });
        await checkEngine(b, 'avec WebGPU', '?renderer=webgpu', { backend: 'webgpu', fellBack: false });
        await checkEngine(b, 'avec WebGPU', '?forceWebGPU=true', { backend: 'webgpu', fellBack: false });
        await checkEngine(b, 'avec WebGPU', '?renderer=webgl2', { backend: 'webgl2', fellBack: false });
        await checkEngine(b, 'avec WebGPU', '?renderer=bogus', { backend: 'webgpu', fellBack: false }, [IGNORED_LOG]);
      }
    },
  },
  { name: 'legacy', tags: ['legacy', 'bootstrap'], about: 'the bootstrap hands over to the legacy game, which still boots', run: async (ctx) => {
    const b = await ctx.noGpu();
    await checkLegacy(b, '');
    await checkLegacy(b, '?engine=legacy');
    await checkLegacy(b, '?engine=bogus', [BOOTSTRAP_IGNORED_LOG]);
  } },
  { name: 'clock', tags: ['lighting'], about: 'world clock in the running engine (backend-agnostic)', run: async (ctx) => checkClock(await ctx.noGpu(), 'sans WebGPU') },
  { name: 'chunk', tags: ['terrain', 'renderer'], about: 'one terrain chunk, holes, underlay', run: perBackend(checkChunk) },
  { name: 'wireframe', tags: ['terrain', 'renderer'], about: 'wireframe toggle', run: perBackend(checkWireframe, null) },
  { name: 'normals', tags: ['terrain'], about: 'vertex normals as colours', run: perBackend(checkNormals) },
  { name: 'tile', tags: ['terrain'], about: 'one tile of 256 chunks, seams, chunk bounds', run: perBackend(checkTile) },
  { name: 'map', tags: ['terrain'], about: 'sparse maps', run: perBackend(checkMap) },
  { name: 'stream', tags: ['terrain'], about: 'streaming around a moving focus, keyboard, tile borders', run: perBackend(checkStream) },
  { name: 'culling', tags: ['terrain'], about: 'frustum culling per chunk', run: perBackend(checkCulling, cullingParity) },
  { name: 'textured', tags: ['terrain', 'lighting'], about: 'texture layers, masks, light, baked shadow, fog, far terrain', run: perBackend(checkTextured) },
  { name: 'zone', tags: ['terrain', 'water', 'assets'], about: 'the test zone: asset, ground mix, sea, relief', run: perBackend(checkZone) },
  { name: 'day-cycle', tags: ['lighting'], about: 'day/night keyframes and the two suns', run: perBackend(checkDayCycle) },
  { name: 'sky', tags: ['lighting'], about: 'sky gradient and sun disc', run: perBackend(checkSky) },
  { name: 'liquid', tags: ['water'], about: 'liquid classes, animation, depth response', run: perBackend(checkLiquidClasses) },
  { name: 'boot-ready', tags: ['renderer'], about: '« ready » is announced after the first frame, overlay filled (regression)', run: perBackend(checkBootReady, null) },
  { name: 'camera', tags: ['camera', 'renderer'], about: 'gameplay camera: orbit, zoom, mouse buttons, lost releases, no context menu, pivot, collision, first person, follow, ground movement, jump, real ground and slopes, capsule collision, step-up, swimming', run: perBackend(checkCamera) },
  { name: 'building-interior', tags: ['building', 'lighting', 'renderer'], about: 'interior lighting paths, props lit by their colour, interior fog and its transition', run: perBackend(checkBuildingInterior) },
  { name: 'building-visibility', tags: ['building', 'renderer'], about: 'portal flood: the groups drawn from the camera’s room', run: perBackend(checkBuildingVisibility) },
  { name: 'building-portal', tags: ['building', 'renderer'], about: 'portal graph, current room (0 / 1 / 2 groups), portal view', run: perBackend(checkBuildingPortal) },
  { name: 'building-liquid', tags: ['building', 'water', 'renderer'], about: 'liquid surfaces of building groups: hole, kind, group visibility, animation', run: perBackend(checkBuildingLiquid) },
  { name: 'building-collision', tags: ['building', 'renderer'], about: 'building collision: player and camera face sets, rays', run: perBackend(checkBuildingCollision) },
  { name: 'building-doodads', tags: ['building', 'renderer'], about: 'props in a building: sets, group ownership, one upload per model, drawn before the blended batches', run: perBackend(checkBuildingDoodads) },
  { name: 'building', tags: ['building', 'renderer'], about: 'first building: separate groups, material batches, baked interior light, alpha test, blending', run: perBackend(checkBuilding) },
  { name: 'model', tags: ['model', 'renderer'], about: 'first model: byte vertex attributes, light, instances', run: perBackend((b, label, r) => checkModel(b, label, r, 'mesh')) },
  { name: 'character-animation', tags: ['character', 'model'], about: 'character animation state machine: walk, run, jump, attack, on the skinned mannequin', run: perBackend((b, label, r) => checkModel(b, label, r, 'character-animation')) },
  { name: 'character-equipment', tags: ['character', 'model'], about: 'equipment: painted layers, geoset changes, attached sword and shield', run: perBackend((b, label, r) => checkModel(b, label, r, 'character-equipment')) },
  { name: 'character-texture', tags: ['character', 'model'], about: 'composite texture: skin, face, underwear, hair colour, dirty-group rebuild', run: perBackend((b, label, r) => checkModel(b, label, r, 'character-texture')) },
  { name: 'character', tags: ['character', 'model'], about: 'mannequin base mesh, sections switched by geoset', run: perBackend((b, label, r) => checkModel(b, label, r, 'character')) },
  { name: 'model-fade', tags: ['model'], about: 'distance fade by size: 150 → 200 class, blended while fading, skipped beyond', run: perBackend((b, label, r) => checkModel(b, label, r, 'fade')) },
  { name: 'model-ribbon', tags: ['model'], about: 'ribbon trail: edges from a moving bone, strip of quads', run: perBackend((b, label, r) => checkModel(b, label, r, 'ribbon')) },
  { name: 'model-particles', tags: ['model', 'renderer'], about: 'particle emitter on a bone, camera-facing quads, buffer update per frame', run: perBackend((b, label, r) => checkModel(b, label, r, 'particles')) },
  { name: 'model-attach', tags: ['model'], about: 'attachment socket, child model, spherical billboard bone', run: perBackend((b, label, r) => checkModel(b, label, r, 'attach')) },
  { name: 'model-materials', tags: ['model', 'renderer'], about: 'blend modes 0–6, alpha key 224/255, unlit, two-sided, geosets', run: perBackend((b, label, r) => checkModel(b, label, r, 'materials')) },
  { name: 'model-skinning', tags: ['model', 'renderer'], about: 'GPU skinning: positions, blended weights, normals, animated', run: perBackend((b, label, r) => checkModel(b, label, r, 'skinning')) },
  { name: 'model-animation', tags: ['model'], about: 'sequences, global sequence, cross-fade, real-time clock', run: perBackend((b, label, r) => checkModel(b, label, r, 'animation')) },
  { name: 'model-skeleton', tags: ['model'], about: 'skeleton lines, rest and bend poses, toggles', run: perBackend((b, label, r) => checkModel(b, label, r, 'skeleton')) },
];

if (cli.list) {
  for (const suite of SUITES) console.log(`${suite.name.padEnd(16)} [${suite.tags.join(', ')}]  ${suite.about}`);
  server.close();
  process.exit(0);
}
const suiteNames = typeof cli.suite === 'string' ? cli.suite.split(',') : [];
const tagNames = typeof cli.tag === 'string' ? cli.tag.split(',') : [];
for (const name of suiteNames) if (name !== 'all' && !SUITES.some((x) => x.name === name)) { console.error(`smoke: unknown suite "${name}" (see --list)`); server.close(); process.exit(2); }
for (const tag of tagNames) if (!SUITES.some((x) => x.tags.includes(tag))) { console.error(`smoke: no suite has the tag "${tag}" (see --list)`); server.close(); process.exit(2); }
const selected = SUITES.filter((x) => suiteNames.includes('all') || suiteNames.includes(x.name) || x.tags.some((t) => tagNames.includes(t)));
// Suites named one by one run in the order they were named (the one being worked on first); the rest keeps the table order.
const rank = (x) => (suiteNames.includes(x.name) ? suiteNames.indexOf(x.name) : suiteNames.length + SUITES.indexOf(x));
selected.sort((x, y) => rank(x) - rank(y));
if (selected.length === 0) {
  console.error('smoke: nothing selected. Use --suite=<name>[,<name>…], --tag=<tag>, or --suite=all for the heavy validation; --list shows the suites.');
  server.close();
  process.exit(2);
}

const browsers = [];
let noGpuBrowser, gpuBrowser, gpuProbed = false;
const ctx = {
  exhaustive: Boolean(cli.exhaustive),
  wants: (backend) => BACKEND_CHOICE === 'both' || BACKEND_CHOICE === backend,
  failed: () => problems.length > 0 && !cli['keep-going'],
  // Browser A: WebGPU present but without any adapter → the real fallback situation.
  noGpu: async () => {
    if (!noGpuBrowser) browsers.push((noGpuBrowser = await launch()));
    return noGpuBrowser;
  },
  // Browser B: WebGPU enabled (software adapter) → the WebGPU backend really runs. null when it cannot here.
  withGpu: async () => {
    if (gpuProbed) return gpuBrowser ?? null;
    gpuProbed = true;
    const browser = await launch(WEBGPU_ARGS, WEBGPU_LAUNCH);
    browsers.push(browser);
    const probePage = await browser.newPage();
    await probePage.goto(BASE_URL + '?engine=new&renderer=webgl2');
    const adapter = await probePage.evaluate(async () => {
      const a = await navigator.gpu?.requestAdapter();
      return a ? `${a.info?.vendor ?? '?'}/${a.info?.architecture ?? '?'}` : null;
    });
    await probePage.close();
    if (!adapter) {
      console.log('smoke: WebGPU has no adapter in this browser even with the WebGPU launch options → WebGPU runtime NON VERIFIE');
      return null;
    }
    webgpuRan = true;
    console.log(`smoke: WebGPU adapter available in headless browser: ${adapter}`);
    gpuBrowser = browser;
    return browser;
  },
};

const started = Date.now();
const ran = [];
let stoppedAt = null;
try {
  for (const suite of selected) {
    const t0 = Date.now();
    await suite.run(ctx);
    ran.push(`${suite.name} ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    if (ctx.failed()) {
      stoppedAt = suite.name;
      break;
    }
  }
} catch (e) {
  crashed = true;
  console.error('smoke: FAIL', e);
} finally {
  for (const b of browsers) await b.close();
  server.close();
}

const seconds = ((Date.now() - started) / 1000).toFixed(0);
const backendsNote = BACKEND_CHOICE === 'webgl2' ? 'WebGL2 only (WebGPU not requested)' : `WebGPU runtime ${webgpuRan ? 'VERIFIED' : 'NON VERIFIE'}${BACKEND_CHOICE === 'webgpu' ? ' (WebGL2 not requested)' : ''}`;
if (problems.length) console.error(`smoke: FAIL${stoppedAt ? ` — stopped at suite "${stoppedAt}" (fail fast; ${selected.length - ran.length} suite(s) not run)` : ''}\n  ` + problems.join('\n  '));
else if (!crashed) console.log(`smoke: PASS — ${ran.join(' · ')} — ${seconds} s total (0 unexpected console errors/warnings, 0 page errors, 0 failed requests) — ${backendsNote}`);
process.exit(problems.length || crashed ? 1 : 0);
