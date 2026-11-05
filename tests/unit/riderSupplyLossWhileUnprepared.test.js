/**
 * STARFORGED COMPANION
 * tests/unit/riderSupplyLossWhileUnprepared.test.js
 *
 * Issue #336 Y19 (RIDER-SUPPLY-LOSS-WHILE-UNPREPARED). The crew's supply is 0
 * and everyone is unprepared. Kira's move resolves and an asset rider costs
 * "-1 supply" — the loss issue #331 X16 made mark unprepared.
 * writeCharacterMeters wrote supply 0 → 0 (the clamp), found the crew already
 * marked, and the rider came back `{ ok: true }`: the summary listed "-1
 * supply" under "✦ Asset effects applied" — the loss settled for nothing.
 * "When you suffer a loss of resources while unprepared … apply the cost to a
 * different suffer move" (vendored Sacrifice Resources; at any supply — issue
 * #338 D3): the executor's own loss posts the "make a suffer move" picker
 * (issue #325 W16); a rider's supply loss is the same loss at a second site,
 * and now posts that picker, bound to the move, and is reported not applied.
 */

/* global makeTestActor */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ riders: [] }));
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../src/moves/interpreter.js", async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ moveId: "face_danger", moveName: "Face Danger", statUsed: "iron", adds: 0,
    playerNarration: text, inputMethod: "chat", rationale: "test", mischiefApplied: false })),
}));
vi.mock("../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => control.riders.length
    ? [{ key: "bike:0", assetId: "bike", assetName: "Hoverbike", abilityIndex: 0, text: "An asset ability with a supply cost." }]
    : []),
}));
vi.mock("../../src/moves/consequenceRiders.js", async (original) => ({
  ...(await original()), extractRiders: vi.fn(async () => structuredClone(control.riders)),
}));
vi.mock("../../src/ui/settingsPanel.js", async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
// Challenge dice 2 and 3, action die 6, inside the REAL resolveMove: a strong hit, no match.
vi.mock("../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random").mockReturnValueOnce(0.15).mockReturnValueOnce(0.25).mockReturnValueOnce(0.99);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { applyMeterRiders } from "../../src/moves/consequenceRiders.js";
import { sacrificeResources } from "../../src/moves/sufferExecutor.js";
import { invalidateActorCache } from "../../src/character/actorBridge.js";
import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude, failWrites } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

/** The W16 picker: an "any" suffer card that excludes Sacrifice Resources. */
const isRedirectPicker = (f) => f?.sufferCard && f.sufferPrompt?.kind === "any" && (f.sufferPrompt.exclude ?? []).includes("sacrifice_resources");
const redirectPickers = () => ChatMessage._created.filter(m => isRedirectPicker(m.flags?.[MODULE_ID]));

describe("a rider's supply loss while unprepared goes to another suffer move (issue #336 Y19)", () => {
  let kira, ren;
  const pc = (id, name, owner, supply, unprepared) => {
    const actor = makeTestActor({ id, name, ownership: { [owner]: 3 }, system: { supply: { value: supply }, debility: { unprepared } } });
    game.actors._set(actor.id, actor);
    invalidateActorCache(actor.id);
    return actor;
  };
  beforeEach(() => {
    ChatMessage._reset();
    game.actors._reset();
    kira = pc("pc-kira", "Kira", "pl-1", 0, true);
    ren  = pc("pc-ren",  "Ren",  "pl-2", 0, true);
  });

  it("at 0 supply, unprepared: the W16 picker is posted, bound to the move, and the rider is not applied", async () => {
    const results = await applyMeterRiders(
      [{ resource: "supply", amount: -1, text: "suffer -1 supply", assetName: "Hoverbike", label: "-1 supply" }],
      { characterActor: kira, shipActorId: null, resolutionId: "res-1" },
    );
    expect(kira.system.supply.value).toBe(0);
    expect(redirectPickers()).toHaveLength(1);
    const picker = redirectPickers()[0].flags[MODULE_ID];
    expect(picker).toMatchObject({ sufferPrompt: { kind: "any", amount: 1, count: 1 }, actorId: "pc-kira", resolutionId: "res-1" });
    expect(results[0]).toMatchObject({ ok: false, reason: "redirected" });
    expect(results[0].note).toMatch(/Kira is <strong>unprepared<\/strong> — the -1 supply goes to another suffer move/);
  });

  it("unprepared above 0 (issue #338 D3's rule): the supply is left, the loss goes to the picker", async () => {
    kira.system.supply.value = 2;
    invalidateActorCache(kira.id);
    const results = await applyMeterRiders([{ resource: "supply", amount: -2, label: "-2 supply" }], { characterActor: kira, shipActorId: null });
    expect(kira.system.supply.value).toBe(2);
    expect(redirectPickers().map(m => m.flags[MODULE_ID].sufferPrompt.amount)).toEqual([2]);
    expect(results[0]).toMatchObject({ ok: false, reason: "redirected" });
  });

  it("the move's other effects still land: +1 momentum is written, the supply loss redirected", async () => {
    const before = kira.system.momentum.value;
    const results = await applyMeterRiders(
      [{ resource: "momentum", amount: 1, label: "+1 momentum" }, { resource: "supply", amount: -1, label: "-1 supply" }],
      { characterActor: kira, shipActorId: null },
    );
    expect(kira.system.momentum.value).toBe(before + 1);
    expect(kira.system.supply.value).toBe(0);
    expect(results.map(r => [r.rider.resource, r.ok, r.reason ?? null])).toEqual([["momentum", true, null], ["supply", false, "redirected"]]);
  });

  it("control: the executor's own loss at 0 while unprepared posts the picker (W16)", async () => {
    const res = await sacrificeResources(kira, 1, {});
    expect(res).toMatchObject({ atZero: true, redirected: true });
    expect(redirectPickers()).toHaveLength(1);
    expect(kira.system.supply.value).toBe(0);
  });

  it("control: a rider at supply 1, not unprepared, takes the supply and marks the crew (X16)", async () => {
    kira.system.supply.value = 1; kira.system.debility.unprepared = false;
    ren.system.supply.value  = 1; ren.system.debility.unprepared  = false;
    invalidateActorCache(kira.id); invalidateActorCache(ren.id);
    const results = await applyMeterRiders([{ resource: "supply", amount: -1, label: "-1 supply" }], { characterActor: kira, shipActorId: null });
    expect(results[0]).toMatchObject({ ok: true });
    expect(kira.system.supply.value).toBe(0);
    expect(kira.system.debility.unprepared).toBe(true);
    expect(ren.system.debility.unprepared).toBe(true);
    expect(redirectPickers()).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// On a booted table: the move's summary card and the payoff Retry.
// ─────────────────────────────────────────────────────────────────────────────

let table, pcA;
const summary = () => table.cards(f => f.riderSummary).at(-1)?.content ?? "";
const pickers = () => table.cards(f => isRedirectPicker(f));

describe("the summary never lists a redirected supply loss as applied (issue #336 Y19, on a table)", () => {
  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => {
    control.riders = [{ key: "bike:0", assetName: "Hoverbike", abilityName: "",
      riders: [{ resource: "supply", amount: -1, label: "-1 supply", condition: "strong_hit", optional: false, choiceGroup: null }] }];
    await table.reset({ world: { settings: {
      chronicleAutoEntry: false,
      campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "s1", sessionNumber: 1,
        currentSceneId: "scene-1", sceneTruths: [], clocks: [] },
    } } });
    await table.setClaudeKey("gm-1", "sk-ant-test");
    pcA = table.addActor({ id: "pc-a", name: "Kira", ownership: { "pl-1": 3 },
      system: { supply: { value: 0 }, debility: { unprepared: true } } });
    scriptClaude(table, { fallback: () => 'The moment turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  });

  async function move() {
    await table.client("pl-1").chat("I gun the bike through the gap.", { speaker: { actor: pcA.id } });
    await table.settle(); await table.drain();
  }

  it("-1 supply at 0 while unprepared: 'not applied', said why, and the picker is the move's", async () => {
    await move();
    expect(summary()).not.toMatch(/Asset effects applied/);
    expect(summary()).toMatch(/Asset effects not applied[\s\S]*-1 supply[\s\S]*Kira is <strong>unprepared<\/strong> — the -1 supply goes to another suffer move/);
    const moveCard = table.cards(f => f.moveResolution).at(-1);
    expect(pickers()).toHaveLength(1);
    expect(pickers()[0].flags[MODULE_ID].resolutionId).toBe(moveCard.flags[MODULE_ID].resolutionId);
    expect(moveCard.flags[MODULE_ID].resolutionId).toBeTruthy();
    expect(pcA.system.supply.value).toBe(0);
  }, 30_000);

  it("a refused supply write, retried once the PC is unprepared, posts the picker and settles the step", async () => {
    pcA.system.debility.unprepared = false;
    pcA.system.supply.value = 2;
    failWrites(table, (w) => w.kind === "actor.update" && w.id === "pc-a" && JSON.stringify(w.changes).includes("supply"));
    await move();
    const failure = table.cards(f => f.payoffFailureCard).at(-1);
    expect(failure.flags[MODULE_ID].steps.map(s => s.step)).toEqual(["rider"]);

    pcA.system.debility.unprepared = true;            // the supply ran out meanwhile
    table.client("gm-1").click(failure._id, '[data-action="sf-payoff-retry"]');
    await table.settle(); await table.drain();
    expect(pickers()).toHaveLength(1);
    expect(table.cards(f => f.payoffFailureCard)).toHaveLength(1);   // no second card owing it again
    expect(pcA.system.supply.value).toBe(2);
  }, 30_000);

  it("control: not unprepared, the cost is paid and listed as applied", async () => {
    pcA.system.debility.unprepared = false;
    pcA.system.supply.value = 3;
    await move();
    expect(pcA.system.supply.value).toBe(2);
    expect(summary()).toMatch(/Asset effects applied[\s\S]*-1 supply/);
    expect(pickers()).toHaveLength(0);
  }, 30_000);
});
