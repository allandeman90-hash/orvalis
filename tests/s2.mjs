// Équilibrage des ennemis personnels : traître (chapitre 5, niveau 5) et Héraut (chapitre 15, niveau 30), pour les 8 classes.
export default async ({ page, wait, ev }) => {
  await wait(800);
  const which = process.env.WHICH || 'traitor';
  const classes = (process.env.CLASSES || 'guerrier,templier,mage,necro,archer,assassin,druide,chaman').split(',');
  for (const cls of classes) {
    const r = await ev(([cls, which]) => {
      const d = window.__dbg, G = d.G;
      const { makeGear, makeConsumable } = window.__items;
      const lvl = which === 'traitor' ? 5 : 30;
      d.quick(cls, 0, lvl);
      const P = G.player, Q = G.quests, S = G.story;
      // équipement typique de l'étape (quêtes)
      for (const slot of ['weapon', 'offhand', 'head', 'chest', 'legs', 'hands', 'feet', 'ring', 'amulet']) {
        if (slot === 'offhand' && cls === 'archer') continue;
        P.data.equip[slot] = makeGear({ slot, cls, ilvl: which === 'traitor' ? 4 : 28, quality: which === 'traitor' ? 45 : 62 });
      }
      P.refreshGear(true); P.recalc(); P.hp = P.stats.maxHp; P.mp = P.stats.maxMp;
      G.inv.add(makeConsumable(which === 'traitor' ? 'pot_hp1' : 'pot_hp3', 5));
      const ch = which === 'traitor' ? 5 : 15;
      for (const q of S.chain()) if (q.ch < ch) P.data.quests.done[q.id] = 1;
      const q = S.next();
      Q.accept(q.id);
      const o = q.obj.find((x) => x.spawnTraitor || x.spawnHerald);
      if (which !== 'traitor') P.data.quests.active[q.id].p[0] = 1;
      const sp = S.spawnPos(q, o);
      P.teleport(sp.x + 30, sp.z);
      d.step(1.2);
      const t = G.world.entities.find((e) => e.kind === 'mob' && !e.dead && e.def?.id === o.mob);
      if (!t) return { cls, none: true, sp };
      P.teleport(t.pos.x + 12, t.pos.z);
      P.setTarget(t);
      let minHp = 1, time = 0, pots = 0;
      const dt = 1 / 20;
      const hp0 = P.stats.maxHp;
      // combat pas à pas (même logique que d.fight) en relevant la vie minimale
      while (time < 150 && !t.dead && !P.dead) {
        d.fight(1);
        time += 1;
        minHp = Math.min(minHp, P.hp / P.stats.maxHp);
      }
      return { cls, spec: P.spec, lvl: P.level, tLvl: t.level, tHp: Math.round(t.stats.maxHp), tDmg: Math.round(t.stats.dmg), pHp: hp0, win: t.dead, dead: P.dead, time, minHp: Math.round(minHp * 100) + '%', pet: G.pets.active ? G.pets.active.name : null };
    }, [cls, which]);
    console.log(JSON.stringify(r));
  }
};
