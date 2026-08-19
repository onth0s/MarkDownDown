import { processLogo } from '../src/renderer/logo-processor.js';
import fs from 'node:fs';
import path from 'node:path';

describe('Logo Processor Unit Tests', () => {
  const scratchDir = path.resolve(process.cwd(), 'scratch');

  test('returns default logo when no path or non-existent path is provided', () => {
    const res = processLogo(undefined, '#3b82f6');
    expect(res.navbarLogo).toContain('class="brand-logo"');
    expect(res.navbarLogo).toContain('viewBox="0 0 1024 1024"');
    expect(res.faviconHref).toContain('data:image/svg+xml');
  });

  test('processes custom SVG logo extracting viewBox, harmonizing hue and preserving lightness', () => {
    const svgPath = path.join(scratchDir, 'test-logo.svg');
    const svgContent = `<svg width="500" height="500" viewBox="0 0 500 500" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="250" cy="250" r="200" fill="#ff0000"/>
    </svg>`;
    fs.writeFileSync(svgPath, svgContent, 'utf8');

    try {
      // #10b981 is green (h: 160, s: 84%, l: 39%)
      // #ff0000 has lightness = 50%
      // Output for circle should have lightness 50% and hue 160
      const res = processLogo(svgPath, '#10b981');
      expect(res.navbarLogo).toContain('class="brand-logo"');
      expect(res.navbarLogo).toContain('viewBox="0 0 500 500"');
      expect(res.navbarLogo).toContain('fill="#14eba3" data-l="50"');
      expect(res.faviconTemplate).toContain('viewBox="0 0 500 500"');
      expect(res.faviconTemplate).toContain('fill="{L_50}"');
      expect(res.faviconHref).toContain('data:image/svg+xml');
    } finally {
      if (fs.existsSync(svgPath)) fs.unlinkSync(svgPath);
    }
  });

  test('processes custom SVG logo with named colors (stroke="black")', () => {
    const svgPath = path.join(scratchDir, 'test-black-logo.svg');
    const svgContent = `<svg width="400" height="400" viewBox="0 0 400 400" fill="none">
      <path d="M10 10 L100 100" stroke="black" stroke-width="20"/>
    </svg>`;
    fs.writeFileSync(svgPath, svgContent, 'utf8');

    try {
      const res = processLogo(svgPath, '#d10000');
      expect(res.navbarLogo).toContain('stroke="#d10000"');
      expect(res.navbarLogo).toContain('data-l="41"');
      expect(res.faviconTemplate).toContain('stroke="{L_41}"');
    } finally {
      if (fs.existsSync(svgPath)) fs.unlinkSync(svgPath);
    }
  });

  test('processes custom raster image (PNG) as base64 data URI', () => {
    const pngPath = path.join(scratchDir, 'test-logo.png');
    // 1x1 transparent PNG buffer
    const pngBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    fs.writeFileSync(pngPath, pngBuffer);

    try {
      const res = processLogo(pngPath, '#3b82f6');
      expect(res.navbarLogo).toContain('<img class="brand-logo" src="data:image/png;base64,');
      expect(res.navbarLogo).toContain('width="30" height="30"');
      expect(res.faviconHref).toContain('data:image/png;base64,');
    } finally {
      if (fs.existsSync(pngPath)) fs.unlinkSync(pngPath);
    }
  });
});
