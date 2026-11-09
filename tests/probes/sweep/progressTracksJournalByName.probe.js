/**
 * SWP-1 PROGRESS-TRACKS-JOURNAL-BY-NAME — twelfth audit, the lead's sweep.
 *
 * Every open fight, expedition and scene challenge lives in one flag on one
 * JournalEntry (decisions.md → "Progress tracks: single dedicated journal").
 * src/ui/progressTracks.js finds that journal by its display name alone —
 * getOrCreateJournal (:118-127), loadTracks (:139-142), and the readers at
 * :886, :916, :955; the interpreter's context too (src/moves/interpreter.js
 * :228, :245). A GM who renames the journal in the sidebar ("Campaign
 * Tracks") makes every track disappear: the panel, the narrator's OPEN
 * PROGRESS TRACKS, the interpreter's track list and every finisher read an
 * empty list, and the next track write creates a second, empty "Starforged
 * Progress Tracks" journal beside the renamed one, which keeps the tracks
 * nothing reads again.
 *
 * The same identity-by-name defect was fixed for the Chronicle (issue #301
 * B03 — chronicleActorId flag), the Private Channel transcript (#306 R08 —
 * privateChannelOwner flag), the world truths journal (#321 U67, #342 Z16 —
 * the linked id) — rules/reachability.md §6. The journal carries no module
 * flag or recorded id the lookup could use instead.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";

const MODULE_ID = "starforged-companion";

let store;
let journals;
let created;
let savedJournal;
let savedCreate;

function makeJournal(name, tracks) {
  const flags = { [`${MODULE_ID}.tracks`]: structuredClone(tracks) };
  return {
    id: `j-${Math.random().toString(36).slice(2, 8)}`,
    name,
    flags: {},
    getFlag: (m, k) => flags[`${m}.${k}`],
    setFlag: async (m, k, v) => { flags[`${m}.${k}`] = structuredClone(v); },
  };
}

const fight = { id: "fight-1", label: "Corsair boarding party", type: "combat", rank: "dangerous", ticks: 8, completed: false, combatState: null };
const expedition = { id: "exp-1", label: "Cross the Rift", type: "expedition", rank: "troublesome", ticks: 12, completed: false };

beforeAll(async () => {
  store = await import("../../../src/ui/progressTracks.js");
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

describe("SWP-1 the Progress Tracks journal is found by its name", () => {
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
});
