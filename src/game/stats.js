// Calcul des caractéristiques dérivées (joueurs, bots, monstres).
import { CLASSES, HYBRID_CASTER, isTankClass } from '../data/classbase.js';
import { isTank } from '../data/specs.js';

// Courbes de base des monstres
export function mobBase(level) {
  return {
    hp: 30 + level * 26 + level * level * 0.72,
    dmg: 3 + level * 2.6 + level * level * 0.02,
    armor: 6 + level * 7,
    power: 6 + level * 5.2,
  };
}

// Valeur moyenne des dégâts d'arme pour un niveau d'objet
export function weaponAvg(ilvl) {
  return 4 + ilvl * 2.6;
}

// Réduction par l'armure selon le niveau de l'attaquant
export function armorReduction(armor, attackerLevel) {
  const r = armor / (armor + 40 + 20 * attackerLevel);
  return Math.min(0.75, Math.max(0, r));
}

// e : entité ; applique équipement et effets
export function computeStats(e) {
  const S = e.stats;
  const buffs = e.buffs || [];
  // multiplicateurs issus des effets
  let dmgPct = 0, armorPct = 0, speedPct = 0, dmgTakenPct = 0, hastePct = 0, healPct = 0, critAdd = 0, leech = 0, powerPct = 0, castPct = 0, dodgeAdd = 0, hpPct = 0;
  const add = { str: 0, sta: 0, agi: 0, int: 0, wis: 0, armor: 0, power: 0, crit: 0, haste: 0, hp: 0, mp: 0, block: 0, speed: 0, regen: 0, heal: 0 };
  for (const b of buffs) {
    const m = b.def.mods;
    if (!m) continue;
    const k = (b.stacks || 1) * (b.scale || 1);
    if (m.dmgPct) dmgPct += m.dmgPct * k;
    if (m.armorPct) armorPct += m.armorPct * k;
    if (m.speedPct) speedPct += m.speedPct * k;
    if (m.dmgTakenPct) dmgTakenPct += m.dmgTakenPct * k;
    if (m.hastePct) hastePct += m.hastePct * k;
    if (m.healPct) healPct += m.healPct * k;
    if (m.critAdd) critAdd += m.critAdd * k;
    if (m.leech) leech += m.leech * k;
    if (m.powerPct) powerPct += m.powerPct * k;
    if (m.castPct) castPct += m.castPct * k;
    if (m.dodgeAdd) dodgeAdd += m.dodgeAdd * k;
    if (m.hpPct) hpPct += m.hpPct * k;
  }
  // bonus fixes de caractéristiques (élixirs, plats)
  for (const b of buffs) if (b.stats) for (const s in b.stats) add[s] = (add[s] || 0) + b.stats[s];

  if (e.kind === 'pet') {
    const d = e.def;
    const B = mobBase(e.level);
    const rar = [1, 1.25, 1.6, 2.0][e.rarity || 0];
    const q = 1 + (e.quality ?? 50) * 0.003;
    const O = e.owner?.stats;
    if (e.minion && O) {
      S.maxHp = Math.round((O.maxHp || 200) * (e.minionHp || 0.45));
      S.dmg = (O.power || 20) * (e.minionDmg || 0.42);
      S.armor = (O.armor || 40) * 0.8;
    } else {
      S.maxHp = Math.round(B.hp * Math.min(1.6, d.hp) * rar * q * 0.95);
      S.dmg = B.dmg * Math.min(1.4, d.dmg) * rar * q * 0.72;
      S.armor = B.armor * Math.min(1.6, d.armor) * (1 + armorPct);
    }
    const lich = e.minion && e.owner?.buffs?.some((b) => b.def.id === 'lichform') ? 0.5 : 0;
    const petK = 1 + (e.owner?.tal?.mods?.pet || 0);
    // rôle du familier et maîtrise des bêtes du Chasseur (+35 %)
    const role = e.minion ? null : e.role;
    const hunter = !e.minion && e.owner?.cls === 'archer' ? 1.35 : 1;
    const rHp = role === 'tank' ? 1.5 : role === 'dps' ? 0.9 : 1;
    const rDmg = role === 'tank' ? 0.75 : role === 'dps' ? 1.3 : role === 'heal' ? 0.55 : 1;
    S.maxHp = Math.round(S.maxHp * petK * (1 + hpPct) * rHp * hunter);
    S.dmg *= petK * rDmg * hunter;
    if (role === 'tank') S.armor *= 1.6;
    S.threatMul = role === 'tank' ? 3.5 : role === 'heal' ? 0.4 : 0.6;
    S.maxMp = 100;
    S.power = S.dmg * 1.6 * (1 + powerPct);
    S.crit = 5 + critAdd;
    S.haste = hastePct * 100;
    S.moveSpeed = Math.max(6.8, d.speed) * (1 + speedPct);
    S.dmgMul = 1 + dmgPct + lich;
    S.dmgTaken = 1 + dmgTakenPct;
    S.healMul = 1 + healPct;
    S.leech = leech;
    S.dodge = 5;
    S.block = 0;
    S.hpRegen = S.maxHp * 0.008;
    S.mpRegen = 5;
    S.castMul = 1 + castPct;
    return S;
  }

  if (e.kind === 'mob') {
    const d = e.def;
    const B = mobBase(e.level);
    const mul = e.elite ? 3.4 : e.boss ? (e.def.worldBoss ? 70 : e.def.raidBoss ? 90 : e.def.dungeonBoss ? 26 : 16) : 1;
    const dmul = e.elite ? 1.55 : e.boss ? (e.def.worldBoss ? 1.6 : e.def.raidBoss ? 2.1 : e.def.dungeonBoss ? 1.8 : 2.0) : 1;
    S.maxHp = Math.round(B.hp * d.hp * mul * (e.hpScale || 1));
    S.maxMp = 100;
    S.power = B.power * d.dmg * dmul * (1 + powerPct) * (e.dmgScale || 1);
    S.dmg = B.dmg * d.dmg * dmul * (e.dmgScale || 1);
    S.armor = B.armor * d.armor * (1 + armorPct);
    S.crit = 5 + critAdd;
    S.haste = hastePct * 100;
    S.moveSpeed = d.speed * (1 + speedPct);
    S.dmgMul = 1 + dmgPct;
    S.dmgTaken = 1 + dmgTakenPct;
    S.healMul = 1 + healPct;
    S.leech = leech;
    S.dodge = 3;
    S.block = 0;
    S.hpRegen = 0;
    S.mpRegen = 5;
    S.castMul = 1 + castPct;
    return S;
  }

  // joueurs / bots / PNJ humanoïdes
  const C = CLASSES[e.cls] || CLASSES.guerrier;
  // spécialisation et talents
  const T = e.tal?.mods || {};
  dmgPct += T.dmg || 0; healPct += T.heal || 0; armorPct += T.armor || 0; critAdd += T.crit || 0; hastePct += T.haste || 0;
  castPct += T.cast || 0; dodgeAdd += T.dodge || 0; speedPct += T.speed || 0; leech += T.leech || 0; dmgTakenPct += T.taken || 0; hpPct += T.hp || 0;
  // métiers : atouts et défauts
  const PM = e.pmods || {};
  armorPct += PM.armorPct || 0; hpPct += PM.hpPct || 0; dmgPct += PM.dmgPct || 0; critAdd += PM.critAdd || 0; dodgeAdd += PM.dodgeAdd || 0;
  speedPct += PM.speedPct || 0; hastePct += PM.hastePct || 0;
  const L = e.level;
  const g = e.gearStats || add;
  const base = {};
  for (const k of ['str', 'sta', 'agi', 'int', 'wis']) base[k] = C.base[k] + C.grow[k] * (L - 1) + (g[k] || 0) + add[k];
  S.str = base.str; S.sta = base.sta; S.agi = base.agi; S.int = base.int; S.wis = base.wis;
  const primary = HYBRID_CASTER[e.cls] ? (base.int + base.wis) * 0.55 : base[C.primary];
  S.maxHp = Math.round((60 + base.sta * 12 + L * 8 + (g.hp || 0)) * C.hpMul * (1 + hpPct));
  S.maxMp = Math.round((40 + base.int * 5 + base.wis * 4 + L * 4 + (g.mp || 0)) * C.mpMul * (1 + (T.mp || 0) + (PM.mpPct || 0)));
  const wAvg = e.weaponAvg ?? weaponAvg(Math.max(1, L - 1)) * 0.6;
  S.weaponAvg = wAvg;
  S.power = (wAvg + primary * 0.9 + (g.power || 0)) * (1 + powerPct);
  S.healPower = (wAvg * 0.8 + (C.healStat ? base[C.healStat] : primary) * 1.0 + (g.heal || 0) + (g.power || 0) * 0.5) * (1 + powerPct);
  S.armor = ((g.armor || 0) + base.sta * 0.6 + L * 2) * C.armorMul * (1 + armorPct);
  S.crit = 5 + base.agi * 0.06 + (g.crit || 0) + critAdd;
  S.haste = (g.haste || 0) + hastePct * 100;
  S.block = isTankClass(e.cls) && e.hasShield ? 12 + (g.block || 0) + (T.block || 0) : 0;
  S.dodge = Math.min(75, Math.min(20, 2 + base.agi * 0.04) + dodgeAdd);
  S.moveSpeed = 7 * (1 + (g.speed || 0) / 100 + speedPct);
  S.dmgMul = 1 + dmgPct;
  S.dmgTaken = 1 + dmgTakenPct;
  S.healMul = 1 + healPct;
  // runes : vol de vie et fortune (en %)
  S.leech = leech + (g.leech || 0) / 100;
  S.fortune = g.fortune || 0;
  S.hpRegen = (base.sta * 0.04 + (g.regen || 0) * 0.2 + S.maxHp * (T.regen || 0)) * (1 + (PM.regenPct || 0));
  S.oocMul = 1 + (PM.regenOutPct || 0);
  S.mpRegen = (S.maxMp * 0.012 + base.wis * 0.06 + (g.regen || 0) * 0.1) * (1 + (T.mana || 0));
  S.castMul = 1 + castPct;
  S.critMult = 1.6 + (T.critDmg || 0);
  S.threatMul = (isTank(e) ? 2.2 : 1) * (1 + (T.threat || 0));
  return S;
}
