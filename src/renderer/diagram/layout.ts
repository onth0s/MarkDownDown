import { DIAGRAM as C } from '../../constants.js';
import { CompileError } from '../../util/error.js';
import { parseInlineMarkdown, type FormattedSpan } from '../inline-markdown.js';
import { measureInline, measureSpans, measureText, widestSpans, wrapSpansToWidth } from '../text-metrics.js';
import type { DiagramModel, DiagramNode, DiagramTextLine, DiagramNodeMetrics } from './types.js';
import { detectBackEdges, assignRanks, barycenterOrder } from './dag.js';
import { diagramCompoundLayout } from './compound-layout.js';

export { detectBackEdges };



export interface NodeBox {
  id: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
}

/**
 * Validate that no two 2D boxes overlap.
 */
export function checkBoxesOverlap(boxes: NodeBox[], layoutName = 'layout'): void {
  if (boxes.length < 2) return;
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i];
    const aLeft = a.cx - a.w / 2;
    const aRight = a.cx + a.w / 2;
    const aTop = a.cy - a.h / 2;
    const aBottom = a.cy + a.h / 2;

    for (let j = i + 1; j < boxes.length; j++) {
      const b = boxes[j];
      const bLeft = b.cx - b.w / 2;
      const bRight = b.cx + b.w / 2;
      const bTop = b.cy - b.h / 2;
      const bBottom = b.cy + b.h / 2;

      const overlaps =
        aLeft < bRight - C.OVERLAP_TOLERANCE &&
        aRight > bLeft + C.OVERLAP_TOLERANCE &&
        aTop < bBottom - C.OVERLAP_TOLERANCE &&
        aBottom > bTop + C.OVERLAP_TOLERANCE;
      if (overlaps) {
        throw new CompileError(`Diagram compilation error: nodes "${a.id}" and "${b.id}" overlap in ${layoutName}.`);
      }
    }
  }
}

/**
 * Validate that no two nodes overlap in 2D space.
 * Throws a CompileError if any node overlaps with another.
 */
export function validateNoNodeOverlap(model: DiagramModel, isLR: boolean): void {
  const boxes: NodeBox[] = [];
  for (const node of model.nodes.values()) {
    const cx = isLR ? model.lrCx?.get(node.id) : model.cx.get(node.id);
    const cy = isLR ? model.lrCy?.get(node.id) : model.cy.get(node.id);
    if (cx !== undefined && cy !== undefined) {
      boxes.push({ id: node.id, cx, cy, w: node.w, h: node.h });
    }
  }
  checkBoxesOverlap(boxes, isLR ? 'LR layout' : 'layout');
}

/** Re-export from types.ts to preserve backwards compatibility. */
export type TextLine = DiagramTextLine;
export type NodeMetrics = DiagramNodeMetrics;

/** Cap height of a font size, as a fraction of the em. */
const CAP_RATIO = 0.72;
/** Descender depth of a font size, as a fraction of the em. */
const DESC_RATIO = 0.21;

/** Build the text lines for a node, un-centred: first baseline sits at dy 0. */
function buildTextLines(titleLines: FormattedSpan[][], subLines: FormattedSpan[][]): TextLine[] {
  const lines: TextLine[] = [];
  titleLines.forEach((spans, i) => {
    lines.push({
      text: spans.map(s => s.text).join(''),
      size: C.TITLE_SIZE,
      bold: true,
      dy: i * C.TITLE_H,
      width: measureSpans(spans, C.TITLE_SIZE, { bold: true }),
    });
  });
  const subBase = titleLines.length ? (titleLines.length - 1) * C.TITLE_H + C.SUB_H : 0;
  subLines.forEach((spans, i) => {
    lines.push({
      text: spans.map(s => s.text).join(''),
      size: C.SUB_SIZE,
      bold: false,
      dy: subBase + i * C.SUB_H,
      width: measureSpans(spans, C.SUB_SIZE, {}),
    });
  });
  return lines;
}

/** Vertical extent of a text block, from the top of the first cap to the last descender. */
function inkExtent(lines: TextLine[]): { top: number; bottom: number } {
  if (!lines.length) return { top: 0, bottom: 0 };
  const first = lines[0];
  const last = lines[lines.length - 1];
  return {
    top: first.dy - first.size * CAP_RATIO,
    bottom: last.dy + last.size * DESC_RATIO,
  };
}

/**
 * Shift a block of lines so its *ink* is centred on the node centre.
 *
 * Centring the baselines instead leaves every label sitting low: a line's ink
 * extends much further above its baseline (cap height) than below it (only the
 * descenders of g/y/p), so a baseline-centred block reads as dropped. The
 * previous formula was worse again and placed a single line a full 7px low.
 */
function centerOnInk(lines: TextLine[]): TextLine[] {
  const { top, bottom } = inkExtent(lines);
  const shift = -(top + bottom) / 2;
  return lines.map(l => ({ ...l, dy: l.dy + shift }));
}

/** Lay out a node's label into measured, baseline-positioned text lines. */
export function measureNodeText(node: DiagramNode): NodeMetrics {
  const isDiamond = node.shape === 'diamond';
  const rectTextMaxW = C.MAX_W - C.PADX * 2;
  const baseWrap = isDiamond ? rectTextMaxW * C.DIAMOND_WRAP_RATIO : rectTextMaxW;

  const wrapText = (text: string, size: number, limit: number, bold: boolean): FormattedSpan[][] => {
    const rawLines = text.split(/\r?\n/);
    const result: FormattedSpan[][] = [];
    for (const rl of rawLines) {
      if (!rl) {
        result.push([]);
        continue;
      }
      const wrapped = wrapSpansToWidth(parseInlineMarkdown(rl), size, limit, bold ? { bold: true } : {});
      result.push(...wrapped);
    }
    return result.length ? result : wrapSpansToWidth(parseInlineMarkdown(text), size, limit, bold ? { bold: true } : {});
  };

  const wrap = (limit: number): { titleLines: FormattedSpan[][]; subLines: FormattedSpan[][] } => ({
    titleLines: wrapText(node.label, C.TITLE_SIZE, limit, true),
    subLines: node.subtitle ? wrapText(node.subtitle, C.SUB_SIZE, limit, false) : [],
  });

  let { titleLines, subLines } = wrap(baseWrap);

  // A diamond is inscribed around whatever text it ends up holding, so an
  // over-wide diamond re-wraps narrower rather than growing without bound.
  if (isDiamond) {
    let limit = baseWrap;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (inscribeDiamond(centerOnInk(buildTextLines(titleLines, subLines))).w <= C.DIAMOND_MAX_W) {
        break;
      }
      limit *= 0.8;
      ({ titleLines, subLines } = wrap(limit));
    }
  }

  const lines = centerOnInk(buildTextLines(titleLines, subLines));
  const { top, bottom } = inkExtent(lines);

  const titleW = widestSpans(titleLines, C.TITLE_SIZE, { bold: true });
  const subW = subLines.length ? widestSpans(subLines, C.SUB_SIZE, {}) : 0;

  return {
    titleLines,
    subLines,
    lines,
    textTop: lines.length ? lines[0].dy : 0,
    textHeight: bottom - top,
    textWidth: Math.max(titleW, subW),
  };
}

/**
 * Size a rhombus so every text line fits inside its slanted edges.
 *
 * A rhombus with half-width A and half-height B = A * aspect has an available
 * half-width of `A * (1 - |dy| / B)` at vertical offset `dy`. Requiring
 * `A * (1 - |dy| / (A * aspect)) >= halfTextW + inset` rearranges to a closed
 * form: `A >= halfTextW + inset + |dy| / aspect`. No iteration is needed, and a
 * multi-line label is handled exactly rather than by a blanket multiplier.
 */
export function inscribeDiamond(lines: TextLine[]): { w: number; h: number } {
  const aspect = C.DIAMOND_ASPECT;
  const inset = C.PADX * 0.55;

  if (!lines.length) {
    return { w: C.MIN_W, h: Math.round(C.MIN_W * aspect) };
  }

  let halfW = 0;
  for (const line of lines) {
    const need = line.width / 2 + inset + Math.abs(line.dy) / aspect;
    if (need > halfW) halfW = need;
  }

  const w = Math.max(C.MIN_W, Math.ceil(halfW * 2));
  const h = Math.max(C.DIAMOND_MIN_H, Math.ceil(w * aspect));
  return { w, h };
}

export function diagramLayout(model: DiagramModel): void {
  detectBackEdges(model);
  const backCount = model.edges.filter(e => e.isBackEdge).length;
  if (backCount > 0) {
    const selfLoops = model.edges.filter(e => e.isBackEdge && e.from === e.to).length;
    const loops = backCount - selfLoops;
    const parts: string[] = [];
    if (loops > 0) parts.push(`${loops} cyclic edge${loops === 1 ? '' : 's'}`);
    if (selfLoops > 0) parts.push(`${selfLoops} self-loop${selfLoops === 1 ? '' : 's'}`);
    if (loops > 0) {
      const msg = `Diagram contains ${parts.join(' and ')}; normalized to a DAG for layout (drawn as return arcs).`;
      (model.warnings ||= []).push(msg);
    }
  }

  const nodes = [...model.nodes.values()];

  for (const node of nodes) {
    const metrics = measureNodeText(node);
    node.metrics = metrics;
    node.titleLines = metrics.titleLines;
    node.subLines = metrics.subLines;

    if (node.shape === 'diamond') {
      const { w, h } = inscribeDiamond(metrics.lines);
      node.w = w;
      node.h = h;
    } else {
      const rawW = metrics.textWidth + C.PADX * 2;
      node.w = Math.min(C.MAX_W, Math.max(C.MIN_W, Math.ceil(rawW)));
      node.h = Math.ceil(metrics.textHeight + C.PADY * 2);
    }
  }

  if (model.subgraphs && model.subgraphs.size > 0) {
    diagramCompoundLayout(model);
    validateNoNodeOverlap(model, false);
    return;
  }

  const rank = assignRanks(model);

  const ranks: string[][] = [];
  for (const [id] of model.nodes) {
    const r = rank.get(id)!;
    (ranks[r] ||= []).push(id);
  }

  barycenterOrder(model, ranks);

  // Equalize widths per-rank or across linear single-column flows
  const isLinearPipeline = ranks.every(r => r.length === 1);
  if (isLinearPipeline) {
    const maxW = Math.max(...nodes.filter(n => n.shape !== 'diamond').map(n => n.w), C.MIN_W);
    for (const node of nodes) {
      if (node.shape !== 'diamond') node.w = maxW;
    }
  } else {
    // For branching diagrams: single-node ranks share singleRankMaxW,
    // multi-node ranks equalize to their rankMaxW so short labels don't balloon to 400px.
    const nonDiamondSingleNodes = ranks
      .filter(r => r.length === 1)
      .map(r => model.nodes.get(r[0])!)
      .filter(n => n.shape !== 'diamond');
    const singleRankMaxW = nonDiamondSingleNodes.length
      ? Math.max(...nonDiamondSingleNodes.map(n => n.w))
      : C.MIN_W;
    for (const rid of ranks) {
      if (rid.length === 1) {
        const n = model.nodes.get(rid[0])!;
        if (n.shape !== 'diamond') {
          n.w = singleRankMaxW;
        }
      } else {
        const nonDiamondRankNodes = rid
          .map(id => model.nodes.get(id)!)
          .filter(n => n.shape !== 'diamond');
        if (nonDiamondRankNodes.length > 0) {
          const rankMaxW = Math.max(...nonDiamondRankNodes.map(n => n.w));
          for (const id of rid) {
            const n = model.nodes.get(id)!;
            if (n.shape !== 'diamond') n.w = rankMaxW;
          }
        }
      }
    }
  }

  const cx = new Map<string, number>(), cy = new Map<string, number>();
  let y = C.PAD;
  let maxX = 0;
  for (const rid of ranks) {
    let total = 0;
    for (const id of rid) total += model.nodes.get(id)!.w + C.H_GAP;
    total -= C.H_GAP;
    maxX = Math.max(maxX, total);
    let x = 0;
    let h = 0;
    for (const id of rid) h = Math.max(h, model.nodes.get(id)!.h);
    for (const id of rid) {
      const n = model.nodes.get(id)!;
      cx.set(id, x + n.w / 2);
      cy.set(id, y + h / 2);
      x += n.w + C.H_GAP;
    }
    y += h + C.V_GAP;
  }
  for (const rid of ranks) {
    let total = 0;
    for (const id of rid) total += model.nodes.get(id)!.w + C.H_GAP;
    total -= C.H_GAP;
    const shift = (maxX - total) / 2;
    for (const id of rid) cx.set(id, cx.get(id)! + shift);
  }

  model.maxX = maxX;
  model.maxY = y - C.V_GAP + C.PAD;
  model.cx = cx;
  model.cy = cy;
  model.rank = rank;
  model.ranks = ranks;
  model.horizontal = model.direction === 'LR' || model.direction === 'RL';

  // Dynamic layout evaluation for 'auto' direction
  if (model.direction === 'auto') {
    const totalLrW = nodes.reduce((sum, n) => sum + n.w + C.LR_H_GAP, C.PAD * 2) - C.LR_H_GAP;
    if (
      totalLrW > C.CONTAINER_WIDTH_THRESHOLD ||
      model.ranks.length > C.AUTO_DIRECTION_RANK_THRESHOLD ||
      model.nodes.size > C.AUTO_DIRECTION_NODE_THRESHOLD
    ) {
      model.direction = 'TB';
      model.horizontal = false;
    }
  }

  // Compute 2D coordinates for LR mode (rank determines X column, nodes in rank stacked vertically by Y)
  const lrCx = new Map<string, number>(), lrCy = new Map<string, number>();
  let curX = C.PAD;
  let maxColHeight = 0;
  const colHeights: number[] = [];
  const colWidths: number[] = [];

  // An edge label in an LR flow has to fit in the gap between the two columns
  // it connects. With the default 80px gap, a label like `labelled prose`
  // (90px wide) overlapped both of its own nodes, because the placer had
  // nowhere to move it to. Widening the gap to fit the widest label gives it
  // somewhere to go.
  const widestLabel = model.edges.reduce((max, e) => {
    if (!e.label) return max;
    return Math.max(max, measureInline(e.label, C.EDGE_LABEL_SIZE, {}) + C.EDGE_LABEL_PAD * 2);
  }, 0);
  const lrGap = Math.max(C.LR_H_GAP, widestLabel + C.EDGE_CLEAR * 2);
  model.lrGap = lrGap;

  for (let r = 0; r < ranks.length; r++) {
    const rid = ranks[r];
    let colW = 0;
    let colH = 0;
    for (const id of rid) {
      const n = model.nodes.get(id)!;
      colW = Math.max(colW, n.w);
      colH += n.h + C.V_GAP;
    }
    colH -= C.V_GAP;
    colWidths.push(colW);
    colHeights.push(colH);
    maxColHeight = Math.max(maxColHeight, colH);
  }

  for (let r = 0; r < ranks.length; r++) {
    const rid = ranks[r];
    const colW = colWidths[r];
    const colH = colHeights[r];
    const yShift = (maxColHeight - colH) / 2;
    let curY = C.PAD + yShift;

    for (const id of rid) {
      const n = model.nodes.get(id)!;
      lrCx.set(id, curX + colW / 2);
      lrCy.set(id, curY + n.h / 2);
      curY += n.h + C.V_GAP;
    }
    curX += colW + lrGap;
  }

  model.lrCx = lrCx;
  model.lrCy = lrCy;
  model.lrMaxX = curX - lrGap + C.PAD;
  model.lrMaxY = maxColHeight + C.PAD * 2;

  // Validate no node overlap in TB layout
  validateNoNodeOverlap(model, false);
}

/** Re-export so callers that only need a plain advance width can skip metrics. */
export { measureText };
