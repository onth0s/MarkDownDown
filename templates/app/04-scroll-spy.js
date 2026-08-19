// ── Scroll Spy & Progress Bar ──────────────────────────────────────────────
const tocLinks = [...toc.querySelectorAll('a')];
let sidebarScrollAnimation = null;

function animateSidebarTo(targetScrollTop, duration) {
  duration = duration || 420;
  const maxScroll = Math.max(0, sidebar.scrollHeight - sidebar.clientHeight);
  const target = Math.max(0, Math.min(maxScroll, targetScrollTop));
  const start = sidebar.scrollTop;
  const distance = target - start;
  if (Math.abs(distance) < 1) return;
  if (sidebarScrollAnimation) cancelAnimationFrame(sidebarScrollAnimation);
  const startTime = performance.now();
  const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const frame = now => {
    const p = Math.min(1, (now - startTime) / duration);
    sidebar.scrollTop = start + distance * ease(p);
    if (p < 1) sidebarScrollAnimation = requestAnimationFrame(frame);
    else sidebarScrollAnimation = null;
  };
  sidebarScrollAnimation = requestAnimationFrame(frame);
}

let lastActiveId = null;
let initialScrollDone = false;
let tocScrollActive = false;
const scrollStateKey = `mdd_scroll_${location.pathname}`;
const sidebarScrollKey = `mdd_sidebar_${location.pathname}`;
function setActive(id) {
  if (!id || id === lastActiveId) return;
  lastActiveId = id;
  const isBareTarget = id === '__doc-title__' || (!hasHero && (id === headings[0]?.id && window.scrollY === 0));
  if (isBareTarget && history.replaceState && location.hash) {
    history.replaceState(null, '', location.pathname + location.search);
    try { sessionStorage.setItem(scrollStateKey, JSON.stringify({ id: '', y: window.scrollY })); } catch (_) {}
  } else if (!isBareTarget && id !== '__doc-title__' && history.replaceState && location.hash !== `#${id}`) {
    history.replaceState(null, '', `#${id}`);
    try { sessionStorage.setItem(scrollStateKey, JSON.stringify({ id, y: window.scrollY })); } catch (_) {}
  }
  const activeLink = tocLinks.find(a => a.dataset.target === id);
  tocLinks.forEach(a => a.classList.toggle('active', a === activeLink));
  if (!activeLink) return;
  const sidebarRect = sidebar.getBoundingClientRect();
  const linkRect = activeLink.getBoundingClientRect();
  const sidebarCenter = sidebarRect.top + sidebarRect.height / 2;
  const linkCenter = linkRect.top + linkRect.height / 2;
  const delta = linkCenter - sidebarCenter;
  const maxSidebarScroll = Math.max(0, sidebar.scrollHeight - sidebar.clientHeight);
  const target = Math.max(0, Math.min(maxSidebarScroll, sidebar.scrollTop + delta));

  if (!initialScrollDone) {
    sidebar.scrollTop = target;
  } else if (Math.abs(delta) > sidebarRect.height * 0.18) {
    animateSidebarTo(target, 440);
  }
}

function headingOffsetTop(el) {
  return el.getBoundingClientRect().top + window.scrollY;
}

function detectActiveHeading() {
  if (window.scrollY === 0) return hasHero ? '__doc-title__' : (headings[0]?.id ?? null);
  if (!headings.length) return null;

  const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  if (window.scrollY >= maxScroll - 4) {
    return headings[headings.length - 1]?.id ?? null;
  }

  const THRESHOLD = 92;
  let activeIdx = 0;
  for (let i = 0; i < headings.length; i++) {
    const top = headingOffsetTop(headings[i]);
    if (top <= window.scrollY + THRESHOLD) {
      activeIdx = i;
    }
  }

  return headings[activeIdx]?.id ?? null;
}

function adjustArticleBottomPadding() {
  if (!headings.length || !article) return;
  const lastHeading = headings[headings.length - 1];
  const lastHeadingRect = lastHeading.getBoundingClientRect();
  const lastHeadingTop = lastHeadingRect.top + window.scrollY;
  const currentPadding = parseFloat(getComputedStyle(article).paddingBottom) || 0;
  const rawArticleBottom = (article.getBoundingClientRect().top + window.scrollY) + article.offsetHeight - currentPadding;
  const lastSectionHeight = Math.max(0, rawArticleBottom - lastHeadingTop);
  const THRESHOLD = 92;
  const needed = Math.max(80, Math.ceil(window.innerHeight - THRESHOLD - lastSectionHeight + 60));
  article.style.paddingBottom = `${needed}px`;
}

let ticking = false;
let pendingTick = false;
function doScrollUpdate() {
  adjustArticleBottomPadding();
  const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  progress.style.width = `${Math.min(100, Math.max(0, window.scrollY / max * 100))}%`;
  if (!tocScrollActive) {
    const id = detectActiveHeading();
    if (id) setActive(id);
  }
  ticking = false;
  if (pendingTick) { pendingTick = false; updateScrollUI(); }
}
function updateScrollUI() {
  if (ticking) { pendingTick = true; return; }
  ticking = true;
  requestAnimationFrame(doScrollUpdate);
}

window.addEventListener('scroll', updateScrollUI, { passive: true });
window.addEventListener('resize', updateScrollUI);

adjustArticleBottomPadding();

backtop.addEventListener('click', () => {
  tocScrollActive = true;
  const topId = hasHero ? '__doc-title__' : (headings[0]?.id ?? null);
  if (topId) setActive(topId);
  animateSidebarTo(0, 300);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  onScrollEnd(() => {
    tocScrollActive = false;
    sidebar.scrollTop = 0;
    if (topId) setActive(topId);
  });
});
