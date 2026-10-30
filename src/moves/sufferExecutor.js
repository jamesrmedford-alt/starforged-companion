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
 *        - Endure Harm past 0 health → the remainder is Lose Momentum
 *          ("if your health is 0, suffer -momentum equal to any
 *          remaining harm" — issue #314 Q02; it used to vanish in the
 *          meter's clamp); then mark wounded/maimed; roll
 *          MORTAL_WOUND d100 if the trigger was a miss; otherwise just
 *          mark and surface.
 *        - Endure Stress past 0 spirit → the remainder is Lose Momentum
 *          the same way; mark shaken/traumatized; roll DESOLATION d100
 *          on miss.
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
 * (Suffer moves), and issue #214 (Suffer-move Pipeline) §5.4.
 */

import { applyMeterChanges, setDebility } from "../character/actorBridge.js";
import { supplyAllies } from "../multiplayer/sharedSupply.js";
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
 * Harm or stress beyond what the meter holds is a momentum loss: "if your
 * health is 0, suffer -momentum equal to any remaining harm" (play kit p. 6;
 * Endure Stress reads the same for spirit). The meter write clamped at 0 and
 * the remainder was never charged (issue #314 Q02).
 *
 * @param {number} amount — the whole loss
 * @param {number} before — the meter's value before the loss
 * @returns {{ absorbed: number, overflow: number }} what the meter takes, and the rest
 */
function splitOverflow(amount, before) {
  const absorbed = Math.min(amount, Math.max(0, before));
  return { absorbed, overflow: amount - absorbed };
}

/**
 * Take a loss's overflow as momentum (loseMomentum, no card of its own). What
 * the momentum minimum refuses is reported for the player to redirect —
 * loseMomentum's at-min rule (another suffer move, or progress cleared) is a
 * manual follow-up.
 *
 * @param {Actor} actor
 * @param {number} overflow
 * @returns {Promise<Object|null>} `amount` owed, `taken`, `remaining` (refused
 *   at the minimum), `before` / `after`, `atMin` — null when nothing overflowed
 */
async function overflowToMomentum(actor, overflow) {
  if (overflow <= 0) return null;
  const m = await loseMomentum(actor, overflow, { skipCard: true });
  const taken = Math.max(0, m.before - m.after);
  return { amount: overflow, taken, remaining: overflow - taken, before: m.before, after: m.after, atMin: m.atMin };
}

/** The card's line for an overflow: " — N more as momentum: 5 → 3", with what the minimum refused. */
function overflowLine(momentumLoss) {
  if (!momentumLoss) return "";
  let line = ` — ${momentumLoss.amount} more as momentum: ${momentumLoss.before} → ${momentumLoss.after}`;
  if (momentumLoss.remaining > 0) {
    line += ` (at minimum; ${momentumLoss.remaining} not taken — redirect it to another suffer move or clear progress)`;
  }
  return line;
}

/**
 * Endure Harm executor.
 * @param {Actor} actor
 * @param {number} amount  1/2/3
 * @param {Object} [opts]
 * @param {boolean} [opts.isMiss]  true → if at 0 health, roll mortal-wound
 * @param {number} [opts.fixedRoll]  d100 override for deterministic tests
 * @param {boolean} [opts.skipCard]
 * @returns {Promise<{ before:number, after:number, atZero:boolean, woundedMarked?:boolean,
 *   mortalWound?:Object|null, momentumLoss?:Object|null }>} `momentumLoss` is
 *   the harm past 0 health, taken as momentum (overflowToMomentum)
 */
export async function endureHarm(actor, amount, opts = {}) {
  if (!actor || !Number.isFinite(amount) || amount <= 0) {
    return { before: 0, after: 0, atZero: false, skipped: true };
  }
  const before = readMeter(actor, "health");
  const { absorbed, overflow } = splitOverflow(amount, before);
  if (absorbed > 0) await applyMeterChanges(actor, { health: -absorbed });
  const after = readMeter(actor, "health");
  const atZero = after <= 0;
  const momentumLoss = await overflowToMomentum(actor, overflow);

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
    let body = `Health: ${before} → ${after}${overflowLine(momentumLoss)}`;
    if (woundedMarked) body += " — marked <strong>wounded</strong>";
    if (mortalWound)   body += `<br/>Mortal Wound (d100 ${mortalWound.roll}): <em>${mortalWound.result}</em>`;
    await postSufferCard({
      title: `Endure Harm (-${amount})`,
      body,
      flags: { suffer: "endure_harm", amount, before, after, atZero, woundedMarked, mortalWound, momentumLoss },
    });
  }

  return { before, after, atZero, woundedMarked, mortalWound, momentumLoss };
}

/**
 * Endure Stress executor — symmetric to Endure Harm against spirit, the
 * stress past 0 spirit taken as momentum (`momentumLoss`).
 */
export async function endureStress(actor, amount, opts = {}) {
  if (!actor || !Number.isFinite(amount) || amount <= 0) {
    return { before: 0, after: 0, atZero: false, skipped: true };
  }
  const before = readMeter(actor, "spirit");
  const { absorbed, overflow } = splitOverflow(amount, before);
  if (absorbed > 0) await applyMeterChanges(actor, { spirit: -absorbed });
  const after = readMeter(actor, "spirit");
  const atZero = after <= 0;
  const momentumLoss = await overflowToMomentum(actor, overflow);

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
    let body = `Spirit: ${before} → ${after}${overflowLine(momentumLoss)}`;
    if (shakenMarked) body += " — marked <strong>shaken</strong>";
    if (desolation)   body += `<br/>Desolation (d100 ${desolation.roll}): <em>${desolation.result}</em>`;
    await postSufferCard({
      title: `Endure Stress (-${amount})`,
      body,
      flags: { suffer: "endure_stress", amount, before, after, atZero, shakenMarked, desolation, momentumLoss },
    });
  }

  return { before, after, atZero, shakenMarked, desolation, momentumLoss };
}

/**
 * Sacrifice Resources has reduced `actor`'s supply to 0: mark unprepared —
 * "unprepared is marked when you Sacrifice Resources and are reduced to 0
 * supply" — on `actor` and on every ally sharing its supply: "because you
 * and your allies share the same supply value, you mark unprepared
 * together". The crew's supply is one value (multiplayer/sharedSupply.js
 * mirrors the number to them); this is the one writer of the impact that
 * goes with it — the executor below, Repair's supply trade (repair.js) and a
 * move's own supply loss (persistResolution.js) all come here. Issue #315
 * S04 (the trade marked no one) and S07 (only the PC who paid was marked).
 * Raising supply clears nothing: the impact is cleared by a recovery move.
 *
 * @param {Actor} actor  whose supply is now 0
 * @returns {Promise<{ unpreparedMarked: boolean, alliesMarked: string[], alliesNotMarked: string[] }>}
 *   `unpreparedMarked` is false when `actor` was already unprepared; the
 *   allies by name — marked now, or whose write was refused (warned, never
 *   thrown: the supply loss has landed either way)
 */
export async function markUnprepared(actor) {
  const marks = { unpreparedMarked: false, alliesMarked: [], alliesNotMarked: [] };
  if (!actor) return marks;
  if (!actor.system?.debility?.unprepared) {
    await setDebility(actor, "unprepared", true);
    marks.unpreparedMarked = true;
  }
  for (const ally of supplyAllies(actor)) {
    if (ally.system?.debility?.unprepared) continue;
    try {
      await setDebility(ally, "unprepared", true);
      marks.alliesMarked.push(ally.name ?? ally.id);
    } catch (err) {
      console.warn(`${MODULE_ID} | sufferExecutor: marking ${ally.name ?? ally.id} unprepared failed:`, err?.message ?? err);
      marks.alliesNotMarked.push(ally.name ?? ally.id);
    }
  }
  return marks;
}

/**
 * The allies' part of markUnprepared's marks, for a card line ("" when the
 * crew is one PC): who, sharing the supply, was marked with the roller, and
 * whose mark the world refused.
 *
 * @param {{ alliesMarked?: string[], alliesNotMarked?: string[] }} marks
 * @returns {string} HTML
 */
export function crewUnpreparedNote({ alliesMarked = [], alliesNotMarked = [] } = {}) {
  const names = (list) => list.map(escapeHtml).join(", ");
  return [
    alliesMarked.length
      ? `${names(alliesMarked)}, sharing the supply, ${alliesMarked.length === 1 ? "is" : "are"} marked <strong>unprepared</strong> too`
      : "",
    alliesNotMarked.length ? `${names(alliesNotMarked)} could not be marked unprepared — mark it on the sheet` : "",
  ].filter(Boolean).join("; ");
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
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

  const marks = atZero ? await markUnprepared(actor) : null;
  const unpreparedMarked = !!marks?.unpreparedMarked;

  if (!opts.skipCard) {
    let body = `Supply: ${before} → ${after}`;
    if (unpreparedMarked) body += " — marked <strong>unprepared</strong>";
    if (atZero && !unpreparedMarked) body += " — further loss redirects to another suffer move";
    const crew = crewUnpreparedNote(marks ?? {});
    if (crew) body += ` — ${crew}`;
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
