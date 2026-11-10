import { DIAGRAM as C } from '../../../constants.js';
import { measureText } from '../../text-metrics.js';
import type { Box, EdgeRoute, Point } from '../../svg-helpers.js';
import { routeBox, unionBox } from '../../svg-helpers.js';
import type { DiagramModel } from '../types.js';
import type { Orientation, PlacedNode, PlacedEdge, PlacedSubgraph, DiagramGeometry } from './types.js';
import { rhombusHalfWidth, edgeNodeCollisions, polylinesCross } from './collisions.js';
import { placeNodes, placeSubgraphs, graphBounds, isObstacleForEdge } from './place.js';
import { buildPortMaps, chooseReturnSide, spreadPort } from './ports.js';
import { routeSelfLoop, routeBackEdge, routeForward, routeAround } from './route.js';
import { placeLabel } from './labels.js';

/**
 * Resolve all geometry for one orientation, validating and repairing as it goes.
 */
export function resolveGeometry(model: DiagramModel, orientation: Orientation): DiagramGeometry {
  const nodes = placeNodes(model, orientation);
  const subgraphNodes = placeSubgraphs(model, orientation);
  const byId = new Map([
    ...nodes.map(p => [p.node.id, p] as const),
    ...subgraphNodes.map(p => [p.node.id, p] as const),
  ]);
  const bounds = graphBounds(nodes);
  const ports = buildPortMaps(model, nodes, orientation);
  const warnings: string[] = [];

  const isLR = orientation === 'LR';
  const subgraphTitleObstacles: PlacedNode[] = [];
  if (model.subgraphs) {
    for (const sg of model.subgraphs.values()) {
      const sgX = isLR ? (sg.lrX ?? sg.x) : sg.x;
      const sgY = isLR ? (sg.lrY ?? sg.y) : sg.y;
      const sgW = isLR ? (sg.lrW ?? sg.w) : sg.w;
      const headerH = sg.headerH || 28;
      const titleW = measureText(sg.label, 12, { bold: true });
      const titleBox: Box = {
        minX: sgX,
        minY: sgY,
        maxX: Math.min(sgX + sgW, sgX + 12 + titleW + 12),
        maxY: sgY + headerH,
      };
      subgraphTitleObstacles.push({
        node: {
          id: `__subgraph_title_${sg.id}`,
          label: sg.label,
          subtitle: '',
          shape: 'rect',
          rank: 0,
          order: 0,
          x: (titleBox.minX + titleBox.maxX) / 2,
          y: (titleBox.minY + titleBox.maxY) / 2,
          w: titleBox.maxX - titleBox.minX,
          h: titleBox.maxY - titleBox.minY,
          labelOrd: -1,
          titleLines: [],
          subLines: [],
        },
        cx: (titleBox.minX + titleBox.maxX) / 2,
        cy: (titleBox.minY + titleBox.maxY) / 2,
        box: titleBox,
        isSubgraph: true,
      });
    }
  }

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

      const others = [
        ...nodes.filter(n => isObstacleForEdge(n, edge.from, edge.to, model)),
        ...subgraphNodes.filter(n => isObstacleForEdge(n, edge.from, edge.to, model)),
        ...subgraphTitleObstacles.filter(
          t => t.node.id !== `__subgraph_title_${edge.from}` && t.node.id !== `__subgraph_title_${edge.to}`
        ),
      ];
      const hits = edgeNodeCollisions(route, others);
      if (hits.length) {
        const obstacles = others.filter(n => hits.some(h => h.nodeId === n.node.id));
        const detour = routeAround(start, end, obstacles, orientation, others, placed);
        if (detour) {
          route = detour;
        } else {
          warnings.push(
            `edge ${edge.from} -> ${edge.to} passes through node "${hits[0].nodeId}" and could not be re-routed`
          );
        }
      }
    }

    const label = edge.label ? placeLabel(route, edge.label, nodes) : undefined;
    placed.push({ edge, route, label });
  }

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

  const placedSubgraphs: PlacedSubgraph[] = subgraphNodes.map(p => ({
    subgraph: model.subgraphs.get(p.node.id)!,
    box: p.box,
  }));

  let ink: Box | undefined;
  for (const p of nodes) ink = unionBox(ink, p.box);
  for (const s of placedSubgraphs) ink = unionBox(ink, s.box);
  for (const e of placed) {
    ink = unionBox(ink, routeBox(e.route));
    if (e.label) ink = unionBox(ink, e.label.box);
  }

  return {
    orientation,
    nodes,
    edges: placed,
    subgraphs: placedSubgraphs,
    ink: ink ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    warnings,
  };
}
