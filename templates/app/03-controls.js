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
