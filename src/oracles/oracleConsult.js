/**
 * STARFORGED COMPANION
 * src/oracles/oracleConsult.js — Ask the Oracle about a planned subject
 * consults its plan (issue #353 Phase 3)
 *
 * A yes/no question about a subject the narrative skeleton holds a plan for
 * is rolled with odds set from the plan's truth, so the answer cannot
 * contradict it (decided, on every Mischief setting). One short Haiku call
 * reads the hidden truth against the question and names the odds; the d100
 * is rolled as always. Only a question whose subject a decided plan names is
 * consulted; any failure keeps the odds the player gave (fail-open).
 *
 * Runs where the yes/no is rolled — the client that typed `!oracle yes`
 * (index.js handleOracleCommand) — and only on a GM's: the plans are the
 * GM's (known-issues ORACLE-CONSULT-PLAYER-ROLL).
 */

import { apiPost } from "../api-proxy.js";
import { listSkeletons, skeletonsEnabled } from "../world/secrets.js";
import { nameMentioned, sameQuestion } from "../world/skeletons.js";

const MODULE_ID     = "starforged-companion";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const HAIKU_MODEL   = "claude-haiku-5-5";

/** The odds a consult may set, as rollYesNo names them. */
export const CONSULT_ODDS = Object.freeze(["small_chance", "unlikely", "50_50", "likely", "almost_certain"]);

const SYSTEM = [
  "You set the odds for an oracle's yes/no question in a tabletop roleplaying game.",
  "You are given what is secretly true about the question's subject, and the question.",
  "Answer with exactly one of: almost_certain, likely, 50_50, unlikely, small_chance —",
  "how likely the answer is YES given the truth. almost_certain when the truth says yes;",
  "small_chance when it says no; 50_50 when the truth does not bear on the question.",
  "Reply with the one word only.",
].join("\n");

/**
 * The decided plan a question is about: a mystery whose question it asks, or
 * a plan whose subject it names. Null for none.
 *
 * @param {string} question
 * @returns {Object|null}
 */
export function planForQuestion(question) {
  if (typeof question !== "string" || !question.trim() || !skeletonsEnabled()) return null;
  const decided = listSkeletons().filter(r => r.truth);
  return decided.find(r => r.kind === "mystery" && r.question && sameQuestion(r.question, question))
    ?? decided.find(r => nameMentioned(r.subject.name, question))
    ?? null;
}

/**
 * The odds a question about a planned subject is rolled at, from its plan's
 * truth — or null to keep the player's (no plan, no key, a reply that names
 * no odds, any failure).
 *
 * @param {string} question
 * @param {{ apiKey?: string|null }} [opts] — the Claude key (the client's setting by default)
 * @returns {Promise<{ odds: string, planId: string }|null>}
 */
export async function oddsFromPlan(question, { apiKey = null } = {}) {
  const plan = planForQuestion(question);
  if (!plan) return null;
  let key = apiKey;
  if (!key) {
    try { key = globalThis.game?.settings?.get?.(MODULE_ID, "claudeApiKey") || null; } catch { key = null; }
  }
  if (!key) return null;
  try {
    const subject = plan.kind === "mystery" && plan.question ? `the answer to "${plan.question}"` : plan.subject.name;
    const data = await apiPost(ANTHROPIC_URL, {
      "Content-Type":      "application/json",
      "x-api-key":         key,
      "anthropic-version": "2023-06-01",
    }, {
      model:      HAIKU_MODEL,
      max_tokens: 40,
      system:     [{ type: "text", text: SYSTEM }],
      messages:   [{ role: "user", content: `What is true about ${subject}: ${plan.truth}\nQuestion: ${question}\nOdds:` }],
    }, { label: "oracleConsult" });
    const text = (data?.content ?? []).filter(b => b.type === "text").map(b => b.text).join("").toLowerCase();
    const odds = CONSULT_ODDS.find(o => text.includes(o)) ?? (/\b50\s*\/\s*50\b/.test(text) ? "50_50" : null);
    return odds ? { odds, planId: plan.id } : null;
  } catch (err) {
    console.warn(`${MODULE_ID} | oracle: consulting the plan failed — the odds given are kept:`, err?.message ?? err);
    return null;
  }
}
