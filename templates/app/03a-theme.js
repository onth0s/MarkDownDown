import { root, settings, setTheme, setAccent, closeAllPopovers } from './01-core.js';

// ── Theme / Appearance ─────────────────────────────────────────────────────
document.getElementById('themeBtn')?.addEventListener('click', () => {
  setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark');
});

const settingsBtn = document.getElementById('settingsBtn');
const menuBtn = document.getElementById('menuBtn');
const dropdownMenu = document.getElementById('dropdownMenu');

export function closeDropdownMenu() {
  if (dropdownMenu) dropdownMenu.classList.remove('open');
  if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
}

if (settingsBtn) {
  settingsBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    const wasOpen = settings?.classList.contains('open');
    closeAllPopovers();
    if (settings && !wasOpen) {
      settings.classList.add('open');
      settingsBtn.setAttribute('aria-expanded', 'true');
    }
  });
}

if (menuBtn && dropdownMenu) {
  menuBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    const wasOpen = dropdownMenu.classList.contains('open');
    closeAllPopovers();
    if (!wasOpen) {
      dropdownMenu.classList.add('open');
      menuBtn.setAttribute('aria-expanded', 'true');
    }
  });
}

document.getElementById('colorPicker')?.addEventListener('input', e => setAccent(e.target.value));
document.querySelectorAll('.swatch').forEach(s =>
  s.addEventListener('click', () => setAccent(s.dataset.color))
);
