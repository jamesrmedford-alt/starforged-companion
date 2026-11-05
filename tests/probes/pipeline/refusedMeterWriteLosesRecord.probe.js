/**
 * PROBE — PIPE-02 REFUSED-METER-WRITE-LOSES-RECORD (tenth audit, area pipeline)
 *
 * What the user does: Kira sets a course for Bleakhold and scores a strong
 * hit (+1 momentum, and the crew arrives — the arrival sets the campaign's
 * current location). Then the world refuses her momentum write (the Actor
 * update persistResolution makes before the move's record — a server error,
 * a dropped socket: the fault the fault matrix drives for the record itself).
 *
 * What happens: persistResolution's actor write throws before the record is
 * attempted (src/moves/persistResolution.js:96 → :114), so the rejection is
 * not `moveRecordRefused` and falls to the pipeline's catch (src/index.js
 * :1850): "Move interpretation failed. Check your API key…". The arrival on
 * the working copy (applyOutcomeEffects, src/index.js:2138 → noteUnsavedOnCopy)
 * never reaches the world, no payoff failure card is posted (reportUnsavedMoveRecord
 * runs only for a refused record, :1799–1805), and the "Course held cleanly
 * (+1 momentum)" feedback card (postSetACourseFeedbackCard, posted before the
 * persist) stands: the table reads an arrival and a +1 the world never got.
 *
 * What should happen: issue #331 X18's rule — "a refused move record goes to
 * the GMs' failure card with a Retry" — one write earlier: the record's
 * owned steps (the arrival, a legacy mark, a site reveal) are still saved or
 * put on the GMs' card with a Retry, and the GM is told by cause, not
 * "check your API key" (known ERROR-TEXT-BLAMES-KEY names the wording; the
 * lost record is the X18 loss at a sibling fault).
 *
 * Control: with the write accepted the world has the arrival and Kira's +1.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/pipeline/refusedMeterWriteLosesRecord.probe.js
 */

/* global expectConsoleError */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: null }));
vi.mock("../../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
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
    if (!control.dice) return real.resolveMove(...args);
    const rng = vi.spyOn(Math, "random");
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from "../../helpers/multiClient.js";
import { scriptClaude, failWrites } from "../../helpers/faults.js";
import { CampaignStateSchema } from "../../../src/schemas.js";

const STRONG_HIT = [0.05, 0.05, 0.99];   // challenge 1, 1; action die 6

let table;
const world = () => table.world.campaignState();
const gm    = () => table.client("gm-1");
const kiraMeterWrite = (w) => w.kind === "actor.update" && w.id === "pc-kira" && "system.momentum.value" in (w.changes ?? {});
const failCards = () => table.cards(f => f.payoffFailureCard);

async function kiraSetsACourse() {
  control.dice = STRONG_HIT;
  await table.client("pl-1").chat("I set a course for Bleakhold.", {
    speaker: { actor: "pc-kira", alias: "Kira" },
    flags: { [MODULE_ID]: { bypassPacing: true, forcedMoveId: "set_a_course", forcedMoveTarget: "Bleakhold", forcedMoveTargetId: "actor-bleak" } },
  });
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

describe("PIPE-02 — the roller's meter write is refused before the move's record", () => {
  it("the arrival is saved, or on the GMs' card with a Retry — not lost under 'check your API key'", async () => {
    expectConsoleError(/Move interpretation failed/);
    const refused = failWrites(table, kiraMeterWrite);

    await kiraSetsACourse();

    // Sanity: the move resolved as a strong hit, the meter write was refused once, Kira's momentum stands.
    expect(table.cards(f => f.moveResolution)).toHaveLength(1);
    expect(refused.refused).toBe(1);
    expect(table.actors.get("pc-kira").system.momentum.value).toBe(2);
    expect(world().pendingMove).toBe(false);
    // The table was told the crew arrived with +1 momentum (the feedback card posts before the persist).
    expect(table.world.messages().some(m => /Course held cleanly/.test(m.content ?? ""))).toBe(true);

    // Expected: the arrival reached the world, or the GMs hold a Retry for it (the X18 rule).
    // Actual: currentLocationId null and no payoff failure card — the record was never attempted.
    const arrivalRetry = failCards().some(c => (c.flags[MODULE_ID].steps ?? []).some(s => s.step === "arrival"));
    expect(world().currentLocationId === "actor-bleak" || arrivalRetry).toBe(true);
    // Secondary: the notice names the cause, not the key (known ERROR-TEXT-BLAMES-KEY).
    const notices = gm().notifications.map(n => n.message);
    expect.soft(notices.some(n => /API key/.test(n))).toBe(false);
  }, 30_000);

  it("control: with the write accepted the world has the arrival and Kira's +1 momentum", async () => {
    await kiraSetsACourse();

    expect(world().currentLocationId).toBe("actor-bleak");
    expect(table.actors.get("pc-kira").system.momentum.value).toBe(3);
    expect(failCards()).toHaveLength(0);
  }, 30_000);
});
