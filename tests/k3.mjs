// Formes animales, comparaison d'équipement, guidage de quête, barres d'action et plaque personnelle.
export default async ({ page, wait, ev, shot }) => {
  await wait(800);
  await ev(() => { const d = window.__dbg; d.quick('druide', 0, 20, 'sp_gardien'); d.tp(-408, 30); });
  await wait(500);
  await ev(() => { const P = window.__dbg.G.player; P.useSkillById('d_ours'); window.__dbg.G.cam.yaw = P.ry + Math.PI * 0.85; });
  await wait(1200);
  await shot('k3_bear');
  console.log(JSON.stringify(await ev(() => { const P = window.__dbg.G.player; return { form: P.formKind, armor: Math.round(P.stats.armor), hp: P.stats.maxHp, basic: P.data.bar[0] }; })));
  console.log('changement de spé après forme :', await ev(() => window.__dbg.spec('sp_sauvage')), await ev(() => window.__dbg.G.player.spec));
  await wait(300);
  await ev(() => { const P = window.__dbg.G.player; P.cds = {}; P.useSkillById('d_felin'); });
  await wait(1200);
  await shot('k3_cat');
  // comparaison d'équipement
  const items = await ev(() => {
    const G = window.__dbg.G, P = G.player;
    const mk = window.__mkGear;
    P.data.equip.head = null; delete P.data.equip.head; P.refreshGear(true);
    const a = mk({ slot: 'chest', cls: 'druide', ilvl: 26, quality: 95 });
    const b = mk({ slot: 'chest', cls: 'druide', ilvl: 8, quality: 20 });
    const c = mk({ slot: 'head', cls: 'druide', ilvl: 18, quality: 60 });
    const w = mk({ slot: 'weapon', cls: 'mage', ilvl: 20, quality: 60 });
    P.data.bag[4] = a; P.data.bag[5] = b; P.data.bag[6] = c; P.data.bag[7] = w;
    G.ui.refresh();
    return [a.name, b.name, c.name, w.name];
  });
  console.log('objets', JSON.stringify(items));
  await page.keyboard.press('KeyB');
  await wait(500);
  const slots = page.locator('.grid-slots .islot');
  await slots.nth(4).hover(); await wait(250); await shot('k3_cmp_better');
  await slots.nth(5).hover(); await wait(250); await shot('k3_cmp_worse');
  await slots.nth(6).hover(); await wait(250); await shot('k3_cmp_empty');
  console.log('flèches vertes', await page.locator('.grid-slots .islot.up').count());
  await page.keyboard.press('KeyB');
  // guidage de quête
  await ev(() => { const G = window.__dbg.G; G.quests.accept('valm'); G.quests.accept('valc'); G.ui.refresh(); });
  await wait(400);
  await page.locator('#tracker .qg').first().click();
  await wait(600);
  console.log('cible', JSON.stringify(await ev(() => { const t = window.__dbg.G.quests.guideTarget(); return t && { x: Math.round(t.x), z: Math.round(t.z), label: t.label, d: Math.round(Math.hypot(t.x - window.__dbg.G.player.pos.x, t.z - window.__dbg.G.player.pos.z)) }; })));
  await shot('k3_guide');
  // regard vers l'objectif : la flèche doit pointer vers le haut
  await ev(() => { const G = window.__dbg.G, P = G.player, t = G.quests.guideTarget(); G.cam.yaw = Math.atan2(t.x - P.pos.x, t.z - P.pos.z); });
  await wait(700);
  await shot('k3_guide_facing');
  // barres d'action supplémentaires et plaque personnelle
  await ev(() => { const G = window.__dbg.G; Object.assign(G.settings, { bar2: true, bar3: true, bar4: true, selfPlate: true }); G.ui.applyBars(); const P = G.player; P.placeOnBar('d_regen'); P.placeOnBar('d_soin'); P.data.bar[12] = { k: 's', id: 'd_ecorce' }; P.data.bar[31] = { k: 'i', cid: 'pot_hp1' }; G.ui.refresh(); });
  await wait(900);
  await shot('k3_bars');
};
