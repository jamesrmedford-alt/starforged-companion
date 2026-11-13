/**
 * STARFORGED COMPANION
 * src/moves/heldResult.js — a free-flow result held for Burn / Improve / Keep
 *
 * Issue #354 P2-10 (decided, maintainer 2026-11-13): in free-flow play a
 * result whose card offers Burn Momentum or Improve Result is asked about
 * BEFORE its Pay the Price is paid and before it is narrated, as a Batch Mode
 * round asks before its narration. The price used to land first and the
 * narration post at once: a burn then undid a price already on the table and
 * struck through a narration the table had already read.
 *
 * The roll stage holds such a result (movePipeline.js rollMove,
 * `holdForUpgrade`): it posts the move card with a **Keep the result** button
 * beside Burn / Improve, pays no price and returns `held`; the pipeline
 * records the move and does not narrate it. What the wait needs is on the
 * card (`flags.awaitingUpgrade`: the resolution, the price not yet paid, the
 * narration's context), so it survives a reload and any GM's client can
 * settle it. A held result is settled exactly once, on the canonical GM:
 *
 *   - **Keep** (the button — gmRelay "move.keepResult") or an automatic keep
 *     (the roller's next line or move, a consequence chosen on the outcome's
 *     choice card): the held price is paid, the result is narrated, and the
 *     card's Burn / Improve close (`kept`).
 *   - **Burn / Improve**: the upgrade's own handler applies it; where it
 *     re-narrates (index.js narrateUpgradedResolution) this module narrates
 *     the upgraded result as the move's one narration — with the player's own
 *     line — after paying the held price if the upgraded result pays one too.
 *
 * Nothing here is reached by a Batch Mode round: a round rolls without
 * `holdForUpgrade` and narrates its own entries.
 */

import { isCanonicalGM } from "../multiplayer/gmGate.js";
import { refusePress } from "../multiplayer/gmRelay.js";
import { withPayThePriceSeed } from "./resolver.js";
import { requesterOwnsActor, claimResultUpgrade, releaseResultUpgrade } from "./burnMomentum.js";
import { dropUpgradeHints } from "./resultUpgrade.js";

const MODULE_ID = "starforged-companion";

/** The world setting: free-flow asks before paying and narrating a result that can be upgraded (default on). */
export const HOLD_SETTING = "holdResultForUpgrade";

/** Whether free-flow results are held for Burn / Improve / Keep. Fail-open: on (an unregistered setting — a unit test — is on). */
export function holdForUpgradeEnabled() {
  try {
    return globalThis.game?.settings?.get?.(MODULE_ID, HOLD_SETTING) !== false;
  } catch {
    return true;
  }
}

// How a held result was settled, as its card records it
// (`awaitingUpgrade.resolvedBy`): "keep" (the button), "later" (the roller's
// next line or move), "choice" (a consequence chosen), "burn", "improve".

// A keep takes the card's result-upgrade claim (burnMomentum.js
// claimResultUpgrade — the one a burn and an improvement share) for as long
// as it runs: a second keep, or a Burn / Improve pressed meanwhile, is
// refused, and a keep that arrives while an upgrade is being applied leaves
// the result to that upgrade, whose own narration settles it.

const allMessages = () => globalThis.game?.messages?.contents ?? [];
const flagsOf = (message) => {
  const live = message?.id ? (globalThis.game?.messages?.get?.(message.id) ?? message) : message;
  return live?.flags?.[MODULE_ID] ?? null;
};

/** Whether a move card is still waiting for its roller's Burn / Improve / Keep. */
export function isAwaitingUpgrade(message) {
  const f = flagsOf(message);
  return f?.moveResolution === true && f.awaitingUpgrade?.open === true;
}

/** The move card of a resolution that is held, or null. */
export function heldCardFor(resolutionId) {
  if (!resolutionId) return null;
  return allMessages().find(m => m?.flags?.[MODULE_ID]?.resolutionId === resolutionId && isAwaitingUpgrade(m)) ?? null;
}

/** The held move cards a PC rolled, oldest first. */
export function heldCardsOf(actorId) {
  if (!actorId) return [];
  return allMessages().filter(m => isAwaitingUpgrade(m)
    && (m.flags[MODULE_ID].actorId ?? m.flags[MODULE_ID].awaitingUpgrade?.speakerActorId ?? null) === actorId);
}

/**
 * Close a held card's wait — the claim, made before anything is paid or
 * narrated. A keep also closes the card's Burn / Improve (`kept`: the result
 * was kept, so its price and narration follow — burnMomentum.js
 * resultUpgradeBlocker). False when the card is not waiting, or the world
 * refused the write: nothing is then paid or narrated, and the card still asks.
 *
 * @param {ChatMessage} message
 * @param {"keep"|"later"|"choice"|"burn"|"improve"} by
 * @returns {Promise<boolean>}
 */
async function closeWait(message, by) {
  const f = flagsOf(message);
  if (!f?.awaitingUpgrade?.open) return false;
  const update = {
    [`flags.${MODULE_ID}.awaitingUpgrade.open`]:       false,
    [`flags.${MODULE_ID}.awaitingUpgrade.resolvedBy`]: by,
  };
  if (by !== "burn" && by !== "improve") {
    for (const kind of ["burn", "improve"]) {
      if (f[kind] && !f[kind].consumed) update[`flags.${MODULE_ID}.${kind}.kept`] = true;
    }
  }
  try {
    await message.update(update);
    return true;
  } catch (err) {
    console.warn(`${MODULE_ID} | held result: the world did not save the choice on card ${message?.id ?? "?"} — it still asks:`, err?.message ?? err);
    return false;
  }
}

/**
 * Pay the price a held result did not pay at its roll — the stated miss or
 * the table, through the pipeline's own poster (suffer routes, clocks, the
 * card) — and seed `resolution` with it, so its narration depicts it. No
 * upgrade is offered on its cards: the result is settled. Null when the card
 * held no price.
 *
 * @param {Object} held — the card's `awaitingUpgrade`
 * @param {Object} resolution — the resolution about to be narrated (mutated: its oracleSeeds)
 * @param {string|null} actorId — the roller
 * @returns {Promise<Object|null>} the poster's result
 */
async function payHeldPrice(held, resolution, actorId) {
  const price = held?.heldPrice;
  if (!price) return null;
  const { postMovePayThePriceCard } = await import("../index.js");
  const ptp = await postMovePayThePriceCard(actorId, price.moveName ?? resolution.moveName ?? null, resolution._id ?? null, {
    upgradeOffered: false,
    skipClockIds:   Array.isArray(price.skipClockIds) ? price.skipClockIds : [],
    stated:         price.stated ?? null,
  }).catch(err => {
    console.warn(`${MODULE_ID} | held result: ${resolution.moveName ?? "the move"}'s Pay the Price failed:`, err?.message ?? err);
    return null;
  });
  resolution.oracleSeeds = withPayThePriceSeed(resolution.oracleSeeds, resolution.moveId, ptp?.price ?? null);
  return ptp;
}

/** A working copy of the stored campaign state: the narration starts a scene and applies its sidecar on it. */
function workingState() {
  const stored = globalThis.game?.settings?.get?.(MODULE_ID, "campaignState") ?? {};
  return globalThis.foundry?.utils?.deepClone ? globalThis.foundry.utils.deepClone(stored) : JSON.parse(JSON.stringify(stored));
}

/**
 * Keep a held result: close its wait (and its Burn / Improve), pay the price
 * it held, and narrate it — once. Canonical GM. Never throws.
 *
 * @param {ChatMessage} message — the held move card
 * @param {"keep"|"later"|"choice"} [by] — the button, the roller's next line or move, or a chosen consequence
 * @returns {Promise<{ applied: boolean, reason?: string }>}
 */
export async function keepHeldResult(message, by = "keep") {
  if (!isCanonicalGM()) return { applied: false, reason: "not-canonical-gm" };
  const id = message?.id ?? null;
  if (!id || !isAwaitingUpgrade(message)) return { applied: false, reason: "not-awaiting" };
  // Burned or improved already — its upgrade's narration closes the wait.
  if (flagsOf(message).burn?.consumed || flagsOf(message).improve?.consumed) return { applied: false, reason: "upgraded" };
  if (!claimResultUpgrade(id)) return { applied: false, reason: "in-flight" };
  try {
    const held = flagsOf(message).awaitingUpgrade;
    const actorId = flagsOf(message).actorId ?? held.speakerActorId ?? null;
    if (!held.resolution || typeof held.resolution !== "object") {
      console.warn(`${MODULE_ID} | held result: card ${id} carries no resolution — closed without a narration.`);
      await closeWait(message, by);
      return { applied: false, reason: "no-resolution" };
    }
    if (!(await closeWait(message, by))) return { applied: false, reason: "claim-refused" };
    const resolution = JSON.parse(JSON.stringify(held.resolution));
    try {
      if (resolution.consequences?.routePayThePrice) await payHeldPrice(held, resolution, actorId);
      // Its still-open choice cards no longer say to burn or improve first.
      await dropUpgradeHints(resolution._id ?? null);
      const { narrateResolution } = await import("../narration/narrator.js");
      await narrateResolution(resolution, workingState(), {
        ...(held.relevance ? { relevance: { ...held.relevance, needsClarification: false } } : {}),
        speakerActorId: held.speakerActorId ?? null,
        moveTarget:     held.moveTarget ?? null,
      });
    } catch (err) {
      console.warn(`${MODULE_ID} | held result: ${resolution.moveName ?? "the move"} was kept, but its narration could not be posted:`, err?.message ?? err);
      globalThis.ui?.notifications?.warn?.("Starforged Companion: the result was kept, but its narration could not be posted to chat.");
    }
    return { applied: true };
  } finally {
    releaseResultUpgrade(id);
  }
}

/**
 * Keep every result a PC's player left waiting — they have gone on: their
 * next line or move is here ("an upgrade belongs to the move being made",
 * issue #326 D4). Each is paid and narrated before that line is read, so the
 * story stays in order. Canonical GM; a no-op for anyone with nothing held.
 *
 * @param {string|null} actorId — the PC whose line or move arrived
 * @param {{ except?: string|null }} [opts] — a resolution to leave waiting (the move being made itself)
 * @returns {Promise<number>} how many were kept
 */
export async function keepHeldResultsOf(actorId, { except = null } = {}) {
  if (!actorId || !isCanonicalGM()) return 0;
  let kept = 0;
  for (const card of heldCardsOf(actorId)) {
    const f = card.flags?.[MODULE_ID] ?? {};
    if (except && f.resolutionId === except) continue;
    // Not while its own pipeline is still recording it (the stamp recordMove
    // leaves): it stays held, and the next line — or its button — keeps it.
    if (f.burn?.originalApplied !== true && f.improve?.originalApplied !== true) continue;
    if ((await keepHeldResult(card, "later")).applied) kept += 1;
  }
  return kept;
}

/**
 * A consequence was chosen on a held result's choice card: the result is
 * kept — what the choice applied stands, so its Burn / Improve closed
 * (resultUpgrade.js closeUpgradesForChoice) and its narration follows now.
 * Canonical GM; a no-op for a resolution that is not held.
 *
 * @param {string|null} resolutionId
 * @returns {Promise<{ applied: boolean, reason?: string }>}
 */
export async function keepHeldResultForChoice(resolutionId) {
  const card = heldCardFor(resolutionId);
  return card ? keepHeldResult(card, "choice") : { applied: false, reason: "not-awaiting" };
}

/**
 * A Burn Momentum or Improve Result of a held result re-narrates: the
 * upgraded result is the move's one narration. The wait closes, the price the
 * card held is paid if the upgraded result pays one too (a Battle or Clash
 * burned to a weak hit), and the narration is told the player's own line —
 * there is no earlier narration for it to replace. Returns undefined when the
 * resolution upgraded is not a held one: the caller narrates as before.
 *
 * @param {string|null} upgradeOf — the original resolution's id
 * @param {Object} resolution — the upgraded outcome's (mutated: its line and seeds)
 * @param {Object} campaignState — the upgrade's working copy
 * @param {{ speakerActorId?: string|null, kind?: string }} [options]
 * @returns {Promise<string|null|undefined>}
 */
export async function narrateHeldUpgrade(upgradeOf, resolution, campaignState, options = {}) {
  const card = heldCardFor(upgradeOf);
  if (!card) return undefined;
  const held = flagsOf(card).awaitingUpgrade;
  const by = options.kind === "improve" ? "improve" : "burn";
  if (!(await closeWait(card, by))) return undefined;
  const actorId = flagsOf(card).actorId ?? held.speakerActorId ?? options.speakerActorId ?? null;
  // The move's first narration: the line the player wrote, not the marker an
  // upgrade's re-narration carries in its place.
  if (typeof held.resolution?.playerNarration === "string" && held.resolution.playerNarration.trim()) {
    resolution.playerNarration = held.resolution.playerNarration;
    resolution.inputMethod = held.resolution.inputMethod ?? "chat";
  }
  if (resolution.consequences?.routePayThePrice) await payHeldPrice(held, resolution, actorId);
  const { narrateResolution } = await import("../narration/narrator.js");
  return narrateResolution(resolution, campaignState, {
    speakerActorId: options.speakerActorId ?? held.speakerActorId ?? null,
    moveTarget:     held.moveTarget ?? null,
  });
}

/**
 * gmRelay handler for "move.keepResult" — the move card's **Keep the result**
 * button, on the canonical GM. The roller's player or a GM may keep it.
 *
 * @param {{ messageId?: string }} payload
 * @param {{ requesterId?: string|null, requester?: User|null, requesterIsGM?: boolean }} [ctx]
 * @returns {Promise<{ applied: boolean, reason?: string }>}
 */
export async function applyKeepResultFromRelay(payload = {}, ctx = {}) {
  const messageId = typeof payload.messageId === "string" ? payload.messageId : null;
  const message   = messageId ? (globalThis.game?.messages?.get?.(messageId) ?? null) : null;
  if (!message || !isAwaitingUpgrade(message)) return { applied: false, reason: "not-awaiting" };
  const f = flagsOf(message);
  const actorId = f.actorId ?? f.awaitingUpgrade?.speakerActorId ?? null;
  const actor = actorId ? (globalThis.game?.actors?.get?.(actorId) ?? null) : null;
  // The roller's player or a GM — as a burn of the same card is checked.
  if (actor ? !requesterOwnsActor(actor, ctx) : !ctx?.requesterIsGM) {
    console.warn(`${MODULE_ID} | held result: user ${ctx?.requesterId ?? "?"} may not keep ${actor?.name ?? "this"} result — refused.`);
    refusePress(ctx, "not-owner", actor);
    return { applied: false, reason: "not-owner" };
  }
  return keepHeldResult(message, "keep");
}
