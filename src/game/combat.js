// Moteur de combat : hostilité, dégâts, soins, effets (buffs/debuffs), incantations et outils de zone.
import { G, SCHOOL_COLORS } from './state.js';
import { armorReduction, computeStats } from './stats.js';
import { burst, projectile as fxProjectile, groundDisc, telegraph as fxTelegraph, shockRing, beam, after } from './fx.js';
import { clamp, angleTo, wrapAngle } from '../core/util.js';
import { canWalk, getHeight } from '../world/terrain.js';
import { R } from '../core/rng.js';

export const GCD = 1.15;
export const MELEE = 3.6;

// ---------------------------------------------------------------------------
// Définitions des effets
export const BUFFS = {
  // --- contrôles
  stun: { name: 'Étourdi', icon: ['stun', '#ffd24a'], debuff: true, flags: { stun: true } },
  root: { name: 'Enraciné', icon: ['root', '#8fe86a'], debuff: true, flags: { root: true } },
  frozen: { name: 'Gelé', icon: ['frost', '#8fd8ff'], debuff: true, flags: { root: true } },
  slow: { name: 'Ralenti', icon: ['slow', '#8fd8ff'], debuff: true, mods: { speedPct: -0.45 } },
  chill: { name: 'Transi', icon: ['frost', '#8fd8ff'], debuff: true, mods: { speedPct: -0.35, hastePct: -0.15 } },
  poly: { name: 'Métamorphosé', icon: ['poly', '#ffb0e0'], debuff: true, flags: { stun: true, poly: true, breakOnDmg: true } },
  silence: { name: 'Réduit au silence', icon: ['silence', '#b58cff'], debuff: true, flags: { silence: true } },
  web: { name: 'Pris dans la toile', icon: ['web', '#e8e8f0'], debuff: true, flags: { root: true } },
  // --- dégâts sur la durée
  bleed: { name: 'Saignement', icon: ['bleed', '#e04040'], debuff: true, tick: 1, school: 'phys', maxStacks: 3 },
  poison: { name: 'Poison', icon: ['poison', '#b6e04a'], debuff: true, tick: 1, school: 'poison', maxStacks: 3 },
  burn: { name: 'Brûlure', icon: ['fire', '#ff9a3a'], debuff: true, tick: 1, school: 'fire', maxStacks: 3 },
  swarm: { name: 'Essaim', icon: ['swarm', '#c8e060'], debuff: true, tick: 1, school: 'nature' },
  roots_dot: { name: 'Ronces', icon: ['root', '#8fe86a'], debuff: true, tick: 1, school: 'nature', flags: { root: true } },
  drain: { name: 'Drain de vie', icon: ['drain', '#b58cff'], debuff: true, tick: 1, school: 'shadow' },
  lava: { name: 'Lave', icon: ['fire', '#ff6a1a'], debuff: true, tick: 0.5, school: 'fire' },
  // --- affaiblissements
  sunder: { name: 'Armure brisée', icon: ['sunder', '#c8763a'], debuff: true, mods: { armorPct: -0.3 } },
  weakness: { name: 'Affaibli', icon: ['weak', '#9a9aa0'], debuff: true, mods: { dmgPct: -0.2 } },
  exposed: { name: 'Exposé', icon: ['weak', '#ff8a3a'], debuff: true, mods: { dmgTakenPct: 0.12 } },
  // --- bénéfiques
  hot: { name: 'Régénération', icon: ['regrowth', '#8fe86a'], tick: 1, heal: true },
  bloom: { name: 'Floraison', icon: ['bloom', '#ffb0e0'], tick: 1, heal: true },
  avatar_hot: { name: 'Sève vive', icon: ['avatar', '#3fbf9f'], tick: 1, heal: true },
  potion_hot: { name: 'Potion', icon: ['potion', '#ff5a5a'], tick: 1, heal: true },
  food: { name: 'Repas', icon: ['food', '#e0b050'], tick: 1, heal: true, flags: { breakOnDmg: true } },
  elixir: { name: 'Élixir', icon: ['potion', '#3a8a7a'] },
  wellfed: { name: 'Bien nourri', icon: ['food', '#c86a3a'] },
  bandage: { name: 'Bandage', icon: ['heal', '#e8e0d0'], tick: 1, heal: true, flags: { breakOnDmg: true } },
  bandaged: { name: 'Récemment bandé', icon: ['heal', '#6a5a5a'] },
  battlecry: { name: 'Cri de guerre', icon: ['shout', '#ff9a3a'], mods: { dmgPct: 0.12 } },
  shieldwall: { name: 'Mur de bouclier', icon: ['shieldwall', '#c9ced6'], mods: { dmgTakenPct: -0.5 } },
  rampart: { name: 'Rempart', icon: ['rampart', '#d9a441'], mods: { dmgTakenPct: -0.15 } },
  titan: { name: 'Colère du titan', icon: ['titan', '#e04040'], mods: { dmgPct: 0.3, leech: 0.15 } },
  arcane_shield: { name: 'Bouclier arcanique', icon: ['ashield', '#d49aff'], absorb: true },
  overload: { name: 'Surcharge arcanique', icon: ['overload', '#d49aff'], mods: { dmgPct: 0.25, castPct: -0.3 } },
  hawkeye: { name: 'Œil de faucon', icon: ['hawk', '#e0c060'], mods: { critAdd: 15 } },
  camo: { name: 'Camouflage', icon: ['camo', '#6fbf4a'], flags: { stealth: true, breakOnDmg: true } },
  deluge: { name: 'Déluge', icon: ['deluge', '#6fbf4a'], mods: { hastePct: 0.35 } },
  packspirit: { name: 'Esprit de la meute', icon: ['pack', '#3fbf9f'], mods: { speedPct: 0.2, hastePct: 0.1 } },
  bark: { name: 'Écorce', icon: ['bark', '#8a6440'], mods: { dmgTakenPct: -0.3 } },
  avatar: { name: 'Avatar sylvestre', icon: ['avatar', '#3fbf9f'], mods: { healPct: 0.3, armorPct: 0.3 } },
  meditate: { name: 'Méditation', icon: ['meditate', '#7fb8ff'] },
  howl: { name: 'Hurlement', icon: ['shout', '#e04040'], mods: { dmgPct: 0.2, speedPct: 0.1 } },
  enrage: { name: 'Enragé', icon: ['titan', '#ff3030'], mods: { dmgPct: 0.5, hastePct: 0.25 } },
  immune: { name: 'Insensible', icon: ['shieldwall', '#ffffff'], flags: { immune: true } },
  bastion: { name: 'Bénédiction du Bastion', icon: ['rampart', '#ffe68a'], mods: { dmgPct: 0.05 } },
  mounted: { name: 'Monté', icon: ['mount', '#c8a060'], mods: { speedPct: 0.65 }, flags: { mount: true } },
  spirit_speed: { name: 'Hâte', icon: ['pack', '#7fd1ff'], mods: { speedPct: 0.4 } },
  // --- Templier
  aegis: { name: 'Égide radieuse', icon: ['aegis', '#f0c850'], absorb: true },
  valor: { name: 'Sceau de vaillance', icon: ['seal', '#f0c850'], mods: { dmgTakenPct: -0.1, dmgPct: 0.05 } },
  intercession: { name: "Voile d'intercession", icon: ['veil', '#fff4c8'], mods: { dmgTakenPct: -0.5 } },
  faith_wall: { name: 'Rempart de foi', icon: ['faithwall', '#f0c850'], mods: { dmgTakenPct: -0.4 } },
  faith_regen: { name: 'Foi régénératrice', icon: ['faithwall', '#f0c850'], tick: 1, heal: true },
  ascension: { name: "Ascension d'airain", icon: ['ascend', '#f0c850'], mods: { dmgPct: 0.3, healPct: 0.3 } },
  // --- Assassin
  deadly_poison: { name: 'Poison mortel', icon: ['envenom', '#9ae040'], debuff: true, tick: 1, school: 'poison', maxStacks: 5 },
  shadowveil: { name: "Voile d'ombre", icon: ['shadowveil', '#e05a78'], flags: { stealth: true } },
  evasion: { name: 'Esquive fluide', icon: ['evasion', '#e05a78'], mods: { dodgeAdd: 50 } },
  death_mark: { name: 'Marque du trépas', icon: ['mark', '#e05a78'], debuff: true, mods: { dmgTakenPct: 0.15 } },
  bladedance: { name: 'Danse des lames', icon: ['bladedance', '#e05a78'], mods: { hastePct: 0.3 } },
  murder: { name: 'Frénésie mortelle', icon: ['frenzy', '#e05a78'], mods: { critAdd: 30, dmgPct: 0.2 } },
  // --- Nécromancien
  blight: { name: 'Flétrissure', icon: ['blight', '#a8a4d8'], debuff: true, tick: 1, school: 'shadow' },
  bone_armor: { name: "Armure d'os", icon: ['bonearmor', '#e6dfcd'], absorb: true },
  affliction: { name: "Malédiction d'affliction", icon: ['curse', '#a8a4d8'], debuff: true, mods: { dmgPct: -0.2, dmgTakenPct: 0.1 } },
  lichform: { name: 'Forme de liche', icon: ['lich', '#a8a4d8'], mods: { dmgPct: 0.3, castPct: -0.25 } },
  // --- Chaman
  stormscale: { name: "Écailles d'orage", icon: ['scales', '#2ab5ff'], absorb: true, flags: { thorns: true } },
  ancestral: { name: 'Esprit ancestral', icon: ['ancestral', '#2ab5ff'], tick: 1, heal: true },
  windfury: { name: 'Totem des vents', icon: ['totemwind', '#9fe8ff'], mods: { hastePct: 0.15 } },
  incarnation: { name: 'Incarnation élémentaire', icon: ['incarnate', '#2ab5ff'], mods: { healPct: 0.3, dmgPct: 0.3, castPct: -0.2 } },
  // --- spécialisations
  laststand: { name: 'Dernier rempart', icon: ['rampart', '#e04040'], mods: { dmgTakenPct: -0.3 } },
  berserk: { name: 'Rage berserker', icon: ['frenzy', '#d0402a'], mods: { hastePct: 0.25, dmgPct: 0.15 } },
  grace: { name: 'Grâce', icon: ['lightheal', '#fff4c8'], tick: 1, heal: true },
  ardent: { name: 'Gardien ardent', icon: ['aegis', '#ffe68a'], mods: { dmgTakenPct: -0.35 } },
  distortion: { name: 'Distorsion temporelle', icon: ['blink', '#d49aff'], mods: { hastePct: 0.2 } },
  plague: { name: 'Peste', icon: ['plague', '#9ae040'], debuff: true, tick: 1, school: 'shadow' },
  bloodpact: { name: 'Pacte de sang', icon: ['drain', '#c02020'], mods: { dmgTakenPct: -0.3, leech: 0.25 } },
  beastspirit: { name: 'Esprit de la bête', icon: ['wolf', '#c8a060'], mods: { dmgPct: 0.25, hastePct: 0.2 } },
  toxin: { name: 'Toxine foudroyante', icon: ['envenom', '#d0ff6a'], debuff: true, tick: 1, school: 'poison', mods: { speedPct: -0.3 } },
  wildgrowth: { name: 'Croissance sauvage', icon: ['regrowth', '#d0ffb0'], tick: 1, heal: true },
  treeoflife: { name: 'Arbre de vie', icon: ['tree', '#8fe86a'], mods: { healPct: 0.3 } },
  moonfire: { name: 'Éclat lunaire', icon: ['moon', '#c8b8ff'], debuff: true, tick: 1, school: 'arcane' },
  rake: { name: 'Lacération', icon: ['claw', '#e0b040'], debuff: true, tick: 1, school: 'phys' },
  instincts: { name: 'Instincts de survie', icon: ['bear', '#8a6440'], mods: { dmgTakenPct: -0.4 } },
  riptide: { name: 'Vague vive', icon: ['wave', '#bff0ff'], tick: 1, heal: true },
  catform: { name: 'Forme féline', icon: ['cat', '#e0b040'], mods: { speedPct: 0.25, critAdd: 8 }, flags: { form: 'felin' } },
  bearform: { name: "Forme d'ours", icon: ['bear', '#8a6440'], mods: { armorPct: 1.2, hpPct: 0.3, dodgeAdd: 12 }, flags: { form: 'ours' } },
  // --- donjons et familiers
  pet_bond: { name: 'Lien du familier', icon: ['pack', '#d8e8c0'], mods: { dmgPct: 0.03 } },
  heroism_inst: { name: 'Courage des profondeurs', icon: ['titan', '#ffd24a'], mods: { dmgPct: 0.1, dmgTakenPct: -0.1 } },
  boss_enrage: { name: 'Fureur', icon: ['titan', '#ff2020'], mods: { dmgPct: 1.0, hastePct: 0.5 } },
  frenzied_affix: { name: 'Frénésie', icon: ['titan', '#ff6a2a'], mods: { dmgPct: 0.5, hastePct: 0.2 } },
  affix_hatif: { name: 'Hâtif', icon: ['pack', '#ffb040'], mods: { speedPct: 0.2, hastePct: 0.2 } },
  grief: { name: 'Deuil vengeur', icon: ['titan', '#ff4040'], mods: { dmgPct: 0.35, hastePct: 0.15 } },
  fixate: { name: 'Fixé', icon: ['aim', '#ff4040'], debuff: true },
  doom: { name: 'Condamnation', icon: ['drain', '#ff4040'], debuff: true },
  vulnerable: { name: 'Vulnérable', icon: ['weak', '#ffb040'], debuff: true, mods: { dmgTakenPct: 0.25 } },
  shielded: { name: 'Bouclier de sbires', icon: ['shieldwall', '#9fe8ff'], flags: { immune: true } },
  resurrect_sick: { name: 'Faiblesse de résurrection', icon: ['weak', '#9a9aa0'], debuff: true, mods: { dmgPct: -0.25, dmgTakenPct: 0.15 } },
  well_rested: { name: 'Bien reposé', icon: ['food', '#ffe68a'] },
};
for (const id in BUFFS) BUFFS[id].id = id;

// ---------------------------------------------------------------------------
export function isPlayerLike(e) {
  return e.kind === 'player' || e.kind === 'bot' || e.kind === 'remote';
}

export function isHostile(a, b) {
  if (!a || !b || a === b) return false;
  if (a.neutral || b.neutral) return false;
  if (a.faction === b.faction) return false;
  return true;
}
export function isFriendly(a, b) {
  return a && b && !a.neutral && !b.neutral && a.faction === b.faction;
}
export function canAttack(a, b) {
  return b && !b.dead && !b.noTarget && isHostile(a, b) && !(hasFlag(b, 'stealth') && dist(a, b) > 4);
}

export const dist = (a, b) => Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
export const edgeDist = (a, b) => Math.max(0, dist(a, b) - (b.radius || 0.5) * 0.8);

export function hasFlag(e, f) {
  for (const b of e.buffs) if (b.def.flags && b.def.flags[f]) return true;
  return false;
}
export function hasBuff(e, id) {
  return e.buffs.find((b) => b.def.id === id) || null;
}

// ---------------------------------------------------------------------------
// Effets
// opt: {dur, value (dégâts/soins par tick ou absorb), stacks, scale}
export function addBuff(tgt, id, src, opt = {}) {
  if (!tgt || tgt.dead) return null;
  const def = BUFFS[id];
  if (!def) return null;
  if (def.debuff && hasFlag(tgt, 'immune')) return null;
  // un étourdissement interrompt toujours une incantation interruptible, même si la cible y résiste
  if (def.flags?.stun && tgt.windup?.interruptible) interruptWindup(tgt, src);
  // les boss résistent aux contrôles lourds
  if ((tgt.boss || tgt.worldBoss) && def.flags && (def.flags.stun || def.flags.poly)) {
    G.ui?.floatText(tgt, 'Résiste', 'immune');
    return null;
  }
  // formes animales : une seule à la fois
  if (def.flags?.form) for (const x of tgt.buffs.slice()) if (x.def.flags?.form && x.def.id !== id) removeBuff(tgt, x);
  let b = tgt.buffs.find((x) => x.def.id === id && (!def.tick || x.src === src || def.maxStacks));
  const dur = opt.dur ?? def.dur ?? 5;
  // talents : boucliers d'absorption renforcés
  let val = opt.value;
  if (def.absorb && val && src?.tal?.mods?.absorb) val *= 1 + src.tal.mods.absorb;
  if (b) {
    b.t = 0; b.dur = Math.max(b.dur - b.t, dur);
    if (def.maxStacks) b.stacks = Math.min(def.maxStacks, (b.stacks || 1) + 1);
    if (val !== undefined) b.value = Math.max(b.value || 0, val);
    if (opt.scale !== undefined) b.scale = opt.scale;
    b.src = src;
  } else {
    b = { def, src, t: 0, dur, tickT: 0, stacks: opt.stacks || 1, value: val || 0, scale: opt.scale ?? 1 };
    tgt.buffs.push(b);
    if (opt.stats) b.stats = opt.stats;
    if (def.flags?.form && tgt.setForm) tgt.setForm(def.flags.form);
  }
  if (opt.thorns !== undefined) b.thorns = opt.thorns;
  if (def.flags?.stun || def.flags?.poly) {
    if (tgt.cast) interrupt(tgt);
    if (def.flags.poly && tgt.setPoly) tgt.setPoly(true);
  }
  if (def.flags?.mount === undefined && tgt.mounted && def.debuff && (def.flags?.stun || def.flags?.root)) tgt.dismount?.();
  tgt.statsDirty = true;
  return b;
}

export function removeBuff(tgt, idOrBuff) {
  const i = typeof idOrBuff === 'string' ? tgt.buffs.findIndex((b) => b.def.id === idOrBuff) : tgt.buffs.indexOf(idOrBuff);
  if (i < 0) return;
  const b = tgt.buffs[i];
  tgt.buffs.splice(i, 1);
  if (b.def.flags?.poly && tgt.setPoly) tgt.setPoly(false);
  if (b.def.flags?.form && tgt.setForm && !tgt.buffs.some((x) => x.def.flags?.form)) tgt.setForm(null);
  if (b.def.id === 'mounted' && tgt.onDismount) tgt.onDismount();
  tgt.statsDirty = true;
}

export function clearDebuffs(tgt, flagOnly) {
  for (let i = tgt.buffs.length - 1; i >= 0; i--) {
    const b = tgt.buffs[i];
    if (!b.def.debuff) continue;
    if (flagOnly && !(b.def.flags && b.def.flags[flagOnly])) continue;
    removeBuff(tgt, b);
  }
}

export function updateBuffs(e, dt) {
  for (let i = e.buffs.length - 1; i >= 0; i--) {
    const b = e.buffs[i];
    b.t += dt;
    const d = b.def;
    if (d.tick) {
      b.tickT += dt;
      while (b.tickT >= d.tick && !e.dead) {
        b.tickT -= d.tick;
        const v = (b.value || 0) * (b.stacks || 1);
        if (d.heal) heal(b.src || e, e, v, { tick: true, silent: false, skill: d.name });
        else if (v > 0) dealDamage(b.src || e, e, v, { school: d.school || 'phys', dot: true, noCrit: true, skill: d.name });
        if (d.id === 'drain' && b.src && !b.src.dead) heal(b.src, b.src, v * 0.6, { tick: true, silent: true });
      }
    }
    if (e.dead) return;
    if (b.t >= b.dur) removeBuff(e, b);
  }
}

// ---------------------------------------------------------------------------
// Menace (monstres)
export function addThreat(mob, src, amount) {
  if (!mob.threat || mob.dead || !src || src === mob) return;
  if (src.kind === 'mob' || src.kind === 'npc' && !src.guard) return;
  mob.threat.set(src, (mob.threat.get(src) || 0) + amount);
  if (mob.onThreat) mob.onThreat(src);
}

function enterCombat(e) {
  e.combatT = 0;
  if (e.onCombat) e.onCombat();
}

// ---------------------------------------------------------------------------
// Dégâts
// opt: {school, skill, crit, noCrit, critBonus, dot, pure, threatMul, fromNet, silentText}
export function dealDamage(src, tgt, amount, opt = {}) {
  if (!tgt || tgt.dead || tgt.invulnerable) return 0;
  if (src && src !== tgt && !isHostile(src, tgt) && !opt.force) return 0;
  const school = opt.school || 'phys';
  if (hasFlag(tgt, 'immune')) { G.ui?.floatText(tgt, 'Insensible', 'immune'); return 0; }
  const involvesMe = src === G.player || tgt === G.player;
  let crit = false;
  let amt = amount;
  if (!opt.fromNet) {
    // esquive (attaques physiques directes)
    if (school === 'phys' && !opt.dot && R() * 100 < (tgt.stats.dodge || 0)) {
      if (involvesMe || src?.isLocalParty) G.ui?.floatText(tgt, 'Esquive', 'miss');
      if (tgt.model) tgt.model.play('hit', 0.2);
      if (tgt.kind === 'mob') addThreat(tgt, src, 1);
      return 0;
    }
    if (src && src.stats) {
      amt *= src.stats.dmgMul || 1;
      // métiers : dégâts physiques / des sorts, dégâts contre les bêtes
      const PM = src.pmods;
      if (PM) {
        amt *= 1 + ((school === 'phys' ? PM.dmgPhysPct : PM.dmgSpellPct) || 0);
        if (PM.beastDmgPct && tgt.kind === 'mob' && (tgt.def?.family || 'bête') === 'bête') amt *= 1 + PM.beastDmgPct;
      }
      // talents : efficacité par compétence, dégâts périodiques, achèvement des cibles affaiblies
      let critB = opt.critBonus || 0;
      const T = src.tal;
      if (T) {
        const bn = opt.skill && T.byName[opt.skill];
        if (bn) { amt *= 1 + bn.dmg; critB += bn.crit; }
        if (opt.dot && T.mods.dot) amt *= 1 + T.mods.dot;
        if (T.mods.execute && tgt.hp < (tgt.stats.maxHp || 1) * 0.35) amt *= 1 + T.mods.execute;
      }
      if (!opt.noCrit && !opt.dot) {
        crit = opt.crit ?? (src.nextCrit ? true : R() * 100 < (src.stats.crit || 5) + critB);
        if (src.nextCrit) { src.nextCrit = false; if (src.ambush) { amt *= 1 + src.ambush; src.ambush = 0; } }
        if (crit) amt *= (src.stats.critMult || 1.5) + (opt.critMultBonus || 0);
      }
      // écart de niveau
      const ld = clamp((src.level || 1) - (tgt.level || 1), -6, 6);
      amt *= 1 + ld * 0.04;
    }
    if (!opt.pure) {
      const red = armorReduction(tgt.stats.armor || 0, src?.level || 1);
      amt *= school === 'phys' ? 1 - red : 1 - red * 0.45;
    }
    // blocage au bouclier
    if (school === 'phys' && !opt.dot && tgt.stats.block && R() * 100 < tgt.stats.block) {
      amt *= 0.5;
      G.ui?.floatText(tgt, 'Bloqué', 'miss');
    }
    amt *= tgt.stats.dmgTaken || 1;
    if (tgt.tal?.mods?.lowhp && tgt.hp < (tgt.stats.maxHp || 1) * 0.35) amt *= Math.max(0.2, 1 + tgt.tal.mods.lowhp);
    if (isPlayerLike(src || {}) && isPlayerLike(tgt)) amt *= 0.72; // équilibrage JcJ
    amt = Math.max(1, Math.round(amt * (0.93 + R() * 0.14)));
  } else {
    crit = !!opt.crit;
    amt = Math.round(amt);
  }
  // cible distante (autre vrai joueur) : c'est son client qui applique les dégâts
  if (tgt.kind === 'remote') {
    if (src !== G.player) return 0; // seul notre propre personnage frappe les autres vrais joueurs
    if (!opt.fromNet) G.net?.sendPvp(tgt, amt, school, crit, opt.skill);
    G.ui?.floatText(tgt, amt, crit ? 'crit' : 'dmg', school);
    if (tgt.model) tgt.model.flash(0xffffff, 0.1);
    enterCombat(src);
    return amt;
  }
  // boucliers d'absorption
  for (const b of tgt.buffs) {
    if (b.def.absorb && b.value > 0) {
      const a = Math.min(b.value, amt);
      b.value -= a; amt -= a;
      if (b.value <= 0) b.t = b.dur;
      if (amt <= 0) { G.ui?.floatText(tgt, 'Absorbé', 'miss'); return 0; }
    }
  }
  tgt.hp -= amt;
  tgt.lastAttacker = src;
  if (src) enterCombat(src);
  enterCombat(tgt);
  if (tgt.kind === 'mob') addThreat(tgt, src, amt * (opt.threatMul || 1) * (src?.kind === 'pet' ? src.stats?.threatMul ?? 0.6 : src?.stats?.threatMul || 1));
  if (tgt.tappers && src && src.kind !== 'mob') {
    tgt.tappers.add(src);
    if (src.kind === 'player' || src.isLocalParty || (src.kind === 'pet' && src.owner?.isLocalParty)) tgt.tappedByMe = true;
  }
  if (tgt.kind === 'mob' && !opt.fromNet && (src === G.player || (src?.kind === 'pet' && src.owner === G.player))) G.net?.sendMobDamage(tgt, amt, crit, school);
  // rupture de contrôles
  for (let i = tgt.buffs.length - 1; i >= 0; i--) if (tgt.buffs[i].def.flags?.breakOnDmg && !opt.dot) removeBuff(tgt, tgt.buffs[i]);
  if (src && src.buffs && !opt.dot) { for (let i = src.buffs.length - 1; i >= 0; i--) if (src.buffs[i].def.flags?.stealth) removeBuff(src, src.buffs[i]); }
  // épines (Écailles d'orage)
  if (src && src !== tgt && !opt.dot && !opt.thorns && !src.dead) {
    for (const b of tgt.buffs) if (b.def.flags?.thorns && b.thorns > 0) { dealDamage(tgt, src, b.thorns, { school: 'lightning', noCrit: true, thorns: true, skill: b.def.name }); break; }
  }
  if (tgt.mounted && !opt.dot) tgt.dismount?.();
  if (src && src.stats?.leech && !opt.dot) heal(src, src, amt * src.stats.leech, { silent: true });
  // visuels
  if (tgt.model && !opt.dot) { tgt.model.flash(school === 'phys' ? 0xffffff : SCHOOL_COLORS[school] || 0xffffff, 0.12); if (!tgt.cast && R() < 0.5) tgt.model.play('hit', 0.25); }
  if (!opt.silentText) {
    const show = involvesMe || src?.isLocalParty || tgt.isLocalParty || (tgt.kind === 'mob' && tgt.tappedByMe && src?.kind !== 'mob');
    if (show) G.ui?.floatText(tgt, amt, tgt === G.player ? 'hurt' : crit ? 'crit' : opt.dot ? 'dot' : 'dmg', school);
  }
  if (tgt === G.player) G.ui?.onPlayerHit?.(amt, src);
  if (crit && src === G.player && !opt.dot) G.cam && (G.cam.shake = Math.max(G.cam.shake, 0.08));
  if (!opt.dot && tgt.model) {
    const c = school === 'phys' ? '#ff5050' : SCHOOL_COLORS[school];
    burst(tgt.pos.x, tgt.pos.y + tgt.model.height * 0.55, tgt.pos.z, { count: crit ? 10 : 5, color: c, color2: '#ffffff', speed: 3, life: 0.4, size: 0.12 });
  }
  if (src === G.player || tgt === G.player) G.audio?.play(crit ? 'crit' : school === 'phys' ? 'hit' : 'spellhit', tgt.pos);
  G.world?.onDamage?.(src, tgt, amt, opt);
  if (tgt.hp <= 0) kill(tgt, src);
  return amt;
}

export function heal(src, tgt, amount, opt = {}) {
  if (!tgt || tgt.dead) return 0;
  if (src && src !== tgt && !isFriendly(src, tgt)) return 0;
  let amt = amount * (src?.stats?.healMul || 1);
  // métiers : soins reçus (sauf potions, déjà gérées par l'alchimie)
  if (tgt.pmods?.healRecvPct && opt.skill !== 'Potion') amt *= 1 + tgt.pmods.healRecvPct;
  const T = src?.tal;
  if (T) {
    const bn = opt.skill && T.byName[opt.skill];
    if (bn) amt *= 1 + bn.dmg;
    if (opt.tick && T.mods.hot) amt *= 1 + T.mods.hot;
  }
  let crit = false;
  if (!opt.tick && !opt.noCrit && src && R() * 100 < (src.stats.crit || 5)) { crit = true; amt *= 1.5; }
  amt = Math.round(amt);
  if (tgt.kind === 'remote') {
    if (src !== G.player) return 0;
    if (!opt.fromNet) G.net?.sendHeal(tgt, amt, crit);
    G.ui?.floatText(tgt, '+' + amt, 'heal');
    return amt;
  }
  const before = tgt.hp;
  tgt.hp = Math.min(tgt.stats.maxHp, tgt.hp + amt);
  const eff = tgt.hp - before;
  // menace de soin répartie sur les monstres engagés
  if (src && eff > 0 && src.kind !== 'mob') {
    const mobs = G.world?.mobsEngagedWith?.(tgt);
    if (mobs) for (const m of mobs) addThreat(m, src, eff * 0.5 / Math.max(1, mobs.length));
  }
  if (!opt.silent && eff > 0 && (src === G.player || tgt === G.player || tgt.isLocalParty)) G.ui?.floatText(tgt, '+' + Math.round(eff), crit ? 'healcrit' : 'heal');
  return eff;
}

// ---------------------------------------------------------------------------
export function kill(tgt, src) {
  if (tgt.dead) return;
  tgt.dead = true;
  tgt.hp = 0;
  tgt.deathT = 0;
  if (tgt.cast) interrupt(tgt);
  for (let i = tgt.buffs.length - 1; i >= 0; i--) removeBuff(tgt, tgt.buffs[i]);
  tgt.statsDirty = true;
  if (tgt.model) tgt.model.die();
  if (tgt.threat) tgt.threat.clear();
  G.world?.onKill(tgt, src);
}

// ---------------------------------------------------------------------------
// Outils de zone
export function enemiesAround(src, x, z, r, max = 99) {
  const out = [];
  for (const e of G.world.query(x, z, r + 2)) {
    if (e === src || e.dead || !canAttack(src, e)) continue;
    const d = Math.hypot(e.pos.x - x, e.pos.z - z) - (e.radius || 0.5) * 0.6;
    if (d <= r) out.push(e);
  }
  out.sort((a, b) => Math.hypot(a.pos.x - x, a.pos.z - z) - Math.hypot(b.pos.x - x, b.pos.z - z));
  return out.slice(0, max);
}
export function alliesAround(src, x, z, r, includeSelf = true) {
  const out = [];
  for (const e of G.world.query(x, z, r + 1)) {
    if (e.dead || e.noTarget) continue;
    if (e === src && !includeSelf) continue;
    if (!isFriendly(src, e)) continue;
    if (Math.hypot(e.pos.x - x, e.pos.z - z) <= r) out.push(e);
  }
  return out;
}
// ennemis dans un cône devant src
export function enemiesInCone(src, range, angle, dir = src.ry, max = 99) {
  const out = [];
  for (const e of enemiesAround(src, src.pos.x, src.pos.z, range)) {
    const a = angleTo(src.pos.x, src.pos.z, e.pos.x, e.pos.z);
    if (Math.abs(wrapAngle(a - dir)) <= angle / 2 || dist(src, e) < 1.5) out.push(e);
  }
  return out.slice(0, max);
}
// ennemis sur une ligne
export function enemiesInLine(src, len, width, dir = src.ry) {
  const out = [];
  const dx = Math.sin(dir), dz = Math.cos(dir);
  for (const e of enemiesAround(src, src.pos.x + dx * len / 2, src.pos.z + dz * len / 2, len / 2 + width)) {
    const rx = e.pos.x - src.pos.x, rz = e.pos.z - src.pos.z;
    const along = rx * dx + rz * dz;
    const perp = Math.abs(rx * dz - rz * dx);
    if (along > -0.5 && along < len && perp < width + (e.radius || 0.5) * 0.5) out.push(e);
  }
  return out;
}

export function projectile(src, tgt, kind, onHit, speed = 32, arc = 0) {
  const from = src.handPos ? src.handPos() : { x: src.pos.x, y: src.pos.y + (src.model?.height || 1.8) * 0.7, z: src.pos.z };
  fxProjectile({ from, target: tgt, kind, speed, arc, onHit });
}

// Zone persistante au sol : fn(entitésTouchées) à chaque tick
export function groundZone(src, x, z, r, dur, tick, color, fn, opt = {}) {
  const h = groundDisc(x, z, r, color, dur);
  if (src && !isFriendlyCaster(src) && !opt.safe) addDanger({ x, z, r, angle: 0, dir: 0, until: G.time + dur, src, zone: true });
  let t = 0, acc = 0;
  const zone = { x, z, r, dur, done: false };
  G.world.addTicker((dt) => {
    t += dt; acc += dt;
    if (src.dead && !opt.persist) { h.remove(); return false; }
    while (acc >= tick) { acc -= tick; fn(zone); }
    if (opt.particles) burst(x + (R() - 0.5) * r * 1.4, getHeight(x, z) + 0.3, z + (R() - 0.5) * r * 1.4, opt.particles);
    if (t >= dur) { h.remove(); return false; }
    return true;
  });
  return zone;
}

// Zones dangereuses annoncées (télégraphes, flaques) : l'IA des bots et des familiers s'en écarte.
export const DANGERS = [];
function casterOf(opt) { return opt?.src || G.curCaster || null; }
const isFriendlyCaster = (c) => !!c && (isPlayerLike(c) || c.kind === 'pet');
export function addDanger(d) { DANGERS.push(d); if (DANGERS.length > 200) DANGERS.splice(0, DANGERS.length - 200); }
export function telegraph(x, z, r, delay, onFire, opt = {}) {
  const c = casterOf(opt);
  const friendly = isFriendlyCaster(c);
  if (!friendly && !opt.safe) addDanger({ x, z, r, angle: opt.angle || 0, dir: opt.dir || 0, until: G.time + delay + 0.15, src: c });
  fxTelegraph(x, z, r, delay, onFire, { ...opt, color: opt.color || (friendly ? '#58c8ff' : '#ff3a2a') });
}
// danger actif à la position d'une entité (null sinon)
export function dangerAt(x, z, pad = 0.7) {
  const now = G.time;
  for (let i = DANGERS.length - 1; i >= 0; i--) {
    const d = DANGERS[i];
    if (d.until < now) { DANGERS.splice(i, 1); continue; }
    const dx = x - d.x, dz = z - d.z, dd = Math.hypot(dx, dz);
    if (dd > d.r + pad) continue;
    if (d.angle) { const a = Math.atan2(dx, dz); if (Math.abs(wrapAngle(a - d.dir)) > d.angle / 2 + 0.15 && dd > 1.5) continue; }
    return d;
  }
  return null;
}

// Déplacement rapide (charge, bond) : l'entité glisse jusqu'au point
export function dash(e, x, z, speed = 30, onArrive, opt = {}) {
  e.dashing = { x, z, speed, onArrive, arc: opt.arc || 0, sx: e.pos.x, sz: e.pos.z, t: 0, d: Math.hypot(x - e.pos.x, z - e.pos.z) };
  if (e.model) e.model.play(opt.anim || 'leap', Math.max(0.3, e.dashing.d / speed));
}

export function knockback(e, fromX, fromZ, d = 4) {
  if (e.boss || e.dead) return;
  const a = Math.atan2(e.pos.x - fromX, e.pos.z - fromZ);
  let x = e.pos.x + Math.sin(a) * d, z = e.pos.z + Math.cos(a) * d;
  if (!canWalk(e.pos.x, e.pos.z, x, z)) return;
  dash(e, x, z, 18, null, { anim: 'hit' });
}

export function taunt(src, mobs) {
  for (const m of mobs) {
    if (m.kind !== 'mob' || m.dead) continue;
    let top = 0;
    for (const v of m.threat.values()) top = Math.max(top, v);
    m.threat.set(src, top * 1.2 + 50);
    m.forceTarget = src; m.forceT = 3;
  }
}

// ---------------------------------------------------------------------------
// Incantation / utilisation de compétence
export function skillCost(e, s) {
  const k = 1 + (e.tal?.sk?.[s.id]?.cost || 0);
  return Math.round(((s.cost || 0) / 100) * e.stats.maxMp * Math.max(0.2, k));
}
// recharge effective (talents compris)
export function skillCd(c, s, rank) {
  const base = typeof s.cd === 'function' ? s.cd(rank) : s.cd;
  return Math.max(0.5, base + (c.tal?.sk?.[s.id]?.cd || 0));
}

// retourne {ok:true} ou {ok:false, err}
export function useSkill(c, s, target, opt = {}) {
  if (c.dead) return { ok: false, err: 'Vous êtes mort.' };
  if (hasFlag(c, 'stun')) return { ok: false, err: 'Vous êtes étourdi.' };
  if (s.school && s.school !== 'phys' && hasFlag(c, 'silence')) return { ok: false, err: 'Réduit au silence.' };
  const rank = c.skillRank(s.id);
  if (!rank) return { ok: false, err: 'Compétence non apprise.' };
  if ((c.cds[s.id] || 0) > 0) return { ok: false, err: 'Pas encore prêt.', cd: true };
  if (c.cast) return { ok: false, err: 'Incantation en cours.', busy: true };
  if (s.gcd !== false && c.gcd > 0) return { ok: false, err: '', gcd: true };
  const cost = skillCost(c, s);
  if (c.mp < cost) return { ok: false, err: 'Pas assez de mana.' };
  if (s.canUse && !s.canUse(c)) return { ok: false, err: s.cantMsg || 'Impossible maintenant.' };

  let t = null, pos = null;
  const range = (s.range || MELEE) + (s.rangeBonus ? s.rangeBonus(c) : 0) + (hasBuff(c, 'hawkeye') && s.range > 8 ? 5 : 0);
  if (s.target === 'enemy') {
    t = target && canAttack(c, target) ? target : null;
    if (!t && opt.autoTarget !== false) t = G.world.nearestEnemy(c, range + 2, true);
    if (!t) return { ok: false, err: 'Aucune cible.' };
    if (edgeDist(c, t) > range + 0.5) return { ok: false, err: 'Hors de portée.', range: true, target: t };
    if (s.noBoss && (t.boss || t.worldBoss)) return { ok: false, err: 'Impossible sur cette cible.' };
  } else if (s.target === 'ally') {
    t = target && !target.dead && isFriendly(c, target) ? target : c;
    if (t !== c && dist(c, t) > range + 0.5) return { ok: false, err: 'Hors de portée.', range: true, target: t };
  } else if (s.target === 'ground') {
    const tg = target && canAttack(c, target) ? target : G.world.nearestEnemy(c, range, true);
    if (tg && dist(c, tg) <= range + 1) pos = { x: tg.pos.x, z: tg.pos.z };
    else {
      const d = Math.min(range, s.groundDefault || 8);
      pos = { x: c.pos.x + Math.sin(c.ry) * d, z: c.pos.z + Math.cos(c.ry) * d };
    }
  } else {
    t = c;
  }
  if (s.check) { const e = s.check(c, t); if (e) return { ok: false, err: e }; }
  if (t && t !== c) c.faceTo(t.pos.x, t.pos.z);
  else if (pos) c.faceTo(pos.x, pos.z);
  if (c.mounted && !s.mountOk) c.dismount?.();

  const haste = 1 + (c.stats.haste || 0) / 100;
  if (s.cast > 0 || s.channel) {
    const tk = s.channel ? 0 : c.tal?.sk?.[s.id]?.cast || 0;
    const dur = ((s.channel || s.cast) / haste) * (c.stats.castMul || 1) * Math.max(0.3, 1 + tk);
    c.cast = { s, rank, t, pos, time: 0, dur, channel: !!s.channel, tickT: 0 };
    if (c.model) c.model.play(s.channel ? 'channel' : s.anim || 'channel', dur + 0.1);
    if (c.onCastStart) c.onCastStart(c.cast);
    G.net?.onLocalCast?.(c, s, t, pos, dur);
  } else {
    execute(c, s, rank, t, pos);
  }
  if (s.gcd !== false) c.gcd = GCD / haste;
  return { ok: true, target: t };
}

function execute(c, s, rank, t, pos) {
  const cost = skillCost(c, s);
  c.mp = Math.max(0, c.mp - cost);
  if (s.cd) c.cds[s.id] = skillCd(c, s, rank);
  const cam = hasBuff(c, 'camo');
  if (cam && !s.keepStealth) removeBuff(c, cam);
  if (t && t !== c && t.dead && s.target === 'enemy') return;
  if (c.model && s.anim && !s.channel) c.model.play(s.anim, s.animDur || 0.45);
  G.curCaster = c;
  try { s.run(c, t, rank, { pos, s }); } catch (e) { console.error('skill', s.id, e); } finally { G.curCaster = null; }
  if (s.interrupt && t && t !== c && t.windup?.interruptible) interruptWindup(t, c);
  G.audio?.play(s.sound || 'cast', c.pos, c === G.player ? 1 : 0.5);
  if (c === G.player || c.isLocalParty) G.net?.onLocalSkill?.(c, s, t, pos);
  if (!s.noCombat) enterCombat(c);
}

export function updateCasting(c, dt, moved) {
  if (!c.cast) return;
  const k = c.cast;
  if (moved && !k.s.moveOk) { interrupt(c, 'Interrompu'); return; }
  if (hasFlag(c, 'stun')) { interrupt(c); return; }
  if (k.t && k.s.target === 'enemy' && (k.t.dead || !canAttack(c, k.t))) { interrupt(c); return; }
  k.time += dt;
  if (k.channel && k.s.onTick) {
    k.tickT += dt;
    while (k.tickT >= (k.s.tick || 1)) { k.tickT -= k.s.tick || 1; k.s.onTick(c, k.t, k.rank); }
  }
  if (k.t && k.t !== c) c.faceTo(k.t.pos.x, k.t.pos.z);
  if (k.time >= k.dur) {
    c.cast = null;
    if (k.channel) {
      if (k.s.onEnd) k.s.onEnd(c, k.t, k.rank);
      const cost = skillCost(c, k.s);
      c.mp = Math.max(0, c.mp - cost);
      if (k.s.cd) c.cds[k.s.id] = skillCd(c, k.s, k.rank);
    } else {
      if (k.s.target === 'enemy' && k.t && edgeDist(c, k.t) > (k.s.range || MELEE) + 4) {
        if (c === G.player) G.ui?.error('Hors de portée.');
        return;
      }
      execute(c, k.s, k.rank, k.t, k.pos);
    }
    if (c.model) c.model.play(k.s.releaseAnim || 'cast', 0.35);
  }
}

// interrompt la préparation d'une capacité de monstre (soins de boss…)
export function interruptWindup(m, src) {
  if (!m.windup?.interruptible) return false;
  const name = m.castBar?.name || 'Incantation';
  m.windup = null;
  m.castBar = null;
  m.lockT = Math.max(m.lockT || 0, 0.6);
  if (m.model) m.model.play('hit', 0.4);
  G.ui?.floatText(m, 'Interrompu !', 'crit');
  burst(m.pos.x, m.pos.y + (m.model?.height || 2) * 0.8, m.pos.z, { count: 14, color: '#ffd24a', color2: '#ffffff', speed: 4, life: 0.5 });
  if (G.player && dist(G.player, m) < 60) G.ui?.log(`${src?.name || 'Quelqu\'un'} interrompt ${name} (${m.name}).`, 'evt');
  return true;
}

export function interrupt(c, msg) {
  if (!c.cast) return;
  c.cast = null;
  if (c.model) c.model.action = null;
  if (c === G.player && msg) G.ui?.error(msg);
  G.net?.onLocalCastCancel?.(c);
}

// ---------------------------------------------------------------------------
// Utilitaires de puissance pour les compétences
export const rankMul = (r) => 1 + (r - 1) * 0.14;
export const power = (c) => c.stats.power || 10;
export const healPower = (c) => c.stats.healPower || c.stats.power || 10;
export { computeStats, beam, shockRing, burst, after };
