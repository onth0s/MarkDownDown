// ── Core DOM, Navigation Stack & State ──────────────────────────────────────
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
let initialScrollDone = false;

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

function highlightJumpTarget(target) {
  if (!target) return;
  let el = null;
  if (typeof target === 'string') {
    el = target === '__doc-title__' ? (article.querySelector('.hero h1') || article.querySelector('.hero')) : document.getElementById(target);
  } else if (target instanceof Element) {
    el = target;
  }
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

  const prev = backStack.pop();

  const currentEntry = {
    y: window.scrollY,
    id: currentActive,
    label: getSectionLabel(currentActive) || 'Forward',
    linkEl: prev.linkEl,
    searchQuery: currentSearch || undefined
  };
  forwardStack.push(currentEntry);

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

  window.scrollTo(0, targetY);
  // Pulse the exact link that initiated the navigation if available, otherwise the section heading
  highlightJumpTarget(prev.linkEl || prev.id);
  tocScrollActive = false;
  if (prev.id) setActive(prev.id);
}

function navigateHistoryForward() {
  if (!forwardStack.length) return;
  const currentActive = detectActiveHeading() || (hasHero ? '__doc-title__' : (headings[0]?.id ?? ''));
  const currentSearch = search ? search.value.trim() : '';

  const next = forwardStack.pop();

  const currentEntry = {
    y: window.scrollY,
    id: currentActive,
    label: (next.linkEl ? (next.linkEl.textContent.trim() || getSectionLabel(currentActive)) : getSectionLabel(currentActive)) || 'Back',
    linkEl: next.linkEl,
    searchQuery: currentSearch || undefined
  };
  backStack.push(currentEntry);

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

  window.scrollTo(0, targetY);
  highlightJumpTarget(next.id);
  tocScrollActive = false;
  if (next.id) setActive(next.id);
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
