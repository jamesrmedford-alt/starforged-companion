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
  vow:        'Vow',
  expedition: 'Expedition',
  connection: 'Connection',
  combat:     'Combat',
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
 * @returns {object}
 */
function createTrack({ label, type, rank, entityId = null }) {
  return {
    id: foundry.utils.randomID(),
    label,
    type,
    rank,
    ticks: 0,       // 0–40
    completed: false,
    entityId,
    createdAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Journal helpers
// ---------------------------------------------------------------------------

/**
 * Return the dedicated progress-track JournalEntry, creating it if absent.
 * The journal is created hidden (ownership: NONE for players, OWNER for GM).
 * @returns {Promise<JournalEntry>}
 */
async function getOrCreateJournal() {
  let journal = game.journal.find(j => j.name === JOURNAL_NAME);
  if (!journal) {
    journal = await JournalEntry.create({
      name: JOURNAL_NAME,
      ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE },
    });
  }
  return journal;
}

/**
 * Read all tracks from the journal flags.
 * @returns {Promise<object[]>}
 */
async function loadTracks() {
  const journal = await getOrCreateJournal();
  return journal.getFlag(MODULE_ID, FLAG_KEY) ?? [];
}

/**
 * Persist tracks array to the journal flags.
 * @param {object[]} tracks
 * @returns {Promise<void>}
 */
async function saveTracks(tracks) {
  const journal = await getOrCreateJournal();
  await journal.setFlag(MODULE_ID, FLAG_KEY, tracks);
}

// ---------------------------------------------------------------------------
// Progress Roll logic (Starforged rules)
// ---------------------------------------------------------------------------

/**
 * Execute a Progress Roll for a track.
 * Score = number of fully filled boxes (ticks / 4, floored).
 * Roll 2d10 challenge dice. Compare score against each:
 *   Strong Hit  — score > both dice
 *   Weak Hit    — score > one die
 *   Miss        — score ≤ both dice
 * Posts a chat message matching the module's existing move card format.
 *
 * @param {object} track
 */
async function rollProgress(track) {
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
        <span class="move-name">${track.label}</span>
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
    classes: [MODULE_ID, 'progress-tracks'],
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
      markProgress:  ProgressTrackApp.#onMarkProgress,
      clearProgress: ProgressTrackApp.#onClearProgress,
      rollProgress:  ProgressTrackApp.#onRollProgress,
      removeTrack:   ProgressTrackApp.#onRemoveTrack,
      addTrack:      ProgressTrackApp.#onAddTrack,
      completeTrack: ProgressTrackApp.#onCompleteTrack,
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
  async _prepareContext(options) {
    const tracks = await loadTracks();

    // Annotate each track with derived display values.
    const annotated = tracks.map(t => ({
      ...t,
      rankLabel: RANKS[t.rank]?.label ?? t.rank,
      rankClass: RANKS[t.rank]?.cssClass ?? '',
      typeLabel: TRACK_TYPES[t.type] ?? t.type,
      filledBoxes: Math.floor(t.ticks / TICKS_PER_BOX),
      ticksInPartialBox: t.ticks % TICKS_PER_BOX,
      pct: Math.round((t.ticks / MAX_TICKS) * 100),
      boxes: ProgressTrackApp.#buildBoxes(t.ticks),
      canRoll: t.ticks > 0,
    }));

    // Group: active (not completed) then completed.
    const active = annotated.filter(t => !t.completed);
    const completed = annotated.filter(t => t.completed);

    return { active, completed, rankOptions: RANKS, typeOptions: TRACK_TYPES };
  }

  /** @override */
  async _renderHTML(context, options) {
    const { active, completed, rankOptions, typeOptions } = context;

    const renderTrack = (t) => `
      <div class="track-row ${t.rankClass} ${t.completed ? 'is-completed' : ''}"
           data-track-id="${t.id}">
        <div class="track-header">
          <div class="track-labels">
            <span class="track-name">${t.label}</span>
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
            : '<p class="empty-state">No active tracks. Swear a vow to begin.</p>'
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
  _replaceHTML(result, content, options) {
    // Replace inner content without destroying the window chrome.
    content.innerHTML = '';
    content.append(result);
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
      if (doc.name !== JOURNAL_NAME) return;
      if (!foundry.utils.hasProperty(change, `flags.${MODULE_ID}.${FLAG_KEY}`)) return;
      instance.render();
    });
  }

  // -----------------------------------------------------------------------
  // Action handlers (static — bound via DEFAULT_OPTIONS.actions)
  // -----------------------------------------------------------------------

  /**
   * Mark progress on a track (adds ticksPerMark, capped at MAX_TICKS).
   * @param {PointerEvent} event
   * @param {HTMLElement}  target
   */
  static async #onMarkProgress(event, target) {
    const trackId = target.dataset.trackId;
    const tracks = await loadTracks();
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;

    const ticksPerMark = RANKS[track.rank]?.ticksPerMark ?? 4;
    track.ticks = Math.min(track.ticks + ticksPerMark, MAX_TICKS);

    await saveTracks(tracks);
    await ProgressTrackApp.#syncConnectionEntity(track);
    this.render();
  }

  /**
   * Clear one box of progress (removes TICKS_PER_BOX ticks, min 0).
   */
  static async #onClearProgress(event, target) {
    const trackId = target.dataset.trackId;
    const tracks = await loadTracks();
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;

    track.ticks = Math.max(track.ticks - TICKS_PER_BOX, 0);

    await saveTracks(tracks);
    await ProgressTrackApp.#syncConnectionEntity(track);
    this.render();
  }

  /**
   * Execute a progress roll for this track and post a chat card.
   */
  static async #onRollProgress(event, target) {
    const trackId = target.dataset.trackId;
    const tracks = await loadTracks();
    const track = tracks.find(t => t.id === trackId);
    if (!track || track.ticks === 0) return;
    await rollProgress(track);
  }

  /**
   * Toggle a track's completed state. Completed tracks are moved to the archive
   * section but kept for campaign record-keeping.
   */
  static async #onCompleteTrack(event, target) {
    const trackId = target.dataset.trackId;
    const tracks = await loadTracks();
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;

    track.completed = true;
    track.completedAt = Date.now();

    await saveTracks(tracks);
    this.render();
  }

  /**
   * Remove a track permanently (with a confirm dialog for safety).
   */
  static async #onRemoveTrack(event, target) {
    const trackId = target.dataset.trackId;
    const tracks = await loadTracks();
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;

    const confirmed = await DialogV2.confirm({
      window:  { title: 'Remove Track' },
      content: `<p>Permanently remove <strong>${track.label}</strong>? This cannot be undone.</p>`,
    });
    if (!confirmed) return;

    const updated = tracks.filter(t => t.id !== trackId);
    await saveTracks(updated);
    this.render();
  }

  /**
   * Add a new track from the input fields at the top of the panel.
   */
  static async #onAddTrack(event, target) {
    const panel = this.element.querySelector('.sf-progress-panel');
    const labelInput = panel.querySelector('[name="newLabel"]');
    const typeSelect = panel.querySelector('[name="newType"]');
    const rankSelect = panel.querySelector('[name="newRank"]');

    const label = labelInput.value.trim();
    if (!label) {
      labelInput.focus();
      return;
    }

    const track = createTrack({
      label,
      type: typeSelect.value,
      rank: rankSelect.value,
    });

    const tracks = await loadTracks();
    tracks.push(track);
    await saveTracks(tracks);

    labelInput.value = '';
    this.render();
  }

  // -----------------------------------------------------------------------
  // Connection entity sync
  // -----------------------------------------------------------------------

  /**
   * If a track is linked to a connection entity (entityId), write the updated
   * tick count back to that entity's progress field so connection.js stays
   * authoritative and context injection sees the live value.
   *
   * connection.js stores progress as { ticks, rank } in its flags.
   * @param {object} track
   */
  static async #syncConnectionEntity(track) {
    if (track.type !== 'connection' || !track.entityId) return;

    const journal = game.journal.get(track.entityId);
    if (!journal) return;

    const existing = journal.getFlag(MODULE_ID, 'connection') ?? {};
    await journal.setFlag(MODULE_ID, 'connection', {
      ...existing,
      progress: { ticks: track.ticks, rank: track.rank },
    });
  }

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
export function openProgressTracks() {
  return ProgressTrackApp.open();
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
  const tracks = await loadTracks();
  tracks.push(track);
  await saveTracks(tracks);

  // Refresh the panel if it's open.
  const instance = ProgressTrackApp._ProgressTrackApp__instance;  // access private via name mangling
  if (instance?.rendered) instance.render();

  return track;
}

/**
 * Mark progress on a track by ID from outside the panel (e.g. move resolver).
 * @param {string} trackId
 * @returns {Promise<object|null>}  Updated track or null if not found
 */
export async function markProgressById(trackId) {
  const tracks = await loadTracks();
  const track = tracks.find(t => t.id === trackId);
  if (!track) return null;

  const ticksPerMark = RANKS[track.rank]?.ticksPerMark ?? 4;
  track.ticks = Math.min(track.ticks + ticksPerMark, MAX_TICKS);

  await saveTracks(tracks);
  return track;
}

/**
 * Register Foundry hooks. Called once from module init (index.js).
 */
export function registerProgressTrackHooks() {
  ProgressTrackApp.registerHooks();
}
