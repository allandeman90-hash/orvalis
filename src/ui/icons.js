import { PAINTED } from './painted.js';
import { gearIconKey } from '../data/items.js';
// Icônes dessinées à la volée sur canvas (compétences, objets, effets). Mises en cache en dataURL.
const cache = new Map();
const S = 64;

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f >= 1) { r += (255 - r) * (f - 1); g += (255 - g) * (f - 1); b += (255 - b) * (f - 1); }
  else { r *= f; g *= f; b *= f; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

// ---- primitives (contour fin et sombre, plus « peint » que « dessin animé »)
const OUTLINE = 'rgba(12,10,8,.78)';
const OUTW = 0.55;
function P(c, pts, fill, stroke = OUTLINE, lw = 3) {
  lw *= OUTW;
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.closePath();
  if (stroke) { c.lineWidth = lw; c.strokeStyle = stroke; c.lineJoin = 'round'; c.stroke(); }
  if (fill) { c.fillStyle = fill; c.fill(); }
}
function C(c, x, y, r, fill, stroke = OUTLINE, lw = 3) {
  lw *= OUTW;
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
  if (stroke) { c.lineWidth = lw; c.strokeStyle = stroke; c.stroke(); }
  if (fill) { c.fillStyle = fill; c.fill(); }
}
function L(c, pts, color, w = 4, cap = 'round') {
  c.beginPath(); c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.lineCap = cap; c.lineJoin = 'round';
  c.lineWidth = w + 3 * OUTW; c.strokeStyle = OUTLINE; c.stroke();
  c.lineWidth = w; c.strokeStyle = color; c.stroke();
}
function R(c, x, y, w, h, fill, stroke = OUTLINE, lw = 3) {
  lw *= OUTW;
  c.beginPath(); c.rect(x, y, w, h);
  if (stroke) { c.lineWidth = lw; c.strokeStyle = stroke; c.stroke(); }
  if (fill) { c.fillStyle = fill; c.fill(); }
}
function rot(c, x, y, a, fn) { c.save(); c.translate(x, y); c.rotate(a); fn(); c.restore(); }

// ---- motifs
function blade(c, col, len = 40, w = 7) {
  P(c, [0, -len, w / 2, -len + 7, w / 2, 0, -w / 2, 0, -w / 2, -len + 7], col);
  R(c, -9, 0, 18, 4, '#d9a441');
  R(c, -2.5, 4, 5, 10, '#6b4a2e');
  C(c, 0, 16, 3, '#d9a441', 'rgba(12,10,8,.78)', 2);
}
function arrowG(c, col = '#e8e0d0', len = 44) {
  L(c, [0, len / 2, 0, -len / 2 + 6], '#8a6440', 3);
  P(c, [0, -len / 2 - 4, 6, -len / 2 + 8, -6, -len / 2 + 8], '#d0d6de');
  P(c, [0, len / 2 - 8, 6, len / 2 + 2, 0, len / 2 - 2, -6, len / 2 + 2], col, 'rgba(12,10,8,.78)', 2);
}
function flame(c, x, y, s, c1 = '#ffb040', c2 = '#fff0a0') {
  P(c, [x, y - 22 * s, x + 12 * s, y - 4 * s, x + 10 * s, y + 10 * s, x, y + 16 * s, x - 10 * s, y + 10 * s, x - 12 * s, y - 4 * s, x - 4 * s, y - 10 * s], c1);
  P(c, [x, y - 8 * s, x + 6 * s, y + 4 * s, x, y + 12 * s, x - 6 * s, y + 4 * s], c2, null);
}
function star(c, x, y, r1, r2, n, fill) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? r2 : r1;
    pts.push(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  P(c, pts, fill);
}
function leaf(c, x, y, s, a, fill = '#8fe86a') {
  rot(c, x, y, a, () => {
    c.beginPath(); c.moveTo(0, -16 * s); c.quadraticCurveTo(12 * s, 0, 0, 16 * s); c.quadraticCurveTo(-12 * s, 0, 0, -16 * s);
    c.lineWidth = 1.8; c.strokeStyle = 'rgba(12,10,8,.78)'; c.stroke(); c.fillStyle = fill; c.fill();
    c.beginPath(); c.moveTo(0, -12 * s); c.lineTo(0, 13 * s); c.lineWidth = 1.5; c.strokeStyle = 'rgba(0,0,0,.4)'; c.stroke();
  });
}
function shieldS(c, x, y, s, fill, trim = '#d9a441') {
  P(c, [x - 16 * s, y - 18 * s, x + 16 * s, y - 18 * s, x + 16 * s, y + 2 * s, x, y + 20 * s, x - 16 * s, y + 2 * s], fill);
  L(c, [x, y - 14 * s, x, y + 14 * s], trim, 3 * s);
  L(c, [x - 12 * s, y - 6 * s, x + 12 * s, y - 6 * s], trim, 3 * s);
}
function drop(c, x, y, s, fill) {
  c.beginPath(); c.moveTo(x, y - 16 * s); c.bezierCurveTo(x + 14 * s, y, x + 10 * s, y + 14 * s, x, y + 14 * s); c.bezierCurveTo(x - 10 * s, y + 14 * s, x - 14 * s, y, x, y - 16 * s);
  c.lineWidth = 1.8; c.strokeStyle = 'rgba(12,10,8,.78)'; c.stroke(); c.fillStyle = fill; c.fill();
}
function bolt(c, x, y, s, fill = '#dff0ff') {
  P(c, [x + 4 * s, y - 22 * s, x - 10 * s, y + 2 * s, x - 1 * s, y + 2 * s, x - 6 * s, y + 22 * s, x + 11 * s, y - 4 * s, x + 2 * s, y - 4 * s], fill);
}
function flake(c, x, y, r, col = '#dff6ff') {
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI;
    L(c, [x - Math.cos(a) * r, y - Math.sin(a) * r, x + Math.cos(a) * r, y + Math.sin(a) * r], col, 3.5);
  }
  C(c, x, y, 4, col, 'rgba(12,10,8,.78)', 2);
}
function slashes(c, col = '#e04040') {
  for (let i = -1; i <= 1; i++) L(c, [18 + i * 10, 14, 34 + i * 10, 50], col, 5);
}
function crystal(c, x, y, s, fill) {
  P(c, [x, y - 20 * s, x + 9 * s, y - 4 * s, x + 6 * s, y + 18 * s, x - 6 * s, y + 18 * s, x - 9 * s, y - 4 * s], fill);
  L(c, [x, y - 16 * s, x, y + 14 * s], 'rgba(255,255,255,.6)', 1.5);
}
function swirl(c, x, y, r, col) {
  c.beginPath();
  for (let i = 0; i <= 40; i++) {
    const a = i * 0.3, rr = (i / 40) * r;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    i ? c.lineTo(px, py) : c.moveTo(px, py);
  }
  c.lineCap = 'round'; c.lineWidth = 7; c.strokeStyle = 'rgba(12,10,8,.78)'; c.stroke(); c.lineWidth = 4; c.strokeStyle = col; c.stroke();
}
function cross(c, x, y, s, fill = '#8fe86a') {
  P(c, [x - 5 * s, y - 16 * s, x + 5 * s, y - 16 * s, x + 5 * s, y - 5 * s, x + 16 * s, y - 5 * s, x + 16 * s, y + 5 * s, x + 5 * s, y + 5 * s, x + 5 * s, y + 16 * s, x - 5 * s, y + 16 * s, x - 5 * s, y + 5 * s, x - 16 * s, y + 5 * s, x - 16 * s, y - 5 * s, x - 5 * s, y - 5 * s], fill);
}
function chevrons(c, col) {
  for (let i = 0; i < 3; i++) L(c, [16 + i * 12, 18, 26 + i * 12, 32, 16 + i * 12, 46], col, 5);
}
function eye(c, x, y, col = '#e0c060') {
  c.beginPath(); c.moveTo(x - 20, y); c.quadraticCurveTo(x, y - 16, x + 20, y); c.quadraticCurveTo(x, y + 16, x - 20, y);
  c.lineWidth = 1.8; c.strokeStyle = 'rgba(12,10,8,.78)'; c.stroke(); c.fillStyle = '#f4f0e0'; c.fill();
  C(c, x, y, 7, col, 'rgba(12,10,8,.78)', 2); C(c, x, y, 3, 'rgba(12,10,8,.78)', null);
}

// ---- glyphes
const G = {
  sword: (c) => rot(c, 32, 34, 0.75, () => blade(c, '#d8dde4')),
  charge: (c) => { chevrons(c, '#ffd24a'); },
  shout: (c) => { P(c, [14, 26, 24, 26, 36, 14, 36, 50, 24, 38, 14, 38], '#e8c070'); for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(38, 32, 8 + i * 7, -0.7, 0.7); c.lineWidth = 3; c.strokeStyle = '#fff4d0'; c.stroke(); } },
  whirl: (c) => { swirl(c, 32, 32, 22, '#f0e6d0'); rot(c, 46, 20, 0.6, () => P(c, [0, -6, 6, 4, -6, 4], '#f0e6d0')); },
  bleed: (c) => { slashes(c, '#e04040'); drop(c, 46, 46, 0.45, '#c02020'); },
  shieldwall: (c) => { shieldS(c, 32, 32, 1.1, '#9aa2ae'); },
  bash: (c) => { shieldS(c, 28, 32, 0.9, '#6a7aa0'); star(c, 46, 20, 10, 4, 5, '#ffd24a'); },
  sunder: (c) => { shieldS(c, 32, 32, 1, '#8a8a90'); L(c, [22, 14, 34, 30, 28, 36, 40, 52], 'rgba(12,10,8,.78)', 3); },
  heal: (c) => cross(c, 32, 32, 1.2, '#7fe070'),
  leap: (c) => { c.beginPath(); c.arc(32, 48, 22, Math.PI, 0); c.lineWidth = 7; c.strokeStyle = 'rgba(12,10,8,.78)'; c.stroke(); c.lineWidth = 4; c.strokeStyle = '#ffd24a'; c.stroke(); P(c, [54, 44, 58, 54, 48, 52], '#ffd24a'); R(c, 8, 50, 48, 6, '#8a7a6a'); },
  rampart: (c) => { R(c, 12, 26, 40, 26, '#b8b0a0'); for (let i = 0; i < 4; i++) R(c, 12 + i * 11, 16, 7, 10, '#b8b0a0'); R(c, 28, 38, 8, 14, '#3a3030'); },
  titan: (c) => { C(c, 32, 32, 20, '#c83a2a'); flame(c, 32, 36, 0.9, '#ff7040', '#ffe080'); },
  fire: (c) => flame(c, 32, 36, 1.2),
  nova: (c) => { star(c, 32, 32, 26, 8, 8, '#dff6ff'); C(c, 32, 32, 7, '#8fd8ff'); },
  ashield: (c) => { C(c, 32, 32, 22, 'rgba(210,160,255,.35)', '#e0c0ff', 3); star(c, 32, 32, 12, 5, 4, '#f0d8ff'); },
  frost: (c) => flake(c, 32, 32, 20),
  firerain: (c) => { for (let i = 0; i < 3; i++) flame(c, 16 + i * 16, 30 + (i % 2) * 10, 0.55); },
  blink: (c) => { swirl(c, 26, 32, 18, '#e0b0ff'); rot(c, 50, 32, 0, () => P(c, [-6, -10, 6, 0, -6, 10], '#e0b0ff')); },
  chain: (c) => { bolt(c, 22, 26, 0.8); bolt(c, 42, 38, 0.7, '#9fd0ff'); },
  poly: (c) => { C(c, 30, 36, 16, '#f4f0e6'); C(c, 42, 22, 9, '#f4f0e6'); P(c, [50, 22, 58, 24, 50, 27], '#f0b030', 'rgba(12,10,8,.78)', 2); P(c, [40, 12, 44, 8, 46, 14], '#e04040', 'rgba(12,10,8,.78)', 2); C(c, 44, 20, 2, 'rgba(12,10,8,.78)', null); },
  meteor: (c) => { L(c, [54, 8, 30, 32], '#ffb040', 8); C(c, 26, 38, 13, '#ff7a2a'); C(c, 22, 34, 4, '#fff0a0', null); },
  meditate: (c) => { for (let i = 0; i < 5; i++) leaf(c, 32, 40, 0.8, (i - 2) * 0.5, '#9fd0ff'); C(c, 32, 22, 6, '#e0f0ff'); },
  ice: (c) => rot(c, 32, 32, 0.78, () => crystal(c, 0, 0, 1.4, '#dff6ff')),
  overload: (c) => { star(c, 32, 32, 24, 10, 6, '#d49aff'); star(c, 32, 32, 12, 5, 6, '#fff0ff'); },
  arrow: (c) => rot(c, 32, 32, 0.78, () => arrowG(c)),
  aim: (c) => { C(c, 32, 32, 20, null, '#f0e0a0', 4); C(c, 32, 32, 10, null, '#f0e0a0', 3); L(c, [32, 6, 32, 18], '#f0e0a0', 3); L(c, [32, 46, 32, 58], '#f0e0a0', 3); L(c, [6, 32, 18, 32], '#f0e0a0', 3); L(c, [46, 32, 58, 32], '#f0e0a0', 3); C(c, 32, 32, 3, '#e04040', null); },
  disengage: (c) => { rot(c, 32, 32, Math.PI, () => chevrons(c, '#b0f080')); },
  poison: (c) => { rot(c, 32, 32, 0.78, () => arrowG(c, '#b6e04a')); drop(c, 46, 44, 0.5, '#9ae040'); },
  volley: (c) => { for (let i = -1; i <= 1; i++) rot(c, 32, 36, i * 0.45, () => arrowG(c, '#e8e0d0', 40)); },
  trap: (c) => { c.beginPath(); c.arc(32, 36, 20, Math.PI, 0); c.lineWidth = 7; c.strokeStyle = 'rgba(12,10,8,.78)'; c.stroke(); c.lineWidth = 4; c.strokeStyle = '#c9ced6'; c.stroke(); for (let i = 0; i < 7; i++) P(c, [14 + i * 6, 36, 17 + i * 6, 28, 20 + i * 6, 36], '#e8ecf0', 'rgba(12,10,8,.78)', 1.5); R(c, 10, 36, 44, 5, '#8a8a90'); },
  slow: (c) => { C(c, 32, 32, 20, '#8fd8ff'); L(c, [32, 32, 32, 18], 'rgba(12,10,8,.78)', 3); L(c, [32, 32, 42, 38], 'rgba(12,10,8,.78)', 3); },
  hawk: (c) => eye(c, 32, 32),
  camo: (c) => { for (let i = 0; i < 4; i++) leaf(c, 20 + (i % 2) * 24, 22 + Math.floor(i / 2) * 22, 0.8, i * 1.3, i % 2 ? '#5a9a3a' : '#7fbf4a'); },
  arrowrain: (c) => { for (let i = 0; i < 4; i++) rot(c, 14 + i * 12, 30 + (i % 2) * 8, Math.PI, () => arrowG(c, '#e8e0d0', 30)); },
  pierce: (c) => { L(c, [8, 32, 56, 32], '#e0c060', 4); P(c, [58, 32, 48, 25, 48, 39], '#e8ecf0'); C(c, 26, 32, 7, null, '#f0f0f0', 2); C(c, 40, 32, 7, null, '#f0f0f0', 2); },
  deluge: (c) => { for (let i = 0; i < 3; i++) rot(c, 20 + i * 12, 32, 0.3, () => arrowG(c, '#9ae070', 36)); },
  thorn: (c) => { for (let i = 0; i < 3; i++) rot(c, 32, 32, -0.6 + i * 0.6, () => P(c, [0, -24, 5, 8, -5, 8], '#a0e070')); },
  regrowth: (c) => { leaf(c, 24, 30, 1, -0.5); leaf(c, 40, 30, 1, 0.5, '#6fd050'); L(c, [32, 50, 32, 36], '#6b4a2e', 4); },
  root: (c) => { for (let i = 0; i < 4; i++) L(c, [14 + i * 12, 58, 18 + i * 12, 38, 12 + i * 12, 24], '#6b4a2e', 5); leaf(c, 44, 20, 0.6, 0.4); },
  swarm: (c) => { for (let i = 0; i < 7; i++) { const a = i * 0.9, r = 8 + (i % 3) * 7; C(c, 32 + Math.cos(a) * r, 32 + Math.sin(a) * r, 3.5, '#c8e060', 'rgba(12,10,8,.78)', 2); } },
  pack: (c) => { for (let i = 0; i < 4; i++) C(c, 20 + i * 8, 20 + (i % 2) * 2, 4, '#dfe8e0'); C(c, 32, 38, 12, '#dfe8e0'); },
  circle: (c) => { C(c, 32, 32, 22, null, '#8fe86a', 5); cross(c, 32, 32, 0.6); },
  bark: (c) => { R(c, 12, 12, 40, 40, '#8a6440'); for (let i = 0; i < 4; i++) L(c, [16 + i * 10, 14, 20 + i * 10, 32, 14 + i * 10, 50], '#5a3e28', 3); },
  storm: (c) => { C(c, 24, 20, 10, '#9aa4b8', 'rgba(12,10,8,.78)', 2); C(c, 38, 18, 12, '#9aa4b8', 'rgba(12,10,8,.78)', 2); R(c, 16, 20, 34, 10, '#9aa4b8', null); bolt(c, 32, 42, 0.8); },
  renew: (c) => { C(c, 32, 32, 20, '#d0ffb0'); cross(c, 32, 32, 0.8, '#ffffff'); },
  bloom: (c) => { for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; C(c, 32 + Math.cos(a) * 12, 32 + Math.sin(a) * 12, 9, '#ffb0e0'); } C(c, 32, 32, 7, '#ffe070'); },
  avatar: (c) => { C(c, 32, 30, 16, '#3fbf9f'); for (let i = 0; i < 3; i++) L(c, [20 + i * 12, 16, 16 + i * 12, 4], '#e6dcc4', 3); leaf(c, 32, 48, 0.8, 0); },
  hearth: (c) => { P(c, [32, 10, 54, 30, 48, 30, 48, 52, 16, 52, 16, 30, 10, 30], '#7fb8ff'); R(c, 27, 38, 10, 14, '#2a3a5a'); },
  mount: (c) => { P(c, [18, 52, 22, 30, 16, 20, 28, 12, 44, 14, 50, 22, 44, 26, 38, 22, 36, 34, 42, 52], '#c8a060'); C(c, 30, 18, 2, 'rgba(12,10,8,.78)', null); },
  stun: (c) => { for (let i = 0; i < 3; i++) star(c, 16 + i * 16, 32 + (i % 2 ? -8 : 6), 9, 4, 5, '#ffd24a'); },
  silence: (c) => { C(c, 32, 32, 20, null, '#e04040', 5); L(c, [18, 46, 46, 18], '#e04040', 5); },
  web: (c) => { for (let i = 0; i < 4; i++) L(c, [32, 32, 32 + Math.cos(i * 0.8) * 26, 32 + Math.sin(i * 0.8) * 26], '#e8e8f0', 2); for (let r = 8; r < 28; r += 9) C(c, 32, 32, r, null, '#e8e8f0', 2); },
  weak: (c) => { L(c, [14, 16, 50, 48], '#9a9aa0', 6); P(c, [50, 48, 38, 46, 48, 36], '#9a9aa0'); },
  drain: (c) => { drop(c, 24, 34, 0.9, '#b58cff'); L(c, [34, 34, 52, 20], '#b58cff', 4); P(c, [54, 18, 44, 20, 50, 28], '#b58cff'); },
  potion: (c) => { drop(c, 32, 34, 1, '#ff6a6a'); },
  food: (c) => { C(c, 32, 36, 18, '#e0b050'); R(c, 18, 26, 28, 4, '#a07030', null); },
  immune: (c) => shieldS(c, 32, 32, 1, '#ffffff'),
  // ---- Templier
  dawn: (c) => { C(c, 32, 40, 14, '#ffe68a'); R(c, 6, 40, 52, 16, 'rgba(16,19,26,.9)', null); for (let i = 0; i < 5; i++) rot(c, 32, 40, -1.2 + i * 0.6, () => R(c, -2, -30, 4, 12, '#fff4c8', null)); rot(c, 32, 34, 0.7, () => blade(c, '#e8ecf0', 34, 6)); },
  aegis: (c) => { shieldS(c, 32, 32, 1.1, '#f0c850', '#fff4c8'); C(c, 32, 30, 7, '#fff8e0', 'rgba(12,10,8,.78)', 2); },
  challenge: (c) => { P(c, [32, 8, 40, 26, 58, 28, 44, 40, 48, 58, 32, 48, 16, 58, 20, 40, 6, 28, 24, 26], '#ffd24a'); C(c, 32, 34, 6, '#c83a2a', 'rgba(12,10,8,.78)', 2); },
  lightheal: (c) => { C(c, 32, 32, 22, 'rgba(255,240,160,.35)', '#ffe68a', 3); cross(c, 32, 32, 0.9, '#fff4c8'); },
  judge: (c) => { rot(c, 32, 32, -0.6, () => { R(c, -3, -8, 6, 32, '#8a6440'); R(c, -13, -20, 26, 14, '#ffe68a'); }); star(c, 46, 46, 9, 4, 5, '#fff4c8'); },
  seal: (c) => { C(c, 32, 32, 22, '#f0c850'); C(c, 32, 32, 15, null, '#8a6a20', 3); star(c, 32, 32, 11, 5, 6, '#fff4c8'); },
  hallow: (c) => { c.beginPath(); c.ellipse(32, 44, 26, 10, 0, 0, Math.PI * 2); c.fillStyle = '#ffe68a'; c.fill(); c.lineWidth = 1.8; c.strokeStyle = 'rgba(12,10,8,.78)'; c.stroke(); for (let i = 0; i < 4; i++) L(c, [14 + i * 12, 42, 14 + i * 12, 14 + (i % 2) * 8], '#fff4c8', 3); },
  veil: (c) => { c.beginPath(); c.moveTo(12, 54); c.quadraticCurveTo(10, 10, 32, 10); c.quadraticCurveTo(54, 10, 52, 54); c.closePath(); c.fillStyle = 'rgba(255,248,224,.75)'; c.fill(); c.lineWidth = 1.8; c.strokeStyle = 'rgba(12,10,8,.78)'; c.stroke(); C(c, 32, 30, 8, '#ffe68a'); },
  fervor: (c) => { for (let i = 0; i < 3; i++) C(c, 32, 32, 8 + i * 8, null, i % 2 ? '#fff4c8' : '#ffd24a', 4); C(c, 32, 32, 5, '#ffffff', null); },
  faithwall: (c) => { R(c, 12, 18, 40, 34, '#e8e0c8'); for (let i = 0; i < 4; i++) R(c, 12 + i * 11, 10, 7, 9, '#e8e0c8'); cross(c, 32, 36, 0.55, '#ffd24a'); },
  verdict: (c) => { rot(c, 32, 32, 0.8, () => { R(c, -3, -10, 6, 36, '#8a6440'); R(c, -14, -24, 28, 16, '#d8dde4'); R(c, -15, -18, 30, 4, '#ffd24a', null); }); bolt(c, 46, 42, 0.45, '#fff4c8'); },
  ascend: (c) => { C(c, 32, 30, 18, '#ffe68a'); for (let i = 0; i < 8; i++) rot(c, 32, 30, i * Math.PI / 4, () => P(c, [-3, -20, 3, -20, 0, -28], '#fff4c8', 'rgba(12,10,8,.78)', 1.5)); R(c, 22, 44, 20, 10, '#d9a441'); },
  // ---- Assassin
  dagger2: (c) => { rot(c, 26, 34, 0.6, () => blade(c, '#e8ecf0', 30, 6)); rot(c, 40, 34, -0.6, () => blade(c, '#c9ced6', 30, 6)); },
  envenom: (c) => { rot(c, 30, 34, 0.7, () => blade(c, '#b6e04a', 32, 6)); drop(c, 46, 44, 0.55, '#8ad030'); },
  shadowveil: (c) => { C(c, 32, 32, 22, '#2a1f2e', 'rgba(12,10,8,.78)', 3); c.beginPath(); c.arc(38, 28, 16, 0, Math.PI * 2); c.fillStyle = '#6a4a6a'; c.fill(); C(c, 26, 34, 3, '#e05a78', null); C(c, 36, 34, 3, '#e05a78', null); },
  shadowstep: (c) => { for (let i = 0; i < 3; i++) { c.globalAlpha = 0.35 + i * 0.3; P(c, [12 + i * 12, 50, 18 + i * 12, 22, 26 + i * 12, 22, 24 + i * 12, 50], '#e05a78'); } c.globalAlpha = 1; },
  gut: (c) => { slashes(c, '#ff4060'); rot(c, 42, 24, 0.8, () => blade(c, '#e8ecf0', 22, 5)); },
  blind: (c) => { eye(c, 32, 32, '#9a9aa0'); for (let i = 0; i < 6; i++) C(c, 14 + i * 7, 46 - (i % 2) * 6, 3, '#f0ead8', 'rgba(12,10,8,.78)', 1.5); },
  fan: (c) => { for (let i = 0; i < 5; i++) rot(c, 32, 46, -1 + i * 0.5, () => blade(c, '#e8ecf0', 30, 5)); },
  evasion: (c) => { for (let i = 0; i < 3; i++) { c.globalAlpha = 0.3 + i * 0.35; C(c, 18 + i * 12, 30, 7, '#e05a78'); R(c, 13 + i * 12, 38, 10, 16, '#e05a78'); } c.globalAlpha = 1; },
  mark: (c) => { C(c, 32, 32, 18, '#2a1a22', 'rgba(12,10,8,.78)', 3); L(c, [20, 20, 44, 44], '#ff4060', 5); L(c, [44, 20, 20, 44], '#ff4060', 5); },
  bladedance: (c) => { swirl(c, 32, 32, 20, '#e05a78'); for (let i = 0; i < 3; i++) rot(c, 32, 32, i * 2.1, () => rot(c, 0, -18, 1.2, () => blade(c, '#e8ecf0', 16, 4))); },
  execute: (c) => { rot(c, 32, 30, 0.2, () => { R(c, -3, -4, 6, 34, '#5a3e28'); P(c, [3, -22, 22, -12, 18, 6, 3, 0], '#d8dde4'); }); drop(c, 20, 48, 0.45, '#c02020'); },
  frenzy: (c) => { C(c, 32, 32, 20, '#8a1a2a'); for (let i = 0; i < 3; i++) rot(c, 32, 32, i * 2.1, () => blade(c, '#ffd0dc', 22, 5)); },
  // ---- Nécromancien
  necrobolt: (c) => { rot(c, 32, 32, 0.78, () => P(c, [0, -26, 7, 6, 0, 22, -7, 6], '#b58cff')); C(c, 26, 38, 5, '#e6dfcd', 'rgba(12,10,8,.78)', 2); },
  skeleton: (c) => { R(c, 20, 12, 24, 22, '#e6dfcd'); R(c, 24, 34, 16, 8, '#d0c8b4'); R(c, 24, 20, 6, 6, 'rgba(12,10,8,.78)', null); R(c, 34, 20, 6, 6, 'rgba(12,10,8,.78)', null); for (let i = 0; i < 3; i++) R(c, 22, 44 + i * 4, 20, 2.5, '#e6dfcd', null); },
  blight: (c) => { drop(c, 32, 30, 1.1, '#6a8a3a'); for (let i = 0; i < 4; i++) C(c, 18 + i * 9, 50 - (i % 2) * 4, 3, '#b58cff', 'rgba(12,10,8,.78)', 1.5); },
  siphon: (c) => { drop(c, 22, 38, 0.8, '#c02020'); L(c, [30, 34, 50, 20], '#b58cff', 5); C(c, 50, 18, 6, '#b58cff'); },
  wail: (c) => { C(c, 26, 30, 14, '#cfc6e8'); C(c, 21, 27, 3, 'rgba(12,10,8,.78)', null); C(c, 31, 27, 3, 'rgba(12,10,8,.78)', null); c.beginPath(); c.ellipse(26, 37, 4, 6, 0, 0, Math.PI * 2); c.fillStyle = 'rgba(12,10,8,.78)'; c.fill(); for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(40, 32, 6 + i * 6, -0.7, 0.7); c.lineWidth = 3; c.strokeStyle = '#b58cff'; c.stroke(); } },
  bonearmor: (c) => { shieldS(c, 32, 32, 1.05, '#e6dfcd', '#8a7ab8'); L(c, [22, 22, 42, 42], '#cfc6b0', 5); L(c, [42, 22, 22, 42], '#cfc6b0', 5); },
  necroblast: (c) => { star(c, 32, 34, 24, 9, 7, '#6a4a9a'); star(c, 32, 34, 12, 5, 7, '#e0d0ff'); },
  golem: (c) => { R(c, 16, 18, 32, 30, '#8a9a7a'); R(c, 24, 8, 16, 12, '#8a9a7a'); L(c, [20, 26, 44, 26], '#4a3a3a', 2); L(c, [30, 18, 30, 46], '#4a3a3a', 2); R(c, 26, 12, 4, 4, '#ffe040', null); R(c, 34, 12, 4, 4, '#ffe040', null); },
  curse: (c) => { C(c, 32, 32, 20, '#3a2a4a', 'rgba(12,10,8,.78)', 3); swirl(c, 32, 32, 14, '#b58cff'); },
  legion: (c) => { for (let i = 0; i < 3; i++) { R(c, 10 + i * 16, 16 + (i % 2) * 8, 13, 12, '#e6dfcd'); R(c, 12 + i * 16, 20 + (i % 2) * 8, 3, 3, 'rgba(12,10,8,.78)', null); R(c, 18 + i * 16, 20 + (i % 2) * 8, 3, 3, 'rgba(12,10,8,.78)', null); R(c, 12 + i * 16, 30 + (i % 2) * 8, 9, 14, '#cfc6b0'); } },
  reap: (c) => { L(c, [14, 56, 40, 12], '#6b4a2e', 5); c.beginPath(); c.moveTo(40, 12); c.quadraticCurveTo(58, 18, 52, 40); c.quadraticCurveTo(50, 26, 36, 20); c.closePath(); c.fillStyle = '#d8dde4'; c.fill(); c.lineWidth = 2; c.strokeStyle = 'rgba(12,10,8,.78)'; c.stroke(); },
  lich: (c) => { R(c, 20, 18, 24, 22, '#d8d0e8'); P(c, [18, 18, 22, 6, 28, 16, 32, 4, 36, 16, 42, 6, 46, 18], '#b58cff'); R(c, 25, 26, 5, 5, '#6affc0', null); R(c, 34, 26, 5, 5, '#6affc0', null); R(c, 26, 40, 12, 6, '#cfc6b0'); },
  // ---- Chaman
  arc: (c) => { bolt(c, 32, 30, 1.1, '#bfe8ff'); C(c, 18, 50, 5, '#2ab5ff', 'rgba(12,10,8,.78)', 2); },
  wave: (c) => { for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(8, 24 + i * 12); c.quadraticCurveTo(20, 14 + i * 12, 32, 24 + i * 12); c.quadraticCurveTo(44, 34 + i * 12, 56, 24 + i * 12); c.lineWidth = 7; c.strokeStyle = 'rgba(12,10,8,.78)'; c.stroke(); c.lineWidth = 4; c.strokeStyle = i === 1 ? '#bff0ff' : '#5fc8ff'; c.stroke(); } },
  totemheal: (c) => { R(c, 26, 22, 12, 34, '#8a6440'); R(c, 20, 10, 24, 16, '#b08a5a'); R(c, 25, 15, 4, 4, '#6fd8ff', null); R(c, 35, 15, 4, 4, '#6fd8ff', null); cross(c, 50, 46, 0.4, '#8fe0ff'); },
  scales: (c) => { for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C(c, 18 + j * 14 + (i % 2) * 7, 20 + i * 12, 7, '#2a8ac8', 'rgba(12,10,8,.78)', 2); bolt(c, 44, 42, 0.5, '#e0f4ff'); },
  chainheal: (c) => { C(c, 14, 44, 6, '#8fe0ff'); C(c, 32, 22, 6, '#8fe0ff'); C(c, 50, 44, 6, '#8fe0ff'); L(c, [14, 44, 32, 22, 50, 44], '#e0f8ff', 3); cross(c, 32, 22, 0.25, '#ffffff'); },
  totemfire: (c) => { R(c, 26, 26, 12, 30, '#8a6440'); R(c, 20, 14, 24, 14, '#b08a5a'); flame(c, 32, 16, 0.6); },
  quake: (c) => { R(c, 8, 38, 48, 14, '#8a6440'); L(c, [12, 38, 22, 46, 30, 38, 38, 48, 46, 38, 54, 44], 'rgba(12,10,8,.78)', 3); for (let i = 0; i < 3; i++) R(c, 14 + i * 16, 20 - (i % 2) * 6, 8, 8, '#a08060'); },
  ancestral: (c) => { C(c, 32, 26, 12, 'rgba(159,232,255,.6)', '#9fe8ff', 3); c.beginPath(); c.moveTo(20, 34); c.quadraticCurveTo(32, 60, 44, 34); c.fillStyle = 'rgba(159,232,255,.45)'; c.fill(); C(c, 28, 24, 2, 'rgba(12,10,8,.78)', null); C(c, 36, 24, 2, 'rgba(12,10,8,.78)', null); },
  tempest: (c) => { C(c, 22, 18, 10, '#6a7a98', 'rgba(12,10,8,.78)', 2); C(c, 38, 16, 12, '#6a7a98', 'rgba(12,10,8,.78)', 2); R(c, 14, 18, 34, 10, '#6a7a98', null); bolt(c, 24, 40, 0.6); bolt(c, 42, 42, 0.6, '#9fd8ff'); },
  tide: (c) => { c.beginPath(); c.moveTo(6, 50); c.quadraticCurveTo(18, 10, 40, 22); c.quadraticCurveTo(26, 26, 30, 40); c.quadraticCurveTo(44, 36, 58, 50); c.closePath(); c.fillStyle = '#3ab0ff'; c.fill(); c.lineWidth = 1.8; c.strokeStyle = 'rgba(12,10,8,.78)'; c.stroke(); },
  totemwind: (c) => { R(c, 26, 26, 12, 30, '#8a6440'); R(c, 20, 14, 24, 14, '#b08a5a'); for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(40 + i * 3, 22 + i * 8, 8, -1.2, 1.2); c.lineWidth = 3; c.strokeStyle = '#bff4ff'; c.stroke(); } },
  incarnate: (c) => { C(c, 32, 32, 20, '#1a5a8a'); bolt(c, 26, 30, 0.7); drop(c, 40, 34, 0.55, '#6fd8ff'); flame(c, 32, 48, 0.4); },
  // ---- objets
  i_sword: (c, t) => rot(c, 32, 34, 0.75, () => blade(c, t.metal)),
  i_axe: (c, t) => rot(c, 32, 32, 0.6, () => { R(c, -3, -24, 6, 48, '#6b4a2e'); P(c, [3, -22, 20, -26, 22, -6, 3, -10], t.metal); }),
  i_mace: (c, t) => rot(c, 32, 32, 0.6, () => { R(c, -3, -8, 6, 34, '#6b4a2e'); C(c, 0, -16, 11, t.metal); for (let i = 0; i < 4; i++) rot(c, 0, -16, i * Math.PI / 2, () => P(c, [-3, -11, 3, -11, 0, -18], t.metal, 'rgba(12,10,8,.78)', 2)); }),
  i_staff: (c, t) => rot(c, 32, 32, 0.6, () => { R(c, -3, -18, 6, 46, '#6b4a2e'); crystal(c, 0, -22, 0.6, t.gem); }),
  i_scepter: (c, t) => rot(c, 32, 32, 0.6, () => { R(c, -3, -8, 6, 36, '#6b4a2e'); R(c, -9, -12, 18, 5, '#d9a441'); C(c, 0, -20, 8, t.gem); }),
  i_bow: (c) => { c.beginPath(); c.arc(20, 32, 24, -1.1, 1.1); c.lineWidth = 8; c.strokeStyle = 'rgba(12,10,8,.78)'; c.stroke(); c.lineWidth = 5; c.strokeStyle = '#8a6440'; c.stroke(); L(c, [30, 11, 30, 53], '#f0f0f0', 1.5); },
  i_shield: (c, t) => shieldS(c, 32, 32, 1.1, t.color || '#3b6fd8'),
  i_orb: (c, t) => { C(c, 32, 30, 16, t.gem); C(c, 26, 24, 5, 'rgba(255,255,255,.7)', null); R(c, 22, 46, 20, 6, '#d9a441'); },
  i_relic: (c, t) => { R(c, 24, 18, 16, 30, '#6b4a2e'); R(c, 20, 14, 24, 6, '#d9a441'); crystal(c, 32, 30, 0.45, '#8fe86a'); },
  i_quiver: (c) => { rot(c, 32, 34, 0.3, () => { R(c, -8, -14, 16, 36, '#7a5838'); for (let i = 0; i < 3; i++) L(c, [-4 + i * 4, -14, -4 + i * 4, -26], '#e8e0d0', 2); }); },
  i_helm: (c, t) => { c.beginPath(); c.arc(32, 34, 18, Math.PI, 0); c.lineTo(50, 48); c.lineTo(14, 48); c.closePath(); c.lineWidth = 1.8; c.strokeStyle = 'rgba(12,10,8,.78)'; c.stroke(); c.fillStyle = t.metal; c.fill(); R(c, 18, 32, 28, 5, 'rgba(12,10,8,.78)', null); R(c, 30, 14, 4, 10, '#c83a2a'); },
  i_hat: (c, t) => { P(c, [32, 6, 44, 40, 20, 40], t.cloth); R(c, 8, 40, 48, 7, t.cloth); R(c, 20, 34, 24, 4, '#d9a441'); },
  i_hood: (c, t) => { c.beginPath(); c.moveTo(12, 52); c.quadraticCurveTo(12, 8, 32, 8); c.quadraticCurveTo(52, 8, 52, 52); c.closePath(); c.lineWidth = 1.8; c.strokeStyle = 'rgba(12,10,8,.78)'; c.stroke(); c.fillStyle = t.leather; c.fill(); C(c, 32, 34, 12, '#1a1410', null); },
  i_crown: (c) => { R(c, 12, 34, 40, 10, '#6b4a2e'); for (let i = 0; i < 3; i++) L(c, [18 + i * 14, 34, 16 + i * 14, 16], '#e6dcc4', 3); leaf(c, 32, 30, 0.5, 0); },
  i_chest: (c, t) => { P(c, [16, 12, 26, 16, 38, 16, 48, 12, 54, 24, 46, 28, 46, 52, 18, 52, 18, 28, 10, 24], t.metal); L(c, [32, 18, 32, 50], 'rgba(0,0,0,.3)', 2); },
  i_robe: (c, t) => { P(c, [18, 12, 46, 12, 50, 26, 54, 54, 10, 54, 14, 26], t.cloth); R(c, 16, 28, 32, 4, '#d9a441'); },
  i_tunic: (c, t) => { P(c, [16, 12, 26, 16, 38, 16, 48, 12, 54, 24, 46, 28, 46, 50, 18, 50, 18, 28, 10, 24], t.leather); R(c, 18, 32, 28, 4, '#3a2a1e'); },
  i_legs: (c, t) => { P(c, [18, 10, 46, 10, 48, 54, 36, 54, 32, 24, 28, 54, 16, 54], t.leather); },
  i_gloves: (c, t) => { P(c, [18, 54, 18, 30, 14, 22, 20, 18, 24, 26, 24, 12, 30, 12, 30, 22, 32, 10, 38, 10, 38, 24, 42, 14, 48, 16, 44, 34, 42, 54], t.leather); },
  i_boots: (c, t) => { P(c, [18, 10, 36, 10, 36, 38, 54, 44, 54, 54, 14, 54, 16, 40], t.leather); },
  i_ring: (c, t) => { C(c, 32, 36, 16, null, '#d9a441', 7); C(c, 32, 17, 7, t.gem); },
  i_amulet: (c, t) => { c.beginPath(); c.arc(32, 16, 18, 0.2, Math.PI - 0.2); c.lineWidth = 3; c.strokeStyle = '#d9a441'; c.stroke(); crystal(c, 32, 40, 0.6, t.gem); },
  i_potion_red: (c) => { R(c, 27, 8, 10, 10, '#c9b89a'); C(c, 32, 38, 17, '#e04848'); C(c, 26, 32, 4, 'rgba(255,255,255,.6)', null); },
  i_potion_blue: (c) => { R(c, 27, 8, 10, 10, '#c9b89a'); C(c, 32, 38, 17, '#4a7ae0'); C(c, 26, 32, 4, 'rgba(255,255,255,.6)', null); },
  i_bread: (c) => { c.beginPath(); c.ellipse(32, 36, 24, 14, 0, 0, Math.PI * 2); c.lineWidth = 1.8; c.strokeStyle = 'rgba(12,10,8,.78)'; c.stroke(); c.fillStyle = '#d8a050'; c.fill(); for (let i = 0; i < 3; i++) L(c, [20 + i * 10, 30, 26 + i * 10, 40], '#a07030', 2); },
  i_stew: (c) => { R(c, 12, 30, 40, 18, '#6a5a50'); c.beginPath(); c.ellipse(32, 30, 20, 6, 0, 0, Math.PI * 2); c.fillStyle = '#c86a3a'; c.fill(); for (let i = 0; i < 3; i++) L(c, [22 + i * 10, 22, 24 + i * 10, 12], 'rgba(255,255,255,.5)', 2); },
  i_shard: (c) => { crystal(c, 28, 34, 1.1, '#9fe8ff'); crystal(c, 44, 40, 0.6, '#7fd1ff'); },
  i_gem: (c) => { P(c, [32, 10, 50, 26, 32, 56, 14, 26], '#ff5a8a'); L(c, [14, 26, 50, 26], 'rgba(255,255,255,.5)', 2); },
  i_trophy: (c) => { P(c, [18, 12, 46, 12, 42, 34, 22, 34], '#d9a441'); R(c, 28, 34, 8, 10, '#d9a441'); R(c, 20, 44, 24, 8, '#8a6a30'); bolt(c, 32, 22, 0.4); },
  i_bag: (c) => { P(c, [16, 24, 48, 24, 54, 54, 10, 54], '#8a6440'); R(c, 24, 14, 16, 10, '#7a5838'); R(c, 28, 34, 8, 8, '#d9a441'); },
  i_quest: (c) => { R(c, 16, 14, 32, 40, '#e8dcc0'); for (let i = 0; i < 4; i++) L(c, [22, 24 + i * 7, 42, 24 + i * 7], '#8a7a60', 2); C(c, 44, 48, 7, '#c83a2a'); },
  i_coin: (c) => { C(c, 32, 32, 18, '#e8c050'); C(c, 32, 32, 11, null, '#a07a20', 2); },
  i_hammer: (c, t) => rot(c, 32, 32, 0.6, () => { R(c, -3, -10, 6, 40, '#6b4a2e'); R(c, -14, -24, 28, 16, t.metal); R(c, -15, -18, 30, 4, '#d9a441', null); }),
  i_scythe: (c, t) => { L(c, [16, 58, 40, 8], '#6b4a2e', 5); c.beginPath(); c.moveTo(40, 8); c.quadraticCurveTo(60, 14, 54, 36); c.quadraticCurveTo(50, 20, 34, 16); c.closePath(); c.fillStyle = t.metal; c.fill(); c.lineWidth = 2; c.strokeStyle = 'rgba(12,10,8,.78)'; c.stroke(); },
  i_dagger: (c, t) => rot(c, 32, 36, 0.75, () => blade(c, t.metal, 30, 7)),
  i_tome: (c) => { R(c, 14, 12, 36, 42, '#3a2438'); R(c, 18, 14, 30, 38, '#e8dcc0'); R(c, 14, 12, 8, 42, '#2a1a28'); C(c, 36, 32, 7, '#b58cff'); },
  i_skull: (c) => { R(c, 16, 12, 32, 28, '#e6dfcd'); R(c, 22, 40, 20, 10, '#d0c8b4'); R(c, 21, 22, 8, 8, 'rgba(12,10,8,.78)', null); R(c, 35, 22, 8, 8, 'rgba(12,10,8,.78)', null); },
  i_fetish: (c) => { R(c, 29, 30, 6, 26, '#6b4a2e'); R(c, 20, 10, 24, 22, '#9a7a54'); R(c, 24, 18, 5, 5, 'rgba(12,10,8,.78)', null); R(c, 35, 18, 5, 5, 'rgba(12,10,8,.78)', null); L(c, [18, 30, 10, 46], '#c83a2a', 4); L(c, [46, 30, 54, 46], '#2a8ac8', 4); },
  i_totemmace: (c, t) => rot(c, 32, 32, 0.6, () => { R(c, -3, -8, 6, 36, '#6b4a2e'); R(c, -10, -26, 20, 20, '#b08a5a'); R(c, -6, -20, 4, 4, t.gem, null); R(c, 2, -20, 4, 4, t.gem, null); }),
  i_mask: (c, t) => { c.beginPath(); c.moveTo(12, 50); c.quadraticCurveTo(12, 10, 32, 10); c.quadraticCurveTo(52, 10, 52, 50); c.closePath(); c.lineWidth = 1.8; c.strokeStyle = 'rgba(12,10,8,.78)'; c.stroke(); c.fillStyle = t.leather; c.fill(); R(c, 16, 34, 32, 12, '#2a2226'); R(c, 20, 26, 8, 4, '#f0ead8', null); R(c, 36, 26, 8, 4, '#f0ead8', null); },
  i_pelt: (c) => { P(c, [10, 44, 14, 20, 22, 8, 28, 20, 36, 20, 42, 8, 50, 20, 54, 44], '#8a6a4a'); R(c, 22, 30, 20, 10, '#6a4a2e'); C(c, 25, 26, 2.5, 'rgba(12,10,8,.78)', null); C(c, 39, 26, 2.5, 'rgba(12,10,8,.78)', null); },
  i_petstone: (c, t) => { C(c, 32, 34, 18, '#3a4a6a'); crystal(c, 32, 30, 0.9, '#bff4ff'); C(c, 32, 34, 20, null, '#d9a441', 3); },
  dungeon: (c) => { P(c, [12, 54, 12, 26, 32, 10, 52, 26, 52, 54], '#6a6070'); P(c, [22, 54, 22, 34, 32, 26, 42, 34, 42, 54], 'rgba(12,10,8,.78)', null); C(c, 32, 40, 4, '#ffb050', null); },
  raid: (c) => { P(c, [8, 54, 16, 18, 32, 8, 48, 18, 56, 54], '#5a6a8a'); for (const x of [20, 32, 44]) P(c, [x - 4, 54, x - 4, 36, x, 30, x + 4, 36, x + 4, 54], 'rgba(12,10,8,.78)', null); star(c, 32, 18, 7, 3, 5, '#ffd24a'); },
  abyss: (c) => { C(c, 32, 32, 24, 'rgba(12,10,8,.78)'); for (let i = 0; i < 4; i++) C(c, 32, 32, 20 - i * 5, null, i % 2 ? '#b58cff' : '#5a3a8a', 3); C(c, 32, 32, 3, '#ffffff', null); },
  skull: (c) => { P(c, [16, 30, 20, 14, 32, 10, 44, 14, 48, 30, 42, 40, 42, 50, 22, 50, 22, 40], '#e6dfcd'); C(c, 25, 30, 5, 'rgba(12,10,8,.78)', null); C(c, 39, 30, 5, 'rgba(12,10,8,.78)', null); P(c, [32, 36, 35, 42, 29, 42], 'rgba(12,10,8,.78)', null); },
  tank: (c) => { P(c, [32, 8, 52, 16, 50, 36, 32, 56, 14, 36, 12, 16], '#5a8ad8'); P(c, [32, 16, 44, 21, 42, 34, 32, 46, 22, 34, 20, 21], '#9ec0ff', null); },
  healer: (c) => { R(c, 26, 10, 12, 44, '#5fd35a'); R(c, 10, 26, 44, 12, '#5fd35a'); R(c, 28, 28, 8, 8, '#ffffff', null); },
  dps: (c) => { rot(c, 32, 32, 0.78, () => blade(c, '#e8e0d0', 36, 8)); rot(c, 32, 32, -0.78, () => blade(c, '#e8e0d0', 36, 8)); },
  i_emblem: (c) => { star(c, 32, 32, 24, 12, 8, '#d9a441'); C(c, 32, 32, 11, '#8a2a2a'); star(c, 32, 32, 7, 3, 5, '#ffe68a'); },
  i_chest_loot: (c) => { R(c, 10, 24, 44, 28, '#8a6440'); R(c, 10, 18, 44, 10, '#a07a4a'); R(c, 28, 26, 8, 10, '#d9a441'); },
  // ---- spécialisations
  thunder: (c) => { for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(32, 42, 8 + i * 8, Math.PI, 0); c.lineWidth = 4.5; c.strokeStyle = 'rgba(12,10,8,.78)'; c.stroke(); c.lineWidth = 2.5; c.strokeStyle = i === 1 ? '#bfe0ff' : '#e8ecf0'; c.stroke(); } bolt(c, 32, 28, 0.72, '#dff0ff'); R(c, 8, 46, 48, 6, '#6a5a4a'); },
  mortal: (c) => { L(c, [10, 12, 54, 54], 'rgba(255,70,50,.55)', 3); rot(c, 30, 34, -0.75, () => blade(c, '#e8ecf0', 44, 9)); drop(c, 48, 44, 0.45, '#c02020'); drop(c, 40, 54, 0.3, '#c02020'); },
  plague: (c) => { C(c, 22, 30, 12, '#6a8a3a'); C(c, 40, 26, 14, '#7a9a4a'); C(c, 34, 42, 13, '#6a8a3a'); P(c, [24, 30, 28, 22, 36, 20, 42, 24, 42, 34, 38, 38, 38, 44, 28, 44, 28, 38, 24, 34], '#e6dfcd', 'rgba(12,10,8,.78)', 2); C(c, 30, 30, 2.5, 'rgba(12,10,8,.78)', null); C(c, 37, 30, 2.5, 'rgba(12,10,8,.78)', null); },
  wolf: (c) => { P(c, [12, 44, 16, 24, 22, 10, 30, 20, 38, 18, 44, 8, 48, 22, 58, 32, 52, 40, 42, 40, 34, 50, 20, 54], '#9a8a7a'); P(c, [22, 14, 26, 20, 22, 22], '#5a4a3a', null); C(c, 40, 28, 2.8, '#ffd24a', 'rgba(12,10,8,.78)', 1.5); P(c, [52, 40, 58, 32, 58, 40], 'rgba(12,10,8,.78)', null); L(c, [36, 44, 46, 42], '#f0f0f0', 1.5); },
  tree: (c) => { R(c, 28, 34, 8, 22, '#6b4a2e'); C(c, 32, 26, 16, '#5fbf4a'); C(c, 19, 31, 10, '#4fae3a'); C(c, 45, 31, 10, '#4fae3a'); C(c, 32, 17, 9, '#8fe86a', null); for (let i = 0; i < 4; i++) C(c, 22 + i * 7, 24 + (i % 2) * 7, 2.2, '#fff4a0', null); },
  moon: (c) => { for (let i = 0; i < 8; i++) rot(c, 32, 32, (i * Math.PI) / 4, () => R(c, -1.5, -29, 3, 7, '#c8b8ff', null)); C(c, 32, 32, 17, '#ece6ff'); C(c, 26, 28, 4, 'rgba(150,140,200,.7)', null); C(c, 37, 38, 3, 'rgba(150,140,200,.7)', null); C(c, 38, 25, 2, 'rgba(150,140,200,.7)', null); },
  starfall: (c) => { for (const [x, y, s] of [[20, 20, 7], [43, 15, 5], [34, 40, 9], [14, 47, 5], [51, 45, 6]]) { L(c, [x + 9, y - 9, x, y], 'rgba(220,210,255,.85)', 2); star(c, x, y, s, s * 0.45, 5, '#fff4c8'); } },
  cat: (c) => { P(c, [12, 20, 18, 7, 27, 17, 37, 17, 46, 7, 52, 20, 53, 36, 45, 50, 32, 56, 19, 50, 11, 36], '#d8a040'); P(c, [21, 31, 28, 29, 28, 36], '#7aff6a', 'rgba(12,10,8,.78)', 1.5); P(c, [43, 31, 36, 29, 36, 36], '#7aff6a', 'rgba(12,10,8,.78)', 1.5); P(c, [29, 42, 35, 42, 32, 46], 'rgba(12,10,8,.78)', null); for (const sx of [-1, 1]) { L(c, [32 + sx * 6, 46, 32 + sx * 21, 43], '#f0e0c0', 1.2); L(c, [32 + sx * 6, 48, 32 + sx * 20, 50], '#f0e0c0', 1.2); } },
  claw: (c) => { for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(15 + i * 12, 9); c.quadraticCurveTo(24 + i * 12, 30, 17 + i * 12, 55); c.lineCap = 'round'; c.lineWidth = 8; c.strokeStyle = 'rgba(12,10,8,.78)'; c.stroke(); c.lineWidth = 4.5; c.strokeStyle = '#f0e6d0'; c.stroke(); } },
  bear: (c) => { C(c, 17, 17, 7, '#6a4a30'); C(c, 47, 17, 7, '#6a4a30'); C(c, 32, 34, 21, '#7a5638'); c.beginPath(); c.ellipse(32, 43, 10, 8, 0, 0, Math.PI * 2); c.fillStyle = '#c8a078'; c.fill(); C(c, 32, 39, 3.5, 'rgba(12,10,8,.78)', null); C(c, 24, 28, 2.6, 'rgba(12,10,8,.78)', null); C(c, 40, 28, 2.6, 'rgba(12,10,8,.78)', null); },
  lava: (c) => { C(c, 32, 37, 16, '#5a2a1a'); c.beginPath(); c.moveTo(19, 33); c.quadraticCurveTo(32, 18, 45, 33); c.quadraticCurveTo(38, 45, 30, 41); c.closePath(); c.fillStyle = '#ff7a2a'; c.fill(); for (let i = 0; i < 4; i++) C(c, 15 + i * 11, 14 + (i % 2) * 7, 3.5, '#ffb040', 'rgba(12,10,8,.78)', 1.5); L(c, [25, 45, 35, 35, 41, 47], '#ffd24a', 2); },
  pyro: (c) => { flame(c, 20, 32, 0.75, '#ff5a1a', '#ffb040'); C(c, 38, 30, 16, '#ff7a2a'); C(c, 38, 30, 10, '#ffd24a', null); C(c, 35, 27, 5, '#fff4c8', null); },
  blizzard: (c) => { C(c, 22, 19, 10, '#9fb8d8', 'rgba(12,10,8,.78)', 2); C(c, 38, 17, 12, '#9fb8d8', 'rgba(12,10,8,.78)', 2); R(c, 14, 19, 34, 10, '#9fb8d8', null); flake(c, 19, 45, 7); flake(c, 41, 47, 8); flake(c, 30, 37, 5); },
  comet: (c) => { L(c, [56, 8, 30, 34], '#bfeaff', 9); L(c, [50, 6, 28, 30], 'rgba(255,255,255,.6)', 3); rot(c, 24, 40, 0.8, () => crystal(c, 0, 0, 0.9, '#dff6ff')); },
  missiles: (c) => { for (const [x, y] of [[19, 45], [32, 31], [46, 18]]) { L(c, [x - 12, y + 10, x, y], 'rgba(212,154,255,.75)', 4); C(c, x, y, 6, '#f0d8ff', 'rgba(12,10,8,.78)', 2); } },
  hourglass: (c) => { R(c, 16, 8, 32, 5, '#d9a441'); R(c, 16, 51, 32, 5, '#d9a441'); P(c, [20, 13, 44, 13, 34, 32, 44, 51, 20, 51, 30, 32], '#e0d0ff'); P(c, [25, 19, 39, 19, 32, 29], '#b58cff', null); P(c, [32, 37, 40, 49, 24, 49], '#b58cff', null); },
  heart: (c, t) => { c.beginPath(); c.moveTo(32, 54); c.bezierCurveTo(6, 36, 8, 12, 24, 13); c.bezierCurveTo(29, 13, 32, 18, 32, 21); c.bezierCurveTo(32, 18, 35, 13, 40, 13); c.bezierCurveTo(56, 12, 58, 36, 32, 54); c.closePath(); c.lineWidth = 1.8; c.strokeStyle = 'rgba(12,10,8,.78)'; c.stroke(); c.fillStyle = '#e04848'; c.fill(); C(c, 24, 23, 4, 'rgba(255,255,255,.55)', null); },
  // ---- runes : pierre sombre gravée d'un symbole lumineux (t.gem = couleur, t.sym = symbole 0-7)
  i_rune: (c, t) => {
    const col = t.gem || '#b58cff';
    c.beginPath(); c.moveTo(32, 6); c.bezierCurveTo(54, 8, 58, 26, 54, 42); c.bezierCurveTo(50, 56, 38, 59, 30, 58); c.bezierCurveTo(14, 57, 7, 46, 9, 30); c.bezierCurveTo(10, 16, 18, 6, 32, 6); c.closePath();
    c.lineWidth = 1.8; c.strokeStyle = 'rgba(12,10,8,.78)'; c.stroke(); c.fillStyle = '#4a5064'; c.fill();
    c.beginPath(); c.moveTo(20, 12); c.bezierCurveTo(28, 9, 40, 9, 46, 14); c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,.25)'; c.stroke();
    const glow = (pts) => { c.save(); c.shadowColor = col; c.shadowBlur = 8; L(c, pts, col, 3.4); c.restore(); };
    const sym = t.sym ?? 2;
    if (sym === 0) { glow([32, 48, 32, 16]); glow([22, 26, 32, 16, 42, 26]); }
    else if (sym === 1) { glow([24, 16, 40, 24, 24, 38, 40, 48]); }
    else if (sym === 2) { glow([32, 14, 44, 32, 32, 50, 20, 32, 32, 14]); glow([32, 26, 32, 38]); }
    else if (sym === 3) { c.save(); c.shadowColor = col; c.shadowBlur = 8; C(c, 32, 32, 12, null, col, 3.4); c.restore(); C(c, 32, 32, 3.5, col, null); }
    else if (sym === 4) { glow([32, 50, 32, 16]); glow([20, 18, 32, 32, 44, 18]); }
    else if (sym === 5) { glow([20, 18, 44, 46]); glow([44, 18, 20, 46]); C(c, 32, 32, 3, '#fff8e0', null); }
    else if (sym === 6) { c.save(); c.shadowColor = col; c.shadowBlur = 8; drop(c, 32, 34, 0.55, col); c.restore(); glow([32, 44, 32, 52]); }
    else { glow([26, 50, 26, 14]); glow([26, 22, 42, 14]); glow([26, 32, 42, 24]); }
  },
  // ---- métiers : matériaux (t.gem = couleur)
  i_ore: (c, t) => { P(c, [10, 44, 16, 24, 30, 14, 46, 18, 56, 36, 50, 52, 24, 54], '#6a6470'); for (const [x, y, s2] of [[26, 30, 1], [40, 26, 0.8], [36, 42, 1.1], [20, 44, 0.7]]) rot(c, x, y, 0.4, () => P(c, [0, -7 * s2, 6 * s2, 0, 0, 7 * s2, -6 * s2, 0], t.gem, 'rgba(12,10,8,.78)', 2)); },
  i_gemstone: (c, t) => { P(c, [18, 22, 26, 12, 38, 12, 46, 22, 32, 52], t.gem); P(c, [18, 22, 46, 22, 32, 52], 'rgba(0,0,0,.18)', null); L(c, [26, 12, 32, 22, 38, 12], 'rgba(255,255,255,.7)', 1.5); C(c, 28, 17, 2.5, 'rgba(255,255,255,.8)', null); },
  i_herb: (c, t) => { L(c, [32, 56, 32, 24], '#4a7a2a', 3); for (const [a, l] of [[-0.9, 16], [0.9, 16], [-0.5, 12], [0.5, 12]]) rot(c, 32, 44 - l * 0.3, a, () => { c.beginPath(); c.ellipse(0, -l / 2, 5, l / 2, 0, 0, Math.PI * 2); c.fillStyle = '#6ab04a'; c.fill(); c.lineWidth = 2; c.strokeStyle = 'rgba(12,10,8,.78)'; c.stroke(); }); for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; C(c, 32 + Math.sin(a) * 6, 20 + Math.cos(a) * 6, 4.5, t.gem, 'rgba(12,10,8,.78)', 1.5); } C(c, 32, 20, 3, '#fff4c0', null); },
  i_leather: (c, t) => { P(c, [14, 14, 24, 18, 32, 12, 40, 18, 50, 14, 48, 30, 54, 42, 42, 44, 36, 54, 28, 54, 22, 44, 10, 42, 16, 30], t.gem); L(c, [20, 24, 44, 24], 'rgba(255,255,255,.18)', 1.5); L(c, [18, 36, 46, 36], 'rgba(0,0,0,.25)', 1.5); },
  i_cloth: (c, t) => { R(c, 12, 20, 40, 26, t.gem); R(c, 12, 20, 40, 7, 'rgba(255,255,255,.25)', null); C(c, 12, 33, 6, t.gem); L(c, [18, 46, 46, 46], 'rgba(0,0,0,.25)', 2); },
  i_fish: (c, t) => { c.beginPath(); c.ellipse(28, 32, 17, 10, 0, 0, Math.PI * 2); c.fillStyle = t.gem; c.fill(); c.lineWidth = 1.8; c.strokeStyle = 'rgba(12,10,8,.78)'; c.stroke(); P(c, [44, 32, 56, 22, 56, 42], t.gem); C(c, 18, 29, 2.5, 'rgba(12,10,8,.78)', null); L(c, [24, 26, 24, 38], 'rgba(0,0,0,.3)', 1.5); },
  i_meat: (c, t) => { c.beginPath(); c.ellipse(28, 34, 17, 13, -0.5, 0, Math.PI * 2); c.fillStyle = t.gem; c.fill(); c.lineWidth = 1.8; c.strokeStyle = 'rgba(12,10,8,.78)'; c.stroke(); c.beginPath(); c.ellipse(28, 34, 9, 6, -0.5, 0, Math.PI * 2); c.fillStyle = 'rgba(255,230,210,.45)'; c.fill(); L(c, [40, 24, 52, 12], '#efe6d0', 5); C(c, 53, 10, 4, '#efe6d0'); },
  i_elixir: (c, t) => { R(c, 27, 8, 10, 12, '#9aa2ae'); c.beginPath(); c.arc(32, 38, 16, 0, Math.PI * 2); c.lineWidth = 1.8; c.strokeStyle = 'rgba(12,10,8,.78)'; c.stroke(); c.fillStyle = 'rgba(220,235,255,.25)'; c.fill(); c.beginPath(); c.arc(32, 40, 13, 0.15, Math.PI - 0.15); c.fillStyle = t.gem; c.fill(); C(c, 27, 32, 3, 'rgba(255,255,255,.7)', null); },
  i_dish: (c, t) => { c.beginPath(); c.ellipse(32, 42, 22, 9, 0, 0, Math.PI * 2); c.fillStyle = '#d8ccb0'; c.fill(); c.lineWidth = 1.8; c.strokeStyle = 'rgba(12,10,8,.78)'; c.stroke(); c.beginPath(); c.ellipse(32, 36, 14, 9, 0, 0, Math.PI * 2); c.fillStyle = t.gem; c.fill(); c.stroke(); for (const x of [24, 32, 40]) { c.beginPath(); c.moveTo(x, 24); c.quadraticCurveTo(x + 4, 18, x, 12); c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,.6)'; c.stroke(); } },
  i_bandage: (c) => { rot(c, 32, 32, -0.6, () => { R(c, -20, -9, 40, 18, '#efe8d8'); for (let x = -14; x < 20; x += 8) L(c, [x, -9, x - 4, 9], 'rgba(0,0,0,.15)', 1.5); }); R(c, 28, 20, 8, 22, '#c83a3a', null); R(c, 21, 27, 22, 8, '#c83a3a', null); },
  i_bottle: (c) => { R(c, 28, 8, 8, 10, '#8a6440'); P(c, [24, 18, 40, 18, 44, 30, 44, 52, 20, 52, 20, 30], 'rgba(120,200,160,.55)'); R(c, 26, 30, 12, 16, '#efe0c0', 'rgba(12,10,8,.78)', 1.5); L(c, [28, 35, 36, 35], '#8a7a60', 1); L(c, [28, 40, 36, 40], '#8a7a60', 1); },
  // ---- métiers : glyphes
  p_mine: (c) => { rot(c, 32, 32, -0.75, () => { R(c, -3, -6, 6, 34, '#8a6440'); c.beginPath(); c.moveTo(-24, -8); c.quadraticCurveTo(0, -24, 24, -8); c.lineTo(20, -4); c.quadraticCurveTo(0, -16, -20, -4); c.closePath(); c.fillStyle = '#c9ced6'; c.fill(); c.lineWidth = 2.5; c.strokeStyle = 'rgba(12,10,8,.78)'; c.stroke(); }); },
  p_herb: (c) => { c.beginPath(); c.moveTo(14, 52); c.quadraticCurveTo(14, 14, 50, 12); c.quadraticCurveTo(50, 46, 14, 52); c.closePath(); c.fillStyle = '#6ab04a'; c.fill(); c.lineWidth = 1.8; c.strokeStyle = 'rgba(12,10,8,.78)'; c.stroke(); L(c, [16, 50, 44, 18], '#3a6a2a', 2); for (const [a, b2] of [[24, 40], [30, 34], [36, 28]]) L(c, [a, b2, a + 7, b2 + 1], '#3a6a2a', 1.5); },
  p_skin: (c) => { P(c, [14, 16, 24, 20, 32, 14, 40, 20, 50, 16, 48, 36, 52, 48, 32, 52, 12, 48, 16, 36], '#b08a5a'); rot(c, 36, 36, 0.8, () => blade(c, '#e8ecf0', 26, 6)); },
  p_forge: (c) => { P(c, [10, 30, 46, 30, 54, 24, 54, 34, 44, 38, 40, 48, 48, 54, 16, 54, 24, 48, 20, 38, 10, 36], '#6a6a78'); rot(c, 40, 18, 0.5, () => { R(c, -2, -2, 4, 22, '#8a6440'); R(c, -9, -8, 18, 9, '#c9ced6'); }); },
  p_leather: (c) => { P(c, [12, 18, 22, 22, 30, 16, 38, 22, 48, 18, 46, 34, 50, 46, 30, 50, 12, 46, 16, 34], '#8a6440'); L(c, [20, 30, 44, 42], '#f0e6d0', 1.5); L(c, [44, 14, 22, 50], '#c9ced6', 2.5); },
  p_tailor: (c) => { C(c, 26, 36, 14, '#5a6a9a'); C(c, 26, 36, 5, '#3a4a7a', null); L(c, [12, 30, 40, 30], 'rgba(255,255,255,.35)', 1.5); L(c, [12, 40, 40, 42], 'rgba(255,255,255,.35)', 1.5); L(c, [54, 8, 34, 52], '#e8ecf0', 2.5); c.beginPath(); c.moveTo(52, 12); c.quadraticCurveTo(58, 30, 40, 36); c.lineWidth = 1.5; c.strokeStyle = '#ffd24a'; c.stroke(); },
  p_alch: (c) => { R(c, 27, 8, 10, 14, '#c9ced6'); P(c, [27, 22, 37, 22, 52, 50, 12, 50], 'rgba(220,235,255,.3)'); P(c, [20, 38, 44, 38, 52, 50, 12, 50], '#3ac8a8', null); C(c, 26, 44, 2.5, '#e8fff8', null); C(c, 36, 41, 2, '#e8fff8', null); },
  p_jewel: (c) => { C(c, 32, 38, 15, null, '#e0b040', 6); C(c, 32, 38, 15, null, 'rgba(12,10,8,.78)', 1); P(c, [24, 20, 28, 12, 36, 12, 40, 20, 32, 30], '#b86bff'); },
  p_rune: (c) => { c.beginPath(); c.moveTo(32, 8); c.bezierCurveTo(52, 10, 56, 28, 52, 42); c.bezierCurveTo(48, 54, 36, 56, 30, 56); c.bezierCurveTo(14, 55, 9, 44, 11, 30); c.bezierCurveTo(12, 16, 20, 8, 32, 8); c.closePath(); c.lineWidth = 1.8; c.strokeStyle = 'rgba(12,10,8,.78)'; c.stroke(); c.fillStyle = '#4a5064'; c.fill(); c.save(); c.shadowColor = '#c8a0ff'; c.shadowBlur = 8; L(c, [26, 48, 26, 16], '#d8c0ff', 3); L(c, [26, 22, 40, 14], '#d8c0ff', 3); L(c, [26, 32, 40, 24], '#d8c0ff', 3); c.restore(); },
  p_fish: (c) => { L(c, [12, 54, 48, 10], '#8a6440', 3); c.beginPath(); c.moveTo(48, 10); c.quadraticCurveTo(58, 30, 44, 44); c.lineWidth = 1.2; c.strokeStyle = '#e8e0d0'; c.stroke(); c.beginPath(); c.ellipse(36, 46, 9, 5, 0.4, 0, Math.PI * 2); c.fillStyle = '#7ab0d0'; c.fill(); c.lineWidth = 2; c.strokeStyle = 'rgba(12,10,8,.78)'; c.stroke(); },
  p_cook: (c) => { c.beginPath(); c.moveTo(12, 30); c.lineTo(52, 30); c.lineTo(48, 50); c.quadraticCurveTo(32, 56, 16, 50); c.closePath(); c.fillStyle = '#5a5a64'; c.fill(); c.lineWidth = 1.8; c.strokeStyle = 'rgba(12,10,8,.78)'; c.stroke(); R(c, 8, 28, 48, 5, '#6a6a74'); for (const x of [22, 32, 42]) { c.beginPath(); c.moveTo(x, 24); c.quadraticCurveTo(x + 5, 17, x, 10); c.lineWidth = 2.5; c.strokeStyle = '#f0e6d0'; c.stroke(); } },
  p_aid: (c) => { R(c, 14, 14, 36, 36, '#efe8d8'); R(c, 28, 18, 8, 28, '#c83a3a', null); R(c, 18, 28, 28, 8, '#c83a3a', null); },
  // ---- familier : ordres
  paws: (c) => { for (const [x, y, a] of [[22, 44, -0.3], [40, 22, 0.3]]) rot(c, x, y, a, () => { c.beginPath(); c.ellipse(0, 4, 7, 6, 0, 0, Math.PI * 2); c.fillStyle = '#e8dcc0'; c.fill(); c.lineWidth = 2; c.strokeStyle = 'rgba(12,10,8,.78)'; c.stroke(); for (const [dx, dy] of [[-7, -5], [-2.5, -9], [2.5, -9], [7, -5]]) C(c, dx, dy, 2.6, '#e8dcc0', 'rgba(12,10,8,.78)', 1.5); }); },
  stophand: (c) => { P(c, [22, 10, 42, 10, 54, 22, 54, 42, 42, 54, 22, 54, 10, 42, 10, 22], '#c83a2a'); R(c, 24, 18, 5, 16, '#f0e6d0', null); R(c, 30, 15, 5, 19, '#f0e6d0', null); R(c, 36, 17, 5, 17, '#f0e6d0', null); R(c, 22, 32, 20, 12, '#f0e6d0', null); },
  fangs: (c) => { c.beginPath(); c.moveTo(10, 20); c.quadraticCurveTo(32, 34, 54, 20); c.lineTo(54, 26); c.quadraticCurveTo(32, 40, 10, 26); c.closePath(); c.fillStyle = '#7a1a1a'; c.fill(); for (const x of [16, 24, 40, 48]) P(c, [x - 4, 24 + (x > 30 ? 0 : 0), x + 4, 24, x, 40], '#f0ead8', 'rgba(12,10,8,.78)', 2); c.beginPath(); c.moveTo(10, 50); c.quadraticCurveTo(32, 36, 54, 50); c.lineWidth = 1.8; c.strokeStyle = 'rgba(12,10,8,.78)'; c.stroke(); for (const x of [22, 42]) P(c, [x - 4, 48, x + 4, 48, x, 36], '#f0ead8', 'rgba(12,10,8,.78)', 2); },
  // ---- plein écran (interface)
  fullscreen: (c) => { for (const [qx, qy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const cx = 32 + qx * 19, cy = 32 + qy * 19; L(c, [cx - qx * 11, cy, cx, cy, cx, cy - qy * 11], '#e8ecf0', 5); } },
  fullscreen_exit: (c) => { for (const [qx, qy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const cx = 32 + qx * 9, cy = 32 + qy * 9; L(c, [cx + qx * 11, cy, cx, cy, cx, cy + qy * 11], '#e8ecf0', 5); } },
};

const TINT = [
  { metal: '#b8bec8', cloth: '#8a7a6a', leather: '#8a6440', gem: '#7fd1ff' },
];

// glyph : nom ; color : couleur de fond (compétence) ou rareté (objet) ; t : teintes d'objet
// grain peint réutilisé (petits coups de pinceau clairs et sombres)
let GRAIN = null;
function grain() {
  if (GRAIN) return GRAIN;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d');
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 260; i++) {
    const x = rnd() * S, y = rnd() * S, l = 4 + rnd() * 9, a = rnd() * Math.PI;
    c.strokeStyle = rnd() < 0.5 ? `rgba(255,255,255,${0.04 + rnd() * 0.06})` : `rgba(0,0,0,${0.06 + rnd() * 0.08})`;
    c.lineWidth = 1 + rnd() * 2;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
  }
  GRAIN = cv;
  return cv;
}

export function icon(glyph, color = '#3a4150', t = null) {
  if (PAINTED[glyph]) return PAINTED[glyph]; // icône peinte importée
  const key = glyph + '|' + color + '|' + (t ? JSON.stringify(t) : '');
  let url = cache.get(key);
  if (url) return url;
  const Z = 2; // dessin en 128 px : plus net
  const cv = document.createElement('canvas');
  cv.width = cv.height = S * Z;
  const c = cv.getContext('2d');
  c.scale(Z, Z);
  const isItem = glyph.startsWith('i_');
  // fond : dégradé + taches de peinture + grain
  const g = c.createLinearGradient(0, 0, S * 0.3, S);
  if (isItem) { g.addColorStop(0, '#343a4a'); g.addColorStop(1, '#101318'); }
  else { g.addColorStop(0, shade(color, 0.95)); g.addColorStop(0.55, shade(color, 0.5)); g.addColorStop(1, shade(color, 0.22)); }
  c.fillStyle = g;
  c.fillRect(0, 0, S, S);
  const rg = c.createRadialGradient(20, 16, 2, 30, 30, 44);
  if (isItem) { rg.addColorStop(0, color + '66'); rg.addColorStop(0.6, color + '18'); rg.addColorStop(1, 'rgba(0,0,0,0)'); }
  else { rg.addColorStop(0, 'rgba(255,245,220,.35)'); rg.addColorStop(1, 'rgba(0,0,0,0)'); }
  c.fillStyle = rg; c.fillRect(0, 0, S, S);
  c.drawImage(grain(), 0, 0, S, S);
  // motif sur un calque à part : ombre portée + volume
  const lay = document.createElement('canvas');
  lay.width = lay.height = S * Z;
  const lc = lay.getContext('2d');
  lc.scale(Z, Z);
  const fn = G[glyph] || G.i_quest;
  const tint = Object.assign({}, TINT[0], t || {});
  try { fn(lc, tint); } catch (e) { /* glyphe manquant */ }
  lc.setTransform(1, 0, 0, 1, 0, 0);
  lc.globalCompositeOperation = 'source-atop';
  const vol = lc.createLinearGradient(0, 0, S * Z * 0.4, S * Z);
  vol.addColorStop(0, 'rgba(255,250,235,.38)'); vol.addColorStop(0.45, 'rgba(255,255,255,0)'); vol.addColorStop(1, 'rgba(0,0,0,.42)');
  lc.fillStyle = vol; lc.fillRect(0, 0, S * Z, S * Z);
  lc.globalAlpha = 0.9; lc.drawImage(grain(), 0, 0, S * Z, S * Z); lc.globalAlpha = 1;
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.shadowColor = 'rgba(0,0,0,.65)'; c.shadowBlur = 5 * Z; c.shadowOffsetX = 1.5 * Z; c.shadowOffsetY = 2.5 * Z;
  c.drawImage(lay, 0, 0);
  c.restore();
  // vignette et biseau
  const vg = c.createRadialGradient(32, 30, 18, 32, 32, 48);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)');
  c.fillStyle = vg; c.fillRect(0, 0, S, S);
  c.strokeStyle = 'rgba(0,0,0,.85)'; c.lineWidth = 2; c.strokeRect(1, 1, S - 2, S - 2);
  c.strokeStyle = 'rgba(255,240,210,.22)'; c.lineWidth = 1; c.strokeRect(2.5, 2.5, S - 5, S - 5);
  url = cv.toDataURL();
  cache.set(key, url);
  return url;
}

// Teintes d'un objet selon son palier
const METALS = ['#9a8a70', '#b8bec8', '#d0d6de', '#c8d8f0', '#9fb8ff', '#8a6aa0', '#fff0c0'];
const CLOTHS = ['#8a7a6a', '#5a6a8a', '#8a5aa8', '#3a6ab0', '#9a3a8a', '#4a3a68', '#f0e8f8'];
const LEATHERS = ['#8a6440', '#7a5230', '#6a7a3a', '#3a6a3a', '#5a4030', '#7a3a2a', '#d8c89a'];
const GEMS = ['#7fd1ff', '#8fe86a', '#ffb050', '#b58cff', '#ff5a8a', '#9fe8ff', '#fff0a0'];
export function itemIcon(it) {
  const k = gearIconKey(it);
  if (k && PAINTED[k]) return PAINTED[k];
  const RC = ['#cfd3da', '#5fd35a', '#3fa0ff', '#b86bff', '#ff9f2a', '#ff4f7b'];
  const t = it.tier || 1;
  const tint = { metal: METALS[t - 1], cloth: CLOTHS[t - 1], leather: LEATHERS[t - 1], gem: GEMS[t - 1], color: it.cls === 'guerrier' || it.cls === 'templier' ? '#3b6fd8' : null };
  return icon(it.icon || 'i_quest', RC[it.rarity || 0], it.type === 'gear' ? tint : it.tint ? { gem: it.tint } : null);
}
