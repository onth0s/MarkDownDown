/**
 * SVG rendering primitives shared across diagram and table renderers.
 *
 * Text measurement deliberately lives in `text-metrics.ts`; it used to be a flat
 * per-character constant here, which is what made node boxes wrong.
 */

/** Round a number to 1 decimal place. */
export function round1(v: number): string {
  return String(Math.round(v * 10) / 10);
}

/** Format an SVG coordinate pair: "x y" (rounded to 1dp). */
export function coordPair(x: number, y: number): string {
  return `${round1(x)} ${round1(y)}`;
}

/** Format SVG x/y attributes: x="..." y="..." */
export function xyAttrs(x: number, y: number): string {
  return `x="${round1(x)}" y="${round1(y)}"`;
}

/** A point in SVG user space. */
export interface Point {
  x: number;
  y: number;
}

/** An axis-aligned bounding box in SVG user space. */
export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Union of two boxes; either may be omitted. */
export function unionBox(a: Box | undefined, b: Box): Box {
  if (!a) return { ...b };
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

/** Box centred on (cx, cy). */
export function centeredBox(cx: number, cy: number, w: number, h: number): Box {
  return { minX: cx - w / 2, minY: cy - h / 2, maxX: cx + w / 2, maxY: cy + h / 2 };
}

/**
 * A resolved edge route: the exact path data that will be written to the `d`
 * attribute, kept alongside a polyline sampling of the real curve so the layout
 * validator and the viewBox computation reason about ink rather than markup.
 */
export interface EdgeRoute {
  /** The ready-to-emit path data. */
  d: string;
  /** Polyline sampling of the actual drawn curve. */
  points: Point[];
}

/** Build a straight edge route. */
export function lineRoute(start: Point, end: Point): EdgeRoute {
  return {
    d: `M ${coordPair(start.x, start.y)} L ${coordPair(end.x, end.y)}`,
    points: [start, end],
  };
}

/** Build a single cubic edge route and sample it. */
export function cubicRoute(start: Point, c1: Point, c2: Point, end: Point, steps = 24): EdgeRoute {
  const points: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    points.push({
      x: u * u * u * start.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * end.x,
      y: u * u * u * start.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * end.y,
    });
  }
  return {
    d:
      `M ${coordPair(start.x, start.y)} ` +
      `C ${coordPair(c1.x, c1.y)} ${coordPair(c2.x, c2.y)} ${coordPair(end.x, end.y)}`,
    points,
  };
}

/**
 * Build a route that follows an orthogonal-ish polyline with rounded corners.
 *
 * Used to detour an edge around a node it would otherwise cross. Straight
 * `L` segments carry the run between corners and a quadratic `Q` rounds each
 * corner, so the result still reads as a deliberate connector rather than a
 * schematic.
 */
export function roundedPolylineRoute(waypoints: Point[], radius = 12, steps = 24): EdgeRoute {
  const pts = dedupe(waypoints);
  if (pts.length < 2) {
    return { d: '', points: pts };
  }
  if (pts.length === 2) return lineRoute(pts[0], pts[1]);

  const parts: string[] = [`M ${coordPair(pts[0].x, pts[0].y)}`];
  const emitted: Point[] = [pts[0]];

  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const next = pts[i + 1];

    const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const outLen = Math.hypot(next.x - cur.x, next.y - cur.y);
    const r = Math.max(0, Math.min(radius, inLen / 2, outLen / 2));
    if (r < 0.5) {
      parts.push(`L ${coordPair(cur.x, cur.y)}`);
      emitted.push(cur);
      continue;
    }

    const enter = {
      x: cur.x - ((cur.x - prev.x) / (inLen || 1)) * r,
      y: cur.y - ((cur.y - prev.y) / (inLen || 1)) * r,
    };
    const leave = {
      x: cur.x + ((next.x - cur.x) / (outLen || 1)) * r,
      y: cur.y + ((next.y - cur.y) / (outLen || 1)) * r,
    };
    parts.push(`L ${coordPair(enter.x, enter.y)}`);
    parts.push(`Q ${coordPair(cur.x, cur.y)} ${coordPair(leave.x, leave.y)}`);
    emitted.push(enter, cur, leave);
  }

  const last = pts[pts.length - 1];
  parts.push(`L ${coordPair(last.x, last.y)}`);
  emitted.push(last);

  return { d: parts.join(' '), points: resamplePolyline(emitted, steps) };
}

function dedupe(pts: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of pts) {
    const prev = out[out.length - 1];
    if (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) > 0.01) out.push(p);
  }
  return out;
}

/** Evenly resample a polyline so collision tests have uniform resolution. */
function resamplePolyline(pts: Point[], steps: number): Point[] {
  if (pts.length < 2) return pts;
  const segs: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    segs.push(d);
    total += d;
  }
  if (total === 0) return [pts[0]];

  const per = Math.max(1, Math.ceil(steps / Math.max(1, segs.length)));
  const out: Point[] = [];
  for (let i = 1; i < pts.length; i++) {
    for (let k = 0; k < per; k++) {
      const t = k / per;
      out.push({
        x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t,
        y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t,
      });
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Tight bounding box of a route's sampled polyline. */
export function routeBox(route: EdgeRoute): Box {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of route.points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/** Build an SVG <marker> definition for a directed arrowhead. */
export function buildArrowMarker(id: string): string {
  return `<defs><marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto" markerUnits="strokeWidth"><path d="M0.5,0.8 L9.4,5 L0.5,9.2 L2.4,5 z" fill="var(--accent)"/></marker></defs>`;
}

/**
 * Build an SVG <marker> definition for a return arc.
 *
 * Back-edges get their own, visually quieter head so a loop never reads as
 * forward flow. `refX` sits on the tip so the head meets its target instead of
 * stopping short of it.
 */
export function buildBackArrowMarker(id: string): string {
  return `<defs><marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto" markerUnits="strokeWidth"><path d="M0.5,1.4 L9.4,5 L0.5,8.6 z" fill="none" stroke="var(--accent)" stroke-width="1.6" stroke-linejoin="round"/></marker></defs>`;
}
