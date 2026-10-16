import { DIAGRAM as C } from '../../constants.js';
import { CompileError } from '../../util/error.js';
import { parseInlineMarkdown, type FormattedSpan } from '../inline-markdown.js';
import { measureInline, measureSpans, measureText, widestSpans, wrapSpansToWidth } from '../text-metrics.js';
import type { DiagramModel, DiagramNode } from './types.js';

/**
 * Mark cyclic (back) edges on model.edges via DFS colouring.
 * After this runs the subgraph formed by non-back edges is guaranteed acyclic,
 * so longest-path ranking is well defined and ranks have no gaps.
 */
export function detectBackEdges(model: DiagramModel): void {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const id of model.nodes.keys()) color.set(id, WHITE);
  for (const id of model.subgraphs.keys()) color.set(id, WHITE);

  const visit = (id: string): void => {
    color.set(id, GRAY);
    for (const e of model.edges) {
      if (e.from !== id) continue;
      const c = color.get(e.to);
      if (c === GRAY) e.isBackEdge = true;
      else if (c === WHITE) visit(e.to);
    }
    color.set(id, BLACK);
  };
  for (const id of color.keys()) {
    if (color.get(id) === WHITE) visit(id);
  }
}

/**
 * Assign hierarchical ranks (depths) to nodes in the diagram.
 * Back-edges (cycles) are skipped so ranking produces a valid DAG.
 */
function assignRanks(model: DiagramModel): Map<string, number> {
  const rank = new Map<string, number>();
  const visiting = new Set<string>();

  const assignRank = (id: string): number => {
    if (rank.has(id)) return rank.get(id)!;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    let r = 0;
    for (const e of model.edges) {
      if (e.isBackEdge) continue;
      if (e.to === id && e.from !== id) r = Math.max(r, assignRank(e.from) + 1);
    }
    visiting.delete(id);
    rank.set(id, r);
    return r;
  };

  for (const id of model.nodes.keys()) {
    assignRank(id);
  }

  return rank;
}

/**
 * Reorder nodes within each rank using median barycenter heuristic.
 */
function barycenterOrder(model: DiagramModel, ranks: string[][]): void {
  const pushOut = (a: string, b: string) => {
    if (a !== b) return a < b ? -1 : 1;
    return model.nodes.get(a)!.id < model.nodes.get(b)!.id ? -1 : 1;
  };

  for (let pass = 0; pass < 2; pass++) {
    for (let r = 1; r < ranks.length; r++) {
      if (!ranks[r - 1] || !ranks[r]) continue;
      const posMap = new Map<string, number>();
      ranks[r - 1].forEach((id, i) => posMap.set(id, i));
      const med = (id: string) => {
        const ps = model.edges
          .filter(e => e.to === id && posMap.has(e.from))
          .map(e => posMap.get(e.from)!)
          .sort((x, y) => x - y);
        if (!ps.length) return Infinity;
        const m = Math.floor(ps.length / 2);
        return ps.length % 2 ? ps[m] : (ps[m - 1] + ps[m]) / 2;
      };
      ranks[r].sort((a, b) => {
        const ma = med(a), mb = med(b);
        if (ma === Infinity && mb === Infinity) return pushOut(a, b);
        return ma - mb;
      });
    }
  }
}

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
  if (!isLR) {
    const boxes: NodeBox[] = [];
    for (const node of model.nodes.values()) {
      const cx = model.cx.get(node.id);
      const cy = model.cy.get(node.id);
      if (cx !== undefined && cy !== undefined) {
        boxes.push({ id: node.id, cx, cy, w: node.w, h: node.h });
      }
    }
    checkBoxesOverlap(boxes, 'layout');
  }
}

/** One measured line of node text, with the metrics needed to place it. */
export interface TextLine {
  text: string;
  size: number;
  bold: boolean;
  /** Baseline Y, relative to the node centre. */
  dy: number;
  /** Measured advance width, in user units. */
  width: number;
}

export interface NodeMetrics {
  titleLines: FormattedSpan[][];
  subLines: FormattedSpan[][];
  /** Every text line in paint order, with baselines relative to node centre. */
  lines: TextLine[];
  /** Vertical offset of the first baseline from the node centre. */
  textTop: number;
  /** Total ink height of the text block. */
  textHeight: number;
  /** Widest measured line, in user units. */
  textWidth: number;
}

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

function diagramCompoundLayout(model: DiagramModel): void {
  function getAncestorInContainer(itemId: string, containerId?: string): string | null {
    if (model.subgraphs.has(itemId)) {
      let curr = model.subgraphs.get(itemId);
      if (curr?.parentId === containerId) return itemId;
      while (curr) {
        if (curr.parentId === containerId) return curr.id;
        curr = curr.parentId ? model.subgraphs.get(curr.parentId) : undefined;
      }
      return null;
    }
    let currSgId = model.nodeToSubgraph.get(itemId);
    if (currSgId === containerId) {
      return itemId;
    }
    if (!currSgId) {
      return containerId === undefined ? itemId : null;
    }
    while (currSgId) {
      const sg = model.subgraphs.get(currSgId);
      if (!sg) break;
      if (sg.parentId === containerId) {
        return sg.id;
      }
      currSgId = sg.parentId;
    }
    return null;
  }

  function runCompoundPass(isLR: boolean): void {
    const itemLocalPos = new Map<string, { x: number; y: number; top: number }>();

    function layoutContainer(containerId?: string): void {
      const childSubgraphs = [...model.subgraphs.values()].filter(sg => sg.parentId === containerId);
      for (const csg of childSubgraphs) {
        layoutContainer(csg.id);
      }

      const directNodes = [...model.nodes.values()].filter(
        n => model.nodeToSubgraph.get(n.id) === containerId
      );

      interface Item {
        id: string;
        w: number;
        h: number;
        isSubgraph: boolean;
      }
      const items: Item[] = [
        ...directNodes.map(n => ({ id: n.id, w: n.w, h: n.h, isSubgraph: false })),
        ...childSubgraphs.map(sg => ({
          id: sg.id,
          w: isLR ? (sg.lrW ?? sg.w) : sg.w,
          h: isLR ? (sg.lrH ?? sg.h) : sg.h,
          isSubgraph: true,
        })),
      ];

      if (items.length === 0) {
        if (containerId) {
          const sg = model.subgraphs.get(containerId)!;
          if (isLR) {
            sg.lrW = 120;
            sg.lrH = 60;
          } else {
            sg.w = 120;
            sg.h = 60;
          }
        }
        return;
      }

      const itemIds = new Set(items.map(it => it.id));
      const inducedEdges: Array<{ from: string; to: string }> = [];
      const edgeSet = new Set<string>();

      for (const e of model.edges) {
        const ancFrom = getAncestorInContainer(e.from, containerId);
        const ancTo = getAncestorInContainer(e.to, containerId);
        if (ancFrom && ancTo && ancFrom !== ancTo && itemIds.has(ancFrom) && itemIds.has(ancTo)) {
          const key = `${ancFrom}->${ancTo}`;
          if (!edgeSet.has(key)) {
            edgeSet.add(key);
            inducedEdges.push({ from: ancFrom, to: ancTo });
          }
        }
      }

      const rankMap = new Map<string, number>();
      const visiting = new Set<string>();
      const assignItemRank = (id: string): number => {
        if (rankMap.has(id)) return rankMap.get(id)!;
        if (visiting.has(id)) return 0;
        visiting.add(id);
        let r = 0;
        for (const e of inducedEdges) {
          if (e.to === id && e.from !== id) {
            r = Math.max(r, assignItemRank(e.from) + 1);
          }
        }
        visiting.delete(id);
        rankMap.set(id, r);
        return r;
      };
      for (const it of items) assignItemRank(it.id);

      const itemRanks: string[][] = [];
      for (const it of items) {
        const r = rankMap.get(it.id)!;
        (itemRanks[r] ||= []).push(it.id);
      }

      for (let r = 1; r < itemRanks.length; r++) {
        const prevRow = itemRanks[r - 1];
        if (!prevRow) continue;
        const posMap = new Map<string, number>();
        prevRow.forEach((id, i) => posMap.set(id, i));

        const med = (id: string) => {
          const ps = inducedEdges
            .filter(e => e.to === id && posMap.has(e.from))
            .map(e => posMap.get(e.from)!)
            .sort((a, b) => a - b);
          if (!ps.length) return Infinity;
          const m = Math.floor(ps.length / 2);
          return ps.length % 2 ? ps[m] : (ps[m - 1] + ps[m]) / 2;
        };

        itemRanks[r].sort((a, b) => {
          const ma = med(a), mb = med(b);
          if (ma === Infinity && mb === Infinity) return 0;
          return ma - mb;
        });
      }

      const allNodes = items.every(it => !it.isSubgraph);
      if (allNodes && !isLR) {
        const isLinear = itemRanks.every(r => r.length === 1);
        const nonDiamonds = items.filter(it => model.nodes.get(it.id)?.shape !== 'diamond');
        if (isLinear && nonDiamonds.length > 0) {
          const maxW = Math.max(...nonDiamonds.map(it => it.w), C.MIN_W);
          for (const it of nonDiamonds) {
            it.w = maxW;
            model.nodes.get(it.id)!.w = maxW;
          }
        } else if (!isLinear) {
          for (const rid of itemRanks) {
            const rowNodes = rid.map(id => model.nodes.get(id)!).filter(n => n.shape !== 'diamond');
            if (rowNodes.length > 0) {
              const rowMaxW = Math.max(...rowNodes.map(n => n.w));
              for (const n of rowNodes) {
                n.w = rowMaxW;
                const it = items.find(x => x.id === n.id);
                if (it) it.w = rowMaxW;
              }
            }
          }
        }
      }

      const isTopLevel = containerId === undefined;
      const vGap = isTopLevel ? (isLR ? 28 : 60) : C.V_GAP;
      const hGap = isTopLevel ? (isLR ? 60 : 28) : C.H_GAP;
      const itemMap = new Map(items.map(it => [it.id, it]));

      if (!isLR) {
        let maxContentW = 0;
        const rowHeights: number[] = [];
        const rowWidths: number[] = [];

        for (let r = 0; r < itemRanks.length; r++) {
          const rowIds = itemRanks[r];
          const rowItems = rowIds.map(id => itemMap.get(id)!);
          const rowH = Math.max(...rowItems.map(it => it.h));
          const rowW = rowItems.reduce((sum, it) => sum + it.w + hGap, 0) - hGap;
          rowHeights.push(rowH);
          rowWidths.push(rowW);
          maxContentW = Math.max(maxContentW, rowW);
        }

        let curY = 0;
        for (let r = 0; r < itemRanks.length; r++) {
          const rowIds = itemRanks[r];
          const rowItems = rowIds.map(id => itemMap.get(id)!);
          const rowH = rowHeights[r];
          const rowW = rowWidths[r];
          let curX = (maxContentW - rowW) / 2;

          for (const it of rowItems) {
            const localX = curX + it.w / 2;
            const localTop = curY;
            const localY = curY + it.h / 2;
            itemLocalPos.set(it.id, { x: localX, y: localY, top: localTop });
            curX += it.w + hGap;
          }
          curY += rowH + vGap;
        }
        const totalContentH = curY - (itemRanks.length > 0 ? vGap : 0);

        if (containerId) {
          const sg = model.subgraphs.get(containerId)!;
          const PAD = 16;
          sg.headerH = 28;
          const titleW = measureText(sg.label, 12, { bold: true }) + 28;
          sg.w = Math.max(maxContentW + PAD * 2, titleW + PAD * 2);
          sg.h = Math.max(totalContentH + sg.headerH + PAD * 2, sg.headerH + 40);

          const xShift = (sg.w - maxContentW) / 2;
          const yShift = sg.headerH + PAD;
          for (const it of items) {
            const pos = itemLocalPos.get(it.id)!;
            itemLocalPos.set(it.id, {
              x: pos.x + xShift,
              y: pos.y + yShift,
              top: pos.top + yShift,
            });
          }
        } else {
          const ROOT_PAD = 40;
          model.maxX = maxContentW + ROOT_PAD * 2;
          model.maxY = totalContentH + ROOT_PAD * 2;
          for (const it of items) {
            const pos = itemLocalPos.get(it.id)!;
            itemLocalPos.set(it.id, {
              x: pos.x + ROOT_PAD,
              y: pos.y + ROOT_PAD,
              top: pos.top + ROOT_PAD,
            });
          }
        }
      } else {
        let maxContentH = 0;
        const colHeights: number[] = [];
        const colWidths: number[] = [];

        for (let r = 0; r < itemRanks.length; r++) {
          const colIds = itemRanks[r];
          const colItems = colIds.map(id => itemMap.get(id)!);
          const colW = Math.max(...colItems.map(it => it.w));
          const colH = colItems.reduce((sum, it) => sum + it.h + vGap, 0) - vGap;
          colWidths.push(colW);
          colHeights.push(colH);
          maxContentH = Math.max(maxContentH, colH);
        }

        let curX = 0;
        for (let r = 0; r < itemRanks.length; r++) {
          const colIds = itemRanks[r];
          const colItems = colIds.map(id => itemMap.get(id)!);
          const colW = colWidths[r];
          const colH = colHeights[r];
          let curY = (maxContentH - colH) / 2;

          for (const it of colItems) {
            const localX = curX + it.w / 2;
            const localTop = curY;
            const localY = curY + it.h / 2;
            itemLocalPos.set(it.id, { x: localX, y: localY, top: localTop });
            curY += it.h + vGap;
          }
          curX += colW + hGap;
        }
        const totalContentW = curX - (itemRanks.length > 0 ? hGap : 0);

        if (containerId) {
          const sg = model.subgraphs.get(containerId)!;
          const PAD = 16;
          sg.headerH = 28;
          const titleW = measureText(sg.label, 12, { bold: true }) + 28;
          sg.lrW = Math.max(totalContentW + PAD * 2, titleW + PAD * 2);
          sg.lrH = Math.max(maxContentH + sg.headerH + PAD * 2, sg.headerH + 40);

          const xShift = (sg.lrW - totalContentW) / 2;
          const yShift = sg.headerH + PAD;
          for (const it of items) {
            const pos = itemLocalPos.get(it.id)!;
            itemLocalPos.set(it.id, {
              x: pos.x + xShift,
              y: pos.y + yShift,
              top: pos.top + yShift,
            });
          }
        } else {
          const ROOT_PAD = 40;
          model.lrMaxX = totalContentW + ROOT_PAD * 2;
          model.lrMaxY = maxContentH + ROOT_PAD * 2;
          for (const it of items) {
            const pos = itemLocalPos.get(it.id)!;
            itemLocalPos.set(it.id, {
              x: pos.x + ROOT_PAD,
              y: pos.y + ROOT_PAD,
              top: pos.top + ROOT_PAD,
            });
          }
        }
      }
    }

    layoutContainer(undefined);

    function propagate(currContainerId?: string, originX = 0, originY = 0) {
      const directChildren = currContainerId === undefined
        ? [...model.nodes.values()].filter(n => !model.nodeToSubgraph.has(n.id))
        : [...model.nodes.values()].filter(n => model.nodeToSubgraph.get(n.id) === currContainerId);

      for (const n of directChildren) {
        const pos = itemLocalPos.get(n.id);
        if (pos) {
          const targetX = currContainerId === undefined ? pos.x : originX + pos.x;
          const targetY = currContainerId === undefined ? pos.y : originY + pos.y;
          if (isLR) {
            model.lrCx!.set(n.id, targetX);
            model.lrCy!.set(n.id, targetY);
          } else {
            model.cx.set(n.id, targetX);
            model.cy.set(n.id, targetY);
          }
        }
      }

      const directSubs = [...model.subgraphs.values()].filter(sg => sg.parentId === currContainerId);
      for (const sg of directSubs) {
        const pos = itemLocalPos.get(sg.id);
        if (pos) {
          const curW = isLR ? (sg.lrW ?? sg.w) : sg.w;
          const targetX = currContainerId === undefined ? pos.x - curW / 2 : originX + (pos.x - curW / 2);
          const targetY = currContainerId === undefined ? pos.top : originY + pos.top;
          if (isLR) {
            sg.lrX = targetX;
            sg.lrY = targetY;
          } else {
            sg.x = targetX;
            sg.y = targetY;
          }
          propagate(sg.id, targetX, targetY);
        }
      }
    }

    propagate(undefined, 0, 0);
  }

  model.horizontal = model.direction === 'LR' || model.direction === 'RL';
  model.lrCx = new Map();
  model.lrCy = new Map();
  model.lrGap = 60;

  runCompoundPass(false);
  runCompoundPass(true);

  const rank = assignRanks(model);
  const ranks: string[][] = [];
  for (const [id] of model.nodes) {
    const r = rank.get(id) ?? 0;
    (ranks[r] ||= []).push(id);
  }
  model.rank = rank;
  model.ranks = ranks;
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
