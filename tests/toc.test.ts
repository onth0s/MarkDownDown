import { buildJs } from '../src/renderer/js.js';
import { buildCss } from '../src/renderer/css.js';

const js = buildJs('#3b82f6');
const css = buildCss('#3b82f6', '59,130,246');

// ── TOC click handler ──────────────────────────────────────────────────────

describe('TOC click handler', () => {
  test('calls setActive immediately on click', () => {
    expect(js).toMatch(/toc\.addEventListener\('click'[\s\S]*?setActive\(link\.dataset\.target\)/);
  });

  test('does not call history.replaceState directly in click handler', () => {
    const clickBlock = js.slice(
      js.indexOf("toc.addEventListener('click'"),
      js.indexOf("// ── Theme"),
    );
    expect(clickBlock).not.toMatch(/history\.replaceState/);
  });

  test('calls scrollIntoView with smooth start for heading targets', () => {
    expect(js).toMatch(/target\.scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\)/);
  });

  test('calls window.scrollTo for doc-title target', () => {
    expect(js).toMatch(/window\.scrollTo\(\{ top: 0, behavior: 'smooth' \}\)/);
  });

  test('closes mobile nav on click when viewport <= 900', () => {
    expect(js).toMatch(/window\.innerWidth <= 900\) body\.classList\.remove\('nav-open'\)/);
  });

  test('prevents default on TOC click', () => {
    expect(js).toMatch(/toc\.addEventListener\('click'[\s\S]*?event\.preventDefault\(\)/);
  });

  test('uses event delegation with closest("a[data-target]")', () => {
    expect(js).toMatch(/event\.target\.closest\('a\[data-target\]'\)/);
  });
});

// ── TOC generation ─────────────────────────────────────────────────────────

describe('TOC generation', () => {
  test('collects headings with ids from #article', () => {
    expect(js).toMatch(/article\.querySelectorAll\('h1\[id\], h2\[id\], h3\[id\], h4\[id\], h5\[id\], h6\[id\], \.alert\[id\]'\)/);
  });

  test('excludes headings inside .hero', () => {
    expect(js).toMatch(/\.filter\(h => !h\.closest\('\.hero'\)\)/);
  });

  test('clears TOC before populating', () => {
    expect(js).toMatch(/toc\.replaceChildren\(\)/);
  });

  test('creates document title entry with __doc-title__ target when hero is present', () => {
    expect(js).toMatch(/titleA\.dataset\.target = '__doc-title__'/);
  });

  test('creates heading entries with data-target matching heading id', () => {
    expect(js).toMatch(/a\.dataset\.target = heading\.id/);
  });

  test('sets level class l1–l6 on TOC links', () => {
    expect(js).toMatch(/a\.className = `l\$\{level\}`/);
  });

  test('sets href to #heading-id on TOC links', () => {
    expect(js).toMatch(/a\.href = `#\$\{heading\.id\}`/);
  });

  test('sets text content from heading text', () => {
    expect(js).toMatch(/a\.textContent = heading\.textContent\.trim\(\)/);
  });

  test('title link uses document.title as text', () => {
    expect(js).toMatch(/titleA\.textContent = document\.title \|\| 'Untitled'/);
  });
});

// ── Scroll spy ─────────────────────────────────────────────────────────────

describe('Scroll spy', () => {
  test('caches TOC links array', () => {
    expect(js).toMatch(/const tocLinks = \[\.\.\.toc\.querySelectorAll\('a'\)\]/);
  });

  test('detectActiveHeading returns __doc-title__ at scrollY 0 when hero is present', () => {
    expect(js).toMatch(/if \(window\.scrollY === 0\) return hasHero \? '__doc-title__' :/);
  });

  test('detectActiveHeading uses THRESHOLD constant', () => {
    expect(js).toMatch(/const THRESHOLD = 92/);
  });

  test('headingOffsetTop calculates element top relative to document', () => {
    expect(js).toMatch(/return el\.getBoundingClientRect\(\)\.top \+ window\.scrollY/);
  });

  test('setActive guards against duplicate calls', () => {
    expect(js).toMatch(/if \(!id\) return;/);
    expect(js).toMatch(/if \(id === lastActiveId\) return;/);
  });

  test('setActive updates lastActiveId', () => {
    expect(js).toMatch(/lastActiveId = id;/);
  });

  test('setActive strips hash on bare target or scrollY 0', () => {
    expect(js).toMatch(/isBareTarget = id === '__doc-title__' \|\| \(!hasHero && \(id === headings\[0\]\?\.id && window\.scrollY === 0\)\)/);
    expect(js).toMatch(/history\.replaceState\(null, '', location\.pathname \+ location\.search\)/);
  });

  test('setActive updates URL hash via history.replaceState', () => {
    expect(js).toMatch(/history\.replaceState\(null, '', `#\$\{id\}`\)/);
  });

  test('setActive toggles active class on correct link', () => {
    expect(js).toMatch(/tocLinks\.forEach\(a => a\.classList\.toggle\('active', a === activeLink\)\)/);
  });

  test('setActive finds active link by data-target', () => {
    expect(js).toMatch(/const activeLink = tocLinks\.find\(a => a\.dataset\.target === id\)/);
  });

  test('scrolls sidebar to center active link when off-center', () => {
    expect(js).toMatch(/animateSidebarTo\(target, 440\)/);
  });

  test('snaps sidebar on first call instead of animating', () => {
    expect(js).toMatch(/let initialScrollDone = false/);
    expect(js).toMatch(/if \(!initialScrollDone\)/);
    expect(js).toMatch(/sidebar\.scrollTop = target/);
  });

  test('updateScrollUI is bound to window scroll event', () => {
    expect(js).toMatch(/window\.addEventListener\('scroll', updateScrollUI, \{ passive: true \}\)/);
  });

  test('updateScrollUI is bound to window resize event', () => {
    expect(js).toMatch(/window\.addEventListener\('resize', updateScrollUI\)/);
  });

  test('updateScrollUI calls detectActiveHeading', () => {
    expect(js).toMatch(/const id = detectActiveHeading\(\)/);
  });

  test('updateScrollUI calls setActive with detected id', () => {
    expect(js).toMatch(/if \(id\) setActive\(id\)/);
  });

  test('updateScrollUI uses rAF throttling', () => {
    expect(js).toMatch(/if \(ticking\) \{ pendingTick = true; return; \}/);
  });

  test('updateScrollUI called once on init', () => {
    expect(js).toMatch(/doScrollUpdate\(\);[\s\S]*?initialScrollDone = true/);
  });
});

// ── Sidebar animation ──────────────────────────────────────────────────────

describe('Sidebar scroll animation', () => {
  test('animateSidebarTo clamps to max scroll', () => {
    expect(js).toMatch(/const maxScroll = Math\.max\(0, sidebar\.scrollHeight - sidebar\.clientHeight\)/);
  });

  test('animateSidebarTo uses ease function', () => {
    expect(js).toMatch(/const ease = t => t < 0\.5 \? 4 \* t \* t \* t : 1 - Math\.pow\(-2 \* t \+ 2, 3\) \/ 2/);
  });

  test('animateSidebarTo cancels previous animation', () => {
    expect(js).toMatch(/if \(sidebarScrollAnimation\) cancelAnimationFrame\(sidebarScrollAnimation\)/);
  });
});

// ── Hash navigation ────────────────────────────────────────────────────────

describe('Hash navigation', () => {
  test('hashchange listener calls setActive', () => {
    expect(js).toMatch(/window\.addEventListener\('hashchange'[\s\S]*?setActive\(id\)/);
  });

  test('hashchange listener checks element exists', () => {
    expect(js).toMatch(/if \(id && document\.getElementById\(id\)\) setActive\(id\)/);
  });

  test('initial hash scrolls to target on load', () => {
    expect(js).toMatch(/if \(initialHash\)[\s\S]*?window\.scrollTo/);
  });

  test('saves active section and scroll state to sessionStorage', () => {
    expect(js).toMatch(/sessionStorage\.setItem\(scrollStateKey, JSON\.stringify\(\{ id, y: window\.scrollY \}\)\)/);
  });

  test('restores saved state from sessionStorage on page load', () => {
    expect(js).toMatch(/savedState = JSON\.parse\(sessionStorage\.getItem\(scrollStateKey\) \|\| 'null'\)/);
  });
});

// ── TOC CSS ────────────────────────────────────────────────────────────────

describe('TOC CSS', () => {
  test('has .toc rule with list-style:none', () => {
    expect(css).toMatch(/\.toc \{ list-style:none; margin:0; padding:0; \}/);
  });

  test('has .toc a rule with display:block', () => {
    expect(css).toMatch(/\.toc a \{[\s\S]*?display:block/);
  });

  test('has .toc a.active rule with accent color', () => {
    expect(css).toMatch(/\.toc a\.active \{[^}]*color:var\(--accent\)/);
  });

  test('has .toc a.active rule with background tint', () => {
    expect(css).toMatch(/\.toc a\.active \{[^}]*background:rgba\(var\(--accent-rgb\),\.10\)/);
  });

  test('has .toc .l1 with padding-left:9px', () => {
    expect(css).toMatch(/\.toc \.l1 \{ padding-left:9px/);
  });

  test('has .toc .l2 with padding-left:18px', () => {
    expect(css).toMatch(/\.toc \.l2 \{ padding-left:18px/);
  });

  test('has .toc .l3 with padding-left:29px', () => {
    expect(css).toMatch(/\.toc \.l3 \{ padding-left:29px/);
  });

  test('has .toc .l4 with padding-left:40px', () => {
    expect(css).toMatch(/\.toc \.l4 \{ padding-left:40px/);
  });

  test('has .toc .l5 with padding-left:51px', () => {
    expect(css).toMatch(/\.toc \.l5 \{ padding-left:51px/);
  });

  test('has .toc .l6 with padding-left:62px', () => {
    expect(css).toMatch(/\.toc \.l6 \{ padding-left:62px/);
  });

  test('article headings have scroll-margin-top', () => {
    expect(css).toMatch(/\.article h1 \{[^}]*scroll-margin-top:88px/);
    expect(css).toMatch(/\.article h2 \{[^}]*scroll-margin-top:88px/);
    expect(css).toMatch(/\.article h3 \{[^}]*scroll-margin-top:88px/);
  });

  test('toc a has transition properties', () => {
    expect(css).toMatch(/\.toc a \{[\s\S]*?transition:/);
  });

  test('reduced motion disables toc transitions', () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*?\.toc a[\s\S]*?transition: none !important/);
  });
});

// ── Hover-reveal UI ────────────────────────────────────────────────────────

describe('Copy button hover-reveal', () => {
  test('copy button is hidden by default', () => {
    expect(css).toMatch(/\.copy-btn \{[^}]*opacity:0/);
  });

  test('copy button has transition', () => {
    expect(css).toMatch(/\.copy-btn \{[^}]*transition:opacity \.15s/);
  });

  test('copy button appears on code-wrap hover', () => {
    expect(css).toMatch(/\.code-wrap:hover \.copy-btn \{ opacity:1; \}/);
  });
});

describe('Backtop button hover-reveal', () => {
  test('backtop is hidden by default', () => {
    expect(css).toMatch(/\.backtop \{[^}]*opacity:0/);
  });

  test('backtop has pointer-events:auto (hoverable while hidden)', () => {
    expect(css).toMatch(/\.backtop \{[^}]*pointer-events:auto/);
  });

  test('backtop has transition', () => {
    expect(css).toMatch(/\.backtop \{[^}]*transition:opacity \.2s/);
  });

  test('backtop appears on hover', () => {
    expect(css).toMatch(/\.backtop:hover \{ opacity:1; \}/);
  });

  test('backtop has ::before for enlarged hit area', () => {
    expect(css).toMatch(/\.backtop::before \{[^}]*inset:-20px/);
  });

  test('no .backtop.show rule exists', () => {
    expect(css).not.toMatch(/\.backtop\.show/);
  });

  test('JS does not toggle backtop show class on scroll', () => {
    expect(js).not.toMatch(/backtop\.classList\.toggle/);
  });
});

// ── Scroll guard ────────────────────────────────────────────────────────────

describe('Scroll guard', () => {
  test('declares tocScrollActive variable', () => {
    expect(js).toMatch(/let tocScrollActive = false/);
  });

  test('TOC click sets tocScrollActive to true', () => {
    expect(js).toMatch(/toc\.addEventListener\('click'[\s\S]*?tocScrollActive = true/);
  });

  test('doScrollUpdate checks tocScrollActive before setActive', () => {
    expect(js).toMatch(/if \(!tocScrollActive\)[\s\S]*?const id = detectActiveHeading\(\)/);
  });

  test('defines onScrollEnd helper with scrollend feature detection', () => {
    expect(js).toMatch(/function onScrollEnd\(callback\)/);
    expect(js).toMatch(/'onscrollend' in window/);
  });

  test('onScrollEnd uses scrollend event when available', () => {
    expect(js).toMatch(/document\.addEventListener\('scrollend', callback, \{ once: true \}\)/);
  });

  test('onScrollEnd falls back to debounced scroll listener', () => {
    expect(js).toMatch(/document\.addEventListener\('scroll', handler, \{ passive: true \}\)/);
  });

  test('TOC click clears tocScrollActive via onScrollEnd', () => {
    expect(js).toMatch(/toc\.addEventListener\('click'[\s\S]*?onScrollEnd\(\(\) => \{ tocScrollActive = false/);
  });

  test('backtop click sets tocScrollActive to true', () => {
    expect(js).toMatch(/backtop\.addEventListener\('click'[\s\S]*?tocScrollActive = true/);
  });

  test('backtop click clears tocScrollActive via onScrollEnd', () => {
    expect(js).toMatch(/backtop\.addEventListener\('click'[\s\S]*?onScrollEnd\(\(\)\s*=>\s*\{[\s\S]*?tocScrollActive\s*=\s*false/);
  });

  test('backtop click immediately strips URL hash and scrolls to top', () => {
    expect(js).toMatch(/backtop\.addEventListener\('click'[\s\S]*?history\.replaceState\(null, '', location\.pathname \+ location\.search\)/);
    expect(js).toMatch(/backtop\.addEventListener\('click'[\s\S]*?window\.scrollTo\(\{ top: 0, behavior: 'smooth' \}\)/);
  });
});

// ── Section title hover & link copy ─────────────────────────────────────────

describe('Section title heading anchors', () => {
  test('creates heading-anchor element for each heading', () => {
    expect(js).toMatch(/anchor\.className = 'heading-anchor'/);
    expect(js).toMatch(/anchor\.textContent = '#'/);
    expect(js).toMatch(/anchor\.href = `#\$\{heading\.id\}`/);
    expect(js).toMatch(/heading\.appendChild\(anchor\)/);
  });

  test('creates heading-anchor element for hero h1', () => {
    expect(js).toMatch(/article\.querySelector\('\.hero h1'\)/);
    expect(js).toMatch(/heroAnchor\.dataset\.target = '__doc-title__'/);
    expect(js).toMatch(/heroH1\.appendChild\(heroAnchor\)/);
  });

  test('heading anchor click handler scrolls smoothly to target and updates active state', () => {
    expect(js).toMatch(/article\.addEventListener\('click'[\s\S]*?event\.target\.closest\('\.heading-anchor'\)/);
    expect(js).toMatch(/heading\.scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\)/);
    expect(js).toMatch(/window\.scrollTo\(\{ top: 0, behavior: 'smooth' \}\)/);
    expect(js).toMatch(/setActive\(/);
    expect(js).toMatch(/tocScrollActive = true/);
  });

  test('heading anchor click copies section URL to clipboard and temporarily displays Copied label', () => {
    expect(js).toMatch(/navigator\.clipboard\.writeText\(url\)/);
    expect(js).toMatch(/anchor\.textContent = 'Link copied!'/);
    expect(js).toMatch(/anchor\.classList\.add\('copied'\)/);
  });

  test('copy button reads verbatim data-raw or code textContent', () => {
    expect(js).toMatch(/parent\.getAttribute\('data-raw'\)/);
    expect(js).toMatch(/parent\.querySelector\('code'\)\?\.textContent/);
  });

  test('heading anchor is hidden by default with opacity 0 and transitions', () => {
    expect(css).toMatch(/\.heading-anchor \{[\s\S]*?opacity:0;/);
    expect(css).toMatch(/\.heading-anchor \{[\s\S]*?transition:opacity \.15s ease/);
  });

  test('heading anchor appears on full-line heading hover, hero hover, and on focus', () => {
    expect(css).toMatch(/\.hero, \.hero h1 \{ position:relative; \}/);
    expect(css).toMatch(/\.article h1, \.article h2, \.article h3, \.article h4, \.article h5, \.article h6 \{ position:relative; \}/);
    expect(css).toMatch(/\.article h1:hover \.heading-anchor/);
    expect(css).toMatch(/\.hero h1:hover \.heading-anchor/);
    expect(css).toMatch(/\.heading-anchor:focus-visible/);
  });

  test('heading-anchor.copied has styling matching codeblocks label', () => {
    expect(css).toMatch(/\.heading-anchor\.copied \{/);
    expect(css).toMatch(/background:var\(--surface-2\);/);
  });

  test('reduced motion disables heading anchor transitions', () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*?\.heading-anchor[\s\S]*?transition: none !important/);
  });
});



