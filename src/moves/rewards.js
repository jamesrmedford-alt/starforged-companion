/**
 * STARFORGED COMPANION
 * src/moves/rewards.js — stakes & rewards stated up front (#241)
 *
 * Phase 1: pure helpers that render the rules-defined payoff of a ranked vow /
 * combat / connection track — progress-per-milestone and the legacy reward on
 * completion — so the stakes are visible the moment the track is created.
 * (Phase 2 adds the AI-proposed concrete reward + grant-by-form here.)
 */

import { RANK_TICKS, rankName } from "../schemas.js";
import { legacyRewardTicks } from "./expedition.js";
import { apiPost } from "../api-proxy.js";

const MODULE_ID     = "starforged-companion";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const REWARD_MODEL  = "claude-haiku-4-5-20251001";
const BOX_TICKS     = 4;

// How a promised concrete reward is delivered mechanically (#241 Phase 2).
export const REWARD_FORMS = ["asset", "gear", "supply", "momentum", "contact", "knowledge"];

/**
 * How much one milestone advances a track of the given rank, in plain language
 * (e.g. "Rank dangerous — each milestone marks 2 boxes (8 ticks) of progress.").
 * Pure.
 *
 * @param {string|number} rank
 * @returns {string}
 */
export function progressPerMilestoneLine(rank) {
  const name    = rankName(rank);
  const perMark = RANK_TICKS[name] ?? 4;
  const boxes   = perMark / BOX_TICKS;
  const amount  = boxes >= 1
    ? `${boxes} box${boxes === 1 ? "" : "es"} (${perMark} ticks)`
    : `${perMark} tick${perMark === 1 ? "" : "s"}`;
  return `Rank ${name} — each milestone marks ${amount} of progress.`;
}

/**
 * The legacy reward earned on completing a ranked track (vows → Quests,
 * expeditions → Discoveries). Pure.
 *
 * @param {string|number} rank
 * @param {string} legacyLabel  "Quests" | "Discoveries"
 * @returns {string}
 */
export function legacyRewardLine(rank, legacyLabel) {
  const name   = rankName(rank);
  const strong = legacyRewardTicks(name, 0);
  const weak   = legacyRewardTicks(name, 1);
  return `On fulfilment: +${strong} ${legacyLabel} legacy tick${strong === 1 ? "" : "s"} (strong hit) · +${weak} (weak hit).`;
}

// ── Concrete promised rewards (#241 Phase 2) ────────────────────────────────

/**
 * Parse the model's reward-proposal JSON into ≤2 `{ description, form }` options.
 * Pure + defensive (mirrors abilityScanner.parseHaikuResponse): strips fences,
 * slices to the outermost object, clamps to 2, normalises the form. Exported
 * for tests.
 *
 * @param {string} raw
 * @returns {Array<{ description: string, form: string }>}
 */
export function parseRewardProposals(raw) {
  if (!raw) return [];
  try {
    const s       = String(raw).replace(/```(?:json)?|```/g, "").trim();
    const first   = s.indexOf("{");
    const last    = s.lastIndexOf("}");
    const cleaned = (first >= 0 && last > first) ? s.slice(first, last + 1) : s;
    const parsed  = JSON.parse(cleaned);
    const arr     = Array.isArray(parsed?.rewards) ? parsed.rewards : [];
    return arr
      .filter(r => r && typeof r.description === "string" && r.description.trim())
      .slice(0, 2)
      .map(r => ({
        description: r.description.trim().slice(0, 120),
        form:        REWARD_FORMS.includes(r.form) ? r.form : "gear",
      }));
  } catch (err) {
    console.warn(`${MODULE_ID} | rewards: proposal JSON parse failed:`, err?.message ?? err);
    return [];
  }
}

function buildRewardPrompt(kind, target, context) {
  const moment = {
    vow:    "a player character has just sworn a vow",
    combat: "a player character is entering a fight",
    bond:   "a player character is forging a bond with a connection",
  }[kind] ?? "a player character has taken on a challenge";
  return [
    `In an Ironsworn: Starforged campaign, ${moment}${target ? ` involving "${target}"` : ""}.`,
    context ? `Context: ${context}` : "",
    ``,
    `Propose TWO concrete, fiction-grounded rewards they could earn by succeeding — the kind of`,
    `tangible payoff a GM would promise up front (e.g. a custom raygun, safe passage, a useful`,
    `contact, a vital secret). Keep each description short and specific.`,
    ``,
    `Return ONLY JSON: { "rewards": [ { "description": "<short concrete reward>", "form": "<asset|gear|supply|momentum|contact|knowledge>" }, { ... } ] }`,
    `- form "asset"/"gear" = equipment or a new capability; "supply"/"momentum" = a resource boost;`,
    `  "contact" = a useful person; "knowledge" = a secret or lead.`,
    `- Exactly two rewards. Output JSON only, no prose, no markdown fences.`,
  ].filter(Boolean).join("\n");
}

async function callRewardModel(userPrompt, apiKey) {
  const data = await apiPost(
    ANTHROPIC_URL,
    { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    { model: REWARD_MODEL, max_tokens: 400, messages: [{ role: "user", content: userPrompt }] },
  );
  return (data?.content ?? []).filter(b => b?.type === "text").map(b => b.text).join("");
}

/**
 * Ask the model to propose two concrete rewards for a creation moment. Returns
 * ≤2 `{ description, form }` options, or [] when there's no key or the call
 * fails (callers fall back to "propose your own"). `_call` is injectable for tests.
 *
 * @param {{ kind: "vow"|"combat"|"bond", target?: string, context?: string, apiKey: string }} args
 * @returns {Promise<Array<{ description: string, form: string }>>}
 */
export async function proposeRewards({ kind, target, context, apiKey }, { _call = callRewardModel } = {}) {
  if (!apiKey) return [];
  let raw;
  try {
    raw = await _call(buildRewardPrompt(kind, target, context), apiKey);
  } catch (err) {
    console.warn(`${MODULE_ID} | rewards: proposal call failed:`, err?.message ?? err);
    return [];
  }
  return parseRewardProposals(raw);
}

/**
 * Plan how to grant a promised reward on a given outcome (#241 Phase 2). Pure —
 * returns a descriptor the GM-side dispatcher applies. Strong hit delivers it
 * cleanly; a weak hit still delivers but reduced (meters) or with a string
 * (everything else); a miss loses it.
 *
 * @param {{ description: string, form: string }} reward
 * @param {"strong_hit"|"weak_hit"|"miss"} outcome
 * @returns {{ status: "granted"|"lost", form?: string, description?: string, amount?: number, withString?: boolean }}
 */
export function planRewardGrant(reward, outcome) {
  if (!reward?.description) return { status: "lost" };
  if (outcome === "miss")  return { status: "lost", form: reward.form, description: reward.description };
  const full = outcome === "strong_hit";
  const base = { status: "granted", form: reward.form, description: reward.description };
  if (reward.form === "supply" || reward.form === "momentum") {
    return { ...base, amount: full ? 2 : 1 };          // resource boost scales with the hit
  }
  return { ...base, withString: !full };               // gear/asset/contact/knowledge land; weak = a complication
}
