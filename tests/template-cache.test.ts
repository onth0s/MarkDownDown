import { loadTemplate, clearTemplateCache, substituteTokens } from '../src/util/template-loader.js';

describe('Template Loader & Caching', () => {
  beforeEach(() => {
    clearTemplateCache();
  });

  test('loads shell.html template and caches result', () => {
    const t1 = loadTemplate('shell.html');
    expect(t1.toLowerCase()).toContain('<!doctype html>');
    expect(t1).toContain('{{title}}');

    // Second call should return identical cached content
    const t2 = loadTemplate('shell.html');
    expect(t2).toBe(t1);
  });

  test('loads app.js modular template and caches merged bundle', () => {
    const js1 = loadTemplate('app.js');
    expect(js1).toContain('use strict');
    expect(js1).toContain('__ROUTES__');

    const js2 = loadTemplate('app.js');
    expect(js2).toBe(js1);
  });

  test('clearTemplateCache resets the cache', () => {
    const t1 = loadTemplate('shell.html');
    clearTemplateCache();
    const t2 = loadTemplate('shell.html');
    expect(t2).toEqual(t1);
  });

  test('substituteTokens replaces placeholder keys and functions', () => {
    const tmpl = 'Hello __NAME__, your score is __SCORE__ and status is __STATUS__!';
    const res = substituteTokens(tmpl, {
      __NAME__: 'Alice',
      __SCORE__: () => String(42 + 58),
      __STATUS__: 'Active',
    });
    expect(res).toBe('Hello Alice, your score is 100 and status is Active!');
  });
});
