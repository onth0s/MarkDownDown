/**
 * Diagram DSL → SVG renderer (server-side, no DOM).
 *
 * Ports diagramParse / diagramLayout / diagramBuildSvg from
 * CLDS_interactive_v15.html. Text width is approximated using a constant
 * character width; no canvas or DOM required.
 */
import { escHtml } from '../util/escape.js';
import { DIAGRAM as C } from '../constants.js';
import {
  round1, coordPair, xyAttrs, textWidth, wrapText, buildArrowMarker,
} from './svg-helpers.js';

const NS = 'http://www.w3.org/2000/svg';

type DiagramDirection = 'TB' | 'TD' | 'BT' | 'LR' | 'RL' | 'auto';

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
  titleLines: string[];
  subLines: string[];
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
  direction: DiagramDirection;
  cx: Map<string, number>;
  cy: Map<string, number>;
  maxX: number;
  maxY: number;
  horizontal: boolean;
  rank: Map<string, number>;
  ranks: string[][];
}

// ── Parser ───────────────────────────────────────────────────────────────────

export function diagramParse(source: string): DiagramModel {
  const model: DiagramModel = {
    nodes: new Map(),
    edges: [],
    labels: [],
    direction: 'auto',
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
        let match: RegExpMatchArray | null = null;
        let shape: NodeShape = 'rect';
        const im1 = raw.match(/^([A-Za-z0-9_.\\-]+)\["?([^"\]]+)"?\]$/);
        const im2 = raw.match(/^([A-Za-z0-9_.\\-]+)\(["']?([^"')]+)["']?\)$/);
        const im3 = raw.match(/^([A-Za-z0-9_.\\-]+)\{["']?([^"'}]+)["']?\}$/);
        if (im1) { match = im1; shape = 'rect'; }
        else if (im2) { match = im2; shape = 'rounded'; }
        else if (im3) { match = im3; shape = 'diamond'; }
        if (match) {
          const rawIdxInLine = rawLine.indexOf(raw);
          const nodeOffset = rawIdxInLine >= 0 ? lineStartPos + rawIdxInLine : lineStartPos;
          ensureNode(match[1], match[2], shape, nodeOffset);
          return match[1];
        }
        const rawIdxInLine = rawLine.indexOf(raw);
        const nodeOffset = rawIdxInLine >= 0 ? lineStartPos + rawIdxInLine : lineStartPos;
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

    let nodeMatched = false;
    let nFull: RegExpMatchArray | null = null;
    let nShape: NodeShape = 'rect';
    const nm1 = line.match(/^([A-Za-z0-9_.\\-]+)\["?([^"\]]+)"?\]$/);
    const nm2 = line.match(/^([A-Za-z0-9_.\\-]+)\(["']?([^"')]+)["']?\)$/);
    const nm3 = line.match(/^([A-Za-z0-9_.\\-]+)\{["']?([^"'}]+)["']?\}$/);
    if (nm1) { nFull = nm1; nShape = 'rect'; nodeMatched = true; }
    else if (nm2) { nFull = nm2; nShape = 'rounded'; nodeMatched = true; }
    else if (nm3) { nFull = nm3; nShape = 'diamond'; nodeMatched = true; }
    if (nodeMatched && nFull) {
      const rawIdxInLine = rawLine.indexOf(line);
      const nodeOffset = rawIdxInLine >= 0 ? lineStartPos + rawIdxInLine : lineStartPos;
      ensureNode(nFull[1], nFull[2], nShape, nodeOffset);
      continue;
    }

    const bareNode = line.match(/^([A-Za-z0-9_.\\-]+)$/);
    if (bareNode) {
      ensureNode(bareNode[1], undefined, undefined, lineStartPos + rawLine.indexOf(line));
    }
  }

  return model;
}

// ── Layout ───────────────────────────────────────────────────────────────────

export function diagramLayout(model: DiagramModel): void {
  const nodes = [...model.nodes.values()];

  for (const node of nodes) {
    const titleLines = wrapText(node.label, C.TITLE_SIZE, true, C.MAX_W - C.PADX * 2);
    const subLines = node.subtitle ? wrapText(node.subtitle, C.SUB_SIZE, false, C.MAX_W - C.PADX * 2) : [];
    node.titleLines = titleLines;
    node.subLines = subLines;
    const w = Math.min(C.MAX_W, Math.max(C.MIN_W,
      Math.max(0, ...titleLines.map(l => textWidth(l, C.TITLE_SIZE, true)),
               ...subLines.map(l => textWidth(l, C.SUB_SIZE, false))) * 1.1 + C.PADX * 2));
    node.w = w;
    node.h = titleLines.length * C.TITLE_H + subLines.length * C.SUB_H + C.PADY * 2;
  }

  const maxW = Math.max(...nodes.map(n => n.w));
  for (const node of nodes) node.w = maxW;

  const rank = new Map<string, number>();
  const visiting = new Set<string>();
  const assignRank = (id: string): number => {
    if (rank.has(id)) return rank.get(id)!;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    let r = 0;
    for (const e of model.edges) {
      if (e.to === id && e.from !== id) r = Math.max(r, assignRank(e.from) + 1);
    }
    visiting.delete(id);
    rank.set(id, r);
    return r;
  };
  for (const id of model.nodes.keys()) assignRank(id);

  const ranks: string[][] = [];
  for (const [id] of model.nodes) {
    const r = rank.get(id)!;
    (ranks[r] ||= []).push(id);
  }
  const pushOut = (a: string, b: string) => {
    if (a !== b) return a < b ? -1 : 1;
    return model.nodes.get(a)!.id < model.nodes.get(b)!.id ? -1 : 1;
  };

  for (let pass = 0; pass < 2; pass++) {
    for (let r = 1; r < ranks.length; r++) {
      const posMap = new Map<string, number>();
      ranks[r - 1].forEach((id, i) => posMap.set(id, i));
      const med = (id: string) => {
        const ps = model.edges
          .filter(e => e.to === id && posMap.has(e.from))
          .map(e => posMap.get(e.from)!)
          .sort((x, y) => x - y);
        if (!ps.length) return Infinity;
        const m = Math.floor(ps.length / 2);
        return ps.length % 2 ? ps[m] : (ps[m - 1] + ps[m]) / 2;
      };
      ranks[r].sort((a, b) => {
        const ma = med(a), mb = med(b);
        if (ma === Infinity && mb === Infinity) return pushOut(a, b);
        return ma - mb;
      });
    }
  }

  const cx = new Map<string, number>(), cy = new Map<string, number>();
  let y = C.PAD;
  let maxX = 0;
  for (const rid of ranks) {
    let total = 0;
    for (const id of rid) total += model.nodes.get(id)!.w + C.H_GAP;
    total -= C.H_GAP;
    maxX = Math.max(maxX, total);
    let x = 0;
    let h = 0;
    for (const id of rid) h = Math.max(h, model.nodes.get(id)!.h);
    for (const id of rid) {
      const n = model.nodes.get(id)!;
      cx.set(id, x + n.w / 2);
      cy.set(id, y + h / 2);
      x += n.w + C.H_GAP;
    }
    y += h + C.V_GAP;
  }
  for (const rid of ranks) {
    let total = 0;
    for (const id of rid) total += model.nodes.get(id)!.w + C.H_GAP;
    total -= C.H_GAP;
    const shift = (maxX - total) / 2;
    for (const id of rid) cx.set(id, cx.get(id)! + shift);
  }

  model.maxX = maxX;
  model.maxY = y - C.V_GAP + C.PAD;
  model.cx = cx;
  model.cy = cy;
  model.rank = rank;
  model.ranks = ranks;
  model.horizontal = model.direction === 'LR' || model.direction === 'RL';

  // Dynamic layout evaluation for 'auto' direction
  if (model.direction === 'auto') {
    const totalLrW = nodes.reduce((sum, n) => sum + n.w + C.LR_H_GAP, C.PAD * 2) - C.LR_H_GAP;
    // If the required horizontal width exceeds the standard container (860px) or the graph has > 3 ranks/nodes
    if (totalLrW > 850 || model.ranks.length > 3 || model.nodes.size > 3) {
      model.direction = 'TB';
      model.horizontal = false;
    }
  }

  // Validate no node overlap in TB layout
  validateNoNodeOverlap(model, false);
}

/**
 * Validate that no two nodes overlap in 2D space.
 * Throws a compilation error if any node overlaps with another.
 */
export function validateNoNodeOverlap(model: DiagramModel, isLR: boolean): void {
  const nodes = [...model.nodes.values()];
  if (nodes.length < 2) return;

  if (!isLR) {
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      const aCx = model.cx.get(a.id);
      const aCy = model.cy.get(a.id);
      if (aCx === undefined || aCy === undefined) continue;
      const aLeft = aCx - a.w / 2;
      const aRight = aCx + a.w / 2;
      const aTop = aCy - a.h / 2;
      const aBottom = aCy + a.h / 2;

      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const bCx = model.cx.get(b.id);
        const bCy = model.cy.get(b.id);
        if (bCx === undefined || bCy === undefined) continue;
        const bLeft = bCx - b.w / 2;
        const bRight = bCx + b.w / 2;
        const bTop = bCy - b.h / 2;
        const bBottom = bCy + b.h / 2;

        const overlaps = (aLeft < bRight - 0.5) && (aRight > bLeft + 0.5) &&
                         (aTop < bBottom - 0.5) && (aBottom > bTop + 0.5);
        if (overlaps) {
          throw new Error(`Diagram compilation error: nodes "${a.id}" and "${b.id}" overlap in layout.`);
        }
      }
    }
  }
}

// ── SVG builder ──────────────────────────────────────────────────────────────

let arrowCounter = 0;

export function diagramBuildSvg(model: DiagramModel, title: string, forceHorizontal?: boolean): string {
  const arrowId = `arrow-${arrowCounter++}`;
  const isLR = forceHorizontal !== undefined ? forceHorizontal : model.horizontal;
  return isLR ? buildLrSvg(model, title, arrowId) : buildTbSvg(model, title, arrowId);
}

// ── TB (vertical) SVG ────────────────────────────────────────────────────────

function buildTbSvg(model: DiagramModel, title: string, arrowId: string): string {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  const edgeG: string[] = [];
  model.edges.forEach((e) => {
    const from = model.nodes.get(e.from);
    const to = model.nodes.get(e.to);
    if (!from || !to) return;

    const sx = model.cx.get(e.from)!;
    const sy = model.cy.get(e.from)! + from.h / 2;
    const ex = model.cx.get(e.to)!;
    const ARROW_OFFSET = 6;
    const ey = model.cy.get(e.to)! - to.h / 2 - (e.directed ? ARROW_OFFSET : 0);

    let d: string;
    let mx: number, my: number;
    if (!e.directed) {
      mx = (sx + ex) / 2;
      my = (sy + ey) / 2;
    } else {
      const dy = ey - sy;
      const c1x = sx, c1y = sy + dy * 0.5, c2x = ex, c2y = ey - dy * 0.5;
      mx = (sx + 3 * c1x + 3 * c2x + ex) / 8;
      my = (sy + 3 * c1y + 3 * c2y + ey) / 8;
    }

    if (!e.directed) {
      d = `M ${coordPair(sx, sy)} L ${coordPair(ex, ey)}`;
    } else {
      const dy = ey - sy;
      const c1x = sx, c1y = sy + dy * 0.5, c2x = ex, c2y = ey - dy * 0.5;
      d = `M ${coordPair(sx, sy)} C ${coordPair(c1x, c1y)} ${coordPair(c2x, c2y)} ${coordPair(ex, ey)}`;
    }

    const label = e.label;
    let labelSvg = '';
    if (label) {
      const lw = textWidth(label, C.EDGE_LABEL_SIZE, false) + 14;
      labelSvg =
        `<g class="edge-label" transform="translate(${coordPair(mx, my)})">` +
        `<rect class="edge-label-bg" x="${-lw / 2}" y="${-C.EDGE_LABEL_H / 2}" width="${lw}" height="${C.EDGE_LABEL_H}" rx="6"/>` +
        `<text class="edge-label-text" x="0" y="${C.EDGE_LABEL_H / 2 - 5}" text-anchor="middle" font-size="${C.EDGE_LABEL_SIZE}">${escHtml(label)}</text>` +
        `</g>`;
    }
    const ord = e.labelOrd;
    const ordAttr = ord !== undefined ? ` data-label-ord="${ord}"` : '';
    edgeG.push(
      `<g class="edge"${ordAttr}>` +
      `<path class="edge-path" d="${d}" marker-end="url(#${arrowId})"/>` +
      labelSvg +
      `</g>`
    );
    minX = Math.min(minX, sx, ex);
    minY = Math.min(minY, sy, ey);
    maxX = Math.max(maxX, sx, ex);
    maxY = Math.max(maxY, sy, ey);
  });

  const nodeG: string[] = [];
  for (const node of model.nodes.values()) {
    const x = model.cx.get(node.id)! - node.w / 2;
    const y = model.cy.get(node.id)! - node.h / 2;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + node.w);
    maxY = Math.max(maxY, y + node.h);
    const titleLines = node.titleLines.map((l, i) => {
      const tx = model.cx.get(node.id)!;
      const ty = y + C.PADY + C.TITLE_H * (i + 1) - 4;
      return `<text class="node-title" ${xyAttrs(tx, ty)} text-anchor="middle" font-size="${C.TITLE_SIZE}" font-weight="700">${escHtml(l)}</text>`;
    }).join('');
    const subLines = node.subLines.map((l, i) => {
      const tx = model.cx.get(node.id)!;
      const ty = y + C.PADY + C.TITLE_H * node.titleLines.length + C.SUB_H * (i + 1) - 3;
      return `<text class="node-sub" ${xyAttrs(tx, ty)} text-anchor="middle" font-size="${C.SUB_SIZE}">${escHtml(l)}</text>`;
    }).join('');
    const rx = 8;
    nodeG.push(
      `<g class="node" data-label-ord="${node.labelOrd}">` +
      `<rect class="node-rect" x="${x}" y="${y}" width="${node.w}" height="${node.h}" rx="${rx}"/>` +
      titleLines + subLines +
      `</g>`
    );
  }

  const vb = `${minX - C.PAD} ${minY - C.PAD} ${(maxX - minX) + C.PAD * 2} ${(maxY - minY) + C.PAD * 2}`;
  const vbW = Math.round((maxX - minX) + C.PAD * 2);
  const vbH = Math.round((maxY - minY) + C.PAD * 2);

  return (
    `<svg class="diagram-svg" viewBox="${vb}" width="${vbW}" height="${vbH}" preserveAspectRatio="xMidYMid meet" ` +
    `role="img" aria-label="${escHtml(title)}" xmlns="${NS}">` +
    buildArrowMarker(arrowId) +
    nodeG.join('') + edgeG.join('') +
    `</svg>`
  );
}

// ── LR (horizontal) SVG ──────────────────────────────────────────────────────

function buildLrSvg(model: DiagramModel, title: string, arrowId: string): string {
  const nodesInOrder: DiagramNode[] = [];
  for (const rid of model.ranks) {
    for (const id of rid) nodesInOrder.push(model.nodes.get(id)!);
  }

  let lrX = C.PAD;
  const nodeData: Array<{ id: string; lrX: number; lrY: number; w: number; h: number; rx: number; titleLines: string[]; subLines: string[]; labelOrd: number }> = [];
  for (const node of nodesInOrder) {
    nodeData.push({ id: node.id, lrX: lrX + node.w / 2, lrY: 0, w: node.w, h: node.h, rx: 8, titleLines: node.titleLines, subLines: node.subLines, labelOrd: node.labelOrd });
    lrX += node.w + C.LR_H_GAP;
  }

  const totalW = Math.round(lrX - C.LR_H_GAP + C.PAD);
  const totalH = Math.round(Math.max(...nodeData.map(n => n.h)) + C.PAD * 2);
  const midY = totalH / 2;

  for (const nd of nodeData) {
    nd.lrY = midY;
  }

  // Validate no node overlap in LR layout
  for (let i = 0; i < nodeData.length; i++) {
    const a = nodeData[i];
    const aLeft = a.lrX - a.w / 2;
    const aRight = a.lrX + a.w / 2;
    const aTop = a.lrY - a.h / 2;
    const aBottom = a.lrY + a.h / 2;
    for (let j = i + 1; j < nodeData.length; j++) {
      const b = nodeData[j];
      const bLeft = b.lrX - b.w / 2;
      const bRight = b.lrX + b.w / 2;
      const bTop = b.lrY - b.h / 2;
      const bBottom = b.lrY + b.h / 2;
      const overlaps = (aLeft < bRight - 0.5) && (aRight > bLeft + 0.5) &&
                       (aTop < bBottom - 0.5) && (aBottom > bTop + 0.5);
      if (overlaps) {
        throw new Error(`Diagram compilation error: nodes "${a.id}" and "${b.id}" overlap in horizontal layout.`);
      }
    }
  }

  const nodeById = new Map<string, typeof nodeData[0]>();
  for (const nd of nodeData) {
    nodeById.set(nd.id, nd);
  }

  const edgeInfo: Array<{ d: string; omx: number; omy: number; label: string; labelOrd: number }> = [];
  model.edges.forEach(e => {
    const fromNd = nodeById.get(e.from)!;
    const toNd = nodeById.get(e.to)!;
    if (!fromNd || !toNd) return;

    const sx = fromNd.lrX + fromNd.w / 2;
    const sy = fromNd.lrY;
    const ARROW_OFFSET = 6;
    const ex = toNd.lrX - toNd.w / 2 - (e.directed ? ARROW_OFFSET : 0);
    const ey = toNd.lrY;

    let d: string;
    if (!e.directed) {
      d = `M ${coordPair(sx, sy)} L ${coordPair(ex, ey)}`;
    } else {
      const dx = ex - sx;
      d = `M ${coordPair(sx, sy)} C ${coordPair(sx + dx * 0.5, sy)} ${coordPair(ex - dx * 0.5, ey)} ${coordPair(ex, ey)}`;
    }

    const omx = (sx + ex) / 2;
    const omy = (sy + ey) / 2;
    edgeInfo.push({ d, omx, omy, label: e.label, labelOrd: e.labelOrd });
  });

  const edgeG: string[] = edgeInfo.map(ed => {
    let labelSvg = '';
    if (ed.label) {
      const lw = textWidth(ed.label, C.EDGE_LABEL_SIZE, false) + 14;
      const lx = ed.omx, ly = ed.omy;
      labelSvg =
        `<g class="edge-label" transform="translate(${coordPair(lx, ly)})">` +
        `<rect class="edge-label-bg" x="${round1(-lw / 2)}" y="${round1(-C.EDGE_LABEL_H / 2)}" width="${round1(lw)}" height="${round1(C.EDGE_LABEL_H)}" rx="6"/>` +
        `<text class="edge-label-text" x="0" y="${round1(C.EDGE_LABEL_H / 2 - 4)}" text-anchor="middle" font-size="${C.EDGE_LABEL_SIZE}">${escHtml(ed.label)}</text>` +
        `</g>`;
    }
    const pathD = ed.d;
    const ordAttr = ed.labelOrd !== undefined ? ` data-label-ord="${ed.labelOrd}"` : '';
    return `<g class="edge"${ordAttr}><path class="edge-path" d="${pathD}" marker-end="url(#${arrowId})"/>${labelSvg}</g>`;
  });

  const nodeG: string[] = nodeData.map(nd => {
    const cx = nd.lrX, cy = nd.lrY;
    const w = nd.w, h = nd.h;
    const titleLines = nd.titleLines.map((l, i) => {
      const ty = cy - h / 2 + C.PADY + C.TITLE_H * (i + 1) - 4;
      return `<text class="node-title" x="${round1(cx)}" y="${round1(ty)}" text-anchor="middle" font-size="${C.TITLE_SIZE}" font-weight="700">${escHtml(l)}</text>`;
    }).join('');
    const subLines = nd.subLines.map((l, i) => {
      const ty = cy - h / 2 + C.PADY + C.TITLE_H * nd.titleLines.length + C.SUB_H * (i + 1) - 3;
      return `<text class="node-sub" x="${round1(cx)}" y="${round1(ty)}" text-anchor="middle" font-size="${C.SUB_SIZE}">${escHtml(l)}</text>`;
    }).join('');
    return `<g class="node" data-label-ord="${nd.labelOrd}"><rect class="node-rect" x="${round1(cx - w / 2)}" y="${round1(cy - h / 2)}" width="${round1(w)}" height="${round1(h)}" rx="${nd.rx}"/>${titleLines}${subLines}</g>`;
  });

  return (
    `<svg class="diagram-svg" viewBox="0 0 ${totalW} ${totalH}" width="${totalW}" height="${totalH}" preserveAspectRatio="xMidYMid meet" ` +
    `role="img" aria-label="${escHtml(title)}" xmlns="${NS}">` +
    buildArrowMarker(arrowId) +
    nodeG.join('') + edgeG.join('') +
    `</svg>`
  );
}
