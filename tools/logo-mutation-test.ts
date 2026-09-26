/**
 * Mutation test for the brand-logo suite.
 *
 * The showcase placeholder logo (showcase/assets/mdpp-logo.svg) shipped broken
 * twice over, in two unrelated files, and every one of the obvious checks
 * passed while it did: the recolour tests were all single-tone fixtures, and
 * nothing measured the artwork at all. So the assertions in
 * tests/logo-processor.test.ts get the same treatment as the geometry suites —
 * each mutation reintroduces one half of the original defect, in the asset or
 * in the renderer rather than in the assertions, and the suite has to notice.
 *
 * A mutation that survives means the corresponding assertion is vacuous.
 * A mutation that does not compile tells us nothing and is reported as SKIP.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const SUITE = 'tests/logo-processor';

interface Mutation {
  name: string;
  file: string;
  find: RegExp;
  mutate: (m: string) => string;
}

const MUTATIONS: Mutation[] = [
  {
    name: 'asset: text back to font-size 24 (overflows the rect)',
    file: 'showcase/assets/mdpp-logo.svg',
    find: /font-size="[\d.]+"/,
    mutate: () => 'font-size="24"',
  },
  {
    name: 'asset: baseline back to y=43 (sits low in the rect)',
    file: 'showcase/assets/mdpp-logo.svg',
    find: /<text[^>]*\sy="[\d.]+"/,
    mutate: m => m.replace(/y="[\d.]+"/, 'y="43"'),
  },
  {
    name: 'compile: restore the per-element snap (invisible text)',
    file: 'src/renderer/logo.ts',
    find: /if \(l > MID_LO && l < MID_HI\) return l;[\s\S]*?return l >= MID_HI \? KNOCKOUT_L : SHADOW_L;/,
    // `void` keeps the constants referenced so this still compiles — otherwise
    // it would be reported as a SKIP and prove nothing.
    mutate: () =>
      'void MID_LO; void MID_HI; void KNOCKOUT_L; void SHADOW_L; void multiTone;\n      return (l > 15 && l < 85) ? l : targetL;',
  },
  {
    name: 'compile: knockout collapses onto the accent',
    file: 'src/renderer/logo.ts',
    find: /return l >= MID_HI \? KNOCKOUT_L : SHADOW_L;/,
    mutate: () => 'void KNOCKOUT_L; void SHADOW_L; return targetL;',
  },
  {
    name: 'compile: near-black shadow no longer pushed',
    file: 'src/renderer/logo.ts',
    find: /return l >= MID_HI \? KNOCKOUT_L : SHADOW_L;/,
    mutate: () => 'void SHADOW_L; return l >= MID_HI ? KNOCKOUT_L : l;',
  },
  {
    name: 'runtime: restore the per-element snap (accent drag re-collides)',
    file: 'templates/app/01-core.js',
    find: /if \(l > LOGO_MID_LO && l < LOGO_MID_HI\) return l;[\s\S]*?return l >= LOGO_MID_HI \? LOGO_KNOCKOUT_L : LOGO_SHADOW_L;/,
    mutate: () =>
      'void LOGO_MID_LO; void LOGO_MID_HI; void LOGO_KNOCKOUT_L; void LOGO_SHADOW_L; void tones;\n  return (l > 15 && l < 85) ? l : targetL;',
  },
  {
    name: 'runtime: multiTone gate dropped (single-tone logos stop snapping)',
    file: 'templates/app/01-core.js',
    find: /if \(new Set\(tones\)\.size <= 1\) return targetL;/,
    mutate: () => 'if (false) return targetL;',
  },
  {
    name: 'runtime: knockout collapses onto the accent',
    file: 'templates/app/01-core.js',
    find: /return l >= LOGO_MID_HI \? LOGO_KNOCKOUT_L : LOGO_SHADOW_L;/,
    mutate: () => 'void LOGO_KNOCKOUT_L; void LOGO_SHADOW_L; return targetL;',
  },
];

const backups = new Map<string, string>();

function runJest(): { caught: boolean; summary: string; compileError: boolean } {
  const res = spawnSync(
    'node',
    ['--experimental-vm-modules', 'node_modules/jest/bin/jest.js', `--testPathPattern=${SUITE}`],
    { encoding: 'utf8', cwd: ROOT }
  );
  const out = `${res.stdout ?? ''}${res.stderr ?? ''}`;
  // A type error means the mutation did not compile, which tells us nothing
  // about whether the assertion works.
  const compileError = /error TS\d+/.test(out);
  const failedMatch = /Tests:.*?\b(\d+) failed/.exec(out);
  const summary = /Tests:.*/.exec(out)?.[0]?.trim() ?? '(no summary)';
  return { caught: !!failedMatch && Number(failedMatch[1]) > 0, summary, compileError };
}

let failed = 0;
try {
  for (const { name, file, find, mutate } of MUTATIONS) {
    const abs = path.join(ROOT, file);
    if (!backups.has(abs)) backups.set(abs, fs.readFileSync(abs, 'utf8'));

    const original = backups.get(abs)!;
    const m = find.exec(original);
    if (!m) {
      console.log(`SKIP   ${name}: anchor not found in ${file}`);
      failed++;
      continue;
    }
    const replacement = mutate(m[0]);
    if (replacement === m[0]) {
      console.log(`SKIP   ${name}: mutation was a no-op`);
      failed++;
      continue;
    }
    fs.writeFileSync(
      abs,
      original.slice(0, m.index) + replacement + original.slice(m.index + m[0].length),
      'utf8'
    );

    let result: ReturnType<typeof runJest>;
    try {
      result = runJest();
    } finally {
      fs.writeFileSync(abs, original, 'utf8');
    }

    if (result.compileError) {
      console.log(`SKIP   ${name}: mutation did not compile — assertion untested`);
      failed++;
      continue;
    }
    const verdict = result.caught ? 'CAUGHT' : 'MISSED';
    console.log(`${verdict}  ${name.padEnd(58)} ${result.summary}`);
    if (!result.caught) failed++;
  }
} finally {
  for (const [abs, content] of backups) fs.writeFileSync(abs, content, 'utf8');
}

console.log(`\n${MUTATIONS.length - failed}/${MUTATIONS.length} mutations caught`);
if (backups.size) console.log(`restored ${backups.size} file(s) from backup`);
process.exit(failed ? 1 : 0);
