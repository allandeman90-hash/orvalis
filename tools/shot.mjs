// Usage: node tools/shot.mjs out.png "js expression to evaluate before shot" [w h]
// Playwright : `npm i -D playwright` (ou chemin via la variable PLAYWRIGHT)
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const [,, out, expr = '', w = '1280', h = '720'] = process.argv;
const b = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
const errs = [];
p.on('pageerror', e => errs.push('pageerror: ' + e.message));
p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
await p.goto(new URL('../dist/test.html', import.meta.url).href);
try { await p.waitForFunction(() => window.__ready, null, { timeout: 60000 }); } catch (e) { console.log('NOT READY', errs.join('\n')); await b.close(); process.exit(1); }
if (expr) { const r = await p.evaluate(expr); if (r !== undefined) console.log('result:', JSON.stringify(r)); }
await p.waitForTimeout(200);
await p.screenshot({ path: out });
if (errs.length) console.log(errs.slice(0, 20).join('\n'));
await b.close();
