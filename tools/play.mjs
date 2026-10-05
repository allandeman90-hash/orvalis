// Scénario de test : node tools/play.mjs scenario.js [w h]
// Le fichier scénario exporte default async ({page, shot, wait, ev, key}) => {...}
// Playwright : `npm i -D playwright` (ou chemin via la variable PLAYWRIGHT)
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const [,, scen, w = '1280', h = '720'] = process.argv;
import { mkdirSync } from 'node:fs';
const SP = process.env.SHOTS || fileURLToPath(new URL('../shots/', import.meta.url));
mkdirSync(SP, { recursive: true });
const b = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || undefined, args: ['--ignore-gpu-blocklist','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows'] });
const page = await b.newPage({ viewport: { width: +w, height: +h } });
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message + '\n' + (e.stack||'').split('\n').slice(0,4).join('\n')));
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_TUNNEL')) errs.push('console: ' + m.text()); });
await page.goto(new URL('../dist/test.html', import.meta.url).href);
try { await page.waitForFunction(() => window.__ready, null, { timeout: 90000 }); }
catch (e) { console.log('NOT READY\n' + errs.join('\n')); await b.close(); process.exit(1); }
const shot = async (name) => { await page.screenshot({ path: path.join(SP, name + '.png') }); console.log('shot', name); };
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
const key = async (k, ms = 80) => { await page.keyboard.down(k); await wait(ms); await page.keyboard.up(k); };
const mod = await import(pathToFileURL(path.resolve(scen)).href);
try { await mod.default({ page, shot, wait, ev, key }); } catch (e) { console.log('SCENARIO ERROR', e.stack); process.exitCode=1; }
if (errs.length) console.log('ERRORS:\n' + [...new Set(errs)].slice(0, 25).join('\n'));
if (errs.some(e=>e.startsWith('pageerror:'))) process.exitCode=1;
await b.close();
