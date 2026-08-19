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

// ── SVG / JPG Download buttons ──────────────────────────────────────────────
document.querySelectorAll('.download-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const wrap = btn.closest('.code-wrap');
    if (!wrap) return;
    const format = btn.dataset.format || 'svg';
    const isDiagram = wrap.classList.contains('diagram');
    const isTable = wrap.classList.contains('table');
    let svg = null;

    if (isDiagram) {
      const render = wrap.querySelector('.diagram-render');
      if (render) {
        const visibleSvg = [...render.querySelectorAll('svg')].find(s => {
          const style = window.getComputedStyle(s.parentElement || s);
          return style.display !== 'none';
        });
        svg = visibleSvg || render.querySelector('svg');
      }
    } else if (isTable) {
      svg = wrap.querySelector('.table-render svg');
    }

    // Fallback: If table is GFM HTML table, render it onto canvas directly for JPG
    if (!svg && isTable && wrap.querySelector('table')) {
      const tbl = wrap.querySelector('table');
      if (tbl) {
        const rawTitle = wrap.getAttribute('data-title') || 'table';
        const cleanTitle = rawTitle.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'table';
        // Create an SVG foreignObject wrapper to rasterize HTML table with styles
        const tblRect = tbl.getBoundingClientRect();
        const w = Math.max(300, Math.ceil(tblRect.width || tbl.scrollWidth || 600));
        const h = Math.max(100, Math.ceil(tblRect.height || tbl.scrollHeight || 400));
        const currentTheme = root.dataset.theme || 'dark';
        const isDark = currentTheme !== 'light';
        const bg = isDark ? '#0f172a' : '#ffffff';
        const fg = isDark ? '#f8fafc' : '#0f172a';
        const accent = getComputedStyle(root).getPropertyValue('--accent').trim() || '#3b82f6';
        const border = isDark ? '#334155' : '#e2e8f0';
        const surf2 = isDark ? '#1e293b' : '#f1f5f9';

        const svgWrapper = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svgWrapper.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        svgWrapper.setAttribute('width', String(w));
        svgWrapper.setAttribute('height', String(h));
        svgWrapper.setAttribute('viewBox', `0 0 ${w} ${h}`);
        svgWrapper.innerHTML = `<style>` +
          `table { width:100%; border-collapse:collapse; background:${bg}; color:${fg}; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; font-size:13px; }` +
          `th,td { border:1px solid ${border}; padding:8px 12px; text-align:left; vertical-align:top; }` +
          `th { background:${surf2}; color:${accent}; font-weight:700; }` +
          `</style>` +
          `<rect width="100%" height="100%" fill="${bg}"/>` +
          `<foreignObject width="100%" height="100%">${new XMLSerializer().serializeToString(tbl)}</foreignObject>`;

        svg = svgWrapper;
      }
    }

    if (!svg) return;

    const rawTitle = wrap.getAttribute('data-title') || (isDiagram ? 'diagram' : 'table');
    const cleanTitle = rawTitle.replace(/[\\/:*?"<>|]+/g, '_').trim() || (isDiagram ? 'diagram' : 'table');
    const svgClone = svg.cloneNode(true);

    // Remove any runtime search hit highlights from downloaded graphics
    svgClone.querySelectorAll('.is-hit, .is-current').forEach(el => el.classList.remove('is-hit', 'is-current'));
    svgClone.querySelectorAll('tspan.svg-mark').forEach(tspan => {
      const parentNode = tspan.parentNode;
      if (parentNode) parentNode.textContent = parentNode.dataset.origText || parentNode.textContent;
    });

    if (!svgClone.getAttribute('xmlns')) {
      svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    }

    // Sample or compute colors directly from live in-DOM elements for 100% pixel-perfect color parity
    const liveWrap = wrap;
    const isLight = root.dataset.theme === 'light';

    // Helper: resolve computed color, ensuring non-transparent RGB/hex
    const getResolvedColor = (el, prop, fallback) => {
      if (el) {
        const val = window.getComputedStyle(el)[prop];
        if (val && val !== 'none' && val !== 'transparent' && val !== 'rgba(0, 0, 0, 0)') {
          return val;
        }
      }
      return fallback;
    };

    const computedWrap = window.getComputedStyle(liveWrap);
    const computedBody = window.getComputedStyle(body);
    const rootStyles = getComputedStyle(root);

    const bg = (computedWrap.backgroundColor && computedWrap.backgroundColor !== 'rgba(0, 0, 0, 0)' && computedWrap.backgroundColor !== 'transparent')
      ? computedWrap.backgroundColor
      : (computedBody.backgroundColor || (isLight ? '#f4f7fb' : '#0b0f16'));

    const sampleNodeRect = svg.querySelector('.node-rect') || liveWrap.querySelector('.node-rect');
    const sampleNodeTitle = svg.querySelector('.node-title') || liveWrap.querySelector('.node-title');
    const sampleNodeSub = svg.querySelector('.node-sub') || liveWrap.querySelector('.node-sub');
    const sampleEdgePath = svg.querySelector('.edge-path') || liveWrap.querySelector('.edge-path');
    const sampleEdgeLabelBg = svg.querySelector('.edge-label-bg') || liveWrap.querySelector('.edge-label-bg');
    const sampleEdgeLabelText = svg.querySelector('.edge-label-text') || liveWrap.querySelector('.edge-label-text');
    const sampleTblHeadBg = svg.querySelector('.tbl-head-bg') || liveWrap.querySelector('.tbl-head-bg');
    const sampleTblHeadText = svg.querySelector('.tbl-head-text') || liveWrap.querySelector('.tbl-head-text');
    const sampleTblCellBg = svg.querySelector('.tbl-cell-bg') || liveWrap.querySelector('.tbl-cell-bg');
    const sampleTblCellText = svg.querySelector('.tbl-cell-text') || liveWrap.querySelector('.tbl-cell-text');
    const sampleTblGrid = svg.querySelector('.tbl-grid') || liveWrap.querySelector('.tbl-grid');

    const accent = getResolvedColor(sampleNodeTitle, 'fill', rootStyles.getPropertyValue('--accent').trim() || '#3b82f6');
    const nodeRectFill = getResolvedColor(sampleNodeRect, 'fill', isLight ? '#ffffff' : '#172033');
    const nodeRectStroke = getResolvedColor(sampleNodeRect, 'stroke', isLight ? '#cbd5e1' : '#334155');
    // High-contrast subtitle fill for dark mode readability in vector apps
    const nodeSubFill = getResolvedColor(sampleNodeSub, 'fill', isLight ? '#475569' : '#cbd5e1');
    const edgePathStroke = getResolvedColor(sampleEdgePath, 'stroke', accent);
    const edgeLabelBg = getResolvedColor(sampleEdgeLabelBg, 'fill', isLight ? '#ffffff' : '#111827');
    const edgeLabelText = getResolvedColor(sampleEdgeLabelText, 'fill', isLight ? '#0f172a' : '#f8fafc');
    const tblHeadBg = getResolvedColor(sampleTblHeadBg, 'fill', isLight ? 'rgba(59,130,246,0.08)' : 'rgba(59,130,246,0.12)');
    const tblHeadText = getResolvedColor(sampleTblHeadText, 'fill', accent);
    const tblCellBg = getResolvedColor(sampleTblCellBg, 'fill', isLight ? '#ffffff' : '#172033');
    const tblCellText = getResolvedColor(sampleTblCellText, 'fill', isLight ? '#0f172a' : '#f8fafc');
    const tblGridStroke = getResolvedColor(sampleTblGrid, 'stroke', nodeRectStroke);

    // Purge any preexisting or embedded <style> tags so vector parsers (Figma) don't get confused by CSS cascades
    svgClone.querySelectorAll('style').forEach(s => s.remove());

    // Replace any leftover var(--accent) in markers or inline attributes with exact hex
    svgClone.querySelectorAll('marker path').forEach(p => {
      p.setAttribute('fill', accent);
      p.setAttribute('stroke', 'none');
      p.removeAttribute('style');
    });

    // Insert solid background rectangle matching exact viewBox bounds (including negative minX/minY offsets)
    const vbAttr = (svgClone.getAttribute('viewBox') || '').trim().split(/\s+/).map(Number);
    let minX = 0, minY = 0, vbW = 800, vbH = 600;
    if (vbAttr.length === 4 && !vbAttr.some(isNaN)) {
      [minX, minY, vbW, vbH] = vbAttr;
    } else {
      vbW = parseFloat(svgClone.getAttribute('width')) || 800;
      vbH = parseFloat(svgClone.getAttribute('height')) || 600;
    }

    let defs = svgClone.querySelector('defs');
    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bgRect.setAttribute('x', String(minX));
    bgRect.setAttribute('y', String(minY));
    bgRect.setAttribute('width', String(vbW));
    bgRect.setAttribute('height', String(vbH));
    bgRect.setAttribute('fill', bg);
    bgRect.setAttribute('fill-opacity', '1');
    if (defs) {
      defs.insertAdjacentElement('afterend', bgRect);
    } else {
      svgClone.insertBefore(bgRect, svgClone.firstChild);
    }

    // Apply strict XML presentation attributes to every element for 100% vector app compatibility (Figma, Illustrator, Inkscape)
    svgClone.querySelectorAll('.node-rect').forEach(el => {
      el.setAttribute('fill', nodeRectFill);
      el.setAttribute('stroke', nodeRectStroke);
      el.setAttribute('stroke-width', '1');
      el.setAttribute('fill-opacity', '1');
      el.removeAttribute('style');
    });
    svgClone.querySelectorAll('.node-title').forEach(el => {
      el.setAttribute('fill', accent);
      el.setAttribute('fill-opacity', '1');
      el.setAttribute('font-family', 'Inter, sans-serif');
      el.setAttribute('font-weight', '700');
      el.removeAttribute('style');
    });
    svgClone.querySelectorAll('.node-sub').forEach(el => {
      el.setAttribute('fill', nodeSubFill);
      el.setAttribute('fill-opacity', '1');
      el.setAttribute('font-family', 'Inter, sans-serif');
      el.removeAttribute('style');
    });
    svgClone.querySelectorAll('.edge-path').forEach(el => {
      el.setAttribute('fill', 'none');
      el.setAttribute('stroke', edgePathStroke);
      el.setAttribute('stroke-width', '1.6');
      el.removeAttribute('style');
    });
    svgClone.querySelectorAll('.edge-label-bg').forEach(el => {
      el.setAttribute('fill', edgeLabelBg);
      el.setAttribute('stroke', nodeRectStroke);
      el.setAttribute('stroke-width', '0.8');
      el.setAttribute('fill-opacity', '1');
      el.removeAttribute('style');
    });
    svgClone.querySelectorAll('.edge-label-text').forEach(el => {
      el.setAttribute('fill', edgeLabelText);
      el.setAttribute('fill-opacity', '1');
      el.setAttribute('font-family', 'Inter, sans-serif');
      el.setAttribute('font-size', '11px');
      el.removeAttribute('style');
    });
    svgClone.querySelectorAll('.tbl-head-bg').forEach(el => {
      el.setAttribute('fill', tblHeadBg);
      el.setAttribute('fill-opacity', '1');
      el.removeAttribute('style');
    });
    svgClone.querySelectorAll('.tbl-cell-bg').forEach(el => {
      el.setAttribute('fill', tblCellBg);
      el.setAttribute('fill-opacity', '1');
      el.removeAttribute('style');
    });
    svgClone.querySelectorAll('.tbl-head-text').forEach(el => {
      el.setAttribute('fill', tblHeadText);
      el.setAttribute('fill-opacity', '1');
      el.setAttribute('font-family', 'Inter, sans-serif');
      el.setAttribute('font-weight', '700');
      el.removeAttribute('style');
    });
    svgClone.querySelectorAll('.tbl-cell-text').forEach(el => {
      el.setAttribute('fill', tblCellText);
      el.setAttribute('fill-opacity', '1');
      el.setAttribute('font-family', 'Inter, sans-serif');
      el.removeAttribute('style');
    });
    svgClone.querySelectorAll('.tbl-grid').forEach(el => {
      el.setAttribute('stroke', tblGridStroke);
      el.setAttribute('stroke-width', '1');
      el.removeAttribute('style');
    });

    const svgXml = new XMLSerializer().serializeToString(svgClone);

    if (format === 'svg') {
      const blob = new Blob([svgXml], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${cleanTitle}.svg`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } else if (format === 'jpg') {
      // High-resolution JPEG rasterization via HTML5 Canvas
      const blob = new Blob([svgXml], { type: 'image/svg+xml;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const scale = 2; // 2x Retina DPI for ultra crisp export
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(vbW * scale);
        canvas.height = Math.round(vbH * scale);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = bg;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(jpgBlob => {
            if (jpgBlob) {
              const jpgUrl = URL.createObjectURL(jpgBlob);
              const link = document.createElement('a');
              link.href = jpgUrl;
              link.download = `${cleanTitle}.jpg`;
              document.body.appendChild(link);
              link.click();
              link.remove();
              setTimeout(() => URL.revokeObjectURL(jpgUrl), 1000);
            }
          }, 'image/jpeg', 0.96);
        }
        URL.revokeObjectURL(blobUrl);
      };
      img.src = blobUrl;
    }
  });
});
