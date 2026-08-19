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

function rgbToHsl(r, g, b) {
  const rNorm = r / 255, gNorm = g / 255, bNorm = b / 255;
  const max = Math.max(rNorm, gNorm, bNorm), min = Math.min(rNorm, gNorm, bNorm);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rNorm: h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0); break;
      case gNorm: h = (bNorm - rNorm) / d + 2; break;
      case bNorm: h = (rNorm - gNorm) / d + 4; break;
    }
    h /= 6;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function hslToRgb(h, s, l) {
  const hNorm = h / 360, sNorm = s / 100, lNorm = l / 100;
  if (sNorm === 0) {
    const v = Math.round(lNorm * 255);
    return [v, v, v];
  }
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = lNorm < 0.5 ? lNorm * (1 + sNorm) : lNorm + sNorm - lNorm * sNorm;
  const p = 2 * lNorm - q;
  return [
    Math.round(hue2rgb(p, q, hNorm + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, hNorm) * 255),
    Math.round(hue2rgb(p, q, hNorm - 1 / 3) * 255)
  ];
}

function hexToHsl(hex) {
  let n = hex.replace('#', '');
  if (n.length === 3) n = n.split('').map(c => c + c).join('');
  return rgbToHsl(parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16));
}

function hslToHex(h, s, l) {
  const [r, g, b] = hslToRgb(h, s, l);
  return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
}

const docAccent = '__ACCENT__';
const docTheme = '__THEME__';
const faviconTmpl = '__FAVICON__';

function setAccent(hex, isInitial = false) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return;
  root.style.setProperty('--accent', hex);
  root.style.setProperty('--accent-rgb', hexToRgb(hex));
  const rgb = hexToRgb(hex).split(',').map(Number);
  const y = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
  root.style.setProperty('--accent-fg', y > 170 ? '#172033' : '#ffffff');
  root.style.setProperty('--accent-tint-dark', `color-mix(in srgb, __BASE_DARK_BG__ __DARK_BG_MIX__, ${hex} __DARK_BG_TINT__)`);
  root.style.setProperty('--accent-surface-dark', `color-mix(in srgb, __BASE_DARK_SURFACE__ __DARK_SURF_MIX__, ${hex} __DARK_SURF_TINT__)`);
  root.style.setProperty('--accent-tint-light', `color-mix(in srgb, __BASE_LIGHT_BG__ __LIGHT_BG_MIX__, ${hex} __LIGHT_BG_TINT__)`);
  root.style.setProperty('--accent-surface-light', `color-mix(in srgb, __BASE_LIGHT_SURFACE__ __LIGHT_SURF_MIX__, ${hex} __LIGHT_SURF_TINT__)`);
  
  const dark = darkenAccent(hex);
  const fg = y > 170 ? '#172033' : '#ffffff';
  const [targetH, targetS, targetL] = hexToHsl(hex);
  
  const favicon = document.getElementById('dynamicFavicon');
  // Update dynamic favicon only if not initial matching static HTML, or when actively changed
  if (favicon) {
    if (faviconTmpl.startsWith('data:')) {
      if (favicon.getAttribute('href') !== faviconTmpl) {
        favicon.href = faviconTmpl;
      }
    } else if (!isInitial || hex.toLowerCase() !== docAccent.toLowerCase()) {
      const svg = faviconTmpl
        .replace(/\{accent\}/g, hex)
        .replace(/\{accentDark\}/g, dark)
        .replace(/\{accentFg\}/g, fg)
        .replace(/\{L_(\d+)\}/g, (_, lStr) => {
          const l = parseInt(lStr, 10);
          const effectiveL = (l > 15 && l < 85) ? l : targetL;
          return hslToHex(targetH, targetS, effectiveL);
        });
      const newHref = 'data:image/svg+xml,' + encodeURIComponent(svg);
      if (favicon.getAttribute('href') !== newHref) {
        favicon.href = newHref;
      }
    }
  }

  // Dynamically recolor navbar SVG elements only if accent diverges from pre-compiled static HTML
  if (!isInitial || hex.toLowerCase() !== docAccent.toLowerCase()) {
    const navBrandLogo = document.querySelector('.brand svg.brand-logo');
    if (navBrandLogo) {
      navBrandLogo.querySelectorAll('[data-l]').forEach(el => {
        const l = parseInt(el.getAttribute('data-l'), 10);
        const effectiveL = (!isNaN(l) && l > 15 && l < 85) ? l : targetL;
        const mappedHex = hslToHex(targetH, targetS, effectiveL);
        if (el.hasAttribute('fill') && el.getAttribute('fill') !== 'none') {
          el.setAttribute('fill', mappedHex);
        }
        if (el.hasAttribute('stroke') && el.getAttribute('stroke') !== 'none') {
          el.setAttribute('stroke', mappedHex);
        }
      });
    }
  }

  if (!isInitial) {
    store.set('mdd-accent', hex);
  }
  const picker = document.getElementById('colorPicker');
  if (picker) picker.value = hex;
  document.querySelectorAll('.swatch').forEach(s =>
    s.classList.toggle('active', s.dataset.color.toLowerCase() === hex.toLowerCase())
  );
}

function setTheme(theme, isInitial = false) {
  root.dataset.theme = theme === 'light' ? 'light' : 'dark';
  if (!isInitial) {
    store.set('mdd-theme', root.dataset.theme);
  }
}

// Initialize on page load without causing flash
const initialAccent = store.get('mdd-accent', docAccent);
const initialTheme = store.get('mdd-theme', docTheme);
setAccent(initialAccent, true);
setTheme(initialTheme, true);
