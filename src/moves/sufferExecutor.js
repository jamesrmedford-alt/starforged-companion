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
 *          meter's clamp). "Then, if your health is 0 … roll +health or
 *          +iron": the harm step marks nothing at 0 — it posts the resist
 *          roll the move owes, a card whose press rolls Endure Harm as
 *          the PC (issue #330 D3; it marked wounded, or on a Pay the
 *          Price offered the miss's escalation with no roll made). On that
 *          roll's own miss (`resistMiss`) at 0 the player chooses one:
 *          mark wounded, mark permanently harmed, or roll the MORTAL_WOUND
 *          d100 — a follow-up choice card (issue #329 X03: it marked
 *          wounded AND rolled the table).
 *        - Endure Stress past 0 spirit → the remainder is Lose Momentum
 *          the same way; at 0 the resist roll (Endure Stress) is owed,
 *          and its miss offers shaken, traumatized or the DESOLATION d100.
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

// ─────────────────────────────────────────────────────────────────────────────
// At 0 on a miss — the player's choice (issue #329 X03)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What Endure Harm / Endure Stress offer at 0 on a miss: "If your health is
 * 0, you must also mark wounded or permanently harmed, or roll on the table
 * below" (vendored Endure_Harm; Endure Stress: shaken or traumatized, or the
 * desolation table). One of the three, the player's choice. An impact already
 * marked is not offered (marking it again would cost nothing).
 */
const AT_ZERO_CHOICES = {
  harm: {
    meter:  "health",
    impact: "wounded",
    lasting: "permanentlyharmed",
    table:  "mortal_wound",
    labels: ["Mark wounded", "Mark permanently harmed", "Roll on the mortal-wound table"],
  },
  stress: {
    meter:  "spirit",
    impact: "shaken",
    lasting: "traumatized",
    table:  "desolation",
    labels: ["Mark shaken", "Mark traumatized", "Roll on the desolation table"],
  },
};

/** The d100 tables the at-0 choice can roll, by id. */
const IMPACT_TABLES = {
  mortal_wound: { table: MORTAL_WOUND, title: "Mortal Wound" },
  desolation:   { table: DESOLATION,   title: "Desolation" },
};

/**
 * The choice card's prompt for Endure Harm ("harm") or Endure Stress
 * ("stress") at 0 on a miss — an enumerated sufferPrompt: mark the impact,
 * mark the lasting one, or roll the table (sufferDialog's `mark` and
 * `rollTable` options).
 *
 * @param {"harm"|"stress"} which
 * @returns {Object|null}
 */
export function atZeroChoicePrompt(which) {
  const c = AT_ZERO_CHOICES[which];
  if (!c) return null;
  return {
    kind: "enumerated",
    atZero: c.meter,
    options: [
      { label: c.labels[0], mark: c.impact,  requires: `!${c.impact}` },
      { label: c.labels[1], mark: c.lasting, requires: `!${c.lasting}` },
      { label: c.labels[2], rollTable: c.table },
    ],
  };
}

/**
 * Post the at-0 choice card for `actor` (sufferCard's choice card; loaded on
 * demand — it imports this module). A move's Pay the Price passes the move's
 * `resolutionId`: the card is that outcome's, so a Burn Momentum or Improve
 * Result of the move retires it (resultUpgrade.js). A test's fixed d100 rides
 * to the table option. Never throws.
 *
 * @returns {Promise<boolean>} whether the card posted
 */
async function postAtZeroChoice(actor, which, opts = {}) {
  try {
    const { postSufferChoiceCard } = await import("./sufferCard.js");
    const posted = await postSufferChoiceCard({
      sufferPrompt: atZeroChoicePrompt(which),
      actor,
      executorOpts: Number.isInteger(opts.fixedRoll) ? { fixedRoll: opts.fixedRoll } : {},
      moveId: which === "harm" ? "endure_harm" : "endure_stress",
      resolutionId: typeof opts.resolutionId === "string" && opts.resolutionId ? opts.resolutionId : null,
    });
    return !!posted;
  } catch (err) {
    console.warn(`${MODULE_ID} | sufferExecutor: the at-0 choice card could not be posted:`, err?.message ?? err);
    return false;
  }
}

// The resist roll each suffer move owes at 0 (issue #330 D3).
const RESIST_ROLLS = {
  harm:   { moveId: "endure_harm",   meter: "health", label: "🛡 Resist the harm — roll Endure Harm (+health or +iron)" },
  stress: { moveId: "endure_stress", meter: "spirit", label: "🛡 Resist the stress — roll Endure Stress (+spirit or +heart)" },
};

// The resist roll is the roller's next move, and it closes the open Burn
// Momentum / Improve Result of the move whose price it is (issue #326 D4):
// while that move still offers one, the card and the executor's line say to
// take it first, as the move card's own follow-ups do (issue #330 D2's hint;
// issue #336 Y18).
const RESIST_UPGRADE_FIRST = "Burn momentum or improve the result first — resisting is your next move, and closes them.";

/**
 * The resist card's prompt: one pick, which rolls Endure Harm ("harm") or
 * Endure Stress ("stress") as the PC (sufferDialog's `resist` option) —
 * "Then, if your health is 0 … roll +health or +iron" (issue #330 D3).
 * `upgradeFirst`: the move whose price it is still offers a burn or an
 * improvement — the card says to take it first (`hint`).
 *
 * @param {"harm"|"stress"} which
 * @param {{ upgradeFirst?: boolean }} [opts]
 * @returns {Object|null}
 */
export function resistRollPrompt(which, { upgradeFirst = false } = {}) {
  const r = RESIST_ROLLS[which];
  if (!r) return null;
  return {
    kind: "enumerated", resist: r.meter, options: [{ label: r.label, resist: r.moveId }],
    ...(upgradeFirst ? { hint: RESIST_UPGRADE_FIRST } : {}),
  };
}

/**
 * Whether the move whose price owes the resist roll still offers a burn or
 * an improvement: its move card's (resultUpgrade.js upgradeOpenFor), and
 * before that card is posted — the pipeline pays a miss's price first — the
 * pipeline's word (`opts.upgradeOffered`). Never for a price bound to no
 * move (`!pay-the-price`). Never throws.
 *
 * @param {Object} opts — the executor's opts (`resolutionId`, `upgradeOffered`)
 * @returns {Promise<boolean>}
 */
async function upgradeFirstOwed(opts = {}) {
  const resolutionId = typeof opts.resolutionId === "string" && opts.resolutionId ? opts.resolutionId : null;
  if (!resolutionId) return false;
  try {
    const { upgradeOpenFor } = await import("./resultUpgrade.js");
    return upgradeOpenFor(resolutionId) ?? opts.upgradeOffered === true;
  } catch (err) {
    console.warn(`${MODULE_ID} | sufferExecutor: could not tell whether the move still offers an upgrade:`, err?.message ?? err);
    return false;
  }
}

/**
 * Post the resist card for `actor` at 0 health / spirit: a choice card, so
 * it is claimed once and pressed by the PC's player or a GM, and a Burn
 * Momentum or Improve Result of the move whose price it is retires it, as
 * the at-0 choice card is (`resolutionId`). `upgradeFirst`: the card says to
 * burn or improve first (upgradeFirstOwed). Never throws.
 *
 * @returns {Promise<boolean>} whether the card posted
 */
async function postResistRoll(actor, which, opts = {}, upgradeFirst = false) {
  try {
    const { postSufferChoiceCard } = await import("./sufferCard.js");
    const posted = await postSufferChoiceCard({
      sufferPrompt: resistRollPrompt(which, { upgradeFirst }),
      actor,
      executorOpts: {},
      moveId: RESIST_ROLLS[which].moveId,
      resolutionId: typeof opts.resolutionId === "string" && opts.resolutionId ? opts.resolutionId : null,
    });
    return !!posted;
  } catch (err) {
    console.warn(`${MODULE_ID} | sufferExecutor: the resist card could not be posted:`, err?.message ?? err);
    return false;
  }
}

/** The executor card's line for the resist roll owed at 0 (`upgradeFirst` as for the card). */
function resistLine(which, upgradeFirst = false) {
  const r = RESIST_ROLLS[which];
  const first = upgradeFirst ? ` (${RESIST_UPGRADE_FIRST.charAt(0).toLowerCase()}${RESIST_UPGRADE_FIRST.slice(1, -1)})` : "";
  return ` — at 0 ${r.meter} you must resist: roll ${r.moveId === "endure_harm" ? "Endure Harm" : "Endure Stress"} on the card below${first}`;
}

/**
 * The at-0 choice after a miss's "Lose Momentum (-2)" (known-issues
 * ENDURE-ZERO-ON-OTHER-OPTION). "If your health is 0, you must also mark
 * wounded or permanently harmed, or roll on the table below" holds whichever
 * option the miss took: the -1 health / spirit pick's executor offers it
 * itself (endureHarm / endureStress `impactChoice`), the momentum pick
 * through this. Posts the choice card when it is a miss and `actor`'s health
 * ("harm") or spirit ("stress") is 0; nothing otherwise.
 *
 * @param {Actor} actor
 * @param {"harm"|"stress"} which
 * @param {Object} [opts] — the choice card's executor opts (`isMiss`, `fixedRoll`, `resolutionId`)
 * @returns {Promise<{ offered: boolean }>}
 */
export async function offerAtZeroChoiceAfterMiss(actor, which, opts = {}) {
  const c = AT_ZERO_CHOICES[which];
  if (!c || !actor || !(opts.resistMiss || opts.isMiss)) return { offered: false };
  if (readMeter(actor, c.meter) > 0) return { offered: false };
  return { offered: await postAtZeroChoice(actor, which, opts) };
}

/** The executor card's line for the at-0 choice that follows it. */
function atZeroChoiceLine(which) {
  const c = AT_ZERO_CHOICES[which];
  const what = `${c.labels[0].toLowerCase()} or ${c.labels[1].replace(/^Mark /, "").toLowerCase()}, or ${c.labels[2].toLowerCase()}`;
  return ` — at 0 ${c.meter}, choose one on the card below: ${what}`;
}

/**
 * Roll an at-0 table — the choice card's "Roll on the … table" (issue #329
 * X03) — and post its result.
 *
 * @param {string} tableId — "mortal_wound" | "desolation"
 * @param {Object} [opts] — `fixedRoll` for deterministic tests
 * @returns {Promise<{ roll: number, result: string|null }|null>} null for an unknown table
 */
export async function rollImpactTable(tableId, opts = {}) {
  const t = IMPACT_TABLES[tableId];
  if (!t) return null;
  const rolled = rollD100Table(t.table, opts);
  await postSufferCard({
    title: t.title,
    body:  `d100 ${rolled.roll}: <em>${rolled.result}</em>`,
    flags: { suffer: "impact_table", table: tableId, ...rolled },
  });
  return rolled;
}

/**
 * Endure Harm executor.
 * @param {Actor} actor
 * @param {number} amount  1/2/3
 * @param {Object} [opts]
 * @param {boolean} [opts.resistMiss]  true → this loss is Endure Harm's own
 *   miss (the resist roll's "suffer an additional -1 health"): at 0 the
 *   player chooses — mark wounded or permanently harmed, or roll the
 *   mortal-wound table (a follow-up choice card — issue #329 X03). Otherwise
 *   this is the harm step, and at 0 the resist roll is owed: a card whose
 *   press rolls Endure Harm (issue #330 D3) — nothing is marked
 * @param {number} [opts.fixedRoll]  d100 override for deterministic tests
 * @param {boolean} [opts.skipCard]
 * @returns {Promise<{ before:number, after:number, atZero:boolean, woundedMarked?:boolean,
 *   mortalWound?:Object|null, impactChoice?:boolean, resistOwed?:boolean, momentumLoss?:Object|null }>}
 *   `impactChoice`: the at-0 choice was offered (nothing marked, nothing rolled
 *   here); `resistOwed`: the resist card was posted; `momentumLoss` is the
 *   harm past 0 health, taken as momentum (overflowToMomentum)
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

  const woundedMarked = false;
  const mortalWound = null;
  // At 0 the harm step owes the resist roll, which nothing used to make
  // (issue #330 D3); on that roll's own miss the player chooses one — mark
  // wounded, mark permanently harmed, or roll the mortal-wound table — never
  // an impact AND the table (issue #329 X03). Either card follows the
  // summary card.
  const impactChoice = atZero && !!opts.resistMiss;
  const resistOwed   = atZero && !opts.resistMiss;
  const upgradeFirst = resistOwed && await upgradeFirstOwed(opts);

  if (!opts.skipCard) {
    let body = `Health: ${before} → ${after}${overflowLine(momentumLoss)}`;
    if (impactChoice) body += atZeroChoiceLine("harm");
    if (resistOwed)   body += resistLine("harm", upgradeFirst);
    await postSufferCard({
      title: `Endure Harm (-${amount})`,
      body,
      flags: { suffer: "endure_harm", amount, before, after, atZero, woundedMarked, mortalWound, impactChoice, resistOwed, momentumLoss },
    });
  }
  if (impactChoice) await postAtZeroChoice(actor, "harm", opts);
  if (resistOwed)   await postResistRoll(actor, "harm", opts, upgradeFirst);

  return { before, after, atZero, woundedMarked, mortalWound, impactChoice, resistOwed, momentumLoss };
}

/**
 * Endure Stress executor — symmetric to Endure Harm against spirit, the
 * stress past 0 spirit taken as momentum (`momentumLoss`). At 0 the stress
 * step owes the resist roll — Endure Stress, on its card (`resistOwed`,
 * issue #330 D3); on that roll's own miss (`resistMiss`) the player chooses:
 * mark shaken or traumatized, or roll the desolation table (`impactChoice` —
 * issue #329 X03).
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

  const shakenMarked = false;
  const desolation = null;
  const impactChoice = atZero && !!opts.resistMiss;
  const resistOwed   = atZero && !opts.resistMiss;
  const upgradeFirst = resistOwed && await upgradeFirstOwed(opts);

  if (!opts.skipCard) {
    let body = `Spirit: ${before} → ${after}${overflowLine(momentumLoss)}`;
    if (impactChoice) body += atZeroChoiceLine("stress");
    if (resistOwed)   body += resistLine("stress", upgradeFirst);
    await postSufferCard({
      title: `Endure Stress (-${amount})`,
      body,
      flags: { suffer: "endure_stress", amount, before, after, atZero, shakenMarked, desolation, impactChoice, resistOwed, momentumLoss },
    });
  }
  if (impactChoice) await postAtZeroChoice(actor, "stress", opts);
  if (resistOwed)   await postResistRoll(actor, "stress", opts, upgradeFirst);

  return { before, after, atZero, shakenMarked, desolation, impactChoice, resistOwed, momentumLoss };
}

/**
 * Sacrifice Resources has reduced `actor`'s supply to 0: mark unprepared —
 * "unprepared is marked when you Sacrifice Resources and are reduced to 0
 * supply" — on `actor` and on every ally sharing its supply: "because you
 * and your allies share the same supply value, you mark unprepared
 * together". The crew's supply is one value (multiplayer/sharedSupply.js
 * mirrors the number to them); this is the one writer of the impact that
 * goes with it — the executor below, Repair's supply trade (repair.js) and
 * an asset rider's supply cost (consequenceRiders.js, issue #331 X16) all
 * come here (no move's own consequence costs supply). Issue #315 S04 (the
 * trade marked no one) and S07 (only the PC who paid was marked).
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
  // Already unprepared with nothing left: "When you suffer a loss of
  // resources while unprepared … apply the cost to a different suffer move."
  // The loss went 0 → 0 and the cost was settled for nothing (issue #325
  // W16): a picker of the other suffer moves takes it instead.
  if (before <= 0 && actor.system?.debility?.unprepared) {
    const { postSufferChoiceCard } = await import("./sufferCard.js");
    // The move's context (miss, the vehicle / companion it was made against),
    // without this call's own arguments.
    const executorOpts = Object.fromEntries(Object.entries(opts ?? {})
      .filter(([key]) => !["skipCard", "amount", "itemId", "fixedRoll"].includes(key)));
    // The redirected loss is the price of the move that paid it: the picker
    // is bound to that move's resolution, so a Burn Momentum or Improve
    // Result that undoes the price retires it and refuses a late pick, as it
    // does the move's own choice cards (issue #331 X15, issue #311 P03).
    const redirect = await postSufferChoiceCard({
      sufferPrompt: { kind: "any", amount, count: 1, exclude: ["sacrifice_resources"] },
      actor,
      executorOpts,
      resolutionId: typeof opts.resolutionId === "string" && opts.resolutionId ? opts.resolutionId : null,
    });
    if (!opts.skipCard) {
      await postSufferCard({
        title: `Sacrifice Resources (-${amount})`,
        body: `Supply: 0 — <strong>unprepared</strong>: the loss goes to another suffer move${redirect ? " (choose below)" : " — choose one and apply it on the sheet"}.`,
        flags: { suffer: "sacrifice_resources", amount, before, after: before, atZero: true, unpreparedMarked: false, redirected: true },
      });
    }
    return { before, after: before, atZero: true, unpreparedMarked: false, redirected: true };
  }
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
    let body = `${escapeHtml(item.name)}: ${before} → ${after}`;   // the player names the asset (issue #336 Y28)
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
    let body = `${escapeHtml(item.name)}: ${before} → ${after}`;   // the player names the asset (issue #336 Y28)
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
