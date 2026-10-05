import type { LookAtCamera } from '../camera';
import type { RendererBackend, TerrainDebugMode } from '../renderer';
import { SkyRenderer, type SkyState } from '../skyRender';
import type { TerrainEnvironment } from './terrainTile';

/**
 * The sky of a terrain scene: drawn first, as the background, in textured mode only (debug views and
 * wireframe keep their plain clear colour). It needs the day/night values: without them nothing is drawn.
 * GPU objects are only created when the sky is switched on.
 */
export interface SceneSky {
  /** Whether the sky is switched on (it is still only drawn in textured mode, once an environment was given). */
  readonly enabled: boolean;
  toggle(): boolean;
  setEnvironment(environment: TerrainEnvironment): void;
  /** Call right after beginFrame(). Returns true when the sky was drawn. */
  draw(camera: LookAtCamera, aspect: number, mode: { readonly debugMode: TerrainDebugMode; readonly wireframe: boolean }): boolean;
  dispose(): void;
}

export function createSceneSky(backend: RendererBackend, enabled: boolean): SceneSky {
  let on = enabled;
  let renderer: SkyRenderer | null = on ? new SkyRenderer(backend) : null;
  let state: SkyState | null = null;
  return {
    get enabled() {
      return on;
    },
    toggle(): boolean {
      on = !on;
      if (on && !renderer) renderer = new SkyRenderer(backend);
      return on;
    },
    setEnvironment(environment: TerrainEnvironment): void {
      // « Horizon colour ≈ fog colour » (spec §12–§13): the sky's horizon IS the fog colour.
      state = environment.sky ? { horizon: environment.fogColor, zenith: environment.sky.zenith, sunDirection: environment.sky.sunDirection, sunColor: environment.sky.sunColor } : null;
    },
    draw(camera, aspect, mode): boolean {
      if (!on || !renderer || !state || mode.debugMode !== 'textured' || mode.wireframe) return false;
      renderer.draw(camera, aspect, state);
      return true;
    },
    dispose(): void {
      renderer?.dispose();
      renderer = null;
    },
  };
}
