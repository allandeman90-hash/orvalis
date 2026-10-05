// Statistiques par spécialisation (niveaux 20 et 40), équipement identique (graine fixe) : PV, armure, dégâts, menace — avec et sans forme.
export default async ({ wait, ev }) => {
  await wait(600);
  const specs = await ev(() => window.__dbg.allSpecs());
  for (const L of [20, 40]) {
    for (const [cls, sp] of specs) {
      const r = await ev(([cls, sp, L]) => {
        const d = window.__dbg, G = d.G;
        d.quick(cls, 0, L, sp);
        const P = G.player;
        // équipement standard : tout en bleu qualité 60, niveau d'objet = niveau
        for (const slot of Object.keys(P.data.equip)) P.data.equip[slot] = null;
        const R0 = Math.random;
        let a = 12345;
        Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
        try {
          for (const slot of ['head', 'amulet', 'chest', 'legs', 'hands', 'feet', 'ring', 'weapon', 'offhand']) {
            const it = window.__mkGear({ slot, cls, ilvl: Math.min(34, L), quality: 60 }); if (it) P.data.equip[slot] = it;
          }
        } finally { Math.random = R0; }
        P.refreshGear?.(true); P.recalc();
        const st = P.stats;
        const o = { sp, L, hp: Math.round(st.maxHp), armor: Math.round(st.armor), dmg: +(st.dmgMul || 1).toFixed(2), heal: +(st.healMul || 1).toFixed(2), threat: +(st.threatMul || 1).toFixed(2), crit: +(st.crit || 0).toFixed(1), block: +(st.block || 0).toFixed(1), dodge: +(st.dodge || 0).toFixed(1), taken: +(st.takenMul || 1).toFixed(2) };
        const ehp = (S) => Math.round(S.maxHp / ((1 - Math.min(0.75, S.armor / (S.armor + 40 + 20 * L))) * (1 - (S.dodge || 0) / 100) * (1 - (S.block || 0) / 200) * (S.dmgTaken || 1)));
        o.ehp = ehp(st);
        if (sp === 'sp_gardien' || sp === 'sp_sauvage') {
          P.cds = {}; P.combatT = 99;
          P.useSkillById(sp === 'sp_gardien' ? 'd_ours' : 'd_felin');
          P.recalc();
          o.formHp = Math.round(P.stats.maxHp); o.formArmor = Math.round(P.stats.armor); o.form = P.formKind; o.formEhp = ehp(P.stats);
        }
        return o;
      }, [cls, sp, L]);
      console.log(JSON.stringify(r));
      await wait(40);
    }
  }
};
