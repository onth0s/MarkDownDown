// Promote only inline KaTeX expressions that overflow their container.
export function fitInlineMath() {
  for (const el of document.querySelectorAll('.katex')) {
    if (el.closest('.katex-display') || !el.parentElement) continue;
    el.classList.remove('katex--overflow');
    const avail = el.parentElement.getBoundingClientRect().width;
    const wide = el.getBoundingClientRect().width;
    if (wide > avail + 2) {
      el.classList.add('katex--overflow');
    }
  }
}

let fitInlineMathRaf = 0;
window.addEventListener('resize', () => {
  cancelAnimationFrame(fitInlineMathRaf);
  fitInlineMathRaf = requestAnimationFrame(fitInlineMath);
}, { passive: true });

if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(fitInlineMath);
}
fitInlineMath();
