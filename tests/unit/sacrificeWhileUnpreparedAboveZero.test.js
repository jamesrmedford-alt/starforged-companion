/**
 * STARFORGED COMPANION
 * tests/unit/sacrificeWhileUnpreparedAboveZero.test.js
 *
 * Issue #338 D3 (SACRIFICE-WHILE-UNPREPARED-ABOVE-ZERO), option A with the
 * crew-wide clear. "When you suffer a loss of resources while unprepared,
 * envision how this causes you hardship and apply the cost to a different
 * suffer move" (vendored Sacrifice Resources) — the redirect is keyed on the
 * impact, not the meter. Issue #325 W16 redirected the loss at 0 supply alone
 * (`before <= 0 && unprepared`; the card greyed the option at 0), so Kira,
 * unprepared at supply 1, paid a Sacrifice Resources (-1) from the supply.
 * Now a loss while unprepared, at any supply, goes to another suffer move:
 * the executor posts the picker, and the choice card greys Sacrifice
 * Resources. (Resupply's clear is the crew's — resupplyClearsCrewUnprepared —
 * so one crewmate's Resupply leaves no ally unprepared above 0.)
 */

/* global makeTestActor */
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

import { sacrificeResources, isUnprepared } from "../../src/moves/sufferExecutor.js";
import { isOptionAvailable } from "../../src/moves/sufferDialog.js";
import { renderSufferCard } from "../../src/moves/sufferCard.js";
import { invalidateActorCache } from "../../src/character/actorBridge.js";
import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

const sacrificeOption = { label: "Sacrifice Resources (-1)", suffer: "sacrifice_resources", amount: 1 };
const pcWith = (supply, unprepared) => {
  const actor = makeTestActor({ id: `pc-kira-${supply}-${unprepared}`, name: "Kira",
    system: { supply: { value: supply }, debility: { unprepared } } });
  game.actors._set(actor.id, actor);
  invalidateActorCache(actor.id);
  return actor;
};
const redirectPickers = () => ChatMessage._created.filter(m => {
  const f = m.flags?.[MODULE_ID];
  return f?.sufferCard && f.sufferPrompt?.kind === "any" && (f.sufferPrompt.exclude ?? []).includes("sacrifice_resources");
});

describe("a loss of resources while unprepared, at any supply, goes to another suffer move (issue #338 D3)", () => {
  beforeEach(() => { ChatMessage._reset(); game.actors._reset(); });

  it("unprepared at supply 1: the executor posts the picker and leaves the supply", async () => {
    const kira = pcWith(1, true);
    const r = await sacrificeResources(kira, 1);
    expect(r).toMatchObject({ before: 1, after: 1, atZero: false, redirected: true });
    expect(kira.system.supply.value).toBe(1);
    expect(redirectPickers()).toHaveLength(1);
    const card = ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.suffer === "sacrifice_resources");
    expect(card.content).toMatch(/Supply: 1 — <strong>unprepared<\/strong>: the loss goes to another suffer move/);
  });

  it("the choice card greys Sacrifice Resources while unprepared above 0 — an enumerated option and the 'any' picker", () => {
    const kira = pcWith(2, true);
    expect(isOptionAvailable(sacrificeOption, { actor: kira })).toBe(false);
    const html = renderSufferCard({ kind: "any", amount: 1, count: 1 }, kira);
    expect(html).toMatch(/data-suffer-id="sacrifice_resources" disabled>Sacrifice Resources \(-1\) \(unavailable\)/);
    expect(isUnprepared(kira)).toBe(true);   // the one predicate both read
  });

  it("control: unprepared at 0 is redirected (issue #325 W16)", async () => {
    const kira = pcWith(0, true);
    const r = await sacrificeResources(kira, 1);
    expect(r).toMatchObject({ atZero: true, redirected: true });
    expect(kira.system.supply.value).toBe(0);
    expect(isOptionAvailable(sacrificeOption, { actor: kira })).toBe(false);
  });

  it("control: a PC who is not unprepared loses the supply", async () => {
    const kira = pcWith(2, false);
    const r = await sacrificeResources(kira, 1);
    expect(r.redirected).toBeUndefined();
    expect(kira.system.supply.value).toBe(1);
    expect(isOptionAvailable(sacrificeOption, { actor: kira })).toBe(true);
    expect(renderSufferCard({ kind: "any", amount: 1, count: 1 }, kira)).not.toMatch(/sacrifice_resources" disabled/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// On a booted table: Kira, unprepared at supply 1, takes a Face Danger weak
// hit and its "make a suffer move (-1)".
// ─────────────────────────────────────────────────────────────────────────────

let table, pc;
const WEAK = [0.25, 0.65, 0.5];   // challenge 3, 7; die 4 — iron 3 → 7: a weak hit
const SACRIFICE_RESOURCES = 3;    // the picker's order (sufferCard.js ANY_SUFFER_MOVES)

describe("unprepared above 0 on a table (issue #338 D3)", () => {
  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => {
    await table.reset({ world: { settings: {
      chronicleAutoEntry: false,
      campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "s1", sessionNumber: 1,
        currentSceneId: "scene-1", sceneTruths: [], clocks: [] },
    } } });
    await table.setClaudeKey("gm-1", "sk-ant-test");
    pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
      system: { supply: { value: 1 }, momentum: { value: 4 }, debility: { unprepared: true } } });
    scriptClaude(table, { fallback: () => 'You make it, barely.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  });

  async function weakFaceDanger() {
    control.interpretation = { moveId: "face_danger", moveName: "Face Danger", statUsed: "iron", adds: 0, rationale: "test", mischiefApplied: false };
    control.dice = WEAK;
    await table.client("pl-1").chat("I force the jammed hatch.", { speaker: { actor: pc.id } });
    await table.settle(); await table.drain();
    return table.cards(f => f.sufferCard && f.sufferPrompt).at(-1);
  }

  it("the picker offers Sacrifice Resources as unavailable, refuses a pick of it, and the cost is paid elsewhere", async () => {
    const card = await weakFaceDanger();
    expect(card.flags[MODULE_ID].sufferPrompt).toMatchObject({ kind: "any", amount: 1 });
    const sacrifice = table.client("pl-1").render(card._id).querySelector('[data-suffer-id="sacrifice_resources"]');
    expect(sacrifice.disabled).toBe(true);
    expect(sacrifice.textContent).toMatch(/unavailable/);

    // The button swallows a click; a relayed pick of it (a stale render, a
    // hand-made relay) is refused on the GM: nothing paid, the card stays open.
    table.client("pl-1").click(card._id, '[data-action="sf-suffer-pick"]', { index: SACRIFICE_RESOURCES });
    await table.settle(); await table.drain();
    const gm = table.client("gm-1");
    const { applySufferPickFromRelay } = await gm.import("../../src/moves/sufferCard.js");
    const refused = await gm.run(() => applySufferPickFromRelay(
      { messageId: card._id, pickKind: "any", sufferId: "sacrifice_resources" },
      { requesterIsGM: false, requester: table.client("pl-1").user, requesterId: "pl-1" },
    ));
    await table.settle(); await table.drain();
    expect(refused).toEqual({ applied: false, reason: "not-offered" });
    expect(pc.system.supply.value).toBe(1);
    expect(table.world.message(card._id).flags[MODULE_ID].resolved).not.toBe(true);

    await table.client("pl-1").click(card._id, '[data-action="sf-suffer-pick"][data-suffer-id="lose_momentum"]');
    await table.settle(); await table.drain();
    expect(pc.system.momentum.value).toBe(3);
    expect(pc.system.supply.value).toBe(1);
    expect(table.world.message(card._id).flags[MODULE_ID].resolved).toBe(true);
  }, 30_000);
});
