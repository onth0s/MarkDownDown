import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export interface CodeMutation {
  name: string;
  file: string;
  find: RegExp;
  mutate: (match: string) => string;
  suites: string;
}

export function runMutationSuite(
  rootDir: string,
  mutations: CodeMutation[],
  padWidth = 54,
): number {
  const backups = new Map<string, string>();
  let restoring = false;

  const restoreAll = () => {
    if (restoring) return;
    restoring = true;
    for (const [abs, content] of backups) {
      try {
        fs.writeFileSync(abs, content, 'utf8');
      } catch {
        // best effort
      }
    }
  };

  const onSignal = (sig: NodeJS.Signals) => {
    restoreAll();
    process.stderr.write(`\nRestored ${backups.size} file(s) after ${sig}\n`);
    process.exit(1);
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  const runJest = (suites: string): { caught: boolean; summary: string; compileError: boolean } => {
    const res = spawnSync(
      'node',
      ['--experimental-vm-modules', 'node_modules/jest/bin/jest.js', `--testPathPattern=${suites}`],
      { encoding: 'utf8', cwd: rootDir },
    );
    const out = `${res.stdout ?? ''}${res.stderr ?? ''}`;
    const compileError = /error TS\d+/.test(out);
    const failedMatch = /Tests:.*?\b(\d+) failed/.exec(out);
    const summary = /Tests:.*/.exec(out)?.[0]?.trim() ?? '(no summary)';
    return { caught: !!failedMatch && Number(failedMatch[1]) > 0, summary, compileError };
  };

  let failed = 0;
  try {
    for (const { name, file, find, mutate, suites } of mutations) {
      const abs = path.join(rootDir, file);
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
        'utf8',
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
      console.log(`${verdict}  ${name.padEnd(padWidth)} ${result.summary}`);
      if (!result.caught) failed++;
    }
  } finally {
    restoreAll();
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }

  console.log(`\n${mutations.length - failed}/${mutations.length} mutations caught`);
  if (backups.size) console.log(`restored ${backups.size} file(s) from backup`);
  return failed ? 1 : 0;
}
