// ── Document Statistics ──────────────────────────────────────────────────
const docStatsBtn = document.getElementById('docStatsBtn');
const docStats = document.getElementById('docStats');
const docStatsCloseBtn = document.getElementById('docStatsCloseBtn');
const docStatsGrid = document.getElementById('docStatsGrid');

function closeDocStats() {
  if (docStats && !docStats.hidden) {
    docStats.hidden = true;
    docStats.classList.remove('open');
    if (docStatsBtn) docStatsBtn.setAttribute('aria-expanded', 'false');
  }
}

function computeDocumentStatistics() {
  const articleEl = document.getElementById('article');
  if (!articleEl) {
    return {
      words: 0,
      chars: 0,
      readingTimeMin: 0,
      headings: 0,
      codeBlocks: 0,
      diagrams: 0,
      tables: 0,
      mirrorBlocks: 0,
      probes: 0,
      internalLinks: 0,
      externalLinks: 0,
    };
  }

  // Work on a detached clone to measure clean prose words without affecting the live DOM
  const clone = articleEl.cloneNode(true);
  const elementsToRemove = clone.querySelectorAll(
    '.hero, .no-results, .heading-anchor, .code-title-bar, .code-actions, .alert-title, svg, pre, textarea, script, style, aside.mirror-block, button'
  );
  elementsToRemove.forEach(el => el.remove());

  const proseText = (clone.textContent || '').trim();
  const wordsArray = proseText.length > 0 ? proseText.split(/\s+/) : [];
  const words = wordsArray.length;
  const chars = proseText.replace(/\s+/g, '').length;
  const readingTimeMin = Math.max(1, Math.ceil(words / 220));

  const headings = articleEl.querySelectorAll('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]').length;
  const diagrams = articleEl.querySelectorAll('.code-wrap.diagram').length;
  const tables = articleEl.querySelectorAll('.code-wrap.table').length;
  const mirrorBlocks = articleEl.querySelectorAll('.mirror-block').length;
  const probes = articleEl.querySelectorAll('.mirror-probe-card').length;

  // Code blocks excluding diagram/table/mirror DSL wrappers
  const allPre = articleEl.querySelectorAll('pre');
  let codeBlocks = 0;
  allPre.forEach(pre => {
    if (!pre.closest('.code-wrap.diagram, .code-wrap.table, .code-wrap.mirror, .mirror-block')) {
      codeBlocks++;
    }
  });

  const links = articleEl.querySelectorAll('a[href]');
  let internalLinks = 0;
  let externalLinks = 0;
  links.forEach(a => {
    if (a.classList.contains('heading-anchor')) return;
    const href = a.getAttribute('href') || '';
    if (href.startsWith('#')) {
      internalLinks++;
    } else if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('file:') || href.startsWith('mailto:')) {
      externalLinks++;
    }
  });

  return {
    words,
    chars,
    readingTimeMin,
    headings,
    codeBlocks,
    diagrams,
    tables,
    mirrorBlocks,
    probes,
    internalLinks,
    externalLinks,
  };
}

function renderDocStatsGrid() {
  if (!docStatsGrid) return;
  const stats = computeDocumentStatistics();
  const items = [
    { label: 'Words', value: stats.words.toLocaleString() },
    { label: 'Reading time', value: `~${stats.readingTimeMin} min` },
    { label: 'Characters', value: stats.chars.toLocaleString() },
    { label: 'Headings', value: stats.headings.toLocaleString() },
    { label: 'Code blocks', value: stats.codeBlocks.toLocaleString() },
    { label: 'Diagrams', value: stats.diagrams.toLocaleString() },
    { label: 'SVG tables', value: stats.tables.toLocaleString() },
  ];

  if (stats.mirrorBlocks > 0) {
    items.push({ label: 'Mirror blocks', value: stats.mirrorBlocks.toLocaleString() });
    if (stats.probes > 0) {
      items.push({ label: 'Alignment probes', value: stats.probes.toLocaleString() });
    }
  }

  items.push(
    { label: 'Internal links', value: stats.internalLinks.toLocaleString() },
    { label: 'External links', value: stats.externalLinks.toLocaleString() }
  );

  docStatsGrid.replaceChildren();
  items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'doc-stats-row';

    const dt = document.createElement('dt');
    dt.textContent = item.label;

    const dd = document.createElement('dd');
    dd.textContent = item.value;

    row.appendChild(dt);
    row.appendChild(dd);
    docStatsGrid.appendChild(row);
  });
}

function toggleDocStats(forceOpen) {
  if (!docStats) return;
  const shouldOpen = forceOpen !== undefined ? forceOpen : docStats.hidden;
  if (shouldOpen) {
    if (typeof closeDropdownMenu === 'function') closeDropdownMenu();
    const settingsPanel = document.getElementById('settings');
    if (settingsPanel) settingsPanel.classList.remove('open');
    renderDocStatsGrid();
    docStats.hidden = false;
    docStats.classList.add('open');
    if (docStatsBtn) docStatsBtn.setAttribute('aria-expanded', 'true');
  } else {
    closeDocStats();
  }
}

if (docStatsBtn) {
  docStatsBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleDocStats();
  });
}

if (docStatsCloseBtn) {
  docStatsCloseBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    closeDocStats();
  });
}

if (docStats) {
  docStats.addEventListener('click', (event) => {
    event.stopPropagation();
  });
}

document.addEventListener('click', (event) => {
  if (docStats && !docStats.hidden) {
    if (!docStats.contains(event.target) && event.target !== docStatsBtn) {
      closeDocStats();
    }
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && docStats && !docStats.hidden) {
    event.preventDefault();
    closeDocStats();
    if (docStatsBtn) docStatsBtn.focus();
  }
});
