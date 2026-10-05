// Fenêtre des métiers (touche N) : 2 métiers primaires + 2 secondaires, atouts et défauts, recettes.
import { G } from '../game/state.js';
import { UI } from './hud.js';
import { icon } from './icons.js';
import { Profs } from '../game/profs.js';
import { Runes } from '../game/runes.js';
import { PROFS, PROF_LIST, PROF_MAX, TIER_REQ, TIER_NAMES, RECIPES, diffColor, MAX_PRIMARY, MAX_SECONDARY, matColor } from '../data/profs.js';
import { CONSUMABLES } from '../data/items.js';
import { CLASSES, CLASS_LIST } from '../data/classbase.js';
import { RUNE_TYPES, RUNE_LIST, runeName } from '../data/runes.js';
import { escapeHtml, fmtInt } from '../core/util.js';
import { runeIcon } from './runes.js';

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const DCOL = { red: '#ff5a4a', orange: '#ff9a3a', yellow: '#ffd24a', green: '#5fd35a', grey: '#9a9aa0' };
const WHERE = {
  mineur: 'Filons dans toutes les régions (palier 1 : régions de départ, 2 : Bois-Murmure et Canyon, 3 : Marais, 4 : Cœur d\'Orvalis, 5 : hautes terres). Touche F à côté d\'un filon, ou clic droit.',
  herboriste: 'Plantes dans toutes les régions, du palier 1 (régions de départ) au palier 5 (hautes terres). Touche F à côté d\'une plante, ou clic droit.',
  depeceur: 'Après avoir vaincu une bête, touche F (ou clic droit) sur son corps. Le palier dépend du niveau de la bête.',
  pecheur: "Face à l'eau, touche F : lacs et mer (paliers 1 à 3), Lac Gelé des Pics (4), lave de la Désolation (5). Attention au bouchon !",
};

export function renderProfs(b, W) {
  const P = G.player;
  if (!P) return;
  b.innerHTML = '';
  b.style.width = 'min(760px, 95vw)';
  const c = Profs.counts();
  b.appendChild(h('div', 'pf-head', `<div><b>Métiers</b> <span class="muted">— ${c.primary}/${MAX_PRIMARY} primaires, ${c.secondary}/${MAX_SECONDARY} secondaires</span></div>`));
  // --- métiers appris
  const mine = h('div', 'pf-mine');
  const slots = [...Profs.list().filter((p) => PROFS[p.id].kind === 'primary'), null, null].slice(0, MAX_PRIMARY).map((p) => ['primary', p])
    .concat([...Profs.list().filter((p) => PROFS[p.id].kind === 'secondary'), null, null].slice(0, MAX_SECONDARY).map((p) => ['secondary', p]));
  for (const [kind, p] of slots) mine.appendChild(p ? profCard(W, p) : emptyCard(kind));
  b.appendChild(mine);
  // --- recettes du métier sélectionné
  const sel = W.sel.prof && Profs.has(W.sel.prof) ? W.sel.prof : null;
  if (sel) {
    if (PROFS[sel].type === 'craft') b.appendChild(recipePanel(W, sel));
    else b.appendChild(h('div', 'pf-where', `<b>${escapeHtml(PROFS[sel].name)} — où récolter ?</b><div>${escapeHtml(WHERE[sel] || '')}</div>`));
  }
  // --- apprendre
  const avail = PROF_LIST.filter((id) => !Profs.has(id));
  if (avail.length) {
    b.appendChild(h('h3', '', 'Apprendre un métier'));
    const grid = h('div', 'pf-grid');
    for (const id of avail) grid.appendChild(learnCard(W, id));
    b.appendChild(grid);
  }
}

function perkHtml(Pd) {
  return `<div class="pf-perk up"><b>Atout — ${escapeHtml(Pd.atout.name)}</b> : ${escapeHtml(Pd.atout.text)}</div><div class="pf-perk down"><b>Défaut — ${escapeHtml(Pd.defaut.name)}</b> : ${escapeHtml(Pd.defaut.text)}</div>`;
}

function profCard(W, p) {
  const Pd = PROFS[p.id];
  const tier = TIER_REQ.filter((r) => p.skill >= r).length;
  const d = h('div', 'pf-card mine' + (W.sel.prof === p.id ? ' on' : ''));
  d.style.setProperty('--pc', Pd.color);
  d.innerHTML = `<div class="pf-top"><img alt="" src="${icon(Pd.glyph, Pd.color)}"><div><b>${escapeHtml(Pd.name)}</b> <span class="muted">${Pd.kind === 'primary' ? 'primaire' : 'secondaire'} · ${Pd.type === 'craft' ? 'artisanat' : 'récolte'}</span>
    <div class="pf-sk"><div class="bar pf-bar"><div class="f" style="transform:scaleX(${p.skill / PROF_MAX})"></div><span class="t num">${p.skill} / ${PROF_MAX} — ${TIER_NAMES[tier - 1]}</span></div></div></div></div>${perkHtml(Pd)}`;
  const row = h('div', 'row');
  const sh = h('button', 'btn small', Pd.type === 'craft' ? (W.sel.prof === p.id ? 'Masquer les recettes' : 'Recettes') : (W.sel.prof === p.id ? 'Masquer' : 'Où récolter ?'));
  sh.onclick = () => { W.sel.prof = W.sel.prof === p.id ? null : p.id; W.render(W.wins.get('profs')); };
  const ab = h('button', 'btn ghost small', 'Abandonner');
  ab.onclick = () => UI.ask(`Abandonner le métier ${escapeHtml(Pd.name)} ? Votre compétence (${p.skill}) sera perdue.`, () => { Profs.abandon(p.id); if (W.sel.prof === p.id) W.sel.prof = null; W.render(W.wins.get('profs')); }, null, 'Abandonner', 'Annuler');
  row.append(sh, ab);
  d.appendChild(row);
  return d;
}

function emptyCard(kind) {
  return h('div', 'pf-card empty', `<div class="muted">${kind === 'primary' ? 'Primaire' : 'Secondaire'} libre</div>`);
}

function learnCard(W, id) {
  const Pd = PROFS[id];
  const err = Profs.whyNotLearn(id);
  const d = h('div', 'pf-card learn' + (err ? ' off' : ''));
  d.style.setProperty('--pc', Pd.color);
  d.innerHTML = `<div class="pf-top"><img alt="" src="${icon(Pd.glyph, Pd.color)}"><div><b>${escapeHtml(Pd.name)}</b> <span class="muted">${Pd.kind === 'primary' ? 'primaire' : 'secondaire'} · ${Pd.type === 'craft' ? 'artisanat' : 'récolte'}</span><div class="pf-desc">${escapeHtml(Pd.desc)}</div></div></div>${perkHtml(Pd)}`;
  const bt = h('button', 'btn small', 'Apprendre');
  bt.disabled = !!err;
  if (err) bt.title = err;
  bt.onclick = () => { if (Profs.learn(id)) { W.sel.prof = id; W.render(W.wins.get('profs')); } };
  d.appendChild(bt);
  return d;
}

// ---------------------------------------------------------------------------
function matLine(cid, need) {
  const def = CONSUMABLES[cid];
  const have = G.inv.count((it) => it.cid === cid);
  const ok = have >= need;
  const col = def?.tint || '#cfd3da';
  return `<span class="pf-mat ${ok ? 'ok' : 'no'}" title="${escapeHtml(def?.desc || '')}"><img alt="" src="${icon(def?.icon || 'i_quest', '#3a4150', def?.tint ? { gem: col } : null)}">${escapeHtml(def?.name || cid)} <b class="num">${have}/${need}</b></span>`;
}

function recipePanel(W, profId) {
  const Pd = PROFS[profId];
  const sk = Profs.skill(profId);
  const box = h('div', 'pf-rec');
  const maxTier = TIER_REQ.filter((r) => sk + 10 >= r).length;
  W.sel.ptier = W.sel.ptier && W.sel.ptier <= 5 ? W.sel.ptier : maxTier;
  const tabs = h('div', 'tabs2');
  for (let t = 1; t <= 5; t++) {
    const bt = h('button', t === W.sel.ptier ? 'on' : '', `Palier ${t} <span class="muted">(${TIER_REQ[t - 1]})</span>`);
    bt.onclick = () => { W.sel.ptier = t; W.render(W.wins.get('profs')); };
    tabs.appendChild(bt);
  }
  box.appendChild(h('div', 'pf-rhead', `<b>Recettes — ${escapeHtml(Pd.name)}</b> <span class="muted">compétence ${sk}</span>`));
  box.appendChild(tabs);
  const list = RECIPES.filter((r) => r.prof === profId && r.tier === W.sel.ptier);
  if (!list.length) box.appendChild(h('div', 'muted', 'Aucune recette à ce palier.'));
  const P = G.player;
  for (const r of list) {
    const col = diffColor(sk, r.req);
    const row = h('div', 'pf-r');
    const o = (W.sel.popt ||= {})[r.id] ||= {};
    let opts = '';
    if (r.out.gear) {
      const classes = r.out.gear.any ? (r.out.gear.slot === 'ring' || r.out.gear.slot === 'amulet' ? null : CLASS_LIST) : r.out.gear.classes;
      if (classes) {
        if (!o.cls || !classes.includes(o.cls)) o.cls = classes.includes(P.cls) ? P.cls : classes[0];
        opts = `<label class="pf-opt">Pour : <select data-o="cls">${classes.map((c) => `<option value="${c}" ${c === o.cls ? 'selected' : ''}>${escapeHtml(CLASSES[c].name)}</option>`).join('')}</select></label>`;
      }
    }
    if (r.out.rune || r.out.transmute) {
      if (!o.type) o.type = CLASSES[P.cls].primary;
      opts = `<label class="pf-opt">Type : <select data-o="type">${RUNE_LIST.map((t) => `<option value="${t}" ${t === o.type ? 'selected' : ''}>${escapeHtml(RUNE_TYPES[t].name)}</option>`).join('')}</select></label>`;
      if (r.out.transmute) {
        const pairs = Runes.list().filter((x) => x.n >= 2);
        if (!o.from || !pairs.some((x) => x.t === o.from.t && x.l === o.from.l)) o.from = pairs[0] ? { t: pairs[0].t, l: pairs[0].l } : null;
        opts = `<label class="pf-opt">Runes : <select data-o="from">${pairs.length ? pairs.map((x) => `<option value="${x.t}:${x.l}" ${o.from && o.from.t === x.t && o.from.l === x.l ? 'selected' : ''}>2 × ${escapeHtml(runeName(x.t, x.l))} (vous : ${x.n})</option>`).join('') : '<option value="">Aucune paire de runes</option>'}</select></label> → ` + opts;
      }
    }
    const outName = r.out.item ? `${CONSUMABLES[r.out.item].name}${r.out.n > 1 ? ' ×' + r.out.n : ''}` : r.out.gear ? `Équipement (niv. d'objet ${[6, 12, 18, 24, 30][r.tier - 1]}, qualité selon votre compétence)` : r.out.rune ? `Rune niv. ${r.out.rune} (parfois ${r.out.rune + 1})` : 'Rune du type choisi, même niveau';
    row.innerHTML = `<div class="pf-rn"><b style="color:${DCOL[col]}">${escapeHtml(r.name)}</b> <span class="muted">(${r.req})</span><div class="pf-out">${escapeHtml(outName)}</div></div>
      <div class="pf-mats">${Object.entries(r.mats).map(([cid, n]) => matLine(cid, n)).join('')}</div><div class="pf-opts">${opts}</div>`;
    const acts = h('div', 'pf-acts');
    const err = Profs.whyNotCraft(r, o);
    const go = h('button', 'btn small', 'Fabriquer');
    go.disabled = !!err;
    if (err) go.title = err;
    go.onclick = () => { Profs.craft(r.id, { ...o }); };
    acts.appendChild(go);
    if (r.out.item) {
      const g5 = h('button', 'btn ghost small', '×5');
      g5.disabled = !!err || !Profs.matsOk(r, 2);
      g5.onclick = () => Profs.craft(r.id, { ...o }, 5);
      acts.appendChild(g5);
    }
    row.appendChild(acts);
    row.querySelectorAll('select').forEach((sel) => {
      sel.onchange = () => {
        const k = sel.dataset.o;
        if (k === 'from') { const [t, l] = sel.value.split(':'); o.from = t ? { t, l: +l } : null; } else o[k] = sel.value;
        W.render(W.wins.get('profs'));
      };
    });
    box.appendChild(row);
  }
  return box;
}
