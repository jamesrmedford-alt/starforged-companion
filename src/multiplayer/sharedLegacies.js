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
 *   - a sheet edit (the Legacies tab's ▸ / ◂) flows back: the canonical GM
 *     moves the shared track by what the edit changed on that sheet — the
 *     sheet's value before the edit is stamped into the update's options by
 *     the client that makes it — and mirrors it to every PC. A sheet that
 *     lagged the shared track (a PC made since the GM's load, an imported
 *     export, a refused mirror write) marks one tick with one ▸; it never sets
 *     the crew's track to its own lower value (issue #347 AB07);
 *   - a PC created mid-session is brought to the shared tracks at once, as the
 *     ready backfill would bring it at the next load;
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
import { serialiseCampaignStateWrite } from "./campaignStateChain.js";

const MODULE_ID = "starforged-companion";

// The mirror marks its sheet writes with this update option, so the hook can
// tell its own writes from a player's edit.
const MIRROR_OPTION = "legacySheetMirror";
const mirrorOptions = () => ({ [MODULE_ID]: { [MIRROR_OPTION]: true } });

// A sheet edit's legacy values before it was made — `{ [track]: ticks }`. The
// client that makes the edit stamps them into the update's options
// (preUpdateActor runs there, while the document still holds the old value),
// and the options reach the canonical GM's updateActor hook with the change.
// The GM moves the shared track by the difference: the vendor ▸ writes the
// sheet's own value + 1, so a sheet behind the crew's track would otherwise
// set the track down to its own value (issue #347 AB07).
const BEFORE_OPTION = "legacySheetBefore";

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
 * Read and written at its turn on the client's campaignState write chain
 * (CAMPSTATE-CHAIN-REST). `progress` may be a function of the stored progress
 * read at that turn — a sheet edit's change applied to the track as it is
 * then (issue #347 AB07).
 *
 * @param {"quests"|"bonds"|"discoveries"} track
 * @param {number|((stored: number) => number)} progressOrFn
 * @returns {Promise<boolean>} whether a write was made
 */
function setSharedProgress(track, progressOrFn) {
  return serialiseCampaignStateWrite(async () => {
    const stored = game.settings.get(MODULE_ID, "campaignState") ?? {};
    const current  = legacyProgress(stored.legacyTracks?.[track]);
    const progress = Math.max(0, Math.floor(Number(
      typeof progressOrFn === "function" ? progressOrFn(current) : progressOrFn) || 0));
    if (current === progress) return false;
    await game.settings.set(MODULE_ID, "campaignState", {
      ...stored,
      legacyTracks: { ...(stored.legacyTracks ?? {}), [track]: legacyTrackFromProgress(progress) },
    });
    return true;
  }, "shared legacy track");
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

// One sync pass at a time; a sheet edit that lands mid-pass joins the next
// pass. Queued per track: an edit whose value before is known adds its change
// to what is queued (two quick ▸ are two ticks), and one whose value before
// is unknown sets the track to its value (the newest such wins), with any
// change queued after it added on top.
const _sync = { running: false, next: null };

/**
 * The shared-track edits a sheet update carries: `{ track, delta }` when the
 * editing client stamped the sheet's value before the edit, else
 * `{ track, absolute }` — an edit made where the module did not stamp it.
 */
function sheetEdits(change, options) {
  const before = options?.[MODULE_ID]?.[BEFORE_OPTION] ?? null;
  return SHEET_LEGACY_TRACKS
    .map(t => ({ track: t, value: legacyChange(change, t) }))
    .filter(e => e.value !== undefined)
    .map(e => {
      const value = Math.max(0, Math.floor(Number(e.value) || 0));
      const was   = Number(before?.[e.track]);
      return Number.isFinite(was)
        ? { track: e.track, delta: value - Math.max(0, Math.floor(was)) }
        : { track: e.track, absolute: value };
    });
}

/** Fold newly arrived edits into the queued pass, per track. */
function queueEdits(queued, edits) {
  const next = new Map((queued ?? []).map(q => [q.track, q]));
  for (const e of edits) {
    const prev = next.get(e.track);
    next.set(e.track, e.absolute !== undefined
      ? { track: e.track, absolute: e.absolute, delta: 0 }
      : { track: e.track, absolute: prev?.absolute ?? null, delta: (prev?.delta ?? 0) + e.delta });
  }
  return [...next.values()];
}

/**
 * Register the sheet → shared track flow. Single-writer via isCanonicalGM (the
 * GM may write every PC and the world). Register once on ready, on all
 * clients: every client stamps the sheet's values before an edit it makes
 * (preUpdateActor); only the canonical GM writes.
 */
export function registerLegacySheetSyncHook() {
  if (registerLegacySheetSyncHook._installed) return;
  registerLegacySheetSyncHook._installed = true;
  // Every client, where an update is requested: stamp the edited tracks'
  // values before the edit into its options (BEFORE_OPTION). Never cancels.
  Hooks.on("preUpdateActor", (actor, change, options) => {
    try {
      if (!options || !isPlayerCharacterActor(actor)) return;
      if (options[MODULE_ID]?.[MIRROR_OPTION]) return;               // our own mirror write
      const before = {};
      for (const track of SHEET_LEGACY_TRACKS) {
        if (legacyChange(change, track) !== undefined) before[track] = readSheetLegacy(actor, track);
      }
      if (!Object.keys(before).length) return;
      options[MODULE_ID] = { ...(options[MODULE_ID] ?? {}), [BEFORE_OPTION]: before };
    } catch (err) {
      console.warn(`${MODULE_ID} | legacy sheet sync: could not note the sheet's legacies before an edit:`, err?.message ?? err);
    }
  });
  // A PC made mid-session starts at the crew's tracks — its sheet would show
  // 0 until the next GM load, and its first ▸ was taken as the crew's value.
  Hooks.on("createActor", (actor) => {
    try {
      if (!isCanonicalGM() || !isPlayerCharacterActor(actor)) return;
      backfillLegacySheets().catch(err =>
        console.warn(`${MODULE_ID} | legacy sheet sync: a new character's legacies were not set:`, err?.message ?? err));
    } catch (err) {
      console.warn(`${MODULE_ID} | legacy sheet sync: a new character's legacies were not set:`, err?.message ?? err);
    }
  });
  Hooks.on("updateActor", async (actor, change, options) => {
    try {
      if (!isCanonicalGM()) return;
      if (!isPlayerCharacterActor(actor)) return;
      if (options?.[MODULE_ID]?.[MIRROR_OPTION]) return;             // our own mirror write
      const edits = sheetEdits(change, options);
      if (!edits.length) return;
      _sync.next = queueEdits(_sync.next, edits);
      if (_sync.running) return;
      _sync.running = true;
      try {
        while (_sync.next) {
          const pass = _sync.next;
          _sync.next = null;
          for (const { track, absolute, delta } of pass) {
            // Each track stands alone (issue #331 X52's rule): a refused save
            // of the shared track is warned and named to the GM, and the pass
            // goes on to the other tracks and to an edit queued meanwhile — it
            // threw out of the pass, skipping both.
            try {
              await setSharedProgress(track, stored => (absolute ?? stored) + delta);
            } catch (err) {
              console.warn(`${MODULE_ID} | legacy sheet sync: the shared ${track} legacy was not saved:`, err?.message ?? err);
              globalThis.ui?.notifications?.warn?.(`Shared legacy: the crew's ${track} legacy could not be saved — mark it again.`);
            }
            // The sheets follow the shared track as stored: the edit, or —
            // refused — the value the world kept, so no sheet stays ahead of
            // the canonical track (rules/reachability.md §5).
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
