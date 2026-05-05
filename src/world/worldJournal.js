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

const MODULE_ID = "starforged-companion";

export const FOLDER_NAME = "Starforged Companion";

export const JOURNAL_NAMES = {
  lore:       "World Journal — Lore",
  threats:    "World Journal — Threats",
  factions:   "World Journal — Factions",
  locations:  "World Journal — Locations",
  sessionLog: "World Journal — Session Log",
};

export const FLAG_KEYS = {
  lore:      "loreEntry",
  threats:   "threatEntry",
  factions:  "factionEntry",
  locations: "locationEntry",
  sessionLogPage: "sessionLogPage",
};

export const THREAT_SEVERITIES = ["immediate", "active", "looming", "resolved"];
const SEVERITY_ORDER = { immediate: 0, active: 1, looming: 2, resolved: 3 };

export const FACTION_ATTITUDES = ["hostile", "neutral", "allied", "unknown"];
export const LOCATION_STATUSES = ["current", "departed", "destroyed", "unknown"];
export const LORE_CATEGORIES   = ["ascendancy", "ai", "essentia", "truthConnection", "precursor", "other"];


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
  if (!game.user?.isGM) return;

  let folder = null;
  try {
    folder = game.folders?.find(f => f.type === "JournalEntry" && f.name === FOLDER_NAME)
          ?? null;
    if (!folder && globalThis.Folder?.create) {
      folder = await globalThis.Folder.create({ name: FOLDER_NAME, type: "JournalEntry" });
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | worldJournal: folder create failed:`, err);
    folder = null;
  }
  const folderId = folder?.id ?? null;

  for (const name of Object.values(JOURNAL_NAMES)) {
    const existing = game.journal?.getName?.(name) ?? game.journal?.find?.(j => j.name === name);
    if (existing) continue;
    try {
      await JournalEntry.create({
        name,
        folder: folderId,
        flags:  { [MODULE_ID]: { worldJournalCategory: nameToCategory(name) } },
      });
    } catch (err) {
      console.error(`${MODULE_ID} | worldJournal: failed to create journal ${name}:`, err);
    }
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// WRITE — entries
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Record a lore discovery. Creates a page named after the title; on duplicate
 * titles the existing entry is updated.
 *
 * Manual entries via !journal default to confirmed: false / narratorAsserted:
 * false. !journal lore "title" confirmed sets confirmed: true. The combined
 * detection pass writes narratorAsserted: true, confirmed: false.
 *
 * Empty titles are rejected.
 *
 * @param {string} title
 * @param {Object} entry — partial loreEntry (text, category, sessionId, …)
 * @param {Object} campaignState
 * @returns {Promise<Object|null>} — the persisted entry, or null on failure
 */
export async function recordLoreDiscovery(title, entry, campaignState) {
  const cleanTitle = title?.trim();
  if (!cleanTitle) {
    console.warn(`${MODULE_ID} | worldJournal: recordLoreDiscovery rejected — empty title`);
    return null;
  }

  const journal = await getOrCreateJournal(JOURNAL_NAMES.lore);
  if (!journal) return null;

  const existing = findPageByName(journal, cleanTitle)?.flags?.[MODULE_ID]?.[FLAG_KEYS.lore];
  const now      = new Date().toISOString();

  const data = {
    title:            cleanTitle,
    category:         entry?.category ?? "other",
    text:             entry?.text     ?? "",
    sessionId:        entry?.sessionId ?? campaignState?.currentSessionId ?? "",
    sessionNumber:    entry?.sessionNumber ?? campaignState?.sessionNumber ?? null,
    moveId:           entry?.moveId   ?? null,
    confirmed:        entry?.confirmed === true,
    narratorAsserted: entry?.narratorAsserted === true,
    annotations:      Array.isArray(existing?.annotations) ? existing.annotations : [],
    promotedAt:       existing?.promotedAt ?? (entry?.confirmed === true ? now : null),
    createdAt:        existing?.createdAt ?? now,
    updatedAt:        now,
  };

  await upsertPage(journal, cleanTitle, FLAG_KEYS.lore, data);
  return data;
}

/**
 * Record an active threat. Creates a page named after the threat; on duplicate
 * names the existing entry is updated. Severity changes are appended to the
 * history array so the timeline is preserved.
 *
 * Default severity is "looming" when not specified.
 *
 * @param {string} name
 * @param {Object} entry
 * @param {Object} campaignState
 * @returns {Promise<Object|null>}
 */
export async function recordThreat(name, entry, campaignState) {
  const cleanName = name?.trim();
  if (!cleanName) {
    console.warn(`${MODULE_ID} | worldJournal: recordThreat rejected — empty name`);
    return null;
  }

  const journal = await getOrCreateJournal(JOURNAL_NAMES.threats);
  if (!journal) return null;

  const existing  = findPageByName(journal, cleanName)?.flags?.[MODULE_ID]?.[FLAG_KEYS.threats];
  const now       = new Date().toISOString();
  const severity  = entry?.severity ?? existing?.severity ?? "looming";
  const sessionId = entry?.sessionId ?? campaignState?.currentSessionId ?? "";

  const history = Array.isArray(existing?.history) ? [...existing.history] : [];
  if (existing && existing.severity !== severity) {
    history.push({ sessionId, severity, summary: entry?.summary ?? "" });
  } else if (!existing) {
    history.push({ sessionId, severity, summary: entry?.summary ?? "" });
  }

  const data = {
    name:        cleanName,
    type:        entry?.type ?? existing?.type ?? "other",
    severity,
    summary:     entry?.summary ?? existing?.summary ?? "",
    firstSeen:   existing?.firstSeen ?? sessionId,
    lastUpdated: sessionId,
    history,
    annotations: Array.isArray(existing?.annotations) ? existing.annotations : [],
    createdAt:   existing?.createdAt ?? now,
    updatedAt:   now,
  };

  await upsertPage(journal, cleanName, FLAG_KEYS.threats, data);
  return data;
}

/**
 * Record faction intelligence. Creates a page named after the faction; on
 * duplicate names the existing entry is updated. Each call appends an entry
 * to the encounters array.
 *
 * @param {string} name
 * @param {Object} entry — { attitude, summary, knownGoal, entityId, ... }
 * @param {Object} campaignState
 * @returns {Promise<Object|null>}
 */
export async function recordFactionIntelligence(name, entry, campaignState) {
  const cleanName = name?.trim();
  if (!cleanName) {
    console.warn(`${MODULE_ID} | worldJournal: recordFactionIntelligence rejected — empty name`);
    return null;
  }

  const journal = await getOrCreateJournal(JOURNAL_NAMES.factions);
  if (!journal) return null;

  const existing  = findPageByName(journal, cleanName)?.flags?.[MODULE_ID]?.[FLAG_KEYS.factions];
  const now       = new Date().toISOString();
  const sessionId = entry?.sessionId ?? campaignState?.currentSessionId ?? "";
  const attitude  = entry?.attitude ?? existing?.attitude ?? "unknown";

  const encounters = Array.isArray(existing?.encounters) ? [...existing.encounters] : [];
  encounters.push({
    sessionId,
    summary:        entry?.summary ?? "",
    attitudeAtTime: attitude,
  });

  const data = {
    factionName:  cleanName,
    entityId:     entry?.entityId ?? existing?.entityId ?? null,
    knownGoal:    entry?.knownGoal ?? existing?.knownGoal ?? "",
    attitude,
    encounters,
    annotations:  Array.isArray(existing?.annotations) ? existing.annotations : [],
    createdAt:    existing?.createdAt ?? now,
    updatedAt:    now,
  };

  await upsertPage(journal, cleanName, FLAG_KEYS.factions, data);
  return data;
}

/**
 * Record a location entry. Creates a page named after the location; on
 * duplicate names appends a visit to the existing record.
 *
 * @param {string} name
 * @param {Object} entry — { type, description, status, summary, entityId, ... }
 * @param {Object} campaignState
 * @returns {Promise<Object|null>}
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
    annotations:  Array.isArray(existing?.annotations) ? existing.annotations : [],
    createdAt:    existing?.createdAt ?? now,
    updatedAt:    now,
  };

  await upsertPage(journal, cleanName, FLAG_KEYS.locations, data);
  return data;
}

/**
 * Update a threat's severity. Appends to the history array. If the named
 * threat does not exist this logs a warning and returns null — the function
 * never creates a new threat from this path.
 */
export async function updateThreatSeverity(name, severity, campaignState) {
  const journal = await getOrCreateJournal(JOURNAL_NAMES.threats);
  if (!journal) return null;

  const page = findPageByName(journal, name?.trim() ?? "");
  if (!page) {
    console.warn(`${MODULE_ID} | worldJournal: updateThreatSeverity — no threat named "${name}"`);
    return null;
  }

  const existing = page.flags?.[MODULE_ID]?.[FLAG_KEYS.threats];
  if (!existing) return null;

  const sessionId = campaignState?.currentSessionId ?? "";
  const history   = Array.isArray(existing.history) ? [...existing.history] : [];
  history.push({ sessionId, severity, summary: existing.summary ?? "" });

  const updated = {
    ...existing,
    severity,
    lastUpdated: sessionId,
    history,
    updatedAt:   new Date().toISOString(),
  };
  await page.setFlag(MODULE_ID, FLAG_KEYS.threats, updated);
  return updated;
}

/**
 * Promote a narrator-asserted lore entry to confirmed (canonical). Stamps
 * promotedAt. Does NOT change narratorAsserted — the entry retains its
 * provenance.
 */
export async function promoteLoreToConfirmed(title, _campaignState) {
  const journal = await getOrCreateJournal(JOURNAL_NAMES.lore);
  if (!journal) return null;

  const page = findPageByName(journal, title?.trim() ?? "");
  if (!page) {
    console.warn(`${MODULE_ID} | worldJournal: promoteLoreToConfirmed — no lore titled "${title}"`);
    return null;
  }

  const existing = page.flags?.[MODULE_ID]?.[FLAG_KEYS.lore];
  if (!existing) return null;

  const updated = {
    ...existing,
    confirmed:  true,
    promotedAt: new Date().toISOString(),
    updatedAt:  new Date().toISOString(),
  };
  await page.setFlag(MODULE_ID, FLAG_KEYS.lore, updated);
  return updated;
}

/**
 * Apply a state transition produced by the combined detection pass.
 *
 *   - threat resolved/escalated → updateThreatSeverity
 *   - faction attitudeShift     → recordFactionIntelligence with the new attitude
 *   - lore contradicted         → no state change; posts GM-only chat card
 */
export async function applyStateTransition(transition, campaignState) {
  if (!transition?.entryType) return null;

  switch (transition.entryType) {
    case "threat": {
      if (transition.change === "resolved") {
        return updateThreatSeverity(transition.name, "resolved", campaignState);
      }
      if (transition.change === "escalated") {
        const next = transition.newValue ?? "active";
        return updateThreatSeverity(transition.name, next, campaignState);
      }
      return null;
    }

    case "faction": {
      if (transition.change !== "attitudeShift") return null;
      return recordFactionIntelligence(
        transition.name,
        { attitude: transition.newValue, summary: transition.summary ?? "" },
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

    default:
      return null;
  }
}

/**
 * Append an annotation to any entry. Annotations are author-stamped and
 * append-only.
 *
 * @param {"lore"|"threats"|"factions"|"locations"} journalType
 * @param {string} entryName
 * @param {string} text
 * @param {string} authorName
 * @returns {Promise<Object|null>}
 */
export async function annotateEntry(journalType, entryName, text, authorName, _campaignState) {
  const journalName = JOURNAL_NAMES[journalType];
  const flagKey     = FLAG_KEYS[journalType];
  if (!journalName || !flagKey) return null;

  const journal = await getOrCreateJournal(journalName);
  if (!journal) return null;

  const page = findPageByName(journal, entryName?.trim() ?? "");
  if (!page) return null;

  const existing = page.flags?.[MODULE_ID]?.[flagKey];
  if (!existing) return null;

  const annotation = {
    author: authorName ?? game.user?.name ?? "Unknown",
    text:   text ?? "",
    date:   new Date().toISOString(),
  };

  const annotations = Array.isArray(existing.annotations)
    ? [...existing.annotations, annotation]
    : [annotation];

  const updated = { ...existing, annotations, updatedAt: new Date().toISOString() };
  await page.setFlag(MODULE_ID, flagKey, updated);
  return updated;
}

/**
 * Write a session-log text page summarising the current session. Reads from
 * existing journal flags + chat history; this is a thin Phase 3 placeholder
 * that captures session id, number, and timestamps. Phase 5 will compose a
 * richer page from the chronicle and chat narration.
 *
 * @param {Object} campaignState
 * @returns {Promise<Object|null>} — the created page, or null
 */
export async function writeSessionLog(campaignState) {
  const journal = await getOrCreateJournal(JOURNAL_NAMES.sessionLog);
  if (!journal) return null;

  const sessionId  = campaignState?.currentSessionId ?? "";
  const sessionNum = campaignState?.sessionNumber    ?? null;
  const now        = new Date().toISOString();
  const pageName   = sessionNum ? `Session ${sessionNum} — ${now.slice(0, 10)}` : `Session — ${now}`;

  const headerLines = [
    `<h2>${pageName}</h2>`,
    `<p>Session ID: <code>${sessionId}</code></p>`,
    `<p>Logged at ${now}.</p>`,
  ];

  const recentLore     = readEntries(await getOrCreateJournal(JOURNAL_NAMES.lore),     FLAG_KEYS.lore)
                          .filter(e => e.sessionId === sessionId);
  const recentThreats  = readEntries(await getOrCreateJournal(JOURNAL_NAMES.threats),  FLAG_KEYS.threats)
                          .filter(e => e.lastUpdated === sessionId);

  if (recentLore.length) {
    headerLines.push("<h3>Lore this session</h3><ul>");
    for (const l of recentLore) headerLines.push(`<li>${escapeHtml(l.title)}</li>`);
    headerLines.push("</ul>");
  }
  if (recentThreats.length) {
    headerLines.push("<h3>Threats this session</h3><ul>");
    for (const t of recentThreats) headerLines.push(`<li>${escapeHtml(t.name)} — ${escapeHtml(t.severity)}</li>`);
    headerLines.push("</ul>");
  }

  try {
    const created = await journal.createEmbeddedDocuments("JournalEntryPage", [{
      name:  pageName,
      type:  "text",
      text:  { format: 1, content: headerLines.join("") },
      flags: { [MODULE_ID]: { [FLAG_KEYS.sessionLogPage]: { sessionId, sessionNumber: sessionNum, writtenAt: now } } },
    }]);
    return Array.isArray(created) ? created[0] : created;
  } catch (err) {
    console.error(`${MODULE_ID} | worldJournal: writeSessionLog failed:`, err);
    return null;
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// READ — used by the assembler (Phase 5 will wire these in)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Confirmed lore entries — never dropped from narrator context.
 * Sorted most-recent first by session number, falling back to updatedAt.
 */
export function getConfirmedLore(_campaignState) {
  const journal = findJournal(JOURNAL_NAMES.lore);
  return readEntries(journal, FLAG_KEYS.lore)
    .filter(e => e.confirmed === true)
    .sort(byRecency);
}

/**
 * Narrator-asserted but not yet confirmed lore.
 */
export function getNarratorAssertedLore(_campaignState) {
  const journal = findJournal(JOURNAL_NAMES.lore);
  return readEntries(journal, FLAG_KEYS.lore)
    .filter(e => e.narratorAsserted === true && e.confirmed !== true)
    .sort(byRecency);
}

/**
 * Threats with severity !== "resolved", sorted by severity priority
 * (immediate → active → looming).
 */
export function getActiveThreats(_campaignState) {
  const journal = findJournal(JOURNAL_NAMES.threats);
  return readEntries(journal, FLAG_KEYS.threats)
    .filter(e => e.severity !== "resolved")
    .sort((a, b) => {
      const sa = SEVERITY_ORDER[a.severity] ?? 99;
      const sb = SEVERITY_ORDER[b.severity] ?? 99;
      if (sa !== sb) return sa - sb;
      return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
    });
}

/**
 * Up to 3 factions, most recently updated first.
 */
export function getFactionLandscape(_campaignState) {
  const journal = findJournal(JOURNAL_NAMES.factions);
  return readEntries(journal, FLAG_KEYS.factions)
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
    .slice(0, 3);
}

/**
 * Current-session unconfirmed lore — whatever the narrator established this
 * session that has not yet been promoted.
 */
export function getRecentDiscoveries(campaignState) {
  const sessionId = campaignState?.currentSessionId;
  if (!sessionId) return [];
  const journal = findJournal(JOURNAL_NAMES.lore);
  return readEntries(journal, FLAG_KEYS.lore)
    .filter(e => e.sessionId === sessionId && e.confirmed !== true)
    .sort(byRecency);
}

/**
 * All locations with a known name. Phase 6 surfaces these in the panel.
 */
export function listLocationEntries(_campaignState) {
  const journal = findJournal(JOURNAL_NAMES.locations);
  return readEntries(journal, FLAG_KEYS.locations)
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}


// ─────────────────────────────────────────────────────────────────────────────
// !journal command parsing
// ─────────────────────────────────────────────────────────────────────────────

const COMMAND_PATTERN = /^!journal\s+(\w+)\s+("[^"]+"|\S+)\s+(\S+)(?:\s+[—-]\s*(.+))?$/i;

const VALID_TYPES = new Set(["faction", "location", "lore", "threat"]);

/**
 * Parse a !journal chat command into a structured action.
 *
 * Forms (per scope §9):
 *   !journal faction "Name" attitude — summary
 *   !journal location "Name" type — description
 *   !journal lore "Title" confirmed|rumour — text
 *   !journal threat "Name" severity — summary
 *
 * Returns null for unknown types or unparseable commands. The em-dash
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

    case "lore":
      return recordLoreDiscovery(parsed.name, {
        text:             parsed.text,
        confirmed:        parsed.qualifier === "confirmed",
        narratorAsserted: false,
        sessionId,
        sessionNumber:    sessionNum,
      }, campaignState);

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

function findJournal(name) {
  if (!globalThis.game?.journal) return null;
  return game.journal.getName?.(name)
      ?? game.journal.find?.(j => j.name === name)
      ?? null;
}

async function getOrCreateJournal(name) {
  let journal = findJournal(name);
  if (journal) return journal;
  if (!game.user?.isGM) return null;
  try {
    journal = await JournalEntry.create({
      name,
      flags: { [MODULE_ID]: { worldJournalCategory: nameToCategory(name) } },
    });
    return journal ?? null;
  } catch (err) {
    console.error(`${MODULE_ID} | worldJournal: getOrCreateJournal(${name}) failed:`, err);
    return null;
  }
}

function findPageByName(journal, pageName) {
  return journal?.pages?.contents?.find(p => p.name === pageName) ?? null;
}

async function upsertPage(journal, pageName, flagKey, data) {
  const existing = findPageByName(journal, pageName);
  if (existing) {
    await existing.setFlag(MODULE_ID, flagKey, data);
    return existing;
  }
  try {
    const created = await journal.createEmbeddedDocuments("JournalEntryPage", [{
      name:  pageName,
      type:  "text",
      flags: { [MODULE_ID]: { [flagKey]: data } },
    }]);
    return Array.isArray(created) ? created[0] : created;
  } catch (err) {
    console.error(`${MODULE_ID} | worldJournal: upsertPage(${pageName}) failed:`, err);
    return null;
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

  const name   = escapeHtml(transition.name ?? "(unknown)");
  const detail = escapeHtml(transition.summary ?? transition.newValue ?? "");
  const html =
    `<div class="sf-wj-contradiction"><div class="sf-wj-contradiction-label">◈ Narrative Review</div>` +
    `<p>The narrator may have contradicted an established fact.</p>` +
    `<p><strong>${name}</strong>${detail ? ` — ${detail}` : ""}</p></div>`;

  try {
    await ChatMessage.create({
      content:  html,
      whisper:  game.users?.filter ? game.users.filter(u => u.isGM).map(u => u.id) : [],
      flags:    { [MODULE_ID]: { worldJournalContradiction: true } },
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
