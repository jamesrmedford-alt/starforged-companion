/**
 * STARFORGED COMPANION
 * src/system/campaignTruths.js — Inject foundry-ironsworn canonical truths
 *
 * Phase 8 of the system asset integration scope. Builds a digest of the
 * campaign's selected setting truths and formats them as a `<campaign_truths>`
 * block for the narrator system prompt.
 *
 * Behaviour:
 *   - Reads `campaignState.canonicalTruthSlugs` — an array of slugs the GM
 *     has selected from the system's truth compendium (e.g. "cataclysm/war").
 *   - Looks up each slug in the starforged-truths pack via ironswornPacks.
 *   - Returns a single digest string. Returns empty string when no truths
 *     are selected, the pack is unavailable, or no entries resolve.
 *
 * Pure formatter `formatCampaignTruthsBlock` is exported separately for
 * unit testing without needing a live compendium.
 */

import { listCanonicalTruths } from "./ironswornPacks.js";

/**
 * Format a list of {category, title, summary?} entries as a single
 * `<campaign_truths>` block for inclusion in the narrator system prompt.
 *
 * Pure — no async, no Foundry API. Exported for testing.
 *
 * @param {Array<{category: string, title: string, summary?: string}>} entries
 * @returns {string}
 */
export function formatCampaignTruthsBlock(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return "";
  const lines = ["<campaign_truths>"];
  for (const e of entries) {
    if (!e?.title) continue;
    const cat   = e.category ? `${e.category}: ` : "";
    const summ  = e.summary  ? ` — ${e.summary}` : "";
    lines.push(`- ${cat}${e.title}${summ}`);
  }
  if (lines.length === 1) return "";
  lines.push("</campaign_truths>");
  return lines.join("\n");
}

/**
 * Build the campaign-truths digest from the campaign state.
 *
 * Looks up each selected truth slug in the foundry-ironsworn starforged-truths
 * pack and renders the result via `formatCampaignTruthsBlock`. When no slugs
 * are configured or the pack is unavailable, returns "".
 *
 * @param {Object} campaignState
 * @returns {Promise<string>}
 */
export async function buildCampaignTruthsBlock(campaignState) {
  const slugs = Array.isArray(campaignState?.canonicalTruthSlugs)
    ? campaignState.canonicalTruthSlugs.filter(s => typeof s === "string" && s.length)
    : [];
  if (slugs.length === 0) return "";

  let truths;
  try {
    truths = await listCanonicalTruths();
  } catch (err) {
    console.warn(`starforged-companion | campaignTruths: listCanonicalTruths failed:`, err);
    return "";
  }
  if (!truths.length) return "";

  const slugSet = new Set(slugs.map(s => s.toLowerCase()));
  const matches = [];
  for (const doc of truths) {
    const dfid = String(
      doc.flags?.["foundry-ironsworn"]?.dfid
      ?? doc.system?.dfid
      ?? ""
    ).toLowerCase();
    const nameSlug = String(doc.name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    if (slugSet.has(dfid) || slugSet.has(nameSlug) || slugSet.has(String(doc.name ?? "").toLowerCase())) {
      const page = doc.pages?.contents?.[0] ?? null;
      const summary = (page?.text?.content ?? "")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 240);
      matches.push({
        category: doc.name,
        title:    page?.name ?? doc.name,
        summary,
      });
    }
  }

  return formatCampaignTruthsBlock(matches);
}
