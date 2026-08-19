// ── Table of Contents & Copy Anchors ─────────────────────────────────────────
const headings = [...article.querySelectorAll('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id], .alert[id]')]
  .filter(h => !h.closest('.hero'));

const hasHero = !!article.querySelector('.hero');
toc.replaceChildren();
if (hasHero) {
  const titleLi = document.createElement('li');
  const titleA = document.createElement('a');
  titleA.textContent = document.title || 'Untitled';
  titleA.className = 'l1';
  titleA.dataset.target = '__doc-title__';
  titleLi.appendChild(titleA);
  toc.appendChild(titleLi);
}
headings.forEach((heading) => {
  const isAlert = heading.classList.contains('alert');
  const isItem = heading.classList.contains('item-heading');
  const li = document.createElement('li');
  const a = document.createElement('a');
  const level = isAlert ? 3 : Number(heading.tagName.substring(1));
  a.href = `#${heading.id}`;
  a.textContent = heading.textContent.trim();
  if (isAlert) {
    a.textContent = heading.querySelector('.alert-label')?.textContent.trim() || heading.id;
  }
  a.className = `l${level}` + (isItem ? ' item-link' : '');
  a.dataset.target = heading.id;
  li.appendChild(a);
  toc.appendChild(li);

  const anchor = document.createElement('a');
  anchor.className = 'heading-anchor';
  anchor.href = `#${heading.id}`;
  anchor.dataset.target = heading.id;
  anchor.setAttribute('aria-label', 'Copy link to section');
  anchor.textContent = '#';

  if (isAlert) {
    const titleEl = heading.querySelector('.alert-title') || heading;
    titleEl.appendChild(anchor);
  } else {
    heading.appendChild(anchor);
  }
});

const heroH1 = article.querySelector('.hero h1');
if (heroH1) {
  const heroAnchor = document.createElement('a');
  heroAnchor.className = 'heading-anchor';
  heroAnchor.href = '#';
  heroAnchor.dataset.target = '__doc-title__';
  heroAnchor.setAttribute('aria-label', 'Copy link to document title');
  heroAnchor.textContent = '#';
  heroH1.appendChild(heroAnchor);
}

toc.addEventListener('click', (event) => {
  const link = event.target.closest('a[data-target]');
  if (!link) return;
  event.preventDefault();
  if (window.innerWidth <= 900) body.classList.remove('nav-open');
  tocScrollActive = true;
  if (link.dataset.target === '__doc-title__') {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    const target = document.getElementById(link.dataset.target);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  setActive(link.dataset.target);
  onScrollEnd(() => { tocScrollActive = false; });
});

article.addEventListener('click', async (event) => {
  const anchor = event.target.closest('.heading-anchor');
  if (!anchor) return;
  event.preventDefault();
  const targetId = anchor.dataset.target || anchor.getAttribute('href')?.replace(/^#/, '');

  if (window.innerWidth <= 900) body.classList.remove('nav-open');
  tocScrollActive = true;

  const isFirstHeadingNoHero = !hasHero && targetId && headings[0]?.id === targetId;
  let url = location.href.split('#')[0];
  if (targetId === '__doc-title__' || !targetId || isFirstHeadingNoHero) {
    if (targetId === '__doc-title__' || !targetId) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      const heading = document.getElementById(targetId);
      if (heading) heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setActive(targetId || '__doc-title__');
  } else {
    const heading = document.getElementById(targetId);
    if (heading) {
      heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setActive(targetId);
    url += `#${targetId}`;
  }
  onScrollEnd(() => { tocScrollActive = false; });

  let copied = false;
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
    } catch (_) {
      copied = false;
    }
  }
  if (!copied) {
    try {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      ta.style.left = '-9999px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      copied = document.execCommand('copy');
      ta.remove();
    } catch (_) {
      copied = false;
    }
  }

  if (copied) {
    anchor.textContent = 'Link copied!';
    anchor.classList.add('copied');
  } else {
    anchor.textContent = 'Copy failed';
    anchor.classList.add('copied');
  }
  clearTimeout(anchor._timer);
  anchor._timer = setTimeout(() => {
    anchor.textContent = '#';
    anchor.classList.remove('copied');
  }, 1000);
});
