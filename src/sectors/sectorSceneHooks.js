/**
 * STARFORGED COMPANION
 * src/sectors/sectorSceneHooks.js — Click handlers for sector-scene Notes
 *
 * Phase 3 (commit b65175a) migrated Settlement entities from JournalEntry
 * to a location-typed Actor. Before that, sceneBuilder.js placed Notes
 * whose `entryId` linked to the settlement's JournalEntry — double-clicking
 * the pin opened the journal. Post-Phase-3 there is no JournalEntry to
 * link to (Notes only accept JournalEntry ids; passing an Actor id makes
 * the whole createEmbeddedDocuments batch fail validation — that was the
 * v1.3.4 "Sector Creator failed to populate map" bug).
 *
 * Solution: sceneBuilder.js leaves `entryId` null and writes
 * `flags["starforged-companion"].actorId` on each note. This module
 * registers a hook that intercepts the click and opens the linked Actor
 * sheet instead.
 *
 * Foundry v13 fires `clickNote(note, event)` from
 * `Note._onClickLeft2()` — see https://foundryvtt.com/api/v13. Returning
 * `false` from the handler prevents the default journal-opening behaviour.
 * Here the default is no-op anyway (entryId is null), so returning false
 * is precautionary.
 */

const MODULE_ID = "starforged-companion";

/**
 * Register canvas hooks for sector-scene note interaction.
 * Idempotent — safe to call from `ready` even if called twice.
 */
export function registerSectorSceneHooks() {
  if (registerSectorSceneHooks._installed) return;
  registerSectorSceneHooks._installed = true;

  Hooks.on("clickNote", handleSectorNoteClick);
}

/**
 * @param {Note} note — the Note placeable that was clicked
 * @returns {boolean|undefined} false to prevent default, undefined otherwise
 */
export function handleSectorNoteClick(note) {
  const flags = note?.document?.flags?.[MODULE_ID];
  if (!flags?.sectorNote) return undefined;       // not ours — let core handle

  const actorId = flags.actorId ?? null;
  if (!actorId) {
    // Stellar-object pins are intentionally non-interactive — they have
    // no Actor representation. Stop the default (no-op) without surprise.
    return false;
  }

  const actor = game.actors?.get(actorId) ?? null;
  if (!actor) {
    ui.notifications?.warn(
      `Starforged Companion: linked Actor not found for this pin (id: ${actorId}). ` +
      `The Actor may have been deleted.`,
    );
    return false;
  }

  actor.sheet?.render(true);
  return false;
}
