/**
 * STARFORGED COMPANION
 * tests/unit/finishTheScene.test.js
 *
 * A scene challenge's Progress Roll is Finish the Scene (issue #326 D6).
 *
 * The ⬡ Progress Roll on a scene challenge was a bespoke display card ("Weak
 * Hit", score vs dice): it asked no price, routed no Pay the Price, flagged no
 * match, and the challenge stayed open — its tension clock advancing on every
 * later Pay the Price — until someone pressed ✓. The rulebook's progress move
 * for it is Finish the Scene (Starforged p. 241): "On a weak hit, you
 * succeed, but not without cost. You must Pay the Price … On a miss, you fail
 * … Pay the Price." Decided: Finish the Scene is a progress move through the
 * pipeline, like Finish an Expedition — narrated, scored from the
 * challenge's track, a weak hit or miss routes Pay the Price, a match is
 * flagged, and the challenge and its clock end.
 *
 * On a booted GM / player table: the player presses the panel's Progress
 * Roll (rollProgress), the GM's pipeline resolves it (dice scripted).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [] }));
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
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
import { CampaignStateSchema, MOVES } from "../../src/schemas.js";
import { selectSceneChallengeTrack } from "../../src/moves/sceneChallenge.js";

let table, journal, store;
const gm     = () => table.client("gm-1");
const world  = () => table.world.campaignState();
const clock  = (id) => world().clocks.find(c => c._id === id) ?? null;
const tracks = () => journal.getFlag(MODULE_ID, "tracks") ?? [];
const track  = (id) => tracks().find(t => t.id === id) ?? null;
const moveCard  = () => table.cards(f => f.moveResolution).at(-1);
const ptpCards  = () => table.cards(f => f.payThePriceCard);

// Score 3 (12 ticks) against the challenge dice.
const STRONG = [0.05, 0.15];    // 1, 2
const WEAK   = [0.15, 0.85];    // 2, 9
const MISS   = [0.45, 0.65];    // 5, 7
const MATCH  = [0.15, 0.15];    // 2, 2 — a strong hit with a match

function makeTracksJournal() {
  const flags = {};
  return {
    id: "tracks-journal", name: "Starforged Progress Tracks",
    getFlag: (scope, key) => flags[`${scope}.${key}`],
    setFlag: async (scope, key, value) => { flags[`${scope}.${key}`] = structuredClone(value); },
  };
}

async function addChallenge(label, ticks = 12) {
  const t = await gm().run(() => store.addProgressTrack({ type: "scene_challenge", label, rank: "dangerous" }));
  await table.settle();
  await journal.setFlag(MODULE_ID, "tracks", tracks().map(x => x.id === t.id ? { ...x, ticks } : x));
  return track(t.id);
}

async function progressRoll(t, dice) {
  control.dice = dice;
  await table.client("pl-1").run(() => store.rollProgress(t));
  await table.settle(); await table.drain();
  return moveCard();
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
  store = await gm().import("../../src/ui/progressTracks.js");
}, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "fts-s1", sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: "fts-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 } });
  journal = makeTracksJournal();
  table.journal._set(journal);
  scriptClaude(table, { fallback: () => 'The storm breaks.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  silenceConsoleErrors();
});

describe("a scene challenge's Progress Roll is Finish the Scene (issue #326 D6)", () => {
  it("is a progress move in the registry", () => {
    expect(MOVES.finish_the_scene).toMatchObject({ progressMove: true, stat: null });
  });

  it("a weak hit finishes the scene and pays the price — the challenge's own clock does not tick", async () => {
    const challenge = await addChallenge("Outrun the storm");
    const card = await progressRoll(challenge, WEAK);
    expect(card.flags[MODULE_ID]).toMatchObject({ moveResolution: true });
    expect(card.content).toMatch(/Finish the Scene/i);
    expect(card.content).toMatch(/progress \(12 ticks\)/);                 // scored from the challenge's track
    expect(card.content).toMatch(/Weak Hit/i);
    expect(ptpCards()).toHaveLength(1);                                   // the price, routed
    expect(track(challenge.id).completed).toBe(true);                     // the scene is over
    expect(clock(challenge.tensionClockId)).toMatchObject({ filled: 0 });  // retired before the price
    expect(clock(challenge.tensionClockId).retired ?? !clock(challenge.tensionClockId).active).toBeTruthy();
    expect(table.cards(f => f.sceneFinishCard)).toHaveLength(1);
  });

  it("a miss finishes the scene too, and pays the price", async () => {
    const challenge = await addChallenge("Outrun the storm");
    await progressRoll(challenge, MISS);
    expect(moveCard().content).toMatch(/Miss/i);
    expect(ptpCards()).toHaveLength(1);
    expect(track(challenge.id).completed).toBe(true);
  });

  it("a strong hit finishes the scene with no price", async () => {
    const challenge = await addChallenge("Outrun the storm");
    await progressRoll(challenge, STRONG);
    expect(moveCard().content).toMatch(/Strong Hit/i);
    expect(ptpCards()).toHaveLength(0);
    expect(track(challenge.id).completed).toBe(true);
  });

  it("a match is flagged on the card", async () => {
    const challenge = await addChallenge("Outrun the storm");
    await progressRoll(challenge, MATCH);
    expect(moveCard().content).toMatch(/✦ Match/);
  });

  it("scores the challenge's own progress, and finishes that challenge alone", async () => {
    const storm = await addChallenge("Outrun the storm", 12);
    const other = await addChallenge("Talk down the mob", 36);       // score 9 — would be a strong hit
    await progressRoll(storm, WEAK);                                   // 3 vs 2, 9: a weak hit — the storm's score
    expect(moveCard().content).toMatch(/Weak Hit/i);
    expect(track(storm.id).completed).toBe(true);
    expect(track(other.id).completed).toBeFalsy();
    expect(clock(other.tensionClockId)).toMatchObject({ active: true });
  });
});

describe("selectSceneChallengeTrack (issue #326 D6)", () => {
  const open = [
    { id: "a", type: "scene_challenge", label: "Outrun the storm" },
    { id: "b", type: "scene_challenge", label: "Talk down the mob" },
    { id: "c", type: "expedition",      label: "Outrun the storm" },
    { id: "d", type: "scene_challenge", label: "Old business", completed: true },
  ];
  it("the row's id first, else the named challenge, else the sole open one", () => {
    expect(selectSceneChallengeTrack(open, null, { trackId: "b" })?.id).toBe("b");
    expect(selectSceneChallengeTrack(open, "the storm")?.id).toBe("a");
    expect(selectSceneChallengeTrack(open, null)).toBeNull();                  // two open, none named
    expect(selectSceneChallengeTrack([open[0], open[3]], null)?.id).toBe("a");
    expect(selectSceneChallengeTrack(open, null, { trackId: "d" })).toBeNull(); // completed
  });
});
