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

  const navHistoryBar = document.getElementById('navHistoryBar');
  const navClearBtn = document.getElementById('navClearBtn');
  const navBackBtn = document.getElementById('navBackBtn');
  const navBackLabel = document.getElementById('navBackLabel');
  const navForwardBtn = document.getElementById('navForwardBtn');
  const navForwardLabel = document.getElementById('navForwardLabel');

  const MDD_ROUTES = __ROUTES__;

  // ── Bidirectional Navigation Stack ──────────────────────────────────────────
  const backStack = [];
  const forwardStack = [];

  function getSectionLabel(id) {
    if (!id) return '';
    if (MDD_ROUTES && MDD_ROUTES[id]) return MDD_ROUTES[id];
    const el = document.getElementById(id);
    if (el) {
      const text = [...el.childNodes]
        .filter(n => !n.classList?.contains('heading-anchor'))
        .map(n => n.textContent)
        .join('')
        .trim();
      if (text) return text.length > 40 ? text.slice(0, 37) + '…' : text;
    }
    return id;
  }

  function updateNavHistoryUI() {
    if (!navHistoryBar) return;
    const hasBack = backStack.length > 0;
    const hasForward = forwardStack.length > 0;

    if (!hasBack && !hasForward) {
      navHistoryBar.hidden = true;
      return;
    }

    navHistoryBar.hidden = false;

    if (hasBack) {
      navBackBtn.hidden = false;
      const topBack = backStack[backStack.length - 1];
      navBackLabel.textContent = topBack.label || 'Back';
    } else {
      navBackBtn.hidden = true;
    }

    if (hasForward) {
      navForwardBtn.hidden = false;
      const topFwd = forwardStack[forwardStack.length - 1];
      navForwardLabel.textContent = topFwd.label || 'Forward';
    } else {
      navForwardBtn.hidden = true;
    }

    // Position strictly to the right outside of the sidebar
    if (sidebar && window.innerWidth > 900) {
      const rect = sidebar.getBoundingClientRect();
      navHistoryBar.style.left = `${Math.round(rect.right + 20)}px`;
    } else {
      navHistoryBar.style.left = 'max(16px, env(safe-area-inset-left))';
    }
  }

  function highlightJumpTarget(id) {
    if (!id) return;
    const el = id === '__doc-title__' ? article.querySelector('.hero') : document.getElementById(id);
    if (el) {
      el.classList.remove('is-jump-returned');
      void el.offsetWidth; // trigger reflow
      el.classList.add('is-jump-returned');
      setTimeout(() => el.classList.remove('is-jump-returned'), 1300);
    }
  }

  function navigateHistoryBack() {
    if (!backStack.length) return;
    const currentActive = detectActiveHeading() || (hasHero ? '__doc-title__' : (headings[0]?.id ?? ''));
    const currentSearch = search ? search.value.trim() : '';
    const currentEntry = {
      y: window.scrollY,
      id: currentActive,
      label: getSectionLabel(currentActive) || 'Forward',
      searchQuery: currentSearch || undefined
    };
    forwardStack.push(currentEntry);

    const prev = backStack.pop();
    updateNavHistoryUI();

    if (prev.searchQuery !== undefined) {
      if (search) {
        search.value = prev.searchQuery;
        rebuildSearch(prev.searchQuery);
        updateClearButton();
      }
    } else if (search && search.value) {
      search.value = '';
      rebuildSearch('');
      updateClearButton();
    }

    tocScrollActive = true;
    const targetY = prev.y;
    if (prev.id) {
      setActive(prev.id);
    }

    window.scrollTo({ top: targetY, behavior: 'smooth' });
    highlightJumpTarget(prev.id);
    onScrollEnd(() => {
      tocScrollActive = false;
      if (prev.id) setActive(prev.id);
    });
  }

  function navigateHistoryForward() {
    if (!forwardStack.length) return;
    const currentActive = detectActiveHeading() || (hasHero ? '__doc-title__' : (headings[0]?.id ?? ''));
    const currentSearch = search ? search.value.trim() : '';
    const currentEntry = {
      y: window.scrollY,
      id: currentActive,
      label: getSectionLabel(currentActive) || 'Back',
      searchQuery: currentSearch || undefined
    };
    backStack.push(currentEntry);

    const next = forwardStack.pop();
    updateNavHistoryUI();

    if (next.searchQuery !== undefined) {
      if (search) {
        search.value = next.searchQuery;
        rebuildSearch(next.searchQuery);
        updateClearButton();
      }
    } else if (search && search.value) {
      search.value = '';
      rebuildSearch('');
      updateClearButton();
    }

    tocScrollActive = true;
    const targetY = next.y;
    if (next.id) {
      setActive(next.id);
    }

    window.scrollTo({ top: targetY, behavior: 'smooth' });
    highlightJumpTarget(next.id);
    onScrollEnd(() => {
      tocScrollActive = false;
      if (next.id) setActive(next.id);
    });
  }

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

  const hasHero = !!article.querySelector('.hero');
  toc.replaceChildren();
  if (hasHero) {
    const titleLi = document.createElement('li');
    const titleA = document.createElement('a');
    titleA.textContent = document.title || 'Untitled';
    titleA.className = 'l1';
    titleA.dataset.target = '__doc-title__';
    titleLi.appendChild(titleA);
    toc.appendChild(titleLi);
  }
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

    const anchor = document.createElement('a');
    anchor.className = 'heading-anchor';
    anchor.href = `#${heading.id}`;
    anchor.dataset.target = heading.id;
    anchor.setAttribute('aria-label', 'Copy link to section');
    anchor.textContent = '#';
    heading.appendChild(anchor);
  });

  const heroH1 = article.querySelector('.hero h1');
  if (heroH1) {
    const heroAnchor = document.createElement('a');
    heroAnchor.className = 'heading-anchor';
    heroAnchor.href = '#';
    heroAnchor.dataset.target = '__doc-title__';
    heroAnchor.setAttribute('aria-label', 'Copy link to document title');
    heroAnchor.textContent = '#';
    heroH1.appendChild(heroAnchor);
  }

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

  article.addEventListener('click', async (event) => {
    const anchor = event.target.closest('.heading-anchor');
    if (!anchor) return;
    event.preventDefault();
    const targetId = anchor.dataset.target || anchor.getAttribute('href')?.replace(/^#/, '');

    if (window.innerWidth <= 900) body.classList.remove('nav-open');
    tocScrollActive = true;

    const isFirstHeadingNoHero = !hasHero && targetId && headings[0]?.id === targetId;
    let url = location.href.split('#')[0];
    if (targetId === '__doc-title__' || !targetId || isFirstHeadingNoHero) {
      if (targetId === '__doc-title__' || !targetId) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        const heading = document.getElementById(targetId);
        if (heading) heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      setActive(targetId || '__doc-title__');
    } else {
      const heading = document.getElementById(targetId);
      if (heading) {
        heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      setActive(targetId);
      url += `#${targetId}`;
    }
    onScrollEnd(() => { tocScrollActive = false; });

    let copied = false;
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url);
        copied = true;
      } catch (_) {
        copied = false;
      }
    }
    if (!copied) {
      try {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.top = '-9999px';
        ta.style.left = '-9999px';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        copied = document.execCommand('copy');
        ta.remove();
      } catch (_) {
        copied = false;
      }
    }

    if (copied) {
      anchor.textContent = 'Link copied!';
      anchor.classList.add('copied');
    } else {
      anchor.textContent = 'Copy failed';
      anchor.classList.add('copied');
    }
    clearTimeout(anchor._timer);
    anchor._timer = setTimeout(() => {
      anchor.textContent = '#';
      anchor.classList.remove('copied');
    }, 1000);
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
    updateNavHistoryUI();
  });

  // ── Copy buttons ───────────────────────────────────────────────────────────
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const parent = btn.parentElement;
      let code = parent.querySelector('code')?.textContent ?? '';
      if (parent.classList.contains('diagram')) {
        const title = parent.getAttribute('data-title');
        const titleLine = title ? `TITLE: ${title}\n` : '';
        const dir = parent.getAttribute('data-direction');
        const fenceHeader = dir ? `diagram ${dir}` : 'diagram';
        code = '```' + fenceHeader + '\n' + titleLine + code.trim() + '\n```';
      } else if (parent.classList.contains('table')) {
        const title = parent.getAttribute('data-title');
        const titleLine = title ? `TITLE: ${title}\n` : '';
        code = '```table\n' + titleLine + code.trim() + '\n```';
      }
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
  const scrollStateKey = `mdd_scroll_${location.pathname}`;
  function setActive(id) {
    if (!id || id === lastActiveId) return;
    lastActiveId = id;
    const isBareTarget = id === '__doc-title__' || (!hasHero && (id === headings[0]?.id && window.scrollY === 0));
    if (isBareTarget && history.replaceState && location.hash) {
      history.replaceState(null, '', location.pathname + location.search);
      try { sessionStorage.setItem(scrollStateKey, JSON.stringify({ id: '', y: window.scrollY })); } catch (_) {}
    } else if (!isBareTarget && id !== '__doc-title__' && history.replaceState && location.hash !== `#${id}`) {
      history.replaceState(null, '', `#${id}`);
      try { sessionStorage.setItem(scrollStateKey, JSON.stringify({ id, y: window.scrollY })); } catch (_) {}
    }
    const activeLink = tocLinks.find(a => a.dataset.target === id);
    tocLinks.forEach(a => a.classList.toggle('active', a === activeLink));
    if (!activeLink) return;
    const sidebarRect = sidebar.getBoundingClientRect();
    const linkRect = activeLink.getBoundingClientRect();
    const sidebarCenter = sidebarRect.top + sidebarRect.height / 2;
    const linkCenter = linkRect.top + linkRect.height / 2;
    const delta = linkCenter - sidebarCenter;
    const maxSidebarScroll = Math.max(0, sidebar.scrollHeight - sidebar.clientHeight);
    const target = Math.max(0, Math.min(maxSidebarScroll, sidebar.scrollTop + delta));

    if (!initialScrollDone) {
      sidebar.scrollTop = target;
    } else if (Math.abs(delta) > sidebarRect.height * 0.18) {
      animateSidebarTo(target, 440);
    }
  }

  function headingOffsetTop(el) {
    return el.getBoundingClientRect().top + window.scrollY;
  }

  function detectActiveHeading() {
    if (window.scrollY === 0) return hasHero ? '__doc-title__' : (headings[0]?.id ?? null);
    if (!headings.length) return null;

    const THRESHOLD = 92;
    let activeIdx = 0;
    for (let i = 0; i < headings.length; i++) {
      const top = headingOffsetTop(headings[i]);
      if (top <= window.scrollY + THRESHOLD) {
        activeIdx = i;
      }
    }

    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    if (window.scrollY >= maxScroll - 4) {
      const lastTop = headingOffsetTop(headings[headings.length - 1]);
      if (lastTop <= window.scrollY + THRESHOLD) {
        activeIdx = headings.length - 1;
      }
    }

    return headings[activeIdx]?.id ?? null;
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
    const topId = hasHero ? '__doc-title__' : (headings[0]?.id ?? null);
    if (topId) setActive(topId);
    animateSidebarTo(0, 300);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    onScrollEnd(() => {
      tocScrollActive = false;
      sidebar.scrollTop = 0;
      if (topId) setActive(topId);
    });
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
})();
