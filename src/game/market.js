// Hôtel des ventes simulé : annonces des autres joueurs (bots), achat, mise en vente et ventes différées.
import { G } from './state.js';
import { Bots } from './bots.js';
import { Inv } from './inventory.js';
import { makeGear, makeConsumable, gearScore, SLOT_NAMES, RARITY, SLOTS, CONSUMABLES } from '../data/items.js';
import { CLASSES, CLASS_LIST } from '../data/classbase.js';
import { itemIcon } from '../ui/icons.js';
import { R } from '../core/rng.js';
import { escapeHtml, fmtInt, pick, clamp } from '../core/util.js';

const $ = (id) => document.getElementById(id);
const FEE = 0.05;

export const Market = {
  listings: [],
  t: 0,
  f: { slot: '', cls: 'mine', usable: true, sort: 'price' },

  init() {
    this.listings = [];
    for (let i = 0; i < 46; i++) this.addBotListing();
  },

  addBotListing() {
    const r = pick(R, Bots.recs);
    const P = G.player;
    let it;
    const k = R();
    if (k < 0.72) {
      const lvl = clamp(Math.round((P ? P.level : 10) + (R() - 0.35) * 16), 1, 32);
      const q = Math.round(45 + Math.pow(R(), 0.8) * 55);
      it = makeGear({ ilvl: lvl, quality: q, cls: R() < 0.5 && P ? P.cls : CLASS_LIST[Math.floor(R() * CLASS_LIST.length)] });
      if (R() < 0.25 && lvl > 8) it.upg = 1 + Math.floor(R() * Math.min(6, lvl / 5));
    } else if (k < 0.86) it = makeConsumable('shard', 5 + Math.floor(R() * 20));
    else if (k < 0.92) it = makeConsumable('shard_big', 1 + Math.floor(R() * 2));
    else it = makeConsumable(pick(R, ['pot_hp2', 'pot_hp3', 'pot_mp2', 'food2']), 5 + Math.floor(R() * 10));
    const base = it.type === 'gear' ? it.value * (1 + (it.upg || 0) * 0.35) : it.value * it.count;
    const price = Math.max(3, Math.round(base * (1.6 + R() * 2.2) * (it.rarity >= 3 ? 1.6 : 1)));
    this.listings.push({ id: 'l' + Math.random().toString(36).slice(2, 9), it, price, seller: r.name, faction: r.faction, t: Date.now() });
  },

  update(dt) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 60;
    // renouvellement des annonces
    const bot = this.listings.filter((l) => !l.mine);
    if (bot.length > 40) this.listings.splice(this.listings.indexOf(pick(R, bot)), 1);
    for (let i = 0; i < 2; i++) this.addBotListing();
    // ventes des annonces du joueur
    const P = G.player;
    if (!P) return;
    for (const l of (P.data.listings || []).slice()) {
      const v = l.it.type === 'gear' ? l.it.value * (1 + (l.it.upg || 0) * 0.35) : l.it.value * (l.it.count || 1);
      const ratio = l.price / Math.max(1, v);
      const chance = ratio <= 1.5 ? 0.55 : ratio <= 2.5 ? 0.3 : ratio <= 4 ? 0.12 : ratio <= 6 ? 0.04 : 0.01;
      if (R() < chance) {
        const gain = Math.round(l.price * (1 - FEE));
        P.data.gold += gain;
        P.data.listings.splice(P.data.listings.indexOf(l), 1);
        const buyer = pick(R, Bots.recs.filter((b) => b.faction === P.faction) || Bots.recs);
        G.ui.notify(`Hôtel des ventes : ${buyer?.name || 'Quelqu\'un'} a acheté ${l.it.name} pour ${fmtInt(l.price)} po (vous recevez ${fmtInt(gain)} po).`);
        G.audio?.play('coin');
        G.saveSoon?.();
        if (G.win?.isOpen('market')) G.win.refresh();
      }
    }
  },

  suggested(it) {
    const v = it.type === 'gear' ? it.value * (1 + (it.upg || 0) * 0.35) : it.value * (it.count || 1);
    return Math.max(2, Math.round(v * 2));
  },

  render(b, opts = {}) {
    const P = G.player;
    const tab = opts.tab || this.tab || 'buy';
    this.tab = tab;
    const tabs = document.createElement('div');
    tabs.className = 'tabs2';
    for (const [id, name] of [['buy', 'Acheter'], ['sell', 'Vendre'], ['mine', `Mes annonces (${(P.data.listings || []).length})`]]) {
      const t = document.createElement('button');
      t.textContent = name;
      if (id === tab) t.className = 'on';
      t.onclick = () => G.win.open('market', { tab: id });
      tabs.appendChild(t);
    }
    b.appendChild(tabs);
    if (tab === 'buy') this.renderBuy(b);
    else if (tab === 'sell') this.renderSell(b);
    else this.renderMine(b);
  },

  renderBuy(b) {
    const P = G.player, f = this.f;
    const bar = document.createElement('div');
    bar.className = 'row wrap';
    bar.style.marginBottom = '8px';
    const selSt = 'background:#0d1016;color:#ece3cf;border:1px solid #3b4354;padding:3px 6px;font-size:13px;pointer-events:auto';
    bar.innerHTML = `<select id="mk-slot" style="${selSt}" aria-label="Emplacement"><option value="">Tous les objets</option>${SLOTS.map((s) => `<option value="${s}" ${f.slot === s ? 'selected' : ''}>${SLOT_NAMES[s]}</option>`).join('')}<option value="mat" ${f.slot === 'mat' ? 'selected' : ''}>Matériaux</option><option value="potion" ${f.slot === 'potion' ? 'selected' : ''}>Potions et vivres</option></select>
      <select id="mk-cls" style="${selSt}" aria-label="Classe"><option value="mine" ${f.cls === 'mine' ? 'selected' : ''}>Ma classe</option><option value="" ${f.cls === '' ? 'selected' : ''}>Toutes classes</option>${CLASS_LIST.map((c) => `<option value="${c}" ${f.cls === c ? 'selected' : ''}>${CLASSES[c].name}</option>`).join('')}</select>
      <label style="pointer-events:auto;font-size:13px"><input type="checkbox" id="mk-use" ${f.usable ? 'checked' : ''}> Utilisable</label>
      <select id="mk-sort" style="${selSt}" aria-label="Tri"><option value="price" ${f.sort === 'price' ? 'selected' : ''}>Prix croissant</option><option value="lvl" ${f.sort === 'lvl' ? 'selected' : ''}>Niveau décroissant</option><option value="q" ${f.sort === 'q' ? 'selected' : ''}>Qualité décroissante</option></select>
      <span style="margin-left:auto">${`<span class="goldline num"><span class="coin"></span>${fmtInt(P.data.gold)}</span>`}</span>`;
    b.appendChild(bar);
    const rerender = () => G.win.open('market', { tab: 'buy' });
    bar.querySelector('#mk-slot').onchange = (e) => { f.slot = e.target.value; rerender(); };
    bar.querySelector('#mk-cls').onchange = (e) => { f.cls = e.target.value; rerender(); };
    bar.querySelector('#mk-use').onchange = (e) => { f.usable = e.target.checked; rerender(); };
    bar.querySelector('#mk-sort').onchange = (e) => { f.sort = e.target.value; rerender(); };
    let list = this.listings.slice();
    list = list.filter((l) => {
      const it = l.it;
      if (f.slot === 'mat' && it.type !== 'mat') return false;
      if (f.slot === 'potion' && it.type !== 'potion' && it.type !== 'food') return false;
      if (f.slot && f.slot !== 'mat' && f.slot !== 'potion' && it.slot !== f.slot) return false;
      if (it.type === 'gear') {
        const cls = f.cls === 'mine' ? P.cls : f.cls;
        if (cls && it.cls && it.cls !== cls) return false;
        if (f.usable && (it.req || 1) > P.level) return false;
      }
      return true;
    });
    list.sort((a, c) => f.sort === 'price' ? a.price - c.price : f.sort === 'lvl' ? (c.it.ilvl || 0) - (a.it.ilvl || 0) : (c.it.quality || 0) - (a.it.quality || 0));
    const head = document.createElement('div');
    head.className = 'market-row market-head';
    head.innerHTML = `<span></span><span>Objet</span><span>Vendeur</span><span>Niveau</span><span style="text-align:right">Prix</span>`;
    b.appendChild(head);
    if (!list.length) b.appendChild(Object.assign(document.createElement('div'), { className: 'muted', textContent: 'Aucune annonce ne correspond à ces filtres.' }));
    for (const l of list.slice(0, 60)) {
      const row = document.createElement('div');
      row.className = 'market-row';
      const slot = G.win.itemSlot(l.it, { tip: { price: l.price, hint: 'Clic : acheter' } });
      row.appendChild(slot);
      const nm = document.createElement('span');
      nm.innerHTML = `<span style="color:${RARITY[l.it.rarity || 0].color};font-weight:600">${escapeHtml(l.it.name)}${l.it.upg ? ' +' + l.it.upg : ''}${l.it.count > 1 ? ' ×' + l.it.count : ''}</span>${l.it.type === 'gear' ? `<br><span class="muted" style="font-size:12px">${SLOT_NAMES[l.it.slot]} — ${l.it.quality} %${l.it.cls ? ' — ' + CLASSES[l.it.cls].name : ''}</span>` : ''}`;
      row.appendChild(nm);
      const sel = document.createElement('span'); sel.className = 'muted'; sel.textContent = l.mine ? 'Vous' : l.seller; row.appendChild(sel);
      const lv = document.createElement('span'); lv.className = 'num'; lv.textContent = l.it.type === 'gear' ? l.it.req : '—'; row.appendChild(lv);
      const pr = document.createElement('button');
      pr.className = 'btn small num'; pr.textContent = fmtInt(l.price) + ' po';
      pr.disabled = P.data.gold < l.price;
      pr.onclick = () => this.buy(l);
      row.appendChild(pr);
      b.appendChild(row);
    }
  },

  buy(l) {
    const P = G.player;
    if (P.data.gold < l.price) { G.ui.error("Vous n'avez pas assez d'or."); return; }
    if (!Inv.add(l.it, true)) return;
    P.data.gold -= l.price;
    this.listings.splice(this.listings.indexOf(l), 1);
    G.ui.notify(`Acheté : ${l.it.name} pour ${fmtInt(l.price)} po`);
    G.audio?.play('coin');
    G.ui.refresh();
    G.saveSoon?.();
  },

  renderSell(b) {
    const P = G.player;
    const it = P.data.bag.find((x) => x && x.uid === G.win.sel.sell);
    const info = document.createElement('div');
    info.className = 'muted';
    info.textContent = "Clic droit sur un objet de votre sac pour le préparer à la vente. L'hôtel des ventes prélève 5 % à la vente.";
    b.appendChild(info);
    if (!it) return;
    const box = document.createElement('div');
    box.className = 'row';
    box.style.marginTop = '12px';
    box.appendChild(G.win.itemSlot(it));
    const sug = this.suggested(it);
    const f = document.createElement('div');
    f.innerHTML = `<div style="font-weight:700;color:${RARITY[it.rarity || 0].color}">${escapeHtml(it.name)}${it.upg ? ' +' + it.upg : ''}</div><div class="muted" style="font-size:12.5px">Prix conseillé : ${fmtInt(sug)} po — vente rapide sous ${fmtInt(Math.round(sug * 0.75))} po</div>
      <div class="row" style="margin-top:6px"><input id="mk-price" type="number" min="1" value="${sug}" style="width:110px;background:#0d1016;color:#ece3cf;border:1px solid #3b4354;padding:5px;font-size:15px;pointer-events:auto" aria-label="Prix de vente"> <span>po</span></div>`;
    box.appendChild(f);
    b.appendChild(box);
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.style.marginTop = '10px';
    btn.textContent = 'Mettre en vente';
    btn.onclick = () => {
      const price = Math.max(1, Math.round(+document.getElementById('mk-price').value || sug));
      const idx = P.data.bag.indexOf(it);
      if (idx < 0) return;
      if ((P.data.listings || []).length >= 10) { G.ui.error('Maximum 10 annonces.'); return; }
      G.inv?.freeRunes?.(it);
      P.data.bag[idx] = null;
      (P.data.listings ||= []).push({ id: 'm' + Date.now(), it, price, mine: true });
      G.win.sel.sell = null;
      G.ui.notify(`${it.name} est en vente pour ${fmtInt(price)} po.`);
      G.win.open('market', { tab: 'mine' });
      G.ui.refresh();
      G.saveSoon?.();
    };
    b.appendChild(btn);
  },

  renderMine(b) {
    const P = G.player;
    const list = P.data.listings || [];
    if (!list.length) { b.appendChild(Object.assign(document.createElement('div'), { className: 'muted', textContent: "Vous n'avez aucune annonce en cours." })); return; }
    for (const l of list) {
      const row = document.createElement('div');
      row.className = 'market-row';
      row.style.gridTemplateColumns = '36px 1fr 90px 90px';
      row.appendChild(G.win.itemSlot(l.it));
      const nm = document.createElement('span');
      nm.innerHTML = `<span style="color:${RARITY[l.it.rarity || 0].color};font-weight:600">${escapeHtml(l.it.name)}</span>`;
      row.appendChild(nm);
      const pr = document.createElement('span'); pr.className = 'num gold'; pr.textContent = fmtInt(l.price) + ' po'; row.appendChild(pr);
      const c = document.createElement('button');
      c.className = 'btn ghost small'; c.textContent = 'Retirer';
      c.onclick = () => { if (Inv.add(l.it, true)) { list.splice(list.indexOf(l), 1); G.win.refresh(); } };
      row.appendChild(c);
      b.appendChild(row);
    }
  },
};
