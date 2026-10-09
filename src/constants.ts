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
  EDGE_LABEL_H: 18,
  LR_H_GAP: 80,
  OVERLAP_TOLERANCE: 0.5,
  GUTTER: 44,
  PORT_SPREAD_RATIO: 0.28,
  CONTAINER_WIDTH_THRESHOLD: 1044,
  AUTO_DIRECTION_RANK_THRESHOLD: 3,
  AUTO_DIRECTION_NODE_THRESHOLD: 3,

  /** Height of a label background, and the horizontal slack added around it. */
  EDGE_LABEL_PAD: 8,

  /** Outward bulge of a self-loop or a return arc, in user units. */
  ARC_RADIUS: 34,
  /** Extra drop below the lowest rank for a return arc that has to route under. */
  RETURN_DROP: 30,
  /**
   * Perpendicular bow of a non-collinear edge, as a fraction of its span.
   * A control offset of zero would emit a cubic whose control points sit on the
   * chord, which renders as a straight line while still being a curve.
   */
  CURVE_BOW: 0.16,

  /** Node collisions are not counted within this distance of an edge endpoint:
   *  an edge is supposed to touch the node it leaves and the node it enters. */
  PORT_CLEAR: 8,
  /** Minimum gap kept between an edge label and any node box. */
  LABEL_CLEAR: 6,
  /** Minimum gap kept between two edges that are not meant to join. */
  EDGE_CLEAR: 4,

  /** Rhombus height / width. Diamonds read best a little wider than tall. */
  DIAMOND_ASPECT: 0.62,
  /** Fraction of the rect text width a diamond is wrapped to before inscribing. */
  DIAMOND_WRAP_RATIO: 0.7,
  /** Hard ceiling for an inscribed diamond; past this the label re-wraps. */
  DIAMOND_MAX_W: 520,
  /** Floor for an inscribed diamond's height, so a one-word label is visible. */
  DIAMOND_MIN_H: 76,

  /** Samples per cubic when measuring a route's true extent. */
  CURVE_SAMPLES: 24,

  /**
   * Fraction of a drawing's natural width below which it is no longer scaled
   * down; past that the container scrolls instead of shrinking the text further.
   */
  MIN_SCALE: 0.6,
} as const;

/** Table DSL rendering constants. */
export const TABLE = {
  FONT_SIZE: 12,
  HEAD_FONT_SIZE: 13,
  LINE_H: 17,
  HEAD_LINE_H: 18,
  PADX: 12,
  PADV: 9,
  HEAD_H: 34,
  ROW_H: 30,
  PAD: 14,
  /** Hard ceiling on a single column before its cell text is wrapped. */
  MAX_COL_TEXT_W: 300,

  /**
   * Fraction of a table's natural width below which it stops scaling down and
   * the container scrolls instead, so 12px cell text stays readable.
   */
  MIN_SCALE: 0.6,
} as const;

/** Skeleton serialization protocol constants and opcodes. */
export const SKELETON = {
  /** Placeholder opcode: take the next prose run from the DOM, in document order. */
  PROSE: -1,
  /**
   * Opcode: consume the next DOM prose run WITHOUT emitting it. Used when a
   * PROSE slot was replaced by a source-verbatim literal (byte fidelity), so
   * run/slot alignment is preserved.
   */
  SKIP_RUN: -2,
  /** Tags whose subtrees are skipped during flat DOM prose extraction. */
  SKIPPED_TAGS: ['svg', 'pre', 'button', 'script', 'style', 'textarea'] as const,
} as const;

/** Brand logo lightness tone thresholds and extremes. */
export const LOGO = {
  MID_LO: 15,
  MID_HI: 85,
  KNOCKOUT_L: 97,
  SHADOW_L: 3,
} as const;

