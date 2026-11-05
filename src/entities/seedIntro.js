/**
 * STARFORGED COMPANION
 * src/entities/seedIntro.js — the seed's own introduction on a Notes tab.
 *
 * An NPC card's or a ship's Notes tab is its notes (decisions.md → "An NPC
 * card's or ship's notes are its sheet's Notes tab"). Its seed — ✦ Finalise,
 * the Auto-Seed, ↻ Regenerate flavour — writes an introduction there, and the
 * same tab holds what others add: the GM's own paragraphs, the `!ship
 * envision` / `!ship history` sections, ⤴ promoted details and the art
 * pipeline's portrait block. The seed marks each element of its introduction
 * with SEED_INTRO_CLASS, and a later seed replaces those elements alone,
 * keeping the rest of the tab as it keeps the portrait block (issue #322 V30).
 * A tab with no marked introduction — the GM's own text, or an introduction
 * written before the mark — gets the new one at its top, below the portrait,
 * and keeps everything it held (issue #338 D4; issue #335 Y12: a regeneration
 * erased a promoted canon detail from every surface).
 *
 * The mark is a class, as the portrait block's is: the sheet's Notes editor
 * (Foundry's ProseMirror) keeps an element's `class` through an edit — its
 * schema captures it on every node — where an HTML comment or an unknown
 * attribute is dropped. Each element is marked, never a wrapper around them:
 * the paragraph the GM starts with Enter at the end of the introduction is a
 * new element without the class, where a wrapper would have taken it in.
 */

import { PORTRAIT_BLOCK_RE } from "../art/notesPortrait.js";

/** The class on each element of a seed's introduction. */
export const SEED_INTRO_CLASS = "sf-seed-intro";

/** An opening tag: its name, then its attributes. */
const OPEN_TAG_RE = /<([a-zA-Z][a-zA-Z0-9-]*)((?:\s[^>]*)?)>/g;
/** A class attribute, quoted either way or bare. */
const CLASS_ATTR_RE = /(?:^|\s)class\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/i;
const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

function isMarked(attrs) {
  const m = CLASS_ATTR_RE.exec(attrs);
  const value = m ? (m[1] ?? m[2] ?? m[3] ?? "") : "";
  return value.split(/\s+/).includes(SEED_INTRO_CLASS);
}

/** Where the element opened at `[start, from)` ends — past its matching close tag; `from` when it never closes. */
function elementEnd(html, tag, from) {
  const re = new RegExp(`<(/?)${tag}(?=[\\s/>])[^>]*>`, "gi");
  re.lastIndex = from;
  let depth = 1;
  let m;
  while ((m = re.exec(html))) {
    if (m[1]) {
      depth -= 1;
      if (depth === 0) return m.index + m[0].length;
    } else if (!m[0].endsWith("/>")) {
      depth += 1;
    }
  }
  return from;   // unclosed: only its opening tag is the seed's — nothing after it is taken
}

/** The [start, end) extents of the marked elements in `html`, outermost only, in order. */
function markedElements(html) {
  const out = [];
  OPEN_TAG_RE.lastIndex = 0;
  let m;
  while ((m = OPEN_TAG_RE.exec(html))) {
    if (!isMarked(m[2])) continue;
    const start = m.index;
    const openEnd = m.index + m[0].length;
    const tag = m[1].toLowerCase();
    const end = VOID_TAGS.has(tag) || m[0].endsWith("/>") ? openEnd : elementEnd(html, tag, openEnd);
    out.push([start, end]);
    OPEN_TAG_RE.lastIndex = end;
  }
  return out;
}

/**
 * Mark each element of a freshly composed introduction as the seed's. The
 * seeds compose it from `<p>` and `<ul>` elements (`<li>`s inside a list).
 *
 * @param {string} html — the seed's introduction
 * @returns {string}
 */
export function markSeedIntro(html) {
  return String(html ?? "").replace(/<(p|ul)>/g, `<$1 class="${SEED_INTRO_CLASS}">`);
}

/**
 * The Notes tab with a seed's new introduction in it. The seed's marked
 * elements are replaced by `introHtml` where the first of them stood; every
 * other part of the tab stays as it is. A tab with none gets `introHtml` at its
 * top — right below the portrait block when it has one — and keeps the rest.
 *
 * @param {string} previousNotes — the tab as it is now
 * @param {string} introHtml     — the seed's new introduction (markSeedIntro'd)
 * @returns {string}
 */
export function writeSeedIntro(previousNotes, introHtml) {
  const notes = String(previousNotes ?? "");
  const intro = String(introHtml ?? "").trim();
  const marked = markedElements(notes);
  if (marked.length) {
    let out = "";
    let at = 0;
    marked.forEach(([start, end], i) => {
      out += notes.slice(at, start) + (i === 0 ? intro : "");
      at = end;
    });
    return out + notes.slice(at);
  }
  const portrait = PORTRAIT_BLOCK_RE.exec(notes);
  if (portrait) {
    const after = portrait.index + portrait[0].length;
    return notes.slice(0, after) + intro + notes.slice(after).trimStart();
  }
  return intro + notes.trimStart();
}
