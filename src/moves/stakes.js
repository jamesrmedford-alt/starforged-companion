/**
 * STARFORGED COMPANION
 * src/moves/stakes.js — the stakes stated before a roll (issue #353 R1)
 *
 * A miss's cost often had nothing to do with what was attempted: every miss
 * that pays the price rolled the Pay the Price table, so a scan's miss came
 * back "You are delayed or put at a disadvantage" with nothing behind it
 * (alpha 23 playtest). The rule's first choice is "make the most obvious
 * negative outcome happen" (Pay the Price).
 *
 * The move interpreter now says, from the scene, what a hit would get the
 * character and what a miss would cost — its most obvious negative outcome —
 * and may name one suffer move the miss costs (`missSuffer`). The Confirm
 * dialog shows both before the roll; a miss that pays the price pays the one
 * stated (decided, maintainer 2026-11-13: the stated outcome is a miss's
 * default price, the Pay the Price table the alternative — rolled when no
 * miss was stated, or with the world setting off), through the same suffer
 * executors and receipts a burn undoes; and the narrator is told the stakes
 * and delivers the one the outcome calls for.
 *
 * Built from the scene only — never from a hidden plan: the stakes are shown
 * on the roller's screen before the roll, and the plans are the GM's.
 */

const MODULE_ID = "starforged-companion";

/** The world setting: a miss that pays the price pays the stated stakes (default on). */
export const STAKES_SETTING = "missPaysStatedStakes";

/** The longest stakes line kept (a line, not a paragraph). */
export const STAKES_LINE_MAX = 200;

/**
 * The suffer moves a stated miss may name: the routes Pay the Price's table
 * annotates (src/oracles/tables/payThePrice.js) — Lose Momentum among them
 * since issue #354 P2-12, for being "delayed or put at a disadvantage". The
 * names as the narrator, the dialog and the Pay the Price card show them.
 */
export const STATED_SUFFER_MOVES = Object.freeze({
  endure_harm:           "Endure Harm",
  endure_stress:         "Endure Stress",
  lose_momentum:         "Lose Momentum",
  sacrifice_resources:   "Sacrifice Resources",
  withstand_damage:      "Withstand Damage",
  companion_takes_a_hit: "Companion Takes a Hit",
});

/** One stakes line: a trimmed, single-line string within STAKES_LINE_MAX, or null. */
function stakesLine(value) {
  if (typeof value !== "string") return null;
  const s = value.replace(/\s+/g, " ").trim();
  if (!s) return null;
  return s.length > STAKES_LINE_MAX ? `${s.slice(0, STAKES_LINE_MAX - 1).trimEnd()}…` : s;
}

/**
 * The interpreter's `stakes` as the module keeps them: a hit line, a miss
 * line, and the miss's suffer move — a known one, 1–3 — only beside a miss
 * line. Null when it gave neither line. Pure.
 *
 * @param {*} raw
 * @returns {{ hit: string|null, miss: string|null, missSuffer: { move: string, amount: number }|null }|null}
 */
export function normaliseStakes(raw) {
  if (!raw || typeof raw !== "object") return null;
  const hit  = stakesLine(raw.hit);
  const miss = stakesLine(raw.miss);
  if (!hit && !miss) return null;
  let missSuffer = null;
  const s = raw.missSuffer;
  if (miss && s && typeof s === "object" && typeof s.move === "string" && Object.hasOwn(STATED_SUFFER_MOVES, s.move)) {
    const n = Number(s.amount ?? 1);
    missSuffer = { move: s.move, amount: Number.isInteger(n) ? Math.min(3, Math.max(1, n)) : 1 };
  }
  return { hit, miss, missSuffer };
}

/** Whether a miss pays the stated stakes (the world setting, default on). Fail-open: on. */
export function statedPriceEnabled() {
  try {
    return globalThis.game?.settings?.get?.(MODULE_ID, STAKES_SETTING) !== false;
  } catch {
    return true;
  }
}

/**
 * Stakes as the interpretation carries them: with `priceStated` — whether a
 * miss pays the stated miss (one was stated, and the setting is on) — fixed
 * when they are read, so the dialog shows what the roll then pays.
 *
 * @param {Object|null} stakes — normaliseStakes'
 * @returns {Object|null}
 */
export function withPriceSource(stakes) {
  if (!stakes) return null;
  return { ...stakes, priceStated: !!stakes.miss && statedPriceEnabled() };
}

/**
 * The price a miss pays when it is the stated one: the miss line, and its
 * suffer move as a Pay the Price route (Companion Takes a Hit falls back to
 * Endure Harm with no companion, as the table's route does). Null when the
 * stakes state no price — the table is rolled.
 *
 * @param {Object|null} stakes — the interpretation's (withPriceSource)
 * @returns {{ price: string, sufferRoutes: Array<{ move: string, amount: number, soloFallback?: string }> }|null}
 */
export function statedPrice(stakes) {
  if (!stakes?.priceStated || !stakes.miss) return null;
  const s = stakes.missSuffer;
  const route = s && Object.hasOwn(STATED_SUFFER_MOVES, s.move)
    ? { move: s.move, amount: s.amount, ...(s.move === "companion_takes_a_hit" ? { soloFallback: "endure_harm" } : {}) }
    : null;
  return { price: stakes.miss, sufferRoutes: route ? [route] : [] };
}

/** "Endure Harm −1" — a stated suffer move as the dialog and the narrator show it. */
export function sufferRouteLabel(route) {
  const name = STATED_SUFFER_MOVES[route?.move];
  return name ? `${name} −${route.amount ?? 1}` : "";
}

/** The lines a dialog shows: the hit, and the miss when it is the price. Empty for no stakes. */
export function stakesShown(stakes) {
  if (!stakes) return [];
  const out = [];
  if (stakes.hit) out.push({ kind: "hit", text: stakes.hit });
  if (stakes.miss && stakes.priceStated) {
    out.push({ kind: "miss", text: stakes.miss, cost: stakes.missSuffer ? sufferRouteLabel(stakes.missSuffer) : "" });
  }
  return out;
}

/**
 * The narrator's STAKES block (issue #353 R1): what the player saw before
 * the roll, and which of it this outcome delivers. '' with nothing shown.
 *
 * @param {Object|null} stakes — the resolution's
 * @param {string|null} outcome — "strong_hit" | "weak_hit" | "miss"
 * @returns {string}
 */
export function formatStakesBlock(stakes, outcome) {
  const shown = stakesShown(stakes);
  if (!shown.length) return "";
  const lines = ["## STAKES STATED BEFORE THE ROLL", "", "The player saw these before rolling:"];
  for (const s of shown) {
    lines.push(s.kind === "hit" ? `- On a hit: ${s.text}` : `- On a miss: ${s.text}${s.cost ? ` (${s.cost})` : ""}`);
  }
  const hit  = shown.some(s => s.kind === "hit");
  const miss = shown.some(s => s.kind === "miss");
  let deliver = "";
  if (outcome === "strong_hit" && hit) deliver = "This is a strong hit: deliver the hit as stated.";
  else if (outcome === "weak_hit" && hit) deliver = "This is a weak hit: deliver the hit as stated, with the cost or complication the move outcome names.";
  else if (outcome === "miss" && miss) deliver = "This is a miss: deliver the miss as stated — it is what this miss costs.";
  else if (outcome === "miss") deliver = "This is a miss: the hit did not come. Its cost is the move outcome's, not a stated one.";
  if (deliver) lines.push("", deliver);
  return lines.join("\n");
}
