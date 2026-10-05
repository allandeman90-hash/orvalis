import './data/expeditions.js';
import { createModel as createArtModel } from './game/models.js';
import { exportModel, loadModel } from './engine/art-pipeline.js';
window.__art = { createModel: createArtModel, exportModel, loadModel };
import { TerrainSectors } from './world/sectors.js';
// Orvalis Online — point d'entrée : chargement du monde, boucle de jeu, démarrage d'une partie.
import './data/dungeons.js'; // créatures et boss des donjons (enregistrés avant tout le reste)
import './data/lore.js'; // Ordres, sanctuaires, émissaires, Voilés (ajoutés aux lieux et aux PNJ)
import './data/story.js'; // quête principale de chaque classe
import * as THREE from 'three';
import { G, LEVEL_CAP } from './game/state.js';
import { initTerrainData, getHeight, zoneAt, getSlope, roadDist, waterDepth } from './world/terrain.js';
import { Decor } from './world/decor.js';
import { texturizeTerrain, setSurfaceDetail } from './engine/textures.js';
import { Perf } from './engine/perf.js';
import { Layout } from './ui/layout.js';
import { buildTowns } from './world/towns.js';
import { buildLandmarks, updateLandmarks } from './world/landmarks.js';
import { Sky } from './engine/sky.js';
import { createWater } from './engine/water.js';
import { Input } from './engine/input.js';
import { CameraRig } from './engine/camera.js';
import { initFX, updateFX } from './game/fx.js';
import { updateTargetRing } from './game/targetring.js';
import { World } from './game/world.js';
import { Player, newCharacter } from './game/player.js';
import { initProgress } from './game/progress.js';
import { Inv } from './game/inventory.js';
import { UI } from './ui/hud.js';
import { Win } from './ui/windows.js';
import { NpcManager } from './game/npc.js';
import { Quests } from './game/quests.js';
import { HUBS } from './data/zones.js';
import { Bots } from './game/bots.js';
import { Party, PvP, Chat } from './game/social.js';
import { Events } from './game/events.js';
import { Market } from './game/market.js';
import { Save, initSave } from './game/save.js';
import { Title } from './ui/title.js';
import { runCommand } from './game/commands.js';
import { initAudio } from './engine/audio.js';
import { initNet } from './net/net.js';
import { Pets } from './game/pets.js';
import './game/bossmech.js';
import { Inst } from './game/instance.js';
import { LFG } from './game/lfg.js';
import { Runes } from './game/runes.js';
import { Profs } from './game/profs.js';
import { Story } from './game/story.js';
import { mentorId, ORDERS, au, de, aName } from './data/lore.js';

const $ = (id) => document.getElementById(id);
const wait = () => new Promise((r) => setTimeout(r, 0));

async function setLoad(k, txt) {
  const b = document.querySelector('#loading .ld-bar div');
  if (b) b.style.width = Math.round(k * 100) + '%';
  const s = document.querySelector('#loading .ld-sub');
  if (s && txt) s.textContent = txt;
  await wait();
}

export function applyGraphics() {
  const r = G.renderer, s = G.settings;
  const pr = Math.min(window.devicePixelRatio || 1, s.quality === 2 ? 2 : s.quality === 1 ? 1.5 : 1) * (s.quality === 0 ? .72 : 1);
  r.setPixelRatio(pr);
  r.shadowMap.enabled = !!s.shadows;
  G.sky.sun.castShadow = !!s.shadows;
  const ms = s.quality === 2 ? 2048 : 1024;
  G.sky.sun.shadow.mapSize.set(ms, ms);
  if (G.sky.sun.shadow.map) { G.sky.sun.shadow.map.dispose(); G.sky.sun.shadow.map = null; }
  setSurfaceDetail(s.textures !== false);
  G.sky.viewDist = s.viewDist;
  G.camera.far = s.viewDist + 520;
  G.camera.updateProjectionMatrix();
  G.scene.traverse((o) => { if (o.material) { const m = Array.isArray(o.material) ? o.material : [o.material]; m.forEach((x) => (x.needsUpdate = true)); } });
  Perf.apply(); // qualité automatique (résolution, ombres) par-dessus les réglages choisis
}
G.applyGraphics = applyGraphics;

async function boot() {
  const canvas = $('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  G.renderer = renderer;
  const scene = new THREE.Scene();
  G.scene = scene;
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.3, 900);
  G.camera = camera;
  window.addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  });

  await setLoad(0.05, 'Soulèvement des montagnes…');
  initTerrainData();
  await setLoad(0.25, 'Sculpture des vallées…');
  // sol lissé et texturé (herbe, terre, roche, sable, neige, pavés peints à la main)
  const tmat = texturizeTerrain(new THREE.MeshLambertMaterial({ vertexColors: true }));
  G.terrainSectors = new TerrainSectors(tmat);
  scene.add(G.terrainSectors);
  await setLoad(0.45, 'Plantation des forêts…');
  G.decor = new Decor(scene);
  G.decor.build();
  await setLoad(0.62, 'Construction des cités…');
  G.towns = buildTowns(scene);
  G.landmarks = buildLandmarks(scene);
  await setLoad(0.75, 'Allumage du ciel…');
  G.sky = new Sky(scene);
  G.water = createWater();
  scene.add(G.water);
  initFX(scene);
  G.input = new Input(canvas);
  G.cam = new CameraRig(camera);
  G.world = new World(scene);
  await setLoad(0.85, 'Réveil des créatures…');
  UI.init();
  Layout.init();
  G.ui = UI;
  G.inv = Inv;
  G.runes = Runes;
  G.profs = Profs;
  G.win = Win;
  G.quests = Quests;
  G.npcs = NpcManager;
  Win.init();
  initProgress();
  NpcManager.init(G.towns.spots);
  Quests.init();
  G.story = Story;
  Story.init();
  initSave();
  G.bots = Bots;
  G.party = Party;
  G.pvp = PvP;
  G.chat = Chat;
  G.events = Events;
  G.market = Market;
  G.commands = runCommand;
  G.pets = Pets;
  Pets.init();
  G.inst = Inst;
  Inst.init();
  G.lfg = LFG;
  Bots.onPlayerChat = (t, ch) => Chat.onPlayerChat(t, ch);
  Bots.init(Save.world().bots);
  PvP.init();
  Events.init();
  Title.init();
  initAudio();
  initNet(); // multijoueur en direct : s'active dès que la salle répond
  for (const hook of G.bootHooks || []) await hook();
  applyGraphics();
  await setLoad(1, 'Prêt.');
  $('loading').hidden = true;
  G.mode = 'title';
  G.onReady?.();
  const hot = window.claude?.hot;
  const boot2 = (data) => {
    try {
      if (data && data.save && data.playing) {
        localStorage.setItem('orvalis.save.v1', JSON.stringify(data.save));
        const d = data.save.chars.find((c) => c.id === data.playing);
        if (d) { G.startGame(d); return; }
      }
    } catch (e) { /* ignore */ }
    Title.show();
  };
  if (hot?.ready) hot.ready(boot2); else boot2(hot?.data);
  requestAnimationFrame(loop);
  window.__ready = true;
}

// ---------------------------------------------------------------------------

// Phase de test : chaque personnage est porté au niveau maximum, équipé, avec de l'or et la monture volante.
const TEST_MAX_LEVEL = true;
function equipForLevel(P, level) {
  const cls = P.cls;
  for (let i = P.level; i < level; i++) P.levelUp();
  for (const slot of ['weapon', 'offhand', 'head', 'chest', 'legs', 'hands', 'feet', 'ring', 'amulet']) {
    if (slot === 'offhand' && cls === 'archer') continue;
    P.data.equip[slot] = makeGear({ slot, cls, ilvl: level, quality: 62 });
  }
  P.refreshGear(true);
  Object.assign(P.talents, autoBuild(P.spec, talentPoints(P.level)));
  P.applyTalents(false);
  const basic = basicSkill(P);
  const list = [basic, ...specAbilityIds(P.spec).map((id) => SKILL_BY_ID[id]).filter((s) => s && P.skills[s.id] && s.id !== basic.id), ...classSkills(cls).filter((s) => P.skills[s.id] && s.id !== basic.id)];
  for (let i = 0; i < 8; i++) P.data.bar[i] = list[i] ? { k: 's', id: list[i].id } : null;
  P.recalc(); P.hp = P.stats.maxHp; P.mp = P.stats.maxMp;
}
function boostForTesting(P) {
  if (!TEST_MAX_LEVEL || P.data.testMax) return;
  P.data.testMax = 1;
  if (P.level < LEVEL_CAP) equipForLevel(P, LEVEL_CAP);
  P.data.gold = Math.max(P.data.gold || 0, 50000);
  P.data.hasMount = true; P.data.mountTier = 3; P.skills.x_monture = 1;
  if (!P.data.bar.some((b) => b && b.id === 'x_monture')) { const i = P.data.bar.findIndex((b, k) => k >= 8 && !b); P.data.bar[i >= 0 ? i : 9] = { k: 's', id: 'x_monture' }; }
  setTimeout(() => UI.announce?.('Personnage de test', 'quest', 'Niveau maximum, équipement, 50 000 po et monture volante (T, puis Espace)'), 1500);
}
export function startGame(data) {
  const P = new Player(data);
  G.player = P;
  G.save = data;
  P.init(G.scene);
  G.world.add(P);
  G.cam.first = true;
  G.cam.yaw = P.ry;
  // premier départ au sanctuaire : la caméra cadre le mentor et l'autel du Sceau, à côté du personnage
  if (data.story?.intro) { G.cam.yaw = Math.PI; delete data.story.intro; }
  G.mode = 'game';
  UI.show(true);
  requestAnimationFrame(() => Layout.applyAll());
  $('title').hidden = true;
  P.lastZone = zoneAt(P.pos.x, P.pos.z);
  UI.zoneEnter(P.lastZone);
  G.sky.setBiome(P.lastZone.biome);
  NpcManager.update();
  Quests.refreshMarks();
  Party.members = [];
  Market.init();
  Events.applyBastionOwner(true);
  G.world.emit('start', P);
  Pets.reset();
  LFG.init();
  boostForTesting(P);
  Pets.ensureHunterPet();
  if (data.petActive) setTimeout(() => { if (G.player === P) Pets.summonActive(true); }, 400);
  UI.refresh();
  if (!data.tutorial) {
    data.tutorial = 1;
    const m = NpcManager.recs.find((r) => r.id === mentorId(data.cls, data.faction));
    const atSanct = m && Math.hypot(m.x - P.pos.x, m.z - P.pos.z) < 30;
    const O = ORDERS[data.cls];
    setTimeout(() => G.ui.announce(`Bienvenue, ${data.name} !`, 'quest', atSanct
      ? `Vous voici ${au(Story.sanct(P)?.name || '')}, auprès ${de(O.order)}. Parlez ${aName(m.name)} (marqué d'un !) pour commencer la voie de l'Ordre. Z/S pour avancer, Q/D pour tourner, souris pour la caméra, Tab pour cibler, 1-2 pour attaquer.`
      : "Parlez aux personnages marqués d'un ! pour recevoir des quêtes. Z/S pour avancer, Q/D pour tourner, souris pour la caméra, Tab pour cibler, 1-2 pour attaquer."), 4800);
  }
}

// Mises à jour périodiques du jeu (PNJ, quêtes, découvertes)
let slowT = 0;
function gameTick(dt) {
  Quests.tick(dt);
  Profs.update(dt);
  Bots.update(dt);
  Party.update(dt);
  Chat.update(dt);
  Events.update(dt);
  Market.update(dt);
  slowT -= dt;
  if (slowT > 0) return;
  slowT = 0.5;
  NpcManager.update();
  const P = G.player;
  for (const h of HUBS) {
    if (h.faction !== P.faction) continue;
    const t = G.towns.spots[h.id].travel;
    if (t && Math.hypot(t.x - P.pos.x, t.z - P.pos.z) < 9) Win.discover(h.id);
  }
  // les PNJ fraîchement activés récupèrent leur marqueur de quête
  for (const r of NpcManager.recs) if (r.ent && r.ent.questMark !== r.mark) r.ent.questMark = r.mark || null;
}
(G.frameHooks ||= []).push(gameTick);
G.startGame = startGame;

let last = performance.now();
function loop(t) {
  requestAnimationFrame(loop);
  Perf.frame(t - last);
  const dt = Math.min(0.05, Math.max(0, (t - last) / 1000));
  last = t;
  G.dt = dt;
  G.time += dt;
  G.frame++;
  const sky = G.sky;
  sky.t = G.flags.fixedTime ?? Sky.timeOfDay();
  let focus;
  try {
    if (G.mode === 'game' && G.player) {
      G.player.update(dt);
      G.world.update(dt);
      updateFX(dt);
      updateTargetRing(dt);
      const P = G.player;
      G.cam.update(dt, G.input, { x: P.pos.x, y: P.pos.y + (P.mounted ? (P.mountSaddle || 1) * 0.8 : 0), z: P.pos.z, eye: 1.75 }, G.settings);
      G.camera.updateMatrixWorld(); // matrices à jour pour projeter noms et textes flottants sans retard
      for (const f of G.frameHooks || []) f(dt);
      UI.update(dt);
      focus = P.pos;
    } else {
      for (const f of G.titleHooks || []) f(dt);
      updateFX(dt);
      focus = G.titleFocus || new THREE.Vector3(-408, 10, 18);
    }
  } catch (e) {
    console.error(e);
  }
  sky.update(dt, focus, G.camera);
  const u = G.water.userData.uniforms;
  u.time.value += dt;
  u.fogColor.value.copy(G.scene.fog.color);
  u.fogNear.value = G.scene.fog.near;
  u.fogFar.value = G.scene.fog.far;
  u.night.value = sky.night;
  G.terrainSectors.update(G.player?.pos || G.camera.position, G.settings.viewDist, G.player?.flying ? 30 : G.player?.mounted ? 18 : 8);
  G.decor.update(G.camera.position, G.settings.viewDist, G.settings.quality);
  updateLandmarks(G.landmarks, dt);
  if (G.mode !== 'game' && G.stageOn && G.stage) G.renderer.render(G.stage.scene, G.stage.camera);
  else G.renderer.render(G.scene, G.camera);
  G.input.endFrame();
}

// ---------------------------------------------------------------------------
// Outils de test (console)
import { QUEST_BY_ID } from './data/quests.js';
import { makeGear } from './data/items.js';
import { buildCharacterModel } from './game/appearance.js';
import { classSkills, SKILL_BY_ID } from './data/skills.js';
import { autoBuild, talentPoints, basicSkill, specAbilityIds } from './game/talents.js';
import { CLASS_SPECS } from './data/specs.js';
window.__q = (id) => QUEST_BY_ID[id];
window.__skills = SKILL_BY_ID;
import { makeConsumable } from './data/items.js';
window.__mkShard = (n) => makeConsumable('shard', n);
window.__mkGear = (o) => makeGear(o);
import * as ItemsMod from './data/items.js';
window.__items = ItemsMod;
window.__terrain = { getHeight, zoneAt, getSlope, roadDist, waterDepth };
import * as ZonesMod from './data/zones.js';
window.__zones = ZonesMod;
import { MOB_BY_ID as MOBS_DBG } from './data/mobs.js';
window.__mobs = MOBS_DBG;
window.__dbg = {
  G,
  quick(cls = 'guerrier', faction = 0, level = 1, spec = null) {
    const d = newCharacter({ name: 'Testeur', cls, faction, app: { skin: 1, hair: 2, hairStyle: 0 } });
    if (spec) d.spec = spec;
    d.testMax = 1; startGame(d);
    equipForLevel(G.player, level);
    return 'ok';
  },
  // personnage tout neuf, comme à la création (départ au sanctuaire de son Ordre)
  fresh(cls = 'guerrier', faction = 0) {
    const d = newCharacter({ name: 'Initié', cls, faction, app: { skin: 1, hair: 2, hairStyle: 0 } });
    Story.placeNew(d);
    d.testMax = 1; startGame(d);
    return { pos: [Math.round(G.player.pos.x), Math.round(G.player.pos.z)], bind: d.bind };
  },
  // ancien personnage (sauvegarde d'avant la voie de l'Ordre) : rattrapage des chapitres
  legacy(cls = 'mage', faction = 1, level = 20) {
    const d = newCharacter({ name: 'Ancien', cls, faction, app: { skin: 2, hair: 1, hairStyle: 1 } });
    d.level = level;
    d.testMax = 1; startGame(d);
    return { done: Object.keys(d.quests.done).length, next: Story.next()?.ch };
  },
  spec(id) { return G.player.setSpec(id); },
  allSpecs() { const out = []; for (const cls in CLASS_SPECS) for (const id of CLASS_SPECS[cls]) out.push([cls, id]); return out; },
  tp(x, z) { G.player.teleport(x, z); return [x, z, getHeight(x, z)]; },
  // simulation rapide sans rendu (pour les tests automatiques)
  step(seconds, dt = 1 / 30, press = []) {
    const n = Math.round(seconds / dt);
    for (let i = 0; i < n; i++) {
      for (const k of press) G.input.pressed.add(k);
      G.dt = dt; G.time += dt; G.frame++;
      G.player.update(dt);
      G.world.update(dt);
      updateFX(dt);
      for (const f of G.frameHooks || []) f(dt);
      G.input.endFrame();
    }
    return this.state();
  },
  boss() {
    const E = G.events;
    E.boss.forced = true; E.boss.active = true; E.boss.spawn.active = true; E.boss.spawn.deadUntil = 0;
    for (const r of G.bots.recs) if (r.online && r.level >= 25) { r.goal = { x: E.boss.spawn.x, z: E.boss.spawn.z + 6, r: 16, fight: true, until: G.time + 900 }; r.x = E.boss.spawn.x + (Math.random() - 0.5) * 40; r.z = E.boss.spawn.z + 20 + Math.random() * 20; }
    return 'boss';
  },
  // combat automatique : se déplace vers la cible et utilise la barre (tests d'équilibrage)
  fight(seconds, dt = 1 / 20) {
    const P = G.player;
    const n = Math.round(seconds / dt);
    let k = 0;
    for (let i = 0; i < n; i++) {
      if (P.dead) break;
      if (!P.target || P.target.dead || P.target.kind !== 'mob') {
        const t = G.world.nearestEnemy(P, 60, false);
        if (t && t.kind === 'mob') { P.setTarget(t); P.engaged = t; }
      }
      const t = P.target;
      G.input.down.delete('KeyW');
      if (t && !t.dead) {
        const d = Math.hypot(t.pos.x - P.pos.x, t.pos.z - P.pos.z) - t.radius * 0.8;
        const basic = classSkills(P.cls).find((s) => s.basic);
        G.cam.yaw = Math.atan2(t.pos.x - P.pos.x, t.pos.z - P.pos.z);
        if (d > (basic.range || 3.6) - 0.5) G.input.down.add('KeyW');
        else if (i % 6 === 0) G.input.pressed.add('Digit' + ((k++ % 7) + 1));
        if (P.hp < P.stats.maxHp * 0.35 && P.potionCd <= 0) G.input.pressed.add('Digit9');
      }
      G.dt = dt; G.time += dt; G.frame++;
      P.update(dt); G.world.update(dt); updateFX(dt);
      for (const f of G.frameHooks || []) f(dt);
      G.input.endFrame();
    }
    G.input.down.delete('KeyW');
    return this.state();
  },
  hold(code, on = true) { if (on) G.input.down.add(code); else G.input.down.delete(code); },
  // instances : groupe complété par l'IA puis entrée directe
  inst(id = 'meche', o = {}) {
    const def = id === 'abime' ? { kind: 'infinite' } : { kind: id === 'tempetes' || id === 'cendre' ? 'raid' : 'dungeon' };
    const size = def.kind === 'raid' ? 10 : 5;
    G.party.ensure();
    if (size > 5) G.party.raid = true;
    if (o.fill !== false) {
      const roles = LFG.composition(size).list;
      const P = G.player;
      const lvl = def.kind === 'raid' ? Math.max(30, P.level) : P.level;
      for (const r of LFG.pickCompanions(roles, lvl, o.gearQ || 62)) { r.lfg = true; r.x = P.pos.x; r.z = P.pos.z; G.party.addBot(r); }
    }
    G.inst.enter(id, o);
    return G.inst.active?.key;
  },
  // alignement de modèles pour les captures : les 8 classes (joueurs) + 2 PNJ
  lineup(faction = 0, ilvl = 14, q = 80) {
    const P = G.player;
    const out = [];
    const list = ['guerrier', 'templier', 'mage', 'necro', 'archer', 'assassin', 'druide', 'chaman'];
    list.forEach((cls, i) => {
      const equip = {};
      for (const slot of ['weapon', 'offhand', 'chest', 'legs', 'hands', 'feet', ...(i % 2 ? ['head'] : [])]) {
        if (slot === 'offhand' && cls === 'archer') continue;
        equip[slot] = makeGear({ slot, cls, ilvl, quality: q });
      }
      const m = buildCharacterModel({ cls, faction, app: { skin: i % 5, hair: i % 8, hairStyle: i % 5 }, equip });
      const x = P.pos.x - 10.5 + i * 3, z = P.pos.z + 6;
      m.root.position.set(x, getHeight(x, z), z);
      m.root.rotation.y = Math.PI;
      G.scene.add(m.root);
      out.push(m);
    });
    window.__lineup = out;
    return out.length;
  },
  state() {
    const P = G.player;
    return { lvl: P.level, xp: P.data.xp, hp: Math.round(P.hp), maxHp: P.stats.maxHp, mp: Math.round(P.mp), pos: [Math.round(P.pos.x), Math.round(P.pos.z)], ents: G.world.entities.length, target: P.target?.name, gold: P.data.gold, dead: P.dead };
  },
};

boot().catch((e) => {
  console.error(e);
  const s = document.querySelector('#loading .ld-sub');
  if (s) s.textContent = 'Erreur de chargement : ' + e.message;
});
