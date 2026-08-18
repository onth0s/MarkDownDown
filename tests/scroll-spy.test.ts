import { detectActiveHeading } from '../src/renderer/scroll-spy.js';

/**
 * Scrolls through headingOffsets from 0 → max, collecting the active index at
 * every pixel.  Returns the full sequence of indices.
 */
function scrollSequence(
  offsets: readonly number[],
  maxScrollY: number,
  threshold = 100,
): number[] {
  const seq: number[] = [];
  for (let y = 0; y <= maxScrollY; y++) {
    seq.push(detectActiveHeading(offsets, y, threshold));
  }
  return seq;
}

describe('detectActiveHeading', () => {
  // Realistic CLDS-like heading offsets (pixels from top of document)
  const offsets = [180, 520, 980, 1120, 1800, 2400, 3100, 3500, 4200, 5000];
  const maxScroll = 6000;

  test('returns 0 at top of page', () => {
    expect(detectActiveHeading(offsets, 0)).toBe(0);
  });

  test('returns last index when scrolled past everything', () => {
    expect(detectActiveHeading(offsets, 99999)).toBe(offsets.length - 1);
  });

  test('index is monotonically non-decreasing over full scroll range', () => {
    const seq = scrollSequence(offsets, maxScroll);
    for (let i = 1; i < seq.length; i++) {
      expect(seq[i]).toBeGreaterThanOrEqual(seq[i - 1]);
    }
  });

  test('never skips backward (no backtracking)', () => {
    const seq = scrollSequence(offsets, maxScroll);
    let maxSeen = 0;
    for (const idx of seq) {
      expect(idx).toBeGreaterThanOrEqual(maxSeen);
      maxSeen = idx;
    }
  });

  test('every heading is eventually reached', () => {
    const seq = scrollSequence(offsets, maxScroll);
    const reached = new Set(seq);
    for (let i = 0; i < offsets.length; i++) {
      expect(reached.has(i)).toBe(true);
    }
  });

  test('transitions happen within threshold of each heading offset', () => {
    const seq = scrollSequence(offsets, maxScroll);
    // Find the first scrollY where each index becomes active
    const firstSeen: number[] = [];
    for (let i = 0; i < offsets.length; i++) {
      firstSeen.push(seq.indexOf(i));
    }
    // heading 0 is always active from scrollY=0 (idx starts at 0)
    expect(firstSeen[0]).toBe(0);
    for (let i = 1; i < offsets.length; i++) {
      // heading i first becomes active at scrollY = offsets[i] - threshold
      expect(firstSeen[i]).toBe(offsets[i] - 100);
    }
  });

  test('dense headings (1px apart) still progress monotonically', () => {
    const dense = Array.from({ length: 200 }, (_, i) => 100 + i * 50);
    const seq = scrollSequence(dense, 12000);
    for (let i = 1; i < seq.length; i++) {
      expect(seq[i]).toBeGreaterThanOrEqual(seq[i - 1]);
    }
  });

  test('single heading always returns 0', () => {
    const seq = scrollSequence([500], 3000);
    expect(seq.every(i => i === 0)).toBe(true);
  });

  test('empty offsets returns 0', () => {
    expect(detectActiveHeading([], 1000)).toBe(0);
  });

  test('threshold parameter shifts transition points', () => {
    const smallThreshold = scrollSequence(offsets, maxScroll, 30);
    const largeThreshold = scrollSequence(offsets, maxScroll, 200);
    // With larger threshold, each heading activates earlier (lower scrollY)
    // Find first occurrence of index 5 in each
    const firstSmall = smallThreshold.indexOf(5);
    const firstLarge = largeThreshold.indexOf(5);
    expect(firstLarge).toBeLessThan(firstSmall);
  });
});
