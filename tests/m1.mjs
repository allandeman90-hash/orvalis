// Multijoueur simulé (deux onglets, salle imitée) : familiers visibles, invitation de groupe et d'instance.
export default async ({ page: p0, wait }) => {
  const url = p0.url().split('#')[0] + '#mockroom';
  const ctx = await p0.context().browser().newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const shot = async (n) => { await page.screenshot({ path: (process.env.SHOTS || '') + n + '.png' }); console.log('shot', n); };
  await page.goto(url);
  await page.waitForFunction(() => window.__ready, null, { timeout: 90000 });
  const B = await ctx.newPage();
  await B.setViewportSize({ width: 1280, height: 720 });
  await B.goto(url);
  await B.waitForFunction(() => window.__ready, null, { timeout: 90000 });
  const evA = async (fn, a) => { await page.bringToFront(); await wait(250); return page.evaluate(fn, a); };
  const evB = async (fn, a) => { await B.bringToFront(); await wait(250); return B.evaluate(fn, a); };
  await evA(() => { const d = window.__dbg, G = d.G; d.quick('guerrier', 0, 20); d.tp(-408, 18); G.player.data.name = 'Alpha'; G.player.name = 'Alpha'; G.pets.learn({ type: 'petstone', mob: 'loup_pres', prar: 2, pq: 80, name: 'x' }); });
  await evB(() => { const d = window.__dbg, G = d.G; d.quick('mage', 0, 20); d.tp(-404, 22); G.player.data.name = 'Beta'; G.player.name = 'Beta'; });
  await wait(1500); await evA(() => 0); await wait(1500); await evB(() => 0); await wait(1500);
  const seen = await evB(() => { const G = window.__dbg.G; return { remotes: [...G.net.remotes.values()].map((r) => r.name), pets: G.world.entities.filter((e) => e.remotePet).map((e) => `${e.name} (${e.owner.name})`) }; });
  console.log('B voit', JSON.stringify(seen));
  const pa = await evA(() => { const G = window.__dbg.G; return { pet: G.pets.active?.name, remotes: [...G.net.remotes.values()].map((r) => r.name) }; });
  console.log('A familier', JSON.stringify(pa));
  // groupe : A invite B
  await evA(() => { const G = window.__dbg.G; const r = [...G.net.remotes.values()][0]; G.net.sendPartyInvite(r); });
  // attend que l'invitation arrive chez B (les onglets en arrière-plan sont ralentis)
  for (let i = 0; i < 12; i++) { await wait(500); await evA(() => 0); if (await evB(() => !document.getElementById('prompt').hidden)) break; }
  await evB(() => document.getElementById('pr-y')?.click());
  await wait(1000); await evA(() => 0); await wait(1000);
  const grp = await evA(() => window.__dbg.G.party.members.map((m) => m.name));
  console.log('B groupe', JSON.stringify(await evB(() => { const G = window.__dbg.G; const r = [...G.net.remotes.values()][0]; window.__r = r; const lg = G.ui.log.bind(G.ui); G.ui.log = (t, c) => { (window.__logs ||= []).push(t); lg(t, c); }; return { members: G.party.members.map((m) => m.name), pw: r.partyWith, same: G.party.members.includes(r) }; })));
  console.log('groupe A', JSON.stringify(grp));
  // A entre dans un donjon avec l'IA : B reçoit l'invitation
  await evA(() => { window.__dbg.inst('catacombes'); });
  await wait(1500); await evB(() => 0); await wait(1500);
  console.log('B après', JSON.stringify(await evB(() => { const G = window.__dbg.G; const r = [...G.net.remotes.values()][0]; return { sameObj: r === window.__r, members: G.party.members.map((m) => m.name), logs: (window.__logs || []).slice(-8) }; })));
  console.log('A events', JSON.stringify(await evA(() => window.__dbg.G.net.events.map((e) => e.slice(0, 3)))));
  const ask = await evB(() => ({ prompt: !document.getElementById('prompt').hidden, text: document.querySelector('#prompt .t')?.textContent, lastSeq: [...window.__dbg.G.net.remotes.values()][0]?.lastSeq, partyWith: [...window.__dbg.G.net.remotes.values()][0]?.partyWith }));
  console.log('B invitation', JSON.stringify(ask));
  for (let i = 0; i < 12 && !ask.prompt; i++) { await wait(500); await evA(() => 0); if (await evB(() => !document.getElementById('prompt').hidden)) break; }
  await evB(() => document.getElementById('pr-y')?.click());
  for (let i = 0; i < 12; i++) { await wait(500); await evA(() => 0); if (await evB(() => !!window.__dbg.G.inst.active)) break; }
  const keys = [await evA(() => window.__dbg.G.inst.active?.key), await evB(() => window.__dbg.G.inst.active?.key)];
  console.log('clés', JSON.stringify(keys), keys[0] === keys[1] ? 'IDENTIQUES' : 'DIFFÉRENTES');
  const vis = await evB(() => { const G = window.__dbg.G; const r = [...G.net.remotes.values()][0]; return { visible: r.visible, dist: Math.round(Math.hypot(r.pos.x - G.player.pos.x, r.pos.z - G.player.pos.z)), spawns: G.inst.active?.spawns.length }; });
  console.log('B voit A dans le donjon', JSON.stringify(vis));
  const sp = await evA(() => window.__dbg.G.inst.active?.spawns.length);
  console.log('monstres A', sp);
  await shot('m1_A');
  await B.screenshot({ path: (process.env.SHOTS || '') + 'm1_B.png' });
};
