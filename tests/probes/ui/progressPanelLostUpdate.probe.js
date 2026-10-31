/**
 * PROBE (ui audit) — PROGRESS-PANEL-LOST-MARK
 *
 * Every Progress Tracks writer is load → modify → save of the WHOLE tracks
 * array (loadTracks = deepClone(journal.getFlag), saveTracks = setFlag), with
 * no in-flight guard or queue. Foundry updates the client's document only
 * when the server answers the update, so a second click that starts during
 * the first click's round trip loads the pre-update array and its save
 * overwrites the first: two quick "+" clicks on a dangerous fight mark 8
 * ticks, not 16 (and a "+" followed quickly by the position toggle loses one
 * of the two).
 *
 * The journal stub applies a setFlag only after a simulated server round
 * trip, the way a client document updates.
 *
 * Asserts the CORRECT behaviour (both clicks land), so it FAILS today.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";

const MODULE_ID = "starforged-companion";

let ProgressTrackApp;
let journal;
let savedJournal;

beforeAll(async () => {
  foundry.applications.api.DialogV2 = { confirm: async () => true };
  ({ ProgressTrackApp } = await import("../../../src/ui/progressTracks.js"));
});

function makeJournalWithRoundTrip(tracks, roundTripMs = 20) {
  const flags = { [`${MODULE_ID}.tracks`]: structuredClone(tracks) };
  return {
    id: "pt", name: "Starforged Progress Tracks",
    getFlag: (m, k) => flags[`${m}.${k}`],
    // The local document changes when the server's answer arrives.
    setFlag: (m, k, v) => new Promise(resolve => setTimeout(() => {
      flags[`${m}.${k}`] = structuredClone(v);
      resolve();
    }, roundTripMs)),
  };
}

beforeEach(() => {
  journal = makeJournalWithRoundTrip([
    { id: "fight-1", label: "Corsair boarding party", type: "combat", rank: "dangerous", ticks: 0, completed: false, combatState: null },
  ]);
  savedJournal = game.journal;
  game.journal = { ...savedJournal, find: (fn) => (fn(journal) ? journal : null) };
});

afterEach(() => { game.journal = savedJournal; });

describe("Progress Tracks panel — two quick clicks (PROGRESS-PANEL-LOST-MARK)", () => {
  it("two Mark Progress clicks 5 ms apart on a dangerous fight mark 16 ticks", async () => {
    const app = { render() {}, element: null };
    const click = () => ProgressTrackApp.DEFAULT_OPTIONS.actions.markProgress.call(app, {}, { dataset: { trackId: "fight-1" } });
    const first = click();
    await new Promise(r => setTimeout(r, 5));
    const second = click();
    await Promise.all([first, second]);
    // Today: 8 — the second click loaded the array before the first save landed.
    expect(journal.getFlag(MODULE_ID, "tracks")[0].ticks).toBe(16);
  });

  it("Mark Progress then the position toggle, in quick succession, keep both changes", async () => {
    const app = { render() {}, element: null };
    const a = ProgressTrackApp.DEFAULT_OPTIONS.actions.markProgress.call(app, {}, { dataset: { trackId: "fight-1" } });
    await new Promise(r => setTimeout(r, 5));
    const b = ProgressTrackApp.DEFAULT_OPTIONS.actions.toggleCombatState.call(app, {}, { dataset: { trackId: "fight-1" } });
    await Promise.all([a, b]);
    const t = journal.getFlag(MODULE_ID, "tracks")[0];
    expect({ ticks: t.ticks, combatState: t.combatState }).toEqual({ ticks: 8, combatState: "in_control" });
  });
});
