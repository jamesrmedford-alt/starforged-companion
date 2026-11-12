/**
 * STARFORGED COMPANION
 * tests/unit/owedResistRollHandedBack.test.js
 *
 * An owed resist roll the GM's confirm did not let roll puts its card back
 * (issue #347 AB06).
 *
 * The harm step at 0 health posts a resist card (issue #330 D3). Its button
 * claims the card ("Applied: Endure Harm rolled to resist") before anything
 * runs, then posts the forced Endure Harm, whose confirm dialog the GM can
 * close. Nothing was rolled, the card was not reopened, and nobody was told:
 * the owed roll was lost, and the move's Burn Momentum had been closed for it.
 * The pipeline now puts the card back live and whispers the roller — and,
 * the consequence no longer chosen, the move's Burn Momentum is open again
 * (issue #347 RESIST-BURN-STAYS-CLOSED).
 */
/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], closeConfirm: false, confirms: 0, settled: [], interpretation: null, ptp: [78] }));
vi.mock("../../src/moves/interpreter.js", async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text, { expectedMoveSlug } = {}) => (
    expectedMoveSlug
      ? { moveId: expectedMoveSlug, moveName: expectedMoveSlug, statUsed: "iron", adds: 0, rationale: "test", mischiefApplied: false, playerNarration: text, inputMethod: "chat" }
      : { ...control.interpretation, playerNarration: text, inputMethod: "chat" }
  )),
}));
// The Pay the Price d100, scripted (78: "You are harmed" → Endure Harm -1).
vi.mock("../../src/oracles/roller.js", async (original) => {
  const real = await original();
  return { ...real, rollOracle: (...args) => {
    if (args[0] !== "pay_the_price") return real.rollOracle(...args);
    const rng = vi.spyOn(Math, "random");
    for (const value of control.ptp) rng.mockReturnValueOnce((value - 0.5) / 100);
    try { return real.rollOracle(...args); } finally { rng.mockRestore(); }
  } };
});
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
// The REAL confirm dialog (MoveConfirmDialog), closed as the window's ✕ /
// Escape closes it, or accepted.
vi.mock("../../src/ui/settingsPanel.js", async (original) => {
  const real = await original();
  return { ...real, confirmInterpretation: vi.fn(async (interp) => {
    control.confirms += 1;
    const shown  = real.MoveConfirmDialog.prompt(interp);
    const dialog = real.MoveConfirmDialog.pending;
    // No abilities apply (the scan is stubbed empty): the form Accept reads is empty.
    dialog.element = { querySelectorAll: () => [], querySelector: () => null };
    // closeConfirm: true closes every confirm; a move id closes that move's alone.
    if (control.closeConfirm === true || control.closeConfirm === interp?.moveId) await dialog.close();
    else await real.MoveConfirmDialog.DEFAULT_OPTIONS.actions.accept.call(dialog);
    const answer = await shown;
    control.settled.push(control.closeConfirm === true ? answer : [interp?.moveId, answer]);
    return answer;
  }) };
});
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
import { applyPayThePriceSufferFromRelay } from "../../src/index.js";

let table, kira;
const flags = (id) => table.world.message(id).flags[MODULE_ID];
const resistCards = () => table.cards(f => f.sufferCard && f.sufferPrompt?.resist === "health");
/** Every notification on either screen and every chat card, as { where, text }. */
const said = () => [
  ...table.client("gm-1").notifications.map((n, i) => ({ where: `gm-1 notification ${i}`, text: n.message })),
  ...table.client("pl-1").notifications.map((n, i) => ({ where: `pl-1 notification ${i}`, text: n.message })),
  ...table.cards(() => true).map(c => ({ where: `card ${c._id}`, text: String(table.world.message(c._id).content ?? "") })),
];

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.closeConfirm = false; control.confirms = 0; control.settled.length = 0;
  control.dice = [0.45, 0.65, 0.2];   // challenge 5 and 7, action 2 — a miss on +iron 1
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "s1", sessionNumber: 1,
      currentSceneId: "scene-1", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
    system: { momentum: { value: 2 }, health: { value: 1 }, iron: 1, edge: 2 }, items: { contents: [] } });
  scriptClaude(table, { fallback: () => 'The moment passes.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  silenceConsoleErrors();
});

/** "You are harmed" at 1 health: health 0, and the resist card the harm owes. */
async function harmToZero() {
  const gm = table.client("gm-1");
  await gm.run(() => applyPayThePriceSufferFromRelay({ routes: [{ move: "endure_harm", amount: 1 }], actorId: kira.id },
    { requesterId: "gm-1", requesterIsGM: true }));
  await table.settle(); await table.drain();
  const [resist] = resistCards();
  expect(resist).toBeTruthy();
  expect(kira.system.health.value).toBe(0);
  return resist;
}

async function pressResist(card) {
  await table.client("pl-1").click(card._id, '[data-action="sf-suffer-pick"][data-option-index="0"]');
  await table.settle(); await table.drain();
}

describe("the owed resist roll and the GM's confirm dialog (issue #347 AB06)", () => {
  it("control: the resist card's press rolls Endure Harm once the GM accepts the confirm", async () => {
    const resist = await harmToZero();
    await pressResist(resist);
    expect(control.confirms).toBe(1);
    expect(control.settled).toEqual([["endure_harm", true]]);
    expect(flags(resist._id).resolved).toBe(true);
    expect(table.cards(f => f.moveResolution)).toHaveLength(1);
    expect(table.world.campaignState().pendingMove).toBe(false);
  }, 30_000);

  it("control: closing the confirm dialog settles its promise (false) and releases the move lock", async () => {
    const resist = await harmToZero();
    control.closeConfirm = true;
    await pressResist(resist);
    expect(control.confirms).toBe(1);
    expect(control.settled).toEqual([false]);
    expect(table.world.campaignState().pendingMove).toBe(false);
  }, 30_000);

  it("the GM closes the confirm dialog: the owed Endure Harm is rolled, or its card is live again, or the table is told", async () => {
    const resist = await harmToZero();
    control.closeConfirm = true;
    const before = new Set(said().map(x => x.where));
    await pressResist(resist);
    expect(control.confirms).toBe(1);            // the forced Endure Harm reached the confirm …
    expect(control.settled).toEqual([false]);    // … which was closed

    const fresh = said().filter(x => !before.has(x.where)).map(x => x.text);

    // Not rolled — the card is live again, its buttons back, and the table is told.
    const rolled   = table.cards(f => f.moveResolution).length > 0;
    const reopened = flags(resist._id).resolved !== true;
    const told     = fresh.some(text => /not rolled/i.test(text));
    expect({ rolled, reopened, told }).toEqual({ rolled: false, reopened: true, told: true });
    expect(String(table.world.message(resist._id).content)).toMatch(/data-action="sf-suffer-pick"/);

    // The press made again, with the confirm accepted, rolls it.
    control.closeConfirm = false;
    await pressResist(resist);
    expect(table.cards(f => f.moveResolution)).toHaveLength(1);
    expect(flags(resist._id).resolved).toBe(true);
  }, 30_000);

  it("a move's price owes the roll: the press closed the move's Burn Momentum for a roll that is then never made — handed back, the Burn opens again", async () => {
    // Kira (momentum 8, health 1) misses Face Danger; its Pay the Price harms her to 0 health.
    kira.system.momentum.value = 8;
    control.interpretation = { moveId: "face_danger", moveName: "Face Danger", statUsed: "edge", adds: 0, rationale: "test", mischiefApplied: false };
    control.dice = [0.45, 0.65, 0.2];   // challenge 5 and 7, action 2 + edge 2 — a miss; momentum 8 would burn it to a strong hit
    await table.client("pl-1").chat("Kira forces the hatch and dives through.", { speaker: { actor: kira.id } });
    await table.settle(); await table.drain();
    const moveCard = table.cards(f => f.moveResolution).at(-1);
    expect(flags(moveCard._id).burn?.canBurn, "the miss offers a burn").toBe(true);
    expect(flags(moveCard._id).burn?.choiceMade ?? false).toBe(false);
    const [resist] = resistCards();
    expect(flags(resist._id).resolutionId).toBe(flags(moveCard._id).resolutionId);

    control.closeConfirm = "endure_harm";   // the GM closes the resist roll's confirm
    await pressResist(resist);
    expect(control.settled.at(-1)).toEqual(["endure_harm", false]);

    const rolled     = table.cards(f => f.moveResolution).length > 1;
    const reopened   = flags(resist._id).resolved !== true;
    // The owed roll is not lost — its card is live again — and with no
    // consequence chosen now, the move's Burn Momentum is open again.
    expect({ rolled, reopened }).toEqual({ rolled: false, reopened: true });
    expect(flags(moveCard._id).burn?.choiceMade).toBe(false);

    // The press made again, with the confirm accepted: the consequence is chosen — the Burn closes.
    control.closeConfirm = false;
    await pressResist(resist);
    expect(flags(resist._id).resolved).toBe(true);
    expect(flags(moveCard._id).burn?.choiceMade).toBe(true);
  }, 30_000);
});
