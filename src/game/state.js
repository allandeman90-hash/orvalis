// État global partagé du jeu.
export const LEVEL_CAP = 30;

// XP nécessaire pour passer du niveau L à L+1
export function xpToNext(L) {
  if (L >= LEVEL_CAP) return Infinity;
  return Math.round(160 * Math.pow(L, 1.4) + 50 * L);
}

export const G = {
  renderer: null,
  scene: null,
  camera: null,
  sky: null,
  water: null,
  decor: null,
  towns: null,
  landmarks: null,
  cam: null,
  input: null,
  ui: null,
  audio: null,
  net: null,
  world: null,
  player: null,
  time: 0, // secondes de jeu écoulées
  dt: 0,
  frame: 0,
  mode: 'loading', // loading | title | create | game
  settings: {
    shadows: true,
    quality: 1, // 0 bas, 1 moyen, 2 haut
    viewDist: 380,
    volume: 0.7,
    music: 0.4,
    sensitivity: 1,
    autoAttack: true,
    showNames: true,
    xpRate: 1,
    invertY: false,
    selfPlate: false,
    autoPerf: true, // fluidité automatique (viser 60 images/s)
    showFps: false,
    bar2: false,
    bar3: false,
    bar4: false,
  },
  save: null, // données du personnage en cours
  flags: {},
};

export const SCHOOL_COLORS = {
  phys: '#f2f2f2', fire: '#ff9a3a', frost: '#8fd8ff', nature: '#8fe86a', arcane: '#d49aff',
  shadow: '#b58cff', holy: '#ffe68a', lightning: '#9fd0ff', poison: '#b6e04a',
};
