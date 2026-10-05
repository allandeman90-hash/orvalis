export default async ({ page, shot, wait, ev, key }) => {
  await wait(800);
  if (await page.$('#tl-go')) { await page.click('#tl-go'); await wait(500); }
  await shot('title1');
  // création
  await page.fill('#cc-name', 'Aldéric');
  await page.click('[data-c="archer"]');
  await wait(300);
  await page.click('[data-f="1"]');
  await wait(600);
  await shot('create1');
  await page.click('#cc-go');
  await wait(1500);
  console.log(JSON.stringify(await ev(() => window.__dbg.state())));
  const r = await ev(() => {
    const d = window.__dbg, G = d.G;
    d.step(3);
    const ents = G.world.entities;
    const kinds = {};
    for (const e of ents) kinds[e.kind] = (kinds[e.kind] || 0) + 1;
    return JSON.stringify({ kinds, bots: G.bots.recs.length, online: G.bots.online().length, chat: G.ui.chatLines.length, listings: G.market.listings.length });
  });
  console.log(r);
  await shot('game1');
};
