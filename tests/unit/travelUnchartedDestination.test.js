/**
 * STARFORGED COMPANION
 * tests/unit/travelUnchartedDestination.test.js
 *
 * Issue #348 PT06 and PT07 — a trip to an uncharted place reaches exploration.
 *
 * PT06: Set a Course is for a known route. "Please set a course" toward a
 * place no chart shows — coordinates an NPC gave, "the gap" — stayed Set a
 * Course. It is read as Undertake an Expedition now, on every Mischief
 * setting (maintainer decision): the confirm dialog's rationale and the move
 * card say why, and the dialog's Cancel lets the player re-word it.
 *
 * PT07: a destination the story refers to without a proper name never became
 * a place in the game — nothing for an expedition to target, for Finish an
 * Expedition to chart, for the map to pin. The expedition toward it now
 * records it as an uncharted site of the active sector under its working
 * label (a location Actor, a discovery record, a map pin), linked to the
 * track; the Finish an Expedition that completes it charts it and docks there.
 *
 * End to end on a booted table (tests/helpers/multiClient.js): the player's
 * line goes through the GM's real pipeline, the interpretation and dice
 * scripted at their boundaries.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ interpretation: null, dice: [], dial: "balanced", confirmed: [] }));
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../src/moves/interpreter.js", async (original) => ({
  ...(await original()),
  interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: "chat" })),
}));
vi.mock("../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock("../../src/ui/settingsPanel.js", async (original) => ({
  ...(await original()),
  confirmInterpretation: vi.fn(async (interp) => { control.confirmed.push(structuredClone(interp)); return true; }),
  getMischiefDial: vi.fn(() => control.dial),
}));
vi.mock("../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const d of control.dice) rng.mockReturnValueOnce(d);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";
import { chartedPlaceFor, rerouteUnchartedCourse, sceneDestination } from "../../src/moves/travel.js";

const REPLY = 'The stars wheel past.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const GAP   = "Archer's rendezvous — the gap";
const STRONG_ACTION = [0.15, 0.25, 0.99];   // challenge 2, 3; action die 6: a strong hit
const STRONG_PROGRESS = [0.05, 0.05];       // challenge 1, 1 against any progress: a strong hit

let table, tracksStore, scene;

function makeTracksJournal() {
  return {
    id: "tracks-journal", name: "Starforged Progress Tracks",
    getFlag: (mod, key) => tracksStore[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { tracksStore[`${mod}.${key}`] = structuredClone(value); },
  };
}
const tracks = () => tracksStore[`${MODULE_ID}.tracks`] ?? [];
const state  = () => table.world.campaignState();
const sector = () => state().sectors.find(s => s.id === "sec-1");
const moveCards = () => table.cards(f => f.moveResolution);

async function say(interpretation, dice, text) {
  control.interpretation = { adds: 0, rationale: "test", mischiefApplied: false, ...interpretation };
  control.dice = dice;
  await table.client("pl-1").chat(text, { speaker: { actor: "pc-kira" } });
  await table.settle();
  await table.drain();
}

const setACourse = (target) => say(
  { moveId: "set_a_course", moveName: "Set A Course", statUsed: "supply", moveTarget: target },
  STRONG_ACTION, "Please set a course.");

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => { table?.scenes.delete("scene-1"); table?.teardown(); });

beforeEach(async () => {
  control.dial = "balanced";
  control.confirmed = [];
  tracksStore = { [`${MODULE_ID}.tracks`]: [] };
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: "sess-1", sessionNumber: 2,
      currentSceneId: "sc-1", sceneTruths: [],
      sectors: [{ id: "sec-1", name: "Outlands Mark", region: "outlands", regionLabel: "Outlands", sceneId: "scene-1",
        mapData: { settlements: [{ id: "gen-B", name: "Bleakhold", gridX: 9, gridY: 4 }], discoveries: [] } }],
      activeSectorId: "sec-1",
      settlementIds: ["actor-bleak"], locationIds: [],
    },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-gina");
  table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { momentum: { value: 2, max: 10, min: -6, resetValue: 2 }, supply: 3 } });
  table.addActor({ id: "actor-bleak", type: "location", name: "Bleakhold",
    flags: { [MODULE_ID]: { entityType: "settlement", settlement: { _id: "rec-bleak", name: "Bleakhold", sectorId: "sec-1" } } } });
  table.journal._set(makeTracksJournal());
  scene = {
    id: "scene-1", grid: { size: 100 }, flags: { [MODULE_ID]: { sectorScene: true, sectorId: "sec-1" } },
    dimensions: { sceneX: 200, sceneY: 200, sceneWidth: 1792, sceneHeight: 1024 },
    notes: { contents: [] }, drawings: { contents: [] }, tokens: { contents: [] },
    createEmbeddedDocuments: vi.fn(async (type, data) => {
      const docs = data.map((d, i) => ({ id: `${type}-${i}`, ...d,
        update: vi.fn(async function (patch) { Object.assign(this, patch); }) }));
      if (type === "Note") scene.notes.contents.push(...docs);
      if (type === "Drawing") scene.drawings.contents.push(...docs);
      return docs;
    }),
  };
  table.scenes.set("scene-1", scene);
  scriptClaude(table, { fallback: () => REPLY });
});

describe("travel.js — whether a destination is charted (PT06)", () => {
  const places = {
    bleakhold: { id: "a-1", type: "settlement", entity: { name: "Bleakhold" } },
    vault:     { id: "a-2", type: "location",   entity: { name: "The Hollow Vault", status: "unexplored" } },
  };
  const resolvePlace = (name) => places[name.toLowerCase()] ?? null;

  it("a tracked settlement is charted; an unexplored site and an unknown place are not", () => {
    expect(chartedPlaceFor("Bleakhold", {}, resolvePlace)?.id).toBe("a-1");
    expect(chartedPlaceFor("vault", {}, resolvePlace)).toBeNull();
    expect(chartedPlaceFor("the gap", {}, resolvePlace)).toBeNull();
  });

  it("a course to an uncharted place is rerouted; to a charted one, by its pin's Actor, or to nowhere, it stays", () => {
    const uncharted = { moveId: "set_a_course", statUsed: "supply", moveTarget: "the gap" };
    expect(rerouteUnchartedCourse(uncharted, {}, { resolvePlace })).toEqual({ from: "set_a_course", destination: "the gap" });
    expect(uncharted).toMatchObject({ moveId: "undertake_an_expedition", statUsed: "edge" });
    expect(uncharted.rationale).toMatch(/"the gap" is not a charted place/);

    for (const kept of [
      { moveId: "set_a_course", moveTarget: "Bleakhold" },
      { moveId: "set_a_course", moveTarget: "Drift", moveTargetId: "actor-drift" },
      { moveId: "set_a_course", moveTarget: null },
    ]) {
      expect(rerouteUnchartedCourse(kept, {}, { resolvePlace })).toBeNull();
      expect(kept.moveId).toBe("set_a_course");
    }
  });

  it("the scene's destination is the newest uncharted working-label site of the active sector", () => {
    const cs = { activeSectorId: "s", sectors: [{ id: "s", mapData: { discoveries: [
      { name: "Old Wreck", workingLabel: false, discovered: false },
      { name: "First Place", workingLabel: true, discovered: true },
      { name: GAP, workingLabel: true, discovered: false },
    ] } }] };
    expect(sceneDestination(cs)).toBe(GAP);
    expect(sceneDestination({ activeSectorId: "s", sectors: [{ id: "s", mapData: { discoveries: [] } }] })).toBeNull();
  });
});

describe("a Set a Course to an uncharted destination is an expedition (PT06)", () => {
  it("is rolled as Undertake an Expedition, and the dialog and the card say why", async () => {
    await setACourse(GAP);

    const [card] = moveCards();
    expect(card.flags[MODULE_ID]).toMatchObject({ moveResolution: true });
    expect(card.content).toContain("Undertake");
    expect(card.content).toMatch(/not a charted place/);
    expect(control.confirmed.at(-1)).toMatchObject({ moveId: "undertake_an_expedition" });
    expect(control.confirmed.at(-1).rationale).toMatch(/not a charted place.*Cancel and re-word/);
    // No arrival: an expedition marks progress.
    expect(table.cards(f => f.setACourseFeedback)).toHaveLength(0);
    expect(tracks().map(t => t.label)).toEqual([GAP]);
  }, 30_000);

  it("on the Lawful dial too", async () => {
    control.dial = "lawful";
    await setACourse(GAP);
    expect(control.confirmed.at(-1)).toMatchObject({ moveId: "undertake_an_expedition" });
  }, 30_000);

  it("control: a course to a charted settlement stays Set a Course", async () => {
    await setACourse("Bleakhold");
    expect(control.confirmed.at(-1)).toMatchObject({ moveId: "set_a_course" });
    expect(moveCards()[0].content).not.toMatch(/not a charted place/);
  }, 30_000);
});

describe("an unnamed destination becomes a place in the game (PT07)", () => {
  it("the expedition records it as an uncharted site — location, map record and pin — linked to its track", async () => {
    await setACourse(GAP);

    const [track] = tracks();
    const [site] = sector().mapData.discoveries;
    expect(site).toMatchObject({ name: GAP, type: "uncharted", discovered: false, workingLabel: true });
    expect(track.siteId).toBe(site.id);
    const location = table.actors.find(a => a.id === site.actorId);
    expect(location?.name).toBe(GAP);
    expect(location.flags[MODULE_ID].location).toMatchObject({ status: "unexplored", sectorId: "sec-1" });
    expect(state().locationIds).toContain(site.actorId);
    const pin = scene.notes.contents.find(n => n.flags?.[MODULE_ID]?.siteId === site.id);
    expect(pin).toMatchObject({ text: "Unexplored Site" });
  }, 30_000);

  it("a later course naming no destination goes to it — as an expedition — and Finish an Expedition charts it and docks there", async () => {
    await setACourse(GAP);
    const [site] = sector().mapData.discoveries;

    // "Please set a course" again, naming nothing: the scene's destination.
    await setACourse(null);
    expect(control.confirmed.at(-1)).toMatchObject({ moveId: "undertake_an_expedition", moveTarget: GAP });
    expect(tracks()).toHaveLength(1);   // the same expedition, marked again

    await say({ moveId: "finish_an_expedition", moveName: "Finish An Expedition", statUsed: null, isProgressMove: true, moveTarget: GAP },
      STRONG_PROGRESS, "We reach the gap at last.");

    expect(sector().mapData.discoveries[0].discovered).toBe(true);
    const location = table.actors.find(a => a.id === site.actorId);
    expect(location.flags[MODULE_ID].location.status).toBe("visited");
    const [discovered] = table.cards(f => f.siteDiscovered);
    expect(discovered.content).toMatch(/no chart showed before/);
    expect(state().currentLocationId).toBe(site.actorId);
    expect(scene.notes.contents.find(n => n.flags?.[MODULE_ID]?.siteId === site.id).text).toBe(GAP);
  }, 30_000);

  it("a paced card's Roll Undertake an Expedition — the move alone — reads its destination from the line and the scene (PT05)", async () => {
    const { interpretMove } = await import("../../src/moves/interpreter.js");
    vi.mocked(interpretMove).mockClear();
    control.interpretation = { adds: 0, rationale: "read", mischiefApplied: false,
      moveId: "undertake_an_expedition", moveName: "Undertake An Expedition", statUsed: "wits", moveTarget: GAP };
    control.dice = STRONG_ACTION;
    await table.client("pl-1").chat("Wake me when we get there.", { speaker: { actor: "pc-kira" },
      flags: { [MODULE_ID]: { bypassPacing: true, forcedMoveId: "undertake_an_expedition" } } });
    await table.settle(); await table.drain();

    // Read with the move fixed and the recent scene, for its destination and stat.
    const call = vi.mocked(interpretMove).mock.calls.find(([, opts]) => opts?.expectedMoveSlug === "undertake_an_expedition");
    expect(call?.[1]).toHaveProperty("recentScene");
    expect(control.confirmed.at(-1)).toMatchObject({ moveId: "undertake_an_expedition", moveTarget: GAP, statUsed: "wits" });
    expect(tracks().map(t => t.label)).toEqual([GAP]);
    expect(sector().mapData.discoveries[0]).toMatchObject({ name: GAP, workingLabel: true });
  }, 30_000);

  it("control: an expedition to a charted settlement records no site", async () => {
    await say({ moveId: "undertake_an_expedition", moveName: "Undertake An Expedition", statUsed: "wits", moveTarget: "Bleakhold" },
      STRONG_ACTION, "We take the long way to Bleakhold.");
    expect(sector().mapData.discoveries).toEqual([]);
    expect(tracks()[0].siteId).toBeUndefined();
  }, 30_000);
});
