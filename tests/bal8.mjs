// Équilibrage rapide des 8 classes (combat automatique)
export default async ({ ev }) => {
  const r = await ev(() => {
    const d = window.__dbg, G = d.G;
    const zones = { 10: 'bois', 20: 'coeur', 28: 'desolation' };
    const out = [];
    for (const L of [10, 20, 28]) {
      for (const cls of ['guerrier', 'templier', 'mage', 'necro', 'archer', 'assassin', 'druide', 'chaman']) {
        d.quick(cls, 0, L);
        const P = G.player;
        const hubs = [[105, 88], [-105, 88], [100, 300], [-100, 300], [0, -40]];
        const sp = G.world.spawns.filter((s) => s.zone === zones[L] && !s.elite && !s.boss && !s.eventOnly && Math.abs(s.level - L) <= 2 && hubs.every(([hx, hz]) => Math.hypot(s.x - hx, s.z - hz) > 70));
        const s = sp[Math.floor(sp.length / 3)] || sp[0];
        d.tp(s.x + 9, s.z + 9);
        const k0 = P.data.kills;
        let deaths = 0;
        for (let i = 0; i < 12; i++) { d.fight(5); if (P.dead) { deaths++; P.respawn(); d.tp(s.x + 9, s.z + 9); P.hp = P.stats.maxHp; } }
        out.push(`L${L} ${cls.padEnd(9)} kills/min ${P.data.kills - k0} morts ${deaths} pv ${P.stats.maxHp} puissance ${Math.round(P.stats.power)}`);
        for (const p of G.pets.list.slice()) G.pets.expire(p, true);
        G.world.remove(P);
      }
    }
    return out.join('\n');
  });
  console.log(r);
};
