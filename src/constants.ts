/** Diagram DSL rendering constants. */
export const DIAGRAM = {
  TITLE_SIZE: 16,
  SUB_SIZE: 14,
  TITLE_H: 22,
  SUB_H: 20,
  MIN_W: 140,
  MAX_W: 400,
  PADX: 28,
  PADY: 18,
  H_GAP: 48,
  V_GAP: 56,
  PAD: 24,
  EDGE_LABEL_SIZE: 11,
  EDGE_LABEL_H: 16,
  LR_REF_W: 960,
  LR_H_GAP: 80,
  OVERLAP_TOLERANCE: 0.5,
  ARROW_OFFSET: 6,
  CONTAINER_WIDTH_THRESHOLD: 850,
  AUTO_DIRECTION_RANK_THRESHOLD: 3,
  AUTO_DIRECTION_NODE_THRESHOLD: 3,
  WIDTH_MULTIPLIER: 1.1,
} as const;

/** Table DSL rendering constants. */
export const TABLE = {
  CHAR_WIDTH: 7.5,
  CHAR_WIDTH_BOLD: 8.2,
  FONT_H: 12,
  HEAD_FONT_H: 13,
  PADX: 12,
  HEAD_H: 34,
  ROW_H: 30,
  PAD: 14,
} as const;
