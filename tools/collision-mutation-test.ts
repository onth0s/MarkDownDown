/**
 * Mutation test for the geometry test suites.
 *
 * A green suite proves nothing if it cannot go red. Each mutation breaks one
 * of the defects the suites exist to catch — in the renderer, not in the
 * assertions — and the suite has to notice. A mutation that survives means the
 * corresponding assertion is vacuous.
 */
import { runMutationSuite } from './lib/mutation-runner.js';

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
    file: 'src/renderer/diagram/geometry/route.ts',
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
    file: 'src/renderer/diagram/geometry/labels.ts',
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

process.exit(runMutationSuite(ROOT, MUTATIONS, 54));
