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
 *     PC-meter losses its route landed (the receipts index.js ptpMeterReceipts
 *     records — a harm's overflow into momentum is one of its own, issue #314
 *     Q02). Vehicle and companion routes, and impacts an executor marked, are
 *     not reversed (decisions.md → "Burn Momentum reverses Pay-the-Price side
 *     effects").
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
 * runPayoffStep → retryUpgradeStep), never thrown past the claimed card. A
 * step of several writes (`vowClocks`) that lands in part fails with the
 * entries still owed, and the step pushed carries those alone — a Retry must
 * not rewind the clocks that landed again (issue #314 Q05).
 *
 * @param {{ effect: "meters", pcId: string, changes: Object }
 *   | { effect: "tensionClocks", clocks: Array<{ _id: string, name?: string }> }
 *   | { effect: "vowClocks", entries: Array<{ actorId: string, itemId: string, name?: string }> }
 *   | { effect: "choiceCard", pcId: string, sufferPrompt: Object, executorOpts: Object, moveId: string|null, resolutionId: string|null }} step
 * @param {Array<Object>} failures
 * @returns {Promise<boolean>} whether it landed
 */
export async function applyUpgradeStep(step, failures) {
  try {
    const res = await runUpgradeStep(step);
    if (res.ok) return true;
    failures.push({ ...step, ...(res.entries ? { entries: res.entries } : {}), step: "upgrade", reason: res.reason ?? "refused" });
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
      // Each Item's rewind stands alone: the ones the world refused are the
      // step still owed (issue #314 Q05 — the whole step was queued, and the
      // Retry rewound the landed clocks once more).
      const failed = await revertVowClocksForBurn(step.entries);
      return failed.length ? { ok: false, reason: "refused", entries: failed } : { ok: true };
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
      if (!Array.isArray(s.entries) || !s.entries.every(e => typeof e?.actorId === "string" && typeof e?.itemId === "string")) {
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
  return (await applyUpgradeStep(s, failures)) ? { ok: true } : { ok: false, ...failures[0] };
}

/** What a Retry needs of a failed upgrade step. */
export function upgradeStepRecord(f) {
  return {
    step: "upgrade", effect: f.effect,
    ...(f.effect === "meters"        ? { pcId: f.pcId ?? null, changes: f.changes ?? {} } : {}),
    ...(f.effect === "tensionClocks" ? { clocks: (f.clocks ?? []).map(c => ({ _id: c._id, name: c.name ?? null })) } : {}),
    ...(f.effect === "vowClocks"     ? { entries: (f.entries ?? []).map(e => ({ actorId: e.actorId, itemId: e.itemId, name: e.name ?? null })) } : {}),
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

const REVERSAL_CARDS = {
  burn:    { title: "⏰ Burn reversal",    lead: "Momentum burned — the Price reverts:", flag: "burnReversal" },
  improve: { title: "⏰ Improve reversal", lead: "Result improved — the Price reverts:", flag: "improveReversal" },
};

/**
 * Revert the Pay the Price side effects of the superseded miss: rewind each
 * clock it advanced (tension clocks, vow countdown clocks) by one segment and
 * refund the PC-meter losses its route landed. A burn resets momentum, which
 * already undoes a momentum loss, so a burn refunds none; an improvement keeps
 * the momentum the PC has, so it refunds that too. Posts a card listing what
 * was unwound; a write the world refuses goes onto `failures`
 * (applyUpgradeStep).
 *
 * @param {Object|null} ptpReversals — the card's `ptpReversals`:
 *   `{ clocksAdvanced, sufferMeterDeltas }` (a card from before issue #314
 *   carries one `sufferMeterDelta`)
 * @param {Actor|null} actor — the upgrading PC (a receipt's own PC first)
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
  if (entries.length) {
    // The rewinds that landed are reported; the refused ones are on the step
    // the GMs retry (issue #314 Q05).
    const at = failures.length;
    const ok = await applyUpgradeStep({ effect: "vowClocks", entries }, failures);
    const owed = new Set(ok ? [] : (failures[at]?.entries ?? entries).map(e => e.itemId));
    for (const v of entries) if (!owed.has(v.itemId)) reverted.push(`${v.name} clock rewound`);
  }

  // 2. Refund the route's PC-meter losses — each receipt is what landed (the
  // move that ran, a meter's before and after), never the table's annotation
  // (issue #311 P04). A harm's overflow into momentum is a receipt of its own
  // (issue #314 Q02); a burn's reset replaces momentum, so a burn refunds none.
  // One write per PC.
  const byPc = new Map();
  for (const delta of sufferMeterDeltas(ptpReversals)) {
    if (!(delta.amount > 0) || (kind === "burn" && delta.meterKey === "momentum")) continue;
    const refundTo = (delta.actorId ? game.actors?.get?.(delta.actorId) : null) ?? actor;
    if (!refundTo) continue;
    const changes = byPc.get(refundTo) ?? {};
    changes[delta.meterKey] = (changes[delta.meterKey] ?? 0) + Number(delta.amount);
    byPc.set(refundTo, changes);
  }
  for (const [refundTo, changes] of byPc) {
    if (await applyUpgradeStep({ effect: "meters", pcId: refundTo.id, changes }, failures)) {
      for (const [meterKey, amount] of Object.entries(changes)) reverted.push(`${meterKey} +${amount} refunded`);
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
    content: `<div class="sf-card sf-suffer-choice-card sf-suffer-resolved">`
      + `<div class="sf-card-header">◈ Consequence superseded</div>`
      + `<div class="sf-card-body"><p>${RETIRED_REASON[kind] ?? "The result changed — it was upgraded — so this choice no longer applies."} Nothing on it was applied.</p></div></div>`,
  }).catch(err => console.warn(`${MODULE_ID} | ${kind}: retiring choice card ${message.id} failed:`, err?.message ?? err));
}

/**
 * Retire every pending (unchosen) choice card of a resolution's own outcome —
 * after an upgrade's claim (reconcileChoices), or once a waypoint match's
 * alternative is taken (cardActions.js applyWaypointOraclePick, issue #316
 * T06).
 *
 * @param {string|null} resolutionId
 * @param {"burn"|"improve"|"discovery"|"chaos"} kind
 */
export async function retireOutcomeChoiceCards(resolutionId, kind) {
  for (const card of outcomeChoiceCards(resolutionId)) {
    if (!chosen(card.flags[MODULE_ID])) await retireChoiceCard(card, kind);
  }
}

/**
 * After an upgrade's claim: retire the superseded outcome's pending choice
 * cards, then post the upgraded outcome's own choice, once — for the move's
 * vehicle, companion and fight (`targets`, as persistResolution gives its
 * card). A card that cannot be posted goes onto `failures`.
 *
 * @param {Object} args
 * @param {string|null} args.resolutionId
 * @param {"burn"|"improve"} args.kind
 * @param {Actor} args.actor — the upgrading PC
 * @param {Object|null} args.sufferPrompt — the upgraded outcome's
 * @param {string|null} args.moveId
 * @param {Object} [args.targets]
 * @param {Array<Object>} args.failures
 */
export async function reconcileChoices({ resolutionId, kind, actor, sufferPrompt, moveId, targets = {}, failures }) {
  await retireOutcomeChoiceCards(resolutionId, kind);
  if (!sufferPrompt || !actor) return;
  await applyUpgradeStep({
    effect: "choiceCard", pcId: actor.id, sufferPrompt, moveId: moveId ?? null, resolutionId: resolutionId ?? null,
    executorOpts: { isMiss: false, isMissWithMatch: false, ...(targets ?? {}) },
  }, failures);
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
 * Re-narrate an upgraded outcome and log it. The narrator gets the upgrade's
 * working copy of the campaign and the upgrading PC as the speaker (credit
 * the roller — the first PC used to be described); then the resolution is
 * persisted log-only, its meters already applied, so it carries none —
 * persistResolution merges the working copy onto the store. Best effort:
 * without a narrator (no key, narration off) the move card is still updated.
 *
 * @param {Object} args
 * @param {Object} args.resolution — the upgraded outcome's resolution
 * @param {Object} args.campaignState — the upgrade's working copy
 * @param {string|null} args.speakerActorId — the upgrading PC
 * @param {Function|null} args.narrate — narrateResolution
 * @param {Function|null} args.persist — persistResolution
 * @param {"burn"|"improve"} args.kind
 */
export async function renarrateUpgrade({ resolution, campaignState, speakerActorId, narrate, persist, kind }) {
  if (typeof narrate !== "function") {
    console.warn(`${MODULE_ID} | ${kind}: no narrator registered — the upgraded outcome is not re-narrated.`);
    return;
  }
  await narrate(resolution, campaignState, { speakerActorId });
  if (typeof persist === "function" && globalThis.game?.user?.isGM) {
    const logOnly = { ...resolution, consequences: {
      momentumChange: 0, healthChange: 0, spiritChange: 0, supplyChange: 0, otherEffect: "", sufferMoveTriggered: null,
    } };
    await persist(logOnly, campaignState, speakerActorId).catch(err =>
      console.warn(`${MODULE_ID} | ${kind}: session-log persist failed:`, err?.message ?? err));
  }
}

/**
 * The line an upgraded move card carries for the outcome's other effects:
 * what was applied beyond the meters, what was not, and a Pay the Price kept
 * because the upgraded outcome pays it too.
 *
 * @param {{ applied?: string[], notApplied?: string[], priceStands?: boolean }} [effects]
 * @returns {string} HTML; "" when there is nothing to say
 */
export function effectsNoteHtml({ applied = [], notApplied = [], priceStands = false } = {}) {
  const parts = [];
  if (applied.length)    parts.push(`Also applied: ${applied.map(escapeHtml).join("; ")}.`);
  if (notApplied.length) parts.push(`Not applied: ${notApplied.map(escapeHtml).join("; ")}.`);
  if (priceStands)       parts.push("The Pay the Price already rolled stands — this result pays it too.");
  return parts.length ? `<div class="sf-move-effect sf-upgrade-effects">${parts.join(" ")}</div>` : "";
}
