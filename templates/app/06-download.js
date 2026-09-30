// ── Download original .mdd (right-click the document logo) ───────────────────
// Reconstructs the exact source from the DOM prose runs plus the embedded
// skeleton, then downloads it. Mirrors the `mdd --check` round-trip
// (src/renderer/html-extract.ts + assembleFromSkeleton + the fidelity rule
// that re-literals any run the DOM cannot reproduce byte-for-byte), with two
// live-DOM amendments:
//   - search <mark> highlights are transparent: their text re-merges into the
//     run they split, so an active search can't skew slot/run alignment;
//   - <wbr> seams re-join exactly like the extractor removing the tag.
// Hard-coded trigger: contextmenu on the .brand logo. No UI, no prompts.

const mddSkeletonEl = document.getElementById('mdd-skeleton');
const mddBrand = document.querySelector('.brand');
const mddArticle = document.getElementById('article');

if (mddSkeletonEl && mddBrand && mddArticle) {
  let mddPayload = null;
  try {
    mddPayload = JSON.parse(mddSkeletonEl.textContent);
  } catch (_) {
    mddPayload = null;
  }
  if (mddPayload && mddPayload.skeleton && Array.isArray(mddPayload.skeleton.b)) {
    const PROSE_SLOT = -1;
    const SKIP_RUN = -2;
    const SKIPPED_TAGS = { svg: 1, pre: 1, button: 1, script: 1, style: 1, textarea: 1 };

    // Flat text-node walk, mirroring stripChrome + extractProse: skip chrome
    // subtrees, drop the whitespace-only node that follows a <br>, and keep
    // everything else — including whitespace-only runs between inline elements,
    // which are real slots.
    //
    // Adjacent text nodes are merged here rather than with Node.normalize(),
    // because normalize also joins across a <br> and would fuse the break's own
    // newline into the following run. The merge therefore happens at collection
    // time: only text nodes that are true siblings in the seam-unwrapped tree
    // join up, and an inline element ends the run like a tag would in the string
    // extractor.
    function mddProseRuns(root, out) {
      // `open` tracks whether the last thing appended was a text node that the
      // NEXT SIBLING text node continues, so a wbr/mark seam re-joins into one
      // run while an inline element ends it (as a tag does in the extractor).
      let open = false;
      let afterBr = false;
      const kids = root.childNodes;
      for (let i = 0; i < kids.length; i++) {
        const n = kids[i];
        if (n.nodeType === 3) { // Text
          const t = n.data;
          if (afterBr) {
            afterBr = false;
            if (t.trim() === '') continue; // the <br>'s own newline
            out.push(t);
          } else if (open && out.length > 0) {
            out[out.length - 1] += t; // seam re-joined: same source run
          } else {
            out.push(t);
          }
          open = true;
        } else if (n.nodeType === 1) { // Element
          const tag = (n.tagName || '').toLowerCase();
          if (tag === 'br') {
            afterBr = true;
            open = false;
            continue;
          }
          // Chrome is transparent: the extractor deletes it, so text on either
          // side stays a single run.
          if (SKIPPED_TAGS[tag]) continue;
          if (n.id === 'noResults') continue;
          // heading-anchor is the important one: 02-toc.js injects
          // `<a class="heading-anchor">#</a>` into every heading AT RUNTIME, so
          // it exists in this live DOM and in no static HTML. Walking it would
          // add a phantom run per heading and shear every later slot out of
          // alignment. 05-search.js and 01-core.js exclude it for the same
          // reason. Its text also mutates to "Link copied!" on click, which the
          // static extractor never sees either.
          if (n.classList && (
            n.classList.contains('heading-anchor') ||
            n.classList.contains('hero') ||
            n.classList.contains('mirror-block') ||
            n.classList.contains('code-title-bar') ||
            n.classList.contains('code-actions') ||
            n.classList.contains('alert-title')
          )) continue;
          mddProseRuns(n, out);
          open = false;
        }
      }
    }

    // assembleFromSkeleton, including span-based byte fidelity. The payload is
    // pruned at build time to the slots whose DOM run cannot reproduce the
    // source text (typographer rewrites, minified whitespace), so a present
    // span is always the override and absent spans fall through to the run.
    function mddAssemble(sk, runs) {
      const spans = sk.spans || {};
      const b = sk.b;
      const parts = [sk.fm || ''];
      let p = 0;
      let slot = 0;
      for (let i = 0; i < b.length; i++) {
        const seg = b[i];
        if (seg === PROSE_SLOT) {
          const run = p < runs.length ? runs[p] : undefined;
          p++;
          const span = typeof spans[slot] === 'string' ? spans[slot] : undefined;
          slot++;
          if (span !== undefined) {
            parts.push(span);
          } else {
            parts.push(run === undefined ? '' : run);
          }
        } else if (seg === SKIP_RUN) {
          p++;
          slot++;
        } else if (typeof seg === 'number') {
          parts.push(p < runs.length ? runs[p] : '');
          p++;
        } else {
          parts.push(seg);
        }
      }
      let out = parts.join('');
      if (sk.eol === '\r\n') {
        out = out.replace(/(?<!\r)\n/g, '\r\n');
      }
      return out;
    }

    // Hand the reconstructed bytes over as a .mdd download.
    function mddDownload(filename, text) {
      const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }

    mddBrand.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      try {
        // Work on a detached copy so the live page (search highlights, layout)
        // is never mutated by the seam unwrapping below.
        const clone = mddArticle.cloneNode(true);
        clone.querySelectorAll('wbr, mark').forEach((el) => {
          if (el.tagName === 'WBR') {
            el.remove();
          } else {
            el.replaceWith(...el.childNodes);
          }
        });
        // mddProseRuns joins the text nodes the seams split, so no
        // Node.normalize() here: normalize would also fuse across a <br>.
        const runs = [];
        mddProseRuns(clone, runs);
        const source = mddAssemble(mddPayload.skeleton, runs);
        mddDownload(mddPayload.name || 'document.mdd', source);
      } catch (_) {
        // Never interrupt the user's reading session over a download hiccup.
      }
    });
  }
}