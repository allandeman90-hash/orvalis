// Ensembles : pièce de raid héroïque dans le sac + infobulle ; raid héroïque débloqué après un normal.
export default async ({ ev, wait, shot }) => {
  await wait(800);
  const r = await ev(async () => {
    const d = window.__dbg, G = d.G; d.quick('necro', 0, 30); d.tp(-300, 60);
    return { ok: !!G.player, errs: (window.__errs || []).length };
  });
  console.log(JSON.stringify(r));
  await ev(() => { const G = window.__dbg.G; G.player.data.inst = { tempetes: { n: 1, best: 900 } }; G.win.toggle('lfg'); });
  await wait(800);
  await shot('i3_lfg');
};
