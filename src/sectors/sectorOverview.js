/**
 * STARFORGED COMPANION
 * src/sectors/sectorOverview.js — Sector-record JournalEntry overview helpers
 *
 * After Phase 3 of the Entity → Actor Migration the sector-record journal
 * has a single overview page; the per-settlement detail pages are gone and
 * the overview's settlements list renders as `@UUID[Actor.<id>]{Name}`
 * document links so it stays in sync with the settlement Actor. This file
 * exposes:
 *
 *   - buildSettlementsListHtml(sector, settlementsByGenId)
 *       Renders the `<ul>` for the overview's Settlements section. Wrapped
 *       in HTML-comment markers so rewriteSectorOverviewSettlements can
 *       find and replace just that section on a live update without
 *       touching the narrator stub.
 *
 *   - rewriteSectorOverviewSettlements(sectorId, campaignState)
 *       Looks up the sector entry, finds the sectorRecord JournalEntry,
 *       resolves each gen-side settlement id to its Actor (via the
 *       sector's entityJournalIds map post-migration), and replaces the
 *       overview's settlements list in place.
 *
 *   - cleanupSectorRecordPages(sectorId)
 *       Deletes every embedded page on the sector-record journal except
 *       the overview. Used by the migrator's sector-rewrite step.
 *
 *   - registerSectorOverviewSync()
 *       Hooks updateActor with a per-sector debounced re-render. Fires
 *       only when the diff touches a field the overview renders.
 *
 * Design rationale: see issue #228 (Entity → Actor Migration) §3.6.
 */

const MODULE_ID = "starforged-companion";
const RERENDER_DEBOUNCE_MS = 500;

// Markers wrap the settlements list inside the overview's HTML content so
// rewriteSectorOverviewSettlements can find the section without parsing the
// surrounding narrator stub. Older sectors written before this marker
// existed: the rewrite still works via a fallback regex.
const SETTLEMENTS_MARK_OPEN  = "<!-- sf:settlements-list -->";
const SETTLEMENTS_MARK_CLOSE = "<!-- /sf:settlements-list -->";

const LOCATION_TYPE_LABELS = {
  orbital:    "Orbital",
  planetside: "Planetside",
  deep_space: "Deep Space",
};

function locationTypeToLabel(locationType) {
  return LOCATION_TYPE_LABELS[locationType] ?? "Deep Space";
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Render the wrapped `<ul>` for a sector overview's Settlements list.
 *
 * @param {Object} sector  has `.settlements[]` (gen-side, with id/name/
 *   locationType/population/authority)
 * @param {Object<string, ClientDocument>} settlementsByGenId  gen-side id →
 *   settlement Actor (if migrated). When an entry is missing the row falls
 *   back to a plain `<li>` without a UUID link.
 * @returns {string}
 */
export function buildSettlementsListHtml(sector, settlementsByGenId = {}) {
  const items = (sector?.settlements ?? []).map(s => {
    const actor = settlementsByGenId?.[s.id];
    const tail  = `${escapeHtml(locationTypeToLabel(s.locationType))}, ` +
                  `Pop: ${escapeHtml(s.population ?? "")}, ` +
                  `Authority: ${escapeHtml(s.authority ?? "")}`;
    const head  = actor?.id
      ? `@UUID[Actor.${actor.id}]{${escapeHtml(actor.name ?? s.name)}}`
      : escapeHtml(s.name);
    return `<li>${head} — ${tail}</li>`;
  }).join("");
  return `${SETTLEMENTS_MARK_OPEN}<ul>${items}</ul>${SETTLEMENTS_MARK_CLOSE}`;
}

/**
 * Replace the settlements `<ul>` inside the sector-record overview's content
 * without disturbing the narrator stub or the passages summary.
 *
 * Two replacement strategies:
 *   1. Marker comments (new sectors + post-Phase-3.5 rewrites)
 *   2. Heuristic <h3>Settlements</h3> followed by the next </ul>
 *
 * Both leave the rest of the page untouched.
 *
 * @param {string} sectorId
 * @param {Object} campaignState
 * @returns {Promise<boolean>}  true if the page was updated
 */
export async function rewriteSectorOverviewSettlements(sectorId, campaignState) {
  const sector = (campaignState?.sectors ?? []).find(s => s.id === sectorId);
  if (!sector) return false;

  const journal = findSectorRecordJournal(sectorId);
  if (!journal) return false;

  const page = findOverviewPage(journal, sector);
  if (!page) return false;

  const settlementsByGenId = resolveSettlementsByGenId(sector);
  const newList = buildSettlementsListHtml(sector, settlementsByGenId);

  const currentContent = page.text?.content ?? "";
  const updated = replaceSettlementsBlock(currentContent, newList);
  if (updated === currentContent) return false;

  try {
    await page.update({ "text.content": updated });
    return true;
  } catch (err) {
    console.error(`${MODULE_ID} | sectorOverview: page.update failed for ${page.id}:`, err);
    return false;
  }
}

/**
 * Delete every embedded JournalEntryPage on the sector-record journal except
 * the overview (the page whose name matches the sector name, or the first
 * page if no name match is found). Used by the migrator's sector-rewrite
 * step to clean up legacy per-settlement pages.
 *
 * @param {string} sectorId
 * @param {Object} campaignState
 * @returns {Promise<number>}  count of pages deleted
 */
export async function cleanupSectorRecordPages(sectorId, campaignState) {
  const sector  = (campaignState?.sectors ?? []).find(s => s.id === sectorId);
  const journal = findSectorRecordJournal(sectorId);
  if (!journal) return 0;

  const overview = findOverviewPage(journal, sector);
  if (!overview) return 0;

  const others = (journal.pages?.contents ?? []).filter(p => p.id !== overview.id);
  let deleted = 0;
  for (const p of others) {
    try {
      await p.delete?.();
      deleted += 1;
    } catch (err) {
      console.error(`${MODULE_ID} | sectorOverview: page.delete failed for ${p.id}:`, err);
    }
  }
  return deleted;
}

// ─────────────────────────────────────────────────────────────────────────────
// Live updateActor hook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Foundry hook handler — registered once at module ready. Watches every
 * `updateActor` and, when the diff touches a field the sector overview
 * renders, schedules a per-sector debounced rewrite.
 */
const _pending = new Map();   // sectorId → setTimeout handle

function scheduleRewrite(sectorId) {
  if (!sectorId) return;
  if (_pending.has(sectorId)) {
    clearTimeout(_pending.get(sectorId));
  }
  const handle = setTimeout(async () => {
    _pending.delete(sectorId);
    try {
      const state = globalThis.game?.settings?.get?.(MODULE_ID, "campaignState") ?? {};
      await rewriteSectorOverviewSettlements(sectorId, state);
    } catch (err) {
      console.error(`${MODULE_ID} | sectorOverview: debounced rewrite failed:`, err);
    }
  }, RERENDER_DEBOUNCE_MS);
  _pending.set(sectorId, handle);
}

/**
 * Diff guard — only fields the overview displays should trigger a rewrite.
 * Mirrors the RENDERED_KEYS set from issue #228 (Entity → Actor Migration) §3.6.
 */
function diffTouchesOverview(changes) {
  if (!changes) return false;
  if ("name" in changes) return true;
  if (changes.system && ("subtype" in changes.system || "klass" in changes.system)) return true;
  const flagBlock = changes.flags?.[MODULE_ID];
  if (flagBlock) {
    for (const typeKey of ["settlement", "planet", "location"]) {
      const block = flagBlock[typeKey];
      if (!block || typeof block !== "object") continue;
      // Population / authority / location-class show up on the overview row.
      if ("name" in block || "population" in block || "authority" in block || "location" in block) return true;
    }
  }
  return false;
}

function actorSectorId(actor) {
  const flags = actor?.flags?.[MODULE_ID];
  if (!flags) return null;
  return flags.settlement?.sectorId ?? flags.planet?.sectorId ?? flags.location?.sectorId ?? null;
}

export function registerSectorOverviewSync() {
  if (typeof Hooks?.on !== "function") return;
  Hooks.on("updateActor", (actor, changes) => {
    try {
      if (!actor || actor.type !== "location") return;
      if (!diffTouchesOverview(changes)) return;
      const sectorId = actorSectorId(actor);
      if (sectorId) scheduleRewrite(sectorId);
    } catch (err) {
      console.warn(`${MODULE_ID} | sectorOverview: updateActor handler threw:`, err);
    }
  });
}

// Exposed for tests: drain any pending debounce timers synchronously.
export async function _flushPendingRewrites() {
  const ids = [...new Set(_pending.keys())];
  for (const id of ids) clearTimeout(_pending.get(id));
  _pending.clear();
  const state = globalThis.game?.settings?.get?.(MODULE_ID, "campaignState") ?? {};
  for (const id of ids) {
    try { await rewriteSectorOverviewSettlements(id, state); }
    catch (err) { console.error(`${MODULE_ID} | sectorOverview: flush failed:`, err); }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function findSectorRecordJournal(sectorId) {
  const journals = globalThis.game?.journal;
  if (!journals) return null;
  if (typeof journals.find === "function") {
    return journals.find(j => j?.flags?.[MODULE_ID]?.sectorRecord && j.flags[MODULE_ID].sectorId === sectorId) ?? null;
  }
  for (const j of journals) {
    if (j?.flags?.[MODULE_ID]?.sectorRecord && j.flags[MODULE_ID].sectorId === sectorId) return j;
  }
  return null;
}

function findOverviewPage(journal, sector) {
  const pages = journal?.pages?.contents ?? [];
  if (!pages.length) return null;
  if (sector?.name) {
    const named = pages.find(p => p.name === sector.name);
    if (named) return named;
  }
  return pages[0];
}

/**
 * Resolve the gen-side settlement id → Actor map for an existing sector.
 * Reads `sector.entityJournalIds` (a `{ genId: hostDocumentId }` map written
 * by storeSector). If the host id is a legacy journal that's been tagged
 * with `flags[MODULE].migrated.toActorId`, the migrated actor id is used.
 */
function resolveSettlementsByGenId(sector) {
  const out = {};
  const map = sector?.entityJournalIds ?? {};
  for (const [genId, hostId] of Object.entries(map)) {
    if (!hostId) continue;
    let actor = globalThis.game?.actors?.get?.(hostId) ?? null;
    if (!actor) {
      // Possibly a legacy journal id awaiting cleanup — follow the migrated
      // pointer.
      const journal = globalThis.game?.journal?.get?.(hostId) ?? null;
      const toActorId = journal?.flags?.[MODULE_ID]?.migrated?.toActorId ?? null;
      if (toActorId) actor = globalThis.game?.actors?.get?.(toActorId) ?? null;
    }
    if (actor?.id) out[genId] = actor;
  }
  return out;
}

function replaceSettlementsBlock(content, newBlock) {
  const open  = SETTLEMENTS_MARK_OPEN;
  const close = SETTLEMENTS_MARK_CLOSE;
  const oStart = content.indexOf(open);
  const cStart = content.indexOf(close);
  if (oStart !== -1 && cStart !== -1 && cStart > oStart) {
    const before = content.slice(0, oStart);
    const after  = content.slice(cStart + close.length);
    return `${before}${newBlock}${after}`;
  }
  // Heuristic fallback — find the <h3>Settlements</h3> heading and replace
  // the immediately-following <ul>...</ul>. We DO NOT touch the heading itself.
  const heading = /<h3>\s*Settlements\s*<\/h3>\s*/i;
  const m = heading.exec(content);
  if (!m) return content;
  const afterHeading = m.index + m[0].length;
  const ulMatch = /<ul[^>]*>[\s\S]*?<\/ul>/i.exec(content.slice(afterHeading));
  if (!ulMatch) return content;
  const ulStart = afterHeading + ulMatch.index;
  const ulEnd   = ulStart + ulMatch[0].length;
  return content.slice(0, ulStart) + newBlock + content.slice(ulEnd);
}
