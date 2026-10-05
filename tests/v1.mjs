// Captures des instances : entrée, salle de monstres et salle du boss pour chaque thème.
export default async ({ shot, wait, ev }) => {
  const list = (process.env.LIST || 'meche,englouti,catacombes,givre,creuset,tempetes,cendre,abime').split(',');
  await ev(() => { const d = window.__dbg; d.quick('templier', 0, 30); d.tp(-408, 18); document.getElementById('announce').hidden = true; });
  for (const id of list) {
    await ev((id) => {
      const d = window.__dbg, G = d.G;
      if (G.inst.active) G.inst.teardown();
      d.inst(id, { fill: id !== 'abime', floor: id === 'abime' ? 7 : 1 });
      document.getElementById('zonebanner').innerHTML = '';
    }, id);
    await wait(1500);
    await shot(`v1_${id}_entry`);
    // salle de monstres
    await ev(() => {
      const d = window.__dbg, G = d.G, A = G.inst.active;
      const r = A.D.rooms[2];
      const P = G.player;
      d.tp(r.x - Math.min(8, r.hw - 3), r.z);
      P.ry = Math.PI / 2; G.cam.yaw = Math.PI / 2; G.cam.pitch = 0.35; G.cam.targetDist = 13; G.cam.first = true;
      for (const e of G.party.members) if (e !== P) e.teleport(P.pos.x - 2, P.pos.z + (Math.random() - 0.5) * 4);
      d.step(0.3);
    });
    await wait(1200);
    await shot(`v1_${id}_trash`);
    // salle du boss
    const has = await ev(() => {
      const d = window.__dbg, G = d.G, A = G.inst.active;
      const enc = A.encounters[A.encounters.length - 1];
      if (!enc) return false;
      const r = enc.r;
      d.tp(r.x, r.z + r.hd - 4);
      const P = G.player;
      P.ry = Math.PI; G.cam.yaw = Math.PI; G.cam.pitch = 0.3; G.cam.targetDist = 16; G.cam.first = true;
      d.step(1);
      return true;
    });
    if (has) { await wait(1400); await shot(`v1_${id}_boss`); }
  }
};
