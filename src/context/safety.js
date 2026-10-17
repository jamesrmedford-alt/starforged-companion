/**
 * STARFORGED COMPANION
 * src/context/safety.js — Safety config formatting and injection
 *
 * Responsibilities:
 * - Format the campaign's Lines and Veils into a context string
 * - Merge campaign-level and session-level safety config
 * - Always produce output — never returns null or empty string
 * - X-Card: suppressScene() (the canonical-GM "xcard.activate" relay
 *   handler), playXCard() / postXCardCard() (play + card, any client),
 *   resumeNarrationAfterXCard() / clearXCard() and the card's GM-only
 *   resume button binder bindXCardCard()
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
 * This is the GM-relay handler for `"xcard.activate"` (GM_ACTIONS in
 * src/multiplayer/gmRelay.js): it runs on the canonical GM, because
 * campaignState is world-scoped and a player's client cannot write it.
 * Callers never invoke it directly from a player client — they go through
 * playXCard() below (typed `!x`) or requestGmAction("xcard.activate").
 *
 * The flag persists in game.settings until a GM resumes narration (the
 * X-Card card's "Resume narration" button, `!x clear`, or the module API's
 * clearXCard).
 *
 * @param {Object} [_payload] — relay payload (unused)
 * @param {Object} [_ctx]     — relay context (unused — anyone may play the X-Card)
 * @returns {Promise<boolean>} true when the pause was persisted
 */
export async function suppressScene(_payload, _ctx) {
  try {
    const campaignState = game.settings.get(MODULE_ID, "campaignState") ?? {};
    campaignState.xCardActive = true;
    await game.settings.set(MODULE_ID, "campaignState", campaignState);
    return true;
  } catch (err) {
    console.warn(`${MODULE_ID} | suppressScene: could not persist X-Card state:`, err.message);
    return false;
  }
}


/**
 * Clear the X-Card flag — the GM is ready to resume or redirect. Must run on
 * a GM client (campaignState is world-scoped). Production callers:
 *   - resumeNarrationAfterXCard() — the X-Card card's GM-only "Resume
 *     narration" button and the GM's typed `!x clear`;
 *   - the module API (`game.modules.get('starforged-companion').api.clearXCard`).
 *
 * @returns {Promise<boolean>} true when the flag was cleared
 */
export async function clearXCard() {
  try {
    const campaignState = game.settings.get(MODULE_ID, "campaignState") ?? {};
    campaignState.xCardActive = false;
    await game.settings.set(MODULE_ID, "campaignState", campaignState);
    return true;
  } catch (err) {
    console.warn(`${MODULE_ID} | clearXCard: could not clear X-Card state:`, err.message);
    return false;
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// X-CARD — play / card / resume
// ─────────────────────────────────────────────────────────────────────────────

/** data-action of the GM-only resume button on the X-Card card. */
export const XCARD_RESUME_ACTION = "sf-xcard-resume";

/**
 * Play the X-Card from this client: ask the canonical GM to record the pause
 * (requestGmAction — local on the canonical GM, socket relay elsewhere) and
 * post the X-Card card. When no GM is connected the pause cannot be recorded;
 * the card says so rather than claiming a pause that never landed.
 *
 * Callers: the typed `!x` pre-creation hook (src/ui/settingsPanel.js).
 *
 * @returns {Promise<{ recorded: boolean }>}
 */
export async function playXCard() {
  let recorded = false;
  try {
    const { requestGmAction } = await import("../multiplayer/gmRelay.js");
    const res = await requestGmAction("xcard.activate", {});
    recorded = res?.ok === true;
  } catch (err) {
    console.error(`${MODULE_ID} | X-Card: could not request the scene pause:`, err);
  }
  await postXCardCard({ recorded });
  return { recorded };
}

/**
 * Post the X-Card chat card. Flagged `type: "xcard"` + `xcardCard: true` so
 * the `!x` command predicate never re-triggers on it. When the pause was
 * recorded the card carries a "Resume narration" button (GM-only — see
 * bindXCardCard); when it was not, the card says the pause could not be
 * recorded until a GM joins.
 *
 * @param {{ recorded?: boolean }} [opts]
 * @returns {Promise<Object>} the created ChatMessage
 */
export async function postXCardCard({ recorded = true } = {}) {
  const body = recorded
    ? `<p class="xcard-message">
              Scene paused. Current content is suppressed.<br>
              The story will redirect at the next narration beat.
            </p>
            <div class="xcard-actions">
              <button type="button" data-action="${XCARD_RESUME_ACTION}">Resume narration</button>
            </div>`
    : `<p class="xcard-message">
              Scene paused at the table.
            </p>
            <p class="xcard-unrecorded"><strong>The pause could not be recorded — no GM is connected.</strong>
              The narrator will not hold the scene until a GM joins; play the X-Card again once one has.</p>`;

  return ChatMessage.create({
    content: `
      <div class="starforged-move-card xcard-card">
        <div class="move-header">
          <span class="move-type">X-Card</span>
        </div>
        <div class="move-body">
            ${body}
        </div>
      </div>
    `.trim(),
    flags: { [MODULE_ID]: { type: "xcard", xcardCard: true, xcardRecorded: recorded } },
  });
}

/**
 * GM resume: clear the X-Card flag, mark every open X-Card card resolved
 * (disables their resume buttons on all clients) and post an "X-Card
 * cleared" card. GM-only — a non-GM caller is refused with a warning.
 *
 * Callers: the X-Card card's resume button (bindXCardCard) and the typed
 * `!x clear` (src/ui/settingsPanel.js).
 *
 * @returns {Promise<boolean>} true when the flag was cleared
 */
export async function resumeNarrationAfterXCard() {
  if (!game.user?.isGM) {
    console.warn(`${MODULE_ID} | X-Card: only a GM can resume narration.`);
    ui.notifications?.warn?.("Only a GM can clear the X-Card and resume narration.");
    return false;
  }

  const cleared = await clearXCard();
  if (!cleared) {
    ui.notifications?.error?.("Starforged Companion: the X-Card could not be cleared. Check the console.");
    return false;
  }

  await markOpenXCardCardsResolved();

  await ChatMessage.create({
    content: `
      <div class="starforged-move-card xcard-card xcard-cleared">
        <div class="move-header">
          <span class="move-type">X-Card cleared</span>
        </div>
        <div class="move-body">
          <p class="xcard-message">The GM has resumed narration.</p>
        </div>
      </div>
    `.trim(),
    flags: { [MODULE_ID]: { xcardClearedCard: true } },
  });
  return true;
}

/**
 * Flag every unresolved X-Card card resolved so its resume button renders
 * disabled. Per-card failures are logged and skipped — the flag itself is
 * already cleared, so a stale button only re-runs an idempotent clear.
 */
async function markOpenXCardCardsResolved() {
  const messages = game.messages?.contents ?? Array.from(game.messages ?? []);
  for (const msg of messages) {
    const flags = msg?.flags?.[MODULE_ID];
    if (!flags?.xcardCard || flags.xcardResolved) continue;
    try {
      await msg.update({ [`flags.${MODULE_ID}.xcardResolved`]: true });
    } catch (err) {
      console.warn(`${MODULE_ID} | X-Card: could not mark card ${msg?.id} resolved:`, err?.message ?? err);
    }
  }
}

/**
 * Chat-render binder for X-Card cards (registered via onChatMessageRender in
 * src/ui/settingsPanel.js registerXCardHook). The resume button is removed for
 * non-GM viewers, rendered disabled once the card is resolved, and otherwise
 * wired to resumeNarrationAfterXCard().
 *
 * @param {Object} message — ChatMessage
 * @param {HTMLElement} root
 */
export function bindXCardCard(message, root) {
  const flags = message?.flags?.[MODULE_ID];
  if (!flags?.xcardCard) return;
  const btn = root?.querySelector?.(`[data-action="${XCARD_RESUME_ACTION}"]`);
  if (!btn) return;

  if (!game.user?.isGM) {
    btn.remove();
    return;
  }
  if (flags.xcardResolved) {
    btn.disabled = true;
    btn.textContent = "Narration resumed";
    return;
  }

  btn.addEventListener("click", async (event) => {
    event.preventDefault();
    if (btn.disabled) return;
    btn.disabled = true;
    try {
      const ok = await resumeNarrationAfterXCard();
      if (!ok) btn.disabled = false;
    } catch (err) {
      console.error(`${MODULE_ID} | X-Card: resume failed:`, err);
      btn.disabled = false;
    }
  });
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
