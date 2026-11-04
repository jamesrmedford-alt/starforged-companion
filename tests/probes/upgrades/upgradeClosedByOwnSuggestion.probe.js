/**
 * PROBE — UPG-D1 UPGRADE-CLOSED-BY-OWN-SUGGESTION (ninth audit, area upgrades)
 * — NEEDS A DECISION (issue #326 D4's scope)
 *
 * What the user does: Kira (momentum 8, an open vow) rolls Face Danger and
 * gets a weak hit. Her move card offers 🔥 Burn Momentum (8 → Strong Hit)
 * AND, because the hit advances her quest, ⚑ Mark Progress on Vow. She taps
 * ⚑ first — it is the card's own one-click follow-up — then 🔥.
 *
 * What happens: ⚑ relays `milestone.suggestion` (src/index.js:7524-7555 →
 * cardActions.applyMilestoneSuggestion:459-513), which posts a forced
 * `reach_a_milestone` move spoken as Kira. That no-roll move resolves through
 * the pipeline and, after its persist, closeUpgradesForLaterMove(kira, …)
 * (src/index.js:1734; resultUpgrade.js:432-446) stamps her Face Danger card's
 * burn `laterMove`: the 🔥 button reads "closed by a later move", and
 * applyBurnFromRelay refuses (burnMomentum.js:476-481; laterMoveFollows,
 * resultUpgrade.js:457-470). The weak hit stands; the milestone would have
 * been marked identically on a strong hit, so nothing was double-dipped —
 * the card's own suggestion silently spent its own upgrade. 🤝 Develop
 * Relationship / 🔗 Forge a Bond on the same card do the same.
 *
 * What should happen — the decision: issue #326 D4 closes an upgrade "once
 * the same roller's next move has resolved", against "you must burn momentum
 * before applying any other effects of the move". A no-roll follow-up the
 * card itself offers (Reach a Milestone, the connection suggestions) is a
 * separate move by the letter of D4, but it is this move's consequence in
 * play and changes nothing a burn would redo. Option A (asserted here): a
 * forced move posted from the card's own suggestion buttons (or any no-roll
 * move) leaves that card's upgrades open. Option B: as today, and the
 * buttons / help say "burn before taking a follow-up".
 *
 * Controls: the ⚑ press marks the vow (the suggestion itself works); burned
 * before the ⚑, the weak hit becomes a strong hit (reset 2 + 1).
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/upgrades/upgradeClosedByOwnSuggestion.probe.js
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], interpretation: null }));
vi.mock("../../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../../src/moves/interpreter.js", async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: "chat" })),
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
    const rng = vi.spyOn(Math, "random");
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from "../../helpers/multiClient.js";
import { scriptClaude } from "../../helpers/faults.js";
import { CampaignStateSchema } from "../../../src/schemas.js";

let table, kira, vow;
const flags = (id) => table.world.message(id).flags[MODULE_ID];

const WEAK = [0.25, 0.65, 0.5];   // challenge 3, 7; die 4 — edge 2 → 6: a weak hit; momentum 8 burns it to a strong hit

function makeVow() {
  const item = {
    id: "vow-1", type: "progress", name: "Find Chen", flags: {},
    system: { subtype: "vow", rank: "dangerous", current: 0, completed: false },
    async update(changes) { for (const [k, v] of Object.entries(changes)) if (k === "system.current") item.system.current = v; return item; },
    async setFlag(scope, key, value) { (item.flags[scope] ??= {})[key] = value; return item; },
  };
  return item;
}

async function roll(moveId, statUsed, dice) {
  control.interpretation = { moveId, moveName: moveId, statUsed, adds: 0, rationale: "test", mischiefApplied: false };
  control.dice = dice;
  await table.client("pl-1").chat(`Kira attempts ${moveId}.`, { speaker: { actor: kira.id } });
  await table.settle(); await table.drain();
  return table.cards(f => f.moveResolution).at(-1);
}

async function click(card, selector) {
  await table.client("pl-1").click(card._id, selector);
  await table.settle(); await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "own-s1", sessionNumber: 1,
      currentSceneId: "own-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  vow  = makeVow();
  kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
    system: { momentum: { value: 8 } }, items: { contents: [vow] } });
  scriptClaude(table, { fallback: () => 'The moment passes.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  silenceConsoleErrors();
});

describe("UPG-D1 the card's own ⚑ Mark Progress on Vow closes the card's Burn Momentum", () => {
  it("taking the card's milestone suggestion first leaves its 🔥 Burn Momentum open (option A)", async () => {
    const card = await roll("face_danger", "edge", WEAK);
    expect(kira.system.momentum.value).toBe(8);                         // a weak Face Danger gives no momentum (its cost is the picker)
    expect(flags(card._id).burn?.canBurn).toBe(true);
    expect(flags(card._id).milestoneSuggestion?.eligible).toBe(true);

    await click(card, '[data-action="sf-reach-milestone"]');
    expect(vow.system.current).toBe(8);                                 // control: the milestone was marked (dangerous: 2 boxes)
    expect(flags(card._id).milestoneMarked).toBe(true);

    // Expected: the burn is still the move being made; actual: stamped `laterMove` by the forced Reach a Milestone.
    expect.soft(flags(card._id).burn.laterMove ?? false).toBe(false);

    await click(card, '[data-action="sf-burn-momentum"]');
    expect.soft(flags(card._id).burn.consumed ?? false).toBe(true);    // actual: refused ("the roller has made another move since")
    expect.soft(kira.system.momentum.value).toBe(3);                   // reset 2 + the strong hit's +1; actual: 8
  }, 30_000);

  it("control: burned before the ⚑, the weak hit becomes a strong hit and the milestone still marks", async () => {
    const card = await roll("face_danger", "edge", WEAK);
    await click(card, '[data-action="sf-burn-momentum"]');
    expect(flags(card._id).burn.consumed).toBe(true);
    expect(kira.system.momentum.value).toBe(3);

    await click(card, '[data-action="sf-reach-milestone"]');
    expect(vow.system.current).toBe(8);
  }, 30_000);
});
