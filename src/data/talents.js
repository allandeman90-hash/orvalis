// Arbres de talents : un arbre par spécialisation, 7 paliers (4 points dépensés dans l'arbre débloquent le palier suivant).
// Nœud : [palier, colonne, id, nom, rangs max, icône, effets par rang, options]
// Effets : dmg, heal, hp, mp, armor, crit (pts), critDmg, haste, dodge (pts), block (pts), speed, leech, regen, mana,
//          taken, threat, execute, dot, hot, absorb, pet, lowhp, et sk: { idCompétence: { dmg, cd, cost, cast, crit } }.
// Options : { req: id du nœud prérequis (au rang max), ability: compétence apprise }.
export const TIER_PTS = 4;
export const TREES = {};

function T(spec, list) {
  TREES[spec] = list.map(([row, col, id, name, max, icon, fx, o = {}]) => ({ spec, row, col, id, name, max, icon, fx: fx || null, ...o }));
}
const A = (row, col, id, skill) => [row, col, id, null, 1, null, null, { ability: skill }];

// =============================== GUERRIER ===============================
T('sp_armes', [
  [0, 1, 'lames', 'Lames aiguisées', 5, ['sword', '#b5452a'], { dmg: 0.015 }],
  [0, 2, 'precision', 'Précision martiale', 3, ['aim', '#b5452a'], { crit: 1 }],
  [1, 0, 'plaie', 'Plaies profondes', 3, ['bleed', '#b5452a'], { sk: { g_entaille: { dmg: 0.15 } } }],
  [1, 2, 'elan', 'Élan', 2, ['charge', '#b5452a'], { sk: { g_charge: { cd: -2 } } }],
  A(2, 1, 'mortelle', 'g_mortelle'),
  [2, 3, 'brise', 'Brise-armure affûté', 3, ['sunder', '#b5452a'], { sk: { g_brise: { dmg: 0.1, cd: -1 } } }],
  [3, 0, 'soif', 'Soif de bataille', 3, ['drain', '#b5452a'], { leech: 0.01 }, { req: 'plaie' }],
  [3, 2, 'vicieux', 'Coups vicieux', 2, ['stun', '#b5452a'], { critDmg: 0.1 }],
  [4, 1, 'mortelle2', 'Frappe mortelle affûtée', 2, ['bleed', '#d06040'], { sk: { g_mortelle: { dmg: 0.12, cd: -1 } } }, { req: 'mortelle' }],
  [4, 3, 'tourbi', "Tourbillon d'acier", 3, ['whirl', '#b5452a'], { sk: { g_tourbillon: { dmg: 0.12 } } }],
  [5, 0, 'carnage', 'Carnage', 3, ['execute', '#b5452a'], { execute: 0.08 }],
  [5, 2, 'resolution', 'Résolution', 2, ['heart', '#b5452a'], { hp: 0.03 }],
  A(6, 1, 'colosse', 'g_colosse'),
]);
T('sp_furie', [
  [0, 1, 'colere', 'Colère croissante', 5, ['titan', '#d0402a'], { haste: 0.015 }],
  [0, 2, 'brutal', 'Brutalité', 3, ['sword', '#d0402a'], { dmg: 0.015 }],
  [1, 0, 'furieuse', 'Frappe furieuse', 3, ['sword', '#e05a3a'], { sk: { g_frappe: { dmg: 0.1 } } }],
  [1, 2, 'vigueur', 'Vigueur sanglante', 3, ['drain', '#d0402a'], { leech: 0.01 }],
  A(2, 1, 'sang', 'g_sang'),
  [2, 3, 'tourbi', 'Tourbillon enragé', 3, ['whirl', '#d0402a'], { sk: { g_tourbillon: { dmg: 0.1, cd: -0.5 } } }],
  [3, 0, 'instinct', 'Instinct du carnage', 3, ['frenzy', '#d0402a'], { crit: 1.5 }, { req: 'furieuse' }],
  [3, 2, 'bond', 'Bond implacable', 2, ['leap', '#d0402a'], { sk: { g_bond: { cd: -3, dmg: 0.1 } } }],
  [4, 1, 'sang2', 'Soif de sang', 2, ['drain', '#ff5a3a'], { sk: { g_sang: { dmg: 0.15 } } }, { req: 'sang' }],
  [4, 3, 'titan', 'Titan déchaîné', 3, ['titan', '#e04040'], { sk: { g_titan: { cd: -10 } } }],
  [5, 0, 'sansfin', 'Fureur sans fin', 3, ['shout', '#d0402a'], { dmg: 0.02 }],
  [5, 2, 'cuir', 'Peau de cuir', 2, ['shieldwall', '#d0402a'], { taken: -0.02 }],
  A(6, 1, 'berserk', 'g_berserk'),
]);
T('sp_rempart', [
  [0, 1, 'robuste', 'Robustesse', 5, ['heart', '#7a8aa0'], { hp: 0.02 }],
  [0, 2, 'defense', 'Défense', 3, ['shieldwall', '#7a8aa0'], { armor: 0.04 }],
  [1, 0, 'bouclier', 'Maîtrise du bouclier', 3, ['bash', '#7a8aa0'], { block: 3 }],
  [1, 2, 'heurt', 'Heurt amélioré', 2, ['bash', '#9aa2ae'], { sk: { g_heurt: { cd: -2, dmg: 0.1 } } }],
  A(2, 1, 'tonnerre', 'g_tonnerre'),
  [2, 3, 'mur', 'Mur imprenable', 3, ['shieldwall', '#c9ced6'], { sk: { g_mur: { cd: -4 } } }],
  [3, 0, 'autorite', 'Autorité', 3, ['challenge', '#7a8aa0'], { threat: 0.1 }, { req: 'bouclier' }],
  [3, 2, 'brise', 'Brise-armure lourd', 2, ['sunder', '#7a8aa0'], { sk: { g_brise: { dmg: 0.15 } } }],
  [4, 1, 'tonnerre2', 'Tonnerre grondant', 2, ['storm', '#9aa2ae'], { sk: { g_tonnerre: { dmg: 0.15, cd: -1 } } }, { req: 'tonnerre' }],
  [4, 3, 'souffle', 'Dernier souffle', 3, ['heal', '#e04040'], { sk: { g_souffle: { cd: -10 } } }],
  [5, 0, 'inebranlable', 'Inébranlable', 3, ['rampart', '#7a8aa0'], { lowhp: -0.05 }],
  [5, 2, 'garde', 'Garde vigilante', 2, ['rampart', '#d9a441'], { taken: -0.02 }],
  A(6, 1, 'dernier', 'g_dernier'),
]);

// =============================== TEMPLIER ===============================
T('sp_lumiere', [
  [0, 1, 'illumination', 'Illumination', 5, ['lightheal', '#f0c850'], { heal: 0.02 }],
  [0, 2, 'sagesse', 'Sagesse divine', 3, ['meditate', '#f0c850'], { mp: 0.04 }],
  [1, 0, 'rapide', 'Lumière rapide', 3, ['lightheal', '#ffe68a'], { sk: { t_lumiere: { cast: -0.08 } } }],
  [1, 2, 'egide', 'Égide renforcée', 3, ['aegis', '#f0c850'], { absorb: 0.1 }],
  A(2, 1, 'aube', 't_aube'),
  [2, 3, 'foi', 'Foi ardente', 3, ['fervor', '#f0c850'], { crit: 1.5 }],
  [3, 0, 'pure', 'Lumière pure', 3, ['lightheal', '#fff4c8'], { sk: { t_lumiere: { dmg: 0.08 } } }, { req: 'rapide' }],
  [3, 2, 'voile', 'Voile béni', 2, ['veil', '#f0c850'], { sk: { t_voile: { cd: -8 } } }],
  [4, 1, 'aube2', 'Aube radieuse', 2, ['dawn', '#ffe68a'], { sk: { t_aube: { dmg: 0.12, cd: -1 } } }, { req: 'aube' }],
  [4, 3, 'meditation', 'Méditation sacrée', 3, ['meditate', '#ffe68a'], { mana: 0.15 }],
  [5, 0, 'continue', 'Bénédiction continue', 3, ['seal', '#f0c850'], { hot: 0.1 }],
  [5, 2, 'martyr', 'Martyr', 2, ['faithwall', '#f0c850'], { taken: -0.03 }],
  A(6, 1, 'rayon', 't_rayon'),
]);
T('sp_bastion', [
  [0, 1, 'robuste', 'Robustesse sacrée', 5, ['heart', '#d9a441'], { hp: 0.02 }],
  [0, 2, 'plaques', 'Plaques bénies', 3, ['faithwall', '#d9a441'], { armor: 0.04 }],
  [1, 0, 'sol', 'Sol consacré', 3, ['hallow', '#d9a441'], { sk: { t_sol: { dmg: 0.12 } } }],
  [1, 2, 'defi', 'Défi fervent', 2, ['challenge', '#d9a441'], { sk: { t_defi: { cd: -2 } } }],
  A(2, 1, 'vengeur', 't_vengeur'),
  [2, 3, 'egide', 'Égide personnelle', 3, ['aegis', '#d9a441'], { absorb: 0.1 }],
  [3, 0, 'autorite', 'Autorité divine', 3, ['seal', '#d9a441'], { threat: 0.1 }, { req: 'sol' }],
  [3, 2, 'blocage', 'Blocage sacré', 3, ['aegis', '#fff4c8'], { block: 3 }],
  [4, 1, 'vengeur2', 'Bouclier ricochant', 2, ['aegis', '#ffe68a'], { sk: { t_vengeur: { dmg: 0.15, cd: -1 } } }, { req: 'vengeur' }],
  [4, 3, 'rempart', 'Rempart de foi amélioré', 2, ['faithwall', '#ffe68a'], { sk: { t_rempart: { cd: -10 } } }],
  [5, 0, 'inebranlable', 'Inébranlable', 3, ['rampart', '#d9a441'], { lowhp: -0.05 }],
  [5, 2, 'onde', 'Onde de ferveur accrue', 2, ['fervor', '#d9a441'], { sk: { t_onde: { dmg: 0.12 } } }],
  A(6, 1, 'gardien', 't_gardien'),
]);
T('sp_chatiment', [
  [0, 1, 'arme', 'Arme bénie', 5, ['dawn', '#f0a030'], { dmg: 0.015 }],
  [0, 2, 'ferveur', 'Ferveur', 3, ['fervor', '#f0a030'], { crit: 1 }],
  [1, 0, 'jugement', 'Jugement affûté', 3, ['judge', '#f0a030'], { sk: { t_jugement: { dmg: 0.12, cd: -1 } } }],
  [1, 2, 'aube', "Coup d'aube vif", 3, ['dawn', '#ffc860'], { sk: { t_coup: { dmg: 0.08 } } }],
  A(2, 1, 'tempete', 't_tempete'),
  [2, 3, 'verdict', 'Verdict implacable', 3, ['verdict', '#f0a030'], { sk: { t_verdict: { dmg: 0.1 } } }],
  [3, 0, 'sceau', 'Sceau de vengeance', 3, ['seal', '#f0a030'], { critDmg: 0.08 }, { req: 'jugement' }],
  [3, 2, 'celerite', 'Célérité sacrée', 2, ['ascend', '#f0a030'], { haste: 0.02 }],
  [4, 1, 'tempete2', 'Tempête prolongée', 2, ['fervor', '#ffc860'], { sk: { t_tempete: { dmg: 0.15, cd: -1 } } }, { req: 'tempete' }],
  [4, 3, 'ascension', 'Ascension zélée', 2, ['ascend', '#ffe68a'], { sk: { t_ascension: { cd: -15 } } }],
  [5, 0, 'executeur', 'Exécuteur de la lumière', 3, ['judge', '#ff8a3a'], { execute: 0.08 }],
  [5, 2, 'vitalite', 'Vitalité', 2, ['heart', '#f0a030'], { hp: 0.03 }],
  A(6, 1, 'final', 't_final'),
]);

// =============================== MAGE ===============================
T('sp_feu', [
  [0, 1, 'interieur', 'Feu intérieur', 5, ['fire', '#ff7a2a'], { dmg: 0.015 }],
  [0, 2, 'etincelle', 'Étincelle', 3, ['fire', '#ffb040'], { crit: 1 }],
  [1, 0, 'trait', 'Trait brûlant', 3, ['fire', '#ff9a3a'], { sk: { m_trait: { dmg: 0.1, cast: -0.05 } } }],
  [1, 2, 'pluie', 'Pluie ardente', 3, ['firerain', '#ff7a2a'], { sk: { m_pluie: { dmg: 0.12 } } }],
  A(2, 1, 'pyro', 'm_pyro'),
  [2, 3, 'meteore', 'Météore dévastateur', 3, ['meteor', '#ff7a2a'], { sk: { m_meteore: { dmg: 0.08, cd: -2 } } }],
  [3, 0, 'brulure', 'Brûlure persistante', 3, ['fire', '#e05a1a'], { dot: 0.1 }, { req: 'trait' }],
  [3, 2, 'critique', 'Critique enflammé', 2, ['nova', '#ffb040'], { critDmg: 0.1 }],
  [4, 1, 'pyro2', 'Pyroexplosion maîtrisée', 2, ['meteor', '#ffb040'], { sk: { m_pyro: { dmg: 0.1, cast: -0.1 } } }, { req: 'pyro' }],
  [4, 3, 'celerite', 'Célérité ardente', 3, ['blink', '#ff7a2a'], { haste: 0.02 }],
  [5, 0, 'maitre', 'Maître du feu', 3, ['firerain', '#ff5a1a'], { dmg: 0.02 }],
  [5, 2, 'flammes', 'Bouclier de flammes', 2, ['ashield', '#ff7a2a'], { absorb: 0.15 }],
  A(6, 1, 'inferno', 'm_inferno'),
]);
T('sp_givre', [
  [0, 1, 'mordant', 'Froid mordant', 5, ['frost', '#8fd8ff'], { dmg: 0.015 }],
  [0, 2, 'armure', 'Armure de givre', 3, ['ice', '#8fd8ff'], { armor: 0.05 }],
  [1, 0, 'eclair', 'Éclair glacial', 3, ['frost', '#bfeaff'], { sk: { m_givre: { dmg: 0.1, cast: -0.05 } } }],
  [1, 2, 'nova', 'Nova rapide', 2, ['nova', '#8fd8ff'], { sk: { m_nova: { cd: -2 } } }],
  A(2, 1, 'blizzard', 'm_blizzard'),
  [2, 3, 'lance', 'Lance acérée', 3, ['ice', '#dff6ff'], { sk: { m_lance: { dmg: 0.12 } } }],
  [3, 0, 'briseglace', 'Brise-glace', 3, ['ice', '#8fd8ff'], { critDmg: 0.1 }, { req: 'eclair' }],
  [3, 2, 'coeur', 'Cœur de glace', 2, ['heart', '#8fd8ff'], { hp: 0.03 }],
  [4, 1, 'blizzard2', 'Blizzard mordant', 2, ['frost', '#dff6ff'], { sk: { m_blizzard: { dmg: 0.15, cd: -1 } } }, { req: 'blizzard' }],
  [4, 3, 'givre', 'Givre durable', 3, ['ashield', '#8fd8ff'], { absorb: 0.12 }],
  [5, 0, 'hiver', 'Hiver sans fin', 3, ['nova', '#bfeaff'], { dmg: 0.02 }],
  [5, 2, 'transfert', 'Transfert rapide', 2, ['blink', '#8fd8ff'], { sk: { m_transfert: { cd: -3 } } }],
  A(6, 1, 'comete', 'm_comete'),
]);
T('sp_arcanes', [
  [0, 1, 'esprit', 'Esprit vif', 5, ['overload', '#d49aff'], { dmg: 0.015 }],
  [0, 2, 'reserves', 'Réserves arcaniques', 3, ['meditate', '#d49aff'], { mp: 0.04 }],
  [1, 0, 'chaine', 'Chaîne amplifiée', 3, ['chain', '#d49aff'], { sk: { m_chaine: { dmg: 0.1 } } }],
  [1, 2, 'meditation', 'Méditation profonde', 2, ['meditate', '#b58cff'], { sk: { m_meditation: { cd: -10 } } }],
  A(2, 1, 'missiles', 'm_missiles'),
  [2, 3, 'surcharge', 'Surcharge maîtrisée', 2, ['overload', '#b58cff'], { sk: { m_surcharge: { cd: -15 } } }],
  [3, 0, 'precision', 'Précision arcanique', 3, ['aim', '#d49aff'], { crit: 1.5 }, { req: 'chaine' }],
  [3, 2, 'celerite', 'Célérité', 3, ['blink', '#d49aff'], { haste: 0.02 }],
  [4, 1, 'missiles2', 'Projectiles amplifiés', 2, ['overload', '#f0d8ff'], { sk: { m_missiles: { dmg: 0.12 } } }, { req: 'missiles' }],
  [4, 3, 'bouclier', 'Bouclier arcanique renforcé', 3, ['ashield', '#d49aff'], { absorb: 0.12 }],
  [5, 0, 'pure', 'Puissance pure', 3, ['nova', '#d49aff'], { dmg: 0.02 }],
  [5, 2, 'economie', 'Économie arcanique', 2, ['meditate', '#7fb8ff'], { mana: 0.15 }],
  A(6, 1, 'distorsion', 'm_distorsion'),
]);

// =============================== NÉCROMANCIEN ===============================
T('sp_fleau', [
  [0, 1, 'tenebres', 'Ténèbres', 5, ['necrobolt', '#8a7ab8'], { dmg: 0.015 }],
  [0, 2, 'contagion', 'Contagion', 3, ['blight', '#8a7ab8'], { dot: 0.05 }],
  [1, 0, 'fletrissure', 'Flétrissure vorace', 3, ['blight', '#6a8a3a'], { sk: { n_fletrir: { dmg: 0.12 } } }],
  [1, 2, 'siphon', 'Siphon avide', 3, ['siphon', '#8a7ab8'], { sk: { n_siphon: { dmg: 0.1 } } }],
  A(2, 1, 'peste', 'n_peste'),
  [2, 3, 'malediction', 'Malédiction tenace', 2, ['curse', '#8a7ab8'], { sk: { n_malediction: { cd: -3 } } }],
  [3, 0, 'ame', 'Âme noire', 3, ['wail', '#8a7ab8'], { crit: 1.5 }, { req: 'fletrissure' }],
  [3, 2, 'vol', 'Vitalité volée', 2, ['drain', '#8a7ab8'], { leech: 0.01 }],
  [4, 1, 'peste2', 'Peste virulente', 2, ['blight', '#9ae040'], { sk: { n_peste: { dmg: 0.15 } } }, { req: 'peste' }],
  [4, 3, 'deflagration', 'Déflagration sombre', 3, ['necroblast', '#8a7ab8'], { sk: { n_deflagration: { dmg: 0.12 } } }],
  [5, 0, 'maitre', 'Maître des fléaux', 3, ['blight', '#b58cff'], { dot: 0.05 }],
  [5, 2, 'liche', 'Liche précoce', 2, ['lich', '#8a7ab8'], { sk: { n_liche: { cd: -15 } } }],
  A(6, 1, 'moisson', 'n_moisson'),
]);
T('sp_legion', [
  [0, 1, 'os', 'Os renforcés', 5, ['skeleton', '#a8a4d8'], { pet: 0.05 }],
  [0, 2, 'necromancie', 'Nécromancie', 3, ['necrobolt', '#a8a4d8'], { dmg: 0.015 }],
  [1, 0, 'releve', 'Relève rapide', 2, ['skeleton', '#e6dfcd'], { sk: { n_squelette: { cast: -0.25, cd: -1 } } }],
  [1, 2, 'golem', 'Golem robuste', 3, ['golem', '#a8a4d8'], { sk: { n_golem: { cd: -8 } } }],
  A(2, 1, 'magesq', 'n_magesq'),
  [2, 3, 'chair', 'Chair et os', 3, ['legion', '#a8a4d8'], { pet: 0.05 }],
  [3, 0, 'legion', 'Légion étendue', 3, ['legion', '#e6dfcd'], { sk: { n_legion: { cd: -15 } } }, { req: 'releve' }],
  [3, 2, 'lien', 'Lien sombre', 2, ['drain', '#a8a4d8'], { leech: 0.01 }],
  [4, 1, 'magesq2', 'Maître des mages', 2, ['lich', '#6affc0'], { sk: { n_magesq: { cd: -8 } }, pet: 0.03 }, { req: 'magesq' }],
  [4, 3, 'dard', 'Dard nécrotique vif', 3, ['necrobolt', '#b58cff'], { sk: { n_dard: { dmg: 0.08, cast: -0.05 } } }],
  [5, 0, 'commandement', 'Commandement', 3, ['skull', '#a8a4d8'], { pet: 0.05 }],
  [5, 2, 'protection', "Protection d'os", 2, ['bonearmor', '#a8a4d8'], { absorb: 0.12 }],
  A(6, 1, 'armee', 'n_armee'),
]);
T('sp_ossuaire', [
  [0, 1, 'epais', 'Os épais', 5, ['bonearmor', '#e6dfcd'], { armor: 0.05 }],
  [0, 2, 'moelle', 'Moelle vivace', 3, ['heart', '#e6dfcd'], { hp: 0.03 }],
  [1, 0, 'armure', "Armure d'os renforcée", 3, ['bonearmor', '#cfc6b0'], { sk: { n_os: { cd: -4 } }, absorb: 0.05 }],
  [1, 2, 'siphon', 'Siphon vital accru', 3, ['siphon', '#e6dfcd'], { sk: { n_siphon: { dmg: 0.12 } } }],
  A(2, 1, 'marche', 'n_marche'),
  [2, 3, 'autorite', 'Autorité morbide', 3, ['wail', '#e6dfcd'], { threat: 0.1 }],
  [3, 0, 'carapace', 'Carapace', 3, ['bonearmor', '#a8a4d8'], { taken: -0.02 }, { req: 'armure' }],
  [3, 2, 'vampire', 'Vampirisme', 3, ['drain', '#e6dfcd'], { leech: 0.01 }],
  [4, 1, 'marche2', 'Marche funeste', 2, ['necroblast', '#e6dfcd'], { sk: { n_marche: { dmg: 0.15 } } }, { req: 'marche' }],
  [4, 3, 'hurlement', 'Hurlement terrifiant', 2, ['wail', '#cfc6b0'], { sk: { n_hurlement: { cd: -4 } } }],
  [5, 0, 'inebranlable', 'Inébranlable', 3, ['skull', '#e6dfcd'], { lowhp: -0.05 }],
  [5, 2, 'faux', 'Faux sanglante', 2, ['reap', '#e6dfcd'], { sk: { n_faux: { dmg: 0.12 } } }],
  A(6, 1, 'pacte', 'n_pacte'),
]);

// =============================== ARCHER ===============================
T('sp_precision', [
  [0, 1, 'visee', 'Visée stable', 5, ['aim', '#e0c060'], { dmg: 0.015 }],
  [0, 2, 'oeil', 'Œil perçant', 3, ['hawk', '#e0c060'], { crit: 1 }],
  [1, 0, 'vise', 'Tir visé rapide', 3, ['aim', '#f0d880'], { sk: { a_vise: { cast: -0.1 } } }],
  [1, 2, 'vise2', 'Tir visé mortel', 3, ['arrow', '#e0c060'], { sk: { a_vise: { dmg: 0.1 } } }],
  A(2, 1, 'puissant', 'a_puissant'),
  [2, 3, 'faucon', 'Faucon patient', 2, ['hawk', '#f0d880'], { sk: { a_faucon: { cd: -8 } } }],
  [3, 0, 'balistique', 'Balistique', 3, ['pierce', '#e0c060'], { critDmg: 0.1 }, { req: 'vise' }],
  [3, 2, 'perforation', 'Perforation', 2, ['pierce', '#f0d880'], { sk: { a_perforant: { dmg: 0.12 } } }],
  [4, 1, 'puissant2', 'Tir puissant maîtrisé', 2, ['arrow', '#ffe68a'], { sk: { a_puissant: { dmg: 0.08, cast: -0.1 } } }, { req: 'puissant' }],
  [4, 3, 'deluge', 'Déluge prolongé', 2, ['deluge', '#e0c060'], { sk: { a_deluge: { cd: -15 } } }],
  [5, 0, 'grace', 'Coup de grâce', 3, ['execute', '#e0c060'], { execute: 0.08 }],
  [5, 2, 'reflexes', 'Réflexes', 2, ['disengage', '#e0c060'], { dodge: 2 }],
  A(6, 1, 'mortel', 'a_mortel'),
]);
T('sp_survie', [
  [0, 1, 'chasseur', 'Chasseur', 5, ['arrow', '#9acd6a'], { dmg: 0.015 }],
  [0, 2, 'toxines', 'Toxines', 3, ['poison', '#9acd6a'], { dot: 0.05 }],
  [1, 0, 'poison', 'Flèche virulente', 3, ['poison', '#b6e04a'], { sk: { a_poison: { dmg: 0.12 } } }],
  [1, 2, 'pieges', 'Pièges rapides', 2, ['trap', '#9acd6a'], { sk: { a_piege: { cd: -4 } } }],
  A(2, 1, 'explosif', 'a_explosif'),
  [2, 3, 'salve', 'Salve nourrie', 3, ['volley', '#9acd6a'], { sk: { a_salve: { dmg: 0.1 } } }],
  [3, 0, 'venin', 'Venin concentré', 3, ['poison', '#6aa03a'], { dot: 0.05 }, { req: 'poison' }],
  [3, 2, 'pluie', 'Pluie drue', 3, ['arrowrain', '#9acd6a'], { sk: { a_pluie: { dmg: 0.12 } } }],
  [4, 1, 'explosif2', 'Explosifs artisanaux', 2, ['trap', '#ff9a3a'], { sk: { a_explosif: { dmg: 0.15, cd: -1 } } }, { req: 'explosif' }],
  [4, 3, 'bond', 'Bond agile', 2, ['disengage', '#9acd6a'], { sk: { a_bond: { cd: -3 } } }],
  [5, 0, 'esquive', 'Esquive du rôdeur', 3, ['camo', '#9acd6a'], { dodge: 1.5 }],
  [5, 2, 'endurance', 'Endurance', 2, ['heart', '#9acd6a'], { hp: 0.03 }],
  A(6, 1, 'nuee', 'a_nuee'),
]);
T('sp_meute', [
  [0, 1, 'dressage', 'Dressage', 5, ['pack', '#c8a060'], { pet: 0.05 }],
  [0, 2, 'nerveux', 'Tir nerveux', 3, ['arrow', '#c8a060'], { sk: { a_tir: { dmg: 0.08 } } }],
  [1, 0, 'crocs', 'Crocs aiguisés', 3, ['bleed', '#c8a060'], { pet: 0.04 }],
  [1, 2, 'poison', 'Poison de meute', 3, ['poison', '#c8a060'], { sk: { a_poison: { dmg: 0.1 } } }],
  A(2, 1, 'ordre', 'a_ordre'),
  [2, 3, 'instinct', 'Instinct partagé', 3, ['hawk', '#c8a060'], { crit: 1 }],
  [3, 0, 'ferocite', 'Férocité', 3, ['frenzy', '#c8a060'], { pet: 0.05 }, { req: 'crocs' }],
  [3, 2, 'salve', 'Salve de chasse', 2, ['volley', '#c8a060'], { sk: { a_salve: { dmg: 0.1 } } }],
  [4, 1, 'ordre2', 'Ordre impérieux', 2, ['shout', '#e0c060'], { sk: { a_ordre: { cd: -3 } } }, { req: 'ordre' }],
  [4, 3, 'endurance', 'Endurance de la meute', 3, ['heart', '#c8a060'], { hp: 0.02 }],
  [5, 0, 'maitre', 'Maître des bêtes', 3, ['pack', '#e0c060'], { pet: 0.05, dmg: 0.01 }],
  [5, 2, 'deluge', 'Déluge sauvage', 2, ['deluge', '#c8a060'], { sk: { a_deluge: { cd: -15 } } }],
  A(6, 1, 'bete', 'a_bete'),
]);

// =============================== ASSASSIN ===============================
T('sp_venin', [
  [0, 1, 'lames', 'Lames vicieuses', 5, ['dagger2', '#9ae040'], { dmg: 0.015 }],
  [0, 2, 'toxico', 'Toxicologie', 3, ['envenom', '#9ae040'], { dot: 0.05 }],
  [1, 0, 'concentres', 'Poisons concentrés', 3, ['envenom', '#b6e04a'], { sk: { as_poison: { dmg: 0.12 } } }],
  [1, 2, 'eventration', 'Éventration cruelle', 3, ['gut', '#9ae040'], { sk: { as_eventrer: { dmg: 0.1 } } }],
  A(2, 1, 'envenimer', 'as_envenimer'),
  [2, 3, 'marque', 'Marque persistante', 2, ['mark', '#9ae040'], { sk: { as_marque: { cd: -4 } } }],
  [3, 0, 'letale', 'Précision létale', 3, ['aim', '#9ae040'], { crit: 1.5 }, { req: 'concentres' }],
  [3, 2, 'esquive', 'Esquive affûtée', 2, ['evasion', '#9ae040'], { sk: { as_esquive: { cd: -8 } } }],
  [4, 1, 'envenimer2', 'Envenimer mortel', 2, ['envenom', '#d0ff6a'], { sk: { as_envenimer: { dmg: 0.15 } } }, { req: 'envenimer' }],
  [4, 3, 'frenesie', 'Frénésie accrue', 2, ['frenzy', '#9ae040'], { sk: { as_frenesie: { cd: -15 } } }],
  [5, 0, 'corrosif', 'Venin corrosif', 3, ['poison', '#9ae040'], { dot: 0.05 }],
  [5, 2, 'execution', 'Exécution sanglante', 3, ['execute', '#9ae040'], { sk: { as_execution: { dmg: 0.12 } } }],
  A(6, 1, 'toxine', 'as_toxine'),
]);
T('sp_ombres', [
  [0, 1, 'effilees', 'Lames effilées', 5, ['dagger2', '#e05a78'], { dmg: 0.015 }],
  [0, 2, 'opportunisme', 'Opportunisme', 3, ['mark', '#e05a78'], { crit: 1 }],
  [1, 0, 'voile', 'Voile prolongé', 3, ['shadowveil', '#e05a78'], { sk: { as_voile: { cd: -4 } } }],
  [1, 2, 'pas', "Pas de l'ombre vif", 2, ['shadowstep', '#e05a78'], { sk: { as_pas: { cd: -2 } } }],
  A(2, 1, 'embuscade', 'as_embuscade'),
  [2, 3, 'eventail', 'Éventail acéré', 3, ['fan', '#e05a78'], { sk: { as_eventail: { dmg: 0.12 } } }],
  [3, 0, 'sournois', 'Coups sournois', 3, ['gut', '#e05a78'], { critDmg: 0.1 }, { req: 'voile' }],
  [3, 2, 'esquive', 'Fluidité', 2, ['evasion', '#e05a78'], { dodge: 2 }],
  [4, 1, 'embuscade2', 'Embuscade parfaite', 2, ['shadowstep', '#ff7a98'], { sk: { as_embuscade: { dmg: 0.15, cd: -1 } } }, { req: 'embuscade' }],
  [4, 3, 'danse', 'Danse des lames prolongée', 2, ['bladedance', '#e05a78'], { sk: { as_danse: { cd: -10 } } }],
  [5, 0, 'silence', 'Exécution silencieuse', 3, ['execute', '#e05a78'], { execute: 0.08 }],
  [5, 2, 'ombre', 'Ombre protectrice', 2, ['shadowveil', '#a84a68'], { taken: -0.02 }],
  A(6, 1, 'macabre', 'as_macabre'),
]);

// =============================== DRUIDE ===============================
T('sp_dresto', [
  [0, 1, 'don', 'Don de la nature', 5, ['regrowth', '#8fe86a'], { heal: 0.02 }],
  [0, 2, 'intellect', 'Intellect sylvestre', 3, ['meditate', '#8fe86a'], { mp: 0.04 }],
  [1, 0, 'vivace', 'Régénération vivace', 3, ['regrowth', '#b0ff90'], { sk: { d_regen: { dmg: 0.12 } } }],
  [1, 2, 'rapide', 'Soin vital rapide', 3, ['heal', '#8fe86a'], { sk: { d_soin: { cast: -0.08 } } }],
  A(2, 1, 'croissance', 'd_croissance'),
  [2, 3, 'ecorce', 'Écorce solide', 2, ['bark', '#8fe86a'], { sk: { d_ecorce: { cd: -6 } } }],
  [3, 0, 'racines', 'Racines profondes', 3, ['root', '#8fe86a'], { hot: 0.08 }, { req: 'vivace' }],
  [3, 2, 'floraison', 'Floraison abondante', 2, ['bloom', '#ffb0e0'], { sk: { d_floraison: { dmg: 0.12 } } }],
  [4, 1, 'croissance2', 'Croissance vigoureuse', 2, ['regrowth', '#d0ffb0'], { sk: { d_croissance: { dmg: 0.15 } } }, { req: 'croissance' }],
  [4, 3, 'renouveau', 'Renouveau prompt', 3, ['renew', '#8fe86a'], { sk: { d_renouveau: { cd: -5 } } }],
  [5, 0, 'seve', 'Sève vive', 3, ['avatar', '#8fe86a'], { mana: 0.15 }],
  [5, 2, 'peau', "Peau d'écorce", 2, ['bark', '#8a6440'], { taken: -0.02 }],
  A(6, 1, 'arbre', 'd_arbre'),
]);
T('sp_equilibre', [
  [0, 1, 'colere', 'Colère sylvestre', 5, ['storm', '#9fd0ff'], { dmg: 0.015 }],
  [0, 2, 'lune', 'Lune gibbeuse', 3, ['nova', '#c8b8ff'], { crit: 1 }],
  [1, 0, 'epine', "Dard d'épines acéré", 3, ['thorn', '#9fd0ff'], { sk: { d_epine: { dmg: 0.1, cast: -0.05 } } }],
  [1, 2, 'essaim', 'Essaim vorace', 3, ['swarm', '#c8e060'], { sk: { d_essaim: { dmg: 0.12 } } }],
  A(2, 1, 'lunaire', 'd_lunaire'),
  [2, 3, 'orage', 'Orage grondant', 3, ['storm', '#bfe0ff'], { sk: { d_orage: { dmg: 0.12 } } }],
  [3, 0, 'stellaire', 'Lumière stellaire', 3, ['nova', '#9fd0ff'], { critDmg: 0.1 }, { req: 'epine' }],
  [3, 2, 'celerite', 'Célérité naturelle', 2, ['pack', '#9fd0ff'], { haste: 0.02 }],
  [4, 1, 'lunaire2', 'Éclat lunaire amplifié', 2, ['nova', '#e0d8ff'], { sk: { d_lunaire: { dmg: 0.15 } } }, { req: 'lunaire' }],
  [4, 3, 'patiente', 'Nature patiente', 3, ['swarm', '#9fd0ff'], { dot: 0.05 }],
  [5, 0, 'parfait', 'Équilibre parfait', 3, ['storm', '#e0f0ff'], { dmg: 0.02 }],
  [5, 2, 'ecorce', 'Écorce', 2, ['bark', '#9fd0ff'], { armor: 0.05 }],
  A(6, 1, 'stellaire2', 'd_stellaire'),
]);
T('sp_sauvage', [
  [0, 1, 'griffes', 'Griffes acérées', 5, ['bleed', '#e0b040'], { dmg: 0.015 }],
  [0, 2, 'instinct', 'Instinct du prédateur', 3, ['hawk', '#e0b040'], { crit: 1 }],
  [1, 0, 'griffure', 'Griffure vive', 3, ['bleed', '#f0c860'], { sk: { d_griffe: { dmg: 0.1 } } }],
  [1, 2, 'feulement', 'Pas du fauve', 2, ['pack', '#e0b040'], { speed: 0.03 }],
  A(2, 1, 'lacerer', 'd_lacerer'),
  [2, 3, 'sang', 'Soif de sang', 3, ['drain', '#e0b040'], { leech: 0.01 }],
  [3, 0, 'ferocite', 'Férocité', 3, ['frenzy', '#e0b040'], { critDmg: 0.1 }, { req: 'griffure' }],
  [3, 2, 'agilite', 'Agilité féline', 3, ['evasion', '#e0b040'], { dodge: 1.5 }],
  [4, 1, 'lacerer2', 'Lacération profonde', 2, ['bleed', '#ff9a3a'], { sk: { d_lacerer: { dmg: 0.15 } } }, { req: 'lacerer' }],
  [4, 3, 'essaim', 'Plaies infectées', 2, ['swarm', '#e0b040'], { dot: 0.05 }],
  [5, 0, 'roi', 'Roi de la jungle', 3, ['titan', '#e0b040'], { dmg: 0.02 }],
  [5, 2, 'curee', 'Curée', 2, ['execute', '#e0b040'], { execute: 0.08 }],
  A(6, 1, 'morsure', 'd_morsure'),
]);
T('sp_gardien', [
  [0, 1, 'fourrure', 'Fourrure épaisse', 5, ['bark', '#8a6440'], { armor: 0.05 }],
  [0, 2, 'robuste', 'Robustesse', 3, ['heart', '#8a6440'], { hp: 0.03 }],
  [1, 0, 'patte', 'Coup de patte lourd', 3, ['bleed', '#8a6440'], { sk: { d_patte: { dmg: 0.1 } } }],
  [1, 2, 'ecorce', "Écorce d'ancien", 2, ['bark', '#a07a4a'], { sk: { d_ecorce: { cd: -6 } } }],
  A(2, 1, 'mutil', 'd_mutil'),
  [2, 3, 'autorite', 'Autorité sauvage', 3, ['shout', '#8a6440'], { threat: 0.1 }],
  [3, 0, 'rage', "Rage de l'ours", 3, ['drain', '#8a6440'], { leech: 0.01 }, { req: 'patte' }],
  [3, 2, 'cuir', 'Cuir épais', 3, ['bark', '#6a4a2e'], { taken: -0.02 }],
  [4, 1, 'mutil2', 'Mutilation brutale', 2, ['bleed', '#c8763a'], { sk: { d_mutil: { dmg: 0.15, cd: -1 } } }, { req: 'mutil' }],
  [4, 3, 'regen', 'Régénération sauvage', 2, ['regrowth', '#8a6440'], { regen: 0.002 }],
  [5, 0, 'inebranlable', 'Inébranlable', 3, ['rampart', '#8a6440'], { lowhp: -0.05 }],
  [5, 2, 'rugissement', 'Rugissement tonitruant', 2, ['shout', '#a07a4a'], { sk: { d_rugissement: { cd: -2 } } }],
  A(6, 1, 'instincts', 'd_instincts'),
]);

// =============================== CHAMAN ===============================
T('sp_cresto', [
  [0, 1, 'purification', 'Purification', 5, ['wave', '#2ab5ff'], { heal: 0.02 }],
  [0, 2, 'source', 'Source intarissable', 3, ['meditate', '#2ab5ff'], { mp: 0.04 }],
  [1, 0, 'onde', 'Onde vive', 3, ['wave', '#8fe0ff'], { sk: { c_onde: { cast: -0.08 } } }],
  [1, 2, 'ricochet', 'Ricochet puissant', 3, ['chainheal', '#2ab5ff'], { sk: { c_ricochet: { dmg: 0.1 } } }],
  A(2, 1, 'vague', 'c_vague'),
  [2, 3, 'esprit', 'Esprit ancestral bienveillant', 3, ['ancestral', '#2ab5ff'], { sk: { c_esprit: { dmg: 0.12 } } }],
  [3, 0, 'flots', 'Flots', 3, ['tide', '#2ab5ff'], { hot: 0.08 }, { req: 'onde' }],
  [3, 2, 'totems', 'Totems durables', 2, ['totemheal', '#2ab5ff'], { sk: { c_totem_source: { cd: -5 } } }],
  [4, 1, 'vague2', 'Vague déferlante', 2, ['wave', '#bff0ff'], { sk: { c_vague: { dmg: 0.15 } } }, { req: 'vague' }],
  [4, 3, 'maree', 'Marée haute', 3, ['tide', '#8fe0ff'], { sk: { c_maree: { dmg: 0.12 } } }],
  [5, 0, 'bouclier', "Bouclier d'eau", 3, ['meditate', '#2ab5ff'], { mana: 0.15 }],
  [5, 2, 'ecailles', 'Écailles protectrices', 2, ['scales', '#2ab5ff'], { absorb: 0.12 }],
  A(6, 1, 'totem', 'c_totem_maree'),
]);
T('sp_elem', [
  [0, 1, 'convection', 'Convection', 5, ['tempest', '#6fb8ff'], { dmg: 0.015 }],
  [0, 2, 'arc', 'Arc amplifié', 3, ['arc', '#6fb8ff'], { sk: { c_arc: { dmg: 0.08 } } }],
  [1, 0, 'braise', 'Totem de braise ardent', 3, ['totemfire', '#ff7a2a'], { sk: { c_totem_braise: { dmg: 0.15 } } }],
  [1, 2, 'seisme', 'Onde sismique rapide', 2, ['quake', '#8a6440'], { sk: { c_seisme: { cd: -2 } } }],
  A(2, 1, 'lave', 'c_lave'),
  [2, 3, 'tempete', 'Tempête primordiale', 3, ['tempest', '#9fd8ff'], { sk: { c_tempete: { dmg: 0.12 } } }],
  [3, 0, 'surcharge', 'Surcharge', 3, ['arc', '#bfe8ff'], { critDmg: 0.1 }, { req: 'braise' }],
  [3, 2, 'celerite', 'Célérité', 2, ['totemwind', '#6fb8ff'], { haste: 0.02 }],
  [4, 1, 'lave2', 'Lave en fusion', 2, ['totemfire', '#ffb040'], { sk: { c_lave: { dmg: 0.15, cd: -1 } } }, { req: 'lave' }],
  [4, 3, 'incarnation', 'Incarnation rapide', 2, ['incarnate', '#6fb8ff'], { sk: { c_incarnation: { cd: -15 } } }],
  [5, 0, 'maitrise', 'Maîtrise élémentaire', 3, ['storm', '#6fb8ff'], { dmg: 0.02 }],
  [5, 2, 'pierre', 'Peau de pierre', 2, ['quake', '#6fb8ff'], { armor: 0.05 }],
  A(6, 1, 'foudre', 'c_foudre'),
]);
T('sp_amelio', [
  [0, 1, 'arme', 'Arme enchantée', 5, ['totemwind', '#9fe8ff'], { dmg: 0.015 }],
  [0, 2, 'frappe', 'Frappe tempête affûtée', 3, ['arc', '#9fe8ff'], { sk: { c_frappe: { dmg: 0.08 } } }],
  [1, 0, 'vents', 'Totem des vents', 2, ['totemwind', '#bff4ff'], { sk: { c_totem_vents: { cd: -10 } } }],
  [1, 2, 'vivacite', 'Vivacité', 3, ['pack', '#9fe8ff'], { haste: 0.02 }],
  A(2, 1, 'lame', 'c_lame'),
  [2, 3, 'ecailles', "Écailles d'orage", 2, ['scales', '#9fe8ff'], { absorb: 0.1 }],
  [3, 0, 'fureur', 'Fureur des vents', 3, ['tempest', '#9fe8ff'], { crit: 1.5 }, { req: 'vents' }],
  [3, 2, 'seisme', 'Onde sismique', 2, ['quake', '#9fe8ff'], { sk: { c_seisme: { dmg: 0.12 } } }],
  [4, 1, 'lame2', 'Lave incandescente', 2, ['totemfire', '#ffb040'], { sk: { c_lame: { dmg: 0.15, cd: -1 } } }, { req: 'lame' }],
  [4, 3, 'cuir', 'Peau de cuir', 3, ['bark', '#9fe8ff'], { taken: -0.02 }],
  [5, 0, 'elementaire', 'Fureur élémentaire', 3, ['incarnate', '#9fe8ff'], { dmg: 0.02 }],
  [5, 2, 'loups', 'Loups vigoureux', 2, ['pack', '#9fe8ff'], { pet: 0.1 }],
  A(6, 1, 'loups2', 'c_loups'),
]);

export const NODE_BY = {};
for (const spec in TREES) { NODE_BY[spec] = {}; for (const n of TREES[spec]) NODE_BY[spec][n.id] = n; }
