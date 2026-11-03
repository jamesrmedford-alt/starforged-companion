/**
 * STARFORGED COMPANION
 * src/multiplayer/sharedLegacies.js — the crew's legacy tracks on every sheet.
 *
 * The legacy tracks are shared by the crew and canonical in
 * `campaignState.legacyTracks` (decisions.md → "Legacy XP pays at the tick
 * write, to every player character"). The Starforged character sheet shows
 * neither those ticks nor the XP they earn: its Legacies tab draws each legacy
 * from the PC's own `system.legacies.<track>` and derives XP from it, and its
 * sheet has no `system.xp` (the classic sheet's field, where the module used
 * to award XP). So the shared track is written through to every PC's sheet
 * (issue #326 D3):
 *
 *   - after every saved legacy mark (index.js payLegacyMark → mirrorLegacyToSheets),
 *     each PC's sheet is set to the stored track's progress — ticks ever marked;
 *   - a sheet edit (the Legacies tab's ▸ / ◂) flows back as the shared supply
 *     does (sharedSupply.js): the canonical GM sets the shared track to it and
 *     mirrors it to the other PCs;
 *   - at ready, the canonical GM backfills the sheets: a track a sheet shows
 *     further along than the shared one (tracked on the sheet before the
 *     mirror) raises the shared track, and every sheet is set to it.
 *
 * Each PC's XP spent (`<track>XpSpent`) stays the PC's own. All writes go
 * through actorBridge (writeSheetLegacy); the mirror's writes carry an update
 * option so they never cascade back through the hook.
 */

import { getPlayerActors, isPlayerCharacterActor, readSheetLegacy, writeSheetLegacy, SHEET_LEGACY_TRACKS } from "../character/actorBridge.js";
import { legacyProgress, legacyTrackFromProgress } from "../moves/legacyTracks.js";
import { isCanonicalGM } from "./gmGate.js";

const MODULE_ID = "starforged-companion";

// The mirror marks its sheet writes with this update option, so the hook can
// tell its own writes from a player's edit.
const MIRROR_OPTION = "legacySheetMirror";
const mirrorOptions = () => ({ [MODULE_ID]: { [MIRROR_OPTION]: true } });

/** The shared track's progress (ticks ever marked) as the world stores it now. */
function storedProgress(track) {
  const stored = game.settings.get(MODULE_ID, "campaignState") ?? {};
  return legacyProgress(stored.legacyTracks?.[track]);
}

/**
 * Set every PC's sheet — or `pcs` — to the shared track as stored. Call once
 * the write that saved the track has landed. Each sheet stands alone: a
 * refused write is returned, the others still made.
 *
 * @param {"quests"|"bonds"|"discoveries"} track
 * @param {{ pcs?: Actor[]|null }} [opts]
 * @returns {Promise<{ written: Actor[], failed: Array<{ actor: Actor, error: string }>, progress: number }>}
 */
export async function mirrorLegacyToSheets(track, { pcs = null } = {}) {
  const progress = storedProgress(track);
  const written = [];
  const failed  = [];
  for (const actor of pcs ?? getPlayerActors()) {
    try {
      await writeSheetLegacy(actor, track, progress, mirrorOptions());
      written.push(actor);
    } catch (err) {
      console.warn(`${MODULE_ID} | legacy mirror: ${track} on ${actor?.name ?? actor?.id} refused:`, err?.message ?? err);
      failed.push({ actor, error: String(err?.message ?? err) });
    }
  }
  return { written, failed, progress };
}

/**
 * Save the shared track as `progress` (a copy of the stored state — the cached
 * value must stay as it was if the world refuses the write), then mirror it.
 */
async function setSharedProgress(track, progress) {
  const stored = game.settings.get(MODULE_ID, "campaignState") ?? {};
  if (legacyProgress(stored.legacyTracks?.[track]) === progress) return false;
  await game.settings.set(MODULE_ID, "campaignState", {
    ...stored,
    legacyTracks: { ...(stored.legacyTracks ?? {}), [track]: legacyTrackFromProgress(progress) },
  });
  return true;
}

/**
 * A sheet legacy an updateActor delta sets, or undefined. Foundry passes the
 * expanded diff (`{ system: { legacies: { quests } } }`); a flat
 * `"system.legacies.quests"` key is read too.
 */
function legacyChange(change, track) {
  const expanded = change?.system?.legacies?.[track];
  return expanded !== undefined ? expanded : change?.[`system.legacies.${track}`];
}

// One sync pass at a time; a sheet edit that lands mid-pass is the next pass
// (newest wins), as the shared supply's queue does.
const _sync = { running: false, next: null };

/**
 * Register the sheet → shared track flow. Single-writer via isCanonicalGM (the
 * GM may write every PC and the world). Register once on ready (all clients;
 * non-canonical no-op).
 */
export function registerLegacySheetSyncHook() {
  if (registerLegacySheetSyncHook._installed) return;
  registerLegacySheetSyncHook._installed = true;
  Hooks.on("updateActor", async (actor, change, options) => {
    try {
      if (!isCanonicalGM()) return;
      if (!isPlayerCharacterActor(actor)) return;
      if (options?.[MODULE_ID]?.[MIRROR_OPTION]) return;             // our own mirror write
      const edits = SHEET_LEGACY_TRACKS
        .map(t => ({ track: t, value: legacyChange(change, t) }))
        .filter(e => e.value !== undefined)
        .map(e => ({ track: e.track, progress: Math.max(0, Math.floor(Number(e.value) || 0)) }));
      if (!edits.length) return;
      _sync.next = [...(_sync.next ?? []).filter(e => !edits.some(n => n.track === e.track)), ...edits];
      if (_sync.running) return;
      _sync.running = true;
      try {
        while (_sync.next) {
          const pass = _sync.next;
          _sync.next = null;
          for (const { track, progress } of pass) {
            await setSharedProgress(track, progress);
            const { failed } = await mirrorLegacyToSheets(track);
            if (failed.length) console.warn(`${MODULE_ID} | legacy mirror: ${failed.length} sheet(s) not updated for ${track}.`);
          }
        }
      } finally {
        _sync.running = false;
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | legacy sheet sync failed:`, err?.message ?? err);
    }
  });
}

/**
 * Canonical GM, at ready: bring every PC's sheet to the shared tracks. A sheet
 * further along than the shared track (marked on the sheet before the mirror
 * existed, or while no GM was connected) raises the shared track to it — no
 * mark is lost — and every sheet is then set to the shared value. Writes only
 * what differs, so after the first run it is a no-op unless something drifted.
 *
 * @returns {Promise<{ raised: string[], written: number }>}
 */
export async function backfillLegacySheets() {
  const raised = [];
  let written = 0;
  if (!isCanonicalGM()) return { raised, written };
  try {
    const pcs = getPlayerActors();
    for (const track of SHEET_LEGACY_TRACKS) {
      const shared = storedProgress(track);
      const ahead  = Math.max(shared, ...pcs.map(pc => readSheetLegacy(pc, track)));
      if (ahead > shared && await setSharedProgress(track, ahead)) raised.push(track);
      const target = storedProgress(track);
      for (const pc of pcs) {
        if (readSheetLegacy(pc, track) === target) continue;
        try {
          if (await writeSheetLegacy(pc, track, target, mirrorOptions())) written += 1;
        } catch (err) {
          console.warn(`${MODULE_ID} | legacy backfill: ${track} on ${pc?.name ?? pc?.id} refused:`, err?.message ?? err);
        }
      }
    }
    if (raised.length) {
      console.info(`${MODULE_ID} | legacy backfill: ${raised.join(", ")} raised to the furthest character sheet.`);
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | legacy backfill failed:`, err?.message ?? err);
  }
  return { raised, written };
}
