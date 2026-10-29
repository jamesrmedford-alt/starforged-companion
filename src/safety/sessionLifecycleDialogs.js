/**
 * STARFORGED COMPANION
 * src/safety/sessionLifecycleDialogs.js
 *
 * DialogV2-backed flows for Begin a Session and End a Session.
 *
 * Begin a Session (play kit p. 1):
 *   - Lists flagged content for review.
 *   - Surfaces the quest / connection focus captured at the previous End a
 *     Session ("Focus from last session: …").
 *   - Offers an optional Spotlight Vignette roll (d100, 10 entries) —
 *     uses src/oracles/tables/sessionVignette.js. On roll, all players
 *     take +1 momentum.
 *
 * End a Session (play kit p. 1):
 *   - Capture quest focus and/or connection focus for next session.
 *   - If at least one focus is noted, the player takes +1 momentum.
 *   - Surfaces a reminder for any vow that advanced this session
 *     (the player should Reach a Milestone before posting the card).
 *
 * Split: the dialog and the chat card run on the invoking client (any
 * player may type `!begin-session` / `!end-session`); every world write —
 * the session-active flip, foci, momentum, clocks, scene close, rolling
 * summary, Session Log and the narrator vignettes — runs on the canonical
 * GM in applyBeginSession / applyEndSession (GM_ACTIONS in
 * src/multiplayer/gmRelay.js), invoked through requestGmAction. A player's
 * client cannot write world-scoped campaignState or other players' actors,
 * and the narrator's Claude key lives on the (keyed) canonical GM.
 */

import { rollOracle } from "../oracles/roller.js";
import { requestGmAction, hasActiveGM } from "../multiplayer/gmRelay.js";

const MODULE_ID = "starforged-companion";


// ─────────────────────────────────────────────────────────────────────────────
// Begin a Session
// ─────────────────────────────────────────────────────────────────────────────

export async function openBeginSessionDialog() {
  const { DialogV2 } = foundry.applications.api;

  const state    = game.settings.get(MODULE_ID, "campaignState") ?? {};
  // A session begins once (issue #300 F11): its clocks, momentum and opening
  // scene already ran. The canonical GM re-checks; this saves the table a card
  // that promises momentum nobody gets.
  if (await sessionAlreadyBegun(state)) {
    ui.notifications?.info(
      "Starforged Companion: this session has already begun — its clocks, momentum and opening scene ran once. " +
      "End a Session first to begin the next one.",
    );
    return;
  }
  const flagList = (state.safetyFlags ?? [])
    .filter(f => f.visibility !== "private" || game.user?.isGM)
    .slice(-5)
    .map(f => `<li>${escapeHtml(f.text)}</li>`)
    .join("");
  const flagBlock = flagList
    ? `<details open><summary>Flagged content to review (${(state.safetyFlags ?? []).length})</summary><ul>${flagList}</ul></details>`
    : `<p class="muted"><em>No flagged content. Use Set a Flag to add some.</em></p>`;

  const content = `
    <form class="sf-begin-session-form">
      <p class="hint">Identify or adjust flagged content. Review or recap what
      happened last session. Set the scene by envisioning your character's
      current situation and intent.</p>
      ${renderLastSessionFoci(state)}
      ${flagBlock}
      <label class="row">
        <input type="checkbox" name="vignette" value="1">
        Roll a Spotlight Vignette (+1 momentum to all players)
      </label>
      <label class="row">
        <input type="checkbox" name="galleyVignette" value="1" checked>
        Include an opening galley vignette (narrator-written scene)
      </label>
    </form>
  `;

  await DialogV2.prompt({
    window:  { title: "Begin a Session" },
    content,
    ok: {
      label:    "Begin",
      callback: async (_event, button) => {
        const form = button.form;
        const rollVignette  = form?.querySelector('input[name="vignette"]')?.checked;
        const includeGalley = form?.querySelector('input[name="galleyVignette"]')?.checked ?? true;
        await postBeginSessionCard(rollVignette, includeGalley);
      },
    },
  });
}

async function postBeginSessionCard(rollVignette, includeGalley = true) {
  // Read the foci before the GM handler clears them, so the card shows what
  // the table carried over from last session.
  const state = game.settings.get(MODULE_ID, "campaignState") ?? {};

  let vignetteBlock  = "";
  let vignetteRolled = false;
  if (rollVignette) {
    try {
      const r = rollOracle("spotlight_vignette");
      vignetteBlock = `<p><strong>Spotlight vignette:</strong> ${escapeHtml(r.result)}</p><p>All players take <strong>+1 momentum</strong>.</p>`;
      vignetteRolled = true;
    } catch (err) {
      console.warn(`${MODULE_ID} | openBeginSessionDialog: vignette roll failed:`, err);
    }
  }

  // The card posts before the GM-side work so the chat reads in play order
  // (Begin card → clock card → vignettes). With no GM connected nothing below
  // can be recorded — say so on the card instead of claiming it.
  const gmOnline = hasActiveGM();
  const notRecorded = gmOnline
    ? ""
    : `<p class="muted sf-not-recorded"><em>No GM is connected — the session was not started${vignetteRolled ? " and no momentum was applied" : ""}. Try again once a GM has joined.</em></p>`;

  await ChatMessage.create({
    content: `<div class="sf-session-card"><strong>Begin a Session</strong><p>Flagged content reviewed; scene set.</p>${renderLastSessionFoci(state)}${vignetteBlock}${notRecorded}</div>`,
    flags:   { [MODULE_ID]: { sessionLifecycleCard: true } },
  });

  await requestGmActionSafely("session.begin", { vignetteRolled, includeGalley: includeGalley !== false });
}

/** campaignState fields applyBeginSession writes, besides a new session's (SESSION_MINT_FIELDS). */
const BEGIN_SESSION_FIELDS = Object.freeze(["questFocus", "connectionFocus", "sessionFocus", "sessionActive", "sessionActiveStartedAt", "sessionStartedId"]);

/**
 * True when Begin a Session already ran for the current session — it has not
 * ended or gone idle since (a session that has, starts anew at the next
 * Begin). Its start effects then never run again (issue #300 F11).
 *
 * @param {Object} campaignState
 * @returns {Promise<boolean>}
 */
async function sessionAlreadyBegun(campaignState) {
  const id = campaignState?.currentSessionId;
  if (!id || campaignState.sessionStartedId !== id) return false;
  const { sessionNeedsMint } = await import("../session/lifecycle.js");
  return !sessionNeedsMint(campaignState);
}

// One Begin a Session at a time on this client. The GM relay queue already
// serialises them; this holds even past its wait cap, so two never both see
// the session un-begun and both apply its start effects.
let _beginChain = Promise.resolve();

/**
 * GM-relay handler for `"session.begin"` (GM_ACTIONS in
 * src/multiplayer/gmRelay.js) — runs on the canonical GM. Sub-steps, in
 * order: a new session when the last one is over → session-active flip
 * (+ clear last session's foci, now surfaced) → Spotlight Vignette momentum →
 * campaign clock advance (+ clock card and clock vignettes) → opening galley
 * vignette. The start effects run once per session: Begin again on a session
 * already begun posts a note and changes nothing (issue #300 F11).
 *
 * @param {{ vignetteRolled?: boolean, includeGalley?: boolean }} payload
 * @param {Object} [_ctx]
 * @returns {Promise<void>}
 */
export function applyBeginSession(payload = {}, _ctx = {}) {
  const run = _beginChain.then(() => beginSessionOnce(payload));
  _beginChain = run.catch(() => {});
  return run;
}

async function beginSessionOnce(payload) {
  const vignetteRolled = payload.vignetteRolled === true;
  const includeGalley  = payload.includeGalley !== false;

  // Start a new session when the last one is over — End a Session closed it,
  // or it went idle (issue #286 C4: End → Begin used to keep the same session
  // id, so the ring, summary and oracles ran on). Then flip the
  // session-active gate ON: from this point forward, plain typed narration
  // runs through the move pipeline / paced narrator again. The foci captured
  // at the last End a Session have now been surfaced (dialog + card) and go
  // on to the narrator as this session's focus, so clear them for the next
  // End. The roll can await a Claude call, so only
  // Begin's own fields are merged onto the latest store. `sessionStartedId`
  // marks the session's start effects applied: a second Begin for the same
  // session used to advance its clocks and grant the momentum again (F11).
  // All of it on a copy (rules/foundry-api.md): get() returns the cached
  // value, and a refused write left it marked begun — this client then
  // refused every retry as "already begun" while the world said the session
  // had not started (issue #309 N09).
  let begun = false;
  try {
    const { beginSession, rollSessionIfDue, SESSION_MINT_FIELDS } = await import("../session/lifecycle.js");
    const { mergeOwnedFields } = await import("../factContinuity/sceneLifecycle.js");
    const cs = foundry.utils.deepClone(game.settings.get(MODULE_ID, "campaignState") ?? {});
    await rollSessionIfDue(cs);
    if (cs.currentSessionId && cs.sessionStartedId === cs.currentSessionId) {
      console.debug?.(`${MODULE_ID} | Begin a Session: session ${cs.currentSessionId} has already begun — start effects not repeated.`);
      await postSessionAlreadyBegunCard();
      return;
    }
    beginSession(cs);
    cs.sessionStartedId = cs.currentSessionId ?? null;
    // The foci go on to the narrator for this session (issue #286 C5).
    const quest      = cleanFocus(cs.questFocus);
    const connection = cleanFocus(cs.connectionFocus);
    if (quest || connection) cs.sessionFocus = { sessionId: cs.currentSessionId ?? null, quest, connection };
    cs.questFocus      = "";
    cs.connectionFocus = "";
    await game.settings.set(MODULE_ID, "campaignState", mergeOwnedFields(cs, BEGIN_SESSION_FIELDS.concat(SESSION_MINT_FIELDS), "begin session"));
    Hooks.callAll(`${MODULE_ID}.sessionStateChanged`, { active: true });
    begun = true;
  } catch (err) {
    console.warn(`${MODULE_ID} | beginSession state flip failed — start effects skipped:`, err?.message ?? err);
  }
  if (!begun) return;

  if (vignetteRolled) {
    await applyMomentumToAllPlayers(1);
  }

  // Campaign clocks — roll Ask the Oracle for each at session start (play
  // kit: campaign clocks advance at Begin a Session via the clock's
  // advanceOdds).
  try {
    const { advanceCampaignClocksForBeginSession } = await import("../clocks/clocks.js");
    const clockResults = await advanceCampaignClocksForBeginSession();
    if (clockResults.length) {
      const rows = clockResults.map(r => {
        const bar    = "█".repeat(r.filled) + "░".repeat(Math.max(0, r.segments - r.filled));
        const status = r.advanced
          ? `YES (d100=${r.roll}) — <strong>${r.filled}/${r.segments}</strong>${r.triggered ? " <strong>(TRIGGERED)</strong>" : ""}`
          : `NO (d100=${r.roll})`;
        return `<li>${escapeHtml(r.name)} [${bar}] — Ask the Oracle (${r.odds}): ${status}</li>`;
      }).join("");
      await ChatMessage.create({
        content: `<div class="sf-clock-card"><strong>⏳ Campaign clocks — Begin a Session</strong><ul>${rows}</ul></div>`,
        flags:   { [MODULE_ID]: { clockCard: true, beginSessionAdvance: true } },
      });
      const advanced = clockResults.filter(r => r.advanced);
      if (advanced.length) {
        setTimeout(async () => {
          try {
            const { narrateClockAdvancement } = await import("../narration/narrator.js");
            const cs = game.settings.get(MODULE_ID, "campaignState") ?? {};
            for (const cd of advanced) {
              const text = await narrateClockAdvancement({ clock: cd, campaignState: cs });
              if (text) {
                // Flag family (NARR-RING-CLOCKVIG): threat-advance fiction
                // must enter the ring/summary or it is forgotten instantly.
                await ChatMessage.create({
                  content: `<div class="sf-clock-card">${cd.triggered ? "<strong>⚠ TRIGGERED — </strong>" : ""}<em>${escapeHtml(text)}</em></div>`,
                  flags:   {
                    [MODULE_ID]: {
                      clockCard:         true,
                      clockVignetteCard: true,
                      narratorCard:      true,
                      narrationText:     text,
                      sessionId:         cs.currentSessionId ?? null,
                    },
                  },
                });
              }
            }
          } catch (err) {
            console.warn(`${MODULE_ID} | session-start clock vignette generation failed:`, err?.message ?? err);
          }
        }, 0);
      }
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | campaign clock session-start roll failed:`, err?.message ?? err);
  }

  // Fire-and-forget galley vignette — narrator-generated 4-6 sentence
  // opening scene describing the active PCs in the ship's galley
  // bantering about the absent ones. Silent skip when the Claude key
  // is unset or narration is disabled. Gated on the dialog's "Include an
  // opening galley vignette" checkbox (default on) so unchecking it
  // suppresses the scene (playtest finding: it ran regardless). Runs here,
  // on the canonical GM, because that is the client holding the Claude key.
  if (!includeGalley) {
    console.debug?.(`${MODULE_ID} | Begin a Session: galley vignette unchecked — skipped.`);
    return;
  }
  setTimeout(async () => {
    try {
      const { collectGalleyParticipants, buildGalleyVignetteUserMessage, postGalleyVignetteCard }
        = await import("../session/galleyVignette.js");
      const { narrateSessionVignette } = await import("../narration/narrator.js");
      const cs = game.settings.get(MODULE_ID, "campaignState") ?? {};
      const participants = collectGalleyParticipants();
      const userMessage  = buildGalleyVignetteUserMessage(participants, cs);
      const text = await narrateSessionVignette({ userMessage, campaignState: cs });
      if (text) {
        await postGalleyVignetteCard({ text, kind: "galley_begin", sessionId: cs.currentSessionId ?? "" });
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | galley vignette generation failed:`, err?.message ?? err);
    }
  }, 0);
}


/** Begin a Session ran again on a session already begun — say what (didn't) happen. */
async function postSessionAlreadyBegunCard() {
  await ChatMessage.create({
    content: `<div class="sf-session-card"><strong>Begin a Session</strong><p>This session has already begun — its campaign clocks, momentum and opening scene are not repeated. End a Session to begin the next one.</p></div>`,
    flags:   { [MODULE_ID]: { sessionLifecycleCard: true } },
  }).catch(err => console.warn(`${MODULE_ID} | Begin a Session: note card failed:`, err?.message ?? err));
}


// ─────────────────────────────────────────────────────────────────────────────
// End a Session
// ─────────────────────────────────────────────────────────────────────────────

export async function openEndSessionDialog() {
  const { DialogV2 } = foundry.applications.api;

  // A session ends once (issue #309 N08). Ending it again only corrects the
  // focus for next session; the momentum is paid for the first focus noted.
  const state = game.settings.get(MODULE_ID, "campaignState") ?? {};
  const bonusHint = !sessionAlreadyEnded(state)
    ? `Setting at least one focus grants <strong>+1 momentum</strong>.`
    : hasFocus(state)
      ? `This session has already ended. A focus set now replaces the one noted; its momentum was already taken.`
      : `This session has already ended. Setting a focus now still grants <strong>+1 momentum</strong>, once.`;

  const content = `
    <form class="sf-end-session-form">
      <p class="hint">Reflect on the events of the game and identify any missed
      opportunities to mark progress. If a quest advanced, Reach a Milestone now.
      If a tie strengthened, Develop Your Relationship.</p>
      <label>
        <span>Quest focus for next session (optional)</span>
        <input type="text" name="questFocus" maxlength="120">
      </label>
      <label>
        <span>Connection focus for next session (optional)</span>
        <input type="text" name="connectionFocus" maxlength="120">
      </label>
      <p class="hint">${bonusHint}</p>
    </form>
  `;

  await DialogV2.prompt({
    window:  { title: "End a Session" },
    content,
    ok: {
      label:    "End Session",
      callback: async (_event, button) => {
        const form = button.form;
        const questFocus      = form?.querySelector('input[name="questFocus"]')?.value.trim() ?? "";
        const connectionFocus = form?.querySelector('input[name="connectionFocus"]')?.value.trim() ?? "";
        await postEndSessionCard({ questFocus, connectionFocus });
      },
    },
  });
}

async function postEndSessionCard({ questFocus, connectionFocus }) {
  const lines = [];
  if (questFocus)      lines.push(`<li><strong>Quest focus:</strong> ${escapeHtml(questFocus)}</li>`);
  if (connectionFocus) lines.push(`<li><strong>Connection focus:</strong> ${escapeHtml(connectionFocus)}</li>`);
  const focusBlock = lines.length
    ? `<ul>${lines.join("")}</ul><p>You take <strong>+1 momentum</strong>.</p>`
    : `<p class="muted"><em>No focus set — no momentum bonus.</em></p>`;
  const endedBefore = sessionAlreadyEnded(game.settings.get(MODULE_ID, "campaignState") ?? {});

  // The world writes (foci, session-active flip, scene close, summary, log,
  // momentum) run on the canonical GM; the card follows on this client.
  const res = await requestGmActionSafely("session.end", { questFocus, connectionFocus });
  // Ended already (issue #309 N08): the GM's note card says what changed — a
  // second card here would promise momentum that is not paid again.
  if (res?.ok !== false && (res?.result?.alreadyEnded === true || (endedBefore && res?.relayed))) return;
  const notRecorded = res?.ok === false
    ? `<p class="muted sf-not-recorded"><em>${res.reason === "no-gm"
        ? "No GM is connected — the session was not ended, and no focus or momentum was recorded. Try again once a GM has joined."
        : "The session could not be ended — see the console."}</em></p>`
    : "";

  await ChatMessage.create({
    content: `<div class="sf-session-card"><strong>End a Session</strong>${focusBlock}${notRecorded}</div>`,
    flags:   { [MODULE_ID]: { sessionLifecycleCard: true } },
  });
}

/** campaignState fields applyEndSession writes (the rest is merged from the store). */
const END_SESSION_FIELDS = Object.freeze(["questFocus", "connectionFocus", "sessionActive", "sessionActiveStartedAt", "sessionEndedId"]);

/**
 * True when End a Session already ended the current session: it is marked
 * ended and nothing has started a new one (the next Begin a Session or world
 * load does).
 *
 * @param {Object} campaignState
 * @returns {boolean}
 */
function sessionAlreadyEnded(campaignState) {
  const id = campaignState?.currentSessionId;
  return !!id && campaignState.sessionEndedId === id;
}

/** A focus for next session is noted (End a Session saved it; Begin clears it). */
function hasFocus(campaignState) {
  return !!(cleanFocus(campaignState?.questFocus) || cleanFocus(campaignState?.connectionFocus));
}

// One End a Session at a time on this client, as for Begin: two players
// ending the same session reach this handler together, and both found it
// not yet ended (issue #309 N08).
let _endChain = Promise.resolve();

/**
 * GM-relay handler for `"session.end"` (GM_ACTIONS in
 * src/multiplayer/gmRelay.js) — runs on the canonical GM. Sub-steps, in
 * order: persist foci → session-active flip OFF and mark the session ended →
 * close the active scene → finalise the rolling session summary → persist
 * End's own fields onto the latest campaignState (+ sessionStateChanged) →
 * Session Log write → +1 momentum to all players when a focus was set →
 * closing NPC vignette, then a campaign-recap refresh.
 *
 * A session ends once (issue #309 N08 — every End paid the party momentum
 * again, and closed the session, wrote its log and scheduled its vignette
 * again). End again on a session already ended only corrects the focus for
 * next session, and posts a note: the momentum is paid for the first focus
 * the session's ending notes, never again.
 *
 * @param {{ questFocus?: string, connectionFocus?: string }} payload
 * @param {Object} [_ctx]
 * @returns {Promise<{ alreadyEnded: boolean }>} alreadyEnded: the session had
 *   ended — only the focus was corrected (postEndSessionCard posts no card)
 */
export function applyEndSession(payload = {}, _ctx = {}) {
  const run = _endChain.then(() => endSessionOnce(payload));
  _endChain = run.catch(() => {});
  return run;
}

async function endSessionOnce(payload) {
  const questFocus      = cleanFocus(payload.questFocus);
  const connectionFocus = cleanFocus(payload.connectionFocus);

  // Persist the foci to campaignState so the next Begin a Session can surface
  // them (openBeginSessionDialog / postBeginSessionCard read them;
  // applyBeginSession clears them). Also flip the session-active gate OFF and
  // award the +1 momentum to all players if a focus was set. On a copy
  // (rules/foundry-api.md): get() returns the cached value, and a refused
  // write must leave it as it was — marked ended on this client alone, every
  // retry would be taken for a second End.
  const state = foundry.utils.deepClone(game.settings.get(MODULE_ID, "campaignState") ?? {});
  if (sessionAlreadyEnded(state)) return correctEndedSession(state, { questFocus, connectionFocus });
  if (questFocus)      state.questFocus      = questFocus;
  if (connectionFocus) state.connectionFocus = connectionFocus;
  try {
    const { endSession } = await import("../session/lifecycle.js");
    endSession(state);
  } catch (err) {
    console.warn(`${MODULE_ID} | endSession state flip failed:`, err?.message ?? err);
  }
  // The session is over: the next world load or Begin a Session starts a new
  // one (rollSessionIfDue, issue #286 C4).
  state.sessionEndedId = state.currentSessionId ?? null;

  // NARR-SESSION-SCENE (narrator-context audit 2026-07): End Session used
  // to flip the gate only — the active scene survived into the next
  // session, whose empty ring + empty summary then mixed with stale scene
  // truths. Close the scene so truths migrate to their durable homes
  // (entity tiers / WJ Lore). `session_close` was already a documented
  // endScene reason — this wires the call the design intended.
  try {
    const { endScene } = await import("../factContinuity/sceneLifecycle.js");
    await endScene(state, { reason: "session_close" });
  } catch (err) {
    console.warn(`${MODULE_ID} | endSession scene close failed:`, err?.message ?? err);
  }

  // Finalise the rolling session summary (architecture §8.6) before the
  // Session Log write, so the log captures the tail since the last debounced
  // regen. Self-gates on narratorSessionSummary; fail-open.
  try {
    const { getRollingSessionSummary } = await import("../narration/narrator.js");
    await getRollingSessionSummary(state, { forceRefresh: true });
  } catch (err) {
    console.warn(`${MODULE_ID} | rolling session summary finalise failed:`, err?.message ?? err);
  }

  // Write back only the fields End a Session owns, merged onto the latest
  // stored campaignState. `state` was read before endScene and the summary's
  // Claude call, and writing it whole reverted a move persisted meanwhile —
  // its session-log entry, legacy ticks and entity ids, and even its released
  // `pendingMove` lock (every later move then refused until a reload). The
  // scene fields were persisted by endScene, the summary by
  // getRollingSessionSummary. A write failure still throws (the card says so).
  const { mergeOwnedFields } = await import("../factContinuity/sceneLifecycle.js");
  const ended = mergeOwnedFields(state, END_SESSION_FIELDS, "end session");
  await game.settings.set(MODULE_ID, "campaignState", ended);
  Hooks.callAll(`${MODULE_ID}.sessionStateChanged`, { active: false });

  // Write the session log on End (F18). writeSessionLog was implemented but
  // never called from production, so the Session Log journal stayed blank.
  if (game.settings.get(MODULE_ID, "sessionLogAutoWrite") !== false) {
    try {
      const { writeSessionLog } = await import("../world/worldJournal.js");
      await writeSessionLog(ended);
    } catch (err) {
      console.warn(`${MODULE_ID} | session log write failed:`, err?.message ?? err);
    }
  }

  const bonus = !!(questFocus || connectionFocus);
  if (bonus) {
    await applyMomentumToAllPlayers(1);
  }

  // Fire-and-forget closing vignette — narrator-generated slice-of-life
  // featuring a currently-important NPC (bonded connection → recurring
  // threat → fallback) doing something trivial and mundane. Silent skip
  // when the Claude key is unset or narration is disabled. Runs here, on
  // the canonical GM, because that is the client holding the Claude key.
  setTimeout(async () => {
    try {
      const { selectEndSessionNPC, buildEndSessionVignetteUserMessage, postEndSessionVignetteCard }
        = await import("../session/endSessionVignette.js");
      const { narrateSessionVignette } = await import("../narration/narrator.js");
      const cs  = game.settings.get(MODULE_ID, "campaignState") ?? {};
      const npc = selectEndSessionNPC(cs);
      const userMessage = buildEndSessionVignetteUserMessage(npc, cs);
      const text = await narrateSessionVignette({ userMessage, campaignState: cs });
      if (text) {
        await postEndSessionVignetteCard({ text, npcName: npc.name, sessionId: cs.currentSessionId ?? "" });
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | end-session vignette generation failed:`, err?.message ?? err);
    }
    // The session's chronicle is complete: refresh the campaign recap now, so
    // the next session's first narration carries a current one from the cache
    // (buildNarratorExtras) without waiting on it. Fail-open.
    try {
      const { getCampaignRecap } = await import("../narration/narrator.js");
      await getCampaignRecap(game.settings.get(MODULE_ID, "campaignState") ?? {});
    } catch (err) {
      console.warn(`${MODULE_ID} | campaign recap refresh failed:`, err?.message ?? err);
    }
  }, 0);
  return { alreadyEnded: false };
}

/**
 * End a Session on a session already ended (issue #309 N08) — a correction.
 * A focus it gives replaces the one noted; nothing else runs again (no scene
 * close, summary, Session Log or closing vignette). The momentum is paid only
 * when the ending noted no focus and this does: it is for the first focus
 * noted, once. A note card says what changed.
 *
 * @param {Object} state — a copy of the stored campaignState
 * @param {{ questFocus: string, connectionFocus: string }} foci — cleaned
 * @returns {Promise<{ alreadyEnded: true }>}
 */
async function correctEndedSession(state, { questFocus, connectionFocus }) {
  const given = !!(questFocus || connectionFocus);
  const bonus = given && !hasFocus(state);
  if (given) {
    if (questFocus)      state.questFocus      = questFocus;
    if (connectionFocus) state.connectionFocus = connectionFocus;
    const { mergeOwnedFields } = await import("../factContinuity/sceneLifecycle.js");
    await game.settings.set(MODULE_ID, "campaignState",
      mergeOwnedFields(state, ["questFocus", "connectionFocus"], "end session (focus correction)"));
  }
  if (bonus) await applyMomentumToAllPlayers(1);
  console.debug?.(`${MODULE_ID} | End a Session: session ${state.currentSessionId} has already ended — ${given ? "focus updated" : "nothing changed"}${bonus ? ", first focus: +1 momentum" : ""}.`);

  const lines = [];
  if (questFocus)      lines.push(`<li><strong>Quest focus:</strong> ${escapeHtml(questFocus)}</li>`);
  if (connectionFocus) lines.push(`<li><strong>Connection focus:</strong> ${escapeHtml(connectionFocus)}</li>`);
  const focusBlock = !given ? ""
    : `<p>Focus for next session updated:</p><ul>${lines.join("")}</ul>`
      + (bonus
        ? `<p>The first focus noted for this session: you take <strong>+1 momentum</strong>.</p>`
        : `<p class="muted"><em>No momentum — it was taken when the session ended with a focus.</em></p>`);
  await ChatMessage.create({
    content: `<div class="sf-session-card"><strong>End a Session</strong>`
      + `<p>This session has already ended — it is not closed again, and its Session Log and closing scene are not repeated.</p>`
      + `${focusBlock}</div>`,
    flags:   { [MODULE_ID]: { sessionLifecycleCard: true } },
  }).catch(err => console.warn(`${MODULE_ID} | End a Session: note card failed:`, err?.message ?? err));
  return { alreadyEnded: true };
}


// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * requestGmAction, but a handler that throws on the local (canonical-GM) path
 * is reported — console.error + notification — and returned as
 * `{ ok: false, reason: "error" }` so the caller's card stays honest.
 */
async function requestGmActionSafely(kind, payload) {
  try {
    return await requestGmAction(kind, payload);
  } catch (err) {
    console.error(`${MODULE_ID} | ${kind} failed:`, err);
    ui.notifications?.error?.(`Starforged Companion: ${kind} failed — see the console.`);
    return { ok: false, reason: "error" };
  }
}

/** Relay-payload focus → trimmed string capped at the dialog's maxlength. */
function cleanFocus(value) {
  return typeof value === "string" ? value.trim().slice(0, 120) : "";
}

/**
 * "Focus from last session" block for the Begin a Session dialog and card.
 * Empty string when End a Session recorded no focus.
 *
 * @param {Object} state — campaignState
 * @returns {string}
 */
function renderLastSessionFoci(state) {
  const quest      = cleanFocus(state?.questFocus);
  const connection = cleanFocus(state?.connectionFocus);
  if (!quest && !connection) return "";
  const items = [];
  if (quest)      items.push(`<li><strong>Quest:</strong> ${escapeHtml(quest)}</li>`);
  if (connection) items.push(`<li><strong>Connection:</strong> ${escapeHtml(connection)}</li>`);
  return `<div class="sf-last-session-foci"><p><strong>Focus from last session:</strong></p><ul>${items.join("")}</ul></div>`;
}

async function applyMomentumToAllPlayers(delta) {
  const { getPlayerActors }   = await import("../character/actorBridge.js");
  const { applyMeterChanges } = await import("../character/actorBridge.js");
  const actors = getPlayerActors();
  for (const a of actors) {
    try { await applyMeterChanges(a, { momentum: delta }); }
    catch (err) { console.warn(`${MODULE_ID} | momentum delta failed for ${a.name}:`, err); }
  }
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
