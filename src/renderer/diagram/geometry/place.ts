import type { Box } from '../../svg-helpers.js';
import { unionBox } from '../../svg-helpers.js';
import type { DiagramModel } from '../types.js';
import type { PlacedNode, Orientation } from './types.js';

/** Node placements for one orientation. */
export function placeNodes(model: DiagramModel, orientation: Orientation): PlacedNode[] {
  const out: PlacedNode[] = [];
  const xs = orientation === 'TB' ? model.cx : (model.lrCx ?? model.cx);
  const ys = orientation === 'TB' ? model.cy : (model.lrCy ?? model.cy);
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

export function placeSubgraphs(model: DiagramModel, orientation: Orientation): PlacedNode[] {
  const out: PlacedNode[] = [];
  if (!model.subgraphs) return out;
  const isLR = orientation === 'LR';
  for (const sg of model.subgraphs.values()) {
    const sgX = isLR ? (sg.lrX ?? sg.x) : sg.x;
    const sgY = isLR ? (sg.lrY ?? sg.y) : sg.y;
    const sgW = isLR ? (sg.lrW ?? sg.w) : sg.w;
    const sgH = isLR ? (sg.lrH ?? sg.h) : sg.h;
    const cx = sgX + sgW / 2;
    const cy = sgY + sgH / 2;
    out.push({
      node: {
        id: sg.id,
        label: sg.label,
        subtitle: '',
        shape: 'rect',
        order: 0,
        w: sgW,
        h: sgH,
        labelOrd: sg.labelOrd,
        titleLines: [],
        subLines: [],
      },
      cx,
      cy,
      box: { minX: sgX, minY: sgY, maxX: sgX + sgW, maxY: sgY + sgH },
      isSubgraph: true,
    });
  }
  return out;
}

export function isDescendantOf(id: string, ancestorSgId: string, model: DiagramModel): boolean {
  if (id === ancestorSgId) return true;
  let currSgId = model.nodeToSubgraph.get(id) ?? (model.subgraphs.has(id) ? model.subgraphs.get(id)?.parentId : undefined);
  while (currSgId) {
    if (currSgId === ancestorSgId) return true;
    currSgId = model.subgraphs.get(currSgId)?.parentId;
  }
  return false;
}

export function isObstacleForEdge(p: PlacedNode, fromId: string, toId: string, model: DiagramModel): boolean {
  if (p.node.id === fromId || p.node.id === toId) return false;
  if (!p.isSubgraph) return true;
  if (isDescendantOf(fromId, p.node.id, model)) return false;
  if (isDescendantOf(toId, p.node.id, model)) return false;
  return true;
}

export function nodeInkBox(p: PlacedNode): Box {
  return p.box;
}

/** Horizontal extent of the node graph itself, used to pick a free gutter. */
export function graphBounds(nodes: PlacedNode[]): Box {
  let b: Box | undefined;
  for (const p of nodes) b = unionBox(b, nodeInkBox(p));
  return b ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };
}
