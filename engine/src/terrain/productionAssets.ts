import type { AssetLoader } from '../assets';
import { MASK_SIZE } from './paint';

export const ORVALIS_TERRAIN_TEXTURE_FORMAT = 'orvalis-terrain-texture-1';
export const ORVALIS_TERRAIN_ALPHA_FORMAT = 'orvalis-terrain-alpha-1';
export const ORVALIS_TERRAIN_TEXTURE_ASSET_TYPE = 'orvalis-terrain-texture';
export const ORVALIS_TERRAIN_ALPHA_ASSET_TYPE = 'orvalis-terrain-alpha';

export interface ExternalTerrainTextureAsset {
  readonly format: typeof ORVALIS_TERRAIN_TEXTURE_FORMAT;
  readonly sourceUrl: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  /** RGBA8, row-major from the top-left. */
  readonly data: Uint8Array;
}

export interface ExternalTerrainAlphaAsset {
  readonly format: typeof ORVALIS_TERRAIN_ALPHA_FORMAT;
  readonly sourceUrl: string;
  readonly width: typeof MASK_SIZE;
  readonly height: typeof MASK_SIZE;
  /** One normalized 8-bit blend weight per mask texel. */
  readonly data: Uint8Array;
}

function objectOf(bytes: ArrayBuffer, label: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch (cause) {
    throw new Error(`terrain asset: ${label} is not valid JSON`, { cause });
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`terrain asset: ${label} root must be an object`);
  return value as Record<string, unknown>;
}

function positiveInt(value: unknown, label: string): number {
  if (!Number.isInteger(value) || !(value as number > 0)) throw new Error(`terrain asset: ${label} must be an integer > 0`);
  return value as number;
}

function bytesOf(value: unknown, expected: number, label: string): Uint8Array {
  if (!Array.isArray(value) || value.length !== expected) throw new Error(`terrain asset: ${label} must contain exactly ${expected} bytes`);
  const out = new Uint8Array(expected);
  for (let i = 0; i < expected; i++) {
    const byte = value[i];
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) throw new Error(`terrain asset: ${label}[${i}] must be an integer 0..255`);
    out[i] = byte;
  }
  return out;
}

export function decodeExternalTerrainTexture(bytes: ArrayBuffer, sourceUrl = '<memory>'): ExternalTerrainTextureAsset {
  const root = objectOf(bytes, sourceUrl);
  if (root.format !== ORVALIS_TERRAIN_TEXTURE_FORMAT) throw new Error(`terrain asset: ${sourceUrl} format must be "${ORVALIS_TERRAIN_TEXTURE_FORMAT}"`);
  if (typeof root.name !== 'string' || root.name.trim().length === 0) throw new Error(`terrain asset: ${sourceUrl} name must be a non-empty string`);
  const width = positiveInt(root.width, `${sourceUrl} width`);
  const height = positiveInt(root.height, `${sourceUrl} height`);
  return {
    format: ORVALIS_TERRAIN_TEXTURE_FORMAT,
    sourceUrl,
    name: root.name,
    width,
    height,
    data: bytesOf(root.data, width * height * 4, `${sourceUrl} data`),
  };
}

export function decodeExternalTerrainAlpha(bytes: ArrayBuffer, sourceUrl = '<memory>'): ExternalTerrainAlphaAsset {
  const root = objectOf(bytes, sourceUrl);
  if (root.format !== ORVALIS_TERRAIN_ALPHA_FORMAT) throw new Error(`terrain asset: ${sourceUrl} format must be "${ORVALIS_TERRAIN_ALPHA_FORMAT}"`);
  if (root.width !== MASK_SIZE || root.height !== MASK_SIZE) throw new Error(`terrain asset: ${sourceUrl} alpha map must be ${MASK_SIZE}×${MASK_SIZE}`);
  return {
    format: ORVALIS_TERRAIN_ALPHA_FORMAT,
    sourceUrl,
    width: MASK_SIZE,
    height: MASK_SIZE,
    data: bytesOf(root.data, MASK_SIZE * MASK_SIZE, `${sourceUrl} data`),
  };
}

export function externalTerrainTextureLoader(): AssetLoader<ExternalTerrainTextureAsset, ExternalTerrainTextureAsset> {
  return { decode: decodeExternalTerrainTexture, upload: (decoded) => decoded };
}

export function externalTerrainAlphaLoader(): AssetLoader<ExternalTerrainAlphaAsset, ExternalTerrainAlphaAsset> {
  return { decode: decodeExternalTerrainAlpha, upload: (decoded) => decoded };
}
