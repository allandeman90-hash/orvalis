// Voie de l'Ordre : départ au sanctuaire, chapitres 1 à 6, verrou de niveau et quêtes secondaires conseillées,
// traître (chapitre 5), émissaire (chapitre 6), Chroniques, rattrapage d'un ancien personnage.
export default async ({ page, wait, ev, shot, key }) => {
  await wait(800);
  const cls = process.env.CLS || 'guerrier', f = +(process.env.FAC || 0);
  const a = await ev(([cls, f]) => {
    const d = window.__dbg, G = d.G;
    const r = d.fresh(cls, f);
    const P = G.player, S = G.story;
    const h = S.sanct();
    const m = G.npcs.recs.find((x) => x.id === `m_${cls}_${f}`);
    return { ...r, sanct: h?.name, distToSanct: Math.round(Math.hypot(P.pos.x - h.x, P.pos.z - h.z)), mentor: m?.name, mentorDist: m && Math.round(Math.hypot(P.pos.x - m.x, P.pos.z - m.z)), mentorMark: m?.mark, guide: P.data.guide, gt: G.quests.guideTarget()?.label, tracker: document.getElementById('tracker').innerText.slice(0, 200) };
  }, [cls, f]);
  console.log('départ', JSON.stringify(a));
  await wait(2500);
  await shot('s1_start_' + cls + f);
  // dialogue du mentor
  await ev(([cls, f]) => { const G = window.__dbg.G; const e = G.world.entities.find((x) => x.npcId === `m_${cls}_${f}`); G.win.openNpc(e); }, [cls, f]);
  await wait(300);
  const dlg = await ev(() => document.querySelector('.dlg')?.innerText.slice(0, 400));
  console.log('dialogue', JSON.stringify(dlg));
  await shot('s1_mentor_dlg');
  // chapitres 1 à 3
  const ch = await ev(() => {
    const d = window.__dbg, G = d.G, P = G.player, Q = G.quests, S = G.story;
    G.win.close('npc'); G.win.close('qdlg');
    const out = [];
    const q1 = S.next();
    Q.accept(q1.id);
    out.push({ ch: 1, guide: P.data.guide === q1.id, gt: Q.guideTarget()?.label, ready: Q.isReady(q1) });
    Q.complete(q1.id);
    const amu = P.data.bag.find((it) => it && it.slot === 'amulet');
    out.push({ insignia: amu?.name, sockets: amu?.sockets, runes: G.runes.total(), guideAfter: P.data.guide });
    const q2 = S.next();
    Q.accept(q2.id);
    const mobs = q2.obj[0].mobs;
    for (let i = 0; i < 6; i++) { Q.onKill(mobs[i % mobs.length]); P.gainXp(38, 'kill'); }
    out.push({ ch: 2, name: q2.name, lvl: q2.lvl, ready: Q.isReady(q2), done: Q.complete(q2.id), plLvl: P.level, xp: P.data.xp });
    const q3 = S.next();
    if (q3.ch !== 3) { out.push({ fail: q3.id, lvl: P.level, xp: P.data.xp, active: Object.keys(P.data.quests.active) }); return out; }
    Q.accept(q3.id);
    let n = 0;
    while (!Q.isReady(q3) && n < 60) { Q.questDrops({ def: { id: q3.obj[0].from[0] } }); P.gainXp(47, 'kill'); n++; }
    out.push({ ch: 3, kills: n, ready: Q.isReady(q3), done: Q.complete(q3.id), lvl: P.level });
    return out;
  });
  console.log('ch1-3', JSON.stringify(ch));
  // chapitre 4 verrouillé ?
  const lock = await ev(() => {
    const d = window.__dbg, G = d.G, P = G.player, Q = G.quests, S = G.story;
    const q4 = S.next();
    const locked = Q.locked(q4);
    Q.accept(q4.id);
    return { ch: q4.ch, lvl: q4.lvl, pl: P.level, locked, acceptedWhileLocked: !!P.data.quests.active[q4.id], tracker: document.getElementById('tracker').innerText.slice(0, 300), sideHubs: S.sideHubs(3).map((h) => h.hub.name + ':' + h.n), guide: (Q.setGuide('__story'), Q.guideTarget()?.label) };
  });
  console.log('verrou', JSON.stringify(lock));
  if (lock.locked) {
    await ev(([cls, f]) => { const G = window.__dbg.G; const e = G.world.entities.find((x) => x.npcId === `m_${cls}_${f}`); G.win.openNpc(e); }, [cls, f]);
    await wait(250);
    await ev(() => { const o = [...document.querySelectorAll('.dlg .opt')].find((x) => x.innerText.includes('requis')); o?.click(); });
    await wait(300);
    const q = await ev(() => ({ qd: document.querySelectorAll('.dlg')[1]?.innerText.slice(-300), dis: [...document.querySelectorAll('.win .btn')].find((b) => b.textContent === 'Accepter')?.disabled }));
    console.log('dialogue verrouillé', JSON.stringify(q));
    await shot('s1_locked');
    await ev(() => { const G = window.__dbg.G; G.win.close('qdlg'); G.win.close('npc'); });
  }
  // chapitres 4 et 5 (niveau 6)
  const c45 = await ev(() => {
    const d = window.__dbg, G = d.G, P = G.player, Q = G.quests, S = G.story;
    const q4 = S.next();
    const lv0 = P.level;
    Q.accept(q4.id);
    for (let i = 0; i < 6; i++) { Q.onKill(q4.obj[0].mobs[0]); P.gainXp(67, 'kill'); }
    let n = 0;
    while (!Q.isReady(q4) && n < 60) { Q.questDrops({ def: { id: q4.obj[1].from[0] } }); P.gainXp(67, 'kill'); n++; }
    const r4 = { ch: 4, lvl: q4.lvl, plBefore: lv0, ready: Q.isReady(q4), done: Q.complete(q4.id), plAfter: P.level, xp: P.data.xp };
    const q5n = S.next();
    r4.ch5lvl = q5n.lvl; r4.gapXp = 0;
    // l'écart jusqu'au chapitre 5 : quêtes secondaires (simulées)
    while (P.level < q5n.lvl) { P.gainXp(100, 'quest'); r4.gapXp += 100; }
    const q5 = S.next();
    Q.accept(q5.id);
    const o = q5.obj[0];
    const sp = S.spawnPos(q5, o);
    const h = S.sanct();
    P.teleport(sp.x + 14, sp.z + 4);
    d.step(1.5);
    const t = G.world.entities.find((e) => e.kind === 'mob' && !e.dead && e.def?.id === o.mob);
    return { r4, ch5: q5.name, traitor: t && { name: t.name, lvl: t.level, hp: Math.round(t.stats.maxHp), dmg: Math.round(t.stats.dmg), distSanct: Math.round(Math.hypot(t.pos.x - h.x, t.pos.z - h.z)) }, gt: Q.guideTarget()?.label, pos: [Math.round(sp.x), Math.round(sp.z)] };
  });
  console.log('ch4-5', JSON.stringify(c45));
  await ev(() => { const G = window.__dbg.G, P = G.player; const t = G.world.entities.find((e) => e.kind === 'mob' && !e.dead && e.storySpawn); if (t) { P.setTarget(t); G.cam.yaw = Math.atan2(t.pos.x - P.pos.x, t.pos.z - P.pos.z) + Math.PI; } });
  await wait(1500);
  await shot('s1_traitor');
  // combat réel contre le traître (niveau 6, équipement de quête typique)
  const fight = await ev(() => {
    const d = window.__dbg, G = d.G, P = G.player, Q = G.quests, S = G.story;
    const { makeGear, makeConsumable } = window.__items;
    for (const slot of ['weapon', 'chest', 'legs', 'hands', 'feet', 'head']) P.data.equip[slot] = makeGear({ slot, cls: P.cls, ilvl: 5, quality: 50 });
    P.refreshGear(true); P.recalc(); P.hp = P.stats.maxHp; P.mp = P.stats.maxMp;
    G.inv.add(makeConsumable('pot_hp1', 5));
    const t = G.world.entities.find((e) => e.kind === 'mob' && !e.dead && e.storySpawn);
    if (!t) return { none: true };
    P.teleport(t.pos.x + 8, t.pos.z);
    P.setTarget(t);
    const hp0 = P.stats.maxHp;
    d.fight(90);
    const q5 = Object.keys(P.data.quests.active).map((id) => G.quests && window.__q(id)).find((q) => q?.main);
    return { dead: P.dead, hpLeft: Math.round(P.hp) + '/' + hp0, traitorDead: t.dead, tHp: Math.round(t.hp), ready: q5 ? Q.isReady(q5) : 'n/a', pet: !!G.pets.active };
  });
  console.log('combat traître', JSON.stringify(fight));
  // chapitre 6 : rendre au mentor, puis émissaire de la capitale
  const c6 = await ev(() => {
    const d = window.__dbg, G = d.G, P = G.player, Q = G.quests, S = G.story;
    if (P.dead) { P.revive?.(); }
    const q5 = S.next();
    if (P.data.quests.active[q5.id] && !Q.isReady(q5)) Q.onKill(q5.obj[0].mob);
    const done5 = Q.complete(q5.id);
    const q6 = S.next();
    while (P.level < q6.lvl) P.gainXp(200, 'quest');
    Q.accept(q6.id);
    const turn = G.npcs.recs.find((r) => r.id === window.__q(q6.id).turnin);
    const gt = Q.guideTarget();
    const done6 = Q.complete(q6.id);
    const q7 = S.next();
    return { done5, q6: q6.name, emissary: turn && `${turn.name} @ ${turn.hub}`, gt: gt?.label, done6, next: q7 && `${q7.ch} ${q7.name} (niv ${q7.lvl})`, lvl: P.level, xp: P.data.xp, bagGear: P.data.bag.filter((x) => x && x.type === 'gear').map((x) => x.name + ' r' + x.rarity) };
  });
  console.log('ch5-6', JSON.stringify(c6));
  // Chroniques
  await ev(() => { const G = window.__dbg.G; G.win.open('quests', { tab: 'lore' }); });
  await wait(400);
  await shot('s1_chroniques');
  const chr = await ev(() => document.querySelector('.chr')?.innerText.slice(0, 500));
  console.log('chroniques', JSON.stringify(chr));
  await ev(() => { const G = window.__dbg.G; G.win.close('quests'); });
  // ancien personnage (rattrapage)
  const leg = await ev(() => { const d = window.__dbg; return d.legacy('mage', 1, 20); });
  console.log('rattrapage', JSON.stringify(leg));
  await wait(3000);
  const leg2 = await ev(() => { const G = window.__dbg.G; return { tracker: document.getElementById('tracker').innerText.slice(0, 200), bag: G.player.data.bag.filter((x) => x && x.slot === 'amulet').map((x) => x.name), runes: G.runes.total() }; });
  console.log('rattrapage 2', JSON.stringify(leg2));
};
