// Chasseur : familier permanent, barre du familier (ordres, modes, rôles), apprivoisement, résurrection.
export default async ({ page, wait, ev, shot }) => {
  await wait(800);
  await ev(() => { const d = window.__dbg; d.quick('archer', 0, 12, 'sp_precision'); d.tp(-330, -40); });
  await wait(1500);
  const a = await ev(() => {
    const G = window.__dbg.G, P = G.player, Pt = G.pets;
    return { cls: G.player.cls, name: 'x', recs: (P.data.pets || []).map((r) => `${r.name} niv ${r.level} ${r.role}`), active: !!Pt.active, petHp: Pt.active && Math.round(Pt.active.stats.maxHp), petDmg: Pt.active && Math.round(Pt.active.stats.dmg), bar: !document.getElementById('petbar').hidden, skills: Object.keys(P.skills).filter((k) => ['a_revivre', 'a_soinfam', 'a_apprivoiser'].includes(k)) };
  });
  console.log('départ', JSON.stringify(a));
  await shot('p1_petbar');
  // rôles
  const roles = await ev(() => {
    const G = window.__dbg.G, Pt = G.pets, out = {};
    for (const r of ['tank', 'heal', 'dps']) { Pt.setRole(r); const p = Pt.active; out[r] = { hp: Math.round(p.stats.maxHp), dmg: Math.round(p.stats.dmg), armor: Math.round(p.stats.armor), threat: p.stats.threatMul }; }
    return out;
  });
  console.log('rôles', JSON.stringify(roles));
  // combat : le familier tank provoque ce qui frappe le joueur, le soigneur soigne
  const fight = await ev(() => {
    const d = window.__dbg, G = d.G, P = G.player, Pt = G.pets;
    Pt.setRole('tank');
    const mobs = [];
    for (let i = 0; i < 2; i++) { const m = G.world.spawnTemp('ours', P.pos.x + 6 + i, P.pos.z + 5, null); m.level = 12; m.statsDirty = true; mobs.push(m); }
    for (const m of mobs) { m.threat.set(P, 50); m.state = 'combat'; m.target = P; }
    P.setTarget(mobs[0]);
    Pt.command('attack');
    d.step(8);
    const onPet = mobs.filter((m) => !m.dead && m.target === Pt.active).length;
    Pt.setRole('heal');
    P.hp = P.stats.maxHp * 0.4;
    const hp0 = P.hp;
    d.step(5);
    return { onPet, alive: mobs.filter((m) => !m.dead).length, healed: Math.round(P.hp - hp0), petAlive: !Pt.active.dead };
  });
  console.log('combat', JSON.stringify(fight));
  // ordres
  const cmds = await ev(() => {
    const d = window.__dbg, G = d.G, P = G.player, Pt = G.pets;
    for (const m of G.world.entities.filter((e) => e.kind === 'mob' && e.temp)) { m.hp = 0; m.dead = true; }
    Pt.command('stay');
    const at = { x: Pt.active.pos.x, z: Pt.active.pos.z };
    P.teleport(P.pos.x + 20, P.pos.z);
    d.step(3);
    const stayDist = Math.round(Math.hypot(Pt.active.pos.x - at.x, Pt.active.pos.z - at.z));
    Pt.command('follow');
    d.step(4);
    const followDist = Math.round(Math.hypot(Pt.active.pos.x - P.pos.x, Pt.active.pos.z - P.pos.z));
    return { stayDist, followDist };
  });
  console.log('ordres', JSON.stringify(cmds));
  // apprivoisement d'une bête
  const tame = await ev(() => {
    const d = window.__dbg, G = d.G, P = G.player, Pt = G.pets;
    let m = null, bd = 1e9;
    for (const e of G.world.entities) { if (e.kind !== 'mob' || e.dead || e.temp || (e.def.family || 'bête') !== 'bête' || e.level > P.level) continue; const dd = Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z); if (dd < bd) { bd = dd; m = e; } }
    if (!m) return { none: true };
    P.teleport(m.pos.x + 6, m.pos.z);
    P.setTarget(m);
    const r = P.useSkillById('a_apprivoiser');
    d.step(6);
    return { n: P.data.pets.length, active: Pt.activeRec()?.name, tamed: m.def.name };
  });
  console.log('apprivoisement', JSON.stringify(tame));
  // mort puis résurrection
  const rev = await ev(() => {
    const d = window.__dbg, G = d.G, P = G.player, Pt = G.pets;
    Pt.active.hp = 0; Pt.active.dead = true;
    d.step(1);
    P.cds = {}; P.gcd = 0;
    P.useSkillById('a_revivre');
    d.step(3.5);
    return { alive: !!Pt.active && !Pt.active.dead, hpK: Pt.active && +(Pt.active.hp / Pt.active.stats.maxHp).toFixed(2) };
  });
  console.log('résurrection', JSON.stringify(rev));
  await page.keyboard.press('KeyY');
  await wait(500);
  await shot('p1_menagerie');
};
