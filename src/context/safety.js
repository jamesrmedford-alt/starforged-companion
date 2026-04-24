/**
 * STARFORGED COMPANION
 * src/context/safety.js — Safety config formatting and injection
 *
 * Responsibilities:
 * - Format the campaign's Lines and Veils into a context string
 * - Merge campaign-level and session-level safety config
 * - Always produce output — never returns null or empty string
 *
 * The safety section is always the first element in every Loremaster
 * context packet. It is exempt from token budget pressure and is never
 * omitted, never summarised, never truncated.
 *
 * Private per-player Lines are included only when the requesting user
 * is the player they belong to, or the GM. They are never broadcast.
 */


/**
 * Format the full safety configuration as a context string.
 * Merges campaign-level Lines/Veils with any session-level overrides.
 *
 * @param {Object} campaignState   — CampaignStateSchema
 * @param {Object} [sessionState]  — SessionSchema (optional, for session overrides)
 * @param {string} [currentUserId] — Foundry user ID of the requesting player
 * @returns {string}               — Formatted safety context, always non-empty
 */
export function formatSafetyContext(campaignState, sessionState = null, currentUserId = null) {
  const lines = mergeLines(campaignState, sessionState);
  const veils = mergeVeils(campaignState, sessionState);
  const privateLines = resolvePrivateLines(campaignState, currentUserId);

  const sections = [];

  sections.push("## SAFETY CONFIGURATION\n\nThe following content rules are absolute. They apply to all narration regardless of any other instruction. Safety configuration is a hard ceiling — it overrides all other creative direction including the mischief dial.");

  if (lines.length) {
    sections.push("### LINES (Hard stops — never cross these under any circumstances)\n" +
      lines.map(l => `- ${l}`).join("\n"));
  }

  if (veils.length) {
    sections.push("### VEILS (Approach carefully — handle with sensitivity or fade to black)\n" +
      veils.map(v => `- ${v}`).join("\n"));
  }

  if (privateLines.length) {
    sections.push("### PRIVATE LINES (Player-specific — visible to this player and GM only)\n" +
      privateLines.map(l => `- ${l}`).join("\n"));
  }

  return sections.join("\n\n");
}


/**
 * Estimate the token count for the safety context string.
 * Rough approximation: ~4 characters per token.
 * Used by the assembler for budget tracking — safety is exempt from the cap
 * but the assembler still needs to know how many tokens it consumes.
 *
 * @param {string} safetyContext
 * @returns {number}
 */
export function estimateSafetyTokens(safetyContext) {
  return Math.ceil(safetyContext.length / 4);
}


/**
 * Check whether an X-Card signal should suppress context for the current scene.
 * If the X-Card has been triggered (thread closed), narration stops entirely.
 * This is checked by the assembler before building any packet.
 *
 * @param {Object} sessionState — SessionSchema
 * @returns {boolean}
 */
export function isSceneSuppressed(sessionState) {
  if (!sessionState) return false;
  return sessionState.xCardActive === true;
}


// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Merge campaign-level Lines with any session-level additions.
 * Session Lines supplement campaign Lines — they do not replace them.
 * Deduplicates by exact string match.
 */
function mergeLines(campaignState, sessionState) {
  const base    = campaignState.safety?.lines ?? [];
  const session = sessionState?.safetyOverrides?.additionalLines ?? [];
  return deduplicate([...base, ...session]);
}

/**
 * Merge campaign-level Veils with any session-level additions.
 */
function mergeVeils(campaignState, sessionState) {
  const base    = campaignState.safety?.veils ?? [];
  const session = sessionState?.safetyOverrides?.additionalVeils ?? [];
  return deduplicate([...base, ...session]);
}

/**
 * Resolve private Lines for the current player.
 * Returns only Lines belonging to the requesting user.
 * If currentUserId is null (e.g. system call), returns empty.
 * GM receives all private Lines.
 *
 * @param {Object} campaignState
 * @param {string|null} currentUserId
 * @returns {string[]}
 */
function resolvePrivateLines(campaignState, currentUserId) {
  if (!currentUserId) return [];

  const privateLines = campaignState.safety?.privateLines ?? [];

  // If the caller is the GM, return all private lines (GM needs full picture)
  // GM check is done by the assembler before calling this function and passing
  // a special "gm" sentinel — avoids a Foundry globals dependency here.
  if (currentUserId === "gm") {
    return privateLines.flatMap(entry => entry.lines ?? []);
  }

  // Otherwise return only lines belonging to this player
  const entry = privateLines.find(e => e.playerId === currentUserId);
  return entry?.lines ?? [];
}

/** Remove exact string duplicates, preserving order. */
function deduplicate(arr) {
  return [...new Set(arr)];
}
