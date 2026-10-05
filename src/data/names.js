// Générateur de pseudos de joueurs simulés et répliques de discussion.
const A = ['Kael', 'Myr', 'Thal', 'Vor', 'Ash', 'Lys', 'Brak', 'Zel', 'Or', 'Fen', 'Gal', 'Riv', 'Syl', 'Dra', 'Nox', 'Cy', 'Eli', 'Mor', 'Tor', 'Vel', 'Ari', 'Kor', 'Ise', 'Jar', 'Lun', 'Ner', 'Pha', 'Rho', 'Sae', 'Ul', 'Wen', 'Yor', 'Bael', 'Cal', 'Dun', 'Eze', 'Gri', 'Hal'];
const B = ['ric', 'wen', 'dor', 'ax', 'ynn', 'ia', 'gar', 'iel', 'os', 'ek', 'ra', 'ith', 'an', 'is', 'mir', 'oth', 'une', 'ard', 'ka', 'lor', 'yth', 'ane', 'ros'];
const TAGS = ['Kevdu59', 'Poulpette', 'Tartiflette', 'Grosbill', 'LaFrite', 'Moustik', 'Biscotte', 'Raclette', 'ChocoPain', 'Titoumax', 'Frimousse', 'Zbeul', 'Gaufrette', 'Crevette', 'Patapouf', 'Nuggetz', 'LeZouave', 'Ptitcoeur', 'Ratatouille', 'Cassoulet', 'Pistache', 'Framboise'];
const DECOR = ['xX', 'Dark', 'Mc', 'Le', 'La', 'Sir', 'Lady', 'Big', 'Ptit'];

export function makeName(rnd, used) {
  for (let k = 0; k < 50; k++) {
    let n;
    const r = rnd();
    if (r < 0.62) n = A[Math.floor(rnd() * A.length)] + B[Math.floor(rnd() * B.length)];
    else if (r < 0.82) n = TAGS[Math.floor(rnd() * TAGS.length)] + (rnd() < 0.5 ? Math.floor(rnd() * 99) : '');
    else if (r < 0.92) n = DECOR[Math.floor(rnd() * DECOR.length)] + A[Math.floor(rnd() * A.length)] + B[Math.floor(rnd() * B.length)];
    else n = A[Math.floor(rnd() * A.length)] + B[Math.floor(rnd() * B.length)] + ['us', 'a', 'o', 'y'][Math.floor(rnd() * 4)];
    if (n.startsWith('xX')) n += 'Xx';
    if (!used.has(n)) { used.add(n); return n; }
  }
  return 'Joueur' + Math.floor(rnd() * 9999);
}

// Nom de héros « fantasy » (création de personnage) : deux ou trois syllabes, sans surnom
export function makeHeroName(rnd, used) {
  const C = ['a', 'e', 'i', 'o', 'ae', 'ia', 'y'];
  for (let k = 0; k < 60; k++) {
    let n = A[Math.floor(rnd() * A.length)] + (rnd() < 0.35 ? C[Math.floor(rnd() * C.length)] : '') + B[Math.floor(rnd() * B.length)];
    if (rnd() < 0.25) n += ['us', 'a', 'el', 'on', 'is'][Math.floor(rnd() * 5)];
    n = n.replace(/(.)\1\1/g, '$1$1');
    if (n.length <= 12 && !used.has(n)) { used.add(n); return n; }
  }
  return A[Math.floor(rnd() * A.length)] + B[Math.floor(rnd() * B.length)];
}

// Répliques par contexte ({z} région, {m} monstre, {b} boss, {n} nom, {l} niveau, {i} objet)
export const LINES = {
  lfg: ['LFG {b}, qui est chaud ?', 'Groupe pour {b}, il manque un soigneur', 'qqn pour {b} ? niv {l}', 'Cherche groupe dans {z}', 'on monte un groupe pour les élites de {z}, mp moi'],
  sell: ['VDS {i}, prix raisonnable', 'Je vends {i} à l\'hôtel des ventes', 'WTS {i}, mp', 'Quelqu\'un a besoin de {i} ?'],
  buy: ['J\'achète des éclats runiques', 'Cherche une arme pour mon niv {l}', 'Qui vend des potions pas chères ?', 'Besoin de cœurs runiques, je paie bien'],
  chat: ['Quelqu\'un sait où sont les {m} ?', 'Les {m} de {z} tapent fort', 'Enfin niveau {l} !', 'gg à tous pour le boss', 'Le Bastion est à qui en ce moment ?', 'Quelqu\'un a vu le Dévoreur d\'Orages ?', 'mon premier +5 à la forge, trop content', 'Raté mon +6, j\'ai perdu 20 éclats…', 'J\'aime bien la musique du marais', 'Vous avez des astuces pour {b} ?', 'lol je suis mort en tombant dans la lave', 'On se fait un raid sur la capitale adverse ?', 'Les caravanes rapportent pas mal de gloire', 'bonne soirée tout le monde', 'Premier jour sur le jeu, c\'est cool', 'C\'est où Fort Roseau ?', 'J\'ai enfin ma monture !', 'Les ennemis campent le col du Cœur…', 'Qui veut duel ?', 'Afk 5 min'],
  pvpBrag: ['Trop facile', 'gg', 'Reviens quand tu seras plus fort', 'Pour la faction !', 'Et un de plus', 'Mdr il a fui', 'Vous tenez pas le Cœur'],
  pvpSad: ['Ils sont trop nombreux au Cœur', 'Besoin d\'aide dans {z}, ils nous campent', 'Qui vient m\'aider dans {z} ?', 'Aïe, un groupe ennemi dans {z}'],
  boss: ['Le Dévoreur arrive, tous à l\'Autel !', 'Boss du monde bientôt, on se rejoint à la Cime', 'Go Autel des Tempêtes', 'Le boss est à moitié !', 'Attention aux cercles rouges'],
  greet: ['Salut !', 'Yo', 'Bienvenue !', 'Salut {n}', 'Hello', 'Bonjour à toi', 'Coucou'],
  thanks: ['Merci !', 'Merci pour le soin', 'ty', 'Merci pour le coup de main', 'Nickel, merci'],
  group: ['Je te rejoins', 'Ok go', 'J\'arrive', 'On y va !', 'Let\'s go'],
  help: ['Les quêtes avec un ! jaune, et n\'hésite pas à grouper (P)', 'Va voir le forgeron pour tes éclats', 'Monte au niveau 10 pour la monture', 'La carte avec M, c\'est pratique'],
};

export function fill(t, v) {
  return t.replace(/\{(\w)\}/g, (_, k) => v[k] ?? '');
}
