import type { AssetLoader } from '../assets';
import { type CharacterSection, type SectionAlpha } from './composite';
import { CHARACTER_REGION_NAMES, CHARACTER_REGIONS, type CharacterRegionName } from './textureLayout';

/** External authoring format for one source image used by the 256×256 character composite. */
export const ORVALIS_CHARACTER_SECTION_FORMAT = 'orvalis-character-section-1';
export const ORVALIS_CHARACTER_SECTION_ASSET_TYPE = 'orvalis-character-section';

export interface ExternalCharacterSectionAsset {
  readonly format: typeof ORVALIS_CHARACTER_SECTION_FORMAT;
  readonly sourceUrl: string;
  readonly section: CharacterSection;
}

type JsonObject = Record<string, unknown>;

function object(value: unknown, what: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`character section: ${what} must be an object`);
  return value as JsonObject;
}

function text(value: unknown, what: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`character section: ${what} must be a non-empty string`);
  return value;
}

function integer(value: unknown, what: string, min: number, max: number): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) throw new Error(`character section: ${what} must be an integer in ${min}..${max}`);
  return value as number;
}

function region(value: unknown): CharacterRegionName {
  if (typeof value === 'string' && (CHARACTER_REGION_NAMES as readonly string[]).includes(value)) return value as CharacterRegionName;
  throw new Error(`character section: region must be one of ${CHARACTER_REGION_NAMES.join(', ')}`);
}

function alpha(value: unknown): SectionAlpha {
  if (value === 'opaque' || value === 'key' || value === 'blend4') return value;
  throw new Error('character section: alpha must be "opaque", "key" or "blend4"');
}

function bytes(value: unknown, what: string): Uint8Array {
  if (!Array.isArray(value)) throw new Error(`character section: ${what} must be an array`);
  return new Uint8Array(value.map((entry, index) => integer(entry, `${what}[${index}]`, 0, 255)));
}

/** Decode one external RGBA source section and require it to match the engine's authored composite layout exactly. */
export function decodeExternalCharacterSection(bytesIn: ArrayBuffer, url = '<memory>'): ExternalCharacterSectionAsset {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytesIn));
  } catch (cause) {
    throw new Error(`character section: ${url} is not valid UTF-8 JSON`, { cause });
  }
  const root = object(parsed, 'root');
  if (root.format !== ORVALIS_CHARACTER_SECTION_FORMAT) {
    throw new Error(`character section: ${url} uses unsupported format "${String(root.format)}"`);
  }
  const targetRegion = region(root.region);
  const target = CHARACTER_REGIONS[targetRegion];
  const width = integer(root.width, 'width', 1, 4096);
  const height = integer(root.height, 'height', 1, 4096);
  if (width !== target.width || height !== target.height) {
    throw new Error(`character section: ${url} region ${targetRegion} must be ${target.width}×${target.height}, got ${width}×${height}`);
  }
  const data = bytes(root.data, 'data');
  const expected = width * height * 4;
  if (data.length !== expected) throw new Error(`character section: ${url} data has ${data.length} bytes, expected ${expected}`);

  return {
    format: ORVALIS_CHARACTER_SECTION_FORMAT,
    sourceUrl: url,
    section: {
      name: text(root.name, 'name'),
      region: targetRegion,
      alpha: alpha(root.alpha),
      data,
    },
  };
}

/** AssetManager loader for authored character composite sources. GPU upload remains the CharacterComposite's job. */
export function externalCharacterSectionLoader(): AssetLoader<ExternalCharacterSectionAsset, ExternalCharacterSectionAsset> {
  return {
    decode: (bytesIn, url) => decodeExternalCharacterSection(bytesIn, url),
    upload: (asset) => asset,
  };
}
