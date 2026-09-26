/**
 * Diagram edge routing, label placement, geometry validation and ink bounds.
 *
 * Everything the SVG emitter needs to know about *where things actually are*
 * is resolved here, in structured form, before a single character of markup is
 * written. The emitter is then a pure serialisation step.
 *
 * This module exists because the previous arrangement had no way to answer
 * three questions:
 *
 *   1. Does an edge pass through a node?      (it did, and shipped)
 *   2. Does an edge label land on a node?     (it did, and shipped)
 *   3. What is the true extent of the drawing? (control points over-stated it
 *      by ~85px, while label boxes were ignored entirely and got clipped)
 */

import { DIAGRAM as C } from '../../constants.js';
import { measureInline } from '../text-metrics.js';
import {
  cubicRoute,
  lineRoute,
  routeBox,
  roundedPolylineRoute,
  unionBox,
  type Box,
  type EdgeRoute,
  type Point,
} from '../svg-helpers.js';
import type { DiagramEdge, DiagramModel, DiagramNode } from './types.js';

export type Orientation = 'TB' | 'LR';

/** A node placed in 2D for one orientation. */
export interface PlacedNode {
  node: DiagramNode;
  cx: number;
  cy: number;
  box: Box;
}

export interface PlacedLabel {
  text: string;
  /** Centre of the label background. */
  x: number;
  y: number;
  w: number;
  h: number;
  box: Box;
}

export interface PlacedEdge {
  edge: DiagramEdge;
  route: EdgeRoute;
  label?: PlacedLabel;
}

export interface DiagramGeometry {
  orientation: Orientation;
  nodes: PlacedNode[];
  edges: PlacedEdge[];
  /** Union of node boxes, edge ink and label boxes. */
  ink: Box;
  /** Residual violations the repair pass could not clear. */
  warnings: string[];
}

/** Half-width available for text at vertical offset `dy` inside a rhombus. */
function rhombusHalfWidth(w: number, h: number, dy: number): number {
  const halfW = w / 2;
  const halfH = h / 2;
  if (halfH <= 0) return halfW;
  return Math.max(0, halfW * (1 - Math.abs(dy) / halfH));
}

function boxOverlaps(a: Box, b: Box, tolerance = 0): boolean {
  return (
    a.minX < b.maxX - tolerance &&
    a.maxX > b.minX + tolerance &&
    a.minY < b.maxY - tolerance &&
    a.maxY > b.minY + tolerance
  );
}

function inflate(b: Box, by: number): Box {
  return { minX: b.minX - by, minY: b.minY - by, maxX: b.maxX + by, maxY: b.maxY + by };
}

/** One node an edge runs through. */
export interface EdgeNodeCollision {
  nodeId: string;
  /** How many sampled points land inside the node box. */
  samples: number;
}

/**
 * Report the nodes an edge passes through.
 *
 * Points within `PORT_CLEAR` of either endpoint are skipped. An edge is
 * *supposed* to touch the node it leaves and the node it enters, so its first
 * and last few samples sit inside those two boxes by design; counting them would
 * flag every edge in the diagram. What matters is the ink in between.
 */
export function edgeNodeCollisions(
  route: EdgeRoute,
  nodes: PlacedNode[],
  clearance = C.PORT_CLEAR
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

    // Keep the part of this segment that lies more than `target` from either end.
    const segStart = Math.max(target - from, 0);
    const segEnd = Math.min(target - from + d, total - target) - target;
    if (segEnd <= segStart) continue;
    const t0 = segStart / d;
    const t1 = segEnd / d;
    if (d === 0) continue;
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

/** True when two segments properly cross. Shared endpoints do not count. */
function segmentsCross(
  a1: Point, a2: Point, b1: Point, b2: Point
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

function polylinesCross(a: Point[], b: Point[]): boolean {
  for (let i = 1; i < a.length; i++) {
    for (let j = 1; j < b.length; j++) {
      if (segmentsCross(a[i - 1], a[i], b[j - 1], b[j])) return true;
    }
  }
  return false;
}

/** Node placements for one orientation. */
function placeNodes(model: DiagramModel, orientation: Orientation): PlacedNode[] {
  const out: PlacedNode[] = [];
  const xs = orientation === 'TB' ? model.cx : model.lrCx!;
  const ys = orientation === 'TB' ? model.cy : model.lrCy!;
  for (const node of model.nodes.values()) {
    const cx = xs.get(node.id)!;
    const cy = ys.get(node.id)!;
    out.push({
      node,
      cx,
      cy,
      box: { minX: cx - node.w / 2, minY: cy - node.h / 2, maxX: cx + node.w / 2, maxY: cy + node.h / 2 },
    });
  }
  return out;
}

function nodeInkBox(p: PlacedNode): Box {
  return p.box;
}

/** Horizontal extent of the node graph itself, used to pick a free gutter. */
function graphBounds(nodes: PlacedNode[]): Box {
  let b: Box | undefined;
  for (const p of nodes) b = unionBox(b, nodeInkBox(p));
  return b ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };
}

/** Port X (TB) / port Y (LR) for the n-th of `total` evenly spread ports. */
function spreadPort(center: number, index: number, total: number, extent: number, ratio: number): number {
  if (total <= 1) return center;
  const t = index / (total - 1) - 0.5;
  return center + t * 2 * extent * ratio;
}

/**
 * Pick which side of the graph a return arc should run in.
 *
 * A TB return arc travels vertically in a gutter outside the whole graph and
 * then runs horizontally back into its target. That horizontal run is only
 * clear if the target's own row band is empty on the chosen side, so the side is
 * chosen by looking at what actually sits beside the source and the target
 * rather than being fixed.
 */
function chooseReturnSide(
  from: PlacedNode,
  to: PlacedNode,
  nodes: PlacedNode[],
  orientation: Orientation
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

interface PortMaps {
  outTotal: Map<string, number>;
  outIndex: Map<DiagramEdge, number>;
  inTotal: Map<string, number>;
  inIndex: Map<DiagramEdge, number>;
}

function buildPortMaps(model: DiagramModel, placed: PlacedNode[]): PortMaps {
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
  // Order ports by the perpendicular position of their partner so a fan-out
  // leaves left-to-right instead of in declaration order.
  for (const list of outLists.values()) {
    list.sort((a, b) => (byCx.get(a.to) ?? 0) - (byCx.get(b.to) ?? 0));
  }
  for (const list of inLists.values()) {
    list.sort((a, b) => (byCx.get(a.from) ?? 0) - (byCx.get(b.from) ?? 0));
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
  void byCy;
  return { outTotal, outIndex, inTotal, inIndex };
}

/** Route a self-loop as a tight arc on one side of the node. */
function routeSelfLoop(
  from: PlacedNode,
  orientation: Orientation,
  side: 'left' | 'right'
): EdgeRoute {
  const { node, cx, cy } = from;
  const halfW = node.w / 2;
  const halfH = node.h / 2;
  const dir = side === 'right' ? 1 : -1;

  if (orientation === 'TB') {
    // Both ends sit on the same vertical edge, control points pushed straight
    // out, so the head points into the node instead of past its corner.
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

  // LR: loop out of the side edge, round, and back into the same edge below.
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

/**
 * Route a multi-node back edge.
 *
 * TB: out of the source's free side, through the vertical gutter beside the
 * whole graph, and into the target's same side. This is what a reader expects
 * a loop to look like, and unlike the previous "dip below everything and come
 * back up" lasso it never crosses the graph or inflates the viewBox.
 *
 * LR: out of the bottom, under the whole graph, and back up into the target's
 * bottom. A loop in a left-to-right flow cannot be drawn by exiting sideways
 * without cutting straight across the intervening nodes.
 */
function routeBackEdge(
  from: PlacedNode,
  to: PlacedNode,
  orientation: Orientation,
  bounds: Box,
  side: 'left' | 'right'
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
function routeForward(
  start: Point,
  end: Point,
  orientation: Orientation
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

/**
 * Build a detour that carries an edge around an obstructing node.
 *
 * Picks the side of the obstruction whose corridor stays nearer the direct
 * line, and threads the edge through it with rounded corners so the result
 * still reads as the same connector rather than a schematic.
 */
function routeAround(
  start: Point,
  end: Point,
  obstacles: PlacedNode[],
  orientation: Orientation
): EdgeRoute | null {
  if (!obstacles.length) return null;

  let obstructing: Box | undefined;
  for (const o of obstacles) obstructing = unionBox(obstructing, o.box);
  if (!obstructing) return null;

  const rightX = obstructing.maxX + C.EDGE_CLEAR;
  const leftX = obstructing.minX - C.EDGE_CLEAR;
  const chordMidX = (start.x + end.x) / 2;
  const corridorX = Math.abs(chordMidX - rightX) <= Math.abs(chordMidX - leftX) ? rightX : leftX;

  if (orientation === 'TB') {
    // Duck under the obstruction: drop to just above it, cross, then drop the
    // last little way into the target's top port.
    const gateY = Math.min(obstructing.minY - C.EDGE_CLEAR, start.y + 8);
    return roundedPolylineRoute(
      [
        start,
        { x: start.x, y: gateY },
        { x: corridorX, y: gateY },
        { x: end.x, y: gateY },
        end,
      ],
      10
    );
  }

  // LR: duck around the far side of the obstruction, in the vertical band it
  // occupies, before closing on the target's left port.
  const gateX = Math.max(obstructing.maxX + C.EDGE_CLEAR, start.x + 8);
  return roundedPolylineRoute(
    [start, { x: gateX, y: start.y }, { x: gateX, y: end.y }, end],
    10
  );
}

function labelBox(text: string, x: number, y: number): PlacedLabel {
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
function pointAtFraction(points: Point[], t: number): Point {
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
function placeLabel(route: EdgeRoute, text: string, nodes: PlacedNode[]): PlacedLabel {
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

/**
 * Resolve all geometry for one orientation, validating and repairing as it goes.
 */
export function resolveGeometry(model: DiagramModel, orientation: Orientation): DiagramGeometry {
  const nodes = placeNodes(model, orientation);
  const byId = new Map(nodes.map(p => [p.node.id, p]));
  const bounds = graphBounds(nodes);
  const ports = buildPortMaps(model, nodes);
  const warnings: string[] = [];

  const placed: PlacedEdge[] = [];

  for (const edge of model.edges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) continue;

    const side = chooseReturnSide(from, to, nodes, orientation);

    let route: EdgeRoute;
    if (edge.from === edge.to) {
      route = routeSelfLoop(from, orientation, side);
    } else if (edge.isBackEdge) {
      route = routeBackEdge(from, to, orientation, bounds, side);
      for (const hit of edgeNodeCollisions(route, nodes)) {
        warnings.push(
          `return arc ${edge.from} -> ${edge.to} passes through node "${hit.nodeId}"`
        );
      }
    } else {
      const outIdx = ports.outIndex.get(edge) ?? 0;
      const outTotal = ports.outTotal.get(edge.from) ?? 1;
      const inIdx = ports.inIndex.get(edge) ?? 0;
      const inTotal = ports.inTotal.get(edge.to) ?? 1;

      let start: Point;
      let end: Point;
      if (orientation === 'TB') {
        const sx = from.node.shape === 'diamond'
          ? from.cx
          : spreadPort(from.cx, outIdx, outTotal, from.node.w, C.PORT_SPREAD_RATIO);
        const ex = to.node.shape === 'diamond'
          ? to.cx
          : spreadPort(to.cx, inIdx, inTotal, to.node.w, C.PORT_SPREAD_RATIO);
        start = { x: sx, y: from.cy + from.node.h / 2 };
        end = { x: ex, y: to.cy - to.node.h / 2 };
      } else {
        const sy = from.node.shape === 'diamond'
          ? from.cy
          : spreadPort(from.cy, outIdx, outTotal, from.node.h, C.PORT_SPREAD_RATIO);
        const ey = to.node.shape === 'diamond'
          ? to.cy
          : spreadPort(to.cy, inIdx, inTotal, to.node.h, C.PORT_SPREAD_RATIO);
        start = { x: from.cx + from.node.w / 2, y: sy };
        end = { x: to.cx - to.node.w / 2, y: ey };
      }

      route = routeForward(start, end, orientation);

      // Repair pass: an edge that clips a node it does not terminate on is
      // re-threaded through a free corridor beside the obstruction. Endpoint
      // contact with the source and target is expected, so the port-aware
      // check ignores it.
      const others = nodes.filter(n => n.node.id !== edge.from && n.node.id !== edge.to);
      const hits = edgeNodeCollisions(route, others);
      if (hits.length) {
        const obstacles = others.filter(n => hits.some(h => h.nodeId === n.node.id));
        const detour = routeAround(start, end, obstacles, orientation);
        if (detour) {
          if (edgeNodeCollisions(detour, others).length === 0) {
            route = detour;
          } else {
            warnings.push(
              `edge ${edge.from} -> ${edge.to} passes through node "${hits[0].nodeId}" and could not be re-routed`
            );
          }
        }
      }
    }

    const label = edge.label ? placeLabel(route, edge.label, nodes) : undefined;
    placed.push({ edge, route, label });
  }

  // Edge-vs-edge crossings are inherent to a fan-in/fan-out graph and are not
  // worth re-routing; they are reported so the author can see them.
  const crossingPairs: string[] = [];
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i], b = placed[j];
      const sharesNode =
        a.edge.from === b.edge.from || a.edge.from === b.edge.to ||
        a.edge.to === b.edge.from || a.edge.to === b.edge.to;
      if (sharesNode) continue;
      if (polylinesCross(a.route.points, b.route.points)) {
        crossingPairs.push(`${a.edge.from}->${a.edge.to} x ${b.edge.from}->${b.edge.to}`);
      }
    }
  }
  if (crossingPairs.length) {
    warnings.push(`${crossingPairs.length} edge crossing pair(s): ${crossingPairs.join(', ')}`);
  }

  // Text-vs-shape: a rhombus narrows towards its vertices, so a multi-line
  // label can clear the bounding box and still cross a slanted edge.
  for (const p of nodes) {
    const metrics = p.node.metrics;
    if (!metrics || p.node.shape !== 'diamond') continue;
    for (const line of metrics.lines) {
      const half = line.width / 2;
      const avail = rhombusHalfWidth(p.node.w, p.node.h, line.dy);
      if (half > avail + 0.5) {
        warnings.push(
          `node "${p.node.id}" text "${line.text.slice(0, 24)}" is wider than the diamond at that line`
        );
      }
    }
  }

  let ink: Box | undefined;
  for (const p of nodes) ink = unionBox(ink, p.box);
  for (const e of placed) {
    ink = unionBox(ink, routeBox(e.route));
    if (e.label) ink = unionBox(ink, e.label.box);
  }

  return {
    orientation,
    nodes,
    edges: placed,
    ink: ink ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    warnings,
  };
}
