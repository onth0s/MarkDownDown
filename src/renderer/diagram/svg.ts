import { DIAGRAM as C } from '../../constants.js';
import { escHtml } from '../../util/escape.js';
import {
  buildArrowMarker,
  coordPair,
  round1,
  textWidth,
  xyAttrs,
} from '../svg-helpers.js';
import type { DiagramModel, DiagramNode } from './types.js';
import { checkBoxesOverlap } from './layout.js';

const NS = 'http://www.w3.org/2000/svg';

function hashString(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Deterministic arrow-marker id derived from the model, title, and orientation.
 * Keeps compiled output reproducible so rebuilds are byte-identical.
 */
function arrowIdFor(model: DiagramModel, title: string, isLR: boolean): string {
  const parts = [title, isLR ? 'lr' : 'tb'];
  for (const node of model.nodes.values()) {
    parts.push(node.id, node.shape, node.label, node.subtitle);
  }
  for (const edge of model.edges) {
    parts.push(edge.from, edge.to, String(edge.directed), edge.label);
  }
  return `arrow-${hashString(parts.join('|'))}`;
}

export function diagramBuildSvg(model: DiagramModel, title: string, forceHorizontal?: boolean): string {
  const isLR = forceHorizontal !== undefined ? forceHorizontal : model.horizontal;
  const arrowId = arrowIdFor(model, title, isLR);
  return isLR ? buildLrSvg(model, title, arrowId) : buildTbSvg(model, title, arrowId);
}

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
    const ey = model.cy.get(e.to)! - to.h / 2 - (e.directed ? C.ARROW_OFFSET : 0);

    let d: string;
    let mx: number, my: number;
    if (e.isBackEdge) {
      if (e.from === e.to) {
        const loopR = to.w / 2 + C.ARC_LOOP;
        const c1x = sx + loopR, c1y = sy, c2x = sx + loopR, c2y = ey;
        mx = (sx + 3 * c1x + 3 * c2x + ex) / 8;
        my = (sy + 3 * c1y + 3 * c2y + ey) / 8;
        d = `M ${coordPair(sx, sy)} C ${coordPair(c1x, c1y)} ${coordPair(c2x, c2y)} ${coordPair(ex, ey)}`;
        maxX = Math.max(maxX, sx + loopR);
      } else {
        const loopY = model.maxY + C.ARC_LOOP;
        const c1x = sx, c1y = loopY, c2x = ex, c2y = loopY;
        mx = (sx + 3 * c1x + 3 * c2x + ex) / 8;
        my = (sy + 3 * c1y + 3 * c2y + ey) / 8;
        d = `M ${coordPair(sx, sy)} C ${coordPair(c1x, c1y)} ${coordPair(c2x, c2y)} ${coordPair(ex, ey)}`;
        maxY = Math.max(maxY, loopY);
      }
    } else if (!e.directed) {
      mx = (sx + ex) / 2;
      my = (sy + ey) / 2;
      d = `M ${coordPair(sx, sy)} L ${coordPair(ex, ey)}`;
    } else {
      const dy = ey - sy;
      const c1x = sx, c1y = sy + dy * 0.5, c2x = ex, c2y = ey - dy * 0.5;
      mx = (sx + 3 * c1x + 3 * c2x + ex) / 8;
      my = (sy + 3 * c1y + 3 * c2y + ey) / 8;
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
    const pathCls = e.isBackEdge ? 'edge-path is-back-edge' : 'edge-path';
    edgeG.push(
      `<g class="edge"${ordAttr}>` +
      `<path class="${pathCls}" d="${d}" marker-end="url(#${arrowId})"/>` +
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

  const baseTotalW = Math.round(lrX - C.LR_H_GAP + C.PAD);
  const baseTotalH = Math.round(Math.max(...nodeData.map(n => n.h)) + C.PAD * 2);
  const midY = baseTotalH / 2;

  for (const nd of nodeData) {
    nd.lrY = midY;
  }

  // Validate no node overlap in LR layout
  checkBoxesOverlap(
    nodeData.map(nd => ({ id: nd.id, cx: nd.lrX, cy: nd.lrY, w: nd.w, h: nd.h })),
    'horizontal layout',
  );

  const nodeById = new Map<string, typeof nodeData[0]>();
  for (const nd of nodeData) {
    nodeById.set(nd.id, nd);
  }

  const edgeInfo: Array<{ d: string; omx: number; omy: number; label: string; labelOrd: number; backEdge: boolean }> = [];
  let maxRight = baseTotalW;
  let maxBottom = baseTotalH;
  model.edges.forEach(e => {
    const fromNd = nodeById.get(e.from)!;
    const toNd = nodeById.get(e.to)!;
    if (!fromNd || !toNd) return;

    const sx = fromNd.lrX + fromNd.w / 2;
    const sy = fromNd.lrY;
    const ex = toNd.lrX - toNd.w / 2 - (e.directed ? C.ARROW_OFFSET : 0);
    const ey = toNd.lrY;

    let d: string;
    let omx: number, omy: number;
    if (e.isBackEdge && e.from === e.to) {
      const loopR = toNd.h / 2 + C.ARC_LOOP;
      const c1x = sx, c1y = sy + loopR, c2x = sx, c2y = sy + loopR;
      omx = (sx + 3 * c1x + 3 * c2x + ex) / 8;
      omy = (sy + 3 * c1y + 3 * c2y + ey) / 8;
      d = `M ${coordPair(sx, sy)} C ${coordPair(c1x, c1y)} ${coordPair(c2x, c2y)} ${coordPair(ex, ey)}`;
      maxBottom = Math.max(maxBottom, sy + 1.5 * loopR);
    } else if (e.isBackEdge) {
      const loopX = baseTotalW + C.ARC_LOOP;
      const c1x = loopX, c1y = sy, c2x = loopX, c2y = ey;
      omx = (sx + 3 * c1x + 3 * c2x + ex) / 8;
      omy = (sy + 3 * c1y + 3 * c2y + ey) / 8;
      d = `M ${coordPair(sx, sy)} C ${coordPair(c1x, c1y)} ${coordPair(c2x, c2y)} ${coordPair(ex, ey)}`;
      maxRight = Math.max(maxRight, loopX);
    } else if (!e.directed) {
      omx = (sx + ex) / 2;
      omy = (sy + ey) / 2;
      d = `M ${coordPair(sx, sy)} L ${coordPair(ex, ey)}`;
    } else {
      const dx = ex - sx;
      d = `M ${coordPair(sx, sy)} C ${coordPair(sx + dx * 0.5, sy)} ${coordPair(ex - dx * 0.5, ey)} ${coordPair(ex, ey)}`;
      omx = (sx + ex) / 2;
      omy = (sy + ey) / 2;
    }

    edgeInfo.push({ d, omx, omy, label: e.label, labelOrd: e.labelOrd, backEdge: !!e.isBackEdge });
  });

  const totalW = Math.max(baseTotalW, Math.round(maxRight));
  const totalH = Math.max(baseTotalH, Math.round(maxBottom));

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
    const pathCls = ed.backEdge ? 'edge-path is-back-edge' : 'edge-path';
    return `<g class="edge"${ordAttr}><path class="${pathCls}" d="${pathD}" marker-end="url(#${arrowId})"/>${labelSvg}</g>`;
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
