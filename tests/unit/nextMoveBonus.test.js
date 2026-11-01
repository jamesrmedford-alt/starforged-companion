/**
 * STARFORGED COMPANION
 * tests/unit/nextMoveBonus.test.js
 *
 * "+1 on your next move (not a progress move)" — Secure an Advantage's strong
 * hit (beside its +2 momentum), its weak-hit pick and Gain Ground's — is the
 * roller's own, added by the move pipeline to that character's next action
 * roll (issue #322 V02; maintainer decision 2026-11-01). The pick only posted
 * a reminder card ("Remember to add +1 …") flagged `nextBonus`, a flag nothing
 * read, and the confirm dialog has no adds input; the strong hit's +1 was the
 * card's text alone. Take a Break's table-wide +1 was already applied this
 * way (decisions.md, "Take a Break's +1 applies to the next action roll").
 *
 * Unit: grantNextMoveBonus / consumeNextMoveBonus (src/moves/nextMoveAdd.js).
 * Composition: a booted GM / two-player table (tests/helpers/multiClient.js)
 * — a player's Secure an Advantage, the pick on the real choice card relayed
 * to the canonical GM, then the next roll's adds as resolveMove receives them.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], move: "secure_an_advantage", stat: "wits" }));
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE" })),
}));
vi.mock("../../src/moves/interpreter.js", async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({
    moveId: control.move, moveName: control.move, statUsed: control.stat, adds: 0,
    playerNarration: text, inputMethod: "chat", rationale: "test", mischiefApplied: false,
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
    for (const n of control.dice) rng.mockReturnValueOnce(n);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";
import { resolveMove, mapConsequences } from "../../src/moves/resolver.js";
import { grantNextMoveBonus, consumeNextMoveBonus } from "../../src/moves/nextMoveAdd.js";
import { resolveSufferSelection, runSufferResolution } from "../../src/moves/sufferDialog.js";

// Challenge dice first, then the action die (resolver order).
const WEAK   = [0.35, 0.75, 0.4];    // challenge 4 and 8, action 3 (+wits 2 = 5)
const STRONG = [0.15, 0.25, 0.99];   // challenge 2 and 3, action 6 (+wits 2 = 8)

const store = () => game.settings._store.get(`${MODULE_ID}.campaignState`);

// ─── the store helpers ───────────────────────────────────────────────────────

describe("grantNextMoveBonus / consumeNextMoveBonus", () => {
  beforeEach(() => {
    game.settings._store.set(`${MODULE_ID}.campaignState`, { ...CampaignStateSchema, currentSessionId: "s1" });
  });

  it("a grant is the character's own: their next action roll takes it, once", async () => {
    expect(await grantNextMoveBonus("pc-a", 1, "secure_an_advantage")).toEqual({ ok: true, value: 1 });
    expect(store().nextMoveBonuses["pc-a"]).toMatchObject({ value: 1, sources: ["secure_an_advantage"] });

    expect(await consumeNextMoveBonus(null, "pc-b", "face_danger")).toBe(0);   // another PC's roll
    const working = structuredClone(store());
    expect(await consumeNextMoveBonus(working, "pc-a", "face_danger")).toBe(1);
    expect(store().nextMoveBonuses["pc-a"]).toBeUndefined();
    expect(working.nextMoveBonuses["pc-a"]).toBeUndefined();
    expect(await consumeNextMoveBonus(working, "pc-a", "face_danger")).toBe(0);
  });

  it("a progress or no-roll move leaves it pending", async () => {
    await grantNextMoveBonus("pc-a", 1);
    expect(await consumeNextMoveBonus(null, "pc-a", "fulfill_your_vow")).toBe(0);
    expect(await consumeNextMoveBonus(null, "pc-a", "reach_a_milestone")).toBe(0);
    expect(store().nextMoveBonuses["pc-a"].value).toBe(1);
  });

  it("two pending grants add up", async () => {
    await grantNextMoveBonus("pc-a", 1, "gain_ground");
    await grantNextMoveBonus("pc-a", 1, "choice");
    expect(store().nextMoveBonuses["pc-a"]).toMatchObject({ value: 2, sources: ["gain_ground", "choice"] });
    expect(await consumeNextMoveBonus(null, "pc-a", "strike")).toBe(2);
  });

  it("no character or no amount grants nothing", async () => {
    expect(await grantNextMoveBonus(null, 1)).toEqual({ ok: false, reason: "invalid" });
    expect(await grantNextMoveBonus("pc-a", 0)).toEqual({ ok: false, reason: "invalid" });
    expect(store().nextMoveBonuses).toBeUndefined();
  });

  it("a claim the world refuses adds nothing and stays pending — never added twice", async () => {
    await grantNextMoveBonus("pc-a", 1);
    const set = vi.spyOn(game.settings, "set").mockRejectedValueOnce(new Error("refused"));
    expect(await consumeNextMoveBonus(null, "pc-a", "face_danger")).toBe(0);
    set.mockRestore();
    expect(store().nextMoveBonuses["pc-a"].value).toBe(1);
    expect(getCapturedWarns().some(w => /not added, still pending/.test(w))).toBe(true);
  });

  it("keeps what else is in the store, written meanwhile", async () => {
    await grantNextMoveBonus("pc-a", 1);
    game.settings._store.set(`${MODULE_ID}.campaignState`, { ...store(), xCardActive: true });
    await grantNextMoveBonus("pc-b", 1);
    expect(store()).toMatchObject({ xCardActive: true });
    expect(Object.keys(store().nextMoveBonuses).sort()).toEqual(["pc-a", "pc-b"]);
  });
});

// ─── the audit's probe (nextMoveBonus.probe.js), on the real executor ────────

describe("NEXT-MOVE-BONUS-DEAD — the pick and the strong hit", () => {
  beforeEach(() => {
    game.actors._reset();
    game.settings._store.set(`${MODULE_ID}.campaignState`, { currentSessionId: "s1" });
  });

  it("Secure an Advantage weak hit: picking '+1 on your next move' adds +1 to the next action roll", async () => {
    const actor = makeTestActor({ id: "pc1", name: "Kira", type: "character", hasPlayerOwner: true });
    const prompt = mapConsequences("secure_an_advantage", "weak_hit", false).sufferPrompt;
    const idx = prompt.options.findIndex(o => o.nextBonus === 1);
    const calls = resolveSufferSelection(prompt, { optionIndices: [idx] });
    expect(calls).toEqual([{ kind: "next-bonus", amount: 1 }]);

    const [result] = await runSufferResolution(calls, actor, {});
    expect(result).toEqual({ kind: "next-bonus", amount: 1 });
    expect(ChatMessage._created.at(-1).content).toMatch(/Added to Kira&#39;s next action roll|Added to Kira's next action roll/);

    const state = structuredClone(game.settings.get(MODULE_ID, "campaignState") ?? {});
    expect(await consumeNextMoveBonus(state, "pc1", "face_danger")).toBe(1);
  });

  it("Secure an Advantage strong hit ('take both') schedules the +1 as well as the +2 momentum", () => {
    const c = mapConsequences("secure_an_advantage", "strong_hit", false);
    expect(c.momentumChange).toBe(2);
    expect(c.nextMoveBonus).toBe(1);
    expect(mapConsequences("secure_an_advantage", "weak_hit", false).nextMoveBonus).toBe(0);
  });

  it("a pick whose write is refused is reported, not applied — and its Retry is accepted", async () => {
    const { isRetryableSufferCall } = await import("../../src/moves/sufferDialog.js");
    const actor = makeTestActor({ id: "pc1", type: "character", hasPlayerOwner: true });
    const set = vi.spyOn(game.settings, "set").mockRejectedValueOnce(new Error("refused"));
    const [result] = await runSufferResolution([{ kind: "next-bonus", amount: 1 }], actor, {});
    set.mockRestore();
    expect(result).toMatchObject({ kind: "next-bonus", ok: false, reason: "refused" });
    expect(isRetryableSufferCall({ kind: "next-bonus", amount: 1 })).toBe(true);
    expect(isRetryableSufferCall({ kind: "next-bonus", amount: 5 })).toBe(false);
  });
});

// ─── composition: a booted table ─────────────────────────────────────────────

describe("the roller's +1 reaches their next action roll (booted table)", () => {
  let table, kira, ren;

  const world = () => table.world.campaignState();
  const lastAdds = () => resolveMove.mock.calls.at(-1)[0].adds ?? 0;
  const PLUS_ONE = '[data-action="sf-suffer-pick"][data-option-index="1"]';

  async function roll(userId, actor, { move = "secure_an_advantage", stat = "wits", dice = WEAK } = {}) {
    control.move = move; control.stat = stat; control.dice = dice;
    await table.client(userId).chat("I make my move.", { speaker: { actor: actor.id } });
    await table.settle(); await table.drain();
  }

  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => {
    await table.reset({ world: { settings: {
      chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false,
      campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "nb-s1", sessionNumber: 1,
        lastSessionTimestamp: new Date().toISOString(), currentSceneId: "nb-scene", sceneTruths: [], clocks: [], legacyTracks: {} },
    } } });
    await table.setClaudeKey("gm-1", "sk-ant-test");
    kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 } });
    ren  = table.addActor({ id: "pc-ren",  name: "Ren",  ownership: { "pl-2": 3 } });
    scriptClaude(table, { fallback: () => 'The moment turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
    resolveMove.mockClear();
  });

  it("a weak hit's '+1 on your next move' pick: Kira's next action roll is +1, Ren's is not", async () => {
    await roll("pl-1", kira);
    const choice = table.cards(f => f.sufferCard && f.moveId === "secure_an_advantage").at(-1);
    expect(choice, "the weak hit posts its choice card").toBeTruthy();

    await table.client("pl-1").click(choice._id, PLUS_ONE);
    await table.settle(); await table.drain();
    expect(world().nextMoveBonuses?.["pc-kira"]?.value).toBe(1);
    expect(kira.system.momentum.value).toBe(2);                    // the +2 was not the pick

    await roll("pl-2", ren, { move: "face_danger", stat: "edge", dice: STRONG });
    expect(lastAdds()).toBe(0);                                    // not Ren's
    expect(world().nextMoveBonuses?.["pc-kira"]?.value).toBe(1);

    await roll("pl-1", kira, { move: "face_danger", stat: "edge", dice: STRONG });
    expect(lastAdds()).toBe(1);
    expect(world().nextMoveBonuses?.["pc-kira"]).toBeUndefined();

    await roll("pl-1", kira, { move: "face_danger", stat: "edge", dice: STRONG });
    expect(lastAdds()).toBe(0);                                    // single-use
  });

  it("a strong hit takes both: +2 momentum now, and +1 on Kira's next action roll", async () => {
    await roll("pl-1", kira, { dice: STRONG });
    expect(kira.system.momentum.value).toBe(4);
    expect(world().nextMoveBonuses?.["pc-kira"]).toMatchObject({ value: 1, sources: ["secure_an_advantage"] });

    // A progress move leaves it pending.
    await roll("pl-1", kira, { move: "fulfill_your_vow", stat: null, dice: STRONG });
    expect(world().nextMoveBonuses?.["pc-kira"]?.value).toBe(1);

    await roll("pl-1", kira, { move: "face_danger", stat: "edge", dice: STRONG });
    expect(lastAdds()).toBe(1);
  });
});
