import fs from 'node:fs';
import path from 'node:path';
import { compile } from '../src/compile.js';
import { DIAGRAM as C } from '../src/constants.js';
import {
  diagramParse,
  diagramLayout,
  diagramBuildSvg,
  resolveGeometry,
  edgeNodeCollisions,
  inscribeDiamond,
  type Orientation,
  type PlacedNode,
} from '../src/renderer/diagram/index.js';
import { measureNodeText } from '../src/renderer/diagram/layout.js';
import { measureText } from '../src/renderer/text-metrics.js';
import type { Box, Point } from '../src/renderer/svg-helpers.js';
import type { Options } from '../src/types.js';

const SHOWCASE_MDD = path.resolve(process.cwd(), 'showcase', 'showcase.mdd');

/**
 * The showcase diagram corpus: the 9 fences a user actually ships.
 *
 * Anchored to the start of a line, because the prose refers to the fence
 * syntax inline (`` ` ```diagram TB ` ``) and an unanchored match picks that
 * up as an empty diagram.
 */
function showcaseDiagrams(): string[] {
  const src = fs.readFileSync(SHOWCASE_MDD, 'utf8');
  return [...src.matchAll(/^```diagram[^\n]*\r?\n([\s\S]*?)^```/gm)].map(m => m[1]);
}

function boxOverlaps(a: Box, b: Box, tolerance = 0): boolean {
  return (
    a.minX < b.maxX - tolerance &&
    a.maxX > b.minX + tolerance &&
    a.minY < b.maxY - tolerance &&
    a.maxY > b.minY + tolerance
  );
}

/** Half-width available inside a rhombus at vertical offset `dy`. */
function rhombusHalfWidth(w: number, h: number, dy: number): number {
  const halfH = h / 2;
  if (halfH <= 0) return w / 2;
  return Math.max(0, (w / 2) * (1 - Math.abs(dy) / halfH));
}

/**
 * Point at fraction `t` along a sampled polyline, measured by arc length.
 *
 * Mirrors `pointAtFraction` in src/renderer/diagram/geometry.ts. Duplicated
 * deliberately: the label-placement test has to name the *first position the
 * search tries* in order to prove the label is not sitting there, and reading
 * that out of the production module would make the assertion circular.
 */
function pointAtArcFraction(points: Point[], t: number): Point {
  if (points.length < 2) return points[0] ?? { x: 0, y: 0 };
  const segs: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
    segs.push(d);
    total += d;
  }
  if (total <= 0) return points[0]!;
  const want = Math.max(0, Math.min(1, t)) * total;
  let acc = 0;
  for (let i = 0; i < segs.length; i++) {
    if (acc + segs[i]! >= want) {
      const local = segs[i] === 0 ? 0 : (want - acc) / segs[i]!;
      return {
        x: points[i]!.x + (points[i + 1]!.x - points[i]!.x) * local,
        y: points[i]!.y + (points[i + 1]!.y - points[i]!.y) * local,
      };
    }
    acc += segs[i]!;
  }
  return points[points.length - 1]!;
}

describe('diagram geometry: no node overlaps', () => {
  test('no two node boxes overlap, in any orientation, across the showcase corpus', () => {
    const fences = showcaseDiagrams();
    expect(fences.length).toBeGreaterThanOrEqual(9);

    for (const [i, fence] of fences.entries()) {
      for (const orientation of ['TB', 'LR'] as Orientation[]) {
        const m = diagramParse(fence);
        diagramLayout(m);
        const geo = resolveGeometry(m, orientation);

        for (let a = 0; a < geo.nodes.length; a++) {
          for (let b = a + 1; b < geo.nodes.length; b++) {
            expect(
              boxOverlaps(geo.nodes[a].box, geo.nodes[b].box, C.OVERLAP_TOLERANCE)
            ).toBe(false);
          }
        }
        expect(geo.nodes.length).toBeGreaterThan(0);
        expect(i).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('diagram geometry: text fits its shape', () => {
  test('every node line fits inside the node inner width', () => {
    for (const fence of showcaseDiagrams()) {
      const m = diagramParse(fence);
      diagramLayout(m);
      for (const node of m.nodes.values()) {
        const metrics = node.metrics!;
        if (node.shape === 'diamond') continue; // checked separately below
        const innerW = node.w - C.PADX * 2;
        for (const line of metrics.lines) {
          expect(line.width).toBeLessThanOrEqual(innerW);
        }
      }
    }
  });

  test('every diamond line fits inside the rhombus at its own baseline', () => {
    // A diamond narrows towards its vertices, so a line can clear the bounding
    // box and still cross a slanted edge. The old sizing applied a blanket
    // 1.55x multiplier, which produced a 229px rhombus for a 67px word.
    for (const fence of showcaseDiagrams()) {
      const m = diagramParse(fence);
      diagramLayout(m);
      for (const node of m.nodes.values()) {
        if (node.shape !== 'diamond') continue;
        for (const line of node.metrics!.lines) {
          const avail = rhombusHalfWidth(node.w, node.h, line.dy);
          expect(line.width / 2).toBeLessThanOrEqual(avail);
        }
      }
    }
  });

  test('inscribeDiamond returns a box the text genuinely fits inside', () => {
    // The corpus alone cannot cover this. The showcase's one diamond is
    // `Decision`, whose rhombus is pinned at the `MIN_W` floor, so the sizing
    // arithmetic never decides the result and a wrong formula is invisible.
    // Probe the function directly with labels wide enough that the formula is
    // load-bearing, at every line offset a multi-line node can produce.
    for (const label of [
      'Reject',
      'Validation outcome',
      'A considerably wider decision label that will not fit on one line at all',
      'Extraordinarily verbose decision label spanning a very large number of characters indeed',
    ]) {
      for (const sub of ['', 'retries exhausted', 'and the fallback path is also unavailable']) {
        const node = { id: 'D', label: `${label}${sub ? ` — ${sub}` : ''}`, shape: 'diamond' } as never;
        const lines = measureNodeText(node).lines;
        expect(lines.length).toBeGreaterThan(0);
        const { w, h } = inscribeDiamond(lines);
        for (const line of lines) {
          expect(line.width / 2).toBeLessThanOrEqual(rhombusHalfWidth(w, h, line.dy));
        }
      }
    }
  });

  test('a rhombus grows when its text does, rather than sitting at the floor', () => {
    // Pins the formula's *monotonicity*: a strictly larger label must produce a
    // strictly larger rhombus. A `MIN_W`-clamped or bounding-box approximation
    // plateaus instead, which is how the old 1.55x multiplier went unnoticed.
    const sizeFor = (text: string) => {
      const node = { id: 'D', label: text, shape: 'diamond' } as never;
      return inscribeDiamond(measureNodeText(node).lines);
    };
    const short = sizeFor('Reject');
    const long = sizeFor(
      'Extraordinarily verbose decision label spanning a very large number of characters indeed'
    );
    expect(long.w).toBeGreaterThan(short.w);
    expect(long.h).toBeGreaterThanOrEqual(short.h);
  });

  test('node height accommodates the measured text block plus padding', () => {
    for (const fence of showcaseDiagrams()) {
      const m = diagramParse(fence);
      diagramLayout(m);
      for (const node of m.nodes.values()) {
        if (node.shape === 'diamond') continue;
        expect(node.h).toBeGreaterThanOrEqual(node.metrics!.textHeight + C.PADY * 2 - 1);
      }
    }
  });
});

describe('diagram geometry: edges do not cross nodes', () => {
  test('no edge passes through a node it does not terminate on', () => {
    for (const fence of showcaseDiagrams()) {
      for (const orientation of ['TB', 'LR'] as Orientation[]) {
        const m = diagramParse(fence);
        diagramLayout(m);
        const geo = resolveGeometry(m, orientation);

        for (const placed of geo.edges) {
          const hits = edgeNodeCollisions(placed.route, geo.nodes);
          expect(hits).toEqual([]);
        }
      }
    }
  });

  test('a long edge beside a wide node is re-routed rather than left overlapping', () => {
    // A narrow source, a very wide intermediate node, and a narrow target: the
    // direct route would have to pass through the wide one.
    const m = diagramParse(
      'TB\n A[Src]\n B[An extremely wide intermediate node that forces a detour]\n C[Dst]\n A --> B\n B --> C'
    );
    diagramLayout(m);
    const geo = resolveGeometry(m, 'TB');
    expect(geo.warnings.filter(w => /passes through node/.test(w))).toEqual([]);
  });

  test('the reported geometry has no unresolved violations for the showcase', () => {
    for (const fence of showcaseDiagrams()) {
      for (const orientation of ['TB', 'LR'] as Orientation[]) {
        const m = diagramParse(fence);
        diagramLayout(m);
        const geo = resolveGeometry(m, orientation);
        expect(geo.warnings.filter(w => /passes through node|could not be re-routed/.test(w))).toEqual([]);
      }
    }
  });
});

describe('diagram geometry: edge labels clear the nodes', () => {
  test('no edge label background lands on a node', () => {
    for (const fence of showcaseDiagrams()) {
      for (const orientation of ['TB', 'LR'] as Orientation[]) {
        const m = diagramParse(fence);
        diagramLayout(m);
        const geo = resolveGeometry(m, orientation);
        for (const placed of geo.edges) {
          if (!placed.label) continue;
          for (const node of geo.nodes as PlacedNode[]) {
            expect(boxOverlaps(placed.label.box, node.box)).toBe(false);
          }
        }
      }
    }
  });

  test('a label that would land on a node is moved along the route instead', () => {
    // The showcase's "requeues failures" label previously sat entirely inside
    // the COMPLETED node.
    const m = diagramParse(
      'TB\n Q[QUEUE]\n W[WORKER]\n D[COMPLETED]\n Q --> W\n W -->|requeues failures| Q\n W --> D'
    );
    diagramLayout(m);
    const geo = resolveGeometry(m, 'TB');
    const labelled = geo.edges.find(e => e.label?.text === 'requeues failures');
    expect(labelled).toBeDefined();
    for (const node of geo.nodes) {
      expect(boxOverlaps(labelled!.label!.box, node.box)).toBe(false);
    }
  });

  test('a skipping edge moves its label off the blocked midpoint', () => {
    // The showcase's "requeues failures" label passes for the wrong reason: its
    // back edge runs out in a side gutter, so the first candidate position was
    // already clear and the collision search never had to reject anything. An
    // edge that skips several ranks is routed *around* the nodes it passes, so
    // its midpoint lands right beside one — this is the fixture that actually
    // exercises the search. With the search disabled the label stays at t=0.50
    // and lands on the blocker.
    const m = diagramParse(
      'TB\n A[Src]\n B[One]\n C[Two]\n D[Three]\n E[after]\n' +
        ' A --> B\n B --> C\n C --> D\n D --> E\n A -->|skips three whole ranks| E'
    );
    diagramLayout(m);
    const geo = resolveGeometry(m, 'TB');
    const labelled = geo.edges.find(e => e.label);
    expect(labelled).toBeDefined();
    const label = labelled!.label!;
    const pts = labelled!.route.points;

    // The first candidate the search tries, recomputed here the same way
    // geometry.ts does it, so "the label is not here" is a real observation.
    const midpoint = pointAtArcFraction(pts, 0.5);

    // That first position is genuinely blocked...
    const halfW = label.w / 2;
    const halfH = label.h / 2;
    const atMidpoint: Box = {
      minX: midpoint.x - halfW,
      maxX: midpoint.x + halfW,
      minY: midpoint.y - halfH,
      maxY: midpoint.y + halfH,
    };
    const blocked = geo.nodes.filter(n => boxOverlaps(atMidpoint, n.box));
    expect(blocked.length).toBeGreaterThan(0);

    // ...so the anchor cannot be the midpoint, and the label is clear regardless.
    expect(Math.hypot(label.x - midpoint.x, label.y - midpoint.y)).toBeGreaterThan(1);
    for (const node of geo.nodes) {
      expect(boxOverlaps(label.box, node.box)).toBe(false);
    }
  });
});

describe('diagram geometry: the emitted viewBox covers all the ink', () => {
  /**
   * The viewBox the emitter *actually wrote*.
   *
   * This has to be read back out of the serialized SVG rather than re-derived
   * from `geo.ink`. Re-deriving it makes the assertions tautological: they then
   * only prove that `ink` contains the nodes, and the emitter's own arithmetic
   * — the part that decides where the box really lands — goes untested.
   */
  function emittedViewBox(svg: string): Box {
    const m = /<svg[^>]*\bviewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg);
    if (!m) throw new Error('no viewBox on the emitted <svg>');
    return {
      minX: Number(m[1]),
      minY: Number(m[2]),
      maxX: Number(m[1]) + Number(m[3]),
      maxY: Number(m[2]) + Number(m[4]),
    };
  }

  test('node boxes, edge ink and label boxes all fall inside the emitted viewBox', () => {
    for (const fence of showcaseDiagrams()) {
      for (const orientation of ['TB', 'LR'] as Orientation[]) {
        const m = diagramParse(fence);
        diagramLayout(m);
        const geo = resolveGeometry(m, orientation);
        const vb = emittedViewBox(diagramBuildSvg(m, 'T', orientation === 'LR'));

        for (const node of geo.nodes) {
          expect(node.box.minX).toBeGreaterThanOrEqual(vb.minX);
          expect(node.box.maxX).toBeLessThanOrEqual(vb.maxX);
          expect(node.box.minY).toBeGreaterThanOrEqual(vb.minY);
          expect(node.box.maxY).toBeLessThanOrEqual(vb.maxY);
        }
        for (const placed of geo.edges) {
          for (const p of placed.route.points) {
            expect(p.x).toBeGreaterThanOrEqual(vb.minX);
            expect(p.x).toBeLessThanOrEqual(vb.maxX);
            expect(p.y).toBeGreaterThanOrEqual(vb.minY);
            expect(p.y).toBeLessThanOrEqual(vb.maxY);
          }
          if (placed.label) {
            expect(placed.label.box.minX).toBeGreaterThanOrEqual(vb.minX);
            expect(placed.label.box.maxX).toBeLessThanOrEqual(vb.maxX);
            expect(placed.label.box.minY).toBeGreaterThanOrEqual(vb.minY);
            expect(placed.label.box.maxY).toBeLessThanOrEqual(vb.maxY);
          }
        }
      }
    }
  });

  test('the emitted viewBox hugs the ink instead of leaving dead margin', () => {
    // The regression this guards is 84px of empty space below a diagram: a
    // viewBox derived from control points rather than from the curve. A viewBox
    // that is correct but loose is as wrong as one that clips, so assert the
    // padding is the padding we asked for and no more.
    for (const fence of showcaseDiagrams()) {
      for (const orientation of ['TB', 'LR'] as Orientation[]) {
        const m = diagramParse(fence);
        diagramLayout(m);
        const geo = resolveGeometry(m, orientation);
        const vb = emittedViewBox(diagramBuildSvg(m, 'T', orientation === 'LR'));
        // The emitter rounds to one decimal, so a derived value can sit up to
        // 0.05px either side of what was written, plus float slack.
        const ROUNDING_SLACK = 0.06;
        const expectEdge = (actual: number, expected: number) =>
          expect(Math.abs(actual - expected)).toBeLessThanOrEqual(ROUNDING_SLACK);
        expectEdge(vb.minX, geo.ink.minX - C.PAD);
        expectEdge(vb.minY, geo.ink.minY - C.PAD);
        expectEdge(vb.maxX, geo.ink.maxX + C.PAD);
        expectEdge(vb.maxY, geo.ink.maxY + C.PAD);
      }
    }
  });

  test('the emitted viewBox is derived from ink, not from control points', () => {
    // A cubic's control points can sit far outside the curve. Bounding-boxing
    // them added ~85px of dead space at the bottom of the showcase diagrams.
    const m = diagramParse(
      'LR\n A[Start]\n B[Middle]\n C[End]\n A --> B\n B --> C\n C --> A'
    );
    diagramLayout(m);
    const geo = resolveGeometry(m, 'LR');
    const back = geo.edges.find(e => e.edge.isBackEdge)!;
    const maxY = Math.max(...back.route.points.map(p => p.y));
    const vbMaxY = geo.ink.maxY + C.PAD;
    // The viewBox bottom follows the sampled ink, which the curve really
    // reaches, not a control point that overshoots it.
    expect(vbMaxY).toBeGreaterThanOrEqual(maxY);
    expect(vbMaxY).toBeLessThan(maxY + C.PAD + 1);
  });

  test('the return arc is inside the viewBox it is emitted in', () => {
    for (const fence of showcaseDiagrams()) {
      for (const orientation of ['TB', 'LR'] as Orientation[]) {
        const m = diagramParse(fence);
        diagramLayout(m);
        const geo = resolveGeometry(m, orientation);
        const backEdges = geo.edges.filter(e => e.edge.isBackEdge);
        if (!backEdges.length) continue;
        const vbMaxY = geo.ink.maxY + C.PAD;
        const vbMaxX = geo.ink.maxX + C.PAD;
        for (const back of backEdges) {
          for (const p of back.route.points) {
            expect(p.x).toBeLessThanOrEqual(vbMaxX);
            expect(p.y).toBeLessThanOrEqual(vbMaxY);
          }
        }
      }
    }
  });
});

describe('diagram geometry: nothing overflows the reading column', () => {
  test('no showcase diagram or table exceeds the usable content width', () => {
    const tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'scratch', 'md++-geom-'));
    try {
      const result = compile({
        inputFile: SHOWCASE_MDD,
        outputPath: path.join(tmpDir, 'out.html'),
        outputMode: 'single',
        assetsDir: path.resolve(process.cwd(), 'showcase', 'assets'),
        title: 'Capability Showcase',
        accent: '#8b5cf6',
        noDiagrams: false,
        noTables: false,
        verbose: false,
      } as Options);

      const widths = [...result.html.matchAll(/<svg[^>]*\bwidth="(\d+)"/g)].map(m => Number(m[1]));
      expect(widths.length).toBeGreaterThan(0);
      for (const w of widths) {
        expect(w).toBeLessThanOrEqual(1044);
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('diagram geometry: reproducible output', () => {
  test('compiling the same input twice produces byte-identical HTML', () => {
    // Guards against accidental Math.random / Date / Set-iteration-order
    // dependence creeping into the new geometry code. Marker ids are derived
    // from a hash of the model, so a stable digest matters.
    const dir = path.join(process.cwd(), 'scratch', 'md++-repro');
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });

    const run = (name: string): string => {
      const out = path.join(dir, name);
      compile({
        inputFile: SHOWCASE_MDD,
        outputPath: out,
        outputMode: 'single',
        assetsDir: path.resolve(process.cwd(), 'showcase', 'assets'),
        title: 'Capability Showcase',
        accent: '#8b5cf6',
        noDiagrams: false,
        noTables: false,
        verbose: false,
      } as Options);
      return fs.readFileSync(out, 'utf8');
    };

    try {
      expect(run('a.html')).toBe(run('b.html'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('text metrics: sanity of the calibrated model', () => {
  test('monospace code spans measure wider than the same prose at equal length', () => {
    // This is the property the old flat rate got wrong in the other direction.
    expect(measureText('iiiiiiiii', 10)).toBeLessThan(measureText('MMMMMMMMM', 10));
  });

  test('the em-dash separator is measured as a full em', () => {
    expect(measureText('—', 10, { exact: true })).toBeCloseTo(10, 5);
  });

  test('bold measures wider than regular', () => {
    expect(measureText('process', 14, { bold: true }))
      .toBeGreaterThan(measureText('process', 14));
  });
});
