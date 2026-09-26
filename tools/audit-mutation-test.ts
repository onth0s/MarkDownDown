/**
 * Mutation test for tools/geometry-audit.ts.
 *
 * "0 findings" from a tool I wrote is worthless unless the tool can be shown to
 * produce findings on demand. This takes the real showcase.html, splices in each
 * of the five original root causes, and asserts the audit reports them. If a
 * mutation survives, the audit is blind to that class of defect.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const target = path.join(process.cwd(), 'scratch', 'mutant.html');

interface Mutation {
  name: string;
  what: string;
  /** Artifact the anchor lives in. Defaults to the showcase. */
  source?: string;
  /** Locate the substring to replace. */
  find: RegExp;
  /** Rewrite that substring. */
  mutate: (m: string) => string;
}

const MUTATIONS: Mutation[] = [
  {
    name: 'R1 text overflow',
    what: 'widen a node title past its own box',
    find: /<text class="node-title"[^>]*>Abstract<\/text>/,
    mutate: m => m.replace('Abstract', 'A very much longer node title that overruns its box'),
  },
  {
    name: 'R2 edge label on a node',
    what: 'move an edge label onto a node box',
    find: /<g class="edge-label" transform="translate\(235 123\)">/,
    // (101, 60) is inside the QUEUE node, which spans x 0-202, y 24-95.
    mutate: () => '<g class="edge-label" transform="translate(101 60)">',
  },
  {
    name: 'R3 viewBox clipping',
    what: 'shrink the viewBox so ink falls outside it',
    find: /viewBox="-24 0 630 313"/,
    mutate: () => 'viewBox="-2400 0 10 10"',
  },
  {
    name: 'R4 arrowhead gap',
    what: 'stop the arrow tip in mid-air short of the node',
    find: /<path class="edge-path" d="M 251\.8 75 C 251\.8 100\.2 81 105\.8 81 131"/,
    // Terminate 31px above the "Left branch" node (y 131-182), leaving the
    // arrowhead floating in the gap. Landing *on* the boundary is correct, so
    // the mutation has to clear the node entirely.
    mutate: () => '<path class="edge-path" d="M 251.8 75 C 251.8 100.2 81 105.8 81 100"',
  },
  {
    name: 'R5 column overflow',
    what: 'blow the natural width past the reading column',
    find: /<svg class="diagram-svg" viewBox="-24 0 630 313" width="630"/,
    mutate: () => '<svg class="diagram-svg" viewBox="-24 0 630 313" width="1400"',
  },
  {
    name: 'A1 diamond overlap',
    what: 'inflate a diamond node until it overlaps the rect below it',
    // Only detectable if `node-rect node-diamond` is recognised as a shape;
    // a literal class="node-rect" match skips every diamond.
    find: /<polygon class="node-rect node-diamond" points="75,24 145,67\.5 75,111 5,67\.5"\/>/,
    mutate: () => '<polygon class="node-rect node-diamond" points="75,0 190,120 75,240 -40,120"/>',
  },
  {
    name: 'A2 diamond text overflow',
    what: 'widen the text inside a diamond past the rhombus',
    find: /<text class="node-title"[^>]*>Decision<\/text>/,
    mutate: m => m.replace('Decision', 'A decision label far too wide for this rhombus'),
  },
  {
    name: 'A3 rounded node overlap',
    what: 'deflate a rounded node so it collides with its neighbour',
    find: /<rect class="node-rect node-rounded" x="0" y="294" width="150" height="71" rx="18"\/>/,
    mutate: () => '<rect class="node-rect node-rounded" x="0" y="294" width="150" height="200" rx="18"/>',
  },
  {
    name: 'A4 entity-escaped cell overflow',
    what: 'overflow a cell whose text carries an escaped angle bracket',
    source: 'index.html',
    // Guards the entity-decoding fix from over-correcting into blindness: the
    // audit must measure the *decoded* glyphs, so a genuinely too-wide cell
    // containing `&lt;path&gt;` still has to be reported.
    find: /<tspan x="26" dy="0">-o, --output &lt;path&gt;<\/tspan>/,
    mutate: () =>
      '<tspan x="26" dy="0">-o, --output &lt;path&gt; with a great deal more text than the cell can hold</tspan>',
  },
];

let failed = 0;
for (const { name, what, source, find, mutate } of MUTATIONS) {
  const from = source ?? path.join('showcase', 'showcase.html');
  const html = fs.readFileSync(path.resolve(from), 'utf8');
  const m = find.exec(html);
  if (!m) {
    console.log(`SKIP   ${name}: anchor not found in ${from} — cannot verify this check`);
    failed++;
    continue;
  }
  const replacement = mutate(m[0]);
  if (replacement === m[0]) {
    console.log(`SKIP   ${name}: mutation was a no-op — cannot verify this check`);
    failed++;
    continue;
  }
  const mutated = html.slice(0, m.index) + replacement + html.slice(m.index + m[0].length);

  // Confirm the mutation really landed, rather than trusting the splice.
  fs.writeFileSync(target, mutated, 'utf8');
  const check = fs.readFileSync(target, 'utf8');
  if (!check.includes(replacement)) {
    console.log(`SKIP   ${name}: splice did not land in the file`);
    failed++;
    continue;
  }

  // spawnSync rather than execFileSync: a non-zero exit is the *expected*
  // result here, so the call must not throw and the status has to be read
  // alongside the output that explains it.
  const res = spawnSync('node', ['node_modules/tsx/dist/cli.mjs', 'tools/geometry-audit.ts', target], {
    encoding: 'utf8',
  });
  if (res.error) {
    console.log(`SKIP   ${name}: could not run the audit — ${res.error.message}`);
    failed++;
    continue;
  }
  const code = res.status ?? 1;
  const tail = String(res.stdout ?? '').trim().split(/\r?\n/).pop() ?? '';
  const detected = code !== 0;
  console.log(`${detected ? 'DETECT ' : 'MISSED '} ${name.padEnd(22)} (${what}) -> exit ${code}, "${tail}"`);
  if (!detected) failed++;
}

fs.rmSync(target, { force: true });
console.log(`\n${MUTATIONS.length - failed}/${MUTATIONS.length} mutations detected`);
process.exit(failed ? 1 : 0);
