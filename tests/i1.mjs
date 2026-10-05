// Icônes peintes : barre de menu + rôles (planche « Menu et rôles »).
export default async ({ ev, wait, shot }) => {
  await wait(800);
  await ev(() => { const d = window.__dbg; d.quick('guerrier', 0, 10); d.tp(-300, 60); });
  await wait(1200);
  const r = await ev(() => [...document.querySelectorAll('#menubar .mb, .mb')].slice(0, 13).map((b) => b.style.backgroundImage.slice(0, 30)));
  console.log(JSON.stringify(r));
  await shot('i1_menu');
  await ev(() => window.G?.win?.toggle ? window.G.win.toggle('lfg') : window.__dbg.G.win.toggle('lfg'));
  await wait(600);
  await shot('i1_lfg');
};
