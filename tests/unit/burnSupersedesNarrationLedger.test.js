/**
 * Issue #338 D8 (option A), end to end on a booted table: a burn that
 * rewinds a fired clock supersedes the clock's trigger vignette, and the
 * burn's superseded move narration leaves the scene ledgers by its
 * narrationId — while the re-narration may state the same fact again.
 *
 * Kira (momentum 9) Faces Danger and misses. The Pay the Price ("a new
 * hazard": no suffer route) advances the "Reactor breach" tension clock onto
 * its last segment; it triggers and its "⚠ TRIGGERED" vignette's sidecar
 * records "the reactor core is venting". The move's narration records "Kira
 * is pinned under the fallen bulkhead". Kira burns to a strong hit: the
 * clock is rewound to 3/4, the vignette is struck and out of narrator memory
 * with its truth retracted, the move narration's truth is retracted too, and
 * the re-narration of the strong hit — which says Kira is pinned as well —
 * records that as a live truth. Also: Begin a Session's trigger vignette names
 * its clock (the third post site).
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], ptp: [40] }));
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../src/moves/interpreter.js", async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({
    moveId: "face_danger", moveName: "Face Danger", statUsed: "edge", adds: 0, rationale: "test",
    mischiefApplied: false, playerNarration: text, inputMethod: "chat",
  })),
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
// The Pay the Price d100 (40: "The environment or terrain introduces a new hazard" — no suffer route),
// and Begin a Session's campaign clock roll answered YES.
vi.mock("../../src/oracles/roller.js", async (original) => {
  const real = await original();
  return { ...real,
    rollYesNo: vi.fn(() => ({ answer: "yes", roll: 1, isMatch: false })),
    rollOracle: (...args) => {
      if (args[0] !== "pay_the_price") return real.rollOracle(...args);
      const rng = vi.spyOn(Math, "random");
      for (const value of control.ptp) rng.mockReturnValueOnce((value - 0.5) / 100);
      try { return real.rollOracle(...args); } finally { rng.mockRestore(); }
    },
  };
});

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

const MISS = [0.45, 0.65, 0.2];   // challenge 5, 7; die 2 + edge 2 = 4: a miss; momentum 9 beats both
const sidecar = (prose, truths) =>
  `${prose}\n\`\`\`json\n${JSON.stringify({ newTruths: truths.map(([subject, fact]) => ({ subject, fact })), stateChanges: [] })}\n\`\`\``;
const VIGNETTE = sidecar("The reactor core vents into the lower decks.", [["reactor", "The reactor core is venting into the lower decks"]]);
const MOVE     = sidecar("The bulkhead gives way and pins Kira.", [["Kira", "Kira is pinned under the fallen bulkhead"]]);
const BURNED   = sidecar("Kira wrenches free — though pinned a moment, she is through.", [["Kira", "Kira is pinned under the fallen bulkhead"], ["Kira", "Kira is through the breach"]]);

let table, kira;
const world = () => table.world.campaignState();
const flags = (id) => table.world.message(id).flags[MODULE_ID];
const truthsOf = (re) => (world().sceneTruths ?? []).filter(t => re.test(t.fact));

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.ptp = [40];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "bs-s1", sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: "bs-scene", sceneTruths: [],
      clocks: [{ _id: "t1", name: "Reactor breach", type: "tension", segments: 4, filled: 3, active: true }] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
    system: { momentum: { value: 9 }, health: { value: 5 }, edge: 2 } });
  scriptClaude(table, { fallback: () => 'The moment passes.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' })
    .when(call => /has TRIGGERED/.test(call.userText), VIGNETTE)
    .when(call => /^## MOVE OUTCOME/.test(call.userText) && /burned momentum to upgrade/i.test(call.userText), BURNED)
    .when(call => /^## MOVE OUTCOME/.test(call.userText) && /forces the hatch/.test(call.userText), MOVE);
  silenceConsoleErrors();
});

describe("issue #338 D8 — a burn that rewinds a fired clock", () => {
  it("strikes the clock's trigger vignette and retracts both superseded narrations' truths; the re-narration's stand", async () => {
    control.dice = MISS;
    await table.client("pl-1").chat("Kira forces the hatch and dives through.", { speaker: { actor: kira.id } });
    await table.settle(); await table.drain();

    const card = table.cards(f => f.moveResolution).at(-1);
    expect(flags(card._id).burn).toMatchObject({ canBurn: true, originalApplied: true, previewOutcome: "strong_hit" });
    expect(world().clocks[0].filled).toBe(4);
    const vignette = table.cards(f => f.clockVignetteCard).at(-1);
    expect(vignette.flags[MODULE_ID]).toMatchObject({ clockId: "t1", narratorCard: true });
    const narration = table.cards(f => f.narratorCard && f.resolutionId === flags(card._id).resolutionId).at(-1);
    expect(narration, "the move's narration").toBeTruthy();
    expect(truthsOf(/reactor core is venting/)).toMatchObject([{ retracted: false, narrationId: vignette.flags[MODULE_ID].narrationId }]);
    expect(truthsOf(/pinned under the fallen bulkhead/)).toMatchObject([{ retracted: false, narrationId: narration.flags[MODULE_ID].narrationId }]);

    table.client("pl-1").click(card._id, '[data-action="sf-burn-momentum"]');
    await table.settle(); await table.drain();

    expect(flags(card._id).burn.consumed).toBe(true);
    expect(world().clocks[0].filled).toBe(3);
    // The vignette: struck, out of narrator memory, its truth retracted (as superseded — never named under CORRECTED).
    expect(flags(vignette._id).burnSuperseded).toBe(true);
    expect(table.world.message(vignette._id).content).toMatch(/clock rewound: this has not happened/);
    expect(truthsOf(/reactor core is venting/)).toMatchObject([{ retracted: true, retractedBy: "superseded" }]);
    // The move's superseded narration: its truth retracted by its narrationId…
    expect(flags(narration._id).burnSuperseded).toBe(true);
    const pinned = truthsOf(/pinned under the fallen bulkhead/);
    expect(pinned.find(t => t.narrationId === narration.flags[MODULE_ID].narrationId)).toMatchObject({ retracted: true, retractedBy: "superseded" });
    // …while the re-narration, which says it too, records it as a live truth beside its own new one.
    const renarration = table.cards(f => f.narratorCard && !f.burnSuperseded && f.narrationId
      && f.narrationId !== narration.flags[MODULE_ID].narrationId && f.narrationId !== vignette.flags[MODULE_ID].narrationId).at(-1);
    expect(renarration, "the strong hit's re-narration").toBeTruthy();
    expect(pinned.filter(t => !t.retracted)).toMatchObject([{ narrationId: renarration.flags[MODULE_ID].narrationId }]);
    expect(truthsOf(/through the breach/)).toMatchObject([{ retracted: false }]);
  }, 30_000);
});

describe("issue #338 D8 — Begin a Session's trigger vignette names its clock", () => {
  it("the campaign clock Begin a Session fills is stamped on its trigger vignette", async () => {
    await table.client("gm-1").setSetting("campaignState", { ...world(), sessionActive: false, sessionStartedId: null,
      clocks: [{ _id: "camp-1", name: "Hostile expansion", type: "campaign", segments: 4, filled: 3, active: true, advanceOdds: "likely" }] });
    await table.settle();
    const api = await table.client("gm-1").import("../../src/multiplayer/gmRelay.js");
    await table.client("gm-1").run(() => api.requestGmAction("session.begin", { vignetteRolled: false, includeGalley: false }));
    await table.settle(); await table.drain();

    expect(world().clocks[0].filled).toBe(4);
    const vignette = table.cards(f => f.clockVignetteCard).at(-1);
    expect(vignette?.flags?.[MODULE_ID]?.clockId).toBe("camp-1");
  }, 30_000);
});
