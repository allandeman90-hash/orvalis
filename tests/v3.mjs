// Captures de paysages (sans interface) pour comparer le rendu du décor.
export default async ({ ev, wait, shot }) => {
  await wait(800);
  const tag = process.env.TAG || 'after';
  const views = [
    ['val', -300, 60, 2.4, 0.2],
    ['havrebleu', -370, 30, -1.9, 0.18],
    ['bois', -300, 330, 0.6, 0.2],
    ['canyon', 300, 300, 2.8, 0.22],
    ['pics', -300, -330, 1.2, 0.2],
    ['forgecendre', 380, 60, 1.6, 0.18],
  ];
  await ev(() => { const d = window.__dbg; d.quick('guerrier', 0, 30); d.G.player.god = true; d.G.flags.fixedTime = 0.42; });
  for (const [name, x, z, yaw, pitch] of views) {
    await ev(([x, z, yaw, pitch]) => { const d = window.__dbg, G = d.G; d.tp(x, z); G.cam.yaw = yaw; G.cam.pitch = pitch; G.cam.dist = 9; G.cam.targetDist = 9; G.cam.first = true; G.ui.show(false); }, [x, z, yaw, pitch]);
    await wait(2600);
    await shot(`v3_${tag}_${name}`);
  }
};
