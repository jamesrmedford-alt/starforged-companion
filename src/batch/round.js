/**
 * STARFORGED COMPANION
 * src/batch/round.js — a Batch Mode round as data (issue #340)
 *
 * Pure: no Foundry globals, no I/O. The round is the world setting
 * `batchMode.round`; its one writer is the canonical GM's driver
 * (src/batch/driver.js), which applies these transitions to the latest stored
 * value through one write chain (queueRoundWrite). Every transition returns a
 * NEW round — the stored value is never changed in place (rules/foundry-api.md:
 * a refused write must leave the cached setting as the world has it) — or
 * throws a RoundRefusal naming why, which the relay tells the requester.
 *
 * Lifecycle (issue #340 "Round lifecycle"):
 *
 *   collecting ──(every connected participant ready or passed; Send now)──► rolling
 *   collecting ──(End a Session, Discard, the mode off)──────────────────► closed
 *   rolling ──(every acting entry rolled and recorded)──► upgrading, or narrating when nothing offers an upgrade
 *   upgrading ──(each offered roller chose; Send now = Keep; the roller left = Keep)──► narrating
 *   narrating ──(the round card, its fallback or the X-Card's paused notice posted)──► closed
 *
 * An entry goes waiting → submitted → read → ready, or passed. One that is not
 * ready when the round resolves is left out of it, with no mark — opting out
 * is silent (decided 2026-11-06). During resolution an acting entry goes
 * rolled → recorded, or refused when the roll stage refuses it (its track
 * ended earlier in the same round); a narrative entry is recorded as it is.
 */

export const ROUND_PHASE = Object.freeze({
  COLLECTING: "collecting",
  ROLLING:    "rolling",
  UPGRADING:  "upgrading",
  NARRATING:  "narrating",
  CLOSED:     "closed",
});

export const ENTRY_STATUS = Object.freeze({
  WAITING:   "waiting",
  SUBMITTED: "submitted",
  READ:      "read",
  READY:     "ready",
  PASSED:    "passed",
  ROLLED:    "rolled",
  RECORDED:  "recorded",
  REFUSED:   "refused",
});

/** What a reading found: a move to roll, or a line narrated without a roll. */
export const READING_KIND = Object.freeze({
  MOVE:      "move",
  NARRATIVE: "narrative",
});

/** The longest action a player may submit — a chat line's worth. */
export const ROUND_TEXT_MAX = 2000;

/** At most this many abilities a confirm may name (a card offers far fewer). */
const MAX_CHOSEN_ABILITIES = 24;

const RESOLVING = new Set([ROUND_PHASE.ROLLING, ROUND_PHASE.UPGRADING, ROUND_PHASE.NARRATING]);
const SETTLED_ENTRY = new Set([ENTRY_STATUS.RECORDED, ENTRY_STATUS.REFUSED]);
// An entry holding an action of its own — written, or a card's move — not yet rolled.
const OWN_ACTION = new Set([ENTRY_STATUS.SUBMITTED, ENTRY_STATUS.READ, ENTRY_STATUS.READY]);

/** A transition refused — `reason` is a stable code, `message` what the requester is told. */
export class RoundRefusal extends Error {
  constructor(reason, message) {
    super(message ?? reason);
    this.name = "RoundRefusal";
    this.reason = reason;
  }
}

const refuse = (reason, message) => { throw new RoundRefusal(reason, message); };

// ─────────────────────────────────────────────────────────────────────────────
// Reading the round
// ─────────────────────────────────────────────────────────────────────────────

/** True for a round that has not closed. */
export function roundIsOpen(round) {
  return !!round && typeof round === "object" && round.phase !== ROUND_PHASE.CLOSED && !!round.phase;
}

/** True while the round is being resolved (rolling, upgrading or narrating). */
export function isResolving(round) {
  return !!round && RESOLVING.has(round.phase);
}

/** The round's entry for a user, or null. */
export function entryFor(round, userId) {
  return (userId && round?.entries?.[userId]) || null;
}

/**
 * True for an entry that is a move a card owes — the resist roll at 0 a
 * suffer card posts (`owedMove`, issue #330 D3): the roller's next move, not
 * optional — it can't be withdrawn, passed, edited or set aside for the
 * player's own action (issue #342 D2).
 *
 * @param {Object|null} entry
 * @returns {boolean}
 */
export function isOwedEntry(entry) {
  return entry?.readAs?.forced?.owed === true;
}

const OWED_MESSAGE = "This roll is owed — resisting is your next move, so it can't be withdrawn, passed or changed.";

/**
 * The round as stored, or null when the setting holds nothing usable — a
 * malformed value is treated as no round, never thrown on.
 *
 * @param {*} value — game.settings.get(…, "batchMode.round")
 * @returns {Object|null}
 */
export function storedRound(value) {
  if (!value || typeof value !== "object") return null;
  if (typeof value.id !== "string" || !value.id) return null;
  if (!Object.values(ROUND_PHASE).includes(value.phase)) return null;
  if (!value.entries || typeof value.entries !== "object") return null;
  return value;
}

// ─────────────────────────────────────────────────────────────────────────────
// Participants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Who takes part in a round: every connected user with a PC of their own. A
 * player acts as their assigned PC (User Configuration → Character), else the
 * first PC they own. A GM takes part only with an assigned PC: a GM owns
 * every actor, so the ownership fallback would hand them another player's.
 * A player who runs two PCs acts as their assigned one. NPC cards and the ship
 * are not PCs — the caller passes player characters only.
 *
 * @param {Object} args
 * @param {Array<{ id: string, name?: string, isGM?: boolean, active?: boolean, characterId?: string|null }>} args.users
 * @param {Array<{ id: string, name?: string, ownerIds?: string[] }>} args.pcs — player characters only
 * @returns {Array<{ userId: string, userName: string, isGM: boolean, actorId: string, actorName: string }>}
 */
export function participantsFrom({ users = [], pcs = [] } = {}) {
  const byId = new Map(pcs.filter(pc => pc?.id).map(pc => [pc.id, pc]));
  const out = [];
  for (const user of users) {
    if (!user?.id || user.active === false) continue;
    const assigned = user.characterId ? byId.get(user.characterId) ?? null : null;
    const pc = assigned
      ?? (user.isGM ? null : pcs.find(p => Array.isArray(p?.ownerIds) && p.ownerIds.includes(user.id)) ?? null);
    if (!pc) continue;
    out.push({
      userId:    user.id,
      userName:  String(user.name ?? ""),
      isGM:      !!user.isGM,
      actorId:   pc.id,
      actorName: String(pc.name ?? ""),
    });
  }
  return out;
}

function newEntry(participant) {
  return {
    userId:       participant.userId,
    actorId:      participant.actorId,
    actorName:    participant.actorName ?? "",
    userName:     participant.userName ?? "",
    status:       ENTRY_STATUS.WAITING,
    text:         null,
    submissionId: null,
    submittedAt:  null,
    readyAt:      null,
    readAs:       null,
    reading:      null,
    choices:      null,
    offer:        null,
    setAside:     null,
    rolled:       null,
    upgrade:      null,
    error:        null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Opening and closing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The number the next round of a session takes: one past the last round's in
 * the same session, else 1.
 *
 * @param {Object|null} previous — the stored round, open or closed
 * @param {string|null} sessionId
 * @returns {number}
 */
export function nextRoundNumber(previous, sessionId) {
  const prev = storedRound(previous);
  if (!prev || !sessionId || prev.sessionId !== sessionId) return 1;
  return (Number(prev.number) || 0) + 1;
}

/**
 * A new round, collecting, with an entry waiting for each participant.
 *
 * @param {{ id: string, number: number, sessionId: string|null, sceneId?: string|null,
 *   now: string, participants: Array<Object> }} args
 * @returns {Object}
 */
export function createRound({ id, number, sessionId, sceneId = null, now, participants = [] }) {
  const entries = {};
  for (const p of participants) if (p?.userId) entries[p.userId] = newEntry(p);
  return {
    id,
    number,
    sessionId: sessionId ?? null,
    sceneId,
    phase:         ROUND_PHASE.COLLECTING,
    openedAt:      now,
    resolverId:    null,
    resolverClaim: null,
    sendNow:       false,
    modeOffAfter:  false,
    order:         [],
    acting:        null,
    entries,
    closedAt:      null,
    closeReason:   null,
  };
}

/**
 * Add a participant who joined mid-round (a no-op when they have an entry, or
 * once the round is no longer collecting).
 *
 * @param {Object} round
 * @param {Object} participant — participantsFrom's shape
 * @returns {Object} the round, or a new one with their entry
 */
export function addParticipant(round, participant) {
  if (!roundIsOpen(round) || round.phase !== ROUND_PHASE.COLLECTING || !participant?.userId) return round;
  if (round.entries[participant.userId]) return round;
  return { ...round, entries: { ...round.entries, [participant.userId]: newEntry(participant) } };
}

/**
 * Close the round. Idempotent on a closed round.
 *
 * @param {Object} round
 * @param {{ reason: string, now: string }} args
 * @returns {Object}
 */
export function closeRound(round, { reason, now }) {
  if (!round || round.phase === ROUND_PHASE.CLOSED) return round;
  return { ...round, phase: ROUND_PHASE.CLOSED, closedAt: now, closeReason: reason ?? null };
}

/**
 * Ask that Batch Mode turns off once this round has finished resolving.
 *
 * @param {Object} round
 * @returns {Object}
 */
export function markModeOffAfter(round) {
  if (!roundIsOpen(round) || round.modeOffAfter) return round;
  return { ...round, modeOffAfter: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Collecting — the players' entries
// ─────────────────────────────────────────────────────────────────────────────

function requireCollecting(round) {
  if (!roundIsOpen(round)) refuse("no-round", "There is no round open.");
  if (round.phase !== ROUND_PHASE.COLLECTING) {
    refuse("resolving", "This round is already being resolved — your action is kept, for the next round.");
  }
}

function requireEntry(round, userId) {
  const entry = entryFor(round, userId);
  if (!entry) refuse("not-participant", "You have no character in this round.");
  return entry;
}

function withEntry(round, userId, changes, { order } = {}) {
  const entries = { ...round.entries, [userId]: { ...round.entries[userId], ...changes } };
  return { ...round, entries, ...(order ? { order } : {}) };
}

const withoutUser = (order, userId) => (Array.isArray(order) ? order : []).filter(id => id !== userId);

/**
 * The text a player submitted, bounded like a chat line: trimmed, not empty,
 * at most ROUND_TEXT_MAX characters. Null when there is nothing to submit.
 *
 * @param {*} text
 * @returns {string|null}
 */
export function cleanSubmissionText(text) {
  if (typeof text !== "string") return null;
  const t = text.replace(/\r\n?/g, "\n").trim();
  if (!t || t.length > ROUND_TEXT_MAX) return null;
  return t;
}

/**
 * A player submits (or rewrites) their action. It is read again: a changed
 * entry leaves the confirm order and goes to its end when confirmed again.
 *
 * @param {Object} round
 * @param {{ userId: string, text: string, submissionId: string, now: string,
 *   readAs?: { move?: boolean, moveId?: string|null, forced?: Object|null }|null }} args
 * @returns {Object}
 */
export function submitEntry(round, { userId, text, submissionId, now, readAs = null }) {
  requireCollecting(round);
  const entry = requireEntry(round, userId);
  const clean = cleanSubmissionText(text);
  if (!clean) refuse("bad-text", `An action must be 1–${ROUND_TEXT_MAX} characters.`);
  if (!submissionId) refuse("bad-submission", "That submission carried no id.");
  if (entry.submissionId === submissionId) return round;   // a repeat of the same submission
  if (isOwedEntry(entry)) refuse("owed", OWED_MESSAGE);
  return withEntry(round, userId, {
    status: ENTRY_STATUS.SUBMITTED, text: clean, submissionId, submittedAt: now,
    readyAt: null, reading: null, choices: null, error: null, readAs: readAs ?? null,
  }, { order: withoutUser(round.order, userId) });
}

/**
 * A player withdraws their action: back to waiting. A card's move offered
 * beside it stays offered — withdrawing (or Edit) is not choosing to drop it.
 *
 * @param {Object} round
 * @param {{ userId: string }} args
 * @returns {Object}
 */
export function withdrawEntry(round, { userId }) {
  requireCollecting(round);
  const entry = requireEntry(round, userId);
  if (entry.status === ENTRY_STATUS.WAITING) return round;
  if (isOwedEntry(entry)) refuse("owed", OWED_MESSAGE);
  return withEntry(round, userId, {
    status: ENTRY_STATUS.WAITING, submissionId: null, submittedAt: null, readyAt: null,
    reading: null, choices: null, error: null, readAs: null,
  }, { order: withoutUser(round.order, userId) });
}

/**
 * A player passes this round. Silent: nothing names them anywhere. A card's
 * move offered beside their action stays offered (it joins the next round
 * when the round resolves without it — takeCardMoves).
 *
 * @param {Object} round
 * @param {{ userId: string }} args
 * @returns {Object}
 */
export function passEntry(round, { userId }) {
  requireCollecting(round);
  const entry = requireEntry(round, userId);
  if (entry.status === ENTRY_STATUS.PASSED) return round;
  if (isOwedEntry(entry)) refuse("owed", OWED_MESSAGE);
  return withEntry(round, userId, {
    status: ENTRY_STATUS.PASSED, submissionId: null, readyAt: null, reading: null,
    choices: null, error: null, readAs: null,
  }, { order: withoutUser(round.order, userId) });
}

/**
 * A reading lands — only while its submission is still the entry's (a newer
 * submission supersedes a reading in flight). Readings land while collecting,
 * and while the round waits for them after Send now (rolling, before the
 * acting entries are fixed).
 *
 * @param {Object} round
 * @param {{ userId: string, submissionId: string, reading: Object }} args
 * @returns {Object} the round unchanged when the reading is stale
 */
export function recordReading(round, { userId, submissionId, reading }) {
  if (!readingMayLand(round, userId, submissionId)) return round;
  return withEntry(round, userId, { status: ENTRY_STATUS.READ, reading, error: null });
}

/**
 * A reading failed: the entry stays submitted, with the error the window
 * shows ("couldn't read your action — try again"). It is not waited for.
 *
 * @param {Object} round
 * @param {{ userId: string, submissionId: string, error: string }} args
 * @returns {Object}
 */
export function readingFailed(round, { userId, submissionId, error }) {
  if (!readingMayLand(round, userId, submissionId)) return round;
  return withEntry(round, userId, { error: String(error || "unread") });
}

function readingMayLand(round, userId, submissionId) {
  if (!roundIsOpen(round)) return false;
  if (round.phase !== ROUND_PHASE.COLLECTING && !(round.phase === ROUND_PHASE.ROLLING && !round.acting)) return false;
  const entry = entryFor(round, userId);
  return !!entry && entry.status === ENTRY_STATUS.SUBMITTED && entry.submissionId === submissionId;
}

/**
 * A player confirms their reading: Ready, with the choices the window made —
 * checked against the reading (validateChoices). The entry joins the end of
 * the confirm order: entries roll, and are narrated, in that order. It is
 * also "Keep mine" beside a card's offered move: the offer is dropped — on a
 * Ready entry that is all it does.
 *
 * @param {Object} round
 * @param {{ userId: string, submissionId: string, choices: Object, now: string }} args
 * @returns {Object}
 */
export function confirmEntry(round, { userId, submissionId, choices, now }) {
  requireCollecting(round);
  const entry = requireEntry(round, userId);
  if (entry.submissionId !== submissionId) refuse("stale", "That reading is out of date — your action was changed since.");
  // An owed roll is no choice against an offer: confirming it drops nothing —
  // a card's move offered beside it waits for the next round.
  const owed = isOwedEntry(entry);
  if (entry.status === ENTRY_STATUS.READY) return entry.offer && !owed ? withEntry(round, userId, { offer: null }) : round;
  if (entry.status !== ENTRY_STATUS.READ || !entry.reading) refuse("unread", "Your action hasn't been read yet.");
  const checked = validateChoices(entry.reading, choices);
  return withEntry(round, userId, {
    status: ENTRY_STATUS.READY, choices: checked, readyAt: now, offer: owed ? (entry.offer ?? null) : null,
  }, { order: [...withoutUser(round.order, userId), userId] });
}

/**
 * "Roll a move instead" / "Roll ⟨move⟩" — read the action again as a move
 * (the classifier's suggestion when one is named), as `!roll` does a typed
 * line. Or take the card button's move offered beside the player's own
 * (`useOffer`). Either way a new submission, read again.
 *
 * @param {Object} round
 * @param {{ userId: string, submissionId: string, newSubmissionId: string, now: string,
 *   moveId?: string|null, useOffer?: boolean }} args
 * @returns {Object}
 */
export function rereadEntry(round, { userId, submissionId, newSubmissionId, now, moveId = null, useOffer = false }) {
  requireCollecting(round);
  const entry = requireEntry(round, userId);
  if (entry.submissionId !== submissionId) refuse("stale", "That reading is out of date — your action was changed since.");
  if (isOwedEntry(entry)) refuse("owed", OWED_MESSAGE);
  if (useOffer) {
    if (!entry.offer) refuse("no-offer", "There is no card move to use.");
    return withEntry(round, userId, {
      status: ENTRY_STATUS.SUBMITTED, text: entry.offer.text, submissionId: newSubmissionId, submittedAt: now,
      readyAt: null, reading: null, choices: null, error: null, offer: null,
      readAs: { move: true, forced: entry.offer.forced ?? null, messageId: entry.offer.messageId ?? null },
    }, { order: withoutUser(round.order, userId) });
  }
  if (entry.status !== ENTRY_STATUS.READ || entry.reading?.kind !== READING_KIND.NARRATIVE) {
    refuse("not-narrative", "Only a reading with no roll can be rolled as a move instead.");
  }
  const offered = entry.reading?.suggestedMove ?? null;
  if (moveId && moveId !== offered) refuse("bad-move", "That move wasn't offered.");
  // "Roll ⟨move⟩" rolls the suggestion as the paced card's Roll does: a
  // scene-challenge move names the challenge the classifier named, by id
  // (PACED-VARIANT-NO-TARGET; issue #342 Z38) — with two open, unnamed, it
  // marked neither.
  const target = entry.reading?.suggestedTargetId;
  const moveTargetId = moveId && typeof target === "string" && target ? target : null;
  return withEntry(round, userId, {
    status: ENTRY_STATUS.SUBMITTED, submissionId: newSubmissionId, submittedAt: now,
    readyAt: null, reading: null, choices: null, error: null,
    readAs: { move: true, moveId: moveId ?? null, ...(moveTargetId ? { moveTargetId } : {}) },
  }, { order: withoutUser(round.order, userId) });
}

/**
 * A card button's move for a participant's character (a paced card's Roll,
 * Attempt to Finish the Fight, a Which-fight pick, Swear it, a token-drag Set
 * a Course …). It becomes the entry, waiting for the player's confirm — or,
 * when they have already submitted their own action, an offer beside it, and
 * the window asks which to keep. Its chat message's id rides along
 * (`messageId`): a card move the round does not take is held for the next
 * round by it (takeCardMoves) — its card is claimed, so it is never dropped.
 *
 * A move the card owes (`forced.owed` — the resist roll at 0, issue #330 D3)
 * is the roller's next move, not an option (issue #342 D2): it becomes the
 * entry even beside an action already written, which is set aside for the
 * next round (`setAside` — its author's window keeps it as the draft; a card
 * move that was the entry is handed back in `held`, to be held). A second
 * owed move while one is the entry is held for the next round itself.
 *
 * @param {Object} round
 * @param {{ userId: string, text: string, forced: Object, submissionId: string, now: string,
 *   messageId?: string|null }} args
 * @returns {{ round: Object, read: boolean, held: Array<{ userId: string, messageId: string }> }}
 *   `read`: the forced move is the entry now, to be read; `held`: card moves for the driver to hold
 */
export function offerForcedMove(round, { userId, text, forced, submissionId, now, messageId = null }) {
  requireCollecting(round);
  const entry = requireEntry(round, userId);
  const clean = cleanSubmissionText(text) ?? cleanSubmissionText(forced?.moveName ?? forced?.moveId ?? "") ?? "—";
  const own = OWN_ACTION.has(entry.status);
  const owed = forced?.owed === true;
  if (owed && isOwedEntry(entry) && own) {
    return { round, read: false, held: messageId ? [{ userId, messageId }] : [] };
  }
  if (own && !owed) {
    return { round: withEntry(round, userId, { offer: { text: clean, forced, messageId, at: now } }), read: false, held: [] };
  }
  // The entry now: a written action it displaces is set aside for the next
  // round; a card move it displaces is held for it.
  const displacedCard = own && entry.readAs?.messageId ? entry.readAs.messageId : null;
  const setAside = own && !displacedCard && entry.text ? { text: entry.text, at: now } : null;
  return {
    round: withEntry(round, userId, {
      status: ENTRY_STATUS.SUBMITTED, text: clean, submissionId, submittedAt: now,
      readyAt: null, reading: null, choices: null, error: null,
      // An offer still undecided stays beside the new entry (it joins the next round).
      offer: entry.offer ?? null,
      readAs: { move: true, forced, messageId },
      ...(setAside ? { setAside } : {}),
    }, { order: withoutUser(round.order, userId) }),
    read: true,
    held: displacedCard ? [{ userId, messageId: displacedCard }] : [],
  };
}

/**
 * The card buttons' moves a round leaves behind as it stops collecting: every
 * offer still undecided — the round resolved, or closed, before its player
 * chose — and every card move that was an entry the round does not roll (not
 * in `acting`: its player left before confirming, its reading failed; or
 * every one when the round closes unresolved). Their cards are claimed, so
 * each is handed back by its chat message's id for the driver to hold for
 * the next round (a card's forced move is held, not dropped — issue #337
 * Y08). The offers come off the entries; an entry keeps its own move's id.
 *
 * @param {Object} round
 * @param {{ acting?: string[] }} [opts] — the entries the round rolls (none for a round closed unresolved)
 * @returns {{ round: Object, held: Array<{ userId: string, messageId: string }> }}
 */
export function takeCardMoves(round, { acting = [] } = {}) {
  const held = [];
  let entries = null;
  for (const e of Object.values(round?.entries ?? {})) {
    if (e.offer?.messageId) held.push({ userId: e.userId, messageId: e.offer.messageId });
    if (OWN_ACTION.has(e.status) && e.readAs?.messageId && !acting.includes(e.userId)) {
      held.push({ userId: e.userId, messageId: e.readAs.messageId });
    }
    if (e.offer) (entries ??= { ...round.entries })[e.userId] = { ...e, offer: null };
  }
  return { round: entries ? { ...round, entries } : round, held };
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation — a forged request can do only what the window could
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The confirm's choices, checked against the reading: only abilities it
 * offered, a stat substitution one of the chosen abilities offers (a stat no
 * ability offered is refused; one whose ability is unchecked is dropped, as
 * the confirm dialog drops it), and a target among the reading's choices — a
 * pick required when there are choices, none allowed when there are not. A
 * reading the roll could not use (a vow already fulfilled) cannot be confirmed.
 *
 * @param {Object} reading
 * @param {*} choices — { abilityIds?, statReplacement?, targetId? }
 * @returns {{ abilityIds: string[], statReplacement: string|null, targetId: string|null }}
 */
export function validateChoices(reading, choices) {
  const c = choices && typeof choices === "object" ? choices : {};
  if (reading?.blocked) refuse("blocked", "This action can't be rolled as read — edit it, or pass.");
  if (reading?.kind !== READING_KIND.MOVE) {
    return { abilityIds: [], statReplacement: null, targetId: null };
  }
  const offered = new Map((Array.isArray(reading.abilities) ? reading.abilities : []).map(a => [a.key, a]));
  const raw = Array.isArray(c.abilityIds) ? c.abilityIds : [];
  if (raw.length > MAX_CHOSEN_ABILITIES) refuse("bad-abilities", "Too many abilities.");
  const abilityIds = [...new Set(raw.filter(k => typeof k === "string"))];
  for (const k of abilityIds) if (!offered.has(k)) refuse("bad-ability", "That ability wasn't offered.");

  let statReplacement = typeof c.statReplacement === "string" && c.statReplacement.trim() ? c.statReplacement.trim() : null;
  if (statReplacement) {
    const statOptions = Array.isArray(reading.statOptions) ? reading.statOptions : [];
    if (!statOptions.includes(statReplacement)) refuse("bad-stat", "That stat wasn't offered.");
    if (!abilityIds.some(k => offered.get(k)?.statReplacement === statReplacement)) statReplacement = null;
  }

  const options = Array.isArray(reading.targetChoices?.options) ? reading.targetChoices.options : [];
  const targetId = typeof c.targetId === "string" && c.targetId ? c.targetId : null;
  if (options.length) {
    if (!targetId) refuse("no-target", reading.targetChoices?.prompt ?? "Choose which one first.");
    if (!options.some(o => o.id === targetId)) refuse("bad-target", "That choice wasn't offered.");
  } else if (targetId) {
    refuse("bad-target", "That choice wasn't offered.");
  }
  return { abilityIds, statReplacement, targetId };
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The round resolves by itself once every CONNECTED participant is ready or
 * has passed — it doesn't wait for one who disconnected. With nobody
 * connected it waits (a round with no one at the table must not close and
 * reopen forever).
 *
 * @param {Object} round
 * @param {{ connectedUserIds: Iterable<string> }} args
 * @returns {boolean}
 */
export function readyToResolve(round, { connectedUserIds }) {
  if (!roundIsOpen(round) || round.phase !== ROUND_PHASE.COLLECTING) return false;
  const connected = new Set(connectedUserIds ?? []);
  const present = Object.values(round.entries).filter(e => connected.has(e.userId));
  if (!present.length) return false;
  return present.every(e => e.status === ENTRY_STATUS.READY || e.status === ENTRY_STATUS.PASSED);
}

/**
 * The entries still being read (submitted, no error) — Send now waits for them.
 *
 * @param {Object} round
 * @returns {string[]} user ids
 */
export function readingsInFlight(round) {
  return Object.values(round?.entries ?? {})
    .filter(e => e.status === ENTRY_STATUS.SUBMITTED && !e.error)
    .map(e => e.userId);
}

/**
 * Collecting → rolling. The resolver's claim names the GM resolving it, so
 * another client's recovery leaves it alone while that GM is connected.
 *
 * @param {Object} round
 * @param {{ resolverId: string, resolverClaim: string, now: string, sendNow?: boolean }} args
 * @returns {Object}
 */
export function beginResolution(round, { resolverId, resolverClaim, now, sendNow = false }) {
  if (!roundIsOpen(round)) refuse("no-round", "There is no round open.");
  if (round.phase !== ROUND_PHASE.COLLECTING) refuse("resolving", "This round is already being resolved.");
  return {
    ...round, phase: ROUND_PHASE.ROLLING, resolverId, resolverClaim,
    resolvingAt: now, sendNow: !!sendNow || !!round.sendNow, acting: null,
  };
}

/**
 * The entries that act, in order: the ready ones in the order they were last
 * confirmed, then — when a GM sent the round now — readings not yet confirmed,
 * used as read, in the order they were submitted. Anyone else is simply not
 * in the round.
 *
 * @param {Object} round
 * @returns {string[]} user ids
 */
export function actingOrder(round) {
  const entries = round?.entries ?? {};
  const ready = (round?.order ?? []).filter(id => entries[id]?.status === ENTRY_STATUS.READY);
  if (!round?.sendNow) return ready;
  const read = Object.values(entries)
    .filter(e => e.status === ENTRY_STATUS.READ && e.reading)
    .sort((a, b) => String(a.submittedAt ?? "").localeCompare(String(b.submittedAt ?? "")))
    .map(e => e.userId);
  return [...ready, ...read.filter(id => !ready.includes(id))];
}

/**
 * Fix who acts (actingOrder), once the readings Send now waited for are in.
 *
 * @param {Object} round
 * @returns {Object}
 */
export function fixActing(round) {
  if (round?.phase !== ROUND_PHASE.ROLLING || Array.isArray(round.acting)) return round;
  return { ...round, acting: actingOrder(round) };
}

function requireActing(round, userId) {
  if (!Array.isArray(round?.acting) || !round.acting.includes(userId)) refuse("not-acting", "That entry is not in this round.");
  return round.entries[userId];
}

/**
 * An acting entry's move was rolled: its result card is up (the record follows).
 *
 * @param {Object} round
 * @param {{ userId: string, rolled: Object }} args — { resolutionId, cardId, outcome, isMatch, moveId, narrationInput }
 * @returns {Object}
 */
export function markRolled(round, { userId, rolled }) {
  requireActing(round, userId);
  return withEntry(round, userId, { status: ENTRY_STATUS.ROLLED, rolled: { ...(round.entries[userId].rolled ?? {}), ...rolled } });
}

/**
 * An acting entry is recorded — a rolled move once persistResolution has run,
 * or a narrative entry, which has nothing to roll.
 *
 * @param {Object} round
 * @param {{ userId: string, recordedAt: string, narrationInput?: Object }} args
 * @returns {Object}
 */
export function markRecorded(round, { userId, recordedAt, narrationInput = undefined }) {
  const entry = requireActing(round, userId);
  const rolled = { ...(entry.rolled ?? {}), recordedAt, ...(narrationInput !== undefined ? { narrationInput } : {}) };
  return withEntry(round, userId, { status: ENTRY_STATUS.RECORDED, rolled });
}

/**
 * An acting entry the roll stage refused (its track ended earlier in the
 * round, or it named nothing it could roll): it is narrated as an action with
 * no roll, and its result card says why.
 *
 * @param {Object} round
 * @param {{ userId: string, reason: string, narrationInput: Object, recordedAt: string }} args
 * @returns {Object}
 */
export function markRefused(round, { userId, reason, narrationInput, recordedAt }) {
  requireActing(round, userId);
  return withEntry(round, userId, {
    status: ENTRY_STATUS.REFUSED,
    rolled: { refused: reason, narrationInput, recordedAt },
  });
}

/** True once every acting entry is recorded or refused. */
export function allSettled(round) {
  return Array.isArray(round?.acting) && round.acting.every(id => SETTLED_ENTRY.has(round.entries[id]?.status));
}

/**
 * Rolling → upgrading, for the rollers whose result card offers Burn Momentum
 * or Improve Result (`offers`), or straight to narrating when none does.
 *
 * @param {Object} round
 * @param {{ offers: Object<string, { burn: Object|null, improve: Object|null, cardId: string }> }} args
 * @returns {Object}
 */
export function beginUpgrades(round, { offers = {} }) {
  if (round?.phase !== ROUND_PHASE.ROLLING) return round;
  const ids = Object.keys(offers).filter(id => round.acting?.includes(id) && !round.entries[id]?.upgrade?.decided);
  if (!ids.length) return { ...round, phase: ROUND_PHASE.NARRATING };
  const entries = { ...round.entries };
  for (const id of ids) entries[id] = { ...entries[id], upgrade: { ...offers[id], decided: null } };
  return { ...round, phase: ROUND_PHASE.UPGRADING, entries };
}

/**
 * A roller decided: "burn" or "improve" (the upgraded outcome's narration
 * input replaces the original's), or "keep". While the round is still rolling
 * a recorded entry's card is already live, so a burn or an improvement can
 * land then too: it is recorded as decided, and the upgrade step skips it.
 *
 * @param {Object} round
 * @param {{ userId: string, decision: "burn"|"improve"|"keep", narrationInput?: Object, now: string }} args
 * @returns {Object}
 */
export function decideUpgrade(round, { userId, decision, narrationInput = null, now }) {
  const early = round?.phase === ROUND_PHASE.ROLLING && decision !== "keep";
  if (round?.phase !== ROUND_PHASE.UPGRADING && !early) refuse("not-upgrading", "The round isn't waiting for an upgrade.");
  const entry = entryFor(round, userId);
  if (!entry?.upgrade && !early) refuse("no-upgrade", "That entry was offered no upgrade.");
  if (entry?.upgrade?.decided) return round;
  if (early && !Array.isArray(round.acting)) refuse("not-acting", "That entry is not in this round.");
  if (!["burn", "improve", "keep"].includes(decision)) refuse("bad-decision", "Burn, Improve or Keep.");
  const rolled = narrationInput ? { ...(entry.rolled ?? {}), narrationInput, upgradedBy: decision } : entry.rolled;
  return withEntry(round, userId, { upgrade: { ...(entry.upgrade ?? {}), decided: decision, decidedAt: now }, rolled });
}

/**
 * Every undecided upgrade kept — Send now during the upgrade step, or for
 * rollers who left (`userIds`).
 *
 * @param {Object} round
 * @param {{ now: string, userIds?: string[]|null }} args
 * @returns {Object}
 */
export function keepUndecidedUpgrades(round, { now, userIds = null }) {
  if (round?.phase !== ROUND_PHASE.UPGRADING) return round;
  let next = round;
  for (const e of Object.values(round.entries)) {
    if (!e.upgrade || e.upgrade.decided) continue;
    if (userIds && !userIds.includes(e.userId)) continue;
    next = decideUpgrade(next, { userId: e.userId, decision: "keep", now });
  }
  return next;
}

/** True once every offered roller has decided. */
export function upgradesSettled(round) {
  return Object.values(round?.entries ?? {}).every(e => !e.upgrade || !!e.upgrade.decided);
}

/** The user ids whose upgrade the round still waits for. */
export function undecidedUpgrades(round) {
  return Object.values(round?.entries ?? {}).filter(e => e.upgrade && !e.upgrade.decided).map(e => e.userId);
}

/**
 * Upgrading → narrating (or rolling → narrating when nothing offered one).
 *
 * @param {Object} round
 * @returns {Object}
 */
export function beginNarration(round) {
  if (round?.phase === ROUND_PHASE.NARRATING) return round;
  if (round?.phase === ROUND_PHASE.UPGRADING && !upgradesSettled(round)) refuse("upgrading", "Waiting for an upgrade decision.");
  if (round?.phase !== ROUND_PHASE.UPGRADING && round?.phase !== ROUND_PHASE.ROLLING) refuse("not-resolving", "The round isn't being resolved.");
  return { ...round, phase: ROUND_PHASE.NARRATING };
}

/**
 * Stamp the narration's claim: a round narrates once, even when a recovery
 * re-enters the narrating phase. A recovery takes over (`takeOver`) a claim
 * whose GM went away before the round card posted.
 *
 * @param {Object} round
 * @param {{ narrationClaim: string, now: string, takeOver?: boolean }} args
 * @returns {Object}
 */
export function claimNarration(round, { narrationClaim, now, takeOver = false }) {
  if (round?.phase !== ROUND_PHASE.NARRATING) refuse("not-narrating", "The round isn't being narrated.");
  if (round.narrationClaim && !takeOver) refuse("narrated", "The round is already being narrated.");
  return { ...round, narrationClaim, narrationAt: now };
}

// ─────────────────────────────────────────────────────────────────────────────
// Recovery (rules/reachability.md §7)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What a recovery finds in a round left resolving: entries recorded (never
 * rolled again), entries whose result card is up but whose record is not
 * (reported to the GMs as possibly incomplete — not rolled again), and
 * entries still to roll.
 *
 * @param {Object} round
 * @returns {{ recorded: string[], unrecorded: string[], toRoll: string[] }}
 */
export function recoveryPlan(round) {
  const out = { recorded: [], unrecorded: [], toRoll: [] };
  for (const id of round?.acting ?? []) {
    const e = round.entries[id];
    if (!e) continue;
    if (SETTLED_ENTRY.has(e.status)) out.recorded.push(id);
    else if (e.status === ENTRY_STATUS.ROLLED || e.rolled?.cardId) out.unrecorded.push(id);
    else out.toRoll.push(id);
  }
  return out;
}
