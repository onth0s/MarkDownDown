import { DIAGRAM as C } from '../../constants.js';
import { CompileError } from '../../util/error.js';
import { textWidth, wrapText } from '../svg-helpers.js';
import type { DiagramModel } from './types.js';

/**
 * Mark cyclic (back) edges on model.edges via DFS colouring.
 * After this runs the subgraph formed by non-back edges is guaranteed acyclic,
 * so longest-path ranking is well defined and ranks have no gaps.
 */
export function detectBackEdges(model: DiagramModel): void {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const id of model.nodes.keys()) color.set(id, WHITE);

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
  for (const id of model.nodes.keys()) {
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

export function diagramLayout(model: DiagramModel): void {
  detectBackEdges(model);
  const backCount = model.edges.filter(e => e.isBackEdge).length;
  if (backCount > 0) {
    const msg = `Diagram contains ${backCount} cyclic edge(s); normalized to a DAG for layout (drawn as return arcs).`;
    (model.warnings ||= []).push(msg);
  }

  const nodes = [...model.nodes.values()];

  for (const node of nodes) {
    const titleLines = wrapText(node.label, C.TITLE_SIZE, true, C.MAX_W - C.PADX * 2);
    const subLines = node.subtitle ? wrapText(node.subtitle, C.SUB_SIZE, false, C.MAX_W - C.PADX * 2) : [];
    node.titleLines = titleLines;
    node.subLines = subLines;
    const w = Math.min(C.MAX_W, Math.max(C.MIN_W,
      Math.max(0, ...titleLines.map(l => textWidth(l, C.TITLE_SIZE, true)),
               ...subLines.map(l => textWidth(l, C.SUB_SIZE, false))) * C.WIDTH_MULTIPLIER + C.PADX * 2));
    node.w = w;
    node.h = titleLines.length * C.TITLE_H + subLines.length * C.SUB_H + C.PADY * 2;
  }

  const maxW = Math.max(...nodes.map(n => n.w));
  for (const node of nodes) node.w = maxW;

  const rank = assignRanks(model);

  const ranks: string[][] = [];
  for (const [id] of model.nodes) {
    const r = rank.get(id)!;
    (ranks[r] ||= []).push(id);
  }

  barycenterOrder(model, ranks);

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
    if (totalLrW > C.CONTAINER_WIDTH_THRESHOLD || model.ranks.length > C.AUTO_DIRECTION_RANK_THRESHOLD || model.nodes.size > C.AUTO_DIRECTION_NODE_THRESHOLD) {
      model.direction = 'TB';
      model.horizontal = false;
    }
  }

  // Validate no node overlap in TB layout
  validateNoNodeOverlap(model, false);
}
