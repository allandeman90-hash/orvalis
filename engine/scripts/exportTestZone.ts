// npm run zone:export — writes the M1.1 test zone asset from the legacy terrain.
// Deterministic: running it again gives the same bytes (a test checks the committed file against a fresh export).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeGridZone, TEST_ZONE } from '../src/terrain';
import { sampleLegacyZone } from './legacyZoneSource.mjs';

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../public', TEST_ZONE.url);
const bytes = encodeGridZone(sampleLegacyZone(TEST_ZONE));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log(`[zone:export] ${TEST_ZONE.id}: ${bytes.length} bytes → ${out}`);
