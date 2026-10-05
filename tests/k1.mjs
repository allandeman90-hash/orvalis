// Talents et spécialisations : fenêtre K, apprentissage, changement de spécialisation, grimoire.
export default async ({ page, shot, wait, ev }) => {
  await wait(800);
  console.log(await ev(() => window.__dbg.quick('guerrier', 0, 18)));
  await wait(600);
  // talents vierges pour tester l'apprentissage à la main
  console.log(JSON.stringify(await ev(() => { const P = window.__dbg.G.player; P.talentReset(); return { spec: P.spec, free: P.talentsFree(), skills: Object.keys(P.skills).length }; })));
  await page.keyboard.press('KeyK');
  await wait(600);
  await shot('k1_tree_empty');
  // clique quelques nœuds
  console.log('nœuds affichés', (await page.$$('.tal-node')).length);
  for (let i = 0; i < 5; i++) { await page.locator('.tal-node').nth(0).click(); await wait(80); }
  for (let i = 0; i < 3; i++) { await page.locator('.tal-node').nth(1).click(); await wait(80); }
  await wait(300);
  const st = await ev(() => { const P = window.__dbg.G.player; return { free: P.talentsFree(), tal: JSON.stringify(P.talents), hp: P.stats.maxHp, armor: Math.round(P.stats.armor), threat: P.stats.threatMul }; });
  console.log('après clics', JSON.stringify(st));
  // survol pour l'infobulle
  await page.locator('.tal-node').nth(4).hover();
  await wait(250);
  await shot('k1_tree_tip');
  // répartition automatique puis capture
  await ev(() => { const G = window.__dbg.G, P = G.player; P.talentReset(); });
  await wait(200);
  for (let k = 0; k < 40; k++) {
    const left = await ev(() => { const P = window.__dbg.G.player; const n = document.querySelector('.tal-node.avail, .tal-node.part'); if (!n || P.talentsFree() <= 0) return -1; n.click(); return P.talentsFree(); });
    if (left < 0) break;
    await wait(60);
  }
  console.log('répartition complète', JSON.stringify(await ev(() => { const P = window.__dbg.G.player; return { free: P.talentsFree(), tal: P.talents }; })));
  await wait(400);
  await shot('k1_tree_full');
  // aperçu d'une autre spécialisation puis activation
  await page.locator('.tal-spec').nth(0).click();
  await wait(300);
  await shot('k1_preview_armes');
  await page.click('.ti-foot .btn');
  await wait(600);
  console.log(JSON.stringify(await ev(() => { const P = window.__dbg.G.player; return { spec: P.spec, threat: P.stats.threatMul, bar: P.data.bar.slice(0, 10).map((x) => x && (x.id || x.cid)) }; })));
  await shot('k1_after_switch');
  // grimoire
  await page.click('.tal-tabs button:nth-child(2)');
  await wait(400);
  await shot('k1_book');
  await page.keyboard.press('KeyK');
  await wait(300);
  await shot('k1_hud');
};
