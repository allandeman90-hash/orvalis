export default async ({ page, shot, wait, ev, key }) => {
  console.log(await ev(() => window.__dbg.quick('guerrier', 0, 1)));
  await wait(1500);
  console.log(JSON.stringify(await ev(() => window.__dbg.state())));
  await shot('p1');
  // avancer
  await page.keyboard.down('KeyW'); await wait(1500); await page.keyboard.up('KeyW');
  console.log(JSON.stringify(await ev(() => window.__dbg.state())));
  // aller près de loups
  console.log(await ev(() => { const s = window.__dbg.G.world.spawns.find(s => s.mob === 'loup_pres'); window.__dbg.tp(s.x + 8, s.z + 8); return [s.x, s.z, s.level]; }));
  await wait(1500);
  await key('Tab');
  await wait(300);
  console.log(JSON.stringify(await ev(() => window.__dbg.state())));
  for (let i = 0; i < 25; i++) { await key('Digit1'); await wait(400); if (i === 3) await key('Digit2'); }
  console.log(JSON.stringify(await ev(() => window.__dbg.state())));
  await shot('p2');
  await wait(3000);
  console.log(JSON.stringify(await ev(() => window.__dbg.state())));
  await shot('p3');
};
