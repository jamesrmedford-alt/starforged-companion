/**
 * STARFORGED COMPANION
 * tests/unit/progressTracksJournalRenamed.test.js
 *
 * Issue #345 AA62 (PROGRESS-TRACKS-JOURNAL-BY-NAME, the audit's SWP-1 probe).
 * Every open fight, expedition and scene challenge lives in one flag on one
 * JournalEntry (decisions.md → "Progress tracks: single dedicated journal").
 * src/ui/progressTracks.js found that journal by its display name alone —
 * getOrCreateJournal, loadTracks, the readers (getActiveCombatPosition,
 * getActiveCombatTrack, listOpenProgressTracks) and the panel's refresh hook;
 * the interpreter's context too (interpreter.js readOpenTrackLabels). A GM
 * who renamed the journal in the sidebar ("Campaign Tracks") made every
 * track disappear — the panel, the narrator's OPEN PROGRESS TRACKS, the
 * interpreter's track list and every finisher read an empty list — and the
 * next track write created a second, empty "Starforged Progress Tracks"
 * journal beside the renamed one.
 *
 * Now the journal is the one carrying the tracks flag — the stable mark a
 * rename leaves alone — and the name only finds a journal no track was saved
 * to yet (rules/reachability.md §6; the Chronicle's B03, the Private
 * Channel's R08, the truths journal's Z16).
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { StubElement } from "../helpers/cardDom.js";

const MODULE_ID = "starforged-companion";

let store;
let interpreter;
let journals;
let created;
let savedJournal;
let savedCreate;

function makeJournal(name, tracks) {
  const flags = tracks === undefined ? {} : { [`${MODULE_ID}.tracks`]: structuredClone(tracks) };
  return {
    id: `j-${Math.random().toString(36).slice(2, 8)}`,
    name,
    flags: {},
    getFlag: (m, k) => flags[`${m}.${k}`],
    setFlag: async (m, k, v) => { flags[`${m}.${k}`] = structuredClone(v); },
  };
}

const fight = { id: "fight-1", label: "Corsair boarding party", type: "combat", rank: "dangerous", ticks: 8, completed: false, combatState: "in_control" };
const expedition = { id: "exp-1", label: "Cross the Rift", type: "expedition", rank: "troublesome", ticks: 12, completed: false };

beforeAll(async () => {
  store = await import("../../src/ui/progressTracks.js");
  interpreter = await import("../../src/moves/interpreter.js");
  store.registerProgressTrackHooks();
});

beforeEach(() => {
  journals = [makeJournal("Starforged Progress Tracks", [fight, expedition])];
  created = [];
  savedJournal = game.journal;
  savedCreate = globalThis.JournalEntry;
  game.journal = {
    ...savedJournal,
    find: (fn) => journals.find(fn) ?? undefined,
    get: (id) => journals.find(j => j.id === id) ?? undefined,
    contents: journals,
    [Symbol.iterator]: function* () { yield* journals; },
  };
  globalThis.JournalEntry = {
    create: async (data) => {
      const j = makeJournal(data.name, []);
      journals.push(j);
      created.push(j);
      return j;
    },
  };
});

afterEach(() => {
  game.journal = savedJournal;
  globalThis.JournalEntry = savedCreate;
});

describe("issue #345 AA62 — the Progress Tracks journal is found by its tracks, not its name", () => {
  it("control: the open fight and expedition are listed", async () => {
    const tracks = await store.listProgressTracks();
    expect(tracks.map(t => t.id)).toEqual(["fight-1", "exp-1"]);
    expect(store.listOpenProgressTracks().map(t => t.id)).toEqual(["fight-1", "exp-1"]);
  });

  it("a GM renames the journal in the sidebar — the open tracks are still listed", async () => {
    journals[0].name = "Campaign Tracks";
    const tracks = await store.listProgressTracks();
    expect(tracks.map(t => t.id), "the panel and the finishers read the tracks").toEqual(["fight-1", "exp-1"]);
    expect(store.listOpenProgressTracks().map(t => t.id), "the narrator's OPEN PROGRESS TRACKS").toEqual(["fight-1", "exp-1"]);
  });

  it("a GM renames the journal — the next new track joins the existing ones, no second journal", async () => {
    journals[0].name = "Campaign Tracks";
    await store.addProgressTrack({ label: "Smugglers at the dock", type: "combat", rank: "formidable" });
    expect(created.length, "a second, empty Starforged Progress Tracks journal").toBe(0);
    const tracks = await store.listProgressTracks();
    expect(tracks.map(t => t.label)).toEqual(["Corsair boarding party", "Cross the Rift", "Smugglers at the dock"]);
  });

  it("after the rename the move pipeline's fight readers still see the fight", async () => {
    journals[0].name = "Campaign Tracks";
    expect((await store.getActiveCombatTrack())?.id, "the sole open fight").toBe("fight-1");
    expect(await store.getActiveCombatPosition(), "its position").toBe("in_control");
  });

  it("after the rename the interpreter is still told the open tracks", () => {
    journals[0].name = "Campaign Tracks";
    expect(interpreter.buildContextSummary({}))
      .toContain('Open progress tracks: combat "Corsair boarding party", expedition "Cross the Rift"');
  });

  it("an open panel re-renders when the renamed journal's tracks change", async () => {
    const savedDocument = globalThis.document;
    globalThis.document = { createElement: (tag) => new StubElement(tag), activeElement: null };
    try {
      const app = store.ProgressTrackApp.open();
      let renders = 0;
      app.rendered = true;
      app.render = () => { renders += 1; };
      journals[0].name = "Campaign Tracks";
      const tracks = [{ ...fight, ticks: 16 }, expedition];
      await journals[0].setFlag(MODULE_ID, "tracks", tracks);
      await Hooks.call("updateJournalEntry", journals[0], { flags: { [MODULE_ID]: { tracks } } }, {}, "gm-1");
      expect(renders).toBe(1);
      // Another journal's change is not the panel's.
      await Hooks.call("updateJournalEntry", { id: "j-other", name: "Starforged Progress Tracks", getFlag: () => undefined }, { name: "x" }, {}, "gm-1");
      expect(renders).toBe(1);
      app.rendered = false;
    } finally {
      globalThis.document = savedDocument;
    }
  });

  it("a journal of the name that holds no track yet is still the one written — no second journal", async () => {
    journals.length = 0;
    journals.push(makeJournal("Starforged Progress Tracks"));   // no tracks flag yet
    await store.addProgressTrack({ label: "Smugglers at the dock", type: "combat", rank: "formidable" });
    expect(created.length).toBe(0);
    expect(journals[0].getFlag(MODULE_ID, "tracks").map(t => t.label)).toEqual(["Smugglers at the dock"]);
  });

  it("control: with no journal at all, the first track write creates it, and a read creates nothing", async () => {
    journals.length = 0;
    expect(await store.listProgressTracks()).toEqual([]);
    expect(created.length, "a read creates nothing").toBe(0);
    await store.addProgressTrack({ label: "Smugglers at the dock", type: "combat", rank: "formidable" });
    expect(created.map(j => j.name)).toEqual(["Starforged Progress Tracks"]);
  });
});
