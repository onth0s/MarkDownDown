(() => {
  'use strict';

  const root = document.documentElement;
  const body = document.body;
  const article = document.getElementById('article');
  const toc = document.getElementById('toc');
  const sidebar = document.getElementById('sidebar');
  const search = document.getElementById('search');
  const count = document.getElementById('searchCount');
  const noResults = document.getElementById('noResults');
  const settings = document.getElementById('settings');
  const progress = document.getElementById('progress');
  const backtop = document.getElementById('backtop');

  const store = {
    get(key, fallback) {
      try { return localStorage.getItem(key) ?? fallback; } catch (_) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); } catch (_) {}
    }
  };

  function onScrollEnd(callback) {
    if ('onscrollend' in window) {
      document.addEventListener('scrollend', callback, { once: true });
    } else {
      let timer;
      const handler = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          document.removeEventListener('scroll', handler);
          callback();
        }, 100);
      };
      document.addEventListener('scroll', handler, { passive: true });
      handler();
    }
  }

  function hexToRgb(hex) {
    const n = hex.replace('#', '');
    const v = parseInt(n, 16);
    return `${(v >> 16) & 255},${(v >> 8) & 255},${v & 255}`;
  }

  function darkenAccent(hex) {
    const n = hex.replace('#', '');
    const v = parseInt(n, 16);
    const r = Math.round(((v >> 16) & 255) * 0.5);
    const g = Math.round(((v >> 8) & 255) * 0.5);
    const b = Math.round((v & 255) * 0.5);
    return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
  }

  const faviconTmpl = '__FAVICON__';

  function setAccent(hex) {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return;
    root.style.setProperty('--accent', hex);
    root.style.setProperty('--accent-rgb', hexToRgb(hex));
    const rgb = hexToRgb(hex).split(',').map(Number);
    const y = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
    root.style.setProperty('--accent-fg', y > 170 ? '#172033' : '#ffffff');
    root.style.setProperty('--accent-tint-dark', `color-mix(in srgb, #0b0f16 92%, ${hex} 8%)`);
    root.style.setProperty('--accent-surface-dark', `color-mix(in srgb, #111827 90%, ${hex} 10%)`);
    root.style.setProperty('--accent-tint-light', `color-mix(in srgb, #f4f7fb 94%, ${hex} 6%)`);
    root.style.setProperty('--accent-surface-light', `color-mix(in srgb, #ffffff 95%, ${hex} 5%)`);
    const dark = darkenAccent(hex);
    const svg = faviconTmpl.replace(/\{accent\}/g, hex).replace(/\{accentDark\}/g, dark);
    const favicon = document.getElementById('dynamicFavicon');
    if (favicon) favicon.href = 'data:image/svg+xml,' + encodeURIComponent(svg);
    store.set('clds-accent', hex);
    const picker = document.getElementById('colorPicker');
    if (picker) picker.value = hex;
    document.querySelectorAll('.swatch').forEach(s =>
      s.classList.toggle('active', s.dataset.color.toLowerCase() === hex.toLowerCase())
    );
  }

  function setTheme(theme) {
    root.dataset.theme = theme === 'light' ? 'light' : 'dark';
    store.set('clds-theme', root.dataset.theme);
  }

  setAccent(store.get('clds-accent', '__ACCENT__'));
  setTheme(store.get('clds-theme', 'dark'));

  // ── TOC ────────────────────────────────────────────────────────────────────
  const headings = [...article.querySelectorAll('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]')]
    .filter(h => !h.closest('.hero'));

  toc.replaceChildren();
  const titleLi = document.createElement('li');
  const titleA = document.createElement('a');
  titleA.textContent = document.title || 'Untitled';
  titleA.className = 'l1';
  titleA.dataset.target = '__doc-title__';
  titleLi.appendChild(titleA);
  toc.appendChild(titleLi);
  headings.forEach((heading) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    const level = Number(heading.tagName.substring(1));
    a.href = `#${heading.id}`;
    a.textContent = heading.textContent.trim();
    a.className = `l${level}`;
    a.dataset.target = heading.id;
    li.appendChild(a);
    toc.appendChild(li);
  });

  toc.addEventListener('click', (event) => {
    const link = event.target.closest('a[data-target]');
    if (!link) return;
    event.preventDefault();
    if (window.innerWidth <= 900) body.classList.remove('nav-open');
    tocScrollActive = true;
    if (link.dataset.target === '__doc-title__') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      const target = document.getElementById(link.dataset.target);
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setActive(link.dataset.target);
    onScrollEnd(() => { tocScrollActive = false; });
  });

  // ── Theme / Appearance ─────────────────────────────────────────────────────
  document.getElementById('themeBtn').addEventListener('click', () => {
    setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark');
  });

  document.getElementById('settingsBtn').addEventListener('click', (event) => {
    event.stopPropagation();
    settings.classList.toggle('open');
  });

  document.getElementById('colorPicker').addEventListener('input', e => setAccent(e.target.value));
  document.querySelectorAll('.swatch').forEach(s =>
    s.addEventListener('click', () => setAccent(s.dataset.color))
  );

  document.getElementById('navBtn').addEventListener('click', () => {
    body.classList.toggle('nav-open');
  });

  // ── Mobile search toggle ───────────────────────────────────────────────────
  const searchToggle = document.getElementById('searchToggle');
  const searchIconSvg =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>';

  function setSearchMode(on) {
    body.classList.toggle('search-mode', on);
    searchToggle.classList.toggle('close', on);
    searchToggle.setAttribute('aria-expanded', String(on));
    searchToggle.setAttribute('aria-label', on ? 'Close search' : 'Search');
    requestAnimationFrame(() => {
      searchToggle.innerHTML = searchIconSvg;
      if (on) search.focus();
    });
  }

  searchToggle.addEventListener('click', () => {
    setSearchMode(!body.classList.contains('search-mode'));
  });

  document.addEventListener('click', (event) => {
    if (!settings.contains(event.target) && event.target.id !== 'settingsBtn') {
      settings.classList.remove('open');
    }
    if (window.innerWidth <= 900 && body.classList.contains('nav-open') &&
        !sidebar.contains(event.target) && event.target.id !== 'navBtn') {
      body.classList.remove('nav-open');
    }
    if (window.innerWidth <= 640 && body.classList.contains('search-mode') &&
        !searchToggle.contains(event.target) &&
        !search.closest('.search-box')?.contains(event.target)) {
      setSearchMode(false);
    }
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 640 && body.classList.contains('search-mode')) {
      setSearchMode(false);
    }
    if (window.innerWidth > 900 && body.classList.contains('nav-open')) {
      body.classList.remove('nav-open');
    }
  });

  // ── Copy buttons ───────────────────────────────────────────────────────────
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const code = btn.parentElement.querySelector('code')?.innerText ?? '';
      const old = btn.textContent;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(code);
        } else {
          const ta = document.createElement('textarea');
          ta.value = code;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
        }
        btn.textContent = 'Copied';
      } catch (_) {
        btn.textContent = 'Copy failed';
      }
      setTimeout(() => btn.textContent = old, 1000);
    });
  });

  // ── Scroll spy ─────────────────────────────────────────────────────────────
  const tocLinks = [...toc.querySelectorAll('a')];
  let sidebarScrollAnimation = null;

  function animateSidebarTo(targetScrollTop, duration) {
    duration = duration || 420;
    const maxScroll = Math.max(0, sidebar.scrollHeight - sidebar.clientHeight);
    const target = Math.max(0, Math.min(maxScroll, targetScrollTop));
    const start = sidebar.scrollTop;
    const distance = target - start;
    if (Math.abs(distance) < 1) return;
    if (sidebarScrollAnimation) cancelAnimationFrame(sidebarScrollAnimation);
    const startTime = performance.now();
    const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const frame = now => {
      const p = Math.min(1, (now - startTime) / duration);
      sidebar.scrollTop = start + distance * ease(p);
      if (p < 1) sidebarScrollAnimation = requestAnimationFrame(frame);
      else sidebarScrollAnimation = null;
    };
    sidebarScrollAnimation = requestAnimationFrame(frame);
  }

  let lastActiveId = null;
  let initialScrollDone = false;
  let tocScrollActive = false;

  function setActive(id) {
    if (!id || id === lastActiveId) return;
    lastActiveId = id;
    if (id === '__doc-title__' && history.replaceState && location.hash) {
      history.replaceState(null, '', location.pathname + location.search);
    } else if (id !== '__doc-title__' && history.replaceState && location.hash !== `#${id}`) {
      history.replaceState(null, '', `#${id}`);
    }
    const activeLink = tocLinks.find(a => a.dataset.target === id);
    tocLinks.forEach(a => a.classList.toggle('active', a === activeLink));
    if (!activeLink) return;
    const sidebarRect = sidebar.getBoundingClientRect();
    const linkRect = activeLink.getBoundingClientRect();
    const sidebarCenter = sidebarRect.top + sidebarRect.height / 2;
    const linkCenter = linkRect.top + linkRect.height / 2;
    const delta = linkCenter - sidebarCenter;
    if (Math.abs(delta) > sidebarRect.height * 0.18) {
      const target = Math.max(0, Math.min(
        Math.max(0, sidebar.scrollHeight - sidebar.clientHeight),
        sidebar.scrollTop + delta
      ));
      if (!initialScrollDone) {
        sidebar.scrollTop = target;
        initialScrollDone = true;
      } else {
        animateSidebarTo(target, 440);
      }
    } else if (!initialScrollDone) {
      initialScrollDone = true;
    }
  }

  function headingOffsetTop(el) {
    let top = 0;
    while (el) { top += el.offsetTop; el = el.offsetParent; }
    return top;
  }

  const headingOffsets = headings.map(h => headingOffsetTop(h));

  function detectActiveHeading() {
    if (window.scrollY === 0) return '__doc-title__';
    const THRESHOLD = 100;
    let idx = 0;
    for (let i = 0; i < headings.length; i++) {
      if (headingOffsets[i] <= window.scrollY + THRESHOLD) idx = i;
    }
    return headings[idx]?.id ?? null;
  }

  let ticking = false;
  let pendingTick = false;
  function doScrollUpdate() {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    progress.style.width = `${Math.min(100, Math.max(0, window.scrollY / max * 100))}%`;
    if (!tocScrollActive) {
      const id = detectActiveHeading();
      if (id) setActive(id);
    }
    ticking = false;
    if (pendingTick) { pendingTick = false; updateScrollUI(); }
  }
  function updateScrollUI() {
    if (ticking) { pendingTick = true; return; }
    ticking = true;
    requestAnimationFrame(doScrollUpdate);
  }

  window.addEventListener('scroll', updateScrollUI, { passive: true });
  window.addEventListener('resize', updateScrollUI);

  backtop.addEventListener('click', () => {
    tocScrollActive = true;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    onScrollEnd(() => { tocScrollActive = false; });
  });

  // ── Diagram / Table SVG highlight sync ─────────────────────────────────────
  // Diagrams and tables are pre-rendered as SVGs at compile time. This only
  // syncs search-match highlights onto the already-rendered SVG nodes.
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
      const svg = container.querySelector('.diagram-render svg, .table-render svg');
      const model = container.__diagramModel;
      if (!svg || !model) continue;
      const codeEl = container.querySelector('code');
      const byOrd = new Map();
      svg.querySelectorAll('[data-label-ord]').forEach(g =>
        byOrd.set(Number(g.getAttribute('data-label-ord')), g));
      for (const g of byOrd.values()) g.classList.remove('is-hit', 'is-current');
      for (const mark of container.querySelectorAll('mark[data-search-match="true"]')) {
        const off = codeEl ? sourceOffsetOf(mark, codeEl) : -1;
        if (off < 0) continue;
        const label = model.labels.find(l => off >= l.offset && off < l.offset + l.text.length);
        const g = label && byOrd.get(label.ord);
        if (!g) continue;
        g.classList.add('is-hit');
        if (mark.classList.contains('search-current')) g.classList.add('is-current');
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
      if (textNode.parentElement?.closest('svg')) continue;
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
    for (const mark of article.querySelectorAll('mark[data-search-match="true"]')) {
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
        a.textContent = group.heading.textContent.trim();
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
    updateSearchState();
    matches[0].mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
    const targetHeading = matches[currentMatch].heading;
    if (targetHeading?.id && history.replaceState) {
      history.replaceState(null, '', `#${targetHeading.id}`);
    }
    matches[currentMatch].mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
    updateSearchState();
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
  let lastTouchEnd = 0;
  document.addEventListener('touchend', event => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) event.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });

  // ── Hash navigation ────────────────────────────────────────────────────────
  window.addEventListener('hashchange', () => {
    const id = location.hash.slice(1);
    if (id && document.getElementById(id)) setActive(id);
  });

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  document.addEventListener('keydown', event => {
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
      }
    }
  });

  // Land on hash target and do initial sidebar snap after browser restores scroll.
  setTimeout(() => {
    doScrollUpdate();
    initialScrollDone = true;
    if (location.hash) {
      const target = document.getElementById(location.hash.slice(1));
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, 0);
})();