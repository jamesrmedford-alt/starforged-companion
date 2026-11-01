/**
 * STARFORGED COMPANION
 * tests/unit/progressTracksWriteQueue.test.js
 *
 * Issue #321 U57 — no track write loses another. Every Progress Tracks
 * writer was load → modify → save of the WHOLE tracks array (the journal's
 * `tracks` flag) with nothing in between to queue them. Foundry updates the
 * client's document only when the server answers, so a write that started
 * during another's round trip loaded the pre-update array, and its save
 * overwrote the other: two quick "+" clicks on a dangerous fight marked 8
 * ticks, not 16, and a "+" racing the move pipeline's position write lost one
 * of the two. Every write on a client now runs one at a time, each on a fresh
 * read taken after the one before it landed (progressTracks.js writeTracks).
 *
 * The journal stub applies a setFlag only after a simulated server round
 * trip, the way a client document updates.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";

const MODULE_ID = "starforged-companion";

let store;
let journal;
let savedJournal;

beforeAll(async () => {
  foundry.applications.api.DialogV2 = { confirm: async () => true };
  store = await import("../../src/ui/progressTracks.js");
});

function makeJournalWithRoundTrip(tracks, roundTripMs = 20) {
  const flags = { [`${MODULE_ID}.tracks`]: structuredClone(tracks) };
  const journal = {
    id: "pt", name: "Starforged Progress Tracks",
    getFlag: (m, k) => flags[`${m}.${k}`],
    // The local document changes when the server's answer arrives.
    setFlag: (m, k, v) => new Promise((resolve, reject) => setTimeout(() => {
      if (journal.refuseNext) {
        journal.refuseNext = false;
        reject(new Error("test: the server refused the update"));
        return;
      }
      flags[`${m}.${k}`] = structuredClone(v);
      resolve();
    }, roundTripMs)),
    refuseNext: false,
  };
  return journal;
}

const fight = (over = {}) => ({
  id: "fight-1", label: "Corsair boarding party", type: "combat", rank: "dangerous",
  ticks: 0, completed: false, combatState: null, ...over,
});

beforeEach(() => {
  journal = makeJournalWithRoundTrip([
    fight(),
    { id: "exp-1", label: "Cross the Rift", type: "expedition", rank: "troublesome", ticks: 0, completed: false },
  ]);
  savedJournal = game.journal;
  game.journal = { ...savedJournal, find: (fn) => (fn(journal) ? journal : null) };
});

afterEach(() => { game.journal = savedJournal; });

const tracks = () => journal.getFlag(MODULE_ID, "tracks");
const track  = (id) => tracks().find(t => t.id === id);
const later  = (ms) => new Promise(r => setTimeout(r, ms));

describe("the Progress Tracks panel — two quick clicks keep both (issue #321 U57)", () => {
  it("two Mark Progress clicks 5 ms apart on a dangerous fight mark 16 ticks", async () => {
    const app = { render() {}, element: null };
    const click = () => store.ProgressTrackApp.DEFAULT_OPTIONS.actions.markProgress.call(app, {}, { dataset: { trackId: "fight-1" } });
    const first = click();
    await later(5);
    const second = click();
    await Promise.all([first, second]);
    expect(track("fight-1").ticks).toBe(16);
  });

  it("Mark Progress then the position toggle, in quick succession, keep both changes", async () => {
    const app = { render() {}, element: null };
    const a = store.ProgressTrackApp.DEFAULT_OPTIONS.actions.markProgress.call(app, {}, { dataset: { trackId: "fight-1" } });
    await later(5);
    const b = store.ProgressTrackApp.DEFAULT_OPTIONS.actions.toggleCombatState.call(app, {}, { dataset: { trackId: "fight-1" } });
    await Promise.all([a, b]);
    expect({ ticks: track("fight-1").ticks, combatState: track("fight-1").combatState })
      .toEqual({ ticks: 8, combatState: "in_control" });
  });
});

describe("track writers on one client run one at a time, each on a fresh read (issue #321 U57)", () => {
  it("two progress marks in flight together both land", async () => {
    await Promise.all([store.markProgressById("fight-1"), store.markProgressById("fight-1")]);
    expect(track("fight-1").ticks).toBe(16);
  });

  it("a panel + racing the move pipeline's position write keeps both", async () => {
    const app = { render() {}, element: null };
    const click = store.ProgressTrackApp.DEFAULT_OPTIONS.actions.markProgress.call(app, {}, { dataset: { trackId: "fight-1" } });
    await later(5);
    await Promise.all([click, store.setCombatTrackPosition("fight-1", "bad_spot")]);
    expect(track("fight-1")).toMatchObject({ ticks: 8, combatState: "bad_spot" });
  });

  it("a new track and a mark on another track, written together, both land", async () => {
    const [added] = await Promise.all([
      store.addProgressTrack({ label: "Raiders", type: "combat", rank: "formidable" }),
      store.markProgressById("exp-1"),
      store.updateTrackFields("fight-1", { objective: "Hold the airlock" }),
    ]);
    expect(tracks().map(t => t.id)).toEqual(["fight-1", "exp-1", added.id]);
    expect(track("exp-1").ticks).toBe(12);
    expect(track("fight-1").objective).toBe("Hold the airlock");
  });

  it("a completion racing a mark keeps the mark (the completed track is saved with it)", async () => {
    await Promise.all([store.markProgressById("fight-1"), store.completeProgressTrack("fight-1")]);
    expect(track("fight-1")).toMatchObject({ ticks: 8, completed: true });
  });

  it("a refused write does not wedge the next one, which reads what is stored", async () => {
    journal.refuseNext = true;
    const first  = store.markProgressById("fight-1");
    const second = store.markProgressById("fight-1");
    await expect(first).rejects.toThrow(/refused/);
    await expect(second).resolves.toMatchObject({ ticks: 8 });
    expect(track("fight-1").ticks).toBe(8);
  });
});
