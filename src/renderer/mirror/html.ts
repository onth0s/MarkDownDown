/**
 * HTML generator for Mirror Mode blocks and cards.
 * Produces accessible, reactive markup for Q&A, FAQ, and Semantic Alignment Probes.
 */
import { escHtml } from '../../util/escape.js';
import type { MirrorBlockModel, MirrorKind } from './types.js';

function formatKindLabel(kind: MirrorKind): string {
  switch (kind) {
    case 'qa': return 'Q&A';
    case 'faq': return 'FAQ';
    case 'probe': return 'Semantic Probe';
    case 'clarification': return 'Clarification';
    default: return 'Mirror';
  }
}

const SVG_MIRROR_ICON = `<svg class="mirror-icon-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/><path d="M16 8l4 4-4 4"/><path d="M8 16l-4-4 4-4"/></svg>`;
const SVG_AUTHOR_ICON = `<svg class="mirror-icon-svg author-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>`;
const SVG_DIVERGENCE_ICON = `<svg class="mirror-icon-svg divergence-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;

/**
 * Builds the complete HTML markup for a parsed MirrorBlockModel.
 * Includes both the inline expanded block (visible in Mirror Mode)
 * and the discrete margin pill (visible in Read Mode).
 */
export function mirrorBuildHtml(
  model: MirrorBlockModel,
  _docTitle?: string,
  renderInline?: (text: string) => string,
): string {
  const render = renderInline || escHtml;
  const blockTitle = model.title || formatKindLabel(model.kind);
  const totalItems = model.items.length + model.probes.length;
  const pillLabel = totalItems === 1 ? '1 item' : `${totalItems} items`;
  const kindBadge = formatKindLabel(model.kind);

  let contentHtml = '';

  // 1. Render Q&A / FAQ items
  if (model.items.length > 0) {
    contentHtml += `<div class="mirror-items">`;
    model.items.forEach((item, idx) => {
      contentHtml +=
        `<div class="mirror-qa-card" data-qa-index="${idx}">` +
        `<div class="mirror-q"><span class="mirror-q-prefix">Q:</span> ${render(item.question)}</div>` +
        `<div class="mirror-a"><span class="mirror-a-prefix">A:</span> ${render(item.answer)}</div>` +
        `</div>`;
    });
    contentHtml += `</div>`;
  }

  // 2. Render Semantic Alignment Probes
  if (model.probes.length > 0) {
    contentHtml += `<div class="mirror-probes">`;
    model.probes.forEach((probe, pIdx) => {
      const probeId = `${model.id}-p${pIdx}`;
      let optionsHtml = '';
      let explanationsHtml = '';

      probe.options.forEach((opt, oIdx) => {
        const optId = `${probeId}-opt-${oIdx}`;
        const alignedAttr = opt.isAuthorAligned ? ' data-aligned="true"' : ' data-aligned="false"';
        const expData = opt.explanation ? ` data-explanation="${escHtml(opt.explanation)}"` : '';
        optionsHtml +=
          `<label class="mirror-option" for="${optId}">` +
          `<input type="radio" id="${optId}" name="${probeId}" value="${oIdx}"${alignedAttr}${expData}>` +
          `<span class="mirror-option-radio"></span>` +
          `<span class="mirror-option-text">${render(opt.text)}</span>` +
          `</label>`;

        if (opt.explanation) {
          explanationsHtml += `<div class="mirror-outcome-exp-item" data-opt-idx="${oIdx}" hidden>${render(opt.explanation)}</div>`;
        }
      });

      const outcomeHtml =
        `<div class="mirror-probe-outcome" hidden>` +
        `<div class="mirror-outcome-badge"></div>` +
        `<div class="mirror-outcome-explanations">${explanationsHtml}</div>` +
        `</div>`;

      const authorMeaningHtml =
        `<div class="mirror-author-section">` +
        `<div class="mirror-subhead">${SVG_AUTHOR_ICON}<span>Author's Declared Meaning</span></div>` +
        `<div class="mirror-author-content">${render(probe.authorDeclaredMeaning)}</div>` +
        `</div>`;

      const divergenceHtml = probe.divergenceExplanation
        ? `<div class="mirror-divergence-section">` +
          `<div class="mirror-subhead">${SVG_DIVERGENCE_ICON}<span>Divergence Analysis</span></div>` +
          `<div class="mirror-divergence-content">${render(probe.divergenceExplanation)}</div>` +
          `</div>`
        : '';

      contentHtml +=
        `<div class="mirror-probe-card" id="${probeId}" data-probe-id="${probeId}">` +
        `<div class="mirror-probe-header">` +
        `<span class="mirror-probe-tag">Alignment Probe</span>` +
        `<div class="mirror-probe-claim">${render(probe.claim)}</div>` +
        `</div>` +
        `<div class="mirror-probe-options">${optionsHtml}</div>` +
        `<div class="mirror-probe-controls">` +
        `<button type="button" class="mirror-eval-btn" data-probe-target="${probeId}">Compare with Author's Meaning</button>` +
        `</div>` +
        `<div class="mirror-probe-reveal" hidden>` +
        outcomeHtml +
        authorMeaningHtml +
        divergenceHtml +
        `<div class="mirror-audit-prompt">Self-Audit: How does your reading map to the author's declared distinction?</div>` +
        `<div class="mirror-audit-actions">` +
        `<button type="button" class="mirror-audit-btn align-yes" data-action="understood" data-probe="${probeId}">✓ I understand the author's distinction</button>` +
        `<button type="button" class="mirror-audit-btn align-misread" data-action="misread" data-probe="${probeId}">↻ I misread it, now clear</button>` +
        `<button type="button" class="mirror-audit-btn align-disagree" data-action="disagree" data-probe="${probeId}">⚡ I understand, but disagree with the premise</button>` +
        `</div>` +
        `<div class="mirror-audit-status" hidden></div>` +
        `</div>` +
        `</div>`;
    });
    contentHtml += `</div>`;
  }

  // 3. Reader Questions Section (Document-native reader query logger)
  const readerSectionHtml =
    `<div class="mirror-reader-section" data-parent-mirror="${model.id}">` +
    `<div class="mirror-reader-header">` +
    `<span class="mirror-reader-title">Reader Questions & Notes</span>` +
    `<button type="button" class="mirror-reader-toggle-btn" aria-expanded="false">+ Add Question</button>` +
    `</div>` +
    `<div class="mirror-reader-body" hidden>` +
    `<textarea class="mirror-reader-input" placeholder="Record a question or reflection on this passage..." rows="2"></textarea>` +
    `<div class="mirror-reader-actions">` +
    `<button type="button" class="mirror-reader-submit-btn">Save Note</button>` +
    `</div>` +
    `</div>` +
    `<ul class="mirror-reader-notes-list" aria-live="polite"></ul>` +
    `</div>`;

  // 4. Combine into complete .mirror-block markup
  const safeTitle = escHtml(blockTitle);
  const targetAttr = model.target ? ` data-target="${escHtml(model.target)}"` : '';
  const targetIdAttr = model.targetId ? ` data-target-id="${escHtml(model.targetId)}"` : '';
  const targetLocatorHtml = model.targetId
    ? `<a href="#${escHtml(model.targetId)}" class="mirror-target-locator" data-target-id="${escHtml(model.targetId)}" title="Jump to anchored section: #${escHtml(model.targetId)}" aria-label="Jump to #${escHtml(model.targetId)}">` +
      `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>` +
      `<span>#${escHtml(model.targetId)}</span>` +
      `</a>`
    : '';

  return (
    `<aside class="mirror-block" id="${model.id}" data-mirror-id="${model.id}" data-kind="${model.kind}" data-count="${totalItems}"${targetAttr}${targetIdAttr} aria-label="${safeTitle}">` +
    `<button type="button" class="mirror-margin-pill" data-target-mirror="${model.id}" title="Click to view ${safeTitle} in Read Mode" aria-label="Toggle ${safeTitle}">` +
    `<span class="mirror-pill-icon">${SVG_MIRROR_ICON}</span>` +
    `<span class="mirror-pill-label">${kindBadge}</span>` +
    `<span class="mirror-pill-count">${pillLabel}</span>` +
    `</button>` +
    `<div class="mirror-card">` +
    `<div class="mirror-card-header">` +
    `<div class="mirror-header-title">` +
    `<span class="mirror-card-badge">${kindBadge}</span>` +
    `<span class="mirror-card-heading">${safeTitle}</span>` +
    targetLocatorHtml +
    `</div>` +
    `<button type="button" class="mirror-card-close-btn" data-target-mirror="${model.id}" aria-label="Close card" title="Close">×</button>` +
    `</div>` +
    `<div class="mirror-card-body">` +
    contentHtml +
    readerSectionHtml +
    `</div>` +
    `</div>` +
    `</aside>`
  );
}
