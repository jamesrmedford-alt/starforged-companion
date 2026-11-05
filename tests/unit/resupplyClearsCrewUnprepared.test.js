/**
 * STARFORGED COMPANION
 * tests/unit/resupplyClearsCrewUnprepared.test.js
 *
 * Known-issues UNPREPARED-CLEAR-ONE-PC, decided with issue #338 D3 (option A
 * with the crew-wide clear). The crew marks unprepared together — "because you
 * and your allies share the same supply value, you mark unprepared together"
 * (issue #315 S07, markUnprepared over `supplyAllies`) — but Resupply's "clear
 * unprepared" cleared the roller's impact alone: Vex Resupplies, the shared
 * supply rises to 1, and Kira stays unprepared above 0 until her own recovery
 * move or a sheet edit. The clear now goes through the same crew
 * (clearUnprepared), and the card names who was cleared with the roller.
 *
 * Driven end to end on a booted table (interpretation and dice scripted).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

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
import { scriptClaude, failWrites } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

let table, vex, kira;
const STRONG = [0.0, 0.15, 0.9];   // challenge 1, 2; action die 6 — a strong hit
const WEAK   = [0.25, 0.65, 0.5];  // challenge 3, 7; action die 4 — iron 3 → 7: a weak hit
const CLEAR_UNPREPARED = 0;        // Resupply's strong-hit card: "Clear unprepared + take/give +1 supply"
const SACRIFICE_RESOURCES = 3;     // the "make a suffer move" picker's order (sufferCard.js ANY_SUFFER_MOVES)

async function move(player, actor, moveId, statUsed, dice, line) {
  control.interpretation = { moveId, moveName: moveId, statUsed, adds: 0, rationale: "test", mischiefApplied: false };
  control.dice = dice;
  await table.client(player).chat(line, { speaker: { actor: actor.id } });
  await table.settle(); await table.drain();
  return table.cards(f => f.sufferCard && f.sufferPrompt && !f.resolved).at(-1);
}
async function pick(player, card, index) {
  await table.client(player).click(card._id, '[data-action="sf-suffer-pick"]', { index });
  await table.settle(); await table.drain();
}
const unprepared = () => ({ vex: !!vex.system.debility.unprepared, kira: !!kira.system.debility.unprepared });
const crewCard = () => table.cards(f => f.sufferDeferred).filter(m => /Unprepared cleared for the crew/.test(m.content)).at(-1);

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "s1", sessionNumber: 1,
      currentSceneId: "scene-1", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  // The supply ran out last scene: the crew is unprepared together (issue #315 S07).
  vex  = table.addActor({ id: "pc-vex",  name: "Vex",  ownership: { "pl-1": 3 },
    system: { supply: { value: 0 }, momentum: { value: 4 }, debility: { unprepared: true } } });
  kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-2": 3 },
    system: { supply: { value: 0 }, momentum: { value: 4 }, debility: { unprepared: true } } });
  scriptClaude(table, { fallback: () => 'The trader nods.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

describe("Resupply clears unprepared for the crew sharing the supply (UNPREPARED-CLEAR-ONE-PC, issue #338 D3)", () => {
  it("Vex's Resupply strong hit clears Vex and Kira, and the card names Kira", async () => {
    const card = await move("pl-1", vex, "resupply", "wits", STRONG, "I haggle for fuel cells at the depot.");
    expect(card.flags[MODULE_ID].sufferPrompt.options[CLEAR_UNPREPARED].label).toMatch(/Clear unprepared/);
    await pick("pl-1", card, CLEAR_UNPREPARED);

    // Kira stayed unprepared at supply 1 (the roller's impact alone was cleared).
    expect(unprepared()).toEqual({ vex: false, kira: false });
    expect(vex.system.supply.value).toBe(1);
    expect(kira.system.supply.value).toBe(1);        // the shared supply's mirror (sharedSupply.js)
    expect(crewCard().content).toMatch(/Kira, sharing the supply, is no longer <strong>unprepared<\/strong> either/);
  }, 30_000);

  it("…so Kira's next loss of resources is paid from the supply, and the crew is marked together again at 0", async () => {
    await pick("pl-1", await move("pl-1", vex, "resupply", "wits", STRONG, "I haggle for fuel cells."), CLEAR_UNPREPARED);
    const picker = await move("pl-2", kira, "face_danger", "iron", WEAK, "I force the jammed hatch.");
    expect(picker.flags[MODULE_ID].sufferPrompt).toMatchObject({ kind: "any", amount: 1 });
    const root = table.client("pl-2").render(picker._id);
    expect(root.querySelector('[data-suffer-id="sacrifice_resources"]').disabled).toBe(false);
    await pick("pl-2", picker, SACRIFICE_RESOURCES);
    expect(kira.system.supply.value).toBe(0);
    expect(unprepared()).toEqual({ vex: true, kira: true });
  }, 30_000);

  it("an ally's refused clear is named on the card; the roller's stands", async () => {
    failWrites(table, (w) => w.kind === "actor.update" && w.id === "pc-kira" && JSON.stringify(w.changes).includes("unprepared"));
    const card = await move("pl-1", vex, "resupply", "wits", STRONG, "I haggle for fuel cells.");
    await pick("pl-1", card, CLEAR_UNPREPARED);
    expect(unprepared()).toEqual({ vex: false, kira: true });
    expect(crewCard().content).toMatch(/Kira could not be cleared of unprepared — clear it on the sheet/);
  }, 30_000);

  it("control: a PC with no ally unprepared posts no crew card", async () => {
    kira.system.debility.unprepared = false;
    await pick("pl-1", await move("pl-1", vex, "resupply", "wits", STRONG, "I haggle for fuel cells."), CLEAR_UNPREPARED);
    expect(unprepared()).toEqual({ vex: false, kira: false });
    expect(crewCard()).toBeUndefined();
  }, 30_000);

  it("control: Heal's wound is the patient's alone — the clear of another impact is not the crew's", async () => {
    vex.system.debility.wounded = true;
    kira.system.debility.wounded = true;
    vex.system.health.value = 2;
    const card = await move("pl-1", vex, "heal", "iron", STRONG, "I stitch my own wound.");
    await pick("pl-1", card, 0);   // "Clear wounded + take/give +2 health"
    expect(vex.system.debility.wounded).toBe(false);
    expect(kira.system.debility.wounded).toBe(true);
  }, 30_000);
});
