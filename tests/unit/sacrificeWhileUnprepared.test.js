/**
 * A loss of resources while unprepared at 0 supply goes to a different
 * suffer move, never settled for nothing (issue #325 W16).
 *
 * Rule (vendored Sacrifice Resources text): "If your supply is exhausted
 * (reduced to 0), mark unprepared. When you suffer a loss of resources while
 * unprepared, envision how this causes you hardship and apply the cost to a
 * different suffer move." The executor wrote 0 → 0, found the PC already
 * unprepared and posted "further loss redirects to another suffer move", and
 * the choice resolved — nothing offered the redirect, so at 0 supply
 * Sacrifice Resources was a free answer to every "make a suffer move". It is
 * now unavailable on a choice card while the PC is unprepared at 0, and a
 * routed loss (a Pay the Price entry) posts a picker of the other moves.
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
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

let table, pc;
const WEAK = [0.25, 0.65, 0.5];   // challenge 3, 7; die 4 — iron 3 → 7: a weak hit
const SACRIFICE_RESOURCES = 3;    // ANY_SUFFER_MOVES order (sufferCard.js)

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "probe-s1", sessionNumber: 1,
      currentSceneId: "probe-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
    system: { supply: { value: 0 }, momentum: { value: 4 }, debility: { unprepared: true } } });
  scriptClaude(table, { fallback: () => 'You make it, barely.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

async function weakFaceDanger() {
  control.interpretation = { moveId: "face_danger", moveName: "Face Danger", statUsed: "iron", adds: 0, rationale: "probe", mischiefApplied: false };
  control.dice = WEAK;
  await table.client("pl-1").chat("I force the jammed hatch.", { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
  return table.cards(f => f.sufferCard && f.sufferPrompt).at(-1);
}

const meters = () => ({ health: pc.system.health.value, spirit: pc.system.spirit.value, supply: pc.system.supply.value, momentum: pc.system.momentum.value });

describe("Sacrifice Resources while unprepared at 0", () => {
  it("control: the weak hit posts the 'make a suffer move (-1)' picker", async () => {
    const card = await weakFaceDanger();
    expect(card.flags[MODULE_ID].sufferPrompt).toMatchObject({ kind: "any", amount: 1 });
  });

  it("Sacrifice Resources at 0 supply while unprepared does not settle the cost for nothing", async () => {
    const card = await weakFaceDanger();
    const before = meters();
    await table.client("pl-1").click(card._id, '[data-action="sf-suffer-pick"]', { index: SACRIFICE_RESOURCES });
    await table.settle(); await table.drain();

    const paid = Object.keys(before).some(k => meters()[k] < before[k]);
    const stillOpen = table.world.message(card._id).flags[MODULE_ID].resolved !== true
      || table.cards(f => f.sufferCard && f.sufferPrompt && !f.resolved).length > 0;
    expect(paid || stillOpen).toBe(true);
  });

  it("the picker offers it as unavailable, and the cost is paid by another suffer move", async () => {
    const card = await weakFaceDanger();
    const root = table.client("pl-1").render(card._id);
    const sacrifice = root.querySelector('[data-suffer-id="sacrifice_resources"]');
    expect(sacrifice.disabled).toBe(true);
    expect(sacrifice.textContent).toMatch(/unavailable/);

    await table.client("pl-1").click(card._id, '[data-action="sf-suffer-pick"][data-suffer-id="lose_momentum"]');
    await table.settle(); await table.drain();
    expect(pc.system.momentum.value).toBe(3);
    expect(table.world.message(card._id).flags[MODULE_ID].resolved).toBe(true);
  });

  it("a routed loss (no choice offered) posts a picker of the other suffer moves and changes nothing yet", async () => {
    const gm = table.client("gm-1");
    const { sacrificeResources } = await gm.import("../../src/moves/sufferExecutor.js");
    const res = await gm.run(() => sacrificeResources(globalThis.game.actors.get("pc-kira"), 1, { isMiss: true }));
    await table.settle();

    expect(res).toMatchObject({ before: 0, after: 0, redirected: true });
    const picker = table.cards(f => f.sufferCard && f.sufferPrompt?.kind === "any").at(-1);
    expect(picker.flags[MODULE_ID].sufferPrompt).toMatchObject({ amount: 1, exclude: ["sacrifice_resources"] });
    expect(picker.flags[MODULE_ID].executorOpts).toMatchObject({ isMiss: true });
    expect(meters()).toMatchObject({ supply: 0, momentum: 4 });
  });

  it("control: with supply left, Sacrifice Resources is offered and paid", async () => {
    pc.system.supply.value = 2;
    pc.system.debility.unprepared = false;
    const card = await weakFaceDanger();
    await table.client("pl-1").click(card._id, '[data-action="sf-suffer-pick"]', { index: SACRIFICE_RESOURCES });
    await table.settle(); await table.drain();
    expect(pc.system.supply.value).toBe(1);
  });
});
