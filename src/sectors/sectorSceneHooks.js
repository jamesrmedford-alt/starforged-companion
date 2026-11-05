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

import { isCanonicalGM } from "../multiplayer/gmGate.js";
import { getCommandVehicleActorId } from "../entities/ship.js";
import { getShipPositioningEnabled, getShipAutoMoveOnCourse } from "../ui/settingsPanel.js";

const MODULE_ID = "starforged-companion";

// Update-options key stamped on every programmatic command-vehicle token
// move (fiction→token sync, set_a_course drag commit). The token hooks
// below skip moves carrying it — without the guard, the sync's own
// token.update lands on a settlement pin, the preUpdateToken drag handler
// cancels it and dispatches a *second* synthetic set_a_course, and the
// position write loops back through the pipeline.
export const POSITION_SYNC_OPTION = "sfcPositionSync";

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

  // v1.7.10 finding #5 — a command-vehicle token ON a sector scene is an
  // authoritative position statement. Placement (wizard or manual drop from
  // the sidebar) and off-pin repositions write the §20 position record from
  // the token's actual coordinates, so "where am I" is grounded the moment
  // a token exists. On-pin drops stay with the set_a_course flow above
  // (travel move with a roll); off-pin = position note, no move mechanics.
  Hooks.on("createToken", handleCommandVehicleTokenPlacement);
  Hooks.on("updateToken", handleCommandVehicleTokenReposition);

  // A settlement pin's label follows its Actor's name (issue #321 U52).
  Hooks.on("updateActor", handleSettlementPinRename);
}

/**
 * updateActor — a settlement Actor renamed (its sheet, the Entities panel, the
 * rename sync) renames its pins on every sector Scene. The label was written
 * once at scene creation, so the map kept the old name. Settlement pins, and
 * a discovered site's pin — labelled with the site's name at its reveal, so a
 * rename after it left the map on the generated name while the narrator's
 * Charted sites and the cards used the new one (issue #331 X46). A planet pin
 * links the same Actor but is labelled with the planet, and an undiscovered
 * site's pin reads "Unexplored Site" until it is revealed. Notes are shared
 * documents, so one client writes — the canonical GM.
 *
 * @param {Actor} actor   the updated Actor (post-update)
 * @param {Object} changes the update diff
 * @returns {Promise<void>|undefined}
 */
export function handleSettlementPinRename(actor, changes) {
  if (!actor || actor.type !== "location" || !changes || !("name" in changes)) return undefined;
  if (!isCanonicalGM()) return undefined;
  const name = String(actor.name ?? "").trim();
  if (!name) return undefined;

  const writes = [];
  for (const scene of game.scenes?.contents ?? []) {
    if (!scene?.flags?.[MODULE_ID]?.sectorScene) continue;
    const notes = scene.notes?.contents ?? scene.notes ?? [];
    for (const note of Array.isArray(notes) ? notes : []) {
      const flags = note?.flags?.[MODULE_ID];
      if (!flags || flags.actorId !== actor.id) continue;
      const settlementPin = !!flags.settlementId && !flags.planetNote && !flags.stellarNote && !flags.siteNote;
      const revealedSite  = !!flags.siteNote && flags.discovered === true;
      if (!settlementPin && !revealedSite) continue;
      if (note.text === name) continue;
      writes.push(Promise.resolve(note.update?.({ text: name })).catch(err =>
        console.warn(`${MODULE_ID} | settlement pin rename failed for ${note.id}:`, err?.message ?? err)));
    }
  }
  return Promise.all(writes).then(() => undefined);
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
 * @param {Object} [options] — update options (programmatic syncs carry POSITION_SYNC_OPTION)
 * @returns {false|undefined} false to cancel; undefined to let through
 */
export function handleCommandVehicleTokenDrag(tokenDoc, changes, options) {
  if (!isCommandVehicleToken(tokenDoc)) return undefined;
  if (options?.[POSITION_SYNC_OPTION]) return undefined;   // our own sync — let through

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

  // A drop on a pin rolls Set a Course and, on a hit, moves the token onto the
  // pin — the arrival the pipeline applies only with Ship Positioning and
  // Auto-Move Ship on Set a Course both on (index.js applyOutcomeEffects).
  // With either off, the drop was cancelled and the move rolled, yet the
  // token could never follow (issue #321 U54): the drag is a plain token move
  // instead — with positioning on, a position note (updateToken), no roll.
  if (!getShipPositioningEnabled() || !getShipAutoMoveOnCourse()) return undefined;

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
  return nearestNoteWhere(scene, x, y, radiusPx, isSettlementPin);
}

/** A settlement pin's flags: a settlement reference, not its planet or star. */
function isSettlementPin(flags) {
  return !!flags?.settlementId && !flags.planetNote && !flags.stellarNote;
}

/**
 * A charted site's pin: revealed (its label is the site's name) and linked to
 * the site's location Actor. An undiscovered pin reads "Unexplored Site" — its
 * name is not yet the table's, so it names no place (issue #335 Y14).
 */
function isChartedSitePin(flags) {
  return !!flags?.siteNote && flags.discovered === true && !!flags.actorId;
}

/** The Note closest to (x, y) within radiusPx whose flags pass `accepts`, or null. */
function nearestNoteWhere(scene, x, y, radiusPx, accepts) {
  const notes = scene?.notes?.contents ?? scene?.notes ?? [];
  if (!Array.isArray(notes) || !notes.length) return null;

  let best = null;
  let bestDist = Infinity;
  for (const n of notes) {
    if (!accepts(n?.flags?.[MODULE_ID])) continue;
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
 *
 * The destination is the settlement Actor the pin links (`flags.actorId`):
 * its current name is the course's target, and its id rides as
 * `forcedMoveTargetId` so the arrival records that settlement by id. The
 * pin's label was written once at scene creation — it went stale on an
 * Actor rename, and the arrival then resolved nothing by it, or a namesake
 * (issue #321 U52). A legacy pin with no linked Actor still uses its label.
 */
async function dispatchSetACourseFromTokenDrag(scene, settlementNote, tokenDoc) {
  if (!game?.user) return;
  const pinActorId = settlementNote.flags?.[MODULE_ID]?.actorId ?? null;
  const destActor  = pinActorId ? (game.actors?.get?.(pinActorId) ?? null) : null;
  const destinationName = destActor?.name || settlementNote.text || "the destination";

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
          ...(destActor ? { forcedMoveTargetId: destActor.id } : {}),
          // What the pipeline needs to move this token onto the pin on a
          // non-miss (moveCommandVehicleTokenToDestination).
          tokenDragSetCourse: {
            sceneId: scene.id,
            tokenId: tokenDoc.id,
            destX:   Number(settlementNote.x ?? 0),
            destY:   Number(settlementNote.y ?? 0),
          },
        },
      },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | Token-drag set_a_course dispatch failed:`, err);
  }
}

/**
 * Find a sector Scene's Note pin for a settlement id. Pure read — used by
 * the position→token sync so the map can follow fiction-side movement.
 * Excludes planet/stellar pins (same predicate family as
 * nearestSettlementNote). Returns null when no pin matches.
 *
 * Matches on either id space: position records written from a token
 * (finding #5) carry the settlement's Actor document id (`flags.actorId`),
 * while older records / wizard map data use the generator's settlement id
 * (`flags.settlementId`). A site's pin carries its location Actor's id as
 * `flags.actorId`, so a recorded location's id finds that pin (issue #335 Y14).
 */
export function findSettlementNoteById(scene, settlementId) {
  if (!settlementId) return null;
  const notes = scene?.notes?.contents ?? scene?.notes ?? [];
  if (!Array.isArray(notes)) return null;
  return notes.find(n => {
    const flags = n?.flags?.[MODULE_ID];
    return (flags?.settlementId === settlementId || flags?.actorId === settlementId)
      && !flags?.planetNote && !flags?.stellarNote;
  }) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// TOKEN → POSITION (v1.7.10 finding #5: the map is authoritative when a
// command-vehicle token sits on a sector scene)
// ─────────────────────────────────────────────────────────────────────────────

// "Near" association radius for token-derived positions, in grid cells.
// Looser than the snap radius (which triggers the set_a_course move on an
// exact pin drop) — a token parked in a settlement's neighbourhood reads as
// "near <settlement>", anything further is honest deep space.
function readNearRadiusCells() {
  return Math.max(readSnapRadius() * 3, 3);
}

/**
 * Build a §20 position record from a token's coordinates on a sector
 * Scene: the nearest settlement pin — or charted site pin, recorded as its
 * location (`nearestLocationId`, the id an arrival there records — issue #326
 * W65) — within the near radius when one exists, else deep space in the
 * scene's sector. A site's pin was never an anchor, so a ship parked on a
 * charted derelict was "deep space" (issue #335 Y14); an undiscovered one
 * still is, its name not yet the table's. Pure read.
 *
 * Its provenance is `token_placement` — the token's own place on the map,
 * where it was placed or moved off a pin, with no move made — which the
 * narrator's ship line reads as "near <settlement>" (decisions.md
 * 2026-06-12). Arriving ON a pin is a Set a Course: that arrival is
 * `scene_token`, read "docked at". Both were `scene_token`, so a ship parked
 * two cells off a pin, or auto-placed on a new map, was "docked at" it
 * (issue #321 U53).
 *
 * @param {Scene} scene — a Scene flagged { sectorScene, sectorId }
 * @param {number} x
 * @param {number} y
 * @returns {Object} position record (§20.2 shape)
 */
export function computeTokenPositionRecord(scene, x, y) {
  const gridSize = scene?.grid?.size ?? scene?.gridSize ?? 100;
  const radiusPx = readNearRadiusCells() * gridSize;
  const pin      = nearestNoteWhere(scene, Number(x ?? 0), Number(y ?? 0), radiusPx,
    flags => isSettlementPin(flags) || isChartedSitePin(flags));
  const pinFlags = pin?.flags?.[MODULE_ID] ?? null;
  const site     = isChartedSitePin(pinFlags);

  return {
    sectorId:            scene?.flags?.[MODULE_ID]?.sectorId ?? null,
    nearestPlanetId:     null,
    // Prefer the settlement's Actor document id — the id space the name
    // lookups and updateShip share. Legacy pins without actorId fall back
    // to the generator id; the pin label keeps the line readable either way.
    nearestSettlementId: site ? null : (pinFlags?.actorId ?? pinFlags?.settlementId ?? null),
    // Always written: setFlag merges key by key, so a record without the key
    // would keep an earlier arrival's location.
    nearestLocationId:   site ? pinFlags.actorId : null,
    freeText:            pin ? String(pin.text ?? "") : "deep space",
    updatedAt:           new Date().toISOString(),
    updatedBy:           "token_placement",
  };
}

/**
 * Persist a token-derived position record onto the command vehicle.
 * Skips when the record matches what is already stored (idempotent for
 * the wizard's anchored placement). Never throws.
 */
async function writeTokenDerivedPosition(scene, x, y) {
  try {
    const { getCommandVehicle, getCommandVehicleActorId, updateShip } =
      await import("../entities/ship.js");

    const campaignState = game.settings?.get?.(MODULE_ID, "campaignState") ?? {};
    const cvActorId = getCommandVehicleActorId(campaignState);
    if (!cvActorId) return null;

    const position = computeTokenPositionRecord(scene, x, y);
    const existing = getCommandVehicle(campaignState)?.position ?? null;
    if (
      existing
      && existing.nearestSettlementId === position.nearestSettlementId
      && (existing.nearestLocationId ?? null) === position.nearestLocationId
      && (existing.freeText ?? "") === position.freeText
      && existing.sectorId === position.sectorId
    ) return existing;   // no informational change — don't churn the record

    await updateShip(cvActorId, { position });
    const anchorId = position.nearestSettlementId ?? position.nearestLocationId;
    console.log(
      `${MODULE_ID} | ship position recorded from sector-scene token: ` +
      `${anchorId ? `near ${position.freeText || anchorId}` : position.freeText}`,
    );
    return position;
  } catch (err) {
    console.debug?.(`${MODULE_ID} | token-derived position write failed:`, err?.message ?? err);
    return null;
  }
}

/** Shared gating for the two token→position handlers. */
/**
 * Recognise the command-vehicle token by flag OR by actor identity. The
 * module stamps `flags[MODULE].commandVehicle` on tokens it auto-places, but
 * a GM dragging the ship actor from the sidebar creates a plain token with no
 * flag (v1.7.11 finding C) — so the position machinery, drag-to-Set-a-Course,
 * and fiction→token sync all ignored it. Resolving the token's actorId against
 * the registered command vehicle catches that case. Pure read; never throws.
 *
 * @param {TokenDocument} tokenDoc
 * @returns {boolean}
 */
export function isCommandVehicleToken(tokenDoc) {
  if (tokenDoc?.flags?.[MODULE_ID]?.commandVehicle) return true;
  const actorId = tokenDoc?.actorId ?? tokenDoc?.actor?.id ?? null;
  if (!actorId) return false;
  try {
    const state = game.settings?.get?.(MODULE_ID, "campaignState") ?? {};
    return actorId === getCommandVehicleActorId(state);
  } catch (err) {
    console.debug?.(`${MODULE_ID} | isCommandVehicleToken: resolve failed:`, err?.message ?? err);
    return false;
  }
}

function tokenPositionWriteApplies(tokenDoc, options) {
  if (!isCommandVehicleToken(tokenDoc)) return false;
  if (options?.[POSITION_SYNC_OPTION]) return false;   // fiction→token sync echo
  try {
    if (game.settings.get(MODULE_ID, "factContinuity.shipPositioning") === false) return false;
  } catch (err) {
    // Setting unregistered (tests, early init) — default on.
    console.debug?.(`${MODULE_ID} | token position gate: settings read failed:`, err?.message ?? err);
  }
  if (!isCanonicalGM()) return false;                  // world write — one client only
  const scene = tokenDoc.parent ?? tokenDoc.scene;
  return !!scene?.flags?.[MODULE_ID]?.sectorScene;
}

/**
 * createToken — a command-vehicle token placed on a sector scene (wizard
 * placement at sector creation, or the GM dropping the ship actor onto the
 * map) establishes the ship's position from where it landed.
 */
export function handleCommandVehicleTokenPlacement(tokenDoc, options, _userId) {
  if (!tokenPositionWriteApplies(tokenDoc, options)) return undefined;
  const scene = tokenDoc.parent ?? tokenDoc.scene;
  // Stamp the flag when this token was recognised by actor identity alone
  // (a sidebar drop, no flag). The fiction→token sync finds the token by
  // flag, so without this a manually-placed token would never follow later
  // story movement (finding C). Carries POSITION_SYNC_OPTION so the stamp
  // doesn't re-enter the position hooks.
  if (!tokenDoc?.flags?.[MODULE_ID]?.commandVehicle) {
    tokenDoc.update?.(
      { [`flags.${MODULE_ID}.commandVehicle`]: true },
      { [POSITION_SYNC_OPTION]: true },
    ).catch(err => console.debug?.(`${MODULE_ID} | command-vehicle flag stamp failed:`, err?.message ?? err));
  }
  // Hooks ignore the return value; returning the promise lets tests await
  // the write deterministically.
  return writeTokenDerivedPosition(scene, tokenDoc.x, tokenDoc.y).catch(err =>
    console.debug?.(`${MODULE_ID} | token placement position write failed:`, err?.message ?? err));
}

/**
 * updateToken — an off-pin reposition of the command-vehicle token is a
 * position note ("drifting near X" / deep space), with no move mechanics.
 * On-pin drops never reach here: the preUpdateToken handler cancels them
 * and routes through set_a_course; programmatic syncs carry
 * POSITION_SYNC_OPTION and are skipped by the shared gate.
 */
export function handleCommandVehicleTokenReposition(tokenDoc, changes, options, _userId) {
  const movedX = Number.isFinite(Number(changes?.x));
  const movedY = Number.isFinite(Number(changes?.y));
  if (!movedX && !movedY) return undefined;
  if (!tokenPositionWriteApplies(tokenDoc, options)) return undefined;
  const scene = tokenDoc.parent ?? tokenDoc.scene;
  return writeTokenDerivedPosition(scene, tokenDoc.x, tokenDoc.y).catch(err =>
    console.debug?.(`${MODULE_ID} | token reposition position write failed:`, err?.message ?? err));
}

/**
 * Position→token sync (Cluster C / F5 gap 1): when the command vehicle's
 * persistent position record updates from the fiction side — chat-typed
 * `set_a_course` / `finish_an_expedition`, the narrator sidecar, or `!at`
 * — move the Token on the sector Scene to match, closing the "narrator
 * says Lyra, token sits at Sepulcher" visual lie. The token-drag path
 * moves the Token itself (`moveCommandVehicleTokenToDestination`); callers
 * skip this sync for `source: "scene_token"`.
 *
 * A recorded location (`nearestLocationId` — an arrival at a site: Finish
 * an Expedition, `!at`, the Entities panel, the narrator) moves the Token
 * onto the pin that links that location Actor, a site's pin; the settlement
 * id alone was read, so the Token stayed on the settlement the ship had left
 * (issue #335 Y14). The record already names the place, and the pin shows
 * only its own label, so a site still unexplored at that moment is followed
 * too: the Finish an Expedition that charts a site records its arrival
 * before the reveal flips the pin.
 *
 * Free-text positions (no resolved settlement or location id) deliberately
 * do NOT move the Token — there is no pin to anchor to, and parking it at
 * an arbitrary point would be a different lie. See the ship-positioning
 * notes in docs/narrator/narrator-memory-architecture.md §8.5.
 *
 * Never throws; all failure paths log at debug and return null.
 *
 * @param {Object} position — the just-written position record (§20.2)
 * @param {Object} campaignState
 * @returns {Promise<TokenDocument|null>} the moved token, or null
 */
export async function syncCommandVehicleTokenToPosition(position, campaignState) {
  try {
    const anchorId = position?.nearestSettlementId || position?.nearestLocationId || null;
    if (!anchorId) return null;
    if (!game.user?.isGM) return null;

    try {
      const positioning = game.settings.get(MODULE_ID, "factContinuity.shipPositioning") !== false;
      const tokenAfford = game.settings.get(MODULE_ID, "factContinuity.shipTokenEnabled")  !== false;
      if (!positioning || !tokenAfford) return null;
    } catch (err) {
      console.debug?.(`${MODULE_ID} | token sync: settings read failed:`, err?.message ?? err);
    }

    // Resolve the sector Scene: the position's sector when known, else the
    // active sector. Scenes are flagged { sectorScene, sectorId } by
    // sceneBuilder.
    const sectorId = position.sectorId ?? campaignState?.activeSectorId ?? null;
    const scenes = game.scenes?.contents ?? [];
    const scene = scenes.find(s =>
      s?.flags?.[MODULE_ID]?.sectorScene
      && (!sectorId || s.flags[MODULE_ID].sectorId === sectorId),
    );
    if (!scene) return null;

    const tokens = scene.tokens?.contents ?? scene.tokens ?? [];
    const token = Array.isArray(tokens)
      ? tokens.find(t => t?.flags?.[MODULE_ID]?.commandVehicle)
      : null;
    if (!token) return null;

    const note = findSettlementNoteById(scene, anchorId);
    if (!note) return null;

    const destX = Number(note.x ?? 0);
    const destY = Number(note.y ?? 0);
    if (Number(token.x) === destX && Number(token.y) === destY) return token;

    // POSITION_SYNC_OPTION marks this as a fiction→token sync so the token
    // hooks don't treat our own move as a drag (set_a_course dispatch) or a
    // position statement (token→record write).
    await token.update({ x: destX, y: destY }, { [POSITION_SYNC_OPTION]: true });
    return token;
  } catch (err) {
    console.debug?.(`${MODULE_ID} | command-vehicle token sync failed:`, err?.message ?? err);
    return null;
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
    // Programmatic commit of an already-resolved set_a_course — not a drag,
    // not a new position statement (maybeUpdateShipPositionFromName wrote
    // the record). The option keeps the token hooks out of the way.
    await token.update({ x: payload.destX, y: payload.destY }, { [POSITION_SYNC_OPTION]: true });
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
