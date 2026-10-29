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
 *
 * An upgrade is claimed before any of its effects (claimUpgradeCard), and each
 * write after the claim runs through applyUpgradeStep: one the world refuses
 * goes on the GMs' payoff failure card as an `upgrade` step, which its Retry
 * applies once (issue #311 P06).
 */

import { applyMeterChanges, isPlayerCharacterActor, readCharacterSnapshot } from "../character/actorBridge.js";

const MODULE_ID = "starforged-companion";

const PC_METERS = ["momentum", "health", "spirit", "supply"];

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Claim a move card for its upgrade before any effect: `<kind>.consumed` is
 * saved on the card first. Refused, nothing is applied and the button re-arms
 * (relayCardButtonClick). The stamp used to follow the effects with its
 * refusal swallowed, so a fresh render of the card offered the upgrade again
 * and a second press applied it again (issue #311 P06).
 *
 * @param {ChatMessage} message — the move card
 * @param {"burn"|"improve"} kind
 * @returns {Promise<boolean>} whether the claim landed
 */
export async function claimUpgradeCard(message, kind) {
  try {
    await message.update({ [`flags.${MODULE_ID}.${kind}.consumed`]: true });
    return true;
  } catch (err) {
    console.warn(`${MODULE_ID} | ${kind}: card ${message?.id ?? "?"} could not be claimed — nothing applied:`, err?.message ?? err);
    return false;
  }
}

/**
 * One write of a claimed upgrade. A write the world refuses is pushed onto
 * `failures` as an `upgrade` step for the GMs' Retry (index.js
 * runPayoffStep → retryUpgradeStep), never thrown past the claimed card.
 *
 * @param {{ effect: "meters", pcId: string, changes: Object }
 *   | { effect: "tensionClocks", clocks: Array<{ _id: string, name?: string }> }
 *   | { effect: "vowClocks", entries: Array<{ actorId: string, itemId: string, name?: string }> }} step
 * @param {Array<Object>} failures
 * @returns {Promise<boolean>} whether it landed
 */
export async function applyUpgradeStep(step, failures) {
  try {
    const res = await runUpgradeStep(step);
    if (res.ok) return true;
    failures.push({ ...step, step: "upgrade", reason: res.reason ?? "refused" });
  } catch (err) {
    console.warn(`${MODULE_ID} | upgrade ${step.effect} not applied:`, err?.message ?? err);
    failures.push({ ...step, step: "upgrade", reason: "refused", error: String(err?.message ?? err) });
  }
  return false;
}

/** Apply one upgrade step; a refused write throws. */
async function runUpgradeStep(step) {
  switch (step.effect) {
    case "meters": {
      const pc = globalThis.game?.actors?.get?.(step.pcId) ?? null;
      if (!pc) return { ok: false, reason: "no-pc" };
      await applyMeterChanges(pc, step.changes);
      return { ok: true };
    }
    case "tensionClocks": {
      const { revertTensionClocksForBurn } = await import("../clocks/clocks.js");
      await revertTensionClocksForBurn(step.clocks.map(c => c._id));
      return { ok: true };
    }
    case "vowClocks": {
      const { revertVowClocksForBurn } = await import("../character/actorBridge.js");
      const failed = await revertVowClocksForBurn(step.entries);
      return failed.length ? { ok: false, reason: "refused" } : { ok: true };
    }
    default:
      return { ok: false, reason: "invalid step" };
  }
}

/**
 * The GMs' Retry of one failed upgrade step, from the GM-authored failure card
 * — its values still checked: a PC's four meters by at most 16, clock ids as
 * strings.
 *
 * @param {Object} s — the card's step record
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function retryUpgradeStep(s) {
  switch (s?.effect) {
    case "meters": {
      const pc = s.pcId ? (globalThis.game?.actors?.get?.(s.pcId) ?? null) : null;
      if (!isPlayerCharacterActor(pc)) return { ok: false, reason: "no-pc" };
      const changes = s.changes && typeof s.changes === "object" ? s.changes : {};
      const valid = Object.entries(changes).every(([k, v]) => PC_METERS.includes(k) && Number.isInteger(v) && Math.abs(v) <= 16);
      if (!valid) return { ok: false, reason: "invalid step" };
      break;
    }
    case "tensionClocks":
      if (!Array.isArray(s.clocks) || !s.clocks.every(c => typeof c?._id === "string")) return { ok: false, reason: "invalid step" };
      break;
    case "vowClocks":
      if (!Array.isArray(s.entries) || !s.entries.every(e => typeof e?.actorId === "string" && typeof e?.itemId === "string")) {
        return { ok: false, reason: "invalid step" };
      }
      break;
    default:
      return { ok: false, reason: "invalid step" };
  }
  const failures = [];
  return (await applyUpgradeStep(s, failures)) ? { ok: true } : { ok: false, ...failures[0] };
}

/** What a Retry needs of a failed upgrade step. */
export function upgradeStepRecord(f) {
  return {
    step: "upgrade", effect: f.effect,
    ...(f.effect === "meters"        ? { pcId: f.pcId ?? null, changes: f.changes ?? {} } : {}),
    ...(f.effect === "tensionClocks" ? { clocks: (f.clocks ?? []).map(c => ({ _id: c._id, name: c.name ?? null })) } : {}),
    ...(f.effect === "vowClocks"     ? { entries: (f.entries ?? []).map(e => ({ actorId: e.actorId, itemId: e.itemId, name: e.name ?? null })) } : {}),
  };
}

/**
 * A failed upgrade step as a line of the GMs' card: what, why (`why`, already
 * HTML), and the value as it stands now.
 *
 * @param {Object} f — the failure
 * @param {string} why
 * @returns {string} HTML
 */
export function describeUpgradeStep(f, why) {
  switch (f.effect) {
    case "meters": {
      const pc   = f.pcId ? (globalThis.game?.actors?.get?.(f.pcId) ?? null) : null;
      const who  = escapeHtml(pc?.name ?? "the character");
      const keys = Object.keys(f.changes ?? {}).filter(k => f.changes[k]);
      const what = keys.map(k => `${k} ${f.changes[k] > 0 ? "+" : ""}${f.changes[k]}`).join(", ") || "no change";
      const meters = readCharacterSnapshot(pc)?.meters ?? {};
      const now  = pc && keys.length ? ` ${who}'s ${keys.map(k => `${k} stands at ${meters[k]}`).join(", ")} now.` : "";
      return `${escapeHtml(what)} for ${who}, from the upgraded result — ${why}.${now}`;
    }
    case "tensionClocks": {
      const clocks = globalThis.game?.settings?.get?.(MODULE_ID, "campaignState")?.clocks ?? [];
      return (f.clocks ?? []).map(c => {
        const live = clocks.find(x => x._id === c._id);
        const now  = live ? ` It stands at ${live.filled ?? 0}/${live.segments ?? "?"} now.` : "";
        return `Rewind the ${escapeHtml(c.name ?? "tension")} clock one segment — ${why}.${now}`;
      }).join("<br>");
    }
    case "vowClocks":
      return (f.entries ?? []).map(e => `Rewind the ${escapeHtml(e.name ?? "vow")} clock one segment — ${why}.`).join("<br>");
    default:
      return `An upgrade step — ${why}.`;
  }
}

/**
 * Tell the GMs which of a claimed upgrade's writes did not land, with a Retry
 * (index.js postPayoffFailureCard). No-op without failures.
 *
 * @param {Actor|null} actor — the upgrading PC
 * @param {Array<Object>} failures — applyUpgradeStep's
 */
export async function reportUpgradeFailures(actor, failures) {
  if (!failures.length) return;
  try {
    const { postPayoffFailureCard } = await import("../index.js");
    await postPayoffFailureCard({ source: "upgrade", actorId: actor?.id ?? null, failures });
  } catch (err) {
    console.warn(`${MODULE_ID} | upgrade: failure card failed:`, err?.message ?? err);
  }
}

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
 * was unwound; a write the world refuses goes onto `failures`
 * (applyUpgradeStep).
 *
 * @param {Object|null} ptpReversals — the card's `ptpReversals`: `{ clocksAdvanced, sufferMeterDelta }`
 * @param {Actor|null} actor — the upgrading PC (the receipt's own PC first)
 * @param {{ kind?: "burn"|"improve", failures?: Array<Object> }} [opts]
 * @returns {Promise<string[]>} what was unwound
 */
export async function revertPayThePrice(ptpReversals, actor, { kind = "burn", failures = [] } = {}) {
  if (!ptpReversals) return [];
  const reverted = [];
  const advanced = ptpReversals.clocksAdvanced ?? [];

  // 1. Rewind clock advances
  const tension = advanced.filter(c => c.type === "tension" && c._id).map(c => ({ _id: c._id, name: c.name ?? null }));
  const entries = advanced.filter(c => c.type === "vow" && c.actorId && c.itemId)
    .map(c => ({ actorId: c.actorId, itemId: c.itemId, name: c.name ?? null }));
  if (tension.length && await applyUpgradeStep({ effect: "tensionClocks", clocks: tension }, failures)) {
    for (const c of tension) reverted.push(`${c.name} clock rewound`);
  }
  if (entries.length && await applyUpgradeStep({ effect: "vowClocks", entries }, failures)) {
    for (const v of entries) reverted.push(`${v.name} clock rewound`);
  }

  // 2. Refund the route's PC-meter loss — the receipt is what landed (the move
  // that ran, the meter's before and after), never the table's annotation
  // (issue #311 P04).
  const delta    = ptpReversals.sufferMeterDelta;
  const refundTo = (delta?.actorId ? game.actors?.get?.(delta.actorId) : null) ?? actor;
  const resets   = kind === "burn" && delta?.meterKey === "momentum";
  if (delta?.meterKey && delta.amount > 0 && !resets && refundTo
      && await applyUpgradeStep({ effect: "meters", pcId: refundTo.id, changes: { [delta.meterKey]: +delta.amount } }, failures)) {
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
