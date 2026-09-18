/**
 * Parser for Markdown++ Mirror Mode DSL (```mirror blocks).
 *
 * Supports flexible, resilient parsing of:
 * - Q&A / FAQ / Clarification items (Q: ... A: ...)
 * - Semantic Alignment Probes (PROBE: ... [ ] / [x] ... AUTHOR: ... DIVERGENCE: ...)
 *
 * Designed to be fault-tolerant to agent variations (bullets, casing, spacing)
 * while throwing clear CompileError on fatal structural violations.
 */
import { CompileError } from '../../util/error.js';
import type { MirrorBlockModel, MirrorKind, MirrorOption, MirrorProbe, MirrorQAItem } from './types.js';

let nextMirrorId = 1;

/** Reset the mirror block ID counter (useful for unit testing reproducible IDs). */
export function resetMirrorIdCounter(): void {
  nextMirrorId = 1;
}

/**
 * Parses raw ```mirror [subkind] source code into a structured MirrorBlockModel.
 */
export function mirrorParse(source: string, subkindHint?: string, explicitId?: string): MirrorBlockModel {
  const lines = source.split(/\r?\n/);
  let title: string | undefined;
  let target: string | undefined;

  // Detect explicit or hinted subkind: qa, faq, probe, clarification, or generic
  const rawSubkind = (subkindHint || '').trim().toLowerCase();
  let kind: MirrorKind = 'generic';
  if (/^(qa|q&a)$/i.test(rawSubkind)) kind = 'qa';
  else if (/^faq$/i.test(rawSubkind)) kind = 'faq';
  else if (/^probe$/i.test(rawSubkind)) kind = 'probe';
  else if (/^clarification$/i.test(rawSubkind)) kind = 'clarification';

  const items: MirrorQAItem[] = [];
  const probes: MirrorProbe[] = [];

  let currentQA: { question: string; answerLines: string[]; lineNum: number } | null = null;
  let currentProbe: {
    claim: string;
    options: MirrorOption[];
    authorLines: string[];
    divergenceLines: string[];
    inSection: 'options' | 'author' | 'divergence';
    lineNum: number;
  } | null = null;

  const flushQA = () => {
    if (!currentQA) return;
    const q = currentQA.question.trim();
    const a = currentQA.answerLines.join('\n').trim();
    if (q) {
      items.push({ question: q, answer: a });
    }
    currentQA = null;
  };

  const flushProbe = () => {
    if (!currentProbe) return;
    const claim = currentProbe.claim.trim();
    const authorDeclaredMeaning = currentProbe.authorLines.join('\n').trim();
    const divergenceExplanation = currentProbe.divergenceLines.join('\n').trim() || undefined;

    if (!claim) {
      throw new CompileError(
        `Mirror Mode DSL error: PROBE block starting at line ${currentProbe.lineNum} has no claim or question text.`,
      );
    }

    if (currentProbe.options.length === 0) {
      throw new CompileError(
        `Mirror Mode DSL error: PROBE "${claim.slice(0, 40)}..." at line ${currentProbe.lineNum} must define at least one option (e.g. "[x] ..." or "[ ] ...").`,
      );
    }

    probes.push({
      claim,
      options: currentProbe.options,
      authorDeclaredMeaning: authorDeclaredMeaning || 'Author declared meaning not specified.',
      divergenceExplanation,
    });

    currentProbe = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const lineNum = i + 1;
    const trimmed = rawLine.trim();

    // Skip empty lines or comments
    if (!trimmed || trimmed.startsWith('%%') || trimmed.startsWith('//')) {
      continue;
    }

    // 1. TITLE: directive
    const titleMatch = trimmed.match(/^TITLE:\s*(.+)$/i);
    if (titleMatch && !title) {
      title = titleMatch[1].trim();
      continue;
    }

    // 1b. TARGET: directive
    const targetMatch = trimmed.match(/^TARGET:\s*(.+)$/i);
    if (targetMatch && !target) {
      target = targetMatch[1].trim();
      continue;
    }

    // 2. PROBE directive: PROBE: ... or CLAIM: ... or ALIGNMENT: ...
    const probeMatch = trimmed.match(/^(?:PROBE|CLAIM|ALIGNMENT|CHECK)\s*[:：]\s*(.+)$/i);
    if (probeMatch) {
      flushQA();
      flushProbe();
      currentProbe = {
        claim: probeMatch[1].trim(),
        options: [],
        authorLines: [],
        divergenceLines: [],
        inSection: 'options',
        lineNum,
      };
      if (kind === 'generic') kind = 'probe';
      continue;
    }

    // 3. Option item within a probe: [ ], [x], ( ), (*), - [ ], etc.
    const optionMatch = trimmed.match(/^(?:[-*+]\s+)?(?:\[([ xX*])\]|\(([ xX*])\)|([a-zA-Z0-9])[).])\s+(.+)$/);
    if (currentProbe && optionMatch && currentProbe.inSection === 'options') {
      const mark = (optionMatch[1] || optionMatch[2] || '').toLowerCase();
      const rawText = (optionMatch[4] || '').trim();

      // Check for inline explanation: "[ ] Option text --> Divergence note" or "— note" or "// note"
      const expMatch = rawText.match(/^(.*?)(?:\s+(?:-->|—|--|\/\/)\s*(.+))?$/);
      const text = (expMatch ? expMatch[1] : rawText).trim();
      const explanation = expMatch && expMatch[2] ? expMatch[2].trim() : undefined;
      const isAuthorAligned = mark === 'x' || mark === '*';

      currentProbe.options.push({
        text,
        isAuthorAligned,
        explanation,
      });
      continue;
    }

    // 4. AUTHOR / DECLARED MEANING directive within a probe
    const authorMatch = trimmed.match(/^(?:AUTHOR|DECLARED|MEANING|CONCEPTUAL MAP)\s*[:：]\s*(.*)$/i);
    if (currentProbe && authorMatch) {
      currentProbe.inSection = 'author';
      if (authorMatch[1].trim()) {
        currentProbe.authorLines.push(authorMatch[1].trim());
      }
      continue;
    }

    // 5. DIVERGENCE / DISTINCTION directive within a probe
    const divergenceMatch = trimmed.match(/^(?:DIVERGENCE|DIVERGE|GAP|DISTINCTION|WHY THIS MATTERS|NOTE)\s*[:：]\s*(.*)$/i);
    if (currentProbe && divergenceMatch) {
      currentProbe.inSection = 'divergence';
      if (divergenceMatch[1].trim()) {
        currentProbe.divergenceLines.push(divergenceMatch[1].trim());
      }
      continue;
    }

    // If inside a probe section, accumulate multi-line content
    if (currentProbe) {
      if (currentProbe.inSection === 'author') {
        currentProbe.authorLines.push(rawLine.trimEnd());
        continue;
      } else if (currentProbe.inSection === 'divergence') {
        currentProbe.divergenceLines.push(rawLine.trimEnd());
        continue;
      }
    }

    // 6. Q&A / FAQ: Question line (Q: ..., Question: ..., or ### Question...)
    const questionMatch = trimmed.match(/^(?:Q|QUESTION)\s*[:：]\s*(.+)$/i) ||
                          trimmed.match(/^#{1,4}\s+(?:Q\s*[:：]\s*)?(.+)$/i);
    if (questionMatch) {
      flushQA();
      flushProbe();
      currentQA = {
        question: questionMatch[1].trim(),
        answerLines: [],
        lineNum,
      };
      if (kind === 'generic') kind = 'qa';
      continue;
    }

    // 7. Q&A / FAQ: Answer line (A: ..., Answer: ..., Author: ...)
    const answerMatch = trimmed.match(/^(?:A|ANSWER|CLARIFICATION)\s*[:：]\s*(.*)$/i);
    if (currentQA && answerMatch) {
      if (answerMatch[1].trim()) {
        currentQA.answerLines.push(answerMatch[1].trim());
      }
      continue;
    }

    // If inside a QA item, accumulate lines
    if (currentQA) {
      if (currentQA.answerLines.length > 0) {
        currentQA.answerLines.push(rawLine.trimEnd());
      } else {
        currentQA.question += ' ' + trimmed;
      }
      continue;
    }

    // Implicit fallback for plain key-value or unrecognized lines:
    // If line starts with "Q:" without space or similar
    if (/^Q\d*\s*[:：]/i.test(trimmed)) {
      flushQA();
      flushProbe();
      currentQA = {
        question: trimmed.replace(/^Q\d*\s*[:：]\s*/i, '').trim(),
        answerLines: [],
        lineNum,
      };
      continue;
    }
  }

  flushQA();
  flushProbe();

  // If subkind wasn't explicitly pinned, deduce the most specific kind
  if (kind === 'generic') {
    if (probes.length > 0) kind = 'probe';
    else if (items.length > 0) kind = 'qa';
  }

  const id = explicitId ?? `mirror-${nextMirrorId++}`;

  return {
    id,
    kind,
    title,
    target,
    items,
    probes,
    rawSource: source,
  };
}
