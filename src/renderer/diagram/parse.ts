import { DIAGRAM as C } from '../../constants.js';
import type { DiagramDirection, DiagramModel, DiagramNode, NodeShape } from './types.js';

function parseNodeShape(raw: string): { id: string; label?: string; shape: NodeShape } | null {
  const mRect = raw.match(/^([A-Za-z0-9_.\\-]+)\["?([^"\]]+)"?\]$/);
  if (mRect) return { id: mRect[1], label: mRect[2], shape: 'rect' };
  const mRounded = raw.match(/^([A-Za-z0-9_.\\-]+)\(["']?([^"')]+)["']?\)$/);
  if (mRounded) return { id: mRounded[1], label: mRounded[2], shape: 'rounded' };
  const mDiamond = raw.match(/^([A-Za-z0-9_.\\-]+)\{["']?([^"'}]+)["']?\}$/);
  if (mDiamond) return { id: mDiamond[1], label: mDiamond[2], shape: 'diamond' };
  return null;
}

export function diagramParse(source: string, initialDirection?: string): DiagramModel {
  const normalizedInitial = (initialDirection?.toUpperCase() ?? 'auto') as DiagramDirection;
  const model: DiagramModel = {
    nodes: new Map(),
    edges: [],
    labels: [],
    direction: /^(TB|TD|BT|LR|RL|auto)$/i.test(normalizedInitial) ? normalizedInitial : 'auto',
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
      const parts = raw.split(' — ');
      node = {
        id,
        label: parts[0].trim(),
        subtitle: parts[1]?.trim() ?? '',
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
      const parts = label.split(' — ');
      node.label = parts[0].trim();
      node.subtitle = parts[1]?.trim() ?? '';
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

    const dirDirectiveMatch = line.match(/^DIRECTION:\s*(TB|TD|BT|LR|RL|auto)\s*$/i);
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

    const edgePatterns = [
      /^(\S+.*?\]|\S+.*?\)\s*|\S+.*?\}\s*|\S+)\s+-->\|([^|]*)\|\s+(.+)$/,
      /^(\S+.*?\]|\S+.*?\)\s*|\S+.*?\}\s*|\S+)\s+--\s+(.+?)\s+-->\s+(.+)$/,
      /^(\S+.*?\]|\S+.*?\)\s*|\S+.*?\}\s*|\S+)\s+(-->|---)\s+(.+)$/,
    ];

    let edgeMatched = false;
    for (const pat of edgePatterns) {
      const m = line.match(pat);
      if (!m) continue;
      edgeMatched = true;
      const fromRaw = m[1].trim(), toRaw = m[3].trim();
      const edgeLabel = pat === edgePatterns[0] ? m[2] : pat === edgePatterns[1] ? m[2] : '';
      const directed = !line.includes('---') || line.includes('-->');

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
      const elOrd = edgeLabel ? pushLabel(edgeLabel, lineStartPos + rawLine.indexOf(edgeLabel)) : -1;
      model.edges.push({ from: fromId, to: toId, label: edgeLabel, directed, labelOrd: elOrd });
      break;
    }
    if (edgeMatched) continue;

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
