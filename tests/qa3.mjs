// QA 3 : caravanes, Bastion, hôtel des ventes, sauvegarde → rechargement → liste des personnages → jouer
export default async ({ page, shot, wait, ev, key }) => {
  const r = await ev(() => {
    const d = window.__dbg, G = d.G;
    const out = [];
    d.quick('archer', 0, 20);
    const P = G.player;
    P.data.gold = 3000;
    // ---------------- caravanes ----------------
    G.events.spawnCaravans();
    const cars = G.events.caravans.slice();
    out.push('caravans: ' + cars.map(c => c.name + ' f' + c.faction + ' path ' + c.path.length + ' pts, start ' + Math.round(c.pos.x) + ',' + Math.round(c.pos.z)).join(' | '));
    const enemy = cars.find(c => c.faction !== P.faction);
    const p0 = { x: enemy.pos.x, z: enemy.pos.z, pi: enemy.pi };
    d.tp(enemy.pos.x + 8, enemy.pos.z + 8);
    d.step(8);
    out.push('enemy caravan moved ' + Math.round(Math.hypot(enemy.pos.x - p0.x, enemy.pos.z - p0.z)) + ' m, pi ' + p0.pi + ' -> ' + enemy.pi + ', hp ' + enemy.hp);
    // attaque de la caravane ennemie (PV réduits pour le test)
    enemy.hp = 400;
    const fame0 = P.data.fame, gold0 = P.data.gold;
    P.setTarget(enemy);
    for (let i = 0; i < 200 && !enemy.dead; i++) {
      const dd = Math.hypot(enemy.pos.x - P.pos.x, enemy.pos.z - P.pos.z);
      G.cam.yaw = Math.atan2(enemy.pos.x - P.pos.x, enemy.pos.z - P.pos.z);
      if (dd > 14) G.input.down.add('KeyW'); else { G.input.down.delete('KeyW'); if (i % 4 === 0) G.input.pressed.add('Digit1'); }
      d.step(0.1);
    }
    G.input.down.delete('KeyW');
    d.step(0.6);
    out.push('enemy caravan dead=' + enemy.dead + ' tapped=' + enemy.tappedByMe + ' fame ' + fame0 + ' -> ' + P.data.fame + ' gold ' + gold0 + ' -> ' + P.data.gold);
    // caravane alliée : on la téléporte presque à destination pour valider l'arrivée
    const mine = cars.find(c => c.faction === P.faction);
    mine.pi = Math.max(1, mine.path.length - 1);
    const last = mine.path[mine.path.length - 2];
    mine.teleport(last.x, last.z);
    d.tp(last.x + 4, last.z + 4);
    const f1 = P.data.fame;
    for (let i = 0; i < 40 && G.events.caravans.includes(mine); i++) d.step(0.5);
    out.push('ally caravan arrived=' + !G.events.caravans.includes(mine) + ' fame ' + f1 + ' -> ' + P.data.fame);
    // ---------------- Bastion ----------------
    const lm = { x: 0, z: -40 };
    const B = G.events.bastion;
    B.owner = 1; B.p = 100; G.events.applyBastionOwner(true);
    out.push('player dead before bastion: ' + P.dead);
    if (P.dead) P.respawn();
    d.tp(lm.x + 2, lm.z + 2);
    // on éloigne les bots et les monstres pour mesurer la capture en solo
    const clear = () => {
      for (const e of G.world.entities) if ((e.kind === 'bot' || e.kind === 'mob') && Math.hypot(e.pos.x - lm.x, e.pos.z - lm.z) < 40) e.teleport(e.pos.x + 90, e.pos.z + 90);
      P.hp = P.stats.maxHp;
    };
    const b0 = B.p;
    for (let i = 0; i < 10; i++) { clear(); d.step(1); }
    out.push('bastion p ' + b0 + ' -> ' + B.p.toFixed(1) + ' owner ' + B.owner);
    for (let i = 0; i < 60 && B.owner !== 0; i++) { clear(); d.step(1); }
    out.push('bastion captured owner=' + B.owner + ' p=' + B.p + ' buff=' + !!P.buffs.find(b => b.def.id === 'bastion'));
    return out.join('\n');
  });
  console.log(r);
  await wait(800);
  await shot('qa_bastion');
  // ---------------- hôtel des ventes ----------------
  const r2 = await ev(() => {
    const d = window.__dbg, G = d.G, P = G.player;
    const out = [];
    const rec = G.npcs.recs.find(x => x.role === 'auction' && x.faction === P.faction) || G.npcs.recs.find(x => x.role === 'auction');
    out.push('auction npc: ' + (rec ? rec.name + ' @' + Math.round(rec.x) + ',' + Math.round(rec.z) : 'NONE'));
    if (rec) { d.tp(rec.x, rec.z + 2.5); d.step(0.8); G.win.openNpc(rec.ent); }
    G.win.open('market'); G.win.open('bag');
    const w = G.win.wins.get('market').el;
    const rows = w.querySelectorAll('.market-row:not(.market-head)');
    out.push('market rows ' + rows.length + ' listings ' + G.market.listings.length);
    const btn = [...w.querySelectorAll('.market-row .btn')].find(b => !b.disabled);
    const g0 = P.data.gold, n0 = P.data.bag.filter(Boolean).length;
    if (btn) btn.click();
    out.push('bought: gold ' + g0 + ' -> ' + P.data.gold + ' bag ' + n0 + ' -> ' + P.data.bag.filter(Boolean).length);
    // mise en vente
    const it = P.data.bag.find(x => x && x.type === 'gear');
    if (it) {
      G.win.sel.sell = it.uid; G.win.open('market', { tab: 'sell' });
      const w2 = G.win.wins.get('market').el;
      w2.querySelector('#mk-price').value = String(Math.max(1, Math.round(G.market.suggested(it) * 0.8)));
      [...w2.querySelectorAll('.btn')].find(b => b.textContent === 'Mettre en vente').click();
      out.push('listed: ' + (P.data.listings || []).length + ' mine');
      // on accélère les ventes
      const g1 = P.data.gold;
      for (let i = 0; i < 12 && P.data.listings.length; i++) { G.market.t = 0; G.market.update(0.01); }
      out.push('after market ticks listings ' + P.data.listings.length + ' gold ' + g1 + ' -> ' + P.data.gold);
    }
    G.win.open('market', { tab: 'buy' });
    return out.join('\n');
  });
  console.log(r2);
  await wait(700);
  await shot('qa_market');
  // ---------------- sauvegarde → rechargement ----------------
  const r3 = await ev(() => {
    const d = window.__dbg, G = d.G, P = G.player;
    G.win.closeAll?.();
    P.data.gold = 4242;
    G.saveNow();
    const code = G.exportSave();
    window.__code = code;
    return 'saved id ' + P.data.id + ' name ' + P.data.name + ' lvl ' + P.level + ' code ' + code.slice(0, 12) + '… (' + code.length + ' chars)';
  });
  console.log(r3);
  await page.reload();
  await page.waitForFunction(() => window.__ready, null, { timeout: 90000 });
  await wait(1500);
  if (await page.$('#tl-go')) { await page.click('#tl-go'); await wait(800); }
  await shot('qa_title_list');
  const r4 = await ev(() => {
    const G = window.__dbg.G;
    const cards = document.querySelectorAll('#title .ch');
    const b = document.getElementById('tt-play');
    return 'title chars in DOM ' + cards.length + ' play button ' + !!b + ' mode ' + G.mode;
  });
  console.log(r4);
  await ev(() => document.getElementById('tt-play')?.click());
  await wait(2500);
  const r5 = await ev(() => {
    const G = window.__dbg.G, P = G.player;
    return 'after reload: mode ' + G.mode + ' name ' + P?.data.name + ' lvl ' + P?.level + ' gold ' + P?.data.gold + ' zone ' + P?.lastZone?.name + ' pos ' + Math.round(P?.pos.x) + ',' + Math.round(P?.pos.z);
  });
  console.log(r5);
  // import d'un code
  const r6 = await ev(() => {
    const G = window.__dbg.G;
    const ok = G.importSave(G.exportSave());
    const bad = G.importSave('ORV1.xxxx');
    return 'import ok=' + ok + ' bad=' + bad + ' chars now ' + JSON.parse(localStorage.getItem('orvalis.save.v1')).chars.length;
  });
  console.log(r6);
  await wait(1200);
  await shot('qa_reloaded');
};
