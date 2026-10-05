// Captures : écran de création (point de départ = sanctuaire), départ réel au sanctuaire, sanctuaires, camp des Voilés, Héraut.
export default async ({ page, shot, wait, ev, key }) => {
  await wait(800);
  if (await page.$('#tl-go')) { await page.click('#tl-go'); await wait(500); }
  await page.fill('#cc-name', 'Brunehaut');
  await page.click('[data-f="1"]');
  await page.click('[data-c="druide"]');
  await wait(900);
  const start = await ev(() => document.querySelector('#title .start')?.innerText);
  console.log('création', JSON.stringify(start));
  await shot('v2_create');
  // création réelle : départ au sanctuaire
  await page.click('#cc-go');
  await wait(3500);
  const st = await ev(() => { const G = window.__dbg.G, P = G.player; return { name: P.name, cls: P.cls, pos: [Math.round(P.pos.x), Math.round(P.pos.z)], bind: P.data.bind, guide: P.data.guide, pet: G.pets.active?.name || null, tracker: document.getElementById('tracker').innerText.slice(0, 160) }; });
  console.log('départ', JSON.stringify(st));
  await wait(1500);
  await shot('v2_start_druide1');
  // autres sanctuaires
  for (const [cls, f] of (process.env.LIST || 'archer:0,necro:1,mage:0,chaman:1,assassin:0,templier:1').split(',').map((s) => s.split(':'))) {
    await ev(([cls, f]) => { const d = window.__dbg; d.fresh(cls, +f); const G = d.G; G.cam.first = true; }, [cls, f]);
    await wait(2600);
    await shot(`v2_sanct_${cls}${f}`);
  }
  // camp des Voilés (vue d'ensemble)
  await ev(() => { const d = window.__dbg, G = d.G; d.quick('guerrier', 0, 30); G.player.god = true; const lm = window.__zones.LANDMARK_BY_ID.voile_bois; d.tp(lm.x + 22, lm.z + 10); G.cam.yaw = Math.atan2(-22, -10); G.cam.first = true; });
  await wait(2800);
  await shot('v2_cultcamp');
  // Héraut à l'Autel des Tempêtes
  await ev(() => {
    const d = window.__dbg, G = d.G, P = G.player, S = G.story, Q = G.quests;
    for (const q of S.chain()) if (q.ch < 15) P.data.quests.done[q.id] = 1;
    const q = S.next(); Q.accept(q.id); P.data.quests.active[q.id].p[0] = 1;
    const sp = S.spawnPos(q, q.obj[1]);
    d.tp(sp.x + 11, sp.z + 4);
    d.step(1.2);
    const t = G.world.entities.find((e) => e.kind === 'mob' && !e.dead && e.storySpawn);
    if (t) { P.setTarget(t); G.cam.yaw = Math.atan2(t.pos.x - P.pos.x, t.pos.z - P.pos.z); }
    G.cam.first = true;
  });
  await wait(2500);
  await shot('v2_herald');
};
