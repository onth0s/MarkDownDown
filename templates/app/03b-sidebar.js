// ── Sidebar Resizing, Collapse & Positioning ────────────────────────────────
const navBtn = document.getElementById('navBtn');
const sidebarResizer = document.getElementById('sidebarResizer');
const sidebarReopenBtn = document.getElementById('sidebarReopenBtn');
const sidebarPosBtn = document.getElementById('sidebarPosBtn');
const dropdownSidebarPosBtn = document.getElementById('dropdownSidebarPosBtn');
const dropdownSidebarPosBadge = document.getElementById('dropdownSidebarPosBadge');

const DEFAULT_SIDEBAR_WIDTH = 280;
const MIN_SIDEBAR_WIDTH = 160;
const COLLAPSE_THRESHOLD = 130;

function getStoredSidebarWidth() {
  try {
    const val = parseInt(localStorage.getItem('mdd_sidebar_w'), 10);
    return (!isNaN(val) && val > MIN_SIDEBAR_WIDTH && val <= 800) ? val : DEFAULT_SIDEBAR_WIDTH;
  } catch (_) {
    return DEFAULT_SIDEBAR_WIDTH;
  }
}

function setSidebarWidth(width, persist = true) {
  root.style.setProperty('--sidebar-w', `${width}px`);
  if (persist) {
    try { localStorage.setItem('mdd_sidebar_w', String(width)); } catch (_) {}
  }
  updateNavHistoryUI();
}

function setSidebarCollapsed(collapsed) {
  body.classList.add('sidebar-animating');
  body.classList.toggle('sidebar-collapsed', collapsed);
  try { localStorage.setItem('mdd_sidebar_collapsed', String(collapsed)); } catch (_) {}
  if (!collapsed) {
    const w = getStoredSidebarWidth();
    root.style.setProperty('--sidebar-w', `${w}px`);
  }
  updateNavHistoryUI();
  setTimeout(() => {
    body.classList.remove('sidebar-animating');
    updateNavHistoryUI();
  }, 320);
}

function setSidebarPosition(pos) {
  const isRight = pos === 'right';
  body.classList.toggle('sidebar-right', isRight);
  const posText = isRight ? 'Right' : 'Left';
  if (sidebarPosBtn) {
    sidebarPosBtn.textContent = posText;
  }
  if (dropdownSidebarPosBadge) {
    dropdownSidebarPosBadge.textContent = posText;
  }
  try { localStorage.setItem('mdd_sidebar_pos', isRight ? 'right' : 'left'); } catch (_) {}
  updateNavHistoryUI();
}

// Initialize stored sidebar states on load
try {
  const storedPos = localStorage.getItem('mdd_sidebar_pos');
  if (storedPos === 'right') {
    setSidebarPosition('right');
  } else {
    setSidebarPosition('left');
  }

  const storedCollapsed = localStorage.getItem('mdd_sidebar_collapsed') === 'true';
  const storedWidth = getStoredSidebarWidth();
  if (storedWidth !== DEFAULT_SIDEBAR_WIDTH) {
    setSidebarWidth(storedWidth, false);
  }
  if (storedCollapsed && window.innerWidth > 900) {
    setSidebarCollapsed(true);
  }
} catch (_) {}

if (sidebarPosBtn) {
  sidebarPosBtn.addEventListener('click', () => {
    const currentIsRight = body.classList.contains('sidebar-right');
    setSidebarPosition(currentIsRight ? 'left' : 'right');
    if (body.classList.contains('sidebar-collapsed')) {
      setSidebarCollapsed(false);
    }
  });
}

if (dropdownSidebarPosBtn) {
  dropdownSidebarPosBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    const currentIsRight = body.classList.contains('sidebar-right');
    setSidebarPosition(currentIsRight ? 'left' : 'right');
    if (body.classList.contains('sidebar-collapsed')) {
      setSidebarCollapsed(false);
    }
    closeDropdownMenu();
  });
}

if (sidebarReopenBtn) {
  sidebarReopenBtn.addEventListener('click', () => {
    sidebarReopenBtn.classList.remove('is-visible');
    setSidebarCollapsed(false);
  });
}

// Track cursor approach to edge on whatever Y axis it approaches
window.addEventListener('mousemove', (e) => {
  if (window.innerWidth <= 900 || !body.classList.contains('sidebar-collapsed') || !sidebarReopenBtn) {
    if (sidebarReopenBtn) sidebarReopenBtn.classList.remove('is-visible');
    return;
  }
  const isRight = body.classList.contains('sidebar-right');
  const dist = isRight ? (window.innerWidth - e.clientX) : e.clientX;

  if (dist <= 56 && e.clientY >= 64) {
    const arrowH = 48;
    const topMin = 64 + 8;
    const topMax = window.innerHeight - arrowH - 12;
    const clampedY = Math.max(topMin, Math.min(topMax, e.clientY - (arrowH / 2)));
    sidebarReopenBtn.style.top = `${clampedY}px`;
    sidebarReopenBtn.classList.add('is-visible');
  } else if (!sidebarReopenBtn.matches(':hover')) {
    sidebarReopenBtn.classList.remove('is-visible');
  }
});

if (navBtn) {
  navBtn.addEventListener('click', () => {
    body.classList.toggle('nav-open');
    updateNavHistoryUI();
  });
}

if (sidebar) {
  sidebar.addEventListener('transitionend', () => {
    body.classList.remove('sidebar-animating');
    updateNavHistoryUI();
  });
}

if (sidebarResizer) {
  // Double-click to reset width to default 280px
  sidebarResizer.addEventListener('dblclick', () => {
    setSidebarWidth(DEFAULT_SIDEBAR_WIDTH);
    setSidebarCollapsed(false);
  });

  let isDragging = false;
  let startX = 0;
  let startWidth = DEFAULT_SIDEBAR_WIDTH;

  sidebarResizer.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return; // Primary mouse button only
    isDragging = true;
    startX = e.clientX;
    const currentW = parseInt(getComputedStyle(root).getPropertyValue('--sidebar-w'), 10) || DEFAULT_SIDEBAR_WIDTH;
    startWidth = currentW > MIN_SIDEBAR_WIDTH ? currentW : DEFAULT_SIDEBAR_WIDTH;
    sidebarResizer.setPointerCapture(e.pointerId);
    body.classList.add('is-resizing');
    e.preventDefault();
  });

  sidebarResizer.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    const isRight = body.classList.contains('sidebar-right');
    const delta = isRight ? (startX - e.clientX) : (e.clientX - startX);
    const newWidth = startWidth + delta;
    const maxW = Math.min(650, Math.round(window.innerWidth * 0.45));

    if (newWidth < COLLAPSE_THRESHOLD) {
      if (!body.classList.contains('sidebar-collapsed')) {
        setSidebarCollapsed(true);
        setSidebarWidth(startWidth, true);
      }
    } else {
      if (body.classList.contains('sidebar-collapsed')) {
        setSidebarCollapsed(false);
      }
      const clamped = Math.max(MIN_SIDEBAR_WIDTH, Math.min(maxW, newWidth));
      setSidebarWidth(clamped, false);
    }
  });

  const stopDragging = (e) => {
    if (!isDragging) return;
    isDragging = false;
    body.classList.remove('is-resizing');
    if (sidebarResizer.hasPointerCapture(e.pointerId)) {
      sidebarResizer.releasePointerCapture(e.pointerId);
    }
    if (body.classList.contains('sidebar-collapsed')) {
      setSidebarWidth(startWidth, true);
    } else {
      const currentW = parseInt(getComputedStyle(root).getPropertyValue('--sidebar-w'), 10) || DEFAULT_SIDEBAR_WIDTH;
      setSidebarWidth(currentW, true);
    }
  };

  sidebarResizer.addEventListener('pointerup', stopDragging);
  sidebarResizer.addEventListener('pointercancel', stopDragging);
}

// ── Mobile search toggle ───────────────────────────────────────────────────
const searchToggle = document.getElementById('searchToggle');
const searchIconSvg =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>';

function setSearchMode(on) {
  body.classList.toggle('search-mode', on);
  searchToggle.classList.toggle('close', on);
  searchToggle.setAttribute('aria-expanded', String(on));
  searchToggle.setAttribute('aria-label', on ? 'Close search' : 'Search');
  requestAnimationFrame(() => {
    setTrustedSvg(searchToggle, searchIconSvg);
    if (on) search.focus();
  });
}

searchToggle.addEventListener('click', () => {
  setSearchMode(!body.classList.contains('search-mode'));
});

document.addEventListener('click', (event) => {
  if (settings && !settings.contains(event.target) && event.target.id !== 'settingsBtn') {
    settings.classList.remove('open');
  }
  if (dropdownMenu && !dropdownMenu.contains(event.target) && !menuBtn?.contains(event.target)) {
    closeDropdownMenu();
  }
  if (body.classList.contains('nav-open') &&
      sidebar && !sidebar.contains(event.target) && event.target.id !== 'navBtn') {
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
  if (window.innerWidth > 900 && body.classList.contains('nav-open') && !body.classList.contains('sidebar-collapsed')) {
    body.classList.remove('nav-open');
  }
  updateNavHistoryUI();
});
