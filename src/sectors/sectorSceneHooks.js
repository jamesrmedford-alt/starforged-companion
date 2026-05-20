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

  // Fact-continuity scope §20.4b — command-vehicle Token drag detection.
  // Returns false to cancel the drag when it lands within snap radius of
  // a settlement Note pin; the synthetic set_a_course pipeline then runs
  // on the dropped-on settlement and moves the Token programmatically on
  // a non-miss outcome.
  Hooks.on("preUpdateToken", handleCommandVehicleTokenDrag);
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
 * preUpdateToken handler — detects a drag on the command-vehicle Token
 * within a sector Scene. When the new position lands within snap radius
 * of a settlement Note pin, cancels the update and dispatches a
 * synthetic set_a_course chat message; the existing pipeline then runs
 * the move with the standard confirmation dialog. On a non-miss
 * outcome, the Token is moved to the destination Note's coords
 * programmatically (the position update happens via the existing
 * `set_a_course` post-resolution trigger). On a miss / decline, the
 * Token never moved — no snap-back needed.
 *
 * @param {TokenDocument} tokenDoc
 * @param {Object} changes — diff applied to the Token
 * @returns {false|undefined} false to cancel; undefined to let through
 */
export function handleCommandVehicleTokenDrag(tokenDoc, changes) {
  if (!tokenDoc?.flags?.[MODULE_ID]?.commandVehicle) return undefined;

  // Only fire for actual position changes, not other field edits.
  const newX = Number(changes?.x);
  const newY = Number(changes?.y);
  if (!Number.isFinite(newX) && !Number.isFinite(newY)) return undefined;
  const prevX = Number(tokenDoc.x);
  const prevY = Number(tokenDoc.y);
  const dx    = Number.isFinite(newX) ? newX : prevX;
  const dy    = Number.isFinite(newY) ? newY : prevY;
  if (dx === prevX && dy === prevY) return undefined;

  // Feature gate — silently let the drag through when the affordance
  // is disabled in settings.
  try {
    const enabled = game.settings.get(MODULE_ID, "factContinuity.shipTokenEnabled") !== false;
    if (!enabled) return undefined;
  } catch (err) {
    // Setting not registered (unit tests, early init) — treat as enabled
    // so the test harness sees the default behaviour.
    console.debug?.(`${MODULE_ID} | preUpdateToken: settings read failed:`, err?.message ?? err);
  }

  // Only the Scene flagged as a sector Scene participates.
  const scene = tokenDoc.parent ?? tokenDoc.scene;
  if (!scene?.flags?.[MODULE_ID]?.sectorScene) return undefined;

  // Resolve snap radius (grid cells → pixels) and find the closest
  // settlement Note within range.
  const snapCells = readSnapRadius();
  const gridSize  = scene.grid?.size ?? scene.gridSize ?? 100;
  const radiusPx  = Math.max(0, snapCells) * gridSize;

  const candidate = nearestSettlementNote(scene, dx, dy, radiusPx);
  if (!candidate) return undefined;             // Free-text reposition; allow the drag.

  // Cancel the drag — the pipeline will move the Token on a non-miss.
  setTimeout(() => dispatchSetACourseFromTokenDrag(scene, candidate, tokenDoc), 0);
  return false;
}

function readSnapRadius() {
  try {
    const v = Number(game.settings.get(MODULE_ID, "factContinuity.shipTokenSnapRadius"));
    return Number.isFinite(v) && v >= 0 ? v : 1;
  } catch { return 1; }
}

/**
 * Among a Scene's Notes, return the one closest to (x, y) within
 * radiusPx and carrying a settlement reference (settlementId flag).
 * Returns null when no match. Pure read.
 */
export function nearestSettlementNote(scene, x, y, radiusPx) {
  const notes = scene?.notes?.contents ?? scene?.notes ?? [];
  if (!Array.isArray(notes) || !notes.length) return null;

  let best = null;
  let bestDist = Infinity;
  for (const n of notes) {
    const flags = n?.flags?.[MODULE_ID];
    if (!flags?.settlementId) continue;
    if (flags?.planetNote || flags?.stellarNote) continue;     // settlement Notes only
    const nx = Number(n.x ?? 0);
    const ny = Number(n.y ?? 0);
    const dist = Math.hypot(nx - x, ny - y);
    if (dist <= radiusPx && dist < bestDist) {
      best = n;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * Translate a Token-drag drop on a settlement Note into a chat-typed
 * `set_a_course` message. The existing chat handler runs the full move
 * pipeline (interpreter → confirm dialog → resolveMove →
 * narrateResolution). The interpreter sees a normal narration and
 * picks up the destination name from `moveTarget`.
 *
 * We attach a flag on the message so the post-resolution path knows to
 * also move the Token visually when the move succeeds.
 */
async function dispatchSetACourseFromTokenDrag(scene, settlementNote, tokenDoc) {
  if (!game?.user) return;
  const destinationName = settlementNote.text ?? "the destination";

  try {
    await ChatMessage.create({
      content: `I set a course for ${destinationName}.`,
      flags: {
        [MODULE_ID]: {
          // bypassPacing keeps the chat hook from filtering this message
          // out as a "module-generated card" — it IS player input,
          // produced by the Token-drag affordance instead of the keyboard.
          bypassPacing:   true,
          forcedMoveId:   "set_a_course",
          forcedMoveTarget: destinationName,
          tokenDragSetCourse: {
            sceneId:        scene.id,
            tokenId:        tokenDoc.id,
            destSettlement: settlementNote.flags?.[MODULE_ID]?.settlementId ?? null,
            destNoteId:     settlementNote.id,
            destX:          Number(settlementNote.x ?? 0),
            destY:          Number(settlementNote.y ?? 0),
            destName:       destinationName,
          },
        },
      },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | Token-drag set_a_course dispatch failed:`, err);
  }
}

/**
 * Move the command-vehicle Token to the destination Note's coords on a
 * non-miss `set_a_course` resolution triggered by a Token drag. Called
 * from the move pipeline in index.js after resolution. No-op when the
 * Scene or Token has been removed in the meantime.
 */
export async function moveCommandVehicleTokenToDestination(payload) {
  if (!payload) return;
  const scene = game.scenes?.get?.(payload.sceneId);
  if (!scene) return;
  const tokens = scene.tokens?.contents ?? scene.tokens ?? [];
  const token  = Array.isArray(tokens) ? tokens.find(t => t.id === payload.tokenId) : null;
  if (!token) return;
  try {
    await token.update({ x: payload.destX, y: payload.destY });
  } catch (err) {
    console.debug?.(`${MODULE_ID} | command-vehicle Token move failed:`, err?.message ?? err);
  }
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
