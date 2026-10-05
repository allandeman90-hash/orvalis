// Donjon complet avec des compagnons IA : pilote automatique du joueur, rapport de progression.
// Paramètres (variables d'environnement) : DUN (id), CLS (classe), SPEC (spécialisation), LVL (niveau), DIFF, SHOTS_ON
export default async ({ shot, wait, ev }) => {
  const DUN = process.env.DUN || 'meche', CLS = process.env.CLS || 'guerrier', LVL = +(process.env.LVL || 11), DIFF = process.env.DIFF || 'normal';
  const MAXMIN = +(process.env.MAXMIN || 30);
  const SPEC = process.env.SPEC || undefined;
  const info = await ev(({ DUN, CLS, LVL, DIFF, SPEC }) => {
    const d = window.__dbg, G = d.G;
    d.quick(CLS, 0, LVL, SPEC);
    d.tp(-408, 18);
    const key = d.inst(DUN, { diff: DIFF, floor: +(window.__floor || 1) });
    const A = G.inst.active;
    // pilote automatique
    window.__auto = {
      room: 1, t: 0, deathT: 0, log: [], lastRoomT: 0,
      step(dt) {
        const P = G.player, A = G.inst.active;
        if (!A) return 'no-inst';
        const D = A.D;
        if (this.key !== A.key) { this.key = A.key; this.room = 1; this.log.push(`étage ${A.floor} (${A.theme}) affixes=${A.affixes.join(',')}`); }
        if (P.dead) {
          this.deathT += dt;
          if (this.deathT > 12) { P.respawn(); this.deathT = 0; this.log.push(`respawn t=${Math.round(this.t)}`); }
          d.step(dt); this.t += dt; return;
        }
        this.deathT = 0;
        // cible : ennemi le plus proche en vue
        let t = P.target && !P.target.dead && P.target.kind === 'mob' ? P.target : null;
        if (!t || Math.hypot(t.pos.x - P.pos.x, t.pos.z - P.pos.z) > 45) {
          t = null;
          let bd = 1e9;
          for (const e of G.world.query(P.pos.x, P.pos.z, 30)) {
            if (e.kind !== 'mob' || e.dead || e.state === 'evade' || !G.inst.los(P.pos.x, P.pos.z, e.pos.x, e.pos.z)) continue;
            const dd = Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z) - (e.state === 'combat' ? 20 : 0);
            if (dd < bd) { bd = dd; t = e; }
          }
          if (t) { P.setTarget(t); P.engaged = t; }
        }
        const S = P.stats;
        if (t) {
          const dd = Math.hypot(t.pos.x - P.pos.x, t.pos.z - P.pos.z) - t.radius * 0.8;
          const melee = ['guerrier', 'templier', 'assassin'].includes(P.cls) || ['sp_sauvage', 'sp_gardien', 'sp_ossuaire', 'sp_amelio'].includes(P.spec);
          const want = melee ? 2.6 : 16;
          if (dd > want) P.moveTowards(t.pos.x, t.pos.z, dt, 0.5);
          P.faceTo(t.pos.x, t.pos.z);
          G.cam.yaw = P.ry;
          if (!P.cast && P.gcd <= 0) {
            for (let i = 0; i < 8; i++) { const sl = P.data.bar[(this.k = ((this.k || 0) + 1) % 8)]; if (sl && sl.k === 's') { P.useSkillById(sl.id); if (P.gcd > 0 || P.cast) break; } }
          }
          if (P.hp < S.maxHp * 0.35 && P.potionCd <= 0) P.useConsumable('pot_hp1') || P.useConsumable('pot_hp2');
        } else if (A.portal && A.kind === 'infinite' && !P.inCombat()) {
          P.moveTowards(A.portal.x, A.portal.z, dt, 0.3);
        } else {
          // salle suivante (en attendant les retardataires)
          const rooms = D.rooms;
          const r = rooms[Math.min(this.room, rooms.length - 1)];
          const enc = A.encounters.find((e) => e.r === r);
          const aliveHere = A.spawns.some((s) => s.room === this.room && s.ent && !s.ent.dead);
          const lowHp = P.hp < S.maxHp * 0.7 || G.party.members.some((m) => m.kind === 'bot' && (m.dead || m.hp < m.stats.maxHp * 0.6 || (m.healer && m.mp < m.stats.maxMp * 0.4)));
          if (lowHp && !P.inCombat()) { /* repos */ }
          else if (Math.hypot(r.x - P.pos.x, r.z - P.pos.z) > 3) P.moveTowards(r.x, r.z, dt, 2.5);
          else if (!aliveHere && (!enc || enc.state === 'done') && this.room < rooms.length - 1) { this.room++; this.log.push(`salle ${this.room} (${rooms[this.room].kind}) t=${Math.round(this.t)}`); }
        }
        d.step(dt);
        this.t += dt;
      },
    };
    return { key, rooms: A.D.rooms.map((r) => r.kind[0]).join(''), spawns: A.spawns.length, total: A.total, base: A.base, party: G.party.members.map((m) => `${m.name}(${m.cls} ${m.spec || m.rec?.spec || ''} ${m.level})`).join(', '), mobs: [...new Set(A.spawns.map((s) => s.mob))].join(',') };
  }, { DUN, CLS, LVL, DIFF, SPEC });
  console.log('entrée', JSON.stringify(info));
  await wait(1200);
  if (process.env.SHOTS_ON) await shot(`d1_${DUN}_entry`);
  let done = false;
  for (let chunk = 0; chunk < MAXMIN * 2 && !done; chunk++) {
    const r = await ev(() => {
      const G = window.__dbg.G, a = window.__auto;
      for (let i = 0; i < 600; i++) { const s = a.step(1 / 20); if (s === 'no-inst') break; if (G.inst.active?.done) break; if (window.__stopFloor && G.inst.active?.floor >= window.__stopFloor) break; }
      const A = G.inst.active;
      const P = G.player;
      const out = { fl: A?.floor, t: Math.round(a.t), room: a.room, kills: A?.kills, deaths: P.data.deaths, hp: Math.round(P.hp / P.stats.maxHp * 100), done: !!A?.done, encs: A?.encounters.map((e) => e.state[0]).join(''), log: a.log.splice(0), lvl: P.level };
      out.party = G.party.members.filter((m) => m.kind === 'bot').map((m) => (m.dead ? 'X' : Math.round(m.hp / m.stats.maxHp * 100))).join(' ');
      const eng = A?.encounters.find((e) => e.state === 'engaged');
      if (eng) out.boss = eng.spawns.map((s) => s.ent ? `${s.ent.name.split(' ')[0]} ${Math.round(s.ent.hp / s.ent.stats.maxHp * 100)}% t=${Math.round(eng.t)}` : '-').join(' | ');
      return out;
    });
    console.log(JSON.stringify(r));
    await wait(120); // laisse passer les images (chargements différés)
    if (r.done || r.fl === undefined || (process.env.STOPFL && r.fl >= +process.env.STOPFL)) done = true;
    if (process.env.SHOTS_ON && r.boss && chunk % 2 === 0) await shot(`d1_${DUN}_boss_${chunk}`);
  }
  const fin = await ev(() => {
    const G = window.__dbg.G, A = G.inst.active, P = G.player;
    return { encs: A?.encounters.map((e) => `${e.name}: ${e.dur ?? '-'}s, échecs ${e.wipes || 0}`).join(' / '), done: !!A?.done, t: A ? Math.round(G.time - A.startT) : 0, emblems: P.countItem('emblem'), gold: P.data.gold, level: P.level, kills: A?.kills, total: A?.total, deaths: P.data.deaths, bag: P.data.bag.filter(Boolean).map((i) => i.name + (i.count > 1 ? ' x' + i.count : '')).slice(0, 30) };
  });
  console.log('FIN', JSON.stringify(fin));
  if (process.env.SHOTS_ON) { await wait(800); await shot(`d1_${DUN}_end`); }
};
