import { root, body, sidebar, search, settings, updateNavHistoryUI, store } from './01-core.js';
import { closeDropdownMenu } from './03a-theme.js';

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
  if (sidebarResizer) sidebarResizer.setAttribute('aria-valuenow', String(Math.round(width)));
  if (persist) {
    store.set('mdd_sidebar_w', String(width));
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

// Track cursor approach to edge on whatever Y axis it approaches (throttled via rAF)
let mouseMovePending = false;
let lastMouseX = 0;
let lastMouseY = 0;
window.addEventListener('mousemove', (e) => {
  if (window.innerWidth <= 900 || !body.classList.contains('sidebar-collapsed') || !sidebarReopenBtn) {
    if (sidebarReopenBtn?.classList.contains('is-visible')) {
      sidebarReopenBtn.classList.remove('is-visible');
    }
    return;
  }
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
  if (mouseMovePending) return;
  mouseMovePending = true;
  requestAnimationFrame(() => {
    mouseMovePending = false;
    const isRight = body.classList.contains('sidebar-right');
    const dist = isRight ? (window.innerWidth - lastMouseX) : lastMouseX;
    if (dist <= 56 && lastMouseY >= 64) {
      const arrowH = 48;
      const topMin = 64 + 8;
      const topMax = window.innerHeight - arrowH - 12;
      const clampedY = Math.max(topMin, Math.min(topMax, lastMouseY - (arrowH / 2)));
      sidebarReopenBtn.style.top = `${clampedY}px`;
      sidebarReopenBtn.classList.add('is-visible');
    } else if (!sidebarReopenBtn.matches(':hover')) {
      sidebarReopenBtn.classList.remove('is-visible');
    }
  });
}, { passive: true });

if (navBtn) {
  navBtn.addEventListener('click', () => {
    const isOpen = body.classList.toggle('nav-open');
    navBtn.setAttribute('aria-expanded', String(isOpen));
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

  sidebarResizer.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home') return;
    e.preventDefault();
    if (e.key === 'Home') {
      setSidebarWidth(DEFAULT_SIDEBAR_WIDTH);
      setSidebarCollapsed(false);
      return;
    }
    const isRight = body.classList.contains('sidebar-right');
    const step = (e.key === 'ArrowRight' ? 16 : -16) * (isRight ? -1 : 1);
    const currentW = parseInt(getComputedStyle(root).getPropertyValue('--sidebar-w'), 10) || DEFAULT_SIDEBAR_WIDTH;
    const maxW = Math.min(650, Math.round(window.innerWidth * 0.45));
    const nextW = Math.max(MIN_SIDEBAR_WIDTH, Math.min(maxW, currentW + step));
    if (body.classList.contains('sidebar-collapsed')) setSidebarCollapsed(false);
    setSidebarWidth(nextW, true);
  });
}

// ── Mobile search toggle ───────────────────────────────────────────────────
const searchToggle = document.getElementById('searchToggle');

export function setSearchMode(on) {
  body.classList.toggle('search-mode', on);
  searchToggle?.classList.toggle('close', on);
  searchToggle?.setAttribute('aria-expanded', String(on));
  searchToggle?.setAttribute('aria-label', on ? 'Close search' : 'Search');
  if (on && search) {
    requestAnimationFrame(() => search.focus());
  }
}

searchToggle?.addEventListener('click', () => {
  setSearchMode(!body.classList.contains('search-mode'));
});

document.addEventListener('click', (event) => {
  if (settings && !settings.contains(event.target) && event.target.id !== 'settingsBtn') {
    settings.classList.remove('open');
    document.getElementById('settingsBtn')?.setAttribute('aria-expanded', 'false');
  }
  const dropdownMenuEl = document.getElementById('dropdownMenu');
  const menuBtnEl = document.getElementById('menuBtn');
  if (dropdownMenuEl && !dropdownMenuEl.contains(event.target) && !menuBtnEl?.contains(event.target)) {
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
