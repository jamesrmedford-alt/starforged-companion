/**
 * Probe UI-01 — PANEL-POSITION-TOGGLE-FIGHT-ONLY (WRONG-DETAIL)
 *
 * What the user does: a fight is open and a move has put Kira "in a bad spot"
 * (the pipeline records her own position, positions[pc-kira], beside the
 * fight's last-set one). The module "missed a flip", so the GM — solo, with no
 * character assigned in User Configuration, the usual GM setup — cycles the
 * Progress Tracks panel's position badge to "In control", as the help's
 * Progress Tracks page tells them to ("you can toggle it manually if the
 * module missed a flip").
 *
 * What happens: the toggle sends `actorId: game.user.character?.id` — null for
 * that GM — so applyProgressTrackEditFromRelay cycles and writes only the
 * fight's last-set `combatState`. Since issue #322 V03 the roller's OWN
 * position wins everywhere it is read (getActiveCombatPosition for the
 * interpreter's directive, combatPositionFor for Take Decisive Action's
 * downgrade), so Kira's next Strike is still remapped to Clash and her TDA is
 * still downgraded, while the badge reads "In control".
 *
 * What should happen: the position the badge shows is the position the PC's
 * next move reads (the toggle changes the clicker's character — resolved with
 * speaker.resolveUserActorId, not raw User#character — and cycles from that
 * character's own position).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { combatPositionFor } from "../../../src/moves/combat.js";

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
  const { ProgressTrackApp } = await import("../../../src/ui/progressTracks.js");
  const app = { render() {}, element: null };
  await ProgressTrackApp.DEFAULT_OPTIONS.actions.toggleCombatState.call(app, {}, { dataset: { trackId: "fight-1" } });
}

describe("UI-01 the panel's position toggle and the position a PC's next move reads", () => {
  it("a solo GM (no User#character) cycles the badge to 'In control' — Kira's next move should read 'in_control'", async () => {
    game.user.character = null;
    await clickBadge();   // bad_spot → neutral
    await clickBadge();   // neutral  → in_control
    const { getActiveCombatPosition } = await import("../../../src/ui/progressTracks.js");

    const badge = stored().combatState;                       // what the panel's badge renders
    const interpreterReads = await getActiveCombatPosition("pc-kira");   // index.js:888
    const tdaReads = combatPositionFor(stored(), "pc-kira");            // statEnrichment.js:403

    expect(badge).toBe("in_control");
    // FAILS today: both readers still see Kira's own "bad_spot".
    expect({ interpreterReads, tdaReads }).toEqual({ interpreterReads: badge, tdaReads: badge });
  });

  it("control: a clicker whose User#character is the PC does change that PC's own position", async () => {
    game.user.character = game.actors.get("pc-kira");
    await clickBadge();   // bad_spot → neutral (own cleared)
    await clickBadge();   // neutral  → in_control
    const { getActiveCombatPosition } = await import("../../../src/ui/progressTracks.js");
    expect(stored().positions["pc-kira"]).toBe("in_control");
    expect(await getActiveCombatPosition("pc-kira")).toBe("in_control");
  });
});
