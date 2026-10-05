// Toutes les spécialisations : chaque technique est lancée au moins une fois (recherche d'erreurs d'exécution).
export default async ({ wait, ev, shot }) => {
  await wait(800);
  const specs = await ev(() => Object.entries(window.__specs || {}));
  const list = await ev(() => { const S = window.__dbg.G.specsList; return S; });
  const all = await ev(() => window.__dbg.allSpecs());
  for (const [cls, spec] of all) {
    const out = await ev(({ cls, spec }) => {
      const d = window.__dbg, G = d.G;
      if (G.player) G.toTitle();
      d.quick(cls, 0, 30, spec);
      const P = G.player;
      d.tp(-330, -40);
      const mobs = [];
      for (let i = 0; i < 4; i++) mobs.push(G.world.spawnTemp('ours', P.pos.x + 5 + (i % 2) * 2, P.pos.z + 4 + Math.floor(i / 2) * 2, null));
      for (const m of mobs) { m.level = 30; m.statsDirty = true; }
      const used = [], fails = [];
      const ids = Object.keys(P.skills).filter((id) => id !== 'x_rappel' && id !== 'x_monture');
      for (const id of ids) {
        P.cds = {}; P.gcd = 0; P.cast = null; P.mp = P.stats.maxMp; P.hp = P.stats.maxHp * 0.3;
        const t = G.world.nearestEnemy(P, 40);
        if (t) { P.setTarget(t); P.faceTo(t.pos.x, t.pos.z); }
        const before = G.time;
        P.useSkillById(id);
        const ok = P.cast || (P.cds[id] || 0) > 0 || P.gcd > 0;
        (ok ? used : fails).push(id);
        d.step(P.cast ? P.cast.dur + 0.3 : 0.4);
      }
      d.step(3);
      const pets = G.pets.list.filter((p) => p.owner === P).map((p) => p.def.id);
      return { spec, basic: d.G.player && window.__basic?.(), used: used.length, fails, pets, hp: Math.round(P.hp), form: P.formKind || null };
    }, { cls, spec });
    console.log(JSON.stringify(out));
  }
};
