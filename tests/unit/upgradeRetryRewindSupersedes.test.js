/**
 * STARFORGED COMPANION
 * tests/unit/upgradeRetryRewindSupersedes.test.js
 *
 * UPGRADE-RETRY-REWIND-NO-SUPERSEDE (found while fixing issue #342;
 * pre-existing). A burn that rewinds a clock out of its triggered state
 * supersedes the clock's trigger vignette (issue #338 D8; Z46 — the rewind
 * reports the clocks it took out of full). A rewind the world refuses goes to
 * the GMs' payoff failure card as an upgrade step, and the vignette rightly
 * stands — the clock is still full. But the GMs' Retry ran the rewind through
 * applyUpgradeStep with no report, so once it landed nothing superseded the
 * vignette: a live narrator card with binding facts beside a clock no longer
 * triggered, and the clock's next fill fired a second vignette for the same
 * trigger (D8's own harm). The Retry now supersedes what its rewind takes out
 * of full, as the first pass does — a tension clock, and a vow's countdown
 * clock by its vow (the step carries the vow's id, as the vignette names it).
 *
 * Harness: burnRewindsClockAnotherPriceFired.test.js's (Z46), with the Q05
 * vow Items of resultUpgrade.test.js.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], interpretation: null, ptp: 48 }));
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
// Challenge dice first (two d10), then the action die (d6), inside the REAL resolveMove.
vi.mock("../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});
// Pay the Price 48: "A new enemy is revealed" — no meter route, only the clocks.
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

let table, kira;
const world = () => table.world.campaignState();
const flags = (id) => table.world.message(id).flags[MODULE_ID];
const clock = () => world().clocks.find(c => c._id === "t1");
const vignettes = (clockId) => table.cards(f => f.clockVignetteCard && f.narratorCard && f.clockId === clockId);
const failureCards = () => table.cards(f => f.payoffFailureCard && f.source === "upgrade");

// [challenge, challenge, action] Math.random values: challenge 6, 7; action die 1 — iron 3 + 1 misses.
const MISS = [0.55, 0.65, 0.1];

/** Kira narrates a Face Danger; returns its move card. */
async function faceDanger() {
  control.interpretation = { moveId: "face_danger", moveName: "Face Danger", statUsed: "iron", adds: 0, rationale: "test", mischiefApplied: false };
  control.dice = MISS;
  await table.client("pl-1").chat("Kira dives for the breach controls.", { speaker: { actor: kira.id } });
  await table.settle(); await table.drain();
  return table.cards(f => f.moveResolution && f.actorId === kira.id).at(-1);
}

async function burn(card) {
  await table.client("pl-1").click(card._id, '[data-action="sf-burn-momentum"]');
  await table.settle(); await table.drain();
}

async function gmRetry(card) {
  await table.client("gm-1").click(card._id, '[data-action="sf-payoff-retry"]');
  await table.settle(); await table.drain();
}

/** An open vow Item with a countdown clock at 5/6, a shared vow's copy (`vowId`); `refuse` counts updates to reject. */
function clockVow() {
  return {
    id: "vow-item-1", name: "Free Chen", type: "progress", flags: { [MODULE_ID]: { vowId: "vow-chen" } },
    system: { subtype: "vow", rank: "dangerous", current: 0, completed: false, hasClock: true, clockTicks: 5, clockMax: 6 },
    refuse: 0,
    async update(changes) {
      if (this.refuse > 0) { this.refuse--; throw new Error("test: refused Item write"); }
      for (const [path, value] of Object.entries(changes)) {
        const parts = path.split("."); let node = this;
        for (const k of parts.slice(0, -1)) node = node[k] ??= {};
        node[parts.at(-1)] = value;
      }
      return this;
    },
  };
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: {
    // The price is paid and the result narrated at once, and an upgrade
    // undoes them — the flow these tests are about. (Asking first is the
    // default since issue #354 P2-10: heldResultBeforePrice.test.js.)
    holdResultForUpgrade: false,
    chronicleAutoEntry: false,
    narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "retry-s1", sessionNumber: 1,
      currentSceneId: "retry-scene", sceneTruths: [],
      clocks: [{ _id: "t1", name: "Reactor breach", type: "tension", segments: 4, filled: 3, active: true }] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { momentum: { value: 9 } } });
  scriptClaude(table, { fallback: () => 'The reactor screams as the shielding fails.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

describe("UPGRADE-RETRY-REWIND-NO-SUPERSEDE — the GMs' Retry of a refused clock rewind", () => {
  it("a tension clock: the Retry's rewind takes it out of its trigger (4 → 3), and the trigger vignette is superseded", async () => {
    const card = await faceDanger();
    expect(clock().filled).toBe(4);
    expect(vignettes("t1")).toHaveLength(1);
    const vignette = vignettes("t1")[0];

    // The burn's rewind (the write that takes the clock to 3) is refused once.
    let refused = false;
    table.interceptWrites(w => {
      if (!refused && w.kind === "setting" && /campaignState$/.test(w.key)
        && w.value?.clocks?.find?.(c => c._id === "t1")?.filled === 3) {
        refused = true;
        return new Error("test: refused clock rewind");
      }
    });
    await burn(card);
    expect(refused).toBe(true);
    expect(flags(card._id).burn.consumed).toBe(true);
    expect(clock().filled).toBe(4);
    // Control: the clock is still triggered, so its vignette stands until the rewind lands.
    expect(flags(vignette._id).burnSuperseded).toBeUndefined();
    const failure = failureCards().at(-1);
    expect(failure.flags[MODULE_ID].steps).toMatchObject([
      { step: "upgrade", effect: "tensionClocks", clocks: [{ _id: "t1", name: "Reactor breach" }] },
    ]);

    await gmRetry(failure);

    expect(clock().filled).toBe(3);
    expect(flags(vignette._id).burnSuperseded).toBe(true);    // was: undefined — a live vignette beside a 3/4 clock
    expect(failureCards()).toHaveLength(1);                    // nothing failed again
  }, 30_000);

  it("the next price fills the rewound clock again: one live trigger vignette, not two", async () => {
    const card = await faceDanger();
    let refused = false;
    table.interceptWrites(w => {
      if (!refused && w.kind === "setting" && /campaignState$/.test(w.key)
        && w.value?.clocks?.find?.(c => c._id === "t1")?.filled === 3) {
        refused = true;
        return new Error("test: refused clock rewind");
      }
    });
    await burn(card);
    await gmRetry(failureCards().at(-1));
    expect(clock().filled).toBe(3);

    await faceDanger();          // a later miss: its price fills the clock, 3 → 4, and it triggers again
    expect(clock().filled).toBe(4);
    expect(vignettes("t1")).toHaveLength(2);
    expect(vignettes("t1").filter(m => m.flags[MODULE_ID].burnSuperseded !== true)).toHaveLength(1);   // was: 2
  }, 30_000);

  it("a vow's countdown clock: the Retry's rewind supersedes its vignette, named by the vow", async () => {
    const vow = clockVow();
    kira.items.contents.splice(0, kira.items.contents.length, vow);
    const card = await faceDanger();
    expect(vow.system.clockTicks).toBe(6);
    expect(vignettes("vow-chen")).toHaveLength(1);
    const vignette = vignettes("vow-chen")[0];

    vow.refuse = 1;              // the burn's rewind of the vow's clock
    await burn(card);
    expect(vow.system.clockTicks).toBe(6);
    expect(flags(vignette._id).burnSuperseded).toBeUndefined();
    const failure = failureCards().at(-1);
    expect(failure.flags[MODULE_ID].steps).toMatchObject([
      { step: "upgrade", effect: "vowClocks", entries: [{ actorId: kira.id, itemId: vow.id, name: "Free Chen" }] },
    ]);

    await gmRetry(failure);

    expect(vow.system.clockTicks).toBe(5);
    expect(flags(vignette._id).burnSuperseded).toBe(true);    // was: undefined
  }, 30_000);

  it("control: a Retry whose rewind takes no clock out of full supersedes nothing — an earlier trigger's vignette stands", async () => {
    // The clock was reset after an earlier trigger, whose vignette happened; it stands at 1/4 now.
    await table.client("gm-1").setSetting("campaignState", { ...world(), clocks: [{ ...clock(), filled: 1 }] });
    await table.client("gm-1").run(() => ChatMessage.create({
      content: '<div class="sf-clock-card"><strong>⚠ TRIGGERED — </strong><em>The breach opened, before the repairs.</em></div>',
      flags: { [MODULE_ID]: { clockCard: true, clockVignetteCard: true, narratorCard: true, clockId: "t1",
        narrationText: "The breach opened, before the repairs.", sessionId: "retry-s1", narrationId: "nar-earlier-trigger" } },
    }));
    await table.settle();
    const [earlier] = vignettes("t1");
    const card = await faceDanger();                     // its price takes the clock 1 → 2: no trigger
    expect(clock().filled).toBe(2);
    let refused = false;
    table.interceptWrites(w => {
      if (!refused && w.kind === "setting" && /campaignState$/.test(w.key)
        && w.value?.clocks?.find?.(c => c._id === "t1")?.filled === 1) {
        refused = true;
        return new Error("test: refused clock rewind");
      }
    });
    await burn(card);
    expect(refused).toBe(true);
    await gmRetry(failureCards().at(-1));
    expect(clock().filled).toBe(1);                      // the Retry's rewind landed …
    expect(vignettes("t1")).toHaveLength(1);
    expect(flags(earlier._id).burnSuperseded).toBeUndefined();   // … and took no trigger back
  }, 30_000);
});
