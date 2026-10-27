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
 * Private per-player Lines: the shared narrator prompt carries every
 * player's lines when a GM's client builds it, and only the building
 * player's own when a player's client does (formatNarratorSafetyContext);
 * the Private Channel carries its player's own. They are never shown to
 * another player or sent in another player's request — but they do sit in
 * the world-scoped campaignState, which every client receives.
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
      "### PRIVATE LINES (Hard stops set privately by players — never cross these, and never mention or hint at them)\n" +
      privateLines.map(l => `- ${l}`).join("\n")
    );
  }

  return sections.join("\n\n");
}

/**
 * The safety block for shared narration built on this client — the narrator
 * system prompt (buildNarratorSystemPrompt) uses it; the Private Channel
 * passes its player's id to formatSafetyContext instead.
 *
 * Private Lines (decisions.md → "Private Lines in shared narration"):
 * - A GM's client builds for the whole table, so every player's lines go in,
 *   from campaignState.safety.privateLines (the GM-side copy the
 *   `safety.syncPrivateLines` relay keeps). Players never see the prompt.
 * - A player's client narrates only when no keyed GM is online. It carries
 *   that player's own lines, never another player's, read from the player's
 *   client setting — the canonical store; the campaignState copy is stale or
 *   missing when no GM was online to relay them to.
 *
 * @param {Object} campaignState — CampaignStateSchema
 * @returns {string}             — Formatted safety context, always non-empty
 */
export function formatNarratorSafetyContext(campaignState) {
  const user = globalThis.game?.user;
  if (user?.isGM) return formatSafetyContext(campaignState, null, "gm");
  if (!user?.id) return formatSafetyContext(campaignState);

  const lines  = readOwnPrivateLines();
  const safety = {
    ...(campaignState?.safety ?? {}),
    privateLines: lines.length ? [{ playerId: user.id, lines }] : [],
  };
  return formatSafetyContext({ ...(campaignState ?? {}), safety }, null, user.id);
}

/**
 * This client's own Private Lines — the client-scoped `privateLines` setting
 * the settings panel writes (SETTING.PRIVATE_LINES, src/ui/settingsPanel.js).
 */
function readOwnPrivateLines() {
  try {
    const lines = game.settings.get(MODULE_ID, "privateLines");
    return Array.isArray(lines)
      ? lines.filter(l => typeof l === "string" && l.trim()).map(l => l.trim())
      : [];
  } catch (err) {
    console.warn(`${MODULE_ID} | Private Lines: could not read this player's own lines:`, err?.message ?? err);
    return [];
  }
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
 * When the write fails on a relayed play, the player's card already says the
 * scene is paused (a relay has no ack), so the GM posts a card saying the
 * pause was not saved (issue #302). A local caller posts its own card.
 *
 * @param {Object} [_payload] — relay payload (unused)
 * @param {Object} [ctx]      — relay context (anyone may play the X-Card; `local: false` on a relayed play)
 * @returns {Promise<boolean>} true when the pause was persisted
 */
export async function suppressScene(_payload, ctx) {
  try {
    // A copy: a write that fails must leave this client's cached value as it
    // was, or the narrator here would hold a pause that never landed (#302).
    const cs = { ...(game.settings.get(MODULE_ID, "campaignState") ?? {}) };
    cs.xCardActive = true;
    await game.settings.set(MODULE_ID, "campaignState", cs);
    return true;
  } catch (err) {
    console.warn(`${MODULE_ID} | suppressScene: could not persist X-Card state:`, err.message);
    if (ctx?.local === false) {
      await postXCardCard({ recorded: false, reason: "not-saved" }).catch(postErr =>
        console.warn(`${MODULE_ID} | suppressScene: could not post the "not saved" card:`, postErr?.message ?? postErr));
    }
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
    // A copy: a failed write must not leave this client's cached value saying
    // the X-Card is cleared — the narrator here would resume (issue #302).
    const cs = { ...(game.settings.get(MODULE_ID, "campaignState") ?? {}) };
    cs.xCardActive = false;
    await game.settings.set(MODULE_ID, "campaignState", cs);
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
 * post the X-Card card. When no GM is connected the pause cannot be recorded,
 * and on the canonical GM a write that fails is not recorded either; the card
 * says so rather than claiming a pause that never landed (issue #302). A
 * relayed play has no ack: its card says paused, and the GM's handler reports
 * a write that failed (suppressScene).
 *
 * Callers: the typed `!x` pre-creation hook (src/ui/settingsPanel.js).
 *
 * @returns {Promise<{ recorded: boolean }>}
 */
export async function playXCard() {
  let recorded = false;
  let reason = "no-gm";
  try {
    const { requestGmAction } = await import("../multiplayer/gmRelay.js");
    const res = await requestGmAction("xcard.activate", {});
    recorded = res?.ok === true && res.result !== false;
    if (res?.ok === true && !recorded) reason = "not-saved";
  } catch (err) {
    console.error(`${MODULE_ID} | X-Card: could not request the scene pause:`, err);
    reason = "not-saved";
  }
  await postXCardCard({ recorded, reason });
  return { recorded };
}

/**
 * Post the X-Card chat card. Flagged `type: "xcard"` + `xcardCard: true` so
 * the `!x` command predicate never re-triggers on it. When the pause was
 * recorded the card carries a "Resume narration" button (GM-only — see
 * bindXCardCard); when it was not, the card says why: no GM is connected
 * (`reason: "no-gm"`), or the GM could not save it (`"not-saved"`).
 *
 * @param {{ recorded?: boolean, reason?: "no-gm"|"not-saved" }} [opts]
 * @returns {Promise<Object>} the created ChatMessage
 */
export async function postXCardCard({ recorded = true, reason = "no-gm" } = {}) {
  const unrecorded = reason === "not-saved"
    ? `<p class="xcard-unrecorded"><strong>The pause could not be saved.</strong>
              The narrator will not hold the scene; play the X-Card again.</p>`
    : `<p class="xcard-unrecorded"><strong>The pause could not be recorded — no GM is connected.</strong>
              The narrator will not hold the scene until a GM joins; play the X-Card again once one has.</p>`;
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
            ${unrecorded}`;

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
 * "gm" (a GM's client building shared narration) receives every player's
 * Lines, deduplicated.
 */
function resolvePrivateLines(campaignState, currentUserId) {
  if (!currentUserId) return [];

  const safety       = campaignState?.safety ?? {};
  const privateLines = safety.privateLines ?? [];

  if (currentUserId === "gm") {
    return deduplicate(privateLines.flatMap(entry => entry.lines ?? []));
  }

  const entry = privateLines.find(e => e.playerId === currentUserId);
  return entry?.lines ?? [];
}

function deduplicate(arr) {
  return [...new Set(arr)];
}
