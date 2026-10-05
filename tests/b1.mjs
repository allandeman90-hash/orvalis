// Effets et invocations : barre des effets du joueur, suivi des squelettes (nombre, temps restant), débuffs sur la cible et sur les plaques.
export default async ({ ev, wait, shot }) => {
  await wait(800);
  const r = await ev(() => {
    const d = window.__dbg, G = d.G;
    d.quick('necro', 0, 20, 'sp_legion'); d.tp(-300, 60);
    const P = G.player;
    const m = G.world.spawnTemp('ours', P.pos.x + 7, P.pos.z + 7, null); m.level = 20; m.statsDirty = true; m.hp = 1e5;
    P.setTarget(m); G.cam.yaw = Math.atan2(7, 7);
    const used = [];
    for (const id of Object.keys(P.skills)) {
      const s = window.__q ? null : null;
      P.cds = {}; P.gcd = 0; P.cast = null; P.mp = P.stats.maxMp;
      P.useSkillById(id); d.step(P.cast ? P.cast.dur + 0.1 : 0.2);
      used.push(id);
    }
    d.step(0.5);
    const mins = G.pets.minionsOf(P).map((x) => `${x.def.name} ${Math.round(x.lifeT)}/${x.lifeMax}`);
    return { mins, myBuffs: P.buffs.map((b) => b.def.id), tBuffs: m.buffs.map((b) => b.def.id + (b.src === P ? '*' : '')) };
  });
  console.log(JSON.stringify(r));
  await wait(1500);
  const ui = await ev(() => ({ minions: document.getElementById('minions')?.innerText, buffbar: document.getElementById('buffbar')?.children[0]?.children.length, plateAuras: document.querySelectorAll('.np-auras span').length }));
  console.log(JSON.stringify(ui));
  await shot('b1_auras');
};
