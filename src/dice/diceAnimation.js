/**
 * STARFORGED COMPANION
 * src/dice/diceAnimation.js
 *
 * Dice So Nice (DSN) bridge — display-only 3D dice for the module's rolls.
 *
 * The module's dice are generated with Math.random() in the pure, synchronous,
 * Foundry-free resolver/roller (src/moves/resolver.js, src/oracles/roller.js)
 * so the core logic stays unit-testable. That means no Foundry `Roll` object is
 * ever created, and Dice So Nice — which only animates dice that pass through
 * Foundry's dice pipeline — never fires.
 *
 * This helper closes that gap WITHOUT touching the pure logic: given the
 * already-rolled values, it builds an evaluated Foundry `Roll` whose dice carry
 * exactly those results, then hands it to `game.dice3d.showForRoll`. The dice
 * the player sees tumble therefore always match the numbers on the chat card.
 *
 * Everything here is best-effort and fail-open: if Dice So Nice is not
 * installed (`game.dice3d` is undefined) or the Foundry dice classes are not
 * where we expect them, every entry point quietly returns false. A missing
 * animation is never allowed to break a move or an oracle roll.
 *
 * Note: `game.dice3d` and the `Roll`/`Die` internals used here are an optional
 * module's API and Foundry dice internals respectively; neither is in
 * docs/foundry-reference/foundry-api-reference.md. We follow the showForRoll
 * pattern the vendored foundry-ironsworn system uses and fail-open on any
 * version drift.
 */

const MODULE_ID = "starforged-companion";

/**
 * Resolve the Foundry Roll class across v12/v13 (global `Roll`, or the
 * namespaced `foundry.dice.Roll`). Returns null when unavailable.
 */
function getRollClass() {
  return globalThis.Roll ?? globalThis.foundry?.dice?.Roll ?? null;
}

/**
 * Resolve the Foundry Die term class across v12/v13. v13 namespaces dice term
 * classes under `foundry.dice.terms`; v12 exposes `Die` globally.
 */
function getDieClass() {
  return globalThis.foundry?.dice?.terms?.Die ?? globalThis.Die ?? null;
}

/**
 * Build an evaluated Die term of N dice with preset results.
 * Returns null if the Die class can't be resolved.
 *
 * @param {number} faces
 * @param {number[]} values — one result per physical die
 */
function buildPresetDie(faces, values) {
  const DieClass = getDieClass();
  if (!DieClass) return null;
  let die;
  try {
    die = new DieClass({ number: values.length, faces });
  } catch {
    return null;
  }
  // Mark the term evaluated and stamp our predetermined results so DSN renders
  // these exact values instead of re-rolling. `active: true` keeps every die in
  // the visible pool (none discarded by keep/drop modifiers — we have none).
  die._evaluated = true;
  die.results = values.map(v => ({ result: v, active: true }));
  return die;
}

/**
 * Build an evaluated single-term Roll ("Nd<faces>") with preset results.
 * Returns null on any failure.
 */
function buildPresetRoll(faces, values) {
  const RollClass = getRollClass();
  if (!RollClass || !Array.isArray(values) || !values.length) return null;
  const die = buildPresetDie(faces, values);
  if (!die) return null;
  let roll;
  try {
    roll = RollClass.fromTerms([die]);
  } catch {
    return null;
  }
  // fromTerms doesn't always flag the roll evaluated; do it explicitly so
  // showForRoll renders rather than re-evaluating (which would randomise).
  roll._evaluated = true;
  return roll;
}

/**
 * Show one die-group (e.g. 2d10) via Dice So Nice. Fire-and-forget friendly —
 * returns the showForRoll promise (resolves true/false) or false synchronously
 * when DSN/classes are unavailable.
 */
function showGroup(faces, values) {
  const dice3d = globalThis.game?.dice3d;
  if (!dice3d?.showForRoll) return Promise.resolve(false);
  const roll = buildPresetRoll(faces, values);
  if (!roll) return Promise.resolve(false);
  // synchronize=true so co-op players see the dice too; harmless in solo play.
  return Promise.resolve(dice3d.showForRoll(roll, globalThis.game?.user ?? null, true))
    .catch(err => {
      console.debug?.(`${MODULE_ID} | diceAnimation: showForRoll failed:`, err?.message ?? err);
      return false;
    });
}

// ── Public entry points ───────────────────────────────────────────────────────

/**
 * Animate an Ironsworn action roll: the action die (d6) and challenge dice
 * (2d10). Either may be omitted/empty — progress moves have no action die, so
 * only the challenge pair animates. Fire-and-forget.
 *
 * @param {number|null} actionDie       — the rolled d6 (0/falsy → skipped, e.g. progress moves)
 * @param {number[]}    challengeDice   — the rolled challenge dice (typically two d10)
 * @returns {Promise<boolean>} true if any group was handed to DSN
 */
export function showActionRoll(actionDie, challengeDice) {
  const groups = [];
  if (Number.isFinite(actionDie) && actionDie > 0) {
    groups.push(showGroup(6, [actionDie]));
  }
  if (Array.isArray(challengeDice) && challengeDice.length) {
    const clean = challengeDice.filter(v => Number.isFinite(v));
    if (clean.length) groups.push(showGroup(10, clean));
  }
  if (!groups.length) return Promise.resolve(false);
  return Promise.all(groups).then(rs => rs.some(Boolean));
}

/**
 * Animate a d100 oracle roll (Ask the Oracle, Pay the Price, decisive-action
 * cost, table rolls). Fire-and-forget.
 *
 * @param {number} value — the rolled d100 (1–100)
 * @returns {Promise<boolean>}
 */
export function showD100(value) {
  if (!Number.isFinite(value)) return Promise.resolve(false);
  return showGroup(100, [value]);
}

/**
 * Animate a resolved move's dice straight from the resolution record. Reads
 * actionDie + challengeDice and routes through showActionRoll, so progress
 * moves (actionDie 0) animate only the challenge pair. Fire-and-forget.
 *
 * @param {{ actionDie?: number, challengeDice?: number[] }} resolution
 * @returns {Promise<boolean>}
 */
export function showMoveRoll(resolution) {
  if (!resolution) return Promise.resolve(false);
  return showActionRoll(resolution.actionDie, resolution.challengeDice);
}
