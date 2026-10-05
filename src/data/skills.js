import { isInstancePoint } from './world-space.js';
import { PAINTED } from '../ui/painted.js';
// Compétences des 8 classes. run(c, t, rang, ctx) applique l'effet ; desc(rang, c) décrit les valeurs actuelles.
import {
  dealDamage, heal, addBuff, removeBuff, hasBuff, clearDebuffs, enemiesAround, alliesAround, enemiesInCone, enemiesInLine,
  projectile, groundZone, telegraph, dash, knockback, taunt, rankMul, power, healPower, beam, shockRing, burst, after, MELEE, dist, BUFFS,
} from '../game/combat.js';
import { G } from '../game/state.js';
import { getHeight, canWalk } from '../world/terrain.js';
import { pillar, projectile as fxProjectile } from '../game/fx.js';
import { Pets, spawnTotem } from '../game/pets.js';
import { taunt as tauntMobs, isFriendly, canAttack, interruptWindup } from '../game/combat.js';

const f = (n) => Math.round(n).toLocaleString('fr-FR');
const P = (c, k, r) => power(c) * k * rankMul(r);
const HP = (c, k, r) => healPower(c) * k * rankMul(r);
const chest = (c) => ({ x: c.pos.x, y: c.pos.y + (c.model?.height || 1.8) * 0.6, z: c.pos.z });

export const SKILLS = [];
const S = (o) => SKILLS.push({ max: 5, target: 'enemy', range: MELEE, cast: 0, cd: 0, cost: 0, school: 'phys', anim: 'attack', ...o });

// =============================== GUERRIER ===============================
S({ id: 'g_frappe', cls: 'guerrier', name: 'Frappe', lvl: 1, basic: true, icon: ['sword', '#c8763a'], cost: 0, anim: 'attack', sound: 'swing',
  desc: (r, c) => `Frappe la cible avec votre arme et inflige ${f(P(c, 1.0, r))} dégâts. Génère beaucoup de menace.`,
  run: (c, t, r) => dealDamage(c, t, P(c, 1.0, r), { skill: 'Frappe', threatMul: 1.6 }) });
S({ id: 'g_charge', cls: 'guerrier', name: 'Charge', lvl: 1, icon: ['charge', '#c8763a'], range: 22, cd: 14, cost: 4, anim: 'attack2', sound: 'charge',
  canUse: (c) => !c.rooted, cantMsg: 'Vous êtes entravé.',
  desc: (r, c) => `Fonce sur l'ennemi, inflige ${f(P(c, 0.6, r))} dégâts et l'étourdit ${(1 + r * 0.2).toFixed(1)} s. Portée 22 m.`,
  run: (c, t, r) => {
    const a = Math.atan2(c.pos.x - t.pos.x, c.pos.z - t.pos.z);
    const x = t.pos.x + Math.sin(a) * (t.radius + 1.2), z = t.pos.z + Math.cos(a) * (t.radius + 1.2);
    dash(c, x, z, 34, () => { if (!t.dead) { dealDamage(c, t, P(c, 0.6, r), { skill: 'Charge', threatMul: 2 }); addBuff(t, 'stun', c, { dur: 1 + r * 0.2 }); shockRing(t.pos.x, t.pos.z, 2.5, '#ffd24a'); } }, { anim: 'attack2' });
  } });
S({ id: 'g_cri', cls: 'guerrier', name: 'Cri de guerre', lvl: 2, icon: ['shout', '#ff9a3a'], target: 'self', cd: 16, cost: 8, anim: 'roar', sound: 'shout',
  desc: (r) => `Provoque tous les ennemis à 10 m et augmente de 12 % les dégâts du groupe pendant ${8 + r * 2} s.`,
  run: (c, t, r) => {
    taunt(c, enemiesAround(c, c.pos.x, c.pos.z, 10));
    for (const a of alliesAround(c, c.pos.x, c.pos.z, 15)) addBuff(a, 'battlecry', c, { dur: 8 + r * 2 });
    shockRing(c.pos.x, c.pos.z, 10, '#ff9a3a', 0.6);
  } });
S({ id: 'g_tourbillon', cls: 'guerrier', name: 'Tourbillon', lvl: 4, icon: ['whirl', '#c8763a'], target: 'self', cd: 7, cost: 10, anim: 'spin', animDur: 0.5, sound: 'whirl',
  desc: (r, c) => `Tournoie et inflige ${f(P(c, 0.85, r))} dégâts à tous les ennemis à 5 m.`,
  run: (c, t, r) => {
    for (const e of enemiesAround(c, c.pos.x, c.pos.z, 5)) dealDamage(c, e, P(c, 0.85, r), { skill: 'Tourbillon', threatMul: 1.5 });
    shockRing(c.pos.x, c.pos.z, 5, '#e0e0e0', 0.35);
  } });
S({ id: 'g_entaille', buffs: ['bleed'], cls: 'guerrier', name: 'Entaille', lvl: 6, icon: ['bleed', '#e04040'], cd: 8, cost: 6, anim: 'attack',
  desc: (r, c) => `Inflige ${f(P(c, 0.5, r))} dégâts puis ${f(P(c, 0.18, r) * 10)} dégâts de saignement en 10 s.`,
  run: (c, t, r) => { dealDamage(c, t, P(c, 0.5, r), { skill: 'Entaille' }); addBuff(t, 'bleed', c, { dur: 10, value: P(c, 0.18, r) }); } });
S({ id: 'g_mur', cls: 'guerrier', name: 'Mur de bouclier', lvl: 8, icon: ['shieldwall', '#c9ced6'], target: 'self', cd: 35, cost: 5, anim: 'block', gcd: false, sound: 'shield',
  desc: (r) => `Réduit de 50 % les dégâts subis pendant ${4 + r} s.`,
  run: (c, t, r) => addBuff(c, 'shieldwall', c, { dur: 4 + r }) });
S({ id: 'g_heurt', cls: 'guerrier', name: 'Heurt de bouclier', lvl: 10, icon: ['bash', '#d9a441'], cd: 15, cost: 8, anim: 'attack2',
  desc: (r, c) => `Frappe avec le bouclier : ${f(P(c, 0.7, r))} dégâts, étourdit ${(1.5 + r * 0.2).toFixed(1)} s et interrompt l'incantation.`,
  run: (c, t, r) => { dealDamage(c, t, P(c, 0.7, r), { skill: 'Heurt de bouclier', threatMul: 2 }); addBuff(t, 'stun', c, { dur: 1.5 + r * 0.2 }); } });
S({ id: 'g_brise', cls: 'guerrier', name: 'Brise-armure', lvl: 13, icon: ['sunder', '#c8763a'], cd: 12, cost: 8, anim: 'slam', animDur: 0.55,
  desc: (r, c) => `Inflige ${f(P(c, 1.1, r))} dégâts et réduit l'armure de la cible de 30 % pendant ${8 + r * 2} s.`,
  run: (c, t, r) => { dealDamage(c, t, P(c, 1.1, r), { skill: 'Brise-armure', threatMul: 1.8 }); addBuff(t, 'sunder', c, { dur: 8 + r * 2 }); } });
S({ id: 'g_souffle', cls: 'guerrier', name: 'Second souffle', lvl: 16, icon: ['heal', '#e04040'], target: 'self', cd: 70, cost: 0, anim: 'roar', gcd: false,
  desc: (r) => `Rend instantanément ${18 + r * 3} % de vos points de vie.`,
  run: (c, t, r) => { heal(c, c, c.stats.maxHp * (0.18 + r * 0.03), { noCrit: true, skill: 'Second souffle' }); pillar(c.pos.x, c.pos.y, c.pos.z, '#ff7070', 25, 2); } });
S({ id: 'g_bond', cls: 'guerrier', name: 'Bond fracassant', lvl: 20, icon: ['leap', '#c8763a'], target: 'ground', range: 20, groundDefault: 14, cd: 18, cost: 12, anim: 'leap',
  canUse: (c) => !c.rooted, cantMsg: 'Vous êtes entravé.',
  desc: (r, c) => `Bondit jusqu'à 20 m et inflige ${f(P(c, 1.2, r))} dégâts aux ennemis à 5 m de l'impact, en les ralentissant.`,
  run: (c, t, r, x) => {
    let px = x.pos.x, pz = x.pos.z;
    dash(c, px, pz, 26, () => {
      for (const e of enemiesAround(c, c.pos.x, c.pos.z, 5)) { dealDamage(c, e, P(c, 1.2, r), { skill: 'Bond fracassant', threatMul: 1.5 }); addBuff(e, 'slow', c, { dur: 4 }); }
      shockRing(c.pos.x, c.pos.z, 5, '#c8763a', 0.5);
      burst(c.pos.x, c.pos.y + 0.3, c.pos.z, { count: 24, color: '#8a7a6a', speed: 6, life: 0.6, size: 0.25 });
      if (G.cam && c === G.player) G.cam.shake = 0.35;
    }, { arc: 4, anim: 'leap' });
  } });
S({ id: 'g_rempart', cls: 'guerrier', name: 'Rempart', lvl: 24, icon: ['rampart', '#d9a441'], target: 'self', cd: 45, cost: 10, anim: 'raise', sound: 'shield',
  desc: (r) => `Réduit de 15 % les dégâts subis par le groupe à 15 m pendant ${8 + r * 2} s.`,
  run: (c, t, r) => { for (const a of alliesAround(c, c.pos.x, c.pos.z, 15)) addBuff(a, 'rampart', c, { dur: 8 + r * 2 }); shockRing(c.pos.x, c.pos.z, 15, '#d9a441', 0.6); } });
S({ id: 'g_titan', cls: 'guerrier', name: 'Colère du titan', lvl: 28, icon: ['titan', '#e04040'], target: 'self', cd: 90, cost: 0, anim: 'roar', gcd: false, sound: 'shout',
  desc: (r) => `Pendant ${10 + r} s : +30 % de dégâts et vos coups vous soignent de 15 % des dégâts infligés.`,
  run: (c, t, r) => { addBuff(c, 'titan', c, { dur: 10 + r }); pillar(c.pos.x, c.pos.y, c.pos.z, '#ff4040', 30, 3); } });

// =============================== MAGE ===============================
S({ id: 'm_trait', cls: 'mage', name: 'Trait de feu', lvl: 1, basic: true, icon: ['fire', '#ff9a3a'], range: 28, cast: 1.3, school: 'fire', anim: 'cast', sound: 'fire',
  desc: (r, c) => `Lance un trait de feu qui inflige ${f(P(c, 1.4, r))} dégâts de feu. Incantation 1,3 s.`,
  run: (c, t, r) => projectile(c, t, 'fire', () => dealDamage(c, t, P(c, 1.4, r), { school: 'fire', skill: 'Trait de feu' }), 30) });
S({ id: 'm_nova', cls: 'mage', name: 'Nova de givre', lvl: 1, icon: ['nova', '#8fd8ff'], target: 'self', cd: 15, cost: 10, school: 'frost', anim: 'raise', sound: 'frost',
  desc: (r, c) => `Gèle sur place les ennemis à 8 m pendant ${(2.5 + r * 0.3).toFixed(1)} s et inflige ${f(P(c, 0.45, r))} dégâts de givre.`,
  run: (c, t, r) => {
    for (const e of enemiesAround(c, c.pos.x, c.pos.z, 8)) { dealDamage(c, e, P(c, 0.45, r), { school: 'frost', skill: 'Nova de givre' }); addBuff(e, 'frozen', c, { dur: 2.5 + r * 0.3 }); }
    shockRing(c.pos.x, c.pos.z, 8, '#bfeaff', 0.5);
    burst(c.pos.x, c.pos.y + 0.5, c.pos.z, { count: 30, color: '#dff6ff', color2: '#8fd8ff', speed: 9, up: 0.2, life: 0.5, size: 0.2 });
  } });
S({ id: 'm_bouclier', cls: 'mage', name: 'Bouclier arcanique', lvl: 2, icon: ['ashield', '#d49aff'], target: 'self', cd: 22, cost: 12, school: 'arcane', anim: 'cast', gcd: false, sound: 'shield',
  desc: (r, c) => `Absorbe ${f(c.stats.maxHp * (0.18 + r * 0.04))} dégâts pendant 12 s.`,
  run: (c, t, r) => addBuff(c, 'arcane_shield', c, { dur: 12, value: c.stats.maxHp * (0.18 + r * 0.04) }) });
S({ id: 'm_givre', cls: 'mage', name: 'Éclair de givre', lvl: 4, icon: ['frost', '#8fd8ff'], range: 28, cast: 1.6, cost: 6, school: 'frost', anim: 'cast', sound: 'frost',
  desc: (r, c) => `Inflige ${f(P(c, 1.55, r))} dégâts de givre et ralentit la cible de 35 % pendant 5 s.`,
  run: (c, t, r) => projectile(c, t, 'frost', () => { dealDamage(c, t, P(c, 1.55, r), { school: 'frost', skill: 'Éclair de givre' }); addBuff(t, 'chill', c, { dur: 5 }); }, 26) });
S({ id: 'm_pluie', cls: 'mage', name: 'Pluie de flammes', lvl: 6, icon: ['firerain', '#ff6a2a'], target: 'ground', range: 28, cd: 10, cost: 14, school: 'fire', anim: 'raise', sound: 'fire',
  desc: (r, c) => `Fait pleuvoir le feu sur une zone de 6 m : ${f(P(c, 0.34, r))} dégâts par seconde pendant 6 s.`,
  run: (c, t, r, x) => groundZone(c, x.pos.x, x.pos.z, 6, 6, 1, '#ff7a2a', (z) => {
    for (const e of enemiesAround(c, z.x, z.z, 6)) dealDamage(c, e, P(c, 0.34, r), { school: 'fire', skill: 'Pluie de flammes', dot: true, noCrit: false });
    for (let i = 0; i < 4; i++) burst(z.x + (Math.random() - 0.5) * 10, getHeight(z.x, z.z) + 6, z.z + (Math.random() - 0.5) * 10, { count: 3, color: '#ffb040', color2: '#ff3a0a', speed: 1, vy: -14, gravity: 10, life: 0.5, size: 0.3, up: 0 });
  }) });
S({ id: 'm_transfert', cls: 'mage', name: 'Transfert', lvl: 8, icon: ['blink', '#d49aff'], target: 'self', cd: 15, cost: 8, school: 'arcane', anim: 'cast', gcd: false, sound: 'blink',
  desc: (r) => `Se téléporte de ${12 + r} m vers l'avant et brise les entraves.`,
  run: (c, t, r) => {
    const d = 12 + r;
    burst(c.pos.x, c.pos.y + 1, c.pos.z, { count: 20, color: '#e0b0ff', speed: 4, life: 0.5 });
    let x = c.pos.x, z = c.pos.z;
    for (let i = 0; i < d; i += 0.5) {
      const nx = c.pos.x + Math.sin(c.ry) * i, nz = c.pos.z + Math.cos(c.ry) * i;
      if (!canWalk(x, z, nx, nz)) break;
      x = nx; z = nz;
    }
    c.teleport(x, z);
    clearDebuffs(c, 'root');
    burst(c.pos.x, c.pos.y + 1, c.pos.z, { count: 20, color: '#e0b0ff', speed: 4, life: 0.5 });
  } });
S({ id: 'm_chaine', cls: 'mage', name: 'Éclair en chaîne', lvl: 10, icon: ['chain', '#9fd0ff'], range: 26, cast: 1.0, cd: 8, cost: 12, school: 'lightning', anim: 'cast', sound: 'zap',
  desc: (r, c) => `Un éclair frappe la cible (${f(P(c, 1.1, r))} dégâts) puis rebondit sur ${2 + Math.floor(r / 2)} ennemis proches.`,
  run: (c, t, r) => {
    let prev = chest(c), cur = t, mul = 1;
    const hit = new Set();
    for (let i = 0; i < 3 + Math.floor(r / 2) && cur; i++) {
      hit.add(cur);
      const cp = chest(cur);
      beam(prev, cp, '#cfe8ff', 0.3, 0.8);
      dealDamage(c, cur, P(c, 1.1, r) * mul, { school: 'lightning', skill: 'Éclair en chaîne' });
      prev = cp; mul *= 0.75;
      cur = enemiesAround(c, cur.pos.x, cur.pos.z, 10).find((e) => !hit.has(e));
    }
  } });
S({ id: 'm_meta', cls: 'mage', name: 'Métamorphose', lvl: 13, icon: ['poly', '#ffb0e0'], range: 24, cast: 1.5, cd: 20, cost: 10, school: 'arcane', anim: 'cast', noBoss: true, sound: 'poly',
  desc: (r) => `Transforme la cible en poulet pendant ${5 + r} s. Tout dégât rompt l'effet. Sans effet sur les boss.`,
  run: (c, t, r) => { addBuff(t, 'poly', c, { dur: 5 + r }); burst(t.pos.x, t.pos.y + 1, t.pos.z, { count: 18, color: '#ffb0e0', color2: '#ffffff', speed: 3, life: 0.6 }); } });
S({ id: 'm_meteore', cls: 'mage', name: 'Météore', lvl: 16, icon: ['meteor', '#ff6a2a'], target: 'ground', range: 30, cast: 1.2, cd: 20, cost: 18, school: 'fire', anim: 'raise', sound: 'fire',
  desc: (r, c) => `Invoque un météore qui s'écrase après 1 s et inflige ${f(P(c, 2.6, r))} dégâts de feu à 6 m.`,
  run: (c, t, r, x) => {
    const px = x.pos.x, pz = x.pos.z, gy = getHeight(px, pz);
    telegraph(px, pz, 6, 1.0, () => {
      for (const e of enemiesAround(c, px, pz, 6)) dealDamage(c, e, P(c, 2.6, r), { school: 'fire', skill: 'Météore' });
      shockRing(px, pz, 6, '#ffb040', 0.5);
      burst(px, gy + 0.5, pz, { count: 40, color: '#ffb040', color2: '#ff3a0a', speed: 10, life: 0.8, size: 0.3 });
      if (G.cam && dist(G.player, { pos: { x: px, z: pz } }) < 25) G.cam.shake = 0.3;
    }, { color: '#ff8a2a' });
    projectileFall(px, gy, pz);
  } });
S({ id: 'm_meditation', cls: 'mage', name: 'Méditation', lvl: 20, icon: ['meditate', '#7fb8ff'], target: 'self', channel: 4, tick: 1, cd: 60, cost: 0, school: 'arcane', anim: 'channel',
  desc: (r) => `Canalise 4 s pour récupérer ${30 + r * 5} % de votre mana.`,
  onTick: (c, t, r) => { c.mp = Math.min(c.stats.maxMp, c.mp + c.stats.maxMp * (0.3 + r * 0.05) / 4); burst(c.pos.x, c.pos.y + 1.2, c.pos.z, { count: 6, color: '#7fb8ff', speed: 1, vy: 2, life: 0.8 }); },
  run: () => {} });
S({ id: 'm_lance', cls: 'mage', name: 'Lance de glace', lvl: 24, icon: ['ice', '#dff6ff'], range: 28, cd: 8, cost: 12, school: 'frost', anim: 'cast', sound: 'frost',
  desc: (r, c) => `Inflige ${f(P(c, 1.9, r))} dégâts de givre, doublés si la cible est gelée ou ralentie.`,
  run: (c, t, r) => projectile(c, t, 'ice', () => {
    const bonus = hasBuff(t, 'frozen') || hasBuff(t, 'chill') || hasBuff(t, 'slow') ? 2 : 1;
    dealDamage(c, t, P(c, 1.9, r) * bonus, { school: 'frost', skill: 'Lance de glace', critBonus: bonus > 1 ? 15 : 0 });
  }, 40) });
S({ id: 'm_surcharge', cls: 'mage', name: 'Surcharge arcanique', lvl: 28, icon: ['overload', '#d49aff'], target: 'self', cd: 90, cost: 0, school: 'arcane', anim: 'raise', gcd: false,
  desc: (r) => `Pendant ${10 + r} s : +25 % de dégâts et incantations 30 % plus rapides.`,
  run: (c, t, r) => { addBuff(c, 'overload', c, { dur: 10 + r }); pillar(c.pos.x, c.pos.y, c.pos.z, '#d49aff', 35, 3); } });

// =============================== ARCHER ===============================
S({ id: 'a_tir', cls: 'archer', name: 'Tir rapide', lvl: 1, basic: true, icon: ['arrow', '#6fbf4a'], range: 30, anim: 'shoot', animDur: 0.4, sound: 'bow',
  desc: (r, c) => `Décoche une flèche qui inflige ${f(P(c, 0.95, r))} dégâts.`,
  run: (c, t, r) => projectile(c, t, 'arrow', () => dealDamage(c, t, P(c, 0.95, r), { skill: 'Tir rapide' }), 45) });
S({ id: 'a_vise', cls: 'archer', name: 'Tir visé', lvl: 1, icon: ['aim', '#e0c060'], range: 32, cast: 1.6, cd: 6, cost: 7, anim: 'shoot', sound: 'bow',
  desc: (r, c) => `Prend le temps de viser et inflige ${f(P(c, 2.2, r))} dégâts. Incantation 1,6 s.`,
  run: (c, t, r) => projectile(c, t, 'arrow', () => dealDamage(c, t, P(c, 2.2, r), { skill: 'Tir visé', critBonus: 10 }), 60) });
S({ id: 'a_bond', cls: 'archer', name: 'Bond arrière', lvl: 2, icon: ['disengage', '#6fbf4a'], target: 'self', cd: 12, cost: 5, gcd: false, anim: 'leap', sound: 'whoosh',
  desc: (r) => `Bondit de ${10 + r} m en arrière et se libère des entraves.`,
  run: (c, t, r) => {
    clearDebuffs(c, 'root');
    const d = 10 + r;
    let x = c.pos.x, z = c.pos.z;
    for (let i = 0; i < d; i += 0.5) {
      const nx = c.pos.x - Math.sin(c.ry) * i, nz = c.pos.z - Math.cos(c.ry) * i;
      if (!canWalk(x, z, nx, nz)) break;
      x = nx; z = nz;
    }
    dash(c, x, z, 30, null, { arc: 2.5, anim: 'leap' });
  } });
S({ id: 'a_poison', buffs: ['poison'], cls: 'archer', name: 'Flèche empoisonnée', lvl: 4, icon: ['poison', '#b6e04a'], range: 30, cd: 6, cost: 6, anim: 'shoot', school: 'poison', sound: 'bow',
  desc: (r, c) => `Inflige ${f(P(c, 0.4, r))} dégâts puis ${f(P(c, 0.16, r) * 12)} dégâts de poison en 12 s.`,
  run: (c, t, r) => projectile(c, t, 'poison', () => { dealDamage(c, t, P(c, 0.4, r), { skill: 'Flèche empoisonnée' }); addBuff(t, 'poison', c, { dur: 12, value: P(c, 0.16, r) }); }, 45) });
S({ id: 'a_salve', cls: 'archer', name: 'Salve', lvl: 6, icon: ['volley', '#6fbf4a'], range: 26, cd: 8, cost: 11, anim: 'shoot', sound: 'bow',
  desc: (r, c) => `Tire en éventail sur jusqu'à 5 ennemis devant vous : ${f(P(c, 0.8, r))} dégâts chacun.`,
  run: (c, t, r) => {
    const list = enemiesInCone(c, 26, 1.0, c.ry, 5);
    if (t && !list.includes(t)) list.unshift(t);
    for (const e of list.slice(0, 5)) projectile(c, e, 'arrow', () => dealDamage(c, e, P(c, 0.8, r), { skill: 'Salve' }), 42);
  } });
S({ id: 'a_piege', cls: 'archer', name: 'Piège à mâchoires', lvl: 8, icon: ['trap', '#9a9aa0'], target: 'self', cd: 20, cost: 8, anim: 'throw', sound: 'trap',
  desc: (r, c) => `Pose un piège à vos pieds (60 s). Le premier ennemi qui marche dessus subit ${f(P(c, 0.9, r))} dégâts et reste immobilisé ${3 + r * 0.4} s.`,
  run: (c, t, r) => {
    const px = c.pos.x, pz = c.pos.z;
    let armed = true;
    groundZone(c, px, pz, 2.2, 60, 0.2, '#9a9aa0', (z) => {
      if (!armed) return;
      const e = enemiesAround(c, px, pz, 2.2)[0];
      if (e) {
        armed = false; z.done = true;
        dealDamage(c, e, P(c, 0.9, r), { skill: 'Piège à mâchoires' });
        addBuff(e, 'root', c, { dur: 3 + r * 0.4 });
        burst(px, getHeight(px, pz) + 0.3, pz, { count: 16, color: '#c9ced6', speed: 4, life: 0.4 });
      }
    }, { persist: false });
  } });
S({ id: 'a_paralysant', cls: 'archer', name: 'Tir paralysant', lvl: 10, icon: ['slow', '#8fd8ff'], range: 30, cd: 10, cost: 6, anim: 'shoot', sound: 'bow', interrupt: true,
  desc: (r, c) => `Inflige ${f(P(c, 0.75, r))} dégâts, interrompt l'incantation de la cible et la ralentit de 45 % pendant ${5 + r} s.`,
  run: (c, t, r) => projectile(c, t, 'arrow', () => { dealDamage(c, t, P(c, 0.75, r), { skill: 'Tir paralysant' }); addBuff(t, 'slow', c, { dur: 5 + r }); }, 45) });
S({ id: 'a_faucon', cls: 'archer', name: 'Œil de faucon', lvl: 13, icon: ['hawk', '#e0c060'], target: 'self', cd: 45, cost: 5, anim: 'raise', gcd: false,
  desc: (r) => `Pendant ${10 + r * 2} s : +15 % de chances de critique et +5 m de portée.`,
  run: (c, t, r) => addBuff(c, 'hawkeye', c, { dur: 10 + r * 2 }) });
S({ id: 'a_camo', cls: 'archer', name: 'Camouflage', lvl: 16, icon: ['camo', '#6fbf4a'], target: 'self', cd: 40, cost: 6, anim: 'cast', keepStealth: true, gcd: false, sound: 'stealth',
  canUse: (c) => !G.world.inCombatWithMobs?.(c) || true,
  desc: (r) => `Se fond dans le décor pendant ${8 + r * 2} s : les ennemis vous perdent de vue. Votre prochain tir est un coup critique garanti.`,
  run: (c, t, r) => {
    addBuff(c, 'camo', c, { dur: 8 + r * 2 });
    c.nextCrit = true;
    for (const m of G.world.mobsEngagedWith(c)) { m.threat.delete(c); if (m.target === c) m.target = null; }
    burst(c.pos.x, c.pos.y + 1, c.pos.z, { count: 16, color: '#6fbf4a', speed: 2, life: 0.6 });
  } });
S({ id: 'a_pluie', cls: 'archer', name: 'Pluie de flèches', lvl: 20, icon: ['arrowrain', '#6fbf4a'], target: 'ground', range: 30, cd: 14, cost: 14, anim: 'shoot', sound: 'bow',
  desc: (r, c) => `Arrose une zone de 6 m pendant 5 s : ${f(P(c, 0.42, r))} dégâts par seconde.`,
  run: (c, t, r, x) => groundZone(c, x.pos.x, x.pos.z, 6, 5, 1, '#9acd6a', (z) => {
    for (const e of enemiesAround(c, z.x, z.z, 6)) dealDamage(c, e, P(c, 0.42, r), { skill: 'Pluie de flèches', dot: true });
    for (let i = 0; i < 5; i++) burst(z.x + (Math.random() - 0.5) * 10, getHeight(z.x, z.z) + 7, z.z + (Math.random() - 0.5) * 10, { count: 1, color: '#8a6440', speed: 0.5, vy: -20, gravity: 10, life: 0.4, size: 0.18, up: 0 });
  }) });
S({ id: 'a_perforant', cls: 'archer', name: 'Tir perforant', lvl: 24, icon: ['pierce', '#e0c060'], range: 32, cd: 12, cost: 12, anim: 'shoot', cast: 0.8, sound: 'bow',
  desc: (r, c) => `Une flèche traverse tous les ennemis alignés sur 32 m : ${f(P(c, 1.8, r))} dégâts chacun.`,
  run: (c, t, r) => {
    const dir = Math.atan2(t.pos.x - c.pos.x, t.pos.z - c.pos.z);
    const list = enemiesInLine(c, 32, 1.4, dir);
    const endP = { x: c.pos.x + Math.sin(dir) * 32, y: c.pos.y + 1.3, z: c.pos.z + Math.cos(dir) * 32 };
    projectile(c, endP, 'spear', null, 70);
    for (const e of list) after(dist(c, e) / 70, () => dealDamage(c, e, P(c, 1.8, r), { skill: 'Tir perforant' }));
  } });
S({ id: 'a_deluge', cls: 'archer', name: 'Déluge', lvl: 28, icon: ['deluge', '#6fbf4a'], target: 'self', cd: 90, cost: 0, anim: 'raise', gcd: false,
  desc: (r) => `Pendant ${10 + r} s : +35 % de hâte et vos Tirs rapides décochent une seconde flèche.`,
  run: (c, t, r) => { addBuff(c, 'deluge', c, { dur: 10 + r }); pillar(c.pos.x, c.pos.y, c.pos.z, '#8fe86a', 30, 3); } });
// --- familier du Chasseur (le joueur uniquement : les bots chasseurs ont leur loup)
S({ id: 'a_revivre', cls: 'archer', name: 'Ressusciter le familier', lvl: 1, max: 1, noRank: true, icon: ['heal', '#6fbf4a'], target: 'self', cast: 2.5, cd: 5, cost: 0, anim: 'raise', noCombat: true, sound: 'learn',
  canUse: (c) => c !== G.player || !G.pets?.active || G.pets.active.dead, cantMsg: 'Votre familier est en vie.',
  desc: () => `Ramène votre familier à vos côtés avec 60 % de sa vie, qu'il soit tombé au combat ou renvoyé.`,
  run: (c) => { if (c === G.player) G.pets?.revive(); } });
S({ id: 'a_soinfam', cls: 'archer', name: 'Soins du familier', lvl: 3, max: 1, noRank: true, icon: ['regrowth', '#6fbf4a'], target: 'self', cd: 10, cost: 5, anim: 'cast', school: 'nature', sound: 'heal',
  canUse: (c) => c !== G.player || (G.pets?.active && !G.pets.active.dead), cantMsg: "Vous n'avez pas de familier en vie.",
  desc: () => `Soigne votre familier de 40 % de sa vie en 6 s.`,
  run: (c) => {
    const p = c === G.player ? G.pets?.active : null;
    if (!p || p.dead) return;
    addBuff(p, 'hot', c, { dur: 6, value: (p.stats.maxHp * 0.4) / 6 });
    burst(p.pos.x, p.pos.y + 0.8, p.pos.z, { count: 12, color: '#8fe86a', speed: 2, life: 0.6 });
  } });
S({ id: 'a_apprivoiser', cls: 'archer', name: 'Apprivoisement', lvl: 5, max: 1, noRank: true, icon: ['wolf', '#4a8a3a'], range: 25, cast: 5, cd: 15, cost: 0, anim: 'raise', noCombat: true, sound: 'howl', school: 'nature',
  check: (c, t) => {
    if (c !== G.player) return 'Impossible.';
    if (!t || t.kind !== 'mob' || t.temp) return 'Choisissez une bête.';
    if ((t.def.family || 'bête') !== 'bête') return 'Seules les bêtes peuvent être apprivoisées.';
    if (t.boss || t.worldBoss || t.def.raidBoss || t.def.dungeonBoss) return 'Cette créature est bien trop puissante.';
    if (t.level > c.level) return 'Cette bête est de trop haut niveau.';
    if ((G.player.data.pets || []).length >= 40) return 'Ménagerie pleine (40).';
    return null;
  },
  desc: () => `Apprivoise une bête de votre niveau ou moins (5 s) : elle rejoint votre ménagerie et devient votre familier actif. Les élites donnent des familiers rares.`,
  run: (c, t) => { if (c === G.player && t && !t.dead) G.pets?.tame(t); } });

// =============================== DRUIDE ===============================
S({ id: 'd_epine', cls: 'druide', name: "Dard d'épines", lvl: 1, basic: true, icon: ['thorn', '#8fe86a'], range: 28, cast: 1.1, school: 'nature', anim: 'cast', sound: 'nature',
  desc: (r, c) => `Projette des épines qui infligent ${f(P(c, 1.3, r))} dégâts de nature. Incantation 1,1 s.`,
  run: (c, t, r) => projectile(c, t, 'thorn', () => dealDamage(c, t, P(c, 1.3, r), { school: 'nature', skill: "Dard d'épines" }), 30) });
S({ id: 'd_soin', cls: 'druide', name: 'Soin vital', lvl: 1, icon: ['heal', '#8fe86a'], target: 'ally', range: 30, cast: 1.6, cost: 9, school: 'nature', anim: 'cast', sound: 'heal',
  desc: (r, c) => `Rend ${f(HP(c, 2.3, r))} points de vie à un allié. Incantation 1,6 s.`,
  run: (c, t, r) => { heal(c, t, HP(c, 2.3, r), { skill: 'Soin vital' }); pillar(t.pos.x, t.pos.y, t.pos.z, '#8fe86a', 18, 2); } });
S({ id: 'd_regen', buffs: ['hot'], cls: 'druide', name: 'Régénération', lvl: 2, icon: ['regrowth', '#8fe86a'], target: 'ally', range: 30, cost: 7, school: 'nature', anim: 'cast', sound: 'heal',
  desc: (r, c) => `Rend ${f(HP(c, 0.24, r) * 12)} points de vie en 12 s.`,
  run: (c, t, r) => { addBuff(t, 'hot', c, { dur: 12, value: HP(c, 0.24, r) }); burst(t.pos.x, t.pos.y + 1, t.pos.z, { count: 10, color: '#8fe86a', speed: 1.5, vy: 2, life: 0.8 }); } });
S({ id: 'd_racines', buffs: ['roots_dot'], cls: 'druide', name: 'Racines', lvl: 4, icon: ['root', '#8fe86a'], range: 26, cd: 15, cost: 8, school: 'nature', anim: 'cast', sound: 'nature',
  desc: (r, c) => `Immobilise la cible pendant ${4 + r * 0.5} s et lui inflige ${f(P(c, 0.12, r) * 4)} dégâts.`,
  run: (c, t, r) => { addBuff(t, 'roots_dot', c, { dur: 4 + r * 0.5, value: P(c, 0.12, r) }); burst(t.pos.x, t.pos.y + 0.2, t.pos.z, { count: 14, color: '#5a8a3a', speed: 2, vy: 3, life: 0.6, size: 0.2 }); } });
S({ id: 'd_essaim', buffs: ['swarm'], cls: 'druide', name: 'Essaim', lvl: 6, icon: ['swarm', '#c8e060'], range: 28, cost: 7, school: 'nature', anim: 'cast', sound: 'nature',
  desc: (r, c) => `Un essaim d'insectes inflige ${f(P(c, 0.22, r) * 12)} dégâts en 12 s.`,
  run: (c, t, r) => addBuff(t, 'swarm', c, { dur: 12, value: P(c, 0.22, r) }) });
S({ id: 'd_meute', cls: 'druide', name: 'Esprit de la meute', lvl: 8, icon: ['pack', '#3fbf9f'], target: 'self', cd: 45, cost: 10, school: 'nature', anim: 'raise', sound: 'shout',
  desc: (r) => `Le groupe à 15 m gagne +20 % de vitesse et +10 % de hâte pendant ${10 + r * 2} s.`,
  run: (c, t, r) => { for (const a of alliesAround(c, c.pos.x, c.pos.z, 15)) addBuff(a, 'packspirit', c, { dur: 10 + r * 2 }); shockRing(c.pos.x, c.pos.z, 15, '#3fbf9f', 0.6); } });
S({ id: 'd_cercle', cls: 'druide', name: 'Cercle de soins', lvl: 10, icon: ['circle', '#8fe86a'], target: 'self', cd: 8, cost: 16, school: 'nature', anim: 'raise', sound: 'heal',
  desc: (r, c) => `Soigne tous les alliés à 12 m de ${f(HP(c, 1.2, r))} points de vie.`,
  run: (c, t, r) => { for (const a of alliesAround(c, c.pos.x, c.pos.z, 12)) { heal(c, a, HP(c, 1.2, r), { skill: 'Cercle de soins' }); pillar(a.pos.x, a.pos.y, a.pos.z, '#b0ff90', 8, 1.5); } shockRing(c.pos.x, c.pos.z, 12, '#8fe86a', 0.5); } });
S({ id: 'd_ecorce', cls: 'druide', name: 'Écorce', lvl: 13, icon: ['bark', '#8a6440'], target: 'ally', range: 30, cd: 30, cost: 6, school: 'nature', anim: 'cast', gcd: false, sound: 'shield',
  desc: (r) => `Réduit de 30 % les dégâts subis par un allié pendant ${6 + r} s.`,
  run: (c, t, r) => addBuff(t, 'bark', c, { dur: 6 + r }) });
S({ id: 'd_orage', cls: 'druide', name: "Courroux de l'orage", lvl: 16, icon: ['storm', '#9fd0ff'], target: 'ground', range: 28, cast: 1.4, cd: 12, cost: 14, school: 'lightning', anim: 'raise', sound: 'zap',
  desc: (r, c) => `La foudre frappe une zone de 5 m et inflige ${f(P(c, 2.2, r))} dégâts.`,
  run: (c, t, r, x) => {
    const px = x.pos.x, pz = x.pos.z, gy = getHeight(px, pz);
    beam({ x: px, y: gy + 25, z: pz }, { x: px, y: gy, z: pz }, '#e0f0ff', 0.35, 2.5);
    for (const e of enemiesAround(c, px, pz, 5)) dealDamage(c, e, P(c, 2.2, r), { school: 'lightning', skill: "Courroux de l'orage" });
    shockRing(px, pz, 5, '#bfe0ff', 0.4);
    if (G.sky) G.sky.flash = 0.25;
  } });
S({ id: 'd_renouveau', cls: 'druide', name: 'Renouveau', lvl: 20, icon: ['renew', '#b0ff90'], target: 'ally', range: 30, cd: 30, cost: 18, school: 'nature', anim: 'raise', gcd: false, sound: 'heal',
  desc: (r, c) => `Soin instantané de ${f(HP(c, 4, r))} points de vie sur un allié.`,
  run: (c, t, r) => { heal(c, t, HP(c, 4, r), { skill: 'Renouveau' }); pillar(t.pos.x, t.pos.y, t.pos.z, '#d0ffb0', 30, 3); } });
S({ id: 'd_floraison', cls: 'druide', name: 'Floraison', lvl: 24, icon: ['bloom', '#ffb0e0'], target: 'self', cd: 25, cost: 18, school: 'nature', anim: 'raise', sound: 'heal',
  desc: (r, c) => `Fait éclore un jardin de 8 m pendant 8 s : les alliés à l'intérieur récupèrent ${f(HP(c, 0.5, r))} PV par seconde.`,
  run: (c, t, r) => groundZone(c, c.pos.x, c.pos.z, 8, 8, 1, '#ffb0e0', (z) => {
    for (const a of alliesAround(c, z.x, z.z, 8)) heal(c, a, HP(c, 0.5, r), { tick: true, skill: 'Floraison' });
  }, { particles: { count: 1, color: '#ffb0e0', color2: '#8fe86a', speed: 0.5, vy: 2, life: 1, up: 0 } }) });
S({ id: 'd_avatar', buffs: ['avatar_hot'], cls: 'druide', name: 'Avatar sylvestre', lvl: 28, icon: ['avatar', '#3fbf9f'], target: 'self', cd: 120, cost: 0, school: 'nature', anim: 'raise', gcd: false,
  desc: (r, c) => `Pendant ${12 + r} s : +30 % de soins, +30 % d'armure, et vous régénérez ${f(HP(c, 0.4, r))} PV par seconde.`,
  run: (c, t, r) => { addBuff(c, 'avatar', c, { dur: 12 + r }); addBuff(c, 'avatar_hot', c, { dur: 12 + r, value: HP(c, 0.4, r) }); pillar(c.pos.x, c.pos.y, c.pos.z, '#3fbf9f', 40, 3); } });

// =============================== TEMPLIER ===============================
S({ id: 't_coup', cls: 'templier', name: "Coup d'aube", lvl: 1, basic: true, icon: ['dawn', '#f0c850'], school: 'holy', anim: 'attack', sound: 'swing',
  desc: (r, c) => `Frappe la cible d'une arme bénie : ${f(P(c, 1.08, r))} dégâts sacrés. Génère beaucoup de menace.`,
  run: (c, t, r) => { dealDamage(c, t, P(c, 1.08, r), { school: 'holy', skill: "Coup d'aube", threatMul: 1.6 }); burst(t.pos.x, t.pos.y + 1.1, t.pos.z, { count: 5, color: '#fff0a0', speed: 2, life: 0.3 }); } });
S({ id: 't_egide', cls: 'templier', name: 'Égide radieuse', lvl: 1, icon: ['aegis', '#f0c850'], target: 'ally', range: 30, cd: 8, cost: 8, school: 'holy', anim: 'cast', sound: 'shield',
  desc: (r, c) => `Entoure un allié (ou vous-même) d'une égide qui absorbe ${f(HP(c, 2.2, r))} dégâts pendant 10 s.`,
  run: (c, t, r) => { addBuff(t, 'aegis', c, { dur: 10, value: HP(c, 2.2, r) }); pillar(t.pos.x, t.pos.y, t.pos.z, '#fff0a0', 16, 2); } });
S({ id: 't_defi', cls: 'templier', name: 'Défi solennel', lvl: 2, icon: ['challenge', '#f0c850'], range: 22, cd: 8, cost: 3, school: 'holy', anim: 'raise', gcd: false, sound: 'shout', interrupt: true,
  desc: (r, c) => `Force l'ennemi à vous attaquer pendant 3 s, interrompt son incantation et lui inflige ${f(P(c, 0.4, r))} dégâts sacrés. Portée 22 m.`,
  run: (c, t, r) => { taunt(c, [t]); dealDamage(c, t, P(c, 0.4, r), { school: 'holy', skill: 'Défi solennel', threatMul: 3 }); beam(chest(c), chest(t), '#fff0a0', 0.3, 0.2); } });
S({ id: 't_lumiere', cls: 'templier', name: 'Lumière réparatrice', lvl: 4, icon: ['lightheal', '#f0c850'], target: 'ally', range: 30, cast: 1.5, cost: 9, school: 'holy', anim: 'cast', sound: 'heal',
  desc: (r, c) => `Rend ${f(HP(c, 2.0, r))} points de vie à un allié. Incantation 1,5 s.`,
  run: (c, t, r) => { heal(c, t, HP(c, 2.0, r), { skill: 'Lumière réparatrice' }); pillar(t.pos.x, t.pos.y, t.pos.z, '#fff0a0', 20, 2.5); } });
S({ id: 't_jugement', cls: 'templier', name: "Jugement d'airain", lvl: 6, icon: ['judge', '#f0c850'], range: 20, cd: 8, cost: 6, school: 'holy', anim: 'raise', sound: 'spellhit',
  desc: (r, c) => `Un marteau de lumière frappe la cible à distance : ${f(P(c, 1.1, r))} dégâts sacrés, et ses dégâts sont réduits de 20 % pendant 8 s.`,
  run: (c, t, r) => projectile(c, t, 'holy', () => { dealDamage(c, t, P(c, 1.1, r), { school: 'holy', skill: "Jugement d'airain", threatMul: 1.5 }); addBuff(t, 'weakness', c, { dur: 8 }); }, 34) });
S({ id: 't_sceau', cls: 'templier', name: 'Sceau de vaillance', lvl: 8, icon: ['seal', '#f0c850'], target: 'self', cd: 40, cost: 8, school: 'holy', anim: 'raise', sound: 'shout',
  desc: (r) => `Le groupe à 15 m subit 10 % de dégâts en moins et en inflige 5 % de plus pendant ${12 + r * 2} s.`,
  run: (c, t, r) => { for (const a of alliesAround(c, c.pos.x, c.pos.z, 15)) addBuff(a, 'valor', c, { dur: 12 + r * 2 }); shockRing(c.pos.x, c.pos.z, 15, '#f0c850', 0.6); } });
S({ id: 't_sol', cls: 'templier', name: 'Sol sanctifié', lvl: 10, icon: ['hallow', '#f0c850'], target: 'self', cd: 12, cost: 12, school: 'holy', anim: 'slam', sound: 'heal',
  desc: (r, c) => `Consacre le sol à vos pieds (7 m, 8 s) : ${f(P(c, 0.28, r))} dégâts sacrés par seconde aux ennemis, avec une forte menace.`,
  run: (c, t, r) => groundZone(c, c.pos.x, c.pos.z, 7, 8, 1, '#ffe68a', (z) => {
    for (const e of enemiesAround(c, z.x, z.z, 7)) dealDamage(c, e, P(c, 0.28, r), { school: 'holy', skill: 'Sol sanctifié', dot: true, threatMul: 2.5 });
  }, { particles: { count: 1, color: '#fff0a0', speed: 0.4, vy: 2, life: 0.8, up: 0 } }) });
S({ id: 't_voile', cls: 'templier', name: "Voile d'intercession", lvl: 13, icon: ['veil', '#fff4c8'], target: 'ally', range: 30, cd: 45, cost: 6, school: 'holy', anim: 'cast', gcd: false, sound: 'shield',
  desc: (r) => `Un allié subit 50 % de dégâts en moins pendant ${(5 + r * 0.5).toFixed(1).replace('.', ',')} s.`,
  run: (c, t, r) => { addBuff(t, 'intercession', c, { dur: 5 + r * 0.5 }); pillar(t.pos.x, t.pos.y, t.pos.z, '#ffffff', 22, 3); } });
S({ id: 't_onde', cls: 'templier', name: 'Onde de ferveur', lvl: 16, icon: ['fervor', '#f0c850'], target: 'self', cd: 14, cost: 10, school: 'holy', anim: 'roar', sound: 'shout',
  desc: (r, c) => `Libère une onde de lumière : ${f(P(c, 0.9, r))} dégâts sacrés aux ennemis à 8 m, qui vous prennent pour cible.`,
  run: (c, t, r) => { const l = enemiesAround(c, c.pos.x, c.pos.z, 8); tauntMobs(c, l); for (const e of l) dealDamage(c, e, P(c, 0.9, r), { school: 'holy', skill: 'Onde de ferveur', threatMul: 2 }); shockRing(c.pos.x, c.pos.z, 8, '#fff0a0', 0.5); } });
S({ id: 't_rempart', buffs: ['faith_regen'], cls: 'templier', name: 'Rempart de foi', lvl: 20, icon: ['faithwall', '#f0c850'], target: 'self', cd: 60, cost: 0, school: 'holy', anim: 'block', gcd: false, sound: 'shield',
  desc: (r) => `Pendant ${6 + r} s : −40 % de dégâts subis et vous régénérez 3 % de votre vie chaque seconde.`,
  run: (c, t, r) => { addBuff(c, 'faith_wall', c, { dur: 6 + r }); addBuff(c, 'faith_regen', c, { dur: 6 + r, value: c.stats.maxHp * 0.03 }); pillar(c.pos.x, c.pos.y, c.pos.z, '#f0c850', 30, 3); } });
S({ id: 't_verdict', cls: 'templier', name: 'Verdict', lvl: 24, icon: ['verdict', '#f0c850'], cd: 10, cost: 10, school: 'holy', anim: 'slam', animDur: 0.55, sound: 'crit',
  desc: (r, c) => `Frappe dévastatrice : ${f(P(c, 2.5, r))} dégâts sacrés. Vous récupérez 30 % des dégâts infligés.`,
  run: (c, t, r) => { const a = dealDamage(c, t, P(c, 2.5, r), { school: 'holy', skill: 'Verdict', threatMul: 1.8 }); if (a > 0) heal(c, c, a * 0.3, { noCrit: true }); shockRing(t.pos.x, t.pos.z, 2.5, '#fff0a0', 0.4); } });
S({ id: 't_ascension', cls: 'templier', name: "Ascension d'airain", lvl: 28, icon: ['ascend', '#f0c850'], target: 'self', cd: 120, cost: 0, school: 'holy', anim: 'raise', gcd: false, sound: 'shout',
  desc: (r) => `Pendant ${12 + r} s : +30 % de dégâts et +30 % de soins. Une aura dorée vous enveloppe.`,
  run: (c, t, r) => { addBuff(c, 'ascension', c, { dur: 12 + r }); pillar(c.pos.x, c.pos.y, c.pos.z, '#ffe68a', 45, 4); } });

// =============================== ASSASSIN ===============================
S({ id: 'as_lacer', cls: 'assassin', name: 'Lacération', lvl: 1, basic: true, icon: ['dagger2', '#e05a78'], anim: 'attack', sound: 'swing',
  desc: (r, c) => `Coup de lame rapide : ${f(P(c, 1.0, r))} dégâts. Pendant la Danse des lames, touche aussi un ennemi proche.`,
  run: (c, t, r) => {
    dealDamage(c, t, P(c, 1.0, r), { skill: 'Lacération' });
    if (hasBuff(c, 'bladedance')) { const o = enemiesAround(c, t.pos.x, t.pos.z, 5).find((e) => e !== t); if (o) dealDamage(c, o, P(c, 0.8, r), { skill: 'Danse des lames' }); }
  } });
S({ id: 'as_poison', buffs: ['deadly_poison'], cls: 'assassin', name: 'Lames enduites', lvl: 1, icon: ['envenom', '#9ae040'], cd: 4, cost: 5, school: 'poison', anim: 'attack2', sound: 'swing',
  desc: (r, c) => `Inflige ${f(P(c, 0.35, r))} dégâts et empoisonne : ${f(P(c, 0.12, r) * 12)} dégâts de poison en 12 s (cumulable 5 fois).`,
  run: (c, t, r) => { dealDamage(c, t, P(c, 0.35, r), { skill: 'Lames enduites' }); addBuff(t, 'deadly_poison', c, { dur: 12, value: P(c, 0.12, r) }); } });
S({ id: 'as_voile', cls: 'assassin', name: "Voile d'ombre", lvl: 2, icon: ['shadowveil', '#e05a78'], target: 'self', cd: 25, cost: 6, anim: 'cast', gcd: false, keepStealth: true, sound: 'stealth',
  desc: (r) => `Disparaît dans les ombres pendant 10 s : les ennemis vous perdent. Votre prochaine attaque est critique et inflige ${40 + r * 10} % de dégâts en plus.`,
  run: (c, t, r) => {
    addBuff(c, 'shadowveil', c, { dur: 10 });
    c.nextCrit = true; c.ambush = 0.4 + r * 0.1;
    for (const m of G.world.mobsEngagedWith(c)) { m.threat.delete(c); if (m.target === c) m.target = null; }
    burst(c.pos.x, c.pos.y + 1, c.pos.z, { count: 18, color: '#3a2a3a', color2: '#e05a78', speed: 2, life: 0.6 });
  } });
S({ id: 'as_pas', cls: 'assassin', name: "Pas de l'ombre", lvl: 4, icon: ['shadowstep', '#e05a78'], range: 22, cd: 12, cost: 5, anim: 'cast', gcd: false, keepStealth: true, sound: 'blink',
  canUse: (c) => !c.rooted, cantMsg: 'Vous êtes entravé.',
  desc: () => `Réapparaît instantanément dans le dos de la cible (22 m).`,
  run: (c, t) => {
    burst(c.pos.x, c.pos.y + 1, c.pos.z, { count: 14, color: '#2a1a2a', color2: '#e05a78', speed: 3, life: 0.4 });
    const d = (t.radius || 0.5) + 1.1;
    let x = t.pos.x - Math.sin(t.ry) * d, z = t.pos.z - Math.cos(t.ry) * d;
    if (!canWalk(t.pos.x, t.pos.z, x, z)) { x = t.pos.x + Math.cos(t.ry) * d; z = t.pos.z - Math.sin(t.ry) * d; }
    if (canWalk(t.pos.x, t.pos.z, x, z)) c.teleport(x, z);
    c.faceTo(t.pos.x, t.pos.z);
    burst(c.pos.x, c.pos.y + 1, c.pos.z, { count: 14, color: '#2a1a2a', color2: '#e05a78', speed: 3, life: 0.4 });
  } });
S({ id: 'as_eventrer', cls: 'assassin', name: 'Éventration', lvl: 6, icon: ['gut', '#e05a78'], cd: 6, cost: 8, anim: 'attack', sound: 'crit',
  desc: (r, c) => `Inflige ${f(P(c, 1.5, r))} dégâts, 50 % de plus si la cible est empoisonnée ou saigne.`,
  run: (c, t, r) => { const k = hasBuff(t, 'deadly_poison') || hasBuff(t, 'poison') || hasBuff(t, 'bleed') ? 1.5 : 1; dealDamage(c, t, P(c, 1.5, r) * k, { skill: 'Éventration' }); } });
S({ id: 'as_poudre', cls: 'assassin', name: 'Poudre aveuglante', lvl: 8, icon: ['blind', '#d8d0c0'], range: 6, cd: 20, cost: 6, anim: 'throw', sound: 'poly',
  desc: (r) => `Aveugle la cible : étourdie ${(2 + r * 0.3).toFixed(1).replace('.', ',')} s. Les boss y résistent, mais leur incantation est interrompue.`,
  run: (c, t, r) => { addBuff(t, 'stun', c, { dur: 2 + r * 0.3 }); burst(t.pos.x, t.pos.y + 1.4, t.pos.z, { count: 18, color: '#e8e0d0', speed: 2, life: 0.8 }); } });
S({ id: 'as_eventail', cls: 'assassin', name: 'Éventail de lames', lvl: 10, icon: ['fan', '#e05a78'], target: 'self', cd: 8, cost: 10, anim: 'spin', animDur: 0.5, sound: 'whirl',
  desc: (r, c) => `Lance une volée de dagues tout autour : ${f(P(c, 0.75, r))} dégâts aux ennemis à 8 m.`,
  run: (c, t, r) => { for (const e of enemiesAround(c, c.pos.x, c.pos.z, 8)) { projectile(c, e, 'dagger', () => dealDamage(c, e, P(c, 0.75, r), { skill: 'Éventail de lames' }), 40); } shockRing(c.pos.x, c.pos.z, 8, '#e05a78', 0.3); } });
S({ id: 'as_esquive', cls: 'assassin', name: 'Esquive fluide', lvl: 13, icon: ['evasion', '#e05a78'], target: 'self', cd: 45, cost: 0, anim: 'leap', gcd: false, sound: 'whoosh',
  desc: (r) => `+50 % de chances d'esquiver les attaques physiques pendant ${6 + r} s.`,
  run: (c, t, r) => addBuff(c, 'evasion', c, { dur: 6 + r }) });
S({ id: 'as_marque', cls: 'assassin', name: 'Marque du trépas', lvl: 16, icon: ['mark', '#e05a78'], range: 25, cd: 20, cost: 5, anim: 'cast', gcd: false, sound: 'spellhit',
  desc: () => `Marque la cible : elle subit 15 % de dégâts en plus de toutes les sources pendant 12 s.`,
  run: (c, t) => { addBuff(t, 'death_mark', c, { dur: 12 }); burst(t.pos.x, t.pos.y + (t.model?.height || 2) + 0.3, t.pos.z, { count: 12, color: '#ff4060', speed: 1.5, life: 0.8 }); } });
S({ id: 'as_danse', cls: 'assassin', name: 'Danse des lames', lvl: 20, icon: ['bladedance', '#e05a78'], target: 'self', cd: 60, cost: 0, anim: 'spin', gcd: false, sound: 'whirl',
  desc: (r) => `Pendant ${8 + r} s : +30 % de hâte et vos Lacérations touchent un second ennemi.`,
  run: (c, t, r) => { addBuff(c, 'bladedance', c, { dur: 8 + r }); pillar(c.pos.x, c.pos.y, c.pos.z, '#e05a78', 24, 2.5); } });
S({ id: 'as_execution', cls: 'assassin', name: 'Exécution', lvl: 24, icon: ['execute', '#e05a78'], cd: 8, cost: 10, anim: 'slam', animDur: 0.5, sound: 'crit',
  desc: (r, c) => `Inflige ${f(P(c, 1.2, r))} dégâts, triplés si la cible a moins de 35 % de vie.`,
  run: (c, t, r) => { const low = t.hp / (t.stats.maxHp || 1) < 0.35; dealDamage(c, t, P(c, 1.2, r) * (low ? 3 : 1), { skill: 'Exécution', critBonus: low ? 20 : 0 }); } });
S({ id: 'as_frenesie', cls: 'assassin', name: 'Frénésie mortelle', lvl: 28, icon: ['frenzy', '#e05a78'], target: 'self', cd: 120, cost: 0, anim: 'roar', gcd: false, sound: 'shout',
  desc: (r) => `Pendant ${12 + r} s : +30 % de chances de critique et +20 % de dégâts.`,
  run: (c, t, r) => { addBuff(c, 'murder', c, { dur: 12 + r }); pillar(c.pos.x, c.pos.y, c.pos.z, '#ff4060', 36, 3); } });

// =============================== NÉCROMANCIEN ===============================
S({ id: 'n_dard', cls: 'necro', name: 'Dard nécrotique', lvl: 1, basic: true, icon: ['necrobolt', '#a8a4d8'], range: 28, cast: 1.2, school: 'shadow', anim: 'cast', sound: 'spellhit',
  desc: (r, c) => `Projette une esquille d'énergie morte : ${f(P(c, 1.35, r))} dégâts d'ombre. Incantation 1,2 s.`,
  run: (c, t, r) => projectile(c, t, 'shadow', () => dealDamage(c, t, P(c, 1.35, r), { school: 'shadow', skill: 'Dard nécrotique' }), 30) });
S({ id: 'n_squelette', cls: 'necro', name: 'Relever un squelette', lvl: 1, icon: ['skeleton', '#a8a4d8'], target: 'self', cast: 1.5, cd: 6, cost: 10, school: 'shadow', anim: 'raise', sound: 'spellhit',
  desc: () => `Relève un squelette serviteur qui combat pour vous pendant 90 s (2 au maximum).`,
  run: (c) => {
    const cur = Pets.minionsOf(c, 'squelette_serviteur');
    if (cur.length >= 2) Pets.expire(cur.sort((a, b) => a.lifeT - b.lifeT)[0]);
    Pets.summonMinion(c, 'squelette_serviteur', { dur: 90, hp: 0.42, dmg: 0.4 });
  } });
S({ id: 'n_fletrir', buffs: ['blight'], cls: 'necro', name: 'Flétrissure', lvl: 2, icon: ['blight', '#a8a4d8'], range: 28, cost: 7, school: 'shadow', anim: 'cast', sound: 'spellhit',
  desc: (r, c) => `Ronge la cible : ${f(P(c, 0.2, r) * 14)} dégâts d'ombre en 14 s.`,
  run: (c, t, r) => { addBuff(t, 'blight', c, { dur: 14, value: P(c, 0.2, r) }); burst(t.pos.x, t.pos.y + 1, t.pos.z, { count: 10, color: '#6a5a8a', speed: 1.5, life: 0.6 }); } });
S({ id: 'n_siphon', cls: 'necro', name: 'Siphon vital', lvl: 4, icon: ['siphon', '#a8a4d8'], range: 24, channel: 3, tick: 1, cd: 10, cost: 10, school: 'shadow', anim: 'channel', sound: 'spellhit',
  desc: (r, c) => `Canalise 3 s : chaque seconde, ${f(P(c, 0.55, r))} dégâts d'ombre et vous récupérez 60 % des dégâts.`,
  onTick: (c, t, r) => { if (!t || t.dead) return; const a = dealDamage(c, t, P(c, 0.55, r), { school: 'shadow', skill: 'Siphon vital' }); if (a > 0) heal(c, c, a * 0.6, { tick: true }); beam(chest(t), chest(c), '#b58cff', 0.3, 0.4); },
  run: () => {} });
S({ id: 'n_hurlement', cls: 'necro', name: "Hurlement d'outre-tombe", lvl: 6, icon: ['wail', '#a8a4d8'], target: 'self', cd: 25, cost: 10, school: 'shadow', anim: 'roar', sound: 'howl',
  desc: (r, c) => `Terrifie les ennemis à 7 m : étourdis ${(1.5 + r * 0.2).toFixed(1).replace('.', ',')} s et ${f(P(c, 0.3, r))} dégâts d'ombre.`,
  run: (c, t, r) => { for (const e of enemiesAround(c, c.pos.x, c.pos.z, 7)) { dealDamage(c, e, P(c, 0.3, r), { school: 'shadow', skill: "Hurlement d'outre-tombe" }); addBuff(e, 'stun', c, { dur: 1.5 + r * 0.2 }); } shockRing(c.pos.x, c.pos.z, 7, '#a8a4d8', 0.5); } });
S({ id: 'n_os', cls: 'necro', name: "Armure d'os", lvl: 8, icon: ['bonearmor', '#e6dfcd'], target: 'self', cd: 30, cost: 8, school: 'shadow', anim: 'cast', gcd: false, sound: 'shield',
  desc: (r, c) => `Des ossements vous entourent et absorbent ${f(c.stats.maxHp * (0.2 + r * 0.04))} dégâts pendant 15 s.`,
  run: (c, t, r) => { addBuff(c, 'bone_armor', c, { dur: 15, value: c.stats.maxHp * (0.2 + r * 0.04) }); burst(c.pos.x, c.pos.y + 1, c.pos.z, { count: 16, color: '#e6dfcd', speed: 2.5, life: 0.5 }); } });
S({ id: 'n_deflagration', cls: 'necro', name: 'Déflagration nécrotique', lvl: 10, icon: ['necroblast', '#a8a4d8'], target: 'ground', range: 28, cd: 10, cost: 14, school: 'shadow', anim: 'raise', sound: 'boom',
  desc: (r, c) => `Fait éclater la mort sur une zone de 5 m : ${f(P(c, 1.4, r))} dégâts d'ombre après 0,6 s.`,
  run: (c, t, r, x) => {
    const px = x.pos.x, pz = x.pos.z;
    telegraph(px, pz, 5, 0.6, () => {
      for (const e of enemiesAround(c, px, pz, 5)) dealDamage(c, e, P(c, 1.4, r), { school: 'shadow', skill: 'Déflagration nécrotique' });
      shockRing(px, pz, 5, '#b58cff', 0.4);
      burst(px, getHeight(px, pz) + 0.5, pz, { count: 30, color: '#6a4a9a', color2: '#e0d0ff', speed: 7, life: 0.6, size: 0.24 });
    });
  } });
S({ id: 'n_golem', cls: 'necro', name: 'Golem de chair', lvl: 13, icon: ['golem', '#a8a4d8'], target: 'self', cast: 2, cd: 60, cost: 16, school: 'shadow', anim: 'raise', sound: 'boom',
  desc: () => `Assemble un golem de chair robuste qui combat pour vous pendant 45 s.`,
  run: (c) => { for (const g of Pets.minionsOf(c, 'golem_chair')) Pets.expire(g); Pets.summonMinion(c, 'golem_chair', { dur: 45, hp: 0.9, dmg: 0.65 }); } });
S({ id: 'n_malediction', cls: 'necro', name: "Malédiction d'affliction", lvl: 16, icon: ['curse', '#a8a4d8'], range: 28, cd: 15, cost: 8, school: 'shadow', anim: 'cast', gcd: false, sound: 'spellhit',
  desc: () => `La cible inflige 20 % de dégâts en moins et en subit 10 % de plus pendant 12 s.`,
  run: (c, t) => { addBuff(t, 'affliction', c, { dur: 12 }); burst(t.pos.x, t.pos.y + 1.2, t.pos.z, { count: 14, color: '#6a4a9a', speed: 1.5, life: 0.8 }); } });
S({ id: 'n_legion', cls: 'necro', name: 'Légion des morts', lvl: 20, icon: ['legion', '#a8a4d8'], target: 'self', cd: 90, cost: 20, school: 'shadow', anim: 'raise', sound: 'howl',
  desc: () => `Quatre squelettes surgissent du sol et combattent pendant 18 s.`,
  run: (c) => { for (let i = 0; i < 4; i++) Pets.summonMinion(c, 'squelette_serviteur', { dur: 18, hp: 0.3, dmg: 0.35 }); } });
S({ id: 'n_faux', cls: 'necro', name: 'Faux spectrale', lvl: 24, icon: ['reap', '#a8a4d8'], target: 'self', cd: 10, cost: 14, school: 'shadow', anim: 'spin', animDur: 0.5, sound: 'whirl',
  desc: (r, c) => `Fauche devant vous (10 m) : ${f(P(c, 2.0, r))} dégâts d'ombre à chaque ennemi touché.`,
  run: (c, t, r) => {
    if (t && t !== c) c.faceTo(t.pos.x, t.pos.z);
    const tg = G.world.nearestEnemy(c, 10, true); if (tg) c.faceTo(tg.pos.x, tg.pos.z);
    for (const e of enemiesInCone(c, 10, 1.7, c.ry)) dealDamage(c, e, P(c, 2.0, r), { school: 'shadow', skill: 'Faux spectrale' });
    for (let i = 0; i < 18; i++) { const a = c.ry + (Math.random() - 0.5) * 1.7, d = 2 + Math.random() * 8; burst(c.pos.x + Math.sin(a) * d, c.pos.y + 1, c.pos.z + Math.cos(a) * d, { count: 1, color: '#b58cff', color2: '#ffffff', speed: 1, life: 0.5, size: 0.25 }); }
  } });
S({ id: 'n_liche', cls: 'necro', name: 'Forme de liche', lvl: 28, icon: ['lich', '#a8a4d8'], target: 'self', cd: 120, cost: 0, school: 'shadow', anim: 'raise', gcd: false, sound: 'howl',
  desc: (r) => `Pendant ${12 + r} s : +30 % de dégâts, incantations 25 % plus rapides et vos serviteurs frappent 50 % plus fort.`,
  run: (c, t, r) => { addBuff(c, 'lichform', c, { dur: 12 + r }); pillar(c.pos.x, c.pos.y, c.pos.z, '#b58cff', 40, 4); for (const m of Pets.minionsOf(c)) m.statsDirty = true; } });

// =============================== CHAMAN ===============================
S({ id: 'c_arc', cls: 'chaman', name: 'Arc électrique', lvl: 1, basic: true, icon: ['arc', '#2ab5ff'], range: 28, cast: 1.2, school: 'lightning', anim: 'cast', sound: 'zap',
  desc: (r, c) => `Un arc de foudre frappe la cible : ${f(P(c, 1.35, r))} dégâts de foudre. Incantation 1,2 s.`,
  run: (c, t, r) => { beam(c.handPos(), chest(t), '#bfe8ff', 0.25, 0.7); dealDamage(c, t, P(c, 1.35, r), { school: 'lightning', skill: 'Arc électrique' }); } });
S({ id: 'c_onde', cls: 'chaman', name: 'Onde apaisante', lvl: 1, icon: ['wave', '#2ab5ff'], target: 'ally', range: 30, cast: 1.5, cost: 9, school: 'nature', anim: 'cast', sound: 'heal',
  desc: (r, c) => `Une vague d'eau vive rend ${f(HP(c, 2.3, r))} points de vie à un allié. Incantation 1,5 s.`,
  run: (c, t, r) => { heal(c, t, HP(c, 2.3, r), { skill: 'Onde apaisante' }); pillar(t.pos.x, t.pos.y, t.pos.z, '#8fe0ff', 18, 2); } });
S({ id: 'c_totem_source', cls: 'chaman', name: 'Totem de source', lvl: 2, icon: ['totemheal', '#2ab5ff'], target: 'self', cd: 25, cost: 10, school: 'nature', anim: 'raise', sound: 'heal',
  desc: (r, c) => `Plante un totem (20 s) qui rend ${f(HP(c, 0.35, r))} PV toutes les 2 s aux alliés à 12 m.`,
  run: (c, t, r) => spawnTotem(c, { kind: 'source', dur: 20, tick: 2, color: '#6fd8ff', fn: (T) => {
    for (const a of alliesAround(c, T.x, T.z, 12)) if (a.hp < a.stats.maxHp) heal(c, a, HP(c, 0.35, r), { tick: true, skill: 'Totem de source' });
    burst(T.x, T.grp.position.y + 2, T.z, { count: 4, color: '#8fe0ff', speed: 1, vy: 1, life: 0.6 });
  } }) });
S({ id: 'c_ecailles', cls: 'chaman', name: "Écailles d'orage", lvl: 4, icon: ['scales', '#2ab5ff'], target: 'ally', range: 30, cd: 12, cost: 8, school: 'lightning', anim: 'cast', sound: 'zap',
  desc: (r, c) => `Un allié absorbe ${f(HP(c, 1.2, r))} dégâts pendant 15 s ; ses agresseurs subissent ${f(P(c, 0.3, r))} dégâts de foudre à chaque coup.`,
  run: (c, t, r) => { addBuff(t, 'stormscale', c, { dur: 15, value: HP(c, 1.2, r), thorns: P(c, 0.3, r) }); burst(t.pos.x, t.pos.y + 1, t.pos.z, { count: 12, color: '#9fd8ff', speed: 2, life: 0.5 }); } });
S({ id: 'c_ricochet', cls: 'chaman', name: 'Guérison ricochet', lvl: 6, icon: ['chainheal', '#2ab5ff'], target: 'ally', range: 30, cast: 1.8, cost: 14, school: 'nature', anim: 'cast', sound: 'heal',
  desc: (r, c) => `Soigne un allié de ${f(HP(c, 1.6, r))} PV puis rebondit sur ${2 + Math.floor(r / 2)} autres alliés blessés (−25 % à chaque rebond).`,
  run: (c, t, r) => {
    let cur = t, k = 1, prev = chest(c);
    const done = new Set();
    for (let i = 0; i < 3 + Math.floor(r / 2) && cur; i++) {
      done.add(cur);
      heal(c, cur, HP(c, 1.6, r) * k, { skill: 'Guérison ricochet' });
      const cp = chest(cur); beam(prev, cp, '#8fe0ff', 0.35, 0.3); prev = cp; k *= 0.75;
      cur = alliesAround(c, cur.pos.x, cur.pos.z, 14).filter((a) => !done.has(a) && a.hp < a.stats.maxHp).sort((a, b) => a.hp / a.stats.maxHp - b.hp / b.stats.maxHp)[0];
    }
  } });
S({ id: 'c_totem_braise', cls: 'chaman', name: 'Totem de braise', lvl: 8, icon: ['totemfire', '#ff7a2a'], target: 'self', cd: 24, cost: 10, school: 'fire', anim: 'raise', sound: 'fire',
  desc: (r, c) => `Plante un totem (18 s) qui lance des boules de feu sur les ennemis à 22 m : ${f(P(c, 0.5, r))} dégâts toutes les 1,5 s.`,
  run: (c, t, r) => spawnTotem(c, { kind: 'braise', dur: 18, tick: 1.5, color: '#ff8a3a', fn: (T) => {
    const e = enemiesAround(c, T.x, T.z, 22)[0];
    if (!e) return;
    const from = { x: T.x, y: T.grp.position.y + 2.1, z: T.z };
    fxProjectile({ from, target: e, kind: 'fire', speed: 26, onHit: () => dealDamage(c, e, P(c, 0.5, r), { school: 'fire', skill: 'Totem de braise' }) });
  } }) });
S({ id: 'c_seisme', cls: 'chaman', name: 'Onde sismique', lvl: 10, icon: ['quake', '#8a6440'], target: 'self', cd: 12, cost: 10, school: 'nature', anim: 'slam', sound: 'boom',
  desc: (r, c) => `Frappe le sol : ${f(P(c, 0.8, r))} dégâts aux ennemis à 7 m, repoussés de 5 m. Interrompt leurs incantations.`,
  run: (c, t, r) => { for (const e of enemiesAround(c, c.pos.x, c.pos.z, 7)) { dealDamage(c, e, P(c, 0.8, r), { school: 'nature', skill: 'Onde sismique' }); knockback(e, c.pos.x, c.pos.z, 5); interruptWindup(e, c); } shockRing(c.pos.x, c.pos.z, 7, '#c8a070', 0.5); burst(c.pos.x, c.pos.y + 0.2, c.pos.z, { count: 26, color: '#8a7a6a', speed: 6, life: 0.6, size: 0.25 }); } });
S({ id: 'c_esprit', buffs: ['ancestral'], cls: 'chaman', name: 'Esprit ancestral', lvl: 13, icon: ['ancestral', '#2ab5ff'], target: 'ally', range: 30, cd: 10, cost: 10, school: 'nature', anim: 'cast', sound: 'heal',
  desc: (r, c) => `Un esprit veille sur un allié : ${f(HP(c, 0.45, r) * 10)} PV rendus en 10 s.`,
  run: (c, t, r) => { addBuff(t, 'ancestral', c, { dur: 10, value: HP(c, 0.45, r) }); pillar(t.pos.x, t.pos.y, t.pos.z, '#9fe8ff', 14, 2); } });
S({ id: 'c_tempete', cls: 'chaman', name: 'Tempête primordiale', lvl: 16, icon: ['tempest', '#2ab5ff'], target: 'ground', range: 28, cd: 16, cost: 16, school: 'lightning', anim: 'raise', sound: 'zap',
  desc: (r, c) => `Déchaîne un orage sur 6 m pendant 6 s : ${f(P(c, 0.4, r))} dégâts de foudre par seconde.`,
  run: (c, t, r, x) => groundZone(c, x.pos.x, x.pos.z, 6, 6, 1, '#7fc8ff', (z) => {
    const l = enemiesAround(c, z.x, z.z, 6);
    for (const e of l) dealDamage(c, e, P(c, 0.4, r), { school: 'lightning', skill: 'Tempête primordiale', dot: true });
    const gx = z.x + (Math.random() - 0.5) * 8, gz = z.z + (Math.random() - 0.5) * 8, gy = getHeight(gx, gz);
    beam({ x: gx, y: gy + 18, z: gz }, { x: gx, y: gy, z: gz }, '#e0f4ff', 0.25, 1.8);
  }) });
S({ id: 'c_maree', cls: 'chaman', name: 'Marée montante', lvl: 20, icon: ['tide', '#2ab5ff'], target: 'self', cd: 18, cost: 20, school: 'nature', anim: 'raise', sound: 'heal',
  desc: (r, c) => `Une marée soigne les alliés à 15 m de ${f(HP(c, 1.6, r))} PV (30 % de plus sous la moitié de leur vie).`,
  run: (c, t, r) => { for (const a of alliesAround(c, c.pos.x, c.pos.z, 15)) { heal(c, a, HP(c, 1.6, r) * (a.hp < a.stats.maxHp * 0.5 ? 1.3 : 1), { skill: 'Marée montante' }); pillar(a.pos.x, a.pos.y, a.pos.z, '#8fe0ff', 8, 1.5); } shockRing(c.pos.x, c.pos.z, 15, '#6fd8ff', 0.6); } });
S({ id: 'c_totem_vents', cls: 'chaman', name: 'Totem des vents', lvl: 24, icon: ['totemwind', '#9fe8ff'], target: 'self', cd: 60, cost: 10, school: 'nature', anim: 'raise', sound: 'whoosh',
  desc: () => `Plante un totem (20 s) : les alliés à 15 m gagnent 15 % de hâte.`,
  run: (c) => spawnTotem(c, { kind: 'vents', dur: 20, tick: 1, color: '#bff4ff', fn: (T) => { for (const a of alliesAround(c, T.x, T.z, 15)) addBuff(a, 'windfury', c, { dur: 1.6 }); } }) });
S({ id: 'c_incarnation', cls: 'chaman', name: 'Incarnation élémentaire', lvl: 28, icon: ['incarnate', '#2ab5ff'], target: 'self', cd: 120, cost: 0, school: 'lightning', anim: 'raise', gcd: false, sound: 'zap',
  desc: (r) => `Pendant ${12 + r} s : +30 % de soins et de dégâts, incantations 20 % plus rapides.`,
  run: (c, t, r) => { addBuff(c, 'incarnation', c, { dur: 12 + r }); pillar(c.pos.x, c.pos.y, c.pos.z, '#6fd8ff', 40, 4); if (G.sky) G.sky.flash = 0.3; } });

// ======================= TECHNIQUES DE SPÉCIALISATION =======================
// core : accordée par la spécialisation · talent : apprise dans l'arbre · specBasic : attaque de base de la spécialisation
// ai : indication pour l'IA des bots (nuke, aoe, dot, buff, defensive, taunt, summon, form, heal, hot, aoeheal, consume)
const SP = (o) => S({ lvl: 1, ...o });
function toggleForm(c, id, col) {
  if (hasBuff(c, id)) { removeBuff(c, id); burst(c.pos.x, c.pos.y + 1, c.pos.z, { count: 14, color: col, speed: 3, life: 0.5 }); return; }
  if (c.mounted) c.dismount?.();
  addBuff(c, id, c, { dur: 1e9 });
  burst(c.pos.x, c.pos.y + 1, c.pos.z, { count: 24, color: '#8fe86a', color2: col, speed: 4, life: 0.6 });
}
const petsOf = (c) => [...Pets.minionsOf(c), ...(c === G.player && Pets.active && !Pets.active.dead ? [Pets.active] : [])];

// --- Guerrier
SP({ id: 'g_provoc', cls: 'guerrier', spec: 'sp_rempart', core: true, name: 'Provocation', icon: ['challenge', '#9aa2ae'], range: 25, cd: 8, cost: 2, gcd: false, anim: 'roar', sound: 'shout', ai: { t: 'taunt' },
  desc: () => `Force l'ennemi à vous attaquer pendant 3 s. Portée 25 m.`,
  run: (c, t) => { taunt(c, [t]); dealDamage(c, t, 1, { skill: 'Provocation', noCrit: true, silentText: true, threatMul: 30 }); beam(chest(c), chest(t), '#c9ced6', 0.25, 0.2); } });
SP({ id: 'g_tonnerre', cls: 'guerrier', spec: 'sp_rempart', talent: true, name: 'Coup de tonnerre', icon: ['thunder', '#9aa2ae'], target: 'self', cd: 6, cost: 8, anim: 'slam', animDur: 0.5, sound: 'boom', ai: { t: 'aoe', r: 8 },
  desc: (r, c) => `Frappe le sol : ${f(P(c, 0.75, r))} dégâts aux ennemis à 8 m, qui infligent 20 % de dégâts en moins pendant 8 s. Forte menace.`,
  run: (c, t, r) => {
    for (const e of enemiesAround(c, c.pos.x, c.pos.z, 8)) { dealDamage(c, e, P(c, 0.75, r), { skill: 'Coup de tonnerre', threatMul: 2.2 }); addBuff(e, 'weakness', c, { dur: 8 }); }
    shockRing(c.pos.x, c.pos.z, 8, '#c9ced6', 0.5);
    burst(c.pos.x, c.pos.y + 0.2, c.pos.z, { count: 24, color: '#c9ced6', color2: '#9fd0ff', speed: 6, life: 0.5, size: 0.2 });
  } });
SP({ id: 'g_dernier', cls: 'guerrier', spec: 'sp_rempart', talent: true, name: 'Dernier rempart', icon: ['rampart', '#e04040'], target: 'self', cd: 90, gcd: false, anim: 'roar', sound: 'shield', ai: { t: 'defensive', hp: 0.35 },
  desc: () => `Rend 30 % de vos points de vie et réduit de 30 % les dégâts subis pendant 10 s.`,
  run: (c) => { heal(c, c, c.stats.maxHp * 0.3, { noCrit: true, skill: 'Dernier rempart' }); addBuff(c, 'laststand', c, { dur: 10 }); pillar(c.pos.x, c.pos.y, c.pos.z, '#ff7070', 30, 3); } });
SP({ id: 'g_mortelle', cls: 'guerrier', spec: 'sp_armes', talent: true, name: 'Frappe mortelle', icon: ['mortal', '#d06040'], cd: 6, cost: 9, anim: 'slam', animDur: 0.5, sound: 'crit', ai: { t: 'nuke' },
  desc: (r, c) => `Coup terrible : ${f(P(c, 1.9, r))} dégâts. La cible subit 12 % de dégâts en plus pendant 8 s.`,
  run: (c, t, r) => { dealDamage(c, t, P(c, 1.9, r), { skill: 'Frappe mortelle' }); addBuff(t, 'exposed', c, { dur: 8 }); } });
SP({ id: 'g_colosse', cls: 'guerrier', spec: 'sp_armes', talent: true, name: 'Frappe du colosse', icon: ['titan', '#b5452a'], cd: 18, cost: 12, anim: 'slam', animDur: 0.6, sound: 'crit', ai: { t: 'nuke' },
  desc: (r, c) => `Frappe dévastatrice : ${f(P(c, 3.4, r))} dégâts, et l'armure de la cible est réduite de 30 % pendant 10 s.`,
  run: (c, t, r) => {
    dealDamage(c, t, P(c, 3.4, r), { skill: 'Frappe du colosse', critBonus: 10 }); addBuff(t, 'sunder', c, { dur: 10 });
    shockRing(t.pos.x, t.pos.z, 3.5, '#ff9a6a', 0.4); if (G.cam && c === G.player) G.cam.shake = 0.3;
  } });
SP({ id: 'g_sang', cls: 'guerrier', spec: 'sp_furie', talent: true, name: 'Sanguinaire', icon: ['drain', '#d0402a'], cd: 5, cost: 6, anim: 'attack2', sound: 'swing', ai: { t: 'nuke' },
  desc: (r, c) => `Frappe rapide : ${f(P(c, 1.35, r))} dégâts, et vous récupérez 3 % de vos points de vie.`,
  run: (c, t, r) => { dealDamage(c, t, P(c, 1.35, r), { skill: 'Sanguinaire' }); heal(c, c, c.stats.maxHp * 0.03, { noCrit: true, silent: true, skill: 'Sanguinaire' }); } });
SP({ id: 'g_berserk', cls: 'guerrier', spec: 'sp_furie', talent: true, name: 'Rage berserker', icon: ['frenzy', '#ff5a2a'], target: 'self', cd: 90, gcd: false, anim: 'roar', sound: 'shout', ai: { t: 'buff' },
  desc: () => `Pendant 12 s : +25 % de hâte et +15 % de dégâts. Vous libère des étourdissements et des entraves.`,
  run: (c) => { clearDebuffs(c, 'stun'); clearDebuffs(c, 'root'); addBuff(c, 'berserk', c, { dur: 12 }); pillar(c.pos.x, c.pos.y, c.pos.z, '#ff5a2a', 30, 3); } });

// --- Templier
SP({ id: 't_aube', cls: 'templier', spec: 'sp_lumiere', talent: true, name: 'Aube guérisseuse', icon: ['dawn', '#fff4c8'], target: 'self', cd: 8, cost: 14, school: 'holy', anim: 'raise', sound: 'heal', ai: { t: 'aoeheal', n: 2 },
  desc: (r, c) => `Une vague de lumière soigne les alliés à 15 m de ${f(HP(c, 1.1, r))} points de vie.`,
  run: (c, t, r) => { for (const a of alliesAround(c, c.pos.x, c.pos.z, 15)) { heal(c, a, HP(c, 1.1, r), { skill: 'Aube guérisseuse' }); pillar(a.pos.x, a.pos.y, a.pos.z, '#fff0a0', 8, 1.5); } shockRing(c.pos.x, c.pos.z, 15, '#ffe68a', 0.6); } });
SP({ id: 't_rayon', cls: 'templier', spec: 'sp_lumiere', talent: true, name: 'Rayon de grâce', buffs: ['grace'], icon: ['ascend', '#fff4c8'], target: 'ally', range: 30, cd: 12, cost: 12, school: 'holy', anim: 'cast', sound: 'heal', ai: { t: 'heal', hp: 0.45 },
  desc: (r, c) => `Soin instantané de ${f(HP(c, 3.2, r))} points de vie, puis ${f(HP(c, 0.2, r) * 8)} de plus en 8 s.`,
  run: (c, t, r) => { heal(c, t, HP(c, 3.2, r), { skill: 'Rayon de grâce' }); addBuff(t, 'grace', c, { dur: 8, value: HP(c, 0.2, r) }); beam({ x: t.pos.x, y: t.pos.y + 20, z: t.pos.z }, chest(t), '#fff4c8', 0.4, 0.5); } });
SP({ id: 't_vengeur', cls: 'templier', spec: 'sp_bastion', talent: true, name: 'Bouclier du vengeur', icon: ['aegis', '#ffb040'], range: 22, cd: 9, cost: 8, school: 'holy', anim: 'throw', sound: 'shield', interrupt: true, ai: { t: 'nuke' },
  desc: (r, c) => `Lance votre bouclier : ${f(P(c, 1.2, r))} dégâts sacrés, puis il rebondit sur 2 ennemis proches. Menace très élevée ; interrompt l'incantation.`,
  run: (c, t, r) => {
    let prev = chest(c), cur = t; const hit = new Set();
    for (let i = 0; i < 3 && cur; i++) {
      hit.add(cur); const cp = chest(cur); beam(prev, cp, '#ffe68a', 0.3, 0.3);
      dealDamage(c, cur, P(c, 1.2, r), { school: 'holy', skill: 'Bouclier du vengeur', threatMul: 3 });
      prev = cp; cur = enemiesAround(c, cur.pos.x, cur.pos.z, 10).find((e) => !hit.has(e));
    }
  } });
SP({ id: 't_gardien', cls: 'templier', spec: 'sp_bastion', talent: true, name: 'Gardien ardent', icon: ['seal', '#ffe68a'], target: 'self', cd: 90, gcd: false, school: 'holy', anim: 'block', sound: 'shield', ai: { t: 'defensive', hp: 0.45 },
  desc: () => `Pendant 12 s : −35 % de dégâts subis. Rend aussitôt 15 % de vos points de vie.`,
  run: (c) => { addBuff(c, 'ardent', c, { dur: 12 }); heal(c, c, c.stats.maxHp * 0.15, { noCrit: true, skill: 'Gardien ardent' }); pillar(c.pos.x, c.pos.y, c.pos.z, '#ffe68a', 40, 3.5); } });
SP({ id: 't_tempete', cls: 'templier', spec: 'sp_chatiment', talent: true, name: 'Tempête divine', icon: ['fervor', '#ffb040'], target: 'self', cd: 9, cost: 10, school: 'holy', anim: 'spin', animDur: 0.5, sound: 'whirl', ai: { t: 'aoe', r: 8 },
  desc: (r, c) => `Tourbillon de lumière : ${f(P(c, 1.1, r))} dégâts sacrés aux ennemis à 8 m.`,
  run: (c, t, r) => { for (const e of enemiesAround(c, c.pos.x, c.pos.z, 8)) dealDamage(c, e, P(c, 1.1, r), { school: 'holy', skill: 'Tempête divine' }); shockRing(c.pos.x, c.pos.z, 8, '#ffe68a', 0.4); burst(c.pos.x, c.pos.y + 1, c.pos.z, { count: 26, color: '#fff0a0', color2: '#ffb040', speed: 7, life: 0.5 }); } });
SP({ id: 't_final', cls: 'templier', spec: 'sp_chatiment', talent: true, name: 'Jugement final', icon: ['verdict', '#ff7a3a'], range: 6, cd: 15, cost: 12, school: 'holy', anim: 'slam', animDur: 0.6, sound: 'crit', ai: { t: 'nuke' },
  desc: (r, c) => `Frappe du ciel : ${f(P(c, 3.0, r))} dégâts sacrés, 50 % de plus si la cible a moins de 35 % de vie. Vous récupérez 15 % des dégâts infligés.`,
  run: (c, t, r) => {
    const low = t.hp / (t.stats.maxHp || 1) < 0.35;
    const a = dealDamage(c, t, P(c, 3.0, r) * (low ? 1.5 : 1), { school: 'holy', skill: 'Jugement final' });
    if (a > 0) heal(c, c, a * 0.15, { noCrit: true, silent: true });
    beam({ x: t.pos.x, y: t.pos.y + 24, z: t.pos.z }, chest(t), '#ffe68a', 0.5, 0.4); shockRing(t.pos.x, t.pos.z, 3, '#ffe68a', 0.4);
  } });

// --- Mage
SP({ id: 'm_pyro', cls: 'mage', spec: 'sp_feu', talent: true, name: 'Pyroexplosion', buffs: ['burn'], icon: ['pyro', '#ff5a1a'], range: 30, cast: 2.2, cd: 6, cost: 12, school: 'fire', anim: 'cast', sound: 'fire', ai: { t: 'nuke' },
  desc: (r, c) => `Énorme boule de feu : ${f(P(c, 2.6, r))} dégâts de feu, puis ${f(P(c, 0.15, r) * 8)} dégâts de brûlure en 8 s. Incantation 2,2 s.`,
  run: (c, t, r) => projectile(c, t, 'bigfire', () => { dealDamage(c, t, P(c, 2.6, r), { school: 'fire', skill: 'Pyroexplosion' }); addBuff(t, 'burn', c, { dur: 8, value: P(c, 0.15, r) }); }, 28) });
SP({ id: 'm_inferno', cls: 'mage', spec: 'sp_feu', talent: true, name: 'Déflagration infernale', icon: ['firerain', '#ff3a1a'], target: 'ground', range: 30, cd: 20, cost: 18, school: 'fire', anim: 'raise', sound: 'boom', ai: { t: 'aoe', r: 8 },
  desc: (r, c) => `Le sol explose sur 8 m : ${f(P(c, 2.2, r))} dégâts de feu et une brûlure sur chaque ennemi touché.`,
  run: (c, t, r, x) => {
    const px = x.pos.x, pz = x.pos.z;
    telegraph(px, pz, 8, 0.7, () => {
      for (const e of enemiesAround(c, px, pz, 8)) { dealDamage(c, e, P(c, 2.2, r), { school: 'fire', skill: 'Déflagration infernale' }); addBuff(e, 'burn', c, { dur: 6, value: P(c, 0.12, r) }); }
      shockRing(px, pz, 8, '#ff7a2a', 0.6); burst(px, getHeight(px, pz) + 0.5, pz, { count: 50, color: '#ffb040', color2: '#ff3a0a', speed: 12, life: 0.8, size: 0.32 });
      if (G.cam && dist(G.player, { pos: { x: px, z: pz } }) < 30) G.cam.shake = 0.35;
    }, { color: '#ff8a2a' });
  } });
SP({ id: 'm_blizzard', cls: 'mage', spec: 'sp_givre', talent: true, name: 'Blizzard', icon: ['blizzard', '#8fd8ff'], target: 'ground', range: 30, cd: 12, cost: 16, school: 'frost', anim: 'raise', sound: 'frost', ai: { t: 'aoe', r: 7 },
  desc: (r, c) => `Tempête de glace sur 7 m pendant 6 s : ${f(P(c, 0.38, r))} dégâts de givre par seconde, et les ennemis sont transis.`,
  run: (c, t, r, x) => groundZone(c, x.pos.x, x.pos.z, 7, 6, 1, '#bfeaff', (z) => {
    for (const e of enemiesAround(c, z.x, z.z, 7)) { dealDamage(c, e, P(c, 0.38, r), { school: 'frost', skill: 'Blizzard', dot: true }); addBuff(e, 'chill', c, { dur: 2 }); }
    for (let i = 0; i < 5; i++) burst(z.x + (Math.random() - 0.5) * 12, getHeight(z.x, z.z) + 6, z.z + (Math.random() - 0.5) * 12, { count: 2, color: '#e8f8ff', speed: 0.5, vy: -10, gravity: 4, life: 0.8, size: 0.16, up: 0 });
  }) });
SP({ id: 'm_comete', cls: 'mage', spec: 'sp_givre', talent: true, name: 'Comète de glace', icon: ['comet', '#dff6ff'], range: 30, cast: 1.0, cd: 16, cost: 14, school: 'frost', anim: 'cast', sound: 'frost', ai: { t: 'nuke' },
  desc: (r, c) => `Une comète de glace frappe la cible : ${f(P(c, 2.8, r))} dégâts de givre (${f(P(c, 1.2, r))} aux ennemis à 5 m) et la gèle 2,5 s.`,
  run: (c, t, r) => projectile(c, t, 'ice', () => {
    dealDamage(c, t, P(c, 2.8, r), { school: 'frost', skill: 'Comète de glace' });
    for (const e of enemiesAround(c, t.pos.x, t.pos.z, 5)) if (e !== t) dealDamage(c, e, P(c, 1.2, r), { school: 'frost', skill: 'Comète de glace' });
    if (!t.dead) addBuff(t, 'frozen', c, { dur: 2.5 });
    shockRing(t.pos.x, t.pos.z, 5, '#dff6ff', 0.4); burst(t.pos.x, t.pos.y + 1, t.pos.z, { count: 30, color: '#dff6ff', color2: '#8fd8ff', speed: 8, life: 0.6 });
  }, 36) });
SP({ id: 'm_missiles', cls: 'mage', spec: 'sp_arcanes', talent: true, name: 'Projectiles arcaniques', icon: ['missiles', '#d49aff'], range: 30, channel: 2.5, tick: 0.5, cd: 5, cost: 10, school: 'arcane', anim: 'channel', sound: 'spellhit', ai: { t: 'nuke' },
  desc: (r, c) => `Canalise 2,5 s : 5 projectiles de ${f(P(c, 0.52, r))} dégâts arcaniques chacun.`,
  onTick: (c, t, r) => { if (!t || t.dead) return; projectile(c, t, 'arcane', () => dealDamage(c, t, P(c, 0.52, r), { school: 'arcane', skill: 'Projectiles arcaniques' }), 40); },
  run: () => {} });
SP({ id: 'm_distorsion', cls: 'mage', spec: 'sp_arcanes', talent: true, name: 'Distorsion temporelle', icon: ['hourglass', '#d49aff'], target: 'self', cd: 120, gcd: false, school: 'arcane', anim: 'raise', sound: 'blink', ai: { t: 'buff' },
  desc: () => `Réinitialise la recharge de vos autres sorts et accorde +20 % de hâte pendant 10 s.`,
  run: (c) => { for (const k in c.cds) if (k !== 'm_distorsion' && k !== 'x_rappel') c.cds[k] = 0; addBuff(c, 'distortion', c, { dur: 10 }); pillar(c.pos.x, c.pos.y, c.pos.z, '#d49aff', 35, 3); } });

// --- Nécromancien
SP({ id: 'n_peste', cls: 'necro', spec: 'sp_fleau', talent: true, name: 'Peste', buffs: ['plague'], icon: ['plague', '#9ae040'], range: 28, cd: 8, cost: 9, school: 'shadow', anim: 'cast', sound: 'spellhit', ai: { t: 'dot', buff: 'plague' },
  desc: (r, c) => `Infecte la cible et 2 ennemis proches : ${f(P(c, 0.2, r) * 12)} dégâts d'ombre en 12 s chacun.`,
  run: (c, t, r) => {
    const list = [t, ...enemiesAround(c, t.pos.x, t.pos.z, 8).filter((e) => e !== t).slice(0, 2)];
    for (const e of list) { addBuff(e, 'plague', c, { dur: 12, value: P(c, 0.2, r) }); burst(e.pos.x, e.pos.y + 1, e.pos.z, { count: 10, color: '#9ae040', color2: '#4a6a2a', speed: 1.5, life: 0.7 }); }
  } });
SP({ id: 'n_moisson', cls: 'necro', spec: 'sp_fleau', talent: true, name: 'Moisson des âmes', icon: ['reap', '#9ae040'], range: 28, cd: 12, cost: 10, school: 'shadow', anim: 'cast', sound: 'howl', ai: { t: 'nuke' },
  desc: (r, c) => `Arrache l'âme de la cible : ${f(P(c, 1.6, r))} dégâts d'ombre, +35 % par affliction qui la ronge. Vous récupérez 20 % des dégâts.`,
  run: (c, t, r) => {
    const n = t.buffs.filter((b) => b.src === c && (b.def.tick || b.def.id === 'affliction') && b.def.debuff).length;
    const a = dealDamage(c, t, P(c, 1.6, r) * (1 + 0.35 * n), { school: 'shadow', skill: 'Moisson des âmes' });
    if (a > 0) heal(c, c, a * 0.2, { noCrit: true, silent: true });
    beam(chest(t), chest(c), '#9ae040', 0.35, 0.5);
  } });
SP({ id: 'n_magesq', cls: 'necro', spec: 'sp_legion', talent: true, name: 'Mage squelette', icon: ['lich', '#6affc0'], target: 'self', cast: 1.5, cd: 30, cost: 14, school: 'shadow', anim: 'raise', sound: 'spellhit', ai: { t: 'summon', id: 'mage_squelette', max: 1 },
  desc: () => `Relève un mage squelette qui lance des traits d'ombre pendant 60 s.`,
  run: (c) => { for (const m of Pets.minionsOf(c, 'mage_squelette')) Pets.expire(m); Pets.summonMinion(c, 'mage_squelette', { dur: 60, hp: 0.35, dmg: 0.55 }); } });
SP({ id: 'n_armee', cls: 'necro', spec: 'sp_legion', talent: true, name: 'Armée des ténèbres', icon: ['legion', '#6a5a9a'], target: 'self', cd: 120, cost: 20, school: 'shadow', anim: 'raise', sound: 'howl', ai: { t: 'buff' },
  desc: () => `Six squelettes surgissent du sol et combattent pendant 20 s.`,
  run: (c) => { for (let i = 0; i < 6; i++) Pets.summonMinion(c, 'squelette_serviteur', { dur: 20, hp: 0.32, dmg: 0.38 }); } });
SP({ id: 'n_frappeos', cls: 'necro', spec: 'sp_ossuaire', core: true, specBasic: true, name: 'Frappe osseuse', icon: ['reap', '#e6dfcd'], school: 'shadow', anim: 'attack', sound: 'swing',
  desc: (r, c) => `Coup de faux chargé d'énergie morte : ${f(P(c, 1.05, r))} dégâts d'ombre. Génère beaucoup de menace.`,
  run: (c, t, r) => dealDamage(c, t, P(c, 1.05, r), { school: 'shadow', skill: 'Frappe osseuse', threatMul: 1.6 }) });
SP({ id: 'n_provoc', cls: 'necro', spec: 'sp_ossuaire', core: true, name: 'Poigne macabre', icon: ['wail', '#e6dfcd'], range: 20, cd: 8, cost: 3, gcd: false, school: 'shadow', anim: 'raise', sound: 'howl', ai: { t: 'taunt' },
  desc: () => `Force la cible et les ennemis à 6 m d'elle à vous attaquer pendant 3 s. Portée 20 m.`,
  run: (c, t) => { const l = [t, ...enemiesAround(c, t.pos.x, t.pos.z, 6).filter((e) => e !== t)]; taunt(c, l); for (const e of l) dealDamage(c, e, 1, { school: 'shadow', skill: 'Poigne macabre', noCrit: true, silentText: true, threatMul: 30 }); beam(chest(c), chest(t), '#e6dfcd', 0.3, 0.3); } });
SP({ id: 'n_marche', cls: 'necro', spec: 'sp_ossuaire', talent: true, name: 'Marche de mort', icon: ['necroblast', '#e6dfcd'], target: 'self', cd: 12, cost: 12, school: 'shadow', anim: 'slam', sound: 'boom', ai: { t: 'aoe', r: 7 },
  desc: (r, c) => `Corrompt le sol à vos pieds (7 m, 8 s) : ${f(P(c, 0.32, r))} dégâts d'ombre par seconde aux ennemis, avec une forte menace.`,
  run: (c, t, r) => groundZone(c, c.pos.x, c.pos.z, 7, 8, 1, '#6a5a8a', (z) => {
    for (const e of enemiesAround(c, z.x, z.z, 7)) dealDamage(c, e, P(c, 0.32, r), { school: 'shadow', skill: 'Marche de mort', dot: true, threatMul: 2.5 });
  }, { particles: { count: 1, color: '#a8a4d8', speed: 0.4, vy: 2, life: 0.8, up: 0 } }) });
SP({ id: 'n_pacte', cls: 'necro', spec: 'sp_ossuaire', talent: true, name: 'Pacte de sang', icon: ['drain', '#c02020'], target: 'self', cd: 90, gcd: false, school: 'shadow', anim: 'roar', sound: 'howl', ai: { t: 'defensive', hp: 0.45 },
  desc: () => `Pendant 12 s : −30 % de dégâts subis, et 25 % des dégâts infligés vous soignent.`,
  run: (c) => { addBuff(c, 'bloodpact', c, { dur: 12 }); pillar(c.pos.x, c.pos.y, c.pos.z, '#c02020', 32, 3); } });

// --- Archer
SP({ id: 'a_puissant', cls: 'archer', spec: 'sp_precision', talent: true, name: 'Tir puissant', icon: ['pierce', '#ffe68a'], range: 34, cast: 2.4, cd: 8, cost: 10, anim: 'shoot', sound: 'bow', ai: { t: 'nuke' },
  desc: (r, c) => `Bande l'arc au maximum : ${f(P(c, 3.0, r))} dégâts. Incantation 2,4 s.`,
  run: (c, t, r) => projectile(c, t, 'spear', () => dealDamage(c, t, P(c, 3.0, r), { skill: 'Tir puissant', critBonus: 10 }), 70) });
SP({ id: 'a_mortel', cls: 'archer', spec: 'sp_precision', talent: true, name: 'Tir mortel', icon: ['execute', '#e0c060'], range: 32, cd: 14, cost: 12, anim: 'shoot', sound: 'crit', ai: { t: 'nuke' },
  desc: (r, c) => `Une flèche en plein cœur : ${f(P(c, 3.5, r))} dégâts, doublés si la cible a moins de 25 % de vie.`,
  run: (c, t, r) => projectile(c, t, 'arrow', () => { const low = t.hp / (t.stats.maxHp || 1) < 0.25; dealDamage(c, t, P(c, 3.5, r) * (low ? 2 : 1), { skill: 'Tir mortel', critBonus: 15 }); }, 70) });
SP({ id: 'a_explosif', cls: 'archer', spec: 'sp_survie', talent: true, name: 'Piège explosif', buffs: ['burn'], icon: ['trap', '#ff9a3a'], target: 'ground', range: 30, cd: 12, cost: 10, school: 'fire', anim: 'throw', sound: 'trap', ai: { t: 'aoe', r: 5 },
  desc: (r, c) => `Lance un piège qui explose sur 5 m : ${f(P(c, 1.5, r))} dégâts de feu, puis ${f(P(c, 0.12, r) * 6)} dégâts de brûlure en 6 s.`,
  run: (c, t, r, x) => {
    const px = x.pos.x, pz = x.pos.z;
    telegraph(px, pz, 5, 0.5, () => {
      for (const e of enemiesAround(c, px, pz, 5)) { dealDamage(c, e, P(c, 1.5, r), { school: 'fire', skill: 'Piège explosif' }); addBuff(e, 'burn', c, { dur: 6, value: P(c, 0.12, r) }); }
      shockRing(px, pz, 5, '#ffb040', 0.4); burst(px, getHeight(px, pz) + 0.4, pz, { count: 30, color: '#ffb040', color2: '#5a4a3a', speed: 8, life: 0.6, size: 0.25 });
    });
  } });
SP({ id: 'a_nuee', cls: 'archer', spec: 'sp_survie', talent: true, name: 'Nuée venimeuse', icon: ['swarm', '#b6e04a'], target: 'ground', range: 30, cd: 18, cost: 14, school: 'poison', anim: 'shoot', sound: 'bow', ai: { t: 'aoe', r: 8 },
  desc: (r, c) => `Une pluie de flèches empoisonnées sur 8 m : ${f(P(c, 1.8, r))} dégâts et deux doses de poison sur chaque ennemi.`,
  run: (c, t, r, x) => {
    const px = x.pos.x, pz = x.pos.z;
    for (const e of enemiesAround(c, px, pz, 8)) { dealDamage(c, e, P(c, 1.8, r), { school: 'poison', skill: 'Nuée venimeuse' }); addBuff(e, 'poison', c, { dur: 12, value: P(c, 0.16, r) }); addBuff(e, 'poison', c, { dur: 12, value: P(c, 0.16, r) }); }
    for (let i = 0; i < 18; i++) burst(px + (Math.random() - 0.5) * 14, getHeight(px, pz) + 8, pz + (Math.random() - 0.5) * 14, { count: 1, color: '#b6e04a', speed: 0.5, vy: -22, gravity: 10, life: 0.4, size: 0.18, up: 0 });
    shockRing(px, pz, 8, '#b6e04a', 0.5);
  } });
SP({ id: 'a_loup', cls: 'archer', spec: 'sp_meute', core: true, name: 'Loup de chasse', icon: ['wolf', '#c8a060'], target: 'self', cast: 1.5, cd: 10, cost: 8, anim: 'raise', sound: 'howl', ai: { t: 'summon', id: 'loup_chasse', max: 1 },
  desc: () => `Appelle votre loup de chasse, qui vous accompagne et attaque vos cibles. S'il est déjà là, il est soigné.`,
  run: (c) => {
    const cur = Pets.minionsOf(c, 'loup_chasse')[0];
    if (cur) { cur.hp = cur.stats.maxHp; pillar(cur.pos.x, cur.pos.y, cur.pos.z, '#c8a060', 12, 1.5); return; }
    Pets.summonMinion(c, 'loup_chasse', { dur: 3600, hp: 0.55, dmg: 0.5 });
  } });
SP({ id: 'a_ordre', cls: 'archer', spec: 'sp_meute', talent: true, name: 'Ordre de meute', buffs: ['bleed'], icon: ['shout', '#e0c060'], range: 30, cd: 10, cost: 6, gcd: false, anim: 'roar', sound: 'howl', ai: { t: 'nuke' },
  desc: (r, c) => `Vos compagnons se ruent sur la cible avec +20 % de dégâts pendant 8 s ; elle saigne pour ${f(P(c, 0.25, r) * 8)} dégâts en 8 s.`,
  run: (c, t, r) => {
    for (const p of petsOf(c)) { addBuff(p, 'howl', c, { dur: 8 }); p.target = t; p.forceTarget = t; p.forceT = 4; }
    addBuff(t, 'bleed', c, { dur: 8, value: P(c, 0.25, r) });
    burst(t.pos.x, t.pos.y + 1, t.pos.z, { count: 12, color: '#e04040', speed: 3, life: 0.5 });
  } });
SP({ id: 'a_bete', cls: 'archer', spec: 'sp_meute', talent: true, name: 'Esprit de la bête', icon: ['wolf', '#ffd24a'], target: 'self', cd: 90, gcd: false, anim: 'roar', sound: 'howl', ai: { t: 'buff' },
  desc: () => `Pendant 15 s, vous et vos compagnons gagnez +25 % de dégâts et +20 % de hâte.`,
  run: (c) => { addBuff(c, 'beastspirit', c, { dur: 15 }); for (const p of petsOf(c)) addBuff(p, 'beastspirit', c, { dur: 15 }); pillar(c.pos.x, c.pos.y, c.pos.z, '#ffd24a', 32, 3); } });

// --- Assassin
SP({ id: 'as_envenimer', cls: 'assassin', spec: 'sp_venin', talent: true, name: 'Envenimer', icon: ['envenom', '#d0ff6a'], cd: 7, cost: 8, school: 'poison', anim: 'attack2', sound: 'crit', ai: { t: 'consume', buff: 'deadly_poison', n: 3 },
  desc: (r, c) => `Libère tout le poison mortel de la cible : ${f(P(c, 0.8, r))} dégâts, +${f(P(c, 0.45, r))} par dose consommée.`,
  run: (c, t, r) => {
    const b = t.buffs.find((x) => x.def.id === 'deadly_poison');
    const n = b ? b.stacks || 1 : 0;
    if (b) removeBuff(t, b);
    dealDamage(c, t, P(c, 0.8, r) + P(c, 0.45, r) * n, { school: 'poison', skill: 'Envenimer' });
    burst(t.pos.x, t.pos.y + 1, t.pos.z, { count: 8 + n * 4, color: '#9ae040', color2: '#d0ff6a', speed: 4, life: 0.5 });
  } });
SP({ id: 'as_toxine', cls: 'assassin', spec: 'sp_venin', talent: true, name: 'Toxine foudroyante', buffs: ['toxin'], icon: ['poison', '#d0ff6a'], range: 6, cd: 15, cost: 10, school: 'poison', anim: 'throw', sound: 'poly', ai: { t: 'dot', buff: 'toxin' },
  desc: (r, c) => `Injecte une toxine : ${f(P(c, 0.5, r) * 6)} dégâts de poison en 6 s, et la cible est ralentie de 30 %.`,
  run: (c, t, r) => { addBuff(t, 'toxin', c, { dur: 6, value: P(c, 0.5, r) }); burst(t.pos.x, t.pos.y + 1.2, t.pos.z, { count: 16, color: '#d0ff6a', speed: 2.5, life: 0.6 }); } });
SP({ id: 'as_embuscade', cls: 'assassin', spec: 'sp_ombres', talent: true, name: 'Embuscade', icon: ['shadowstep', '#ff7a98'], range: 22, cd: 10, cost: 8, anim: 'attack2', sound: 'crit', keepStealth: true, ai: { t: 'nuke' },
  canUse: (c) => !c.rooted, cantMsg: 'Vous êtes entravé.',
  desc: (r, c) => `Surgit dans le dos de la cible et la frappe : ${f(P(c, 2.2, r))} dégâts, avec +25 % de chances de critique.`,
  run: (c, t, r) => {
    burst(c.pos.x, c.pos.y + 1, c.pos.z, { count: 14, color: '#2a1a2a', color2: '#e05a78', speed: 3, life: 0.4 });
    const d = (t.radius || 0.5) + 1.1;
    const x = t.pos.x - Math.sin(t.ry) * d, z = t.pos.z - Math.cos(t.ry) * d;
    if (canWalk(t.pos.x, t.pos.z, x, z)) c.teleport(x, z);
    c.faceTo(t.pos.x, t.pos.z);
    dealDamage(c, t, P(c, 2.2, r), { skill: 'Embuscade', critBonus: 25 });
  } });
SP({ id: 'as_macabre', cls: 'assassin', spec: 'sp_ombres', talent: true, name: 'Danse macabre', icon: ['bladedance', '#a84a68'], target: 'self', cd: 20, cost: 10, anim: 'spin', animDur: 0.6, sound: 'whirl', ai: { t: 'aoe', r: 8 },
  desc: (r, c) => `Vous tournoyez entre vos ennemis : jusqu'à 5 cibles à 8 m subissent ${f(P(c, 1.8, r))} dégâts. Insensible 1 s.`,
  run: (c, t, r) => {
    const list = enemiesAround(c, c.pos.x, c.pos.z, 8, 5);
    if (t && t !== c && !list.includes(t) && !t.dead) list.unshift(t);
    for (const e of list.slice(0, 5)) { dealDamage(c, e, P(c, 1.8, r), { skill: 'Danse macabre' }); beam(chest(c), chest(e), '#e05a78', 0.2, 0.25); }
    addBuff(c, 'immune', c, { dur: 1 });
    shockRing(c.pos.x, c.pos.z, 8, '#e05a78', 0.35);
  } });

// --- Druide
SP({ id: 'd_croissance', cls: 'druide', spec: 'sp_dresto', talent: true, name: 'Croissance sauvage', buffs: ['wildgrowth'], icon: ['regrowth', '#d0ffb0'], target: 'self', cd: 10, cost: 14, school: 'nature', anim: 'raise', sound: 'heal', ai: { t: 'aoeheal', n: 2 },
  desc: (r, c) => `Jusqu'à 5 alliés blessés à 30 m récupèrent ${f(HP(c, 0.22, r) * 8)} points de vie en 8 s.`,
  run: (c, t, r) => {
    const list = alliesAround(c, c.pos.x, c.pos.z, 30).filter((a) => a.hp < a.stats.maxHp).sort((a, b) => a.hp / a.stats.maxHp - b.hp / b.stats.maxHp).slice(0, 5);
    if (!list.length) list.push(c);
    for (const a of list) { addBuff(a, 'wildgrowth', c, { dur: 8, value: HP(c, 0.22, r) }); burst(a.pos.x, a.pos.y + 1, a.pos.z, { count: 8, color: '#b0ff90', speed: 1.5, vy: 2, life: 0.8 }); }
  } });
SP({ id: 'd_arbre', cls: 'druide', spec: 'sp_dresto', talent: true, name: 'Arbre de vie', icon: ['tree', '#8fe86a'], target: 'self', cd: 120, gcd: false, school: 'nature', anim: 'raise', sound: 'heal', ai: { t: 'aoeheal', n: 3 },
  desc: (r, c) => `Pendant 15 s, vos soins sont 30 % plus puissants. Soigne aussitôt les alliés à 20 m de ${f(HP(c, 1.0, r))} points de vie.`,
  run: (c, t, r) => { addBuff(c, 'treeoflife', c, { dur: 15 }); for (const a of alliesAround(c, c.pos.x, c.pos.z, 20)) heal(c, a, HP(c, 1.0, r), { skill: 'Arbre de vie' }); pillar(c.pos.x, c.pos.y, c.pos.z, '#8fe86a', 45, 4); } });
SP({ id: 'd_lunaire', cls: 'druide', spec: 'sp_equilibre', talent: true, name: 'Éclat lunaire', buffs: ['moonfire'], icon: ['moon', '#c8b8ff'], range: 28, cost: 7, school: 'arcane', anim: 'cast', sound: 'spellhit', ai: { t: 'dot', buff: 'moonfire' },
  desc: (r, c) => `Un rayon de lune : ${f(P(c, 0.8, r))} dégâts arcaniques, puis ${f(P(c, 0.18, r) * 12)} en 12 s.`,
  run: (c, t, r) => { dealDamage(c, t, P(c, 0.8, r), { school: 'arcane', skill: 'Éclat lunaire' }); addBuff(t, 'moonfire', c, { dur: 12, value: P(c, 0.18, r) }); beam({ x: t.pos.x, y: t.pos.y + 18, z: t.pos.z }, chest(t), '#c8b8ff', 0.35, 0.4); } });
SP({ id: 'd_stellaire', cls: 'druide', spec: 'sp_equilibre', talent: true, name: 'Éruption stellaire', icon: ['starfall', '#c8b8ff'], target: 'ground', range: 28, cd: 20, cost: 18, school: 'arcane', anim: 'raise', sound: 'zap', ai: { t: 'aoe', r: 7 },
  desc: (r, c) => `Des étoiles s'abattent sur 7 m pendant 6 s : ${f(P(c, 0.55, r))} dégâts arcaniques par seconde.`,
  run: (c, t, r, x) => groundZone(c, x.pos.x, x.pos.z, 7, 6, 1, '#c8b8ff', (z) => {
    for (const e of enemiesAround(c, z.x, z.z, 7)) dealDamage(c, e, P(c, 0.55, r), { school: 'arcane', skill: 'Éruption stellaire', dot: true });
    for (let i = 0; i < 3; i++) { const gx = z.x + (Math.random() - 0.5) * 11, gz = z.z + (Math.random() - 0.5) * 11, gy = getHeight(gx, gz); beam({ x: gx + 3, y: gy + 16, z: gz - 2 }, { x: gx, y: gy, z: gz }, '#e0d8ff', 0.2, 1.4); }
  }) });
SP({ id: 'd_felin', cls: 'druide', spec: 'sp_sauvage', core: true, name: 'Forme féline', max: 1, noRank: true, icon: ['cat', '#e0b040'], target: 'self', cd: 1.5, gcd: false, noCombat: true, school: 'nature', anim: 'cast', sound: 'stealth', ai: { t: 'form', buff: 'catform' },
  desc: () => `Prend (ou quitte) la forme d'un grand félin : +25 % de vitesse de déplacement et +8 % de chances de critique.`,
  run: (c) => toggleForm(c, 'catform', '#e0b040') });
SP({ id: 'd_griffe', cls: 'druide', spec: 'sp_sauvage', core: true, specBasic: true, name: 'Griffure', icon: ['claw', '#e0b040'], anim: 'attack', sound: 'swing',
  desc: (r, c) => `Lacère la cible de vos griffes : ${f(P(c, 1.0, r))} dégâts.`,
  run: (c, t, r) => dealDamage(c, t, P(c, 1.0, r), { skill: 'Griffure' }) });
SP({ id: 'd_lacerer', cls: 'druide', spec: 'sp_sauvage', talent: true, name: 'Lacérer', buffs: ['rake'], icon: ['claw', '#ff9a3a'], cd: 6, cost: 6, anim: 'attack2', sound: 'swing', ai: { t: 'dot', buff: 'rake' },
  desc: (r, c) => `Griffe profondément : ${f(P(c, 0.7, r))} dégâts, puis ${f(P(c, 0.22, r) * 9)} dégâts de saignement en 9 s.`,
  run: (c, t, r) => { dealDamage(c, t, P(c, 0.7, r), { skill: 'Lacérer' }); addBuff(t, 'rake', c, { dur: 9, value: P(c, 0.22, r) }); } });
SP({ id: 'd_morsure', cls: 'druide', spec: 'sp_sauvage', talent: true, name: 'Morsure féroce', icon: ['bleed', '#ff5a3a'], cd: 12, cost: 10, anim: 'attack', sound: 'crit', ai: { t: 'nuke' },
  desc: (r, c) => `Morsure dévastatrice : ${f(P(c, 3.0, r))} dégâts, 50 % de plus si la cible saigne.`,
  run: (c, t, r) => { const k = hasBuff(t, 'rake') || hasBuff(t, 'bleed') ? 1.5 : 1; dealDamage(c, t, P(c, 3.0, r) * k, { skill: 'Morsure féroce' }); } });
SP({ id: 'd_ours', cls: 'druide', spec: 'sp_gardien', core: true, name: "Forme d'ours", max: 1, noRank: true, icon: ['bear', '#8a6440'], target: 'self', cd: 1.5, gcd: false, noCombat: true, school: 'nature', anim: 'roar', sound: 'howl', ai: { t: 'form', buff: 'bearform' },
  desc: () => `Prend (ou quitte) la forme d'un ours colossal : +120 % d'armure, +30 % de points de vie et +12 % d'esquive.`,
  run: (c) => toggleForm(c, 'bearform', '#8a6440') });
SP({ id: 'd_patte', cls: 'druide', spec: 'sp_gardien', core: true, specBasic: true, name: 'Coup de patte', icon: ['claw', '#8a6440'], anim: 'attack', sound: 'swing',
  desc: (r, c) => `Frappe puissante : ${f(P(c, 1.05, r))} dégâts. Génère beaucoup de menace.`,
  run: (c, t, r) => dealDamage(c, t, P(c, 1.05, r), { skill: 'Coup de patte', threatMul: 1.6 }) });
SP({ id: 'd_rugissement', cls: 'druide', spec: 'sp_gardien', core: true, name: 'Rugissement de défi', icon: ['shout', '#8a6440'], target: 'self', cd: 8, cost: 4, gcd: false, school: 'nature', anim: 'roar', sound: 'howl', ai: { t: 'taunt' },
  desc: () => `Force tous les ennemis à 10 m à vous attaquer pendant 3 s.`,
  run: (c) => { const l = enemiesAround(c, c.pos.x, c.pos.z, 10); taunt(c, l); for (const e of l) dealDamage(c, e, 1, { skill: 'Rugissement de défi', noCrit: true, silentText: true, threatMul: 30 }); shockRing(c.pos.x, c.pos.z, 10, '#c8a070', 0.5); } });
SP({ id: 'd_mutil', cls: 'druide', spec: 'sp_gardien', talent: true, name: 'Mutilation', icon: ['bleed', '#c8763a'], cd: 6, cost: 6, anim: 'attack2', sound: 'crit', ai: { t: 'nuke' },
  desc: (r, c) => `Assaut brutal : ${f(P(c, 1.5, r))} dégâts, avec une menace très élevée.`,
  run: (c, t, r) => dealDamage(c, t, P(c, 1.5, r), { skill: 'Mutilation', threatMul: 2.5 }) });
SP({ id: 'd_instincts', cls: 'druide', spec: 'sp_gardien', talent: true, name: 'Instincts de survie', icon: ['bear', '#ffd24a'], target: 'self', cd: 90, gcd: false, school: 'nature', anim: 'roar', sound: 'shield', ai: { t: 'defensive', hp: 0.4 },
  desc: () => `Pendant 12 s : −40 % de dégâts subis. Rend aussitôt 20 % de vos points de vie.`,
  run: (c) => { addBuff(c, 'instincts', c, { dur: 12 }); heal(c, c, c.stats.maxHp * 0.2, { noCrit: true, skill: 'Instincts de survie' }); pillar(c.pos.x, c.pos.y, c.pos.z, '#8fe86a', 30, 3); } });

// --- Chaman
SP({ id: 'c_vague', cls: 'chaman', spec: 'sp_cresto', talent: true, name: 'Vague vive', buffs: ['riptide'], icon: ['wave', '#bff0ff'], target: 'ally', range: 30, cd: 6, cost: 8, school: 'nature', anim: 'cast', sound: 'heal', ai: { t: 'hot', buff: 'riptide', hp: 0.8 },
  desc: (r, c) => `Soin instantané de ${f(HP(c, 1.3, r))} points de vie, puis ${f(HP(c, 0.22, r) * 9)} de plus en 9 s.`,
  run: (c, t, r) => { heal(c, t, HP(c, 1.3, r), { skill: 'Vague vive' }); addBuff(t, 'riptide', c, { dur: 9, value: HP(c, 0.22, r) }); pillar(t.pos.x, t.pos.y, t.pos.z, '#8fe0ff', 14, 2); } });
SP({ id: 'c_totem_maree', cls: 'chaman', spec: 'sp_cresto', talent: true, name: 'Totem de marée', icon: ['totemheal', '#6fffe0'], target: 'self', cd: 90, cost: 12, school: 'nature', anim: 'raise', sound: 'heal', ai: { t: 'aoeheal', n: 3 },
  desc: (r, c) => `Plante un totem (12 s) : toutes les 2 s, les alliés à 15 m récupèrent ${f(HP(c, 0.6, r))} points de vie.`,
  run: (c, t, r) => spawnTotem(c, { kind: 'maree', dur: 12, tick: 2, color: '#6fffe0', fn: (T) => {
    for (const a of alliesAround(c, T.x, T.z, 15)) heal(c, a, HP(c, 0.6, r), { tick: true, skill: 'Totem de marée' });
    shockRing(T.x, T.z, 15, '#6fffe0', 0.4);
  } }) });
SP({ id: 'c_lave', cls: 'chaman', spec: 'sp_elem', talent: true, name: 'Explosion de lave', buffs: ['burn'], icon: ['lava', '#ff7a2a'], range: 30, cast: 1.5, cd: 8, cost: 10, school: 'fire', anim: 'cast', sound: 'fire', ai: { t: 'nuke' },
  desc: (r, c) => `Projette de la lave : ${f(P(c, 2.4, r))} dégâts de feu, puis ${f(P(c, 0.15, r) * 6)} de brûlure en 6 s. Incantation 1,5 s.`,
  run: (c, t, r) => projectile(c, t, 'bigfire', () => { dealDamage(c, t, P(c, 2.4, r), { school: 'fire', skill: 'Explosion de lave' }); addBuff(t, 'burn', c, { dur: 6, value: P(c, 0.15, r) }); }, 30) });
SP({ id: 'c_foudre', cls: 'chaman', spec: 'sp_elem', talent: true, name: 'Tempête de foudre', icon: ['tempest', '#bfe8ff'], target: 'ground', range: 30, cd: 18, cost: 16, school: 'lightning', anim: 'raise', sound: 'zap', ai: { t: 'aoe', r: 8 },
  desc: (r, c) => `Trois éclairs s'abattent sur 8 m : ${f(P(c, 1.2, r))} dégâts de foudre chacun.`,
  run: (c, t, r, x) => {
    const px = x.pos.x, pz = x.pos.z;
    for (let i = 0; i < 3; i++) after(0.05 + i * 0.45, () => {
      if (c.dead) return;
      const gy = getHeight(px, pz);
      beam({ x: px + (Math.random() - 0.5) * 4, y: gy + 26, z: pz + (Math.random() - 0.5) * 4 }, { x: px, y: gy, z: pz }, '#e0f4ff', 0.45, 2.5);
      for (const e of enemiesAround(c, px, pz, 8)) dealDamage(c, e, P(c, 1.2, r), { school: 'lightning', skill: 'Tempête de foudre' });
      shockRing(px, pz, 8, '#bfe8ff', 0.3); if (G.sky) G.sky.flash = 0.2;
    });
  } });
SP({ id: 'c_frappe', cls: 'chaman', spec: 'sp_amelio', core: true, specBasic: true, name: 'Frappe tempête', icon: ['arc', '#9fe8ff'], school: 'lightning', anim: 'attack', sound: 'zap',
  desc: (r, c) => `Frappe chargée de foudre : ${f(P(c, 1.05, r))} dégâts de foudre.`,
  run: (c, t, r) => { dealDamage(c, t, P(c, 1.05, r), { school: 'lightning', skill: 'Frappe tempête' }); burst(t.pos.x, t.pos.y + 1, t.pos.z, { count: 6, color: '#bfe8ff', speed: 3, life: 0.3 }); } });
SP({ id: 'c_lame', cls: 'chaman', spec: 'sp_amelio', talent: true, name: 'Lame de lave', buffs: ['burn'], icon: ['lava', '#ffb040'], cd: 7, cost: 7, school: 'fire', anim: 'attack2', sound: 'fire', ai: { t: 'nuke' },
  desc: (r, c) => `Votre arme s'embrase : ${f(P(c, 1.8, r))} dégâts de feu, puis ${f(P(c, 0.12, r) * 6)} de brûlure en 6 s.`,
  run: (c, t, r) => { dealDamage(c, t, P(c, 1.8, r), { school: 'fire', skill: 'Lame de lave' }); addBuff(t, 'burn', c, { dur: 6, value: P(c, 0.12, r) }); burst(t.pos.x, t.pos.y + 1, t.pos.z, { count: 12, color: '#ffb040', color2: '#ff3a0a', speed: 4, life: 0.4 }); } });
SP({ id: 'c_loups', cls: 'chaman', spec: 'sp_amelio', talent: true, name: 'Loups spectraux', icon: ['wolf', '#9fe8ff'], target: 'self', cd: 60, cost: 12, school: 'nature', anim: 'raise', sound: 'howl', ai: { t: 'buff' },
  desc: () => `Deux loups spectraux surgissent à vos côtés et combattent pendant 20 s.`,
  run: (c) => { for (let i = 0; i < 2; i++) Pets.summonMinion(c, 'loup_esprit', { dur: 20, hp: 0.4, dmg: 0.45 }); } });

// =============================== COMMUNES ===============================
S({ id: 'x_rappel', cls: '*', name: 'Rappel', lvl: 1, max: 1, icon: ['hearth', '#7fb8ff'], target: 'self', channel: 6, tick: 1, cd: 300, cost: 0, school: 'arcane', anim: 'channel', common: true, noRank: true,
  desc: () => `Canalise 6 s pour revenir à votre point de rappel (votre sanctuaire, ou la cité choisie auprès d'un chef). Recharge 5 min.`,
  onTick: (c) => burst(c.pos.x, c.pos.y + 0.2, c.pos.z, { count: 8, color: '#7fb8ff', speed: 1, vy: 3, life: 0.8 }),
  onEnd: (c) => G.world.recall(c),
  run: () => {} });
S({ id: 'x_monture', cls: '*', name: 'Monture', lvl: 10, max: 1, icon: ['mount', '#c8a060'], target: 'self', cast: 1.5, cd: 2, cost: 0, anim: 'cast', common: true, noRank: true, gcd: false, mountOk: true,
  canUse: (c) => c.hasMount && !c.inCombat() && (c.mounted || !isInstancePoint(c.pos.x, c.pos.z)), cantMsg: 'Impossible ici (combat, donjon ou pas de monture).',
  desc: () => `Invoque ou renvoie votre monture (+65 % de vitesse). Nécessite une monture achetée à l'écurie. Monture volante (niveau 30) : Espace pour décoller et monter, X pour descendre.`,
  run: (c) => { if (c.mounted) c.dismount(); else c.mount(); } });

function projectileFall(x, gy, z) {
  const from = { x: x + 6, y: gy + 30, z: z - 4 };
  fxProjectile({ from, target: { x, y: gy, z }, kind: 'bigfire', speed: 34 });
}

// Icônes peintes : chaque compétence qui en a une l'utilise ; un effet qui porte le nom d'une compétence reprend son icône.
for (const s of SKILLS) if (PAINTED['sk_' + s.id]) s.icon = ['sk_' + s.id, s.icon[1]];
{
  const byName = new Map();
  for (const s of SKILLS) if (s.icon[0].startsWith('sk_') && !byName.has(s.name)) byName.set(s.name, s.icon);
  for (const b of Object.values(BUFFS)) { const ic = byName.get(b.name); if (ic && b.icon) b.icon = [ic[0], b.icon[1]]; }
}
export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s]));
export function classSkills(cls) {
  return SKILLS.filter((s) => s.cls === cls && !s.spec);
}
export function specSkills(spec) {
  return SKILLS.filter((s) => s.spec === spec);
}
export const COMMON_SKILLS = SKILLS.filter((s) => s.cls === '*');
