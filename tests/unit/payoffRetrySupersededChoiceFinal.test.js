/* global expectConsoleError -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/payoffRetrySupersededChoiceFinal.test.js
 *
 * Issue #364 PAYOFF-RETRY-SUPERSEDED-CHOICE-LOOP.
 *
 * A move's suffer-choice card the world refused goes to the GMs with a Retry
 * that posts it (the `choiceCard` step, ERROR-TEXT-BLAMES-KEY) — unless the
 * move's result was upgraded since, when its new outcome's card stands and the
 * step answers "superseded" (issue #311 P03). An upgrade's claim on the move
 * card is never released, so that answer is the same on every later press;
 * but a Retry puts every step that fails again on a fresh card with its own
 * Retry, so each press posted another card whose Retry could not succeed.
 *
 * Now that answer is final: the Retry resolves the card, posts no fresh
 * Retry, and tells the GMs once, on a card with no Retry, that the move's
 * result was upgraded and its new outcome stands. A step refused again beside
 * it still gets its own fresh Retry card.
 *
 * On a booted table, as tests/unit/refusedChoiceCardPost.test.js: the real
 * move pipeline, the refused choice card, the GM's press of "Retry these
 * steps".
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: null }));
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../src/moves/interpreter.js", async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({
    moveId: "face_danger", moveName: "Face Danger", statUsed: "iron", adds: 0, rationale: "test",
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
    if (!control.dice) return real.resolveMove(...args);
    const rng = vi.spyOn(Math, "random");
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude, failWrites } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

const WEAK_HIT = [0.05, 0.95, 0.5];   // challenge 1, 10; action die 4 + iron 3 = 7
const RETRY = '[data-action="sf-payoff-retry"]';

let table, kira;
const gm          = () => table.client("gm-1");
const live        = (card) => table.world.message(card._id);
const failCards   = () => table.cards(f => f.payoffFailureCard);
const retryCards  = () => failCards().filter(c => c.flags[MODULE_ID].retryable !== false);
const finalCards  = () => failCards().filter(c => c.flags[MODULE_ID].retryable === false);
const choiceCards = () => table.cards(f => f.sufferCard);
const moveCard    = () => table.cards(f => f.moveResolution).at(-1);
const choiceCardPost = (w) => w.kind === "message.create" && w.data?.flags?.[MODULE_ID]?.sufferCard === true;

async function retry(card) {
  await gm().click(card._id, RETRY);
  await table.settle(); await table.drain();
}

/** Kira's weak hit, its choice card refused: the GMs' card, its one step the choice card. */
async function choiceCardTheWorldRefused() {
  expectConsoleError(/post failed|choice card/i);
  const fault = failWrites(table, choiceCardPost);
  control.dice = WEAK_HIT;
  await table.client("pl-1").chat("Kira braces against the venting hull.", { speaker: { actor: "pc-kira" } });
  await table.settle(); await table.drain();
  fault.off();
  expect(choiceCards(), "setup: the choice card never posted").toHaveLength(0);
  expect(failCards(), "setup: the GMs are told, with a Retry").toHaveLength(1);
  expect(failCards()[0].flags[MODULE_ID]).toMatchObject({ retryable: true, steps: [{ step: "choiceCard", pcId: "pc-kira" }] });
  return failCards()[0];
}

/** Kira burns: the claim on her move card, which is never released. */
async function resultUpgraded() {
  await gm().run(() => globalThis.game.messages.get(moveCard()._id).update({ [`flags.${MODULE_ID}.burn.consumed`]: true }));
  await table.settle(); await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "sc-s1", sessionNumber: 1,
      currentSceneId: "sc-scene", sceneTruths: [], clocks: [], legacyTracks: {} },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { momentum: { value: 2 }, iron: 3 } });
  scriptClaude(table, { fallback: () => 'The hull holds — for now.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

describe("issue #364 PAYOFF-RETRY-SUPERSEDED-CHOICE-LOOP — the move's result upgraded before the GMs' Retry posts its choice card", () => {
  it("the Retry resolves the card: no fresh Retry card, and the GMs are told once that the new outcome stands", async () => {
    const card = await choiceCardTheWorldRefused();
    await resultUpgraded();

    await retry(card);

    expect(live(card).flags[MODULE_ID].resolved).toBe(true);
    expect(choiceCards(), "no card for the superseded outcome").toHaveLength(0);
    expect(retryCards().map(c => c._id), "no fresh card with a Retry").toEqual([card._id]);
    expect(finalCards(), "one card saying why").toHaveLength(1);
    const told = finalCards()[0];
    expect(String(told.content)).toContain("Not applied — and no longer owed:");
    expect(String(told.content)).toContain("Kira's choice card from Face Danger — the move's result was upgraded since, and its new outcome stands.");
    expect(gm().render(told._id).querySelector(RETRY)).toBeNull();
    expect(told.whisper).toEqual(["gm-1"]);

    // The closing card takes no Retry of its own.
    const { applyPayoffRetry } = await gm().import("../../src/moves/cardActions.js");
    await expect(gm().run(() => applyPayoffRetry({ messageId: told._id }, { requesterId: "gm-1", requesterIsGM: true })))
      .resolves.toMatchObject({ applied: false, reason: "not-a-payoff-card" });
    expect(failCards()).toHaveLength(2);
  }, 30_000);

  it("a step refused again beside it still gets its own fresh Retry card, which applies it", async () => {
    const first = await choiceCardTheWorldRefused();
    await resultUpgraded();
    // The GMs' card with the choice card and a momentum award the world keeps refusing.
    const { postPayoffFailureCard } = await gm().import("../../src/index.js");
    await gm().run(() => postPayoffFailureCard({ source: "persist", actorId: "pc-kira", failures: [
      { ...first.flags[MODULE_ID].steps[0], reason: "refused" },
      { step: "momentum", pcId: "pc-kira", amount: 1, reason: "refused" },
    ] }));
    await table.settle(); await table.drain();
    const both = failCards().at(-1);
    expect(both.flags[MODULE_ID].steps.map(s => s.step)).toEqual(["choiceCard", "momentum"]);
    const refusal = failWrites(table, w => w.kind === "actor.update" && w.id === "pc-kira", { times: 1 });

    await retry(both);

    expect(refusal.refused).toBe(1);
    expect(live(both).flags[MODULE_ID].resolved).toBe(true);
    const [told] = finalCards();
    expect(finalCards()).toHaveLength(1);
    expect(told.flags[MODULE_ID].steps.map(s => s.step)).toEqual(["choiceCard"]);
    expect(String(told.content)).not.toContain("momentum");
    const fresh = retryCards().at(-1);
    expect(fresh._id).not.toBe(both._id);
    expect(fresh.flags[MODULE_ID]).toMatchObject({ retryable: true, resolved: false, steps: [{ step: "momentum", pcId: "pc-kira", amount: 1 }] });
    expect(String(fresh.content)).not.toContain("choice card");

    await retry(fresh);
    expect(kira.system.momentum.value).toBe(3);
    expect(failCards().map(c => c._id)).toEqual([first._id, both._id, told._id, fresh._id]);
  }, 30_000);

  it("control: not upgraded — the Retry posts the choice card, and no other card follows", async () => {
    const card = await choiceCardTheWorldRefused();

    await retry(card);

    expect(choiceCards()).toHaveLength(1);
    expect(failCards()).toHaveLength(1);
  }, 30_000);

  it("control: refused again, not upgraded — a fresh card with its own Retry", async () => {
    const card = await choiceCardTheWorldRefused();
    const again = failWrites(table, choiceCardPost);

    await retry(card);

    expect(again.refused).toBe(1);
    expect(finalCards()).toEqual([]);
    expect(retryCards()).toHaveLength(2);
    expect(retryCards()[1].flags[MODULE_ID].steps).toMatchObject([{ step: "choiceCard", pcId: "pc-kira" }]);
  }, 30_000);
});
