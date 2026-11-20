/* global expectConsoleError -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/payoffRetryCharacterGoneFinal.test.js
 *
 * Issue #364 PAYOFF-RETRY-CHARACTER-GONE-LOOP.
 *
 * A payoff step the world refused goes to the GMs with a Retry. Several steps
 * are one character's — a session's momentum, a legacy mark's sheet write, a
 * suffer pick, a move's choice card, a granted reward, an asset effect, an
 * upgraded result's meters or choice card — and name that character by its
 * Actor id. With the Actor deleted before the Retry the step answers "no-pc",
 * on that press and every later one; but a Retry puts every step that fails
 * again on a fresh card with its own Retry, so each press posted another card
 * whose Retry could not succeed.
 *
 * Now that answer is final: the Retry resolves the card, posts no fresh
 * Retry, and tells the GMs once, on a card with no Retry, that the
 * character's sheet is gone. End a Session's note no longer says that
 * character's momentum waits on a Retry. A step refused again beside it still
 * gets its own fresh Retry card.
 *
 * On a booted table: End a Session's refused momentum and the move pipeline's
 * refused choice card as they are really posted; the other steps from a card
 * posted by the GM's own poster with the record a failure leaves. Every Retry
 * is the GM's real press.
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
const GONE  = "the character's sheet is gone from the world, so there is no one left to receive it";

let table, gm, applyEndSession, postPayoffFailureCard;
const live       = (card) => table.world.message(card._id);
const failCards  = () => table.cards(f => f.payoffFailureCard);
const retryCards = () => failCards().filter(c => c.flags[MODULE_ID].retryable !== false);
const finalCards = () => failCards().filter(c => c.flags[MODULE_ID].retryable === false);
const momentumWrite = (w) => w.kind === "actor.update" && w.changes?.["system.momentum.value"] !== undefined;
const lifecycleNote = () => String(table.cards(f => f.sessionLifecycleCard).at(-1).content);

async function retry(card) {
  await gm.click(card._id, RETRY);
  await table.settle(); await table.drain();
}

/** The card is settled by the one closing note: resolved, no fresh Retry, the GMs told once why. */
function expectSettled(card) {
  expect(live(card).flags[MODULE_ID].resolved).toBe(true);
  expect(retryCards().map(c => c._id), "no fresh card with a Retry").toEqual([card._id]);
  expect(finalCards(), "one card saying why").toHaveLength(1);
  const [told] = finalCards();
  expect(String(told.content)).toContain("Not applied — and no longer owed:");
  expect(String(told.content)).toContain(GONE);
  expect(gm.render(told._id).querySelector(RETRY)).toBeNull();
  expect(told.whisper).toEqual(["gm-1"]);
  return told;
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
  gm = table.client("gm-1");
  ({ applyEndSession } = await gm.import("../../src/safety/sessionLifecycleDialogs.js"));
  ({ postPayoffFailureCard } = await gm.import("../../src/index.js"));
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, sessionLogAutoWrite: false, narratorSessionSummary: false, shipMapEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "gone-s1", sessionNumber: 1,
      currentSceneId: "gone-scene", sceneTruths: [], clocks: [], legacyTracks: {} },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  scriptClaude(table, { fallback: () => 'The hull holds — for now.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

describe("issue #364 PAYOFF-RETRY-CHARACTER-GONE-LOOP — the step's character deleted before the GMs' Retry", () => {
  it("a session's momentum: the Retry settles the gone character's award, and the one refused again beside it gets its own fresh Retry", async () => {
    table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 } });
    const mara = table.addActor({ id: "pc-mara", name: "Mara", ownership: { "pl-2": 3 } });
    const first = failWrites(table, momentumWrite, { times: 2 });
    await gm.run(() => applyEndSession({ questFocus: "Find the beacon" }));
    await table.settle(); await table.drain();
    expect(first.refused, "setup: both awards refused").toBe(2);
    const [card] = failCards();
    expect(card.flags[MODULE_ID]).toMatchObject({ source: "session", retryable: true,
      steps: [{ step: "momentum", pcId: "pc-kira", amount: 1 }, { step: "momentum", pcId: "pc-mara", amount: 1 }] });

    table.actors.delete("pc-kira");                       // the GM deletes Kira's sheet
    const again = failWrites(table, momentumWrite, { times: 1 });
    await retry(card);

    expect(again.refused, "Mara's award refused again").toBe(1);
    expect(live(card).flags[MODULE_ID].resolved).toBe(true);
    const [told] = finalCards();
    expect(finalCards(), "one card for what is no longer owed").toHaveLength(1);
    expect(told.flags[MODULE_ID].steps).toMatchObject([{ step: "momentum", pcId: "pc-kira" }]);
    expect(String(told.content)).toContain("Not applied — and no longer owed:");
    expect(String(told.content)).toContain(`+1 momentum for a character (End a Session — a focus noted) — ${GONE}.`);
    expect(String(told.content)).not.toContain("Mara");
    expect(gm.render(told._id).querySelector(RETRY)).toBeNull();
    const fresh = retryCards().at(-1);
    expect(retryCards().map(c => c._id)).toEqual([card._id, fresh._id]);
    expect(fresh.flags[MODULE_ID]).toMatchObject({ retryable: true, resolved: false, steps: [{ step: "momentum", pcId: "pc-mara", amount: 1 }] });
    expect(String(fresh.content)).toMatch(/\+1 momentum for Mara \(End a Session — a focus noted\) — the world did not save it/);

    // End again: only Mara's momentum waits on a Retry — nothing waits for the sheet that is gone.
    await gm.run(() => applyEndSession({ questFocus: "Find the beacon" }));
    await table.settle(); await table.drain();
    expect(lifecycleNote()).toContain("Momentum that did not reach Mara waits on a GM's Retry");
    expect(lifecycleNote()).not.toContain("a character");

    await retry(fresh);
    expect(mara.system.momentum.value).toBe(3);
    expect(failCards()).toHaveLength(3);
    await gm.run(() => applyEndSession({ questFocus: "Find the beacon" }));
    await table.settle(); await table.drain();
    expect(lifecycleNote()).not.toContain("waits on a GM's Retry");
  }, 30_000);

  it("a move's refused choice card: the Retry posts none, and says the character's sheet is gone", async () => {
    expectConsoleError(/post failed|choice card/i);
    table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { momentum: { value: 2 }, iron: 3 } });
    const fault = failWrites(table, w => w.kind === "message.create" && w.data?.flags?.[MODULE_ID]?.sufferCard === true);
    control.dice = WEAK_HIT;
    await table.client("pl-1").chat("Kira braces against the venting hull.", { speaker: { actor: "pc-kira" } });
    await table.settle(); await table.drain();
    fault.off();
    const [card] = failCards();
    expect(card.flags[MODULE_ID]).toMatchObject({ source: "persist", retryable: true, steps: [{ step: "choiceCard", pcId: "pc-kira" }] });

    table.actors.delete("pc-kira");
    await retry(card);

    const told = expectSettled(card);
    expect(table.cards(f => f.sufferCard), "no choice card for a sheet that is gone").toHaveLength(0);
    expect(String(told.content)).toContain(`The character's choice card from Face Danger — ${GONE}.`);
    expect(String(told.content)).not.toContain("Nothing on it has been chosen yet");
  }, 30_000);

  // Each as the record a refused write leaves on the GMs' card (payoffStepRecord).
  it.each([
    ["a suffer pick", "suffer", { step: "suffer", call: { kind: "meter", meterKey: "momentum", delta: -1 }, opts: {} }],
    ["a legacy mark's sheet write", "legacyXp", { step: "xp", pcId: "pc-vex", xp: 2, track: "quests", boxes: 1 }],
    ["a granted reward", "fight", { step: "rewardGrant", pcId: "pc-vex", reward: { description: "Fuel cells", form: "supply" },
      plan: { status: "granted", form: "supply", amount: 1 } }],
    ["an asset effect", "rider", { step: "rider", rider: { resource: "momentum", amount: 1, label: "+1 momentum", assetName: "Veteran" },
      track: null, shipActorId: null }],
    ["an upgraded result's meters", "upgrade", { step: "upgrade", effect: "meters", pcId: "pc-vex", changes: { momentum: 2 } }],
    ["an upgraded result's choice card", "upgrade", { step: "upgrade", effect: "choiceCard", pcId: "pc-vex",
      sufferPrompt: { kind: "any", amount: 1 }, executorOpts: {}, moveId: "face_danger", resolutionId: null }],
  ])("%s: the Retry settles it — told once, no fresh Retry", async (_what, source, step) => {
    table.addActor({ id: "pc-vex", name: "Vex", ownership: { "pl-1": 3 } });
    await gm.run(() => postPayoffFailureCard({ source, actorId: "pc-vex", vowName: "Bring the beacon home",
      failures: [{ ...step, reason: "refused" }] }));
    await table.settle(); await table.drain();
    const [card] = failCards();
    expect(card.flags[MODULE_ID]).toMatchObject({ retryable: true, steps: [{ step: step.step }] });

    table.actors.delete("pc-vex");
    await retry(card);

    const told = expectSettled(card);
    expect(told.flags[MODULE_ID].steps).toMatchObject([{ step: step.step }]);
    expect(String(told.content)).not.toContain("Nothing on it has been chosen yet");
  }, 30_000);

  it("control: the character still there — the same Retry gives the momentum, and no card follows", async () => {
    const vex = table.addActor({ id: "pc-vex", name: "Vex", ownership: { "pl-1": 3 } });
    await gm.run(() => postPayoffFailureCard({ source: "session", failures: [{ step: "momentum", pcId: "pc-vex", amount: 1, reason: "refused" }] }));
    await table.settle(); await table.drain();
    const [card] = failCards();

    await retry(card);

    expect(vex.system.momentum.value).toBe(3);
    expect(failCards()).toHaveLength(1);
  }, 30_000);
});
