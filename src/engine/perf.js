// Fluidité : viser 60 images/s.
// 1) Détail selon la distance : les personnages et créatures lointains ne projettent plus d'ombre, les très lointains
//    ne sont plus dessinés (le brouillard les cache déjà). C'est ce qui coûte le plus : chaque modèle compte ~15 pièces.
// 2) Qualité automatique : si l'image met trop longtemps à venir, on baisse la résolution interne par paliers,
//    puis les ombres ; on remonte quand la marge revient.
// 3) Compteur d'images par seconde (option).
import { G } from '../game/state.js';

const SHADOW_DIST = 30; // m : au-delà, pas d'ombre portée

export const Perf = {
  samples: [],
  snapshot() { const a=[...this.samples].sort((a,b)=>a-b); return {medianMs:a[Math.floor(a.length*.5)]||0,p95Ms:a[Math.floor(a.length*.95)]||0,p99Ms:a[Math.floor(a.length*.99)]||0,render:{...G.renderer.info.render},memory:{...G.renderer.info.memory},sectors:G.terrainSectors?.stats,decorSectors:G.decor?.chunks.length}; },
  level: 0, // 0 = pleine qualité … 4 = minimum
  ema: 16.7,
  lowT: 0,
  highT: 0,
  cool: 0,
  fps: 60,
  fpsAcc: 0,
  fpsN: 0,
  fpsT: 0,
  lodT: 0,

  frame(rawMs) {
    if(G.mode==='game'){this.samples.push(rawMs);if(this.samples.length>600)this.samples.shift();}
    const ms = Math.min(rawMs, 250);
    this.ema += (ms - this.ema) * 0.08;
    // compteur
    this.fpsAcc += ms; this.fpsN++; this.fpsT += ms;
    if (this.fpsT >= 500) { this.fps = Math.round(1000 / (this.fpsAcc / this.fpsN)); this.fpsAcc = 0; this.fpsN = 0; this.fpsT = 0; this.showFps(); }
    if (G.mode !== 'game') return;
    this.lodT -= ms;
    if (this.lodT <= 0) { this.lodT = 150; this.lod(); }
    this.auto(ms);
  },

  // détail des entités selon la distance à la caméra
  lod() {
    const cam = G.camera.position, P = G.player;
    for (const e of G.world.entities) {
      const root = e.model?.root;
      if (!root || e === P) continue;
      const dx = e.pos.x - cam.x, dz = e.pos.z - cam.z, d2 = dx * dx + dz * dz;
      const sh = d2 < SHADOW_DIST * SHADOW_DIST && G.settings.shadows;
      if (e._lodShadow !== sh) {
        e._lodShadow = sh;
        root.traverse((o) => { if (o.isMesh) o.castShadow = sh; });
      }
    }
  },

  // qualité automatique (option « Fluidité automatique »)
  auto(ms) {
    const S = G.settings;
    // navigateur piloté par les tests automatiques (rendu logiciel très lent) : pas d'ajustement, sauf test dédié
    if (navigator.webdriver && !G.flags.perfTest) return;
    if (S.autoPerf === false) { if (this.level) { this.level = 0; this.apply(); } return; }
    const dt = ms / 1000;
    this.cool = Math.max(0, this.cool - dt);
    if (this.ema > 19) { this.lowT += dt; this.highT = 0; } else if (this.ema < 17.6) { this.highT += dt; this.lowT = 0; } else { this.lowT = 0; this.highT = 0; }
    this.clock = (this.clock || 0) + dt;
    if (this.lowT > 1.5 && this.level < 4) {
      // redescendre juste après être remonté = la machine est à la limite : on attend plus longtemps avant de réessayer
      this.cool = this.clock - (this.upAt ?? -99) < 30 ? 90 : 12;
      this.level++; this.lowT = 0; this.apply();
    } else if (this.highT > 6 && this.level > 0 && this.cool <= 0) { this.level--; this.highT = 0; this.cool = 6; this.upAt = this.clock; this.apply(); }
  },
  scale() { return [1, 0.85, 0.72, 0.72, 0.6][this.level]; },
  apply() {
    const r = G.renderer, S = G.settings;
    const base = Math.min(window.devicePixelRatio || 1, S.quality === 2 ? 2 : S.quality === 1 ? 1.5 : 1) * (S.quality === 0 ? .72 : 1);
    r.setPixelRatio(base * this.scale());
    const shadowsOn = !!S.shadows && this.level < 3;
    if (r.shadowMap.enabled !== shadowsOn) {
      r.shadowMap.enabled = shadowsOn;
      G.sky.sun.castShadow = shadowsOn;
      G.scene.traverse((o) => { if (o.material) { const m = Array.isArray(o.material) ? o.material : [o.material]; m.forEach((x) => (x.needsUpdate = true)); } });
    }
    const vd = S.viewDist - (this.level >= 4 ? 80 : 0);
    G.sky.viewDist = vd;
    G.camera.far = vd + 520;
    G.camera.updateProjectionMatrix();
    this.showFps();
  },

  showFps() {
    let el = this.el;
    if (!G.settings.showFps) { if (el) el.hidden = true; return; }
    if (!el) {
      el = document.createElement('div');
      el.id = 'fps';
      document.getElementById('ui').appendChild(el);
      this.el = el;
    }
    el.hidden = false;
    el.className = 'num' + (this.fps >= 55 ? ' ok' : this.fps >= 40 ? ' mid' : ' low');
    el.textContent = `${this.fps} i/s${this.level ? ` · qualité auto −${this.level}` : ''}`;
  },
};
G.perf = Perf;
