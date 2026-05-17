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
 * `!repair` to allocate points. Integrity / battered / companion-health
 * spends actually mutate the relevant Actor / Item; the "broken module"
 * and "other device" rows record the spend on the chat card only
 * (no schema for those yet).
 */

import { getCommandVehicleActor } from "./abilityScanner.js";
import { applyMeterChanges }       from "../character/actorBridge.js";

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


// ─────────────────────────────────────────────────────────────────────────────
// Chat command dispatch
// ─────────────────────────────────────────────────────────────────────────────

export function isRepairCommand(message) {
  const text = message.content?.trim() ?? "";
  if (message.flags?.[MODULE_ID]?.repairCard) return false;
  return /^!repair(\s|$)/i.test(text);
}

export async function handleRepairCommand(_message) {
  return openRepairDialog();
}


// ─────────────────────────────────────────────────────────────────────────────
// Dialog
// ─────────────────────────────────────────────────────────────────────────────

export async function openRepairDialog() {
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
        ${spendRow("integrity",        "+1 integrity on the command vehicle",                       1, 6)}
        ${spendRow("clear_battered",   "Clear battered impact on the command vehicle",              2, 1)}
        ${spendRow("companion_health", "+1 health on a mechanical companion",                       1, 5)}
        ${spendRow("fix_module",       "Fix one broken module (recorded only)",                     2, 4)}
        ${spendRow("other_device",     "Repair any other device (recorded only)",                   3, 4)}
        ${spendRow("other_device_cx",  "Repair other device with complication (recorded only)",     2, 4)}
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

        const situation = form.querySelector('select[name="situation"]')?.value;
        const outcome   = form.querySelector('select[name="outcome"]')?.value;
        const extra     = clamp(intVal(form, 'input[name="extra"]'), 0, 3);

        const spends = {};
        let totalCost = 0;
        for (const kind of Object.keys(SPEND_COST)) {
          const n = clamp(intVal(form, `input[name="${kind}"]`), 0, 10);
          spends[kind] = n;
          totalCost += n * SPEND_COST[kind];
        }

        const earned = (POINTS_TABLE[situation]?.[outcome] ?? 0) + extra;
        if (totalCost > earned) {
          ui.notifications?.warn(
            `Repair: ${totalCost} points allocated but only ${earned} earned (${POINTS_TABLE[situation]?.[outcome] ?? 0} from situation + ${extra} traded). Reduce spends or earn more supply.`,
          );
          return;
        }

        await applyRepairSpends({ situation, outcome, earned, extra, spends });
      },
    },
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// Spend application
// ─────────────────────────────────────────────────────────────────────────────

async function applyRepairSpends({ situation, outcome, earned, extra, spends }) {
  const isGM = game.user?.isGM;
  const lines = [];
  const actions = [];

  // 1. Sacrifice Resources for extra points (always applies if extra > 0).
  if (extra > 0) {
    if (isGM) {
      const actor = globalThis.game?.user?.character ?? null;
      if (actor) {
        try { await applyMeterChanges(actor, { supply: -extra }); }
        catch (err) { console.warn(`${MODULE_ID} | repair: supply trade failed:`, err); }
      }
    }
    actions.push(`Sacrificed ${extra} supply → +${extra} repair point${extra === 1 ? "" : "s"}.`);
  }

  // 2. Integrity (+N) on the command vehicle. Stored on a flag, not a meter,
  //    so we mutate the actor directly rather than going through the bridge.
  if (spends.integrity > 0) {
    const campaignState = game.settings.get(MODULE_ID, "campaignState") ?? {};
    const vehicle = getCommandVehicleActor(campaignState);
    if (vehicle && isGM) {
      try {
        const current = vehicle.flags?.[MODULE_ID]?.ship?.integrity ?? 0;
        await vehicle.update({ [`flags.${MODULE_ID}.ship.integrity`]: current + spends.integrity });
        actions.push(`+${spends.integrity} integrity on **${vehicle.name}** (now ${current + spends.integrity}).`);
      } catch (err) {
        console.warn(`${MODULE_ID} | repair: integrity update failed:`, err);
        actions.push(`<em>Integrity update failed — see console.</em>`);
      }
    } else if (!vehicle) {
      actions.push(`<em>No command vehicle found — +${spends.integrity} integrity recorded only.</em>`);
    } else {
      actions.push(`+${spends.integrity} integrity allocated (GM-only writes; ask the GM to apply).`);
    }
  }

  // 3. Clear battered debility on the command vehicle (one spend = one clear).
  if (spends.clear_battered > 0) {
    const campaignState = game.settings.get(MODULE_ID, "campaignState") ?? {};
    const vehicle = getCommandVehicleActor(campaignState);
    if (vehicle && isGM) {
      try {
        await vehicle.update({ "system.debility.battered": false });
        actions.push(`Cleared **battered** on **${vehicle.name}**.`);
      } catch (err) {
        console.warn(`${MODULE_ID} | repair: clear-battered failed:`, err);
      }
    } else if (!vehicle) {
      actions.push(`<em>No command vehicle found — battered-clear recorded only.</em>`);
    } else {
      actions.push(`Battered-clear allocated (GM-only writes).`);
    }
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

  lines.push(
    `<strong>Repair</strong> — ${situation.replace("_", " ")} / ${outcome} hit · ${earned} points allocated`,
  );
  if (actions.length === 0) {
    actions.push("No spends allocated.");
  }
  lines.push(`<ul>${actions.map(a => `<li>${a}</li>`).join("")}</ul>`);

  await ChatMessage.create({
    content: `<div class="sf-repair-card">${lines.join("")}</div>`,
    flags:   { [MODULE_ID]: { repairCard: true } },
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// Templating helpers
// ─────────────────────────────────────────────────────────────────────────────

function spendRow(name, label, cost, max) {
  return `
    <label class="row">
      <span>${escapeHtml(label)} <em>(${cost} pt)</em></span>
      <input type="number" name="${name}" min="0" max="${max}" step="1" value="0">
    </label>
  `;
}

function intVal(form, sel) {
  const v = form.querySelector(sel)?.value;
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
export const _internal = { POINTS_TABLE, SPEND_COST };
