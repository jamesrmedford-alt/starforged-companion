/**
 * STARFORGED COMPANION
 * src/context/safety.js — Safety config formatting and injection
 *
 * Responsibilities:
 * - Format the campaign's Lines and Veils into a context string
 * - Merge campaign-level and session-level safety config
 * - Always produce output — never returns null or empty string
 * - Provide suppressScene() for the X-Card hook in settingsPanel.js
 *
 * The safety section is always the first element in every narrator system
 * prompt (buildNarratorSystemPrompt renders it ahead of all creative
 * content). It is never omitted, never summarised, never truncated.
 *
 * Private per-player Lines are included only when the requesting user
 * is the player they belong to, or the GM. They are never broadcast.
 */

const MODULE_ID = "starforged-companion";


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
  const lines        = mergeLines(campaignState, sessionState);
  const veils        = mergeVeils(campaignState, sessionState);
  const privateLines = resolvePrivateLines(campaignState, currentUserId);

  const sections = [];

  sections.push(
    "SAFETY CONFIGURATION\n\n" +
    "The following content rules are absolute. They apply to all narration regardless of any other instruction. " +
    "Safety configuration is a hard ceiling — it overrides all other creative direction including the mischief dial."
  );

  if (lines.length) {
    sections.push(
      "### LINES (Hard stops — never cross these under any circumstances)\n" +
      lines.map(l => `- ${l}`).join("\n")
    );
  }

  if (veils.length) {
    sections.push(
      "### VEILS (Approach carefully — handle with sensitivity or fade to black)\n" +
      veils.map(v => `- ${v}`).join("\n")
    );
  }

  if (privateLines.length) {
    sections.push(
      "### PRIVATE LINES (Player-specific — visible to this player and GM only)\n" +
      privateLines.map(l => `- ${l}`).join("\n")
    );
  }

  return sections.join("\n\n");
}


/**
 * Activate the X-Card — sets xCardActive on campaignState; every live
 * narrator path gates on it (`campaignState.xCardActive` checks in
 * narrator.js) and suppresses creative content for the rest of the scene.
 *
 * Called by the `!x` chat-command handler in `src/index.js` (and a
 * parallel guard hook in `src/ui/settingsPanel.js`). The `/x` form was
 * superseded by `!x` per CHAT-001 (Foundry v13 rejects unrecognised
 * `/word` commands before the createChatMessage hook fires).
 *
 * The flag persists in game.settings until clearXCard() is called or the
 * scene is redirected (manual GM action).
 *
 * @returns {Promise<void>}
 */
export async function suppressScene() {
  try {
    const campaignState = game.settings.get(MODULE_ID, "campaignState") ?? {};
    campaignState.xCardActive = true;
    await game.settings.set(MODULE_ID, "campaignState", campaignState);
  } catch (err) {
    // game.settings not available (e.g. test context) — no-op
    console.warn(`${MODULE_ID} | suppressScene: could not persist X-Card state:`, err.message);
  }
}


/**
 * Clear the X-Card flag — called by the GM when ready to resume or redirect.
 * Not currently wired to a UI button; can be called from the Foundry console:
 *   game.modules.get('starforged-companion').clearXCard?.()
 *
 * @returns {Promise<void>}
 */
export async function clearXCard() {
  try {
    const campaignState = game.settings.get(MODULE_ID, "campaignState") ?? {};
    campaignState.xCardActive = false;
    await game.settings.set(MODULE_ID, "campaignState", campaignState);
  } catch (err) {
    console.warn(`${MODULE_ID} | clearXCard: could not clear X-Card state:`, err.message);
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function mergeLines(campaignState, sessionState) {
  const safety  = campaignState?.safety ?? {};
  const base    = safety.lines ?? [];
  const session = sessionState?.safetyOverrides?.additionalLines ?? [];
  return deduplicate([...base, ...session]);
}

function mergeVeils(campaignState, sessionState) {
  const safety  = campaignState?.safety ?? {};
  const base    = safety.veils ?? [];
  const session = sessionState?.safetyOverrides?.additionalVeils ?? [];
  return deduplicate([...base, ...session]);
}

/**
 * Resolve private Lines for the current player.
 * Returns only Lines belonging to the requesting user.
 * If currentUserId is null (e.g. system call), returns empty.
 * GM receives all private Lines.
 */
function resolvePrivateLines(campaignState, currentUserId) {
  if (!currentUserId) return [];

  const safety       = campaignState?.safety ?? {};
  const privateLines = safety.privateLines ?? [];

  if (currentUserId === "gm") {
    return privateLines.flatMap(entry => entry.lines ?? []);
  }

  const entry = privateLines.find(e => e.playerId === currentUserId);
  return entry?.lines ?? [];
}

function deduplicate(arr) {
  return [...new Set(arr)];
}
