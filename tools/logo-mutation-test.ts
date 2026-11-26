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
import { runMutationSuite } from './lib/mutation-runner.js';

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

process.exit(runMutationSuite(ROOT, MUTATIONS.map(m => ({ ...m, suites: SUITE })), 58));
