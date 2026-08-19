// ── Diagram & Table Search Sync, Search Engine & Keyboard Shortcuts ─────────
const diagramContainers = [...article.querySelectorAll('.code-wrap.diagram')];
const tableContainers = [...article.querySelectorAll('.code-wrap.table')];

function sourceOffsetOf(el, root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let off = 0;
  let n;
  while ((n = walker.nextNode())) {
    if (el.contains(n)) {
      return off + Math.max(0, (n.nodeValue || '').indexOf(el.textContent || ''));
    }
    off += (n.nodeValue || '').length;
  }
  return -1;
}

function syncDiagramHighlights() {
  for (const container of [...diagramContainers, ...tableContainers]) {
    const svgs = [...container.querySelectorAll('.diagram-render svg, .table-render svg')];
    if (!svgs.length) continue;
    let labels = container.__diagramModel?.labels;
    if (!labels && container.dataset.labels) {
      try { labels = JSON.parse(container.dataset.labels); } catch (_) {}
    }
    const codeEl = container.querySelector('code');
    const marks = [...container.querySelectorAll('mark[data-search-match="true"]')];

    for (const svg of svgs) {
      const byOrd = new Map();
      svg.querySelectorAll('[data-label-ord]').forEach(g => {
        byOrd.set(Number(g.getAttribute('data-label-ord')), g);
        g.classList.remove('is-hit', 'is-current');
        // Restore original text in text nodes if modified
        g.querySelectorAll('text').forEach(t => {
          if (t.dataset.origText !== undefined) {
            t.textContent = t.dataset.origText;
            delete t.dataset.origText;
          }
        });
      });

      for (const mark of marks) {
        const off = codeEl ? sourceOffsetOf(mark, codeEl) : -1;
        let matchedG = null;

        if (labels && off >= 0) {
          const label = labels.find(l => off >= l.offset && off < l.offset + l.text.length);
          if (label) matchedG = byOrd.get(label.ord);
        }

        const markText = (mark.textContent || '').trim();
        if (!matchedG && markText.length >= 2) {
          const lowerMark = markText.toLowerCase();
          for (const g of byOrd.values()) {
            const nodeText = (g.textContent || '').toLowerCase();
            if (nodeText.includes(lowerMark)) {
              matchedG = g;
              break;
            }
          }
        }

        if (matchedG) {
          matchedG.classList.add('is-hit');
          const isCurrent = mark.classList.contains('search-current');
          if (isCurrent) matchedG.classList.add('is-current');

          // Highlight the exact word in the SVG text nodes using tspans
          if (markText.length >= 1) {
            const needle = caseSensitive ? markText : markText.toLowerCase();
            matchedG.querySelectorAll('text').forEach(t => {
              const orig = t.dataset.origText ?? t.textContent;
              t.dataset.origText = orig;
              const haystack = caseSensitive ? orig : orig.toLowerCase();
              const idx = haystack.indexOf(needle);
              if (idx >= 0) {
                const before = orig.slice(0, idx);
                const hit = orig.slice(idx, idx + needle.length);
                const after = orig.slice(idx + needle.length);
                const hitClass = isCurrent ? 'svg-mark is-current' : 'svg-mark is-hit';
                t.innerHTML = `${before}<tspan class="${hitClass}">${hit}</tspan>${after}`;
              }
            });
          }
        }
      }
    }
  }
}

// ── Search engine ──────────────────────────────────────────────────────────
const searchResultsLabel = document.createElement('div');
searchResultsLabel.className = 'search-results-label';
searchResultsLabel.textContent = 'Search results';

const searchResults = document.createElement('ul');
searchResults.className = 'search-results';

toc.parentNode.insertBefore(searchResultsLabel, toc);
toc.parentNode.insertBefore(searchResults, toc);
searchResultsLabel.hidden = true;
searchResults.hidden = true;

const searchableNodes = [...article.children].filter(el =>
  !el.classList.contains('hero') &&
  !el.classList.contains('no-results')
);

searchableNodes.forEach(node => {
  if (!node.dataset.originalHtml) node.dataset.originalHtml = encodeURIComponent(node.innerHTML);
});

const navigableHeadings = headings.filter(h => h.id);

let caseSensitive = false;
let matches = [];
let currentMatch = -1;

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function restoreSearchDOM() {
  searchableNodes.forEach(node => {
    node.innerHTML = decodeURIComponent(node.dataset.originalHtml);
    node.hidden = false;
  });
}

function headingForNode(node) {
  const ownHeading = node.nodeType === Node.ELEMENT_NODE
    ? node.closest('h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]')
    : node.parentElement?.closest('h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]');
  if (ownHeading) return ownHeading;
  let nearest = null;
  for (const heading of navigableHeadings) {
    if (heading === node) return heading;
    const relation = heading.compareDocumentPosition(node);
    if (relation & Node.DOCUMENT_POSITION_FOLLOWING) {
      nearest = heading;
    } else if (relation & Node.DOCUMENT_POSITION_PRECEDING) {
      break;
    }
  }
  return nearest;
}

function highlightNode(node, query) {
  const re = new RegExp(escapeRegex(query), caseSensitive ? 'g' : 'gi');
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let textNode;
  while ((textNode = walker.nextNode())) {
    if (textNode.parentElement?.closest('svg, .heading-anchor')) continue;
    if (textNode.parentElement?.closest('code,pre,script,style') &&
        !textNode.parentElement.closest('code.language-diagram,code.language-table')) continue;
    textNodes.push(textNode);
  }
  let cnt = 0;
  for (const text of textNodes) {
    re.lastIndex = 0;
    if (!re.test(text.nodeValue)) continue;
    re.lastIndex = 0;
    const fragment = document.createDocumentFragment();
    let last = 0;
    let match;
    while ((match = re.exec(text.nodeValue)) !== null) {
      fragment.appendChild(document.createTextNode(text.nodeValue.slice(last, match.index)));
      const mark = document.createElement('mark');
      mark.dataset.searchMatch = 'true';
      mark.textContent = match[0];
      fragment.appendChild(mark);
      cnt++;
      last = match.index + match[0].length;
    }
    fragment.appendChild(document.createTextNode(text.nodeValue.slice(last)));
    text.replaceWith(fragment);
  }
  return cnt;
}

function rebuildSearch(query) {
  restoreSearchDOM();
  matches = [];
  currentMatch = -1;
  searchResults.replaceChildren();
  if (!query) {
    toc.hidden = false;
    searchResultsLabel.hidden = true;
    searchResults.hidden = true;
    noResults.style.display = 'none';
    count.textContent = '';
    document.getElementById('prevBtn').disabled = true;
    document.getElementById('nextBtn').disabled = true;
    return;
  }
  toc.hidden = true;
  searchResultsLabel.hidden = false;
  searchResults.hidden = false;

  // Pass 1: highlight and hide non-matching nodes.
  const headingMatches = new Set();
  for (const node of searchableNodes) {
    const plain = node.textContent || '';
    const haystack = caseSensitive ? plain : plain.toLocaleLowerCase();
    const needle = caseSensitive ? query : query.toLocaleLowerCase();
    if (!haystack.includes(needle)) {
      node.hidden = true;
      continue;
    }
    const found = highlightNode(node, query);
    node.hidden = found === 0;
    if (found > 0) {
      const h = node.closest('h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]');
      if (h) headingMatches.add(h.id);
    }
  }

  // Pass 2: unhide content under headings that have matches.
  let currentHeading = null;
  for (const node of searchableNodes) {
    const h = node.querySelector?.('h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]')
      || (node.matches?.('h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]') ? node : null);
    if (h) currentHeading = h.id;
    if (currentHeading && headingMatches.has(currentHeading) && node.hidden) {
      node.hidden = false;
    }
  }
  const resultGroups = new Map();
  const seenNodesPerContainer = new Map();

  for (const mark of article.querySelectorAll('mark[data-search-match="true"]')) {
    const container = mark.closest('.code-wrap.diagram, .code-wrap.table');
    if (container) {
      // Deduplicate multiple token matches within the same diagram node line so each node is 1 match in sequence
      const codeEl = container.querySelector('code');
      const off = codeEl ? sourceOffsetOf(mark, codeEl) : -1;
      let labels = container.__diagramModel?.labels;
      if (!labels && container.dataset.labels) {
        try { labels = JSON.parse(container.dataset.labels); } catch (_) {}
      }
      let ord = -1;
      if (labels && off >= 0) {
        const label = labels.find(l => off >= l.offset && off < l.offset + l.text.length);
        if (label) ord = label.ord;
      }
      if (ord >= 0) {
        let seen = seenNodesPerContainer.get(container);
        if (!seen) { seen = new Set(); seenNodesPerContainer.set(container, seen); }
        if (seen.has(ord)) continue;
        seen.add(ord);
      }
    }

    const heading = headingForNode(mark);
    const key = heading?.id || '__unsectioned__';
    const item = { mark, heading };
    matches.push(item);
    if (!resultGroups.has(key)) {
      resultGroups.set(key, { heading, matches: [] });
    }
    resultGroups.get(key).matches.push(item);
  }
  if (!matches.length) {
    noResults.style.display = 'block';
    count.textContent = '0 results';
    document.getElementById('prevBtn').disabled = true;
    document.getElementById('nextBtn').disabled = true;
    return;
  }
  noResults.style.display = 'none';
  currentMatch = 0;
  for (const group of resultGroups.values()) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.className = 'search-result-item';
    if (group.heading) {
      a.href = `#${group.heading.id}`;
      a.dataset.targetId = group.heading.id;
      const headingText = [...group.heading.childNodes]
        .filter(n => !n.classList?.contains('heading-anchor'))
        .map(n => n.textContent)
        .join('')
        .trim();
      a.textContent = headingText || group.heading.textContent.trim();
    } else {
      a.href = '#';
      a.dataset.targetId = '';
      a.textContent = 'Unsectioned content';
    }
    a.addEventListener('click', event => {
      event.preventDefault();
      const first = matches.findIndex(m => group.matches.includes(m));
      if (first >= 0) goToMatch(first);
    });
    li.appendChild(a);
    searchResults.appendChild(li);
  }
  document.getElementById('prevBtn').disabled = false;
  document.getElementById('nextBtn').disabled = false;
  goToMatch(0);
}

function updateSearchState() {
  count.textContent = matches.length
    ? `${currentMatch + 1} / ${matches.length}`
    : '0 results';
  matches.forEach((item, index) => {
    item.mark.classList.toggle('search-current', index === currentMatch);
  });
  const activeHeading = matches[currentMatch]?.heading;
  searchResults.querySelectorAll('.search-result-item').forEach(link => {
    const active = !!activeHeading && link.dataset.targetId === activeHeading.id;
    link.classList.toggle('active', active);
    if (active) {
      link.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  });
  syncDiagramHighlights();
}

function goToMatch(index) {
  if (!matches.length) return;
  currentMatch = (index + matches.length) % matches.length;
  const item = matches[currentMatch];
  const targetHeading = item.heading;
  if (targetHeading?.id && history.replaceState) {
    history.replaceState(null, '', `#${targetHeading.id}`);
  }
  updateSearchState();

  const container = item.mark.closest('.code-wrap.diagram, .code-wrap.table');
  if (container) {
    const activeSvgNode = container.querySelector('.diagram-render .is-current, .table-render .is-current');
    if (activeSvgNode) {
      activeSvgNode.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    } else {
      container.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  } else {
    item.mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

const clearSearchBtn = document.getElementById('clearSearchBtn');
function updateClearButton() {
  clearSearchBtn.classList.toggle('visible', search.value.length > 0);
}

search.addEventListener('input', () => {
  rebuildSearch(search.value.trim());
  updateClearButton();
});

clearSearchBtn.addEventListener('click', () => {
  search.value = '';
  rebuildSearch('');
  updateClearButton();
  search.focus();
});

updateClearButton();

const caseBtn = document.getElementById('caseBtn');
caseBtn.setAttribute('aria-pressed', 'false');
caseBtn.title = 'Case sensitive: OFF';

caseBtn.addEventListener('click', event => {
  event.preventDefault();
  event.stopPropagation();
  caseSensitive = !caseSensitive;
  caseBtn.classList.toggle('active', caseSensitive);
  caseBtn.setAttribute('aria-pressed', String(caseSensitive));
  caseBtn.title = caseSensitive ? 'Case sensitive: ON' : 'Case sensitive: OFF';
  rebuildSearch(search.value.trim());
});

document.getElementById('prevBtn').addEventListener('click', () => {
  goToMatch(currentMatch - 1);
});

document.getElementById('nextBtn').addEventListener('click', () => {
  goToMatch(currentMatch + 1);
});

// ── iOS touch compat ───────────────────────────────────────────────────────
// Note: touch-action: manipulation in CSS handles double-tap zoom suppression natively
// without intercepting touchend events and breaking tap/click responsiveness.

// ── Hash navigation ────────────────────────────────────────────────────────
window.addEventListener('hashchange', () => {
  const id = location.hash.slice(1);
  if (id && document.getElementById(id)) setActive(id);
});

// ── Wikilink / Internal Anchor Interceptor ─────────────────────────────────
article.addEventListener('click', (event) => {
  const link = event.target.closest('a[href^="#"]');
  if (!link || link.classList.contains('heading-anchor')) return;
  const href = link.getAttribute('href');
  if (!href || href === '#') return;
  const targetId = decodeURIComponent(href.slice(1));
  const targetEl = targetId === '__doc-title__' ? article.querySelector('.hero') : document.getElementById(targetId);
  if (!targetEl && targetId !== '__doc-title__') return;

  // Capture current reading state before jumping
  const currentActive = detectActiveHeading() || (hasHero ? '__doc-title__' : (headings[0]?.id ?? ''));
  const currentSearch = search ? search.value.trim() : '';
  backStack.push({
    y: window.scrollY,
    id: currentActive,
    linkEl: link,
    label: getSectionLabel(currentActive) || 'Previous section',
    searchQuery: currentSearch || undefined
  });
  forwardStack.length = 0; // Clear forward stack on new jump
  updateNavHistoryUI();

  // If search is currently active, clear it so target document area is completely unhidden
  if (currentSearch && search) {
    search.value = '';
    rebuildSearch('');
    updateClearButton();
  }

  event.preventDefault();
  tocScrollActive = true;
  if (targetId === '__doc-title__') {
    window.scrollTo(0, 0);
  } else if (targetEl) {
    targetEl.scrollIntoView({ behavior: 'auto', block: 'start' });
  }
  setActive(targetId);
  highlightJumpTarget(targetId);
  history.replaceState(null, '', `#${targetId}`);
  tocScrollActive = false;
});

if (navClearBtn) {
  navClearBtn.addEventListener('click', (e) => {
    e.preventDefault();
    backStack.length = 0;
    forwardStack.length = 0;
    updateNavHistoryUI();
  });
}

if (navBackBtn) {
  navBackBtn.addEventListener('click', (e) => {
    e.preventDefault();
    navigateHistoryBack();
  });
}

if (navForwardBtn) {
  navForwardBtn.addEventListener('click', (e) => {
    e.preventDefault();
    navigateHistoryForward();
  });
}

// ── Keyboard shortcuts ─────────────────────────────────────────────────────
document.addEventListener('keydown', event => {
  // Alt + Left Arrow or Cmd + Left Arrow (or Escape when search is empty/closed) -> History Back
  if ((event.altKey && event.key === 'ArrowLeft') || (event.metaKey && event.key === 'ArrowLeft')) {
    if (backStack.length > 0) {
      event.preventDefault();
      navigateHistoryBack();
      return;
    }
  }

  // Alt + Right Arrow or Cmd + Right Arrow -> History Forward
  if ((event.altKey && event.key === 'ArrowRight') || (event.metaKey && event.key === 'ArrowRight')) {
    if (forwardStack.length > 0) {
      event.preventDefault();
      navigateHistoryForward();
      return;
    }
  }

  if (event.key === '/' && document.activeElement !== search) {
    event.preventDefault();
    if (window.innerWidth <= 640) setSearchMode(true);
    else search.focus();
  }
  if (event.key === 'Escape') {
    if (window.innerWidth <= 900 && body.classList.contains('nav-open')) {
      body.classList.remove('nav-open');
    }
    if (window.innerWidth <= 640 && body.classList.contains('search-mode')) {
      setSearchMode(false);
    }
    if (settings.classList.contains('open')) settings.classList.remove('open');
    if (search.value) {
      search.value = '';
      search.dispatchEvent(new Event('input'));
    } else if (backStack.length > 0) {
      navigateHistoryBack();
    }
  }
});

// Land on hash target or restore exact saved state after browser restores scroll.
let savedState = null;
try { savedState = JSON.parse(sessionStorage.getItem(scrollStateKey) || 'null'); } catch (_) {}

initialScrollDone = false;

const initialHash = location.hash ? decodeURIComponent(location.hash.slice(1)) : null;
if (initialHash) {
  const target = document.getElementById(initialHash);
  if (target) {
    const targetTop = headingOffsetTop(target);
    const expectedY = Math.max(0, targetTop - 88);
    if (savedState && savedState.id === initialHash && typeof savedState.y === 'number') {
      window.scrollTo(0, savedState.y);
    } else if (window.scrollY === 0 || Math.abs(window.scrollY - expectedY) > 80) {
      window.scrollTo(0, expectedY);
    }
    setActive(initialHash);
  }
} else if (savedState && typeof savedState.y === 'number' && window.scrollY === 0) {
  window.scrollTo(0, savedState.y);
  if (savedState.id) setActive(savedState.id);
}

doScrollUpdate();
initialScrollDone = true;
