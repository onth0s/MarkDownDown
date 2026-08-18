/**
 * markdown-it fence rule for ```table blocks.
 */
import type MarkdownIt from 'markdown-it';
import { createFenceRenderer } from './fence-wrapper.js';

export function tablePlugin(md: MarkdownIt): void {
  createFenceRenderer(md, { kind: 'table', renderDivClass: 'table-render' });
}
