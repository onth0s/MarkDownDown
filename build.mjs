import { build } from 'esbuild';
import fs from 'node:fs';

const specContent = fs.existsSync('SPEC.md') ? fs.readFileSync('SPEC.md', 'utf8') : '';
const dslContent = fs.existsSync('DSL.md') ? fs.readFileSync('DSL.md', 'utf8') : '';

await build({
  entryPoints: ['src/cli.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'dist/cli.cjs',
  define: {
    '__SPEC_CONTENT__': JSON.stringify(specContent),
    '__DSL_CONTENT__': JSON.stringify(dslContent),
  },
  external: ['node:fs', 'node:path', 'node:os', 'esbuild'],
});
