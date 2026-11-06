/**
 * STARFORGED COMPANION
 * src/batch/roundView.js — what each viewer's Round window shows (issue #340)
 *
 * Pure: the round (src/batch/round.js) and the table's state in, a view model
 * out. The window (src/ui/roundWindow.js) renders it and nothing else, so
 * every rule about who sees what lives here, where a test can pin it:
 *
 *   - A player's own entry is theirs to edit until the round resolves. It shows
 *     Reading · To confirm · Ready · Passed · Rolled · Deciding upgrade.
 *   - Other players' entries appear once they are Ready, with their text. An
 *     unsubmitted draft never leaves its browser, and nothing appears for a
 *     player who passed or hasn't acted — opting out is silent.
 *   - A GM also sees every entry's reading, who the round still waits for, and
 *     Send now and, while collecting, Discard round. Send now is disabled while
 *     the X-Card is in play, with the reason.
 *   - With no session, no keyed GM, or no GM at all, the window says why.
 */

import { ROUND_PHASE, ENTRY_STATUS, READING_KIND, roundIsOpen, isResolving, entryFor, undecidedUpgrades } from "./round.js";

/** The labels an entry's status shows its own player. */
const OWN_STATUS_LABELS = Object.freeze({
  [ENTRY_STATUS.WAITING]:   null,
  [ENTRY_STATUS.SUBMITTED]: "Reading…",
  [ENTRY_STATUS.READ]:      "To confirm",
  [ENTRY_STATUS.READY]:     "Ready",
  [ENTRY_STATUS.PASSED]:    "Passed",
  [ENTRY_STATUS.ROLLED]:    "Rolled",
  [ENTRY_STATUS.RECORDED]:  "Rolled",
  [ENTRY_STATUS.REFUSED]:   "Not rolled",
});

/** Why a round can't go on, said in every window. */
export const ROUND_NOTICES = Object.freeze({
  noSession:   "No session has begun — the round opens once Begin a Session starts one.",
  noGm:        "No GM is connected — your action is kept here, and is sent once a GM joins.",
  noKeyedGm:   "No GM with a Claude key is connected, so the round can't be read. Your action is kept; it is read once one joins.",
  xCard:       "The X-Card is in play — the round can't be resolved until a GM resumes.",
  resolving:   "The round is being resolved…",
  readFailed:  "Couldn't read your action — try again.",
  notReceived: "Your action wasn't received. Send it again.",
});

const humanise = (slug) => String(slug ?? "")
  .split("_").filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(" ");

/**
 * The window's view of a round for one viewer.
 *
 * @param {Object|null} round — the stored round (round.js)
 * @param {{ userId: string, isGM: boolean }} viewer
 * @param {Object} ctx
 * @param {boolean} ctx.enabled — Batch Mode is on
 * @param {boolean} ctx.sessionActive
 * @param {boolean} [ctx.xCardActive]
 * @param {boolean} [ctx.gmConnected]
 * @param {boolean} [ctx.keyedGm] — a GM with a Claude key is connected (the readings run there)
 * @param {Iterable<string>} [ctx.connectedUserIds]
 * @param {(moveId: string) => string} [ctx.moveLabel]
 * @param {(stat: string) => string} [ctx.statLabel]
 * @param {boolean} [ctx.notReceived] — this client's last submission never showed in the round
 * @returns {Object} the view model
 */
export function buildRoundView(round, viewer, ctx = {}) {
  const moveLabel = typeof ctx.moveLabel === "function" ? ctx.moveLabel : humanise;
  const statLabel = typeof ctx.statLabel === "function" ? ctx.statLabel : humanise;
  const connected = new Set(ctx.connectedUserIds ?? []);
  const isGM = !!viewer?.isGM;

  if (!ctx.enabled) return { mode: "off", banners: [], own: null, table: [], gm: null, progress: [] };

  const banners = [];
  if (!ctx.sessionActive) banners.push({ level: "info", text: ROUND_NOTICES.noSession });
  else if (ctx.gmConnected === false) banners.push({ level: "warn", text: ROUND_NOTICES.noGm });
  else if (ctx.keyedGm === false) banners.push({ level: "warn", text: ROUND_NOTICES.noKeyedGm });
  if (ctx.xCardActive) banners.push({ level: "warn", text: ROUND_NOTICES.xCard });

  if (!roundIsOpen(round)) {
    return { mode: ctx.sessionActive ? "waiting" : "no-session", number: round?.number ?? null, banners, own: null, table: [], gm: null, progress: [] };
  }

  const collecting = round.phase === ROUND_PHASE.COLLECTING;
  const resolving  = isResolving(round);
  if (resolving) banners.push({ level: "info", text: ROUND_NOTICES.resolving });

  const own = ownView(round, viewer, { collecting, moveLabel, statLabel, notReceived: !!ctx.notReceived });
  const table = tableView(round, viewer, { resolving, moveLabel });
  const gm = isGM ? gmView(round, { collecting, connected, xCardActive: !!ctx.xCardActive, moveLabel, statLabel }) : null;
  const progress = resolving ? progressView(round, { moveLabel }) : [];

  return {
    mode: collecting ? "collecting" : "resolving",
    number: round.number ?? null,
    phase: round.phase,
    roundId: round.id,
    banners,
    own,
    table,
    gm,
    progress,
  };
}

/**
 * The viewer's own entry. Null for a viewer with no character in the round
 * (a GM without an assigned PC sees the GM controls only).
 */
function ownView(round, viewer, { collecting, moveLabel, statLabel, notReceived }) {
  const entry = entryFor(round, viewer?.userId);
  if (!entry) return null;
  const reading = entry.reading ? readingView(entry.reading, { moveLabel, statLabel }) : null;
  const status = entry.status;
  const awaitingUpgrade = round.phase === ROUND_PHASE.UPGRADING && entry.upgrade && !entry.upgrade.decided;
  const statusLabel = awaitingUpgrade ? "Deciding upgrade" : (OWN_STATUS_LABELS[status] ?? null);
  return {
    actorName:    entry.actorName,
    status,
    statusLabel,
    text:         entry.text ?? "",
    submissionId: entry.submissionId ?? null,
    error:        entry.error ? ROUND_NOTICES.readFailed : null,
    notReceived:  !!notReceived,
    reading,
    choices:      entry.choices ?? null,
    offer:        entry.offer ? { text: entry.offer.text, moveName: entry.offer.forced?.moveId ? moveLabel(entry.offer.forced.moveId) : null } : null,
    canEdit:      collecting,
    canSubmit:    collecting,
    canPass:      collecting && status !== ENTRY_STATUS.PASSED,
    canWithdraw:  collecting && status !== ENTRY_STATUS.WAITING && status !== ENTRY_STATUS.PASSED,
    canConfirm:   collecting && status === ENTRY_STATUS.READ && !!reading && !reading.blocked,
    canReread:    collecting && status === ENTRY_STATUS.READ && reading?.kind === READING_KIND.NARRATIVE,
    upgrade:      awaitingUpgrade ? upgradeView(entry, { moveLabel }) : null,
  };
}

/** The reading as the window shows it. */
function readingView(reading, { moveLabel, statLabel }) {
  if (reading.kind !== READING_KIND.MOVE) {
    return {
      kind: READING_KIND.NARRATIVE,
      suggestedMove: reading.suggestedMove ?? null,
      suggestedMoveName: reading.suggestedMove ? moveLabel(reading.suggestedMove) : null,
    };
  }
  return {
    kind:          READING_KIND.MOVE,
    moveId:        reading.moveId,
    moveName:      reading.moveName || moveLabel(reading.moveId),
    statUsed:      reading.statUsed ?? null,
    statName:      reading.statUsed ? statLabel(reading.statUsed) : null,
    rationale:     reading.rationale ?? "",
    mischiefAside: reading.mischiefAside ?? "",
    abilities:     Array.isArray(reading.abilities) ? reading.abilities : [],
    statOptions:   Array.isArray(reading.statOptions) ? reading.statOptions : [],
    targetChoices: reading.targetChoices ?? null,
    blocked:       reading.blocked ?? null,
  };
}

/** The Burn / Improve / Keep offer a roller decides before the narration. */
function upgradeView(entry, { moveLabel }) {
  const u = entry.upgrade ?? {};
  const label = (o) => (o ? humanise(o) : null);
  return {
    cardId:   u.cardId ?? null,
    moveName: entry.rolled?.moveId ? moveLabel(entry.rolled.moveId) : null,
    outcome:  label(entry.rolled?.outcome),
    burn:     u.burn ? { momentum: u.burn.momentum ?? null, outcome: label(u.burn.previewOutcome) } : null,
    improve:  u.improve ? { outcome: label(u.improve.previewOutcome ?? "strong_hit"), label: u.improve.label ?? null } : null,
  };
}

/**
 * The other players' entries the viewer may see: Ready ones while collecting,
 * the acting ones while the round resolves, in order, with their text. Never a
 * pass, a waiting entry or an unconfirmed reading.
 */
function tableView(round, viewer, { resolving, moveLabel }) {
  const ids = resolving ? (round.acting ?? []) : (round.order ?? []);
  return ids
    .filter(id => id !== viewer?.userId)
    .map(id => round.entries[id])
    .filter(e => e && (resolving || e.status === ENTRY_STATUS.READY))
    .map(e => ({
      userId:    e.userId,
      actorName: e.actorName,
      text:      e.text ?? "",
      moveName:  e.reading?.kind === READING_KIND.MOVE ? (e.reading.moveName || moveLabel(e.reading.moveId)) : null,
    }));
}

/** A GM's controls and every entry's reading. */
function gmView(round, { collecting, connected, xCardActive, moveLabel, statLabel }) {
  const entries = Object.values(round.entries)
    .filter(e => [ENTRY_STATUS.SUBMITTED, ENTRY_STATUS.READ, ENTRY_STATUS.READY].includes(e.status)
      || (isResolving(round) && (round.acting ?? []).includes(e.userId)))
    .map(e => ({
      userId:    e.userId,
      actorName: e.actorName,
      userName:  e.userName,
      status:    e.status,
      text:      e.text ?? "",
      error:     e.error ? ROUND_NOTICES.readFailed : null,
      reading:   e.reading ? readingView(e.reading, { moveLabel, statLabel }) : null,
    }));
  const waitingFor = collecting
    ? Object.values(round.entries)
        .filter(e => connected.has(e.userId) && e.status !== ENTRY_STATUS.READY && e.status !== ENTRY_STATUS.PASSED)
        .map(e => e.actorName)
    : (round.phase === ROUND_PHASE.UPGRADING ? undecidedUpgrades(round).map(id => round.entries[id]?.actorName).filter(Boolean) : []);
  const sendable = collecting || round.phase === ROUND_PHASE.UPGRADING;
  return {
    entries,
    waitingFor,
    sendNow: {
      enabled: sendable && !xCardActive,
      reason:  xCardActive ? ROUND_NOTICES.xCard : (sendable ? null : ROUND_NOTICES.resolving),
      label:   round.phase === ROUND_PHASE.UPGRADING ? "Send now (keep the rest)" : "Send now",
    },
    discard: { enabled: collecting },
  };
}

/** The resolution's progress, entry by entry. */
function progressView(round, { moveLabel }) {
  return (round.acting ?? []).map(id => {
    const e = round.entries[id];
    const deciding = round.phase === ROUND_PHASE.UPGRADING && e?.upgrade && !e.upgrade.decided;
    const label = deciding ? "Deciding upgrade"
      : e?.status === ENTRY_STATUS.REFUSED ? "Not rolled"
      : (e?.status === ENTRY_STATUS.RECORDED || e?.status === ENTRY_STATUS.ROLLED) ? (e.rolled?.moveId ? `${moveLabel(e.rolled.moveId)}: ${humanise(e.rolled.outcome)}` : "Ready")
      : "Waiting to roll";
    return { userId: id, actorName: e?.actorName ?? "", label };
  });
}
