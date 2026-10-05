// Maître des métiers (dialogue → fenêtre Métiers) et émissaires des Huit Ordres (capitale et avant-postes).
export default async ({ page, wait, ev, shot }) => {
  await wait(800);
  const a = await ev(() => {
    const d = window.__dbg, G = d.G;
    d.quick('chaman', 1, 8);
    const out = {};
    const H = window.__zones.HUB_BY_ID;
    // émissaires : tous placés dans leur cité, près d'une pierre de voyage
    out.emis = G.npcs.recs.filter((r) => r.id.startsWith('e_')).map((r) => { const h = H[r.hub]; return `${r.name}@${r.hub} d=${Math.round(Math.hypot(r.x - h.x, r.z - h.z))}`; });
    const pm = G.npcs.recs.find((r) => r.id === 'pm_forge_cendre');
    out.pm = pm && `${pm.name} ${Math.round(pm.x)},${Math.round(pm.z)}`;
    d.tp(pm.x + 2.5, pm.z + 1.5);
    d.step(1.5);
    return out;
  });
  console.log(JSON.stringify(a, null, 1));
  await wait(1200);
  const b = await ev(() => {
    const G = window.__dbg.G;
    const e = G.world.entities.find((x) => x.npcId === 'pm_forge_cendre');
    if (!e) return { none: true };
    G.win.openNpc(e);
    const txt = document.querySelector('.dlg')?.innerText;
    const opt = [...document.querySelectorAll('.dlg .opt')].find((o) => o.innerText.includes('métiers'));
    opt?.click();
    return { txt, profsOpen: G.win.isOpen('profs'), npcOpen: G.win.isOpen('npc') };
  });
  console.log(JSON.stringify(b, null, 1));
  await wait(500);
  await shot('s3_profs_from_npc');
};
