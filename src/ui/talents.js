// Fenêtre des talents (touche K) : spécialisations, arbre de talents façon grand MMO, grimoire des compétences.
import { G } from '../game/state.js';
import { UI } from './hud.js';
import { icon } from './icons.js';
import { CLASSES } from '../data/classbase.js';
import { SPECS, CLASS_SPECS, ROLE_LABEL, ROLE_GLYPH, specOf } from '../data/specs.js';
import { TREES, NODE_BY, TIER_PTS } from '../data/talents.js';
import { SKILL_BY_ID, classSkills, COMMON_SKILLS } from '../data/skills.js';
import { whyNot, canRemove, spent, talentPoints, nodeName, nodeIcon, fxLines, passiveText, specAbilityIds, basicSkill, abilityRank } from '../game/talents.js';
import { escapeHtml } from '../core/util.js';

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const ROLE_BG = { tank: '#2a4a8a', heal: '#2a6a3a', dps: '#7a2a2a' };
// géométrie de l'arbre (plus compacte sur les écrans peu hauts, pour que l'arbre entier reste visible)
const PAD = 14, LABEL = 30;
let CELL = 62, NODE = 46, TW = 0, TH = 0;
function sizeTree() {
  const hgt = window.innerHeight || 800;
  CELL = hgt < 680 ? 46 : hgt < 800 ? 54 : 62;
  NODE = CELL >= 62 ? 46 : CELL >= 54 ? 42 : 36;
  TW = LABEL + PAD * 2 + 4 * CELL;
  TH = PAD * 2 + 7 * CELL;
}
sizeTree();
const cx = (col) => LABEL + PAD + col * CELL + CELL / 2;
const cy = (row) => PAD + row * CELL + CELL / 2;

export function renderTalents(b, W) {
  const P = G.player;
  if (!P) return;
  b.innerHTML = '';
  b.style.width = 'min(700px, 96vw)';
  const tab = W.sel.ttab || 'tree';
  const top = h('div', 'tabs2 tal-tabs');
  for (const [id, name] of [['tree', 'Arbre de talents'], ['book', 'Grimoire']]) {
    const t = h('button', id === tab ? 'on' : '', name);
    t.onclick = () => { W.sel.ttab = id; W.render(W.wins.get('skills')); };
    top.appendChild(t);
  }
  const free = P.talentsFree();
  top.appendChild(h('span', 'tal-pts' + (free > 0 ? ' has' : ''), free > 0 ? `${free} point${free > 1 ? 's' : ''} de talent à dépenser` : `Points de talent : ${spent(P.talents)} / ${talentPoints(P.level)}`));
  b.appendChild(top);
  if (tab === 'book') renderBook(b, W);
  else renderTree(b, W);
}

// ---------------------------------------------------------------------------
function renderTree(b, W) {
  const P = G.player;
  const list = CLASS_SPECS[P.cls];
  if (!list.includes(W.sel.tview)) W.sel.tview = P.spec;
  const view = W.sel.tview;
  const row = h('div', 'tal-specs');
  row.style.gridTemplateColumns = `repeat(${list.length}, 1fr)`;
  for (const id of list) {
    const sp = SPECS[id];
    const n = spent(P.data.talents[id]);
    const btn = h('button', 'tal-spec' + (id === view ? ' on' : '') + (id === P.spec ? ' act' : ''));
    btn.style.setProperty('--th', sp.icon[1]);
    btn.innerHTML = `<img alt="" src="${icon(sp.icon[0], sp.icon[1])}"><span class="t"><b>${escapeHtml(sp.name)}</b><span class="r"><img alt="" src="${icon(ROLE_GLYPH[sp.role], ROLE_BG[sp.role])}">${ROLE_LABEL[sp.role]}${n ? ` · ${n} pt${n > 1 ? 's' : ''}` : ''}</span></span>${id === P.spec ? '<span class="badge">Active</span>' : ''}`;
    btn.onclick = () => { W.sel.tview = id; W.render(W.wins.get('skills')); };
    row.appendChild(btn);
  }
  b.appendChild(row);
  const wrap = h('div', 'tal-wrap');
  wrap.appendChild(treePanel(view, W));
  wrap.appendChild(infoPanel(view, W));
  b.appendChild(wrap);
}

function treePanel(specId, W) {
  const P = G.player;
  const sp = SPECS[specId];
  const active = specId === P.spec;
  const alloc = P.data.talents[specId] || {};
  const tree = TREES[specId];
  sizeTree();
  const box = h('div', 'tal-tree' + (active ? '' : ' preview'));
  box.style.setProperty('--node', NODE + 'px');
  box.style.width = TW + 'px';
  box.style.height = TH + 'px';
  box.style.setProperty('--th', sp.icon[1]);
  box.innerHTML = `<div class="tal-wm" style="background-image:url(${icon(sp.icon[0], sp.icon[1])})"></div>`;
  const inTree = spent(alloc);
  for (let r = 0; r < 7; r++) {
    const need = r * TIER_PTS;
    const lb = h('div', 'tal-row' + (inTree >= need ? ' ok' : ''), String(need));
    lb.style.top = `${cy(r) - 9}px`;
    lb.title = `Palier ${r + 1} : ${need} point${need > 1 ? 's' : ''} requis dans les paliers précédents`;
    box.appendChild(lb);
  }
  // flèches des prérequis
  let svg = `<svg class="tal-arrows" width="${TW}" height="${TH}" viewBox="0 0 ${TW} ${TH}" aria-hidden="true">`;
  for (const n of tree) {
    if (!n.req) continue;
    const q = NODE_BY[specId][n.req];
    const ok = (alloc[q.id] || 0) >= q.max;
    const x = cx(n.col), y1 = cy(q.row) + NODE / 2 + 3, y2 = cy(n.row) - NODE / 2 - 2;
    svg += `<g class="${ok ? 'ok' : ''}"><line x1="${x}" y1="${y1}" x2="${x}" y2="${y2 - 7}"/><path d="M${x - 7} ${y2 - 9} L${x + 7} ${y2 - 9} L${x} ${y2} Z"/></g>`;
  }
  svg += '</svg>';
  box.insertAdjacentHTML('beforeend', svg);
  for (const n of tree) {
    const r = alloc[n.id] || 0;
    const err = active ? whyNot(P, specId, n, alloc) : 'aperçu';
    const avail = active && !err;
    const state = r >= n.max ? 'max' : r > 0 ? 'part' : avail ? 'avail' : 'lock';
    const d = h('div', `tal-node ${state}${n.ability ? ' ab' : ''}`);
    d.style.left = `${cx(n.col) - NODE / 2}px`;
    d.style.top = `${cy(n.row) - NODE / 2}px`;
    const ic = nodeIcon(n);
    d.innerHTML = `<div class="ic" style="background-image:url(${icon(ic[0], ic[1])})"></div><span class="rk num">${r}/${n.max}</span>`;
    d.setAttribute('role', 'button');
    d.setAttribute('aria-label', `${nodeName(n)}, rang ${r} sur ${n.max}`);
    d.addEventListener('mousemove', (e) => UI.showTip(nodeTip(P, specId, n, active), e));
    d.addEventListener('mouseleave', () => UI.hideTip());
    if (active) {
      // après un clic, la fenêtre est reconstruite sous la souris : l'infobulle est remise à jour tout de suite
      const retip = (e) => { if (e.clientX || e.clientY) UI.showTip(nodeTip(P, specId, n, true), e); else UI.hideTip(); };
      d.addEventListener('click', (e) => { if (P.talentAdd(n.id)) { W.render(W.wins.get('skills')); retip(e); } });
      d.addEventListener('contextmenu', (e) => { e.preventDefault(); if (P.talentRemove(n.id)) { W.render(W.wins.get('skills')); retip(e); } });
    }
    box.appendChild(d);
  }
  return box;
}

function nodeTip(P, specId, n, active) {
  const alloc = P.data.talents[specId] || {};
  const r = alloc[n.id] || 0;
  let html;
  if (n.ability) {
    const s = SKILL_BY_ID[n.ability];
    html = UI.skillTip(s, Math.max(1, abilityRank(s, P.level))) + `<div class="tl" style="margin-top:4px">Talent : ${r ? 'appris' : 'apprend cette technique'} (palier ${n.row + 1})</div>`;
  } else {
    html = `<div class="tn">${escapeHtml(nodeName(n))}</div><div class="tl">Rang ${r}/${n.max} — palier ${n.row + 1}</div>`;
    if (r > 0) html += `<div class="td">${fxLines(n.fx, r).map(escapeHtml).join('<br>')}</div>`;
    if (r < n.max) html += `<div class="tl" style="margin-top:3px">${r ? 'Rang suivant :' : 'Effet :'}</div><div class="tg">${fxLines(n.fx, r + 1).map(escapeHtml).join('<br>')}</div>`;
  }
  if (!active) return html + `<div class="tl" style="margin-top:5px">Aperçu : activez « ${escapeHtml(SPECS[specId].name)} » pour dépenser des points dans cet arbre.</div>`;
  const err = r < n.max ? whyNot(P, specId, n, alloc) : null;
  if (err) html += `<div class="tr">${escapeHtml(err)}</div>`;
  const acts = [];
  if (r < n.max && !err) acts.push('Clic : apprendre');
  if (r > 0 && canRemove(specId, n, alloc)) acts.push('Clic droit : retirer');
  if (acts.length) html += `<div class="tl" style="margin-top:5px">${acts.join(' · ')}</div>`;
  return html;
}

function abilityRow(P, s, tag) {
  const on = !!P.skillRank(s.id);
  return `<div class="ti-ab${on ? '' : ' off'}" data-s="${s.id}"><img alt="" src="${icon(s.icon[0], s.icon[1])}" draggable="${on}"><span><b>${escapeHtml(s.name)}</b><small>${escapeHtml(tag)}</small></span></div>`;
}

function infoPanel(specId, W) {
  const P = G.player;
  const sp = SPECS[specId];
  const active = specId === P.spec;
  const d = h('div', 'tal-info');
  d.style.setProperty('--th', sp.icon[1]);
  const core = (sp.core || []).map((id) => SKILL_BY_ID[id]).filter(Boolean);
  const abil = TREES[specId].filter((n) => n.ability);
  d.innerHTML = `<div class="ti-head"><img alt="" src="${icon(sp.icon[0], sp.icon[1])}"><div><div class="ti-name">${escapeHtml(sp.name)}</div><div class="ti-role"><img alt="" src="${icon(ROLE_GLYPH[sp.role], ROLE_BG[sp.role])}">${ROLE_LABEL[sp.role]} · ${escapeHtml(CLASSES[sp.cls].name)}</div></div></div>
    <div class="ti-desc">${escapeHtml(sp.desc)}</div>
    <h3>Bonus inné — ${escapeHtml(sp.passiveName)}</h3><div class="ti-pass">${escapeHtml(passiveText(specId))}${sp.role === 'tank' ? ' · menace ×2,2' : ''}</div>
    ${core.length ? `<h3>Techniques de la spécialisation</h3><div class="ti-abs">${core.map((s) => abilityRow(P, s, s.specBasic ? 'Attaque de base' : 'Accordée d\'office')).join('')}</div>` : ''}
    <h3>Techniques de talent</h3><div class="ti-abs">${abil.map((n) => abilityRow(P, SKILL_BY_ID[n.ability], `Palier ${n.row + 1} · ${n.row * TIER_PTS} points`)).join('')}</div>`;
  d.querySelectorAll('.ti-ab').forEach((el) => {
    const s = SKILL_BY_ID[el.dataset.s];
    el.addEventListener('mousemove', (e) => UI.showTip(UI.skillTip(s, Math.max(1, abilityRank(s, P.level))), e));
    el.addEventListener('mouseleave', () => UI.hideTip());
    el.querySelector('img').addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', 'skill:' + s.id));
    el.addEventListener('click', () => placeSkill(P, s));
  });
  const foot = h('div', 'ti-foot');
  if (active) {
    const free = P.talentsFree(), used = spent(P.talents);
    foot.appendChild(h('div', 'ti-pts' + (free ? ' has' : ''), `<b class="num">${free}</b> point${free > 1 ? 's' : ''} disponible${free > 1 ? 's' : ''} <span class="muted">· ${used} dépensé${used > 1 ? 's' : ''} sur ${talentPoints(P.level)}</span>`));
    const rs = h('button', 'btn ghost small', 'Réinitialiser les talents');
    rs.disabled = !used;
    rs.onclick = () => UI.ask(`Réinitialiser tous vos talents « ${escapeHtml(sp.name)} » ? Les points vous sont rendus.`, () => { P.talentReset(); W.render(W.wins.get('skills')); }, null, 'Réinitialiser', 'Annuler');
    foot.appendChild(rs);
    foot.appendChild(h('div', 'muted ti-help', `Clic : apprendre un rang · clic droit : le retirer. Chaque palier s'ouvre avec ${TIER_PTS} points de plus dans cet arbre. Un point par niveau à partir du niveau 2.`));
  } else {
    const go = h('button', 'btn', `Activer « ${escapeHtml(sp.name)} »`);
    go.onclick = () => { if (P.setSpec(specId)) W.render(W.wins.get('skills')); };
    foot.appendChild(go);
    foot.appendChild(h('div', 'muted ti-help', 'Changement gratuit hors combat. Chaque spécialisation garde ses propres talents et sa propre barre d\'action.'));
  }
  d.appendChild(foot);
  return d;
}

function placeSkill(P, s) {
  if (!P.skillRank(s.id)) { UI.error(s.lvl > P.level ? `Niveau ${s.lvl} requis.` : s.spec && s.spec !== P.spec ? `Spécialisation ${SPECS[s.spec].name} requise.` : 'Pas encore apprise.'); return; }
  if (P.data.bar.some((x) => x && x.k === 's' && x.id === s.id)) { UI.notify(`${s.name} est déjà sur une barre.`); return; }
  if (P.placeOnBar(s.id)) UI.notify(`${s.name} placée sur la barre d'action.`);
  else UI.error("Barres d'action pleines : glissez la compétence sur un emplacement.");
}

// ---------------------------------------------------------------------------
function renderBook(b, W) {
  const P = G.player;
  const sp = specOf(P);
  const basic = basicSkill(P);
  b.appendChild(h('div', 'muted', "Glissez une compétence sur une barre d'action, ou cliquez pour la placer sur la première case libre. Les rangs augmentent tout seuls avec votre niveau."));
  const sections = [
    [CLASSES[P.cls].name, classSkills(P.cls)],
    [`Spécialisation : ${sp.name}`, specAbilityIds(sp.id).map((id) => SKILL_BY_ID[id]).filter(Boolean)],
    ['Communes', COMMON_SKILLS],
  ];
  for (const [title, list] of sections) {
    if (!list.length) continue;
    b.appendChild(h('h3', '', escapeHtml(title)));
    const g = h('div', 'book');
    for (const s of list) {
      const r = P.skillRank(s.id);
      const lock = !r;
      const why = lock ? (s.lvl > P.level ? `Niveau ${s.lvl}` : s.talent ? 'Talent requis' : s.id === 'x_monture' ? 'Monture requise' : 'Non apprise') : s.noRank ? (s === basic ? 'Attaque de base' : '') : `Rang ${r}/${s.max}${s === basic ? ' · attaque de base' : ''}`;
      const c = h('div', 'bk' + (lock ? ' lock' : '') + (s === basic ? ' basic' : ''));
      c.innerHTML = `<div class="ic" style="background-image:url(${icon(s.icon[0], s.icon[1])})"></div><div class="tx"><b>${escapeHtml(s.name)}</b><small>${why}</small></div>`;
      const ic = c.querySelector('.ic');
      ic.draggable = !lock;
      ic.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', 'skill:' + s.id));
      c.addEventListener('mousemove', (e) => UI.showTip(UI.skillTip(s, Math.max(1, r || abilityRank(s, P.level))), e));
      c.addEventListener('mouseleave', () => UI.hideTip());
      c.addEventListener('click', () => placeSkill(P, s));
      g.appendChild(c);
    }
    b.appendChild(g);
  }
}
