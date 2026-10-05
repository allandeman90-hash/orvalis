// Journal de quêtes (loupe), options d'interface (plaque personnelle, barres), infobulle au-dessus du sac.
export default async ({ page, shot, wait, ev }) => {
  await wait(800);
  await ev(() => { const d = window.__dbg; d.quick('templier', 0, 14, 'sp_lumiere'); d.tp(-408, 30); });
  await wait(500);
  await ev(() => { const G = window.__dbg.G; G.quests.accept('valm'); G.quests.accept('valc'); G.ui.refresh(); });
  await wait(300);
  await page.keyboard.press('KeyL');
  await wait(500);
  await page.locator('.win .qg').first().click();
  await wait(500);
  console.log('guidage via journal', JSON.stringify(await ev(() => { const G = window.__dbg.G; const t = G.quests.guideTarget(); return { guide: G.player.data.guide, label: t?.label, visible: !document.getElementById('guide').hidden }; })));
  await shot('k5_questlog');
  // bouton « Me guider » du détail
  await page.locator('.win .qgb').first().click();
  await wait(300);
  console.log('après bouton détail', await ev(() => window.__dbg.G.player.data.guide));
  await page.keyboard.press('KeyL');
  await wait(200);
  // options : Échap ouvre le menu
  await page.keyboard.press('Escape');
  await wait(500);
  const hasOpt = await page.locator('#o-self').count();
  console.log('options ouvertes', hasOpt);
  if (hasOpt) {
    await page.locator('#o-self').check();
    await page.locator('#o-b2').check();
    await page.locator('#o-b4').check();
    await wait(300);
    await shot('k5_options');
    console.log('réglages', JSON.stringify(await ev(() => { const S = window.__dbg.G.settings; return { selfPlate: S.selfPlate, bar2: S.bar2, bar3: S.bar3, bar4: S.bar4, b2: !document.getElementById('actionbar2').hidden, b4: !document.getElementById('actionbar4').hidden, plate: !!document.querySelector('.np.self') }; })));
    await page.keyboard.press('Escape');
    await wait(500);
  }
  await shot('k5_hud');
  // infobulle d'objet au-dessus du sac et de la fiche personnage
  await ev(() => { const G = window.__dbg.G, P = G.player; P.data.bag[3] = window.__mkGear({ slot: 'weapon', cls: 'templier', ilvl: 16, quality: 80 }); G.ui.refresh(); });
  await page.keyboard.press('KeyC');
  await page.keyboard.press('KeyB');
  await wait(500);
  await page.locator('.grid-slots .islot').nth(3).hover();
  await wait(300);
  const z = await ev(() => { const t = document.getElementById('tooltip'); const r = t.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + 12); return { tipVisible: !t.hidden, onTop: !!(top && t.contains(top)) }; });
  console.log('infobulle', JSON.stringify(z));
  await shot('k5_tip_over_bag');
};
