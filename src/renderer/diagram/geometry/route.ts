import { DIAGRAM as C } from '../../../constants.js';
import type { Box, EdgeRoute, Point } from '../../svg-helpers.js';
import { cubicRoute, lineRoute, roundedPolylineRoute, unionBox } from '../../svg-helpers.js';
import { edgeNodeCollisions, polylinesCross } from './collisions.js';
import type { PlacedNode, PlacedEdge, Orientation } from './types.js';

/** Route a self-loop as a tight arc on one side of the node. */
export function routeSelfLoop(
  from: PlacedNode,
  orientation: Orientation,
  side: 'left' | 'right',
): EdgeRoute {
  const { node, cx, cy } = from;
  const halfW = node.w / 2;
  const halfH = node.h / 2;
  const dir = side === 'right' ? 1 : -1;

  if (orientation === 'TB') {
    const edgeX = cx + dir * halfW;
    const y1 = cy - halfH * 0.34;
    const y2 = cy + halfH * 0.34;
    return cubicRoute(
      { x: edgeX, y: y1 },
      { x: edgeX + dir * C.ARC_RADIUS, y: y1 },
      { x: edgeX + dir * C.ARC_RADIUS, y: y2 },
      { x: edgeX, y: y2 }
    );
  }

  const edgeX = cx + dir * halfW;
  const y1 = cy - halfH * 0.3;
  const y2 = cy + halfH * 0.3;
  const bulge = halfH * 2 + C.ARC_RADIUS;
  return cubicRoute(
    { x: edgeX, y: y1 },
    { x: edgeX + dir * bulge, y: y1 },
    { x: edgeX + dir * bulge, y: y2 },
    { x: edgeX, y: y2 }
  );
}

/** Route a multi-node back edge. */
export function routeBackEdge(
  from: PlacedNode,
  to: PlacedNode,
  orientation: Orientation,
  bounds: Box,
  side: 'left' | 'right',
): EdgeRoute {
  const dir = side === 'right' ? 1 : -1;

  if (orientation === 'TB') {
    const gutterX = side === 'right' ? bounds.maxX + C.GUTTER : bounds.minX - C.GUTTER;
    const start = { x: from.cx + dir * (from.node.w / 2), y: from.cy };
    const end = { x: to.cx + dir * (to.node.w / 2), y: to.cy };
    return cubicRoute(
      start,
      { x: gutterX, y: start.y },
      { x: gutterX, y: end.y },
      end
    );
  }

  const dropY = bounds.maxY + C.RETURN_DROP;
  const start = { x: from.cx, y: from.cy + from.node.h / 2 };
  const end = { x: to.cx, y: to.cy + to.node.h / 2 };
  return cubicRoute(
    start,
    { x: start.x, y: dropY },
    { x: end.x, y: dropY },
    end
  );
}

/** Straight-ish forward route: vertical tangents in TB, horizontal in LR. */
export function routeForward(
  start: Point,
  end: Point,
  orientation: Orientation,
): EdgeRoute {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (orientation === 'TB') {
    if (Math.abs(dx) < 0.5) return lineRoute(start, end);
    return cubicRoute(
      start,
      { x: start.x, y: start.y + dy * 0.45 },
      { x: end.x, y: end.y - dy * 0.45 },
      end
    );
  }
  if (Math.abs(dy) < 0.5) return lineRoute(start, end);
  return cubicRoute(
    start,
    { x: start.x + dx * 0.5, y: start.y },
    { x: end.x - dx * 0.5, y: end.y },
    end
  );
}

/** Build a detour that carries an edge around an obstructing node. */
export function routeAround(
  start: Point,
  end: Point,
  obstacles: PlacedNode[],
  orientation: Orientation,
  allOthers?: PlacedNode[],
  existingEdges?: PlacedEdge[],
): EdgeRoute | null {
  if (!obstacles.length) return null;

  let obstructing: Box | undefined;
  for (const o of obstacles) obstructing = unionBox(obstructing, o.box);
  if (!obstructing) return null;

  const countCrossings = (pts: Point[]): number => {
    if (!existingEdges?.length) return 0;
    let count = 0;
    for (const e of existingEdges) {
      if (polylinesCross(pts, e.route.points)) count++;
    }
    return count;
  };

  const isTB = orientation === 'TB';
  const tryCorridors = (box: Box): EdgeRoute | null => {
    const posMax = (isTB ? box.maxX : box.maxY) + C.EDGE_CLEAR;
    const posMin = (isTB ? box.minX : box.minY) - C.EDGE_CLEAR;
    const chordMid = isTB ? (start.x + end.x) / 2 : (start.y + end.y) / 2;
    const preferred = Math.abs(chordMid - posMax) <= Math.abs(chordMid - posMin) ? posMax : posMin;
    const alternate = preferred === posMax ? posMin : posMax;

    const flowStart = isTB ? start.y : start.x;
    const flowEnd = isTB ? end.y : end.x;
    const boxFlowMin = isTB ? box.minY : box.minX;
    const boxFlowMax = isTB ? box.maxY : box.maxX;

    const gate = Math.min(boxFlowMin - C.EDGE_CLEAR, flowStart + 8);
    let exit = Math.max(boxFlowMax + C.EDGE_CLEAR, flowEnd - 8);
    if (boxFlowMax < flowEnd && exit > flowEnd - 6) {
      exit = Math.max(boxFlowMax + 4, flowEnd - 8);
    }

    const mkPt = (cross: number, flow: number): Point => (isTB ? { x: cross, y: flow } : { x: flow, y: cross });
    const startCross = isTB ? start.x : start.y;
    const endCross = isTB ? end.x : end.y;

    const candidates: Array<{ route: EdgeRoute; crossings: number }> = [];
    for (const corridor of [preferred, alternate]) {
      const candidate = roundedPolylineRoute(
        [
          start,
          mkPt(startCross, gate),
          mkPt(corridor, gate),
          mkPt(corridor, exit),
          mkPt(endCross, exit),
          end,
        ],
        10
      );
      if (allOthers && edgeNodeCollisions(candidate, allOthers).length > 0) {
        continue;
      }
      const crossings = countCrossings(candidate.points);
      if (crossings === 0) return candidate;
      candidates.push({ route: candidate, crossings });
    }
    if (candidates.length > 0) {
      candidates.sort((a, b) => a.crossings - b.crossings);
      return candidates[0].route;
    }
    return null;
  };

  let result = tryCorridors(obstructing);
  if (!result && allOthers?.length) {
    let expandedBox: Box | undefined = obstructing;
    const minFlow = Math.min(isTB ? start.y : start.x, isTB ? end.y : end.x);
    const maxFlow = Math.max(isTB ? start.y : start.x, isTB ? end.y : end.x);
    for (const o of allOthers) {
      const oMin = isTB ? o.box.minY : o.box.minX;
      const oMax = isTB ? o.box.maxY : o.box.maxX;
      if (oMax > minFlow + 4 && oMin < maxFlow - 4) {
        expandedBox = unionBox(expandedBox, o.box);
      }
    }
    if (expandedBox) {
      result = tryCorridors(expandedBox);
    }
  }
  return result;
}
