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
    // Fact-continuity fields (issue #227 (Fact Continuity) §4.4). Optional;
    // null for entries that did not originate from a scene-truth migration.
    subject:          entry?.subject ?? existing?.subject ?? null,
    fact:             entry?.fact    ?? existing?.fact    ?? null,
    sceneId:          entry?.sceneId ?? existing?.sceneId ?? null,
    createdAt:        existing?.createdAt ?? now,
    updatedAt:        now,
  };

  const page = await upsertPage(journal, cleanTitle, FLAG_KEYS.lore, data);
  return page ? { ...data, pageId: page.id, journalId: journal.id } : null;
}

/**
 * Archive a scene-end fact-continuity truth (free-text or scene-scoped) to
 * the WJ Lore journal. See issue #227 (Fact Continuity) §9.2 step 2.
 *
 * Composes a synthetic page title:
 *   - scene subjects → "Scene <sceneId>: <fact>"
 *   - text  subjects → "<subject>: <fact>"
 *
 * Returns the recordLoreDiscovery result, or null if the truth has no fact
 * or no resolvable subject.
 *
 * @param {Object} truth — sceneTruths entry from campaignState
 * @param {Object} campaignState
 * @returns {Promise<Object|null>}
 */
export async function archiveSceneTruth(truth, campaignState) {
  const fact = String(truth?.fact ?? '').trim();
  if (!fact) return null;
  const subject = truth?.subject;
  if (!subject || typeof subject !== 'object') return null;

  let subjectLabel = '';
  let subjectKey   = '';
  if (subject.kind === 'scene') {
    subjectLabel = `Scene ${truth.sceneId ?? subject.sceneId ?? ''}`.trim();
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
  }, campaignState);
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
 * @returns {Promise<Object|null>} — the entry data enriched with {pageId, journalId}, or null on failure
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

  const page = await upsertPage(journal, cleanName, FLAG_KEYS.threats, data);
  return page ? { ...data, pageId: page.id, journalId: journal.id } : null;
}

/**
 * Record faction intelligence. Creates a page named after the faction; on
 * duplicate names the existing entry is updated. Each call appends an entry
 * to the encounters array.
 *
 * @param {string} name
 * @param {Object} entry — { attitude, summary, knownGoal, entityId, ... }
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

  // Entity-record sync (FACTION-ATTITUDE-SPLIT-BRAIN / FACTION-DUAL-STORE,
  // 2026-07): when a faction entity record exists, it is the canonical
  // stance home — every WJ attitude write (detection transitions, !journal,
  // auto-surface) maps onto record.relationship, and the WJ entry backlinks
  // the record via entityId. The WJ entry remains the intelligence log.
  // Fail-open: a sync failure never blocks the journal write.
  let linkedEntityId = entry?.entityId ?? existing?.entityId ?? null;
  try {
    const { findFactionByName, applyAttitudeToFactionRecord } = await import("../entities/faction.js");
    const hit = findFactionByName(cleanName, campaignState);
    if (hit) {
      linkedEntityId = linkedEntityId ?? hit.id;
      if (attitude !== "unknown") {
        await applyAttitudeToFactionRecord(cleanName, attitude, campaignState);
      }
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | worldJournal: faction record sync failed:`, err?.message ?? err);
  }

  const data = {
    factionName:  cleanName,
    entityId:     linkedEntityId,
    knownGoal:    entry?.knownGoal ?? existing?.knownGoal ?? "",
    attitude,
    encounters,
    annotations:  Array.isArray(existing?.annotations) ? existing.annotations : [],
    createdAt:    existing?.createdAt ?? now,
    updatedAt:    now,
  };

  const page = await upsertPage(journal, cleanName, FLAG_KEYS.factions, data);
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
    annotations:  Array.isArray(existing?.annotations) ? existing.annotations : [],
    createdAt:    existing?.createdAt ?? now,
    updatedAt:    now,
  };

  const page = await upsertPage(journal, cleanName, FLAG_KEYS.locations, data);
  return page ? { ...data, pageId: page.id, journalId: journal.id } : null;
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
    // Not a warning: the detector may reference a danger that was never
    // recorded as a threat. The detection prompt now discourages this, but a
    // stray transition is harmless — we just have nothing to update. Debug so
    // it stops spamming the error log during play.
    console.debug?.(`${MODULE_ID} | worldJournal: updateThreatSeverity — no recorded threat named "${name}"; skipping`);
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

// ─────────────────────────────────────────────────────────────────────────────
// SESSION LOG — one running page per session (D7 / F18)
//
// A single page per session accumulates transient scene beats during play
// (the "Scene log" — below-salience lore/threat items routed here by the
// detector instead of spawning a World Journal entry each, see
// docs/testing/v1.6.1-playtest-findings.md F17/F18) and gains a "Session
// summary" section at End Session (the durable lore/threats recorded this
// session). The page is matched on its sessionId flag so every append within a
// session lands on the same page regardless of the date-derived name.
// ─────────────────────────────────────────────────────────────────────────────

function sessionLogAutoWriteEnabled() {
  try   { return game.settings?.get(MODULE_ID, "sessionLogAutoWrite") !== false; }
  catch { return true; }
}

function findSessionLogPage(journal, sessionId) {
  return (journal?.pages?.contents ?? []).find(
    p => p?.flags?.[MODULE_ID]?.[FLAG_KEYS.sessionLogPage]?.sessionId === sessionId,
  ) ?? null;
}

/**
 * Render the running session-log page body from its flag: a "Scene log" list of
 * transient beats appended during play, plus an optional "Session summary"
 * section written at End Session.
 *
 * @param {Object} flag — the sessionLogPage flag
 * @returns {string} HTML
 */
function renderSessionLogContent(flag) {
  const lines = [
    `<h2>${escapeHtml(flag.pageName)}</h2>`,
    `<p>Session ID: <code>${escapeHtml(flag.sessionId || "—")}</code></p>`,
    `<h3>Scene log</h3>`,
  ];

  const beats = Array.isArray(flag.beats) ? flag.beats : [];
  if (beats.length) {
    lines.push("<ul>");
    for (const b of beats) {
      const label = b.kind === "threat" ? "Threat" : "Lore";
      const text  = b.text ? ` — ${escapeHtml(b.text)}` : "";
      lines.push(`<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(b.title)}${text}</li>`);
    }
    lines.push("</ul>");
  } else {
    lines.push("<p><em>No scene beats recorded yet.</em></p>");
  }

  const summary = flag.summary;
  const hasNarrative = !!(summary && typeof summary.narrative === "string" && summary.narrative.trim());
  if (summary && (hasNarrative || summary.lore?.length || summary.threats?.length)) {
    lines.push("<h3>Session summary</h3>");
    if (hasNarrative) {
      lines.push("<h4>Story so far</h4>");
      for (const p of summary.narrative.trim().split(/\n\n+/)) {
        lines.push(`<p>${escapeHtml(p.trim())}</p>`);
      }
    }
    if (summary.lore?.length) {
      lines.push("<h4>Lore this session</h4><ul>");
      for (const t of summary.lore) lines.push(`<li>${escapeHtml(t)}</li>`);
      lines.push("</ul>");
    }
    if (summary.threats?.length) {
      lines.push("<h4>Threats this session</h4><ul>");
      for (const t of summary.threats) lines.push(`<li>${escapeHtml(t.name)} — ${escapeHtml(t.severity)}</li>`);
      lines.push("</ul>");
    }
  }
  return lines.join("");
}

/**
 * Find or create the running session-log page for the current session.
 * @returns {Promise<{page:Object, flag:Object}|null>}
 */
async function getOrCreateSessionLogPage(campaignState) {
  const journal = await getOrCreateJournal(JOURNAL_NAMES.sessionLog);
  if (!journal) return null;

  const sessionId  = campaignState?.currentSessionId ?? "";
  const existing   = findSessionLogPage(journal, sessionId);
  if (existing) {
    return { page: existing, flag: { ...existing.flags[MODULE_ID][FLAG_KEYS.sessionLogPage] } };
  }

  const sessionNum = campaignState?.sessionNumber ?? null;
  const now        = new Date().toISOString();
  const pageName   = sessionNum ? `Session ${sessionNum} — ${now.slice(0, 10)}` : `Session — ${now}`;
  const flag = {
    sessionId, sessionNumber: sessionNum, pageName,
    createdAt: now, updatedAt: now, beats: [], summary: null,
  };

  try {
    const created = await journal.createEmbeddedDocuments("JournalEntryPage", [{
      name:  pageName,
      type:  "text",
      text:  { format: 1, content: renderSessionLogContent(flag) },
      flags: { [MODULE_ID]: { [FLAG_KEYS.sessionLogPage]: flag } },
    }]);
    const page = Array.isArray(created) ? created[0] : created;
    return page ? { page, flag } : null;
  } catch (err) {
    console.error(`${MODULE_ID} | worldJournal: getOrCreateSessionLogPage failed:`, err);
    return null;
  }
}

async function persistSessionLogPage(page, flag) {
  flag.updatedAt = new Date().toISOString();
  try {
    await page.update({ text: { format: 1, content: renderSessionLogContent(flag) } });
    await page.setFlag(MODULE_ID, FLAG_KEYS.sessionLogPage, flag);
    return page;
  } catch (err) {
    console.warn(`${MODULE_ID} | worldJournal: session-log persist failed:`, err);
    return null;
  }
}

/**
 * Append a transient scene beat to the running session-log page (D7). Below-
 * salience lore/threat items route here instead of spawning a World Journal
 * entry each. Gated on sessionLogAutoWrite; GM-only (journal writes need a
 * permitted client — getOrCreateJournal returns null for players).
 *
 * @param {Object} campaignState
 * @param {{kind:"lore"|"threat", title:string, text?:string}} beat
 * @returns {Promise<Object|null>} the page, or null if skipped
 */
export async function appendSessionLogBeat(campaignState, beat) {
  if (!beat?.title) return null;
  if (!sessionLogAutoWriteEnabled()) return null;

  const ctx = await getOrCreateSessionLogPage(campaignState);
  if (!ctx) return null;

  const { page, flag } = ctx;
  flag.beats = Array.isArray(flag.beats) ? [...flag.beats] : [];
  flag.beats.push({
    kind:  beat.kind === "threat" ? "threat" : "lore",
    title: String(beat.title),
    text:  beat.text ? String(beat.text) : "",
    at:    new Date().toISOString(),
  });
  return persistSessionLogPage(page, flag);
}

/**
 * Write the End-Session summary onto the running session-log page (F18 + D7).
 * Fills the "Session summary" section (durable lore + threats recorded this
 * session) on the same page the scene log was appended to during play, creating
 * the page if the session produced no transient beats.
 *
 * @param {Object} campaignState
 * @returns {Promise<Object|null>} — the page, or null
 */
export async function writeSessionLog(campaignState) {
  const ctx = await getOrCreateSessionLogPage(campaignState);
  if (!ctx) return null;

  const { page, flag } = ctx;
  const sessionId = campaignState?.currentSessionId ?? "";

  const recentLore    = readEntries(await getOrCreateJournal(JOURNAL_NAMES.lore),    FLAG_KEYS.lore)
                         .filter(e => e.sessionId === sessionId);
  const recentThreats = readEntries(await getOrCreateJournal(JOURNAL_NAMES.threats), FLAG_KEYS.threats)
                         .filter(e => e.lastUpdated === sessionId);

  // The rolling narrative summary (architecture §8.6), finalised by the End
  // Session flow before this write. Only adopt it when it belongs to this
  // session so a stale prior-session summary never leaks onto the page.
  const narrative = (campaignState?.sessionSummary?.sessionId === sessionId)
    ? (campaignState.sessionSummary.text ?? "")
    : "";

  flag.summary = {
    narrative,
    lore:      recentLore.map(l => l.title),
    threats:   recentThreats.map(t => ({ name: t.name, severity: t.severity })),
    writtenAt: new Date().toISOString(),
  };
  return persistSessionLogPage(page, flag);
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
 * A single WJ faction entry by name (case-insensitive page match), or null.
 * Used by the draft-confirm path to reconcile pre-record intelligence onto
 * a freshly created faction entity record (FACTION-DUAL-STORE, 2026-07).
 */
export function getFactionEntry(name) {
  const cleanName = String(name ?? "").trim();
  if (!cleanName) return null;
  const journal = findJournal(JOURNAL_NAMES.factions);
  return findPageByName(journal, cleanName)?.flags?.[MODULE_ID]?.[FLAG_KEYS.factions] ?? null;
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
      return (body ? p(body) : "") +
        (data.confirmed ? "<p><em>Confirmed.</em></p>"
         : data.narratorAsserted ? "<p><em>Pending confirmation.</em></p>" : "");
    }
    case FLAG_KEYS.threats:
      return meta("Severity", data.severity) + (data.summary ? p(data.summary) : "");
    case FLAG_KEYS.factions:
      return meta("Attitude", data.attitude) + (data.knownGoal ? p(data.knownGoal) : "");
    case FLAG_KEYS.locations:
      return meta("Type", data.type) + meta("Status", data.status) +
        (data.description ? p(data.description) : "");
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

  const name   = escapeHtml(transition.name ?? "(unknown)");
  const detail = escapeHtml(transition.summary ?? transition.newValue ?? "");
  const isFactContinuity = transition.entryType === "factContinuity";

  // Kind-aware remedy (NARRCHK-REMEDY-MISMATCH, 2026-07): the correction
  // dialog only fixes scene truths/state — for the other audit kinds the
  // remedy lives elsewhere, so point the GM at the right tool instead of a
  // dialog that cannot address the flag.
  const kind = String(transition.kind ?? "truth").toLowerCase();
  const REMEDY_HINTS = {
    frame:      "The scene frame refreshes with the next narration — nudge with <code>@scene</code> (or <code>!scene start</code>) if it stays stale.",
    ship:       "Ship position lives on the ship record — correct it with <code>!ship</code> or by moving the command-vehicle token.",
    identity:   "Recorded pronouns live on the character sheet / connection record — fix them there (entity panel or sheet).",
    retraction: "Re-asserting a retracted fact is already blocked at the ledger — no correction needed. Use Replace in the correction dialog if the fact should genuinely change.",
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
