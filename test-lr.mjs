import {diagramParse, diagramLayout, diagramBuildSvg} from './src/renderer/diagram-svg.js';

const m = diagramParse('flowchart\n  A[Start] --> B[Process]\n  B --> C[End]');
diagramLayout(m);
const tb = diagramBuildSvg(m, 'T', false);
const lr = diagramBuildSvg(m, 'T', true);

function extract(s) {
  const vb = s.match(/viewBox="([^"]+)"/)?.[1];
  const paths = [...s.matchAll(/d="([^"]+)"/g)].map(p => p[1]);
  return {vb, paths};
}

console.log('TB:', JSON.stringify(extract(tb), null, 2));
console.log('LR:', JSON.stringify(extract(lr), null, 2));

// Check: LR viewBox width should be > height (horizontal layout)
const [, , tbW, tbH] = extract(tb).vb.split(' ').map(Number);
const [, , lrW, lrH] = extract(lr).vb.split(' ').map(Number);
console.log(`TB: ${tbW}x${tbH} (should be tall)`);
console.log(`LR: ${lrW}x${lrH} (should be wide)`);
console.log(`LR width > height: ${lrW > lrH ? 'PASS' : 'FAIL'}`);
