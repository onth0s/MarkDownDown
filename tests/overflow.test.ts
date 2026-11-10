import path from 'path';
import fs from 'fs';
import http from 'http';
import { spawn } from 'child_process';
import os from 'os';
import { build } from '../src/compile.js';
import type { Options } from '../src/types.js';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

interface CdpTab {
  url: string;
  webSocketDebuggerUrl: string;
}

interface CdpMessageEvent {
  data: string;
}

function fetchJson<T = unknown>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

class CdpClient {
  private ws: WebSocket;
  private id = 0;
  private pending = new Map<number, { resolve: (val: unknown) => void; reject: (err: unknown) => void }>();
  public ready: Promise<void>;

  constructor(wsUrl: string) {
    this.ws = new (globalThis as unknown as { WebSocket: new (url: string) => WebSocket }).WebSocket(wsUrl);
    this.ready = new Promise((resolve, reject) => {
      this.ws.onopen = () => resolve();
      this.ws.onerror = reject;
    });
    this.ws.onmessage = (event: CdpMessageEvent) => {
      const msg = JSON.parse(event.data) as { id?: number; result?: unknown; error?: unknown };
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)!;
        this.pending.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };
  }

  async send<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    await this.ready;
    const msgId = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(msgId, { resolve: resolve as (val: unknown) => void, reject });
      this.ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  close() {
    this.ws.close();
  }
}

describe('overflow and mirror UI integrity', () => {
  const cssMirrorPath = path.resolve('templates/style/08-mirror.css');
  const cssResponsivePath = path.resolve('templates/style/07-responsive.css');

  test('08-mirror.css neutralizes .code-wrap styling for mirror blocks', () => {
    const css = fs.readFileSync(cssMirrorPath, 'utf8');
    expect(css).toContain('.code-wrap.mirror');
    expect(css).toContain('box-shadow: none !important');
    expect(css).toContain('border: none !important');
    expect(css).toContain('.code-wrap.mirror > .copy-btn');
    expect(css).toContain('display: none !important');
  });

  test('08-mirror.css uses dynamic theme accent for .mirror-target-locator', () => {
    const css = fs.readFileSync(cssMirrorPath, 'utf8');
    const locatorMatch = css.match(/\.mirror-target-locator\s*\{[^}]*\}/);
    expect(locatorMatch).not.toBeNull();
    expect(locatorMatch![0]).not.toContain('59, 130, 246');
    expect(locatorMatch![0]).toContain('var(--accent-rgb)');
  });

  test('07-responsive.css specifies fluid containment and narrow mobile breakpoints', () => {
    const css = fs.readFileSync(cssResponsivePath, 'utf8');
    expect(css).toContain('max-width: 100%');
    expect(css).toContain('@media (max-width:480px)');
    expect(css).toContain('@media (max-width:380px)');
    expect(css).toContain('@media (max-width:340px)');
  });

  test('compiler outputs mirror blocks without ghost copy buttons and formats <kbd> tags', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdpp-overflow-'));
    const inputPath = path.join(tmpDir, 'test.mdd');
    const outPath = path.join(tmpDir, 'test.html');
    const md = `
# Sample

Use <kbd>Alt</kbd>+<kbd>M</kbd> to toggle.

\`\`\`mirror qa
TITLE: Architecture
Q: What is MD++?
A: A markdown compiler.
\`\`\`
`;
    fs.writeFileSync(inputPath, md, 'utf8');

    const opts: Options = {
      inputFile: inputPath,
      outputPath: outPath,
      title: 'Test',
      accent: '#8b5cf6',
      assetsDir: path.resolve('tests/fixtures'),
      outputMode: 'single',
      noDiagrams: false,
      noTables: false,
      verbose: false,
      minify: false,
    };
    try {
      const res = build(opts);
      expect(res.html).toContain('<kbd>Alt</kbd>+<kbd>M</kbd>');
      expect(res.html).toContain('class="mirror-block"');

      // Confirm no copy button is injected inside the mirror wrap
      const mirrorWrapMatch = res.html.match(/<div class="code-wrap mirror"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/);
      if (mirrorWrapMatch) {
        expect(mirrorWrapMatch[0]).not.toContain('class="copy-btn"');
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  const runBrowserTests = fs.existsSync(CHROME_PATH);
  (runBrowserTests ? test : test.skip)(
    'headless Chrome verification: 0 horizontal overflows across 320px, 375px, 768px, 1200px in Read & Mirror modes',
    async () => {
      const showcasePath = path.resolve('showcase/showcase.html');
      expect(fs.existsSync(showcasePath)).toBe(true);

      const fileUrl = 'file:///' + showcasePath.replace(/\\/g, '/');
      const port = 9444;
      const proc = spawn(CHROME_PATH, [
        '--headless=new',
        '--disable-gpu',
        `--remote-debugging-port=${port}`,
        fileUrl,
      ], { stdio: 'ignore' });

      await new Promise((r) => setTimeout(r, 1500));

      try {
        const tabs = await fetchJson<CdpTab[]>(`http://127.0.0.1:${port}/json`);
        const tab = tabs.find((t: CdpTab) => t.url && t.url.includes('showcase.html'));
        expect(tab).toBeDefined();

        const cdp = new CdpClient(tab!.webSocketDebuggerUrl);
        const viewports = [320, 375, 768, 1200];
        const modes = ['read', 'mirror'];

        for (const vp of viewports) {
          for (const mode of modes) {
            await cdp.send('Emulation.setDeviceMetricsOverride', {
              width: vp,
              height: 900,
              deviceScaleFactor: 1,
              mobile: vp <= 768,
            });
            await new Promise((r) => setTimeout(r, 150));

            const evalRes = await cdp.send<{ result: { value: { scrollWidth: number; clientWidth: number; overflowing: unknown[] } } }>('Runtime.evaluate', {
              expression: `(() => {
                if ('${mode}' === 'mirror') {
                  document.body.setAttribute('data-mode', 'mirror');
                } else {
                  document.body.removeAttribute('data-mode');
                }
                function isInsideScrollableContainer(node) {
                  let p = node.parentElement;
                  while (p && p !== document.body && p !== document.documentElement) {
                    const s = window.getComputedStyle(p);
                    if (s.overflowX === 'auto' || s.overflowX === 'scroll' || s.overflowX === 'hidden') {
                      return true;
                    }
                    p = p.parentElement;
                  }
                  return false;
                }

                const clientWidth = document.documentElement.clientWidth;
                const scrollWidth = document.documentElement.scrollWidth;
                const overflowing = [];
                const all = document.querySelectorAll('*');
                for (const el of all) {
                  const rect = el.getBoundingClientRect();
                  const style = window.getComputedStyle(el);
                  if (style.display === 'none' || style.visibility === 'hidden') continue;
                  if (style.position === 'fixed' && rect.left < 0) continue;
                  if (isInsideScrollableContainer(el)) continue;
                  if (rect.right > clientWidth + 1.5 && rect.width > 0) {
                    overflowing.push({
                      tag: el.tagName,
                      cls: el.className,
                      id: el.id,
                      right: rect.right,
                      clientWidth: clientWidth,
                      overflow: rect.right - clientWidth
                    });
                  }
                }
                return { clientWidth, scrollWidth, overflowing };
              })()`,
              returnByValue: true,
            });

            const val = evalRes.result.value;
            expect(val.scrollWidth).toBeLessThanOrEqual(val.clientWidth + 1);
            expect(val.overflowing).toHaveLength(0);
          }
        }
        cdp.close();
      } finally {
        proc.kill();
      }
    },
    30000
  );
});
