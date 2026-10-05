// Runs the legacy game's scenarios (../tests/*.mjs) through its own harness
// (../tools/play.mjs) against the delivered build, ONE AT A TIME, and compares
// the outcome with the recorded baseline (../docs/legacy-baseline/summary.json).
//
//   npm run legacy:scenarios              all scenarios (about one hour in software rendering)
//   npm run legacy:scenarios -- qa1 i3    only these
//
// A scenario PASSES when the harness exits with code 0: no page error and no
// exception in the scenario. Most scenarios print values without asserting
// them, so their logs are kept for comparison.
// Exit code 1 when a scenario that passes in the baseline now fails.
// Run serially on purpose: four in parallel made 24 of 42 time out (measured).
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const shim = pathToFileURL(path.join(here, 'playwright-shim.mjs')).href;
const outDir = process.env.LEGACY_OUT || path.join(tmpdir(), 'orvalis-legacy-scenarios');
const baselineFile = path.join(root, 'docs', 'legacy-baseline', 'summary.json');
const TIMEOUT_MS = 600_000;

const wanted = process.argv.slice(2).map((n) => n.replace(/\.mjs$/, ''));
const all = readdirSync(path.join(root, 'tests')).filter((f) => f.endsWith('.mjs')).sort();
const tests = wanted.length ? all.filter((f) => wanted.includes(f.replace(/\.mjs$/, ''))) : all;
const unknown = wanted.filter((n) => !all.includes(`${n}.mjs`));
if (unknown.length) {
  console.error(`legacy:scenarios: unknown scenario(s): ${unknown.join(', ')}`);
  process.exit(1);
}
mkdirSync(path.join(outDir, 'logs'), { recursive: true });
mkdirSync(path.join(outDir, 'shots'), { recursive: true });

const baseline = existsSync(baselineFile) ? Object.fromEntries(JSON.parse(readFileSync(baselineFile, 'utf8')).scenarios.map((s) => [s.scenario, s])) : {};
const rows = [];
let regressions = 0;
for (const t of tests) {
  const logFile = path.join(outDir, 'logs', `${t}.log`);
  const started = Date.now();
  const { code, timedOut } = await new Promise((resolve) => {
    const out = createWriteStream(logFile);
    const p = spawn(process.execPath, ['tools/play.mjs', `tests/${t}`, '1300', '800'], {
      cwd: root,
      env: { ...process.env, PLAYWRIGHT: shim, SHOTS: path.join(outDir, 'shots') + path.sep },
    });
    p.stdout.pipe(out);
    p.stderr.pipe(out);
    let killed = false;
    const timer = setTimeout(() => { killed = true; p.kill('SIGKILL'); }, TIMEOUT_MS);
    p.on('close', (c) => { clearTimeout(timer); resolve({ code: c, timedOut: killed }); });
  });
  const log = readFileSync(logFile, 'utf8');
  const result = code === 0 && !timedOut ? 'PASS' : 'FAIL';
  const was = baseline[t]?.result;
  const verdict = !was ? 'no baseline' : was === result ? 'same as baseline' : result === 'FAIL' ? 'REGRESSION' : 'now passes (baseline: FAIL)';
  if (verdict === 'REGRESSION') regressions++;
  rows.push({ scenario: t, result, seconds: Math.round((Date.now() - started) / 1000), pageErrors: (log.match(/pageerror:/g) ?? []).length, consoleErrors: /^ERRORS:/m.test(log) });
  console.log(`${t.padEnd(20)} ${result}  ${String(rows.at(-1).seconds).padStart(4)} s  ${verdict}`);
}
writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify({ scenarios: rows }, null, 1));
console.log(`legacy:scenarios: ${rows.filter((r) => r.result === 'PASS').length} PASS, ${rows.filter((r) => r.result === 'FAIL').length} FAIL, ${regressions} regression(s) vs baseline — logs in ${outDir}`);
process.exit(regressions ? 1 : 0);
