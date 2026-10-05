// Spécialisations (sous-classes) : 2 à 4 par classe. Chacune fixe un rôle de groupe (tank, soigneur, dégâts),
// un bonus inné, parfois des techniques propres (forme animale, attaque de mêlée, provocation), et son arbre de talents.
// Le guerrier ne soigne jamais ; le templier peut tanker, soigner ou frapper selon sa voie.
export const SPECS = {};
const S = (o) => { SPECS[o.id] = { core: [], melee: false, ...o }; };

// =============================== GUERRIER ===============================
S({ id: 'sp_armes', cls: 'guerrier', name: 'Armes', role: 'dps', melee: true, icon: ['bleed', '#b5452a'],
  desc: "Vétéran des champs de bataille. Coups pesants, plaies profondes et frappes qui achèvent les ennemis affaiblis.",
  passiveName: 'Maîtrise des armes', passive: { dmg: 0.08, critDmg: 0.15 } });
S({ id: 'sp_furie', cls: 'guerrier', name: 'Furie', role: 'dps', melee: true, icon: ['titan', '#d0402a'],
  desc: "Une rage sans fin : des attaques rapides et incessantes qui soignent le guerrier à chaque coup porté.",
  passiveName: 'Frénésie', passive: { haste: 0.1, dmg: 0.05 } });
S({ id: 'sp_rempart', cls: 'guerrier', name: 'Rempart', role: 'tank', melee: true, icon: ['shieldwall', '#9aa2ae'],
  desc: "Le mur du groupe. Bouclier levé, il attire tous les ennemis à lui et encaisse ce qui tuerait les autres.",
  passiveName: 'Protecteur', passive: { armor: 0.3, hp: 0.15, block: 5, taken: -0.05 }, core: ['g_provoc'] });

// =============================== TEMPLIER ===============================
S({ id: 'sp_lumiere', cls: 'templier', name: 'Lumière', role: 'heal', melee: false, icon: ['lightheal', '#f0c850'],
  desc: "La foi qui guérit. Soins puissants, boucliers de lumière et grâces qui tiennent le groupe debout.",
  passiveName: 'Grâce', passive: { heal: 0.2, mp: 0.15, mana: 0.25 } });
S({ id: 'sp_bastion', cls: 'templier', name: 'Bastion', role: 'tank', melee: true, icon: ['aegis', '#f0c850'],
  desc: "Chevalier-rempart de l'ordre solaire. Sol consacré, bouclier lancé et défis qui retiennent chaque ennemi.",
  passiveName: 'Rempart de la foi', passive: { armor: 0.3, hp: 0.15, block: 5, taken: -0.05 } });
S({ id: 'sp_chatiment', cls: 'templier', name: 'Châtiment', role: 'dps', melee: true, icon: ['verdict', '#f0a030'],
  desc: "Le bras armé du soleil. Marteau béni, tempêtes sacrées et jugements qui foudroient les impies.",
  passiveName: 'Zèle', passive: { dmg: 0.08, crit: 4 } });

// =============================== MAGE ===============================
S({ id: 'sp_feu', cls: 'mage', name: 'Feu', role: 'dps', icon: ['fire', '#ff7a2a'],
  desc: "Pyromancien. Explosions, brûlures et déflagrations qui réduisent les groupes d'ennemis en cendres.",
  passiveName: 'Combustion', passive: { dmg: 0.08, crit: 4 } });
S({ id: 'sp_givre', cls: 'mage', name: 'Givre', role: 'dps', icon: ['frost', '#8fd8ff'],
  desc: "Cryomancien. Gèle, ralentit et brise ses ennemis : il frappe fort sans jamais se laisser atteindre.",
  passiveName: 'Hiver éternel', passive: { dmg: 0.08, taken: -0.04 } });
S({ id: 'sp_arcanes', cls: 'mage', name: 'Arcanes', role: 'dps', icon: ['overload', '#d49aff'],
  desc: "Savant de la magie pure. Projectiles incessants, grande réserve de mana et maîtrise du temps.",
  passiveName: 'Savoir arcanique', passive: { dmg: 0.06, haste: 0.08, mp: 0.1 } });

// =============================== NÉCROMANCIEN ===============================
S({ id: 'sp_fleau', cls: 'necro', name: 'Fléau', role: 'dps', icon: ['blight', '#8a7ab8'],
  desc: "Porteur de pestes. Malédictions et maladies qui rongent lentement plusieurs ennemis à la fois.",
  passiveName: 'Pestilence', passive: { dot: 0.2, dmg: 0.05 } });
S({ id: 'sp_legion', cls: 'necro', name: 'Légion', role: 'dps', icon: ['legion', '#a8a4d8'],
  desc: "Général des morts. Squelettes, mages d'os et golems combattent pour lui, toujours plus nombreux.",
  passiveName: 'Commandeur des morts', passive: { pet: 0.3, dmg: 0.05 } });
S({ id: 'sp_ossuaire', cls: 'necro', name: 'Ossuaire', role: 'tank', melee: true, icon: ['bonearmor', '#e6dfcd'],
  desc: "Chevalier d'os. Une carapace d'ossements, une faux au corps à corps et la vie volée à ses ennemis.",
  passiveName: "Carapace d'os", passive: { armor: 2.2, hp: 0.45, leech: 0.06, dodge: 8, taken: -0.15 }, core: ['n_frappeos', 'n_provoc'], basic: 'n_frappeos' });

// =============================== ARCHER ===============================
S({ id: 'sp_precision', cls: 'archer', name: 'Précision', role: 'dps', icon: ['aim', '#e0c060'],
  desc: "Tireur d'élite. Tirs longs et chargés, coups critiques dévastateurs sur les cibles isolées.",
  passiveName: 'Œil de lynx', passive: { dmg: 0.06, crit: 5, critDmg: 0.1 } });
S({ id: 'sp_survie', cls: 'archer', name: 'Survie', role: 'dps', icon: ['trap', '#9a9aa0'],
  desc: "Rôdeur des terres sauvages. Pièges explosifs, flèches empoisonnées et zones de mort.",
  passiveName: 'Instinct de survie', passive: { dot: 0.1, dmg: 0.06, speed: 0.05 } });
S({ id: 'sp_meute', cls: 'archer', name: 'Meute', role: 'dps', icon: ['pack', '#c8a060'],
  desc: "Maître des bêtes. Un loup de chasse l'accompagne, et tous ses compagnons frappent plus fort.",
  passiveName: 'Lien sauvage', passive: { pet: 0.3, dmg: 0.04 }, core: ['a_loup'] });

// =============================== ASSASSIN ===============================
S({ id: 'sp_venin', cls: 'assassin', name: 'Venin', role: 'dps', icon: ['envenom', '#9ae040'],
  desc: "Empoisonneur. Chaque lame enduite ajoute une dose, puis tout le venin est libéré d'un seul coup.",
  passiveName: 'Maître empoisonneur', passive: { dot: 0.2, dmg: 0.05 } });
S({ id: 'sp_ombres', cls: 'assassin', name: 'Ombres', role: 'dps', icon: ['shadowveil', '#e05a78'],
  desc: "Lame de l'ombre. Embuscades, coups critiques et danses mortelles au milieu des ennemis.",
  passiveName: 'Danse des ombres', passive: { crit: 5, critDmg: 0.1, dmg: 0.04 } });

// =============================== DRUIDE ===============================
S({ id: 'sp_dresto', cls: 'druide', name: 'Restauration', role: 'heal', icon: ['regrowth', '#8fe86a'],
  desc: "Gardien de la vie. Régénérations, floraisons et soins de groupe qui ne s'arrêtent jamais.",
  passiveName: 'Harmonie', passive: { heal: 0.2, hot: 0.15, mp: 0.1 } });
S({ id: 'sp_equilibre', cls: 'druide', name: 'Équilibre', role: 'dps', icon: ['storm', '#9fd0ff'],
  desc: "Druide des astres. Lune, étoiles et orages s'abattent sur ses ennemis à distance.",
  passiveName: 'Courroux céleste', passive: { dmg: 0.08, dot: 0.1 } });
S({ id: 'sp_sauvage', cls: 'druide', name: 'Sauvage', role: 'dps', melee: true, icon: ['bleed', '#e0b040'],
  desc: "Prend la forme d'un grand félin : griffes, lacérations et morsures féroces au corps à corps.",
  passiveName: 'Prédateur', passive: { dmg: 0.08, crit: 5 }, core: ['d_felin', 'd_griffe'], basic: 'd_griffe' });
S({ id: 'sp_gardien', cls: 'druide', name: 'Gardien', role: 'tank', melee: true, icon: ['bark', '#8a6440'],
  desc: "Prend la forme d'un ours colossal pour protéger le groupe : fourrure épaisse, rugissements et coups de patte.",
  passiveName: 'Colosse sylvestre', passive: { armor: 0.4, hp: 0.12, taken: -0.08 }, core: ['d_ours', 'd_patte', 'd_rugissement'], basic: 'd_patte' });

// =============================== CHAMAN ===============================
S({ id: 'sp_cresto', cls: 'chaman', name: 'Restauration', role: 'heal', icon: ['wave', '#2ab5ff'],
  desc: "Guérisseur des esprits de l'eau. Vagues, marées et totems qui soignent tout le groupe.",
  passiveName: 'Esprit des eaux', passive: { heal: 0.2, mp: 0.1, mana: 0.2 } });
S({ id: 'sp_elem', cls: 'chaman', name: 'Élémentaire', role: 'dps', icon: ['tempest', '#6fb8ff'],
  desc: "Il déchaîne la lave et la foudre à distance. Totems de braise et orages primordiaux.",
  passiveName: 'Fureur élémentaire', passive: { dmg: 0.08, critDmg: 0.1 } });
S({ id: 'sp_amelio', cls: 'chaman', name: 'Amélioration', role: 'dps', melee: true, icon: ['totemwind', '#9fe8ff'],
  desc: "Guerrier-chaman au corps à corps. Arme chargée de foudre, lames de lave et loups spectraux.",
  passiveName: 'Arme des vents', passive: { haste: 0.1, dmg: 0.06 }, core: ['c_frappe'], basic: 'c_frappe' });

export const CLASS_SPECS = {
  guerrier: ['sp_armes', 'sp_furie', 'sp_rempart'],
  templier: ['sp_lumiere', 'sp_bastion', 'sp_chatiment'],
  mage: ['sp_feu', 'sp_givre', 'sp_arcanes'],
  necro: ['sp_fleau', 'sp_legion', 'sp_ossuaire'],
  archer: ['sp_precision', 'sp_survie', 'sp_meute'],
  assassin: ['sp_venin', 'sp_ombres'],
  druide: ['sp_dresto', 'sp_equilibre', 'sp_sauvage', 'sp_gardien'],
  chaman: ['sp_cresto', 'sp_elem', 'sp_amelio'],
};
// spécialisation par défaut (celle qui correspond à l'ancien rôle de la classe)
export const DEFAULT_SPEC = {
  guerrier: 'sp_rempart', templier: 'sp_bastion', mage: 'sp_feu', necro: 'sp_fleau',
  archer: 'sp_precision', assassin: 'sp_venin', druide: 'sp_dresto', chaman: 'sp_cresto',
};

export const ROLE_LABEL = { tank: 'Tank', heal: 'Soigneur', dps: 'Dégâts' };
export const ROLE_GLYPH = { tank: 'tank', heal: 'healer', dps: 'dps' };

export function specOf(e) {
  if (!e) return null;
  return (e.spec && SPECS[e.spec] && SPECS[e.spec].cls === e.cls ? SPECS[e.spec] : null) || SPECS[DEFAULT_SPEC[e.cls]] || null;
}
export const roleOf = (e) => specOf(e)?.role || 'dps';
export const isTank = (e) => !!e && roleOf(e) === 'tank';
export const isHealer = (e) => !!e && roleOf(e) === 'heal';
export function isMelee(e) {
  const s = specOf(e);
  if (s) return !!s.melee;
  return e?.cls === 'guerrier' || e?.cls === 'templier' || e?.cls === 'assassin';
}
export function validSpec(cls, id) { return SPECS[id]?.cls === cls ? id : DEFAULT_SPEC[cls]; }
// spécialisation d'une classe capable de tenir un rôle donné (null sinon)
export function specForRole(cls, role) {
  return (CLASS_SPECS[cls] || []).find((id) => SPECS[id].role === role) || null;
}
// paires [classe, spécialisation] capables de tenir un rôle
export function specsForRole(role) {
  const out = [];
  for (const cls in CLASS_SPECS) for (const id of CLASS_SPECS[cls]) if (SPECS[id].role === role) out.push([cls, id]);
  return out;
}
