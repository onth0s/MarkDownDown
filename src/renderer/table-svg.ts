/**
 * Pipe-table → SVG renderer (server-side, no DOM).
 *
 * Text width is approximated via CHAR_WIDTH_PX constant.
 */
import { escHtml as esc } from '../util/escape.js';
import { TABLE as C } from '../constants.js';

const NS = 'http://www.w3.org/2000/svg';

function textWidth(text: string, bold = false): number {
  return text.length * (bold ? C.CHAR_WIDTH_BOLD : C.CHAR_WIDTH);
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface TableModel {
  headers: string[];
  headerOrds: number[];
  rows: string[][];
  rowOrds: number[][];
  labels: Array<{ text: string; offset: number; ord: number }>;
}

// ── Parser ────────────────────────────────────────────────────────────────────

export function tableParse(source: string): TableModel {
  const model: TableModel = {
    headers: [],
    headerOrds: [],
    rows: [],
    rowOrds: [],
    labels: [],
  };

  let pos = 0;
  let ord = 0;
  let seenHeader = false;

  const pushLabel = (text: string, offset: number): number => {
    model.labels.push({ text, offset, ord: ord++ });
    return ord - 1;
  };

  const splitCells = (line: string): string[] =>
    line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

  const isSep = (cells: string[]): boolean =>
    cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));

  const lines = source.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // Skip TITLE: directive if present (handled by compile.ts before calling tableParse)
  for (const line of lines) {
    const off = pos;
    pos += line.length + 1;
    const cells = splitCells(line);
    if (!cells.length || isSep(cells)) continue;

    let linePos = 0;
    const ords: number[] = [];
    for (const cell of cells) {
      const rel = line.indexOf(cell, linePos);
      const idx = rel >= 0 ? rel : linePos;
      ords.push(pushLabel(cell, off + idx));
      linePos = idx + cell.length;
    }

    if (!seenHeader) {
      model.headers = cells;
      model.headerOrds = ords;
      seenHeader = true;
    } else {
      model.rows.push(cells);
      model.rowOrds.push(ords);
    }
  }

  return model;
}

// ── SVG Builder ───────────────────────────────────────────────────────────────

export function tableBuildSvg(model: TableModel, title: string): string {
  const colCount = Math.max(model.headers.length, ...model.rows.map((r) => r.length));
  const colW: number[] = [];
  for (let c = 0; c < colCount; c++) {
    let w = 0;
    if (model.headers[c]) w = Math.max(w, textWidth(model.headers[c], true));
    for (const row of model.rows) {
      if (row[c]) w = Math.max(w, textWidth(row[c]));
    }
    colW[c] = w + C.PADX * 2;
  }

  let x = C.PAD;
  const colX = colW.map((w) => { const v = x; x += w; return v; });
  const gridW = x + C.PAD;

  let y = C.PAD;
  const headY = y; y += C.HEAD_H;
  const rowY: number[] = [];
  for (let r = 0; r < model.rows.length; r++) { rowY.push(y); y += C.ROW_H; }
  const gridH = y + C.PAD;

  let headCells = '';
  model.headers.forEach((text, c) => {
    const cx = colX[c], cw = colW[c];
    headCells +=
      `<g class="tcell" data-label-ord="${model.headerOrds[c]}">` +
      `<rect class="tbl-head-bg" x="${cx}" y="${headY}" width="${cw}" height="${C.HEAD_H}"/>` +
      `<text class="tbl-head-text" x="${cx + C.PADX}" y="${headY + C.HEAD_H / 2 + 4}" ` +
      `font-size="${C.HEAD_FONT_H}" font-weight="700">${esc(text)}</text>` +
      `</g>`;
  });

  let bodyCells = '';
  model.rows.forEach((row, r) => {
    const ry = rowY[r];
    row.forEach((text, c) => {
      const cx = colX[c], cw = colW[c];
      bodyCells +=
        `<g class="tcell" data-label-ord="${model.rowOrds[r][c]}">` +
        `<rect class="tbl-cell-bg" x="${cx}" y="${ry}" width="${cw}" height="${C.ROW_H}"/>` +
        `<text class="tbl-cell-text" x="${cx + C.PADX}" y="${ry + C.ROW_H / 2 + 4}" ` +
        `font-size="${C.FONT_H}">${esc(text)}</text>` +
        `</g>`;
    });
  });

  let grid = '';
  const lastX = colX[colCount - 1] + colW[colCount - 1];
  for (let c = 1; c < colCount; c++) {
    grid += `<line class="tbl-grid" x1="${colX[c]}" y1="${headY}" x2="${colX[c]}" y2="${y}"/>`;
  }
  for (let r = 0; r <= model.rows.length; r++) {
    const gy = r === 0 ? headY : r === model.rows.length ? y : rowY[r - 1];
    grid += `<line class="tbl-grid" x1="${C.PAD}" y1="${gy}" x2="${lastX}" y2="${gy}"/>`;
  }

  return (
    `<svg class="table-svg" viewBox="0 0 ${gridW} ${gridH}" width="${gridW}" height="${gridH}" ` +
    `role="img" aria-label="${esc(title)}" xmlns="${NS}">` +
    headCells + bodyCells + grid +
    `</svg>`
  );
}
