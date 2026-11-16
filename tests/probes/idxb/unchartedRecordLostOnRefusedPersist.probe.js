/**
 * PROBE — IDXB-03 · UNCHARTED-DESTINATION-NOT-ON-RETRY-CARD (INCOMPLETE-FIX of issue #331 X18 for issue #348 PT07)
 *
 * Scenario: Kira's Undertake an Expedition toward "Archer's rendezvous — the
 * gap" begins the expedition and records the uncharted destination (PT07): a
 * location Actor and a map pin, made at once, and a discovery record written
 * to the pipeline's WORKING COPY (`campaignState.sectors`), which only
 * persistResolution's one write saves. The world refuses that write.
 *
 * Correct (issue #331 X18's rule — index.js UNSAVED_ON_COPY: "What a working
 * copy holds that only the write saving it puts in the world … as payoff
 * steps": a legacy mark, an arrival and a site reveal each go on the GMs'
 * "Move not fully saved" card with a Retry): the destination's record is on
 * that card too, so a Retry saves it — or it is saved some other way. Either
 * way the expedition's site link must not dangle.
 *
 * Today: recordUnchartedDestination notes nothing on the copy
 * (noteUnsavedOnCopy is never called for it), so the refusal says "Nothing
 * else it changed needs a Retry" and posts no card. The world keeps the
 * location Actor (status unexplored), its "Unexplored Site" pin and a track
 * whose `siteId` names a discovery record no sector holds — so the Finish an
 * Expedition that completes it charts nothing: no Site Discovered card, the
 * location stays "unexplored" and its pin stays "Unexplored Site" for good.
 *
 * On a booted table, as tests/unit/travelUnchartedDestination.test.js and
 * tests/unit/refusedMoveRecord.test.js.
 */

/* global expectConsoleError */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ interpretation: null, dice: [] }));
vi.mock("../../../src/pacing/router.js", async (original) => ({
  ...(await original()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../../src/moves/interpreter.js", async (original) => ({
  ...(await original()),
  interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: "chat" })),
}));
vi.mock("../../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock("../../../src/ui/settingsPanel.js", async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock("../../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const d of control.dice) rng.mockReturnValueOnce(d);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from "../../helpers/multiClient.js";
import { scriptClaude, failWrites, campaignStateWrite } from "../../helpers/faults.js";
import { CampaignStateSchema } from "../../../src/schemas.js";

const REPLY = 'The stars wheel past.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const GAP   = "Archer's rendezvous — the gap";
const GAP_SITE = "Archer's Rendezvous — The Gap";
const STRONG_ACTION   = [0.15, 0.25, 0.99];   // challenge 2, 3; action die 6: a strong hit (nothing to upgrade)
const STRONG_PROGRESS = [0.05, 0.05];         // challenge 1, 1 against any progress: a strong hit

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
const storedSites = () => sector().mapData.discoveries ?? [];
const failCards = () => table.cards(f => f.payoffFailureCard);
/** The move's record: the one campaignState write of the GM's that carries persistResolution's stamp (refusedMoveRecord.test.js). */
const persistWrite = (w) => campaignStateWrite("gm-1")(w) && !!w.value?.updatedAt && w.value.updatedAt !== (state().updatedAt ?? null);

async function say(interpretation, dice, text) {
  control.interpretation = { adds: 0, rationale: "test", mischiefApplied: false, ...interpretation };
  control.dice = dice;
  await table.client("pl-1").chat(text, { speaker: { actor: "pc-kira" } });
  await table.settle();
  await table.drain();
}
const undertake = () => say(
  { moveId: "undertake_an_expedition", moveName: "Undertake An Expedition", statUsed: "wits", moveTarget: GAP },
  STRONG_ACTION, "We follow the coordinates Archer gave us, out into the gap.");
const finish = () => say(
  { moveId: "finish_an_expedition", moveName: "Finish An Expedition", statUsed: null, isProgressMove: true, moveTarget: GAP },
  STRONG_PROGRESS, "We reach the gap at last.");

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => { table?.scenes.delete("scene-1"); table?.teardown(); });

beforeEach(async () => {
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

describe("IDXB-03 — an uncharted destination whose move record the world refused", () => {
  it("control: with the record saved, the track links a stored site, and Finish an Expedition charts it", async () => {
    await undertake();
    const [track] = tracks();
    expect(storedSites()).toEqual([expect.objectContaining({ id: track.siteId, name: GAP_SITE, discovered: false, workingLabel: true })]);
    expect(failCards()).toEqual([]);

    await finish();
    expect(storedSites()[0].discovered).toBe(true);
    expect(table.cards(f => f.siteDiscovered)).toHaveLength(1);
  }, 30_000);

  it("the record refused: the expedition's site link does not dangle — the record is stored, or on the GMs' card to Retry", async () => {
    expectConsoleError(/did not save .*record/);
    const refused = failWrites(table, persistWrite);

    await undertake();

    // The move resolved; its record — and nothing else — was refused, once.
    expect(refused.refused).toBe(1);
    expect(table.cards(f => f.moveResolution)).toHaveLength(1);
    expect(state().pendingMove).toBe(false);
    // What the move made at once is in the world: the track, the location Actor, its pin.
    const [track] = tracks();
    expect(track?.siteId).toBeTruthy();
    const location = table.actors.find(a => a.name === GAP_SITE);
    expect(location?.flags?.[MODULE_ID]?.location).toMatchObject({ status: "unexplored" });
    expect(scene.notes.contents.some(n => n.flags?.[MODULE_ID]?.siteId === track.siteId)).toBe(true);

    // Fails today: the discovery record the track names is in no stored sector,
    // and no card offers to save it ("Nothing else it changed needs a Retry").
    const stored  = storedSites().some(d => d.id === track.siteId);
    const onCard  = failCards().some(c => JSON.stringify(c.flags[MODULE_ID].steps ?? []).includes(track.siteId));
    expect({ stored, onCard }).not.toEqual({ stored: false, onCard: false });
  }, 30_000);

  it("the record refused: the Finish an Expedition that completes it still charts the place", async () => {
    expectConsoleError(/did not save .*record/);
    failWrites(table, persistWrite);
    await undertake();
    const location = table.actors.find(a => a.name === GAP_SITE);
    expect(location).toBeTruthy();
    // A GM pressing a Retry, were one offered, comes before the finish.
    for (const card of failCards()) {
      await table.client("gm-1").click(card._id, '[data-action="sf-payoff-retry"]');
      await table.settle(); await table.drain();
    }

    await finish();

    expect(tracks()[0].completed).toBe(true);                   // the expedition is over …
    // … Fails today: and nothing was charted — the place stays an "Unexplored Site" for good.
    expect(table.cards(f => f.siteDiscovered)).toHaveLength(1);
    expect(location.flags[MODULE_ID].location.status).toBe("visited");
  }, 30_000);
});
