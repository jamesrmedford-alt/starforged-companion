/**
 * STARFORGED COMPANION
 * src/audio/segments.js — narrator-prose ↔ voice-segmented split
 *
 * The narrator prompt (when audio narration is enabled) instructs the
 * model to wrap NPC dialogue with `<npc>…</npc>` tags. This file:
 *   1. Splits prose into an ordered array of `{ voice, text }` segments
 *      for the TTS pipeline (`splitSegments`).
 *   2. Strips the markup for chat display, leaving the inner NPC text
 *      verbatim in the prose (`stripMarkup`).
 *
 * The sidecar JSON block (`docs/fact-continuity-scope.md` §7) is the
 * responsibility of `src/factContinuity/sidecarParser.js` and must
 * already be removed before either helper runs. Defensive matching here
 * does not attempt to handle a sidecar that leaked through.
 *
 * Tags are matched non-greedily and case-insensitively. Whitespace
 * between segments is preserved. Empty segments (zero-length after
 * trim) are dropped — single-space gaps between segments are preserved
 * by the surrounding narrator segments, not as standalone entries.
 */

export const SEGMENT_VOICE = Object.freeze({
  NARRATOR: "narrator",
  NPC:      "npc",
});

const NPC_TAG_RE = /<npc>([\s\S]*?)<\/npc>/gi;

/**
 * Split narrator prose into a sequence of voice-tagged segments.
 *
 * @param {string} prose — narrator prose with optional `<npc>…</npc>` markup
 * @returns {Array<{ voice: string, text: string }>}
 */
export function splitSegments(prose) {
  const text = typeof prose === "string" ? prose : "";
  if (text.length === 0) return [];

  const segments = [];
  let cursor = 0;

  // Re-create the regex each call so the shared `lastIndex` state is reset.
  const re = new RegExp(NPC_TAG_RE.source, "gi");
  let match;
  while ((match = re.exec(text)) !== null) {
    const tagStart  = match.index;
    const innerText = match[1];

    if (tagStart > cursor) {
      const leading = text.slice(cursor, tagStart);
      if (leading.trim().length > 0) {
        segments.push({ voice: SEGMENT_VOICE.NARRATOR, text: leading });
      }
    }

    if (typeof innerText === "string" && innerText.trim().length > 0) {
      segments.push({ voice: SEGMENT_VOICE.NPC, text: innerText });
    }

    cursor = re.lastIndex;
  }

  if (cursor < text.length) {
    const trailing = text.slice(cursor);
    if (trailing.trim().length > 0) {
      segments.push({ voice: SEGMENT_VOICE.NARRATOR, text: trailing });
    }
  }

  return segments;
}

/**
 * Remove `<npc>…</npc>` markers from prose for chat display while
 * preserving the inner text verbatim. Idempotent.
 *
 * @param {string} prose
 * @returns {string}
 */
export function stripMarkup(prose) {
  if (typeof prose !== "string") return "";
  return prose.replace(new RegExp(NPC_TAG_RE.source, "gi"), "$1");
}
