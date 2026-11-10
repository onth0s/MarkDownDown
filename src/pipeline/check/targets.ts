import fs from 'node:fs';
import path from 'node:path';
import { extractEmbeddedSkeleton } from './round-trip.js';

export interface CheckTargetPair {
  htmlFile: string | null;
  sourceFile: string | null;
  error?: string;
}

export function resolveCheckTargets(
  input: string,
  sourceArg: string | undefined,
  outputOpt: string | undefined,
): CheckTargetPair {
  const isHtml = (f: string) => /\.(html|htm)$/i.test(f);
  if (sourceArg) {
    const file1 = path.resolve(process.cwd(), input);
    const file2 = path.resolve(process.cwd(), sourceArg);
    if (isHtml(file1) && !isHtml(file2)) {
      return { htmlFile: file1, sourceFile: file2 };
    } else if (!isHtml(file1) && isHtml(file2)) {
      return { htmlFile: file2, sourceFile: file1 };
    }
    return {
      htmlFile: null,
      sourceFile: null,
      error: 'When two files are provided for --check, one must be an HTML artifact (.html) and the other a Markdown source (.mdd / .md).',
    };
  }

  const inputFile = path.resolve(process.cwd(), input);
  const inputDir = path.dirname(inputFile);
  const stem = path.parse(inputFile).name;

  if (isHtml(inputFile)) {
    const htmlFile = inputFile;
    let htmlContent: string;
    try {
      htmlContent = fs.readFileSync(htmlFile, 'utf8');
    } catch {
      return { htmlFile, sourceFile: null, error: `HTML artifact not found: ${htmlFile}` };
    }
    const skeleton = extractEmbeddedSkeleton(htmlContent);
    if (!skeleton) {
      return { htmlFile, sourceFile: null, error: `HTML artifact does not contain an embedded #mdd-skeleton payload: ${htmlFile}` };
    }
    let sourceName: string | undefined;
    try {
      const m = htmlContent.match(/<script type="application\/json" id="mdd-skeleton">([\s\S]*?)<\/script>/i);
      if (m) sourceName = (JSON.parse(m[1]) as { name?: string }).name;
    } catch { /* malformed skeleton payload */ }

    const candidates: string[] = [];
    if (sourceName) {
      candidates.push(path.resolve(path.dirname(htmlFile), sourceName));
      candidates.push(path.resolve(path.dirname(htmlFile), sourceName.replace(/\.mdd$/i, '.md')));
      candidates.push(path.resolve(path.dirname(htmlFile), sourceName.replace(/\.md$/i, '.mdd')));
      candidates.push(path.resolve(process.cwd(), sourceName));
    }
    candidates.push(path.resolve(path.dirname(htmlFile), `${stem}.mdd`));
    candidates.push(path.resolve(process.cwd(), `${stem}.mdd`));
    candidates.push(path.resolve(path.dirname(htmlFile), `${stem}.md`));
    candidates.push(path.resolve(process.cwd(), `${stem}.md`));

    for (const c of candidates) {
      if (fs.existsSync(c)) {
        return { htmlFile, sourceFile: c };
      }
    }
    return {
      htmlFile,
      sourceFile: null,
      error: `Original source file not found to compare against.\nSearched candidates:\n  ${candidates.join('\n  ')}\nSpecify the source file explicitly: mdd ${input} <source.mdd> --check`,
    };
  }

  // Input is markdown source
  const sourceFile = inputFile;
  const candidates: string[] = [];
  if (outputOpt && isHtml(outputOpt)) {
    candidates.push(path.resolve(process.cwd(), outputOpt));
  }
  candidates.push(path.resolve(inputDir, `${stem}.html`));
  candidates.push(path.resolve(process.cwd(), `${stem}.html`));
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return { htmlFile: c, sourceFile };
    }
  }
  return { htmlFile: null, sourceFile };
}
