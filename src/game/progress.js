import { isInstancePoint } from '../data/world-space.js';
// Récompenses de combat : expérience, or, butin personnel, objets de quête, partage en groupe.
import { G } from './state.js';
import { Inv } from './inventory.js';
import { makeGear, makeConsumable, makeQuestItem, potionFor, rollQuality, makeUnique, UNIQUES, SETS, SET_SLOTS, makeSetPiece } from '../data/items.js';
import { CLASS_LIST } from '../data/classbase.js';
import { dist } from './combat.js';
import { R } from '../core/rng.js';
import { clamp } from '../core/util.js';
import { Runes } from './runes.js';

export function mobXp(level) {
  return 20 + level * 8;
}
export function levelFactor(plLevel, mobLevel) {
  const d = mobLevel - plLevel;
  if (d >= 0) return 1 + Math.min(d, 5) * 0.06;
  if (d <= -6) return 0.08;
  return 1 + d * 0.12;
}
export function conColor(plLevel, mobLevel) {
  const d = mobLevel - plLevel;
  if (d >= 5) return '#ff3a3a';
  if (d >= 3) return '#ff8a2a';
  if (d >= -2) return '#ffd24a';
  if (d >= -5) return '#5fd35a';
  return '#9a9aa0';
}

export function initProgress() {
  G.world.on('kill', (tgt, src) => {
    if (tgt.kind === 'mob') onMobKilled(tgt, src);
    else if (tgt === G.player) G.player.onDeath(src);
  });
}

function partyMembersNear(m) {
  const P = G.player;
  const list = [P];
  if (G.party) for (const e of G.party.members) if (e !== P && !e.dead && dist(e, m) < 70) list.push(e);
  return list;
}

function onMobKilled(m, src) {
  const P = G.player;
  if (!P) return;
  if (m.temp && m.def.xp < 0.5 && !m.tappedByMe) return;
  G.net?.onMobKilled?.(m, src);
  // en instance, tout le groupe est récompensé (même mort ou dans une autre salle)
  const credited = m.tappedByMe && (m.spawn?.inst || (m.temp && isInstancePoint(m.pos.x, m.pos.z)) ? true : !P.dead && dist(P, m) < 90);
  G.world.emit('mobKilled', m, credited);
  if (!credited) return;
  P.data.kills++;
  if (m.boss) P.data.bossKills = (P.data.bossKills || 0) + 1;
  const members = partyMembersNear(m);
  const n = members.length;
  let xp = mobXp(m.level) * (m.elite ? 3.2 : m.boss ? (m.worldBoss ? 60 : 16) : 1) * (m.def.xp || 1) * levelFactor(P.level, m.level);
  if (n > 1) xp = (xp * (1 + 0.2 * (n - 1))) / n;
  if (G.flags.bastionBuff === P.faction) xp *= 1.1;
  P.gainXp(xp, 'kill');
  for (const e of members) if (e.kind === 'bot') e.gainXp?.(xp);
  if (m.worldBoss) return; // récompenses gérées par l'événement
  // or
  let gold = Math.round((1 + m.level * (0.5 + R() * 0.8)) * (m.elite ? 4 : m.boss ? 20 : 1) * (1 + (P.stats.fortune || 0) / 100));
  if (m.passive) gold = Math.round(gold * 0.3);
  if (n > 1) gold = Math.ceil(gold / Math.sqrt(n));
  if (gold > 0) { P.data.gold += gold; G.ui?.goldMsg?.(gold); }
  if (!m.noLoot) rollLoot(m, m.spawn?.lootMul ?? 1);
}

// chance qu'une pièce d'équipement tombée soit mythique (4 ou 5 emplacements de runes) : contenu de haut niveau seulement
export function mythicChance(m) {
  const d = m.def || {};
  if ((m.level || 1) < 27) return 0;
  const heroic = !!m.spawn?.heroic || G.inst?.active?.diff === 'heroic';
  if (m.worldBoss) return 0.1;
  if (d.raidBoss) return 0.06;
  if (d.dungeonBoss) return heroic ? 0.03 : 0.008;
  if (m.boss) return 0.02;
  if (m.elite || m.named) return 0.002;
  return 0;
}

export function rollLoot(m, mult = 1) {
  const P = G.player;
  const src = m.def.raidBoss ? 'raid' : m.boss ? 'boss' : m.elite ? 'elite' : 'mob';
  const lvl = m.level;
  const luck = (P.stats.fortune || 0) / 100;
  const gearChance = (m.def.raidBoss ? 1.2 : m.def.dungeonBoss ? 0.9 : m.boss ? 2.4 : m.elite ? 0.6 : 0.11) * mult * (1 + luck * 0.5);
  let rolls = Math.floor(gearChance) + (R() < gearChance % 1 ? 1 : 0);
  if (m.passive) rolls = 0;
  for (let i = 0; i < rolls; i++) {
    const cls = R() < 0.72 ? P.cls : CLASS_LIST[Math.floor(R() * CLASS_LIST.length)];
    // Fortune : second tirage de qualité, on garde le meilleur
    let q = rollQuality(R, src);
    if (luck > 0 && R() < Math.min(0.9, luck)) q = Math.max(q, rollQuality(R, src));
    const ilvl = clamp(lvl + Math.floor(R() * 3) - 1, 1, 34);
    const mythic = R() < mythicChance(m) * (1 + luck);
    const it = makeGear({ cls, ilvl, quality: q, mythic });
    if (mythic) { G.ui?.announce('Objet mythique !', 'level', `${it.name} — ${it.sockets} emplacements de runes`); G.audio?.play('epic'); }
    Inv.add(it);
  }
  dropSetPiece(m);
  // runes (directement dans la sacoche à runes)
  Runes.dropFromMob(m, mult);
  // métiers : étoffes et viande
  G.profs?.onLoot?.(m);
  if (m.boss && UNIQUES[m.def.id] && R() < 0.3 * mult) Inv.add(makeUnique(m.def.id));
  // consommables
  if (R() < (m.elite || m.boss ? 0.4 : 0.07)) Inv.add(makeConsumable(potionFor(lvl, R() < 0.6 ? 'hp' : 'mp'), 1));
  if (R() < 0.025) Inv.add(makeConsumable(lvl >= 15 ? 'food2' : 'food1', 1 + Math.floor(R() * 2)));
  // éclats
  const shardChance = m.boss ? 1 : m.elite ? 0.65 : 0.07;
  if (R() < shardChance * mult) Inv.add(makeConsumable('shard', m.boss ? 4 + Math.floor(R() * 5) : m.elite ? 1 + Math.floor(R() * 3) : 1));
  if ((m.boss && R() < 0.35) || (m.elite && R() < 0.05)) Inv.add(makeConsumable('shard_big', 1));
  if (m.boss && R() < 0.12) Inv.add(makeConsumable('bag_scroll', 1));
  // objets de quête
  const qi = m.def.drop;
  if (qi && G.quests?.needsItem(qi)) {
    if (R() < 0.6) Inv.add(makeQuestItem(qi, 1));
  }
  G.quests?.questDrops?.(m);
  G.quests?.refreshCollect?.();
}

// Pièces d'ensemble : boss de donjon et de raid (le boss final en donne toujours une)
function dropSetPiece(m) {
  const A = G.inst?.active;
  if (!A || !(m.def.dungeonBoss || m.def.raidBoss) || !SETS[A.id]) return;
  const raid = A.kind === 'raid';
  const heroic = A.diff === 'heroic';
  const last = A.def.bosses[A.def.bosses.length - 1].includes(m.def.id);
  if (!last && R() > (raid ? 0.6 : 0.4)) return;
  const P = G.player;
  const set = raid && heroic ? A.id + '_h' : A.id;
  const cls = R() < 0.85 ? P.cls : CLASS_LIST[Math.floor(R() * CLASS_LIST.length)];
  // de préférence une pièce qui vous manque
  const owned = new Set([...(P.data.bag || []), ...Object.values(P.data.equip || {})].filter((it) => it && it.set === set && it.cls === cls).map((it) => it.slot));
  const miss = SET_SLOTS.filter((s) => !owned.has(s));
  const pool = miss.length ? miss : SET_SLOTS;
  const it = makeSetPiece(set, cls, pool[Math.floor(R() * pool.length)], { heroic: heroic && !raid });
  Inv.add(it);
  G.ui?.announce("Pièce d'ensemble !", 'level', it.name);
  G.audio?.play('epic');
}

