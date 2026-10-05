export default async ({ page, shot, wait, ev, key }) => {
  const r = await ev(() => {
    const d = window.__dbg, G = d.G;
    const out = [];
    d.quick('archer', 0, 1);
    const P = G.player;
    const Q = G.quests;
    const talkTo = (id) => { const rec = G.npcs.byId.get(id); d.tp(rec.x, rec.z + 2.5); d.step(0.8); return rec; };
    // chaîne du Val
    talkTo('isaure'); Q.accept('val1');
    talkTo('gaspard'); out.push('val1 complete: ' + Q.complete('val1'));
    Q.accept('val2'); Q.accept('val3');
    talkTo('mathurin'); Q.accept('val4');
    out.push('active: ' + Object.keys(P.data.quests.active).join(','));
    // tuer 6 loups
    const wolf = G.world.spawns.filter(s => s.mob === 'loup_pres').sort((a, b) => a.level - b.level)[0];
    d.tp(wolf.x + 10, wolf.z + 10); d.step(0.6);
    let guard = 0;
    while (Q.objProgress(window.__q('val2'), 0) < 6 && guard++ < 40) { d.fight(4); if (P.dead) { P.respawn(); d.tp(wolf.x + 10, wolf.z + 10); } }
    out.push('val2 progress ' + Q.objProgress(window.__q('val2'), 0) + ' lvl ' + P.level + ' kills ' + P.data.kills + ' xp ' + P.data.xp);
    // grignoteurs
    const gr = G.world.spawns.filter(s => s.mob === 'grignoteur').sort((a, b) => a.level - b.level)[0];
    d.tp(gr.x + 10, gr.z + 10); d.step(0.6);
    guard = 0;
    while (Q.objProgress(window.__q('val3'), 0) < 5 && guard++ < 50) { d.fight(4); if (P.dead) { P.respawn(); d.tp(gr.x + 10, gr.z + 10); } }
    out.push('val3 progress ' + Q.objProgress(window.__q('val3'), 0) + ' lvl ' + P.level);
    talkTo('gaspard');
    out.push('val2 done ' + Q.complete('val2') + ', val3 done ' + Q.complete('val3') + ' lvl ' + P.level + ' gold ' + P.data.gold);
    out.push('bag: ' + P.data.bag.filter(Boolean).map(i => i.name + (i.count > 1 ? '×' + i.count : '')).join(', '));
    // exploration
    Q.accept('valm');
    const lm = { x: -390, z: -110 };
    d.tp(lm.x + 5, lm.z + 5); d.step(1.2);
    out.push('valm explore ' + Q.objProgress(window.__q('valm'), 0));
    // mort
    P.hp = 1; d.step(0.1);
    const m = G.world.entities.find(e => e.kind === 'mob' && !e.dead && !e.passive);
    if (m) { m.threat.set(P, 99); m.state = 'combat'; }
    let t = 0; while (!P.dead && t++ < 100) d.step(0.2);
    out.push('dead ' + P.dead + ' death overlay hidden=' + document.getElementById('death').hidden);
    P.respawn();
    out.push('respawned at ' + Math.round(P.pos.x) + ',' + Math.round(P.pos.z) + ' hp ' + Math.round(P.hp));
    return out.join('\n');
  });
  console.log(r);
};
