import { createMarkdownParser } from '../src/parser/markdown.js';
import { compile } from '../src/compile.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const render = (src: string) => createMarkdownParser().render(src);

describe('LaTeX / KaTeX math rendering', () => {
  describe('Inline Math ($...$)', () => {
    test('renders single-variable inline math like ($P$) and ($Sigma$)', () => {
      const html = render('Preconditions ($P$): The irreducible substrate.');
      expect(html).toContain('class="katex"');
      expect(html).toContain('math');
      expect(html).toContain('P');
    });

    test('renders complex inline formulas with symbols and arrows', () => {
      const html = render('Transition Function ($T : \\Sigma \\times \\text{Inputs} \\rightarrow \\Sigma$)');
      expect(html).toContain('class="katex"');
      expect(html).toContain('Inputs');
    });

    test('renders congruence and sub-indexes as in CPD specification', () => {
      const html = render('congruence ($\\operatorname{Action}_{C_1}(A) \\cong \\operatorname{Action}_{C_2}(A)$) among covenants.');
      expect(html).toContain('class="katex"');
      expect(html).toContain('Action');
    });

    test('does not parse $ with leading whitespace as math', () => {
      const html = render('This is $ not math $ at all.');
      expect(html).not.toContain('class="katex"');
      expect(html).toContain('$ not math $');
    });

    test('does not parse currency as math', () => {
      const html = render('Items cost $10 and $20 each.');
      expect(html).not.toContain('class="katex"');
      expect(html).toContain('$10');
      expect(html).toContain('$20');
    });

    test('handles backslash escaped dollar \\$', () => {
      const html = render('Escaped \\$50 and \\$100 should remain dollars.');
      expect(html).not.toContain('class="katex"');
      expect(html).toContain('$50');
      expect(html).toContain('$100');
    });
  });

  describe('Display Math ($$...$$)', () => {
    test('renders inline display math $$...$$', () => {
      const html = render('$$\\operatorname{CPD} = \\langle P, \\Sigma, T, I, E, Y, \\Omega \\rangle$$');
      expect(html).toContain('class="katex-display"');
      expect(html).toContain('CPD');
      expect(html).toContain('⟨');
      expect(html).toContain('Ω');
    });

    test('renders multi-line block display math $$ ... $$', () => {
      const input = [
        '$$',
        '\\text{Covenant} \\rightarrow \\text{Transmission} \\rightarrow \\text{Reconstruction}',
        '$$',
      ].join('\n');
      const html = render(input);
      expect(html).toContain('class="katex-display"');
      expect(html).toContain('Covenant');
      expect(html).toContain('Transmission');
    });

    test('handles CPD screenshot exact snippet without errors', () => {
      const snippet = `
7d.1 — Transmission versus Operational Architecture GMRTI governs the refinement, reconstruction, and transmission of semantic objects across covenant difference. Where GMRTI establishes a functional comosí, CPD specifies what that comosí permits, prohibits, executes, and terminates within a declared operational domain: $$\\text{Covenant} \\rightarrow \\text{Transmission} \\rightarrow \\text{Reconstruction} \\rightarrow \\text{Specification (CPD)} \\rightarrow \\text{Runtime / Yield} \\rightarrow \\text{Termination}$$ CPD does not equate operational consequences with metaphysical truth. Rather, it evaluates an abstraction's specification by its capacity to produce semantic covenant convergence and operational congruence ($\\operatorname{Action}_{C_1}(A) \\cong \\operatorname{Action}_{C_2}(A)$) among participating covenants.

7d.2 — The 7-Tuple Specification Architecture A complete CPD operationalizes an abstraction through seven irreducible structural components: $$\\operatorname{CPD} = \\langle P, \\Sigma, T, I, E, Y, \\Omega \\rangle$$

- Preconditions ($P$): The irreducible environmental, institutional, and semantic substrate required before instantiation can occur.
- State Space ($\\Sigma$): The differentiated set of operational states through which the instantiated abstraction passes.
- Transition Function ($T$): The permitted input-driven state transitions ($T : \\Sigma \\times \\text{Inputs} \\rightarrow \\Sigma$), constitutive of operational chronology.
- Invariants ($I$): Conditions that mechanically hold throughout execution, not dependent on agent goodwill.
- Enforcement Architecture ($E$): The domain mechanism that gives the abstraction operational force independently of momentary authorial preference.
- Yield ($Y$): The concrete material or institutional consequences produced by successful execution.
- Terminal Condition ($\\Omega$): The explicit boundary condition under which the instantiated abstraction terminates.
      `;
      const html = render(snippet);
      expect(html).toContain('class="katex-display"');
      expect(html).toContain('class="katex"');
      expect(html).not.toContain('$$\\operatorname{CPD}');
      expect(html).not.toContain('($P$)');
      expect(html).not.toContain('($\\Sigma$)');
    });
  });

  describe('End-to-End Compilation with KaTeX Styles', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdd-math-test-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    function baseOpts(inputFile: string, outputFile: string) {
      return {
        inputFile,
        outputPath: outputFile,
        outputMode: 'single' as const,
        assetsDir: path.join(path.dirname(inputFile), 'assets'),
        title: 'Math Test',
        accent: '#3b82f6',
        noDiagrams: false,
        noTables: false,
        verbose: false,
      };
    }

    test('single-mode compilation inlines KaTeX styles and renders math', () => {
      const inputFile = path.join(tmpDir, 'test.mdd');
      const outputFile = path.join(tmpDir, 'test.html');
      fs.writeFileSync(inputFile, [
        '---',
        'title: Math Test',
        '---',
        '# Math Section',
        '',
        'Formula: $E = mc^2$',
        '',
        '$$\\int_0^\\infty e^{-x} dx = 1$$',
      ].join('\n'));

      const result = compile({
        ...baseOpts(inputFile, outputFile),
        minify: true,
      });

      expect(result.html).toContain('class="katex"');
      expect(result.html).toContain('class="katex-display"');
      expect(result.html).toContain('.katex');
    });

    test('headings containing math symbols produce clean slugs and TOC links', () => {
      const inputFile = path.join(tmpDir, 'test-slug.mdd');
      const outputFile = path.join(tmpDir, 'test-slug.html');
      fs.writeFileSync(inputFile, [
        '---',
        'title: Slug Math',
        '---',
        '# Section on $T$ Transition Function',
        '',
        'Text here.',
      ].join('\n'));

      const result = compile(baseOpts(inputFile, outputFile));

      expect(result.stats?.sections).toBe(1);
      expect(result.html).toContain('id="section-on-t-transition-function"');
    });
  });
});
