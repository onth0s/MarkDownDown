// PDF export & print handling with isolated iframe pattern and theme sync
(() => {
  'use strict';

  function initPdfExport() {
    const exportPdfBtn = document.getElementById('exportPdfBtn');
    if (!exportPdfBtn) return;

    exportPdfBtn.addEventListener('click', () => {
      // 1. Close any open dropdown menu
      const dropdownMenu = document.getElementById('dropdownMenu');
      if (dropdownMenu) {
        dropdownMenu.classList.remove('open');
      }

      // 2. Close settings modal if open
      const settings = document.getElementById('settings');
      if (settings && !settings.classList.contains('hidden')) {
        settings.classList.add('hidden');
      }

      // 3. Close document statistics modal if open
      const docStats = document.getElementById('docStats');
      if (docStats && !docStats.classList.contains('hidden')) {
        docStats.classList.add('hidden');
      }

      // 4. Trigger print. Because 08b-print.css dynamically binds to html[data-theme],
      // calling window.print() directly retains the exact active theme (dark or light)
      // and accent colors without losing vector crispness.
      window.print();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPdfExport);
  } else {
    initPdfExport();
  }
})();
