/**
 * STARFORGED COMPANION
 * src/truths/generator.js — World Truth rolling, storage, and context formatting
 *
 * Responsibilities:
 * - Roll through all 14 truth categories (or individual ones)
 * - Resolve sub-tables where a chosen option has one
 * - Store the complete truth set in the campaign state and as a Foundry journal entry
 * - Format truths for narrator context injection (compact form for ongoing packets)
 * - Format truths for the World Truths journal entry (full descriptive form)
 *
 * World Truths are campaign-level constants. They're set at Session Zero and
 * injected into every Loremaster context packet as background lore.
 * They don't change mid-campaign — the journal entry is the authoritative record.
 *
 * This campaign's truths (already established, Session Zero):
 *   Cataclysm:     We escaped a catastrophic war (roll 82) — Foe: AI (sub-roll 15)
 *   Exodus:        Millennia-long journey, Ironhomes still sail (roll 4)
 *   Communities:   Five Founder Clans (roll 36)
 *   Iron:          Vows on Exodus ship remnants (roll 29)
 *   Laws:          Covenant upheld by Keepers (roll 95)
 *   Religion:      Triumvirate — three orders (roll 87)
 *   Magic:         Paragons via genetic engineering (roll 70, sub-roll 12)
 *   Communication: The Weave — data hub network (roll 76)
 *   Medicine:      Medical knowledge lost in Exodus (roll 5)
 *   AI:            Outlawed — Adepts replace AI (roll 12, sub-roll 28)
 *   War:           No organized armies — raiders, conscripts (roll 30)
 *   Lifeforms:     Forgespawn infest many sites (roll 78)
 *   Precursors:    Ascendancy vaults — untethered from reality (roll 72)
 *   Horrors:       Woken dead — Soulbinders stand against them (roll 92)
 */

import { TRUTH_CATEGORIES, TRUTH_TABLES, SUB_TABLES } from "./tables.js";
import { apiPost } from "../api-proxy.js";

const MODULE_ID      = "starforged-companion";
const JOURNAL_NAME   = "World Truths";
const ANTHROPIC_URL  = "https://api.anthropic.com/v1/messages";


// ─────────────────────────────────────────────────────────────────────────────
// ROLLING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Roll on all 14 truth categories.
 * Returns a complete truth set suitable for storing in campaign state.
 *
 * @returns {Object} truthSet — keyed by category ID
 */
export function rollWorldTruths() {
  const truthSet = {};
  for (const categoryId of TRUTH_CATEGORIES) {
    truthSet[categoryId] = rollCategory(categoryId);
  }
  return truthSet;
}

/**
 * Roll on a single truth category and resolve any sub-table.
 *
 * @param {string} categoryId
 * @param {Object} [options]
 * @param {number} [options.roll]       — override main roll (1-100)
 * @param {number} [options.subRoll]    — override sub-table roll (1-100)
 * @returns {TruthResult}
 */
export function rollCategory(categoryId, options = {}) {
  const category = TRUTH_TABLES[categoryId];
  if (!category) throw new Error(`Unknown truth category: ${categoryId}`);

  const roll   = options.roll ?? rollD100();
  const entry  = findEntry(category.entries, roll);

  if (!entry) throw new Error(`No entry for roll ${roll} in category ${categoryId}`);

  const result = {
    categoryId,
    categoryName: category.name,
    roll,
    title:        entry.title,
    description:  entry.description,
    questStarter: entry.questStarter,
    subTableId:   entry.subTableId ?? null,
    subTableLabel:entry.subTableLabel ?? null,
    subRoll:      null,
    subResult:    null,
  };

  // Resolve sub-table if this entry has one
  if (entry.subTableId) {
    const subRoll   = options.subRoll ?? rollD100();
    const subEntry  = findEntry(SUB_TABLES[entry.subTableId], subRoll);
    result.subRoll  = subRoll;
    result.subResult = subEntry?.result ?? null;
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// STORAGE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Store a truth set in campaign state and create a Foundry journal entry.
 * The journal entry is the player-facing record. Campaign state is the
 * machine-readable version for context injection.
 *
 * @param {Object} truthSet
 * @param {Object} campaignState  — mutated in place
 * @returns {Promise<JournalEntry>}
 */
export async function storeWorldTruths(truthSet, campaignState) {
  // Persist to campaign state
  campaignState.worldTruths = truthSet;
  await persistCampaignState(campaignState);

  // Create or update the journal entry
  const existing = game.journal?.getName(JOURNAL_NAME);
  if (existing) {
    await updateTruthsJournal(existing, truthSet);
    return existing;
  }

  return createTruthsJournal(truthSet);
}

// ─────────────────────────────────────────────────────────────────────────────
// JOURNAL ENTRY
// ─────────────────────────────────────────────────────────────────────────────

async function createTruthsJournal(truthSet) {
  const entry = await JournalEntry.create({
    name:  JOURNAL_NAME,
    flags: { [MODULE_ID]: { entityType: "worldTruths" } },
  });

  await entry.createEmbeddedDocuments("JournalEntryPage", [{
    name:  "World Truths",
    type:  "text",
    text:  { content: formatTruthsAsHtml(truthSet) },
    flags: { [MODULE_ID]: { worldTruths: truthSet } },
  }]);

  return entry;
}

async function updateTruthsJournal(entry, truthSet) {
  const page = entry.pages?.contents?.[0];
  if (!page) return createTruthsJournal(truthSet);

  await page.update({
    "text.content": formatTruthsAsHtml(truthSet),
    flags: { [MODULE_ID]: { worldTruths: truthSet } },
  });
}

/**
 * Format the full truth set as a readable HTML string for the journal entry.
 * One section per category — title, description, quest starter, sub-result if present.
 */
function formatTruthsAsHtml(truthSet) {
  const sections = TRUTH_CATEGORIES.map(categoryId => {
    const truth = truthSet[categoryId];
    if (!truth) return "";

    const subLine = truth.subResult
      ? `<p><em>${truth.subTableLabel ?? "Detail:"} ${truth.subResult}</em></p>`
      : "";

    return `
      <h2>${truth.categoryName}</h2>
      <p><strong>${truth.title}</strong></p>
      <p>${truth.description}</p>
      ${subLine}
      <p><em>Quest Starter: ${truth.questStarter}</em></p>
    `.trim();
  });

  return sections.join("\n<hr>\n");
}


// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT FORMATTING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format the truth set for narrator context injection.
 *
 * Used in every context packet as the "WORLD TRUTHS" section.
 * Compact — just the title and the sub-result where present.
 * The full descriptions are only in the journal entry.
 *
 * @param {Object} truthSet
 * @returns {string}
 */
export function formatForContext(truthSet) {
  if (!truthSet) return "";

  const lines = TRUTH_CATEGORIES.map(categoryId => {
    const truth = truthSet[categoryId];
    if (!truth) return null;

    const sub = truth.subResult ? ` (${truth.subResult})` : "";
    return `${truth.categoryName}: ${truth.title}${sub}`;
  }).filter(Boolean);

  return `WORLD TRUTHS\n${lines.join("\n")}`;
}

/**
 * Get a truth result for a specific category from the campaign state.
 * Convenience accessor for the pipeline.
 *
 * @param {Object} campaignState
 * @param {string} categoryId
 * @returns {Object|null}
 */
export function getTruth(campaignState, categoryId) {
  return campaignState.worldTruths?.[categoryId] ?? null;
}

/**
 * Open the foundry-ironsworn system's World Truths dialog for Starforged.
 * Requires the system to be active and CONFIG.IRONSWORN to be populated.
 * Safe to call from any context — guards against missing CONFIG entry.
 */
export function openSystemTruthsDialog() {
  const TruthsDialog = CONFIG.IRONSWORN?.applications?.SFSettingTruthsDialog;
  if (!TruthsDialog) {
    ui?.notifications?.warn(
      "Starforged Companion: Could not find the World Truths dialog. " +
        "Ensure the foundry-ironsworn system is active."
    );
    return;
  }
  new TruthsDialog("starforged").render(true);
}


// ─────────────────────────────────────────────────────────────────────────────
// LORE RECAP
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate an atmospheric narrator lore recap from the campaign's world truths.
 * Posts a chat card, writes a "The Story So Far" page to the World Truths journal,
 * and persists the text in campaignState for context injection.
 *
 * @param {Object} campaignState — mutated in place (loreRecap, loreRecapSessionId)
 * @returns {Promise<string|null>} recap text, or null on failure
 */
export async function generateLoreRecap(campaignState) {
  let apiKey = "";
  try {
    apiKey = game.settings.get(MODULE_ID, "claudeApiKey");
  } catch (err) {
    console.warn(`${MODULE_ID} | lore: settings read failed:`, err);
  }
  if (!apiKey) {
    ui?.notifications?.warn("Starforged Companion: Claude API key required for !lore.");
    return null;
  }

  let recap = null;
  try {
    recap = await callLoreRecapNarrator(campaignState, apiKey);
  } catch (err) {
    console.error(`${MODULE_ID} | lore: callLoreRecapNarrator failed:`, err);
    ui?.notifications?.error("Starforged Companion: !lore failed — check console and API key.");
    return null;
  }

  if (!recap) return null;
  if (!recap.trim()) return null;

  campaignState.loreRecap          = recap;
  campaignState.loreRecapSessionId = campaignState.currentSessionId ?? null;
  try {
    await game.settings.set(MODULE_ID, "campaignState", campaignState);
  } catch (err) {
    console.error(`${MODULE_ID} | lore: failed to persist loreRecap:`, err);
    throw err;
  }

  await writeLoreRecapToJournal(recap, campaignState).catch(err =>
    console.warn(`${MODULE_ID} | lore: writeLoreRecapToJournal failed:`, err)
  );

  const paragraphs = recap.split(/\n\n+/).map(p => `<p>${p.trim()}</p>`).join("");
  await ChatMessage.create({
    content: `
      <div class="sf-lore-card">
        <div class="sf-lore-label">◈ World Lore</div>
        <div class="sf-lore-prose">${paragraphs}</div>
      </div>
    `.trim(),
    flags: { [MODULE_ID]: { loreCard: true } },
  }).catch(err => console.warn(`${MODULE_ID} | lore: chat post failed:`, err));

  return recap;
}

async function callLoreRecapNarrator(campaignState, apiKey) {
  let truthsContent = "";

  // Resolve the world-truths journal. Prefer the stored id, but tolerate stale
  // or missing ids by searching for the system "Setting Truths" journal (i18n
  // key TypeTruth) and the module's own "World Truths" journal as fallbacks.
  // When the dialog is re-run or the original journal is deleted/recreated,
  // worldTruthsJournalId can point at a document that no longer exists.
  let entry = campaignState.worldTruthsJournalId
    ? (game.journal?.get(campaignState.worldTruthsJournalId) ?? null)
    : null;

  if (!entry) {
    const systemTitle = game.i18n?.localize?.("IRONSWORN.JOURNALENTRYPAGES.TypeTruth") ?? "Setting Truths";
    const candidates  = (game.journal?.contents ?? []).filter(
      j => j.name === systemTitle || j.name === JOURNAL_NAME
    );
    // Prefer a candidate whose first page looks like a real truths page
    // (≥2 <h2> elements — same shape the createJournalEntryPage hook checks).
    entry = candidates.find(j => {
      const html = j.pages?.contents?.[0]?.text?.content ?? "";
      return (html.match(/<h2/gi) ?? []).length >= 2;
    }) ?? candidates[0] ?? null;

    if (entry && entry.id !== campaignState.worldTruthsJournalId) {
      campaignState.worldTruthsJournalId = entry.id;
      if (game.user?.isGM) {
        await game.settings.set(MODULE_ID, "campaignState", campaignState).catch(err =>
          console.warn(`${MODULE_ID} | lore: failed to repair worldTruthsJournalId:`, err)
        );
      }
    }
  }

  if (entry) {
    const page = entry.pages?.contents?.[0];
    const html = page?.text?.content ?? "";
    if (html.trim()) {
      truthsContent = html
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    } else if (page) {
      // Journal page exists but was saved with no truth selections recorded
      // (async timing gap in TruthCategory.randomize() — model.valid stayed false)
      ui?.notifications?.warn(
        "Starforged Companion: World Truths dialog was saved but no truth " +
        "selections were recorded. Re-open !truths, select or randomize each " +
        "category, then click Save Your Truths."
      );
      return null;
    }
  }

  // Fall back to structured format — but validate it has real content
  if (!truthsContent && campaignState.worldTruths) {
    const formatted = formatForContext(campaignState.worldTruths);
    if (formatted && !formatted.includes("undefined")) {
      truthsContent = formatted;
    }
  }

  // Guard — nothing to work with
  if (!truthsContent) {
    ui?.notifications?.warn(
      "Starforged Companion: World Truths content could not be read. " +
      "Try setting truths again with !truths."
    );
    return null;
  }

  const systemPrompt =
    "You are a world-weary spacer narrator — sardonic, laconic, and atmospheric. " +
    "When given a list of world truths, you summarise them as a brief in-world passage: " +
    "what this corner of the Forge is like, why it is the way it is, and what it costs to live here. " +
    "4–6 sentences. No bullet points. No category labels. Pure prose.";

  const body = {
    model:      "claude-haiku-4-5-20251001",
    max_tokens: 300,
    system:     systemPrompt,
    messages:   [{ role: "user", content: `Summarise these world truths:\n\n${truthsContent}` }],
  };

  const headers = {
    "Content-Type":      "application/json",
    "x-api-key":         apiKey,
    "anthropic-version": "2023-06-01",
  };

  const data = await apiPost(ANTHROPIC_URL, headers, body);
  const text = (data.content ?? [])
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("");

  if (!text) throw new Error("Lore narrator returned no content.");
  return text;
}

async function writeLoreRecapToJournal(recap, campaignState) {
  const PAGE_NAME = "The Story So Far";
  const html      = recap.split(/\n\n+/).map(p => `<p>${p.trim()}</p>`).join("\n");

  async function upsertPage(je) {
    const existing = je.pages?.contents?.find(p => p.name === PAGE_NAME);
    if (existing) {
      await existing.update({ "text.content": html });
    } else {
      await je.createEmbeddedDocuments("JournalEntryPage", [{
        name: PAGE_NAME,
        type: "text",
        text: { content: html },
      }]);
    }
  }

  // Prefer the journal we already know about (system-created or ours)
  if (campaignState.worldTruthsJournalId) {
    const je = game.journal?.get(campaignState.worldTruthsJournalId);
    if (je) { await upsertPage(je); return; }
  }

  // Fallback by name — accept the system's localized "Setting Truths" too,
  // not only the module's own "World Truths" journal.
  const systemTitle = game.i18n?.localize?.("IRONSWORN.JOURNALENTRYPAGES.TypeTruth") ?? "Setting Truths";
  const je = game.journal?.getName(systemTitle) ?? game.journal?.getName(JOURNAL_NAME);
  if (je) await upsertPage(je);
}


// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function rollD100() {
  return Math.floor(Math.random() * 100) + 1;
}

function findEntry(entries, roll) {
  return entries?.find(e => roll >= e.min && roll <= e.max) ?? null;
}

async function persistCampaignState(campaignState) {
  try {
    await game.settings.set(MODULE_ID, "campaignState", campaignState);
  } catch (err) {
    console.error(`${MODULE_ID} | truths: persistCampaignState failed:`, err);
    throw err;
  }
}

/**
 * @typedef {Object} TruthResult
 * @property {string}      categoryId
 * @property {string}      categoryName
 * @property {number}      roll
 * @property {string}      title
 * @property {string}      description
 * @property {string}      questStarter
 * @property {string|null} subTableId
 * @property {string|null} subTableLabel
 * @property {number|null} subRoll
 * @property {string|null} subResult
 */
