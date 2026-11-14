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
 *        - Sacrifice Resources at 0  → mark unprepared (the crew sharing
 *          the supply with the PC); a loss while unprepared, at any
 *          supply, goes to a picker of the other suffer moves (issue #325
 *          W16; issue #338 D3).
 *        - Lose Momentum at min (-6) → the loss the minimum refuses posts
 *          the "make a suffer move" picker for it, Lose Momentum excepted,
 *          with a "clear progress" button per open track
 *          (MOMENTUM-MIN-REDIRECT-MANUAL).
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

import { applyMeterChanges, setDebility, withoutSystemNotes } from "../character/actorBridge.js";
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
async function postSufferCard({ title, body, flags = {}, opts = null }) {
  // A move's Pay the Price names the move on the cards its route posts
  // (`priceOf` — index.js dispatchPayThePriceSufferRoute's `priceCard` and
  // `resolutionId`): a Burn Momentum or Improve Result that reverts the price
  // strikes them, as it strikes the narration (resultUpgrade.js
  // supersedePriceCards, issue #354 P2-09).
  const priceOf = opts?.priceCard === true && typeof opts.resolutionId === "string" && opts.resolutionId
    ? { priceOf: opts.resolutionId } : {};
  try {
    return await globalThis.ChatMessage?.create?.({
      content: `<div class="sf-card sf-card--suffer"><div class="sf-card-header">${title}</div><div class="sf-card-body">${body}</div></div>`,
      flags: { [MODULE_ID]: { sufferCard: true, ...flags, ...priceOf } },
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
 *
 * At the minimum (-6) the loss the momentum cannot take is not lost: "If
 * your momentum is at its minimum (-6), apply the cost to another suffer
 * move or clear progress" (play kit). Its remainder posts the "make a suffer
 * move" picker for that amount — Lose Momentum excepted — with a "clear
 * progress" button per open progress track (`clearProgress`), bound to the
 * move whose cost it is (MOMENTUM-MIN-REDIRECT-MANUAL: the card said to
 * redirect it, and no card offered the choice). The remainder of a harm's
 * overflow (overflowToMomentum) is redirected the same way.
 *
 * @param {Actor} actor  active character actor
 * @param {number} amount  1, 2, or 3 (rulebook: minor/serious/major)
 * @param {Object} [opts]  the move's executor opts (the picker's), and:
 * @param {boolean} [opts.skipCard]  caller will post its own card
 * @returns {Promise<{ before:number, after:number, atMin:boolean, remaining:number, redirected?:boolean }>}
 *   `remaining`: the loss the minimum refused; `redirected`: its picker posted
 */
export async function loseMomentum(actor, amount, opts = {}) {
  if (!actor || !Number.isFinite(amount) || amount <= 0) {
    return { before: 0, after: 0, atMin: false, remaining: 0, skipped: true };
  }
  const before = readMeter(actor, "momentum");
  // The loss is on this move's own card (or the card of the loss that
  // overflowed into it): the system's note for the same write is not posted
  // beside it (issue #354 P2-13) — here and in every executor below.
  await withoutSystemNotes(() => applyMeterChanges(actor, { momentum: -amount }));
  const after = readMeter(actor, "momentum");
  const atMin = after <= -6;
  const remaining = Math.max(0, amount - Math.max(0, before - after));
  const redirect = remaining > 0 ? await postMinimumRedirect(actor, remaining, opts) : null;

  if (!opts.skipCard) {
    await postSufferCard({
      opts,
      title: `Lose Momentum (-${amount})`,
      body: `Momentum: ${before} → ${after}${remaining > 0 ? minimumLine(remaining, !!redirect) : ""}`,
      flags: { suffer: "lose_momentum", amount, before, after, atMin, remaining },
    });
  }

  return { before, after, atMin, remaining, ...(remaining > 0 ? { redirected: !!redirect } : {}) };
}

/** The card's line for a loss the momentum minimum refused, and where it went. */
function minimumLine(remaining, posted) {
  return ` (at minimum; ${remaining} not taken — ${posted
    ? "make another suffer move or clear progress: choose it on its card"
    : "make another suffer move or clear progress on the sheet"})`;
}

/**
 * The picker for a momentum loss the minimum refused (MOMENTUM-MIN-REDIRECT-
 * MANUAL): "make a suffer move (-N)" without Lose Momentum, and a "clear
 * progress" button per open progress track (`clearTracks`, one rank's mark
 * each — sufferDialog's `clear-progress`), bound to the move whose cost it is
 * (`opts.resolutionId`), as Sacrifice Resources' redirect is (issue #331
 * X15). While that move still offers a burn or an improvement, it says to
 * take it first. Never throws: null when it could not be posted.
 *
 * @param {Actor} actor
 * @param {number} amount
 * @param {Object} opts — the executor's
 * @returns {Promise<ChatMessage|null>}
 */
async function postMinimumRedirect(actor, amount, opts = {}) {
  try {
    const { postSufferChoiceCard } = await import("./sufferCard.js");
    const { listProgressTracks } = await import("../ui/progressTracks.js");
    const clearTracks = (await listProgressTracks().catch(() => []))
      .filter(t => t && !t.completed && Number(t.ticks ?? 0) > 0)
      .map(t => ({ id: t.id, label: t.label ?? "a track" }));
    const executorOpts = Object.fromEntries(Object.entries(opts ?? {})
      .filter(([key]) => !["skipCard", "amount", "itemId", "fixedRoll", "sufferCardId", "resistMiss"].includes(key)));
    const upgradeFirst = await upgradeFirstOwed(opts);
    return await postSufferChoiceCard({
      sufferPrompt: { kind: "any", amount, count: 1, exclude: ["lose_momentum"],
        ...(clearTracks.length ? { clearTracks } : {}),
        ...(upgradeFirst ? { hint: REDIRECT_UPGRADE_FIRST } : {}) },
      actor,
      executorOpts,
      resolutionId: typeof opts.resolutionId === "string" && opts.resolutionId ? opts.resolutionId : null,
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | sufferExecutor: the momentum minimum's picker could not be posted:`, err?.message ?? err);
    return null;
  }
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
 * manual follow-up. Also the damage a vehicle's integrity, or the harm a
 * companion's health, cannot take (sufferDialog's integrity / companion health
 * write — issue #345 AA15).
 *
 * @param {Actor} actor
 * @param {number} overflow
 * @returns {Promise<Object|null>} `amount` owed, `taken`, `remaining` (refused
 *   at the minimum), `before` / `after`, `atMin` — null when nothing overflowed
 */
export async function overflowToMomentum(actor, overflow, opts = {}) {
  if (overflow <= 0) return null;
  // The executor's opts: what the minimum refuses posts its picker bound to
  // the same move (MOMENTUM-MIN-REDIRECT-MANUAL).
  const m = await loseMomentum(actor, overflow, { ...(opts ?? {}), skipCard: true });
  const taken = Math.max(0, m.before - m.after);
  return { amount: overflow, taken, remaining: overflow - taken, before: m.before, after: m.after, atMin: m.atMin,
    ...(m.redirected !== undefined ? { redirected: m.redirected } : {}) };
}

/**
 * A suffer pick's second write — the impact or the overflow after its meter
 * landed — run on its own (SUFFER-RETRY-WHOLE-AFTER-METER). The executors
 * wrote the meter, then threw past it on a refused second write: the call
 * was reported refused whole, and its `suffer` Retry took the meter again
 * (a harm at 0 the second time is all momentum). Refused now, it is the
 * call's own result: `ok: false` with `retryCall`, the call that applies
 * that write alone — what the card says was not applied and what the GMs'
 * Retry runs (sufferCard reportRefusedCalls). The meter write stands.
 *
 * @param {() => Promise<*>} write
 * @param {Object} retryCall — a sufferDialog call (`meter` / `mark`)
 * @param {string} what — for the log
 * @returns {Promise<{ value?: *, refused?: Object }>}
 */
async function afterMeter(write, retryCall, what) {
  try {
    return { value: await write() };
  } catch (err) {
    console.warn(`${MODULE_ID} | sufferExecutor: ${what} was not saved — the meter loss stands; the GMs have a Retry for it alone:`, err?.message ?? err);
    return { refused: { ok: false, reason: "refused", error: String(err?.message ?? err), retryCall } };
  }
}

/** The card's line for an overflow the world refused. */
function overflowRefusedLine(overflow) {
  return ` — ${overflow} more as momentum: <strong>not saved</strong> (the GMs have a Retry)`;
}

/** The card's line for an overflow: " — N more as momentum: 5 → 3", with what the minimum refused. */
function overflowLine(momentumLoss) {
  if (!momentumLoss) return "";
  let line = ` — ${momentumLoss.amount} more as momentum: ${momentumLoss.before} → ${momentumLoss.after}`;
  if (momentumLoss.remaining > 0) line += minimumLine(momentumLoss.remaining, momentumLoss.redirected === true);
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

// The redirect picker of a loss of resources while unprepared (issue #325
// W16) is the price's other card posted before the move card: a pick on it is
// the move's chosen consequence, which closes its Burn Momentum / Improve
// Result (issue #311 P03) — so it says to take them first, as the resist card
// does (issue #345 AA47, Y18's sibling).
const REDIRECT_UPGRADE_FIRST = "Burn momentum or improve the result first — choosing the suffer move is the move's consequence, and closes them.";

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
      // A move's Pay the Price owes it: the card is the price's, kept when an
      // upgrade keeps the price (issue #335 Y09) — and the upgraded outcome's
      // when a kept price card's pick posts it after the upgrade (issue #342
      // Z47: it was refused as the superseded outcome's).
      executorOpts: {
        ...(opts.priceCard === true ? { priceCard: true } : {}),
        ...(opts.upgraded === true ? { upgraded: true } : {}),
      },
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
 * X03) — and post its result. The one roll of the table: no oracle seed
 * pre-rolls it (issue #336 Y21), and the card carries it into the narrator's
 * memory as an oracle result (`oracleMemory`, ledgered by the canonical GM's
 * capture hook into RECENT ORACLE RESULTS), so the narration that follows
 * depicts the row this roll gave — the issue #321 U03 rule.
 *
 * @param {string} tableId — "mortal_wound" | "desolation"
 * @param {Object} [opts] — `fixedRoll` for deterministic tests; `actorName`,
 *   whose roll it is (the memory's question)
 * @returns {Promise<{ roll: number, result: string|null }|null>} null for an unknown table
 */
export async function rollImpactTable(tableId, opts = {}) {
  const t = IMPACT_TABLES[tableId];
  if (!t) return null;
  const rolled = rollD100Table(t.table, opts);
  const who = typeof opts.actorName === "string" && opts.actorName.trim() ? opts.actorName.trim() : "";
  await postSufferCard({
    opts,
    title: t.title,
    body:  `d100 ${rolled.roll}: <em>${rolled.result}</em>`,
    flags: {
      suffer: "impact_table", table: tableId, ...rolled,
      ...(rolled.result ? { oracleMemory: { name: t.title, question: who, answer: rolled.result } } : {}),
    },
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
  if (absorbed > 0) await withoutSystemNotes(() => applyMeterChanges(actor, { health: -absorbed }));
  const after = readMeter(actor, "health");
  const atZero = after <= 0;
  const { value: momentumLoss = null, refused } = await afterMeter(() => overflowToMomentum(actor, overflow, opts),
    { kind: "meter", meterKey: "momentum", delta: -overflow }, "the harm past 0 health, as momentum");

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
    let body = `Health: ${before} → ${after}${refused ? overflowRefusedLine(overflow) : overflowLine(momentumLoss)}`;
    if (impactChoice) body += atZeroChoiceLine("harm");
    if (resistOwed)   body += resistLine("harm", upgradeFirst);
    await postSufferCard({
      opts,
      title: `Endure Harm (-${amount})`,
      body,
      flags: { suffer: "endure_harm", amount, before, after, atZero, woundedMarked, mortalWound, impactChoice, resistOwed, momentumLoss },
    });
  }
  if (impactChoice) await postAtZeroChoice(actor, "harm", opts);
  if (resistOwed)   await postResistRoll(actor, "harm", opts, upgradeFirst);

  return { before, after, atZero, woundedMarked, mortalWound, impactChoice, resistOwed, momentumLoss, ...(refused ?? {}) };
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
  if (absorbed > 0) await withoutSystemNotes(() => applyMeterChanges(actor, { spirit: -absorbed }));
  const after = readMeter(actor, "spirit");
  const atZero = after <= 0;
  const { value: momentumLoss = null, refused } = await afterMeter(() => overflowToMomentum(actor, overflow, opts),
    { kind: "meter", meterKey: "momentum", delta: -overflow }, "the stress past 0 spirit, as momentum");

  const shakenMarked = false;
  const desolation = null;
  const impactChoice = atZero && !!opts.resistMiss;
  const resistOwed   = atZero && !opts.resistMiss;
  const upgradeFirst = resistOwed && await upgradeFirstOwed(opts);

  if (!opts.skipCard) {
    let body = `Spirit: ${before} → ${after}${refused ? overflowRefusedLine(overflow) : overflowLine(momentumLoss)}`;
    if (impactChoice) body += atZeroChoiceLine("stress");
    if (resistOwed)   body += resistLine("stress", upgradeFirst);
    await postSufferCard({
      opts,
      title: `Endure Stress (-${amount})`,
      body,
      flags: { suffer: "endure_stress", amount, before, after, atZero, shakenMarked, desolation, impactChoice, resistOwed, momentumLoss },
    });
  }
  if (impactChoice) await postAtZeroChoice(actor, "stress", opts);
  if (resistOwed)   await postResistRoll(actor, "stress", opts, upgradeFirst);

  return { before, after, atZero, shakenMarked, desolation, impactChoice, resistOwed, momentumLoss, ...(refused ?? {}) };
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
 * Raising supply clears nothing: a recovery move clears the impact — for the
 * crew, as it is marked (clearUnprepared).
 *
 * @param {Actor} actor  whose supply is now 0
 * @returns {Promise<{ unpreparedMarked: boolean, alliesMarked: string[], alliesMarkedIds: string[], alliesNotMarked: string[],
 *   momentumClamped: Object<string, number> }>}
 *   `unpreparedMarked` is false when `actor` was already unprepared; the
 *   allies by name — marked now, or whose write was refused (warned, never
 *   thrown: the supply loss has landed either way) — and the ones marked now
 *   by id, so an upgrade that reverts the price clears exactly those
 *   (`alliesMarkedIds`, issue #342 D4); `momentumClamped`, by PC id, the
 *   momentum each mark's lowered maximum clamped away, which that upgrade
 *   gives back (issue #345 AA46)
 */
export async function markUnprepared(actor) {
  const marks = { unpreparedMarked: false, alliesMarked: [], alliesMarkedIds: [], alliesNotMarked: [], momentumClamped: {} };
  if (!actor) return marks;
  if (!actor.system?.debility?.unprepared) {
    await markUnpreparedOne(actor, marks.momentumClamped);
    marks.unpreparedMarked = true;
  }
  for (const ally of supplyAllies(actor)) {
    if (ally.system?.debility?.unprepared) continue;
    try {
      await markUnpreparedOne(ally, marks.momentumClamped);
      marks.alliesMarked.push(ally.name ?? ally.id);
      marks.alliesMarkedIds.push(ally.id);
    } catch (err) {
      console.warn(`${MODULE_ID} | sufferExecutor: marking ${ally.name ?? ally.id} unprepared failed:`, err?.message ?? err);
      marks.alliesNotMarked.push(ally.name ?? ally.id);
    }
  }
  return marks;
}

/**
 * Mark `pc` unprepared (actorBridge.setDebility, which clamps momentum to the
 * maximum the impact lowers — recalculateMomentumBounds) and note in
 * `clamped`, by id, the momentum that clamp took: a price "never actually
 * paid" gives it back when an upgrade reverts it (issue #345 AA46 — the
 * clear restored the maximum, never the momentum).
 */
async function markUnpreparedOne(pc, clamped) {
  const before = readMeter(pc, "momentum");
  await setDebility(pc, "unprepared", true);
  const lost = before - readMeter(pc, "momentum");
  if (lost > 0 && typeof pc.id === "string") clamped[pc.id] = lost;
}

/**
 * A recovery move has cleared `actor`'s unprepared — Resupply's "clear
 * unprepared": clear it on every ally sharing the supply too. The crew marks
 * the impact together (markUnprepared, issue #315 S07), so the recovery that
 * clears it clears it for them all: it cleared the roller's alone, and each
 * ally stayed unprepared at a supply above 0 until their own Resupply or a
 * sheet edit (known-issues UNPREPARED-CLEAR-ONE-PC; issue #338 D3). The
 * impact's one clearer, as markUnprepared is its one marker. The roller's write is not caught — refused, the pick reports it
 * (runSufferResolution); an ally's refused write is warned and named, never
 * thrown: the roller's clear has landed.
 *
 * @param {Actor} actor  the PC whose recovery cleared it
 * @returns {Promise<{ alliesCleared: string[], alliesNotCleared: string[] }>}
 *   the allies by name — cleared now, or whose write the world refused
 */
export async function clearUnprepared(actor) {
  const clears = { alliesCleared: [], alliesNotCleared: [] };
  if (!actor) return clears;
  await setDebility(actor, "unprepared", false);
  for (const ally of supplyAllies(actor)) {
    if (!ally.system?.debility?.unprepared) continue;
    try {
      await setDebility(ally, "unprepared", false);
      clears.alliesCleared.push(ally.name ?? ally.id);
    } catch (err) {
      console.warn(`${MODULE_ID} | sufferExecutor: clearing ${ally.name ?? ally.id}'s unprepared failed:`, err?.message ?? err);
      clears.alliesNotCleared.push(ally.name ?? ally.id);
    }
  }
  return clears;
}

/**
 * The allies' part of clearUnprepared's clears, for a card line ("" when no
 * ally was unprepared): who, sharing the supply, is prepared again with the
 * roller, and whose clear the world refused.
 *
 * @param {{ alliesCleared?: string[], alliesNotCleared?: string[] }} clears
 * @returns {string} HTML
 */
export function crewClearedNote({ alliesCleared = [], alliesNotCleared = [] } = {}) {
  const names = (list) => list.map(escapeHtml).join(", ");
  return [
    alliesCleared.length
      ? `${names(alliesCleared)}, sharing the supply, ${alliesCleared.length === 1 ? "is" : "are"} no longer <strong>unprepared</strong> either`
      : "",
    alliesNotCleared.length ? `${names(alliesNotCleared)} could not be cleared of unprepared — clear it on the sheet` : "",
  ].filter(Boolean).join("; ");
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
 * True when `actor` is unprepared — a loss of resources then goes to a
 * different suffer move: "When you suffer a loss of resources while
 * unprepared, envision how this causes you hardship and apply the cost to a
 * different suffer move" (vendored Sacrifice Resources). Keyed on the impact,
 * not the meter (issue #338 D3): issue #325 W16 redirected the loss at 0
 * supply alone, so a PC unprepared above 0 — Outcast's "+1 supply" at 0
 * clears nothing — paid it from the supply. Read by this executor's guard,
 * the "make a suffer move" picker's greyed Sacrifice Resources (sufferCard
 * anySufferBlocked — an enumerated card's Sacrifice Resources option stays
 * open and is redirected by this executor, issue #342 D1) and an asset
 * rider's supply cost (consequenceRiders.js).
 *
 * @param {Actor|null} actor
 * @returns {boolean}
 */
export function isUnprepared(actor) {
  return !!actor?.system?.debility?.unprepared;
}

/**
 * Sacrifice Resources executor.
 * At 0 supply → mark unprepared, with the crew (markUnprepared). A loss
 * while unprepared, at any supply, is not taken from the supply: it posts a
 * picker of the other suffer moves (`redirected`).
 */
export async function sacrificeResources(actor, amount, opts = {}) {
  if (!actor || !Number.isFinite(amount) || amount <= 0) {
    return { before: 0, after: 0, atZero: false, skipped: true };
  }
  const before = readMeter(actor, "supply");
  // Unprepared: "When you suffer a loss of resources while unprepared …
  // apply the cost to a different suffer move." At 0 the loss went 0 → 0 and
  // the cost was settled for nothing (issue #325 W16); above 0 it was paid
  // from the supply (issue #338 D3). A picker of the other suffer moves takes
  // it instead.
  if (isUnprepared(actor)) {
    const { postSufferChoiceCard } = await import("./sufferCard.js");
    // The move's context (miss, the vehicle / companion it was made against),
    // without this call's own arguments.
    const executorOpts = Object.fromEntries(Object.entries(opts ?? {})
      .filter(([key]) => !["skipCard", "amount", "itemId", "fixedRoll", "sufferCardId"].includes(key)));
    // The redirected loss is the price of the move that paid it: the picker
    // is bound to that move's resolution, so a Burn Momentum or Improve
    // Result that undoes the price retires it and refuses a late pick, as it
    // does the move's own choice cards (issue #331 X15, issue #311 P03).
    // While that move still offers a burn or an improvement, the picker (and
    // this card's line) says to take it first (REDIRECT_UPGRADE_FIRST).
    const upgradeFirst = await upgradeFirstOwed(opts);
    const redirect = await postSufferChoiceCard({
      sufferPrompt: { kind: "any", amount, count: 1, exclude: ["sacrifice_resources"],
        ...(upgradeFirst ? { hint: REDIRECT_UPGRADE_FIRST } : {}) },
      actor,
      executorOpts,
      resolutionId: typeof opts.resolutionId === "string" && opts.resolutionId ? opts.resolutionId : null,
    });
    const atZero = before <= 0;
    const first = redirect && upgradeFirst
      ? `; ${REDIRECT_UPGRADE_FIRST.charAt(0).toLowerCase()}${REDIRECT_UPGRADE_FIRST.slice(1, -1)}` : "";
    // The picker is posted first — this card says whether it was — so it sits
    // above this card: "choose below" pointed at nothing (W16-CHOOSE-BELOW).
    if (!opts.skipCard) {
      await postSufferCard({
        opts,
        title: `Sacrifice Resources (-${amount})`,
        body: `Supply: ${before} — <strong>unprepared</strong>: the loss goes to another suffer move${redirect ? ` (choose it on its card${first})` : " — choose one and apply it on the sheet"}.`,
        flags: { suffer: "sacrifice_resources", amount, before, after: before, atZero, unpreparedMarked: false, redirected: true },
      });
    }
    return { before, after: before, atZero, unpreparedMarked: false, redirected: true };
  }
  await withoutSystemNotes(() => applyMeterChanges(actor, { supply: -amount }));
  const after = readMeter(actor, "supply");
  const atZero = after <= 0;

  // The payer's own mark refused: reported apart, its Retry marks the crew
  // alone — never the supply loss again (SUFFER-RETRY-WHOLE-AFTER-METER).
  const { value: marks = null, refused } = atZero
    ? await afterMeter(() => markUnprepared(actor), { kind: "mark", debility: "unprepared" }, "the unprepared mark at 0 supply")
    : {};
  const unpreparedMarked = !!marks?.unpreparedMarked;
  // Whom this loss marked unprepared, by id: an upgrade that reverts the
  // price clears exactly those marks (issue #342 D4), and gives back the
  // momentum each mark clamped (issue #345 AA46).
  const alliesMarkedIds = marks?.alliesMarkedIds ?? [];
  const momentumClamped = marks?.momentumClamped ?? {};

  if (!opts.skipCard) {
    let body = `Supply: ${before} → ${after}`;
    if (unpreparedMarked) body += " — marked <strong>unprepared</strong>";
    if (refused) body += " — unprepared <strong>not saved</strong> (the GMs have a Retry)";
    if (atZero && !unpreparedMarked && !refused) body += " — further loss redirects to another suffer move";
    const crew = crewUnpreparedNote(marks ?? {});
    if (crew) body += ` — ${crew}`;
    await postSufferCard({
      opts,
      title: `Sacrifice Resources (-${amount})`,
      body,
      flags: { suffer: "sacrifice_resources", amount, before, after, atZero, unpreparedMarked },
    });
  }

  return { before, after, atZero, unpreparedMarked, alliesMarkedIds, momentumClamped, ...(refused ?? {}) };
}

/**
 * Companion Takes a Hit executor — the "any" suffer picker's button and Pay
 * the Price's "companion in harm's way" route.
 *
 * The companion's health is its asset's condition track (`system.track`),
 * written through actorBridge.applyCompanionHealthChange — the write the
 * consequence card's choices use (issue #309 N03). This executor read and
 * wrote `system.condition` / `system.health`, which the vendor's asset has
 * not, and the picker passes no item id: it posted "Companion not found"
 * (SUFFER-EXECUTOR-ASSET-SCHEMA). With no id, the character's only
 * companion. Harm past 0 health is momentum (overflowToMomentum — the card's
 * rule, issue #345 AA15). At 0 on a miss with a match the companion is
 * destroyed: a prompt to discard it (Q2 — the asset is not deleted).
 *
 * @param {Actor} actor
 * @param {string|null} companionItemId  the asset Item id (null: the move's
 *   companion, `opts.companionItemId`, else the only companion)
 * @param {number} amount
 * @param {Object} [opts]
 * @param {boolean} [opts.isMissWithMatch]  miss + match → destruction prompt
 * @param {boolean} [opts.skipCard]
 * @returns {Promise<Object>} `before`, `after`, `atZero`, `destroyed`, the
 *   companion (`itemId`, `name`) and `momentumLoss` past 0; `skipped` with
 *   `ok: false` and the reason when there is no such companion. A write the
 *   world refuses throws (runSufferResolution reports it, with a Retry).
 */
export async function companionTakesAHit(actor, companionItemId, amount, opts = {}) {
  if (!actor || !Number.isFinite(amount) || amount <= 0) {
    return { before: 0, after: 0, destroyed: false, skipped: true };
  }
  // The companion the move was about (the card's targets), when the pick names none.
  companionItemId = companionItemId ?? opts.companionItemId ?? null;
  const { applyCompanionHealthChange } = await import("../character/actorBridge.js");
  const res = await withoutSystemNotes(() => applyCompanionHealthChange(actor, -amount, { itemId: companionItemId }));
  if (res.reason === "refused") throw new Error(res.error ?? "the world did not save the companion's health");
  if (!res.ok) {
    // No such companion (or several, none named) — a user-visible failure
    // worth flagging rather than silently no-oping.
    await postSufferCard({
      opts,
      title: `Companion Takes a Hit (-${amount})`,
      body: companionItemId
        ? `Companion not found (id ${escapeHtml(companionItemId)}). Apply the damage manually.`
        : `No companion to take it — ${escapeHtml(actor.name ?? "the character")} has none, or several (apply it on the sheet).`,
      flags: { suffer: "companion_takes_a_hit", error: "companion-not-found" },
    });
    return { before: 0, after: 0, destroyed: false, skipped: true, ok: false, reason: "no-companion" };
  }

  const { before, after } = res;
  const overflow = amount - Math.max(0, before - after);
  const { value: momentumLoss = null, refused } = await afterMeter(() => overflowToMomentum(actor, overflow, opts),
    { kind: "meter", meterKey: "momentum", delta: -overflow }, "the companion's harm past 0 health, as momentum");
  const atZero = after <= 0;
  const destroyed = atZero && opts.isMissWithMatch === true;

  if (!opts.skipCard) {
    let body = `${escapeHtml(res.name ?? "Companion")}: ${before} → ${after}${refused ? overflowRefusedLine(overflow) : overflowLine(momentumLoss)}`;   // the player names the asset (issue #336 Y28)
    if (destroyed) {
      body += `<br/><strong>Companion destroyed.</strong> Open the character sheet → Assets and discard this companion.`;
    } else if (atZero) {
      body += ` — out of action until aided`;
    }
    await postSufferCard({
      opts,
      title: `Companion Takes a Hit (-${amount})`,
      body,
      flags: { suffer: "companion_takes_a_hit", amount, before, after, atZero, destroyed, companionItemId: res.itemId ?? null },
    });
  }

  return { before, after, atZero, destroyed, itemId: res.itemId ?? null, name: res.name ?? null, ...(momentumLoss ? { momentumLoss } : {}), ...(refused ?? {}) };
}

/**
 * Withstand Damage executor — the "any" suffer picker's button and Pay the
 * Price's "your vehicle suffers damage" route.
 *
 * The vehicle is the support vehicle `vehicleItemId` names on the character
 * (its Integrity track — actorBridge.applyVehicleAssetIntegrityChange), else
 * the vehicle the move was rolled against (`opts.vehicleActorId`), else the
 * command vehicle — its integrity through the ship record's one writer
 * (entities/ship.js changeIntegrity: the STARSHIP asset's track, issue #345
 * AA20). These are the writes the consequence card's choices use
 * (sufferDialog's integrity meter). This executor read and wrote
 * `system.condition` / `system.integrity` on an asset Item, which neither
 * store is, and posted "Vehicle not found" for the picker's id-less call
 * (SUFFER-EXECUTOR-ASSET-SCHEMA). Damage past 0 is momentum (issue #345
 * AA15). At 0 the VEHICLE_DAMAGE d100 is rolled; for the command vehicle a
 * catastrophic result surfaces an Overcome Destruction prompt (Q2 — prompt
 * only, the GM adjudicates).
 *
 * @param {Actor} actor
 * @param {string|null} vehicleItemId  a support vehicle asset's id (null: the
 *   move's, `opts.vehicleItemId`, else the command vehicle)
 * @param {number} amount
 * @param {Object} [opts]
 * @param {string|null} [opts.vehicleActorId]  the vehicle the move was rolled against
 * @param {boolean} [opts.skipCard]
 * @param {number} [opts.fixedRoll]  the vehicle-damage d100, for tests
 * @returns {Promise<Object>} `before`, `after`, `atZero`, `vehicleDamage`,
 *   `isCommandVehicle`, `momentumLoss` past 0; `skipped` with `ok: false` and
 *   the reason when there is no such vehicle. A write the world refuses throws.
 */
export async function withstandDamage(actor, vehicleItemId, amount, opts = {}) {
  if (!actor || !Number.isFinite(amount) || amount <= 0) {
    return { before: 0, after: 0, atZero: false, skipped: true };
  }
  // The support vehicle the move was rolled for (the card's targets), when the pick names none.
  vehicleItemId = vehicleItemId ?? opts.vehicleItemId ?? null;
  const { applyVehicleAssetIntegrityChange, listSupportVehicleAssets } = await import("../character/actorBridge.js");
  const support = vehicleItemId ? listSupportVehicleAssets(actor).some(i => i.id === vehicleItemId) : false;
  let res;
  let vehicleActorId = null;
  if (support) {
    res = await withoutSystemNotes(() => applyVehicleAssetIntegrityChange(actor, -amount, { itemId: vehicleItemId }));
  } else if (vehicleItemId) {
    res = { ok: false, reason: "no-vehicle" };
  } else {
    const { getCommandVehicleActorId, changeIntegrity } = await import("../entities/ship.js");
    vehicleActorId = opts.vehicleActorId
      ?? getCommandVehicleActorId(globalThis.game?.settings?.get?.(MODULE_ID, "campaignState") ?? {}) ?? null;
    res = await withoutSystemNotes(() => changeIntegrity(vehicleActorId, -amount));
  }
  if (res.reason === "refused") throw new Error(res.error ?? "the world did not save the vehicle's integrity");
  if (!res.ok) {
    await postSufferCard({
      opts,
      title: `Withstand Damage (-${amount})`,
      body: vehicleItemId
        ? `Vehicle not found (id ${escapeHtml(vehicleItemId)}). Apply the damage manually.`
        : `No vehicle to take it — there is no command vehicle (apply it on the sheet).`,
      flags: { suffer: "withstand_damage", error: "vehicle-not-found" },
    });
    return { before: 0, after: 0, atZero: false, skipped: true, ok: false, reason: "no-vehicle" };
  }

  const { before, after } = res;
  const isCommandVehicle = !support;
  const overflow = amount - Math.max(0, before - after);
  const { value: momentumLoss = null, refused } = await afterMeter(() => overflowToMomentum(actor, overflow, opts),
    { kind: "meter", meterKey: "momentum", delta: -overflow }, "the vehicle's damage past 0 integrity, as momentum");
  const atZero = after <= 0;
  const vehicleDamage = atZero ? rollD100Table(VEHICLE_DAMAGE, opts) : null;

  if (!opts.skipCard) {
    let body = `${escapeHtml(res.name ?? "The vehicle")}: ${before} → ${after}${refused ? overflowRefusedLine(overflow) : overflowLine(momentumLoss)}`;   // the player names the asset (issue #336 Y28)
    if (vehicleDamage) {
      body += `<br/>Vehicle Damage (d100 ${vehicleDamage.roll}): <em>${vehicleDamage.result}</em>`;
      if (isCommandVehicle && /catastrophic|destruction/i.test(vehicleDamage.result)) {
        body += `<br/><strong>Command vehicle destruction.</strong> Trigger Overcome Destruction when ready.`;
      }
    }
    await postSufferCard({
      opts,
      title: `Withstand Damage (-${amount})`,
      body,
      flags: { suffer: "withstand_damage", amount, before, after, atZero, vehicleDamage,
        vehicleItemId: support ? vehicleItemId : null, vehicleActorId },
    });
  }

  return { before, after, atZero, vehicleDamage, isCommandVehicle, name: res.name ?? null,
    ...(support ? { itemId: vehicleItemId } : { vehicleActorId }), ...(momentumLoss ? { momentumLoss } : {}), ...(refused ?? {}) };
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
