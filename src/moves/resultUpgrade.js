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
 *   - revertPayThePrice — the clocks the miss's Pay the Price advanced, the
 *     PC-meter losses its route landed (the receipts index.js ptpMeterReceipts
 *     records — a harm's overflow into momentum is one of its own, issue #314
 *     Q02), the price's entry in RECENT ORACLE RESULTS (issue #342 Z11), and
 *     the unprepared marks its supply loss made, once the supply is refunded
 *     above 0 (issue #342 D4). Vehicle and companion routes, and the other
 *     impacts an executor marked, are not reversed (decisions.md → "Burn
 *     Momentum reverses Pay-the-Price side effects").
 *
 *   - reconcileChoices — the move's choice card. A pending card of the
 *     superseded outcome is retired (and a pick that reaches it anyway is
 *     refused: sufferCard.js checks upgradeKindFor), and the upgraded
 *     outcome's own choice is posted, once (issue #311 P03 — the old card kept
 *     charging the weak hit's cost under a strong hit, and the new outcome's
 *     choice was never offered). Choice cards carry their move's
 *     `resolutionId` for this.
 *
 * A consequence already chosen closes both upgrades: the rules burn momentum
 * "before applying any other effects of the move", and a choice's effects are
 * not undone — an upgrade after it would stack two outcomes' choices
 * (consequenceChosen, closeUpgradesForChoice).
 *
 * An upgrade is claimed before any of its effects (claimUpgradeCard), and each
 * write after the claim runs through applyUpgradeStep: one the world refuses
 * goes on the GMs' payoff failure card as an `upgrade` step, which its Retry
 * applies once (issue #311 P06).
 *
 * The upgraded outcome's other effects — the fight's progress and position,
 * the expedition's progress, a legacy mark, the companion's health, an
 * arrival, a lost fight's payoff — run through the pipeline's own applier
 * (index.js applyOutcomeEffects, injected into both upgrade hooks as
 * `applyEffects`), for what the upgraded outcome adds over the recorded
 * original (applyUpgradedOutcomeEffects; UPGRADE-PIPELINE-EFFECTS — only the
 * meters, the reversal and the choice card used the upgraded consequences). A
 * weak hit that pays the price too keeps the price the miss already rolled
 * (the handlers skip the reversal; effectsNoteHtml says so). Both upgrades
 * re-narrate and log the same way (renarrateUpgrade).
 */

import { applyMeterChanges, isPlayerCharacterActor, readCharacterSnapshot, setDebility } from "../character/actorBridge.js";
import { isUnprepared } from "./sufferExecutor.js";
import { dropOracleResultsOf } from "../oracles/oracleMemory.js";
import { serialiseCampaignStateWrite } from "../multiplayer/campaignStateChain.js";

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
 * runPayoffStep → retryUpgradeStep), never thrown past the claimed card. A
 * step of several writes (`vowClocks`) that lands in part fails with the
 * entries still owed, and the step pushed carries those alone — a Retry must
 * not rewind the clocks that landed again (issue #314 Q05).
 *
 * A clock rewind (`tensionClocks`, `vowClocks`) reports on `report.untriggered`
 * the clocks its landed writes took out of their triggered state, as the
 * writes read them (issue #342 Z46).
 *
 * @param {{ effect: "meters", pcId: string, changes: Object }
 *   | { effect: "tensionClocks", clocks: Array<{ _id: string, name?: string }> }
 *   | { effect: "vowClocks", entries: Array<{ actorId: string, itemId: string, name?: string }> }
 *   | { effect: "unprepared", pcIds: string[] }
 *   | { effect: "choiceCard", pcId: string, sufferPrompt: Object, executorOpts: Object, moveId: string|null, resolutionId: string|null }} step
 * @param {Array<Object>} failures
 * @param {{ untriggered?: Array<Object> }|null} [report] — filled in by a clock rewind
 * @returns {Promise<boolean>} whether it landed
 */
export async function applyUpgradeStep(step, failures, report = null) {
  try {
    const res = await runUpgradeStep(step);
    if (report && typeof report === "object" && Array.isArray(res.untriggered)) report.untriggered = res.untriggered;
    if (res.ok) return true;
    failures.push({
      ...step,
      ...(res.entries ? { entries: res.entries } : {}),
      ...(res.pcIds ? { pcIds: res.pcIds } : {}),
      step: "upgrade", reason: res.reason ?? "refused",
    });
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
      const untriggered = await revertTensionClocksForBurn(step.clocks.map(c => c._id));
      return { ok: true, untriggered: Array.isArray(untriggered) ? untriggered : [] };
    }
    case "vowClocks": {
      const { revertVowClocksForBurn } = await import("../character/actorBridge.js");
      // Each Item's rewind stands alone: the ones the world refused are the
      // step still owed (issue #314 Q05 — the whole step was queued, and the
      // Retry rewound the landed clocks once more).
      const untriggered = [];
      const failed = await revertVowClocksForBurn(step.entries, { untriggered });
      return failed.length ? { ok: false, reason: "refused", entries: failed, untriggered } : { ok: true, untriggered };
    }
    case "unprepared": {
      // The marks a reverted price made, each its own write: the refused ones
      // are the step still owed (the vowClocks shape). A PC gone, or no
      // longer unprepared (cleared since), needs nothing.
      const failed = [];
      for (const id of step.pcIds ?? []) {
        const pc = globalThis.game?.actors?.get?.(id) ?? null;
        if (!pc || !isUnprepared(pc)) continue;
        try {
          await setDebility(pc, "unprepared", false);
        } catch (err) {
          console.warn(`${MODULE_ID} | upgrade: clearing ${pc.name ?? id}'s unprepared failed:`, err?.message ?? err);
          failed.push(id);
        }
      }
      return failed.length ? { ok: false, reason: "refused", pcIds: failed } : { ok: true };
    }
    case "choiceCard": {
      const pc = globalThis.game?.actors?.get?.(step.pcId) ?? null;
      if (!pc) return { ok: false, reason: "no-pc" };
      const { postSufferChoiceCard } = await import("./sufferCard.js");
      const card = await postSufferChoiceCard({
        sufferPrompt: step.sufferPrompt, actor: pc, executorOpts: step.executorOpts ?? {},
        moveId: step.moveId ?? null, resolutionId: step.resolutionId ?? null, upgraded: true,
      });
      return card ? { ok: true } : { ok: false, reason: "refused" };
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
      if (!Array.isArray(s.entries) || !s.entries.every(e => typeof e?.actorId === "string" && typeof e?.itemId === "string"
        && (e.vowId == null || typeof e.vowId === "string"))) {
        return { ok: false, reason: "invalid step" };
      }
      break;
    case "unprepared":
      if (!Array.isArray(s.pcIds) || !s.pcIds.length
        || !s.pcIds.every(id => typeof id === "string" && isPlayerCharacterActor(globalThis.game?.actors?.get?.(id) ?? null))) {
        return { ok: false, reason: "invalid step" };
      }
      break;
    case "choiceCard": {
      const pc = s.pcId ? (globalThis.game?.actors?.get?.(s.pcId) ?? null) : null;
      if (!isPlayerCharacterActor(pc)) return { ok: false, reason: "no-pc" };
      if (!["any", "enumerated"].includes(s.sufferPrompt?.kind)) return { ok: false, reason: "invalid step" };
      break;
    }
    default:
      return { ok: false, reason: "invalid step" };
  }
  const failures = [];
  const report = {};
  const landed = await applyUpgradeStep(s, failures, report);
  // A clock rewind takes back the trigger its vignette narrated, as the first
  // pass's does (revertPayThePrice, issue #342 Z46): the Retry of a refused
  // rewind left the vignette live beside a clock no longer full, and the
  // clock's next fill fired a second one (UPGRADE-RETRY-REWIND-NO-SUPERSEDE).
  if (s.effect === "tensionClocks" || s.effect === "vowClocks") {
    const untriggered = s.effect === "tensionClocks"
      ? (Array.isArray(report.untriggered) ? report.untriggered : [])
      : vowClocksUntriggered(s.entries, report.untriggered, landed ? [] : (failures[0]?.entries ?? s.entries));
    await supersedeTriggerVignettes(untriggered, upgradeKind(s.kind), typeof s.resolutionId === "string" ? s.resolutionId : null);
  }
  return landed ? { ok: true } : { ok: false, ...failures[0] };
}

/** An upgrade step's kind — its vignette note says which — "burn" unless it says "improve". */
const upgradeKind = (kind) => (kind === "improve" ? "improve" : "burn");

/** A clock step's resolution upgraded, when it names one (issue #347 D2). */
const upgradedResolution = (f) => (typeof f.resolutionId === "string" && f.resolutionId ? { resolutionId: f.resolutionId } : {});

/** What a Retry needs of a failed upgrade step. */
export function upgradeStepRecord(f) {
  return {
    step: "upgrade", effect: f.effect,
    ...(f.effect === "meters"        ? { pcId: f.pcId ?? null, changes: f.changes ?? {} } : {}),
    // A clock step's kind and a vow copy's vow id: what its Retry supersedes the
    // rewound clock's trigger vignette by (retryUpgradeStep), and the
    // resolution upgraded, which the struck vignette is stamped with (issue
    // #347 D2).
    ...(f.effect === "tensionClocks" ? { clocks: (f.clocks ?? []).map(c => ({ _id: c._id, name: c.name ?? null })), kind: upgradeKind(f.kind),
      ...upgradedResolution(f) } : {}),
    ...(f.effect === "vowClocks"     ? { entries: (f.entries ?? []).map(e => ({
      actorId: e.actorId, itemId: e.itemId, vowId: typeof e.vowId === "string" && e.vowId ? e.vowId : null, name: e.name ?? null,
    })), kind: upgradeKind(f.kind), ...upgradedResolution(f) } : {}),
    ...(f.effect === "unprepared"    ? { pcIds: (f.pcIds ?? []).filter(id => typeof id === "string") } : {}),
    ...(f.effect === "choiceCard"    ? { pcId: f.pcId ?? null, sufferPrompt: f.sufferPrompt ?? null, executorOpts: f.executorOpts ?? {},
      moveId: f.moveId ?? null, resolutionId: f.resolutionId ?? null } : {}),
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
    case "unprepared": {
      const names = (f.pcIds ?? []).map(id => escapeHtml(globalThis.game?.actors?.get?.(id)?.name ?? "a character")).join(", ");
      return `Clear unprepared for ${names || "the crew"} — the reverted price marked it, and its supply was refunded — ${why}.`;
    }
    case "choiceCard": {
      const pc = f.pcId ? (globalThis.game?.actors?.get?.(f.pcId) ?? null) : null;
      return `The upgraded result's choice card for ${escapeHtml(pc?.name ?? "the character")} — ${why}. Nothing on it has been chosen yet.`;
    }
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

/** The receipts on a card's `ptpReversals` — a list since issue #314; one `sufferMeterDelta` before. */
function sufferMeterDeltas(ptpReversals) {
  if (Array.isArray(ptpReversals?.sufferMeterDeltas)) return ptpReversals.sufferMeterDeltas.filter(d => d?.meterKey);
  return ptpReversals?.sufferMeterDelta?.meterKey ? [ptpReversals.sufferMeterDelta] : [];
}

/**
 * The PCs whose unprepared the reverted price itself marked — a supply
 * receipt's payer (`unpreparedMarked`) and the allies it marked with them
 * (`alliesMarked`, by id) — for a receipt whose refund landed (`refunded`, the
 * payers' ids) and left the payer's supply above 0. Issue #342 D4.
 *
 * @param {Object|null} ptpReversals
 * @param {Set<string>} refunded
 * @returns {string[]}
 */
function unpreparedMarksToClear(ptpReversals, refunded) {
  const ids = new Set();
  for (const d of sufferMeterDeltas(ptpReversals)) {
    if (d.meterKey !== "supply" || typeof d.actorId !== "string" || !refunded.has(d.actorId)) continue;
    if (!d.unpreparedMarked && !(Array.isArray(d.alliesMarked) && d.alliesMarked.length)) continue;
    const payer = game.actors?.get?.(d.actorId) ?? null;
    if (!(Number(readCharacterSnapshot(payer)?.meters?.supply ?? 0) > 0)) continue;   // still exhausted: the marks stand
    if (d.unpreparedMarked) ids.add(d.actorId);
    for (const id of Array.isArray(d.alliesMarked) ? d.alliesMarked : []) if (typeof id === "string" && id) ids.add(id);
  }
  return [...ids];
}

/**
 * The momentum to give back, by PC: what each mark the reversal just cleared
 * (`clearedIds`) clamped away when the price made it — a supply receipt's
 * `momentumClamped` (sufferExecutor markUnprepared, issue #345 AA46) — less
 * `skipId`'s (a burn's burner, whose reset replaces it).
 *
 * @param {Object|null} ptpReversals
 * @param {string[]} clearedIds
 * @param {string|null} skipId
 * @returns {Array<[string, number]>}
 */
function clampsToGiveBack(ptpReversals, clearedIds, skipId) {
  const cleared = new Set(clearedIds);
  const owed = new Map();
  for (const d of sufferMeterDeltas(ptpReversals)) {
    if (d.meterKey !== "supply" || !d.momentumClamped || typeof d.momentumClamped !== "object") continue;
    for (const [id, n] of Object.entries(d.momentumClamped)) {
      if (!cleared.has(id) || id === skipId || !Number.isInteger(n) || n <= 0) continue;
      owed.set(id, (owed.get(id) ?? 0) + n);
    }
  }
  return [...owed];
}

const REVERSAL_CARDS = {
  burn:    { title: "⏰ Burn reversal",    lead: "Momentum burned — the Price reverts:", flag: "burnReversal" },
  improve: { title: "⏰ Improve reversal", lead: "Result improved — the Price reverts:", flag: "improveReversal" },
};

/**
 * Revert the Pay the Price side effects of the superseded miss: rewind each
 * clock it advanced (tension clocks, vow countdown clocks) by one segment,
 * refund the PC-meter losses its route landed, clear the unprepared marks it
 * made and give back the momentum they clamped (issue #342 D4, issue #345
 * AA46), and take the price out of RECENT ORACLE RESULTS (forgetRevertedPrice
 * — issue #342 Z11). A burn resets
 * momentum, which already undoes a momentum loss, so a burn refunds none; an
 * improvement keeps the momentum the PC has, so it refunds that too. Posts a
 * card listing what was unwound; a write the world refuses goes onto
 * `failures` (applyUpgradeStep).
 *
 * @param {Object|null} ptpReversals — the card's `ptpReversals`:
 *   `{ clocksAdvanced, sufferMeterDeltas }` (a card from before issue #314
 *   carries one `sufferMeterDelta`)
 * @param {Actor|null} actor — the upgrading PC (a receipt's own PC first)
 * @param {{ kind?: "burn"|"improve", failures?: Array<Object>, resolutionId?: string|null }} [opts]
 *   `resolutionId` — the upgraded move's, which its price's oracle memory carries
 * @returns {Promise<string[]>} what was unwound
 */
export async function revertPayThePrice(ptpReversals, actor, { kind = "burn", failures = [], resolutionId = null } = {}) {
  if (!ptpReversals) return [];
  await forgetRevertedPrice(resolutionId, kind);
  const reverted = [];
  const advanced = ptpReversals.clocksAdvanced ?? [];

  // 1. Rewind clock advances
  const tension = advanced.filter(c => c.type === "tension" && c._id).map(c => ({ _id: c._id, name: c.name ?? null }));
  const entries = advanced.filter(c => c.type === "vow" && c.actorId && c.itemId)
    .map(c => ({ actorId: c.actorId, itemId: c.itemId, vowId: c.vowId ?? null, name: c.name ?? null }));
  // The clocks whose landed rewind takes them out of their triggered state:
  // the trigger their vignette narrates did not happen (issue #338 D8).
  // Judged on the clock as the rewind reads it — full before, below full
  // after — not on this price's receipt: another player's price may have
  // filled it since, and its vignette stayed live beside a clock no longer
  // full, the next price firing a second one (issue #342 Z46).
  const untriggered = [];
  const tensionReport = {};
  // A step carries its kind, for its Retry's supersede (retryUpgradeStep),
  // and the resolution upgraded — what the struck vignette is stamped with
  // (issue #347 D2).
  if (tension.length && await applyUpgradeStep({ effect: "tensionClocks", clocks: tension, kind, ...(resolutionId ? { resolutionId } : {}) }, failures, tensionReport)) {
    for (const c of tension) reverted.push(`${c.name} clock rewound`);
    untriggered.push(...(tensionReport.untriggered ?? []));
  }
  if (entries.length) {
    // The rewinds that landed are reported; the refused ones are on the step
    // the GMs retry (issue #314 Q05).
    const at = failures.length;
    const vowReport = {};
    const ok = await applyUpgradeStep({ effect: "vowClocks", entries, kind, ...(resolutionId ? { resolutionId } : {}) }, failures, vowReport);
    const owed = ok ? [] : (failures[at]?.entries ?? entries);
    const owedIds = new Set(owed.map(e => e.itemId));
    for (const v of entries) if (!owedIds.has(v.itemId)) reverted.push(`${v.name} clock rewound`);
    untriggered.push(...vowClocksUntriggered(entries, vowReport.untriggered, owed));
  }
  await supersedeTriggerVignettes(untriggered, kind, resolutionId);

  // 2. Refund the route's PC-meter losses — each receipt is what landed (the
  // move that ran, a meter's before and after), never the table's annotation
  // (issue #311 P04). A harm's overflow into momentum is a receipt of its own
  // (issue #314 Q02); a burn's reset replaces momentum, so a burn refunds none.
  // One write per PC. A receipt that names its PC refunds that PC or nobody —
  // one deleted since is not stood in for by the upgrading PC (issue #342
  // Z48); a receipt from before receipts named one refunds the upgrading PC.
  const byPc = new Map();
  for (const delta of sufferMeterDeltas(ptpReversals)) {
    if (!(delta.amount > 0) || (kind === "burn" && delta.meterKey === "momentum")) continue;
    const refundTo = delta.actorId ? (game.actors?.get?.(delta.actorId) ?? null) : actor;
    if (!refundTo) continue;
    const changes = byPc.get(refundTo) ?? {};
    changes[delta.meterKey] = (changes[delta.meterKey] ?? 0) + Number(delta.amount);
    byPc.set(refundTo, changes);
  }
  const refunded = new Set();
  for (const [refundTo, changes] of byPc) {
    if (await applyUpgradeStep({ effect: "meters", pcId: refundTo.id, changes }, failures)) {
      refunded.add(refundTo.id);
      for (const [meterKey, amount] of Object.entries(changes)) reverted.push(`${meterKey} +${amount} refunded`);
    }
  }

  // 3. The unprepared marks the reverted price itself made — its payer's and
  // the allies sharing the supply it took to 0 (the receipt's
  // `unpreparedMarked` / `alliesMarked`), never a mark that was there before —
  // cleared once the refunded supply is back above 0: the rules key
  // unprepared on an exhausted supply the reversal says never happened, and
  // since issue #338 D3 a stale mark redirected every crew member's loss of
  // resources and kept their momentum lowered until a Resupply (issue #342
  // D4, ruling A narrowly). A refused clear is an upgrade step for the GMs'
  // Retry, as the refund is.
  const unmark = unpreparedMarksToClear(ptpReversals, refunded);
  let clearedIds = [];
  if (unmark.length) {
    const at = failures.length;
    const ok = await applyUpgradeStep({ effect: "unprepared", pcIds: unmark }, failures);
    const owed = new Set(ok ? [] : (failures[at]?.pcIds ?? unmark));
    clearedIds = unmark.filter(id => !owed.has(id));
    const cleared = clearedIds.map(id => game.actors?.get?.(id)?.name ?? id);
    if (cleared.length) reverted.push(`${cleared.map(escapeHtml).join(", ")} no longer unprepared`);
  }

  // 4. The momentum each cleared mark's lowered maximum clamped away (the
  // receipt's `momentumClamped`): the clear gave the maximum back, never the
  // momentum — an ally at 10 stayed at 9 for a price never paid (issue #345
  // AA46). After the clear, so it lands under the maximum the price never
  // lowered. Not on a burn to the burner: the burn's reset replaces their
  // momentum, as it does the price's momentum receipts. One meters step per
  // PC, for the GMs' Retry.
  for (const [pcId, amount] of clampsToGiveBack(ptpReversals, clearedIds, kind === "burn" ? (actor?.id ?? null) : null)) {
    if (await applyUpgradeStep({ effect: "meters", pcId, changes: { momentum: amount } }, failures)) {
      reverted.push(`${escapeHtml(game.actors?.get?.(pcId)?.name ?? pcId)}: momentum +${amount} given back`);
    }
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


/**
 * The reverted price leaves the narrator's memory: its card's `oracleMemory`
 * (stamped with the move's `resolutionId`, index.js postMovePayThePriceCard)
 * stood in RECENT ORACLE RESULTS — "the dice established these outcomes …
 * must not contradict them" — beside the upgraded outcome's re-narration and
 * every later narration this session, for a price that was never paid (issue
 * #342 Z11). On the canonical GM, through the campaignState write chain the
 * capture writes on (so a capture still queued lands first), on a copy of the
 * stored state. Best-effort, as the capture is: a refusal is logged and the
 * entry stays. Never throws.
 *
 * @param {string|null} resolutionId
 * @param {"burn"|"improve"} kind
 * @returns {Promise<boolean>} whether an entry was dropped
 */
async function forgetRevertedPrice(resolutionId, kind) {
  if (typeof resolutionId !== "string" || !resolutionId) return false;
  try {
    const { isCanonicalGM } = await import("../multiplayer/gmGate.js");
    if (!isCanonicalGM()) return false;
    return await serialiseCampaignStateWrite(async () => {
      const stored = globalThis.game?.settings?.get?.(MODULE_ID, "campaignState");
      if (!stored || typeof stored !== "object") return false;
      const copy = { ...stored };
      if (!dropOracleResultsOf(copy, resolutionId)) return false;
      await game.settings.set(MODULE_ID, "campaignState", copy);
      return true;
    }, `${kind}: the reverted price's oracle memory`);
  } catch (err) {
    console.warn(`${MODULE_ID} | ${kind}: the reverted price could not be taken out of the recent oracle results:`, err?.message ?? err);
    return false;
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// What the superseded outcome narrated (issue #338 D8)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Take what superseded narrations wrote out of the scene ledgers, by their
 * narration ids — the X-Card's by-id retraction (ledgers.js
 * retractNarrations), its truths retracted as superseded
 * (SUPERSEDED_RETRACTED_BY: rendered nowhere, never migrated, never named
 * under CORRECTED, and no bar to a later narration stating the same fact),
 * the state values they set giving way to the ones they superseded, a frame
 * they wrote cleared. An upgrade's two: the move narration it supersedes
 * (burnMomentum.js supersedeOriginalNarration) and the trigger vignette of a
 * clock it rewinds (supersedeTriggerVignettes) — both stayed binding beside
 * the re-narration (issue #338 D8). A world write: on the canonical GM, onto
 * a copy of the stored campaignState merged onto the latest store
 * (persistSceneLedgerFields); and on the caller's working copy too
 * (`campaignState`), which the re-narration applies its sidecar to — its
 * ledgers predate this. Never throws.
 *
 * @param {string[]} narrationIds
 * @param {{ campaignState?: Object|null, label?: string }} [opts]
 * @returns {Promise<boolean>} whether the store was written
 */
export async function retractSupersededNarrations(narrationIds, { campaignState = null, label = "upgrade" } = {}) {
  const ids = [...new Set((Array.isArray(narrationIds) ? narrationIds : []).filter(id => typeof id === "string" && id))];
  if (!ids.length) return false;
  try {
    const { isCanonicalGM } = await import("../multiplayer/gmGate.js");
    if (!isCanonicalGM()) return false;
    const { retractNarrations, SUPERSEDED_RETRACTED_BY } = await import("../factContinuity/ledgers.js");
    const { persistSceneLedgerFields } = await import("../factContinuity/sceneLifecycle.js");
    if (campaignState && typeof campaignState === "object") retractNarrations(campaignState, ids, { by: SUPERSEDED_RETRACTED_BY });
    const stored = globalThis.game?.settings?.get?.(MODULE_ID, "campaignState");
    if (!stored || typeof stored !== "object" || !ledgersHold(stored, new Set(ids))) return false;
    // A copy: retractNarrations replaces the ledger objects on it and never
    // changes the stored ones (rules/foundry-api.md — the cached setting).
    const copy = { ...stored };
    retractNarrations(copy, ids, { by: SUPERSEDED_RETRACTED_BY });
    return await persistSceneLedgerFields(copy, ["sceneTruths", "sceneState", "sceneFrame"], `${label}: superseded narration`);
  } catch (err) {
    console.warn(`${MODULE_ID} | ${label}: the superseded narration's ledger entries could not be retracted:`, err?.message ?? err);
    return false;
  }
}

/** Whether the scene ledgers hold anything the given narrations wrote and that still stands. */
function ledgersHold(cs, ids) {
  const theirs = (e) => !!e && typeof e === "object" && ids.has(e.narrationId);
  if ((Array.isArray(cs.sceneTruths) ? cs.sceneTruths : []).some(t => theirs(t) && !t.retracted)) return true;
  // A frame keeps the ones it replaced (issue #345 D3): one of theirs down the
  // chain would come back if a later X-Card removed the frames above it.
  for (let cur = cs.sceneFrame; cur && typeof cur === "object"; cur = cur.previous ?? null) if (theirs(cur)) return true;
  for (const list of Object.values(cs.sceneState?.bySubject ?? {})) {
    for (const entry of Array.isArray(list) ? list : []) {
      for (let cur = entry; cur && typeof cur === "object"; cur = cur.previous ?? null) if (theirs(cur)) return true;
    }
  }
  return false;
}

const VIGNETTE_SUPERSEDED_NOTES = {
  burn:    "Superseded — momentum was burned and the clock rewound: this has not happened.",
  improve: "Superseded — the result was improved and the clock rewound: this has not happened.",
};

/** A clock vignette card's prose struck through, with a note saying why (idempotent). */
function supersededVignetteContent(content, kind) {
  const html = String(content ?? "");
  if (html.includes("sf-narration-superseded")) return html;
  const note = `<div class="sf-narration-superseded-note" style="opacity:0.7;font-style:italic;">${VIGNETTE_SUPERSEDED_NOTES[kind] ?? VIGNETTE_SUPERSEDED_NOTES.burn}</div>`;
  const struck = html.replace(/<em>([\s\S]*?)<\/em>/,
    (_full, inner) => `<em class="sf-narration-superseded" style="opacity:0.55;text-decoration:line-through;"><s>${inner}</s></em>`);
  return /<\/div>\s*$/.test(struck) ? struck.replace(/<\/div>\s*$/, `${note}</div>`) : struck + note;
}

/**
 * The vow clocks a landed rewind took out of their triggered state, as
 * supersedeTriggerVignettes takes them (advanced-clock entries, by their vow —
 * vignetteClockId): each copy the rewind reported (`emptied`), once no copy
 * of its vow is still owed — a shared vow's clock is rewound once every copy
 * of it is (issue #342 Z46). The first pass's and its Retry's
 * (UPGRADE-RETRY-REWIND-NO-SUPERSEDE).
 *
 * @param {Array<{ actorId: string, itemId: string, vowId?: string|null }>} entries — the copies the step rewinds
 * @param {Array<{ itemId: string }>|undefined} emptied — the copies its landed writes took out of full
 * @param {Array<{ itemId: string }>} owed — the copies the world refused
 * @returns {Array<Object>}
 */
function vowClocksUntriggered(entries, emptied, owed) {
  const out   = new Set((Array.isArray(emptied) ? emptied : []).map(e => e?.itemId));
  const still = new Set((Array.isArray(owed) ? owed : []).map(e => e?.itemId));
  const vowOf = (e) => e.vowId ?? e.itemId;
  const list  = Array.isArray(entries) ? entries : [];
  return list
    .filter(c => out.has(c.itemId) && !list.some(o => still.has(o.itemId) && vowOf(o) === vowOf(c)))
    .map(c => ({ ...c, type: "vow" }));
}

/**
 * A clock the reversal rewinds out of its triggered state: the trigger its
 * vignette narrated did not happen. The vignette — the newest live trigger
 * vignette of this session naming the clock (`clockId`, payThePriceClocks.js
 * vignetteClockId; an older one, from before the clock was reset, happened)
 * — is superseded as the move narration is: struck, and flagged
 * `burnSuperseded` so the recent-narration ring, the rolling summary and the
 * session recap leave it out (a summary already made from it is dropped
 * first — issue #345 AA24); and what its sidecar wrote is retracted by its
 * narration id (retractSupersededNarrations). It stood as live fiction with
 * binding truths, and the clock's next trigger fired a second vignette for
 * the same clock (issue #338 D8). The struck card names the resolution
 * whose upgrade struck it (`supersededFor`): an X-Card on that upgrade's
 * re-narration takes it too (issue #347 D2). Canonical GM. Never throws.
 *
 * @param {Array<Object>} clocks — advanced-clock entries whose trigger the reversal undid
 * @param {"burn"|"improve"} kind
 * @param {string|null} [resolutionId] — the resolution upgraded
 */
async function supersedeTriggerVignettes(clocks, kind, resolutionId = null) {
  if (!clocks?.length) return;
  try {
    const { isCanonicalGM } = await import("../multiplayer/gmGate.js");
    if (!isCanonicalGM()) return;
    const { vignetteClockId, triggerVignetteInFlight, noteRewindDuringVignette } = await import("../clocks/payThePriceClocks.js");
    const clockIds = new Set(clocks.map(vignetteClockId).filter(Boolean));
    if (!clockIds.size) return;
    const sessionId = globalThis.game?.settings?.get?.(MODULE_ID, "campaignState")?.currentSessionId ?? null;
    const newestFirst = [...allMessages()].reverse();
    const cards = [];
    for (const clockId of clockIds) {
      // Its vignette is still being written: it is narrated only while the
      // clock is full, so it drops itself — and the newest card of the clock
      // is an earlier trigger's, which happened (TRIGGER-VIGNETTE-LATE-POST).
      // One whose card is on its way strikes itself once posted, with this
      // upgrade's note (TRIGGER-VIGNETTE-POST-WINDOW).
      if (triggerVignetteInFlight(clockId)) {
        noteRewindDuringVignette(clockId, { kind, resolutionId });
        continue;
      }
      const card = newestFirst.find(m => {
        const f = m?.flags?.[MODULE_ID];
        if (f?.clockVignetteCard !== true || f.narratorCard !== true || f.clockId !== clockId
          || (f.sessionId ?? null) !== sessionId || f.xCarded === true) return false;
        // Live — or struck by its own post-time check before this upgrade's
        // name reached it: it takes the name (supersededFor, issue #347 D2).
        return f.burnSuperseded !== true || (f.lateStruck === true && !f.supersededFor);
      });
      if (card) cards.push(card);
    }
    await strikeTriggerVignetteCards(cards, kind, resolutionId);
  } catch (err) {
    console.warn(`${MODULE_ID} | ${kind}: superseding a rewound clock's vignette failed:`, err?.message ?? err);
  }
}

/**
 * Strike trigger vignette cards a rewind undid — supersedeTriggerVignettes'
 * strike, and the vignette post site's own after a rewind landed during its
 * card's creation (payThePriceClocks.js, TRIGGER-VIGNETTE-POST-WINDOW): a
 * rolling summary made from them dropped first (issue #345 AA24), each card
 * flagged `burnSuperseded` (naming the upgraded resolution, `supersededFor`,
 * when known — else marked `lateStruck` for the upgrade to name), its prose
 * struck, and what its sidecar wrote retracted. Canonical GM. Never throws.
 *
 * @param {Object[]} cards — ChatMessage documents
 * @param {"burn"|"improve"} kind
 * @param {string|null} [resolutionId] — the resolution upgraded, when known
 * @returns {Promise<void>}
 */
export async function strikeTriggerVignetteCards(cards, kind, resolutionId = null) {
  const list = (Array.isArray(cards) ? cards : []).filter(Boolean);
  if (!list.length) return;
  try {
    const { isCanonicalGM } = await import("../multiplayer/gmGate.js");
    if (!isCanonicalGM()) return;
    // A rolling summary made from them goes first, while they are still in
    // memory (issue #345 AA24 — the move narration's supersede does the same).
    await import("../narration/narrator.js")
      .then(({ dropSummaryOfSupersededCards }) => dropSummaryOfSupersededCards(list))
      .catch(err => console.warn(`${MODULE_ID} | ${kind}: the rolling summary of a rewound clock's vignette could not be dropped:`, err?.message ?? err));
    const narrationIds = [];
    for (const card of list) {
      await card.update({
        [`flags.${MODULE_ID}.burnSuperseded`]: true,
        ...(resolutionId ? { [`flags.${MODULE_ID}.supersededFor`]: resolutionId } : { [`flags.${MODULE_ID}.lateStruck`]: true }),
        content: supersededVignetteContent(card.content, kind),
      }).catch(err => console.warn(`${MODULE_ID} | ${kind}: the rewound clock's vignette ${card.id} could not be struck:`, err?.message ?? err));
      const narrationId = card.flags?.[MODULE_ID]?.narrationId;
      if (typeof narrationId === "string" && narrationId) narrationIds.push(narrationId);
    }
    await retractSupersededNarrations(narrationIds, { label: `${kind}: a rewound clock's vignette` });
  } catch (err) {
    console.warn(`${MODULE_ID} | ${kind}: striking a rewound clock's vignette failed:`, err?.message ?? err);
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// The move's choice cards (issue #311 P03)
// ─────────────────────────────────────────────────────────────────────────────

const allMessages = () => globalThis.game?.messages?.contents ?? [];

/** A resolution's move card — the one carrying its Burn / Improve. */
function moveCardFor(resolutionId) {
  if (!resolutionId) return null;
  return allMessages().find(m => {
    const f = m?.flags?.[MODULE_ID];
    return f?.moveResolution === true && f.resolutionId === resolutionId;
  }) ?? null;
}

/** The choice cards of a resolution's own outcome — not an upgrade's, not one already retired. */
function outcomeChoiceCards(resolutionId) {
  if (!resolutionId) return [];
  return allMessages().filter(m => {
    const f = m?.flags?.[MODULE_ID];
    return f?.sufferCard === true && f.sufferPrompt && f.resolutionId === resolutionId
      && f.upgraded !== true && f.superseded !== true;
  });
}

const chosen = (f) => f.resolved === true || (Array.isArray(f.pickedIndices) && f.pickedIndices.length > 0);

/**
 * True when the move's consequence was chosen: a choice card of its outcome is
 * resolved, or has a pick. Both upgrades are then closed — what the choice
 * applied is not undone, and the upgraded outcome's choice would stack on it.
 *
 * @param {string|null} resolutionId
 * @returns {boolean}
 */
export function consequenceChosen(resolutionId) {
  return outcomeChoiceCards(resolutionId).some(m => chosen(m.flags[MODULE_ID]));
}

/**
 * Which upgrade replaced a resolution's result — its move card's claimed burn
 * or improvement — or null. A pick on a choice card of the superseded outcome
 * is then refused (sufferCard.js), whether or not the card was retired.
 *
 * @param {string|null} resolutionId
 * @returns {"burn"|"improve"|null}
 */
export function upgradeKindFor(resolutionId) {
  const f = moveCardFor(resolutionId)?.flags?.[MODULE_ID];
  return f?.burn?.consumed ? "burn" : f?.improve?.consumed ? "improve" : null;
}

/**
 * Whether a resolution's move card still offers Burn Momentum or Improve
 * Result: offered, neither used, not closed by a chosen consequence
 * (`choiceMade`, consequenceChosen) or by its roller's later move
 * (`laterMove`, laterMoveFollows — issue #326 D4). null while the move card
 * is not posted: the pipeline pays a miss's Pay the Price before it posts
 * the card. A follow-up that is the roller's next move — the resist roll a
 * price's harm owes — says to take them first while this holds (issue #330
 * D2's hint; issue #336 Y18).
 *
 * @param {string|null} resolutionId
 * @returns {boolean|null}
 */
export function upgradeOpenFor(resolutionId) {
  const card = moveCardFor(resolutionId);
  const f    = card?.flags?.[MODULE_ID];
  if (!f) return null;
  if (f.burn?.consumed || f.improve?.consumed) return false;
  const open = (state, offered) => !!(state?.[offered] && !state.choiceMade && !state.laterMove);
  if (!open(f.burn, "canBurn") && !open(f.improve, "canImprove")) return false;
  return !consequenceChosen(resolutionId) && !laterMoveFollows(card);
}

/**
 * The move card's open affordances are closed once its consequence is chosen:
 * Burn / Improve stamped (`choiceMade`) so the buttons say so — consequenceChosen
 * is the check the GM handlers make — and, on an Explore a Waypoint match, the
 * alternative the match offered (Make a Discovery / Confront Chaos) marked
 * taken by the ordinary reward (`waypointRewardClaimed: "ordinary"`): the rule
 * offers it *instead* of the ordinary choice, and it stacked on top (issue
 * #316 T06). Best effort.
 *
 * @param {string|null} resolutionId
 */
export async function closeUpgradesForChoice(resolutionId) {
  const card = moveCardFor(resolutionId);
  const f    = card?.flags?.[MODULE_ID];
  if (!f) return;
  const update = Object.fromEntries(["burn", "improve"]
    .filter(k => f[k] && !f[k].consumed && !f[k].choiceMade)
    .map(k => [`flags.${MODULE_ID}.${k}.choiceMade`, true]));
  if (f.waypointOracleCard && !f.waypointRewardClaimed) update[`flags.${MODULE_ID}.waypointRewardClaimed`] = "ordinary";
  if (!Object.keys(update).length) return;
  await card.update(update)
    .catch(err => console.warn(`${MODULE_ID} | move card ${card.id}: closing its upgrades failed:`, err?.message ?? err));
}

/**
 * A choice that closed a move card's upgrades was handed back: a resist roll's
 * press the pipeline did not roll puts its card back live (cardActions.js
 * releaseSourceCard, issue #347 AB06), so no consequence of the move is chosen
 * now — its Burn Momentum / Improve Result open again (`choiceMade` cleared;
 * issue #347 RESIST-BURN-STAYS-CLOSED). Not while another choice card of the
 * move is chosen, nor once an upgrade was used; a later move's close
 * (`laterMove`) stands. Best effort.
 *
 * @param {string|null} resolutionId
 */
export async function reopenUpgradesForUndoneChoice(resolutionId) {
  if (!resolutionId || consequenceChosen(resolutionId)) return;
  const card = moveCardFor(resolutionId);
  const f    = card?.flags?.[MODULE_ID];
  if (!f || f.burn?.consumed || f.improve?.consumed) return;
  const update = Object.fromEntries(["burn", "improve"]
    .filter(k => f[k]?.choiceMade === true)
    .map(k => [`flags.${MODULE_ID}.${k}.choiceMade`, false]));
  if (!Object.keys(update).length) return;
  await card.update(update)
    .catch(err => console.warn(`${MODULE_ID} | move card ${card.id}: reopening its upgrades failed:`, err?.message ?? err));
}

// The PC whose move a move card records — its roller.
const cardRoller = (f) => f?.actorId ?? f?.burn?.actorId ?? f?.improve?.actorId ?? null;

/**
 * An upgrade belongs to the move being made (issue #326 D4): "you must burn
 * momentum before applying any other effects of the move". Once a roller's
 * next move has resolved, the Burn Momentum / Improve Result still open on
 * their earlier move cards are closed (`laterMove`), so the buttons say so —
 * an old card's 🔥 burned momentum at its CURRENT value, swapped the old
 * outcome's effects in after the fact and re-narrated a past beat as the
 * scene's latest. Canonical GM, after the new move's persist. Best effort:
 * the GM handlers also refuse a card a later move has followed
 * (laterMoveFollows), whether or not it was stamped.
 *
 * @param {string|null} actorId — the roller of the move just resolved
 * @param {string|null} resolutionId — that move's resolution (its card stays open)
 */
export async function closeUpgradesForLaterMove(actorId, resolutionId) {
  if (!actorId) return;
  for (const card of allMessages()) {
    const f = card?.flags?.[MODULE_ID];
    if (f?.moveResolution !== true || f.resolutionId === resolutionId || cardRoller(f) !== actorId) continue;
    const update = Object.fromEntries(["burn", "improve"]
      .filter(k => f[k] && !f[k].consumed && !f[k].laterMove)
      .map(k => [`flags.${MODULE_ID}.${k}.laterMove`, true]));
    if (!Object.keys(update).length) continue;
    await card.update(update)
      .catch(err => console.warn(`${MODULE_ID} | move card ${card.id}: closing its upgrades after a later move failed:`, err?.message ?? err));
  }
}

/**
 * True when the roller of a move card has a later move card — the card's
 * upgrades are closed (issue #326 D4). The GM handlers' check, for a card
 * closeUpgradesForLaterMove never stamped (posted before it, or a refused
 * stamp).
 *
 * @param {ChatMessage} message — the move card
 * @returns {boolean}
 */
export function laterMoveFollows(message) {
  const f = message?.flags?.[MODULE_ID];
  const roller = cardRoller(f);
  if (!roller || !message?.id) return false;
  const all = allMessages();
  const at = all.findIndex(m => m?.id === message.id);
  if (at < 0) return false;
  return all.slice(at + 1).some(m => {
    const g = m?.flags?.[MODULE_ID];
    return g?.moveResolution === true && g.resolutionId !== f.resolutionId && cardRoller(g) === roller;
  });
}

// Why a choice card was retired, by what replaced the choice.
const RETIRED_REASON = {
  burn:      "The result changed — momentum was burned — so this choice no longer applies.",
  improve:   "The result changed — the result was improved — so this choice no longer applies.",
  discovery: "The match's alternative was taken instead — Make a Discovery — so this choice no longer applies.",
  chaos:     "The match's alternative was taken instead — Confront Chaos — so this choice no longer applies.",
};

/**
 * Retire a pending choice card: resolved and superseded, so its buttons go —
 * its outcome was replaced by an upgrade, or (an Explore a Waypoint match) the
 * match's alternative was taken instead of it. Best effort — a pick that
 * reaches it anyway is refused (upgradeKindFor; sufferCard.js).
 *
 * @param {ChatMessage} message
 * @param {"burn"|"improve"|"discovery"|"chaos"} kind
 */
export async function retireChoiceCard(message, kind) {
  await message.update({
    [`flags.${MODULE_ID}.resolved`]:   true,
    [`flags.${MODULE_ID}.superseded`]: true,
    // What retired it: a waypoint's alternative that is then not rolled
    // brings back the cards it retired (reopenRetiredChoiceCards).
    [`flags.${MODULE_ID}.retiredBy`]:  kind,
    content: `<div class="sf-card sf-suffer-choice-card sf-suffer-resolved">`
      + `<div class="sf-card-header">◈ Consequence superseded</div>`
      + `<div class="sf-card-body"><p>${RETIRED_REASON[kind] ?? "The result changed — it was upgraded — so this choice no longer applies."} Nothing on it was applied.</p></div></div>`,
  }).catch(err => console.warn(`${MODULE_ID} | ${kind}: retiring choice card ${message.id} failed:`, err?.message ?? err));
}

/**
 * Bring back the choice cards of a resolution's outcome that `kind` retired —
 * live again, their buttons rendered (sufferCard.js reopenSufferCard). A
 * waypoint match's alternative retires the ordinary reward's card when it is
 * pressed; when the pipeline then does not roll the alternative, both rewards
 * were lost (issue #347 AB06). Best effort.
 *
 * @param {string|null} resolutionId
 * @param {"discovery"|"chaos"|"burn"|"improve"} kind
 * @returns {Promise<number>} the cards brought back
 */
export async function reopenRetiredChoiceCards(resolutionId, kind) {
  if (!resolutionId || !kind) return 0;
  const { reopenSufferCard } = await import("./sufferCard.js");
  let reopened = 0;
  for (const card of allMessages()) {
    const f = card?.flags?.[MODULE_ID];
    if (f?.sufferCard !== true || f.resolutionId !== resolutionId || f.superseded !== true || f.retiredBy !== kind) continue;
    if (await reopenSufferCard(card).catch(err => {
      console.warn(`${MODULE_ID} | bringing back choice card ${card.id} failed:`, err?.message ?? err);
      return false;
    })) reopened += 1;
  }
  return reopened;
}

/**
 * Retire every pending (unchosen) choice card of a resolution's own outcome —
 * after an upgrade's claim (reconcileChoices), or once a waypoint match's
 * alternative is taken (cardActions.js applyWaypointOraclePick, issue #316
 * T06). `keepPriceCards`: an upgrade that keeps the price the original
 * already rolled keeps the cards that price posted (`priceCard`) — see
 * keepPriceCard.
 *
 * @param {string|null} resolutionId
 * @param {"burn"|"improve"|"discovery"|"chaos"} kind
 * @param {{ keepPriceCards?: boolean }} [opts]
 * @returns {Promise<number>} the price's cards kept
 */
export async function retireOutcomeChoiceCards(resolutionId, kind, { keepPriceCards = false } = {}) {
  let kept = 0;
  for (const card of outcomeChoiceCards(resolutionId)) {
    const f = card.flags[MODULE_ID];
    if (chosen(f)) continue;
    if (keepPriceCards && f.priceCard === true) {
      if (await keepPriceCard(card)) kept += 1;
      continue;
    }
    await retireChoiceCard(card, kind);
  }
  return kept;
}

/**
 * Keep a card the move's kept Pay the Price posted — the resist roll its harm
 * owes, a redirected loss's picker: the upgraded result pays that price too
 * (issue #313), so the card is the upgraded outcome's now (`upgraded` — a
 * pick on it is not refused as the superseded outcome's, and it closes
 * nothing), and a "burn or improve first" hint it carried goes — the upgrade
 * is spent. The burn used to retire it with the superseded outcome's cards,
 * and the roll the kept harm owes was never made (issue #335 Y09). The keep
 * rides its executor opts too (`executorOpts.upgraded`), so a card its pick
 * posts — the resist roll a redirected loss's Endure Harm owes at 0 — is the
 * upgraded outcome's as well (sufferCard.js postSufferChoiceCard): posted
 * after the burn, it was refused as the superseded outcome's and the owed
 * roll lost (issue #342 Z47). Best effort: a refused update leaves the card
 * as it was.
 *
 * @param {ChatMessage} card
 * @returns {Promise<boolean>} whether the card was kept
 */
async function keepPriceCard(card) {
  const f = card.flags[MODULE_ID];
  const update = {
    [`flags.${MODULE_ID}.upgraded`]:              true,
    [`flags.${MODULE_ID}.executorOpts.upgraded`]: true,
  };
  if (f.sufferPrompt?.hint) {
    update[`flags.${MODULE_ID}.sufferPrompt.hint`] = null;
    try {
      const { renderSufferCard } = await import("./sufferCard.js");
      const actor = f.actorId ? (globalThis.game?.actors?.get?.(f.actorId) ?? null) : null;
      update.content = renderSufferCard({ ...f.sufferPrompt, hint: null }, actor, f.pickedIndices ?? [], undefined, f.notApplied ?? [], f.pickedSuffers ?? []);
    } catch (err) {
      console.debug(`${MODULE_ID} | kept price card ${card.id}: its hint stays —`, err?.message ?? err);
    }
  }
  try {
    await card.update(update);
    return true;
  } catch (err) {
    console.warn(`${MODULE_ID} | the kept price's card ${card.id} could not be kept for the upgraded result:`, err?.message ?? err);
    return false;
  }
}

/**
 * After an upgrade's claim: retire the superseded outcome's pending choice
 * cards, then post the upgraded outcome's own choice, once — for the move's
 * vehicle, companion and fight (`targets`, as persistResolution gives its
 * card). A card that cannot be posted goes onto `failures`. `priceStands`:
 * the upgraded outcome pays the price the original already rolled (a burn
 * from a miss to a weak hit of Battle or Clash, issue #313) — its cards are
 * kept, not retired (issue #335 Y09).
 *
 * @param {Object} args
 * @param {string|null} args.resolutionId
 * @param {"burn"|"improve"} args.kind
 * @param {Actor} args.actor — the upgrading PC
 * @param {Object|null} args.sufferPrompt — the upgraded outcome's
 * @param {string|null} args.moveId
 * @param {Object} [args.targets]
 * @param {Array<Object>} args.failures
 * @param {boolean} [args.priceStands]
 * @returns {Promise<{ kept: number }>} the kept price's cards still owed
 */
export async function reconcileChoices({ resolutionId, kind, actor, sufferPrompt, moveId, targets = {}, failures, priceStands = false }) {
  const kept = await retireOutcomeChoiceCards(resolutionId, kind, { keepPriceCards: priceStands });
  if (sufferPrompt && actor) {
    await applyUpgradeStep({
      effect: "choiceCard", pcId: actor.id, sufferPrompt, moveId: moveId ?? null, resolutionId: resolutionId ?? null,
      executorOpts: { isMiss: false, isMissWithMatch: false, ...(targets ?? {}) },
    }, failures);
  }
  return { kept };
}


// ─────────────────────────────────────────────────────────────────────────────
// The upgraded outcome's other effects, its re-narration and its card note
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the pipeline's applier (index.js applyUpgradedOutcomeEffects, the
 * upgrade hooks' `applyEffects`) for what the upgraded outcome adds over the
 * recorded original — the fight's progress and position, the expedition's
 * progress, a legacy mark, the companion's health, an arrival, a lost fight's
 * payoff (UPGRADE-PIPELINE-EFFECTS). Never throws: a failure is a line for
 * the card.
 *
 * @param {Object} args
 * @param {Function|null} args.applyEffects — the injected applier
 * @param {Object} args.resolution — the upgraded outcome's resolution
 * @param {Object} args.state — the card's `burn` / `improve` flag: originalOutcome,
 *   originalConsequences, resolutionId, targets (the move's fight, vehicle, companion), move
 *   (its target, id and ranks)
 * @param {Actor} args.actor — the upgrading PC
 * @param {Object} args.campaignState — the upgrade's working copy
 * @param {"burn"|"improve"} args.kind
 * @returns {Promise<{ applied: string[], notApplied: string[] }>}
 */
export async function applyUpgradedOutcomeEffects({ applyEffects, resolution, state, actor, campaignState, kind }) {
  if (typeof applyEffects !== "function") {
    console.debug(`${MODULE_ID} | ${kind}: no effects applier registered — the upgraded outcome's other effects are not applied.`);
    return { applied: [], notApplied: [] };
  }
  try {
    const res = await applyEffects({
      resolution, actor, campaignState,
      against: {
        outcome:      state.originalOutcome,
        consequences: state.originalConsequences ?? {},
        resolutionId: state.resolutionId ?? null,
      },
      interpretation: { ...(state.move ?? {}), companionItemId: state.targets?.companionItemId ?? null },
      targets: state.targets ?? {},
    });
    return { applied: res?.applied ?? [], notApplied: res?.notApplied ?? [] };
  } catch (err) {
    console.warn(`${MODULE_ID} | ${kind}: the upgraded outcome's effects failed:`, err?.message ?? err);
    return { applied: [], notApplied: ["the upgraded result's other effects"] };
  }
}

/**
 * Re-narrate an upgraded outcome. The narrator gets the upgrade's working
 * copy of the campaign and the upgrading PC as the speaker (credit the
 * roller — the first PC used to be described). Its sidecar saves its own
 * ledger fields; the upgrade's effects were saved by their applier. (A
 * log-only persistResolution followed, to feed the session move log nothing
 * read — retired with it, issue #326 W58.) Best effort: without a narrator
 * (no key, narration off) the move card is still updated.
 *
 * @param {Object} args
 * @param {Object} args.resolution — the upgraded outcome's resolution
 * @param {Object} args.campaignState — the upgrade's working copy
 * @param {string|null} args.speakerActorId — the upgrading PC
 * @param {Function|null} args.narrate — narrateResolution
 * @param {"burn"|"improve"} args.kind
 * @param {string|null} [args.upgradeOf] — the original resolution's id
 */
export async function renarrateUpgrade({ resolution, campaignState, speakerActorId, narrate, kind, upgradeOf = null }) {
  if (typeof narrate !== "function") {
    console.warn(`${MODULE_ID} | ${kind}: no narrator registered — the upgraded outcome is not re-narrated.`);
    return;
  }
  // `upgradeOf` names the resolution upgraded: a Batch Mode round entry not
  // yet narrated takes the upgraded resolution instead of a narration of its
  // own — the round narrates once, with the final outcomes (issue #340).
  await narrate(resolution, campaignState, { speakerActorId, upgradeOf, kind });
}

/**
 * The line an upgraded move card carries for the outcome's other effects:
 * what was applied beyond the meters, what was not, and a Pay the Price kept
 * because the upgraded outcome pays it too — with the roll or choice its
 * card still asks for, when it kept one (`priceCardsKept`, issue #335 Y09).
 *
 * @param {{ applied?: string[], notApplied?: string[], priceStands?: boolean, priceCardsKept?: number }} [effects]
 * @returns {string} HTML; "" when there is nothing to say
 */
export function effectsNoteHtml({ applied = [], notApplied = [], priceStands = false, priceCardsKept = 0 } = {}) {
  const parts = [];
  if (applied.length)    parts.push(`Also applied: ${applied.map(escapeHtml).join("; ")}.`);
  if (notApplied.length) parts.push(`Not applied: ${notApplied.map(escapeHtml).join("; ")}.`);
  if (priceStands)       parts.push(priceCardsKept > 0
    ? "The Pay the Price already rolled stands — this result pays it too, and the roll or choice its card asks for is still owed."
    : "The Pay the Price already rolled stands — this result pays it too.");
  return parts.length ? `<div class="sf-move-effect sf-upgrade-effects">${parts.join(" ")}</div>` : "";
}
