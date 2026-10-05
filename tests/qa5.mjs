// QA 5 : captures des fenêtres marchand, forge, personnage, compétences, carte, quêtes
export default async ({ page, shot, wait, ev }) => {
  await ev(() => {
    const d = window.__dbg, G = d.G;
    d.quick('druide', 0, 9);
    const P = G.player;
    P.data.gold = 900;
    G.inv.add(window.__mkShard(12), true);
    const rec = G.npcs.byId.get('lise');
    d.tp(rec.x, rec.z + 2.5); d.step(0.8);
    G.win.openNpc(rec.ent); G.win.open('vendor'); G.win.open('bag');
  });
  await wait(900);
  await shot('ui_vendor');
  await ev(() => {
    const d = window.__dbg, G = d.G, P = G.player;
    G.win.close('vendor'); G.win.close('npc');
    const rec = G.npcs.byId.get('gaudry');
    d.tp(rec.x, rec.z + 2.5); d.step(0.8);
    G.win.openNpc(rec.ent); G.win.open('forge');
    G.win.sel.forge = { where: 'equip', slot: 'weapon', uid: P.data.equip.weapon.uid };
    G.win.render(G.win.wins.get('forge'));
  });
  await wait(900);
  await shot('ui_forge');
  await ev(() => { const G = window.__dbg.G; G.win.close('forge'); G.win.close('npc'); G.win.close('bag'); G.win.open('char'); G.win.open('skills'); });
  await wait(900);
  await shot('ui_char_skills');
  await ev(() => { const G = window.__dbg.G; G.win.close('char'); G.win.close('skills'); G.win.open('map'); });
  await wait(1200);
  await shot('ui_map');
  await ev(() => { const G = window.__dbg.G; G.win.close('map'); G.win.open('quests'); });
  await wait(700);
  await shot('ui_quests');
};
