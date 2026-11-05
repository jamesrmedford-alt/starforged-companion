/**
 * Issue #336 Y16 REFUSED-METER-WRITE-LOSES-RECORD — a refused meter write
 * no longer loses the move's record.
 *
 * Kira's Set a Course strong hit (+1 momentum; the crew arrives at
 * Bleakhold). The world refused her momentum write — the Actor update
 * persistResolution makes BEFORE the move's record. `applyMeterChanges`
 * threw, so the record was never attempted: the arrival on the working copy
 * was lost, no payoff failure card was posted, and the GM read "Move
 * interpretation failed. Check your API key…", while the "Course held
 * cleanly (+1 momentum)" card told the table they arrived with +1.
 *
 * Now the two writes are apart (issue #331 X52: one write's refusal is its
 * own): the record is still written, and the refused meters go on the GMs'
 * payoff failure card with a Retry, as a refused record's steps do (X18) —
 * the GM is told what the world refused, not to check the key.
 *
 * (Converted from the tenth audit's probe
 * tests/probes/pipeline/refusedMeterWriteLosesRecord.probe.js.)
 */

/* global expectConsoleError, makeTestActor */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: null }));
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
    if (!control.dice) return real.resolveMove(...args);
    const rng = vi.spyOn(Math, "random");
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude, failWrites, campaignStateWrite } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";
import { persistResolution } from "../../src/moves/persistResolution.js";

const STRONG_HIT = [0.05, 0.05, 0.99];   // challenge 1, 1; action die 6

let table;
const world = () => table.world.campaignState();
const gm    = () => table.client("gm-1");
const kiraMeterWrite = (w) => w.kind === "actor.update" && w.id === "pc-kira" && "system.momentum.value" in (w.changes ?? {});
/** The move's record: the one campaignState write of the GM's that carries persistResolution's stamp. */
const persistWrite = (w) => campaignStateWrite("gm-1")(w) && !!w.value?.updatedAt && w.value.updatedAt !== (world().updatedAt ?? null);
const failCards = () => table.cards(f => f.payoffFailureCard);
const momentum  = () => table.actors.get("pc-kira").system.momentum.value;
const notices   = () => gm().notifications.map(n => n.message);
const MOMENTUM_STEP = { step: "suffer", call: { kind: "meter", meterKey: "momentum", delta: 1 }, opts: {} };

async function kiraSetsACourse() {
  control.dice = STRONG_HIT;
  await table.client("pl-1").chat("I set a course for Bleakhold.", {
    speaker: { actor: "pc-kira", alias: "Kira" },
    flags: { [MODULE_ID]: { bypassPacing: true, forcedMoveId: "set_a_course", forcedMoveTarget: "Bleakhold", forcedMoveTargetId: "actor-bleak" } },
  });
  await table.settle(); await table.drain();
}

async function retry(card) {
  gm().click(card._id, '[data-action="sf-payoff-retry"]');
  await table.settle(); await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "mw-s1", sessionNumber: 1,
      currentSceneId: "mw-scene", sceneTruths: [], clocks: [], legacyTracks: {},
      sectors: [{ id: "sec-1", name: "Reach" }], activeSectorId: "sec-1",
      settlementIds: ["actor-bleak"], shipIds: ["ship-cv"] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { momentum: { value: 2 } } });
  table.addActor({ id: "ship-cv", type: "starship", name: "Wayfarer",
    flags: { [MODULE_ID]: { entityType: "ship", ship: { _id: "mw-ship", name: "Wayfarer", isCommandVehicle: true } } } });
  table.addActor({ id: "actor-bleak", type: "location", name: "Bleakhold",
    system: { subtype: "settlement", klass: "orbital" },
    flags: { [MODULE_ID]: { entityType: "settlement", settlement: { _id: "mw-bleak", name: "Bleakhold", sectorId: "sec-1" } } } });
  scriptClaude(table, { fallback: () => 'The course holds.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

describe("issue #336 Y16 — the roller's meter write is refused before the move's record", () => {
  it("the arrival is saved; the momentum goes on the GMs' card with a Retry — not lost under 'check your API key'", async () => {
    expectConsoleError(/did not save Kira's meters/);
    const refused = failWrites(table, kiraMeterWrite);

    await kiraSetsACourse();

    // The move resolved as a strong hit, the meter write was refused once, Kira's momentum stands.
    expect(table.cards(f => f.moveResolution)).toHaveLength(1);
    expect(refused.refused).toBe(1);
    expect(momentum()).toBe(2);
    expect(world().pendingMove).toBe(false);
    expect(table.world.messages().some(m => /Course held cleanly/.test(m.content ?? ""))).toBe(true);

    // The record was written: the crew is at Bleakhold.
    expect(world().currentLocationId).toBe("actor-bleak");

    // The GMs hold the refused momentum, with a Retry.
    const [card] = failCards();
    expect(failCards()).toHaveLength(1);
    expect(card.flags[MODULE_ID]).toMatchObject({ source: "persist", actorId: "pc-kira", steps: [MOMENTUM_STEP] });
    expect(card.whisper).toEqual(["gm-1"]);
    expect(card.content).toMatch(/Move not fully saved — Kira/);
    expect(card.content).toMatch(/Momentum \+1 for Kira — the world did not save it.*Kira's momentum stands at 2 now/);

    // The GM is told by cause.
    expect(notices()).toContainEqual(expect.stringMatching(/did not save Kira's meters from Set a Course — the rest of the move was saved/i));
    expect(notices().some(n => /API key/.test(n))).toBe(false);

    await retry(card);
    expect(momentum()).toBe(3);
    await retry(card);                                  // claimed: a second press adds nothing
    expect(momentum()).toBe(3);
  }, 30_000);

  it("the record refused too: both on one card — the arrival and the momentum — and the notice names both", async () => {
    expectConsoleError(/did not save Kira's meters|did not save the move's record/);
    failWrites(table, kiraMeterWrite);
    failWrites(table, persistWrite);

    await kiraSetsACourse();

    expect(world().currentLocationId ?? null).toBeNull();
    expect(momentum()).toBe(2);
    const [card] = failCards();
    expect(failCards()).toHaveLength(1);
    expect(card.flags[MODULE_ID].steps).toEqual([
      MOMENTUM_STEP,
      { step: "arrival", locationId: "actor-bleak", locationType: "settlement", name: "Bleakhold" },
    ]);
    expect(notices()).toContainEqual(expect.stringMatching(/did not save Set a Course's record, nor Kira's meters\. What it changed is on the GMs' card, with a Retry\./i));
    expect(notices().some(n => /API key/.test(n))).toBe(false);

    await retry(card);
    expect(world().currentLocationId).toBe("actor-bleak");
    expect(momentum()).toBe(3);
  }, 30_000);

  it("control: with the write accepted the world has the arrival and Kira's +1 momentum", async () => {
    await kiraSetsACourse();

    expect(world().currentLocationId).toBe("actor-bleak");
    expect(momentum()).toBe(3);
    expect(failCards()).toHaveLength(0);
  }, 30_000);
});

describe("issue #336 Y16 — persistResolution writes the record whatever the meter writes do", () => {
  const KEY = `${MODULE_ID}.campaignState`;
  const aidResolution = {
    _id: "res-aid", moveId: "aid_your_ally", moveName: "Aid Your Ally", outcome: "strong_hit",
    consequences: { momentumChange: 2, healthChange: 0, spiritChange: 0, supplyChange: 0, beneficiary: "ally" },
  };
  function refusingActor(id, name) {
    const actor = makeTestActor({ id, name, type: "character", hasPlayerOwner: true, system: { momentum: { value: 2, max: 10 } } });
    actor.update = vi.fn(async () => { throw new Error("refused by the test"); });
    return actor;
  }

  beforeEach(() => {
    game.actors._reset();
    game.settings._store.clear();
    game.settings._store.set(KEY, { currentSessionId: "s-1" });
  });

  it("an aided ally's refused momentum is a step naming the ally; the roller's untouched, the record written", async () => {
    expectConsoleError(/did not save Ren's meters/);
    const kira = makeTestActor({ id: "pc-kira", name: "Kira", type: "character", hasPlayerOwner: true, system: { momentum: { value: 2, max: 10 } } });
    const ren  = refusingActor("pc-ren", "Ren");
    game.actors._set(kira.id, kira);
    game.actors._set(ren.id, ren);

    const out = await persistResolution(aidResolution, { currentSessionId: "s-1", marker: "the move's record" }, "pc-kira", { allyActorId: "pc-ren" });

    expect(out.meterFailures).toEqual([{
      step: "suffer", call: { kind: "meter", meterKey: "momentum", delta: 2 }, opts: { allyActorId: "pc-ren" },
      reason: "refused", error: "refused by the test",
    }]);
    expect(game.settings._store.get(KEY).marker).toBe("the move's record");
  });

  it("a refused record carries the refused meters on its error", async () => {
    expectConsoleError(/did not save Kira's meters/);
    const kira = refusingActor("pc-kira", "Kira");
    game.actors._set(kira.id, kira);
    const set = vi.spyOn(game.settings, "set").mockRejectedValueOnce(new Error("record refused"));
    try {
      const resolution = { ...aidResolution, consequences: { ...aidResolution.consequences, beneficiary: null, momentumChange: 1 } };
      const err = await persistResolution(resolution, { currentSessionId: "s-1" }, "pc-kira").catch(e => e);
      expect(err.moveRecordRefused).toBe(true);
      expect(err.meterFailures).toEqual([expect.objectContaining({ step: "suffer", call: { kind: "meter", meterKey: "momentum", delta: 1 } })]);
    } finally {
      set.mockRestore();
    }
  });
});
