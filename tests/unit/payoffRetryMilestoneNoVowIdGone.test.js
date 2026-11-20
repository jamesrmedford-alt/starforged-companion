/* global structuredClone, silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/payoffRetryMilestoneNoVowIdGone.test.js
 *
 * Issue #364 PAYOFF-RETRY-MILESTONE-NO-VOW-ID (found beside
 * FIGHT-MILESTONE-RETRY-VOW-FULFILLED-LOOP).
 *
 * A won fight's weak hit burned to a strong hit owes the milestone marks a
 * pressed ⚑ lacked; a mark the world refused is a `milestoneUpgrade` step on
 * the GMs' payoff card. A card that carries a vow id finds its vow by that id,
 * and a vow deleted from every sheet since answers "vow-gone" — final. A card
 * that carries no vow id has the vow's name alone: with the vow deleted, the
 * Retry found "no open vow by that name" and put the step on a fresh Retry
 * card on every press.
 *
 * Now, on a card without a vow id, no copy of the vow by that exact name on
 * any sheet — fulfilled ones counting, as a reward's vow is looked for — is
 * final: told once that the vow is on no sheet, no fresh Retry. A card with a
 * vow id behaves as before.
 *
 * On a booted table: each card posted by the GM's own poster with the record
 * a refused mark leaves, and the GM's real press of "Retry these steps".
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

const RETRY = '[data-action="sf-payoff-retry"]';
const GONE  = "the vow is on no character's sheet any more";
const STEP  = { step: "milestoneUpgrade", cardId: "victory-gone", marks: 2, lacking: 1 };

let table, gm, postPayoffFailureCard, kira;
const live       = (card) => table.world.message(card._id);
const failCards  = () => table.cards(f => f.payoffFailureCard);
const retryCards = () => failCards().filter(c => c.flags[MODULE_ID].retryable !== false);
const finalCards = () => failCards().filter(c => c.flags[MODULE_ID].retryable === false);

function vowItem(id, name, vowId = null) {
  const item = {
    id, type: "progress", name, system: { subtype: "vow", rank: "dangerous", current: 0, completed: false },
    flags: { [MODULE_ID]: vowId ? { vowId } : {} },
    update: async (changes) => {
      if ("system.current" in changes) item.system.current = changes["system.current"];
      if ("system.completed" in changes) item.system.completed = changes["system.completed"];
      return item;
    },
    setFlag: async (mod, key, value) => { (item.flags[mod] ??= {})[key] = structuredClone(value); },
  };
  return item;
}
const dropVow = (id) => { const at = kira.items.contents.findIndex(i => i.id === id); kira.items.contents.splice(at, 1); };

async function post(vowId) {
  await gm.run(() => postPayoffFailureCard({ source: "fight", vowName: "Find the Archive", vowId, actorId: "pc-kira",
    outcome: "strong_hit", failures: [{ ...STEP, reason: "refused" }] }));
  await table.settle(); await table.drain();
  return failCards().at(-1);
}
async function retry(card) {
  await gm.click(card._id, RETRY);
  await table.settle(); await table.drain();
}
function expectSettled(card) {
  expect(live(card).flags[MODULE_ID].resolved).toBe(true);
  expect(retryCards().map(c => c._id), "no fresh card with a Retry").toEqual([card._id]);
  expect(finalCards(), "one card saying why").toHaveLength(1);
  const [told] = finalCards();
  expect(String(told.content)).toContain("Not applied — and no longer owed:");
  expect(String(told.content)).toContain(`— ${GONE}.`);
  expect(gm.render(told._id).querySelector(RETRY)).toBeNull();
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
  gm = table.client("gm-1");
  ({ postPayoffFailureCard } = await gm.import("../../src/index.js"));
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "mnv-s1", sessionNumber: 1,
      currentSceneId: null, sceneTruths: [] },
  } } });
  scriptClaude(table, { fallback: () => "The crew settles in." });
  silenceConsoleErrors();
  kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
    items: { contents: [vowItem("v-archive", "Find the Archive")] } });
});

describe("issue #364 PAYOFF-RETRY-MILESTONE-NO-VOW-ID — a refused milestone mark, its vow deleted before the GMs' Retry", () => {
  it("a card with no vow id: settled — told once that the vow is on no sheet, no fresh Retry", async () => {
    const card = await post(null);
    dropVow("v-archive");

    await retry(card);

    expectSettled(card);
  }, 30_000);

  it("pin: a card with a vow id, its vow deleted, is settled by that id as before", async () => {
    kira.items.contents.splice(0, 1, vowItem("v-archive", "Find the Archive", "vow-archive"));
    const card = await post("vow-archive");
    dropVow("v-archive");

    await retry(card);

    expectSettled(card);
  }, 30_000);

  it("control: a card with no vow id, its vow still on the sheet — the Retry marks it, and no card follows", async () => {
    const card = await post(null);

    await retry(card);

    expect(live(card).flags[MODULE_ID].resolved).toBe(true);
    expect(kira.items.contents[0].system.current).toBeGreaterThan(0);
    expect(failCards()).toHaveLength(1);
  }, 30_000);
});
