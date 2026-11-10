import { DIAGRAM as C } from '../../../constants.js';
import type { EdgeRoute, Point } from '../../svg-helpers.js';
import type { PlacedNode, EdgeNodeCollision } from './types.js';

/** Half-width available for text at vertical offset `dy` inside a rhombus. */
export function rhombusHalfWidth(w: number, h: number, dy: number): number {
  const halfW = w / 2;
  const halfH = h / 2;
  if (halfH <= 0) return halfW;
  return Math.max(0, halfW * (1 - Math.abs(dy) / halfH));
}

/**
 * Drop the leading and trailing `distance` of a polyline, measured by arc
 * length. Returns the points strictly inside that span.
 */
export function trimPolylineEnds(points: Point[], distance: number): Point[] {
  if (points.length < 2 || distance <= 0) return points;

  const segLen: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    segLen.push(d);
    total += d;
  }
  if (total <= 0) return points;

  const target = Math.min(distance, total / 2);
  const inner: Point[] = [];
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const d = segLen[i - 1];
    const from = acc;
    const to = acc + d;
    acc = to;

    const rangeStart = Math.max(from, target);
    const rangeEnd = Math.min(to, total - target);
    if (rangeEnd <= rangeStart || d === 0) continue;
    const t0 = (rangeStart - from) / d;
    const t1 = (rangeEnd - from) / d;
    inner.push({
      x: points[i - 1].x + (points[i].x - points[i - 1].x) * t0,
      y: points[i - 1].y + (points[i].y - points[i - 1].y) * t0,
    });
    inner.push({
      x: points[i - 1].x + (points[i].x - points[i - 1].x) * t1,
      y: points[i - 1].y + (points[i].y - points[i - 1].y) * t1,
    });
  }
  return inner;
}

/**
 * Report the nodes an edge passes through.
 */
export function edgeNodeCollisions(
  route: EdgeRoute,
  nodes: PlacedNode[],
  clearance = C.PORT_CLEAR,
): EdgeNodeCollision[] {
  const body = trimPolylineEnds(route.points, clearance);
  const hits: EdgeNodeCollision[] = [];
  for (const n of nodes) {
    let samples = 0;
    for (const p of body) {
      if (p.x >= n.box.minX && p.x <= n.box.maxX && p.y >= n.box.minY && p.y <= n.box.maxY) {
        samples++;
      }
    }
    if (samples > 0) hits.push({ nodeId: n.node.id, samples });
  }
  return hits;
}

/** True when two segments properly cross. Shared endpoints do not count. */
export function segmentsCross(
  a1: Point, a2: Point, b1: Point, b2: Point,
): boolean {
  const d = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) =>
    (qx - px) * (ry - py) - (qy - py) * (rx - px);
  const d1 = d(a1.x, a1.y, a2.x, a2.y, b1.x, b1.y);
  const d2 = d(a1.x, a1.y, a2.x, a2.y, b2.x, b2.y);
  const d3 = d(b1.x, b1.y, b2.x, b2.y, a1.x, a1.y);
  const d4 = d(b1.x, b1.y, b2.x, b2.y, a2.x, a2.y);
  const EPS = 1e-6;
  if (
    ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) &&
    ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS))
  ) {
    return true;
  }
  return false;
}

export function polylinesCross(a: Point[], b: Point[]): boolean {
  for (let i = 1; i < a.length; i++) {
    for (let j = 1; j < b.length; j++) {
      if (segmentsCross(a[i - 1], a[i], b[j - 1], b[j])) return true;
    }
  }
  return false;
}
