export type DiagramDirection = 'TB' | 'TD' | 'BT' | 'LR' | 'RL' | 'auto';

export type NodeShape = 'rect' | 'rounded' | 'diamond';

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
  warnings?: string[];
}
