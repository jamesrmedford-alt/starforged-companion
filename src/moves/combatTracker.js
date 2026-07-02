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
 * combatState, the actor's sheet field (via actorBridge), and the Combatant
 * badge flag. Shared by the pipeline combatPosition consequence, the
 * threshold-card position carry, and the weak-hit Enter the Fray choice.
 *
 * Dynamic imports avoid circular dependencies (same pattern as the badge
 * click handler in registerCombatTrackerHooks).
 *
 * @param {string} trackId
 * @param {'in_control'|'bad_spot'} position — track-flavoured position
 * @param {Actor|null} actor — whose sheet/badge to mirror; track-only when null
 * @returns {Promise<void>}
 */
export async function applyCombatPositionToTrack(trackId, position, actor = null) {
  if (!trackId || !position) return;

  const { setCombatTrackPosition } = await import('../ui/progressTracks.js');
  await setCombatTrackPosition(trackId, position).catch(err =>
    console.warn(`${MODULE_ID} | combat position track write failed:`, err?.message ?? err));

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

    // Only customise when a Starforged-managed combat is displayed
    const combat = game.combats?.find(c => c.getFlag(MODULE_ID, 'trackId'));
    if (!combat) return;

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
        combatant.setFlag(MODULE_ID, 'position', next).then(() => {
          if (combatant.actor) {
            // Dynamic import avoids a circular-dependency chain (actorBridge
            // does not import combatTracker; combatTracker defers the import).
            import('../character/actorBridge.js')
              .then(({ setCombatPosition }) => setCombatPosition(combatant.actor, next))
              .catch(err => console.warn(`${MODULE_ID} | combatTracker: setCombatPosition failed:`, err));
          }
        });
      });
      badges.appendChild(posBadge);

      // Range badge — toggles close ↔ far on click
      const rangeBadge = document.createElement('button');
      rangeBadge.type      = 'button';
      rangeBadge.className = `sf-combat-badge sf-range-badge sf-range-${range}`;
      rangeBadge.title     = 'Click to toggle range (close / far)';
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
