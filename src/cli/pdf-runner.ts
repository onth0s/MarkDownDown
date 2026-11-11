/**
 * Headless browser detection and PDF compilation runner.
 * Auto-detects Chrome / Edge / Chromium on Windows, macOS, and Linux,
 * executing print-to-pdf without requiring heavy third-party dependencies.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/**
 * Locate a system-installed Chromium-based browser executable.
 */
export function findChromiumBinary(): string | null {
  // Check explicit environment variables first
  const envCandidates = [
    process.env.CHROME_PATH,
    process.env.EDGE_PATH,
    process.env.BROWSER_PATH,
  ].filter((p): p is string => Boolean(p && p.trim().length > 0));

  for (const candidate of envCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  if (isWindows) {
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const localAppData = process.env.LocalAppData || '';

    const winPaths = [
      path.join(programFiles, 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(programFilesX86, 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(programFilesX86, 'Microsoft\\Edge\\Application\\msedge.exe'),
      path.join(programFiles, 'Microsoft\\Edge\\Application\\msedge.exe'),
      path.join(localAppData, 'Google\\Chrome\\Application\\chrome.exe'),
    ];

    for (const p of winPaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
  } else if (isMac) {
    const macPaths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ];

    for (const p of macPaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
  } else {
    // Linux / Unix candidates
    const linuxBinaries = [
      'google-chrome',
      'google-chrome-stable',
      'chromium-browser',
      'chromium',
      'microsoft-edge',
    ];

    for (const bin of linuxBinaries) {
      const res = spawnSync('which', [bin], { encoding: 'utf8' });
      if (res.status === 0 && res.stdout.trim()) {
        const binPath = res.stdout.trim().split('\n')[0];
        if (fs.existsSync(binPath)) {
          return binPath;
        }
      }
    }
  }

  return null;
}

export interface PdfExportOptions {
  htmlPath: string;
  pdfPath: string;
  browserPath?: string;
  theme?: 'dark' | 'light';
}

export interface PdfExportResult {
  success: boolean;
  outputPath?: string;
  error?: string;
}

/**
 * Export an HTML artifact to PDF using headless Chrome/Edge.
 */
export function exportToPdf(options: PdfExportOptions): PdfExportResult {
  const binary = options.browserPath || findChromiumBinary();

  if (!binary) {
    return {
      success: false,
      error:
        'No Chromium-based browser (Google Chrome or Microsoft Edge) was found on your system.\n' +
        'Please install Chrome/Edge or set the CHROME_PATH environment variable to your browser executable,\n' +
        'or open the compiled HTML in a browser and choose "Export as PDF" or Print.',
    };
  }

  if (!fs.existsSync(options.htmlPath)) {
    return {
      success: false,
      error: `Input HTML file not found: ${options.htmlPath}`,
    };
  }

  const pdfOutput = path.resolve(options.pdfPath);

  // Ensure parent directory exists
  const parentDir = path.dirname(pdfOutput);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  let finalHtmlPath = options.htmlPath;
  let tempHtmlCreated = false;

  // If a theme override is requested, adjust data-theme and color-scheme in a temporary file
  if (options.theme) {
    try {
      const origHtml = fs.readFileSync(options.htmlPath, 'utf8');
      let modifiedHtml = origHtml.replace(
        /data-theme="[^"]*"/,
        `data-theme="${options.theme}"`
      );
      if (options.theme === 'light') {
        modifiedHtml = modifiedHtml.replace(
          /color-scheme:\s*dark/g,
          'color-scheme: light'
        );
      } else if (options.theme === 'dark') {
        modifiedHtml = modifiedHtml.replace(
          /color-scheme:\s*light/g,
          'color-scheme: dark'
        );
      }
      const tempPath = path.join(
        parentDir,
        `.temp-${Date.now()}-${path.basename(options.htmlPath)}`
      );
      fs.writeFileSync(tempPath, modifiedHtml, 'utf8');
      finalHtmlPath = tempPath;
      tempHtmlCreated = true;
    } catch {
      // Fallback to original HTML if temporary file creation fails
      finalHtmlPath = options.htmlPath;
    }
  }

  const htmlUrl = pathToFileURL(path.resolve(finalHtmlPath)).href;

  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-pdf-header-footer',
    `--print-to-pdf=${pdfOutput}`,
    htmlUrl,
  ];

  try {
    const res = spawnSync(binary, args, {
      encoding: 'utf8',
      timeout: 30000,
    });

    if (tempHtmlCreated && fs.existsSync(finalHtmlPath)) {
      try {
        fs.unlinkSync(finalHtmlPath);
      } catch {
        // Ignore cleanup errors on temporary files
      }
    }

    if (res.status !== 0 || !fs.existsSync(pdfOutput)) {
      const errDetail = res.stderr || res.stdout || `Process exited with code ${res.status}`;
      return {
        success: false,
        error: `Failed to generate PDF via headless browser: ${errDetail}`,
      };
    }

    return {
      success: true,
      outputPath: pdfOutput,
    };
  } catch (err) {
    return {
      success: false,
      error: `Error running headless browser: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
