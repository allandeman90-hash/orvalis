export default async ({ page, shot, wait, ev, key }) => {
  await ev(() => window.__dbg.quick('guerrier', 0, 1));
  await ev(() => { const s = window.__dbg.G.world.spawns.find(s => s.mob === 'loup_pres'); window.__dbg.tp(s.x + 3, s.z + 3); });
  await ev(() => window.__dbg.step(0.6));
  const r = await ev(() => {
    const d = window.__dbg, G = d.G, P = G.player;
    const out = [];
    G.input.pressed.add('Tab'); d.step(0.05);
    const T = P.target;
    out.push('target=' + T.name + ' lvl ' + T.level + ' hp=' + T.hp.toFixed(1) + '/' + T.stats.maxHp + ' armor=' + T.stats.armor + ' dodge=' + T.stats.dodge);
    out.push('P power=' + P.stats.power.toFixed(1) + ' dmgMul=' + P.stats.dmgMul + ' crit=' + P.stats.crit);
    const hp0 = T.hp;
    P.useBarSlot(0);
    out.push('immediately after: hp=' + T.hp.toFixed(1) + ' tappers=' + T.tappers.size + ' state=' + T.state);
    d.step(0.2);
    out.push('after 0.2s: hp=' + T.hp.toFixed(1) + ' combatT=' + T.combatT.toFixed(2));
    d.step(2);
    out.push('after 2s: hp=' + T.hp.toFixed(1));
    return out.join('\n');
  });
  console.log(r);
};
