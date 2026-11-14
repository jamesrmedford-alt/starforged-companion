/**
 * STARFORGED COMPANION
 * tests/unit/redirectPickerSurvivesUpgrade.test.js
 *
 * Issue #331 X15 (REDIRECT-PICKER-SURVIVES-UPGRADE). The crew's supply is 0
 * and Kira is unprepared; her Gather Information misses and the Pay the
 * Price lands "You waste resources" (Sacrifice Resources -1). With nothing to
 * sacrifice, a "Make a suffer move (-1)" picker takes the loss (issue #325
 * W16). She then burns momentum — or improves the result — and the miss
 * becomes a strong hit, which pays no price.
 *
 * The picker is the price still waiting to be paid: it is bound to the move's
 * resolution, so the upgrade retires it with the miss's other choice cards
 * (issue #311 P03) and a late pick on it applies nothing.
 *
 * On a booted table (tests/helpers/multiClient.js): the GM's real move
 * pipeline, with the interpretation, the applicable abilities, the dice and
 * the d100 scripted at their boundaries.
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], interpretation: null, abilities: [], ptp: 70 }));
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../src/moves/interpreter.js", async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: "chat" })),
}));
vi.mock("../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => control.abilities),
}));
vi.mock("../../src/ui/settingsPanel.js", async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
// Challenge dice first (two d10), then the action die (d6), inside the REAL resolveMove.
vi.mock("../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});
// The Pay the Price d100, scripted (70: "You waste resources" → Sacrifice Resources -1).
vi.mock("../../src/oracles/roller.js", async (original) => {
  const real = await original();
  return { ...real, rollOracle: (...args) => {
    if (args[0] !== "pay_the_price") return real.rollOracle(...args);
    const rng = vi.spyOn(Math, "random").mockReturnValueOnce((control.ptp - 0.5) / 100);
    try { return real.rollOracle(...args); } finally { rng.mockRestore(); }
  } };
});

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

let table, pc;
const flags = (id) => table.world.message(id).flags[MODULE_ID];

const MISS = [0.55, 0.65, 0.1];   // challenge 6, 7; action die 1 — wits 2 misses; momentum 8 burns it to a strong hit
const WEAK = [0.25, 0.65, 0.5];   // challenge 3, 7; action die 4 — edge 2 → 6: a weak hit
const FUGITIVE = [{ assetId: null, assetName: "Fugitive", resultImprovement: { improveTo: "strong_hit" }, hasClock: false }];

/** The suffer-choice cards on the table (the pickers), newest last. */
const choiceCards = () => table.cards(f => f.sufferCard && f.sufferPrompt);

async function roll(moveId, statUsed, dice) {
  control.interpretation = { moveId, moveName: moveId, statUsed, adds: 0, rationale: "test", mischiefApplied: false };
  control.dice = dice;
  await table.client("pl-1").chat(`Kira attempts ${moveId}.`, { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
  return table.cards(f => f.moveResolution).at(-1);
}

async function click(card, selector) {
  await table.client("pl-1").click(card._id, selector);
  await table.settle(); await table.drain();
}

/**
 * The player's pick on a card their client still shows as live (a view not
 * yet re-rendered): the relay the button sends, handled on the canonical GM.
 * A retired card renders no buttons, so this is the only way a late pick
 * reaches the GM.
 */
async function latePick(card, sufferId) {
  const gm = table.client("gm-1");
  const { applySufferPickFromRelay } = await gm.import("../../src/moves/sufferCard.js");
  const res = await gm.run(() => applySufferPickFromRelay({ messageId: card._id, pickKind: "any", sufferId },
    { requesterId: "pl-1", requesterIsGM: false, requester: gm.game.users.get("pl-1") }));
  await table.settle(); await table.drain();
  return res;
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.ptp = 70;
  control.abilities = [];
  await table.reset({ world: { settings: {
    // The price is paid and the result narrated at once, and an upgrade
    // undoes them — the flow these tests are about. (Asking first is the
    // default since issue #354 P2-10: heldResultBeforePrice.test.js.)
    holdResultForUpgrade: false,
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "redir-s1", sessionNumber: 1,
      currentSceneId: "redir-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
    system: { momentum: { value: 8 }, supply: { value: 0 }, debility: { unprepared: true } } });
  scriptClaude(table, { fallback: () => 'The moment turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  silenceConsoleErrors();
});

describe("X15 — the redirected Pay the Price loss is retired by the upgrade that undid the price", () => {
  it("a burn retires the redirect picker, and a pick on it afterwards applies nothing", async () => {
    const card = await roll("gather_information", "wits", MISS);
    const picker = choiceCards().at(-1);
    expect(picker).toBeTruthy();                                            // W16: the loss went to a picker
    expect(picker.flags[MODULE_ID].sufferPrompt).toMatchObject({ kind: "any", amount: 1, exclude: ["sacrifice_resources"] });
    expect(picker.flags[MODULE_ID].resolved).toBe(false);
    // Bound to the move that paid the price.
    expect(picker.flags[MODULE_ID].resolutionId).toBe(flags(card._id).resolutionId);
    expect(pc.system.supply.value).toBe(0);

    await click(card, '[data-action="sf-burn-momentum"]');
    expect(flags(card._id).burn.consumed).toBe(true);                       // the miss is a strong hit now
    expect(pc.system.momentum.value).toBe(3);                               // reset 1 (unprepared is an impact) + Gather Information's +2

    const after = flags(picker._id);
    expect(after.resolved === true || after.superseded === true).toBe(true);

    expect(await latePick(picker, "endure_harm")).toMatchObject({ applied: false });
    expect(pc.system.health.value).toBe(5);                                 // the undone price is not charged
  }, 30_000);

  it("an Improve Result retires it the same way", async () => {
    control.abilities = FUGITIVE;
    const card = await roll("gather_information", "wits", MISS);
    const picker = choiceCards().at(-1);
    expect(picker.flags[MODULE_ID].resolutionId).toBe(flags(card._id).resolutionId);

    await click(card, '[data-action="sf-improve-result"]');
    expect(flags(card._id).improve.consumed).toBe(true);
    expect(flags(picker._id).superseded).toBe(true);

    expect(await latePick(picker, "endure_harm")).toMatchObject({ applied: false });
    expect(pc.system.health.value).toBe(5);
  }, 30_000);

  it("a pick taken before any upgrade still applies, and closes the move's upgrades", async () => {
    const card = await roll("gather_information", "wits", MISS);
    const picker = choiceCards().at(-1);
    await click(picker, '[data-suffer-id="endure_harm"]');
    expect(pc.system.health.value).toBe(4);
    expect(flags(picker._id).resolved).toBe(true);
    // The consequence was chosen: the burn is closed, since it would not undo
    // the pick (P03).
    expect(flags(card._id).burn.choiceMade).toBe(true);
  }, 30_000);

  it("control: the move's own choice card (a weak Face Danger's picker) is retired by the burn", async () => {
    pc.system.supply.value = 3;
    pc.system.debility.unprepared = false;
    const card = await roll("face_danger", "edge", WEAK);
    const picker = choiceCards().at(-1);
    expect(picker.flags[MODULE_ID].resolutionId).toBe(flags(card._id).resolutionId);

    await click(card, '[data-action="sf-burn-momentum"]');
    expect(flags(card._id).burn.consumed).toBe(true);
    expect(flags(picker._id).superseded).toBe(true);
  }, 30_000);
});
