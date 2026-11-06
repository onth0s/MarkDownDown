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
export function assignRanks(model: DiagramModel): Map<string, number> {
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
export function barycenterOrder(model: DiagramModel, ranks: string[][]): void {
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
