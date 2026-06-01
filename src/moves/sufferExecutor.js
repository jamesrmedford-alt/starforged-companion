/**
 * STARFORGED COMPANION
 * src/moves/sufferExecutor.js — Suffer-move executors (F16 Phase C)
 *
 * Six handlers, one per suffer move, that turn the SufferChoiceDialog's
 * selection into actual sheet writes against the active character actor:
 *
 *   - loseMomentum
 *   - endureHarm
 *   - endureStress
 *   - sacrificeResources
 *   - companionTakesAHit
 *   - withstandDamage
 *
 * Each executor:
 *   1. Reads the actor's current meter value.
 *   2. Computes the new value with the magnitude delta.
 *   3. Calls applyMeterChanges() (actorBridge) — same write path that
 *      persistResolution uses for the explicit *Change fields, so the
 *      sheet update propagates the usual way (GM-only gate inherited
 *      per F16 Q4 / PERSIST-001).
 *   4. Handles the at-0 escalations the rulebook calls out:
 *        - Endure Harm at 0 health   → mark wounded/maimed; roll
 *          MORTAL_WOUND d100 if the trigger was a miss; otherwise just
 *          mark and surface.
 *        - Endure Stress at 0 spirit → mark shaken/traumatized; roll
 *          DESOLATION d100 on miss.
 *        - Withstand Damage at 0     → roll VEHICLE_DAMAGE d100; if
 *          this is the command vehicle, surface an Overcome
 *          Destruction prompt (Q2 — prompt, don't auto-fire).
 *        - Sacrifice Resources at 0  → mark unprepared; further losses
 *          recurse into the dialog as a redirect-to-another-suffer.
 *        - Lose Momentum at min (-6) → recurse into the dialog with
 *          the "redirect or clear progress" two-branch prompt (Q3).
 *        - Companion Takes a Hit at 0 + miss + match → companion
 *          destroyed; surface a Q2 manual-discard prompt (v1 does NOT
 *          delete the asset Item).
 *   5. Posts a chat card summarising what just happened: "Faye took
 *      Sacrifice Resources (-1): Supply 5 → 4".
 *
 * Returns a record describing what the executor did so the calling
 * dialog can chain into a follow-up (e.g. Endure Harm "trade momentum
 * for health" calls loseMomentum then directly writes +1 health).
 *
 * GM-only writes: actorBridge.applyMeterChanges checks game.user.isGM
 * (via the underlying actor.update); player-triggered suffer choices
 * still need a GM client connected. This is the PERSIST-001 carry-over
 * the scope doc's Q4 accepted; the dialog itself works for everyone.
 *
 * Source: docs/rules-reference/playkit-rules-and-coverage.md §1.3
 * (Suffer moves), and docs/moves/suffer-pipeline-scope.md §5.4.
 */

import { applyMeterChanges, setDebility } from "../character/actorBridge.js";
import { MORTAL_WOUND, DESOLATION, VEHICLE_DAMAGE } from "../oracles/tables/sufferAndCombat.js";

const MODULE_ID = "starforged-companion";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read a meter's current numeric value off the actor, tolerating both
 * the object-shaped (`{ value, max, min }`) and flat-number-shaped
 * actor mocks tests use.
 */
function readMeter(actor, key) {
  const sys = actor?.system ?? {};
  const m = sys[key];
  if (m == null) return 0;
  return typeof m === "object" ? (m.value ?? 0) : m;
}

/**
 * Roll on a `{min,max,result}[]` table given a 1..100 d100 — same
 * shape as the existing oracle tables. Test paths can pass a fixed
 * roll via `opts.fixedRoll` for determinism.
 */
function rollD100Table(table, opts = {}) {
  const roll = opts.fixedRoll ?? (Math.floor(Math.random() * 100) + 1);
  const entry = table.find(e => roll >= e.min && roll <= e.max);
  return { roll, result: entry?.result ?? null };
}

/**
 * Post a chat card describing a suffer-move resolution. Wrapped so the
 * tests can pin the shape; non-Foundry test envs no-op via the
 * ChatMessage stub.
 */
async function postSufferCard({ title, body, flags = {} }) {
  try {
    return await globalThis.ChatMessage?.create?.({
      content: `<div class="sf-card sf-card--suffer"><div class="sf-card-header">${title}</div><div class="sf-card-body">${body}</div></div>`,
      flags: { [MODULE_ID]: { sufferCard: true, ...flags } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | sufferExecutor: chat post failed:`, err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Executors
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lose Momentum executor.
 * @param {Actor} actor  active character actor
 * @param {number} amount  1, 2, or 3 (rulebook: minor/serious/major)
 * @param {Object} [opts]
 * @param {boolean} [opts.skipCard]  caller will post its own card
 * @returns {Promise<{ before:number, after:number, atMin:boolean }>}
 */
export async function loseMomentum(actor, amount, opts = {}) {
  if (!actor || !Number.isFinite(amount) || amount <= 0) {
    return { before: 0, after: 0, atMin: false, skipped: true };
  }
  const before = readMeter(actor, "momentum");
  await applyMeterChanges(actor, { momentum: -amount });
  const after = readMeter(actor, "momentum");
  const atMin = after <= -6;

  if (!opts.skipCard) {
    await postSufferCard({
      title: `Lose Momentum (-${amount})`,
      body: `Momentum: ${before} → ${after}${atMin ? " (at minimum; pick a redirect or clear progress)" : ""}`,
      flags: { suffer: "lose_momentum", amount, before, after, atMin },
    });
  }

  // Q3: at-min triggers a follow-up SufferChoiceDialog with both
  // branches. The dialog (Phase D) listens for `atMin: true` on the
  // executor return and recurses with a synthetic enumerated prompt.
  return { before, after, atMin };
}

/**
 * Endure Harm executor.
 * @param {Actor} actor
 * @param {number} amount  1/2/3
 * @param {Object} [opts]
 * @param {boolean} [opts.isMiss]  true → if at 0 health, roll mortal-wound
 * @param {number} [opts.fixedRoll]  d100 override for deterministic tests
 * @param {boolean} [opts.skipCard]
 */
export async function endureHarm(actor, amount, opts = {}) {
  if (!actor || !Number.isFinite(amount) || amount <= 0) {
    return { before: 0, after: 0, atZero: false, skipped: true };
  }
  const before = readMeter(actor, "health");
  await applyMeterChanges(actor, { health: -amount });
  const after = readMeter(actor, "health");
  const atZero = after <= 0;

  let woundedMarked = false;
  let mortalWound = null;
  if (atZero) {
    const alreadyWounded = !!actor.system?.debility?.wounded;
    if (!alreadyWounded) {
      await setDebility(actor, "wounded", true);
      woundedMarked = true;
    }
    if (opts.isMiss) {
      // At 0 + miss → roll mortal wound d100.
      mortalWound = rollD100Table(MORTAL_WOUND, opts);
    }
  }

  if (!opts.skipCard) {
    let body = `Health: ${before} → ${after}`;
    if (woundedMarked) body += " — marked <strong>wounded</strong>";
    if (mortalWound)   body += `<br/>Mortal Wound (d100 ${mortalWound.roll}): <em>${mortalWound.result}</em>`;
    await postSufferCard({
      title: `Endure Harm (-${amount})`,
      body,
      flags: { suffer: "endure_harm", amount, before, after, atZero, woundedMarked, mortalWound },
    });
  }

  return { before, after, atZero, woundedMarked, mortalWound };
}

/**
 * Endure Stress executor — symmetric to Endure Harm against spirit.
 */
export async function endureStress(actor, amount, opts = {}) {
  if (!actor || !Number.isFinite(amount) || amount <= 0) {
    return { before: 0, after: 0, atZero: false, skipped: true };
  }
  const before = readMeter(actor, "spirit");
  await applyMeterChanges(actor, { spirit: -amount });
  const after = readMeter(actor, "spirit");
  const atZero = after <= 0;

  let shakenMarked = false;
  let desolation = null;
  if (atZero) {
    const alreadyShaken = !!actor.system?.debility?.shaken;
    if (!alreadyShaken) {
      await setDebility(actor, "shaken", true);
      shakenMarked = true;
    }
    if (opts.isMiss) {
      desolation = rollD100Table(DESOLATION, opts);
    }
  }

  if (!opts.skipCard) {
    let body = `Spirit: ${before} → ${after}`;
    if (shakenMarked) body += " — marked <strong>shaken</strong>";
    if (desolation)   body += `<br/>Desolation (d100 ${desolation.roll}): <em>${desolation.result}</em>`;
    await postSufferCard({
      title: `Endure Stress (-${amount})`,
      body,
      flags: { suffer: "endure_stress", amount, before, after, atZero, shakenMarked, desolation },
    });
  }

  return { before, after, atZero, shakenMarked, desolation };
}

/**
 * Sacrifice Resources executor.
 * At 0 supply → mark unprepared; further losses prompt a redirect via the
 * dialog (handled in Phase D — executor surfaces atZero so the dialog
 * can recurse).
 */
export async function sacrificeResources(actor, amount, opts = {}) {
  if (!actor || !Number.isFinite(amount) || amount <= 0) {
    return { before: 0, after: 0, atZero: false, skipped: true };
  }
  const before = readMeter(actor, "supply");
  await applyMeterChanges(actor, { supply: -amount });
  const after = readMeter(actor, "supply");
  const atZero = after <= 0;

  let unpreparedMarked = false;
  if (atZero && !actor.system?.debility?.unprepared) {
    await setDebility(actor, "unprepared", true);
    unpreparedMarked = true;
  }

  if (!opts.skipCard) {
    let body = `Supply: ${before} → ${after}`;
    if (unpreparedMarked) body += " — marked <strong>unprepared</strong>";
    if (atZero && !unpreparedMarked) body += " — further loss redirects to another suffer move";
    await postSufferCard({
      title: `Sacrifice Resources (-${amount})`,
      body,
      flags: { suffer: "sacrifice_resources", amount, before, after, atZero, unpreparedMarked },
    });
  }

  return { before, after, atZero, unpreparedMarked };
}

/**
 * Companion Takes a Hit executor.
 *
 * The "companion" is a foundry-ironsworn `asset` Item embedded on the
 * character actor. v1 surfaces the destruction prompt as a chat card
 * (Q2) — the actual asset-Item deletion is its own follow-up scope.
 *
 * @param {Actor} actor
 * @param {string} companionItemId  the asset Item id (caller resolves)
 * @param {number} amount
 * @param {Object} [opts]
 * @param {boolean} [opts.isMissWithMatch]  miss + match → destruction prompt
 * @param {boolean} [opts.skipCard]
 */
export async function companionTakesAHit(actor, companionItemId, amount, opts = {}) {
  if (!actor || !Number.isFinite(amount) || amount <= 0) {
    return { before: 0, after: 0, destroyed: false, skipped: true };
  }
  const item = actor.items?.get?.(companionItemId) ?? actor.items?.find?.(i => i.id === companionItemId);
  if (!item) {
    // Surface to chat — companion not found is a user-visible failure
    // mode worth flagging rather than silently no-oping.
    await postSufferCard({
      title: `Companion Takes a Hit (-${amount})`,
      body: `Companion not found (id ${companionItemId}). Apply the damage manually.`,
      flags: { suffer: "companion_takes_a_hit", error: "companion-not-found" },
    });
    return { before: 0, after: 0, destroyed: false, skipped: true };
  }

  // The companion's health lives on the asset's condition meter. The
  // exact schema path varies by foundry-ironsworn version; read+write
  // through the item.system shape we know about.
  const before = item.system?.condition?.value ?? item.system?.health ?? 0;
  const after  = Math.max(0, before - amount);
  try {
    if (item.system?.condition != null) {
      await item.update({ "system.condition.value": after });
    } else {
      await item.update({ "system.health": after });
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | companionTakesAHit: item.update failed:`, err);
  }

  const atZero = after <= 0;
  const destroyed = atZero && opts.isMissWithMatch === true;

  if (!opts.skipCard) {
    let body = `${item.name}: ${before} → ${after}`;
    if (destroyed) {
      body += `<br/><strong>Companion destroyed.</strong> Open the character sheet → Assets and discard this companion.`;
    } else if (atZero) {
      body += ` — out of action until aided`;
    }
    await postSufferCard({
      title: `Companion Takes a Hit (-${amount})`,
      body,
      flags: { suffer: "companion_takes_a_hit", amount, before, after, atZero, destroyed, companionItemId },
    });
  }

  return { before, after, atZero, destroyed };
}

/**
 * Withstand Damage executor.
 *
 * The vehicle is also a foundry-ironsworn `asset` Item (the command
 * vehicle on the character). Integrity is its condition meter.
 *
 * At 0 integrity → roll VEHICLE_DAMAGE d100. If the vehicle is the
 * command vehicle, the result may include catastrophic destruction —
 * surface an Overcome Destruction prompt (Q2: prompt only, GM
 * adjudicates the actual move trigger).
 */
export async function withstandDamage(actor, vehicleItemId, amount, opts = {}) {
  if (!actor || !Number.isFinite(amount) || amount <= 0) {
    return { before: 0, after: 0, atZero: false, skipped: true };
  }
  const item = actor.items?.get?.(vehicleItemId) ?? actor.items?.find?.(i => i.id === vehicleItemId);
  if (!item) {
    await postSufferCard({
      title: `Withstand Damage (-${amount})`,
      body: `Vehicle not found (id ${vehicleItemId}). Apply the damage manually.`,
      flags: { suffer: "withstand_damage", error: "vehicle-not-found" },
    });
    return { before: 0, after: 0, atZero: false, skipped: true };
  }

  const before = item.system?.condition?.value ?? item.system?.integrity ?? 0;
  const after  = Math.max(0, before - amount);
  try {
    if (item.system?.condition != null) {
      await item.update({ "system.condition.value": after });
    } else {
      await item.update({ "system.integrity": after });
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | withstandDamage: item.update failed:`, err);
  }

  const atZero = after <= 0;
  let vehicleDamage = null;
  if (atZero) {
    vehicleDamage = rollD100Table(VEHICLE_DAMAGE, opts);
  }

  if (!opts.skipCard) {
    let body = `${item.name}: ${before} → ${after}`;
    if (vehicleDamage) {
      body += `<br/>Vehicle Damage (d100 ${vehicleDamage.roll}): <em>${vehicleDamage.result}</em>`;
      if (opts.isCommandVehicle && /catastrophic|destruction/i.test(vehicleDamage.result)) {
        body += `<br/><strong>Command vehicle destruction.</strong> Trigger Overcome Destruction when ready.`;
      }
    }
    await postSufferCard({
      title: `Withstand Damage (-${amount})`,
      body,
      flags: { suffer: "withstand_damage", amount, before, after, atZero, vehicleDamage, vehicleItemId },
    });
  }

  return { before, after, atZero, vehicleDamage };
}

// ─────────────────────────────────────────────────────────────────────────────
// Dispatch table — the SufferChoiceDialog uses this to fire the chosen
// suffer move by name. Keep keys aligned with the suffer-move ids used
// in CONSEQUENCE_MAP's sufferPrompt.options[].suffer strings.
// ─────────────────────────────────────────────────────────────────────────────

export const SUFFER_EXECUTORS = {
  lose_momentum:       loseMomentum,
  endure_harm:         endureHarm,
  endure_stress:       endureStress,
  sacrifice_resources: sacrificeResources,
  companion_takes_a_hit: companionTakesAHit,
  withstand_damage:    withstandDamage,
};

/**
 * Convenience dispatch: pick the right executor by suffer-move id.
 *
 * @param {string} sufferId  one of the six suffer-move keys above
 * @param {Actor} actor
 * @param {Object} args      forwarded to the specific executor
 */
export async function executeSuffer(sufferId, actor, args = {}) {
  const fn = SUFFER_EXECUTORS[sufferId];
  if (!fn) {
    console.warn(`${MODULE_ID} | executeSuffer: unknown suffer-move id "${sufferId}"`);
    return { skipped: true, error: "unknown-suffer-id" };
  }
  const { amount, itemId, ...opts } = args;
  // The two item-targeting executors take an extra positional id.
  if (sufferId === "companion_takes_a_hit" || sufferId === "withstand_damage") {
    return fn(actor, itemId, amount, opts);
  }
  return fn(actor, amount, opts);
}
