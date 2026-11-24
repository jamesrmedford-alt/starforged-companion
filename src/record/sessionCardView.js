/**
 * STARFORGED COMPANION
 * src/record/sessionCardView.js — the `!recap session` card, a view of the session record (issue #382, slice 5)
 *
 * `!recap session` posts a card of a session's moves, and `!recap session N`
 * one of session N's: a line a move — who rolled it, the move, its outcome —
 * how many moves were resolved and how many were strong hits, and the match
 * when one was rolled. No model and no chat: it is made in code from
 * `readRecord({ session })`, so it is there after a GM clears the chat log,
 * and the table's corrections reach it as they reach every view:
 *   - a burned or improved move is one line, at its final outcome (the read's
 *     `move.upgraded`);
 *   - a move whose telling the X-Card removed is still a move — it happened —
 *     and nothing of its telling is on the card (no view prints the prose);
 *   - a move whose narration failed ("narration unavailable") is a move: the
 *     roll is on the record, whatever became of its telling;
 *   - the roller is named as their sheet names them now.
 * A paced line, an `@scene` question or a vignette is part of the story, not
 * a move: the card lists none of them.
 *
 * It read the session's narrator cards in chat (narrator.js postSessionRecap's
 * per-card loop over `sessionNarratorCards(…, { forRecap: true })`), finding
 * session N by scanning the cards for its number (`recapSessionFor`). The
 * session is found by its number as the record has it now: the current
 * session's own number names it; any other is the newest session the record
 * numbers N (`session.begun` — summaryView.js sessionIdOfNumber). A session
 * played before the record has no moves to list, and the card says so.
 *
 * Pure but for the default source (pages.js recordSource).
 */

import { readRecord } from './read.js';
import { recordSource } from './pages.js';
import { sessionIdOfNumber } from './summaryView.js';
import { moveDisplayName } from '../system/i18n.js';

/** How the card says an outcome. */
const OUTCOME_LABELS = Object.freeze({ strong_hit: 'Strong Hit', weak_hit: 'Weak Hit', miss: 'Miss' });

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The session a `!recap session` names: the given session; else, asked for a
 * number, the current session when it is the current session's number, else
 * the newest session the record numbers N (null when none is); else the
 * current session.
 *
 * @param {Object} campaignState
 * @param {{ sessionId?: string|null, sessionNumber?: number|null }} [ask]
 * @param {Object} [source]
 * @returns {{ sessionId: string|null, number: number|null, asked: number|null }}
 */
export function sessionCardTarget(campaignState, { sessionId = null, sessionNumber = null } = {}, source = recordSource()) {
  const current = campaignState?.currentSessionId ?? null;
  const currentNumber = Number.isFinite(Number(campaignState?.sessionNumber)) && Number(campaignState.sessionNumber) > 0
    ? Number(campaignState.sessionNumber) : null;
  if (typeof sessionId === 'string' && sessionId) {
    return { sessionId, number: sessionId === current ? currentNumber : null, asked: null };
  }
  const asked = Number.isInteger(sessionNumber) && sessionNumber > 0 ? sessionNumber : null;
  if (asked === null) return { sessionId: current, number: currentNumber, asked: null };
  if (asked === currentNumber && current) return { sessionId: current, number: asked, asked };
  return { sessionId: sessionIdOfNumber(asked, source), number: asked, asked };
}

/**
 * A session's card as the record has it. Pure but for its default source.
 *
 * @param {{ sessionId: string|null, number: number|null, asked: number|null }} target — sessionCardTarget's
 * @param {Object} [source]
 * @returns {{ sessionId: string|null, number: number|null, asked: number|null, legacy: boolean, begunAt: number|null,
 *   moves: Array<{ who: string|null, move: string, outcome: string|null, match: boolean }>, strongHits: number, matches: string[] }}
 */
export function sessionCardOf(target, source = recordSource()) {
  const session = target?.sessionId ? (readRecord({ session: target.sessionId }, source).sessions[0] ?? null) : null;
  const moves = (session?.beats ?? []).filter(b => b.move).map(b => ({
    who: b.who?.name ?? null,
    move: (b.move.moveId ? moveDisplayName(b.move.moveId) : '') || b.move.name || 'A move',
    outcome: b.move.outcome ?? null,
    match: b.move.match === true,
  }));
  return {
    sessionId: target?.sessionId ?? null,
    number: Number.isFinite(target?.number) ? target.number : (Number.isFinite(session?.number) ? session.number : null),
    asked: target?.asked ?? null,
    legacy: session?.legacy === true,
    begunAt: Number.isFinite(session?.begun?.at) ? session.begun.at : null,
    moves,
    strongHits: moves.filter(m => m.outcome === 'strong_hit').length,
    matches: moves.filter(m => m.match).map(m => m.move),
  };
}

/**
 * The card's chat message: its HTML and the module's flags on it.
 *
 * @param {ReturnType<typeof sessionCardOf>} card
 * @returns {{ content: string, flags: Object }}
 */
export function sessionCardMessage(card) {
  const number = Number.isFinite(card?.number) ? card.number : null;
  const flags = {
    recapCard: true,
    recapType: 'session',
    ...(card?.sessionId ? { sessionId: card.sessionId } : {}),
    ...(number !== null ? { sessionNumber: number } : {}),
  };
  if (!card?.moves?.length) {
    const which = card?.asked !== null && card?.asked !== undefined ? `session ${card.asked}` : 'this session';
    const empty = card?.legacy
      ? `${which.charAt(0).toUpperCase()}${which.slice(1)} was played before the session record was kept: its moves are not recorded.`
      : `No moves are recorded for ${which}.`;
    return {
      content: `<div class="sf-recap-session-card"><div class="sf-recap-label">◈ Session Recap</div>`
        + `<div class="sf-recap-empty">${escapeHtml(empty)}</div></div>`,
      flags: { ...flags, recapEmpty: true },
    };
  }
  const lines = card.moves.map(m => {
    const outcome = OUTCOME_LABELS[m.outcome] ?? null;
    return `• ${m.who ? `${escapeHtml(m.who)} — ` : ''}${escapeHtml(m.move)}${outcome ? ` → ${outcome}` : ''}`;
  });
  const summary = [`${plural(card.moves.length, 'move')} resolved.`];
  if (card.strongHits > 0) summary.push(`${plural(card.strongHits, 'strong hit')}.`);
  const matched = [...new Set(card.matches)];
  if (card.matches.length === 1) summary.push(`A match was rolled — ${escapeHtml(matched[0])}.`);
  else if (card.matches.length > 1) summary.push(`${card.matches.length} matches were rolled — ${matched.map(escapeHtml).join(', ')}.`);
  const title = `${number !== null ? `Session ${number}` : 'Current Session'} — ${new Date(card.begunAt ?? Date.now()).toLocaleDateString()}`;
  return {
    content: `<div class="sf-recap-session-card"><div class="sf-recap-label">◈ Session Recap</div>`
      + `<div class="sf-recap-session-title">${escapeHtml(title)}</div>`
      + `<div class="sf-recap-moves">${lines.join('<br>')}</div>`
      + `<div class="sf-recap-summary">${summary.join(' ')}</div></div>`,
    flags,
  };
}
