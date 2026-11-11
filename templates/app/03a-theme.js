// ── Theme / Appearance ─────────────────────────────────────────────────────
document.getElementById('themeBtn').addEventListener('click', () => {
  setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark');
});

const settingsBtn = document.getElementById('settingsBtn');
const menuBtn = document.getElementById('menuBtn');
const dropdownMenu = document.getElementById('dropdownMenu');

function closeDropdownMenu() {
  if (dropdownMenu) dropdownMenu.classList.remove('open');
  if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
}

function showDropdownToast(message) {
  document.querySelectorAll('.dropdown-toast').forEach(el => el.remove());
  const toast = document.createElement('div');
  toast.className = 'dropdown-toast';
  toast.setAttribute('role', 'status');
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 2200);
}

if (settingsBtn) {
  settingsBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    closeDropdownMenu();
    const docStatsPanel = document.getElementById('docStats');
    if (docStatsPanel) {
      docStatsPanel.hidden = true;
      docStatsPanel.classList.remove('open');
    }
    if (settings) settings.classList.toggle('open');
  });
}

if (menuBtn && dropdownMenu) {
  menuBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    if (settings) settings.classList.remove('open');
    const docStatsPanel = document.getElementById('docStats');
    if (docStatsPanel) {
      docStatsPanel.hidden = true;
      docStatsPanel.classList.remove('open');
    }
    const isOpen = dropdownMenu.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', String(isOpen));
  });
}

document.querySelectorAll('.dropdown-item.is-stub').forEach(stubBtn => {
  stubBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    closeDropdownMenu();
    showDropdownToast(stubBtn.getAttribute('title') || 'Feature coming soon');
  });
});

document.getElementById('colorPicker').addEventListener('input', e => setAccent(e.target.value));
document.querySelectorAll('.swatch').forEach(s =>
  s.addEventListener('click', () => setAccent(s.dataset.color))
);
