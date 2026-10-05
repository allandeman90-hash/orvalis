// Interface : déplacement des cadres (gardé après rechargement), bandeau d'événements masquable, camouflage translucide.
export default async ({ page, ev, wait, shot }) => {
  await wait(800);
  await ev(() => { const d = window.__dbg; d.quick('assassin', 0, 12); });
  await wait(1200);
  const a = await ev(async () => {
    const G = window.__dbg.G, L = G.layout;
    L.toggle(true);
    const el = document.getElementById('tracker'), hd = el.querySelector('.lay-h');
    const r = hd.getBoundingClientRect();
    const mk = (type, x, y) => new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
    hd.dispatchEvent(mk('mousedown', r.left + 10, r.top + 10));
    window.dispatchEvent(mk('mousemove', 300, 400));
    window.dispatchEvent(mk('mouseup', 300, 400));
    L.toggle(false);
    // bandeau d'événements : clic sur la croix
    G.events.renderBox();
    const x = document.querySelector('#eventbox .evx');
    x?.click();
    // camouflage
    G.player.useSkillById('as_voile');
    window.__dbg.step(0.2);
    return { pos: G.settings.hudPos.tracker, left: el.style.left, hideEvents: G.settings.hideEvents, evHidden: document.getElementById('eventbox').hidden, stealthOpacity: G.player.model._stealth };
  });
  console.log('avant', JSON.stringify(a));
  await page.reload();
  await page.waitForFunction(() => window.__ready, null, { timeout: 90000 });
  await wait(800);
  const b = await ev(() => { const d = window.__dbg; d.quick('assassin', 0, 12); const G = d.G; return new Promise((res) => setTimeout(() => { const el = document.getElementById('tracker'); res({ pos: G.settings.hudPos?.tracker, left: el.style.left, top: el.style.top, hideEvents: G.settings.hideEvents }); }, 600)); });
  console.log('après rechargement', JSON.stringify(b));
  await shot('u1_moved');
};
