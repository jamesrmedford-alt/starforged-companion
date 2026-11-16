/**
 * MOVA-02 · STATED-MISS-PROMISED-FOR-UNPRICED-MISS
 *
 * Scenario: a player's line is read as Enter the Fray. The interpreter states
 * the stakes (issue #353 R1) with a miss and its suffer move: "On a miss:
 * their first volley catches your shoulder (Endure Harm −1)". The Confirm
 * dialog shows that line — it is shown "only when it is the price"
 * (decisions.md → "Issue #353 R1": "Whether a miss pays the stated miss
 * (`priceStated`) is fixed when the interpretation is read, so the dialog
 * shows what the roll then pays"). The roll is a miss.
 *
 * Enter the Fray's miss pays no price: "the fight begins with you in a bad
 * spot" (resolver CONSEQUENCE_MAP — no `routePayThePrice`). So do Swear an
 * Iron Vow's, Test Your Relationship's, the resist rolls' and Face Death's.
 *
 * Correct: what the dialog and the narrator call "what this miss costs" is
 * what the miss costs — either the stated cost is charged, or (the move's
 * miss paying no price) it is not presented as the price.
 *
 * Today: `stakes.withPriceSource` sets `priceStated` for any stated miss,
 * whatever the move. The dialog shows "On a miss: … (Endure Harm −1)", the
 * miss charges nothing (no Pay the Price card, health untouched), and the
 * narrator's STAKES block says "On a miss: … (Endure Harm −1)" and "This is a
 * miss: deliver the miss as stated — it is what this miss costs."
 *
 * Production path: the player's typed line through the chat hook on a booted
 * GM + player table — the real interpreter (Claude answered at the fetch
 * boundary), move pipeline, resolver and narrator prompt. Scripted: the pacing
 * decision, the ability scan, the confirm dialog (which records the stakes it
 * was given), the dice.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], confirmedStakes: [] }));
vi.mock("../../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock("../../../src/ui/settingsPanel.js", async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async (interpretation) => {
    control.confirmedStakes.push(JSON.parse(JSON.stringify(interpretation?.stakes ?? null)));
    return true;
  }),
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

import { simulateTable, USERS } from "../../helpers/multiClient.js";
import { scriptClaude } from "../../helpers/faults.js";
import { CampaignStateSchema } from "../../../src/schemas.js";
import { stakesShown } from "../../../src/moves/stakes.js";

const MISS_LINE = "Their first volley catches your shoulder.";
const STAKES = { hit: "You catch the raiders flat-footed.", miss: MISS_LINE, missSuffer: { move: "endure_harm", amount: 1 } };
const READINGS = {
  enter_the_fray: { moveId: "enter_the_fray", moveName: "Enter the Fray", statUsed: "edge", moveTarget: "Ironclad raiders",
    combatRank: "dangerous", rationale: "Combat begins.", confidence: "high", stakes: STAKES },
  face_danger:    { moveId: "face_danger", moveName: "Face Danger", statUsed: "edge", rationale: "A risky dash.", confidence: "high", stakes: STAKES },
};
const MISS = [0.55, 0.65, 0.1];   // challenge 6, 7; action die 1 + edge 2 = 3: a miss; momentum 2 cannot burn it

let table, pc, reading;
const priceCards = () => table.cards(f => f.payThePriceCard);
const narratorCalls = () => table.claude.calls.filter(c => /MOVE OUTCOME/.test(`${c.userText}`));

/** The "Starforged Progress Tracks" journal: a document-level flag store, as progressTracks.js writes it. */
function makeTracksJournal() {
  const flags = {};
  return {
    id:      "tracks-journal",
    name:    "Starforged Progress Tracks",
    getFlag: (mod, key) => flags[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { flags[`${mod}.${key}`] = JSON.parse(JSON.stringify(value)); },
  };
}

async function roll(moveId) {
  reading = READINGS[moveId];
  control.dice = MISS;
  await table.client("pl-1").chat("I draw and open fire on the raiders.", { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
  const call = narratorCalls().at(-1);
  const prompt = `${call?.system ?? ""}\n${call?.userText ?? ""}`;
  // What the Confirm dialog showed under "On a miss" (stakes.js stakesShown — its own renderer's input).
  const shown = stakesShown(control.confirmedStakes.at(-1)).find(s => s.kind === "miss") ?? null;
  return {
    narrated:      !!call,
    dialogPromise: shown ? `${shown.text}${shown.cost ? ` (${shown.cost})` : ""}` : null,
    toldAsCost:    /it is what this miss costs/.test(prompt) && prompt.includes("(Endure Harm −1)"),
    charged:       pc.system.health.value === 4,
  };
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 60_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  silenceConsoleErrors();
  control.confirmedStakes = [];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "mova2-s1", sessionNumber: 1,
      currentSceneId: "mova2-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  pc = table.addActor({ id: "pc-kira-mova2", name: "Kira", ownership: { "pl-1": 3 }, system: { edge: 2, momentum: { value: 2 } } });
  table.journal._set(makeTracksJournal());
  scriptClaude(table, { fallback: (call) => (/move interpreter/.test(call?.system ?? "")
    ? JSON.stringify(reading)
    : /NARRATOR ROLE|SIDECAR/.test(call?.system ?? "")
      ? 'Shots crack across the bay.\n```json\n{"newTruths":[],"stateChanges":[]}\n```'
      : "{}") });
});

describe("MOVA-02 — a miss cost the dialog and the narrator state is a cost the miss charges", () => {
  it("control: a Face Danger miss — the dialog's \"On a miss\" line is charged (its card, Endure Harm -1) and narrated as the cost", async () => {
    const r = await roll("face_danger");
    expect(r.narrated).toBe(true);
    expect(r.dialogPromise).toBe(`${MISS_LINE} (Endure Harm −1)`);
    expect(priceCards()).toHaveLength(1);
    expect(priceCards()[0].content).toContain(`As stated before the roll: <strong>${MISS_LINE}</strong>`);
    expect(r).toMatchObject({ toldAsCost: true, charged: true });
  }, 60_000);

  it("an Enter the Fray miss pays no price: the dialog does not show a miss cost it will not charge", async () => {
    const r = await roll("enter_the_fray");
    expect(r.narrated, "the miss was narrated (setup)").toBe(true);
    expect(table.cards(f => f.combatThresholdCard), "the fight begins (setup)").toHaveLength(1);
    expect(priceCards(), "Enter the Fray's miss routes no Pay the Price (setup)").toHaveLength(0);

    // "On a miss: … (Endure Harm −1)" was on the dialog; the miss charged nothing.
    const promisedUncharged = r.dialogPromise === `${MISS_LINE} (Endure Harm −1)` && !r.charged;
    expect(promisedUncharged,
      `the dialog showed "On a miss: ${r.dialogPromise}"; health is ${pc.system.health.value} and no Pay the Price card was posted`).toBe(false);
  }, 60_000);

  it("…and its narration is not told \"(Endure Harm −1) … it is what this miss costs\" when nothing was charged", async () => {
    const r = await roll("enter_the_fray");
    expect(r.narrated, "the miss was narrated (setup)").toBe(true);
    expect(pc.system.health.value === 4 || !r.toldAsCost,
      `the narrator was told the miss costs Endure Harm −1; health is ${pc.system.health.value}`).toBe(true);
  }, 60_000);
});
