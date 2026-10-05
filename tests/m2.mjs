// Métiers : apprentissage, atouts/défauts, récolte (filon), pêche, fabrication, objets consommables.
export default async ({ page, wait, ev, shot, key }) => {
  await wait(800);
  await ev(() => { const d = window.__dbg; d.quick('guerrier', 0, 14, 'sp_armes'); d.tp(-330, -40); });
  await wait(600);
  const a = await ev(() => {
    const G = window.__dbg.G, P = G.player, Pr = G.profs;
    const s0 = { armor: Math.round(P.stats.armor), speed: +P.stats.moveSpeed.toFixed(2), crit: +P.stats.crit.toFixed(2) };
    const learned = ['mineur', 'forgeron', 'pecheur', 'cuisinier', 'joaillier'].map((id) => [id, Pr.learn(id)]);
    P.recalc();
    const s1 = { armor: Math.round(P.stats.armor), speed: +P.stats.moveSpeed.toFixed(2), crit: +P.stats.crit.toFixed(2) };
    return { learned, s0, s1, pmods: P.pmods, nodes: Pr.nodes.length, byZone: Pr.nodes.reduce((o, n) => { o[n.zone + n.kind] = (o[n.zone + n.kind] || 0) + 1; return o; }, {}) };
  });
  console.log(JSON.stringify(a));
  // récolte d'un filon
  const g = await ev(() => {
    const d = window.__dbg, G = d.G, P = G.player, Pr = G.profs;
    const n = Pr.nodes.filter((x) => x.kind === 'ore' && x.zone === 'val').sort((p, q) => Math.hypot(p.x - P.pos.x, p.z - P.pos.z) - Math.hypot(q.x - P.pos.x, q.z - P.pos.z))[0];
    P.teleport(n.x + 2.5, n.z);
    d.step(0.6);
    const hint = document.querySelector('.ihint')?.textContent;
    const r = Pr.interact();
    d.step(2.6);
    const ore = G.inv.count((it) => it.cid === 'ore1');
    return { r, ore, skill: Pr.skill('mineur'), hint, until: Math.round(n.until - G.time) };
  });
  console.log('récolte', JSON.stringify(g));
  await shot('m2_node');
  // matériaux : fabrication
  const c = await ev(() => {
    const d = window.__dbg, G = d.G, P = G.player, Pr = G.profs;
    const { makeConsumable } = window.__items;
    G.inv.add(makeConsumable('ore1', 40)); G.inv.add(makeConsumable('gem1', 4)); G.inv.add(makeConsumable('meat1', 6)); G.inv.add(makeConsumable('fish1', 4));
    const before = P.data.bag.filter((x) => x && x.type === 'gear').length;
    Pr.craft('forge_weapon1', { cls: 'guerrier' });
    d.step(2.7);
    const after = P.data.bag.filter((x) => x && x.type === 'gear').length;
    const w = P.data.bag.filter((x) => x && x.type === 'gear').slice(-1)[0];
    Pr.craft('jewel_ring1', {});
    d.step(2.7);
    return { made: after - before, weapon: w && { name: w.name, rarity: w.rarity, q: w.quality, sockets: w.sockets, crafted: w.crafted }, skill: Pr.skill('forgeron'), jewel: Pr.skill('joaillier') };
  });
  console.log('fabrication', JSON.stringify(c));
  await key('KeyN');
  await wait(500);
  await ev(() => { const W = window.__dbg.G.win; W.sel.prof = 'forgeron'; W.render(W.wins.get('profs')); });
  await wait(300);
  await shot('m2_window');
  await key('KeyN');
  // pêche au lac du Val
  const f = await ev(() => {
    const d = window.__dbg, G = d.G, P = G.player, Pr = G.profs;
    // rive est du lac du Val : on se place à 6 m de l'eau, face à elle
    const T = window.__terrain;
    let sx = -200;
    while (sx > -300 && T.waterDepth(sx, -95) < 0.6) sx -= 1;
    P.teleport(sx + 6, -95); P.ry = -Math.PI / 2;
    d.step(0.3);
    const w = Pr.waterAhead();
    const r = Pr.interact();
    d.step(7.5);
    return { w: !!w, r, fish: G.inv.count((it) => it.cid === 'fish1' || it.cid === 'bottle'), skill: Pr.skill('pecheur') };
  });
  console.log('pêche', JSON.stringify(f));
  // plat et élixir
  const u = await ev(() => {
    const d = window.__dbg, G = d.G, P = G.player, Pr = G.profs;
    const { makeConsumable } = window.__items;
    Pr.craft('cook_m1', {});
    d.step(1.8);
    const idx = P.data.bag.findIndex((x) => x && x.cid === 'dish_m1');
    const sta0 = P.stats.sta;
    if (idx >= 0) P.useBagItem(idx);
    P.recalc();
    G.inv.add(makeConsumable('elix_str2', 1));
    const i2 = P.data.bag.findIndex((x) => x && x.cid === 'elix_str2');
    const str0 = P.stats.str;
    P.useBagItem(i2); P.recalc();
    return { dish: idx >= 0, staGain: +(P.stats.sta - sta0).toFixed(1), strGain: +(P.stats.str - str0).toFixed(1), cook: Pr.skill('cuisinier'), buffs: P.buffs.map((b) => b.def.id) };
  });
  console.log('consommables', JSON.stringify(u));
};
