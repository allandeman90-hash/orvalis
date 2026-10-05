// Sons et musique 100 % procéduraux (WebAudio). Démarrent au premier clic du joueur.
import { G } from '../game/state.js';

let ctx = null, master = null, sfx = null, music = null, noiseBuf = null;
const last = {};

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 1; master.connect(ctx.destination);
  sfx = ctx.createGain(); sfx.connect(master);
  music = ctx.createGain(); music.connect(master);
  const len = ctx.sampleRate * 1.5;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  setVolume();
  return ctx;
}

function setVolume() {
  if (!ctx) return;
  sfx.gain.value = (G.settings.volume ?? 0.7) * 0.55;
  music.gain.value = (G.settings.music ?? 0.4) * 0.28;
}

// ---- briques de synthèse
function env(g, t, a, peak, dec, sus = 0) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sus || 0.0001), t + a + dec);
}
function tone(type, f0, f1, t, dur, vol, dest = sfx, a = 0.005) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  env(g, t, a, vol, dur);
  o.connect(g); g.connect(dest);
  o.start(t); o.stop(t + a + dur + 0.05);
  return o;
}
function noise(t, dur, vol, ftype = 'bandpass', f0 = 1000, f1 = null, q = 1, dest = sfx, a = 0.004) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = ftype; f.frequency.setValueAtTime(f0, t); f.Q.value = q;
  if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  const g = ctx.createGain();
  env(g, t, a, vol, dur);
  s.connect(f); f.connect(g); g.connect(dest);
  s.start(t, Math.random() * 0.5); s.stop(t + a + dur + 0.05);
}
function chord(freqs, t, dur, vol, type = 'triangle', spread = 0.06) {
  freqs.forEach((f, i) => tone(type, f, f, t + i * spread, dur, vol));
}
const N = (n) => 440 * Math.pow(2, (n - 69) / 12);

const SOUNDS = {
  hit: (t, v) => { noise(t, 0.09, 0.5 * v, 'bandpass', 900, 300, 1.2); tone('sine', 150, 60, t, 0.12, 0.5 * v); },
  crit: (t, v) => { noise(t, 0.12, 0.6 * v, 'bandpass', 1400, 400, 1); tone('sine', 180, 50, t, 0.16, 0.6 * v); tone('square', 1200, 600, t, 0.05, 0.08 * v); },
  spellhit: (t, v) => { noise(t, 0.18, 0.35 * v, 'lowpass', 2400, 300, 0.8); tone('sine', 520, 260, t, 0.15, 0.2 * v); },
  hurt: (t, v) => { noise(t, 0.1, 0.35 * v, 'lowpass', 700, 200, 1); tone('sine', 110, 70, t, 0.14, 0.4 * v); },
  swing: (t, v) => noise(t, 0.14, 0.28 * v, 'highpass', 900, 3000, 0.7, sfx, 0.02),
  whirl: (t, v) => { for (let i = 0; i < 3; i++) noise(t + i * 0.09, 0.12, 0.22 * v, 'highpass', 800, 2800, 0.7, sfx, 0.02); },
  charge: (t, v) => { noise(t, 0.3, 0.3 * v, 'lowpass', 400, 1500, 1, sfx, 0.05); tone('sawtooth', 90, 140, t, 0.3, 0.08 * v); },
  cast: (t, v) => { tone('sine', 520, 880, t, 0.22, 0.14 * v, sfx, 0.02); tone('triangle', 780, 1320, t + 0.03, 0.2, 0.08 * v); },
  fire: (t, v) => { noise(t, 0.4, 0.35 * v, 'lowpass', 1800, 300, 0.7, sfx, 0.03); tone('sawtooth', 110, 70, t, 0.35, 0.06 * v); },
  frost: (t, v) => { tone('sine', 1800, 2400, t, 0.3, 0.1 * v, sfx, 0.01); tone('sine', 2600, 2000, t + 0.05, 0.35, 0.07 * v); noise(t, 0.25, 0.1 * v, 'highpass', 4000, 6000, 1); },
  zap: (t, v) => { for (let i = 0; i < 4; i++) tone('square', 400 + Math.random() * 900, 120, t + i * 0.04, 0.05, 0.08 * v); noise(t, 0.2, 0.25 * v, 'highpass', 2000, 800, 1); },
  nature: (t, v) => { tone('triangle', 330, 440, t, 0.25, 0.1 * v, sfx, 0.03); noise(t, 0.2, 0.08 * v, 'bandpass', 3000, 1500, 2, sfx, 0.03); },
  heal: (t, v) => chord([N(72), N(76), N(79), N(84)], t, 0.5, 0.07 * v, 'triangle', 0.07),
  bow: (t, v) => { tone('triangle', 260, 120, t, 0.12, 0.3 * v); noise(t + 0.01, 0.1, 0.15 * v, 'highpass', 2500, 5000, 1); },
  shield: (t, v) => { tone('square', 620, 590, t, 0.3, 0.07 * v); tone('sine', 1240, 1180, t, 0.4, 0.06 * v); noise(t, 0.08, 0.2 * v, 'bandpass', 3000, 2000, 2); },
  shout: (t, v) => { const o = tone('sawtooth', 140, 110, t, 0.5, 0.12 * v, sfx, 0.04); noise(t, 0.45, 0.1 * v, 'bandpass', 600, 400, 3, sfx, 0.04); },
  howl: (t, v) => { tone('sine', 380, 620, t, 0.5, 0.08 * v, sfx, 0.1); tone('sine', 620, 420, t + 0.5, 0.5, 0.07 * v); },
  blink: (t, v) => { tone('sine', 300, 1800, t, 0.2, 0.12 * v); noise(t, 0.2, 0.08 * v, 'highpass', 2000, 8000, 1); },
  poly: (t, v) => { tone('square', 900, 1400, t, 0.08, 0.07 * v); tone('square', 1400, 700, t + 0.1, 0.12, 0.07 * v); },
  stealth: (t, v) => noise(t, 0.4, 0.12 * v, 'lowpass', 3000, 300, 0.5, sfx, 0.05),
  trap: (t, v) => { tone('square', 200, 180, t, 0.05, 0.15 * v); noise(t, 0.06, 0.2 * v, 'bandpass', 2400, 2000, 3); },
  whoosh: (t, v) => noise(t, 0.3, 0.25 * v, 'bandpass', 500, 2500, 1, sfx, 0.05),
  boom: (t, v) => { noise(t, 0.6, 0.6 * v, 'lowpass', 900, 80, 0.7); tone('sine', 90, 35, t, 0.5, 0.6 * v); },
  windup: (t, v) => tone('sawtooth', 70, 110, t, 0.5, 0.06 * v, sfx, 0.1),
  levelup: (t, v) => { [60, 64, 67, 72, 76, 79, 84].forEach((n, i) => tone('triangle', N(n), N(n), t + i * 0.08, 0.5, 0.12 * v)); tone('sine', N(48), N(48), t, 1.2, 0.12 * v); },
  quest: (t, v) => chord([N(67), N(72)], t, 0.35, 0.1 * v, 'triangle', 0.1),
  questdone: (t, v) => { [N(60), N(64), N(67), N(72)].forEach((f, i) => tone('triangle', f, f, t + i * 0.1, 0.4, 0.11 * v)); chord([N(48), N(55), N(64)], t + 0.4, 0.9, 0.06 * v, 'sine', 0); },
  discover: (t, v) => chord([N(74), N(79), N(86)], t, 0.6, 0.07 * v, 'sine', 0.12),
  loot: (t, v) => { tone('square', 1200, 1200, t, 0.04, 0.05 * v); tone('square', 1600, 1600, t + 0.05, 0.05, 0.05 * v); },
  epic: (t, v) => { [N(79), N(83), N(86), N(91)].forEach((f, i) => tone('sine', f, f, t + i * 0.06, 0.4, 0.08 * v)); },
  coin: (t, v) => { tone('square', 2000, 2000, t, 0.03, 0.05 * v); tone('square', 2600, 2600, t + 0.04, 0.06, 0.05 * v); },
  error: (t, v) => tone('square', 140, 120, t, 0.12, 0.06 * v),
  open: (t, v) => tone('triangle', 700, 900, t, 0.05, 0.06 * v),
  close: (t, v) => tone('triangle', 800, 600, t, 0.05, 0.05 * v),
  target: (t, v) => tone('sine', 1500, 1500, t, 0.03, 0.03 * v),
  equip: (t, v) => { noise(t, 0.08, 0.15 * v, 'bandpass', 2500, 1800, 2); tone('square', 400, 380, t, 0.06, 0.05 * v); },
  learn: (t, v) => chord([N(76), N(83)], t, 0.3, 0.08 * v, 'triangle', 0.08),
  potion: (t, v) => { for (let i = 0; i < 4; i++) tone('sine', 400 + i * 150, 600 + i * 150, t + i * 0.05, 0.05, 0.08 * v); },
  eat: (t, v) => { for (let i = 0; i < 3; i++) noise(t + i * 0.15, 0.06, 0.12 * v, 'bandpass', 1200, 800, 2); },
  death: (t, v) => { tone('sawtooth', 300, 60, t, 1.2, 0.1 * v, sfx, 0.02); chord([N(45), N(48), N(52)], t + 0.2, 1.4, 0.06 * v, 'sine', 0.15); },
  anvil: (t, v) => { tone('square', 880, 860, t, 0.5, 0.07 * v); tone('sine', 1760, 1700, t, 0.7, 0.06 * v); noise(t, 0.05, 0.3 * v, 'bandpass', 3500, 3000, 2); },
  horn: (t, v) => { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; f.connect(sfx); tone('sawtooth', N(50), N(50), t, 1.3, 0.12 * v, f, 0.15); tone('sawtooth', N(57), N(57), t + 0.05, 1.2, 0.09 * v, f, 0.15); },
  teleport: (t, v) => { tone('sine', 200, 1600, t, 0.6, 0.1 * v, sfx, 0.05); noise(t, 0.6, 0.08 * v, 'bandpass', 800, 4000, 2, sfx, 0.05); },
  mount: (t, v) => { for (let i = 0; i < 4; i++) noise(t + i * 0.12, 0.05, 0.2 * v, 'bandpass', 700, 500, 3); },
};

// ---------------------------------------------------------------------------
// Musique d'ambiance générative par région
const MOODS = {
  meadow: { root: 60, prog: [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]], scale: [0, 2, 4, 7, 9], tempo: 7 },
  badlands: { root: 62, prog: [[0, 3, 7], [5, 9, 12], [3, 7, 10], [10, 14, 17]], scale: [0, 3, 5, 7, 10], tempo: 7 },
  forest: { root: 57, prog: [[0, 3, 7], [8, 12, 15], [5, 8, 12], [7, 10, 14]], scale: [0, 2, 3, 7, 9], tempo: 8 },
  canyon: { root: 52, prog: [[0, 3, 7], [1, 5, 8], [0, 3, 7], [10, 13, 17]], scale: [0, 1, 3, 7, 8], tempo: 8 },
  swamp: { root: 50, prog: [[0, 3, 7], [0, 3, 8], [5, 8, 12], [3, 7, 10]], scale: [0, 3, 5, 6, 10], tempo: 9 },
  ruins: { root: 50, prog: [[0, 3, 7], [8, 12, 15], [3, 7, 10], [7, 11, 14]], scale: [0, 2, 3, 7, 8], tempo: 9 },
  snow: { root: 65, prog: [[0, 4, 7], [2, 6, 9], [7, 11, 14], [4, 7, 11]], scale: [0, 2, 4, 6, 9], tempo: 10 },
  volcanic: { root: 45, prog: [[0, 3, 7], [1, 4, 8], [0, 3, 6], [10, 13, 17]], scale: [0, 1, 3, 6, 7], tempo: 8 },
  storm: { root: 48, prog: [[0, 3, 7], [8, 12, 15], [10, 14, 17], [7, 11, 14]], scale: [0, 3, 5, 7, 10], tempo: 7 },
  dungeon: { root: 47, prog: [[0, 3, 7], [1, 5, 8], [5, 8, 12], [0, 3, 6]], scale: [0, 1, 3, 5, 7, 8], tempo: 9 },
  raid: { root: 45, prog: [[0, 3, 7], [8, 12, 15], [5, 8, 12], [7, 11, 14], [0, 3, 7], [3, 7, 10]], scale: [0, 2, 3, 7, 8, 10], tempo: 6 },
  abyss: { root: 43, prog: [[0, 3, 6], [1, 4, 8], [0, 3, 6], [11, 14, 18]], scale: [0, 1, 3, 6, 7, 10], tempo: 10 },
  title: { root: 55, prog: [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14], [0, 4, 7], [4, 7, 11], [5, 9, 12], [7, 11, 14]], scale: [0, 2, 4, 7, 9, 11], tempo: 6 },
};

export const Audio = {
  enabled: true,
  mood: 'meadow',
  step: 0,
  nextT: 0,
  melT: 0,

  unlock() {
    const c = ensure();
    if (c && c.state === 'suspended') c.resume();
  },
  setVolume,

  play(name, pos, vol = 1) {
    if (!ctx || ctx.state !== 'running') return;
    const fn = SOUNDS[name] || SOUNDS[{ swing: 'swing' }[name]];
    if (!fn) return;
    const now = ctx.currentTime;
    if (last[name] && now - last[name] < 0.045) return;
    last[name] = now;
    let v = vol;
    if (pos && G.player) {
      const d = Math.hypot(pos.x - G.player.pos.x, pos.z - G.player.pos.z);
      if (d > 60) return;
      v *= Math.max(0.12, 1 - d / 60);
    }
    try { fn(now + 0.005, v); } catch (e) { /* ignore */ }
  },

  setZone(z) {
    this.mood = z.biome;
  },

  update(dt) {
    if (!ctx || ctx.state !== 'running' || (G.settings.music ?? 0.4) <= 0.001) return;
    const now = ctx.currentTime;
    if (now < this.nextT - 0.2) {
      // mélodie éparse
      this.melT -= dt;
      if (this.melT <= 0) {
        const M = MOODS[this.mood] || MOODS.meadow;
        this.melT = 1.2 + Math.random() * 2.6;
        if (Math.random() < 0.55) {
          const deg = M.scale[Math.floor(Math.random() * M.scale.length)] + (Math.random() < 0.3 ? 12 : 0);
          const f = N(M.root + 12 + deg);
          const o = ctx.createOscillator(), g = ctx.createGain(), fl = ctx.createBiquadFilter();
          o.type = 'triangle'; o.frequency.value = f;
          fl.type = 'lowpass'; fl.frequency.value = 2200;
          env(g, now, 0.02, 0.09, 1.8);
          o.connect(fl); fl.connect(g); g.connect(music);
          o.start(now); o.stop(now + 2);
        }
      }
      return;
    }
    // nouvel accord de nappe
    const M = MOODS[this.mood] || MOODS.meadow;
    const ch = M.prog[this.step % M.prog.length];
    this.step++;
    const dur = M.tempo;
    const t = Math.max(now, this.nextT);
    const night = G.sky ? G.sky.night : 0;
    const combat = G.player && G.player.inCombat() ? 1 : 0;
    for (const n of ch) {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
        o.type = 'sawtooth';
        o.frequency.value = N(M.root - 12 + n);
        o.detune.value = det;
        f.type = 'lowpass'; f.frequency.value = 500 + (1 - night) * 500 + combat * 400; f.Q.value = 0.7;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.045, t + dur * 0.35);
        g.gain.linearRampToValueAtTime(0.0001, t + dur * 1.08);
        o.connect(f); f.connect(g); g.connect(music);
        o.start(t); o.stop(t + dur * 1.1);
      }
    }
    // basse
    tone('sine', N(M.root - 24 + ch[0]), N(M.root - 24 + ch[0]), t, dur * 0.95, 0.07, music, 0.8);
    // tambour de combat
    if (combat) for (let i = 0; i < Math.floor(dur / 0.9); i++) { noise(t + i * 0.9, 0.15, 0.1, 'lowpass', 180, 60, 1, music); }
    this.nextT = t + dur;
  },
};

export function initAudio() {
  G.audio = Audio;
  const unlock = () => { Audio.unlock(); };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
  (G.frameHooks ||= []).push((dt) => Audio.update(dt));
}
