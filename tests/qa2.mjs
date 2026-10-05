export default async ({ page, shot, wait, ev, key }) => {
  const r = await ev(() => {
    const d = window.__dbg, G = d.G;
    const out = [];
    d.quick('guerrier', 0, 12);
    const P = G.player;
    P.data.gold = 5000;
    const talkTo = (id) => { const rec = G.npcs.byId.get(id); d.tp(rec.x, rec.z + 2.5); d.step(0.8); return rec.ent; };
    // marchand
    const lise = talkTo('lise');
    G.win.openNpc(lise); G.win.open('vendor'); G.win.open('bag');
    const stock = G.win.vendorStock();
    out.push('vendor stock: ' + stock.length + ' first=' + stock[0].name + ' price ' + G.win.buyPrice(stock[0]));
    const gold0 = P.data.gold;
    const it = stock.find(s => s.type === 'gear');
    const copy = { ...it, uid: it.uid + 'x' }; G.inv.add(copy, true); P.data.gold -= G.win.buyPrice(it);
    const idx = P.data.bag.indexOf(copy);
    G.inv.sell(idx);
    out.push('buy+sell gold ' + gold0 + ' -> ' + P.data.gold);
    G.win.close('vendor'); G.win.close('npc');
    // forge
    const gaudry = talkTo('gaudry');
    G.inv.add({ ...G.inv.constructor ? {} : {}, ...window.__mkShard(40) }, true);
    G.win.openNpc(gaudry); G.win.open('forge');
    G.win.sel.forge = { where: 'equip', slot: 'weapon', uid: P.data.equip.weapon.uid };
    G.win.render(G.win.wins.get('forge'));
    let ok = 0;
    for (let i = 0; i < 5; i++) { const inf = G.win.upgradeInfo(P.data.equip.weapon); if (P.data.gold >= inf.goldCost) { G.win.doUpgrade(P.data.equip.weapon, inf); ok++; } }
    out.push('forge: weapon +' + (P.data.equip.weapon.upg || 0) + ' after ' + ok + ' tries, gold ' + P.data.gold);
    G.win.close('forge'); G.win.close('npc');
    // écurie
    const bastien = talkTo('bastien');
    G.win.openNpc(bastien); G.win.open('stable');
    G.win.wins.get('stable').el.querySelector('.btn').click();
    out.push('mount: hasMount=' + P.data.hasMount + ' tier ' + P.data.mountTier);
    G.win.close('stable'); G.win.close('npc');
    P.combatT = 99;
    P.useSkillById('x_monture'); d.step(2);
    out.push('mounted=' + P.mounted + ' speed=' + P.stats.moveSpeed.toFixed(1));
    P.dismount(); d.step(0.1);
    // voyage
    P.data.discovered.push('clairbourg', 'chenevert');
    const stone = G.npcs.recs.find(r => r.id === 'travel_havrebleu');
    d.tp(stone.x, stone.z + 2); d.step(0.8);
    G.win.openNpc(stone.ent);
    const rows = G.win.wins.get('travel').el.querySelectorAll('.si');
    out.push('travel destinations: ' + rows.length);
    rows[0].click(); d.step(0.5);
    out.push('after travel pos ' + Math.round(P.pos.x) + ',' + Math.round(P.pos.z) + ' zone ' + P.lastZone.name);
    // groupe
    G.party.findGroup(); 
    return out.join('\n');
  });
  console.log(r);
  await wait(5000);
  const r2 = await ev(() => {
    const d = window.__dbg, G = d.G, P = G.player;
    d.step(3);
    const out = ['party: ' + G.party.members.map(m => m.name + '(' + m.level + ' ' + m.cls + ')').join(', ')];
    const m = G.world.spawns.filter(s => s.zone === 'bois' && s.level >= 9 && !s.elite).sort((a, b) => Math.hypot(a.x - P.pos.x, a.z - P.pos.z) - Math.hypot(b.x - P.pos.x, b.z - P.pos.z))[0];
    if (m) { d.tp(m.x + 12, m.z + 12); d.step(1); }
    const k0 = P.data.kills;
    for (let i = 0; i < 6; i++) d.fight(5);
    out.push('group fight kills ' + (P.data.kills - k0) + ' xp ' + P.data.xp + ' party alive ' + G.party.members.filter(x => !x.dead).length);
    out.push('bots following: ' + G.party.members.filter(x => x !== P).map(b => Math.round(Math.hypot(b.pos.x - P.pos.x, b.pos.z - P.pos.z)) + 'm').join(','));
    return out.join('\n');
  });
  console.log(r2);
  await shot('qa_party');
  await ev(() => { const G = window.__dbg.G; G.win.open('group'); G.win.open('ladder'); });
  await wait(600);
  await shot('qa_group');
};
