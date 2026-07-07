/**
 * STARFORGED COMPANION
 * src/pacing/telemetry.js — Pacing classifier decision log
 *
 * Every classifier decision is recorded so dials can be tuned from real
 * play data. Telemetry lives in a JournalEntry under the existing
 * "Starforged Companion" folder so it co-locates with the World Journal.
 * One page per session keeps the journal navigable.
 *
 * The journal is created on first write — players never see it surface
 * unless they look for it. Writes are GM-gated (world-scoped); player
 * clients short-circuit and rely on the GM client to record decisions.
 */

import { FOLDER_NAME } from "../world/worldJournal.js";

const MODULE_ID = "starforged-companion";
const JOURNAL_NAME = "Pacing Telemetry";
const FLAG_KEY = "pacingTelemetry";

// Cap one session's log at this many entries to keep the page light.
const MAX_ENTRIES_PER_SESSION = 200;


/**
 * Record one classifier decision. Best-effort — never throws to the caller.
 *
 * @param {Object} entry
 * @param {string} entry.playerText
 * @param {string} entry.decision
 * @param {string|null} entry.suggestedMove
 * @param {string} entry.category
 * @param {number} entry.confidence
 * @param {string} entry.reasoning
 * @param {boolean} [entry.fallback]
 * @param {string|null} [entry.sessionId]
 * @param {number|null} [entry.sessionNumber]
 * @returns {Promise<void>}
 */
export async function logPacingDecision(entry) {
  if (!globalThis.game?.user?.isGM) return;            // world-scoped writes only
  if (!globalThis.JournalEntry) return;                 // not in a Foundry context

  try {
    const journal = await getOrCreateJournal();
    if (!journal) return;

    const sessionNumber = entry.sessionNumber ?? 0;
    const pageName = sessionNumber > 0 ? `Session ${sessionNumber}` : "Pre-session";

    const existing = journal.pages?.contents?.find(p => p.name === pageName) ?? null;

    const record = {
      ts:            new Date().toISOString(),
      text:          truncate(entry.playerText ?? "", 200),
      decision:      entry.decision,
      suggestedMove: entry.suggestedMove ?? null,
      category:      entry.category,
      confidence:    typeof entry.confidence === "number" ? Number(entry.confidence.toFixed(2)) : null,
      reasoning:     truncate(entry.reasoning ?? "", 200),
      fallback:      !!entry.fallback,
      sessionId:     entry.sessionId ?? null,
    };

    if (existing) {
      const prev = existing.getFlag(MODULE_ID, FLAG_KEY) ?? { entries: [] };
      const entries = Array.isArray(prev.entries) ? prev.entries : [];
      entries.push(record);
      while (entries.length > MAX_ENTRIES_PER_SESSION) entries.shift();
      await existing.setFlag(MODULE_ID, FLAG_KEY, { entries, sessionNumber, sessionId: entry.sessionId ?? null });
      // Mirror to page content for human review.
      await existing.update({ "text.content": renderHtml(entries, pageName) }).catch(() => {});
    } else {
      const entries = [record];
      await journal.createEmbeddedDocuments("JournalEntryPage", [{
        name:  pageName,
        type:  "text",
        text:  { content: renderHtml(entries, pageName), format: 1 },
        flags: { [MODULE_ID]: { [FLAG_KEY]: { entries, sessionNumber, sessionId: entry.sessionId ?? null } } },
      }]);
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | pacing telemetry: write failed:`, err);
  }
}

/**
 * Append a fact-continuity consistency-check decision to the
 * "Consistency Check" page on the existing Pacing Telemetry journal.
 * Reuses the journal so all post-narration telemetry sits together
 * (fact-continuity scope §17 Phase E item 32). Writes are GM-gated and
 * best-effort.
 *
 * @param {Object} entry
 * @param {string} entry.sceneId
 * @param {string|null} entry.sessionId
 * @param {number|null} [entry.sessionNumber]
 * @param {string} entry.prose          — narrator prose (truncated to 200)
 * @param {Array}  entry.contradictions — full audit result from the Haiku call
 * @param {number} [entry.elapsedMs]
 * @param {boolean} [entry.dispatched]  — true when ≥1 high-confidence routed
 * @returns {Promise<void>}
 */
export async function logConsistencyDecision(entry) {
  if (!globalThis.game?.user?.isGM) return;
  if (!globalThis.JournalEntry) return;

  try {
    const journal = await getOrCreateJournal();
    if (!journal) return;

    const pageName = "Consistency Check";
    const existing = journal.pages?.contents?.find(p => p.name === pageName) ?? null;

    const record = {
      ts:             new Date().toISOString(),
      sceneId:        entry.sceneId ?? null,
      sessionId:      entry.sessionId ?? null,
      prose:          truncate(entry.prose ?? "", 200),
      contradictions: Array.isArray(entry.contradictions) ? entry.contradictions : [],
      elapsedMs:      typeof entry.elapsedMs === "number" ? entry.elapsedMs : null,
      dispatched:     !!entry.dispatched,
    };

    if (existing) {
      const prev    = existing.getFlag(MODULE_ID, "consistencyCheckTelemetry") ?? { entries: [] };
      const entries = Array.isArray(prev.entries) ? prev.entries : [];
      entries.push(record);
      while (entries.length > MAX_ENTRIES_PER_SESSION) entries.shift();
      await existing.setFlag(MODULE_ID, "consistencyCheckTelemetry", { entries });
      await existing.update({ "text.content": renderConsistencyHtml(entries) }).catch(() => {});
    } else {
      const entries = [record];
      await journal.createEmbeddedDocuments("JournalEntryPage", [{
        name:  pageName,
        type:  "text",
        text:  { content: renderConsistencyHtml(entries), format: 1 },
        flags: { [MODULE_ID]: { consistencyCheckTelemetry: { entries } } },
      }]);
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | consistency telemetry: write failed:`, err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function findJournal() {
  if (!globalThis.game?.journal) return null;
  return game.journal.getName?.(JOURNAL_NAME)
      ?? game.journal.find?.(j => j.name === JOURNAL_NAME)
      ?? null;
}

async function getOrCreateJournal() {
  let journal = findJournal();
  if (journal) return journal;

  let folderId = null;
  try {
    const folder = game.folders?.find(f => f.type === "JournalEntry" && f.name === FOLDER_NAME);
    folderId = folder?.id ?? null;
  } catch {
    folderId = null;
  }

  try {
    journal = await JournalEntry.create({
      name:   JOURNAL_NAME,
      folder: folderId,
      flags:  { [MODULE_ID]: { pacingTelemetryRoot: true } },
    });
    return journal ?? null;
  } catch (err) {
    console.warn(`${MODULE_ID} | pacing telemetry: create journal failed:`, err);
    return null;
  }
}

function truncate(s, max) {
  const str = String(s ?? "");
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

function renderHtml(entries, label) {
  const rows = entries.slice(-50).reverse().map(e => {
    const time = e.ts ? new Date(e.ts).toLocaleTimeString() : "—";
    const conf = e.confidence != null ? `${(e.confidence * 100).toFixed(0)}%` : "—";
    const fbk  = e.fallback ? " <em>(fallback)</em>" : "";
    const sm   = e.suggestedMove ? ` → ${escapeHtml(e.suggestedMove)}` : "";
    return `<tr><td>${time}</td><td><code>${escapeHtml(e.decision)}</code>${fbk}</td><td>${escapeHtml(e.category)}</td><td>${conf}</td><td>${escapeHtml(e.text)}${sm}</td></tr>`;
  }).join("");
  return [
    `<h2>Pacing Telemetry — ${escapeHtml(label)}</h2>`,
    `<p>Most recent ${Math.min(50, entries.length)} of ${entries.length} decisions.</p>`,
    `<table><thead><tr><th>Time</th><th>Decision</th><th>Category</th><th>Conf.</th><th>Input → Move</th></tr></thead>`,
    `<tbody>${rows}</tbody></table>`,
  ].join("");
}

function renderConsistencyHtml(entries) {
  const rows = entries.slice(-50).reverse().map(e => {
    const time   = e.ts ? new Date(e.ts).toLocaleTimeString() : "—";
    const high   = (e.contradictions ?? []).filter(c => c.confidence === "high").length;
    const total  = (e.contradictions ?? []).length;
    const flags  = `${high} high / ${total} total`;
    const proseExcerpt = escapeHtml(e.prose ?? "");
    return `<tr><td>${time}</td><td>${escapeHtml(e.sceneId ?? "—")}</td><td>${flags}</td><td>${e.dispatched ? "✓" : ""}</td><td>${proseExcerpt}</td></tr>`;
  }).join("");
  return [
    `<h2>Consistency Check Telemetry</h2>`,
    `<p>Most recent ${Math.min(50, entries.length)} of ${entries.length} audit passes.</p>`,
    `<table><thead><tr><th>Time</th><th>Scene</th><th>Contradictions</th><th>Routed</th><th>Prose excerpt</th></tr></thead>`,
    `<tbody>${rows}</tbody></table>`,
  ].join("");
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
