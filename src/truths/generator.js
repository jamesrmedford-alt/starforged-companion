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
 * One store for the narrator: `campaignState.worldTruths`, written through on
 * every save of the truths — the Playtest Quickstart's (storeWorldTruths) and
 * each save of the system's World Truths dialog (recordSystemTruths, parsing
 * the "Setting Truths" page the dialog writes; reconcileSystemTruths at world
 * load), always with `worldTruthsJournalId` naming the journal it came from,
 * which `!lore` reads. The newest save wins (issue #322 V34).
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
import { writeOwnedFields } from "../factContinuity/sceneLifecycle.js";
import { stripMarkup } from "../audio/segments.js";

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

/** campaignState fields storeWorldTruths writes. */
const WORLD_TRUTHS_FIELDS = Object.freeze(["worldTruths", "worldTruthsSet", "worldTruthsJournalId"]);

/**
 * Store a truth set in campaign state and in the module's World Truths
 * journal. The journal entry is the player-facing record. Campaign state is
 * the machine-readable version for context injection.
 *
 * The truths are recorded as established — `worldTruthsSet`, and
 * `worldTruthsJournalId` naming the journal written — so a world load no
 * longer asks the GM to establish World Truths and `!lore` reads these
 * (issue #321 U67: only the system-dialog hooks wrote either field, and they
 * skip a journal carrying this module's flags). The journal is the one the
 * campaign records when it is ours, else the newest carrying our flag —
 * never found by name: a GM's own "World Truths" notes kept losing their
 * first page here.
 *
 * Only WORLD_TRUTHS_FIELDS are written, merged onto the latest stored
 * campaignState after the journal awaits; the caller's copy takes them once
 * the write has landed.
 *
 * @param {Object} truthSet
 * @param {Object} campaignState  — mutated in place (WORLD_TRUTHS_FIELDS)
 * @returns {Promise<JournalEntry>}
 */
export async function storeWorldTruths(truthSet, campaignState) {
  const existing = findModuleTruthsJournal(campaignState);
  const journal  = existing
    ? await updateTruthsJournal(existing, truthSet)
    : await createTruthsJournal(truthSet);

  const journalId = journal?.id ?? null;
  await persistWorldTruthsFields({ ...campaignState, worldTruths: truthSet, worldTruthsSet: true, worldTruthsJournalId: journalId });
  campaignState.worldTruths          = truthSet;
  campaignState.worldTruthsSet       = true;
  campaignState.worldTruthsJournalId = journalId;
  return journal;
}

// ─────────────────────────────────────────────────────────────────────────────
// JOURNAL ENTRY
// ─────────────────────────────────────────────────────────────────────────────

/** True for a journal this module created to hold the World Truths. */
function isModuleTruthsJournal(journal) {
  return journal?.flags?.[MODULE_ID]?.entityType === "worldTruths";
}

/**
 * The module's own World Truths journal: the one campaignState records when
 * it is ours, else the newest journal carrying our flag. Null when there is
 * none (a journal of that name without our flag is not ours).
 *
 * @param {Object} campaignState
 * @returns {JournalEntry|null}
 */
function findModuleTruthsJournal(campaignState) {
  const recorded = campaignState?.worldTruthsJournalId
    ? (game.journal?.get(campaignState.worldTruthsJournalId) ?? null)
    : null;
  if (isModuleTruthsJournal(recorded)) return recorded;
  return (game.journal?.contents ?? []).filter(isModuleTruthsJournal).at(-1) ?? null;
}

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

/**
 * Rewrite the truths page of the module's own journal — the page carrying
 * our `worldTruths` flag, so a "The Story So Far" page `!lore` added is never
 * the one replaced. A journal that lost its truths page gets a new one.
 *
 * @returns {Promise<JournalEntry>} the same journal
 */
async function updateTruthsJournal(entry, truthSet) {
  const page = (entry.pages?.contents ?? []).find(p => p?.flags?.[MODULE_ID]?.worldTruths);
  if (!page) {
    await entry.createEmbeddedDocuments("JournalEntryPage", [{
      name:  "World Truths",
      type:  "text",
      text:  { content: formatTruthsAsHtml(truthSet) },
      flags: { [MODULE_ID]: { worldTruths: truthSet } },
    }]);
    return entry;
  }

  await page.update({
    "text.content": formatTruthsAsHtml(truthSet),
    flags: { [MODULE_ID]: { worldTruths: truthSet } },
  });
  return entry;
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
// THE SYSTEM DIALOG'S TRUTHS
// ─────────────────────────────────────────────────────────────────────────────

/** The name the system gives a World Truths dialog save ("Setting Truths"). */
function systemTruthsTitle() {
  return game.i18n?.localize?.("IRONSWORN.JOURNALENTRYPAGES.TypeTruth") ?? "";
}

/**
 * True for HTML that holds saved truths: at least one category `<h2>` with a
 * truth under it. A one-category save is a save — the dialog calls creating
 * truths optional — but the guard wanted two `<h2>`, so a GM who saved only
 * the Iron truth had no WORLD TRUTHS, no Iron truth for the oath, and a "No
 * World Truths" notice on every load (issue #325 W35). An empty page (the
 * dialog's timing gap) or a heading with nothing under it holds none. The
 * createJournalEntryPage hook and the load-time reconcile both ask this.
 *
 * @param {string} html
 * @returns {boolean}
 */
export function holdsTruths(html) {
  return typeof html === "string" && Object.keys(parseSystemTruthsHtml(html)).length > 0;
}

/** The content of a journal's truths page (its first text page holding truths), or null. */
function truthsPageHtml(journal) {
  const page = (journal?.pages?.contents ?? []).find(p => p?.type === "text" && holdsTruths(p?.text?.content));
  return page ? page.text.content : null;
}

/**
 * Journals with one of `names`, newest first: each Save in the system dialog
 * creates a new journal, and the newest holds the campaign's truths (issue
 * #321 U65). Foundry stamps `_stats.createdTime`; the collection's order
 * breaks a tie.
 */
function journalsNewestFirst(names) {
  return (game.journal?.contents ?? [])
    .map((j, order) => ({ j, order }))
    .filter(({ j }) => names.includes(j?.name))
    .sort((a, b) => (createdTime(b.j) - createdTime(a.j)) || (b.order - a.order))
    .map(({ j }) => j);
}

/** A journal's creation time (0 when the document carries none). */
function createdTime(journal) {
  return Number(journal?._stats?.createdTime) || 0;
}

/**
 * The truths a truths journal holds, in the shape campaignState.worldTruths
 * stores: the module's own journal carries them as its page's flag; a system
 * dialog save is parsed from its page. Null when the journal holds none.
 */
function truthsFromJournal(journal) {
  if (isModuleTruthsJournal(journal)) {
    const page = (journal.pages?.contents ?? []).find(p => p?.flags?.[MODULE_ID]?.worldTruths);
    return page ? page.flags[MODULE_ID].worldTruths : null;
  }
  const html = truthsPageHtml(journal);
  return html ? parseSystemTruthsHtml(html) : null;
}

/**
 * Record a save of the system's World Truths dialog (`!truths`, the toolbar
 * button, the setup card): its truths become the campaign's — parsed into
 * `campaignState.worldTruths`, which the narrator's WORLD TRUTHS block and
 * getTruth (the vow scene's Iron truth) read — with the journal linked for
 * `!lore`. Only the Quickstart wrote worldTruths, so truths chosen in the
 * dialog never reached the narrator, and a revision in the dialog left it
 * the Quickstart's (issue #322 V34). WORLD_TRUTHS_FIELDS only, merged onto
 * the latest stored campaignState. The caller gates on the canonical GM.
 *
 * @param {string} journalId — the dialog's new journal
 * @param {string} html      — its page's content
 * @returns {Promise<void>}  rejects when the write is refused
 */
export async function recordSystemTruths(journalId, html) {
  await writeTruthsLink(journalId, parseSystemTruthsHtml(html));
}

/**
 * Bring the campaign's truths up to the World Truths dialog's newest save, at
 * world load (canonical GM). A world whose truths were saved in the dialog
 * before each save was written through holds none of them in worldTruths,
 * and one that saved twice before #321 U65 may still link the first save;
 * a world never linked links its newest. A world whose truths are the
 * Quickstart's (the module's own journal linked) is left alone. Writes only
 * when the link or the truths differ.
 *
 * The saves are found by the system's title, but the linked journal is known
 * by its id: it stays the campaign's unless a save found by title is newer
 * (`_stats.createdTime`) — "the newest save wins". A GM who filed the newest
 * save under a name of their own had the superseded one, still titled
 * "Setting Truths", relinked at every load, and the narrator's truths
 * reverted to it (issue #342 Z16).
 *
 * @returns {Promise<boolean>} true when written
 */
export async function reconcileSystemTruths() {
  const state  = game.settings.get(MODULE_ID, "campaignState") ?? {};
  const linked = state.worldTruthsJournalId ? (game.journal?.get(state.worldTruthsJournalId) ?? null) : null;
  if (isModuleTruthsJournal(linked)) return false;

  const title   = systemTruthsTitle();
  const newest  = title
    ? journalsNewestFirst([title]).find(j => !isModuleTruthsJournal(j) && truthsPageHtml(j))
    : null;
  const current = truthsPageHtml(linked) ? linked : null;
  const journal = newest && current && createdTime(newest) <= createdTime(current)
    ? current
    : (newest ?? current);
  if (!journal) return false;

  const truths = parseSystemTruthsHtml(truthsPageHtml(journal));
  const stored = !Object.keys(truths).length || JSON.stringify(truths) === JSON.stringify(state.worldTruths ?? {});
  if (journal.id === state.worldTruthsJournalId && state.worldTruthsSet === true && stored) return false;
  await writeTruthsLink(journal.id, truths);
  return true;
}

/**
 * Link `journalId` as the campaign's truths journal, with the truths it holds
 * — never the link alone while worldTruths says something else. A save with
 * no truth that reads keeps the stored ones (the dialog's empty save).
 * WORLD_TRUTHS_FIELDS only, onto the latest store at this write's turn on the
 * client's campaignState write chain (CAMPSTATE-CHAIN-PARTIAL); rejects when
 * refused.
 */
async function writeTruthsLink(journalId, truths) {
  const fields = { worldTruthsSet: true, worldTruthsJournalId: journalId };
  if (truths && Object.keys(truths).length) fields.worldTruths = truths;
  await writeOwnedFields(fields, WORLD_TRUTHS_FIELDS, "world truths");
}

const H2_RE     = /<h2\b[^>]*>([\s\S]*?)<\/h2>/gi;
const BLOCK_RE  = /<(p|blockquote|ul|ol|h[3-6])\b[^>]*>([\s\S]*?)<\/\1>/gi;
const BOLD_RE   = /^<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>$/i;
const ITALIC_RE = /^<(em|i)\b[^>]*>([\s\S]*?)<\/\1>$/i;

/**
 * The truths a save of the system's World Truths dialog holds, keyed by
 * category id in the TruthResult shape storeWorldTruths stores.
 *
 * The dialog (vendor sf-truths.vue saveTruths) writes a section per chosen
 * category: `<h2>{category}</h2>`, the option's title in bold, its text — a
 * sub-table's result blockquoted after the line that introduces it ("In this
 * final war, we were set upon by:") — the quest starter in italics, then the
 * category's inspiration text. A custom truth is the GM's own text, whose
 * first paragraph says it. A category named as none of TRUTH_TABLES' (another
 * language) keeps its own name as the key.
 *
 * @param {string} html
 * @returns {Object} truthSet — {} when nothing reads
 */
function parseSystemTruthsHtml(html) {
  const source = typeof html === "string" ? html : "";
  const heads  = [...source.matchAll(H2_RE)];
  const truthSet = {};
  heads.forEach((head, i) => {
    const categoryName = htmlText(head[1]);
    const categoryId   = truthCategoryId(categoryName);
    const end   = i + 1 < heads.length ? heads[i + 1].index : source.length;
    const truth = categoryId ? parseTruthSection(source.slice(head.index + head[0].length, end)) : null;
    if (truth) truthSet[categoryId] = { categoryId, categoryName, ...truth };
  });
  return truthSet;
}

/** One category's section → the TruthResult fields, or null when it holds no text. */
function parseTruthSection(body) {
  let blocks = [...body.matchAll(BLOCK_RE)]
    .map(m => ({ tag: m[1].toLowerCase(), inner: m[2].trim(), text: htmlText(m[2]) }))
    .filter(b => b.text);
  if (!blocks.length) {
    const text = htmlText(body);
    if (!text) return null;
    blocks = [{ tag: "p", inner: body.trim(), text }];
  }

  const bold = blocks[0].tag === "p" ? blocks[0].inner.match(BOLD_RE) : null;
  if (!bold) return truthFields({ title: blocks[0].text });    // a custom truth

  const rest  = blocks.slice(1);
  const quest = rest.findIndex(b => b.tag === "p" && ITALIC_RE.test(b.inner));
  const prose = quest >= 0 ? rest.slice(0, quest) : rest;
  const sub   = prose.findIndex(b => b.tag === "blockquote");
  return truthFields({
    title:         htmlText(bold[2]),
    description:   prose.map(b => b.text).join(" "),
    questStarter:  quest >= 0 ? rest[quest].text : "",
    subTableLabel: sub > 0 ? introducingSentence(prose[sub - 1].text) : null,
    subResult:     sub >= 0 ? prose[sub].text : null,
  });
}

function truthFields({ title, description = "", questStarter = "", subTableLabel = null, subResult = null }) {
  return { roll: null, title, description, questStarter, subTableId: null, subTableLabel, subRoll: null, subResult };
}

/** The category id for a dialog heading — TRUTH_TABLES' by name, else the heading's own. */
function truthCategoryId(name) {
  const lower = String(name ?? "").trim().toLowerCase();
  if (!lower) return null;
  const known = TRUTH_CATEGORIES.find(id => TRUTH_TABLES[id]?.name?.toLowerCase() === lower);
  return known ?? (lower.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || String(name).trim());
}

/** The sentence a paragraph ends with when it introduces what follows ("This is because:"), else null. */
function introducingSentence(text) {
  if (!text.endsWith(":")) return null;
  return text.split(/(?<=[.!?]["'\u2019\u201D]?)\s+/).at(-1) || null;
}

const NAMED_ENTITIES = Object.freeze({
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'",
  lsquo: "\u2018", rsquo: "\u2019", ldquo: "\u201C", rdquo: "\u201D",
  ndash: "\u2013", mdash: "\u2014", hellip: "\u2026",
});

/** An HTML fragment's text: tags dropped, entities decoded, whitespace folded. */
function htmlText(fragment) {
  return String(fragment ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code) => {
      if (code[0] !== "#") return NAMED_ENTITIES[code.toLowerCase()] ?? whole;
      const n = /^#x/i.test(code) ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isInteger(n) && n > 0 && n <= 0x10FFFF ? String.fromCodePoint(n) : whole;
    })
    .replace(/\s+/g, " ")
    .trim();
}


// ─────────────────────────────────────────────────────────────────────────────
// LORE RECAP
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate an atmospheric narrator lore recap from the campaign's world truths.
 * Posts a chat card, writes a "The Story So Far" page to the World Truths journal,
 * and persists the text in campaignState for context injection.
 *
 * @param {Object} campaignState — takes the recap (loreRecap) once it is saved
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

  // Only the recap is this command's to write, onto the store as it is now
  // (issue #321 U06a): campaignState was read before the Claude call, and
  // writing it whole reverted whatever landed meanwhile — a player's X-Card,
  // a move releasing its lock (rules/reachability.md §9).
  // Set on a copy: the caller hands in the cached setting, which kept a recap
  // the world refused (issue #326 W51; rules/foundry-api.md). The caller's
  // object takes it once the write has landed. On the client's campaignState
  // write chain, onto the store as the write ahead left it (CAMPSTATE-CHAIN-PARTIAL).
  try {
    await writeOwnedFields({ ...campaignState, loreRecap: recap }, ["loreRecap"], "!lore");
  } catch (err) {
    console.error(`${MODULE_ID} | lore: failed to persist loreRecap:`, err);
    ui?.notifications?.error("Starforged Companion: the lore recap was not saved — the world did not take the write.");
    throw err;
  }
  campaignState.loreRecap = recap;

  await writeLoreRecapToJournal(recap, campaignState).catch(err =>
    console.warn(`${MODULE_ID} | lore: writeLoreRecapToJournal failed:`, err)
  );

  // The model's prose is text: escaped, with <npc> voice markers stripped —
  // "<signal lost>" vanished as an unknown tag (issue #326 W71, the issue
  // #322 V18 class the narration cards fixed).
  const paragraphs = loreParagraphs(recap).join("");
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
    // Newest first (issue #321 U65 — the first match was the oldest).
    const candidates = journalsNewestFirst([systemTruthsTitle() || "Setting Truths", JOURNAL_NAME]);
    // Prefer a candidate whose first page holds truths (holdsTruths — the
    // same test the createJournalEntryPage hook makes).
    entry = candidates.find(j => holdsTruths(j.pages?.contents?.[0]?.text?.content ?? "")) ?? candidates[0] ?? null;

    if (entry && entry.id !== campaignState.worldTruthsJournalId) {
      // Linked with the truths it holds, so the narrator reads the truths this
      // recap summarises (issue #322 V34) — owned fields onto the latest store,
      // not this call's whole copy. On the caller's object only once the
      // world has it, as storeWorldTruths / recordSystemTruths do: the caller
      // hands over the cached setting, and a refused repair left this GM's
      // cache linking a journal the world did not — the next `!lore` never
      // repaired it, and the GM's next whole-object write carried the id into
      // the world without its truths (issue #337 Y38).
      const entryId = entry.id;
      if (game.user?.isGM) {
        await writeTruthsLink(entryId, truthsFromJournal(entry)).then(
          () => { campaignState.worldTruthsJournalId = entryId; },
          err => console.warn(`${MODULE_ID} | lore: failed to repair worldTruthsJournalId:`, err),
        );
      }
    }
  }

  if (entry && isModuleTruthsJournal(entry)) {
    // The module's own (Playtest Quickstart) journal: its page's flag holds the
    // truths and the page's text is a printout of them, never read back (issue
    // #337 Y39). The flag is summarised, printed as the page prints it — the
    // printout was read live, so a GM's edit of it reached the recap but not
    // the narrator's truths (known-issues LORE-READS-QUICKSTART-PRINTOUT).
    const truths = truthsFromJournal(entry);
    if (truths && Object.keys(truths).length) truthsContent = htmlText(formatTruthsAsHtml(truths));
  } else if (entry) {
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

/**
 * The recap's paragraphs as HTML: each escaped, its <npc> markers stripped.
 *
 * @param {string} recap
 * @returns {string[]}
 */
function loreParagraphs(recap) {
  return String(recap ?? "").split(/\n\n+/)
    .map(p => p.trim()).filter(Boolean)
    .map(p => `<p>${escapeLoreHtml(stripMarkup(p))}</p>`);
}

function escapeLoreHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function writeLoreRecapToJournal(recap, campaignState) {
  const PAGE_NAME = "The Story So Far";
  const html      = loreParagraphs(recap).join("\n");

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

/** Write WORLD_TRUTHS_FIELDS of `campaignState` onto the latest stored campaignState (on the client's write chain). */
async function persistWorldTruthsFields(campaignState) {
  try {
    await writeOwnedFields(campaignState, WORLD_TRUTHS_FIELDS, "world truths");
  } catch (err) {
    console.error(`${MODULE_ID} | truths: persisting the world truths failed:`, err);
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
