import fs from 'node:fs';
import path from 'node:path';

describe('Sidebar slide-able, collapse, reopen, and position switching', () => {
  const shellHtml = fs.readFileSync(path.resolve(process.cwd(), 'templates', 'shell.html'), 'utf8');
  const styleCss = fs.readFileSync(path.resolve(process.cwd(), 'templates', 'style.css'), 'utf8');
  const controlsJs = fs.readFileSync(path.resolve(process.cwd(), 'templates', 'app', '03-controls.js'), 'utf8');
  const coreJs = fs.readFileSync(path.resolve(process.cwd(), 'templates', 'app', '01-core.js'), 'utf8');

  test('shell includes resizer handle, edge reopen button, and position toggle button', () => {
    expect(shellHtml).toContain('id="sidebarResizer"');
    expect(shellHtml).toContain('class="sidebar-resizer"');
    expect(shellHtml).toContain('id="sidebarReopenBtn"');
    expect(shellHtml).toContain('class="sidebar-reopen-btn"');
    expect(shellHtml).toContain('id="sidebarPosBtn"');
    expect(shellHtml).toContain('class="btn-sidebar-pos"');
    expect(shellHtml).toContain('Sidebar position');
  });

  test('style.css defines custom property --sidebar-w and responsive grid layout', () => {
    expect(styleCss).toContain('--sidebar-w: 280px');
    expect(styleCss).toContain('var(--sidebar-w, 280px)');
    expect(styleCss).toContain('.sidebar-resizer');
    expect(styleCss).toContain('cursor: col-resize');
  });

  test('style.css defines desktop collapse state, full layout width, and burger menu drawer', () => {
    expect(styleCss).toContain('body.sidebar-collapsed .sidebar');
    expect(styleCss).toContain('body.sidebar-collapsed .mobile-nav');
    expect(styleCss).toContain('display: inline-flex !important');
    expect(styleCss).toContain('body.sidebar-collapsed.nav-open .sidebar');
  });

  test('style.css defines edge reopen button with dynamic visibility', () => {
    expect(styleCss).toContain('.sidebar-reopen-btn');
    expect(styleCss).toContain('body.sidebar-collapsed:not(.nav-open) .sidebar-reopen-btn');
    expect(styleCss).toContain('.sidebar-reopen-btn.is-visible');
  });

  test('style.css defines sidebar-right positioning rules', () => {
    expect(styleCss).toContain('body.sidebar-right .sidebar');
    expect(styleCss).toContain('body.sidebar-right .sidebar-reopen-btn');
  });

  test('03-controls.js wires up resize drag, dynamic Y-axis arrow tracking, and position toggle', () => {
    expect(controlsJs).toContain('sidebarResizer');
    expect(controlsJs).toContain('sidebarReopenBtn');
    expect(controlsJs).toContain('sidebarPosBtn');
    expect(controlsJs).toContain('DEFAULT_SIDEBAR_WIDTH = 280');
    expect(controlsJs).toContain('COLLAPSE_THRESHOLD = 130');
    expect(controlsJs).toContain('dblclick');
    expect(controlsJs).toContain("window.addEventListener('mousemove'");
    expect(controlsJs).toContain('sidebarReopenBtn.style.top');
    expect(controlsJs).toContain("body.classList.toggle('nav-open')");
    expect(controlsJs).toContain('setSidebarPosition');
    expect(controlsJs).toContain('setSidebarCollapsed');
    expect(controlsJs).toContain('setSidebarWidth');
    expect(controlsJs).toContain('mdd_sidebar_pos');
    expect(controlsJs).toContain('mdd_sidebar_w');
    expect(controlsJs).toContain('mdd_sidebar_collapsed');
  });

  test('01-core.js positions navigation history pill outside sidebar in all layout configurations', () => {
    expect(coreJs).toContain("body.classList.contains('sidebar-right')");
    expect(coreJs).toContain("body.classList.contains('sidebar-collapsed')");
    expect(coreJs).toContain('sidebar.getBoundingClientRect()');
  });
});
