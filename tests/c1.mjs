// Nouvelles classes : alignement des modèles, combat de chaque classe, familiers et invocations
export default async ({ page, shot, wait, ev }) => {
  await ev(() => { const d = window.__dbg, G = d.G; d.quick('guerrier', 0, 14); d.tp(-300, 120); G.cam.yaw = 0; G.cam.pitch = 0.1; G.cam.targetDist = 7; G.cam.first = true; d.lineup(0); document.getElementById('announce').hidden = true; document.getElementById('zonebanner').hidden = true; });
  await wait(2500);
  await shot('c1_lineup_azur');
  await ev(() => { const d = window.__dbg, G = d.G; for (const m of window.__lineup) G.scene.remove(m.root); d.lineup(1, 28, 95); });
  await wait(1500);
  await shot('c1_lineup_braise');
  const r = await ev(() => {
    const d = window.__dbg, G = d.G;
    for (const m of window.__lineup) G.scene.remove(m.root);
    const out = [];
    for (const cls of ['templier', 'assassin', 'necro', 'chaman']) {
      d.quick(cls, 0, 20);
      const P = G.player;
      const sp = G.world.spawns.filter((s) => s.zone === 'coeur' && !s.elite && !s.boss && !s.eventOnly);
      const s = sp[5];
      d.tp(s.x + 8, s.z + 8);
      // barre : toutes les compétences apprises
      const k0 = P.data.kills;
      let casts = 0;
      const used = new Set();
      for (let i = 0; i < 240 && !P.dead; i++) {
        if (!P.target || P.target.dead) { const t = G.world.nearestEnemy(P, 60, false); if (t && t.kind === 'mob') { P.setTarget(t); P.engaged = t; } }
        const t = P.target;
        G.input.down.delete('KeyW');
        if (t && !t.dead) {
          const dd = Math.hypot(t.pos.x - P.pos.x, t.pos.z - P.pos.z);
          G.cam.yaw = Math.atan2(t.pos.x - P.pos.x, t.pos.z - P.pos.z);
          const melee = cls === 'templier' || cls === 'assassin';
          if (dd > (melee ? 3 : 20)) G.input.down.add('KeyW');
          else {
            const ids = Object.keys(P.skills).filter((id) => id !== 'x_rappel' && id !== 'x_monture');
            const id = ids[i % ids.length];
            const before = P.cds[id] || 0;
            P.useSkillById(id);
            if ((P.cds[id] || 0) > before || P.cast) { casts++; used.add(id); }
          }
        }
        d.step(0.25);
        if (P.hp < P.stats.maxHp * 0.3) P.hp = P.stats.maxHp;
      }
      G.input.down.delete('KeyW');
      const minions = G.pets.list.filter((p) => p.owner === P).length;
      out.push(`${cls}: kills ${P.data.kills - k0}, sorts ${casts}, compétences utilisées ${used.size}/${Object.keys(P.skills).length - 1}, invocations ${minions}, vie ${Math.round(P.hp)}/${P.stats.maxHp}, puissance ${Math.round(P.stats.power)} soin ${Math.round(P.stats.healPower)}`);
      G.world.remove(P);
    }
    return out.join('\n');
  });
  console.log(r);
  // familiers : chance forcée
  const r2 = await ev(() => {
    const d = window.__dbg, G = d.G;
    d.quick('archer', 0, 12);
    const P = G.player;
    G.flags.petLuck = 400;
    const sp = G.world.spawns.filter((s) => s.zone === 'bois' && !s.elite && !s.boss && !s.eventOnly);
    d.tp(sp[3].x + 8, sp[3].z + 8);
    for (let i = 0; i < 6; i++) { d.fight(5); if (P.dead) { P.respawn(); d.tp(sp[3].x + 8, sp[3].z + 8); } }
    G.flags.petLuck = 1;
    const stones = P.data.bag.filter((x) => x && x.type === 'petstone');
    const out = ['pierres: ' + stones.map((s) => s.name + ' r' + s.prar + ' q' + s.pq).join(', ')];
    for (const st of stones) { const idx = P.data.bag.indexOf(st); P.useBagItem(idx); }
    d.step(1);
    out.push('ménagerie: ' + (P.data.pets || []).map((p) => p.name + ' niv' + p.level).join(', ') + ' actif=' + (G.pets.active?.name || 'aucun'));
    const k0 = P.data.kills;
    for (let i = 0; i < 6; i++) { d.fight(5); if (P.dead) { P.respawn(); } }
    const pet = G.pets.active;
    out.push('après combat : kills ' + (P.data.kills - k0) + ' familier ' + (pet ? pet.name + ' niv ' + pet.level + ' pv ' + Math.round(pet.hp) + '/' + pet.stats.maxHp + ' dist ' + Math.round(Math.hypot(pet.pos.x - P.pos.x, pet.pos.z - P.pos.z)) : 'aucun') + ' xp ' + Math.round(G.pets.activeRec()?.xp || 0));
    return out.join('\n');
  });
  console.log(r2);
  await ev(() => { const G = window.__dbg.G; G.win.open('pets'); });
  await wait(1200);
  await shot('c1_pets');
};
