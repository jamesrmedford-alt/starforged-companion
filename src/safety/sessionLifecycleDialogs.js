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
 *     take +1 momentum, and the narrator writes the result as a short
 *     cutaway of its own before the opening (issue #381 D3) — or, with no
 *     narration to follow, the card says it is the table's to envision.
 *   - Says so when no character has an open vow besides a background vow,
 *     and offers to swear one on the user's own character (issue #353 R3).
 *
 * End a Session (play kit p. 1):
 *   - Capture quest focus and/or connection focus for next session — the
 *     open vows and the connections are offered as one-click choices beside
 *     the free text (issue #353 R4).
 *   - If at least one focus is noted, the player takes +1 momentum.
 *   - Surfaces a reminder for any vow that advanced this session
 *     (the player should Reach a Milestone before posting the card).
 *
 * Split: the dialog and the chat card run on the invoking client (any
 * player may type `!begin-session` / `!end-session`); every world write —
 * the session-active flip, foci, momentum, clocks, scene close, rolling
 * summary, Session Log, the narrator vignettes and the vow Begin's dialog
 * swears (once the session is begun) — runs on the canonical
 * GM in applyBeginSession / applyEndSession (GM_ACTIONS in
 * src/multiplayer/gmRelay.js), invoked through requestGmAction. A player's
 * client cannot write world-scoped campaignState or other players' actors,
 * and the narrator's Claude key lives on the (keyed) canonical GM.
 */

import { settledWithin } from "../multiplayer/settleWithin.js";
import { rollOracle } from "../oracles/roller.js";
import { requestGmAction, hasActiveGM } from "../multiplayer/gmRelay.js";
import { hasKeyedActiveGM } from "../multiplayer/gmGate.js";
import { newNarrationId } from "../factContinuity/ledgers.js";
import { proseToHtml } from "../audio/segments.js";
import { reportSnapshotEvent } from "../narration/snapshotEvents.js";
import { RANKS } from "../schemas.js";
import { costsOwedSentence } from "../moves/sufferCard.js";
import { recordCause } from "../record/sheetWatch.js";
import { recordSessionEdge } from "../record/tableSnapshot.js";

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
  // A private flag is the GMs' alone — its text and its count: a player read
  // "Flagged content to review (3)" over the one flag listed (issue #345 AA60).
  const shownFlags = (state.safetyFlags ?? [])
    .filter(f => f.visibility !== "private" || game.user?.isGM);
  const flagList = shownFlags
    .slice(-5)
    .map(f => `<li>${escapeHtml(f.text)}</li>`)
    .join("");
  const flagBlock = flagList
    ? `<details open><summary>Flagged content to review (${shownFlags.length})</summary><ul>${flagList}</ul></details>`
    : `<p class="muted"><em>No flagged content. Use Set a Flag to add some.</em></p>`;

  // No vow in play (issue #353 R3): without a quest the session has nothing
  // to play toward in the rules' own terms, and nothing said so.
  const quest = await questStatus(state);
  const closedQuest = await closedVowOf(cleanFocus(state.questFocus));

  const content = `
    <form class="sf-begin-session-form">
      <p class="hint">Identify or adjust flagged content. Review or recap what
      happened last session. Set the scene by envisioning your character's
      current situation and intent.</p>
      ${renderLastSessionFoci(state, { closed: closedQuest })}
      ${flagBlock}
      ${quest.inPlay ? "" : renderNoQuestBlock(quest.swearer)}
      <label class="row">
        <input type="checkbox" name="vignette" value="1">
        Roll a Spotlight Vignette (+1 momentum to all players)
      </label>
      <label class="row">
        <input type="checkbox" name="galleyVignette" value="1" checked>
        Include an opening scene (narrator-written)
      </label>
      <label class="row sf-pick-up">
        <span>Where and when do we pick up? (optional)</span>
        <input type="text" name="pickUp" maxlength="${PICK_UP_MAX}" placeholder="Left blank, the opening starts where the last session stopped">
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
        const newVow        = String(form?.querySelector('input[name="newVow"]')?.value ?? "").trim().slice(0, VOW_NAME_MAX);
        const newVowRank    = form?.querySelector('select[name="newVowRank"]')?.value ?? "dangerous";
        const pickUp        = cleanPickUp(form?.querySelector('input[name="pickUp"]')?.value);
        await postBeginSessionCard(rollVignette, includeGalley, { ...quest, newVow, newVowRank }, pickUp);
      },
    },
  });
}

/** The longest vow the "no vow in play" offer takes (the field's maxlength). */
const VOW_NAME_MAX = 120;

/**
 * The longest "Where and when do we pick up?" Begin a Session takes (the
 * field's maxlength). The move's third step is "Set the scene by envisioning
 * your character's current situation and intent", and the dialog printed that
 * sentence with no field under it: once an opening starts where the last
 * session stopped, this line is how a table skips ahead (issue #381 D8).
 */
const PICK_UP_MAX = 200;

/** Relay-payload pick-up line → one trimmed line, capped at the dialog's maxlength. */
function cleanPickUp(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, PICK_UP_MAX) : "";
}

/**
 * Whether a quest is in play at Begin a Session (issue #353 R3): some
 * character holds an open vow besides a background vow
 * (session/openThreads.js questVows — the shared inciting vow counts as one).
 * With none, `swearer` is the character this user would swear one for —
 * their own (multiplayer/speaker.js resolveUserActorId) — or null.
 * Fail-open: a check that cannot be made says nothing, and never holds up
 * the Begin.
 *
 * @param {Object} state — campaignState
 * @returns {Promise<{ inPlay: boolean, swearer: { id: string, name: string }|null }>}
 */
async function questStatus(state) {
  try {
    const { tableVows, questVows } = await import("../session/openThreads.js");
    if (questVows(tableVows()).length) return { inPlay: true, swearer: null };
    const { resolveUserActorId } = await import("../multiplayer/speaker.js");
    const { getActor } = await import("../character/actorBridge.js");
    const actorId = resolveUserActorId(game.user, state);
    const actor   = actorId ? getActor(actorId) : null;
    return { inPlay: false, swearer: actor?.id ? { id: actor.id, name: String(actor.name ?? "") } : null };
  } catch (err) {
    console.warn(`${MODULE_ID} | Begin a Session: whether a vow is in play could not be read:`, err?.message ?? err);
    return { inPlay: true, swearer: null };
  }
}

/**
 * The Begin a Session dialog's "No vow in play" block (issue #353 R3): it
 * says so and offers Swear an Iron Vow for the user's own character — a vow
 * and its rank, optional. With no character of their own, it points to the
 * sheet.
 *
 * @param {{ id: string, name: string }|null} swearer
 * @returns {string}
 */
function renderNoQuestBlock(swearer) {
  const ranks = RANKS.map(r => `<option value="${r}"${r === "dangerous" ? " selected" : ""}>${r}</option>`).join("");
  const offer = swearer
    ? `<label class="row"><span>Swear an Iron Vow for ${escapeHtml(swearer.name)} (optional)</span>`
      + `<input type="text" name="newVow" maxlength="${VOW_NAME_MAX}" placeholder="What do you swear to do?"></label>`
      + `<label class="row"><span>Rank</span><select name="newVowRank">${ranks}</select></label>`
      + `<p class="hint">The vow goes on the character sheet; its card then offers the swear roll.</p>`
    : `<p class="hint">Swear one on a character sheet: its card then offers the swear roll.</p>`;
  return `<div class="sf-no-vow"><p><strong>No vow in play.</strong> No character has an open vow besides a `
    + `background vow, so this session has no quest to play toward.</p>${offer}</div>`;
}

/** Relay-payload vow name → one trimmed line, capped at the dialog's maxlength. */
function cleanVowName(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, VOW_NAME_MAX) : "";
}

/**
 * Swear the vow Begin a Session's "no vow in play" offer was given (issue
 * #353 R3) — on the canonical GM, in the Begin it belongs to, once the
 * session is begun: on its character's sheet, through actorBridge. Its sheet
 * watch then records the `vow.sworn` in that session (record/sheetWatch.js),
 * and its createItem hook posts the "🆕 New vow recorded" card — the ⚔ Swear
 * it (roll), the reward offer and the connection link
 * (session/swearVow.js registerPlayerVowHook).
 *
 * The pressing client made it, right after it had sent the Begin — the relay
 * has no answer — so on a player's client the vow reached the sheet before
 * the GM had begun (at a world's first Begin, minted) the session: its
 * `vow.sworn` was built for the session the store held then, none (dropped)
 * or the one before (filed there), and the record named no vow sworn
 * (known-issues VOW-SWORN-UNNAMED-IN-THE-RECORD, the fourth live run's a2).
 *
 * The payload is client-asserted (rules/reachability.md §8): the character
 * must be a PC the requester owns (or the requester a GM), the name is cut to
 * the dialog's maxlength and the rank is one of the game's. A vow refused —
 * for its character, or by the sheet — is said to the requester and the GMs.
 * Never throws.
 *
 * @param {{ actorId?: string, name?: string, rank?: string }|null} vow — the relay's
 * @param {Object} [ctx] — the relay's
 * @returns {Promise<Object|null>} the vow Item, or null when none was made
 */
async function swearBeginVow(vow, ctx = {}) {
  const name = cleanVowName(vow?.name);
  if (!name) return null;
  try {
    const { getActor, createCharacterVowItem, isPlayerCharacterActor } = await import("../character/actorBridge.js");
    const { requesterOwnsActor } = await import("../moves/burnMomentum.js");
    const actor = typeof vow?.actorId === "string" && vow.actorId ? getActor(vow.actorId) : null;
    if (!actor || !isPlayerCharacterActor(actor) || !requesterOwnsActor(actor, ctx)) {
      await postBeginVowNotSworn(ctx, name, actor && isPlayerCharacterActor(actor)
        ? `only ${String(actor.name ?? "its character")}'s player or a GM can swear it for them`
        : "the character it was for is not one of the table's player characters");
      return null;
    }
    const item = await createCharacterVowItem(actor, { name, rank: RANKS.includes(vow?.rank) ? vow.rank : "dangerous" });
    if (!item) await postBeginVowNotSworn(ctx, name, "the sheet did not save it — add it on the character sheet");
    return item ?? null;
  } catch (err) {
    console.warn(`${MODULE_ID} | Begin a Session: the vow "${name}" was not sworn:`, err?.message ?? err);
    return null;
  }
}

/** Whisper the requester and the GMs that the vow Begin's dialog was given was not sworn, and why. */
async function postBeginVowNotSworn(ctx, name, why) {
  const gmIds = Array.from(game.users ?? []).filter(u => u?.isGM).map(u => u.id);
  await ChatMessage.create({
    content: `<div class="sf-session-card"><strong>Vow not sworn</strong><p>The vow <em>${escapeHtml(name)}</em> from Begin a Session was not sworn: ${escapeHtml(why)}.</p></div>`,
    whisper: [...new Set([ctx?.requesterId ?? null, ...gmIds].filter(Boolean))],
    flags:   { [MODULE_ID]: { sessionLifecycleCard: true, beginVowNotSworn: true } },
  }).catch(err => console.warn(`${MODULE_ID} | Begin a Session: the vow-not-sworn notice failed:`, err?.message ?? err));
}

async function postBeginSessionCard(rollVignette, includeGalley = true, quest = { inPlay: true }, pickUp = "") {
  // Read the foci before the GM handler clears them, so the card shows what
  // the table carried over from last session.
  const state = game.settings.get(MODULE_ID, "campaignState") ?? {};

  let vignetteBlock  = "";
  let vignetteRolled = false;
  let spotlightRoll  = null;
  if (rollVignette) {
    try {
      const r = rollOracle("spotlight_vignette");
      // The narrator writes it as a short cutaway of its own when a narration
      // will follow (issue #381 D3): the canonical GM is sent the d100 alone
      // and reads the result off the table itself. With none to follow, the
      // result is the table's to envision — the move's own second way.
      const narrated = spotlightWillBeNarrated(state);
      vignetteBlock = `<p><strong>Spotlight vignette:</strong> ${escapeHtml(r.result)}${narrated ? "" : " — yours to envision."}</p><p>All players take <strong>+1 momentum</strong>.</p>`;
      vignetteRolled = true;
      if (narrated) spotlightRoll = r.roll;
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

  // No vow in play (issue #353 R3): said to the table — with the vow the
  // dialog swears, when it swears one. The card said "No character has a vow
  // in play … swear an iron vow to give this session a quest" above the vow
  // its own dialog swore, composed as though no vow came with it (known-issues
  // BEGIN-CARD-BEFORE-ITS-OWN-VOW, the fourth live run's a2). The vow's own
  // card follows once the canonical GM has sworn it (swearBeginVow); with no
  // GM connected it is not sworn, and the card says so.
  const swearing = quest?.inPlay === false && quest.newVow && quest.swearer?.id ? quest : null;
  const vowRank = swearing && RANKS.includes(swearing.newVowRank) ? ` (${escapeHtml(swearing.newVowRank)})` : "";
  const noQuestBlock = quest?.inPlay !== false ? ""
    : !swearing
      ? `<p class="sf-no-vow"><em>No character has a vow in play besides a background vow — swear an iron vow to give this session a quest.</em></p>`
      : gmOnline
        // The vow is the dialog's, written by the table — the eighth live round's
        // cold read took "Mira Kestrel swears one" for the game swearing it.
        ? `<p class="sf-no-vow"><em>No vow was in play besides a background vow, so ${escapeHtml(swearing.swearer.name)} swears the vow written in the Begin a Session dialog: <strong>${escapeHtml(swearing.newVow)}</strong>${vowRank}. Its card follows.</em></p>`
        : `<p class="sf-no-vow"><em>No character has a vow in play besides a background vow — the vow <strong>${escapeHtml(swearing.newVow)}</strong> is not sworn until a GM has joined.</em></p>`;

  // The table's own word on where and when the session picks up (issue #381
  // D8), said to the table: the opening scene is set there.
  const pickUpBlock = pickUp
    ? `<p class="sf-pick-up"><strong>Picking up:</strong> ${escapeHtml(pickUp)}</p>`
    : "";

  await ChatMessage.create({
    content: `<div class="sf-session-card"><strong>Begin a Session</strong><p>Flagged content reviewed; scene set.</p>${renderLastSessionFoci(state, { closed: await closedVowOf(cleanFocus(state.questFocus)) })}${pickUpBlock}${noQuestBlock}${vignetteBlock}${notRecorded}</div>`,
    flags:   { [MODULE_ID]: { sessionLifecycleCard: true } },
  });

  // The vow the "no vow in play" offer was given rides the Begin: the
  // canonical GM swears it on the user's own character once the session is
  // begun (swearBeginVow — VOW-SWORN-UNNAMED-IN-THE-RECORD).
  const vow = quest?.inPlay === false && quest.newVow && quest.swearer?.id
    ? { actorId: quest.swearer.id, name: quest.newVow, rank: quest.newVowRank }
    : null;
  await requestGmActionSafely("session.begin", {
    vignetteRolled, includeGalley: includeGalley !== false, pickUp, ...(spotlightRoll ? { spotlightRoll } : {}),
    ...(vow ? { vow } : {}),
  });
}

/**
 * Whether the Spotlight Vignette will be narrated (issue #381 D3), read where
 * Begin was pressed from what every client can read: narration switched on
 * (a world setting), a GM with a Claude key connected (the keyed-GM
 * registry), the X-Card down. The canonical GM narrates only a roll it is
 * sent. Fail-closed: a check that cannot be made says the table envisions it.
 *
 * @param {Object} state — campaignState
 * @returns {boolean}
 */
function spotlightWillBeNarrated(state) {
  try {
    return game.settings.get(MODULE_ID, "narrationEnabled") !== false && hasKeyedActiveGM() && state?.xCardActive !== true;
  } catch {
    return false;
  }
}

/** Relay-payload d100 → a face of the table's die, else null (it crossed the socket). */
function cleanD100(value) {
  return Number.isInteger(value) && value >= 1 && value <= 100 ? value : null;
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
// serialises them; this holds past its wait cap, so two never both see the
// session un-begun and both apply its start effects — for up to
// SESSION_CHAIN_WAIT_MS: a Begin whose write the server never answered (a
// dropped connection) held every later Begin for the rest of the page load,
// with no card and no state change (issue #347 AB05).
let _beginChain = Promise.resolve();

/**
 * How long a Begin (or an End) waits for the one ahead of it on this client —
 * past the relay queue's own cap (GM_CLAUDE_ACTION_TIMEOUT_MS, 270 s), so only
 * one that never settles is passed.
 */
const SESSION_CHAIN_WAIT_MS = 5 * 60_000;

/**
 * How long Begin's galley vignette waits for its clock vignettes (issue #335
 * Y05), and each of them for the spotlight vignette (issue #381): each is a
 * bounded Claude call, so this only passes one that hangs.
 */
const OPENING_VIGNETTE_WAIT_MS = 60_000;

/**
 * Write the narrator's cached prefix ahead of the session's first narration
 * (issue #357) — Begin a Session starts it and does not wait on it. A named
 * function, awaiting the call: the playthrough harness names a Claude call by
 * its two nearest callers, and `batch-round` declares this one by that name.
 * Never throws.
 */
async function warmNarratorCacheAfterBegin() {
  try {
    const { prewarmNarratorCache } = await import("../narration/narrator.js");
    // A working copy — building the request must not touch this client's cache.
    await prewarmNarratorCache(foundry.utils.deepClone(game.settings.get(MODULE_ID, "campaignState") ?? {}));
  } catch (err) {
    console.warn(`${MODULE_ID} | Begin a Session: the narrator's cache was not written ahead:`, err?.message ?? err);
  }
}

/**
 * GM-relay handler for `"session.begin"` (GM_ACTIONS in
 * src/multiplayer/gmRelay.js) — runs on the canonical GM. Sub-steps, in
 * order: a new session when the last one is over → session-active flip
 * (+ clear last session's foci, now surfaced) → Spotlight Vignette momentum →
 * campaign clock advance (+ clock card and clock vignettes) → opening galley
 * vignette. The start effects run once per session: Begin again on a session
 * already begun posts a note and changes nothing (issue #300 F11).
 *
 * @param {{ vignetteRolled?: boolean, includeGalley?: boolean, pickUp?: string, spotlightRoll?: number,
 *   vow?: { actorId: string, name: string, rank?: string } }} payload —
 *   `pickUp`: the table's own word on where and when the session picks up;
 *   `spotlightRoll`: the Begin card's Spotlight Vignette d100, sent when a
 *   narration of it will follow; `vow`: the vow the dialog's "no vow in play"
 *   offer was given, sworn here once the session is begun (swearBeginVow)
 * @param {Object} [ctx] — the relay's: who pressed Begin
 * @returns {Promise<void>}
 */
export function applyBeginSession(payload = {}, ctx = {}) {
  const run = settledWithin(_beginChain, SESSION_CHAIN_WAIT_MS, "Begin a Session (the Begin ahead of it)")
    .then(() => beginSessionOnce(payload, ctx));
  _beginChain = run.catch(() => {});
  return run;
}

async function beginSessionOnce(payload, ctx = {}) {
  const vignetteRolled = payload.vignetteRolled === true;
  const includeGalley  = payload.includeGalley !== false;
  // The table's own word on where and when the session picks up (issue #381
  // D8): cleaned again here — it crossed the socket from the pressing client.
  const pickUp         = cleanPickUp(payload.pickUp);
  // The Begin card's Spotlight Vignette d100 (issue #381 D3): the number
  // alone crosses the socket — the result is read off the table here.
  const spotlightRoll  = vignetteRolled ? cleanD100(payload.spotlightRoll) : null;

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
  let sessionId = null;
  try {
    const { beginSession, rollSessionIfDue, SESSION_MINT_FIELDS, sessionMintsSettled, noteSessionReplaced } = await import("../session/lifecycle.js");
    const { writeOwnedFields } = await import("../factContinuity/sceneLifecycle.js");
    // Read once the world load's mint on this client has landed — this Begin
    // may arrive during its summary call: both minted, and the load's write
    // overwrote Begin's session id and open gate (SESSION-MINT-RACE). After
    // it, Begin reads the session the load minted.
    await sessionMintsSettled();
    const cs = foundry.utils.deepClone(game.settings.get(MODULE_ID, "campaignState") ?? {});
    await rollSessionIfDue(cs);
    if (cs.currentSessionId && cs.sessionStartedId === cs.currentSessionId) {
      console.debug?.(`${MODULE_ID} | Begin a Session: session ${cs.currentSessionId} has already begun — start effects not repeated.`);
      await postSessionAlreadyBegunCard(cs.currentSessionId);
      // The dialog's vow is no start effect: sworn into the session under way.
      await swearBeginVow(payload.vow, ctx);
      return;
    }
    beginSession(cs);
    cs.sessionStartedId = cs.currentSessionId ?? null;
    sessionId = cs.currentSessionId ?? null;
    // The foci go on to the narrator for this session (issue #286 C5) — a
    // quest focus that names a vow since closed is no quest of this session's
    // (issue #388 #13): the card says so, and the narrator is not told it.
    const noted      = cleanFocus(cs.questFocus);
    const quest      = noted && !(await closedVowOf(noted)) ? noted : "";
    const connection = cleanFocus(cs.connectionFocus);
    if (quest || connection) cs.sessionFocus = { sessionId: cs.currentSessionId ?? null, quest, connection };
    cs.questFocus      = "";
    cs.connectionFocus = "";
    // On the client's campaignState write chain, merged onto the store as
    // the write ahead left it (CAMPSTATE-CHAIN-PARTIAL).
    await writeOwnedFields(cs, BEGIN_SESSION_FIELDS.concat(SESSION_MINT_FIELDS), "begin session");
    // Its mint (if any) has landed: the session it replaced is no longer current
    // (rollSessionIfDue noted it — BEGIN-MINT-LINE-WINDOW).
    noteSessionReplaced();
    Hooks.callAll(`${MODULE_ID}.sessionStateChanged`, { active: true });
    begun = true;
    // The session's first event on its record: the table as play begins
    // (issue #382), before the start effects below change it — its sheets are
    // read as this call is made; the record's write never holds up Begin.
    void recordSessionEdge("session.begun", cs, {
      number:      cs.sessionNumber ?? null,
      perspective: cs.sessionPerspective?.sessionId === sessionId ? (cs.sessionPerspective.perspective ?? null) : null,
      focus:       { quest, connection },
    });
    // The session's first narrator call takes a new world snapshot (issue #357).
    reportSnapshotEvent("session_begin");
  } catch (err) {
    console.warn(`${MODULE_ID} | beginSession state flip failed — start effects skipped:`, err?.message ?? err);
    // The table is told: the Begin card already posted ("scene set", "+1
    // momentum") and the relay has no ack, so a refusal was silent on every
    // client (issue #329 X13).
    await postSessionNotStartedCard(vignetteRolled);
  }
  if (!begun) return;

  // The vow the dialog swore, now the session it is sworn in is begun —
  // before the start effects, as its card followed the Begin card when the
  // pressing client made it (swearBeginVow).
  await swearBeginVow(payload.vow, ctx);

  if (vignetteRolled) {
    await applyMomentumToAllPlayers(1, { sessionId, award: "Begin a Session — the Spotlight Vignette" });
  }

  // The spotlight vignette — its own short cutaway, first of Begin's
  // narrations (issue #381 D3): after the clock card, which the clocks' roll
  // below posts, or at once with no clock card. The clock vignettes and the
  // opening each wait for it, bounded.
  let spotlight = null;
  const startSpotlight = () => { if (spotlightRoll && !spotlight) spotlight = narrateSpotlightAtBegin(spotlightRoll); };

  // Campaign clocks — roll Ask the Oracle for each at session start (play
  // kit: campaign clocks advance at Begin a Session via the clock's
  // advanceOdds). The session is stamped begun above, so a second Begin
  // repeats nothing: an advance the world refused is a `clocks` step on the
  // GMs' payoff failure card, whose Retry saves the rolled fills without
  // rolling again (issue #316 T04 — it was caught and logged, and lost).
  // The clock vignettes' run, settled once they are done: the galley follows
  // it (issue #335 Y05).
  let clockVignettes = null;
  try {
    const { advanceCampaignClocksForBeginSession } = await import("../clocks/clocks.js");
    const clockResults = await advanceCampaignClocksForBeginSession();
    if (clockResults.length) {
      const rows = clockResults.map(r => {
        const bar    = "█".repeat(r.filled) + "░".repeat(Math.max(0, r.segments - r.filled));
        const status = r.advanced
          ? `YES (d100=${r.roll}) — <strong>${r.filled}/${r.segments}</strong>${r.triggered ? " <strong>(TRIGGERED)</strong>" : ""}${r.saved === false ? " — <em>not saved: see the GMs' Retry card</em>" : ""}`
          : `NO (d100=${r.roll})`;
        return `<li>${escapeHtml(r.name)} [${bar}] — Ask the Oracle (${r.odds}): ${status}</li>`;
      }).join("");
      await ChatMessage.create({
        content: `<div class="sf-clock-card"><strong>⏳ Campaign clocks — Begin a Session</strong><ul>${rows}</ul></div>`,
        flags:   { [MODULE_ID]: { clockCard: true, beginSessionAdvance: true } },
      });
      startSpotlight();
      const unsaved = clockResults.filter(r => r.advanced && r.saved === false);
      if (unsaved.length) {
        try {
          const { postPayoffFailureCard } = await import("../index.js");
          await postPayoffFailureCard({ source: "sessionClocks", failures: [{
            step: "clocks", sessionId,
            clocks: unsaved.map(r => ({ _id: r._id, name: r.name, filled: r.filled, segments: r.segments })),
            reason: "refused", error: unsaved[0].error ?? null,
          }] });
        } catch (err) {
          console.warn(`${MODULE_ID} | session-start clocks: failure card failed:`, err?.message ?? err);
        }
      }
      // A trigger the world refused to save is owed, not taken back: the
      // Retry's fill narrates it when it lands (clocks.applyClockAdvances).
      // Narrated here it was dropped as rewound — the store is not full —
      // and the Retry narrated nothing (issue #342 Z63).
      const advanced = clockResults.filter(r => r.advanced && !(r.triggered && r.saved === false));
      if (advanced.length) {
        clockVignettes = new Promise(resolve => setTimeout(async () => {
          try {
            // After the spotlight vignette, whose scene ends before theirs opens.
            if (spotlight) await settledWithin(spotlight, OPENING_VIGNETTE_WAIT_MS, "spotlight vignette");
            const { narrateClockAdvancement } = await import("../narration/narrator.js");
            const { clockStillTriggered } = await import("../clocks/payThePriceClocks.js");
            // A working copy — each vignette applies its sidecar on it (issue #329 X09).
            const cs = foundry.utils.deepClone(game.settings.get(MODULE_ID, "campaignState") ?? {});
            for (const cd of advanced) {
              const narrationId = newNarrationId();
              // A trigger is narrated only while the clock is still full when
              // the reply comes in (TRIGGER-VIGNETTE-LATE-POST).
              const text = await narrateClockAdvancement({ clock: cd, campaignState: cs, narrationId,
                stillTriggered: () => clockStillTriggered(cd) });
              if (text) {
                // Flag family (NARR-RING-CLOCKVIG): threat-advance fiction
                // must enter the ring/summary or it is forgotten instantly.
                // narrationId: what an X-Card on it retracts (issue #321 U07).
                await ChatMessage.create({
                  // NPC dialogue markup stripped, as on every fiction card (issue #331 X27).
                  content: `<div class="sf-clock-card">${cd.triggered ? "<strong>⚠ TRIGGERED — </strong>" : ""}<em>${proseToHtml(text)}</em></div>`,
                  flags:   {
                    [MODULE_ID]: {
                      clockCard:         true,
                      clockVignetteCard: true,
                      narratorCard:      true,
                      narrationText:     text,
                      sessionId:         cs.currentSessionId ?? null,
                      narrationId,
                      // A trigger vignette names its clock (issue #338 D8).
                      ...(cd.triggered && cd._id ? { clockId: cd._id } : {}),
                    },
                  },
                });
              }
            }
          } catch (err) {
            console.warn(`${MODULE_ID} | session-start clock vignette generation failed:`, err?.message ?? err);
          } finally {
            resolve();
          }
        }, 0));
      }
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | campaign clock session-start roll failed:`, err?.message ?? err);
  }
  startSpotlight();

  // Fire-and-forget opening scene — narrator-generated, four to six
  // sentences: the PCs at the table in a quiet moment where the last session
  // stopped, built from rolled material (issue #381). Silent skip when the
  // Claude key is unset or narration is disabled. Gated on the dialog's
  // "Include an opening scene" checkbox (default on) so unchecking it
  // suppresses the scene (playtest finding: it ran regardless). Runs here,
  // on the canonical GM, because that is the client holding the Claude key.
  if (!includeGalley) {
    console.debug?.(`${MODULE_ID} | Begin a Session: opening scene unchecked — skipped.`);
    // With no opening narration to follow — the galley unchecked, no clock
    // vignette — the narrator's cached prefix (its rules and the world
    // snapshot) is written now, so the session's first narration reads it and
    // is not the slow one (issue #357). An opening narration writes it itself.
    // Not awaited: Begin a Session does not wait on a Claude round trip.
    if (!clockVignettes && !spotlight) warmNarratorCacheAfterBegin();
    return;
  }
  setTimeout(async () => {
    // After the clock vignettes, and read once they are done: the galley
    // continues the scene they opened with their beat in it. Together, each
    // minted a scene on its own copy and the one on the losing scene lost its
    // facts (issue #335 Y05). A vignette is a Claude call — the wait is bounded.
    // The spotlight vignette is first of all (issue #381 D3).
    if (spotlight) await settledWithin(spotlight, OPENING_VIGNETTE_WAIT_MS, "spotlight vignette");
    if (clockVignettes) await settledWithin(clockVignettes, OPENING_VIGNETTE_WAIT_MS, "galley vignette");
    try {
      const { collectGalleyParticipants, composeOpeningScene, postGalleyVignetteCard }
        = await import("../session/galleyVignette.js");
      const { narrateSessionVignette, sessionVignetteWillRun } = await import("../narration/narrator.js");
      // A working copy — the narration starts its scene and applies its
      // sidecar on it, and a refused write must leave this client's cache as
      // the world has it (issue #335 Y04, the clock vignette's X09 copy).
      const cs = foundry.utils.deepClone(game.settings.get(MODULE_ID, "campaignState") ?? {});
      // The scene's dice are the table's: rolled once, here on the canonical
      // GM, and only for a scene that will be narrated (issue #381) — with
      // narration off, no key here or the X-Card up, nothing is rolled.
      if (!sessionVignetteWillRun(cs)) return;
      const participants = collectGalleyParticipants(cs);
      const { userMessage, seeds, carry } = await composeOpeningScene(participants, cs, { pickUp });
      const narrationId  = newNarrationId();
      // The PCs in the scene are the vignette's CHARACTER blocks — never a
      // first PC whose player is away (issue #345 AA31).
      const actorIds = participants.active.map(p => p.actor?.id).filter(Boolean);
      // Its scene opens with the people the last session stopped with, at that place (issue #402 D2).
      const text = await narrateSessionVignette({ userMessage, campaignState: cs, narrationId, actorIds, seeds, carry });
      if (text) {
        // The seeds were marked by the narration's own account of them; the
        // card keeps them (`builtFrom`) and shows them to the table.
        await postGalleyVignetteCard({ text, kind: "galley_begin", sessionId: cs.currentSessionId ?? "", narrationId, seeds });
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | opening scene generation failed:`, err?.message ?? err);
    }
  }, 0);
}


/**
 * Begin a Session's spotlight vignette (issue #381 D3), in the background:
 * settled once it is written — or found it cannot be — and never rejected.
 *
 * @param {number} roll — the Begin card's d100
 * @returns {Promise<void>}
 */
function narrateSpotlightAtBegin(roll) {
  return new Promise(resolve => setTimeout(() => {
    writeSpotlightVignette(roll).catch(err => {
      console.warn(`${MODULE_ID} | Begin a Session: the spotlight vignette failed:`, err?.message ?? err);
    }).finally(resolve);
  }, 0));
}

/**
 * The spotlight vignette, on the canonical GM: built from the Begin card's
 * Spotlight Vignette roll and rolled material (session/spotlightVignette.js),
 * narrated, and posted as its own card; then its scene — the cutaway's own —
 * is ended, as the closing's is, so the opening starts the session's scene
 * clean. A scene that was already open is the table's, and is left as it
 * was. A narration that was due and was not written leaves a line saying the
 * result is the table's to envision — no narrator card. A named function:
 * the playthrough harness names a Claude call by its two nearest callers.
 *
 * @param {number} roll
 * @returns {Promise<void>}
 */
async function writeSpotlightVignette(roll) {
  let cs = null;
  let sceneBefore = null;
  let narrated = false;
  try {
    const { composeSpotlightScene, postSpotlightVignetteCard } = await import("../session/spotlightVignette.js");
    const { collectGalleyParticipants } = await import("../session/galleyVignette.js");
    const { narrateSessionVignette, sessionVignetteWillRun } = await import("../narration/narrator.js");
    // A working copy, as the opening's (issue #335 Y04).
    cs = foundry.utils.deepClone(game.settings.get(MODULE_ID, "campaignState") ?? {});
    sceneBefore = cs.currentSceneId ?? null;
    // Its dice are the table's: rolled once, here, for a scene that will be narrated.
    const scene = sessionVignetteWillRun(cs) ? composeSpotlightScene(cs, { roll }) : null;
    if (scene) {
      const narrationId = newNarrationId();
      const actorIds = collectGalleyParticipants(cs).active.map(p => p.actor?.id).filter(Boolean);
      const text = await narrateSessionVignette({
        userMessage: scene.userMessage, campaignState: cs, narrationId, actorIds, seeds: scene.seeds,
        narratorClass: scene.narratorClass, detect: true,
      });
      if (text) {
        await postSpotlightVignetteCard({ text, sessionId: cs.currentSessionId ?? "", narrationId, seeds: scene.seeds });
        narrated = true;
      }
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | Begin a Session: the spotlight vignette was not written:`, err?.message ?? err);
  }
  if (!narrated) await postSpotlightUnwrittenCard(roll);
  try {
    if (cs?.currentSceneId && !sceneBefore) {
      const { endScene } = await import("../factContinuity/sceneLifecycle.js");
      await endScene(cs, { reason: "spotlight_vignette" });
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | the spotlight vignette's scene was not ended:`, err?.message ?? err);
  }
}

/**
 * The Begin card promised a narration of its Spotlight Vignette and none was
 * written: one line says the result is the table's to envision. A Begin a
 * Session note, not a narrator card — nothing of it is story.
 *
 * @param {number} roll
 */
async function postSpotlightUnwrittenCard(roll) {
  let result = "";
  try { result = rollOracle("spotlight_vignette", { roll }).result; } catch { result = ""; }
  await ChatMessage.create({
    content: `<div class="sf-session-card"><strong>Spotlight vignette</strong><p>${result ? `${escapeHtml(result)} — ` : ""}the narrator did not write it: yours to envision.</p></div>`,
    flags:   { [MODULE_ID]: { sessionLifecycleCard: true } },
  }).catch(err => console.warn(`${MODULE_ID} | Begin a Session: the spotlight note failed:`, err?.message ?? err));
}

/**
 * Begin a Session's start write was refused: nothing began. Posted where the
 * Begin card is, so its promise ("scene set", "+1 momentum") is not the last
 * word (issue #329 X13 — End a Session reports its own write failure).
 *
 * @param {boolean} vignetteRolled — the card promised the vignette's momentum
 */
async function postSessionNotStartedCard(vignetteRolled) {
  const momentum = vignetteRolled ? " No momentum was applied, and no clock advanced." : " No clock advanced.";
  await ChatMessage.create({
    content: `<div class="sf-session-card"><strong>Begin a Session</strong><p>The session was not started — the world did not save it.${momentum} Try Begin a Session again.</p></div>`,
    flags:   { [MODULE_ID]: { sessionLifecycleCard: true, sessionNotStarted: true } },
  }).catch(err => console.warn(`${MODULE_ID} | Begin a Session: the not-started card failed:`, err?.message ?? err));
}

/**
 * Begin a Session ran again on a session already begun — say what (didn't)
 * happen, and name a session-start clock advance still waiting on the GMs'
 * Retry card, since Begin again is the natural (and wrong) way to try again
 * (issue #316 T04).
 *
 * @param {string|null} sessionId
 */
async function postSessionAlreadyBegunCard(sessionId = null) {
  const owed = outstandingSessionClocks(sessionId);
  const owedNote = owed.length
    ? ` The start's advance of ${owed.map(escapeHtml).join(", ")} was not saved — a GM's Retry on the GMs' card saves it.`
    : "";
  await ChatMessage.create({
    content: `<div class="sf-session-card"><strong>Begin a Session</strong><p>This session has already begun — its campaign clocks, momentum and opening scene are not repeated. End a Session to begin the next one.${owedNote}</p></div>`,
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

  // A cost nobody has answered, said while there is still a session to answer
  // it in (issue #374 A10). Fail-open: no line.
  let owedHint = "";
  try {
    const owed = costsOwedSentence();
    if (owed) owedHint = `<p class="hint sf-costs-owed"><strong>Unpaid:</strong> ${escapeHtml(owed)}</p>`;
  } catch (err) {
    console.warn(`${MODULE_ID} | End a Session: the costs still owed could not be read:`, err?.message ?? err);
  }

  // The open vows and the connections, one click each into their focus
  // field, beside the free text (issue #353 R4): left blank, the focus — and
  // its +1 momentum — went unchosen. Fail-open: none offered.
  let questChoices      = [];
  let connectionChoices = [];
  try {
    const { vowChoices, tableConnectionNames } = await import("../session/openThreads.js");
    questChoices      = vowChoices().map(v => ({ value: v.name, label: v.label }));
    connectionChoices = tableConnectionNames().map(name => ({ value: name, label: name }));
  } catch (err) {
    console.warn(`${MODULE_ID} | End a Session: the focus choices could not be read:`, err?.message ?? err);
  }

  const content = `
    <form class="sf-end-session-form">
      <p class="hint">Reflect on the events of the game and identify any missed
      opportunities to mark progress. If a quest advanced, Reach a Milestone now.
      If a tie strengthened, Develop Your Relationship.</p>
      <label>
        <span>Quest focus for next session (optional)</span>
        <input type="text" name="questFocus" maxlength="120">
      </label>
      ${renderFocusChoices("questFocus", "Open vows", questChoices)}
      <label>
        <span>Connection focus for next session (optional)</span>
        <input type="text" name="connectionFocus" maxlength="120">
      </label>
      ${renderFocusChoices("connectionFocus", "Connections", connectionChoices)}
      <p class="hint">${bonusHint}</p>
      ${owedHint}
    </form>
  `;

  await DialogV2.prompt({
    window:  { title: "End a Session" },
    content,
    // The choices' clicks are wired when the dialog renders (DialogV2.wait,
    // which prompt runs, attaches `render`).
    render: (event, dialog) => wireFocusChoices(dialogElement(event, dialog)),
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
  if (questFocus)      lines.push(questFocusItem(questFocus, await closedVowOf(questFocus)));
  if (connectionFocus) lines.push(`<li><strong>Connection focus:</strong> ${escapeHtml(connectionFocus)}</li>`);
  const endedBefore = sessionAlreadyEnded(game.settings.get(MODULE_ID, "campaignState") ?? {});

  // The world writes (foci, session-active flip, scene close, summary, log,
  // momentum) run on the canonical GM; the card follows on this client.
  const res = await requestGmActionSafely("session.end", { questFocus, connectionFocus });
  // Ended already (issue #309 N08): the GM's note card says what changed — a
  // second card here would promise momentum that is not paid again.
  if (res?.ok !== false && (res?.result?.alreadyEnded === true || (endedBefore && res?.relayed))) return;
  const failed = res?.ok === false;
  const noGm   = failed && res.reason === "no-gm";

  // A failed End is worded by what happened: no momentum is promised. Ended
  // already, nothing was ended — only the focus correction did not land, and
  // this card is the only word on the GM's own End (the handler's note is a
  // relayed End's). It read "+1 momentum" and "could not be ended".
  if (failed && endedBefore) {
    const why = noGm ? "no GM is connected" : "see the console";
    const text = lines.length
      ? `This session has already ended, so nothing was ended. The focus for next session was not recorded, and no momentum was given — ${why}. Try End a Session again${noGm ? " once a GM has joined" : ""}.`
      : `This session has already ended, so nothing was ended — ${why}.`;
    await ChatMessage.create({
      content: `<div class="sf-session-card"><strong>End a Session</strong><p class="muted sf-not-recorded"><em>${escapeHtml(text)}</em></p></div>`,
      flags:   { [MODULE_ID]: { sessionLifecycleCard: true } },
    });
    return;
  }

  // A cost nobody answered is said before the session closes on it (issue
  // #374 A10): its card holds nothing up, so it can be typed past.
  const owed = costsOwedSentence();
  const owedBlock = owed ? `<p class="sf-costs-owed"><strong>Unpaid:</strong> ${escapeHtml(owed)}</p>` : "";

  const focusBlock = !lines.length
    ? `<p class="muted"><em>No focus set — no momentum bonus.</em></p>`
    : failed
      ? `<ul>${lines.join("")}</ul>`
      : `<ul>${lines.join("")}</ul><p>You take <strong>+1 momentum</strong>.</p>`;
  const notRecorded = failed
    ? `<p class="muted sf-not-recorded"><em>${noGm
        ? "No GM is connected — the session was not ended, and no focus or momentum was recorded. Try again once a GM has joined."
        : "The session could not be ended — see the console."}</em></p>`
    : "";

  await ChatMessage.create({
    content: `<div class="sf-session-card"><strong>End a Session</strong>${focusBlock}${owedBlock}${notRecorded}</div>`,
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
// not yet ended (issue #309 N08). Bounded as Begin's is (issue #347 AB05).
let _endChain = Promise.resolve();

/**
 * GM-relay handler for `"session.end"` (GM_ACTIONS in
 * src/multiplayer/gmRelay.js) — runs on the canonical GM. Sub-steps, in
 * order: persist foci → session-active flip OFF and mark the session ended →
 * close the active scene → finalise the rolling session summary → persist
 * End's own fields onto the latest campaignState (+ sessionStateChanged) →
 * Session Log write → +1 momentum to all players when a focus was set →
 * closing cutaway (endSessionVignette.js — none with nobody and nowhere to
 * show), then a campaign-recap refresh.
 *
 * A session ends once (issue #309 N08 — every End paid the party momentum
 * again, and closed the session, wrote its log and scheduled its vignette
 * again). End again on a session already ended only corrects the focus for
 * next session, and posts a note: the momentum is paid for the first focus
 * the session's ending notes, never again.
 *
 * A refused write throws. On a relayed End the player's card has already
 * posted ("+1 momentum") and the relay has no ack, so the handler first posts
 * a note where that card is (issue #335 Y06, X13's shape); the local path's
 * card says so itself (requestGmActionSafely → "could not be ended").
 *
 * @param {{ questFocus?: string, connectionFocus?: string }} payload
 * @param {{ local?: boolean }} [ctx]
 * @returns {Promise<{ alreadyEnded: boolean }>} alreadyEnded: the session had
 *   ended — only the focus was corrected (postEndSessionCard posts no card)
 */
export function applyEndSession(payload = {}, ctx = {}) {
  const run = settledWithin(_endChain, SESSION_CHAIN_WAIT_MS, "End a Session (the End ahead of it)")
    .then(() => endSessionOnce(payload, ctx));
  _endChain = run.catch(() => {});
  return run;
}

async function endSessionOnce(payload, ctx = {}) {
  const questFocus      = cleanFocus(payload.questFocus);
  const connectionFocus = cleanFocus(payload.connectionFocus);

  // A result still held for its roller's Burn / Improve / Keep is kept — paid
  // and narrated — before the session ends (issue #362 D5, decided A): it
  // stayed held across End a Session, and its roller's first line of the next
  // session paid last session's price and narrated last session's roll into
  // the new session's story. Before the scene closes and the summary is
  // finalised, so its narration is in the session it was rolled in. Canonical
  // GM (End a Session runs there); a no-op with nothing held.
  try {
    const { keepEveryHeldResult } = await import("../moves/heldResult.js");
    await keepEveryHeldResult("session-end");
  } catch (err) {
    console.warn(`${MODULE_ID} | End a Session: the held results could not be kept first:`, err?.message ?? err);
  }

  // Persist the foci to campaignState so the next Begin a Session can surface
  // them (openBeginSessionDialog / postBeginSessionCard read them;
  // applyBeginSession clears them). Also flip the session-active gate OFF and
  // award the +1 momentum to all players if a focus was set. On a copy
  // (rules/foundry-api.md): get() returns the cached value, and a refused
  // write must leave it as it was — marked ended on this client alone, every
  // retry would be taken for a second End.
  const state = foundry.utils.deepClone(game.settings.get(MODULE_ID, "campaignState") ?? {});
  if (sessionAlreadyEnded(state)) return correctEndedSession(state, { questFocus, connectionFocus }, ctx);
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

  // The gate closes first: only the fields End a Session owns, merged onto
  // the latest stored campaignState, before the scene close and the
  // summary's Claude call. Written after them, the store said the session
  // was active for those seconds, and a line typed meanwhile was rolled and
  // narrated into the session being ended — after its scene closed and its
  // summary was finalised (issue #331 X41). Written whole, `state` reverted a
  // move persisted meanwhile (its legacy ticks, entity ids, its released
  // `pendingMove` lock). A write failure still throws (the card says so),
  // before anything else of the End has run. On the client's campaignState
  // write chain, merged onto the store as the write ahead left it: merged
  // onto the cache inside an oracle capture's round trip, it erased the
  // answer (CAMPSTATE-CHAIN-PARTIAL).
  const { writeOwnedFields } = await import("../factContinuity/sceneLifecycle.js");
  try {
    await writeOwnedFields(state, END_SESSION_FIELDS, "end session");
  } catch (err) {
    if (ctx?.local === false) {
      await postSessionNotEndedCard("The session was not ended — the world did not save it. No focus or momentum was recorded. Try End a Session again.");
    }
    throw err;
  }
  Hooks.callAll(`${MODULE_ID}.sessionStateChanged`, { active: false });

  // The session's last event on its record: the table as it stands at the
  // end (issue #382), before a noted focus's momentum — its sheets are read as
  // this call is made; the record's write never holds up End (it never throws).
  void recordSessionEdge("session.ended", state, { reason: "end", focus: { quest: questFocus, connection: connectionFocus } });

  // The +1 momentum a noted focus earns, as soon as the gate write says the
  // session ended with one — never after the scene close and the summary's
  // Claude call, which it does not need: a GM who left during those seconds
  // took the award with them, the world said "ended, focus noted", and a
  // later End's correction paid nothing and called it taken (issue #342 Z64).
  // A refused write is still owed on the GMs' card (P08).
  if (questFocus || connectionFocus) {
    await applyMomentumToAllPlayers(1, { sessionId: state.currentSessionId ?? null, award: "End a Session — a focus noted" });
  }

  // The frame of the scene the session ended in, before it is closed: whom
  // it had with the characters, and where they are — the closing cutaway
  // shows someone, or somewhere, they are not (issue #381).
  const endedFrame = state.sceneFrame ? foundry.utils.deepClone(state.sceneFrame) : null;

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

  // Bring the session summary up to date (a view of the session record,
  // issue #382): it is the Session Log page's "Session summary" and the next
  // session's LAST SESSION. Self-gates on narratorSessionSummary; fail-open.
  try {
    const { getRollingSessionSummary } = await import("../narration/narrator.js");
    await getRollingSessionSummary(state, { forceRefresh: true });
  } catch (err) {
    console.warn(`${MODULE_ID} | rolling session summary finalise failed:`, err?.message ?? err);
  }

  // Its Session Log page is the record's view, rendered as the record and the
  // summary land (record/sessionLogView.js) — nothing is written to it here.

  // Fire-and-forget closing cutaway — narrator-generated, three to five
  // sentences: someone the campaign has, chosen by a die and never the same
  // twice running, or with nobody a settlement the table knows, at something
  // small, built from rolled material (issue #381). Silent skip when the
  // Claude key is unset or narration is disabled; none with nobody and
  // nowhere to show. Runs here, on the canonical GM, because that is the
  // client holding the Claude key.
  setTimeout(async () => {
    let cs = null;
    try {
      const { composeClosingScene, postEndSessionVignetteCard } = await import("../session/endSessionVignette.js");
      const { narrateSessionVignette, sessionVignetteWillRun } = await import("../narration/narrator.js");
      // A working copy, as the opening's (issue #335 Y04): its scene opens on
      // the copy, never on the cache after End closed the real one.
      cs = foundry.utils.deepClone(game.settings.get(MODULE_ID, "campaignState") ?? {});
      // The closing's dice are the table's: rolled once, here on the
      // canonical GM, and only for a scene that will be narrated.
      const scene = sessionVignetteWillRun(cs) ? composeClosingScene(cs, { connectionFocus, frame: endedFrame }) : null;
      if (scene) {
        const narrationId = newNarrationId();
        // Its CHARACTER blocks are the PCs at the table, as the opening's —
        // it took the campaign's first PC, whoever was there (known-issues
        // CLOSING-VIGNETTE-FIRST-PC); none present gives none.
        const { collectGalleyParticipants } = await import("../session/galleyVignette.js");
        const actorIds = collectGalleyParticipants(cs).active.map(p => p.actor?.id).filter(Boolean);
        const text = await narrateSessionVignette({ userMessage: scene.userMessage, campaignState: cs, narrationId, actorIds, seeds: scene.seeds });
        if (text) {
          // The seeds were marked by the narration's own account of them; the
          // card keeps them (`builtFrom`) — and the next closing reads whom
          // this one showed from it.
          await postEndSessionVignetteCard({ text, npcName: scene.subject.name, sessionId: cs.currentSessionId ?? "", narrationId, seeds: scene.seeds });
        }
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | end-session vignette generation failed:`, err?.message ?? err);
    }
    // The closing vignette is a cutaway — an NPC somewhere the players are
    // not — and the scene it opened for its fact block (issue #321 U34) is
    // its own: it ends here, with its card, its facts filed as any scene's
    // end files them. Left open until the next session was minted, it was the
    // campaign's active scene meanwhile, and the recap below was told, as
    // binding, that the campaign stood where the cutaway did (issue #374 A1,
    // RECAP-TAKES-CLOSING-VIGNETTE-AS-THE-SCENE). A narration that failed
    // after opening its scene leaves none open either.
    try {
      if (cs?.currentSceneId) {
        const { endScene } = await import("../factContinuity/sceneLifecycle.js");
        await endScene(cs, { reason: "closing_vignette" });
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | the closing vignette's scene was not ended:`, err?.message ?? err);
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
 * @param {{ local?: boolean }} [ctx] — the relay context (endSessionOnce's)
 * @returns {Promise<{ alreadyEnded: true }>}
 */
async function correctEndedSession(state, { questFocus, connectionFocus }, ctx = {}) {
  const given = !!(questFocus || connectionFocus);
  const bonus = given && !hasFocus(state);
  if (given) {
    if (questFocus)      state.questFocus      = questFocus;
    if (connectionFocus) state.connectionFocus = connectionFocus;
    const { writeOwnedFields } = await import("../factContinuity/sceneLifecycle.js");
    try {
      await writeOwnedFields(state, ["questFocus", "connectionFocus"], "end session (focus correction)");
    } catch (err) {
      // A relayed correction posts no card on the player's client — this note
      // was going to be the only word (issue #335 Y06).
      if (ctx?.local === false) {
        await postSessionNotEndedCard("This session has already ended. The focus for next session was not updated — the world did not save it, and no momentum was recorded. Try End a Session again.");
      }
      throw err;
    }
  }
  if (bonus) await applyMomentumToAllPlayers(1, { sessionId: state.currentSessionId ?? null, award: "End a Session — the first focus noted" });
  console.debug?.(`${MODULE_ID} | End a Session: session ${state.currentSessionId} has already ended — ${given ? "focus updated" : "nothing changed"}${bonus ? ", first focus: +1 momentum" : ""}.`);

  const lines = [];
  if (questFocus)      lines.push(questFocusItem(questFocus, await closedVowOf(questFocus)));
  if (connectionFocus) lines.push(`<li><strong>Connection focus:</strong> ${escapeHtml(connectionFocus)}</li>`);
  // An award that did not land waits on the GMs' Retry — never "taken".
  const owed = outstandingSessionMomentum(state.currentSessionId ?? null);
  const owedLine = owed.length
    ? ` Momentum that did not reach ${owed.map(escapeHtml).join(", ")} waits on a GM's Retry.`
    : "";
  const focusBlock = !given ? ""
    : `<p>Focus for next session updated:</p><ul>${lines.join("")}</ul>`
      + (bonus
        ? `<p>The first focus noted for this session: you take <strong>+1 momentum</strong>.</p>`
        : `<p class="muted"><em>No momentum — it was taken when the session ended with a focus.${owedLine}</em></p>`);
  await ChatMessage.create({
    content: `<div class="sf-session-card"><strong>End a Session</strong>`
      + `<p>This session has already ended — it is not closed again, and its Session Log and closing scene are not repeated.</p>`
      + `${focusBlock}</div>`,
    flags:   { [MODULE_ID]: { sessionLifecycleCard: true } },
  }).catch(err => console.warn(`${MODULE_ID} | End a Session: note card failed:`, err?.message ?? err));
  return { alreadyEnded: true };
}

/**
 * A relayed End a Session's write was refused: posted where the player's End
 * card is, so its promise ("+1 momentum") is not the last word — the relay has
 * no ack (issue #335 Y06; Begin's postSessionNotStartedCard, issue #329 X13).
 *
 * @param {string} text — what was not recorded (plain text)
 */
async function postSessionNotEndedCard(text) {
  await ChatMessage.create({
    content: `<div class="sf-session-card"><strong>End a Session</strong><p>${escapeHtml(text)}</p></div>`,
    flags:   { [MODULE_ID]: { sessionLifecycleCard: true } },
  }).catch(err => console.warn(`${MODULE_ID} | End a Session: the not-ended card failed:`, err?.message ?? err));
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

/** How many one-click choices a focus field offers, at most. */
const MAX_FOCUS_CHOICES = 8;

/**
 * End a Session's one-click choices for a focus field (issue #353 R4): a
 * button per open vow or connection that puts its name in the field, which
 * stays free text. '' with none to offer.
 *
 * @param {"questFocus"|"connectionFocus"} field — the input's name
 * @param {string} title
 * @param {Array<{ value: string, label: string }>} choices
 * @returns {string}
 */
function renderFocusChoices(field, title, choices) {
  const list = (Array.isArray(choices) ? choices : [])
    .filter(c => typeof c?.value === "string" && c.value.trim())
    .slice(0, MAX_FOCUS_CHOICES);
  if (!list.length) return "";
  const buttons = list.map(c =>
    `<button type="button" class="sf-focus-choice" data-focus-field="${field}" data-focus-value="${escapeHtml(cleanFocus(c.value))}">${escapeHtml(c.label || c.value)}</button>`,
  ).join(" ");
  return `<p class="sf-focus-choices"><span class="muted">${escapeHtml(title)}:</span> ${buttons}</p>`;
}

/**
 * The dialog's element in its render callback: DialogV2.wait passes the
 * dialog (v13) — an older shape passed the element itself.
 */
function dialogElement(event, dialog) {
  if (typeof dialog?.querySelectorAll === "function") return dialog;
  return dialog?.element ?? event?.target?.element ?? null;
}

/**
 * Wire End a Session's focus choices: a click puts the choice in its field
 * (renderFocusChoices). The buttons are `type="button"` with no action, so a
 * click never submits the dialog.
 *
 * @param {HTMLElement|null} root — the dialog's element
 */
function wireFocusChoices(root) {
  if (typeof root?.querySelectorAll !== "function") return;
  for (const button of root.querySelectorAll("[data-focus-field]")) {
    button.addEventListener("click", (event) => {
      event?.preventDefault?.();
      const field = root.querySelector(`input[name="${button.dataset.focusField}"]`);
      if (field) field.value = button.dataset.focusValue ?? "";
    });
  }
}

/**
 * The closed vow a quest focus names (session/openThreads.js closedVowNamed),
 * or null. Fail-open: a focus that cannot be checked stands as written.
 *
 * @param {string} quest — cleaned
 * @returns {Promise<{ name: string, how: string }|null>}
 */
async function closedVowOf(quest) {
  if (!quest) return null;
  try {
    const { closedVowNamed } = await import("../session/openThreads.js");
    return closedVowNamed(quest);
  } catch (err) {
    console.warn(`${MODULE_ID} | a session's quest focus could not be checked against the vows:`, err?.message ?? err);
    return null;
  }
}

/**
 * End a Session's quest-focus line — said, when it names a vow already
 * closed, while End again can still note another (issue #388 #13).
 *
 * @param {string} quest
 * @param {{ how: string }|null} closed — closedVowOf's
 * @returns {string}
 */
function questFocusItem(quest, closed) {
  const note = closed ? ` — <em>that vow is already ${escapeHtml(closed.how)}; End a Session again to note another quest.</em>` : "";
  return `<li><strong>Quest focus:</strong> ${escapeHtml(quest)}${note}</li>`;
}

/**
 * "Focus from last session" block for the Begin a Session dialog and card.
 * Empty string when End a Session recorded no focus. A quest focus that names
 * a vow since closed (`closed`, closedVowOf's) is marked so: it is not this
 * session's quest, and the narrator is not told it (issue #388 #13).
 *
 * @param {Object} state — campaignState
 * @param {{ closed?: { how: string }|null }} [opts]
 * @returns {string}
 */
function renderLastSessionFoci(state, { closed = null } = {}) {
  const quest      = cleanFocus(state?.questFocus);
  const connection = cleanFocus(state?.connectionFocus);
  if (!quest && !connection) return "";
  const items = [];
  if (quest)      items.push(`<li><strong>Quest:</strong> ${escapeHtml(quest)}${closed ? ` — <em>a vow already ${escapeHtml(closed.how)}</em>` : ""}</li>`);
  if (connection) items.push(`<li><strong>Connection:</strong> ${escapeHtml(connection)}</li>`);
  return `<div class="sf-last-session-foci"><p><strong>Focus from last session:</strong></p><ul>${items.join("")}</ul></div>`;
}

/**
 * Give every PC `delta` momentum — each PC's award its own write. One the world
 * refuses goes on the GMs' payoff failure card as a `momentum` step, whose
 * Retry gives that PC alone the momentum (index.js runPayoffStep): it was only
 * logged, while the session counted the award paid, so no End repaired it
 * (issue #311 P08).
 *
 * @param {number} delta
 * @param {{ sessionId?: string|null, award?: string }} [why] — for the GMs' card
 * @returns {Promise<Array<Object>>} the awards that did not land
 */
async function applyMomentumToAllPlayers(delta, { sessionId = null, award = null } = {}) {
  const { getPlayerActors, applyMeterChanges } = await import("../character/actorBridge.js");
  const failures = [];
  for (const a of getPlayerActors()) {
    try {
      await applyMeterChanges(a, { momentum: delta }, recordCause({ kind: "session" }));
    } catch (err) {
      console.warn(`${MODULE_ID} | momentum delta failed for ${a.name}:`, err?.message ?? err);
      failures.push({ step: "momentum", pcId: a.id, amount: delta, sessionId, award,
        reason: "refused", error: String(err?.message ?? err) });
    }
  }
  if (failures.length) {
    try {
      const { postPayoffFailureCard } = await import("../index.js");
      await postPayoffFailureCard({ source: "session", failures });
    } catch (err) {
      console.warn(`${MODULE_ID} | session momentum: failure card failed:`, err?.message ?? err);
    }
  }
  return failures;
}

/**
 * The PCs whose session momentum is still on an unretried GMs' card for
 * `sessionId` (applyMomentumToAllPlayers) — named on End a Session's
 * correction note, which would otherwise say the momentum was taken.
 *
 * @param {string|null} sessionId
 * @returns {string[]}
 */
function outstandingSessionMomentum(sessionId) {
  if (!sessionId) return [];
  const names = new Set();
  for (const m of game.messages?.contents ?? []) {
    const f = m?.flags?.[MODULE_ID];
    // A card with no Retry (`retryable: false`) names what is no longer owed
    // — a PC whose sheet is gone (index.js retryPayoffSteps): nothing waits on it.
    if (!f?.payoffFailureCard || f.resolved || f.retryable === false || f.source !== "session") continue;
    for (const s of f.steps ?? []) {
      if (s?.step === "momentum" && s.sessionId === sessionId) names.add(game.actors?.get?.(s.pcId)?.name ?? "a character");
    }
  }
  return [...names];
}

/**
 * The campaign clocks whose session-start advance for `sessionId` is still
 * on an unretried GMs' card (a `clocks` step, issue #316 T04) — named on the
 * already-begun note.
 *
 * @param {string|null} sessionId
 * @returns {string[]}
 */
function outstandingSessionClocks(sessionId) {
  if (!sessionId) return [];
  const names = new Set();
  for (const m of game.messages?.contents ?? []) {
    const f = m?.flags?.[MODULE_ID];
    // A card with no Retry (`retryable: false`) is a closing note — a `clocks`
    // step no Retry can run (index.js retryPayoffSteps): no Retry saves it.
    if (!f?.payoffFailureCard || f.resolved || f.retryable === false || f.source !== "sessionClocks") continue;
    for (const s of f.steps ?? []) {
      if (s?.step !== "clocks" || s.sessionId !== sessionId) continue;
      for (const c of s.clocks ?? []) names.add(String(c?.name ?? "a clock"));
    }
  }
  return [...names];
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
