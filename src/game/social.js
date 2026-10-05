// Groupe, JcJ (Gloire, rangs, classement) et discussion simulée des joueurs bots.
import { G, LEVEL_CAP } from './state.js';
import { isHealer } from '../data/specs.js';
import { Bots } from './bots.js';
import { FACTIONS, ZONES } from '../data/zones.js';
import { CLASSES } from '../data/classbase.js';
import { LINES, fill } from '../data/names.js';
import { MOBS } from '../data/mobs.js';
import { dist, isPlayerLike, isHostile } from './combat.js';
import { zoneAt } from '../world/terrain.js';
import { R } from '../core/rng.js';
import { pick, escapeHtml, fmtInt, clamp } from '../core/util.js';
import { icon } from '../ui/icons.js';

const $ = (id) => document.getElementById(id);

// ============================== GROUPE ==============================
export const Party = {
  members: [],
  raid: false, // groupe de raid (10 joueurs)
  get size() { return this.members.length; },
  get cap() { return this.raid ? 10 : 5; },

  ensure() {
    if (!this.members.length && G.player) this.members = [G.player];
  },
  has(e) { return this.members.includes(e); },

  addBot(rec) {
    this.ensure();
    if (this.members.length >= this.cap) { G.ui.error(`Le groupe est complet (${this.cap}).`); return false; }
    if (rec.party) return false;
    if (!rec.ent) Bots.activate(rec);
    rec.party = true;
    rec.slot = this.members.length;
    rec.online = true;
    rec.sessionT = Math.max(rec.sessionT, 1800);
    this.members.push(rec.ent);
    G.ui.log(`${rec.name} rejoint le groupe.`, 'grp');
    this.render();
    return true;
  },
  addRemote(r) {
    this.ensure();
    if (this.members.includes(r) || this.members.length >= this.cap) return false;
    r.partyWith = true;
    this.members.push(r);
    G.ui.log(`${r.name} rejoint le groupe.`, 'grp');
    this.render();
    return true;
  },
  remove(e, msg = 'quitte le groupe.') {
    const i = this.members.indexOf(e);
    if (i < 0) return;
    this.members.splice(i, 1);
    if (e.rec) { e.rec.party = false; e.target = null; e.moveGoal = null; }
    if (e.kind === 'remote') e.partyWith = false;
    G.ui.log(`${e.name} ${msg}`, 'grp');
    if (this.members.length <= 1) { this.members = []; this.raid = false; }
    this.render();
  },
  leave() {
    for (const e of this.members.slice()) if (e !== G.player) this.remove(e, 'a quitté le groupe.');
    this.members = [];
    this.raid = false;
    G.net?.sendParty?.('leave');
    this.render();
  },

  // recherche de groupe en un clic : des bots proches de votre niveau vous rejoignent
  findGroup() {
    const P = G.player;
    this.ensure();
    const need = this.cap - this.members.length;
    if (need <= 0) { G.ui.error('Votre groupe est déjà complet.'); return; }
    const cands = Bots.recs.filter((r) => r.online && !r.party && r.faction === P.faction && Math.abs(r.level - P.level) <= 3)
      .sort((a, b) => Math.hypot(a.x - P.pos.x, a.z - P.pos.z) - Math.hypot(b.x - P.pos.x, b.z - P.pos.z));
    // un soigneur en priorité
    const hasHealer = this.members.some((m) => isHealer(m));
    const picks = [];
    if (!hasHealer) { const h = cands.find((c) => isHealer(c)); if (h) picks.push(h); }
    for (const c of cands) { if (picks.length >= Math.min(need, 3)) break; if (!picks.includes(c)) picks.push(c); }
    if (!picks.length) { G.ui.error('Aucun joueur disponible de votre niveau pour le moment.'); return; }
    G.ui.notify('Recherche de groupe…');
    picks.forEach((r, i) => setTimeout(() => {
      if (!G.player || r.party) return;
      if (Math.hypot(r.x - P.pos.x, r.z - P.pos.z) > 120) { r.x = P.pos.x + (R() - 0.5) * 30; r.z = P.pos.z + (R() - 0.5) * 30; }
      if (this.addBot(r)) G.chat.say(r.ent, 'grp', pick(R, LINES.group));
    }, 800 + i * 900));
  },

  update(dt) {
    const P = G.player;
    if (!P || this.members.length <= 1) return;
    for (const e of this.members.slice()) {
      if (e === P) continue;
      if (e.kind === 'bot') {
        if (!e.rec.ent) { Bots.activate(e.rec); const i = this.members.indexOf(e); if (i >= 0) this.members[i] = e.rec.ent; }
      } else if (e.kind === 'remote' && e.gone) this.remove(e, 's\'est déconnecté.');
    }
    this.renderT = (this.renderT || 0) - dt;
    if (this.renderT <= 0) { this.renderT = 0.25; this.renderFrames(); }
  },

  renderFrames() {
    const el = $('party');
    if (!el) return;
    const P = G.player;
    const list = this.members.filter((m) => m !== P);
    if (!list.length) { if (el.innerHTML) el.innerHTML = ''; return; }
    el.classList.toggle('compact', list.length > 4);
    if (el.children.length !== list.length) {
      el.innerHTML = '';
      for (const m of list) {
        const d = document.createElement('div');
        d.className = 'pm panel';
        d.innerHTML = `<div class="top"><span class="nm"></span><span class="lv muted num"></span></div><div class="bar hp friendly"><div class="f"></div></div><div class="bar mp"><div class="f"></div></div>`;
        d.onclick = () => P.setTarget(d._e);
        el.appendChild(d);
      }
    }
    list.forEach((m, i) => {
      const d = el.children[i];
      d._e = m;
      d.querySelector('.nm').textContent = m.name;
      d.querySelector('.nm').style.color = CLASSES[m.cls]?.color || '#fff';
      d.querySelector('.lv').textContent = m.level;
      const hk = clamp(m.hp / (m.stats.maxHp || 1), 0, 1), mk = clamp((m.mp || 0) / (m.stats.maxMp || 1), 0, 1);
      d.querySelector('.hp .f').style.transform = `scaleX(${hk})`;
      d.querySelector('.mp .f').style.transform = `scaleX(${mk})`;
      d.classList.toggle('sel', P.target === m);
      d.classList.toggle('dead', !!m.dead);
      d.classList.toggle('far', dist(P, m) > 60);
      d.classList.toggle('pm-ia', !!m.rec?.lfg); // (pas « lfg » : cette classe met en page la fenêtre de recherche de groupe)
    });
  },
  render() { this.renderFrames(); G.ui.refresh(); },

  renderWindow(b) {
    const P = G.player;
    b.innerHTML = '';
    const h3 = (t) => { const x = document.createElement('h3'); x.textContent = t; b.appendChild(x); };
    h3(this.raid ? `Votre groupe de raid (${this.members.length}/10)` : 'Votre groupe');
    const list = this.members.length ? this.members : [P];
    for (const m of list) {
      const row = document.createElement('div');
      row.className = 'spread';
      row.style.cssText = 'padding:4px 0;border-bottom:1px solid #242b38';
      row.innerHTML = `<span><b style="color:${CLASSES[m.cls]?.color}">${escapeHtml(m.name)}</b> <span class="muted">niv. ${m.level} ${CLASSES[m.cls]?.name || ''}${m.kind === 'remote' ? ' ◆ joueur réel' : m === P ? ' (vous)' : m.rec?.lfg ? ' · compagnon IA' : ''}</span></span>`;
      if (m !== P) {
        const k = document.createElement('button');
        k.className = 'btn ghost small'; k.textContent = 'Exclure';
        k.onclick = () => { this.remove(m, 'a été exclu du groupe.'); G.win.refresh(); };
        row.appendChild(k);
      }
      b.appendChild(row);
    }
    const r = document.createElement('div');
    r.className = 'row wrap';
    r.style.marginTop = '10px';
    const f = document.createElement('button');
    f.className = 'btn'; f.textContent = 'Rechercher un groupe';
    f.onclick = () => { this.findGroup(); setTimeout(() => G.win.refresh(), 4000); };
    r.appendChild(f);
    if (this.members.length > 1) {
      const l = document.createElement('button');
      l.className = 'btn ghost'; l.textContent = 'Quitter le groupe';
      l.onclick = () => { this.leave(); G.win.refresh(); };
      r.appendChild(l);
    }
    b.appendChild(r);
    const tip = document.createElement('div');
    tip.className = 'muted'; tip.style.cssText = 'font-size:12.5px;margin-top:8px';

    // joueurs réels
    const remotes = G.net ? [...G.net.remotes.values()] : [];
    h3(`Joueurs réels connectés (${remotes.length})`);
    if (!remotes.length) {
      const d = document.createElement('div');
      d.className = 'muted'; d.style.fontSize = '13px';
      d.textContent = 'Aucun.';
      b.appendChild(d);
    }
    for (const rm of remotes) {
      const row = document.createElement('div');
      row.className = 'spread';
      row.style.cssText = 'padding:4px 0;border-bottom:1px solid #242b38';
      row.innerHTML = `<span>◆ <b style="color:${FACTIONS[rm.faction]?.color}">${escapeHtml(rm.name)}</b> <span class="muted">niv. ${rm.level} ${CLASSES[rm.cls]?.name || ''} — ${escapeHtml(zoneAt(rm.pos.x, rm.pos.z).name)}</span></span>`;
      if (rm.faction === P.faction && !this.members.includes(rm)) {
        const k = document.createElement('button');
        k.className = 'btn small'; k.textContent = 'Inviter';
        k.onclick = () => { G.net.sendPartyInvite(rm); G.ui.notify(`Invitation envoyée à ${rm.name}.`); };
        row.appendChild(k);
      }
      b.appendChild(row);
    }
    // joueurs proches (bots)
    h3('Joueurs à proximité');
    const near = G.world.entities.filter((e) => e.kind === 'bot' && e.faction === P.faction && !e.dead && dist(P, e) < 80).slice(0, 8);
    if (!near.length) { const d = document.createElement('div'); d.className = 'muted'; d.textContent = 'Personne à proximité.'; b.appendChild(d); }
    for (const e of near) {
      const row = document.createElement('div');
      row.className = 'spread';
      row.style.cssText = 'padding:3px 0';
      row.innerHTML = `<span><b style="color:${CLASSES[e.cls].color}">${escapeHtml(e.name)}</b> <span class="muted">niv. ${e.level} ${CLASSES[e.cls].name}</span></span>`;
      if (!e.rec.party) {
        const k = document.createElement('button');
        k.className = 'btn ghost small'; k.textContent = 'Inviter';
        k.onclick = () => { this.inviteBot(e.rec); setTimeout(() => G.win.refresh(), 1500); };
        row.appendChild(k);
      }
      b.appendChild(row);
    }
  },

  inviteBot(rec) {
    const P = G.player;
    setTimeout(() => {
      if (!rec.online) return;
      const ok = Math.abs(rec.level - P.level) <= 6 || R() < 0.3;
      if (ok && this.addBot(rec)) G.chat.say(rec.ent, 'grp', pick(R, LINES.group));
      else G.chat.whisper(rec, pick(R, ['Désolé, je fais mes quêtes seul pour le moment.', 'Pas maintenant, merci !', 'Je suis occupé, peut-être plus tard.']));
    }, 700 + R() * 1200);
  },
};

// ============================== JCJ ==============================
const RANKS = [
  [0, 'Recrue', 'Recrue'], [100, 'Soldat', 'Brute'], [300, 'Sergent', 'Guerrier'], [700, 'Écuyer', 'Pillard'], [1500, 'Chevalier', 'Écorcheur'],
  [3000, 'Chevalier-lieutenant', 'Chef de meute'], [5500, 'Capitaine', 'Chef de guerre'], [9000, 'Commandeur', 'Seigneur de guerre'],
  [14000, 'Maréchal', 'Haut-seigneur'], [20000, "Héros d'Azur", 'Héros de Braise'],
];
export const PvP = {
  rankIndex(f) { let i = 0; for (let k = 0; k < RANKS.length; k++) if (f >= RANKS[k][0]) i = k; return i; },
  rankName(fame, faction = G.player?.faction ?? 0) { const r = RANKS[this.rankIndex(fame || 0)]; return faction ? r[2] : r[1]; },
  nextRank(fame) { const i = this.rankIndex(fame); return RANKS[i + 1] ? RANKS[i + 1][0] : null; },

  init() {
    G.world.on('kill', (tgt, src) => this.onKill(tgt, src));
  },

  onKill(tgt, src) {
    const P = G.player;
    if (!P || !src || !isPlayerLike(tgt)) return;
    const killerIsMine = src === P || (src.isLocalParty && tgt !== P);
    // annonce proche
    if (dist(P, tgt) < 90 && tgt !== P && isPlayerLike(src)) G.ui.log(`${src.name} (${FACTIONS[src.faction].short}) a vaincu ${tgt.name} (${FACTIONS[tgt.faction].short})`, 'evt');
    if (tgt.kind === 'bot') {
      tgt.rec.deaths = (tgt.rec.deaths || 0) + 1;
      if (src.kind === 'bot') { src.rec.fame += 8; src.rec.pvpKills++; if (R() < src.rec.chatty * 0.4) G.chat.say(src, 'gen', pick(R, LINES.pvpBrag)); }
    }
    if (killerIsMine && tgt !== P && isHostile(P, tgt)) {
      const ld = clamp(tgt.level - P.level, -8, 5);
      if (ld <= -7) { G.ui.log('Cet adversaire est trop faible pour vous rapporter de la Gloire.', 'sys'); return; }
      const fame = Math.round(12 * (1 + ld * 0.15) * (tgt.kind === 'remote' ? 1.5 : 1));
      const before = this.rankIndex(P.data.fame);
      P.data.fame += fame;
      P.data.pvpKills++;
      G.ui.floatText(P, `+${fame} Gloire`, 'gold');
      G.ui.announce(`${tgt.name} vaincu`, 'pvp', `+${fame} Gloire`);
      const loot = tgt.kind === 'bot' ? Math.round(2 + tgt.level * (1 + R() * 2)) : 0;
      if (loot) { P.data.gold += loot; G.ui.goldMsg(loot); }
      if (this.rankIndex(P.data.fame) > before) {
        G.ui.announce('Nouveau rang !', 'level', this.rankName(P.data.fame));
        G.audio?.play('levelup');
      }
      G.world.emit('pvpKill', tgt);
      if (tgt.kind === 'bot' && R() < tgt.rec.chatty * 0.5) setTimeout(() => G.chat.say(tgt, 'gen', pick(R, LINES.pvpSad).replace('{z}', zoneAt(tgt.pos.x, tgt.pos.z).name)), 2000);
    }
    if (tgt === P && isPlayerLike(src) && src.faction !== P.faction && src.kind !== 'remote') {
      const lost = Math.floor(P.data.gold * 0.03);
      if (lost > 0) { P.data.gold -= lost; G.ui.log(`${src.name} vous a pris ${lost} po.`, 'err'); }
      if (src.kind === 'bot') { src.rec.fame += 10; src.rec.pvpKills++; if (R() < 0.5) setTimeout(() => G.chat.say(src, 'gen', pick(R, LINES.pvpBrag)), 1500); }
    }
  },

  // classement : bots + joueur + joueurs réels
  entries() {
    const P = G.player;
    const list = Bots.recs.map((r) => ({ name: r.name, faction: r.faction, level: r.level, cls: r.cls, fame: r.fame, pvp: r.pvpKills, online: r.online }));
    list.push({ name: P.name, faction: P.faction, level: P.level, cls: P.cls, fame: P.data.fame, pvp: P.data.pvpKills, me: true, online: true });
    if (G.net) for (const r of G.net.remotes.values()) list.push({ name: r.name, faction: r.faction, level: r.level, cls: r.cls, fame: r.fame || 0, pvp: 0, real: true, online: true });
    return list;
  },

  renderLadder(b, opts = {}) {
    const tab = opts.tab || this.tab || 'fame';
    this.tab = tab;
    const tabs = document.createElement('div');
    tabs.className = 'tabs2';
    for (const [id, name] of [['fame', 'Gloire'], ['level', 'Niveau'], ['pvp', 'Victoires JcJ'], ['war', 'Guerre des factions']]) {
      const t = document.createElement('button');
      t.textContent = name;
      if (id === tab) t.className = 'on';
      t.onclick = () => G.win.open('ladder', { tab: id });
      tabs.appendChild(t);
    }
    b.appendChild(tabs);
    if (tab === 'war') { this.renderWar(b); return; }
    const key = tab === 'fame' ? 'fame' : tab === 'level' ? 'level' : 'pvp';
    const list = this.entries().sort((a, c) => c[key] - a[key] || c.fame - a.fame);
    const meIdx = list.findIndex((e) => e.me);
    const head = document.createElement('div');
    head.className = 'lb-row market-head';
    head.innerHTML = `<span>#</span><span>Nom</span><span>Niveau</span><span>Classe</span><span style="text-align:right">${tab === 'pvp' ? 'Victoires' : 'Gloire'}</span>`;
    b.appendChild(head);
    const rows = list.slice(0, 25);
    if (meIdx >= 25) rows.push(list[meIdx]);
    for (const e of rows) {
      const i = list.indexOf(e);
      const d = document.createElement('div');
      d.className = 'lb-row' + (e.me ? ' me' : '');
      d.innerHTML = `<span class="rk num">${i + 1}</span><span><b style="color:${FACTIONS[e.faction].color}">${e.real ? '◆ ' : ''}${escapeHtml(e.name)}</b> <span class="muted" style="font-size:12px">${escapeHtml(this.rankName(e.fame, e.faction))}</span></span><span class="num">${e.level}</span><span style="color:${CLASSES[e.cls].color}">${CLASSES[e.cls].name}</span><span class="num" style="text-align:right;font-weight:700">${fmtInt(tab === 'pvp' ? e.pvp : e.fame)}</span>`;
      b.appendChild(d);
    }
  },

  renderWar(b) {
    const list = this.entries();
    const tot = [0, 0], online = [0, 0], lv30 = [0, 0];
    for (const e of list) { tot[e.faction] += e.fame; if (e.online) online[e.faction]++; if (e.level >= 30) lv30[e.faction]++; }
    const bast = G.events?.bastion;
    const d = document.createElement('div');
    d.className = 'kv';
    d.style.gridTemplateColumns = '1fr auto auto';
    d.innerHTML = `<span></span><span class="v azur">Pacte d'Azur</span><span class="v braise">Clans de Braise</span>
      <span>Gloire cumulée</span><span class="v">${fmtInt(tot[0])}</span><span class="v">${fmtInt(tot[1])}</span>
      <span>Combattants en ligne</span><span class="v">${online[0]}</span><span class="v">${online[1]}</span>
      <span>Vétérans (niveau 30)</span><span class="v">${lv30[0]}</span><span class="v">${lv30[1]}</span>`;
    b.appendChild(d);
    const p = document.createElement('div');
    p.className = 'qtext';
    p.style.marginTop = '12px';
    const owner = bast ? bast.owner : -1;
    p.innerHTML = `Bastion d'Orvalis : <b style="color:${owner >= 0 ? FACTIONS[owner].color : '#ccc'}">${owner >= 0 ? 'tenu par ' + FACTIONS[owner].name : 'neutre'}</b>.`;
    b.appendChild(p);
  },
};

// ============================== DISCUSSION SIMULÉE ==============================
export const Chat = {
  t: 6,
  say(e, ch, text) {
    if (!e || !text) return;
    G.ui.chat(ch, e.name, text, false, e.faction);
    if (e.model) { e.bubble = text; e.bubbleUntil = G.time + 5; }
  },
  whisper(rec, text) {
    G.ui.chat('wh', null, `[${rec.name}] vous chuchote : ${text}`);
  },
  vars(r) {
    const P = G.player;
    const zone = ZONES.find((z) => z.lvl[0] <= r.level && r.level <= z.lvl[1] + 1) || ZONES[4];
    const mobs = MOBS.filter((m) => m.zone === zone.id && !m.boss && !m.elite);
    const bosses = MOBS.filter((m) => (m.boss || m.elite) && Math.abs(m.lvl[0] - r.level) <= 5);
    const items = ['une épée d\'acier +5', 'un arc runique', 'une robe épique', 'des éclats runiques', 'un anneau rare', 'un bouclier de chevalier', 'des potions de soin'];
    return { z: zone.name, m: (pick(R, mobs) || MOBS[1]).name, b: (pick(R, bosses) || MOBS[7]).name, n: P?.name || '', l: r.level, i: pick(R, items) };
  },
  update(dt) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 7 + R() * 16;
    const P = G.player;
    const online = Bots.recs.filter((r) => r.online && r.faction === P.faction || r.online && R() < 0.3);
    if (!online.length) return;
    const r = pick(R, online);
    if (R() > 0.35 + r.chatty * 0.6) return;
    const kinds = ['chat', 'chat', 'lfg', 'sell', 'buy', 'chat'];
    const kind = G.events?.bossSoon?.() && R() < 0.5 ? 'boss' : pick(R, kinds);
    const text = fill(pick(R, LINES[kind]), this.vars(r));
    const ch = r.faction === P.faction && R() < 0.35 ? 'fac' : 'gen';
    if (ch === 'fac' && r.faction !== P.faction) return;
    G.ui.chat(ch, r.name, text, false, r.faction);
    if (r.ent) { r.ent.bubble = text; r.ent.bubbleUntil = G.time + 5; }
  },
  // réponses aux messages du joueur
  onPlayerChat(text, ch) {
    const P = G.player;
    const t = text.toLowerCase();
    const near = Bots.recs.filter((r) => r.online && r.faction === P.faction);
    if (!near.length) return;
    const r = ch === 'grp' ? (Party.members.find((m) => m.kind === 'bot')?.rec || null) : pick(R, near);
    if (!r) return;
    let reply = null;
    if (/(salut|bonjour|coucou|hello|yo\b|bonsoir|slt)/.test(t)) reply = fill(pick(R, LINES.greet), { n: P.name });
    else if (/(groupe|grp|group|lfg|qui vient|aide)/.test(t)) {
      reply = 'Je peux venir si tu veux !';
      if (!r.party && Math.abs(r.level - P.level) <= 5) setTimeout(() => { if (Party.addBot(r)) Chat.say(r.ent, 'grp', 'Me voilà !'); }, 2500);
    } else if (/(merci|thx|ty\b)/.test(t)) reply = pick(R, ['De rien !', 'Avec plaisir', 'np']);
    else if (/\?/.test(t)) reply = pick(R, LINES.help);
    else if (/(gg|bravo|bien joué)/.test(t)) reply = pick(R, ['gg', 'gg wp', 'Merci !']);
    else if (R() < 0.3) reply = pick(R, ['lol', 'Grave', 'Haha', 'Pas faux', '+1', 'C\'est clair']);
    if (reply) setTimeout(() => G.ui.chat(ch === 'grp' ? 'grp' : ch, r.name, reply, false, r.faction), 1500 + R() * 3000);
  },
};
