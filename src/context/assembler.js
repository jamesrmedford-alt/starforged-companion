/**
 * STARFORGED COMPANION
 * src/context/assembler.js — Builds narrator context packets
 *
 * Responsibilities:
 * - Assemble all context sections in the correct injection order
 * - Enforce token budget — compress or drop lower-priority sections to fit
 * - Guarantee safety section is always first and never omitted
 * - Return a ContextPacketSchema-shaped object with the assembled string
 *
 * Injection order (narrator-entity-discovery scope §8 — Phase 2 target):
 *   0. Safety configuration       — exempt, always first
 *   1. Narrator permissions       — exempt, always second (when set)
 *   2. Oracle seeds               — exempt, when resolution provides them
 *   3. Confirmed lore             — WJ stub (empty until Phase 5)
 *   4. Active threats             — WJ stub (empty until Phase 5)
 *   5. World Truths
 *   6. Current location card      — when currentLocationId set
 *   7. Matched entity cards       — relevance resolver results
 *   8. Progress tracks
 *   9. Faction landscape          — WJ stub (empty until Phase 5)
 *  10. Recent WJ discoveries      — WJ stub (empty until Phase 5)
 *  11. Oracle history             — last 3 rolls
 *  12. Session notes              — dropped first under budget pressure
 *  13. Move outcome               — exempt, always last
 *
 * Token budget default: 1200 tokens (~4800 characters).
 * Sections 0, 1, 2, 13 are exempt and do not count against the budget.
 *
 * Implementation-extras retained in this codebase (not in the spec numbering):
 *   - Active connections (legacy summary, retained for backwards-compatibility)
 *   - Active sector
 *   - Character state
 *
 * Post-session-3 fixes applied here:
 *   — buildWorldTruthsSection: reads v.title ?? v.result (TruthResult shape,
 *     backwards-compatible with old test fixture format)
 *   — buildProgressTracksSection: loads the dedicated "Starforged Progress
 *     Tracks" journal directly rather than per-ID lookup (matches actual storage)
 *   — X-Card check: also checks campaignState.xCardActive so suppressScene()
 *     actually suppresses the packet
 */

import { formatSafetyContext, estimateSafetyTokens, isSceneSuppressed } from "./safety.js";
import { getPlayerActors, readCharacterSnapshot } from "../character/actorBridge.js";
import { getChronicleForContext } from "../character/chronicle.js";
import { NARRATOR_PERMISSIONS, formatEntityCard, formatOracleSeedsBlock } from "../narration/narratorPrompt.js";
import { getConnection } from "../entities/connection.js";
import { getSettlement } from "../entities/settlement.js";
import { getFaction }    from "../entities/faction.js";
import { getShip }       from "../entities/ship.js";
import { getPlanet }     from "../entities/planet.js";
import { getLocation }   from "../entities/location.js";
import { getCreature }   from "../entities/creature.js";
import {
  getConfirmedLore,
  getNarratorAssertedLore,
  getActiveThreats,
  getFactionLandscape,
  getRecentDiscoveries,
} from "../world/worldJournal.js";

const MODULE_ID         = "starforged-companion";
const TRACKS_JOURNAL    = "Starforged Progress Tracks";
const TRACKS_FLAG_KEY   = "tracks";


// ─────────────────────────────────────────────────────────────────────────────
// MAIN ASSEMBLE FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assemble a complete narrator context packet.
 *
 * @param {Object} resolution      — MoveResolutionSchema (from resolver.js)
 * @param {Object} campaignState   — CampaignStateSchema
 * @param {Object} [options]
 * @param {Object}   [options.sessionState]  — SessionSchema for session-scoped safety
 * @param {string}   [options.currentUserId] — For private Lines resolution
 * @param {number}   [options.tokenBudget]   — Override default 1200-token budget
 * @param {string}   [options.narratorClass] — "discovery" | "interaction" | "embellishment"
 * @param {string[]} [options.matchedEntityIds]   — JournalEntry IDs from relevance resolver
 * @param {string[]} [options.matchedEntityTypes] — Corresponding entity type strings
 * @returns {Object}               — ContextPacketSchema
 */
export async function assembleContextPacket(resolution, campaignState, options = {}) {
  const {
    sessionState        = null,
    currentUserId       = null,
    tokenBudget         = 1200,
    narratorClass       = null,
    matchedEntityIds    = [],
    matchedEntityTypes  = [],
  } = options;

  // FIX 3: Check both sessionState.xCardActive (session-scoped) and
  // campaignState.xCardActive (written by suppressScene() in safety.js).
  // Previously only checked sessionState which was always null in the pipeline.
  if (isSceneSuppressed(sessionState) || campaignState?.xCardActive) {
    return buildSuppressedPacket(resolution, campaignState);
  }

  // ── Section 0: Safety (always first, exempt from budget) ──────────────────
  const safetyContent = formatSafetyContext(campaignState, sessionState, currentUserId);
  const safetyTokens  = estimateSafetyTokens(safetyContent);

  // ── Section 1: Narrator permissions (exempt — never dropped) ──────────────
  const permissionsContent = buildPermissionsSection(narratorClass);

  // ── Section 2: Oracle seeds (exempt — change every call) ──────────────────
  const oracleSeedsContent = formatOracleSeedsBlock(resolution?.oracleSeeds) ?? "";

  // ── Sections 3, 4, 9, 10: World Journal content (Phase 5) ────────────────
  // Section 3 splits into a "confirmed" half (never dropped) and an
  // "asserted" half that is the LAST droppable section. Section 4 splits
  // similarly into immediate (never dropped) and non-immediate (drops with
  // the rest of the budgeted sections). See the priority comments in
  // enforceBudget below.
  const confirmedLoreContent       = getConfirmedLoreSection(campaignState);
  const assertedLoreContent        = getAssertedLoreSection(campaignState);
  const immediateThreatsContent    = getImmediateThreatsSection(campaignState);
  const nonImmediateThreatsContent = getNonImmediateThreatsSection(campaignState);
  const factionLandscapeContent    = getFactionLandscapeSection(campaignState);
  const recentDiscoveriesContent   = getRecentDiscoveriesSection(campaignState);

  // ── Section 5: World Truths summary ───────────────────────────────────────
  const { content: worldTruthsContent, summarized: worldTruthsSummarized } =
    buildWorldTruthsSection(campaignState);

  // ── Section 6: Current location card ──────────────────────────────────────
  const currentLocationContent = buildCurrentLocationSection(campaignState);

  // ── Section 7: Matched entity cards ───────────────────────────────────────
  const entityCardsContent = buildEntityCardsSection(matchedEntityIds, matchedEntityTypes);

  // ── Legacy: Active connections ────────────────────────────────────────────
  const { content: connectionsContent, connectionIds } =
    await buildConnectionsSection(campaignState);

  // ── Legacy: Character state ───────────────────────────────────────────────
  const { content: characterContent, characterIds } =
    await buildCharacterStateSection(campaignState);

  // ── Section 8: Progress tracks ────────────────────────────────────────────
  const { content: tracksContent, trackIds } =
    await buildProgressTracksSection();

  // ── Legacy: Active sector ─────────────────────────────────────────────────
  const { content: sectorContent } = buildSectorSection(campaignState);

  // ── Section 11: Oracle history ────────────────────────────────────────────
  const { content: oraclesContent, oracleIds } =
    buildOraclesSection(campaignState);

  // ── Section 12: Session notes (dropped first under budget pressure) ───────
  const sessionNotesContent = buildSessionNotesSection(sessionState);

  // ── Lore recap (low priority — injected when available) ───────────────────
  const loreRecapContent = buildLoreRecapSection(campaignState);

  // ── Section 13: Move outcome (exempt, always last) ────────────────────────
  const moveOutcomeContent = resolution?.loremasterContext ?? "";

  // ── Budget enforcement ────────────────────────────────────────────────────
  // Priority — lower number wins (kept first under pressure). Drop order
  // per narrator-entity-discovery scope §8 / WJ scope §6:
  //   12 → 10 → 9 → 11 → 8 → 7(partial) → 4(non-immediate) → 3(asserted)
  //
  //   1: confirmedLore (confirmed half), immediateThreats, currentLocation,
  //      worldTruths, characterState, connections — never dropped
  //   2: assertedLore (Section 3 asserted, last to drop)
  //   3: nonImmediateThreats (Section 4 looming/active)
  //   4: entityCards (truncate-able)
  //   5: progressTracks
  //   6: activeSector (legacy, sits between progress tracks and oracles)
  //   7: recentOracles
  //   8: factionLandscape
  //   9: recentDiscoveries
  //  10: sessionNotes (drop first)
  const budgetResult = enforceBudget({
    tokenBudget,
    sections: {
      confirmedLore:        { content: confirmedLoreContent,       priority: 1 },
      immediateThreats:     { content: immediateThreatsContent,    priority: 1 },
      worldTruths:          { content: worldTruthsContent,         priority: 1 },
      currentLocation:      { content: currentLocationContent,     priority: 1 },
      characterState:       { content: characterContent,           priority: 1 },
      connections:          { content: connectionsContent,         priority: 1 },
      assertedLore:         { content: assertedLoreContent,        priority: 2 },
      nonImmediateThreats:  { content: nonImmediateThreatsContent, priority: 3 },
      entityCards:          { content: entityCardsContent,         priority: 4 },
      progressTracks:       { content: tracksContent,              priority: 5 },
      activeSector:         { content: sectorContent,              priority: 6 },
      recentOracles:        { content: oraclesContent,             priority: 7 },
      factionLandscape:     { content: factionLandscapeContent,    priority: 8 },
      recentDiscoveries:    { content: recentDiscoveriesContent,   priority: 9 },
      sessionNotes:         { content: sessionNotesContent,        priority: 10 },
      loreRecap:            { content: loreRecapContent,           priority: 11 },
    },
  });

  // ── Assemble final string in scope §8 order ───────────────────────────────
  // Sections 3 and 4 each have two budget keys (confirmed/asserted lore;
  // immediate/non-immediate threats). Each pair renders consecutively under
  // its section heading so the asserted/non-immediate halves drop without
  // breaking the layout.
  const section3 = joinSubsections([
    budgetResult.included.confirmedLore,
    budgetResult.included.assertedLore,
  ]);
  const section4 = joinSubsections([
    budgetResult.included.immediateThreats,
    budgetResult.included.nonImmediateThreats,
  ]);

  const parts = [
    safetyContent,
    permissionsContent,
    oracleSeedsContent,
    section3,
    section4,
    budgetResult.included.worldTruths       ?? "",
    budgetResult.included.currentLocation   ?? "",
    budgetResult.included.entityCards       ?? "",
    budgetResult.included.connections       ?? "",
    budgetResult.included.characterState    ?? "",
    budgetResult.included.progressTracks    ?? "",
    budgetResult.included.activeSector      ?? "",
    budgetResult.included.factionLandscape  ?? "",
    budgetResult.included.recentDiscoveries ?? "",
    budgetResult.included.recentOracles     ?? "",
    budgetResult.included.loreRecap         ?? "",
    budgetResult.included.sessionNotes      ?? "",
    moveOutcomeContent,
  ].filter(Boolean);

  const assembled = parts.join("\n\n---\n\n");

  return {
    _id:       generateId(),
    timestamp: new Date().toISOString(),
    sessionId: campaignState.currentSessionId ?? "",
    triggeredBy: resolution ? "move_resolution" : "manual",

    sections: {
      safety: {
        content:        safetyContent,
        tokenEstimate:  safetyTokens,
        alwaysInclude:  true,
      },
      narratorPermissions: {
        content:        permissionsContent,
        tokenEstimate:  estimateTokens(permissionsContent),
        alwaysInclude:  true,
      },
      oracleSeeds: {
        content:        oracleSeedsContent,
        tokenEstimate:  estimateTokens(oracleSeedsContent),
        alwaysInclude:  true,
      },
      confirmedLore: {
        content:        confirmedLoreContent,
        tokenEstimate:  estimateTokens(confirmedLoreContent),
      },
      assertedLore: {
        content:        assertedLoreContent,
        tokenEstimate:  estimateTokens(assertedLoreContent),
      },
      activeThreats: {
        // Combined Section 4 content for backwards-compat with consumers that
        // read this key. Independent budgeting uses immediateThreats /
        // nonImmediateThreats below.
        content:        joinSubsections([immediateThreatsContent, nonImmediateThreatsContent]),
        tokenEstimate:  estimateTokens(joinSubsections([immediateThreatsContent, nonImmediateThreatsContent])),
      },
      immediateThreats: {
        content:        immediateThreatsContent,
        tokenEstimate:  estimateTokens(immediateThreatsContent),
      },
      nonImmediateThreats: {
        content:        nonImmediateThreatsContent,
        tokenEstimate:  estimateTokens(nonImmediateThreatsContent),
      },
      worldTruths: {
        content:        worldTruthsContent,
        tokenEstimate:  estimateTokens(worldTruthsContent),
        summarized:     worldTruthsSummarized,
      },
      currentLocation: {
        content:        currentLocationContent,
        tokenEstimate:  estimateTokens(currentLocationContent),
      },
      entityCards: {
        content:        entityCardsContent,
        tokenEstimate:  estimateTokens(entityCardsContent),
        entityIds:      matchedEntityIds,
        entityTypes:    matchedEntityTypes,
      },
      activeConnections: {
        content:        connectionsContent,
        tokenEstimate:  estimateTokens(connectionsContent),
        connectionIds,
      },
      characterState: {
        content:        characterContent,
        tokenEstimate:  estimateTokens(characterContent),
        characterIds,
      },
      progressTracks: {
        content:        tracksContent,
        tokenEstimate:  estimateTokens(tracksContent),
        trackIds,
      },
      activeSector: {
        content:       sectorContent,
        tokenEstimate: estimateTokens(sectorContent),
      },
      factionLandscape: {
        content:        factionLandscapeContent,
        tokenEstimate:  estimateTokens(factionLandscapeContent),
      },
      recentDiscoveries: {
        content:        recentDiscoveriesContent,
        tokenEstimate:  estimateTokens(recentDiscoveriesContent),
      },
      recentOracles: {
        content:        oraclesContent,
        tokenEstimate:  estimateTokens(oraclesContent),
        oracleIds,
      },
      sessionNotes: {
        content:        sessionNotesContent,
        tokenEstimate:  estimateTokens(sessionNotesContent),
      },
      loreRecap: {
        content:        loreRecapContent,
        tokenEstimate:  estimateTokens(loreRecapContent),
      },
      moveOutcome: {
        content:          moveOutcomeContent,
        tokenEstimate:    estimateTokens(moveOutcomeContent),
        moveResolutionId: resolution?._id ?? "",
      },
    },

    totalTokenEstimate: estimateTokens(assembled),
    tokenBudget,
    budgetExceeded:  budgetResult.exceeded,
    omittedSections: budgetResult.omitted,

    assembled,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// NARRATOR PERMISSIONS — Section 1
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the narrator permissions block from the relevance result.
 * Returns empty string when no narratorClass is supplied (default behaviour
 * when the assembler is called outside the live narrator pipeline, e.g. in
 * tests for unrelated sections).
 */
function buildPermissionsSection(narratorClass) {
  if (!narratorClass) return "";
  return NARRATOR_PERMISSIONS[narratorClass] ?? "";
}


// ─────────────────────────────────────────────────────────────────────────────
// CURRENT LOCATION — Section 6
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the current location card from campaignState.currentLocationId.
 * Used by the narrator to anchor every narration to the current scene's place.
 */
function buildCurrentLocationSection(campaignState) {
  const id   = campaignState?.currentLocationId;
  const type = campaignState?.currentLocationType;
  if (!id || !type) return "";

  const getter = LOCATION_GETTERS[type];
  if (!getter) return "";

  let entity = null;
  try {
    entity = getter(id);
  } catch (err) {
    console.warn(`${MODULE_ID} | assembler: load currentLocation (${type} ${id}) failed:`, err);
    return "";
  }
  if (!entity) return "";

  const card = formatEntityCard(entity, type);
  if (!card) return "";
  return `## CURRENT LOCATION\n\n${card}`;
}


// ─────────────────────────────────────────────────────────────────────────────
// MATCHED ENTITY CARDS — Section 7
// ─────────────────────────────────────────────────────────────────────────────

const ENTITY_GETTERS = {
  connection: getConnection,
  settlement: getSettlement,
  faction:    getFaction,
  ship:       getShip,
  planet:     getPlanet,
  location:   getLocation,
  creature:   getCreature,
};

const LOCATION_GETTERS = {
  settlement: getSettlement,
  location:   getLocation,
  planet:     getPlanet,
};

/**
 * Build the matched-entity-cards section from the relevance resolver result.
 * Each ID/type pair is formatted via formatEntityCard() and joined.
 *
 * Replaces the legacy "ACTIVE CONNECTIONS — N count" placeholder for the
 * narrator pipeline. The legacy section still runs for backwards-compatibility
 * with code paths that don't pass matchedEntityIds.
 */
function buildEntityCardsSection(ids, types) {
  if (!Array.isArray(ids) || !ids.length) return "";

  const cards = [];
  for (let i = 0; i < ids.length; i++) {
    const journalId = ids[i];
    const type      = types?.[i];
    if (!journalId || !type) continue;
    const getter = ENTITY_GETTERS[type];
    if (!getter) continue;
    let entity = null;
    try {
      entity = getter(journalId);
    } catch (err) {
      console.warn(`${MODULE_ID} | assembler: load entity (${type} ${journalId}) failed:`, err);
      continue;
    }
    if (!entity) continue;
    const card = formatEntityCard(entity, type);
    if (card) cards.push(card);
  }

  if (!cards.length) return "";
  return ["## ENTITIES IN SCENE", ...cards].join("\n\n");
}


// ─────────────────────────────────────────────────────────────────────────────
// WORLD JOURNAL SECTIONS — Sections 3, 4, 9, 10 (Phase 5)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Section 3a — Confirmed lore. Hard narrator constraint. Per WJ scope §6
 * this content is "never dropped" — assigned the highest-priority budget
 * tier so the assembler keeps it whenever any room remains.
 */
function getConfirmedLoreSection(campaignState) {
  if (!loreInContextEnabled()) return "";
  let entries;
  try { entries = getConfirmedLore(campaignState) ?? []; }
  catch { return ""; }
  if (!entries.length) return "";
  const lines = entries.map(e => `"${e.title ?? ''}"`).filter(s => s !== '""');
  if (!lines.length) return "";
  return `## ESTABLISHED LORE — DO NOT CONTRADICT\n\n${lines.join("\n")}`;
}

/**
 * Section 3b — Narrator-asserted lore. Soft constraint. Drops before the
 * confirmed half of Section 3 under budget pressure.
 */
function getAssertedLoreSection(campaignState) {
  if (!loreInContextEnabled()) return "";
  let entries;
  try { entries = getNarratorAssertedLore(campaignState) ?? []; }
  catch { return ""; }
  if (!entries.length) return "";
  const lines = entries.map(e => `"${e.title ?? ''}"`).filter(s => s !== '""');
  if (!lines.length) return "";
  return `NARRATOR-ASSERTED (treat as established):\n${lines.join("\n")}`;
}

/**
 * Section 4a — Immediate threats. Hard narrator constraint, never dropped.
 */
function getImmediateThreatsSection(campaignState) {
  if (!threatsInContextEnabled()) return "";
  let entries;
  try { entries = getActiveThreats(campaignState) ?? []; }
  catch { return ""; }
  const immediate = entries.filter(t => t?.severity === "immediate");
  if (!immediate.length) return "";
  const lines = immediate.map(t =>
    `IMMEDIATE: ${t.name ?? ''}${t.summary ? ` — ${t.summary}` : ''}`,
  );
  return `## ACTIVE THREATS\n\n${lines.join("\n")}`;
}

/**
 * Section 4b — Active and looming threats. Drops before the immediate half.
 * Looming is dropped before active under tight budget (the budget allocator
 * truncates from the end).
 */
function getNonImmediateThreatsSection(campaignState) {
  if (!threatsInContextEnabled()) return "";
  let entries;
  try { entries = getActiveThreats(campaignState) ?? []; }
  catch { return ""; }
  const filtered = entries.filter(t => t?.severity === "active" || t?.severity === "looming");
  if (!filtered.length) return "";
  // Active before looming — getActiveThreats already sorts but filter loses
  // the cross-severity ordering, so re-sort here.
  filtered.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  const lines = filtered.map(t =>
    `${t.severity?.toUpperCase()}: ${t.name ?? ''}${t.summary ? ` — ${t.summary}` : ''}`,
  );
  return lines.join("\n");
}

/**
 * Section 9 — Faction landscape. Up to 3 factions, most recent first.
 * Per WJ scope §4: factions with entity records are excluded — they're
 * already represented in the matched-entity-cards section.
 */
function getFactionLandscapeSection(campaignState) {
  if (!factionLandscapeInContextEnabled()) return "";
  let entries;
  try { entries = getFactionLandscape(campaignState) ?? []; }
  catch { return ""; }
  if (!entries.length) return "";
  const noEntityRecord = entries.filter(f => !factionHasEntityRecord(f, campaignState));
  if (!noEntityRecord.length) return "";
  const top = noEntityRecord.slice(0, 3);
  const lines = top.map(f => {
    const summary = lastEncounterSummary(f);
    return `${f.factionName ?? ''}: ${f.attitude ?? 'unknown'}` +
      (summary ? ` — ${summary}` : '');
  });
  return `## FACTION ATTITUDES\n\n${lines.join("\n")}`;
}

/**
 * Section 10 — Recent unconfirmed lore from the current session.
 */
function getRecentDiscoveriesSection(campaignState) {
  let entries;
  try { entries = getRecentDiscoveries(campaignState) ?? []; }
  catch { return ""; }
  if (!entries.length) return "";
  const lines = entries.map(e => `"${e.title ?? ''}"`).filter(s => s !== '""');
  if (!lines.length) return "";
  return `## THIS SESSION — UNCONFIRMED\n\n${lines.join("\n")}`;
}


// ── helpers for the WJ section builders ────────────────────────────────────

const SEVERITY_ORDER = { immediate: 0, active: 1, looming: 2, resolved: 3 };
function severityRank(s) { return SEVERITY_ORDER[s] ?? 99; }

function lastEncounterSummary(faction) {
  const last = Array.isArray(faction?.encounters)
    ? faction.encounters[faction.encounters.length - 1]
    : null;
  return last?.summary ?? "";
}

function factionHasEntityRecord(factionEntry, campaignState) {
  // Fast path: WJ entry's entityId field directly references the faction
  // entity journal.
  if (factionEntry?.entityId) return true;

  const ids = campaignState?.factionIds ?? [];
  if (!ids.length) return false;
  const target = (factionEntry?.factionName ?? "").trim().toLowerCase();
  if (!target) return false;
  for (const journalId of ids) {
    let rec = null;
    try { rec = getFaction(journalId); }
    catch { continue; }
    if (rec?.name && rec.name.trim().toLowerCase() === target) return true;
  }
  return false;
}

function loreInContextEnabled() {
  try   { return game.settings?.get(MODULE_ID, "loreInContext") !== false; }
  catch { return true; }
}
function threatsInContextEnabled() {
  try   { return game.settings?.get(MODULE_ID, "threatsInContext") !== false; }
  catch { return true; }
}
function factionLandscapeInContextEnabled() {
  try   { return game.settings?.get(MODULE_ID, "factionLandscapeInContext") !== false; }
  catch { return true; }
}


// ─────────────────────────────────────────────────────────────────────────────
// SECTION BUILDERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * World Truths summary.
 *
 * FIX 1: Previously read v.result, but TruthResult (from generator.js) uses
 * v.title and v.description. Now reads v.title ?? v.result to handle both
 * the current TruthResult shape and the old test fixture format gracefully.
 *
 * Full version: all 14 categories listed as one line each.
 * Summarised version: first 6 when full version exceeds token limit.
 */
function buildWorldTruthsSection(campaignState) {
  // Prefer our own structured truths if any entries have actual text content
  const truths  = campaignState.worldTruths ?? {};
  const entries = Object.entries(truths)
    .map(([key, v]) => {
      // Accept both TruthResult shape (v.title) and old fixture shape (v.result)
      const text = v.title ?? v.result;
      if (!text) return null;
      const sub = v.subResult ? ` (${v.subResult})` : "";
      return `${toLabel(key)}: ${text}${sub}`;
    })
    .filter(Boolean);

  if (entries.length) {
    const full = "## WORLD TRUTHS\n\n" + entries.join("\n");

    if (estimateTokens(full) > 120) {
      const summary =
        "## WORLD TRUTHS (summary)\n\n" +
        entries.slice(0, 6).join("\n") +
        `\n…and ${entries.length - 6} more truths established.`;
      return { content: summary, summarized: true };
    }

    return { content: full, summarized: false };
  }

  // Fall back to the system's journal when truths were set via the system dialog
  if (campaignState.worldTruthsJournalId) {
    try {
      const je   = game.journal?.get(campaignState.worldTruthsJournalId);
      const page = je?.pages?.contents?.[0];
      const html = page?.text?.content ?? "";
      if (html) {
        const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        return {
          content: "## WORLD TRUTHS\n\n" + text.slice(0, 1500),
          summarized: text.length > 1500,
        };
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | assembler: failed to read worldTruths journal:`, err);
    }
  }

  return { content: "", summarized: false };
}

/**
 * Active connections section.
 * Priority order: scene-relevant → ally-flagged → recently updated.
 * Maximum 3 connections included to control token use.
 */
async function buildConnectionsSection(campaignState) {
  const ids = campaignState.connectionIds ?? [];
  if (!ids.length) return { content: "", connectionIds: [] };

  const connections = await loadConnections(ids);
  if (!connections.length) return { content: "", connectionIds: [] };

  const sorted = connections.sort((a, b) => {
    if (a.sceneRelevant && !b.sceneRelevant) return -1;
    if (!a.sceneRelevant && b.sceneRelevant) return  1;
    if (a.allyFlag && !b.allyFlag)           return -1;
    if (!a.allyFlag && b.allyFlag)           return  1;
    return new Date(b.updatedAt) - new Date(a.updatedAt);
  });

  const included = sorted.slice(0, 3);
  const lines    = included.map(c => formatConnection(c));
  const content  = "## ACTIVE CONNECTIONS\n\n" + lines.join("\n\n");

  return { content, connectionIds: included.map(c => c._id) };
}

/**
 * Character state section (3a) — inserted between connections and progress tracks.
 * Reads all player-owned character Actors from actorBridge and formats a summary
 * of stats, meters, debilities, and chronicle context per character.
 * Token budget: ~150 tokens per character.
 */
async function buildCharacterStateSection(_campaignState) {
  try {
    const enabled = (() => {
      try {
        return game.settings?.get(MODULE_ID, "characterContextEnabled") !== false;
      } catch (err) {
        console.warn(`${MODULE_ID} | assembler: characterContextEnabled settings read failed; defaulting to enabled:`, err);
        return true;
      }
    })();
    if (!enabled) return { content: "", characterIds: [] };

    const actors = getPlayerActors();
    if (!actors.length) return { content: "", characterIds: [] };

    const blocks = [];
    for (const actor of actors) {
      const snap = readCharacterSnapshot(actor);
      if (!snap) continue;

      let summary = "";
      let recent  = [];
      try {
        const chronicle = await getChronicleForContext(actor.id);
        summary = chronicle?.summary ?? "";
        recent  = chronicle?.recent  ?? [];
      } catch (err) {
        console.error(`${MODULE_ID} | assembler: getChronicleForContext(${actor.id}) failed:`, err);
      }
      blocks.push(formatCharacterBlock(snap, summary, recent));
    }

    if (!blocks.length) return { content: "", characterIds: [] };

    const content = "## CHARACTER STATE\n\n" + blocks.join("\n\n");
    return { content, characterIds: actors.map(a => a.id) };
  } catch (err) {
    console.error(`${MODULE_ID} | assembler: buildCharacterStateSection failed:`, err);
    return { content: "", characterIds: [], _error: err };
  }
}

/**
 * Progress tracks section.
 *
 * FIX 2: The old implementation tried to load tracks by scanning
 * campaignState.progressTrackIds as individual journal entries with a
 * `progressTrack` flag. That was never how progressTracks.js stored data.
 *
 * progressTracks.js stores ALL tracks as a single array in a dedicated
 * JournalEntry named "Starforged Progress Tracks", under
 * page.flags["starforged-companion"].tracks.
 *
 * This function now loads that journal directly, reads the tracks array,
 * filters to active non-completed tracks, and formats the top 4.
 */
async function buildProgressTracksSection() {
  try {
    const journal = game.journal?.getName(TRACKS_JOURNAL);
    if (!journal) return { content: "", trackIds: [] };

    const page   = journal.pages?.contents?.[0];
    const tracks = page?.flags?.[MODULE_ID]?.[TRACKS_FLAG_KEY];
    if (!Array.isArray(tracks) || !tracks.length) {
      return { content: "", trackIds: [] };
    }

    const active   = tracks.filter(t => !t.completed);
    if (!active.length) return { content: "", trackIds: [] };

    const included = active.slice(0, 4);
    const lines    = included.map(t => formatProgressTrack(t));
    const content  = "## PROGRESS TRACKS\n\n" + lines.join("\n");

    return { content, trackIds: included.map(t => t.id) };
  } catch (err) {
    console.error(`${MODULE_ID} | assembler: buildProgressTracksSection failed:`, err);
    return { content: "", trackIds: [], _error: err };
  }
}

/**
 * Active sector section.
 * Injected between progress tracks and recent oracles. ~50 tokens.
 * Dropped before connections if budget is tight (priority: 2).
 */
function buildSectorSection(campaignState) {
  const id     = campaignState.activeSectorId;
  const sector = id && (campaignState.sectors ?? []).find(s => s.id === id);
  if (!sector) return { content: "" };

  const regionLabel = sector.regionLabel ?? sector.region ?? "Unknown";
  const settlements = (sector.mapData?.settlements ?? []).map(s => s.name).join(", ");
  const passages    = sector.mapData?.passages?.length ?? 0;

  let content = `## ACTIVE SECTOR\n\nName: ${sector.name}  Region: ${regionLabel}\n`;
  content    += `Trouble: ${sector.trouble}\n`;
  if (sector.faction) content += `Control: ${sector.faction}\n`;
  if (settlements)    content += `Settlements: ${settlements}\n`;
  content    += `Passages: ${passages} charted route${passages !== 1 ? "s" : ""}`;

  return { content };
}

/**
 * Recent oracle results section.
 * Last 3 oracle result IDs from the current session.
 */
function buildOraclesSection(campaignState) {
  const ids = campaignState.oracleResultIds ?? [];
  if (!ids.length) return { content: "", oracleIds: [] };

  const recent = ids.slice(-3);
  if (!recent.length) return { content: "", oracleIds: [] };

  const content = `## RECENT ORACLES\n\n${recent.length} oracle result(s) this session.`;
  return { content, oracleIds: recent };
}

/**
 * Session notes section.
 * Brief notes from the current session — lowest priority, dropped first.
 */
function buildSessionNotesSection(sessionState) {
  if (!sessionState?.notes?.trim()) return "";
  return `## SESSION NOTES\n\n${sessionState.notes.trim()}`;
}

/**
 * Lore recap section.
 * Atmospheric narrator summary of the world truths — lower priority than session notes,
 * dropped first under token pressure. Truncated to 400 chars to keep it compact.
 */
function buildLoreRecapSection(campaignState) {
  const recap = campaignState?.loreRecap?.trim();
  if (!recap) return "";
  return `## WORLD LORE\n\n${recap.slice(0, 400)}`;
}


// ─────────────────────────────────────────────────────────────────────────────
// TOKEN BUDGET ENFORCEMENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Enforce the token budget across the variable sections.
 * Safety and move outcome are exempt — they are never in this pool.
 *
 * Priority (lower = keep first):
 *   1 = connections, progressTracks
 *   2 = worldTruths
 *   3 = recentOracles
 *   4 = sessionNotes (dropped first)
 */
function enforceBudget({ tokenBudget, sections }) {
  const included = {};
  const omitted  = [];
  let   total    = 0;
  let   exceeded = false;

  const sorted = Object.entries(sections).sort(([, a], [, b]) => a.priority - b.priority);

  for (const [name, { content }] of sorted) {
    if (!content) {
      included[name] = "";
      continue;
    }

    const tokens = estimateTokens(content);

    if (total + tokens <= tokenBudget) {
      included[name] = content;
      total += tokens;
    } else {
      const truncated = truncateToTokens(content, tokenBudget - total);
      if (truncated) {
        included[name] = truncated;
        total += estimateTokens(truncated);
        exceeded = true;
      } else {
        included[name] = "";
        omitted.push(name);
        exceeded = true;
      }
    }
  }

  return { included, omitted, exceeded };
}

function truncateToTokens(content, maxTokens) {
  if (maxTokens <= 10) return null;
  const maxChars = maxTokens * 4;
  if (content.length <= maxChars) return content;
  return content.slice(0, maxChars).replace(/\s+\S*$/, "") + "\n…(truncated)";
}

/**
 * Concatenate two related sub-sections (e.g. confirmed lore + asserted
 * lore) so they render under a single section heading. Returns the empty
 * string when nothing is present so the caller can drop the slot entirely.
 */
function joinSubsections(parts) {
  return parts.filter(Boolean).join("\n\n");
}


// ─────────────────────────────────────────────────────────────────────────────
// FORMATTERS
// ─────────────────────────────────────────────────────────────────────────────

function formatCharacterBlock(snap, summary, recentEntries) {
  const { name, stats, meters, momentumMax, debilities } = snap;
  const s = stats;
  const m = meters;

  const debList = formatDebilitiesList(debilities);
  const lines   = [
    `**${name}**`,
    `Stats: Edge ${s.edge} | Heart ${s.heart} | Iron ${s.iron} | Shadow ${s.shadow} | Wits ${s.wits}`,
    `Meters: Health ${m.health}/5 | Spirit ${m.spirit}/5 | Supply ${m.supply}/5 | Momentum ${m.momentum}/${momentumMax}`,
    `Debilities: ${debList}`,
  ];

  if (summary) {
    lines.push(`Chronicle summary: ${summary}`);
  }

  if (recentEntries?.length) {
    const recentText = recentEntries.slice(0, 3).map(e => `- (${e.type}) ${e.text}`).join("\n");
    lines.push(`Recent:\n${recentText}`);
  }

  return lines.join("\n");
}

function formatDebilitiesList(debilities) {
  const active = Object.entries(debilities)
    .filter(([, v]) => v)
    .map(([k]) => k);
  return active.length ? active.join(", ") : "None";
}

function formatConnection(c) {
  const parts = [`**${c.name ?? "Unknown"}**`];
  if (c.role)             parts.push(`Role: ${c.role}`);
  if (c.rank)             parts.push(`Rank: ${c.rank}`);
  if (c.relationshipType) parts.push(`Relationship: ${c.relationshipType}`);
  if (c.bonded)           parts.push("Bonded.");
  if (c.description)      parts.push(c.description);
  if (c.motivation)       parts.push(`Motivation: ${c.motivation}`);
  if (c.loremasterNotes)  parts.push(`Note: ${c.loremasterNotes}`);
  return parts.join(" | ");
}

/**
 * Format a progress track for context injection.
 * Track records from progressTracks.js use `id` (not `_id`) and `label` (not `name`).
 */
function formatProgressTrack(t) {
  const boxes    = Math.floor((t.ticks ?? 0) / 4);
  const progress = `${boxes}/10 boxes`;
  const rank     = t.rank ? ` [${t.rank}]` : "";
  const name     = t.label ?? t.name ?? "Unnamed Track";
  return `- **${name}** (${t.type ?? "vow"}${rank}): ${progress}`;
}

/**
 * Convert a camelCase or snake_case world truth key to a readable label.
 * e.g. "commsAndData" → "Comms & Data"
 */
function toLabel(key) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/\band\b/gi, "&")
    .replace(/^\w/, c => c.toUpperCase())
    .trim();
}


// ─────────────────────────────────────────────────────────────────────────────
// DATA LOADERS
// ─────────────────────────────────────────────────────────────────────────────

async function loadConnections(ids) {
  try {
    const results = [];
    for (const id of ids) {
      const entry = game.journal?.get(id);
      if (!entry) continue;
      const page = entry.pages?.contents?.[0];
      const data = page?.flags?.[MODULE_ID]?.connection;
      if (data) results.push(data);
    }
    return results;
  } catch {
    return [];
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// SUPPRESSED PACKET
// ─────────────────────────────────────────────────────────────────────────────

function buildSuppressedPacket(resolution, campaignState) {
  const content =
    "## SCENE PAUSED\n\n" +
    "The X-Card has been activated. Do not continue the current scene. " +
    "Acknowledge the pause and wait for the players to signal they are ready to resume or redirect.";
  return {
    _id:             generateId(),
    timestamp:       new Date().toISOString(),
    sessionId:       campaignState.currentSessionId ?? "",
    triggeredBy:     "x_card",
    sections:        {
      safety: { content, tokenEstimate: estimateTokens(content), alwaysInclude: true },
    },
    totalTokenEstimate: estimateTokens(content),
    tokenBudget:     1200,
    budgetExceeded:  false,
    omittedSections: [
      "narratorPermissions", "oracleSeeds",
      "confirmedLore", "activeThreats", "worldTruths",
      "currentLocation", "entityCards",
      "activeConnections", "characterState",
      "progressTracks", "activeSector",
      "factionLandscape", "recentDiscoveries",
      "recentOracles", "sessionNotes", "moveOutcome",
    ],
    assembled: content,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

function estimateTokens(str) {
  if (!str) return 0;
  return Math.ceil(str.length / 4);
}

function generateId() {
  try   { return foundry.utils.randomID(); }
  catch { return Math.random().toString(36).slice(2, 10); }
}
