/**
 * markdown-it fence rule for ```diagram blocks.
 */
import type MarkdownIt from 'markdown-it';
import { createFenceRenderer } from './fence-wrapper.js';

export function diagramPlugin(md: MarkdownIt): void {
  createFenceRenderer(md, { kind: 'diagram', aliases: ['mermaid'], renderDivClass: 'diagram-render' });
}
