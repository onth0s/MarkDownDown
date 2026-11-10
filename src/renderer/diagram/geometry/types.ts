import type { Box, EdgeRoute } from '../../svg-helpers.js';
import type { DiagramEdge, DiagramNode, DiagramSubgraph } from '../types.js';

export type Orientation = 'TB' | 'LR';

/** A node placed in 2D for one orientation. */
export interface PlacedNode {
  node: DiagramNode;
  cx: number;
  cy: number;
  box: Box;
  isSubgraph?: boolean;
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

export interface PlacedSubgraph {
  subgraph: DiagramSubgraph;
  box: Box;
}

export interface DiagramGeometry {
  orientation: Orientation;
  nodes: PlacedNode[];
  edges: PlacedEdge[];
  subgraphs?: PlacedSubgraph[];
  /** Union of node boxes, edge ink and label boxes. */
  ink: Box;
  /** Residual violations the repair pass could not clear. */
  warnings: string[];
}

/** One node an edge runs through. */
export interface EdgeNodeCollision {
  nodeId: string;
  /** How many sampled points land inside the node box. */
  samples: number;
}
