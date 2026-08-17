/**
 * Diagram DSL → SVG renderer (server-side, no DOM).
 *
 * Ports diagramParse / diagramLayout / diagramBuildSvg from
 * CLDS_interactive_v15.html. Text width is approximated using a constant
 * character width; no canvas or DOM required.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

/** Average character width in px at font-size 12px, Inter font. */
const CHAR_WIDTH_PX = 7.5;
/** Average character width for bold/large text (13px) */
const CHAR_WIDTH_BOLD_PX = 8.2;

const NS = 'http://www.w3.org/2000/svg';

/** Node layout constants */
const NODE_PADX = 18;
const NODE_PADY = 10;
const NODE_MIN_W = 80;
const NODE_MIN_H = 36;
const RANK_GAP = 80;
const NODE_GAP = 40;

// ── Text utilities ────────────────────────────────────────────────────────────

function textWidth(text: string, bold = false): number {
  return text.length * (bold ? CHAR_WIDTH_BOLD_PX : CHAR_WIDTH_PX);
}

function wrapText(text: string, maxW: number, bold = false): string[] {
  const words = String(text).split(/\s+/).filter(Boolean);
  if (words.length <= 1) return words;
  const lines: string[] = [];
  let cur = words[0];
  for (let i = 1; i < words.length; i++) {
    const cand = cur + ' ' + words[i];
    if (textWidth(cand, bold) > maxW) {
      lines.push(cur);
      cur = words[i];
    } else {
      cur = cand;
    }
  }
  lines.push(cur);
  return lines;
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Types ─────────────────────────────────────────────────────────────────────

type NodeShape = 'rect' | 'rounded' | 'diamond';

interface DiagramNode {
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
}

interface DiagramEdge {
  from: string;
  to: string;
  label: string;
  directed: boolean;
  labelOrd: number;
}

interface DiagramModel {
  nodes: Map<string, DiagramNode>;
  edges: DiagramEdge[];
  labels: Array<{ text: string; offset: number; ord: number }>;
  direction: string;
}

// ── Parser ────────────────────────────────────────────────────────────────────

export function diagramParse(source: string): DiagramModel {
  const model: DiagramModel = {
    nodes: new Map(),
    edges: [],
    labels: [],
    direction: 'TB',
  };
  let ord = 0;
  let charPos = 0;

  const pushLabel = (text: string, offset: number) => {
    model.labels.push({ text, offset, ord: ord++ });
    return ord - 1;
  };

  const ensureNode = (id: string, label?: string, shape?: NodeShape): DiagramNode => {
    if (!model.nodes.has(id)) {
      const raw = label ?? id;
      const parts = raw.split(' — ');
      const node: DiagramNode = {
        id,
        label: parts[0].trim(),
        subtitle: parts[1]?.trim() ?? '',
        shape: shape ?? 'rect',
        rank: 0,
        order: model.nodes.size,
        x: 0, y: 0, w: NODE_MIN_W, h: NODE_MIN_H,
        labelOrd: pushLabel(raw, charPos),
      };
      model.nodes.set(id, node);
    } else if (label !== undefined) {
      const n = model.nodes.get(id)!;
      const parts = label.split(' — ');
      n.label = parts[0].trim();
      n.subtitle = parts[1]?.trim() ?? '';
      if (shape) n.shape = shape;
    }
    return model.nodes.get(id)!;
  };

  const lines = source.split(/\r?\n/);
  for (const rawLine of lines) {
    charPos += rawLine.length + 1;
    const line = rawLine.trim();
    if (!line || line.startsWith('%%')) continue;

    // Header: flowchart / graph direction
    const headerMatch = line.match(/^(?:flowchart|graph)\s+(TB|TD|BT|LR|RL)\s*$/i);
    if (headerMatch) {
      model.direction = headerMatch[1].toUpperCase();
      continue;
    }

    // Edge: nodeRef arrow nodeRef [label]
    // Patterns: --> | --- | -->|label| | -- label -->
    const edgePatterns = [
      // A -->|label| B
      /^(\S+)\s+-->\|([^|]*)\|\s+(\S+)$/,
      // A -- label --> B
      /^(\S+)\s+--\s+(.+?)\s+-->\s+(\S+)$/,
      // A --> B
      /^(\S+)\s+(-->|---)\s+(\S+)$/,
    ];

    let edgeMatched = false;
    for (const pat of edgePatterns) {
      const m = line.match(pat);
      if (!m) continue;
      edgeMatched = true;
      const fromRaw = m[1], toRaw = m[3] ?? m[3];
      const edgeLabel = pat === edgePatterns[0] ? m[2] : pat === edgePatterns[1] ? m[2] : '';
      const directed = !line.includes('---') || line.includes('-->');

      // from may be an inline node def: ID["label"] etc.
      const parseInlineNode = (raw: string): string => {
        const nm = raw.match(/^([A-Za-z0-9_.\\-]+)\[["']?(.+?)["']?\]$/) ||
                   raw.match(/^([A-Za-z0-9_.\\-]+)\(["']?(.+?)["']?\)$/) ||
                   raw.match(/^([A-Za-z0-9_.\\-]+)\{["']?(.+?)["']?\}$/);
        if (nm) {
          const shape: NodeShape = raw.includes('{') ? 'diamond' : raw.includes('(') ? 'rounded' : 'rect';
          ensureNode(nm[1], nm[2], shape);
          return nm[1];
        }
        ensureNode(raw);
        return raw;
      };

      const fromId = parseInlineNode(fromRaw);
      const toId = parseInlineNode(toRaw);
      const elOrd = edgeLabel ? pushLabel(edgeLabel, charPos) : -1;
      model.edges.push({ from: fromId, to: toId, label: edgeLabel, directed, labelOrd: elOrd });
      break;
    }
    if (edgeMatched) continue;

    // Standalone node definition: ID["label"] | ID(label) | ID{label} | ID
    const nodeFull = line.match(/^([A-Za-z0-9_.\\-]+)\["?([^"]+)"?\]$/) ||
                     line.match(/^([A-Za-z0-9_.\\-]+)\(["']?(.+?)["']?\)$/) ||
                     line.match(/^([A-Za-z0-9_.\\-]+)\{["']?(.+?)["']?\}$/);
    if (nodeFull) {
      const shape: NodeShape = line.includes('{') ? 'diamond' : line.includes('(') ? 'rounded' : 'rect';
      ensureNode(nodeFull[1], nodeFull[2], shape);
      continue;
    }

    // Bare node ID
    const bareNode = line.match(/^([A-Za-z0-9_.\\-]+)$/);
    if (bareNode) {
      ensureNode(bareNode[1]);
    }
  }

  return model;
}

// ── Layout ────────────────────────────────────────────────────────────────────

export function diagramLayout(model: DiagramModel): void {
  const nodes = [...model.nodes.values()];

  // Compute node sizes
  for (const node of nodes) {
    const maxLabelW = NODE_MIN_W;
    const titleLines = wrapText(node.label, maxLabelW);
    const subtitleLines = node.subtitle ? wrapText(node.subtitle, maxLabelW) : [];
    const allLines = [...titleLines, ...subtitleLines];
    const maxLineW = Math.max(...allLines.map((l) => textWidth(l))) + NODE_PADX * 2;
    const totalH = allLines.length * 18 + NODE_PADY * 2;
    node.w = Math.max(NODE_MIN_W, maxLineW);
    node.h = Math.max(NODE_MIN_H, totalH);
  }

  // Assign ranks via topological sort (BFS from roots)
  const inDegree = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  for (const e of model.edges) {
    if (e.directed) inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1);
  }
  const queue = nodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0).map((n) => n.id);
  let rankCounter = 0;
  const visited = new Set<string>();
  while (queue.length) {
    const batch = [...queue];
    queue.length = 0;
    for (const id of batch) {
      if (visited.has(id)) continue;
      visited.add(id);
      model.nodes.get(id)!.rank = rankCounter;
      for (const e of model.edges) {
        if (e.from === id && e.directed) {
          const toN = model.nodes.get(e.to);
          if (toN) {
            const newDeg = (inDegree.get(e.to) ?? 1) - 1;
            inDegree.set(e.to, newDeg);
            if (newDeg === 0) queue.push(e.to);
          }
        }
      }
    }
    rankCounter++;
  }
  // Any unvisited nodes get their own rank
  for (const n of nodes) {
    if (!visited.has(n.id)) n.rank = rankCounter++;
  }

  // Group by rank
  const rankGroups = new Map<number, DiagramNode[]>();
  for (const n of nodes) {
    if (!rankGroups.has(n.rank)) rankGroups.set(n.rank, []);
    rankGroups.get(n.rank)!.push(n);
  }

  const isLR = model.direction === 'LR' || model.direction === 'RL';
  const isBT = model.direction === 'BT';

  let rankOffset = 20;
  const sortedRanks = [...rankGroups.keys()].sort((a, b) => a - b);
  for (const rank of sortedRanks) {
    const group = rankGroups.get(rank)!;
    group.sort((a, b) => a.order - b.order);
    let crossOffset = 20;
    const maxRankSize = Math.max(...group.map((n) => (isLR ? n.w : n.h)));

    for (const node of group) {
      if (isLR) {
        node.x = rankOffset;
        node.y = crossOffset;
      } else {
        node.x = crossOffset;
        node.y = isBT
          ? (sortedRanks.length - 1 - rank) * (NODE_MIN_H + RANK_GAP) + 20
          : rankOffset;
      }
      crossOffset += (isLR ? node.h : node.w) + NODE_GAP;
    }
    rankOffset += maxRankSize + RANK_GAP;
  }
}

// ── SVG Builder ───────────────────────────────────────────────────────────────

export function diagramBuildSvg(model: DiagramModel, title: string): string {
  const nodes = [...model.nodes.values()];
  const arrowId = `arrow-${Math.random().toString(36).slice(2, 8)}`;
  const isLR = model.direction === 'LR' || model.direction === 'RL';

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.w);
    maxY = Math.max(maxY, n.y + n.h);
  }

  const nodeG: string[] = [];
  for (const node of nodes) {
    const { x, y, w, h, shape, label, subtitle, labelOrd } = node;
    const titleLines = wrapText(label, w - NODE_PADX * 2, true);
    const subLines = subtitle ? wrapText(subtitle, w - NODE_PADX * 2) : [];
    const totalLines = titleLines.length + subLines.length;
    const lineH = 16;
    const startY = y + h / 2 - (totalLines * lineH) / 2 + 12;

    let shapeEl: string;
    if (shape === 'rounded') {
      shapeEl = `<rect class="node-bg" x="${x}" y="${y}" width="${w}" height="${h}" rx="18" ry="18"/>`;
    } else if (shape === 'diamond') {
      const cx = x + w / 2, cy = y + h / 2;
      const pts = `${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}`;
      shapeEl = `<polygon class="node-bg" points="${pts}"/>`;
    } else {
      shapeEl = `<rect class="node-bg" x="${x}" y="${y}" width="${w}" height="${h}" rx="6" ry="6"/>`;
    }

    let textEl = '';
    let ty = startY;
    for (const line of titleLines) {
      textEl += `<text class="node-title" x="${x + w / 2}" y="${ty}" text-anchor="middle" font-size="12" font-weight="700">${esc(line)}</text>`;
      ty += lineH;
    }
    for (const line of subLines) {
      textEl += `<text class="node-sub" x="${x + w / 2}" y="${ty}" text-anchor="middle" font-size="10">${esc(line)}</text>`;
      ty += lineH;
    }

    nodeG.push(`<g class="node-group" data-label-ord="${labelOrd}">${shapeEl}${textEl}</g>`);
  }

  const edgeG: string[] = [];
  for (const edge of model.edges) {
    const from = model.nodes.get(edge.from);
    const to = model.nodes.get(edge.to);
    if (!from || !to) continue;

    const fx = from.x + from.w / 2, fy = from.y + from.h / 2;
    const tx = to.x + to.w / 2, ty_ = to.y + to.h / 2;

    // Exit/entry points
    let x1 = fx, y1 = fy, x2 = tx, y2 = ty_;
    if (isLR) {
      x1 = from.x + from.w; y1 = fy;
      x2 = to.x; y2 = ty_;
    } else {
      x1 = fx; y1 = from.y + from.h;
      x2 = tx; y2 = to.y;
    }

    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const markerEnd = edge.directed ? `marker-end="url(#${arrowId})"` : '';
    edgeG.push(`<line class="edge-line" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${markerEnd}/>`);

    if (edge.label && edge.labelOrd >= 0) {
      edgeG.push(
        `<g class="edge-label-group" data-label-ord="${edge.labelOrd}">` +
        `<text class="edge-label" x="${mx}" y="${my - 4}" text-anchor="middle" font-size="10">${esc(edge.label)}</text>` +
        `</g>`
      );
    }
  }

  const PAD = 20;
  const vb = isLR
    ? `${minY - PAD} ${minX - PAD} ${(maxY - minY) + PAD * 2} ${(maxX - minX) + PAD * 2}`
    : `${minX - PAD} ${minY - PAD} ${(maxX - minX) + PAD * 2} ${(maxY - minY) + PAD * 2}`;

  const [vbX, vbY, vbW, vbH] = vb.split(' ').map(Number);

  return (
    `<svg class="diagram-svg" viewBox="${vb}" width="${vbW}" height="${vbH}" ` +
    `role="img" aria-label="${esc(title)}" xmlns="${NS}">` +
    `<defs><marker id="${arrowId}" viewBox="0 0 10 10" refX="8" refY="5" ` +
    `markerWidth="7" markerHeight="7" orient="auto-start-reverse">` +
    `<path d="M0,0 L10,5 L0,10 z" fill="var(--accent)"/></marker></defs>` +
    nodeG.join('') + edgeG.join('') +
    `</svg>`
  );
}
