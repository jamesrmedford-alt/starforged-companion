/**
 * MOVA-08 · HIDDEN-PLAN-ROLLS-ON-HELD-CARD (LEAK)
 *
 * Scenario: a player rolls Undertake an Expedition toward a new destination
 * and scores a weak hit that momentum could burn to a strong hit. The move
 * begins the expedition, and its narration is asked to plan it (issue #353
 * Phase 3): resolver.expeditionPlanRequest rolls two Space Sightings (the
 * waypoints) and an Action + Theme ("What waits at the end") — the plan's
 * hidden oracle rolls. Free-flow holds the result for Burn / Keep (issue #354
 * P2-10, default on) and posts the move card.
 *
 * Correct (decisions.md → "The narrative skeleton": "Hidden oracle rolls
 * (decided): GM-only until the plan's truth is revealed … No hidden roll is
 * on a player-visible card or a card's flags otherwise"): nothing a player's
 * client receives carries those rolls.
 *
 * Today: movePipeline.rollMove puts the whole resolution on the held card
 * (`flags.awaitingUpgrade.resolution = jsonCopy(resolution)`), and the
 * resolution carries `skeletonRequests[].oracleSeeds` (and `oracleSeeds` —
 * a Sojourn miss's choice price that reveals a new enemy carries that enemy's
 * Character Role / Goal / Disposition). The card is a public chat message:
 * every client holds its flags. A Batch Mode round stores the same fields for
 * every rolled entry in the world setting `batchMode.round`
 * (movePipeline.narrationInputFrom → batch/driver.js markRolled), which every
 * client also receives — there a routed price's new-enemy rolls too.
 *
 * Production path: the player's typed line through the chat hook on a booted
 * GM + player table — the real pipeline, resolver, outcome effects (the
 * expedition track and its plan request) and held-result card. Scripted: the
 * pacing decision, the interpretation, the ability scan, the confirm dialog,
 * the dice.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], interpretation: null }));
vi.mock("../../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../../src/moves/interpreter.js", async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: "chat" })),
}));
vi.mock("../../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock("../../../src/ui/settingsPanel.js", async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
// Challenge dice first (two d10), then the action die (d6), inside the REAL resolveMove.
vi.mock("../../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from "../../helpers/multiClient.js";
import { scriptClaude } from "../../helpers/faults.js";
import { CampaignStateSchema } from "../../../src/schemas.js";

// The plan's hidden rolls, as resolver.expeditionPlanRequest words them.
const HIDDEN_ROLL = /What waits at the end — Action \+ Theme: |A waypoint — Space Sighting \(/;

let table, pc;
const flags = (id) => table.world.message(id).flags[MODULE_ID];
const narratorCalls = () => table.claude.calls.filter(c => /MOVE OUTCOME/.test(`${c.userText}`));

/** The "Starforged Progress Tracks" journal: a document-level flag store, as progressTracks.js writes it. */
function makeTracksJournal() {
  const store = {};
  return {
    id:      "tracks-journal",
    name:    "Starforged Progress Tracks",
    getFlag: (mod, key) => store[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { store[`${mod}.${key}`] = JSON.parse(JSON.stringify(value)); },
  };
}

async function setOut(dice) {
  control.interpretation = { moveId: "undertake_an_expedition", moveName: "Undertake an Expedition", statUsed: "wits", adds: 0,
    moveTarget: "the Vault of Tears", expeditionRank: "dangerous", rationale: "test", mischiefApplied: false };
  control.dice = dice;
  await table.client("pl-1").chat("We set out across the drift for the Vault of Tears.", { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
  return table.cards(f => f.moveResolution).at(-1);
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 60_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  silenceConsoleErrors();
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "mova8-s1", sessionNumber: 1,
      currentSceneId: "mova8-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  // Momentum 9: a weak hit against 3 and 7 can be burned to a strong hit, so free-flow holds it.
  pc = table.addActor({ id: "pc-kira-mova8", name: "Kira", ownership: { "pl-1": 3 }, system: { momentum: { value: 9 } } });
  table.journal._set(makeTracksJournal());
  scriptClaude(table, { fallback: () => 'The drift opens ahead.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

describe("MOVA-08 — an expedition plan's hidden oracle rolls stay off the cards players' clients hold", () => {
  it("control: a strong hit is narrated at once — the rolls reach the narrator's prompt, and no card's flags carry them", async () => {
    const card = await setOut([0.05, 0.15, 0.9]);   // challenge 1, 2: a strong hit — nothing to hold
    expect(flags(card._id).awaitingUpgrade).toBeUndefined();
    const call = narratorCalls().at(-1);
    expect(`${call?.system}\n${call?.userText}`, "the narration is asked to plan the expedition (setup)").toMatch(HIDDEN_ROLL);
    for (const message of table.cards(() => true)) {
      expect(JSON.stringify(message.flags ?? {}), `card ${message._id}`).not.toMatch(HIDDEN_ROLL);
    }
  }, 60_000);

  it("a held weak hit: the public move card's flags do not carry the plan's rolls", async () => {
    const card = await setOut([0.25, 0.65, 0.5]);   // challenge 3, 7; action die 4 + wits 2 = 6: a weak hit
    expect(flags(card._id).awaitingUpgrade?.open, "the burnable weak hit is held (setup)").toBe(true);
    expect(table.world.message(card._id).whisper ?? [], "the move card is public (setup)").toEqual([]);

    expect(JSON.stringify(flags(card._id))).not.toMatch(HIDDEN_ROLL);
  }, 60_000);
});
