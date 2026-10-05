// Mécaniques des boss de donjon et de raid : zones annoncées (cônes, ondes, flaques), ruées, tourbillons,
// renforts, boucliers de sbires, soins à interrompre, condamnations et traques.
import { G } from './state.js';
import { EXTRA_ABILITIES } from './mob.js';
import {
  dealDamage, heal, addBuff, removeBuff, hasBuff, enemiesAround, dist, edgeDist, telegraph, groundZone, dash, knockback,
  burst, shockRing, beam, after, isPlayerLike, addDanger,
} from './combat.js';
import { getHeight, canWalk } from '../world/terrain.js';
import { R } from '../core/rng.js';
import { angleTo, wrapAngle } from '../core/util.js';

const B = EXTRA_ABILITIES;
const PI = Math.PI;
const foes = (m, r = 45) => enemiesAround(m, m.pos.x, m.pos.z, r);
import { isTank as isTankRole } from '../data/specs.js';
const isTank = (e) => isTankRole(e);
const pick = (l) => l[Math.floor(R() * l.length)];
const near = (m) => G.player && dist(G.player, m) < 60;
const warn = (m, e, title, sub) => { if (e === G.player) { G.ui?.announce(title, 'boss', sub); G.audio?.play('windup'); } else if (near(m) && e) G.ui?.log(`${m.name} : ${title} sur ${e.name} !`, 'evt'); };

function coneAt(m, dir, range, angle, delay, mult, school, color, extra) {
  const x = m.pos.x, z = m.pos.z;
  m.ry = dir;
  telegraph(x, z, range, delay, () => {
    if (m.dead) return;
    for (const e of enemiesAround(m, x, z, range)) {
      const a = angleTo(x, z, e.pos.x, e.pos.z);
      if (Math.abs(wrapAngle(a - dir)) <= angle / 2 || Math.hypot(e.pos.x - x, e.pos.z - z) < 1.5) { dealDamage(m, e, m.stats.dmg * mult, { school }); extra?.(e); }
    }
    for (let i = 0; i < 36; i++) {
      const a = dir + (R() - 0.5) * angle, d = R() * range;
      burst(x + Math.sin(a) * d, m.pos.y + 1, z + Math.cos(a) * d, { count: 1, color, color2: '#ffffff', speed: 1, life: 0.55, size: 0.3 });
    }
  }, { angle, dir });
  m.lockT = delay + 0.25;
}
function circleAt(m, x, z, r, delay, fn, color) {
  telegraph(x, z, r, delay, () => {
    if (m.dead) return;
    fn();
    shockRing(x, z, r, color || '#ffb040', 0.45);
    burst(x, getHeight(x, z) + 0.4, z, { count: 22, color: color || '#ffb040', color2: '#ffffff', speed: 7, size: 0.24, life: 0.5 });
  });
}

// ---------------------------------------------------------------------------
B.bb_cleave = { cd: 9, label: 'Frappe en arc', ok: (m, t) => edgeDist(m, t) < m.def.atkRange + 2.5, anim: 'attack',
  use: (m, t) => coneAt(m, Math.atan2(t.pos.x - m.pos.x, t.pos.z - m.pos.z), 7 + m.radius, 1.9, 1.3, 2.6, 'phys', '#e0e0e0') };
B.bb_tail = { cd: 11, label: 'Coup de queue', ok: (m) => foes(m, 9 + m.radius).some((e) => Math.abs(wrapAngle(angleTo(m.pos.x, m.pos.z, e.pos.x, e.pos.z) - m.ry)) > 2.2), anim: 'roar',
  use: (m) => { const dir = m.ry + PI; coneAt(m, dir, 8 + m.radius, 1.7, 1.1, 2.1, 'phys', '#c8b090', (e) => knockback(e, m.pos.x, m.pos.z, 6)); m.ry = dir - PI; } };
B.bb_slam_ring = { cd: 16, label: 'Onde de choc', ok: (m, t) => dist(m, t) < 14, anim: 'slam',
  use: (m) => { const r = 8 + m.radius * 0.5, x = m.pos.x, z = m.pos.z; circleAt(m, x, z, r, 1.8, () => { for (const e of enemiesAround(m, x, z, r)) { dealDamage(m, e, m.stats.dmg * 2.0); knockback(e, x, z, 6); } if (near(m)) G.cam.shake = 0.35; }, '#c8b090'); m.lockT = 2.0; } };
B.bb_nova_run = { cd: 24, label: 'Déflagration', ok: () => true, anim: 'raise',
  use: (m) => {
    const r = 13 + m.radius * 0.4, x = m.pos.x, z = m.pos.z;
    if (near(m)) G.ui?.announce(`${m.name} prépare une Déflagration !`, 'boss', 'Éloignez-vous du boss !');
    circleAt(m, x, z, r, 3.0, () => { for (const e of enemiesAround(m, x, z, r)) dealDamage(m, e, m.stats.dmg * 3.2, { school: m.def.projectile === 'frost' ? 'frost' : 'fire' }); if (near(m)) G.cam.shake = 0.5; }, '#ff7a2a');
    m.lockT = 3.2;
  } };
B.bb_fire_pools = { cd: 14, label: 'Pluie de braises', ok: (m) => foes(m).length > 0, anim: 'raise',
  use: (m) => {
    const list = foes(m).sort(() => R() - 0.5).slice(0, 3);
    for (const e of list) {
      const x = e.pos.x, z = e.pos.z;
      circleAt(m, x, z, 4, 1.6, () => {
        for (const f of enemiesAround(m, x, z, 4)) dealDamage(m, f, m.stats.dmg * 1.5, { school: 'fire' });
        groundZone(m, x, z, 3.6, 7, 1, '#ff6a2a', (zz) => { for (const f of enemiesAround(m, zz.x, zz.z, 3.6)) dealDamage(m, f, m.stats.dmg * 0.3, { school: 'fire', dot: true }); }, { persist: true });
      }, '#ff8a3a');
    }
  } };
B.bb_poison_cloud = { cd: 17, label: 'Nuée méphitique', ok: (m) => foes(m).length > 0, anim: 'cast',
  use: (m) => {
    const e = pick(foes(m));
    if (!e) return;
    const x = e.pos.x, z = e.pos.z;
    circleAt(m, x, z, 5, 1.4, () => {
      for (const f of enemiesAround(m, x, z, 5)) { dealDamage(m, f, m.stats.dmg * 1.0, { school: 'poison' }); addBuff(f, 'poison', m, { dur: 8, value: m.stats.dmg * 0.18 }); }
      groundZone(m, x, z, 4.5, 8, 1, '#8ad040', (zz) => { for (const f of enemiesAround(m, zz.x, zz.z, 4.5)) dealDamage(m, f, m.stats.dmg * 0.25, { school: 'poison', dot: true }); }, { persist: true });
    }, '#9ae040');
  } };
B.bb_ice_rain = { cd: 15, label: 'Grêle de givre', ok: (m) => foes(m).length > 0, anim: 'roar',
  use: (m) => {
    const list = foes(m);
    for (let i = 0; i < 6; i++) {
      const e = list[i % list.length];
      const x = e.pos.x + (R() - 0.5) * 7, z = e.pos.z + (R() - 0.5) * 7;
      circleAt(m, x, z, 3.4, 1.8 + i * 0.15, () => { for (const f of enemiesAround(m, x, z, 3.4)) { dealDamage(m, f, m.stats.dmg * 1.4, { school: 'frost' }); addBuff(f, 'chill', m, { dur: 4 }); } }, '#bfeaff');
    }
  } };
B.bb_frost_breath = { cd: 12, label: 'Souffle glacial', ok: (m, t) => dist(m, t) < 12 + m.radius, anim: 'roar',
  use: (m, t) => coneAt(m, Math.atan2(t.pos.x - m.pos.x, t.pos.z - m.pos.z), 12 + m.radius, 1.3, 1.4, 2.0, 'frost', '#bfeaff', (e) => addBuff(e, 'chill', m, { dur: 5 })) };
B.bb_acid_breath = { cd: 12, label: 'Souffle acide', ok: (m, t) => dist(m, t) < 12 + m.radius, anim: 'roar',
  use: (m, t) => coneAt(m, Math.atan2(t.pos.x - m.pos.x, t.pos.z - m.pos.z), 11 + m.radius, 1.3, 1.4, 1.8, 'poison', '#9ae040', (e) => addBuff(e, 'poison', m, { dur: 8, value: m.stats.dmg * 0.2 })) };
B.bb_platform = { cd: 9, label: 'Éruption', ok: () => true, anim: 'roar',
  use: (m) => {
    const hx = m.home.x, hz = m.home.z, R0 = m.def.raidBoss ? 22 : 16;
    const col = m.def.family === 'dragon' && m.def.id.startsWith('r1') ? '#9fd0ff' : '#ff7a2a';
    for (let i = 0; i < 9; i++) {
      const a = R() * PI * 2, d = Math.sqrt(R()) * R0;
      const x = hx + Math.sin(a) * d, z = hz + Math.cos(a) * d;
      circleAt(m, x, z, 3.6, 2.2 + R() * 0.8, () => { for (const f of enemiesAround(m, x, z, 3.6)) dealDamage(m, f, m.stats.dmg * 1.9, { school: col === '#ff7a2a' ? 'fire' : 'lightning' }); }, col);
    }
  } };
B.bb_line = { cd: 18, label: 'Ruée', ok: (m) => foes(m, 30).some((e) => dist(m, e) > 7), anim: 'roar',
  use: (m) => {
    const list = foes(m, 30).filter((e) => dist(m, e) > 7).sort((a, b) => dist(m, b) - dist(m, a));
    const t = list[0];
    if (!t) return;
    const x0 = m.pos.x, z0 = m.pos.z;
    const dir = Math.atan2(t.pos.x - x0, t.pos.z - z0);
    const L = Math.min(34, dist(m, t) + 3);
    let x1 = x0, z1 = z0;
    for (let s = 1; s <= L; s += 1) { const nx = x0 + Math.sin(dir) * s, nz = z0 + Math.cos(dir) * s; if (!canWalk(x1, z1, nx, nz)) break; x1 = nx; z1 = nz; }
    const len = Math.hypot(x1 - x0, z1 - z0);
    for (let s = 2; s < len; s += 3) telegraph(x0 + Math.sin(dir) * s, z0 + Math.cos(dir) * s, 2.6, 1.3, null);
    m.ry = dir;
    m.lockT = 2.0;
    warn(m, t, 'Ruée', 'Écartez-vous de la trajectoire !');
    after(1.3, () => {
      if (m.dead) return;
      dash(m, x1, z1, 32, () => {
        for (const e of enemiesAround(m, (x0 + x1) / 2, (z0 + z1) / 2, len / 2 + 3)) {
          const rx = e.pos.x - x0, rz = e.pos.z - z0;
          const along = rx * Math.sin(dir) + rz * Math.cos(dir), perp = Math.abs(rx * Math.cos(dir) - rz * Math.sin(dir));
          if (along > -1 && along < len + 1 && perp < 2.8) { dealDamage(m, e, m.stats.dmg * 2.2); knockback(e, m.pos.x, m.pos.z, 4); }
        }
        shockRing(m.pos.x, m.pos.z, 4, '#c8b090');
      }, { anim: 'charge' });
    });
  } };
B.bb_whirl = { cd: 22, label: 'Tourbillon', ok: (m) => foes(m, 16).length > 0, anim: 'spin',
  use: (m) => {
    let t = 0, tick = 0;
    const r = 5.5 + m.radius * 0.3;
    if (near(m)) G.ui?.announce(`${m.name} tournoie !`, 'boss', 'Restez hors de portée.');
    G.world.addTicker((dt) => {
      if (m.dead) return false;
      t += dt; tick -= dt;
      m.model?.play('spin', 0.5);
      if (tick <= 0) {
        tick = 0.5;
        addDanger({ x: m.pos.x, z: m.pos.z, r, angle: 0, dir: 0, until: G.time + 0.7, src: m });
        for (const e of enemiesAround(m, m.pos.x, m.pos.z, r)) dealDamage(m, e, m.stats.dmg * 0.7);
        shockRing(m.pos.x, m.pos.z, r, '#e0e0e0', 0.3);
      }
      return t < 5;
    });
  } };
B.bb_adds = { cd: 40, label: 'Appel des sbires', ok: (m) => !!m.def.addId && (m.addsSpawned || 0) < 5, anim: 'roar',
  use: (m) => {
    const n = m.def.raidBoss ? 4 : 3;
    m.addsSpawned = (m.addsSpawned || 0) + 1;
    const list = foes(m, 50);
    if (near(m)) G.ui?.announce(`${m.name} appelle des renforts !`, 'boss', 'Occupez-vous des sbires.');
    for (let i = 0; i < n; i++) {
      const a = (i / n) * PI * 2 + R();
      let x = m.pos.x + Math.sin(a) * 11, z = m.pos.z + Math.cos(a) * 11;
      if (!canWalk(m.pos.x, m.pos.z, x, z)) { x = m.pos.x + Math.sin(a) * 5; z = m.pos.z + Math.cos(a) * 5; }
      const add = G.world.spawnTemp(m.def.addId, x, z, m);
      if (add) { add.level = Math.max(1, m.level - 1); add.statsDirty = true; const t = pick(list) || m.target; if (t) { add.threat.set(t, 20); add.target = t; add.state = 'combat'; } }
    }
  } };
// déclenchée par une phase : immunité tant que les gardiens invoqués vivent
B.bb_shield = { cd: 999, label: 'Bouclier de sbires', ok: () => true, anim: 'raise',
  use: (m) => {
    const id = m.def.anchorId || m.def.addId || 'squelette_invoque';
    m.shieldAdds = [];
    addBuff(m, 'shielded', m, { dur: 90 });
    const list = foes(m, 50);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * PI * 2 + 0.5;
      let x = m.home.x + Math.sin(a) * 12, z = m.home.z + Math.cos(a) * 12;
      if (!canWalk(m.home.x, m.home.z, x, z)) { x = m.home.x + Math.sin(a) * 7; z = m.home.z + Math.cos(a) * 7; }
      const add = G.world.spawnTemp(id, x, z, m);
      if (add) { add.level = m.level; add.elite = true; add.statsDirty = true; add.recalc(); add.hp = add.stats.maxHp * 0.45; m.shieldAdds.push(add); const t = pick(list); if (t) { add.threat.set(t, 10); add.state = 'combat'; } }
    }
    beam(m.handPos(), { x: m.pos.x, y: m.pos.y + 8, z: m.pos.z }, '#9fe8ff', 0.6, 0.4);
  } };
B.bb_heal = { cd: 26, windup: 3.0, interruptible: true, label: 'Soins interdits', ok: (m) => m.hp < m.stats.maxHp * 0.88, anim: 'cast',
  use: (m) => {
    const allies = G.world.query(m.pos.x, m.pos.z, 30).filter((e) => e.kind === 'mob' && !e.dead && e.faction === m.faction && (e === m || e.spawn?.enc === m.spawn?.enc));
    for (const a of allies) { heal(m, a, a.stats.maxHp * 0.12); burst(a.pos.x, a.pos.y + 1.4, a.pos.z, { count: 16, color: '#8fe86a', vy: 3, speed: 1.5 }); }
    if (near(m)) G.ui?.log(`${m.name} se soigne ! Interrompez ce sort (étourdissement, Heurt de bouclier, Défi…)`, 'evt');
  } };
B.bb_doom = { cd: 20, label: 'Condamnation', ok: (m) => foes(m).length > 1, anim: 'cast',
  use: (m) => {
    const cands = foes(m).filter((e) => !isTank(e) && e.kind !== 'pet');
    const t = pick(cands.length ? cands : foes(m));
    if (!t) return;
    addBuff(t, 'doom', m, { dur: 5 });
    warn(m, t, 'Condamnation', 'Éloignez-vous de vos alliés : vous allez exploser dans 5 s !');
    after(5, () => {
      if (m.dead || t.dead) return;
      const x = t.pos.x, z = t.pos.z;
      for (const e of enemiesAround(m, x, z, 7)) dealDamage(m, e, m.stats.dmg * (e === t ? 0.4 : 2.2), { school: 'shadow' });
      shockRing(x, z, 7, '#b58cff', 0.5);
      burst(x, t.pos.y + 1, z, { count: 30, color: '#6a3aa0', color2: '#ffffff', speed: 8, life: 0.6 });
    });
  } };
B.bb_fixate = { cd: 24, label: 'Traque', ok: (m) => foes(m).length > 1, anim: 'roar',
  use: (m) => {
    const cands = foes(m).filter((e) => !isTank(e) && e.kind !== 'pet');
    const t = pick(cands.length ? cands : foes(m));
    if (!t) return;
    m.forceTarget = t; m.forceT = 6;
    addBuff(t, 'fixate', m, { dur: 6 });
    addBuff(m, 'spirit_speed', m, { dur: 6, scale: 0.6 });
    warn(m, t, 'Traqué', `${m.name} vous poursuit : fuyez pendant 6 s !`);
  } };
