// Runes : butin, fusion, sertissage, statistiques, infobulles, objet mythique.
export default async ({ page, wait, ev, shot }) => {
  await wait(800);
  await ev(() => { const d = window.__dbg; d.quick('guerrier', 0, 20, 'sp_armes'); d.tp(-408, 30); });
  await wait(400);
  const r = await ev(() => {
    const G = window.__dbg.G, P = G.player, Ru = G.runes;
    const eq = P.data.equip;
    const out = { sockets: Object.fromEntries(Object.entries(eq).map(([k, it]) => [k, it ? it.sockets : null])) };
    Ru.add('str', 1, 10); Ru.add('crit', 2, 4); Ru.add('leech', 1, 3); Ru.add('fortune', 3, 1); Ru.add('sta', 5, 1);
    out.before = Ru.list().map((x) => `${x.t}${x.l}x${x.n}`).join(' ');
    Ru.fuse('str', 1);
    out.afterOne = Ru.list().map((x) => `${x.t}${x.l}x${x.n}`).join(' ');
    Ru.fuseAll();
    out.afterAll = Ru.list().map((x) => `${x.t}${x.l}x${x.n}`).join(' ');
    // objet mythique
    const w = window.__mkGear({ slot: 'weapon', cls: 'guerrier', ilvl: 30, mythic: true });
    eq.weapon = w; P.refreshGear(true);
    out.mythic = { rarity: w.rarity, sockets: w.sockets, name: w.name };
    const st0 = { str: P.stats.str, crit: +P.stats.crit.toFixed(2), leech: P.stats.leech, fortune: P.stats.fortune, hp: P.stats.maxHp };
    Ru.socket({ eq: 'weapon' }, 0, 'str', 3);
    Ru.socket({ eq: 'weapon' }, 1, 'crit', 3);
    Ru.socket({ eq: 'weapon' }, 2, 'leech', 2);
    Ru.socket({ eq: 'weapon' }, 3, 'fortune', 3);
    P.recalc();
    const st1 = { str: +P.stats.str.toFixed(2), crit: +P.stats.crit.toFixed(2), leech: +P.stats.leech.toFixed(4), fortune: P.stats.fortune, hp: P.stats.maxHp };
    out.st0 = st0; out.st1 = st1;
    out.runesInWeapon = w.runes;
    Ru.unsocket({ eq: 'weapon' }, 1);
    out.afterUnsock = Ru.list().map((x) => `${x.t}${x.l}x${x.n}`).join(' ');
    // butin simulé
    const m = { kind: 'mob', level: 30, def: { raidBoss: true }, boss: true };
    Ru.dropFromMob(m);
    out.afterRaidDrop = Ru.total();
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  await page.keyboard.press('KeyR');
  await wait(500);
  await shot('r1_fusion');
  await page.click('.rn-tabs button:nth-child(2)');
  await wait(300);
  await page.locator('.rn-sock').nth(1).click();
  await wait(300);
  await shot('r1_sertissage');
  await page.keyboard.press('KeyR');
  await page.keyboard.press('KeyB');
  await ev(() => { const G = window.__dbg.G, P = G.player; P.data.bag[3] = window.__mkGear({ slot: 'weapon', cls: 'guerrier', ilvl: 22, quality: 95 }); G.ui.refresh(); });
  await wait(400);
  await page.locator('.grid-slots .islot').nth(3).hover();
  await wait(300);
  await shot('r1_tip');
};
