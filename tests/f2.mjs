// Fluidité : ombres selon la distance, créatures lointaines masquées, qualité automatique par paliers, compteur d'images.
export default async ({ ev, wait, shot }) => {
  await wait(800);
  await ev(() => { const d = window.__dbg; d.quick('mage', 0, 20); d.tp(-395, 20); });
  await wait(3000);
  const a = await ev(() => {
    const G = window.__dbg.G, P = G.player, Pf = G.perf;
    Pf.lod();
    let sh = 0, noSh = 0, hidden = 0, shown = 0;
    for (const e of G.world.entities) {
      if (!e.model || e === P) continue;
      const d = Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z);
      if (e._lodShadow) sh++; else noSh++;
      if (!e.model.root.visible && d > 120) hidden++; else if (e.model.root.visible) shown++;
    }
    const calls = G.renderer.info.render.calls;
    return { sh, noSh, hidden, shown, calls };
  });
  console.log('lod', JSON.stringify(a));
  const b = await ev(() => {
    const G = window.__dbg.G, Pf = G.perf, out = [];
    G.flags.perfTest = true; G.settings.showFps = true;
    const pr0 = G.renderer.getPixelRatio();
    for (let i = 0; i < 400; i++) Pf.frame(30); // 33 i/s pendant ~12 s
    out.push({ lvlSlow: Pf.level, pr: +G.renderer.getPixelRatio().toFixed(2), shadows: G.renderer.shadowMap.enabled });
    for (let i = 0; i < 4000; i++) Pf.frame(16.6); // 60 i/s pendant ~66 s
    out.push({ lvlFast: Pf.level, pr: +G.renderer.getPixelRatio().toFixed(2), pr0, fpsText: document.getElementById('fps')?.textContent });
    G.flags.perfTest = false;
    return out;
  });
  console.log('auto', JSON.stringify(b));
  await shot('f2_fps');
};
