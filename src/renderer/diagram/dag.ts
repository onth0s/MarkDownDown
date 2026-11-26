import type { DiagramModel } from './types.js';

export interface DagEdge {
  from: string;
  to: string;
  isBackEdge?: boolean;
}

/**
 * Mark cyclic (back) edges via DFS colouring using O(V + E) adjacency lists.
 */
export function detectBackEdges(model: DiagramModel): void {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const outEdges = new Map<string, typeof model.edges>();

  for (const id of model.nodes.keys()) color.set(id, WHITE);
  for (const id of model.subgraphs.keys()) color.set(id, WHITE);
  for (const e of model.edges) {
    let list = outEdges.get(e.from);
    if (!list) {
      list = [];
      outEdges.set(e.from, list);
    }
    list.push(e);
  }

  const visit = (id: string): void => {
    color.set(id, GRAY);
    for (const e of outEdges.get(id) ?? []) {
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
 * Generic longest-path rank assignment over non-back edges in O(V + E).
 */
export function assignDagRanks(ids: Iterable<string>, edges: readonly DagEdge[]): Map<string, number> {
  const incoming = new Map<string, string[]>();
  for (const e of edges) {
    if (e.isBackEdge || e.from === e.to) continue;
    let list = incoming.get(e.to);
    if (!list) {
      list = [];
      incoming.set(e.to, list);
    }
    list.push(e.from);
  }

  const rank = new Map<string, number>();
  const visiting = new Set<string>();

  const assignRank = (id: string): number => {
    const cached = rank.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    let r = 0;
    for (const from of incoming.get(id) ?? []) {
      r = Math.max(r, assignRank(from) + 1);
    }
    visiting.delete(id);
    rank.set(id, r);
    return r;
  };

  for (const id of ids) {
    assignRank(id);
  }

  return rank;
}

/**
 * Assign hierarchical ranks (depths) to nodes in the diagram.
 */
export function assignRanks(model: DiagramModel): Map<string, number> {
  return assignDagRanks(model.nodes.keys(), model.edges);
}

/**
 * Generic median barycenter rank ordering with precomputed medians.
 */
export function orderByBarycenter(
  ranks: string[][],
  edges: readonly DagEdge[],
): void {
  const incoming = new Map<string, string[]>();
  for (const e of edges) {
    let list = incoming.get(e.to);
    if (!list) {
      list = [];
      incoming.set(e.to, list);
    }
    list.push(e.from);
  }

  for (let pass = 0; pass < 2; pass++) {
    for (let r = 1; r < ranks.length; r++) {
      if (!ranks[r - 1] || !ranks[r]) continue;
      const posMap = new Map<string, number>();
      ranks[r - 1].forEach((id, i) => posMap.set(id, i));

      const medians = new Map<string, number>();
      for (const id of ranks[r]) {
        const ps: number[] = [];
        for (const from of incoming.get(id) ?? []) {
          const p = posMap.get(from);
          if (p !== undefined) ps.push(p);
        }
        if (!ps.length) {
          medians.set(id, Infinity);
        } else {
          ps.sort((x, y) => x - y);
          const m = Math.floor(ps.length / 2);
          medians.set(id, ps.length % 2 ? ps[m] : (ps[m - 1] + ps[m]) / 2);
        }
      }

      ranks[r].sort((a, b) => {
        if (a === b) return 0;
        const ma = medians.get(a) ?? Infinity;
        const mb = medians.get(b) ?? Infinity;
        if (ma === Infinity && mb === Infinity) return a < b ? -1 : 1;
        if (ma !== mb) return ma - mb;
        return a < b ? -1 : 1;
      });
    }
  }
}

/**
 * Reorder nodes within each rank using median barycenter heuristic.
 */
export function barycenterOrder(model: DiagramModel, ranks: string[][]): void {
  orderByBarycenter(ranks, model.edges);
}
