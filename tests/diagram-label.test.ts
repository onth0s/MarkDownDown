import { diagramParse } from '../src/renderer/diagram-svg.js';

describe('node label em-dash split (Gotcha #3)', () => {
  test('" — " splits label into title + subtitle', () => {
    const n = diagramParse('flowchart TB\n A["Heat — thermal load"]').nodes.get('A')!;
    expect(n.label).toBe('Heat');
    expect(n.subtitle).toBe('thermal load');
  });

  test('no em-dash -> no subtitle', () => {
    const n = diagramParse('flowchart TB\n A["Plain node"]').nodes.get('A')!;
    expect(n.label).toBe('Plain node');
    expect(n.subtitle).toBe('');
  });

  test('escaped em-dash \\— is NOT split', () => {
    const n = diagramParse('flowchart TB\n A["Cost \\— Benefit analysis"]').nodes.get('A')!;
    expect(n.label).toBe('Cost — Benefit analysis');
    expect(n.subtitle).toBe('');
  });
});
