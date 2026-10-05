import { decodeGridZone, gridZoneSampler, gridZoneTiles, liquidFixture, type TerrainConfig, testZonePaint } from '../terrain';
import type { StreamWorld } from './terrainStream';

/** The M1.1 test zone as a streamable map, from the bytes of its asset file. */
export function testZoneWorld(config: TerrainConfig, bytes: ArrayBuffer | Uint8Array): StreamWorld {
  const zone = decodeGridZone(bytes);
  // The old world's water is one plane at height 0 (legacy waterDepth = −ground height): an ocean wherever the
  // ground is lower. The old game has no separate river class, and no lava in this part of the world.
  return { id: zone.id, tiles: gridZoneTiles(config, zone), heightAt: gridZoneSampler(zone).heightAt, paint: testZonePaint(zone), liquid: liquidFixture(config.tileSize, 'sea') };
}
