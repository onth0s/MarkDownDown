import { build } from 'esbuild';

await build({
  entryPoints: ['src/cli.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'dist/cli.cjs',
  external: ['node:fs', 'node:path', 'node:os', 'esbuild'],
});
