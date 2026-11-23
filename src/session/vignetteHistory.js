/**
 * STARFORGED COMPANION
 * src/session/vignetteHistory.js — what the earlier session bookends showed.
 *
 * Scenes of one kind repeated across a campaign (issue #377 item 5,
 * GALLEY-VIGNETTE-REPEATS and CLOSING-SCENE-REPEATS): four openings of the
 * long haul shared 24–29% of their content words with their neighbours — the
 * kettle "that has outlasted three owners" twice, the lentils and the burnt
 * pan twice — and its three closings were one scene three times. Nothing told
 * a scene what the earlier ones of its kind had shown. Each bookend's builder
 * now lists them, as already used.
 *
 * Read from the chat log — a bookend's card carries its prose
 * (`narrationText`) and its kind (`vignetteKind`); one the X-Card removed, an
 * upgrade struck or a fallback card is no scene the table saw. Pure but for
 * the default read of `game.messages`.
 */

const MODULE_ID = 'starforged-companion';

/** How many earlier scenes of a kind a bookend is shown. */
export const EARLIER_VIGNETTES_MAX = 3;

/** How much of each earlier scene it is shown. */
const EARLIER_VIGNETTE_CHARS = 700;

function plainProse(text) {
  return String(text ?? '')
    .replace(/<[^>]*>/g, '')          // <npc …> voice markup
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The prose of the newest earlier bookends of these kinds, oldest first.
 *
 * @param {string[]} kinds — `vignetteKind`s ("galley_begin", "npc_end")
 * @param {{ limit?: number, messages?: Object[] }} [opts]
 * @returns {Array<{ text: string, title: string|null }>}
 */
export function earlierVignettes(kinds, { limit = EARLIER_VIGNETTES_MAX, messages = null } = {}) {
  const wanted = new Set(Array.isArray(kinds) ? kinds : [kinds]);
  const list = Array.isArray(messages) ? messages : (globalThis.game?.messages?.contents ?? []);
  const found = [];
  for (const m of list) {
    const f = m?.flags?.[MODULE_ID];
    if (!f?.sessionVignetteCard || !wanted.has(f.vignetteKind)) continue;
    if (f.xCarded || f.burnSuperseded || f.narrationFallback) continue;
    const text = plainProse(f.narrationText);
    if (!text) continue;
    const title = typeof f.vignetteNpc === 'string' && f.vignetteNpc.trim() ? f.vignetteNpc.trim() : null;
    found.push({ text: text.length > EARLIER_VIGNETTE_CHARS ? `${text.slice(0, EARLIER_VIGNETTE_CHARS - 1)}…` : text, title });
  }
  return found.slice(-Math.max(0, limit));
}

/**
 * The block a bookend's user message carries: the earlier scenes, as already
 * used. '' when there are none.
 *
 * @param {string} heading — "EARLIER OPENINGS" / "EARLIER CLOSINGS"
 * @param {Array<{ text: string, title?: string|null }>} earlier
 * @param {string} rule — what this one must not repeat
 * @returns {string}
 */
export function formatEarlierVignettes(heading, earlier, rule) {
  const list = (Array.isArray(earlier) ? earlier : []).filter(e => e?.text);
  if (!list.length) return '';
  return [
    `${heading} — already used, oldest first. ${rule}`,
    ...list.map(e => `- ${e.title ? `(${e.title}) ` : ''}${e.text}`),
  ].join('\n');
}
