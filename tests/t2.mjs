export default async ({ page, shot, wait, ev, key }) => {
  console.log(await ev(() => window.__dbg.quick('guerrier', 0, 1)));
  const fps = await ev(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / 2); }; requestAnimationFrame(f); }));
  console.log('fps headless', fps);
  console.log(await ev(() => { const s = window.__dbg.G.world.spawns.find(s => s.mob === 'loup_pres'); window.__dbg.tp(s.x + 6, s.z + 6); return [s.x, s.z, s.level]; }));
  console.log(JSON.stringify(await ev(() => window.__dbg.step(1))));
  // cible la plus proche et attaque en boucle
  const log = [];
  for (let i = 0; i < 40; i++) {
    const st = await ev(() => { const d = window.__dbg; const P = d.G.player; if (!P.target || P.target.dead) d.G.input.pressed.add('Tab'); d.step(0.05); d.G.input.pressed.add('Digit1'); if (Math.random() < 0.2) d.G.input.pressed.add('Digit2'); return d.step(0.5); });
    log.push(`${st.hp}/${st.maxHp} xp${st.xp} ${st.target||'-'} lvl${st.lvl} g${st.gold}`);
  }
  console.log(log.join(' | '));
  await shot('p4');
};
