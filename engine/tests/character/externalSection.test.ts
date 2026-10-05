import { describe, expect, it } from 'vitest';
import { AssetManager } from '../../src/assets';
import {
  bindCharacterTextureAppearancePart,
  decodeExternalCharacterSection,
  externalCharacterSectionLoader,
  ORVALIS_CHARACTER_SECTION_ASSET_TYPE,
  ORVALIS_CHARACTER_SECTION_FORMAT,
} from '../../src/character';

function encoded(value: unknown): ArrayBuffer {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function sectionJson(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    format: ORVALIS_CHARACTER_SECTION_FORMAT,
    name: 'test-facial-hair',
    region: 'facialHair',
    width: 32,
    height: 32,
    alpha: 'key',
    data: new Array<number>(32 * 32 * 4).fill(0),
    ...overrides,
  };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('V1.2 external character composite sections', () => {
  it('decodes a strict region-sized RGBA section into the existing CharacterSection runtime type', () => {
    const decoded = decodeExternalCharacterSection(encoded(sectionJson()), 'assets/characters/sections/beard.orvsection.json');
    expect(decoded.sourceUrl).toBe('assets/characters/sections/beard.orvsection.json');
    expect(decoded.section).toMatchObject({ name: 'test-facial-hair', region: 'facialHair', alpha: 'key' });
    expect(decoded.section.data).toBeInstanceOf(Uint8Array);
    expect(decoded.section.data).toHaveLength(4096);
  });

  it('runs through AssetManager and binds only to the exact appearance source, region and alpha', async () => {
    const source = 'assets/characters/sections/beard.orvsection.json';
    const manager = new AssetManager(async () => encoded(sectionJson()));
    const Section = manager.registerLoader(ORVALIS_CHARACTER_SECTION_ASSET_TYPE, externalCharacterSectionLoader());
    const handle = manager.request(Section, source);
    await settle();
    expect(manager.state(handle)).toBe('decoded');
    expect(manager.pump()).toBe(1);
    const asset = manager.get(handle)!;

    const part = { region: 'facialHair' as const, asset: source, alpha: 'key' as const };
    expect(bindCharacterTextureAppearancePart(part, asset)).toBe(asset.section);
    expect(() => bindCharacterTextureAppearancePart({ ...part, asset: 'other.orvsection.json' }, asset)).toThrow(/expects/);
    expect(() => bindCharacterTextureAppearancePart({ ...part, region: 'hair' }, asset)).toThrow(/region/);
    expect(() => bindCharacterTextureAppearancePart({ ...part, alpha: 'blend4' }, asset)).toThrow(/alpha/);
  });

  it('rejects wrong layout dimensions, byte counts, regions and alpha modes', () => {
    expect(() => decodeExternalCharacterSection(encoded(sectionJson({ width: 31 })))).toThrow(/must be 32×32/);
    expect(() => decodeExternalCharacterSection(encoded(sectionJson({ data: [0, 0, 0, 0] })))).toThrow(/expected 4096/);
    expect(() => decodeExternalCharacterSection(encoded(sectionJson({ region: 'not-a-region' })))).toThrow(/region must be one of/);
    expect(() => decodeExternalCharacterSection(encoded(sectionJson({ alpha: 'smooth' })))).toThrow(/alpha must be/);
  });
});
