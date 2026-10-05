import { PAINTED } from './painted.js';
// Fenêtre des runes (touche R) : onglet Fusion (3 runes identiques -> niveau suivant) et onglet Sertissage.
import { G } from '../game/state.js';
import { UI } from './hud.js';
import { icon, itemIcon } from './icons.js';
import { Runes } from '../game/runes.js';
import { RUNE_TYPES, RUNE_LIST, runeName, runeBonusText, fmtRuneNum, runeValue } from '../data/runes.js';
import { SLOTS, SLOT_NAMES, RARITY, ensureSockets } from '../data/items.js';
import { escapeHtml, fmtInt } from '../core/util.js';

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
export const runeIcon = (t) => icon(PAINTED['rune_' + t] ? 'rune_' + t : 'i_rune', RUNE_TYPES[t].color, { gem: RUNE_TYPES[t].color, sym: RUNE_TYPES[t].sym });

export function renderRunes(b, W) {
  const P = G.player;
  if (!P) return;
  UI.setMenuDot('runes', false);
  b.innerHTML = '';
  b.style.width = 'min(640px, 94vw)';
  const tab = W.sel.rtab || 'fuse';
  const tabs = h('div', 'tabs2 rn-tabs');
  for (const [id, name] of [['fuse', 'Fusion de runes'], ['sock', 'Sertissage']]) {
    const t = h('button', id === tab ? 'on' : '', name);
    t.onclick = () => { W.sel.rtab = id; W.sel.rsock = null; W.render(W.wins.get('runes')); };
    tabs.appendChild(t);
  }
  b.appendChild(tabs);
  if (tab === 'sock') renderSockets(b, W);
  else renderFusion(b, W);
}

// ---------------------------------------------------------------------------
function renderFusion(b, W) {
  const list = Runes.list();
  const head = h('div', 'rn-head');
  const total = Runes.total();
  head.innerHTML = `<div title="3 runes identiques = 1 rune du niveau suivant (+40 %). Sans limite."><b>${fmtInt(total)}</b> rune${total > 1 ? 's' : ''} <span class="muted">· 3 → 1 (+40 %)</span></div>`;
  const all = h('button', 'btn small', 'Tout fusionner');
  all.disabled = !list.some((x) => x.n >= 3);
  all.onclick = () => { Runes.fuseAll(); W.render(W.wins.get('runes')); };
  head.appendChild(all);
  b.appendChild(head);
  if (!list.length) {
    b.appendChild(h('div', 'rn-empty', 'Sacoche vide.'));
    return;
  }
  const grid = h('div', 'rn-grid');
  for (const t of RUNE_LIST) {
    const T = RUNE_TYPES[t];
    const mine = list.filter((x) => x.t === t).sort((a, c) => a.l - c.l);
    if (!mine.length) continue;
    const row = h('div', 'rn-row');
    row.style.setProperty('--rc', T.color);
    row.innerHTML = `<div class="rn-type"><img alt="" src="${runeIcon(t)}"><div><b>${escapeHtml(T.name)}</b><small>${escapeHtml(T.desc)}</small></div></div>`;
    const cells = h('div', 'rn-cells');
    for (const x of mine) {
      const c = h('div', 'rn-cell' + (x.n >= 3 ? ' can' : ''));
      c.innerHTML = `<img alt="" src="${runeIcon(t)}"><span class="lv">Niv. ${x.l} <span class="n">× ${fmtInt(x.n)}</span></span><span class="bn">${escapeHtml(runeBonusText(t, x.l))}</span>`;
      c.dataset.tip = `<div class="tn" style="color:${T.color}">${escapeHtml(runeName(t, x.l))}</div><div class="tg">${escapeHtml(runeBonusText(t, x.l))}</div><div class="tl">Vous en avez ${fmtInt(x.n)}.</div>${x.n >= 3 ? `<div class="td">Fusion : 3 × niv. ${x.l} → 1 × niv. ${x.l + 1} (${escapeHtml(runeBonusText(t, x.l + 1))})</div>` : `<div class="tl">Encore ${3 - x.n} pour une fusion.</div>`}`;
      UI.bindTip(c);
      if (x.n >= 3) {
        const f = h('button', 'btn small fz', `Fusionner → niv. ${x.l + 1}`);
        f.onclick = (e) => { e.stopPropagation(); Runes.fuse(t, x.l); UI.hideTip(); W.render(W.wins.get('runes')); };
        c.appendChild(f);
      }
      cells.appendChild(c);
    }
    row.appendChild(cells);
    grid.appendChild(row);
  }
  b.appendChild(grid);
  const keep = Runes.keepChance();
  if (keep > 0) b.appendChild(h('div', 'muted', `Runiste : ${Math.round(keep * 100)} % de rune conservée.`));
}

// ---------------------------------------------------------------------------
function sockItemRow(W, ref, it, label) {
  ensureSockets(it);
  const row = h('div', 'rn-it');
  const sl = h('div', `islot r${it.rarity || 0}`);
  sl.style.backgroundImage = `url(${itemIcon(it)})`;
  sl.dataset.tip = UI.itemTip(it, { equipped: !!ref.eq });
  UI.bindTip(sl);
  row.appendChild(sl);
  const body = h('div', '');
  body.innerHTML = `<div class="nm" style="color:${RARITY[it.rarity || 0].color}">${escapeHtml(it.name)}${it.upg ? ` +${it.upg}` : ''}</div><div class="sub">${escapeHtml(label)} — ${RARITY[it.rarity || 0].name} — ${it.sockets ? `${it.sockets} emplacement${it.sockets > 1 ? 's' : ''}` : 'aucun emplacement'}</div>`;
  const socks = h('div', 'rn-socks');
  const sel = W.sel.rsock;
  for (let i = 0; i < it.sockets; i++) {
    const r = it.runes[i];
    const on = sel && sel.i === i && ((ref.eq && sel.ref.eq === ref.eq) || (ref.bag !== undefined && sel.ref.bag === ref.bag));
    const btn = h('button', 'rn-sock' + (r ? ' on' : '') + (on ? ' sel' : ''));
    if (r && RUNE_TYPES[r.t]) {
      btn.style.setProperty('--rc', RUNE_TYPES[r.t].color);
      btn.innerHTML = `<img alt="" src="${runeIcon(r.t)}">Niv. ${r.l} — ${escapeHtml(runeBonusText(r.t, r.l))}`;
      btn.title = 'Clic : remplacer ou retirer';
    } else {
      btn.innerHTML = '◇ Emplacement vide';
      btn.title = 'Clic : sertir une rune';
    }
    btn.onclick = () => { W.sel.rsock = on ? null : { ref, i }; W.render(W.wins.get('runes')); };
    socks.appendChild(btn);
  }
  if (it.sockets) body.appendChild(socks);
  row.appendChild(body);
  // sélecteur de rune sous l'objet choisi
  if (sel && ((ref.eq && sel.ref.eq === ref.eq) || (ref.bag !== undefined && sel.ref.bag === ref.bag))) body.appendChild(picker(W, ref, it, sel.i));
  return row;
}

function picker(W, ref, it, idx) {
  const box = h('div', 'rn-pick');
  const cur = it.runes[idx];
  const top = h('div', 'spread');
  top.innerHTML = `<b>${cur ? 'Remplacer la rune' : 'Choisir une rune à sertir'}</b>`;
  if (cur) {
    const rm = h('button', 'btn small ghost', 'Retirer (retour dans la sacoche)');
    rm.onclick = () => { Runes.unsocket(ref, idx); W.sel.rsock = null; W.render(W.wins.get('runes')); };
    top.appendChild(rm);
  }
  box.appendChild(top);
  const list = Runes.list();
  if (!list.length) { box.appendChild(h('div', 'muted', 'Aucune rune dans la sacoche.')); return box; }
  const cells = h('div', 'rn-cells');
  for (const x of list) {
    const T = RUNE_TYPES[x.t];
    const c = h('div', 'rn-cell');
    c.style.borderColor = T.color + '88';
    c.innerHTML = `<img alt="" src="${runeIcon(x.t)}"><span class="lv">${escapeHtml(T.name)} ${x.l} <span class="n">× ${fmtInt(x.n)}</span></span><span class="bn">${escapeHtml(runeBonusText(x.t, x.l))}</span>`;
    c.onclick = () => { if (Runes.socket(ref, idx, x.t, x.l)) { W.sel.rsock = null; W.render(W.wins.get('runes')); } };
    cells.appendChild(c);
  }
  box.appendChild(cells);
  return box;
}

function renderSockets(b, W) {
  const P = G.player;
  const d = P.data;
  // total des bonus des runes portées
  const tot = {};
  for (const sl of SLOTS) for (const r of d.equip[sl]?.runes || []) if (r) tot[r.t] = (tot[r.t] || 0) + runeValue(r.t, r.l);
  const sum = Object.keys(tot).map((t) => `<span style="color:${RUNE_TYPES[t].color}">+${fmtRuneNum(tot[t])}${RUNE_TYPES[t].pct ? ' %' : ''} ${escapeHtml(RUNE_TYPES[t].name)}</span>`).join(' · ');
  b.appendChild(h('div', 'rn-head', `<div title="Clic sur un emplacement : sertir, remplacer ou retirer (la rune revient intacte)."><b>Équipement porté</b>${sum ? `<div style="margin-top:4px;font-size:13px">Bonus des runes : ${sum}</div>` : ''}</div>`));
  const items = h('div', 'rn-items');
  let n = 0;
  const none = [];
  for (const sl of SLOTS) {
    const it = d.equip[sl];
    if (!it) continue;
    ensureSockets(it);
    if (!it.sockets) { none.push(it); continue; }
    items.appendChild(sockItemRow(W, { eq: sl }, it, SLOT_NAMES[sl]));
    n++;
  }
  if (!n) items.appendChild(h('div', 'rn-empty', 'Aucun emplacement de rune.'));
  b.appendChild(items);
  if (none.length) b.appendChild(h('div', 'muted rn-none', `Sans emplacement : ${none.map((it) => `<span style="color:${RARITY[it.rarity || 0].color}">${escapeHtml(it.name)}</span>`).join(', ')}.`));
  // objets du sac qui ont des emplacements
  const bagItems = d.bag.map((it, i) => [it, i]).filter(([it]) => it && it.type === 'gear' && ensureSockets(it).sockets > 0);
  if (bagItems.length) {
    b.appendChild(h('h3', '', 'Dans le sac'));
    const l2 = h('div', 'rn-items');
    for (const [it, i] of bagItems) l2.appendChild(sockItemRow(W, { bag: i }, it, `Sac — ${SLOT_NAMES[it.slot]}`));
    b.appendChild(l2);
  }
}
