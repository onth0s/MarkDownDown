export type DiagramDirection = 'TB' | 'TD' | 'BT' | 'LR' | 'RL' | 'auto';

export type NodeShape = 'rect' | 'rounded' | 'diamond';

/** Measured text geometry for a node, relative to the node centre. */
export interface DiagramTextLine {
  text: string;
  size: number;
  bold: boolean;
  /** Baseline Y, relative to the node centre. */
  dy: number;
  /** Measured advance width, in user units. */
  width: number;
}

export interface DiagramNodeMetrics {
  titleLines: string[];
  subLines: string[];
  lines: DiagramTextLine[];
  /** Baseline Y of the first line, relative to the node centre. */
  textTop: number;
  /** Ink height of the whole text block. */
  textHeight: number;
  /** Widest measured line, in user units. */
  textWidth: number;
}

export interface DiagramNode {
  id: string;
  label: string;
  subtitle: string;
  shape: NodeShape;
  rank: number;
  order: number;
  x: number;
  y: number;
  w: number;
  h: number;
  labelOrd: number;
  titleLines: string[];
  subLines: string[];
  metrics?: DiagramNodeMetrics;
}

export interface DiagramEdge {
  from: string;
  to: string;
  label: string;
  directed: boolean;
  labelOrd: number;
  isBackEdge?: boolean;
}

export interface DiagramModel {
  nodes: Map<string, DiagramNode>;
  edges: DiagramEdge[];
  labels: Array<{ text: string; offset: number; ord: number }>;
  direction: DiagramDirection;
  cx: Map<string, number>;
  cy: Map<string, number>;
  maxX: number;
  maxY: number;
  horizontal: boolean;
  rank: Map<string, number>;
  ranks: string[][];
  lrCx?: Map<string, number>;
  lrCy?: Map<string, number>;
  lrMaxX?: number;
  lrMaxY?: number;
  /** Inter-column gap actually used, widened when a wide edge label needs it. */
  lrGap?: number;
  warnings?: string[];
}
