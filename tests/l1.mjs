// Fenêtre de recherche de groupe : onglets, file d'attente simulée, confirmation, entrée, sortie.
export default async ({ shot, wait, ev, key, page }) => {
  await ev(() => { const d = window.__dbg; d.quick('necro', 0, 16); d.tp(-408, 18); document.getElementById('announce').hidden = true; });
  await wait(1500);
  await key('KeyU');
  await wait(600);
  await shot('l1_dungeons');
  await ev(() => { window.__dbg.G.lfg.tab = 'raid'; window.__dbg.G.win.open('lfg'); });
  await wait(400);
  await shot('l1_raids');
  await ev(() => { const G = window.__dbg.G; G.player.data.abyss = { best: 12, runs: 3 }; G.lfg.tab = 'abyss'; G.win.open('lfg'); });
  await wait(400);
  await shot('l1_abyss');
  await ev(() => { const G = window.__dbg.G; G.inst.giveEmblems(40); G.lfg.tab = 'shop'; G.win.open('lfg'); });
  await wait(400);
  await shot('l1_shop');
  // achat d'une pièce d'équipement
  const bought = await ev(() => { const G = window.__dbg.G; const before = G.player.countItem('emblem'); G.lfg.buy({ id: 'chest', slot: 'chest', cost: 22 }, 18); return [before, G.player.countItem('emblem'), G.player.data.bag.filter(Boolean).slice(-1)[0]?.name]; });
  console.log('achat', JSON.stringify(bought));
  // file d'attente : donjon adapté (Sanctuaire Englouti)
  await ev(() => { const G = window.__dbg.G; G.lfg.tab = 'dungeon'; G.lfg.sel.dungeon = 'englouti'; G.win.open('lfg'); });
  await wait(300);
  await page.click('.lfg-det .go');
  await wait(5200);
  await shot('l1_ready');
  const st = await ev(() => { const G = window.__dbg.G; return { party: G.party.members.map((m) => `${m.name}:${m.cls}:${m.level}${m.rec?.temp ? '*' : ''}`), prompt: !document.getElementById('prompt').hidden }; });
  console.log('groupe', JSON.stringify(st));
  await page.click('#pr-y');
  await wait(2500);
  await shot('l1_inside');
  const k = await ev(() => window.__dbg.G.inst.active?.key);
  console.log('instance', k);
  await key('KeyM');
  await wait(900);
  await shot('l1_map');
  await key('KeyM');
  // quitter via le suivi
  await page.click('#tracker [data-act="leave"]');
  await wait(300);
  await page.click('#pr-y');
  await wait(4000);
  const after = await ev(() => { const G = window.__dbg.G; return { active: !!G.inst.active, pos: [Math.round(G.player.pos.x), Math.round(G.player.pos.z)], party: G.party.members.length, temps: G.bots.recs.filter((r) => r.temp).length }; });
  console.log('après', JSON.stringify(after));
  await shot('l1_back');
};
