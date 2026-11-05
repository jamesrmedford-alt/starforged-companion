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
 * The narration must run exactly once, on a client that holds a Claude key —
 * and preferably on the canonical GM, because the narrator's side-data (scene
 * truths, state changes, the scene-frame update) is applied and persisted only
 * there (narrator.js applyNarratorSidecar). The key is client-scoped
 * (issue #209) and the commands run only on the authoring client
 * (src/index.js chat routing), so:
 *   - a keyed GM is connected (gmGate.js hasKeyedActiveGM) → the canonical GM
 *     is keyed by construction: requestGmAction("oracle.narrate", args) runs
 *     it there (locally when this client IS that GM), served by
 *     narrateOracleFollowupOnGm() below — narration AND side-data;
 *   - no keyed GM, but this client holds a key → narrate locally (a player's
 *     own key, or a keyless-GM table). The side-data cannot be applied off the
 *     canonical GM, which is logged (debug) rather than silently dropped;
 *   - neither → debug-log and skip (the raw card already carries the result).
 * Every path runs the same runOracleFollowup() — one implementation.
 */

import { requestGmAction } from "../multiplayer/gmRelay.js";
import { hasKeyedActiveGM, isCanonicalGM } from "../multiplayer/gmGate.js";
import { isPlayerCharacterActor } from "../character/actorBridge.js";
import { requesterOwnsActor } from "../moves/burnMomentum.js";

const MODULE_ID = "starforged-companion";

/**
 * Queue the narration follow-up for an oracle result, once, where a Claude
 * key lives. Fire-and-forget: the caller has already posted the raw card.
 * Every path starts in a fresh macrotask so the raw oracle-result card has
 * landed and its chat-render hook has fired before the narrator call starts —
 * chat order is `<raw card> → <narration card>`.
 *
 * The GM is sent the raw card's id alone: it narrates what that card carries
 * (`oracleNarration`), never text a relay brings (issue #331 X49).
 *
 * @param {{ kind: string, oracleName: string, question?: string,
 *           rolledLine: string, speakerActorId?: string|null, messageId?: string|null }} args
 *   — `messageId`: the raw card this client just posted
 */
export function requestOracleNarration(args) {
  if (hasKeyedActiveGM()) {
    setTimeout(() => {
      requestGmAction("oracle.narrate", { messageId: args?.messageId ?? null }).catch(err =>
        console.warn(`${MODULE_ID} | oracle follow-up: relay to the GM failed:`, err?.message ?? err));
    }, 0);
    return;
  }
  if (hasLocalClaudeKey()) {
    if (!isCanonicalGM()) {
      console.debug(
        `${MODULE_ID} | oracle follow-up: no keyed GM is connected — narrating with this client's key; ` +
        `the narrator side-data (truths, state changes, scene frame) is relayed to the canonical GM.`,
      );
    }
    setTimeout(() => { void runOracleFollowup(args); }, 0);
    return;
  }
  // Narration is a garnish — the raw card already carries the result — so
  // no toast; just say why nothing follows.
  console.debug(`${MODULE_ID} | oracle follow-up: no Claude key on this client and no keyed GM connected — narration skipped.`);
}

// Raw cards this GM has narrated — one narration a card.
const _narrated = new Set();

/**
 * gmRelay handler for "oracle.narrate" — runs on the canonical GM, on its
 * Claude key, applying the narration's side-data to the shared story. The
 * relay names the raw oracle card, and what is narrated is that card's own
 * `oracleNarration` — never a payload's oracle name, question or result:
 * a hand-crafted relay billed arbitrary text to the GM's key and planted its
 * narration and ledger facts in the story (issue #331 X49; the trust model,
 * decisions.md W81). The card must be a raw oracle card (`!oracle`, `!oracle
 * <table>`, `!pay-the-price`) posted by the requester — or the requester a
 * GM — and it is narrated once. The speaker it names must be a PC its author
 * owns; otherwise the narration names none.
 *
 * @param {{ messageId?: string }} payload
 * @param {{ requesterId?: string|null, requester?: User|null, requesterIsGM?: boolean }} [ctx]
 * @returns {Promise<string|null>} the narration text, or null when refused or skipped
 */
export async function narrateOracleFollowupOnGm(payload = {}, ctx = {}) {
  const messageId = typeof payload?.messageId === "string" && payload.messageId ? payload.messageId : null;
  const card = messageId ? (globalThis.game?.messages?.get?.(messageId) ?? null) : null;
  const f    = card?.flags?.[MODULE_ID] ?? {};
  const spec = f.oracleNarration;
  if (!card || !(f.oracleCommandCard || f.payThePriceCard) || !spec || typeof spec !== "object") {
    console.warn(`${MODULE_ID} | oracle follow-up: ${messageId ?? "no card"} is not a raw oracle card — not narrated.`);
    return null;
  }
  const authorId = card.author?.id ?? card.user?.id ?? null;
  if (!ctx?.requesterIsGM && authorId !== (ctx?.requesterId ?? null)) {
    console.warn(`${MODULE_ID} | oracle follow-up: user ${ctx?.requesterId ?? "?"} did not post card ${messageId} — not narrated.`);
    return null;
  }
  if (_narrated.has(messageId)) {
    console.debug(`${MODULE_ID} | oracle follow-up: card ${messageId} is already narrated.`);
    return null;
  }
  _narrated.add(messageId);
  const speaker = typeof spec.speakerActorId === "string" ? (globalThis.game?.actors?.get?.(spec.speakerActorId) ?? null) : null;
  const author  = authorId ? (globalThis.game?.users?.get?.(authorId) ?? null) : null;
  const speakerOk = !!speaker && isPlayerCharacterActor(speaker)
    && (author?.isGM === true || requesterOwnsActor(speaker, { requesterId: authorId, requester: author, requesterIsGM: author?.isGM === true }));
  return runOracleFollowup({
    kind:           typeof spec.kind === "string" ? spec.kind : "oracle_table",
    oracleName:     String(spec.oracleName ?? ""),
    question:       String(spec.question ?? ""),
    rolledLine:     String(spec.rolledLine ?? ""),
    speakerActorId: speakerOk ? speaker.id : null,
  });
}

async function runOracleFollowup(args) {
  try {
    const { narrateOracleFollowup } = await import("../narration/narrator.js");
    // A working copy: the narration mints a scene and applies its sidecar on
    // the object it is given, and a write the world refuses must leave this
    // client's cached setting as the world has it (issue #329 X09).
    const campaignState = foundry.utils.deepClone(globalThis.game?.settings?.get?.(MODULE_ID, "campaignState") ?? {});
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
