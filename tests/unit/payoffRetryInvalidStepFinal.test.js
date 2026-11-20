/**
 * STARFORGED COMPANION
 * tests/unit/payoffRetryInvalidStepFinal.test.js
 *
 * Issue #364 PAYOFF-RETRY-INVALID-STEP-LOOP.
 *
 * The GMs' payoff card records each refused step, and its Retry checks that
 * record before running it: a value out of range, a shape, or a step name
 * nothing runs answers "invalid step". The record never changes, so the
 * answer is the same on every press — but a Retry puts every step that fails
 * again on a fresh card with its own Retry, so each press posted another card
 * whose Retry could not succeed.
 *
 * Now that answer goes on no Retry card: the Retry resolves the card and
 * tells the GMs once, on a card with no Retry. Unlike a step that is no
 * longer owed (a character's sheet gone, a vow gone), nothing says an
 * unreadable step is owed no more — its card says no Retry can apply it, and
 * to apply it by hand if it is still owed. A step refused again beside it
 * still gets its own fresh Retry card.
 *
 * On a booted table: each card posted by the GM's own poster with a record
 * its Retry cannot run, and the GM's real press of "Retry these steps".
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude, failWrites } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

const RETRY   = '[data-action="sf-payoff-retry"]';
const INVALID = "this card's record of the step is not valid, so no Retry can run it";

let table, gm, postPayoffFailureCard, applyBeginSession, kira, mara;
const live       = (card) => table.world.message(card._id);
const failCards  = () => table.cards(f => f.payoffFailureCard);
const retryCards = () => failCards().filter(c => c.flags[MODULE_ID].retryable !== false);
const finalCards = () => failCards().filter(c => c.flags[MODULE_ID].retryable === false);
const lifecycleNote = () => String(table.cards(f => f.sessionLifecycleCard).at(-1).content);

async function post(card) {
  await gm.run(() => postPayoffFailureCard(card));
  await table.settle(); await table.drain();
  return failCards().at(-1);
}

async function retry(card) {
  await gm.click(card._id, RETRY);
  await table.settle(); await table.drain();
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
  gm = table.client("gm-1");
  ({ postPayoffFailureCard } = await gm.import("../../src/index.js"));
  ({ applyBeginSession } = await gm.import("../../src/safety/sessionLifecycleDialogs.js"));
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, sessionLogAutoWrite: false, narratorSessionSummary: false, shipMapEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "inv-s1", sessionStartedId: "inv-s1",
      // seen live just now and already begun: a second Begin only posts its "already begun" note
      lastSessionTimestamp: new Date().toISOString(),
      sessionNumber: 1, currentSceneId: null, sceneTruths: [], clocks: [], legacyTracks: {} },
  } } });
  scriptClaude(table, { fallback: () => "The crew settles in." });
  kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 } });
  mara = table.addActor({ id: "pc-mara", name: "Mara", ownership: { "pl-2": 3 } });
});

describe("issue #364 PAYOFF-RETRY-INVALID-STEP-LOOP — a step whose record the Retry cannot run", () => {
  it("the Retry resolves the card: no fresh Retry card, and the GMs are told once that no Retry can apply it", async () => {
    // A session's momentum is 1 or 2: a record of 5 is not one its Retry gives.
    const card = await post({ source: "session", failures: [{ step: "momentum", pcId: "pc-kira", amount: 5, reason: "refused" }] });
    expect(card.flags[MODULE_ID]).toMatchObject({ retryable: true, steps: [{ step: "momentum", amount: 5 }] });

    await retry(card);

    expect(live(card).flags[MODULE_ID].resolved).toBe(true);
    expect(kira.system.momentum.value, "nothing given").toBe(2);
    expect(retryCards().map(c => c._id), "no fresh card with a Retry").toEqual([card._id]);
    expect(finalCards(), "one card saying why").toHaveLength(1);
    const [told] = finalCards();
    expect(String(told.content)).toContain("Not applied — and no Retry can apply it:");
    expect(String(told.content)).toContain(`+5 momentum for Kira — ${INVALID}.`);
    expect(String(told.content)).toContain("If this is still owed, apply it by hand.");
    expect(String(told.content), "never told as no longer owed").not.toContain("no longer owed");
    expect(String(told.content)).not.toContain("Nothing is owed");
    expect(gm.render(told._id).querySelector(RETRY)).toBeNull();
    expect(told.whisper).toEqual(["gm-1"]);

    // The closing card takes no Retry of its own.
    const { applyPayoffRetry } = await gm.import("../../src/moves/cardActions.js");
    await expect(gm.run(() => applyPayoffRetry({ messageId: told._id }, { requesterId: "gm-1", requesterIsGM: true })))
      .resolves.toMatchObject({ applied: false, reason: "not-a-payoff-card" });
    expect(failCards()).toHaveLength(2);
  }, 30_000);

  // One record per check that answers "invalid step": runPayoffStep's own, and the runners it calls.
  it.each([
    ["a legacy on no track", "fulfil", { step: "legacy", track: "glory", ticks: 2 }],
    ["a suffer call nothing runs", "suffer", { step: "suffer", call: { kind: "teleport" }, opts: {} }],
    ["a choice card with no prompt", "persist", { step: "choiceCard", pcId: "pc-kira", moveName: "Face Danger", sufferPrompt: null }],
    ["a clock advance with no fill", "sessionClocks", { step: "clocks", sessionId: "inv-s1", clocks: [{ _id: "c-doom", name: "Doom", filled: 0, segments: 6 }] }],
    ["a legacy mark's sheet write on no track", "legacyXp", { step: "xp", pcId: "pc-kira", xp: 2, track: "glory", boxes: 1 }],
    ["a milestone raise with no victory card", "fight", { step: "milestoneUpgrade", cardId: null, marks: 2 }],
    ["an asset effect on no resource", "rider", { step: "rider", rider: { resource: "luck", amount: 1 } }],
    ["an upgrade step of no kind", "upgrade", { step: "upgrade", effect: "teleport" }],
    ["a site with no id", "persist", { step: "site", name: "The Vault" }],
    ["an uncharted destination with no record", "upgrade", { step: "uncharted", sectorId: "sec-1", name: "Somewhere" }],
  ])("%s: the Retry settles it — told once, no fresh Retry", async (_what, source, step) => {
    const card = await post({ source, actorId: "pc-kira", vowName: "Bring the beacon home", failures: [{ ...step, reason: "refused" }] });

    await retry(card);

    expect(live(card).flags[MODULE_ID].resolved).toBe(true);
    expect(retryCards().map(c => c._id), "no fresh card with a Retry").toEqual([card._id]);
    expect(finalCards()).toHaveLength(1);
    expect(String(finalCards()[0].content)).toContain("Not applied — and no Retry can apply it:");
    expect(String(finalCards()[0].content)).toContain(INVALID);
    expect(String(finalCards()[0].content)).not.toContain("no longer owed");
  }, 30_000);

  it("a step name nothing runs is named as the card records it, not as a reward", async () => {
    const card = await post({ source: "persist", actorId: "pc-kira", failures: [{ step: "frobnicate", reason: "refused" }] });

    await retry(card);

    expect(retryCards().map(c => c._id)).toEqual([card._id]);
    expect(String(finalCards()[0].content)).toContain(`The step this card records as “frobnicate” — ${INVALID}.`);
    expect(String(finalCards()[0].content)).not.toContain("promised reward");
  }, 30_000);

  it("beside it: a step no longer owed has its own closing card, and one refused again its own fresh Retry", async () => {
    table.addActor({ id: "pc-vex", name: "Vex", ownership: { "pl-1": 3 } });
    const card = await post({ source: "session", failures: [
      { step: "momentum", pcId: "pc-kira", amount: 5, reason: "refused" },     // a record no Retry can run
      { step: "momentum", pcId: "pc-vex", amount: 1, reason: "refused" },      // its character deleted below
      { step: "momentum", pcId: "pc-mara", amount: 1, reason: "refused" },     // refused again
    ] });
    table.actors.delete("pc-vex");
    const again = failWrites(table, w => w.kind === "actor.update" && w.id === "pc-mara", { times: 1 });

    await retry(card);

    expect(again.refused).toBe(1);
    expect(live(card).flags[MODULE_ID].resolved).toBe(true);
    const closing = finalCards();
    expect(closing).toHaveLength(2);
    const owedNoMore = closing.find(c => String(c.content).includes("no longer owed"));
    const unreadable = closing.find(c => String(c.content).includes("no Retry can apply it"));
    expect(owedNoMore.flags[MODULE_ID].steps).toMatchObject([{ step: "momentum", pcId: "pc-vex" }]);
    expect(String(owedNoMore.content)).not.toContain(INVALID);
    expect(unreadable.flags[MODULE_ID].steps).toMatchObject([{ step: "momentum", pcId: "pc-kira", amount: 5 }]);
    expect(String(unreadable.content)).not.toContain("Mara");
    const fresh = retryCards().at(-1);
    expect(retryCards().map(c => c._id)).toEqual([card._id, fresh._id]);
    expect(fresh.flags[MODULE_ID]).toMatchObject({ retryable: true, resolved: false, steps: [{ step: "momentum", pcId: "pc-mara", amount: 1 }] });

    await retry(fresh);
    expect(mara.system.momentum.value).toBe(3);
    expect(kira.system.momentum.value).toBe(2);
    expect(failCards()).toHaveLength(4);
  }, 30_000);

  it("a session-start clock advance no Retry can run is no longer named as waiting on one", async () => {
    const card = await post({ source: "sessionClocks", failures: [{ step: "clocks", sessionId: "inv-s1", reason: "refused",
      clocks: [{ _id: "c-doom", name: "Doom", filled: 0, segments: 6 }] }] });
    await gm.run(() => applyBeginSession({ vignetteRolled: false, includeGalley: false }));
    await table.settle(); await table.drain();
    expect(lifecycleNote(), "setup: the already-begun note names it while its card has a Retry").toContain("advance of Doom was not saved");

    await retry(card);
    expect(finalCards()).toHaveLength(1);

    await gm.run(() => applyBeginSession({ vignetteRolled: false, includeGalley: false }));
    await table.settle(); await table.drain();
    expect(lifecycleNote()).toContain("already begun");
    expect(lifecycleNote()).not.toContain("Doom");
  }, 30_000);

  it("control: a record its Retry can run is applied, and no card follows", async () => {
    const card = await post({ source: "session", failures: [{ step: "momentum", pcId: "pc-kira", amount: 2, reason: "refused" }] });

    await retry(card);

    expect(kira.system.momentum.value).toBe(4);
    expect(failCards()).toHaveLength(1);
  }, 30_000);
});
