/**
 * STARFORGED COMPANION
 * src/clocks/payThePriceClocks.js — countdown clocks advanced by Pay the Price
 *
 * Extracted from src/index.js so the GM relay can reach it: a player-typed
 * `!ptp` runs on the typist's client (chat commands run once, on the author),
 * which cannot write world state, so the clock advance is relayed to the
 * canonical GM (GM_ACTIONS "payThePrice.advanceClocks"). The move pipeline
 * already runs on the canonical GM and calls advanceClocksOnPayThePrice
 * directly, keeping its return value for the Burn Momentum reversal.
 */

import { newNarrationId } from "../factContinuity/ledgers.js";

const MODULE_ID = "starforged-companion";

/**
 * Advance countdown clocks in response to a Pay the Price. The module's clock
 * contract is that tension clocks advance when you Pay the Price (clocks.js
 * header; issue #203 (Clocks)) — wiring that was documented but never
 * built (playtest finding #10: "I had a pay the price this session, but the vow
 * clock is unmoved"). This advances, by one segment:
 *   - every active campaignState tension clock (the !clock / Clocks panel), and
 *   - the countdown clock on each player character's active vows (e.g. the
 *     inciting incident's "Dani's captivity" clock, stored on the vow item).
 * Campaign clocks are untouched (they advance at Begin a Session). GM-gated —
 * world/actor writes are GM-only. A player-typed `!ptp` runs on the author's
 * client, so it reaches this through the GM relay
 * (advanceClocksForPayThePriceRelay) instead of calling it directly.
 *
 * A shared vow (one copy per PC, the same vowId) is one deadline: every copy
 * advances, in lockstep, but the card lists it once and it fires one trigger
 * vignette (issue #321 U55 — three PCs gave three lines, three Claude calls and
 * three TRIGGERED cards). The returned list keeps every copy, for the Burn
 * Momentum reversal to rewind each.
 */
export async function advanceClocksOnPayThePrice() {
  if (!game.user?.isGM) {
    console.debug(`${MODULE_ID} | Pay the Price: clock advance is GM-only — not advanced from this player client.`);
    return [];
  }
  const advanced = [];

  try {
    const { advanceTensionClocksForPayThePrice } = await import("./clocks.js");
    for (const c of await advanceTensionClocksForPayThePrice()) {
      advanced.push({ _id: c._id, name: c.name, type: "tension", filled: c.filled, segments: c.segments, triggered: c.triggered });
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | advanceClocksOnPayThePrice: tension clocks failed:`, err?.message ?? err);
  }

  try {
    const { getPlayerActors, advanceVowClocks } = await import("../character/actorBridge.js");
    const lockstep = new Map();   // vowId → the value its first copy reached
    for (const actor of getPlayerActors()) {
      for (const v of await advanceVowClocks(actor, { lockstep })) {
        advanced.push({ actorId: v.actorId, itemId: v.itemId, vowId: v.vowId ?? null, name: v.name, type: "vow", filled: v.ticks, segments: v.max, triggered: v.triggered });
      }
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | advanceClocksOnPayThePrice: vow clocks failed:`, err?.message ?? err);
  }

  if (!advanced.length) return advanced;
  const clocks = onePerClock(advanced);
  const lines = clocks.map(a =>
    `<li>${escapeChatHtml(a.name)} — ${a.filled}/${a.segments}${a.triggered ? " <strong>(TRIGGERED)</strong>" : ""}</li>`,
  ).join("");
  try {
    await ChatMessage.create({
      content: `<div class="sf-clock-card"><strong>⏳ The clock turns</strong><p>Paying the price advances the countdown:</p><ul>${lines}</ul></div>`,
      flags:   { [MODULE_ID]: { clockCard: true, payThePriceAdvance: true } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | advanceClocksOnPayThePrice: card post failed:`, err?.message ?? err);
  }

  // Fire-and-forget vignette for any clock that just triggered — the
  // narrative beat for when a deadline arrives or a threat materialises.
  const justTriggered = clocks.filter(a => a.triggered);
  if (justTriggered.length) {
    setTimeout(async () => {
      try {
        const { narrateClockAdvancement } = await import("../narration/narrator.js");
        // A working copy — each vignette applies its sidecar on it (issue #329 X09).
        const cs = foundry.utils.deepClone(game.settings.get(MODULE_ID, "campaignState") ?? {});
        for (const cd of justTriggered) {
          const narrationId = newNarrationId();
          const text = await narrateClockAdvancement({ clock: cd, campaignState: cs, narrationId });
          if (text) {
            // Flag family (NARR-RING-CLOCKVIG): threat-advance fiction must
            // enter the ring/summary or the narrator forgets it immediately.
            // narrationId: what an X-Card on it retracts (issue #321 U07).
            await ChatMessage.create({
              content: `<div class="sf-clock-card"><strong>⚠ TRIGGERED — </strong><em>${escapeChatHtml(text)}</em></div>`,
              flags:   {
                [MODULE_ID]: {
                  clockCard:         true,
                  clockVignetteCard: true,
                  narratorCard:      true,
                  narrationText:     text,
                  sessionId:         cs.currentSessionId ?? null,
                  narrationId,
                },
              },
            });
          }
        }
      } catch (err) {
        console.warn(`${MODULE_ID} | advanceClocksOnPayThePrice: trigger vignette failed:`, err?.message ?? err);
      }
    }, 0);
  }

  return advanced;
}

/**
 * GM-relay handler (GM_ACTIONS "payThePrice.advanceClocks"): a player's
 * `!ptp` asks the canonical GM to advance the countdown clocks.
 *
 * @returns {Promise<void>}
 */
export async function advanceClocksForPayThePriceRelay(_payload, _ctx) {
  await advanceClocksOnPayThePrice();
}

/**
 * One entry per clock in the fiction: the copies of a vow (the same vowId — a
 * shared vow has one per PC) collapse to the first. Tension clocks and vows
 * without a vowId are each their own clock.
 *
 * @param {Array<Object>} advanced
 * @returns {Array<Object>}
 */
function onePerClock(advanced) {
  const seen = new Set();
  return advanced.filter(a => {
    if (a.type !== "vow" || !a.vowId) return true;
    if (seen.has(a.vowId)) return false;
    seen.add(a.vowId);
    return true;
  });
}

function escapeChatHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
