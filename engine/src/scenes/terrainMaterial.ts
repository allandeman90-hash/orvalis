import { type LiquidFixtureKind, paintFixture, type PaintKind, type TerrainConfig, type TerrainPaint } from '../terrain';
import { DEFAULT_FOG_COLOR, proceduralPalette, solidPalette, type TerrainMaterialOptions } from '../terrainRender';

/** Which layer textures a debug scene uses: generated placeholders, or flat colours for exact pixel checks. */
export type PaletteKind = 'procedural' | 'solid';

export interface SceneMaterialOptions {
  /** Alpha maps of the texture layers. Undefined = tiles are built without material (base layer only). */
  readonly paint?: PaintKind | undefined;
  /** Default 'procedural'. */
  readonly palette?: PaletteKind | undefined;
  /** Texture repeats across one chunk. Default 4 (our choice, configurable). */
  readonly layerRepeatsPerChunk?: number | undefined;
  /** Default true: textured terrain is lit and shows baked shadows. */
  readonly lit?: boolean | undefined;
  /** Distance fog: 'off', or distances in world units. Undefined = the scene's own default. */
  readonly fog?: SceneFog | undefined;
  /** Sky gradient and sun disc behind the textured terrain (needs the day/night values). Default false. */
  readonly sky?: boolean | undefined;
  /** Synthetic liquid laid over the fixture relief (see liquidFixture). Undefined = none. */
  readonly liquid?: LiquidFixtureKind | undefined;
  /** Height of that synthetic liquid's surface. Default 0. */
  readonly liquidLevel?: number | undefined;
}

export type SceneFog = 'off' | { readonly start: number; readonly end: number } | 'on';

/**
 * @param defaultFog what the scene uses when the options do not say (or say 'on' without distances); null = no fog.
 */
export function sceneMaterial(config: TerrainConfig, options: SceneMaterialOptions, defaultFog: { start: number; end: number } | null = null): { paint: TerrainPaint | undefined; material: TerrainMaterialOptions } {
  const range = options.fog === 'off' ? null : typeof options.fog === 'object' ? options.fog : options.fog === 'on' ? (defaultFog ?? { start: config.tileSize, end: 2 * config.tileSize }) : defaultFog;
  return {
    paint: options.paint ? paintFixture(config, options.paint) : undefined,
    material: { palette: options.palette === 'solid' ? solidPalette() : proceduralPalette(), liquidFrames: options.palette === 'solid' ? 'solid' : 'procedural', layerRepeatsPerChunk: options.layerRepeatsPerChunk ?? 4, lit: options.lit ?? true, ...(range ? { fog: { color: DEFAULT_FOG_COLOR, start: range.start, end: range.end } } : {}) },
  };
}
