/**
 * STARFORGED COMPANION
 * tests/unit/burnRewindsClockAnotherPriceFired.test.js
 *
 * Issue #342 Z46 BURN-REWINDS-CLOCK-ANOTHER-PRICE-FIRED (the upgrades
 * auditor's UPG-1 probe; issue #338 D8, incomplete fix).
 *
 * Two players on a booted table (tests/helpers/multiClient.js), the real move
 * pipeline on the canonical GM. The "Reactor breach" tension clock stands at
 * 2/4. Kira's Face Danger misses: its Pay the Price advances the clock 2 → 3.
 * Ren's Face Danger misses: his price advances it 3 → 4 — the clock triggers
 * and its "⚠ TRIGGERED" vignette is narrated (a narrator card carrying the
 * clock's id). Kira then burns momentum on her miss (her card is still open:
 * only her own later move closes it). The burn reversal rewinds the clock one
 * segment, 4 → 3: the clock is no longer triggered — but D8's supersede ran
 * only for the clocks the burned price itself triggered (`c.triggered` on
 * Kira's receipt), so Ren's trigger vignette stayed a live narrator card with
 * binding facts beside a 3/4 clock, and the next price filled the clock and
 * fired a second vignette for the same trigger — D8's own harm. The rewind
 * now reports the clocks it takes out of their triggered state, as its
 * queued write reads them, and those are superseded.
 *
 * Decision D8 (option A): "A burn or improvement that rewinds a fired clock
 * supersedes its trigger vignette".
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
// Pay the Price 48: "A new enemy is revealed" — no meter route, only the clock.
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

let table, kira, ren;
const world = () => table.world.campaignState();
const flags = (id) => table.world.message(id).flags[MODULE_ID];
const clock = () => world().clocks.find(c => c._id === "t1");
const vignettes = () => table.cards(f => f.clockVignetteCard && f.narratorCard && f.clockId === "t1");

// [challenge, challenge, action] Math.random values: challenge 6, 7; action die 1 — iron 3 + 1 misses.
const MISS = [0.55, 0.65, 0.1];

/** A player narrates a Face Danger as their PC; returns its move card. */
async function faceDanger(userId, actor) {
  control.interpretation = { moveId: "face_danger", moveName: "Face Danger", statUsed: "iron", adds: 0, rationale: "probe", mischiefApplied: false };
  control.dice = MISS;
  await table.client(userId).chat(`${actor.name} dives for the breach controls.`, { speaker: { actor: actor.id } });
  await table.settle(); await table.drain();
  return table.cards(f => f.moveResolution && f.actorId === actor.id).at(-1);
}

async function burn(userId, card) {
  await table.client(userId).click(card._id, '[data-action="sf-burn-momentum"]');
  await table.settle(); await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "upg1-s1", sessionNumber: 1,
      currentSceneId: "upg1-scene", sceneTruths: [],
      clocks: [{ _id: "t1", name: "Reactor breach", type: "tension", segments: 4, filled: 2, active: true }] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { momentum: { value: 9 } } });
  ren  = table.addActor({ id: "pc-ren",  name: "Ren",  ownership: { "pl-2": 3 }, system: { momentum: { value: 9 } } });
  scriptClaude(table, { fallback: () => 'The reactor screams as the shielding fails.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

/** Kira's miss advances the clock 2 → 3; Ren's miss fills it, 3 → 4, and fires its trigger vignette. */
async function bothMiss() {
  const kiraCard = await faceDanger("pl-1", kira);
  expect(clock().filled).toBe(3);
  expect(flags(kiraCard._id).burn.ptpReversals.clocksAdvanced).toEqual([
    expect.objectContaining({ _id: "t1", filled: 3, triggered: false }),
  ]);
  const renCard = await faceDanger("pl-2", ren);
  expect(clock().filled).toBe(4);
  expect(flags(renCard._id).burn.ptpReversals.clocksAdvanced).toEqual([
    expect.objectContaining({ _id: "t1", filled: 4, triggered: true }),
  ]);
  expect(vignettes()).toHaveLength(1);
  return { kiraCard, renCard, vignette: vignettes()[0] };
}

describe("Z46 — a burn rewinds a clock another player's price fired", () => {
  it("Kira's burn takes the clock out of its trigger (4 → 3): Ren's trigger vignette is superseded", async () => {
    const { kiraCard, vignette } = await bothMiss();

    await burn("pl-1", kiraCard);

    expect(flags(kiraCard._id).burn.consumed).toBe(true);
    expect(clock().filled).toBe(3);                          // no longer triggered …
    // … so the trigger the vignette narrates has not happened (D8 option A).
    expect(flags(vignette._id).burnSuperseded).toBe(true);
  }, 30_000);

  it("the next price fills the clock again: one trigger, one live vignette — not two", async () => {
    const { kiraCard } = await bothMiss();
    await burn("pl-1", kiraCard);
    expect(clock().filled).toBe(3);

    // Ren misses again: his price fills the rewound clock, 3 → 4, and it triggers again.
    await faceDanger("pl-2", ren);
    expect(clock().filled).toBe(4);
    expect(vignettes()).toHaveLength(2);
    const live = vignettes().filter(m => m.flags[MODULE_ID].burnSuperseded !== true);
    expect(live).toHaveLength(1);
  }, 30_000);

  it("control: Ren's burn — his own price fired the clock — supersedes the vignette", async () => {
    const { renCard, vignette } = await bothMiss();

    await burn("pl-2", renCard);

    expect(flags(renCard._id).burn.consumed).toBe(true);
    expect(clock().filled).toBe(3);
    expect(flags(vignette._id).burnSuperseded).toBe(true);
  }, 30_000);
});
