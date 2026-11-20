/* global structuredClone, silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/payoffRetrySufferProgressTrackGone.test.js
 *
 * Issue #364 PAYOFF-RETRY-SUFFER-PROGRESS-TRACK-GONE (found while sweeping the
 * GMs' Retry after PAYOFF-RETRY-SUFFER-TARGET-GONE, of the same kind).
 *
 * A suffer pick's mark of progress on a fight or an expedition, refused by
 * the world, is a `suffer` step (`combat-progress` / `expedition-progress`)
 * on the GMs' payoff card, bound to the track the move was rolled about
 * (`combatTrackId` / `expeditionTrackId`). With that track removed or
 * finished before the Retry the step answered "fight-gone" / "fight-over" /
 * "expedition-gone" / "expedition-over" on every press, onto a fresh Retry
 * card each time, its line printing the code.
 *
 * Now a track the step names gone or finished is final: told once in words,
 * no fresh Retry. A mark the step does not bind to a track (the sole open
 * fight, looked up at the press) stays retryable, in words.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

const RETRY = '[data-action="sf-payoff-retry"]';

let table, gm, postPayoffFailureCard, tracksStore;
const live       = (card) => table.world.message(card._id);
const failCards  = () => table.cards(f => f.payoffFailureCard);
const retryCards = () => failCards().filter(c => c.flags[MODULE_ID].retryable !== false);
const finalCards = () => failCards().filter(c => c.flags[MODULE_ID].retryable === false);
const tracks     = () => tracksStore[`${MODULE_ID}.tracks`];
const track      = (id) => tracks().find(t => t.id === id);
const remove     = (id) => () => tracks().splice(tracks().findIndex(t => t.id === id), 1);
const finish     = (id) => () => { track(id).completed = true; };

async function post(call, opts) {
  await gm.run(() => postPayoffFailureCard({ source: "suffer", actorId: "pc-kira",
    failures: [{ step: "suffer", call, opts, reason: "refused" }] }));
  await table.settle(); await table.drain();
  return failCards().at(-1);
}
async function retry(card) {
  await gm.click(card._id, RETRY);
  await table.settle(); await table.drain();
}
const FIGHT = [{ kind: "combat-progress", count: 1 }, { isMiss: false, combatTrackId: "t-fight" }];
const EXPED = [{ kind: "expedition-progress", count: 1 }, { isMiss: false, expeditionTrackId: "t-exp" }];

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
  gm = table.client("gm-1");
  ({ postPayoffFailureCard } = await gm.import("../../src/index.js"));
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "spg-s1", sessionNumber: 1,
      currentSceneId: null, sceneTruths: [] },
  } } });
  scriptClaude(table, { fallback: () => "The crew settles in." });
  silenceConsoleErrors();
  table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 } });
  tracksStore = { [`${MODULE_ID}.tracks`]: [
    { id: "t-fight", label: "Corsairs", type: "combat", rank: "dangerous", ticks: 8, completed: false, createdAt: 1 },
    { id: "t-exp", label: "The Archive", type: "expedition", rank: "dangerous", ticks: 8, completed: false, createdAt: 2 },
  ] };
  table.journal._set({
    id: "tracks-journal", name: "Starforged Progress Tracks",
    getFlag: (mod, key) => tracksStore[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { tracksStore[`${mod}.${key}`] = structuredClone(value); },
  });
});

describe("issue #364 PAYOFF-RETRY-SUFFER-PROGRESS-TRACK-GONE — the move's fight or expedition gone or over before the GMs' Retry", () => {
  it.each([
    ["the fight removed", FIGHT, remove("t-fight"), "its fight is no longer in the world"],
    ["the fight over", FIGHT, finish("t-fight"), "its fight is over, so nothing is left to mark on it"],
    ["the expedition removed", EXPED, remove("t-exp"), "its expedition is no longer in the world"],
    ["the expedition over", EXPED, finish("t-exp"), "its expedition is over, so nothing is left to mark on it"],
  ])("%s: settled — told once in words, no fresh Retry", async (_what, [call, opts], change, words) => {
    const card = await post(call, opts);
    change();

    await retry(card);

    expect(live(card).flags[MODULE_ID].resolved).toBe(true);
    expect(retryCards().map(c => c._id), "no fresh card with a Retry").toEqual([card._id]);
    expect(finalCards()).toHaveLength(1);
    expect(String(finalCards()[0].content)).toContain("Not applied — and no longer owed:");
    expect(String(finalCards()[0].content)).toContain(`— ${words}.`);
  }, 30_000);

  it("pin: a mark bound to no fight, with two open, stays on a fresh Retry card in words", async () => {
    tracks().push({ id: "t-fight-2", label: "Raiders", type: "combat", rank: "dangerous", ticks: 0, completed: false, createdAt: 3 });
    const card = await post({ kind: "combat-progress", count: 1 }, { isMiss: false });

    await retry(card);

    expect(finalCards()).toEqual([]);
    const fresh = retryCards().at(-1);
    expect(fresh._id).not.toBe(card._id);
    expect(String(fresh.content)).toContain("— more than one is open — mark it in the Progress Tracks panel.");
  }, 30_000);

  it("control: the fight still open — the Retry marks it, and no card follows", async () => {
    const card = await post(...FIGHT);

    await retry(card);

    expect(track("t-fight").ticks).toBe(16);
    expect(failCards()).toHaveLength(1);
  }, 30_000);
});
