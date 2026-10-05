// QA 4 : occlusion caméra, appels de rendu, longue simulation multi-zones, ouverture de toutes les fenêtres
export default async ({ page, shot, wait, ev }) => {
  const frame = () => ev(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
    const i = window.__dbg.G.renderer.info;
    res({ calls: i.render.calls, tris: i.render.triangles, geo: i.memory.geometries, tex: i.memory.textures });
  }))));
  await ev(() => { const d = window.__dbg; d.quick('mage', 1, 15); });
  // caméra au centre du Bastion, dos aux menhirs
  await ev(() => { const d = window.__dbg, G = d.G; d.tp(1, -40); G.cam.yaw = Math.PI * 0.5; G.cam.pitch = 0.2; G.cam.targetDist = 12; G.cam.first = true; });
  await wait(2500);
  await shot('qa_cam_bastion');
  // ville : caméra vers les maisons
  const spots = await ev(() => {
    const G = window.__dbg.G;
    return Object.keys(G.towns.spots);
  });
  console.log('town spots', spots.length);
  const perf = {};
  const places = [
    ['capitale Braise', 400, -18],
    ['capitale Azur', -408, 18],
    ['Bois-Murmure', -300, 240],
    ['Marais', 30, 330],
    ['Cime', 0, -330],
    ['Canyon', 330, 260],
  ];
  for (const [nm, x, z] of places) {
    await ev(([x, z]) => { const d = window.__dbg, G = d.G; d.tp(x, z); G.cam.first = true; G.cam.pitch = 0.3; G.cam.targetDist = 11; }, [x, z]);
    await wait(1800);
    perf[nm] = await frame();
  }
  console.log('render info:', JSON.stringify(perf));
  await ev(() => { const d = window.__dbg, G = d.G; d.tp(393, -12); G.cam.yaw = Math.PI * 1.25; G.cam.first = true; G.cam.pitch = 0.18; G.cam.targetDist = 14; });
  await wait(2200);
  await shot('qa_cam_town');
  // longue simulation : combats dans plusieurs zones de niveau adapté
  const r = await ev(() => {
    const d = window.__dbg, G = d.G, P = G.player;
    const out = [];
    const zones = ['terres', 'canyon', 'marais', 'coeur', 'pics', 'desolation'];
    let deaths = 0, kills0 = P.data.kills;
    for (const zn of zones) {
      const sp = G.world.spawns.filter((s) => s.zone === zn && !s.elite && !s.boss && !s.eventOnly);
      if (!sp.length) { out.push(zn + ': no spawns'); continue; }
      const s = sp[Math.floor(sp.length / 2)];
      // niveau du joueur adapté à la zone
      while (P.level < Math.min(30, s.level)) P.levelUp();
      P.recalc(); P.hp = P.stats.maxHp; P.mp = P.stats.maxMp;
      d.tp(s.x + 10, s.z + 10);
      const k = P.data.kills;
      for (let i = 0; i < 4; i++) {
        d.fight(15);
        if (P.dead) { deaths++; P.respawn(); d.tp(s.x + 10, s.z + 10); P.hp = P.stats.maxHp; }
      }
      out.push(zn + ' (L' + s.level + ', joueur ' + P.level + '): ' + (P.data.kills - k) + ' kills');
    }
    // toutes les fenêtres
    const ids = ['char', 'bag', 'skills', 'quests', 'map', 'group', 'ladder', 'options', 'help'];
    for (const id of ids) { G.win.open(id); G.win.close(id); }
    for (const id of ids) G.win.open(id);
    const opened = [...G.win.wins.keys()].length;
    G.win.closeAll?.();
    for (const id of ids) G.win.close(id);
    out.push('windows opened ' + opened + ', total kills ' + (P.data.kills - kills0) + ', deaths ' + deaths + ', entities ' + G.world.entities.length + ', level ' + P.level);
    return out.join('\n');
  });
  console.log(r);
  // quelques secondes de rendu réel après la simulation
  await wait(4000);
  const pf = await frame();
  const heap = await ev(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) + ' MB' : 'n/a'));
  console.log('after sim render', JSON.stringify(pf), 'heap', heap);
  await shot('qa_long');
};
