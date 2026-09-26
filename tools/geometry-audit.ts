/**
 * Geometry audit for compiled diagram and table SVGs.
 *
 * Parses a compiled HTML artifact (or a .mdd source) and reports, per SVG:
 *
 *   - text lines that overflow the shape they are drawn inside
 *   - node boxes that overlap other node boxes
 *   - edges that run through a node they do not terminate on
 *   - edge labels whose background lands on a node
 *   - anything inside the viewBox that the viewBox does not actually cover
 *   - ink wider than the reading column, i.e. a permanent horizontal scrollbar
 *
 * This is a development aid. The enforced version of the same checks lives in
 * `tests/diagram-collision.test.ts`; this one is here so you can point it at an
 * arbitrary document and read the output.
 *
 * Usage:  .\node_modules\.bin\tsx.cmd tools\geometry-audit.ts showcase\showcase.html
 */
import fs from 'node:fs';
import path from 'node:path';
import { measureText } from '../src/renderer/text-metrics.js';

const USABLE_WIDTH = 1044; // --max (1080) minus the 18px padding per side

type Attrs = Record<string, string>;

function attrs(tag: string): Attrs {
  const out: Attrs = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

interface Box { minX: number; minY: number; maxX: number; maxY: number }
interface Pt { x: number; y: number }

function box(x: number, y: number, w: number, h: number): Box {
  return { minX: x, minY: y, maxX: x + w, maxY: y + h };
}

function overlaps(a: Box, b: Box, tol = 0): boolean {
  return (
    a.minX < b.maxX - tol && a.maxX > b.minX + tol &&
    a.minY < b.maxY - tol && a.maxY > b.minY + tol
  );
}

/** Parse the `d` attribute of a path into a sampled polyline. */
function samplePath(d: string, steps = 32): Pt[] {
  const tokens = d.match(/[MLCQ]|-?\d+(?:\.\d+)?/g) ?? [];
  const pts: Pt[] = [];
  let i = 0;
  let cur: Pt = { x: 0, y: 0 };
  const num = (): number => Number(tokens[i++]);

  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (cmd === 'M') {
      cur = { x: num(), y: num() };
      pts.push(cur);
    } else if (cmd === 'L') {
      cur = { x: num(), y: num() };
      pts.push(cur);
    } else if (cmd === 'C') {
      const c1 = { x: num(), y: num() };
      const c2 = { x: num(), y: num() };
      const end = { x: num(), y: num() };
      for (let s = 0; s <= steps; s++) {
        const t = s / steps, u = 1 - t;
        pts.push({
          x: u * u * u * cur.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * end.x,
          y: u * u * u * cur.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * end.y,
        });
      }
      cur = end;
    } else if (cmd === 'Q') {
      const c = { x: num(), y: num() };
      const end = { x: num(), y: num() };
      for (let s = 0; s <= steps; s++) {
        const t = s / steps, u = 1 - t;
        pts.push({
          x: u * u * cur.x + 2 * u * t * c.x + t * t * end.x,
          y: u * u * cur.y + 2 * u * t * c.y + t * t * end.y,
        });
      }
      cur = end;
    }
  }
  return pts;
}

function polylineBox(pts: Pt[]): Box {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/** Arc-length trim of a polyline, so an edge's own ports are not counted. */
function trimEnds(pts: Pt[], distance: number): Pt[] {
  if (pts.length < 2 || distance <= 0) return pts;
  const segs: number[] = [];
  let total = 0;
  for (let k = 1; k < pts.length; k++) {
    const d = Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
    segs.push(d);
    total += d;
  }
  if (total <= 0) return pts;
  const target = Math.min(distance, total / 2);
  const out: Pt[] = [];
  let acc = 0;
  for (let k = 1; k < pts.length; k++) {
    const d = segs[k - 1];
    const from = acc;
    acc += d;
    const a = Math.max(target - from, 0);
    const b = Math.min(target - from + d, total - target) - target;
    if (b <= a || d === 0) continue;
    out.push({
      x: pts[k - 1].x + (pts[k].x - pts[k - 1].x) * (a / d),
      y: pts[k - 1].y + (pts[k].y - pts[k - 1].y) * (a / d),
    });
    out.push({
      x: pts[k - 1].x + (pts[k].x - pts[k - 1].x) * (b / d),
      y: pts[k - 1].y + (pts[k].y - pts[k - 1].y) * (b / d),
    });
  }
  return out;
}

interface Finding { kind: string; detail: string }

/**
 * Decode the XML entities an SVG text node can carry.
 *
 * The renderer escapes `<`, `>` and `&` when it writes a cell, so the source
 * reads `&lt;path&gt;` where the reader sees `<path>`. Measuring the source
 * counts 10 characters instead of 6 and reports a ~29px overflow on a cell that
 * actually fits — a false positive on every cell containing an angle bracket.
 *
 * Must run *after* nested tags are stripped: decoding first would turn
 * `&lt;path&gt;` back into `<path>`, which the tag stripper would then eat.
 */
function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Strip nested markup, then resolve entities, leaving the glyphs to measure. */
function visibleText(fragment: string): string {
  return decodeEntities(fragment.replace(/<[^>]+>/g, ''));
}

function auditSvg(svg: string): Finding[] {
  const findings: Finding[] = [];
  const open = /<svg[^>]*>/.exec(svg);
  if (!open) return findings;
  const sa = attrs(open[0]);
  const vb = (sa.viewBox ?? '').split(/\s+/).map(Number);
  const viewBox: Box = vb.length === 4
    ? { minX: vb[0], minY: vb[1], maxX: vb[0] + vb[2], maxY: vb[1] + vb[3] }
    : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const naturalW = Number(sa.width ?? 0);
  const isTable = sa.class?.includes('table-svg');

  if (naturalW > USABLE_WIDTH) {
    findings.push({
      kind: 'overflow-column',
      detail: `natural width ${naturalW}px exceeds the ${USABLE_WIDTH}px reading column`,
    });
  }

  // Node shapes (diagram) or cell backgrounds (table).
  //
  // A node's class attribute carries modifiers: `node-rect`, `node-rect
  // node-rounded`, `node-rect node-diamond`. Matching `class="node-rect"` as a
  // literal silently skipped every rounded and diamond node, so none of the
  // checks below ever saw them. Match on the whole tag and test the class token
  // set instead.
  const SHAPE_CLASSES = new Set(['node-rect', 'node-rounded', 'node-diamond', 'tbl-cell-bg', 'tbl-head-bg']);
  const shapes: Box[] = [];
  for (const m of svg.matchAll(/<(rect|polygon)\b[^>]*\/?>/g)) {
    const a = attrs(m[0]);
    const classes = (a.class ?? '').split(/\s+/);
    if (!classes.some(c => SHAPE_CLASSES.has(c))) continue;
    if (a.points) {
      const pts = a.points.split(/\s+/).map(p => p.split(',').map(Number));
      shapes.push(polylineBox(pts.map(([x, y]) => ({ x, y }))));
    } else if (a.x !== undefined) {
      shapes.push(box(Number(a.x), Number(a.y), Number(a.width), Number(a.height)));
    }
  }

  // Text lines: measure against the shape that vertically contains their baseline.
  //
  // A <text> may hold several <tspan> children, one per wrapped line, each with
  // its own x and dy. They have to be measured separately: concatenating them
  // produces a string as wide as the whole cell, which reads as a false
  // overflow on every wrapped cell.
  const textRe = /<text[^>]*\bclass="([^"]*)"[^>]*>([\s\S]*?)<\/text>/g;
  for (const m of svg.matchAll(textRe)) {
    const openTag = m[0].slice(0, m[0].indexOf('>') + 1);
    const a = attrs(openTag);
    if (a.x === undefined) continue;
    const size = Number(a.fontSize ?? 12);
    const baseX = Number(a.x);
    const baseY = Number(a.y);
    const anchor = a['text-anchor'] ?? 'start';

    const spans: Array<{ x: number; y: number; text: string }> = [];
    const tspanRe = /<tspan[^>]*\bdy="([^"]*)"[^>]*>([\s\S]*?)<\/tspan>/g;
    let dy = 0;
    for (const sp of m[2].matchAll(tspanRe)) {
      const sa = attrs(sp[0].slice(0, sp[0].indexOf('>') + 1));
      dy += Number(sp[1] ?? 0);
      spans.push({
        x: sa.x !== undefined ? Number(sa.x) : baseX,
        y: baseY + dy,
        text: visibleText(sp[2]!),
      });
    }
    if (!spans.length) {
      spans.push({ x: baseX, y: baseY, text: visibleText(m[2]!) });
    }

    const bold = (a['font-weight'] ?? '') === '700';
    for (const span of spans) {
      // Measure with the same calibrated model the renderer used to size the
      // box. A flat per-character estimate here produced false positives on
      // every table cell, because it over-measures lowercase prose by ~20%.
      const est = measureText(span.text, size, { bold });
      const left = anchor === 'middle' ? span.x - est / 2 : anchor === 'end' ? span.x - est : span.x;
      const line: Box = {
        minX: left, minY: span.y - size * 0.72,
        maxX: left + est, maxY: span.y + size * 0.21,
      };

      const host = shapes.find(
        s => span.x >= s.minX && span.x <= s.maxX && span.y >= s.minY - 1 && span.y <= s.maxY + 1
      );
      if (host && (line.minX < host.minX - 0.5 || line.maxX > host.maxX + 0.5)) {
        findings.push({
          kind: 'text-overflow',
          detail: `"${span.text.slice(0, 32)}" spans ${line.minX.toFixed(0)}-${line.maxX.toFixed(0)} ` +
                  `inside shape ${host.minX.toFixed(0)}-${host.maxX.toFixed(0)}`,
        });
      }
      if (!overlaps(line, viewBox, 0.5)) {
        findings.push({
          kind: 'text-clipped',
          detail: `"${span.text.slice(0, 32)}" falls outside the viewBox`,
        });
      }
    }
  }

  if (isTable) return findings;

  // Node-vs-node.
  for (let i = 0; i < shapes.length; i++) {
    for (let k = i + 1; k < shapes.length; k++) {
      if (overlaps(shapes[i], shapes[k], 0.5)) {
        findings.push({ kind: 'node-overlap', detail: `shape ${i} overlaps shape ${k}` });
      }
    }
  }

  // Edge-vs-node and edge-vs-label. The attribute order is not guaranteed, so
  // match the whole tag and pull `d` out of it rather than assuming a position.
  const paths = [...svg.matchAll(/<path[^>]*\bclass="edge-path[^"]*"[^>]*>/g)]
    .map(m => attrs(m[0]).d)
    .filter((d): d is string => !!d);
  paths.forEach((d, idx) => {
    const pts = trimEnds(samplePath(d), 8);
    shapes.forEach((s, si) => {
      if (pts.some(p => p.x >= s.minX && p.x <= s.maxX && p.y >= s.minY && p.y <= s.maxY)) {
        findings.push({ kind: 'edge-through-node', detail: `edge ${idx} crosses shape ${si}` });
      }
    });
  });

  for (const m of svg.matchAll(/<rect[^>]*class="edge-label-bg"[^>]*\/?>/g)) {
    const a = attrs(m[0]);
    const lb = box(Number(a.x), Number(a.y), Number(a.width), Number(a.height));
    // The label is drawn inside a <g transform=translate(...)>.
    const g = svg.slice(Math.max(0, m.index - 220), m.index);
    const tr = /translate\(([-\d.]+)[ ,]+([-\d.]+)\)/.exec(g);
    if (tr) {
      lb.minX += Number(tr[1]); lb.maxX += Number(tr[1]);
      lb.minY += Number(tr[2]); lb.maxY += Number(tr[2]);
    }
    shapes.forEach((s, si) => {
      if (overlaps(lb, s, 0.5)) {
        findings.push({ kind: 'label-on-node', detail: `edge label background overlaps shape ${si}` });
      }
    });
  }

  // An edge must actually touch the node it claims to connect. A route whose
  // tip stops short leaves the arrowhead floating in empty space, which is what
  // the old marker `refX` / `ARROW_OFFSET` pair did. Both ends are checked:
  // the tail against the source, the tip against some node.
  paths.forEach((d, idx) => {
    const all = samplePath(d);
    if (all.length < 2) return;
    for (const [end, pt] of [['tail', all[0]!], ['tip', all[all.length - 1]!]] as const) {
      const touches = shapes.some(s =>
        pt.x >= s.minX - 2 && pt.x <= s.maxX + 2 &&
        pt.y >= s.minY - 2 && pt.y <= s.maxY + 2
      );
      if (!touches) {
        findings.push({
          kind: 'edge-endpoint-detached',
          detail: `edge ${idx} ${end} at (${pt.x.toFixed(1)}, ${pt.y.toFixed(1)}) touches no node`,
        });
      }
    }
  });

  // Any ink outside the viewBox.
  for (const d of paths) {
    const b = polylineBox(samplePath(d));
    if (!overlaps(b, viewBox, 0.5) || b.minX < viewBox.minX - 0.5 || b.minY < viewBox.minY - 0.5 ||
        b.maxX > viewBox.maxX + 0.5 || b.maxY > viewBox.maxY + 0.5) {
      findings.push({ kind: 'edge-clipped', detail: `edge ink ${JSON.stringify(b)} exceeds viewBox` });
    }
  }

  return findings;
}

function main(): void {
  const target = process.argv[2];
  if (!target) {
    console.error('usage: geometry-audit.ts <compiled.html>');
    process.exit(2);
  }
  const html = fs.readFileSync(path.resolve(target), 'utf8');
  const svgs = [...html.matchAll(/<svg[\s\S]*?<\/svg>/g)].map(m => m[0]);

  let total = 0;
  svgs.forEach((svg, i) => {
    const findings = auditSvg(svg);
    const label = /aria-label="([^"]*)"/.exec(svg)?.[1] ?? `svg #${i}`;
    if (!findings.length) {
      console.log(`ok    ${label}`);
      return;
    }
    total += findings.length;
    console.log(`FAIL  ${label}`);
    for (const f of findings) console.log(`        [${f.kind}] ${f.detail}`);
  });

  console.log(`\n${svgs.length} svg(s), ${total} finding(s)`);
  process.exit(total > 0 ? 1 : 0);
}

main();
