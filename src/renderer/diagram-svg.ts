/**
 * Diagram DSL → SVG renderer (server-side, no DOM).
 *
 * Ports diagramParse / diagramLayout / diagramBuildSvg from
 * CLDS_interactive_v15.html. Text width is approximated using a constant
 * character width; no canvas or DOM required.
 */
import { escHtml as esc } from '../util/escape.js';

const NS = 'http://www.w3.org/2000/svg';

const TITLE_SIZE = 16;
const SUB_SIZE = 14;
const TITLE_H = 22;
const SUB_H = 20;
const MIN_W = 140;
const MAX_W = 400;
const PADX = 28;
const PADY = 18;
const H_GAP = 48;
const V_GAP = 56;
const PAD = 24;
const EDGE_LABEL_SIZE = 11;
const EDGE_LABEL_H = 16;

function textWidth(text: string, size: number, bold: boolean): number {
  const base = size <= 11 ? 7.8 : size <= 12 ? 8.6 : 9.6;
  const boldExtra = bold ? 0.8 : 0;
  return text.length * (base + boldExtra);
}

function wrapText(text: string, size: number, bold: boolean, maxW: number): string[] {
  const words = String(text).split(/\s+/).filter(Boolean);
  if (words.length <= 1) return words.length ? [words[0]] : [];
  const lines: string[] = [];
  let cur = words[0];
  for (let i = 1; i < words.length; i++) {
    const cand = cur + ' ' + words[i];
    if (textWidth(cand, size, bold) > maxW) {
      lines.push(cur);
      cur = words[i];
    } else {
      cur = cand;
    }
  }
  lines.push(cur);
  return lines;
}

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
  direction: string;
  cx: Map<string, number>;
  cy: Map<string, number>;
  maxX: number;
  maxY: number;
  horizontal: boolean;
  rank: Map<string, number>;
  ranks: string[][];
}

export function diagramParse(source: string): DiagramModel {
  const model: DiagramModel = {
    nodes: new Map(),
    edges: [],
    labels: [],
    direction: 'TB',
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
        x: 0, y: 0, w: MIN_W, h: 36,
        labelOrd: pushLabel(raw, charPos),
        titleLines: [],
        subLines: [],
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

    const headerMatch = line.match(/^(?:flowchart|graph)\s*(TB|TD|BT|LR|RL)?\s*$/i);
    if (headerMatch) {
      model.direction = headerMatch[1]?.toUpperCase() ?? 'auto';
      continue;
    }

    const edgePatterns = [
      /^(\S+)\s+-->\|([^|]*)\|\s+(\S+)$/,
      /^(\S+)\s+--\s+(.+?)\s+-->\s+(\S+)$/,
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

      const parseInlineNode = (raw: string): string => {
        const nm = raw.match(/^([A-Za-z0-9_.\\-]+)\["?([^"]+)"?\]$/) ||
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

    const nodeFull = line.match(/^([A-Za-z0-9_.\\-]+)\["?([^"]+)"?\]$/) ||
                     line.match(/^([A-Za-z0-9_.\\-]+)\(["']?(.+?)["']?\)$/) ||
                     line.match(/^([A-Za-z0-9_.\\-]+)\{["']?(.+?)["']?\}$/);
    if (nodeFull) {
      const shape: NodeShape = line.includes('{') ? 'diamond' : line.includes('(') ? 'rounded' : 'rect';
      ensureNode(nodeFull[1], nodeFull[2], shape);
      continue;
    }

    const bareNode = line.match(/^([A-Za-z0-9_.\\-]+)$/);
    if (bareNode) {
      ensureNode(bareNode[1]);
    }
  }

  return model;
}

export function diagramLayout(model: DiagramModel): void {
  const nodes = [...model.nodes.values()];

  for (const node of nodes) {
    const titleLines = wrapText(node.label, TITLE_SIZE, true, MAX_W - PADX * 2);
    const subLines = node.subtitle ? wrapText(node.subtitle, SUB_SIZE, false, MAX_W - PADX * 2) : [];
    node.titleLines = titleLines;
    node.subLines = subLines;
    const w = Math.min(MAX_W, Math.max(MIN_W,
      Math.max(0, ...titleLines.map(l => textWidth(l, TITLE_SIZE, true)),
               ...subLines.map(l => textWidth(l, SUB_SIZE, false))) * 1.1 + PADX * 2));
    node.w = w;
    node.h = titleLines.length * TITLE_H + subLines.length * SUB_H + PADY * 2;
  }

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
  let y = PAD;
  let maxX = 0;
  for (const rid of ranks) {
    let total = 0;
    for (const id of rid) total += model.nodes.get(id)!.w + H_GAP;
    total -= H_GAP;
    maxX = Math.max(maxX, total);
    let x = 0;
    let h = 0;
    for (const id of rid) h = Math.max(h, model.nodes.get(id)!.h);
    for (const id of rid) {
      const n = model.nodes.get(id)!;
      cx.set(id, x + n.w / 2);
      cy.set(id, y + h / 2);
      x += n.w + H_GAP;
    }
    y += h + V_GAP;
  }
  for (const rid of ranks) {
    let total = 0;
    for (const id of rid) total += model.nodes.get(id)!.w + H_GAP;
    total -= H_GAP;
    const shift = (maxX - total) / 2;
    for (const id of rid) cx.set(id, cx.get(id)! + shift);
  }

  model.maxX = maxX;
  model.maxY = y - V_GAP + PAD;
  model.cx = cx;
  model.cy = cy;
  model.rank = rank;
  model.ranks = ranks;
  model.horizontal = model.direction === 'LR' || model.direction === 'RL';
}

export function diagramBuildSvg(model: DiagramModel, title: string, forceLR?: boolean): string {
  const arrowId = `arrow-${Math.random().toString(36).slice(2, 8)}`;
  const isLR = forceLR !== undefined ? forceLR : model.horizontal;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  const edgeG: string[] = [];
  model.edges.forEach((e) => {
    const from = model.nodes.get(e.from);
    const to = model.nodes.get(e.to);
    if (!from || !to) return;

    const sx = model.cx.get(e.from)!;
    const sy = model.cy.get(e.from)! + from.h / 2;
    const ex = model.cx.get(e.to)!;
    const ey = model.cy.get(e.to)! - to.h / 2;

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

    const osx = isLR ? sy : sx, osy = isLR ? sx : sy;
    const oex = isLR ? ey : ex, oey = isLR ? ex : ey;
    const omx = isLR ? my : mx, omy = isLR ? mx : my;

    if (!e.directed) {
      d = `M ${P(osx, osy)} L ${P(oex, oey)}`;
    } else if (isLR) {
      const dx = oex - osx;
      const c1x = osx + dx * 0.5, c1y = osy, c2x = oex - dx * 0.5, c2y = oey;
      d = `M ${P(osx, osy)} C ${P(c1x, c1y)} ${P(c2x, c2y)} ${P(oex, oey)}`;
    } else {
      const dy = oey - osy;
      const c1x = osx, c1y = osy + dy * 0.5, c2x = oex, c2y = oey - dy * 0.5;
      d = `M ${P(osx, osy)} C ${P(c1x, c1y)} ${P(c2x, c2y)} ${P(oex, oey)}`;
    }

    const label = e.label;
    let labelSvg = '';
    if (label) {
      const lw = textWidth(label, EDGE_LABEL_SIZE, false) + 14;
      labelSvg =
        `<g class="edge-label" transform="translate(${P(omx, omy)})">` +
        `<rect class="edge-label-bg" x="${-lw / 2}" y="${-EDGE_LABEL_H / 2}" width="${lw}" height="${EDGE_LABEL_H}" rx="6"/>` +
        `<text class="edge-label-text" x="0" y="${EDGE_LABEL_H / 2 - 5}" text-anchor="middle" font-size="${EDGE_LABEL_SIZE}">${esc(label)}</text>` +
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
    minX = Math.min(minX, osx, oex);
    minY = Math.min(minY, osy, oey);
    maxX = Math.max(maxX, osx, oex);
    maxY = Math.max(maxY, osy, oey);
  });

  const nodeG: string[] = [];
  for (const node of model.nodes.values()) {
    const x = model.cx.get(node.id)! - node.w / 2;
    const y = model.cy.get(node.id)! - node.h / 2;
    if (isLR) {
      minX = Math.min(minX, y);
      minY = Math.min(minY, x);
      maxX = Math.max(maxX, y + node.h);
      maxY = Math.max(maxY, x + node.w);
    } else {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + node.w);
      maxY = Math.max(maxY, y + node.h);
    }
    const titleLines = node.titleLines.map((l, i) => {
      const tx = isLR ? model.cy.get(node.id)! : model.cx.get(node.id)!;
      const ty = isLR ? x + PADY + TITLE_H * (i + 1) - 4 : y + PADY + TITLE_H * (i + 1) - 4;
      return `<text class="node-title" ${AT(tx, ty)} text-anchor="middle" font-size="${TITLE_SIZE}" font-weight="700">${esc(l)}</text>`;
    }).join('');
    const subLines = node.subLines.map((l, i) => {
      const tx = isLR ? model.cy.get(node.id)! : model.cx.get(node.id)!;
      const ty = isLR ? x + PADY + TITLE_H * node.titleLines.length + SUB_H * (i + 1) - 3 : y + PADY + TITLE_H * node.titleLines.length + SUB_H * (i + 1) - 3;
      return `<text class="node-sub" ${AT(tx, ty)} text-anchor="middle" font-size="${SUB_SIZE}">${esc(l)}</text>`;
    }).join('');
    const rx = node.shape === 'rounded' ? 22 : 8;
    nodeG.push(
      `<g class="node" data-label-ord="${node.labelOrd}">` +
      `<rect class="node-rect" x="${isLR ? y : x}" y="${isLR ? x : y}" width="${isLR ? node.h : node.w}" height="${isLR ? node.w : node.h}" rx="${rx}"/>` +
      titleLines + subLines +
      `</g>`
    );
  }

  const vb = `${minX - PAD} ${minY - PAD} ${(maxX - minX) + PAD * 2} ${(maxY - minY) + PAD * 2}`;

  const vbW = Math.round((maxX - minX) + PAD * 2);
  const vbH = Math.round((maxY - minY) + PAD * 2);

  const wAttr = isLR ? `width="100%"` : `width="${vbW}"`;
  const hAttr = isLR ? '' : ` height="${vbH}"`;

  return (
    `<svg class="diagram-svg" viewBox="${vb}" ${wAttr}${hAttr} preserveAspectRatio="xMidYMid meet" ` +
    `role="img" aria-label="${esc(title)}" xmlns="${NS}">` +
    `<defs><marker id="${arrowId}" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--accent)"/></marker></defs>` +
    nodeG.join('') + edgeG.join('') +
    `</svg>`
  );
}

function P(x: number, y: number): string {
  return `${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10}`;
}

function AT(x: number, y: number): string {
  return `x="${Math.round(x * 10) / 10}" y="${Math.round(y * 10) / 10}"`;
}
