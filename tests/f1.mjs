// Bouton plein écran : présence et bascule, sur l'écran de connexion, l'écran de sélection et la barre de menus en jeu.
export default async ({ page, shot, wait, ev, key }) => {
  await wait(1200);
  const support = await ev(() => document.fullscreenEnabled);
  console.log('fullscreenEnabled (login) =', support);
  const hasTlFs = await page.$('#tl-fs');
  console.log('bouton #tl-fs présent =', !!hasTlFs);
  if (hasTlFs) {
    await shot('f1_login_before');
    await page.click('#tl-fs');
    await wait(400);
    const state1 = await ev(() => ({ fsEl: !!document.fullscreenElement, label: document.getElementById('tl-fs')?.textContent }));
    console.log('après clic #tl-fs :', JSON.stringify(state1));
    await shot('f1_login_after');
    await page.click('#tl-fs'); // remet dans l'état initial (fenêtré) avant la suite
    await wait(400);
    const state1b = await ev(() => ({ fsEl: !!document.fullscreenElement, label: document.getElementById('tl-fs')?.textContent }));
    console.log('après 2e clic #tl-fs (retour fenêtré) :', JSON.stringify(state1b));
  }
  // connexion normale -> création de personnage (aucun personnage existant sur ce profil frais)
  await page.fill('#tl-acct', 'Allan');
  await page.click('#tl-go');
  await wait(1000);
  await page.fill('#cc-name', 'Testeur');
  await page.click('#cc-go');
  await wait(2000);
  const hasMbFs = await page.$('#mb-fullscreen');
  console.log('bouton #mb-fullscreen présent =', !!hasMbFs);
  if (hasMbFs) {
    await shot('f1_hud_before');
    await page.hover('#mb-fullscreen');
    await wait(200);
    await shot('f1_hud_tip');
    await page.click('#mb-fullscreen');
    await wait(400);
    const state2 = await ev(() => ({ fsEl: !!document.fullscreenElement }));
    console.log('après clic #mb-fullscreen :', JSON.stringify(state2));
    await shot('f1_hud_after');
    await page.click('#mb-fullscreen'); // retour fenêtré
    await wait(400);
  }
  // retour au menu : personnage sauvegardé -> écran de sélection
  await ev(() => window.__dbg.G.toTitle());
  await wait(1200);
  const hasTsFs = await page.$('#ts-fs');
  console.log('bouton #ts-fs présent (écran de sélection) =', !!hasTsFs);
  if (hasTsFs) {
    await shot('f1_select');
    await page.click('#ts-fs');
    await wait(400);
    const state3 = await ev(() => ({ fsEl: !!document.fullscreenElement, label: document.getElementById('ts-fs')?.textContent }));
    console.log('après clic #ts-fs :', JSON.stringify(state3));
    await shot('f1_select_fs');
  }
  const errCount = await ev(() => window.__dbg ? 'dbg-ok' : 'no-dbg');
  console.log('__dbg toujours accessible =', errCount);
  console.log('fin de test OK');
};
