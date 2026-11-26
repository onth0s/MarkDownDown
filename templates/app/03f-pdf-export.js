import { closeAllPopovers } from './01-core.js';

// PDF export & print handling
export function initPdfExport() {
  const exportPdfBtn = document.getElementById('exportPdfBtn');
  if (!exportPdfBtn) return;

  exportPdfBtn.addEventListener('click', () => {
    closeAllPopovers();
    window.print();
  });
}

initPdfExport();
