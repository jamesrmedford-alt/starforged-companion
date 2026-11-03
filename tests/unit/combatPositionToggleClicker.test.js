// tests/unit/combatPositionToggleClicker.test.js
// The Progress Tracks panel's position badge cycles the clicker's own PC's
// position (issue #326 W56). It sent `actorId: game.user.character?.id`,
// null for a GM with no character assigned (the usual solo setup), and the
// GM handler cycled the fight's last-set position: the badge said "In
// control" while the PC's own position — which every reader has preferred
// since issue #322 V03 — still steered the next Strike. The clicker's PC is
// now resolved by resolveUserActorId, and the handler cycles that PC's own.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { combatPositionFor } from "../../src/moves/combat.js";

const MODULE_ID = "starforged-companion";
const JOURNAL_NAME = "Starforged Progress Tracks";

function makeTracksJournal(tracks) {
  const flags = { [MODULE_ID]: { tracks: structuredClone(tracks) } };
  return {
    id: "pt-journal",
    name: JOURNAL_NAME,
    ownership: { default: 0 },
    getFlag: (mod, key) => flags[mod]?.[key],
    async setFlag(mod, key, value) { flags[mod] ??= {}; flags[mod][key] = structuredClone(value); },
  };
}

let journal;
let savedFind;
let savedCharacter;

beforeEach(() => {
  savedFind = game.journal.find;
  savedCharacter = game.user.character;
  journal = makeTracksJournal([{
    id: "fight-1", label: "Corsair boarding party", type: "combat", rank: "dangerous",
    ticks: 8, completed: false,
    // A Clash weak hit put Kira in a bad spot: the pipeline wrote her own
    // position and the fight's (applyCombatPositionToTrack with the roller).
    combatState: "bad_spot", positions: { "pc-kira": "bad_spot" }, createdAt: 1,
  }]);
  game.journal.find = (fn) => (fn(journal) ? journal : null);
  game.settings._store.set(`${MODULE_ID}.campaignState`, { clocks: [] });
  game.actors._reset();
  game.actors._set("pc-kira", makeTestActor({ id: "pc-kira", name: "Kira", ownership: { "test-user-gm": 3 } }));
});

afterEach(() => {
  game.journal.find = savedFind;
  game.user.character = savedCharacter;
  game.actors._reset();
  game.settings._store.delete(`${MODULE_ID}.campaignState`);
});

const stored = () => journal.getFlag(MODULE_ID, "tracks")[0];

async function clickBadge() {
  const { ProgressTrackApp } = await import("../../src/ui/progressTracks.js");
  const app = { render() {}, element: null };
  await ProgressTrackApp.DEFAULT_OPTIONS.actions.toggleCombatState.call(app, {}, { dataset: { trackId: "fight-1" } });
}

describe("the panel's position toggle cycles the clicker's own PC (issue #326 W56)", () => {
  it("a solo GM (no User#character) cycles the badge to 'In control' — Kira's next move should read 'in_control'", async () => {
    game.user.character = null;
    await clickBadge();   // bad_spot → neutral
    await clickBadge();   // neutral  → in_control
    const { getActiveCombatPosition } = await import("../../src/ui/progressTracks.js");

    const badge = stored().combatState;                       // what the panel's badge renders
    const interpreterReads = await getActiveCombatPosition("pc-kira");   // index.js:888
    const tdaReads = combatPositionFor(stored(), "pc-kira");            // statEnrichment.js:403

    expect(badge).toBe("in_control");
    // Both readers used to keep seeing Kira's own "bad_spot".
    expect({ interpreterReads, tdaReads }).toEqual({ interpreterReads: badge, tdaReads: badge });
  });

  it("control: a clicker whose User#character is the PC does change that PC's own position", async () => {
    game.user.character = game.actors.get("pc-kira");
    await clickBadge();   // bad_spot → neutral (own cleared)
    await clickBadge();   // neutral  → in_control
    const { getActiveCombatPosition } = await import("../../src/ui/progressTracks.js");
    expect(stored().positions["pc-kira"]).toBe("in_control");
    expect(await getActiveCombatPosition("pc-kira")).toBe("in_control");
  });
});
