/**
 * STARFORGED COMPANION
 * src/sectors/sectorSceneHooks.js — Click handlers for sector-scene Notes
 *
 * Phase 3 (commit b65175a) migrated Settlement entities from JournalEntry
 * to a location-typed Actor. Notes only accept JournalEntry ids in
 * `entryId`; passing an Actor id makes the whole createEmbeddedDocuments
 * batch fail v13 validation — that was the v1.3.4 "Sector Creator failed
 * to populate map" bug. sceneBuilder.js leaves `entryId` null and writes
 * `flags["starforged-companion"].actorId` on each note. This module
 * intercepts the click and opens the linked Actor sheet instead.
 *
 * v1.3.5 follow-up: the original fix relied on `Hooks.on("clickNote")`,
 * but that hook is not reliably fired in Foundry v13 (the v12 hook name
 * was kept for back-compat in some builds but is no-op in others). The
 * canonical v13 hook is now `activateNote`, fired from
 * `Note._onClickLeft2()`. To survive any further renames, we also
 * monkey-patch `Note.prototype._onClickLeft2` directly with a wrapper
 * that calls our handler first and short-circuits the default
 * journal-opening path when we hit a sector pin.
 *
 * The patch is opt-in (only short-circuits when the clicked note carries
 * our `sectorNote: true` flag), so non-sector notes keep their original
 * behaviour.
 */

const MODULE_ID = "starforged-companion";

/**
 * Register canvas hooks + prototype override for sector-scene note
 * interaction. Idempotent — safe to call from `ready` even if called twice.
 */
export function registerSectorSceneHooks() {
  if (registerSectorSceneHooks._installed) return;
  registerSectorSceneHooks._installed = true;

  // Belt-and-braces: register both candidate hook names so we work whether
  // Foundry's release-branch uses the v12 or v13 name. The handler is
  // idempotent: returning false short-circuits the second hook anyway.
  Hooks.on("clickNote",    handleSectorNoteClick);
  Hooks.on("activateNote", handleSectorNoteClick);

  // Prototype override — the only mechanism guaranteed to fire on every
  // v13 build. Wraps the original _onClickLeft2 (the double-click handler
  // that normally opens the linked JournalEntry).
  installNoteClickOverride();
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

/**
 * Wrap Note.prototype._onClickLeft2 so sector pins open the linked Actor
 * sheet instead of attempting to open a JournalEntry (which doesn't exist
 * — entryId is null on sector pins by design).
 *
 * Done as a one-time prototype patch. If `foundry.canvas.placeables.Note`
 * isn't reachable (different namespace in a future version, no canvas in
 * this environment), the function logs and returns — the hook-based
 * handlers above still cover the common case.
 */
function installNoteClickOverride() {
  const NoteCtor =
    globalThis.foundry?.canvas?.placeables?.Note   // v13 namespace
    ?? globalThis.Note                              // v12 (and v13 alias) global
    ?? null;

  if (!NoteCtor?.prototype) {
    console.warn(
      `${MODULE_ID} | sectorSceneHooks: could not locate Note prototype; ` +
      `pin clicks will rely on the clickNote/activateNote hooks alone.`,
    );
    return;
  }

  const proto = NoteCtor.prototype;
  if (proto._sfSectorClickPatched) return;        // idempotent across reloads
  proto._sfSectorClickPatched = true;

  const original = proto._onClickLeft2;
  proto._onClickLeft2 = function patchedOnClickLeft2(event) {
    try {
      const handled = handleSectorNoteClick(this);
      if (handled === false) return;              // ours — suppress default
    } catch (err) {
      console.error(`${MODULE_ID} | sector pin click handler threw:`, err);
    }
    return original?.call(this, event);
  };
}
