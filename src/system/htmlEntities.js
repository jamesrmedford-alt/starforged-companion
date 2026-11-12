/**
 * STARFORGED COMPANION
 * src/system/htmlEntities.js — the one HTML-entity decoder
 *
 * Text the module reads out of HTML — a PC's notes and biography, asset and
 * item descriptions (actorBridge CHARACTER STATE), narration cards
 * (narratorPrompt.stripHtml), an entity's Notes tab (notesAsCardText), the
 * World Truths dialog's saved truths (truths/generator) and chat cards (the
 * World Journal panel) — had four decoders: one decoded no entities, one
 * decoded `&amp;` first (so "&amp;lt;" became "<"), and two kept tables of
 * their own (known-issues CHARACTER-STATE-ENTITY-UNDECODED). This is the one
 * they share: the named entities below and numeric ones (`&#183;`,
 * `&#x2014;`), in a single pass, so an escaped entity ("&amp;middot;") stays
 * text. An unknown name or an impossible code point is left as written.
 *
 * A leaf module (no imports).
 */

// The markup escapes, the seeds' fact line (`&middot;`) and the typography a
// rich-text editor writes.
const NAMED_ENTITIES = Object.freeze({
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  middot: '·', bull: '•',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  ndash: '–', mdash: '—', hellip: '…',
});

/**
 * Decode the HTML entities in `text` in one pass.
 *
 * @param {unknown} text
 * @returns {string}
 */
export function decodeHtmlEntities(text) {
  return String(text ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code) => {
    if (code[0] !== '#') return NAMED_ENTITIES[code.toLowerCase()] ?? whole;
    const n = /^#x/i.test(code) ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return Number.isInteger(n) && n > 0 && n <= 0x10FFFF ? String.fromCodePoint(n) : whole;
  });
}
