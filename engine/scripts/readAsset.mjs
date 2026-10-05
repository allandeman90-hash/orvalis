// Reads a file of engine/public for the tests (which run under Node; the engine's own code never touches the disk).
import { readFileSync } from 'node:fs';

export function readPublicAsset(relativePath) {
  return new Uint8Array(readFileSync(new URL(`../public/${relativePath}`, import.meta.url)));
}
