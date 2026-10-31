/**
 * STARFORGED COMPANION
 * tests/unit/progressTracksPanelRelay.test.js
 *
 * Issue #321 U05 — players use the Progress Tracks panel. The panel is on
 * every user's toolbar, but the "Starforged Progress Tracks" journal is the
 * GM's document (created `ownership: NONE`): every action wrote it directly,
 * so a player's +, −, ✓, position toggle, ✕ and Add were refused ("User Pat
 * lacks permission to update JournalEntry") and nothing relayed them. Each
 * panel edit is now asked of the canonical GM ("progressTrack.edit" →
 * applyProgressTrackEditFromRelay), locally on that GM, relayed from anyone
 * else.
 *
 * The journal stub is permission-faithful the way tests/setup.js's Actor stub
 * is (tests/helpers/foundryPermissions.js): a non-owner's setFlag rejects
 * with Foundry's wording.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { simulateTable, USERS } from "../helpers/multiClient.js";
import { userOwnsDocument, permissionError } from "../helpers/foundryPermissions.js";

const MODULE_ID = "starforged-companion";

function makeTracksJournal(tracks) {
  const flags = { [MODULE_ID]: { tracks: structuredClone(tracks) } };
  const journal = {
    id:        "pt-journal",
    name:      "Starforged Progress Tracks",
    // progressTracks.js getOrCreateJournal: ownership { default: NONE }
    ownership: { default: 0 },
    getFlag:   (mod, key) => flags[mod]?.[key],
    async setFlag(mod, key, value) {
      const user = globalThis.game?.user;
      if (!userOwnsDocument(user, journal)) {
        throw permissionError(user, "update", "JournalEntry", journal.id, "needs OWNER permission");
      }
      flags[mod] ??= {};
      flags[mod][key] = structuredClone(value);
    },
  };
  return journal;
}

const fight = (over = {}) => ({
  id: "fight-1", label: "Corsair boarding party", type: "combat", rank: "dangerous",
  ticks: 0, completed: false, combatState: null, createdAt: 1, ...over,
});

describe("Progress Tracks panel — a player's click lands through the canonical GM (issue #321 U05)", () => {
  let table;
  let journal;

  beforeAll(async () => {
    table = await simulateTable({ users: [USERS.GM, USERS.P1] });
  }, 30_000);
  afterAll(() => table?.teardown());

  beforeEach(async () => {
    await table.reset({ world: { settings: { campaignState: { sessionActive: true, clocks: [] } } } });
    journal = makeTracksJournal([fight()]);
    table.journal.set(journal.id, journal);
  });

  const stored = (id = "fight-1") => journal.getFlag(MODULE_ID, "tracks").find(t => t.id === id);

  /** Run a panel action on `userId`'s client; the error it threw, or null. */
  async function click(userId, action, dataset, app = { render() {}, element: null }) {
    const client = table.client(userId);
    const { ProgressTrackApp } = await client.import("../../src/ui/progressTracks.js");
    let error = null;
    await client.run(() => ProgressTrackApp.DEFAULT_OPTIONS.actions[action].call(app, {}, { dataset }))
      .catch(err => { error = err; });
    await table.settle();
    return error;
  }

  it("a player's Mark Progress (+) on a dangerous fight lands: 0 → 8 ticks", async () => {
    const error = await click("pl-1", "markProgress", { trackId: "fight-1" });
    expect({ ticks: stored().ticks, error: error?.message ?? null }).toEqual({ ticks: 8, error: null });
  });

  it("a player's position toggle (Neutral → In control) lands", async () => {
    await click("pl-1", "toggleCombatState", { trackId: "fight-1" });
    expect(stored().combatState).toBe("in_control");
  });

  it("a player's − clears one box, and ✓ completes the fight", async () => {
    journal = makeTracksJournal([fight({ ticks: 12 })]);
    table.journal.set(journal.id, journal);
    await click("pl-1", "clearProgress", { trackId: "fight-1" });
    expect(stored().ticks).toBe(8);
    await click("pl-1", "completeTrack", { trackId: "fight-1" });
    expect(stored()).toMatchObject({ completed: true, ticks: 8 });
  });

  it("a player's ✕ asks the player to confirm — on their own screen — then the GM removes the track", async () => {
    table.client("pl-1").answerDialogs(d => d.choose("yes"));
    await click("pl-1", "removeTrack", { trackId: "fight-1" });
    expect(journal.getFlag(MODULE_ID, "tracks")).toEqual([]);
    expect(table.client("pl-1").dialogs).toHaveLength(1);
    expect(table.client("gm-1").dialogs).toHaveLength(0);
  });

  it("a player's Add creates the track — and a scene challenge's paired danger clock — on the GM", async () => {
    const values = { newLabel: "  Escape the flooding chamber  ", newType: "scene_challenge", newRank: "formidable" };
    const inputs = Object.fromEntries(Object.entries(values).map(([name, value]) => [name, { value, focus() {} }]));
    const panel  = { querySelector: (sel) => inputs[/name="(\w+)"/.exec(sel)?.[1]] ?? null };
    const app    = { render() {}, element: { querySelector: () => panel } };

    await click("pl-1", "addTrack", {}, app);

    const added = journal.getFlag(MODULE_ID, "tracks").find(t => t.type === "scene_challenge");
    expect(added).toMatchObject({ label: "Escape the flooding chamber", rank: "formidable", ticks: 0, completed: false });
    const clocks = table.world.campaignState().clocks;
    expect(clocks).toHaveLength(1);
    expect(clocks[0]).toMatchObject({ _id: added.tensionClockId, name: "Escape the flooding chamber", segments: 4, type: "tension" });
    expect(inputs.newLabel.value).toBe("");
  });

  it("with no GM connected, a player's click warns and changes nothing", async () => {
    await table.leave("gm-1");
    const error = await click("pl-1", "markProgress", { trackId: "fight-1" });
    expect(error).toBeNull();
    expect(stored().ticks).toBe(0);
    expect(table.client("pl-1").notifications.map(n => n.message))
      .toContainEqual(expect.stringMatching(/no GM is connected/));
  });

  it("the same click by the GM lands (control: the handler itself works)", async () => {
    await click("gm-1", "markProgress", { trackId: "fight-1" });
    expect(stored().ticks).toBe(8);
  });
});

describe("applyProgressTrackEditFromRelay — what the panel can produce, and nothing else (issue #321 U05)", () => {
  let applyProgressTrackEditFromRelay;
  let journal;
  let savedJournal;

  beforeAll(async () => {
    ({ applyProgressTrackEditFromRelay } = await import("../../src/ui/progressTracks.js"));
  });

  beforeEach(() => {
    const flags = {
      [`${MODULE_ID}.tracks`]: [
        fight(),
        fight({ id: "won", label: "The ambush", completed: true, ticks: 40 }),
        { id: "vow-1", label: "Find my sister", type: "vow", rank: "epic", ticks: 0, completed: false },
        { id: "exp-1", label: "Cross the Rift", type: "expedition", rank: "troublesome", ticks: 0, completed: false },
      ],
    };
    journal = {
      id: "pt", name: "Starforged Progress Tracks",
      getFlag: (m, k) => flags[`${m}.${k}`],
      setFlag: vi.fn(async (m, k, v) => { flags[`${m}.${k}`] = structuredClone(v); }),
    };
    savedJournal = game.journal;
    game.journal = { ...savedJournal, find: (fn) => (fn(journal) ? journal : null) };
  });

  afterEach(() => { game.journal = savedJournal; });

  const track = (id) => journal.getFlag(MODULE_ID, "tracks").find(t => t.id === id);

  it("marks by rank and never past 40 ticks; clears one box and never below 0", async () => {
    expect(await applyProgressTrackEditFromRelay({ op: "mark", trackId: "exp-1" })).toEqual({ applied: true, trackId: "exp-1" });
    expect(track("exp-1").ticks).toBe(12);                       // troublesome: 3 boxes
    for (let i = 0; i < 4; i++) await applyProgressTrackEditFromRelay({ op: "mark", trackId: "exp-1" });
    expect(track("exp-1").ticks).toBe(40);
    await applyProgressTrackEditFromRelay({ op: "clear", trackId: "fight-1" });
    expect(track("fight-1").ticks).toBe(0);
  });

  it("refuses a track the panel does not list (a vow), a finished one, an unknown id, and a position on a non-fight", async () => {
    expect(await applyProgressTrackEditFromRelay({ op: "mark", trackId: "vow-1" })).toEqual({ applied: false, reason: "no-track" });
    expect(await applyProgressTrackEditFromRelay({ op: "mark", trackId: "won" })).toEqual({ applied: false, reason: "no-track" });
    expect(await applyProgressTrackEditFromRelay({ op: "complete", trackId: "nope" })).toEqual({ applied: false, reason: "no-track" });
    expect(await applyProgressTrackEditFromRelay({ op: "position", trackId: "exp-1" })).toEqual({ applied: false, reason: "no-track" });
    expect(await applyProgressTrackEditFromRelay({ op: "remove", trackId: "vow-1" })).toEqual({ applied: false, reason: "no-track" });
    expect(journal.setFlag).not.toHaveBeenCalled();
    expect(track("vow-1").ticks).toBe(0);
  });

  it("✕ removes a finished panel track too (the panel offers it on archived rows)", async () => {
    expect(await applyProgressTrackEditFromRelay({ op: "remove", trackId: "won" })).toEqual({ applied: true, trackId: "won" });
    expect(track("won")).toBeUndefined();
  });

  it("an Add takes a panel type and rank only, and a name of at most 60 characters", async () => {
    for (const bad of [
      { label: "", type: "combat", rank: "dangerous" },
      { label: "Raiders", type: "vow", rank: "dangerous" },
      { label: "Raiders", type: "combat", rank: "legendary" },
      { label: "Raiders", type: "toString", rank: "dangerous" },
      { label: 42, type: "combat", rank: "dangerous" },
    ]) {
      expect(await applyProgressTrackEditFromRelay({ op: "add", ...bad }), JSON.stringify(bad)).toEqual({ applied: false, reason: "invalid" });
    }
    const res = await applyProgressTrackEditFromRelay({ op: "add", label: "x".repeat(80), type: "combat", rank: "epic" });
    expect(res.applied).toBe(true);
    expect(track(res.trackId)).toMatchObject({ label: "x".repeat(60), type: "combat", rank: "epic", ticks: 0 });
  });

  it("an unknown op is refused", async () => {
    expect(await applyProgressTrackEditFromRelay({ op: "rename", trackId: "fight-1", label: "Pirates" }))
      .toEqual({ applied: false, reason: "invalid" });
    expect(journal.setFlag).not.toHaveBeenCalled();
  });
});

describe("the panel renders on a player's client without creating the GM's journal (issue #321 U05)", () => {
  it("no tracks journal yet: the player sees an empty panel, and nothing is created", async () => {
    const { ProgressTrackApp } = await import("../../src/ui/progressTracks.js");
    const create = vi.spyOn(JournalEntry, "create");
    const restore = asPlayer();
    try {
      game.settings._store.set(`${MODULE_ID}.campaignState`, {});
      const context = await ProgressTrackApp.prototype._prepareContext.call({}, {});
      expect(context).toMatchObject({ active: [], completed: [] });
      expect(create).not.toHaveBeenCalled();
    } finally {
      restore();
      game.settings._store.delete(`${MODULE_ID}.campaignState`);
    }
  });
});
