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

  if (orientation === 'TB') {
    const tryCorridors = (box: Box): EdgeRoute | null => {
      const rightX = box.maxX + C.EDGE_CLEAR;
      const leftX = box.minX - C.EDGE_CLEAR;
      const chordMidX = (start.x + end.x) / 2;
      const preferredX = Math.abs(chordMidX - rightX) <= Math.abs(chordMidX - leftX) ? rightX : leftX;
      const alternateX = preferredX === rightX ? leftX : rightX;
      const gateY = Math.min(box.minY - C.EDGE_CLEAR, start.y + 8);
      let exitY = Math.max(box.maxY + C.EDGE_CLEAR, end.y - 8);
      if (box.maxY < end.y && exitY > end.y - 6) {
        exitY = Math.max(box.maxY + 4, end.y - 8);
      }

      const candidates: Array<{ route: EdgeRoute; crossings: number }> = [];
      for (const corridorX of [preferredX, alternateX]) {
        const candidate = roundedPolylineRoute(
          [
            start,
            { x: start.x, y: gateY },
            { x: corridorX, y: gateY },
            { x: corridorX, y: exitY },
            { x: end.x, y: exitY },
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
      const minY = Math.min(start.y, end.y);
      const maxY = Math.max(start.y, end.y);
      for (const o of allOthers) {
        if (o.box.maxY > minY + 4 && o.box.minY < maxY - 4) {
          expandedBox = unionBox(expandedBox, o.box);
        }
      }
      if (expandedBox) {
        result = tryCorridors(expandedBox);
      }
    }
    return result;
  }

  const tryCorridorsLR = (box: Box): EdgeRoute | null => {
    const botY = box.maxY + C.EDGE_CLEAR;
    const topY = box.minY - C.EDGE_CLEAR;
    const chordMidY = (start.y + end.y) / 2;
    const preferredY = Math.abs(chordMidY - botY) <= Math.abs(chordMidY - topY) ? botY : topY;
    const alternateY = preferredY === botY ? topY : botY;
    const gateX = Math.min(box.minX - C.EDGE_CLEAR, start.x + 8);
    let exitX = Math.max(box.maxX + C.EDGE_CLEAR, end.x - 8);
    if (box.maxX < end.x && exitX > end.x - 6) {
      exitX = Math.max(box.maxX + 4, end.x - 8);
    }

    const candidates: Array<{ route: EdgeRoute; crossings: number }> = [];
    for (const corridorY of [preferredY, alternateY]) {
      const candidate = roundedPolylineRoute(
        [
          start,
          { x: gateX, y: start.y },
          { x: gateX, y: corridorY },
          { x: exitX, y: corridorY },
          { x: exitX, y: end.y },
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

  let result = tryCorridorsLR(obstructing);
  if (!result && allOthers?.length) {
    let expandedBox: Box | undefined = obstructing;
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    for (const o of allOthers) {
      if (o.box.maxX > minX + 4 && o.box.minX < maxX - 4) {
        expandedBox = unionBox(expandedBox, o.box);
      }
    }
    if (expandedBox) {
      result = tryCorridorsLR(expandedBox);
    }
  }
  return result;
}
