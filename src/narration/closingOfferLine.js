/**
 * STARFORGED COMPANION
 * src/narration/closingOfferLine.js — the closing offer line
 *
 * The one sentence a narration offered a move may close on to invite it —
 * "*Pressing further here would be a Compel.*" (narratorPrompt.js
 * buildPacedNarrativeUserMessage, its SUGGESTED MOVE): the one place the
 * rules let a narration name a move. One detector for every reader of it
 * (issue #399's audit N32 — three disagreed: the checks stripped a final
 * italic span in every mode, the Roll button read the last italic span
 * anywhere, the worn details dropped every italic span, and a bold line was
 * read as narration):
 *   - the checks before posting and both judges leave it out of what they read
 *     (moves/contracts/checks.js judgedView),
 *   - the paced card's Roll button reads its move from it
 *     (narrator.js extractMoveFromNarrationHint),
 *   - the worn details leave it out of a beat's words (narrator.js beatVariety).
 * Each reads it only where an offer may be given — a narration offered a
 * move. One that was not closes on narration, and is read as such: a move
 * narration's closing italic comm line is the story's.
 *
 * Pure. No imports.
 */

// The line: one emphasis span at the very end of the prose — Markdown italic
// or bold (`*…*`, `_…_`, `**…**`, `***…***`), or HTML's — standing apart
// from what is before it, and a sentence: every recorded hint ends on its
// stop, so a ship's name or a stressed word that ends the prose is not one.
const SENTENCE_END = String.raw`[.!?…]["”’)\]]?`;
const CLOSING_LINE = [
  new RegExp(String.raw`(^|\s)(\*{1,3}|_{1,3})(?=\S)([^*_\n]{2,}?${SENTENCE_END})\2\s*$`, "u"),
  new RegExp(String.raw`(^|\s)<(em|i|strong|b)\b[^>]*>\s*([^<\n]{2,}?${SENTENCE_END})\s*</\2>\s*$`, "iu"),
];

/**
 * A narration's closing offer line, and the prose before it. Whether the
 * narration may close on one is its reader's to know: call this only for a
 * narration offered a move.
 *
 * @param {string} prose — a narration, its fact block off
 * @returns {{ body: string, offer: string|null }} `offer`: the line's words,
 *   its emphasis off; `body`: the prose without it (all of it, trimmed, when
 *   it closes on none)
 */
export function splitOfferLine(prose) {
  const text = String(prose ?? "").trim();
  for (const re of CLOSING_LINE) {
    const m = re.exec(text);
    if (m) return { body: text.slice(0, m.index + m[1].length).trim(), offer: m[3].trim() };
  }
  return { body: text, offer: null };
}
