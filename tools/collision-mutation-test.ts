/**
 * Mutation test for the geometry test suites.
 *
 * A green suite proves nothing if it cannot go red. Each mutation breaks one
 * of the defects the suites exist to catch — in the renderer, not in the
 * assertions — and the suite has to notice. A mutation that survives means the
 * corresponding assertion is vacuous.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();

interface Mutation {
  name: string;
  file: string;
  find: RegExp;
  mutate: (m: string) => string;
  suites: string;
}

const MUTATIONS: Mutation[] = [
  {
    name: 'under-measure text (R1: text overruns its box)',
    file: 'src/renderer/text-metrics.ts',
    find: /const SAFETY = [\d.]+;/,
    mutate: m => m.replace(/[\d.]+/, '0.55'),
    suites: 'tests/',
  },
  {
    name: 'viewBox shifted off the ink (R3: clipping)',
    file: 'src/renderer/diagram/svg.ts',
    find: /const vbX = round1\(ink\.minX - C\.PAD\);/,
    mutate: () => 'const vbX = round1(ink.minX + 40);',
    suites: 'tests/diagram-collision',
  },
  {
    name: 'back-edge gutter collapsed into the rank (R2)',
    file: 'src/renderer/diagram/geometry.ts',
    find: /bounds\.maxX \+ C\.GUTTER/,
    // `+ 1` still clears the widest node, so the arc stays outside. Drive the
    // gutter *inside* the node band to force a genuine crossing.
    mutate: () => 'bounds.maxX - C.GUTTER * 4',
    suites: 'tests/diagram-collision|tests/diagram-cycle',
  },
  {
    name: 'diamond ignores vertical offset (R1: text out of the rhombus)',
    file: 'src/renderer/diagram/layout.ts',
    find: /const need = line\.width \/ 2 \+ inset \+ Math\.abs\(line\.dy\) \/ aspect;/,
    mutate: () => 'const need = line.width / 2;',
    suites: 'tests/diagram-collision',
  },
  {
    name: 'diamond halved outright (R1: text out of the rhombus)',
    file: 'src/renderer/diagram/layout.ts',
    find: /const w = Math\.max\(C\.MIN_W, Math\.ceil\(halfW \* 2\)\);/,
    mutate: () => 'const w = Math.max(C.MIN_W, Math.ceil(halfW));',
    suites: 'tests/diagram-collision|tests/diagram-auto-responsive',
  },
  {
    name: 'arrowhead on undirected edges (R4)',
    file: 'src/renderer/diagram/svg.ts',
    find: /const markerAttr = edge\.directed \?/,
    mutate: () => 'const markerAttr = true ?',
    suites: 'tests/showcase',
  },
  {
    name: 'edge label placed blind at the midpoint (R2: label lands on a node)',
    file: 'src/renderer/diagram/geometry.ts',
    find: /if \(clear\) return candidate;/,
    mutate: () => 'if (clear || true) return candidate;',
    suites: 'tests/diagram-collision',
  },
  {
    name: 'download icon left unlabelled (a11y)',
    file: 'src/pipeline/copy-buttons.ts',
    find: /aria-hidden="true" focusable="false"><path d="M21 15v4/,
    mutate: () => 'focusable="false"><path d="M21 15v4',
    suites: 'tests/diagram-a11y',
  },
  {
    name: 'search icon left unlabelled (a11y)',
    file: 'templates/shell.html',
    find: /aria-hidden="true" focusable="false"><circle cx="11"/,
    mutate: () => 'focusable="false"><circle cx="11"',
    suites: 'tests/diagram-a11y',
  },
];

const backups = new Map<string, string>();

function runJest(suites: string): { caught: boolean; summary: string; compileError: boolean } {
  const res = spawnSync(
    'node',
    ['--experimental-vm-modules', 'node_modules/jest/bin/jest.js', `--testPathPattern=${suites}`],
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
  for (const { name, file, find, mutate, suites } of MUTATIONS) {
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
      result = runJest(suites);
    } finally {
      fs.writeFileSync(abs, original, 'utf8');
    }

    if (result.compileError) {
      console.log(`SKIP   ${name}: mutation did not compile — assertion untested`);
      failed++;
      continue;
    }
    const verdict = result.caught ? 'CAUGHT' : 'MISSED';
    console.log(`${verdict}  ${name.padEnd(54)} ${result.summary}`);
    if (!result.caught) failed++;
  }
} finally {
  for (const [abs, content] of backups) fs.writeFileSync(abs, content, 'utf8');
}

console.log(`\n${MUTATIONS.length - failed}/${MUTATIONS.length} mutations caught`);
if (backups.size) console.log(`restored ${backups.size} renderer file(s) from backup`);
process.exit(failed ? 1 : 0);
