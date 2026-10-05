export default async ({ page, shot, wait, ev, key }) => {
  await ev(() => window.__dbg.quick('guerrier', 0, 15));
  const r1 = await ev(() => {
    const d = window.__dbg, G = d.G, P = G.player;
    d.tp(-100, 318);
    const out = [];
    let deaths = 0;
    for (let i = 0; i < 60; i++) {
      if (!P.target || P.target.dead) G.input.pressed.add('Tab');
      const k = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7'][i % 7];
      G.input.pressed.add(k);
      d.step(1);
      if (P.hp < P.stats.maxHp * 0.3) G.input.pressed.add('Digit9');
      if (P.dead) { deaths++; P.respawn(); d.tp(-100, 318); }
    }
    out.push('deaths ' + deaths + ' kills ' + P.data.kills + ' ' + JSON.stringify(d.state()));
    out.push('quests active: ' + Object.keys(P.data.quests.active).join(','));
    const bots = G.world.entities.filter(e => e.kind === 'bot').map(b => `${b.name}(${b.level} ${b.cls} f${b.faction}) hp${Math.round(b.hp)}/${b.stats.maxHp} tgt:${b.target ? b.target.name : '-'} ${b.dead ? 'MORT' : ''}`);
    out.push(...bots.slice(0, 12));
    out.push('chat: ' + G.ui.chatLines.slice(-10).map(l => l.html.replace(/<[^>]+>/g, '')).join(' || '));
    return out.join('\n');
  });
  console.log(r1);
  await shot('marais2');
  const r2 = await ev(() => {
    const d = window.__dbg, G = d.G;
    d.quick('mage', 1, 30);
    const P = G.player;
    d.boss();
    d.tp(G.events.boss.spawn.x, G.events.boss.spawn.z + 28);
    const out = [];
    for (let i = 0; i < 90; i++) {
      d.step(1);
      const b = G.events.boss.spawn.ent;
      if (b && !b.dead && !P.dead) { P.setTarget(b); P.engaged = b; G.input.pressed.add(['Digit1','Digit3','Digit4','Digit5'][i%4]); }
      if (P.dead) { P.respawn(); d.tp(G.events.boss.spawn.x, G.events.boss.spawn.z + 28); out.push('mort ' + i); }
      if (i % 15 === 0 && b) out.push(`t${i} boss hp=${Math.round(b.hp / b.stats.maxHp * 100)}% bots=${G.world.entities.filter(e => e.kind === 'bot' && !e.dead).length} fighting=${G.world.entities.filter(e => e.kind === 'bot' && e.target === b).length}`);
      if (b && b.dead) { out.push('BOSS MORT à ' + i); break; }
    }
    out.push(JSON.stringify(d.state()));
    return out.join('\n');
  });
  console.log(r2);
  await shot('boss2');
};
