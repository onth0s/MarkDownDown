// ── Mirror Mode Controls & State Persistence ────────────────────────────────
const modeReadBtn = document.getElementById('modeReadBtn');
const modeMirrorBtn = document.getElementById('modeMirrorBtn');
if (modeReadBtn) {
  modeReadBtn.addEventListener('click', () => setMode('read'));
}
if (modeMirrorBtn) {
  modeMirrorBtn.addEventListener('click', () => setMode('mirror'));
}

// Alt+M shortcut to toggle between Read and Mirror modes
document.addEventListener('keydown', (e) => {
  if (e.altKey && (e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey) {
    if (typeof mirrorBlocks !== 'undefined' && mirrorBlocks.length > 0) {
      e.preventDefault();
      const currentMode = body.dataset.mode === 'mirror' ? 'read' : 'mirror';
      setMode(currentMode);
    }
  }
});

function getMirrorStorageKey() {
  return `mdd_mirror_${location.pathname}`;
}

function getMirrorState() {
  try {
    const raw = localStorage.getItem(getMirrorStorageKey());
    const data = raw ? JSON.parse(raw) : {};
    return { probes: data.probes || {}, notes: data.notes || {} };
  } catch (_) {
    return { probes: {}, notes: {} };
  }
}

function saveMirrorState(state) {
  try {
    localStorage.setItem(getMirrorStorageKey(), JSON.stringify(state));
  } catch (_) {}
}

function createReaderNoteItem(mirrorId, note) {
  const li = document.createElement('li');
  li.className = 'mirror-reader-note-item';
  li.dataset.noteId = note.id;

  const span = document.createElement('span');
  span.className = 'mirror-reader-note-text';
  span.textContent = note.text;

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'mirror-reader-note-del';
  delBtn.title = 'Delete note';
  delBtn.setAttribute('aria-label', 'Delete note');
  delBtn.textContent = '×';

  li.appendChild(span);
  li.appendChild(delBtn);
  return li;
}

function updateProbeOutcome(probeCard, selectedVal) {
  const outcomeEl = probeCard.querySelector('.mirror-probe-outcome');
  const badgeEl = probeCard.querySelector('.mirror-outcome-badge');
  if (!outcomeEl || !badgeEl) return { outcome: 'unanswered', aligned: false };

  outcomeEl.hidden = false;
  if (typeof selectedVal !== 'number' || selectedVal < 0) {
    badgeEl.textContent = 'ℹ Reference View: No option selected.';
    badgeEl.className = 'mirror-outcome-badge neutral';
    probeCard.querySelectorAll('.mirror-outcome-exp-item').forEach(el => { el.hidden = true; });
    return { outcome: 'unanswered', aligned: false };
  }

  const radio = probeCard.querySelector(`input[type="radio"][value="${selectedVal}"]`);
  const isAligned = radio ? radio.dataset.aligned === 'true' : false;

  if (isAligned) {
    badgeEl.textContent = "✓ Aligned with Author's Meaning";
    badgeEl.className = 'mirror-outcome-badge matched';
  } else {
    badgeEl.textContent = '⚡ Divergence Detected';
    badgeEl.className = 'mirror-outcome-badge diverged';
  }

  let hasExp = false;
  probeCard.querySelectorAll('.mirror-outcome-exp-item').forEach(el => {
    const isTarget = el.dataset.optIdx === String(selectedVal);
    el.hidden = !isTarget;
    if (isTarget) hasExp = true;
  });

  const expContainer = probeCard.querySelector('.mirror-outcome-explanations');
  if (expContainer) {
    expContainer.hidden = !hasExp;
  }

  return { outcome: isAligned ? 'matched' : 'diverged', aligned: isAligned };
}

// Delegated event listener for mirror block interactions
article.addEventListener('click', (e) => {
  // 0a. Subtle gutter dot anchor in Read Mode
  const dot = e.target.closest('.mirror-anchor-dot');
  if (dot) {
    e.preventDefault();
    const mirrorId = dot.dataset.mirrorTarget || (dot.getAttribute('href') || '').replace(/^#/, '');
    const block = document.getElementById(mirrorId);
    if (block) {
      block.classList.add('is-peek-open');
      block.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return;
  }

  // 0b. Target locator jump button in Mirror card header
  const locator = e.target.closest('.mirror-target-locator');
  if (locator) {
    e.preventDefault();
    const targetId = locator.dataset.targetId || (locator.getAttribute('href') || '').replace(/^#/, '');
    const targetEl = document.getElementById(targetId);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      targetEl.classList.remove('target-highlight');
      void targetEl.offsetWidth;
      targetEl.classList.add('target-highlight');
      setTimeout(() => { targetEl.classList.remove('target-highlight'); }, 1600);
    }
    return;
  }

  // 1. Margin pill toggle in Read Mode
  const pill = e.target.closest('.mirror-margin-pill');
  if (pill) {
    e.preventDefault();
    const block = pill.closest('.mirror-block');
    if (block) {
      block.classList.toggle('is-peek-open');
    }
    return;
  }

  // 2. Card close button in peek view
  const closeBtn = e.target.closest('.mirror-card-close-btn');
  if (closeBtn) {
    e.preventDefault();
    const block = closeBtn.closest('.mirror-block');
    if (block) {
      block.classList.remove('is-peek-open');
    }
    return;
  }

  // 3. Probe evaluation button
  const evalBtn = e.target.closest('.mirror-eval-btn');
  if (evalBtn) {
    e.preventDefault();
    const probeCard = evalBtn.closest('.mirror-probe-card');
    if (!probeCard) return;
    const probeId = probeCard.dataset.probeId || probeCard.id;
    const reveal = probeCard.querySelector('.mirror-probe-reveal');
    if (reveal) {
      reveal.hidden = false;
    }
    const selectedRadio = probeCard.querySelector('input[type="radio"]:checked');
    const selectedVal = selectedRadio ? Number(selectedRadio.value) : -1;
    const { outcome } = updateProbeOutcome(probeCard, selectedVal);

    const state = getMirrorState();
    if (!state.probes[probeId]) state.probes[probeId] = {};
    state.probes[probeId].revealed = true;
    if (selectedVal >= 0) {
      state.probes[probeId].selectedOption = selectedVal;
      state.probes[probeId].outcome = outcome;
    }
    state.probes[probeId].updatedAt = new Date().toISOString();
    saveMirrorState(state);
    return;
  }

  // 4. Self-audit buttons (Understood vs Misread vs Disagree)
  const auditBtn = e.target.closest('.mirror-audit-btn');
  if (auditBtn) {
    e.preventDefault();
    const probeCard = auditBtn.closest('.mirror-probe-card');
    if (!probeCard) return;
    const probeId = auditBtn.dataset.probe || probeCard.dataset.probeId || probeCard.id;
    const action = auditBtn.dataset.action;
    const actionsGroup = probeCard.querySelector('.mirror-audit-actions');
    if (actionsGroup) {
      actionsGroup.querySelectorAll('.mirror-audit-btn').forEach(b => b.classList.remove('active'));
    }
    auditBtn.classList.add('active');

    const statusEl = probeCard.querySelector('.mirror-audit-status');
    if (statusEl) {
      statusEl.hidden = false;
      if (action === 'understood') {
        statusEl.textContent = "✓ Aligned: Author's distinction understood.";
        statusEl.className = 'mirror-audit-status aligned';
      } else if (action === 'misread') {
        statusEl.textContent = "↻ Clarified: Initial reading corrected upon seeing author's distinction.";
        statusEl.className = 'mirror-audit-status misread';
      } else if (action === 'disagree') {
        statusEl.textContent = "⚡ Premise Noted: Conceptual distinction understood; underlying premise contested.";
        statusEl.className = 'mirror-audit-status disagree';
      }
    }

    const state = getMirrorState();
    if (!state.probes[probeId]) state.probes[probeId] = {};
    state.probes[probeId].auditStatus = action;
    state.probes[probeId].updatedAt = new Date().toISOString();
    saveMirrorState(state);
    return;
  }

  // 5. Reader notes toggle button
  const toggleBtn = e.target.closest('.mirror-reader-toggle-btn');
  if (toggleBtn) {
    e.preventDefault();
    const section = toggleBtn.closest('.mirror-reader-section');
    if (!section) return;
    const bodyEl = section.querySelector('.mirror-reader-body');
    if (!bodyEl) return;
    const isClosed = bodyEl.hidden;
    bodyEl.hidden = !isClosed;
    toggleBtn.setAttribute('aria-expanded', String(isClosed));
    toggleBtn.textContent = isClosed ? '− Cancel' : '+ Add Question';
    if (isClosed) {
      const input = bodyEl.querySelector('.mirror-reader-input');
      if (input) input.focus();
    }
    return;
  }

  // 6. Reader notes submit button
  const submitBtn = e.target.closest('.mirror-reader-submit-btn');
  if (submitBtn) {
    e.preventDefault();
    const section = submitBtn.closest('.mirror-reader-section');
    if (!section) return;
    const mirrorId = section.dataset.parentMirror || section.closest('.mirror-block')?.id;
    const input = section.querySelector('.mirror-reader-input');
    const text = input ? input.value.trim() : '';
    if (!text || !mirrorId) return;

    const note = {
      id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      text,
      createdAt: new Date().toISOString()
    };

    const state = getMirrorState();
    if (!state.notes) state.notes = {};
    if (!Array.isArray(state.notes[mirrorId])) state.notes[mirrorId] = [];
    state.notes[mirrorId].push(note);
    saveMirrorState(state);

    const list = section.querySelector('.mirror-reader-notes-list');
    if (list) {
      list.appendChild(createReaderNoteItem(mirrorId, note));
    }

    input.value = '';
    const bodyEl = section.querySelector('.mirror-reader-body');
    if (bodyEl) bodyEl.hidden = true;
    const toggle = section.querySelector('.mirror-reader-toggle-btn');
    if (toggle) {
      toggle.setAttribute('aria-expanded', 'false');
      toggle.textContent = '+ Add Question';
    }
    return;
  }

  // 7. Reader note delete button
  const delBtn = e.target.closest('.mirror-reader-note-del');
  if (delBtn) {
    e.preventDefault();
    const item = delBtn.closest('.mirror-reader-note-item');
    const section = delBtn.closest('.mirror-reader-section');
    if (!item || !section) return;
    const noteId = item.dataset.noteId;
    const mirrorId = section.dataset.parentMirror || section.closest('.mirror-block')?.id;
    if (noteId && mirrorId) {
      const state = getMirrorState();
      if (state.notes && Array.isArray(state.notes[mirrorId])) {
        state.notes[mirrorId] = state.notes[mirrorId].filter(n => n.id !== noteId);
        saveMirrorState(state);
      }
    }
    item.remove();
    return;
  }
});

// Radio change listener for probe options
article.addEventListener('change', (e) => {
  const radio = e.target.closest('.mirror-probe-card input[type="radio"]');
  if (radio) {
    const probeCard = radio.closest('.mirror-probe-card');
    if (!probeCard) return;
    const probeId = probeCard.dataset.probeId || probeCard.id;
    const val = Number(radio.value);
    const state = getMirrorState();
    if (!state.probes[probeId]) state.probes[probeId] = {};
    state.probes[probeId].selectedOption = val;

    const reveal = probeCard.querySelector('.mirror-probe-reveal');
    if (reveal && !reveal.hidden) {
      const { outcome } = updateProbeOutcome(probeCard, val);
      state.probes[probeId].outcome = outcome;
    }
    saveMirrorState(state);
  }
});

// Settings: Reset progress button
const resetMirrorBtn = document.getElementById('resetMirrorBtn');
if (resetMirrorBtn) {
  resetMirrorBtn.addEventListener('click', () => {
    try {
      localStorage.removeItem(getMirrorStorageKey());
    } catch (_) {}

    // Reset probe cards
    document.querySelectorAll('.mirror-probe-card').forEach(card => {
      card.querySelectorAll('input[type="radio"]').forEach(r => { r.checked = false; });
      const reveal = card.querySelector('.mirror-probe-reveal');
      if (reveal) reveal.hidden = true;
      const outcome = card.querySelector('.mirror-probe-outcome');
      if (outcome) outcome.hidden = true;
      card.querySelectorAll('.mirror-audit-btn').forEach(b => b.classList.remove('active'));
      const statusEl = card.querySelector('.mirror-audit-status');
      if (statusEl) {
        statusEl.hidden = true;
        statusEl.textContent = '';
      }
    });

    // Reset reader notes
    document.querySelectorAll('.mirror-reader-notes-list').forEach(list => {
      list.replaceChildren();
    });

    const orig = resetMirrorBtn.textContent;
    resetMirrorBtn.textContent = 'Progress reset!';
    setTimeout(() => { resetMirrorBtn.textContent = orig; }, 1500);
  });
}

// Restore saved mirror state on load
function initMirrorState() {
  const state = getMirrorState();
  if (state.probes) {
    for (const [probeId, pState] of Object.entries(state.probes)) {
      const probeCard = document.getElementById(probeId);
      if (!probeCard) continue;
      if (typeof pState.selectedOption === 'number' && pState.selectedOption >= 0) {
        const radio = probeCard.querySelector(`input[type="radio"][value="${pState.selectedOption}"]`);
        if (radio) radio.checked = true;
      }
      if (pState.revealed) {
        const revealEl = probeCard.querySelector('.mirror-probe-reveal');
        if (revealEl) {
          revealEl.hidden = false;
          updateProbeOutcome(probeCard, pState.selectedOption);
        }
      }
      if (pState.auditStatus) {
        const auditBtn = probeCard.querySelector(`.mirror-audit-btn[data-action="${pState.auditStatus}"]`);
        const statusEl = probeCard.querySelector('.mirror-audit-status');
        if (auditBtn) auditBtn.classList.add('active');
        if (statusEl) {
          statusEl.hidden = false;
          if (pState.auditStatus === 'understood') {
            statusEl.textContent = "✓ Aligned: Author's distinction understood.";
            statusEl.className = 'mirror-audit-status aligned';
          } else if (pState.auditStatus === 'misread') {
            statusEl.textContent = "↻ Clarified: Initial reading corrected upon seeing author's distinction.";
            statusEl.className = 'mirror-audit-status misread';
          } else if (pState.auditStatus === 'disagree') {
            statusEl.textContent = "⚡ Premise Noted: Conceptual distinction understood; underlying premise contested.";
            statusEl.className = 'mirror-audit-status disagree';
          }
        }
      }
    }
  }

  if (state.notes) {
    for (const [mirrorId, notes] of Object.entries(state.notes)) {
      const mirrorBlock = document.getElementById(mirrorId);
      if (!mirrorBlock || !Array.isArray(notes)) continue;
      const list = mirrorBlock.querySelector('.mirror-reader-notes-list');
      if (!list) continue;
      list.replaceChildren();
      notes.forEach(note => {
        list.appendChild(createReaderNoteItem(mirrorId, note));
      });
    }
  }
}

initMirrorState();

function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function generateMirrorAuditMarkdown() {
  const docTitle = document.title || 'Document';
  const state = getMirrorState();
  const probeCards = Array.from(document.querySelectorAll('.mirror-probe-card'));
  const mirrorBlocks = Array.from(document.querySelectorAll('.mirror-block'));

  let completedProbes = 0;
  let matchedProbes = 0;
  let divergedProbes = 0;
  let totalNotes = 0;

  for (const [_, pState] of Object.entries(state.probes || {})) {
    if (typeof pState.selectedOption === 'number' && pState.selectedOption >= 0) {
      completedProbes++;
      if (pState.outcome === 'matched') matchedProbes++;
      else if (pState.outcome === 'diverged') divergedProbes++;
    }
  }

  for (const [_, notesList] of Object.entries(state.notes || {})) {
    if (Array.isArray(notesList)) totalNotes += notesList.length;
  }

  const lines = [
    `# Semantic Audit & Reader Notes: ${docTitle}`,
    '',
    `*Generated on ${new Date().toLocaleString()} by Markdown++ Mirror Mode*`,
    '',
    '## Executive Summary',
    `- **Total Alignment Probes**: ${probeCards.length}`,
    `- **Probes Completed**: ${completedProbes} / ${probeCards.length}`,
    `- **Author Aligned**: ${matchedProbes}`,
    `- **Diverged**: ${divergedProbes}`,
    `- **Reader Questions & Notes Logged**: ${totalNotes}`,
    '',
    '---',
    '',
    '## Semantic Alignment Probes',
    '',
  ];

  if (probeCards.length === 0) {
    lines.push('_No semantic alignment probes found in this document._', '');
  } else {
    probeCards.forEach((card, idx) => {
      const probeId = card.dataset.probeId || card.id;
      const claim = card.querySelector('.mirror-probe-claim')?.textContent?.trim() || '';
      const pState = (state.probes && state.probes[probeId]) || {};
      const parentBlock = card.closest('.mirror-block');
      const targetRef = parentBlock?.dataset?.target || parentBlock?.dataset?.targetId || '';
      const blockTitle = parentBlock?.querySelector('.mirror-card-heading')?.textContent?.trim() || `Probe #${idx + 1}`;

      lines.push(`### ${idx + 1}. ${blockTitle}`);
      if (targetRef) lines.push(`- **Target Passage**: \`#${targetRef}\``);
      lines.push(`- **Claim**: ${claim}`);

      if (typeof pState.selectedOption === 'number' && pState.selectedOption >= 0) {
        const radio = card.querySelector(`input[type="radio"][value="${pState.selectedOption}"]`);
        const optText = radio ? radio.closest('.mirror-option')?.querySelector('.mirror-option-text')?.textContent?.trim() : '';
        lines.push(`- **Reader Selection**: "${optText}"`);
        const outcomeLabel = pState.outcome === 'matched' ? "✓ Aligned with Author's Meaning" : '⚡ Divergence Detected';
        lines.push(`- **Outcome**: ${outcomeLabel}`);
        if (pState.auditStatus) {
          const auditMap = {
            understood: "✓ Author's distinction understood",
            misread: '↻ Misread initially, now clear',
            disagree: '⚡ Understood, but premise contested',
          };
          lines.push(`- **Self-Audit**: ${auditMap[pState.auditStatus] || pState.auditStatus}`);
        }
      } else {
        lines.push(`- **Reader Selection**: _Not answered_`);
      }

      const authorMeaning = card.querySelector('.mirror-author-content')?.textContent?.trim();
      if (authorMeaning) {
        lines.push(`- **Author's Declared Meaning**: ${authorMeaning}`);
      }
      const divergence = card.querySelector('.mirror-divergence-content')?.textContent?.trim();
      if (divergence) {
        lines.push(`- **Divergence Note**: ${divergence}`);
      }

      lines.push('');
    });
  }

  lines.push('---', '', '## Reader Questions & Notes', '');

  let hasNotes = false;
  mirrorBlocks.forEach((block) => {
    const mirrorId = block.id;
    const notes = (state.notes && state.notes[mirrorId]) || [];
    if (notes.length > 0) {
      hasNotes = true;
      const blockTitle = block.querySelector('.mirror-card-heading')?.textContent?.trim() || mirrorId;
      lines.push(`### Under "${blockTitle}"`);
      notes.forEach((n) => {
        const dateStr = n.createdAt ? new Date(n.createdAt).toLocaleDateString() : '';
        lines.push(`- ${dateStr ? `*(${dateStr})* ` : ''}${n.text}`);
      });
      lines.push('');
    }
  });

  if (!hasNotes) {
    lines.push('_No reader notes recorded for this document._', '');
  }

  return lines.join('\n');
}

function handleMirrorAuditExport() {
  const mdText = generateMirrorAuditMarkdown();
  const slug = (document.title || 'document').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  downloadTextFile(`${slug}-mirror-audit.md`, mdText);
}

const exportMirrorBtn = document.getElementById('exportMirrorBtn');
if (exportMirrorBtn) {
  exportMirrorBtn.addEventListener('click', handleMirrorAuditExport);
}

const exportMirrorMenuBtn = document.getElementById('exportMirrorMenuBtn');
if (exportMirrorMenuBtn) {
  exportMirrorMenuBtn.addEventListener('click', (ev) => {
    ev.preventDefault();
    const dropMenu = document.getElementById('dropdownMenu');
    if (dropMenu) dropMenu.classList.remove('open');
    const mBtn = document.getElementById('menuBtn');
    if (mBtn) mBtn.setAttribute('aria-expanded', 'false');
    handleMirrorAuditExport();
  });
}

// Keyboard navigation for Mirror Mode (J/K between blocks, 1-9 to select probe options)
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
  if (activeTag === 'input' || activeTag === 'textarea' || document.activeElement?.isContentEditable) return;

  if (document.body.dataset.mode === 'mirror') {
    const blocks = Array.from(document.querySelectorAll('.mirror-block'));
    if (!blocks.length) return;

    if (e.key === 'j' || e.key === 'J') {
      e.preventDefault();
      const currentScroll = window.scrollY + 80;
      const nextBlock = blocks.find((b) => b.getBoundingClientRect().top + window.scrollY > currentScroll);
      if (nextBlock) {
        nextBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    if (e.key === 'k' || e.key === 'K') {
      e.preventDefault();
      const currentScroll = window.scrollY - 80;
      const prevBlock = [...blocks].reverse().find((b) => b.getBoundingClientRect().top + window.scrollY < currentScroll);
      if (prevBlock) {
        prevBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    if (/^[1-9]$/.test(e.key)) {
      const optIdx = parseInt(e.key, 10) - 1;
      const probeCards = Array.from(document.querySelectorAll('.mirror-probe-card'));
      const activeCard =
        probeCards.find((card) => {
          const rect = card.getBoundingClientRect();
          return rect.top >= 0 && rect.top <= window.innerHeight * 0.75;
        }) || probeCards[0];

      if (activeCard) {
        const radio = activeCard.querySelector(`input[type="radio"][value="${optIdx}"]`);
        if (radio) {
          e.preventDefault();
          radio.checked = true;
          radio.dispatchEvent(new Event('change', { bubbles: true }));
          radio.focus();
        }
      }
    }
  }
});
