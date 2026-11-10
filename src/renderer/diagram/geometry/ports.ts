import { DIAGRAM as C } from '../../../constants.js';
import type { DiagramEdge, DiagramModel } from '../types.js';
import type { PlacedNode, Orientation } from './types.js';

/** Port X (TB) / port Y (LR) for the n-th of `total` evenly spread ports. */
export function spreadPort(center: number, index: number, total: number, extent: number, ratio: number): number {
  if (total <= 1) return center;
  const t = index / (total - 1) - 0.5;
  return center + t * 2 * extent * ratio;
}

/**
 * Pick which side of the graph a return arc should run in.
 */
export function chooseReturnSide(
  from: PlacedNode,
  to: PlacedNode,
  nodes: PlacedNode[],
  orientation: Orientation,
): 'left' | 'right' {
  if (orientation === 'LR') return 'right';

  const others = nodes.filter(n => n.node.id !== from.node.id && n.node.id !== to.node.id);
  const bandClear = (anchor: PlacedNode, side: 'left' | 'right'): boolean => {
    for (const o of others) {
      const overlapsBand =
        o.box.minY < anchor.box.maxY + C.EDGE_CLEAR && o.box.maxY > anchor.box.minY - C.EDGE_CLEAR;
      if (!overlapsBand) continue;
      if (side === 'right' && o.box.maxX > anchor.box.maxX + C.EDGE_CLEAR) return false;
      if (side === 'left' && o.box.minX < anchor.box.minX - C.EDGE_CLEAR) return false;
    }
    return true;
  };

  const rightOk = bandClear(from, 'right') && bandClear(to, 'right');
  const leftOk = bandClear(from, 'left') && bandClear(to, 'left');
  if (rightOk) return 'right';
  if (leftOk) return 'left';
  return 'right';
}

export interface PortMaps {
  outTotal: Map<string, number>;
  outIndex: Map<DiagramEdge, number>;
  inTotal: Map<string, number>;
  inIndex: Map<DiagramEdge, number>;
}

export function buildPortMaps(model: DiagramModel, placed: PlacedNode[], orientation: 'TB' | 'LR'): PortMaps {
  const byCx = new Map(placed.map(p => [p.node.id, p.cx]));
  const byCy = new Map(placed.map(p => [p.node.id, p.cy]));

  const forward = model.edges.filter(e => !e.isBackEdge);
  const outLists = new Map<string, DiagramEdge[]>();
  const inLists = new Map<string, DiagramEdge[]>();
  for (const e of forward) {
    let out = outLists.get(e.from);
    if (!out) outLists.set(e.from, (out = []));
    out.push(e);
    let inc = inLists.get(e.to);
    if (!inc) inLists.set(e.to, (inc = []));
    inc.push(e);
  }
  const isLR = orientation === 'LR';
  for (const list of outLists.values()) {
    list.sort((a, b) =>
      isLR
        ? (byCy.get(a.to) ?? 0) - (byCy.get(b.to) ?? 0)
        : (byCx.get(a.to) ?? 0) - (byCx.get(b.to) ?? 0),
    );
  }
  for (const list of inLists.values()) {
    list.sort((a, b) =>
      isLR
        ? (byCy.get(a.from) ?? 0) - (byCy.get(b.from) ?? 0)
        : (byCx.get(a.from) ?? 0) - (byCx.get(b.from) ?? 0),
    );
  }

  const outTotal = new Map<string, number>();
  const outIndex = new Map<DiagramEdge, number>();
  const inTotal = new Map<string, number>();
  const inIndex = new Map<DiagramEdge, number>();
  for (const [id, list] of outLists) {
    outTotal.set(id, list.length);
    list.forEach((e, i) => outIndex.set(e, i));
  }
  for (const [id, list] of inLists) {
    inTotal.set(id, list.length);
    list.forEach((e, i) => inIndex.set(e, i));
  }
  return { outTotal, outIndex, inTotal, inIndex };
}
