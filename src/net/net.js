// Multijoueur en direct entre vrais joueurs, via la capacité « room » de l'artifact.
// Chaque joueur publie sa présence (position, état, équipement) et un petit tampon d'événements
// (dégâts aux monstres, JcJ, soins, discussion, groupe). Les monstres sont simulés localement ;
// leurs points de vie et leurs morts sont synchronisés par ces événements.
import * as THREE from 'three';
import { G } from '../game/state.js';
import { Entity } from '../game/entity.js';
import { buildCharacterModel } from '../game/appearance.js';
import { createModel } from '../game/models.js';
import { MOB_BY_ID } from '../data/mobs.js';
import { dealDamage, heal, kill, isHostile, burst } from '../game/combat.js';
import { SKILL_BY_ID } from '../data/skills.js';
import { CLASSES } from '../data/classbase.js';
import { SPECS } from '../data/specs.js';
import { FACTIONS } from '../data/zones.js';
import { projectile as fxProjectile, pillar } from '../game/fx.js';
import { getHeight, zoneAt } from '../world/terrain.js';
import { lerp, wrapAngle, escapeHtml, clamp } from '../core/util.js';
import { MockRoom } from './mockroom.js';
import { WORLD_VERSION } from '../data/world-space.js';

const SCH = ['phys', 'fire', 'frost', 'nature', 'arcane', 'shadow', 'holy', 'lightning', 'poison'];
const PROJ_BY_CLS = { mage: 'fire', archer: 'arrow', druide: 'thorn', guerrier: null };

// ---------------------------------------------------------------------------
class Remote extends Entity {
  constructor(peer, p) {
    super('remote');
    this.peer = peer;
    this.samples = [];
    this.lastSeq = 0;
    this.gone = false;
    this.apply(p, true);
  }
  get isLocalParty() { return !!this.partyWith; }
  get inMyParty() { return !!this.partyWith; }
  apply(p, first = false) {
    const oldEq = this.eqKey;
    this.name = String(p.n || 'Joueur').slice(0, 16);
    this.faction = p.f === 1 ? 1 : 0;
    this.cls = CLASSES[p.c] ? p.c : 'guerrier';
    this.spec = SPECS[p.s]?.cls === this.cls ? p.s : null;
    this.wantForm = p.fo === 'ours' || p.fo === 'felin' ? p.fo : null;
    this.level = Math.max(1, Math.min(30, p.l | 0));
    this.fame = p.fm | 0;
    this.fameRank = G.pvp?.rankName(this.fame, this.faction) || '';
    this.stats.maxHp = Math.max(1, p.mh | 0);
    this.stats.maxMp = Math.max(1, p.mm | 0 || 100);
    this.stats.armor = p.ar | 0;
    this.stats.dodge = 0; this.stats.block = 0; this.stats.dmgTaken = 1; this.stats.moveSpeed = 7;
    this.hp = Math.max(0, Math.min(this.stats.maxHp, p.hp | 0));
    this.mp = this.stats.maxMp * ((p.mp ?? 100) / 100);
    this.app = p.ap || {};
    this.eq = p.eq || {};
    this.eqKey = JSON.stringify([this.cls, this.faction, this.app, this.eq]);
    const wasDead = this.dead;
    this.dead = !!p.d;
    if (Array.isArray(p.p)) this.samples.push({ t: performance.now(), x: +p.p[0] || 0, z: +p.p[1] || 0, y: +p.p[2] || 0, r: +p.r || 0 });
    if (this.samples.length > 6) this.samples.shift();
    this.moving = !!p.mv;
    this.wantMount = !!p.mo; this.wingedMount = p.mo === 2; this.flying = p.mo === 2 && !!p.fl;
    this.targetKey = p.t || '';
    this.inst = String(p.in || '').slice(0, 60);
    this.petInfo = Array.isArray(p.pt) && MOB_BY_ID[p.pt[0]] ? [String(p.pt[0]), p.pt[1] | 0, p.pt[2] | 0, clean(p.pt[3]).slice(0, 24)] : null;
    if (first) { const s = this.samples[this.samples.length - 1]; if (s) { this.pos.set(s.x, s.y, s.z); this.ry = s.r; } }
    if (this.model && oldEq !== this.eqKey && !first) this.rebuild();
    if (this.model && wasDead !== this.dead) { if (this.dead) this.model.die(); else this.model.revive(); }
  }
  equipForModel() {
    // équipement compact : {slot: [palier, rareté, visuel]}
    const out = {};
    for (const k in this.eq) { const v = this.eq[k]; if (Array.isArray(v)) out[k] = { tier: v[0] | 0 || 1, rarity: v[1] | 0, visual: v[2] || null }; }
    return out;
  }
  createModel(scene) {
    this.model = buildCharacterModel({ cls: this.cls, faction: this.faction, app: this.app, equip: this.equipForModel() });
    scene.add(this.model.root);
    this.model.root.position.copy(this.pos);
    if (this.dead) this.model.die();
  }
  rebuild() {
    const m = this.mounted, f = this.formKind;
    if (m) this.dismount();
    if (f) this.setForm(null);
    this.model.root.parent?.remove(this.model.root);
    this.model.dispose();
    this.createModel(G.scene);
    if (m) this.mount();
    if (f) this.setForm(f);
  }
  update(dt) {
    // interpolation : on vise la position d'il y a ~120 ms
    const now = performance.now() - 120;
    const S = this.samples;
    if (S.length) {
      let a = S[0], b = S[S.length - 1];
      for (let i = 0; i < S.length - 1; i++) if (S[i].t <= now && S[i + 1].t >= now) { a = S[i]; b = S[i + 1]; break; }
      const k = b.t > a.t ? Math.min(1, Math.max(0, (now - a.t) / (b.t - a.t))) : 1;
      const x = lerp(a.x, b.x, k), z = lerp(a.z, b.z, k), y = lerp(a.y, b.y, k);
      const dx = x - this.pos.x, dz = z - this.pos.z;
      this.speedNow = dt > 0 ? Math.min(14, Math.hypot(dx, dz) / dt) : 0;
      if (Math.hypot(dx, dz) > 30) this.pos.set(x, y, z);
      else { this.pos.x = x; this.pos.z = z; this.pos.y = y; }
      this.ry = this.ry + wrapAngle(lerp(0, wrapAngle(b.r - this.ry), Math.min(1, dt * 12)));
    }
    if (this.wantMount && !this.mounted && !this.dead) this.mount();
    if (!this.wantMount && this.mounted) this.dismount();
    if (this.model && (this.formKind || null) !== (this.dead ? null : this.wantForm)) this.setForm(this.dead ? null : this.wantForm);
    if (this.cast) { this.cast.time += dt; if (this.cast.time > this.cast.dur + 0.5) this.cast = null; }
    for (let i = this.buffs.length - 1; i >= 0; i--) { const b = this.buffs[i]; b.t += dt; if (b.t >= b.dur) this.buffs.splice(i, 1); }
    this.syncModel(dt);
  }
  recalc() { this.statsDirty = false; }
}

// Familier d'un autre vrai joueur : simple compagnon visuel qui suit son maître (pas de combat simulé ici)
class RemotePet extends Entity {
  constructor(owner, info) {
    super('pet');
    this.owner = owner;
    this.noTarget = true;
    this.remotePet = true;
    this.key = info.join('|');
    this.def = MOB_BY_ID[info[0]];
    this.name = String(info[3] || this.def.name).slice(0, 24);
    this.level = Math.max(1, Math.min(40, info[1] | 0));
    this.rarity = Math.max(0, Math.min(3, info[2] | 0));
    this.faction = owner.faction;
    this.stats = { maxHp: 1, maxMp: 1, moveSpeed: 8 };
    this.hp = 1;
  }
  get isLocalParty() { return false; }
  createModel(scene) {
    const spec = this.def.model;
    this.model = createModel(spec);
    if (spec.weapon) this.model.setWeapon(spec.weapon, spec.weaponColors);
    const k = Math.max(0.28, Math.min(1, 1.8 / (this.model.height || 1)));
    if (k < 1) { this.model.root.scale.multiplyScalar(k); this.model.height *= k; this.model.radius *= k; }
    this.radius = this.model.radius;
    scene.add(this.model.root);
    this.teleport(this.owner.pos.x - 2, this.owner.pos.z - 2);
  }
  recalc() { this.statsDirty = false; }
  update(dt) {
    const o = this.owner;
    const tx = o.pos.x - Math.sin(o.ry) * 2 + Math.cos(o.ry) * 1.4, tz = o.pos.z - Math.cos(o.ry) * 2 - Math.sin(o.ry) * 1.4;
    const d = Math.hypot(tx - this.pos.x, tz - this.pos.z);
    this.speedNow = 0;
    if (d > 30) this.teleport(tx, tz);
    else if (d > 0.8) {
      const step = Math.min(d, Math.min(d * 3, 14) * dt);
      this.ry = Math.atan2(tx - this.pos.x, tz - this.pos.z);
      this.pos.x += ((tx - this.pos.x) / d) * step; this.pos.z += ((tz - this.pos.z) / d) * step;
      this.speedNow = dt > 0 ? step / dt : 0;
    }
    this.pos.y = this.groundY();
    const vis = o.visible !== false && !o.dead;
    if (this.visible !== vis) this.setVisible(vis);
    this.syncModel(dt);
  }
}

// valeurs reçues d'autres joueurs : bornées à ce qu'un personnage de ce niveau peut plausiblement infliger
const netCap = (r, v, k = 1) => Math.max(0, Math.min((120 + r.level * 85) * k, +v || 0));
const clean = (t) => String(t || '').replace(/[\p{Cc}\p{Co}]|(?!\u200d)\p{Cf}/gu, '');

// ---------------------------------------------------------------------------
export const Net = {
  room: null,
  remotes: new Map(),
  me: null,
  seq: 0,
  events: [],
  pubT: 0,
  connected: false,

  async init() {
    let room = null;
    try {
      if (location.hash.startsWith('#mockroom')) room = MockRoom();
      else if (window.claude?.use) room = await window.claude.use('room');
    } catch (e) { room = null; }
    if (!room) return;
    this.room = room;
    G.net = this;
    room.onPeers((ch) => this.onPeers(ch), () => {});
    room.onConnection?.((c) => { this.connected = c; }, () => {});
    this.connected = room.connected ? room.connected() : true;
    G.world.on('kill', (tgt, src) => {
      if (tgt === G.player) this.emit('dk', src && src.kind === 'remote' ? src.peer : '');
    });
  },

  // ---------------------------------------------------------------------------
  emit(kind, ...args) {
    this.seq++;
    this.events.push([this.seq, kind, ...args]);
    if (this.events.length > 14) this.events.shift();
    this.pubT = 0; // publication immédiate
  },

  eqCompact() {
    const out = {};
    const eq = G.player.data.equip;
    for (const k in eq) { const it = eq[k]; if (it) out[k] = [it.tier || 1, it.rarity || 0, it.visual || 0]; }
    return out;
  },

  targetKey(t) {
    if (!t) return '';
    if (t.kind === 'mob' && t.spawn && t.spawn.id !== undefined && !t.temp) return 'm' + t.spawn.id;
    if (t.kind === 'remote') return 'p' + t.peer;
    return '';
  },

  publish() {
    const P = G.player;
    if (!this.room) return;
    if (!P || G.mode !== 'game') {
      if (this._cleared) return;
      this._cleared = true;
      this.room.presence({ n: null, p: null, e: null }).catch(() => {});
      return;
    }
    this._cleared = false;
    const S = P.stats;
    const pres = {
      v: 1, worldVersion: WORLD_VERSION, n: clean(P.name).slice(0, 16), f: P.faction, c: P.cls, s: P.spec, fo: P.formKind || null, l: P.level, fm: P.data.fame,
      p: [Math.round(P.pos.x * 10) / 10, Math.round(P.pos.z * 10) / 10, Math.round(P.pos.y * 10) / 10], r: Math.round(P.ry * 100) / 100,
      mv: P.speedNow > 0.3 ? 1 : 0, mo: P.mounted ? (P.mountWinged ? 2 : 1) : 0, fl: P.flying ? 1 : 0, d: P.dead ? 1 : 0,
      hp: Math.round(P.hp), mh: S.maxHp, mp: Math.round((P.mp / S.maxMp) * 100), mm: S.maxMp, ar: Math.round(S.armor),
      ap: P.data.app, eq: this.eqCompact(), t: this.targetKey(P.target), zn: P.lastZone?.id || '', in: G.inst?.active?.key || '',
      pt: G.pets?.active && !G.pets.active.dead ? [G.pets.active.def.id, G.pets.active.level, G.pets.active.rarity || 0, clean(G.pets.active.name).slice(0, 24)] : null,
      e: this.events,
    };
    // la présence fusionnée est limitée à 4 Kio : on retire les événements les plus anciens si besoin
    let json = JSON.stringify(pres);
    if (json.length > 1800) {
      const enc = this._enc || (this._enc = new TextEncoder());
      while (pres.e.length && enc.encode(json).length > 3800) { pres.e = pres.e.slice(1); json = JSON.stringify(pres); }
    }
    this.room.presence(pres).catch(() => {});
  },

  update(dt) {
    if (!this.room) return;
    this.pubT -= dt;
    if (this.pubT <= 0) { this.pubT = 0.1; this.publish(); }
    // entités distantes dans le monde (seulement en jeu)
    if (G.mode === 'game') {
      const here = G.inst?.active?.key || '';
      for (const r of this.remotes.values()) {
        if (!r.inWorld) { r.createModel(G.scene); G.world.add(r); r.inWorld = true; }
        // un joueur dans une autre instance (ou dans le monde pendant que je suis en instance) est invisible
        const same = (r.inst || '') === here;
        if (r.otherSpace !== !same) { r.otherSpace = !same; r.noTarget = !same; r.setVisible(same); }
        // familier visible
        const pk = r.petInfo ? r.petInfo.join('|') : '';
        if ((r.pet?.key || '') !== pk) {
          if (r.pet) { G.world.remove(r.pet); r.pet = null; }
          if (pk) { r.pet = new RemotePet(r, r.petInfo); r.pet.createModel(G.scene); G.world.add(r.pet); }
        }
      }
    }
  },

  onPeers(ch) {
    for (const p of ch.peers) {
      if (p.isMe && p.sameTab) { this.me = p.peer; continue; }
      if (p.isMe) continue; // mon autre onglet
      if (p.kind && p.kind !== 'viewer') continue;
      this.upsert(p);
    }
    for (const p of ch.left) this.drop(p.peer);
  },

  upsert(p) {
    const pr = p.presence || {};
    if(pr.worldVersion !== WORLD_VERSION) { this.drop(p.peer); return; }
    if (!pr.n || !Array.isArray(pr.p)) { this.drop(p.peer); return; }
    let r = this.remotes.get(p.peer);
    if (!r) {
      r = new Remote(p.peer, pr);
      this.remotes.set(p.peer, r);
      r.lastSeq = Math.max(0, ...(pr.e || []).map((e) => e[0] || 0)); // ignore l'historique
      if (G.mode === 'game') G.ui.log(`◆ ${r.name} (${FACTIONS[r.faction].short}, niveau ${r.level}) est en ligne.`, 'sys');
      if (G.mode === 'game' && G.player) G.ui.refresh();
    } else r.apply(pr);
    // événements nouveaux
    const evs = Array.isArray(pr.e) ? pr.e : [];
    for (const e of evs) {
      if (!Array.isArray(e) || !(e[0] > r.lastSeq)) continue;
      r.lastSeq = e[0];
      try { this.handle(r, e); } catch (err) { /* événement mal formé */ }
    }
  },

  drop(peer) {
    const r = this.remotes.get(peer);
    if (!r) return;
    this.remotes.delete(peer);
    r.gone = true;
    if (r.pet) { G.world.remove(r.pet); r.pet = null; }
    if (r.inWorld) G.world.remove(r);
    if (G.party?.has?.(r)) G.party.remove(r, "s'est déconnecté.");
    if (G.mode === 'game') G.ui.log(`◆ ${r.name} s'est déconnecté.`, 'sys');
  },

  spawnById(id) {
    const s = G.world.spawns.find((x) => x.id === id);
    return s && s.ent && !s.ent.dead ? s.ent : null;
  },

  handle(r, e) {
    const [, k] = e;
    const P = G.player;
    const mine = (peer) => peer === this.me;
    const same = (r.inst || '') === (G.inst?.active?.key || '');
    switch (k) {
      case 'md': { // dégâts à un monstre
        if (!same) break;
        const m = this.spawnById(e[2]);
        if (m && r.inWorld && Math.hypot(m.pos.x - r.pos.x, m.pos.z - r.pos.z) < 70) dealDamage(r, m, netCap(r, e[3]), { fromNet: true, crit: !!e[4], school: SCH[e[5] | 0] || 'phys', silentText: !r.partyWith });
        break;
      }
      case 'mk': { // monstre tué
        if (!same) break;
        const m = this.spawnById(e[2]);
        if (m && Math.hypot(m.pos.x - r.pos.x, m.pos.z - r.pos.z) < 70) kill(m, r);
        break;
      }
      case 'pd': { // dégâts JcJ sur moi
        if (!P || !mine(e[2]) || P.dead) break;
        if (!isHostile(P, r)) break;
        dealDamage(r, P, netCap(r, e[3]), { fromNet: true, crit: !!e[4], school: SCH[e[5] | 0] || 'phys' });
        break;
      }
      case 'hl': {
        if (!P || !mine(e[2]) || P.dead || r.faction !== P.faction) break;
        heal(r, P, netCap(r, e[3], 1.2), { fromNet: true, noCrit: true });
        break;
      }
      case 'ch': {
        const ch = e[2] === 'fac' || e[2] === 'grp' ? e[2] : 'gen';
        const text = String(e[3] || '').slice(0, 140);
        if (!text) break;
        if (ch === 'fac' && P && r.faction !== P.faction) break;
        if (ch === 'grp' && !r.partyWith) break;
        G.ui.chat(ch, '◆ ' + r.name, text, false, r.faction);
        r.bubble = text; r.bubbleUntil = G.time + 5;
        break;
      }
      case 'cs': {
        const s = SKILL_BY_ID[e[2]];
        if (s) { r.cast = { s, time: 0, dur: Math.max(0.1, +e[3] || 1), channel: !!s.channel }; r.model?.play(s.channel ? 'channel' : 'cast', r.cast.dur); }
        break;
      }
      case 'cc': r.cast = null; break;
      case 'sk': {
        const s = SKILL_BY_ID[e[2]];
        r.cast = null;
        if (!s || !r.model) break;
        r.model.play(s.anim || 'attack', s.animDur || 0.45);
        const tk = String(e[3] || '');
        let tgt = null;
        if (tk.startsWith('m')) tgt = this.spawnById(+tk.slice(1));
        else if (tk.startsWith('p')) tgt = tk.slice(1) === this.me ? P : this.remotes.get(tk.slice(1)) || null;
        const kind = PROJ_BY_CLS[r.cls];
        if (tgt && kind && s.target === 'enemy' && s.range > 8) fxProjectile({ from: r.handPos(), target: tgt, kind, speed: 34 });
        if (tgt && s.target === 'ally') pillar(tgt.pos.x, tgt.pos.y, tgt.pos.z, '#8fe86a', 12, 2);
        break;
      }
      case 'pi': { // invitation de groupe
        if (!P || !mine(e[2]) || r.faction !== P.faction) break;
        G.ui.ask(`◆ <b>${escapeHtml(r.name)}</b> (niveau ${r.level} ${CLASSES[r.cls].name}) vous invite dans son groupe.`, () => {
          G.party.addRemote(r);
          this.emit('pa', r.peer);
        }, () => {}, 'Rejoindre', 'Refuser', 30);
        G.audio?.play('quest');
        break;
      }
      case 'pa': if (P && mine(e[2])) G.party.addRemote(r); break;
      case 'ii': { // invitation dans une instance (même graine = même donjon)
        if (!P || !r.partyWith || G.inst?.active?.key === `${e[2]}:${e[3]}:${e[4]}:${e[5]}`) break;
        const name = String(e[2]) === 'abime' ? "l'Abîme sans fin" : String(e[2]);
        G.ui.ask(`◆ <b>${escapeHtml(r.name)}</b> vous invite à le rejoindre dans ${escapeHtml(G.inst?.nameOf?.(e[2]) || name)}.`, () => {
          if (P.inCombat() || P.dead) { G.ui.error('Impossible pour le moment.'); return; }
          G.inst?.go(String(e[2]), { seed: e[3] >>> 0, diff: e[4] === 'heroic' ? 'heroic' : 'normal', floor: e[5] | 0, base: clamp(e[6] | 0, 1, 34), gf: clamp(+e[7] || 1, 0.4, 1), remote: true });
        }, () => {}, 'Rejoindre', 'Refuser', 45);
        G.audio?.play('quest');
        break;
      }
      case 'pl': if (G.party?.has?.(r)) G.party.remove(r, 'a quitté le groupe.'); break;
      case 'em': r.model?.play(e[2] === 'dance' ? 'dance' : e[2] === 'roar' ? 'roar' : 'wave', e[2] === 'dance' ? 4 : 1.5); break;
      case 'lv': {
        if (r.model) pillar(r.pos.x, r.pos.y, r.pos.z, '#ffe68a', 40, 3);
        if (r.partyWith || (P && Math.hypot(r.pos.x - P.pos.x, r.pos.z - P.pos.z) < 60)) G.ui.log(`◆ ${r.name} atteint le niveau ${e[2]} !`, 'sys');
        break;
      }
      case 'dk': { // un joueur réel est mort ; si c'est moi le tueur : Gloire
        if (P && mine(e[2])) G.pvp?.onKill(r, P);
        break;
      }
      case 'wb': break;
    }
  },

  // ---------------------------------------------------------------------------
  // appelés par le moteur de combat
  sendMobDamage(mob, amt, crit, school) {
    if (mob.temp || !mob.spawn || mob.spawn.id === undefined) return;
    this.emit('md', mob.spawn.id, Math.round(amt), crit ? 1 : 0, Math.max(0, SCH.indexOf(school)));
  },
  onMobKilled(mob, src) {
    if (!src || (src !== G.player && !(src.kind === 'bot' && src.rec?.party))) return;
    if (mob.temp || !mob.spawn) return;
    this.emit('mk', mob.spawn.id);
  },
  sendPvp(tgt, amt, school, crit) { this.emit('pd', tgt.peer, Math.round(amt), crit ? 1 : 0, Math.max(0, SCH.indexOf(school))); },
  sendHeal(tgt, amt) { this.emit('hl', tgt.peer, Math.round(amt)); },
  // caractères de contrôle et invisibles refusés par la présence (le ZWJ des émojis est conservé)
  sendChat(ch, text) { this.emit('ch', ch, clean(text).slice(0, 140)); },
  sendPartyInvite(r) { this.emit('pi', r.peer); },
  sendParty(what) { if (what === 'leave') this.emit('pl'); },
  sendEmote(n) { this.emit('em', n); },
  announceLevel(l) { this.emit('lv', l); },
  onLocalCast(c, s, t, pos, dur) { if (c === G.player) this.emit('cs', s.id, Math.round(dur * 100) / 100); },
  onLocalCastCancel(c) { if (c === G.player) this.emit('cc'); },
  onLocalSkill(c, s, t) { if (c === G.player) this.emit('sk', s.id, this.targetKey(t)); },
  onWorldBossKilled() { this.emit('wb'); },
};

// Non bloquant : la salle peut mettre plusieurs secondes à répondre (ou ne jamais être disponible).
export function initNet() {
  (G.frameHooks ||= []).push((dt) => Net.update(dt));
  (G.titleHooks ||= []).push((dt) => Net.update(dt));
  return Net.init().catch(() => {});
}
