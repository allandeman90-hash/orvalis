// Playwright : `npm i -D playwright` (ou chemin via la variable PLAYWRIGHT)
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const b = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 900, height: 600 } });
const errs = [];
const mk = async (tag) => {
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(tag + ' pageerror: ' + e.message));
  p.on('console', m => { if (!m.text().includes('ERR_TUNNEL')) errs.push(tag + ' ' + m.type() + ': ' + m.text()); });
  await p.goto('http://localhost:8765/test.html#mockroom');
  await p.waitForFunction(() => window.__ready, null, { timeout: 90000 });
  return p;
};
const A = await mk('A'), B = await mk('B');
await A.evaluate(() => { window.__dbg.quick('guerrier', 0, 8); window.__dbg.tp(-250, 40); });
await B.evaluate(() => { window.__dbg.quick('mage', 0, 8); window.__dbg.tp(-246, 44); });
await B.evaluate(() => { const N = window.__dbg.G.net; const orig = N.handle.bind(N); N.handle = (r, e) => { console.log('B handle ' + JSON.stringify(e) + ' me=' + N.me); try { orig(r, e); } catch (x) { console.log('ERR ' + x.message); } }; });
await A.waitForTimeout(2500);
await B.bringToFront(); await B.waitForTimeout(1500);
await A.bringToFront();
console.log(await A.evaluate(() => { const G = window.__dbg.G; const r = [...G.net.remotes.values()][0]; G.net.sendPartyInvite(r); return 'A invites peer ' + r.peer + ' faction ' + r.faction; }));
await A.waitForTimeout(1500);
await B.bringToFront(); await B.waitForTimeout(2000);
console.log(await B.evaluate(() => 'B me=' + window.__dbg.G.net.me + ' prompt hidden=' + document.getElementById('prompt').hidden + ' hud hidden=' + document.getElementById('hud').hidden));
console.log(errs.filter(e => e.includes('B handle') || e.includes('ERR') || e.includes('pageerror')).slice(-12).join('\n'));
await b.close();
