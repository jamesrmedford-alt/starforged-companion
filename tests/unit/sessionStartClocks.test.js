/**
 * STARFORGED COMPANION
 * tests/unit/sessionStartClocks.test.js
 *
 * A Begin a Session clock advance the world refused is recoverable (issue
 * #316 T04), on a booted GM / player table (tests/helpers/multiClient.js): a
 * player's Begin relays to the canonical GM (gmRelay "session.begin"); the
 * campaign clock's Ask the Oracle is scripted to YES; one campaign-state
 * write — the one that would save the clock at 2/6 — is refused.
 *
 * The session was stamped begun before its clock effect, so a second Begin
 * said "already begun" and repeated nothing — right for the momentum and the
 * scene, but the refused clock advance had been caught, logged and lost. The
 * rolled advance is now a `clocks` step on the GMs' payoff failure card, whose
 * Retry saves the rolled fill without rolling again; the clock card says the
 * advance was not saved; the already-begun note names the clock still owed.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

vi.mock("../../src/oracles/roller.js", async (original) => ({
  ...(await original()), rollYesNo: vi.fn(() => ({ answer: "yes", roll: 1, isMatch: false })),
}));

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

let table;
const world  = () => table.world.campaignState();
const clock  = () => world().clocks.find(c => c._id === "campaign-a");
const retryCards   = () => table.cards(f => f.payoffFailureCard && f.source === "sessionClocks");
const lifecycleCards = () => table.cards(f => f.sessionLifecycleCard).map(m => m.content);
const clockCards   = () => table.cards(f => f.clockCard && f.beginSessionAdvance).map(m => m.content);

async function begin(userId = "pl-1") {
  const api = await table.client(userId).import("../../src/multiplayer/gmRelay.js");
  await table.client(userId).run(() => api.requestGmAction("session.begin", { vignetteRolled: false, includeGalley: false }));
  await table.settle(); await table.drain();
}

/** Refuse the first campaign-state write that saves the clock at `filled`. */
function refuseClockWrite(filled) {
  const seen = { refused: false };
  table.interceptWrites(w => {
    if (!seen.refused && w.kind === "setting" && w.key === `${MODULE_ID}.campaignState`
        && w.value?.clocks?.find(c => c._id === "campaign-a")?.filled === filled) {
      seen.refused = true;
      return new Error("test: refuse the session-start clock write once");
    }
  });
  return seen;
}

async function retry(card, userId = "gm-1") {
  table.client(userId).click(card._id, '[data-action="sf-payoff-retry"]');
  await table.settle(); await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false,
    campaignState: { ...CampaignStateSchema, sessionActive: false, sessionStartedId: null, currentSessionId: "ssc-s1",
      sessionNumber: 1, lastSessionTimestamp: new Date().toISOString(), currentSceneId: null, sceneTruths: [],
      clocks: [{ _id: "campaign-a", name: "Hostile expansion", type: "campaign", segments: 6, filled: 1, active: true, advanceOdds: "likely" }] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 } });
  scriptClaude(table, { fallback: () => "The clock turns." });
});

describe("T04 — a refused session-start clock advance is saved by the GMs' Retry, not lost", () => {
  it("control: Begin advances the clock once; a second Begin repeats nothing and owes nothing", async () => {
    await begin();
    expect(world().sessionStartedId).toBe("ssc-s1");
    expect(clock().filled).toBe(2);
    await begin();
    expect(clock().filled).toBe(2);
    expect(retryCards()).toHaveLength(0);
    expect(lifecycleCards().at(-1)).toMatch(/already begun/);
    expect(lifecycleCards().at(-1)).not.toMatch(/not saved/);
  });

  it("the write refused: the session is begun, the clock card says the advance was not saved, and the GMs get a Retry naming the rolled fill", async () => {
    const refusal = refuseClockWrite(2);
    await begin();
    expect(refusal.refused).toBe(true);
    expect(world().sessionStartedId).toBe("ssc-s1");
    expect(clock().filled).toBe(1);
    expect(clockCards().at(-1)).toMatch(/Hostile expansion.*YES \(d100=1\).*2\/6.*not saved: see the GMs' Retry card/);

    const cards = retryCards();
    expect(cards).toHaveLength(1);
    expect(cards[0].content).toMatch(/Session-start clock advance not saved/);
    expect(cards[0].content).toMatch(/Hostile expansion to 2\/6 \(stands at 1\/6 now\) — the world did not save it/);
    expect(cards[0].flags[MODULE_ID].steps).toEqual([{
      step: "clocks", sessionId: "ssc-s1",
      clocks: [{ _id: "campaign-a", name: "Hostile expansion", filled: 2, segments: 6 }],
    }]);
  });

  it("a second Begin repeats nothing, and its note names the clock still owed; the Retry saves the rolled fill once, without rolling again", async () => {
    const { rollYesNo } = await import("../../src/oracles/roller.js");
    refuseClockWrite(2);
    await begin();
    const rolls = rollYesNo.mock.calls.length;

    await begin();
    expect(clock().filled).toBe(1);
    expect(lifecycleCards().at(-1)).toMatch(/already begun.*advance of Hostile expansion was not saved — a GM's Retry/);
    expect(rollYesNo.mock.calls.length).toBe(rolls);

    const [card] = retryCards();
    await retry(card);
    expect(clock().filled).toBe(2);
    expect(table.world.message(card._id).flags[MODULE_ID].resolved).toBe(true);
    expect(retryCards()).toHaveLength(1);      // no fresh card: every step landed
    expect(rollYesNo.mock.calls.length).toBe(rolls);

    await retry(card);                         // a second press: the card is claimed
    expect(clock().filled).toBe(2);

    await begin();                             // nothing owed any more
    expect(lifecycleCards().at(-1)).not.toMatch(/not saved/);
  });

  it("a Retry after a GM advanced the clock by hand meanwhile does not advance it twice", async () => {
    refuseClockWrite(2);
    await begin();
    await table.client("gm-1").run(() => game.settings.set(MODULE_ID, "campaignState", {
      ...world(), clocks: world().clocks.map(c => c._id === "campaign-a" ? { ...c, filled: 2 } : c),
    }));
    await table.settle();
    await retry(retryCards()[0]);
    expect(clock().filled).toBe(2);
  });

  it("only a GM may Retry: a player's press saves nothing", async () => {
    refuseClockWrite(2);
    await begin();
    await retry(retryCards()[0], "pl-1");
    expect(clock().filled).toBe(1);
    expect(table.world.message(retryCards()[0]._id).flags[MODULE_ID].resolved).toBe(false);
  });
});
