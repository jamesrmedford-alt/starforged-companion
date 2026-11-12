// src/ui/progressTracks.js
// Progress Track panel — Starforged Companion module
// ApplicationV2 panel displaying all active progress tracks (vows, expeditions,
// connections, combat) with visual 10-box tick rendering, Mark Progress, Clear
// Progress, and Progress Roll actions.
//
// Storage: flags on a dedicated JournalEntry ('Starforged Progress Tracks').
// Connection tracks with an entityId are written-through to connection.js data;
// this panel is the display surface, not an independent source of truth for them.
//
// Output path (Foundry): modules/starforged-companion/src/ui/progressTracks.js

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

import { createClock, retireClock, removeClock, clocksFingerprint } from '../clocks/clocks.js';
import { requestGmAction } from '../multiplayer/gmRelay.js';
import { isTrackPosition, combatPositionFor } from '../moves/combat.js';
import { resolveUserActorId } from '../multiplayer/speaker.js';
import { replaceKeepingInput } from './keepTypedInput.js';
import { settledWithin, WORLD_WRITE_WAIT_MS } from '../multiplayer/settleWithin.js';

/**
 * A track's label (or any text) for HTML: a name holding markup — a player can
 * Add a track named with an `img` and an onerror handler — ran in every client
 * that opened the panel, the GM's included (issue #325 W26).
 */
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const MODULE_ID = 'starforged-companion';
const JOURNAL_NAME = 'Starforged Progress Tracks';
const FLAG_KEY = 'tracks';

const BOXES = 10;
const TICKS_PER_BOX = 4;
const MAX_TICKS = BOXES * TICKS_PER_BOX; // 40

/**
 * Rank configuration.
 * ticksPerMark: how many ticks a single Mark Progress action adds.
 *   Troublesome  +3 boxes = +12 ticks
 *   Dangerous    +2 boxes = +8 ticks
 *   Formidable   +1 box  = +4 ticks
 *   Extreme      +2 ticks
 *   Epic         +1 tick
 */
const RANKS = {
  troublesome: { label: 'Troublesome', ticksPerMark: 12, cssClass: 'rank-troublesome' },
  dangerous:   { label: 'Dangerous',   ticksPerMark: 8,  cssClass: 'rank-dangerous'   },
  formidable:  { label: 'Formidable',  ticksPerMark: 4,  cssClass: 'rank-formidable'  },
  extreme:     { label: 'Extreme',     ticksPerMark: 2,  cssClass: 'rank-extreme'     },
  epic:        { label: 'Epic',        ticksPerMark: 1,  cssClass: 'rank-epic'        },
};

const TRACK_TYPES = {
  vow:             'Vow',
  expedition:      'Expedition',
  connection:      'Connection',
  combat:          'Combat',
  scene_challenge: 'Scene Challenge',
};

// Vows and connections have homes on the character sheet and connections tab;
// the panel shows only the track types with no dedicated sheet panel.
const PANEL_TRACK_TYPES = {
  combat:          'Combat',
  expedition:      'Expedition',
  scene_challenge: 'Scene Challenge',
};

// ---------------------------------------------------------------------------
// ProgressTrack data model (plain object, persisted in journal flags)
// ---------------------------------------------------------------------------

/**
 * Create a new track record.
 * @param {object} data
 * @param {string} data.label       Display name (e.g. "Find the Beacon", "Ember Constant")
 * @param {'vow'|'expedition'|'connection'|'combat'} data.type
 * @param {'troublesome'|'dangerous'|'formidable'|'extreme'|'epic'} data.rank
 * @param {string|null} [data.entityId]  Links to a connection.js entity when type === 'connection'
 * @param {string|null} [data.objective]  The concrete goal of this track (e.g. a fight's objective)
 * @param {string|null} [data.linkedVowName]  For a combat track, the vow statement it serves (#241)
 * @param {object|null} [data.reward]  The promised reward { description, form, proposedBy, status } (#241, Phase 2)
 * @returns {object}
 */
function createTrack({ label, type, rank, entityId = null, objective = null, linkedVowName = null, reward = null }) {
  return {
    id: foundry.utils.randomID(),
    label,
    type,
    rank,
    ticks: 0,       // 0–40
    completed: false,
    entityId,
    objective,        // concrete goal stated up front (#241)
    linkedVowName,    // combat → vow link (#241)
    reward,           // promised concrete reward (#241, populated in Phase 2)
    createdAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Journal helpers
// ---------------------------------------------------------------------------

/**
 * The dedicated progress-track JournalEntry, or null: the journal carrying
 * the tracks flag — what a GM's rename in the sidebar leaves alone — else,
 * one no track was saved to yet, the journal of its name. Every reader and
 * writer found it by its name alone, so a renamed journal hid every open
 * fight, expedition and scene challenge, and the next track write made a
 * second, empty journal beside it (issue #345 AA62; rules/reachability.md
 * §6). interpreter.js readOpenTrackLabels reads it the same way.
 *
 * A world that defect already split holds two journals carrying the flag —
 * the renamed one and the default-named one the next track write made, which
 * every session since read and wrote: the one still carrying the default name
 * wins, as v1.8.0 read it, never the older renamed one collection order puts
 * first (issue #347 AB16). At the canonical GM's load a card offers the GMs
 * a merge of the tracks the other copies hold that this one lacks
 * (tracksJournalCopies, mergeTracksIntoLive → world/journalSplitMerge.js —
 * issue #347 residual TRACKS-JOURNAL-SPLIT-NOT-MERGED).
 *
 * @returns {JournalEntry|null}
 */
function findTracksJournal() {
  const flagged = (j) => Array.isArray(j?.getFlag?.(MODULE_ID, FLAG_KEY));
  return game.journal?.find?.(j => flagged(j) && j?.name === JOURNAL_NAME)
      ?? game.journal?.find?.(flagged)
      ?? game.journal?.find?.(j => j?.name === JOURNAL_NAME)
      ?? null;
}

/**
 * Return the dedicated progress-track JournalEntry, creating it if absent.
 * The journal is created hidden (ownership: NONE for players, OWNER for GM).
 * @returns {Promise<JournalEntry>}
 */
async function getOrCreateJournal() {
  let journal = findTracksJournal();
  if (!journal) {
    journal = await JournalEntry.create({
      name: JOURNAL_NAME,
      ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE },
    });
  }
  return journal;
}

/**
 * Read all tracks from the journal flags — a copy. `getFlag` returns this
 * client's cached value, and every writer here changes what it loaded before
 * saving: in place, a save the world refused left its change in the cache,
 * shown as landed and written by the next save of any track (issue #315 S08).
 * Never creates the journal — no journal means no tracks — so any client may
 * read: the panel renders on players' clients, which cannot create it
 * (issue #321 U05). Only a write creates it.
 * @returns {Promise<object[]>}
 */
async function loadTracks() {
  const journal = findTracksJournal();
  return foundry.utils.deepClone(journal?.getFlag(MODULE_ID, FLAG_KEY) ?? []);
}

// The tail of this client's track writes (never rejects).
let _writeTail = Promise.resolve();

/**
 * Change the tracks: `change(tracks)` gets a fresh copy of the stored list
 * and returns the list to save, or null to save nothing. Creates the journal
 * on the first write. GM-only (journal write).
 *
 * Every write on this client goes through here, one at a time: each reads the
 * list only once the write before it has landed. The tracks are one array in
 * one flag, saved whole, and Foundry updates the client's document only when
 * the server answers — so a write that read during another's round trip saved
 * the old list over it: two quick + clicks marked once, and a + racing the
 * move pipeline's position write lost one of the two (issue #321 U57). A
 * write that fails does not hold up the next. `change` must not call another
 * track writer: it would wait for itself.
 *
 * Bounded (issue #347 TRACK-QUEUE-UNBOUNDED-IN-LOCK): the write ahead is
 * waited on, and each of this write's own world writes (the journal's
 * creation, the save), for at most WORLD_WRITE_WAIT_MS. The queue is awaited
 * inside the move lock — a move's progress mark, a fight's position — and a
 * write whose answer was lost with the connection never settled: the table's
 * lock was held for good. A save not answered in time rejects, as a refused
 * one does; if it lands later, the cache takes it then.
 *
 * @param {(tracks: object[]) => (object[]|null|Promise<object[]|null>)} change
 * @returns {Promise<void>}
 */
function writeTracks(change) {
  const run = settledWithin(_writeTail, WORLD_WRITE_WAIT_MS, 'a Progress Tracks write ahead of this one').then(async () => {
    const journal = await answeredWithin(getOrCreateJournal(), "the Progress Tracks journal's creation");
    const tracks  = foundry.utils.deepClone(journal.getFlag(MODULE_ID, FLAG_KEY) ?? []);
    const next    = await change(tracks);
    if (Array.isArray(next)) await answeredWithin(journal.setFlag(MODULE_ID, FLAG_KEY, next), 'a Progress Tracks save');
  });
  _writeTail = run.catch(() => {});
  return run;
}

/**
 * `promise`'s value once it settles within WORLD_WRITE_WAIT_MS — a world write
 * of writeTracks'; one not answered by then throws, as a refused write does.
 *
 * @param {Promise<*>} promise
 * @param {string} label
 * @returns {Promise<*>}
 */
async function answeredWithin(promise, label) {
  if (!(await settledWithin(promise, WORLD_WRITE_WAIT_MS, label))) {
    throw new Error(`${label} was not answered — it may not have been saved`);
  }
  return promise;
}

/**
 * The live Progress Tracks journal (findTracksJournal's pick) and the other
 * journals carrying the tracks flag — a split world's copies (issue #347
 * AB16) — less a copy a merge already retired (`journalMerged`). For the
 * GM-confirmed merge at load (world/journalSplitMerge.js — issue #347
 * residual TRACKS-JOURNAL-SPLIT-NOT-MERGED).
 *
 * @returns {{ live: JournalEntry|null, copies: JournalEntry[] }}
 */
export function tracksJournalCopies() {
  const live = findTracksJournal();
  const flagged = (j) => Array.isArray(j?.getFlag?.(MODULE_ID, FLAG_KEY));
  const copies = (game.journal?.contents ?? [])
    .filter(j => flagged(j) && j !== live && !j?.getFlag?.(MODULE_ID, 'journalMerged'));
  return { live: flagged(live) ? live : null, copies };
}

/**
 * Add to the live journal's tracks each of `tracks` whose id it lacks — a
 * split copy's, through the write queue like every track write. GM-only.
 *
 * @param {object[]} tracks
 * @returns {Promise<number>} how many were added
 */
export async function mergeTracksIntoLive(tracks) {
  let added = 0;
  await writeTracks((list) => {
    const ids = new Set(list.map(t => t?.id).filter(Boolean));
    const extra = (Array.isArray(tracks) ? tracks : []).filter(t => t?.id && !ids.has(t.id));
    added = extra.length;
    return added ? [...list, ...foundry.utils.deepClone(extra)] : null;
  });
  return added;
}

/**
 * Change one track by id: `change(track)` edits it in place, or returns false
 * to save nothing. The track as saved; null when there is none by that id or
 * the change declined.
 *
 * @param {string} trackId
 * @param {(track: object) => (boolean|void|Promise<boolean|void>)} change
 * @returns {Promise<object|null>}
 */
async function updateTrack(trackId, change) {
  let updated = null;
  await writeTracks(async (tracks) => {
    const track = tracks.find(t => t.id === trackId);
    if (!track || (await change(track)) === false) return null;
    updated = track;
    return tracks;
  });
  return updated;
}

/** Ticks one Mark Progress adds to a track, by its rank. */
function ticksPerMark(track) {
  return RANKS[track?.rank]?.ticksPerMark ?? 4;
}

// ---------------------------------------------------------------------------
// Scene challenges' paired clocks
// ---------------------------------------------------------------------------
//
// A scene challenge is a progress track paired with a tension clock
// (`tensionClockId`, created with the track). The scene ends when either
// fills — so a completed challenge's clock is done too. Completing the track
// only archived the track, and Pay the Price kept advancing the clock as an
// active danger, posting cards that named the finished challenge (issue #316
// T03). Completion retires the clock (kept for the record); removing the
// track removes its clock with it. Both run BEFORE the track write and are
// idempotent, so a refused track save leaves only the save to redo, and a
// refused clock write changes nothing — the press is the retry.

/** Retire a scene challenge's paired clock. No-op for any other track. */
async function retirePairedClock(track) {
  if (track?.type !== 'scene_challenge' || !track.tensionClockId) return;
  await retireClock(track.tensionClockId);
}

/** Remove a scene challenge's paired clock. No-op for any other track. */
async function removePairedClock(track) {
  if (track?.type !== 'scene_challenge' || !track.tensionClockId) return;
  await removeClock(track.tensionClockId);
}

/** The panel's word when a paired clock write is refused: nothing changed; press again. */
function warnPairedClock(what, err) {
  console.warn(`${MODULE_ID} | ${what}: the scene challenge's paired clock write failed — nothing changed:`, err?.message ?? err);
  ui?.notifications?.warn?.(`Starforged Companion: the scene challenge's danger clock could not be ${what === 'removeTrack' ? 'removed' : 'retired'} — nothing was changed. Try again.`);
}

// ---------------------------------------------------------------------------
// Progress Roll logic (Starforged rules)
// ---------------------------------------------------------------------------

/**
 * Which move a panel Progress Roll resolves through the move pipeline. A
 * scene challenge's is Finish the Scene (Starforged p. 241): it rolled a
 * bespoke display card that asked no price, flagged no match and left the
 * challenge open (issue #326 D6). Exported for tests.
 */
export const TRACK_TYPE_TO_MOVE = {
  combat:          'take_decisive_action',
  expedition:      'finish_an_expedition',
  scene_challenge: 'finish_the_scene',
};

/** The line a Progress Roll posts for the pipeline, per move. */
const PROGRESS_ROLL_LINES = {
  take_decisive_action: (label) => `Take decisive action — ${label}.`,
  finish_an_expedition: (label) => `Attempt to finish the expedition — ${label}.`,
  finish_the_scene:     (label) => `Finish the scene — ${label}.`,
};

/**
 * True when the move pipeline will accept a forced-move bridge message right
 * now: pipeline entry is gated on an active session (index.js session-active
 * gate), so a pre-session bridge post would be silently ignored. Fails toward
 * the always-works display roll.
 */
async function movePipelineAvailable() {
  try {
    const { isSessionActive } = await import('../session/lifecycle.js');
    return isSessionActive(game.settings.get(MODULE_ID, 'campaignState'));
  } catch {
    return false;
  }
}

/**
 * Whether a track's ⬡ Progress Roll can be made: once it has progress — and a
 * scene challenge also once its tension clock is full, progress or none.
 * Finish the Scene is "When the scene challenge tension clock or progress
 * track is filled … roll the challenge dice and compare to your progress": at
 * no progress a certain miss, and Pay the Price. The 0-tick guard (from the
 * display-roll era) left the ⬡ dead exactly then, and the table's ✓ ended the
 * challenge with no move and no price (issue #345 AA68). Every other track
 * keeps it: a zero-progress Take Decisive Action is the trap the Enter the
 * Fray card leaves off, and a challenge whose clock is not full is not due.
 *
 * @param {object} track
 * @param {{ filled?: number, segments?: number }|null} tensionClock — the
 *   challenge's paired clock as stored, or null
 * @returns {boolean}
 */
function canRollProgress(track, tensionClock) {
  if ((track?.ticks ?? 0) > 0) return true;
  if (track?.type !== 'scene_challenge' || !tensionClock) return false;
  const segments = Number(tensionClock.segments) || 0;
  return segments > 0 && (Number(tensionClock.filled) || 0) >= segments;
}

/**
 * Execute a Progress Roll for a track.
 *
 * Each track type's roll is a real Starforged progress move with pipeline
 * consequences (Take Decisive Action → endCombat → victory card / linked-vow
 * milestone; Finish an Expedition → legacy + arrival; Finish the Scene → the
 * challenge and its clock end, a weak hit or miss pays the price — issue
 * #326 D6), so during an active session they route through the forced-move
 * bridge and the move pipeline rolls, narrates, and applies consequences. The
 * bespoke card below looked right but had no consumer — a "won" fight never
 * actually ended. Pre-session rolls keep the instant display roll:
 * Score = number of fully filled boxes (ticks / 4, floored).
 * Roll 2d10 challenge dice. Compare score against each:
 *   Strong Hit  — score > both dice
 *   Weak Hit    — score > one die
 *   Miss        — score ≤ both dice
 * Posts a chat message matching the module's existing move card format.
 *
 * Exported so Quench can drive it.
 *
 * @param {object} track
 */
export async function rollProgress(track) {
  const moveId = TRACK_TYPE_TO_MOVE[track.type];
  if (moveId && await movePipelineAvailable()) {
    const content = PROGRESS_ROLL_LINES[moveId](track.label);
    await ChatMessage.create({
      content,
      // The row's own id (and label): tick enrichment, scoring and completion
      // act on exactly the track clicked — a label alone took the first
      // same-named track (issue #306 R06).
      flags: { [MODULE_ID]: { bypassPacing: true, forcedMoveId: moveId, forcedMoveTarget: track.label, forcedMoveTargetId: track.id } },
    });
    return;
  }

  const score = Math.floor(track.ticks / TICKS_PER_BOX);
  const c1 = Math.ceil(Math.random() * 10);
  const c2 = Math.ceil(Math.random() * 10);

  let outcome, outcomeClass;
  if (score > c1 && score > c2) {
    outcome = 'Strong Hit';
    outcomeClass = 'outcome-strong';
  } else if (score > c1 || score > c2) {
    outcome = 'Weak Hit';
    outcomeClass = 'outcome-weak';
  } else {
    outcome = 'Miss';
    outcomeClass = 'outcome-miss';
  }

  const rankLabel = RANKS[track.rank]?.label ?? track.rank;

  const html = `
    <div class="starforged-move-card progress-roll-card">
      <div class="move-header">
        <span class="move-type">Progress Roll</span>
        <span class="move-name">${escapeHtml(track.label)}</span>
      </div>
      <div class="move-body">
        <div class="progress-roll-detail">
          <span class="roll-label">Score</span>
          <span class="roll-value">${score}</span>
          <span class="roll-label">vs</span>
          <span class="roll-value challenge">${c1}</span>
          <span class="roll-sep">/</span>
          <span class="roll-value challenge">${c2}</span>
        </div>
        <div class="move-outcome ${outcomeClass}">${outcome}</div>
        <div class="roll-meta">${rankLabel} · ${score} of ${BOXES} boxes filled</div>
      </div>
    </div>
  `.trim();

  await ChatMessage.create({
    content: html,
    flags: {
      [MODULE_ID]: {
        type: 'progressRoll',
        trackId: track.id,
        trackLabel: track.label,
        score,
        challengeDice: [c1, c2],
        outcome,
      },
    },
  });
}

// ---------------------------------------------------------------------------
// ApplicationV2 panel
// ---------------------------------------------------------------------------

const { ApplicationV2, DialogV2 } = foundry.applications.api;

export class ProgressTrackApp extends ApplicationV2 {

  // Singleton instance — open() returns the existing one if already rendered.
  static #instance = null;

  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-progress-tracks`,
    classes: [MODULE_ID, 'progress-tracks', 'sf-window'],
    tag: 'div',
    window: {
      title: 'Progress Tracks',
      resizable: true,
      minimizable: true,
    },
    position: {
      width: 500,
      height: 'auto',
    },
    actions: {
      markProgress:        ProgressTrackApp.#onMarkProgress,
      clearProgress:       ProgressTrackApp.#onClearProgress,
      rollProgress:        ProgressTrackApp.#onRollProgress,
      removeTrack:         ProgressTrackApp.#onRemoveTrack,
      addTrack:            ProgressTrackApp.#onAddTrack,
      completeTrack:       ProgressTrackApp.#onCompleteTrack,
      toggleCombatState:   ProgressTrackApp.#onToggleCombatState,
    },
  };

  /**
   * Open the singleton panel, or bring it to front if already open.
   * @returns {ProgressTrackApp}
   */
  static open() {
    if (!ProgressTrackApp.#instance) {
      ProgressTrackApp.#instance = new ProgressTrackApp();
    }
    ProgressTrackApp.#instance.render({ force: true });
    return ProgressTrackApp.#instance;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /** @override */
  async _prepareContext(_options) {
    const tracks = await loadTracks();

    // For scene-challenge tracks, also surface the paired tension clock's
    // current state so the player can see both progress + danger in one row.
    const campaignState = game.settings.get(MODULE_ID, 'campaignState') ?? {};
    const clockById     = new Map((campaignState.clocks ?? []).map(c => [c._id, c]));
    // What this render shows, for onSettingChanged to compare against.
    this._clocksShown   = clocksFingerprint(campaignState.clocks ?? []);
    // A fight's position badge shows the viewer's own position — the one its
    // press cycles (viewerCharacter). It showed the fight's last-set one, so
    // in a two-character fight a player saw a crewmate's bad spot as theirs,
    // and pressing it to put that right flipped their own (issue #345 AA64).
    const viewer        = viewerCharacter(campaignState);

    // Annotate each track with derived display values.
    const annotated = tracks.map(t => {
      const linkedClock = t.tensionClockId ? clockById.get(t.tensionClockId) : null;
      return {
        ...t,
        rankLabel: RANKS[t.rank]?.label ?? t.rank,
        rankClass: RANKS[t.rank]?.cssClass ?? '',
        typeLabel: TRACK_TYPES[t.type] ?? t.type,
        filledBoxes: Math.floor(t.ticks / TICKS_PER_BOX),
        ticksInPartialBox: t.ticks % TICKS_PER_BOX,
        pct: Math.round((t.ticks / MAX_TICKS) * 100),
        boxes: ProgressTrackApp.#buildBoxes(t.ticks),
        canRoll: canRollProgress(t, linkedClock),
        // 'in_control' | 'bad_spot' | null — a fight's, the viewer's own
        combatState: t.type === 'combat' ? combatPositionFor(t, viewer?.id ?? null) : (t.combatState ?? null),
        positionOf:  viewer?.name ?? null,
        tensionClock: linkedClock
          ? { filled: linkedClock.filled, segments: linkedClock.segments,
              triggered: linkedClock.filled >= linkedClock.segments }
          : null,
      };
    });

    // Panel shows only combat, expeditions, and scene challenges — vows and
    // connections live on the character sheet and connections tab respectively.
    const panelVisible = annotated.filter(t => t.type in PANEL_TRACK_TYPES);

    const active    = panelVisible.filter(t => !t.completed);
    const completed = panelVisible.filter(t => t.completed);

    return { active, completed, rankOptions: RANKS, typeOptions: PANEL_TRACK_TYPES };
  }

  /** @override */
  async _renderHTML(context, _options) {
    const { active, completed, rankOptions, typeOptions } = context;

    const renderTrack = (t) => `
      <div class="track-row ${t.rankClass} ${t.completed ? 'is-completed' : ''}"
           data-track-id="${t.id}">
        <div class="track-header">
          <div class="track-labels">
            <span class="track-name">${escapeHtml(t.label)}</span>
            <span class="track-meta">${t.typeLabel} · ${t.rankLabel}</span>
          </div>
          <div class="track-actions">
            ${!t.completed ? `
              <button class="track-btn btn-mark" data-action="markProgress"
                      data-track-id="${t.id}" title="Mark Progress">
                +
              </button>
              <button class="track-btn btn-clear" data-action="clearProgress"
                      data-track-id="${t.id}" title="Clear One Box">
                −
              </button>
              <button class="track-btn btn-roll" data-action="rollProgress"
                      data-track-id="${t.id}" title="Progress Roll"
                      ${t.canRoll ? '' : 'disabled'}>
                ⬡
              </button>
              <button class="track-btn btn-complete" data-action="completeTrack"
                      data-track-id="${t.id}" title="Mark Complete">
                ✓
              </button>
            ` : ''}
            <button class="track-btn btn-remove" data-action="removeTrack"
                    data-track-id="${t.id}" title="Remove Track">
              ✕
            </button>
          </div>
        </div>
        <div class="track-boxes" aria-label="Progress: ${t.filledBoxes} of ${BOXES} boxes">
          ${t.boxes.map((box, i) => `
            <div class="track-box box-${box.ticks}" aria-label="Box ${i + 1}: ${box.ticks} ticks">
              ${ProgressTrackApp.#renderBoxSVG(box.ticks)}
            </div>
          `).join('')}
        </div>
        <div class="track-footer">
          <span class="track-pct">${t.pct}%</span>
          <span class="track-ticks">${t.ticks} / ${MAX_TICKS} ticks</span>
          ${t.type === 'combat' && !t.completed ? `
            <button class="track-btn btn-combat-state combat-${t.combatState ?? 'neutral'}"
                    data-action="toggleCombatState"
                    data-track-id="${t.id}"
                    title="Toggle ${t.positionOf ? `${escapeHtml(t.positionOf)}&rsquo;s` : 'the fight&rsquo;s'} combat position (in control / in a bad spot)">
              ${t.combatState === 'in_control' ? 'In control'
                : t.combatState === 'bad_spot' ? 'In a bad spot'
                : 'Neutral'}
            </button>
          ` : ''}
          ${t.tensionClock ? `
            <span class="tension-clock-meta${t.tensionClock.triggered ? ' is-triggered' : ''}"
                  title="Linked tension clock — advance via !clock advance &quot;${escapeHtml(t.label)}&quot;">
              Tension: ${t.tensionClock.filled}/${t.tensionClock.segments}${t.tensionClock.triggered ? ' ⚠' : ''}
            </span>
          ` : ''}
        </div>
      </div>
    `;

    const rankOpts = Object.entries(rankOptions)
      .map(([k, v]) => `<option value="${k}">${v.label}</option>`)
      .join('');
    const typeOpts = Object.entries(typeOptions)
      .map(([k, v]) => `<option value="${k}">${v}</option>`)
      .join('');

    const html = `
      <div class="sf-progress-panel">
        <section class="add-track-section">
          <div class="add-track-fields">
            <input  class="track-input" name="newLabel" type="text"
                    placeholder="Track name…" maxlength="60" />
            <select class="track-select" name="newType">${typeOpts}</select>
            <select class="track-select" name="newRank">${rankOpts}</select>
            <button class="track-btn btn-add" data-action="addTrack" title="Add Track">
              Add
            </button>
          </div>
        </section>

        <section class="tracks-section active-tracks">
          ${active.length
            ? active.map(renderTrack).join('')
            : '<p class="empty-state">No active combat, expedition, or scene challenge tracks.</p>'
          }
        </section>

        ${completed.length ? `
          <details class="completed-section">
            <summary>Completed (${completed.length})</summary>
            ${completed.map(renderTrack).join('')}
          </details>
        ` : ''}
      </div>
    `;

    // ApplicationV2 expects a DocumentFragment or Element from _renderHTML.
    const tmp = document.createElement('div');
    tmp.innerHTML = html.trim();
    return tmp.firstElementChild;
  }

  /** @override */
  _replaceHTML(result, content, _options) {
    // Replace inner content without destroying the window chrome — keeping
    // the add form's typed name, type and rank across a hook's re-render
    // (issue #337 Y45).
    replaceKeepingInput(content, result, { fields: '.add-track-fields [name]' });
  }

  // -----------------------------------------------------------------------
  // Foundry hook — live refresh when journal flags change
  // -----------------------------------------------------------------------

  /**
   * Register the updateJournalEntry hook so the panel refreshes whenever
   * progress is modified from outside (e.g. connection.js sync).
   * Called once from module init.
   */
  static registerHooks() {
    Hooks.on('updateJournalEntry', async (doc, change) => {
      const instance = ProgressTrackApp.#instance;
      if (!instance?.rendered) return;
      // The tracks flag is the journal's mark, whatever its name (issue #345 AA62).
      if (!foundry.utils.hasProperty(change, `flags.${MODULE_ID}.${FLAG_KEY}`)) return;
      instance.render();
    });
    Hooks.on('updateSetting', ProgressTrackApp.onSettingChanged);
    Hooks.on('createSetting', ProgressTrackApp.onSettingChanged);
  }

  /**
   * campaignState setting hook: a scene challenge's "Tension: n/4" line is its
   * paired clock, stored in campaignState, so an open panel re-renders when
   * the clocks it showed changed — a Pay the Price, `!clock` or another GM's
   * advance left the line stale (issue #322 V12). Local to this client.
   *
   * @param {{ key?: string }} setting — the Setting document
   */
  static onSettingChanged(setting) {
    if (setting?.key !== `${MODULE_ID}.campaignState`) return;
    const instance = ProgressTrackApp.#instance;
    if (!instance?.rendered) return;
    let clocks = [];
    try { clocks = game.settings.get(MODULE_ID, 'campaignState')?.clocks ?? []; } catch { return; }
    if (clocksFingerprint(clocks) === instance._clocksShown) return;
    instance.render();
  }

  // -----------------------------------------------------------------------
  // Action handlers (static — bound via DEFAULT_OPTIONS.actions)
  //
  // Each handler records its in-flight promise on `this._lastAction` so that
  // integration tests can await the full async chain after dispatching a real
  // DOM click event. ApplicationV2's action dispatcher invokes handlers
  // fire-and-forget, so without this hook there is no way for a test to wait
  // for multi-step persistence (DialogV2.confirm → the GM's write) to settle
  // before re-reading state.
  //
  // The panel is on every user's toolbar, but the tracks journal is the GM's
  // document: every edit is asked of the canonical GM (#requestEdit →
  // "progressTrack.edit", applyProgressTrackEditFromRelay), which runs it
  // locally on that GM and is relayed from anyone else (issue #321 U05). A
  // player's click used to write the journal directly and was refused.
  // -----------------------------------------------------------------------

  /**
   * Ask the canonical GM for one track edit, then re-render. Nothing is
   * swallowed: with no GM connected requestGmAction has warned; a refusal the
   * canonical GM's own click gets back is shown; a write that throws is
   * reported. (A relayed edit is fire-and-forget: it lands — and every open
   * panel re-renders — when the GM's write reaches the journal.)
   *
   * @returns {Promise<boolean>} false when the edit was not made — no GM is
   *   connected, the canonical GM declined it, or its write threw; true when
   *   it was made or relayed (a relayed edit's answer never comes back)
   */
  static async #requestEdit(app, edit) {
    let made = false;
    try {
      const res = await requestGmAction('progressTrack.edit', edit);
      const reason = res?.result?.applied === false ? res.result.reason : null;
      // A paired-clock refusal was already explained by warnPairedClock.
      if (reason && reason !== 'clock') {
        ui.notifications?.warn?.(`Starforged Companion: ${EDIT_REFUSAL_TEXT[reason] ?? 'the track was not changed.'}`);
      }
      made = res?.ok !== false && res?.result?.applied !== false;
    } catch (err) {
      console.error(`${MODULE_ID} | progress track "${edit.op}" failed:`, err);
      ui.notifications?.error?.('Starforged Companion: the progress track change could not be saved — see the console.');
    }
    app.render();
    return made;
  }

  /**
   * Mark progress on a track (adds the rank's ticks per mark, capped at MAX_TICKS).
   * @param {PointerEvent} event
   * @param {HTMLElement}  target
   */
  static #onMarkProgress(event, target) {
    const work = ProgressTrackApp.#requestEdit(this, { op: 'mark', trackId: target.dataset.trackId });
    this._lastAction = work;
    return work;
  }

  /**
   * Clear one box of progress (removes TICKS_PER_BOX ticks, min 0).
   */
  static #onClearProgress(event, target) {
    const work = ProgressTrackApp.#requestEdit(this, { op: 'clear', trackId: target.dataset.trackId });
    this._lastAction = work;
    return work;
  }

  /**
   * Execute a progress roll for this track and post a chat card.
   */
  static #onRollProgress(event, target) {
    const work = (async () => {
      const trackId = target.dataset.trackId;
      const tracks = await loadTracks();
      const track = tracks.find(t => t.id === trackId);
      if (!track) return;
      const clock = track.tensionClockId
        ? ((game.settings.get(MODULE_ID, 'campaignState') ?? {}).clocks ?? []).find(c => c?._id === track.tensionClockId) ?? null
        : null;
      if (!canRollProgress(track, clock)) {
        console.debug(`${MODULE_ID} | progress roll: "${track.label}" has no progress to roll yet — not rolled.`);
        return;
      }
      await rollProgress(track);
    })();
    this._lastAction = work;
    return work;
  }

  /**
   * Complete a track. Completed tracks are moved to the archive section but
   * kept for campaign record-keeping. A scene challenge's paired tension
   * clock is retired with it (issue #316 T03).
   */
  static #onCompleteTrack(event, target) {
    const work = ProgressTrackApp.#requestEdit(this, { op: 'complete', trackId: target.dataset.trackId });
    this._lastAction = work;
    return work;
  }

  /**
   * Cycle a combat track's position: neutral → in_control → bad_spot → neutral.
   * Per play kit p. 5, combat moves write this automatically on resolution;
   * the toggle here lets the player correct it manually. The clicker's own
   * character's sheet and combat-tracker badge follow the track (U19). The
   * clicker's PC is resolved as everywhere else (resolveUserActorId): it was
   * `User#character`, null for a GM with none assigned (the usual solo
   * setup), so the toggle cycled the fight's last-set position while the
   * roller's own — which every reader has preferred since issue #322 V03 —
   * kept steering the next move (issue #326 W56).
   */
  static #onToggleCombatState(event, target) {
    let actorId = null;
    try {
      actorId = resolveUserActorId(game.user, game.settings.get(MODULE_ID, 'campaignState'));
    } catch { actorId = game.user?.character?.id ?? null; }
    const work = ProgressTrackApp.#requestEdit(this, {
      op: 'position', trackId: target.dataset.trackId, actorId,
    });
    this._lastAction = work;
    return work;
  }

  /**
   * Remove a track permanently, once the clicker confirms (the dialog opens on
   * their screen). A scene challenge's paired tension clock goes with it
   * (issue #316 T03).
   */
  static #onRemoveTrack(event, target) {
    const work = (async () => {
      const trackId = target.dataset.trackId;
      const track = (await loadTracks()).find(t => t.id === trackId);
      if (!track) return;

      const confirmed = await DialogV2.confirm({
        window:  { title: 'Remove Track' },
        content: `<p>Permanently remove <strong>${escapeHtml(track.label)}</strong>?${track.type === 'scene_challenge' && track.tensionClockId ? ' Its danger clock goes with it.' : ''} This cannot be undone.</p>`,
      });
      if (!confirmed) return;

      await ProgressTrackApp.#requestEdit(this, { op: 'remove', trackId });
    })();
    this._lastAction = work;
    return work;
  }

  /**
   * Add a new track from the input fields at the top of the panel. The GM
   * creates it — and a scene challenge's paired clock (addProgressTrack).
   * The name is cleared at the press, so a second press while the add is in
   * flight adds nothing twice; an add that was not made gives the form back
   * what was submitted (known-issues TRACK-ADD-REFUSED-LOSES-NAME — the
   * typed name was lost).
   */
  static #onAddTrack(_event, _target) {
    const work = (async () => {
      const panel = this.element.querySelector('.sf-progress-panel');
      const labelInput = panel.querySelector('[name="newLabel"]');
      const typeSelect = panel.querySelector('[name="newType"]');
      const rankSelect = panel.querySelector('[name="newRank"]');

      const label = labelInput.value.trim();
      if (!label) {
        labelInput.focus();
        return;
      }

      const submitted = { newLabel: labelInput.value, newType: typeSelect.value, newRank: rankSelect.value };
      labelInput.value = '';
      const made = await ProgressTrackApp.#requestEdit(this, {
        op: 'add', label, type: submitted.newType, rank: submitted.newRank,
      });
      if (!made) ProgressTrackApp.#restoreAddForm(this, submitted);
    })();
    this._lastAction = work;
    return work;
  }

  /**
   * Put an add that was not made back in the form — on the live form (the
   * panel's re-render may already have replaced the one pressed; Y45's
   * replaceKeepingInput carries the values either way), and only while its
   * name is still empty: a name typed since is another entry, and is kept.
   *
   * @param {ProgressTrackApp} app
   * @param {{ newLabel: string, newType: string, newRank: string }} submitted
   */
  static #restoreAddForm(app, submitted) {
    const panel = app.element?.querySelector?.('.sf-progress-panel');
    const name  = panel?.querySelector?.('[name="newLabel"]');
    if (!name || name.value.trim()) return;
    for (const [field, value] of Object.entries(submitted)) {
      const el = panel.querySelector(`[name="${field}"]`);
      if (el) el.value = value;
    }
  }

  // (The old #syncConnectionEntity hook was removed in the 2026-07 soft-spot
  // cleanup: it fired only for `type:'connection'` tracks — which nothing
  // creates — read the wrong host (`game.journal`; connections are
  // Actor-hosted post-migration), and wrote a `connection.progress` field no
  // reader consumed. Connection progress lives on the entity record's
  // `relationshipTicks`, mirrored to PC bond Items by
  // `markRelationshipProgress`.)

  // -----------------------------------------------------------------------
  // Visual helpers
  // -----------------------------------------------------------------------

  /**
   * Build the box array for a given tick total.
   * Returns 10 objects: { ticks: 0|1|2|3|4 }.
   * @param {number} totalTicks
   * @returns {{ ticks: number }[]}
   */
  static #buildBoxes(totalTicks) {
    const boxes = [];
    let remaining = Math.max(0, Math.min(totalTicks, MAX_TICKS));
    for (let i = 0; i < BOXES; i++) {
      const ticks = Math.min(remaining, TICKS_PER_BOX);
      boxes.push({ ticks });
      remaining -= ticks;
    }
    return boxes;
  }

  /**
   * Render SVG tick marks inside a box, following Ironsworn conventions:
   *   0 ticks — empty
   *   1 tick  — single diagonal (top-left to bottom-right)
   *   2 ticks — cross (both diagonals)
   *   3 ticks — cross + horizontal midline
   *   4 ticks — filled square
   *
   * @param {number} ticks  0–4
   * @returns {string}  SVG string
   */
  static #renderBoxSVG(ticks) {
    const lines = [];
    if (ticks >= 1) lines.push('<line x1="2" y1="2" x2="18" y2="18"/>');   // \ diagonal
    if (ticks >= 2) lines.push('<line x1="18" y1="2" x2="2" y2="18"/>');   // / diagonal
    if (ticks === 3) lines.push('<line x1="1" y1="10" x2="19" y2="10"/>'); // — midline
    const fill = ticks === 4 ? '<rect x="1" y="1" width="18" height="18" class="box-fill"/>' : '';
    return `
      <svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"
           class="tick-svg tick-${ticks}" aria-hidden="true">
        ${fill}
        ${lines.join('\n        ')}
      </svg>
    `.trim();
  }
}

// ---------------------------------------------------------------------------
// Public API — used by index.js and other ui modules
// ---------------------------------------------------------------------------

/**
 * Open the progress track panel.
 * Called from the PTT button or a chat command hook.
 * @returns {ProgressTrackApp}
 */

/**
 * A combat position, read for a character: the move pipeline's interpreter
 * directive (only position-legal combat moves) and Take Decisive Action's
 * bad-spot downgrade (play kit p. 5: "if you are in a bad spot, count a
 * strong hit without a match as a weak hit, and a weak hit as a miss").
 *
 * Position is per character (rulebook, Battle Stations!; decisions.md): each
 * open fight keeps its characters' own positions (`positions[actorId]`,
 * written with the fight's by setCombatTrackPosition). The character's own —
 * one position across the open fights that record one — comes first; the
 * fallback is the fight's last-set position (`combatState`) when exactly one
 * fight is open. One character's bad spot turned another's Strike into Clash
 * and downgraded their Take Decisive Action (issue #322 V03). Null out of
 * combat, or when it cannot be told which fight applies.
 *
 * @param {string|null} [actorId] — the roller; none reads the fight's alone
 * @returns {Promise<"in_control"|"bad_spot"|null>}
 */
export async function getActiveCombatPosition(actorId = null) {
  try {
    const journal = findTracksJournal();
    if (!journal) return null;
    const tracks = journal.getFlag(MODULE_ID, FLAG_KEY) ?? [];
    const combatTracks = tracks.filter(t => t.type === 'combat' && !t.completed);
    if (actorId) {
      const own = new Set(combatTracks.map(t => t.positions?.[actorId]).filter(isTrackPosition));
      if (own.size === 1) return [...own][0];
    }
    if (combatTracks.length !== 1) return null;
    const state = combatTracks[0].combatState;
    return isTrackPosition(state) ? state : null;
  } catch {
    return null;
  }
}


export function openProgressTracks() {
  return ProgressTrackApp.open();
}

/**
 * Return the single active (open, non-completed) combat track, or null if
 * there are zero or multiple. Used by the pipeline to route combat progress
 * marks and position writes.
 *
 * @returns {Promise<object|null>}
 */
export async function getActiveCombatTrack() {
  try {
    const journal = findTracksJournal();
    if (!journal) return null;
    const tracks = journal.getFlag(MODULE_ID, FLAG_KEY) ?? [];
    const open = tracks.filter(t => t.type === 'combat' && !t.completed);
    return open.length === 1 ? open[0] : null;
  } catch {
    return null;
  }
}

/**
 * A fight with its characters' own positions named (`characterPositions`:
 * `{ name, position }`, from `positions[actorId]`), for the narrator — one
 * fight-wide position misdescribed a crew split between control and a bad
 * spot (issue #322 V03). A character no longer in the world is left out.
 *
 * @param {object} track
 * @returns {object}
 */
function withCharacterPositions(track) {
  if (track?.type !== 'combat' || !track.positions) return track;
  const characterPositions = Object.entries(track.positions)
    .filter(([, position]) => isTrackPosition(position))
    .map(([id, position]) => ({ name: game.actors?.get?.(id)?.name ?? null, position }))
    .filter(e => typeof e.name === 'string' && e.name.trim());
  return characterPositions.length ? { ...track, characterPositions } : track;
}

/**
 * The open (not completed) fights, expeditions and scene challenges — the
 * tracks this panel lists — whole, with each fight's objective, position and
 * linked vow. For the narrator's OPEN PROGRESS TRACKS block
 * (narrator.js buildNarratorExtras). Read-only: with no journal there are no
 * tracks, and none is created, so any client may call it.
 *
 * @returns {object[]}
 */
export function listOpenProgressTracks() {
  try {
    const journal = findTracksJournal();
    const tracks  = journal?.getFlag?.(MODULE_ID, FLAG_KEY) ?? [];
    return Array.isArray(tracks)
      ? tracks.filter(t => t && !t.completed && t.type in PANEL_TRACK_TYPES).map(withCharacterPositions)
      : [];
  } catch (err) {
    console.warn(`${MODULE_ID} | listOpenProgressTracks: the Progress Tracks journal could not be read:`, err?.message ?? err);
    return [];
  }
}

/**
 * Write a combat position to a specific track: the fight's last-set position
 * (`combatState`), and — given a character — that character's own
 * (`positions[actorId]`; null clears it). Position is per character (issue
 * #322 V03): the track holds each one for the fight, so it ends with the
 * fight. Called through applyCombatPositionToTrack (combatTracker.js) by
 * every position write.
 *
 * @param {string} trackId
 * @param {'in_control'|'bad_spot'|null} position
 * @param {string|null} [actorId] — whose position it is
 * @returns {Promise<object|null>}  Updated track or null if not found
 */
export async function setCombatTrackPosition(trackId, position, actorId = null) {
  return updateTrack(trackId, (track) => {
    track.combatState = position;
    if (actorId) {
      const positions = { ...(track.positions ?? {}) };
      if (isTrackPosition(position)) positions[actorId] = position;
      else delete positions[actorId];
      track.positions = positions;
    }
  });
}

/**
 * Add a track programmatically — called from connection.js when a new
 * Connection is formalised, or from the move resolver when an Expedition begins.
 *
 * @param {object} data
 * @param {string} data.label
 * @param {'vow'|'expedition'|'connection'|'combat'} data.type
 * @param {'troublesome'|'dangerous'|'formidable'|'extreme'|'epic'} data.rank
 * @param {string|null} [data.entityId]
 * @returns {Promise<object>}  The created track record
 */
export async function addProgressTrack(data) {
  const track = createTrack(data);

  // Scene Challenge auto-creates a paired 4-segment tension clock per
  // rulebook pp. 239–241. The clock id is stored on the track for
  // back-reference. Failures are logged but don't block track creation.
  if (track.type === 'scene_challenge') {
    try {
      const clock = await createClock({ name: track.label, segments: 4, type: 'tension' });
      track.tensionClockId = clock._id;
    } catch (err) {
      console.warn(`${MODULE_ID} | addProgressTrack: scene_challenge tension-clock creation failed:`, err);
    }
  }

  try {
    await writeTracks(tracks => [...tracks, track]);
  } catch (err) {
    // A refused track write leaves the clock created for it with no track,
    // and each retry would add another (SCENE-CHALLENGE-ADD-ORPHAN-CLOCK):
    // remove it, then reject as before. A refused removal is logged — the
    // orphan stays, as it did — and the track's own refusal still rejects.
    if (track.tensionClockId) {
      await removeClock(track.tensionClockId).catch(clockErr =>
        console.warn(`${MODULE_ID} | addProgressTrack: the scene challenge's tension clock could not be removed after its track was refused:`, clockErr?.message ?? clockErr));
    }
    throw err;
  }

  // NOTE: journal `vow` tracks deliberately get NO item mirror. Vows live as
  // actor progress Items (the live store — swearVow.js creates them); the
  // old creation-time mirror here produced a second, never-tick-synced copy
  // whose staleness the 2026-07 flow audit flagged. The panel doesn't offer
  // the vow type (PANEL_TRACK_TYPES), so this path only ever runs
  // programmatically (e.g. Quench's journal-storage test).

  // Refresh the panel if it's open.
  const instance = ProgressTrackApp._ProgressTrackApp__instance;  // access private via name mangling
  if (instance?.rendered) instance.render();

  return track;
}

/**
 * List the current progress tracks for callers outside the panel — e.g. the
 * consequence-rider track picker and the expedition lifecycle (moves/expedition.js,
 * which needs `completed` + `type` to pick the open expedition track). A fight
 * keeps its position (`combatState`): Take Decisive Action's tick enrichment
 * reads the scored fight's own position for the bad-spot downgrade, and this
 * projection dropped it — with two fights open, no downgrade ever applied
 * (issue #306 R05).
 * @returns {Promise<Array<{id:string,label:string,rank:string,type:string,ticks:number,completed:boolean,combatState:("in_control"|"bad_spot"|null),positions?:Object}>>}
 */
export async function listProgressTracks() {
  const tracks = await loadTracks();
  return tracks.map(t => ({
    id: t.id, label: t.label, rank: t.rank, type: t.type, ticks: t.ticks, completed: t.completed === true,
    combatState: t.combatState ?? null,
    // Each character's own position in a fight (issue #322 V03).
    ...(t.positions ? { positions: { ...t.positions } } : {}),
  }));
}

/**
 * One track by ID, as stored — every field (`linkedVowName`, `objective`,
 * `combatState`, `completed`…), finished or not; null when none. For a caller
 * holding a track's id from a card that needs the track itself: an upgraded
 * combat move's fight (index.js applyOutcomeEffects).
 * @param {string} trackId
 * @returns {Promise<object|null>}
 */
export async function getProgressTrack(trackId) {
  if (!trackId) return null;
  const tracks = await loadTracks();
  return tracks.find(t => t.id === trackId) ?? null;
}

/**
 * Mark a track completed by ID from outside the panel (e.g. Finish an
 * Expedition). Completed tracks move to the panel's archive section but are
 * kept for the campaign record. A scene challenge's paired tension clock is
 * retired first (issue #316 T03); a refused clock write rejects before the
 * track changes. GM-only (journal write); null if not found.
 * @param {string} trackId
 * @returns {Promise<object|null>}  Updated track or null if not found
 */
export async function completeProgressTrack(trackId) {
  return updateTrack(trackId, async (track) => {
    await retirePairedClock(track);
    track.completed   = true;
    track.completedAt = Date.now();
  });
}

/**
 * Mark progress on a track by ID from outside the panel (e.g. move resolver).
 * `times` marks the rank's per-mark amount more than once — used for the #241
 * milestone scaling where a harder won fight is a bigger milestone on its vow.
 * @param {string} trackId
 * @param {number} [times=1]  Number of rank-based marks to apply (clamped ≥1)
 * @returns {Promise<object|null>}  Updated track or null if not found
 */
export async function markProgressById(trackId, times = 1) {
  return adjustProgressById(trackId, Math.max(1, Math.floor(times) || 1));
}

/**
 * Change a track's progress by `marks` rank-based marks — positive marks
 * progress, negative takes it back — within 0..40 ticks. An asset effect's
 * signed amount is counted in marks (consequence riders): +2 is two marks,
 * -1 one taken back; every amount used to mark once (issue #315 S03).
 * GM-only (journal write); null if not found.
 * @param {string} trackId
 * @param {number} marks  a whole number of marks, either sign
 * @returns {Promise<object|null>}  Updated track or null if not found
 */
export async function adjustProgressById(trackId, marks) {
  return updateTrack(trackId, (track) => {
    track.ticks = Math.max(0, Math.min(track.ticks + ticksPerMark(track) * Math.trunc(marks), MAX_TICKS));
  });
}

/**
 * Patch arbitrary fields on a track by ID from outside the panel — e.g. the
 * expedition→site link (`siteId`) at creation, or recommit's ticks/rank
 * rewrite. GM-only (journal write); null if not found.
 *
 * @param {string} trackId
 * @param {object} [patch]
 * @returns {Promise<object|null>}  Updated track or null if not found
 */
export async function updateTrackFields(trackId, patch = {}) {
  return updateTrack(trackId, (track) => { Object.assign(track, patch); });
}

// ---------------------------------------------------------------------------
// Panel edits on the canonical GM (issue #321 U05)
// ---------------------------------------------------------------------------

/** The longest track name the panel's input accepts (its maxlength). */
const MAX_LABEL_LENGTH = 60;

/** What the clicker is told when the canonical GM declines their own edit. */
const EDIT_REFUSAL_TEXT = {
  'invalid':  'the panel cannot make that change — nothing was changed.',
  'no-track': 'that track is gone or already finished — nothing was changed.',
};

/** Position toggle cycle: neutral → in control → in a bad spot → neutral. */
const NEXT_POSITION = { null: 'in_control', in_control: 'bad_spot', bad_spot: null };

const own = (table, key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key);

/** A track the panel lists: a fight, an expedition or a scene challenge. */
function isPanelTrack(track) {
  return !!track && own(PANEL_TRACK_TYPES, track.type);
}

/** An open panel track — what the +, −, ✓ and position buttons act on. */
function isOpenPanelTrack(track) {
  return isPanelTrack(track) && !track.completed;
}

/**
 * gmRelay handler for "progressTrack.edit" — runs on the canonical GM, which
 * writes the tracks journal for every user's Progress Tracks panel. The
 * journal is created `ownership: NONE`, so a player's own write was refused
 * and the click did nothing (issue #321 U05). Every user may make every
 * panel edit — the panel is on everyone's toolbar, and ✕ asks the clicker to
 * confirm first. The payload is checked against what the panel can produce:
 * +, −, ✓ act on an open fight, expedition or scene challenge, the position
 * toggle on an open fight, ✕ on any of the three; a new track takes its name
 * (trimmed, at most 60 characters), type and rank from the panel's own lists.
 *
 * @param {{ op: "add"|"mark"|"clear"|"complete"|"position"|"remove",
 *           trackId?: string, label?: string, type?: string, rank?: string,
 *           actorId?: string|null }} payload  `actorId` (position only): the
 *   clicker's own character, whose sheet and badge mirror the new position
 * @param {Object} [ctx]  gmRelay context — no edit is restricted to a role;
 *   the position mirror needs a requester who owns `actorId`
 * @returns {Promise<{ applied: boolean, reason?: "invalid"|"no-track"|"clock", trackId?: string }>}
 */
export async function applyProgressTrackEditFromRelay(payload = {}, ctx = {}) {
  const trackId = typeof payload?.trackId === 'string' ? payload.trackId : '';

  switch (payload?.op) {
    case 'add': {
      const label = typeof payload.label === 'string' ? payload.label.trim().slice(0, MAX_LABEL_LENGTH) : '';
      if (!label || !own(PANEL_TRACK_TYPES, payload.type) || !own(RANKS, payload.rank)) {
        return refusedEdit('invalid', payload);
      }
      const track = await addProgressTrack({ label, type: payload.type, rank: payload.rank });
      return { applied: true, trackId: track.id };
    }
    case 'mark':
      return editOutcome(await updateTrack(trackId, (track) => {
        if (!isOpenPanelTrack(track)) return false;
        track.ticks = Math.min(track.ticks + ticksPerMark(track), MAX_TICKS);
      }), payload);
    case 'clear':
      return editOutcome(await updateTrack(trackId, (track) => {
        if (!isOpenPanelTrack(track)) return false;
        track.ticks = Math.max(track.ticks - TICKS_PER_BOX, 0);
      }), payload);
    case 'position': {
      // Cycled from the stored position, read once every earlier write has
      // landed, then written everywhere a fight's position lives: the track,
      // and the clicker's own character's sheet and combat-tracker badge
      // (issue #321 U19 — the toggle wrote only the track, so the badge and
      // the sheet disagreed with it).
      const fight = await readTrackAfterWrites(trackId);
      if (!isOpenPanelTrack(fight) || fight.type !== 'combat') return refusedEdit('no-track', payload);
      // The clicker's PC's own position is the one cycled — the one the
      // interpreter and Take Decisive Action read (issue #326 W56); with no
      // PC, the fight's.
      const actor   = await positionMirrorActor(payload.actorId, ctx);
      const current = actor ? combatPositionFor(fight, actor.id) : (fight.combatState ?? null);
      const next    = NEXT_POSITION[current ?? 'null'] ?? null;
      const { applyCombatPositionToTrack } = await import('../moves/combatTracker.js');
      await applyCombatPositionToTrack(trackId, next, actor);
      return { applied: true, trackId };
    }
    case 'complete': {
      // The paired clock is retired before the track changes; refused, the
      // track stays open and the press is the retry (issue #316 T03).
      let clockError = null;
      const track = await updateTrack(trackId, async (t) => {
        if (!isOpenPanelTrack(t)) return false;
        try {
          await retirePairedClock(t);
        } catch (err) {
          clockError = err;
          return false;
        }
        t.completed   = true;
        t.completedAt = Date.now();
      });
      if (clockError) {
        warnPairedClock('completeTrack', clockError);
        return refusedEdit('clock', payload);
      }
      return editOutcome(track, payload);
    }
    case 'remove': {
      let clockError = null;
      let removed = null;
      await writeTracks(async (tracks) => {
        const track = tracks.find(t => t.id === trackId);
        if (!isPanelTrack(track)) return null;
        try {
          await removePairedClock(track);
        } catch (err) {
          clockError = err;
          return null;
        }
        removed = track;
        return tracks.filter(t => t.id !== trackId);
      });
      if (clockError) {
        warnPairedClock('removeTrack', clockError);
        return refusedEdit('clock', payload);
      }
      return editOutcome(removed, payload);
    }
    default:
      return refusedEdit('invalid', payload);
  }
}

function editOutcome(track, payload) {
  return track ? { applied: true, trackId: track.id } : refusedEdit('no-track', payload);
}

/**
 * One track as stored, read once every earlier write on this client has
 * landed; null when there is none. For a change another writer saves (the
 * position toggle goes through applyCombatPositionToTrack).
 */
async function readTrackAfterWrites(trackId) {
  let found = null;
  await writeTracks((tracks) => {
    found = tracks.find(t => t.id === trackId) ?? null;
    return null;
  });
  return found;
}

/**
 * The player character whose position a fight's badge shows on this client:
 * the PC its press resolves (resolveUserActorId, as #onToggleCombatState)
 * when the viewer owns it — the one the canonical GM then cycles
 * (positionMirrorActor) — else null, when the press cycles the fight's own
 * position (issue #345 AA64).
 *
 * @param {Object} campaignState
 * @returns {Actor|null}
 */
function viewerCharacter(campaignState) {
  let actorId = null;
  try {
    actorId = resolveUserActorId(game.user, campaignState);
  } catch { actorId = game.user?.character?.id ?? null; }
  const actor = actorId ? game.actors?.get?.(actorId) ?? null : null;
  if (!actor) return null;
  if (game.user?.isGM) return actor;
  if (typeof actor.testUserPermission === 'function') return actor.testUserPermission(game.user, 'OWNER') ? actor : null;
  const ownership = actor.ownership ?? {};
  return ownership[game.user?.id] === 3 || ownership.default === 3 ? actor : null;
}

/**
 * Whose sheet and combat-tracker badge mirror a panel position change: the
 * clicker's own character, named by their client, when it is a player
 * character they own — otherwise none, and only the track changes (a GM with
 * no character of their own).
 *
 * @param {string|null|undefined} actorId
 * @param {Object} ctx  gmRelay context
 * @returns {Promise<Actor|null>}
 */
async function positionMirrorActor(actorId, ctx) {
  if (typeof actorId !== 'string' || !actorId) return null;
  const [{ getActor, isPlayerCharacterActor }, { requesterOwnsActor }] = await Promise.all([
    import('../character/actorBridge.js'),
    import('../moves/burnMomentum.js'),
  ]);
  const actor = getActor(actorId);
  return actor && isPlayerCharacterActor(actor) && requesterOwnsActor(actor, ctx) ? actor : null;
}

function refusedEdit(reason, payload) {
  console.warn(`${MODULE_ID} | progress track "${payload?.op ?? '?'}" on ${payload?.trackId || 'a new track'} not applied (${reason}).`);
  return { applied: false, reason };
}

/**
 * Register Foundry hooks. Called once from module init (index.js).
 */
export function registerProgressTrackHooks() {
  ProgressTrackApp.registerHooks();
}
