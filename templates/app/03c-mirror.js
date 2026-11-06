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

// Delegated event listener for mirror block interactions
article.addEventListener('click', (e) => {
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

    const state = getMirrorState();
    if (!state.probes[probeId]) state.probes[probeId] = {};
    state.probes[probeId].revealed = true;
    if (selectedVal >= 0) {
      state.probes[probeId].selectedOption = selectedVal;
    }
    saveMirrorState(state);
    return;
  }

  // 4. Self-audit buttons (Understood vs Disagree)
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
      } else if (action === 'disagree') {
        statusEl.textContent = "⚡ Premise Noted: Conceptual distinction understood; underlying premise contested.";
        statusEl.className = 'mirror-audit-status disagree';
      }
    }

    const state = getMirrorState();
    if (!state.probes[probeId]) state.probes[probeId] = {};
    state.probes[probeId].auditStatus = action;
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
    const state = getMirrorState();
    if (!state.probes[probeId]) state.probes[probeId] = {};
    state.probes[probeId].selectedOption = Number(radio.value);
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
        if (revealEl) revealEl.hidden = false;
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
