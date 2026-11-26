import { build } from 'esbuild';
import fs from 'node:fs';

if (!fs.existsSync('SPEC.md')) throw new Error('SPEC.md is required for build');
if (!fs.existsSync('DSL.md')) throw new Error('DSL.md is required for build');
const specContent = fs.readFileSync('SPEC.md', 'utf8');
const dslContent = fs.readFileSync('DSL.md', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

await build({
  entryPoints: ['src/cli.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'dist/cli.cjs',
  define: {
    '__SPEC_CONTENT__': JSON.stringify(specContent),
    '__DSL_CONTENT__': JSON.stringify(dslContent),
    '__VERSION__': JSON.stringify(pkg.version),
  },
  external: ['node:fs', 'node:path', 'node:os', 'esbuild'],
});
