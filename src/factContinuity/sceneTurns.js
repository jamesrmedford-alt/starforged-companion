/**
 * STARFORGED COMPANION
 * src/factContinuity/sceneTurns.js — when a scene turns (overhaul 2, slice 2)
 *
 * A session was one scene unless someone typed `!scene`: in the long haul's
 * third and fourth live runs every session but its cutaways was one scene, so
 * the scene's question, its colour and its hooks were the session's. A scene
 * is a place and a situation now, and it turns in code when the table's
 * stores say either has changed — never on the narration's word:
 *
 *   place       the characters' recorded place (`currentLocationId`) is not
 *               the one the scene began at — an arrival, `!at`, the Entities
 *               panel, a line that walked them there;
 *   ship        the ship's place (its position record's nearest location,
 *               settlement or planet, else its free text) is not the one the
 *               scene began with — the token moved, a beat's ship/position;
 *   fight       a combat track is open that the scene did not begin with, or
 *               one it began with is closed;
 *   expedition  the same, an expedition track;
 *   challenge   the same, a scene challenge;
 *   time        the beat's player words skip time (`TIME_SKIP`), or its move
 *               is Sojourn.
 *
 * **Begins before, ends after.** A change that brings the characters
 * somewhere new turns the scene before the narration that tells it; a track
 * the beat's own resolution ended (`endingIds`) does not turn it for that
 * beat — the finishing blow is the fight's last — and the next beat finds it
 * gone. Several causes in one beat are one turn, the first in the order
 * above.
 *
 * **Not a turn:** an answered question (it cuts forward within the scene —
 * issue #353 R2's rejection of "ending the scene on an answer" stands), a
 * waypoint, a vow fulfilled, a connection made, a token nudged or a ship
 * undocked at the same place (the same place key).
 *
 * This reverses issue #353 R2's "scenes stay manual" (overhaul 2 D1, taken at
 * the design's recommendation; the maintainer's to take back first): `!scene`
 * and the session's bookends stay as they are, and the scene's anchor
 * (`campaignState.sceneBegan`, written once at its start) is what each beat's
 * check compares the stores with (sceneLifecycle.js `turnSceneIfDue`).
 *
 * Pure: no Foundry, no store reads — the live stores are the caller's.
 */

import { normaliseLetGo } from './provenance.js';

/** The progress track types a scene's situation turns on, and the cause each is. */
const TRACK_CAUSES = Object.freeze({ combat: 'fight', expedition: 'expedition', scene_challenge: 'challenge' });

/** The moves that arrive somewhere: their place is "reached", a GM's word's is "at". */
const ARRIVAL_MOVES = new Set(['set_a_course', 'finish_an_expedition']);

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** A ship's line that reads "docked at": its name, and where (its scope in brackets left off). */
const DOCKED_AT = /^(.+?)\s+docked at\s+(.+?)(?:\s+\([^()]*\))?$/;

/** The most of a line a time skip's words quote (a line, not a paragraph). */
const LINE_WORDS_MAX = 160;

/** How many — a number, a word for one, or "a few". */
const HOW_MANY = String.raw`(?:\d+|an?|a\s+few|a\s+couple\s+of|some|several|two|three|four|five|six|seven|eight|nine|ten|twelve)`;
const SPAN = String.raw`(?:hours?|days?|nights?|weeks?|months?|years?)`;
const PART_OF_DAY = String.raw`(?:morning|day|night|evening|afternoon|dawn|daybreak|nightfall)`;

/**
 * The words a player's line skips time with (overhaul 2 §4.2): phrases, never
 * a bare word — "later" alone, "I'll talk to you later" or "tomorrow I'll…"
 * skip nothing. Run over every typed line of the four kept long hauls by
 * tests/unit/sceneTurns.test.js, which lists the lines it fires on.
 */
export const TIME_SKIP = Object.freeze([
  new RegExp(String.raw`\blater\s+that\s+${PART_OF_DAY}\b`, 'i'),
  new RegExp(String.raw`\b${HOW_MANY}\s+${SPAN}\s+later\b`, 'i'),
  new RegExp(String.raw`\b(?:the\s+)?next\s+${PART_OF_DAY}\b`, 'i'),
  new RegExp(String.raw`\bthe\s+following\s+(?:${PART_OF_DAY}|week)\b`, 'i'),
  /\bovernight\b/i,
  /\bsleep\s+(?:until|till|through)\b/i,
  new RegExp(String.raw`\bwait\s+(?:until|till|for)\s+(?:the\s+)?(?:${PART_OF_DAY}|next\b|morning)`, 'i'),
  new RegExp(String.raw`\brest\s+(?:for|until|till)\s+(?:the\s+)?(?:${PART_OF_DAY}|next\b|a\s+while\b|${HOW_MANY}\s+${SPAN})`, 'i'),
  /\bskip\s+(?:ahead|forward)\b/i,
  /\btime\s+passes\b/i,
]);

/**
 * The words of `line` that skip time, or '' — the first phrase TIME_SKIP finds.
 *
 * @param {string} line — the beat's player words
 * @returns {string}
 */
export function skippedTime(line) {
  const text = String(line ?? '');
  for (const re of TIME_SKIP) {
    const m = re.exec(text);
    if (m) return clean(m[0]);
  }
  return '';
}

/**
 * The key a ship's position is compared by: the recorded place it is at or
 * near — a location, a settlement, a planet — else its free text, folded. A
 * ship undocked at the same place, or a token nudged within its pin, keeps it.
 *
 * @param {Object|null} position — the Ship Actor's `position` flag
 * @returns {string|null}
 */
export function shipPlaceKey(position) {
  if (!position || typeof position !== 'object') return null;
  for (const id of [position.nearestLocationId, position.nearestSettlementId, position.nearestPlanetId]) {
    if (typeof id === 'string' && id) return `id:${id}`;
  }
  const free = clean(position.freeText).toLowerCase();
  return free ? `text:${free}` : null;
}

/** The open tracks of the turning types, as a scene's anchor keeps them: `{ combat: [{ id, label }], … }`. */
function tracksOf(open) {
  const out = { combat: [], expedition: [], scene_challenge: [] };
  for (const t of Array.isArray(open) ? open : []) {
    if (!t || typeof t.id !== 'string' || !t.id || !(t.type in out)) continue;
    out[t.type].push({ id: t.id, label: clean(t.label) });
  }
  return out;
}

/**
 * What the stores say a scene stands in now — the live half of a turn check,
 * and what a scene's anchor is made from (sceneLifecycle.js reads them).
 *
 * @param {{ place?: { id: string, type?: string|null, name?: string|null }|null,
 *           ship?: { key: string|null, line?: string, name?: string }|null,
 *           openTracks?: Array<{ id: string, type: string, label?: string }> }} stores
 * @returns {{ place: Object|null, ship: Object|null, tracks: Object }}
 */
export function sceneStores({ place = null, ship = null, openTracks = [] } = {}) {
  return {
    place: place && typeof place.id === 'string' && place.id
      ? { id: place.id, type: place.type ?? null, name: clean(place.name) || null } : null,
    ship: ship && typeof ship.key === 'string' && ship.key
      ? { key: ship.key, line: clean(ship.line), name: clean(ship.name) || null } : null,
    tracks: tracksOf(openTracks),
  };
}

/**
 * A scene's anchor (overhaul 2 §4.1): why it began, in words, and what it
 * began with — written once, at its start, from the stores as they stood;
 * never updated, so it is no second store of the place (the place is always
 * read live).
 *
 * @param {Object} live — sceneStores'
 * @param {{ sceneId: string, at?: number, cause?: string, what?: string }} begun
 * @returns {Object}
 */
export function sceneAnchorOf(live, { sceneId, at = Date.now(), cause = 'first', what = '' } = {}) {
  const stores = live && typeof live === 'object' ? live : sceneStores();
  return {
    sceneId: sceneId ?? null,
    at,
    cause: typeof cause === 'string' && cause ? cause : 'first',
    what: clean(what),
    place: stores.place ?? null,
    ship: stores.ship ? { key: stores.ship.key, line: stores.ship.line } : null,
    tracks: {
      combat: [...(stores.tracks?.combat ?? [])],
      expedition: [...(stores.tracks?.expedition ?? [])],
      scene_challenge: [...(stores.tracks?.scene_challenge ?? [])],
    },
  };
}

/**
 * The anchor with what it did not know filled in from the stores: a scene that
 * began with no place or no ship position takes the first one recorded,
 * without turning (the inciting incident's own starting position, a session
 * begun before the ship was placed), and a scene open when this shipped —
 * with no anchor at all — takes one whole. Returns null when nothing changes.
 *
 * @param {Object|null} anchor
 * @param {Object} live — sceneStores'
 * @param {{ sceneId: string }} scene
 * @returns {Object|null} the anchor to keep, or null when it stands as it is
 */
export function anchorFilled(anchor, live, { sceneId } = {}) {
  if (!anchor || typeof anchor !== 'object' || anchor.sceneId !== sceneId) {
    return sceneAnchorOf(live, { sceneId, cause: 'first' });
  }
  const fill = {};
  if (!anchor.place && live?.place) fill.place = live.place;
  if (!anchor.ship && live?.ship) fill.ship = { key: live.ship.key, line: live.ship.line };
  return Object.keys(fill).length ? { ...anchor, ...fill } : null;
}

/**
 * What the narrator is told began the scene, in words (overhaul 2 §4.2) —
 * the anchor's `what`.
 *
 * @param {string} cause
 * @param {Object} [detail]
 * @returns {string}
 */
export function causeText(cause, detail = {}) {
  const label = clean(detail.label) || 'it';
  switch (cause) {
    case 'place':
      return detail.arrived ? `the characters have reached ${clean(detail.name) || 'a new place'}`
        : `the characters are at ${clean(detail.name) || 'a new place'}`;
    case 'ship':
      return `${clean(detail.ship) || 'the ship'} is now ${clean(detail.where) || 'somewhere new'}`;
    case 'fight':
      return detail.ended ? `the fight with ${label} is over` : `a fight has begun: ${label}`;
    case 'expedition':
      return detail.ended ? `the expedition ${label} is over` : `the expedition ${label} has begun`;
    case 'challenge':
      return detail.ended ? `${label} is settled` : `${label} has begun`;
    case 'time':
      return `time has passed: "${clean(detail.words)}"`;
    case 'session':
      return 'the session begins';
    case 'gm':
      return 'the GM began a new scene';
    default:
      return '';
  }
}

/** A ship position line as the turn's words say it: "the Kobayashi IV, docked at Bleakhold Station". */
function shipWords(line) {
  return clean(String(line ?? '').replace(/^SHIP POSITION:\s*/i, ''));
}

/**
 * Whether the scene is due to turn, and why (overhaul 2 §4.2–4.3): the first
 * cause the live stores show against the scene's anchor, or null. Pure.
 *
 * @param {Object} anchor — the scene's `sceneBegan`
 * @param {Object} live — sceneStores'
 * @param {{ line?: string, moveId?: string|null, endingIds?: string[], moveIds?: string[] }} [beat]
 *   — the beat's player words, its move (a round's several), and the tracks its own resolution ended
 * @returns {{ cause: string, what: string }|null}
 */
export function sceneTurnDue(anchor, live, { line = '', moveId = null, moveIds = [], endingIds = [] } = {}) {
  if (!anchor || typeof anchor !== 'object' || !live || typeof live !== 'object') return null;
  const ending = new Set((Array.isArray(endingIds) ? endingIds : []).filter(Boolean));
  const moves = new Set([moveId, ...(Array.isArray(moveIds) ? moveIds : [])].filter(Boolean));

  // The characters' place, then the ship's: begins before.
  if (anchor.place && live.place && live.place.id !== anchor.place.id) {
    const arrived = [...moves].some(m => ARRIVAL_MOVES.has(m));
    return { cause: 'place', what: causeText('place', { arrived, name: live.place.name }) };
  }
  // …but while an expedition is under way, the ship moving on its legs is
  // that journey's: no turn (issue #389 #9, EXPEDITION-LEGS-TURN-THE-SCENE —
  // the sixth live round turned the scene on every leg: a22 then a23; the
  // first run's a23, a24 and a25, a scene a beat). The expedition began its
  // own scene, or begins one now (below), and its arrival turns as a place.
  const underway = (live.tracks?.expedition ?? []).length > 0;
  if (!underway && anchor.ship && live.ship && live.ship.key !== anchor.ship.key) {
    return { cause: 'ship', what: causeText('ship', { ship: live.ship.name, where: shipWords(live.ship.line).replace(new RegExp(`^${escapeRe(clean(live.ship.name))}\\s*`, 'i'), '') }) };
  }

  // A fight, an expedition, a scene challenge: begun before, ended after.
  for (const [type, cause] of Object.entries(TRACK_CAUSES)) {
    const began = new Map((anchor.tracks?.[type] ?? []).map(t => [t.id, t]));
    const open = new Map((live.tracks?.[type] ?? []).map(t => [t.id, t]));
    const newOne = [...open.values()].find(t => !began.has(t.id));
    if (newOne) return { cause, what: causeText(cause, { label: newOne.label }) };
    const over = [...began.values()].find(t => !open.has(t.id) && !ending.has(t.id));
    if (over) return { cause, what: causeText(cause, { label: over.label, ended: true }) };
  }

  // Time the player's words skip, or a Sojourn: told in the line's own words.
  if (skippedTime(line)) return { cause: 'time', what: causeText('time', { words: clean(line).slice(0, LINE_WORDS_MAX) }) };
  if (moves.has('sojourn')) return { cause: 'time', what: 'time has passed: the characters sojourn' };
  return null;
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * What began the scene this beat opens, or '' (overhaul 2 §4.5): the scene's
 * anchor says why it began — a turn's cause in words, the GM's `!scene start`
 * — and no narration has written in it yet (its frame is none, or the cast a
 * turn carried in; no truth carries a narration's id). A scene a first
 * narration opened, with nothing to say of why, is told nothing.
 *
 * @param {Object} state — the scene ledger as the store has it (narratorPrompt.js SCENE_LEDGER_FIELDS)
 * @returns {string}
 */
export function sceneOpeningOf(state) {
  const began = state?.sceneBegan;
  const what = typeof began?.what === 'string' ? began.what.trim() : '';
  if (!what || !began.sceneId || began.sceneId !== (state.currentSceneId ?? null)) return '';
  if (state.sceneFrame?.narrationId) return '';
  if ((Array.isArray(state.sceneTruths) ? state.sceneTruths : []).some(t => t?.narrationId)) return '';
  return what;
}

/**
 * What the scene obliges a beat of play's narration to tell, and never to tell
 * (overhaul 2 §10.3): lines of overhaul 4's block — "WHAT THIS NARRATION MUST
 * TELL, AND MUST NOT", moves/contracts/obligations.js formatObligationsBlock,
 * which renders any `{ kind, list, text }` — in the user message of a move, a
 * paced line, a round and an oracle follow-up:
 *
 *   TELL [scene]    the beat that opens a scene: why it began, and to open it
 *                   there and describe the place fresh (D12)
 *   NOT SO [place]  the beat that opens a fight's scene while the ship's line
 *                   reads "docked at" (§6.2): if the fight is the ship's, she
 *                   is no longer docked — say where she is (ship/position); on
 *                   foot she stays docked. No code infers undocking (D9): a
 *                   crew may fight on the dock.
 *   NOT SO [letgo]  each question play let go (§7.3): not to end on it or bring
 *                   it back unless the player's line takes it up
 *
 * Checked before the narration posts (moves/contracts/checks.js, overhaul 4's
 * classes): [place] is a judge tripwire — "docked", "berth", "clamps" in the
 * prose send the line to the one small judge call, which reads its `judge`
 * words (the ship fighting as a ship while still docked; a fight on foot
 * breaks nothing), and a violation is asked once more; [letgo] a floor,
 * logged — a stem of its let-go question (`letGo`, the frame's entry) in the
 * prose's last two sentences that the beat's player words do not hold;
 * [scene] logged. All three also go to the post-narration audit (kind
 * `obligation`).
 *
 * @param {Object} state — the scene ledger as the store has it
 * @param {{ ship?: string }} [opts] — the ship's line as the scene's read has
 *   it (narratorPrompt.js sceneForReading: "Kobayashi IV docked at Bleakhold Station")
 * @returns {Array<{ kind: string, list: string, text: string, judge?: string, letGo?: { text: string, stems: string[] } }>}
 */
export function sceneObligations(state, { ship = '' } = {}) {
  const out = [];
  const opening = sceneOpeningOf(state);
  if (opening) {
    out.push({ kind: 'scene', list: 'TELL', text: `This beat opens a new scene: ${opening}. Open it there — where the characters `
      + 'are now, who is here. What still binds is under ACTIVE SCENE; the last scene\'s description is not carried: describe '
      + 'this place fresh.' });
  }
  const docked = opening && state.sceneBegan?.cause === 'fight' ? DOCKED_AT.exec(clean(ship)) : null;
  if (docked) {
    out.push({ kind: 'place', list: 'NOT SO', text: `${docked[1]} is docked at ${docked[2]} by the ship's record. If this fight `
      + 'is the ship\'s, she is no longer docked: say where she is in your fact block (ship/position). If it is fought on foot, '
      + 'she stays docked.',
      // What the judge reads (checks.js): the line's NOT SO as a statement.
      judge: `${docked[1]} fighting as a ship — firing, turning, running — while the narration still has her docked, berthed `
        + `or in the clamps at ${docked[2]}. A fight on foot while she stays docked breaks nothing.` });
  }
  const frame = state?.sceneFrame;
  const own = frame && typeof frame === 'object' && (frame.sceneId ?? null) === (state.currentSceneId ?? null);
  for (const e of own ? normaliseLetGo(frame.letGo) : []) {
    out.push({ kind: 'letgo', list: 'NOT SO', text: `Play let this go: "${e.text}". Do not end on it or bring it back unless the `
      + 'player\'s line takes it up.', letGo: e });
  }
  return out;
}
