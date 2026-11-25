/**
 * STARFORGED COMPANION
 * src/record/phrasing.js — the record's facts in words, one phrasing for every view (issue #382)
 *
 * The Session Log page (sessionLogView.js) and the campaign recap's source
 * (recapView.js) say a move, a sheet change and what play did in the same
 * words, from the same facts. Plain text, unescaped: a view escapes for its
 * own medium. Pure, no imports.
 */

/** How the record says an outcome. */
export const OUTCOMES = Object.freeze({ strong_hit: 'strong hit', weak_hit: 'weak hit', miss: 'miss' });

const METERS = Object.freeze({
  health: 'Health', spirit: 'Spirit', supply: 'Supply', momentum: 'Momentum', xp: 'XP',
  integrity: 'Integrity', 'companion-health': 'Companion health',
});

/**
 * How a line came to the table, for whether its text is someone's own words:
 * typed in chat, a Batch Mode round's entry, or a typed line posted again to
 * be narrated as it stands. A card's button posts the module's own wording of
 * a move (or an earlier line again), a ship token's drop a Set a Course — the
 * move is what a view says for those.
 */
export const OWN_WORDS = Object.freeze(new Set(['typed', 'round', 'narrate-only']));

const cap = (s) => (s ? `${s.charAt(0).toUpperCase()}${s.slice(1)}` : s);
const boxes = (ticks) => Math.floor((Number(ticks) || 0) / 4);
const q = (s) => `“${String(s ?? '').trim()}”`;

/** "Momentum 2 → 3", "Wounded marked", "Quests legacy 4 → 6 ticks" — one sheet change. */
export function changeText(c) {
  const what = String(c?.what ?? '');
  if (what.startsWith('impact:')) return `${cap(what.slice(7))} ${c.to ? 'marked' : 'cleared'}`;
  if (what.startsWith('legacy:')) return `${cap(what.slice(7))} legacy ${c.from ?? '?'} → ${c.to ?? '?'} ticks`;
  return `${METERS[what] ?? what} ${c?.from ?? '?'} → ${c?.to ?? '?'}`;
}

/**
 * The moves made on a vow: their line names it. "Swear an Iron Vow (+heart),
 * weak hit — LASTING: a vow sworn" said which vow nowhere, and a recap took
 * the character's background vow for the one sworn (known-issues
 * VOW-SWORN-UNNAMED-IN-THE-RECORD).
 */
const VOW_MOVES = Object.freeze(new Set(['swear_an_iron_vow', 'reach_a_milestone', 'fulfill_your_vow', 'forsake_your_vow']));

/**
 * "Compel (+heart), strong hit (a match)"; an upgrade says what it was and
 * how it was raised; a move made on a vow names it — "Swear an Iron Vow
 * (+heart): “Find the lost ark”, weak hit".
 */
export function moveText(move) {
  if (!move) return '';
  const name = move.name ?? move.moveId ?? 'A move';
  const stat = move.stat && move.rollKind !== 'progress' ? ` (+${move.stat})` : '';
  const vow = VOW_MOVES.has(move.moveId) && String(move.target?.name ?? '').trim() ? `: ${q(move.target.name)}` : '';
  const outcome = move.upgraded
    ? `${OUTCOMES[move.upgraded.from] ?? move.upgraded.from ?? '?'}, made a ${OUTCOMES[move.outcome] ?? move.outcome ?? '?'} by ${move.upgraded.how === 'burn' ? 'burning momentum' : 'an asset'}`
    : (OUTCOMES[move.outcome] ?? move.outcome ?? '');
  return `${name}${stat}${vow}${outcome ? `, ${outcome}` : ''}${move.match ? ' (a match)' : ''}`;
}

const TRACK_KINDS = Object.freeze({
  combat: 'fight', expedition: 'expedition', scene_challenge: 'scene challenge', connection: 'connection', vow: 'vow',
});
const trackKind = (type) => TRACK_KINDS[type] ?? String(type ?? 'track').replace(/_/g, ' ');

/**
 * What play did, in words — one entry of a beat's `did` (read.js), or ''
 * for one no view says.
 *
 * @param {{ kind: string }} d — the event's facts, with its kind
 * @returns {string}
 */
export function didText(d) {
  const said = deedText(d);
  // A change the table made by its own hand (`by: "hand"` — the sheet, the
  // Progress Tracks panel, `!sever`) is said as one, never as a deed of the
  // story (overhaul 4, D7 and D12).
  return said && d?.by === 'hand' ? `${said} (set by hand)` : said;
}

/** didText's words for what play did, before who made it is said. */
function deedText(d) {
  switch (d?.kind) {
    case 'vow.sworn':        return `swore the vow ${q(d.name)}${d.rank ? ` (${d.rank})` : ''}${d.shared ? ', shared by the crew' : ''}`;
    case 'vow.linked':       return `tied the vow ${q(d.name)} to ${d.connectionName ?? 'a connection'}`;
    case 'vow.closed':       return `the vow ${q(d.name)} ${d.how === 'forsaken' ? 'forsaken' : 'fulfilled'}`;
    case 'progress.marked':  return `progress on ${q(d.label)} ${boxes(d.from)} → ${boxes(d.to)} boxes`;
    case 'track.begun':      return `began the ${trackKind(d.type)} ${q(d.label)}${d.rank ? ` (${d.rank})` : ''}`;
    case 'track.ended':      return `the ${trackKind(d.type)} ${q(d.label)} ${d.completed ? 'brought to its end' : 'closed unfinished'}`;
    case 'position.changed': return `${d.name ?? 'a character'} ${d.to === 'in_control' ? 'in control' : 'in a bad spot'} in ${q(d.label)}`;
    case 'fight.offered':    return `a fight offered: ${q(d.label)}${d.suggestedRank ? ` (${d.suggestedRank})` : ''}`;
    // A starting connection is the game's setup, not a deed of the story (overhaul 4, D12).
    case 'connection.made':  return d.by === 'setup'
      ? `a connection from the start: ${d.name}${d.rank ? ` (${d.rank})` : ''}`
      : `made a connection: ${d.name}${d.rank ? ` (${d.rank})` : ''}`;
    case 'connection.developed': return `developed the relationship with ${d.name} (${boxes(d.ticks?.from)} → ${boxes(d.ticks?.to)} boxes)`;
    case 'connection.bonded': return `forged a bond with ${d.name}`;
    case 'connection.lost':  return `lost the connection with ${d.name}${d.reason ? ` (${d.reason})` : ''}`;
    case 'entity.confirmed': return `recorded ${d.type ? `the ${String(d.type).replace(/_/g, ' ')} ` : ''}${d.name}`;
    case 'place.arrived':    return `arrived at ${d.name}`;
    case 'oracle.asked':     return `asked the oracle${d.name ? ` (${d.name})` : ''}${d.question ? ` ${q(d.question)}` : ''}: ${d.answer}`;
    case 'clock.advanced':   return `the clock ${q(d.name)} ${d.from ?? '?'} → ${d.to ?? '?'} of ${d.segments ?? '?'}${d.triggered ? ', filled' : ''}`;
    case 'reward.granted':   return `a reward granted: ${d.reward}`;
    case 'choice':           return d.picked ? `chose ${q(d.picked)}` : '';
    default:                 return '';
  }
}
