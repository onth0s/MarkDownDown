import { DIAGRAM as C } from '../../../constants.js';
import type { EdgeRoute, Point } from '../../svg-helpers.js';
import { boxOverlaps, inflateBox as inflate } from '../../svg-helpers.js';
import { measureInline } from '../../text-metrics.js';
import type { PlacedNode, PlacedLabel } from './types.js';

export function labelBox(text: string, x: number, y: number): PlacedLabel {
  const w = measureInline(text, C.EDGE_LABEL_SIZE, {}) + C.EDGE_LABEL_PAD * 2;
  const h = C.EDGE_LABEL_H;
  return {
    text,
    x,
    y,
    w,
    h,
    box: { minX: x - w / 2, minY: y - h / 2, maxX: x + w / 2, maxY: y + h / 2 },
  };
}

/** Point at parameter t along a sampled polyline, by arc length. */
export function pointAtFraction(points: Point[], t: number): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];
  const segs: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    segs.push(d);
    total += d;
  }
  if (total <= 0) return points[0];
  const want = Math.max(0, Math.min(1, t)) * total;
  let acc = 0;
  for (let i = 0; i < segs.length; i++) {
    if (acc + segs[i] >= want) {
      const local = segs[i] === 0 ? 0 : (want - acc) / segs[i];
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * local,
        y: points[i].y + (points[i + 1].y - points[i].y) * local,
      };
    }
    acc += segs[i];
  }
  return points[points.length - 1];
}

/**
 * Place an edge label at the first position along its route where the label
 * background clears every node. Falls back to the route midpoint.
 */
export function placeLabel(route: EdgeRoute, text: string, nodes: PlacedNode[]): PlacedLabel {
  const candidates: number[] = [];
  for (let t = 0.5; t >= 0.24; t -= 0.04) candidates.push(t);
  for (let t = 0.56; t <= 0.76; t += 0.04) candidates.push(t);

  let fallback: PlacedLabel | null = null;
  for (const t of candidates) {
    const p = pointAtFraction(route.points, t);
    const candidate = labelBox(text, p.x, p.y);
    if (!fallback) fallback = candidate;
    const clear = nodes.every(n => !boxOverlaps(inflate(candidate.box, C.LABEL_CLEAR), n.box));
    if (clear) return candidate;
  }
  return fallback ?? labelBox(text, 0, 0);
}
