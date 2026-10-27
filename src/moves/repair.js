/**
 * STARFORGED COMPANION
 * src/moves/repair.js
 *
 * Vehicle Repair point-spend dialog per play kit p. 7.
 *
 * Repair earns points per situation × outcome:
 *   At a facility: 5 (strong) / 3 (weak)
 *   In the field:  3 (strong) / 1 (weak)
 *   Under fire:    2 (strong) / 0 (weak)
 *
 * Optionally trade -1 supply for +1 extra point (max 3).
 *
 * Spend table:
 *   Clear battered impact on vehicle:        2 points
 *   Fix one broken module:                   2 points
 *   Take +1 integrity on a vehicle:          1 point
 *   Take +1 health for a mechanical comp.:   1 point
 *   Repair any other device:                 3 points
 *   Repair any other device with complication: 2 points
 *
 * This module is the follow-up affordance to the normal Repair move:
 * once a player has rolled Repair and seen the result, they invoke
 * `!repair` to allocate points. The integrity / battered spends mutate the
 * command vehicle through src/entities/ship.js — battered is read from the
 * canonical native system.debility.battered (isShipBattered) and cleared on
 * both stores (clearBattered); integrity lives on the ship flag record
 * (repairIntegrity clamps to integrityMax); the supply trade debits
 * the repairing player's PC. Companion health, "broken module" and "other
 * device" rows record the spend on the chat card only (no schema yet).
 *
 * Multiplayer: the dialog runs on the typing player's client (`!repair` is
 * routed to its author), but ship / other-actor writes need GM authority,
 * so Apply relays the allocation to the canonical GM via
 * requestGmAction("repair.apply") — applyRepairSpends is that handler, and
 * the card it posts reports what actually landed.
 */

import { applyMeterChanges, getActor, readCharacterSnapshot, invalidateActorCache } from "../character/actorBridge.js";
import { getCommandVehicleActorId, getShip, clearBattered, repairIntegrity, isShipBattered } from "../entities/ship.js";
import { requestGmAction }         from "../multiplayer/gmRelay.js";
import { resolveSpeakerActorId }   from "../multiplayer/speaker.js";
import { requesterOwnsActor }      from "./burnMomentum.js";

const MODULE_ID = "starforged-companion";

// Earned-points matrix: [situation][outcome]
const POINTS_TABLE = {
  facility:   { strong: 5, weak: 3 },
  field:      { strong: 3, weak: 1 },
  under_fire: { strong: 2, weak: 0 },
};

// Cost per spend kind.
const SPEND_COST = {
  clear_battered:   2,
  fix_module:       2,
  integrity:        1,
  companion_health: 1,
  other_device:     3,
  other_device_cx:  2,
};

// Max allocations per spend kind (the dialog's input bounds; re-enforced on
// the GM when the relayed allocation is applied).
const SPEND_MAX = {
  integrity:        6,
  clear_battered:   1,
  companion_health: 5,
  fix_module:       4,
  other_device:     4,
  other_device_cx:  4,
};

const MAX_EXTRA = 3;


// ─────────────────────────────────────────────────────────────────────────────
// Chat command dispatch
// ─────────────────────────────────────────────────────────────────────────────

export function isRepairCommand(message) {
  const text = message.content?.trim() ?? "";
  if (message.flags?.[MODULE_ID]?.repairCard) return false;
  return /^!repair(\s|$)/i.test(text);
}

export async function handleRepairCommand(message) {
  return openRepairDialog(message);
}

/**
 * The PC whose supply pays for Sacrifice Resources — the repairing player's
 * own character. Runs on the authoring client, so `game.user` IS the player
 * who typed `!repair`: honour a selected PC token (message.speaker), then the
 * user's bound character, then a PC they own (src/multiplayer/speaker.js).
 * Falls back to the campaign's first PC only when none of those resolve.
 *
 * @param {ChatMessage|Object|null} message the `!repair` message, if any
 * @returns {string|null} Actor id
 */
export function resolveRepairActorId(message = null) {
  let campaignState = null;
  try { campaignState = game.settings.get(MODULE_ID, "campaignState") ?? null; }
  catch (err) { console.debug?.(`${MODULE_ID} | repair: campaignState read failed:`, err?.message ?? err); }
  return resolveSpeakerActorId(
    { speaker: message?.speaker ?? null, author: game.user ?? null },
    campaignState,
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// Dialog
// ─────────────────────────────────────────────────────────────────────────────

export async function openRepairDialog(message = null) {
  const { DialogV2 } = foundry.applications.api;

  const content = `
    <form class="sf-repair-form">
      <p class="hint">Allocate Repair points per play kit p. 7. Points are
      earned by situation × outcome (see below); each spend has a fixed cost.</p>

      <fieldset>
        <legend>Roll context</legend>
        <label>
          <span>Situation</span>
          <select name="situation">
            <option value="facility">At a facility (5 / 3)</option>
            <option value="field" selected>In the field (3 / 1)</option>
            <option value="under_fire">Under fire (2 / 0)</option>
          </select>
        </label>
        <label>
          <span>Outcome</span>
          <select name="outcome">
            <option value="strong">Strong hit</option>
            <option value="weak">Weak hit</option>
          </select>
        </label>
        <label>
          <span>Extra points from Sacrifice Resources (−1 supply each, max 3)</span>
          <input type="number" name="extra" min="0" max="3" step="1" value="0">
        </label>
      </fieldset>

      <fieldset>
        <legend>Spends</legend>
        ${spendRow("integrity",        "+1 integrity on the command vehicle")}
        ${spendRow("clear_battered",   "Clear battered impact on the command vehicle")}
        ${spendRow("companion_health", "+1 health on a mechanical companion")}
        ${spendRow("fix_module",       "Fix one broken module (recorded only)")}
        ${spendRow("other_device",     "Repair any other device (recorded only)")}
        ${spendRow("other_device_cx",  "Repair other device with complication (recorded only)")}
      </fieldset>

      <p class="hint"><em>Points budget will be validated on Apply.</em></p>
    </form>
  `;

  await DialogV2.prompt({
    window:  { title: "Vehicle Repair — Allocate Points" },
    content,
    ok: {
      label:    "Apply",
      callback: async (_event, button) => {
        const form = button.form;
        if (!form) return;

        const spends = {};
        for (const kind of Object.keys(SPEND_COST)) {
          spends[kind] = intVal(form, `input[name="${kind}"]`);
        }
        const alloc = normaliseAllocation({
          situation: form.querySelector('select[name="situation"]')?.value,
          outcome:   form.querySelector('select[name="outcome"]')?.value,
          extra:     intVal(form, 'input[name="extra"]'),
          spends,
        });
        if (!alloc.ok) {
          ui.notifications?.warn(`Repair: ${alloc.reason}`);
          return;
        }

        const actorId = alloc.extra > 0 ? resolveRepairActorId(message) : null;
        // Traded points need the supply to pay for them (the GM re-checks):
        // say so here rather than relay a repair that cannot be paid.
        const supply = actorId ? currentSupply(getActor(actorId)) : null;
        if (supply !== null && supply < alloc.extra) {
          ui.notifications?.warn(`Repair: only ${supply} supply to trade — the ${alloc.extra} extra points need ${alloc.extra}.`);
          return;
        }
        await requestGmAction("repair.apply", {
          situation: alloc.situation,
          outcome:   alloc.outcome,
          earned:    alloc.earned,
          extra:     alloc.extra,
          spends:    alloc.spends,
          actorId,
        });
      },
    },
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// Spend application
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate and normalise a Repair allocation. Shared by the dialog (to warn
 * the player before sending) and the GM-side handler (which never trusts a
 * relayed payload): clamps every count to its bounds, re-derives the earned
 * points from the table, and rejects an over-budget allocation.
 *
 * @param {{ situation, outcome, extra, spends }} raw
 * @returns {{ ok: true, situation, outcome, extra, spends, earned, totalCost }
 *          | { ok: false, reason: string }}
 */
export function normaliseAllocation({ situation, outcome, extra, spends } = {}) {
  const base = POINTS_TABLE[situation]?.[outcome];
  if (base === undefined) {
    return { ok: false, reason: `unknown situation/outcome "${situation}" / "${outcome}".` };
  }
  const extraN = clamp(toInt(extra), 0, MAX_EXTRA);
  const clean  = {};
  let totalCost = 0;
  for (const kind of Object.keys(SPEND_COST)) {
    const n = clamp(toInt(spends?.[kind]), 0, SPEND_MAX[kind]);
    clean[kind] = n;
    totalCost  += n * SPEND_COST[kind];
  }
  const earned = base + extraN;
  if (totalCost > earned) {
    return {
      ok: false,
      reason: `${totalCost} points allocated but only ${earned} earned (${base} from situation + ${extraN} traded). Reduce spends or earn more supply.`,
    };
  }
  return { ok: true, situation, outcome, extra: extraN, spends: clean, earned, totalCost };
}

/**
 * gmRelay handler for "repair.apply" — runs on the canonical GM (locally when
 * the GM typed `!repair`, via the socket relay otherwise). Applies every
 * spend to its canonical store and posts the Repair card describing what
 * actually landed — never what was merely allocated.
 *
 * Order matters: battered is cleared BEFORE integrity, because a battered
 * vehicle cannot gain integrity (repairIntegrity refuses).
 *
 * @param {{ situation, outcome, earned, extra, spends, actorId }} payload
 * @param {{ requester?: User|null, requesterIsGM?: boolean }} [ctx]
 */
export async function applyRepairSpends(payload = {}, ctx = {}) {
  const alloc = normaliseAllocation(payload);
  if (!alloc.ok) {
    console.warn(`${MODULE_ID} | repair: rejected relayed allocation — ${alloc.reason}`);
    return;
  }
  const { extra, spends } = alloc;
  const actions = [];

  // 1. Sacrifice Resources — debit the repairing player's PC (payload.actorId,
  //    resolved on their own client), never the GM's game.user.character.
  //    The traded points exist only once their supply is paid, so the payment
  //    settles before any repair lands: a missing payer, another player's PC,
  //    too little supply or a failed debit repairs nothing (issue #300 F04 —
  //    the full allocation used to apply with a warning on the card).
  if (extra > 0) {
    const payment = await paySupplyTrade(payload.actorId, extra, ctx);
    if (!payment.paid) {
      await postRepairCard(alloc, [payment.line, "No repairs were applied — Repair again with a trade the supply covers."]);
      return;
    }
    actions.push(payment.line);
  }

  // 2 + 3. Command-vehicle spends — through the canonical ship record.
  if (spends.clear_battered > 0 || spends.integrity > 0) {
    actions.push(...await applyVehicleSpends(spends));
  }

  // 4. Companion +health. We don't have a picker; surface the spend
  //    as advisory so the player can manually apply via the Companion
  //    asset's track. Future enhancement: enumerate companions and let
  //    the player pick.
  if (spends.companion_health > 0) {
    actions.push(`+${spends.companion_health} health on a mechanical companion (apply manually via the Companion asset's track).`);
  }

  // 5. Modules / other devices — no schema; record only.
  if (spends.fix_module > 0) {
    actions.push(`Fixed ${spends.fix_module} broken module${spends.fix_module === 1 ? "" : "s"} (recorded only — no module schema yet).`);
  }
  if (spends.other_device > 0) {
    actions.push(`Repaired ${spends.other_device} other device${spends.other_device === 1 ? "" : "s"} (clean repair, recorded only).`);
  }
  if (spends.other_device_cx > 0) {
    actions.push(`Repaired ${spends.other_device_cx} other device${spends.other_device_cx === 1 ? "" : "s"} with complication (recorded only).`);
  }

  if (actions.length === 0) {
    actions.push("No spends allocated.");
  }
  await postRepairCard(alloc, actions);
}

/** The Repair card — what actually happened, never what was merely allocated. */
async function postRepairCard({ situation, outcome, totalCost, earned }, actions) {
  const lines = [
    `<strong>Repair</strong> — ${situation.replace("_", " ")} / ${outcome} hit · ${totalCost} of ${earned} points allocated`,
    `<ul>${actions.map(a => `<li>${a}</li>`).join("")}</ul>`,
  ];
  await ChatMessage.create({
    content: `<div class="sf-repair-card">${lines.join("")}</div>`,
    flags:   { [MODULE_ID]: { repairCard: true } },
  });
}

/** A PC's supply as the sheet holds it now (the snapshot cache dropped first). */
function currentSupply(actor) {
  if (!actor) return null;
  invalidateActorCache(actor.id);
  return readCharacterSnapshot(actor)?.meters?.supply ?? 0;
}

/**
 * Pay `extra` supply from the repairing PC, in full or not at all. Permission
 * is the REQUESTER's (ctx), not this GM client's: a player may only spend
 * their own PC's supply.
 *
 * @returns {Promise<{ paid: boolean, line: string }>} whether the whole trade
 *   was paid, and the card line describing what happened
 */
async function paySupplyTrade(actorId, extra, ctx) {
  const pts   = `${extra} repair point${extra === 1 ? "" : "s"}`;
  const actor = actorId ? getActor(actorId) : null;
  if (!actor) {
    console.warn(`${MODULE_ID} | repair: no character resolved to pay ${extra} supply (actorId=${actorId ?? "none"}).`);
    return { paid: false, line: `<em>No character found to pay ${extra} supply for +${pts}.</em>` };
  }
  const name = escapeHtml(actor.name);
  if (!requesterOwnsActor(actor, ctx)) {
    console.warn(`${MODULE_ID} | repair: requester ${ctx?.requesterId ?? "unknown"} does not own ${actor.name}; supply not debited.`);
    return { paid: false, line: `<em>${name}'s supply was not debited (not your character).</em>` };
  }
  const before = currentSupply(actor);
  if (before < extra) {
    return { paid: false, line: `<strong>${name}</strong> has only ${before} supply — the +${pts} traded need ${extra}; nothing was spent.` };
  }
  try {
    await applyMeterChanges(actor, { supply: -extra });
  } catch (err) {
    console.error(`${MODULE_ID} | repair: supply trade failed:`, err);
    return { paid: false, line: `<em>Supply trade failed for ${name} — see console; nothing was spent.</em>` };
  }
  const after = currentSupply(actor);
  const paid  = Math.max(0, before - after);
  if (paid < extra) {
    // The supply changed between the check and the debit: hand back what was taken.
    if (paid > 0) {
      await applyMeterChanges(actor, { supply: paid }).catch(err =>
        console.warn(`${MODULE_ID} | repair: refunding a partial supply payment failed:`, err?.message ?? err));
    }
    return { paid: false, line: `<em>${name}'s supply changed during the trade — nothing was spent.</em>` };
  }
  return { paid: true, line: `Sacrificed ${extra} supply from <strong>${name}</strong> (supply now ${after}) → +${pts}.` };
}

/**
 * Apply the clear-battered and integrity spends to the command vehicle.
 * Battered is read from the native system.debility.battered (canonical — the
 * starship sheet's toggle writes only it) and cleared on the native field and
 * the flag mirror together (clearBattered → updateShip); integrity is on the
 * ship flag record. Clear-battered first: a battered vehicle cannot gain
 * integrity.
 *
 * @returns {Promise<string[]>} card lines
 */
async function applyVehicleSpends(spends) {
  const out = [];
  const campaignState = game.settings.get(MODULE_ID, "campaignState") ?? {};
  const vehicleId     = getCommandVehicleActorId(campaignState);
  const ship          = vehicleId ? getShip(vehicleId) : null;
  if (!ship) {
    console.warn(`${MODULE_ID} | repair: no command vehicle record found — vehicle spends recorded only.`);
    if (spends.clear_battered > 0) out.push(`<em>No command vehicle found — battered-clear not applied.</em>`);
    if (spends.integrity > 0)      out.push(`<em>No command vehicle found — +${spends.integrity} integrity not applied.</em>`);
    return out;
  }
  const name = `<strong>${escapeHtml(ship.name ?? "the command vehicle")}</strong>`;
  // The native system.debility.battered is canonical (the starship sheet's
  // toggle writes only it) — never the flag mirror alone.
  let battered = isShipBattered(vehicleId);

  if (spends.clear_battered > 0) {
    if (!battered) {
      out.push(`${name} was not battered — nothing to clear.`);
    } else {
      try {
        await clearBattered(vehicleId);
        battered = false;
        out.push(`Cleared <strong>battered</strong> on ${name}.`);
      } catch (err) {
        console.error(`${MODULE_ID} | repair: clear-battered failed:`, err);
        out.push(`<em>Clearing battered on ${name} failed — see console.</em>`);
      }
    }
  }

  if (spends.integrity > 0) {
    if (battered) {
      // Rules: integrity can't be raised while battered. Skip the call so the
      // card states the reason rather than repairIntegrity warning silently.
      out.push(`${name} is battered — integrity not raised (clear battered first).`);
    } else {
      try {
        const before  = Number(getShip(vehicleId)?.integrity ?? 0);
        const updated = await repairIntegrity(vehicleId, spends.integrity);
        const after   = Number(updated?.integrity ?? before);
        const max     = Number(updated?.integrityMax ?? ship.integrityMax ?? 5);
        const gained  = after - before;
        if (gained < spends.integrity) {
          out.push(`+${gained} integrity on ${name} — integrity capped at ${max} (now ${after}).`);
        } else {
          out.push(`+${gained} integrity on ${name} (now ${after}/${max}).`);
        }
      } catch (err) {
        console.error(`${MODULE_ID} | repair: integrity update failed:`, err);
        out.push(`<em>Integrity update on ${name} failed — see console.</em>`);
      }
    }
  }
  return out;
}


// ─────────────────────────────────────────────────────────────────────────────
// Templating helpers
// ─────────────────────────────────────────────────────────────────────────────

function spendRow(name, label) {
  const cost = SPEND_COST[name];
  const max  = SPEND_MAX[name];
  return `
    <label class="row">
      <span>${escapeHtml(label)} <em>(${cost} pt)</em></span>
      <input type="number" name="${name}" min="0" max="${max}" step="1" value="0">
    </label>
  `;
}

function intVal(form, sel) {
  return toInt(form.querySelector(sel)?.value);
}

function toInt(v) {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? 0 : n;
}

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Exported for unit testing.
export const _internal = { POINTS_TABLE, SPEND_COST, SPEND_MAX };
