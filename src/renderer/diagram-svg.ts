/**
 * Diagram DSL → SVG renderer (server-side, no DOM).
 *
 * Ports diagramParse / diagramLayout / diagramBuildSvg from
 * CLDS_interactive_v15.html. Text width is approximated using a constant
 * character width; no canvas or DOM required.
 */
import { escHtml as esc } from '../util/escape.js';
import { DIAGRAM as C } from '../constants.js';

const NS = 'http://www.w3.org/2000/svg';

let arrowCounter = 0;

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
        x: 0, y: 0, w: C.MIN_W, h: 36,
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
        let m: RegExpMatchArray | null = null;
        let shape: NodeShape = 'rect';
        const im1 = raw.match(/^([A-Za-z0-9_.\\-]+)\["?([^"]+)"?\]$/);
        const im2 = raw.match(/^([A-Za-z0-9_.\\-]+)\(["']?(.+?)["']?\)$/);
        const im3 = raw.match(/^([A-Za-z0-9_.\\-]+)\{["']?(.+?)["']?\}$/);
        if (im1) { m = im1; shape = 'rect'; }
        else if (im2) { m = im2; shape = 'rounded'; }
        else if (im3) { m = im3; shape = 'diamond'; }
        if (m) {
          ensureNode(m[1], m[2], shape);
          return m[1];
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

    let nodeMatched = false;
    let nFull: RegExpMatchArray | null = null;
    let nShape: NodeShape = 'rect';
    const nm1 = line.match(/^([A-Za-z0-9_.\\-]+)\["?([^"]+)"?\]$/);
    const nm2 = line.match(/^([A-Za-z0-9_.\\-]+)\(["']?(.+?)["']?\)$/);
    const nm3 = line.match(/^([A-Za-z0-9_.\\-]+)\{["']?(.+?)["']?\}$/);
    if (nm1) { nFull = nm1; nShape = 'rect'; nodeMatched = true; }
    else if (nm2) { nFull = nm2; nShape = 'rounded'; nodeMatched = true; }
    else if (nm3) { nFull = nm3; nShape = 'diamond'; nodeMatched = true; }
    if (nodeMatched && nFull) {
      ensureNode(nFull[1], nFull[2], nShape);
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
}

export function diagramBuildSvg(model: DiagramModel, title: string, forceLR?: boolean): string {
  const arrowId = `arrow-${arrowCounter++}`;
  const isLR = forceLR !== undefined ? forceLR : model.horizontal;

  if (isLR) {
    return buildLrSvg(model, title, arrowId);
  }

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

    if (!e.directed) {
      d = `M ${P(sx, sy)} L ${P(ex, ey)}`;
    } else {
      const dy = ey - sy;
      const c1x = sx, c1y = sy + dy * 0.5, c2x = ex, c2y = ey - dy * 0.5;
      d = `M ${P(sx, sy)} C ${P(c1x, c1y)} ${P(c2x, c2y)} ${P(ex, ey)}`;
    }

    const label = e.label;
    let labelSvg = '';
    if (label) {
      const lw = textWidth(label, C.EDGE_LABEL_SIZE, false) + 14;
      labelSvg =
        `<g class="edge-label" transform="translate(${P(mx, my)})">` +
        `<rect class="edge-label-bg" x="${-lw / 2}" y="${-C.EDGE_LABEL_H / 2}" width="${lw}" height="${C.EDGE_LABEL_H}" rx="6"/>` +
        `<text class="edge-label-text" x="0" y="${C.EDGE_LABEL_H / 2 - 5}" text-anchor="middle" font-size="${C.EDGE_LABEL_SIZE}">${esc(label)}</text>` +
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
      return `<text class="node-title" ${AT(tx, ty)} text-anchor="middle" font-size="${C.TITLE_SIZE}" font-weight="700">${esc(l)}</text>`;
    }).join('');
    const subLines = node.subLines.map((l, i) => {
      const tx = model.cx.get(node.id)!;
      const ty = y + C.PADY + C.TITLE_H * node.titleLines.length + C.SUB_H * (i + 1) - 3;
      return `<text class="node-sub" ${AT(tx, ty)} text-anchor="middle" font-size="${C.SUB_SIZE}">${esc(l)}</text>`;
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
    `role="img" aria-label="${esc(title)}" xmlns="${NS}">` +
    `<defs><marker id="${arrowId}" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--accent)"/></marker></defs>` +
    nodeG.join('') + edgeG.join('') +
    `</svg>`
  );
}

function buildLrSvg(model: DiagramModel, title: string, arrowId: string): string {
  const REF = C.LR_REF_W;

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

  const totalW = lrX - C.LR_H_GAP + C.PAD;
  const totalH = Math.max(...nodeData.map(n => n.h)) + C.PAD * 2;
  const sc = REF / totalW;
  const W = Math.round(totalW * sc);
  const H = Math.round(totalH * sc);
  const midY = totalH / 2;

  for (const nd of nodeData) {
    nd.lrY = midY;
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
    const ex = toNd.lrX - toNd.w / 2;
    const ey = toNd.lrY;

    let d: string;
    if (!e.directed) {
      d = `M ${P(sx, sy)} L ${P(ex, ey)}`;
    } else {
      const dx = ex - sx;
      d = `M ${P(sx, sy)} C ${P(sx + dx * 0.5, sy)} ${P(ex - dx * 0.5, ey)} ${P(ex, ey)}`;
    }

    const omx = (sx + ex) / 2;
    const omy = (sy + ey) / 2;
    edgeInfo.push({ d, omx, omy, label: e.label, labelOrd: e.labelOrd });
  });

  const Sx = (v: number) => v * sc;
  const Sy = (v: number) => v * sc;

  const edgeG: string[] = edgeInfo.map(ed => {
    let labelSvg = '';
    if (ed.label) {
      const lw = (textWidth(ed.label, C.EDGE_LABEL_SIZE, false) + 14) * sc;
      const lx = Sx(ed.omx), ly = Sy(ed.omy);
      labelSvg =
        `<g class="edge-label" transform="translate(${P(lx, ly)})">` +
        `<rect class="edge-label-bg" x="${R(-lw / 2)}" y="${R(-C.EDGE_LABEL_H * sc / 2)}" width="${R(lw)}" height="${R(C.EDGE_LABEL_H * sc)}" rx="6"/>` +
        `<text class="edge-label-text" x="0" y="${R(C.EDGE_LABEL_H * sc / 2 - 4)}" text-anchor="middle" font-size="${C.EDGE_LABEL_SIZE}">${esc(ed.label)}</text>` +
        `</g>`;
    }
    const pathD = ed.d.replace(/([0-9.]+) ([0-9.]+)/g, (_, x: string, y: string) => `${P(Sx(+x), Sy(+y))}`);
    const ordAttr = ed.labelOrd !== undefined ? ` data-label-ord="${ed.labelOrd}"` : '';
    return `<g class="edge"${ordAttr}><path class="edge-path" d="${pathD}" marker-end="url(#${arrowId})"/>${labelSvg}</g>`;
  });

  const nodeG: string[] = nodeData.map(nd => {
    const cx = Sx(nd.lrX), cy = Sy(nd.lrY);
    const w = nd.w * sc, h = nd.h * sc;
    const titleLines = nd.titleLines.map((l, i) => {
      const ty = cy - h / 2 + C.PADY * sc + C.TITLE_H * sc * (i + 1) - 4 * sc;
      return `<text class="node-title" x="${R(cx)}" y="${R(ty)}" text-anchor="middle" font-size="${C.TITLE_SIZE}" font-weight="700">${esc(l)}</text>`;
    }).join('');
    const subLines = nd.subLines.map((l, i) => {
      const ty = cy - h / 2 + C.PADY * sc + C.TITLE_H * sc * nd.titleLines.length + C.SUB_H * sc * (i + 1) - 3 * sc;
      return `<text class="node-sub" x="${R(cx)}" y="${R(ty)}" text-anchor="middle" font-size="${C.SUB_SIZE}">${esc(l)}</text>`;
    }).join('');
    return `<g class="node" data-label-ord="${nd.labelOrd}"><rect class="node-rect" x="${R(cx - w / 2)}" y="${R(cy - h / 2)}" width="${R(w)}" height="${R(h)}" rx="${nd.rx}"/>${titleLines}${subLines}</g>`;
  });

  return (
    `<svg class="diagram-svg" width="${W}" height="${H}" ` +
    `role="img" aria-label="${esc(title)}" xmlns="${NS}">` +
    `<defs><marker id="${arrowId}" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--accent)"/></marker></defs>` +
    nodeG.join('') + edgeG.join('') +
    `</svg>`
  );
}

function R(v: number): string {
  return String(Math.round(v * 10) / 10);
}

function P(x: number, y: number): string {
  return `${R(x)} ${R(y)}`;
}

function AT(x: number, y: number): string {
  return `x="${R(x)}" y="${R(y)}"`;
}
