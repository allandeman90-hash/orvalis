export default async ({ page, shot, wait, ev, key }) => {
  const res = await ev(() => {
    const d = window.__dbg, G = d.G;
    const spots = { 3: 'loup_pres', 8: 'araignee', 15: 'crocodile', 22: 'gargouille', 28: 'golem_obsidienne' };
    const out = [];
    for (const cls of ['guerrier', 'mage', 'archer', 'druide']) {
      for (const lvl of [3, 8, 15, 22, 28]) {
        d.quick(cls, 0, lvl);
        const P = G.player;
        const mob = spots[lvl];
        const sp = G.world.spawns.filter(s => s.mob === mob).sort((a, b) => Math.abs(a.level - lvl) - Math.abs(b.level - lvl))[0];
        d.tp(sp.x + 14, sp.z + 14);
        d.step(0.6);
        const k0 = P.data.kills, t0 = G.time;
        let deaths = 0, minHp = 1;
        for (let r = 0; r < 12; r++) {
          d.fight(5);
          minHp = Math.min(minHp, P.hp / P.stats.maxHp);
          if (P.dead) { deaths++; P.respawn(); d.tp(sp.x + 14, sp.z + 14); }
        }
        const kills = P.data.kills - k0;
        out.push(`${cls.padEnd(8)} L${String(lvl).padEnd(2)} vs ${mob} (lvl ${sp.level}): kills=${kills} in 60s, deaths=${deaths}, minHp=${Math.round(minHp * 100)}%, power=${Math.round(P.stats.power)}, hp=${P.stats.maxHp}, armor=${Math.round(P.stats.armor)}`);
        G.party.leave();
        for (const e of G.world.entities.slice()) G.world.remove(e);
        for (const s of G.world.spawns) s.ent = null;
        for (const r of G.npcs.recs) r.ent = null;
        for (const r of G.bots.recs) r.ent = null;
      }
    }
    return out.join('\n');
  });
  console.log(res);
};
