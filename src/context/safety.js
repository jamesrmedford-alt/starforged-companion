/**
 * STARFORGED COMPANION
 * src/context/safety.js — Safety config formatting and injection
 *
 * Responsibilities:
 * - Format the campaign's Lines and Veils into a context string
 * - Merge campaign-level and session-level safety config
 * - Always produce output — never returns null or empty string
 * - X-Card: suppressScene() (the canonical-GM "xcard.activate" relay
 *   handler), registerXCardLatePostHook() (a narration posted after the
 *   pause — XCARD-POST-RACE), playXCard() / postXCardCard() (play + card, any client),
 *   resumeNarrationAfterXCard() / clearXCard() and the card's GM-only
 *   resume button binder bindXCardCard(); isNarrationXCarded() — the live
 *   check every capture write makes (XCARD-LATE-CAPTURE)
 *
 * The safety section is always the first element in every narrator system
 * prompt (buildNarratorSystemPrompt renders it ahead of all creative
 * content). It is never omitted, never summarised, never truncated.
 *
 * Private per-player Lines: the shared narrator prompt carries every
 * player's lines when a GM's client builds it, and only the building
 * player's own when a player's client does (formatNarratorSafetyContext);
 * the Private Channel carries its player's own (formatOwnSafetyContext —
 * from their client setting, as a player's shared narration does). They are
 * never shown to another player or sent in another player's request — but
 * they do sit in the world-scoped campaignState, which every client receives.
 */

import { runCampaignStateWriteNow, serialiseCampaignStateWrite } from "../multiplayer/campaignStateChain.js";
import { isCanonicalGM } from "../multiplayer/gmGate.js";

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
 * builds its player's block with formatOwnSafetyContext instead.
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
  return formatOwnSafetyContext(campaignState, user.id);
}

/**
 * The safety block of a request built for one user alone: the campaign's
 * Lines and Veils and that user's own Private Lines, never another user's —
 * the Private Channel (buildPrivateContext, src/private-channel/context.js)
 * and shared narration on a player's client (formatNarratorSafetyContext).
 *
 * On the user's own client their lines are read from their client setting,
 * the canonical store: the campaignState copy holds them only once a GM has
 * relayed them, so a line the player added while no GM was online was
 * missing from their own Private Channel (issue #345 AA03). Another user's
 * lines can only come from that copy.
 *
 * @param {Object} campaignState — CampaignStateSchema
 * @param {string} userId        — the Foundry user the request is for
 * @returns {string}             — Formatted safety context, always non-empty
 */
export function formatOwnSafetyContext(campaignState, userId) {
  if (!userId || userId !== globalThis.game?.user?.id) {
    return formatSafetyContext(campaignState, null, userId ?? null);
  }
  const lines  = readOwnPrivateLines();
  const safety = {
    ...(campaignState?.safety ?? {}),
    privateLines: lines.length ? [{ playerId: userId, lines }] : [],
  };
  return formatSafetyContext({ ...(campaignState ?? {}), safety }, null, userId);
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
 * clearXCard). Each play also counts in `xCardPlays`, which resuming never
 * lowers: a narration that started before the play compares the count, so it
 * stays discarded even when a GM resumes before its reply returns (issue
 * #306 R01; narrator.js watchXCard).
 *
 * When the write fails on a relayed play, the player's card already says the
 * scene is paused (a relay has no ack), so the GM posts a card saying the
 * pause was not saved (issue #302). A local caller posts its own card.
 *
 * The narration the card answers also leaves narrator memory (issue #321
 * U07 — full exclusion; narrator.js applyXCardToNarratorMemory says which
 * cards): in the same write as the pause, the ledger entries its sidecar
 * wrote are retracted, a rolling summary that covered it loses its text, and
 * the first narration after a GM resumes is told to redirect. After the
 * write its cards are flagged `xCarded` (out of the recent-narration ring and
 * the rolling summary) and the retracted facts reach the tier details and
 * lore that copied them (propagateRetraction). The pause comes first: if the
 * memory side fails, the pause is still written.
 *
 * The pause jumps this client's campaignState write chain
 * (runCampaignStateWriteNow): written at once, behind no other write, and
 * every chained write that has not yet read the store waits for it to land —
 * an oracle card captured while it was on its way carried `xCardActive: false`
 * back (CAMPSTATE-CHAIN-PARTIAL).
 *
 * @param {Object} [_payload] — relay payload (unused)
 * @param {Object} [ctx]      — relay context (anyone may play the X-Card; `local: false` on a relayed play)
 * @returns {Promise<boolean>} true when the pause was persisted
 */
export async function suppressScene(_payload, ctx) {
  // Loaded before the store is read, so nothing awaits between the read and
  // the write below (the X-Card runs unqueued on that guarantee).
  const narrator = await import("../narration/narrator.js").catch((err) => {
    console.warn(`${MODULE_ID} | X-Card: narrator memory unavailable — the pause is recorded, the narration is not removed:`, err?.message ?? err);
    return null;
  });
  let removal = NO_REMOVAL;
  try {
    await runCampaignStateWriteNow(() => {
      // A copy: a write that fails must leave this client's cached value as
      // it was, or the narrator here would hold a pause that never landed (#302).
      const cs = { ...(game.settings.get(MODULE_ID, "campaignState") ?? {}) };
      cs.xCardActive = true;
      cs.xCardPlays = (Number(cs.xCardPlays) || 0) + 1;
      removal = removeXCardedNarration(narrator, cs);
      return game.settings.set(MODULE_ID, "campaignState", cs);
    }, "X-Card pause");
  } catch (err) {
    console.warn(`${MODULE_ID} | suppressScene: could not persist X-Card state:`, err.message);
    if (ctx?.local === false) {
      await postXCardCard({ recorded: false, reason: "not-saved" }).catch(postErr =>
        console.warn(`${MODULE_ID} | suppressScene: could not post the "not saved" card:`, postErr?.message ?? postErr));
    }
    return false;
  }
  await finishXCardRemoval(narrator, removal);
  return true;
}

const NO_REMOVAL = Object.freeze({ cards: [], retracted: [] });

/**
 * A narration that posts its card after the X-Card's pause landed
 * (XCARD-POST-RACE — the #300 F13 shape). Its reply passed its interrupted
 * check (narrator.js watchXCard) just before the play, its sidecar was
 * applied, and its card's creation was on its way while the pause's pick ran:
 * the pick answered the beat the table could see, and this card then posted
 * unflagged, its facts live, into a paused scene. Every narrator path stands
 * down while the X-Card is active, so a narration card created while it is
 * active is one of these: it is removed as an X-Card removes one — flagged
 * `xCarded`, its ledger entries retracted and its id kept on
 * `xCardedNarrationIds` (its capture, a relayed sidecar and a stale merge then
 * write nothing), its oracle results dropped, its capture undone. Canonical
 * GM, on its campaignState write chain. Registered at `ready` (index.js).
 */
export function registerXCardLatePostHook() {
  Hooks.on("createChatMessage", onNarrationPostedDuringPause);
}

function onNarrationPostedDuringPause(message) {
  try {
    if (!isCanonicalGM()) return undefined;
    const f = message?.flags?.[MODULE_ID];
    if (!f?.narratorCard || typeof f.narrationText !== "string" || !f.narrationText.trim()) return undefined;
    if (f.narrationFallback || f.publishedReflection || f.xCarded || f.burnSuperseded) return undefined;
    const cs = game.settings.get(MODULE_ID, "campaignState");
    if (!cs?.xCardActive || (f.sessionId ?? null) !== (cs.currentSessionId ?? null)) return undefined;
    return removeNarrationPostedDuringPause(message).catch(err =>
      console.warn(`${MODULE_ID} | X-Card: removing a narration that posted after the pause failed:`, err?.message ?? err));
  } catch (err) {
    console.warn(`${MODULE_ID} | X-Card: checking a narration posted during the pause failed:`, err?.message ?? err);
    return undefined;
  }
}

async function removeNarrationPostedDuringPause(message) {
  const narrator = await import("../narration/narrator.js");
  let removal = NO_REMOVAL;
  await serialiseCampaignStateWrite(() => {
    // A copy, as the pause's own write (#302).
    const cs = { ...(game.settings.get(MODULE_ID, "campaignState") ?? {}) };
    removal = narrator.applyXCardToNarratorMemory(cs, { cards: [message] });
    if (!removal.cards.length) return undefined;
    return game.settings.set(MODULE_ID, "campaignState", cs);
  }, "X-Card: a narration posted after the pause");
  console.info(`${MODULE_ID} | X-Card: a narration whose card posted after the pause was removed with it.`);
  await finishXCardRemoval(narrator, removal);
}

/**
 * True when an X-Card removed this narration: its id is on the STORED
 * campaignState's `xCardedNarrationIds`, which the pause's own write sets
 * (applyXCardToNarratorMemory). Read live, never from a caller's copy — a
 * narration's capture (the detection and tier passes, ~2 s after it posts,
 * then a Claude call) holds a copy from before the X-Card, and every capture
 * write checks this right before it writes, so nothing is recorded for the
 * removed narration once the X-Card's finish has undone what came before
 * (XCARD-LATE-CAPTURE). False for no id, or when the store cannot be read.
 *
 * @param {string|null|undefined} narrationId
 * @returns {boolean}
 */
export function isNarrationXCarded(narrationId) {
  if (typeof narrationId !== "string" || !narrationId) return false;
  try {
    const removed = game.settings.get(MODULE_ID, "campaignState")?.xCardedNarrationIds;
    return Array.isArray(removed) && removed.includes(narrationId);
  } catch (err) {
    console.debug?.(`${MODULE_ID} | X-Card: the removed narrations could not be read:`, err?.message ?? err);
    return false;
  }
}

/**
 * Take the narration this X-Card answers out of narrator memory on `cs`, the
 * copy about to be written (narrator.js applyXCardToNarratorMemory).
 * Synchronous, and never throws — the pause is written regardless.
 *
 * @param {Object|null} narrator — the narrator module
 * @param {Object} cs
 * @returns {{ cards: Object[], retracted: Object[] }}
 */
function removeXCardedNarration(narrator, cs) {
  if (typeof narrator?.applyXCardToNarratorMemory !== "function") return NO_REMOVAL;
  try {
    return narrator.applyXCardToNarratorMemory(cs);
  } catch (err) {
    console.warn(`${MODULE_ID} | X-Card: removing the narration from narrator memory failed — the pause is recorded:`, err?.message ?? err);
    return NO_REMOVAL;
  }
}

/**
 * After the pause is written: flag the X-carded cards (the ring and the
 * rolling summary leave them out), undo what the narrations wrote outside the
 * ledgers by their narration id (the ship's position; the capture's World
 * Journal entries, Session Log beats and tier details — issue #329 X01), and
 * carry their retracted facts to the stores that copied them — entity tier
 * details and this session's lore (rules/narrator-memory.md 6b: every
 * correction path calls propagateRetraction). Last, the session's Session Log
 * summary, which End a Session wrote: its story goes when the summary it was
 * written from was dropped, and its lore list loses what was retracted
 * (issue #345 AA27). Fail-open per step.
 *
 * @param {Object|null} narrator
 * @param {{ cards: Object[], retracted: Object[], sessionId?: string|null, summaryDropped?: boolean }} removal
 * @returns {Promise<void>}
 */
async function finishXCardRemoval(narrator, removal) {
  if (!removal.cards.length) return;
  await narrator.flagXCardedCards(removal.cards);
  const ids = removal.cards.map(m => m?.flags?.[MODULE_ID]?.narrationId).filter(id => typeof id === "string" && id);
  // A ship move the removed narration made is undone with its ledger facts
  // (issue #325 W07): the position record carries the narration's id.
  if (typeof narrator.restoreShipPositionAfterXCard === "function") {
    await narrator.restoreShipPositionAfterXCard(ids);
  }
  // So does what its capture recorded — lore, threats, factions, places,
  // Session Log beats and tier details, which mostly restate no sidecar truth
  // and so are out of propagateRetraction's reach (issue #329 X01).
  if (ids.length) {
    try {
      const { retractNarrationCapture } = await import("../factContinuity/retractions.js");
      await retractNarrationCapture(ids);
    } catch (err) {
      console.warn(`${MODULE_ID} | X-Card: undoing what the narration's capture recorded failed:`, err?.message ?? err);
    }
    // The Chronicle entries the scribe wrote from it — the Chronicle feeds
    // the campaign recap and, pinned, every CHARACTER block (XCARD-CHRONICLE).
    try {
      const { retractNarrationChronicle } = await import("../character/chronicle.js");
      await retractNarrationChronicle(ids);
    } catch (err) {
      console.warn(`${MODULE_ID} | X-Card: removing the narration's Chronicle entries failed:`, err?.message ?? err);
    }
    // A connection the narration created (a Make a Connection hit) goes with
    // it while nobody has used it; one the table has used stays, and the GMs
    // are told so (issue #338 D6(ii)). After the capture undo, which takes
    // the narration's own details off the card first.
    try {
      const { retractNarrationConnections } = await import("../entities/connection.js");
      const { kept } = await retractNarrationConnections(ids);
      if (kept.length) await postKeptConnectionsNotice(kept);
    } catch (err) {
      console.warn(`${MODULE_ID} | X-Card: removing the connections the narration created failed:`, err?.message ?? err);
    }
    // A name it took off the Dismissed list — a Make a Connection on a
    // dismissed NPC, an identity reveal onto a dismissed name — is dismissed
    // again, once the connection and the rename are settled above
    // (XCARD-KEEPS-UNDISMISS). Fail-open inside.
    try {
      const { restoreNarrationDismissals } = await import("../entities/entityExtractor.js");
      await restoreNarrationDismissals(ids);
    } catch (err) {
      console.warn(`${MODULE_ID} | X-Card: dismissing again the names the narration un-dismissed failed:`, err?.message ?? err);
    }
  }
  if (removal.retracted.length) {
    try {
      const { propagateRetraction } = await import("../factContinuity/retractions.js");
      // propagateRetraction reads the session id and marks a copy's summary;
      // the summary was settled in the pause's write.
      const cs = { ...(game.settings.get(MODULE_ID, "campaignState") ?? {}) };
      for (const truth of removal.retracted) await propagateRetraction(truth, cs);
    } catch (err) {
      console.warn(`${MODULE_ID} | X-Card: carrying the retracted facts to entity details and lore failed:`, err?.message ?? err);
    }
  }
  // An X-Card played after End a Session: the Session Log's "Story so far"
  // End wrote kept telling the removed beat (issue #345 AA27). After the
  // undo and the propagation, so the lore they retracted leaves its list.
  try {
    const { retractSessionLogSummary } = await import("../world/worldJournal.js");
    await retractSessionLogSummary(removal.sessionId ?? null, { narrative: removal.summaryDropped === true });
  } catch (err) {
    console.warn(`${MODULE_ID} | X-Card: revising the Session Log's summary failed:`, err?.message ?? err);
  }
}

/**
 * Whisper the GMs, once per X-Card, the connections the removed narration
 * created that stay because the table has used them since (issue #338
 * D6(ii)). Names them without pronouns — what to do is the table's call.
 *
 * @param {Array<{ name: string }>} kept
 * @returns {Promise<Object|null>} the created ChatMessage
 */
async function postKeptConnectionsNotice(kept) {
  const whisper = (game.users?.filter?.(u => u.isGM) ?? []).map(u => u.id);
  const lines = kept.map(({ name }) => {
    const who = escapeHtml(name);
    return `<li><strong>${who}</strong>, a connection the removed narration created, remains: the table has used the card since. `
      + `If the table wants ${who} gone, delete the NPC card and its bond on the character sheet.</li>`;
  }).join("");
  return ChatMessage.create({
    content: `
      <div class="starforged-move-card xcard-card xcard-connection-notice">
        <div class="move-header">
          <span class="move-type">X-Card</span>
        </div>
        <div class="move-body"><ul>${lines}</ul></div>
      </div>
    `.trim(),
    whisper,
    flags: { [MODULE_ID]: { xcardConnectionNotice: true } },
  });
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}


/**
 * Clear the X-Card flag — the GM is ready to resume or redirect. Must run on
 * a GM client (campaignState is world-scoped). Production callers:
 *   - resumeNarrationAfterXCard() — the X-Card card's GM-only "Resume
 *     narration" button and the GM's typed `!x clear`;
 *   - the module API (`game.modules.get('starforged-companion').api.clearXCard`).
 *
 * On this client's campaignState write chain: read once the writes ahead of
 * it — the pause itself among them — have landed. Read inside the pause's
 * round trip, it put back the play count and narrator memory from before the
 * pause (CAMPSTATE-CHAIN-PARTIAL).
 *
 * @returns {Promise<boolean>} true when the flag was cleared
 */
export async function clearXCard() {
  try {
    await serialiseCampaignStateWrite(() => {
      // A copy: a failed write must not leave this client's cached value
      // saying the X-Card is cleared — the narrator here would resume (#302).
      const cs = { ...(game.settings.get(MODULE_ID, "campaignState") ?? {}) };
      cs.xCardActive = false;
      return game.settings.set(MODULE_ID, "campaignState", cs);
    }, "X-Card resume");
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
    const { requestGmAction, onlyStoodDownGMs } = await import("../multiplayer/gmRelay.js");
    const res = await requestGmAction("xcard.activate", {});
    recorded = res?.ok === true && res.result !== false;
    if (res?.ok === true && !recorded) reason = "not-saved";
    // A GM is connected but its page stood down after its connection dropped:
    // nothing can record the pause until it reloads (issue #347
    // AB19-STALE-CACHE-WRITES).
    if (!recorded && res?.reason === "no-gm" && onlyStoodDownGMs()) reason = "gm-reload";
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
 * (`reason: "no-gm"`), the GM's browser must be reloaded first — its
 * connection dropped (`"gm-reload"`) — or the GM could not save it
 * (`"not-saved"`).
 *
 * @param {{ recorded?: boolean, reason?: "no-gm"|"gm-reload"|"not-saved" }} [opts]
 * @returns {Promise<Object>} the created ChatMessage
 */
export async function postXCardCard({ recorded = true, reason = "no-gm" } = {}) {
  const unrecorded = reason === "not-saved"
    ? `<p class="xcard-unrecorded"><strong>The pause could not be saved.</strong>
              The narrator will not hold the scene; play the X-Card again.</p>`
    : reason === "gm-reload"
    ? `<p class="xcard-unrecorded"><strong>The pause could not be recorded — the GM's browser lost its connection to the server.</strong>
              Nothing can record it until the GM reloads their browser; play the X-Card again once they have.</p>`
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
