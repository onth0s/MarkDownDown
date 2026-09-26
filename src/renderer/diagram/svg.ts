import { DIAGRAM as C } from '../../constants.js';
import { escHtml } from '../../util/escape.js';
import {
  buildArrowMarker,
  buildBackArrowMarker,
  coordPair,
  round1,
  xyAttrs,
} from '../svg-helpers.js';
import { renderFormattedTspans } from '../inline-markdown.js';
import { resolveGeometry, type DiagramGeometry, type Orientation, type PlacedNode } from './geometry.js';
import type { DiagramModel } from './types.js';

const NS = 'http://www.w3.org/2000/svg';

function hashString(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Deterministic marker ids derived from the model, title, and orientation.
 * Keeps compiled output reproducible so rebuilds are byte-identical.
 */
function markerIdsFor(model: DiagramModel, title: string, orientation: Orientation): { main: string; back: string } {
  const parts = [title, orientation];
  for (const node of model.nodes.values()) {
    parts.push(node.id, node.shape, node.label, node.subtitle);
  }
  for (const edge of model.edges) {
    parts.push(edge.from, edge.to, String(edge.directed), edge.label);
  }
  const digest = hashString(parts.join('|'));
  return { main: `arrow-${digest}`, back: `arrowback-${digest}` };
}

export function diagramBuildSvg(model: DiagramModel, title: string, forceHorizontal?: boolean): string {
  const orientation: Orientation =
    forceHorizontal !== undefined ? (forceHorizontal ? 'LR' : 'TB') : model.horizontal ? 'LR' : 'TB';
  const geometry = resolveGeometry(model, orientation);
  return serialize(geometry, title, markerIdsFor(model, title, orientation));
}

/** Baseline Y for a node text line, shared by both orientations. */
function titleTextY(p: PlacedNode, index: number): number {
  const metrics = p.node.metrics;
  const line = metrics?.lines[index];
  const dy = line ? line.dy : index * C.TITLE_H;
  return p.cy + dy;
}

function subTextY(p: PlacedNode, index: number): number {
  const metrics = p.node.metrics;
  const line = metrics?.lines[(p.node.titleLines.length) + index];
  const dy = line ? line.dy : index * C.SUB_H;
  return p.cy + dy;
}

function nodeShapeSvg(p: PlacedNode): string {
  const { node, cx, cy } = p;
  const x = cx - node.w / 2;
  const y = cy - node.h / 2;
  if (node.shape === 'diamond') {
    const pts = `${round1(cx)},${round1(y)} ${round1(cx + node.w / 2)},${round1(cy)} ${round1(cx)},${round1(y + node.h)} ${round1(x)},${round1(cy)}`;
    return `<polygon class="node-rect node-diamond" points="${pts}"/>`;
  }
  if (node.shape === 'rounded') {
    return `<rect class="node-rect node-rounded" x="${round1(x)}" y="${round1(y)}" width="${round1(node.w)}" height="${round1(node.h)}" rx="18"/>`;
  }
  return `<rect class="node-rect" x="${round1(x)}" y="${round1(y)}" width="${round1(node.w)}" height="${round1(node.h)}" rx="3"/>`;
}

function nodeTextSvg(p: PlacedNode): string {
  const { node, cx } = p;
  const title = node.titleLines
    .map((l, i) => {
      const formatted = renderFormattedTspans(l, {
        codeClass: 'diag-code-span',
        strikeClass: 'diag-strike-span',
        parentBold: true,
      });
      return `<text class="node-title" ${xyAttrs(cx, titleTextY(p, i))} text-anchor="middle" font-size="${C.TITLE_SIZE}" font-weight="700">${formatted}</text>`;
    })
    .join('');
  const sub = node.subLines
    .map((l, i) => {
      const formatted = renderFormattedTspans(l, {
        codeClass: 'diag-code-span',
        strikeClass: 'diag-strike-span',
      });
      return `<text class="node-sub" ${xyAttrs(cx, subTextY(p, i))} text-anchor="middle" font-size="${C.SUB_SIZE}">${formatted}</text>`;
    })
    .join('');
  return title + sub;
}

/**
 * Set the legibility floor used by `templates/style.css`.
 *
 * `max-width:100%` lets a wide diagram shrink to any size the viewport demands,
 * which on a phone turns an 11px edge label into unreadable mush. Publishing the
 * floor as a custom property means the drawing scales down to 60% of its natural
 * width and then scrolls, instead of shrinking without limit.
 */
function scaleFloorStyle(naturalW: number): string {
  return `--svg-min-w:${Math.round(naturalW * C.MIN_SCALE)}px`;
}

function serialize(
  geometry: DiagramGeometry,
  title: string,
  markers: { main: string; back: string }
): string {
  const nodeG = geometry.nodes.map(p => {
    const ord = p.node.labelOrd;
    const ordAttr = ord >= 0 ? ` data-label-ord="${ord}"` : '';
    return `<g class="node"${ordAttr}>` + nodeShapeSvg(p) + nodeTextSvg(p) + `</g>`;
  });

  const edgeG = geometry.edges.map(({ edge, route, label }) => {
    // `marker-end` is emitted only for directed edges: `---` is documented as an
    // undirected line with no arrowhead, and it previously drew one anyway.
    const markerId = edge.isBackEdge ? markers.back : markers.main;
    const markerAttr = edge.directed ? ` marker-end="url(#${markerId})"` : '';
    const pathCls = edge.isBackEdge ? 'edge-path is-back-edge' : 'edge-path';

    let labelSvg = '';
    if (label) {
      const formatted = renderFormattedTspans(label.text, {
        codeClass: 'diag-code-span',
        strikeClass: 'diag-strike-span',
      });
      const baseline = C.EDGE_LABEL_SIZE * 0.35;
      labelSvg =
        `<g class="edge-label" transform="translate(${coordPair(label.x, label.y)})">` +
        `<rect class="edge-label-bg" x="${round1(-label.w / 2)}" y="${round1(-label.h / 2)}" width="${round1(label.w)}" height="${round1(label.h)}" rx="6"/>` +
        `<text class="edge-label-text" x="0" y="${round1(baseline)}" text-anchor="middle" font-size="${C.EDGE_LABEL_SIZE}">${formatted}</text>` +
        `</g>`;
    }

    const ord = edge.labelOrd;
    const ordAttr = ord >= 0 ? ` data-label-ord="${ord}"` : '';
    return `<g class="edge"${ordAttr}><path class="${pathCls}" d="${route.d}"${markerAttr}/>${labelSvg}</g>`;
  });

  // The viewBox is the union of node boxes, sampled edge ink and label boxes.
  // Deriving it from endpoints and control points instead both over-stated the
  // drawing (dead space) and, because labels were ignored, clipped them.
  const { ink } = geometry;
  const rawW = ink.maxX - ink.minX + C.PAD * 2;
  const rawH = ink.maxY - ink.minY + C.PAD * 2;
  const vbX = round1(ink.minX - C.PAD);
  const vbY = round1(ink.minY - C.PAD);
  const vbW = round1(rawW);
  const vbH = round1(rawH);

  return (
    `<svg class="diagram-svg" viewBox="${vbX} ${vbY} ${vbW} ${vbH}" width="${vbW}" height="${vbH}" ` +
    `preserveAspectRatio="xMidYMid meet" style="${scaleFloorStyle(rawW)}" ` +
    `role="img" aria-label="${escHtml(title)}" xmlns="${NS}">` +
    buildArrowMarker(markers.main) +
    buildBackArrowMarker(markers.back) +
    nodeG.join('') + edgeG.join('') +
    `</svg>`
  );
}
