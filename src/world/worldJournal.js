/**
 * STARFORGED COMPANION
 * src/world/worldJournal.js — World Journal CRUD and read functions
 *
 * The World Journal is the campaign's narrative working memory. Entries are
 * stored across four category JournalEntries inside a "Starforged Companion"
 * folder. Each category journal holds one page per entry; entry data lives in
 * page.flags[MODULE_ID].{loreEntry|threatEntry|factionEntry|locationEntry}.
 *
 * Entry types — see world-journal-scope-v2 §2:
 *   - loreEntry      stored on "World Journal — Lore"
 *   - threatEntry    stored on "World Journal — Threats"
 *   - factionEntry   stored on "World Journal — Factions"
 *   - locationEntry  stored on "World Journal — Locations"
 *
 * Phase 3 implements CRUD + read functions only. The combined detection pass
 * that auto-populates entries lives in src/entities/entityExtractor.js
 * (Phase 4). The assembler currently calls the read functions exposed here
 * via stubs; they will be wired in Phase 5.
 */

import { isCanonicalGM } from "../multiplayer/gmGate.js";
import { factionNameKey } from "../entities/faction.js";
import { nameKey, suffixedName } from "../entities/nameMatch.js";

const MODULE_ID = "starforged-companion";

export const FOLDER_NAME = "Starforged Companion";

export const JOURNAL_NAMES = {
  lore:       "World Journal — Lore",
  threats:    "World Journal — Threats",
  factions:   "World Journal — Factions",
  locations:  "World Journal — Locations",
  sessionLog: "World Journal — Session Log",
  // The narrative skeleton's hidden plans (issue #353): GM-only — made with no
  // player permission (GM_ONLY_CATEGORIES) — one page per plan, its record in
  // the page's `secretEntry` flag (src/world/secrets.js).
  secrets:    "World Journal — Secrets",
};

export const FLAG_KEYS = {
  lore:      "loreEntry",
  threats:   "threatEntry",
  factions:  "factionEntry",
  locations: "locationEntry",
  sessionLogPage: "sessionLogPage",
  secrets:   "secretEntry",
};

/**
 * The categories whose journal no player may see: made with default
 * ownership NONE, so the narrator's unrevealed plans never show in a player's
 * journal directory (issue #353). A GM may still share one by hand.
 */
const GM_ONLY_CATEGORIES = new Set(["secrets"]);

/** The data a category's journal is made with: its name, its category flag, and — GM-only categories — no player permission. */
function journalCreateData(name, folderId = undefined) {
  const category = nameToCategory(name);
  return {
    name,
    ...(folderId !== undefined ? { folder: folderId } : {}),
    flags: { [MODULE_ID]: { worldJournalCategory: category } },
    ...(GM_ONLY_CATEGORIES.has(category)
      ? { ownership: { default: globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.NONE ?? 0 } }
      : {}),
  };
}

export const THREAT_SEVERITIES = ["immediate", "active", "looming", "resolved"];
const SEVERITY_ORDER = { immediate: 0, active: 1, looming: 2, resolved: 3 };

// ─────────────────────────────────────────────────────────────────────────────
// THREATS — a severity is one of four words; a threat has one page (issue #354 P2-15)
// ─────────────────────────────────────────────────────────────────────────────
//
// The detection pass wrote whatever it returned: a severity of "high", or a
// sentence of what the threat was doing, was stored as the severity (the
// panel's dropdown showed its first option for it, "immediate"), and a threat
// it named "<name>: high" — it was shown the threats as "<name>: <severity>" —
// started a second page beside "<name>". One playtest session made nine pages
// for two threats.

/** Words the detector (and worlds from before the check) used for a severity, by the severity they mean. */
const SEVERITY_WORDS = {
  immediate: ["immediate", "imminent", "critical", "severe", "high", "urgent", "extreme", "acute", "dire"],
  active:    ["active", "medium", "moderate", "ongoing", "escalating", "escalated", "rising", "growing", "elevated", "present"],
  looming:   ["looming", "low", "distant", "latent", "minor", "potential", "emerging", "dormant"],
  resolved:  ["resolved", "ended", "over", "neutralised", "neutralized", "defeated", "gone"],
};
const SEVERITY_BY_WORD = new Map(Object.entries(SEVERITY_WORDS).flatMap(([severity, words]) => words.map(w => [w, severity])));

/**
 * The words of SEVERITY_WORDS that say a threat grew, not how urgent it now
 * is. A stored one is read as "active"; on an "escalated" transition one only
 * repeats the change, so it names no level (issue #362 AC42: "escalated" read
 * as "active" lowered an immediate threat, and left an active one unmoved).
 */
const ESCALATION_WORDS = new Set(["escalating", "escalated", "rising", "growing", "elevated"]);

/** How many words a severity value may run to and still be read as one ("high severity", "very high"). */
const SEVERITY_MAX_WORDS = 3;

/** How many history entries a threat keeps: its first and its most recent. */
const THREAT_HISTORY_CAP = 24;

/**
 * A stored or detected severity as one of THREAT_SEVERITIES, or null when it
 * names none: a word of the vocabulary ("high" → immediate), alone or in a
 * phrase of up to three words. A sentence is no severity.
 *
 * @param {*} value
 * @returns {"immediate"|"active"|"looming"|"resolved"|null}
 */
export function normalizeThreatSeverity(value) {
  return severityNamedBy(value);
}

/** A severity value's words — none for a value that is no severity phrase (not text, or longer than SEVERITY_MAX_WORDS). */
function severityWordsOf(value) {
  if (typeof value !== "string") return [];
  const words = value.toLowerCase().replace(/[^a-z\s-]+/g, " ").split(/[\s-]+/).filter(Boolean);
  return words.length <= SEVERITY_MAX_WORDS ? words : [];
}

/** normalizeThreatSeverity, leaving out the words in `ignored` (a Set). */
function severityNamedBy(value, ignored = null) {
  for (const w of severityWordsOf(value)) {
    const severity = ignored?.has(w) ? null : SEVERITY_BY_WORD.get(w);
    if (severity) return severity;
  }
  return null;
}

/** Whether a severity value says the threat grew — a word of ESCALATION_WORDS ("escalating", "rising to immediate"). */
function saysThreatGrew(value) {
  return severityWordsOf(value).some(w => ESCALATION_WORDS.has(w));
}

/** A value given as a severity that is none, when it reads as a note worth keeping (more than a word or two). */
function strayThreatNote(value) {
  if (typeof value !== "string" || normalizeThreatSeverity(value)) return "";
  const text = value.replace(/\s+/g, " ").trim();
  return text.split(" ").length > SEVERITY_MAX_WORDS ? text : "";
}

/** The severity one step more urgent (looming → active → immediate); a resolved threat that escalates is active again. */
function escalatedSeverity(severity) {
  return severity === "looming" || severity === "resolved" ? "active" : "immediate";
}

/**
 * The severity an "escalated" transition leaves a threat at — never a lower
 * one (issue #362 AC42): the severity its value names, when that is at least
 * as urgent as the threat was; else — a value that names none, or only
 * repeats the change ("escalated", "rising": ESCALATION_WORDS), or names a
 * less urgent one — one step more urgent (escalatedSeverity).
 *
 * @param {*} value — the transition's `newValue`
 * @param {string} was — the threat's severity, one of THREAT_SEVERITIES
 * @returns {string}
 */
function escalationSeverity(value, was) {
  const given = severityNamedBy(value, ESCALATION_WORDS);
  return given && SEVERITY_ORDER[given] <= SEVERITY_ORDER[was] ? given : escalatedSeverity(was);
}

/**
 * A threat's name as the detector may return it, without the severity it
 * tacked on: "Raiders: high", "Raiders (immediate)", "Raiders — active" are
 * all "Raiders", with the severity those words mean.
 *
 * @param {string} raw
 * @returns {{ name: string, severity: string|null }}
 */
export function splitThreatName(raw) {
  const { name, severity } = splitThreatTail(raw);
  return { name, severity };
}

/**
 * splitThreatName, with the tacked-on severity as it was written (`said`:
 * "Raiders: escalating" → "escalating") — recordThreat reads whether those
 * words name a level or only say the threat grew (THREAT-REDETECTED-ESCALATING).
 *
 * @param {string} raw
 * @returns {{ name: string, severity: string|null, said: string|null }}
 */
function splitThreatTail(raw) {
  let name = String(raw ?? "").replace(/\s+/g, " ").trim();
  let severity = null;
  let said = null;
  for (;;) {
    const m = /^(.*\S)\s*(?:[:—–]\s*|\s-\s+)([^:—–()]+)$/.exec(name) ?? /^(.*\S)\s*\(([^()]+)\)$/.exec(name);
    const tail = m ? normalizeThreatSeverity(m[2]) : null;
    if (!m || !tail) break;
    if (!severity) { severity = tail; said = m[2].trim(); }
    name = m[1].trim();
  }
  return { name, severity, said };
}

/**
 * The Threats page a name the detector returned belongs to: the page so
 * named; else the one of the same name whatever its case, spacing or article;
 * else one whose name this is a variant of, or that is a variant of this
 * (nameMatch.js suffixedName — more said after a separator). Of several, a threat still
 * in play before a resolved one, then the shortest name. null for a threat
 * the journal does not hold.
 *
 * A page a GM's Merge duplicates closed is the threat it was merged into
 * (`mergedInto`, followed — mergedThreatPage): the closed page's name is a
 * variant of the kept one's — the detector dropped an article or tacked the
 * same words on again, which is how the duplicate was made — so the kept page
 * takes the update and the closed page stays closed (issue #362 AC21: the
 * page so named was returned before anything was ranked, and nothing read
 * `mergedInto`, so the closed page was written and active again).
 *
 * Variants that are the name with a sector's name added — two sectors' one
 * Sector Trouble — are narrowed to the active sector's first
 * (activeSectorTroublePages, issue #362 AC43).
 *
 * @param {JournalEntry|null} journal — the Threats journal
 * @param {string} name — splitThreatName's
 * @param {Object|null} [campaignState] — its `sectors` and `activeSectorId`
 * @returns {JournalEntryPage|null}
 */
function findThreatPageVariant(journal, name, campaignState = null) {
  const exact = findPageByName(journal, name);
  if (exact) return mergedThreatPage(journal, exact);
  const key = nameKey(name);
  if (!key) return null;
  const pages = (journal?.pages?.contents ?? [])
    .map(page => ({ page, entry: page?.flags?.[MODULE_ID]?.[FLAG_KEYS.threats] ?? null }))
    .filter(p => p.entry?.name)
    .map(p => ({ ...p, key: nameKey(p.entry.name) }));
  const rank = (p) => (p.entry.severity === "resolved" ? 1 : 0);
  const best = (hits) => hits.sort((a, b) => (rank(a) - rank(b)) || (a.key.length - b.key.length))[0]?.page ?? null;
  const hit = best(pages.filter(p => p.key === key))
      ?? best(activeSectorTroublePages(pages.filter(p => suffixedName(p.entry.name, name)), name, campaignState));
  return hit ? mergedThreatPage(journal, hit) : null;
}

/**
 * Of several Threats pages a detected name is a variant of, the ones that are
 * a sector's: each sector's Sector Trouble is its own threat, named
 * "<trouble> — <sector>" (sectorGenerator, issue #342 Z65 — resolving it for
 * one resolved both), so a trouble two sectors rolled, named by the trouble
 * alone, is the active sector's — the shorter sector name took it, whichever
 * sector the crew was in (issue #362 AC43). Another sector's page is left
 * out; with none of them the active sector's, what is left — maybe nothing,
 * and the name is then no recorded threat's: a new page, or a transition
 * skipped. Pages that are no sector's, and a single hit, are kept as they are.
 *
 * @param {Array<{ page: JournalEntryPage, key: string }>} hits — the variant pages (`key` nameKey of their name)
 * @param {string} name — the detected name
 * @param {Object|null} campaignState
 * @returns {Array} the hits to choose from
 */
function activeSectorTroublePages(hits, name, campaignState) {
  if (hits.length < 2) return hits;
  const sectors = (Array.isArray(campaignState?.sectors) ? campaignState.sectors : [])
    .map(s => ({ id: s?.id ?? null, key: nameKey(s?.name) }))
    .filter(s => s.key);
  if (!sectors.length) return hits;
  const base = nameKey(name);
  const sectorOf = (hit) => {
    if (hit.key.length <= base.length || !hit.key.startsWith(base)) return null;
    const added = nameKey(hit.key.slice(base.length).replace(/^\s*(?:[:;(—–]|-\s)\s*/u, "").replace(/\)\s*$/u, ""));
    return sectors.find(s => s.key === added) ?? null;
  };
  const tagged = hits.map(hit => ({ hit, sector: sectorOf(hit) }));
  if (!tagged.some(t => t.sector)) return hits;
  const activeSectorId = campaignState?.activeSectorId ?? null;
  const here = tagged.filter(t => t.sector && activeSectorId && t.sector.id === activeSectorId);
  return (here.length ? here : tagged.filter(t => !t.sector)).map(t => t.hit);
}

/**
 * The page a threat page was merged into (`mergedInto`, mergeDuplicateThreats),
 * followed to the page that holds the threat now — a kept page merged later
 * into another is followed on; a mark that names no page, or loops, stops
 * where it is. A page never merged is itself (issue #362 AC21).
 *
 * @param {JournalEntry|null} journal — the Threats journal
 * @param {JournalEntryPage} page
 * @returns {JournalEntryPage}
 */
function mergedThreatPage(journal, page) {
  const seen = new Set();
  let at = page;
  for (;;) {
    seen.add(at);
    const into = at?.flags?.[MODULE_ID]?.[FLAG_KEYS.threats]?.mergedInto;
    const next = typeof into === "string" && into.trim() ? findPageByName(journal, into) : null;
    if (!next || seen.has(next)) return at;
    at = next;
  }
}

/**
 * The recorded threat a name the detector returned means, by its own name —
 * or the name itself, cleaned, when the journal holds no such threat. A name
 * that runs two threats together ("A: looming; B: immediate" — the list the
 * detector was shown) is the first of them the journal holds. A Sector
 * Trouble two sectors share is the active sector's (`campaignState`, issue
 * #362 AC43).
 *
 * `said` is the severity the detector tacked onto the name, as written
 * ("Raiders: escalating" → "escalating"; null when it tacked none on).
 *
 * @param {string} raw
 * @param {Object|null} [campaignState] — its `sectors` and `activeSectorId`
 * @returns {{ name: string, severity: string|null, said: string|null, known: boolean }}
 */
export function resolveThreatName(raw, campaignState = null) {
  const journal = findJournal(JOURNAL_NAMES.threats);
  const whole = splitThreatTail(raw);
  const named = (split) => {
    const page = split.name ? findThreatPageVariant(journal, split.name, campaignState) : null;
    const name = page ? (entryTitle(page) ?? page.name) : null;
    return name ? { name, severity: split.severity, said: split.said, known: true } : null;
  };
  const hit = named(whole);
  if (hit) return hit;
  if (String(raw ?? "").includes(";")) {
    for (const part of String(raw).split(";")) {
      const partHit = named(splitThreatTail(part));
      if (partHit) return partHit;
    }
  }
  return { ...whole, known: false };
}

/** The base name a threat page is grouped under: its name without a tacked-on severity, the first of a run of names. */
function threatGroupKey(name) {
  const first = String(name ?? "").split(";")[0];
  return nameKey(splitThreatName(first).name);
}

/**
 * The active threats recorded more than once (issue #354 P2-15): pages whose
 * names are one threat's — the same but for case, spacing or an article, or
 * one a variant of another (nameMatch.js suffixedName). Each group names the page
 * it keeps — the plainest name, the oldest of equals — and the rest. Pages
 * already merged away, and resolved threats, are left out.
 *
 * @returns {Array<{ keep: string, merge: string[] }>}
 */
export function findDuplicateThreats() {
  const journal = findJournal(JOURNAL_NAMES.threats);
  const entries = readEntries(journal, FLAG_KEYS.threats)
    .filter(e => e?.name && !e.mergedInto && (normalizeThreatSeverity(e.severity) ?? "active") !== "resolved")
    .map(e => ({ entry: e, key: threatGroupKey(e.name) }))
    .filter(e => e.key)
    .sort((a, b) => (a.key.length - b.key.length) || String(a.entry.createdAt ?? "").localeCompare(String(b.entry.createdAt ?? "")));
  const groups = [];
  for (const e of entries) {
    // Shortest first, so a group's first member is its base name.
    const group = groups.find(g => g[0].key === e.key || suffixedName(g[0].key, e.key));
    if (group) group.push(e);
    else groups.push([e]);
  }
  return groups.filter(g => g.length > 1)
    .map(g => ({ keep: g[0].entry.name, merge: g.slice(1).map(e => e.entry.name) }));
}

/**
 * Merge the active threats recorded more than once, when a GM asks (the World
 * Journal panel's button — never by itself): each group's kept page takes the
 * others' history, in the order they were last written, and the severity and
 * summary of the one written last; each other page is closed — resolved, and
 * marked `mergedInto` — not deleted, so nothing it holds is lost and a plan
 * about it still finds its page. GM only.
 *
 * @param {Object} [campaignState]
 * @returns {Promise<{ kept: number, merged: number }>}
 */
export async function mergeDuplicateThreats(campaignState = null) {
  const out = { kept: 0, merged: 0 };
  if (!globalThis.game?.user?.isGM) return out;
  const journal = findJournal(JOURNAL_NAMES.threats);
  if (!journal) return out;
  const sessionId = campaignState?.currentSessionId ?? "";
  for (const group of findDuplicateThreats()) {
    const keepPage = findPageByName(journal, group.keep);
    const kept = keepPage?.flags?.[MODULE_ID]?.[FLAG_KEYS.threats];
    if (!kept) continue;
    const others = group.merge
      .map(name => findPageByName(journal, name))
      .filter(page => page && page !== keepPage && page.flags?.[MODULE_ID]?.[FLAG_KEYS.threats])
      .sort((a, b) => String(a.flags[MODULE_ID][FLAG_KEYS.threats].updatedAt ?? "")
        .localeCompare(String(b.flags[MODULE_ID][FLAG_KEYS.threats].updatedAt ?? "")));
    if (!others.length) continue;

    const history = threatHistoryOf(kept);
    let latest = kept;
    for (const page of others) {
      const entry = page.flags[MODULE_ID][FLAG_KEYS.threats];
      for (const h of threatHistoryOf(entry)) {
        if (h?.summary && !history.some(k => k?.summary === h.summary)) history.push(h);
      }
      if (String(entry.updatedAt ?? "") > String(latest.updatedAt ?? "")) latest = entry;
    }
    const now = new Date().toISOString();
    const severity = normalizeThreatSeverity(latest.severity) ?? "active";
    const summary = strayThreatNote(latest.severity) || latest.summary || kept.summary || "";
    if (summary && !history.some(h => h?.summary === summary)) history.push({ sessionId, severity, summary });
    // The GM's write: it owns the entry, as a `!journal` ruling does (no narration stamp).
    await writeEntryPage(keepPage, FLAG_KEYS.threats, {
      ...kept, severity, summary, lastUpdated: sessionId, history: cappedThreatHistory(history),
      updatedAt: now, ...narrationStamp(null, kept),
    });
    out.kept += 1;
    for (const page of others) {
      const entry = page.flags[MODULE_ID][FLAG_KEYS.threats];
      await writeEntryPage(page, FLAG_KEYS.threats, {
        ...entry, severity: "resolved", mergedInto: kept.name, lastUpdated: sessionId,
        updatedAt: now, ...narrationStamp(null, entry),
      });
      out.merged += 1;
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// NARRATION PROVENANCE — what the X-Card undoes (issue #329 X01)
// ─────────────────────────────────────────────────────────────────────────────
//
// The capture that runs after a narration (entityExtractor
// routeWorldJournalResults) records what the prose established. Each entry it
// writes carries that narration's `narrationId`, and an entry it rewrote keeps
// the versions before as `previous` (newest first) — so an X-Card on the
// narration puts the earlier version back, or takes an entry the narration
// made out of play (undoNarrationEntries; rules/narrator-memory.md 6b). A
// scene-end archive carries the id of the narration that asserted the truth
// (issue #335 Y01). A later write that carries no narration id (a GM's
// `!journal`, the archive of a GM's `!truth set`) owns the entry from then
// on: it clears both.
//
// Both are always written, null when cleared: Foundry's setFlag merges the
// object into the stored flag key by key (see recordLoreDiscovery), so a key
// left out keeps its stored value. `previous` is an array because a merge
// replaces an array whole, where it would merge a nested object into the
// stored one.

/** How many earlier versions a narration-written entry keeps, for an X-Card whose beat rewrote it more than once. */
const NARRATION_HISTORY = 3;

/**
 * The provenance fields of an entry write: the narration it came from and the
 * stored versions it replaces (null for a new entry), or both null when the
 * write is not a narration's.
 *
 * @param {string|null|undefined} narrationId
 * @param {Object|null|undefined} existing — the stored entry
 * @returns {{ narrationId: string|null, previous: Object[]|null }}
 */
export function narrationStamp(narrationId, existing) {
  if (typeof narrationId !== "string" || !narrationId) return { narrationId: null, previous: null };
  if (!existing) return { narrationId, previous: null };
  const { previous: older, ...version } = existing;
  const previous = [version, ...(Array.isArray(older) ? older : [])].slice(0, NARRATION_HISTORY);
  return { narrationId, previous };
}

// ─────────────────────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ensure the folder + four category journals exist. GM-only — players cannot
 * create world-scoped journals. Idempotent: returns early if everything is
 * already in place.
 *
 * @returns {Promise<void>}
 */
export async function initWorldJournals() {
  // One GM creates the World Journal folder and its four journals — the canonical one: two GMs whose clients
  // reconnected together each found none and created one (issue #326 W54).
  if (!isCanonicalGM()) return;

  const missing = [];
  for (const name of Object.values(JOURNAL_NAMES)) {
    // By its category, so a journal the GM renamed is not made again beside
    // it (issue #345 AA63).
    const existing = findJournal(name);
    if (existing) await stampJournalCategory(existing, name);
    else missing.push(name);
  }
  if (!missing.length) return;

  // The folder is looked for — and made — only for a journal about to be
  // made, and found by its stamp, not its name: a load after the GM renamed
  // it made an empty "Starforged Companion" folder beside it, again at every
  // load once the GM deleted that (issue #362 AC48).
  const folderId = await companionJournalFolderId({ create: true });
  for (const name of missing) {
    try {
      await JournalEntry.create(journalCreateData(name, folderId));
    } catch (err) {
      console.error(`${MODULE_ID} | worldJournal: failed to create journal ${name}:`, err);
    }
  }
}

/** The module's journal folder's own mark, set when the module makes it (issue #362 AC48). */
const FOLDER_FLAG = "companionJournalFolder";

/**
 * The module's journal folder — where the World Journal, the Pacing Telemetry
 * journal and the Private Channel transcripts are made — or null: the folder
 * stamped FOLDER_FLAG when the module made it, what a GM's rename in the
 * sidebar leaves alone; else the folder of its name (one made before the
 * stamp); else the folder a World Journal journal sits in (such a folder the
 * GM renamed). Found by its name alone, a renamed folder was passed over and
 * a second, empty one made beside it (issue #362 AC48; rules/reachability.md
 * §6, §7). Never creates.
 *
 * @returns {Folder|null}
 */
function findCompanionJournalFolder() {
  const folders = globalThis.game?.folders;
  if (typeof folders?.find !== "function") return null;
  const journalFolder = (f) => f?.type === "JournalEntry";
  const found = folders.find(f => journalFolder(f) && f.flags?.[MODULE_ID]?.[FOLDER_FLAG] === true)
             ?? folders.find(f => journalFolder(f) && f.name === FOLDER_NAME);
  if (found) return found;
  for (const name of Object.values(JOURNAL_NAMES)) {
    // A document's `folder` is its Folder (Foundry v13); a stub's, the id.
    const ref = findJournal(name)?.folder;
    const id  = typeof ref === "object" ? ref?.id : ref;
    if (typeof id !== "string" || !id) continue;
    const folder = folders.get?.(id) ?? folders.find(f => f?.id === id);
    if (journalFolder(folder)) return folder;
  }
  return null;
}

/**
 * The id of the module's journal folder (findCompanionJournalFolder), or null.
 * With `create`, a folder is made — stamped — when there is none: only a
 * caller about to make a journal in it asks for that. A refused create is
 * logged, and the journal is made outside any folder.
 *
 * @param {{ create?: boolean }} [opts]
 * @returns {Promise<string|null>}
 */
export async function companionJournalFolderId({ create = false } = {}) {
  let folder = null;
  try {
    folder = findCompanionJournalFolder();
    if (!folder && create && globalThis.Folder?.create) {
      folder = await globalThis.Folder.create({
        name: FOLDER_NAME, type: "JournalEntry",
        flags: { [MODULE_ID]: { [FOLDER_FLAG]: true } },
      });
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | worldJournal: the journal folder could not be found or made:`, err?.message ?? err);
    folder = null;
  }
  return folder?.id ?? null;
}


// ─────────────────────────────────────────────────────────────────────────────
// WRITE — entries
// ─────────────────────────────────────────────────────────────────────────────

/**
 * True for a lore entry a GM ruled: not canon, not the narrator's, not
 * struck — a rumour (`!journal lore "<title>" rumour — text`, which also
 * files a GM's own entry) or one the GM dismissed from review. A GM's ruling
 * stands until a GM changes it (issue #330 D9): only `!journal lore
 * "<title>" confirmed` or the panel's Confirm promotes it.
 *
 * @param {Object|null|undefined} entry — a stored loreEntry
 * @returns {boolean}
 */
function isGmRuledLore(entry) {
  return !!entry && entry.retracted !== true && entry.confirmed !== true && entry.narratorAsserted !== true;
}

/**
 * Record a lore discovery. Creates a page named after the title; on duplicate
 * titles the existing entry is updated.
 *
 * Manual entries via !journal default to confirmed: false / narratorAsserted:
 * false. !journal lore "title" confirmed sets confirmed: true. The combined
 * detection pass writes narratorAsserted: true, confirmed: false.
 *
 * An update keeps the entry's text and category when the caller gives none,
 * and its `retracted` mark unless the caller sets one: Foundry's setFlag
 * merges the object into the stored flag key by key, so `retracted` is always
 * written explicitly (issue #321 U40 — a restore left it set).
 *
 * A narrator write (`narratorAsserted: true` — the detection pass, a scene
 * truth's archive, the inciting incident) never overturns a GM's ruling: an
 * entry the GM ruled a rumour or dismissed from review (isGmRuledLore) is
 * left as the GM left it, and returned unchanged (issue
 * #330 D9 — the narrator mentioning it again made it canon again).
 *
 * `entry.revealOf` — a hidden plan's id, on the entry a reveal of that
 * plan's truth files (a narration's, or a GM's Reveal now): the entry is the
 * plan's truth mirrored into Lore, and follows it when a supersede takes the
 * reveal back (undoRevealedTruthLore) — and a reveal of the same plan's truth
 * confirms it again where the X-Card retracted an earlier reveal's: only a
 * reveal the X-Card's withholding no longer holds back gets here (issue #364
 * XCARD-REVEAL-REREVEAL-NO-LORE).
 *
 * Empty titles are rejected.
 *
 * @param {string} title
 * @param {Object} entry — partial loreEntry (text, category, sessionId, …)
 * @param {Object} campaignState
 * @returns {Promise<Object|null>} — the entry data enriched with {pageId, journalId}, or null on failure
 */
export async function recordLoreDiscovery(title, entry, campaignState) {
  const cleanTitle = title?.trim();
  if (!cleanTitle) {
    console.warn(`${MODULE_ID} | worldJournal: recordLoreDiscovery rejected — empty title`);
    return null;
  }

  const journal = await getOrCreateJournal(JOURNAL_NAMES.lore);
  if (!journal) return null;

  const existingPage = findPageByName(journal, cleanTitle);
  const existing  = existingPage?.flags?.[MODULE_ID]?.[FLAG_KEYS.lore];
  if (entry?.narratorAsserted === true && isGmRuledLore(existing)) {
    console.debug(`${MODULE_ID} | worldJournal: lore "${cleanTitle}" stands as the GM ruled it — the narrator's mention does not change it.`);
    return { ...existing, pageId: existingPage.id, journalId: journal.id };
  }
  const now       = new Date().toISOString();
  // A plan's truth revealed over the entry an earlier reveal of the same plan
  // filed: the plan is canonical, and its mirror follows it (issue #364
  // XCARD-REVEAL-REREVEAL-NO-LORE). The X-Card's retraction of that earlier
  // reveal kept a reveal the GM let through out of canon: the new truth after
  // a GM's edit, a GM's Reveal now.
  const reRevealed = typeof entry?.revealOf === "string" && !!entry.revealOf && entry.confirmed === true
    && existing?.revealOf === entry.revealOf;
  const retracted = typeof entry?.retracted === "boolean" ? entry.retracted : (existing?.retracted === true && !reRevealed);

  const data = {
    title:            cleanTitle,
    category:         entry?.category ?? existing?.category ?? "other",
    text:             entry?.text || existing?.text || "",
    sessionId:        entry?.sessionId ?? campaignState?.currentSessionId ?? "",
    sessionNumber:    entry?.sessionNumber ?? campaignState?.sessionNumber ?? null,
    moveId:           entry?.moveId   ?? null,
    confirmed:        entry?.confirmed === true,
    narratorAsserted: entry?.narratorAsserted === true,
    // A struck fact's entry (retractSessionLore) stays out of canon until a
    // GM's !journal ruling restores it.
    retracted,
    retractedAt:      retracted ? (existing?.retractedAt ?? now) : null,
    promotedAt:       existing?.promotedAt ?? (entry?.confirmed === true ? now : null),
    // Fact-continuity fields (issue #227 (Fact Continuity) §4.4). Optional;
    // null for entries that did not originate from a scene-truth migration.
    subject:          entry?.subject ?? existing?.subject ?? null,
    fact:             entry?.fact    ?? existing?.fact    ?? null,
    sceneId:          entry?.sceneId ?? existing?.sceneId ?? null,
    createdAt:        existing?.createdAt ?? now,
    updatedAt:        now,
    // The hidden plan whose revealed truth this entry mirrors, by the plan's
    // id — set by a reveal of its truth alone (secrets.js onTruthRevealed, a
    // narration's; revealSkeletonNow, a GM's), so a supersede of that
    // narration takes the entry back with the truth (undoRevealedTruthLore,
    // issue #364 SUPERSEDED-REVEAL-LORE-STANDS; it takes back no GM's).
    // Always written, null on every other write: the flag is merged, and an
    // entry anything else wrote since is no longer the reveal's.
    revealOf:         typeof entry?.revealOf === "string" && entry.revealOf ? entry.revealOf : null,
    // The narration whose capture wrote it, and the version it replaced —
    // for the X-Card (issue #329 X01).
    ...narrationStamp(entry?.narrationId, existing),
  };

  const page = await upsertPage(journal, cleanTitle, FLAG_KEYS.lore, data);
  return page ? { ...data, pageId: page.id, journalId: journal.id } : null;
}

/**
 * Archive a scene-end fact-continuity truth (free-text or scene-scoped) to
 * the WJ Lore journal. See issue #227 (Fact Continuity) §9.2 step 2. A
 * scene-subject truth reaches here only when the scene's place is not a
 * recorded entity (endScene files it on the place's card otherwise).
 *
 * Composes a synthetic page title:
 *   - scene subjects → "<place>: <fact>" with the scene frame's location,
 *     else "Scene <sceneId>: <fact>" (issue #286 C2: the scene id names no
 *     place the narrator could ever match)
 *   - text  subjects → "<subject>: <fact>"
 *
 * Returns the recordLoreDiscovery result, or null if the truth has no fact
 * or no resolvable subject.
 *
 * @param {Object} truth — sceneTruths entry from campaignState
 * @param {Object} campaignState
 * @param {Object} [options]
 * @param {string|null} [options.placeLabel] — where the scene happened (the frame's location)
 * @returns {Promise<Object|null>}
 */
export async function archiveSceneTruth(truth, campaignState, options = {}) {
  const fact = String(truth?.fact ?? '').trim();
  if (!fact) return null;
  const subject = truth?.subject;
  if (!subject || typeof subject !== 'object') return null;

  let subjectLabel = '';
  let subjectKey   = '';
  if (subject.kind === 'scene') {
    const place  = typeof options.placeLabel === 'string' ? options.placeLabel.trim() : '';
    subjectLabel = place || `Scene ${truth.sceneId ?? subject.sceneId ?? ''}`.trim();
    subjectKey   = 'scene';
  } else if (subject.kind === 'text') {
    subjectLabel = String(subject.text ?? '').trim();
    subjectKey   = subjectLabel;
  } else if (subject.kind === 'entity') {
    // Entity-kind subjects migrate to the entity's generative tier — they
    // should not reach the lore archival path. Tolerate defensively.
    return null;
  } else {
    return null;
  }
  if (!subjectLabel) return null;

  const titleSeed = `${subjectLabel}: ${fact}`;
  const title     = titleSeed.length > 100 ? `${titleSeed.slice(0, 97)}...` : titleSeed;

  return recordLoreDiscovery(title, {
    category:         'other',
    text:             fact,
    subject:          subjectKey,
    fact,
    sceneId:          truth.sceneId ?? null,
    narratorAsserted: true,
    confirmed:        true,
    sessionId:        truth.sessionId ?? null,
    sessionNumber:    truth.sessionNum ?? null,
    moveId:           truth.moveId    ?? null,
    // The narration that asserted the truth (a GM's `!truth set` carries
    // none): an X-Card played on it after the scene ended retracts a page
    // this made and restores one it rewrote (undoNarrationEntries — issue
    // #335 Y01).
    narrationId:      typeof truth.narrationId === 'string' && truth.narrationId ? truth.narrationId : null,
  }, campaignState);
}

/**
 * Record an active threat. Creates a page named after the threat; on duplicate
 * names the existing entry is updated. Severity and summary changes are
 * appended to the history array so the timeline is preserved.
 *
 * The severity is one of THREAT_SEVERITIES (normalizeThreatSeverity): the
 * one given, else the one the threat has, else "looming". A value that is no
 * severity is never stored as one — a sentence given for it is kept as the
 * summary when none came with it (issue #354 P2-15).
 *
 * `entry.fromDetection` — the narration capture's writes: the name is the
 * recorded threat's when it is a variant of one (resolveThreatName), so a
 * threat the detector names "<name>: high" updates "<name>" and starts no
 * second page. A GM's `!journal threat` names a page exactly, as it always has.
 *
 * A recorded threat the capture lists again with a severity that says it grew
 * ("escalating", "rising") is never made less urgent — the "escalated"
 * transition's rule (escalationSeverity, issue #362 AC42), on the list path
 * too: the level those words come with when it is at least as urgent as the
 * threat was ("escalating to immediate"), else one step more urgent. Read as
 * "active", the word lowered an immediate threat on the beat that pressed it
 * (issue #364 THREAT-REDETECTED-ESCALATING). On a threat's first record the
 * word still reads as active, unless a level comes with it.
 *
 * @param {string} name
 * @param {Object} entry
 * @param {Object} campaignState
 * @returns {Promise<Object|null>} — the entry data enriched with {pageId, journalId}, or null on failure
 */
export async function recordThreat(name, entry, campaignState) {
  const typed = name?.trim();
  if (!typed) {
    console.warn(`${MODULE_ID} | worldJournal: recordThreat rejected — empty name`);
    return null;
  }

  const journal = await getOrCreateJournal(JOURNAL_NAMES.threats);
  if (!journal) return null;

  const detected  = entry?.fromDetection === true;
  const resolved  = detected ? resolveThreatName(typed, campaignState) : { name: typed, severity: null, said: null };
  const cleanName = resolved.name || typed;
  const existing  = findPageByName(journal, cleanName)?.flags?.[MODULE_ID]?.[FLAG_KEYS.threats];
  const now       = new Date().toISOString();
  const was       = existing ? (normalizeThreatSeverity(existing.severity) ?? "active") : null;
  // What this write says of the severity: the entry's when it reads as one,
  // else the one the detector tacked onto the name.
  const said      = normalizeThreatSeverity(entry?.severity) ? entry.severity : resolved.said;
  const grew      = detected && saysThreatGrew(said);
  const severity  = grew && was
    ? escalationSeverity(said, was)
    : (grew ? severityNamedBy(said, ESCALATION_WORDS) : null) ?? normalizeThreatSeverity(said) ?? was ?? "looming";
  const sessionId = entry?.sessionId ?? campaignState?.currentSessionId ?? "";
  const given     = typeof entry?.summary === "string" && entry.summary.trim() ? entry.summary.trim() : strayThreatNote(entry?.severity);
  const summary   = given || existing?.summary || "";

  const history = threatHistoryOf(existing);
  if (!existing || was !== severity || (given && given !== existing.summary)) {
    history.push({ sessionId, severity, summary });
  }

  const data = {
    name:        cleanName,
    type:        entry?.type ?? existing?.type ?? "other",
    severity,
    summary,
    firstSeen:   existing?.firstSeen ?? sessionId,
    lastUpdated: sessionId,
    history:     cappedThreatHistory(history),
    createdAt:   existing?.createdAt ?? now,
    updatedAt:   now,
    // A page this write lands on is the threat's own: the capture's follows a
    // merged page to the one it was merged into (findThreatPageVariant), so
    // only a GM's `!journal` naming a closed page re-opens it — and then it is
    // no longer merged away. Written null, not left out: Foundry merges a flag
    // key by key, so the old mark would stay (issue #362 AC21).
    mergedInto:  null,
    ...narrationStamp(entry?.narrationId, existing),   // for the X-Card (issue #329 X01)
  };

  const page = await upsertPage(journal, cleanName, FLAG_KEYS.threats, data);
  return page ? { ...data, pageId: page.id, journalId: journal.id } : null;
}

/**
 * A stored threat's history, as a copy to append to. An entry from before the
 * severity was checked (issue #354 P2-15) may hold a sentence as its severity:
 * that sentence is what the threat was doing, so it is kept as a history line
 * under the severity it is read as, never lost with the rewrite.
 */
function threatHistoryOf(existing) {
  const history = Array.isArray(existing?.history) ? [...existing.history] : [];
  const stray = strayThreatNote(existing?.severity);
  if (stray && !history.some(h => h?.summary === stray)) {
    history.push({ sessionId: existing.lastUpdated ?? "", severity: "active", summary: stray });
  }
  return history;
}

/** A threat's history within its cap: its first entry and its most recent. */
function cappedThreatHistory(history) {
  return history.length > THREAT_HISTORY_CAP
    ? [history[0], ...history.slice(-(THREAT_HISTORY_CAP - 1))]
    : history;
}

/**
 * Record faction intelligence. Creates a page named after the faction; on
 * duplicate names the existing entry is updated. Each call appends an entry
 * to the encounters array — save one with `entry.encounter === false`, a
 * bookkeeping write that met the faction nowhere in the fiction (a draft
 * Confirm's backlink and mirror: FACTION-CONFIRM-TWO-ENCOUNTERS).
 *
 * One faction is one page whatever article, case or spacing names it
 * (factionNameKey — issue #336 Y31): a mention matching a page by key
 * updates that page under its own name, and a new page takes the matching
 * record's name, so "The Iron Syndicate" never starts a second page beside
 * "Iron Syndicate".
 *
 * @param {string} name
 * @param {Object} entry — { attitude, summary, knownGoal, entityId, encounter, ... }
 * @param {Object} campaignState
 * @returns {Promise<Object|null>} — the entry data enriched with {pageId, journalId}, or null on failure
 */
export async function recordFactionIntelligence(name, entry, campaignState) {
  const cleanName = name?.trim();
  if (!cleanName) {
    console.warn(`${MODULE_ID} | worldJournal: recordFactionIntelligence rejected — empty name`);
    return null;
  }

  const journal = await getOrCreateJournal(JOURNAL_NAMES.factions);
  if (!journal) return null;

  const existingPage = findFactionPage(journal, cleanName);
  const existing  = existingPage?.flags?.[MODULE_ID]?.[FLAG_KEYS.factions];
  const now       = new Date().toISOString();
  const sessionId = entry?.sessionId ?? campaignState?.currentSessionId ?? "";
  const attitude  = entry?.attitude ?? existing?.attitude ?? "unknown";

  const encounters = Array.isArray(existing?.encounters) ? [...existing.encounters] : [];
  if (entry?.encounter !== false) {
    encounters.push({
      sessionId,
      summary:        entry?.summary ?? "",
      attitudeAtTime: attitude,
    });
  }

  // Entity-record sync (FACTION-ATTITUDE-SPLIT-BRAIN / FACTION-DUAL-STORE,
  // 2026-07): when a faction entity record exists, it is the canonical
  // stance home — every WJ attitude write (detection transitions, !journal,
  // auto-surface) maps onto record.relationship, and the WJ entry backlinks
  // the record via entityId. The WJ entry remains the intelligence log.
  // Fail-open: a sync failure never blocks the journal write.
  let linkedEntityId = entry?.entityId ?? existing?.entityId ?? null;
  // The record's stance this write changed — for the X-Card, which puts it
  // back when the narration is removed (XCARD-CAPTURE-TRANSITIONS).
  let recordStance = null;
  // The record's own name, for a page this write starts (issue #336 Y31).
  let recordName = null;
  try {
    const { findFactionByName, applyAttitudeToFactionRecord } = await import("../entities/faction.js");
    const hit = findFactionByName(cleanName, campaignState);
    if (hit) {
      linkedEntityId = linkedEntityId ?? hit.id;
      recordName = String(hit.faction?.name ?? "").trim() || null;
      if (attitude !== "unknown") {
        const before  = hit.faction?.relationship ?? null;
        const changed = await applyAttitudeToFactionRecord(cleanName, attitude, campaignState);
        if (changed) recordStance = { entityId: hit.id, before, after: changed.relationship ?? null };
      }
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | worldJournal: faction record sync failed:`, err?.message ?? err);
  }
  const stamp = narrationStamp(entry?.narrationId, existing);
  // The faction's one page keeps its name; a new one takes the record's.
  const pageName = existingPage?.name ?? recordName ?? cleanName;

  const data = {
    factionName:  pageName,
    entityId:     linkedEntityId,
    knownGoal:    entry?.knownGoal ?? existing?.knownGoal ?? "",
    attitude,
    encounters,
    createdAt:    existing?.createdAt ?? now,
    updatedAt:    now,
    ...stamp,   // for the X-Card (issue #329 X01)
    // Always written (null when none): the stance a narration's write moved
    // on the faction's record, { entityId, before, after }.
    recordStance: stamp.narrationId ? recordStance : null,
  };

  const page = await upsertPage(journal, pageName, FLAG_KEYS.factions, data);
  return page ? { ...data, pageId: page.id, journalId: journal.id } : null;
}

/**
 * Record a location entry. Creates a page named after the location; on
 * duplicate names appends a visit to the existing record.
 *
 * @param {string} name
 * @param {Object} entry — { type, description, status, summary, entityId, ... }
 * @param {Object} campaignState
 * @returns {Promise<Object|null>} — the entry data enriched with {pageId, journalId}, or null on failure
 */
export async function recordLocation(name, entry, campaignState) {
  const cleanName = name?.trim();
  if (!cleanName) {
    console.warn(`${MODULE_ID} | worldJournal: recordLocation rejected — empty name`);
    return null;
  }

  const journal = await getOrCreateJournal(JOURNAL_NAMES.locations);
  if (!journal) return null;

  const existing  = findPageByName(journal, cleanName)?.flags?.[MODULE_ID]?.[FLAG_KEYS.locations];
  const now       = new Date().toISOString();
  const sessionId = entry?.sessionId ?? campaignState?.currentSessionId ?? "";

  const visits = Array.isArray(existing?.visits) ? [...existing.visits] : [];
  visits.push({ sessionId, summary: entry?.summary ?? entry?.description ?? "" });

  const data = {
    locationName: cleanName,
    entityId:     entry?.entityId ?? existing?.entityId ?? null,
    type:         entry?.type        ?? existing?.type        ?? "other",
    description:  entry?.description ?? existing?.description ?? "",
    firstVisited: existing?.firstVisited ?? sessionId,
    lastVisited:  sessionId,
    status:       entry?.status      ?? existing?.status      ?? "current",
    visits,
    createdAt:    existing?.createdAt ?? now,
    updatedAt:    now,
    ...narrationStamp(entry?.narrationId, existing),   // for the X-Card (issue #329 X01)
  };

  const page = await upsertPage(journal, cleanName, FLAG_KEYS.locations, data);
  return page ? { ...data, pageId: page.id, journalId: journal.id } : null;
}

/**
 * Update a threat's severity. Appends to the history array. If the named
 * threat does not exist this logs a warning and returns null — the function
 * never creates a new threat from this path. A narration's capture passes its
 * `narrationId`: the write is stamped with it and keeps the version it
 * replaced, so an X-Card on that narration puts the threat back
 * (XCARD-CAPTURE-TRANSITIONS); any other write owns the entry (no stamp), as
 * the record writers' (issue #329 X01).
 *
 * The severity is one of THREAT_SEVERITIES (normalizeThreatSeverity). A
 * value that is none changes nothing — unless `escalate` is set (the
 * detector's "escalated" transition), which never leaves the threat less
 * urgent: the severity given when it is at least as urgent as the threat was,
 * else — none given, a word that only repeats the change ("escalated",
 * "rising"), or a lower one — one step more urgent (escalationSeverity,
 * issue #362 AC42). `note` — what the threat is now doing — becomes its summary and the
 * history line; it was stored as the severity (issue #354 P2-15).
 * `fromDetection` finds the threat by a variant of its name
 * (resolveThreatName), as recordThreat does.
 *
 * @param {string} name
 * @param {string} severity
 * @param {Object} campaignState
 * @param {{ narrationId?: string|null, note?: string|null, escalate?: boolean, fromDetection?: boolean }} [options]
 */
export async function updateThreatSeverity(name, severity, campaignState, { narrationId = null, note = null, escalate = false, fromDetection = false } = {}) {
  const journal = await getOrCreateJournal(JOURNAL_NAMES.threats);
  if (!journal) return null;

  const typed = name?.trim() ?? "";
  const page = findPageByName(journal, fromDetection ? resolveThreatName(typed, campaignState).name : typed);
  if (!page) {
    // Not a warning: the detector may reference a danger that was never
    // recorded as a threat. The detection prompt now discourages this, but a
    // stray transition is harmless — we just have nothing to update. Debug so
    // it stops spamming the error log during play.
    console.debug?.(`${MODULE_ID} | worldJournal: updateThreatSeverity — no recorded threat named "${name}"; skipping`);
    return null;
  }

  const existing = page.flags?.[MODULE_ID]?.[FLAG_KEYS.threats];
  if (!existing) return null;

  const was  = normalizeThreatSeverity(existing.severity) ?? "active";
  const next = escalate ? escalationSeverity(severity, was) : normalizeThreatSeverity(severity);
  if (!next) {
    console.warn(`${MODULE_ID} | worldJournal: updateThreatSeverity — "${severity}" is no severity (${THREAT_SEVERITIES.join(", ")}); "${existing.name}" is unchanged.`);
    return null;
  }
  const development = typeof note === "string" && note.trim() ? note.trim() : "";
  const summary     = development || existing.summary || "";

  const sessionId = campaignState?.currentSessionId ?? "";
  const history   = threatHistoryOf(existing);
  history.push({ sessionId, severity: next, summary });

  const updated = {
    ...existing,
    severity:    next,
    summary,
    lastUpdated: sessionId,
    history:     cappedThreatHistory(history),
    updatedAt:   new Date().toISOString(),
    ...narrationStamp(narrationId, existing),
  };
  await writeEntryPage(page, FLAG_KEYS.threats, updated);
  return updated;
}

/**
 * Promote a narrator-asserted lore entry to confirmed (canonical). Stamps
 * promotedAt. Does NOT change narratorAsserted — the entry retains its
 * provenance. A narration's capture (a "lore confirmed" transition) passes
 * its `narrationId`, stamped as updateThreatSeverity's
 * (XCARD-CAPTURE-TRANSITIONS); a GM's confirm owns the entry. The capture
 * also passes `byNarrator`: a narrator's confirm leaves a GM-ruled entry as
 * ruled (isGmRuledLore, issue #330 D9) — only a GM's confirm promotes it.
 *
 * @param {string} title
 * @param {Object} [_campaignState]
 * @param {{ narrationId?: string|null, byNarrator?: boolean }} [options]
 */
export async function promoteLoreToConfirmed(title, _campaignState, { narrationId = null, byNarrator = false } = {}) {
  const journal = await getOrCreateJournal(JOURNAL_NAMES.lore);
  if (!journal) return null;

  const page = findPageByName(journal, title?.trim() ?? "");
  if (!page) {
    console.warn(`${MODULE_ID} | worldJournal: promoteLoreToConfirmed — no lore titled "${title}"`);
    return null;
  }

  const existing = page.flags?.[MODULE_ID]?.[FLAG_KEYS.lore];
  if (!existing) return null;
  // A struck fact's entry (retractSessionLore) stays out of canon: the
  // detection pass "confirming" it is the narrator re-asserting it. A GM
  // restores one with `!journal lore "<title>" confirmed`.
  if (existing.retracted) {
    console.debug(`${MODULE_ID} | worldJournal: lore "${title}" was retracted by the table — not re-confirmed.`);
    return null;
  }
  // The capture's "lore confirmed" is the narrator re-asserting it: a GM's
  // ruling stands until a GM changes it (issue #330 D9).
  if (byNarrator && isGmRuledLore(existing)) {
    console.debug(`${MODULE_ID} | worldJournal: lore "${title}" is the GM's ruling — the narration does not confirm it.`);
    return null;
  }

  const updated = {
    ...existing,
    confirmed:  true,
    promotedAt: new Date().toISOString(),
    updatedAt:  new Date().toISOString(),
    ...narrationStamp(narrationId, existing),
  };
  await writeEntryPage(page, FLAG_KEYS.lore, updated);
  return updated;
}

/**
 * Take this session's lore entries that state a struck fact out of confirmed
 * canon (issue #286 B6: the detection pass auto-confirms lore from the same
 * prose a struck truth came from, and a Strike never reached it). The entry
 * is kept, marked `retracted` and unconfirmed, so the narrator's ESTABLISHED
 * LORE and the pending queue both drop it and the history stays readable.
 *
 * @param {string}   sessionId
 * @param {Function} matches — (loreEntry) => boolean
 * @returns {Promise<number>} entries retracted
 */
export async function retractSessionLore(sessionId, matches, { truthId = null } = {}) {
  if (!sessionId || typeof matches !== "function") return 0;
  const journal = findJournal(JOURNAL_NAMES.lore);
  let count = 0;
  for (const page of journal?.pages?.contents ?? []) {
    const entry = page?.flags?.[MODULE_ID]?.[FLAG_KEYS.lore];
    if (!entry || entry.retracted || entry.sessionId !== sessionId) continue;
    if (!matches(entry)) continue;
    const now = new Date().toISOString();
    await writeEntryPage(page, FLAG_KEYS.lore, {
      ...entry,
      confirmed:   false,
      retracted:   true,
      retractedAt: now,
      updatedAt:   now,
      // The strike that retracted it, and whether it stood confirmed: a
      // `!truth set` that lifts that strike restores it (restoreStruckLore,
      // issue #331 X31). Always written — Foundry merges flags key by key.
      retractedByTruth:   typeof truthId === "string" && truthId ? truthId : null,
      confirmedBeforeStrike: entry.confirmed === true,
    });
    count += 1;
  }
  return count;
}

/**
 * Restore the lore entries a strike retracted — retractSessionLore's inverse,
 * for a strike the GM lifted by setting the fact again (`!truth set`, issue
 * #326 W60). W60 lifted the strike in the ledger only: the archived truth and
 * its lore copies stayed retracted, so when the re-set truth was archived at
 * scene end onto the same page it kept `retracted: true` — the fact the GM
 * ruled canon reached no store the narrator reads (issue #331 X31). Only the
 * entries that strike retracted are restored (`retractedByTruth`), each with
 * the confirmation it had — never a page an X-Card retracted.
 *
 * An entry another standing retraction still states is not restored (issue
 * #336 Y32 — a second strike passed over the entry the first had retracted,
 * so the lift put it back in ESTABLISHED LORE beside that strike under
 * CORRECTED): `heldBy(entry)` (retractions.js `loreRetractionHolder`) names
 * what holds it — another strike's truth id, to which the entry is handed so
 * lifting that one restores it, or `true` (one never lifted here).
 *
 * @param {string} truthId — the lifted strike's truth id
 * @param {{ heldBy?: (entry: Object) => (string|true|null) }} [opts]
 * @returns {Promise<number>} entries restored
 */
export async function restoreStruckLore(truthId, { heldBy = null } = {}) {
  if (typeof truthId !== "string" || !truthId) return 0;
  const journal = findJournal(JOURNAL_NAMES.lore);
  let count = 0;
  for (const page of journal?.pages?.contents ?? []) {
    const entry = page?.flags?.[MODULE_ID]?.[FLAG_KEYS.lore];
    if (!entry?.retracted || entry.retractedByTruth !== truthId) continue;
    const holder = typeof heldBy === "function" ? heldBy(entry) : null;
    if (holder) {
      if (typeof holder === "string" && holder !== truthId) {
        await writeEntryPage(page, FLAG_KEYS.lore, { ...entry, retractedByTruth: holder, updatedAt: new Date().toISOString() });
      }
      continue;
    }
    await writeEntryPage(page, FLAG_KEYS.lore, {
      ...entry,
      confirmed:          entry.confirmedBeforeStrike === true,
      retracted:          false,
      retractedAt:        null,
      retractedByTruth:   null,
      confirmedBeforeStrike: null,
      updatedAt:          new Date().toISOString(),
    });
    count += 1;
  }
  return count;
}

/**
 * Apply a state transition produced by the combined detection pass.
 *
 *   - threat resolved/escalated → updateThreatSeverity
 *   - faction attitudeShift     → recordFactionIntelligence with the new attitude
 *   - lore contradicted         → no state change; posts GM-only chat card
 *
 * A narration's capture passes its `narrationId`: the entry the transition
 * changes is stamped with it, so an X-Card on that narration undoes the
 * change (undoNarrationEntries — XCARD-CAPTURE-TRANSITIONS).
 *
 * @param {Object} transition
 * @param {Object} campaignState
 * @param {{ narrationId?: string|null }} [options]
 */
export async function applyStateTransition(transition, campaignState, { narrationId = null } = {}) {
  if (!transition?.entryType) return null;
  const fromNarration = typeof narrationId === "string" && narrationId ? { narrationId } : {};

  switch (transition.entryType) {
    case "threat": {
      // The detector's transitions: the threat is found by a variant of its
      // name, and what it is now doing is a note — `summary`, or a `newValue`
      // that is a sentence rather than a severity — never the severity
      // (issue #354 P2-15).
      const note = [transition.summary, strayThreatNote(transition.newValue)]
        .find(v => typeof v === "string" && v.trim()) ?? null;
      const opts = { ...fromNarration, note, fromDetection: true };
      if (transition.change === "resolved") {
        return updateThreatSeverity(transition.name, "resolved", campaignState, opts);
      }
      if (transition.change === "escalated") {
        return updateThreatSeverity(transition.name, transition.newValue, campaignState, { ...opts, escalate: true });
      }
      return null;
    }

    case "faction": {
      if (transition.change !== "attitudeShift") return null;
      return recordFactionIntelligence(
        transition.name,
        { attitude: transition.newValue, summary: transition.summary ?? "", ...fromNarration },
        campaignState,
      );
    }

    case "lore": {
      if (transition.change === "contradicted") {
        await postContradictionNotification(transition);
        return null;
      }
      return null;
    }

    case "factContinuity": {
      // fact-continuity scope §11.2 — high-confidence consistency-check
      // contradictions land on the same GM-only Narrative Review surface.
      if (transition.change === "contradicted") {
        await postContradictionNotification(transition);
        return null;
      }
      return null;
    }

    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SESSION LOG — one page per session (D7 / F18; the session record, issue #382)
//
// One page a session, matched on its sessionId flag. Since issue #382 the page
// holds the session's record (its `sessionRecord` flag — src/record/store.js)
// and its body is that record's rendered view (src/record/sessionLogView.js):
// what happened, what was established and stands, what the table corrected.
// The `sessionLogPage` flag says which session the page is; its story is the
// session summary, a view of the record too (record/summaryView.js — issue
// #382 slice 3). The story End a Session wrote onto a page before that
// (`summary.narrative`) is read as that session's story until its summary is
// made, and a page from before the record keeps what it has — its old "Scene
// log" of the detector's lines among it — and is never rendered again.
// ─────────────────────────────────────────────────────────────────────────────

/** The Session Log journal, or null when it has not been made (or is not readable on this client). */
export function sessionLogJournal() {
  return findJournal(JOURNAL_NAMES.sessionLog);
}

function findSessionLogPage(journal, sessionId) {
  return (journal?.pages?.contents ?? []).find(
    p => p?.flags?.[MODULE_ID]?.[FLAG_KEYS.sessionLogPage]?.sessionId === sessionId,
  ) ?? null;
}

// A session's page being made, by session id: two makers in one tick — the
// record's first write and the world load's copy of a story — share the one creation
// (rules/reachability.md §7: get-or-create keyed on a stable id).
const _sessionLogPageCreates = new Map();

/**
 * Find or create a session's page of the Session Log journal — the page its
 * record is stored on (src/record/store.js). A journal write: a GM's.
 *
 * @param {{ currentSessionId?: string|null, sessionNumber?: number|null }} campaignState — the session, and its number for a new page's name
 * @returns {Promise<{page:Object, flag:Object}|null>}
 */
export async function getOrCreateSessionLogPage(campaignState) {
  const journal = await getOrCreateJournal(JOURNAL_NAMES.sessionLog);
  if (!journal) return null;

  const sessionId = campaignState?.currentSessionId ?? "";
  const found = () => {
    const existing = findSessionLogPage(journal, sessionId);
    return existing ? { page: existing, flag: { ...existing.flags[MODULE_ID][FLAG_KEYS.sessionLogPage] } } : null;
  };
  const existing = found();
  if (existing) return existing;
  if (_sessionLogPageCreates.has(sessionId)) {
    await _sessionLogPageCreates.get(sessionId);
    return found();
  }

  const sessionNum = campaignState?.sessionNumber ?? null;
  const now        = new Date().toISOString();
  const pageName   = sessionNum ? `Session ${sessionNum} — ${now.slice(0, 10)}` : `Session — ${now}`;
  const flag = {
    sessionId, sessionNumber: sessionNum, pageName,
    createdAt: now, updatedAt: now, summary: null,
  };

  const creating = (async () => {
    try {
      const created = await journal.createEmbeddedDocuments("JournalEntryPage", [{
        name:  pageName,
        type:  "text",
        // The title alone: the body is the record's view, rendered once there is something to show.
        text:  { format: 1, content: `<h2>${escapeHtml(pageName)}</h2>` },
        flags: { [MODULE_ID]: { [FLAG_KEYS.sessionLogPage]: flag } },
      }]);
      const page = Array.isArray(created) ? created[0] : created;
      return page ? { page, flag } : null;
    } catch (err) {
      console.error(`${MODULE_ID} | worldJournal: getOrCreateSessionLogPage failed:`, err);
      return null;
    }
  })();
  _sessionLogPageCreates.set(sessionId, creating.then(() => {}));
  try {
    return await creating;
  } finally {
    _sessionLogPageCreates.delete(sessionId);
  }
}

/**
 * What a world wrote of its last sessions before the session summary was a
 * view of the record (issue #382 section 9) — LAST SESSION
 * (`campaignState.previousSessionSummary`) and the summary of the session
 * under way (`campaignState.sessionSummary`) — copied once onto those
 * sessions' Session Log pages as their story (`sessionLogPage.summary
 * .narrative`), where the record reads a session's story until its summary is
 * made (record/summaryView.js sessionStoryOf; a session the record opened in
 * the middle of is given it as EARLIER THIS SESSION). Additive and
 * idempotent: a page whose story is written is left as it is, and a session
 * with no page — one that ended by idleness, which End never wrote — gets one
 * (by its id). Nothing in campaignState is changed or removed, and nothing
 * else writes either field. The canonical GM's, at world load. Never throws.
 *
 * @param {Object|null} campaignState
 * @returns {Promise<number>} how many stories were copied
 */
export async function keepPreRecordSummaries(campaignState) {
  if (!isCanonicalGM() || !campaignState || typeof campaignState !== "object") return 0;
  const told = (r) => (typeof r?.sessionId === "string" && r.sessionId && typeof r.text === "string" && r.text.trim() ? r : null);
  const copies = [];
  const last = told(campaignState.previousSessionSummary);
  if (last && last.sessionId !== campaignState.currentSessionId) {
    copies.push({ sessionId: last.sessionId, sessionNumber: last.sessionNumber ?? null, text: last.text.trim() });
  }
  const live = told(campaignState.sessionSummary);
  if (live && live.sessionId === campaignState.currentSessionId) {
    copies.push({ sessionId: live.sessionId, sessionNumber: campaignState.sessionNumber ?? null, text: live.text.trim() });
  }
  let kept = 0;
  for (const copy of copies) {
    try {
      const ctx = await getOrCreateSessionLogPage({ currentSessionId: copy.sessionId, sessionNumber: copy.sessionNumber });
      if (!ctx) continue;
      const story = ctx.flag.summary?.narrative;
      if (typeof story === "string" && story.trim()) continue;
      const now = new Date().toISOString();
      await ctx.page.setFlag(MODULE_ID, FLAG_KEYS.sessionLogPage, {
        ...ctx.flag, updatedAt: now, summary: { ...(ctx.flag.summary ?? {}), narrative: copy.text, writtenAt: now, beforeRecord: true },
      });
      kept += 1;
    } catch (err) {
      console.warn(`${MODULE_ID} | worldJournal: a session's story from before the record could not be kept:`, err?.message ?? err);
    }
  }
  return kept;
}

/**
 * Undo what X-carded narrations' captures wrote to the World Journal (issue
 * #329 X01; rules/narrator-memory.md 6b — the X-Card's U07 full exclusion).
 * For every Lore, Threats, Factions and Locations entry stamped with one of
 * `narrationIds`:
 *   - one the narrations rewrote is put back as it was before them (the
 *     newest `previous` no removed narration wrote);
 *   - one they made is taken out of play: a lore entry is retracted (kept,
 *     unconfirmed — the narrator's ESTABLISHED LORE and the pending queue
 *     leave it out, and the capture cannot re-confirm the same title, as for
 *     a struck fact), any other entry's page is deleted (threats, factions
 *     and places have no retracted state their readers honour).
 * That covers the transitions a capture applies to an entry it did not make
 * — a threat resolved or escalated, lore confirmed, a faction's attitude
 * (XCARD-CAPTURE-TRANSITIONS) — and a faction's stance on its record, the
 * canonical home, is put back too where the record still holds what the
 * narration set (revertFactionStances).
 * A hidden plan's escalation step one of them played goes back unplayed by
 * its own mark (`playedBy`, skeletons.js playedMark) in every
 * version of the plan that stays — also under a version they did not write
 * (issue #364 PLAN-STEP-REWRITTEN-BEFORE-BURN: a plan was put back only while
 * its newest version was a removed narration's, so a clue another narration
 * showed in between, or a GM's edit, left the removed narration's step
 * played with its vignette gone and its clock re-armed). What the later
 * writer wrote stands; the plans in play touched that way are named with
 * the clock each links (`stepsTakenBack`), for the caller's clocks.
 * A clue one of them showed, and a truth one of them revealed (with the
 * oracle rolls it showed), go back the same way by their own marks
 * (`revealedBy`, `truthRevealedBy`, `rollsShownBy` — issue #364
 * PLAN-CLUE-TRUTH-NO-MARK: only steps carried a mark, so under a later
 * writer's version the clue stayed shown and the truth revealed). What a
 * truth's reveal wrote outside the plan — its scene fact, its Lore entry —
 * is stamped with the narration and goes by that stamp, as it always did;
 * with the Lore category left out (a supersede), the reveal's Lore entry is
 * the caller's to take back (undoRevealedTruthLore).
 * A plan they made is kept instead of deleted when the caller says what it is
 * about outlives them (`keepPlanAbout` — a supersede deletes no NPC card,
 * issue #364 BURN-OF-MAKE-A-CONNECTION-DROPS-AGENDA) and they filed it with
 * its rolls alone: as they filed it, what they did to it since taken back by
 * the marks above (planKeptAsFiled).
 * With `withholdTruths` (the X-Card's undo), a truth one of them revealed
 * that goes back to hidden — the same truth, by its mark or with their
 * version — is withheld from the narrator from then on (`truthWithheldBy`,
 * the revealing narration; issue #364 XCARD-REVEAL-REREVEAL-NO-LORE, the
 * maintainer's ruling: the X-Card's exclusion holds — the next narration
 * revealed it again, the plan read revealed while its Lore entry stayed
 * retracted). A supersede withholds nothing: its re-narration may reveal the
 * truth again. It names the reveal it took back instead (`truthTakenBackBy`,
 * on the version it writes), and the X-Card that later removes that
 * narration with the beat it upgraded (issue #347 D2) — finding the truth
 * already hidden — withholds it by that mark, as a reveal it took back
 * itself (issue #364 XCARD-ON-UPGRADE-AFTER-SUPERSEDED-REVEAL). Every undo
 * keeps a withholding, or a supersede's mark, the plan already carries on
 * the version it puts back, while that version holds the same truth.
 * The Session Log is not among them: its page is a view of the session
 * record, which the X-Card reaches as `narration.removed` (issue #382). Runs
 * on the canonical GM after the pause is written (suppressScene's finish).
 * Fail-open per entry; never throws.
 *
 * @param {string[]} narrationIds
 * @param {{ categories?: string[]|null, keepPlanAbout?: ((subject: Object) => boolean)|null,
 *   withholdTruths?: boolean }} [opts] — `categories`:
 *   the categories to undo (default every one); `keepPlanAbout`: whether a plan the
 *   narrations made about this subject (the stored plan's `subject`) stays in the Secrets journal — not
 *   given, every plan they made is deleted (the X-Card); `withholdTruths`: the X-Card's — a truth they
 *   revealed is withheld as it goes back to hidden
 * @returns {Promise<{ restored: number, retracted: number, deleted: number,
 *   stepsTakenBack: Array<{ id: string, clockId: string|null }>, truthsWithheld: Array<{ id: string, name: string }> }>}
 *   `stepsTakenBack`: the active plans a step was un-played in under a version the narrations did not write;
 *   `truthsWithheld`: the plans whose truth this undo withheld, by id and page name (for the GMs' notice)
 */
export async function undoNarrationEntries(narrationIds, { categories = null, keepPlanAbout = null, withholdTruths = false } = {}) {
  const out = { restored: 0, retracted: 0, deleted: 0, stepsTakenBack: [], truthsWithheld: [] };
  const removed = new Set((narrationIds ?? []).filter(id => typeof id === "string" && id));
  if (!removed.size) return out;
  const fromRemoved = (entry) => typeof entry?.narrationId === "string" && removed.has(entry.narrationId);
  const ALL = ["lore", "threats", "factions", "locations", "secrets"];
  const only = Array.isArray(categories) ? ALL.filter(c => categories.includes(c)) : ALL;

  // Secrets too (issue #353): a plan a removed narration made is deleted, and
  // one it decided or revealed goes back to the version before. `categories`
  // narrows the undo: a narration a Burn Momentum or Improve Result
  // superseded takes back its plans alone (resultUpgrade.js
  // retractSupersededNarrations).
  for (const category of only) {
    const journal = findJournal(JOURNAL_NAMES[category]);
    const flagKey = FLAG_KEYS[category];
    for (const page of [...(journal?.pages?.contents ?? [])]) {
      const entry = page?.flags?.[MODULE_ID]?.[flagKey];
      if (!fromRemoved(entry)) {
        // A plan another narration, or a GM, wrote since: its versions stay,
        // less the steps the removed narrations played.
        if (category === "secrets" && entry) {
          try {
            const unplayed = withoutStepsPlayedBy(entry, removed, keepPlanAbout);
            const base = unplayed?.entry ?? entry;
            // The reveal this undo takes back, by its mark; for the X-Card, a
            // reveal of a narration it removes that a supersede took back
            // first counts too (issue #364 XCARD-ON-UPGRADE-AFTER-SUPERSEDED-REVEAL).
            const revealer = unplayed ? revealTakenBack([entry], base, removed) : null;
            const withheld = withholdTruths ? (revealer ?? supersededRevealOf(base, removed)) : null;
            if (unplayed || withheld) {
              const written = { ...base, ...truthMarks({ withheld, takenBack: revealer }) };
              await writeEntryPage(page, flagKey, written);
              if (withheld) out.truthsWithheld.push({ id: written.id, name: String(page?.name ?? "") });
              if (unplayed?.stepTop) noteStepTakenBack(out, unplayed.entry);
            }
          } catch (err) {
            console.warn(`${MODULE_ID} | X-Card: could not take a removed narration's step back from the plan "${page?.name}":`, err?.message ?? err);
          }
        }
        continue;
      }
      try {
        const versions = Array.isArray(entry.previous) ? entry.previous : [];
        const at = versions.findIndex(v => v && !fromRemoved(v));
        if (category === "factions") {
          // The removed narrations' versions, newest first: each one's stance change on the record.
          await revertFactionStances([entry, ...(at >= 0 ? versions.slice(0, at) : versions)].filter(fromRemoved));
        }
        if (at >= 0) {
          const older = versions.slice(at + 1);
          const restored = {
            ...versions[at],
            narrationId: versions[at].narrationId ?? null,
            previous:    older.length ? older : null,
            // setFlag merges: a key the restored version lacks keeps the removed one's value
            ...(category === "factions" ? { recordStance: versions[at].recordStance ?? null } : {}),
            ...(category === "lore" ? { revealOf: versions[at].revealOf ?? null } : {}),
            ...(category === "secrets" ? { truthRevealedBy: versions[at].truthRevealedBy ?? null, rollsShownBy: versions[at].rollsShownBy ?? null,
              resolvedBy: versions[at].resolvedBy ?? null, truthWithheldBy: versions[at].truthWithheldBy ?? null,
              truthTakenBackBy: versions[at].truthTakenBackBy ?? null, subjectLinkedBy: versions[at].subjectLinkedBy ?? null } : {}),
          };
          // The version put back may be one written between two removed
          // narrations: it holds the earlier one's step.
          const unplayed = category === "secrets" ? withoutStepsPlayedBy(restored, removed, keepPlanAbout) : null;
          let put = unplayed?.entry ?? restored;
          // A link their capture made to the card or page made for the
          // plan's name stays while the caller keeps what it is about (issue
          // #364 SUPERSEDE-UNLINKS-EARLIER-PLAN).
          if (category === "secrets") put = linkKept([entry, ...versions.slice(0, at)], put, removed, keepPlanAbout) ?? put;
          // The X-Card withholds a truth their versions revealed; any undo
          // keeps the withholding the plan carries (issue #364
          // XCARD-REVEAL-REREVEAL-NO-LORE). A supersede names the reveal it
          // took back instead, which the X-Card that removes that narration
          // withholds by (issue #364 XCARD-ON-UPGRADE-AFTER-SUPERSEDED-REVEAL).
          const revealer = category === "secrets" ? revealTakenBack([entry, ...versions.slice(0, at)], put, removed) : null;
          const withheld = category === "secrets" && withholdTruths ? (revealer ?? supersededRevealOf(put, removed)) : null;
          if (category === "secrets") {
            put = { ...put, truthWithheldBy: withheld ?? withholdingKept(entry, put) ?? put.truthWithheldBy ?? null,
              truthTakenBackBy: withheld ? null
                : (revealer ?? withholdingKept(entry, put, "truthTakenBackBy") ?? put.truthTakenBackBy ?? null) };
          }
          await writeEntryPage(page, flagKey, put);
          if (withheld) out.truthsWithheld.push({ id: put.id, name: String(page?.name ?? "") });
          if (unplayed?.stepTop) noteStepTakenBack(out, unplayed.entry);
          out.restored += 1;
        } else if (category === "lore") {
          const now = new Date().toISOString();
          // The X-Card's retraction, not a strike's: a lifted strike never
          // restores it (restoreStruckLore — issue #331 X31).
          await writeEntryPage(page, flagKey, {
            ...entry, confirmed: false, retracted: true, retractedAt: now, updatedAt: now, retractedByTruth: null,
          });
          out.retracted += 1;
        } else {
          // A plan they filed about something that outlives them stays with
          // it (issue #364 BURN-OF-MAKE-A-CONNECTION-DROPS-AGENDA): the
          // agenda of an NPC a superseded Make a Connection created was
          // deleted while her card stayed, and nothing filed it again.
          const kept = category === "secrets" ? planKeptAsFiled(entry, removed, keepPlanAbout) : null;
          if (kept) {
            if (kept.changed) await writeEntryPage(page, flagKey, kept.entry);
            if (kept.stepTop) noteStepTakenBack(out, kept.entry);
            continue;
          }
          await page.delete();
          out.deleted += 1;
        }
      } catch (err) {
        console.warn(`${MODULE_ID} | X-Card: could not undo the World Journal entry "${page?.name}":`, err?.message ?? err);
      }
    }
  }

  // The rolls card a taken-back reveal posted goes with the reveal (issue
  // #364 TAKEN-BACK-PLAN-ROLLS-CARD-STAYS).
  if (only.includes("secrets")) await withdrawRollsCardsOfReveals(removed);

  return out;
}

/** A plan version's truth, trimmed ('' for none). */
const truthTextOf = (version) => (typeof version?.truth === "string" ? version.truth.trim() : "");

/**
 * The narration whose reveal of a plan's truth an undo takes back (issue #364
 * XCARD-REVEAL-REREVEAL-NO-LORE): a removed narration that revealed, in one
 * of the versions the undo takes back or rewrites, the very truth the version
 * it writes holds hidden — by the reveal's mark (`truthRevealedBy`), or, a
 * reveal from before the mark was kept, the removed narration's own version.
 * Null when the version written is revealed, holds no truth or another one
 * (a truth the narrations decided goes with them: there is none to withhold).
 *
 * @param {Object[]} from — the versions taken back or rewritten, newest first
 * @param {Object} put — the version written
 * @param {Set<string>} removed — the narrations taken back
 * @returns {string|null}
 */
function revealTakenBack(from, put, removed) {
  const truth = truthTextOf(put);
  if (!truth || put?.truthRevealed === true) return null;
  for (const version of from) {
    if (version?.truthRevealed !== true || truthTextOf(version) !== truth) continue;
    const mark = typeof version.truthRevealedBy === "string" && version.truthRevealedBy ? version.truthRevealedBy : null;
    if (mark && removed.has(mark)) return mark;
    if (!mark && typeof version.narrationId === "string" && removed.has(version.narrationId)) return version.narrationId;
  }
  return null;
}

/**
 * The reveal a Burn / Improve supersede took back from a plan
 * (`truthTakenBackBy`), when the undo removes that narration — the X-Card on
 * the beat its upgrade wrote, which takes the struck narration with it (issue
 * #347 D2): the truth it would have taken back is already hidden, and is
 * withheld by that mark (issue #364 XCARD-ON-UPGRADE-AFTER-SUPERSEDED-REVEAL).
 * Only while the version holds the truth, hidden and not yet withheld. Null
 * otherwise.
 *
 * @param {Object} version — the version written
 * @param {Set<string>} removed — the narrations taken back
 * @returns {string|null}
 */
function supersededRevealOf(version, removed) {
  const mark = typeof version?.truthTakenBackBy === "string" && version.truthTakenBackBy ? version.truthTakenBackBy : null;
  if (!mark || !removed.has(mark) || version.truthRevealed === true || !truthTextOf(version) || version.truthWithheldBy) return null;
  return mark;
}

/**
 * The truth's marks on a plan version an undo rewrites without restoring one
 * (issue #364 XCARD-ON-UPGRADE-AFTER-SUPERSEDED-REVEAL): withheld by the
 * X-Card, the supersede's mark it withheld by spent; or — a supersede's undo,
 * which withholds nothing — the reveal it took back named, for an X-Card
 * that removes that narration later. None when it took back no reveal.
 *
 * @param {{ withheld?: string|null, takenBack?: string|null }} marks
 * @returns {Object}
 */
function truthMarks({ withheld = null, takenBack = null } = {}) {
  if (withheld) return { truthWithheldBy: withheld, truthTakenBackBy: null };
  if (takenBack) return { truthTakenBackBy: takenBack };
  return {};
}

/**
 * The X-Card's withholding a plan carries (`truthWithheldBy`) — or a
 * supersede's mark of the reveal it took back (`truthTakenBackBy`, issue #364
 * XCARD-ON-UPGRADE-AFTER-SUPERSEDED-REVEAL) — kept on the version an undo
 * puts back while that version holds the same truth, hidden: a version from
 * before the mark lacks it (issue #364 XCARD-REVEAL-REREVEAL-NO-LORE). Null
 * otherwise.
 *
 * @param {Object} current — the stored entry
 * @param {Object} put — the version written
 * @param {string} [field] — the mark
 * @returns {string|null}
 */
function withholdingKept(current, put, field = "truthWithheldBy") {
  const mark = typeof current?.[field] === "string" && current[field] ? current[field] : null;
  if (!mark || put?.truthRevealed === true || !truthTextOf(put) || truthTextOf(put) !== truthTextOf(current)) return null;
  return mark;
}

/**
 * Whether the caller of an undo keeps what a plan's subject names
 * (`keepPlanAbout` — a supersede's, while the card or Threats page stands);
 * false with none given (the X-Card), or when it cannot say.
 *
 * @param {Object} subject
 * @param {((subject: Object) => boolean)|null} keepPlanAbout
 * @returns {boolean}
 */
function subjectStays(subject, keepPlanAbout) {
  if (typeof keepPlanAbout !== "function" || !subject || typeof subject !== "object") return false;
  try {
    return keepPlanAbout(subject) === true;
  } catch (err) {
    console.warn(`${MODULE_ID} | World Journal: whether a plan's subject still stands could not be read:`, err?.message ?? err);
    return false;
  }
}

/**
 * The version an undo puts back, linked as a removed narration's capture
 * linked it (issue #364 SUPERSEDE-UNLINKS-EARLIER-PLAN): a plan filed about a
 * name that the capture of a later narration linked to the card or Threats
 * page it made for that name (secrets.js planNpcAgenda, planSignificantThreat
 * — a new version, stamped with that narration, marked `subjectLinkedBy`)
 * went back to its by-name version when a Burn Momentum / Improve Result
 * superseded the narration, while the card or page stayed; the link was never
 * made again, so the Entities panel's plan marker and a delete's retiring of
 * the card's plans no longer reached it. Kept — the card or page as subject,
 * the name the version put back holds, the link's mark — when the version put
 * back is about a name and the caller keeps what the link names (the
 * supersede's `keepPlanAbout`, the reading that keeps a plan filed about a
 * card). Null otherwise: the X-Card keeps none.
 *
 * @param {Object[]} from — the removed narrations' versions, newest first
 * @param {Object} put — the version put back
 * @param {Set<string>} removed
 * @param {((subject: Object) => boolean)|null} keepPlanAbout
 * @returns {Object|null}
 */
function linkKept(from, put, removed, keepPlanAbout) {
  if (put?.subject?.type !== "name") return null;
  const link = from.find(v => typeof v?.subjectLinkedBy === "string" && removed.has(v.subjectLinkedBy)
    && v.subject && v.subject.type !== "name" && typeof v.subject.id === "string" && v.subject.id);
  if (!link || !subjectStays(link.subject, keepPlanAbout)) return null;
  return { ...put, subject: { type: link.subject.type, id: link.subject.id, name: put.subject.name ?? link.subject.name },
    subjectLinkedBy: link.subjectLinkedBy };
}

/**
 * The version of a plan the removed narrations made that stays when what the
 * plan is about outlives them (issue #364
 * BURN-OF-MAKE-A-CONNECTION-DROPS-AGENDA): the one it was filed as — the
 * oldest it keeps, every version being theirs — while that version is its
 * rolls alone, nothing decided (as undoPlansFiledFor reads "still waiting").
 * Such a plan is about its subject, not about what the narrations told: an
 * NPC's agenda is filed where her card is made, after the narration's own
 * side-data, for a later narration to decide. Null — the plan goes with the
 * narrations — when the caller keeps no plan about its subject
 * (`keepPlanAbout` not given, or false for it), and when the narrations
 * decided it as they filed it: that truth is their telling.
 *
 * @param {Object} entry — a stored Secrets entry no version of which another writer wrote
 * @param {((subject: Object) => boolean)|null} keepPlanAbout — the caller's (undoNarrationEntries)
 * @returns {Object|null}
 */
function planVersionFiled(entry, keepPlanAbout) {
  if (typeof keepPlanAbout !== "function" || !entry?.subject || typeof entry.subject !== "object") return null;
  let stays = false;
  try {
    stays = keepPlanAbout(entry.subject) === true;
  } catch (err) {
    console.warn(`${MODULE_ID} | World Journal: whether the subject of the plan "${entry?.id}" still stands could not be read:`, err?.message ?? err);
  }
  if (!stays) return null;
  const versions = (Array.isArray(entry.previous) ? entry.previous : []).filter(v => v && typeof v === "object");
  const filed = versions.length ? versions[versions.length - 1] : entry;
  const decided = typeof filed.truth === "string" && filed.truth.trim().length > 0;
  return decided ? null : filed;
}

/**
 * A plan the removed narrations made, as it stays when what it is about
 * outlives them (planVersionFiled): as filed, less what they did to it since
 * — a later version of theirs dropped, and in the filed one a clue shown, a
 * step played, the truth revealed, the story ended taken back by their marks
 * (takenBackFrom). It keeps the stamp of the narration that filed it: an
 * X-Card that removes that narration, and the card it made, still takes the
 * plan. Null when the plan is not kept.
 *
 * @param {Object} entry — the stored Secrets entry
 * @param {Set<string>} removed — the narrations taken back
 * @param {((subject: Object) => boolean)|null} keepPlanAbout
 * @returns {{ entry: Object, changed: boolean, stepTop: boolean }|null} the entry to keep, whether it
 *   differs from the stored one (a write is owed), and whether a step of its own was un-played
 */
function planKeptAsFiled(entry, removed, keepPlanAbout) {
  const filed = planVersionFiled(entry, keepPlanAbout);
  if (!filed) return null;
  const undone = takenBackFrom(filed, removed, keepPlanAbout);
  if (filed === entry && !undone) return { entry, changed: false, stepTop: false };
  const version = undone?.version ?? filed;
  return {
    // setFlag merges: every key the kept version may lack is written.
    entry: { ...version, narrationId: filed.narrationId ?? null, previous: null,
      truthRevealedBy: version.truthRevealedBy ?? null, rollsShownBy: version.rollsShownBy ?? null, resolvedBy: version.resolvedBy ?? null,
      truthWithheldBy: version.truthWithheldBy ?? null, truthTakenBackBy: version.truthTakenBackBy ?? null,
      subjectLinkedBy: version.subjectLinkedBy ?? null },
    changed: true, stepTop: undone?.step === true,
  };
}

/**
 * A stored plan entry with what the removed narrations played or showed of it
 * put back — its escalation steps unplayed, its clues unshown, its truth
 * unrevealed (takenBackFrom) — in the entry and in each earlier version it
 * keeps (`previous`): a later undo may restore one of those. Null when none
 * holds anything of theirs.
 *
 * @param {Object} entry — the stored Secrets entry
 * @param {Set<string>} removed — the narrations taken back
 * @param {((subject: Object) => boolean)|null} [keepPlanAbout] — the undo's (takenBackFrom: a link kept)
 * @returns {{ entry: Object, top: boolean, stepTop: boolean }|null} the entry to write, whether its own
 *   content changed, and whether a step of its own was un-played (the caller's clocks: a step is owed again)
 */
function withoutStepsPlayedBy(entry, removed, keepPlanAbout = null) {
  const top = takenBackFrom(entry, removed, keepPlanAbout);
  const versions = Array.isArray(entry?.previous) ? entry.previous : null;
  const older = versions ? versions.map(v => takenBackFrom(v, removed, keepPlanAbout)?.version ?? v) : null;
  const olderChanged = !!older && older.some((v, i) => v !== versions[i]);
  if (!top && !olderChanged) return null;
  return { entry: { ...(top?.version ?? entry), ...(olderChanged ? { previous: older } : {}) }, top: !!top, stepTop: top?.step === true };
}

/**
 * One version of a plan with what the removed narrations did to it taken
 * back by its marks, the rest of the version as it is:
 *   - the steps they played (`playedBy`) unplayed and unmarked;
 *   - the clues they showed (`revealedBy`) unshown and unmarked;
 *   - the truth one of them revealed (`truthRevealedBy`) unrevealed, and the
 *     oracle rolls that reveal showed (`rollsShownBy`) unshown — as putting
 *     back the version before that narration leaves them, so the next reveal
 *     shows the rolls again (issue #364 PLAN-CLUE-TRUTH-NO-MARK);
 *   - the ending one of them gave the plan's story (`resolvedBy`) undone:
 *     the plan is in play again (issue #364 PLAN-RESOLVED-NO-MARK — under a
 *     GM's edit of the ended plan it stayed resolved, where with the
 *     narration's own version on top it came back);
 *   - the link one of them made from the plan's name to a card or Threats
 *     page (`subjectLinkedBy`) undone — the plan about the name again — unless
 *     the caller keeps what it links to (`keepPlanAbout`: a supersede, while
 *     the card or page stands; issue #364 SUPERSEDE-UNLINKS-EARLIER-PLAN — the
 *     X-Card on the upgraded beat deletes the card, and the earlier plan goes
 *     back to its name, as without the burn, instead of being retired with it).
 * A record-level mark is cleared with an explicit null: the page flag is
 * merged on write. Null when the version holds nothing of theirs.
 *
 * @param {Object} version — a stored Secrets entry, or one of its `previous`
 * @param {Set<string>} removed — the narrations taken back
 * @param {((subject: Object) => boolean)|null} [keepPlanAbout] — the undo's
 * @returns {{ version: Object, step: boolean }|null} the version, and whether a step was un-played
 */
function takenBackFrom(version, removed, keepPlanAbout = null) {
  const by = (id) => typeof id === "string" && removed.has(id);
  const steps = Array.isArray(version?.escalation) ? version.escalation : [];
  const clues = Array.isArray(version?.clues) ? version.clues : [];
  const theirStep = (e) => e?.done === true && by(e.playedBy);
  const theirClue = (c) => c?.revealed === true && by(c.revealedBy);
  const step  = steps.some(theirStep);
  const clue  = clues.some(theirClue);
  const truth = version?.truthRevealed === true && by(version.truthRevealedBy);
  const rolls = version?.rollsShown === true && by(version.rollsShownBy);
  const ended = version?.status === "resolved" && by(version.resolvedBy);
  const linked = by(version?.subjectLinkedBy) && version?.subject?.type !== "name" && !subjectStays(version.subject, keepPlanAbout);
  if (!step && !clue && !truth && !rolls && !ended && !linked) return null;
  const next = { ...version };
  if (step) {
    next.escalation = steps.map((e) => {
      if (!theirStep(e)) return e;
      const undone = { ...e, done: false };
      delete undone.playedBy;
      return undone;
    });
  }
  if (clue) {
    next.clues = clues.map((c) => {
      if (!theirClue(c)) return c;
      const unshown = { ...c, revealed: false };
      delete unshown.revealedBy;
      return unshown;
    });
  }
  if (truth) Object.assign(next, { truthRevealed: false, truthRevealedBy: null });
  if (rolls) Object.assign(next, { rollsShown: false, rollsShownBy: null });
  if (ended) Object.assign(next, { status: "active", resolvedBy: null });
  if (linked) Object.assign(next, { subject: { type: "name", id: null, name: version.subject?.name ?? "" }, subjectLinkedBy: null });
  return { version: next, step };
}

/**
 * Take back the Lore entries the given narrations' reveals of a hidden plan's
 * truth filed (issue #364 SUPERSEDED-REVEAL-LORE-STANDS). A reveal files the
 * plan's truth as confirmed Lore (secrets.js onTruthRevealed): one fact in
 * two stores, the plan canonical, the Lore entry its mirror — named by the
 * plan's id (`revealOf`) and stamped with the revealing narration. A Burn
 * Momentum or Improve Result that supersedes that narration takes back its
 * plans alone (undoNarrationEntries, the Secrets category): the truth went
 * back to hidden, its scene fact was retracted, and the mirror stayed
 * confirmed — the journal players read, and the narrator's ESTABLISHED LORE,
 * stating a truth the Secrets journal held hidden.
 *
 * Each Lore entry that mirrors a plan (`revealOf`), was last written by one of
 * the narrations, and whose plan no longer has its truth revealed — hidden
 * again, or the plan gone — goes back as a plan the narration wrote does: put
 * back as it was before them when it existed (the newest `previous` none of
 * them wrote), its page deleted when their reveal made it. Deleted, not
 * retracted as the X-Card retracts it: a retracted entry stays out of canon
 * when the same title is confirmed again, and a superseded narration's fact
 * is no bar to a later one stating it (issue #338 D8) — the next reveal files
 * the entry anew, once. Nothing else of the narrations' World Journal is
 * touched: what their own capture recorded stands beside the re-narration
 * (decisions.md, issue #338 D8 / #347 D2). An entry a GM's own Reveal now, or
 * any other write, rewrote since is not the reveal's (`revealOf` cleared, or
 * another stamp) and stands; so does one filed before entries named their
 * plan. Run after the plans are put back. Canonical GM (the caller's).
 * Fail-open per entry; never throws.
 *
 * @param {string[]} narrationIds — the superseded narrations
 * @returns {Promise<{ restored: number, deleted: number }>}
 */
export async function undoRevealedTruthLore(narrationIds) {
  const out = { restored: 0, deleted: 0 };
  const removed = new Set((narrationIds ?? []).filter(id => typeof id === "string" && id));
  if (!removed.size) return out;
  const fromRemoved = (entry) => typeof entry?.narrationId === "string" && removed.has(entry.narrationId);
  // The plans whose truth stands revealed, as the undo left them.
  const revealed = new Set();
  for (const page of findJournal(JOURNAL_NAMES.secrets)?.pages?.contents ?? []) {
    const plan = page?.flags?.[MODULE_ID]?.[FLAG_KEYS.secrets];
    if (typeof plan?.id === "string" && plan.truthRevealed === true) revealed.add(plan.id);
  }
  const journal = findJournal(JOURNAL_NAMES.lore);
  for (const page of [...(journal?.pages?.contents ?? [])]) {
    const entry = page?.flags?.[MODULE_ID]?.[FLAG_KEYS.lore];
    if (typeof entry?.revealOf !== "string" || !entry.revealOf || !fromRemoved(entry) || revealed.has(entry.revealOf)) continue;
    try {
      const versions = Array.isArray(entry.previous) ? entry.previous : [];
      const at = versions.findIndex(v => v && !fromRemoved(v));
      if (at >= 0) {
        const older = versions.slice(at + 1);
        // setFlag merges: every key the version put back may lack is written.
        await writeEntryPage(page, FLAG_KEYS.lore, {
          ...versions[at],
          narrationId: versions[at].narrationId ?? null,
          previous:    older.length ? older : null,
          revealOf:    versions[at].revealOf ?? null,
        });
        out.restored += 1;
      } else {
        await page.delete();
        out.deleted += 1;
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | upgrade: could not take back the Lore entry "${page?.name}" of a superseded reveal:`, err?.message ?? err);
    }
  }
  return out;
}

/** The line a withdrawn rolls card carries, by what took it back (withdrawRollsCards). */
const ROLLS_CARD_NOTES = Object.freeze({
  // As a draft row the X-Card withdrew reads (entityExtractor.js).
  xcard:    "Withdrawn — X-Card",
  planGone: "Withdrawn — the plan behind these rolls is no longer in play.",
  // A Burn Momentum or Improve Result superseded the narration that revealed it.
  reveal:   "Superseded — the outcome was upgraded: this was not revealed.",
});

/** A rolls card's content with its rolls struck and a line saying why (idempotent). */
function withdrawnRollsCardContent(content, note) {
  const html = String(content ?? "");
  if (html.includes("sf-rolls-withdrawn")) return html;
  const line = `<div class="sf-rolls-withdrawn-note" style="opacity:0.7;font-style:italic;">${note}</div>`;
  const struck = html.replace('<div class="sf-card-body">',
    '<div class="sf-card-body sf-rolls-withdrawn" style="opacity:0.55;text-decoration:line-through;">');
  return /<\/div>\s*$/.test(struck) ? struck.replace(/<\/div>\s*$/, `${line}</div>`) : struck + line;
}

/**
 * Withdraw the table's cards of a plan's oracle rolls ("The oracle, behind
 * the scenes" — secrets.js postRollsCard, flagged `secretRollsCard` with the
 * plan's `skeletonId` and, on a reveal's card, the revealing `narrationId`)
 * that no longer stand for anything (issue #364
 * TAKEN-BACK-PLAN-ROLLS-CARD-STAYS: nothing read those flags once the card
 * was posted, so the card of a plan taken back stayed in chat, and a reveal
 * taken back and made again left two). A card `reasonFor` names a reason for
 * is kept in chat, as every card of a taken-back narration is — its rolls
 * struck, a line saying why (ROLLS_CARD_NOTES), and flagged `rollsWithdrawn`
 * with the reason, which this reads to pass over a card already withdrawn.
 * Called for a plan whose page is gone (secrets.js
 * withdrawRollsCardsOfDeletedPlans, the page hook) and for a reveal taken
 * back (withdrawRollsCardsOfReveals). A chat write: canonical GM. Fail-open
 * per card; never throws.
 *
 * @param {(flags: Object) => ("xcard"|"planGone"|"reveal"|null)} reasonFor — why a standing rolls card goes, or null to leave it
 * @returns {Promise<number>} the cards withdrawn
 */
export async function withdrawRollsCards(reasonFor) {
  if (typeof reasonFor !== "function" || !isCanonicalGM()) return 0;
  let withdrawn = 0;
  for (const message of [...(globalThis.game?.messages?.contents ?? [])]) {
    const f = message?.flags?.[MODULE_ID];
    if (f?.secretRollsCard !== true || f.rollsWithdrawn) continue;
    try {
      const reason = reasonFor(f);
      const note = typeof reason === "string" && Object.hasOwn(ROLLS_CARD_NOTES, reason) ? ROLLS_CARD_NOTES[reason] : null;
      if (!note) continue;
      await message.update({
        [`flags.${MODULE_ID}.rollsWithdrawn`]: reason,
        content: withdrawnRollsCardContent(message.content, note),
      });
      withdrawn += 1;
    } catch (err) {
      console.warn(`${MODULE_ID} | secrets: the rolls card ${message?.id} could not be withdrawn:`, err?.message ?? err);
    }
  }
  return withdrawn;
}

/**
 * The rolls cards the removed narrations' reveals posted, withdrawn once the
 * undo has un-shown those rolls (undoNarrationEntries; takenBackFrom's
 * `rollsShownBy`, or the version before the reveal put back): the next reveal
 * posts the rolls again, and the first card would stand beside it. A plan
 * whose rolls are still shown keeps its card — a GM's own Reveal now since is
 * no narration's to take back. The card of a plan whose page is gone is the
 * page hook's (secrets.js). The line says the X-Card when it removed the
 * narration, a superseded outcome otherwise — the undo's two callers. Never
 * throws.
 *
 * @param {Set<string>} removed — the narrations taken back
 */
async function withdrawRollsCardsOfReveals(removed) {
  try {
    const shown = new Map();
    for (const page of findJournal(JOURNAL_NAMES.secrets)?.pages?.contents ?? []) {
      const entry = page?.flags?.[MODULE_ID]?.[FLAG_KEYS.secrets];
      if (typeof entry?.id === "string") shown.set(entry.id, shown.get(entry.id) === true || entry.rollsShown === true);
    }
    const { isNarrationXCarded } = await import("../context/safety.js");
    await withdrawRollsCards((f) => {
      if (typeof f.narrationId !== "string" || !removed.has(f.narrationId)) return null;
      if (shown.get(f.skeletonId) !== false) return null;
      return isNarrationXCarded(f.narrationId) ? "xcard" : "reveal";
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | secrets: the rolls card of a reveal taken back could not be withdrawn:`, err?.message ?? err);
  }
}

/**
 * Take the hidden plans filed for a move back by the resolution they were
 * filed for (`createdFrom.resolutionId`) — what undoNarrationEntries cannot
 * reach (issue #364 REVERTED-PRICE-PLAN-STAYS-WAITING). A price that revealed
 * a new enemy asks its move's narration for the enemy's plan; a narration
 * that was never written — a failed call, an empty reply, one the X-Card
 * paused — files it with its rolls alone under no narration's id. A Burn
 * Momentum or Improve Result that reverts that price entirely struck its
 * cards and took it out of the narrator's memory, and the plan stayed: an
 * enemy no price revealed, waiting to be decided by the next narration.
 *
 * Only a plan still waiting — in play, nothing decided — is taken: its page
 * is deleted, as a plan a removed narration made is. One decided since, by a
 * later narration it was in play for or by a GM, is that writer's now and
 * stays, as a plan another narration rewrote stays when its maker is removed
 * (undoNarrationEntries). A plan filed before plans kept their resolution
 * carries none, and is never found. On the caller's canonical GM. Fail-open
 * per plan; never throws.
 *
 * @param {string|null} resolutionId — the move the plans were filed for
 * @param {{ triggers?: string[] }} [opts] — what asked for the plans to take back (their `createdFrom.trigger`)
 * @returns {Promise<number>} the plans taken back
 */
export async function undoPlansFiledFor(resolutionId, { triggers = [] } = {}) {
  if (typeof resolutionId !== "string" || !resolutionId || !Array.isArray(triggers) || !triggers.length) return 0;
  let deleted = 0;
  const journal = findJournal(JOURNAL_NAMES.secrets);
  for (const page of [...(journal?.pages?.contents ?? [])]) {
    const entry = page?.flags?.[MODULE_ID]?.[FLAG_KEYS.secrets];
    const from = entry?.createdFrom;
    if (!from || from.resolutionId !== resolutionId || !triggers.includes(from.trigger)) continue;
    const decided = typeof entry.truth === "string" && entry.truth.trim().length > 0;
    if ((entry.status ?? "active") !== "active" || decided) continue;
    try {
      await page.delete();
      deleted += 1;
    } catch (err) {
      console.warn(`${MODULE_ID} | upgrade: could not take back the plan "${page?.name}" filed for a reverted price:`, err?.message ?? err);
    }
  }
  return deleted;
}

/** Name a plan in play whose step the undo un-played by its mark, with the clock it links (undoNarrationEntries `stepsTakenBack`). */
function noteStepTakenBack(out, entry) {
  if (typeof entry?.id !== "string" || (entry.status ?? "active") !== "active") return;
  out.stepsTakenBack.push({ id: entry.id, clockId: typeof entry.clockId === "string" && entry.clockId ? entry.clockId : null });
}

/**
 * Whether the Threats journal still holds the page of this id — what a hidden
 * plan about a recorded threat names as its subject (secrets.js
 * planSignificantThreat: the plan shares the page's id). For a supersede's
 * `keepPlanAbout` (resultUpgrade.js plansKeptThroughSupersede, issue #364
 * BURN-DROPS-RECORDED-THREAT-PLAN): a threat has no retracted state — a page
 * that is there is a threat on record. A read; false when the journal cannot
 * be read.
 *
 * @param {string|null} pageId
 * @returns {boolean}
 */
export function threatPageStands(pageId) {
  if (typeof pageId !== "string" || !pageId) return false;
  try {
    return (findJournal(JOURNAL_NAMES.threats)?.pages?.contents ?? []).some(p => p?.id === pageId);
  } catch (err) {
    console.warn(`${MODULE_ID} | World Journal: the Threats journal could not be read for the page ${pageId}:`, err?.message ?? err);
    return false;
  }
}

/**
 * The hidden plans in play once the given narrations are taken back, by id,
 * with the clocks they link — as undoNarrationEntries leaves the Secrets
 * journal, whether it has run yet or not: a plan whose newest version one of
 * them wrote stands as its newest version none of them wrote (gone, when they
 * made it); any other plan stands as it is — but for an ending one of them
 * gave it, which the undo takes back by its mark (`resolvedBy`,
 * takenBackFrom): that plan is in play again. For the undo of a plan clock's
 * pacing (clocks/planClockPacing.js planInPlayFor): the X-Card's pause write
 * comes before the plans are put back, a supersede's clock re-arm after, and
 * both must leave a clock alone whose plan is gone or closed (issue #364
 * RETIRED-PLAN-CLOCK-XCARD-REACTIVATES) — while a plan the removed narration
 * itself closed is in play again, and its clock runs. Ids only, never a
 * plan's content. Null when the journals cannot be read: the caller then
 * asks nothing. `keepPlanAbout` is the undo's own (a supersede's): a plan
 * they made that it keeps stands as filed (planVersionFiled).
 *
 * @param {string[]} narrationIds — the narrations taken back
 * @param {{ keepPlanAbout?: ((subject: Object) => boolean)|null }} [opts] — as given to undoNarrationEntries
 * @returns {{ planIds: Set<string>, clockIds: Set<string> }|null}
 */
export function hiddenPlansInPlayWithout(narrationIds, { keepPlanAbout = null } = {}) {
  try {
    if (!globalThis.game?.journal) return null;
    const removed = new Set((Array.isArray(narrationIds) ? narrationIds : []).filter(id => typeof id === "string" && id));
    const fromRemoved = (entry) => typeof entry?.narrationId === "string" && removed.has(entry.narrationId);
    const planIds  = new Set();
    const clockIds = new Set();
    for (const page of findJournal(JOURNAL_NAMES.secrets)?.pages?.contents ?? []) {
      const entry = page?.flags?.[MODULE_ID]?.[FLAG_KEYS.secrets];
      if (!entry || typeof entry !== "object") continue;
      const stands = fromRemoved(entry)
        ? ((Array.isArray(entry.previous) ? entry.previous : []).find(v => v && !fromRemoved(v)) ?? planVersionFiled(entry, keepPlanAbout))
        : entry;
      if (!stands) continue;
      const status   = stands.status ?? "active";
      const reopened = status === "resolved" && typeof stands.resolvedBy === "string" && removed.has(stands.resolvedBy);
      if (status !== "active" && !reopened) continue;
      const id = stands.id ?? entry.id;
      if (typeof id === "string" && id) planIds.add(id);
      if (typeof stands.clockId === "string" && stands.clockId) clockIds.add(stands.clockId);
    }
    return { planIds, clockIds };
  } catch (err) {
    console.warn(`${MODULE_ID} | World Journal: the hidden plans in play could not be read:`, err?.message ?? err);
    return null;
  }
}

/**
 * Put back the stance X-carded narrations moved on faction records — the
 * canonical stance home (decisions.md → "Faction stance: the entity record is
 * canonical"): each version's `recordStance`, newest first, where the record
 * still holds the stance that narration set. A stance changed since (a GM's
 * edit, a later narration) stands.
 *
 * @param {Object[]} versions — faction entries a removed narration wrote, newest first
 * @returns {Promise<void>}
 */
async function revertFactionStances(versions) {
  const moves = versions.map(v => v?.recordStance).filter(s => typeof s?.entityId === "string" && typeof s.after === "string");
  if (!moves.length) return;
  const { getFaction, updateFaction } = await import("../entities/faction.js");
  for (const s of moves) {
    const record = getFaction(s.entityId);
    if (!record || record.relationship !== s.after) continue;
    await updateFaction(s.entityId, { relationship: s.before ?? "unknown" });
  }
}

/**
 * Replace a World Journal page's entry and re-render its body from it. The
 * flag is the record; the body — what players read in Foundry's journal
 * viewer — is its rendered mirror, re-rendered on every write (decisions.md,
 * issue #322 V31). Every writer of an existing page comes here or through
 * upsertPage: a threat's severity, a lore confirm, a strike's retraction and
 * the panel's Dismiss wrote the flag alone, so the journal kept saying
 * "Severity: active", "Pending confirmation." or "Confirmed." (issue #331
 * X30). The flag write rejects when refused; a refused body write is warned
 * (the record stands), as upsertPage's.
 *
 * @param {JournalEntryPage} page
 * @param {string} flagKey — one of FLAG_KEYS.*
 * @param {Object} data — the entry
 * @returns {Promise<void>}
 */
export async function writeEntryPage(page, flagKey, data) {
  await page.setFlag(MODULE_ID, flagKey, data);
  try {
    await page.update({ text: { format: 1, content: renderPageBody(flagKey, data) } });
  } catch (err) {
    console.warn(`${MODULE_ID} | worldJournal: page body update for "${page?.name}" failed:`, err?.message ?? err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// READ — used by the assembler (Phase 5 will wire these in)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Confirmed lore entries, retracted ones excluded, most recently updated
 * first (updatedAt, falling back to createdAt). The narrator's ESTABLISHED
 * LORE section shows a few of them (buildNarratorExtras).
 */
export function getConfirmedLore(_campaignState) {
  const journal = findJournal(JOURNAL_NAMES.lore);
  return readEntries(journal, FLAG_KEYS.lore)
    .filter(e => e.confirmed === true && e.retracted !== true)
    .sort(byRecency);
}

/**
 * Places the detection pass recorded with no entity record of their own (the
 * Locations journal), as `{ title, text }` like a lore entry — so a place
 * detail can be picked for the narrator's context (selectLoreForContext).
 * Most recently updated first.
 */
export function getRecordedLocations(_campaignState) {
  const journal = findJournal(JOURNAL_NAMES.locations);
  return readEntries(journal, FLAG_KEYS.locations)
    .filter(e => e.locationName)
    .sort(byRecency)
    .map(e => ({
      title:     e.locationName,
      text:      e.description ?? "",
      updatedAt: e.updatedAt ?? null,
    }));
}

/**
 * A category's entries, each with the id of the page it is on — for a reader
 * that needs a stable id an entry (the narrator's world snapshot keys its
 * records by it, issue #357: a title or a name can be changed). Every entry
 * as stored, in no promised order; the caller applies the category's own
 * filter (confirmed lore, a threat not resolved). Never a GM-only category:
 * a plan is read through its store alone (src/world/secrets.js).
 *
 * @param {"lore"|"threats"|"factions"|"locations"|"sessionLog"} category
 * @returns {Array<{ pageId: string, entry: Object }>}
 */
export function listWorldJournalEntries(category) {
  if (GM_ONLY_CATEGORIES.has(category)) return [];
  const flagKey = category === "sessionLog" ? FLAG_KEYS.sessionLogPage : FLAG_KEYS[category];
  if (!flagKey) return [];
  return (findWorldJournal(category)?.pages?.contents ?? [])
    .map(p => ({ pageId: p?.id ?? null, entry: p?.flags?.[MODULE_ID]?.[flagKey] ?? null }))
    .filter(x => x.pageId && x.entry);
}

const CONTEXT_STOPWORDS = new Set([
  "that", "this", "with", "from", "into", "onto", "upon", "have", "they", "them",
  "their", "there", "what", "when", "where", "which", "while", "your", "about",
  "been", "were", "will", "would", "could", "should", "then", "than", "just",
]);

function contextWords(text) {
  return new Set(
    String(text ?? "")
      .toLowerCase()
      .replace(/[’']s\b/gu, "")
      .split(/[^\p{L}\p{N}]+/u)
      .filter(w => w.length >= 4 && !CONTEXT_STOPWORDS.has(w)),
  );
}

/** How many lore entries the narrator's ESTABLISHED LORE section holds, and how many of those may be picked for relevance. */
const LORE_CONTEXT_CAP  = 8;
const LORE_RELEVANT_CAP = 5;

/**
 * The lore entries for this turn's narrator context (issue #286 C2): up to
 * LORE_RELEVANT_CAP that share the most words with what the scene is about —
 * the player's text, the scene frame, the entities in play — then the most
 * recent to fill LORE_CONTEXT_CAP. It used to be the five most recently
 * updated entries, so a place detail fell out as soon as five newer facts
 * landed anywhere. Lexical, no API call (the non-move relevance rule).
 *
 * @param {Array<{ title?: string, text?: string }>} entries — most recent first
 * @param {string} queryText
 * @param {number} [cap]
 * @returns {Array} relevant first (most shared words, then most recent), then recent
 */
export function selectLoreForContext(entries, queryText, cap = LORE_CONTEXT_CAP) {
  const list  = Array.isArray(entries) ? entries.filter(e => e && (e.title || e.text)) : [];
  const query = contextWords(queryText);
  const scored = list.map((entry, order) => {
    let score = 0;
    if (query.size) {
      for (const w of contextWords(`${entry.title ?? ""} ${entry.text ?? ""}`)) if (query.has(w)) score += 1;
    }
    return { entry, order, score };
  });
  const picked = scored
    .filter(s => s.score > 0)
    .sort((a, b) => (b.score - a.score) || (a.order - b.order))
    .slice(0, Math.min(LORE_RELEVANT_CAP, cap));
  for (const s of scored) {
    if (picked.length >= cap) break;
    if (!picked.includes(s)) picked.push(s);
  }
  return picked.map(s => s.entry);
}

/**
 * Narrator-asserted but not yet confirmed lore. A struck fact's entry
 * (retractSessionLore) is not pending review — the table already ruled.
 */
export function getNarratorAssertedLore(_campaignState) {
  const journal = findJournal(JOURNAL_NAMES.lore);
  return readEntries(journal, FLAG_KEYS.lore)
    .filter(e => e.narratorAsserted === true && e.confirmed !== true && e.retracted !== true)
    .sort(byRecency);
}

/**
 * Threats with severity !== "resolved", sorted by severity priority
 * (immediate → active → looming).
 */
export function getActiveThreats(_campaignState) {
  const journal = findJournal(JOURNAL_NAMES.threats);
  return readEntries(journal, FLAG_KEYS.threats)
    // A severity stored before it was checked (issue #354 P2-15) is read as
    // the one it means — a sentence as "active": it was an escalation's note.
    .map(e => (THREAT_SEVERITIES.includes(e.severity) ? e : { ...e, severity: normalizeThreatSeverity(e.severity) ?? "active" }))
    .filter(e => e.severity !== "resolved")
    .sort((a, b) => {
      const sa = SEVERITY_ORDER[a.severity] ?? 99;
      const sb = SEVERITY_ORDER[b.severity] ?? 99;
      if (sa !== sb) return sa - sb;
      return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
    });
}

/**
 * The World Journal's factions, most recently updated first — up to 3 (the
 * detection pass's view), or `limit` of them. The narrator's [4e] takes every
 * one (`limit: Infinity`): mergeFactionLandscape ranks them with the faction
 * records by recency, and a faction's newest World Journal write can lift its
 * record into that block (issue #342 Z13).
 *
 * @param {Object} [_campaignState]
 * @param {{ limit?: number }} [opts]
 */
export function getFactionLandscape(_campaignState, { limit = 3 } = {}) {
  const journal = findJournal(JOURNAL_NAMES.factions);
  return readEntries(journal, FLAG_KEYS.factions)
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
    .slice(0, limit);
}

/**
 * A single WJ faction entry by name — the page so named, else the one whose
 * name has the same identity key (article, case and spacing aside —
 * factionNameKey, issue #336 Y31) — or null.
 * Used by the draft-confirm path to reconcile pre-record intelligence onto
 * a freshly created faction entity record (FACTION-DUAL-STORE, 2026-07), and
 * by the draft routing's one-surface check (issue #331 X33).
 */
export function getFactionEntry(name) {
  const cleanName = String(name ?? "").trim();
  if (!cleanName) return null;
  const journal = findJournal(JOURNAL_NAMES.factions);
  return findFactionPage(journal, cleanName)?.flags?.[MODULE_ID]?.[FLAG_KEYS.factions] ?? null;
}

/**
 * Follow a faction's rename onto its World Journal — Factions page: the page
 * that backlinks the faction's journal (`entityId`), else the one its old
 * name keys to (factionNameKey) that backlinks nothing else, takes the new
 * name — its title and `factionName` — so the faction stays one page and one
 * [4e] line under the name its journal now has (issue #345 AA18: renamed in
 * the Journal sidebar, the record and this page each kept the old name). A
 * page that already holds the new name is another faction's log: nothing is
 * merged by a guess. Never throws.
 *
 * @param {{ entityId: string, from?: string|null, to: string }} rename —
 *   the faction's host JournalEntry id, its old and new names
 * @returns {Promise<boolean>} whether a page was renamed
 */
export async function renameFactionEntry({ entityId, from = null, to } = {}) {
  try {
    const name = String(to ?? "").trim();
    if (!name) return false;
    const pages   = findJournal(JOURNAL_NAMES.factions)?.pages?.contents ?? [];
    const entryOf = (p) => p?.flags?.[MODULE_ID]?.[FLAG_KEYS.factions] ?? null;
    const fromKey = factionNameKey(from);
    const page = (entityId ? pages.find(p => entryOf(p)?.entityId === entityId) : null)
      ?? (fromKey ? pages.find(p => entryOf(p) && !entryOf(p).entityId && factionNameKey(p.name) === fromKey) : null)
      ?? null;
    if (!page) return false;
    const entry = entryOf(page);
    if (page.name === name && entry.factionName === name) return false;
    const toKey = factionNameKey(name);
    if (pages.some(p => p !== page && factionNameKey(p.name) === toKey)) {
      console.warn(`${MODULE_ID} | worldJournal: a Factions page named "${name}" already exists — "${page.name}" was not renamed.`);
      return false;
    }
    const data = { ...entry, factionName: name, entityId: entry.entityId ?? entityId ?? null };
    await page.setFlag(MODULE_ID, FLAG_KEYS.factions, data);
    await page.update({ name, text: { format: 1, content: renderPageBody(FLAG_KEYS.factions, data) } });
    return true;
  } catch (err) {
    console.warn(`${MODULE_ID} | worldJournal: renaming the faction's page failed:`, err?.message ?? err);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// !journal command parsing
// ─────────────────────────────────────────────────────────────────────────────

const COMMAND_PATTERN = /^!journal\s+(\w+)\s+("[^"]+"|\S+)\s+(\S+)(?:\s+[—-]\s*(.+))?$/i;

const VALID_TYPES = new Set(["faction", "location", "lore", "threat"]);

/** The World Journal's faction attitude vocabulary (entities/faction.js maps it onto a stance). */
export const FACTION_ATTITUDES = ["hostile", "neutral", "allied", "unknown"];

/**
 * Each type's qualifier vocabulary — a `!journal` qualifier outside it is
 * refused with the usage line, as an unknown type is: `threat … resolve`
 * stored severity "resolve" (not "resolved"), so the threat stayed active;
 * `faction … ally` stored an attitude no faction record maps, so the two
 * stores disagreed; `lore … confirm` filed the GM's ruling as a rumour
 * (issue #326 W62). A location's type is free text.
 */
export const JOURNAL_QUALIFIERS = {
  faction: FACTION_ATTITUDES,
  lore:    ["confirmed", "rumour", "rumor"],
  threat:  THREAT_SEVERITIES,
};

/**
 * Parse a !journal chat command into a structured action.
 *
 * Forms (per scope §9):
 *   !journal faction "Name" attitude — summary
 *   !journal location "Name" type — description
 *   !journal lore "Title" confirmed|rumour — text
 *   !journal threat "Name" severity — summary
 *
 * Returns null for unknown types, a qualifier outside the type's vocabulary
 * (JOURNAL_QUALIFIERS — issue #326 W62), or unparseable commands. The em-dash
 * separator may be a literal "—", "--", or "-".
 *
 * @param {string} text
 * @returns {Object|null}
 */
export function parseJournalCommand(text) {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed.toLowerCase().startsWith("!journal")) return null;

  const match = trimmed.match(COMMAND_PATTERN);
  if (!match) return null;

  const type = match[1].toLowerCase();
  if (!VALID_TYPES.has(type)) return null;

  // Strip surrounding quotes if present
  let name = match[2];
  if (name.startsWith('"') && name.endsWith('"')) name = name.slice(1, -1);

  const qualifier = match[3].toLowerCase();
  const text2     = match[4]?.trim() ?? "";
  if (JOURNAL_QUALIFIERS[type] && !JOURNAL_QUALIFIERS[type].includes(qualifier)) return null;

  return { type, name, qualifier, text: text2, raw: trimmed };
}

/**
 * Execute a parsed !journal command. The lore variant supports a
 * "confirmed" qualifier; everything else stores the entry with confirmed:
 * false / narratorAsserted: false (a manual editorial decision).
 *
 * @param {Object} parsed   — result of parseJournalCommand
 * @param {Object} campaignState
 * @returns {Promise<Object|null>}
 */
export async function executeJournalCommand(parsed, campaignState) {
  if (!parsed?.type) return null;
  const sessionId  = campaignState?.currentSessionId ?? "";
  const sessionNum = campaignState?.sessionNumber    ?? null;

  switch (parsed.type) {
    case "faction":
      return recordFactionIntelligence(parsed.name, {
        attitude:  parsed.qualifier,
        summary:   parsed.text,
        sessionId,
      }, campaignState);

    case "location":
      return recordLocation(parsed.name, {
        type:        parsed.qualifier,
        description: parsed.text,
        sessionId,
      }, campaignState);

    case "lore": {
      // The GM's ruling on an entry: confirmed or rumour, never retracted —
      // `!journal lore "<title>" confirmed` restores a struck entry
      // (decisions.md "A strike reaches every copy of the fact"). A recorded
      // entry keeps its text unless the command gives one, its category, and
      // where it came from: its session and move, and — when confirmed — its
      // narrator provenance (a rumour ruling still takes a narrator-asserted
      // entry out of the review queue). Issue #321 U40.
      const confirmed = parsed.qualifier === "confirmed";
      const existing  = findLoreEntry(parsed.name);
      return recordLoreDiscovery(parsed.name, {
        text:             parsed.text,
        confirmed,
        retracted:        false,
        narratorAsserted: confirmed && existing?.narratorAsserted === true,
        sessionId:        existing?.sessionId || sessionId,
        sessionNumber:    existing ? existing.sessionNumber : sessionNum,
        moveId:           existing?.moveId ?? null,
      }, campaignState);
    }

    case "threat":
      return recordThreat(parsed.name, {
        severity: parsed.qualifier,
        summary:  parsed.text,
        sessionId,
      }, campaignState);

    default:
      return null;
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function nameToCategory(journalName) {
  for (const [cat, n] of Object.entries(JOURNAL_NAMES)) {
    if (n === journalName) return cat;
  }
  return "unknown";
}

/** A journal's World Journal category flag (written at its creation), or null. */
function journalCategory(journal) {
  return journal?.flags?.[MODULE_ID]?.worldJournalCategory ?? null;
}

/**
 * The journal of a World Journal category (`name` is its JOURNAL_NAMES
 * title): the one flagged with that category — what a GM's rename in the
 * sidebar leaves alone — else the journal of its name that carries no
 * category flag (one made before the flag), never one flagged as another
 * category. The flag was written and never read: every reader and writer
 * found its journal by display name, so a renamed Lore journal took every
 * confirmed fact out of the narrator's ESTABLISHED LORE, and the next lore
 * recorded — or the next load — made a second one, splitting the record
 * (issue #345 AA63; rules/reachability.md §1, §6).
 *
 * A world that defect already split holds two journals flagged with the
 * category: the one the GM renamed, and the default-named one the next load
 * made — which every session since read and wrote. Among several flagged
 * journals the one still carrying the default name wins, as v1.8.0 read it;
 * collection order put the older, renamed journal first, so the upgrade would
 * have flipped every reader and writer onto it — the lore recorded since the
 * split leaving ESTABLISHED LORE (issue #347 AB16). A sidebar Duplicate of a
 * World Journal journal is the same case. At the canonical GM's load a card
 * offers the GMs a merge of what the other copies hold that this one lacks
 * (journalSplitMerge.js — issue #347 residual TRACKS-JOURNAL-SPLIT-NOT-MERGED).
 *
 * @param {string} name
 * @returns {JournalEntry|null}
 */
function findJournal(name) {
  if (!globalThis.game?.journal) return null;
  const category = nameToCategory(name);
  if (category !== "unknown") {
    // A copy a split's merge retired (`journalMerged` — merged, or kept
    // separate) is never the live journal: with the live one deleted, the
    // lookup fell back to it (JOURNAL-MERGE-DIFFERING-ENTRY).
    const live = (j) => journalCategory(j) === category && !j?.flags?.[MODULE_ID]?.journalMerged;
    const flagged = game.journal.find?.(j => live(j) && j.name === name)
                 ?? game.journal.find?.(live);
    if (flagged) return flagged;
  }
  const named = game.journal.getName?.(name)
      ?? game.journal.find?.(j => j.name === name)
      ?? null;
  return named && !journalCategory(named) ? named : null;
}

/**
 * The journal of a World Journal category, by its key ("lore", "threats",
 * "factions", "locations", "sessionLog") — found as findJournal finds it. For
 * the World Journal panel's journal buttons and its lore lookups.
 *
 * @param {string} category
 * @returns {JournalEntry|null}
 */
export function findWorldJournal(category) {
  const name = JOURNAL_NAMES[category];
  return name ? findJournal(name) : null;
}

/**
 * A World Journal category's live journal (findJournal's pick, which every
 * reader and writer uses) and the other journals flagged with that category
 * — the copies a split world holds (issue #347 AB16) — less a copy a merge
 * already retired (`journalMerged`, journalSplitMerge.js). For the
 * GM-confirmed merge at load (issue #347 residual
 * TRACKS-JOURNAL-SPLIT-NOT-MERGED).
 *
 * @param {string} category — a JOURNAL_NAMES key
 * @returns {{ live: JournalEntry|null, copies: JournalEntry[] }}
 */
export function worldJournalCopies(category) {
  const name = JOURNAL_NAMES[category];
  if (!name || !globalThis.game?.journal) return { live: null, copies: [] };
  const live = findJournal(name);
  const all  = (game.journal.contents ?? []).filter(j => journalCategory(j) === category);
  return { live, copies: all.filter(j => j !== live && !j?.flags?.[MODULE_ID]?.journalMerged) };
}

/**
 * The page of `journal` that is the entry `page` is — found as the writers
 * find an entry: by its page name, or the entry its flag names; a Factions
 * page also by its faction's entity id or name key (findFactionPage,
 * renameFactionEntry). Null when `journal` does not hold it.
 *
 * @param {JournalEntry|null} journal
 * @param {JournalEntryPage} page
 * @param {string} category — a JOURNAL_NAMES key
 * @returns {JournalEntryPage|null}
 */
export function journalEntryMatch(journal, page, category) {
  const pages = journal?.pages?.contents ?? [];
  const byName = pages.find(p => p?.name === page?.name);
  if (byName) return byName;
  // By the entry its flag names too: a page renamed in either copy is still
  // the same entry (WJ-PAGE-BY-TITLE).
  const title = entryTitle(page);
  const byTitle = title ? pages.find(p => entryTitle(p) === title) : null;
  if (byTitle) return byTitle;
  if (category !== "factions") return null;
  const entryOf = (p) => p?.flags?.[MODULE_ID]?.[FLAG_KEYS.factions] ?? null;
  const entityId = entryOf(page)?.entityId ?? null;
  const byEntity = entityId ? pages.find(p => entryOf(p)?.entityId === entityId) : null;
  if (byEntity) return byEntity;
  const key = factionNameKey(page?.name);
  return key ? (pages.find(p => factionNameKey(p?.name) === key) ?? null) : null;
}

/**
 * Whether `journal` already holds the entry `page` is (journalEntryMatch).
 *
 * @param {JournalEntry|null} journal
 * @param {JournalEntryPage} page
 * @param {string} category — a JOURNAL_NAMES key
 * @returns {boolean}
 */
export function journalHoldsEntry(journal, page, category) {
  return !!journalEntryMatch(journal, page, category);
}

/**
 * Give a journal found by its name — one made before the category flag —
 * that flag, the key every lookup now uses (issue #345 AA63). GM only; a
 * refused stamp is logged, the journal still used.
 */
async function stampJournalCategory(journal, name) {
  const category = nameToCategory(name);
  if (category === "unknown" || journalCategory(journal) === category) return;
  if (!game.user?.isGM || typeof journal?.setFlag !== "function") return;
  try {
    await journal.setFlag(MODULE_ID, "worldJournalCategory", category);
  } catch (err) {
    console.warn(`${MODULE_ID} | worldJournal: marking "${journal.name}" as the ${category} journal failed:`, err?.message ?? err);
  }
}

/**
 * A World Journal category's journal, made when there is none — GM only, as
 * every write to it is (a GM-only category is made with no player
 * permission). Null on a player's client when it does not exist.
 *
 * One made here — mid-session, by the first write to a category whose journal
 * is gone — is made in the module's journal folder, as the load makes them
 * (companionJournalFolderId, issue #362 AC48): it was made outside any
 * folder, loose in the sidebar beside the folder its siblings sit in (issue
 * #364 WJ-LAZY-JOURNAL-NO-FOLDER).
 *
 * @param {string} category — a JOURNAL_NAMES key
 * @returns {Promise<JournalEntry|null>}
 */
export async function getOrCreateWorldJournal(category) {
  const name = JOURNAL_NAMES[category];
  return name ? getOrCreateJournal(name) : null;
}

async function getOrCreateJournal(name) {
  let journal = findJournal(name);
  if (journal) {
    await stampJournalCategory(journal, name);
    return journal;
  }
  if (!game.user?.isGM) return null;
  try {
    // The folder is found — or made, stamped — as initWorldJournals does for
    // a journal it is about to make; none found or made, the journal is made
    // outside any folder (companionJournalFolderId never throws).
    const folderId = await companionJournalFolderId({ create: true });
    // The lookup awaited: another write may have made the journal meanwhile.
    journal = findJournal(name);
    if (journal) return journal;
    journal = await JournalEntry.create(journalCreateData(name, folderId ?? undefined));
    return journal ?? null;
  } catch (err) {
    console.error(`${MODULE_ID} | worldJournal: getOrCreateJournal(${name}) failed:`, err);
    return null;
  }
}

/**
 * The name an entry page's own flag gives its entry — a lore title, a
 * threat's, a faction's or a location's name — or null for a page with no
 * entry flag. Written with the entry, so a GM's rename of the page in the
 * journal leaves it alone.
 *
 * @param {JournalEntryPage} page
 * @returns {string|null}
 */
function entryTitle(page) {
  const own = page?.flags?.[MODULE_ID];
  if (!own) return null;
  const title = own[FLAG_KEYS.lore]?.title ?? own[FLAG_KEYS.threats]?.name
    ?? own[FLAG_KEYS.factions]?.factionName ?? own[FLAG_KEYS.locations]?.locationName
    ?? own[FLAG_KEYS.secrets]?.id ?? null;
  return typeof title === "string" && title ? title : null;
}

/**
 * The entry page for a name: the page whose entry flag names it, else the
 * page so titled (a page written before, or by hand). It was found by its
 * title alone, so a page the GM renamed in the journal was not followed: the
 * next record of that entry started a second page beside it, and the World
 * Journal panel's buttons and the GM's `!journal` rulings missed it (issue
 * #345 AA63's residual WJ-PAGE-BY-TITLE).
 *
 * @param {JournalEntry|null} journal
 * @param {string} pageName
 * @returns {JournalEntryPage|null}
 */
function findPageByName(journal, pageName) {
  const pages = journal?.pages?.contents ?? [];
  return pages.find(p => entryTitle(p) === pageName)
      ?? pages.find(p => p?.name === pageName)
      ?? null;
}

/**
 * A World Journal entry's page by the entry's name, found as the writers find
 * it (by its entry flag first — WJ-PAGE-BY-TITLE). For the World Journal
 * panel's per-entry buttons.
 *
 * @param {JournalEntry|null} journal
 * @param {string} title
 * @returns {JournalEntryPage|null}
 */
export function findEntryPage(journal, title) {
  return findPageByName(journal, title);
}

/**
 * The Factions page for a faction name: the page so named, else the one
 * whose name has the same identity key (factionNameKey — issue #336 Y31).
 * Factions only: the other categories keep exact titles (a lore title or a
 * threat name is what `!journal` types back).
 *
 * @param {JournalEntry|null} journal — the Factions journal
 * @param {string} name
 * @returns {JournalEntryPage|null}
 */
function findFactionPage(journal, name) {
  const exact = findPageByName(journal, name);
  if (exact) return exact;
  const key = factionNameKey(name);
  if (!key) return null;
  const pages = journal?.pages?.contents ?? [];
  return pages.find(p => entryTitle(p) && factionNameKey(entryTitle(p)) === key)
      ?? pages.find(p => factionNameKey(p.name) === key)
      ?? null;
}

/** The stored lore entry titled `title` (trimmed, as recordLoreDiscovery files it), or null. */
function findLoreEntry(title) {
  const page = findPageByName(findJournal(JOURNAL_NAMES.lore), String(title ?? "").trim());
  return page?.flags?.[MODULE_ID]?.[FLAG_KEYS.lore] ?? null;
}

async function upsertPage(journal, pageName, flagKey, data) {
  const existing = findPageByName(journal, pageName);
  const content  = renderPageBody(flagKey, data);
  if (existing) {
    await existing.setFlag(MODULE_ID, flagKey, data);
    // Keep the visible page body in sync with the flag data (F15/F17/F19/F21:
    // the description lived only in the flag, so the page rendered blank).
    try {
      await existing.update({ text: { format: 1, content } });
    } catch (err) {
      console.warn(`${MODULE_ID} | worldJournal: page body update for "${pageName}" failed:`, err);
    }
    return existing;
  }
  try {
    const created = await journal.createEmbeddedDocuments("JournalEntryPage", [{
      name:  pageName,
      type:  "text",
      text:  { format: 1, content },
      flags: { [MODULE_ID]: { [flagKey]: data } },
    }]);
    return Array.isArray(created) ? created[0] : created;
  } catch (err) {
    console.error(`${MODULE_ID} | worldJournal: upsertPage(${pageName}) failed:`, err);
    return null;
  }
}

/**
 * Render a World Journal entry's descriptive fields into HTML for the
 * JournalEntryPage body. The entry data is also stored on a page flag (the
 * panel reads that), but the page itself needs real body content or it renders
 * blank — see F15/F17/F19/F21 in docs/testing/v1.6.1-playtest-findings.md.
 *
 * @param {string} flagKey  one of FLAG_KEYS.*
 * @param {Object} data     the per-category entry record
 * @returns {string} HTML
 */
function renderPageBody(flagKey, data) {
  if (!data) return "";
  const p = (s) => `<p>${escapeHtml(String(s))}</p>`;
  const meta = (label, value) =>
    value ? `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(String(value))}</p>` : "";

  switch (flagKey) {
    case FLAG_KEYS.lore: {
      const body = data.text || data.fact || "";
      // A struck fact reads as struck, whatever its other fields: a struck
      // entry the narrator re-recorded holds `confirmed: true, retracted:
      // true`, and its page said "Confirmed." (issue #331 X30).
      return (body ? p(body) : "") +
        (data.retracted ? "<p><em>Retracted by the table.</em></p>"
         : data.confirmed ? "<p><em>Confirmed.</em></p>"
         : data.narratorAsserted ? "<p><em>Pending confirmation.</em></p>" : "");
    }
    case FLAG_KEYS.threats: {
      // What the threat did before its summary changed: the history lines
      // that say something else (issue #354 P2-15).
      const earlier = [...new Set((Array.isArray(data.history) ? data.history : [])
        .map(h => (typeof h?.summary === "string" ? h.summary.trim() : ""))
        .filter(text => text && text !== data.summary))];
      return meta("Severity", normalizeThreatSeverity(data.severity) ?? data.severity) +
        (data.mergedInto ? meta("Merged into", data.mergedInto) : "") +
        (data.summary ? p(data.summary) : "") +
        (earlier.length
          ? `<p><strong>Earlier:</strong></p><ul>${earlier.map(text => `<li>${escapeHtml(text)}</li>`).join("")}</ul>` : "");
    }
    case FLAG_KEYS.factions:
      return meta("Attitude", data.attitude) + (data.knownGoal ? p(data.knownGoal) : "");
    case FLAG_KEYS.locations:
      return meta("Type", data.type) + meta("Status", data.status) +
        (data.description ? p(data.description) : "");
    case FLAG_KEYS.secrets: {
      // A plan, for the GM who opens the Secrets journal (issue #353).
      const list = (label, items) => (items?.length
        ? `<p><strong>${escapeHtml(label)}:</strong></p><ol>${items.map(i => `<li>${escapeHtml(String(i))}</li>`).join("")}</ol>` : "");
      const mark = (t, on, word) => `${t}${on ? ` (${word})` : ""}`;
      return meta("Status", data.status) +
        (data.aliases?.length ? meta("Also called", data.aliases.join(", ")) : "") +
        (data.question ? meta("Question", data.question) : "") +
        meta("Truth", data.truth || "not yet decided") +
        (data.truthRevealed ? "<p><em>Revealed to the table.</em></p>" : "") +
        meta("Wants", data.wants) + meta("Knows", data.knows) +
        list("Escalation", (data.escalation ?? []).map(e => mark(e.text, e.done, "played"))) +
        list("Clues", (data.clues ?? []).map(c => mark(c.text, c.revealed, "shown"))) +
        list("Could end", data.resolutions) +
        list("Oracle rolls", data.oracleSeeds);
    }
    default:
      return data.summary ? p(data.summary) : (data.text ? p(data.text) : "");
  }
}

function readEntries(journal, flagKey) {
  return (journal?.pages?.contents ?? [])
    .map(p => p?.flags?.[MODULE_ID]?.[flagKey])
    .filter(Boolean);
}

function byRecency(a, b) {
  const ta = a?.updatedAt ?? a?.createdAt ?? "";
  const tb = b?.updatedAt ?? b?.createdAt ?? "";
  return tb.localeCompare(ta);
}

async function postContradictionNotification(transition) {
  if (!globalThis.ChatMessage?.create) return;
  const enabled = (() => {
    try   { return game.settings?.get(MODULE_ID, "contradictionNotifications") !== false; }
    catch { return true; }
  })();
  if (!enabled) return;

  const isFactContinuity = transition.entryType === "factContinuity";
  // A fact-continuity catch says what conflicts (issue #354 P2-19): the fact
  // as recorded, then the narration's own words — it showed the subject and
  // a pointer to the fact ("ACTIVE SCENE STATE — isaac sutton location").
  const recorded = typeof transition.recorded === "string" ? transition.recorded.trim() : "";
  const evidence = typeof transition.evidence === "string" ? transition.evidence.trim() : "";
  const name   = escapeHtml(transition.subjectLabel || transition.name || "(unknown)");
  const detail = escapeHtml(recorded ? `recorded — ${recorded}` : (transition.summary ?? transition.newValue ?? ""));
  const said   = isFactContinuity && evidence
    ? `<p class="sf-wj-contradiction-evidence"><em>The narration said:</em> “${escapeHtml(evidence)}”</p>`
    : "";

  // Kind-aware remedy (NARRCHK-REMEDY-MISMATCH, 2026-07): the correction
  // dialog only fixes scene truths/state — for the other audit kinds the
  // remedy lives elsewhere, so point the GM at the right tool instead of a
  // dialog that cannot address the flag.
  const kind = String(transition.kind ?? "truth").toLowerCase();
  const REMEDY_HINTS = {
    frame:      "The scene frame refreshes with the next narration — nudge with <code>@scene</code> (or <code>!scene start</code>) if it stays stale.",
    // `!at <place>` sets the position — no `!ship` verb does (issue #326 W66).
    ship:       "Ship position lives on the ship record — correct it with <code>!at &lt;place&gt;</code> or by moving the command-vehicle token.",
    identity:   "Recorded pronouns live on the character sheet / connection record — fix them there (entity panel or sheet).",
    retraction: "Re-asserting a retracted fact is already blocked at the ledger — no correction needed. Use Replace in the correction dialog if the fact should genuinely change.",
    // Overhaul 4: the narration broke a line of what its result obliged it to tell.
    obligation: "The narration told what its result did not allow (the line above): nothing on a sheet changed — say the correction at the table.",
  };
  const dialogApplies = isFactContinuity && !(kind in REMEDY_HINTS);

  const remedy = dialogApplies
    ? `<div class="sf-wj-contradiction-actions">` +
      `<button class="sf-correct-fact-btn" data-action="openCorrectionDialog" aria-label="Retract the offending fact">` +
      `<i class="fas fa-list-check"></i> Retract the offending fact</button></div>`
    : (isFactContinuity && REMEDY_HINTS[kind]
        ? `<p class="sf-wj-contradiction-hint"><em>${REMEDY_HINTS[kind]}</em></p>`
        : "");

  const html =
    `<div class="sf-wj-contradiction"><div class="sf-wj-contradiction-label">◈ Narrative Review</div>` +
    `<p>The narrator may have contradicted an established fact.</p>` +
    `<p><strong>${name}</strong>${detail ? ` — ${detail}` : ""}</p>` +
    said +
    remedy +
    `</div>`;

  try {
    await ChatMessage.create({
      content:  html,
      whisper:  game.users?.filter ? game.users.filter(u => u.isGM).map(u => u.id) : [],
      flags:    {
        [MODULE_ID]: {
          worldJournalContradiction: true,
          narratorCard:              isFactContinuity,             // surfaces the correction renderChatMessage hook
          factContinuityReview:      isFactContinuity,
          contradictedSubject:       transition.name ?? null,
          // What the World Journal panel's row shows (issue #354 P2-19).
          ...(isFactContinuity ? { contradiction: { subject: transition.subjectLabel || transition.name || "", recorded, evidence } } : {}),
          contradictedTruthId:       transition.truthId ?? null,
          matchedEntityIds:          transition.matchedEntityIds ?? [],
        },
      },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | worldJournal: postContradictionNotification failed:`, err);
  }
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
