// Icônes peintes : barre d'action (compétences), sac, familier.
export default async ({ ev, wait, shot }) => {
  await wait(800);
  await ev(() => { const d = window.__dbg; d.quick('archer', 0, 30); d.tp(-300, 60); });
  await wait(1500);
  const r = await ev(() => { const G = window.__dbg.G; const P = G.player; return { skills: Object.keys(P.skills).length, bar: [...document.querySelectorAll('.ab, .abtn, #actionbar .slot')].length }; });
  console.log(JSON.stringify(r));
  await ev(() => window.__dbg.G.win.toggle('bag'));
  await wait(700);
  await shot('i2_bag');
  await ev(() => { const W = window.__dbg.G.win; W.toggle('bag'); W.toggle('skills'); });
  await wait(700);
  await shot('i2_skills');
};
