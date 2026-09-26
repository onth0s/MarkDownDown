import { DIAGRAM as C } from '../../constants.js';
import type { DiagramDirection, DiagramModel, DiagramNode, NodeShape } from './types.js';

/**
 * Quote pairs that may wrap a node label, and so are delimiters not content.
 *
 * `'` is only a delimiter for the shapes it has always delimited. A rect label
 * is written `A["text"]`, and its old parser stripped `"` alone; letting `'`
 * delimit rect labels too would silently eat the apostrophes in a label like
 * `A['quoted']`. Extending the curly pairs to every shape is purely additive,
 * so that part is safe.
 */
const QUOTE_PAIRS_ALL: ReadonlyArray<readonly [string, string]> = [
  ['"', '"'],
  ["'", "'"],
  ['\u201C', '\u201D'],
  ['\u2018', '\u2019'],
];
const QUOTE_PAIRS_RECT: ReadonlyArray<readonly [string, string]> = QUOTE_PAIRS_ALL.filter(
  ([open]) => open !== "'"
);

/**
 * Drop one matching outer quote pair from a label body.
 *
 * DSL.md's own examples write `NODE["Title — Subtitle"]`, so the quotes are
 * quoting syntax rather than content. Straight quotes were already stripped
 * for the shapes above; curly ones were not, which left the `“…”` characters
 * sitting inside the rendered node text. Only a *matching* pair is removed, so a
 * label that merely starts with a quote, or that nests a quoted phrase, is left
 * intact.
 *
 * A pair that would strip down to nothing is not treated as a delimiter:
 * `A['']` means the two-character label `''`, not an empty one. Stripping it
 * would emit a node box with no text element in it at all.
 */
function stripWrappingQuotes(body: string, pairs: ReadonlyArray<readonly [string, string]>): string {
  for (const [open, close] of pairs) {
    if (body.length >= 2 && body.startsWith(open) && body.endsWith(close)) {
      const inner = body.slice(1, -1).trim();
      if (inner) return inner;
    }
  }
  return body.trim();
}

/** Bracket pair -> node shape. */
const BRACKET_SHAPES: Readonly<Record<string, readonly [NodeShape, string]>> = {
  '[': ['rect', ']'],
  '(': ['rounded', ')'],
  '{': ['diamond', '}'],
};

/**
 * `ID[body]`, `ID(body)` or `ID{body}`.
 *
 * The body is matched greedily up to the *last* closing bracket, so a label may
 * contain its own bracket or quote characters. A mismatched bracket pair is not
 * a node definition, and the caller falls through to try something else. An
 * empty body is not a node definition either — `A[]` used to be ignored, and
 * accepting it would draw a box with nothing in it.
 */
function parseNodeShape(raw: string): { id: string; label?: string; shape: NodeShape } | null {
  const m = /^([A-Za-z0-9_.-]+)([[({])([\s\S]*)([\])}])$/.exec(raw);
  if (!m) return null;
  const [, id, open, body, close] = m;
  const shape = BRACKET_SHAPES[open!];
  if (!shape || shape[1] !== close) return null;
  if (!body!.trim()) return null;
  const pairs = shape[0] === 'rect' ? QUOTE_PAIRS_RECT : QUOTE_PAIRS_ALL;
  return { id: id!, label: stripWrappingQuotes(body!, pairs), shape: shape[0] };
}

/** Split on em-dash separator, respecting `\ — ` escape. */
const SPLIT_RE = /(?<!\\) — /;
const cleanEscaped = (s: string): string => s.replace(/\\—/g, '—').trim();

export function diagramParse(source: string, initialDirection?: string): DiagramModel {
  const normalizedInitial = (initialDirection?.toUpperCase() ?? 'auto') as DiagramDirection;
  const model: DiagramModel = {
    nodes: new Map(),
    edges: [],
    labels: [],
    direction: /^(TB|TD|BT|LR|RL)$/i.test(normalizedInitial) ? normalizedInitial : 'auto',
    cx: new Map(),
    cy: new Map(),
    maxX: 0,
    maxY: 0,
    horizontal: false,
    rank: new Map(),
    ranks: [],
  };
  let ord = 0;
  let charPos = 0;

  const pushLabel = (text: string, offset: number) => {
    model.labels.push({ text, offset, ord: ord++ });
    return ord - 1;
  };

  const ensureNode = (id: string, label?: string, shape?: NodeShape, offset?: number): DiagramNode => {
    let node = model.nodes.get(id);
    if (!node) {
      const raw = label ?? id;
      const parts = raw.split(SPLIT_RE);
      node = {
        id,
        label: cleanEscaped(parts[0]),
        subtitle: cleanEscaped(parts[1] ?? ''),
        shape: shape ?? 'rect',
        rank: 0,
        order: model.nodes.size,
        x: 0, y: 0, w: C.MIN_W, h: 36,
        labelOrd: pushLabel(raw, offset ?? charPos),
        titleLines: [],
        subLines: [],
      };
      model.nodes.set(id, node);
    } else if (label !== undefined) {
      const parts = label.split(SPLIT_RE);
      node.label = cleanEscaped(parts[0]);
      node.subtitle = cleanEscaped(parts[1] ?? '');
      if (shape) node.shape = shape;
    }
    return node;
  };

  const lines = source.split(/\r?\n/);
  for (const rawLine of lines) {
    const lineStartPos = charPos;
    charPos += rawLine.length + 1;
    const line = rawLine.trim();
    if (!line || line.startsWith('%%')) continue;

    const dirDirectiveMatch = line.match(/^DIRECTION:\s*(TB|TD|BT|LR|RL)\s*$/i);
    if (dirDirectiveMatch) {
      model.direction = dirDirectiveMatch[1].toUpperCase() as DiagramDirection;
      continue;
    }

    const bareDirMatch = line.match(/^(TB|TD|BT|LR|RL)$/i);
    if (bareDirMatch) {
      model.direction = bareDirMatch[1].toUpperCase() as DiagramDirection;
      continue;
    }

    const legacyHeaderMatch = line.match(/^(?:flowchart|graph)\s*(TB|TD|BT|LR|RL)?\s*$/i);
    if (legacyHeaderMatch) {
      model.direction = (legacyHeaderMatch[1]?.toUpperCase() ?? 'auto') as DiagramDirection;
      continue;
    }

    const cleanEdgeLabel = (raw: string): string => {
      const trimmed = raw.trim();
      const m = trimmed.match(/^["'](.*)["']$/);
      return (m ? m[1] : trimmed).trim();
    };

    // 1. Pipe label: e.g. A -->|label| B, A ---|"VS."| B, A --->|label| B, A ---|label|--> B
    const mPipe = line.match(/^(\S+.*?\]|\S+.*?\)\s*|\S+.*?\}\s*|\S+)\s+(--+>|---+)\|([^|]*)\|(?:(--+>|---+)\s*)?\s*(.+)$/);
    // 2. Inline text label: e.g. A -- label --> B, A --- label ---> B, A --- label --- B
    const mInline = !mPipe ? line.match(/^(\S+.*?\]|\S+.*?\)\s*|\S+.*?\}\s*|\S+)\s+(--+)\s+(.+?)\s+(--+>|---+)\s+(.+)$/) : null;
    // 3. Simple arrow / line: e.g. A --> B, A ---> B, A --- B, A ----- B
    const mSimple = !mPipe && !mInline ? line.match(/^(\S+.*?\]|\S+.*?\)\s*|\S+.*?\}\s*|\S+)\s+(--+>|---+)\s+(.+)$/) : null;

    if (mPipe || mInline || mSimple) {
      const fromRaw = (mPipe ? mPipe[1] : mInline ? mInline[1] : mSimple![1]).trim();
      const toRaw = (mPipe ? mPipe[5] : mInline ? mInline[5] : mSimple![3]).trim();
      const rawLabel = mPipe ? mPipe[3] : mInline ? mInline[3] : '';
      const edgeLabel = cleanEdgeLabel(rawLabel);
      const directed = mPipe
        ? (mPipe[2].endsWith('>') || Boolean(mPipe[4]?.endsWith('>')))
        : mInline
          ? mInline[4].endsWith('>')
          : mSimple![2].endsWith('>');

      const parseInlineNode = (raw: string): string => {
        const parsed = parseNodeShape(raw);
        const rawIdxInLine = rawLine.indexOf(raw);
        const nodeOffset = rawIdxInLine >= 0 ? lineStartPos + rawIdxInLine : lineStartPos;
        if (parsed) {
          ensureNode(parsed.id, parsed.label, parsed.shape, nodeOffset);
          return parsed.id;
        }
        ensureNode(raw, undefined, undefined, nodeOffset);
        return raw;
      };

      const fromId = parseInlineNode(fromRaw);
      const toId = parseInlineNode(toRaw);
      const labelIdx = rawLabel ? rawLine.indexOf(rawLabel) : -1;
      const elOrd = edgeLabel ? pushLabel(edgeLabel, labelIdx >= 0 ? lineStartPos + labelIdx : lineStartPos) : -1;
      model.edges.push({ from: fromId, to: toId, label: edgeLabel, directed, labelOrd: elOrd });
      continue;
    }

    const parsedStandalone = parseNodeShape(line);
    if (parsedStandalone) {
      const rawIdxInLine = rawLine.indexOf(line);
      const nodeOffset = rawIdxInLine >= 0 ? lineStartPos + rawIdxInLine : lineStartPos;
      ensureNode(parsedStandalone.id, parsedStandalone.label, parsedStandalone.shape, nodeOffset);
      continue;
    }

    const bareNode = line.match(/^([A-Za-z0-9_.\\-]+)$/);
    if (bareNode) {
      ensureNode(bareNode[1], undefined, undefined, lineStartPos + rawLine.indexOf(line));
    }
  }

  return model;
}
