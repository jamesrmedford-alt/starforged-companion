/**
 * STARFORGED COMPANION
 * src/oracles/oracleFollowup.js — oracle narration follow-up, run exactly once
 *
 * Every chat command that rolls a one-shot oracle (`!oracle yes`,
 * `!oracle <tableId>`, `!pay-the-price`, the pipeline's Face Defeat roll)
 * follows its raw result card with a short narrator beat
 * (narrateOracleFollowup in src/narration/narrator.js, `oracle_followup`
 * mode).
 *
 * The narration must run exactly once, on a client that holds a Claude key.
 * The key is client-scoped (issue #209) and the commands now run only on the
 * authoring client (src/index.js chat routing), so:
 *   - the authoring client holds a key → narrate locally;
 *   - it doesn't → relay to the canonical GM (which prefers a keyed GM — see
 *     gmGate.js) via requestGmAction("oracle.narrate", args), served by
 *     narrateOracleFollowupOnGm() below.
 * Both paths run the same runOracleFollowup() — one implementation.
 */

import { requestGmAction, hasActiveGM } from "../multiplayer/gmRelay.js";

const MODULE_ID = "starforged-companion";

/**
 * Queue the narration follow-up for an oracle result, once, where a Claude
 * key lives. Fire-and-forget: the caller has already posted the raw card.
 *
 * @param {{ kind: string, oracleName: string, question?: string,
 *           rolledLine: string, speakerActorId?: string|null }} args
 *   plain data only — it may cross the socket to the GM.
 */
export function requestOracleNarration(args) {
  if (hasLocalClaudeKey()) {
    // Fresh macrotask so the raw oracle-result card has already landed and
    // the chat-render hook has fired before the narrator call starts —
    // chat order is `<raw card> → <narration card>`.
    setTimeout(() => { void runOracleFollowup(args); }, 0);
    return;
  }
  if (!hasActiveGM()) {
    // Narration is a garnish — the raw card already carries the result — so
    // no toast; just say why nothing follows.
    console.debug(`${MODULE_ID} | oracle follow-up: no Claude key on this client and no GM connected — narration skipped.`);
    return;
  }
  requestGmAction("oracle.narrate", { ...args }).catch(err =>
    console.warn(`${MODULE_ID} | oracle follow-up: relay to the GM failed:`, err?.message ?? err));
}

/**
 * gmRelay handler for "oracle.narrate" — runs on the canonical GM.
 *
 * @param {Object} payload  the args passed to requestOracleNarration
 * @param {Object} [_ctx]
 * @returns {Promise<string|null>} the narration text, or null when skipped
 */
export async function narrateOracleFollowupOnGm(payload = {}, _ctx = {}) {
  return runOracleFollowup(payload);
}

async function runOracleFollowup(args) {
  try {
    const { narrateOracleFollowup } = await import("../narration/narrator.js");
    const campaignState = globalThis.game?.settings?.get?.(MODULE_ID, "campaignState") ?? {};
    return await narrateOracleFollowup({
      kind:           args?.kind,
      oracleName:     args?.oracleName,
      question:       args?.question ?? "",
      rolledLine:     args?.rolledLine,
      speakerActorId: typeof args?.speakerActorId === "string" ? args.speakerActorId : null,
      campaignState,
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | oracle follow-up: narration failed:`, err?.message ?? err);
    return null;
  }
}

function hasLocalClaudeKey() {
  try {
    return !!globalThis.game?.settings?.get?.(MODULE_ID, "claudeApiKey");
  } catch (err) {
    console.warn(`${MODULE_ID} | oracle follow-up: claudeApiKey read failed:`, err?.message ?? err);
    return false;
  }
}
