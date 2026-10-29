/**
 * STARFORGED COMPANION
 * src/moves/resultUpgrade.js — what an upgraded result undoes besides its meters.
 *
 * Burn Momentum (burnMomentum.js) and Improve Result (improveResult.js) both
 * replace a move's recorded outcome with a better one, after that outcome was
 * applied. Each swaps the move's own meter consequences itself; what the
 * superseded outcome set off elsewhere is undone here, the same way for both
 * (issue #311 P05 — an improvement kept a miss's Pay the Price harm and clock
 * advance, which a burn of the same miss reverted):
 *
 *   - revertPayThePrice — the clocks the miss's Pay the Price advanced, and the
 *     PC-meter loss its route landed (the receipt index.js ptpMeterReceipt
 *     records). Vehicle and companion routes, and impacts an executor marked,
 *     are not reversed (decisions.md → "Burn Momentum reverses Pay-the-Price
 *     side effects").
 */

import { applyMeterChanges } from "../character/actorBridge.js";

const MODULE_ID = "starforged-companion";

const REVERSAL_CARDS = {
  burn:    { title: "⏰ Burn reversal",    lead: "Momentum burned — the Price reverts:", flag: "burnReversal" },
  improve: { title: "⏰ Improve reversal", lead: "Result improved — the Price reverts:", flag: "improveReversal" },
};

/**
 * Revert the Pay the Price side effects of the superseded miss: rewind each
 * clock it advanced (tension clocks, vow countdown clocks) by one segment and
 * refund the PC-meter loss its route landed. A burn resets momentum, which
 * already undoes a momentum loss, so a burn refunds none; an improvement keeps
 * the momentum the PC has, so it refunds that too. Posts a card listing what
 * was unwound.
 *
 * @param {Object|null} ptpReversals — the card's `ptpReversals`: `{ clocksAdvanced, sufferMeterDelta }`
 * @param {Actor|null} actor — the upgrading PC (the receipt's own PC first)
 * @param {{ kind?: "burn"|"improve" }} [opts]
 * @returns {Promise<string[]>} what was unwound
 */
export async function revertPayThePrice(ptpReversals, actor, { kind = "burn" } = {}) {
  if (!ptpReversals) return [];
  const reverted = [];
  const advanced = ptpReversals.clocksAdvanced ?? [];

  // 1. Rewind clock advances
  const tension    = advanced.filter(c => c.type === "tension" && c._id);
  const vowEntries = advanced.filter(c => c.type === "vow" && c.actorId && c.itemId);
  if (tension.length) {
    const { revertTensionClocksForBurn } = await import("../clocks/clocks.js");
    await revertTensionClocksForBurn(tension.map(c => c._id));
    for (const c of tension) reverted.push(`${c.name} clock rewound`);
  }
  if (vowEntries.length) {
    const { revertVowClocksForBurn } = await import("../character/actorBridge.js");
    await revertVowClocksForBurn(vowEntries);
    for (const v of vowEntries) reverted.push(`${v.name} clock rewound`);
  }

  // 2. Refund the route's PC-meter loss — the receipt is what landed (the move
  // that ran, the meter's before and after), never the table's annotation
  // (issue #311 P04).
  const delta    = ptpReversals.sufferMeterDelta;
  const refundTo = (delta?.actorId ? game.actors?.get?.(delta.actorId) : null) ?? actor;
  const resets   = kind === "burn" && delta?.meterKey === "momentum";
  if (delta?.meterKey && delta.amount > 0 && !resets && refundTo) {
    await applyMeterChanges(refundTo, { [delta.meterKey]: +delta.amount });
    reverted.push(`${delta.meterKey} +${delta.amount} refunded`);
  }

  if (!reverted.length) return reverted;
  const card  = REVERSAL_CARDS[kind] ?? REVERSAL_CARDS.burn;
  const lines = reverted.map(r => `<li>${r}</li>`).join("");
  await ChatMessage.create({
    content: `<div class="sf-clock-card"><strong>${card.title}</strong><p>${card.lead}</p><ul>${lines}</ul></div>`,
    flags:   { [MODULE_ID]: { clockCard: true, [card.flag]: true } },
  }).catch(err => console.warn(`${MODULE_ID} | ${kind}: reversal card failed:`, err));
  return reverted;
}
