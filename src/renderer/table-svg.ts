/**
 * Pipe-table → SVG renderer (server-side, no DOM).
 *
 * Cell text is measured with the shared calibrated metrics in `text-metrics.ts`
 * and wrapped inside a bounded column, so one long cell can no longer stretch
 * the table past the reading column.
 */
import { escHtml as esc } from '../util/escape.js';
import { TABLE as C } from '../constants.js';
import { renderFormattedTspans } from './inline-markdown.js';
import { measureInline, wrapToWidth } from './text-metrics.js';
import { round1 } from './svg-helpers.js';

const NS = 'http://www.w3.org/2000/svg';

/** One laid-out cell: its wrapped lines and the width they need. */
interface CellLayout {
  lines: string[];
  /** Measured width of the widest line, excluding cell padding. */
  width: number;
  lineH: number;
}

/**
 * Wrap a cell's text to the bounded column width.
 *
 * Previously a cell was measured with a flat per-character rate and never
 * wrapped, so a single long cell set the width of the whole table and pushed the
 * SVG past the reading column.
 */
function layoutCell(text: string, bold: boolean): CellLayout {
  const size = bold ? C.HEAD_FONT_SIZE : C.FONT_SIZE;
  const lineH = bold ? C.HEAD_LINE_H : C.LINE_H;
  const maxTextW = Math.max(24, C.MAX_COL_TEXT_W - C.PADX * 2);
  const lines = wrapToWidth(text, size, maxTextW, { bold });
  let width = 0;
  for (const line of lines) {
    const w = measureInline(line, size, { bold });
    if (w > width) width = w;
  }
  return { lines, width: Math.ceil(width), lineH };
}

/** Height a cell needs for its content, never below the minimum row height. */
function cellHeight(layout: CellLayout, minH: number): number {
  return Math.max(minH, layout.lines.length * layout.lineH + C.PADV * 2);
}

/**
 * Baseline Y for the first line of a vertically centred block of `lines`.
 *
 * The `dy` chain on the tspans steps by the full line height, so the first
 * baseline has to sit a little below the visual centre of its own line box or
 * the whole block reads as sitting too high in its cell.
 */
function firstBaseline(cellTop: number, cellH: number, layout: CellLayout, fontSize: number): string {
  const blockH = layout.lines.length * layout.lineH;
  return round1(cellTop + (cellH - blockH) / 2 + layout.lineH * 0.5 + fontSize * 0.35);
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

  // Skip TITLE: directive if present
  for (const line of lines) {
    const off = pos;
    pos += line.length + 1;
    if (line.toUpperCase().startsWith('TITLE:')) continue;
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

  // Lay every cell out first, so column widths and row heights both derive from
  // one measurement pass and stay consistent with each other.
  const headLayouts: CellLayout[] = [];
  for (let c = 0; c < colCount; c++) {
    headLayouts.push(
      model.headers[c]
        ? layoutCell(model.headers[c], true)
        : { lines: [], width: 0, lineH: C.HEAD_LINE_H }
    );
  }
  const bodyLayouts: CellLayout[][] = model.rows.map((row) => {
    const line: CellLayout[] = [];
    for (let c = 0; c < colCount; c++) {
      line.push(
        row[c] ? layoutCell(row[c], false) : { lines: [], width: 0, lineH: C.LINE_H }
      );
    }
    return line;
  });

  const colW: number[] = [];
  for (let c = 0; c < colCount; c++) {
    let w = headLayouts[c].width;
    for (const row of bodyLayouts) w = Math.max(w, row[c].width);
    colW[c] = w + C.PADX * 2;
  }

  // A row grows to fit the tallest cell in it, so wrapped content is never
  // drawn on top of the next row.
  let headH: number = C.HEAD_H;
  for (const l of headLayouts) headH = Math.max(headH, cellHeight(l, C.HEAD_H));
  const rowH: number[] = bodyLayouts.map((row) => {
    let h: number = C.ROW_H;
    for (const l of row) h = Math.max(h, cellHeight(l, C.ROW_H));
    return h;
  });

  let x = C.PAD;
  const colX = colW.map((w) => { const v = x; x += w; return v; });
  const gridW = x + C.PAD;

  let y = C.PAD;
  const headY = y;
  y += headH;
  const rowY: number[] = [];
  for (let r = 0; r < model.rows.length; r++) { rowY.push(y); y += rowH[r]; }
  const gridH = y + C.PAD;

  let headCells = '';
  model.headers.forEach((_text, c) => {
    const cx = colX[c], cw = colW[c];
    const layout = headLayouts[c];
    const tspans = layout.lines
      .map(
        (line, i) =>
          `<tspan x="${cx + C.PADX}" dy="${i === 0 ? 0 : layout.lineH}">` +
          renderFormattedTspans(line, {
            codeClass: 'tbl-code-span',
            strikeClass: 'tbl-strike-span',
            parentBold: true,
          }) +
          `</tspan>`
      )
      .join('');
    headCells +=
      `<g class="tcell" data-label-ord="${model.headerOrds[c]}">` +
      `<rect class="tbl-head-bg" x="${cx}" y="${headY}" width="${cw}" height="${headH}"/>` +
      `<text class="tbl-head-text" x="${cx + C.PADX}" y="${firstBaseline(headY, headH, layout, C.HEAD_FONT_SIZE)}" ` +
      `font-size="${C.HEAD_FONT_SIZE}" font-weight="700">${tspans}</text>` +
      `</g>`;
  });

  let bodyCells = '';
  model.rows.forEach((row, r) => {
    const ry = rowY[r];
    const h = rowH[r];
    row.forEach((_text, c) => {
      const cx = colX[c], cw = colW[c];
      const layout = bodyLayouts[r][c];
      const tspans = layout.lines
        .map(
          (line, i) =>
            `<tspan x="${cx + C.PADX}" dy="${i === 0 ? 0 : layout.lineH}">` +
            renderFormattedTspans(line, { codeClass: 'tbl-code-span', strikeClass: 'tbl-strike-span' }) +
            `</tspan>`
        )
        .join('');
      bodyCells +=
        `<g class="tcell" data-label-ord="${model.rowOrds[r][c]}">` +
        `<rect class="tbl-cell-bg" x="${cx}" y="${ry}" width="${cw}" height="${h}"/>` +
        `<text class="tbl-cell-text" x="${cx + C.PADX}" y="${firstBaseline(ry, h, layout, C.FONT_SIZE)}" ` +
        `font-size="${C.FONT_SIZE}">${tspans}</text>` +
        `</g>`;
    });
  });

  let grid = '';
  const lastX = colX[colCount - 1] + colW[colCount - 1];
  for (let c = 1; c < colCount; c++) {
    grid += `<line class="tbl-grid" x1="${colX[c]}" y1="${headY}" x2="${colX[c]}" y2="${y}"/>`;
  }
  // Horizontal grid lines: top of header, bottom of header (top of row 0), bottom of each row
  grid += `<line class="tbl-grid" x1="${C.PAD}" y1="${headY}" x2="${lastX}" y2="${headY}"/>`;
  for (let r = 0; r < model.rows.length; r++) {
    grid += `<line class="tbl-grid" x1="${C.PAD}" y1="${rowY[r]}" x2="${lastX}" y2="${rowY[r]}"/>`;
  }
  grid += `<line class="tbl-grid" x1="${C.PAD}" y1="${y}" x2="${lastX}" y2="${y}"/>`;

  return (
    `<svg class="table-svg" viewBox="0 0 ${gridW} ${gridH}" width="${gridW}" height="${gridH}" ` +
    `style="--svg-min-w:${Math.round(gridW * C.MIN_SCALE)}px" ` +
    `role="img" aria-label="${esc(title)}" xmlns="${NS}">` +
    headCells + bodyCells + grid +
    `</svg>`
  );
}
