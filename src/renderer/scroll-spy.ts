/**
 * Pure scroll-spy detection.
 *
 * Given an array of heading document-relative Y offsets (ascending) and the
 * current scroll position, returns the index of the heading that should be
 * highlighted.  The algorithm is deliberately simple so that it can be proven
 * monotonically non-decreasing: as `scrollY` increases the returned index can
 * only stay the same or advance forward — never backtrack.
 *
 * `threshold` is how many pixels below the top of the viewport a heading must
 * be before it is considered "current" (accounts for a sticky header).
 */
export function detectActiveHeading(
  headingOffsets: readonly number[],
  scrollY: number,
  threshold = 100,
): number {
  let idx = 0;
  for (let i = 0; i < headingOffsets.length; i++) {
    if (headingOffsets[i] <= scrollY + threshold) idx = i;
  }
  return idx;
}
