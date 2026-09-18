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

/**
 * Builds the complete HTML markup for a parsed MirrorBlockModel.
 * Includes both the inline expanded block (visible in Mirror Mode)
 * and the discrete margin pill (visible in Read Mode).
 */
export function mirrorBuildHtml(model: MirrorBlockModel, _docTitle?: string): string {
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
        `<div class="mirror-q"><span class="mirror-q-prefix">Q:</span> ${escHtml(item.question)}</div>` +
        `<div class="mirror-a"><span class="mirror-a-prefix">A:</span> ${escHtml(item.answer)}</div>` +
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
      probe.options.forEach((opt, oIdx) => {
        const optId = `${probeId}-opt-${oIdx}`;
        const alignedAttr = opt.isAuthorAligned ? ' data-aligned="true"' : ' data-aligned="false"';
        const expData = opt.explanation ? ` data-explanation="${escHtml(opt.explanation)}"` : '';
        optionsHtml +=
          `<label class="mirror-option" for="${optId}">` +
          `<input type="radio" id="${optId}" name="${probeId}" value="${oIdx}"${alignedAttr}${expData}>` +
          `<span class="mirror-option-radio"></span>` +
          `<span class="mirror-option-text">${escHtml(opt.text)}</span>` +
          `</label>`;
      });

      const authorMeaningHtml =
        `<div class="mirror-author-section">` +
        `<div class="mirror-subhead"><span class="mirror-icon">🗺️</span> Author's Declared Meaning</div>` +
        `<div class="mirror-author-content">${escHtml(probe.authorDeclaredMeaning)}</div>` +
        `</div>`;

      const divergenceHtml = probe.divergenceExplanation
        ? `<div class="mirror-divergence-section">` +
          `<div class="mirror-subhead"><span class="mirror-icon">⚡</span> Divergence Analysis</div>` +
          `<div class="mirror-divergence-content">${escHtml(probe.divergenceExplanation)}</div>` +
          `</div>`
        : '';

      contentHtml +=
        `<div class="mirror-probe-card" id="${probeId}" data-probe-id="${probeId}">` +
        `<div class="mirror-probe-header">` +
        `<span class="mirror-probe-tag">Alignment Probe</span>` +
        `<div class="mirror-probe-claim">${escHtml(probe.claim)}</div>` +
        `</div>` +
        `<div class="mirror-probe-options">${optionsHtml}</div>` +
        `<div class="mirror-probe-controls">` +
        `<button type="button" class="mirror-eval-btn" data-probe-target="${probeId}">Compare with Author's Meaning</button>` +
        `</div>` +
        `<div class="mirror-probe-reveal" hidden>` +
        authorMeaningHtml +
        divergenceHtml +
        `<div class="mirror-audit-prompt">Self-Audit: How does your reading map to the author's declared distinction?</div>` +
        `<div class="mirror-audit-actions">` +
        `<button type="button" class="mirror-audit-btn align-yes" data-action="understood" data-probe="${probeId}">✓ I understand the author's distinction</button>` +
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

  return (
    `<aside class="mirror-block" id="${model.id}" data-mirror-id="${model.id}" data-kind="${model.kind}" data-count="${totalItems}" aria-label="${safeTitle}">` +
    `<button type="button" class="mirror-margin-pill" data-target-mirror="${model.id}" title="Click to view ${safeTitle} in Read Mode" aria-label="Toggle ${safeTitle}">` +
    `<span class="mirror-pill-icon">🪞</span>` +
    `<span class="mirror-pill-label">${kindBadge}</span>` +
    `<span class="mirror-pill-count">${pillLabel}</span>` +
    `</button>` +
    `<div class="mirror-card">` +
    `<div class="mirror-card-header">` +
    `<div class="mirror-header-title">` +
    `<span class="mirror-card-badge">${kindBadge}</span>` +
    `<span class="mirror-card-heading">${safeTitle}</span>` +
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
