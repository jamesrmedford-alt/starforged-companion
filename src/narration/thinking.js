/**
 * STARFORGED COMPANION
 * src/narration/thinking.js — the thinking-off form a Claude request carries
 *
 * Several models run ADAPTIVE THINKING BY DEFAULT when a request omits
 * `thinking`, and thinking shares the `max_tokens` cap: a short structured
 * reply — the classifier's decision, the chronicle scribe's 200 tokens, an
 * NPC's or a ship's seed, the deck-plan vision — can come back with no text
 * block or a cut-off object, and the entry, seed or notes are silently not
 * written (issue #325 W27). Every call in this module is a short reply or a
 * narration sized by its own cap, so none asks for extended thinking:
 * api-proxy.js sends each body that sets no `thinking` with its model's
 * thinking-off form, from here.
 *
 * The form is per model (exact ids, optionally date-stamped — never a prefix,
 * issue #286 F7: "claude-sonnet-5" prefixes "claude-sonnet-5-5"):
 *   - Sonnet 5, Opus 4.7 / 4.8, Haiku 5.5 → `{ type: "disabled" }` (Haiku
 *     5.5 accepts it at its default effort, `medium`, and at `high`);
 *   - Sonnet 5.5 → `{ type: "between_tools" }` — it rejects "disabled" with a
 *     400; `between_tools` is its no-extended-thinking setting (accepted at
 *     effort `high` or below, its default);
 *   - Sonnet 4.5, Haiku 4.5 and older → nothing (they default to off).
 * Opus 5.5 and the Fable tier cannot turn thinking off and are not offered.
 *
 * A leaf module (no imports), so api-proxy.js and the modules narrator.js
 * imports can use it without a cycle.
 */

const THINKING_DISABLED_MODELS      = /^claude-(?:sonnet-5|opus-4-7|opus-4-8|haiku-5-5)(?:-\d{8})?$/;
const THINKING_BETWEEN_TOOLS_MODELS = /^claude-sonnet-5-5(?:-\d{8})?$/;

/**
 * Whether a call on `model` turns extended thinking off (the model thinks by
 * default and has a form that turns it off).
 *
 * @param {string} model
 * @returns {boolean}
 */
export function narrationDisablesThinking(model) {
  const id = String(model ?? '');
  return THINKING_DISABLED_MODELS.test(id) || THINKING_BETWEEN_TOOLS_MODELS.test(id);
}

/**
 * The `thinking` field a request body on `model` carries to turn extended
 * thinking off — `{ type: "disabled" }`, Sonnet 5.5's `{ type:
 * "between_tools" }`, or nothing for a model that defaults to off. Spread
 * into the body (api-proxy.js does, for every body that sets none).
 *
 * @param {string} model
 * @returns {{ thinking?: { type: "disabled" | "between_tools" } }}
 */
export function thinkingOffFor(model) {
  if (!narrationDisablesThinking(model)) return {};
  return THINKING_BETWEEN_TOOLS_MODELS.test(String(model)) ? { thinking: { type: 'between_tools' } } : { thinking: { type: 'disabled' } };
}
