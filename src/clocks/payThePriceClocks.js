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
import { stripMarkup } from "../audio/segments.js";

const MODULE_ID = "starforged-companion";

/**
 * How long a narration waits for the trigger vignettes in flight (issue #335
 * Y05): each is a bounded Claude call, so this only passes one that hangs.
 */
const TRIGGER_VIGNETTE_WAIT_MS = 60_000;

/** The trigger vignettes in flight on this client, settled once they are done (never rejects). */
let _triggerVignettes = Promise.resolve();

/**
 * The clocks (`vignetteClockId`) whose Pay the Price trigger vignette is being
 * written on this client, each with a count. A Burn Momentum or Improve Result
 * that rewinds one finds no card of it — the vignette, its clock no longer
 * full, drops itself (clockStillTriggered) — and must not strike an earlier
 * trigger's of the same clock in its place (TRIGGER-VIGNETTE-LATE-POST;
 * resultUpgrade.js supersedeTriggerVignettes).
 */
const _vignettesInFlight = new Map();

/**
 * Whether a Pay the Price trigger vignette of this clock is being written on
 * this client now.
 *
 * @param {string|null} clockId — as `vignetteClockId` names it
 * @returns {boolean}
 */
export function triggerVignetteInFlight(clockId) {
  return !!clockId && (_vignettesInFlight.get(clockId) ?? 0) > 0;
}

function trackVignetteInFlight(clockId, delta) {
  if (!clockId) return;
  const n = (_vignettesInFlight.get(clockId) ?? 0) + delta;
  if (n > 0) _vignettesInFlight.set(clockId, n);
  else { _vignettesInFlight.delete(clockId); _rewoundDuringVignette.delete(clockId); }
}

/**
 * The upgrades that rewound a clock while its trigger vignette was in flight
 * (clockId → `{ kind, resolutionId }`): its card, if it still posts — the
 * rewind landed during the card's own creation, after its last check — is
 * struck with that upgrade's note and name (TRIGGER-VIGNETTE-POST-WINDOW).
 */
const _rewoundDuringVignette = new Map();

/**
 * Note that an upgrade rewound this clock while its trigger vignette is in
 * flight (resultUpgrade.js supersedeTriggerVignettes).
 *
 * @param {string|null} clockId
 * @param {{ kind?: "burn"|"improve", resolutionId?: string|null }} info
 */
export function noteRewindDuringVignette(clockId, info = {}) {
  if (!clockId || !triggerVignetteInFlight(clockId)) return;
  _rewoundDuringVignette.set(clockId, { kind: info.kind === "improve" ? "improve" : "burn", resolutionId: info.resolutionId ?? null });
}

/**
 * After a trigger vignette's card posted: a rewind that landed while it was
 * being created — after the vignette's last `stillTriggered` check — left
 * the card live, and the rewind's own supersede skipped it (it was in
 * flight). Re-check the clock, and strike the card when the rewind's note is
 * here or the clock is no longer full (TRIGGER-VIGNETTE-POST-WINDOW, the
 * proposal). Never throws.
 *
 * @param {Object} card — the posted ChatMessage
 * @param {Object} entry — the advanced-clock entry it narrates
 * @param {string|null} clockId
 */
async function strikeIfRewoundWhilePosting(card, entry, clockId) {
  if (!card) return;
  try {
    const stillFull = await clockStillTriggered(entry);
    const note = _rewoundDuringVignette.get(clockId) ?? null;
    if (stillFull && !note) return;
    _rewoundDuringVignette.delete(clockId);
    const { strikeTriggerVignetteCards } = await import("../moves/resultUpgrade.js");
    await strikeTriggerVignetteCards([card], note?.kind ?? "burn", note?.resolutionId ?? null);
  } catch (err) {
    console.warn(`${MODULE_ID} | Pay the Price: re-checking a trigger vignette's clock after its card posted failed:`, err?.message ?? err);
  }
}

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
 *
 * `skipClockIds`: tension clocks this price leaves alone — the scene
 * challenge's clock a scene-challenge move's miss filled itself (issue #338
 * D2; advanceTensionClocksForPayThePrice).
 *
 * @param {{ skipClockIds?: string[] }} [opts]
 */
export async function advanceClocksOnPayThePrice({ skipClockIds = [] } = {}) {
  if (!game.user?.isGM) {
    console.debug(`${MODULE_ID} | Pay the Price: clock advance is GM-only — not advanced from this player client.`);
    return [];
  }
  const advanced = [];

  try {
    const { advanceTensionClocksForPayThePrice } = await import("./clocks.js");
    for (const c of await advanceTensionClocksForPayThePrice({ skipIds: skipClockIds })) {
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
  // Tracked until it is done: `!ptp`'s oracle follow-up narrates after it
  // (triggerVignettesSettled, issue #335 Y05).
  const justTriggered = clocks.filter(a => a.triggered);
  if (justTriggered.length) {
    const run = new Promise(resolve => setTimeout(async () => {
      try {
        const { narrateClockAdvancement } = await import("../narration/narrator.js");
        // A working copy — each vignette applies its sidecar on it (issue #329 X09).
        const cs = foundry.utils.deepClone(game.settings.get(MODULE_ID, "campaignState") ?? {});
        for (const cd of justTriggered) {
          const narrationId = newNarrationId();
          // Narrated only while the clock is still full when the reply comes
          // in: a burn or improvement that rewound it meanwhile (issue #338
          // D8) found no card to strike, and the late vignette landed live
          // (TRIGGER-VIGNETTE-LATE-POST). In flight until its card is posted.
          const clockId = vignetteClockId(cd);
          trackVignetteInFlight(clockId, +1);
          try {
            const text = await narrateClockAdvancement({ clock: cd, campaignState: cs, narrationId,
              stillTriggered: () => clockStillTriggered(cd) });
            if (text) {
              // Flag family (NARR-RING-CLOCKVIG): threat-advance fiction must
              // enter the ring/summary or the narrator forgets it immediately.
              // narrationId: what an X-Card on it retracts (issue #321 U07).
              const card = await ChatMessage.create({
                // NPC dialogue markup stripped, as on every fiction card (issue #331 X27).
                content: `<div class="sf-clock-card"><strong>⚠ TRIGGERED — </strong><em>${escapeChatHtml(stripMarkup(text))}</em></div>`,
                flags:   {
                  [MODULE_ID]: {
                    clockCard:         true,
                    clockVignetteCard: true,
                    narratorCard:      true,
                    narrationText:     text,
                    sessionId:         cs.currentSessionId ?? null,
                    narrationId,
                    // The clock it narrates: a burn or improvement that rewinds
                    // the clock supersedes it (issue #338 D8).
                    clockId,
                  },
                },
              });
              // Still in flight: a rewind meanwhile has noted itself for this.
              await strikeIfRewoundWhilePosting(card, cd, clockId);
            }
          } finally {
            trackVignetteInFlight(clockId, -1);
          }
        }
      } catch (err) {
        console.warn(`${MODULE_ID} | advanceClocksOnPayThePrice: trigger vignette failed:`, err?.message ?? err);
      } finally {
        resolve();
      }
    }, 0));
    _triggerVignettes = Promise.all([_triggerVignettes, run]).then(() => {});
  }

  return advanced;
}

/**
 * The clock a trigger vignette narrates, as its card names it (`clockId`): a
 * tension clock's `_id`, or a vow's countdown clock by its vow (`vowId` — the
 * copies of a shared vow are one clock — else the Item's id). A Burn Momentum
 * or Improve Result that rewinds the clock out of its trigger finds the
 * vignette by it (resultUpgrade.js revertPayThePrice, issue #338 D8).
 *
 * @param {{ type?: string, _id?: string, vowId?: string|null, itemId?: string }} entry
 *   — an advanced-clock entry (advanceClocksOnPayThePrice)
 * @returns {string|null}
 */
export function vignetteClockId(entry) {
  const id = entry?.type === "vow" ? (entry.vowId ?? entry.itemId) : entry?._id;
  return typeof id === "string" && id ? id : null;
}

/**
 * Whether the clock an advanced-clock entry names is still full: a trigger
 * vignette is narrated only while it is (TRIGGER-VIGNETTE-LATE-POST — every
 * post site hands it to narrateClockAdvancement as `stillTriggered`). A
 * tension or campaign clock is read from the store; a vow's countdown clock
 * from its vow (the entry's copy — an upgrade rewinds every copy of a shared
 * vow). A clock no longer found stands: it triggered, and was removed since.
 *
 * @param {{ type?: string, _id?: string, actorId?: string, itemId?: string }} entry
 * @returns {Promise<boolean>}
 */
export async function clockStillTriggered(entry) {
  if (entry?.type === "vow") {
    const { getActor, readVows } = await import("../character/actorBridge.js");
    const actor = entry.actorId ? getActor(entry.actorId) : null;
    const clock = readVows(actor).find(v => v.id === entry.itemId)?.clock ?? null;
    return !clock || !(clock.max > 0) || clock.ticks >= clock.max;
  }
  const clock = (game.settings.get(MODULE_ID, "campaignState")?.clocks ?? []).find(c => c?._id === entry?._id) ?? null;
  return !clock || (clock.filled ?? 0) >= clock.segments;
}

/**
 * Settles once the trigger vignettes in flight on this client are done — or
 * after TRIGGER_VIGNETTE_WAIT_MS, with a warning. `!pay-the-price` filling a
 * tension clock fires its trigger vignette and the oracle follow-up together,
 * each on its own working copy: with no scene open both started one, and the
 * narration on the losing scene lost its facts (issue #335 Y05). The follow-up
 * reads its copy after this, so it continues the vignette's scene with its
 * beat in it. Never rejects.
 *
 * @returns {Promise<void>}
 */
export async function triggerVignettesSettled() {
  let timer = null;
  const timedOut = new Promise(resolve => { timer = setTimeout(() => resolve(true), TRIGGER_VIGNETTE_WAIT_MS); });
  try {
    if (await Promise.race([_triggerVignettes.then(() => false), timedOut])) {
      console.warn(`${MODULE_ID} | Pay the Price: a trigger vignette is still running after ${TRIGGER_VIGNETTE_WAIT_MS}ms — narrating anyway.`);
    }
  } finally {
    clearTimeout(timer);
  }
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
