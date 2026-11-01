/**
 * STARFORGED COMPANION
 * tests/unit/combatPositionPerCharacter.test.js
 *
 * Combat position is per character (issue #322 V03; maintainer decision
 * 2026-11-01). It was one value per fight, applied to every roller: one PC's
 * bad spot remapped another PC's Strike to Clash and downgraded their Take
 * Decisive Action, although the rulebook (Battle Stations!) and decisions.md
 * track position per character. The per-PC `system.combatPosition` that was
 * written was read only by the combat tracker's badge.
 *
 * Now the fight's track holds each character's own position
 * (`positions[actorId]`) beside the fight's last-set one (`combatState`):
 * the interpreter's position directive and Take Decisive Action's downgrade
 * read the roller's own, the fight's as the fallback; the narrator names each
 * character's position.
 *
 * Unit: the store (progressTracks.js), the pure reader (combat.js).
 * Composition: a booted GM / two-player table — two PCs in one fight, each
 * rolling through the real pipeline (interpretMove's input and resolveMove's
 * downgrade observed at their boundaries).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], interpretation: null }));
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../src/moves/interpreter.js", async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: "chat" })),
}));
vi.mock("../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock("../../src/ui/settingsPanel.js", async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock("../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";
import { interpretMove } from "../../src/moves/interpreter.js";
import { resolveMove } from "../../src/moves/resolver.js";
import { combatPositionFor } from "../../src/moves/combat.js";

/** The "Starforged Progress Tracks" journal: a document-level flag store, as progressTracks.js writes it. */
function makeTracksJournal(tracks = []) {
  const store = { [`${MODULE_ID}.tracks`]: structuredClone(tracks) };
  return {
    id:      "tracks-journal",
    name:    "Starforged Progress Tracks",
    getFlag: (mod, key) => store[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { store[`${mod}.${key}`] = structuredClone(value); },
  };
}

const fight = (over = {}) => ({
  id: "fight-1", label: "Corsair boarding party", type: "combat", rank: "dangerous",
  ticks: 0, completed: false, combatState: null, ...over,
});

// ─── the pure reader ─────────────────────────────────────────────────────────

describe("combatPositionFor", () => {
  it("the character's own position first, the fight's as the fallback", () => {
    const t = fight({ combatState: "bad_spot", positions: { "pc-ren": "in_control" } });
    expect(combatPositionFor(t, "pc-ren")).toBe("in_control");
    expect(combatPositionFor(t, "pc-kira")).toBe("bad_spot");
    expect(combatPositionFor(t, null)).toBe("bad_spot");
    expect(combatPositionFor(fight(), "pc-ren")).toBeNull();
    expect(combatPositionFor(fight({ positions: { "pc-ren": "flanking" } }), "pc-ren")).toBeNull();
    expect(combatPositionFor(null, "pc-ren")).toBeNull();
  });
});

// ─── the store ───────────────────────────────────────────────────────────────

describe("the fight's track holds each character's own position", () => {
  let store, journal, savedJournal;
  const tracks = () => journal.getFlag(MODULE_ID, "tracks");

  beforeAll(async () => {
    foundry.applications.api.DialogV2 = { confirm: async () => true };
    store = await import("../../src/ui/progressTracks.js");
  });
  beforeEach(() => {
    journal = makeTracksJournal([fight()]);
    savedJournal = game.journal;
    game.journal = { ...savedJournal, find: (fn) => (fn(journal) ? journal : null) };
  });
  afterEach(() => { game.journal = savedJournal; });

  it("a write names the character: their own position, and the fight's last-set one", async () => {
    await store.setCombatTrackPosition("fight-1", "bad_spot", "pc-kira");
    await store.setCombatTrackPosition("fight-1", "in_control", "pc-ren");
    expect(tracks()[0]).toMatchObject({
      combatState: "in_control",
      positions: { "pc-kira": "bad_spot", "pc-ren": "in_control" },
    });

    await store.setCombatTrackPosition("fight-1", null, "pc-kira");     // neutral
    expect(tracks()[0].positions).toEqual({ "pc-ren": "in_control" });
  });

  it("a write without a character sets the fight's alone", async () => {
    await store.setCombatTrackPosition("fight-1", "bad_spot");
    expect(tracks()[0].combatState).toBe("bad_spot");
    expect(tracks()[0].positions).toBeUndefined();
  });

  it("getActiveCombatPosition reads the roller's own, the fight's as the fallback", async () => {
    await store.setCombatTrackPosition("fight-1", "bad_spot", "pc-kira");
    await store.setCombatTrackPosition("fight-1", "in_control", "pc-ren");
    await store.setCombatTrackPosition("fight-1", "bad_spot", "pc-kira");   // the fight's last: bad spot
    expect(await store.getActiveCombatPosition("pc-ren")).toBe("in_control");    // was: bad_spot for everyone
    expect(await store.getActiveCombatPosition("pc-kira")).toBe("bad_spot");
    expect(await store.getActiveCombatPosition("pc-vex")).toBe("bad_spot");      // no own position: the fight's
    expect(await store.getActiveCombatPosition()).toBe("bad_spot");
  });

  it("two fights open: the roller's own position still counts; without one, none is guessed", async () => {
    journal = makeTracksJournal([
      fight({ positions: { "pc-ren": "in_control" }, combatState: "in_control" }),
      fight({ id: "fight-2", label: "Dock brawl", combatState: "bad_spot", positions: { "pc-kira": "bad_spot" } }),
    ]);
    expect(await store.getActiveCombatPosition("pc-ren")).toBe("in_control");
    expect(await store.getActiveCombatPosition("pc-kira")).toBe("bad_spot");
    expect(await store.getActiveCombatPosition("pc-vex")).toBeNull();
  });

  it("a finished fight's positions are gone with it", async () => {
    journal = makeTracksJournal([fight({ completed: true, combatState: "bad_spot", positions: { "pc-kira": "bad_spot" } })]);
    expect(await store.getActiveCombatPosition("pc-kira")).toBeNull();
  });

  it("listProgressTracks carries each fight's positions for the scored fight's reader", async () => {
    await store.setCombatTrackPosition("fight-1", "in_control", "pc-ren");
    const [listed] = await store.listProgressTracks();
    expect(listed.positions).toEqual({ "pc-ren": "in_control" });
  });

  it("the narrator's fight line names each character's position", async () => {
    game.actors._setAll([
      makeTestActor({ id: "pc-kira", name: "Kira" }),
      makeTestActor({ id: "pc-ren", name: "Ren" }),
    ]);
    await store.setCombatTrackPosition("fight-1", "bad_spot", "pc-kira");
    await store.setCombatTrackPosition("fight-1", "in_control", "pc-ren");
    await store.setCombatTrackPosition("fight-1", "in_control", "pc-gone");    // no longer in the world
    const { buildNarratorSystemPrompt } = await import("../../src/narration/narratorPrompt.js");
    const prompt = buildNarratorSystemPrompt({}, {}, null, "", { progressTracks: store.listOpenProgressTracks() });
    expect(prompt).toContain("- Fight: Corsair boarding party — dangerous, 0/10 progress; positions: Kira in a bad spot, Ren in control");
  });
});

// ─── composition: two PCs in one fight, on a booted table ────────────────────

describe("two PCs in one fight roll by their own positions (booted table)", () => {
  let table, kira, ren, journal;

  // Challenge 2 and 3, action 6: a strong hit for any score above 3.
  const STRONG = [0.15, 0.25, 0.99];

  async function roll(userId, actor, interpretation, dice = STRONG) {
    control.interpretation = { rationale: "test", mischiefApplied: false, adds: 0, ...interpretation };
    control.dice = dice;
    await table.client(userId).chat(`I act — ${interpretation.moveId}.`, { speaker: { actor: actor.id } });
    await table.settle(); await table.drain();
    return { opts: interpretMove.mock.calls.at(-1)?.[1] ?? null, resolution: resolveMove.mock.results.at(-1)?.value ?? null };
  }

  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => {
    await table.reset({ world: { settings: {
      chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false,
      campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "pos-s1", sessionNumber: 1,
        currentSceneId: "pos-scene", sceneTruths: [], clocks: [] },
    } } });
    await table.setClaudeKey("gm-1", "sk-ant-test");
    kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 } });
    ren  = table.addActor({ id: "pc-ren",  name: "Ren",  ownership: { "pl-2": 3 } });
    // Kira is in a bad spot and was the last to change the fight's position;
    // Ren took control earlier. Full progress: Take Decisive Action scores 10.
    journal = makeTracksJournal([fight({
      ticks: 40, combatState: "bad_spot", positions: { "pc-ren": "in_control", "pc-kira": "bad_spot" },
    })]);
    table.journal._set(journal);
    scriptClaude(table, { fallback: () => 'Steel rings.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
    interpretMove.mockClear();
    resolveMove.mockClear();
  });

  it("the interpreter is given each roller's own position, not the fight's last-set one", async () => {
    const forRen = await roll("pl-2", ren, { moveId: "strike", moveName: "Strike", statUsed: "iron" });
    expect(forRen.opts.combatPosition).toBe("in_control");   // was "bad_spot": Kira's, remapping Ren's Strike to Clash

    const forKira = await roll("pl-1", kira, { moveId: "clash", moveName: "Clash", statUsed: "iron" });
    expect(forKira.opts.combatPosition).toBe("bad_spot");
  });

  it("Take Decisive Action is downgraded for the PC in a bad spot only", async () => {
    // As the interpreter's parse derives it from the schema: a progress move.
    const tda = { moveId: "take_decisive_action", moveName: "Take Decisive Action", statUsed: null,
      isProgressMove: true, moveTarget: "Corsair boarding party" };
    const forRen = await roll("pl-2", ren, tda);
    expect(forRen.resolution).toMatchObject({ moveId: "take_decisive_action", outcome: "strong_hit" });

    // Reset the finished fight for Kira's attempt.
    table.journal._set(makeTracksJournal([fight({
      ticks: 40, combatState: "in_control", positions: { "pc-ren": "in_control", "pc-kira": "bad_spot" },
    })]));
    const forKira = await roll("pl-1", kira, tda);
    expect(forKira.resolution.outcome).toBe("weak_hit");     // a strong hit, downgraded: her own bad spot
  });

  it("a move's position is recorded as the roller's own", async () => {
    const tracks = () => table.journal.find(j => j.name === "Starforged Progress Tracks").getFlag(MODULE_ID, "tracks");
    // Ren's Strike weak hit leaves him exposed — in a bad spot (his own).
    await roll("pl-2", ren, { moveId: "strike", moveName: "Strike", statUsed: "iron", moveTarget: "Corsair boarding party" },
      [0.15, 0.85, 0.1]);   // challenge 2 and 9, action 1 + iron 3 = 4: a weak hit
    expect(tracks()[0].positions).toEqual({ "pc-ren": "bad_spot", "pc-kira": "bad_spot" });
    expect(ren.system.combatPosition).toBe("inABadSpot");    // the sheet mirrors it
    expect(kira.system.combatPosition ?? "none").not.toBe("inControl");
  });
});
