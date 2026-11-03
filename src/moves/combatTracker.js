/**
 * STARFORGED COMPANION
 * src/moves/combatTracker.js — Foundry CombatTracker integration for Starforged combat.
 *
 * When Enter the Fray fires the pipeline calls enterCombatTracker(), which creates a
 * Foundry Combat document linked to the progress track via a module flag and adds all
 * PC actors as Combatants. Position (in control / bad spot) and range (close / far) are
 * stored as module flags on each Combatant and rendered as clickable badges via the
 * renderCombatTracker hook. End-combat moves call endCombatTracker() to delete the
 * Combat document.
 *
 * Starforged has no initiative order, so initiative is always null and the native
 * initiative/round UI is hidden via CSS when .sf-starforged-combat is present.
 *
 * Source: docs/foundry-reference/foundry-api-reference.md §Combat and Combatant
 */

const MODULE_ID  = 'starforged-companion';
const SETTING_KEY = 'combatTrackerEnabled';

// Position display config. Keys match actor.system.combatPosition values (vendor schema).
const POSITION_LABELS = {
  inControl:  'In control',
  inABadSpot: 'In a bad spot',
  none:       '—',
  '':         '—',
};

// Cycle order when the user clicks the position badge: none → in control → bad spot → none
const POSITION_CYCLE = {
  inControl:  'inABadSpot',
  inABadSpot: 'none',
  none:       'inControl',
  '':         'inControl',
};

const RANGE_LABELS = { close: 'Close (+iron)', far: 'Far (+edge)' };
const RANGE_CYCLE  = { close: 'far', far: 'close' };

// ─────────────────────────────────────────────────────────────────────────────
// POSITION MAPPING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert the move-pipeline position string (in_control / bad_spot) to the
 * vendor actor schema value (inControl / inABadSpot / none).
 * @param {string|null} pos
 * @returns {'inControl'|'inABadSpot'|'none'}
 */
export function trackPosToActorPos(pos) {
  if (pos === 'in_control') return 'inControl';
  if (pos === 'bad_spot')   return 'inABadSpot';
  return 'none';
}

/**
 * The reverse: a badge / actor-sheet position as the track holds it —
 * in_control, bad_spot, or null (neutral).
 * @param {string|null} pos
 * @returns {'in_control'|'bad_spot'|null}
 */
function actorPosToTrackPos(pos) {
  if (pos === 'inControl')  return 'in_control';
  if (pos === 'inABadSpot') return 'bad_spot';
  return null;
}

// The positions a fight's track holds; null (neutral) clears it.
const TRACK_POSITIONS = new Set(['in_control', 'bad_spot']);

// ─────────────────────────────────────────────────────────────────────────────
// COMBAT DOCUMENT LIFECYCLE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find the Foundry Combat document linked to a progress track.
 * Returns null when the feature is disabled or no combat is linked.
 * @param {string} trackId
 * @returns {Combat|null}
 */
export function findCombatForTrack(trackId) {
  return game.combats?.find(c => c.getFlag(MODULE_ID, 'trackId') === trackId) ?? null;
}

/**
 * Create a Foundry Combat document for a combat track and add all PC actors as
 * Combatants. Idempotent — returns the existing combat if one is already linked.
 * No-op (returns null) when the combatTrackerEnabled setting is false.
 *
 * @param {string} trackId  The progress track ID to link to
 * @param {Actor[]} actors  PC actors to add as Combatants
 * @returns {Promise<Combat|null>}
 */
export async function enterCombatTracker(trackId, actors) {
  if (!game.settings.get(MODULE_ID, SETTING_KEY)) return null;

  const existing = findCombatForTrack(trackId);
  if (existing) return existing;

  const combatData = {};
  const sceneId = globalThis.canvas?.scene?.id ?? null;
  if (sceneId) combatData.scene = sceneId;

  const CombatCls = globalThis.Combat;
  if (!CombatCls?.create) {
    console.warn(`${MODULE_ID} | combatTracker: Combat.create unavailable — skipping tracker creation`);
    return null;
  }

  const combat = await CombatCls.create(combatData);
  if (!combat) return null;

  await combat.setFlag(MODULE_ID, 'trackId', trackId);

  if (actors?.length) {
    const combatantData = actors.map(a => {
      const token = globalThis.canvas?.tokens?.placeables?.find(t => t.actor?.id === a.id) ?? null;
      return {
        actorId: a.id,
        tokenId: token?.id ?? null,
        sceneId: sceneId ?? null,
        name:    a.name,
      };
    });
    await combat.createEmbeddedDocuments('Combatant', combatantData);
  }

  return combat;
}

/**
 * Delete the Foundry Combat document linked to a progress track.
 * No-op when the feature is disabled or no linked combat exists.
 * @param {string} trackId
 * @returns {Promise<void>}
 */
export async function endCombatTracker(trackId) {
  if (!game.settings.get(MODULE_ID, SETTING_KEY)) return;
  const combat = findCombatForTrack(trackId);
  if (combat) await combat.delete();
}

/**
 * Set the position module flag on the Combatant for a given actor within
 * a specific combat. The caller is responsible for also writing the actor's
 * system.combatPosition field via actorBridge.setCombatPosition.
 *
 * @param {Combat} combat
 * @param {Actor} actor
 * @param {'inControl'|'inABadSpot'|'none'} actorPosition
 * @returns {Promise<void>}
 */
export async function updateCombatantPosition(combat, actor, actorPosition) {
  if (!combat || !actor) return;
  const combatant = combat.combatants?.find(c => c.actorId === actor.id);
  if (combatant) await combatant.setFlag(MODULE_ID, 'position', actorPosition);
}

/**
 * Write a combat position everywhere it lives: the progress track's
 * combatState and — for a player character — their own entry
 * (`positions[actorId]`), the actor's sheet field (via actorBridge), and the
 * Combatant badge flag. The track is canonical — the interpreter's position
 * constraint and Take Decisive Action's bad-spot downgrade read the roller's
 * own position there (the fight's as the fallback), and the narrator's OPEN
 * PROGRESS TRACKS reads both; the sheet and the badge mirror it. Shared by
 * the pipeline combatPosition consequence, the threshold-card position carry,
 * the weak-hit Enter the Fray choice, the combat tracker's position badge and
 * the Progress Tracks panel's position toggle (issue #321 U19: the badge
 * wrote only the two mirrors, the toggle only the track).
 *
 * The track is written first. When that write fails this rejects and the
 * mirrors are left as they are, so they never show a position the track does
 * not hold; a mirror write that fails is logged.
 *
 * Dynamic imports avoid circular dependencies (progressTracks.js imports this
 * module for its position toggle).
 *
 * @param {string} trackId
 * @param {'in_control'|'bad_spot'|null} position — track-flavoured; null is neutral (clears it)
 * @param {Actor|null} actor — whose sheet/badge to mirror; track-only when null
 * @returns {Promise<void>}
 */
export async function applyCombatPositionToTrack(trackId, position, actor = null) {
  if (!trackId || (position !== null && !TRACK_POSITIONS.has(position))) return;

  // Position is per character: a player character's is recorded on the fight
  // as their own (`positions[actorId]`), beside the fight's last-set one — the
  // interpreter's directive and Take Decisive Action read the roller's (issue
  // #322 V03). A foe's badge sets the fight's alone.
  const { setCombatTrackPosition } = await import('../ui/progressTracks.js');
  const { isPlayerCharacterActor } = await import('../character/actorBridge.js');
  await setCombatTrackPosition(trackId, position, isPlayerCharacterActor(actor) ? actor.id : null);

  if (!actor) return;
  const actorPos = trackPosToActorPos(position);
  const { setCombatPosition } = await import('../character/actorBridge.js');
  await setCombatPosition(actor, actorPos).catch(err =>
    console.warn(`${MODULE_ID} | combat position actor write failed:`, err?.message ?? err));

  const combat = findCombatForTrack(trackId);
  if (combat) {
    await updateCombatantPosition(combat, actor, actorPos).catch(err =>
      console.warn(`${MODULE_ID} | combat position badge write failed:`, err?.message ?? err));
  }
}

/**
 * A position badge click: the fight's position, written everywhere it lives
 * (applyCombatPositionToTrack) — the track first, then the combatant's actor
 * and badge. The clicked combatant's own flag is set too when the mirror
 * reached another (a second token of the same actor) or there is no actor.
 *
 * @param {Combat} combat
 * @param {Combatant} combatant
 * @param {'inControl'|'inABadSpot'|'none'} actorPos
 * @returns {Promise<void>}
 */
async function setBadgePosition(combat, combatant, actorPos) {
  const trackId = combat.getFlag(MODULE_ID, 'trackId');
  await applyCombatPositionToTrack(trackId, actorPosToTrackPos(actorPos), combatant.actor ?? null);
  if (combatant.getFlag(MODULE_ID, 'position') !== actorPos) {
    await combatant.setFlag(MODULE_ID, 'position', actorPos);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HOOKS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the renderCombatTracker hook that injects position and range badges
 * into each combatant row whenever the tracker sidebar re-renders.
 */
export function registerCombatTrackerHooks() {
  Hooks.on('renderCombatTracker', (app, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root) return;

    // Only customise when the combat the tracker SHOWS is Starforged-managed.
    // It decorated the first module combat in game.combats: with two fights
    // open the viewed one got no badges, and the class below (which hides
    // initiative and the turn controls) went on whatever combat was shown —
    // the GM's own non-Starforged combat included (issue #326 W55).
    const combat = app?.viewed ?? game.combat ?? null;
    if (!combat?.getFlag?.(MODULE_ID, 'trackId')) {
      root.classList.remove?.('sf-starforged-combat');
      return;
    }

    // Suppress native initiative and round/turn UI via CSS
    root.classList.add('sf-starforged-combat');

    for (const combatant of combat.combatants) {
      const row = root.querySelector(`[data-combatant-id="${combatant.id}"]`);
      if (!row) continue;

      // Remove previously injected badge containers to prevent duplicates on
      // re-renders (same pattern as renderSceneControls — foundry-api.md).
      row.querySelectorAll('.sf-combat-badges').forEach(el => el.remove());

      const position = combatant.getFlag(MODULE_ID, 'position')
        ?? combatant.actor?.system?.combatPosition
        ?? 'none';

      const range = combatant.getFlag(MODULE_ID, 'range') ?? 'close';

      const badges = document.createElement('div');
      badges.className = 'sf-combat-badges';

      // Position badge — cycles through inControl → inABadSpot → none on click
      const posBadge = document.createElement('button');
      posBadge.type      = 'button';
      posBadge.className = `sf-combat-badge sf-pos-badge sf-pos-${position}`;
      posBadge.title     = 'Click to toggle combat position';
      posBadge.textContent = POSITION_LABELS[position] ?? '—';
      posBadge.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!game.user.isGM) return;
        const next = POSITION_CYCLE[position] ?? 'inControl';
        return setBadgePosition(combat, combatant, next).catch(err => {
          console.warn(`${MODULE_ID} | combatTracker: the position change was not saved:`, err?.message ?? err);
          ui.notifications?.warn?.('Starforged Companion: the combat position could not be saved — try again.');
        });
      });
      badges.appendChild(posBadge);

      // Range badge — toggles close ↔ far on click
      const rangeBadge = document.createElement('button');
      rangeBadge.type      = 'button';
      rangeBadge.className = `sf-combat-badge sf-range-badge sf-range-${range}`;
      // Advisory only — Starforged has no range mechanic; the badge is a
      // fictional-positioning aid (see decisions.md "Range badges are advisory").
      rangeBadge.title     = 'Click to toggle range (close / far) — fictional positioning aid, no roll modifier';
      rangeBadge.textContent = RANGE_LABELS[range] ?? range;
      rangeBadge.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!game.user.isGM) return;
        const next = RANGE_CYCLE[range] ?? 'close';
        combatant.setFlag(MODULE_ID, 'range', next);
      });
      badges.appendChild(rangeBadge);

      // Inject the badge row after the combatant controls area
      const controls = row.querySelector('.combatant-controls') ?? row;
      controls.after(badges);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the combatTrackerEnabled world setting.
 * Called from index.js registerCoreSettings() during the init hook.
 */
export function registerCombatTrackerSettings() {
  game.settings.register(MODULE_ID, SETTING_KEY, {
    name:    'Combat Tracker Integration',
    hint:    'Open a Foundry combat tracker when Enter the Fray fires. Position and range badges replace the initiative display.',
    scope:   'world',
    config:  true,
    type:    Boolean,
    default: true,
  });
}
