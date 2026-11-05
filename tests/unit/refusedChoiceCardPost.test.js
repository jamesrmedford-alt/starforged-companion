/**
 * STARFORGED COMPANION
 * tests/unit/refusedChoiceCardPost.test.js
 *
 * ERROR-TEXT-BLAMES-KEY, the remainder (found while fixing issue #336 Y16) — a
 * refused suffer-choice card post inside persistResolution.
 *
 * Kira's Face Danger is a weak hit: "make a suffer move (-1)", her choice on
 * the card persistResolution posts. The world refuses the card. The post's
 * refusal was swallowed (postSufferChoiceCard returns null, logged on the
 * console only): no card, so the cost was never paid, and nobody was told —
 * Y16's refused meters, one step later, go to the GMs' card with a Retry.
 * Now the refused card is a step of the move's record (the record still
 * written): the GM running the pipeline is told by cause, and the GMs' card
 * carries a Retry that posts the choice card — refused once the move's result
 * has been upgraded, whose new outcome's card stands instead.
 */

/* global expectConsoleError */
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

let table;
const world    = () => table.world.campaignState();
const gm       = () => table.client("gm-1");
const notices  = () => gm().notifications.map(n => n.message);
const failCards   = () => table.cards(f => f.payoffFailureCard);
const choiceCards = () => table.cards(f => f.sufferCard);
const moveCard    = () => table.cards(f => f.moveResolution).at(-1);
const choiceCardPost = (w) => w.kind === "message.create" && w.data?.flags?.[MODULE_ID]?.sufferCard === true;

async function kiraFacesDanger() {
  control.dice = WEAK_HIT;
  await table.client("pl-1").chat("Kira braces against the venting hull.", { speaker: { actor: "pc-kira" } });
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
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "cc-s1", sessionNumber: 1,
      currentSceneId: "cc-scene", sceneTruths: [], clocks: [], legacyTracks: {} },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { momentum: { value: 2 }, iron: 3 } });
  scriptClaude(table, { fallback: () => 'The hull holds — for now.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

describe("ERROR-TEXT-BLAMES-KEY — the world refuses the move's suffer-choice card", () => {
  it("the record is saved; the GM is told by cause, and the GMs' card posts the choice card on Retry", async () => {
    expectConsoleError(/post failed|choice card/i);
    const refused = failWrites(table, choiceCardPost);
    const recordBefore = world().updatedAt ?? null;

    await kiraFacesDanger();

    expect(refused.refused).toBe(1);
    expect(moveCard()).toBeTruthy();
    expect(choiceCards()).toHaveLength(0);                 // the card never posted …
    expect(world().updatedAt).not.toBe(recordBefore);      // … the move's record was saved all the same
    expect(world().pendingMove).toBe(false);

    // The GM is told what the world refused — not to check the API key.
    expect(notices()).toContainEqual(expect.stringMatching(/did not save Kira's choice card from Face Danger — the rest of the move was saved/i));
    expect(notices().some(n => /API key|Move interpretation failed/.test(n))).toBe(false);

    // The GMs hold the choice card, with a Retry.
    const [card] = failCards();
    expect(failCards()).toHaveLength(1);
    expect(card.flags[MODULE_ID]).toMatchObject({ source: "persist", actorId: "pc-kira" });
    expect(card.flags[MODULE_ID].steps).toMatchObject([{ step: "choiceCard", pcId: "pc-kira", moveId: "face_danger",
      sufferPrompt: { kind: "any", amount: 1 }, resolutionId: moveCard().flags[MODULE_ID].resolutionId }]);
    expect(card.content).toMatch(/Kira's choice card from Face Danger — the world did not save it\. Nothing on it has been chosen yet\./);

    await retry(card);
    expect(choiceCards()).toHaveLength(1);
    expect(choiceCards()[0].flags[MODULE_ID]).toMatchObject({ actorId: "pc-kira", moveId: "face_danger", resolved: false,
      resolutionId: moveCard().flags[MODULE_ID].resolutionId });
    expect(choiceCards()[0].flags[MODULE_ID].upgraded).toBeUndefined();   // the move's own outcome's card

    await retry(card);                                     // claimed: a second press posts nothing
    expect(choiceCards()).toHaveLength(1);
  }, 30_000);

  it("a Retry after the move's result was upgraded posts no card for the superseded outcome, and says why", async () => {
    expectConsoleError(/post failed|choice card/i);
    failWrites(table, choiceCardPost);
    await kiraFacesDanger();
    expect(failCards()).toHaveLength(1);
    const [card] = failCards();

    // Kira burns: the strong hit's outcome stands now.
    await gm().run(() => game.messages.get(moveCard()._id).update({ [`flags.${MODULE_ID}.burn.consumed`]: true }));
    await table.settle();

    await retry(card);
    expect(choiceCards()).toHaveLength(0);
    const again = failCards().at(-1);
    expect(again._id).not.toBe(card._id);
    expect(again.content).toMatch(/the move's result was upgraded since/);
  }, 30_000);

  it("control: with the card accepted Kira's choice card posts and no GM card follows", async () => {
    await kiraFacesDanger();

    expect(choiceCards()).toHaveLength(1);
    expect(failCards()).toHaveLength(0);
    expect(notices().some(n => /did not save/.test(n))).toBe(false);
  }, 30_000);
});
