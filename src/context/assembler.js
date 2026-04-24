/**
 * STARFORGED COMPANION
 * src/context/assembler.js — Builds Loremaster context packets
 *
 * Responsibilities:
 * - Assemble all context sections in the correct injection order
 * - Enforce token budget — compress or drop lower-priority sections to fit
 * - Guarantee safety section is always first and never omitted
 * - Return a ContextPacketSchema-shaped object with the assembled string
 *
 * Injection order (fixed — safety is always first):
 *   1. Safety configuration       — always included, exempt from budget
 *   2. World Truths summary       — summarised if budget is tight
 *   3. Active connections         — scene-relevant first, then allies
 *   4. Open progress tracks       — active vows, expeditions, combats
 *   5. Recent oracle results      — last 3 results from session
 *   6. Session notes              — dropped first if budget exceeded
 *   7. Resolved move outcome      — always included (Loremaster needs this)
 *
 * Token budget default: 400 tokens (~1600 characters).
 * Safety and move outcome sections are exempt — they are never dropped.
 */

import { formatSafetyContext, estimateSafetyTokens, isSceneSuppressed } from "./safety.js";
import { foundry } from "../foundry-shim.js";  // Shim for non-Foundry test contexts


// ─────────────────────────────────────────────────────────────────────────────
// MAIN ASSEMBLE FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assemble a complete Loremaster context packet.
 *
 * @param {Object} resolution      — MoveResolutionSchema (from resolver.js)
 * @param {Object} campaignState   — CampaignStateSchema
 * @param {Object} [options]
 * @param {Object} [options.sessionState]  — SessionSchema for session-scoped safety
 * @param {string} [options.currentUserId] — For private Lines resolution
 * @param {number} [options.tokenBudget]   — Override default 400-token budget
 * @returns {Object}               — ContextPacketSchema
 */
export async function assembleContextPacket(resolution, campaignState, options = {}) {
  const {
    sessionState  = null,
    currentUserId = null,
    tokenBudget   = 400,
  } = options;

  // X-Card check — if scene is suppressed, return a minimal packet
  if (isSceneSuppressed(sessionState)) {
    return buildSuppressedPacket(resolution, campaignState);
  }

  // ── 1. Safety (always first, exempt from budget) ──────────────────────────
  const safetyContent = formatSafetyContext(campaignState, sessionState, currentUserId);
  const safetyTokens  = estimateSafetyTokens(safetyContent);

  // ── 2. World Truths summary ───────────────────────────────────────────────
  const { content: worldTruthsContent, summarized: worldTruthsSummarized } =
    buildWorldTruthsSection(campaignState);

  // ── 3. Active connections ─────────────────────────────────────────────────
  const { content: connectionsContent, connectionIds } =
    await buildConnectionsSection(campaignState);

  // ── 4. Progress tracks ────────────────────────────────────────────────────
  const { content: tracksContent, trackIds } =
    await buildProgressTracksSection(campaignState);

  // ── 5. Recent oracle results ──────────────────────────────────────────────
  const { content: oraclesContent, oracleIds } =
    buildOraclesSection(campaignState);

  // ── 6. Session notes ──────────────────────────────────────────────────────
  const sessionNotesContent = buildSessionNotesSection(sessionState);

  // ── 7. Move outcome (exempt from budget — Loremaster always needs this) ───
  const moveOutcomeContent = resolution?.loremasterContext ?? "";

  // ── Budget enforcement ────────────────────────────────────────────────────
  const budgetResult = enforceBudget({
    tokenBudget,
    sections: {
      worldTruths:    { content: worldTruthsContent,   priority: 2 },
      connections:    { content: connectionsContent,    priority: 1 },
      progressTracks: { content: tracksContent,         priority: 1 },
      recentOracles:  { content: oraclesContent,        priority: 3 },
      sessionNotes:   { content: sessionNotesContent,   priority: 4 },  // Dropped first
    },
  });

  // ── Assemble final string ─────────────────────────────────────────────────
  const parts = [
    safetyContent,
    budgetResult.included.worldTruths    ?? "",
    budgetResult.included.connections    ?? "",
    budgetResult.included.progressTracks ?? "",
    budgetResult.included.recentOracles  ?? "",
    budgetResult.included.sessionNotes   ?? "",
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
      worldTruths: {
        content:        worldTruthsContent,
        tokenEstimate:  estimateTokens(worldTruthsContent),
        summarized:     worldTruthsSummarized,
      },
      activeConnections: {
        content:        connectionsContent,
        tokenEstimate:  estimateTokens(connectionsContent),
        connectionIds,
      },
      progressTracks: {
        content:        tracksContent,
        tokenEstimate:  estimateTokens(tracksContent),
        trackIds,
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
      moveOutcome: {
        content:           moveOutcomeContent,
        tokenEstimate:     estimateTokens(moveOutcomeContent),
        moveResolutionId:  resolution?._id ?? "",
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
// SECTION BUILDERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * World Truths summary.
 * Full version: all 14 categories listed.
 * Summarised version: only non-default results included (shorter).
 */
function buildWorldTruthsSection(campaignState) {
  const truths = campaignState.worldTruths ?? {};
  const entries = Object.entries(truths)
    .filter(([, v]) => v.result)
    .map(([key, v]) => `${toLabel(key)}: ${v.result}${v.subResult ? ` (${v.subResult})` : ""}`);

  if (!entries.length) {
    return { content: "", summarized: false };
  }

  const full = "## WORLD TRUTHS\n\n" + entries.join("\n");

  // If full version is too long, produce a shorter summary
  if (estimateTokens(full) > 120) {
    const summary = "## WORLD TRUTHS (summary)\n\n" + entries.slice(0, 6).join("\n") +
      `\n…and ${entries.length - 6} more truths established.`;
    return { content: summary, summarized: true };
  }

  return { content: full, summarized: false };
}

/**
 * Active connections section.
 * Priority order: scene-relevant → ally-flagged → recently updated.
 * Maximum 3 connections included to control token use.
 */
async function buildConnectionsSection(campaignState) {
  const ids = campaignState.connectionIds ?? [];
  if (!ids.length) return { content: "", connectionIds: [] };

  // Load connection records from Foundry journal entries
  const connections = await loadConnections(ids);
  if (!connections.length) return { content: "", connectionIds: [] };

  // Sort: scene-relevant first, then allies, then by update recency
  const sorted = connections.sort((a, b) => {
    if (a.sceneRelevant && !b.sceneRelevant) return -1;
    if (!a.sceneRelevant && b.sceneRelevant)  return 1;
    if (a.allyFlag && !b.allyFlag)             return -1;
    if (!a.allyFlag && b.allyFlag)             return 1;
    return new Date(b.updatedAt) - new Date(a.updatedAt);
  });

  const included = sorted.slice(0, 3);
  const lines = included.map(c => formatConnection(c));
  const content = "## ACTIVE CONNECTIONS\n\n" + lines.join("\n\n");

  return { content, connectionIds: included.map(c => c._id) };
}

/**
 * Progress tracks section.
 * Active vows, expeditions, and combats. Maximum 4 tracks.
 */
async function buildProgressTracksSection(campaignState) {
  const ids = campaignState.progressTrackIds ?? [];
  if (!ids.length) return { content: "", trackIds: [] };

  const tracks = await loadProgressTracks(ids);
  const active  = tracks.filter(t => t.active);
  if (!active.length) return { content: "", trackIds: [] };

  const included = active.slice(0, 4);
  const lines = included.map(t => formatProgressTrack(t));
  const content = "## PROGRESS TRACKS\n\n" + lines.join("\n");

  return { content, trackIds: included.map(t => t._id) };
}

/**
 * Recent oracle results section.
 * Last 3 oracle results from the current session.
 */
function buildOraclesSection(campaignState) {
  const ids = campaignState.oracleResultIds ?? [];
  if (!ids.length) return { content: "", oracleIds: [] };

  // Oracle results are stored in campaignState directly (lightweight)
  // Full persistence via journal is handled by oracles/roller.js
  const recent = ids.slice(-3);
  if (!recent.length) return { content: "", oracleIds: [] };

  // IDs only — full content loaded lazily if needed
  // For now, note that oracles were recently rolled
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


// ─────────────────────────────────────────────────────────────────────────────
// TOKEN BUDGET ENFORCEMENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Enforce the token budget across the variable sections.
 * Safety and move outcome are exempt — they are never in this pool.
 *
 * Priority (higher number = dropped first):
 *   1 = connections, progressTracks (core scene context — keep if possible)
 *   2 = worldTruths (important but compressible)
 *   3 = recentOracles (useful but not critical)
 *   4 = sessionNotes (nice to have — first to go)
 *
 * @param {Object} params
 * @param {number} params.tokenBudget
 * @param {Object} params.sections  — { sectionName: { content, priority } }
 * @returns {{ included: Object, omitted: string[], exceeded: boolean }}
 */
function enforceBudget({ tokenBudget, sections }) {
  const included  = {};
  const omitted   = [];
  let totalTokens = 0;
  let exceeded    = false;

  // Sort sections by priority ascending (lower = keep first)
  const sorted = Object.entries(sections).sort(([, a], [, b]) => a.priority - b.priority);

  for (const [name, { content }] of sorted) {
    if (!content) {
      included[name] = "";
      continue;
    }

    const tokens = estimateTokens(content);

    if (totalTokens + tokens <= tokenBudget) {
      included[name] = content;
      totalTokens += tokens;
    } else {
      // Try a truncated version before dropping entirely
      const truncated = truncateToTokens(content, tokenBudget - totalTokens);
      if (truncated) {
        included[name] = truncated;
        totalTokens += estimateTokens(truncated);
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

/**
 * Truncate a content string to approximately fit within a token limit.
 * Returns null if the content cannot be meaningfully truncated.
 */
function truncateToTokens(content, maxTokens) {
  if (maxTokens <= 10) return null;   // Not worth truncating
  const maxChars = maxTokens * 4;
  if (content.length <= maxChars) return content;
  return content.slice(0, maxChars).replace(/\s+\S*$/, "") + "\n…(truncated)";
}


// ─────────────────────────────────────────────────────────────────────────────
// FORMATTERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a connection record for context injection.
 * Progressive disclosure — only populated fields are included.
 */
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
 */
function formatProgressTrack(t) {
  const boxes     = Math.floor(t.ticks / 4);
  const progress  = `${boxes}/10 boxes`;
  const rankLabel = t.rank ? ` [${t.rank}]` : "";
  return `- **${t.name}** (${t.type}${rankLabel}): ${progress}`;
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

/**
 * Load Connection records from Foundry journal entries.
 * Returns an empty array in non-Foundry contexts (unit tests).
 */
async function loadConnections(ids) {
  try {
    const results = [];
    for (const id of ids) {
      const entry = game.journal?.get(id);
      if (!entry) continue;
      const page = entry.pages?.contents?.[0];
      if (!page?.flags?.["starforged-companion"]?.connection) continue;
      results.push(page.flags["starforged-companion"].connection);
    }
    return results;
  } catch {
    return [];   // Non-Foundry context or missing data — degrade gracefully
  }
}

/**
 * Load ProgressTrack records from Foundry journal entries.
 */
async function loadProgressTracks(ids) {
  try {
    const results = [];
    for (const id of ids) {
      const entry = game.journal?.get(id);
      if (!entry) continue;
      const page = entry.pages?.contents?.[0];
      if (!page?.flags?.["starforged-companion"]?.progressTrack) continue;
      results.push(page.flags["starforged-companion"].progressTrack);
    }
    return results;
  } catch {
    return [];
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// SUPPRESSED PACKET
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return a minimal packet when the X-Card has been triggered.
 * Contains only the safety section — no creative content.
 * Loremaster receives a clear instruction to pause.
 */
function buildSuppressedPacket(resolution, campaignState) {
  const content = "## SCENE PAUSED\n\nThe X-Card has been activated. Do not continue the current scene. Acknowledge the pause and wait for the players to signal they are ready to resume or redirect.";
  return {
    _id:             generateId(),
    timestamp:       new Date().toISOString(),
    sessionId:       campaignState.currentSessionId ?? "",
    triggeredBy:     "x_card",
    sections:        { safety: { content, tokenEstimate: estimateTokens(content), alwaysInclude: true } },
    totalTokenEstimate: estimateTokens(content),
    tokenBudget:     400,
    budgetExceeded:  false,
    omittedSections: ["worldTruths", "activeConnections", "progressTracks", "recentOracles", "sessionNotes", "moveOutcome"],
    assembled:       content,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

/** Rough token estimate: ~4 characters per token. */
function estimateTokens(str) {
  if (!str) return 0;
  return Math.ceil(str.length / 4);
}

/** Generate a short unique ID without Foundry dependency. */
function generateId() {
  try {
    return foundry.utils.randomID();
  } catch {
    return Math.random().toString(36).slice(2, 10);
  }
}
