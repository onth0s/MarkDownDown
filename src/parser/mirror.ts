/**
 * markdown-it fence rule for ```mirror blocks.
 */
import type MarkdownIt from 'markdown-it';
import { createFenceRenderer } from './fence-wrapper.js';

export function mirrorPlugin(md: MarkdownIt): void {
  createFenceRenderer(md, { kind: 'mirror', renderDivClass: 'mirror-render' });
}
