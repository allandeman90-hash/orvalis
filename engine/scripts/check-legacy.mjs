// Rebuilds the current (legacy, Three.js) Orvalis game from ../src in a
// temporary folder and checks the result is byte-identical to the delivered
// build in ../dist/orvalis.html (ignoring the build timestamp).
// Nothing is written into the project's own dist/ folder.
// Guards against accidental changes to the legacy game during the migration.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const fail = (msg) => {
  console.error('check-legacy: FAIL — ' + msg);
  process.exit(1);
};

if (!existsSync(path.join(root, 'node_modules', 'esbuild'))) fail('root dependencies missing — run `npm ci` in the Orvalis root folder');
if (!existsSync(path.join(root, 'dist', 'orvalis.html'))) fail('dist/orvalis.html (delivered build) not found');

const work = mkdtempSync(path.join(tmpdir(), 'orvalis-legacy-'));
cpSync(path.join(root, 'src'), path.join(work, 'src'), { recursive: true });
cpSync(path.join(root, 'tools', 'build.mjs'), path.join(work, 'tools', 'build.mjs'));
for (const f of ['package.json', 'package-lock.json']) cpSync(path.join(root, f), path.join(work, f));
// 'junction' lets this work on Windows without administrator rights.
symlinkSync(path.join(root, 'node_modules'), path.join(work, 'node_modules'), 'junction');

let out;
try {
  out = execFileSync(process.execPath, ['tools/build.mjs', '--prod'], { cwd: work, encoding: 'utf8' });
} catch (e) {
  fail('legacy build crashed:\n' + (e.stderr || e.message));
}
console.log('check-legacy: ' + out.trim());

const stripTime = (s) => s.replace(/"builtAt":"[^"]*"/, '"builtAt":"X"');
const rebuilt = stripTime(readFileSync(path.join(work, 'dist', 'orvalis.html'), 'utf8'));
const delivered = stripTime(readFileSync(path.join(root, 'dist', 'orvalis.html'), 'utf8'));
const hash = (s) => /"sourceHash":"([0-9a-f]+)"/.exec(s)?.[1];
if (rebuilt !== delivered) {
  let k = 0;
  while (k < rebuilt.length && rebuilt[k] === delivered[k]) k++;
  fail(
    `rebuilt page differs from dist/orvalis.html at char ${k}\n` +
      `  delivered sourceHash ${hash(delivered)}\n  rebuilt   sourceHash ${hash(rebuilt)}\n` +
      '  If the legacy sources were changed on purpose, rebuild dist with `npm run build:prod` in the root folder.',
  );
}
console.log(`check-legacy: PASS — rebuild is byte-identical to dist/orvalis.html (${rebuilt.length} chars, sourceHash ${hash(rebuilt)?.slice(0, 12)}…)`);
