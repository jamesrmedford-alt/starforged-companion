/**
 * STARFORGED COMPANION
 * src/narration/thinking.js — when a Claude request turns extended thinking off
 *
 * Sonnet 5 (offered as a Narration Model) runs ADAPTIVE THINKING BY DEFAULT
 * when a request omits `thinking`, and thinking shares the `max_tokens` cap:
 * a short structured reply — the chronicle scribe's 200 tokens, an NPC's or
 * a ship's 220-token seed, the entity flavour, the deck-plan vision — can come
 * back with no text block or a cut-off object, and the entry, seed or notes
 * are silently not written (issue #325 W27). Every call that runs on the
 * narration model asks this module, as narration itself does.
 *
 * A leaf module (no imports), so the entity and character modules that
 * narrator.js imports can use it without a cycle.
 */

/** The models a request sends `thinking: {type: "disabled"}` to — an id, optionally date-stamped. */
const THINKING_DISABLED_MODELS = /^claude-(?:sonnet-5|opus-4-7|opus-4-8)(?:-\d{8})?$/;

/**
 * Whether to disable extended thinking for a call on `model`. Sonnet 5 runs
 * adaptive thinking by default when the `thinking` param is omitted — for a
 * short reply that only adds latency and lets thinking consume the max_tokens
 * cap. Opus 4.7/4.8 accept "disabled" too (they already default to off). The
 * older offered models (Sonnet 4.5, Haiku 4.5) default to thinking-off, so
 * their request is left untouched.
 *
 * Exact ids, never a prefix (issue #286 F7): "claude-sonnet-5" also prefixes
 * "claude-sonnet-5-5", which rejects "disabled" with a 400 (its thinking-off
 * form is "between_tools"), as do the Fable tier and Opus 5.5. None of those
 * is offered as a narration model.
 *
 * @param {string} model
 * @returns {boolean}
 */
export function narrationDisablesThinking(model) {
  return THINKING_DISABLED_MODELS.test(String(model ?? ''));
}

/**
 * The `thinking` field a request body on `model` carries — `{ thinking:
 * { type: "disabled" } }` where narrationDisablesThinking says so, else
 * nothing. Spread into the body.
 *
 * @param {string} model
 * @returns {{ thinking?: { type: "disabled" } }}
 */
export function thinkingOffFor(model) {
  return narrationDisablesThinking(model) ? { thinking: { type: 'disabled' } } : {};
}
